-- ============================================================
-- Budget de campagne : reservation atomique des gains emis.
--
-- Un gain est desormais engage au tirage, avec son cout fige sur le spin.
-- La reclamation transfere l'engagement vers la depense et un abandon libere
-- la reservation apres la duree de vie du jeton de claim, sans depassement
-- possible entre deux tirages concurrents.
-- ============================================================

alter table public.campaigns
  add column if not exists budget_reserved_cents integer not null default 0
    check (budget_reserved_cents >= 0);

comment on column public.campaigns.budget_reserved_cents is
  'Cout fige des gains emis mais pas encore reclames. Une reservation expire '
  'apres 20 minutes et passe dans budget_spent_cents lors du claim.';

alter table public.spins
  add column if not exists budget_cost_cents integer not null default 0
    check (budget_cost_cents between 0 and 100000000),
  add column if not exists budget_reservation_expires_at timestamptz,
  add column if not exists budget_reservation_released_at timestamptz;

comment on column public.spins.budget_cost_cents is
  'Cout du lot fige a emission. Ne suit jamais une modification ulterieure du lot.';
comment on column public.spins.budget_reservation_expires_at is
  'Echeance de la reservation budget. Null pour une perte ou un spin historique.';
comment on column public.spins.budget_reservation_released_at is
  'Instant du transfert vers la depense ou de la liberation apres expiration.';

create index spins_budget_reservations_expiry_idx
  on public.spins(budget_reservation_expires_at, campaign_id)
  where prize_id is not null
    and not claimed
    and budget_reservation_released_at is null;

