-- ============================================================
-- 20260904120000 — les sept familles sans échéance en reçoivent une
--
-- Ce que ce fichier démontre, par ordre d'importance :
--
--   1. LE GEL (section 3), et il est démontré avec son TÉMOIN. Une valeur qui
--      ne bouge pas ne prouve rien tant qu'on n'a pas montré que quelque chose
--      la ferait bouger : le MÊME geste du commerçant renomme la chasse ET
--      raccourcit sa durée de validité, puis on resynchronise. Le nom de
--      l'expérience bouge au registre — donc le miroir a bien été réécrit —
--      pendant que l'échéance ne bouge pas. Et la section se termine par la
--      preuve que le réglage n'est pas mort : une émission NEUVE, après le
--      changement, porte la NOUVELLE durée.
--   2. LES HUIT TABLES (section 2), une par une et nommées. Sept familles, huit
--      tables d'émission — le calendrier en porte deux pour une seule parente.
--      Une garde qui n'en couvrirait que sept rendrait un résultat parfaitement
--      plausible : la famille oubliée n'expirerait simplement jamais.
--   3. QUE L'ÉCHÉANCE MORD EN CAISSE (section 4), sur les DEUX chemins — le
--      moteur unique, et le repli legacy qui ne sert que lorsque le registre
--      est injoignable. Une seconde avant l'échéance le lot se remet ; une
--      seconde après, il est refusé.
--   4. QUE `null` RESTE « SANS LIMITE » (section 1). C'est le comportement
--      d'aujourd'hui, et aucune expérience existante ne doit en changer.
--   5. QUE LA PURGE NE DÉTRUIT PAS UN LOT QUI VIENT D'EXPIRER (section 6).
--      Le critère d'expiration est ANDé au critère d'âge dans
--      `purge_expired_reward_issuances` : un lot périmé survit assez longtemps
--      pour que la caisse dise « expiré » plutôt que « introuvable ». Cette
--      propriété n'était portée par AUCUNE assertion tant qu'aucune de ces
--      familles n'expirait ; elle devient porteuse à partir de ce chantier.
--      Elle est démontrée avec sa contre-épreuve (vieillie, la ligne EST
--      purgée) — sinon « elle survit » serait indistinguable de « la purge ne
--      fait rien ».
--
-- Toutes les assertions sont scopées aux fixtures de ce fichier.
-- ============================================================
-- Plan CHIFFRÉ et non `no_plan()` : un fichier qui MEURT avant `finish()` rend
-- « aucun plan trouvé », que rien ne distingue d'un succès.
begin;
create extension if not exists pgtap with schema extensions;
select plan(66);

select set_config('request.jwt.claims', '{"role":"service_role"}', true);

-- ══ 0. La forme : réglage, échéance, triggers, privilèges ═══
select has_column('public', 'hunts', 'code_ttl_days',
  'la chasse au trésor porte son réglage de durée');
select has_column('public', 'loyalty_programs', 'code_ttl_days',
  'le programme de fidélité porte son réglage de durée');
select has_column('public', 'jackpot_campaigns', 'code_ttl_days',
  'la cagnotte collective porte son réglage de durée');
select has_column('public', 'event_sessions', 'code_ttl_days',
  'la session d''événement live porte son réglage de durée');
select has_column('public', 'calendars', 'code_ttl_days',
  'le calendrier porte son réglage de durée — UN seul pour ses deux tables d''émission');
select has_column('public', 'referral_programs', 'code_ttl_days',
  'le programme de parrainage porte son réglage de durée');
select has_column('public', 'quizzes', 'code_ttl_days',
  'le quiz porte son réglage de durée');

select has_column('public', 'hunt_completions', 'redeem_expires_at',
  'la complétion de chasse porte son échéance gravée');
select has_column('public', 'loyalty_rewards', 'redeem_expires_at',
  'la récompense de fidélité porte son échéance gravée');
select has_column('public', 'jackpot_wins', 'redeem_expires_at',
  'le gain de cagnotte porte son échéance gravée');
