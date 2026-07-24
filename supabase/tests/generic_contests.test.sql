-- ============================================================
-- Pronostics génériques (20260801120000) — comportement réel sur une
-- base migrée vierge.
--
-- L'enjeu numéro un de ce fichier est la NON-RÉGRESSION FOOTBALL : un
-- championnat de score existant doit produire exactement les mêmes
-- points (exact/diff/winner) et la même fenêtre de pronostic qu'avant
-- la généralisation. Le reste couvre les trois nouveaux types de
-- question (choice, ranking, number), la règle de verrouillage
-- généralisée et la validation de forme côté serveur.
-- ============================================================
begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

select set_config('request.jwt.claims', '{"role":"service_role"}', true);

-- ── Organisation + propriétaire (les RPC de règlement exigent un
--    membre réel) ─────────────────────────────────────────────
insert into public.organizations (id, name, slug)
values ('d0000000-0000-4000-8000-000000000001', 'Test Générique', 'tap-generique');

insert into auth.users (id, aud, role, email, encrypted_password, created_at, updated_at)
values ('d0000000-0000-4000-8000-0000000000aa', 'authenticated', 'authenticated',
        'owner@tapgen.local', '', now(), now());
insert into public.organization_members (organization_id, user_id, role)
values ('d0000000-0000-4000-8000-000000000001',
        'd0000000-0000-4000-8000-0000000000aa', 'owner');

-- ══════════════════════════════════════════════════════════════
-- (a) NON-RÉGRESSION FOOTBALL
-- ══════════════════════════════════════════════════════════════
-- Championnat créé exactement comme avant la migration : aucune
-- colonne générique renseignée, barème par défaut 3/2/1.
insert into public.contests (id, organization_id, slug, name, competition_key, status)
values ('d0000000-0000-4000-8000-000000000002',
        'd0000000-0000-4000-8000-000000000001',
        'tap-foot', 'Championnat foot TAP', 'ligue1', 'active');

select is(
  (select event_kind from public.contests
    where id = 'd0000000-0000-4000-8000-000000000002'),
  'football',
  'un championnat créé sans event_kind reste un événement football'
);

insert into public.contest_matches
  (id, contest_id, organization_id, home_name, away_name, kickoff_at, status)
values
  ('d0000000-0000-4000-8000-000000000011',
   'd0000000-0000-4000-8000-000000000002',
   'd0000000-0000-4000-8000-000000000001',
   'PSG', 'OM', now() + interval '2 days', 'scheduled'),
  -- Reste ouvert tout le fichier : sert à prouver qu'une question de
  -- score refuse une réponse générique pour la BONNE raison (le type),
  -- pas parce qu'elle serait déjà terminée.
  ('d0000000-0000-4000-8000-000000000012',
   'd0000000-0000-4000-8000-000000000002',
   'd0000000-0000-4000-8000-000000000001',
   'OL', 'OGCN', now() + interval '20 days', 'scheduled');

select is(
  (select question_type from public.contest_matches
    where id = 'd0000000-0000-4000-8000-000000000011'),
  'score',
  'un match inséré sans question_type reste une question de score'
);

-- Aucun backfill de locks_at : un match (existant comme nouvellement
-- synchronisé) garde locks_at null et retombe sur kickoff_at, ce qui
-- lui permet de suivre les reports décidés par la synchro.
select ok(
  (select locks_at is null from public.contest_matches
    where id = 'd0000000-0000-4000-8000-000000000011'),
  'la synchro API (ni question_type ni locks_at) insère toujours sans erreur'
);

insert into public.contest_players
  (id, contest_id, organization_id, token_hash, first_name, accepted_terms)
values
  ('d0000000-0000-4000-8000-000000000021', 'd0000000-0000-4000-8000-000000000002',
   'd0000000-0000-4000-8000-000000000001', repeat('1', 64), 'Exact', true),
  ('d0000000-0000-4000-8000-000000000022', 'd0000000-0000-4000-8000-000000000002',
   'd0000000-0000-4000-8000-000000000001', repeat('2', 64), 'Ecart', true),
  ('d0000000-0000-4000-8000-000000000023', 'd0000000-0000-4000-8000-000000000002',
   'd0000000-0000-4000-8000-000000000001', repeat('3', 64), 'Vainqueur', true),
  ('d0000000-0000-4000-8000-000000000024', 'd0000000-0000-4000-8000-000000000002',
   'd0000000-0000-4000-8000-000000000001', repeat('4', 64), 'Rien', true);

-- Résultat réel visé : 2-1.
select is(
  public.submit_contest_prediction('d0000000-0000-4000-8000-000000000002',
    'd0000000-0000-4000-8000-000000000011',
    'd0000000-0000-4000-8000-000000000021', 2, 1),
  true, 'pronostic de score accepté avant le coup d''envoi (kickoff_at)'
);
select is(
  public.submit_contest_prediction('d0000000-0000-4000-8000-000000000002',
    'd0000000-0000-4000-8000-000000000011',
    'd0000000-0000-4000-8000-000000000022', 3, 2),
  true, 'second pronostic accepté'
);
select is(
  public.submit_contest_prediction('d0000000-0000-4000-8000-000000000002',
    'd0000000-0000-4000-8000-000000000011',
    'd0000000-0000-4000-8000-000000000023', 4, 0),
  true, 'troisième pronostic accepté'
);
select is(
  public.submit_contest_prediction('d0000000-0000-4000-8000-000000000002',
    'd0000000-0000-4000-8000-000000000011',
    'd0000000-0000-4000-8000-000000000024', 0, 2),
  true, 'quatrième pronostic accepté'
);

