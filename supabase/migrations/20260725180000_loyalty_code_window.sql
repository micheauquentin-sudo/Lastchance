-- ============================================================
-- Lastchance — Fenêtre d'acceptation du code tournant ≤ cooldown
--
-- MOYEN-D (4e revue sécurité du Passeport de fidélité) — un code observé
-- valait DEUX tampons sur le même passeport.
--
-- En mode `rotating_code`, lire le code à 6 chiffres est LÉGITIME et
-- gratuit : il est affiché en clair sur l'écran du comptoir, c'est le
-- fonctionnement nominal. La seule chose qui borne son usage est le
-- cooldown par passeport (min_stamp_interval_seconds). Or les deux
-- durées étaient désalignées :
--
--   · record_loyalty_stamp acceptait le code sur TROIS fenêtres
--     (`for d in -1..1`, migration 20260725120000) : un code émis pour le
--     compteur c est accepté tant que floor(now/T) ∈ {c-1, c, c+1}, soit
--     de (c-1)·T à (c+2)·T — une durée d'acceptation de 3·T ;
--   · le plancher de cooldown valait greatest(300, T) (20260725150000
--     puis 20260725170000), soit 300 s pour toute période ≤ 300 s.
--
-- À T = 300 s (le plafond), un code restait acceptable 900 s alors que le
-- cooldown n'en couvrait que 300 : UNE observation suffisait pour deux
-- tampons sur un même passeport, ce qui vide le cooldown de son sens.
--
-- INVARIANT POSÉ ICI — la durée d'acceptation d'un code est toujours
-- INFÉRIEURE OU ÉGALE au cooldown du passeport. Deux leviers combinés :
--
--   1. Tolérance ramenée de ±1 (3 fenêtres) à `-1..0` (2 fenêtres).
--      La tolérance « future » (d = +1) était du poids mort : le code
--      affiché est TOUJOURS calculé par Postgres (current_loyalty_code,
--      horloge de la base) et vérifié par Postgres, sur la même horloge —
--      il n'existe aucun émetteur en avance à rattraper. La tolérance
--      « passée » (d = -1), elle, est utile : elle absorbe la latence
--      humaine entre la lecture du code à l'écran et l'envoi du
--      formulaire, à cheval sur une bascule de fenêtre. Coût UX : nul.
--      Effet secondaire : la surface de devinette passe de 3·10⁻⁶ à
--      2·10⁻⁶ par essai.
--   2. CHECK renforcé en mode `rotating_code` :
--      min_stamp_interval_seconds >= 2 · rotating_period_seconds,
--      EN PLUS du plancher absolu de 300 s. Le facteur 2 est exactement
--      le nombre de fenêtres acceptées au point 1 — les deux doivent
--      bouger ensemble.
--
--      Volontairement calé sur la durée d'acceptation BRUTE (2·T, de
--      (c-1)·T à (c+1)·T) et non sur la durée résiduelle après première
--      lecture (T, le code n'étant lisible qu'à partir de c·T). La borne
--      brute ne dépend d'aucune hypothèse sur le moment où l'attaquant
--      obtient le code.
--
-- Preuve de l'invariant : un tampon posé à l'instant t avec un code de
-- compteur c impose c ∈ {floor(t/T)-1, floor(t/T)} donc c ≤ floor(t/T).
-- Ce code cesse d'être accepté à (c+1)·T ≤ (floor(t/T)+1)·T ≤ t + T
-- (car floor(t/T)·T ≤ t). Le passeport, lui, est bloqué jusqu'à
-- t + min_stamp_interval_seconds ≥ t + 2·T > t + T. Le même code ne peut
-- donc JAMAIS produire un second tampon sur ce passeport : quand le
-- cooldown expire, le code est mort depuis au moins T secondes.
--
-- Ce que cette migration ne prétend PAS corriger : rien ici ne borne la
-- CRÉATION d'identités (un code observé vaut toujours un tampon sur
-- chaque passeport neuf). C'est le finding A, traité côté applicatif —
-- la base n'a pas le contexte (IP, Turnstile) pour l'arbitrer. Le SELECT
-- de bornage `isKnownPassport` (src/actions/loyalty.ts) filtre sur
-- (program_id, token_hash) : la contrainte UNIQUE de même nom sur
-- public.loyalty_members (migration 20260725120000, ligne « unique
-- (program_id, token_hash) ») fournit déjà l'index couvrant exact et
-- l'unicité qui rend ce SELECT fiable — rien à ajouter, la couverture
-- est verrouillée par une assertion pgTAP (loyalty.test.sql).
--
-- Données existantes : l'UPDATE de mise en conformité ci-dessous relève
-- les programmes `rotating_code` sous le nouveau plancher (au plus à 600 s,
-- le plafond de période valant 300 s). Il resserre uniquement, ne relâche
-- aucun réglage, est idempotent, et sans lui l'ajout de la contrainte
-- échouerait. Le mode `staff` est inchangé (plancher 300 s).
-- ============================================================

