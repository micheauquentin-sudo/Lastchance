-- ============================================================
-- Mode événement en direct — comportement réel des RPC sur base
-- migrée vierge (fixtures locales) :
--   1. join_event_session : idempotent (re-join = même joueur) ; addon
--      coupé / session non ouverte → 'unavailable' ; pseudo hors bornes →
--      'invalid_pseudo' ; avatar hors catalogue coercé au défaut.
--   2. submit_event_answer : refusé hors fenêtre (phase ≠ question_active,
--      autre question, délai dépassé) → 'locked' ; joueur non inscrit →
--      'not_joined' ; doublon → 'already_answered' ; réponse valide →
--      'recorded' SANS révéler la justesse.
--   3. reveal : scoring SERVEUR de rapidité (réponse rapide > lente, correct
--      >= base, faux = 0) ; is_correct/points écrits au reveal seulement.
--   4. prono : bonne option désignée au reveal (p_correct_option_id) ;
--      manquante → 'missing_correct_option'.
--   5. poll : aucun score (points 0), aucun impact sur le classement.
--   6. is_correct NON lisible avant reveal via event_public_state
--      (correct_option_id null, options sans clé is_correct) ; révélé après.
--   7. end : crée les event_wins du TOP score, code EVENT-… valide, stock fini
--      décrémenté ; podium seul si stock 0.
--   8. Machine à états : transitions invalides refusées ('invalid_transition').
--   9. Caisse : redeem_event_prize atomique, auditée, org-scopée.
-- ============================================================
begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

select set_config('request.jwt.claims', '{"role":"service_role"}', true);

-- ── Fixtures ─────────────────────────────────────────────────
insert into public.organizations (id, name, slug, addon_events, data_retention_months)
values ('ea000000-0000-4000-8000-000000000001', 'Test Events', 'tap-events', true, 6);
-- Seconde organisation : preuve du cloisonnement de la caisse.
insert into public.organizations (id, name, slug, addon_events)
values ('ea000000-0000-4000-8000-0000000000ff', 'Autre Org', 'tap-events-2', true);

-- Game actif.
insert into public.event_games (id, organization_id, name, status)
values ('ea000000-0000-4000-8000-000000000010',
        'ea000000-0000-4000-8000-000000000001', 'Quiz du bar', 'active');

-- Q1 quiz (opt A correcte), fenêtre large pour un scoring déterministe.
insert into public.event_questions (id, game_id, organization_id, position, question_type, prompt, time_limit_seconds, points_base)
values ('ea000000-0000-4000-8000-000000000021',
        'ea000000-0000-4000-8000-000000000010',
        'ea000000-0000-4000-8000-000000000001', 0, 'quiz', 'Capitale ?', 300, 1000);
insert into public.event_question_options (id, question_id, organization_id, position, label, is_correct)
values
  ('ea000000-0000-4000-8000-0000000021a1', 'ea000000-0000-4000-8000-000000000021',
   'ea000000-0000-4000-8000-000000000001', 0, 'Paris', true),
  ('ea000000-0000-4000-8000-0000000021a2', 'ea000000-0000-4000-8000-000000000021',
   'ea000000-0000-4000-8000-000000000001', 1, 'Lyon', false);

-- Q2 poll (aucune bonne réponse).
insert into public.event_questions (id, game_id, organization_id, position, question_type, prompt, time_limit_seconds, points_base)
values ('ea000000-0000-4000-8000-000000000022',
        'ea000000-0000-4000-8000-000000000010',
        'ea000000-0000-4000-8000-000000000001', 1, 'poll', 'Bière préférée ?', 300, 1000);
insert into public.event_question_options (id, question_id, organization_id, position, label)
values
  ('ea000000-0000-4000-8000-0000000022b1', 'ea000000-0000-4000-8000-000000000022',
   'ea000000-0000-4000-8000-000000000001', 0, 'Blonde'),
  ('ea000000-0000-4000-8000-0000000022b2', 'ea000000-0000-4000-8000-000000000022',
   'ea000000-0000-4000-8000-000000000001', 1, 'Brune');

