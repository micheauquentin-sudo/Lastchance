-- ============================================================
-- Lastchance — Jeux rapides · VAGUE 2 (jeux de DÉFI *skill-gated*)
--
-- 6 nouvelles mécaniques où la RÉUSSITE au défi conditionne le tirage :
--   rps, reflex, gauge, puzzle, mystery_word, estimate.
--
-- Modèle « hybride skill-gated » (arbitrage client) :
--   • succès au défi → on procède au TIRAGE SERVEUR standard (gagne/perd
--     selon les MÊMES poids/stocks que la roue). Le défi n'est qu'une PORTE.
--   • échec au défi  → spin PERDANT forcé, qui CONSOMME la participation /
--     play_limit (anti-brute-force), SANS toucher au stock ni créer de gain.
--
-- Invariants respectés :
--   1. Le tirage reste le PLAFOND : un tricheur qui « réussit » toujours ne
--      peut pas dépasser les probabilités configurées (le tirage sur succès
--      passe par perform_atomic_spin, poids/stocks/borne éco ADR-031 inchangés).
--   2. Stock engagé seulement au tirage (succès) ; l'échec ne touche ni stock
--      ni gain — mais consomme la participation (cf. #3).
--   3. Anti-brute-force : une tentative (succès OU échec) consomme EXACTEMENT
--      une participation via la même garde play_limit / fenêtre que la roue.
--   4. Secrets SERVER-ONLY : mystery_word.word / estimate.target / estimate.
--      tolerance vivent dans wheels.skill_config, jamais sérialisés au client.
--
-- ── Voie retenue pour le tirage-sur-défi ────────────────────
-- On étend perform_atomic_spin d'un paramètre optionnel
--   `p_force_losing boolean default false`
-- (voie « paramètre » plutôt que RPC dédiée). Justification :
--   • DRY / source unique : play_limit, fenêtre, verrou consultatif,
--     validation player_key et chaîne de ressources restent définis UNE
--     seule fois. Une RPC dédiée devrait dupliquer tout le calcul de fenêtre.
--   • Zéro régression : `default false` → tous les appelants 6-args existants
--     (roue, grattage, jeux de révélation) gardent un comportement identique.
--     Les tours OFFERTS (loyalty/calendar/referral) n'utilisent PAS cette
--     fonction (moteur de tirage inline propre) → hors impact.
-- Postgres n'autorise pas deux surcharges dont l'une, via un défaut, devient
-- appelable avec le même nombre d'arguments (ambiguïté « function is not
-- unique »). On DROP donc la version 6-args puis on recrée en 7-args ; les
-- corps plpgsql appelants se relient au runtime, aucun DROP en cascade.
-- ============================================================

-- ── 1. Registre game_type : sur-ensemble strict (aucune ligne ne peut violer)
alter table public.wheels
  drop constraint if exists wheels_game_type_check;

alter table public.wheels
  add constraint wheels_game_type_check check (
    game_type in (
      'wheel', 'scratch',
      'flip_card', 'cups', 'slot', 'memory', 'chest', 'dice', 'draw_card',
      'rps', 'reflex', 'gauge', 'puzzle', 'mystery_word', 'estimate'
    )
  );

-- ── 2. Paramètres du défi (jsonb libre borné ; forme validée en Zod backend)
alter table public.wheels
  add column if not exists skill_config jsonb;

-- ATTENTION SÉCURITÉ (invariant #4) : skill_config peut contenir des CLÉS
-- SECRÈTES — `mystery_word.word`, `estimate.target`, `estimate.tolerance` —
-- qui ne doivent JAMAIS être sérialisées vers le client. Le contexte public
-- de jeu n'expose QUE des indices publics (longueur/masque du mot, image/
-- indice d'estimation). Défense en profondeur au niveau DB : aucune policy
-- RLS anon/public ne lit `wheels` (policy « wheels: editors » = for all,
-- restreinte à is_org_editor) ; le contexte public passe par service_role /
-- security definer, à qui il incombe de ne pas sélectionner ces clés.
comment on column public.wheels.skill_config is
  'Paramètres du défi skill-gated (par game_type). SERVER-ONLY : les clés '
  'mystery_word.word / estimate.target / estimate.tolerance ne doivent JAMAIS '
  'partir au client — seuls des indices publics (masque, longueur, image) le '
  'peuvent. Forme validée côté backend (Zod).';

alter table public.wheels
  drop constraint if exists wheels_skill_config_size_check;
alter table public.wheels
  add constraint wheels_skill_config_size_check
  check (skill_config is null or pg_column_size(skill_config) <= 8192);

-- ── 3. Tirage-sur-défi : perform_atomic_spin + p_force_losing (default false)
-- Corps identique à 20260720150500 (correctif 42702) hors le nouveau
-- paramètre et la branche « échec de défi ». On DROP la surcharge 6-args
-- pour éviter l'ambiguïté de résolution (cf. en-tête).
drop function if exists public.perform_atomic_spin(uuid,uuid,uuid,text,text,text);

create or replace function public.perform_atomic_spin(
  p_organization_id uuid,
  p_campaign_id uuid,
  p_wheel_id uuid,
  p_player_key text,
  p_engagement_action text,
  p_source text,
  p_force_losing boolean default false
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

  -- Chemin SKILL-GATED (échec de défi) : le backend a évalué le défi côté
  -- serveur et il a ÉCHOUÉ. On matérialise un spin PERDANT forcé qui CONSOMME
  -- la participation / play_limit (anti-brute-force : une tentative ratée
  -- compte comme un jeu — crucial pour mystery_word/estimate), SANS toucher au
  -- stock ni créer de gain. Le tirage pondéré n'a lieu que sur SUCCÈS (appel
  -- standard, p_force_losing = false). La garde limit_reached ci-dessus
  -- s'applique déjà : impossible de ré-essayer dans la même fenêtre.
  if p_force_losing then
    insert into public.spins(
      organization_id, campaign_id, wheel_id, prize_id, is_losing,
      player_key, engagement_action, source, play_window_key
    ) values (
      p_organization_id, p_campaign_id, p_wheel_id, null, true,
      p_player_key, p_engagement_action,
      case when p_source = 'share' then 'share' else 'direct' end,
      v_window_key
    ) returning id into v_spin_id;
    return query select v_spin_id, null::uuid, true, null::text, null::timestamptz;
    return;
  end if;

  loop
    -- (Correctif 42702) : alias `p.` — `is_losing` sans alias entrait en
    -- collision avec la colonne de sortie homonyme du returns table.
    select coalesce(sum(p.weight), 0)::bigint into v_total
    from public.prizes p
    where p.wheel_id = p_wheel_id and p.organization_id = p_organization_id
      and p.is_active and p.weight > 0
      and (p.is_losing or p.stock is null or p.stock > 0);
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

revoke all on function public.perform_atomic_spin(uuid,uuid,uuid,text,text,text,boolean)
  from public, anon, authenticated;
grant execute on function public.perform_atomic_spin(uuid,uuid,uuid,text,text,text,boolean)
  to service_role;
