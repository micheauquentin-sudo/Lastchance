-- ============================================================
-- LA FILE SEREINE TIENT SES PROMESSES (RES-3, lot L6)
--
-- Ce que ce fichier prouve, et dans quel ordre :
--
--   1. UNE IDENTITÉ, UNE ENTRÉE VIVANTE PAR FILE. Rejouer `queue_join` rend LA
--      MÊME entrée et LE MÊME rang, jamais une seconde ligne — et l'index unique
--      partiel refuse l'écriture directe qui essaierait de contourner la RPC.
--   2. LE RANG EST UN CALCUL, ET IL NE SAUTE PAS. Trois personnes ; la première
--      part ; la deuxième devient 1re et la troisième 2e. La suite des rangs des
--      entrées en attente est EXACTEMENT 1, 2 — ni trou, ni doublon, ni saut.
--      Et il DESCEND aussi quand le staff appelle : un appelé n'attend plus.
--   3. DEUX APPELS NE PRENNENT JAMAIS LA MÊME PERSONNE. Voir la réserve
--      ci-dessous sur ce que « concurrence » peut vouloir dire ici.
--   4. ON NE RÉSOUT QUE CE QUI A ÉTÉ APPELÉ. `not_called` depuis `waiting`, et
--      la contrainte `…_outcome_origin` refuse la même chose par écriture
--      directe. Rejouer une résolution n'écrit rien et n'audite rien.
--   5. REOPEN REMET EN TÊTE — y compris quand quelqu'un a rejoint la file entre
--      l'appel et la correction. Sans qu'aucun rang n'ait été renuméroté.
--   6. L'ORGANISATION VOISINE EST MUETTE PARTOUT. Les sept RPC rendent pour une
--      file du voisin EXACTEMENT ce qu'elles rendent pour une file inconnue.
--   7. LE PLAFOND EXISTE, et il se rouvre quand quelqu'un part.
--   8. AUCUN ETA. L'assertion porte sur l'ENSEMBLE EXACT des clés du document
--      public : ajouter une estimation un jour fera rougir ce fichier, ce qui
--      est précisément le but — que ce soit une décision, pas un glissement.
--   9. AUCUNE IDENTITÉ D'AUTRUI dans la réponse publique, pas même un prénom.
--  10. LES COMPTEURS DU JOUR SONT JUSTES, et une résolution d'avant-hier n'y
--      entre pas.
--  11. ACL ET RLS. Les deux tables neuves sont fermées à `anon` au niveau TABLE,
--      l'adresse ET LE PRÉNOM sont hors du grant de colonnes, et la formule du
--      rang n'est exécutable par AUCUN rôle applicatif — `service_role` compris.
--  12. LA PURGE EFFACE LA PERSONNE, PAS L'HISTOIRE DE LA FILE — ET ELLE FERME
--      L'ENTRÉE ENCORE VIVANTE, qui occupait sinon une ligne du plafond POUR
--      TOUJOURS : son empreinte n'en est plus une, donc plus rien ne pouvait la
--      libérer. La clôture est datée du dernier instant connu de l'entrée, pas
--      de l'instant du cron, sans quoi les compteurs du jour auraient annoncé
--      au commerçant une volée d'abandons vieux de treize mois.
--
-- ── CE QUE CE FICHIER NE PROUVE PAS, ET IL FAUT LE DIRE ──
--
-- pgTAP tourne dans UNE session et UNE transaction : il ne peut pas lancer deux
-- `queue_call_next` réellement simultanés. Ce qui est prouvé ici, c'est (a) que
-- le second appel VOIT le premier et prend quelqu'un d'autre — la propriété qui
-- casse si le choix de la tête et son écriture ne sont pas le même geste — et
-- (b) que le verrou d'avis attendu EST bien détenu, sur la clé exacte
-- (organisation + file), après l'appel. La sérialisation elle-même est une
-- propriété de `pg_advisory_xact_lock` ; prétendre le contraire serait un vert
-- qui ne prouve rien.
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
  ('4f11e000-0000-4000-8000-00000000000a', 'File A', 'tap-file-a',
   'active', 'starter', 'Europe/Paris', 6),
  ('4f11e000-0000-4000-8000-00000000000b', 'File B', 'tap-file-b',
   'active', 'starter', 'Europe/Paris', 6),
  ('4f11e000-0000-4000-8000-00000000000c', 'File C', 'tap-file-c',
   'active', 'starter', 'Europe/Paris', 6);

insert into public.organization_module_grants
  (organization_id, module, kind, source, starts_at, ends_at)
values
  ('4f11e000-0000-4000-8000-00000000000a', 'vitrine', 'pass', 'backoffice',
   now() - interval '1 day', now() + interval '365 days'),
  ('4f11e000-0000-4000-8000-00000000000b', 'vitrine', 'pass', 'backoffice',
   now() - interval '1 day', now() + interval '365 days');

insert into auth.users (id, email) values
  ('4f11e000-0000-4000-8000-000000000101', 'proprio-a@tap-file.local'),
  ('4f11e000-0000-4000-8000-000000000102', 'caissier-a@tap-file.local'),
  ('4f11e000-0000-4000-8000-000000000103', 'proprio-b@tap-file.local'),
  ('4f11e000-0000-4000-8000-000000000104', 'inconnu@tap-file.local');

insert into public.organization_members (organization_id, user_id, role) values
  ('4f11e000-0000-4000-8000-00000000000a',
   '4f11e000-0000-4000-8000-000000000101', 'owner'),
  ('4f11e000-0000-4000-8000-00000000000a',
   '4f11e000-0000-4000-8000-000000000102', 'cashier'),
  ('4f11e000-0000-4000-8000-00000000000b',
   '4f11e000-0000-4000-8000-000000000103', 'owner');

-- Une activité ACTIVE et une COUPÉE : une file rattachée à la seconde doit se
-- fermer, alors même que son propre `status` est `open`.
insert into public.reservation_activities
  (id, organization_id, name, description, active)
values
  ('4f11e000-0000-4000-8000-000000000201',
   '4f11e000-0000-4000-8000-00000000000a', 'Dégustation', null, true),
  ('4f11e000-0000-4000-8000-000000000202',
   '4f11e000-0000-4000-8000-00000000000a', 'Atelier suspendu', null, false);

-- Q1 SANS ACTIVITÉ : la file « Comptoir » du cahier. Sa seule existence prouve
-- que la FK composite optionnelle laisse passer une file qui n'en a pas.
insert into public.reservation_queues
  (id, organization_id, activity_id, name, status, max_live_entries)