-- ── Mise en conformité des données existantes ────────────────
update public.loyalty_programs
   set min_stamp_interval_seconds =
         greatest(min_stamp_interval_seconds, 300, 2 * rotating_period_seconds)
 where validation_mode = 'rotating_code'
   and min_stamp_interval_seconds < greatest(300, 2 * rotating_period_seconds);

-- ── Plancher de cooldown : branche `rotating_code` renforcée ──
-- Même nom de contrainte qu'en 20260725170000, remplacée en place
-- (drop/add), même style en conjonction d'implications : chaque mode porte
-- son propre plancher, et un mode ajouté plus tard resterait libre tant
-- qu'on ne l'ajoute pas ici. Seule la branche `rotating_code` change :
-- `>= rotating_period_seconds` devient `>= 2 * rotating_period_seconds`,
-- soit la durée d'acceptation complète d'un code après le point 1.
alter table public.loyalty_programs
  drop constraint if exists loyalty_programs_cooldown_floor_check;
alter table public.loyalty_programs
  add constraint loyalty_programs_cooldown_floor_check
  check (
    (validation_mode <> 'rotating_code'
     or (min_stamp_interval_seconds >= 300
         and min_stamp_interval_seconds >= 2 * rotating_period_seconds))
    and
    (validation_mode <> 'staff'
     or min_stamp_interval_seconds >= 300)
  );

