-- ============================================================
-- LastChance — Durcissement ACL, RBAC et intégrité multi-tenant
-- ============================================================

-- 1. Les fonctions PostgreSQL sont exécutables par PUBLIC par défaut.
-- On passe à une liste blanche explicite, y compris pour les futures RPC.
revoke execute on all functions in schema public from public, anon, authenticated;
alter default privileges for role postgres in schema public
  revoke execute on functions from public, anon, authenticated;

-- La service role est la seule identité applicative autorisée à appeler les
-- primitives internes (stock, scans, rate limits, crons et back-office).
grant execute on all functions in schema public to service_role;
alter default privileges for role postgres in schema public
  grant execute on functions to service_role;

-- Helpers/RPC explicitement utilisables par une session authentifiée.
grant execute on function public.is_org_member(uuid) to authenticated;
grant execute on function public.is_org_owner(uuid) to authenticated;
grant execute on function public.create_organization(text, text) to authenticated;
grant execute on function public.accept_team_invitation(uuid) to authenticated;
grant execute on function public.org_team_members(uuid) to authenticated;
grant execute on function public.org_customer_profiles(uuid) to authenticated;
grant execute on function public.org_segment_emails(uuid, text, int, int) to authenticated;
grant execute on function public.org_segment_counts(uuid) to authenticated;
grant execute on function public.campaign_prize_performance(uuid) to authenticated;

