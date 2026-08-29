-- ============================================================
-- RDV-8 — LA LISTE D'ATTENTE APPREND L'EFFECTIF (20261110120000)
--
-- Ce que ce fichier garde, et qui ne se voit qu'un vendredi soir en salle :
--
--   1. LA FILE SAIT COMBIEN ILS SONT. RDV-6 avait posé `party_size` et rien ne
--      l'écrivait : toute la file valait « 1 personne ».
--   2. L'EFFECTIF SE CORRIGE SANS PERDRE SON RANG. « Nous serons six,
--      finalement » ne doit pas obliger à quitter la file puis y revenir.
--   3. ON NE PRÉVIENT QUE CEUX QUI TIENNENT. Dire à une tablée de six qu'une
--      table de deux s'est libérée, c'est la faire revenir pour un refus.
--   4. ON NE PRÉVIENT PAS LES AUTRES : ni les entrées déjà proposées, ni celles
--      qui ont quitté la file, ni les identités purgées, ni celles qu'on n'a
--      aucun moyen de joindre.
--   5. L'ADRESSE NE SORT QUE PAR LÀ. `email` reste hors du grant de colonnes ;
--      seule une fonction `security definer` réservée à `service_role` la lit,
--      et pour un envoi transactionnel.
--
-- ── LES INSTANTS SONT RELATIFS ──
--
-- Tout est ancré sur `now()`. Une fixture écrite en dur rougirait le jour où on
-- la relit, et les créneaux doivent être FUTURS — les deux fonctions refusent
-- le passé, comme le socle.
--
-- ── LES COMPTAGES SONT BORNÉS À CETTE ORGANISATION ──
--
-- Le seed de la CI contient déjà des réservations et des entrées de file. Un
-- comptage global passerait en local sur base vide et tomberait en CI. Chaque
-- `count(*)` porte donc `organization_id = <la nôtre>`.
-- ============================================================
begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

select set_config('request.jwt.claims', '{"role":"service_role"}', true);

-- ── Fixtures ─────────────────────────────────────────────────

-- DEUX organisations : celle qui a acheté « Réservation », et celle qui ne l'a
-- pas — c'est la seconde qui prouve que le droit vérifié est bien `rendez_vous`
-- et non `vitrine`, qu'elle possède pourtant.
insert into public.organizations
  (id, name, slug, subscription_status, plan, timezone, data_retention_months)
values
  ('8c8c0000-0000-4000-8000-00000000000a', 'Salle attente A', 'tap-att-a',
   'active', 'starter', 'Europe/Paris', 6),
  ('8c8c0000-0000-4000-8000-00000000000b', 'Salle attente B', 'tap-att-b',
   'active', 'starter', 'Europe/Paris', 6);

insert into public.organization_module_grants
  (organization_id, module, kind, source, starts_at, ends_at)
select '8c8c0000-0000-4000-8000-00000000000a', m.module, 'pass', 'backoffice',
       now() - interval '1 day', now() + interval '365 days'
  from (values ('vitrine'), ('reserver'), ('rendez_vous')) as m(module);

-- B a la Vitrine et les Moments, PAS la Réservation.
insert into public.organization_module_grants
  (organization_id, module, kind, source, starts_at, ends_at)
select '8c8c0000-0000-4000-8000-00000000000b', m.module, 'pass', 'backoffice',
       now() - interval '1 day', now() + interval '365 days'
  from (values ('vitrine'), ('reserver')) as m(module);

insert into public.reservation_activities
  (id, organization_id, name, active, booking_mode,
   duration_minutes, slot_capacity, booking_horizon_days, lead_time_minutes,
   table_turn_minutes)
values
  -- LA SALLE : pas de 15 min, table occupée 90 min.
  ('8c8c0000-0000-4000-8000-000000000201',
   '8c8c0000-0000-4000-8000-00000000000a', 'Service du soir', true,
   'rendez_vous', 15, 40, 28, 0, 90),
  -- LE TÉMOIN MOMENT : `waitlist_join` reste sa fonction, pas celle d'ici.
  ('8c8c0000-0000-4000-8000-000000000202',
   '8c8c0000-0000-4000-8000-00000000000a', 'Atelier', true, 'moment',
   null, null, 30, 0, null),
  -- La salle de B, identique en tout point — sauf le droit de son commerçant.
  ('8c8c0000-0000-4000-8000-000000000203',
   '8c8c0000-0000-4000-8000-00000000000b', 'Service du soir', true,
   'rendez_vous', 15, 40, 28, 0, 90);

