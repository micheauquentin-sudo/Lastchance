-- ============================================================
-- RELEASE GATE — reprises idempotentes et gardes serveur
--
-- Ce lot ferme quatre écarts démontrés sans changer la sémantique historique
-- de `spins.prize_id` :
--   1. Ticket d'Or rejouable uniquement avec le nonce secret du premier appel ;
--   2. segment visuel perdant mémorisé séparément du gain ;
--   3. Réflexe/Jauge impossibles en `unlimited`, y compris via PostgREST ;
--   4. quota d'émission Ticket d'Or appliqué dans la transaction SQL.
--
-- Le budget de campagne n'est PAS modifié ici. Aujourd'hui il mesure les coûts
-- effectivement réclamés. Le borner dès l'attribution demanderait un coût figé
-- sur le spin, un compteur de réservations et une libération transactionnelle à
-- l'expiration/annulation. Ajouter seulement une somme au tirage créerait une
-- dette qui ne redescend jamais : ce n'est pas une correction sûre.
-- ============================================================

-- ── 1. Ticket d'Or : secret de reprise, jamais stocké en clair ──────────────

alter table public.tickets_or
  add column if not exists tirage_nonce_hash bytea;

alter table public.tickets_or
  add constraint tickets_or_tirage_nonce_hash_shape
  check (
    tirage_nonce_hash is null
    or pg_catalog.octet_length(tirage_nonce_hash) = 32
  ) not valid;

alter table public.tickets_or
  validate constraint tickets_or_tirage_nonce_hash_shape;

comment on column public.tickets_or.tirage_nonce_hash is
  'SHA-256 du nonce UUID créé et persisté par le client AVANT le tirage. Le '
  'même nonce restitue exactement le lot et le code après une réponse perdue ; '
  'un nonce différent ne reçoit jamais ces données. Les tickets tirés avant '
  '20261215120000 restent à null et ne deviennent pas récupérables par hasard.';

-- L'ancienne signature sans nonce ne doit plus pouvoir consommer un ticket.
-- Le DROP est volontaire : conserver un wrapper qui invente un nonce côté SQL
-- recréerait exactement la perte de réponse que ce lot ferme.
drop function public.tirer_ticket_or(text);

