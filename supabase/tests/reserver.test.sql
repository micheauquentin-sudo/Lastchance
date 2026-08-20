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
-- ── CE QUE LES BLOCS 13 À 23 AJOUTENT (RES-2, migration 20261004120000) ──
--
--  11. LA FILE NE S'OUVRE QUE SUR UN CRÉNEAU COMPLET (bloc 14). `not_full`
--      renvoie vers la réservation ; les six refus muets de `reserve_slot` sont
--      les mêmes ici, à la lettre ; l'adresse suit le même régime de
--      consentement ; se réinscrire rend son RANG, jamais une seconde ligne.
--  12. UNE PLACE LIBÉRÉE VA À UNE SEULE PERSONNE (blocs 15 et 16). Une
--      annulation = UNE offre, au premier de la file ; deux annulations = deux
--      offres SÉQUENTIELLES, jamais deux sur la même place ; l'invariant
--      « vivantes + tenues <= capacité » est énoncé tel quel. Les DEUX chemins
--      d'annulation — joueur et commerçant — font avancer la file, et quitter la
--      file en tenant une offre la rend immédiatement au suivant.
--  13. LA CONVERSION CONSOMME LA PLACE (bloc 15). La jauge publique voit la
--      place TENUE et rend `full` ; après conversion elle rend encore `full` ;
--      le créneau ne porte JAMAIS plus d'une réservation vivante. C'est la
--      preuve qu'aucune sur-réservation ne passe entre la file et le public.
--  14. L'EXPIRATION, DEUX FOIS PROUVÉE (bloc 17). PARESSEUSEMENT — une offre
--      échue est refusée et sa place reprenable AVANT tout balayage, donc sans
--      dépendre d'un cron — et PAR LE BALAYAGE, qui la donne au suivant sans
--      qu'aucun humain n'agisse. Le REJEU IMMÉDIAT rend trois zéros : c'est
--      « exactement une fois », et le trigger d'état terminal refuse de rouvrir
--      une entrée expirée ou convertie même par écriture directe.
--  15. L'INVITATION PRIVÉE (bloc 18). Jeton stocké HACHÉ ; le créneau FERMÉ au
--      public s'ouvre à l'invité et à lui seul ; l'idempotence précède
--      l'incrément (deux clics ne brûlent pas deux usages) ; la capacité prime
--      sur les usages restants ; RÉVOQUÉE, ÉPUISÉE, VOISINE et INCONNUE rendent
--      EXACTEMENT le même mot ; fermer les inscriptions n'annule AUCUNE place
--      confirmée ; le caissier n'en crée pas.
--  16. FERMER UN CRÉNEAU N'ANNULE RIEN (bloc 19), et l'état public du joueur
--      porte sa file avec un `offer_live` tranché par le SERVEUR (bloc 20).
--  17. LA PURGE EFFACE LA PERSONNE, PAS L'HISTOIRE DE LA PLACE (bloc 21), et
--      une entrée purgée ne se rouvre pas depuis l'ancienne clé.
--  18. ACL, RLS ET SUPERVISION (blocs 22 et 23). Les deux tables neuves sont
--      fermées à `anon` au niveau TABLE, l'adresse et l'empreinte du jeton sont
--      hors des grants de colonnes, le helper de libération n'est exécutable par
--      AUCUN rôle applicatif — service_role compris — et le balayage pg_cron
--      naît inscrit au registre ET réellement supervisé.
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
  -- SEPT jours, et non deux : `reservation_slots_activity_start_unique` porte
  -- sur (activity_id, starts_at), et S1 occupe déjà « dans deux jours » sur
  -- cette activité. Chaque créneau de cette activité a donc son heure à lui.
  ('4e5e0000-0000-4000-8000-000000000312',
   '4e5e0000-0000-4000-8000-000000000201',
   '4e5e0000-0000-4000-8000-00000000000a',
   now() + interval '7 days', now() + interval '7 days 1 hour', 1, 'open'),
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
  'public.reserve_slot(uuid,uuid,text,text,boolean,integer)', 'EXECUTE'),
  'ACL-1 service_role exécute reserve_slot');
select ok(not has_function_privilege('authenticated',
  'public.reserve_slot(uuid,uuid,text,text,boolean,integer)', 'EXECUTE'),
  'ACL-2 authenticated ne l''exécute pas');