select has_column('public', 'event_wins', 'redeem_expires_at',
  'le gain d''événement porte son échéance gravée');
select has_column('public', 'calendar_openings', 'redeem_expires_at',
  'le lot de case de calendrier porte son échéance gravée');
select has_column('public', 'calendar_rewards', 'redeem_expires_at',
  'la récompense d''assiduité de calendrier porte son échéance gravée');
select has_column('public', 'referral_rewards', 'redeem_expires_at',
  'le versement de parrainage porte son échéance gravée');
select has_column('public', 'quiz_rewards', 'redeem_expires_at',
  'la récompense de quiz porte son échéance gravée');

select has_trigger('public', 'hunt_completions', 'hunt_completions_set_redeem_expiry',
  'la chasse grave son échéance à l''insertion');
select has_trigger('public', 'loyalty_rewards', 'loyalty_rewards_set_redeem_expiry',
  'la fidélité grave son échéance à l''insertion');
select has_trigger('public', 'jackpot_wins', 'jackpot_wins_set_redeem_expiry',
  'la cagnotte grave son échéance à l''insertion');
select has_trigger('public', 'event_wins', 'event_wins_set_redeem_expiry',
  'l''événement grave son échéance à l''insertion');
select has_trigger('public', 'calendar_openings', 'calendar_openings_set_redeem_expiry',
  'le lot de case grave son échéance à l''insertion');
select has_trigger('public', 'calendar_rewards', 'calendar_rewards_set_redeem_expiry',
  'la récompense d''assiduité grave son échéance à l''insertion');
select has_trigger('public', 'referral_rewards', 'referral_rewards_set_redeem_expiry',
  'le parrainage grave son échéance à l''insertion');
select has_trigger('public', 'quiz_rewards', 'quiz_rewards_set_redeem_expiry',
  'le quiz grave son échéance à l''insertion');

-- Une fonction trigger n'a aucune raison d'être appelable depuis une session
-- cliente : `create function` accorde l'EXECUTE à PUBLIC par défaut, et
-- l'oublier est l'erreur qu'ont dû corriger deux migrations antérieures.
select ok(
  not has_function_privilege('anon', 'public.set_reward_redeem_expiry()', 'EXECUTE'),
  'anon ne peut pas invoquer la fonction trigger d''échéance');
select ok(
  not has_function_privilege('authenticated', 'public.set_reward_redeem_expiry()', 'EXECUTE'),
  'une session marchande ne peut pas invoquer la fonction trigger d''échéance');

-- ── Fixtures ────────────────────────────────────────────────
insert into auth.users (id, email)
values ('ed000000-0000-4000-8000-0000000000a1', 'caissier-echeance@tap.local');

insert into public.organizations (id, name, slug) values
  ('ed000000-0000-4000-8000-000000000001', 'Échéances TAP', 'tap-echeances');

insert into public.organization_members (organization_id, user_id, role) values
  ('ed000000-0000-4000-8000-000000000001',
   'ed000000-0000-4000-8000-0000000000a1', 'cashier');

-- Chasse au trésor : DEUX chasses, l'une sans réglage (section 1), l'autre à
-- 30 jours (sections 2, 3 et 5).
insert into public.hunts (id, organization_id, name, status, reward_label, code_ttl_days) values
  ('ed000000-0000-4000-8000-000000000010',
   'ed000000-0000-4000-8000-000000000001', 'Chasse sans échéance', 'active', 'Café', null),
  ('ed000000-0000-4000-8000-000000000011',
   'ed000000-0000-4000-8000-000000000001', 'Chasse à échéance', 'active', 'Café', 30);
insert into public.hunt_players (id, hunt_id, organization_id, token_hash) values
  ('ed000000-0000-4000-8000-000000000012',
   'ed000000-0000-4000-8000-000000000010',
   'ed000000-0000-4000-8000-000000000001', repeat('a', 64)),
  ('ed000000-0000-4000-8000-000000000013',
   'ed000000-0000-4000-8000-000000000011',
   'ed000000-0000-4000-8000-000000000001', repeat('b', 64)),
  -- Joueur réservé à la section 3 : il complètera la chasse APRÈS que le
  -- commerçant a raccourci la durée.
  ('ed000000-0000-4000-8000-00000000001a',
   'ed000000-0000-4000-8000-000000000011',
   'ed000000-0000-4000-8000-000000000001', repeat('9', 64));
