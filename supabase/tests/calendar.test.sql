-- ============================================================
-- Calendrier / campagnes quotidiennes — comportement réel des RPC sur
-- base migrée vierge (fixtures locales) :
--   1. join_calendar : idempotent (re-join = même joueur, opt-in conservés) ;
--      email + opt-in enregistrés ; addon coupé / slug inconnu / non actif →
--      'unavailable'.
--   2. open_calendar_box : GATING SERVEUR — case future refusée ('too_early',
--      aucune ouverture créée).
--   3. Ouverture d'une case 'content' / 'lot' / 'spin'.
--   4. Anti-double : ré-ouverture d'un même jour → 'already_opened' (même
--      contenu, unicité (joueur, jour)).
--   5. Stock fini épuisé sur une case 'lot' → 'out_of_stock' (aucun code émis,
--      pas de sur-émission).
--   6. Completion : ouvrir la DERNIÈRE case → récompense d'assiduité (code
--      CADEAU-…), stock fini décrémenté.
--   7. NON-FUITE : le contenu d'une case NON ouverte n'est PAS lisible via
--      calendar_public_state (ni content_type, ni texte, ni code).
--   8. consume_calendar_spin_grant : usage unique (spun → already_consumed),
--      grant étranger → 'unavailable'.
--   9. Caisse : redeem_calendar_reward — lot de case ET récompense d'assiduité,
--      cross-org = zéro ligne, double retrait refusé, audit.
--  10. calendar_reminder_targets : cible un joueur opt-in avec une case
--      ouvrable aujourd'hui non ouverte.
--  11. Purge RGPD : joueurs des calendriers archivés purgés au-delà de la
--      rétention.
-- ============================================================
begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

select set_config('request.jwt.claims', '{"role":"service_role"}', true);