-- Trois tables : 2, 4 et 6 couverts.
insert into public.reservation_tables
  (id, activity_id, organization_id, name, seats)
values
  ('8c8c0000-0000-4000-8000-000000000301',
   '8c8c0000-0000-4000-8000-000000000201',
   '8c8c0000-0000-4000-8000-00000000000a', 'T1', 2),
  ('8c8c0000-0000-4000-8000-000000000302',
   '8c8c0000-0000-4000-8000-000000000201',
   '8c8c0000-0000-4000-8000-00000000000a', 'T2', 4),
  ('8c8c0000-0000-4000-8000-000000000303',
   '8c8c0000-0000-4000-8000-000000000201',
   '8c8c0000-0000-4000-8000-00000000000a', 'T3', 6),
  ('8c8c0000-0000-4000-8000-000000000304',
   '8c8c0000-0000-4000-8000-000000000203',
   '8c8c0000-0000-4000-8000-00000000000b', 'TB1', 4);

insert into public.reservation_slots
  (id, activity_id, organization_id, starts_at, ends_at, capacity, status, generated)
values
  -- S1 — LE SERVICE QUI OCCUPE TOUT, à demain 20 h.
  ('8c8c0000-0000-4000-8000-000000000401',
   '8c8c0000-0000-4000-8000-000000000201',
   '8c8c0000-0000-4000-8000-00000000000a',
   now() + interval '1 day', now() + interval '1 day 15 minutes', 40, 'open', true),
  -- S2 — quinze minutes plus tard : DANS la fenêtre de 90 min de S1.
  ('8c8c0000-0000-4000-8000-000000000402',
   '8c8c0000-0000-4000-8000-000000000201',
   '8c8c0000-0000-4000-8000-00000000000a',
   now() + interval '1 day 15 minutes', now() + interval '1 day 30 minutes',
   40, 'open', true),
  -- S3 — trois heures plus tard : HORS de la fenêtre. Terrain des inscriptions.
  ('8c8c0000-0000-4000-8000-000000000403',
   '8c8c0000-0000-4000-8000-000000000201',
   '8c8c0000-0000-4000-8000-00000000000a',
   now() + interval '1 day 3 hours', now() + interval '1 day 3 hours 15 minutes',
   40, 'open', true),
  -- S4 — après-demain, vierge. Terrain de `reservation_table_freed_targets`.
  ('8c8c0000-0000-4000-8000-000000000404',
   '8c8c0000-0000-4000-8000-000000000201',
   '8c8c0000-0000-4000-8000-00000000000a',
   now() + interval '2 days', now() + interval '2 days 15 minutes', 40, 'open', true),
  -- S5 — le créneau du MOMENT.
  ('8c8c0000-0000-4000-8000-000000000405',
   '8c8c0000-0000-4000-8000-000000000202',
   '8c8c0000-0000-4000-8000-00000000000a',
   now() + interval '1 day', now() + interval '1 day 2 hours', 10, 'open', false),
  -- S6 — la salle de B, ouverte et future : seul le DROIT manque.
  ('8c8c0000-0000-4000-8000-000000000406',
   '8c8c0000-0000-4000-8000-000000000203',
   '8c8c0000-0000-4000-8000-00000000000b',
   now() + interval '1 day', now() + interval '1 day 15 minutes', 40, 'open', true),
  -- S7 — futur mais FERMÉ.
  ('8c8c0000-0000-4000-8000-000000000407',
   '8c8c0000-0000-4000-8000-000000000201',
   '8c8c0000-0000-4000-8000-00000000000a',
   now() + interval '1 day 6 hours', now() + interval '1 day 6 hours 15 minutes',
   40, 'closed', true);


-- ════════════════════════════════════════════════════════════
-- 1. REJOINDRE LA FILE EN DISANT COMBIEN ILS SERONT
-- ════════════════════════════════════════════════════════════

select is(
  (public.waitlist_join_table(
     '8c8c0000-0000-4000-8000-00000000000a',
     '8c8c0000-0000-4000-8000-000000000403',
     md5('att-k1') || md5('att-k1'), 4, 'k1@exemple.fr', true) ->> 'state'),
  'joined',
  'ATT-1 · une tablée de quatre rejoint la file d''une salle');