select ok(not has_function_privilege('anon',
  'public.reserve_slot(uuid,uuid,text,text,boolean,integer)', 'EXECUTE'),
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

-- ════════════════════════════════════════════════════════════
-- 13. RES-2 — FIXTURES DE LA LISTE PRIORITAIRE ET DES INVITATIONS
--
-- CRÉÉES ICI, ET NON DANS LE BLOC DE TÊTE, POUR UNE RAISON PRÉCISE : le bloc
-- RLS compte les activités du propriétaire (`RLS-7`, deux) et les réservations
-- vues par le caissier (`RLS-4`, sept). Une activité ou une réservation de plus
-- en tête de fichier ferait rougir deux assertions qui n'ont rien à voir avec
-- RES-2 — et le lecteur chercherait la régression du mauvais côté. Tout ce que
-- ce lot ajoute vit donc APRÈS les comptages, dans son propre espace.
--
-- LES HEURES SONT ÉCARTÉES DE JOUR EN JOUR : `reservation_slots_activity_start_unique`
-- porte sur (activity_id, starts_at), et les créneaux de la tête occupent déjà
-- +2 j, +3 j, +4 j, +6 j et +7 j sur l'activité 201.
-- ════════════════════════════════════════════════════════════

-- Une SECONDE activité active chez A : elle sert à prouver qu'une invitation
-- adossée à l'activité 201 n'ouvre pas le créneau d'une autre activité.
insert into public.reservation_activities
  (id, organization_id, name, description, active)
values
  ('4e5e0000-0000-4000-8000-000000000205',
   '4e5e0000-0000-4000-8000-00000000000a', 'Atelier privé', null, true);

insert into public.reservation_slots
  (id, activity_id, organization_id, starts_at, ends_at, capacity, status,
   waitlist_offer_minutes)
values
  -- S20 : UNE place, +8 j. Le créneau de la file : on le remplit, on annule, et
  -- la place doit aller à UNE seule personne. Fenêtre d'offre par DÉFAUT (null).
  ('4e5e0000-0000-4000-8000-000000000320',
   '4e5e0000-0000-4000-8000-000000000201',
   '4e5e0000-0000-4000-8000-00000000000a',
   now() + interval '8 days', now() + interval '8 days 1 hour', 1, 'open', null),
  -- S21 : DEUX places, +9 j, fenêtre d'offre RÉGLÉE à 15 minutes — c'est ce qui
  -- prouve que la colonne sert réellement, et pas seulement qu'elle existe.
  -- C'est le créneau des deux annulations successives, puis de l'expiration.
  ('4e5e0000-0000-4000-8000-000000000321',
   '4e5e0000-0000-4000-8000-000000000201',
   '4e5e0000-0000-4000-8000-00000000000a',
   now() + interval '9 days', now() + interval '9 days 1 hour', 2, 'open', 15),
  -- S22 : deux places, +10 j, et FERMÉ. C'est le cas d'usage même de
  -- l'invitation privée : le commerçant a coupé les réservations publiques et
  -- ouvre malgré tout quelques places à des invités.
  ('4e5e0000-0000-4000-8000-000000000322',
   '4e5e0000-0000-4000-8000-000000000201',
   '4e5e0000-0000-4000-8000-00000000000a',
   now() + interval '10 days', now() + interval '10 days 1 hour', 2, 'closed', null),
  -- S23 : BROUILLON. Une invitation ne l'ouvre pas non plus : un créneau non
  -- configuré n'est pas un créneau fermé.
  ('4e5e0000-0000-4000-8000-000000000323',
   '4e5e0000-0000-4000-8000-000000000201',
   '4e5e0000-0000-4000-8000-00000000000a',
   now() + interval '11 days', now() + interval '11 days 1 hour', 1, 'draft', null),
  -- S24 : trois places, ouvert. Le créneau des invitations épuisables.
  ('4e5e0000-0000-4000-8000-000000000324',
   '4e5e0000-0000-4000-8000-000000000201',
   '4e5e0000-0000-4000-8000-00000000000a',
   now() + interval '12 days', now() + interval '12 days 1 hour', 3, 'open', null),
  -- S25 : UNE place, ouvert. On y réserve, PUIS on ferme le créneau : la
  -- réservation doit survivre intacte.
  ('4e5e0000-0000-4000-8000-000000000325',
   '4e5e0000-0000-4000-8000-000000000201',
   '4e5e0000-0000-4000-8000-00000000000a',
   now() + interval '13 days', now() + interval '13 days 1 hour', 1, 'open', null),
  -- S26 : chez A, mais sur l'AUTRE activité. La cible qui ne correspond pas.
  ('4e5e0000-0000-4000-8000-000000000326',
   '4e5e0000-0000-4000-8000-000000000205',
   '4e5e0000-0000-4000-8000-00000000000a',
   now() + interval '8 days', now() + interval '8 days 1 hour', 2, 'open', null),
  -- S27 : chez la VOISINE. Son invitation ne doit rien ouvrir chez A, et
  -- l'inverse non plus.
  ('4e5e0000-0000-4000-8000-000000000327',
   '4e5e0000-0000-4000-8000-000000000203',
   '4e5e0000-0000-4000-8000-00000000000b',
   now() + interval '9 days', now() + interval '9 days 1 hour', 2, 'open', null),
  -- S28 et S29 : UNE place chacun, dédiés à l'EXPIRATION. Deux créneaux et non
  -- un seul, parce que les deux propriétés à prouver se contredisent sur un même
  -- créneau : montrer que la place d'une offre échue est REPRENABLE la consomme,
  -- et il n'en resterait plus pour montrer que le BALAYAGE la donne au suivant.
  ('4e5e0000-0000-4000-8000-000000000328',
   '4e5e0000-0000-4000-8000-000000000201',
   '4e5e0000-0000-4000-8000-00000000000a',
   now() + interval '14 days', now() + interval '14 days 1 hour', 1, 'open', null),
  ('4e5e0000-0000-4000-8000-000000000329',
   '4e5e0000-0000-4000-8000-000000000201',
   '4e5e0000-0000-4000-8000-00000000000a',
   now() + interval '15 days', now() + interval '15 days 1 hour', 1, 'open', null);


-- ════════════════════════════════════════════════════════════
-- 14. ON N'ENTRE DANS LA FILE QUE SUR UN CRÉNEAU RÉELLEMENT COMPLET
-- ════════════════════════════════════════════════════════════

-- Le créneau a encore sa place : la file n'a pas lieu d'être.
select is(
  (public.waitlist_join(
    '4e5e0000-0000-4000-8000-00000000000a',
    '4e5e0000-0000-4000-8000-000000000320', repeat('ab', 32)))->>'state',
  'not_full',
  'LIST-1 sur un créneau qui a de la place, la file renvoie vers la réservation');

create temporary table rv2_w1 as
select public.reserve_slot(
  '4e5e0000-0000-4000-8000-00000000000a',
  '4e5e0000-0000-4000-8000-000000000320', repeat('ab', 32)
) as j;
select is((select j->>'state' from rv2_w1), 'reserved',
  'LIST-2 la place unique de S20 est prise');

create temporary table rv2_j1 as
select public.waitlist_join(
  '4e5e0000-0000-4000-8000-00000000000a',
  '4e5e0000-0000-4000-8000-000000000320', repeat('cd', 32),
  'Bob@Example.COM ', true
) as j;
select is((select j->>'state' from rv2_j1), 'waiting',
  'LIST-3 le créneau est désormais complet : l''inscription est acceptée');
select is((select (j->>'position')::int from rv2_j1), 1,
  'LIST-4 le premier inscrit est au rang 1');

-- L'ADRESSE SUIT LE MÊME RÉGIME QUE SUR UNE RÉSERVATION : normalisée, et
-- conservée seulement parce qu'elle est consentie.
select is(
  (select w.email from public.reservation_waitlist_entries w
    where w.id = (select (j->>'entry_id')::uuid from rv2_j1)),
  'bob@example.com',
  'LIST-5 l''adresse de la file est normalisée avant d''être stockée');
select ok(
  (select w.consent_transactional_at is not null
     from public.reservation_waitlist_entries w
    where w.id = (select (j->>'entry_id')::uuid from rv2_j1)),
  'LIST-6 le consentement transactionnel est daté, comme sur une réservation');

-- IDEMPOTENCE : le même joueur, la même file. Son rang, pas une erreur.
select is(
  (public.waitlist_join(
    '4e5e0000-0000-4000-8000-00000000000a',
    '4e5e0000-0000-4000-8000-000000000320', repeat('cd', 32)))->>'state',
  'already_waiting',
  'LIST-7 se réinscrire rend son rang, jamais une seconde ligne');
select results_eq(
  $$select count(*) from public.reservation_waitlist_entries
     where slot_id = '4e5e0000-0000-4000-8000-000000000320'$$,
  array[1::bigint],
  'LIST-8 et la base ne porte toujours qu''une entrée');

create temporary table rv2_j2 as
select public.waitlist_join(
  '4e5e0000-0000-4000-8000-00000000000a',
  '4e5e0000-0000-4000-8000-000000000320', repeat('ef', 32)
) as j;
select is((select (j->>'position')::int from rv2_j2), 2,
  'LIST-9 le second inscrit est au rang 2');

-- Celui qui DÉTIENT la place ne fait pas la queue pour elle.
select is(
  (public.waitlist_join(
    '4e5e0000-0000-4000-8000-00000000000a',
    '4e5e0000-0000-4000-8000-000000000320', repeat('ab', 32)))->>'state',
  'already_reserved',
  'LIST-10 le détenteur de la place ne s''inscrit pas sur sa propre file');

-- LES REFUS MUETS, exactement ceux de `reserve_slot` : la file ne devient pas
-- l'oracle que la réservation refuse d'être.
select is(
  (public.waitlist_join(
    '4e5e0000-0000-4000-8000-00000000000a',
    '4e5e0000-0000-4000-8000-000000000306', repeat('cd', 32)))->>'state',
  'unavailable',
  'LIST-11 le créneau d''une AUTRE organisation rend `unavailable`');
select is(
  (public.waitlist_join(
    '4e5e0000-0000-4000-8000-00000000000c',
    '4e5e0000-0000-4000-8000-000000000307', repeat('cd', 32)))->>'state',
  'unavailable',
  'LIST-12 une organisation sans le droit `vitrine` non plus');
select is(
  (public.waitlist_join(
    '4e5e0000-0000-4000-8000-00000000000a',
    '4e5e0000-0000-4000-8000-000000000305', repeat('cd', 32)))->>'state',
  'unavailable',
  'LIST-13 ni le créneau d''une activité coupée');
select is(
  (public.waitlist_join(
    '4e5e0000-0000-4000-8000-00000000000a',
    '4e5e0000-0000-4000-8000-000000000320', repeat('cd', 32),
    'pas-une-adresse', true))->>'state',
  'invalid_email',
  'LIST-14 la forme de l''adresse est jugée comme dans reserve_slot');


-- ════════════════════════════════════════════════════════════
-- 15. UNE PLACE LIBÉRÉE VA À UNE SEULE PERSONNE, ET LA CONVERSION LA CONSOMME
-- ════════════════════════════════════════════════════════════

select is(
  (public.cancel_reservation(
    (select (j->>'reservation_id')::uuid from rv2_w1),
    repeat('ab', 32)))->>'state',
  'cancelled',
  'LIST-15 la place de S20 est rendue');

-- LE CŒUR DU CRITÈRE D'ACCEPTATION : une place, une offre. Le second de la file
-- ne reçoit RIEN — il n'y a qu'une place à donner.
select results_eq(
  $$select count(*) from public.reservation_waitlist_entries
     where slot_id = '4e5e0000-0000-4000-8000-000000000320'
       and status = 'offered'$$,
  array[1::bigint],
  'LIST-16 UNE place libérée = UNE offre, jamais deux');
select is(
  (select w.status from public.reservation_waitlist_entries w
    where w.id = (select (j->>'entry_id')::uuid from rv2_j1)),
  'offered',
  'LIST-17 et c''est le PREMIER de la file qui la reçoit');
select is(
  (select w.status from public.reservation_waitlist_entries w
    where w.id = (select (j->>'entry_id')::uuid from rv2_j2)),
  'waiting',
  'LIST-18 le second reste en attente');

-- LA FENÊTRE PAR DÉFAUT EST DE DEUX HEURES, et elle est bornée par le créneau
-- (+8 j, donc pas de plafonnement ici).
select ok(
  (select w.offer_expires_at between now() + interval '119 minutes'
                                and now() + interval '121 minutes'
     from public.reservation_waitlist_entries w
    where w.id = (select (j->>'entry_id')::uuid from rv2_j1)),
  'LIST-19 l''offre par défaut tient deux heures');

-- LA JAUGE PUBLIQUE VOIT LA PLACE TENUE. Sans cela, un visiteur de passage
-- reprendrait la place qu'on vient de promettre, et la conversion
-- sur-réserverait le créneau.
select is(
  (public.reserve_slot(
    '4e5e0000-0000-4000-8000-00000000000a',
    '4e5e0000-0000-4000-8000-000000000320', repeat('12', 32)))->>'state',
  'full',
  'LIST-20 la jauge publique compte la place TENUE : elle rend `full`');

create temporary table rv2_c1 as
select public.claim_waitlist_offer(
  '4e5e0000-0000-4000-8000-00000000000a',
  (select (j->>'entry_id')::uuid from rv2_j1),
  repeat('cd', 32)
) as j;
select is((select j->>'state' from rv2_c1), 'claimed',
  'LIST-21 l''offre se convertit en réservation confirmée');
select ok((select (j->>'code') ~ '^[A-HJ-NP-Z2-9]{8}$' from rv2_c1),
  'LIST-22 avec un code de comptoir, comme toute réservation');
select is(
  (select w.status from public.reservation_waitlist_entries w
    where w.id = (select (j->>'entry_id')::uuid from rv2_j1)),
  'converted',
  'LIST-23 l''entrée de file passe à `converted`');
select ok(
  (select w.converted_reservation_id = (select (j->>'reservation_id')::uuid from rv2_c1)
     from public.reservation_waitlist_entries w
    where w.id = (select (j->>'entry_id')::uuid from rv2_j1)),
  'LIST-24 et pointe la réservation qu''elle a produite');

-- L'ADRESSE CONSENTIE DE LA FILE SUIT LA RÉSERVATION : la redemander serait une
-- friction, la jeter priverait le joueur de sa confirmation.
select is(
  (select r.email from public.reservations r
    where r.id = (select (j->>'reservation_id')::uuid from rv2_c1)),
  'bob@example.com',
  'LIST-25 l''adresse consentie de la file suit la réservation');

-- AUCUNE SUR-RÉSERVATION. Une place, une réservation vivante, et la jauge
-- publique le dit toujours.
select results_eq(
  $$select count(*) from public.reservations
     where slot_id = '4e5e0000-0000-4000-8000-000000000320'
       and status in ('confirmed', 'checked_in')$$,
  array[1::bigint],
  'LIST-26 la conversion a CONSOMMÉ la place, elle n''en a pas créé une seconde');
select is(
  (public.reserve_slot(
    '4e5e0000-0000-4000-8000-00000000000a',
    '4e5e0000-0000-4000-8000-000000000320', repeat('12', 32)))->>'state',
  'full',
  'LIST-27 et le créneau reste complet après la conversion');

-- IDEMPOTENCE DE LA CONVERSION : rejouée, elle rend la MÊME réservation.
select is(
  (public.claim_waitlist_offer(
    '4e5e0000-0000-4000-8000-00000000000a',
    (select (j->>'entry_id')::uuid from rv2_j1),
    repeat('cd', 32)))->>'reservation_id',
  (select j->>'reservation_id' from rv2_c1),
  'LIST-28 rejouer la conversion rend la même réservation, pas une seconde');

-- INDISTINGUABILITÉ : l'entrée d'un autre, ou d'une autre organisation.
select is(
  (public.claim_waitlist_offer(
    '4e5e0000-0000-4000-8000-00000000000a',
    (select (j->>'entry_id')::uuid from rv2_j2),
    repeat('cd', 32)))->>'state',
  'unknown',
  'LIST-29 convertir l''entrée d''un AUTRE joueur rend `unknown`');
select is(
  (public.claim_waitlist_offer(
    '4e5e0000-0000-4000-8000-00000000000b',
    (select (j->>'entry_id')::uuid from rv2_j2),
    repeat('ef', 32)))->>'state',
  'unknown',
  'LIST-30 depuis une AUTRE organisation, exactement la même réponse');


-- ════════════════════════════════════════════════════════════
-- 16. DEUX ANNULATIONS, DEUX OFFRES — SÉQUENTIELLES, JAMAIS SIMULTANÉES SUR
--     LA MÊME PLACE
--
-- L'invariant vérifié n'est pas « une seule offre par créneau » — ce serait
-- faux sur un créneau dont deux places se libèrent — mais celui qui compte :
--     réservations vivantes + offres tenues <= capacité.
-- ════════════════════════════════════════════════════════════

create temporary table rv2_s21a as
select public.reserve_slot(
  '4e5e0000-0000-4000-8000-00000000000a',
  '4e5e0000-0000-4000-8000-000000000321', repeat('34', 32)
) as j;
create temporary table rv2_s21b as
select public.reserve_slot(
  '4e5e0000-0000-4000-8000-00000000000a',
  '4e5e0000-0000-4000-8000-000000000321', repeat('56', 32)
) as j;
select is((select j->>'state' from rv2_s21b), 'reserved',
  'SEQ-1 les deux places de S21 sont prises');

create temporary table rv2_q1 as
select public.waitlist_join('4e5e0000-0000-4000-8000-00000000000a',
  '4e5e0000-0000-4000-8000-000000000321', repeat('78', 32)) as j;
create temporary table rv2_q2 as
select public.waitlist_join('4e5e0000-0000-4000-8000-00000000000a',
  '4e5e0000-0000-4000-8000-000000000321', repeat('90', 32)) as j;
create temporary table rv2_q3 as
select public.waitlist_join('4e5e0000-0000-4000-8000-00000000000a',
  '4e5e0000-0000-4000-8000-000000000321', repeat('a1', 32)) as j;
select is((select (j->>'position')::int from rv2_q3), 3,
  'SEQ-2 trois personnes attendent, aux rangs 1, 2 et 3');

-- PREMIÈRE ANNULATION — par le chemin JOUEUR.
select is(
  (public.cancel_reservation(
    (select (j->>'reservation_id')::uuid from rv2_s21a), repeat('34', 32)))->>'state',
  'cancelled',
  'SEQ-3 la première place est rendue (chemin joueur)');
select results_eq(
  $$select count(*) from public.reservation_waitlist_entries
     where slot_id = '4e5e0000-0000-4000-8000-000000000321'
       and status = 'offered'$$,
  array[1::bigint],
  'SEQ-4 UNE offre, pas trois : une place libérée ne se propose qu''une fois');
select is(
  (select w.status from public.reservation_waitlist_entries w
    where w.id = (select (j->>'entry_id')::uuid from rv2_q1)),
  'offered',
  'SEQ-5 et c''est le rang 1 qui l''a');

-- SECONDE ANNULATION — par le chemin STAFF, cette fois : les deux chemins
-- doivent faire avancer la file, sinon l'annulation par téléphone gèlerait la
-- place que le commerçant croit avoir rendue.
select is(
  (public.cancel_reservation_staff(
    '4e5e0000-0000-4000-8000-00000000000a',
    (select (j->>'reservation_id')::uuid from rv2_s21b),
    '4e5e0000-0000-4000-8000-000000000101'))->>'state',
  'cancelled',
  'SEQ-6 la seconde place est rendue (chemin commerçant)');
select is(
  (select w.status from public.reservation_waitlist_entries w
    where w.id = (select (j->>'entry_id')::uuid from rv2_q2)),
  'offered',
  'SEQ-7 le rang 2 reçoit la seconde place — séquentiellement');
select is(
  (select w.status from public.reservation_waitlist_entries w
    where w.id = (select (j->>'entry_id')::uuid from rv2_q3)),
  'waiting',
  'SEQ-8 le rang 3 attend toujours : il n''y avait que deux places');

-- L'INVARIANT, ÉNONCÉ TEL QUEL.
select ok(
  (select (select count(*) from public.reservations r
            where r.slot_id = s.id and r.status in ('confirmed', 'checked_in'))
        + (select count(*) from public.reservation_waitlist_entries w
            where w.slot_id = s.id and w.status = 'offered'
              and w.offer_expires_at > now())
        <= s.capacity
     from public.reservation_slots s
    where s.id = '4e5e0000-0000-4000-8000-000000000321'),
  'SEQ-9 réservations vivantes + offres tenues <= capacité');

-- LA FENÊTRE RÉGLÉE PAR CRÉNEAU SERT RÉELLEMENT : 15 minutes ici, pas 120.
select ok(
  (select w.offer_expires_at between now() + interval '14 minutes'
                                and now() + interval '16 minutes'
     from public.reservation_waitlist_entries w
    where w.id = (select (j->>'entry_id')::uuid from rv2_q1)),
  'SEQ-10 `waitlist_offer_minutes` du créneau borne l''offre (15 min, pas 120)');

-- LES DEUX PLACES SONT TENUES : la jauge publique refuse.
select is(
  (public.reserve_slot(
    '4e5e0000-0000-4000-8000-00000000000a',
    '4e5e0000-0000-4000-8000-000000000321', repeat('b2', 32)))->>'state',
  'full',
  'SEQ-11 les deux places tenues rendent le créneau complet pour le public');

-- QUITTER LA FILE EN TENANT UNE OFFRE LA REND IMMÉDIATEMENT AU SUIVANT.
select is(
  (public.waitlist_leave(
    (select (j->>'entry_id')::uuid from rv2_q2), repeat('90', 32)))->>'state',
  'left',
  'SEQ-12 on quitte la file volontairement');
select is(
  (select w.status from public.reservation_waitlist_entries w
    where w.id = (select (j->>'entry_id')::uuid from rv2_q3)),
  'offered',
  'SEQ-13 refuser une place la rend au suivant sans attendre son échéance');
select is(
  (public.waitlist_leave(
    (select (j->>'entry_id')::uuid from rv2_q2), repeat('90', 32)))->>'state',
  'left',
  'SEQ-14 quitter deux fois rend le même état, sans rien réécrire');
select is(
  (public.waitlist_leave(
    (select (j->>'entry_id')::uuid from rv2_q2), repeat('b2', 32)))->>'state',
  'unknown',
  'SEQ-15 l''entrée d''un autre joueur est `unknown`, jamais quittable');


-- ════════════════════════════════════════════════════════════
-- 17. L'EXPIRATION REND LA PLACE AU SUIVANT — SANS INTERVENTION, UNE SEULE FOIS
--
-- Les échéances sont ramenées dans le passé par écriture directe : c'est la
-- seule façon, dans une transaction unique, de faire vieillir une offre. Rien
-- d'autre n'est simulé — le balayage joué est la fonction réelle, et le refus
-- paresseux celui de la RPC réelle.
-- ════════════════════════════════════════════════════════════

-- ── S28 : LA PLACE D'UNE OFFRE ÉCHUE EST REPRENABLE SANS BALAYAGE ──
create temporary table rv2_e1 as
select public.reserve_slot('4e5e0000-0000-4000-8000-00000000000a',
  '4e5e0000-0000-4000-8000-000000000328', repeat('c3', 32)) as j;
create temporary table rv2_e2 as
select public.waitlist_join('4e5e0000-0000-4000-8000-00000000000a',
  '4e5e0000-0000-4000-8000-000000000328', repeat('d4', 32)) as j;
select is(
  (public.cancel_reservation(
    (select (j->>'reservation_id')::uuid from rv2_e1), repeat('c3', 32)))->>'state',
  'cancelled',
  'EXP-1 la place de S28 est rendue, donc proposée');
select is(
  (select w.status from public.reservation_waitlist_entries w
    where w.id = (select (j->>'entry_id')::uuid from rv2_e2)),
  'offered',
  'EXP-2 le seul inscrit la reçoit');

update public.reservation_waitlist_entries
   set offer_expires_at = now() - interval '1 minute'
 where id = (select (j->>'entry_id')::uuid from rv2_e2);

-- LE REFUS PARESSEUX, AVANT TOUT BALAYAGE : la garantie ne dépend pas de la
-- ponctualité d'un cron.
select is(
  (public.claim_waitlist_offer(
    '4e5e0000-0000-4000-8000-00000000000a',
    (select (j->>'entry_id')::uuid from rv2_e2), repeat('d4', 32)))->>'state',
  'expired',
  'EXP-3 une offre échue est refusée AVANT même que le balayage ne passe');
-- ET LA PLACE N'EST DÉJÀ PLUS TENUE POUR LE COMPTAGE : un balayage en retard ne
-- gèle aucune place.
select is(
  (public.reserve_slot('4e5e0000-0000-4000-8000-00000000000a',
    '4e5e0000-0000-4000-8000-000000000328', repeat('e5', 32)))->>'state',
  'reserved',
  'EXP-4 la place d''une offre échue est immédiatement reprenable par le public');

-- ── S29 : LE BALAYAGE DONNE LA PLACE AU SUIVANT, UNE SEULE FOIS ──
create temporary table rv2_f1 as
select public.reserve_slot('4e5e0000-0000-4000-8000-00000000000a',
  '4e5e0000-0000-4000-8000-000000000329', repeat('c3', 32)) as j;
create temporary table rv2_f2 as
select public.waitlist_join('4e5e0000-0000-4000-8000-00000000000a',
  '4e5e0000-0000-4000-8000-000000000329', repeat('d4', 32)) as j;
create temporary table rv2_f3 as
select public.waitlist_join('4e5e0000-0000-4000-8000-00000000000a',
  '4e5e0000-0000-4000-8000-000000000329', repeat('e5', 32)) as j;
select is(
  (public.cancel_reservation(
    (select (j->>'reservation_id')::uuid from rv2_f1), repeat('c3', 32)))->>'state',
  'cancelled',
  'EXP-5 la place de S29 est rendue au rang 1');

update public.reservation_waitlist_entries
   set offer_expires_at = now() - interval '1 minute'
 where id = (select (j->>'entry_id')::uuid from rv2_f2);

create temporary table rv2_sweep1 as
select * from public.expire_waitlist_offers();
select ok((select offers_expired >= 1 from rv2_sweep1),
  'EXP-6 le balayage marque les offres échues');
select is(
  (select w.status from public.reservation_waitlist_entries w
    where w.id = (select (j->>'entry_id')::uuid from rv2_f2)),
  'expired',
  'EXP-7 le rang 1 qui n''a pas répondu est `expired`');
select ok(
  (select w.expired_at is not null from public.reservation_waitlist_entries w
    where w.id = (select (j->>'entry_id')::uuid from rv2_f2)),
  'EXP-8 l''expiration est datée, donc auditable');
-- LE CŒUR DU CRITÈRE : SANS INTERVENTION, la place passe au suivant.
select is(
  (select w.status from public.reservation_waitlist_entries w
    where w.id = (select (j->>'entry_id')::uuid from rv2_f3)),
  'offered',
  'EXP-9 et le rang 2 la reçoit — sans qu''aucun humain n''ait agi');

-- LE REJEU NE FAIT RIEN. C'est l'assertion « exactement une fois ».
create temporary table rv2_sweep2 as
select * from public.expire_waitlist_offers();
select results_eq(
  $$select slots_processed, offers_expired, offers_created from rv2_sweep2$$,
  $$values (0, 0, 0)$$,
  'EXP-10 rejouer le balayage immédiatement ne fait RIEN : exactement une fois');
select ok(
  (select w.status = 'offered' from public.reservation_waitlist_entries w
    where w.id = (select (j->>'entry_id')::uuid from rv2_f3)),
  'EXP-11 le rejeu n''a pas repris au rang 2 la place qu''il venait de recevoir');

-- ET L'ÉTAT TERMINAL NE SE QUITTE PAS, même par une écriture directe.
select throws_ok(
  $$update public.reservation_waitlist_entries
       set status = 'waiting', expired_at = null
     where status = 'expired'
       and slot_id = '4e5e0000-0000-4000-8000-000000000329'$$,
  '23514', null,
  'EXP-12 une entrée expirée ne se rouvre pas, même par écriture directe');
select throws_ok(
  $$update public.reservation_waitlist_entries
       set status = 'cancelled', converted_at = null,
           converted_reservation_id = null, cancelled_at = now()
     where status = 'converted'
       and slot_id = '4e5e0000-0000-4000-8000-000000000320'$$,
  '23514', null,
  'EXP-13 ni une entrée convertie');


-- ════════════════════════════════════════════════════════════
-- 18. L'INVITATION PRIVÉE
-- ════════════════════════════════════════════════════════════

-- I1 : sur le créneau FERMÉ S22, trois usages. Le cas d'usage même de
-- l'invitation — ouvrir quelques places sans rouvrir les réservations.
create temporary table rv2_i1 as
select public.create_reservation_invitation(
  '4e5e0000-0000-4000-8000-00000000000a',
  '4e5e0000-0000-4000-8000-000000000101',
  'Habitués du samedi',
  repeat('1a', 32),
  null,
  '4e5e0000-0000-4000-8000-000000000322',
  3,
  null
) as j;
select is((select j->>'state' from rv2_i1), 'created',
  'INV-1 le propriétaire crée une invitation sur un créneau fermé');

-- LE JETON EST STOCKÉ HACHÉ, ET RIEN D'AUTRE N'EST STOCKÉ.
select ok(
  (select i.token_hash ~ '^[0-9a-f]{64}$'
     from public.reservation_invitations i
    where i.id = (select (j->>'invitation_id')::uuid from rv2_i1)),
  'INV-2 le jeton n''existe en base que sous forme d''empreinte');

-- LE CRÉNEAU FERMÉ S'OUVRE À L'INVITÉ, ET SEULEMENT À LUI : la réservation
-- publique sur ce même créneau reste refusée.
select is(
  (public.reserve_slot(
    '4e5e0000-0000-4000-8000-00000000000a',
    '4e5e0000-0000-4000-8000-000000000322', repeat('ab', 32)))->>'state',
  'unavailable',
  'INV-3 le public ne réserve pas sur un créneau fermé');

create temporary table rv2_r1 as
select public.redeem_invitation(
  '4e5e0000-0000-4000-8000-00000000000a',
  repeat('1a', 32),
  repeat('ab', 32)
) as j;
select is((select j->>'state' from rv2_r1), 'reserved',
  'INV-4 l''invité, lui, obtient sa place sur ce créneau fermé');
select results_eq(
  $$select used_count from public.reservation_invitations
     where token_hash = repeat('1a', 32)$$,
  array[1],
  'INV-5 un usage est consommé');

-- IDEMPOTENCE AVANT INCRÉMENT : deux clics ne brûlent pas deux places.
select is(
  (public.redeem_invitation(
    '4e5e0000-0000-4000-8000-00000000000a',
    repeat('1a', 32), repeat('ab', 32)))->>'state',
  'already_reserved',
  'INV-6 recliquer rend la même place');
select results_eq(
  $$select used_count from public.reservation_invitations
     where token_hash = repeat('1a', 32)$$,
  array[1],
  'INV-7 et ne consomme PAS un second usage');

select is(
  (public.redeem_invitation(
    '4e5e0000-0000-4000-8000-00000000000a',
    repeat('1a', 32), repeat('cd', 32)))->>'state',
  'reserved',
  'INV-8 un second invité prend la seconde place');

-- LA CAPACITÉ RESTE LA CAPACITÉ : deux places, deux invités, le troisième est
-- refusé bien que l'invitation autorise encore un usage.
select is(
  (public.redeem_invitation(
    '4e5e0000-0000-4000-8000-00000000000a',
    repeat('1a', 32), repeat('ef', 32)))->>'state',
  'full',
  'INV-9 une invitation ne sur-réserve pas : la capacité prime sur les usages');

-- ── FERMER LES INSCRIPTIONS N'ANNULE AUCUNE PLACE CONFIRMÉE ──
select is(
  (public.close_reservation_invitation(
    '4e5e0000-0000-4000-8000-00000000000a',
    (select (j->>'invitation_id')::uuid from rv2_i1),
    '4e5e0000-0000-4000-8000-000000000101'))->>'state',
  'closed',
  'INV-10 l''organisateur ferme les inscriptions');
select results_eq(
  $$select count(*) from public.reservations
     where slot_id = '4e5e0000-0000-4000-8000-000000000322'
       and status = 'confirmed'$$,
  array[2::bigint],
  'INV-11 les DEUX places déjà confirmées sont intactes — critère RES-2');
select is(
  (public.redeem_invitation(
    '4e5e0000-0000-4000-8000-00000000000a',
    repeat('1a', 32), repeat('12', 32)))->>'state',
  'unavailable',
  'INV-12 mais le lien n''ouvre plus rien');

-- ── RÉVOQUÉE, ÉPUISÉE, VOISINE, INCONNUE : LA MÊME RÉPONSE ──
select is(
  (public.revoke_reservation_invitation(
    '4e5e0000-0000-4000-8000-00000000000a',
    (select (j->>'invitation_id')::uuid from rv2_i1),
    '4e5e0000-0000-4000-8000-000000000101'))->>'state',
  'revoked',
  'INV-13 l''invitation est révocable');

-- I2 : un seul usage, sur un créneau ouvert à trois places. Elle s'épuise avant
-- que la capacité ne morde — c'est bien l'usage, et non la place, qui manque.
select is(
  (public.create_reservation_invitation(
    '4e5e0000-0000-4000-8000-00000000000a',
    '4e5e0000-0000-4000-8000-000000000101',
    'Place unique', repeat('2b', 32), null,
    '4e5e0000-0000-4000-8000-000000000324', 1, null))->>'state',
  'created',
  'INV-14 une invitation à usage unique est créée');
select is(
  (public.redeem_invitation('4e5e0000-0000-4000-8000-00000000000a',
    repeat('2b', 32), repeat('34', 32)))->>'state',
  'reserved',
  'INV-15 son unique usage est consommé');

-- I3 : chez la VOISINE, sur SON créneau.
select is(
  (public.create_reservation_invitation(
    '4e5e0000-0000-4000-8000-00000000000b',
    '4e5e0000-0000-4000-8000-000000000103',
    'Invitation voisine', repeat('3c', 32), null,
    '4e5e0000-0000-4000-8000-000000000327', 5, null))->>'state',
  'created',
  'INV-16 la voisine crée la sienne');

-- LES QUATRE REFUS SONT LE MÊME MOT. C'est l'assertion d'indistinguabilité.
select results_eq(
  $$select distinct
      (public.redeem_invitation('4e5e0000-0000-4000-8000-00000000000a',
         t, repeat('56', 32)))->>'state'
      from (values
        (repeat('1a', 32)),   -- révoquée
        (repeat('2b', 32)),   -- épuisée
        (repeat('3c', 32)),   -- celle de la VOISINE
        (repeat('4d', 32))    -- jamais émise
      ) as v(t)$$,
  array['unavailable'],
  'INV-17 révoquée, épuisée, voisine et inconnue rendent EXACTEMENT le même mot');

-- LE BROUILLON RESTE FERMÉ, LUI : un créneau non configuré n'est pas un créneau
-- fermé au public.
select is(
  (public.create_reservation_invitation(
    '4e5e0000-0000-4000-8000-00000000000a',
    '4e5e0000-0000-4000-8000-000000000101',
    'Sur brouillon', repeat('5e', 32), null,
    '4e5e0000-0000-4000-8000-000000000323', 5, null))->>'state',
  'created',
  'INV-18 rien n''interdit de créer une invitation sur un brouillon');
select is(
  (public.redeem_invitation('4e5e0000-0000-4000-8000-00000000000a',
    repeat('5e', 32), repeat('78', 32)))->>'state',
  'unavailable',
  'INV-19 mais elle n''ouvre rien tant que le créneau est en brouillon');

-- ── L'INVITATION ADOSSÉE À UNE ACTIVITÉ ──
select is(
  (public.create_reservation_invitation(
    '4e5e0000-0000-4000-8000-00000000000a',
    '4e5e0000-0000-4000-8000-000000000101',
    'Toute la dégustation', repeat('6f', 32),
    '4e5e0000-0000-4000-8000-000000000201', null, 5, null))->>'state',
  'created',
  'INV-20 une invitation peut viser une ACTIVITÉ entière');
select is(
  (public.redeem_invitation('4e5e0000-0000-4000-8000-00000000000a',
    repeat('6f', 32), repeat('90', 32),
    '4e5e0000-0000-4000-8000-000000000324'))->>'state',
  'reserved',
  'INV-21 l''invité choisit alors son créneau dans cette activité');
select is(
  (public.redeem_invitation('4e5e0000-0000-4000-8000-00000000000a',
    repeat('6f', 32), repeat('a1', 32),
    '4e5e0000-0000-4000-8000-000000000326'))->>'state',
  'unavailable',
  'INV-22 mais pas un créneau d''une AUTRE activité, même chez lui');

-- ── LES REFUS DE CRÉATION ──
select is(
  (public.create_reservation_invitation(
    '4e5e0000-0000-4000-8000-00000000000a',
    '4e5e0000-0000-4000-8000-000000000101',
    'Deux cibles', repeat('7a', 32),
    '4e5e0000-0000-4000-8000-000000000201',
    '4e5e0000-0000-4000-8000-000000000324', 5, null))->>'state',
  'invalid_target',
  'INV-23 deux cibles à la fois sont refusées');
select is(
  (public.create_reservation_invitation(
    '4e5e0000-0000-4000-8000-00000000000a',
    '4e5e0000-0000-4000-8000-000000000101',
    'Aucune cible', repeat('7a', 32), null, null, 5, null))->>'state',
  'invalid_target',
  'INV-24 aucune cible non plus');
select is(
  (public.create_reservation_invitation(
    '4e5e0000-0000-4000-8000-00000000000a',
    '4e5e0000-0000-4000-8000-000000000101',
    'Cible de la voisine', repeat('7a', 32), null,
    '4e5e0000-0000-4000-8000-000000000327', 5, null))->>'state',
  'invalid_target',
  'INV-25 ni le créneau d''une AUTRE organisation');
select is(
  (public.create_reservation_invitation(
    '4e5e0000-0000-4000-8000-00000000000a',
    '4e5e0000-0000-4000-8000-000000000101',
    'Déjà morte', repeat('7a', 32), null,
    '4e5e0000-0000-4000-8000-000000000324', 5,
    now() - interval '1 hour'))->>'state',
  'invalid_expiry',
  'INV-26 une échéance déjà passée est refusée à la création');

-- LE CAISSIER N'OUVRE PAS DE PLACES : c'est une décision commerciale.
select throws_ok(
  $$select public.create_reservation_invitation(
      '4e5e0000-0000-4000-8000-00000000000a',
      '4e5e0000-0000-4000-8000-000000000102',
      'Par le caissier', repeat('8b', 32), null,
      '4e5e0000-0000-4000-8000-000000000324', 5, null)$$,
  '42501', 'not authorized',
  'INV-27 le caissier ne crée pas d''invitation');
select throws_ok(
  $$select public.revoke_reservation_invitation(
      '4e5e0000-0000-4000-8000-00000000000a',
      '4e5e0000-0000-4000-8000-000000000999',
      '4e5e0000-0000-4000-8000-000000000104')$$,
  '42501', 'not authorized',
  'INV-28 ni un utilisateur qui n''est membre de rien');

-- INDISTINGUABILITÉ CÔTÉ GESTION AUSSI.
select is(
  (public.revoke_reservation_invitation(
    '4e5e0000-0000-4000-8000-00000000000a',
    (select i.id from public.reservation_invitations i
      where i.token_hash = repeat('3c', 32)),
    '4e5e0000-0000-4000-8000-000000000101'))->>'state',
  'unknown',
  'INV-29 révoquer l''invitation de la VOISINE rend `unknown`');

-- L'AUDIT EXISTE, ET IL NE COMPTE QUE LES GESTES RÉELS.
select ok(
  (select count(*) >= 1 from public.audit_logs
    where organization_id = '4e5e0000-0000-4000-8000-00000000000a'
      and action = 'reservation.invitation_redeem'),
  'INV-30 chaque rejointe réelle laisse une ligne d''audit');
select results_eq(
  $$select count(*) from public.audit_logs
     where organization_id = '4e5e0000-0000-4000-8000-00000000000a'
       and action = 'reservation.invitation_close'$$,
  array[1::bigint],
  'INV-31 fermer deux fois n''écrirait qu''une ligne : ici un seul geste réel');


-- ════════════════════════════════════════════════════════════
-- 19. FERMER UN CRÉNEAU N'ANNULE AUCUNE RÉSERVATION CONFIRMÉE
-- ════════════════════════════════════════════════════════════

create temporary table rv2_s25 as
select public.reserve_slot(
  '4e5e0000-0000-4000-8000-00000000000a',
  '4e5e0000-0000-4000-8000-000000000325', repeat('b2', 32)
) as j;
select is((select j->>'state' from rv2_s25), 'reserved',
  'CLOSE-1 une place est prise sur S25');

update public.reservation_slots
   set status = 'closed'
 where id = '4e5e0000-0000-4000-8000-000000000325';

select is(
  (select r.status from public.reservations r
    where r.id = (select (j->>'reservation_id')::uuid from rv2_s25)),
  'confirmed',
  'CLOSE-2 fermer le créneau ne touche PAS la réservation déjà confirmée');
select is(
  (public.reserve_slot(
    '4e5e0000-0000-4000-8000-00000000000a',
    '4e5e0000-0000-4000-8000-000000000325', repeat('cd', 32)))->>'state',
  'unavailable',
  'CLOSE-3 il ferme en revanche la porte aux suivants');

-- ET IL TARIT LES OFFRES SUIVANTES SANS REPRENDRE CELLE QUI EST EN COURS :
-- annuler sur un créneau fermé ne propose plus rien.
select is(
  (public.waitlist_join(
    '4e5e0000-0000-4000-8000-00000000000a',
    '4e5e0000-0000-4000-8000-000000000325', repeat('ef', 32)))->>'state',
  'unavailable',
  'CLOSE-4 et la file ne s''ouvre pas non plus sur un créneau fermé');


-- ════════════════════════════════════════════════════════════
-- 20. L'ÉTAT PUBLIC DU JOUEUR PORTE SA FILE
-- ════════════════════════════════════════════════════════════

-- Le rang 3 de S21 tient une offre depuis SEQ-13.
create temporary table rv2_pub as
select public.reservation_public_state(
  '4e5e0000-0000-4000-8000-00000000000a', repeat('a1', 32)
) as j;
select is((select j->>'state' from rv2_pub), 'ok',
  'PUB-1 l''état public répond');
select is(
  (select pg_catalog.jsonb_array_length(j->'waitlist') from rv2_pub),
  1,
  'PUB-2 il porte l''entrée de file vivante du joueur');
select is(
  (select j->'waitlist'->0->>'status' from rv2_pub),
  'offered',
  'PUB-3 avec son statut');
select is(
  (select (j->'waitlist'->0->>'offer_live')::boolean from rv2_pub),
  true,
  'PUB-4 et `offer_live` TRANCHÉ PAR LE SERVEUR, pas par l''horloge du client');
-- RANG 2, ET C'EST JUSTE : S21 porte DEUX entrées vivantes — le rang 1, qui
-- tient toujours son offre, et celui-ci, entré après. Le rang compte les
-- inscrits vivants qui précèdent, il ne dit pas « à qui le tour » ; c'est
-- `offer_live` qui dit à ce joueur que la place est à lui. Attendre 1 ici aurait
-- exigé que le rang se renumérote dès qu'une offre est faite — soit exactement
-- la colonne mouvante que ce module refuse d'avoir.
select is(
  (select (j->'waitlist'->0->>'position')::int from rv2_pub),
  2,
  'PUB-5 son rang est recalculé à la lecture, sur les inscrits vivants');
select ok(
  (select not ((j->'waitlist'->0) ? 'email')
          and not ((j->'waitlist'->0) ? 'player_key_hash') from rv2_pub),
  'PUB-6 ni l''adresse ni l''empreinte ne sortent de la file');

-- L'entrée CONVERTIE n'est plus dans la file : elle est devenue une réservation.
select is(
  (select pg_catalog.jsonb_array_length(
     (public.reservation_public_state(
       '4e5e0000-0000-4000-8000-00000000000a', repeat('cd', 32)))->'waitlist')),
  0,
  'PUB-7 une entrée convertie quitte la file — elle est dans les réservations');

-- BORNÉE À L'ORGANISATION, comme les réservations : la file d'un commerce
-- n'apparaît pas sur la page d'un autre.
select is(
  (select pg_catalog.jsonb_array_length(
     (public.reservation_public_state(
       '4e5e0000-0000-4000-8000-00000000000b', repeat('a1', 32)))->'waitlist')),
  0,
  'PUB-8 la file est bornée à l''organisation interrogée');


-- ════════════════════════════════════════════════════════════
-- 21. LA PURGE EFFACE LA PERSONNE, PAS L'HISTOIRE DE LA PLACE
-- ════════════════════════════════════════════════════════════

-- L'entrée convertie de S20 porte une adresse consentie. On la vieillit au-delà
-- de la rétention de l'organisation (6 mois), puis on purge.
update public.reservation_waitlist_entries
   set created_at = now() - interval '400 days'
 where id = (select (j->>'entry_id')::uuid from rv2_j1);

select lives_ok(
  $$select * from public.purge_expired_personal_data()$$,
  'PURGE-1 la purge passe sur les entrées de file');
select ok(
  (select w.email is null and w.consent_transactional_at is null
          and w.player_key_hash = 'purge:' || w.id::text
     from public.reservation_waitlist_entries w
    where w.id = (select (j->>'entry_id')::uuid from rv2_j1)),
  'PURGE-2 l''adresse, son consentement et le lien à l''appareil s''effacent');
select is(
  (select w.status from public.reservation_waitlist_entries w
    where w.id = (select (j->>'entry_id')::uuid from rv2_j1)),
  'converted',
  'PURGE-3 mais l''issue de la place reste : elle raconte le remplissage');
-- La ligne purgée n'est plus atteignable par les RPC joueur : son empreinte
-- n'est plus une empreinte.
select is(
  (public.waitlist_leave(
    (select (j->>'entry_id')::uuid from rv2_j1), repeat('cd', 32)))->>'state',
  'unknown',
  'PURGE-4 et une entrée purgée ne se rouvre pas depuis l''ancienne clé');


-- ════════════════════════════════════════════════════════════
-- 22. ACL ET RLS DES DEUX TABLES NEUVES
-- ════════════════════════════════════════════════════════════

select ok(has_function_privilege('service_role',
  'public.waitlist_join(uuid,uuid,text,text,boolean)', 'EXECUTE'),
  'ACL2-1 service_role exécute waitlist_join');
select ok(not has_function_privilege('authenticated',
  'public.waitlist_join(uuid,uuid,text,text,boolean)', 'EXECUTE'),
  'ACL2-2 authenticated ne l''exécute pas');
select ok(not has_function_privilege('anon',
  'public.waitlist_join(uuid,uuid,text,text,boolean)', 'EXECUTE'),
  'ACL2-3 anon non plus');
select ok(not has_function_privilege('authenticated',
  'public.claim_waitlist_offer(uuid,uuid,text)', 'EXECUTE'),
  'ACL2-4 claim_waitlist_offer est fermée à authenticated');
select ok(not has_function_privilege('anon',
  'public.claim_waitlist_offer(uuid,uuid,text)', 'EXECUTE'),
  'ACL2-5 et à anon');
select ok(not has_function_privilege('authenticated',
  'public.waitlist_leave(uuid,text)', 'EXECUTE'),
  'ACL2-6 waitlist_leave est fermée à authenticated');
select ok(not has_function_privilege('authenticated',
  'public.redeem_invitation(uuid,text,text,uuid,text,boolean)', 'EXECUTE'),
  'ACL2-7 redeem_invitation est fermée à authenticated');
select ok(not has_function_privilege('anon',
  'public.redeem_invitation(uuid,text,text,uuid,text,boolean)', 'EXECUTE'),
  'ACL2-8 et à anon');
select ok(not has_function_privilege('authenticated',
  'public.create_reservation_invitation(uuid,text,text,text,uuid,uuid,integer,timestamptz)',
  'EXECUTE'),
  'ACL2-9 create_reservation_invitation est fermée à authenticated');
select ok(not has_function_privilege('authenticated',
  'public.expire_waitlist_offers()', 'EXECUTE'),
  'ACL2-10 le balayage est fermé à authenticated');
select ok(not has_function_privilege('anon',
  'public.expire_waitlist_offers()', 'EXECUTE'),
  'ACL2-11 et à anon');

-- LE HELPER INTERNE N'EST GRANTÉ À PERSONNE — pas même à service_role. C'est
-- l'ACL, et non un contrôle interne, qui empêche de faire avancer une file sans
-- détenir le verrou du créneau.
select ok(not has_function_privilege('service_role',
  'public.reservation_offer_next(uuid,uuid)', 'EXECUTE'),
  'ACL2-12 reservation_offer_next n''est exécutable par AUCUN rôle applicatif');
select ok(not has_function_privilege('authenticated',
  'public.reservation_offer_next(uuid,uuid)', 'EXECUTE'),
  'ACL2-13 ni par une session marchande');
select ok(not has_function_privilege('anon',
  'public.reservation_offer_next(uuid,uuid)', 'EXECUTE'),
  'ACL2-14 ni par anon');

-- La garde `auth.role()` mord aussi, pas seulement le grant.
select set_config('request.jwt.claims', '{"role":"authenticated"}', true);
select throws_ok(
  $$select public.waitlist_join(
      '4e5e0000-0000-4000-8000-00000000000a',
      '4e5e0000-0000-4000-8000-000000000320', repeat('ab', 32))$$,
  '42501', 'not authorized',
  'ACL2-15 la garde auth.role() de waitlist_join mord');
select throws_ok(
  $$select public.redeem_invitation(
      '4e5e0000-0000-4000-8000-00000000000a',
      repeat('1a', 32), repeat('ab', 32))$$,
  '42501', 'not authorized',
  'ACL2-16 et celle de redeem_invitation, avant toute lecture de jeton');
select set_config('request.jwt.claims', '{"role":"service_role"}', true);

-- Les deux tables ferment `anon` au niveau TABLE, pas seulement par RLS.
select ok(not has_table_privilege('anon',
  'public.reservation_waitlist_entries', 'SELECT'),
  'ACL2-17 anon n''a aucun privilège de table sur la liste prioritaire');
select ok(not has_table_privilege('anon',
  'public.reservation_invitations', 'SELECT'),
  'ACL2-18 ni sur les invitations');
-- AUCUNE ÉCRITURE DIRECTE : l'ordre de la file et le compteur d'usages sont
-- serveur-autoritaires.
select ok(not has_table_privilege('authenticated',
  'public.reservation_waitlist_entries', 'INSERT'),
  'ACL2-19 le commerçant ne se place pas dans une file');
select ok(not has_table_privilege('authenticated',
  'public.reservation_waitlist_entries', 'UPDATE'),
  'ACL2-20 ni ne réordonne une file par écriture directe');
select ok(not has_table_privilege('authenticated',
  'public.reservation_waitlist_entries', 'DELETE'),
  'ACL2-21 ni n''en efface une entrée');
select ok(not has_table_privilege('authenticated',
  'public.reservation_invitations', 'INSERT'),
  'ACL2-22 aucune invitation forgée directement');
select ok(not has_table_privilege('authenticated',
  'public.reservation_invitations', 'UPDATE'),
  'ACL2-23 ni de compteur d''usages remis à zéro à la main');
select ok(not has_table_privilege('authenticated',
  'public.reservation_invitations', 'DELETE'),
  'ACL2-24 ni d''invitation effacée avec sa trace');
-- L'ADRESSE et L'EMPREINTE DU JETON sont hors des grants de colonnes.
select ok(not has_column_privilege('authenticated',
  'public.reservation_waitlist_entries', 'email', 'SELECT'),
  'ACL2-25 le commerçant ne lit pas l''adresse d''une entrée de file');
select ok(has_column_privilege('authenticated',
  'public.reservation_waitlist_entries', 'status', 'SELECT'),
  'ACL2-26 il lit en revanche le statut : c''est son écran');
select ok(not has_column_privilege('authenticated',
  'public.reservation_invitations', 'token_hash', 'SELECT'),
  'ACL2-27 l''empreinte du jeton ne sort d''aucun écran marchand');
select ok(has_column_privilege('authenticated',
  'public.reservation_invitations', 'used_count', 'SELECT'),
  'ACL2-28 il voit en revanche combien de places ont été prises');

-- ── RLS : le voisin ne voit rien, le caissier voit la file ───
select set_config('request.jwt.claims', '', true);
set local role authenticated;

set local "request.jwt.claim.sub" = '4e5e0000-0000-4000-8000-000000000103';
select results_eq(
  $$select count(*) from public.reservation_waitlist_entries
     where organization_id = '4e5e0000-0000-4000-8000-00000000000a'$$,
  array[0::bigint],
  'RLS2-1 le propriétaire voisin ne voit aucune entrée de file de A');
select results_eq(
  $$select count(*) from public.reservation_invitations
     where organization_id = '4e5e0000-0000-4000-8000-00000000000a'$$,
  array[0::bigint],
  'RLS2-2 ni aucune de ses invitations');

set local "request.jwt.claim.sub" = '4e5e0000-0000-4000-8000-000000000102';
select ok(
  (select count(*) > 0 from public.reservation_waitlist_entries
    where organization_id = '4e5e0000-0000-4000-8000-00000000000a'),
  'RLS2-3 le CAISSIER voit la file de son organisation (écran de comptoir)');
select results_eq(
  $$select count(*) from public.reservation_invitations
     where organization_id = '4e5e0000-0000-4000-8000-00000000000a'$$,
  array[0::bigint],
  'RLS2-4 mais pas les invitations, réservées aux éditeurs');
select throws_ok(
  $$select email from public.reservation_waitlist_entries
     where organization_id = '4e5e0000-0000-4000-8000-00000000000a'$$,
  '42501', null,
  'RLS2-5 et il ne lit l''adresse d''aucune entrée');

set local "request.jwt.claim.sub" = '4e5e0000-0000-4000-8000-000000000101';
select ok(
  (select count(*) > 0 from public.reservation_invitations
    where organization_id = '4e5e0000-0000-4000-8000-00000000000a'),
  'RLS2-6 le propriétaire lit ses invitations');
select throws_ok(
  $$select token_hash from public.reservation_invitations
     where organization_id = '4e5e0000-0000-4000-8000-00000000000a'$$,
  '42501', null,
  'RLS2-7 mais jamais l''empreinte de leurs jetons');
select throws_ok(
  $$update public.reservation_invitations set used_count = 0
     where organization_id = '4e5e0000-0000-4000-8000-00000000000a'$$,
  '42501', null,
  'RLS2-8 ni ne remet un compteur d''usages à zéro');

set local role anon;
select throws_ok(
  $$select count(*) from public.reservation_waitlist_entries$$,
  '42501', null, 'RLS2-9 anon ne lit aucune entrée de file');
select throws_ok(
  $$select count(*) from public.reservation_invitations$$,
  '42501', null, 'RLS2-10 ni aucune invitation');

reset role;
select set_config('request.jwt.claim.sub', '', true);
select set_config('request.jwt.claims', '{"role":"service_role"}', true);


-- ════════════════════════════════════════════════════════════
-- 23. LE BALAYAGE EST SUPERVISÉ — le défaut relevé au wagon 7 ne se répète pas
-- ════════════════════════════════════════════════════════════

-- `enabled = false` À L'INSCRIPTION, et c'est le RÉGLAGE ATTENDU, pas un
-- oubli : brancher la supervision est un UPDATE d'exploitation, jamais une
-- migration (`ops_worker_definitions` le dit, `ops_monitoring.test.sql` le
-- garde). Ce que ce lot devait fournir, et qui manquait au pg_cron de
-- `jackpot-draws`, c'est le BATTEMENT DE CŒUR — OPS-2 et OPS-3 ci-dessous.
select results_eq(
  $$select enabled, expected_period_seconds from public.ops_worker_definitions
     where worker = 'reservation-waitlist'$$,
  $$values (false, 300)$$,
  'OPS-1 le balayage est inscrit AU REGISTRE, prêt à être supervisé par un UPDATE');
select ok(
  (select count(*) >= 2 from public.ops_worker_runs
    where worker = 'reservation-waitlist'),
  'OPS-2 chacun de ses passages a écrit son battement de cœur');
select results_eq(
  $$select count(*) from public.ops_worker_runs
     where worker = 'reservation-waitlist' and status <> 'succeeded'$$,
  array[0::bigint],
  'OPS-3 et les deux passages de ce fichier se sont clos en succès');
select ok(
  (select count(*) = 1 from cron.job
    where jobname = 'lastchance-reservation-waitlist-expire'),
  'OPS-4 la planification pg_cron existe, et une seule fois');


-- ════════════════════════════════════════════════════════════
-- 24. FIXTURES DE LA REVUE DE SÉCURITÉ L5 (E-1a, E-1b, M-1, I-4)
--
-- APRÈS le bloc 23, et pas avant : `OPS-2` et `OPS-3` comptent les passages du
-- balayage, et le bloc 24 en déclenche un de plus pour prouver qu'une
-- EXPIRATION libère une place DE FILE. Placées plus haut, ces fixtures auraient
-- fait rougir deux assertions de supervision qui n'ont rien à voir avec la
-- revue — exactement le motif qui avait déjà fait descendre les fixtures RES-2
-- sous les comptages RLS (bloc 13).
--
-- Les heures reprennent à +16 j : l'activité 201 occupe déjà tout jusqu'à
-- +15 j, et `reservation_slots_activity_start_unique` porte sur
-- (activity_id, starts_at).
-- ════════════════════════════════════════════════════════════

insert into public.reservation_slots
  (id, activity_id, organization_id, starts_at, ends_at, capacity, status,
   waitlist_offer_minutes)
values
  -- S30 : UNE place. Le créneau du PLAFOND DE FILE : capacité 1 →
  -- `least(greatest(2 × 1, 4), 50)` = 4, c'est la branche PLANCHER.
  ('4e5e0000-0000-4000-8000-000000000330',
   '4e5e0000-0000-4000-8000-000000000201',
   '4e5e0000-0000-4000-8000-00000000000a',
   now() + interval '16 days', now() + interval '16 days 1 hour', 1, 'open', null),
  -- S31 : UNE place. Le créneau de l'ÉVICTION.
  ('4e5e0000-0000-4000-8000-000000000331',
   '4e5e0000-0000-4000-8000-000000000201',
   '4e5e0000-0000-4000-8000-00000000000a',
   now() + interval '17 days', now() + interval '17 days 1 hour', 1, 'open', null),
  -- S32 : UNE place. On y fabrique une offre VIVANTE, PUIS on remet le créneau
  -- en BROUILLON — le seul moyen d'obtenir l'état que M-1 doit refuser, puisque
  -- `reservation_offer_next` n'émet jamais d'offre sur un créneau non ouvert.
  ('4e5e0000-0000-4000-8000-000000000332',
   '4e5e0000-0000-4000-8000-000000000201',
   '4e5e0000-0000-4000-8000-00000000000a',
   now() + interval '18 days', now() + interval '18 days 1 hour', 1, 'open', null),
  -- S33 : le SYMÉTRIQUE de S32 — même montage, mais `closed`. Sans lui, M-1
  -- passerait tout aussi bien avec une garde qui refuserait TOUT créneau non
  -- ouvert, et la propriété qu'on veut (« fermé au public reste honoré ») ne
  -- serait prouvée nulle part.
  ('4e5e0000-0000-4000-8000-000000000333',
   '4e5e0000-0000-4000-8000-000000000201',
   '4e5e0000-0000-4000-8000-00000000000a',
   now() + interval '19 days', now() + interval '19 days 1 hour', 1, 'open', null),
  -- S34 : UNE place. Le créneau de l'entrée PURGÉE qui ne doit plus rien
  -- recevoir (I-4).
  ('4e5e0000-0000-4000-8000-000000000334',
   '4e5e0000-0000-4000-8000-000000000201',
   '4e5e0000-0000-4000-8000-00000000000a',
   now() + interval '20 days', now() + interval '20 days 1 hour', 1, 'open', null),
  -- S35 : TROIS places → plafond `least(greatest(6, 4), 50)` = 6. C'est la
  -- branche PROPORTIONNELLE, et le seul créneau qui distingue la formule d'une
  -- constante 4.
  ('4e5e0000-0000-4000-8000-000000000335',
   '4e5e0000-0000-4000-8000-000000000201',
   '4e5e0000-0000-4000-8000-00000000000a',
   now() + interval '21 days', now() + interval '21 days 1 hour', 3, 'open', null);


-- ════════════════════════════════════════════════════════════
-- 25. LA FILE A UN PLAFOND (revue de sécurité L5, E-1a)
--
-- CE QUE CE BLOC FERME : la seule borne à `reservation_waitlist_entries` était
-- l'unicité (créneau, empreinte) sur les états vivants — c'est-à-dire UNE LIGNE
-- PAR COOKIE, et un cookie se renouvelle à volonté. Un créneau complet pouvait
-- accumuler une file sans fin, chaque entrée portant en prime une adresse et un
-- consentement : stockage de données personnelles non borné, et un rang annoncé
-- au centième inscrit qui ne veut plus rien dire pour personne.
--
-- LA PREUVE N'EST PAS SEULEMENT « le cinquième est refusé » : c'est que le
-- plafond SE REARME (il n'est pas un compteur qui se vide) et surtout qu'une
-- place de FILE se libère — par un départ ET par une expiration. Un plafond qui
-- ne se rouvrirait jamais aurait condamné le créneau à sa première file.
-- ════════════════════════════════════════════════════════════

create temporary table rv3_s30r as
select public.reserve_slot(
  '4e5e0000-0000-4000-8000-00000000000a',
  '4e5e0000-0000-4000-8000-000000000330', repeat('1a', 32)) as j;
select is((select j->>'state' from rv3_s30r), 'reserved',
  'CAP-F1 la place unique de S30 est prise : le créneau est complet');

create temporary table rv3_file (n int, j jsonb);
insert into rv3_file values (1, public.waitlist_join(
  '4e5e0000-0000-4000-8000-00000000000a',
  '4e5e0000-0000-4000-8000-000000000330', repeat('1b', 32)));
insert into rv3_file values (2, public.waitlist_join(
  '4e5e0000-0000-4000-8000-00000000000a',
  '4e5e0000-0000-4000-8000-000000000330', repeat('1c', 32)));
insert into rv3_file values (3, public.waitlist_join(
  '4e5e0000-0000-4000-8000-00000000000a',
  '4e5e0000-0000-4000-8000-000000000330', repeat('1d', 32)));
insert into rv3_file values (4, public.waitlist_join(
  '4e5e0000-0000-4000-8000-00000000000a',
  '4e5e0000-0000-4000-8000-000000000330', repeat('1e', 32)));

select is(
  (select pg_catalog.count(*)::int from rv3_file where j->>'state' = 'waiting'),
  4, 'CAP-F2 les quatre premiers entrent dans la file');

-- LE CINQUIÈME EST REFUSÉ, et par un état À LUI. `unavailable` aurait été le
-- réflexe — c'est le mot muet de tout ce module — et il aurait été FAUX ici :
-- ce refus ne révèle rien qu'un visiteur ne voie déjà (le créneau est complet,
-- sa capacité est affichée), et l'écran doit pouvoir dire « la liste est
-- pleine, revenez plus tard » plutôt que « indisponible », qui n'est pas
-- actionnable.
create temporary table rv3_plein as
select public.waitlist_join(
  '4e5e0000-0000-4000-8000-00000000000a',
  '4e5e0000-0000-4000-8000-000000000330', repeat('1f', 32)) as j;
select is((select j->>'state' from rv3_plein), 'waitlist_full',
  'CAP-F3 le cinquième est refusé, et le refus porte son propre nom');
select is((select (j->>'capacity')::int from rv3_plein), 4,
  'CAP-F4 le plafond annoncé est celui du PLANCHER : 2 × 1 place, relevé à 4');
select results_eq(
  $$select count(*) from public.reservation_waitlist_entries
     where slot_id = '4e5e0000-0000-4000-8000-000000000330'$$,
  array[4::bigint],
  'CAP-F5 et AUCUNE cinquième ligne n''est écrite, sous aucun statut');

-- ── UN DÉPART LIBÈRE UNE PLACE DE FILE ──────────────────────
select is(
  (public.waitlist_leave(
    (select (j->>'entry_id')::uuid from rv3_file where n = 1),
    repeat('1b', 32)))->>'state',
  'left',
  'CAP-F6 le premier de la file s''en va');
select is(
  (public.waitlist_join(
    '4e5e0000-0000-4000-8000-00000000000a',
    '4e5e0000-0000-4000-8000-000000000330', repeat('1f', 32)))->>'state',
  'waiting',
  'CAP-F7 sa place DE FILE est reprise : le refusé de CAP-F3 entre');
select is(
  (public.waitlist_join(
    '4e5e0000-0000-4000-8000-00000000000a',
    '4e5e0000-0000-4000-8000-000000000330', repeat('2a', 32)))->>'state',
  'waitlist_full',
  'CAP-F8 et le plafond SE REARME aussitôt — ce n''est pas un quota qui se vide');

-- ── UNE OFFRE TENUE COMPTE DANS LE PLAFOND ──────────────────
-- La place réelle repart au premier de la file : l'entrée passe `waiting` →
-- `offered`, et le nombre d'entrées VIVANTES ne bouge pas.
select is(
  (public.cancel_reservation(
    (select (j->>'reservation_id')::uuid from rv3_s30r),
    repeat('1a', 32)))->>'state',
  'cancelled',
  'CAP-F9 le titulaire se désiste : la place part au premier de la file');
select is(
  (public.waitlist_join(
    '4e5e0000-0000-4000-8000-00000000000a',
    '4e5e0000-0000-4000-8000-000000000330', repeat('2a', 32)))->>'state',
  'waitlist_full',
  'CAP-F10 la file reste pleine : une offre TENUE occupe toujours sa ligne');

-- ── UNE EXPIRATION LIBÈRE UNE PLACE DE FILE ─────────────────
-- L'échéance est reculée dans le passé, puis le balayage passe : l'entrée
-- devient `expired` — état TERMINAL, donc plus vivante — et la place réelle
-- repart au suivant. Le compte des vivantes descend de 4 à 3.
update public.reservation_waitlist_entries
   set offer_expires_at = now() - interval '1 minute'
 where slot_id = '4e5e0000-0000-4000-8000-000000000330'
   and status = 'offered';

select ok(
  (select slots_processed >= 1 from public.expire_waitlist_offers()),
  'CAP-F11 le balayage ramasse l''offre échue de S30');
select is(
  (public.waitlist_join(
    '4e5e0000-0000-4000-8000-00000000000a',
    '4e5e0000-0000-4000-8000-000000000330', repeat('2a', 32)))->>'state',
  'waiting',
  'CAP-F12 l''expiration a libéré une place DE FILE, sans intervention');

-- ── LA BRANCHE PROPORTIONNELLE : le plafond n'est pas la constante 4 ──
insert into rv3_file values (10, public.reserve_slot(
  '4e5e0000-0000-4000-8000-00000000000a',
  '4e5e0000-0000-4000-8000-000000000335', repeat('2b', 32)));
insert into rv3_file values (11, public.reserve_slot(
  '4e5e0000-0000-4000-8000-00000000000a',
  '4e5e0000-0000-4000-8000-000000000335', repeat('2c', 32)));
insert into rv3_file values (12, public.reserve_slot(
  '4e5e0000-0000-4000-8000-00000000000a',
  '4e5e0000-0000-4000-8000-000000000335', repeat('2d', 32)));
select is(
  (select pg_catalog.count(*)::int from rv3_file
    where n between 10 and 12 and j->>'state' = 'reserved'),
  3, 'CAP-F13 les trois places de S35 sont prises');

insert into rv3_file values (20, public.waitlist_join(
  '4e5e0000-0000-4000-8000-00000000000a',
  '4e5e0000-0000-4000-8000-000000000335', repeat('2e', 32)));
insert into rv3_file values (21, public.waitlist_join(
  '4e5e0000-0000-4000-8000-00000000000a',
  '4e5e0000-0000-4000-8000-000000000335', repeat('2f', 32)));
insert into rv3_file values (22, public.waitlist_join(
  '4e5e0000-0000-4000-8000-00000000000a',
  '4e5e0000-0000-4000-8000-000000000335', repeat('3a', 32)));
insert into rv3_file values (23, public.waitlist_join(
  '4e5e0000-0000-4000-8000-00000000000a',
  '4e5e0000-0000-4000-8000-000000000335', repeat('3b', 32)));
insert into rv3_file values (24, public.waitlist_join(
  '4e5e0000-0000-4000-8000-00000000000a',
  '4e5e0000-0000-4000-8000-000000000335', repeat('3c', 32)));

-- LE CINQUIÈME PASSE ICI, ALORS QU'IL ÉTAIT REFUSÉ SUR S30. C'est l'assertion
-- qui distingue `greatest(2 × capacité, 4)` d'un plafond fixe : sur trois
-- places, la file en accepte six.
select is((select j->>'state' from rv3_file where n = 24), 'waiting',
  'CAP-F14 sur un créneau de 3 places, le 5e inscrit passe : le plafond SUIT la '
  'capacité et n''est pas la constante 4');


-- ════════════════════════════════════════════════════════════
-- 26. LE COMMERÇANT RETIRE QUELQU'UN DE LA FILE (E-1b)
--
-- CE QUE CE BLOC FERME : aucun geste ne permettait de retirer une personne de
-- la liste. Le fichier de migration l'assumait — « une offre meurt d'elle-même
-- en deux heures » — ce qui décrit l'extinction NATURELLE d'une file et non le
-- retrait de QUELQU'UN : un doublon manifeste, une inscription abusive, un
-- désistement téléphonique de la part de qui a perdu son lien.
--
-- LA PREUVE CENTRALE N'EST PAS « l'appel rend `evicted` ». C'est que la place
-- TENUE par l'évincé REPART AU SUIVANT, et exactement UNE FOIS — sans quoi elle
-- serait restée comptée nulle part : ni réservée, ni tenue, ni proposée, et le
-- balayage (qui ne regarde que les offres ÉCHUES) ne serait jamais revenu la
-- chercher.
-- ════════════════════════════════════════════════════════════

create temporary table rv3_s31r as
select public.reserve_slot(
  '4e5e0000-0000-4000-8000-00000000000a',
  '4e5e0000-0000-4000-8000-000000000331', repeat('3d', 32)) as j;
create temporary table rv3_evi (n int, j jsonb);
insert into rv3_evi values (1, public.waitlist_join(
  '4e5e0000-0000-4000-8000-00000000000a',
  '4e5e0000-0000-4000-8000-000000000331', repeat('3e', 32)));
insert into rv3_evi values (2, public.waitlist_join(
  '4e5e0000-0000-4000-8000-00000000000a',
  '4e5e0000-0000-4000-8000-000000000331', repeat('3f', 32)));
select is(
  (public.cancel_reservation(
    (select (j->>'reservation_id')::uuid from rv3_s31r),
    repeat('3d', 32)))->>'state',
  'cancelled',
  'EVI-1 la place se libère et part au premier de la file');
select is(
  (select w.status from public.reservation_waitlist_entries w
    where w.id = (select (j->>'entry_id')::uuid from rv3_evi where n = 1)),
  'offered',
  'EVI-2 le premier TIENT la place');

-- ── LES REFUS D'AUTORISATION, AVANT LE GESTE ────────────────
select throws_ok(
  $$select public.evict_waitlist_entry(
      '4e5e0000-0000-4000-8000-00000000000a',
      '00000000-0000-4000-8000-000000000000',
      '4e5e0000-0000-4000-8000-000000000102')$$,
  '42501', null,
  'EVI-3 le CAISSIER n''évince personne : retirer un rang est un geste de gestion');
select throws_ok(
  $$select public.evict_waitlist_entry(
      '4e5e0000-0000-4000-8000-00000000000a',
      '00000000-0000-4000-8000-000000000000',
      '4e5e0000-0000-4000-8000-000000000104')$$,
  '42501', null,
  'EVI-4 ni un utilisateur qui n''est membre de rien');
select throws_ok(
  $$select public.evict_waitlist_entry(
      '4e5e0000-0000-4000-8000-00000000000a',
      '00000000-0000-4000-8000-000000000000', 'pas-un-uuid')$$,
  '42501', null,
  'EVI-5 ni un acteur dont la forme n''est même pas celle d''un identifiant');

-- L'ORGANISATION VOISINE EST MUETTE, ET DU MÊME MOT QU'UN IDENTIFIANT INCONNU.
-- Le propriétaire de B est bien owner CHEZ LUI : la garde d'appartenance passe,
-- et c'est le filtre org-scopé — lui seul — qui referme la porte.
select is(
  (public.evict_waitlist_entry(
    '4e5e0000-0000-4000-8000-00000000000b',
    (select (j->>'entry_id')::uuid from rv3_evi where n = 1),
    '4e5e0000-0000-4000-8000-000000000103'))->>'state',
  'unknown',
  'EVI-6 la voisine ne retire personne de la file de A');
select is(
  (public.evict_waitlist_entry(
    '4e5e0000-0000-4000-8000-00000000000a',
    '00000000-0000-4000-8000-000000000000',
    '4e5e0000-0000-4000-8000-000000000101'))->>'state',
  'unknown',
  'EVI-7 et un identifiant inconnu rend EXACTEMENT le même mot');
select is(
  (select w.status from public.reservation_waitlist_entries w
    where w.id = (select (j->>'entry_id')::uuid from rv3_evi where n = 1)),
  'offered',
  'EVI-8 aucun de ces refus n''a touché l''entrée');

-- ── LE GESTE : ÉVINCER CELUI QUI TIENT L'OFFRE ──────────────
create temporary table rv3_ev1 as
select public.evict_waitlist_entry(
  '4e5e0000-0000-4000-8000-00000000000a',
  (select (j->>'entry_id')::uuid from rv3_evi where n = 1),
  '4e5e0000-0000-4000-8000-000000000101') as j;
select is((select j->>'state' from rv3_ev1), 'evicted',
  'EVI-9 le propriétaire retire celui qui tenait la place');
select is(
  (select w.status from public.reservation_waitlist_entries w
    where w.id = (select (j->>'entry_id')::uuid from rv3_evi where n = 1)),
  'cancelled',
  'EVI-10 son entrée est close');

-- LE CŒUR DU BLOC : LA PLACE REPART, ET UNE SEULE FOIS.
select is(
  (select w.status from public.reservation_waitlist_entries w
    where w.id = (select (j->>'entry_id')::uuid from rv3_evi where n = 2)),
  'offered',
  'EVI-11 la place TENUE repart immédiatement au suivant, sous le même verrou');
select results_eq(
  $$select count(*) from public.reservation_waitlist_entries
     where slot_id = '4e5e0000-0000-4000-8000-000000000331'
       and status = 'offered'$$,
  array[1::bigint],
  'EVI-12 et une seule offre existe sur ce créneau — jamais deux sur une place');

-- ── IDEMPOTENCE ─────────────────────────────────────────────
create temporary table rv3_ev2 as
select public.evict_waitlist_entry(
  '4e5e0000-0000-4000-8000-00000000000a',
  (select (j->>'entry_id')::uuid from rv3_evi where n = 1),
  '4e5e0000-0000-4000-8000-000000000101') as j;
select is((select j->>'state' from rv3_ev2), 'evicted',
  'EVI-13 rejouée, elle rend le même mot');
select is(
  (select j->>'cancelled_at' from rv3_ev2),
  (select j->>'cancelled_at' from rv3_ev1),
  'EVI-14 sans repousser la date de sortie');

-- ── LE JOURNAL NE RETIENT QUE LE GESTE RÉEL ─────────────────
select results_eq(
  $$select count(*) from public.audit_logs
     where organization_id = '4e5e0000-0000-4000-8000-00000000000a'
       and action = 'reservation.waitlist_evict'$$,
  array[1::bigint],
  'EVI-15 deux clics, UNE ligne d''audit : le second n''a rien écrit');
select ok(
  (select (metadata->>'was_offered')::boolean from public.audit_logs
    where action = 'reservation.waitlist_evict'
      and organization_id = '4e5e0000-0000-4000-8000-00000000000a'),
  'EVI-16 et la ligne dit que l''évincé TENAIT une place — pas le même geste '
  'que retirer un simple inscrit');
select ok(
  (select metadata ? 'entry_id' and not (metadata ? 'email')
     from public.audit_logs
    where action = 'reservation.waitlist_evict'
      and organization_id = '4e5e0000-0000-4000-8000-00000000000a'),
  'EVI-17 elle porte l''entrée, jamais l''adresse');

-- ── ÉVINCER UNE ENTRÉE TERMINÉE N'INVENTE RIEN ──────────────
-- Le second de la file tient désormais l'offre ; on la lui laisse et on vérifie
-- l'autre extrémité : une entrée CONVERTIE ne se retire pas.
select is(
  (public.claim_waitlist_offer(
    '4e5e0000-0000-4000-8000-00000000000a',
    (select (j->>'entry_id')::uuid from rv3_evi where n = 2),
    repeat('3f', 32)))->>'state',
  'claimed',
  'EVI-18 le suivant prend la place qui lui a été rendue');
select is(
  (public.evict_waitlist_entry(
    '4e5e0000-0000-4000-8000-00000000000a',
    (select (j->>'entry_id')::uuid from rv3_evi where n = 2),
    '4e5e0000-0000-4000-8000-000000000101'))->>'state',
  'converted',
  'EVI-19 une entrée CONVERTIE ne se retire pas de la file : elle est devenue '
  'une réservation, et c''est l''annulation staff qui la reprend');


-- ════════════════════════════════════════════════════════════
-- 27. UNE OFFRE NE S'HONORE PAS SUR UN CRÉNEAU EN BROUILLON (M-1)
--
-- `claim_waitlist_offer` ne revérifiait PAS le statut du créneau, délibérément :
-- « l'offre EST l'autorisation ». L'arbitrage tenait pour `closed` — fermé veut
-- dire fermé AU PUBLIC, et l'offre est justement l'autre règle d'accès — et il
-- ne tenait pas pour `draft`, qui veut dire PAS CONFIGURÉ : un créneau qu'on est
-- en train de refaire, dont l'horaire et la capacité peuvent encore bouger.
-- L'alignement se fait sur `redeem_invitation`, qui tranchait déjà ainsi.
-- ════════════════════════════════════════════════════════════

create temporary table rv3_m1 (n int, j jsonb);
insert into rv3_m1 values (1, public.reserve_slot(
  '4e5e0000-0000-4000-8000-00000000000a',
  '4e5e0000-0000-4000-8000-000000000332', repeat('4a', 32)));
insert into rv3_m1 values (2, public.waitlist_join(
  '4e5e0000-0000-4000-8000-00000000000a',
  '4e5e0000-0000-4000-8000-000000000332', repeat('4b', 32)));
insert into rv3_m1 values (3, public.cancel_reservation(
  (select (j->>'reservation_id')::uuid from rv3_m1 where n = 1),
  repeat('4a', 32)));
select is(
  (select w.status from public.reservation_waitlist_entries w
    where w.id = (select (j->>'entry_id')::uuid from rv3_m1 where n = 2)),
  'offered',
  'DRAFT-1 l''offre est vivante sur S32, créneau encore ouvert');

-- LE CRÉNEAU RETOURNE EN BROUILLON — le commerçant le reprend en main.
update public.reservation_slots
   set status = 'draft'
 where id = '4e5e0000-0000-4000-8000-000000000332';

select is(
  (public.claim_waitlist_offer(
    '4e5e0000-0000-4000-8000-00000000000a',
    (select (j->>'entry_id')::uuid from rv3_m1 where n = 2),
    repeat('4b', 32)))->>'state',
  'unavailable',
  'DRAFT-2 l''offre ne s''honore PLUS : un créneau en brouillon n''est pas '
  'configuré, et l''offre n''y donne pas de place');
select results_eq(
  $$select count(*) from public.reservations
     where slot_id = '4e5e0000-0000-4000-8000-000000000332'
       and status = 'confirmed'$$,
  array[0::bigint],
  'DRAFT-3 et aucune réservation n''a été écrite sur ce créneau');

-- ── LE SYMÉTRIQUE : `closed` RESTE HONORÉ ───────────────────
insert into rv3_m1 values (11, public.reserve_slot(
  '4e5e0000-0000-4000-8000-00000000000a',
  '4e5e0000-0000-4000-8000-000000000333', repeat('4c', 32)));
insert into rv3_m1 values (12, public.waitlist_join(
  '4e5e0000-0000-4000-8000-00000000000a',
  '4e5e0000-0000-4000-8000-000000000333', repeat('4d', 32)));
insert into rv3_m1 values (13, public.cancel_reservation(
  (select (j->>'reservation_id')::uuid from rv3_m1 where n = 11),
  repeat('4c', 32)));

update public.reservation_slots
   set status = 'closed'
 where id = '4e5e0000-0000-4000-8000-000000000333';

select is(
  (public.claim_waitlist_offer(
    '4e5e0000-0000-4000-8000-00000000000a',
    (select (j->>'entry_id')::uuid from rv3_m1 where n = 12),
    repeat('4d', 32)))->>'state',
  'claimed',
  'DRAFT-4 sur un créneau FERMÉ AU PUBLIC, l''offre est honorée : c''est '
  'exactement ce que la file et l''invitation savent faire de plus que la jauge');


-- ════════════════════════════════════════════════════════════
-- 28. UNE ENTRÉE PURGÉE NE REÇOIT PLUS D'OFFRE (I-4)
--
-- La purge RGPD remplace l'empreinte par `purge:<id>`, une forme que la garde
-- de `claim_waitlist_offer` refuse. Sans le filtre ajouté à
-- `reservation_offer_next`, la place partait quand même sur cette entrée — et
-- y restait TENUE jusqu'à l'échéance, réclamable par personne. Une place gelée
-- deux heures au profit d'une identité effacée, sur un créneau complet,
-- c'est-à-dire précisément là où elle est rare.
-- ════════════════════════════════════════════════════════════

create temporary table rv3_i4 (n int, j jsonb);
insert into rv3_i4 values (1, public.reserve_slot(
  '4e5e0000-0000-4000-8000-00000000000a',
  '4e5e0000-0000-4000-8000-000000000334', repeat('5a', 32)));
-- Le PREMIER de la file — celui qui a le rang, et qui va être purgé.
insert into rv3_i4 values (2, public.waitlist_join(
  '4e5e0000-0000-4000-8000-00000000000a',
  '4e5e0000-0000-4000-8000-000000000334', repeat('5b', 32)));
-- Le second, intact.
insert into rv3_i4 values (3, public.waitlist_join(
  '4e5e0000-0000-4000-8000-00000000000a',
  '4e5e0000-0000-4000-8000-000000000334', repeat('5c', 32)));

-- LA PURGE, dans sa forme exacte (section 14 de la migration) : la ligne reste,
-- la personne s'efface.
update public.reservation_waitlist_entries
   set email = null,
       consent_transactional_at = null,
       player_key_hash = 'purge:' || id::text
 where id = (select (j->>'entry_id')::uuid from rv3_i4 where n = 2);

insert into rv3_i4 values (4, public.cancel_reservation(
  (select (j->>'reservation_id')::uuid from rv3_i4 where n = 1),
  repeat('5a', 32)));

select is(
  (select w.status from public.reservation_waitlist_entries w
    where w.id = (select (j->>'entry_id')::uuid from rv3_i4 where n = 2)),
  'waiting',
  'PURG-1 l''entrée PURGÉE est SAUTÉE : aucune offre ne lui est faite');
select is(
  (select w.status from public.reservation_waitlist_entries w
    where w.id = (select (j->>'entry_id')::uuid from rv3_i4 where n = 3)),
  'offered',
  'PURG-2 la place va au premier inscrit RÉELLEMENT joignable');


-- ════════════════════════════════════════════════════════════
-- 24. LES EXPÉRIENCES SIGNATURE (RES-5, migration 20261007120000)
--
-- Ce bloc prouve UNE SEULE PROPRIÉTÉ, sous tous les angles où elle peut se
-- perdre : LA CAPACITÉ SE COMPTE EN PERSONNES, ET UN DUO EST INDIVISIBLE.
--
-- Le défaut qu'il ferme est précis. Tant que le module comptait des LIGNES,
-- deux hôtes cliquant sur le dernier créneau d'un Atelier Duo de deux places
-- passaient tous les deux (2 lignes <= 2 places) et quatre personnes se
-- présentaient à un atelier pour deux. Aucune erreur, aucun log, aucune trace :
-- le commerçant l'aurait découvert le samedi, devant les gens.
--
-- LES CINQ ANGLES :
--   * LA JAUGE (DUO-1 à DUO-4) — un duo prend deux places, le suivant est
--     refusé même s'il reste une place, et cette place ne se vend pas à moitié.
--   * LA DERNIÈRE PAIRE (CONC-1 à CONC-3) — deux duos sur deux places : un
--     seul passe. C'est la même réserve que le bloc 1 sur ce que « concurrence »
--     veut dire ici : pgTAP est mono-transactionnel, donc ce qui est prouvé est
--     que LA JAUGE trie, et le verrou d'avis est vérifié séparément (bloc 1).
--   * LA LIBÉRATION (CANC-1 à CANC-4) — annuler un duo rend DEUX places, et
--     `reservation_offer_next` repart avec la bonne arithmétique : UNE offre
--     pour la paire, et sa conversion crée une réservation de DEUX personnes.
--     C'est l'angle le plus important : `claim_waitlist_offer` ne retestant
--     PAS la capacité, une conversion à une personne aurait laissé une place
--     tenue que plus rien n'aurait libérée, et une conversion sans unité
--     commune aurait sur-réservé le créneau en silence.
--   * LA PLACE ESSEULÉE (SEUL-1, SEUL-2) — sur un Atelier Duo à qui il reste
--     UNE place, la file s'ouvre et aucune offre ne part. Proposer cette place
--     aurait fait sonner un téléphone pour une offre impossible à honorer.
--   * LES CHAMPS DE PRÉSENTATION (PRES-1 à PRES-8) — ce que la base refuse
--     d'un format mal décrit, avant qu'un écran ait à le rendre.
--
-- ET LES DEUX INVARIANTS DU DÉPÔT, rejoués sur les tables neuves : l'ORG
-- VOISINE ne réserve pas ici (VOIS-1), et le `remaining` public dit la vérité
-- en PERSONNES (REM-1, REM-2).
-- ════════════════════════════════════════════════════════════

-- ── Fixtures des deux formats ────────────────────────────────
-- Le Moment Signature porte ses trois cartes et sa durée ; l'Atelier Duo porte
-- sa durée et ses instructions, et AUCUNE étape — c'est la différence de
-- format, écrite dans les données plutôt que racontée.
insert into public.reservation_activities
  (id, organization_id, name, description, active,
   kind, promise, duration_minutes, steps, preparation)
values
  ('4e5e0000-0000-4000-8000-000000000206',
   '4e5e0000-0000-4000-8000-00000000000a', 'Moment Signature', null, true,
   'signature', 'Trente minutes hors du temps, au comptoir.', 30,
   '[{"title":"On vous accueille","body":"Un mot sur la maison."},
     {"title":"On goûte","body":"Trois verres commentés."},
     {"title":"On repart","body":"Avec la fiche de dégustation."}]'::jsonb,
   'Venez cinq minutes en avance.'),
  ('4e5e0000-0000-4000-8000-000000000207',
   '4e5e0000-0000-4000-8000-00000000000a', 'Atelier Duo', null, true,
   'duo', 'À deux, les mains dans la farine.', 90, null,
   'Prévoyez un tablier ; tout le reste est fourni.'),
  -- Chez la VOISINE, un Atelier Duo parfaitement ouvert.
  ('4e5e0000-0000-4000-8000-000000000208',
   '4e5e0000-0000-4000-8000-00000000000b', 'Atelier Duo voisin', null, true,
   'duo', 'Le même, ailleurs.', 90, null, null);

