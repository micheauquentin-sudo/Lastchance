-- ============================================================
-- LastChance — invariants métier atomiques et sessions isolées
-- ============================================================

-- Personne ne doit pouvoir déposer un objet dans le schéma utilisé par les
-- fonctions SECURITY DEFINER. Les migrations restent exécutées par postgres.
revoke create on schema public from public, anon, authenticated;

-- ── Organisations : fuseau, synchronisation Stripe, rotation des crons ──
alter table public.organizations
  add column if not exists timezone text not null default 'Europe/Paris',
  add column if not exists stripe_event_created_at timestamptz,
  add column if not exists last_reengage_run_at timestamptz;

-- Une conservation infinie par oubli de configuration n'est pas compatible
-- avec la minimisation. Douze mois restent modifiables par le propriétaire.
alter table public.organizations
  alter column data_retention_months set default 12;
update public.organizations set data_retention_months = 12
  where data_retention_months is null;

-- Une plateforme d'avis ne doit jamais servir de porte d'entrée au tirage,
-- même si une ancienne campagne avait encore cette configuration.
update public.campaigns set engagement = '{}'::jsonb where engagement <> '{}'::jsonb;

create or replace function public.is_valid_timezone(p_timezone text)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists(select 1 from pg_catalog.pg_timezone_names where name = p_timezone)
$$;

revoke all on function public.is_valid_timezone(text) from public, anon, authenticated;
grant execute on function public.is_valid_timezone(text) to service_role;

-- ── Rôles marchands : caisse, édition, propriétaire ──
alter table public.organization_members drop constraint if exists organization_members_role_check;
update public.organization_members set role = 'editor' where role = 'staff';
alter table public.organization_members
  add constraint organization_members_role_check
  check (role in ('owner', 'editor', 'cashier'));

alter table public.team_invitations drop constraint if exists team_invitations_role_check;
update public.team_invitations set role = 'editor' where role = 'staff';
alter table public.team_invitations
  add constraint team_invitations_role_check
  check (role in ('editor', 'cashier'));

drop policy if exists "members: owner removes staff" on public.organization_members;
create policy "members: owner removes collaborators" on public.organization_members
  for delete using (
    public.is_org_owner(organization_id) and role in ('editor', 'cashier')
  );

create or replace function public.is_org_editor(p_organization_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.organization_members m
    where m.organization_id = p_organization_id
      and m.user_id = (select auth.uid())
      and m.role in ('owner', 'editor')
  )
$$;

revoke all on function public.is_org_editor(uuid) from public, anon;
grant execute on function public.is_org_editor(uuid) to authenticated, service_role;

drop policy if exists "campaigns: all membres" on public.campaigns;
create policy "campaigns: editors" on public.campaigns for all
  using (public.is_org_editor(organization_id))
  with check (public.is_org_editor(organization_id));
drop policy if exists "wheels: all membres" on public.wheels;
create policy "wheels: editors" on public.wheels for all
  using (public.is_org_editor(organization_id))
  with check (public.is_org_editor(organization_id));
drop policy if exists "prizes: all membres" on public.prizes;
create policy "prizes: editors" on public.prizes for all
  using (public.is_org_editor(organization_id))
  with check (public.is_org_editor(organization_id));
drop policy if exists "qr_codes: all membres" on public.qr_codes;
create policy "qr_codes: editors" on public.qr_codes for all
  using (public.is_org_editor(organization_id))
  with check (public.is_org_editor(organization_id));

-- Attribution d'invitation non falsifiable par un appel PostgREST direct.
drop policy if exists "invitations: owner manages" on public.team_invitations;
create policy "invitations: owner manages" on public.team_invitations for all
  using (public.is_org_owner(organization_id))
  with check (
    public.is_org_owner(organization_id)
    and role in ('editor', 'cashier')
  );

create or replace function public.protect_invitation_attribution()
returns trigger language plpgsql set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    new.invited_by := auth.uid();
  elsif new.invited_by <> old.invited_by then
    raise exception 'invited_by is immutable';
  end if;
  return new;