select is(
  (public.waitlist_join_table(
     '8c8c0000-0000-4000-8000-00000000000a',
     '8c8c0000-0000-4000-8000-000000000403',
     md5('att-k1') || md5('att-k1'), 4, 'k1@exemple.fr', true) -> 'party_size')::text,
  '4',
  'ATT-2 · la charge utile rend l''effectif — l''écran n''a pas à le redemander');

-- ET LA BASE LE PORTE VRAIMENT. `party_size` existait depuis RDV-6 ; c'est la
-- première fois que quelque chose l'écrit.
select is(
  (select party_size::text
     from public.reservation_waitlist_entries
    where organization_id = '8c8c0000-0000-4000-8000-00000000000a'
      and player_key_hash = md5('att-k1') || md5('att-k1')),
  '4',
  'ATT-3 · l''effectif est ÉCRIT en base, et non seulement rendu');

select is(
  (public.waitlist_join_table(
     '8c8c0000-0000-4000-8000-00000000000a',
     '8c8c0000-0000-4000-8000-000000000403',
     md5('att-k2') || md5('att-k2'), 2, 'k2@exemple.fr', true) ->> 'position'),
  '2',
  'ATT-4 · le second inscrit reçoit le rang 2 — la file reste une file');

select ok(
  (select email is not null and consent_transactional_at is not null
     from public.reservation_waitlist_entries
    where organization_id = '8c8c0000-0000-4000-8000-00000000000a'
      and player_key_hash = md5('att-k1') || md5('att-k1')),
  'ATT-5 · avec consentement, l''adresse est conservée AVEC sa date');

-- SANS CONSENTEMENT, RIEN N'EST GARDÉ — l'équivalence adresse ⇔ consentement de
-- `reservation_waitlist_consent_state` est tenue par la fonction, pas seulement
-- par la contrainte. L'inscription est faite dans un bloc SÉPARÉ : un appel
-- glissé dans le `and` d'une assertion lirait la table sur le SNAPSHOT DE DÉBUT
-- D'INSTRUCTION, c'est-à-dire avant sa propre écriture.
do $fixture$
begin
  perform public.waitlist_join_table(
    '8c8c0000-0000-4000-8000-00000000000a',
    '8c8c0000-0000-4000-8000-000000000403',
    md5('att-k3') || md5('att-k3'), 2, 'k3@exemple.fr', false);
end
$fixture$;

select ok(
  (select email is null and consent_transactional_at is null
     from public.reservation_waitlist_entries
    where organization_id = '8c8c0000-0000-4000-8000-00000000000a'
      and player_key_hash = md5('att-k3') || md5('att-k3')),
  'ATT-6 · sans consentement, l''adresse n''est pas conservée');


-- ════════════════════════════════════════════════════════════
-- 2. LES BORNES DE L'EFFECTIF
-- ════════════════════════════════════════════════════════════

select is(
  (public.waitlist_join_table(
     '8c8c0000-0000-4000-8000-00000000000a',
     '8c8c0000-0000-4000-8000-000000000403',
     md5('att-k9') || md5('att-k9'), 0) ->> 'state'),
  'invalid_party_size',
  'ATT-7 · un effectif nul est refusé, même mot que reserve_table');

select is(
  (public.waitlist_join_table(
     '8c8c0000-0000-4000-8000-00000000000a',
     '8c8c0000-0000-4000-8000-000000000403',
     md5('att-k9') || md5('att-k9'), 31) ->> 'state'),
  'invalid_party_size',
  'ATT-8 · trente-et-un aussi : la borne de la colonne est 1..30');

select is(
  (public.waitlist_join_table(
     '8c8c0000-0000-4000-8000-00000000000a',
     '8c8c0000-0000-4000-8000-000000000403',
     md5('att-k9') || md5('att-k9'), null::integer) ->> 'state'),
  'invalid_party_size',
  'ATT-9 · un effectif absent est refusé plutôt que retombé sur le défaut 1');

select is(
  (select count(*)::text
     from public.reservation_waitlist_entries
    where organization_id = '8c8c0000-0000-4000-8000-00000000000a'
      and player_key_hash = md5('att-k9') || md5('att-k9')),
  '0',
  'ATT-10 · …et aucun des trois refus n''a laissé de ligne derrière lui');


-- ════════════════════════════════════════════════════════════
-- 3. L'IDEMPOTENCE CORRIGE L'EFFECTIF — SANS DÉPLACER LE RANG
--
-- C'est la seule divergence de fond avec `waitlist_join`, et elle est
-- délibérée : une famille qui passe de quatre à six devrait sinon quitter la
-- file et y revenir, c'est-à-dire perdre sa place.
-- ════════════════════════════════════════════════════════════

