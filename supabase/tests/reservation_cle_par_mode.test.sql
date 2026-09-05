-- ============================================================
-- RDV-7 — LA CLÉ DE DROIT SUIT LE `booking_mode` (20261206120000)
--
-- Ce que ce fichier garde : « Réservation » (`rendez_vous`) se vend SEUL, et
-- « Moments » (`reserver`) aussi. Avant ce lot, une salle achetée seule restait
-- fermée par cinq RPC qui exigeaient `reserver` en dur, quel que soit le mode
-- de l'activité qu'elles touchaient.
--
-- ── LA MATRICE, DANS LES DEUX SENS ──
--
-- Un test qui ne prouve qu'une direction laisse passer la garde qui dit
-- toujours oui. Les quatre organisations couvrent donc les quatre états du
-- couple de droits, et chacune est interrogée sur les DEUX modes :
--
--            reserver | rendez_vous | activité `moment` | activité `rendez_vous`
--   SALLE       non   |     oui     |      refusée      |        acceptée
--   MOMENTS     oui   |     non     |     acceptée      |        refusée
--   LES DEUX    oui   |     oui     |     acceptée      |        acceptée
--   AUCUN       non   |     non     |      refusée      |        refusée
--
-- ── ET LE CONTRÔLE DE PORTÉE, PARCE QUE `unavailable` EST MUET ──
--
-- Les six refus de ces RPC rendent tous le même mot : un test qui se contente
-- de le lire serait vert le jour où l'activité, le créneau ou l'organisation
-- deviendrait faux pour une tout autre raison. §6 repose donc le droit
-- manquant et rejoue LA MÊME demande — c'est la seule preuve que c'était bien
-- lui qui refusait.
--
-- ── §8 REMPLACE UN INVARIANT DE MIGRATION ──
--
-- 20261020120000 §9 comptait « treize fonctions gardent `reserver` » pour
-- prouver que ses substitutions avaient porté. Une assertion de migration ne
-- s'exécute qu'une fois, à son propre instant : celle-ci est rejouée à chaque
-- passage de CI, et elle NOMME au lieu de compter — un compte reste vert quand
-- une fonction sort de l'ensemble et qu'une autre y entre.
--
-- ── LES INSTANTS SONT RELATIFS ──
--
-- Tout est ancré sur `now()` : les créneaux doivent être FUTURS, les deux RPC
-- de réservation refusant le passé.
-- ============================================================
begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

select set_config('request.jwt.claims', '{"role":"service_role"}', true);

-- ── Fixtures ─────────────────────────────────────────────────
--
-- QUATRE organisations rigoureusement identiques hors leurs octrois : même
-- offre, même statut d'abonnement, mêmes activités, mêmes créneaux. C'est ce
-- qui permet de dire que la seule variable est le droit.

insert into public.organizations
  (id, name, slug, subscription_status, plan, timezone, data_retention_months)
values
  ('c1e50000-0000-4000-8000-00000000000a', 'Salle seule', 'tap-cle-a',
   'active', 'starter', 'Europe/Paris', 6),
  ('c1e50000-0000-4000-8000-00000000000b', 'Moments seuls', 'tap-cle-b',
   'active', 'starter', 'Europe/Paris', 6),
  ('c1e50000-0000-4000-8000-00000000000c', 'Les deux', 'tap-cle-c',
   'active', 'starter', 'Europe/Paris', 6),
  ('c1e50000-0000-4000-8000-00000000000d', 'Ni l''un ni l''autre', 'tap-cle-d',
   'active', 'starter', 'Europe/Paris', 6);

-- AUCUN OCTROI `vitrine` NULLE PART, et c'est délibéré : si l'une des huit
-- portes retombait sur la clé qu'elles portaient toutes avant 20261020120000,
-- ce fichier le verrait. D détient l'abonnement et rien d'autre.
insert into public.organization_module_grants
  (organization_id, module, kind, source, starts_at, ends_at)
values
  ('c1e50000-0000-4000-8000-00000000000a', 'rendez_vous', 'pass', 'backoffice',
   now() - interval '1 day', now() + interval '365 days'),
  ('c1e50000-0000-4000-8000-00000000000b', 'reserver', 'pass', 'backoffice',
   now() - interval '1 day', now() + interval '365 days'),
  ('c1e50000-0000-4000-8000-00000000000c', 'reserver', 'pass', 'backoffice',
   now() - interval '1 day', now() + interval '365 days'),
  ('c1e50000-0000-4000-8000-00000000000c', 'rendez_vous', 'pass', 'backoffice',
   now() - interval '1 day', now() + interval '365 days');

