-- ============================================================
-- LE SOCLE RÉSERVER TIENT SES PROMESSES (RES-1a, lot L3)
--
-- Ce que ce fichier prouve, et dans quel ordre :
--
--   1. CAPACITÉ. Un créneau d'une place n'en donne qu'une, et le refus est
--      `full`. Le verrou d'avis est VÉRIFIÉ DANS `pg_locks`, sur la clé exacte
--      — ORGANISATION ET créneau — voir la réserve ci-dessous sur ce que
--      « concurrence » peut vouloir dire dans un fichier pgTAP.
--   2. IDEMPOTENCE. Re-réserver rend `already_reserved` ET LE MÊME CODE, sans
--      créer de seconde ligne. Annuler deux fois ne repousse pas `cancelled_at`.
--      Valider une arrivée deux fois ne la valide qu'une, et `checked_in_now`
--      dit laquelle des deux fois a compté.
--   3. LA PLACE REVIENT — À L'ANNULATION, ET SEULEMENT LÀ. Après annulation, un
--      AUTRE joueur passe sur un créneau qui était complet, sans qu'aucun
--      compteur n'ait été décrémenté puisqu'il n'y en a pas. LE CHECK-IN, LUI,
--      NE REND RIEN : bloc 11, quatre arrivées sur quatre places, la cinquième
--      demande reste refusée.
--   4. UNE ARRIVÉE NE S'ANNULE PAS, et un créneau commencé non plus. Ni par la
--      RPC (`already_checked_in`, `too_late`), ni par une écriture directe (les
--      `check` d'état la refusent).
--   5. ISOLATION. Le check-in d'un code d'une organisation VOISINE rend
--      EXACTEMENT ce que rend un code inconnu : zéro ligne. Réserver un créneau
--      d'une autre organisation rend `unavailable` et RIEN d'autre. L'état
--      public d'un joueur est borné à l'organisation interrogée. La RLS ne
--      laisse lire ni à `anon`, ni au voisin, et l'email n'est lisible par
--      PERSONNE en session marchande.
--   6. LE DROIT `vitrine`. Une organisation qui ne l'a pas ne prend aucune
--      réservation, même sur un créneau parfaitement ouvert.
--   7. LA FENÊTRE DE CHECK-IN. Trois jours avant, ou trois jours après, le
--      code ne s'échange pas : `too_early` / `too_late`, et la réservation
--      n'est PAS consommée. MAIS LE CRÉNEAU NOCTURNE, LUI, S'ARRIVE : la
--      journée civile de `starts_at` se ferme avant la fin d'une séance qui
--      franchit minuit, et la seconde borne (`ends_at + 2 h`) la rattrape.
--   8. L'ADRESSE NE SURVIT PAS AU CONSENTEMENT. Sans consentement elle n'est
--      pas stockée du tout ; passé la rétention, elle, son consentement ET le
--      lien à l'appareil s'effacent — la ligne, elle, reste, et un second
--      passage ne réécrit rien. La valeur de remplacement est un MARQUEUR, pas
--      une empreinte dérivée de l'identifiant : une ligne purgée ne se rouvre
--      donc pas en recalculant sa clé depuis son `id`.
--   9. UNE SEULE SIGNATURE PAR RPC dans le catalogue. Ce fichier de migration a
--      été réécrit en place ; une base l'ayant vu en version antérieure doit
--      avoir perdu l'ancienne `reserve_slot`, celle SANS borne de locataire.
--  10. LE COMMERÇANT LIBÈRE UNE PLACE (bloc 12, migration 20261003120000).
--      `cancel_reservation_staff` rend la place à un AUTRE joueur, refuse
--      l'arrivée déjà enregistrée et le créneau commencé, exclut le caissier,
--      reste muette sur la réservation d'une organisation voisine, s'audite une
--      fois par geste réel, et prend LE MÊME verrou d'avis que `reserve_slot`.
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
--
-- ── LES CRÉNEAUX SONT DATÉS EN RELATIF, ET LES BORNES SONT CHOISIES ──
--
-- La fenêtre de check-in se ferme à la fin de la JOURNÉE CIVILE du créneau :
-- une fixture « il y a deux heures » serait `ok` à 14 h et `too_late` à 0 h 30,
-- soit un fichier qui rougit une nuit sur douze. Les fixtures hors fenêtre sont
-- donc à ±3 JOURS, où aucune heure d'exécution ne change la réponse ; celles
-- qui doivent être DANS la fenêtre et encore réservables tiennent dans
-- l'intersection étroite des deux règles — `starts_at` dans l'heure qui vient.
--
-- LE CRÉNEAU NOCTURNE (S11) EST ANCRÉ SUR MINUIT LOCAL, pas écrit en dur. Un
-- littéral « 23 h → 1 h » ne serait dans la fenêtre qu'entre minuit et 3 h du
-- matin : le fichier passerait la nuit et rougirait le jour. Ancré sur
-- `date_trunc('day', ...)` dans le fuseau de l'organisation, il porte à TOUTE
-- HEURE la seule propriété qui compte — une journée civile de `starts_at` déjà
-- close, et une fin de séance encore dans les deux heures.
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
  -- S2 : deux places, DANS L'HEURE QUI VIENT — le seul endroit où un créneau
  -- est à la fois encore réservable (`starts_at > now()`) et déjà ouvert au
  -- check-in (`now() >= starts_at - 1 h`). Sert au check-in et à la purge.
  ('4e5e0000-0000-4000-8000-000000000302',
   '4e5e0000-0000-4000-8000-000000000201',
   '4e5e0000-0000-4000-8000-00000000000a',
   now() + interval '30 minutes', now() + interval '90 minutes', 2, 'open'),
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
   now() + interval '2 days', now() + interval '2 days 1 hour', 5, 'open'),
  -- S8 : réservable, mais LOIN — trois jours, donc hors fenêtre de check-in
  -- quelle que soit l'heure d'exécution.
  ('4e5e0000-0000-4000-8000-000000000308',
   '4e5e0000-0000-4000-8000-000000000201',
   '4e5e0000-0000-4000-8000-00000000000a',
   now() + interval '3 days', now() + interval '3 days 1 hour', 5, 'open'),
  -- S9 : trois jours DERRIÈRE. Sa journée civile est close depuis deux jours
  -- pleins : `too_late` ne dépend d'aucun fuseau ni d'aucune heure.
  ('4e5e0000-0000-4000-8000-000000000309',
   '4e5e0000-0000-4000-8000-000000000201',
   '4e5e0000-0000-4000-8000-00000000000a',
   now() - interval '3 days', now() - interval '3 days' + interval '1 hour',
   5, 'closed'),
  -- S10 : QUATRE places, dans l'heure qui vient. C'est le créneau du bloc 11 :
  -- on le remplit, on fait arriver tout le monde, et on vérifie qu'il reste
  -- plein.
  ('4e5e0000-0000-4000-8000-000000000310',
   '4e5e0000-0000-4000-8000-000000000201',
   '4e5e0000-0000-4000-8000-00000000000a',
   now() + interval '45 minutes', now() + interval '105 minutes', 4, 'open'),
  -- S11 : LE CRÉNEAU NOCTURNE — celui que l'ancienne borne fermait au milieu de
  -- lui-même. Il commence UNE HEURE AVANT MINUIT LOCAL (donc « 23 h », la
  -- veille au sens civil) et se termine il y a une demi-heure : sa journée
  -- civile est close depuis minuit — l'ancienne borne rendait donc `too_late` —
  -- mais sa fin est, elle, à moins de deux heures. Voir la note sur l'ancrage en
  -- tête de fichier : ces deux propriétés tiennent à 0 h 30 comme à 14 h.
  ('4e5e0000-0000-4000-8000-000000000311',
   '4e5e0000-0000-4000-8000-000000000201',
   '4e5e0000-0000-4000-8000-00000000000a',
   (date_trunc('day', now() at time zone 'Europe/Paris')
     at time zone 'Europe/Paris') - interval '1 hour',
   now() - interval '30 minutes', 3, 'open'),
  -- S12 : UNE place, à venir. Le créneau de l'ANNULATION STAFF (bloc 12) : on
  -- le remplit, le commerçant libère la place, et un autre joueur la prend.
  ('4e5e0000-0000-4000-8000-000000000312',
   '4e5e0000-0000-4000-8000-000000000201',
   '4e5e0000-0000-4000-8000-00000000000a',
   now() + interval '2 days', now() + interval '2 days 1 hour', 1, 'open'),
  -- S13 : deux places, à venir, et AUCUN `reserve_slot` ne le touchera — sa
  -- seule réservation y est INSÉRÉE DIRECTEMENT. C'est ce qui rend l'assertion
  -- de verrou du bloc 12 discriminante : sur un créneau déjà verrouillé par
  -- `reserve_slot` dans la même transaction, le verrou serait détenu même si
  -- `cancel_reservation_staff` n'en prenait aucun.
  ('4e5e0000-0000-4000-8000-000000000313',
   '4e5e0000-0000-4000-8000-000000000201',
   '4e5e0000-0000-4000-8000-00000000000a',
   now() + interval '6 days', now() + interval '6 days 1 hour', 2, 'open');