-- Un score reste refusé hors bornes (garde historique).
select is(
  public.submit_contest_prediction('d0000000-0000-4000-8000-000000000002',
    'd0000000-0000-4000-8000-000000000011',
    'd0000000-0000-4000-8000-000000000021', 100, 1),
  false, 'score hors bornes 0..99 toujours refusé'
);

-- Le coup d'envoi est passé : saisie du résultat par le serveur.
update public.contest_matches
   set kickoff_at = now() - interval '1 hour'
 where id = 'd0000000-0000-4000-8000-000000000011';

select is(
  public.set_contest_match_result('d0000000-0000-4000-8000-000000000001',
    'd0000000-0000-4000-8000-000000000011', 2, 1),
  true, 'saisie du résultat football : signature 7 paramètres inchangée'
);

-- LE test de non-régression : paliers exact/diff/winner à l'identique.
select results_eq(
  $$select pl.first_name, pr.points
      from public.contest_predictions pr
      join public.contest_players pl on pl.id = pr.player_id
     where pr.match_id = 'd0000000-0000-4000-8000-000000000011'
     order by pl.first_name$$,
  $$values ('Ecart', 2), ('Exact', 3), ('Rien', 0), ('Vainqueur', 1)$$,
  'barème score inchangé : exact 3, diff 2, winner 1, faux 0'
);

-- Le pronostic est fermé une fois l'échéance passée (règle historique,
-- servie ici par le repli sur kickoff_at).
select is(
  public.submit_contest_prediction('d0000000-0000-4000-8000-000000000002',
    'd0000000-0000-4000-8000-000000000011',
    'd0000000-0000-4000-8000-000000000021', 1, 1),
  false, 'plus de pronostic après le coup d''envoi (repli sur kickoff_at)'
);

-- Le classement agrégé reste juste sur ce championnat purement score.
select results_eq(
  $$select first_name, total_points, exact_count
      from public.contest_leaderboard('d0000000-0000-4000-8000-000000000002')
     where first_name = 'Exact'$$,
  $$values ('Exact', 3, 1)$$,
  'le classement lit toujours correctement un championnat football'
);

-- ══════════════════════════════════════════════════════════════
-- (a-bis) NON-RÉGRESSION FOOTBALL — la fenêtre SUIT le coup d'envoi
-- ══════════════════════════════════════════════════════════════
-- Le worker de synchronisation (src/lib/contest-sync.ts) ne met à jour
-- QUE kickoff_at lors d'un report. La fenêtre de pronostic d'une
-- question de score doit donc rester adossée à kickoff_at — c'est ce
-- que garantit l'absence de backfill de locks_at.
-- Terrain : le match 12 (OL–OGCN), laissé ouvert et rendu à une date
-- FUTURE en fin de section pour les tests qui suivent.

-- Coup d'envoi atteint : fenêtre fermée (règle historique).
update public.contest_matches
   set kickoff_at = now() - interval '1 hour'
 where id = 'd0000000-0000-4000-8000-000000000012';
select is(
  public.submit_contest_prediction('d0000000-0000-4000-8000-000000000002',
    'd0000000-0000-4000-8000-000000000012',
    'd0000000-0000-4000-8000-000000000021', 1, 0),
  false, 'match commencé : pronostic refusé (repli sur kickoff_at)'
);

-- MATCH REPORTÉ : la synchro déplace kickoff_at vers le futur, sans
-- toucher à locks_at. Le pronostic doit REDEVENIR possible — un
-- locks_at backfillé sur l'ancien coup d'envoi l'aurait interdit à vie.
update public.contest_matches
   set kickoff_at = now() + interval '3 days'
 where id = 'd0000000-0000-4000-8000-000000000012';
select is(
  public.submit_contest_prediction('d0000000-0000-4000-8000-000000000002',
    'd0000000-0000-4000-8000-000000000012',
    'd0000000-0000-4000-8000-000000000021', 1, 0),
  true,
  'match reporté : la fenêtre suit le nouveau coup d''envoi (aucun locks_at figé)'
);

-- MATCH AVANCÉ : symétrique. La rencontre est déplacée dans le passé,
-- le pronostic doit être refusé immédiatement.
update public.contest_matches
   set kickoff_at = now() - interval '10 minutes'
 where id = 'd0000000-0000-4000-8000-000000000012';
select is(
  public.submit_contest_prediction('d0000000-0000-4000-8000-000000000002',
    'd0000000-0000-4000-8000-000000000012',
    'd0000000-0000-4000-8000-000000000022', 2, 2),
  false,
  'match avancé : pronostic refusé dès que le nouveau coup d''envoi est passé'
);