insert into public.hunt_completions (id, hunt_id, organization_id, player_id, code) values
  ('ed000000-0000-4000-8000-000000000014',
   'ed000000-0000-4000-8000-000000000010',
   'ed000000-0000-4000-8000-000000000001',
   'ed000000-0000-4000-8000-000000000012', 'CHASSE-AAAA2345'),
  ('ed000000-0000-4000-8000-000000000015',
   'ed000000-0000-4000-8000-000000000011',
   'ed000000-0000-4000-8000-000000000001',
   'ed000000-0000-4000-8000-000000000013', 'CHASSE-BBBB2345');

-- Fidélité (sections 2 et 6).
insert into public.loyalty_programs (id, organization_id, name, code_ttl_days) values
  ('ed000000-0000-4000-8000-000000000020',
   'ed000000-0000-4000-8000-000000000001', 'Passeport', 30);
-- `reward_stock` est OBLIGATOIRE et fini quand le palier verse un lot
-- (ADR-031) : le laisser nul fait échouer loyalty_milestones_reward_stock_check.
insert into public.loyalty_milestones
  (id, program_id, organization_id, visit_count, reward_type, reward_label,
   reward_stock) values
  ('ed000000-0000-4000-8000-000000000021',
   'ed000000-0000-4000-8000-000000000020',
   'ed000000-0000-4000-8000-000000000001', 5, 'lot', 'Croissant', 10);
insert into public.loyalty_members (id, program_id, organization_id, token_hash) values
  ('ed000000-0000-4000-8000-000000000022',
   'ed000000-0000-4000-8000-000000000020',
   'ed000000-0000-4000-8000-000000000001', repeat('c', 64));
insert into public.loyalty_rewards
  (id, member_id, program_id, organization_id, milestone_id, reward_type, code) values
  ('ed000000-0000-4000-8000-000000000023',
   'ed000000-0000-4000-8000-000000000022',
   'ed000000-0000-4000-8000-000000000020',
   'ed000000-0000-4000-8000-000000000001',
   'ed000000-0000-4000-8000-000000000021', 'lot', 'FIDELITE-CCCC2345');

-- Cagnotte collective (sections 2 et 4).
insert into public.jackpot_campaigns
  (id, organization_id, name, reward_stock, code_ttl_days) values
  ('ed000000-0000-4000-8000-000000000030',
   'ed000000-0000-4000-8000-000000000001', 'Cagnotte', 10, 30);
insert into public.jackpot_wins
  (id, campaign_id, organization_id, cycle, winner_token_hash, code, draw_seed) values
  ('ed000000-0000-4000-8000-000000000031',
   'ed000000-0000-4000-8000-000000000030',
   'ed000000-0000-4000-8000-000000000001', 1, repeat('d', 64),
   'JACKPOT-DDDD2345', 'abcdef');

-- Événement live (sections 2 et 4).
insert into public.event_games (id, organization_id, name) values
  ('ed000000-0000-4000-8000-000000000040',
   'ed000000-0000-4000-8000-000000000001', 'Soirée quiz');
insert into public.event_sessions
  (id, game_id, organization_id, join_code, reward_stock, code_ttl_days) values
  ('ed000000-0000-4000-8000-000000000041',
   'ed000000-0000-4000-8000-000000000040',
   'ed000000-0000-4000-8000-000000000001', 'JKLMN2', 10, 30);
insert into public.event_wins
  (id, session_id, organization_id, rank, winner_token_hash, code) values
  ('ed000000-0000-4000-8000-000000000042',
   'ed000000-0000-4000-8000-000000000041',
   'ed000000-0000-4000-8000-000000000001', 1, repeat('e', 64), 'EVENT-EEEE2345');

