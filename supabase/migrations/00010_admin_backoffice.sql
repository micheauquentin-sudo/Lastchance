-- ============================================================
-- Lastchance — Back-office d'administration (équipe LastChance)
-- Tables INTERNES, totalement séparées de l'app commerçant.
--
-- Sécurité : RLS activée SANS aucune policy => aucun accès via la clé
-- anon / la session utilisateur. Ces tables ne sont lisibles/écrivables
-- que par le code serveur du back-office, via la service role key, APRÈS
-- vérification RBAC (voir src/lib/admin/*). Défense en profondeur :
-- même une faille de session commerçant ne donne aucun accès ici.
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- MEMBRES DE L'ÉQUIPE ADMIN + RÔLES
-- ────────────────────────────────────────────────────────────

create table public.admin_users (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  email text not null,
  name text not null default '' check (char_length(name) <= 120),
  role text not null default 'read_only'
    check (role in ('super_admin','admin','support','finance','read_only')),
  is_active boolean not null default true,
  created_by uuid references public.admin_users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index admin_users_role_idx on public.admin_users(role);

-- ────────────────────────────────────────────────────────────
-- JOURNAL D'AUDIT — toute action sensible du back-office
-- ────────────────────────────────────────────────────────────

create table public.admin_audit_logs (
  id uuid primary key default gen_random_uuid(),
  -- On garde l'id + l'email au moment de l'action : le journal reste
  -- lisible même si l'admin est ensuite supprimé (set null).
  admin_user_id uuid references public.admin_users(id) on delete set null,
  actor_email text not null,
  actor_role text not null,
  action text not null check (char_length(action) between 1 and 80),
  target_type text check (char_length(target_type) <= 60),
  target_id text check (char_length(target_id) <= 120),
  -- Contexte structuré (avant/après, montants, etc.). Pas de secret brut.
  metadata jsonb not null default '{}'::jsonb,
  ip text,
  created_at timestamptz not null default now()
);

create index admin_audit_logs_created_idx on public.admin_audit_logs(created_at desc);
create index admin_audit_logs_admin_idx on public.admin_audit_logs(admin_user_id);
create index admin_audit_logs_action_idx on public.admin_audit_logs(action);
create index admin_audit_logs_target_idx on public.admin_audit_logs(target_type, target_id);

-- ────────────────────────────────────────────────────────────
-- NOTES INTERNES SUPPORT (par commerçant)
-- ────────────────────────────────────────────────────────────

create table public.admin_notes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  admin_user_id uuid references public.admin_users(id) on delete set null,
  author_email text not null,
  body text not null check (char_length(body) between 1 and 2000),
  created_at timestamptz not null default now()
);

create index admin_notes_org_idx on public.admin_notes(organization_id, created_at desc);

-- ────────────────────────────────────────────────────────────
-- ROW LEVEL SECURITY : verrou total (aucune policy)
-- ────────────────────────────────────────────────────────────

alter table public.admin_users enable row level security;
alter table public.admin_audit_logs enable row level security;
alter table public.admin_notes enable row level security;

-- Aucune policy => tout est refusé pour anon/authenticated. Seule la
-- service role key (back-office serveur) contourne la RLS.

-- ────────────────────────────────────────────────────────────
-- AMORÇAGE DU PREMIER SUPER ADMIN
-- ────────────────────────────────────────────────────────────
-- Le premier super_admin ne peut pas être créé depuis l'UI (personne
-- n'a encore les droits). On l'amorce ici à partir d'un email : après
-- avoir créé le compte Supabase correspondant, exécuter :
--
--   select public.grant_first_super_admin('equipe@lastchance.app');
--
-- La fonction refuse d'agir s'il existe déjà un super_admin (amorçage
-- unique), empêchant tout usage détourné après la mise en place.

create or replace function public.grant_first_super_admin(p_email text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_admin_id uuid;
begin
  if exists (select 1 from public.admin_users where role = 'super_admin' and is_active) then
    raise exception 'Un super_admin actif existe déjà — amorçage refusé.';
  end if;

  select id into v_user_id from auth.users where lower(email) = lower(p_email) limit 1;
  if v_user_id is null then
    raise exception 'Aucun compte auth pour %', p_email;
  end if;

  insert into public.admin_users (user_id, email, name, role, is_active)
  values (v_user_id, p_email, 'Super Admin', 'super_admin', true)
  on conflict (user_id) do update set role = 'super_admin', is_active = true
  returning id into v_admin_id;

  return v_admin_id;
end;
$$;

-- Réservé à un opérateur base de données (psql/Studio). Pas exposé au client.
revoke all on function public.grant_first_super_admin(text) from public, anon, authenticated;

-- ────────────────────────────────────────────────────────────
-- AGRÉGATS BACK-OFFICE — calcul en base (perf)
-- Appelés uniquement par le code serveur du back-office via la service
-- role key, après garde RBAC. Non exposés à anon/authenticated : ils
-- lisent des données de toutes les organisations.
-- ────────────────────────────────────────────────────────────

-- Résout un email en user_id auth en O(1) (index unique sur email),
-- sans énumérer la table des utilisateurs.
create or replace function public.admin_user_id_by_email(p_email text)
returns uuid
language sql
security definer
set search_path = public
stable
as $$
  select id from auth.users where lower(email) = lower(p_email) limit 1;
$$;

-- Top commerçants par nombre de tours joués (agrégat SQL, pas de scan JS).
create or replace function public.admin_top_merchants(p_limit int default 8)
returns table (organization_id uuid, name text, spins bigint)
language sql
security definer
set search_path = public
stable
as $$
  select s.organization_id, o.name, count(*) as spins
  from public.spins s
  join public.organizations o on o.id = s.organization_id
  group by s.organization_id, o.name
  order by spins desc
  limit greatest(1, least(p_limit, 50));
$$;

-- Participations par jour sur p_days jours (agrégat date_trunc).
create or replace function public.admin_participations_daily(p_days int default 30)
returns table (day date, count bigint)
language sql
security definer
set search_path = public
stable
as $$
  select (created_at at time zone 'UTC')::date as day, count(*)
  from public.participations
  where created_at >= (now() - make_interval(days => greatest(1, least(p_days, 90))))
  group by day
  order by day;
$$;

revoke all on function public.admin_user_id_by_email(text) from public, anon, authenticated;
revoke all on function public.admin_top_merchants(int) from public, anon, authenticated;
revoke all on function public.admin_participations_daily(int) from public, anon, authenticated;