select is(
  (public.waitlist_join_table(
     '8c8c0000-0000-4000-8000-00000000000a',
     '8c8c0000-0000-4000-8000-000000000403',
     md5('att-k1') || md5('att-k1'), 6, 'k1@exemple.fr', true) ->> 'state'),
  'already_waiting',
  'ATT-11 · re-appeler ne recrée rien : l''entrée existante répond');

select is(
  (select party_size::text
     from public.reservation_waitlist_entries
    where organization_id = '8c8c0000-0000-4000-8000-00000000000a'
      and player_key_hash = md5('att-k1') || md5('att-k1')),
  '6',
  'ATT-12 · « nous serons six, finalement » MET À JOUR l''effectif');

select is(
  (public.waitlist_join_table(
     '8c8c0000-0000-4000-8000-00000000000a',
     '8c8c0000-0000-4000-8000-000000000403',
     md5('att-k1') || md5('att-k1'), 6, 'k1@exemple.fr', true) -> 'party_size')::text,
  '6',
  'ATT-13 · …et la charge utile rend le NOUVEL effectif');

select is(
  (select count(*)::text
     from public.reservation_waitlist_entries
    where organization_id = '8c8c0000-0000-4000-8000-00000000000a'
      and player_key_hash = md5('att-k1') || md5('att-k1')),
  '1',
  'ATT-14 · une seule ligne, jamais deux — l''index unique partiel n''est pas sollicité');

select is(
  (public.waitlist_join_table(
     '8c8c0000-0000-4000-8000-00000000000a',
     '8c8c0000-0000-4000-8000-000000000403',
     md5('att-k1') || md5('att-k1'), 6, 'k1@exemple.fr', true) ->> 'position'),
  '1',
  'ATT-15 · LE RANG NE BOUGE PAS : corriger son effectif ne coûte pas sa place');


-- ════════════════════════════════════════════════════════════
-- 4. LES REFUS — TOUS SOUS LE MÊME MOT MUET
-- ════════════════════════════════════════════════════════════

select is(
  (public.waitlist_join_table(
     '8c8c0000-0000-4000-8000-00000000000a',
     '8c8c0000-0000-4000-8000-000000000405',
     md5('att-m1') || md5('att-m1'), 2) ->> 'state'),
  'unavailable',
  'ATT-16 · un créneau de MOMENT n''entre pas ici : waitlist_join reste sa fonction');

-- LE DROIT VÉRIFIÉ EST `rendez_vous`. B possède `vitrine` ET `reserver` — sur
-- lesquels le socle Réserver se gate encore — et sa salle reste pourtant muette.
select is(
  (public.waitlist_join_table(
     '8c8c0000-0000-4000-8000-00000000000b',
     '8c8c0000-0000-4000-8000-000000000406',
     md5('att-b1') || md5('att-b1'), 2) ->> 'state'),
  'unavailable',
  'ATT-17 · sans le droit `rendez_vous`, la file est muette — la Vitrine ne suffit pas');

select is(
  (public.waitlist_join_table(
     '8c8c0000-0000-4000-8000-00000000000a',
     '8c8c0000-0000-4000-8000-000000000407',
     md5('att-c1') || md5('att-c1'), 2) ->> 'state'),
  'unavailable',
  'ATT-18 · un créneau fermé non plus');

select is(
  (public.waitlist_join_table(
     '8c8c0000-0000-4000-8000-00000000000a',
     '8c8c0000-0000-4000-8000-000000000999',
     md5('att-c1') || md5('att-c1'), 2) ->> 'state'),
  'unavailable',
  'ATT-19 · un créneau inconnu rend `unavailable`, sans rien révéler');

-- L'ORGANISATION FAIT PARTIE DE LA CLÉ : le créneau de A, demandé au nom de B,
-- n'existe pas. C'est l'isolation multi-locataire, dite en une assertion.
select is(
  (public.waitlist_join_table(
     '8c8c0000-0000-4000-8000-00000000000b',
     '8c8c0000-0000-4000-8000-000000000403',
     md5('att-c1') || md5('att-c1'), 2) ->> 'state'),
  'unavailable',
  'ATT-20 · le créneau d''un autre commerçant est introuvable, pas « interdit »');

