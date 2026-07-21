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

-- ── Classement : ordre, départage par nb d'exacts, zéro point classé ──
-- Bruno (1 exact) passe devant Chloé (1 exact aussi)… non : à points et
-- exacts égaux ils restent ex æquo (rang partagé) tant que rien d'autre
-- ne les sépare — la politique complète est éprouvée plus bas.
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

-- ══════════════════════════════════════════════════════════════
-- Règles de compétition (audit #5) : politique d'ex æquo complète,
-- gel du règlement, clôture avec tirage auditable et récompenses.
-- ══════════════════════════════════════════════════════════════

-- Propriétaire fixture : les RPC de règlement exigent un membre réel.
insert into auth.users (id, aud, role, email, encrypted_password, created_at, updated_at)
values ('c0000000-0000-4000-8000-0000000000aa', 'authenticated', 'authenticated', 'owner@tap.local', '', now(), now());
insert into public.organization_members (organization_id, user_id, role)
values ('c0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-0000000000aa', 'owner');

-- Championnat « départage » : 4 joueurs à 6 points, séparés par la
-- chaîne exacts > écarts > question subsidiaire > tirage.
insert into public.contests (id, organization_id, slug, name, competition_key, status, rewards, tiebreaker_question)
values ('c0000000-0000-4000-8000-000000000003',
        'c0000000-0000-4000-8000-000000000001',
        'tap-departage', 'Départage TAP', 'custom', 'active',
        '[{"from":1,"to":3,"label":"Lot du podium"}]'::jsonb,
        'Total de buts de la compétition ?');

insert into public.contest_matches
  (id, contest_id, organization_id, home_name, away_name, kickoff_at, status, home_score, away_score)
values
  ('c0000000-0000-4000-8000-000000000031', 'c0000000-0000-4000-8000-000000000003',
   'c0000000-0000-4000-8000-000000000001', 'A', 'B', now() - interval '3 days', 'finished', 1, 0),
  ('c0000000-0000-4000-8000-000000000032', 'c0000000-0000-4000-8000-000000000003',
   'c0000000-0000-4000-8000-000000000001', 'C', 'D', now() - interval '2 days', 'finished', 2, 2),
  ('c0000000-0000-4000-8000-000000000033', 'c0000000-0000-4000-8000-000000000003',
   'c0000000-0000-4000-8000-000000000001', 'E', 'F', now() - interval '1 day', 'finished', 3, 1);

insert into public.contest_players
  (id, contest_id, organization_id, token_hash, first_name, accepted_terms, tiebreaker_guess, created_at)
values
  ('c0000000-0000-4000-8000-000000000041', 'c0000000-0000-4000-8000-000000000003',
   'c0000000-0000-4000-8000-000000000001', repeat('1', 64), 'Paul',    true, null, now() - interval '9 hours'),
  ('c0000000-0000-4000-8000-000000000042', 'c0000000-0000-4000-8000-000000000003',
   'c0000000-0000-4000-8000-000000000001', repeat('2', 64), 'Quentin', true, 90,   now() - interval '8 hours'),
  ('c0000000-0000-4000-8000-000000000043', 'c0000000-0000-4000-8000-000000000003',
   'c0000000-0000-4000-8000-000000000001', repeat('3', 64), 'Rachel',  true, 95,   now() - interval '7 hours'),
  ('c0000000-0000-4000-8000-000000000044', 'c0000000-0000-4000-8000-000000000003',
   'c0000000-0000-4000-8000-000000000001', repeat('4', 64), 'Sam',     true, 105,  now() - interval '6 hours');

-- Points posés littéralement (barème 3/2/1) :
-- Paul 3+3=6 (2 exacts) · Quentin 3+2+1=6 (1 exact, 1 écart, réponse 90)
-- Rachel 3+2+1=6 (réponse 95) · Sam 3+2+1=6 (réponse 105).
insert into public.contest_predictions
  (contest_id, organization_id, match_id, player_id, home_score, away_score, points)
select 'c0000000-0000-4000-8000-000000000003', 'c0000000-0000-4000-8000-000000000001',
       m, p, 0, 0, pts
from (values
  ('c0000000-0000-4000-8000-000000000031'::uuid, 'c0000000-0000-4000-8000-000000000041'::uuid, 3),
  ('c0000000-0000-4000-8000-000000000032'::uuid, 'c0000000-0000-4000-8000-000000000041'::uuid, 3),
  ('c0000000-0000-4000-8000-000000000031'::uuid, 'c0000000-0000-4000-8000-000000000042'::uuid, 3),
  ('c0000000-0000-4000-8000-000000000032'::uuid, 'c0000000-0000-4000-8000-000000000042'::uuid, 2),
  ('c0000000-0000-4000-8000-000000000033'::uuid, 'c0000000-0000-4000-8000-000000000042'::uuid, 1),
  ('c0000000-0000-4000-8000-000000000031'::uuid, 'c0000000-0000-4000-8000-000000000043'::uuid, 3),
  ('c0000000-0000-4000-8000-000000000032'::uuid, 'c0000000-0000-4000-8000-000000000043'::uuid, 2),
  ('c0000000-0000-4000-8000-000000000033'::uuid, 'c0000000-0000-4000-8000-000000000043'::uuid, 1),
  ('c0000000-0000-4000-8000-000000000031'::uuid, 'c0000000-0000-4000-8000-000000000044'::uuid, 3),
  ('c0000000-0000-4000-8000-000000000032'::uuid, 'c0000000-0000-4000-8000-000000000044'::uuid, 2),
  ('c0000000-0000-4000-8000-000000000033'::uuid, 'c0000000-0000-4000-8000-000000000044'::uuid, 1)
) as v(m, p, pts);

update public.contests set tiebreaker_answer = 100
 where id = 'c0000000-0000-4000-8000-000000000003';

-- ── Chaîne de départage en direct ────────────────────────────
-- Paul devant (2 exacts) ; Rachel et Sam ex æquo (écart subsidiaire 5
-- tous les deux) ; Quentin derrière (écart 10).
select results_eq(
  $$select first_name, rank
      from public.contest_leaderboard('c0000000-0000-4000-8000-000000000003')$$,
  $$values ('Paul', 1::bigint), ('Rachel', 2::bigint),
           ('Sam', 2::bigint), ('Quentin', 4::bigint)$$,
  'départage : points, puis exacts, puis écarts, puis question subsidiaire'
);
select results_eq(
  $$select exact_count, diff_count
      from public.contest_leaderboard('c0000000-0000-4000-8000-000000000003')
     where first_name = 'Quentin'$$,
  $$values (1, 1)$$,
  'les compteurs de paliers (exacts, bons écarts) sont exposés'
);

-- ── Gel du règlement (propriétaire réel via claims JWT) ──────
select set_config('request.jwt.claims',
  '{"role":"authenticated","sub":"c0000000-0000-4000-8000-0000000000aa"}', true);

select throws_ok(
  $$select public.update_contest_scoring('c0000000-0000-4000-8000-000000000001','c0000000-0000-4000-8000-000000000002', 4, 2, 1)$$,
  'P0001', 'locked: reason required',
  'barème verrouillé dès le premier pronostic : motif exigé'
);
select is(
  public.update_contest_scoring('c0000000-0000-4000-8000-000000000001',
    'c0000000-0000-4000-8000-000000000002', 4, 2, 1,
    'harmonisation du barème après réclamation'),
  true, 'correction exceptionnelle du barème acceptée avec motif'
);
select is(
  (select metadata->>'reason' from public.audit_logs
    where action = 'contest.scoring.update'
    order by created_at desc limit 1),
  'harmonisation du barème après réclamation',
  'le motif de la correction est journalisé'
);
select throws_ok(
  $$select public.update_contest_scoring('c0000000-0000-4000-8000-000000000001','c0000000-0000-4000-8000-000000000002', 3, 3, 1, 'paliers non décroissants pour test')$$,
  'P0001', 'scoring tiers must be strictly decreasing',
  'les paliers du barème restent strictement décroissants'
);
select throws_ok(
  $$select public.update_contest_rewards('c0000000-0000-4000-8000-000000000001','c0000000-0000-4000-8000-000000000002', '[{"from":1,"to":1,"label":"Nouveau lot"}]'::jsonb)$$,
  'P0001', 'locked: reason required',
  'récompenses verrouillées : motif exigé'
);
select is(
  public.update_contest_rewards('c0000000-0000-4000-8000-000000000001',
    'c0000000-0000-4000-8000-000000000002',
    '[{"from":1,"to":1,"label":"Nouveau lot"}]'::jsonb,
    'dotation revue avec le partenaire'),
  true, 'récompenses modifiées avec motif journalisé'
);
select throws_ok(
  $$select public.update_contest_tiebreaker('c0000000-0000-4000-8000-000000000001','c0000000-0000-4000-8000-000000000002', 'Question posée après coup ?')$$,
  'P0001', 'locked: question frozen',
  'la question subsidiaire ne change plus une fois le jeu verrouillé'
);

-- Transitions de statut contrôlées.
select is(
  public.set_contest_status('c0000000-0000-4000-8000-000000000001',
    'c0000000-0000-4000-8000-000000000002', 'finished'),
  true, 'clore un championnat actif est libre'
);
select throws_ok(
  $$select public.set_contest_status('c0000000-0000-4000-8000-000000000001','c0000000-0000-4000-8000-000000000002', 'active')$$,
  'P0001', 'locked: reason required',
  'rouvrir un championnat terminé exige un motif'
);
select is(
  public.set_contest_status('c0000000-0000-4000-8000-000000000001',
    'c0000000-0000-4000-8000-000000000002', 'active',
    'réouverture : dernier match reporté par la ligue'),
  true, 'réouverture motivée acceptée tant que rien n''est clôturé'
);

-- ── Clôture : palmarès figé, tirage auditable, récompenses ───
-- Un match encore programmé interdit la clôture.
insert into public.contests (id, organization_id, slug, name, competition_key, status)
values ('c0000000-0000-4000-8000-000000000005',
        'c0000000-0000-4000-8000-000000000001',
        'tap-pending', 'Match en attente TAP', 'custom', 'active');
insert into public.contest_matches
  (contest_id, organization_id, home_name, away_name, kickoff_at, status)
values ('c0000000-0000-4000-8000-000000000005',
        'c0000000-0000-4000-8000-000000000001', 'X', 'Y',
        now() + interval '2 days', 'scheduled');
select throws_ok(
  $$select public.finalize_contest('c0000000-0000-4000-8000-000000000001','c0000000-0000-4000-8000-000000000005')$$,
  'P0001', 'matches pending',
  'impossible de clôturer avec un match non joué'
);

select is(
  public.finalize_contest('c0000000-0000-4000-8000-000000000001',
    'c0000000-0000-4000-8000-000000000003', 100),
  '{"players":4,"awards":3,"draws":2}'::jsonb,
  'clôture : 4 classés, 3 lots (rangs 1-3), 2 ex æquo départagés par tirage'
);

-- Palmarès : rangs uniques, tirage tracé sur les seuls ex æquo.
select results_eq(
  $$select rank from public.contest_final_standings
     where contest_id = 'c0000000-0000-4000-8000-000000000003' order by rank$$,
  $$values (1), (2), (3), (4)$$,
  'le palmarès attribue un rang unique à chaque joueur'
);
select results_eq(
  $$select s.rank from public.contest_final_standings s
     where s.contest_id = 'c0000000-0000-4000-8000-000000000003'
       and s.player_id = 'c0000000-0000-4000-8000-000000000041'$$,
  $$values (1)$$,
  'Paul finit premier (2 scores exacts)'
);
select results_eq(
  $$select array_agg(s.rank order by s.rank)
      from public.contest_final_standings s
     where s.contest_id = 'c0000000-0000-4000-8000-000000000003'
       and s.player_id in ('c0000000-0000-4000-8000-000000000043',
                           'c0000000-0000-4000-8000-000000000044')$$,
  $$values (array[2, 3])$$,
  'Rachel et Sam se partagent les rangs 2 et 3 via le tirage déterministe'
);
select is(
  (select count(*) from public.contest_final_standings
    where contest_id = 'c0000000-0000-4000-8000-000000000003'
      and draw_applied),
  2::bigint,
  'le recours au tirage est tracé sur les deux seuls ex æquo'
);

-- Récompenses : un joueur par rang, code de retrait au bon format.
select is(
  (select count(*) from public.contest_awards
    where contest_id = 'c0000000-0000-4000-8000-000000000003'),
  3::bigint, 'trois lots attribués (tranche 1-3 du règlement)'
);
select is(
  (select bool_and(code ~ '^PRONO-[A-HJ-NP-Z2-9]{8}$' and status = 'pending')
     from public.contest_awards
    where contest_id = 'c0000000-0000-4000-8000-000000000003'),
  true, 'chaque lot porte un code de retrait sans caractères ambigus'
);

-- Le classement public lit désormais la photographie (rangs uniques).
select results_eq(
  $$select rank from public.contest_leaderboard('c0000000-0000-4000-8000-000000000003')$$,
  $$values (1::bigint), (2::bigint), (3::bigint), (4::bigint)$$,
  'après clôture, la RPC sert le palmarès figé'
);

-- Plus rien ne bouge après la clôture.
select throws_ok(
  $$select public.finalize_contest('c0000000-0000-4000-8000-000000000001','c0000000-0000-4000-8000-000000000003')$$,
  'P0001', 'contest finalized', 'une clôture ne se rejoue pas'
);
select throws_ok(
  $$select public.update_contest_scoring('c0000000-0000-4000-8000-000000000001','c0000000-0000-4000-8000-000000000003', 5, 3, 1, 'tentative post-clôture avec motif')$$,
  'P0001', 'contest finalized', 'le barème est figé à jamais après clôture'
);
select throws_ok(
  $$select public.set_contest_status('c0000000-0000-4000-8000-000000000001','c0000000-0000-4000-8000-000000000003', 'active', 'tentative de réouverture post-clôture')$$,
  'P0001', 'contest finalized', 'un championnat clôturé ne peut pas être rouvert'
);

-- Cycle de vie d'une récompense : remise, puis plus aucun retour.
select is(
  public.set_contest_award_status('c0000000-0000-4000-8000-000000000001',
    (select id from public.contest_awards
      where contest_id = 'c0000000-0000-4000-8000-000000000003' and rank = 1),
    'delivered'),
  true, 'une récompense se marque remise'
);
select throws_ok(
  format($f$select public.set_contest_award_status('c0000000-0000-4000-8000-000000000001','%s','delivered')$f$,
    (select id from public.contest_awards
      where contest_id = 'c0000000-0000-4000-8000-000000000003' and rank = 1)),
  'P0001', 'award already settled', 'une récompense réglée ne bouge plus'
);
select throws_ok(
  format($f$select public.set_contest_award_status('c0000000-0000-4000-8000-000000000001','%s','cancelled')$f$,
    (select id from public.contest_awards
      where contest_id = 'c0000000-0000-4000-8000-000000000003' and rank = 2)),
  'P0001', 'locked: reason required', 'annuler un lot exige un motif'
);
select is(
  public.set_contest_award_status('c0000000-0000-4000-8000-000000000001',
    (select id from public.contest_awards
      where contest_id = 'c0000000-0000-4000-8000-000000000003' and rank = 2),
    'cancelled', 'gagnant injoignable après trois relances'),
  true, 'annulation motivée acceptée'
);
select results_eq(
  $$select count(*) from public.audit_logs
     where action in ('contest.award.deliver', 'contest.award.cancel')$$,
  array[2::bigint], 'remise et annulation de lots sont auditées'
);

-- Retour au service role pour la suite (position joueur = serveur).
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select results_eq(
  $$select rank, total_players
      from public.contest_player_rank('c0000000-0000-4000-8000-000000000003',
                                      'c0000000-0000-4000-8000-000000000042')$$,
  $$values (4::bigint, 4::bigint)$$,
  'la position joueur lit aussi le palmarès figé'
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