end
$$;
revoke all on function public.protect_invitation_attribution() from public, anon, authenticated;
drop trigger if exists team_invitation_attribution on public.team_invitations;
create trigger team_invitation_attribution before insert or update on public.team_invitations
  for each row execute function public.protect_invitation_attribution();

-- Audit des mutations effectuées avec une session marchande, y compris si
-- PostgREST est appelé directement. Les écritures service_role n'ont pas
-- auth.uid() et ne polluent donc pas ce journal.
create or replace function public.audit_merchant_mutation()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_row jsonb;
  v_org uuid;
begin
  if v_uid is null then
    if tg_op = 'DELETE' then return old; else return new; end if;
  end if;
  v_row := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
  v_org := (v_row ->> 'organization_id')::uuid;
  insert into public.audit_logs(organization_id, actor, action, metadata)
  values (
    v_org,
    v_uid::text,
    lower(tg_table_name) || '.' || lower(tg_op),
    jsonb_build_object('record_id', v_row ->> 'id')
  );
  if tg_op = 'DELETE' then return old; else return new; end if;
end
$$;

revoke all on function public.audit_merchant_mutation() from public, anon, authenticated;
drop trigger if exists campaigns_merchant_audit on public.campaigns;
create trigger campaigns_merchant_audit after insert or update or delete on public.campaigns
  for each row execute function public.audit_merchant_mutation();
drop trigger if exists wheels_merchant_audit on public.wheels;
create trigger wheels_merchant_audit after insert or update or delete on public.wheels
  for each row execute function public.audit_merchant_mutation();
drop trigger if exists prizes_merchant_audit on public.prizes;
create trigger prizes_merchant_audit after insert or update or delete on public.prizes
  for each row execute function public.audit_merchant_mutation();
drop trigger if exists qr_codes_merchant_audit on public.qr_codes;
create trigger qr_codes_merchant_audit after insert or update or delete on public.qr_codes
  for each row execute function public.audit_merchant_mutation();

-- ── Spin anonyme atomique ──
alter table public.spins add column if not exists play_window_key text;
create unique index if not exists spins_one_per_window_idx
  on public.spins(wheel_id, player_key, play_window_key)
  where play_window_key is not null;

create or replace function public.perform_atomic_spin(
  p_organization_id uuid,
  p_campaign_id uuid,
  p_wheel_id uuid,
  p_player_key text,
  p_engagement_action text,
  p_source text
)
returns table (
  spin_id uuid,
  prize_id uuid,
  is_losing boolean,
  denial_reason text,
  next_eligible_at timestamptz
)
language plpgsql security definer set search_path = '' as $$
declare
  v_limit text;
  v_timezone text;
  v_local_now timestamp;
  v_window_key text;
  v_window_start timestamptz;
  v_next timestamptz;
  v_total bigint;
  v_pick bigint;
  v_prize record;
  v_spin_id uuid;
  v_random bytea;