select throws_ok(
  $$select public.waitlist_join_table(
      '8c8c0000-0000-4000-8000-00000000000a',
      '8c8c0000-0000-4000-8000-000000000403', 'pas-une-empreinte', 2)$$,
  '22023', 'invalid player key',
  'ATT-21 · une empreinte mal formée LÈVE — c''est aussi ce qui rend une identité purgée inatteignable');


-- ════════════════════════════════════════════════════════════
-- 5. « UNE TABLE S'EST LIBÉRÉE » — QUI PRÉVENIR
--
-- Sur S4 : le groupe de six prend T3, celui de quatre prend T2. Il ne reste que
-- T1, deux couverts. `max_party` doit donc valoir 2 — et NON « 2 places
-- restantes » ou toute autre somme.
-- ════════════════════════════════════════════════════════════

select is(
  (public.reserve_table(
     '8c8c0000-0000-4000-8000-00000000000a',
     '8c8c0000-0000-4000-8000-000000000404',
     md5('att-r1') || md5('att-r1'), 6) ->> 'table_name'),
  'T3',
  'ATT-22 · fixture : le groupe de six occupe la table de six');

select is(
  (public.reserve_table(
     '8c8c0000-0000-4000-8000-00000000000a',
     '8c8c0000-0000-4000-8000-000000000404',
     md5('att-r2') || md5('att-r2'), 4) ->> 'table_name'),
  'T2',
  'ATT-23 · fixture : le groupe de quatre occupe la table de quatre');

-- La file de S4, DANS L'ORDRE — `created_at` vaut `clock_timestamp()`, qui
-- avance à chaque insertion même au sein d'une transaction. Sept entrées, deux
-- seulement seront prévenues.
--
-- Bloc `do` et non sept `select` nus : un `select` nu déverse sa charge utile
-- dans le flux que le parseur TAP lit.
do $fixture$
begin
  perform public.waitlist_join_table(
    '8c8c0000-0000-4000-8000-00000000000a', '8c8c0000-0000-4000-8000-000000000404',
    md5('att-w1') || md5('att-w1'), 2, 'w1@exemple.fr', true);
  perform public.waitlist_join_table(
    '8c8c0000-0000-4000-8000-00000000000a', '8c8c0000-0000-4000-8000-000000000404',
    md5('att-w2') || md5('att-w2'), 6, 'w2@exemple.fr', true);
  -- Sans adresse : personne à joindre.
  perform public.waitlist_join_table(
    '8c8c0000-0000-4000-8000-00000000000a', '8c8c0000-0000-4000-8000-000000000404',
    md5('att-w3') || md5('att-w3'), 2);
  perform public.waitlist_join_table(
    '8c8c0000-0000-4000-8000-00000000000a', '8c8c0000-0000-4000-8000-000000000404',
    md5('att-w4') || md5('att-w4'), 2, 'w4@exemple.fr', true);
  perform public.waitlist_join_table(
    '8c8c0000-0000-4000-8000-00000000000a', '8c8c0000-0000-4000-8000-000000000404',
    md5('att-w5') || md5('att-w5'), 2, 'w5@exemple.fr', true);
  perform public.waitlist_join_table(
    '8c8c0000-0000-4000-8000-00000000000a', '8c8c0000-0000-4000-8000-000000000404',
    md5('att-w6') || md5('att-w6'), 2, 'w6@exemple.fr', true);
  perform public.waitlist_join_table(
    '8c8c0000-0000-4000-8000-00000000000a', '8c8c0000-0000-4000-8000-000000000404',
    md5('att-w7') || md5('att-w7'), 1, 'w7@exemple.fr', true);
end
$fixture$;

-- w4 tient déjà une offre : la prévenir une seconde fois serait lui promettre
-- deux fois la même table.
update public.reservation_waitlist_entries
   set status = 'offered', offered_at = now(),
       offer_expires_at = now() + interval '15 minutes'
 where organization_id = '8c8c0000-0000-4000-8000-00000000000a'
   and player_key_hash = md5('att-w4') || md5('att-w4');

-- w5 a quitté la file.
update public.reservation_waitlist_entries
   set status = 'cancelled', cancelled_at = now()
 where organization_id = '8c8c0000-0000-4000-8000-00000000000a'
   and player_key_hash = md5('att-w5') || md5('att-w5');

-- w6 a été purgée. ON LUI LAISSE SON ADRESSE EXPRÈS : c'est le seul moyen de
-- prouver que c'est bien le MARQUEUR DE PURGE qui l'écarte, et non le filtre
-- « sans adresse » qui l'aurait de toute façon attrapée.
update public.reservation_waitlist_entries
   set player_key_hash = 'purge:' || id::text
 where organization_id = '8c8c0000-0000-4000-8000-00000000000a'
   and player_key_hash = md5('att-w6') || md5('att-w6');

