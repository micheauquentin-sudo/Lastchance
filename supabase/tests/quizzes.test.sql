-- ============================================================
-- Créateur de quiz — comportement réel des RPC sur base migrée vierge
-- (fixtures locales) :
--   1. join_quiz : idempotent, PII facultative conservée, addon coupé / slug
--      inconnu → 'unavailable'.
--   2. CHRONOMÈTRE INFORGEABLE : submit_quiz_answer n'a AUCUN paramètre de
--      temps (signature auditée) ; start_quiz_question ne réinitialise jamais
--      started_at ; le trigger de gel refuse tout déplacement du chronomètre et
--      toute réécriture d'une réponse.
--   3. NON-FUITE : ni start_quiz_question ni quiz_public_state n'exposent
--      correct_answer d'une question NON répondue par CE joueur ; aucune
--      réponse d'un AUTRE joueur n'est visible.
--   4. ÉVALUATION SERVEUR des 4 types moteur × 7 modèles d'UI : choix
--      multiple, vrai/faux, image mystère, estimation (dans / hors tolérance),
--      chronométrée, classement (ordre exact / faux), pronostic libre
--      (normalisation accents + casse).
--   5. UNE SEULE RÉPONSE par question : 2e refusée ; forme invalide refusée
--      SANS consommer la question ; dépassement de time_limit_seconds refusé
--      (hors barème) et question consommée.
--   6. LES 5 MODES : threshold (atteint / non atteint), instant, none,
--      draw (IDEMPOTENT — deux appels n'émettent qu'une fois), ranking
--      (score + rapidité, ex æquo partagés).
--   7. STOCK FINI : out_of_stock propre, aucune sur-émission.
--   8. Tour de roue offert : grant à usage unique (spun → already_consumed).
--   9. Caisse : redeem_quiz_reward — cross-org = 0 ligne, double retrait
--      refusé, audit journalisé.
--  10. Purge RGPD : PII neutralisée, registre des lots conservé.
--  11. ACL des RPC du parcours joueur.
-- ============================================================
begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

select set_config('request.jwt.claims', '{"role":"service_role"}', true);