-- default_locks_at NE S'APPLIQUE PAS au football : un commerçant qui
-- renseigne un verrouillage par défaut (même passé) ne doit pas fermer
-- d'un coup tous ses matchs importés.
update public.contest_matches
   set kickoff_at = now() + interval '20 days'
 where id = 'd0000000-0000-4000-8000-000000000012';
update public.contests set default_locks_at = now() - interval '1 hour'
 where id = 'd0000000-0000-4000-8000-000000000002';
select is(
  public.submit_contest_prediction('d0000000-0000-4000-8000-000000000002',
    'd0000000-0000-4000-8000-000000000012',
    'd0000000-0000-4000-8000-000000000022', 2, 2),
  true,
  'default_locks_at passé ne ferme pas un match de football (kickoff_at futur)'
);

-- Même règle pour le verrou de règlement : un championnat football sans
-- pronostic ni match commencé reste OUVERT malgré un default_locks_at
-- passé (ce serait un gel à tort du barème et des récompenses).
insert into public.contests
  (id, organization_id, slug, name, competition_key, status, default_locks_at)
values ('d0000000-0000-4000-8000-000000000004',
        'd0000000-0000-4000-8000-000000000001',
        'tap-foot-2', 'Championnat foot TAP 2', 'ligue1', 'active',
        now() - interval '1 hour');
insert into public.contest_matches
  (id, contest_id, organization_id, home_name, away_name, kickoff_at, status)
values ('d0000000-0000-4000-8000-000000000013',
        'd0000000-0000-4000-8000-000000000004',
        'd0000000-0000-4000-8000-000000000001',
        'RCL', 'LOSC', now() + interval '30 days', 'scheduled');
select is(
  public.contest_is_locked('d0000000-0000-4000-8000-000000000004'),
  false,
  'contest_is_locked : default_locks_at passé ne verrouille pas un championnat football'
);
update public.contest_matches
   set kickoff_at = now() - interval '1 minute'
 where id = 'd0000000-0000-4000-8000-000000000013';
select is(
  public.contest_is_locked('d0000000-0000-4000-8000-000000000004'),
  true,
  'contest_is_locked : le coup d''envoi passé verrouille bien le championnat football'
);

-- Remise en état pour la suite : le match 12 doit rester ouvert et le
-- championnat football sans verrouillage par défaut.
update public.contests set default_locks_at = null
 where id = 'd0000000-0000-4000-8000-000000000002';

-- ══════════════════════════════════════════════════════════════
-- (b) Verrouillage généralisé
-- ══════════════════════════════════════════════════════════════
insert into public.contests
  (id, organization_id, slug, name, competition_key, status, event_kind)
values ('d0000000-0000-4000-8000-000000000003',
        'd0000000-0000-4000-8000-000000000001',
        'tap-ceremonie', 'Cérémonie TAP', 'custom', 'active', 'ceremony');

insert into public.contest_matches
  (id, contest_id, organization_id, home_name, away_name, kickoff_at,
   status, question_type, prompt, options, locks_at)
values
  -- Question CHOICE, verrouillage propre dans le futur.
  ('d0000000-0000-4000-8000-000000000031',
   'd0000000-0000-4000-8000-000000000003',
   'd0000000-0000-4000-8000-000000000001', '', '',
   now() + interval '10 days', 'scheduled', 'choice',
   'Qui remporte le trophée ?',
   '[{"id":"a","label":"Alpha"},{"id":"b","label":"Beta"},{"id":"c","label":"Gamma"}]'::jsonb,
   now() + interval '2 days');

-- Question RANKING (podium de 3 parmi 4).
insert into public.contest_matches
  (id, contest_id, organization_id, home_name, away_name, kickoff_at,
   status, question_type, prompt, options, ranking_size, locks_at)
values
  ('d0000000-0000-4000-8000-000000000032',
   'd0000000-0000-4000-8000-000000000003',
   'd0000000-0000-4000-8000-000000000001', '', '',
   now() + interval '10 days', 'scheduled', 'ranking',
   'Podium final ?',
   '[{"id":"a","label":"Alpha"},{"id":"b","label":"Beta"},{"id":"c","label":"Gamma"},{"id":"d","label":"Delta"}]'::jsonb,
   3, now() + interval '2 days');

-- Question NUMBER.
insert into public.contest_matches
  (id, contest_id, organization_id, home_name, away_name, kickoff_at,
   status, question_type, prompt, locks_at)
values
  ('d0000000-0000-4000-8000-000000000033',
   'd0000000-0000-4000-8000-000000000003',
   'd0000000-0000-4000-8000-000000000001', '', '',
   now() + interval '10 days', 'scheduled', 'number',
   'Combien de spectateurs ?', now() + interval '2 days');

-- Question sans locks_at : c'est contests.default_locks_at qui tranche,
-- avant kickoff_at.
insert into public.contest_matches
  (id, contest_id, organization_id, home_name, away_name, kickoff_at,
   status, question_type, prompt, options)
