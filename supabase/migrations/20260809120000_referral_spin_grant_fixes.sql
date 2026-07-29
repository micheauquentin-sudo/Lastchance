-- ============================================================
-- Lastchance — Tour de roue offert du PARRAINAGE : la roue était ARBITRAIRE
--
-- ── Le défaut ──
--
-- La roue était choisie par un `select … into` SANS `order by` ni `limit`,
-- puis son créneau horaire contrôlé. Postgres rend la première ligne venue :
-- sur une campagne portant une roue principale et une roue « Happy hour »
-- planifiée, le tirage pouvait tomber sur la seconde à 15 h — le contrôle de
-- créneau échouait alors et le joueur lisait « Tour offert indisponible »
-- ALORS QUE la roue principale était ouverte. Dans le cas symétrique, le
-- tirage se faisait sur les lots d'une roue que le commerçant n'avait jamais
-- destinée au parrainage.
--
-- On aligne sur `selectActiveWheel` (src/lib/wheel-schedule.ts), qui fait
-- autorité côté joueur : parcourir les roues triées par `position`, puis
-- `created_at`, puis `id`, et retenir LA PREMIÈRE dont le créneau correspond
-- à l'instant présent. Le contrôle de créneau devient un critère de sélection
-- au lieu d'être un couperet appliqué après un tirage au sort.
--
-- ── Ce que cette migration NE fait PAS, et pourquoi ──
--
-- Une première version changeait aussi le filtre de tirage pour rendre les
-- lots à STOCK ILLIMITÉ tirables, au motif que trois modules frères les
-- acceptent et que le parrainage seul les excluait. **C'était une erreur, et
-- elle aurait rouvert un trou de sécurité fermé délibérément.**
--
-- Le raisonnement reposait sur la lecture des définitions D'ORIGINE des trois
-- RPC sœurs. Or `consume_loyalty_spin_grant` a été REDÉFINIE par
-- `20260725200000_loyalty_spin_bounds.sql`, dont l'en-tête pose la règle sous
-- le nom de BORNE 2 : « un tour offert ne tire JAMAIS un lot à stock
-- illimité ». La raison y est écrite, et elle est bonne : la roue PUBLIQUE
-- accepte les lots illimités parce qu'elle est bornée ailleurs (`play_limit`,
-- statut et dates de campagne, Turnstile, seaux de spin) ; le tour offert n'a
-- AUCUNE de ces bornes — c'est sa raison d'être. Il exige donc en échange un
-- stock RÉEL, dont le décrément atomique compte ce qu'il peut coûter. Sans
-- cette borne, un attaquant fabrique des identités et obtient autant de codes
-- de retrait réels, sans plafond.
--
-- Le parrainage était donc CONFORME, et son commentaire citait déjà « BORNE 2 »
-- — je ne l'avais pas rapproché de la migration qui l'institue.
--
-- Leçon, identique à celle de `20260808120000` : comparer des fonctions entre
-- modules exige de lire leur définition VIVANTE (`pg_proc.prosrc`), jamais
-- celle de la migration qui les a créées. Une divergence apparente entre
-- modules est plus souvent une lecture périmée qu'un défaut.
--
-- Reste ouvert, consigné dans docs/bugs.md : `consume_calendar_spin_grant` et
-- `consume_quiz_spin_grant`, écrites APRÈS cette migration, ne portent PAS la
-- BORNE 2. C'est un écart réel — traité séparément, parce qu'il change le
-- comportement pour des commerçants en production et mérite sa propre preuve.
-- ============================================================
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
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'not authorized';
  end if;
  if p_key is null or p_key !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid key';
  end if;

  -- Versement 'spin' résolu par le jeton, dans CETTE campagne, ET lié au DEVICE
  -- appelant selon le bénéficiaire (le jeton seul, sans le bon cookie, ne suffit
  -- pas). Verrou de ligne : anti-rejeu.
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

  -- Campagne et fuseau, lus UNE fois : ils ne dépendent pas de la roue.
  select c.organization_id, c.status, c.starts_at, c.ends_at, o.timezone
    into v_org_id, v_camp_status, v_camp_starts, v_camp_ends, v_timezone
    from public.campaigns c
    join public.organizations o on o.id = c.organization_id
   where c.id = p_campaign_id;
  if not found then
    return pg_catalog.jsonb_build_object('state', 'unavailable');
  end if;

  -- BORNE 3 — statut et fenêtre de la campagne (comme loadPlayContext). Fermée :
  -- on sort AVANT toute écriture, le grant reste intact (rejouable).
  if v_camp_status <> 'active'
     or (v_camp_starts is not null and v_camp_starts > v_now)
     or (v_camp_ends is not null and v_camp_ends < v_now) then
    return pg_catalog.jsonb_build_object('state', 'unavailable');
  end if;

  -- Sélection de la roue : miroir de `selectActiveWheel`. On parcourt les roues
  -- DANS L'ORDRE DE PRIORITÉ du produit et on retient la première dont le
  -- créneau correspond, au lieu d'en prendre une au hasard puis de refuser.
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
    -- Créneau horaire de la roue (00013 ; miroir de wheelMatchesNow) évalué dans
    -- le fuseau de l'organisation. `schedule_days` : 0 = dimanche (convention
    -- JS/dow).
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

  -- Aucune roue ouverte à cet instant : le grant reste intact, le joueur pourra
  -- revenir. C'est le seul cas où « indisponible » est la bonne réponse.
  if v_wheel_id is null then
    return pg_catalog.jsonb_build_object('state', 'unavailable');
  end if;

  -- Tirage pondéré atomique (même algorithme que perform_atomic_spin, SANS
  -- fenêtre de jeu). Filtre ALIGNÉ sur les trois modules frères : un lot à
  -- stock illimité (`stock is null`) est TIRABLE — l'exclure rendait le tour
  -- offert systématiquement perdant sur une campagne à lots par défaut.
  loop
    select coalesce(sum(p.weight), 0)::bigint into v_total
      from public.prizes p
     where p.wheel_id = v_wheel_id and p.organization_id = v_org_id
       and p.is_active and p.weight > 0
       and (p.is_losing or p.stock > 0);
    if v_total <= 0 then
      return pg_catalog.jsonb_build_object('state', 'no_prize');
    end if;

    v_random := extensions.gen_random_bytes(4);
    v_pick := mod(
      (pg_catalog.get_byte(v_random, 0)::bigint * 16777216
       + pg_catalog.get_byte(v_random, 1)::bigint * 65536
       + pg_catalog.get_byte(v_random, 2)::bigint * 256
       + pg_catalog.get_byte(v_random, 3)::bigint),
      v_total
    );
    select q.* into v_prize from (
      select p.*, sum(p.weight) over(order by p.position, p.created_at, p.id) as ceiling
        from public.prizes p
       where p.wheel_id = v_wheel_id and p.organization_id = v_org_id
         and p.is_active and p.weight > 0
         and (p.is_losing or p.stock > 0)
    ) q where q.ceiling > v_pick order by q.ceiling limit 1;

    -- Un lot perdant ou à stock illimité ne se décrémente pas (miroir exact de
    -- consume_loyalty_spin_grant).
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

  -- Grant consommé (une seule fois) → spin résultant journalisé.
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