-- DEUX ACTIVITÉS PAR ORGANISATION : un Moment (le `booking_mode` par défaut)
-- et une salle.
insert into public.reservation_activities
  (id, organization_id, name, active, booking_mode,
   duration_minutes, slot_capacity, booking_horizon_days, lead_time_minutes,
   table_turn_minutes)
values
  ('c1e50000-0000-4000-8000-0000000002a1',
   'c1e50000-0000-4000-8000-00000000000a', 'Atelier', true, 'moment',
   null, null, 30, 0, null),
  ('c1e50000-0000-4000-8000-0000000002a2',
   'c1e50000-0000-4000-8000-00000000000a', 'Service du soir', true,
   'rendez_vous', 15, 40, 28, 0, 90),
  ('c1e50000-0000-4000-8000-0000000002b1',
   'c1e50000-0000-4000-8000-00000000000b', 'Atelier', true, 'moment',
   null, null, 30, 0, null),
  ('c1e50000-0000-4000-8000-0000000002b2',
   'c1e50000-0000-4000-8000-00000000000b', 'Service du soir', true,
   'rendez_vous', 15, 40, 28, 0, 90),
  ('c1e50000-0000-4000-8000-0000000002c1',
   'c1e50000-0000-4000-8000-00000000000c', 'Atelier', true, 'moment',
   null, null, 30, 0, null),
  ('c1e50000-0000-4000-8000-0000000002c2',
   'c1e50000-0000-4000-8000-00000000000c', 'Service du soir', true,
   'rendez_vous', 15, 40, 28, 0, 90),
  ('c1e50000-0000-4000-8000-0000000002d1',
   'c1e50000-0000-4000-8000-00000000000d', 'Atelier', true, 'moment',
   null, null, 30, 0, null),
  ('c1e50000-0000-4000-8000-0000000002d2',
   'c1e50000-0000-4000-8000-00000000000d', 'Service du soir', true,
   'rendez_vous', 15, 40, 28, 0, 90);

-- Une table de quatre par salle : `reserve_table` refuse `full` sans table
-- assez grande, et ce refus-là porte le même mot que celui du droit.
insert into public.reservation_tables
  (id, activity_id, organization_id, name, seats)
values
  ('c1e50000-0000-4000-8000-0000000003a1',
   'c1e50000-0000-4000-8000-0000000002a2',
   'c1e50000-0000-4000-8000-00000000000a', 'T1', 4),
  ('c1e50000-0000-4000-8000-0000000003b1',
   'c1e50000-0000-4000-8000-0000000002b2',
   'c1e50000-0000-4000-8000-00000000000b', 'T1', 4),
  ('c1e50000-0000-4000-8000-0000000003c1',
   'c1e50000-0000-4000-8000-0000000002c2',
   'c1e50000-0000-4000-8000-00000000000c', 'T1', 4),
  ('c1e50000-0000-4000-8000-0000000003d1',
   'c1e50000-0000-4000-8000-0000000002d2',
   'c1e50000-0000-4000-8000-00000000000d', 'T1', 4);

insert into public.reservation_slots
  (id, activity_id, organization_id, starts_at, ends_at, capacity, status,
   generated)