-- Calendrier : UNE parente, DEUX tables d'émission (sections 2 et 4).
insert into public.calendars
  (id, organization_id, name, start_date, timezone, day_count, public_slug,
   completion_reward_label, completion_reward_stock, code_ttl_days) values
  ('ed000000-0000-4000-8000-000000000050',
   'ed000000-0000-4000-8000-000000000001', 'Avent', current_date,
   'Europe/Paris', 5, 'tap-echeance-avent', 'Chocolat', 10, 30);
insert into public.calendar_days
  (id, calendar_id, organization_id, day_index, unlock_at, content_type,
   reward_label, reward_stock) values
  ('ed000000-0000-4000-8000-000000000051',
   'ed000000-0000-4000-8000-000000000050',
   'ed000000-0000-4000-8000-000000000001', 1, now() - interval '1 day',
   'lot', 'Chocolat', 10);
insert into public.calendar_players (id, calendar_id, organization_id, token_hash) values
  ('ed000000-0000-4000-8000-000000000052',
   'ed000000-0000-4000-8000-000000000050',
   'ed000000-0000-4000-8000-000000000001', repeat('f', 64));
insert into public.calendar_openings
  (id, player_id, day_id, calendar_id, organization_id, content_type, code) values
  ('ed000000-0000-4000-8000-000000000053',
   'ed000000-0000-4000-8000-000000000052',
   'ed000000-0000-4000-8000-000000000051',
   'ed000000-0000-4000-8000-000000000050',
   'ed000000-0000-4000-8000-000000000001', 'lot', 'CADEAU-FFFF2345');
insert into public.calendar_rewards
  (id, player_id, calendar_id, organization_id, code) values
  ('ed000000-0000-4000-8000-000000000054',
   'ed000000-0000-4000-8000-000000000052',
   'ed000000-0000-4000-8000-000000000050',
   'ed000000-0000-4000-8000-000000000001', 'CADEAU-GGGG2345');

-- Parrainage (section 2). Sa parente est la SEULE qui ne se joigne pas par
-- `id` : referral_programs est keyée par campaign_id.
insert into public.campaigns (id, organization_id, name, status) values
  ('ed000000-0000-4000-8000-000000000060',
   'ed000000-0000-4000-8000-000000000001', 'Campagne parrainage', 'active');
insert into public.referral_programs
  (id, campaign_id, organization_id, enabled, sponsor_reward_kind,
   sponsor_reward_label, sponsor_reward_stock, code_ttl_days) values
  ('ed000000-0000-4000-8000-000000000061',
   'ed000000-0000-4000-8000-000000000060',
   'ed000000-0000-4000-8000-000000000001', true, 'lot', 'Bon d''achat', 10, 30);
insert into public.referral_sponsors
  (id, campaign_id, organization_id, sponsor_key, referral_code) values
  ('ed000000-0000-4000-8000-000000000062',
   'ed000000-0000-4000-8000-000000000060',
   'ed000000-0000-4000-8000-000000000001', repeat('4', 64), 'PR-HHHH2345');
insert into public.referral_rewards
  (id, campaign_id, organization_id, sponsor_id, beneficiary, kind, code) values
  ('ed000000-0000-4000-8000-000000000063',
   'ed000000-0000-4000-8000-000000000060',
   'ed000000-0000-4000-8000-000000000001',
   'ed000000-0000-4000-8000-000000000062', 'sponsor', 'lot', 'PARRAIN-HHHH2345');

-- Quiz (section 2).
insert into public.quizzes
  (id, organization_id, name, public_slug, reward_mode, reward_threshold,
   reward_label, reward_stock, code_ttl_days) values
  ('ed000000-0000-4000-8000-000000000070',
   'ed000000-0000-4000-8000-000000000001', 'Quiz du terroir',
   'tap-echeance-quiz', 'threshold', 3, 'Verre', 10, 30);
insert into public.quiz_players (id, quiz_id, organization_id, token_hash) values
  ('ed000000-0000-4000-8000-000000000071',
   'ed000000-0000-4000-8000-000000000070',
   'ed000000-0000-4000-8000-000000000001', repeat('5', 64));