values
  ('d0000000-0000-4000-8000-000000000034',
   'd0000000-0000-4000-8000-000000000003',
   'd0000000-0000-4000-8000-000000000001', '', '',
   now() + interval '10 days', 'scheduled', 'choice',
   'Question sans verrouillage propre ?',
   '[{"id":"x","label":"Xavier"},{"id":"y","label":"Yann"}]'::jsonb);

insert into public.contest_players
  (id, contest_id, organization_id, token_hash, first_name, accepted_terms)
values
  ('d0000000-0000-4000-8000-000000000041', 'd0000000-0000-4000-8000-000000000003',
   'd0000000-0000-4000-8000-000000000001', repeat('a', 64), 'Anna', true),
  ('d0000000-0000-4000-8000-000000000042', 'd0000000-0000-4000-8000-000000000003',
   'd0000000-0000-4000-8000-000000000001', repeat('b', 64), 'Bilal', true),
  ('d0000000-0000-4000-8000-000000000043', 'd0000000-0000-4000-8000-000000000003',
   'd0000000-0000-4000-8000-000000000001', repeat('c', 64), 'Carla', true);

-- Repli sur default_locks_at : passé → fermé, futur → ouvert. Prouve
-- que default_locks_at l'emporte sur kickoff_at (à 10 jours) pour les
-- types GÉNÉRIQUES — pendant exact du test (a-bis) qui prouve qu'il ne
-- s'applique jamais à une question de score.
update public.contests set default_locks_at = now() - interval '1 hour'
 where id = 'd0000000-0000-4000-8000-000000000003';
select is(
  public.submit_contest_answer('d0000000-0000-4000-8000-000000000003',
    'd0000000-0000-4000-8000-000000000034',
    'd0000000-0000-4000-8000-000000000041', '"x"'::jsonb),
  false,
  'repli default_locks_at : réponse refusée après le verrouillage de l''événement'
);
update public.contests set default_locks_at = now() + interval '5 days'
 where id = 'd0000000-0000-4000-8000-000000000003';
select is(
  public.submit_contest_answer('d0000000-0000-4000-8000-000000000003',
    'd0000000-0000-4000-8000-000000000034',
    'd0000000-0000-4000-8000-000000000041', '"x"'::jsonb),
  true,
  'repli default_locks_at : réponse acceptée avant le verrouillage de l''événement'
);

-- locks_at de la question l'emporte sur default_locks_at.
update public.contest_matches set locks_at = now() - interval '1 minute'
 where id = 'd0000000-0000-4000-8000-000000000034';
select is(
  public.submit_contest_answer('d0000000-0000-4000-8000-000000000003',
    'd0000000-0000-4000-8000-000000000034',
    'd0000000-0000-4000-8000-000000000042', '"y"'::jsonb),
  false,
  'locks_at de la question prime sur default_locks_at (encore ouvert)'
);
update public.contest_matches set locks_at = now() + interval '2 days'
 where id = 'd0000000-0000-4000-8000-000000000034';

-- Les deux familles ne se mélangent pas.
select is(
  public.submit_contest_prediction('d0000000-0000-4000-8000-000000000003',
    'd0000000-0000-4000-8000-000000000031',
    'd0000000-0000-4000-8000-000000000041', 1, 0),
  false, 'un score ne s''enregistre pas sur une question générique'
);
select is(
  public.submit_contest_answer('d0000000-0000-4000-8000-000000000002',
    'd0000000-0000-4000-8000-000000000012',
    'd0000000-0000-4000-8000-000000000021', '"a"'::jsonb),
  false,
  'une réponse générique ne s''enregistre pas sur une question de score encore ouverte'
);

-- ══════════════════════════════════════════════════════════════
-- (d) Validation de forme (serveur-autoritaire)
-- ══════════════════════════════════════════════════════════════
select is(
  public.submit_contest_answer('d0000000-0000-4000-8000-000000000003',
    'd0000000-0000-4000-8000-000000000031',
    'd0000000-0000-4000-8000-000000000041', '"zzz"'::jsonb),
  false, 'choice : identifiant hors des options refusé'
);
select is(
  public.submit_contest_answer('d0000000-0000-4000-8000-000000000003',
    'd0000000-0000-4000-8000-000000000032',
    'd0000000-0000-4000-8000-000000000041', '["a","a","b"]'::jsonb),
  false, 'ranking : doublon dans le classement refusé'
);
select is(
  public.submit_contest_answer('d0000000-0000-4000-8000-000000000003',
    'd0000000-0000-4000-8000-000000000032',
    'd0000000-0000-4000-8000-000000000041', '["a","b"]'::jsonb),
  false, 'ranking : longueur différente de ranking_size refusée'
);
select is(
  public.submit_contest_answer('d0000000-0000-4000-8000-000000000003',
    'd0000000-0000-4000-8000-000000000032',
    'd0000000-0000-4000-8000-000000000041', '["a","b","zzz"]'::jsonb),
  false, 'ranking : identifiant hors des options refusé'
);
select is(
  public.submit_contest_answer('d0000000-0000-4000-8000-000000000003',
    'd0000000-0000-4000-8000-000000000033',
    'd0000000-0000-4000-8000-000000000041', '"beaucoup"'::jsonb),
  false, 'number : réponse non numérique refusée'
);