-- ── Fixtures ─────────────────────────────────────────────────
insert into public.organizations (id, name, slug, addon_quiz, data_retention_months)
values ('fa000000-0000-4000-8000-000000000001', 'Test Quiz', 'tap-quiz-org', true, 6);
-- Seconde organisation : preuve du cloisonnement de la caisse.
insert into public.organizations (id, name, slug, addon_quiz)
values ('fa000000-0000-4000-8000-0000000000ff', 'Autre Org', 'tap-quiz-org-2', true);
-- Troisième organisation : addon COUPÉ (preuve du verrou d'addon).
insert into public.organizations (id, name, slug, addon_quiz)
values ('fa000000-0000-4000-8000-0000000000fe', 'Sans Addon', 'tap-quiz-org-3', false);

-- Roue cible du tour offert : un lot gagnant (poids 100) et un perdant
-- (poids 0, jamais tiré) → tirage déterministe.
insert into public.campaigns (id, organization_id, name, status)
values ('fa000000-0000-4000-8000-000000000005',
        'fa000000-0000-4000-8000-000000000001', 'Campagne roue quiz', 'active');
insert into public.wheels (id, organization_id, campaign_id, name, play_limit)
values ('fa000000-0000-4000-8000-000000000006',
        'fa000000-0000-4000-8000-000000000001',
        'fa000000-0000-4000-8000-000000000005', 'Roue quiz', 'unlimited');
insert into public.prizes (id, organization_id, wheel_id, label, weight, is_losing, position, stock)
values
  ('fa000000-0000-4000-8000-000000000007', 'fa000000-0000-4000-8000-000000000001',
   'fa000000-0000-4000-8000-000000000006', 'Lot quiz', 100, false, 0, 100),
  ('fa000000-0000-4000-8000-000000000008', 'fa000000-0000-4000-8000-000000000001',
   'fa000000-0000-4000-8000-000000000006', 'Perdu (jamais tiré)', 0, true, 1, null);

-- ══ Quiz 1 — mode threshold (3 bonnes réponses), stock FINI = 1 ══
-- Les 7 modèles d'UI du besoin produit sur les 4 types moteur.
insert into public.quizzes (
  id, organization_id, name, theme, status, public_slug, intro_text,
  reward_mode, reward_threshold, reward_label, reward_stock
) values (
  'fa000000-0000-4000-8000-000000000010', 'fa000000-0000-4000-8000-000000000001',
  'Quiz du restaurant', 'gourmand', 'active', 'tap-quiz',
  'Sept questions sur notre cuisine', 'threshold', 3, 'Café offert', 1
);
insert into public.quiz_questions (
  id, quiz_id, organization_id, position, prompt, question_type, preset,
  options, correct_answer, image_url, time_limit_seconds, points, tolerance, ranking_size
) values
  -- 1. Choix multiple.
  ('fa000000-0000-4000-8000-000000000011', 'fa000000-0000-4000-8000-000000000010',
   'fa000000-0000-4000-8000-000000000001', 0, 'Quel est notre plat signature ?',
   'choice', 'multiple_choice',
   '[{"id":"a","label":"Option A"},{"id":"b","label":"Option B"},{"id":"c","label":"Option C"}]'::jsonb,
   '"b"'::jsonb, null, null, 1, null, null),
  -- 2. Vrai/faux = choix à DEUX options (aucun type dédié).
  ('fa000000-0000-4000-8000-000000000012', 'fa000000-0000-4000-8000-000000000010',
   'fa000000-0000-4000-8000-000000000001', 1, 'Notre pain est fait maison.',
   'choice', 'true_false',
   '[{"id":"vrai","label":"Vrai"},{"id":"faux","label":"Faux"}]'::jsonb,
   '"vrai"'::jsonb, null, null, 1, null, null),
  -- 3. Image mystère = un MÉDIA sur un choix (aucun type dédié).
  ('fa000000-0000-4000-8000-000000000013', 'fa000000-0000-4000-8000-000000000010',
   'fa000000-0000-4000-8000-000000000001', 2, 'Quel animal se cache ici ?',
   'choice', 'mystery_image',
   '[{"id":"chat","label":"Un chat"},{"id":"chien","label":"Un chien"}]'::jsonb,
   '"chat"'::jsonb, 'https://example.test/mystere.webp', null, 1, null, null),
  -- 4. Estimation numérique avec tolérance.
  ('fa000000-0000-4000-8000-000000000014', 'fa000000-0000-4000-8000-000000000010',
   'fa000000-0000-4000-8000-000000000001', 3, 'Combien de couverts par service ?',
   'number', 'estimate', null, '100'::jsonb, null, null, 1, 5, null),
  -- 5. Question CHRONOMÉTRÉE : le chronomètre est une dimension transversale
  --    posée sur un choix, pas un type de question.
  ('fa000000-0000-4000-8000-000000000015', 'fa000000-0000-4000-8000-000000000010',
   'fa000000-0000-4000-8000-000000000001', 4, 'Vite : servons-nous du poisson ?',
   'choice', 'timed',
   '[{"id":"oui","label":"Oui"},{"id":"non","label":"Non"}]'::jsonb,
   '"oui"'::jsonb, null, 5, 1, null, null),
  -- 6. Classement de réponses.
  ('fa000000-0000-4000-8000-000000000016', 'fa000000-0000-4000-8000-000000000010',
   'fa000000-0000-4000-8000-000000000001', 5, 'Classez nos desserts.',
   'ranking', 'ranking',
   '[{"id":"a","label":"Premier"},{"id":"b","label":"Deuxième"},{"id":"c","label":"Troisième"}]'::jsonb,
   '["a","b","c"]'::jsonb, null, null, 1, null, 3),
  -- 7. Pronostic libre (variantes acceptées).
  ('fa000000-0000-4000-8000-000000000017', 'fa000000-0000-4000-8000-000000000010',
   'fa000000-0000-4000-8000-000000000001', 6, 'De quel pays vient notre huile ?',
   'text', 'free_prediction', null, '["Italie","l''Italie"]'::jsonb,
   null, null, 1, null, null);

-- ══ Quiz 2 — mode draw (tirage parmi les 2 meilleurs), stock 1 ══
insert into public.quizzes (
  id, organization_id, name, status, public_slug,
  reward_mode, draw_top_n, reward_label, reward_stock
) values (
  'fa000000-0000-4000-8000-000000000020', 'fa000000-0000-4000-8000-000000000001',
  'Quiz du salon', 'active', 'tap-quiz-draw', 'draw', 2, 'Panier garni', 1
);
insert into public.quiz_questions (
  id, quiz_id, organization_id, position, prompt, question_type, preset,
  options, correct_answer, points
) values (
  'fa000000-0000-4000-8000-000000000021', 'fa000000-0000-4000-8000-000000000020',
  'fa000000-0000-4000-8000-000000000001', 0, 'Quel exposant est le nôtre ?',
  'choice', 'multiple_choice',
  '[{"id":"a","label":"Stand A"},{"id":"b","label":"Stand B"}]'::jsonb,
  '"a"'::jsonb, 5
);

-- ══ Quiz 3 — mode ranking (score puis rapidité), stock 2 ══
insert into public.quizzes (
  id, organization_id, name, status, public_slug,
  reward_mode, reward_label, reward_stock
) values (
  'fa000000-0000-4000-8000-000000000030', 'fa000000-0000-4000-8000-000000000001',
  'Quiz du musée', 'active', 'tap-quiz-rank', 'ranking', 'Visite guidée', 2
);
-- Participations FIGÉES directement : c'est la seule façon de fabriquer un ex
-- æquo EXACT (même score ET même temps total) — les deux agrégats étant
-- calculés par le serveur, aucune RPC ne permet de les imposer.
insert into public.quiz_players (
  id, quiz_id, organization_id, token_hash, first_name,
  score, correct_count, total_elapsed_ms, finished_at, created_at
) values
  ('fa000000-0000-4000-8000-000000000301', 'fa000000-0000-4000-8000-000000000030',
   'fa000000-0000-4000-8000-000000000001', repeat('1', 64), 'Gaelle',
   10, 2, 1000, now(), now() - interval '3 minutes'),
  ('fa000000-0000-4000-8000-000000000302', 'fa000000-0000-4000-8000-000000000030',
   'fa000000-0000-4000-8000-000000000001', repeat('2', 64), 'Hugo',
   10, 2, 2000, now(), now() - interval '2 minutes'),
  -- Ex æquo strict avec Hugo (même score, même temps) → même rang.
  ('fa000000-0000-4000-8000-000000000303', 'fa000000-0000-4000-8000-000000000030',
   'fa000000-0000-4000-8000-000000000001', repeat('3', 64), 'Jade',
   10, 2, 2000, now(), now() - interval '1 minute'),
  ('fa000000-0000-4000-8000-000000000304', 'fa000000-0000-4000-8000-000000000030',
   'fa000000-0000-4000-8000-000000000001', repeat('4', 64), 'Ines',
   5, 1, 500, now(), now()),
  -- NON terminée : hors classement et hors tirage.
  ('fa000000-0000-4000-8000-000000000305', 'fa000000-0000-4000-8000-000000000030',
   'fa000000-0000-4000-8000-000000000001', repeat('5', 64), 'Karim',
   10, 2, 100, null, now());

-- ══ Quiz 4 — mode instant, stock 5 ══
insert into public.quizzes (
  id, organization_id, name, status, public_slug,
  reward_mode, reward_label, reward_stock
) values (
  'fa000000-0000-4000-8000-000000000040', 'fa000000-0000-4000-8000-000000000001',
  'Quiz de la cave', 'active', 'tap-quiz-instant', 'instant', 'Verre offert', 5
);
insert into public.quiz_questions (
  id, quiz_id, organization_id, position, prompt, question_type, preset,
  options, correct_answer
) values (
  'fa000000-0000-4000-8000-000000000041', 'fa000000-0000-4000-8000-000000000040',
  'fa000000-0000-4000-8000-000000000001', 0, 'Ce vin est-il un rouge ?',
  'choice', 'true_false',
  '[{"id":"vrai","label":"Vrai"},{"id":"faux","label":"Faux"}]'::jsonb,
  '"vrai"'::jsonb
);

-- ══ Quiz 5 — mode none (participation gratuite) ══
insert into public.quizzes (
  id, organization_id, name, status, public_slug, reward_mode, reward_stock
) values (
  'fa000000-0000-4000-8000-000000000050', 'fa000000-0000-4000-8000-000000000001',
  'Quiz sans gain', 'active', 'tap-quiz-none', 'none', 0
);
insert into public.quiz_questions (
  id, quiz_id, organization_id, position, prompt, question_type, preset,
  options, correct_answer
) values (
  'fa000000-0000-4000-8000-000000000051', 'fa000000-0000-4000-8000-000000000050',
  'fa000000-0000-4000-8000-000000000001', 0, 'Pour le plaisir : 2 + 2 ?',
  'number', 'estimate', null, '4'::jsonb
);

-- ══ Quiz 6 — mode instant avec TOUR DE ROUE OFFERT ══
insert into public.quizzes (
  id, organization_id, name, status, public_slug,
  reward_mode, reward_label, reward_stock, target_wheel_id
) values (
  'fa000000-0000-4000-8000-000000000060', 'fa000000-0000-4000-8000-000000000001',
  'Quiz tour de roue', 'active', 'tap-quiz-wheel', 'instant', 'Un tour de roue', 1,
  'fa000000-0000-4000-8000-000000000006'
);
insert into public.quiz_questions (
  id, quiz_id, organization_id, position, prompt, question_type, preset,
  options, correct_answer
) values (
  'fa000000-0000-4000-8000-000000000061', 'fa000000-0000-4000-8000-000000000060',
  'fa000000-0000-4000-8000-000000000001', 0, 'Prêt à jouer ?',
  'choice', 'true_false',
  '[{"id":"vrai","label":"Vrai"},{"id":"faux","label":"Faux"}]'::jsonb,
  '"vrai"'::jsonb
);

-- ══ Quiz 7 — organisation SANS addon ══
insert into public.quizzes (
  id, organization_id, name, status, public_slug, reward_mode, reward_stock
) values (
  'fa000000-0000-4000-8000-000000000070', 'fa000000-0000-4000-8000-0000000000fe',
  'Quiz sans addon', 'active', 'tap-quiz-noaddon', 'none', 0
);

create temporary table tap_r (r jsonb) on commit drop;

-- ══ 0. Verrous de schéma (modes / stock / tirage) ════════════
select ok(exists (select 1 from pg_constraint
             where conrelid = 'public.quizzes'::regclass
               and conname = 'quizzes_reward_bounds_check'),
  'CHECK structurel claimed <= stock présent (anti sur-émission)');
select ok(exists (select 1 from pg_constraint
             where conrelid = 'public.quiz_rewards'::regclass
               and contype = 'u'
               and pg_get_constraintdef(oid) ilike '%(quiz_id, player_id)%'),
  'un seul lot par (quiz, joueur) — unicité structurelle');
select ok(exists (select 1 from pg_constraint
             where conrelid = 'public.quiz_answers'::regclass
               and contype = 'u'
               and pg_get_constraintdef(oid) ilike '%(player_id, question_id)%'),
  'une seule réponse par (joueur, question) — unicité structurelle');
-- Le mode « sans gain » ne peut pas provisionner de lot.
select throws_ok(
  $$update public.quizzes set reward_stock = 3
      where id = 'fa000000-0000-4000-8000-000000000050'$$,
  '23514'::text, null::text, 'mode none : impossible de provisionner du stock');
-- Le tour de roue offert est refusé sur un mode différé.
select throws_ok(
  $$update public.quizzes
       set target_wheel_id = 'fa000000-0000-4000-8000-000000000006'
     where id = 'fa000000-0000-4000-8000-000000000020'$$,
  '23514'::text, null::text, 'tour de roue interdit sur un mode différé (draw)');
-- Une question sans vérité est impossible : le corrigé est connu dès la
-- création.
select throws_ok(
  $$insert into public.quiz_questions
      (quiz_id, organization_id, position, prompt, question_type, correct_answer)
    values ('fa000000-0000-4000-8000-000000000010',
            'fa000000-0000-4000-8000-000000000001', 99, 'Sans corrigé',
            'text', null)$$,
  '23502'::text, null::text,
  'correct_answer est obligatoire (vérité connue dès la création)');

-- ══ 1. join_quiz : addon / slug / idempotence / PII ══════════
select is((public.join_quiz('slug-inconnu', repeat('a', 64)))->>'state',
  'unavailable', 'join refusé pour un slug inconnu');
select is((public.join_quiz('tap-quiz-noaddon', repeat('0', 64)))->>'state',
  'unavailable', 'join refusé quand l''addon est coupé');

insert into tap_r select public.join_quiz(
  'tap-quiz', repeat('a', 64), '  Alice  ', 'Alice@Test.Local', 'renard', true);
select is((select r->>'state' from tap_r), 'joined', 'join valide → joined');
select is((select r->'quiz'->>'question_count' from tap_r), '7',
  'join renvoie le nombre de questions');
delete from tap_r;
select is((select first_name from public.quiz_players
             where quiz_id = 'fa000000-0000-4000-8000-000000000010'
               and token_hash = repeat('a', 64)),
  'Alice', 'prénom rogné et stocké');
select is((select email from public.quiz_players
             where quiz_id = 'fa000000-0000-4000-8000-000000000010'
               and token_hash = repeat('a', 64)),
  'alice@test.local', 'email normalisé (minuscules, trim)');

-- Idempotence : re-join sans PII ne crée pas de doublon ni n'efface l'existant.
select public.join_quiz('tap-quiz', repeat('a', 64));
select is((select count(*)::int from public.quiz_players
             where quiz_id = 'fa000000-0000-4000-8000-000000000010'
               and token_hash = repeat('a', 64)),
  1, 're-join ne crée pas de doublon (idempotent)');
select is((select email from public.quiz_players
             where quiz_id = 'fa000000-0000-4000-8000-000000000010'
               and token_hash = repeat('a', 64)),
  'alice@test.local', 're-join sans email préserve l''email déjà donné');

-- ══ 2. CHRONOMÈTRE INFORGEABLE ═══════════════════════════════
-- Aucun paramètre de temps dans la signature : le client ne PEUT pas mentir.
select is(
  pg_get_function_arguments('public.submit_quiz_answer(uuid,text,uuid,jsonb)'::regprocedure),
  'p_quiz_id uuid, p_player_token_hash text, p_question_id uuid, p_answer jsonb',
  'submit_quiz_answer n''accepte AUCUN paramètre de temps');
select is(
  pg_get_function_arguments('public.start_quiz_question(uuid,text,uuid)'::regprocedure),
  'p_quiz_id uuid, p_player_token_hash text, p_question_id uuid',
  'start_quiz_question n''accepte AUCUN paramètre de temps');

-- start pose started_at ; un second start NE LE RÉINITIALISE PAS.
insert into tap_r select public.start_quiz_question(
  'fa000000-0000-4000-8000-000000000010', repeat('a', 64),
  'fa000000-0000-4000-8000-000000000011');
select is((select r->>'state' from tap_r), 'started', 'question présentée');
-- NON-FUITE : la vérité n'est pas dans la charge utile de présentation.
select ok((select not (r ? 'correct_answer') from tap_r),
  'start_quiz_question ne renvoie pas correct_answer (racine)');
select ok((select not (r->'question' ? 'correct_answer') from tap_r),
  'start_quiz_question ne renvoie pas correct_answer (question)');
delete from tap_r;

create temporary table tap_clock (t timestamptz) on commit drop;
insert into tap_clock select started_at from public.quiz_answers
 where question_id = 'fa000000-0000-4000-8000-000000000011'
   and player_id = (select id from public.quiz_players
     where quiz_id = 'fa000000-0000-4000-8000-000000000010'
       and token_hash = repeat('a', 64));
select public.start_quiz_question(
  'fa000000-0000-4000-8000-000000000010', repeat('a', 64),
  'fa000000-0000-4000-8000-000000000011');
select is((select started_at from public.quiz_answers
             where question_id = 'fa000000-0000-4000-8000-000000000011'
               and player_id = (select id from public.quiz_players
                 where quiz_id = 'fa000000-0000-4000-8000-000000000010'
                   and token_hash = repeat('a', 64))),
  (select t from tap_clock),
  'un second start NE remet PAS le chronomètre à zéro');

-- Le gel interdit tout déplacement du chronomètre, service_role compris.
select throws_ok(
  $$update public.quiz_answers set started_at = now() - interval '1 hour'
      where question_id = 'fa000000-0000-4000-8000-000000000011'$$,
  'P0001', 'quiz answer clock is immutable',
  'started_at est immuable (chronomètre inforgeable)');

-- ══ 5a. Forme invalide refusée SANS consommer la question ════
select is((public.submit_quiz_answer(
    'fa000000-0000-4000-8000-000000000010', repeat('a', 64),
    'fa000000-0000-4000-8000-000000000011', '"zzz"'::jsonb))->>'state',
  'invalid_answer', 'option inexistante → invalid_answer');
select is((select answered_at from public.quiz_answers
             where question_id = 'fa000000-0000-4000-8000-000000000011'
               and player_id = (select id from public.quiz_players
                 where quiz_id = 'fa000000-0000-4000-8000-000000000010'
                   and token_hash = repeat('a', 64))),
  null, 'une forme invalide ne consomme pas la question');

-- submit sans start : le chronomètre n'existe pas, on refuse.
select is((public.submit_quiz_answer(
    'fa000000-0000-4000-8000-000000000010', repeat('a', 64),
    'fa000000-0000-4000-8000-000000000012', '"vrai"'::jsonb))->>'state',
  'not_started', 'submit sans start → not_started (aucune référence de temps)');

-- ══ 4. ÉVALUATION SERVEUR des 4 types × 7 modèles ═══════════
-- 1. Choix multiple.
insert into tap_r select public.submit_quiz_answer(
  'fa000000-0000-4000-8000-000000000010', repeat('a', 64),
  'fa000000-0000-4000-8000-000000000011', '"b"'::jsonb);
select is((select r->>'state' from tap_r), 'recorded', 'choix multiple enregistré');
select is((select (r->>'is_correct')::boolean from tap_r), true,
  'choix multiple : bonne option évaluée juste (serveur)');
select ok((select (r->>'elapsed_ms')::int >= 0 from tap_r),
  'elapsed_ms figé côté serveur');
delete from tap_r;

-- 2. Vrai/faux (choix à deux options).
select public.start_quiz_question('fa000000-0000-4000-8000-000000000010',
  repeat('a', 64), 'fa000000-0000-4000-8000-000000000012');
select is((public.submit_quiz_answer(
    'fa000000-0000-4000-8000-000000000010', repeat('a', 64),
    'fa000000-0000-4000-8000-000000000012', '"vrai"'::jsonb))->>'is_correct',
  'true', 'vrai/faux évalué juste');

-- 3. Image mystère (média + choix).
select public.start_quiz_question('fa000000-0000-4000-8000-000000000010',
  repeat('a', 64), 'fa000000-0000-4000-8000-000000000013');
select is((public.submit_quiz_answer(
    'fa000000-0000-4000-8000-000000000010', repeat('a', 64),
    'fa000000-0000-4000-8000-000000000013', '"chat"'::jsonb))->>'is_correct',
  'true', 'image mystère évaluée juste');

-- 4. Estimation numérique DANS la tolérance (100 ± 5, réponse 103).
select public.start_quiz_question('fa000000-0000-4000-8000-000000000010',
  repeat('a', 64), 'fa000000-0000-4000-8000-000000000014');
select is((public.submit_quiz_answer(
    'fa000000-0000-4000-8000-000000000010', repeat('a', 64),
    'fa000000-0000-4000-8000-000000000014', '103'::jsonb))->>'is_correct',
  'true', 'estimation dans la tolérance → juste');

-- 5. Question chronométrée, répondue DANS la fenêtre.
select public.start_quiz_question('fa000000-0000-4000-8000-000000000010',
  repeat('a', 64), 'fa000000-0000-4000-8000-000000000015');
select is((public.submit_quiz_answer(
    'fa000000-0000-4000-8000-000000000010', repeat('a', 64),
    'fa000000-0000-4000-8000-000000000015', '"oui"'::jsonb))->>'is_correct',
  'true', 'question chronométrée : réponse dans les temps → juste');

-- 6. Classement : ordre EXACT.
select public.start_quiz_question('fa000000-0000-4000-8000-000000000010',
  repeat('a', 64), 'fa000000-0000-4000-8000-000000000016');
select is((public.submit_quiz_answer(
    'fa000000-0000-4000-8000-000000000010', repeat('a', 64),
    'fa000000-0000-4000-8000-000000000016', '["a","b","c"]'::jsonb))->>'is_correct',
  'true', 'classement dans le bon ordre → juste');

-- 7. Pronostic libre : normalisation (casse, espaces, apostrophe, accents).
select public.start_quiz_question('fa000000-0000-4000-8000-000000000010',
  repeat('a', 64), 'fa000000-0000-4000-8000-000000000017');
insert into tap_r select public.submit_quiz_answer(
  'fa000000-0000-4000-8000-000000000010', repeat('a', 64),
  'fa000000-0000-4000-8000-000000000017', '"  L''ITALIE "'::jsonb);
select is((select r->>'is_correct' from tap_r), 'true',
  'pronostic libre : variante acceptée malgré casse / espaces / apostrophe');
-- La vérité est due au joueur APRÈS sa réponse (et à lui seul).
select ok((select r ? 'correct_answer' from tap_r),
  'la vérité est révélée au joueur après SA réponse');
delete from tap_r;

select is((select score from public.quiz_players
             where quiz_id = 'fa000000-0000-4000-8000-000000000010'
               and token_hash = repeat('a', 64)),
  7, 'score cumulé serveur = 7 bonnes réponses');
select is((select correct_count from public.quiz_players
             where quiz_id = 'fa000000-0000-4000-8000-000000000010'
               and token_hash = repeat('a', 64)),
  7, 'correct_count cumulé serveur');

-- ══ 5b. Une seule réponse par question ══════════════════════
insert into tap_r select public.submit_quiz_answer(
  'fa000000-0000-4000-8000-000000000010', repeat('a', 64),
  'fa000000-0000-4000-8000-000000000011', '"a"'::jsonb);
select is((select r->>'state' from tap_r), 'already_answered',
  '2e réponse à la même question refusée (pas de nouvelle tentative)');
delete from tap_r;
select is((select count(*)::int from public.quiz_answers
             where question_id = 'fa000000-0000-4000-8000-000000000011'
               and player_id = (select id from public.quiz_players
                 where quiz_id = 'fa000000-0000-4000-8000-000000000010'
                   and token_hash = repeat('a', 64))),
  1, 'une seule ligne de réponse par (joueur, question)');
-- Le gel structurel : même le service_role ne peut pas réécrire une réponse.
select throws_ok(
  $$update public.quiz_answers set is_correct = true, points_awarded = 99
      where question_id = 'fa000000-0000-4000-8000-000000000011'$$,
  'P0001', 'quiz answer is immutable',
  'une réponse déjà donnée est IMMUABLE (trigger de gel)');

-- ══ 4bis. Réponses FAUSSES : évaluation serveur ══════════════
select public.join_quiz('tap-quiz', repeat('b', 64), 'Bob');
-- Bob : bonne réponse à Q1, estimation HORS tolérance à Q4 (110 vs 100 ± 5).
select public.start_quiz_question('fa000000-0000-4000-8000-000000000010',
  repeat('b', 64), 'fa000000-0000-4000-8000-000000000011');
select public.submit_quiz_answer('fa000000-0000-4000-8000-000000000010',
  repeat('b', 64), 'fa000000-0000-4000-8000-000000000011', '"b"'::jsonb);
select public.start_quiz_question('fa000000-0000-4000-8000-000000000010',
  repeat('b', 64), 'fa000000-0000-4000-8000-000000000014');
select is((public.submit_quiz_answer(
    'fa000000-0000-4000-8000-000000000010', repeat('b', 64),
    'fa000000-0000-4000-8000-000000000014', '110'::jsonb))->>'is_correct',
  'false', 'estimation hors tolérance → fausse');
-- Bob : classement dans le MAUVAIS ordre, et pronostic libre erroné.
select public.start_quiz_question('fa000000-0000-4000-8000-000000000010',
  repeat('b', 64), 'fa000000-0000-4000-8000-000000000016');
select is((public.submit_quiz_answer(
    'fa000000-0000-4000-8000-000000000010', repeat('b', 64),
    'fa000000-0000-4000-8000-000000000016', '["b","a","c"]'::jsonb))->>'is_correct',
  'false', 'classement dans le mauvais ordre → faux');
select public.start_quiz_question('fa000000-0000-4000-8000-000000000010',
  repeat('b', 64), 'fa000000-0000-4000-8000-000000000017');
select is((public.submit_quiz_answer(
    'fa000000-0000-4000-8000-000000000010', repeat('b', 64),
    'fa000000-0000-4000-8000-000000000017', '"Espagne"'::jsonb))->>'is_correct',
  'false', 'pronostic libre hors variantes → faux');

-- ══ 5c. Dépassement de time_limit_seconds ═══════════════════
-- Le chronomètre étant IMMUABLE (test ci-dessus), la seule façon de fabriquer
-- une fenêtre expirée est d'insérer la ligne de présentation avec un
-- started_at passé — c'est précisément ce que la RPC interdit au client.
select public.join_quiz('tap-quiz', repeat('d', 64), 'Dan');
insert into public.quiz_answers
  (player_id, question_id, quiz_id, organization_id, started_at)
values (
  (select id from public.quiz_players
    where quiz_id = 'fa000000-0000-4000-8000-000000000010'
      and token_hash = repeat('d', 64)),
  'fa000000-0000-4000-8000-000000000015',
  'fa000000-0000-4000-8000-000000000010',
  'fa000000-0000-4000-8000-000000000001',
  now() - interval '30 seconds'
);
insert into tap_r select public.submit_quiz_answer(
  'fa000000-0000-4000-8000-000000000010', repeat('d', 64),
  'fa000000-0000-4000-8000-000000000015', '"oui"'::jsonb);
select is((select r->>'state' from tap_r), 'too_late',
  'dépassement de time_limit_seconds → réponse refusée (too_late)');
select is((select (r->>'is_correct')::boolean from tap_r), false,
  'réponse hors délai JAMAIS scorée, même si l''option est la bonne');
select is((select (r->>'points_awarded')::int from tap_r), 0,
  'réponse hors délai : 0 point');
select is((select (r->>'elapsed_ms')::int from tap_r), 5000,
  'elapsed_ms plafonné à la fenêtre de la question (5 s)');
delete from tap_r;
-- La question est CONSOMMÉE : laisser filer le chronomètre ne donne pas de 2e essai.
select is((public.submit_quiz_answer(
    'fa000000-0000-4000-8000-000000000010', repeat('d', 64),
    'fa000000-0000-4000-8000-000000000015', '"oui"'::jsonb))->>'state',
  'already_answered', 'hors délai : la question est consommée, pas de 2e essai');

-- ══ 3. NON-FUITE via quiz_public_state ══════════════════════
-- Bob n'a répondu qu'à Q1, Q4, Q6 et Q7 : les autres questions ne doivent
-- exposer NI la vérité, NI une quelconque réponse.
insert into tap_r select public.quiz_public_state(
  'fa000000-0000-4000-8000-000000000010', repeat('b', 64));
select is((select r->>'state' from tap_r), 'ok', 'quiz_public_state OK');
select ok((select not (elem ? 'correct_answer')
             from tap_r, jsonb_array_elements(r->'questions') elem
            where (elem->>'position')::int = 1),
  'question NON répondue : correct_answer NON exposée');
select ok((select not (elem ? 'your_answer')
             from tap_r, jsonb_array_elements(r->'questions') elem
            where (elem->>'position')::int = 1),
  'question NON répondue : aucune réponse exposée');
select is((select elem->>'status'
             from tap_r, jsonb_array_elements(r->'questions') elem
            where (elem->>'position')::int = 1),
  'pending', 'question NON répondue : statut pending');
-- Les options restent visibles (elles ne désignent pas la bonne réponse).
select ok((select elem ? 'options'
             from tap_r, jsonb_array_elements(r->'questions') elem
            where (elem->>'position')::int = 1),
  'question NON répondue : les options restent affichables');
-- Question répondue par Bob : SA vérité et SA réponse, pas celles d'Alice.
select ok((select elem ? 'correct_answer'
             from tap_r, jsonb_array_elements(r->'questions') elem
            where (elem->>'position')::int = 3),
  'question répondue : correct_answer exposée (à ce joueur seul)');
select is((select elem->>'your_answer'
             from tap_r, jsonb_array_elements(r->'questions') elem
            where (elem->>'position')::int = 3),
  '110', 'la réponse affichée est bien CELLE DE CE JOUEUR (110, pas 103)');
delete from tap_r;

-- Vue ANONYME (aucun jeton) : aucune vérité nulle part, aucun joueur.
insert into tap_r select public.quiz_public_state(
  'fa000000-0000-4000-8000-000000000010');
select ok((select not exists (
             select 1 from jsonb_array_elements(r->'questions') e
              where e ? 'correct_answer') from tap_r),
  'vue anonyme : AUCUNE vérité exposée');
select ok((select not exists (
             select 1 from jsonb_array_elements(r->'questions') e
              where e ? 'your_answer') from tap_r),
  'vue anonyme : AUCUNE réponse de joueur exposée');
select is((select r->'player' from tap_r), 'null'::jsonb,
  'vue anonyme : aucun joueur');
delete from tap_r;

-- ══ 6a/7. Mode threshold : atteint, non atteint, stock fini ══
-- Alice : 7 bonnes réponses >= 3 → lot émis (stock 1).
insert into tap_r select public.finish_quiz(
  'fa000000-0000-4000-8000-000000000010', repeat('a', 64));
select is((select r->>'state' from tap_r), 'finished', 'Alice clôt sa participation');
select ok((select r->'reward'->>'code' ~ '^QUIZ-[A-HJ-NP-Z2-9]{8}$' from tap_r),
  'seuil atteint → code QUIZ-… au bon format');
select is((select (r->'reward'->>'out_of_stock')::boolean from tap_r), false,
  'seuil atteint : stock disponible');
delete from tap_r;
select is((select reward_claimed_count from public.quizzes
             where id = 'fa000000-0000-4000-8000-000000000010'),
  1, 'stock décrémenté (reward_claimed_count)');
-- Idempotence de la clôture : aucun second lot.
insert into tap_r select public.finish_quiz(
  'fa000000-0000-4000-8000-000000000010', repeat('a', 64));
select is((select r->>'state' from tap_r), 'already_finished',
  'clôture idempotente → already_finished');
select is((select (r->>'emitted')::boolean from tap_r), false,
  'clôture idempotente : aucun second lot émis');
delete from tap_r;
select is((select count(*)::int from public.quiz_rewards
             where quiz_id = 'fa000000-0000-4000-8000-000000000010'),
  1, 'un seul lot au total après double clôture');

-- Bob : 1 bonne réponse < 3 → AUCUN lot.
insert into tap_r select public.finish_quiz(
  'fa000000-0000-4000-8000-000000000010', repeat('b', 64));
select is((select r->>'state' from tap_r), 'finished', 'Bob clôt sa participation');
select is((select r->'reward' from tap_r), 'null'::jsonb,
  'seuil NON atteint → aucun lot');
delete from tap_r;

-- Carla : seuil atteint mais STOCK ÉPUISÉ → out_of_stock, aucun code.
select public.join_quiz('tap-quiz', repeat('c', 64), 'Carla');
select public.start_quiz_question('fa000000-0000-4000-8000-000000000010',
  repeat('c', 64), 'fa000000-0000-4000-8000-000000000011');
select public.submit_quiz_answer('fa000000-0000-4000-8000-000000000010',
  repeat('c', 64), 'fa000000-0000-4000-8000-000000000011', '"b"'::jsonb);
select public.start_quiz_question('fa000000-0000-4000-8000-000000000010',
  repeat('c', 64), 'fa000000-0000-4000-8000-000000000012');
select public.submit_quiz_answer('fa000000-0000-4000-8000-000000000010',
  repeat('c', 64), 'fa000000-0000-4000-8000-000000000012', '"vrai"'::jsonb);
select public.start_quiz_question('fa000000-0000-4000-8000-000000000010',
  repeat('c', 64), 'fa000000-0000-4000-8000-000000000013');
select public.submit_quiz_answer('fa000000-0000-4000-8000-000000000010',
  repeat('c', 64), 'fa000000-0000-4000-8000-000000000013', '"chat"'::jsonb);
insert into tap_r select public.finish_quiz(
  'fa000000-0000-4000-8000-000000000010', repeat('c', 64));
select is((select (r->'reward'->>'out_of_stock')::boolean from tap_r), true,
  'stock épuisé → out_of_stock');
select is((select r->'reward'->>'code' from tap_r), null,
  'stock épuisé → aucun code émis (pas de sur-émission)');
delete from tap_r;
select is((select reward_claimed_count from public.quizzes
             where id = 'fa000000-0000-4000-8000-000000000010'),
  1, 'stock épuisé : reward_claimed_count inchangé (borne respectée)');

-- ══ 6b. Mode instant ════════════════════════════════════════
-- Lot systématique à la clôture, même sans bonne réponse.
select public.join_quiz('tap-quiz-instant', repeat('6', 64), 'Louis');
select public.start_quiz_question('fa000000-0000-4000-8000-000000000040',
  repeat('6', 64), 'fa000000-0000-4000-8000-000000000041');
select public.submit_quiz_answer('fa000000-0000-4000-8000-000000000040',
  repeat('6', 64), 'fa000000-0000-4000-8000-000000000041', '"faux"'::jsonb);
insert into tap_r select public.finish_quiz(
  'fa000000-0000-4000-8000-000000000040', repeat('6', 64));
select is((select r->'reward'->>'source' from tap_r), 'instant',
  'mode instant : lot émis à la clôture');
select ok((select r->'reward'->>'code' ~ '^QUIZ-[A-HJ-NP-Z2-9]{8}$' from tap_r),
  'mode instant : code QUIZ-… émis même sans bonne réponse');
delete from tap_r;

-- ══ 6c. Mode none ═══════════════════════════════════════════
select public.join_quiz('tap-quiz-none', repeat('8', 64));
select public.start_quiz_question('fa000000-0000-4000-8000-000000000050',
  repeat('8', 64), 'fa000000-0000-4000-8000-000000000051');
select public.submit_quiz_answer('fa000000-0000-4000-8000-000000000050',
  repeat('8', 64), 'fa000000-0000-4000-8000-000000000051', '4'::jsonb);
insert into tap_r select public.finish_quiz(
  'fa000000-0000-4000-8000-000000000050', repeat('8', 64));
select is((select r->>'state' from tap_r), 'finished', 'mode none : clôture OK');
select is((select r->'reward' from tap_r), 'null'::jsonb,
  'mode none : aucun lot, participation gratuite');
delete from tap_r;
select is((select count(*)::int from public.quiz_rewards
             where quiz_id = 'fa000000-0000-4000-8000-000000000050'),
  0, 'mode none : aucune ligne de récompense');

-- ══ 6d. Mode draw : ATOMIQUE et IDEMPOTENT ══════════════════
select public.join_quiz('tap-quiz-draw', repeat('e', 64), 'Emma');
select public.start_quiz_question('fa000000-0000-4000-8000-000000000020',
  repeat('e', 64), 'fa000000-0000-4000-8000-000000000021');
select public.submit_quiz_answer('fa000000-0000-4000-8000-000000000020',
  repeat('e', 64), 'fa000000-0000-4000-8000-000000000021', '"a"'::jsonb);
insert into tap_r select public.finish_quiz(
  'fa000000-0000-4000-8000-000000000020', repeat('e', 64));
select is((select (r->>'pending_draw')::boolean from tap_r), true,
  'mode draw : la clôture n''émet rien, le tirage est différé');
select is((select r->'reward' from tap_r), 'null'::jsonb,
  'mode draw : aucun lot à la clôture');
delete from tap_r;

select public.join_quiz('tap-quiz-draw', repeat('f', 64), 'Farid');
select public.start_quiz_question('fa000000-0000-4000-8000-000000000020',
  repeat('f', 64), 'fa000000-0000-4000-8000-000000000021');
select public.submit_quiz_answer('fa000000-0000-4000-8000-000000000020',
  repeat('f', 64), 'fa000000-0000-4000-8000-000000000021', '"a"'::jsonb);
select public.finish_quiz('fa000000-0000-4000-8000-000000000020', repeat('f', 64));

insert into tap_r select public.draw_quiz_winners(
  'fa000000-0000-4000-8000-000000000001', 'fa000000-0000-4000-8000-000000000020');
select is((select r->>'state' from tap_r), 'drawn', 'tirage effectué');
select is((select (r->>'winners')::int from tap_r), 1,
  'tirage : un seul gagnant (borné par le stock fini)');
delete from tap_r;
-- SECOND APPEL : impossible de relancer, impossible de sur-émettre.
insert into tap_r select public.draw_quiz_winners(
  'fa000000-0000-4000-8000-000000000001', 'fa000000-0000-4000-8000-000000000020');
select is((select r->>'state' from tap_r), 'already_drawn',
  'tirage IDEMPOTENT : un second appel ne relance rien');
select is((select (r->>'winners')::int from tap_r), 1,
  'tirage idempotent : le nombre de gagnants n''a pas bougé');
delete from tap_r;
select is((select count(*)::int from public.quiz_rewards
             where quiz_id = 'fa000000-0000-4000-8000-000000000020'),
  1, 'deux appels au tirage n''émettent QU''UNE fois');
select is((select reward_claimed_count from public.quizzes
             where id = 'fa000000-0000-4000-8000-000000000020'),
  1, 'tirage : stock décrémenté exactement une fois');
select ok((select code ~ '^QUIZ-[A-HJ-NP-Z2-9]{8}$' from public.quiz_rewards
             where quiz_id = 'fa000000-0000-4000-8000-000000000020'),
  'tirage : code QUIZ-… au bon format');
select is((select rank from public.quiz_rewards
             where quiz_id = 'fa000000-0000-4000-8000-000000000020'),
  1, 'tirage : rang du gagnant renseigné');

-- ══ 6e. Mode ranking : score PUIS rapidité, ex æquo ═════════
select is((select count(*)::int from public.quiz_leaderboard(
    'fa000000-0000-4000-8000-000000000030')),
  4, 'classement : seules les participations TERMINÉES sont classées');
select is((select first_name from public.quiz_leaderboard(
    'fa000000-0000-4000-8000-000000000030') where rank = 1),
  'Gaelle', 'à score égal, le plus RAPIDE est premier');
select is((select count(*)::int from public.quiz_leaderboard(
    'fa000000-0000-4000-8000-000000000030') where rank = 2),
  2, 'ex æquo (même score ET même temps) partagent le rang 2');
select is((select rank from public.quiz_leaderboard(
    'fa000000-0000-4000-8000-000000000030') where first_name = 'Ines'),
  4::bigint, 'après un ex æquo, le rang suivant saute (rank())');
select ok(not exists (
    select 1 from public.quiz_leaderboard('fa000000-0000-4000-8000-000000000030')
     where first_name = 'Karim'),
  'classement : participation non terminée exclue');

-- Attribution au classement : top 2 dans l'ordre, puis idempotence.
insert into tap_r select public.draw_quiz_winners(
  'fa000000-0000-4000-8000-000000000001', 'fa000000-0000-4000-8000-000000000030');
select is((select (r->>'winners')::int from tap_r), 2,
  'mode ranking : deux lots émis (stock 2)');
delete from tap_r;
select is((select p.first_name from public.quiz_rewards r
             join public.quiz_players p on p.id = r.player_id
            where r.quiz_id = 'fa000000-0000-4000-8000-000000000030' and r.rank = 1),
  'Gaelle', 'mode ranking : rang 1 au meilleur score/temps');
select is((select p.first_name from public.quiz_rewards r
             join public.quiz_players p on p.id = r.player_id
            where r.quiz_id = 'fa000000-0000-4000-8000-000000000030' and r.rank = 2),
  'Hugo', 'mode ranking : rang 2 départagé de façon déterministe');
select is((public.draw_quiz_winners(
    'fa000000-0000-4000-8000-000000000001',
    'fa000000-0000-4000-8000-000000000030'))->>'state',
  'already_drawn', 'mode ranking : attribution non rejouable');
select is((select count(*)::int from public.quiz_rewards
             where quiz_id = 'fa000000-0000-4000-8000-000000000030'),
  2, 'mode ranking : aucune sur-émission au second appel');

-- Un mode non différé refuse le tirage.
select is((public.draw_quiz_winners(
    'fa000000-0000-4000-8000-000000000001',
    'fa000000-0000-4000-8000-000000000040'))->>'state',
  'invalid_mode', 'le tirage est refusé sur un mode à émission immédiate');
-- Cloisonnement : un quiz d'une autre organisation est introuvable.
select is((public.draw_quiz_winners(
    'fa000000-0000-4000-8000-0000000000ff',
    'fa000000-0000-4000-8000-000000000020'))->>'state',
  'unavailable', 'tirage cross-org : quiz introuvable');

-- ══ 8. Tour de roue offert : grant à usage unique ════════════
select public.join_quiz('tap-quiz-wheel', repeat('9', 64), 'Omar');
select public.start_quiz_question('fa000000-0000-4000-8000-000000000060',
  repeat('9', 64), 'fa000000-0000-4000-8000-000000000061');
select public.submit_quiz_answer('fa000000-0000-4000-8000-000000000060',
  repeat('9', 64), 'fa000000-0000-4000-8000-000000000061', '"vrai"'::jsonb);
insert into tap_r select public.finish_quiz(
  'fa000000-0000-4000-8000-000000000060', repeat('9', 64));
select ok((select r->'reward'->>'spin_grant_token' ~ '^[0-9a-f]{48}$' from tap_r),
  'tour offert : grant_token à usage unique émis');
select is((select r->'reward'->>'target_wheel_id' from tap_r),
  'fa000000-0000-4000-8000-000000000006', 'tour offert : roue cible renvoyée');
select is((select r->'reward'->>'code' from tap_r), null,
  'tour offert : aucun code de caisse (support unique)');
delete from tap_r;

create temporary table tap_grant (g text) on commit drop;
insert into tap_grant select spin_grant_token from public.quiz_rewards
 where quiz_id = 'fa000000-0000-4000-8000-000000000060';
select is((public.consume_quiz_spin_grant(
    'fa000000-0000-4000-8000-000000000060', repeat('9', 64),
    repeat('0', 48)))->>'state',
  'unavailable', 'grant inconnu → unavailable');
insert into tap_r select public.consume_quiz_spin_grant(
  'fa000000-0000-4000-8000-000000000060', repeat('9', 64),
  (select g from tap_grant));
select is((select r->>'state' from tap_r), 'spun', 'grant valide → spun');
select is((select (r->>'is_losing')::boolean from tap_r), false,
  'tirage déterministe : lot gagnant');
delete from tap_r;
select is((public.consume_quiz_spin_grant(
    'fa000000-0000-4000-8000-000000000060', repeat('9', 64),
    (select g from tap_grant)))->>'state',
  'already_consumed', 'grant déjà consommé → already_consumed (anti-rejeu)');
select is((select source from public.spins
             where player_key = repeat('9', 64)),
  'quiz', 'le spin offert est journalisé avec la source quiz');

-- ══ 9. Caisse : redeem_quiz_reward ══════════════════════════
create temporary table tap_code (code text) on commit drop;
insert into tap_code select code from public.quiz_rewards
 where quiz_id = 'fa000000-0000-4000-8000-000000000010' and code is not null;

-- Cross-org → aucune ligne (refus générique, org-scopé).
select is((select count(*)::int from public.redeem_quiz_reward(
    'fa000000-0000-4000-8000-0000000000ff', (select code from tap_code), 'caisse-autre')),
  0, 'code d''une autre organisation : aucune ligne');
-- Retrait valide (insensible à la casse).
select is((select redeemed_now from public.redeem_quiz_reward(
    'fa000000-0000-4000-8000-000000000001', lower((select code from tap_code)), 'caisse-1')),
  true, 'retrait valide (insensible à la casse)');
select is((select quiz_name from public.redeem_quiz_reward(
    'fa000000-0000-4000-8000-000000000001', (select code from tap_code), 'caisse-1')),
  'Quiz du restaurant', 'la caisse affiche le quiz d''origine');
-- Double retrait refusé.
select is((select redeemed_now from public.redeem_quiz_reward(
    'fa000000-0000-4000-8000-000000000001', (select code from tap_code), 'caisse-1')),
  false, 'pas de double retrait');
-- Code inconnu : réponse indistinguable (aucune ligne).
select is((select count(*)::int from public.redeem_quiz_reward(
    'fa000000-0000-4000-8000-000000000001', 'QUIZ-ZZZZZZZZ', 'caisse-1')),
  0, 'code inconnu : aucune ligne (pas d''oracle)');
select ok(exists (select 1 from public.audit_logs
             where organization_id = 'fa000000-0000-4000-8000-000000000001'
               and action = 'quiz.redeem'),
  'le retrait est audité');

-- ══ 11. ACL des RPC du parcours joueur ══════════════════════
select ok(has_function_privilege('service_role',
  'public.join_quiz(text,text,text,text,text,boolean)', 'EXECUTE'),
  'seul le serveur peut faire entrer un joueur');
select ok(not has_function_privilege('authenticated',
  'public.join_quiz(text,text,text,text,text,boolean)', 'EXECUTE'),
  'le marchand ne peut pas usurper un joueur');
select ok(not has_function_privilege('anon',
  'public.start_quiz_question(uuid,text,uuid)', 'EXECUTE'),
  'anon ne peut pas lancer le chronomètre');
select ok(not has_function_privilege('authenticated',
  'public.submit_quiz_answer(uuid,text,uuid,jsonb)', 'EXECUTE'),
  'le marchand ne peut pas répondre à la place d''un joueur');
select ok(not has_function_privilege('authenticated',
  'public.quiz_answer_is_correct(text,jsonb,jsonb,numeric)', 'EXECUTE'),
  'l''évaluation de justesse est réservée au serveur');
select ok(not has_function_privilege('authenticated',
  'public.quiz_emit_reward(uuid,uuid,uuid,text,integer)', 'EXECUTE'),
  'le marchand ne peut pas émettre un lot directement');
select ok(not has_function_privilege('anon',
  'public.quiz_public_state(uuid,text)', 'EXECUTE'),
  'anon ne peut pas lire l''état public directement');
select ok(not has_table_privilege('anon', 'public.quiz_questions', 'SELECT'),
  'anon ne peut pas lire les corrigés');

-- ══ 10. Purge RGPD : PII neutralisée, lots conservés ════════
update public.quiz_players set created_at = now() - interval '7 months'
 where quiz_id = 'fa000000-0000-4000-8000-000000000010';
select ok(public.purge_expired_quiz_players() >= 3,
  'purge : les participations trop anciennes sont traitées');
select is((select count(*)::int from public.quiz_players
             where quiz_id = 'fa000000-0000-4000-8000-000000000010'
               and (first_name is not null or email is not null)),
  0, 'purge : prénoms et emails neutralisés');
-- Divergence assumée : la ligne et le registre des lots SURVIVENT.
select is((select count(*)::int from public.quiz_players
             where quiz_id = 'fa000000-0000-4000-8000-000000000010'),
  4, 'purge : les participations anonymisées subsistent (classement préservé)');
select is((select count(*)::int from public.quiz_rewards
             where quiz_id = 'fa000000-0000-4000-8000-000000000010'
               and code is not null),
  1, 'purge : le registre des codes émis est préservé');
-- Idempotence : un second passage n'a plus rien à neutraliser.
select is(public.purge_expired_quiz_players(), 0::bigint,
  'purge idempotente : aucune PII restante à neutraliser');

select * from finish();
rollback;
