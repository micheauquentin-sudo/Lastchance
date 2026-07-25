-- ============================================================
-- Analytics métier universels, indépendants de PostHog.
--
-- Objectifs :
--   * événements serveur bornés, sans PII et cloisonnés par organisation ;
--   * écriture service_role uniquement, toujours via une RPC validante ;
--   * agrégats commerçants SECURITY DEFINER, protégés par is_org_member ;
--   * rétention alignée sur organizations.data_retention_months ;
--   * dimensions communes : expérience, origine, joueur pseudonymisé,
--     campagne, émission de récompense, coût et panier attribuable.
-- ============================================================

create table public.experience_events (
  id bigint generated always as identity primary key,
  organization_id uuid not null
    references public.organizations(id) on delete cascade,
  event_name text not null check (event_name in (
    'experience_viewed',
    'experience_joined',
    'experience_started',
    'experience_completed',
    'reward_issued',
    'reward_claimed',
    'reward_redeemed',
    'player_returned',
    'experience_shared'
  )),
  experience_kind text not null check (experience_kind in (
    'campaign',
    'hunt',
    'loyalty',
    'jackpot',
    'event',
    'calendar',
    'referral',
    'contest',
    'quiz'
  )),
  experience_id uuid not null,
  source text not null default 'unknown' check (source in (
    'direct', 'qr', 'share', 'referral', 'unknown'
  )),
  player_id uuid references public.players(id) on delete set null,
  -- SHA-256 d'un jeton appareil legacy. Jamais le jeton, email ou téléphone.
  player_key text check (
    player_key is null or player_key ~ '^[0-9a-f]{64}$'
  ),
  qr_code_id uuid,
  campaign_id uuid,
  reward_issuance_id uuid
    references public.reward_issuances(id) on delete set null,
  basket_cents bigint check (
    basket_cents is null or basket_cents between 0 and 100000000
  ),
  reward_cost_cents bigint check (
    reward_cost_cents is null or reward_cost_cents between 0 and 100000000
  ),
  idempotency_key text check (
    idempotency_key is null
    or (
      char_length(idempotency_key) between 1 and 180
      and idempotency_key ~ '^[a-zA-Z0-9:_-]+$'
    )
  ),
  metadata jsonb not null default '{}'::jsonb check (
    jsonb_typeof(metadata) = 'object'
    and octet_length(metadata::text) <= 4096
  ),
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  -- Les dimensions économiques n'ont de sens qu'au retrait effectif.
  constraint experience_events_economics_check check (
    event_name = 'reward_redeemed'
    or (basket_cents is null and reward_cost_cents is null)
  ),
  constraint experience_events_reward_dimension_check check (
    reward_issuance_id is null
    or event_name in ('reward_issued', 'reward_claimed', 'reward_redeemed')
  )
);

comment on table public.experience_events is
  'Journal serveur sans PII des parcours de jeu et de leur impact commercial. Écriture service_role via record_experience_event ; lecture commerçant uniquement via agrégat tenant-scopé.';
comment on column public.experience_events.player_key is
  'Identifiant pseudonyme legacy : SHA-256 hex d''un jeton appareil. Jamais une valeur brute ou une PII.';
comment on column public.experience_events.metadata is
  'Petit objet de dimensions non personnelles. Les clés PII/secrets sont refusées récursivement par la RPC.';

create unique index experience_events_idempotency_idx
  on public.experience_events (organization_id, idempotency_key)
  where idempotency_key is not null;
create index experience_events_org_time_idx
  on public.experience_events (organization_id, occurred_at desc);
create index experience_events_org_experience_time_idx
  on public.experience_events (
    organization_id, experience_kind, experience_id, occurred_at desc
  );
create index experience_events_org_event_time_idx
  on public.experience_events (organization_id, event_name, occurred_at desc);
create index experience_events_org_source_time_idx
  on public.experience_events (organization_id, source, occurred_at desc);
create index experience_events_player_idx
  on public.experience_events (organization_id, player_id, occurred_at desc)
  where player_id is not null;
create index experience_events_player_key_idx
  on public.experience_events (organization_id, player_key, occurred_at desc)
  where player_key is not null;

alter table public.experience_events enable row level security;
revoke all on table public.experience_events from public, anon, authenticated;
grant select, insert, delete on table public.experience_events to service_role;
grant usage, select on sequence public.experience_events_id_seq to service_role;

-- Vérifie récursivement les clés de metadata. La valeur peut contenir de petits
-- scalaires/tableaux, mais aucune clé évocatrice de PII, token ou secret.
create or replace function public.is_safe_experience_metadata(p_value jsonb)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_key text;
  v_child jsonb;
