-- ============================================================
-- LastChance — registre universel progressif des récompenses
-- ============================================================
-- Les tables historiques restent les sources de vérité. Ce registre :
--   * ne backfill pas les anciennes lignes (migration sans big-bang) ;
--   * miroirise transactionnellement les nouvelles émissions et mutations ;
--   * ne touche jamais au stock (les RPC métier restent seules responsables) ;
--   * route la remise vers les RPC historiques, puis se réconcilie via trigger.

create table public.reward_issuances (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null
    references public.organizations(id) on delete cascade,
  player_id uuid references public.players(id) on delete set null,
  source_type text not null check (
    source_type in (
      'wheel', 'hunt', 'loyalty', 'jackpot', 'event',
      'calendar', 'referral', 'quiz', 'contest'
    )
  ),
  source_id uuid not null,
  experience_id uuid,
  reward_definition_id uuid,
  code text,
  label text not null default ''
    check (pg_catalog.char_length(label) <= 500),
  metadata jsonb not null default '{}'::jsonb
    check (
      pg_catalog.jsonb_typeof(metadata) = 'object'
      and pg_catalog.octet_length(metadata::text) <= 32768
    ),
  issued_at timestamptz not null,
  expires_at timestamptz,
  redeemed_at timestamptz,
  redeemed_by text
    check (redeemed_by is null or pg_catalog.char_length(redeemed_by) <= 120),
  cancelled_at timestamptz,
  cancelled_reason text
    check (
      cancelled_reason is null
      or pg_catalog.char_length(cancelled_reason) between 1 and 300
    ),
  basket_cents integer
    check (basket_cents is null or basket_cents between 0 and 100000000),
  wallet_status text not null default 'not_requested' check (
    wallet_status in (
      'not_requested', 'active', 'revocation_requested', 'revoked', 'failed'
    )
  ),
  wallet_metadata jsonb not null default '{}'::jsonb check (
    pg_catalog.jsonb_typeof(wallet_metadata) = 'object'
    and pg_catalog.octet_length(wallet_metadata::text) <= 8192
  ),
  wallet_updated_at timestamptz,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  constraint reward_issuances_source_unique unique (source_type, source_id),
  constraint reward_issuances_code_shape check (
    code is null or code ~
      '^(GAIN|CHASSE|FIDELITE|JACKPOT|EVENT|CADEAU|PARRAIN|QUIZ|PRONO)-[A-HJ-NP-Z2-9]{8}$'
  ),
  constraint reward_issuances_source_code_match check (
    code is null or case source_type
      when 'wheel' then code ~ '^GAIN-'
      when 'hunt' then code ~ '^CHASSE-'
      when 'loyalty' then code ~ '^FIDELITE-'
      when 'jackpot' then code ~ '^JACKPOT-'
      when 'event' then code ~ '^EVENT-'
      when 'calendar' then code ~ '^CADEAU-'
      when 'referral' then code ~ '^PARRAIN-'
      when 'quiz' then code ~ '^QUIZ-'
      when 'contest' then code ~ '^PRONO-'
      else false
    end
  ),
  constraint reward_issuances_expiry_order check (
    expires_at is null or expires_at >= issued_at
  ),
  constraint reward_issuances_terminal_state check (
    redeemed_at is null or cancelled_at is null
  ),
  constraint reward_issuances_redeemer_state check (
    redeemed_by is null or redeemed_at is not null
  ),
  constraint reward_issuances_cancellation_reason_state check (
    cancelled_reason is null or cancelled_at is not null
  ),
  constraint reward_issuances_basket_state check (
    basket_cents is null or redeemed_at is not null
  )
);

comment on table public.reward_issuances is
  'Registre interne progressif des codes de récompense. Les tables legacy restent autoritaires ; aucune décrémentation de stock n''est effectuée ici.';
comment on column public.reward_issuances.player_id is
  'Identité centrale pseudonyme si le pont legacy était déjà résolu à l''émission ; null sinon.';