values
  ('c1e50000-0000-4000-8000-0000000004a1',
   'c1e50000-0000-4000-8000-0000000002a1',
   'c1e50000-0000-4000-8000-00000000000a',
   now() + interval '1 day', now() + interval '1 day 1 hour', 5, 'open', false),
  ('c1e50000-0000-4000-8000-0000000004a2',
   'c1e50000-0000-4000-8000-0000000002a2',
   'c1e50000-0000-4000-8000-00000000000a',
   now() + interval '1 day', now() + interval '1 day 15 minutes', 40, 'open',
   true),
  ('c1e50000-0000-4000-8000-0000000004b1',
   'c1e50000-0000-4000-8000-0000000002b1',
   'c1e50000-0000-4000-8000-00000000000b',
   now() + interval '1 day', now() + interval '1 day 1 hour', 5, 'open', false),
  ('c1e50000-0000-4000-8000-0000000004b2',
   'c1e50000-0000-4000-8000-0000000002b2',
   'c1e50000-0000-4000-8000-00000000000b',
   now() + interval '1 day', now() + interval '1 day 15 minutes', 40, 'open',
   true),
  ('c1e50000-0000-4000-8000-0000000004c1',
   'c1e50000-0000-4000-8000-0000000002c1',
   'c1e50000-0000-4000-8000-00000000000c',
   now() + interval '1 day', now() + interval '1 day 1 hour', 5, 'open', false),
  ('c1e50000-0000-4000-8000-0000000004c2',
   'c1e50000-0000-4000-8000-0000000002c2',
   'c1e50000-0000-4000-8000-00000000000c',
   now() + interval '1 day', now() + interval '1 day 15 minutes', 40, 'open',
   true),
  ('c1e50000-0000-4000-8000-0000000004d1',
   'c1e50000-0000-4000-8000-0000000002d1',
   'c1e50000-0000-4000-8000-00000000000d',
   now() + interval '1 day', now() + interval '1 day 1 hour', 5, 'open', false),
  ('c1e50000-0000-4000-8000-0000000004d2',
   'c1e50000-0000-4000-8000-0000000002d2',
   'c1e50000-0000-4000-8000-00000000000d',
   now() + interval '1 day', now() + interval '1 day 15 minutes', 40, 'open',
   true);


-- ════════════════════════════════════════════════════════════
-- 0. LA PRÉMISSE EST MESURÉE, PAS SUPPOSÉE
--
-- Sans ces quatre lignes, toute la matrice serait verte le jour où les octrois
-- cesseraient d'être vivants : chaque « refusée » le serait pour absence de
-- droit, et chaque « acceptée » ne le serait plus du tout.
-- ════════════════════════════════════════════════════════════

select ok(
  public.org_has_module_access(
    'c1e50000-0000-4000-8000-00000000000a', 'rendez_vous')
  and not public.org_has_module_access(
    'c1e50000-0000-4000-8000-00000000000a', 'reserver'),
  'CLE-0a SALLE détient `rendez_vous` et RIEN d''autre, à l''instant que les RPC lisent');

select ok(
  public.org_has_module_access(
    'c1e50000-0000-4000-8000-00000000000b', 'reserver')
  and not public.org_has_module_access(
    'c1e50000-0000-4000-8000-00000000000b', 'rendez_vous'),
  'CLE-0b MOMENTS détient `reserver` et RIEN d''autre');

select ok(
  public.org_has_module_access(
    'c1e50000-0000-4000-8000-00000000000c', 'reserver')
  and public.org_has_module_access(
    'c1e50000-0000-4000-8000-00000000000c', 'rendez_vous'),
  'CLE-0c LES DEUX détient les deux');

select ok(
  not public.org_has_module_access(
    'c1e50000-0000-4000-8000-00000000000d', 'reserver')
  and not public.org_has_module_access(
    'c1e50000-0000-4000-8000-00000000000d', 'rendez_vous'),
  'CLE-0d AUCUN n''a ni l''un ni l''autre — son abonnement seul n''ouvre rien');


-- ════════════════════════════════════════════════════════════
-- 1. LA RÈGLE ELLE-MÊME
--
-- Elle vit à un seul endroit, elle se teste à un seul endroit.
-- ════════════════════════════════════════════════════════════

select is(
  public.reservation_activity_module_key(
    'c1e50000-0000-4000-8000-0000000002a1'),
  'reserver',
  'CLE-1 une activité en `booking_mode = moment` exige `reserver`');

select is(
  public.reservation_activity_module_key(
    'c1e50000-0000-4000-8000-0000000002a2'),
  'rendez_vous',
  'CLE-2 une activité en `booking_mode = rendez_vous` exige `rendez_vous`');

-- LE REPLI, ET IL COMPTE. Un retour nul traverserait la liste blanche de
-- `org_has_module_access` sans lever (`null not in (…)` vaut null) et finirait
-- en refus muet : l'activité manquante se lirait comme « pas le droit ».
select is(
  public.reservation_activity_module_key(
    'c1e50000-0000-4000-8000-000000000999'),
  'reserver',
  'CLE-3 une activité INTROUVABLE rend le défaut de la colonne, jamais NULL');