insert into public.quiz_rewards
  (id, quiz_id, organization_id, player_id, source, code) values
  ('ed000000-0000-4000-8000-000000000073',
   'ed000000-0000-4000-8000-000000000070',
   'ed000000-0000-4000-8000-000000000001',
   'ed000000-0000-4000-8000-000000000071', 'threshold', 'QUIZ-JJJJ2345');

-- ══ 1. `null` = sans limite — le comportement d'AUJOURD'HUI ══
-- Aucune expérience existante ne gagne d'échéance à l'application de la
-- migration : la colonne naît nulle, et nulle veut dire « sans limite ».
select is(
  (select redeem_expires_at from public.hunt_completions
    where id = 'ed000000-0000-4000-8000-000000000014'),
  null::timestamptz,
  'sans réglage sur la parente, la ligne émise ne porte AUCUNE échéance');
select is(
  (select expires_at from public.reward_issuances
    where source_id = 'ed000000-0000-4000-8000-000000000014'),
  null::timestamptz,
  'et le registre non plus — le comportement d''avant cette migration est intact');

-- ══ 2. Un réglage ⇒ émission + N jours, pour les HUIT tables ══
-- `now()` est l'heure de TRANSACTION : la valeur par défaut de la colonne
-- d'émission et le calcul du trigger la lisent au même instant, donc
-- l'égalité est exacte et non approchée.
--
-- Deux assertions par table : ce que la ligne d'émission a gravé, et ce que
-- `sync_reward_issuance` en a propagé au registre. La seconde est celle qui
-- démontre que la branche correspondante de la fonction a bien été réécrite.
select is(
  (select redeem_expires_at from public.hunt_completions
    where id = 'ed000000-0000-4000-8000-000000000015'),
  (select completed_at + interval '30 days' from public.hunt_completions
    where id = 'ed000000-0000-4000-8000-000000000015'),
  'CHASSE : l''échéance est gravée à l''émission + 30 jours');
select is(
  (select expires_at from public.reward_issuances
    where source_id = 'ed000000-0000-4000-8000-000000000015'),
  (select redeem_expires_at from public.hunt_completions
    where id = 'ed000000-0000-4000-8000-000000000015'),
  'CHASSE : le registre porte la même échéance');

select is(
  (select redeem_expires_at from public.loyalty_rewards
    where id = 'ed000000-0000-4000-8000-000000000023'),
  (select earned_at + interval '30 days' from public.loyalty_rewards
    where id = 'ed000000-0000-4000-8000-000000000023'),
  'FIDELITE : l''échéance est gravée à l''émission + 30 jours');
select is(
  (select expires_at from public.reward_issuances
    where source_id = 'ed000000-0000-4000-8000-000000000023'),
  (select redeem_expires_at from public.loyalty_rewards
    where id = 'ed000000-0000-4000-8000-000000000023'),
  'FIDELITE : le registre porte la même échéance');

select is(
  (select redeem_expires_at from public.jackpot_wins
    where id = 'ed000000-0000-4000-8000-000000000031'),
  (select drawn_at + interval '30 days' from public.jackpot_wins
    where id = 'ed000000-0000-4000-8000-000000000031'),
  'JACKPOT : l''échéance est gravée à l''émission + 30 jours');
select is(
  (select expires_at from public.reward_issuances
    where source_id = 'ed000000-0000-4000-8000-000000000031'),
  (select redeem_expires_at from public.jackpot_wins
    where id = 'ed000000-0000-4000-8000-000000000031'),
  'JACKPOT : le registre porte la même échéance');

select is(
  (select redeem_expires_at from public.event_wins
    where id = 'ed000000-0000-4000-8000-000000000042'),
  (select created_at + interval '30 days' from public.event_wins
    where id = 'ed000000-0000-4000-8000-000000000042'),
  'EVENT : l''échéance est gravée à l''émission + 30 jours');
select is(
  (select expires_at from public.reward_issuances
    where source_id = 'ed000000-0000-4000-8000-000000000042'),
  (select redeem_expires_at from public.event_wins
    where id = 'ed000000-0000-4000-8000-000000000042'),
  'EVENT : le registre porte la même échéance');