-- ── Tolérance de fenêtre ramenée à 2 fenêtres (`-1..0`) ───────
-- Corps repris à l'identique de 20260725120000 (aucune autre migration ne
-- l'a redéfini) : SEULE la boucle de tolérance change, ainsi que le
-- commentaire qui la précède. Signature inchangée, donc types générés
-- inchangés. Les grants sont réémis après le remplacement, comme le fait
-- déjà 20260720150500 / 20260724130000.
create or replace function public.record_loyalty_stamp(
  p_program_id uuid,
  p_member_token_hash text,
  p_rotating_code text default null,
  p_validated_by uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_prog public.loyalty_programs%rowtype;
  v_member public.loyalty_members%rowtype;
  v_now timestamptz := pg_catalog.now();
  v_code_in text;
  v_counter bigint;
  v_mac bytea;
  v_off integer;
  v_bin bigint;
  v_ok boolean;
  d integer;
  v_new_count integer;
  v_tier text;
  v_reached jsonb := '[]'::jsonb;
  v_ms public.loyalty_milestones%rowtype;
  v_next_visit integer;
  v_next_type text;
  v_alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  v_code text;
  v_grant text;
  v_bytes bytea;
  i integer;
  attempt integer;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'not authorized';
  end if;
  if p_member_token_hash is null or p_member_token_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid member token';
  end if;

  -- Verrou sur le programme : fige réglages, stock des paliers et sérialise
  -- l'attribution des lots. Réponse 'unavailable' identique quel que soit
  -- le motif (addon coupé, brouillon, archivé) : pas d'oracle.
  select p.* into v_prog
    from public.loyalty_programs p
    join public.organizations o on o.id = p.organization_id
   where p.id = p_program_id
     and o.addon_loyalty
   for update of p;
  if not found or v_prog.status <> 'active' then
    return pg_catalog.jsonb_build_object('state', 'unavailable');
  end if;

  -- Validation selon le mode du programme (AVANT toute création de
  -- passeport : un code invalide n'inscrit personne).
  if v_prog.validation_mode = 'rotating_code' then
    v_code_in := pg_catalog.regexp_replace(coalesce(p_rotating_code, ''), '\D', '', 'g');
    if pg_catalog.length(v_code_in) <> 6 then
      return pg_catalog.jsonb_build_object('state', 'invalid_code');
    end if;
    v_counter := pg_catalog.floor(extract(epoch from v_now) / v_prog.rotating_period_seconds)::bigint;
    v_ok := false;
    -- Tolérance de DEUX fenêtres : la courante et la précédente. La fenêtre
    -- précédente absorbe la latence humaine entre la lecture du code à
    -- l'écran du comptoir et l'envoi du formulaire, à cheval sur une
    -- bascule. Pas de fenêtre future : l'affichage (current_loyalty_code)
    -- et la vérification tournent tous deux sur l'horloge de CETTE base,
    -- il n'y a aucun émetteur en avance à rattraper.
    -- La durée d'acceptation d'un code vaut donc 2 · rotating_period_seconds,
    -- valeur bornée par le cooldown via loyalty_programs_cooldown_floor_check :
    -- un code observé ne peut pas produire deux tampons sur un passeport.
    for d in -1..0 loop
      v_mac := extensions.hmac(pg_catalog.int8send(v_counter + d), v_prog.rotating_secret, 'sha1');
      v_off := pg_catalog.get_byte(v_mac, 19) & 15;
      v_bin := ((pg_catalog.get_byte(v_mac, v_off) & 127)::bigint * 16777216)
             + (pg_catalog.get_byte(v_mac, v_off + 1)::bigint * 65536)
             + (pg_catalog.get_byte(v_mac, v_off + 2)::bigint * 256)
             + (pg_catalog.get_byte(v_mac, v_off + 3)::bigint);
      if pg_catalog.lpad((v_bin % 1000000)::text, 6, '0') = v_code_in then
        v_ok := true;
        exit;
      end if;
    end loop;
    if not v_ok then
      return pg_catalog.jsonb_build_object('state', 'invalid_code');
    end if;
  else
    -- Mode staff : l'appelant DOIT fournir l'identité du validateur
    -- (l'action backend l'a authentifié comme membre autorisé). Ferme le
    -- chemin public (p_validated_by null) sur un programme staff.
    if p_validated_by is null then
      return pg_catalog.jsonb_build_object('state', 'unavailable');
    end if;
  end if;

  -- Passeport créé à la première visite (aucune PII).
  insert into public.loyalty_members (program_id, organization_id, token_hash)
  values (v_prog.id, v_prog.organization_id, p_member_token_hash)
  on conflict (program_id, token_hash) do nothing;
  select m.* into v_member
    from public.loyalty_members m
   where m.program_id = v_prog.id and m.token_hash = p_member_token_hash
   for update;

  -- Cooldown depuis le dernier tampon (anti-abus).
  if v_member.last_stamp_at is not null
     and v_prog.min_stamp_interval_seconds > 0
     and v_member.last_stamp_at
         + pg_catalog.make_interval(secs => v_prog.min_stamp_interval_seconds) > v_now then
    return pg_catalog.jsonb_build_object(
      'state', 'too_soon',
      'retry_in_seconds', pg_catalog.ceil(extract(epoch from
        v_member.last_stamp_at
        + pg_catalog.make_interval(secs => v_prog.min_stamp_interval_seconds)
        - v_now))::integer,
      'program', pg_catalog.jsonb_build_object(
        'id', v_prog.id, 'name', v_prog.name,
        'validation_mode', v_prog.validation_mode),
      'visit_count', v_member.visit_count,
      'tier', case
        when v_member.visit_count >= v_prog.gold_threshold then 'gold'
        when v_member.visit_count >= v_prog.silver_threshold then 'silver'
        else 'bronze' end,
      'tier_thresholds', pg_catalog.jsonb_build_object(
        'silver', v_prog.silver_threshold, 'gold', v_prog.gold_threshold)
    );
  end if;

  -- Visite validée : incrément + recalcul du niveau + tampon.
  v_new_count := v_member.visit_count + 1;
  v_tier := case
    when v_new_count >= v_prog.gold_threshold then 'gold'
    when v_new_count >= v_prog.silver_threshold then 'silver'
    else 'bronze' end;
  update public.loyalty_members
     set visit_count = v_new_count, last_stamp_at = v_now, tier = v_tier
   where id = v_member.id;
  insert into public.loyalty_stamps
    (member_id, program_id, organization_id, stamped_at, mode, validated_by)
  values (v_member.id, v_prog.id, v_prog.organization_id, v_now,
          v_prog.validation_mode, p_validated_by);

  -- Paliers nouvellement atteints (visit_count <= total ET pas déjà gagnés).
  -- Sous le verrou du programme : l'attribution des lots (code + stock) est
  -- sérialisée, sans double émission.
  for v_ms in
    select ms.* from public.loyalty_milestones ms
     where ms.program_id = v_prog.id
       and ms.visit_count <= v_new_count
       and not exists (
         select 1 from public.loyalty_rewards r
          where r.member_id = v_member.id and r.milestone_id = ms.id
       )
     order by ms.visit_count
  loop
    if v_ms.reward_type = 'lot' then
      -- Stock épuisé : signalé, aucune récompense créée (échec propre).
      if v_ms.reward_stock is not null
         and v_ms.reward_claimed_count >= v_ms.reward_stock then
        v_reached := v_reached || pg_catalog.jsonb_build_object(
          'milestone_id', v_ms.id, 'visit_count', v_ms.visit_count,
          'reward_type', 'lot', 'out_of_stock', true,
          'reward_label', v_ms.reward_label);
        continue;
      end if;
      v_code := null;
      for attempt in 1..8 loop
        v_bytes := extensions.gen_random_bytes(8);
        v_code := 'FIDELITE-';
        for i in 0..7 loop
          v_code := v_code || pg_catalog.substr(
            v_alphabet, pg_catalog.get_byte(v_bytes, i) % pg_catalog.length(v_alphabet) + 1, 1);
        end loop;
        begin
          insert into public.loyalty_rewards
            (member_id, program_id, organization_id, milestone_id,
             reward_type, code, earned_at)
          values (v_member.id, v_prog.id, v_prog.organization_id, v_ms.id,
                  'lot', v_code, v_now);
          exit;
        exception when unique_violation then
          -- Collision de code (le verrou programme exclut un double palier).
          v_code := null;
        end;
      end loop;
      if v_code is null then
        raise exception 'code generation exhausted';
      end if;
      update public.loyalty_milestones
         set reward_claimed_count = reward_claimed_count + 1
       where id = v_ms.id;
      v_reached := v_reached || pg_catalog.jsonb_build_object(
        'milestone_id', v_ms.id, 'visit_count', v_ms.visit_count,
        'reward_type', 'lot', 'code', v_code,
        'reward_label', v_ms.reward_label, 'reward_details', v_ms.reward_details);
    else
      -- Tour de roue offert : grant_token à usage unique.
      v_grant := null;
      for attempt in 1..8 loop
        v_grant := pg_catalog.encode(extensions.gen_random_bytes(24), 'hex');
        begin
          insert into public.loyalty_rewards
            (member_id, program_id, organization_id, milestone_id,
             reward_type, grant_token, earned_at)
          values (v_member.id, v_prog.id, v_prog.organization_id, v_ms.id,
                  'spin', v_grant, v_now);
          exit;
        exception when unique_violation then
          v_grant := null;
        end;
      end loop;
      if v_grant is null then
        raise exception 'grant generation exhausted';
      end if;
      v_reached := v_reached || pg_catalog.jsonb_build_object(
        'milestone_id', v_ms.id, 'visit_count', v_ms.visit_count,
        'reward_type', 'spin', 'target_wheel_id', v_ms.target_wheel_id,
        'grant_token', v_grant);
    end if;
  end loop;

  -- Prochain palier (le plus proche strictement au-dessus).
  select ms.visit_count, ms.reward_type into v_next_visit, v_next_type
    from public.loyalty_milestones ms
   where ms.program_id = v_prog.id and ms.visit_count > v_new_count
   order by ms.visit_count
   limit 1;

  return pg_catalog.jsonb_build_object(
    'state', 'stamped',
    'program', pg_catalog.jsonb_build_object(
      'id', v_prog.id, 'name', v_prog.name,
      'validation_mode', v_prog.validation_mode),
    'visit_count', v_new_count,
    'tier', v_tier,
    'tier_thresholds', pg_catalog.jsonb_build_object(
      'silver', v_prog.silver_threshold, 'gold', v_prog.gold_threshold),
    'milestones_reached', v_reached,
    'next_milestone', case when v_next_visit is null then null
      else pg_catalog.jsonb_build_object(
        'visit_count', v_next_visit, 'reward_type', v_next_type) end
  );
end;
$$;

revoke all on function public.record_loyalty_stamp(uuid, text, text, uuid)
  from public, anon, authenticated;
grant execute on function public.record_loyalty_stamp(uuid, text, text, uuid)
  to service_role;

comment on column public.loyalty_programs.min_stamp_interval_seconds is
  'Cooldown anti-abus entre deux tampons d''un même passeport (défaut 24 h). Plancher de 300 s imposé dans les deux modes par loyalty_programs_cooldown_floor_check : rotating_code = greatest(2 * rotating_period_seconds, 300) — un code affiché au comptoir est accepté sur 2 fenêtres (record_loyalty_stamp), le cooldown couvre donc au moins toute sa durée de validité et un code observé ne vaut jamais deux tampons ; staff = 300 s, soit la TTL du jeton de check-in (LOYALTY_CHECKIN_TTL_MS = 180 s) plus 120 s de marge — ce jeton n''étant pas à usage unique, un plancher égal ou inférieur à sa TTL laisserait un écart d''horloge entre instances rouvrir une fenêtre de rejeu.';

comment on column public.loyalty_programs.rotating_period_seconds is
  'Période de rotation du code tournant (15 à 300 s). Un code est accepté sur 2 fenêtres (la courante et la précédente, record_loyalty_stamp), soit une validité de 2 * rotating_period_seconds : allonger la période allonge d''autant la fenêtre de devinette et de relais, et impose mécaniquement un cooldown au moins égal (loyalty_programs_cooldown_floor_check).';