begin
  if p_player_key is null or length(p_player_key) < 32 then
    raise exception 'invalid player key';
  end if;

  select w.play_limit, o.timezone into v_limit, v_timezone
  from public.wheels w
  join public.campaigns c on c.id = w.campaign_id and c.organization_id = w.organization_id
  join public.organizations o on o.id = w.organization_id
  where w.id = p_wheel_id and w.campaign_id = p_campaign_id
    and w.organization_id = p_organization_id;
  if not found then raise exception 'invalid play resource chain'; end if;

  v_local_now := pg_catalog.now() at time zone v_timezone;
  if v_limit = 'once' then
    v_window_key := 'once';
    v_window_start := 'epoch'::timestamptz;
  elsif v_limit = 'daily' then
    v_window_key := 'day:' || to_char(v_local_now, 'YYYY-MM-DD');
    v_window_start := date_trunc('day', v_local_now) at time zone v_timezone;
    v_next := (date_trunc('day', v_local_now) + interval '1 day') at time zone v_timezone;
  elsif v_limit = 'weekly' then
    v_window_key := 'week:' || to_char(v_local_now, 'IYYY-IW');
    v_window_start := date_trunc('week', v_local_now) at time zone v_timezone;
    v_next := (date_trunc('week', v_local_now) + interval '1 week') at time zone v_timezone;
  else
    v_window_key := null;
    v_window_start := null;
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_wheel_id::text || ':' || p_player_key, 0)
  );

  if v_window_start is not null and exists (
    select 1 from public.spins s
    where s.wheel_id = p_wheel_id and s.player_key = p_player_key
      and s.created_at >= v_window_start
  ) then
    return query select null::uuid, null::uuid, false, 'limit_reached', v_next;
    return;
  end if;

  loop
    select coalesce(sum(weight), 0)::bigint into v_total
    from public.prizes
    where wheel_id = p_wheel_id and organization_id = p_organization_id
      and is_active and weight > 0 and (is_losing or stock is null or stock > 0);
    if v_total <= 0 then
      return query select null::uuid, null::uuid, false, 'no_prize', null::timestamptz;
      return;
    end if;

    v_random := extensions.gen_random_bytes(4);
    v_pick := mod(
      (get_byte(v_random, 0)::bigint * 16777216
       + get_byte(v_random, 1)::bigint * 65536
       + get_byte(v_random, 2)::bigint * 256
       + get_byte(v_random, 3)::bigint),
      v_total
    );
    select q.* into v_prize from (
      select p.*, sum(p.weight) over(order by p.position, p.created_at, p.id) as ceiling
      from public.prizes p
      where p.wheel_id = p_wheel_id and p.organization_id = p_organization_id
        and p.is_active and p.weight > 0 and (p.is_losing or p.stock is null or p.stock > 0)
    ) q where q.ceiling > v_pick order by q.ceiling limit 1;

    if v_prize.is_losing or v_prize.stock is null then exit; end if;
    update public.prizes set stock = stock - 1
      where id = v_prize.id and stock > 0;
    if found then exit; end if;
  end loop;

  insert into public.spins(
    organization_id, campaign_id, wheel_id, prize_id, is_losing,
    player_key, engagement_action, source, play_window_key
  ) values (
    p_organization_id, p_campaign_id, p_wheel_id,
    case when v_prize.is_losing then null else v_prize.id end,
    v_prize.is_losing, p_player_key, p_engagement_action,
    case when p_source = 'share' then 'share' else 'direct' end,
    v_window_key
  ) returning id into v_spin_id;

  -- Le lot perdant est retourné au serveur pour restituer le bon libellé,
  -- mais n'est volontairement pas référencé par le spin en base.
  return query select v_spin_id, v_prize.id,
    v_prize.is_losing, null::text, null::timestamptz;
end
$$;

revoke all on function public.perform_atomic_spin(uuid,uuid,uuid,text,text,text)
  from public, anon, authenticated;
grant execute on function public.perform_atomic_spin(uuid,uuid,uuid,text,text,text)
  to service_role;

-- ── Réclamation atomique et code long ──
create table public.webhook_deliveries(
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  event text not null check (event in ('participation.claimed','newsletter.subscriber.created')),
  data jsonb not null,
  attempts integer not null default 0,
  next_attempt_at timestamptz not null default now(),
  locked_until timestamptz,
  delivered_at timestamptz,
  last_error text,
  created_at timestamptz not null default now()
);
create index webhook_deliveries_due_idx on public.webhook_deliveries(next_attempt_at)
  where delivered_at is null;
alter table public.webhook_deliveries enable row level security;
grant all on table public.webhook_deliveries to service_role;

alter table public.participations drop constraint if exists participations_accepted_terms_check;
alter table public.participations
  add constraint participations_accepted_terms_check check (
    accepted_terms = true or (first_name is null and email is null and phone is null)
  );