insert into public.reservation_slots
  (id, activity_id, organization_id, starts_at, ends_at, capacity, status)
values
  -- S40 : Atelier Duo, TROIS places. Le nombre est choisi : il est IMPAIR, donc
  -- il reste forcément une place après un duo — celle qui ne doit jamais se
  -- vendre à moitié.
  ('4e5e0000-0000-4000-8000-000000000340',
   '4e5e0000-0000-4000-8000-000000000207',
   '4e5e0000-0000-4000-8000-00000000000a',
   now() + interval '2 days', now() + interval '2 days 90 minutes', 3, 'open'),
  -- S41 : Atelier Duo, DEUX places — la dernière paire.
  ('4e5e0000-0000-4000-8000-000000000341',
   '4e5e0000-0000-4000-8000-000000000207',
   '4e5e0000-0000-4000-8000-00000000000a',
   now() + interval '3 days', now() + interval '3 days 90 minutes', 2, 'open'),
  -- S42 : Atelier Duo, DEUX places — celui qu'on annule pour voir la file
  -- repartir.
  ('4e5e0000-0000-4000-8000-000000000342',
   '4e5e0000-0000-4000-8000-000000000207',
   '4e5e0000-0000-4000-8000-00000000000a',
   now() + interval '4 days', now() + interval '4 days 90 minutes', 2, 'open'),
  -- S43 : Moment Signature, TROIS places — le format qui refuse la taille 2.
  ('4e5e0000-0000-4000-8000-000000000343',
   '4e5e0000-0000-4000-8000-000000000206',
   '4e5e0000-0000-4000-8000-00000000000a',
   now() + interval '2 days', now() + interval '2 days 30 minutes', 3, 'open'),
  -- S44 : l'Atelier Duo de la VOISINE.
  ('4e5e0000-0000-4000-8000-000000000344',
   '4e5e0000-0000-4000-8000-000000000208',
   '4e5e0000-0000-4000-8000-00000000000b',
   now() + interval '2 days', now() + interval '2 days 90 minutes', 4, 'open');


