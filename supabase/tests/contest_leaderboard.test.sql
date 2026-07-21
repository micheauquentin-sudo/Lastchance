-- ============================================================
-- Classement Pronostics en SQL — comportement réel des RPC
-- contest_leaderboard / contest_player_rank / claim_fixture_refresh,
-- exécutées sur une base migrée vierge avec des fixtures locales.
-- Référence métier : rankPlayers() (rang « competition » 1, 2, 2, 4)
-- et l'ancien agrégat JavaScript (0 point pour un inscrit sans
-- pronostic noté, exclusion sans consentement).
-- ============================================================
begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

-- Les RPC exigent le service role (les pages publiques passent par le
-- client admin) : on pose la claim JWT correspondante pour la session.
select set_config('request.jwt.claims', '{"role":"service_role"}', true);

-- ── Fixtures : un championnat, 5 inscrits, 2 matchs notés ────
insert into public.organizations (id, name, slug)
values ('c0000000-0000-4000-8000-000000000001', 'Test Classement', 'tap-classement');

insert into public.contests (id, organization_id, slug, name, competition_key, status)
values ('c0000000-0000-4000-8000-000000000002',
        'c0000000-0000-4000-8000-000000000001',
        'tap-classement', 'Championnat TAP', 'ligue1', 'active');

insert into public.contest_matches
  (id, contest_id, organization_id, home_name, away_name, kickoff_at, status, home_score, away_score)
values
  ('c0000000-0000-4000-8000-000000000011',
   'c0000000-0000-4000-8000-000000000002',
   'c0000000-0000-4000-8000-000000000001',
   'PSG', 'OM', now() - interval '2 days', 'finished', 2, 1),
  ('c0000000-0000-4000-8000-000000000012',
   'c0000000-0000-4000-8000-000000000002',
   'c0000000-0000-4000-8000-000000000001',
   'OL', 'OGCN', now() - interval '1 day', 'finished', 0, 0);

-- created_at explicites : l'ordre d'affichage des ex æquo est l'ordre
-- d'inscription (déterministe).
insert into public.contest_players
  (id, contest_id, organization_id, token_hash, first_name, accepted_terms, created_at)
values
  ('c0000000-0000-4000-8000-000000000021', 'c0000000-0000-4000-8000-000000000002',
   'c0000000-0000-4000-8000-000000000001', repeat('a', 64), 'Alice', true,  now() - interval '5 hours'),
  ('c0000000-0000-4000-8000-000000000022', 'c0000000-0000-4000-8000-000000000002',
   'c0000000-0000-4000-8000-000000000001', repeat('b', 64), 'Bruno', true,  now() - interval '4 hours'),
  ('c0000000-0000-4000-8000-000000000023', 'c0000000-0000-4000-8000-000000000002',
   'c0000000-0000-4000-8000-000000000001', repeat('c', 64), 'Chloé', true,  now() - interval '3 hours'),
  ('c0000000-0000-4000-8000-000000000024', 'c0000000-0000-4000-8000-000000000002',
   'c0000000-0000-4000-8000-000000000001', repeat('d', 64), 'David', true,  now() - interval '2 hours'),
  -- Sans consentement : jamais classé.
  ('c0000000-0000-4000-8000-000000000025', 'c0000000-0000-4000-8000-000000000002',
   'c0000000-0000-4000-8000-000000000001', repeat('e', 64), 'Edith', false, now() - interval '1 hour');

-- Alice : 3 (exact) + 2 (diff) = 5 pts · Bruno : 3 (exact) · Chloé : 3
-- (exact) · David : inscrit sans pronostic noté (0 pt, classé quand même).
insert into public.contest_predictions
  (contest_id, organization_id, match_id, player_id, home_score, away_score, points)
values
  ('c0000000-0000-4000-8000-000000000002', 'c0000000-0000-4000-8000-000000000001',
   'c0000000-0000-4000-8000-000000000011', 'c0000000-0000-4000-8000-000000000021', 2, 1, 3),
  ('c0000000-0000-4000-8000-000000000002', 'c0000000-0000-4000-8000-000000000001',
   'c0000000-0000-4000-8000-000000000012', 'c0000000-0000-4000-8000-000000000021', 1, 1, 2),
  ('c0000000-0000-4000-8000-000000000002', 'c0000000-0000-4000-8000-000000000001',
   'c0000000-0000-4000-8000-000000000011', 'c0000000-0000-4000-8000-000000000022', 2, 1, 3),
  ('c0000000-0000-4000-8000-000000000002', 'c0000000-0000-4000-8000-000000000001',
   'c0000000-0000-4000-8000-000000000012', 'c0000000-0000-4000-8000-000000000023', 0, 0, 3),
  -- Pronostic pas encore noté : n'entre ni dans les points ni dans
  -- prediction_count.
  ('c0000000-0000-4000-8000-000000000002', 'c0000000-0000-4000-8000-000000000001',
   'c0000000-0000-4000-8000-000000000011', 'c0000000-0000-4000-8000-000000000024', 4, 4, null);