create or replace function public.claim_winning_spin(
  p_spin_id uuid,
  p_first_name text,
  p_email text,
  p_phone text,
  p_accepted_terms boolean,
  p_marketing_opt_in boolean
)
returns table(participation_id uuid, redeem_code text)
language plpgsql security definer set search_path = '' as $$
declare
  v_spin public.spins%rowtype;
  v_campaign public.campaigns%rowtype;
  v_code text;
  v_id uuid;
  v_alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  v_bytes bytea;
  i integer;
  attempt integer;
begin
  select * into v_spin from public.spins where id = p_spin_id for update;
  if not found or v_spin.is_losing or v_spin.prize_id is null or v_spin.claimed then
    raise exception 'gain unavailable';
  end if;
  select * into v_campaign from public.campaigns
    where id = v_spin.campaign_id and organization_id = v_spin.organization_id;
  if not found then raise exception 'campaign unavailable'; end if;
  if v_campaign.collect_email and p_email is null then raise exception 'email required'; end if;
  if v_campaign.collect_phone and p_phone is null then raise exception 'phone required'; end if;
  if (v_campaign.collect_email or v_campaign.collect_phone)
     and (p_first_name is null or not p_accepted_terms) then
    raise exception 'consent required';
  end if;

  for attempt in 1..8 loop
    v_bytes := extensions.gen_random_bytes(8);
    v_code := 'GAIN-';
    for i in 0..7 loop
      v_code := v_code || substr(v_alphabet, get_byte(v_bytes, i) % length(v_alphabet) + 1, 1);
    end loop;
    begin
      insert into public.participations(
        organization_id, campaign_id, wheel_id, prize_id, spin_id,
        first_name, email, phone, accepted_terms, marketing_opt_in,
        redeem_code, player_key
      ) values (
        v_spin.organization_id, v_spin.campaign_id, v_spin.wheel_id,
        v_spin.prize_id, v_spin.id,
        case when v_campaign.collect_email or v_campaign.collect_phone then p_first_name else null end,
        case when v_campaign.collect_email then p_email else null end,
        case when v_campaign.collect_phone then p_phone else null end,
        case when v_campaign.collect_email or v_campaign.collect_phone then p_accepted_terms else false end,
        case when v_campaign.collect_email or v_campaign.collect_phone then p_marketing_opt_in else false end,
        v_code, v_spin.player_key
      ) returning id into v_id;
      update public.spins set claimed = true where id = v_spin.id;
      insert into public.audit_logs(organization_id, actor, action, metadata)
      values(v_spin.organization_id, 'public', 'participation.claim',
        jsonb_build_object('campaign_id', v_spin.campaign_id, 'prize_id', v_spin.prize_id));
      if p_marketing_opt_in and p_email is not null then
        insert into public.newsletter_subscribers(organization_id, email, source)
        values(v_spin.organization_id, p_email, 'claim')
        on conflict(organization_id, email) do nothing;
        if found and exists(select 1 from public.organizations o where o.id = v_spin.organization_id and o.webhook_url is not null) then
          insert into public.webhook_deliveries(organization_id, event, data)
          values(v_spin.organization_id, 'newsletter.subscriber.created',
            jsonb_build_object('email', p_email, 'source', 'claim'));
        end if;
      end if;
      if exists(select 1 from public.organizations o where o.id = v_spin.organization_id and o.webhook_url is not null) then
        insert into public.webhook_deliveries(organization_id, event, data)
        values(v_spin.organization_id, 'participation.claimed', jsonb_strip_nulls(jsonb_build_object(
          'first_name', case when v_campaign.collect_email or v_campaign.collect_phone then p_first_name else null end,
          'email', case when v_campaign.collect_email then p_email else null end,
          'phone', case when v_campaign.collect_phone then p_phone else null end,
          'prize_label', (select label from public.prizes where id = v_spin.prize_id),
          'redeem_code', v_code
        )));
      end if;
      return query select v_id, v_code;
      return;
    exception when unique_violation then
      if exists(select 1 from public.participations where spin_id = v_spin.id) then
        raise exception 'gain already claimed';
      end if;
    end;
  end loop;
  raise exception 'code generation exhausted';