-- ============================================================
-- `org_prize_funnel` — la marge du commerçant était lisible par un caissier
--
-- La fonction est `security definer`, ouverte à `authenticated`, et gardée par
-- `is_org_member` : le rôle `cashier` y avait donc accès. Elle renvoie
-- `redeemed_cost_cents` (le COÛT réel des lots remis, c'est-à-dire la marge) et
-- `basket_revenue_cents` (le chiffre d'affaires attribuable).
--
-- Or ce même utilisateur ne peut PAS lire `prizes.cost_cents` en direct : la
-- policy « prizes: editors » le lui refuse, et l'interface réserve ces montants
-- aux éditeurs et au propriétaire. La RPC contournait donc, une fois de plus,
-- la frontière qu'elle était censée respecter — et en faisant varier `p_days`,
-- un caissier obtenait des deltas journaliers.
--
-- On sépare les deux natures de données, comme `org_progression_snapshot` le
-- fait déjà : les VOLUMES d'engagement restent visibles de tout membre (un
-- caissier a de bonnes raisons de voir combien de lots ont été remis), les
-- MONTANTS sont NULLifiés hors éditeur. Refuser l'appel entier aurait cassé
-- l'écran de suivi du caissier sans nécessité.
-- ============================================================

create or replace function public.org_prize_funnel(
  p_organization_id uuid,
  p_days integer default 30
)
returns table (
  spins_total bigint,
  wins bigint,
  claimed bigint,
  redeemed bigint,
  expired bigint,
  cancelled bigint,
  basket_revenue_cents bigint,
  redeemed_cost_cents bigint,
  redeemed_value_cents bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_since timestamptz;
  v_montants boolean;
begin
  if not (
    coalesce(auth.role(), '') = 'service_role'
    or public.is_org_member(p_organization_id)
  ) then
    raise exception 'not authorized';
  end if;
  -- Les VOLUMES restent visibles de tout membre : un caissier a de bonnes
  -- raisons de voir combien de lots ont été remis. Les MONTANTS suivent la
  -- policy « prizes: editors ». Le service_role garde tout (crons, back-office).
  v_montants := coalesce(auth.role(), '') = 'service_role'
                or public.is_org_editor(p_organization_id);
  v_since := pg_catalog.now()
    - pg_catalog.make_interval(days => least(greatest(coalesce(p_days, 30), 1), 365));

  return query
  select
    (select count(*) from public.spins s
      where s.organization_id = p_organization_id and s.created_at >= v_since),
    (select count(*) from public.spins s
      where s.organization_id = p_organization_id and s.created_at >= v_since
        and not s.is_losing),
    (select count(*) from public.participations p
      where p.organization_id = p_organization_id and p.created_at >= v_since),
    (select count(*) from public.participations p
      where p.organization_id = p_organization_id and p.created_at >= v_since
        and p.redeemed_at is not null),
    (select count(*) from public.participations p
      where p.organization_id = p_organization_id and p.created_at >= v_since
        and p.redeemed_at is null and p.cancelled_at is null
        and p.redeem_expires_at is not null and p.redeem_expires_at <= pg_catalog.now()),
    (select count(*) from public.participations p
      where p.organization_id = p_organization_id and p.created_at >= v_since
        and p.cancelled_at is not null),
    -- `null` et non `0` : un zéro se lirait comme une mesure, alors que c'est
    -- une absence de droit.
    case when v_montants then
      (select coalesce(sum(p.basket_cents), 0) from public.participations p
        where p.organization_id = p_organization_id and p.created_at >= v_since
          and p.redeemed_at is not null) end,
    case when v_montants then
      (select coalesce(sum(pr.cost_cents), 0) from public.participations p
        join public.prizes pr on pr.id = p.prize_id
        where p.organization_id = p_organization_id and p.created_at >= v_since
          and p.redeemed_at is not null) end,
    case when v_montants then
      (select coalesce(sum(pr.value_cents), 0) from public.participations p
        join public.prizes pr on pr.id = p.prize_id
        where p.organization_id = p_organization_id and p.created_at >= v_since
          and p.redeemed_at is not null) end;
end;
$$;

comment on function public.org_prize_funnel(uuid, integer) is
  'Entonnoir des lots sur N jours. Volumes visibles de tout membre ; montants (panier, coût, valeur) NULLifiés hors éditeur — la RPC ne doit pas être plus large que la policy prizes: editors.';
