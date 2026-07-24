-- ============================================================
-- Lastchance — Pronostics génériques (vague 1, couche DB)
--
-- Le moteur de pronostics devient INDÉPENDANT du football : le foot
-- n'est plus qu'un TYPE DE QUESTION (`score`) parmi quatre, et un modèle
-- d'événement (`contests.event_kind = 'football'`) parmi d'autres.
--
--   Événement → questions → verrouillage → résultat → barème → classement
--
-- STRICTEMENT ADDITIVE. Aucune colonne, aucune fonction, aucune règle du
-- chemin football n'est retirée ni modifiée dans son comportement :
--   · `contest_matches` reste le porteur des questions (nom de table
--     conservé) et gagne question_type/prompt/options/correct_answer/
--     locks_at/ranking_size, tous à défaut « foot compatible » ;
--   · `question_type` vaut 'score' par défaut → toutes les lignes
--     existantes restent des matchs de football, inchangées ;
--   · `locks_at` est BACKFILLÉ à `kickoff_at` → la fenêtre de pronostic
--     du foot est bit pour bit la même ;
--   · `contest_prediction_points` (barème score) n'est PAS touchée ;
--   · `set_contest_match_result` garde sa signature 7 paramètres et son
--     corps, avec une seule garde ajoutée (refus si la question n'est
--     pas de type score) — inerte sur un championnat football ;
--   · `contest_leaderboard`, `contest_player_rank` et `finalize_contest`
--     ne sont PAS recréées : elles agrègent `contest_predictions.points`,
--     déjà générique. Voir la note « exact_count » en fin de fichier.
--
-- Deux chemins symétriques, un par famille de question :
--   score    → submit_contest_prediction / set_contest_match_result
--   générique → submit_contest_answer    / set_contest_question_result
-- avec la MÊME règle de verrouillage, serveur-autoritaire :
--   effective_locks_at = coalesce(question.locks_at,
--                                 contest.default_locks_at,
--                                 question.kickoff_at)
-- ============================================================