end
$$;

revoke all on function public.claim_winning_spin(uuid,text,text,text,boolean,boolean)
  from public, anon, authenticated;
grant execute on function public.claim_winning_spin(uuid,text,text,text,boolean,boolean)
  to service_role;

create or replace function public.claim_webhook_deliveries(p_limit integer default 50)
returns table(id uuid, organization_id uuid, event text, data jsonb, created_at timestamptz, attempts integer)
language sql security definer set search_path = '' as $$
  update public.webhook_deliveries d set
    locked_until = pg_catalog.now() + interval '2 minutes',
    attempts = d.attempts + 1
  from (
    select q.id from public.webhook_deliveries q
    where q.delivered_at is null and q.next_attempt_at <= pg_catalog.now()
      and (q.locked_until is null or q.locked_until < pg_catalog.now())
      and q.attempts < 12
    order by q.next_attempt_at, q.created_at
    for update skip locked limit least(greatest(p_limit, 1), 100)
  ) due where d.id = due.id
  returning d.id, d.organization_id, d.event, d.data, d.created_at, d.attempts
$$;
revoke all on function public.claim_webhook_deliveries(integer) from public, anon, authenticated;
grant execute on function public.claim_webhook_deliveries(integer) to service_role;

-- La caisse passe par une seule RPC : recherche, validation et audit sont
-- atomiques. L'ancien redeem_participation reste révoqué aux sessions.
create or replace function public.redeem_by_code(
  p_organization_id uuid,
  p_redeem_code text,
  p_actor text
)
returns table(
  id uuid, created_at timestamptz, first_name text, redeem_code text,
  redeemed_at timestamptz, prize_label text, prize_description text,
  campaign_name text, redeemed_now boolean
)
language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  if p_actor is null or length(p_actor) = 0 then raise exception 'actor required'; end if;
  update public.participations p set redeemed_at = now()
  where p.organization_id = p_organization_id
    and p.redeem_code = upper(trim(p_redeem_code))
    and p.redeemed_at is null
  returning p.id into v_id;
  if v_id is not null then
    insert into public.audit_logs(organization_id, actor, action, metadata)
    values(p_organization_id, p_actor, 'participation.redeem', jsonb_build_object('participation_id', v_id));
  end if;
  return query
  select p.id, p.created_at, p.first_name, p.redeem_code, p.redeemed_at,
         pr.label, pr.description, c.name, (v_id is not null)
  from public.participations p
  left join public.prizes pr on pr.id = p.prize_id
  join public.campaigns c on c.id = p.campaign_id
  where p.organization_id = p_organization_id
    and p.redeem_code = upper(trim(p_redeem_code)) limit 1;
end
$$;

revoke all on function public.lookup_redeem_code(uuid,text) from authenticated;
revoke all on function public.redeem_participation(uuid,uuid) from authenticated;
revoke all on function public.redeem_by_code(uuid,text,text) from public, anon, authenticated;
grant execute on function public.redeem_by_code(uuid,text,text) to service_role;

-- ── Stripe : insertion de l'événement et statut dans la même transaction ──
alter table public.stripe_events
  add column if not exists event_created_at timestamptz,
  add column if not exists processed_at timestamptz;