-- ════════════════════════════════════════════════════════════
-- 1. CAPACITÉ — un créneau d'une place n'en donne qu'une
-- ════════════════════════════════════════════════════════════

create temporary table rv_r1 as
select public.reserve_slot(
  '4e5e0000-0000-4000-8000-00000000000a',
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
-- LA CLÉ PORTE L'ORGANISATION, pas le créneau seul : dans ce socle, tout ce qui
-- désigne un objet le fait sous son locataire, et l'espace de noms des verrous
-- ne fait pas exception. `cancel_reservation` construit LA MÊME — sans quoi les
-- deux RPC prendraient deux verrous distincts et cesseraient de se sérialiser.
with k as (
  select pg_catalog.hashtextextended(
    'reservation_slot:' || '4e5e0000-0000-4000-8000-00000000000a'
      || ':' || '4e5e0000-0000-4000-8000-000000000301', 0) as v
)
select ok(
  exists (
    select 1 from pg_locks l, k
     where l.locktype = 'advisory'
       and l.objsubid = 1
       and l.classid::bigint = ((k.v >> 32) & 4294967295)
       and l.objid::bigint = (k.v & 4294967295)
  ),
  'CAP-6 le verrou d''avis (organisation + créneau) est détenu par la transaction');

-- Un AUTRE joueur, même créneau : la place est prise.
select is(
  (public.reserve_slot(
    '4e5e0000-0000-4000-8000-00000000000a',
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
  '4e5e0000-0000-4000-8000-00000000000a',
  '4e5e0000-0000-4000-8000-000000000301', repeat('a', 64)) as j;

select is((select j->>'state' from rv_r2), 'already_reserved',
  'IDEM-1 le même joueur ne réserve pas deux fois');
select is((select j->>'code' from rv_r2), (select j->>'code' from rv_r1),
  'IDEM-2 il retrouve SON code, pas un nouveau');
select is((select j->>'status' from rv_r2), 'confirmed',
  'IDEM-3 et le statut de sa place, pour que l''écran sache quoi dire');
select results_eq(
  $$select count(*) from public.reservations
     where slot_id = '4e5e0000-0000-4000-8000-000000000301'$$,
  array[1::bigint],
  'IDEM-4 aucune seconde ligne n''a été créée');

-- La base le refuserait de toute façon : l'index partiel est la ceinture.
select throws_ok(
  $$insert into public.reservations (slot_id, organization_id, player_key_hash)
    values ('4e5e0000-0000-4000-8000-000000000301',
            '4e5e0000-0000-4000-8000-00000000000a', repeat('a', 64))$$,
  '23505',
  null,
  'IDEM-5 l''index partiel refuse une seconde réservation vivante du même joueur');


-- ════════════════════════════════════════════════════════════
-- 3. REFUS INDISTINCTS — passé, brouillon, activité coupée, sans droit,
--    et CRÉNEAU D'UNE AUTRE ORGANISATION
-- ════════════════════════════════════════════════════════════

select is(
  (public.reserve_slot(
    '4e5e0000-0000-4000-8000-00000000000a',
    '4e5e0000-0000-4000-8000-000000000303', repeat('c', 64)))->>'state',
  'unavailable', 'REF-1 un créneau passé ne se réserve pas');
select is(
  (public.reserve_slot(
    '4e5e0000-0000-4000-8000-00000000000a',
    '4e5e0000-0000-4000-8000-000000000304', repeat('c', 64)))->>'state',
  'unavailable', 'REF-2 un créneau en brouillon ne se réserve pas');
select is(
  (public.reserve_slot(
    '4e5e0000-0000-4000-8000-00000000000a',
    '4e5e0000-0000-4000-8000-000000000305', repeat('c', 64)))->>'state',
  'unavailable', 'REF-3 un créneau ouvert d''une activité coupée ne se réserve pas');
select is(
  (public.reserve_slot(
    '4e5e0000-0000-4000-8000-00000000000c',
    '4e5e0000-0000-4000-8000-000000000307', repeat('c', 64)))->>'state',
  'unavailable',
  'REF-4 VITRINE une organisation sans le droit ne prend aucune réservation');
select is(
  (public.reserve_slot(
    '4e5e0000-0000-4000-8000-00000000000a',
    '4e5e0000-0000-4000-8000-0000000009ff', repeat('c', 64)))->>'state',
  'unavailable',
  'REF-5 un créneau inexistant rend LE MÊME état que les quatre refus ci-dessus');

-- ── LA BORNE DE LOCATAIRE ────────────────────────────────────
-- Le créneau existe, il est ouvert, il est réservable — mais pas ici. Sans
-- `p_organization_id`, l'identifiant seul (qui circule en clair dans les URL
-- publiques) suffisait à écrire chez le voisin ET à en récupérer les horaires
-- et la capacité dans la réponse.
select is(
  (public.reserve_slot(
    '4e5e0000-0000-4000-8000-00000000000b',
    '4e5e0000-0000-4000-8000-000000000301', repeat('c', 64)))->>'state',
  'unavailable',
  'REF-6 ISOLATION un créneau d''une AUTRE organisation ne se réserve pas');
select ok(
  not ((public.reserve_slot(
    '4e5e0000-0000-4000-8000-00000000000b',
    '4e5e0000-0000-4000-8000-000000000301', repeat('c', 64)))
    ?| array['capacity', 'starts_at', 'ends_at', 'code', 'reservation_id']),
  'REF-7 et le refus ne laisse fuir AUCUN attribut du créneau visé');
select throws_ok(
  $$select public.reserve_slot(
      null, '4e5e0000-0000-4000-8000-000000000301', repeat('c', 64))$$,
  '22023', 'organization required',
  'REF-8 appeler sans organisation est un bogue d''appelant, pas un refus muet');

select is(
  (public.reserve_slot(
    '4e5e0000-0000-4000-8000-00000000000a',
    '4e5e0000-0000-4000-8000-000000000302', repeat('c', 64),
    'pas-une-adresse'))->>'state',
  'invalid_email', 'REF-9 une adresse malformée est refusée avant toute écriture');
-- 250 + 12 = 262 caractères : la FORME est valide, la LONGUEUR ne l'est pas.
select is(
  (public.reserve_slot(
    '4e5e0000-0000-4000-8000-00000000000a',
    '4e5e0000-0000-4000-8000-000000000302', repeat('c', 64),
    repeat('x', 250) || '@example.com', true))->>'state',
  'invalid_email',
  'REF-10 une adresse de plus de 254 caractères aussi — la contrainte de table '
  'n''a pas à lever une erreur que le joueur ne comprendrait pas');
select results_eq(
  $$select count(*) from public.reservations
     where organization_id = '4e5e0000-0000-4000-8000-00000000000c'$$,
  array[0::bigint],
  'REF-11 aucun de ces refus n''a laissé de ligne derrière lui');
select results_eq(
  $$select count(*) from public.reservations
     where slot_id = '4e5e0000-0000-4000-8000-000000000302'$$,
  array[0::bigint],
  'REF-12 ni sur le créneau visé par les deux adresses refusées');


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
    '4e5e0000-0000-4000-8000-00000000000a',
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
    '4e5e0000-0000-4000-8000-00000000000a',
    '4e5e0000-0000-4000-8000-000000000301', repeat('a', 64)))->>'state',
  'full', 'ANN-7 celui qui a annulé ne récupère pas une place déjà reprise');