select is(
  (public.reservation_table_freed_targets(
     '8c8c0000-0000-4000-8000-00000000000a',
     '8c8c0000-0000-4000-8000-000000000404') ->> 'state'),
  'ok',
  'ATT-24 · la fonction répond sur un créneau de salle');

select is(
  (public.reservation_table_freed_targets(
     '8c8c0000-0000-4000-8000-00000000000a',
     '8c8c0000-0000-4000-8000-000000000404') ->> 'max_party'),
  '2',
  'ATT-25 · max_party est la plus grande table LIBRE — T1 — et non une somme de couverts');

select is(
  jsonb_array_length(
    public.reservation_table_freed_targets(
      '8c8c0000-0000-4000-8000-00000000000a',
      '8c8c0000-0000-4000-8000-000000000404') -> 'targets')::text,
  '2',
  'ATT-26 · sept en attente, DEUX à prévenir');

select is(
  (public.reservation_table_freed_targets(
     '8c8c0000-0000-4000-8000-00000000000a',
     '8c8c0000-0000-4000-8000-000000000404') -> 'targets' -> 0 ->> 'email'),
  'w1@exemple.fr',
  'ATT-27 · FIFO : le premier inscrit est prévenu le premier');

select is(
  (public.reservation_table_freed_targets(
     '8c8c0000-0000-4000-8000-00000000000a',
     '8c8c0000-0000-4000-8000-000000000404') -> 'targets' -> 1 ->> 'email'),
  'w7@exemple.fr',
  'ATT-28 · …et le dernier en dernier, sur `created_at` et non sur un UUID tiré au hasard');

select is(
  (public.reservation_table_freed_targets(
     '8c8c0000-0000-4000-8000-00000000000a',
     '8c8c0000-0000-4000-8000-000000000404') -> 'targets' -> 0 ->> 'party_size'),
  '2',
  'ATT-29 · chaque cible porte son effectif : l''email peut dire « votre table pour 2 »');

select ok(
  (public.reservation_table_freed_targets(
     '8c8c0000-0000-4000-8000-00000000000a',
     '8c8c0000-0000-4000-8000-000000000404') -> 'targets')::text
  not like '%w2@exemple.fr%',
  'ATT-30 · LE GROUPE DE SIX N''EST PAS PRÉVENU : une table de deux ne le prend pas');

select ok(
  (public.reservation_table_freed_targets(
     '8c8c0000-0000-4000-8000-00000000000a',
     '8c8c0000-0000-4000-8000-000000000404') -> 'targets')::text
  not like '%w4@exemple.fr%',
  'ATT-31 · une entrée DÉJÀ PROPOSÉE n''est pas prévenue deux fois');

select ok(
  (public.reservation_table_freed_targets(
     '8c8c0000-0000-4000-8000-00000000000a',
     '8c8c0000-0000-4000-8000-000000000404') -> 'targets')::text
  not like '%w5@exemple.fr%',
  'ATT-32 · quelqu''un qui a QUITTÉ la file n''est pas rappelé');

select ok(
  (public.reservation_table_freed_targets(
     '8c8c0000-0000-4000-8000-00000000000a',
     '8c8c0000-0000-4000-8000-000000000404') -> 'targets')::text
  not like '%w6@exemple.fr%',
  'ATT-33 · une identité PURGÉE ne se prévient pas, son adresse fût-elle encore là');

-- Aucune cible sans adresse : w3 n'y est pas, et rien ne porte un `email` nul.
select is(
  (select count(*)::text
     from jsonb_array_elements(
       public.reservation_table_freed_targets(
         '8c8c0000-0000-4000-8000-00000000000a',
         '8c8c0000-0000-4000-8000-000000000404') -> 'targets') as cible
    where cible ->> 'email' is null),
  '0',
  'ATT-34 · aucune cible sans adresse : une entrée injoignable n''est pas une cible');

-- L'EMPREINTE DU JOUEUR NE SORT PAS. Elle n'a rien à faire dans un email.
select ok(
  public.reservation_table_freed_targets(
    '8c8c0000-0000-4000-8000-00000000000a',
    '8c8c0000-0000-4000-8000-000000000404')::text
  not like '%' || md5('att-w1') || md5('att-w1') || '%',
  'ATT-35 · la charge utile ne transporte aucune empreinte de joueur');