select is(
  (select redeem_expires_at from public.calendar_openings
    where id = 'ed000000-0000-4000-8000-000000000053'),
  (select opened_at + interval '30 days' from public.calendar_openings
    where id = 'ed000000-0000-4000-8000-000000000053'),
  'CADEAU (case) : l''échéance est gravée à l''ouverture + 30 jours');
select is(
  (select expires_at from public.reward_issuances
    where source_id = 'ed000000-0000-4000-8000-000000000053'),
  (select redeem_expires_at from public.calendar_openings
    where id = 'ed000000-0000-4000-8000-000000000053'),
  'CADEAU (case) : le registre porte la même échéance');

select is(
  (select redeem_expires_at from public.calendar_rewards
    where id = 'ed000000-0000-4000-8000-000000000054'),
  (select created_at + interval '30 days' from public.calendar_rewards
    where id = 'ed000000-0000-4000-8000-000000000054'),
  'CADEAU (assiduité) : le MÊME réglage de calendrier grave la seconde table');
select is(
  (select expires_at from public.reward_issuances
    where source_id = 'ed000000-0000-4000-8000-000000000054'),
  (select redeem_expires_at from public.calendar_rewards
    where id = 'ed000000-0000-4000-8000-000000000054'),
  'CADEAU (assiduité) : le registre porte la même échéance');

select is(
  (select redeem_expires_at from public.referral_rewards
    where id = 'ed000000-0000-4000-8000-000000000063'),
  (select created_at + interval '30 days' from public.referral_rewards
    where id = 'ed000000-0000-4000-8000-000000000063'),
  'PARRAIN : l''échéance est gravée malgré une parente keyée par campaign_id');
select is(
  (select expires_at from public.reward_issuances
    where source_id = 'ed000000-0000-4000-8000-000000000063'),
  (select redeem_expires_at from public.referral_rewards
    where id = 'ed000000-0000-4000-8000-000000000063'),
  'PARRAIN : le registre porte la même échéance');

select is(
  (select redeem_expires_at from public.quiz_rewards
    where id = 'ed000000-0000-4000-8000-000000000073'),
  (select created_at + interval '30 days' from public.quiz_rewards
    where id = 'ed000000-0000-4000-8000-000000000073'),
  'QUIZ : l''échéance est gravée à l''émission + 30 jours');
select is(
  (select expires_at from public.reward_issuances
    where source_id = 'ed000000-0000-4000-8000-000000000073'),
  (select redeem_expires_at from public.quiz_rewards
    where id = 'ed000000-0000-4000-8000-000000000073'),
  'QUIZ : le registre porte la même échéance');

-- ══ 3. LE GEL, avec son témoin ══════════════════════════════
-- Un seul geste de commerçant, entre le gain et la venue du client : il
-- rebaptise sa chasse et ramène la validité de 30 à 7 jours.
update public.hunts
   set name = 'Chasse renommée',
       code_ttl_days = 7
 where id = 'ed000000-0000-4000-8000-000000000011';

select lives_ok(
  $$select public.sync_reward_issuance('hunt_completions', 'ed000000-0000-4000-8000-000000000015')$$,
  'resynchroniser le miroir ne lève rien');

-- Le témoin d'abord : SI celui-là ne bougeait pas, l'immobilité de l'échéance
-- ne dirait rien du gel — seulement que rien ne resynchronise.
select is(
  (select metadata ->> 'experience_label' from public.reward_issuances
    where source_id = 'ed000000-0000-4000-8000-000000000015'),
  'Chasse renommée',
  'TÉMOIN : le miroir a bien été réécrit — le nom de la chasse a suivi');
select is(
  (select redeem_expires_at from public.hunt_completions
    where id = 'ed000000-0000-4000-8000-000000000015'),
  (select completed_at + interval '30 days' from public.hunt_completions
    where id = 'ed000000-0000-4000-8000-000000000015'),
  'LE GEL : l''échéance déjà servie reste celle sous laquelle le client a gagné');