-- ── Fixtures ─────────────────────────────────────────────────
insert into public.organizations (id, name, slug, addon_calendar, data_retention_months, timezone)
values ('ca000000-0000-4000-8000-000000000001', 'Test Calendar', 'tap-calendar-org', true, 6, 'Europe/Paris');
-- Seconde organisation : preuve du cloisonnement de la caisse.
insert into public.organizations (id, name, slug, addon_calendar)
values ('ca000000-0000-4000-8000-0000000000ff', 'Autre Org', 'tap-calendar-org-2', true);
-- Troisième organisation : addon COUPÉ (preuve du verrou d'addon).
insert into public.organizations (id, name, slug, addon_calendar)
values ('ca000000-0000-4000-8000-0000000000fe', 'Sans Addon', 'tap-calendar-org-3', false);

-- Roue cible du tour offert (case 'spin') : un lot gagnant (poids 100, stock
-- fini) et un perdant (poids 0, jamais tiré) → tirage déterministe.
insert into public.campaigns (id, organization_id, name, status)
values ('ca000000-0000-4000-8000-000000000005',
        'ca000000-0000-4000-8000-000000000001', 'Campagne roue calendrier', 'active');
insert into public.wheels (id, organization_id, campaign_id, name, play_limit)
values ('ca000000-0000-4000-8000-000000000006',
        'ca000000-0000-4000-8000-000000000001',
        'ca000000-0000-4000-8000-000000000005', 'Roue calendrier', 'unlimited');
insert into public.prizes (id, organization_id, wheel_id, label, weight, is_losing, position, stock)
values
  ('ca000000-0000-4000-8000-000000000007', 'ca000000-0000-4000-8000-000000000001',
   'ca000000-0000-4000-8000-000000000006', 'Lot calendrier', 100, false, 0, 100),
  ('ca000000-0000-4000-8000-000000000008', 'ca000000-0000-4000-8000-000000000001',
   'ca000000-0000-4000-8000-000000000006', 'Perdu (jamais tiré)', 0, true, 1, null);

-- Calendrier principal actif : day_count=3, cases content / lot / spin toutes
-- ouvrables (unlock_at passé). public_slug déterministe. Récompense d'assiduité
-- à stock fini.
insert into public.calendars (
  id, organization_id, name, theme, status, start_date, timezone, day_count,
  public_slug, merchant_content, completion_reward_label, completion_reward_stock
) values (
  'ca000000-0000-4000-8000-000000000010', 'ca000000-0000-4000-8000-000000000001',
  'Avent de test', 'noel', 'active', current_date, 'Europe/Paris', 3,
  'tap-calendar', 'Une surprise chaque jour', 'Grand panier de test', 5
);
insert into public.calendar_days (
  id, calendar_id, organization_id, day_index, unlock_at, content_type,
  content_text, reward_label, reward_stock, target_wheel_id, is_special
) values
  ('ca000000-0000-4000-8000-000000000011', 'ca000000-0000-4000-8000-000000000010',
   'ca000000-0000-4000-8000-000000000001', 1, now() - interval '1 hour', 'content',
   'Bienvenue — offre du jour', '', null, null, false),
  ('ca000000-0000-4000-8000-000000000012', 'ca000000-0000-4000-8000-000000000010',
   'ca000000-0000-4000-8000-000000000001', 2, now() - interval '1 hour', 'lot',
   null, 'Café offert', 1, null, true),
  ('ca000000-0000-4000-8000-000000000013', 'ca000000-0000-4000-8000-000000000010',
   'ca000000-0000-4000-8000-000000000001', 3, now() - interval '1 hour', 'spin',
   null, '', null, 'ca000000-0000-4000-8000-000000000006', false);

-- Calendrier « futur » : une case verrouillée (unlock_at à venir) pour le gating.
insert into public.calendars (
  id, organization_id, name, status, start_date, timezone, day_count,
  public_slug, completion_reward_stock
) values (
  'ca000000-0000-4000-8000-000000000020', 'ca000000-0000-4000-8000-000000000001',
  'Compte à rebours', 'active', current_date, 'Europe/Paris', 1, 'tap-cal-future', 1
);
insert into public.calendar_days (
  id, calendar_id, organization_id, day_index, unlock_at, content_type, reward_label, reward_stock
) values (
  'ca000000-0000-4000-8000-000000000021', 'ca000000-0000-4000-8000-000000000020',
  'ca000000-0000-4000-8000-000000000001', 1, now() + interval '2 days', 'lot', 'Lot futur', 1
);

-- Calendrier sur l'organisation SANS addon (preuve du verrou d'addon au join).
insert into public.calendars (
  id, organization_id, name, status, start_date, timezone, day_count,
  public_slug, completion_reward_stock
) values (
  'ca000000-0000-4000-8000-000000000030', 'ca000000-0000-4000-8000-0000000000fe',
  'Calendrier sans addon', 'active', current_date, 'Europe/Paris', 1, 'tap-cal-noaddon', 1
);

create temporary table tap_r (r jsonb) on commit drop;

-- ══ 1. join_calendar : addon / slug / idempotence / opt-in ═══
select is((public.join_calendar('slug-inconnu', repeat('a', 64)))->>'state',
  'unavailable', 'join refusé pour un slug inconnu');
select is((public.join_calendar('tap-cal-noaddon', repeat('a', 64)))->>'state',
  'unavailable', 'join refusé quand l''addon est coupé');

-- join valide avec email + opt-in.
insert into tap_r select public.join_calendar(
  'tap-calendar', repeat('a', 64), 'Alice@Test.Local', true, true);
select is((select r->>'state' from tap_r), 'joined', 'join valide → joined');
select is((select (r->'player'->>'has_email')::boolean from tap_r), true,
  'email opt-in enregistré');
delete from tap_r;
select is((select email from public.calendar_players
             where calendar_id = 'ca000000-0000-4000-8000-000000000010'
               and token_hash = repeat('a', 64)),
  'alice@test.local', 'email normalisé (minuscules, trim) et stocké');
select is((select reminder_opt_in from public.calendar_players
             where calendar_id = 'ca000000-0000-4000-8000-000000000010'
               and token_hash = repeat('a', 64)),
  true, 'reminder_opt_in enregistré');

-- Idempotence : re-join sans email ne crée pas de doublon ni n'efface l'email.
select public.join_calendar('tap-calendar', repeat('a', 64));
select is((select count(*)::int from public.calendar_players
             where calendar_id = 'ca000000-0000-4000-8000-000000000010'
               and token_hash = repeat('a', 64)),
  1, 're-join ne crée pas de doublon (idempotent)');
