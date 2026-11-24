-- ============================================================================
-- Remédiation audit GO / NO GO (2026-11-24)
--
-- 1. Les 5 RPC de tour offert (`consume_*_spin_grant`) respectent désormais le
--    budget réservé (`release_expired_spin_budget_reservations`, filtrage des
--    lots abordables, boucle de retry sur `campaign budget unavailable`).
-- 2. `consume_calendar_spin_grant` et `consume_quiz_spin_grant` vérifient le
--    statut `active` et la fenêtre `(starts_at, ends_at)` de la campagne cible.
-- 3. `cancel_participation` restitue `campaigns.budget_spent_cents` à partir de
--    `spins.budget_cost_cents`.
-- 4. `set_campaign_status` vérifie l'appartenance `(p_campaign_id,
--    p_organization_id)` AVANT d'appeler
--    `release_expired_spin_budget_reservations(p_campaign_id)`.
-- 5. `tirer_ticket_or` reboucle en cas de rupture concurrente de lot, utilise
--    `extensions.gen_random_bytes` et gère `unique_violation` sur le code.
-- 6. `accept_team_invitation` exige `email_confirmed_at is not null` et
--    `set search_path = ''`.
-- 7. Contrainte `wheels_secret_skill_finite_check` (NOT VALID) interdisant
--    `play_limit = 'unlimited'` sur `mystery_word`, `estimate` et `puzzle`.
-- ============================================================================

-- ── 1a. consume_loyalty_spin_grant ──────────────────────────────────────────

create or replace function public.consume_loyalty_spin_grant(
  p_program_id uuid,
  p_member_token_hash text,
  p_grant_token text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_reward public.loyalty_rewards%rowtype;
  v_now timestamptz := pg_catalog.now();
  v_wheel_id uuid;
  v_campaign_id uuid;
  v_org_id uuid;
  v_camp_status text;
  v_camp_starts timestamptz;
  v_camp_ends timestamptz;
  v_timezone text;
  v_sched_start smallint;
  v_sched_end smallint;
  v_sched_days smallint[];
  v_local timestamp;
  v_dow integer;
  v_hour integer;
  v_start integer;
  v_end integer;
  v_ref_day integer;
  v_in_window boolean;
  v_total bigint;
  v_pick bigint;
  v_prize record;
  v_spin_id uuid;
  v_random bytea;
  v_budget_attempt integer;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'not authorized';
  end if;
  if p_member_token_hash is null or p_member_token_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid member token';
  end if;

  select r.* into v_reward
    from public.loyalty_rewards r
    join public.loyalty_members m
      on m.id = r.member_id
     and m.program_id = r.program_id
     and m.organization_id = r.organization_id
   where r.program_id = p_program_id
     and r.reward_type = 'spin'
     and r.grant_token = pg_catalog.btrim(coalesce(p_grant_token, ''))
     and m.token_hash = p_member_token_hash
   for update of r;
  if not found then
    return pg_catalog.jsonb_build_object('state', 'unavailable');
  end if;
  if v_reward.consumed_at is not null then
    return pg_catalog.jsonb_build_object(
      'state', 'already_consumed', 'spin_id', v_reward.resulting_spin_id);
  end if;

  select ms.target_wheel_id into v_wheel_id
    from public.loyalty_milestones ms where ms.id = v_reward.milestone_id;

  select w.id, w.campaign_id, w.organization_id,
         w.schedule_start_hour, w.schedule_end_hour, w.schedule_days,
         o.timezone
    into v_wheel_id, v_campaign_id, v_org_id,
         v_sched_start, v_sched_end, v_sched_days,
         v_timezone
    from public.wheels w
    join public.campaigns c
      on c.id = w.campaign_id and c.organization_id = w.organization_id
    join public.organizations o on o.id = w.organization_id
   where w.id = v_wheel_id;
  if not found then
    return pg_catalog.jsonb_build_object('state', 'unavailable');
  end if;

  perform public.release_expired_spin_budget_reservations(v_campaign_id);

  select c.status, c.starts_at, c.ends_at
    into v_camp_status, v_camp_starts, v_camp_ends
    from public.campaigns c
   where c.id = v_campaign_id and c.organization_id = v_org_id;

  if v_camp_status is distinct from 'active'
     or (v_camp_starts is not null and v_camp_starts > v_now)
     or (v_camp_ends is not null and v_camp_ends < v_now) then
    return pg_catalog.jsonb_build_object('state', 'unavailable');
  end if;

  v_local := v_now at time zone v_timezone;
  v_dow := extract(dow from v_local)::integer;
  v_hour := extract(hour from v_local)::integer;
  if v_sched_start is null and v_sched_end is null then
    v_in_window := pg_catalog.array_length(v_sched_days, 1) is null
                   or v_dow = any(v_sched_days);
  else
    v_start := coalesce(v_sched_start, 0);
    v_end := coalesce(v_sched_end, 24);
    if v_start <= v_end then
      v_in_window := (pg_catalog.array_length(v_sched_days, 1) is null
                      or v_dow = any(v_sched_days))
                     and v_hour >= v_start and v_hour < v_end;
    else
      v_ref_day := case when v_hour < v_end then (v_dow + 6) % 7 else v_dow end;
      v_in_window := (pg_catalog.array_length(v_sched_days, 1) is null
                      or v_ref_day = any(v_sched_days))
                     and (v_hour >= v_start or v_hour < v_end);
    end if;
  end if;
  if not v_in_window then
    return pg_catalog.jsonb_build_object('state', 'unavailable');
  end if;

  for v_budget_attempt in 1..3 loop
    begin
      loop
        select coalesce(pg_catalog.sum(p.weight), 0)::bigint into v_total
          from public.prizes p
         where p.wheel_id = v_wheel_id
           and p.organization_id = v_org_id
           and p.is_active
           and p.weight > 0
           and (p.is_losing or p.stock > 0)
           and (
             p.is_losing
             or exists (
               select 1 from public.campaigns c
                where c.id = v_campaign_id
                  and c.organization_id = v_org_id
                  and (
                    c.budget_cents is null
                    or coalesce(p.cost_cents, 0)
                         <= greatest(
                              c.budget_cents
                              - c.budget_spent_cents
                              - c.budget_reserved_cents,
                              0
                            )
                  )
             )
           );
        if v_total <= 0 then
          return pg_catalog.jsonb_build_object('state', 'no_prize');
        end if;

        v_random := extensions.gen_random_bytes(4);
        v_pick := pg_catalog.mod(
          (pg_catalog.get_byte(v_random, 0)::bigint * 16777216
           + pg_catalog.get_byte(v_random, 1)::bigint * 65536
           + pg_catalog.get_byte(v_random, 2)::bigint * 256
           + pg_catalog.get_byte(v_random, 3)::bigint),
          v_total
        );
        select q.* into v_prize from (
          select p.*,
                 pg_catalog.sum(p.weight) over(order by p.position, p.created_at, p.id) as ceiling
            from public.prizes p
           where p.wheel_id = v_wheel_id
             and p.organization_id = v_org_id
             and p.is_active
             and p.weight > 0
             and (p.is_losing or p.stock > 0)
             and (
               p.is_losing
               or exists (
                 select 1 from public.campaigns c
                  where c.id = v_campaign_id
                    and c.organization_id = v_org_id
                    and (
                      c.budget_cents is null
                      or coalesce(p.cost_cents, 0)
                           <= greatest(
                                c.budget_cents
                                - c.budget_spent_cents
                                - c.budget_reserved_cents,
                                0
                              )
                    )
               )
             )
        ) q where q.ceiling > v_pick order by q.ceiling limit 1;

        if v_prize.is_losing then exit; end if;
        update public.prizes set stock = stock - 1
          where id = v_prize.id and stock > 0;
        if found then exit; end if;
      end loop;

      insert into public.spins(
        organization_id, campaign_id, wheel_id, prize_id, is_losing,
        player_key, engagement_action, source, play_window_key
      ) values (
        v_org_id, v_campaign_id, v_wheel_id,
        case when v_prize.is_losing then null else v_prize.id end,
        v_prize.is_losing, p_member_token_hash, null, 'loyalty', null
      ) returning id into v_spin_id;

      exit;
    exception when raise_exception then
      if SQLERRM <> 'campaign budget unavailable' then raise; end if;
    end;
  end loop;

  if v_spin_id is null then
    return pg_catalog.jsonb_build_object('state', 'no_prize');
  end if;

  update public.loyalty_rewards
     set consumed_at = v_now, resulting_spin_id = v_spin_id
   where id = v_reward.id;

  return pg_catalog.jsonb_build_object(
    'state', 'spun',
    'spin_id', v_spin_id,
    'wheel_id', v_wheel_id,
    'prize_id', case when v_prize.is_losing then null else v_prize.id end,
    'is_losing', v_prize.is_losing
  );
end;
$$;

revoke all on function public.consume_loyalty_spin_grant(uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.consume_loyalty_spin_grant(uuid, text, text)
  to service_role;

-- ── 1b. consume_referral_spin_grant ─────────────────────────────────────────

create or replace function public.consume_referral_spin_grant(
  p_campaign_id uuid,
  p_key text,
  p_grant_token text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_reward public.referral_rewards%rowtype;
  v_now timestamptz := pg_catalog.now();
  v_wheel_id uuid;
  v_org_id uuid;
  v_camp_status text;
  v_camp_starts timestamptz;
  v_camp_ends timestamptz;
  v_timezone text;
  v_local timestamp;
  v_dow integer;
  v_hour integer;
  v_start integer;
  v_end integer;
  v_ref_day integer;
  v_in_window boolean;
  v_candidate record;
  v_total bigint;
  v_pick bigint;
  v_prize record;
  v_spin_id uuid;
  v_random bytea;
  v_budget_attempt integer;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'not authorized';
  end if;
  if p_key is null or p_key !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid key';
  end if;

  select r.* into v_reward
    from public.referral_rewards r
    left join public.referral_sponsors sp
      on sp.id = r.sponsor_id and sp.organization_id = r.organization_id
    left join public.referral_signups sg
      on sg.id = r.signup_id and sg.organization_id = r.organization_id
   where r.campaign_id = p_campaign_id
     and r.kind = 'spin'
     and r.spin_grant_token = pg_catalog.btrim(coalesce(p_grant_token, ''))
     and (
       (r.beneficiary in ('sponsor', 'chest') and sp.sponsor_key = p_key)
       or (r.beneficiary = 'filleul' and sg.filleul_key = p_key)
     )
   for update of r;
  if not found then
    return pg_catalog.jsonb_build_object('state', 'unavailable');
  end if;
  if v_reward.grant_consumed_at is not null then
    return pg_catalog.jsonb_build_object(
      'state', 'already_consumed', 'spin_id', v_reward.resulting_spin_id);
  end if;

  select c.organization_id, o.timezone
    into v_org_id, v_timezone
    from public.campaigns c
    join public.organizations o on o.id = c.organization_id
   where c.id = p_campaign_id;
  if not found then
    return pg_catalog.jsonb_build_object('state', 'unavailable');
  end if;

  perform public.release_expired_spin_budget_reservations(p_campaign_id);

  select c.status, c.starts_at, c.ends_at
    into v_camp_status, v_camp_starts, v_camp_ends
    from public.campaigns c
   where c.id = p_campaign_id and c.organization_id = v_org_id;

  if v_camp_status is distinct from 'active'
     or (v_camp_starts is not null and v_camp_starts > v_now)
     or (v_camp_ends is not null and v_camp_ends < v_now) then
    return pg_catalog.jsonb_build_object('state', 'unavailable');
  end if;

  v_local := v_now at time zone v_timezone;
  v_dow := extract(dow from v_local)::integer;
  v_hour := extract(hour from v_local)::integer;

  for v_candidate in
    select w.id, w.schedule_start_hour, w.schedule_end_hour, w.schedule_days
      from public.wheels w
     where w.campaign_id = p_campaign_id
       and w.organization_id = v_org_id
     order by w.position, w.created_at, w.id
  loop
    if v_candidate.schedule_start_hour is null
       and v_candidate.schedule_end_hour is null then
      v_in_window := pg_catalog.array_length(v_candidate.schedule_days, 1) is null
                     or v_dow = any(v_candidate.schedule_days);
    else
      v_start := coalesce(v_candidate.schedule_start_hour, 0);
      v_end := coalesce(v_candidate.schedule_end_hour, 24);
      if v_start <= v_end then
        v_in_window := (pg_catalog.array_length(v_candidate.schedule_days, 1) is null
                        or v_dow = any(v_candidate.schedule_days))
                       and v_hour >= v_start and v_hour < v_end;
      else
        v_ref_day := case when v_hour < v_end then (v_dow + 6) % 7 else v_dow end;
        v_in_window := (pg_catalog.array_length(v_candidate.schedule_days, 1) is null
                        or v_ref_day = any(v_candidate.schedule_days))
                       and (v_hour >= v_start or v_hour < v_end);
      end if;
    end if;

    if v_in_window then
      v_wheel_id := v_candidate.id;
      exit;
    end if;
  end loop;

  if v_wheel_id is null then
    return pg_catalog.jsonb_build_object('state', 'unavailable');
  end if;

  for v_budget_attempt in 1..3 loop
    begin
      loop
        select coalesce(pg_catalog.sum(p.weight), 0)::bigint into v_total
          from public.prizes p
         where p.wheel_id = v_wheel_id
           and p.organization_id = v_org_id
           and p.is_active
           and p.weight > 0
           and (p.is_losing or p.stock > 0)
           and (
             p.is_losing
             or exists (
               select 1 from public.campaigns c
                where c.id = p_campaign_id
                  and c.organization_id = v_org_id
                  and (
                    c.budget_cents is null
                    or coalesce(p.cost_cents, 0)
                         <= greatest(
                              c.budget_cents
                              - c.budget_spent_cents
                              - c.budget_reserved_cents,
                              0
                            )
                  )
             )
           );
        if v_total <= 0 then
          return pg_catalog.jsonb_build_object('state', 'no_prize');
        end if;

        v_random := extensions.gen_random_bytes(4);
        v_pick := pg_catalog.mod(
          (pg_catalog.get_byte(v_random, 0)::bigint * 16777216
           + pg_catalog.get_byte(v_random, 1)::bigint * 65536
           + pg_catalog.get_byte(v_random, 2)::bigint * 256
           + pg_catalog.get_byte(v_random, 3)::bigint),
          v_total
        );
        select q.* into v_prize from (
          select p.*,
                 pg_catalog.sum(p.weight) over(order by p.position, p.created_at, p.id) as ceiling
            from public.prizes p
           where p.wheel_id = v_wheel_id
             and p.organization_id = v_org_id
             and p.is_active
             and p.weight > 0
             and (p.is_losing or p.stock > 0)
             and (
               p.is_losing
               or exists (
                 select 1 from public.campaigns c
                  where c.id = p_campaign_id
                    and c.organization_id = v_org_id
                    and (
                      c.budget_cents is null
                      or coalesce(p.cost_cents, 0)
                           <= greatest(
                                c.budget_cents
                                - c.budget_spent_cents
                                - c.budget_reserved_cents,
                                0
                              )
                    )
               )
             )
        ) q where q.ceiling > v_pick order by q.ceiling limit 1;

        if v_prize.is_losing then exit; end if;
        update public.prizes set stock = stock - 1
          where id = v_prize.id and stock > 0;
        if found then exit; end if;
      end loop;

      insert into public.spins(
        organization_id, campaign_id, wheel_id, prize_id, is_losing,
        player_key, engagement_action, source, play_window_key
      ) values (
        v_org_id, p_campaign_id, v_wheel_id,
        case when v_prize.is_losing then null else v_prize.id end,
        v_prize.is_losing, p_key, null, 'referral', null
      ) returning id into v_spin_id;

      exit;
    exception when raise_exception then
      if SQLERRM <> 'campaign budget unavailable' then raise; end if;
    end;
  end loop;

  if v_spin_id is null then
    return pg_catalog.jsonb_build_object('state', 'no_prize');
  end if;

  update public.referral_rewards
     set grant_consumed_at = v_now, resulting_spin_id = v_spin_id
   where id = v_reward.id;

  return pg_catalog.jsonb_build_object(
    'state', 'spun',
    'spin_id', v_spin_id,
    'wheel_id', v_wheel_id,
    'prize_id', case when v_prize.is_losing then null else v_prize.id end,
    'is_losing', v_prize.is_losing
  );
end;
$$;

revoke all on function public.consume_referral_spin_grant(uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.consume_referral_spin_grant(uuid, text, text)
  to service_role;

-- ── 1c. consume_reserver_wait_spin_grant ────────────────────────────────────

create or replace function public.consume_reserver_wait_spin_grant(
  p_session_id uuid,
  p_player_key_hash text,
  p_grant_token text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_session public.reservation_wait_sessions%rowtype;
  v_now timestamptz := pg_catalog.now();
  v_campaign_id uuid;
  v_wheel_id uuid;
  v_org_id uuid;
  v_camp_status text;
  v_camp_starts timestamptz;
  v_camp_ends timestamptz;
  v_timezone text;
  v_local timestamp;
  v_dow integer;
  v_hour integer;
  v_start integer;
  v_end integer;
  v_ref_day integer;
  v_in_window boolean;
  v_candidate record;
  v_total bigint;
  v_pick bigint;
  v_prize record;
  v_spin_id uuid;
  v_random bytea;
  v_budget_attempt integer;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if p_player_key_hash is null or p_player_key_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid player key' using errcode = '22023';
  end if;

  select s.* into v_session
    from public.reservation_wait_sessions s
   where s.id = p_session_id
     and s.pause_spin_grant_token = pg_catalog.btrim(coalesce(p_grant_token, ''))
     and s.player_key_hash = p_player_key_hash
     and s.player_key_hash not like 'purge:%'
   for update of s;

  if not found
     or not public.org_has_module_access(v_session.organization_id, 'vitrine')
  then
    return pg_catalog.jsonb_build_object('state', 'unavailable');
  end if;
  if v_session.pause_spin_consumed_at is not null then
    return pg_catalog.jsonb_build_object(
      'state', 'already_consumed', 'spin_id', v_session.pause_resulting_spin_id);
  end if;

  if v_session.queue_entry_id is not null then
    select q.wait_pause_campaign_id into v_campaign_id
      from public.reservation_queue_entries e
      join public.reservation_queues q
        on q.id = e.queue_id and q.organization_id = e.organization_id
     where e.id = v_session.queue_entry_id
       and e.organization_id = v_session.organization_id;
  else
    select a.wait_pause_campaign_id into v_campaign_id
      from public.reservations r
      join public.reservation_slots s2
        on s2.id = r.slot_id and s2.organization_id = r.organization_id
      join public.reservation_activities a
        on a.id = s2.activity_id and a.organization_id = s2.organization_id
     where r.id = v_session.reservation_id
       and r.organization_id = v_session.organization_id;
  end if;
  if v_campaign_id is null then
    return pg_catalog.jsonb_build_object('state', 'unavailable');
  end if;

  select c.organization_id, o.timezone
    into v_org_id, v_timezone
    from public.campaigns c
    join public.organizations o on o.id = c.organization_id
   where c.id = v_campaign_id
     and c.organization_id = v_session.organization_id;
  if not found then
    return pg_catalog.jsonb_build_object('state', 'unavailable');
  end if;

  perform public.release_expired_spin_budget_reservations(v_campaign_id);

  select c.status, c.starts_at, c.ends_at
    into v_camp_status, v_camp_starts, v_camp_ends
    from public.campaigns c
   where c.id = v_campaign_id and c.organization_id = v_org_id;

  if v_camp_status is distinct from 'active'
     or (v_camp_starts is not null and v_camp_starts > v_now)
     or (v_camp_ends is not null and v_camp_ends < v_now) then
    return pg_catalog.jsonb_build_object('state', 'unavailable');
  end if;

  v_local := v_now at time zone v_timezone;
  v_dow := extract(dow from v_local)::integer;
  v_hour := extract(hour from v_local)::integer;

  for v_candidate in
    select w.id, w.schedule_start_hour, w.schedule_end_hour, w.schedule_days
      from public.wheels w
     where w.campaign_id = v_campaign_id
       and w.organization_id = v_org_id
     order by w.position, w.created_at, w.id
  loop
    if v_candidate.schedule_start_hour is null
       and v_candidate.schedule_end_hour is null then
      v_in_window := pg_catalog.array_length(v_candidate.schedule_days, 1) is null
                     or v_dow = any(v_candidate.schedule_days);
    else
      v_start := coalesce(v_candidate.schedule_start_hour, 0);
      v_end := coalesce(v_candidate.schedule_end_hour, 24);
      if v_start <= v_end then
        v_in_window := (pg_catalog.array_length(v_candidate.schedule_days, 1) is null
                        or v_dow = any(v_candidate.schedule_days))
                       and v_hour >= v_start and v_hour < v_end;
      else
        v_ref_day := case when v_hour < v_end then (v_dow + 6) % 7 else v_dow end;
        v_in_window := (pg_catalog.array_length(v_candidate.schedule_days, 1) is null
                        or v_ref_day = any(v_candidate.schedule_days))
                       and (v_hour >= v_start or v_hour < v_end);
      end if;
    end if;

    if v_in_window then
      v_wheel_id := v_candidate.id;
      exit;
    end if;
  end loop;

  if v_wheel_id is null then
    return pg_catalog.jsonb_build_object('state', 'unavailable');
  end if;

  for v_budget_attempt in 1..3 loop
    begin
      loop
        select coalesce(pg_catalog.sum(p.weight), 0)::bigint into v_total
          from public.prizes p
         where p.wheel_id = v_wheel_id
           and p.organization_id = v_org_id
           and p.is_active
           and p.weight > 0
           and (p.is_losing or p.stock > 0)
           and (
             p.is_losing
             or exists (
               select 1 from public.campaigns c
                where c.id = v_campaign_id
                  and c.organization_id = v_org_id
                  and (
                    c.budget_cents is null
                    or coalesce(p.cost_cents, 0)
                         <= greatest(
                              c.budget_cents
                              - c.budget_spent_cents
                              - c.budget_reserved_cents,
                              0
                            )
                  )
             )
           );
        if v_total <= 0 then
          return pg_catalog.jsonb_build_object('state', 'no_prize');
        end if;

        v_random := extensions.gen_random_bytes(4);
        v_pick := pg_catalog.mod(
          (pg_catalog.get_byte(v_random, 0)::bigint * 16777216
           + pg_catalog.get_byte(v_random, 1)::bigint * 65536
           + pg_catalog.get_byte(v_random, 2)::bigint * 256
           + pg_catalog.get_byte(v_random, 3)::bigint),
          v_total
        );
        select q.* into v_prize from (
          select p.*,
                 pg_catalog.sum(p.weight) over(order by p.position, p.created_at, p.id) as ceiling
            from public.prizes p
           where p.wheel_id = v_wheel_id
             and p.organization_id = v_org_id
             and p.is_active
             and p.weight > 0
             and (p.is_losing or p.stock > 0)
             and (
               p.is_losing
               or exists (
                 select 1 from public.campaigns c
                  where c.id = v_campaign_id
                    and c.organization_id = v_org_id
                    and (
                      c.budget_cents is null
                      or coalesce(p.cost_cents, 0)
                           <= greatest(
                                c.budget_cents
                                - c.budget_spent_cents
                                - c.budget_reserved_cents,
                                0
                              )
                    )
               )
             )
        ) q where q.ceiling > v_pick order by q.ceiling limit 1;

        if v_prize.is_losing then exit; end if;
        update public.prizes set stock = stock - 1
          where id = v_prize.id and stock > 0;
        if found then exit; end if;
      end loop;

      insert into public.spins(
        organization_id, campaign_id, wheel_id, prize_id, is_losing,
        player_key, engagement_action, source, play_window_key
      ) values (
        v_org_id, v_campaign_id, v_wheel_id,
        case when v_prize.is_losing then null else v_prize.id end,
        v_prize.is_losing, p_player_key_hash, null, 'reserver_wait', null
      ) returning id into v_spin_id;

      exit;
    exception when raise_exception then
      if SQLERRM <> 'campaign budget unavailable' then raise; end if;
    end;
  end loop;

  if v_spin_id is null then
    return pg_catalog.jsonb_build_object('state', 'no_prize');
  end if;

  update public.reservation_wait_sessions
     set pause_spin_consumed_at = v_now, pause_resulting_spin_id = v_spin_id
   where id = v_session.id;

  return pg_catalog.jsonb_build_object(
    'state', 'spun',
    'spin_id', v_spin_id,
    'wheel_id', v_wheel_id,
    'campaign_id', v_campaign_id,
    'prize_id', case when v_prize.is_losing then null else v_prize.id end,
    'is_losing', v_prize.is_losing
  );
end;
$$;

revoke all on function public.consume_reserver_wait_spin_grant(uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.consume_reserver_wait_spin_grant(uuid, text, text)
  to service_role;

-- ── 1d & 2a. consume_calendar_spin_grant ────────────────────────────────────

create or replace function public.consume_calendar_spin_grant(
  p_calendar_id uuid,
  p_player_token_hash text,
  p_grant_token text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_open public.calendar_openings%rowtype;
  v_now timestamptz := pg_catalog.now();
  v_wheel_id uuid;
  v_campaign_id uuid;
  v_org_id uuid;
  v_camp_status text;
  v_camp_starts timestamptz;
  v_camp_ends timestamptz;
  v_total bigint;
  v_pick bigint;
  v_prize record;
  v_spin_id uuid;
  v_random bytea;
  v_budget_attempt integer;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'not authorized';
  end if;
  if p_player_token_hash is null or p_player_token_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid player token';
  end if;

  select o.* into v_open
    from public.calendar_openings o
    join public.calendar_players p
      on p.id = o.player_id
     and p.calendar_id = o.calendar_id
     and p.organization_id = o.organization_id
   where o.calendar_id = p_calendar_id
     and o.content_type = 'spin'
     and o.spin_grant_token = pg_catalog.btrim(coalesce(p_grant_token, ''))
     and p.token_hash = p_player_token_hash
   for update of o;
  if not found then
    return pg_catalog.jsonb_build_object('state', 'unavailable');
  end if;
  if v_open.consumed_at is not null then
    return pg_catalog.jsonb_build_object(
      'state', 'already_consumed', 'spin_id', v_open.resulting_spin_id);
  end if;

  select d.target_wheel_id into v_wheel_id
    from public.calendar_days d where d.id = v_open.day_id;
  select w.id, w.campaign_id, w.organization_id
    into v_wheel_id, v_campaign_id, v_org_id
    from public.wheels w
    join public.campaigns c
      on c.id = w.campaign_id and c.organization_id = w.organization_id
   where w.id = v_wheel_id;
  if not found then
    return pg_catalog.jsonb_build_object('state', 'unavailable');
  end if;

  perform public.release_expired_spin_budget_reservations(v_campaign_id);

  select c.status, c.starts_at, c.ends_at
    into v_camp_status, v_camp_starts, v_camp_ends
    from public.campaigns c
   where c.id = v_campaign_id and c.organization_id = v_org_id;

  if v_camp_status is distinct from 'active'
     or (v_camp_starts is not null and v_camp_starts > v_now)
     or (v_camp_ends is not null and v_camp_ends < v_now) then
    return pg_catalog.jsonb_build_object('state', 'unavailable');
  end if;

  for v_budget_attempt in 1..3 loop
    begin
      loop
        select coalesce(pg_catalog.sum(p.weight), 0)::bigint into v_total
          from public.prizes p
         where p.wheel_id = v_wheel_id
           and p.organization_id = v_org_id
           and p.is_active
           and p.weight > 0
           and (p.is_losing or p.stock > 0)
           and (
             p.is_losing
             or exists (
               select 1 from public.campaigns c
                where c.id = v_campaign_id
                  and c.organization_id = v_org_id
                  and (
                    c.budget_cents is null
                    or coalesce(p.cost_cents, 0)
                         <= greatest(
                              c.budget_cents
                              - c.budget_spent_cents
                              - c.budget_reserved_cents,
                              0
                            )
                  )
             )
           );
        if v_total <= 0 then
          return pg_catalog.jsonb_build_object('state', 'no_prize');
        end if;

        v_random := extensions.gen_random_bytes(4);
        v_pick := pg_catalog.mod(
          (pg_catalog.get_byte(v_random, 0)::bigint * 16777216
           + pg_catalog.get_byte(v_random, 1)::bigint * 65536
           + pg_catalog.get_byte(v_random, 2)::bigint * 256
           + pg_catalog.get_byte(v_random, 3)::bigint),
          v_total
        );
        select q.* into v_prize from (
          select p.*,
                 pg_catalog.sum(p.weight) over(order by p.position, p.created_at, p.id) as ceiling
            from public.prizes p
           where p.wheel_id = v_wheel_id
             and p.organization_id = v_org_id
             and p.is_active
             and p.weight > 0
             and (p.is_losing or p.stock > 0)
             and (
               p.is_losing
               or exists (
                 select 1 from public.campaigns c
                  where c.id = v_campaign_id
                    and c.organization_id = v_org_id
                    and (
                      c.budget_cents is null
                      or coalesce(p.cost_cents, 0)
                           <= greatest(
                                c.budget_cents
                                - c.budget_spent_cents
                                - c.budget_reserved_cents,
                                0
                              )
                    )
               )
             )
        ) q where q.ceiling > v_pick order by q.ceiling limit 1;

        if v_prize.is_losing then exit; end if;
        update public.prizes set stock = stock - 1
          where id = v_prize.id and stock > 0;
        if found then exit; end if;
      end loop;

      insert into public.spins(
        organization_id, campaign_id, wheel_id, prize_id, is_losing,
        player_key, engagement_action, source, play_window_key
      ) values (
        v_org_id, v_campaign_id, v_wheel_id,
        case when v_prize.is_losing then null else v_prize.id end,
        v_prize.is_losing, p_player_token_hash, null, 'calendar', null
      ) returning id into v_spin_id;

      exit;
    exception when raise_exception then
      if SQLERRM <> 'campaign budget unavailable' then raise; end if;
    end;
  end loop;

  if v_spin_id is null then
    return pg_catalog.jsonb_build_object('state', 'no_prize');
  end if;

  update public.calendar_openings
     set consumed_at = v_now, resulting_spin_id = v_spin_id
   where id = v_open.id;

  return pg_catalog.jsonb_build_object(
    'state', 'spun',
    'spin_id', v_spin_id,
    'wheel_id', v_wheel_id,
    'prize_id', case when v_prize.is_losing then null else v_prize.id end,
    'is_losing', v_prize.is_losing
  );
end;
$$;

revoke all on function public.consume_calendar_spin_grant(uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.consume_calendar_spin_grant(uuid, text, text)
  to service_role;

-- ── 1e & 2b. consume_quiz_spin_grant ────────────────────────────────────────

create or replace function public.consume_quiz_spin_grant(
  p_quiz_id uuid,
  p_player_token_hash text,
  p_grant_token text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_reward public.quiz_rewards%rowtype;
  v_now timestamptz := pg_catalog.now();
  v_wheel_id uuid;
  v_campaign_id uuid;
  v_org_id uuid;
  v_camp_status text;
  v_camp_starts timestamptz;
  v_camp_ends timestamptz;
  v_total bigint;
  v_pick bigint;
  v_prize record;
  v_spin_id uuid;
  v_random bytea;
  v_budget_attempt integer;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'not authorized';
  end if;
  if p_player_token_hash is null or p_player_token_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid player token';
  end if;

  select r.* into v_reward
    from public.quiz_rewards r
    join public.quiz_players p
      on p.id = r.player_id
     and p.quiz_id = r.quiz_id
     and p.organization_id = r.organization_id
   where r.quiz_id = p_quiz_id
     and r.spin_grant_token = pg_catalog.btrim(coalesce(p_grant_token, ''))
     and p.token_hash = p_player_token_hash
   for update of r;
  if not found then
    return pg_catalog.jsonb_build_object('state', 'unavailable');
  end if;
  if v_reward.consumed_at is not null then
    return pg_catalog.jsonb_build_object(
      'state', 'already_consumed', 'spin_id', v_reward.resulting_spin_id);
  end if;

  select q.target_wheel_id into v_wheel_id
    from public.quizzes q where q.id = v_reward.quiz_id;
  select w.id, w.campaign_id, w.organization_id
    into v_wheel_id, v_campaign_id, v_org_id
    from public.wheels w
    join public.campaigns c
      on c.id = w.campaign_id and c.organization_id = w.organization_id
   where w.id = v_wheel_id;
  if not found then
    return pg_catalog.jsonb_build_object('state', 'unavailable');
  end if;

  perform public.release_expired_spin_budget_reservations(v_campaign_id);

  select c.status, c.starts_at, c.ends_at
    into v_camp_status, v_camp_starts, v_camp_ends
    from public.campaigns c
   where c.id = v_campaign_id and c.organization_id = v_org_id;

  if v_camp_status is distinct from 'active'
     or (v_camp_starts is not null and v_camp_starts > v_now)
     or (v_camp_ends is not null and v_camp_ends < v_now) then
    return pg_catalog.jsonb_build_object('state', 'unavailable');
  end if;

  for v_budget_attempt in 1..3 loop
    begin
      loop
        select coalesce(pg_catalog.sum(p.weight), 0)::bigint into v_total
          from public.prizes p
         where p.wheel_id = v_wheel_id
           and p.organization_id = v_org_id
           and p.is_active
           and p.weight > 0
           and (p.is_losing or p.stock > 0)
           and (
             p.is_losing
             or exists (
               select 1 from public.campaigns c
                where c.id = v_campaign_id
                  and c.organization_id = v_org_id
                  and (
                    c.budget_cents is null
                    or coalesce(p.cost_cents, 0)
                         <= greatest(
                              c.budget_cents
                              - c.budget_spent_cents
                              - c.budget_reserved_cents,
                              0
                            )
                  )
             )
           );
        if v_total <= 0 then
          return pg_catalog.jsonb_build_object('state', 'no_prize');
        end if;

        v_random := extensions.gen_random_bytes(4);
        v_pick := pg_catalog.mod(
          (pg_catalog.get_byte(v_random, 0)::bigint * 16777216
           + pg_catalog.get_byte(v_random, 1)::bigint * 65536
           + pg_catalog.get_byte(v_random, 2)::bigint * 256
           + pg_catalog.get_byte(v_random, 3)::bigint),
          v_total
        );
        select q.* into v_prize from (
          select p.*,
                 pg_catalog.sum(p.weight) over(order by p.position, p.created_at, p.id) as ceiling
            from public.prizes p
           where p.wheel_id = v_wheel_id
             and p.organization_id = v_org_id
             and p.is_active
             and p.weight > 0
             and (p.is_losing or p.stock > 0)
             and (
               p.is_losing
               or exists (
                 select 1 from public.campaigns c
                  where c.id = v_campaign_id
                    and c.organization_id = v_org_id
                    and (
                      c.budget_cents is null
                      or coalesce(p.cost_cents, 0)
                           <= greatest(
                                c.budget_cents
                                - c.budget_spent_cents
                                - c.budget_reserved_cents,
                                0
                              )
                    )
               )
             )
        ) q where q.ceiling > v_pick order by q.ceiling limit 1;

        if v_prize.is_losing then exit; end if;
        update public.prizes set stock = stock - 1
          where id = v_prize.id and stock > 0;
        if found then exit; end if;
      end loop;

      insert into public.spins(
        organization_id, campaign_id, wheel_id, prize_id, is_losing,
        player_key, engagement_action, source, play_window_key
      ) values (
        v_org_id, v_campaign_id, v_wheel_id,
        case when v_prize.is_losing then null else v_prize.id end,
        v_prize.is_losing, p_player_token_hash, null, 'quiz', null
      ) returning id into v_spin_id;

      exit;
    exception when raise_exception then
      if SQLERRM <> 'campaign budget unavailable' then raise; end if;
    end;
  end loop;

  if v_spin_id is null then
    return pg_catalog.jsonb_build_object('state', 'no_prize');
  end if;

  update public.quiz_rewards
     set consumed_at = v_now, resulting_spin_id = v_spin_id
   where id = v_reward.id;

  return pg_catalog.jsonb_build_object(
    'state', 'spun',
    'spin_id', v_spin_id,
    'wheel_id', v_wheel_id,
    'prize_id', case when v_prize.is_losing then null else v_prize.id end,
    'is_losing', v_prize.is_losing
  );
end;
$$;

revoke all on function public.consume_quiz_spin_grant(uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.consume_quiz_spin_grant(uuid, text, text)
  to service_role;

-- ── 3. cancel_participation : remboursement de budget_spent_cents ───────────

create or replace function public.cancel_participation(
  p_organization_id uuid,
  p_participation_id uuid,
  p_reason text,
  p_restock boolean default true
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_prize uuid;
  v_spin_id uuid;
  v_campaign_id uuid;
  v_budget_cost integer := 0;
begin
  if not (
    coalesce(auth.role(), '') = 'service_role'
    or public.is_org_editor(p_organization_id)
  ) then
    raise exception 'not authorized';
  end if;
  if p_reason is null or pg_catalog.char_length(pg_catalog.btrim(p_reason)) < 5 then
    raise exception 'reason required';
  end if;

  update public.participations p
     set cancelled_at = pg_catalog.now(),
         cancelled_reason = pg_catalog.btrim(p_reason)
   where p.id = p_participation_id
     and p.organization_id = p_organization_id
     and p.redeemed_at is null
     and p.cancelled_at is null
  returning p.prize_id, p.spin_id, p.campaign_id
    into v_prize, v_spin_id, v_campaign_id;
  if not found then return false; end if;

  -- Le lot repart en stock (comptages null = illimité, intouchés).
  if p_restock and v_prize is not null then
    update public.prizes
       set stock = stock + 1
     where id = v_prize
       and organization_id = p_organization_id
       and stock is not null;
  end if;

  -- Restitue le coût engagé sur `campaigns.budget_spent_cents` lorsque le spin
  -- associé avait comptabilisé un coût budgétaire.
  if v_spin_id is not null and v_campaign_id is not null then
    select coalesce(s.budget_cost_cents, 0)
      into v_budget_cost
      from public.spins s
     where s.id = v_spin_id
       and s.organization_id = p_organization_id;

    if coalesce(v_budget_cost, 0) > 0 then
      update public.campaigns
         set budget_spent_cents = greatest(budget_spent_cents - v_budget_cost, 0)
       where id = v_campaign_id
         and organization_id = p_organization_id;
    end if;
  end if;

  insert into public.audit_logs(organization_id, actor, action, metadata)
  values (
    p_organization_id,
    coalesce(auth.uid()::text, auth.role(), 'system'),
    'participation.cancel',
    pg_catalog.jsonb_build_object(
      'participation_id', p_participation_id,
      'reason', pg_catalog.btrim(p_reason),
      'restocked', p_restock and v_prize is not null,
      'budget_refunded_cents', coalesce(v_budget_cost, 0)
    )
  );
  return true;
end;
$$;

revoke all on function public.cancel_participation(uuid,uuid,text,boolean)
  from public, anon;
grant execute on function public.cancel_participation(uuid,uuid,text,boolean)
  to authenticated, service_role;

-- ── 4. set_campaign_status : contrôle tenant AVANT libération budget ────────

create or replace function public.set_campaign_status(
  p_organization_id uuid,
  p_campaign_id uuid,
  p_status text,
  p_reason text default null
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_current text;
  v_auto_avant boolean := false;
  v_desarme boolean := false;
begin
  if coalesce(auth.role(), '') <> 'service_role'
     and not public.is_org_editor(p_organization_id) then
    raise exception 'not authorized';
  end if;
  if p_status not in ('draft', 'active', 'paused', 'archived') then
    raise exception 'invalid status';
  end if;

  -- Vérification et verrouillage d'appartenance AVANT toute écriture sur
  -- p_campaign_id (aucune libération inter-tenant sur UUID deviné).
  select c.status, c.auto_schedule into v_current, v_auto_avant
    from public.campaigns c
   where c.id = p_campaign_id and c.organization_id = p_organization_id
   for update;
  if not found then return false; end if;

  perform public.release_expired_spin_budget_reservations(p_campaign_id);

  select c.status, c.auto_schedule into v_current, v_auto_avant
    from public.campaigns c
   where c.id = p_campaign_id and c.organization_id = p_organization_id;

  if v_current = p_status then return true; end if;
  if v_current = 'archived' and p_status = 'active' then
    raise exception 'invalid transition';
  end if;

  if p_status = 'active' then
    perform public.assert_module_publish_allowed(p_organization_id, 'wheel');
    if public.campaign_has_winning_prize(p_organization_id, p_campaign_id)
       and not public.campaign_has_affordable_winning_prize(
         p_organization_id, p_campaign_id
       ) then
      raise exception 'campaign budget unavailable';
    end if;
  end if;

  v_desarme := v_auto_avant and p_status in ('paused', 'draft', 'archived');

  update public.campaigns
     set status = p_status,
         paused_reason = case
           when p_status in ('active', 'draft', 'archived') then null
           else paused_reason
         end,
         auto_schedule = case when v_desarme then false else auto_schedule end
   where id = p_campaign_id and organization_id = p_organization_id;

  insert into public.audit_logs(organization_id, actor, action, metadata)
  values (
    p_organization_id,
    coalesce(auth.uid()::text, auth.role(), 'system'),
    'campaign.status.update',
    pg_catalog.jsonb_build_object(
      'campaign_id', p_campaign_id,
      'previous', v_current,
      'next', p_status,
      'reason', nullif(pg_catalog.btrim(coalesce(p_reason, '')), ''),
      'auto_schedule_disarmed', v_desarme
    )
  );
  return true;
end;
$$;

revoke all on function public.set_campaign_status(uuid, uuid, text, text)
  from public, anon;
grant execute on function public.set_campaign_status(uuid, uuid, text, text)
  to authenticated, service_role;

-- ── 5. tirer_ticket_or : retry rupture lot, CSPRNG & unique_violation ───────

create or replace function public.tirer_ticket_or(
  p_code text,
  p_nonce text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_ticket public.tickets_or;
  v_lot public.tickets_or_lots;
  v_total bigint;
  v_tirage bigint;
  v_cumul bigint;
  v_issuance uuid;
  v_redeem text;
  v_essai integer := 0;
  v_expire timestamptz;
  v_nonce_normalise text;
  v_nonce_hash bytea;
  v_replay_lot text;
  v_replay_code text;
  v_replay_expire timestamptz;
  v_rand_draw bytea;
  v_rand_code bytea;
  v_i integer;
  v_alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
begin
  if p_code is null or p_code !~ '^[A-HJ-NP-Z2-9]{10}$' then
    return pg_catalog.jsonb_build_object('state', 'introuvable');
  end if;

  v_nonce_normalise := pg_catalog.lower(pg_catalog.btrim(coalesce(p_nonce, '')));
  if v_nonce_normalise !~
     '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
    return pg_catalog.jsonb_build_object('state', 'introuvable');
  end if;
  v_nonce_hash := extensions.digest(v_nonce_normalise, 'sha256');

  select * into v_ticket
    from public.tickets_or
   where code = p_code
   for update;

  if v_ticket.id is null then
    return pg_catalog.jsonb_build_object('state', 'introuvable');
  end if;
  if v_ticket.tire_le is not null then
    if v_ticket.tirage_nonce_hash is not null
       and v_ticket.tirage_nonce_hash = v_nonce_hash then
      select ri.label, ri.code, ri.expires_at
        into v_replay_lot, v_replay_code, v_replay_expire
        from public.reward_issuances ri
       where ri.id = v_ticket.reward_issuance_id
         and ri.organization_id = v_ticket.organization_id
         and ri.source_type = 'ticket_or'
         and ri.source_id = v_ticket.id;

      if found and v_replay_code is not null then
        return pg_catalog.jsonb_build_object(
          'state', 'ok',
          'lot', v_replay_lot,
          'code_retrait', v_replay_code,
          'expire_le', v_replay_expire
        );
      end if;
    end if;
    if not public.org_has_module_access(v_ticket.organization_id, 'wheel') then
      return pg_catalog.jsonb_build_object('state', 'introuvable');
    end if;
    return pg_catalog.jsonb_build_object('state', 'deja_tire');
  end if;

  if not public.org_has_module_access(v_ticket.organization_id, 'wheel') then
    return pg_catalog.jsonb_build_object('state', 'introuvable');
  end if;

  if v_ticket.expire_le <= pg_catalog.now() then
    return pg_catalog.jsonb_build_object('state', 'expire');
  end if;

  -- Tirage pondéré CSPRNG avec boucle de reprise si un autre tirage vide le
  -- dernier exemplaire d'un lot pendant la lecture.
  loop
    select coalesce(pg_catalog.sum(poids), 0)::bigint into v_total
      from public.tickets_or_lots
     where organization_id = v_ticket.organization_id
       and actif and poids > 0 and (stock is null or stock > 0);

    if v_total <= 0 then
      return pg_catalog.jsonb_build_object('state', 'sans_lot');
    end if;

    v_rand_draw := extensions.gen_random_bytes(4);
    v_tirage := 1 + pg_catalog.mod(
      (pg_catalog.get_byte(v_rand_draw, 0)::bigint * 16777216
       + pg_catalog.get_byte(v_rand_draw, 1)::bigint * 65536
       + pg_catalog.get_byte(v_rand_draw, 2)::bigint * 256
       + pg_catalog.get_byte(v_rand_draw, 3)::bigint),
      v_total
    );

    v_cumul := 0;
    for v_lot in
      select * from public.tickets_or_lots
       where organization_id = v_ticket.organization_id
         and actif and poids > 0 and (stock is null or stock > 0)
       order by ordre, id
    loop
      v_cumul := v_cumul + v_lot.poids;
      exit when v_cumul >= v_tirage;
    end loop;

    if v_lot.stock is null then exit; end if;
    update public.tickets_or_lots
       set stock = stock - 1, updated_at = pg_catalog.now()
     where id = v_lot.id and stock > 0;
    if found then exit; end if;
  end loop;

  v_expire := pg_catalog.now() + pg_catalog.make_interval(days => 30);

  -- Génération CSPRNG du code + gestion explicite de collision concurrente.
  loop
    v_essai := v_essai + 1;
    v_rand_code := extensions.gen_random_bytes(8);
    v_redeem := 'TICKET-';
    for v_i in 0..7 loop
      v_redeem := v_redeem || pg_catalog.substr(
        v_alphabet,
        1 + (pg_catalog.get_byte(v_rand_code, v_i) % 32),
        1
      );
    end loop;

    begin
      insert into public.reward_issuances (
        organization_id, source_type, source_id, code, label,
        issued_at, expires_at, metadata
      )
      values (
        v_ticket.organization_id, 'ticket_or', v_ticket.id, v_redeem, v_lot.libelle,
        pg_catalog.now(), v_expire,
        pg_catalog.jsonb_build_object('lot_id', v_lot.id)
      )
      returning id into v_issuance;
      exit;
    exception when unique_violation then
      if v_essai >= 5 then raise; end if;
    end;
  end loop;

  update public.tickets_or
     set tire_le = pg_catalog.now(),
         lot_id = v_lot.id,
         reward_issuance_id = v_issuance,
         tirage_nonce_hash = v_nonce_hash
   where id = v_ticket.id;

  return pg_catalog.jsonb_build_object(
    'state', 'ok',
    'lot', v_lot.libelle,
    'code_retrait', v_redeem,
    'expire_le', v_expire
  );
end;
$fn$;

revoke all on function public.tirer_ticket_or(text, text)
  from public, anon, authenticated;
grant execute on function public.tirer_ticket_or(text, text) to service_role;

-- ── 6. accept_team_invitation : email confirmé + search_path = '' ───────────

create or replace function public.accept_team_invitation(p_invitation_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_inv record;
  v_email text;
begin
  select * into v_inv
    from public.team_invitations
   where id = p_invitation_id
   for update;
  if v_inv is null then
    raise exception 'invitation introuvable';
  end if;
  if v_inv.accepted_at is not null then
    raise exception 'invitation déjà acceptée';
  end if;
  if v_inv.revoked_at is not null then
    raise exception 'invitation annulée';
  end if;
  if v_inv.expires_at < pg_catalog.now() then
    raise exception 'invitation expirée';
  end if;

  select email into v_email
    from auth.users
   where id = auth.uid()
     and email_confirmed_at is not null;
  if v_email is null or pg_catalog.lower(v_email) <> pg_catalog.lower(v_inv.email) then
    raise exception 'cette invitation est destinée à une autre adresse email';
  end if;

  insert into public.organization_members (organization_id, user_id, role)
  values (v_inv.organization_id, auth.uid(), v_inv.role)
  on conflict (organization_id, user_id) do nothing;

  update public.team_invitations
     set accepted_at = pg_catalog.now()
   where id = p_invitation_id;

  return v_inv.organization_id;
end;
$$;

revoke all on function public.accept_team_invitation(uuid) from public, anon;
grant execute on function public.accept_team_invitation(uuid) to authenticated;

-- ── 7. Contrainte SQL NOT VALID pour jeux d'adresse à secret serveur ────────

alter table public.wheels
  drop constraint if exists wheels_secret_skill_finite_check;

alter table public.wheels
  add constraint wheels_secret_skill_finite_check
  check (
    game_type not in ('mystery_word', 'estimate', 'puzzle')
    or play_limit <> 'unlimited'
  ) not valid;

comment on constraint wheels_secret_skill_finite_check
  on public.wheels is
  'Mot mystère, Estimation et Puzzle portent un secret vérifié côté serveur : '
  'play_limit ne peut jamais être unlimited. NOT VALID protège immédiatement '
  'tout INSERT/UPDATE sans casser une éventuelle ligne historique.';

do $migration$
begin
  if not exists (
    select 1 from public.wheels
     where game_type in ('mystery_word', 'estimate', 'puzzle')
       and play_limit = 'unlimited'
  ) then
    alter table public.wheels
      validate constraint wheels_secret_skill_finite_check;
  end if;
end;
$migration$;