-- ── PRES : ce que la base refuse d'un format mal décrit ──────
--
-- Les contraintes conditionnelles sont écrites en implication : elles ne
-- doivent mordre QUE sur le format concerné. Chaque refus est donc doublé, plus
-- loin, d'une acceptation sur un autre format — sans quoi une contrainte trop
-- large passerait pour une contrainte juste.

select throws_ok(
  $$insert into public.reservation_activities
      (organization_id, name, kind, steps)
    values ('4e5e0000-0000-4000-8000-00000000000a', 'Signature sans durée',
            'signature',
            '[{"title":"Une","body":"Deux."}]'::jsonb)$$,
  '23514', null,
  'PRES-1 une `signature` SANS DURÉE est refusée : la page immersive promet un '
  'temps, et s''engager sur une inconnue n''est pas une promesse');

select throws_ok(
  $$insert into public.reservation_activities
      (organization_id, name, kind, duration_minutes)
    values ('4e5e0000-0000-4000-8000-00000000000a', 'Duo sans durée', 'duo', null)$$,
  '23514', null,
  'PRES-2 un `duo` SANS DURÉE est refusé aussi — la contrainte vise les deux '
  'formats nouveaux, pas seulement celui qui a des cartes');

select throws_ok(
  $$insert into public.reservation_activities
      (organization_id, name, kind, duration_minutes, steps)
    values ('4e5e0000-0000-4000-8000-00000000000a', 'Signature bavarde',
            'signature', 30,
            '[{"title":"Une","body":"."},{"title":"Deux","body":"."},
              {"title":"Trois","body":"."},{"title":"Quatre","body":"."}]'::jsonb)$$,
  '23514', null,
  'PRES-3 QUATRE cartes sont refusées : la page en montre trois, et la base ne '
  'stocke pas ce que l''écran ne sait pas rendre');