-- Contraintes de table : une question mal formée n'entre pas en base.
select throws_ok(
  $$insert into public.contest_matches
      (contest_id, organization_id, home_name, away_name, kickoff_at,
       question_type, prompt, options)
    values ('d0000000-0000-4000-8000-000000000003',
            'd0000000-0000-4000-8000-000000000001', '', '', now() + interval '1 day',
            'choice', 'Une seule option ?', '[{"id":"a","label":"Alpha"}]'::jsonb)$$,
  '23514', null,
  'choice : au moins deux options exigées par le CHECK'
);
select throws_ok(
  $$insert into public.contest_matches
      (contest_id, organization_id, home_name, away_name, kickoff_at,
       question_type, prompt, options, ranking_size)
    values ('d0000000-0000-4000-8000-000000000003',
            'd0000000-0000-4000-8000-000000000001', '', '', now() + interval '1 day',
            'ranking', 'Top 5 parmi 2 ?',
            '[{"id":"a","label":"Alpha"},{"id":"b","label":"Beta"}]'::jsonb, 5)$$,
  '23514', null,
  'ranking : ranking_size ne peut pas dépasser le nombre d''options'
);
select throws_ok(
  $$insert into public.contest_matches
      (contest_id, organization_id, home_name, away_name, kickoff_at,
       question_type, prompt)
    values ('d0000000-0000-4000-8000-000000000003',
            'd0000000-0000-4000-8000-000000000001', '', '', now() + interval '1 day',
            'choice', 'Sans options ?')$$,
  '23514', null,
  'choice : options obligatoires'
);
select throws_ok(
  $$insert into public.contest_matches
      (contest_id, organization_id, home_name, away_name, kickoff_at,
       question_type, options)
    values ('d0000000-0000-4000-8000-000000000003',
            'd0000000-0000-4000-8000-000000000001', 'A', 'B', now() + interval '1 day',
            'score', '[{"id":"a","label":"Alpha"},{"id":"b","label":"Beta"}]'::jsonb)$$,
  '23514', null,
  'score : aucun champ générique toléré (le score fait autorité)'
);
select throws_ok(
  $$insert into public.contest_matches
      (contest_id, organization_id, home_name, away_name, kickoff_at)
    values ('d0000000-0000-4000-8000-000000000003',
            'd0000000-0000-4000-8000-000000000001', '', '', now() + interval '1 day')$$,
  '23514', null,
  'score : les noms d''équipes restent obligatoires (règle 00023 conservée)'
);

-- ══════════════════════════════════════════════════════════════
-- (c) Barème générique : choice, ranking (dont partiel), number
--     (dont tolérance)
-- ══════════════════════════════════════════════════════════════
-- Paliers explicitement distincts des défauts : le test prouve que les
-- clés jsonb sont bien lues.
select set_config('request.jwt.claims',
  '{"role":"authenticated","sub":"d0000000-0000-4000-8000-0000000000aa"}', true);

select throws_ok(
  $$select public.update_contest_generic_scoring('d0000000-0000-4000-8000-000000000001','d0000000-0000-4000-8000-000000000003', '{"exact": 9}'::jsonb)$$,
  'P0001', 'invalid scoring key',
  'exact/diff/winner restent du ressort de update_contest_scoring'
);
select throws_ok(
  $$select public.update_contest_generic_scoring('d0000000-0000-4000-8000-000000000001','d0000000-0000-4000-8000-000000000003', '{"choice": "trois"}'::jsonb)$$,
  'P0001', 'invalid scoring',
  'un palier non numérique est refusé'
);
select is(
  public.update_contest_generic_scoring('d0000000-0000-4000-8000-000000000001',
    'd0000000-0000-4000-8000-000000000003',
    '{"choice":4,"ranking_exact":6,"ranking_partial":2,"number_exact":7,"number_close":3,"number_tolerance":3}'::jsonb,
    'barème initial de l''événement générique'),
  true, 'paliers génériques enregistrés'
);
select results_eq(
  $$select scoring->>'exact', scoring->>'choice', scoring->>'number_tolerance'
      from public.contests where id = 'd0000000-0000-4000-8000-000000000003'$$,
  $$values ('3', '4', '3')$$,
  'la fusion préserve exact/diff/winner et ajoute les paliers génériques'
);

select set_config('request.jwt.claims', '{"role":"service_role"}', true);

-- Réponses des trois joueurs.
-- CHOICE (bonne réponse « b ») : Anna juste, Bilal faux.
select is(
  public.submit_contest_answer('d0000000-0000-4000-8000-000000000003',
    'd0000000-0000-4000-8000-000000000031',
    'd0000000-0000-4000-8000-000000000041', '"b"'::jsonb),
  true, 'choice : réponse valide acceptée'
);
select is(
  public.submit_contest_answer('d0000000-0000-4000-8000-000000000003',
    'd0000000-0000-4000-8000-000000000031',
    'd0000000-0000-4000-8000-000000000042', '"a"'::jsonb),
  true, 'choice : seconde réponse acceptée'
);