select is(
  (select array_agg(cle order by cle)::text
     from jsonb_object_keys(
       public.reservation_table_freed_targets(
         '8c8c0000-0000-4000-8000-00000000000a',
         '8c8c0000-0000-4000-8000-000000000404') -> 'targets' -> 0) as cle),
  '{created_at,email,entry_id,party_size}',
  'ATT-36 · une cible ne porte QUE ce qu''il faut pour écrire l''email');


-- ════════════════════════════════════════════════════════════
-- 6. RIEN NE S'EST LIBÉRÉ — ET C'EST UN CAS NORMAL
--
-- S2 est à quinze minutes de S1 : la fenêtre de 90 minutes du service de 20 h
-- le recouvre en entier. Toutes les tables restent prises, personne n'est à
-- prévenir, et ce n'est pas une erreur.
-- ════════════════════════════════════════════════════════════

do $fixture$
begin
  perform public.reserve_table(
    '8c8c0000-0000-4000-8000-00000000000a', '8c8c0000-0000-4000-8000-000000000401',
    md5('att-x1') || md5('att-x1'), 2);
  perform public.reserve_table(
    '8c8c0000-0000-4000-8000-00000000000a', '8c8c0000-0000-4000-8000-000000000401',
    md5('att-x2') || md5('att-x2'), 4);
  perform public.reserve_table(
    '8c8c0000-0000-4000-8000-00000000000a', '8c8c0000-0000-4000-8000-000000000401',
    md5('att-x3') || md5('att-x3'), 6);
end
$fixture$;

-- Quelqu'un attend bel et bien sur S2 : la liste vide ne l'est pas par défaut.
select is(
  (public.waitlist_join_table(
     '8c8c0000-0000-4000-8000-00000000000a',
     '8c8c0000-0000-4000-8000-000000000402',
     md5('att-w8') || md5('att-w8'), 2, 'w8@exemple.fr', true) ->> 'state'),
  'joined',
  'ATT-37 · fixture : une tablée de deux attend sur le créneau de 20 h 15');

select is(
  (public.reservation_table_freed_targets(
     '8c8c0000-0000-4000-8000-00000000000a',
     '8c8c0000-0000-4000-8000-000000000402') ->> 'max_party'),
  '0',
  'ATT-38 · toutes les tables prises par un service qui CHEVAUCHE : max_party vaut zéro');

select is(
  jsonb_array_length(
    public.reservation_table_freed_targets(
      '8c8c0000-0000-4000-8000-00000000000a',
      '8c8c0000-0000-4000-8000-000000000402') -> 'targets')::text,
  '0',
  'ATT-39 · …et la liste est VIDE, pas `unavailable` : il n''y a pas d''erreur, il n''y a personne à prévenir');

select is(
  (public.reservation_table_freed_targets(
     '8c8c0000-0000-4000-8000-00000000000a',
     '8c8c0000-0000-4000-8000-000000000402') ->> 'state'),
  'ok',
  'ATT-40 · l''état reste `ok` — un cron qui lirait `unavailable` alerterait pour rien');

-- ANNULER REND LA TABLE, ET DONC REND DES CIBLES. La boucle complète du lot.
update public.reservations
   set status = 'cancelled', cancelled_at = now()
 where organization_id = '8c8c0000-0000-4000-8000-00000000000a'
   and player_key_hash = md5('att-x2') || md5('att-x2');

select is(
  (public.reservation_table_freed_targets(
     '8c8c0000-0000-4000-8000-00000000000a',
     '8c8c0000-0000-4000-8000-000000000402') ->> 'max_party'),
  '4',
  'ATT-41 · la table de quatre annulée se libère, et le créneau chevauchant le voit');

select is(
  (public.reservation_table_freed_targets(
     '8c8c0000-0000-4000-8000-00000000000a',
     '8c8c0000-0000-4000-8000-000000000402') -> 'targets' -> 0 ->> 'email'),
  'w8@exemple.fr',
  'ATT-42 · …et la personne qui attendait est enfin quelqu''un à prévenir');


-- ════════════════════════════════════════════════════════════
-- 7. LES REFUS DE `reservation_table_freed_targets`
-- ════════════════════════════════════════════════════════════

select is(
  (public.reservation_table_freed_targets(
     '8c8c0000-0000-4000-8000-00000000000a',
     '8c8c0000-0000-4000-8000-000000000405') ->> 'state'),
  'unavailable',
  'ATT-43 · un créneau de MOMENT n''a pas de tables à libérer');

