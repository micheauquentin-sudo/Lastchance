-- ============================================================
-- Lastchance — BORNE 2 étendue au CALENDRIER et au QUIZ
--
-- ── La règle, et pourquoi elle existe ──
--
-- `20260725200000_loyalty_spin_bounds.sql` a institué la règle : « un tour
-- offert ne tire JAMAIS un lot à stock illimité ». La raison y est écrite en
-- toutes lettres : la roue PUBLIQUE accepte les lots illimités parce qu elle
-- est bornée AILLEURS — `play_limit` par fenêtre et par joueur, statut et
-- dates de campagne, Turnstile, seaux de spin. Le tour offert n a AUCUNE de
-- ces bornes : c est sa raison d être (« le joueur a mérité ce spin »). Il
-- exige donc, en échange, un stock RÉEL — le décrément atomique est alors le
-- compteur de ce qu il peut coûter.
--
-- Sans cette borne : N identités fabriquées = N codes de retrait RÉELS, sans
-- plafond. C est l attaque que l en-tête de 20260725200000 décrit pas à pas.
--
-- ── L écart, mesuré contre le catalogue vivant ──
--
--   consume_loyalty_spin_grant   → borne PRÉSENTE
--   consume_referral_spin_grant  → borne PRÉSENTE
--   consume_calendar_spin_grant  → borne ABSENTE
--   consume_quiz_spin_grant      → borne ABSENTE
--
-- Les deux modules sans borne ont été écrits APRÈS la migration qui
-- l institue (20260728120000 et 20260803120000) : elle ne leur a jamais été
-- appliquée. Ce n est pas un choix, c est un oubli — aucun de leurs en-têtes
-- ne mentionne la borne, ni pour l adopter ni pour s en écarter.
--
-- ── Pourquoi ce n est PAS un changement surprise pour le commerçant ──
--
-- Le produit le lui PROMET DÉJÀ. Les deux éditeurs affichent, sur la roue
-- ciblée par un tour offert :
--
--   « Certains lots de cette roue (stock illimité) ne sortiront pas en tour
--     offert. Donnez-leur un stock pour les rendre tirables. »
--   « Cette roue ne peut rien distribuer en tour offert : donnez un stock à
--     au moins un de ses lots. »
--
-- (calendar-editor.tsx:570-571, quiz-editor.tsx:654-655.)
--
-- L interface décrivait donc une règle que le SQL n appliquait pas. Cette
-- migration ne change pas la promesse faite au commerçant : elle la tient.
-- Il a même déjà été informé du geste à faire — donner un stock.
--
-- ── Ce qui se passe quand la roue ne peut plus rien donner ──
--
-- La réponse est `no_prize` et le jeton n est PAS consommé : le joueur
-- conserve son tour et pourra le jouer dès que le commerçant aura
-- approvisionné. Aucun tour offert n est perdu — seulement différé.
-- ============================================================
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
  v_wheel_id uuid;
  v_campaign_id uuid;
  v_org_id uuid;
  v_total bigint;
  v_pick bigint;
  v_prize record;
  v_spin_id uuid;
  v_random bytea;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'not authorized';
  end if;
  if p_player_token_hash is null or p_player_token_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid player token';
  end if;

  -- Grant résolu ET lié au joueur appelant (défense en profondeur : le
  -- grant_token seul, sans le cookie du joueur, ne suffit pas). Verrou de ligne :
  -- anti-rejeu.
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

  -- Roue cible de la case (garantie même organisation par la FK du jour).
  select d.target_wheel_id into v_wheel_id
    from public.calendar_days d where d.id = v_open.day_id;
  select w.id, w.campaign_id, w.organization_id
    into v_wheel_id, v_campaign_id, v_org_id
    from public.wheels w where w.id = v_wheel_id;
  if not found then
    return pg_catalog.jsonb_build_object('state', 'unavailable');
  end if;

  -- Tirage pondéré atomique (même algorithme que perform_atomic_spin, SANS
  -- contrôle de fenêtre de jeu). Réserve le stock du lot tiré.
  loop
    select coalesce(sum(p.weight), 0)::bigint into v_total
      from public.prizes p
     where p.wheel_id = v_wheel_id and p.organization_id = v_org_id
       and p.is_active and p.weight > 0
       and (p.is_losing or p.stock > 0);
    if v_total <= 0 then
      -- Aucun lot disponible : le grant reste NON consommé (rejouable quand le
      -- commerçant réapprovisionne).
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
         and p.is_active and p.weight > 0 and (p.is_losing or p.stock > 0)
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

  -- Grant consommé (une seule fois) → spin résultant journalisé.
  update public.calendar_openings
     set consumed_at = pg_catalog.now(), resulting_spin_id = v_spin_id
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
  v_wheel_id uuid;
  v_campaign_id uuid;
  v_org_id uuid;
  v_total bigint;
  v_pick bigint;
  v_prize record;
  v_spin_id uuid;
  v_random bytea;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'not authorized';
  end if;
  if p_player_token_hash is null or p_player_token_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid player token';
  end if;

  -- Grant résolu ET lié au joueur appelant (défense en profondeur : le
  -- grant_token seul, sans le cookie du joueur, ne suffit pas). Verrou de
  -- ligne : anti-rejeu.
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

  -- Roue cible du quiz (garantie même organisation par la FK composite).
  select q.target_wheel_id into v_wheel_id
    from public.quizzes q where q.id = v_reward.quiz_id;
  select w.id, w.campaign_id, w.organization_id
    into v_wheel_id, v_campaign_id, v_org_id
    from public.wheels w where w.id = v_wheel_id;
  if not found then
    return pg_catalog.jsonb_build_object('state', 'unavailable');
  end if;

  -- Tirage pondéré atomique (même algorithme que perform_atomic_spin, SANS
  -- contrôle de fenêtre de jeu). Réserve le stock du lot tiré.
  loop
    select coalesce(sum(p.weight), 0)::bigint into v_total
      from public.prizes p
     where p.wheel_id = v_wheel_id and p.organization_id = v_org_id
       and p.is_active and p.weight > 0
       and (p.is_losing or p.stock > 0);
    if v_total <= 0 then
      -- Aucun lot disponible : le grant reste NON consommé (rejouable quand le
      -- commerçant réapprovisionne).
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
         and p.is_active and p.weight > 0 and (p.is_losing or p.stock > 0)
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

  -- Grant consommé (une seule fois) → spin résultant journalisé.
  update public.quiz_rewards
     set consumed_at = pg_catalog.now(), resulting_spin_id = v_spin_id
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

