-- ============================================================
-- Lastchance — Module « Créateur de quiz »
--
-- Addon d'organisation (miroir EXACT d'addon_calendar / addon_events /
-- addon_jackpot / addon_loyalty / addon_hunts) : le commerçant compose un QUIZ
-- que ses clients jouent depuis un QR / un lien, EN LIBRE-SERVICE et de façon
-- ASYNCHRONE — chacun à son rythme, sans animateur, sans écran partagé.
--
-- Ce module est DÉDIÉ (ce n'est pas un event_kind des pronostics, ni un
-- déroulé live du module « Événement ») car son cycle de vie diffère : pas de
-- session, pas de machine à états, pas de phase pilotée par un organisateur.
-- Une participation est ouverte par le joueur, avance question par question et
-- se clôt par finish_quiz. La comparaison utile :
--   · event_sessions = SYNCHRONE, l'organisateur lance chaque question ;
--   · quizzes        = ASYNCHRONE, le JOUEUR démarre chaque question.
--
-- ── MODÉLISATION DES 7 TYPES DE QUESTION (point de design central) ──
-- Le besoin produit énumère 7 modèles : choix multiple, vrai/faux, image
-- mystère, estimation numérique, question chronométrée, classement de
-- réponses, pronostic libre. Les stocker comme 7 valeurs de `question_type`
-- dupliquerait la même mécanique trois fois. Deux d'entre eux ne sont PAS des
-- formes de réponse :
--   · « question chronométrée » est une DIMENSION TRANSVERSALE : c'est
--     `time_limit_seconds` (nullable = pas de chronomètre), applicable à
--     N'IMPORTE QUEL type. En faire un type interdirait « choix multiple
--     chronométré » — pourtant l'usage le plus demandé ;
--   · « vrai/faux » est un CHOIX MULTIPLE À DEUX OPTIONS : même stockage,
--     même évaluation, seul le rendu diffère ;
--   · « image mystère » est un MÉDIA attaché à la question (`image_url`), pas
--     une forme de réponse : on peut demander de reconnaître une image par un
--     choix multiple OU par une réponse libre.
--
-- D'où la séparation reprise TEXTUELLEMENT du patron `contests.event_kind` vs
-- `contest_matches.question_type` (20260801120000) :
--   · `question_type` = LE MOTEUR, 4 valeurs, une par FORME DE RÉPONSE :
--       choice  → un identifiant d'option (couvre choix multiple ET vrai/faux)
--       number  → un nombre, avec `tolerance` (estimation numérique)
--       ranking → un tableau ordonné d'identifiants (classement de réponses)
--       text    → une chaîne, comparée à des variantes acceptées (pronostic
--                 libre)
--   · `preset` = LE MODÈLE D'UI, contraint en FORME seulement (pas
--     d'énumération figée, exactement comme `event_kind`) : les 7 modèles du
--     besoin s'y expriment — multiple_choice, true_false, mystery_image,
--     estimate, timed, ranking, free_prediction — et un 8e modèle n'exigera
--     AUCUNE migration. Le moteur IGNORE `preset` : il ne lit que
--     `question_type`, `options`, `correct_answer`, `tolerance`,
--     `ranking_size` et `time_limit_seconds`.
-- Bénéfice concret : la validation de forme et l'évaluation RÉUTILISENT
-- `is_valid_contest_options` / `is_valid_contest_answer` des pronostics pour
-- choice/number/ranking — trois des quatre types ne coûtent aucune ligne de
-- validation neuve. Seul `text` est propre au quiz.
--
-- ── INVARIANTS DE SÉCURITÉ (critiques) ──
--   1. CHRONOMÈTRE SERVEUR-AUTORITATIF, INFORGEABLE. Aucune RPC n'accepte de
--      paramètre de temps. `start_quiz_question` pose
--      `quiz_answers.started_at = now()` CÔTÉ SERVEUR, une seule fois : un
--      second appel renvoie le started_at DÉJÀ POSÉ (on conflict do nothing) —
--      impossible de remettre le chronomètre à zéro. `submit_quiz_answer`
--      calcule `elapsed_ms = now() - started_at` EN BASE et refuse la réponse
--      (jamais scorée) au-delà de `time_limit_seconds`. Patron repris de
--      `launch_event_question` / `submit_event_answer` (20260727120000).
--   2. NON-FUITE DE LA VÉRITÉ. `quiz_questions.correct_answer` est connue dès
--      la création (c'est la différence avec `prono` du module événement) et
--      n'est JAMAIS servie au public avant que CE joueur ait répondu :
--      `start_quiz_question` ne la renvoie pas, `quiz_public_state` ne
--      l'attache qu'aux questions déjà répondues PAR CE JOUEUR (patron exact
--      de `calendar_public_state`, où le contenu d'une case n'est joint qu'aux
--      cases déjà ouvertes). Aucun accès anon à la table. Les réponses des
--      AUTRES joueurs ne sont jamais exposées : le classement ne publie que
--      prénom / avatar / score / temps.
--   3. UNE SEULE RÉPONSE PAR (joueur, question), IMMUABLE. Unicité
--      (player_id, question_id) + trigger `quiz_answers_freeze` qui REFUSE
--      toute écriture sur une ligne déjà répondue et tout déplacement de
--      `started_at` — y compris depuis le service_role. Aucune seconde
--      tentative pour deviner.
--   4. BORNE ÉCONOMIQUE (ADR-031). `reward_stock` FINI et OBLIGATOIRE dès que
--      le mode émet un lot (CHECK par mode, à la manière de
--      `calendar_days_lot_stock_check`), décrément ATOMIQUE et CONDITIONNEL
--      sous le verrou du quiz, `out_of_stock` propre. Verrou STRUCTUREL en
--      plus : `quizzes_reward_bounds_check (reward_claimed_count <=
--      reward_stock)` et `unique (quiz_id, player_id)` sur quiz_rewards.
--   5. TIRAGE AU SORT NON REJOUABLE. `draw_quiz_winners` est atomique ET
--      idempotent : sous `for update`, un `draw_state = 'done'` renvoie
--      immédiatement le tirage existant SANS rien émettre. Trois verrous
--      indépendants ferment d'emblée la sur-émission déjà rencontrée sur le
--      jackpot : le drapeau `draw_state`, l'unicité (quiz_id, player_id) /
--      (quiz_id, rank), et le CHECK claimed <= stock. Le drapeau n'est posé
--      qu'après une émission RÉELLE : un tirage qui ne dote personne (aucune
--      participation terminée) reste RELANÇABLE — non rejouable ne doit pas
--      vouloir dire « impossible à faire une seule fois ».
--
-- ── LES 5 MODES DE RÉCOMPENSE (`reward_mode`) ──
--   threshold : lot dès X bonnes réponses (`reward_threshold`) — émis par
--               finish_quiz ;
--   instant   : lot à la FIN DU QUIZ, sans exigence de justesse mais seulement
--               si TOUTES les questions ont été répondues — émis par
--               finish_quiz (un simple appel à finish ne dote personne) ;
--   draw      : tirage au sort parmi les `draw_top_n` meilleurs — DIFFÉRÉ,
--               émis par draw_quiz_winners ;
--   ranking   : classement (score décroissant PUIS temps total croissant) —
--               DIFFÉRÉ, émis par draw_quiz_winners, variante DÉTERMINISTE du
--               même chemin (le top est pris dans l'ordre du classement au
--               lieu d'être tiré au hasard). Une seule RPC pour les deux modes
--               différés : même verrou, même idempotence, aucun second chemin
--               d'émission à auditer ;
--   none      : participation gratuite, aucun lot (stock forcé à 0 par CHECK).
--
-- Le lot peut être un CODE de retrait en caisse (QUIZ-…, 8e préfixe) ou un
-- TOUR DE ROUE OFFERT (`target_wheel_id` + grant_token, patron fidélité /
-- calendrier). Le tour offert est réservé aux modes à émission IMMÉDIATE
-- (threshold / instant) : un jeton de spin émis des heures plus tard, hors
-- présence du joueur, n'a pas de sens ergonomique — CHECK
-- `quizzes_wheel_mode_check`.
--
-- Parcours PUBLIC à IP PARTAGÉE — RAPPEL ADR-032 : join / start / submit /
--   finish sont des chemins publics servis par le service_role. Le backend ne
--   doit PAS poser de rate-limit fail-closed sur une clé partagée (plusieurs
--   joueurs derrière le Wi-Fi d'un restaurant ou d'un salon) : la borne d'abus
--   est l'identité cookie (token_hash) et les contraintes d'unicité en base
--   (un joueur par quiz, une réponse par question), pas un interrupteur global.
--
-- Sécurité (même modèle que Calendrier / Événement / Jackpot / Fidélité) :
--   · AUCUN droit anon ; parcours public via service_role uniquement ;
--   · gestion commerçant (CRUD quizzes / questions) sous RLS is_org_member
--     (lecture) / is_org_editor (écriture) ;
--   · compteurs de stock émis et état du tirage RPC-only (grants de colonnes) ;
--   · écritures joueur uniquement via RPC service_role ;
--   · remise en caisse par redeem_quiz_reward (miroir redeem_calendar_reward) ;
--   · purge RGPD purge_expired_quiz_players (à brancher au cron purge-data).
-- ============================================================

-- ── Addon d'organisation ─────────────────────────────────────
alter table public.organizations
  add column addon_quiz boolean not null default false;

-- `organizations` utilise des grants de colonnes (00017) : une colonne ajoutée
-- ensuite n'est pas lisible automatiquement par authenticated.
grant select (addon_quiz) on public.organizations to authenticated;

comment on column public.organizations.addon_quiz is
  'Module Créateur de quiz activé depuis le back-office (option payante, ou incluse dans un plan)';

-- ── Source de spin « quiz » ──────────────────────────────────
-- Un tour offert par un quiz insère un spin comme le flux normal, mais
-- journalisé distinctement (hors limite de jeu, hors stats direct/share).
-- Contrainte additive (état final parrainage :
-- 'direct','share','loyalty','calendar','referral').
alter table public.spins drop constraint if exists spins_source_check;
alter table public.spins
  add constraint spins_source_check
  check (source in ('direct', 'share', 'loyalty', 'calendar', 'referral', 'quiz'));

-- ════════════════════════════════════════════════════════════
-- 1. Validation de forme (réutilise le moteur des pronostics)
-- ════════════════════════════════════════════════════════════

-- Normalisation d'une réponse libre (`text`) : minuscules, accents français
-- repliés, tout caractère non alphanumérique ramené à une espace, espaces
-- collapsés, bords rognés. Déterministe et IMMUTABLE — c'est la référence de
-- comparaison côté serveur, jamais côté client.
create or replace function public.quiz_normalize_text(p_value text)
returns text
language sql
immutable
set search_path = pg_catalog
as $$
  select btrim(regexp_replace(
    translate(
      lower(coalesce(p_value, '')),
      'àâäáãåçèéêëìîïíñòôöóõùûüúýÿ',
      'aaaaaaceeeeiiiinooooouuuuyy'
    ),
    '[^a-z0-9]+', ' ', 'g'
  ));
$$;

comment on function public.quiz_normalize_text(text) is
  'Forme canonique d''une réponse libre de quiz (minuscules, accents repliés, ponctuation ramenée à des espaces). Autorité SQL de la comparaison, à répliquer en TS pour l''aperçu commerçant uniquement.';

revoke all on function public.quiz_normalize_text(text) from public, anon;
grant execute on function public.quiz_normalize_text(text)
  to authenticated, service_role;

-- Forme d'une RÉPONSE DE JOUEUR selon le type de question.
--   choice / number / ranking → délégué à `is_valid_contest_answer`
--     (20260801120000) : mêmes formes, aucune duplication ;
--   text → une chaîne de 1 à 200 caractères, non vide après normalisation.
create or replace function public.is_valid_quiz_answer(
  p_question_type text,
  p_options jsonb,
  p_ranking_size integer,
  p_answer jsonb
)
returns boolean
language plpgsql
immutable
set search_path = pg_catalog
as $$
declare
  v_text text;
begin
  if p_answer is null then
    return false;
  end if;

  if p_question_type = 'text' then
    if jsonb_typeof(p_answer) is distinct from 'string' then
      return false;
    end if;
    v_text := p_answer #>> '{}';
    if char_length(v_text) < 1 or char_length(v_text) > 200 then
      return false;
    end if;
    return public.quiz_normalize_text(v_text) <> '';
  end if;

  if p_question_type in ('choice', 'number', 'ranking') then
    return public.is_valid_contest_answer(
      p_question_type, p_options, p_ranking_size, p_answer
    );
  end if;

  return false;
exception when others then
  return false;
end;
$$;

comment on function public.is_valid_quiz_answer(text, jsonb, integer, jsonb) is
  'Forme d''une réponse de joueur. choice/number/ranking délèguent au moteur des pronostics (is_valid_contest_answer) ; text est propre au quiz.';

revoke all on function public.is_valid_quiz_answer(text, jsonb, integer, jsonb)
  from public, anon;
grant execute on function public.is_valid_quiz_answer(text, jsonb, integer, jsonb)
  to authenticated, service_role;

-- Forme de la VÉRITÉ (`correct_answer`). Elle diverge de la réponse de joueur
-- sur un seul type : `text`, où la vérité est un TABLEAU de 1 à 10 variantes
-- acceptées (« Italie », « l'Italie »…) alors que le joueur n'en fournit
-- qu'une. Les trois autres types partagent exactement la même forme.
create or replace function public.is_valid_quiz_solution(
  p_question_type text,
  p_options jsonb,
  p_ranking_size integer,
  p_correct_answer jsonb
)
returns boolean
language plpgsql
immutable
set search_path = pg_catalog
as $$
declare
  v_item jsonb;
  v_count integer;
begin
  if p_correct_answer is null then
    return false;
  end if;

  if p_question_type = 'text' then
    if jsonb_typeof(p_correct_answer) is distinct from 'array' then
      return false;
    end if;
    v_count := jsonb_array_length(p_correct_answer);
    if v_count < 1 or v_count > 10 then
      return false;
    end if;
    for v_item in select value from jsonb_array_elements(p_correct_answer)
    loop
      if jsonb_typeof(v_item) is distinct from 'string'
        or char_length(v_item #>> '{}') > 120
        or public.quiz_normalize_text(v_item #>> '{}') = ''
      then
        return false;
      end if;
    end loop;
    return true;
  end if;

  return public.is_valid_quiz_answer(
    p_question_type, p_options, p_ranking_size, p_correct_answer
  );
exception when others then
  return false;
end;
$$;

comment on function public.is_valid_quiz_solution(text, jsonb, integer, jsonb) is
  'Forme du résultat officiel d''une question de quiz. Identique à une réponse de joueur, sauf text : tableau de 1 à 10 variantes acceptées.';

revoke all on function public.is_valid_quiz_solution(text, jsonb, integer, jsonb)
  from public, anon;
grant execute on function public.is_valid_quiz_solution(text, jsonb, integer, jsonb)
  to authenticated, service_role;

-- Cohérence complète d'une ligne de `quiz_questions` selon son type. Porte le
-- CHECK de la table (miroir de `is_valid_contest_question`).
create or replace function public.is_valid_quiz_question(
  p_question_type text,
  p_prompt text,
  p_options jsonb,
  p_correct_answer jsonb,
  p_ranking_size integer,
  p_tolerance numeric
)
returns boolean
language plpgsql
immutable
set search_path = pg_catalog
as $$
begin
  -- L'intitulé est TOUJOURS obligatoire : un quiz n'a pas d'équipes à
  -- afficher, l'UI ne peut rien composer sans lui.
  if p_prompt is null
    or char_length(btrim(p_prompt)) < 1
    or char_length(p_prompt) > 500
  then
    return false;
  end if;

  if p_question_type = 'choice' then
    -- Couvre le choix multiple ET le vrai/faux (deux options).
    if not public.is_valid_contest_options(p_options)
      or p_ranking_size is not null
      or p_tolerance is not null
    then
      return false;
    end if;
  elsif p_question_type = 'ranking' then
    if not public.is_valid_contest_options(p_options)
      or p_ranking_size is null
      or p_ranking_size < 2
      or p_ranking_size > jsonb_array_length(p_options)
      or p_tolerance is not null
    then
      return false;
    end if;
  elsif p_question_type = 'number' then
    -- `tolerance` est le seul champ propre à l'estimation numérique.
    if p_options is not null
      or p_ranking_size is not null
      or (p_tolerance is not null and p_tolerance < 0)
    then
      return false;
    end if;
  elsif p_question_type = 'text' then
    if p_options is not null
      or p_ranking_size is not null
      or p_tolerance is not null
    then
      return false;
    end if;
  else
    return false;
  end if;

  -- La vérité est connue DÈS LA CRÉATION (différence assumée avec le `prono`
  -- du module événement, désigné au reveal) : elle est obligatoire et validée.
  return public.is_valid_quiz_solution(
    p_question_type, p_options, p_ranking_size, p_correct_answer
  );
exception when others then
  return false;
end;
$$;

comment on function public.is_valid_quiz_question(text, text, jsonb, jsonb, integer, numeric) is
  'Cohérence d''une question de quiz selon son type moteur (choice / number / ranking / text). Le modèle d''UI (preset) et le chronomètre (time_limit_seconds) sont orthogonaux et non contraints ici.';

revoke all on function public.is_valid_quiz_question(text, text, jsonb, jsonb, integer, numeric)
  from public, anon;
grant execute on function public.is_valid_quiz_question(text, text, jsonb, jsonb, integer, numeric)
  to authenticated, service_role;

-- ÉVALUATION SERVEUR de la justesse. Jamais appelée depuis le client : le
-- verdict est calculé par submit_quiz_answer.
--   choice  : identifiant identique
--   ranking : ordre COMPLET identique (une réponse de quiz est juste ou
--             fausse ; le crédit partiel des pronostics n'a pas de sens quand
--             `correct_count` compte les bonnes réponses — raffinement de
--             vague 2 si besoin)
--   number  : |écart| <= tolerance (0 par défaut → valeur exacte)
--   text    : forme canonique égale à l'une des variantes acceptées
create or replace function public.quiz_answer_is_correct(
  p_question_type text,
  p_correct_answer jsonb,
  p_answer jsonb,
  p_tolerance numeric default null
)
returns boolean
language plpgsql
immutable
set search_path = pg_catalog
as $$
declare
  v_answer text;
begin
  if p_correct_answer is null or p_answer is null then
    return false;
  end if;

  if p_question_type in ('choice', 'ranking') then
    return p_answer = p_correct_answer;
  end if;

  if p_question_type = 'number' then
    if jsonb_typeof(p_answer) is distinct from 'number'
      or jsonb_typeof(p_correct_answer) is distinct from 'number'
    then
      return false;
    end if;
    return abs(
      (p_answer #>> '{}')::numeric - (p_correct_answer #>> '{}')::numeric
    ) <= coalesce(p_tolerance, 0);
  end if;

  if p_question_type = 'text' then
    if jsonb_typeof(p_answer) is distinct from 'string'
      or jsonb_typeof(p_correct_answer) is distinct from 'array'
    then
      return false;
    end if;
    v_answer := public.quiz_normalize_text(p_answer #>> '{}');
    if v_answer = '' then
      return false;
    end if;
    return exists (
      select 1 from jsonb_array_elements(p_correct_answer) v
       where public.quiz_normalize_text(v.value #>> '{}') = v_answer
    );
  end if;

  return false;
exception when others then
  return false;
end;
$$;

comment on function public.quiz_answer_is_correct(text, jsonb, jsonb, numeric) is
  'Verdict SERVEUR d''une réponse de quiz. Autorité unique : aucune évaluation cliente n''est acceptée.';

revoke all on function public.quiz_answer_is_correct(text, jsonb, jsonb, numeric)
  from public, anon, authenticated;
grant execute on function public.quiz_answer_is_correct(text, jsonb, jsonb, numeric)
  to service_role;

-- ════════════════════════════════════════════════════════════
-- 2. `quizzes` — le quiz et son mode de récompense
-- ════════════════════════════════════════════════════════════
create table public.quizzes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 120),
  -- Habillage de la page publique (restaurant, cave, musée, entreprise…) —
  -- simple champ d'affichage, borné.
  theme text not null default 'neutre'
    check (theme in ('neutre', 'gourmand', 'degustation', 'culture',
                     'produit', 'sport', 'entreprise')),
  status text not null default 'draft'
    check (status in ('draft', 'active', 'archived')),
  -- URL / QR publique. Posée par le trigger quizzes_set_defaults si absente ;
  -- les fixtures peuvent en fournir une déterministe (miroir calendars).
  public_slug text not null unique
    check (public_slug ~ '^[a-z0-9-]{3,64}$'),
  -- Consigne affichée avant la première question.
  intro_text text
    check (intro_text is null or char_length(intro_text) <= 2000),

  -- ── Mode de récompense (5 modes, cf. en-tête) ──
  reward_mode text not null default 'none'
    check (reward_mode in ('threshold', 'draw', 'ranking', 'instant', 'none')),
  -- threshold : nombre de BONNES RÉPONSES requis.
  reward_threshold integer
    check (reward_threshold is null or reward_threshold between 1 and 500),
  -- draw : taille du vivier des meilleurs dans lequel on tire au sort.
  draw_top_n integer
    check (draw_top_n is null or draw_top_n between 1 and 10000),
  -- Idempotence du tirage différé (draw / ranking) : une fois 'done', aucune
  -- ré-émission n'est possible (invariant #5).
  draw_state text not null default 'pending'
    check (draw_state in ('pending', 'done')),
  drawn_at timestamptz,

  -- ── Récompense ──
  reward_label text not null default ''
    check (char_length(btrim(reward_label)) <= 120),
  reward_details text
    check (reward_details is null or char_length(reward_details) <= 2000),
  -- VERROU ÉCONOMIQUE (ADR-031) : stock FINI et OBLIGATOIRE = nombre maximal
  -- de joueurs récompensés. 0 = aucun lot émis (état non destructeur).
  reward_stock integer not null default 0 check (reward_stock >= 0),
  -- Lots déjà émis (RPC-only : finish_quiz / draw_quiz_winners).
  reward_claimed_count integer not null default 0
    check (reward_claimed_count >= 0),
  -- Tour de roue offert au lieu d'un code : roue de la MÊME organisation.
  target_wheel_id uuid,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Support des FK composites tenant (même modèle que calendar / event).
  unique (id, organization_id),

  -- Roue cible dans la MÊME organisation (anti cross-tenant). MATCH SIMPLE :
  -- non contrôlée quand target_wheel_id est null. NO ACTION (défaut, miroir
  -- calendar_days / loyalty_milestones) : bloque la suppression d'une roue
  -- encore ciblée SANS casser la cascade d'une organisation entière.
  foreign key (target_wheel_id, organization_id)
    references public.wheels(id, organization_id),

  -- Champs propres à chaque mode : présents si et seulement si utiles.
  constraint quizzes_reward_mode_fields_check check (
    case reward_mode
      when 'threshold' then reward_threshold is not null and draw_top_n is null
      when 'draw' then draw_top_n is not null and reward_threshold is null
      else reward_threshold is null and draw_top_n is null
    end
  ),
  -- Mode sans gain : rien à émettre, donc rien à provisionner (miroir de
  -- calendar_days_lot_stock_check — la cohérence usage ↔ champs en CHECK).
  constraint quizzes_reward_none_check check (
    reward_mode <> 'none'
    or (reward_stock = 0
        and char_length(btrim(reward_label)) = 0
        and target_wheel_id is null)
  ),
  -- BORNE STRUCTURELLE de sur-émission : aucun chemin, RPC ou non, ne peut
  -- émettre plus de lots que le stock provisionné (invariant #4).
  constraint quizzes_reward_bounds_check check (
    reward_claimed_count <= reward_stock
  ),
  -- Tour de roue offert : seulement sur émission IMMÉDIATE (cf. en-tête).
  constraint quizzes_wheel_mode_check check (
    target_wheel_id is null or reward_mode in ('threshold', 'instant')
  ),
  -- Le tirage n'existe que pour les modes différés, et 'done' ⇔ daté.
  constraint quizzes_draw_state_check check (
    (draw_state = 'done') = (drawn_at is not null)
    and (draw_state = 'pending' or reward_mode in ('draw', 'ranking'))
  )
);

comment on table public.quizzes is
  'Quiz en libre-service joué depuis un QR/lien, de façon ASYNCHRONE (à l''opposé du module Événement, synchrone). 5 modes de récompense (threshold / draw / ranking / instant / none), lot fini QUIZ-… en caisse ou tour de roue offert. Parcours joueur via RPC service role uniquement.';
comment on column public.quizzes.reward_mode is
  'threshold = lot dès X bonnes réponses ; draw = tirage au sort parmi les draw_top_n meilleurs ; ranking = top du classement (score puis rapidité) ; instant = lot à la fin ; none = sans gain. draw et ranking sont DIFFÉRÉS et passent tous deux par draw_quiz_winners.';
comment on column public.quizzes.reward_stock is
  'Stock du lot — OBLIGATOIRE et FINI (ADR-031) : nombre maximal de joueurs récompensés. finish_quiz et draw_quiz_winners n''émettent jamais au-delà (décrément atomique + CHECK claimed <= stock). 0 = aucun lot.';
comment on column public.quizzes.draw_state is
  'Idempotence du tirage différé : passe à ''done'' sous le verrou du quiz au premier draw_quiz_winners. Un second appel ne peut ni relancer ni sur-émettre.';
comment on column public.quizzes.target_wheel_id is
  'Roue de la MÊME organisation offerte en récompense (grant_token à usage unique, patron fidélité/calendrier). Réservée aux modes threshold / instant.';

create index quizzes_org_idx on public.quizzes (organization_id);

-- ════════════════════════════════════════════════════════════
-- 3. `quiz_questions` — 4 types moteur, 7 modèles d'UI
-- ════════════════════════════════════════════════════════════
create table public.quiz_questions (
  id uuid primary key default gen_random_uuid(),
  quiz_id uuid not null,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  position integer not null check (position >= 0),
  prompt text not null check (char_length(btrim(prompt)) between 1 and 500),

  -- LE MOTEUR : une valeur par FORME DE RÉPONSE (cf. en-tête).
  question_type text not null default 'choice'
    check (question_type in ('choice', 'number', 'ranking', 'text')),
  -- LE MODÈLE D'UI : contraint en FORME seulement, comme contests.event_kind.
  -- Les 7 modèles du besoin : multiple_choice, true_false, mystery_image,
  -- estimate, timed, ranking, free_prediction. Ignoré par le moteur.
  preset text not null default 'multiple_choice'
    check (preset ~ '^[a-z][a-z0-9_]{1,39}$'),

  -- choice / ranking : options ordonnées [{"id":"a","label":"…"}] (2 à 50,
  -- identifiants distincts — validées par is_valid_contest_options).
  options jsonb,
  -- LA VÉRITÉ, connue dès la création. NOT NULL : un quiz sans corrigé n'a pas
  -- de sens (différence assumée avec le `prono` du module événement).
  correct_answer jsonb not null,
  -- « Image mystère » : un MÉDIA, pas un type de réponse. Le SCHÉMA d'URL est
  -- borné ICI, pas seulement côté Zod : un éditeur a `grant insert/update`
  -- direct sur cette table, donc `javascript:`/`data:` doivent être
  -- structurellement impossibles à stocker (l'URL est rendue en <img src>).
  image_url text
    check (image_url is null
           or (char_length(image_url) <= 2048 and image_url ~ '^https?://')),
  -- « Question chronométrée » : une DIMENSION TRANSVERSALE. NULL = pas de
  -- chronomètre (le joueur prend son temps). Applicable à tous les types.
  time_limit_seconds integer
    check (time_limit_seconds is null or time_limit_seconds between 5 and 600),
  points integer not null default 1 check (points between 0 and 1000),
  -- number : écart absolu toléré (null = valeur exacte exigée).
  tolerance numeric
    check (tolerance is null or (tolerance >= 0 and tolerance <= 1000000000)),
  -- ranking : taille du top attendu (3 = podium).
  ranking_size integer
    check (ranking_size is null or ranking_size between 2 and 50),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (quiz_id, position),
  -- FK composite tenant : les réponses ciblent (id, organization_id).
  unique (id, organization_id),
  foreign key (quiz_id, organization_id)
    references public.quizzes(id, organization_id) on delete cascade,

  -- Cohérence complète type ↔ champs ↔ vérité.
  constraint quiz_questions_shape_check check (
    public.is_valid_quiz_question(
      question_type, prompt, options, correct_answer, ranking_size, tolerance
    )
  )
);

comment on table public.quiz_questions is
  'Question d''un quiz. question_type = MOTEUR (choice / number / ranking / text = les 4 formes de réponse) ; preset = MODÈLE D''UI (7 modèles, forme libre comme contests.event_kind) ; time_limit_seconds et image_url sont ORTHOGONAUX au type. correct_answer N''EST JAMAIS servie au public avant que le joueur ait répondu : lecture membre + service_role uniquement.';
comment on column public.quiz_questions.question_type is
  'Forme de la réponse : choice (choix multiple ET vrai/faux à 2 options), number (estimation, avec tolerance), ranking (classement), text (pronostic libre, variantes acceptées).';
comment on column public.quiz_questions.preset is
  'Modèle d''UI du besoin produit (multiple_choice, true_false, mystery_image, estimate, timed, ranking, free_prediction…). Contraint en FORME seulement : ajouter un modèle ne demandera aucune migration. Le moteur l''IGNORE.';
comment on column public.quiz_questions.correct_answer is
  'Résultat officiel : id d''option (choice), tableau ordonné d''ids (ranking), nombre (number), tableau de 1 à 10 variantes acceptées (text). Connu dès la création, jamais exposé avant la réponse du joueur.';
comment on column public.quiz_questions.time_limit_seconds is
  'Fenêtre de réponse en secondes, ou NULL pour aucun chronomètre. Dimension TRANSVERSALE : « question chronométrée » n''est pas un type. submit_quiz_answer compare now() - started_at à cette borne, côté serveur.';

create index quiz_questions_org_idx on public.quiz_questions (organization_id);
create index quiz_questions_quiz_idx on public.quiz_questions (quiz_id, position);

-- ════════════════════════════════════════════════════════════
-- 4. `quiz_players` — identité cookie, PII facultative (opt-in)
-- ════════════════════════════════════════════════════════════
create table public.quiz_players (
  id uuid primary key default gen_random_uuid(),
  quiz_id uuid not null,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  -- Hash SHA-256 du jeton cookie HTTP-only (miroir calendar / event / jackpot).
  -- AUCUNE PII en clair n'est imposée pour jouer.
  token_hash text not null check (token_hash ~ '^[0-9a-f]{64}$'),
  -- Prénom affiché au classement — FACULTATIF (consentement).
  first_name text
    check (first_name is null or char_length(btrim(first_name)) between 1 and 60),
  -- Email opt-in — FACULTATIF. Seule PII sensible du module ; neutralisée par
  -- purge_expired_quiz_players. Validation légère (présence d'un @).
  email text
    check (email is null or (char_length(email) between 3 and 320 and email like '%@%')),
  marketing_opt_in boolean not null default false,
  -- Clé d'avatar du catalogue applicatif (src/lib/avatars) — miroir
  -- contest_players.avatar / event_players.avatar.
  avatar text not null default ''
    check (avatar = '' or avatar ~ '^[a-z]{1,20}$'),

  -- Agrégats dénormalisés, maintenus par submit_quiz_answer et RECALCULÉS par
  -- finish_quiz depuis quiz_answers (source de vérité).
  score integer not null default 0 check (score >= 0),
  correct_count integer not null default 0 check (correct_count >= 0),
  -- Temps total SERVEUR cumulé = somme des elapsed_ms figés. Départage du
  -- classement (score décroissant PUIS temps croissant).
  total_elapsed_ms bigint not null default 0 check (total_elapsed_ms >= 0),
  finished_at timestamptz,

  created_at timestamptz not null default now(),
  unique (quiz_id, token_hash),
  -- FK composite tenant pour quiz_answers / quiz_rewards.
  unique (id, quiz_id, organization_id),
  foreign key (quiz_id, organization_id)
    references public.quizzes(id, organization_id) on delete cascade
);

comment on table public.quiz_players is
  'Participation d''un joueur à un quiz : hash de jeton cookie (aucune PII imposée) + prénom / email / avatar FACULTATIFS (consentement). score / correct_count / total_elapsed_ms maintenus par les RPC et recalculés au finish depuis quiz_answers.';
comment on column public.quiz_players.total_elapsed_ms is
  'Somme des elapsed_ms SERVEUR figés au submit. Critère de départage du classement (score desc, puis ce temps asc). Jamais alimenté par une valeur cliente.';

create index quiz_players_org_idx on public.quiz_players (organization_id);
create index quiz_players_quiz_idx on public.quiz_players (quiz_id);
-- Ordre du classement / du tirage (score desc, temps asc) sur les
-- participations terminées.
create index quiz_players_rank_idx
  on public.quiz_players (quiz_id, score desc, total_elapsed_ms asc, created_at asc)
  where finished_at is not null;

-- ════════════════════════════════════════════════════════════
-- 5. `quiz_answers` — une par (joueur, question), IMMUABLE
-- ════════════════════════════════════════════════════════════
-- Le CHRONOMÈTRE vit ici (invariant #1) : la ligne est créée par
-- `start_quiz_question` avec `started_at = now()` et RIEN d'autre ; elle est
-- complétée EXACTEMENT UNE FOIS par `submit_quiz_answer`. Le trigger
-- quiz_answers_freeze interdit toute écriture ultérieure.
create table public.quiz_answers (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null,
  question_id uuid not null,
  quiz_id uuid not null,
  organization_id uuid not null references public.organizations(id) on delete cascade,

  -- Instant de PRÉSENTATION de la question, posé = now() par
  -- start_quiz_question. Source de vérité du chronomètre : jamais fourni ni
  -- influencé par le client, jamais réinitialisé (on conflict do nothing).
  started_at timestamptz not null default now(),
  -- Instant de la réponse ; null tant que le joueur n'a pas répondu.
  answered_at timestamptz,
  answer jsonb,
  -- Délai SERVEUR figé au submit, borné par time_limit_seconds (ou 24 h à
  -- défaut) : garde total_elapsed_ms comparable et à l'abri d'un débordement.
  elapsed_ms integer check (elapsed_ms is null or elapsed_ms >= 0),
  -- Écrits par submit_quiz_answer uniquement ; NULS tant que non répondu
  -- (patron event_answers : rien de calculé avant l'évaluation).
  is_correct boolean,
  points_awarded integer check (points_awarded is null or points_awarded >= 0),
  -- La fenêtre de temps avait expiré : réponse enregistrée mais JAMAIS scorée
  -- (et la question est consommée — aucune seconde tentative).
  timed_out boolean not null default false,

  -- Invariant #3 : une seule réponse par joueur et par question.
  unique (player_id, question_id),
  foreign key (player_id, quiz_id, organization_id)
    references public.quiz_players(id, quiz_id, organization_id) on delete cascade,
  foreign key (question_id, organization_id)
    references public.quiz_questions(id, organization_id) on delete cascade,
  foreign key (quiz_id, organization_id)
    references public.quizzes(id, organization_id) on delete cascade,

  -- Deux états seulement : présentée (chronomètre lancé) ou répondue (tout
  -- figé). Aucun état intermédiaire n'est représentable.
  constraint quiz_answers_state_check check (
    (answered_at is null and answer is null and elapsed_ms is null
      and is_correct is null and points_awarded is null and not timed_out)
    or (answered_at is not null and answer is not null and elapsed_ms is not null
      and is_correct is not null and points_awarded is not null)
  ),
  -- Une réponse hors délai ne rapporte jamais rien.
  constraint quiz_answers_timeout_check check (
    not timed_out or (is_correct = false and points_awarded = 0)
  )
);

comment on table public.quiz_answers is
  'Réponse d''un joueur à une question. started_at est posé par start_quiz_question (chronomètre SERVEUR) ; elapsed_ms, is_correct et points_awarded sont figés par submit_quiz_answer. Unicité (joueur, question) + trigger quiz_answers_freeze : IMMUABLE, aucune seconde tentative.';
comment on column public.quiz_answers.started_at is
  'Instant de présentation de la question, posé = now() côté serveur. JAMAIS réinitialisé : un second start_quiz_question renvoie ce started_at déjà posé. Base du calcul elapsed_ms = answered_at - started_at.';
comment on column public.quiz_answers.elapsed_ms is
  'Délai SERVEUR figé au submit, plafonné à time_limit_seconds (ou 24 h si aucune limite). Aucune valeur cliente n''est acceptée.';

create index quiz_answers_org_idx on public.quiz_answers (organization_id);
create index quiz_answers_player_idx on public.quiz_answers (player_id);
create index quiz_answers_question_idx on public.quiz_answers (quiz_id, question_id);

-- ════════════════════════════════════════════════════════════
-- 6. `quiz_rewards` — lot émis (code caisse ou tour offert)
-- ════════════════════════════════════════════════════════════
create table public.quiz_rewards (
  id uuid primary key default gen_random_uuid(),
  quiz_id uuid not null,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  player_id uuid not null,
  -- Mode qui a émis ce lot (copie figée : changer le mode du quiz ensuite ne
  -- réécrit pas l'histoire du joueur).
  source text not null
    check (source in ('threshold', 'draw', 'ranking', 'instant')),
  -- draw / ranking : rang du gagnant. NULL pour threshold / instant.
  rank integer check (rank is null or rank >= 1),
  -- Code de retrait présenté en caisse. Même alphabet que CADEAU-/EVENT-…
  -- (sans I/O/0/1), préfixe distinct QUIZ- pour le routage caisse. NULL si
  -- tour de roue offert ou rupture de stock.
  code text unique check (code is null or code ~ '^QUIZ-[A-HJ-NP-Z2-9]{8}$'),
  redeemed_at timestamptz,
  redeemed_by text check (redeemed_by is null or char_length(redeemed_by) <= 120),
  -- Tour de roue offert : jeton à usage unique (48 hex), échangé par
  -- consume_quiz_spin_grant contre EXACTEMENT un tirage.
  spin_grant_token text unique
    check (spin_grant_token is null or spin_grant_token ~ '^[0-9a-f]{48}$'),
  consumed_at timestamptz,
  resulting_spin_id uuid references public.spins(id) on delete set null,
  -- Le stock était épuisé au moment de l'émission (aucun lot remis).
  out_of_stock boolean not null default false,
  created_at timestamptz not null default now(),

  -- Invariant #4/#5 : un seul lot par joueur et par quiz — la sur-émission est
  -- STRUCTURELLEMENT impossible, même si une RPC était rejouée.
  unique (quiz_id, player_id),
  -- Un seul gagnant par rang : fige le podium d'un tirage / classement.
  unique (quiz_id, rank),
  foreign key (player_id, quiz_id, organization_id)
    references public.quiz_players(id, quiz_id, organization_id) on delete cascade,
  foreign key (quiz_id, organization_id)
    references public.quizzes(id, organization_id) on delete cascade,

  -- Rupture de stock → aucun support de lot ; sinon EXACTEMENT un support
  -- (code de caisse OU jeton de spin).
  constraint quiz_rewards_payload_check check (
    case when out_of_stock
      then code is null and spin_grant_token is null
      else (code is not null) <> (spin_grant_token is not null)
    end
  ),
  -- Un rang n'existe que pour les modes différés.
  constraint quiz_rewards_rank_check check (
    (rank is not null) = (source in ('draw', 'ranking'))
  ),
  -- Consommation du tour offert : les deux colonnes vont de pair.
  constraint quiz_rewards_spin_check check (
    (consumed_at is null) = (resulting_spin_id is null)
    and (consumed_at is null or spin_grant_token is not null)
  )
);

comment on table public.quiz_rewards is
  'Lot émis à un joueur : code QUIZ-… remis via redeem_quiz_reward, OU jeton de tour de roue offert consommé via consume_quiz_spin_grant, OU trace de rupture (out_of_stock). Unicité (quiz, joueur) et (quiz, rang) : registre vérifiable, sur-émission impossible.';

create index quiz_rewards_org_idx on public.quiz_rewards (organization_id);
create index quiz_rewards_quiz_idx on public.quiz_rewards (quiz_id);
create index quiz_rewards_player_idx on public.quiz_rewards (player_id);

-- ════════════════════════════════════════════════════════════
-- 7. RLS et grants
-- ════════════════════════════════════════════════════════════
alter table public.quizzes enable row level security;
alter table public.quiz_questions enable row level security;
alter table public.quiz_players enable row level security;
alter table public.quiz_answers enable row level security;
alter table public.quiz_rewards enable row level security;

revoke all on table public.quizzes from public, anon, authenticated;
revoke all on table public.quiz_questions from public, anon, authenticated;
revoke all on table public.quiz_players from public, anon, authenticated;
revoke all on table public.quiz_answers from public, anon, authenticated;
revoke all on table public.quiz_rewards from public, anon, authenticated;

-- Contenu (quizzes / questions) : CRUD éditeurs, lecture d'équipe.
create policy "quizzes: member select" on public.quizzes
  for select to authenticated
  using (public.is_org_member(organization_id));
create policy "quizzes: editor write" on public.quizzes
  for all to authenticated
  using (public.is_org_editor(organization_id))
  with check (public.is_org_editor(organization_id));

create policy "quiz_questions: member select" on public.quiz_questions
  for select to authenticated
  using (public.is_org_member(organization_id));
create policy "quiz_questions: editor write" on public.quiz_questions
  for all to authenticated
  using (public.is_org_editor(organization_id))
  with check (public.is_org_editor(organization_id));

-- Données joueurs : lecture d'équipe (dashboard / stats / caisse), écritures
-- service role uniquement.
create policy "quiz_players: member select" on public.quiz_players
  for select to authenticated
  using (public.is_org_member(organization_id));
create policy "quiz_answers: member select" on public.quiz_answers
  for select to authenticated
  using (public.is_org_member(organization_id));
create policy "quiz_rewards: member select" on public.quiz_rewards
  for select to authenticated
  using (public.is_org_member(organization_id));

-- Quizzes : select complet (équipe) ; insert/update RESTREINTS aux colonnes non
-- pilotées par les RPC. public_slug posé par trigger (ou fourni) ;
-- reward_claimed_count, draw_state et drawn_at sont RPC-only.
grant select on table public.quizzes to authenticated;
grant insert (organization_id, name, theme, status, public_slug, intro_text,
              reward_mode, reward_threshold, draw_top_n, reward_label,
              reward_details, reward_stock, target_wheel_id)
  on public.quizzes to authenticated;
grant update (name, theme, status, public_slug, intro_text, reward_mode,
              reward_threshold, draw_top_n, reward_label, reward_details,
              reward_stock, target_wheel_id, updated_at)
  on public.quizzes to authenticated;
grant delete on public.quizzes to authenticated;

-- Questions : CRUD complet côté éditeur (correct_answer inclus — c'est
-- l'auteur du quiz qui pose la vérité ; jamais exposée au public, cf. RPC).
grant select, insert, update, delete on table public.quiz_questions to authenticated;

-- Données joueurs : lecture seule côté marchand.
grant select on table public.quiz_players to authenticated;
grant select on table public.quiz_answers to authenticated;
grant select on table public.quiz_rewards to authenticated;

grant select, insert, update, delete on table public.quizzes to service_role;
grant select, insert, update, delete on table public.quiz_questions to service_role;
grant select, insert, update, delete on table public.quiz_players to service_role;
grant select, insert, update, delete on table public.quiz_answers to service_role;
grant select, insert, update, delete on table public.quiz_rewards to service_role;

-- Mutations commerçant auditées (miroir des autres modules).
create trigger quizzes_merchant_audit
  after insert or update or delete on public.quizzes
  for each row execute function public.audit_merchant_mutation();

-- ── Trigger : défauts service-authoritatifs (slug) ───────────
-- BEFORE INSERT SECURITY DEFINER : génère un public_slug si absent (alphabet
-- [a-z0-9], la contrainte unique reste le filet). N'écrase jamais une valeur
-- fournie (fixtures déterministes). Miroir de calendars_set_defaults.
create or replace function public.quizzes_set_defaults()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_slug text;
  attempt integer;
begin
  if new.public_slug is null then
    for attempt in 1..12 loop
      v_slug := pg_catalog.encode(extensions.gen_random_bytes(6), 'hex');
      if not exists (select 1 from public.quizzes q where q.public_slug = v_slug) then
        new.public_slug := v_slug;
        exit;
      end if;
    end loop;
    if new.public_slug is null then
      raise exception 'quiz slug generation exhausted';
    end if;
  end if;
  return new;
end;
$$;

revoke all on function public.quizzes_set_defaults()
  from public, anon, authenticated;

create trigger quizzes_set_defaults
  before insert on public.quizzes
  for each row execute function public.quizzes_set_defaults();

-- ── Trigger : gel d'une réponse (invariant #3) ───────────────
-- Une ligne quiz_answers n'est écrivable QU'UNE FOIS, et son chronomètre ne
-- peut jamais être déplacé. Ce gel s'applique à TOUS les rôles, service_role
-- inclus : même une RPC rejouée ne peut ni corriger une réponse, ni rendre une
-- seconde tentative possible, ni rembobiner started_at.
-- UNE SEULE exception, PUREMENT DESTRUCTIVE : la neutralisation RGPD de la
-- réponse libre par purge_expired_quiz_players (`answer` → '""' et STRICTEMENT
-- rien d'autre). Elle ne peut que retirer de l'information, jamais en
-- réintroduire : le chronomètre, l'issue et le barème restent bit à bit
-- identiques, donc aucune seconde tentative ni révision de score n'est
-- possible par ce chemin. Seul le service_role peut écrire sur cette table.
create or replace function public.quiz_answers_freeze()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.answered_at is not null then
    if new.answer = '""'::jsonb
       and new.id is not distinct from old.id
       and new.player_id is not distinct from old.player_id
       and new.question_id is not distinct from old.question_id
       and new.quiz_id is not distinct from old.quiz_id
       and new.organization_id is not distinct from old.organization_id
       and new.started_at is not distinct from old.started_at
       and new.answered_at is not distinct from old.answered_at
       and new.elapsed_ms is not distinct from old.elapsed_ms
       and new.is_correct is not distinct from old.is_correct
       and new.points_awarded is not distinct from old.points_awarded
       and new.timed_out is not distinct from old.timed_out
    then
      return new; -- anonymisation RGPD de la réponse libre
    end if;
    raise exception 'quiz answer is immutable';
  end if;
  if new.started_at is distinct from old.started_at then
    raise exception 'quiz answer clock is immutable';
  end if;
  return new;
end;
$$;

revoke all on function public.quiz_answers_freeze()
  from public, anon, authenticated;

create trigger quiz_answers_freeze
  before update on public.quiz_answers
  for each row execute function public.quiz_answers_freeze();

-- ════════════════════════════════════════════════════════════
-- 8. Émission d'un lot — helper interne (service_role)
-- ════════════════════════════════════════════════════════════
-- Facteur commun de finish_quiz et draw_quiz_winners : décrément ATOMIQUE et
-- CONDITIONNEL du stock, génération du support (code QUIZ-… ou grant_token),
-- idempotence par joueur. LE VERROU DU QUIZ (`select … for update`) DOIT être
-- détenu par l'appelant — sans quoi deux transactions pourraient franchir la
-- borne de stock simultanément.
--
-- STRICTEMENT INTERNE : l'EXECUTE est révoqué à TOUS les rôles applicatifs
-- (service_role compris), seul le propriétaire le conserve — donc seules
-- finish_quiz et draw_quiz_winners, SECURITY DEFINER, peuvent l'appeler. C'est
-- l'ACL qui porte la garde (patron decrement_prize_stock) et NON un test sur
-- auth.role() : draw_quiz_winners est légitimement appelable par un ÉDITEUR
-- authentifié, dont le rôle JWT reste 'authenticated' à travers le definer.
create or replace function public.quiz_emit_reward(
  p_quiz_id uuid,
  p_organization_id uuid,
  p_player_id uuid,
  p_source text,
  p_rank integer default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_quiz public.quizzes%rowtype;
  v_existing public.quiz_rewards%rowtype;
  v_code text;
  v_grant text;
  v_alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  v_bytes bytea;
  i integer;
  attempt integer;
begin
  -- Déjà récompensé ? On renvoie SON lot, sans toucher au stock (idempotence).
  select r.* into v_existing
    from public.quiz_rewards r
   where r.quiz_id = p_quiz_id and r.player_id = p_player_id;
  if found then
    return pg_catalog.jsonb_build_object(
      'emitted', false, 'already', true,
      'source', v_existing.source, 'rank', v_existing.rank,
      'code', v_existing.code,
      'spin_grant_token', v_existing.spin_grant_token,
      'out_of_stock', v_existing.out_of_stock);
  end if;

  -- Le quiz est déjà verrouillé par l'appelant : cette relecture voit le
  -- reward_claimed_count à jour.
  select q.* into v_quiz from public.quizzes q where q.id = p_quiz_id;
  if not found then
    return pg_catalog.jsonb_build_object('emitted', false, 'already', false,
      'out_of_stock', true);
  end if;

  -- Stock FINI (ADR-031) : rupture → trace sans lot, aucun décrément.
  if v_quiz.reward_claimed_count >= v_quiz.reward_stock then
    insert into public.quiz_rewards
      (quiz_id, organization_id, player_id, source, rank, out_of_stock)
    values (p_quiz_id, p_organization_id, p_player_id, p_source, p_rank, true);
    return pg_catalog.jsonb_build_object(
      'emitted', false, 'already', false, 'source', p_source, 'rank', p_rank,
      'code', null, 'spin_grant_token', null, 'out_of_stock', true);
  end if;

  if v_quiz.target_wheel_id is not null then
    -- Tour de roue offert : jeton à usage unique (48 hex).
    for attempt in 1..8 loop
      v_grant := pg_catalog.encode(extensions.gen_random_bytes(24), 'hex');
      begin
        insert into public.quiz_rewards
          (quiz_id, organization_id, player_id, source, rank, spin_grant_token)
        values (p_quiz_id, p_organization_id, p_player_id, p_source, p_rank, v_grant);
        exit;
      exception when unique_violation then
        v_grant := null;
      end;
    end loop;
    if v_grant is null then
      raise exception 'quiz grant generation exhausted';
    end if;
  else
    -- Code de retrait en caisse (retry anti-collision, miroir CADEAU-/EVENT-).
    for attempt in 1..8 loop
      v_bytes := extensions.gen_random_bytes(8);
      v_code := 'QUIZ-';
      for i in 0..7 loop
        v_code := v_code || pg_catalog.substr(
          v_alphabet, pg_catalog.get_byte(v_bytes, i) % pg_catalog.length(v_alphabet) + 1, 1);
      end loop;
      begin
        insert into public.quiz_rewards
          (quiz_id, organization_id, player_id, source, rank, code)
        values (p_quiz_id, p_organization_id, p_player_id, p_source, p_rank, v_code);
        exit;
      exception when unique_violation then
        v_code := null;
      end;
    end loop;
    if v_code is null then
      raise exception 'quiz code generation exhausted';
    end if;
  end if;

  -- Décrément du stock, borné par quizzes_reward_bounds_check.
  update public.quizzes
     set reward_claimed_count = reward_claimed_count + 1
   where id = p_quiz_id;

  return pg_catalog.jsonb_build_object(
    'emitted', true, 'already', false, 'source', p_source, 'rank', p_rank,
    'code', v_code, 'spin_grant_token', v_grant,
    'target_wheel_id', v_quiz.target_wheel_id, 'out_of_stock', false);
end;
$$;

comment on function public.quiz_emit_reward(uuid, uuid, uuid, text, integer) is
  'Émission atomique d''un lot de quiz (code QUIZ-… ou grant de spin) avec décrément conditionnel du stock fini. Interne : l''appelant DOIT détenir le verrou du quiz.';

-- Aucun grant : seul le propriétaire (donc les RPC SECURITY DEFINER ci-dessous)
-- peut exécuter ce helper.
revoke all on function public.quiz_emit_reward(uuid, uuid, uuid, text, integer)
  from public, anon, authenticated, service_role;

-- ════════════════════════════════════════════════════════════
-- 9. RPC parcours JOUEUR (service_role uniquement)
-- ════════════════════════════════════════════════════════════

-- ── join_quiz ────────────────────────────────────────────────
-- Résout le quiz par public_slug (addon actif, statut actif), crée / renvoie le
-- joueur (idempotent : re-join = même ligne). Enregistre prénom / email /
-- avatar et FAIT MONTER l'opt-in (un re-join ne rétracte jamais un
-- consentement déjà donné). N'expose AUCUNE vérité de question.
create or replace function public.join_quiz(
  p_slug text,
  p_player_token_hash text,
  p_first_name text default null,
  p_email text default null,
  p_avatar text default null,
  p_marketing_opt_in boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_quiz public.quizzes%rowtype;
  v_player public.quiz_players%rowtype;
  v_first_name text;
  v_email text;
  v_avatar text;
  v_question_count integer;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'not authorized';
  end if;
  if p_player_token_hash is null or p_player_token_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid player token';
  end if;

  select q.* into v_quiz
    from public.quizzes q
    join public.organizations o on o.id = q.organization_id
   where q.public_slug = pg_catalog.lower(pg_catalog.btrim(coalesce(p_slug, '')))
     and o.addon_quiz
   for update of q;
  -- Réponse 'unavailable' identique quel que soit le motif (slug inconnu,
  -- addon coupé, quiz non actif) : pas d'oracle.
  if not found or v_quiz.status <> 'active' then
    return pg_catalog.jsonb_build_object('state', 'unavailable');
  end if;

  -- PII facultative, nettoyée. `nullif` NU (jamais qualifié pg_catalog) :
  -- c'est une construction du parseur, pas une fonction du catalogue.
  v_first_name := nullif(pg_catalog.btrim(coalesce(p_first_name, '')), '');
  if v_first_name is not null and pg_catalog.char_length(v_first_name) > 60 then
    v_first_name := pg_catalog.substr(v_first_name, 1, 60);
  end if;
  v_email := nullif(pg_catalog.btrim(pg_catalog.lower(coalesce(p_email, ''))), '');
  if v_email is not null
     and (pg_catalog.length(v_email) > 320 or v_email not like '%@%')
  then
    v_email := null;
  end if;
  -- Avatar : coercition silencieuse vers défaut si hors catalogue.
  v_avatar := coalesce(p_avatar, '');
  if v_avatar <> '' and v_avatar !~ '^[a-z]{1,20}$' then
    v_avatar := '';
  end if;

  insert into public.quiz_players
    (quiz_id, organization_id, token_hash, first_name, email, avatar, marketing_opt_in)
  values (v_quiz.id, v_quiz.organization_id, p_player_token_hash,
          v_first_name, v_email, v_avatar, coalesce(p_marketing_opt_in, false))
  on conflict (quiz_id, token_hash) do nothing;

  -- Toujours appliqué (nouvelle ligne ou re-join) : les valeurs déjà données
  -- ne sont jamais effacées, l'opt-in ne fait que MONTER.
  update public.quiz_players
     set first_name = coalesce(v_first_name, first_name),
         email = coalesce(v_email, email),
         avatar = case when v_avatar <> '' then v_avatar else avatar end,
         marketing_opt_in = marketing_opt_in or coalesce(p_marketing_opt_in, false)
   where quiz_id = v_quiz.id and token_hash = p_player_token_hash
  returning * into v_player;

  select pg_catalog.count(*)::integer into v_question_count
    from public.quiz_questions qq where qq.quiz_id = v_quiz.id;

  return pg_catalog.jsonb_build_object(
    'state', 'joined',
    'quiz', pg_catalog.jsonb_build_object(
      'id', v_quiz.id, 'name', v_quiz.name, 'theme', v_quiz.theme,
      'intro_text', v_quiz.intro_text, 'question_count', v_question_count,
      'reward_mode', v_quiz.reward_mode, 'reward_label', v_quiz.reward_label),
    'player', pg_catalog.jsonb_build_object(
      'id', v_player.id, 'first_name', v_player.first_name,
      'avatar', v_player.avatar, 'score', v_player.score,
      'correct_count', v_player.correct_count,
      'total_elapsed_ms', v_player.total_elapsed_ms,
      'finished_at', v_player.finished_at,
      'marketing_opt_in', v_player.marketing_opt_in,
      'has_email', (v_player.email is not null))
  );
end;
$$;

comment on function public.join_quiz(text, text, text, text, text, boolean) is
  'Entrée publique dans un quiz : idempotente, PII facultative, opt-in marketing montant. Service role uniquement (l''identité joueur vient du cookie httpOnly, hachée côté serveur).';

revoke all on function public.join_quiz(text, text, text, text, text, boolean)
  from public, anon, authenticated;
grant execute on function public.join_quiz(text, text, text, text, text, boolean)
  to service_role;

-- ── start_quiz_question ──────────────────────────────────────
-- PRÉSENTE une question et POSE LE CHRONOMÈTRE côté serveur (invariant #1) :
-- crée la ligne quiz_answers avec started_at = now(), UNE SEULE FOIS. Un
-- second appel renvoie le started_at déjà posé — le chronomètre ne se
-- réinitialise jamais. Ne renvoie JAMAIS correct_answer (invariant #2).
-- Le joueur est créé s'il n'existe pas (aucune PII imposée ; le consentement
-- passe par join_quiz), miroir open_calendar_box.
create or replace function public.start_quiz_question(
  p_quiz_id uuid,
  p_player_token_hash text,
  p_question_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_quiz public.quizzes%rowtype;
  v_question public.quiz_questions%rowtype;
  v_player public.quiz_players%rowtype;
  v_answer public.quiz_answers%rowtype;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'not authorized';
  end if;
  if p_player_token_hash is null or p_player_token_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid player token';
  end if;

  select q.* into v_quiz
    from public.quizzes q
    join public.organizations o on o.id = q.organization_id
   where q.id = p_quiz_id and o.addon_quiz
   for update of q;
  if not found or v_quiz.status <> 'active' then
    return pg_catalog.jsonb_build_object('state', 'unavailable');
  end if;

  -- La question doit appartenir au quiz (même tenant).
  select qq.* into v_question
    from public.quiz_questions qq
   where qq.id = p_question_id and qq.quiz_id = v_quiz.id;
  if not found then
    return pg_catalog.jsonb_build_object('state', 'unavailable');
  end if;

  insert into public.quiz_players (quiz_id, organization_id, token_hash)
  values (v_quiz.id, v_quiz.organization_id, p_player_token_hash)
  on conflict (quiz_id, token_hash) do nothing;
  select p.* into v_player
    from public.quiz_players p
   where p.quiz_id = v_quiz.id and p.token_hash = p_player_token_hash;

  if v_player.finished_at is not null then
    return pg_catalog.jsonb_build_object('state', 'finished');
  end if;

  -- LE CHRONOMÈTRE : posé une seule fois. `do nothing` puis relecture — un
  -- re-start ne peut pas rembobiner started_at (et le trigger de gel
  -- l'interdirait de toute façon).
  insert into public.quiz_answers
    (player_id, question_id, quiz_id, organization_id, started_at)
  values (v_player.id, v_question.id, v_quiz.id, v_quiz.organization_id,
          pg_catalog.now())
  on conflict (player_id, question_id) do nothing;
  select a.* into v_answer
    from public.quiz_answers a
   where a.player_id = v_player.id and a.question_id = v_question.id;

  if v_answer.answered_at is not null then
    return pg_catalog.jsonb_build_object(
      'state', 'already_answered',
      'question_id', v_question.id,
      'is_correct', v_answer.is_correct,
      'points_awarded', v_answer.points_awarded,
      'elapsed_ms', v_answer.elapsed_ms,
      'timed_out', v_answer.timed_out);
  end if;

  -- Charge utile SANS correct_answer (invariant #2).
  return pg_catalog.jsonb_build_object(
    'state', 'started',
    'question', pg_catalog.jsonb_build_object(
      'id', v_question.id, 'position', v_question.position,
      'question_type', v_question.question_type, 'preset', v_question.preset,
      'prompt', v_question.prompt, 'image_url', v_question.image_url,
      'options', v_question.options, 'ranking_size', v_question.ranking_size,
      'tolerance', v_question.tolerance, 'points', v_question.points,
      'time_limit_seconds', v_question.time_limit_seconds),
    'started_at', v_answer.started_at,
    'server_now', pg_catalog.now()
  );
end;
$$;

comment on function public.start_quiz_question(uuid, text, uuid) is
  'Présente une question et pose started_at = now() CÔTÉ SERVEUR (une seule fois, jamais réinitialisé). Ne renvoie jamais correct_answer.';

revoke all on function public.start_quiz_question(uuid, text, uuid)
  from public, anon, authenticated;
grant execute on function public.start_quiz_question(uuid, text, uuid)
  to service_role;

-- ── submit_quiz_answer ───────────────────────────────────────
-- Aucun paramètre de temps : le délai est calculé EN BASE,
-- elapsed_ms = now() - started_at (invariant #1). Au-delà de
-- time_limit_seconds la réponse est REFUSÉE — enregistrée hors barème
-- (is_correct false, 0 point, timed_out) et la question est CONSOMMÉE : pas de
-- seconde tentative en laissant filer le chronomètre. La JUSTESSE est évaluée
-- CÔTÉ SERVEUR contre correct_answer, jamais annoncée par le client.
create or replace function public.submit_quiz_answer(
  p_quiz_id uuid,
  p_player_token_hash text,
  p_question_id uuid,
  p_answer jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_quiz public.quizzes%rowtype;
  v_question public.quiz_questions%rowtype;
  v_player public.quiz_players%rowtype;
  v_answer public.quiz_answers%rowtype;
  v_now timestamptz := pg_catalog.now();
  v_raw_ms bigint;
  v_cap_ms bigint;
  v_elapsed_ms integer;
  v_timed_out boolean := false;
  v_is_correct boolean := false;
  v_points integer := 0;
  v_answered integer;
  v_total integer;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'not authorized';
  end if;
  if p_player_token_hash is null or p_player_token_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid player token';
  end if;

  -- LECTURE SEULE du quiz, SANS verrou de ligne : `submit` ne touche NI au stock
  -- NI à `draw_state` — il n'écrit que la réponse et les agrégats DU joueur, tous
  -- deux sérialisés par le verrou de `quiz_players` posé plus bas. Prendre
  -- `for update of q` ici sérialiserait TOUTE une salle sur la même ligne de quiz
  -- (une seule réponse traitée à la fois). Le verrou du quiz reste indispensable
  -- là où une décision dépend du stock : `finish_quiz` et `draw_quiz_winners`.
  select q.* into v_quiz
    from public.quizzes q
    join public.organizations o on o.id = q.organization_id
   where q.id = p_quiz_id and o.addon_quiz;
  if not found or v_quiz.status <> 'active' then
    return pg_catalog.jsonb_build_object('state', 'unavailable');
  end if;

  select qq.* into v_question
    from public.quiz_questions qq
   where qq.id = p_question_id and qq.quiz_id = v_quiz.id;
  if not found then
    return pg_catalog.jsonb_build_object('state', 'unavailable');
  end if;

  select p.* into v_player
    from public.quiz_players p
   where p.quiz_id = v_quiz.id and p.token_hash = p_player_token_hash
   for update;
  if not found then
    return pg_catalog.jsonb_build_object('state', 'not_joined');
  end if;
  if v_player.finished_at is not null then
    return pg_catalog.jsonb_build_object('state', 'finished');
  end if;

  -- Le chronomètre doit avoir été posé par start_quiz_question : sans ligne, le
  -- délai serait inconnu — on refuse plutôt que d'inventer une référence.
  select a.* into v_answer
    from public.quiz_answers a
   where a.player_id = v_player.id and a.question_id = v_question.id
   for update;
  if not found then
    return pg_catalog.jsonb_build_object('state', 'not_started');
  end if;
  -- Invariant #3 : une seule réponse par question.
  if v_answer.answered_at is not null then
    return pg_catalog.jsonb_build_object(
      'state', 'already_answered',
      'is_correct', v_answer.is_correct,
      'points_awarded', v_answer.points_awarded,
      'elapsed_ms', v_answer.elapsed_ms,
      'timed_out', v_answer.timed_out);
  end if;

  -- Forme de la réponse validée en base, contre les options et le
  -- ranking_size de LA question — pas côté client. Refus non consommant : une
  -- charge malformée n'apprend rien sur la vérité.
  if not public.is_valid_quiz_answer(
       v_question.question_type, v_question.options,
       v_question.ranking_size, p_answer
     )
  then
    return pg_catalog.jsonb_build_object('state', 'invalid_answer');
  end if;

  -- DÉLAI SERVEUR (jamais fourni par le client), plafonné : la fenêtre de la
  -- question si elle en a une, 24 h sinon (garde elapsed_ms dans l'integer et
  -- total_elapsed_ms comparable entre joueurs).
  v_raw_ms := pg_catalog.floor(
    extract(epoch from (v_now - v_answer.started_at)) * 1000)::bigint;
  if v_raw_ms < 0 then
    v_raw_ms := 0;
  end if;
  v_cap_ms := coalesce(v_question.time_limit_seconds::bigint * 1000, 86400000);
  v_elapsed_ms := least(v_raw_ms, v_cap_ms)::integer;

  if v_question.time_limit_seconds is not null
     and v_raw_ms > v_question.time_limit_seconds::bigint * 1000
  then
    -- HORS DÉLAI : réponse refusée (jamais scorée), question consommée.
    v_timed_out := true;
    v_is_correct := false;
    v_points := 0;
  else
    -- ÉVALUATION SERVEUR de la justesse.
    v_is_correct := public.quiz_answer_is_correct(
      v_question.question_type, v_question.correct_answer, p_answer,
      v_question.tolerance);
    v_points := case when v_is_correct then v_question.points else 0 end;
  end if;

  update public.quiz_answers
     set answered_at = v_now,
         answer = p_answer,
         elapsed_ms = v_elapsed_ms,
         is_correct = v_is_correct,
         points_awarded = v_points,
         timed_out = v_timed_out
   where id = v_answer.id;

  update public.quiz_players
     set score = score + v_points,
         correct_count = correct_count + case when v_is_correct then 1 else 0 end,
         total_elapsed_ms = total_elapsed_ms + v_elapsed_ms
   where id = v_player.id
  returning * into v_player;

  select pg_catalog.count(*)::integer into v_answered
    from public.quiz_answers a
   where a.player_id = v_player.id and a.answered_at is not null;
  select pg_catalog.count(*)::integer into v_total
    from public.quiz_questions qq where qq.quiz_id = v_quiz.id;

  -- Le joueur a répondu : la vérité de CETTE question lui est due.
  return pg_catalog.jsonb_build_object(
    'state', case when v_timed_out then 'too_late' else 'recorded' end,
    'question_id', v_question.id,
    'is_correct', v_is_correct,
    'points_awarded', v_points,
    'elapsed_ms', v_elapsed_ms,
    'timed_out', v_timed_out,
    'correct_answer', v_question.correct_answer,
    'player', pg_catalog.jsonb_build_object(
      'score', v_player.score, 'correct_count', v_player.correct_count,
      'total_elapsed_ms', v_player.total_elapsed_ms),
    'progression', pg_catalog.jsonb_build_object(
      'answered_count', v_answered, 'question_count', v_total)
  );
end;
$$;

comment on function public.submit_quiz_answer(uuid, text, uuid, jsonb) is
  'Enregistre UNE réponse : délai calculé en base (now() - started_at), dépassement de time_limit_seconds refusé (hors barème, question consommée), justesse évaluée SERVEUR contre correct_answer. Aucun paramètre de temps ni de score n''est accepté du client.';

revoke all on function public.submit_quiz_answer(uuid, text, uuid, jsonb)
  from public, anon, authenticated;
grant execute on function public.submit_quiz_answer(uuid, text, uuid, jsonb)
  to service_role;

-- ── finish_quiz ──────────────────────────────────────────────
-- Clôt la participation : RECALCULE le score final depuis quiz_answers (source
-- de vérité, indépendante des agrégats dénormalisés) puis applique le mode de
-- récompense :
--   threshold → lot si correct_count >= reward_threshold ;
--   instant   → lot À LA FIN DU QUIZ : toutes les questions doivent avoir été
--               RÉPONDUES (answered_count >= question_count, quiz non vide).
--               Sans cette garde, deux appels (join puis finish) suffiraient à
--               vider le stock sans jamais lire une question ;
--   draw / ranking → RIEN ici (différé, cf. draw_quiz_winners) ;
--   none      → rien.
-- Idempotent : un second appel renvoie l'état et le lot déjà émis, sans
-- ré-émettre (état 'already_finished').
create or replace function public.finish_quiz(
  p_quiz_id uuid,
  p_player_token_hash text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_quiz public.quizzes%rowtype;
  v_player public.quiz_players%rowtype;
  v_reward public.quiz_rewards%rowtype;
  v_score integer;
  v_correct integer;
  v_elapsed bigint;
  v_answered integer;
  v_total integer;
  v_already boolean;
  v_emit jsonb := null;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'not authorized';
  end if;
  if p_player_token_hash is null or p_player_token_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid player token';
  end if;

  -- Verrou du quiz : fige le stock et sérialise l'émission (aucune
  -- sur-émission possible entre deux clôtures concurrentes).
  select q.* into v_quiz
    from public.quizzes q
    join public.organizations o on o.id = q.organization_id
   where q.id = p_quiz_id and o.addon_quiz
   for update of q;
  if not found or v_quiz.status <> 'active' then
    return pg_catalog.jsonb_build_object('state', 'unavailable');
  end if;

  select p.* into v_player
    from public.quiz_players p
   where p.quiz_id = v_quiz.id and p.token_hash = p_player_token_hash
   for update;
  if not found then
    return pg_catalog.jsonb_build_object('state', 'not_joined');
  end if;
  v_already := v_player.finished_at is not null;

  -- Recalcul depuis les réponses figées (les agrégats dénormalisés ne sont
  -- qu'un cache).
  select coalesce(pg_catalog.sum(a.points_awarded), 0)::integer,
         (pg_catalog.count(*) filter (where a.is_correct))::integer,
         coalesce(pg_catalog.sum(a.elapsed_ms), 0)::bigint,
         (pg_catalog.count(*) filter (where a.answered_at is not null))::integer
    into v_score, v_correct, v_elapsed, v_answered
    from public.quiz_answers a
   where a.player_id = v_player.id;
  select pg_catalog.count(*)::integer into v_total
    from public.quiz_questions qq where qq.quiz_id = v_quiz.id;

  update public.quiz_players
     set score = v_score,
         correct_count = v_correct,
         total_elapsed_ms = v_elapsed,
         finished_at = coalesce(finished_at, pg_catalog.now())
   where id = v_player.id
  returning * into v_player;

  if not v_already then
    -- Modes à émission IMMÉDIATE. draw / ranking sont différés : rien ici.
    -- CHAQUE mode est adossé à un TRAVAIL RÉEL du joueur, recalculé ci-dessus
    -- depuis quiz_answers :
    --   instant   → le quiz doit être TERMINÉ (toutes les questions répondues,
    --               quiz non vide) : `finish_quiz` seul, sans aucune réponse,
    --               n'émet RIEN — sinon join+finish en boucle viderait le stock ;
    --   threshold → reward_threshold bonnes réponses (CHECK : >= 1).
    if (v_quiz.reward_mode = 'instant'
        and v_total > 0 and v_answered >= v_total)
       or (v_quiz.reward_mode = 'threshold'
           and v_correct >= coalesce(v_quiz.reward_threshold, 0))
    then
      v_emit := public.quiz_emit_reward(
        v_quiz.id, v_quiz.organization_id, v_player.id, v_quiz.reward_mode, null);
    end if;
  end if;

  -- Lot du joueur (émis à l'instant, ou lors d'un appel précédent).
  select r.* into v_reward
    from public.quiz_rewards r
   where r.quiz_id = v_quiz.id and r.player_id = v_player.id;

  return pg_catalog.jsonb_build_object(
    'state', case when v_already then 'already_finished' else 'finished' end,
    'player', pg_catalog.jsonb_build_object(
      'id', v_player.id, 'score', v_player.score,
      'correct_count', v_player.correct_count,
      'total_elapsed_ms', v_player.total_elapsed_ms,
      'finished_at', v_player.finished_at),
    'progression', pg_catalog.jsonb_build_object(
      'answered_count', v_answered, 'question_count', v_total),
    'reward_mode', v_quiz.reward_mode,
    'reward_threshold', v_quiz.reward_threshold,
    -- Modes différés : le joueur sait que le sort n'est pas encore tiré.
    'pending_draw', (v_quiz.reward_mode in ('draw', 'ranking')
                     and v_quiz.draw_state = 'pending'),
    'reward', case when v_reward.id is null then null else
      pg_catalog.jsonb_build_object(
        'source', v_reward.source, 'rank', v_reward.rank,
        'code', v_reward.code, 'spin_grant_token', v_reward.spin_grant_token,
        'target_wheel_id', case when v_reward.spin_grant_token is not null
          then v_quiz.target_wheel_id end,
        'resulting_spin_id', v_reward.resulting_spin_id,
        'out_of_stock', v_reward.out_of_stock,
        'redeemed_at', v_reward.redeemed_at) end,
    'emitted', coalesce((v_emit ->> 'emitted')::boolean, false)
  );
end;
$$;

comment on function public.finish_quiz(uuid, text) is
  'Clôt une participation, recalcule le score depuis quiz_answers et applique le mode de récompense (threshold : reward_threshold bonnes réponses ; instant : quiz RÉELLEMENT terminé, toutes les questions répondues ; draw / ranking différés ; none n''émet rien). Idempotent.';

revoke all on function public.finish_quiz(uuid, text)
  from public, anon, authenticated;
grant execute on function public.finish_quiz(uuid, text) to service_role;

-- ── consume_quiz_spin_grant ──────────────────────────────────
-- Miroir de consume_calendar_spin_grant : échange un grant_token à usage unique
-- contre EXACTEMENT un tirage pondéré atomique sur la roue cible du quiz
-- (réservation de stock incluse), SANS limite de jeu. Anti-rejeu : verrou FOR
-- UPDATE de la récompense ; un second appel voit consumed_at.
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
       and (p.is_losing or p.stock is null or p.stock > 0);
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

comment on function public.consume_quiz_spin_grant(uuid, text, text) is
  'Échange le jeton de tour offert d''un quiz contre exactement un tirage pondéré atomique sur la roue cible. Usage unique (anti-rejeu par verrou de ligne).';

revoke all on function public.consume_quiz_spin_grant(uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.consume_quiz_spin_grant(uuid, text, text)
  to service_role;

-- ════════════════════════════════════════════════════════════
-- 10. RPC LECTURE PUBLIQUE de l'état (service_role)
-- ════════════════════════════════════════════════════════════
-- INVARIANT CENTRAL (#2) : `correct_answer` n'est attachée QU'AUX questions
-- auxquelles CE joueur a déjà répondu — patron exact de calendar_public_state,
-- où le contenu d'une case n'est joint qu'aux cases déjà ouvertes. Aucune
-- réponse d'un AUTRE joueur n'est jamais exposée (le classement, RPC séparée,
-- ne publie que prénom / avatar / score / temps).
create or replace function public.quiz_public_state(
  p_quiz_id uuid,
  p_player_token_hash text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_quiz public.quizzes%rowtype;
  v_player public.quiz_players%rowtype;
  v_has_player boolean := false;
  v_now timestamptz := pg_catalog.now();
  v_questions jsonb;
  v_reward jsonb := null;
  v_answered integer := 0;
  v_total integer;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'not authorized';
  end if;

  -- Défense en profondeur : module souscrit ET quiz actif re-vérifiés ICI, pas
  -- seulement chez l'appelant (loadQuizPublicContext / loadQuizActionContext).
  -- Réponse 'unavailable' identique quel que soit le motif — pas d'oracle.
  select q.* into v_quiz
    from public.quizzes q
    join public.organizations o on o.id = q.organization_id
   where q.id = p_quiz_id and o.addon_quiz;
  if not found or v_quiz.status <> 'active' then
    return pg_catalog.jsonb_build_object('state', 'unavailable');
  end if;

  if p_player_token_hash is not null and p_player_token_hash ~ '^[0-9a-f]{64}$' then
    select p.* into v_player
      from public.quiz_players p
     where p.quiz_id = v_quiz.id and p.token_hash = p_player_token_hash;
    v_has_player := found;
  end if;

  select pg_catalog.count(*)::integer into v_total
    from public.quiz_questions qq where qq.quiz_id = v_quiz.id;
  if v_has_player then
    select pg_catalog.count(*)::integer into v_answered
      from public.quiz_answers a
     where a.player_id = v_player.id and a.answered_at is not null;
  end if;

  -- Grille des questions. `correct_answer` et la réponse du joueur ne sont
  -- incluses QUE pour les questions déjà RÉPONDUES par CE joueur (LEFT JOIN sur
  -- SES quiz_answers). Sinon : énoncé + options seuls (les options ne
  -- désignent pas la bonne réponse).
  select coalesce(pg_catalog.jsonb_agg(x.obj order by x.position), '[]'::jsonb)
    into v_questions
    from (
      select qq.position,
        case when a.answered_at is not null then
          -- RÉPONDUE par le joueur : la vérité lui est due (la sienne seule).
          pg_catalog.jsonb_build_object(
            'id', qq.id, 'position', qq.position,
            'question_type', qq.question_type, 'preset', qq.preset,
            'prompt', qq.prompt, 'image_url', qq.image_url,
            'options', qq.options, 'ranking_size', qq.ranking_size,
            'tolerance', qq.tolerance, 'points', qq.points,
            'time_limit_seconds', qq.time_limit_seconds,
            'status', 'answered',
            'correct_answer', qq.correct_answer,
            'your_answer', a.answer,
            'is_correct', a.is_correct,
            'points_awarded', a.points_awarded,
            'elapsed_ms', a.elapsed_ms,
            'timed_out', a.timed_out)
        else
          -- NON RÉPONDUE : AUCUNE vérité (invariant #2). `started_at` est
          -- renvoyé pour que le client puisse afficher le chronomètre déjà
          -- lancé — la borne fait foi en base, pas à l'écran.
          pg_catalog.jsonb_build_object(
            'id', qq.id, 'position', qq.position,
            'question_type', qq.question_type, 'preset', qq.preset,
            'prompt', qq.prompt, 'image_url', qq.image_url,
            'options', qq.options, 'ranking_size', qq.ranking_size,
            'tolerance', qq.tolerance, 'points', qq.points,
            'time_limit_seconds', qq.time_limit_seconds,
            'status', case when a.id is not null then 'in_progress' else 'pending' end,
            'started_at', a.started_at)
        end as obj
        from public.quiz_questions qq
        left join public.quiz_answers a
          on a.question_id = qq.id
         and v_has_player
         and a.player_id = v_player.id
       where qq.quiz_id = v_quiz.id
    ) x;

  -- Lot du joueur (jamais celui d'un autre).
  if v_has_player then
    select pg_catalog.jsonb_build_object(
             'source', r.source, 'rank', r.rank, 'code', r.code,
             'spin_grant_token', r.spin_grant_token,
             'target_wheel_id', case when r.spin_grant_token is not null
               then v_quiz.target_wheel_id end,
             'resulting_spin_id', r.resulting_spin_id,
             'out_of_stock', r.out_of_stock,
             'redeemed_at', r.redeemed_at)
      into v_reward
      from public.quiz_rewards r
     where r.quiz_id = v_quiz.id and r.player_id = v_player.id
     limit 1;
  end if;

  return pg_catalog.jsonb_build_object(
    'state', 'ok',
    'server_now', v_now,
    'quiz', pg_catalog.jsonb_build_object(
      'id', v_quiz.id, 'name', v_quiz.name, 'theme', v_quiz.theme,
      'status', v_quiz.status, 'intro_text', v_quiz.intro_text,
      'question_count', v_total,
      'reward_mode', v_quiz.reward_mode,
      'reward_threshold', v_quiz.reward_threshold,
      'draw_top_n', v_quiz.draw_top_n,
      'draw_state', v_quiz.draw_state,
      'reward_label', v_quiz.reward_label,
      'reward_details', v_quiz.reward_details,
      'reward_stock', v_quiz.reward_stock,
      'reward_claimed_count', v_quiz.reward_claimed_count),
    'questions', v_questions,
    'player', case when not v_has_player then null else
      pg_catalog.jsonb_build_object(
        'id', v_player.id, 'first_name', v_player.first_name,
        'avatar', v_player.avatar, 'score', v_player.score,
        'correct_count', v_player.correct_count,
        'total_elapsed_ms', v_player.total_elapsed_ms,
        'finished_at', v_player.finished_at) end,
    'progression', pg_catalog.jsonb_build_object(
      'answered_count', v_answered, 'question_count', v_total),
    'reward', v_reward
  );
end;
$$;

comment on function public.quiz_public_state(uuid, text) is
  'État de la page joueur. N''expose JAMAIS correct_answer d''une question à laquelle CE joueur n''a pas encore répondu, ni aucune réponse d''un autre joueur. Exige en interne l''addon souscrit et un quiz actif (défense en profondeur) : sinon ''unavailable'', sans oracle.';

revoke all on function public.quiz_public_state(uuid, text)
  from public, anon, authenticated;
grant execute on function public.quiz_public_state(uuid, text) to service_role;

-- ── quiz_leaderboard ─────────────────────────────────────────
-- Classement des participations TERMINÉES : score décroissant PUIS temps total
-- croissant. Ex æquo gérés comme aux pronostics (`rank()` de
-- contest_leaderboard : deux joueurs à score et temps identiques partagent le
-- rang, le suivant saute) ; l'ordre d'AFFICHAGE reste stable (created_at, id).
-- AUCUN email dans la charge utile — contrairement à contest_leaderboard, ce
-- classement est destiné à la page publique.
create or replace function public.quiz_leaderboard(
  p_quiz_id uuid,
  p_limit integer default 50,
  p_offset integer default 0
)
returns table(
  player_id uuid,
  first_name text,
  avatar text,
  score integer,
  correct_count integer,
  total_elapsed_ms bigint,
  finished_at timestamptz,
  rank bigint,
  total_players bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_org uuid;
  v_status text;
  v_addon boolean;
begin
  select q.organization_id, q.status, o.addon_quiz
    into v_org, v_status, v_addon
    from public.quizzes q
    join public.organizations o on o.id = q.organization_id
   where q.id = p_quiz_id;
  if v_org is null then
    return; -- quiz inconnu : zéro ligne, pas d'oracle d'existence
  end if;
  -- Non habilité : ZÉRO LIGNE, comme un quiz inconnu — la réponse doit être
  -- INDISTINGUABLE dans les deux cas, sinon une exception « not authorized »
  -- prouverait à elle seule qu'un quiz existe sous cet id (oracle d'existence
  -- inter-tenant).
  if not (
    coalesce(auth.role(), '') = 'service_role'
    or public.is_org_member(v_org)
  ) then
    return;
  end if;
  -- Défense en profondeur du chemin PUBLIC (service_role) : le module doit être
  -- souscrit et le quiz actif. Les appelants le vérifient déjà
  -- (loadQuizActionContext / loadQuizPublicContext) ; on ne s'en remet pas à
  -- eux. Un MEMBRE reste libre de consulter le classement d'un quiz en pause ou
  -- archivé — c'est le bilan de son opération.
  if coalesce(auth.role(), '') = 'service_role'
     and (not coalesce(v_addon, false) or v_status <> 'active') then
    return;
  end if;

  return query
  with ranked as (
    select p.id,
           p.first_name,
           p.avatar,
           p.score,
           p.correct_count,
           p.total_elapsed_ms,
           p.finished_at,
           p.created_at,
           pg_catalog.rank() over (
             order by p.score desc, p.total_elapsed_ms asc
           ) as rnk,
           pg_catalog.count(*) over () as total
      from public.quiz_players p
     where p.quiz_id = p_quiz_id
       and p.finished_at is not null
  )
  select r.id, r.first_name, r.avatar, r.score, r.correct_count,
         r.total_elapsed_ms, r.finished_at, r.rnk, r.total
    from ranked r
   order by r.rnk asc, r.created_at asc, r.id asc
   limit greatest(least(coalesce(p_limit, 50), 500), 0)
  offset greatest(coalesce(p_offset, 0), 0);
end;
$$;

comment on function public.quiz_leaderboard(uuid, integer, integer) is
  'Classement d''un quiz : score décroissant puis total_elapsed_ms croissant, ex æquo partagés (rank(), logique de contest_leaderboard). Ne contient aucun email. Quiz inconnu OU appelant non habilité → zéro ligne (aucun oracle d''existence) ; chemin public : addon souscrit et quiz actif exigés.';

revoke all on function public.quiz_leaderboard(uuid, integer, integer)
  from public, anon;
grant execute on function public.quiz_leaderboard(uuid, integer, integer)
  to authenticated, service_role;

-- ════════════════════════════════════════════════════════════
-- 11. Tirage / classement différé — ATOMIQUE et IDEMPOTENT
-- ════════════════════════════════════════════════════════════
-- Sert les DEUX modes différés, sous le MÊME verrou et la MÊME garde
-- d'idempotence — un seul chemin d'émission à auditer :
--   draw    : tirage au sort parmi les `draw_top_n` MEILLEURS (ordre du
--             classement), permutation par octets cryptographiques ;
--   ranking : top du classement pris DANS L'ORDRE (variante déterministe).
-- IMPOSSIBLE À RELANCER (invariant #5) : `draw_state = 'done'` renvoie
-- immédiatement le tirage existant. Le drapeau n'est posé QU'APRÈS une émission
-- réelle : un tirage lancé avant toute participation renvoie 'no_participants'
-- et laisse `draw_state = 'pending'` (sinon le quiz serait figé à vie, aucune
-- RPC ne repassant à 'pending'). IMPOSSIBLE DE SUR-ÉMETTRE : la boucle est
-- bornée par le stock restant, chaque émission décrémente sous le verrou, et
-- deux contraintes structurelles (unique (quiz_id, player_id), unique
-- (quiz_id, rank)) plus le CHECK claimed <= stock fermeraient la porte même en
-- cas de bug applicatif.
create or replace function public.draw_quiz_winners(
  p_organization_id uuid,
  p_quiz_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_quiz public.quizzes%rowtype;
  v_available integer;
  v_top_n integer;
  v_rank integer := 0;
  v_awarded integer := 0;
  v_out_of_stock boolean := false;
  v_emit jsonb;
  r record;
begin
  if coalesce(auth.role(), '') <> 'service_role'
     and not public.is_org_editor(p_organization_id) then
    raise exception 'not authorized';
  end if;

  select q.* into v_quiz
    from public.quizzes q
   where q.id = p_quiz_id and q.organization_id = p_organization_id
   for update of q;
  if not found then
    return pg_catalog.jsonb_build_object('state', 'unavailable');
  end if;
  if v_quiz.reward_mode not in ('draw', 'ranking') then
    return pg_catalog.jsonb_build_object('state', 'invalid_mode');
  end if;

  -- IDEMPOTENCE (invariant #5) : un tirage fait ne se rejoue JAMAIS.
  if v_quiz.draw_state = 'done' then
    return pg_catalog.jsonb_build_object(
      'state', 'already_drawn',
      'drawn_at', v_quiz.drawn_at,
      'winners', (select pg_catalog.count(*)::integer
                    from public.quiz_rewards rr
                   where rr.quiz_id = v_quiz.id and not rr.out_of_stock));
  end if;

  v_available := greatest(v_quiz.reward_stock - v_quiz.reward_claimed_count, 0);
  -- ranking : le top est borné par le stock lui-même.
  v_top_n := case when v_quiz.reward_mode = 'draw'
    then coalesce(v_quiz.draw_top_n, 0) else v_available end;

  if v_available > 0 and v_top_n > 0 then
    for r in
      select t.id
        from (
          select p.id, p.score, p.total_elapsed_ms, p.created_at
            from public.quiz_players p
           where p.quiz_id = v_quiz.id
             and p.finished_at is not null
             and p.score > 0
           order by p.score desc, p.total_elapsed_ms asc,
                    p.created_at asc, p.id asc
           limit v_top_n
        ) t
       -- draw : permutation aléatoire du vivier (octets cryptographiques,
       -- VOLATILES → un tri différent à chaque exécution ; clé de tri nulle
       -- en mode ranking, qui retombe donc sur l'ordre du classement).
       -- Les critères suivants REPRODUISENT l'ordre du classement : c'est ce
       -- qui rend le mode ranking déterministe (score, puis rapidité).
       order by case when v_quiz.reward_mode = 'draw'
                  then extensions.gen_random_bytes(8) else null end,
                t.score desc, t.total_elapsed_ms asc,
                t.created_at asc, t.id asc
       limit v_available
    loop
      v_rank := v_rank + 1;
      v_emit := public.quiz_emit_reward(
        v_quiz.id, p_organization_id, r.id, v_quiz.reward_mode, v_rank);
      if coalesce((v_emit ->> 'emitted')::boolean, false) then
        v_awarded := v_awarded + 1;
      else
        v_out_of_stock := v_out_of_stock
          or coalesce((v_emit ->> 'out_of_stock')::boolean, false);
      end if;
    end loop;
  else
    v_out_of_stock := (v_quiz.reward_stock > 0 and v_available = 0);
  end if;

  -- AUCUN LOT ÉMIS (personne n'a encore terminé avec un score, ou aucun stock
  -- disponible) : le tirage N'EST PAS consommé. `draw_state` / `drawn_at` sont
  -- RPC-only et aucune RPC ne les ramène à 'pending' ; poser le drapeau ici
  -- figerait DÉFINITIVEMENT un quiz que personne n'a encore joué — un clic trop
  -- tôt suffirait à rendre toute dotation impossible depuis le produit.
  if v_awarded = 0 then
    return pg_catalog.jsonb_build_object(
      'state', 'no_participants',
      'mode', v_quiz.reward_mode,
      'winners', 0,
      'out_of_stock', v_out_of_stock
    );
  end if;

  -- CLÔTURE ONE-SHOT, posée UNIQUEMENT après une émission RÉELLE : le tirage est
  -- consommé, un second appel renverra 'already_drawn' sans rien émettre
  -- (l'idempotence d'un tirage réussi reste donc entière).
  update public.quizzes
     set draw_state = 'done', drawn_at = pg_catalog.now()
   where id = v_quiz.id;

  return pg_catalog.jsonb_build_object(
    'state', 'drawn',
    'mode', v_quiz.reward_mode,
    'winners', v_awarded,
    'out_of_stock', v_out_of_stock
  );
end;
$$;

comment on function public.draw_quiz_winners(uuid, uuid) is
  'Tirage au sort (mode draw, parmi les draw_top_n meilleurs) ou attribution au classement (mode ranking, top déterministe) : atomique sous verrou et IDEMPOTENT — un second appel n''émet rien. États : drawn / already_drawn / no_participants (aucun lot émis, tirage NON consommé, relançable) / invalid_mode / unavailable.';

revoke all on function public.draw_quiz_winners(uuid, uuid)
  from public, anon;
grant execute on function public.draw_quiz_winners(uuid, uuid)
  to authenticated, service_role;

-- ════════════════════════════════════════════════════════════
-- 12. RPC caisse : remise d'un lot de quiz
-- ════════════════════════════════════════════════════════════
-- Miroir de redeem_calendar_reward / redeem_jackpot_prize : recherche +
-- validation + audit atomiques, actor obligatoire, org-scopée (code inconnu,
-- déjà remis, jeton de spin, ou code d'une AUTRE organisation → aucune remise,
-- réponse indistinguable).
create or replace function public.redeem_quiz_reward(
  p_organization_id uuid,
  p_code text,
  p_actor text
)
returns table(
  id uuid, created_at timestamptz, code text, redeemed_at timestamptz,
  quiz_name text, reward_label text, reward_details text,
  source text, rank integer, redeemed_now boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_code text;
  v_id uuid;
begin
  if p_actor is null or length(p_actor) = 0 then
    raise exception 'actor required';
  end if;
  v_code := upper(btrim(coalesce(p_code, '')));

  update public.quiz_rewards r
     set redeemed_at = now(),
         redeemed_by = p_actor
   where r.organization_id = p_organization_id
     and r.code = v_code
     and r.redeemed_at is null
  returning r.id into v_id;

  if v_id is not null then
    insert into public.audit_logs(organization_id, actor, action, metadata)
    values (p_organization_id, p_actor, 'quiz.redeem',
            pg_catalog.jsonb_build_object('reward_id', v_id));
  end if;

  return query
  select r.id, r.created_at, r.code, r.redeemed_at,
         q.name, q.reward_label, q.reward_details,
         r.source, r.rank, (r.id is not distinct from v_id)
    from public.quiz_rewards r
    join public.quizzes q on q.id = r.quiz_id
   where r.organization_id = p_organization_id
     and r.code = v_code
   limit 1;
end;
$$;

comment on function public.redeem_quiz_reward(uuid, text, text) is
  'Remise en caisse d''un code QUIZ-… : org-scopée, actor obligatoire, auditée, réponse indistinguable pour un code inconnu ou d''une autre organisation.';

revoke all on function public.redeem_quiz_reward(uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.redeem_quiz_reward(uuid, text, text)
  to service_role;

-- ════════════════════════════════════════════════════════════
-- 13. Purge RGPD
-- ════════════════════════════════════════════════════════════
-- DIVERGENCE ASSUMÉE (à relayer à security-review) par rapport à
-- purge_expired_calendar_players / purge_expired_event_sessions, qui
-- SUPPRIMENT les joueurs :
--   1. On NEUTRALISE la PII (prénom, email, avatar, opt-in) au lieu de
--      supprimer la ligne. Supprimer cascaderait quiz_answers ET quiz_rewards,
--      détruisant le registre des codes émis (un lot non encore remis en caisse
--      deviendrait inexploitable) et le classement. La PII ne se limite PAS aux
--      colonnes de quiz_players : une réponse de type `text` est du TEXTE LIBRE
--      saisi par le joueur (« Comment s'appelle notre chef ? » → un prénom), donc
--      elle est vidée aussi. Après passage il reste : un hash de jeton non
--      inversible, les réponses à choix / nombre / classement (aucune PII
--      possible : elles ne peuvent contenir qu'un id d'option, un nombre ou un
--      ordre validés en base), et l'ISSUE de chaque réponse (is_correct,
--      points_awarded, elapsed_ms) — le score reste donc vérifiable.
--   2. La purge N'EST PAS conditionnée au statut du quiz. Un quiz en
--      libre-service reste actif des mois ; le gel de purge signalé pour le
--      calendrier (« un commerçant qui n'archive jamais gèle la purge ») ne se
--      produit donc pas ici : seule l'ANCIENNETÉ de la participation compte.
-- À brancher au cron /api/cron/purge-data.
create or replace function public.purge_expired_quiz_players()
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_purged bigint;
begin
  update public.quiz_players pl
     set first_name = null,
         email = null,
         avatar = '',
         marketing_opt_in = false
    from public.quizzes q, public.organizations o
   where pl.quiz_id = q.id
     and q.organization_id = o.id
     and o.data_retention_months is not null
     and pl.created_at < pg_catalog.now()
       - pg_catalog.make_interval(months => o.data_retention_months)
     and (pl.first_name is not null
          or pl.email is not null
          or pl.avatar <> ''
          or pl.marketing_opt_in);
  get diagnostics v_purged = row_count;

  -- RÉPONSES LIBRES (question_type = 'text') : du texte SAISI par le joueur,
  -- donc de la PII potentielle (un prénom sur « comment s'appelle notre
  -- chef ? »). Vidées pour les MÊMES participations expirées. On conserve
  -- is_correct / points_awarded / elapsed_ms (le score reste vérifiable) et le
  -- registre des codes. Les autres types (choice / number / ranking) ne peuvent
  -- contenir qu'un id d'option, un nombre ou un ordre validés en base : rien à
  -- neutraliser. Idempotent : une réponse déjà vidée n'est pas retouchée (le
  -- trigger quiz_answers_freeze n'autorise QUE cette transition destructive).
  update public.quiz_answers a
     set answer = '""'::jsonb
    from public.quiz_questions qq,
         public.quiz_players pl,
         public.quizzes q,
         public.organizations o
   where qq.id = a.question_id
     and qq.question_type = 'text'
     and pl.id = a.player_id
     and pl.quiz_id = q.id
     and q.organization_id = o.id
     and o.data_retention_months is not null
     and pl.created_at < pg_catalog.now()
       - pg_catalog.make_interval(months => o.data_retention_months)
     and a.answer is not null
     and a.answer <> '""'::jsonb;

  -- La valeur de retour reste le nombre de PARTICIPATIONS anonymisées (contrat
  -- inchangé pour le cron), pas le nombre de réponses vidées.
  return v_purged;
end;
$$;

comment on function public.purge_expired_quiz_players() is
  'Purge RGPD du module quiz : NEUTRALISE la PII (prénom, email, avatar, opt-in) ET les réponses LIBRES (question_type = text, texte saisi par le joueur) des participations plus anciennes que data_retention_months, en conservant l''issue des réponses (score vérifiable), le registre anonyme des lots et le classement. Renvoie le nombre de participations anonymisées.';

revoke all on function public.purge_expired_quiz_players()
  from public, anon, authenticated;
grant execute on function public.purge_expired_quiz_players()
  to service_role;