select is(
  (public.reservation_table_freed_targets(
     '8c8c0000-0000-4000-8000-00000000000b',
     '8c8c0000-0000-4000-8000-000000000406') ->> 'state'),
  'unavailable',
  'ATT-44 · sans le droit `rendez_vous`, aucune cible n''est rendue');

select is(
  (public.reservation_table_freed_targets(
     '8c8c0000-0000-4000-8000-00000000000a',
     '8c8c0000-0000-4000-8000-000000000999') ->> 'state'),
  'unavailable',
  'ATT-45 · un créneau inconnu ne dit rien de plus');

-- ELLE NE MODIFIE RIEN, ET LE CATALOGUE LE GARANTIT. `stable` interdit toute
-- écriture : c'est l'arbitrage « notifier, pas tenir » inscrit dans pg_proc.
select is(
  (select provolatile::text from pg_proc p
     join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'reservation_table_freed_targets'),
  's',
  'ATT-46 · la fonction est `stable` : elle ne tient aucune table, par construction');


-- ════════════════════════════════════════════════════════════
-- 8. ACL
-- ════════════════════════════════════════════════════════════

select ok(
  not has_function_privilege('anon',
    'public.waitlist_join_table(uuid, uuid, text, integer, text, boolean)',
    'EXECUTE'),
  'ATT-47 · anon ne rejoint pas une file directement');

select ok(
  not has_function_privilege('authenticated',
    'public.waitlist_join_table(uuid, uuid, text, integer, text, boolean)',
    'EXECUTE'),
  'ATT-48 · une session marchande non plus : le chemin passe par le serveur');

select ok(
  not has_function_privilege('anon',
    'public.reservation_table_freed_targets(uuid, uuid)', 'EXECUTE'),
  'ATT-49 · anon ne lit pas la liste des personnes à prévenir');

select ok(
  not has_function_privilege('authenticated',
    'public.reservation_table_freed_targets(uuid, uuid)', 'EXECUTE'),
  'ATT-50 · authenticated non plus — elle rend des ADRESSES');

-- L'ADRESSE RESTE HORS DU GRANT DE COLONNES. C'est ce qui rend la fonction
-- ci-dessus le seul chemin de sortie, et cette assertion le seul garde-fou
-- contre un futur `grant select on table`.
select ok(
  not has_column_privilege('authenticated',
    'public.reservation_waitlist_entries', 'email', 'SELECT'),
  'ATT-51 · email n''est PAS lisible par authenticated sur la liste d''attente');

select ok(
  not has_column_privilege('anon',
    'public.reservation_waitlist_entries', 'party_size', 'SELECT'),
  'ATT-52 · anon ne lit rien de la liste d''attente, effectif compris');

-- …MAIS L'EFFECTIF, LUI, DOIT SE LIRE. RDV-6 avait posé la colonne sans
-- l'ajouter au grant : le commerçant voyait sa file sans savoir combien ils
-- sont, et PostgREST aurait refusé EN ENTIER la requête qui la nomme.
select ok(
  has_column_privilege('authenticated',
    'public.reservation_waitlist_entries', 'party_size', 'SELECT'),
  'ATT-53 · party_size est lisible par les membres — la lacune jumelle de RDV-7');

select ok(
  not has_column_privilege('authenticated',
    'public.reservation_waitlist_entries', 'party_size', 'UPDATE'),
  'ATT-54 · …mais ne s''écrit pas depuis une session : seule la RPC le fixe');


-- ── Les gardes de rôle MORDENT, et pas seulement les grants ──
select set_config('request.jwt.claims', '{"role":"authenticated"}', true);

select throws_ok(
  $$select public.waitlist_join_table(
      '8c8c0000-0000-4000-8000-00000000000a',
      '8c8c0000-0000-4000-8000-000000000403',
      md5('att-z1') || md5('att-z1'), 2)$$,
  '42501', 'not authorized',
  'ATT-55 · la garde auth.role() de waitlist_join_table mord');

select throws_ok(
  $$select public.reservation_table_freed_targets(
      '8c8c0000-0000-4000-8000-00000000000a',
      '8c8c0000-0000-4000-8000-000000000404')$$,
  '42501', 'not authorized',
  'ATT-56 · celle de reservation_table_freed_targets aussi');

select set_config('request.jwt.claims', '{"role":"service_role"}', true);


select * from finish();
rollback;