-- ════════════════════════════════════════════════════════════
-- 5. CHECK-IN — org-scopé, autorisé, idempotent, indistinguable, BORNÉ
-- ════════════════════════════════════════════════════════════

create temporary table rv_r3 as
select public.reserve_slot(
  '4e5e0000-0000-4000-8000-00000000000a',
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
select is((select window_state from rv_k1), 'ok',
  'CHK-5 le créneau commence dans la demi-heure : on est dans la fenêtre');
select is((select activity_name from rv_k1), 'Dégustation',
  'CHK-6 le comptoir voit de quelle activité il s''agit');
select is(
  (select r.checked_in_by from public.reservations r
    where r.code = (select c from rv_code)
      and r.organization_id = '4e5e0000-0000-4000-8000-00000000000a'),
  '4e5e0000-0000-4000-8000-000000000102'::uuid,
  'CHK-7 l''auteur de la validation est enregistré');
select results_eq(
  $$select count(*) from public.audit_logs
     where organization_id = '4e5e0000-0000-4000-8000-00000000000a'
       and action = 'reservation.checkin'$$,
  array[1::bigint], 'CHK-8 l''arrivée est auditée, une fois');

-- IDEMPOTENCE : deuxième passage du même code.
create temporary table rv_k2 as
select * from public.checkin_reservation(
  '4e5e0000-0000-4000-8000-00000000000a',
  (select c from rv_code),
  '4e5e0000-0000-4000-8000-000000000102');
select is((select status from rv_k2), 'checked_in',
  'CHK-9 le second passage rend l''état, sans le refuser');
select ok(not (select checked_in_now from rv_k2),
  'CHK-10 mais il ne compte pas comme une arrivée');
select is((select checked_in_at from rv_k2), (select checked_in_at from rv_k1),
  'CHK-11 l''horodatage d''arrivée n''est pas repoussé');
select results_eq(
  $$select count(*) from public.audit_logs
     where organization_id = '4e5e0000-0000-4000-8000-00000000000a'
       and action = 'reservation.checkin'$$,
  array[1::bigint], 'CHK-12 et il n''ajoute aucune ligne d''audit');

-- L'ARRIVÉE NE S'ANNULE PLUS.
select is(
  (public.cancel_reservation(
    (select r.id from public.reservations r
      where r.code = (select c from rv_code)
        and r.organization_id = '4e5e0000-0000-4000-8000-00000000000a'),
    repeat('d', 64)))->>'state',
  'already_checked_in',
  'CHK-13 une réservation arrivée ne peut plus être annulée');

-- INDISTINGUABILITÉ. Le code d'A présenté chez B, et un code qui n'existe
-- nulle part, rendent la MÊME chose : rien.
select results_eq(
  format(
    $$select count(*)::bigint from public.checkin_reservation(
        '4e5e0000-0000-4000-8000-00000000000b', %L,
        '4e5e0000-0000-4000-8000-000000000103')$$,
    (select c from rv_code)),
  array[0::bigint],
  'CHK-14 le code d''une autre organisation ne rend aucune ligne');
select results_eq(
  $$select count(*)::bigint from public.checkin_reservation(
      '4e5e0000-0000-4000-8000-00000000000b', 'ZZZZZZZZ',
      '4e5e0000-0000-4000-8000-000000000103')$$,
  array[0::bigint],
  'CHK-15 un code inconnu rend EXACTEMENT la même chose : aucune ligne');
select results_eq(
  $$select count(*) from public.reservations
     where status = 'checked_in'
       and organization_id = '4e5e0000-0000-4000-8000-00000000000a'$$,
  array[1::bigint],
  'CHK-16 la tentative croisée n''a rien consommé');

-- Deux organisations ont le droit de porter le MÊME code court. Le code est
-- posé PAR UN `update` et non à l'insertion : le trigger écrase désormais
-- systématiquement ce que l'appelant fournit (voir CODE-1 ci-dessous).
insert into public.reservations
  (id, slot_id, organization_id, player_key_hash)
values ('4e5e0000-0000-4000-8000-000000000501',
        '4e5e0000-0000-4000-8000-000000000306',
        '4e5e0000-0000-4000-8000-00000000000b', repeat('e', 64));
update public.reservations
   set code = (select c from rv_code)
 where id = '4e5e0000-0000-4000-8000-000000000501';
select results_eq(
  format($$select count(*) from public.reservations where code = %L$$,
         (select c from rv_code)),
  array[2::bigint],
  'CHK-17 le code n''est unique QUE dans son organisation');

-- ── LE CODE NE SE CHOISIT PAS ────────────────────────────────
-- Un appelant capable d'écrire dans la table pouvait poser le code de son
-- choix — donc rendre prévisible l'identifiant qu'on présente au comptoir.
insert into public.reservations
  (id, slot_id, organization_id, player_key_hash, code)
values ('4e5e0000-0000-4000-8000-000000000502',
        '4e5e0000-0000-4000-8000-000000000306',
        '4e5e0000-0000-4000-8000-00000000000b', repeat('9', 64), 'BCDEFGHJ');
select isnt(
  (select code from public.reservations
    where id = '4e5e0000-0000-4000-8000-000000000502'),
  'BCDEFGHJ',
  'CODE-1 un code fourni à l''insertion est ÉCRASÉ, jamais retenu');
select ok(
  (select code ~ '^[A-HJ-NP-Z2-9]{8}$' from public.reservations
    where id = '4e5e0000-0000-4000-8000-000000000502'),
  'CODE-2 et remplacé par un code du serveur, à l''alphabet sans ambiguïté');

-- ── LA FENÊTRE ───────────────────────────────────────────────
-- TROP TÔT : le créneau est dans trois jours.
create temporary table rv_early as
select public.reserve_slot(
  '4e5e0000-0000-4000-8000-00000000000a',
  '4e5e0000-0000-4000-8000-000000000308', repeat('f6', 32)) as j;
create temporary table rv_ek as
select * from public.checkin_reservation(
  '4e5e0000-0000-4000-8000-00000000000a',
  (select j->>'code' from rv_early),
  '4e5e0000-0000-4000-8000-000000000102');
select is((select window_state from rv_ek), 'too_early',
  'FEN-1 un code présenté trois jours avant le créneau est hors fenêtre');
select ok(not (select checked_in_now from rv_ek),
  'FEN-2 et le geste ne compte pas');
select is((select status from rv_ek), 'confirmed',
  'FEN-3 la réservation n''est PAS consommée : le joueur peut encore venir');

-- TROP TARD : le créneau est de l'avant-veille, sa journée civile est close.
-- La ligne est posée à la main — reserve_slot refuse évidemment un créneau
-- passé, et c'est justement l'état qu'on veut examiner.
insert into public.reservations
  (id, slot_id, organization_id, player_key_hash)
values ('4e5e0000-0000-4000-8000-000000000503',
        '4e5e0000-0000-4000-8000-000000000309',
        '4e5e0000-0000-4000-8000-00000000000a', repeat('a7', 32));
create temporary table rv_lk as
select * from public.checkin_reservation(
  '4e5e0000-0000-4000-8000-00000000000a',
  (select code from public.reservations
    where id = '4e5e0000-0000-4000-8000-000000000503'),
  '4e5e0000-0000-4000-8000-000000000102');
select is((select window_state from rv_lk), 'too_late',
  'FEN-4 un code présenté trois jours après le créneau est hors fenêtre');
select ok(not (select checked_in_now from rv_lk),
  'FEN-5 et n''ouvre pas rétroactivement une présence');
select is(
  (select status from public.reservations
    where id = '4e5e0000-0000-4000-8000-000000000503'),
  'confirmed',
  'FEN-6 le no-show reste `confirmed` et non arrivé — c''est une information, '
  'pas un accident à effacer');
select results_eq(
  $$select count(*) from public.audit_logs
     where organization_id = '4e5e0000-0000-4000-8000-00000000000a'
       and action = 'reservation.checkin'$$,
  array[1::bigint],
  'FEN-7 aucun des deux refus de fenêtre n''a écrit au journal d''audit');

-- ── LE CRÉNEAU NOCTURNE S'ARRIVE, LUI ────────────────────────
-- LE DÉFAUT QUE CES QUATRE ASSERTIONS FERMENT : la fermeture de la fenêtre
-- valait « fin de la journée civile de `starts_at` », et cette borne TOMBE AU
-- MILIEU d'une séance qui franchit minuit. Une dégustation de 23 h à 1 h
-- n'acceptait donc plus personne passé 0 h — pendant la moitié de sa durée, et
-- justement aux heures où ce genre de séance se remplit. La fermeture est
-- désormais la PLUS TARDIVE des deux bornes, et `ends_at + 2 h` rattrape la
-- journée civile exactement dans ce cas-là.
--
-- La ligne est posée à la main : `reserve_slot` refuse un créneau commencé, et
-- c'est justement l'état d'après qu'on veut examiner.
insert into public.reservations
  (id, slot_id, organization_id, player_key_hash)
values ('4e5e0000-0000-4000-8000-000000000504',
        '4e5e0000-0000-4000-8000-000000000311',
        '4e5e0000-0000-4000-8000-00000000000a', repeat('b8', 32));

create temporary table rv_nuit as
select * from public.checkin_reservation(
  '4e5e0000-0000-4000-8000-00000000000a',
  (select code from public.reservations
    where id = '4e5e0000-0000-4000-8000-000000000504'),
  '4e5e0000-0000-4000-8000-000000000102');

select is((select window_state from rv_nuit), 'ok',
  'FEN-8 NOCTURNE un créneau qui franchit minuit reste dans la fenêtre après '
  'minuit — sa journée civile est close, sa séance ne l''est pas');
select ok((select checked_in_now from rv_nuit),
  'FEN-9 et l''arrivée compte réellement, ce n''est pas un simple état rendu');
select is((select status from rv_nuit), 'checked_in',
  'FEN-10 la réservation est bien consommée');
select results_eq(
  $$select count(*) from public.audit_logs
     where organization_id = '4e5e0000-0000-4000-8000-00000000000a'
       and action = 'reservation.checkin'$$,
  array[2::bigint],
  'FEN-11 le journal d''audit enregistre cette seconde arrivée, elle');

-- ── LE CRÉNEAU COMMENCÉ NE SE DÉSISTE PLUS ───────────────────
select is(
  (public.cancel_reservation(
    '4e5e0000-0000-4000-8000-000000000503', repeat('a7', 32)))->>'state',
  'too_late',
  'ANN-8 une place sur un créneau déjà commencé ne se rend plus');
select is(
  (select status from public.reservations
    where id = '4e5e0000-0000-4000-8000-000000000503'),
  'confirmed', 'ANN-9 et la ligne n''a pas bougé');

-- ── ANNULÉE, PUIS RE-ANNULÉE, SUR UN CRÉNEAU DÉJÀ COMMENCÉ ───
-- L'ORDRE DES DEUX REFUS EST LE SUJET, et il n'est pas décoratif :
-- `cancel_reservation` évalue l'idempotence AVANT `too_late`. Interverti, une
-- réservation DÉJÀ ANNULÉE dont le créneau a commencé se serait entendu
-- répondre « trop tard » — c'est-à-dire qu'elle est encore due — et le joueur
-- qui avait pourtant annulé à temps serait passé pour un no-show, dans sa propre
-- interface comme dans les statistiques du commerçant. Il ne peut jamais y avoir
-- de `too_late` sur une place déjà rendue.
--
-- La ligne est posée annulée à la main : la RPC refuserait (`too_late`) de
-- l'annuler une première fois sur un créneau commencé — c'est ANN-8 — et c'est
-- l'état d'APRÈS qu'on veut examiner.
insert into public.reservations
  (id, slot_id, organization_id, player_key_hash, status, cancelled_at)
values ('4e5e0000-0000-4000-8000-000000000505',
        '4e5e0000-0000-4000-8000-000000000303',
        '4e5e0000-0000-4000-8000-00000000000a', repeat('b9', 32),
        'cancelled', now() - interval '3 hours');

create temporary table rv_c3 as
select public.cancel_reservation(
  '4e5e0000-0000-4000-8000-000000000505', repeat('b9', 32)) as j;
select is((select j->>'state' from rv_c3), 'cancelled',
  'ANN-10 annuler une réservation DÉJÀ annulée d''un créneau commencé rend '
  'l''annulation, jamais `too_late`');

create temporary table rv_c4 as
select public.cancel_reservation(
  '4e5e0000-0000-4000-8000-000000000505', repeat('b9', 32)) as j;
select is((select j->>'state' from rv_c4), 'cancelled',
  'ANN-11 et le passage suivant non plus');
select is(
  (select r.cancelled_at from public.reservations r
    where r.id = '4e5e0000-0000-4000-8000-000000000505'),
  now() - interval '3 hours',
  'ANN-12 l''horodatage d''annulation d''origine n''est repoussé par aucun des deux');
select is(
  (select status from public.reservations
    where id = '4e5e0000-0000-4000-8000-000000000505'),
  'cancelled', 'ANN-13 et la ligne reste annulée, sans réécriture');


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
-- L'AUTRE MOITIÉ, et c'est celle que l'implication laissait passer : une
-- adresse conservée sans base légale pour la conserver.
select throws_ok(
  $$insert into public.reservations
      (slot_id, organization_id, player_key_hash, email)
    values ('4e5e0000-0000-4000-8000-000000000302',
            '4e5e0000-0000-4000-8000-00000000000a', repeat('f', 64),
            'sans-base@example.com')$$,
  '23514', null,
  'ETAT-4 une adresse sans consentement est refusée par la base, pas seulement '
  'par la discipline de reserve_slot');
select throws_ok(
  $$insert into public.reservations
      (slot_id, organization_id, player_key_hash, email,
       consent_transactional_at)
    values ('4e5e0000-0000-4000-8000-000000000302',
            '4e5e0000-0000-4000-8000-00000000000a', repeat('f', 64),
            repeat('x', 250) || '@example.com', now())$$,
  '23514', null,
  'ETAT-5 une adresse de plus de 254 caractères est refusée par la table');
-- L'empreinte n'admet que deux formes : 64 hexadécimaux, ou le marqueur de
-- purge de SA ligne. Une chaîne libre n'entre pas.
select throws_ok(
  $$insert into public.reservations
      (slot_id, organization_id, player_key_hash)
    values ('4e5e0000-0000-4000-8000-000000000302',
            '4e5e0000-0000-4000-8000-00000000000a', 'purge:pas-mon-identifiant')$$,
  '23514', null,
  'ETAT-6 le marqueur de purge d''une AUTRE ligne n''est pas une empreinte valide');
select throws_ok(
  $$insert into public.reservation_slots
      (activity_id, organization_id, starts_at, ends_at, capacity)
    values ('4e5e0000-0000-4000-8000-000000000201',
            '4e5e0000-0000-4000-8000-00000000000a',
            now() + interval '9 days', now() + interval '9 days 1 hour', 0)$$,
  '23514', null,
  'ETAT-7 un créneau de zéro place n''existe pas');
-- FK COMPOSITE : un créneau de A ne peut pas être rattaché à une activité de B.
select throws_ok(
  $$insert into public.reservation_slots
      (activity_id, organization_id, starts_at, ends_at, capacity)
    values ('4e5e0000-0000-4000-8000-000000000203',
            '4e5e0000-0000-4000-8000-00000000000a',
            now() + interval '9 days', now() + interval '9 days 1 hour', 5)$$,
  '23503', null,
  'ETAT-8 la FK composite refuse un créneau cousu sur l''activité d''un voisin');


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
-- 8. ACL — les cinq RPC sont service_role, et elles seules
-- ════════════════════════════════════════════════════════════

select ok(has_function_privilege('service_role',
  'public.reserve_slot(uuid,uuid,text,text,boolean)', 'EXECUTE'),
  'ACL-1 service_role exécute reserve_slot');
select ok(not has_function_privilege('authenticated',
  'public.reserve_slot(uuid,uuid,text,text,boolean)', 'EXECUTE'),
  'ACL-2 authenticated ne l''exécute pas');
select ok(not has_function_privilege('anon',
  'public.reserve_slot(uuid,uuid,text,text,boolean)', 'EXECUTE'),
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
-- La cinquième RPC (20261003120000) : l'annulation AU NOM DU COMMERCE. Elle
-- écrit sur des lignes qu'aucun grant ne laisse toucher — d'où le même régime
-- que les quatre autres.
select ok(has_function_privilege('service_role',
  'public.cancel_reservation_staff(uuid,uuid,text)', 'EXECUTE'),
  'ACL-9a service_role exécute cancel_reservation_staff');
select ok(not has_function_privilege('authenticated',
  'public.cancel_reservation_staff(uuid,uuid,text)', 'EXECUTE'),
  'ACL-9b cancel_reservation_staff est fermée à authenticated');
select ok(not has_function_privilege('anon',
  'public.cancel_reservation_staff(uuid,uuid,text)', 'EXECUTE'),
  'ACL-9c cancel_reservation_staff est fermée à anon');

-- Le catalogue ne prouve pas l'exécution : la garde `auth.role()` doit mordre
-- aussi. On la joue en se faisant passer pour une session marchande.
select set_config('request.jwt.claims', '{"role":"authenticated"}', true);
select throws_ok(
  $$select public.reserve_slot(
      '4e5e0000-0000-4000-8000-00000000000a',
      '4e5e0000-0000-4000-8000-000000000302', repeat('9', 64))$$,
  '42501', 'not authorized',
  'ACL-10 la garde auth.role() de reserve_slot mord, pas seulement le grant');
select throws_ok(
  $$select public.reservation_public_state(
      '4e5e0000-0000-4000-8000-00000000000a', repeat('d', 64))$$,
  '42501', 'not authorized',
  'ACL-11 idem pour l''état public');
-- Et pour l'annulation staff — la garde de rôle est tranchée AVANT la
-- vérification d'appartenance, donc une session marchande n'atteint même pas
-- `organization_members`.
select throws_ok(
  $$select public.cancel_reservation_staff(
      '4e5e0000-0000-4000-8000-00000000000a',
      '4e5e0000-0000-4000-8000-000000000999',
      '4e5e0000-0000-4000-8000-000000000101')$$,
  '42501', 'not authorized',
  'ACL-11a et pour l''annulation staff, avant toute lecture');
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
-- AUCUNE SUPPRESSION EN CASCADE NON PLUS. Supprimer une activité emporterait
-- ses créneaux, puis les réservations de ces créneaux — donc l'historique des
-- arrivées, sans audit et sans que rien n'ait compté ce qui disparaissait.
select ok(not has_table_privilege('authenticated',
  'public.reservation_activities', 'DELETE'),
  'ACL-20 une activité ne se supprime pas : `active = false` est l''interrupteur');
select ok(not has_table_privilege('authenticated',
  'public.reservation_slots', 'DELETE'),
  'ACL-21 un créneau non plus : `status = closed` ferme sans rien effacer');

-- ── UNE SEULE SIGNATURE PAR RPC ──────────────────────────────
-- La migration 20261002120000 a été RÉÉCRITE EN PLACE. Une base qui en avait
-- appliqué la version antérieure porterait encore
-- `reserve_slot(uuid, text, text, boolean)` — celle SANS borne de locataire —
-- À CÔTÉ de la nouvelle : Postgres distingue les fonctions par leurs types
-- d'arguments, un `create or replace` n'écrase pas l'autre, et un appel à
-- quatre arguments se résoudrait sur l'ancienne. Les `drop function if exists`
-- en tête de la section RPC l'en débarrassent ; ces deux assertions vérifient
-- qu'il n'en reste QU'UNE. Elles ne coûtent rien sur base fraîche — et ce sont
-- les seules qui distingueraient une base réécrite d'une base saine.
select results_eq(
  $$select count(*) from pg_catalog.pg_proc p
      join pg_catalog.pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'reserve_slot'$$,
  array[1::bigint],
  'ACL-22 le catalogue ne porte QU''UNE signature de reserve_slot');
select results_eq(
  $$select count(*) from pg_catalog.pg_proc p
      join pg_catalog.pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'checkin_reservation'$$,
  array[1::bigint],
  'ACL-23 et qu''une seule de checkin_reservation, dont le type de retour a '
  'changé — `create or replace` seul aurait fait échouer la migration');


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

-- Sept réservations chez A à ce stade : Alice (annulée) et son remplaçant sur
-- S1, Dora (arrivée) sur S2, le « trop tôt » sur S8, le « trop tard » sur S9,
-- l'arrivée NOCTURNE sur S11, et l'annulée d'un créneau commencé sur S3.
set local "request.jwt.claim.sub" = '4e5e0000-0000-4000-8000-000000000102';
select results_eq(
  $$select count(*) from public.reservations
     where organization_id = '4e5e0000-0000-4000-8000-00000000000a'$$,
  array[7::bigint],
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
-- ET IL NE SUPPRIME RIEN. Le grant `delete` a été retiré des deux tables de
-- configuration : la cascade y aurait emporté l'historique des arrivées.
select throws_ok(
  $$delete from public.reservation_activities
     where id = '4e5e0000-0000-4000-8000-000000000201'$$,
  '42501', null,
  'RLS-9 il ne supprime pas non plus une activité, ni la cascade qui suivrait');
select throws_ok(
  $$delete from public.reservation_slots
     where id = '4e5e0000-0000-4000-8000-000000000308'$$,
  '42501', null,
  'RLS-10 ni un créneau');

set local role anon;
select throws_ok(
  $$select count(*) from public.reservations$$,
  '42501', null, 'RLS-11 anon ne lit aucune réservation');
select throws_ok(
  $$select count(*) from public.reservation_slots$$,
  '42501', null, 'RLS-12 anon ne lit aucun créneau');

reset role;
select set_config('request.jwt.claim.sub', '', true);
-- La session redevient service_role : les deux blocs suivants rappellent les RPC.
select set_config('request.jwt.claims', '{"role":"service_role"}', true);


-- ════════════════════════════════════════════════════════════
-- 10. PURGE RGPD — la ligne reste, la personne s'efface
-- ════════════════════════════════════════════════════════════

-- Une réservation ANCIENNE (au-delà des 6 mois de rétention de A) et une
-- RÉCENTE, pour prouver que la purge ne mord que sur la première. Les codes ne
-- sont pas posés : le trigger les écrase de toute façon.
insert into public.reservations
  (id, slot_id, organization_id, player_key_hash, email,
   consent_transactional_at, created_at)
values
  ('4e5e0000-0000-4000-8000-000000000401',
   '4e5e0000-0000-4000-8000-000000000302',
   '4e5e0000-0000-4000-8000-00000000000a', repeat('1', 64),
   'vieille@example.com', now() - interval '10 months',
   now() - interval '10 months'),
  ('4e5e0000-0000-4000-8000-000000000402',
   '4e5e0000-0000-4000-8000-000000000302',
   '4e5e0000-0000-4000-8000-00000000000a', repeat('2', 64),
   'recente@example.com', now(), now());

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
  'purge:4e5e0000-0000-4000-8000-000000000401',
  'PURGE-4 et le lien à l''appareil est remplacé par un MARQUEUR, hors de '
  'l''espace des empreintes');
select is(
  (select email from public.reservations
    where id = '4e5e0000-0000-4000-8000-000000000402'),
  'recente@example.com',
  'PURGE-5 la réservation récente est intacte');

-- ── UNE LIGNE PURGÉE NE SE ROUVRE PAS ────────────────────────
-- La première version remplaçait l'empreinte par `sha256(id)` : dérivable par
-- quiconque connaît l'identifiant de la ligne, donc toujours un authentifiant —
-- et un authentifiant PUBLIC. Ces trois assertions échoueraient sur cette
-- version-là, et c'est exactement leur raison d'être.
select is(
  (public.cancel_reservation(
    '4e5e0000-0000-4000-8000-000000000401',
    pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(
      '4e5e0000-0000-4000-8000-000000000401', 'UTF8')), 'hex')))->>'state',
  'unknown',
  'PURGE-6 une empreinte RECALCULÉE depuis l''identifiant n''annule rien');