-- ── Classement : ordre, rangs ex æquo, zéro point classé ─────
select results_eq(
  $$select first_name, total_points, rank
      from public.contest_leaderboard('c0000000-0000-4000-8000-000000000002')$$,
  $$values ('Alice', 5, 1::bigint), ('Bruno', 3, 2::bigint),
           ('Chloé', 3, 2::bigint), ('David', 0, 4::bigint)$$,
  'rangs competition (1, 2, 2, 4), ex æquo départagés à l''affichage par inscription'
);

select results_eq(
  $$select exact_count, prediction_count
      from public.contest_leaderboard('c0000000-0000-4000-8000-000000000002')
     where first_name = 'Alice'$$,
  $$values (1, 2)$$,
  'exact_count compte le palier « exact » du barème, prediction_count les pronostics notés'
);

select is(
  (select count(distinct total_players)
     from public.contest_leaderboard('c0000000-0000-4000-8000-000000000002')),
  1::bigint,
  'total_players identique sur chaque ligne'
);

select is(
  (select max(total_players)
     from public.contest_leaderboard('c0000000-0000-4000-8000-000000000002')),
  4::bigint,
  'les inscrits sans consentement ne sont pas comptés'
);

select results_eq(
  $$select first_name
      from public.contest_leaderboard('c0000000-0000-4000-8000-000000000002', 2, 1)$$,
  $$values ('Bruno'), ('Chloé')$$,
  'pagination limit/offset stable'
);

select is(
  (select count(*)
     from public.contest_leaderboard('c0000000-0000-4000-8000-000000000099')),
  0::bigint,
  'championnat inconnu : zéro ligne'
);

-- ── Position d'un joueur précis ──────────────────────────────
select results_eq(
  $$select first_name, total_points, rank, total_players
      from public.contest_player_rank('c0000000-0000-4000-8000-000000000002',
                                      'c0000000-0000-4000-8000-000000000024')$$,
  $$values ('David', 0, 4::bigint, 4::bigint)$$,
  'contest_player_rank retrouve la ligne du joueur avec son rang global'
);

-- ── Barème personnalisé : exact_count suit contests.scoring ──
update public.contests
   set scoring = '{"exact": 5, "diff": 2, "winner": 1}'::jsonb
 where id = 'c0000000-0000-4000-8000-000000000002';

select results_eq(
  $$select exact_count
      from public.contest_leaderboard('c0000000-0000-4000-8000-000000000002')
     where first_name = 'Alice'$$,
  $$values (0)$$,
  'exact_count lit le palier exact du championnat (5 ≠ points historiques à 3)'
);

-- ── Verrou de rafraîchissement par ligue ─────────────────────
select is(
  public.claim_fixture_refresh('4334', 90),
  true,
  'première demande : verrou accordé (ligne de cache créée)'
);
select is(
  public.claim_fixture_refresh('4334', 90),
  false,
  'verrou encore chaud : demande concurrente refusée'
);
update public.fixture_cache
   set refresh_claimed_at = now() - interval '10 minutes'
 where league_id = '4334';
select is(
  public.claim_fixture_refresh('4334', 90),
  true,
  'verrou expiré (TTL dépassé) : reprise par un nouveau rafraîchisseur'
);
update public.fixture_cache
   set refresh_claimed_at = null
 where league_id = '4334';
select is(
  public.claim_fixture_refresh('4334', 90),
  true,
  'verrou relâché à l''écriture du payload : nouveau cycle accordé'
);

-- ── Gardes d'accès (comportement, pas seulement les grants) ──
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select throws_ok(
  $$select * from public.contest_leaderboard('c0000000-0000-4000-8000-000000000002')$$,
  'not authorized',
  'un anonyme ne lit pas le classement (emails inclus dans la réponse)'
);
select throws_ok(
  $$select * from public.contest_player_rank('c0000000-0000-4000-8000-000000000002',
                                             'c0000000-0000-4000-8000-000000000024')$$,
  'not authorized',
  'la position joueur est réservée au serveur'
);
select throws_ok(
  $$select public.claim_fixture_refresh('4334', 90)$$,
  'not authorized',
  'le verrou de rafraîchissement est réservé au serveur'
);
select set_config('request.jwt.claims', '{"role":"service_role"}', true);

select finish();
rollback;