select throws_ok(
  $$insert into public.reservation_activities
      (organization_id, name, kind, duration_minutes, steps)
    values ('4e5e0000-0000-4000-8000-00000000000a', 'Signature muette',
            'signature', 30, null)$$,
  '23514', null,
  'PRES-4 une `signature` SANS ÉTAPES est refusée : trois cartes sont sa '
  'définition, pas son ornement');

select throws_ok(
  $$insert into public.reservation_activities
      (organization_id, name, kind, duration_minutes, steps)
    values ('4e5e0000-0000-4000-8000-00000000000a', 'Signature vide',
            'signature', 30, '[]'::jsonb)$$,
  '23514', null,
  'PRES-5 un tableau VIDE ne vaut pas des étapes — le validateur borne le haut, '
  'la contrainte conditionnelle borne le bas');

select throws_ok(
  $$insert into public.reservation_activities
      (organization_id, name, kind, duration_minutes, steps)
    values ('4e5e0000-0000-4000-8000-00000000000a', 'Signature difforme',
            'signature', 30, '[{"title":"Sans corps"}]'::jsonb)$$,
  '23514', null,
  'PRES-6 une carte SANS `body` est refusée : la forme est validée carte par '
  'carte, pas seulement au niveau du tableau');

-- LE SYMÉTRIQUE, et il n'est pas redondant. Une clé absente donne `NULL` là où
-- le validateur attend un texte, et une chaîne `or` de `false` et de `NULL`
-- vaut `NULL` — que le `if` ne prend pas. C'est ce qui faisait ACCEPTER la
-- carte de PRES-6 avant les `coalesce` du validateur. Les deux assertions
-- prouvent que la parade tient des DEUX côtés, pas seulement de celui qui a
-- rougi.
select throws_ok(
  $$insert into public.reservation_activities
      (organization_id, name, kind, duration_minutes, steps)
    values ('4e5e0000-0000-4000-8000-00000000000a', 'Signature anonyme',
            'signature', 30, '[{"body":"Sans titre."}]'::jsonb)$$,
  '23514', null,
  'PRES-6b une carte SANS `title` est refusée aussi — la clé absente ne '
  'traverse pas le validateur en `NULL`');