select is(
  (select pg_catalog.jsonb_array_length(
    (public.reservation_public_state(
      '4e5e0000-0000-4000-8000-00000000000a',
      pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(
        '4e5e0000-0000-4000-8000-000000000401', 'UTF8')), 'hex')))
    ->'reservations')),
  0,
  'PURGE-7 et ne rend aucune réservation à lire');
select throws_ok(
  $$select public.cancel_reservation(
      '4e5e0000-0000-4000-8000-000000000401',
      'purge:4e5e0000-0000-4000-8000-000000000401')$$,
  '22023', 'invalid player key',
  'PURGE-8 le marqueur lui-même ne franchit même pas la garde de forme');

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
  'PURGE-9 un second passage ne réécrit pas la ligne déjà neutralisée');


-- ════════════════════════════════════════════════════════════
-- 11. LE CHECK-IN NE LIBÈRE PAS LA PLACE
--
-- LE DÉFAUT QUE CE BLOC FERME : le comptage et l'index partiel ne regardaient
-- que `confirmed`, alors que `checkin_reservation` fait passer la ligne en
-- `checked_in`. Un créneau de quatre places dont les quatre inscrits étaient
-- arrivés retombait donc à zéro occupant AUX YEUX DE LA BASE : la cinquième
-- réservation passait, et le commerçant accueillait cinq personnes dans une
-- salle prévue pour quatre. Le même trou permettait à un joueur déjà arrivé de
-- reprendre une seconde place sur le créneau qu'il venait d'honorer.
-- ════════════════════════════════════════════════════════════

