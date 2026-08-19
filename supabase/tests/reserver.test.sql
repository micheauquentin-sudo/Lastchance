-- ============================================================
-- LE SOCLE RÉSERVER TIENT SES PROMESSES (RES-1a, lot L3)
--
-- Ce que ce fichier prouve, et dans quel ordre :
--
--   1. CAPACITÉ. Un créneau d'une place n'en donne qu'une, et le refus est
--      `full`. Le verrou d'avis est VÉRIFIÉ DANS `pg_locks`, sur la clé exacte
--      du créneau — voir la réserve ci-dessous sur ce que « concurrence » peut
--      vouloir dire dans un fichier pgTAP.
--   2. IDEMPOTENCE. Re-réserver rend `already_reserved` ET LE MÊME CODE, sans
--      créer de seconde ligne. Annuler deux fois ne repousse pas `cancelled_at`.
--      Valider une arrivée deux fois ne la valide qu'une, et `checked_in_now`
--      dit laquelle des deux fois a compté.
--   3. LA PLACE REVIENT. Après annulation, un AUTRE joueur passe sur un
--      créneau qui était complet — sans qu'aucun compteur n'ait été décrémenté,
--      puisqu'il n'y en a pas.
--   4. UNE ARRIVÉE NE S'ANNULE PAS. Ni par la RPC (`already_checked_in`), ni
--      par une écriture directe (les `check` d'état la refusent).
--   5. ISOLATION. Le check-in d'un code d'une organisation VOISINE rend
--      EXACTEMENT ce que rend un code inconnu : zéro ligne. L'état public d'un
--      joueur est borné à l'organisation interrogée. La RLS ne laisse lire ni
--      à `anon`, ni au voisin, et l'email n'est lisible par PERSONNE en
--      session marchande.
--   6. LE DROIT `vitrine`. Une organisation qui ne l'a pas ne prend aucune
--      réservation, même sur un créneau parfaitement ouvert.
--   7. PURGE. Passé la rétention, l'adresse, son consentement ET le lien à
--      l'appareil s'effacent ; la ligne, elle, reste — et un second passage
--      ne réécrit rien.
--
-- ── CE QUE CE FICHIER NE PROUVE PAS, ET IL FAUT LE DIRE ──
--
-- pgTAP tourne dans UNE session et UNE transaction : il ne peut pas lancer
-- deux `reserve_slot` réellement simultanés. Ce qui est prouvé ici, c'est
-- (a) que le comptage est CONDITIONNEL — la seconde demande voit la première
-- et refuse — et (b) que le verrou d'avis attendu EST bien détenu, sur la clé
-- du créneau, après l'appel. La sérialisation elle-même est une propriété de
-- `pg_advisory_xact_lock`, pas quelque chose que ce fichier peut rejouer ;
-- prétendre le contraire serait un vert qui ne prouve rien.
--
-- Le fichier doit passer sur une base VIDE comme sur une base SEMÉE : toutes
-- les assertions sont bornées aux organisations créées ici, aucune ne compte
-- globalement.
-- ============================================================
begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

select set_config('request.jwt.claims', '{"role":"service_role"}', true);

-- ── Fixtures ─────────────────────────────────────────────────
-- A : SERVIE — le droit `vitrine` par OCTROI daté vivant (le chemin de la
-- bêta, 20261001120000). C'est volontairement l'octroi et non `addon_vitrine` :
-- c'est le seul chemin ouvert aujourd'hui, donc le seul qui mérite d'être joué.
-- B : VOISINE, servie elle aussi — sans quoi « le voisin ne voit rien » se
-- confondrait avec « le voisin n'a pas le module ».
-- C : SANS le droit — abonnement vivant, mais ni octroi ni `addon_vitrine`.
insert into public.organizations
  (id, name, slug, subscription_status, plan, timezone, data_retention_months)
values
  ('4e5e0000-0000-4000-8000-00000000000a', 'Réserver A', 'tap-rv-a',
   'active', 'starter', 'Europe/Paris', 6),
  ('4e5e0000-0000-4000-8000-00000000000b', 'Réserver B', 'tap-rv-b',
   'active', 'starter', 'Europe/Paris', 6),
  ('4e5e0000-0000-4000-8000-00000000000c', 'Réserver C', 'tap-rv-c',
   'active', 'starter', 'Europe/Paris', 6);

insert into public.organization_module_grants
  (organization_id, module, kind, source, starts_at, ends_at)
values
  ('4e5e0000-0000-4000-8000-00000000000a', 'vitrine', 'pass', 'backoffice',
   now() - interval '1 day', now() + interval '365 days'),
  ('4e5e0000-0000-4000-8000-00000000000b', 'vitrine', 'pass', 'backoffice',
   now() - interval '1 day', now() + interval '365 days');

insert into auth.users (id, email) values
  ('4e5e0000-0000-4000-8000-000000000101', 'proprio-a@tap-rv.local'),
  ('4e5e0000-0000-4000-8000-000000000102', 'caissier-a@tap-rv.local'),
  ('4e5e0000-0000-4000-8000-000000000103', 'proprio-b@tap-rv.local'),
  ('4e5e0000-0000-4000-8000-000000000104', 'inconnu@tap-rv.local');

insert into public.organization_members (organization_id, user_id, role) values
  ('4e5e0000-0000-4000-8000-00000000000a',
   '4e5e0000-0000-4000-8000-000000000101', 'owner'),
  ('4e5e0000-0000-4000-8000-00000000000a',
   '4e5e0000-0000-4000-8000-000000000102', 'cashier'),
  ('4e5e0000-0000-4000-8000-00000000000b',
   '4e5e0000-0000-4000-8000-000000000103', 'owner');

insert into public.reservation_activities
  (id, organization_id, name, description, active)
values
  ('4e5e0000-0000-4000-8000-000000000201',
   '4e5e0000-0000-4000-8000-00000000000a', 'Dégustation', 'Trois vins', true),
  -- Activité COUPÉE : ses créneaux restent ouverts, et pourtant rien ne passe.
  ('4e5e0000-0000-4000-8000-000000000202',
   '4e5e0000-0000-4000-8000-00000000000a', 'Atelier suspendu', null, false),
  ('4e5e0000-0000-4000-8000-000000000203',
   '4e5e0000-0000-4000-8000-00000000000b', 'Dégustation voisine', null, true),
  ('4e5e0000-0000-4000-8000-000000000204',
   '4e5e0000-0000-4000-8000-00000000000c', 'Dégustation sans droit', null, true);

insert into public.reservation_slots
  (id, activity_id, organization_id, starts_at, ends_at, capacity, status)
values
  -- S1 : UNE place. C'est le créneau de la capacité.
  ('4e5e0000-0000-4000-8000-000000000301',
   '4e5e0000-0000-4000-8000-000000000201',
   '4e5e0000-0000-4000-8000-00000000000a',
   now() + interval '2 days', now() + interval '2 days 1 hour', 1, 'open'),
  -- S2 : deux places, sert au check-in et à la purge.
  ('4e5e0000-0000-4000-8000-000000000302',
   '4e5e0000-0000-4000-8000-000000000201',
   '4e5e0000-0000-4000-8000-00000000000a',
   now() + interval '3 days', now() + interval '3 days 1 hour', 2, 'open'),
  -- S3 : ouvert mais PASSÉ.
  ('4e5e0000-0000-4000-8000-000000000303',
   '4e5e0000-0000-4000-8000-000000000201',
   '4e5e0000-0000-4000-8000-00000000000a',
   now() - interval '2 hours', now() - interval '1 hour', 5, 'open'),
  -- S4 : à venir mais en BROUILLON.
  ('4e5e0000-0000-4000-8000-000000000304',
   '4e5e0000-0000-4000-8000-000000000201',
   '4e5e0000-0000-4000-8000-00000000000a',
   now() + interval '4 days', now() + interval '4 days 1 hour', 5, 'draft'),
  -- S5 : créneau ouvert d'une activité COUPÉE.
  ('4e5e0000-0000-4000-8000-000000000305',
   '4e5e0000-0000-4000-8000-000000000202',
   '4e5e0000-0000-4000-8000-00000000000a',
   now() + interval '5 days', now() + interval '5 days 1 hour', 5, 'open'),
  -- S6 : chez la VOISINE, parfaitement ouvert.
  ('4e5e0000-0000-4000-8000-000000000306',
   '4e5e0000-0000-4000-8000-000000000203',
   '4e5e0000-0000-4000-8000-00000000000b',
   now() + interval '2 days', now() + interval '2 days 1 hour', 5, 'open'),
  -- S7 : chez l'organisation SANS le droit `vitrine`, tout aussi ouvert.
  ('4e5e0000-0000-4000-8000-000000000307',
   '4e5e0000-0000-4000-8000-000000000204',
   '4e5e0000-0000-4000-8000-00000000000c',
   now() + interval '2 days', now() + interval '2 days 1 hour', 5, 'open');


-- ════════════════════════════════════════════════════════════
-- 1. CAPACITÉ — un créneau d'une place n'en donne qu'une
-- ════════════════════════════════════════════════════════════

create temporary table rv_r1 as
select public.reserve_slot(
  '4e5e0000-0000-4000-8000-000000000301',
  repeat('a', 64), 'Alice@Example.COM ', true
) as j;

select is((select j->>'state' from rv_r1), 'reserved',
  'CAP-1 la première demande passe');
select ok((select (j->>'code') ~ '^[A-HJ-NP-Z2-9]{8}$' from rv_r1),
  'CAP-2 le code court est posé par le serveur, à l''alphabet sans ambiguïté');
select is((select (j->>'remaining')::int from rv_r1), 0,
  'CAP-3 la place restante annoncée tombe à zéro');

-- L'email est NORMALISÉ (minuscules, sans espaces) et le consentement daté :
-- deux orthographes de la même adresse ne doivent pas faire deux personnes.
select is(
  (select r.email from public.reservations r
    where r.slot_id = '4e5e0000-0000-4000-8000-000000000301'),
  'alice@example.com',
  'CAP-4 l''adresse est normalisée avant d''être stockée');
select ok(
  (select r.consent_transactional_at is not null from public.reservations r
    where r.slot_id = '4e5e0000-0000-4000-8000-000000000301'),
  'CAP-5 le consentement transactionnel est daté à la réservation');

-- LE VERROU EST RÉELLEMENT DÉTENU, et sur LA clé du créneau. Sans cette
-- assertion, retirer le `pg_advisory_xact_lock` de reserve_slot laisserait
-- tout ce fichier au vert : en session unique, le comptage seul suffit.
with k as (
  select pg_catalog.hashtextextended(
    'reservation_slot:' || '4e5e0000-0000-4000-8000-000000000301', 0) as v
)
select ok(
  exists (
    select 1 from pg_locks l, k
     where l.locktype = 'advisory'
       and l.objsubid = 1
       and l.classid::bigint = ((k.v >> 32) & 4294967295)
       and l.objid::bigint = (k.v & 4294967295)
  ),
  'CAP-6 le verrou d''avis du créneau est détenu par la transaction');

-- Un AUTRE joueur, même créneau : la place est prise.
select is(
  (public.reserve_slot(
    '4e5e0000-0000-4000-8000-000000000301', repeat('b', 64)))->>'state',
  'full',
  'CAP-7 la seconde demande sur une place unique est refusée « full »');
select results_eq(
  $$select count(*) from public.reservations
     where slot_id = '4e5e0000-0000-4000-8000-000000000301'$$,
  array[1::bigint],
  'CAP-8 aucune sur-réservation : une seule ligne existe');


-- ════════════════════════════════════════════════════════════
-- 2. IDEMPOTENCE — re-réserver rend la réservation existante
-- ════════════════════════════════════════════════════════════

create temporary table rv_r2 as
select public.reserve_slot(
  '4e5e0000-0000-4000-8000-000000000301', repeat('a', 64)) as j;

select is((select j->>'state' from rv_r2), 'already_reserved',
  'IDEM-1 le même joueur ne réserve pas deux fois');
select is((select j->>'code' from rv_r2), (select j->>'code' from rv_r1),
  'IDEM-2 il retrouve SON code, pas un nouveau');
select results_eq(
  $$select count(*) from public.reservations
     where slot_id = '4e5e0000-0000-4000-8000-000000000301'$$,
  array[1::bigint],
  'IDEM-3 aucune seconde ligne n''a été créée');

-- La base le refuserait de toute façon : l'index partiel est la ceinture.
select throws_ok(
  $$insert into public.reservations (slot_id, organization_id, player_key_hash)
    values ('4e5e0000-0000-4000-8000-000000000301',
            '4e5e0000-0000-4000-8000-00000000000a', repeat('a', 64))$$,
  '23505',
  null,
  'IDEM-4 l''index partiel refuse une seconde réservation vivante du même joueur');


-- ════════════════════════════════════════════════════════════
-- 3. REFUS INDISTINCTS — passé, brouillon, activité coupée, sans droit
-- ════════════════════════════════════════════════════════════

select is(
  (public.reserve_slot(
    '4e5e0000-0000-4000-8000-000000000303', repeat('c', 64)))->>'state',
  'unavailable', 'REF-1 un créneau passé ne se réserve pas');
select is(
  (public.reserve_slot(
    '4e5e0000-0000-4000-8000-000000000304', repeat('c', 64)))->>'state',
  'unavailable', 'REF-2 un créneau en brouillon ne se réserve pas');
select is(
  (public.reserve_slot(
    '4e5e0000-0000-4000-8000-000000000305', repeat('c', 64)))->>'state',
  'unavailable', 'REF-3 un créneau ouvert d''une activité coupée ne se réserve pas');
select is(
  (public.reserve_slot(
    '4e5e0000-0000-4000-8000-000000000307', repeat('c', 64)))->>'state',
  'unavailable',
  'REF-4 VITRINE une organisation sans le droit ne prend aucune réservation');
select is(
  (public.reserve_slot(
    '4e5e0000-0000-4000-8000-0000000009ff', repeat('c', 64)))->>'state',
  'unavailable',
  'REF-5 un créneau inexistant rend LE MÊME état que les quatre refus ci-dessus');
select is(
  (public.reserve_slot(
    '4e5e0000-0000-4000-8000-000000000302', repeat('c', 64), 'pas-une-adresse'))->>'state',
  'invalid_email', 'REF-6 une adresse malformée est refusée avant toute écriture');
select results_eq(
  $$select count(*) from public.reservations
     where organization_id = '4e5e0000-0000-4000-8000-00000000000c'$$,
  array[0::bigint],
  'REF-7 aucun de ces refus n''a laissé de ligne derrière lui');


-- ════════════════════════════════════════════════════════════
-- 4. ANNULATION — la place revient, et une arrivée ne s'annule pas
-- ════════════════════════════════════════════════════════════

create temporary table rv_ids as
select r.id as alice_id, r.code as alice_code
  from public.reservations r
 where r.slot_id = '4e5e0000-0000-4000-8000-000000000301';

-- Preuve de possession : l'empreinte d'un autre joueur ne donne rien, et
-- surtout rien qui distingue « pas à toi » de « n'existe pas ».
select is(
  (public.cancel_reservation(
    (select alice_id from rv_ids), repeat('b', 64)))->>'state',
  'unknown',
  'ANN-1 une empreinte qui n''est pas la sienne n''annule rien');

select is(
  (public.cancel_reservation(
    (select alice_id from rv_ids), repeat('a', 64)))->>'state',
  'cancelled', 'ANN-2 le joueur annule sa réservation');

create temporary table rv_c2 as
select public.cancel_reservation(
  (select alice_id from rv_ids), repeat('a', 64)) as j;
select is((select j->>'state' from rv_c2), 'cancelled',
  'ANN-3 annuler deux fois rend le même état');
select is(
  (select (j->>'cancelled_at')::timestamptz from rv_c2),
  (select r.cancelled_at from public.reservations r
    where r.id = (select alice_id from rv_ids)),
  'ANN-4 le second appel ne repousse pas l''horodatage d''annulation');

-- LA PLACE EST REVENUE — sans qu'aucun compteur n'ait bougé, puisqu'il n'y en a
-- pas : le comptage de reserve_slot ne voit tout simplement plus la ligne.
select is(
  (public.reserve_slot(
    '4e5e0000-0000-4000-8000-000000000301', repeat('b', 64)))->>'state',
  'reserved',
  'ANN-5 la place libérée est reprise par un autre joueur');
select results_eq(
  $$select count(*) from public.reservations
     where slot_id = '4e5e0000-0000-4000-8000-000000000301'
       and status = 'confirmed'$$,
  array[1::bigint],
  'ANN-6 le créneau d''une place en compte toujours exactement une');

-- Et l'annulée peut re-réserver à son tour ? Non : la place est reprise.
select is(
  (public.reserve_slot(
    '4e5e0000-0000-4000-8000-000000000301', repeat('a', 64)))->>'state',
  'full', 'ANN-7 celui qui a annulé ne récupère pas une place déjà reprise');


-- ════════════════════════════════════════════════════════════
-- 5. CHECK-IN — org-scopé, autorisé, idempotent, indistinguable
-- ════════════════════════════════════════════════════════════

create temporary table rv_r3 as
select public.reserve_slot(
  '4e5e0000-0000-4000-8000-000000000302', repeat('d', 64),
  'dora@example.com', true) as j;
create temporary table rv_code as select (select j->>'code' from rv_r3) as c;

-- Un compte qui n'est membre de RIEN ne valide aucune arrivée.
select throws_ok(
  format(
    $$select * from public.checkin_reservation(
        '4e5e0000-0000-4000-8000-00000000000a', %L,
        '4e5e0000-0000-4000-8000-000000000104')$$,
    (select c from rv_code)),
  '42501', 'not authorized',
  'CHK-1 un non-membre ne valide aucune arrivée');
-- Un membre de la VOISINE non plus, même en visant la bonne organisation.
select throws_ok(
  format(
    $$select * from public.checkin_reservation(
        '4e5e0000-0000-4000-8000-00000000000a', %L,
        '4e5e0000-0000-4000-8000-000000000103')$$,
    (select c from rv_code)),
  '42501', 'not authorized',
  'CHK-2 un membre d''une autre organisation ne valide aucune arrivée');

-- Le CAISSIER, lui, valide : c'est un geste de comptoir.
create temporary table rv_k1 as
select * from public.checkin_reservation(
  '4e5e0000-0000-4000-8000-00000000000a',
  (select c from rv_code),
  '4e5e0000-0000-4000-8000-000000000102');

select is((select status from rv_k1), 'checked_in',
  'CHK-3 le caissier valide l''arrivée');
select ok((select checked_in_now from rv_k1),
  'CHK-4 le premier appel est bien celui qui a compté');
select is((select activity_name from rv_k1), 'Dégustation',
  'CHK-5 le comptoir voit de quelle activité il s''agit');
select is(
  (select r.checked_in_by from public.reservations r
    where r.code = (select c from rv_code)
      and r.organization_id = '4e5e0000-0000-4000-8000-00000000000a'),
  '4e5e0000-0000-4000-8000-000000000102'::uuid,
  'CHK-6 l''auteur de la validation est enregistré');
select results_eq(
  $$select count(*) from public.audit_logs
     where organization_id = '4e5e0000-0000-4000-8000-00000000000a'
       and action = 'reservation.checkin'$$,
  array[1::bigint], 'CHK-7 l''arrivée est auditée, une fois');

-- IDEMPOTENCE : deuxième passage du même code.
create temporary table rv_k2 as
select * from public.checkin_reservation(
  '4e5e0000-0000-4000-8000-00000000000a',
  (select c from rv_code),
  '4e5e0000-0000-4000-8000-000000000102');
select is((select status from rv_k2), 'checked_in',
  'CHK-8 le second passage rend l''état, sans le refuser');
select ok(not (select checked_in_now from rv_k2),
  'CHK-9 mais il ne compte pas comme une arrivée');
select is((select checked_in_at from rv_k2), (select checked_in_at from rv_k1),
  'CHK-10 l''horodatage d''arrivée n''est pas repoussé');
select results_eq(
  $$select count(*) from public.audit_logs
     where organization_id = '4e5e0000-0000-4000-8000-00000000000a'
       and action = 'reservation.checkin'$$,
  array[1::bigint], 'CHK-11 et il n''ajoute aucune ligne d''audit');

-- L'ARRIVÉE NE S'ANNULE PLUS.
select is(
  (public.cancel_reservation(
    (select r.id from public.reservations r
      where r.code = (select c from rv_code)
        and r.organization_id = '4e5e0000-0000-4000-8000-00000000000a'),
    repeat('d', 64)))->>'state',
  'already_checked_in',
  'CHK-12 une réservation arrivée ne peut plus être annulée');

-- INDISTINGUABILITÉ. Le code d'A présenté chez B, et un code qui n'existe
-- nulle part, rendent la MÊME chose : rien.
select results_eq(
  format(
    $$select count(*)::bigint from public.checkin_reservation(
        '4e5e0000-0000-4000-8000-00000000000b', %L,
        '4e5e0000-0000-4000-8000-000000000103')$$,
    (select c from rv_code)),
  array[0::bigint],
  'CHK-13 le code d''une autre organisation ne rend aucune ligne');
select results_eq(
  $$select count(*)::bigint from public.checkin_reservation(
      '4e5e0000-0000-4000-8000-00000000000b', 'ZZZZZZZZ',
      '4e5e0000-0000-4000-8000-000000000103')$$,
  array[0::bigint],
  'CHK-14 un code inconnu rend EXACTEMENT la même chose : aucune ligne');
select results_eq(
  $$select count(*) from public.reservations
     where status = 'checked_in'
       and organization_id = '4e5e0000-0000-4000-8000-00000000000a'$$,
  array[1::bigint],
  'CHK-15 la tentative croisée n''a rien consommé');

-- Deux organisations ont le droit de porter le MÊME code court.
insert into public.reservations
  (slot_id, organization_id, player_key_hash, code)
values ('4e5e0000-0000-4000-8000-000000000306',
        '4e5e0000-0000-4000-8000-00000000000b', repeat('e', 64),
        (select c from rv_code));
select results_eq(
  format($$select count(*) from public.reservations where code = %L$$,
         (select c from rv_code)),
  array[2::bigint],
  'CHK-16 le code n''est unique QUE dans son organisation');


-- ════════════════════════════════════════════════════════════
-- 6. CONTRAINTES D'ÉTAT — la base refuse les états impossibles
-- ════════════════════════════════════════════════════════════

select throws_ok(
  $$update public.reservations set cancelled_at = now()
     where code = (select c from rv_code)
       and organization_id = '4e5e0000-0000-4000-8000-00000000000a'$$,
  '23514', null,
  'ETAT-1 poser une annulation sur une arrivée est refusé (XOR terminal)');
select throws_ok(
  $$insert into public.reservations
      (slot_id, organization_id, player_key_hash, status)
    values ('4e5e0000-0000-4000-8000-000000000302',
            '4e5e0000-0000-4000-8000-00000000000a', repeat('f', 64),
            'checked_in')$$,
  '23514', null,
  'ETAT-2 un statut « arrivé » sans horodatage est refusé');
select throws_ok(
  $$insert into public.reservations
      (slot_id, organization_id, player_key_hash, consent_transactional_at)
    values ('4e5e0000-0000-4000-8000-000000000302',
            '4e5e0000-0000-4000-8000-00000000000a', repeat('f', 64), now())$$,
  '23514', null,
  'ETAT-3 un consentement sans adresse est refusé');
select throws_ok(
  $$insert into public.reservation_slots
      (activity_id, organization_id, starts_at, ends_at, capacity)
    values ('4e5e0000-0000-4000-8000-000000000201',
            '4e5e0000-0000-4000-8000-00000000000a',
            now() + interval '9 days', now() + interval '9 days 1 hour', 0)$$,
  '23514', null,
  'ETAT-4 un créneau de zéro place n''existe pas');
-- FK COMPOSITE : un créneau de A ne peut pas être rattaché à une activité de B.
select throws_ok(
  $$insert into public.reservation_slots
      (activity_id, organization_id, starts_at, ends_at, capacity)
    values ('4e5e0000-0000-4000-8000-000000000203',
            '4e5e0000-0000-4000-8000-00000000000a',
            now() + interval '9 days', now() + interval '9 days 1 hour', 5)$$,
  '23503', null,
  'ETAT-5 la FK composite refuse un créneau cousu sur l''activité d''un voisin');


-- ════════════════════════════════════════════════════════════
-- 7. ÉTAT PUBLIC — le joueur retrouve sa place, bornée à l'organisation
-- ════════════════════════════════════════════════════════════

create temporary table rv_pub as
select public.reservation_public_state(
  '4e5e0000-0000-4000-8000-00000000000a', repeat('d', 64)) as j;

select is((select j->>'state' from rv_pub), 'ok', 'PUB-1 l''état public répond');
select is((select j->>'timezone' from rv_pub), 'Europe/Paris',
  'PUB-2 il transporte le fuseau de l''organisation, pour que le client affiche juste');
select is(
  (select pg_catalog.jsonb_array_length(j->'reservations') from rv_pub), 1,
  'PUB-3 le joueur retrouve sa réservation sans compte');
select is(
  (select j->'reservations'->0->>'activity_name' from rv_pub), 'Dégustation',
  'PUB-4 avec son activité');
select ok(
  (select not (j->'reservations'->0 ? 'email') from rv_pub)
  and (select not (j->'reservations'->0 ? 'player_key_hash') from rv_pub),
  'PUB-5 et SANS son adresse ni l''empreinte qui sert de clé');

-- Le même joueur, interrogé depuis la VOISINE : rien. L'empreinte du cookie
-- est globale, la réponse ne l'est pas.
select is(
  (select pg_catalog.jsonb_array_length(
    (public.reservation_public_state(
      '4e5e0000-0000-4000-8000-00000000000b', repeat('d', 64)))->'reservations')),
  0,
  'PUB-6 ISOLATION la même empreinte ne rend rien chez l''organisation voisine');


-- ════════════════════════════════════════════════════════════
-- 8. ACL — les quatre RPC sont service_role, et elles seules
-- ════════════════════════════════════════════════════════════

select ok(has_function_privilege('service_role',
  'public.reserve_slot(uuid,text,text,boolean)', 'EXECUTE'),
  'ACL-1 service_role exécute reserve_slot');
select ok(not has_function_privilege('authenticated',
  'public.reserve_slot(uuid,text,text,boolean)', 'EXECUTE'),
  'ACL-2 authenticated ne l''exécute pas');
select ok(not has_function_privilege('anon',
  'public.reserve_slot(uuid,text,text,boolean)', 'EXECUTE'),
  'ACL-3 anon ne l''exécute pas');
select ok(not has_function_privilege('authenticated',
  'public.cancel_reservation(uuid,text)', 'EXECUTE'),
  'ACL-4 cancel_reservation est fermée à authenticated');
select ok(not has_function_privilege('anon',
  'public.cancel_reservation(uuid,text)', 'EXECUTE'),
  'ACL-5 cancel_reservation est fermée à anon');
select ok(not has_function_privilege('authenticated',
  'public.checkin_reservation(uuid,text,text)', 'EXECUTE'),
  'ACL-6 checkin_reservation est fermée à authenticated');
select ok(not has_function_privilege('anon',
  'public.checkin_reservation(uuid,text,text)', 'EXECUTE'),
  'ACL-7 checkin_reservation est fermée à anon');
select ok(not has_function_privilege('authenticated',
  'public.reservation_public_state(uuid,text)', 'EXECUTE'),
  'ACL-8 reservation_public_state est fermée à authenticated');
select ok(not has_function_privilege('anon',
  'public.reservation_public_state(uuid,text)', 'EXECUTE'),
  'ACL-9 reservation_public_state est fermée à anon');

-- Le catalogue ne prouve pas l'exécution : la garde `auth.role()` doit mordre
-- aussi. On la joue en se faisant passer pour une session marchande.
select set_config('request.jwt.claims', '{"role":"authenticated"}', true);
select throws_ok(
  $$select public.reserve_slot(
      '4e5e0000-0000-4000-8000-000000000302', repeat('9', 64))$$,
  '42501', 'not authorized',
  'ACL-10 la garde auth.role() de reserve_slot mord, pas seulement le grant');
select throws_ok(
  $$select public.reservation_public_state(
      '4e5e0000-0000-4000-8000-00000000000a', repeat('d', 64))$$,
  '42501', 'not authorized',
  'ACL-11 idem pour l''état public');
select set_config('request.jwt.claims', '{"role":"service_role"}', true);

-- Les trois tables ferment `anon` au niveau TABLE, pas seulement par RLS.
select ok(not has_table_privilege('anon', 'public.reservations', 'SELECT'),
  'ACL-12 anon n''a aucun privilège de table sur les réservations');
select ok(not has_table_privilege('anon', 'public.reservation_slots', 'SELECT'),
  'ACL-13 anon n''a aucun privilège de table sur les créneaux');
select ok(not has_table_privilege('anon', 'public.reservation_activities', 'SELECT'),
  'ACL-14 anon n''a aucun privilège de table sur les activités');
-- L'ADRESSE est hors du grant de colonnes du commerçant.
select ok(not has_column_privilege('authenticated',
  'public.reservations', 'email', 'SELECT'),
  'ACL-15 le commerçant ne lit pas l''adresse : elle sert au serveur, pas à l''écran');
select ok(has_column_privilege('authenticated',
  'public.reservations', 'code', 'SELECT'),
  'ACL-16 il lit en revanche le code de check-in');
-- Aucune écriture directe : la capacité ne se contourne pas par PostgREST.
select ok(not has_table_privilege('authenticated', 'public.reservations', 'INSERT'),
  'ACL-17 aucune insertion directe de réservation');
select ok(not has_table_privilege('authenticated', 'public.reservations', 'UPDATE'),
  'ACL-18 aucune mise à jour directe de réservation');
select ok(not has_table_privilege('authenticated', 'public.reservations', 'DELETE'),
  'ACL-19 aucune suppression directe de réservation');


-- ════════════════════════════════════════════════════════════
-- 9. RLS — le voisin ne voit rien, le caissier voit son comptoir
-- ════════════════════════════════════════════════════════════

-- `request.jwt.claims` est VIDÉ avant de basculer en session marchande.
-- `auth.uid()` lit `request.jwt.claim.sub` d'abord, mais laisser derrière soi un
-- `claims` qui annonce `service_role` sans porter de `sub` mélange deux
-- identités dans la même session — et le jour où l'ordre de ce `coalesce`
-- change côté Supabase, tout ce bloc rendrait 0 partout, ce qui se lit
-- exactement comme « la RLS isole bien ».
select set_config('request.jwt.claims', '', true);
set local role authenticated;

set local "request.jwt.claim.sub" = '4e5e0000-0000-4000-8000-000000000103';
select results_eq(
  $$select count(*) from public.reservations
     where organization_id = '4e5e0000-0000-4000-8000-00000000000a'$$,
  array[0::bigint],
  'RLS-1 le propriétaire voisin ne voit aucune réservation de A');
select results_eq(
  $$select count(*) from public.reservation_activities
     where organization_id = '4e5e0000-0000-4000-8000-00000000000a'$$,
  array[0::bigint],
  'RLS-2 ni aucune de ses activités');
select results_eq(
  $$select count(*) from public.reservation_slots
     where organization_id = '4e5e0000-0000-4000-8000-00000000000a'$$,
  array[0::bigint],
  'RLS-3 ni aucun de ses créneaux');

set local "request.jwt.claim.sub" = '4e5e0000-0000-4000-8000-000000000102';
select results_eq(
  $$select count(*) from public.reservations
     where organization_id = '4e5e0000-0000-4000-8000-00000000000a'$$,
  array[3::bigint],
  'RLS-4 le CAISSIER voit les réservations de son organisation (écran de comptoir)');
select results_eq(
  $$select count(*) from public.reservation_activities
     where organization_id = '4e5e0000-0000-4000-8000-00000000000a'$$,
  array[0::bigint],
  'RLS-5 mais pas le catalogue d''activités, réservé aux éditeurs');
select throws_ok(
  $$select email from public.reservations
     where organization_id = '4e5e0000-0000-4000-8000-00000000000a'$$,
  '42501', null,
  'RLS-6 et il ne lit l''adresse d''aucune : le grant de colonnes la retient');

set local "request.jwt.claim.sub" = '4e5e0000-0000-4000-8000-000000000101';
select results_eq(
  $$select count(*) from public.reservation_activities
     where organization_id = '4e5e0000-0000-4000-8000-00000000000a'$$,
  array[2::bigint],
  'RLS-7 le propriétaire lit son catalogue d''activités');
select throws_ok(
  $$insert into public.reservations (slot_id, organization_id, player_key_hash)
    values ('4e5e0000-0000-4000-8000-000000000302',
            '4e5e0000-0000-4000-8000-00000000000a', repeat('7', 64))$$,
  '42501', null,
  'RLS-8 même le propriétaire ne s''ajoute pas une réservation à la main');

set local role anon;
select throws_ok(
  $$select count(*) from public.reservations$$,
  '42501', null, 'RLS-9 anon ne lit aucune réservation');
select throws_ok(
  $$select count(*) from public.reservation_slots$$,
  '42501', null, 'RLS-10 anon ne lit aucun créneau');

reset role;
select set_config('request.jwt.claim.sub', '', true);


-- ════════════════════════════════════════════════════════════
-- 10. PURGE RGPD — la ligne reste, la personne s'efface
-- ════════════════════════════════════════════════════════════

-- Une réservation ANCIENNE (au-delà des 6 mois de rétention de A) et une
-- RÉCENTE, pour prouver que la purge ne mord que sur la première.
insert into public.reservations
  (id, slot_id, organization_id, player_key_hash, email,
   consent_transactional_at, code, created_at)
values
  ('4e5e0000-0000-4000-8000-000000000401',
   '4e5e0000-0000-4000-8000-000000000302',
   '4e5e0000-0000-4000-8000-00000000000a', repeat('1', 64),
   'vieille@example.com', now() - interval '10 months', 'PURGEAAA',
   now() - interval '10 months'),
  ('4e5e0000-0000-4000-8000-000000000402',
   '4e5e0000-0000-4000-8000-000000000302',
   '4e5e0000-0000-4000-8000-00000000000a', repeat('2', 64),
   'recente@example.com', now(), 'PURGEBBB', now());

select public.purge_expired_personal_data();

select results_eq(
  $$select count(*) from public.reservations
     where id = '4e5e0000-0000-4000-8000-000000000401'$$,
  array[1::bigint],
  'PURGE-1 la ligne périmée EXISTE toujours — le remplissage appartient au commerçant');
select is(
  (select email from public.reservations
    where id = '4e5e0000-0000-4000-8000-000000000401'),
  null, 'PURGE-2 son adresse est effacée');
select is(
  (select consent_transactional_at from public.reservations
    where id = '4e5e0000-0000-4000-8000-000000000401'),
  null, 'PURGE-3 son consentement aussi — il ne survit pas à l''adresse');
select is(
  (select player_key_hash from public.reservations
    where id = '4e5e0000-0000-4000-8000-000000000401'),
  pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(
    '4e5e0000-0000-4000-8000-000000000401', 'UTF8')), 'hex'),
  'PURGE-4 et le lien à l''appareil est remplacé par une valeur dérivée de la ligne');
select is(
  (select email from public.reservations
    where id = '4e5e0000-0000-4000-8000-000000000402'),
  'recente@example.com',
  'PURGE-5 la réservation récente est intacte');

-- IDEMPOTENCE : un second passage ne réécrit rien (sinon chaque nuit
-- reconstruirait les mêmes lignes mortes, indéfiniment).
--
-- La preuve porte sur `ctid` et NON sur `xmin`. Les deux passages ont lieu dans
-- la MÊME transaction, donc le même identifiant de transaction : `xmin` serait
-- identique qu'il y ait eu réécriture ou non, et l'assertion passerait au vert
-- en ne prouvant rien. Une mise à jour, elle, crée toujours une nouvelle
-- version physique de la ligne — c'est `ctid` qui la voit.
create temporary table rv_purge_ctid as
select ctid as t from public.reservations
 where id = '4e5e0000-0000-4000-8000-000000000401';
select public.purge_expired_personal_data();
select is(
  (select ctid from public.reservations
    where id = '4e5e0000-0000-4000-8000-000000000401'),
  (select t from rv_purge_ctid),
  'PURGE-6 un second passage ne réécrit pas la ligne déjà neutralisée');

select * from finish();
rollback;