-- LA FORME EST FERMÉE, PAS SEULEMENT COMPLÈTE. Les deux assertions précédentes
-- prouvent que les clés attendues sont EXIGÉES ; celle-ci prouve qu'aucune
-- autre n'est TOLÉRÉE. Sans elle, une carte parfaitement valide augmentée d'un
-- `cta` ou d'un `ordre` entrait en base sous une colonne réputée validée — que
-- rien ne borne ensuite, ni en longueur, ni en nombre, ni en nature.
select throws_ok(
  $$insert into public.reservation_activities
      (organization_id, name, kind, duration_minutes, steps)
    values ('4e5e0000-0000-4000-8000-00000000000a', 'Signature enrichie',
            'signature', 30,
            '[{"title":"Une","body":"Deux.","cta":"https://exemple.fr"}]'::jsonb)$$,
  '23514', null,
  'PRES-6c une carte avec une clé PARASITE est refusée : la forme est fermée à '
  '`{title, body}`, sinon la colonne devient un dépotoir que rien ne valide');

-- ET LE REFUS EST BIEN UN 23514, PAS UNE EXCEPTION BRUTE. `jsonb_object_keys`
-- LÈVE sur un jsonb qui n'est pas un objet, et SQL ne garantit pas l'ordre
-- d'évaluation d'un `or` : fondu dans la chaîne de tests, il aurait pu partir
-- avant le contrôle de type et transformer « étapes invalides » en erreur que
-- plus aucun écran ne sait traduire. Un élément SCALAIRE est donc rejoué ici.
select throws_ok(
  $$insert into public.reservation_activities
      (organization_id, name, kind, duration_minutes, steps)
    values ('4e5e0000-0000-4000-8000-00000000000a', 'Signature scalaire',
            'signature', 30, '["juste une chaîne"]'::jsonb)$$,
  '23514', null,
  'PRES-6d une étape SCALAIRE reste un refus de contrainte (23514) et non une '
  'exception brute : le contrôle de type passe AVANT la lecture des clés');