select is(
  (select p.provolatile::text
     from pg_catalog.pg_proc p
     join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'reservation_activity_module_key'),
  's',
  'CLE-4 elle est `stable` : une règle de lecture n''écrit rien');

select ok(
  not has_function_privilege(
    'anon', 'public.reservation_activity_module_key(uuid)', 'EXECUTE'),
  'CLE-5 anon ne peut pas l''appeler');
select ok(
  not has_function_privilege(
    'authenticated', 'public.reservation_activity_module_key(uuid)', 'EXECUTE'),
  'CLE-6 une session commerçant non plus');
select ok(
  not has_function_privilege(
    'service_role', 'public.reservation_activity_module_key(uuid)', 'EXECUTE'),
  'CLE-7 ni l''application : elle n''est appelée que de l''intérieur des huit portes');


-- ════════════════════════════════════════════════════════════
-- 2. SALLE — `rendez_vous` SEUL
--
-- La ligne que ce lot rend possible : acheter « Réservation » sans « Moments ».
-- ════════════════════════════════════════════════════════════

select is(
  (public.reserve_table(
     'c1e50000-0000-4000-8000-00000000000a',
     'c1e50000-0000-4000-8000-0000000004a2',
     repeat('a1', 32), 2) ->> 'state'),
  'reserved',
  'CLE-8 SALLE réserve une table avec le seul droit `rendez_vous` — c''est le lot');

select is(
  (public.waitlist_join_table(
     'c1e50000-0000-4000-8000-00000000000a',
     'c1e50000-0000-4000-8000-0000000004a2',
     repeat('a2', 32), 2) ->> 'state'),
  'joined',
  'CLE-9 … et sa liste d''attente de salle s''ouvre pareillement');

select is(
  (public.reserve_slot(
     'c1e50000-0000-4000-8000-00000000000a',
     'c1e50000-0000-4000-8000-0000000004a1',
     repeat('a3', 32)) ->> 'state'),
  'unavailable',
  'CLE-10 … mais son ATELIER reste fermé : un Moment exige `reserver`, que SALLE n''a pas');


-- ════════════════════════════════════════════════════════════
-- 3. MOMENTS — `reserver` SEUL
--
-- L'autre sens, et c'est lui qui prouve que la dérivation n'est pas un « oui »
-- déguisé : la même organisation passe d'un côté et pas de l'autre.
-- ════════════════════════════════════════════════════════════

select is(
  (public.reserve_slot(
     'c1e50000-0000-4000-8000-00000000000b',
     'c1e50000-0000-4000-8000-0000000004b1',
     repeat('b1', 32)) ->> 'state'),
  'reserved',
  'CLE-11 MOMENTS réserve son atelier avec le seul droit `reserver` — rien n''a bougé de ce côté-là');

select is(
  (public.reserve_table(
     'c1e50000-0000-4000-8000-00000000000b',
     'c1e50000-0000-4000-8000-0000000004b2',
     repeat('b2', 32), 2) ->> 'state'),
  'unavailable',
  'CLE-12 … mais sa SALLE reste fermée : `reserver` n''ouvre pas un rendez-vous');

select is(
  (public.waitlist_join_table(
     'c1e50000-0000-4000-8000-00000000000b',
     'c1e50000-0000-4000-8000-0000000004b2',
     repeat('b3', 32), 2) ->> 'state'),
  'unavailable',
  'CLE-13 … ni la liste d''attente de cette salle');


-- ════════════════════════════════════════════════════════════
-- 4. LES DEUX — et 5. AUCUN
-- ════════════════════════════════════════════════════════════

select is(
  (public.reserve_slot(
     'c1e50000-0000-4000-8000-00000000000c',
     'c1e50000-0000-4000-8000-0000000004c1',
     repeat('c1', 32)) ->> 'state'),
  'reserved',
  'CLE-14 qui a les deux ouvre son atelier…');

select is(
  (public.reserve_table(
     'c1e50000-0000-4000-8000-00000000000c',
     'c1e50000-0000-4000-8000-0000000004c2',
     repeat('c2', 32), 2) ->> 'state'),
  'reserved',
  'CLE-15 … et sa salle');

select is(
  (public.reserve_slot(
     'c1e50000-0000-4000-8000-00000000000d',
     'c1e50000-0000-4000-8000-0000000004d1',
     repeat('d1', 32)) ->> 'state'),
  'unavailable',
  'CLE-16 qui n''a ni l''un ni l''autre n''ouvre pas son atelier…');