select is((select email from public.calendar_players
             where calendar_id = 'ca000000-0000-4000-8000-000000000010'
               and token_hash = repeat('a', 64)),
  'alice@test.local', 're-join sans email préserve l''email déjà donné');

-- ══ 2. open_calendar_box : gating serveur (case future) ══════
select is((public.open_calendar_box(
    'ca000000-0000-4000-8000-000000000020', repeat('a', 64),
    'ca000000-0000-4000-8000-000000000021'))->>'state',
  'too_early', 'ouverture refusée avant unlock_at (too_early)');
select is((select count(*)::int from public.calendar_openings
             where day_id = 'ca000000-0000-4000-8000-000000000021'),
  0, 'aucune ouverture créée quand c''est trop tôt');

-- ══ 3. Ouverture content / lot / spin (Alice) ════════════════
-- Case 'content' : renvoie le message, aucune émission.
insert into tap_r select public.open_calendar_box(
  'ca000000-0000-4000-8000-000000000010', repeat('a', 64),
  'ca000000-0000-4000-8000-000000000011');
select is((select r->>'state' from tap_r), 'opened', 'case content ouverte');
select is((select r->>'content_text' from tap_r), 'Bienvenue — offre du jour',
  'case content : message renvoyé');
select is((select (r->'progression'->>'opened_count')::int from tap_r), 1,
  'progression : 1 case ouverte');
delete from tap_r;

-- Case 'lot' : code CADEAU-…, stock décrémenté.
insert into tap_r select public.open_calendar_box(
  'ca000000-0000-4000-8000-000000000010', repeat('a', 64),
  'ca000000-0000-4000-8000-000000000012');
select is((select r->>'state' from tap_r), 'opened', 'case lot ouverte');
select ok((select r->>'code' ~ '^CADEAU-[A-HJ-NP-Z2-9]{8}$' from tap_r),
  'case lot : code CADEAU-… au bon format');
select is((select (r->>'out_of_stock')::boolean from tap_r), false,
  'case lot : stock disponible → pas de rupture');
delete from tap_r;
select is((select reward_claimed_count from public.calendar_days
             where id = 'ca000000-0000-4000-8000-000000000012'),
  1, 'stock du lot décrémenté (reward_claimed_count)');

-- ══ 4. Anti-double : ré-ouverture du même jour ═══════════════
insert into tap_r select public.open_calendar_box(
  'ca000000-0000-4000-8000-000000000010', repeat('a', 64),
  'ca000000-0000-4000-8000-000000000012');
select is((select r->>'state' from tap_r), 'already_opened',
  'ré-ouverture d''un jour déjà ouvert → already_opened');
select ok((select r->>'code' ~ '^CADEAU-[A-HJ-NP-Z2-9]{8}$' from tap_r),
  'already_opened : même code renvoyé');
delete from tap_r;
select is((select count(*)::int from public.calendar_openings
             where day_id = 'ca000000-0000-4000-8000-000000000012'
               and player_id = (select id from public.calendar_players
                 where calendar_id = 'ca000000-0000-4000-8000-000000000010'
                   and token_hash = repeat('a', 64))),
  1, 'une seule ouverture par (joueur, jour)');

-- ══ 3bis / 6. Case 'spin' → dernière case → completion ═══════
insert into tap_r select public.open_calendar_box(
  'ca000000-0000-4000-8000-000000000010', repeat('a', 64),
  'ca000000-0000-4000-8000-000000000013');
select is((select r->>'state' from tap_r), 'opened', 'case spin ouverte');
select ok((select r->>'spin_grant_token' ~ '^[0-9a-f]{48}$' from tap_r),
  'case spin : grant_token à usage unique émis');
select is((select r->'day'->>'target_wheel_id' from tap_r),
  'ca000000-0000-4000-8000-000000000006', 'case spin : roue cible renvoyée');
-- 3 cases sur 3 ouvertes → récompense d'assiduité.
select is((select (r->'completion'->>'rewarded')::boolean from tap_r), true,
  'completion : toutes les cases ouvertes → récompense d''assiduité');
select ok((select r->'completion'->>'code' ~ '^CADEAU-[A-HJ-NP-Z2-9]{8}$' from tap_r),
  'completion : code CADEAU-… émis');