-- RANKING (podium juste ["a","b","c"]) : Anna parfaite, Bilal 1 bien
-- placé (a), Carla 1 bien placé (b).
select is(
  public.submit_contest_answer('d0000000-0000-4000-8000-000000000003',
    'd0000000-0000-4000-8000-000000000032',
    'd0000000-0000-4000-8000-000000000041', '["a","b","c"]'::jsonb),
  true, 'ranking : classement valide accepté'
);
select is(
  public.submit_contest_answer('d0000000-0000-4000-8000-000000000003',
    'd0000000-0000-4000-8000-000000000032',
    'd0000000-0000-4000-8000-000000000042', '["a","c","b"]'::jsonb),
  true, 'ranking : classement partiellement juste accepté'
);
select is(
  public.submit_contest_answer('d0000000-0000-4000-8000-000000000003',
    'd0000000-0000-4000-8000-000000000032',
    'd0000000-0000-4000-8000-000000000043', '["d","b","a"]'::jsonb),
  true, 'ranking : troisième classement accepté'
);

-- NUMBER (bonne réponse 42, tolérance 3) : Anna exacte, Bilal à 2
-- (dans la tolérance), Carla à 8 (hors tolérance).
select is(
  public.submit_contest_answer('d0000000-0000-4000-8000-000000000003',
    'd0000000-0000-4000-8000-000000000033',
    'd0000000-0000-4000-8000-000000000041', '42'::jsonb),
  true, 'number : estimation exacte acceptée'
);
select is(
  public.submit_contest_answer('d0000000-0000-4000-8000-000000000003',
    'd0000000-0000-4000-8000-000000000033',
    'd0000000-0000-4000-8000-000000000042', '44'::jsonb),
  true, 'number : estimation proche acceptée'
);
select is(
  public.submit_contest_answer('d0000000-0000-4000-8000-000000000003',
    'd0000000-0000-4000-8000-000000000033',
    'd0000000-0000-4000-8000-000000000043', '50'::jsonb),
  true, 'number : estimation éloignée acceptée'
);

-- Le résultat ne se saisit pas avant l'échéance.
select throws_ok(
  $$select public.set_contest_question_result('d0000000-0000-4000-8000-000000000001','d0000000-0000-4000-8000-000000000031', '"b"'::jsonb)$$,
  'P0001', 'question not locked',
  'aucun résultat avant le verrouillage de la question'
);

update public.contest_matches set locks_at = now() - interval '1 minute'
 where id in ('d0000000-0000-4000-8000-000000000031',
              'd0000000-0000-4000-8000-000000000032',
              'd0000000-0000-4000-8000-000000000033');