select is(
  (select expires_at from public.reward_issuances
    where source_id = 'ed000000-0000-4000-8000-000000000015'),
  (select completed_at + interval '30 days' from public.hunt_completions
    where id = 'ed000000-0000-4000-8000-000000000015'),
  'LE GEL : le registre non plus ne raccourcit pas un code déjà en poche');

-- Et le réglage n'est pas mort pour autant : la PROCHAINE émission porte la
-- nouvelle durée. Sans cette assertion, « rien n'a bougé » serait aussi la
-- signature d'un réglage qui ne sert à rien.
insert into public.hunt_completions (id, hunt_id, organization_id, player_id, code) values
  ('ed000000-0000-4000-8000-00000000001b',
   'ed000000-0000-4000-8000-000000000011',
   'ed000000-0000-4000-8000-000000000001',
   'ed000000-0000-4000-8000-00000000001a', 'CHASSE-KKKK2345');
select is(
  (select redeem_expires_at from public.hunt_completions
    where id = 'ed000000-0000-4000-8000-00000000001b'),
  (select completed_at + interval '7 days' from public.hunt_completions
    where id = 'ed000000-0000-4000-8000-00000000001b'),
  'LE RÉGLAGE EST VIVANT : une émission NEUVE porte les 7 jours, pas les 30');

-- ══ 4. Ce que la caisse en fait ═════════════════════════════
-- `now()` étant figé sur la transaction, « une seconde avant » et « une
-- seconde après » sont déterministes, pas des courses d'horloge.
update public.jackpot_wins set redeem_expires_at = now() + interval '1 second'
 where id = 'ed000000-0000-4000-8000-000000000031';
select is(
  (select r.state from public.redeem_reward_by_code(
     'ed000000-0000-4000-8000-000000000001', 'JACKPOT-DDDD2345',
     'ed000000-0000-4000-8000-0000000000a1') r),
  'redeemed',
  'une seconde AVANT l''échéance, le moteur unique remet le lot');
select isnt(
  (select redeemed_at from public.jackpot_wins
    where id = 'ed000000-0000-4000-8000-000000000031'),
  null::timestamptz,
  'et la source legacy a bien été remise — la remise n''est pas seulement un état rendu');

update public.event_wins set redeem_expires_at = now() - interval '1 second'
 where id = 'ed000000-0000-4000-8000-000000000042';
select is(
  (select r.state from public.redeem_reward_by_code(
     'ed000000-0000-4000-8000-000000000001', 'EVENT-EEEE2345',
     'ed000000-0000-4000-8000-0000000000a1') r),
  'expired',
  'une seconde APRÈS, le moteur unique refuse — et il DIT pourquoi');
select is(
  (select redeemed_at from public.event_wins
    where id = 'ed000000-0000-4000-8000-000000000042'),
  null::timestamptz,
  'et la source legacy reste intacte : rien n''a été consommé');

-- Le REPLI legacy, appelé directement — c'est le chemin qu'emprunte la caisse
-- quand le registre est injoignable, et le seul moment où sa garde compte.
update public.calendar_openings set redeem_expires_at = now() - interval '1 second'
 where id = 'ed000000-0000-4000-8000-000000000053';
select is(
  (select r.redeemed_now from public.redeem_calendar_reward(
     'ed000000-0000-4000-8000-000000000001', 'CADEAU-FFFF2345', 'caissier') r),
  false,
  'LE REPLI LEGACY refuse aussi un code expiré — une panne du registre ne remet plus de lots périmés');
select is(
  (select count(*) from public.redeem_calendar_reward(
     'ed000000-0000-4000-8000-000000000001', 'CADEAU-FFFF2345', 'caissier')),
  1::bigint,
  'et la lecture de retour rend quand même la ligne : la caisse peut répondre au client');

-- ══ 5. Les bornes du réglage ════════════════════════════════
select throws_ok(
  $$update public.hunts set code_ttl_days = 0
     where id = 'ed000000-0000-4000-8000-000000000010'$$,
  '23514',
  null,
  'zéro jour est refusé : un lot mort à l''émission ne se règle pas par accident');
