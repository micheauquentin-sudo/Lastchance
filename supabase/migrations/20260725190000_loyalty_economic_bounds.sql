-- ============================================================
-- Lastchance — Passeport de fidélité : VERROUS ÉCONOMIQUES (GA)
--
-- Arbitrage produit tranché avant la release finale. Six revues successives
-- ont tourné autour du même point : « combien coûte une identité fabriquée ».
-- Toutes les réponses tentées étaient des étranglements de trafic (seaux
-- fail-closed sur IP / programme / organisation) — donc des interrupteurs de
-- déni de service déguisés en sécurité. Cette migration change la QUESTION :
-- elle rend une identité fabriquée SANS VALEUR, ce qui retire son objet à la
-- frappe de masse de passeports et permet de supprimer ces seaux.
--
-- VERROU 1 — stock FINI obligatoire sur tout palier `lot`.
--   `reward_stock` pouvait valoir null = « illimité ». Un palier lot illimité
--   rend la perte maximale d'un programme… illimitée : chaque identité
--   fabriquée qui atteint le palier produit un code de retrait de plus, sans
--   borne. Avec un stock fini, la perte maximale d'un programme vaut
--   EXACTEMENT le stock que le commerçant a lui-même choisi, quelle que soit
--   la quantité de passeports créés. Le budget de l'attaque n'a plus de
--   rendement : au-delà du stock, un passeport supplémentaire ne rapporte
--   plus rien (état `out_of_stock`, déjà modélisé par record_loyalty_stamp).
--
--   Borne inférieure retenue : `>= 0`, PAS `>= 1`.
--   · La propriété qui ferme la boucle économique est la FINITUDE (l'existence
--     d'un plafond), pas la non-nullité : 0 est un plafond parfaitement valide.
--   · « Épuisé » est un état légitime et déjà rendu : le RPC renvoie
--     `out_of_stock` et le passeport l'affiche. Un palier à 0 est donc un
--     palier EN PAUSE, pas un palier cassé.
--   · Sans le 0, mettre un lot en pause obligerait à SUPPRIMER le palier — or
--     `loyalty_rewards` cascade sur `loyalty_milestones` : la suppression
--     détruirait les codes de retrait déjà émis et non encore remis en caisse.
--     Interdire 0 pousserait donc à un geste destructeur pour les clients.
--   Symétrie : un palier `spin` n'a pas de stock (le tour offert consomme le
--   stock des LOTS DE LA ROUE, pas celui du palier) — `reward_stock` y est
--   contraint à null, même style que la contrainte type ↔ target_wheel_id
--   déjà en place. Le backend force déjà cette valeur (milestoneFieldsForType).
--
-- VERROU 2 — un palier ne peut plus se déclencher avant la VISITE 2.
--   `visit_count >= 1` autorisait un palier à la première visite : un passeport
--   FRAÎCHEMENT CRÉÉ valait immédiatement une récompense. C'est le seul cas où
--   fabriquer une identité paie sans rien fournir en échange. À partir de 2, il
--   faut un second passage — donc un second code tournant valide (fenêtre de
--   2 périodes, migration 20260725180000) ou une seconde validation humaine en
--   caisse — SÉPARÉ du premier par le cooldown du programme (plancher 300 s
--   dans les deux modes, loyalty_programs_cooldown_floor_check). Un passeport
--   neuf ne vaut plus RIEN, et le coût d'une récompense fabriquée devient
--   « deux preuves de présence espacées », pas « un POST ».
--
-- CONSÉQUENCE ASSUMÉE, à relayer au volet applicatif : ces deux verrous étant
-- posés en base — donc non contournables par un chemin d'appel oublié — les
-- seaux de création de passeports posés sur des clés PARTAGÉES (IP, programme,
-- organisation) n'ont plus rien à protéger. Ils doivent être retirés ou
-- convertis en observabilité fail-open. Le drapeau `is_new_member` ci-dessous
-- existe précisément pour rendre cette observabilité possible SANS compter des
-- tentatives.
--
-- AJOUT — `is_new_member` dans la réponse de record_loyalty_stamp.
--   Le backend ne savait pas, après coup, si un tampon avait CRÉÉ un passeport
--   ou tamponné un passeport existant : il devait le deviner par un SELECT
--   préalable (course possible) ou compter des TENTATIVES — d'où des seaux
--   consommés par des codes invalides, c'est-à-dire des interrupteurs
--   actionnables gratuitement par un tiers. Le RPC connaît la réponse de façon
--   exacte et sans course : la création est décidée par
--   `insert … on conflict do nothing`, à l'intérieur de la même transaction et
--   sous le verrou du programme. Il la remonte, le backend n'a plus qu'à
--   compter des créations RÉELLES.
--
-- Mise en conformité des données existantes : aucune donnée marchande réelle à
-- ce stade (bêta privée), mais le seed E2E et les fixtures pgTAP contiennent
-- des paliers à la visite 1 et des lots sans stock. Les trois UPDATE
-- ci-dessous sont idempotents, ne relâchent aucun réglage, et sans eux
-- l'ajout des contraintes échouerait à la revalidation.
-- ============================================================