-- QUATRE INSTRUCTIONS, ET NON QUATRE COLONNES D'UN MÊME `select` : l'ordre
-- d'évaluation d'une liste de sélection n'est pas un contrat, et « la quatrième
-- demande annonce zéro place restante » n'a de sens que si elle est bien la
-- quatrième. Ce qui est ordonné ici, ce sont les instructions.
create temporary table rv_full (n int, j jsonb);
insert into rv_full values (1, public.reserve_slot(
  '4e5e0000-0000-4000-8000-00000000000a',
  '4e5e0000-0000-4000-8000-000000000310', repeat('a1', 32)));
insert into rv_full values (2, public.reserve_slot(
  '4e5e0000-0000-4000-8000-00000000000a',
  '4e5e0000-0000-4000-8000-000000000310', repeat('b2', 32)));
insert into rv_full values (3, public.reserve_slot(
  '4e5e0000-0000-4000-8000-00000000000a',
  '4e5e0000-0000-4000-8000-000000000310', repeat('c3', 32)));
insert into rv_full values (4, public.reserve_slot(
  '4e5e0000-0000-4000-8000-00000000000a',
  '4e5e0000-0000-4000-8000-000000000310', repeat('d4', 32)));

select is(
  (select pg_catalog.count(*)::int from rv_full where j->>'state' = 'reserved'),
  4, 'PLEIN-1 les quatre places du créneau sont prises');