-- Le predicat est partage par le tirage, le claim et la liberation : une
-- campagne n'est epuisee que si elle conserve au moins un gain tirable mais
-- qu'aucun de ces gains ne tient dans le budget encore libre.
create or replace function public.campaign_has_affordable_winning_prize(
  p_organization_id uuid,
  p_campaign_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from public.prizes p
      join public.wheels w
        on w.id = p.wheel_id
       and w.organization_id = p.organization_id
       and w.campaign_id = p_campaign_id
      join public.campaigns c
        on c.id = w.campaign_id
       and c.organization_id = w.organization_id
     where p.organization_id = p_organization_id
       and p.is_active
       and not p.is_losing
       and p.weight > 0
       and (p.stock is null or p.stock > 0)
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
$$;

create or replace function public.campaign_has_winning_prize(
  p_organization_id uuid,
  p_campaign_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from public.prizes p
      join public.wheels w
        on w.id = p.wheel_id
       and w.organization_id = p.organization_id
       and w.campaign_id = p_campaign_id
     where p.organization_id = p_organization_id
       and p.is_active
       and not p.is_losing
       and p.weight > 0
       and (p.stock is null or p.stock > 0)
  )
$$;

revoke all on function public.campaign_has_affordable_winning_prize(uuid,uuid)
  from public, anon, authenticated;
revoke all on function public.campaign_has_winning_prize(uuid,uuid)
  from public, anon, authenticated;
grant execute on function public.campaign_has_affordable_winning_prize(uuid,uuid)
  to service_role;
grant execute on function public.campaign_has_winning_prize(uuid,uuid)
  to service_role;

create or replace function public.pause_campaign_if_budget_exhausted(
  p_organization_id uuid,
  p_campaign_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_budget integer;
  v_spent integer;
  v_reserved integer;
begin
  update public.campaigns c
     set status = 'paused', paused_reason = 'budget_reached'
   where c.id = p_campaign_id
     and c.organization_id = p_organization_id
     and c.status = 'active'
     and c.budget_cents is not null
     and public.campaign_has_winning_prize(p_organization_id, p_campaign_id)
     and not public.campaign_has_affordable_winning_prize(
       p_organization_id, p_campaign_id
     )
  returning c.budget_cents, c.budget_spent_cents, c.budget_reserved_cents
       into v_budget, v_spent, v_reserved;

  if not found then return false; end if;

  insert into public.audit_logs(organization_id, actor, action, metadata)
  values (
    p_organization_id,
    'system',
    'campaign.budget.pause',
    pg_catalog.jsonb_build_object(
      'campaign_id', p_campaign_id,
      'budget_cents', v_budget,
      'budget_spent_cents', v_spent,
      'budget_reserved_cents', v_reserved
    )
  );

  insert into public.jobs(type, payload, organization_id, idempotency_key)
  values (
    'automation.budget-paused',
    pg_catalog.jsonb_build_object(
      'campaignId', p_campaign_id,
      'organizationId', p_organization_id
    ),
    p_organization_id,
    'budget-paused:' || p_campaign_id::text || ':' || v_budget::text
      || ':' || (v_spent + v_reserved)::text
  )
  on conflict (idempotency_key) do nothing;

  return true;
end
$$;

revoke all on function public.pause_campaign_if_budget_exhausted(uuid,uuid)
  from public, anon, authenticated;
grant execute on function public.pause_campaign_if_budget_exhausted(uuid,uuid)
  to service_role;

-- Un plafond ne peut plus etre abaisse sous les gains deja reclames ou promis.
create or replace function public.guard_campaign_budget_floor()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.budget_cents is not null
     and new.budget_cents
       < coalesce(new.budget_spent_cents, 0)
         + coalesce(new.budget_reserved_cents, 0) then
    raise exception 'campaign budget below committed amount';
  end if;
  return new;
end
$$;

revoke all on function public.guard_campaign_budget_floor()
  from public, anon, authenticated;

drop trigger if exists campaigns_guard_budget_floor on public.campaigns;
create trigger campaigns_guard_budget_floor
  before insert or update of budget_cents on public.campaigns
  for each row execute function public.guard_campaign_budget_floor();

-- Reprise des seuls gains dont un jeton peut encore etre vivant au deploiement.
update public.spins s
   set budget_cost_cents = coalesce(p.cost_cents, 0),
       budget_reservation_expires_at = s.created_at + interval '20 minutes'
  from public.prizes p
 where s.prize_id = p.id
   and not s.is_losing
   and not s.claimed
   and s.created_at > pg_catalog.now() - interval '20 minutes'
   and s.budget_reservation_expires_at is null;

update public.campaigns c
   set budget_reserved_cents = q.total
  from (
    select s.campaign_id, coalesce(sum(s.budget_cost_cents), 0)::integer as total
      from public.spins s
     where s.prize_id is not null
       and not s.claimed
       and s.budget_reservation_expires_at > pg_catalog.now()
       and s.budget_reservation_released_at is null
     group by s.campaign_id
  ) q
 where c.id = q.campaign_id;

-- Autorite centrale : toutes les emissions de gain (roue, fidelite,
-- calendrier, parrainage, quiz, reservation) passent par INSERT sur spins.
create or replace function public.reserve_spin_budget()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_cost integer;
begin
  if new.is_losing or new.prize_id is null then
    new.budget_cost_cents := 0;
    new.budget_reservation_expires_at := null;
    new.budget_reservation_released_at := null;
    return new;
  end if;

  select coalesce(p.cost_cents, 0)
    into v_cost
    from public.prizes p
   where p.id = new.prize_id
     and p.wheel_id = new.wheel_id
     and p.organization_id = new.organization_id
     and not p.is_losing;
  if not found then raise exception 'invalid winning prize chain'; end if;

  update public.campaigns c
     set budget_reserved_cents = c.budget_reserved_cents + v_cost
   where c.id = new.campaign_id
     and c.organization_id = new.organization_id
     and (
       c.budget_cents is null
       or c.budget_spent_cents + c.budget_reserved_cents + v_cost
            <= c.budget_cents
     );
  if not found then
    if not exists (
      select 1 from public.campaigns c
       where c.id = new.campaign_id
         and c.organization_id = new.organization_id
    ) then
      raise exception 'campaign unavailable';
    end if;
    raise exception 'campaign budget unavailable';
  end if;

  new.budget_cost_cents := v_cost;
  new.budget_reservation_expires_at := pg_catalog.now() + interval '20 minutes';
  new.budget_reservation_released_at := null;

  perform public.pause_campaign_if_budget_exhausted(
    new.organization_id, new.campaign_id
  );
  return new;
end
$$;

revoke all on function public.reserve_spin_budget()
  from public, anon, authenticated;

drop trigger if exists spins_reserve_budget on public.spins;
create trigger spins_reserve_budget
  before insert on public.spins
  for each row execute function public.reserve_spin_budget();

-- Expiration bornee par campagne pour le chemin synchrone du tirage, ou
-- globale pour pg_cron. Le verrou des spins precede toujours celui des
-- campagnes, comme dans claim_winning_spin, afin d'eviter les interblocages.
create or replace function public.release_expired_spin_budget_reservations(
  p_campaign_id uuid default null
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer := 0;
  v_reopened record;
begin
  with candidates as (
    select s.id
      from public.spins s
     where s.prize_id is not null
       and not s.claimed
       and s.budget_reservation_released_at is null
       and s.budget_reservation_expires_at <= pg_catalog.now()
       and (p_campaign_id is null or s.campaign_id = p_campaign_id)
     order by s.budget_reservation_expires_at, s.id
     for update skip locked
  ), released as (
    update public.spins s
       set budget_reservation_released_at = pg_catalog.now()
      from candidates x
     where s.id = x.id
    returning s.organization_id, s.campaign_id, s.budget_cost_cents
  ), totals as (
    select r.organization_id, r.campaign_id,
           sum(r.budget_cost_cents)::integer as released_cents,
           count(*)::integer as released_count
      from released r
     group by r.organization_id, r.campaign_id
  ), debited as (
    update public.campaigns c
       set budget_reserved_cents = greatest(
         c.budget_reserved_cents - t.released_cents,
         0
       )
      from totals t
     where c.id = t.campaign_id
       and c.organization_id = t.organization_id
    returning c.id
  )
  select coalesce(sum(t.released_count), 0)::integer
    into v_count
    from totals t;

  -- Une pause provoquee uniquement par des claims abandonnes se repare seule.
  -- Une campagne hors fenetre ou sans droit reste fermee.
  for v_reopened in
    update public.campaigns c
       set status = 'active', paused_reason = null
     where c.paused_reason = 'budget_reached'
       and (p_campaign_id is null or c.id = p_campaign_id)
       and (c.starts_at is null or c.starts_at <= pg_catalog.now())
       and (c.ends_at is null or c.ends_at > pg_catalog.now())
       and public.org_has_module_access(c.organization_id, 'wheel')
       and public.campaign_has_affordable_winning_prize(
         c.organization_id, c.id
       )
    returning c.id, c.organization_id
  loop
    insert into public.audit_logs(organization_id, actor, action, metadata)
    values (
      v_reopened.organization_id,
      'system',
      'campaign.budget.reopened',
      pg_catalog.jsonb_build_object('campaign_id', v_reopened.id)
    );
  end loop;

  return v_count;
end
$$;

comment on function public.release_expired_spin_budget_reservations(uuid) is
  'Libere les reservations non reclamees apres 20 minutes et rouvre seulement '
  'les campagnes que cette liberation rend de nouveau solvables.';

revoke all on function public.release_expired_spin_budget_reservations(uuid)
  from public, anon, authenticated;
grant execute on function public.release_expired_spin_budget_reservations(uuid)
  to service_role;

create extension if not exists pg_cron;
select cron.schedule(
  'lastchance-release-spin-budget',
  '*/5 * * * *',
  $job$ select public.release_expired_spin_budget_reservations() $job$
);

-- Le claim conserve toutes les garanties de collecte et de consentement SMS,
-- mais ne relit plus le cout mutable du lot. La ligne spin puis la campagne
-- sont verrouillees dans cet ordre, comme la liberation ci-dessus.
create or replace function public.claim_winning_spin(
  p_spin_id uuid,
  p_first_name text,
  p_email text,
  p_phone text,
  p_accepted_terms boolean,
  p_marketing_opt_in boolean,
  p_sms_opt_in boolean default false
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
  v_cost integer;
  v_is_reserved boolean;
  i integer;
  attempt integer;
begin
  select * into v_spin
    from public.spins
   where id = p_spin_id
   for update;
  if not found or v_spin.is_losing or v_spin.prize_id is null or v_spin.claimed then
    raise exception 'gain unavailable';
  end if;
  if v_spin.budget_reservation_expires_at is not null
     and (
       v_spin.budget_reservation_released_at is not null
       or v_spin.budget_reservation_expires_at <= pg_catalog.now()
     ) then
    raise exception 'gain expired';
  end if;

  select * into v_campaign
    from public.campaigns
   where id = v_spin.campaign_id
     and organization_id = v_spin.organization_id
   for update;
  if not found then raise exception 'campaign unavailable'; end if;

  v_is_reserved := v_spin.budget_reservation_expires_at is not null;
  if v_is_reserved then
    v_cost := v_spin.budget_cost_cents;
  else
    select coalesce(p.cost_cents, 0) into v_cost
      from public.prizes p where p.id = v_spin.prize_id;
    v_cost := coalesce(v_cost, 0);
  end if;

  if not v_campaign.collect_email then p_email := null; end if;
  if not v_campaign.collect_phone then
    p_phone := null;
    p_sms_opt_in := false;
  end if;
  if not (v_campaign.collect_email or v_campaign.collect_phone) then
    p_first_name := null;
    p_accepted_terms := false;
    p_marketing_opt_in := false;
  end if;
  if v_campaign.collect_email and p_email is null then
    raise exception 'email required';
  end if;
  if v_campaign.collect_phone and p_phone is null then
    raise exception 'phone required';
  end if;
  if (v_campaign.collect_email or v_campaign.collect_phone)
     and (p_first_name is null or not p_accepted_terms) then
    raise exception 'consent required';
  end if;

  for attempt in 1..8 loop
    v_bytes := extensions.gen_random_bytes(8);
    v_code := 'GAIN-';
    for i in 0..7 loop
      v_code := v_code
        || substr(v_alphabet, get_byte(v_bytes, i) % length(v_alphabet) + 1, 1);
    end loop;
    begin
      insert into public.participations(
        organization_id, campaign_id, wheel_id, prize_id, spin_id,
        first_name, email, phone, accepted_terms, marketing_opt_in,
        redeem_code, player_key
      ) values (
        v_spin.organization_id, v_spin.campaign_id, v_spin.wheel_id,
        v_spin.prize_id, v_spin.id,
        case when v_campaign.collect_email or v_campaign.collect_phone
          then p_first_name else null end,
        case when v_campaign.collect_email then p_email else null end,
        case when v_campaign.collect_phone then p_phone else null end,
        case when v_campaign.collect_email or v_campaign.collect_phone
          then p_accepted_terms else false end,
        case when v_campaign.collect_email or v_campaign.collect_phone
          then p_marketing_opt_in else false end,
        v_code, v_spin.player_key
      ) returning id into v_id;

      update public.spins
         set claimed = true,
             budget_reservation_released_at = case
               when v_is_reserved then pg_catalog.now()
               else budget_reservation_released_at
             end
       where id = v_spin.id;

      update public.campaigns c
         set budget_reserved_cents = case
               when v_is_reserved
                 then greatest(c.budget_reserved_cents - v_cost, 0)
               else c.budget_reserved_cents
             end,
             budget_spent_cents = c.budget_spent_cents + v_cost
       where c.id = v_spin.campaign_id
         and c.organization_id = v_spin.organization_id;

      perform public.pause_campaign_if_budget_exhausted(
        v_spin.organization_id, v_spin.campaign_id
      );

      insert into public.audit_logs(organization_id, actor, action, metadata)
      values (
        v_spin.organization_id,
        'public',
        'participation.claim',
        pg_catalog.jsonb_build_object(
          'campaign_id', v_spin.campaign_id,
          'prize_id', v_spin.prize_id,
          'budget_cost_cents', v_cost
        )
      );

      if p_marketing_opt_in and p_email is not null then
        insert into public.newsletter_subscribers(organization_id, email, source)
        values(v_spin.organization_id, p_email, 'claim')
        on conflict(organization_id, email) do nothing;
        if found and exists(
          select 1 from public.organizations o
           where o.id = v_spin.organization_id and o.webhook_url is not null
        ) then
          insert into public.webhook_deliveries(organization_id, event, data)
          values(
            v_spin.organization_id,
            'newsletter.subscriber.created',
            pg_catalog.jsonb_build_object('email', p_email, 'source', 'claim')
          );
        end if;
      end if;

      if p_sms_opt_in and p_phone is not null then
        begin
          perform public.record_sms_consent(
            v_spin.organization_id, p_phone, 'sms.v1', 'play', false
          );
        exception when others then
          insert into public.audit_logs(organization_id, actor, action, metadata)
          values(
            v_spin.organization_id,
            'system',
            'sms.consent.failed',
            pg_catalog.jsonb_build_object(
              'campaign_id', v_spin.campaign_id,
              'sqlstate', SQLSTATE
            )
          );
        end;
      end if;

      if exists(
        select 1 from public.organizations o
         where o.id = v_spin.organization_id and o.webhook_url is not null
      ) then
        insert into public.webhook_deliveries(organization_id, event, data)
        values(
          v_spin.organization_id,
          'participation.claimed',
          pg_catalog.jsonb_strip_nulls(pg_catalog.jsonb_build_object(
            'first_name', case
              when v_campaign.collect_email or v_campaign.collect_phone
                then p_first_name else null end,
            'email', case when v_campaign.collect_email then p_email else null end,
            'phone', case when v_campaign.collect_phone then p_phone else null end,
            'prize_label', (
              select p.label from public.prizes p where p.id = v_spin.prize_id
            ),
            'redeem_code', v_code
          ))
        );
      end if;

      return query select v_id, v_code;
      return;
    exception when unique_violation then
      if exists(
        select 1 from public.participations p where p.spin_id = v_spin.id
      ) then
        raise exception 'gain already claimed';
      end if;
    end;
  end loop;
  raise exception 'code generation exhausted';
end
$$;

comment on function public.claim_winning_spin(uuid,text,text,text,boolean,boolean,boolean) is
  'Reclame un gain avec collecte normalisee et consentement SMS transactionnel. '
  'Depuis 20261216120000, transfere le cout fige de reserve vers depense et '
  'refuse toute reservation expiree.';

revoke all on function public.claim_winning_spin(uuid,text,text,text,boolean,boolean,boolean)
  from public, anon, authenticated;
grant execute on function public.claim_winning_spin(uuid,text,text,text,boolean,boolean,boolean)
  to service_role;

-- Le moteur principal ne propose jamais un gain devenu inabordable. Le trigger
-- reste cependant la derniere autorite pour les courses concurrentes et les
-- autres experiences qui inserent directement leur spin.
create or replace function public.perform_atomic_spin(
  p_organization_id uuid,
  p_campaign_id uuid,
  p_wheel_id uuid,
  p_player_key text,
  p_engagement_action text,
  p_source text,
  p_force_losing boolean default false,
  p_idempotency_key text default null
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
  v_status text;
  v_starts_at timestamptz;
  v_ends_at timestamptz;
  v_local_now timestamp;
  v_window_key text;
  v_window_start timestamptz;
  v_next timestamptz;
  v_total bigint;
  v_pick bigint;
  v_prize record;
  v_spin_id uuid;
  v_random bytea;
  v_replay record;
  v_budget_attempt integer;
begin
  if p_player_key is null or length(p_player_key) < 32 then
    raise exception 'invalid player key';
  end if;

  select w.play_limit, o.timezone, c.status, c.starts_at, c.ends_at
    into v_limit, v_timezone, v_status, v_starts_at, v_ends_at
    from public.wheels w
    join public.campaigns c
      on c.id = w.campaign_id and c.organization_id = w.organization_id
    join public.organizations o on o.id = w.organization_id
   where w.id = p_wheel_id
     and w.campaign_id = p_campaign_id
     and w.organization_id = p_organization_id;
  if not found then raise exception 'invalid play resource chain'; end if;

  v_local_now := pg_catalog.now() at time zone v_timezone;
  if v_limit = 'once' then
    v_window_key := 'once';
    v_window_start := 'epoch'::timestamptz;
  elsif v_limit = 'daily' then
    v_window_key := 'day:' || to_char(v_local_now, 'YYYY-MM-DD');
    v_window_start := date_trunc('day', v_local_now) at time zone v_timezone;
    v_next := (date_trunc('day', v_local_now) + interval '1 day')
      at time zone v_timezone;
  elsif v_limit = 'weekly' then
    v_window_key := 'week:' || to_char(v_local_now, 'IYYY-IW');
    v_window_start := date_trunc('week', v_local_now) at time zone v_timezone;
    v_next := (date_trunc('week', v_local_now) + interval '1 week')
      at time zone v_timezone;
  else
    v_window_key := null;
    v_window_start := null;
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_wheel_id::text || ':' || p_player_key, 0)
  );

  if p_idempotency_key is not null then
    select s.id,
           coalesce(s.prize_id, s.display_prize_id) as replay_prize_id,
           s.is_losing
      into v_replay
      from public.spins s
     where s.idempotency_key = p_idempotency_key
       and s.wheel_id = p_wheel_id
       and s.player_key = p_player_key;
    if found then
      return query select v_replay.id, v_replay.replay_prize_id,
                          v_replay.is_losing,
                          null::text, null::timestamptz;
      return;
    end if;
  end if;

  perform public.release_expired_spin_budget_reservations(p_campaign_id);

  -- La liberation peut avoir rouvert une campagne : relire son etat courant.
  select c.status, c.starts_at, c.ends_at
    into v_status, v_starts_at, v_ends_at
    from public.campaigns c
   where c.id = p_campaign_id and c.organization_id = p_organization_id;

  if v_status is distinct from 'active'
     or (v_starts_at is not null and v_starts_at > pg_catalog.now())
     or (v_ends_at is not null and v_ends_at < pg_catalog.now()) then
    return query select null::uuid, null::uuid, false,
                        'campaign_closed', null::timestamptz;
    return;
  end if;

  if v_window_start is not null and exists (
    select 1 from public.spins s
     where s.wheel_id = p_wheel_id
       and s.player_key = p_player_key
       and s.created_at >= v_window_start
  ) then
    return query select null::uuid, null::uuid, false,
                        'limit_reached', v_next;
    return;
  end if;

  if public.pause_campaign_if_budget_exhausted(
    p_organization_id, p_campaign_id
  ) then
    return query select null::uuid, null::uuid, false,
                        'budget_reached', null::timestamptz;
    return;
  end if;

  if p_force_losing then
    insert into public.spins(
      organization_id, campaign_id, wheel_id, prize_id, display_prize_id,
      is_losing, player_key, engagement_action, source, play_window_key,
      idempotency_key
    ) values (
      p_organization_id, p_campaign_id, p_wheel_id, null, null, true,
      p_player_key, p_engagement_action,
      case when p_source = 'share' then 'share' else 'direct' end,
      v_window_key, p_idempotency_key
    ) returning id into v_spin_id;
    return query select v_spin_id, null::uuid, true,
                        null::text, null::timestamptz;
    return;
  end if;

  for v_budget_attempt in 1..3 loop
    if public.pause_campaign_if_budget_exhausted(
      p_organization_id, p_campaign_id
    ) then
      return query select null::uuid, null::uuid, false,
                          'budget_reached', null::timestamptz;
      return;
    end if;

    begin
      loop
        select coalesce(sum(p.weight), 0)::bigint into v_total
          from public.prizes p
         where p.wheel_id = p_wheel_id
           and p.organization_id = p_organization_id
           and p.is_active
           and p.weight > 0
           and (p.is_losing or p.stock is null or p.stock > 0)
           and (
             p.is_losing
             or exists (
               select 1 from public.campaigns c
                where c.id = p_campaign_id
                  and c.organization_id = p_organization_id
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
          return query select null::uuid, null::uuid, false,
                              'no_prize', null::timestamptz;
          return;
        end if;

        v_random := extensions.gen_random_bytes(4);
        v_pick := mod(
          get_byte(v_random, 0)::bigint * 16777216
            + get_byte(v_random, 1)::bigint * 65536
            + get_byte(v_random, 2)::bigint * 256
            + get_byte(v_random, 3)::bigint,
          v_total
        );
        select q.* into v_prize from (
          select p.*,
                 sum(p.weight) over(
                   order by p.position, p.created_at, p.id
                 ) as ceiling
            from public.prizes p
           where p.wheel_id = p_wheel_id
             and p.organization_id = p_organization_id
             and p.is_active
             and p.weight > 0
             and (p.is_losing or p.stock is null or p.stock > 0)
             and (
               p.is_losing
               or exists (
                 select 1 from public.campaigns c
                  where c.id = p_campaign_id
                    and c.organization_id = p_organization_id
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
        ) q
         where q.ceiling > v_pick
         order by q.ceiling
         limit 1;

        if v_prize.is_losing or v_prize.stock is null then exit; end if;
        update public.prizes
           set stock = stock - 1
         where id = v_prize.id and stock > 0;
        if found then exit; end if;
      end loop;

      insert into public.spins(
        organization_id, campaign_id, wheel_id, prize_id, display_prize_id,
        is_losing, player_key, engagement_action, source, play_window_key,
        idempotency_key
      ) values (
        p_organization_id, p_campaign_id, p_wheel_id,
        case when v_prize.is_losing then null else v_prize.id end,
        case when v_prize.is_losing then v_prize.id else null end,
        v_prize.is_losing, p_player_key, p_engagement_action,
        case when p_source = 'share' then 'share' else 'direct' end,
        v_window_key, p_idempotency_key
      ) returning id into v_spin_id;

      return query select v_spin_id, v_prize.id,
                          v_prize.is_losing, null::text, null::timestamptz;
      return;
    exception when raise_exception then
      if SQLERRM <> 'campaign budget unavailable' then raise; end if;
      -- Le sous-bloc annule aussi la reservation de stock. Le tour suivant
      -- relit le budget et choisit un gain encore abordable, ou ferme proprement.
    end;
  end loop;

  perform public.pause_campaign_if_budget_exhausted(
    p_organization_id, p_campaign_id
  );
  return query select null::uuid, null::uuid, false,
                      'budget_reached', null::timestamptz;
end
$$;

comment on function public.perform_atomic_spin(uuid,uuid,uuid,text,text,text,boolean,text) is
  'Tirage atomique et idempotent. Depuis 20261216120000, filtre les gains par '
  'budget disponible et reserve leur cout dans le trigger spins_reserve_budget.';

revoke all on function public.perform_atomic_spin(uuid,uuid,uuid,text,text,text,boolean,text)
  from public, anon, authenticated;
grant execute on function public.perform_atomic_spin(uuid,uuid,uuid,text,text,text,boolean,text)
  to service_role;

-- Une migration terminee ne doit laisser active aucune campagne deja
-- insolvable a cause des reservations reprises.
select public.pause_campaign_if_budget_exhausted(c.organization_id, c.id)
  from public.campaigns c
 where c.status = 'active' and c.budget_cents is not null;

-- Une reprise manuelle ne peut pas contourner la pause budget. Les autres
-- invariants historiques (role, droit, matrice et desarmement) sont conserves.
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

  perform public.release_expired_spin_budget_reservations(p_campaign_id);

  select c.status, c.auto_schedule into v_current, v_auto_avant
    from public.campaigns c
   where c.id = p_campaign_id and c.organization_id = p_organization_id
   for update;
  if not found then return false; end if;
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
end
$$;

comment on function public.set_campaign_status(uuid,uuid,text,text) is
  'Transition de campagne gardee par role, droit, matrice et budget engage. '
  'Une pause budget exige de liberer les reservations expirees ou de relever '
  'le plafond avant la reprise.';

revoke all on function public.set_campaign_status(uuid,uuid,text,text)
  from public, anon, authenticated;
grant execute on function public.set_campaign_status(uuid,uuid,text,text)
  to authenticated, service_role;