create or replace function public.apply_stripe_subscription_event(
  p_event_id text,
  p_event_created_at timestamptz,
  p_customer_id text,
  p_status text,
  p_trial_ends_at timestamptz
)
returns table(organization_id uuid, applied boolean, duplicate boolean)
language plpgsql security definer set search_path = '' as $$
declare v_org public.organizations%rowtype;
begin
  if p_status not in ('trialing','active','past_due','canceled','inactive') then
    raise exception 'invalid subscription status';
  end if;
  insert into public.stripe_events(id, event_created_at)
  values(p_event_id, p_event_created_at)
  on conflict(id) do nothing;
  if not found then
    return query select null::uuid, false, true;
    return;
  end if;

  select * into v_org from public.organizations
    where stripe_customer_id = p_customer_id for update;
  if not found then raise exception 'unknown stripe customer'; end if;

  if v_org.stripe_event_created_at is null
     or p_event_created_at >= v_org.stripe_event_created_at then
    update public.organizations set
      subscription_status = p_status,
      past_due_since = case
        when p_status = 'past_due' then coalesce(past_due_since, p_event_created_at)
        else null end,
      trial_ends_at = case
        when p_status = 'trialing' and p_trial_ends_at is not null then p_trial_ends_at
        else trial_ends_at end,
      stripe_event_created_at = p_event_created_at
    where id = v_org.id;
    update public.stripe_events set processed_at = now() where id = p_event_id;
    return query select v_org.id, true, false;
  else
    update public.stripe_events set processed_at = now() where id = p_event_id;
    return query select v_org.id, false, false;
  end if;
end
$$;

revoke all on function public.apply_stripe_subscription_event(text,timestamptz,text,text,timestamptz)
  from public, anon, authenticated;
grant execute on function public.apply_stripe_subscription_event(text,timestamptz,text,text,timestamptz)
  to service_role;