select is((select (j->>'remaining')::int from rv_full where n = 4), 0,
  'PLEIN-2 la quatrième demande annonce zéro place restante');

-- LES QUATRE ARRIVENT. C'est ici que l'ancien comptage vidait le créneau.
create temporary table rv_kf (n int, counted boolean);
insert into rv_kf
select 1, k.checked_in_now from public.checkin_reservation(
  '4e5e0000-0000-4000-8000-00000000000a',
  (select j->>'code' from rv_full where n = 1),
  '4e5e0000-0000-4000-8000-000000000102') k;
insert into rv_kf
select 2, k.checked_in_now from public.checkin_reservation(
  '4e5e0000-0000-4000-8000-00000000000a',
  (select j->>'code' from rv_full where n = 2),
  '4e5e0000-0000-4000-8000-000000000102') k;
insert into rv_kf
select 3, k.checked_in_now from public.checkin_reservation(
  '4e5e0000-0000-4000-8000-00000000000a',
  (select j->>'code' from rv_full where n = 3),
  '4e5e0000-0000-4000-8000-000000000102') k;
insert into rv_kf
select 4, k.checked_in_now from public.checkin_reservation(
  '4e5e0000-0000-4000-8000-00000000000a',
  (select j->>'code' from rv_full where n = 4),
  '4e5e0000-0000-4000-8000-000000000102') k;

select is(
  (select pg_catalog.count(*)::int from rv_kf where counted), 4,
  'PLEIN-3 les quatre arrivées sont validées, et chacune compte pour une');
select results_eq(
  $$select count(*) from public.reservations
     where slot_id = '4e5e0000-0000-4000-8000-000000000310'
       and status = 'checked_in'$$,
  array[4::bigint],
  'PLEIN-4 le créneau porte quatre arrivées et plus aucune ligne `confirmed`');