select throws_ok(
  $$insert into public.reservation_activities
      (organization_id, name, kind, duration_minutes)
    values ('4e5e0000-0000-4000-8000-00000000000a', 'Duo interminable',
            'duo', 600)$$,
  '23514', null,
  'PRES-7 une durée de dix heures est refusée : au-delà de la journée de '
  'travail, un créneau unique n''est plus le bon objet');

select throws_ok(
  $$insert into public.reservation_activities
      (organization_id, name, kind, duration_minutes, promise)
    values ('4e5e0000-0000-4000-8000-00000000000a', 'Duo prolixe', 'duo', 60,
            repeat('x', 201))$$,
  '23514', null,
  'PRES-8 une promesse de 201 caractères est refusée : c''est une phrase, pas '
  'un paragraphe');

-- ET LE FORMAT `standard` N'EST TOUCHÉ PAR AUCUNE DES DEUX CONDITIONNELLES.
-- C'est l'assertion qui prouve que cette migration ne casse pas le socle : une
-- activité d'hier, sans durée ni cartes, s'insère toujours.
select lives_ok(
  $$insert into public.reservation_activities (organization_id, name)
    values ('4e5e0000-0000-4000-8000-00000000000a', 'Activité du socle')$$,
  'PRES-9 une activité `standard` sans durée ni étapes reste parfaitement '
  'valide — le défaut de `kind` préserve tout l''existant');


-- ── DUO : la jauge compte des personnes ─────────────────────
--
-- S40 porte TROIS places. Un duo en prend deux ; il en reste une, et c'est
-- exactement la situation que « atomique par personne » doit régler.

create temporary table rv5_duo as
select 1 as n, public.reserve_slot(
  '4e5e0000-0000-4000-8000-00000000000a',
  '4e5e0000-0000-4000-8000-000000000340', repeat('d1', 32),
  null, false, 2) as j;

select is((select j->>'state' from rv5_duo where n = 1), 'reserved',
  'DUO-1 un hôte réserve l''Atelier pour deux');
select is((select j->>'party_size' from rv5_duo where n = 1), '2',
  'DUO-2 et la réservation porte DEUX personnes sur UNE ligne — un hôte, un '
  'accompagnant, un seul code de comptoir');
select is((select j->>'remaining' from rv5_duo where n = 1), '1',
  'DUO-3 `remaining` est en PERSONNES : trois places moins deux en font une');

-- LE SECOND DUO EST REFUSÉ, ALORS QU'IL RESTE UNE PLACE. C'est l'assertion
-- centrale du bloc : la jauge teste la DEMANDE ENTIÈRE (`v_taken + v_held +
-- v_seats > capacity`), pas seulement l'état. Avec un `>=` sur l'état, ce
-- second duo serait passé et l'atelier aurait accueilli quatre personnes.
insert into rv5_duo values (2, public.reserve_slot(
  '4e5e0000-0000-4000-8000-00000000000a',
  '4e5e0000-0000-4000-8000-000000000340', repeat('d2', 32),
  null, false, 2));
select is((select j->>'state' from rv5_duo where n = 2), 'full',
  'DUO-4 le second duo est refusé BIEN QU''IL RESTE UNE PLACE : un atelier à '
  'deux ne se vend pas à moitié');

-- ET LA PLACE ESSEULÉE NE SE VEND PAS NON PLUS À L'UNITÉ.
insert into rv5_duo values (3, public.reserve_slot(
  '4e5e0000-0000-4000-8000-00000000000a',
  '4e5e0000-0000-4000-8000-000000000340', repeat('d3', 32),
  null, false, 1));
select is((select j->>'state' from rv5_duo where n = 3), 'invalid_party_size',
  'DUO-5 une personne seule est refusée sur un Atelier Duo : « l''atelier se '
  'réserve à deux » est sa définition, pas une préférence');
select is((select j->>'expected' from rv5_duo where n = 3), '2',
  'DUO-6 et le refus DIT la taille attendue — le format est public, le taire '
  'ne cacherait rien et empêcherait l''écran d''expliquer');

-- LE SYMÉTRIQUE : deux personnes sur un format qui n'est pas un duo.
insert into rv5_duo values (4, public.reserve_slot(
  '4e5e0000-0000-4000-8000-00000000000a',
  '4e5e0000-0000-4000-8000-000000000343', repeat('d4', 32),
  null, false, 2));
select is((select j->>'state' from rv5_duo where n = 4), 'invalid_party_size',
  'DUO-7 deux personnes sont refusées sur un Moment Signature : une seule '
  'égalité `p_party_size = unité du format` porte les deux refus');
select is((select j->>'expected' from rv5_duo where n = 4), '1',
  'DUO-8 qui attend une personne le dit');

-- HORS BORNES : c'est un bogue d'appelant, pas un choix de joueur.
select throws_ok(
  format(
    $$select public.reserve_slot(
        '4e5e0000-0000-4000-8000-00000000000a',
        '4e5e0000-0000-4000-8000-000000000340', %L, null, false, 3)$$,
    repeat('d5', 32)),
  '22023', 'invalid party size',
  'DUO-9 une taille de 3 lève, elle ne se négocie pas : la borne de la base '
  'refuserait la ligne, mais avec une erreur que personne ne saurait lire');

-- LA VÉRITÉ EN BASE, pas seulement dans la réponse.
select results_eq(
  $$select coalesce(sum(party_size), 0)::integer
      from public.reservations
     where slot_id = '4e5e0000-0000-4000-8000-000000000340'
       and status in ('confirmed', 'checked_in')$$,
  array[2],
  'DUO-10 le créneau porte DEUX personnes pour UNE ligne : c''est la somme, '
  'pas le compte, qui fait foi');


-- ── CONC : la dernière PAIRE ────────────────────────────────
--
-- S41 porte DEUX places, c'est-à-dire exactement UN duo. Deux hôtes le
-- demandent. Même réserve que le bloc 1 : pgTAP est mono-transactionnel, donc
-- ce qui est prouvé ici est que LA JAUGE trie — le verrou d'avis qui rend ce
-- tri atomique entre sessions est vérifié dans `pg_locks` au bloc 1, sur la
-- clé exacte, et `reserve_slot` le prend avant de compter.

create temporary table rv5_conc as
select 1 as n, public.reserve_slot(
  '4e5e0000-0000-4000-8000-00000000000a',
  '4e5e0000-0000-4000-8000-000000000341', repeat('c1', 32),
  null, false, 2) as j;
insert into rv5_conc values (2, public.reserve_slot(
  '4e5e0000-0000-4000-8000-00000000000a',
  '4e5e0000-0000-4000-8000-000000000341', repeat('c2', 32),
  null, false, 2));

select is((select j->>'state' from rv5_conc where n = 1), 'reserved',
  'CONC-1 le premier duo prend la dernière paire');
select is((select j->>'state' from rv5_conc where n = 2), 'full',
  'CONC-2 le second est refusé — UN SEUL passe, jamais deux moitiés');
select results_eq(
  $$select count(*)::integer from public.reservations
     where slot_id = '4e5e0000-0000-4000-8000-000000000341'
       and status = 'confirmed'$$,
  array[1],
  'CONC-3 et il n''existe QU''UNE ligne : le refus n''a rien écrit');


-- ── SEUL : la place esseulée ne se propose à personne ────────
--
-- Retour sur S40 : deux places prises sur trois, il en reste UNE, et aucune
-- réservation ne peut la prendre. Deux propriétés en découlent, et elles
-- doivent être vraies ENSEMBLE — la file s'ouvre (sinon le joueur serait
-- renvoyé vers une réservation qui le refusera), et aucune offre ne part
-- (sinon on promettrait une place impossible à honorer).

create temporary table rv5_seul as
select 1 as n, public.waitlist_join(
  '4e5e0000-0000-4000-8000-00000000000a',
  '4e5e0000-0000-4000-8000-000000000340', repeat('e1', 32)) as j;

select is((select j->>'state' from rv5_seul where n = 1), 'waiting',
  'SEUL-1 la file S''OUVRE bien qu''il reste une place : « complet » se dit en '
  'RÉSERVATIONS POSSIBLES, et plus aucune ne tient');
select is(
  (select w.status from public.reservation_waitlist_entries w
    where w.id = (select (j->>'entry_id')::uuid from rv5_seul where n = 1)),
  'waiting',
  'SEUL-2 et l''inscrit reste `waiting` : la place isolée ne lui est PAS '
  'proposée — une offre qu''il ne pourrait pas convertir aurait gelé la place '
  'jusqu''à son échéance');
select results_eq(
  $$select public.reservation_offer_next(
      '4e5e0000-0000-4000-8000-00000000000a',
      '4e5e0000-0000-4000-8000-000000000340')$$,
  array[0],
  'SEUL-3 appelée directement, l''avance de file crée ZÉRO offre : la division '
  'entière `places libres / unité` vaut 0 sur une place isolée');


-- ── CANC : annuler un duo rend DEUX places ──────────────────
--
-- S42, deux places, un duo dessus : le créneau est plein. Quelqu'un s'inscrit
-- en file, l'hôte annule — et toute la chaîne doit repartir avec la BONNE
-- ARITHMÉTIQUE. C'est l'angle le plus délicat du lot, parce que
-- `claim_waitlist_offer` ne reteste PAS la capacité : elle fait confiance à
-- l'unité commune.

create temporary table rv5_canc as
select 1 as n, public.reserve_slot(
  '4e5e0000-0000-4000-8000-00000000000a',
  '4e5e0000-0000-4000-8000-000000000342', repeat('f1', 32),
  null, false, 2) as j;
insert into rv5_canc values (2, public.waitlist_join(
  '4e5e0000-0000-4000-8000-00000000000a',
  '4e5e0000-0000-4000-8000-000000000342', repeat('f2', 32)));

select is((select j->>'state' from rv5_canc where n = 2), 'waiting',
  'CANC-1 le créneau est plein (deux places, un duo) et la file s''ouvre');

-- L'ANNULATION. Elle ne compte rien elle-même : elle écrit le statut puis
-- appelle `reservation_offer_next` sous son verrou. La bonne arithmétique lui
-- vient donc de la fonction qu'elle appelait déjà — c'est pourquoi la migration
-- ne la redéfinit pas.
insert into rv5_canc values (3, public.cancel_reservation(
  (select (j->>'reservation_id')::uuid from rv5_canc where n = 1),
  repeat('f1', 32)));

select is((select j->>'state' from rv5_canc where n = 3), 'cancelled',
  'CANC-2 l''hôte annule');
select results_eq(
  $$select coalesce(sum(party_size), 0)::integer
      from public.reservations
     where slot_id = '4e5e0000-0000-4000-8000-000000000342'
       and status in ('confirmed', 'checked_in')$$,
  array[0],
  'CANC-3 DEUX places reviennent d''un coup — pas une');
select is(
  (select w.status from public.reservation_waitlist_entries w
    where w.id = (select (j->>'entry_id')::uuid from rv5_canc where n = 2)),
  'offered',
  'CANC-4 et la paire libérée part au premier de la file, en UNE offre');

-- LA CONVERSION CRÉE UNE RÉSERVATION DE DEUX PERSONNES. Sans cela, l'offre
-- aurait tenu deux places et n'en aurait consommé qu'une : une place serait
-- restée tenue par une offre convertie, que plus rien n'aurait libérée.
insert into rv5_canc values (4, public.claim_waitlist_offer(
  '4e5e0000-0000-4000-8000-00000000000a',
  (select (j->>'entry_id')::uuid from rv5_canc where n = 2),
  repeat('f2', 32)));

select is((select j->>'state' from rv5_canc where n = 4), 'claimed',
  'CANC-5 le premier de la file convertit son offre');
select is((select j->>'party_size' from rv5_canc where n = 4), '2',
  'CANC-6 et sa réservation vaut DEUX personnes — exactement ce que l''offre '
  'tenait ; c''est cette égalité qui autorise la conversion à ne pas retester '
  'la capacité');
select results_eq(
  $$select coalesce(sum(party_size), 0)::integer
      from public.reservations
     where slot_id = '4e5e0000-0000-4000-8000-000000000342'
       and status in ('confirmed', 'checked_in')$$,
  array[2],
  'CANC-7 le créneau est de nouveau plein, à DEUX personnes exactement : '
  'aucune sur-réservation par le chemin qui ne vérifie rien');