create function public.tirer_ticket_or(
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
  v_total integer;
  v_tirage integer;
  v_cumul integer := 0;
  v_issuance uuid;
  v_redeem text;
  v_essai integer := 0;
  v_expire timestamptz;
  v_nonce_normalise text;
  v_nonce_hash bytea;
  v_replay_lot text;
  v_replay_code text;
  v_replay_expire timestamptz;
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

  -- Un code inventé et un commerce sans offre restent indistinguables.
  if v_ticket.id is null then
    return pg_catalog.jsonb_build_object('state', 'introuvable');
  end if;
  if v_ticket.tire_le is not null then
    -- Seul le secret du premier appel ouvre la reprise. `IS NOT DISTINCT FROM`
    -- n'est surtout pas employé : un ancien ticket à hash null ne doit jamais
    -- être récupérable avec une absence de nonce.
    if v_ticket.tirage_nonce_hash is not null
       and v_ticket.tirage_nonce_hash = v_nonce_hash then
      -- `reward_issuances.label` est le snapshot du premier résultat. Relire le
      -- libellé vivant du lot rendrait une réponse différente après renommage.
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

  -- L'accès décide si un NOUVEAU tirage peut être engagé. Il est vérifié après
  -- la reprise : un gain déjà attribué reste une dette du commerce et ne doit
  -- pas disparaître parce que l'offre est résiliée entre le commit et le retry.
  if not public.org_has_module_access(v_ticket.organization_id, 'wheel') then
    return pg_catalog.jsonb_build_object('state', 'introuvable');
  end if;

  if v_ticket.expire_le <= pg_catalog.now() then
    return pg_catalog.jsonb_build_object('state', 'expire');
  end if;

  select pg_catalog.sum(poids)::integer into v_total
    from public.tickets_or_lots
   where organization_id = v_ticket.organization_id
     and actif and poids > 0 and (stock is null or stock > 0);

  if coalesce(v_total, 0) = 0 then
    return pg_catalog.jsonb_build_object('state', 'sans_lot');
  end if;

  v_tirage := 1 + (pg_catalog.floor(pg_catalog.random() * v_total))::integer;

  for v_lot in
    select * from public.tickets_or_lots
     where organization_id = v_ticket.organization_id
       and actif and poids > 0 and (stock is null or stock > 0)
     order by ordre, id
  loop
    v_cumul := v_cumul + v_lot.poids;
    exit when v_cumul >= v_tirage;
  end loop;

  if v_lot.stock is not null then
    update public.tickets_or_lots
       set stock = stock - 1, updated_at = pg_catalog.now()
     where id = v_lot.id and stock > 0;
    if not found then
      return pg_catalog.jsonb_build_object('state', 'sans_lot');
    end if;
  end if;

  loop
    v_essai := v_essai + 1;
    select 'TICKET-' || pg_catalog.string_agg(
             pg_catalog.substr(
               'ABCDEFGHJKLMNPQRSTUVWXYZ23456789',
               1 + (pg_catalog.floor(pg_catalog.random() * 32))::integer, 1),
             '')
      into v_redeem
      from pg_catalog.generate_series(1, 8);
    exit when v_essai >= 3 or not exists (
      select 1 from public.reward_issuances
       where organization_id = v_ticket.organization_id and code = v_redeem
    );
  end loop;

  v_expire := pg_catalog.now() + pg_catalog.make_interval(days => 30);

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

comment on function public.tirer_ticket_or(text, text) is
  'Tire UNE FOIS un Ticket d''Or. `p_nonce` est un UUIDv4 généré et persisté '
  'avant l''appel ; seul son SHA-256 est stocké. Sous le verrou du ticket, le '
  'même nonce restitue le document initial (lot, code, expiration) sans toucher '
  'au stock ; tout autre nonce rend `deja_tire`. Service role uniquement.';

revoke all on function public.tirer_ticket_or(text, text)
  from public, anon, authenticated;
grant execute on function public.tirer_ticket_or(text, text) to service_role;

-- ── 2. Ticket d'Or : le quota vit aussi dans la transaction SQL ────────────

create or replace function public.emettre_ticket_or(
  p_organization_id uuid,
  p_jours integer default 30
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_code text;
  v_jours integer;
  v_essai integer := 0;
  v_expire timestamptz;
begin
  if not public.is_org_member(p_organization_id) then
    return pg_catalog.jsonb_build_object('state', 'not_authorized');
  end if;
  if not public.org_has_module_access(p_organization_id, 'wheel') then
    return pg_catalog.jsonb_build_object('state', 'no_access');
  end if;

  -- Même limite que RATE_LIMITS.ticketOrEmission. Le verrou par organisation
  -- rend `count puis insert` atomique entre deux appels directs concurrents.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'ticket-or:emission:' || p_organization_id::text,
      0
    )
  );
  if (
    select pg_catalog.count(*) >= 200
      from public.tickets_or t
     where t.organization_id = p_organization_id
       and t.emis_le >= pg_catalog.now() - pg_catalog.make_interval(hours => 1)
  ) then
    return pg_catalog.jsonb_build_object('state', 'rate_limited');
  end if;

  v_jours := least(greatest(coalesce(p_jours, 30), 1), 180);
  v_expire := pg_catalog.now() + pg_catalog.make_interval(days => v_jours);

  loop
    v_essai := v_essai + 1;
    select pg_catalog.string_agg(
             pg_catalog.substr(
               'ABCDEFGHJKLMNPQRSTUVWXYZ23456789',
               1 + (pg_catalog.floor(pg_catalog.random() * 32))::integer, 1),
             '')
      into v_code
      from pg_catalog.generate_series(1, 10);

    begin
      insert into public.tickets_or
        (organization_id, code, emis_par, expire_le)
      values (p_organization_id, v_code, (select auth.uid()), v_expire);

      return pg_catalog.jsonb_build_object(
        'state', 'ok', 'code', v_code, 'expire_le', v_expire);
    exception when unique_violation then
      if v_essai >= 3 then
        return pg_catalog.jsonb_build_object('state', 'error');
      end if;
    end;
  end loop;
end;
$fn$;

comment on function public.emettre_ticket_or(uuid, integer) is
  'Émet un Ticket d''Or pour un membre authentifié du commerce avec accès '
  '`wheel`. Le quota de 200 émissions par heure et par organisation est '
  'sérialisé par verrou consultatif DANS cette RPC ; un appel PostgREST direct '
  'ne peut donc plus contourner le rate-limit applicatif. `rate_limited` '
  'signifie que la fenêtre est pleine.';

revoke all on function public.emettre_ticket_or(uuid, integer)
  from public, anon;
grant execute on function public.emettre_ticket_or(uuid, integer)
  to authenticated, service_role;

-- ── 3. Le segment perdant est une dimension d'affichage, pas un gain ────────

-- Une suppression de lot gagnant faisait auparavant `SET NULL` sur le spin.
-- La garde applicative `count puis delete` ne peut pas fermer la course avec un
-- tirage concurrent. On remplace donc les deux FK redondantes par la composite
-- locataire, sans action de suppression : un lot attribué se désactive, il ne
-- se supprime plus. `NO ACTION` plutôt que `RESTRICT` reste atomique pour un
-- DELETE direct, tout en laissant une suppression racine d'organisation faire
-- cascader spins ET lots au sein du même statement.
alter table public.spins
  drop constraint if exists spins_prize_id_fkey,
  drop constraint if exists spins_prize_wheel_org_fk;

