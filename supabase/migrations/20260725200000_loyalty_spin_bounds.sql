-- ============================================================
-- Lastchance — Passeport de fidélité : BORNES DU PALIER `spin` (GA)
--
-- La migration 20260725190000 a posé le verrou économique du module — « la
-- perte maximale d'un programme vaut le stock que le commerçant a choisi » —
-- mais ne l'a appliqué QU'aux paliers `lot`. Elle a même INTERDIT le stock sur
-- un palier `spin`, sur cette prémisse, écrite noir sur blanc dans son en-tête :
-- « le tour offert consomme le stock DES LOTS DE LA ROUE, pas celui du palier ».
--
-- La prémisse est FAUSSE. Un lot de roue est illimité PAR DÉFAUT
-- (`prizes.stock` nullable, « Stock (vide = illimité) » dans l'éditeur de lots),
-- et le tirage de consume_loyalty_spin_grant sort SANS décrément dès que le lot
-- tiré porte `stock is null`. Un palier `spin` était donc, en configuration par
-- défaut, une fabrique de codes de retrait SANS AUCUNE BORNE :
--
--   lire le code affiché au comptoir (geste gratuit et légitime)
--     → frapper N passeports (valeur nulle : le plancher « visite 2 » tient)
--     → attendre le cooldown, rejouer les N cookies
--     → chaque passeport atteint le palier `spin` à la visite 2 → N grants
--     → consume_loyalty_spin_grant tire un lot ILLIMITÉ, sans décrément, sans
--       play_limit, sans fenêtre de campagne
--     → jeton de gain signé → claim → code GAIN-… RÉEL.
--
-- Et si la roue ciblée porte au contraire des stocks FINIS, les N grants les
-- réservent en un passage : la roue de la campagne principale répond `no_prize`
-- à tous les vrais clients. Le trou coûtait donc soit de l'argent sans plafond,
-- soit le produit phare du commerçant.
--
-- Aggravant produit : l'éditeur de programme AFFIRME au commerçant que « chaque
-- lot porte un stock : ces deux règles bornent ce que le programme peut vous
-- coûter ». On le rassurait sur une borne qui n'existait pas pour la moitié des
-- paliers possibles.
--
-- Cette migration ferme les trois portes, dans cet ordre de défense :
--
-- BORNE 1 — stock FINI obligatoire sur TOUT palier, `spin` compris.
--   Sur un palier `spin`, le stock ne compte pas des lots : il compte les
--   GRANTS ÉMIS. C'est exactement la question que le commerçant sait trancher
--   (« combien de tours offerts ce palier peut-il distribuer ? ») et c'est la
--   grandeur qui borne l'attaque, puisque chaque identité fabriquée ne peut
--   rapporter qu'un grant. `>= 0` comme pour les lots : 0 = « en pause », état
--   légitime déjà rendu par `out_of_stock`, seule façon NON destructrice de
--   suspendre un palier (le supprimer cascaderait sur les récompenses émises).
--
-- BORNE 2 — un tour offert ne tire JAMAIS un lot à stock illimité.
--   Défense en profondeur, indépendante du réglage marchand. La roue PUBLIQUE
--   accepte les lots illimités parce qu'elle est bornée ailleurs : `play_limit`
--   par fenêtre et par joueur, statut + dates de campagne, Turnstile, seaux de
--   spin. Le tour offert par la fidélité n'a AUCUNE de ces bornes — c'est sa
--   raison d'être (« le joueur a mérité ce spin »). Il exige donc, en échange,
--   un stock RÉEL : le décrément atomique est alors le compteur de ce qu'il
--   peut coûter. Un lot illimité est simplement exclu du tirage ; si la roue
--   n'en propose pas d'autre, la réponse est `no_prize` — et le grant N'EST PAS
--   consommé (il redeviendra jouable quand le commerçant approvisionnera).
--
-- BORNE 3 — la campagne de la roue cible est vérifiée.
--   consume_loyalty_spin_grant résolvait la roue sans regarder sa campagne : un
--   palier `spin` distribuait donc encore les lots d'une campagne PAUSÉE,
--   ARCHIVÉE, non commencée ou TERMINÉE — alors que le parcours de roue sain
--   (loadPlayContext, src/lib/play-context.ts) refuse ces quatre cas et que
--   perform_atomic_spin ne sert que la roue résolue par ce parcours. Le créneau
--   horaire de la roue (schedule_days / schedule_start_hour / schedule_end_hour,
--   00013 + lib/wheel-schedule.ts) est contrôlé pour la même raison : un horaire
--   configuré ne doit pas être contournable par un tour offert.
--   Comportement retenu quand la campagne est fermée : `unavailable` SANS
--   consommer le grant. Le joueur ne perd pas un tour qu'il a mérité à cause
--   d'une campagne que le commerçant a fermée ; il le rejouera à la
--   réactivation. C'est le même choix que `no_prize` (stock à réapprovisionner).
-- ============================================================

-- ── Mise en conformité 1/2 : compteur de grants déjà émis ─────
-- `reward_claimed_count` n'était pas maintenu sur les paliers `spin` (la
-- branche spin de record_loyalty_stamp ne l'incrémentait pas). Il devient le
-- compteur de la borne : on le remet en accord avec les grants réellement
-- émis, sinon le stock posé juste après démarrerait sur un compteur qui ment.
-- Affectation absolue (pas un incrément) : rejouable sans dérive.
update public.loyalty_milestones ms
   set reward_claimed_count = (
     select count(*)
       from public.loyalty_rewards r
      where r.milestone_id = ms.id
        and r.reward_type = 'spin')
 where ms.reward_type = 'spin'
   and ms.reward_claimed_count <> (
     select count(*)
       from public.loyalty_rewards r
      where r.milestone_id = ms.id
        and r.reward_type = 'spin');

-- ── Mise en conformité 2/2 : paliers spin sans stock ──────────
-- Miroir exact de la conversion des lots en 20260725190000 : ce qui a déjà été
-- émis, plus une réserve de 50. Jamais inférieur à reward_claimed_count (aucun
-- palier ne bascule rétroactivement en `out_of_stock` pour des grants déjà
-- distribués), borné et modeste — le commerçant fixera sa vraie valeur depuis
-- le tableau de bord. Idempotent : ne touche que les stocks null.
update public.loyalty_milestones
   set reward_stock = reward_claimed_count + 50
 where reward_type = 'spin'
   and reward_stock is null;

-- ── BORNE 1 : stock fini obligatoire sur TOUT palier ──────────
-- Remplace la contrainte de 20260725190000, qui exigeait le stock sur `lot` et
-- l'INTERDISAIT sur `spin`. Même style d'implication : un type de palier ajouté
-- plus tard resterait libre tant qu'on ne l'ajoute pas à cette liste.
alter table public.loyalty_milestones
  drop constraint if exists loyalty_milestones_reward_stock_check;
alter table public.loyalty_milestones
  add constraint loyalty_milestones_reward_stock_check
  check (
    reward_type not in ('lot', 'spin')
    or (reward_stock is not null and reward_stock >= 0)
  );

comment on column public.loyalty_milestones.reward_stock is
  'Stock du palier — OBLIGATOIRE et FINI sur TOUT palier, ''lot'' comme ''spin'' (loyalty_milestones_reward_stock_check). Sur un ''lot'' il compte les codes de retrait émis ; sur un ''spin'' il compte les TOURS OFFERTS émis (pas les lots de la roue, qui peuvent être illimités). C''est le verrou économique du module : la perte maximale d''un programme vaut exactement ce stock, quel que soit le nombre de passeports créés. 0 est admis et signifie « épuisé / en pause » (record_loyalty_stamp renvoie out_of_stock) — c''est la façon NON destructrice de suspendre un palier, la suppression cascaderait sur les récompenses déjà émises.';

comment on column public.loyalty_milestones.reward_claimed_count is
  'Récompenses déjà émises par ce palier (codes de retrait pour un ''lot'', tours offerts pour un ''spin''). Maintenu par record_loyalty_stamp seul (RPC-only, jamais accordé à authenticated) : c''est le compteur qui borne reward_stock.';

-- ── record_loyalty_stamp : le stock couvre AUSSI la branche spin ─
-- Corps repris de 20260725190000 (dernière définition), UN changement : le test
-- de rupture de stock et l'incrément de reward_claimed_count passent AVANT le
-- `if v_ms.reward_type = 'lot'`. Ils couvrent donc les deux branches à
-- l'identique, sous le même verrou de programme — l'attribution des tours
-- offerts est sérialisée comme celle des lots, sans double émission.
--
-- Deux détails de forme :
--   · le `reward_type` de la réponse `out_of_stock` est désormais celui de la
--     LIGNE (v_ms.reward_type) et non le littéral 'lot' : un palier spin épuisé
--     doit se présenter comme un palier spin. L'état `out_of_stock` lui-même
--     est déjà modélisé côté app (mapLoyaltyStampResult) et s'applique tel quel.
--   · l'incrément précède l'insertion de la récompense. Aucune fuite possible :
--     une génération de code/grant qui échouerait lèverait une exception et
--     annulerait la transaction entière, compteur compris.
-- `coalesce(reward_stock, 0)` conservé (fail-closed) : si une migration future
-- relâchait la contrainte, un null résiduel signifierait « épuisé », jamais
-- « illimité ».
-- Signature inchangée → types générés inchangés. Grants réémis après le
-- remplacement, comme le font 20260720150500 / 20260725180000 / 20260725190000.
--
-- Réponse jsonb :
--   state: 'unavailable' | 'invalid_code' | 'too_soon' | 'stamped'
--   program: { id, name, validation_mode }        (sauf unavailable/invalid_code)
--   visit_count, tier, tier_thresholds            (dès qu'un passeport existe)
--   is_new_member: bool                           (idem)
--   milestones_reached: [{ milestone_id, visit_count, reward_type,
--       out_of_stock (lot ET spin) | lot: reward_label/reward_details/code |
--       spin: target_wheel_id/grant_token }]      (paliers de ce tour)
--   next_milestone: { visit_count, reward_type } | null
--   retry_in_seconds                              (too_soon)
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
  v_is_new boolean := false;
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
  -- l'attribution des récompenses. Réponse 'unavailable' identique quel que
  -- soit le motif (addon coupé, brouillon, archivé) : pas d'oracle.
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
    -- Tolérance de DEUX fenêtres : la courante et la précédente (voir
    -- 20260725180000). La durée d'acceptation d'un code vaut donc
    -- 2 · rotating_period_seconds, bornée par le cooldown via
    -- loyalty_programs_cooldown_floor_check.
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

  -- Passeport créé à la première visite (aucune PII). FOUND immédiatement
  -- après l'INSERT distingue la CRÉATION (1 ligne affectée) du simple accès à
  -- un passeport existant (conflit → 0 ligne) : source de vérité de
  -- `is_new_member`.
  insert into public.loyalty_members (program_id, organization_id, token_hash)
  values (v_prog.id, v_prog.organization_id, p_member_token_hash)
  on conflict (program_id, token_hash) do nothing;
  v_is_new := found;

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
      'is_new_member', v_is_new,
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
  -- Sous le verrou du programme : l'attribution (stock + code/grant) est
  -- sérialisée, sans double émission. Le plancher visit_count >= 2 garantit
  -- qu'un premier tampon (v_new_count = 1) ne sélectionne jamais rien.
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
    -- Rupture de stock — COMMUNE aux deux types de palier. Un lot épuisé
    -- n'émet pas de code, un palier spin épuisé n'émet pas de tour offert :
    -- dans les deux cas le palier est signalé, aucune récompense n'est créée
    -- (échec propre), et le passeport supplémentaire ne rapporte plus rien.
    -- C'est ce qui donne au stock choisi par le commerçant la valeur de
    -- PLAFOND DE PERTE annoncée dans l'éditeur de programme.
    if coalesce(v_ms.reward_stock, 0) <= v_ms.reward_claimed_count then
      v_reached := v_reached || pg_catalog.jsonb_build_object(
        'milestone_id', v_ms.id, 'visit_count', v_ms.visit_count,
        'reward_type', v_ms.reward_type, 'out_of_stock', true,
        'reward_label', v_ms.reward_label);
      continue;
    end if;
    update public.loyalty_milestones
       set reward_claimed_count = reward_claimed_count + 1
     where id = v_ms.id;

    if v_ms.reward_type = 'lot' then
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
      v_reached := v_reached || pg_catalog.jsonb_build_object(
        'milestone_id', v_ms.id, 'visit_count', v_ms.visit_count,
        'reward_type', 'lot', 'code', v_code,
        'reward_label', v_ms.reward_label, 'reward_details', v_ms.reward_details);
    else
      -- Tour de roue offert : grant_token à usage unique, décompté du stock
      -- du palier au même titre qu'un code de retrait.
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
    'is_new_member', v_is_new,
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

-- ── consume_loyalty_spin_grant : campagne vérifiée, lot fini exigé ─
-- Corps repris de 20260725120000, DEUX changements (bornes 2 et 3 de l'en-tête).
-- Signature et contrat de réponse inchangés (`unavailable` couvre déjà le cas
-- « pas jouable maintenant », sans oracle sur le motif).
--
-- Réponse jsonb :
--   state: 'unavailable' | 'already_consumed' | 'no_prize' | 'spun'
--   spin_id, wheel_id, prize_id, is_losing                (spun)
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
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'not authorized';
  end if;
  if p_member_token_hash is null or p_member_token_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid member token';
  end if;

  -- Grant résolu ET lié au passeport appelant (défense en profondeur : un
  -- grant_token seul, sans le cookie du membre, ne suffit pas). Verrou de
  -- ligne : anti-rejeu.
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

  -- Roue cible (garantie même organisation par la FK du palier), AVEC sa
  -- campagne, son créneau et le fuseau de l'organisation : le tour offert doit
  -- passer les mêmes portes que la roue publique.
  select ms.target_wheel_id into v_wheel_id
    from public.loyalty_milestones ms where ms.id = v_reward.milestone_id;

  select w.id, w.campaign_id, w.organization_id,
         w.schedule_start_hour, w.schedule_end_hour, w.schedule_days,
         c.status, c.starts_at, c.ends_at, o.timezone
    into v_wheel_id, v_campaign_id, v_org_id,
         v_sched_start, v_sched_end, v_sched_days,
         v_camp_status, v_camp_starts, v_camp_ends, v_timezone
    from public.wheels w
    join public.campaigns c
      on c.id = w.campaign_id and c.organization_id = w.organization_id
    join public.organizations o on o.id = w.organization_id
   where w.id = v_wheel_id;
  if not found then
    return pg_catalog.jsonb_build_object('state', 'unavailable');
  end if;

  -- BORNE 3 — statut et fenêtre de la campagne, comme loadPlayContext.
  -- Campagne en brouillon, en pause, archivée, pas encore commencée ou
  -- terminée : le tour offert n'est pas jouable MAINTENANT. On sort AVANT
  -- toute écriture — le grant reste intact et redeviendra jouable si la
  -- campagne repasse active. Le joueur ne perd pas un tour mérité.
  if v_camp_status <> 'active'
     or (v_camp_starts is not null and v_camp_starts > v_now)
     or (v_camp_ends is not null and v_camp_ends < v_now) then
    return pg_catalog.jsonb_build_object('state', 'unavailable');
  end if;

  -- Créneau horaire de la roue (00013 ; miroir de wheelMatchesNow,
  -- src/lib/wheel-schedule.ts) évalué dans le fuseau de l'organisation.
  -- Une roue sans créneau est toujours ouverte. `schedule_days` suit la
  -- convention JS et `extract(dow)` : 0 = dimanche.
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
      -- Créneau à cheval sur minuit (22h→02h) : à 01h le samedi, le créneau
      -- appartient au vendredi.
      v_ref_day := case when v_hour < v_end then (v_dow + 6) % 7 else v_dow end;
      v_in_window := (pg_catalog.array_length(v_sched_days, 1) is null
                      or v_ref_day = any(v_sched_days))
                     and (v_hour >= v_start or v_hour < v_end);
    end if;
  end if;
  if not v_in_window then
    return pg_catalog.jsonb_build_object('state', 'unavailable');
  end if;

  -- Tirage pondéré atomique (même algorithme que perform_atomic_spin, SANS
  -- contrôle de fenêtre de jeu — le joueur a mérité ce spin).
  --
  -- BORNE 2 — divergence VOULUE avec perform_atomic_spin : le filtre est
  -- `(p.is_losing or p.stock > 0)` et NON `(p.is_losing or p.stock is null or
  -- p.stock > 0)`. Un lot à stock illimité (`stock is null`, le défaut de
  -- l'éditeur de lots) est EXCLU du tirage. La roue publique peut se le
  -- permettre : elle est bornée par play_limit, par le statut et les dates de
  -- campagne, par Turnstile et par les seaux de spin. Le tour offert n'a
  -- aucune de ces bornes ; sa seule borne possible est le décrément d'un stock
  -- RÉEL. Conséquence assumée : une roue qui ne propose que des lots illimités
  -- renvoie `no_prize` — sans consommer le grant, qui redeviendra jouable dès
  -- que le commerçant aura posé un stock.
  loop
    select coalesce(sum(p.weight), 0)::bigint into v_total
      from public.prizes p
     where p.wheel_id = v_wheel_id and p.organization_id = v_org_id
       and p.is_active and p.weight > 0
       and (p.is_losing or p.stock > 0);
    if v_total <= 0 then
      -- Aucun lot éligible : le grant reste NON consommé (rejouable quand le
      -- commerçant approvisionne).
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

    -- Un lot gagnant tiré ici porte forcément un stock FINI et > 0 : seule une
    -- réservation concurrente peut l'avoir vidé entre le SELECT et l'UPDATE, on
    -- reboucle alors sur un total recalculé (et l'on finit sur `no_prize` si
    -- plus rien n'est disponible).
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

  -- Grant consommé (une seule fois) → spin résultant journalisé.
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