values
  ('4f11e000-0000-4000-8000-000000000301',
   '4f11e000-0000-4000-8000-00000000000a', null, 'Comptoir', 'open', 50),
  ('4f11e000-0000-4000-8000-000000000302',
   '4f11e000-0000-4000-8000-00000000000a',
   '4f11e000-0000-4000-8000-000000000201', 'Dégustation', 'open', 50),
  -- Rattachée à l'activité COUPÉE.
  ('4f11e000-0000-4000-8000-000000000303',
   '4f11e000-0000-4000-8000-00000000000a',
   '4f11e000-0000-4000-8000-000000000202', 'Atelier', 'open', 50),
  ('4f11e000-0000-4000-8000-000000000304',
   '4f11e000-0000-4000-8000-00000000000a', null, 'En pause', 'paused', 50),
  -- PLAFOND À DEUX : le refus doit être atteignable en trois appels.
  ('4f11e000-0000-4000-8000-000000000305',
   '4f11e000-0000-4000-8000-00000000000a', null, 'Petite', 'open', 2),
  -- Le rang y descend quand le staff appelle : file dédiée pour ne pas
  -- perturber les comptages de Q1.
  ('4f11e000-0000-4000-8000-000000000306',
   '4f11e000-0000-4000-8000-00000000000a', null, 'Appels', 'open', 50),
  -- Les compteurs du jour.
  ('4f11e000-0000-4000-8000-000000000307',
   '4f11e000-0000-4000-8000-00000000000a', null, 'Comptée', 'open', 50),
  -- La purge.
  ('4f11e000-0000-4000-8000-000000000308',
   '4f11e000-0000-4000-8000-00000000000a', null, 'Purgée', 'open', 50),
  -- LE PLAFOND TENU PAR UN FANTÔME. Plafond à UN, et il le faut : à 50, la
  -- ligne qu'une entrée purgée occupe indéfiniment ne refuse encore personne,
  -- et le bogue reste invisible. À 1, il se voit du premier coup.
  ('4f11e000-0000-4000-8000-000000000309',
   '4f11e000-0000-4000-8000-00000000000a', null, 'Plafond oublié', 'open', 1),
  -- VOISINE.
  ('4f11e000-0000-4000-8000-000000000351',
   '4f11e000-0000-4000-8000-00000000000b', null, 'Comptoir voisin', 'open', 50),
  -- SANS le droit `vitrine`.
  ('4f11e000-0000-4000-8000-000000000371',
   '4f11e000-0000-4000-8000-00000000000c', null, 'Comptoir sans droit', 'open', 50);


-- ════════════════════════════════════════════════════════════
-- 1. ENTRER DANS LA FILE, ET N'Y ÊTRE QU'UNE FOIS
-- ════════════════════════════════════════════════════════════

create temporary table fq1 (n int, j jsonb);

insert into fq1 values (1, public.queue_join(
  '4f11e000-0000-4000-8000-00000000000a',
  '4f11e000-0000-4000-8000-000000000301', repeat('a1', 32), 'Alix'));
insert into fq1 values (2, public.queue_join(
  '4f11e000-0000-4000-8000-00000000000a',
  '4f11e000-0000-4000-8000-000000000301', repeat('a2', 32), 'Bilal'));
insert into fq1 values (3, public.queue_join(
  '4f11e000-0000-4000-8000-00000000000a',
  '4f11e000-0000-4000-8000-000000000301', repeat('a3', 32), 'Chloé'));

select is((select j->>'state' from fq1 where n = 1), 'waiting',
  'JOIN-1 une file SANS activité (« Comptoir ») accepte la première personne');
select is((select j->>'position' from fq1 where n = 1), '1',
  'JOIN-2 le premier arrivé est 1er');
select is((select j->>'position' from fq1 where n = 2), '2',
  'JOIN-3 le deuxième est 2e — l''ordre est celui de l''arrivée, pas d''un UUID');
select is((select j->>'position' from fq1 where n = 3), '3',
  'JOIN-4 le troisième est 3e');
select is((select j->>'waiting_count' from fq1 where n = 3), '3',
  'JOIN-5 la taille de la file est rendue avec le rang (« 3e sur 3 »)');

-- LE VERROU D'AVIS, sur la clé EXACTE. La clé porte l'organisation : dans ce
-- module, tout ce qui désigne un objet le fait sous son locataire, et les cinq
-- RPC d'écriture construisent LA MÊME — sans quoi elles cesseraient de se
-- sérialiser l'une l'autre.
with k as (
  select pg_catalog.hashtextextended(
    'reservation_queue:' || '4f11e000-0000-4000-8000-00000000000a'
      || ':' || '4f11e000-0000-4000-8000-000000000301', 0) as v
)
select ok(
  exists (
    select 1 from pg_locks l, k
     where l.locktype = 'advisory'
       and l.objsubid = 1
       and l.classid::bigint = ((k.v >> 32) & 4294967295)
       and l.objid::bigint = (k.v & 4294967295)
  ),
  'JOIN-6 le verrou d''avis (organisation + file) est détenu par la transaction');

-- REJOUER LE MÊME JOIN : même entrée, même rang, aucune seconde ligne.
insert into fq1 values (4, public.queue_join(
  '4f11e000-0000-4000-8000-00000000000a',
  '4f11e000-0000-4000-8000-000000000301', repeat('a2', 32), 'Bilal'));
select is((select j->>'state' from fq1 where n = 4), 'already_waiting',
  'JOIN-7 rejouer l''entrée rend `already_waiting`, jamais une erreur');
select is(
  (select j->>'entry_id' from fq1 where n = 4),
  (select j->>'entry_id' from fq1 where n = 2),
  'JOIN-8 c''est LA MÊME entrée qui est rendue');
select is((select j->>'position' from fq1 where n = 4), '2',
  'JOIN-9 et LE MÊME rang : un rechargement de page ne fait pas reculer');
select results_eq(
  $$select count(*) from public.reservation_queue_entries
     where queue_id = '4f11e000-0000-4000-8000-000000000301'$$,
  array[3::bigint],
  'JOIN-10 trois entrées pour quatre appels : aucune ligne en double');

-- L'INDEX UNIQUE PARTIEL tient même sans la RPC.
select throws_ok(
  $$insert into public.reservation_queue_entries
      (queue_id, organization_id, player_key_hash)
    values ('4f11e000-0000-4000-8000-000000000301',
            '4f11e000-0000-4000-8000-00000000000a', repeat('a2', 32))$$,
  '23505',
  null,
  'JOIN-11 une seconde entrée vivante de la MÊME identité est refusée PAR LA BASE');

-- … mais revenir après être parti reste un parcours normal : l'index est
-- PARTIEL, sur les seuls états vivants.
select lives_ok(
  $$insert into public.reservation_queue_entries
      (queue_id, organization_id, player_key_hash, status, resolved_at)
    values ('4f11e000-0000-4000-8000-000000000301',
            '4f11e000-0000-4000-8000-00000000000a', repeat('a2', 32),
            'left', now())$$,
  'JOIN-12 une entrée TERMINÉE de la même identité passe : on peut revenir demain');

-- ── Les refus, tous sous le même mot ─────────────────────────
select is(
  (public.queue_join('4f11e000-0000-4000-8000-00000000000a',
    '4f11e000-0000-4000-8000-000000000302', repeat('b1', 32)))->>'state',
  'waiting',
  'JOIN-13 une file rattachée à une activité ACTIVE accepte');
select is(
  (public.queue_join('4f11e000-0000-4000-8000-00000000000a',
    '4f11e000-0000-4000-8000-000000000303', repeat('b1', 32)))->>'state',
  'unavailable',
  'JOIN-14 activité COUPÉE : la file se ferme, quel que soit son propre statut');
select is(
  (public.queue_join('4f11e000-0000-4000-8000-00000000000a',
    '4f11e000-0000-4000-8000-000000000304', repeat('b1', 32)))->>'state',
  'unavailable',
  'JOIN-15 une file EN PAUSE n''accepte plus personne');
select is(
  (public.queue_join('4f11e000-0000-4000-8000-00000000000a',
    '4f11e000-0000-4000-8000-000000000351', repeat('b1', 32)))->>'state',
  'unavailable',
  'JOIN-16 la file du VOISIN rend le même mot qu''une file inconnue');
select is(
  (public.queue_join('4f11e000-0000-4000-8000-00000000000a',
    '4f11e000-0000-4000-8000-0000000009ff', repeat('b1', 32)))->>'state',
  'unavailable',
  'JOIN-17 une file INCONNUE rend exactement le même mot');
select is(
  (public.queue_join('4f11e000-0000-4000-8000-00000000000c',
    '4f11e000-0000-4000-8000-000000000371', repeat('b1', 32)))->>'state',
  'unavailable',
  'JOIN-18 sans le droit `vitrine`, aucune file ne s''ouvre');