select is(
  (public.reserve_table(
     'c1e50000-0000-4000-8000-00000000000d',
     'c1e50000-0000-4000-8000-0000000004d2',
     repeat('d2', 32), 2) ->> 'state'),
  'unavailable',
  'CLE-17 … ni sa salle');

select results_eq(
  $$select count(*)::int from public.reservations
     where organization_id = 'c1e50000-0000-4000-8000-00000000000d'$$,
  array[0],
  'CLE-18 … et aucun de ces deux refus n''a RIEN écrit');


-- ════════════════════════════════════════════════════════════
-- 6. LE CONTRÔLE DE PORTÉE
--
-- `unavailable` couvre six refus. Reposer le droit manquant et rejouer LA MÊME
-- demande est la seule façon de dire que c'était bien lui.
-- ════════════════════════════════════════════════════════════

insert into public.organization_module_grants
  (organization_id, module, kind, source, starts_at, ends_at)
values
  ('c1e50000-0000-4000-8000-00000000000a', 'reserver', 'pass', 'backoffice',
   now() - interval '1 day', now() + interval '365 days'),
  ('c1e50000-0000-4000-8000-00000000000b', 'rendez_vous', 'pass', 'backoffice',
   now() - interval '1 day', now() + interval '365 days');

select is(
  (public.reserve_slot(
     'c1e50000-0000-4000-8000-00000000000a',
     'c1e50000-0000-4000-8000-0000000004a1',
     repeat('a3', 32)) ->> 'state'),
  'reserved',
  'CLE-19 PORTÉE le droit `reserver` posé, LA MÊME demande de CLE-10 est acceptée : c''était bien lui qui refusait');

select is(
  (public.reserve_table(
     'c1e50000-0000-4000-8000-00000000000b',
     'c1e50000-0000-4000-8000-0000000004b2',
     repeat('b2', 32), 2) ->> 'state'),
  'reserved',
  'CLE-20 PORTÉE le droit `rendez_vous` posé, LA MÊME demande de CLE-12 est acceptée');


-- ════════════════════════════════════════════════════════════
-- 7. L'ISOLATION ENTRE ORGANISATIONS, INCHANGÉE
--
-- La dérivation lit l'activité du créneau, donc une table de plus à joindre :
-- c'est exactement le genre d'ajout qui fait perdre un `and organization_id =`.
-- SALLE et MOMENTS détiennent maintenant les DEUX droits (§6) et LES DEUX les
-- avait déjà : un refus ici ne peut donc venir QUE de l'appartenance.
-- ════════════════════════════════════════════════════════════

select is(
  (public.reserve_table(
     'c1e50000-0000-4000-8000-00000000000a',
     'c1e50000-0000-4000-8000-0000000004c2',
     repeat('fa', 32), 2) ->> 'state'),
  'unavailable',
  'CLE-21 SALLE ne réserve pas sur le créneau de LES DEUX, bien qu''elle ait le droit');

select is(
  public.reserve_table(
    'c1e50000-0000-4000-8000-00000000000a',
    'c1e50000-0000-4000-8000-0000000004c2',
    repeat('fa', 32), 2),
  public.reserve_table(
    'facade00-0000-4000-8000-000000000000',
    'c1e50000-0000-4000-8000-0000000004c2',
    repeat('fa', 32), 2),
  'CLE-22 … et son refus est le MÊME document qu''une organisation inconnue : rien ne fuit de dehors');

select is(
  (public.reserve_slot(
     'c1e50000-0000-4000-8000-00000000000b',
     'c1e50000-0000-4000-8000-0000000004c1',
     repeat('fb', 32)) ->> 'state'),
  'unavailable',
  'CLE-23 MOMENTS ne réserve pas sur l''atelier de LES DEUX');