delete from tap_r;
select is((select completion_reward_claimed_count from public.calendars
             where id = 'ca000000-0000-4000-8000-000000000010'),
  1, 'completion : stock d''assiduité décrémenté');
select is((select count(*)::int from public.calendar_rewards
             where calendar_id = 'ca000000-0000-4000-8000-000000000010'),
  1, 'completion : une récompense d''assiduité créée');

-- ══ 5. Stock fini épuisé (Bob sur la case lot) ═══════════════
-- La case lot avait un stock de 1, déjà consommé par Alice.
insert into tap_r select public.open_calendar_box(
  'ca000000-0000-4000-8000-000000000010', repeat('b', 64),
  'ca000000-0000-4000-8000-000000000012');
select is((select r->>'state' from tap_r), 'opened', 'Bob ouvre la case lot (rupture)');
select is((select (r->>'out_of_stock')::boolean from tap_r), true,
  'stock épuisé → out_of_stock');
select is((select r->>'code' from tap_r), null,
  'stock épuisé → aucun code émis (pas de sur-émission)');
delete from tap_r;
select is((select reward_claimed_count from public.calendar_days
             where id = 'ca000000-0000-4000-8000-000000000012'),
  1, 'stock épuisé : reward_claimed_count inchangé (borne respectée)');

-- ══ 7. NON-FUITE : case non ouverte non lisible (public_state) ══
-- Bob n'a ouvert QUE la case 2 (rupture). Les cases 1 et 3 ne doivent exposer
-- AUCUN contenu (ni content_type, ni texte, ni code) dans SA vue publique.
insert into tap_r select public.calendar_public_state(
  'ca000000-0000-4000-8000-000000000010', repeat('b', 64));
select is((select r->>'state' from tap_r), 'ok', 'calendar_public_state OK');
-- Case 1 (non ouverte par Bob) : statut temporel seul, pas de content_type.
select ok((select not (elem ? 'content_type')
             from tap_r, jsonb_array_elements(r->'days') elem
            where (elem->>'day_index')::int = 1),
  'case non ouverte : content_type NON exposé');
select ok((select not (elem ? 'content_text')
             from tap_r, jsonb_array_elements(r->'days') elem
            where (elem->>'day_index')::int = 1),
  'case non ouverte : content_text NON exposé');
select is((select elem->>'status'
             from tap_r, jsonb_array_elements(r->'days') elem
            where (elem->>'day_index')::int = 1),
  'available', 'case non ouverte mais déverrouillée : statut available');
-- Case 2 (ouverte par Bob) : elle, expose son content_type.
select ok((select elem ? 'content_type'
             from tap_r, jsonb_array_elements(r->'days') elem
            where (elem->>'day_index')::int = 2),
  'case ouverte par le joueur : content_type exposé (à lui seul)');
delete from tap_r;

-- ══ 8. consume_calendar_spin_grant : usage unique ═══════════
create temporary table tap_grant (g text) on commit drop;
insert into tap_grant select spin_grant_token from public.calendar_openings
 where day_id = 'ca000000-0000-4000-8000-000000000013'
   and player_id = (select id from public.calendar_players
     where calendar_id = 'ca000000-0000-4000-8000-000000000010'
       and token_hash = repeat('a', 64));
-- Grant étranger → unavailable.
select is((public.consume_calendar_spin_grant(
    'ca000000-0000-4000-8000-000000000010', repeat('a', 64),
    repeat('0', 48)))->>'state',
  'unavailable', 'grant inconnu → unavailable');
-- Grant valide → spun (tirage déterministe sur le lot gagnant).
insert into tap_r select public.consume_calendar_spin_grant(
  'ca000000-0000-4000-8000-000000000010', repeat('a', 64),
  (select g from tap_grant));
select is((select r->>'state' from tap_r), 'spun', 'grant valide → spun');
select is((select (r->>'is_losing')::boolean from tap_r), false,
  'tirage déterministe : lot gagnant');
delete from tap_r;
-- Second appel → already_consumed (anti-rejeu).
select is((public.consume_calendar_spin_grant(
    'ca000000-0000-4000-8000-000000000010', repeat('a', 64),
    (select g from tap_grant)))->>'state',
  'already_consumed', 'grant déjà consommé → already_consumed');