select results_eq(
  $$select count(*) from public.reservation_queue_entries
     where organization_id in ('4f11e000-0000-4000-8000-00000000000b',
                               '4f11e000-0000-4000-8000-00000000000c')$$,
  array[0::bigint],
  'JOIN-19 et RIEN n''a été écrit chez le voisin ni chez l''organisation sans droit');

select throws_ok(
  $$select public.queue_join('4f11e000-0000-4000-8000-00000000000a',
      '4f11e000-0000-4000-8000-000000000301', 'pas-une-empreinte')$$,
  '22023',
  null,
  'JOIN-20 une empreinte malformée LÈVE : c''est un bogue d''appelant, pas un refus métier');
select throws_ok(
  $$select public.queue_join(null,
      '4f11e000-0000-4000-8000-000000000301', repeat('b2', 32))$$,
  '22023',
  null,
  'JOIN-21 l''organisation absente LÈVE, elle aussi');

-- ── L'adresse, son consentement, et le prénom ────────────────
select is(
  (public.queue_join('4f11e000-0000-4000-8000-00000000000a',
    '4f11e000-0000-4000-8000-000000000301', repeat('c1', 32),
    null, 'pas-une-adresse'))->>'state',
  'invalid_email',
  'JOIN-22 une adresse malformée est refusée AVANT le verrou');

-- SANS consentement : l'adresse n'est pas stockée du tout.
select is(
  (public.queue_join('4f11e000-0000-4000-8000-00000000000a',
    '4f11e000-0000-4000-8000-000000000301', repeat('c2', 32),
    null, 'sans@consentement.test', false))->>'state',
  'waiting',
  'JOIN-23 une adresse sans consentement n''empêche pas d''entrer');
select is(
  (select e.email from public.reservation_queue_entries e
    where e.player_key_hash = repeat('c2', 32)),
  null,
  'JOIN-24 … et elle n''est PAS conservée : sans consentement, aucune finalité');

select is(
  (public.queue_join('4f11e000-0000-4000-8000-00000000000a',
    '4f11e000-0000-4000-8000-000000000301', repeat('c3', 32),
    null, 'AVEC@Consentement.TEST', true))->>'state',
  'waiting',
  'JOIN-25 avec consentement, l''adresse entre');
select is(
  (select e.email from public.reservation_queue_entries e
    where e.player_key_hash = repeat('c3', 32)),
  'avec@consentement.test',
  'JOIN-26 … normalisée en minuscules');
select ok(
  (select e.consent_transactional_at is not null
     from public.reservation_queue_entries e
    where e.player_key_hash = repeat('c3', 32)),
  'JOIN-27 … et son consentement est daté — l''équivalence de la table l''exige');

-- LE PRÉNOM EST TRONQUÉ, JAMAIS REFUSÉ.
select is(
  (public.queue_join('4f11e000-0000-4000-8000-00000000000a',
    '4f11e000-0000-4000-8000-000000000301', repeat('c4', 32),
    repeat('Z', 60)))->>'state',
  'waiting',
  'JOIN-28 un prénom trop long ne fait PAS échouer l''entrée en file');
select is(
  (select pg_catalog.char_length(e.display_name)
     from public.reservation_queue_entries e
    where e.player_key_hash = repeat('c4', 32)),
  40,
  'JOIN-29 … il est tronqué à 40 caractères');
select is(
  (public.queue_join('4f11e000-0000-4000-8000-00000000000a',
    '4f11e000-0000-4000-8000-000000000305', repeat('c5', 32), '   '))->>'state',
  'waiting',
  'JOIN-30 un prénom vide de sens n''est pas un prénom : l''entrée passe');
select is(
  (select e.display_name from public.reservation_queue_entries e
    where e.player_key_hash = repeat('c5', 32)),
  null,
  'JOIN-31 … et il est rangé à `null`, pas à la chaîne vide');


-- ════════════════════════════════════════════════════════════
-- 2. LE RANG DESCEND SANS JAMAIS SAUTER
--
-- C'est le critère dur RES-3 : « le rang ne dépend ni d'un jeu, ni d'un
-- appareil, ni de l'heure de rafraîchissement ». Il n'est stocké nulle part :
-- personne n'a rien renuméroté entre ces deux blocs.
-- ════════════════════════════════════════════════════════════

-- Le PREMIER part de lui-même.
select is(
  (public.queue_leave(
    (select (j->>'entry_id')::uuid from fq1 where n = 1), repeat('a1', 32)))->>'state',
  'left',
  'RANG-1 le premier de la file part volontairement');

select is(
  (public.queue_public_state(
    '4f11e000-0000-4000-8000-000000000301', repeat('a2', 32)))->>'position',
  '1',
  'RANG-2 le 2e devient 1er');
select is(
  (public.queue_public_state(
    '4f11e000-0000-4000-8000-000000000301', repeat('a3', 32)))->>'position',
  '2',
  'RANG-3 le 3e devient 2e — pas de trou laissé par celui qui est parti');