-- ── Mise en conformité 1/3 : paliers à la visite 1 ────────────
-- `unique (program_id, visit_count)` garantit AU PLUS UN palier à la visite 1
-- par programme : le déplacement ne peut donc jamais entrer en collision avec
-- lui-même. On le pousse à la plus petite place LIBRE ≥ 2 du programme, ce qui
-- préserve l'ordre des paliers et n'en supprime aucun (une suppression
-- cascaderait sur loyalty_rewards et détruirait des codes déjà émis).
-- Un programme qui occuperait TOUTES les places de 2 à 1000 ferait échouer la
-- migration sur le NOT NULL — cas sans réalité (999 paliers), et un échec
-- bruyant vaut mieux qu'une donnée silencieusement perdue.
update public.loyalty_milestones ms
   set visit_count = (
     select min(g.v)
       from generate_series(2, 1000) as g(v)
      where not exists (
        select 1 from public.loyalty_milestones o
         where o.program_id = ms.program_id
           and o.visit_count = g.v))
 where ms.visit_count = 1;

-- ── Mise en conformité 2/3 : lots sans stock ─────────────────
-- « Illimité » devient fini. Valeur retenue : ce qui a DÉJÀ été émis, plus une
-- réserve de 50. Deux propriétés voulues :
--   · jamais inférieur à reward_claimed_count — un palier converti ne bascule
--     pas rétroactivement en `out_of_stock` pour des codes déjà distribués ;
--   · borné et modeste — l'exposition maximale reste petite et visible dans le
--     tableau de bord, où le commerçant fixera sa vraie valeur.
update public.loyalty_milestones
   set reward_stock = reward_claimed_count + 50
 where reward_type = 'lot'
   and reward_stock is null;

-- ── Mise en conformité 3/3 : stock parasite sur un palier spin ─
-- Défensif : le backend met déjà null (milestoneFieldsForType), mais une
-- donnée historique ne doit pas bloquer la contrainte de symétrie.
update public.loyalty_milestones
   set reward_stock = null
 where reward_type = 'spin'
   and reward_stock is not null;

-- ── VERROU 2 : palier à partir de la visite 2 ─────────────────
-- CHECK inline de 20260725120000, nommé par Postgres selon la convention
-- <table>_<colonne>_check : remplacé en place, même geste que 20260725150000
-- sur loyalty_programs. Le plafond 1000 est inchangé.
alter table public.loyalty_milestones
  drop constraint if exists loyalty_milestones_visit_count_check;
alter table public.loyalty_milestones
  add constraint loyalty_milestones_visit_count_check
  check (visit_count between 2 and 1000);

-- ── VERROU 1 : stock fini obligatoire sur les paliers lot ─────
-- Contrainte croisant deux colonnes → contrainte de table nommée
-- explicitement, écrite en conjonction d'implications (même style que
-- loyalty_programs_cooldown_floor_check) : chaque type de palier porte sa
-- propre exigence, et un type ajouté plus tard resterait libre tant qu'on ne
-- l'ajoute pas ici. On réutilise le nom auto-généré de l'ancien CHECK de
-- colonne (`reward_stock is null or reward_stock >= 0`), qu'elle remplace.
alter table public.loyalty_milestones
  drop constraint if exists loyalty_milestones_reward_stock_check;
alter table public.loyalty_milestones
  add constraint loyalty_milestones_reward_stock_check
  check (
    (reward_type <> 'lot'
     or (reward_stock is not null and reward_stock >= 0))
    and
    (reward_type <> 'spin' or reward_stock is null)
  );