alter table public.spins
  add constraint spins_prize_wheel_org_fk
  foreign key (prize_id, wheel_id, organization_id)
  references public.prizes(id, wheel_id, organization_id)
  on delete no action not valid;

alter table public.spins
  validate constraint spins_prize_wheel_org_fk;

alter table public.spins
  add column if not exists display_prize_id uuid;

alter table public.spins
  add constraint spins_display_prize_wheel_org_fk
  foreign key (display_prize_id, wheel_id, organization_id)
  references public.prizes(id, wheel_id, organization_id)
  on delete set null (display_prize_id) not valid;

alter table public.spins
  validate constraint spins_display_prize_wheel_org_fk;

alter table public.spins
  add constraint spins_display_prize_is_losing_check
  check (display_prize_id is null or is_losing) not valid;

alter table public.spins
  validate constraint spins_display_prize_is_losing_check;

comment on column public.spins.display_prize_id is
  'Segment perdant réellement choisi, conservé pour rejouer exactement la '
  'réponse d''un nonce. N''accorde aucun gain : `spins.prize_id` reste null et '
  'demeure l''unique référence métier utilisée par claim_winning_spin.';

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

  if v_status is distinct from 'active'
     or (v_starts_at is not null and v_starts_at > pg_catalog.now())
     or (v_ends_at is not null and v_ends_at < pg_catalog.now()) then
    return query select null::uuid, null::uuid, false,
                        'campaign_closed', null::timestamptz;
    return;
  end if;

  if v_window_start is not null and exists (
    select 1 from public.spins s
    where s.wheel_id = p_wheel_id and s.player_key = p_player_key
      and s.created_at >= v_window_start
  ) then
    return query select null::uuid, null::uuid, false, 'limit_reached', v_next;
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

  loop
    select coalesce(sum(p.weight), 0)::bigint into v_total
    from public.prizes p
    where p.wheel_id = p_wheel_id and p.organization_id = p_organization_id
      and p.is_active and p.weight > 0
      and (p.is_losing or p.stock is null or p.stock > 0);
    if v_total <= 0 then
      return query select null::uuid, null::uuid, false,
                          'no_prize', null::timestamptz;
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
      select p.*,
             sum(p.weight) over(order by p.position, p.created_at, p.id) as ceiling
      from public.prizes p
      where p.wheel_id = p_wheel_id and p.organization_id = p_organization_id
        and p.is_active and p.weight > 0
        and (p.is_losing or p.stock is null or p.stock > 0)
    ) q where q.ceiling > v_pick order by q.ceiling limit 1;

    if v_prize.is_losing or v_prize.stock is null then exit; end if;
    update public.prizes set stock = stock - 1
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
end
$$;

comment on function public.perform_atomic_spin(uuid,uuid,uuid,text,text,text,boolean,text) is
  'Moteur atomique de tirage. Depuis 20261215120000, une perte pondérée garde '
  'son segment dans `spins.display_prize_id` tandis que `spins.prize_id` reste '
  'null : le rejeu du même nonce restitue exactement le segment sans créer de '
  'gain. État campagne, play_limit, stock et verrou joueur restent inchangés. '
  'Service role uniquement.';

revoke all on function public.perform_atomic_spin(uuid,uuid,uuid,text,text,text,boolean,text)
  from public, anon, authenticated;
grant execute on function public.perform_atomic_spin(uuid,uuid,uuid,text,text,text,boolean,text)
  to service_role;

-- ── 4. Réflexe/Jauge : jamais illimités, même par écriture SQL directe ──────

alter table public.wheels
  add constraint wheels_client_reported_skill_finite_check
  check (
    game_type not in ('reflex', 'gauge')
    or play_limit <> 'unlimited'
  ) not valid;

comment on constraint wheels_client_reported_skill_finite_check
  on public.wheels is
  'Réflexe et Jauge reposent sur un succès déclaré par le navigateur. Ils ne '
  'peuvent jamais être `unlimited`. NOT VALID protège immédiatement tout '
  'INSERT/UPDATE sans modifier silencieusement une éventuelle ligne historique.';

-- Sur une base propre, la contrainte devient validée et le planificateur peut
-- l'exploiter. Si la production contient déjà une configuration interdite, la
-- migration réussit quand même : elle bloque les nouvelles écritures et laisse
-- la ligne visible pour correction explicite par le commerçant.
do $migration$
begin
  if not exists (
    select 1 from public.wheels
     where game_type in ('reflex', 'gauge')
       and play_limit = 'unlimited'
  ) then
    alter table public.wheels
      validate constraint wheels_client_reported_skill_finite_check;
  end if;
end
$migration$;