-- LA SUITE COMPLÈTE DES RANGS, et c'est l'assertion qui mord : ni doublon, ni
-- trou, ni saut. Six personnes attendent dans Q1 à ce stade (a2, a3, c2, c3,
-- c4 — c1 a été refusée sur l'adresse, c5 est dans une autre file).
select is(
  (select pg_catalog.string_agg(
            public.queue_entry_position(e)::text, ',' order by e.created_at, e.id)
     from public.reservation_queue_entries e
    where e.queue_id = '4f11e000-0000-4000-8000-000000000301'
      and e.status = 'waiting'),
  '1,2,3,4,5',
  'RANG-4 la suite des rangs est EXACTEMENT 1..n : aucun trou, aucun doublon');

select is(
  (public.queue_leave(
    (select (j->>'entry_id')::uuid from fq1 where n = 1), repeat('a1', 32)))->>'state',
  'left',
  'RANG-5 repartir est idempotent');
select is(
  (select pg_catalog.count(*)::text from public.reservation_queue_entries e
    where e.player_key_hash = repeat('a1', 32) and e.status = 'left'),
  '1',
  'RANG-6 … et n''écrit pas une seconde fois');
select is(
  (public.queue_leave(
    '4f11e000-0000-4000-8000-0000000009ee', repeat('a1', 32)))->>'state',
  'unknown',
  'RANG-7 une entrée inconnue rend `unknown`');
select is(
  (public.queue_leave(
    (select (j->>'entry_id')::uuid from fq1 where n = 2), repeat('ff', 32)))->>'state',
  'unknown',
  'RANG-8 la BONNE entrée avec la MAUVAISE empreinte rend le même mot : la '
  'possession fait foi, et son absence n''apprend rien');


-- ════════════════════════════════════════════════════════════
-- 3. LE PLAFOND, ET SA RÉOUVERTURE
-- ════════════════════════════════════════════════════════════

create temporary table fq3 (n int, j jsonb);
-- Q5 est à DEUX ; `c5` en occupe déjà une (JOIN-30).
insert into fq3 values (1, public.queue_join(
  '4f11e000-0000-4000-8000-00000000000a',
  '4f11e000-0000-4000-8000-000000000305', repeat('d1', 32)));
insert into fq3 values (2, public.queue_join(
  '4f11e000-0000-4000-8000-00000000000a',
  '4f11e000-0000-4000-8000-000000000305', repeat('d2', 32)));

select is((select j->>'state' from fq3 where n = 1), 'waiting',
  'PLAF-1 la deuxième place de la file est donnée');
select is((select j->>'state' from fq3 where n = 2), 'queue_full',
  'PLAF-2 la troisième est refusée — et le refus est PROPRE, pas `unavailable` : '
  '« la file est pleine » est actionnable, « indisponible » ne l''est pas');
select is((select j->>'capacity' from fq3 where n = 2), '2',
  'PLAF-3 … et il dit le plafond, que le visiteur voit déjà en regardant la file');

select is(
  (public.queue_leave(
    (select (j->>'entry_id')::uuid from fq3 where n = 1), repeat('d1', 32)))->>'state',
  'left',
  'PLAF-4 quelqu''un part');
select is(
  (public.queue_join('4f11e000-0000-4000-8000-00000000000a',
    '4f11e000-0000-4000-8000-000000000305', repeat('d2', 32)))->>'state',
  'waiting',
  'PLAF-5 … et la place se rouvre, sans qu''aucun compteur n''ait été décrémenté');


-- ════════════════════════════════════════════════════════════
-- 4. DEUX APPELS NE PRENNENT JAMAIS LA MÊME PERSONNE
-- ════════════════════════════════════════════════════════════

create temporary table fq4 (n int, j jsonb);
insert into fq4 values (1, public.queue_join(
  '4f11e000-0000-4000-8000-00000000000a',
  '4f11e000-0000-4000-8000-000000000306', repeat('e1', 32), 'Un'));
insert into fq4 values (2, public.queue_join(
  '4f11e000-0000-4000-8000-00000000000a',
  '4f11e000-0000-4000-8000-000000000306', repeat('e2', 32), 'Deux'));
insert into fq4 values (3, public.queue_join(
  '4f11e000-0000-4000-8000-00000000000a',
  '4f11e000-0000-4000-8000-000000000306', repeat('e3', 32), 'Trois'));

-- LE CAISSIER APPELLE : c'est son poste, et c'est la différence avec
-- `evict_waitlist_entry`, qui l'exclut.
insert into fq4 values (10, public.queue_call_next(
  '4f11e000-0000-4000-8000-00000000000a',
  '4f11e000-0000-4000-8000-000000000306',
  '4f11e000-0000-4000-8000-000000000102'));
insert into fq4 values (11, public.queue_call_next(
  '4f11e000-0000-4000-8000-00000000000a',
  '4f11e000-0000-4000-8000-000000000306',
  '4f11e000-0000-4000-8000-000000000102'));

select is((select j->>'state' from fq4 where n = 10), 'called',
  'CALL-1 le caissier appelle le suivant — l''accueil est un geste de comptoir');
select is(
  (select j->>'entry_id' from fq4 where n = 10),
  (select j->>'entry_id' from fq4 where n = 1),
  'CALL-2 c''est le PREMIER de la file qui est appelé, pas un autre');
select isnt(
  (select j->>'entry_id' from fq4 where n = 11),
  (select j->>'entry_id' from fq4 where n = 10),
  'CALL-3 le SECOND appel prend quelqu''un d''AUTRE : le choix de la tête et son '
  'écriture sont un seul geste, sous verrou');
select is(
  (select j->>'entry_id' from fq4 where n = 11),
  (select j->>'entry_id' from fq4 where n = 2),
  'CALL-4 … et c''est le deuxième de la file, dans l''ordre');
select is((select j->>'display_name' from fq4 where n = 10), 'Un',
  'CALL-5 le prénom remonte au comptoir — c''est sa seule raison d''exister');

with k as (
  select pg_catalog.hashtextextended(
    'reservation_queue:' || '4f11e000-0000-4000-8000-00000000000a'
      || ':' || '4f11e000-0000-4000-8000-000000000306', 0) as v
)
select ok(
  exists (
    select 1 from pg_locks l, k
     where l.locktype = 'advisory'
       and l.objsubid = 1
       and l.classid::bigint = ((k.v >> 32) & 4294967295)
       and l.objid::bigint = (k.v & 4294967295)
  ),
  'CALL-6 l''appel prend LE MÊME verrou d''avis que l''entrée en file');

-- LE RANG DESCEND QUAND LE STAFF APPELLE : un appelé n'attend plus.
select is(
  (public.queue_public_state(
    '4f11e000-0000-4000-8000-000000000306', repeat('e3', 32)))->>'position',
  '1',
  'CALL-7 le 3e devient 1er quand les deux premiers sont appelés : les appelés '
  'ne comptent pas dans le rang');

select results_eq(
  $$select count(*) from public.audit_logs
     where organization_id = '4f11e000-0000-4000-8000-00000000000a'
       and action = 'reservation.queue_call'$$,
  array[2::bigint],
  'CALL-8 deux gestes réels, deux lignes d''audit');
select ok(
  not exists (
    select 1 from public.audit_logs
     where action = 'reservation.queue_call'
       and (metadata ? 'display_name' or metadata ? 'player_key_hash'
            or metadata ? 'email')),
  'CALL-9 l''audit retient l''entrée et sa file, JAMAIS le prénom ni l''empreinte');

-- La file VIDE, la file du VOISIN, et le non-membre.
select is(
  (public.queue_call_next('4f11e000-0000-4000-8000-00000000000a',
    '4f11e000-0000-4000-8000-000000000307',
    '4f11e000-0000-4000-8000-000000000101'))->>'state',
  'empty',
  'CALL-10 une file sans attente rend `empty`');
select is(
  (public.queue_call_next('4f11e000-0000-4000-8000-00000000000a',
    '4f11e000-0000-4000-8000-000000000351',
    '4f11e000-0000-4000-8000-000000000101'))->>'state',
  'unknown',
  'CALL-11 la file du VOISIN rend `unknown`');
select is(
  (public.queue_call_next('4f11e000-0000-4000-8000-00000000000a',
    '4f11e000-0000-4000-8000-0000000009ff',
    '4f11e000-0000-4000-8000-000000000101'))->>'state',
  'unknown',
  'CALL-12 … indistinctement d''une file inconnue');
select throws_ok(
  $$select public.queue_call_next('4f11e000-0000-4000-8000-00000000000a',
      '4f11e000-0000-4000-8000-000000000306',
      '4f11e000-0000-4000-8000-000000000104')$$,
  '42501',
  null,
  'CALL-13 un utilisateur qui n''est pas membre ne peut appelér personne');
select throws_ok(
  $$select public.queue_call_next('4f11e000-0000-4000-8000-00000000000a',
      '4f11e000-0000-4000-8000-000000000306',
      '4f11e000-0000-4000-8000-000000000103')$$,
  '42501',
  null,
  'CALL-14 … et le propriétaire du VOISIN pas davantage');

-- UNE FILE EN PAUSE APPELLE ENCORE : c'est tout le sens de la pause.
insert into public.reservation_queue_entries
  (id, queue_id, organization_id, player_key_hash, display_name)
values ('4f11e000-0000-4000-8000-000000000411',
        '4f11e000-0000-4000-8000-000000000304',
        '4f11e000-0000-4000-8000-00000000000a', repeat('e9', 32), 'Patient');
select is(
  (public.queue_call_next('4f11e000-0000-4000-8000-00000000000a',
    '4f11e000-0000-4000-8000-000000000304',
    '4f11e000-0000-4000-8000-000000000101'))->>'state',
  'called',
  'CALL-15 une file EN PAUSE n''accepte plus personne mais SERT ceux qui sont là');


-- ════════════════════════════════════════════════════════════
-- 5. ON NE RÉSOUT QUE CE QUI A ÉTÉ APPELÉ
-- ════════════════════════════════════════════════════════════

select is(
  (public.queue_resolve('4f11e000-0000-4000-8000-00000000000a',
    (select (j->>'entry_id')::uuid from fq4 where n = 3),
    '4f11e000-0000-4000-8000-000000000102', 'served'))->>'state',
  'not_called',
  'RES-1 servir quelqu''un qui n''a pas été appelé est refusé : cela sauterait '
  'le tour de tous ceux qui sont devant');
select is(
  (select e.status from public.reservation_queue_entries e
    where e.id = (select (j->>'entry_id')::uuid from fq4 where n = 3)),
  'waiting',
  'RES-2 … et rien n''a été écrit');

-- LA CONTRAINTE dit la même chose, sans passer par la RPC.
select throws_ok(
  $$update public.reservation_queue_entries
       set status = 'served', resolved_at = now()
     where player_key_hash = repeat('e3', 32)$$,
  '23514',
  null,
  'RES-3 la BASE refuse aussi un `served` sans appel : la garantie ne tient pas '
  'à la discipline de la RPC');

select is(
  (public.queue_resolve('4f11e000-0000-4000-8000-00000000000a',
    (select (j->>'entry_id')::uuid from fq4 where n = 1),
    '4f11e000-0000-4000-8000-000000000102', 'served'))->>'state',
  'served',
  'RES-4 une entrée APPELÉE se sert');
select is(
  (public.queue_resolve('4f11e000-0000-4000-8000-00000000000a',
    (select (j->>'entry_id')::uuid from fq4 where n = 2),
    '4f11e000-0000-4000-8000-000000000102', 'no_show'))->>'state',
  'no_show',
  'RES-5 … ou se marque absente');

-- IDEMPOTENCE, et l'audit ne double pas.
select is(
  (public.queue_resolve('4f11e000-0000-4000-8000-00000000000a',
    (select (j->>'entry_id')::uuid from fq4 where n = 1),
    '4f11e000-0000-4000-8000-000000000102', 'served'))->>'state',
  'served',
  'RES-6 rejouer la résolution rend la même chose');
select is(
  (public.queue_resolve('4f11e000-0000-4000-8000-00000000000a',
    (select (j->>'entry_id')::uuid from fq4 where n = 1),
    '4f11e000-0000-4000-8000-000000000102', 'no_show'))->>'state',
  'served',
  'RES-7 … et une SECONDE issue ne réécrit pas la première : le comptoir a '
  'tranché une fois');
select results_eq(
  $$select count(*) from public.audit_logs
     where organization_id = '4f11e000-0000-4000-8000-00000000000a'
       and action = 'reservation.queue_resolve'$$,
  array[2::bigint],
  'RES-8 deux gestes réels, deux lignes d''audit — les rejeux n''en ajoutent pas');

select throws_ok(
  $$select public.queue_resolve('4f11e000-0000-4000-8000-00000000000a',
      '4f11e000-0000-4000-8000-000000000411',
      '4f11e000-0000-4000-8000-000000000101', 'peut-etre')$$,
  '22023',
  null,
  'RES-9 une issue hors vocabulaire LÈVE : c''est un bogue d''appelant');
select is(
  (public.queue_resolve('4f11e000-0000-4000-8000-00000000000a',
    '4f11e000-0000-4000-8000-0000000009dd',
    '4f11e000-0000-4000-8000-000000000101', 'served'))->>'state',
  'unknown',
  'RES-10 une entrée inconnue rend `unknown`');


-- ════════════════════════════════════════════════════════════
-- 6. REOPEN REMET EN TÊTE — SANS RIEN RENUMÉROTER
--
-- Le cas qui compte : quelqu'un rejoint la file ENTRE l'appel et la correction.
-- L'entrée rouverte doit quand même repasser devant lui, parce que son
-- `created_at` lui est antérieur — et non parce qu'on aurait décalé les rangs.
-- ════════════════════════════════════════════════════════════

create temporary table fq6 (n int, j jsonb);
insert into fq6 values (1, public.queue_join(
  '4f11e000-0000-4000-8000-00000000000a',
  '4f11e000-0000-4000-8000-000000000307', repeat('f1', 32), 'Première'));
insert into fq6 values (2, public.queue_call_next(
  '4f11e000-0000-4000-8000-00000000000a',
  '4f11e000-0000-4000-8000-000000000307',
  '4f11e000-0000-4000-8000-000000000102'));
-- Quelqu'un arrive PENDANT que la première est au comptoir.
insert into fq6 values (3, public.queue_join(
  '4f11e000-0000-4000-8000-00000000000a',
  '4f11e000-0000-4000-8000-000000000307', repeat('f2', 32), 'Survenue'));
select is((select j->>'position' from fq6 where n = 3), '1',
  'REOP-1 la nouvelle venue est 1re tant que la première est appelée');

insert into fq6 values (4, public.queue_reopen_entry(
  '4f11e000-0000-4000-8000-00000000000a',
  (select (j->>'entry_id')::uuid from fq6 where n = 1),
  '4f11e000-0000-4000-8000-000000000102'));

select is((select j->>'state' from fq6 where n = 4), 'waiting',
  'REOP-2 le staff s''est trompé : l''entrée appelée redevient en attente');
select is((select j->>'position' from fq6 where n = 4), '1',
  'REOP-3 … EN TÊTE, devant celle qui est arrivée entre-temps');
select is(
  (public.queue_public_state(
    '4f11e000-0000-4000-8000-000000000307', repeat('f2', 32)))->>'position',
  '2',
  'REOP-4 … et la nouvelle venue repasse 2e, sans qu''aucun rang n''ait été écrit');
select is(
  (select e.called_at from public.reservation_queue_entries e
    where e.player_key_hash = repeat('f1', 32)),
  null,
  'REOP-5 l''horodatage de l''appel est effacé : une entrée qui attend n''a pas '
  'd''appel en cours (la contrainte l''exigerait de toute façon)');

select is((public.queue_reopen_entry(
    '4f11e000-0000-4000-8000-00000000000a',
    (select (j->>'entry_id')::uuid from fq6 where n = 1),
    '4f11e000-0000-4000-8000-000000000102'))->>'state',
  'waiting',
  'REOP-6 rejouer la correction est idempotent');
select results_eq(
  $$select count(*) from public.audit_logs
     where organization_id = '4f11e000-0000-4000-8000-00000000000a'
       and action = 'reservation.queue_reopen'$$,
  array[1::bigint],
  'REOP-7 … et n''ajoute pas de ligne d''audit');

-- ON NE ROUVRE PAS UNE ISSUE CONSTATÉE.
select is(
  (public.queue_reopen_entry('4f11e000-0000-4000-8000-00000000000a',
    (select (j->>'entry_id')::uuid from fq4 where n = 2),
    '4f11e000-0000-4000-8000-000000000102'))->>'state',
  'no_show',
  'REOP-8 une absence CONSTATÉE est rendue telle quelle : on ne l''efface pas');
select is(
  (select e.status from public.reservation_queue_entries e
    where e.id = (select (j->>'entry_id')::uuid from fq4 where n = 2)),
  'no_show',
  'REOP-9 … et la ligne n''a pas bougé');
select is(
  (public.queue_reopen_entry('4f11e000-0000-4000-8000-00000000000a',
    '4f11e000-0000-4000-8000-0000000009cc',
    '4f11e000-0000-4000-8000-000000000101'))->>'state',
  'unknown',
  'REOP-10 une entrée inconnue rend `unknown`');


-- ════════════════════════════════════════════════════════════
-- 7. L'ÉTAT PUBLIC : LE RANG, ET RIEN QUE CE QU'IL FAUT
-- ════════════════════════════════════════════════════════════

-- L'ENSEMBLE EXACT DES CLÉS. C'est l'assertion qui garde le critère « aucun ETA
-- tant qu'il n'est pas fiable » : le jour où une estimation apparaîtra dans ce
-- document, ce fichier rougira — ce qui est le but. Une estimation doit être
-- une décision produit écrite, pas un glissement.
select is(
  (select pg_catalog.string_agg(t.k, ',' order by t.k)
     from pg_catalog.jsonb_object_keys(
       public.queue_public_state(
         '4f11e000-0000-4000-8000-000000000301', repeat('a2', 32))) as t(k)),
  'called_at,entry_id,joined_at,position,queue_name,queue_status,state,status,waiting_count',
  'PUB-1 le document public ne porte AUCUN ETA, AUCUNE durée, AUCUNE heure de '
  'passage — et cette liste de clés est close');

select is(
  (public.queue_public_state(
    '4f11e000-0000-4000-8000-000000000301', repeat('a2', 32)))->>'state',
  'in_queue',
  'PUB-2 une identité dans la file reçoit son état');
select is(
  (public.queue_public_state(
    '4f11e000-0000-4000-8000-000000000301', repeat('bb', 32)))->>'state',
  'not_in_queue',
  'PUB-3 une identité qui n''y est pas le sait, et voit la taille de la file');
select is(
  (public.queue_public_state(
    '4f11e000-0000-4000-8000-0000000009ff', repeat('a2', 32)))->>'state',
  'unavailable',
  'PUB-4 une file inconnue rend `unavailable`');

-- AUCUNE IDENTITÉ D'AUTRUI. Le document ne contient ni prénom, ni empreinte, ni
-- adresse — les siennes comprises.
select ok(
  (public.queue_public_state(
    '4f11e000-0000-4000-8000-000000000301', repeat('a2', 32)))::text
    not like '%Chlo%',
  'PUB-5 la réponse ne nomme AUCUN autre client : la page d''attente n''est pas '
  'un annuaire de qui est dans le magasin');
select ok(
  (public.queue_public_state(
    '4f11e000-0000-4000-8000-000000000301', repeat('c3', 32)))::text
    not like '%avec@consentement.test%',
  'PUB-6 … ni l''adresse de l''appelant, qu''il a déjà');
select ok(
  (public.queue_public_state(
    '4f11e000-0000-4000-8000-000000000301', repeat('a2', 32)))::text
    not like '%' || repeat('a2', 32) || '%',
  'PUB-7 … ni son empreinte, qui est la clé d''accès elle-même');

-- L'APPEL PRIME : il voyage sur LE MÊME document que le rang, sans second appel.
select is(
  (public.queue_public_state(
    '4f11e000-0000-4000-8000-000000000306', repeat('e3', 32)))->>'status',
  'waiting',
  'PUB-8 celui qui attend voit `waiting`');
insert into fq4 values (20, public.queue_call_next(
  '4f11e000-0000-4000-8000-00000000000a',
  '4f11e000-0000-4000-8000-000000000306',
  '4f11e000-0000-4000-8000-000000000102'));
select is(
  (public.queue_public_state(
    '4f11e000-0000-4000-8000-000000000306', repeat('e3', 32)))->>'status',
  'called',
  'PUB-9 dès qu''il est appelé, son propre document le dit — l''écran bascule '
  'sans rien aller chercher ailleurs');
select ok(
  (public.queue_public_state(
    '4f11e000-0000-4000-8000-000000000306', repeat('e3', 32)))->>'called_at'
    is not null,
  'PUB-10 … avec l''instant de l''appel');
select is(
  (public.queue_public_state(
    '4f11e000-0000-4000-8000-000000000306', repeat('e3', 32)))->>'position',
  null,
  'PUB-11 … et SANS rang : un appelé n''attend plus, et « 0e » n''est pas un rang');

select throws_ok(
  $$select public.queue_public_state(
      '4f11e000-0000-4000-8000-000000000301', 'pas-une-empreinte')$$,
  '22023',
  null,
  'PUB-12 une empreinte malformée LÈVE — c''est aussi ce qui rend une ligne '
  'purgée inatteignable');


-- ════════════════════════════════════════════════════════════
-- 8. L'ÉCRAN DU STAFF ET LES COMPTEURS DU JOUR
-- ════════════════════════════════════════════════════════════

-- Q7 (« Comptée ») porte : `f1` en attente (rouverte), `f2` en attente. On y
-- ajoute une issue de CHAQUE sorte, plus une résolution D'AVANT-HIER qui ne doit
-- PAS être comptée.
insert into public.reservation_queue_entries
  (id, queue_id, organization_id, player_key_hash, display_name,
   status, called_at, resolved_at)
values
  ('4f11e000-0000-4000-8000-000000000501',
   '4f11e000-0000-4000-8000-000000000307', '4f11e000-0000-4000-8000-00000000000a',
   repeat('91', 32), 'Servie', 'served', now() - interval '1 hour', now()),
  ('4f11e000-0000-4000-8000-000000000502',
   '4f11e000-0000-4000-8000-000000000307', '4f11e000-0000-4000-8000-00000000000a',
   repeat('92', 32), 'Absente', 'no_show', now() - interval '1 hour', now()),
  ('4f11e000-0000-4000-8000-000000000503',
   '4f11e000-0000-4000-8000-000000000307', '4f11e000-0000-4000-8000-00000000000a',
   repeat('93', 32), 'Partie', 'left', null, now()),
  -- AVANT-HIER : hors du jour civil du commerçant, quelle que soit l'heure
  -- d'exécution du test.
  ('4f11e000-0000-4000-8000-000000000504',
   '4f11e000-0000-4000-8000-000000000307', '4f11e000-0000-4000-8000-00000000000a',
   repeat('94', 32), 'Servie hier', 'served',
   now() - interval '2 days', now() - interval '2 days');

create temporary table fq8 (n int, j jsonb);
insert into fq8 values (1, public.queue_staff_state(
  '4f11e000-0000-4000-8000-00000000000a',
  '4f11e000-0000-4000-8000-000000000307'));

select is(
  (select pg_catalog.string_agg(t.k, ',' order by t.k)
     from pg_catalog.jsonb_object_keys((select j from fq8 where n = 1)) as t(k)),
  'entries,live,queue,state,timezone,today',
  'STAFF-1 l''écran d''accueil porte la file, ses entrées vivantes, les '
  'compteurs vivants et ceux du jour — et rien d''autre');

select is((select j->'today'->>'served' from fq8 where n = 1), '1',
  'STAFF-2 un servi AUJOURD''HUI est compté');
select is((select j->'today'->>'no_show' from fq8 where n = 1), '1',
  'STAFF-3 une absence aussi — et elle n''entraîne AUCUNE pénalité');
select is((select j->'today'->>'left' from fq8 where n = 1), '1',
  'STAFF-4 un abandon aussi : c''est la mesure que RES-3 promet au commerçant');
select is((select j->'live'->>'waiting' from fq8 where n = 1), '2',
  'STAFF-5 les deux entrées vivantes sont comptées à part des issues');
select is((select j->'queue'->>'activity_name' from fq8 where n = 1), null,
  'STAFF-6 une file « Comptoir » n''a pas d''activité, et cela se lit');

-- LE JOUR EST CELUI DU FUSEAU DE L'ORGANISATION : la résolution d'avant-hier
-- n'entre dans aucun compteur.
select is(
  (select ((j->'today'->>'served')::int + (j->'today'->>'no_show')::int
           + (j->'today'->>'left')::int)::text from fq8 where n = 1),
  '3',
  'STAFF-7 quatre issues en base, TROIS comptées : celle d''avant-hier n''est '
  'pas du jour');

-- LES ENTRÉES : ordre, prénom, rang. LA MÊME formule de rang que l'écran joueur.
select is(
  (select pg_catalog.string_agg(e->>'display_name', ',')
     from pg_catalog.jsonb_array_elements((select j->'entries' from fq8 where n = 1)) e),
  'Première,Survenue',
  'STAFF-8 les entrées vivantes sortent DANS L''ORDRE DE LA FILE');
select is(
  (select pg_catalog.string_agg(e->>'position', ',')
     from pg_catalog.jsonb_array_elements((select j->'entries' from fq8 where n = 1)) e),
  '1,2',
  'STAFF-9 … avec le MÊME rang que celui annoncé au joueur');
select ok(
  (select j from fq8 where n = 1)::text not like '%@%',
  'STAFF-10 aucune adresse ne sort de l''écran d''accueil');

select is(
  (public.queue_staff_state('4f11e000-0000-4000-8000-00000000000a',
    '4f11e000-0000-4000-8000-000000000351'))->>'state',
  'unknown',
  'STAFF-11 la file du VOISIN rend `unknown`');
select is(
  (public.queue_staff_state('4f11e000-0000-4000-8000-00000000000a',
    '4f11e000-0000-4000-8000-0000000009ff'))->>'state',
  'unknown',
  'STAFF-12 … indistinctement d''une file inconnue');


-- ════════════════════════════════════════════════════════════
-- 9. ACL, RLS ET GRANTS DE COLONNES
-- ════════════════════════════════════════════════════════════

select ok(
  (select relrowsecurity from pg_class
    where oid = 'public.reservation_queues'::regclass),
  'ACL-1 la RLS est active sur les files');
select ok(
  (select relrowsecurity from pg_class
    where oid = 'public.reservation_queue_entries'::regclass),
  'ACL-2 la RLS est active sur les entrées');

select ok(not has_table_privilege('anon', 'public.reservation_queues', 'SELECT'),
  'ACL-3 anon ne lit pas les files');
select ok(not has_table_privilege('anon', 'public.reservation_queue_entries', 'SELECT'),
  'ACL-4 anon ne lit pas les entrées');
select ok(not has_table_privilege('authenticated', 'public.reservation_queue_entries', 'INSERT'),
  'ACL-5 le commerçant ne s''insère pas dans une file par PostgREST');
select ok(not has_table_privilege('authenticated', 'public.reservation_queue_entries', 'UPDATE'),
  'ACL-6 … ni ne réordonne la file par un update direct');
select ok(not has_table_privilege('authenticated', 'public.reservation_queue_entries', 'DELETE'),
  'ACL-7 … ni n''efface une entrée');
select ok(not has_table_privilege('authenticated', 'public.reservation_queues', 'DELETE'),
  'ACL-8 … ni la file elle-même : la cascade emporterait les compteurs du jour');

select ok(not has_column_privilege('authenticated', 'public.reservation_queue_entries', 'email', 'SELECT'),
  'ACL-9 l''adresse est hors du grant de colonnes');
select ok(not has_column_privilege('authenticated', 'public.reservation_queue_entries', 'display_name', 'SELECT'),
  'ACL-10 le prénom aussi : il n''a de sens que dans queue_staff_state, ordonné '
  'en face du bon rang');
select ok(has_column_privilege('authenticated', 'public.reservation_queue_entries', 'status', 'SELECT'),
  'ACL-11 … mais le statut reste lisible');

select ok(has_function_privilege('service_role', 'public.queue_join(uuid,uuid,text,text,text,boolean)', 'EXECUTE'),
  'ACL-12 seul le serveur fait entrer quelqu''un dans une file');
select ok(not has_function_privilege('authenticated', 'public.queue_join(uuid,uuid,text,text,text,boolean)', 'EXECUTE'),
  'ACL-13 la session marchande ne forge pas un rang');
select ok(not has_function_privilege('anon', 'public.queue_join(uuid,uuid,text,text,text,boolean)', 'EXECUTE'),
  'ACL-14 anon non plus');
select ok(not has_function_privilege('authenticated', 'public.queue_call_next(uuid,uuid,text)', 'EXECUTE'),
  'ACL-15 la session marchande ne contourne ni la garde de rôle ni l''audit');
select ok(not has_function_privilege('anon', 'public.queue_resolve(uuid,uuid,text,text)', 'EXECUTE'),
  'ACL-16 anon ne marque personne absent');
select ok(not has_function_privilege('authenticated', 'public.queue_public_state(uuid,text)', 'EXECUTE'),
  'ACL-17 la session marchande n''énumère pas les files d''un joueur par la RPC publique');

-- LA FORMULE DU RANG N'EST EXÉCUTABLE PAR PERSONNE, `service_role` COMPRIS.
-- Les privilèges par défaut de Supabase servent `execute` à `service_role` sur
-- toute fonction neuve de `public` : s'arrêter à `public, anon, authenticated`
-- l'aurait laissée ouverte à l'application. Motif `reservation_offer_next`.
select ok(
  not has_function_privilege('service_role',
    'public.queue_entry_position(public.reservation_queue_entries)', 'EXECUTE'),
  'ACL-18 la formule du rang n''est ouverte à AUCUN rôle applicatif, '
  'service_role compris : ses appelants la détiennent par possession');
select ok(
  not has_function_privilege('authenticated',
    'public.queue_entry_position(public.reservation_queue_entries)', 'EXECUTE'),
  'ACL-19 … ni à la session marchande');


-- ════════════════════════════════════════════════════════════
-- 10. LA PURGE EFFACE LA PERSONNE, PAS L'HISTOIRE DE LA FILE
-- ════════════════════════════════════════════════════════════

-- QUATRE entrées de plus de 400 jours : une SERVIE — l'histoire du remplissage
-- que le commerçant garde — une restée « en attente », une restée « appelée »,
-- et une dernière qui tient à elle seule le plafond d'une file. Les trois
-- vivantes sont le cas que le filtre de la purge vise nommément : une entrée
-- toujours `waiting` treize mois après n'est pas quelqu'un qui attend, c'est une
-- ligne oubliée, et sa donnée personnelle a la même échéance que celle des
-- autres. C'est aussi elle qui permet de prouver que l'ANCIENNE CLÉ CESSE
-- D'OUVRIR — ce qu'une entrée déjà résolue n'aurait pas pu montrer, n'étant plus
-- lisible de toute façon.
insert into public.reservation_queue_entries
  (id, queue_id, organization_id, player_key_hash, display_name,
   email, consent_transactional_at, status, called_at, resolved_at, created_at)
values
  ('4f11e000-0000-4000-8000-000000000601',
   '4f11e000-0000-4000-8000-000000000308', '4f11e000-0000-4000-8000-00000000000a',
   repeat('7a', 32), 'Ancienne', 'ancienne@purge.test', now() - interval '400 days',
   'served', now() - interval '400 days', now() - interval '400 days',
   now() - interval '400 days'),
  ('4f11e000-0000-4000-8000-000000000602',
   '4f11e000-0000-4000-8000-000000000308', '4f11e000-0000-4000-8000-00000000000a',
   repeat('7b', 32), 'Oubliée', 'oubliee@purge.test', now() - interval '400 days',
   'waiting', null, null, now() - interval '400 days'),
  -- APPELÉE ET JAMAIS RÉSOLUE : le comptoir a crié un nom, puis la journée s'est
  -- terminée. Elle occupe une ligne du plafond au même titre qu'une attente —
  -- `queue_join` compte `waiting` ET `called`.
  ('4f11e000-0000-4000-8000-000000000603',
   '4f11e000-0000-4000-8000-000000000308', '4f11e000-0000-4000-8000-00000000000a',
   repeat('7c', 32), 'Appelée', null, null,
   'called', now() - interval '399 days', null, now() - interval '400 days'),
  -- CELLE QUI TIENT LE PLAFOND de la file 309, à elle seule.
  ('4f11e000-0000-4000-8000-000000000604',
   '4f11e000-0000-4000-8000-000000000309', '4f11e000-0000-4000-8000-00000000000a',
   repeat('7d', 32), 'Fantôme', null, null,
   'waiting', null, null, now() - interval '400 days');

select is(
  (public.queue_public_state(
    '4f11e000-0000-4000-8000-000000000308', repeat('7b', 32)))->>'state',
  'in_queue',
  'PURG-0 avant la purge, l''ancienne clé ouvre bien l''entrée');

-- LE BOGUE, MONTRÉ AVANT D'ÊTRE CORRIGÉ : la file 309 refuse une vraie personne
-- parce qu'une entrée de treize mois occupe sa seule ligne.
select is(
  (public.queue_join(
    '4f11e000-0000-4000-8000-00000000000a',
    '4f11e000-0000-4000-8000-000000000309', repeat('7e', 32), 'Tardif'))->>'state',
  'queue_full',
  'PURG-0a avant la purge, l''entrée oubliée occupe la seule ligne de la file');

select is(
  (select count(*)::text from public.purge_expired_personal_data()), '1',
  'PURG-1 la purge tourne');

select is(
  (select e.display_name from public.reservation_queue_entries e
    where e.id = '4f11e000-0000-4000-8000-000000000601'),
  null,
  'PURG-2 le PRÉNOM part : c''est la donnée la plus directement identifiante');
select is(
  (select e.email from public.reservation_queue_entries e
    where e.id = '4f11e000-0000-4000-8000-000000000601'),
  null,
  'PURG-3 l''adresse part');
select is(
  (select e.consent_transactional_at from public.reservation_queue_entries e
    where e.id = '4f11e000-0000-4000-8000-000000000601'),
  null,
  'PURG-4 … et son consentement avec, d''un seul geste');
select is(
  (select e.player_key_hash from public.reservation_queue_entries e
    where e.id = '4f11e000-0000-4000-8000-000000000601'),
  'purge:4f11e000-0000-4000-8000-000000000601',
  'PURG-5 l''empreinte est remplacée par un MARQUEUR, hors de l''espace des '
  'empreintes — et non par une valeur dérivable de l''identifiant, qui resterait '
  'un authentifiant public');
select is(
  (select e.status from public.reservation_queue_entries e
    where e.id = '4f11e000-0000-4000-8000-000000000601'),
  'served',
  'PURG-6 la LIGNE reste, et son issue avec : le remplissage appartient au '
  'commerçant, pas à la personne');

-- REJEU : rien ne bouge.
select is(
  (select count(*)::text from public.purge_expired_personal_data()), '1',
  'PURG-7 la purge se rejoue');
select is(
  (select e.player_key_hash from public.reservation_queue_entries e
    where e.id = '4f11e000-0000-4000-8000-000000000601'),
  'purge:4f11e000-0000-4000-8000-000000000601',
  'PURG-8 … sans rien réécrire : le garde `not like` rend le passage idempotent');

-- L'ENTRÉE OUBLIÉE : sa donnée personnelle part comme celle des autres, ET son
-- attente est CLOSE. Sans cette clôture, la ligne serait restée `waiting` pour
-- toujours — son empreinte n'est plus une empreinte, donc `queue_leave` ne
-- l'atteint plus, et rien d'autre ne pouvait la libérer. `left` et non
-- `no_show` : marquer une absence est une affirmation sur une personne, et elle
-- doit porter un auteur (section 8) — une purge n'en a pas.
select is(
  (select e.status from public.reservation_queue_entries e
    where e.id = '4f11e000-0000-4000-8000-000000000602'),
  'left',
  'PURG-9 la purge FERME l''entrée oubliée : elle cesse d''occuper une ligne du '
  'plafond, qu''aucun geste ne pouvait plus libérer');
select is(
  (select e.resolved_at from public.reservation_queue_entries e
    where e.id = '4f11e000-0000-4000-8000-000000000602'),
  (select e.created_at from public.reservation_queue_entries e
    where e.id = '4f11e000-0000-4000-8000-000000000602'),
  'PURG-9a … datée du DERNIER INSTANT CONNU de l''entrée, jamais de l''instant '
  'du cron : sinon les compteurs du jour annonceraient des abandons de treize mois');
select is(
  (select e.status || ' ' || (e.resolved_at = e.called_at)::text
     from public.reservation_queue_entries e
    where e.id = '4f11e000-0000-4000-8000-000000000603'),
  'left true',
  'PURG-9b l''entrée APPELÉE et jamais résolue est fermée elle aussi — elle '
  'occupait une ligne du plafond au même titre — et datée de son appel');
select is(
  (select e.display_name || coalesce(e.email, '') from public.reservation_queue_entries e
    where e.id = '4f11e000-0000-4000-8000-000000000602'),
  null,
  'PURG-10 … mais son prénom et son adresse sont partis');

-- ET L'ANCIENNE CLÉ N'OUVRE PLUS RIEN — c'est ce que le MARQUEUR garantit, là
-- où une empreinte dérivée de l'identifiant serait restée recalculable par
-- quiconque lit l'`id`, donc serait restée un authentifiant.
select is(
  (public.queue_public_state(
    '4f11e000-0000-4000-8000-000000000308', repeat('7b', 32)))->>'state',
  'not_in_queue',
  'PURG-11 l''ancienne empreinte n''ouvre plus l''entrée');
-- La preuve du MARQUEUR SEUL, indépendante de l'état : `queue_leave` ne filtre
-- pas sur le statut — il ne refuse que sur la forme de l'empreinte. Motif
-- `PURGE-4` de reserver.test.sql.
select is(
  (public.queue_leave(
    '4f11e000-0000-4000-8000-000000000602', repeat('7b', 32)))->>'state',
  'unknown',
  'PURG-11a … et le marqueur suffit à le garantir, sans rien devoir au statut');

-- LE PLAFOND EST RENDU. C'est le bogue, pris par l'autre bout : la file 309
-- refusait une vraie personne (PURG-0a) au nom d'une entrée dont la donnée
-- personnelle venait d'être effacée. Après la purge, elle l'accepte, en 1re.
select is(
  (public.queue_join(
    '4f11e000-0000-4000-8000-00000000000a',
    '4f11e000-0000-4000-8000-000000000309', repeat('7e', 32), 'Tardif'))->>'state',
  'waiting',
  'PURG-12 la ligne du plafond est RENDUE : la file accepte de nouveau');
select is(
  (public.queue_public_state(
    '4f11e000-0000-4000-8000-000000000309', repeat('7e', 32)))->>'position',
  '1',
  'PURG-12a … et le nouvel arrivant est 1er : le fantôme ne compte plus dans le rang');

-- LES COMPTEURS DU JOUR N'ONT PAS BOUGÉ. Trois entrées viennent d'être fermées
-- dans la file 308, et l'écran d'accueil du commerçant n'en montre AUCUNE :
-- c'est exactement ce que le choix de `resolved_at` protège.
select is(
  (public.queue_staff_state(
    '4f11e000-0000-4000-8000-00000000000a',
    '4f11e000-0000-4000-8000-000000000308'))->'today'->>'left',
  '0',
  'PURG-13 la purge n''INVENTE aucun abandon du jour');
select is(
  (public.queue_staff_state(
    '4f11e000-0000-4000-8000-00000000000a',
    '4f11e000-0000-4000-8000-000000000308'))->'live'->>'waiting',
  '0',
  'PURG-13a … et plus rien ne compte comme vivant dans la file purgée');

select * from finish();
rollback;