comment on column public.loyalty_milestones.reward_stock is
  'Stock du lot — OBLIGATOIRE et FINI sur un palier ''lot'' (loyalty_milestones_reward_stock_check), null sur un palier ''spin''. C''est le verrou économique du module : la perte maximale d''un programme vaut exactement ce stock, quel que soit le nombre de passeports créés. 0 est admis et signifie « épuisé / en pause » (record_loyalty_stamp renvoie out_of_stock) — c''est la façon NON destructrice de suspendre un palier, la suppression cascaderait sur les codes déjà émis.';

comment on column public.loyalty_milestones.visit_count is
  'Nombre de visites déclenchant le palier (2 à 1000, unique par programme). Le plancher de 2 est un verrou économique : un passeport fraîchement créé ne déclenche AUCUNE récompense, il faut une seconde visite séparée de la première par le cooldown du programme. Sans lui, fabriquer une identité suffirait à produire une récompense.';

-- ── record_loyalty_stamp : is_new_member + stock strict ───────
-- Corps repris de 20260725180000 (dernière définition), TROIS changements :
--   1. `v_is_new` capturé juste après l'insertion du passeport (FOUND vaut
--      true si et seulement si la ligne a réellement été créée : avec
--      `on conflict do nothing`, un conflit affecte 0 ligne). Aucune course
--      possible — la décision est prise dans CETTE transaction.
--   2. Le drapeau est remonté dans la réponse ('stamped' et 'too_soon', les
--      deux seuls états où un passeport existe). Il reste ABSENT de
--      'unavailable' / 'invalid_code' : ces chemins ne créent aucun passeport
--      et ne doivent renvoyer aucun détail (pas d'oracle).
--   3. Le test de rupture de stock devient `coalesce(reward_stock, 0)` : le
--      stock étant désormais obligatoire sur un lot, un null résiduel ne doit
--      plus signifier « illimité » mais « épuisé ». Fail-closed : si une
--      migration future relâchait la contrainte, le RPC ne se remettrait pas
--      à émettre des codes sans borne.
-- La détection de palier (`ms.visit_count <= v_new_count`) n'a PAS besoin de
-- changer : avec le plancher à 2, un premier tampon (v_new_count = 1) ne peut
-- plus rien sélectionner — l'invariant « un passeport neuf ne vaut rien » tient
-- par la contrainte, pas par une condition dupliquée dans le code.
-- Signature inchangée → types générés inchangés. Grants réémis après le
-- remplacement, comme le font 20260720150500 / 20260724130000 / 20260725180000.
--
-- Réponse jsonb :
--   state: 'unavailable' | 'invalid_code' | 'too_soon' | 'stamped'
--   program: { id, name, validation_mode }        (sauf unavailable/invalid_code)
--   visit_count, tier, tier_thresholds            (dès qu'un passeport existe)
--   is_new_member: bool                           (idem — true ⇔ CE tampon a
--       créé le passeport ; toujours false sur 'too_soon', un passeport neuf
--       n'ayant pas de tampon antérieur)
--   milestones_reached: [{ milestone_id, visit_count, reward_type,
--       lot: reward_label/reward_details/code | out_of_stock,
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

  -- Passeport créé à la première visite (aucune PII). FOUND immédiatement
  -- après l'INSERT distingue la CRÉATION (1 ligne affectée) du simple accès à
  -- un passeport existant (conflit → 0 ligne) : c'est la source de vérité de
  -- `is_new_member`, remontée au backend pour qu'il compte des créations
  -- réelles plutôt que des tentatives.
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
      -- Structurellement false ici (un passeport créé à l'instant n'a pas de
      -- tampon antérieur, donc pas de cooldown) : émis pour que le contrat de
      -- la réponse soit uniforme dès qu'un passeport existe.
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
  -- Sous le verrou du programme : l'attribution des lots (code + stock) est
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
    if v_ms.reward_type = 'lot' then
      -- Stock épuisé : signalé, aucune récompense créée (échec propre). Le
      -- stock est obligatoire sur un lot (loyalty_milestones_reward_stock_check)
      -- et un null résiduel compte pour 0 — « épuisé », jamais « illimité ».
      if coalesce(v_ms.reward_stock, 0) <= v_ms.reward_claimed_count then
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
    -- true ⇔ CE tampon a créé le passeport. Compté par le backend comme une
    -- création RÉELLE (jamais une tentative).
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