-- Un résultat mal formé est refusé (l'oracle vit en base).
select throws_ok(
  $$select public.set_contest_question_result('d0000000-0000-4000-8000-000000000001','d0000000-0000-4000-8000-000000000031', '"zzz"'::jsonb)$$,
  'P0001', 'invalid answer',
  'résultat hors des options refusé'
);
select throws_ok(
  $$select public.set_contest_question_result('d0000000-0000-4000-8000-000000000001','d0000000-0000-4000-8000-000000000011', '"b"'::jsonb)$$,
  'P0001', 'invalid question type',
  'une question de score n''accepte pas de résultat générique'
);
select throws_ok(
  $$select public.set_contest_match_result('d0000000-0000-4000-8000-000000000001','d0000000-0000-4000-8000-000000000031', 2, 1)$$,
  'P0001', 'invalid question type',
  'une question générique n''accepte pas de score'
);

select is(
  public.set_contest_question_result('d0000000-0000-4000-8000-000000000001',
    'd0000000-0000-4000-8000-000000000031', '"b"'::jsonb),
  true, 'résultat choice enregistré'
);
select is(
  public.set_contest_question_result('d0000000-0000-4000-8000-000000000001',
    'd0000000-0000-4000-8000-000000000032', '["a","b","c"]'::jsonb),
  true, 'résultat ranking enregistré'
);
select is(
  public.set_contest_question_result('d0000000-0000-4000-8000-000000000001',
    'd0000000-0000-4000-8000-000000000033', '42'::jsonb),
  true, 'résultat number enregistré'
);

select results_eq(
  $$select pl.first_name, pr.points
      from public.contest_predictions pr
      join public.contest_players pl on pl.id = pr.player_id
     where pr.match_id = 'd0000000-0000-4000-8000-000000000031'
     order by pl.first_name$$,
  $$values ('Anna', 4), ('Bilal', 0)$$,
  'choice : palier « choice » (4) à la bonne option, 0 sinon'
);
select results_eq(
  $$select pl.first_name, pr.points
      from public.contest_predictions pr
      join public.contest_players pl on pl.id = pr.player_id
     where pr.match_id = 'd0000000-0000-4000-8000-000000000032'
     order by pl.first_name$$,
  $$values ('Anna', 6), ('Bilal', 2), ('Carla', 2)$$,
  'ranking : ordre complet = 6 ; sinon 2 par élément bien placé (1 chacun)'
);
select results_eq(
  $$select pl.first_name, pr.points
      from public.contest_predictions pr
      join public.contest_players pl on pl.id = pr.player_id
     where pr.match_id = 'd0000000-0000-4000-8000-000000000033'
     order by pl.first_name$$,
  $$values ('Anna', 7), ('Bilal', 3), ('Carla', 0)$$,
  'number : exact 7, écart 2 dans la tolérance 3 → 3, écart 8 → 0'
);

-- Une question dont le résultat n'est pas connu ne rapporte rien.
select is(
  (select points from public.contest_predictions
    where match_id = 'd0000000-0000-4000-8000-000000000034'
      and player_id = 'd0000000-0000-4000-8000-000000000041'),
  null,
  'sans résultat connu, aucune question ne rapporte de points'
);

-- Le classement agrège les points génériques comme les autres.
select results_eq(
  $$select first_name, total_points
      from public.contest_leaderboard('d0000000-0000-4000-8000-000000000003')
     order by first_name$$,
  $$values ('Anna', 17), ('Bilal', 5), ('Carla', 2)$$,
  'le classement cumule indifféremment score et types génériques'
);

-- Le recalcul suit un changement de barème générique (motif exigé :
-- l'événement est verrouillé depuis le premier pronostic).
select set_config('request.jwt.claims',
  '{"role":"authenticated","sub":"d0000000-0000-4000-8000-0000000000aa"}', true);
select is(
  public.update_contest_generic_scoring('d0000000-0000-4000-8000-000000000001',
    'd0000000-0000-4000-8000-000000000003', '{"choice": 10}'::jsonb,
    'harmonisation du palier choix après réclamation'),
  true, 'palier choice corrigé avec motif journalisé'
);
select is(
  (select points from public.contest_predictions
    where match_id = 'd0000000-0000-4000-8000-000000000031'
      and player_id = 'd0000000-0000-4000-8000-000000000041'),
  10,
  'le changement de palier recalcule immédiatement les questions génériques'
);
select is(
  (select metadata->>'reason' from public.audit_logs
    where action = 'contest.scoring.generic.update'
    order by created_at desc limit 1),
  'harmonisation du palier choix après réclamation',
  'la correction du barème générique est auditée avec son motif'
);

-- Un barème score ne détruit plus les paliers génériques (fusion).
select is(
  public.update_contest_scoring('d0000000-0000-4000-8000-000000000001',
    'd0000000-0000-4000-8000-000000000003', 5, 3, 1,
    'alignement du barème score sur les autres événements'),
  true, 'barème score modifié avec motif'
);
select results_eq(
  $$select scoring->>'exact', scoring->>'choice'
      from public.contests where id = 'd0000000-0000-4000-8000-000000000003'$$,
  $$values ('5', '10')$$,
  'update_contest_scoring fusionne : les paliers génériques survivent'
);

-- ══════════════════════════════════════════════════════════════
-- (e) Réglages de l'événement : événement REPORTÉ
-- ══════════════════════════════════════════════════════════════
-- (session : propriétaire authentifié, posée juste au-dessus)

select throws_ok(
  $$select public.update_contest_event_settings('d0000000-0000-4000-8000-000000000001','d0000000-0000-4000-8000-000000000003', null::text, timestamptz '2030-01-01 12:00:00+00')$$,
  'P0001', 'locked: reason required',
  'déplacer le verrouillage d''un championnat verrouillé exige un motif'
);
select throws_ok(
  $$select public.update_contest_event_settings('d0000000-0000-4000-8000-000000000001','d0000000-0000-4000-8000-000000000003', 'election', timestamptz '2030-01-01 12:00:00+00', 'cérémonie reportée par l''organisateur')$$,
  'P0001', 'locked: event kind frozen',
  'le modèle d''événement est figé dès le verrou'
);
select throws_ok(
  $$select public.update_contest_event_settings('d0000000-0000-4000-8000-000000000001','d0000000-0000-4000-8000-000000000003', 'CEREMONIE', timestamptz '2030-01-01 12:00:00+00', 'cérémonie reportée par l''organisateur')$$,
  'P0001', 'invalid event kind',
  'le modèle d''événement respecte le format de la colonne'
);
select throws_ok(
  $$select public.update_contest_event_settings('d0000000-0000-4000-8000-00000000ffff','d0000000-0000-4000-8000-000000000003', null::text, null::timestamptz, 'tentative hors organisation')$$,
  'P0001', 'not authorized',
  'un éditeur d''une autre organisation est refusé'
);
select is(
  public.update_contest_event_settings('d0000000-0000-4000-8000-000000000001',
    'd0000000-0000-4000-8000-0000000000ff', null::text, null::timestamptz,
    'championnat inexistant pour ce test'),
  false, 'championnat inconnu de l''organisation : faux, pas d''oracle'
);

-- Report accepté avec motif ; le modèle d'événement est préservé quand
-- p_event_kind vaut null.
select is(
  public.update_contest_event_settings('d0000000-0000-4000-8000-000000000001',
    'd0000000-0000-4000-8000-000000000003', null::text,
    timestamptz '2030-01-01 12:00:00+00',
    'cérémonie reportée par l''organisateur'),
  true, 'report du verrouillage par défaut accepté avec motif'
);
select results_eq(
  $$select event_kind, default_locks_at
      from public.contests where id = 'd0000000-0000-4000-8000-000000000003'$$,
  $$values ('ceremony', timestamptz '2030-01-01 12:00:00+00')$$,
  'default_locks_at déplacé, event_kind inchangé (p_event_kind null)'
);
select is(
  (select metadata->>'reason' from public.audit_logs
    where action = 'contest.event.update'
    order by created_at desc limit 1),
  'cérémonie reportée par l''organisateur',
  'le report est journalisé avec son motif'
);

-- Effacement : le verrouillage retombe sur locks_at puis kickoff_at.
select is(
  public.update_contest_event_settings('d0000000-0000-4000-8000-000000000001',
    'd0000000-0000-4000-8000-000000000003', null::text, null::timestamptz,
    'retrait du verrouillage global de l''événement'),
  true, 'effacement de default_locks_at accepté'
);
select ok(
  (select default_locks_at is null from public.contests
    where id = 'd0000000-0000-4000-8000-000000000003'),
  'default_locks_at effaçable (passage à null)'
);

-- Le verrouillage EFFECTIF suit la nouvelle valeur : la question 34 n'a
-- plus de locks_at propre, c'est donc default_locks_at qui tranche.
update public.contest_matches set locks_at = null
 where id = 'd0000000-0000-4000-8000-000000000034';

select is(
  public.update_contest_event_settings('d0000000-0000-4000-8000-000000000001',
    'd0000000-0000-4000-8000-000000000003', null::text,
    now() - interval '1 hour',
    'clôture anticipée des pronostics de l''événement'),
  true, 'verrouillage avancé dans le passé accepté avec motif'
);
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select is(
  public.submit_contest_answer('d0000000-0000-4000-8000-000000000003',
    'd0000000-0000-4000-8000-000000000034',
    'd0000000-0000-4000-8000-000000000043', '"y"'::jsonb),
  false,
  'la RPC de réglages ferme réellement les pronostics de la question sans locks_at'
);

select set_config('request.jwt.claims',
  '{"role":"authenticated","sub":"d0000000-0000-4000-8000-0000000000aa"}', true);
select is(
  public.update_contest_event_settings('d0000000-0000-4000-8000-000000000001',
    'd0000000-0000-4000-8000-000000000003', null::text,
    now() + interval '3 days',
    'report confirmé par l''organisateur de l''événement'),
  true, 'nouveau report vers le futur accepté avec motif'
);
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select is(
  public.submit_contest_answer('d0000000-0000-4000-8000-000000000003',
    'd0000000-0000-4000-8000-000000000034',
    'd0000000-0000-4000-8000-000000000043', '"y"'::jsonb),
  true,
  'la RPC de réglages rouvre réellement les pronostics selon la nouvelle date'
);

-- ══════════════════════════════════════════════════════════════
-- Gardes d'accès
-- ══════════════════════════════════════════════════════════════
select ok(
  has_function_privilege('service_role',
    'public.submit_contest_answer(uuid,uuid,uuid,jsonb)', 'EXECUTE'),
  'seul le serveur enregistre une réponse publique'
);
select ok(
  not has_function_privilege('authenticated',
    'public.submit_contest_answer(uuid,uuid,uuid,jsonb)', 'EXECUTE'),
  'un commerçant ne peut pas répondre à la place d''un joueur'
);
select ok(
  not has_function_privilege('anon',
    'public.set_contest_question_result(uuid,uuid,jsonb)', 'EXECUTE'),
  'un anonyme ne saisit pas de résultat'
);
select ok(
  not has_function_privilege('authenticated',
    'public.contest_generic_points(jsonb,text,jsonb,jsonb)', 'EXECUTE'),
  'le barème générique n''est pas exposé aux sessions commerçant'
);

select set_config('request.jwt.claims', '{"role":"anon"}', true);
select throws_ok(
  $$select public.set_contest_question_result('d0000000-0000-4000-8000-000000000001','d0000000-0000-4000-8000-000000000031', '"a"'::jsonb)$$,
  'P0001', 'not authorized',
  'un anonyme ne corrige pas un résultat'
);
select throws_ok(
  $$select public.update_contest_generic_scoring('d0000000-0000-4000-8000-000000000001','d0000000-0000-4000-8000-000000000003', '{"choice": 1}'::jsonb)$$,
  'P0001', 'not authorized',
  'un anonyme ne modifie pas le barème'
);
select throws_ok(
  $$select public.update_contest_event_settings('d0000000-0000-4000-8000-000000000001','d0000000-0000-4000-8000-000000000003', null::text, null::timestamptz, 'tentative anonyme de report')$$,
  'P0001', 'not authorized',
  'un anonyme ne déplace pas la date de verrouillage'
);
select ok(
  not has_function_privilege('anon',
    'public.update_contest_event_settings(uuid,uuid,text,timestamptz,text)',
    'EXECUTE'),
  'la RPC de réglages d''événement n''est pas exposée à anon'
);
select set_config('request.jwt.claims', '{"role":"service_role"}', true);

select finish();
rollback;