comment on column public.reward_issuances.metadata is
  'Contexte non nominatif uniquement. Ne jamais y copier email, téléphone, prénom, token brut ou code secret.';

create unique index reward_issuances_org_code_unique
  on public.reward_issuances (organization_id, code)
  where code is not null;
create index reward_issuances_org_issued_idx
  on public.reward_issuances (organization_id, issued_at desc);
create index reward_issuances_org_active_code_idx
  on public.reward_issuances (organization_id, code)
  where code is not null and redeemed_at is null and cancelled_at is null;
create index reward_issuances_player_idx
  on public.reward_issuances (player_id, issued_at desc)
  where player_id is not null;
create index reward_issuances_experience_idx
  on public.reward_issuances
    (organization_id, source_type, experience_id, issued_at desc)
  where experience_id is not null;

alter table public.reward_issuances enable row level security;
revoke all on table public.reward_issuances
  from public, anon, authenticated, service_role;
grant select, insert, update, delete on table public.reward_issuances
  to service_role;

-- Résout seulement un pont pseudonyme déjà connu. L'absence de pont ne doit
-- jamais empêcher l'émission : player_id reste alors null.
create or replace function public.reward_player_from_legacy(
  p_organization_id uuid,
  p_experience_kind text,
  p_experience_id uuid,
  p_legacy_identity_hash text
)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select li.player_id
    from public.player_legacy_identities li
   where li.organization_id = p_organization_id
     and li.experience_kind = p_experience_kind
     and li.experience_id = p_experience_id
     and li.legacy_identity_hash = p_legacy_identity_hash
   limit 1
$$;