select throws_ok(
  $$update public.hunts set code_ttl_days = 366
     where id = 'ed000000-0000-4000-8000-000000000010'$$,
  '23514',
  null,
  'au-delà d''un an, c''est `null` (sans limite) qui le dit honnêtement');
select lives_ok(
  $$update public.hunts set code_ttl_days = 1
     where id = 'ed000000-0000-4000-8000-000000000010'$$,
  'un jour est la borne basse admise');
select lives_ok(
  $$update public.hunts set code_ttl_days = 365
     where id = 'ed000000-0000-4000-8000-000000000010'$$,
  'un an est la borne haute admise');

-- ══ 6. La purge ne détruit pas ce qui vient d'expirer ═══════
-- Le critère d'expiration est ANDé au critère d'âge dans
-- `purge_expired_reward_issuances` : un lot périmé hier survit, sinon la
-- caisse répondrait « code introuvable » à un client qui mérite « expiré ».
update public.loyalty_rewards set redeem_expires_at = now() - interval '1 day'
 where id = 'ed000000-0000-4000-8000-000000000023';
select ok(
  (select expires_at < now() from public.reward_issuances
    where source_id = 'ed000000-0000-4000-8000-000000000023'),
  'PRÉMISSE : le lot de fidélité est bien expiré au registre');

select lives_ok(
  $$select public.purge_expired_reward_issuances()$$,
  'la purge de rétention du registre s''exécute');
select is(
  (select count(*) from public.reward_issuances
    where source_id = 'ed000000-0000-4000-8000-000000000023'),
  1::bigint,
  'un lot EXPIRÉ mais plus jeune que la rétention n''est PAS purgé — il reste pour EXPLIQUER');

-- La contre-épreuve, sans laquelle « il survit » serait indistinguable de
-- « la purge ne fait rien » : vieilli au-delà de la fenêtre de rétention, le
-- même lot expiré est bien détruit.
update public.loyalty_rewards set earned_at = now() - interval '3 years'
 where id = 'ed000000-0000-4000-8000-000000000023';
select is(
  (select count(*) from public.reward_issuances
    where source_id = 'ed000000-0000-4000-8000-000000000023'
      and expires_at < now()
      and issued_at < now() - interval '2 years'),
  1::bigint,
  'CONTRE-ÉPREUVE, prémisse : le vieillissement a été miroité et l''échéance tient');
select lives_ok(
  $$select public.purge_expired_reward_issuances()$$,
  'la purge repasse après le vieillissement');
select is(
  (select count(*) from public.reward_issuances
    where source_id = 'ed000000-0000-4000-8000-000000000023'),
  0::bigint,
  'CONTRE-ÉPREUVE : passé la rétention, le lot expiré EST purgé — la purge mord bien');

-- ══ 7. Le catalogue VIVANT, jamais un fichier ══════════════
-- Une garde qui lit un fichier de migration prouve qu'un texte a été écrit,
-- jamais qu'il est INSTALLÉ : une redéfinition ultérieure passerait.
select ok(
  exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'sync_reward_issuance'
      and p.prosrc like '%ÉCHÉANCE GRAVÉE À L''ÉMISSION (20260904120000)%'
      and p.prosrc not like '%null::timestamptz as expires_at%'
  ),
  'le corps INSTALLÉ de sync_reward_issuance lit l''échéance, et plus AUCUNE branche ne rend null');

select is_empty(
  $$select nom from unnest(array[
      'redeem_hunt_completion', 'redeem_loyalty_reward',
      'redeem_jackpot_prize', 'redeem_event_prize',
      'redeem_calendar_reward', 'redeem_referral_reward',
      'redeem_quiz_reward'
    ]) as nom
     where not exists (
       select 1 from pg_proc p
       join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname = nom
         and p.prosrc like '%ÉCHÉANCE OPPOSÉE AU REPLI LEGACY (20260904120000)%')$$,
  'les SEPT RPC de repli portent le prédicat d''échéance dans leur corps installé — la requête NOMME celles qui manqueraient');

select * from finish();
rollback;