-- LE CŒUR DU BLOC.
select is(
  (public.reserve_slot(
    '4e5e0000-0000-4000-8000-00000000000a',
    '4e5e0000-0000-4000-8000-000000000310', repeat('e5', 32)))->>'state',
  'full',
  'PLEIN-5 CAPACITÉ un créneau plein d''arrivées reste plein : la cinquième '
  'réservation est refusée');
select is(
  (public.reserve_slot(
    '4e5e0000-0000-4000-8000-00000000000a',
    '4e5e0000-0000-4000-8000-000000000310', repeat('a1', 32)))->>'state',
  'already_reserved',
  'PLEIN-6 IDEMPOTENCE le joueur déjà ARRIVÉ ne reprend pas une seconde place');
select is(
  (public.reserve_slot(
    '4e5e0000-0000-4000-8000-00000000000a',
    '4e5e0000-0000-4000-8000-000000000310', repeat('a1', 32)))->>'status',
  'checked_in',
  'PLEIN-7 et la réponse dit qu''il est arrivé, pas seulement inscrit');
select results_eq(
  $$select count(*) from public.reservations
     where slot_id = '4e5e0000-0000-4000-8000-000000000310'$$,
  array[4::bigint],
  'PLEIN-8 aucune cinquième ligne n''existe, sous aucun statut');

-- L'INDEX PARTIEL COUVRE LE MÊME ENSEMBLE que le comptage : la ceinture tient
-- même si l'on court-circuite la RPC.
select throws_ok(
  $$insert into public.reservations (slot_id, organization_id, player_key_hash)
    values ('4e5e0000-0000-4000-8000-000000000310',
            '4e5e0000-0000-4000-8000-00000000000a', repeat('a1', 32))$$,
  '23505', null,
  'PLEIN-9 l''index partiel refuse aussi une seconde ligne face à une arrivée');

-- ── L'ADRESSE N'EST PAS STOCKÉE SANS CONSENTEMENT ────────────
-- Le joueur donne son adresse mais refuse le message : rien n'est conservé.
-- Ce n'est pas la contrainte de table qui le décide — elle refuserait la ligne
-- entière — c'est reserve_slot qui jette l'adresse avant d'écrire.
create temporary table rv_nc as
select public.reserve_slot(
  '4e5e0000-0000-4000-8000-00000000000a',
  '4e5e0000-0000-4000-8000-000000000308', repeat('c9', 32),
  'refuse-le-message@example.com', false) as j;
select is((select j->>'state' from rv_nc), 'reserved',
  'CONS-1 la réservation SANS consentement passe : l''adresse est facultative');
select is(
  (select email from public.reservations
    where player_key_hash = repeat('c9', 32)),
  null,
  'CONS-2 mais l''adresse fournie n''est PAS conservée');
select is(
  (select consent_transactional_at from public.reservations
    where player_key_hash = repeat('c9', 32)),
  null, 'CONS-3 ni le moindre consentement');

-- ════════════════════════════════════════════════════════════
-- 12. ANNULATION STAFF — le commerçant libère enfin une place
--
-- CE QUE CE BLOC FERME (revue de sécurité L4, M-4a) : le socle n'ouvrait
-- AUCUN chemin d'annulation au commerce. `cancel_reservation` exige l'empreinte
-- du cookie du joueur, et `reservations` n'a aucun grant `update`. Un client qui
-- annulait par téléphone laissait donc sa place gelée jusqu'à l'heure du
-- créneau — sur un module dont le seul objet est de distribuer ces places.
--
-- La preuve centrale n'est pas « l'appel rend `cancelled` » : c'est que LA
-- PLACE EST RÉELLEMENT REPRISE ensuite par un autre joueur, sur un créneau qui
-- refusait tout le monde une assertion plus tôt.
-- ════════════════════════════════════════════════════════════

create temporary table rv_s12 as
select public.reserve_slot(
  '4e5e0000-0000-4000-8000-00000000000a',
  '4e5e0000-0000-4000-8000-000000000312', repeat('f0', 32)) as j;
select is((select j->>'state' from rv_s12), 'reserved',
  'STAFF-1 la place unique de S12 est prise');
select is(
  (public.reserve_slot(
    '4e5e0000-0000-4000-8000-00000000000a',
    '4e5e0000-0000-4000-8000-000000000312', repeat('f1', 32)))->>'state',
  'full', 'STAFF-2 le créneau est plein : le second joueur est refusé');

create temporary table rv_s12id as
select r.id as id from public.reservations r
 where r.slot_id = '4e5e0000-0000-4000-8000-000000000312';

-- ── L'ACTEUR EST VÉRIFIÉ EN SQL, comme au check-in ───────────
select throws_ok(
  format(
    $$select public.cancel_reservation_staff(
        '4e5e0000-0000-4000-8000-00000000000a', %L,
        '4e5e0000-0000-4000-8000-000000000104')$$,
    (select id from rv_s12id)),
  '42501', 'not authorized',
  'STAFF-3 un compte membre de rien ne libère aucune place');
select throws_ok(
  format(
    $$select public.cancel_reservation_staff(
        '4e5e0000-0000-4000-8000-00000000000a', %L,
        '4e5e0000-0000-4000-8000-000000000103')$$,
    (select id from rv_s12id)),
  '42501', 'not authorized',
  'STAFF-4 le propriétaire de la VOISINE non plus, même en visant la bonne '
  'organisation');
-- LE CAISSIER EST EXCLU, et c'est la seule différence de rôle avec le check-in :
-- enregistrer une arrivée CONSTATE ce qui vient de se produire ; annuler RETIRE
-- une place à quelqu'un qui n'est pas là pour le voir.
select throws_ok(
  format(
    $$select public.cancel_reservation_staff(
        '4e5e0000-0000-4000-8000-00000000000a', %L,
        '4e5e0000-0000-4000-8000-000000000102')$$,
    (select id from rv_s12id)),
  '42501', 'not authorized',
  'STAFF-5 le CAISSIER est refusé : annuler est un geste de gestion, pas de '
  'comptoir');
select throws_ok(
  format(
    $$select public.cancel_reservation_staff(
        null, %L, '4e5e0000-0000-4000-8000-000000000101')$$,
    (select id from rv_s12id)),
  '22023', 'organization required',
  'STAFF-6 l''organisation n''est pas facultative');

-- ── INDISTINGUABILITÉ : inconnu et voisin rendent LE MÊME `unknown` ──
select is(
  (public.cancel_reservation_staff(
    '4e5e0000-0000-4000-8000-00000000000a',
    '4e5e0000-0000-4000-8000-0000000009f9',
    '4e5e0000-0000-4000-8000-000000000101'))->>'state',
  'unknown', 'STAFF-7 un identifiant inconnu rend `unknown`');

create temporary table rv_sb as
select public.reserve_slot(
  '4e5e0000-0000-4000-8000-00000000000b',
  '4e5e0000-0000-4000-8000-000000000306', repeat('f2', 32)) as j;
create temporary table rv_sbid as
select r.id as id from public.reservations r
 where r.slot_id = '4e5e0000-0000-4000-8000-000000000306'
   and r.player_key_hash = repeat('f2', 32);

select is(
  (public.cancel_reservation_staff(
    '4e5e0000-0000-4000-8000-00000000000a',
    (select id from rv_sbid),
    '4e5e0000-0000-4000-8000-000000000101'))->>'state',
  'unknown',
  'STAFF-8 la réservation de la VOISINE rend EXACTEMENT la même chose : le '
  'bouton n''est pas un oracle d''existence');
select is(
  (select r.status from public.reservations r
    where r.id = (select id from rv_sbid)),
  'confirmed', 'STAFF-9 et elle est intacte chez la voisine');