-- ── VOIS : l'organisation voisine ───────────────────────────
--
-- L'invariant du dépôt, rejoué sur le format neuf : viser le créneau de la
-- voisine depuis l'organisation A rend `unavailable` et RIEN d'autre — pas
-- `invalid_party_size`, qui aurait révélé le format d'un créneau qu'on n'a pas
-- le droit de voir. L'ORDRE DES REFUS EST LA PROPRIÉTÉ : la règle de taille est
-- évaluée APRÈS les six refus muets.

select is(
  (public.reserve_slot(
    '4e5e0000-0000-4000-8000-00000000000a',
    '4e5e0000-0000-4000-8000-000000000344', repeat('b1', 32),
    null, false, 2))->>'state',
  'unavailable',
  'VOIS-1 le créneau de la VOISINE reste muet, même avec la bonne taille');
select is(
  (public.reserve_slot(
    '4e5e0000-0000-4000-8000-00000000000a',
    '4e5e0000-0000-4000-8000-000000000344', repeat('b2', 32),
    null, false, 1))->>'state',
  'unavailable',
  'VOIS-2 et avec la MAUVAISE taille aussi : `invalid_party_size` ici aurait '
  'dit qu''un Atelier Duo existe chez le voisin');
select results_eq(
  $$select count(*)::integer from public.reservations
     where slot_id = '4e5e0000-0000-4000-8000-000000000344'$$,
  array[0],
  'VOIS-3 et rien n''a été écrit chez elle');


-- ── REM : le `remaining` public dit la vérité en personnes ───

create temporary table rv5_rem as
select 1 as n, public.reserve_slot(
  '4e5e0000-0000-4000-8000-00000000000a',
  '4e5e0000-0000-4000-8000-000000000343', repeat('a1', 32),
  null, false, 1) as j;

select is((select j->>'state' from rv5_rem where n = 1), 'reserved',
  'REM-1 le Moment Signature se réserve à une personne, comme le socle');
select is((select j->>'remaining' from rv5_rem where n = 1), '2',
  'REM-2 et son `remaining` est celui d''hier : trois places moins une');

-- L'ÉTAT PUBLIC DU JOUEUR PORTE SA TAILLE. Sans elle, l'hôte d'un Atelier Duo
-- ne pourrait pas savoir si son accompagnant a une place.
select is(
  (select (item->>'party_size')
     from pg_catalog.jsonb_array_elements(
       (public.reservation_public_state(
          '4e5e0000-0000-4000-8000-00000000000a', repeat('d1', 32)))
         -> 'reservations') as item
    limit 1),
  '2',
  'REM-3 l''état public rend `party_size` : l''hôte relit « pour deux »');

-- ET LE FORMAT N'ENTRE PAS DANS CET ÉTAT — il décrit ce qui est PROPOSÉ, que la
-- page lit sur `reservation_activities`. Deux sources pour la même vérité
-- auraient fini par diverger.
select ok(
  not ((public.reservation_public_state(
          '4e5e0000-0000-4000-8000-00000000000a', repeat('d1', 32)))
        -> 'reservations' -> 0 ? 'kind'),
  'REM-4 et il ne recopie PAS le format de l''activité');


-- ════════════════════════════════════════════════════════════
-- 25. LE FORMAT NE BASCULE PAS SOUS DES ENGAGEMENTS VIVANTS
--     (RES-5, migration 20261009120000)
--
-- `kind` est l'unité de comptage de toute la capacité, et il est RELU à chaque
-- appel — jamais figé au moment où un engagement est pris. Bascule d'une
-- activité en `duo` pendant qu'une offre de liste tient UNE place :
-- `claim_waitlist_offer` ne repasse PAS par la jauge (sa propriété fondatrice),
-- lit le format COURANT, écrit `party_size = 2`, et le créneau porte quatre
-- personnes sur trois places. Sans erreur, sans journal, sans trace.
--
-- `reservation_activity_live_commitments` est ce qui permet au panneau de
-- REFUSER en NOMMANT ce qu'il a compté. Ce bloc prouve les quatre frontières de
-- ce comptage, parce que ce sont elles qui décident si la garde protège ou
-- gêne :
--   * CE QUI COMPTE — réservations `confirmed` ET `checked_in`, entrées
--     `waiting` ET `offered` encore tenues.
--   * CE QUI NE COMPTE PAS — annulée, expirée, et l'OFFRE ÉCHUE : elle ne se
--     convertit plus (refus paresseux de `claim_waitlist_offer`), la compter
--     bloquerait le commerçant sur une ligne morte.
--   * OÙ ÇA COMPTE — sur les créneaux À VENIR seulement. Un créneau commencé ne
--     produira plus rien ; l'y inclure aurait interdit de changer de format
--     APRÈS sa saison, c'est-à-dire au moment exact où on le fait.
--   * CHEZ QUI — org-scopée, `unknown` pour la voisine.
-- ════════════════════════════════════════════════════════════

insert into public.reservation_activities
  (id, organization_id, name, active, kind)
values
  -- 209 : l'activité SOUS ENGAGEMENTS. Standard, comme l'est toute activité
  -- qu'on s'apprête à basculer en duo — c'est le scénario du défaut.
  ('4e5e0000-0000-4000-8000-000000000209',
   '4e5e0000-0000-4000-8000-00000000000a', 'Bascule sous engagements', true,
   'standard'),
  -- 210 : la MÊME chose, mais tout est derrière elle. C'est l'état où le
  -- commerçant a le droit de changer de format, et il doit être reconnu comme
  -- tel — une garde qui ne s'ouvre jamais n'est pas une garde, c'est un mur.
  ('4e5e0000-0000-4000-8000-000000000210',
   '4e5e0000-0000-4000-8000-00000000000a', 'Bascule apres la saison', true,
   'standard');

insert into public.reservation_slots
  (id, activity_id, organization_id, starts_at, ends_at, capacity, status)
values
  -- S45 : À VENIR. Tout ce qui doit compter est ici.
  ('4e5e0000-0000-4000-8000-000000000345',
   '4e5e0000-0000-4000-8000-000000000209',
   '4e5e0000-0000-4000-8000-00000000000a',
   now() + interval '5 days', now() + interval '5 days 1 hour', 4, 'open'),
  -- S46 : PASSÉ, et de la MÊME activité. C'est ce qui rend le filtre « à venir »
  -- prouvé plutôt que supposé : deux activités séparées auraient pu passer avec
  -- un filtre qui ne regarde que l'activité.
  ('4e5e0000-0000-4000-8000-000000000346',
   '4e5e0000-0000-4000-8000-000000000209',
   '4e5e0000-0000-4000-8000-00000000000a',
   now() - interval '5 days', now() - interval '5 days' + interval '1 hour',
   4, 'open'),
  -- S47 : passé aussi, pour l'activité dont la saison est finie.
  ('4e5e0000-0000-4000-8000-000000000347',
   '4e5e0000-0000-4000-8000-000000000210',
   '4e5e0000-0000-4000-8000-00000000000a',
   now() - interval '6 days', now() - interval '6 days' + interval '1 hour',
   4, 'open');

-- LES RÉSERVATIONS. Écrites en direct plutôt que par `reserve_slot` : on veut
-- poser des ÉTATS (annulée, arrivée, sur créneau passé) que la RPC refuserait
-- justement de créer, et c'est le comptage qu'on teste, pas la prise de place.
insert into public.reservations
  (slot_id, organization_id, player_key_hash, status, cancelled_at, checked_in_at)
values
  ('4e5e0000-0000-4000-8000-000000000345',
   '4e5e0000-0000-4000-8000-00000000000a', repeat('a1', 32),
   'confirmed', null, null),
  -- ARRIVÉE : le check-in ne libère RIEN, elle compte comme vivante.
  ('4e5e0000-0000-4000-8000-000000000345',
   '4e5e0000-0000-4000-8000-00000000000a', repeat('a2', 32),
   'checked_in', null, now() - interval '1 minute'),
  -- ANNULÉE : elle n'engage plus personne.
  ('4e5e0000-0000-4000-8000-000000000345',
   '4e5e0000-0000-4000-8000-00000000000a', repeat('a3', 32),
   'cancelled', now() - interval '1 hour', null),
  -- VIVANTE, mais sur le créneau PASSÉ : elle ne sera plus recomptée par rien.
  ('4e5e0000-0000-4000-8000-000000000346',
   '4e5e0000-0000-4000-8000-00000000000a', repeat('c1', 32),
   'confirmed', null, null),
  ('4e5e0000-0000-4000-8000-000000000347',
   '4e5e0000-0000-4000-8000-00000000000a', repeat('d1', 32),
   'confirmed', null, null);

insert into public.reservation_waitlist_entries
  (slot_id, organization_id, player_key_hash, status,
   offered_at, offer_expires_at, expired_at)
values
  -- ATTEND : c'est elle que la bascule trahirait. Elle recevra une offre à la
  -- première place libre, et cette offre sera convertie à l'unité du format
  -- COURANT — celui d'après la bascule.
  ('4e5e0000-0000-4000-8000-000000000345',
   '4e5e0000-0000-4000-8000-00000000000a', repeat('b1', 32), 'waiting',
   null, null, null),
  -- OFFRE TENUE : le cas exact de la revue.
  ('4e5e0000-0000-4000-8000-000000000345',
   '4e5e0000-0000-4000-8000-00000000000a', repeat('b2', 32), 'offered',
   now() - interval '10 minutes', now() + interval '1 hour', null),
  -- OFFRE ÉCHUE : `claim_waitlist_offer` lui rend `expired` par refus
  -- PARESSEUX, balayage ou pas. Elle ne peut plus rien convertir, donc elle ne
  -- doit pas bloquer le commerçant.
  ('4e5e0000-0000-4000-8000-000000000345',
   '4e5e0000-0000-4000-8000-00000000000a', repeat('b3', 32), 'offered',
   now() - interval '3 hours', now() - interval '1 hour', null),
  -- TERMINÉE.
  ('4e5e0000-0000-4000-8000-000000000345',
   '4e5e0000-0000-4000-8000-00000000000a', repeat('b4', 32), 'expired',
   now() - interval '4 hours', now() - interval '3 hours',
   now() - interval '3 hours'),
  -- VIVANTE, sur le créneau PASSÉ.
  ('4e5e0000-0000-4000-8000-000000000346',
   '4e5e0000-0000-4000-8000-00000000000a', repeat('c2', 32), 'waiting',
   null, null, null),
  ('4e5e0000-0000-4000-8000-000000000347',
   '4e5e0000-0000-4000-8000-00000000000a', repeat('d2', 32), 'waiting',
   null, null, null);

create temporary table rv5_eng as
select 1 as n, public.reservation_activity_live_commitments(
  '4e5e0000-0000-4000-8000-00000000000a',
  '4e5e0000-0000-4000-8000-000000000209') as j;

select is((select j->>'state' from rv5_eng where n = 1), 'ok',
  'ENG-1 le comptage répond pour une activité de son organisation');
select is((select j->>'kind' from rv5_eng where n = 1), 'standard',
  'ENG-2 et rend le format COURANT — sans lui, l''appelant aurait dû relire '
  'l''activité pour savoir si le format change vraiment');

-- DEUX réservations sur cinq lignes : la `confirmed` et la `checked_in` du
-- créneau à venir. L'annulée, la passée et celle de l'autre activité sortent.
select is((select j->>'reservations' from rv5_eng where n = 1), '2',
  'ENG-3 deux réservations vivantes : `checked_in` compte (le check-in ne '
  'libère rien), `cancelled` non, et le créneau PASSÉ non plus');

-- DEUX attentes sur six lignes : la `waiting` et l'offre encore TENUE.
select is((select j->>'waitlist' from rv5_eng where n = 1), '2',
  'ENG-4 deux attentes convertibles : l''offre ÉCHUE ne compte pas — elle ne '
  'se convertit plus, la compter bloquerait le commerçant sur une ligne morte');

-- L'ÉTAT OÙ LA BASCULE EST PERMISE. Une garde qui ne s'ouvre jamais est un mur :
-- l'activité 210 porte une réservation vivante et une attente vivante, mais
-- toutes deux sur un créneau passé — rien ne peut plus s'y produire.
insert into rv5_eng values (2, public.reservation_activity_live_commitments(
  '4e5e0000-0000-4000-8000-00000000000a',
  '4e5e0000-0000-4000-8000-000000000210'));
select is((select j->>'reservations' from rv5_eng where n = 2), '0',
  'ENG-5 saison finie : plus aucune réservation ne compte…');
select is((select j->>'waitlist' from rv5_eng where n = 2), '0',
  'ENG-6 …ni aucune attente, et le format redevient donc réglable');

-- L'INVARIANT DU DÉPÔT. Viser l'activité de A depuis B rend `unknown` — pas un
-- compte de zéro, qui aurait appris que l'activité existe et n'engage personne.
insert into rv5_eng values (3, public.reservation_activity_live_commitments(
  '4e5e0000-0000-4000-8000-00000000000b',
  '4e5e0000-0000-4000-8000-000000000209'));
select is((select j->>'state' from rv5_eng where n = 3), 'unknown',
  'ENG-7 la voisine n''obtient RIEN de l''activité de A — ni compte, ni format');
select ok(not ((select j from rv5_eng where n = 3) ? 'reservations'),
  'ENG-8 et le refus ne laisse échapper aucun chiffre');

insert into rv5_eng values (4, public.reservation_activity_live_commitments(
  '4e5e0000-0000-4000-8000-00000000000a',
  '4e5e0000-0000-4000-8000-0000000009ff'));
select is((select j->>'state' from rv5_eng where n = 4), 'unknown',
  'ENG-9 une activité inconnue rend le MÊME état qu''une activité étrangère : '
  'les distinguer donnerait un oracle d''existence');


-- ── ACL : les colonnes neuves suivent le régime du socle ────

select ok(has_column_privilege('authenticated',
  'public.reservations', 'party_size', 'SELECT'),
  'ACL-24 l''éditeur LIT `party_size` — sans quoi son agenda afficherait '
  '« 3 réservations » sur un atelier plein à 6 personnes');
select ok(not has_column_privilege('authenticated',
  'public.reservations', 'party_size', 'UPDATE'),
  'ACL-25 mais ne l''écrit pas : la taille se décide sous le verrou');
select ok(not has_column_privilege('anon',
  'public.reservation_activities', 'kind', 'SELECT'),
  'ACL-26 `anon` ne lit RIEN des formats — le parcours joueur passe par une RPC');
select ok(has_column_privilege('authenticated',
  'public.reservation_activities', 'steps', 'UPDATE'),
  'ACL-27 l''éditeur règle les cartes de son Moment Signature');
select results_eq(
  $$select count(*) from pg_catalog.pg_proc p
      join pg_catalog.pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'reserve_slot'$$,
  array[1::bigint],
  'ACL-28 le catalogue ne porte TOUJOURS qu''UNE signature de reserve_slot : '
  'l''ancienne à cinq arguments est partie, sans quoi un appel sans taille '
  'aurait réservé un Atelier Duo pour une personne');

-- LE COMPTAGE D'ENGAGEMENTS SUIT LE RÉGIME DES CINQ AUTRES RPC DU MODULE : il
-- lit `reservations`, dont l'éditeur n'a AUCUNE policy de lecture, et il
-- contourne la RLS pour cela. Le rendre à `authenticated` aurait donné au
-- panneau un chemin direct vers des comptages qu'il doit demander au serveur.
select ok(has_function_privilege('service_role',
  'public.reservation_activity_live_commitments(uuid,uuid)', 'EXECUTE'),
  'ACL-29 le serveur compte les engagements avant d''autoriser une bascule');
select ok(not has_function_privilege('authenticated',
  'public.reservation_activity_live_commitments(uuid,uuid)', 'EXECUTE'),
  'ACL-30 le panneau commerçant ne compte pas lui-même : il passe par l''action');
select ok(not has_function_privilege('anon',
  'public.reservation_activity_live_commitments(uuid,uuid)', 'EXECUTE'),
  'ACL-31 et `anon` n''a rien à savoir de ce qui est engagé chez un commerce');

select * from finish();
rollback;