-- ══ 9. Caisse : redeem_calendar_reward (lot + assiduité) ════
create temporary table tap_code (code text) on commit drop;
-- Code du lot de case (Alice, jour 2).
insert into tap_code select code from public.calendar_openings
 where day_id = 'ca000000-0000-4000-8000-000000000012'
   and content_type = 'lot' and code is not null
   and player_id = (select id from public.calendar_players
     where calendar_id = 'ca000000-0000-4000-8000-000000000010'
       and token_hash = repeat('a', 64));

-- Cross-org → aucune ligne (refus générique, org-scopé).
select is((select count(*)::int from public.redeem_calendar_reward(
    'ca000000-0000-4000-8000-0000000000ff', (select code from tap_code), 'caisse-autre')),
  0, 'code d''une autre organisation : aucune ligne');
-- Retrait valide (insensible à la casse).
select is((select redeemed_now from public.redeem_calendar_reward(
    'ca000000-0000-4000-8000-000000000001', lower((select code from tap_code)), 'caisse-1')),
  true, 'lot de case : retrait valide');
-- Double retrait refusé.
select is((select redeemed_now from public.redeem_calendar_reward(
    'ca000000-0000-4000-8000-000000000001', (select code from tap_code), 'caisse-1')),
  false, 'lot de case : pas de double retrait');

-- Récompense d'assiduité : même caisse unifiée (source calendar_rewards).
create temporary table tap_ccode (code text) on commit drop;
insert into tap_ccode select code from public.calendar_rewards
 where calendar_id = 'ca000000-0000-4000-8000-000000000010';
select is((select redeemed_now from public.redeem_calendar_reward(
    'ca000000-0000-4000-8000-000000000001', (select code from tap_ccode), 'caisse-1')),
  true, 'récompense d''assiduité : retrait valide (caisse unifiée)');
select is((select source from public.redeem_calendar_reward(
    'ca000000-0000-4000-8000-000000000001', (select code from tap_ccode), 'caisse-1')),
  'completion', 'récompense d''assiduité : source completion');

-- Audit journalisé.
select ok(exists (select 1 from public.audit_logs
             where organization_id = 'ca000000-0000-4000-8000-000000000001'
               and action = 'calendar.redeem'),
  'le retrait est audité');

-- ══ 10. calendar_reminder_targets ═══════════════════════════
-- Carla : opt-in reminder + email, n'a ouvert aucune case (toutes ouvrables
-- aujourd'hui) → ciblée par le rappel. Alice a tout ouvert → non ciblée.
select public.join_calendar('tap-calendar', repeat('c', 64), 'carla@test.local', false, true);
select ok(exists (
    select 1 from public.calendar_reminder_targets('ca000000-0000-4000-8000-000000000001')
     where email = 'carla@test.local'),
  'reminder_targets cible un joueur opt-in avec une case ouvrable non ouverte');
select ok(not exists (
    select 1 from public.calendar_reminder_targets('ca000000-0000-4000-8000-000000000001')
     where email = 'alice@test.local'),
  'reminder_targets ignore un joueur ayant tout ouvert');

-- ══ 11. Purge RGPD ═══════════════════════════════════════════
-- Calendrier archivé + rétention 6 mois : joueurs créés il y a 7 mois purgés.
update public.calendars set status = 'archived'
 where id = 'ca000000-0000-4000-8000-000000000010';
update public.calendar_players set created_at = now() - interval '7 months'
 where calendar_id = 'ca000000-0000-4000-8000-000000000010';
select ok(public.purge_expired_calendar_players() >= 2,
  'purge supprime les joueurs des calendriers archivés au-delà de la rétention');
select is((select count(*)::int from public.calendar_players
             where calendar_id = 'ca000000-0000-4000-8000-000000000010'),
  0, 'joueurs purgés');
-- Les ouvertures cascadent avec les joueurs purgés.
select is((select count(*)::int from public.calendar_openings
             where calendar_id = 'ca000000-0000-4000-8000-000000000010'),
  0, 'les ouvertures cascadent à la purge des joueurs');

select * from finish();
rollback;