-- Upsert interne commun. Les champs wallet ne sont jamais écrasés par un
-- miroir actif ; une fin de cycle demande seulement une révocation asynchrone.
create or replace function public.upsert_reward_issuance(
  p_organization_id uuid,
  p_player_id uuid,
  p_source_type text,
  p_source_id uuid,
  p_experience_id uuid,
  p_reward_definition_id uuid,
  p_code text,
  p_label text,
  p_metadata jsonb,
  p_issued_at timestamptz,
  p_expires_at timestamptz,
  p_redeemed_at timestamptz,
  p_redeemed_by text,
  p_cancelled_at timestamptz,
  p_cancelled_reason text,
  p_basket_cents integer
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_terminal boolean := p_redeemed_at is not null or p_cancelled_at is not null;
begin
  insert into public.reward_issuances (
    organization_id, player_id, source_type, source_id,
    experience_id, reward_definition_id, code, label, metadata,
    issued_at, expires_at, redeemed_at, redeemed_by,
    cancelled_at, cancelled_reason, basket_cents,
    wallet_status, wallet_updated_at
  ) values (
    p_organization_id, p_player_id, p_source_type, p_source_id,
    p_experience_id, p_reward_definition_id,
    pg_catalog.upper(pg_catalog.btrim(p_code)),
    coalesce(p_label, ''), coalesce(p_metadata, '{}'::jsonb),
    p_issued_at, p_expires_at, p_redeemed_at, p_redeemed_by,
    p_cancelled_at, p_cancelled_reason, p_basket_cents,
    case when v_terminal then 'revocation_requested' else 'not_requested' end,
    case when v_terminal then pg_catalog.now() else null end
  )
  on conflict (source_type, source_id) do update set
    organization_id = excluded.organization_id,
    player_id = coalesce(excluded.player_id, reward_issuances.player_id),
    experience_id = excluded.experience_id,
    reward_definition_id = excluded.reward_definition_id,
    code = excluded.code,
    label = excluded.label,
    metadata = excluded.metadata,
    issued_at = excluded.issued_at,
    expires_at = excluded.expires_at,
    redeemed_at = excluded.redeemed_at,
    redeemed_by = case
      when excluded.redeemed_at is null then null
      else coalesce(excluded.redeemed_by, reward_issuances.redeemed_by)
    end,
    cancelled_at = excluded.cancelled_at,
    cancelled_reason = case
      when excluded.cancelled_at is null then null
      else coalesce(excluded.cancelled_reason, reward_issuances.cancelled_reason)
    end,
    basket_cents = case
      when excluded.redeemed_at is null then null
      else coalesce(excluded.basket_cents, reward_issuances.basket_cents)
    end,
    wallet_status = case
      when (
        excluded.redeemed_at is not null or excluded.cancelled_at is not null
      ) and reward_issuances.wallet_status in (
        'not_requested', 'active', 'failed'
      ) then 'revocation_requested'
      else reward_issuances.wallet_status
    end,
    wallet_updated_at = case
      when (
        excluded.redeemed_at is not null or excluded.cancelled_at is not null
      ) and reward_issuances.wallet_status in (
        'not_requested', 'active', 'failed'
      ) then pg_catalog.now()
      else reward_issuances.wallet_updated_at
    end,
    updated_at = pg_catalog.now();
end;
$$;

-- Le nom de table est une valeur de liste blanche, jamais du SQL dynamique.
-- Les deux tables calendrier partagent source_type='calendar' car leur RPC de
-- remise est déjà unifiée ; metadata.legacy_table conserve leur provenance.
create or replace function public.sync_reward_issuance(
  p_legacy_table text,
  p_source_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v record;
begin
  if p_legacy_table = 'participations' then
    select
      p.organization_id,
      public.reward_player_from_legacy(
        p.organization_id, 'campaign', p.campaign_id, p.player_key
      ) as player_id,
      'wheel'::text as source_type,
      p.campaign_id as experience_id,
      p.prize_id as reward_definition_id,
      p.redeem_code as code,
      coalesce(pr.label, '') as label,
      pg_catalog.jsonb_strip_nulls(pg_catalog.jsonb_build_object(
        'legacy_table', 'participations',
        'experience_label', c.name,
        'reward_details', pr.description
      )) as metadata,
      p.created_at as issued_at,
      p.redeem_expires_at as expires_at,
      p.redeemed_at,
      null::text as redeemed_by,
      p.cancelled_at,
      p.cancelled_reason,
      p.basket_cents
      into v
      from public.participations p
      join public.campaigns c on c.id = p.campaign_id
      left join public.prizes pr on pr.id = p.prize_id
     where p.id = p_source_id
       and p.redeem_code is not null;

  elsif p_legacy_table = 'hunt_completions' then
    select
      hc.organization_id,
      public.reward_player_from_legacy(
        hc.organization_id, 'hunt', hc.hunt_id, hp.token_hash
      ) as player_id,
      'hunt'::text as source_type,
      hc.hunt_id as experience_id,
      null::uuid as reward_definition_id,
      hc.code,
      coalesce(h.reward_label, '') as label,
      pg_catalog.jsonb_strip_nulls(pg_catalog.jsonb_build_object(
        'legacy_table', 'hunt_completions',
        'experience_label', h.name,
        'reward_details', h.reward_details
      )) as metadata,
      hc.completed_at as issued_at,
      null::timestamptz as expires_at,
      hc.redeemed_at,
      hc.redeemed_by,
      null::timestamptz as cancelled_at,
      null::text as cancelled_reason,
      null::integer as basket_cents
      into v
      from public.hunt_completions hc
      join public.hunt_players hp on hp.id = hc.player_id
      join public.hunts h on h.id = hc.hunt_id
     where hc.id = p_source_id;

  elsif p_legacy_table = 'loyalty_rewards' then
    select
      lr.organization_id,
      public.reward_player_from_legacy(
        lr.organization_id, 'loyalty', lr.program_id, lm.token_hash
      ) as player_id,
      'loyalty'::text as source_type,
      lr.program_id as experience_id,
      lr.milestone_id as reward_definition_id,
      lr.code,
      coalesce(ms.reward_label, '') as label,
      pg_catalog.jsonb_strip_nulls(pg_catalog.jsonb_build_object(
        'legacy_table', 'loyalty_rewards',
        'experience_label', lp.name,
        'reward_details', ms.reward_details,
        'visit_count', ms.visit_count
      )) as metadata,
      lr.earned_at as issued_at,
      null::timestamptz as expires_at,
      lr.redeemed_at,
      lr.redeemed_by,
      null::timestamptz as cancelled_at,
      null::text as cancelled_reason,
      null::integer as basket_cents
      into v
      from public.loyalty_rewards lr
      join public.loyalty_members lm on lm.id = lr.member_id
      join public.loyalty_programs lp on lp.id = lr.program_id
      join public.loyalty_milestones ms on ms.id = lr.milestone_id
     where lr.id = p_source_id
       and lr.reward_type = 'lot'
       and lr.code is not null;

  elsif p_legacy_table = 'jackpot_wins' then
    select
      jw.organization_id,
      public.reward_player_from_legacy(
        jw.organization_id, 'jackpot', jw.campaign_id, jw.winner_token_hash
      ) as player_id,
      'jackpot'::text as source_type,
      jw.campaign_id as experience_id,
      null::uuid as reward_definition_id,
      jw.code,
      coalesce(jc.reward_label, '') as label,
      pg_catalog.jsonb_strip_nulls(pg_catalog.jsonb_build_object(
        'legacy_table', 'jackpot_wins',
        'experience_label', jc.name,
        'reward_details', jc.reward_details,
        'cycle', jw.cycle
      )) as metadata,
      jw.drawn_at as issued_at,
      null::timestamptz as expires_at,
      jw.redeemed_at,
      jw.redeemed_by,
      null::timestamptz as cancelled_at,
      null::text as cancelled_reason,
      null::integer as basket_cents
      into v
      from public.jackpot_wins jw
      join public.jackpot_campaigns jc on jc.id = jw.campaign_id
     where jw.id = p_source_id;

  elsif p_legacy_table = 'event_wins' then
    select
      ew.organization_id,
      public.reward_player_from_legacy(
        ew.organization_id, 'event', ew.session_id, ew.winner_token_hash
      ) as player_id,
      'event'::text as source_type,
      ew.session_id as experience_id,
      null::uuid as reward_definition_id,
      ew.code,
      coalesce(es.reward_label, '') as label,
      pg_catalog.jsonb_strip_nulls(pg_catalog.jsonb_build_object(
        'legacy_table', 'event_wins',
        'experience_label', es.label,
        'reward_details', es.reward_details,
        'rank', ew.rank
      )) as metadata,
      ew.created_at as issued_at,
      null::timestamptz as expires_at,
      ew.redeemed_at,
      ew.redeemed_by,
      null::timestamptz as cancelled_at,
      null::text as cancelled_reason,
      null::integer as basket_cents
      into v
      from public.event_wins ew
      join public.event_sessions es on es.id = ew.session_id
     where ew.id = p_source_id;

  elsif p_legacy_table = 'calendar_openings' then
    select
      co.organization_id,
      public.reward_player_from_legacy(
        co.organization_id, 'calendar', co.calendar_id, cp.token_hash
      ) as player_id,
      'calendar'::text as source_type,
      co.calendar_id as experience_id,
      co.day_id as reward_definition_id,
      co.code,
      coalesce(cd.reward_label, '') as label,
      pg_catalog.jsonb_strip_nulls(pg_catalog.jsonb_build_object(
        'legacy_table', 'calendar_openings',
        'experience_label', c.name,
        'reward_details', cd.reward_details,
        'calendar_reward_source', 'day'
      )) as metadata,
      co.opened_at as issued_at,
      null::timestamptz as expires_at,
      co.redeemed_at,
      co.redeemed_by,
      null::timestamptz as cancelled_at,
      null::text as cancelled_reason,
      null::integer as basket_cents
      into v
      from public.calendar_openings co
      join public.calendar_players cp on cp.id = co.player_id
      join public.calendar_days cd on cd.id = co.day_id
      join public.calendars c on c.id = co.calendar_id
     where co.id = p_source_id
       and co.content_type = 'lot'
       and co.code is not null;

  elsif p_legacy_table = 'calendar_rewards' then
    select
      cr.organization_id,
      public.reward_player_from_legacy(
        cr.organization_id, 'calendar', cr.calendar_id, cp.token_hash
      ) as player_id,
      'calendar'::text as source_type,
      cr.calendar_id as experience_id,
      null::uuid as reward_definition_id,
      cr.code,
      coalesce(c.completion_reward_label, '') as label,
      pg_catalog.jsonb_strip_nulls(pg_catalog.jsonb_build_object(
        'legacy_table', 'calendar_rewards',
        'experience_label', c.name,
        'reward_details', c.completion_reward_details,
        'calendar_reward_source', 'completion'
      )) as metadata,
      cr.created_at as issued_at,
      null::timestamptz as expires_at,
      cr.redeemed_at,
      cr.redeemed_by,
      null::timestamptz as cancelled_at,
      null::text as cancelled_reason,
      null::integer as basket_cents
      into v
      from public.calendar_rewards cr
      join public.calendar_players cp on cp.id = cr.player_id
      join public.calendars c on c.id = cr.calendar_id
     where cr.id = p_source_id;

  elsif p_legacy_table = 'referral_rewards' then
    select
      rr.organization_id,
      public.reward_player_from_legacy(
        rr.organization_id,
        'referral',
        rp.id,
        case
          when rr.beneficiary = 'filleul' then rsu.filleul_key
          else rsp.sponsor_key
        end
      ) as player_id,
      'referral'::text as source_type,
      rp.id as experience_id,
      null::uuid as reward_definition_id,
      rr.code,
      coalesce(case rr.beneficiary
        when 'filleul' then rp.filleul_reward_label
        when 'chest' then rp.chest_reward_label
        else rp.sponsor_reward_label
      end, '') as label,
      pg_catalog.jsonb_strip_nulls(pg_catalog.jsonb_build_object(
        'legacy_table', 'referral_rewards',
        'experience_label', c.name,
        'reward_details', case rr.beneficiary
          when 'filleul' then rp.filleul_reward_details
          when 'chest' then rp.chest_reward_details
          else rp.sponsor_reward_details
        end,
        'beneficiary', rr.beneficiary
      )) as metadata,
      rr.created_at as issued_at,
      null::timestamptz as expires_at,
      rr.redeemed_at,
      rr.redeemed_by,
      null::timestamptz as cancelled_at,
      null::text as cancelled_reason,
      null::integer as basket_cents
      into v
      from public.referral_rewards rr
      join public.referral_programs rp on rp.campaign_id = rr.campaign_id
      join public.campaigns c on c.id = rr.campaign_id
      left join public.referral_sponsors rsp on rsp.id = rr.sponsor_id
      left join public.referral_signups rsu on rsu.id = rr.signup_id
     where rr.id = p_source_id
       and rr.kind = 'lot'
       and not rr.out_of_stock
       and rr.code is not null;

  elsif p_legacy_table = 'quiz_rewards' then
    select
      qr.organization_id,
      public.reward_player_from_legacy(
        qr.organization_id, 'quiz', qr.quiz_id, qp.token_hash
      ) as player_id,
      'quiz'::text as source_type,
      qr.quiz_id as experience_id,
      null::uuid as reward_definition_id,
      qr.code,
      coalesce(q.reward_label, '') as label,
      pg_catalog.jsonb_strip_nulls(pg_catalog.jsonb_build_object(
        'legacy_table', 'quiz_rewards',
        'experience_label', q.name,
        'reward_details', q.reward_details,
        'emission_source', qr.source,
        'rank', qr.rank
      )) as metadata,
      qr.created_at as issued_at,
      null::timestamptz as expires_at,
      qr.redeemed_at,
      qr.redeemed_by,
      null::timestamptz as cancelled_at,
      null::text as cancelled_reason,
      null::integer as basket_cents
      into v
      from public.quiz_rewards qr
      join public.quiz_players qp on qp.id = qr.player_id
      join public.quizzes q on q.id = qr.quiz_id
     where qr.id = p_source_id
       and not qr.out_of_stock
       and qr.code is not null;

  elsif p_legacy_table = 'contest_awards' then
    select
      ca.organization_id,
      public.reward_player_from_legacy(
        ca.organization_id, 'contest', ca.contest_id, cp.token_hash
      ) as player_id,
      'contest'::text as source_type,
      ca.contest_id as experience_id,
      null::uuid as reward_definition_id,
      ca.code,
      coalesce(ca.reward_label, '') as label,
      pg_catalog.jsonb_strip_nulls(pg_catalog.jsonb_build_object(
        'legacy_table', 'contest_awards',
        'experience_label', c.name,
        'rank', ca.rank
      )) as metadata,
      ca.created_at as issued_at,
      ca.redeem_expires_at as expires_at,
      ca.redeemed_at,
      ca.redeemed_by,
      case when ca.status = 'cancelled'
        then coalesce(ri.cancelled_at, pg_catalog.now())
        else null::timestamptz
      end as cancelled_at,
      null::text as cancelled_reason,
      ca.basket_cents
      into v
      from public.contest_awards ca
      join public.contests c on c.id = ca.contest_id
      left join public.contest_players cp on cp.id = ca.player_id
      left join public.reward_issuances ri
        on ri.source_type = 'contest' and ri.source_id = ca.id
     where ca.id = p_source_id;
  else
    raise exception 'unsupported reward legacy table'
      using errcode = '22023';
  end if;

  if not found then
    return;
  end if;

  perform public.upsert_reward_issuance(
    v.organization_id,
    v.player_id,
    v.source_type,
    p_source_id,
    v.experience_id,
    v.reward_definition_id,
    v.code,
    v.label,
    v.metadata,
    v.issued_at,
    v.expires_at,
    v.redeemed_at,
    v.redeemed_by,
    v.cancelled_at,
    v.cancelled_reason,
    v.basket_cents
  );
end;
$$;

create or replace function public.mirror_reward_issuance()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.sync_reward_issuance(tg_argv[0], new.id);
  return new;
end;
$$;

create trigger participations_reward_issuance
after insert or update on public.participations
for each row execute function public.mirror_reward_issuance('participations');
create trigger hunt_completions_reward_issuance
after insert or update on public.hunt_completions
for each row execute function public.mirror_reward_issuance('hunt_completions');
create trigger loyalty_rewards_reward_issuance
after insert or update on public.loyalty_rewards
for each row execute function public.mirror_reward_issuance('loyalty_rewards');
create trigger jackpot_wins_reward_issuance
after insert or update on public.jackpot_wins
for each row execute function public.mirror_reward_issuance('jackpot_wins');
create trigger event_wins_reward_issuance
after insert or update on public.event_wins
for each row execute function public.mirror_reward_issuance('event_wins');
create trigger calendar_openings_reward_issuance
after insert or update on public.calendar_openings
for each row execute function public.mirror_reward_issuance('calendar_openings');
create trigger calendar_rewards_reward_issuance
after insert or update on public.calendar_rewards
for each row execute function public.mirror_reward_issuance('calendar_rewards');
create trigger referral_rewards_reward_issuance
after insert or update on public.referral_rewards
for each row execute function public.mirror_reward_issuance('referral_rewards');
create trigger quiz_rewards_reward_issuance
after insert or update on public.quiz_rewards
for each row execute function public.mirror_reward_issuance('quiz_rewards');
create trigger contest_awards_reward_issuance
after insert or update on public.contest_awards
for each row execute function public.mirror_reward_issuance('contest_awards');

-- Remise universelle : ne verrouille jamais le registre avant la source legacy.
-- Toutes les voies prennent donc les verrous dans le même ordre :
-- ligne legacy -> trigger de miroir -> ligne reward_issuances.
create or replace function public.redeem_reward_by_code(
  p_organization_id uuid,
  p_code text,
  p_actor text,
  p_basket_cents integer default null
)
returns table (
  id uuid,
  source_type text,
  source_id uuid,
  code text,
  state text,
  redeemed_at timestamptz,
  redeemed_by text,
  expires_at timestamptz,
  cancelled_at timestamptz,
  basket_cents integer,
  wallet_status text,
  redeemed_now boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_code text;
  v_actor_id uuid;
  v_issue public.reward_issuances%rowtype;
  v_legacy_redeemed boolean;
  v_source_found boolean := false;
  v_state text;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if p_organization_id is null then
    raise exception 'organization required' using errcode = '22023';
  end if;
  if p_actor is null
     or p_actor <> pg_catalog.btrim(p_actor)
     or p_actor !~
       '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
  then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  v_actor_id := p_actor::uuid;
  if not exists (
    select 1
      from public.organization_members om
     where om.organization_id = p_organization_id
       and om.user_id = v_actor_id
       and om.role in ('owner', 'editor', 'cashier')
  ) then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if p_basket_cents is not null
     and p_basket_cents not between 0 and 100000000 then
    raise exception 'invalid basket' using errcode = '22023';
  end if;

  v_code := pg_catalog.upper(pg_catalog.btrim(coalesce(p_code, '')));
  if v_code !~
    '^(GAIN|CHASSE|FIDELITE|JACKPOT|EVENT|CADEAU|PARRAIN|QUIZ|PRONO)-[A-HJ-NP-Z2-9]{8}$'
  then
    return;
  end if;

  select ri.* into v_issue
    from public.reward_issuances ri
   where ri.organization_id = p_organization_id
     and ri.code = v_code;
  if not found then
    return;
  end if;

  if v_issue.redeemed_at is not null then
    v_state := 'already_redeemed';
  elsif v_issue.cancelled_at is not null then
    v_state := 'cancelled';
  elsif v_issue.expires_at is not null
        and v_issue.expires_at <= pg_catalog.now() then
    v_state := 'expired';
  else
    v_legacy_redeemed := null;
    if v_issue.source_type = 'wheel' then
      select r.redeemed_now into v_legacy_redeemed
        from public.redeem_by_code(
          p_organization_id, v_code, p_actor, p_basket_cents
        ) r limit 1;
    elsif v_issue.source_type = 'hunt' then
      select r.redeemed_now into v_legacy_redeemed
        from public.redeem_hunt_completion(
          p_organization_id, v_code, p_actor
        ) r limit 1;
    elsif v_issue.source_type = 'loyalty' then
      select r.redeemed_now into v_legacy_redeemed
        from public.redeem_loyalty_reward(
          p_organization_id, v_code, p_actor
        ) r limit 1;
    elsif v_issue.source_type = 'jackpot' then
      select r.redeemed_now into v_legacy_redeemed
        from public.redeem_jackpot_prize(
          p_organization_id, v_code, p_actor
        ) r limit 1;
    elsif v_issue.source_type = 'event' then
      select r.redeemed_now into v_legacy_redeemed
        from public.redeem_event_prize(
          p_organization_id, v_code, p_actor
        ) r limit 1;
    elsif v_issue.source_type = 'calendar' then
      select r.redeemed_now into v_legacy_redeemed
        from public.redeem_calendar_reward(
          p_organization_id, v_code, p_actor
        ) r limit 1;
    elsif v_issue.source_type = 'referral' then
      select r.redeemed_now into v_legacy_redeemed
        from public.redeem_referral_reward(
          p_organization_id, v_code, p_actor
        ) r limit 1;
    elsif v_issue.source_type = 'quiz' then
      select r.redeemed_now into v_legacy_redeemed
        from public.redeem_quiz_reward(
          p_organization_id, v_code, p_actor
        ) r limit 1;
    elsif v_issue.source_type = 'contest' then
      select r.redeemed_now into v_legacy_redeemed
        from public.redeem_contest_award(
          p_organization_id, v_code, p_actor, p_basket_cents
        ) r limit 1;
    end if;
    v_source_found := found;

    if coalesce(v_legacy_redeemed, false) then
      -- Le trigger legacy a déjà réconcilié redeemed_at. On complète l'acteur
      -- roue, le panier et l'état Wallet sans toucher à la source ni au stock.
      update public.reward_issuances ri
         set redeemed_by = p_actor,
             basket_cents = case
               when ri.source_type in ('wheel', 'contest')
                 then p_basket_cents
               else ri.basket_cents
             end,
             wallet_status = case
               when ri.wallet_status = 'revoked' then 'revoked'
               else 'revocation_requested'
             end,
             wallet_updated_at = pg_catalog.now(),
             updated_at = pg_catalog.now()
       where ri.id = v_issue.id;

      insert into public.audit_logs (organization_id, actor, action, metadata)
      values (
        p_organization_id,
        p_actor,
        'reward.redeem',
        pg_catalog.jsonb_build_object(
          'reward_issuance_id', v_issue.id,
          'source_type', v_issue.source_type,
          'source_id', v_issue.source_id,
          'basket_cents', case
            when v_issue.source_type in ('wheel', 'contest')
              then p_basket_cents
            else null
          end
        )
      );
      v_state := 'redeemed';
    elsif not v_source_found then
      v_state := 'source_missing';
    else
      -- Une écriture concurrente ou une décision legacy a pu gagner entre la
      -- prélecture du registre et l'UPDATE conditionnel. Le trigger de cette
      -- mutation (s'il y en a une) a déjà réconcilié le registre.
      select ri.* into v_issue
        from public.reward_issuances ri
       where ri.id = v_issue.id;
      if v_issue.redeemed_at is not null then
        v_state := 'already_redeemed';
      elsif v_issue.cancelled_at is not null then
        v_state := 'cancelled';
      elsif v_issue.expires_at is not null
            and v_issue.expires_at <= pg_catalog.now() then
        v_state := 'expired';
      else
        v_state := 'source_refused';
      end if;
    end if;
  end if;

  select ri.* into v_issue
    from public.reward_issuances ri
   where ri.id = v_issue.id;

  return query select
    v_issue.id,
    v_issue.source_type,
    v_issue.source_id,
    v_issue.code,
    v_state,
    v_issue.redeemed_at,
    v_issue.redeemed_by,
    v_issue.expires_at,
    v_issue.cancelled_at,
    v_issue.basket_cents,
    v_issue.wallet_status,
    (v_state = 'redeemed');
end;
$$;

comment on function public.redeem_reward_by_code(uuid, text, text, integer) is
  'Remise universelle service-role, org-scopée et concurrent-safe. Route vers la RPC legacy autoritaire, qui conserve seule les règles métier et le stock.';

revoke all on function public.reward_player_from_legacy(uuid, text, uuid, text)
  from public, anon, authenticated;
revoke all on function public.upsert_reward_issuance(
  uuid, uuid, text, uuid, uuid, uuid, text, text, jsonb,
  timestamptz, timestamptz, timestamptz, text,
  timestamptz, text, integer
) from public, anon, authenticated;
revoke all on function public.sync_reward_issuance(text, uuid)
  from public, anon, authenticated;
revoke all on function public.mirror_reward_issuance()
  from public, anon, authenticated;
revoke all on function public.redeem_reward_by_code(uuid, text, text, integer)
  from public, anon, authenticated;
grant execute on function public.redeem_reward_by_code(
  uuid, text, text, integer
) to service_role;