-- Q3 prono (bonne réponse inconnue à l'avance).
insert into public.event_questions (id, game_id, organization_id, position, question_type, prompt, time_limit_seconds, points_base)
values ('ea000000-0000-4000-8000-000000000023',
        'ea000000-0000-4000-8000-000000000010',
        'ea000000-0000-4000-8000-000000000001', 2, 'prono', 'Vainqueur ce soir ?', 300, 1000);
insert into public.event_question_options (id, question_id, organization_id, position, label)
values
  ('ea000000-0000-4000-8000-0000000023c1', 'ea000000-0000-4000-8000-000000000023',
   'ea000000-0000-4000-8000-000000000001', 0, 'Équipe A'),
  ('ea000000-0000-4000-8000-0000000023c2', 'ea000000-0000-4000-8000-000000000023',
   'ea000000-0000-4000-8000-000000000001', 1, 'Équipe B');

-- Session S : join_code déterministe (alphabet sans ambiguïté), stock 2.
insert into public.event_sessions (
  id, game_id, organization_id, label, join_code, status, reward_stock, reward_label, reward_details)
values ('ea000000-0000-4000-8000-000000000030',
        'ea000000-0000-4000-8000-000000000010',
        'ea000000-0000-4000-8000-000000000001',
        'Vendredi 20h', 'TESTAA', 'draft', 2, 'Tournée offerte', 'À retirer au comptoir');

create temporary table tap_r (r jsonb) on commit drop;

-- ══ 1. join : addon / statut / idempotence / validation ══════
-- Session encore en 'draft' : join refusé (pas encore ouverte).
select is((public.join_event_session('TESTAA', repeat('a', 64), 'Alice', 'renard'))->>'state',
  'unavailable', 'join refusé quand la session n''est pas ouverte');

-- Ouvre le lobby.
select is((public.start_event_session(
    'ea000000-0000-4000-8000-000000000001',
    'ea000000-0000-4000-8000-000000000030'))->>'state',
  'ok', 'start_event_session ouvre le lobby');

-- Pseudo vide → invalid_pseudo (aucun joueur créé).
select is((public.join_event_session('TESTAA', repeat('a', 64), '   ', 'renard'))->>'state',
  'invalid_pseudo', 'pseudo vide refusé');
select is((select count(*)::int from public.event_players
             where session_id = 'ea000000-0000-4000-8000-000000000030'),
  0, 'aucun joueur créé par un pseudo invalide');

-- join valide (avatar hors catalogue → coercé au défaut vide).
insert into tap_r select public.join_event_session('TESTAA', repeat('a', 64), 'Alice', 'PAS_UN_AVATAR');
select is((select r->>'state' from tap_r), 'joined', 'join valide → joined');
select is((select avatar from public.event_players where token_hash = repeat('a', 64)),
  '', 'avatar hors catalogue coercé au défaut');
delete from tap_r;

-- Idempotence : re-join même jeton = même joueur, pseudo/avatar rafraîchis.
select public.join_event_session('TESTAA', repeat('a', 64), 'Alice2', 'ours');
select is((select count(*)::int from public.event_players
             where session_id = 'ea000000-0000-4000-8000-000000000030'),
  1, 're-join ne crée pas de doublon (idempotent)');
select is((select pseudo from public.event_players where token_hash = repeat('a', 64)),
  'Alice2', 're-join rafraîchit le pseudo');

-- Autres joueurs pour le scoring. Erik (jeton e) sert au test de fenêtre
-- expirée (il ne marque jamais → hors podium).
select public.join_event_session('TESTAA', repeat('b', 64), 'Bob', 'chat');
select public.join_event_session('TESTAA', repeat('c', 64), 'Carla', 'chien');
select public.join_event_session('TESTAA', repeat('e', 64), 'Erik', 'lion');

-- ══ 2. submit hors fenêtre ═══════════════════════════════════
-- Phase 'lobby' (aucune question lancée) → locked.
select is((public.submit_event_answer(
    'ea000000-0000-4000-8000-000000000030',
    'ea000000-0000-4000-8000-000000000021', repeat('a', 64),
    'ea000000-0000-4000-8000-0000000021a1'))->>'state',
  'locked', 'submit refusé hors phase active');

-- Machine à états : lock/reveal invalides depuis lobby.
select is((public.lock_event_question(
    'ea000000-0000-4000-8000-000000000001',
    'ea000000-0000-4000-8000-000000000030'))->>'state',
  'invalid_transition', 'lock refusé hors question_active');
select is((public.reveal_event_question(
    'ea000000-0000-4000-8000-000000000001',
    'ea000000-0000-4000-8000-000000000030'))->>'state',
  'invalid_transition', 'reveal refusé hors question active/verrouillée');

-- Lance Q1.
select is((public.launch_event_question(
    'ea000000-0000-4000-8000-000000000001',
    'ea000000-0000-4000-8000-000000000030',
    'ea000000-0000-4000-8000-000000000021'))->>'state',
  'ok', 'launch_event_question ouvre la question');

-- Relancer une question déjà courante → invalid_transition (déjà active).
select is((public.launch_event_question(
    'ea000000-0000-4000-8000-000000000001',
    'ea000000-0000-4000-8000-000000000030',
    'ea000000-0000-4000-8000-000000000022'))->>'state',
  'invalid_transition', 'launch refusé si une question est déjà active');

-- Mauvaise question soumise (pas la courante) → locked.
select is((public.submit_event_answer(
    'ea000000-0000-4000-8000-000000000030',
    'ea000000-0000-4000-8000-000000000022', repeat('a', 64),
    'ea000000-0000-4000-8000-0000000022b1'))->>'state',
  'locked', 'submit refusé pour une autre question que la courante');

-- Jeton non inscrit → not_joined.
select is((public.submit_event_answer(
    'ea000000-0000-4000-8000-000000000030',
    'ea000000-0000-4000-8000-000000000021', repeat('d', 64),
    'ea000000-0000-4000-8000-0000000021a1'))->>'state',
  'not_joined', 'submit refusé pour un joueur non inscrit');

-- Fenêtre de temps expirée (started_at reculé au-delà du time_limit) → locked,
-- même pour un joueur inscrit (Erik). Le refus vient du délai serveur.
update public.event_sessions
   set current_question_started_at = now() - interval '400 seconds'
 where id = 'ea000000-0000-4000-8000-000000000030';
select is((public.submit_event_answer(
    'ea000000-0000-4000-8000-000000000030',
    'ea000000-0000-4000-8000-000000000021', repeat('e', 64),
    'ea000000-0000-4000-8000-0000000021a1'))->>'state',
  'locked', 'submit refusé après expiration de la fenêtre de temps');

-- ══ 3. is_correct NON lisible avant reveal (public_state) ════
insert into tap_r select public.event_public_state('ea000000-0000-4000-8000-000000000030');
select is((select r->>'state' from tap_r), 'ok', 'event_public_state OK en phase active');
select ok((select (r->'correct_option_id') is null or r->>'correct_option_id' is null from tap_r),
  'correct_option_id null avant reveal');
select ok((select not ((r->'question'->'options'->0) ? 'is_correct') from tap_r),
  'les options publiques ne portent pas is_correct');
delete from tap_r;

-- ══ 2bis / 3. scoring de rapidité (déterministe par started_at) ══
-- Carla répond LENTEMENT (started_at reculé de 250 s → gros elapsed).
update public.event_sessions
   set current_question_started_at = now() - interval '250 seconds'
 where id = 'ea000000-0000-4000-8000-000000000030';
select is((public.submit_event_answer(
    'ea000000-0000-4000-8000-000000000030',
    'ea000000-0000-4000-8000-000000000021', repeat('c', 64),
    'ea000000-0000-4000-8000-0000000021a1'))->>'state',
  'recorded', 'réponse lente correcte enregistrée');

-- Alice répond VITE (started_at reculé de 5 s → petit elapsed), correct.
update public.event_sessions
   set current_question_started_at = now() - interval '5 seconds'
 where id = 'ea000000-0000-4000-8000-000000000030';
select is((public.submit_event_answer(
    'ea000000-0000-4000-8000-000000000030',
    'ea000000-0000-4000-8000-000000000021', repeat('a', 64),
    'ea000000-0000-4000-8000-0000000021a1'))->>'state',
  'recorded', 'réponse rapide correcte enregistrée');

-- Bob répond FAUX (option Lyon).
select is((public.submit_event_answer(
    'ea000000-0000-4000-8000-000000000030',
    'ea000000-0000-4000-8000-000000000021', repeat('b', 64),
    'ea000000-0000-4000-8000-0000000021a2'))->>'state',
  'recorded', 'réponse fausse enregistrée');

-- Doublon (Alice re-soumet) → already_answered.
select is((public.submit_event_answer(
    'ea000000-0000-4000-8000-000000000030',
    'ea000000-0000-4000-8000-000000000021', repeat('a', 64),
    'ea000000-0000-4000-8000-0000000021a2'))->>'state',
  'already_answered', 'une seule réponse par joueur et question');

-- Verrouille puis révèle.
select is((public.lock_event_question(
    'ea000000-0000-4000-8000-000000000001',
    'ea000000-0000-4000-8000-000000000030'))->>'state',
  'ok', 'lock_event_question OK');
select is((public.reveal_event_question(
    'ea000000-0000-4000-8000-000000000001',
    'ea000000-0000-4000-8000-000000000030'))->>'state',
  'ok', 'reveal_event_question OK');

-- Justesse écrite au reveal.
select is((select is_correct from public.event_answers
             where player_id = (select id from public.event_players where token_hash = repeat('a', 64))
               and question_id = 'ea000000-0000-4000-8000-000000000021'),
  true, 'reveal marque la bonne réponse correcte');
select is((select is_correct from public.event_answers
             where player_id = (select id from public.event_players where token_hash = repeat('b', 64))
               and question_id = 'ea000000-0000-4000-8000-000000000021'),
  false, 'reveal marque la mauvaise réponse fausse');

-- Rapidité : Alice (rapide) > Carla (lente), toutes deux >= base ; Bob = 0.
select ok((select score from public.event_players where token_hash = repeat('a', 64))
        > (select score from public.event_players where token_hash = repeat('c', 64)),
  'la réponse rapide marque plus que la lente');
select ok((select score from public.event_players where token_hash = repeat('c', 64)) >= 1000,
  'une réponse correcte marque au moins points_base');
select ok((select score from public.event_players where token_hash = repeat('a', 64)) <= 2000,
  'le bonus de rapidité est borné (<= 2·points_base)');
select is((select score from public.event_players where token_hash = repeat('b', 64)),
  0, 'une réponse fausse ne marque aucun point');

-- correct_option_id révélé après reveal.
insert into tap_r select public.event_public_state('ea000000-0000-4000-8000-000000000030');
select is((select r->>'correct_option_id' from tap_r),
  'ea000000-0000-4000-8000-0000000021a1', 'correct_option_id révélé après reveal (quiz)');
delete from tap_r;

-- ══ 5. poll : aucun score ════════════════════════════════════
select public.launch_event_question(
  'ea000000-0000-4000-8000-000000000001',
  'ea000000-0000-4000-8000-000000000030',
  'ea000000-0000-4000-8000-000000000022');
select public.submit_event_answer(
  'ea000000-0000-4000-8000-000000000030',
  'ea000000-0000-4000-8000-000000000022', repeat('a', 64),
  'ea000000-0000-4000-8000-0000000022b1');
-- Score d'Alice AVANT reveal du poll.
create temporary table tap_score (s int) on commit drop;
insert into tap_score select score from public.event_players where token_hash = repeat('a', 64);
select public.reveal_event_question(
  'ea000000-0000-4000-8000-000000000001',
  'ea000000-0000-4000-8000-000000000030');
select is((select score from public.event_players where token_hash = repeat('a', 64)),
  (select s from tap_score), 'un sondage (poll) n''ajoute aucun point');
select is((select points_awarded from public.event_answers
             where question_id = 'ea000000-0000-4000-8000-000000000022'
               and player_id = (select id from public.event_players where token_hash = repeat('a', 64))),
  0, 'réponse de sondage : 0 point');

-- ══ 4. prono : bonne option désignée au reveal ═══════════════
select public.launch_event_question(
  'ea000000-0000-4000-8000-000000000001',
  'ea000000-0000-4000-8000-000000000030',
  'ea000000-0000-4000-8000-000000000023');
select public.submit_event_answer(
  'ea000000-0000-4000-8000-000000000030',
  'ea000000-0000-4000-8000-000000000023', repeat('b', 64),
  'ea000000-0000-4000-8000-0000000023c2');
-- Reveal sans désigner l'option → missing_correct_option.
select is((public.reveal_event_question(
    'ea000000-0000-4000-8000-000000000001',
    'ea000000-0000-4000-8000-000000000030', null))->>'state',
  'missing_correct_option', 'prono : reveal sans option désignée refusé');
-- Reveal en désignant Équipe B (c2) → Bob correct.
select is((public.reveal_event_question(
    'ea000000-0000-4000-8000-000000000001',
    'ea000000-0000-4000-8000-000000000030',
    'ea000000-0000-4000-8000-0000000023c2'))->>'state',
  'ok', 'prono : reveal avec option désignée OK');
select is((select is_correct from public.event_answers
             where question_id = 'ea000000-0000-4000-8000-000000000023'
               and player_id = (select id from public.event_players where token_hash = repeat('b', 64))),
  true, 'prono : la réponse sur l''option désignée est correcte');
select ok((select score from public.event_players where token_hash = repeat('b', 64)) >= 1000,
  'prono : Bob marque au moins points_base');

-- ══ 7. end : podium récompensé + code + stock fini ═══════════
select is((public.show_event_leaderboard(
    'ea000000-0000-4000-8000-000000000001',
    'ea000000-0000-4000-8000-000000000030'))->>'state',
  'ok', 'show_event_leaderboard OK');
insert into tap_r select public.end_event_session(
  'ea000000-0000-4000-8000-000000000001',
  'ea000000-0000-4000-8000-000000000030');
select is((select r->>'state' from tap_r), 'ok', 'end_event_session OK');
-- Stock 2, trois joueurs à score > 0 → exactement 2 gagnants.
select is((select (r->>'winners')::int from tap_r), 2, 'end récompense le TOP dans la limite du stock');
delete from tap_r;
select is((select count(*)::int from public.event_wins
             where session_id = 'ea000000-0000-4000-8000-000000000030'),
  2, 'deux event_wins créés');
select is((select reward_claimed_count from public.event_sessions
             where id = 'ea000000-0000-4000-8000-000000000030'),
  2, 'reward_claimed_count décrémente le stock fini');
select ok((select bool_and(code ~ '^EVENT-[A-HJ-NP-Z2-9]{8}$') from public.event_wins
             where session_id = 'ea000000-0000-4000-8000-000000000030'),
  'les codes de gain respectent le format EVENT-…');
-- Rang 1 = joueur au meilleur score (même ordre que le classement).
select is((select winner_token_hash from public.event_wins
             where session_id = 'ea000000-0000-4000-8000-000000000030' and rank = 1),
  (select token_hash from public.event_players
     where session_id = 'ea000000-0000-4000-8000-000000000030'
     order by score desc, joined_at asc, id asc limit 1),
  'le rang 1 est le meilleur score');

-- end de nouveau → invalid_transition (session terminée).
select is((public.end_event_session(
    'ea000000-0000-4000-8000-000000000001',
    'ea000000-0000-4000-8000-000000000030'))->>'state',
  'invalid_transition', 'end refusé sur une session déjà terminée');

-- ══ 9. Caisse : redeem_event_prize ═══════════════════════════
create temporary table tap_code (code text) on commit drop;
insert into tap_code select code from public.event_wins
 where session_id = 'ea000000-0000-4000-8000-000000000030' and rank = 1;

-- Retrait par une AUTRE organisation → AUCUNE ligne (refus générique,
-- indistinct d'un code inconnu : la RPC est org-scopée, `where org = p_org`
-- ne matche pas, donc `return query` ne renvoie rien).
select is((select count(*)::int from public.redeem_event_prize(
    'ea000000-0000-4000-8000-0000000000ff', (select code from tap_code), 'caisse-autre')),
  0, 'code d''une autre organisation : aucune ligne (refus générique)');

-- Retrait par la bonne organisation (insensible à la casse) → succès.
select is((select redeemed_now from public.redeem_event_prize(
    'ea000000-0000-4000-8000-000000000001',
    lower((select code from tap_code)), 'caisse-1')),
  true, 'retrait valide (insensible à la casse)');
-- Second retrait → déjà remis.
select is((select redeemed_now from public.redeem_event_prize(
    'ea000000-0000-4000-8000-000000000001', (select code from tap_code), 'caisse-1')),
  false, 'code déjà remis : pas de double retrait');
-- Audit journalisé.
select ok(exists (select 1 from public.audit_logs
             where organization_id = 'ea000000-0000-4000-8000-000000000001'
               and action = 'event.redeem'),
  'le retrait est audité');

-- ══ 8. purge RGPD ════════════════════════════════════════════
-- Session terminée + rétention 6 mois : ended_at vieilli → joueurs purgés.
update public.event_sessions
   set ended_at = now() - interval '7 months'
 where id = 'ea000000-0000-4000-8000-000000000030';
select ok(public.purge_expired_event_sessions() >= 3,
  'purge supprime les joueurs des sessions terminées au-delà de la rétention');
select is((select count(*)::int from public.event_players
             where session_id = 'ea000000-0000-4000-8000-000000000030'),
  0, 'joueurs purgés');
-- Les gains (registre anonyme) survivent à la purge des joueurs.
select is((select count(*)::int from public.event_wins
             where session_id = 'ea000000-0000-4000-8000-000000000030'),
  2, 'les event_wins (codes) survivent à la purge des joueurs');

select * from finish();
rollback;