-- ── UNE ARRIVÉE RESTE UNE ARRIVÉE ────────────────────────────
-- Le bloc 11 a laissé quatre arrivées sur S10 ; le commerçant ne peut en
-- effacer aucune. Son créneau est pourtant encore à venir : c'est bien le
-- statut qui refuse, pas la borne de temps.
select is(
  (public.cancel_reservation_staff(
    '4e5e0000-0000-4000-8000-00000000000a',
    (select r.id from public.reservations r
      where r.slot_id = '4e5e0000-0000-4000-8000-000000000310'
        and r.player_key_hash = repeat('a1', 32)),
    '4e5e0000-0000-4000-8000-000000000101'))->>'state',
  'already_checked_in',
  'STAFF-10 une arrivée enregistrée ne s''annule pas, même par le propriétaire');
select results_eq(
  $$select count(*) from public.reservations
     where slot_id = '4e5e0000-0000-4000-8000-000000000310'
       and status = 'checked_in'$$,
  array[4::bigint],
  'STAFF-11 et les quatre arrivées de S10 sont toujours là');

-- ── LE CRÉNEAU COMMENCÉ NE SE DÉSISTE PLUS ───────────────────
-- Insertion DIRECTE : `reserve_slot` refuserait un créneau passé, et c'est
-- justement une réservation passée qu'il faut ici. Ce que la borne protège :
-- un no-show effacé du taux de présence par le commerçant lui-même.
insert into public.reservations (slot_id, organization_id, player_key_hash)
values ('4e5e0000-0000-4000-8000-000000000303',
        '4e5e0000-0000-4000-8000-00000000000a', repeat('f4', 32));
select is(
  (public.cancel_reservation_staff(
    '4e5e0000-0000-4000-8000-00000000000a',
    (select r.id from public.reservations r
      where r.player_key_hash = repeat('f4', 32)),
    '4e5e0000-0000-4000-8000-000000000101'))->>'state',
  'too_late', 'STAFF-12 un créneau déjà commencé ne se libère plus');
select is(
  (select r.status from public.reservations r
    where r.player_key_hash = repeat('f4', 32)),
  'confirmed', 'STAFF-13 le no-show reste un no-show, il ne devient pas annulé');

-- ── LA LIBÉRATION, ET SA PREUVE ──────────────────────────────
create temporary table rv_s12c as
select public.cancel_reservation_staff(
  '4e5e0000-0000-4000-8000-00000000000a',
  (select id from rv_s12id),
  '4e5e0000-0000-4000-8000-000000000101') as j;
select is((select j->>'state' from rv_s12c), 'cancelled',
  'STAFF-14 le propriétaire annule la réservation de son client');
select is(
  (public.reserve_slot(
    '4e5e0000-0000-4000-8000-00000000000a',
    '4e5e0000-0000-4000-8000-000000000312', repeat('f1', 32)))->>'state',
  'reserved',
  'STAFF-15 LA PLACE EST RÉELLEMENT REVENUE : le joueur refusé en STAFF-2 '
  'passe, sans qu''aucun compteur n''ait été décrémenté');
select results_eq(
  $$select count(*) from public.reservations
     where slot_id = '4e5e0000-0000-4000-8000-000000000312'
       and status = 'confirmed'$$,
  array[1::bigint],
  'STAFF-16 le créneau d''une place en compte toujours exactement une');

-- ── IDEMPOTENCE ──────────────────────────────────────────────
create temporary table rv_s12c2 as
select public.cancel_reservation_staff(
  '4e5e0000-0000-4000-8000-00000000000a',
  (select id from rv_s12id),
  '4e5e0000-0000-4000-8000-000000000101') as j;
select is((select j->>'state' from rv_s12c2), 'cancelled',
  'STAFF-17 annuler deux fois rend le même état');
select is(
  (select (j->>'cancelled_at')::timestamptz from rv_s12c2),
  (select r.cancelled_at from public.reservations r
    where r.id = (select id from rv_s12id)),
  'STAFF-18 et le second appel ne repousse pas l''horodatage');

-- ── L'AUDIT — QUI a retiré sa place à un client ───────────────
-- `reservations` ne porte pas de colonne `cancelled_by` : cette ligne EST la
-- seule trace. Elle n'est écrite que sur le geste RÉEL — ni les refus
-- ci-dessus, ni la répétition, n'en produisent une seconde.
select results_eq(
  $$select count(*) from public.audit_logs
     where organization_id = '4e5e0000-0000-4000-8000-00000000000a'
       and action = 'reservation.cancel_staff'$$,
  array[1::bigint],
  'STAFF-19 exactement UNE ligne d''audit : refus et répétition n''en écrivent '
  'aucune');
select is(
  (select a.actor from public.audit_logs a
    where a.organization_id = '4e5e0000-0000-4000-8000-00000000000a'
      and a.action = 'reservation.cancel_staff'),
  '4e5e0000-0000-4000-8000-000000000101',
  'STAFF-20 elle nomme l''acteur, et c''est celui que la RPC a vérifié membre');
select is(
  (select a.metadata->>'reservation_id' from public.audit_logs a
    where a.organization_id = '4e5e0000-0000-4000-8000-00000000000a'
      and a.action = 'reservation.cancel_staff'),
  (select id::text from rv_s12id),
  'STAFF-21 et la réservation concernée');
select is(
  (select a.metadata->>'slot_id' from public.audit_logs a
    where a.organization_id = '4e5e0000-0000-4000-8000-00000000000a'
      and a.action = 'reservation.cancel_staff'),
  '4e5e0000-0000-4000-8000-000000000312',
  'STAFF-22 avec le créneau, sans quoi relire le journal demanderait une '
  'jointure sur une ligne peut-être purgée');

-- ── LE VERROU EST LE MÊME QUE CELUI DE `reserve_slot` ────────
-- S13 n'a JAMAIS été touché par `reserve_slot` : sa réservation y est insérée
-- directement. Si `cancel_reservation_staff` ne prenait pas le verrou — ou le
-- prenait sur une autre clé — l'assertion ci-dessous serait fausse. Sur S12
-- elle aurait été vraie de toute façon, `reserve_slot` l'ayant déjà verrouillé
-- dans cette même transaction.
insert into public.reservations (slot_id, organization_id, player_key_hash)
values ('4e5e0000-0000-4000-8000-000000000313',
        '4e5e0000-0000-4000-8000-00000000000a', repeat('f3', 32));
select is(
  (public.cancel_reservation_staff(
    '4e5e0000-0000-4000-8000-00000000000a',
    (select r.id from public.reservations r
      where r.player_key_hash = repeat('f3', 32)),
    '4e5e0000-0000-4000-8000-000000000101'))->>'state',
  'cancelled', 'STAFF-23 la réservation de S13 est annulée');
with k as (
  select pg_catalog.hashtextextended(
    'reservation_slot:' || '4e5e0000-0000-4000-8000-00000000000a'
      || ':' || '4e5e0000-0000-4000-8000-000000000313', 0) as v
)
select ok(
  exists (
    select 1 from pg_locks l, k
     where l.locktype = 'advisory'
       and l.objsubid = 1
       and l.classid::bigint = ((k.v >> 32) & 4294967295)
       and l.objid::bigint = (k.v & 4294967295)
  ),
  'STAFF-24 le verrou d''avis (organisation + créneau) est LE MÊME que celui '
  'de reserve_slot : les trois RPC se sérialisent réellement');
select results_eq(
  $$select count(*) from public.audit_logs
     where organization_id = '4e5e0000-0000-4000-8000-00000000000a'
       and action = 'reservation.cancel_staff'$$,
  array[2::bigint],
  'STAFF-25 chaque annulation réelle écrit UNE ligne d''audit, pas plus');

select * from finish();
rollback;