-- ── Sessions administrateur propres à chaque connexion ──
create table public.admin_sessions(
  id uuid primary key default gen_random_uuid(),
  admin_user_id uuid not null references public.admin_users(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  token_hash text not null unique,
  fresh_until timestamptz not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  revoked_at timestamptz,
  check (fresh_until <= expires_at)
);
create index admin_sessions_user_idx on public.admin_sessions(user_id, expires_at);
alter table public.admin_sessions enable row level security;
grant all on table public.admin_sessions to service_role;

-- Modification atomique d'un admin : le verrou empêche deux requêtes de
-- désactiver/rétrograder simultanément les derniers super-administrateurs.
create or replace function public.update_admin_safely(
  p_admin_id uuid,
  p_role text default null,
  p_is_active boolean default null
)
returns boolean language plpgsql security definer set search_path = '' as $$
declare v_target public.admin_users%rowtype; v_next_role text; v_next_active boolean;
begin
  perform pg_catalog.pg_advisory_xact_lock(731904221);
  select * into v_target from public.admin_users where id = p_admin_id for update;
  if not found then return false; end if;
  v_next_role := coalesce(p_role, v_target.role);
  v_next_active := coalesce(p_is_active, v_target.is_active);
  if v_next_role not in ('super_admin','admin','support','finance','read_only') then
    raise exception 'invalid admin role';
  end if;
  if v_target.role = 'super_admin' and v_target.is_active
     and (v_next_role <> 'super_admin' or not v_next_active)
     and (select count(*) from public.admin_users where role = 'super_admin' and is_active) <= 1 then
    raise exception 'last active super admin';
  end if;
  update public.admin_users set role = v_next_role, is_active = v_next_active,
    updated_at = pg_catalog.now() where id = p_admin_id;
  if not v_next_active then
    update public.admin_sessions set revoked_at = coalesce(revoked_at, pg_catalog.now())
      where admin_user_id = p_admin_id and revoked_at is null;
  end if;
  return true;
end
$$;
revoke all on function public.update_admin_safely(uuid,text,boolean) from public, anon, authenticated;
grant execute on function public.update_admin_safely(uuid,text,boolean) to service_role;

-- ── Purge RGPD complète, sans plafond d'organisations ──
create or replace function public.admin_audit_immutable()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if pg_catalog.current_setting('lastchance.audit_maintenance', true) = 'on' then
    if tg_op = 'DELETE' then return old; else return new; end if;
  end if;
  raise exception 'admin_audit_logs est append-only : % interdit', tg_op;
end
$$;
revoke all on function public.admin_audit_immutable() from public, anon, authenticated;

create or replace function public.purge_expired_personal_data()
returns table(organizations_processed bigint, participations_deleted bigint, subscribers_deleted bigint)
language plpgsql security definer set search_path = '' as $$
declare r record; p_count bigint := 0; s_count bigint := 0; n bigint := 0; c bigint;
begin
  for r in select id, data_retention_months from public.organizations
           where data_retention_months is not null loop
    n := n + 1;
    delete from public.participations
      where organization_id = r.id
        and created_at < now() - make_interval(months => r.data_retention_months);
    get diagnostics c = row_count; p_count := p_count + c;
    delete from public.newsletter_subscribers
      where organization_id = r.id and unsubscribed_at is not null
        and unsubscribed_at < now() - make_interval(months => r.data_retention_months);
    get diagnostics c = row_count; s_count := s_count + c;
  end loop;
  delete from public.webhook_deliveries
    where (delivered_at is not null or attempts >= 12)
      and created_at < pg_catalog.now() - interval '30 days';
  delete from public.admin_sessions
    where expires_at < pg_catalog.now() - interval '30 days';
  -- L'événement d'audit reste probant, mais l'email et l'IP cessent
  -- d'identifier une personne après 24 mois.
  perform pg_catalog.set_config('lastchance.audit_maintenance', 'on', true);
  update public.admin_audit_logs set actor_email = '[anonymisé]', ip = null,
    metadata = metadata - 'email' - 'target_email'
    where created_at < pg_catalog.now() - interval '24 months'
      and (actor_email <> '[anonymisé]' or ip is not null);
  perform pg_catalog.set_config('lastchance.audit_maintenance', 'off', true);
  delete from public.admin_notes where created_at < pg_catalog.now() - interval '24 months';
  return query select n, p_count, s_count;
end
$$;
revoke all on function public.purge_expired_personal_data() from public, anon, authenticated;
grant execute on function public.purge_expired_personal_data() to service_role;

-- Agrégats et pagination calculés en base : une page ne déclenche plus
-- plusieurs requêtes par campagne et la liste clients reste bornée.
create index if not exists participations_org_created_idx
  on public.participations(organization_id, created_at desc);
create index if not exists participations_org_email_created_idx
  on public.participations(organization_id, email, created_at desc) where email is not null;
create index if not exists campaigns_org_created_idx
  on public.campaigns(organization_id, created_at desc);
create index if not exists qr_codes_org_created_idx
  on public.qr_codes(organization_id, created_at desc);

create or replace function public.org_campaign_stats(p_organization_id uuid)
returns table(campaign_id uuid, spins bigint, wins bigint, pending bigint)
language plpgsql security definer set search_path = '' stable as $$
begin
  if not public.is_org_editor(p_organization_id) then raise exception 'not authorized'; end if;
  return query
  select c.id,
    (select count(*) from public.spins s where s.campaign_id = c.id),
    (select count(*) from public.spins s where s.campaign_id = c.id and not s.is_losing),
    (select count(*) from public.participations p where p.campaign_id = c.id and p.redeemed_at is null)
  from public.campaigns c where c.organization_id = p_organization_id;
end
$$;

create or replace function public.org_customer_profiles_page(
  p_organization_id uuid, p_offset integer default 0, p_limit integer default 50
)
returns table(
  email text, first_name text, wins bigint, redeemed bigint,
  first_win timestamptz, last_win timestamptz, total_count bigint
)
language plpgsql security definer set search_path = '' stable as $$
begin
  if not public.is_org_owner(p_organization_id) then raise exception 'not authorized'; end if;
  if p_offset < 0 or p_limit < 1 or p_limit > 100 then raise exception 'invalid pagination'; end if;
  return query
  with profiles as (
    select p.email,
      (array_agg(p.first_name order by p.created_at desc))[1] as first_name,
      count(*) as wins,
      count(*) filter (where p.redeemed_at is not null) as redeemed,
      min(p.created_at) as first_win,
      max(p.created_at) as last_win
    from public.participations p
    where p.organization_id = p_organization_id and p.email is not null
    group by p.email
  )
  select profiles.*, count(*) over() from profiles
  order by last_win desc offset p_offset limit p_limit;
end
$$;

create or replace function public.org_dashboard_summary(p_organization_id uuid)
returns jsonb language plpgsql security definer set search_path = '' stable as $$
declare v_result jsonb;
begin
  if not public.is_org_editor(p_organization_id) then raise exception 'not authorized'; end if;
  select jsonb_build_object(
    'scans', (select coalesce(sum(q.scan_count), 0) from public.qr_codes q where q.organization_id = p_organization_id),
    'spins', (select count(*) from public.spins s where s.organization_id = p_organization_id),
    'wins', (select count(*) from public.spins s where s.organization_id = p_organization_id and not s.is_losing),
    'participations', (select count(*) from public.participations p where p.organization_id = p_organization_id),
    'redeemed', (select count(*) from public.participations p where p.organization_id = p_organization_id and p.redeemed_at is not null),
    'blocked', (select count(*) from public.audit_logs a where a.organization_id = p_organization_id
      and a.action in ('security.rate_limited','security.captcha_failed') and a.created_at >= pg_catalog.now() - interval '7 days'),
    'campaigns', (select count(*) from public.campaigns c where c.organization_id = p_organization_id),
    'first_campaign_id', (select c.id from public.campaigns c where c.organization_id = p_organization_id order by c.created_at limit 1),
    'active_campaigns', (select count(*) from public.campaigns c where c.organization_id = p_organization_id and c.status = 'active'),
    'active_prizes', (select count(*) from public.prizes p where p.organization_id = p_organization_id and p.is_active),
    'qr_codes', (select count(*) from public.qr_codes q where q.organization_id = p_organization_id),
    'first_qr_id', (select q.id from public.qr_codes q where q.organization_id = p_organization_id order by q.created_at limit 1),
    'poster_customized', exists(select 1 from public.qr_codes q where q.organization_id = p_organization_id and q.poster <> '{}'::jsonb),
    'distribution', coalesce((
      select jsonb_agg(to_jsonb(d) order by d.count desc) from (
        select pr.id, pr.label, pr.color, count(pa.id)::bigint as count
        from public.participations pa join public.prizes pr on pr.id = pa.prize_id
        where pa.organization_id = p_organization_id
        group by pr.id, pr.label, pr.color
      ) d
    ), '[]'::jsonb)
  ) into v_result;
  return v_result;
end
$$;

-- Réappliquer une liste blanche finale après création/remplacement des RPC.
revoke execute on all functions in schema public from public, anon, authenticated;
grant execute on all functions in schema public to service_role;
grant execute on function public.is_org_member(uuid) to authenticated;
grant execute on function public.is_org_owner(uuid) to authenticated;
grant execute on function public.is_org_editor(uuid) to authenticated;
grant execute on function public.create_organization(text,text) to authenticated;
grant execute on function public.accept_team_invitation(uuid) to authenticated;
grant execute on function public.org_team_members(uuid) to authenticated;
grant execute on function public.org_customer_profiles(uuid) to authenticated;
grant execute on function public.org_customer_profiles_page(uuid,integer,integer) to authenticated;
grant execute on function public.org_campaign_stats(uuid) to authenticated;
grant execute on function public.org_dashboard_summary(uuid) to authenticated;
grant execute on function public.org_segment_emails(uuid,text,int,int) to authenticated;
grant execute on function public.org_segment_counts(uuid) to authenticated;
grant execute on function public.campaign_prize_performance(uuid) to authenticated;

-- La nouvelle colonne publique est lisible par les membres ; les marqueurs
-- Stripe/cron restent invisibles aux sessions marchandes.
grant select(timezone) on public.organizations to authenticated;