-- LE COMPTE EST BORNÉ AUX QUATRE ORGANISATIONS DE CE FICHIER, et la leçon a été
-- payée ici même : la CI sème la base AVANT pgTAP, et `supabase/seed.sql` porte
-- déjà une réservation sous `repeat(''e2'', 32)`. Un `count(*)` global lit donc
-- les données de quelqu'un d'autre — vert sur une base vide, rouge sur une base
-- peuplée, ce qui est exactement l'inverse de ce qu'on veut prouver.
select results_eq(
  $$select count(*)::int from public.reservations
     where player_key_hash in (repeat('fa', 32), repeat('fb', 32))
       and organization_id in (
         'c1e50000-0000-4000-8000-00000000000a',
         'c1e50000-0000-4000-8000-00000000000b',
         'c1e50000-0000-4000-8000-00000000000c',
         'c1e50000-0000-4000-8000-00000000000d')$$,
  array[0],
  'CLE-24 … et ces trois tentatives n''ont RIEN écrit');


-- ════════════════════════════════════════════════════════════
-- 8. L'INVARIANT DE CATALOGUE — remplaçant de 20261020120000 §9
--
-- Il NOMME les trois ensembles au lieu de les compter, et il porte les deux
-- sens : ce qui dérive, ce qui garde encore une clé fixe, et ce qui n'a plus
-- le droit d'en garder aucune.
-- ════════════════════════════════════════════════════════════

select is(
  (select coalesce(
            pg_catalog.string_agg(p.proname, ', ' order by p.proname), '')
     from pg_catalog.pg_proc p
     join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prosrc ~ 'org_has_module_access\(v_slot\.organization_id, public\.reservation_activity_module_key\(v_slot\.activity_id\)\)'),
  'claim_waitlist_offer, redeem_invitation, reservation_offer_next, '
  'reservation_table_freed_targets, reserve_slot, reserve_table, '
  'waitlist_join, waitlist_join_table',
  'CLE-25 CATALOGUE les HUIT portes qui opèrent sur une activité dérivent leur clé du `booking_mode` — nommées, pas comptées');

-- LA MOITIÉ QU'ON OUBLIE. Sans elle, la règle serait « `rendez_vous` ouvre
-- tout » : une salle resterait fermée à qui a pourtant acheté le module.
select is(
  (select coalesce(
            pg_catalog.string_agg(p.proname, ', ' order by p.proname), '')
     from pg_catalog.pg_proc p
     join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prosrc ~ 'org_has_module_access\([^,]+, ''rendez_vous''\)'),
  '',
  'CLE-26 CATALOGUE plus AUCUNE fonction ne demande `rendez_vous` en dur');

-- ET CE QUI GARDE `reserver`, NOMMÉMENT : les sept portes sans activité (une
-- file d'accueil, une offre de stock, une session d'attente n'ont pas de
-- `booking_mode`) plus `vitrine_public_state`, dont la garde ne couvre
-- plus que ses FILES et ses OFFRES depuis VIT-53 (20261207120000) : ses
-- activités, elles, se filtrent par mode et objet par objet, si bien
-- qu'une organisation `rendez_vous` seul ne voit plus une vitrine muette.
select is(
  (select coalesce(
            pg_catalog.string_agg(p.proname, ', ' order by p.proname), '')
     from pg_catalog.pg_proc p
     join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prosrc ~ 'org_has_module_access\([^,]+, ''reserver''\)'),
  'consume_reserver_wait_spin_grant, hold_stock_offer, queue_join, '
  'queue_public_state, stock_offer_public_state, vitrine_public_state, '
  'wait_session_open, wait_session_use_pause',
  'CLE-27 CATALOGUE les HUIT portes sans activité gardent `reserver` — aucune ne l''a perdu, aucune activité ne l''a conservé');

-- LE CONTRAT ÉCRIT SUIT LE CODE. Huit descriptions annonçaient un droit fixe ;
-- les laisser telles quelles publierait huit contrats faux le jour même où le
-- code devient juste.
select is(
  (select coalesce(
            pg_catalog.string_agg(p.proname, ', ' order by p.proname), '')
     from pg_catalog.pg_proc p
     join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in ('claim_waitlist_offer', 'redeem_invitation',
                        'reservation_offer_next',
                        'reservation_table_freed_targets', 'reserve_slot',
                        'reserve_table', 'waitlist_join', 'waitlist_join_table')
      and pg_catalog.strpos(
            coalesce(pg_catalog.obj_description(p.oid, 'pg_proc'), ''),
            'selon le `booking_mode` de l''activité') = 0),
  '',
  'CLE-28 CATALOGUE les huit descriptions annoncent la règle qu''elles appliquent');

select * from finish();
rollback;