-- 2. Un utilisateur ne peut posséder qu'une organisation. Les appartenances
-- staff multiples restent autorisées. Le verrou évite deux créations en course.
create or replace function public.create_organization(org_name text, org_slug text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  new_org_id uuid;
  uid uuid := (select auth.uid());
begin
  if uid is null then raise exception 'authentification requise'; end if;
  perform pg_advisory_xact_lock(hashtext(uid::text));

  if exists (
    select 1 from public.organization_members
    where user_id = uid and role = 'owner'
  ) then
    raise exception 'quota propriétaire atteint';
  end if;
  if org_name is null or char_length(trim(org_name)) < 1 then
    raise exception 'nom d''organisation invalide';
  end if;
  if org_slug is null or org_slug !~ '^[a-z0-9-]{2,48}$' then
    raise exception 'slug d''organisation invalide';
  end if;

  insert into public.organizations (name, slug)
  values (trim(org_name), org_slug)
  returning id into new_org_id;

  insert into public.organization_members (organization_id, user_id, role)
  values (new_org_id, uid, 'owner');
  return new_org_id;
end;
$$;
revoke all on function public.create_organization(text, text) from public, anon;
grant execute on function public.create_organization(text, text) to authenticated, service_role;

create unique index organization_members_one_owned_org_idx
  on public.organization_members(user_id)
  where role = 'owner';

-- Les invitations créées par l'interface ne peuvent jamais promouvoir un
-- second owner, même via un appel REST direct.
update public.team_invitations set role = 'staff' where role <> 'staff';
alter table public.team_invitations
  drop constraint if exists team_invitations_role_check;
alter table public.team_invitations
  add constraint team_invitations_role_check check (role = 'staff');

-- 3. Les réglages d'organisation sont écrits uniquement côté serveur après
-- garde owner. Aucun membre ne peut modifier directement les colonnes Stripe.
drop policy if exists "org: update membres" on public.organizations;

-- Le secret webhook n'est jamais lisible via une session marchand, même si le
-- rôle staff interroge directement PostgREST. Le propriétaire le récupère via
-- une lecture serveur après contrôle de rôle.
revoke select on public.organizations from anon, authenticated;
grant select (
  id, name, slug, stripe_customer_id, subscription_status, plan,
  trial_ends_at, past_due_since, logo_url, auto_reengage, notify_on_win,
  data_retention_months, webhook_url, created_at
) on public.organizations to authenticated;

-- Les données personnelles et fonctions marketing sont owner-only.
drop policy if exists "participations: select membres" on public.participations;
drop policy if exists "participations: update membres" on public.participations;
drop policy if exists "participations: delete membres" on public.participations;
create policy "participations: owner select" on public.participations
  for select using (public.is_org_owner(organization_id));
create policy "participations: owner update" on public.participations
  for update using (public.is_org_owner(organization_id));
create policy "participations: owner delete" on public.participations
  for delete using (public.is_org_owner(organization_id));

drop policy if exists "newsletter: select membres" on public.newsletter_subscribers;
drop policy if exists "newsletter: delete membres" on public.newsletter_subscribers;
create policy "newsletter: owner select" on public.newsletter_subscribers
  for select using (public.is_org_owner(organization_id));
create policy "newsletter: owner delete" on public.newsletter_subscribers
  for delete using (public.is_org_owner(organization_id));

drop policy if exists "newsletter_campaigns: select membres" on public.newsletter_campaigns;
drop policy if exists "newsletter_campaigns: insert membres" on public.newsletter_campaigns;
create policy "newsletter_campaigns: owner select" on public.newsletter_campaigns
  for select using (public.is_org_owner(organization_id));
create policy "newsletter_campaigns: owner insert" on public.newsletter_campaigns
  for insert with check (public.is_org_owner(organization_id));

drop policy if exists "audit: select membres" on public.audit_logs;
create policy "audit: owner select" on public.audit_logs
  for select using (organization_id is null or public.is_org_owner(organization_id));

-- 4. Caisse staff : deux RPC étroites remplacent l'accès direct à toute la
-- table participations. Elles n'exposent ni email, ni téléphone, ni opt-in.
create or replace function public.lookup_redeem_code(
  p_organization_id uuid,
  p_redeem_code text
)
returns table (
  id uuid, created_at timestamptz, first_name text, redeem_code text,
  redeemed_at timestamptz, prize_label text, prize_description text,
  campaign_name text
)
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
  select p.id, p.created_at, p.first_name, p.redeem_code, p.redeemed_at,
         pr.label, pr.description, c.name
  from public.participations p
  left join public.prizes pr on pr.id = p.prize_id
  join public.campaigns c on c.id = p.campaign_id
  where p.organization_id = p_organization_id
    and p.redeem_code = upper(trim(p_redeem_code))
  limit 1;
end;
$$;

create or replace function public.redeem_participation(
  p_organization_id uuid,
  p_participation_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare v_id uuid;
begin
  if not public.is_org_member(p_organization_id) then
    raise exception 'not authorized';
  end if;
  update public.participations
  set redeemed_at = now()
  where id = p_participation_id
    and organization_id = p_organization_id
    and redeemed_at is null
  returning id into v_id;
  return v_id;
end;
$$;
revoke all on function public.lookup_redeem_code(uuid, text) from public, anon;
revoke all on function public.redeem_participation(uuid, uuid) from public, anon;
grant execute on function public.lookup_redeem_code(uuid, text) to authenticated, service_role;
grant execute on function public.redeem_participation(uuid, uuid) to authenticated, service_role;

-- Les RPC qui exposent PII/stats marketing vérifient désormais le propriétaire.
create or replace function public.org_team_members(p_organization_id uuid)
returns table (user_id uuid, email text, role text, joined_at timestamptz)
language plpgsql security definer set search_path = public stable as $$
begin
  if not public.is_org_owner(p_organization_id) then raise exception 'not authorized'; end if;
  return query select m.user_id, u.email::text, m.role, m.created_at
  from public.organization_members m join auth.users u on u.id = m.user_id
  where m.organization_id = p_organization_id order by m.created_at asc;
end;
$$;

create or replace function public.org_customer_profiles(p_organization_id uuid)
returns table (
  email text, first_name text, wins bigint, redeemed bigint,
  first_win timestamptz, last_win timestamptz
)
language plpgsql security definer set search_path = public stable as $$
begin
  if not public.is_org_owner(p_organization_id) then raise exception 'not authorized'; end if;
  return query
  select p.email,
    (array_agg(p.first_name order by p.created_at desc))[1],
    count(*), count(*) filter (where p.redeemed_at is not null),
    min(p.created_at), max(p.created_at)
  from public.participations p
  where p.organization_id = p_organization_id and p.email is not null
  group by p.email order by max(p.created_at) desc;
end;
$$;

create or replace function public.org_segment_emails(
  p_organization_id uuid, p_segment text,
  p_loyal_wins int default 3, p_inactive_days int default 60
)
returns table (subscriber_id uuid, email text)
language plpgsql security definer set search_path = public stable as $$
begin
  if not public.is_org_owner(p_organization_id) then raise exception 'not authorized'; end if;
  return query
  select s.id, s.email from public.newsletter_subscribers s
  left join lateral (
    select count(*) as wins, max(p.created_at) as last_win
    from public.participations p
    where p.organization_id = s.organization_id and p.email = s.email
  ) agg on true
  where s.organization_id = p_organization_id and s.unsubscribed_at is null
    and case p_segment
      when 'all' then true
      when 'loyal' then coalesce(agg.wins, 0) >= greatest(1, p_loyal_wins)
      when 'new' then coalesce(agg.wins, 0) = 1
      when 'inactive' then agg.last_win is not null and agg.last_win < now() - make_interval(days => greatest(1, p_inactive_days))
      else false
    end;
end;
$$;

create or replace function public.org_segment_counts(p_organization_id uuid)
returns table (all_count bigint, loyal_count bigint, new_count bigint, inactive_count bigint)
language plpgsql security definer set search_path = public stable as $$
begin
  if not public.is_org_owner(p_organization_id) then raise exception 'not authorized'; end if;
  return query with base as (
    select s.id, coalesce(agg.wins, 0) as wins, agg.last_win
    from public.newsletter_subscribers s
    left join lateral (
      select count(*) as wins, max(p.created_at) as last_win
      from public.participations p
      where p.organization_id = s.organization_id and p.email = s.email
    ) agg on true
    where s.organization_id = p_organization_id and s.unsubscribed_at is null
  ) select count(*), count(*) filter (where wins >= 3),
      count(*) filter (where wins = 1),
      count(*) filter (where last_win is not null and last_win < now() - interval '60 days')
    from base;
end;
$$;

-- 5. Intégrité inter-tenant : les FK composites rendent impossible une chaîne
-- campagne/roue/lot/spin/participation traversant deux organisations.
alter table public.campaigns
  add constraint campaigns_id_org_unique unique (id, organization_id);
alter table public.wheels
  add constraint wheels_id_org_unique unique (id, organization_id),
  add constraint wheels_id_campaign_org_unique unique (id, campaign_id, organization_id),
  add constraint wheels_campaign_org_fk foreign key (campaign_id, organization_id)
    references public.campaigns(id, organization_id) on delete cascade not valid;
alter table public.prizes
  add constraint prizes_id_wheel_org_unique unique (id, wheel_id, organization_id),
  add constraint prizes_wheel_org_fk foreign key (wheel_id, organization_id)
    references public.wheels(id, organization_id) on delete cascade not valid;
alter table public.qr_codes
  add constraint qr_campaign_org_fk foreign key (campaign_id, organization_id)
    references public.campaigns(id, organization_id) on delete cascade not valid;
alter table public.spins
  add constraint spins_campaign_org_fk foreign key (campaign_id, organization_id)
    references public.campaigns(id, organization_id) on delete cascade not valid,
  add constraint spins_wheel_campaign_org_fk foreign key (wheel_id, campaign_id, organization_id)
    references public.wheels(id, campaign_id, organization_id) on delete cascade not valid,
  add constraint spins_prize_wheel_org_fk foreign key (prize_id, wheel_id, organization_id)
    references public.prizes(id, wheel_id, organization_id)
    on delete set null (prize_id) not valid;
alter table public.participations
  add constraint participations_campaign_org_fk foreign key (campaign_id, organization_id)
    references public.campaigns(id, organization_id) on delete cascade not valid,
  add constraint participations_wheel_campaign_org_fk foreign key (wheel_id, campaign_id, organization_id)
    references public.wheels(id, campaign_id, organization_id) on delete cascade not valid,
  add constraint participations_prize_wheel_org_fk foreign key (prize_id, wheel_id, organization_id)
    references public.prizes(id, wheel_id, organization_id)
    on delete set null (prize_id) not valid;

alter table public.wheels validate constraint wheels_campaign_org_fk;
alter table public.prizes validate constraint prizes_wheel_org_fk;
alter table public.qr_codes validate constraint qr_campaign_org_fk;
alter table public.spins validate constraint spins_campaign_org_fk;
alter table public.spins validate constraint spins_wheel_campaign_org_fk;
alter table public.spins validate constraint spins_prize_wheel_org_fk;
alter table public.participations validate constraint participations_campaign_org_fk;
alter table public.participations validate constraint participations_wheel_campaign_org_fk;
alter table public.participations validate constraint participations_prize_wheel_org_fk;

-- Les remplacements de fonctions recréent parfois les ACL : réappliquer la
-- liste blanche en fin de migration.
revoke execute on all functions in schema public from public, anon, authenticated;
grant execute on all functions in schema public to service_role;
grant execute on function public.is_org_member(uuid) to authenticated;
grant execute on function public.is_org_owner(uuid) to authenticated;
grant execute on function public.create_organization(text, text) to authenticated;
grant execute on function public.accept_team_invitation(uuid) to authenticated;
grant execute on function public.org_team_members(uuid) to authenticated;
grant execute on function public.org_customer_profiles(uuid) to authenticated;
grant execute on function public.org_segment_emails(uuid, text, int, int) to authenticated;
grant execute on function public.org_segment_counts(uuid) to authenticated;
grant execute on function public.campaign_prize_performance(uuid) to authenticated;
grant execute on function public.lookup_redeem_code(uuid, text) to authenticated;
grant execute on function public.redeem_participation(uuid, uuid) to authenticated;
