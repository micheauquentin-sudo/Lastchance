-- ============================================================
-- Lastchance — Gestion d'équipe
-- Un propriétaire peut inviter des collègues (rôle 'staff') par email,
-- consulter les invitations en attente, les annuler, et retirer un
-- membre staff. Jamais de suppression du propriétaire par ce chemin.
-- ============================================================

-- Helper : l'utilisateur courant est-il propriétaire (role='owner') de
-- l'org ? SECURITY DEFINER pour éviter la récursion RLS.
create or replace function public.is_org_owner(org_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.organization_members m
    where m.organization_id = org_id
      and m.user_id = (select auth.uid())
      and m.role = 'owner'
  );
$$;

-- Un propriétaire peut retirer un membre staff (jamais un autre owner,
-- jamais soi-même via ce chemin : évite le verrouillage accidentel).
create policy "members: owner removes staff" on public.organization_members
  for delete using (
    public.is_org_owner(organization_id) and role = 'staff'
  );

create table public.team_invitations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  email text not null check (email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  role text not null default 'staff' check (role in ('staff', 'owner')),
  invited_by uuid not null references auth.users(id),
  expires_at timestamptz not null,
  accepted_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

create index team_invitations_org_idx
  on public.team_invitations(organization_id, created_at desc);

alter table public.team_invitations enable row level security;

-- Seul le propriétaire gère les invitations de son org.
create policy "invitations: owner manages" on public.team_invitations
  for all using (public.is_org_owner(organization_id))
  with check (public.is_org_owner(organization_id));

-- Acceptation : appelée par l'invité, qui n'est pas encore membre — la
-- vérification (email correspondant, non expirée, non révoquée, non
-- déjà acceptée) est interne, exécution en SECURITY DEFINER.
-- Renvoie l'id de l'organisation rejointe : `team_invitations` n'est
-- lisible que par le propriétaire (RLS), donc l'invité — pas encore
-- membre — ne peut pas relire la ligne lui-même après coup. L'appelant
-- récupère ainsi de quoi requêter `organizations` (lisible dès qu'il
-- est membre).
create or replace function public.accept_team_invitation(p_invitation_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_inv record;
  v_email text;
begin
  select * into v_inv from public.team_invitations where id = p_invitation_id for update;
  if v_inv is null then
    raise exception 'invitation introuvable';
  end if;
  if v_inv.accepted_at is not null then
    raise exception 'invitation déjà acceptée';
  end if;
  if v_inv.revoked_at is not null then
    raise exception 'invitation annulée';
  end if;
  if v_inv.expires_at < now() then
    raise exception 'invitation expirée';
  end if;

  select email into v_email from auth.users where id = auth.uid();
  if v_email is null or lower(v_email) <> lower(v_inv.email) then
    raise exception 'cette invitation est destinée à une autre adresse email';
  end if;

  insert into public.organization_members (organization_id, user_id, role)
  values (v_inv.organization_id, auth.uid(), v_inv.role)
  on conflict (organization_id, user_id) do nothing;

  update public.team_invitations set accepted_at = now() where id = p_invitation_id;

  return v_inv.organization_id;
end;
$$;

revoke all on function public.accept_team_invitation(uuid) from public, anon;
grant execute on function public.accept_team_invitation(uuid) to authenticated;

-- Liste des membres d'une org avec leur email (organization_members ne
-- stocke pas l'email, qui vit dans auth.users — schéma normalement hors
-- de portée du rôle authenticated). Vérification d'appartenance interne.
create or replace function public.org_team_members(p_organization_id uuid)
returns table (user_id uuid, email text, role text, joined_at timestamptz)
language plpgsql
security definer
set search_path = public
stable
as $$
begin
  if not public.is_org_member(p_organization_id) then
    raise exception 'not authorized';
  end if;

  return query
  select m.user_id, u.email::text, m.role, m.created_at
  from public.organization_members m
  join auth.users u on u.id = m.user_id
  where m.organization_id = p_organization_id
  order by m.created_at asc;
end;
$$;

revoke all on function public.org_team_members(uuid) from public, anon;
grant execute on function public.org_team_members(uuid) to authenticated;
