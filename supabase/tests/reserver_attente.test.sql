-- ============================================================
-- LE MODE ATTENTE ACTIVE NE TOUCHE PAS À L'ATTENTE (RES-4, lot L7)
--
-- Ce que ce fichier prouve, et dans quel ordre :
--
--   1. UNE SESSION PAR SOURCE, ET ELLE EST IDEMPOTENTE. Rouvrir rend LA MÊME
--      session, jamais une seconde ligne — sur une entrée de file comme sur une
--      réservation, les deux formes d'attente du produit.
--   2. CE QUI N'OUVRE PAS. Source d'un AUTRE joueur, source MORTE (servie,
--      annulée), source inconnue, source du VOISIN, organisation sans le droit
--      `vitrine` : le MÊME état muet pour les cinq. Les distinguer aurait donné
--      un oracle sur qui se trouve dans le magasin d'en face.
--   3. L'INVARIANT N°1 DU CAHIER, PROUVÉ PAR PHOTOGRAPHIE. Les quatre tables
--      d'attente — entrées de file, réservations, créneaux, liste prioritaire —
--      sont photographiées AVANT le premier appel d'animation et comparées APRÈS
--      le dernier. Colonne par colonne, ligne par ligne. Et les RANGS avec :
--      « 1er sur 2 » avant, « 1er sur 2 » après. C'est le critère « le jeu ne
--      peut ni lire ni modifier rang, priorité, capacité, accès, délai ou droit
--      à une place », et c'est la raison d'être de ce fichier.
--   4. UNE PAUSE CHANCE, UNE SEULE, PAR SESSION. Le second appel rend
--      `already_used` et le MÊME jeton ; l'horodatage ne bouge pas.
--   5. LE TOUR OFFERT EST ORDINAIRE, ET À USAGE UNIQUE. Il tire par la même
--      mécanique que les quatre frères, écrit un `spins` de source
--      `reserver_wait`, décrémente le stock, et ne se rejoue pas.
--   6. BORNE 2 — un lot à stock ILLIMITÉ n'est pas tirable par un tour offert,
--      et le jeton n'est PAS brûlé quand il n'y a rien à gagner.
--   7. L'ORGANISATION VOISINE EST MUETTE, et elle n'est pas muette parce qu'elle
--      serait cassée : sa propre session s'ouvre normalement.
--   8. ACL ET RLS. La table neuve est fermée à `anon` ET à `authenticated` au
--      niveau TABLE, ne porte AUCUNE policy, et les trois RPC ne sont
--      exécutables que par `service_role`.
--
-- ── CE QUE CE FICHIER NE PROUVE PAS, ET IL FAUT LE DIRE ──
--
-- pgTAP tourne dans UNE session et UNE transaction : il ne peut pas lancer deux
-- `wait_session_use_pause` réellement simultanés. Ce qui est prouvé ici, c'est
-- (a) que le second appel VOIT le premier et rend `already_used` sans repasser
-- l'horodatage, et (b) que la clause qui rend la course sûre — `and
-- pause_chance_used_at is null` — EST bien dans le corps de la fonction, lu dans
-- le catalogue vivant. La sérialisation elle-même est une propriété de l'écriture
-- de ligne de Postgres ; prétendre le contraire serait un vert qui ne prouve
-- rien. Même honnêteté que `reserver_queue.test.sql` sur son verrou d'avis.
--
-- Le fichier doit passer sur une base VIDE comme sur une base SEMÉE : toutes les
-- assertions sont bornées aux organisations créées ici, aucune ne compte
-- globalement.
-- ============================================================
begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

select set_config('request.jwt.claims', '{"role":"service_role"}', true);

-- ── Fixtures ─────────────────────────────────────────────────
-- A : SERVIE — droit `vitrine` par OCTROI daté vivant (seul chemin ouvert en
--     bêta, 20261001120000).
-- B : VOISINE, servie elle aussi — sans quoi « le voisin ne voit rien » se
--     confondrait avec « le voisin n'a pas le module ».
-- C : SANS le droit.
insert into public.organizations
  (id, name, slug, subscription_status, plan, timezone, data_retention_months)
values
  ('4f22e000-0000-4000-8000-00000000000a', 'Attente A', 'tap-attente-a',
   'active', 'starter', 'Europe/Paris', 6),
  ('4f22e000-0000-4000-8000-00000000000b', 'Attente B', 'tap-attente-b',
   'active', 'starter', 'Europe/Paris', 6),
  ('4f22e000-0000-4000-8000-00000000000c', 'Attente C', 'tap-attente-c',
   'active', 'starter', 'Europe/Paris', 6);

insert into public.organization_module_grants
  (organization_id, module, kind, source, starts_at, ends_at)
values
  ('4f22e000-0000-4000-8000-00000000000a', 'vitrine', 'pass', 'backoffice',
   now() - interval '1 day', now() + interval '365 days'),
  ('4f22e000-0000-4000-8000-00000000000b', 'vitrine', 'pass', 'backoffice',
   now() - interval '1 day', now() + interval '365 days');

-- ── Les deux animations, qui sont des fixtures EXISTANTES du produit ──
-- Un quiz ACTIF et un quiz ARCHIVÉ : le second prouve que la configuration
-- n'est proposée que si elle est jouable.
insert into public.quizzes (
  id, organization_id, name, status, public_slug,
  reward_mode, reward_label, reward_stock
) values
  ('4f22e000-0000-4000-8000-000000000401', '4f22e000-0000-4000-8000-00000000000a',
   'Quiz éclair', 'active', 'tap-attente-quiz', 'none', '', 0),
  ('4f22e000-0000-4000-8000-000000000402', '4f22e000-0000-4000-8000-00000000000a',
   'Quiz rangé', 'archived', 'tap-attente-quiz-off', 'none', '', 0),
  ('4f22e000-0000-4000-8000-000000000451', '4f22e000-0000-4000-8000-00000000000b',
   'Quiz du voisin', 'active', 'tap-attente-quiz-b', 'none', '', 0);

-- CAMPAGNE DOTÉE : un lot gagnant à stock FINI de 3, un perdant à poids 0 (donc
-- jamais tiré — il est hors du filtre `weight > 0`). Trois tours possibles, puis
-- la roue n'a plus rien : c'est ce qui permet de prouver, dans le même fichier,
-- et que le tour offert gagne, et que le stock est réellement décompté.
insert into public.campaigns (id, organization_id, name, status)
values ('4f22e000-0000-4000-8000-000000000501',
        '4f22e000-0000-4000-8000-00000000000a', 'Pause Chance', 'active');
insert into public.wheels (id, organization_id, campaign_id, name, play_limit)
values ('4f22e000-0000-4000-8000-000000000502',
        '4f22e000-0000-4000-8000-00000000000a',
        '4f22e000-0000-4000-8000-000000000501', 'Roue de la pause', 'unlimited');
insert into public.prizes
  (id, organization_id, wheel_id, label, weight, is_losing, position, stock)
values
  ('4f22e000-0000-4000-8000-000000000503', '4f22e000-0000-4000-8000-00000000000a',
   '4f22e000-0000-4000-8000-000000000502', 'Café offert', 100, false, 0, 3),
  ('4f22e000-0000-4000-8000-000000000504', '4f22e000-0000-4000-8000-00000000000a',
   '4f22e000-0000-4000-8000-000000000502', 'Perdu (jamais tiré)', 0, true, 1, null);

-- CAMPAGNE TOUT ILLIMITÉ : un seul lot, gagnant, à stock `null`. BORNE 2 doit
-- l'exclure — donc `no_prize`, et le jeton NON consommé.
insert into public.campaigns (id, organization_id, name, status)
values ('4f22e000-0000-4000-8000-000000000511',
        '4f22e000-0000-4000-8000-00000000000a', 'Pause illimitée', 'active');
insert into public.wheels (id, organization_id, campaign_id, name, play_limit)
values ('4f22e000-0000-4000-8000-000000000512',
        '4f22e000-0000-4000-8000-00000000000a',
        '4f22e000-0000-4000-8000-000000000511', 'Roue illimitée', 'unlimited');
insert into public.prizes
  (id, organization_id, wheel_id, label, weight, is_losing, position, stock)
values
  ('4f22e000-0000-4000-8000-000000000513', '4f22e000-0000-4000-8000-00000000000a',
   '4f22e000-0000-4000-8000-000000000512', 'Lot sans fin', 100, false, 0, null);

-- CAMPAGNE ARCHIVÉE : BORNE 3 — statut de campagne.
insert into public.campaigns (id, organization_id, name, status)
values ('4f22e000-0000-4000-8000-000000000521',
        '4f22e000-0000-4000-8000-00000000000a', 'Pause rangée', 'archived');
insert into public.wheels (id, organization_id, campaign_id, name, play_limit)
values ('4f22e000-0000-4000-8000-000000000522',
        '4f22e000-0000-4000-8000-00000000000a',
        '4f22e000-0000-4000-8000-000000000521', 'Roue rangée', 'unlimited');
insert into public.prizes
  (id, organization_id, wheel_id, label, weight, is_losing, position, stock)
values
  ('4f22e000-0000-4000-8000-000000000523', '4f22e000-0000-4000-8000-00000000000a',
   '4f22e000-0000-4000-8000-000000000522', 'Lot rangé', 100, false, 0, 5);

-- La campagne du VOISIN, pour que sa session ait quelque chose à proposer.
insert into public.campaigns (id, organization_id, name, status)
values ('4f22e000-0000-4000-8000-000000000551',
        '4f22e000-0000-4000-8000-00000000000b', 'Pause voisine', 'active');

-- ── Les files, une par cas ───────────────────────────────────
insert into public.reservation_queues
  (id, organization_id, activity_id, name, status, max_live_entries,
   wait_quiz_id, wait_pause_campaign_id)
values
  -- Q1 : LA file principale, entièrement configurée.
  ('4f22e000-0000-4000-8000-000000000601',
   '4f22e000-0000-4000-8000-00000000000a', null, 'Comptoir', 'open', 50,
   '4f22e000-0000-4000-8000-000000000401', '4f22e000-0000-4000-8000-000000000501'),
  -- Q2 : AUCUNE animation — le défaut du produit, et le cas `unconfigured`.
  ('4f22e000-0000-4000-8000-000000000602',
   '4f22e000-0000-4000-8000-00000000000a', null, 'Sans animation', 'open', 50,
   null, null),
  -- Q3 : quiz ARCHIVÉ + campagne TOUT ILLIMITÉ.
  ('4f22e000-0000-4000-8000-000000000603',
   '4f22e000-0000-4000-8000-00000000000a', null, 'Animation fanée', 'open', 50,
   '4f22e000-0000-4000-8000-000000000402', '4f22e000-0000-4000-8000-000000000511'),
  -- Q4 : campagne ARCHIVÉE (BORNE 3 au moment de tirer).
  ('4f22e000-0000-4000-8000-000000000604',
   '4f22e000-0000-4000-8000-00000000000a', null, 'Campagne rangée', 'open', 50,
   null, '4f22e000-0000-4000-8000-000000000521'),
  -- VOISINE, configurée elle aussi.
  ('4f22e000-0000-4000-8000-000000000651',
   '4f22e000-0000-4000-8000-00000000000b', null, 'Comptoir voisin', 'open', 50,
   '4f22e000-0000-4000-8000-000000000451', '4f22e000-0000-4000-8000-000000000551'),
  -- SANS le droit `vitrine`.
  ('4f22e000-0000-4000-8000-000000000671',
   '4f22e000-0000-4000-8000-00000000000c', null, 'Comptoir sans droit', 'open', 50,
   null, null);

-- ── Les entrées ──────────────────────────────────────────────
-- E1 et E2 dans Q1, DANS CET ORDRE : E1 est 1er, E2 est 2e. Ce sont les deux
-- rangs que la section 3 photographie.
insert into public.reservation_queue_entries
  (id, queue_id, organization_id, player_key_hash, display_name, status)
values
  ('4f22e000-0000-4000-8000-000000000701', '4f22e000-0000-4000-8000-000000000601',
   '4f22e000-0000-4000-8000-00000000000a', repeat('a1', 32), 'Alix', 'waiting');
insert into public.reservation_queue_entries
  (id, queue_id, organization_id, player_key_hash, display_name, status)
values
  ('4f22e000-0000-4000-8000-000000000702', '4f22e000-0000-4000-8000-000000000601',
   '4f22e000-0000-4000-8000-00000000000a', repeat('a2', 32), 'Bilal', 'waiting');

-- E3 : SERVIE. Source MORTE — `called_at` obligatoire (contrainte
-- `…_outcome_origin` : on ne résout que ce qui a été appelé).
insert into public.reservation_queue_entries
  (id, queue_id, organization_id, player_key_hash, status, called_at, resolved_at)
values
  ('4f22e000-0000-4000-8000-000000000703', '4f22e000-0000-4000-8000-000000000601',
   '4f22e000-0000-4000-8000-00000000000a', repeat('a3', 32), 'served',
   now() - interval '10 minutes', now() - interval '5 minutes');

-- E4 : dans la file SANS animation.
insert into public.reservation_queue_entries
  (id, queue_id, organization_id, player_key_hash, status)
values
  ('4f22e000-0000-4000-8000-000000000704', '4f22e000-0000-4000-8000-000000000602',
   '4f22e000-0000-4000-8000-00000000000a', repeat('a4', 32), 'waiting');

-- E5 : dans la file à animation fanée (quiz archivé, campagne tout illimité).
insert into public.reservation_queue_entries
  (id, queue_id, organization_id, player_key_hash, status)
values
  ('4f22e000-0000-4000-8000-000000000705', '4f22e000-0000-4000-8000-000000000603',
   '4f22e000-0000-4000-8000-00000000000a', repeat('a5', 32), 'waiting');

-- E6 : APPELÉE. `called` est VIVANT — quelqu'un qu'on vient d'appeler traverse
-- encore le magasin, et lui refuser sa session ferait clignoter l'écran.
insert into public.reservation_queue_entries
  (id, queue_id, organization_id, player_key_hash, status, called_at)
values
  ('4f22e000-0000-4000-8000-000000000706', '4f22e000-0000-4000-8000-000000000602',
   '4f22e000-0000-4000-8000-00000000000a', repeat('a6', 32), 'called',
   now() - interval '1 minute');

-- E7 : campagne ARCHIVÉE.
insert into public.reservation_queue_entries
  (id, queue_id, organization_id, player_key_hash, status)
values
  ('4f22e000-0000-4000-8000-000000000707', '4f22e000-0000-4000-8000-000000000604',
   '4f22e000-0000-4000-8000-00000000000a', repeat('a7', 32), 'waiting');

-- EB : chez le VOISIN, et sous LA MÊME empreinte qu'Alix — un cookie joueur suit
-- son porteur chez tous les commerçants. C'est ce qui rend le contrôle de
-- cloisonnement honnête : ce n'est pas « une autre personne », c'est LA MÊME,
-- vue depuis la mauvaise organisation.
insert into public.reservation_queue_entries
  (id, queue_id, organization_id, player_key_hash, status)
values
  ('4f22e000-0000-4000-8000-000000000751', '4f22e000-0000-4000-8000-000000000651',
   '4f22e000-0000-4000-8000-00000000000b', repeat('a1', 32), 'waiting');

-- EC : dans l'organisation SANS le droit `vitrine`.
insert into public.reservation_queue_entries
  (id, queue_id, organization_id, player_key_hash, status)
values
  ('4f22e000-0000-4000-8000-000000000771', '4f22e000-0000-4000-8000-000000000671',
   '4f22e000-0000-4000-8000-00000000000c', repeat('a8', 32), 'waiting');

-- ── L'autre forme d'attente : le créneau confirmé ─────────────
insert into public.reservation_activities
  (id, organization_id, name, active, wait_quiz_id, wait_pause_campaign_id)
values
  ('4f22e000-0000-4000-8000-000000000801', '4f22e000-0000-4000-8000-00000000000a',
   'Dégustation', true,
   '4f22e000-0000-4000-8000-000000000401', '4f22e000-0000-4000-8000-000000000501');

insert into public.reservation_slots
  (id, activity_id, organization_id, starts_at, ends_at, capacity, status)
values
  ('4f22e000-0000-4000-8000-000000000802', '4f22e000-0000-4000-8000-000000000801',
   '4f22e000-0000-4000-8000-00000000000a',
   now() + interval '2 days', now() + interval '2 days 30 minutes', 4, 'open');

-- R1 CONFIRMÉE (vivante) et R2 ANNULÉE (morte). Le `code` est posé par le
-- trigger `reservations_set_code`, jamais par la fixture.
insert into public.reservations
  (id, slot_id, organization_id, player_key_hash, status)
values
  ('4f22e000-0000-4000-8000-000000000803', '4f22e000-0000-4000-8000-000000000802',
   '4f22e000-0000-4000-8000-00000000000a', repeat('b1', 32), 'confirmed');
insert into public.reservations
  (id, slot_id, organization_id, player_key_hash, status, cancelled_at)
values
  ('4f22e000-0000-4000-8000-000000000804', '4f22e000-0000-4000-8000-000000000802',
   '4f22e000-0000-4000-8000-00000000000a', repeat('b2', 32), 'cancelled',
   now() - interval '1 hour');


-- ════════════════════════════════════════════════════════════
-- 0. LA PHOTOGRAPHIE D'AVANT
--
-- Prise ICI, avant le PREMIER appel d'animation de ce fichier, et comparée à la
-- section 3 après le DERNIER. Les quatre tables d'attente en entier, colonne par
-- colonne — pas un compte, pas un échantillon : un compte serait vrai si une RPC
-- avançait quelqu'un d'un rang, ce qui est exactement le défaut cherché.
-- ════════════════════════════════════════════════════════════

create temporary table avant_entrees as
  select e.id, e.queue_id, e.organization_id, e.player_key_hash, e.display_name,
         e.email, e.consent_transactional_at, e.status, e.created_at,
         e.called_at, e.resolved_at
    from public.reservation_queue_entries e
   where e.organization_id in ('4f22e000-0000-4000-8000-00000000000a',
                               '4f22e000-0000-4000-8000-00000000000b',
                               '4f22e000-0000-4000-8000-00000000000c');

create temporary table avant_reservations as
  select r.id, r.slot_id, r.organization_id, r.player_key_hash, r.email,
         r.consent_transactional_at, r.code, r.status, r.created_at,
         r.cancelled_at, r.checked_in_at, r.checked_in_by
    from public.reservations r
   where r.organization_id in ('4f22e000-0000-4000-8000-00000000000a',
                               '4f22e000-0000-4000-8000-00000000000b',
                               '4f22e000-0000-4000-8000-00000000000c');

create temporary table avant_creneaux as
  select s.id, s.activity_id, s.organization_id, s.starts_at, s.ends_at,
         s.capacity, s.status, s.waitlist_offer_minutes
    from public.reservation_slots s
   where s.organization_id in ('4f22e000-0000-4000-8000-00000000000a',
                               '4f22e000-0000-4000-8000-00000000000b',
                               '4f22e000-0000-4000-8000-00000000000c');

create temporary table avant_liste as
  select w.id, w.slot_id, w.organization_id, w.player_key_hash, w.status,
         w.created_at, w.offered_at, w.offer_expires_at, w.converted_at,
         w.converted_reservation_id, w.expired_at, w.cancelled_at
    from public.reservation_waitlist_entries w
   where w.organization_id in ('4f22e000-0000-4000-8000-00000000000a',
                               '4f22e000-0000-4000-8000-00000000000b',
                               '4f22e000-0000-4000-8000-00000000000c');

-- LES RANGS, pris par le SEUL chemin qui les produit — `queue_public_state`.
-- Deux personnes, deux rangs, et le compte d'attente qui va avec.
create temporary table avant_rangs as
  select 'alix' as qui,
         public.queue_public_state('4f22e000-0000-4000-8000-000000000601',
                                   repeat('a1', 32)) as j
  union all
  select 'bilal',
         public.queue_public_state('4f22e000-0000-4000-8000-000000000601',
                                   repeat('a2', 32));

select is((select j->>'position' from avant_rangs where qui = 'alix'), '1',
  'RANG-0 Alix est 1er AVANT toute animation — le point de comparaison existe');
select is((select j->>'position' from avant_rangs where qui = 'bilal'), '2',
  'RANG-0b Bilal est 2e AVANT toute animation');


-- ════════════════════════════════════════════════════════════
-- 1. OUVRIR UNE SESSION, ET N'EN OUVRIR QU'UNE
-- ════════════════════════════════════════════════════════════

create temporary table s1 (n int, j jsonb);

insert into s1 values (1, public.wait_session_open(
  '4f22e000-0000-4000-8000-00000000000a', repeat('a1', 32),
  '4f22e000-0000-4000-8000-000000000701', null));

select is((select j->>'state' from s1 where n = 1), 'open',
  'OPEN-1 une entrée en file VIVANTE, présentée par SON joueur, ouvre une session');
select isnt((select j->>'session_id' from s1 where n = 1), null,
  'OPEN-2 la session porte un identifiant');
select is((select j->>'source' from s1 where n = 1), 'queue_entry',
  'OPEN-3 la source est nommée : c''est une entrée de file');
select is((select j->>'quiz_id' from s1 where n = 1),
  '4f22e000-0000-4000-8000-000000000401',
  'OPEN-4 le quiz configuré sur la FILE est rendu — une expérience EXISTANTE de l''org');
select is((select j->>'pause_campaign_id' from s1 where n = 1),
  '4f22e000-0000-4000-8000-000000000501',
  'OPEN-5 la campagne de Pause Chance configurée sur la file est rendue');
select is((select j->>'pause_chance_used' from s1 where n = 1), 'false',
  'OPEN-6 la Pause Chance n''est pas encore consommée');
select is((select j->>'activity_id' from s1 where n = 1), null,
  'OPEN-7 une file « Comptoir » n''a pas d''activité — le lien « voir l''activité » n''existe pas');

-- LE DOCUMENT NE PORTE AUCUN RANG. L'assertion porte sur l'ENSEMBLE EXACT des
-- clés : ajouter `position` ou `waiting_count` un jour fera rougir ce fichier,
-- ce qui est précisément le but — que ce soit une décision, pas un glissement.
select is(
  (select string_agg(k, ',' order by k)
     from s1, lateral jsonb_object_keys(j) k where n = 1),
  'activity_id,pause_campaign_id,pause_chance_used,quiz_id,session_id,source,state',
  'OPEN-8 le document d''ouverture ne porte NI rang, NI compteur d''attente, NI délai');

-- LE VERROU D'AVIS, sur la clé EXACTE (organisation + source).
with k as (
  select pg_catalog.hashtextextended(
    'reservation_wait_session:' || '4f22e000-0000-4000-8000-00000000000a'
      || ':' || '4f22e000-0000-4000-8000-000000000701', 0) as v
)
select ok(
  exists (
    select 1 from pg_locks l, k
     where l.locktype = 'advisory'
       and l.objsubid = 1
       and l.classid::bigint = ((k.v >> 32) & 4294967295)
       and l.objid::bigint = (k.v & 4294967295)
  ),
  'OPEN-9 le verrou d''avis (organisation + source) est détenu par la transaction');

-- REJOUER : MÊME session, aucune seconde ligne.
insert into s1 values (2, public.wait_session_open(
  '4f22e000-0000-4000-8000-00000000000a', repeat('a1', 32),
  '4f22e000-0000-4000-8000-000000000701', null));

select is(
  (select j->>'session_id' from s1 where n = 2),
  (select j->>'session_id' from s1 where n = 1),
  'OPEN-10 rouvrir rend LA MÊME session — recharger une page n''est pas une faute');
select results_eq(
  $$select count(*) from public.reservation_wait_sessions
     where queue_entry_id = '4f22e000-0000-4000-8000-000000000701'$$,
  array[1::bigint],
  'OPEN-11 et il n''existe qu''UNE ligne pour cette entrée en file');

-- UNE ENTRÉE APPELÉE EST ENCORE VIVANTE.
insert into s1 values (3, public.wait_session_open(
  '4f22e000-0000-4000-8000-00000000000a', repeat('a6', 32),
  '4f22e000-0000-4000-8000-000000000706', null));
select is((select j->>'state' from s1 where n = 3), 'open',
  'OPEN-12 une entrée `called` ouvre encore : fermer le jeu à l''appel est un geste d''écran, pas un refus de la base');

-- L'AUTRE FORME D'ATTENTE : LA RÉSERVATION.
insert into s1 values (4, public.wait_session_open(
  '4f22e000-0000-4000-8000-00000000000a', repeat('b1', 32),
  null, '4f22e000-0000-4000-8000-000000000803'));

select is((select j->>'state' from s1 where n = 4), 'open',
  'OPEN-13 une réservation CONFIRMÉE ouvre une session — l''autre forme d''attente du produit');
select is((select j->>'source' from s1 where n = 4), 'reservation',
  'OPEN-14 la source est nommée : c''est une réservation');
select is((select j->>'quiz_id' from s1 where n = 4),
  '4f22e000-0000-4000-8000-000000000401',
  'OPEN-15 la configuration vient de l''ACTIVITÉ, pas d''une file');
select is((select j->>'activity_id' from s1 where n = 4),
  '4f22e000-0000-4000-8000-000000000801',
  'OPEN-16 l''activité est rendue : c''est tout ce que « voir l''activité » demande');

insert into s1 values (5, public.wait_session_open(
  '4f22e000-0000-4000-8000-00000000000a', repeat('b1', 32),
  null, '4f22e000-0000-4000-8000-000000000803'));
select is(
  (select j->>'session_id' from s1 where n = 5),
  (select j->>'session_id' from s1 where n = 4),
  'OPEN-17 la réservation aussi est idempotente');

-- LA CONFIGURATION N'EST PROPOSÉE QUE SI ELLE EST JOUABLE.
insert into s1 values (6, public.wait_session_open(
  '4f22e000-0000-4000-8000-00000000000a', repeat('a5', 32),
  '4f22e000-0000-4000-8000-000000000705', null));
select is((select j->>'quiz_id' from s1 where n = 6), null,
  'OPEN-18 un quiz ARCHIVÉ n''est pas proposé — l''écran ne montre pas un bouton qui échouera');
select is((select j->>'pause_campaign_id' from s1 where n = 6),
  '4f22e000-0000-4000-8000-000000000511',
  'OPEN-19 la campagne ACTIVE de la même file reste proposée, elle');

-- AUCUNE ANIMATION CONFIGURÉE : la session s'ouvre quand même, vide. Le Mode
-- Attente active est FACULTATIF, et une file sans configuration se comporte
-- exactement comme avant ce lot.
insert into s1 values (7, public.wait_session_open(
  '4f22e000-0000-4000-8000-00000000000a', repeat('a4', 32),
  '4f22e000-0000-4000-8000-000000000704', null));
select is((select j->>'state' from s1 where n = 7), 'open',
  'OPEN-20 une file SANS animation ouvre tout de même une session');
select is(
  (select coalesce(j->>'quiz_id', '') || '/' || coalesce(j->>'pause_campaign_id', '')
     from s1 where n = 7),
  '/',
  'OPEN-21 …et elle ne propose rien : c''est le défaut du produit');


-- ════════════════════════════════════════════════════════════
-- 2. CE QUI N'OUVRE PAS — UN SEUL ÉTAT, ET IL EST MUET
--
-- Cinq refus, cinq fois `unknown`. Les distinguer donnerait à un appelant public
-- un oracle sur ce qui existe chez le commerce d'en face — et pire ici
-- qu'ailleurs : « cette entrée existe mais n'est pas la vôtre » est une
-- information sur quelqu'un d'autre qui se trouve dans le magasin.
-- ════════════════════════════════════════════════════════════

create temporary table s2 (n int, j jsonb);

insert into s2 values (1, public.wait_session_open(
  '4f22e000-0000-4000-8000-00000000000a', repeat('a2', 32),
  '4f22e000-0000-4000-8000-000000000701', null));
select is((select j->>'state' from s2 where n = 1), 'unknown',
  'REFUS-1 l''entrée de QUELQU''UN D''AUTRE n''ouvre rien — critère « le jeu ne lit pas le droit à une place »');

insert into s2 values (2, public.wait_session_open(
  '4f22e000-0000-4000-8000-00000000000a', repeat('a3', 32),
  '4f22e000-0000-4000-8000-000000000703', null));
select is((select j->>'state' from s2 where n = 2), 'unknown',
  'REFUS-2 une entrée SERVIE est morte : l''attente est finie, l''animation n''a plus d''objet');

insert into s2 values (3, public.wait_session_open(
  '4f22e000-0000-4000-8000-00000000000a', repeat('b2', 32),
  null, '4f22e000-0000-4000-8000-000000000804'));
select is((select j->>'state' from s2 where n = 3), 'unknown',
  'REFUS-3 une réservation ANNULÉE est morte elle aussi');

insert into s2 values (4, public.wait_session_open(
  '4f22e000-0000-4000-8000-00000000000a', repeat('a1', 32),
  '4f22e000-0000-4000-8000-0000000009ff', null));
select is((select j->>'state' from s2 where n = 4), 'unknown',
  'REFUS-4 une entrée INEXISTANTE rend le MÊME état — aucun oracle sur ce qui existe');

insert into s2 values (5, public.wait_session_open(
  '4f22e000-0000-4000-8000-00000000000a', repeat('a1', 32),
  '4f22e000-0000-4000-8000-000000000751', null));
select is((select j->>'state' from s2 where n = 5), 'unknown',
  'REFUS-5 l''entrée du VOISIN, sous la MÊME empreinte, ne s''ouvre pas depuis A');

insert into s2 values (6, public.wait_session_open(
  '4f22e000-0000-4000-8000-00000000000c', repeat('a8', 32),
  '4f22e000-0000-4000-8000-000000000771', null));
select is((select j->>'state' from s2 where n = 6), 'unknown',
  'REFUS-6 une organisation SANS le droit `vitrine` n''ouvre aucune animation (défense en profondeur)');

select results_eq(
  $$select count(*) from public.reservation_wait_sessions
     where organization_id = '4f22e000-0000-4000-8000-00000000000c'$$,
  array[0::bigint],
  'REFUS-7 …et aucune session n''a été écrite au passage');

-- LES BOGUES D'APPELANT SE DISENT FORT, eux : ce ne sont pas des refus métier.
select throws_ok(
  $$select public.wait_session_open(
      '4f22e000-0000-4000-8000-00000000000a', repeat('a1', 32),
      '4f22e000-0000-4000-8000-000000000701',
      '4f22e000-0000-4000-8000-000000000803')$$,
  '22023',
  null,
  'REFUS-8 DEUX sources posées : refus bruyant, pas un arbitrage silencieux entre deux configurations');
select throws_ok(
  $$select public.wait_session_open(
      '4f22e000-0000-4000-8000-00000000000a', repeat('a1', 32), null, null)$$,
  '22023',
  null,
  'REFUS-9 AUCUNE source : refus bruyant');
select throws_ok(
  $$select public.wait_session_open(
      '4f22e000-0000-4000-8000-00000000000a', 'pas-une-empreinte',
      '4f22e000-0000-4000-8000-000000000701', null)$$,
  '22023',
  null,
  'REFUS-10 empreinte malformée : refus bruyant');

-- LA CONTRAINTE DE TABLE DIT LA MÊME CHOSE, et elle tient même si un jour
-- quelqu'un écrit par un autre chemin que la RPC.
select throws_ok(
  $$insert into public.reservation_wait_sessions
      (organization_id, queue_entry_id, reservation_id, player_key_hash)
    values ('4f22e000-0000-4000-8000-00000000000a',
            '4f22e000-0000-4000-8000-000000000702',
            '4f22e000-0000-4000-8000-000000000803', repeat('a2', 32))$$,
  '23514',
  null,
  'REFUS-11 la base refuse une session à DEUX sources, RPC ou pas');
select throws_ok(
  $$insert into public.reservation_wait_sessions
      (organization_id, player_key_hash)
    values ('4f22e000-0000-4000-8000-00000000000a', repeat('a2', 32))$$,
  '23514',
  null,
  'REFUS-12 …et une session SANS source');


-- ════════════════════════════════════════════════════════════
-- 3. LA PAUSE CHANCE — UNE, ET UNE SEULE, PAR SESSION
-- ════════════════════════════════════════════════════════════

create temporary table s3 (n int, j jsonb);

insert into s3 values (1, public.wait_session_use_pause(
  '4f22e000-0000-4000-8000-00000000000a',
  (select (j->>'session_id')::uuid from s1 where n = 1),
  repeat('a1', 32)));

select is((select j->>'state' from s3 where n = 1), 'granted',
  'PAUSE-1 la première Pause Chance de la session est accordée');
select is((select j->>'campaign_id' from s3 where n = 1),
  '4f22e000-0000-4000-8000-000000000501',
  'PAUSE-2 la campagne vient du PARENT, jamais de l''appelant — « gains décidés côté serveur »');
select ok((select j->>'grant_token' from s3 where n = 1) ~ '^[0-9a-f]{48}$',
  'PAUSE-3 le jeton d''octroi a la forme des quatre frères : 48 hexadécimaux');

-- REJOUER : `already_used`, MÊME jeton, et l'horodatage NE BOUGE PAS.
create temporary table pause_horodatage as
  select pause_chance_used_at as t
    from public.reservation_wait_sessions
   where id = (select (j->>'session_id')::uuid from s1 where n = 1);

insert into s3 values (2, public.wait_session_use_pause(
  '4f22e000-0000-4000-8000-00000000000a',
  (select (j->>'session_id')::uuid from s1 where n = 1),
  repeat('a1', 32)));

select is((select j->>'state' from s3 where n = 2), 'already_used',
  'PAUSE-4 la SECONDE Pause Chance de la même session est refusée — critère dur « bornée par session »');
select is(
  (select j->>'grant_token' from s3 where n = 2),
  (select j->>'grant_token' from s3 where n = 1),
  'PAUSE-5 …et elle rend LE MÊME jeton : un rechargement de page ne coûte pas un tour');
select is(
  (select pause_chance_used_at from public.reservation_wait_sessions
    where id = (select (j->>'session_id')::uuid from s1 where n = 1)),
  (select t from pause_horodatage),
  'PAUSE-6 l''horodatage d''usage n''a pas été repassé — l''update est bien CONDITIONNEL');

-- CE QUE LA CONCURRENCE VEUT DIRE ICI. pgTAP tourne dans UNE session : il ne
-- peut pas lancer deux appels réellement simultanés. Ce qui est vérifiable, et
-- ce qui est vérifié : la clause qui rend la course sûre EST dans le corps de la
-- fonction. Sans elle, PAUSE-4 passerait encore — et deux caissiers simultanés
-- donneraient deux tours.
select ok(
  (select p.prosrc like '%pause_chance_used_at is null%'
     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'wait_session_use_pause'),
  'PAUSE-7 l''update porte bien `where pause_chance_used_at is null` : la ligne EST le verrou');

-- LE MAUVAIS JOUEUR NE DÉPENSE PAS LA PAUSE D'AUTRUI.
insert into s3 values (3, public.wait_session_use_pause(
  '4f22e000-0000-4000-8000-00000000000a',
  (select (j->>'session_id')::uuid from s1 where n = 4),
  repeat('a1', 32)));
select is((select j->>'state' from s3 where n = 3), 'unknown',
  'PAUSE-8 la session de quelqu''un d''autre est muette');

-- L'ORGANISATION VOISINE NON PLUS.
insert into s3 values (4, public.wait_session_use_pause(
  '4f22e000-0000-4000-8000-00000000000b',
  (select (j->>'session_id')::uuid from s1 where n = 1),
  repeat('a1', 32)));
select is((select j->>'state' from s3 where n = 4), 'unknown',
  'PAUSE-9 la session d''une AUTRE organisation est muette, même sous la bonne empreinte');

-- AUCUNE CAMPAGNE CONFIGURÉE : état PROPRE, actionnable côté écran.
insert into s3 values (5, public.wait_session_use_pause(
  '4f22e000-0000-4000-8000-00000000000a',
  (select (j->>'session_id')::uuid from s1 where n = 7),
  repeat('a4', 32)));
select is((select j->>'state' from s3 where n = 5), 'unconfigured',
  'PAUSE-10 sans campagne configurée, l''état est PROPRE — « ne montrez pas le bouton », pas « inconnu »');
select is(
  (select pause_chance_used_at from public.reservation_wait_sessions
    where id = (select (j->>'session_id')::uuid from s1 where n = 7)),
  null,
  'PAUSE-11 …et la Pause Chance n''a PAS été brûlée au passage');

-- L'OUVERTURE SUIVANTE LE DIT À L'ÉCRAN.
insert into s1 values (8, public.wait_session_open(
  '4f22e000-0000-4000-8000-00000000000a', repeat('a1', 32),
  '4f22e000-0000-4000-8000-000000000701', null));
select is((select j->>'pause_chance_used' from s1 where n = 8), 'true',
  'PAUSE-12 rouvrir la session dit que la Pause Chance est consommée');


-- ════════════════════════════════════════════════════════════
-- 4. LE TOUR OFFERT — ORDINAIRE, ET À USAGE UNIQUE
-- ════════════════════════════════════════════════════════════

create temporary table s4 (n int, j jsonb);

insert into s4 values (1, public.consume_reserver_wait_spin_grant(
  (select (j->>'session_id')::uuid from s1 where n = 1),
  repeat('a1', 32),
  (select j->>'grant_token' from s3 where n = 1)));

select is((select j->>'state' from s4 where n = 1), 'spun',
  'SPIN-1 le jeton tire un tour sur la campagne configurée');
select is((select j->>'prize_id' from s4 where n = 1),
  '4f22e000-0000-4000-8000-000000000503',
  'SPIN-2 …et il gagne le seul lot tirable de la roue');
select results_eq(
  $$select source from public.spins
     where id = (select (j->>'spin_id')::uuid from s4 where n = 1)$$,
  array['reserver_wait'],
  'SPIN-3 le tour est un `spins` ORDINAIRE, de source `reserver_wait` — donc un code remis EN CAISSE');
select results_eq(
  $$select stock from public.prizes
     where id = '4f22e000-0000-4000-8000-000000000503'$$,
  array[2],
  'SPIN-4 le stock du lot a été décompté : l''économie est celle de la campagne, pas une nouvelle');

-- REJOUER : `already_consumed`, MÊME tour, aucun second spin.
insert into s4 values (2, public.consume_reserver_wait_spin_grant(
  (select (j->>'session_id')::uuid from s1 where n = 1),
  repeat('a1', 32),
  (select j->>'grant_token' from s3 where n = 1)));

select is((select j->>'state' from s4 where n = 2), 'already_consumed',
  'SPIN-5 le jeton est à USAGE UNIQUE');
select is(
  (select j->>'spin_id' from s4 where n = 2),
  (select j->>'spin_id' from s4 where n = 1),
  'SPIN-6 …et il rend le tour DÉJÀ tiré, plutôt qu''un refus sec');
select results_eq(
  $$select count(*) from public.spins
     where organization_id = '4f22e000-0000-4000-8000-00000000000a'
       and source = 'reserver_wait'$$,
  array[1::bigint],
  'SPIN-7 un seul tour offert a été écrit, pas deux');
select results_eq(
  $$select stock from public.prizes
     where id = '4f22e000-0000-4000-8000-000000000503'$$,
  array[2],
  'SPIN-8 …et le stock n''a pas été décompté deux fois');

-- LE JETON SEUL NE SUFFIT PAS, ET LA SESSION SEULE NON PLUS.
insert into s4 values (3, public.consume_reserver_wait_spin_grant(
  (select (j->>'session_id')::uuid from s1 where n = 4),
  repeat('b1', 32),
  repeat('ab', 24)));
select is((select j->>'state' from s4 where n = 3), 'unavailable',
  'SPIN-9 un jeton inventé ne tire rien');

-- ── BORNE 2 : un lot à stock ILLIMITÉ n'est pas tirable par un tour offert ──
insert into s3 values (6, public.wait_session_use_pause(
  '4f22e000-0000-4000-8000-00000000000a',
  (select (j->>'session_id')::uuid from s1 where n = 6),
  repeat('a5', 32)));
select is((select j->>'state' from s3 where n = 6), 'granted',
  'BORNE2-1 la Pause Chance est accordée sur la campagne à lot illimité');

insert into s4 values (4, public.consume_reserver_wait_spin_grant(
  (select (j->>'session_id')::uuid from s1 where n = 6),
  repeat('a5', 32),
  (select j->>'grant_token' from s3 where n = 6)));
select is((select j->>'state' from s4 where n = 4), 'no_prize',
  'BORNE2-2 une roue tout ILLIMITÉ ne rend RIEN au tour offert — sinon N identités = N codes, sans plafond');
select is(
  (select pause_spin_consumed_at from public.reservation_wait_sessions
    where id = (select (j->>'session_id')::uuid from s1 where n = 6)),
  null,
  'BORNE2-3 …et le jeton n''est PAS brûlé : le joueur reviendra quand le commerçant aura réapprovisionné');

-- ── BORNE 3 : statut de la campagne ──
insert into s1 values (9, public.wait_session_open(
  '4f22e000-0000-4000-8000-00000000000a', repeat('a7', 32),
  '4f22e000-0000-4000-8000-000000000707', null));
select is((select j->>'pause_campaign_id' from s1 where n = 9), null,
  'BORNE3-1 une campagne ARCHIVÉE n''est pas proposée à l''ouverture');
insert into s3 values (7, public.wait_session_use_pause(
  '4f22e000-0000-4000-8000-00000000000a',
  (select (j->>'session_id')::uuid from s1 where n = 9),
  repeat('a7', 32)));
-- Le jeton EST délivré : `wait_session_use_pause` lit la configuration BRUTE du
-- parent, elle ne rejoue pas le filtre d'affichage de l'ouverture. Sans cette
-- assertion, BORNE3-2 passerait pour la mauvaise raison — un jeton nul rend
-- `unavailable` sans qu'aucune borne n'ait été éprouvée.
select is((select j->>'state' from s3 where n = 7), 'granted',
  'BORNE3-1b le jeton est bien délivré : c''est le TIRAGE qui devra refuser, pas l''octroi');
insert into s4 values (5, public.consume_reserver_wait_spin_grant(
  (select (j->>'session_id')::uuid from s1 where n = 9),
  repeat('a7', 32),
  (select j->>'grant_token' from s3 where n = 7)));
select is((select j->>'state' from s4 where n = 5), 'unavailable',
  'BORNE3-2 et si le jeton était obtenu avant l''archivage, le tirage refuse quand même');
select is(
  (select pause_spin_consumed_at from public.reservation_wait_sessions
    where id = (select (j->>'session_id')::uuid from s1 where n = 9)),
  null,
  'BORNE3-3 …sans brûler le jeton');


-- ════════════════════════════════════════════════════════════
-- 5. L'INVARIANT N°1 DU CAHIER — LA PHOTOGRAPHIE D'APRÈS
--
-- « Le jeu ne peut NI LIRE NI MODIFIER rang, priorité, capacité, accès, délai ou
-- droit à une place. » Vingt-cinq appels d'animation viennent de passer, dont
-- deux tirages de roue. Les quatre tables d'attente doivent être IDENTIQUES,
-- colonne par colonne — pas « du même compte » : un compte serait encore vrai si
-- une RPC avait avancé quelqu'un d'un rang, ce qui est exactement le défaut
-- cherché. La différence est SYMÉTRIQUE (dans les deux sens), sans quoi une ligne
-- ajoutée passerait inaperçue.
-- ════════════════════════════════════════════════════════════

select is_empty($$
  select 'après' as sens, x.id from (
    select e.id, e.queue_id, e.organization_id, e.player_key_hash, e.display_name,
           e.email, e.consent_transactional_at, e.status, e.created_at,
           e.called_at, e.resolved_at
      from public.reservation_queue_entries e
     where e.organization_id in ('4f22e000-0000-4000-8000-00000000000a',
                                 '4f22e000-0000-4000-8000-00000000000b',
                                 '4f22e000-0000-4000-8000-00000000000c')
    except select * from avant_entrees) x
  union all
  select 'avant', y.id from (
    select * from avant_entrees
    except
    select e.id, e.queue_id, e.organization_id, e.player_key_hash, e.display_name,
           e.email, e.consent_transactional_at, e.status, e.created_at,
           e.called_at, e.resolved_at
      from public.reservation_queue_entries e
     where e.organization_id in ('4f22e000-0000-4000-8000-00000000000a',
                                 '4f22e000-0000-4000-8000-00000000000b',
                                 '4f22e000-0000-4000-8000-00000000000c')) y
$$, 'INV-1 AUCUNE entrée de file n''a bougé d''un octet — ni statut, ni horodatage, ni prénom');

select is_empty($$
  select 'après' as sens, x.id from (
    select r.id, r.slot_id, r.organization_id, r.player_key_hash, r.email,
           r.consent_transactional_at, r.code, r.status, r.created_at,
           r.cancelled_at, r.checked_in_at, r.checked_in_by
      from public.reservations r
     where r.organization_id in ('4f22e000-0000-4000-8000-00000000000a',
                                 '4f22e000-0000-4000-8000-00000000000b',
                                 '4f22e000-0000-4000-8000-00000000000c')
    except select * from avant_reservations) x
  union all
  select 'avant', y.id from (
    select * from avant_reservations
    except
    select r.id, r.slot_id, r.organization_id, r.player_key_hash, r.email,
           r.consent_transactional_at, r.code, r.status, r.created_at,
           r.cancelled_at, r.checked_in_at, r.checked_in_by
      from public.reservations r
     where r.organization_id in ('4f22e000-0000-4000-8000-00000000000a',
                                 '4f22e000-0000-4000-8000-00000000000b',
                                 '4f22e000-0000-4000-8000-00000000000c')) y
$$, 'INV-2 AUCUNE réservation n''a bougé — ni statut, ni code, ni arrivée');

select is_empty($$
  select 'après' as sens, x.id from (
    select s.id, s.activity_id, s.organization_id, s.starts_at, s.ends_at,
           s.capacity, s.status, s.waitlist_offer_minutes
      from public.reservation_slots s
     where s.organization_id in ('4f22e000-0000-4000-8000-00000000000a',
                                 '4f22e000-0000-4000-8000-00000000000b',
                                 '4f22e000-0000-4000-8000-00000000000c')
    except select * from avant_creneaux) x
  union all
  select 'avant', y.id from (
    select * from avant_creneaux
    except
    select s.id, s.activity_id, s.organization_id, s.starts_at, s.ends_at,
           s.capacity, s.status, s.waitlist_offer_minutes
      from public.reservation_slots s
     where s.organization_id in ('4f22e000-0000-4000-8000-00000000000a',
                                 '4f22e000-0000-4000-8000-00000000000b',
                                 '4f22e000-0000-4000-8000-00000000000c')) y
$$, 'INV-3 AUCUNE capacité de créneau n''a bougé');

select is_empty($$
  select 'après' as sens, x.id from (
    select w.id, w.slot_id, w.organization_id, w.player_key_hash, w.status,
           w.created_at, w.offered_at, w.offer_expires_at, w.converted_at,
           w.converted_reservation_id, w.expired_at, w.cancelled_at
      from public.reservation_waitlist_entries w
     where w.organization_id in ('4f22e000-0000-4000-8000-00000000000a',
                                 '4f22e000-0000-4000-8000-00000000000b',
                                 '4f22e000-0000-4000-8000-00000000000c')
    except select * from avant_liste) x
  union all
  select 'avant', y.id from (
    select * from avant_liste
    except
    select w.id, w.slot_id, w.organization_id, w.player_key_hash, w.status,
           w.created_at, w.offered_at, w.offer_expires_at, w.converted_at,
           w.converted_reservation_id, w.expired_at, w.cancelled_at
      from public.reservation_waitlist_entries w
     where w.organization_id in ('4f22e000-0000-4000-8000-00000000000a',
                                 '4f22e000-0000-4000-8000-00000000000b',
                                 '4f22e000-0000-4000-8000-00000000000c')) y
$$, 'INV-4 AUCUNE offre de liste prioritaire n''a bougé');

-- LES RANGS, RELUS PAR LE SEUL CHEMIN QUI LES PRODUIT. C'est la forme la plus
-- lisible du même invariant : celui qui a joué n'a ni gagné ni perdu de place.
select is(
  (select public.queue_public_state('4f22e000-0000-4000-8000-000000000601',
                                    repeat('a1', 32))->>'position'),
  (select j->>'position' from avant_rangs where qui = 'alix'),
  'INV-5 Alix — qui a joué, gagné un lot et rejoué — est TOUJOURS 1er');
select is(
  (select public.queue_public_state('4f22e000-0000-4000-8000-000000000601',
                                    repeat('a2', 32))->>'position'),
  (select j->>'position' from avant_rangs where qui = 'bilal'),
  'INV-6 Bilal — qui n''a rien joué — est TOUJOURS 2e : aucune animation n''est nécessaire pour garder sa place');
select is(
  (select public.queue_public_state('4f22e000-0000-4000-8000-000000000601',
                                    repeat('a1', 32))->>'waiting_count'),
  (select j->>'waiting_count' from avant_rangs where qui = 'alix'),
  'INV-7 la taille de la file est inchangée');

-- ET RÉCIPROQUEMENT : L'ANIMATION N'A PAS DE PRISE SUR LA FILE, MAIS LA FILE EN
-- A UNE SUR L'ANIMATION — elle est la SOURCE, et la cascade en dépend.
select results_eq(
  $$select count(*) from public.reservation_wait_sessions
     where organization_id = '4f22e000-0000-4000-8000-00000000000a'$$,
  array[6::bigint],
  'INV-8 six sessions ont bien été créées — l''invariant ci-dessus ne porte pas sur un ensemble vide');


-- ════════════════════════════════════════════════════════════
-- 6. LE VOISIN N'EST PAS MUET PARCE QU'IL SERAIT CASSÉ
--
-- Sans cette section, les six `unknown` de la section 2 se confondraient avec
-- « le module ne marche pas chez B ».
-- ════════════════════════════════════════════════════════════

create temporary table s6 (n int, j jsonb);

insert into s6 values (1, public.wait_session_open(
  '4f22e000-0000-4000-8000-00000000000b', repeat('a1', 32),
  '4f22e000-0000-4000-8000-000000000751', null));
select is((select j->>'state' from s6 where n = 1), 'open',
  'VOISIN-1 la MÊME empreinte ouvre parfaitement sa session CHEZ B — le refus de la section 2 était bien un cloisonnement');
select is((select j->>'quiz_id' from s6 where n = 1),
  '4f22e000-0000-4000-8000-000000000451',
  'VOISIN-2 …et elle y reçoit la configuration de B, jamais celle de A');


-- ════════════════════════════════════════════════════════════
-- 7. ACL, RLS ET FORME DU SCHÉMA
-- ════════════════════════════════════════════════════════════

select ok(
  (select c.relrowsecurity from pg_class c
     join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = 'reservation_wait_sessions'),
  'ACL-1 les sessions d''attente tournent sous row level security');
select results_eq(
  $$select count(*) from pg_policies
     where schemaname = 'public' and tablename = 'reservation_wait_sessions'$$,
  array[0::bigint],
  'ACL-2 …et AUCUNE policy : service_role, et personne d''autre');
select is(
  (select coalesce(string_agg(distinct a.privilege_type, ', '), '')
     from pg_class c
     join pg_namespace n on n.oid = c.relnamespace,
     lateral aclexplode(coalesce(c.relacl, acldefault('r', c.relowner))) a
    where n.nspname = 'public'
      and c.relname = 'reservation_wait_sessions'
      and a.grantee in ('anon'::regrole::oid, 'authenticated'::regrole::oid)),
  '',
  'ACL-3 ni anon ni authenticated ne gardent le moindre privilège, `truncate` compris');

select ok(has_function_privilege('service_role',
  'public.wait_session_open(uuid,text,uuid,uuid)', 'EXECUTE'),
  'ACL-4 le serveur peut ouvrir une session');
select ok(not has_function_privilege('anon',
  'public.wait_session_open(uuid,text,uuid,uuid)', 'EXECUTE'),
  'ACL-5 anon ne le peut pas');
select ok(not has_function_privilege('authenticated',
  'public.wait_session_open(uuid,text,uuid,uuid)', 'EXECUTE'),
  'ACL-6 une session marchande non plus — elle ouvrirait une session sur la place de quelqu''un d''autre');
select ok(not has_function_privilege('authenticated',
  'public.wait_session_use_pause(uuid,uuid,text)', 'EXECUTE'),
  'ACL-7 ni dépenser la Pause Chance d''un joueur');
select ok(not has_function_privilege('anon',
  'public.wait_session_use_pause(uuid,uuid,text)', 'EXECUTE'),
  'ACL-8 ni anon');
select ok(not has_function_privilege('authenticated',
  'public.consume_reserver_wait_spin_grant(uuid,text,text)', 'EXECUTE'),
  'ACL-9 ni tirer le tour offert en contournant les bornes économiques');
select ok(not has_function_privilege('anon',
  'public.consume_reserver_wait_spin_grant(uuid,text,text)', 'EXECUTE'),
  'ACL-10 ni anon');

-- LA CONFIGURATION, ELLE, EST DE LA CONFIGURATION : l'éditeur y écrit.
select ok(has_column_privilege('authenticated',
  'public.reservation_queues', 'wait_pause_campaign_id', 'UPDATE'),
  'ACL-11 le commerçant choisit la campagne de Pause Chance de sa file');
select ok(has_column_privilege('authenticated',
  'public.reservation_activities', 'wait_quiz_id', 'UPDATE'),
  'ACL-12 …et le quiz de son activité');

-- LA FK COMPOSITE FAIT SON MÉTIER : un quiz du voisin ne se configure pas chez A.
select throws_ok(
  $$update public.reservation_queues
       set wait_quiz_id = '4f22e000-0000-4000-8000-000000000451'
     where id = '4f22e000-0000-4000-8000-000000000601'$$,
  '23503',
  null,
  'ACL-13 la FK COMPOSITE refuse le quiz d''un AUTRE locataire — la RLS ne dit rien de ce point');

-- L'UNICITÉ PAR SOURCE, tenue par la base et pas seulement par la RPC.
select throws_ok(
  $$insert into public.reservation_wait_sessions
      (organization_id, queue_entry_id, player_key_hash)
    values ('4f22e000-0000-4000-8000-00000000000a',
            '4f22e000-0000-4000-8000-000000000701', repeat('a1', 32))$$,
  '23505',
  null,
  'ACL-14 une SECONDE session sur la même entrée de file est refusée par l''index unique');

select * from finish();
rollback;