-- ════════════════════════════════════════════════════════════
-- 1. Barème : clés jsonb de `contests.scoring`
-- ════════════════════════════════════════════════════════════
-- CONTRAT (miroir exact attendu côté TypeScript, src/lib/pronostics.ts) :
--
--   {
--     "exact": 3,              -- score : score exact          (défaut 3)
--     "diff": 2,               -- score : bonne différence     (défaut 2)
--     "winner": 1,             -- score : bon vainqueur        (défaut 1)
--     "choice": 3,             -- choice : bonne option        (défaut 3)
--     "ranking_exact": 5,      -- ranking : ordre complet juste (défaut 5)
--     "ranking_partial": 1,    -- ranking : PAR élément bien placé (défaut 1)
--     "number_exact": 5,       -- number : valeur exacte       (défaut 5)
--     "number_close": 2,       -- number : dans la tolérance   (défaut 2)
--     "number_tolerance": 0    -- number : écart absolu toléré (défaut 0)
--   }
--
-- Les six clés génériques sont FACULTATIVES : un championnat football
-- historique ne porte que exact/diff/winner et les défauts ci-dessus
-- s'appliquent. `number_tolerance` vaut 0 par défaut, donc `number_close`
-- ne se déclenche jamais tant que le commerçant n'a pas fixé une
-- tolérance — choix volontairement conservateur.
--
-- Règles de calcul par type (autorité SQL, à répliquer en TS) :
--   score   : exact ⊃ diff ⊃ winner — INCHANGÉ (contest_prediction_points)
--   choice  : `choice` si answer == correct_answer, sinon 0
--   ranking : `ranking_exact` si le tableau est identique (même ordre,
--             même longueur) ; sinon `ranking_partial` × (nombre
--             d'éléments à la BONNE POSITION)
--   number  : `number_exact` si écart nul ; sinon `number_close` si
--             |answer - correct_answer| <= `number_tolerance` ; sinon 0
-- Une question sans résultat connu ne rapporte rien (points = null),
-- exactement comme un match non terminé aujourd'hui.

-- Lecture défensive d'un palier : toute valeur absente, non numérique,
-- non entière ou hors bornes retombe sur le défaut (jamais d'exception
-- dans un recalcul de classement).
create or replace function public.contest_scoring_points(
  p_scoring jsonb,
  p_key text,
  p_default integer
)
returns integer
language plpgsql
immutable
set search_path = pg_catalog
as $$
declare
  v_value numeric;
begin
  if p_scoring is null or jsonb_typeof(p_scoring -> p_key) <> 'number' then
    return p_default;
  end if;
  v_value := (p_scoring ->> p_key)::numeric;
  if trunc(v_value) <> v_value or v_value < 0 or v_value > 1000000 then
    return p_default;
  end if;
  return v_value::integer;
exception when others then
  return p_default;
end;
$$;

comment on function public.contest_scoring_points(jsonb, text, integer) is
  'Palier de barème lu dans contests.scoring, avec repli sur le défaut si absent ou invalide.';

revoke all on function public.contest_scoring_points(jsonb, text, integer)
  from public, anon;
grant execute on function public.contest_scoring_points(jsonb, text, integer)
  to authenticated, service_role;

-- Validation du document `contests.scoring`. exact/diff/winner restent
-- OBLIGATOIRES et bornés comme avant (00023) ; les clés génériques sont
-- validées seulement lorsqu'elles sont présentes. Les clés inconnues sont
-- IGNORÉES (et non rejetées) : la vague 2 ajoutera des types de question
-- sans qu'une contrainte figée bloque la mise à jour d'un championnat.
create or replace function public.is_valid_contest_scoring(p_value jsonb)
returns boolean
language plpgsql
immutable
set search_path = pg_catalog
as $$
declare
  v_exact numeric;
  v_diff numeric;
  v_winner numeric;
  v_key text;
  v_num numeric;
begin
  if jsonb_typeof(p_value) <> 'object'
    or jsonb_typeof(p_value -> 'exact') <> 'number'
    or jsonb_typeof(p_value -> 'diff') <> 'number'
    or jsonb_typeof(p_value -> 'winner') <> 'number'
  then
    return false;
  end if;

  v_exact := (p_value ->> 'exact')::numeric;
  v_diff := (p_value ->> 'diff')::numeric;
  v_winner := (p_value ->> 'winner')::numeric;

  if not (
    trunc(v_exact) = v_exact and v_exact between 0 and 100
    and trunc(v_diff) = v_diff and v_diff between 0 and 100
    and trunc(v_winner) = v_winner and v_winner between 0 and 100
  ) then
    return false;
  end if;

  for v_key in select * from jsonb_object_keys(p_value)
  loop
    if v_key in ('choice', 'ranking_exact', 'ranking_partial',
                 'number_exact', 'number_close')
    then
      if jsonb_typeof(p_value -> v_key) <> 'number' then
        return false;
      end if;
      v_num := (p_value ->> v_key)::numeric;
      if trunc(v_num) <> v_num or v_num < 0 or v_num > 100 then
        return false;
      end if;
    elsif v_key = 'number_tolerance' then
      if jsonb_typeof(p_value -> v_key) <> 'number' then
        return false;
      end if;
      v_num := (p_value ->> v_key)::numeric;
      if v_num < 0 or v_num > 1000000 then
        return false;
      end if;
    end if;
  end loop;

  return true;
exception when others then
  return false;
end;
$$;

-- ════════════════════════════════════════════════════════════
-- 2. Validation de forme : options, réponses, questions
-- ════════════════════════════════════════════════════════════

-- Options de `choice` / `ranking` : [{ "id": "...", "label": "..." }]
-- 2 à 50 entrées, identifiants courts et DISTINCTS.
create or replace function public.is_valid_contest_options(p_options jsonb)
returns boolean
language plpgsql
immutable
set search_path = pg_catalog
as $$
declare
  v_item jsonb;
  v_count integer;
  v_distinct integer;
begin
  -- `is distinct from` et non `<>` : sur un p_options null, `<>` rend
  -- NULL, plpgsql traite `if NULL` comme faux et la fonction laisserait
  -- passer une question choice/ranking SANS options.
  if p_options is null or jsonb_typeof(p_options) is distinct from 'array' then
    return false;
  end if;
  v_count := jsonb_array_length(p_options);
  if v_count < 2 or v_count > 50 then
    return false;
  end if;

  for v_item in select value from jsonb_array_elements(p_options)
  loop
    -- `is distinct from` : une clé absente rend jsonb_typeof NULL, et un
    -- `<>` laisserait la condition à NULL — donc l'entrée passerait.
    if jsonb_typeof(v_item) is distinct from 'object'
      or jsonb_typeof(v_item -> 'id') is distinct from 'string'
      or jsonb_typeof(v_item -> 'label') is distinct from 'string'
      or (v_item ->> 'id') !~ '^[A-Za-z0-9_-]{1,40}$'
      or char_length(btrim(v_item ->> 'label')) < 1
      or char_length(v_item ->> 'label') > 120
    then
      return false;
    end if;
  end loop;

  select count(distinct value ->> 'id')::integer into v_distinct
    from jsonb_array_elements(p_options);
  return v_distinct = v_count;
exception when others then
  return false;
end;
$$;

comment on function public.is_valid_contest_options(jsonb) is
  'Options ordonnées d''une question choice/ranking : 2 à 50 entrées {id,label}, identifiants distincts.';

revoke all on function public.is_valid_contest_options(jsonb) from public, anon;
grant execute on function public.is_valid_contest_options(jsonb)
  to authenticated, service_role;

-- Forme d'une réponse (pronostic du joueur OU résultat officiel) :
--   choice  → une chaîne, identifiant présent dans les options
--   ranking → un tableau de `ranking_size` identifiants DISTINCTS, tous
--             présents dans les options (l'ordre porte le sens)
--   number  → un nombre borné
-- `score` renvoie toujours false : les scores vivent dans
-- home_score/away_score, pas dans le jsonb.
create or replace function public.is_valid_contest_answer(
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
  v_option_ids text[];
  v_answer_ids text[];
  v_value numeric;
begin
  if p_answer is null then
    return false;
  end if;

  if p_question_type = 'choice' then
    if jsonb_typeof(p_answer) <> 'string' then
      return false;
    end if;
    select array_agg(value ->> 'id') into v_option_ids
      from jsonb_array_elements(p_options);
    return v_option_ids is not null
       and (p_answer #>> '{}') = any (v_option_ids);
  end if;

  if p_question_type = 'ranking' then
    if jsonb_typeof(p_answer) <> 'array'
      or p_ranking_size is null
      or jsonb_array_length(p_answer) <> p_ranking_size
    then
      return false;
    end if;
    if exists (
      select 1 from jsonb_array_elements(p_answer)
       where jsonb_typeof(value) <> 'string'
    ) then
      return false;
    end if;
    select array_agg(value #>> '{}') into v_answer_ids
      from jsonb_array_elements(p_answer);
    select array_agg(value ->> 'id') into v_option_ids
      from jsonb_array_elements(p_options);
    if v_answer_ids is null or v_option_ids is null then
      return false;
    end if;
    -- Aucun doublon dans le classement proposé…
    if (select count(distinct u)::integer from unnest(v_answer_ids) u)
       <> p_ranking_size
    then
      return false;
    end if;
    -- …et chaque identifiant appartient bien aux options.
    return not exists (
      select 1 from unnest(v_answer_ids) u where not (u = any (v_option_ids))
    );
  end if;

  if p_question_type = 'number' then
    if jsonb_typeof(p_answer) <> 'number' then
      return false;
    end if;
    v_value := (p_answer #>> '{}')::numeric;
    return v_value between -1000000000 and 1000000000;
  end if;

  return false;
exception when others then
  return false;
end;
$$;

comment on function public.is_valid_contest_answer(text, jsonb, integer, jsonb) is
  'Forme d''une réponse générique (pronostic joueur ou résultat officiel) selon le type de question.';

revoke all on function public.is_valid_contest_answer(text, jsonb, integer, jsonb)
  from public, anon;
grant execute on function public.is_valid_contest_answer(text, jsonb, integer, jsonb)
  to authenticated, service_role;

-- Cohérence d'une ligne de `contest_matches` selon son type. Porte le
-- CHECK de la table : c'est ici que « le foot ne change pas » se prouve —
-- une ligne score sans champ générique est valide, comme aujourd'hui.
create or replace function public.is_valid_contest_question(
  p_question_type text,
  p_prompt text,
  p_options jsonb,
  p_correct_answer jsonb,
  p_ranking_size integer
)
returns boolean
language plpgsql
immutable
set search_path = pg_catalog
as $$
begin
  -- Football : forme historique, aucun champ générique renseigné. Le
  -- résultat fait autorité dans home_score/away_score (jamais dupliqué
  -- dans correct_answer).
  if p_question_type = 'score' then
    return p_options is null
       and p_correct_answer is null
       and p_ranking_size is null
       and (p_prompt is null or char_length(p_prompt) <= 300);
  end if;

  -- Types génériques : l'intitulé est obligatoire (aucune équipe à
  -- afficher, l'UI ne peut rien composer sans lui).
  if p_prompt is null
    or char_length(btrim(p_prompt)) < 1
    or char_length(p_prompt) > 300
  then
    return false;
  end if;

  if p_question_type = 'choice' then
    if not public.is_valid_contest_options(p_options)
      or p_ranking_size is not null
    then
      return false;
    end if;
  elsif p_question_type = 'ranking' then
    if not public.is_valid_contest_options(p_options)
      or p_ranking_size is null
      or p_ranking_size < 2
      or p_ranking_size > jsonb_array_length(p_options)
    then
      return false;
    end if;
  elsif p_question_type = 'number' then
    if p_options is not null or p_ranking_size is not null then
      return false;
    end if;
  else
    return false;
  end if;

  -- Le résultat reste null tant qu'il est inconnu ; renseigné, il doit
  -- respecter la même forme qu'une réponse de joueur.
  return p_correct_answer is null
     or public.is_valid_contest_answer(
          p_question_type, p_options, p_ranking_size, p_correct_answer
        );
exception when others then
  return false;
end;
$$;

comment on function public.is_valid_contest_question(text, text, jsonb, jsonb, integer) is
  'Cohérence d''une question de pronostic selon son type (score = forme football historique).';

revoke all on function public.is_valid_contest_question(text, text, jsonb, jsonb, integer)
  from public, anon;
grant execute on function public.is_valid_contest_question(text, text, jsonb, jsonb, integer)
  to authenticated, service_role;

-- ════════════════════════════════════════════════════════════
-- 3. `contests` — l'événement
-- ════════════════════════════════════════════════════════════
alter table public.contests
  add column if not exists event_kind text not null default 'football',
  add column if not exists default_locks_at timestamptz;

comment on column public.contests.event_kind is
  'Modèle d''événement : football, ceremony, election, contest… Pilote l''UI et le préréglage des questions. Volontairement NON contraint à une liste figée (les modèles arrivent en vague 2).';
comment on column public.contests.default_locks_at is
  'Verrouillage par défaut de l''événement, utilisé quand une question ne porte pas son propre locks_at.';
comment on column public.contests.scoring is
  'Barème jsonb. Score (foot) : exact/diff/winner. Générique : choice, ranking_exact, ranking_partial, number_exact, number_close, number_tolerance — facultatives, défauts 3/5/1/5/2/0.';

-- Contrainte de FORME seulement (longueur + alphabet), pas d'énumération :
-- ajouter un modèle en vague 2 ne demandera aucune migration.
alter table public.contests
  add constraint contests_event_kind_format_check
    check (event_kind ~ '^[a-z][a-z0-9_]{1,39}$') not valid;
alter table public.contests validate constraint contests_event_kind_format_check;

-- ════════════════════════════════════════════════════════════
-- 4. `contest_matches` — le registre de QUESTIONS
-- ════════════════════════════════════════════════════════════
alter table public.contest_matches
  add column if not exists question_type text not null default 'score',
  add column if not exists prompt text,
  add column if not exists options jsonb,
  add column if not exists correct_answer jsonb,
  add column if not exists locks_at timestamptz,
  add column if not exists ranking_size integer;

comment on column public.contest_matches.question_type is
  'score (football, forme historique) | choice | ranking | number. Défaut score : toutes les lignes existantes restent des matchs.';
comment on column public.contest_matches.prompt is
  'Intitulé de la question (« Qui remportera l''Eurovision ? »). Null pour score : l''UI compose « Équipe A – Équipe B » comme aujourd''hui.';
comment on column public.contest_matches.options is
  'Options ordonnées de choice/ranking : [{"id":"a","label":"…"}]. Null pour score et number.';
comment on column public.contest_matches.correct_answer is
  'Résultat officiel générique : id (choice), tableau ordonné d''ids (ranking), nombre (number). TOUJOURS null pour score — home_score/away_score font autorité, aucune duplication.';
comment on column public.contest_matches.locks_at is
  'Verrouillage propre à la question. Backfillé à kickoff_at pour tout l''existant : la fenêtre de pronostic du football est inchangée.';
comment on column public.contest_matches.ranking_size is
  'Taille du top N attendu pour ranking (3 = podium). Null pour les autres types.';
comment on column public.contest_matches.kickoff_at is
  'Date de l''échéance (coup d''envoi pour le football, date de l''événement sinon). Reste la source du verrouillage quand ni locks_at ni contests.default_locks_at ne sont fixés.';

alter table public.contest_matches
  add constraint contest_matches_question_type_check
    check (question_type in ('score', 'choice', 'ranking', 'number')) not valid;
alter table public.contest_matches validate constraint contest_matches_question_type_check;

-- BACKFILL : locks_at = kickoff_at sur tout l'existant. C'est ce qui
-- garantit que `coalesce(locks_at, default_locks_at, kickoff_at)` rend
-- EXACTEMENT `kickoff_at` pour un championnat football déjà en base.
update public.contest_matches
   set locks_at = kickoff_at
 where locks_at is null;

-- Une question générique n'a ni équipe à domicile ni équipe à
-- l'extérieur : les deux colonnes deviennent optionnelles pour ces
-- types. Pour `score`, la règle « 1 à 60 caractères non blancs » de
-- 00023 est reprise à l'identique.
alter table public.contest_matches
  alter column home_name set default '',
  alter column away_name set default '';
alter table public.contest_matches
  drop constraint if exists contest_matches_names_length_check;
alter table public.contest_matches
  add constraint contest_matches_names_by_type_check
    check (
      case when question_type = 'score'
        then char_length(btrim(home_name)) between 1 and 60
         and char_length(btrim(away_name)) between 1 and 60
        else char_length(home_name) <= 60 and char_length(away_name) <= 60
      end
    ) not valid;
alter table public.contest_matches validate constraint contest_matches_names_by_type_check;

alter table public.contest_matches
  add constraint contest_matches_question_shape_check
    check (public.is_valid_contest_question(
      question_type, prompt, options, correct_answer, ranking_size
    )) not valid;
alter table public.contest_matches validate constraint contest_matches_question_shape_check;

-- ════════════════════════════════════════════════════════════
-- 5. `contest_predictions` — la réponse du joueur
-- ════════════════════════════════════════════════════════════
-- Les scores deviennent facultatifs : une réponse choice/ranking/number
-- n'en a pas. Aucune ligne existante n'est invalidée (elles ont toutes
-- leurs deux scores).
alter table public.contest_predictions
  alter column home_score drop not null,
  alter column away_score drop not null;

alter table public.contest_predictions
  add column if not exists answer jsonb;

comment on column public.contest_predictions.answer is
  'Réponse générique (choice/ranking/number). Null pour un pronostic de score. La validation FINE (options, ranking_size, type) est portée par les RPC de prise de pronostic : un CHECK ne peut pas lire contest_matches.';

-- Garantie minimale exprimable en CHECK : une réponse porte soit les
-- deux scores, soit un answer. L'accord avec le question_type de la
-- question visée est assuré par submit_contest_prediction /
-- submit_contest_answer, seules voies d'écriture (insert/update sont
-- révoqués à authenticated depuis 00023).
alter table public.contest_predictions
  add constraint contest_predictions_answer_shape_check
    check (
      (home_score is not null and away_score is not null)
      or answer is not null
    ) not valid;
alter table public.contest_predictions validate constraint contest_predictions_answer_shape_check;

-- ════════════════════════════════════════════════════════════
-- 6. Barème générique en SQL
-- ════════════════════════════════════════════════════════════
-- `contest_prediction_points` (score) N'EST PAS TOUCHÉE : le football
-- conserve un calcul bit pour bit identique.
create or replace function public.contest_generic_points(
  p_scoring jsonb,
  p_question_type text,
  p_correct_answer jsonb,
  p_answer jsonb
)
returns integer
language plpgsql
immutable
set search_path = pg_catalog
as $$
declare
  v_hits integer;
  v_delta numeric;
  v_tolerance numeric;
begin
  -- Résultat inconnu ou joueur sans réponse : rien à attribuer (null),
  -- même sémantique qu'un match non terminé.
  if p_correct_answer is null or p_answer is null then
    return null;
  end if;

  if p_question_type = 'choice' then
    if p_answer = p_correct_answer then
      return public.contest_scoring_points(p_scoring, 'choice', 3);
    end if;
    return 0;
  end if;

  if p_question_type = 'ranking' then
    -- Ordre complet identique → palier plein.
    if p_answer = p_correct_answer then
      return public.contest_scoring_points(p_scoring, 'ranking_exact', 5);
    end if;
    if jsonb_typeof(p_answer) <> 'array'
      or jsonb_typeof(p_correct_answer) <> 'array'
    then
      return 0;
    end if;
    -- Sinon : ranking_partial PAR élément à la bonne position.
    select count(*)::integer into v_hits
      from jsonb_array_elements(p_answer) with ordinality a(value, ord)
      join jsonb_array_elements(p_correct_answer) with ordinality b(value, ord)
        on a.ord = b.ord
     where a.value = b.value;
    return coalesce(v_hits, 0)
         * public.contest_scoring_points(p_scoring, 'ranking_partial', 1);
  end if;

  if p_question_type = 'number' then
    if jsonb_typeof(p_answer) <> 'number'
      or jsonb_typeof(p_correct_answer) <> 'number'
    then
      return 0;
    end if;
    v_delta := abs(
      (p_answer #>> '{}')::numeric - (p_correct_answer #>> '{}')::numeric
    );
    if v_delta = 0 then
      return public.contest_scoring_points(p_scoring, 'number_exact', 5);
    end if;
    v_tolerance := public.contest_scoring_points(p_scoring, 'number_tolerance', 0);
    if v_delta <= v_tolerance then
      return public.contest_scoring_points(p_scoring, 'number_close', 2);
    end if;
    return 0;
  end if;

  return null;
exception when others then
  return 0;
end;
$$;

comment on function public.contest_generic_points(jsonb, text, jsonb, jsonb) is
  'Points d''une réponse choice/ranking/number. Pendant générique de contest_prediction_points (score), qui reste inchangée.';

revoke all on function public.contest_generic_points(jsonb, text, jsonb, jsonb)
  from public, anon, authenticated;
grant execute on function public.contest_generic_points(jsonb, text, jsonb, jsonb)
  to service_role;

-- ════════════════════════════════════════════════════════════
-- 7. Verrou de règlement — même règle de verrouillage
-- ════════════════════════════════════════════════════════════
-- Corps repris de 20260721150000 ; seule la condition « une échéance est
-- passée » devient générique. Pour le football, locks_at = kickoff_at
-- (backfill) : la valeur retournée est identique.
create or replace function public.contest_is_locked(p_contest_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_org uuid;
  v_default_locks_at timestamptz;
begin
  select c.organization_id, c.default_locks_at
    into v_org, v_default_locks_at
    from public.contests c where c.id = p_contest_id;
  if v_org is null then
    return false;
  end if;
  if not (
    coalesce(auth.role(), '') = 'service_role'
    or public.is_org_member(v_org)
  ) then
    raise exception 'not authorized';
  end if;
  return exists (
    select 1 from public.contest_predictions p
     where p.contest_id = p_contest_id
  ) or exists (
    select 1 from public.contest_matches m
     where m.contest_id = p_contest_id
       and coalesce(m.locks_at, v_default_locks_at, m.kickoff_at)
           <= pg_catalog.now()
  );
end;
$$;

revoke all on function public.contest_is_locked(uuid) from public, anon;
grant execute on function public.contest_is_locked(uuid) to authenticated, service_role;

-- ════════════════════════════════════════════════════════════
-- 8. Prise de pronostic — serveur-autoritaire
-- ════════════════════════════════════════════════════════════
-- Signature INCHANGÉE (5 paramètres) : le code applicatif en production
-- et l'audit ACL (security_acl.test.sql) continuent de la viser. Deux
-- seules évolutions :
--   · la fenêtre de saisie devient effective_locks_at (identique au
--     football grâce au backfill locks_at = kickoff_at) ;
--   · une question non-score est refusée ici (elle passe par
--     submit_contest_answer).
create or replace function public.submit_contest_prediction(
  p_contest_id uuid,
  p_match_id uuid,
  p_player_id uuid,
  p_home_score integer,
  p_away_score integer
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_organization_id uuid;
  v_question_type text;
begin
  if p_home_score is null or p_away_score is null
    or p_home_score not between 0 and 99 or p_away_score not between 0 and 99
  then
    return false;
  end if;

  -- Le verrou sur championnat + question ferme la course « validation
  -- juste avant l'échéance, écriture juste après » et sérialise une
  -- saisie de résultat concurrente.
  select m.organization_id, m.question_type
    into v_organization_id, v_question_type
  from public.contest_matches m
  join public.contests c
    on c.id = m.contest_id and c.organization_id = m.organization_id
  where c.id = p_contest_id
    and m.id = p_match_id
    and c.status = 'active'
    and m.status = 'scheduled'
    and coalesce(m.locks_at, c.default_locks_at, m.kickoff_at)
        > pg_catalog.clock_timestamp()
  for update of c, m;

  if not found then return false; end if;
  if v_question_type <> 'score' then return false; end if;

  perform 1
  from public.contest_players p
  where p.id = p_player_id
    and p.contest_id = p_contest_id
    and p.organization_id = v_organization_id;
  if not found then return false; end if;

  insert into public.contest_predictions (
    contest_id, organization_id, match_id, player_id,
    home_score, away_score, answer, updated_at
  ) values (
    p_contest_id, v_organization_id, p_match_id, p_player_id,
    p_home_score, p_away_score, null, pg_catalog.now()
  )
  on conflict (match_id, player_id) do update
    set home_score = excluded.home_score,
        away_score = excluded.away_score,
        answer = null,
        points = null,
        updated_at = pg_catalog.now();

  return true;
end;
$$;

revoke all on function public.submit_contest_prediction(uuid,uuid,uuid,integer,integer)
  from public, anon, authenticated;
grant execute on function public.submit_contest_prediction(uuid,uuid,uuid,integer,integer)
  to service_role;

-- Pendant générique : même verrou, même règle d'échéance, même
-- idempotence (une réponse remplace la précédente et remet points à
-- null). La FORME de la réponse est validée ICI, contre les options et
-- le ranking_size de la question — pas côté client.
create or replace function public.submit_contest_answer(
  p_contest_id uuid,
  p_match_id uuid,
  p_player_id uuid,
  p_answer jsonb
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_organization_id uuid;
  v_question_type text;
  v_options jsonb;
  v_ranking_size integer;
begin
  select m.organization_id, m.question_type, m.options, m.ranking_size
    into v_organization_id, v_question_type, v_options, v_ranking_size
  from public.contest_matches m
  join public.contests c
    on c.id = m.contest_id and c.organization_id = m.organization_id
  where c.id = p_contest_id
    and m.id = p_match_id
    and c.status = 'active'
    and m.status = 'scheduled'
    and coalesce(m.locks_at, c.default_locks_at, m.kickoff_at)
        > pg_catalog.clock_timestamp()
  for update of c, m;

  if not found then return false; end if;
  -- Une question de score passe par submit_contest_prediction.
  if v_question_type = 'score' then return false; end if;
  if not public.is_valid_contest_answer(
       v_question_type, v_options, v_ranking_size, p_answer
     )
  then
    return false;
  end if;

  perform 1
  from public.contest_players p
  where p.id = p_player_id
    and p.contest_id = p_contest_id
    and p.organization_id = v_organization_id;
  if not found then return false; end if;

  insert into public.contest_predictions (
    contest_id, organization_id, match_id, player_id,
    home_score, away_score, answer, updated_at
  ) values (
    p_contest_id, v_organization_id, p_match_id, p_player_id,
    null, null, p_answer, pg_catalog.now()
  )
  on conflict (match_id, player_id) do update
    set home_score = null,
        away_score = null,
        answer = excluded.answer,
        points = null,
        updated_at = pg_catalog.now();

  return true;
end;
$$;

comment on function public.submit_contest_answer(uuid, uuid, uuid, jsonb) is
  'Enregistrement public d''une réponse choice/ranking/number. Verrou = coalesce(locks_at, default_locks_at, kickoff_at). Service role uniquement (l''identité joueur vient du cookie, vérifiée côté serveur).';

revoke all on function public.submit_contest_answer(uuid, uuid, uuid, jsonb)
  from public, anon, authenticated;
grant execute on function public.submit_contest_answer(uuid, uuid, uuid, jsonb)
  to service_role;

-- ════════════════════════════════════════════════════════════
-- 9. Saisie du résultat
-- ════════════════════════════════════════════════════════════
-- `set_contest_match_result` : corps de 20260720104500 repris à
-- l'IDENTIQUE (gardes « managed match », « match not started », audit,
-- recalcul via contest_prediction_points), signature 7 paramètres
-- conservée. SEUL AJOUT : un score ne peut être saisi que sur une
-- question de type score — inerte sur tout championnat football, où
-- question_type vaut 'score' partout.
create or replace function public.set_contest_match_result(
  p_organization_id uuid,
  p_match_id uuid,
  p_home_score integer,
  p_away_score integer,
  p_finish_type text default 'regular',
  p_home_penalties integer default null,
  p_away_penalties integer default null
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_contest_id uuid;
  v_scoring jsonb;
  v_kickoff_at timestamptz;
  v_previous_status text;
  v_previous_home integer;
  v_previous_away integer;
  v_external_ref text;
  v_question_type text;
begin
  if not (
    coalesce(auth.role(), '') = 'service_role'
    or public.is_org_editor(p_organization_id)
  ) then
    raise exception 'not authorized';
  end if;
  if p_home_score is null or p_away_score is null
    or p_home_score not between 0 and 99 or p_away_score not between 0 and 99
  then
    raise exception 'invalid score';
  end if;
  if p_finish_type not in ('regular', 'extra_time', 'penalties') then
    raise exception 'invalid finish type';
  end if;
  -- La séance de t.a.b. n'a de sens qu'avec finish_type = penalties.
  if p_finish_type <> 'penalties'
    and (p_home_penalties is not null or p_away_penalties is not null)
  then
    raise exception 'invalid penalties';
  end if;
  if p_home_penalties is not null and p_home_penalties not between 0 and 99 then
    raise exception 'invalid penalties';
  end if;
  if p_away_penalties is not null and p_away_penalties not between 0 and 99 then
    raise exception 'invalid penalties';
  end if;

  select c.id, c.scoring, m.kickoff_at, m.status,
         m.home_score, m.away_score, m.external_ref, m.question_type
    into v_contest_id, v_scoring, v_kickoff_at, v_previous_status,
         v_previous_home, v_previous_away, v_external_ref, v_question_type
  from public.contests c
  join public.contest_matches m
    on m.contest_id = c.id and m.organization_id = c.organization_id
  where c.organization_id = p_organization_id and m.id = p_match_id
  for update of c, m;
  if not found then return false; end if;

  -- Un score ne fait autorité que pour une question de type score ; les
  -- autres passent par set_contest_question_result.
  if v_question_type <> 'score' then
    raise exception 'invalid question type';
  end if;

  if coalesce(auth.role(), '') <> 'service_role' and v_external_ref <> '' then
    raise exception 'managed match';
  end if;
  if v_previous_status <> 'finished'
    and v_kickoff_at > pg_catalog.clock_timestamp()
  then
    raise exception 'match not started';
  end if;

  update public.contest_matches
  set home_score = p_home_score,
      away_score = p_away_score,
      finish_type = p_finish_type,
      home_penalties = p_home_penalties,
      away_penalties = p_away_penalties,
      status = 'finished'
  where id = p_match_id
    and contest_id = v_contest_id
    and organization_id = p_organization_id;

  update public.contest_predictions p
  set points = public.contest_prediction_points(
        v_scoring, p_home_score, p_away_score, p.home_score, p.away_score
      ),
      updated_at = pg_catalog.now()
  where p.match_id = p_match_id
    and p.contest_id = v_contest_id
    and p.organization_id = p_organization_id;

  insert into public.audit_logs (organization_id, actor, action, metadata)
  values (
    p_organization_id,
    case when auth.role() = 'service_role'
      then 'system' else coalesce(auth.uid()::text, 'system') end,
    case when v_previous_status = 'finished'
      then 'contest.result.correct' else 'contest.result.set' end,
    pg_catalog.jsonb_build_object(
      'contest_id', v_contest_id,
      'match_id', p_match_id,
      'previous_home', v_previous_home,
      'previous_away', v_previous_away,
      'home_score', p_home_score,
      'away_score', p_away_score,
      'finish_type', p_finish_type,
      'home_penalties', p_home_penalties,
      'away_penalties', p_away_penalties,
      'source', case when auth.role() = 'service_role' then 'provider' else 'merchant' end
    )
  );
  return true;
end;
$$;

revoke all on function public.set_contest_match_result(uuid,uuid,integer,integer,text,integer,integer)
  from public, anon;
grant execute on function public.set_contest_match_result(uuid,uuid,integer,integer,text,integer,integer)
  to authenticated, service_role;

-- Pendant générique : mêmes gardes (autorisation, question gérée par le
-- fournisseur, résultat pas avant l'échéance), même atomicité résultat +
-- recalcul, même journal d'audit.
create or replace function public.set_contest_question_result(
  p_organization_id uuid,
  p_match_id uuid,
  p_correct_answer jsonb
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_contest_id uuid;
  v_scoring jsonb;
  v_locks_at timestamptz;
  v_previous_status text;
  v_previous_answer jsonb;
  v_external_ref text;
  v_question_type text;
  v_options jsonb;
  v_ranking_size integer;
begin
  if not (
    coalesce(auth.role(), '') = 'service_role'
    or public.is_org_editor(p_organization_id)
  ) then
    raise exception 'not authorized';
  end if;

  select c.id, c.scoring,
         coalesce(m.locks_at, c.default_locks_at, m.kickoff_at),
         m.status, m.correct_answer, m.external_ref,
         m.question_type, m.options, m.ranking_size
    into v_contest_id, v_scoring, v_locks_at, v_previous_status,
         v_previous_answer, v_external_ref, v_question_type, v_options,
         v_ranking_size
  from public.contests c
  join public.contest_matches m
    on m.contest_id = c.id and m.organization_id = c.organization_id
  where c.organization_id = p_organization_id and m.id = p_match_id
  for update of c, m;
  if not found then return false; end if;

  -- Une question de score passe par set_contest_match_result.
  if v_question_type = 'score' then
    raise exception 'invalid question type';
  end if;
  if coalesce(auth.role(), '') <> 'service_role' and v_external_ref <> '' then
    raise exception 'managed match';
  end if;
  if not public.is_valid_contest_answer(
       v_question_type, v_options, v_ranking_size, p_correct_answer
     )
  then
    raise exception 'invalid answer';
  end if;
  if v_previous_status <> 'finished'
    and v_locks_at > pg_catalog.clock_timestamp()
  then
    raise exception 'question not locked';
  end if;

  update public.contest_matches
  set correct_answer = p_correct_answer,
      status = 'finished'
  where id = p_match_id
    and contest_id = v_contest_id
    and organization_id = p_organization_id;

  update public.contest_predictions p
  set points = public.contest_generic_points(
        v_scoring, v_question_type, p_correct_answer, p.answer
      ),
      updated_at = pg_catalog.now()
  where p.match_id = p_match_id
    and p.contest_id = v_contest_id
    and p.organization_id = p_organization_id;

  insert into public.audit_logs (organization_id, actor, action, metadata)
  values (
    p_organization_id,
    case when auth.role() = 'service_role'
      then 'system' else coalesce(auth.uid()::text, 'system') end,
    case when v_previous_status = 'finished'
      then 'contest.result.correct' else 'contest.result.set' end,
    pg_catalog.jsonb_build_object(
      'contest_id', v_contest_id,
      'match_id', p_match_id,
      'question_type', v_question_type,
      'previous_answer', v_previous_answer,
      'correct_answer', p_correct_answer,
      'source', case when auth.role() = 'service_role' then 'provider' else 'merchant' end
    )
  );
  return true;
end;
$$;

comment on function public.set_contest_question_result(uuid, uuid, jsonb) is
  'Résultat officiel d''une question choice/ranking/number + recalcul atomique des points. Pendant générique de set_contest_match_result.';

revoke all on function public.set_contest_question_result(uuid, uuid, jsonb)
  from public, anon;
grant execute on function public.set_contest_question_result(uuid, uuid, jsonb)
  to authenticated, service_role;

-- ════════════════════════════════════════════════════════════
-- 10. Barème : mise à jour + recalcul
-- ════════════════════════════════════════════════════════════
-- `update_contest_scoring` : corps de 20260721150000 repris, signature
-- 6 paramètres conservée. DEUX évolutions, toutes deux neutres pour un
-- championnat football :
--   · le document n'est plus REMPLACÉ mais FUSIONNÉ — sans cela, régler
--     exact/diff/winner effacerait les paliers génériques. Sur un
--     championnat foot (scoring = exactement ces trois clés), la fusion
--     produit le même jsonb qu'avant ;
--   · le recalcul des questions génériques s'ajoute en second UPDATE ;
--     le premier (score) est repris mot pour mot.
create or replace function public.update_contest_scoring(
  p_organization_id uuid,
  p_contest_id uuid,
  p_exact integer,
  p_diff integer,
  p_winner integer,
  p_reason text default null
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_previous_scoring jsonb;
  v_finalized timestamptz;
  v_scoring jsonb;
  v_locked boolean;
begin
  if not public.is_org_editor(p_organization_id) then
    raise exception 'not authorized';
  end if;
  if p_exact is null or p_diff is null or p_winner is null
    or p_exact not between 0 and 100
    or p_diff not between 0 and 100
    or p_winner not between 0 and 100
  then
    raise exception 'invalid scoring';
  end if;
  -- Paliers strictement décroissants : le départage par « nb d'exacts »
  -- puis « nb de bons écarts » exige des paliers distincts.
  if not (p_exact > p_diff and p_diff > p_winner) then
    raise exception 'scoring tiers must be strictly decreasing';
  end if;

  select c.scoring, c.finalized_at into v_previous_scoring, v_finalized
  from public.contests c
  where c.id = p_contest_id and c.organization_id = p_organization_id
  for update;
  if not found then return false; end if;

  -- Fusion : les paliers génériques éventuels sont préservés.
  v_scoring := coalesce(v_previous_scoring, '{}'::jsonb)
    || pg_catalog.jsonb_build_object(
         'exact', p_exact,
         'diff', p_diff,
         'winner', p_winner
       );

  if v_previous_scoring is not distinct from v_scoring then
    return true; -- aucun changement
  end if;
  if v_finalized is not null then
    raise exception 'contest finalized';
  end if;
  v_locked := public.contest_is_locked(p_contest_id);
  if v_locked and (p_reason is null or pg_catalog.char_length(pg_catalog.btrim(p_reason)) < 10) then
    raise exception 'locked: reason required';
  end if;

  update public.contests
  set scoring = v_scoring
  where id = p_contest_id and organization_id = p_organization_id;

  update public.contest_predictions p
  set points = public.contest_prediction_points(
        v_scoring, m.home_score, m.away_score, p.home_score, p.away_score
      ),
      updated_at = pg_catalog.now()
  from public.contest_matches m
  where p.contest_id = p_contest_id
    and p.organization_id = p_organization_id
    and m.id = p.match_id
    and m.contest_id = p.contest_id
    and m.organization_id = p.organization_id
    and m.question_type = 'score'
    and m.status = 'finished'
    and m.home_score is not null
    and m.away_score is not null;

  update public.contest_predictions p
  set points = public.contest_generic_points(
        v_scoring, m.question_type, m.correct_answer, p.answer
      ),
      updated_at = pg_catalog.now()
  from public.contest_matches m
  where p.contest_id = p_contest_id
    and p.organization_id = p_organization_id
    and m.id = p.match_id
    and m.contest_id = p.contest_id
    and m.organization_id = p.organization_id
    and m.question_type <> 'score'
    and m.status = 'finished'
    and m.correct_answer is not null;

  insert into public.audit_logs (organization_id, actor, action, metadata)
  values (
    p_organization_id,
    coalesce(auth.uid()::text, auth.role(), 'system'),
    'contest.scoring.update',
    pg_catalog.jsonb_build_object(
      'contest_id', p_contest_id,
      'previous', v_previous_scoring,
      'next', v_scoring,
      'locked', v_locked,
      'reason', case when v_locked then pg_catalog.btrim(p_reason) end
    )
  );
  return true;
end;
$$;

revoke all on function public.update_contest_scoring(uuid,uuid,integer,integer,integer,text)
  from public, anon;
grant execute on function public.update_contest_scoring(uuid,uuid,integer,integer,integer,text)
  to authenticated, service_role;

-- Paliers génériques : mêmes règles de gel et d'audit que le barème
-- score et que les récompenses (motif obligatoire une fois verrouillé,
-- interdit après clôture). Fusion partielle : seules les clés fournies
-- sont écrites, exact/diff/winner restent réservés à
-- update_contest_scoring.
create or replace function public.update_contest_generic_scoring(
  p_organization_id uuid,
  p_contest_id uuid,
  p_values jsonb,
  p_reason text default null
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_previous jsonb;
  v_scoring jsonb;
  v_finalized timestamptz;
  v_locked boolean;
  v_key text;
  v_count integer;
begin
  if not public.is_org_editor(p_organization_id) then
    raise exception 'not authorized';
  end if;
  if p_values is null or pg_catalog.jsonb_typeof(p_values) <> 'object' then
    raise exception 'invalid scoring';
  end if;

  select pg_catalog.count(*)::integer into v_count
    from pg_catalog.jsonb_object_keys(p_values);
  if v_count = 0 or v_count > 6 then
    raise exception 'invalid scoring';
  end if;

  for v_key in select * from pg_catalog.jsonb_object_keys(p_values)
  loop
    if v_key not in ('choice', 'ranking_exact', 'ranking_partial',
                     'number_exact', 'number_close', 'number_tolerance')
    then
      raise exception 'invalid scoring key';
    end if;
  end loop;

  select c.scoring, c.finalized_at into v_previous, v_finalized
  from public.contests c
  where c.id = p_contest_id and c.organization_id = p_organization_id
  for update;
  if not found then return false; end if;

  v_scoring := coalesce(v_previous, '{}'::jsonb) || p_values;
  if not public.is_valid_contest_scoring(v_scoring) then
    raise exception 'invalid scoring';
  end if;

  if v_previous is not distinct from v_scoring then
    return true;
  end if;
  if v_finalized is not null then
    raise exception 'contest finalized';
  end if;
  v_locked := public.contest_is_locked(p_contest_id);
  if v_locked and (p_reason is null or pg_catalog.char_length(pg_catalog.btrim(p_reason)) < 10) then
    raise exception 'locked: reason required';
  end if;

  update public.contests
  set scoring = v_scoring
  where id = p_contest_id and organization_id = p_organization_id;

  update public.contest_predictions p
  set points = public.contest_generic_points(
        v_scoring, m.question_type, m.correct_answer, p.answer
      ),
      updated_at = pg_catalog.now()
  from public.contest_matches m
  where p.contest_id = p_contest_id
    and p.organization_id = p_organization_id
    and m.id = p.match_id
    and m.contest_id = p.contest_id
    and m.organization_id = p.organization_id
    and m.question_type <> 'score'
    and m.status = 'finished'
    and m.correct_answer is not null;

  insert into public.audit_logs (organization_id, actor, action, metadata)
  values (
    p_organization_id,
    coalesce(auth.uid()::text, auth.role(), 'system'),
    'contest.scoring.generic.update',
    pg_catalog.jsonb_build_object(
      'contest_id', p_contest_id,
      'previous', v_previous,
      'next', v_scoring,
      'locked', v_locked,
      'reason', case when v_locked then pg_catalog.btrim(p_reason) end
    )
  );
  return true;
end;
$$;

comment on function public.update_contest_generic_scoring(uuid, uuid, jsonb, text) is
  'Paliers de barème des types génériques (choice, ranking_*, number_*). exact/diff/winner restent du ressort de update_contest_scoring.';

revoke all on function public.update_contest_generic_scoring(uuid, uuid, jsonb, text)
  from public, anon;
grant execute on function public.update_contest_generic_scoring(uuid, uuid, jsonb, text)
  to authenticated, service_role;

-- ════════════════════════════════════════════════════════════
-- Note de conception — `exact_count` / `diff_count`
-- ════════════════════════════════════════════════════════════
-- `contest_leaderboard`, `contest_player_rank` et `finalize_contest` ne
-- sont volontairement PAS recréées : elles somment
-- `contest_predictions.points`, déjà agnostique du type de question, et
-- toute réécriture de ces 250 lignes serait un risque pur de régression
-- sur le classement en production.
--
-- Conséquence assumée : leurs compteurs de départage `exact_count` /
-- `diff_count` comptent les pronostics PAYÉS AU PALIER `exact` / `diff`
-- du barème, quel que soit le type de question. Sur un championnat
-- football (100 % de questions score) le comportement est strictement
-- inchangé. Sur un championnat MIXTE, une réponse générique dont le
-- palier vaut le même nombre de points qu'`exact` entrera dans
-- `exact_count` — sans effet sur les points, seulement sur l'ordre des
-- ex æquo. Affiner ce départage par type est un chantier de vague 2.