begin
  if p_value is null then
    return true;
  end if;
  if pg_catalog.jsonb_typeof(p_value) = 'object' then
    for v_key, v_child in
      select key, value from pg_catalog.jsonb_each(p_value)
    loop
      if pg_catalog.lower(v_key)
        ~ '(email|phone|name|address|token|code|secret|(^|_)ip($|_)|user.?agent)'
      then
        return false;
      end if;
      if not public.is_safe_experience_metadata(v_child) then
        return false;
      end if;
    end loop;
  elsif pg_catalog.jsonb_typeof(p_value) = 'array' then
    for v_child in select value from pg_catalog.jsonb_array_elements(p_value)
    loop
      if not public.is_safe_experience_metadata(v_child) then
        return false;
      end if;
    end loop;
  elsif pg_catalog.jsonb_typeof(p_value) = 'string'
    and pg_catalog.length(p_value #>> '{}') > 160
  then
    return false;
  end if;
  return true;
end;
$$;

revoke all on function public.is_safe_experience_metadata(jsonb)
  from public, anon, authenticated;

-- Validation polymorphe de l'expérience. L'ID n'est jamais accepté sur la
-- seule foi du client : il doit exister dans l'organisation annoncée.
create or replace function public.experience_belongs_to_organization(
  p_kind text,
  p_experience_id uuid,
  p_organization_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  -- Une seule définition de la portée polymorphe : en particulier, une
  -- expérience "event" est une session live, pas le game réutilisable.
  select public.player_experience_scope_is_valid(
    p_kind,
    p_experience_id,
    p_organization_id
  );
$$;

revoke all on function public.experience_belongs_to_organization(text,uuid,uuid)
  from public, anon, authenticated;

create or replace function public.record_experience_event(
  p_organization_id uuid,
  p_event_name text,
  p_experience_kind text,
  p_experience_id uuid,
  p_source text default 'unknown',
  p_player_id uuid default null,
  p_player_key text default null,
  p_qr_code_id uuid default null,
  p_campaign_id uuid default null,
  p_reward_issuance_id uuid default null,
  p_basket_cents bigint default null,
  p_reward_cost_cents bigint default null,
  p_idempotency_key text default null,
  p_metadata jsonb default '{}'::jsonb
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id bigint;
  v_exists boolean;
  v_campaign_id uuid := p_campaign_id;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if p_event_name not in (
    'experience_viewed', 'experience_joined', 'experience_started',
    'experience_completed', 'reward_issued', 'reward_claimed',
    'reward_redeemed', 'player_returned', 'experience_shared'
  ) then
    raise exception 'invalid event';
  end if;
  if p_experience_kind not in (
    'campaign', 'hunt', 'loyalty', 'jackpot', 'event', 'calendar',
    'referral', 'contest', 'quiz'
  ) then
    raise exception 'invalid experience';
  end if;
  if coalesce(p_source, 'unknown') not in (
    'direct', 'qr', 'share', 'referral', 'unknown'
  ) then
    raise exception 'invalid source';
  end if;
  if not public.experience_belongs_to_organization(
    p_experience_kind, p_experience_id, p_organization_id
  ) then
    raise exception 'experience not found';
  end if;
  if p_player_key is not null
    and p_player_key !~ '^[0-9a-f]{64}$'
  then
    raise exception 'invalid player key';
  end if;
  if p_metadata is null
    or pg_catalog.jsonb_typeof(p_metadata) <> 'object'
    or pg_catalog.octet_length(p_metadata::text) > 4096
    or not public.is_safe_experience_metadata(p_metadata)
  then
    raise exception 'invalid metadata';
  end if;
  if p_basket_cents is not null
    and (p_event_name <> 'reward_redeemed'
      or p_basket_cents < 0 or p_basket_cents > 100000000)
  then
    raise exception 'invalid basket';
  end if;
  if p_reward_cost_cents is not null
    and (p_event_name <> 'reward_redeemed'
      or p_reward_cost_cents < 0 or p_reward_cost_cents > 100000000)
  then
    raise exception 'invalid reward cost';
  end if;
  if p_reward_issuance_id is not null
    and p_event_name not in (
      'reward_issued', 'reward_claimed', 'reward_redeemed'
    )
  then
    raise exception 'invalid reward dimension';
  end if;
  if p_idempotency_key is not null
    and (
      pg_catalog.length(p_idempotency_key) not between 1 and 180
      or p_idempotency_key !~ '^[a-zA-Z0-9:_-]+$'
    )
  then
    raise exception 'invalid idempotency key';
  end if;

  if p_player_id is not null then
    execute 'select exists (
      select 1
        from public.player_organization_memberships
       where player_id = $1 and organization_id = $2
    )' into v_exists using p_player_id, p_organization_id;
    if not v_exists then
      raise exception 'player not found in organization';
    end if;
    if p_player_key is not null and not exists (
      select 1
        from public.player_legacy_identities
       where player_id = p_player_id
         and organization_id = p_organization_id
         and experience_kind = p_experience_kind
         and experience_id = p_experience_id
         and legacy_identity_hash = p_player_key
    ) then
      raise exception 'player identity mismatch';
    end if;
  end if;

  if p_qr_code_id is not null and not exists (
    select 1 from public.qr_codes
     where id = p_qr_code_id and organization_id = p_organization_id
  ) then
    raise exception 'qr code not found';
  end if;

  if p_experience_kind = 'campaign' and v_campaign_id is null then
    v_campaign_id := p_experience_id;
  end if;
  if v_campaign_id is not null and not exists (
    select 1 from public.campaigns
     where id = v_campaign_id and organization_id = p_organization_id
  ) then
    raise exception 'campaign not found';
  end if;

  if p_reward_issuance_id is not null then
    execute 'select exists (
      select 1 from public.reward_issuances
       where id = $1 and organization_id = $2
    )' into v_exists using p_reward_issuance_id, p_organization_id;
    if not v_exists then
      raise exception 'reward issuance not found';
    end if;
  end if;

  insert into public.experience_events (
    organization_id, event_name, experience_kind, experience_id, source,
    player_id, player_key, qr_code_id, campaign_id, reward_issuance_id,
    basket_cents, reward_cost_cents, idempotency_key, metadata
  ) values (
    p_organization_id, p_event_name, p_experience_kind, p_experience_id,
    coalesce(p_source, 'unknown'), p_player_id, p_player_key, p_qr_code_id,
    v_campaign_id, p_reward_issuance_id, p_basket_cents,
    p_reward_cost_cents, p_idempotency_key, p_metadata
  )
  on conflict do nothing
  returning id into v_id;

  if v_id is null and p_idempotency_key is not null then
    select id into v_id
      from public.experience_events
     where organization_id = p_organization_id
       and idempotency_key = p_idempotency_key;
  end if;
  return v_id;
end;
$$;

revoke all on function public.record_experience_event(
  uuid,text,text,uuid,text,uuid,text,uuid,uuid,uuid,bigint,bigint,text,jsonb
) from public, anon, authenticated;
grant execute on function public.record_experience_event(
  uuid,text,text,uuid,text,uuid,text,uuid,uuid,uuid,bigint,bigint,text,jsonb
) to service_role;

-- Émetteur interne utilisé uniquement par les triggers ci-dessous. Toute
-- erreur analytics est absorbée : une mesure ne doit jamais annuler une
-- participation, une réponse ou une progression valide.
create or replace function public.append_experience_event_internal(
  p_organization_id uuid,
  p_event_name text,
  p_experience_kind text,
  p_experience_id uuid,
  p_player_key text,
  p_player_id uuid,
  p_source text,
  p_qr_code_id uuid,
  p_idempotency_key text,
  p_occurred_at timestamptz default now()
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_player_id uuid := p_player_id;
  v_source text := coalesce(p_source, 'unknown');
  v_qr_code_id uuid := p_qr_code_id;
begin
  if v_player_id is null and p_player_key is not null then
    select li.player_id, m.acquisition_source, m.acquisition_qr_code_id
      into v_player_id, v_source, v_qr_code_id
      from public.player_legacy_identities li
      join public.player_experience_memberships m
        on m.id = li.experience_membership_id
     where li.organization_id = p_organization_id
       and li.experience_kind = p_experience_kind
       and li.experience_id = p_experience_id
       and li.legacy_identity_hash = p_player_key
     limit 1;
  end if;

  insert into public.experience_events (
    organization_id,
    event_name,
    experience_kind,
    experience_id,
    source,
    player_id,
    player_key,
    qr_code_id,
    campaign_id,
    idempotency_key,
    occurred_at
  ) values (
    p_organization_id,
    p_event_name,
    p_experience_kind,
    p_experience_id,
    case
      when v_source in ('direct', 'qr', 'share', 'referral', 'unknown')
        then v_source
      else 'unknown'
    end,
    v_player_id,
    p_player_key,
    v_qr_code_id,
    case when p_experience_kind = 'campaign' then p_experience_id end,
    p_idempotency_key,
    coalesce(p_occurred_at, pg_catalog.now())
  )
  on conflict do nothing;
exception
  when others then
    return;
end;
$$;

revoke all on function public.append_experience_event_internal(
  uuid,text,text,uuid,text,uuid,text,uuid,text,timestamptz
) from public, anon, authenticated, service_role;

-- La résolution d'identité est le point commun des parcours : une nouvelle
-- adhésion compte comme vue + entrée ; une nouvelle journée civile dans le
-- fuseau du commerce compte comme retour. La première origine QR est conservée
-- par le registre d'identité et propagée ici.
create or replace function public.track_player_experience_membership()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_timezone text;
  v_local_day date;
begin
  select coalesce(timezone, 'Europe/Paris')
    into v_timezone
    from public.organizations
   where id = new.organization_id;
  v_local_day := (new.last_seen_at at time zone v_timezone)::date;

  -- Rattache rétroactivement les activités qui ont précédé le lazy-link dans
  -- la même transaction métier (ex. le spin est matérialisé avant la résolution
  -- d'identité). Le hash reste conservé pour l'audit pseudonyme.
  update public.experience_events
     set player_id = new.player_id,
         source = case
           when source = 'unknown' then new.acquisition_source
           else source
         end,
         qr_code_id = coalesce(qr_code_id, new.acquisition_qr_code_id)
   where organization_id = new.organization_id
     and experience_kind = new.experience_kind
     and experience_id = new.experience_id
     and player_id is null
     and player_key in (
       select legacy_identity_hash
         from public.player_legacy_identities
        where experience_membership_id = new.id
     );

  perform public.append_experience_event_internal(
    new.organization_id,
    'experience_viewed',
    new.experience_kind,
    new.experience_id,
    null,
    new.player_id,
    new.acquisition_source,
    new.acquisition_qr_code_id,
    'identity:view:' || new.id::text || ':'
      || pg_catalog.to_char(v_local_day, 'YYYYMMDD'),
    new.last_seen_at
  );

  if tg_op = 'INSERT' then
    perform public.append_experience_event_internal(
      new.organization_id,
      'experience_joined',
      new.experience_kind,
      new.experience_id,
      null,
      new.player_id,
      new.acquisition_source,
      new.acquisition_qr_code_id,
      'identity:join:' || new.id::text,
      new.first_seen_at
    );
  elsif (old.last_seen_at at time zone v_timezone)::date < v_local_day then
    perform public.append_experience_event_internal(
      new.organization_id,
      'player_returned',
      new.experience_kind,
      new.experience_id,
      null,
      new.player_id,
      new.acquisition_source,
      new.acquisition_qr_code_id,
      'identity:return:' || new.id::text || ':'
        || pg_catalog.to_char(v_local_day, 'YYYYMMDD'),
      new.last_seen_at
    );
  end if;
  return new;
exception
  when others then
    return new;
end;
$$;

revoke all on function public.track_player_experience_membership()
  from public, anon, authenticated, service_role;

create trigger player_experience_memberships_analytics
after insert or update of last_seen_at
on public.player_experience_memberships
for each row execute function public.track_player_experience_membership();

-- Démarrage/complétion communs aux écritures métier historiques. Les clés
-- d'idempotence sont centrées sur le joueur et l'expérience : un joueur n'est
-- compté qu'une fois dans le funnel même s'il rejoue ou répond plusieurs fois.
create or replace function public.track_experience_activity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_kind text;
  v_experience_id uuid;
  v_organization_id uuid;
  v_player_key text;
  v_player_row_id uuid;
  v_occurred_at timestamptz;
  v_complete boolean := false;
  v_source text := 'unknown';
begin
  case tg_table_name
    when 'spins' then
      v_kind := 'campaign';
      v_experience_id := new.campaign_id;
      v_organization_id := new.organization_id;
      v_player_key := new.player_key;
      v_occurred_at := new.created_at;
      v_complete := true;
      v_source := case
        when new.source = 'share' then 'share'
        when new.source = 'referral' then 'referral'
        else 'direct'
      end;
    when 'hunt_scans' then
      v_kind := 'hunt';
      v_experience_id := new.hunt_id;
      v_organization_id := new.organization_id;
      v_player_row_id := new.player_id;
      v_occurred_at := new.scanned_at;
      select token_hash into v_player_key
        from public.hunt_players where id = new.player_id;
    when 'loyalty_stamps' then
      v_kind := 'loyalty';
      v_experience_id := new.program_id;
      v_organization_id := new.organization_id;
      v_player_row_id := new.member_id;
      v_occurred_at := new.stamped_at;
      v_complete := true;
      select token_hash into v_player_key
        from public.loyalty_members where id = new.member_id;
    when 'jackpot_participants' then
      v_kind := 'jackpot';
      v_experience_id := new.campaign_id;
      v_organization_id := new.organization_id;
      v_player_key := new.player_token_hash;
      v_occurred_at := new.created_at;
      v_complete := true;
    when 'event_answers' then
      v_kind := 'event';
      v_experience_id := new.session_id;
      v_organization_id := new.organization_id;
      v_player_row_id := new.player_id;
      v_occurred_at := new.answered_at;
      select token_hash into v_player_key
        from public.event_players where id = new.player_id;
    when 'calendar_openings' then
      v_kind := 'calendar';
      v_experience_id := new.calendar_id;
      v_organization_id := new.organization_id;
      v_player_row_id := new.player_id;
      v_occurred_at := new.opened_at;
      select token_hash into v_player_key
        from public.calendar_players where id = new.player_id;
      select p.opened_count >= c.day_count
        into v_complete
        from public.calendar_players p
        join public.calendars c
          on c.id = p.calendar_id
         and c.organization_id = p.organization_id
       where p.id = new.player_id;
    when 'contest_predictions' then
      v_kind := 'contest';
      v_experience_id := new.contest_id;
      v_organization_id := new.organization_id;
      v_player_row_id := new.player_id;
      v_occurred_at := new.created_at;
      select token_hash into v_player_key
        from public.contest_players where id = new.player_id;
    when 'quiz_answers' then
      v_kind := 'quiz';
      v_experience_id := new.quiz_id;
      v_organization_id := new.organization_id;
      v_player_row_id := new.player_id;
      v_occurred_at := new.started_at;
      select token_hash into v_player_key
        from public.quiz_players where id = new.player_id;
    when 'referral_sponsors' then
      v_kind := 'referral';
      v_organization_id := new.organization_id;
      v_player_key := new.sponsor_key;
      v_occurred_at := new.created_at;
      v_source := 'share';
      select id into v_experience_id
        from public.referral_programs
       where campaign_id = new.campaign_id
         and organization_id = new.organization_id;
    when 'referral_signups' then
      v_kind := 'referral';
      v_organization_id := new.organization_id;
      v_player_key := new.filleul_key;
      v_occurred_at := new.created_at;
      v_source := 'referral';
      v_complete := true;
      select id into v_experience_id
        from public.referral_programs
       where campaign_id = new.campaign_id
         and organization_id = new.organization_id;
    else
      return new;
  end case;

  perform public.append_experience_event_internal(
    v_organization_id,
    'experience_started',
    v_kind,
    v_experience_id,
    v_player_key,
    null,
    v_source,
    null,
    'activity:start:' || v_kind || ':' || v_experience_id::text || ':'
      || coalesce(v_player_key, v_player_row_id::text),
    v_occurred_at
  );
  if v_complete then
    perform public.append_experience_event_internal(
      v_organization_id,
      'experience_completed',
      v_kind,
      v_experience_id,
      v_player_key,
      null,
      v_source,
      null,
      'activity:complete:' || v_kind || ':' || v_experience_id::text || ':'
        || coalesce(v_player_key, v_player_row_id::text),
      v_occurred_at
    );
  end if;
  return new;
exception
  when others then
    return new;
end;
$$;

revoke all on function public.track_experience_activity()
  from public, anon, authenticated, service_role;

create trigger spins_experience_analytics
after insert on public.spins
for each row execute function public.track_experience_activity();
create trigger hunt_scans_experience_analytics
after insert on public.hunt_scans
for each row execute function public.track_experience_activity();
create trigger loyalty_stamps_experience_analytics
after insert on public.loyalty_stamps
for each row execute function public.track_experience_activity();
create trigger jackpot_participants_experience_analytics
after insert on public.jackpot_participants
for each row execute function public.track_experience_activity();
create trigger event_answers_experience_analytics
after insert on public.event_answers
for each row execute function public.track_experience_activity();
create trigger calendar_openings_experience_analytics
after insert on public.calendar_openings
for each row execute function public.track_experience_activity();
create trigger contest_predictions_experience_analytics
after insert on public.contest_predictions
for each row execute function public.track_experience_activity();
create trigger quiz_answers_experience_analytics
after insert on public.quiz_answers
for each row execute function public.track_experience_activity();
create trigger referral_sponsors_experience_analytics
after insert on public.referral_sponsors
for each row execute function public.track_experience_activity();
create trigger referral_signups_experience_analytics
after insert on public.referral_signups
for each row execute function public.track_experience_activity();

-- Complétions dont le signal métier vit dans une table/transition distincte.
create or replace function public.track_experience_completion()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_kind text;
  v_experience_id uuid;
  v_organization_id uuid;
  v_player_key text;
  v_player_row_id uuid;
  v_occurred_at timestamptz;
begin
  case tg_table_name
    when 'hunt_completions' then
      v_kind := 'hunt';
      v_experience_id := new.hunt_id;
      v_organization_id := new.organization_id;
      v_player_row_id := new.player_id;
      v_occurred_at := new.completed_at;
      select token_hash into v_player_key
        from public.hunt_players where id = new.player_id;
    when 'contest_final_standings' then
      v_kind := 'contest';
      v_experience_id := new.contest_id;
      v_organization_id := new.organization_id;
      v_player_row_id := new.player_id;
      v_occurred_at := new.created_at;
      select token_hash into v_player_key
        from public.contest_players where id = new.player_id;
    when 'quiz_players' then
      if new.finished_at is null
        or (tg_op = 'UPDATE' and old.finished_at is not null)
      then
        return new;
      end if;
      v_kind := 'quiz';
      v_experience_id := new.quiz_id;
      v_organization_id := new.organization_id;
      v_player_row_id := new.id;
      v_player_key := new.token_hash;
      v_occurred_at := new.finished_at;
    when 'calendar_players' then
      if tg_op <> 'UPDATE' or new.opened_count <= old.opened_count then
        return new;
      end if;
      if not exists (
        select 1
          from public.calendars
         where id = new.calendar_id
           and organization_id = new.organization_id
           and new.opened_count >= day_count
           and old.opened_count < day_count
      ) then
        return new;
      end if;
      v_kind := 'calendar';
      v_experience_id := new.calendar_id;
      v_organization_id := new.organization_id;
      v_player_row_id := new.id;
      v_player_key := new.token_hash;
      v_occurred_at := pg_catalog.now();
    else
      return new;
  end case;

  perform public.append_experience_event_internal(
    v_organization_id,
    'experience_completed',
    v_kind,
    v_experience_id,
    v_player_key,
    null,
    'unknown',
    null,
    'activity:complete:' || v_kind || ':' || v_experience_id::text || ':'
      || coalesce(v_player_key, v_player_row_id::text),
    v_occurred_at
  );
  return new;
exception
  when others then
    return new;
end;
$$;

revoke all on function public.track_experience_completion()
  from public, anon, authenticated, service_role;

create trigger hunt_completions_experience_analytics
after insert on public.hunt_completions
for each row execute function public.track_experience_completion();
create trigger contest_final_standings_experience_analytics
after insert on public.contest_final_standings
for each row execute function public.track_experience_completion();
create trigger quiz_players_experience_analytics
after update of finished_at on public.quiz_players
for each row execute function public.track_experience_completion();
create trigger calendar_players_experience_analytics
after update of opened_count on public.calendar_players
for each row execute function public.track_experience_completion();

-- Une session live terminée complète l'expérience pour chacun de ses joueurs.
create or replace function public.track_event_session_completion()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_player record;
begin
  if new.status <> 'ended' or old.status = 'ended' then
    return new;
  end if;
  for v_player in
    select distinct p.id, p.token_hash
      from public.event_players p
      join public.event_answers a
        on a.player_id = p.id
       and a.session_id = p.session_id
       and a.organization_id = p.organization_id
     where p.session_id = new.id
       and p.organization_id = new.organization_id
  loop
    perform public.append_experience_event_internal(
      new.organization_id,
      'experience_completed',
      'event',
      new.id,
      v_player.token_hash,
      null,
      'unknown',
      null,
      'activity:complete:event:' || new.id::text || ':'
        || v_player.token_hash,
      coalesce(new.ended_at, pg_catalog.now())
    );
  end loop;
  return new;
exception
  when others then
    return new;
end;
$$;

revoke all on function public.track_event_session_completion()
  from public, anon, authenticated, service_role;

create trigger event_sessions_experience_analytics
after update of status on public.event_sessions
for each row execute function public.track_event_session_completion();

-- Le registre universel 150000 est le seul point d'instrumentation des lots.
-- Il couvre toutes les sources sans dupliquer la logique dans les RPC legacy.
-- `reward_claimed` reste volontairement préparé mais non émis : le registre ne
-- possède pas de signal claimed_at fiable. L'inventer confondrait émission et
-- consentement/claim.
create or replace function public.track_reward_issuance_analytics()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_kind text;
  v_source text := 'unknown';
  v_qr_code_id uuid;
  v_reward_cost_cents bigint;
  v_player_key text;
begin
  if new.experience_id is null then
    return new;
  end if;
  v_kind := case new.source_type
    when 'wheel' then 'campaign'
    when 'hunt' then 'hunt'
    when 'loyalty' then 'loyalty'
    when 'jackpot' then 'jackpot'
    when 'event' then 'event'
    when 'calendar' then 'calendar'
    when 'referral' then 'referral'
    when 'contest' then 'contest'
    when 'quiz' then 'quiz'
  end;
  if v_kind is null then
    return new;
  end if;

  if new.player_id is not null then
    select acquisition_source, acquisition_qr_code_id
      into v_source, v_qr_code_id
      from public.player_experience_memberships
     where player_id = new.player_id
       and organization_id = new.organization_id
       and experience_kind = v_kind
       and experience_id = new.experience_id
     limit 1;
  end if;
  if new.source_type = 'wheel' and new.reward_definition_id is not null then
    select cost_cents into v_reward_cost_cents
      from public.prizes
     where id = new.reward_definition_id
       and organization_id = new.organization_id;
  end if;
  -- Le registre ne stocke pas le hash legacy : on le relit depuis sa source
  -- autoritaire afin que les émissions antérieures au lazy-link restent
  -- attribuables sans copier de PII.
  case new.source_type
    when 'wheel' then
      select player_key into v_player_key
        from public.participations where id = new.source_id;
    when 'hunt' then
      select hp.token_hash into v_player_key
        from public.hunt_completions hc
        join public.hunt_players hp on hp.id = hc.player_id
       where hc.id = new.source_id;
    when 'loyalty' then
      select lm.token_hash into v_player_key
        from public.loyalty_rewards lr
        join public.loyalty_members lm on lm.id = lr.member_id
       where lr.id = new.source_id;
    when 'jackpot' then
      select winner_token_hash into v_player_key
        from public.jackpot_wins where id = new.source_id;
    when 'event' then
      select winner_token_hash into v_player_key
        from public.event_wins where id = new.source_id;
    when 'calendar' then
      if new.metadata ->> 'legacy_table' = 'calendar_openings' then
        select cp.token_hash into v_player_key
          from public.calendar_openings co
          join public.calendar_players cp on cp.id = co.player_id
         where co.id = new.source_id;
      else
        select cp.token_hash into v_player_key
          from public.calendar_rewards cr
          join public.calendar_players cp on cp.id = cr.player_id
         where cr.id = new.source_id;
      end if;
    when 'referral' then
      select case
          when rr.beneficiary = 'filleul' then rsu.filleul_key
          else rsp.sponsor_key
        end
        into v_player_key
        from public.referral_rewards rr
        left join public.referral_sponsors rsp on rsp.id = rr.sponsor_id
        left join public.referral_signups rsu on rsu.id = rr.signup_id
       where rr.id = new.source_id;
    when 'quiz' then
      select qp.token_hash into v_player_key
        from public.quiz_rewards qr
        join public.quiz_players qp on qp.id = qr.player_id
       where qr.id = new.source_id;
    when 'contest' then
      select cp.token_hash into v_player_key
        from public.contest_awards ca
        join public.contest_players cp on cp.id = ca.player_id
       where ca.id = new.source_id;
  end case;

  if tg_op = 'INSERT' then
    insert into public.experience_events (
      organization_id, event_name, experience_kind, experience_id, source,
      player_id, player_key, qr_code_id, campaign_id, reward_issuance_id,
      idempotency_key, occurred_at
    ) values (
      new.organization_id, 'reward_issued', v_kind, new.experience_id,
      coalesce(v_source, 'unknown'), new.player_id, v_player_key, v_qr_code_id,
      case when v_kind = 'campaign' then new.experience_id end,
      new.id, 'reward:issued:' || new.id::text, new.issued_at
    )
    on conflict do nothing;
  end if;

  if new.redeemed_at is not null then
    insert into public.experience_events (
      organization_id, event_name, experience_kind, experience_id, source,
      player_id, player_key, qr_code_id, campaign_id, reward_issuance_id,
      basket_cents, reward_cost_cents, idempotency_key, occurred_at
    ) values (
      new.organization_id, 'reward_redeemed', v_kind, new.experience_id,
      coalesce(v_source, 'unknown'), new.player_id, v_player_key, v_qr_code_id,
      case when v_kind = 'campaign' then new.experience_id end,
      new.id, new.basket_cents, v_reward_cost_cents,
      'reward:redeemed:' || new.id::text, new.redeemed_at
    )
    on conflict (organization_id, idempotency_key)
      where idempotency_key is not null
    do update set
      player_id = coalesce(excluded.player_id, experience_events.player_id),
      player_key = coalesce(excluded.player_key, experience_events.player_key),
      source = case
        when experience_events.source = 'unknown' then excluded.source
        else experience_events.source
      end,
      qr_code_id = coalesce(
        excluded.qr_code_id,
        experience_events.qr_code_id
      ),
      basket_cents = coalesce(
        excluded.basket_cents,
        experience_events.basket_cents
      ),
      reward_cost_cents = coalesce(
        excluded.reward_cost_cents,
        experience_events.reward_cost_cents
      );
  end if;
  return new;
exception
  when others then
    return new;
end;
$$;

revoke all on function public.track_reward_issuance_analytics()
  from public, anon, authenticated, service_role;

create trigger reward_issuances_experience_analytics
after insert or update of redeemed_at, basket_cents
on public.reward_issuances
for each row execute function public.track_reward_issuance_analytics();

-- Un seul agrégat JSON évite d'exposer la table brute et maintient l'isolation
-- tenant dans la base. Les taux sont calculés dans l'UI à partir de compteurs,
-- ce qui laisse « pas de donnée » distinct de 0 %.
create or replace function public.org_experience_analytics(
  p_organization_id uuid,
  p_days integer default 30
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_since timestamptz;
  v_result jsonb;
begin
  if not (
    coalesce(auth.role(), '') = 'service_role'
    or public.is_org_member(p_organization_id)
  ) then
    raise exception 'not authorized';
  end if;
  v_since := pg_catalog.now()
    - pg_catalog.make_interval(
        days => least(greatest(coalesce(p_days, 30), 1), 365)
      );

  with filtered as (
    select *
      from public.experience_events
     where organization_id = p_organization_id
       and occurred_at >= v_since
  ),
  names as (
    select 'campaign'::text as kind, id, name
      from public.campaigns where organization_id = p_organization_id
    union all
    select 'hunt', id, name
      from public.hunts where organization_id = p_organization_id
    union all
    select 'loyalty', id, name
      from public.loyalty_programs where organization_id = p_organization_id
    union all
    select 'jackpot', id, name
      from public.jackpot_campaigns where organization_id = p_organization_id
    union all
    select
      'event',
      s.id,
      g.name || coalesce(' · ' || nullif(s.label, ''), '')
      from public.event_sessions s
      join public.event_games g
        on g.id = s.game_id and g.organization_id = s.organization_id
     where s.organization_id = p_organization_id
    union all
    select 'calendar', id, name
      from public.calendars where organization_id = p_organization_id
    union all
    select 'referral', r.id, 'Parrainage · ' || c.name
      from public.referral_programs r
      join public.campaigns c
        on c.id = r.campaign_id and c.organization_id = r.organization_id
     where r.organization_id = p_organization_id
    union all
    select 'contest', id, name
      from public.contests where organization_id = p_organization_id
    union all
    select 'quiz', id, name
      from public.quizzes where organization_id = p_organization_id
  ),
  per_experience as (
    select
      e.experience_kind,
      e.experience_id,
      coalesce(max(n.name), 'Expérience supprimée') as experience_name,
      count(*) filter (where event_name = 'experience_viewed') as views,
      count(*) filter (where event_name = 'experience_joined') as joins,
      count(*) filter (where event_name = 'experience_started') as starts,
      count(*) filter (where event_name = 'experience_completed') as completions,
      count(*) filter (where event_name = 'reward_issued') as rewards_issued,
      count(*) filter (where event_name = 'reward_claimed') as rewards_claimed,
      count(*) filter (where event_name = 'reward_redeemed') as rewards_redeemed,
      count(distinct coalesce(player_id::text, player_key))
        filter (where event_name = 'player_returned') as returning_players,
      count(*) filter (where event_name = 'experience_shared') as shares,
      count(distinct coalesce(player_id::text, player_key)) as unique_players,
      count(basket_cents)
        filter (where event_name = 'reward_redeemed') as basket_observations,
      coalesce(sum(basket_cents)
        filter (where event_name = 'reward_redeemed'), 0) as basket_revenue_cents,
      count(reward_cost_cents)
        filter (where event_name = 'reward_redeemed') as reward_cost_observations,
      coalesce(sum(reward_cost_cents)
        filter (where event_name = 'reward_redeemed'), 0) as reward_cost_cents,
      count(*) filter (
        where event_name = 'reward_redeemed'
          and basket_cents is not null
          and reward_cost_cents is not null
      ) as margin_observations,
      coalesce(sum(basket_cents - reward_cost_cents) filter (
        where event_name = 'reward_redeemed'
          and basket_cents is not null
          and reward_cost_cents is not null
      ), 0) as attributable_margin_cents
    from filtered e
    left join names n
      on n.kind = e.experience_kind and n.id = e.experience_id
    group by e.experience_kind, e.experience_id
  ),
  per_source as (
    select
      source,
      count(*) filter (where event_name = 'experience_viewed') as views,
      count(*) filter (where event_name = 'experience_started') as starts,
      count(*) filter (where event_name = 'experience_completed') as completions,
      count(*) filter (where event_name = 'reward_redeemed') as rewards_redeemed,
      count(basket_cents)
        filter (where event_name = 'reward_redeemed') as basket_observations,
      coalesce(sum(basket_cents)
        filter (where event_name = 'reward_redeemed'), 0) as basket_revenue_cents
    from filtered
    group by source
  )
  select pg_catalog.jsonb_build_object(
    'period_days', least(greatest(coalesce(p_days, 30), 1), 365),
    'total_events', (select count(*) from filtered),
    'summary', pg_catalog.jsonb_build_object(
      'views', (select count(*) from filtered
        where event_name = 'experience_viewed'),
      'joins', (select count(*) from filtered
        where event_name = 'experience_joined'),
      'starts', (select count(*) from filtered
        where event_name = 'experience_started'),
      'completions', (select count(*) from filtered
        where event_name = 'experience_completed'),
      'rewards_issued', (select count(*) from filtered
        where event_name = 'reward_issued'),
      'rewards_claimed', (select count(*) from filtered
        where event_name = 'reward_claimed'),
      'rewards_redeemed', (select count(*) from filtered
        where event_name = 'reward_redeemed'),
      'returning_players', (select count(distinct coalesce(player_id::text, player_key))
        from filtered where event_name = 'player_returned'),
      'shares', (select count(*) from filtered
        where event_name = 'experience_shared'),
      'unique_players', (select count(distinct coalesce(player_id::text, player_key))
        from filtered),
      'basket_observations', (select count(basket_cents)
        from filtered where event_name = 'reward_redeemed'),
      'basket_revenue_cents', (select coalesce(sum(basket_cents), 0)
        from filtered where event_name = 'reward_redeemed'),
      'reward_cost_observations', (select count(reward_cost_cents)
        from filtered where event_name = 'reward_redeemed'),
      'reward_cost_cents', (select coalesce(sum(reward_cost_cents), 0)
        from filtered where event_name = 'reward_redeemed'),
      'margin_observations', (select count(*)
        from filtered
       where event_name = 'reward_redeemed'
         and basket_cents is not null
         and reward_cost_cents is not null),
      'attributable_margin_cents', (select coalesce(
          sum(basket_cents - reward_cost_cents), 0
        )
        from filtered
       where event_name = 'reward_redeemed'
         and basket_cents is not null
         and reward_cost_cents is not null)
    ),
    'experiences', coalesce((
      select pg_catalog.jsonb_agg(
        pg_catalog.to_jsonb(p) order by p.starts desc, p.views desc,
          p.experience_name
      )
      from per_experience p
    ), '[]'::jsonb),
    'sources', coalesce((
      select pg_catalog.jsonb_agg(
        pg_catalog.to_jsonb(s) order by s.views desc, s.source
      )
      from per_source s
    ), '[]'::jsonb)
  ) into v_result;

  return v_result;
end;
$$;

revoke all on function public.org_experience_analytics(uuid,integer)
  from public, anon;
grant execute on function public.org_experience_analytics(uuid,integer)
  to authenticated, service_role;

-- Purge RGPD/volumétrie : politique de rétention de chaque organisation,
-- bornée entre 1 et 24 mois ; 13 mois par défaut pour comparer une année.
create or replace function public.purge_expired_experience_events()
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_deleted bigint;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  delete from public.experience_events e
  using public.organizations o
   where o.id = e.organization_id
     and e.occurred_at < pg_catalog.now() - pg_catalog.make_interval(
       months => least(greatest(coalesce(o.data_retention_months, 13), 1), 24)
     );
  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;

revoke all on function public.purge_expired_experience_events()
  from public, anon, authenticated;
grant execute on function public.purge_expired_experience_events()
  to service_role;
