-- ============================================================
-- UNE CLÉ D'OCTROI PAR PRODUIT (20261020120000)
--
-- Ce que ce fichier prouve, et dans quel ordre :
--
--   1. LE REMPLISSAGE RÉTROACTIF, ET C'EST L'ASSERTION QUI COMPTE. La migration
--      s'est appliquée sur une base de PRODUCTION où des commerçants réels
--      utilisaient Réserver, Duo et Portrait de la Bande au titre du seul droit
--      `vitrine`. Aucun ne doit avoir perdu un accès qu'il avait.
--
--      pgTAP s'exécute APRÈS les migrations : il ne peut pas fabriquer un
--      « avant ». C'est pourquoi le remplissage vit dans une FONCTION —
--      `mirror_vitrine_entitlements()` — que la migration appelle une fois et
--      que ce fichier rejoue sur ses propres organisations. Ce qui est testé est
--      donc LE code du remplissage, et non une copie qui lui ressemble : la
--      forme de détecteur muet que ce dépôt s'est déjà fait prendre plusieurs
--      fois.
--
--      Les DEUX chemins d'`org_has_module_access` sont couverts séparément,
--      parce qu'ils n'ont rien en commun : la colonne `addon_vitrine` (branche
--      OFFRE) et l'octroi daté (branche OCTROI).
--
--   2. L'ÉTAT « AVANT » EST MESURÉ, PAS SUPPOSÉ. Chaque organisation est lue
--      avant l'appel : elle a `vitrine` et n'a AUCUN des trois autres. Sans
--      cette moitié-là, un « après » tout vert ne prouverait rien — il serait
--      identique à une base où les droits auraient toujours été là.
--
--   3. LES BORNES SONT LES MÊMES, ET C'EST TESTÉ DANS LE TEMPS. Pas seulement
--      « les colonnes se ressemblent » : à un instant postérieur à l'échéance,
--      les QUATRE droits tombent ENSEMBLE. Un miroir qui aurait recopié une date
--      de travers laisserait un droit vivant plus longtemps que celui dont il
--      est né.
--
--   4. L'IDEMPOTENCE. Rejoué, le remplissage ne crée rien.
--
--   5. LES DEUX EXCLUSIONS. Un octroi borné à une RESSOURCE n'est pas recopié
--      (il ne porte déjà pas le droit du module entier) ; un octroi d'origine
--      STRIPE fait LEVER — recopier un droit que Stripe révoque en trois
--      miroirs de back-office que nul webhook ne connaît serait un sur-octroi
--      perpétuel.
--
--   6. LA PORTE DE RÉSERVER EST BIEN `reserver`. Une organisation qui a
--      `vitrine` et PAS `reserver` ne prend aucune réservation, et son refus est
--      INDISTINCT de celui d'une organisation inconnue. Le contrôle de portée
--      suit immédiatement : le seul octroi `reserver` posé, la MÊME demande
--      passe.
--
--   7. LA PAGE PUBLIQUE NE PROMET QUE CE QU'ELLE OUVRE. Sur cette même
--      organisation, `vitrine_public_state` est SERVIE — c'est la Vitrine, et
--      `vitrine` l'ouvre — mais ses trois listes Réserver sont VIDES tant que le
--      produit n'est pas détenu, et la FORME ne change pas : les clés existent,
--      vides. Une porte annoncée vers un module fermé est une promesse rompue
--      sur la page qu'un client lit pendant son repas.
--
--   8. LE VOCABULAIRE. Les trois clés neuves sont admises par la contrainte de
--      table ET par la garde, et un module inconnu LÈVE toujours.
--
-- Le fichier doit passer sur une base VIDE comme sur une base SEMÉE : toutes les
-- assertions sont bornées aux organisations créées ici.
-- ============================================================
begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

select set_config('request.jwt.claims', '{"role":"service_role"}', true);

-- ── DEUX HORLOGES, ET LA SECONDE N'EST PAS UN CHOIX ─────────
--
-- `t0` est l'instant de référence des sections 1 à 3. Elles n'interrogent
-- qu'`org_has_module_access`, qui PREND un `p_now`, et chacune de leurs
-- assertions le passe explicitement : aucune ne lit l'heure réelle, une date
-- absolue y est donc parfaitement stable, et c'est pourquoi elle est conservée.
--
-- LES SECTIONS 4 ET 5 SONT D'UNE AUTRE NATURE. `reserve_slot` et
-- `vitrine_public_state` n'ont AUCUN paramètre d'instant : elles lisent
-- `now()`, et rien d'autre. Une fenêtre d'octroi posée sur `t0` y est donc lue
-- à une heure qui n'a aucun rapport avec elle — c'est ce qui a rendu la page
-- `unavailable` et vidé ses portes alors que la base faisait exactement ce
-- qu'on lui demandait. Les octrois de PORTE sont pour cette seule raison posés
-- sur `now()` : L'INSTANT DE RÉFÉRENCE D'UNE ASSERTION EST CELUI QUE LA
-- FONCTION SOUS TEST LIT VRAIMENT.
--
-- Et `now()` n'y réintroduit aucune intermittence : c'est
-- `transaction_timestamp()`, figé pour toute la transaction de ce fichier, donc
-- aussi constant que la table ci-dessous. Les sections 4 et 5 s'en servaient
-- déjà pour le créneau et pour l'octroi du contrôle de portée.
create temporary table t0 (v timestamptz);
insert into t0 values (timestamptz '2026-09-15 12:00:00+00');

-- ── Fixtures ─────────────────────────────────────────────────
-- COL : le chemin de la COLONNE. Abonnement vivant et `addon_vitrine` allumé,
--       les trois colonnes neuves à leur défaut. C'est l'état exact d'un client
--       à qui la Vitrine a été vendue avant le détachement.
-- OCT : le chemin de l'OCTROI, celui de la bêta. Abonnement RÉSILIÉ pour que
--       seule la première branche puisse répondre — sans quoi un miroir de
--       colonne raté passerait inaperçu ici.
-- MORT : deux octrois `vitrine` sans effet, un RÉVOQUÉ et un ÉCHU. Le miroir les
--       recopie à l'identique et l'organisation reste sans aucun droit : c'est
--       ce qui prouve que le miroir copie des TERMES, pas des permissions.
-- RES : un octroi `vitrine` BORNÉ À UNE RESSOURCE. Il ne porte pas le droit du
--       module entier (correctif SD-5), il n'est donc pas recopié.
-- PORTE : le témoin de Réserver et de la page publique. `vitrine` vivant,
--       PAS `reserver`, une vitrine publiée, une activité active, un créneau
--       ouvert. Elle est SERVIE en tant que vitrine et FERMÉE en tant que
--       Réserver — c'est tout l'objet du lot. SES BORNES SONT POSÉES SUR
--       `now()` ET NON SUR `t0`, pour la raison écrite plus haut : les deux RPC
--       qui la jugent ne prennent pas d'instant. Le miroir de §3 recopiera ces
--       bornes-là dans ses trois octrois, donc `reserver` naîtra vivant au même
--       instant — ce qui est justement ce que §4 doit pouvoir lui retirer.
insert into public.organizations
  (id, name, slug, subscription_status, plan, timezone, data_retention_months,
   addon_vitrine)
values
  ('d40a0000-0000-4000-8000-000000000001', 'Produit COL', 'tap-produit-col',
   'active', 'starter', 'Europe/Paris', 6, true),
  ('d40a0000-0000-4000-8000-000000000002', 'Produit OCT', 'tap-produit-oct',
   'canceled', 'starter', 'Europe/Paris', 6, false),
  ('d40a0000-0000-4000-8000-000000000003', 'Produit MORT', 'tap-produit-mort',
   'canceled', 'starter', 'Europe/Paris', 6, false),
  ('d40a0000-0000-4000-8000-000000000004', 'Produit RES', 'tap-produit-res',
   'canceled', 'starter', 'Europe/Paris', 6, false),
  ('d40a0000-0000-4000-8000-000000000005', 'Produit PORTE', 'tap-produit-porte',
   'canceled', 'starter', 'Europe/Paris', 6, false);

insert into public.organization_module_grants
  (organization_id, module, kind, source, starts_at, ends_at)
values
  ('d40a0000-0000-4000-8000-000000000002', 'vitrine', 'pass', 'backoffice',
   (select v from t0) - interval '1 day', (select v from t0) + interval '30 days'),
  ('d40a0000-0000-4000-8000-000000000005', 'vitrine', 'pass', 'backoffice',
   now() - interval '1 day', now() + interval '30 days');

-- L'ÉCHU et le RÉVOQUÉ. Le second passe par un `update` : `revoked_at` n'est pas
-- une colonne que l'insert de fixture doit deviner, et le trigger de gel des
-- termes ne mord que sur `capacity` et `starts_at`.
insert into public.organization_module_grants
  (id, organization_id, module, kind, source, starts_at, ends_at)
values
  ('d40a0000-0000-4000-8000-0000000000e1',
   'd40a0000-0000-4000-8000-000000000003', 'vitrine', 'pass', 'backoffice',
   (select v from t0) - interval '400 days', (select v from t0) - interval '35 days'),
  ('d40a0000-0000-4000-8000-0000000000e2',
   'd40a0000-0000-4000-8000-000000000003', 'vitrine', 'pass', 'backoffice',
   (select v from t0) - interval '10 days', (select v from t0) + interval '300 days');
update public.organization_module_grants
   set revoked_at = (select v from t0) - interval '2 days',
       revoked_reason = 'remboursement'
 where id = 'd40a0000-0000-4000-8000-0000000000e2';

-- L'OCTROI BORNÉ À UNE RESSOURCE. `resource_id` ne pointe volontairement sur
-- rien de réel : la colonne ne porte aucune clé étrangère, et ce qui est testé
-- est que le miroir NE LA RECOPIE PAS — pas ce qu'elle désigne.
insert into public.organization_module_grants
  (organization_id, module, kind, source, starts_at, ends_at, resource_id)
values
  ('d40a0000-0000-4000-8000-000000000004', 'vitrine', 'pass', 'backoffice',
   (select v from t0) - interval '1 day', (select v from t0) + interval '30 days',
   'd40a0000-0000-4000-8000-0000000000ff');


-- ════════════════════════════════════════════════════════════
-- 1. L'ÉTAT « AVANT » — mesuré, pas supposé
--
-- Sans cette section, tout ce qui suit serait vert sur une base où les quatre
-- droits auraient toujours coexisté.
-- ════════════════════════════════════════════════════════════

select ok(
  public.org_has_module_access(
    'd40a0000-0000-4000-8000-000000000001', 'vitrine', (select v from t0)),
  'AVANT-1 COL détient `vitrine` par sa colonne');
select ok(
  not public.org_has_module_access(
    'd40a0000-0000-4000-8000-000000000001', 'reserver', (select v from t0))
  and not public.org_has_module_access(
    'd40a0000-0000-4000-8000-000000000001', 'duo', (select v from t0))
  and not public.org_has_module_access(
    'd40a0000-0000-4000-8000-000000000001', 'bande', (select v from t0)),
  'AVANT-2 … et AUCUN des trois droits neufs : c''est l''état d''un client vendu avant le détachement');

select ok(
  public.org_has_module_access(
    'd40a0000-0000-4000-8000-000000000002', 'vitrine', (select v from t0)),
  'AVANT-3 OCT détient `vitrine` par son octroi, abonnement résilié compris');
select ok(
  not public.org_has_module_access(
    'd40a0000-0000-4000-8000-000000000002', 'reserver', (select v from t0))
  and not public.org_has_module_access(
    'd40a0000-0000-4000-8000-000000000002', 'duo', (select v from t0))
  and not public.org_has_module_access(
    'd40a0000-0000-4000-8000-000000000002', 'bande', (select v from t0)),
  'AVANT-4 … et aucun des trois autres');

select ok(
  not public.org_has_module_access(
    'd40a0000-0000-4000-8000-000000000003', 'vitrine', (select v from t0)),
  'AVANT-5 MORT ne détient RIEN : un octroi révoqué et un échu ne sont pas un droit');
select ok(
  not public.org_has_module_access(
    'd40a0000-0000-4000-8000-000000000004', 'vitrine', (select v from t0)),
  'AVANT-6 RES non plus : un octroi borné à une ressource ne porte pas le module entier');


-- ════════════════════════════════════════════════════════════
-- 2. LE REMPLISSAGE — on rejoue LE code de la migration
-- ════════════════════════════════════════════════════════════

create temporary table miroir (n int, j jsonb);
insert into miroir values (1, public.mirror_vitrine_entitlements());

-- Le bilan compte ce qui a bougé ICI et ne peut donc pas être écrit en dur :
-- sur une base semée, les organisations E2E ont déjà leurs miroirs et n'y
-- entrent pas. On vérifie ce qui est vrai dans les deux cas — il s'est passé
-- quelque chose, et au moins ce qu'on attend.
select ok(
  ((select j->>'organisations' from miroir where n = 1))::int >= 1,
  'MIROIR-1 au moins une organisation a vu ses colonnes allumées');
select ok(
  ((select j->>'octrois' from miroir where n = 1))::int >= 9,
  'MIROIR-2 au moins neuf octrois miroirs sont nés : trois par octroi `vitrine` non borné (OCT, PORTE, et les deux de MORT)');

-- ── LE CHEMIN DE LA COLONNE ─────────────────────────────────
select ok(
  public.org_has_module_access(
    'd40a0000-0000-4000-8000-000000000001', 'reserver', (select v from t0))
  and public.org_has_module_access(
    'd40a0000-0000-4000-8000-000000000001', 'duo', (select v from t0))
  and public.org_has_module_access(
    'd40a0000-0000-4000-8000-000000000001', 'bande', (select v from t0)),
  'COL-1 COL a MAINTENANT les trois droits neufs : elle n''a rien perdu');
select results_eq(
  $$select addon_vitrine, addon_reserver, addon_duo, addon_bande
      from public.organizations
     where id = 'd40a0000-0000-4000-8000-000000000001'$$,
  $$values (true, true, true, true)$$,
  'COL-2 … et c''est bien par les colonnes, allumées toutes les trois');

-- ── LE CHEMIN DE L'OCTROI ───────────────────────────────────
select ok(
  public.org_has_module_access(
    'd40a0000-0000-4000-8000-000000000002', 'reserver', (select v from t0))
  and public.org_has_module_access(
    'd40a0000-0000-4000-8000-000000000002', 'duo', (select v from t0))
  and public.org_has_module_access(
    'd40a0000-0000-4000-8000-000000000002', 'bande', (select v from t0)),
  'OCT-1 OCT a MAINTENANT les trois droits neufs, sans abonnement : c''est l''octroi qui les porte');
select results_eq(
  $$select module, kind, source, starts_at, ends_at
      from public.organization_module_grants
     where organization_id = 'd40a0000-0000-4000-8000-000000000002'
     order by module$$,
  $$select m.module, 'pass'::text, 'backoffice'::text,
           timestamptz '2026-09-15 12:00:00+00' - interval '1 day',
           timestamptz '2026-09-15 12:00:00+00' + interval '30 days'
      from (values ('bande'), ('duo'), ('reserver'), ('vitrine')) as m(module)
     order by m.module$$,
  'OCT-2 les QUATRE octrois portent les MÊMES bornes, au caractère près');

-- ── LES MÊMES BORNES, PROUVÉES DANS LE TEMPS ────────────────
-- Une égalité de colonnes ne dit pas encore que les droits s'éteignent
-- ensemble. On interroge la garde à un instant POSTÉRIEUR à l'échéance.
select ok(
  not public.org_has_module_access(
    'd40a0000-0000-4000-8000-000000000002', 'vitrine',
    (select v from t0) + interval '31 days')
  and not public.org_has_module_access(
    'd40a0000-0000-4000-8000-000000000002', 'reserver',
    (select v from t0) + interval '31 days')
  and not public.org_has_module_access(
    'd40a0000-0000-4000-8000-000000000002', 'duo',
    (select v from t0) + interval '31 days')
  and not public.org_has_module_access(
    'd40a0000-0000-4000-8000-000000000002', 'bande',
    (select v from t0) + interval '31 days'),
  'OCT-3 passé l''échéance, les QUATRE tombent ENSEMBLE : le miroir n''a pas prolongé un droit');

-- ── LES TERMES SONT COPIÉS, PAS LES PERMISSIONS ─────────────
select results_eq(
  $$select count(*)::int from public.organization_module_grants
     where organization_id = 'd40a0000-0000-4000-8000-000000000003'$$,
  array[8],
  'MORT-1 les deux octrois sans effet ont bien été miroités : deux fois quatre lignes');
select ok(
  not public.org_has_module_access(
    'd40a0000-0000-4000-8000-000000000003', 'reserver', (select v from t0))
  and not public.org_has_module_access(
    'd40a0000-0000-4000-8000-000000000003', 'duo', (select v from t0))
  and not public.org_has_module_access(
    'd40a0000-0000-4000-8000-000000000003', 'bande', (select v from t0)),
  'MORT-2 … et n''ouvrent RIEN : la révocation et l''échéance ont été recopiées avec le reste');
select results_eq(
  $$select count(*)::int from public.organization_module_grants
     where organization_id = 'd40a0000-0000-4000-8000-000000000003'
       and revoked_at is not null and revoked_reason = 'remboursement'$$,
  array[4],
  'MORT-3 le motif de révocation lui-même a suivi : la question « depuis quand ? » aura la même réponse pour les quatre');

-- ── L'OCTROI BORNÉ À UNE RESSOURCE N'EST PAS RECOPIÉ ────────
select results_eq(
  $$select count(*)::int from public.organization_module_grants
     where organization_id = 'd40a0000-0000-4000-8000-000000000004'$$,
  array[1],
  'RES-1 un octroi borné à une ressource reste SEUL : le miroir ne fabrique pas de pointeur vers une table étrangère');


-- ════════════════════════════════════════════════════════════
-- 3. IDEMPOTENCE
-- ════════════════════════════════════════════════════════════

insert into miroir values (2, public.mirror_vitrine_entitlements());
select is((select j from miroir where n = 2),
  '{"octrois": 0, "organisations": 0}'::jsonb,
  'IDEM-1 rejoué, le remplissage ne touche RIEN — ni colonne, ni octroi');
select results_eq(
  $$select count(*)::int from public.organization_module_grants
     where organization_id = 'd40a0000-0000-4000-8000-000000000002'$$,
  array[4],
  'IDEM-2 … et aucun doublon n''est apparu');


-- ════════════════════════════════════════════════════════════
-- 4. LA PORTE DE RÉSERVER EST BIEN `reserver`
--
-- PORTE a `vitrine` (et, depuis le miroir, les trois autres). On lui RETIRE
-- `reserver` seul : c'est la seule façon d'obtenir l'état qu'une vente future
-- de la Vitrine sans Réserver produira, et de vérifier que c'est bien cette
-- clé-là que les RPC interrogent.
-- ════════════════════════════════════════════════════════════

update public.organization_module_grants
   set revoked_at = now() - interval '1 hour',
       revoked_reason = 'témoin du test'
 where organization_id = 'd40a0000-0000-4000-8000-000000000005'
   and module = 'reserver';

-- PORTE-0 EST INTERROGÉE À `now()`, ET C'EST LA MOITIÉ QUI PORTE TOUT LE RESTE.
-- `reserve_slot` et `vitrine_public_state` jugent à cet instant-là et à aucun
-- autre : une PORTE-0 verte à `t0` au-dessus de quatre assertions lues à `now()`
-- ne dirait rien d'elles. C'est précisément ce qui s'était produit — PORTE-1 à
-- PORTE-3 étaient vertes sur une organisation qui n'avait AUCUN droit, donc pour
-- une tout autre raison que celle qu'elles annoncent.
select ok(
  public.org_has_module_access(
    'd40a0000-0000-4000-8000-000000000005', 'vitrine')
  and not public.org_has_module_access(
    'd40a0000-0000-4000-8000-000000000005', 'reserver'),
  'PORTE-0 PORTE a la Vitrine et n''a PAS Réserver, À L''INSTANT QUE LES RPC LISENT : c''est l''état que ce lot rend possible');

insert into public.reservation_activities
  (id, organization_id, name, description, active)
values
  ('d40a0000-0000-4000-8000-000000000201',
   'd40a0000-0000-4000-8000-000000000005', 'Dégustation fermée', null, true);

insert into public.reservation_slots
  (id, activity_id, organization_id, starts_at, ends_at, capacity, status)
values
  ('d40a0000-0000-4000-8000-000000000301',
   'd40a0000-0000-4000-8000-000000000201',
   'd40a0000-0000-4000-8000-000000000005',
   now() + interval '2 days', now() + interval '2 days 1 hour', 5, 'open');

select is(
  (public.reserve_slot(
    'd40a0000-0000-4000-8000-000000000005',
    'd40a0000-0000-4000-8000-000000000301', repeat('f1', 32)))->>'state',
  'unavailable',
  'PORTE-1 sans le droit `reserver`, aucune réservation ne se prend — le droit `vitrine` ne suffit plus');
select is(
  public.reserve_slot(
    'd40a0000-0000-4000-8000-000000000005',
    'd40a0000-0000-4000-8000-000000000301', repeat('f1', 32)),
  public.reserve_slot(
    'facade00-0000-4000-8000-000000000000',
    'd40a0000-0000-4000-8000-000000000301', repeat('f1', 32)),
  'PORTE-2 … et le refus est le MÊME document qu''une organisation inconnue : la clé manquante ne se lit pas de dehors');
select results_eq(
  $$select count(*)::int from public.reservations
     where slot_id = 'd40a0000-0000-4000-8000-000000000301'$$,
  array[0],
  'PORTE-3 … et le refus n''a RIEN écrit');


-- ════════════════════════════════════════════════════════════
-- 5. LA PAGE PUBLIQUE NE PROMET QUE CE QU'ELLE OUVRE
-- ════════════════════════════════════════════════════════════

insert into public.vitrine_settings (organization_id, slug, published)
values ('d40a0000-0000-4000-8000-000000000005', 'tap-produit-porte', true);

select is(
  public.vitrine_public_state('tap-produit-porte') ->> 'state',
  'ok',
  'PUBLIQUE-1 la page est SERVIE : c''est la Vitrine, et `vitrine` l''ouvre');
select is(
  public.vitrine_public_state('tap-produit-porte') #> '{portes,reserver,activites}',
  '[]'::jsonb,
  'PUBLIQUE-2 … et sa porte d''activités est VIDE : l''activité existe, le produit n''est pas détenu');
select is(
  public.vitrine_public_state('tap-produit-porte') #> '{portes,reserver,files}',
  '[]'::jsonb,
  'PUBLIQUE-3 … idem pour les files');
select is(
  public.vitrine_public_state('tap-produit-porte') #> '{portes,reserver,offres}',
  '[]'::jsonb,
  'PUBLIQUE-4 … idem pour les offres de stock');
select results_eq(
  $$select key from jsonb_object_keys(
      public.vitrine_public_state('tap-produit-porte') #> '{portes,reserver}') as key
     order by key$$,
  $$values ('activites'), ('files'), ('offres')$$,
  'PUBLIQUE-5 LA FORME NE BOUGE PAS : les trois clés existent, vides — c''est l''écran qui masque un bloc sans contenu, pas la base');

-- LE CONTRÔLE DE PORTÉE, et il porte les deux sections d'un coup : le seul
-- octroi `reserver` reposé, la MÊME demande passe et la MÊME page annonce sa
-- porte. Sans lui, PORTE-1 et PUBLIQUE-2 seraient verts le jour où cette
-- organisation échouerait pour une tout autre raison.
insert into public.organization_module_grants
  (organization_id, module, kind, source, starts_at, ends_at)
values
  ('d40a0000-0000-4000-8000-000000000005', 'reserver', 'pass', 'backoffice',
   now() - interval '1 day', now() + interval '365 days');

-- `reserved` ET NON `confirmed` : ce sont deux vocabulaires distincts, et les
-- confondre ici avait fait rougir une assertion sur une base qui répondait
-- juste. `state` est l'issue de l'APPEL — `reserved`, `already_reserved`,
-- `full`, `unavailable`, `invalid_email`, `invalid_party_size` — tandis que
-- `confirmed` est le `status` de la LIGNE écrite dans `public.reservations`,
-- que la RPC ne ressort que dans sa branche `already_reserved`, sous la clé
-- `status`. Le contrat de `reserve_slot` est antérieur à ce lot (20261007120000)
-- et cette migration n'a substitué qu'un nom de module dans sa garde :
-- `reserver.test.sql` l'épingle sur `reserved` en quatre endroits, et passe.
select is(
  (public.reserve_slot(
    'd40a0000-0000-4000-8000-000000000005',
    'd40a0000-0000-4000-8000-000000000301', repeat('f1', 32)))->>'state',
  'reserved',
  'PORTÉE-1 le droit `reserver` reposé, la MÊME demande est acceptée : c''était bien lui qui refusait');
select results_eq(
  $$select jsonb_array_length(
      public.vitrine_public_state('tap-produit-porte') #> '{portes,reserver,activites}')$$,
  array[1],
  'PORTÉE-2 … et la MÊME page annonce désormais sa porte : elle ne promettait rien qu''elle ne pouvait ouvrir');


-- ════════════════════════════════════════════════════════════
-- 6. LE VOCABULAIRE
-- ════════════════════════════════════════════════════════════

select lives_ok(
  $$select public.org_has_module_access(
      'd40a0000-0000-4000-8000-000000000001', 'reserver')$$,
  'VOCAB-1 `reserver` est un module connu de la garde');
select lives_ok(
  $$select public.org_has_module_access(
      'd40a0000-0000-4000-8000-000000000001', 'duo')$$,
  'VOCAB-2 `duo` aussi');
select lives_ok(
  $$select public.org_has_module_access(
      'd40a0000-0000-4000-8000-000000000001', 'bande')$$,
  'VOCAB-3 `bande` aussi');
-- ET UN INCONNU LÈVE TOUJOURS : sans cette ligne, les trois précédentes
-- seraient vertes sur une garde qui aurait cessé de vérifier quoi que ce soit.
select throws_ok(
  $$select public.org_has_module_access(
      'd40a0000-0000-4000-8000-000000000001', 'reserverr')$$,
  null, 'unknown module: reserverr',
  'VOCAB-4 une faute de frappe LÈVE, elle ne se lit pas comme « pas le droit »');

select throws_ok(
  $$insert into public.organization_module_grants
      (organization_id, module, kind, source, starts_at)
    values ('d40a0000-0000-4000-8000-000000000001', 'reserverr', 'pass',
            'backoffice', now())$$,
  '23514', null,
  'VOCAB-5 et la contrainte de table refuse le même mot : les deux vocabulaires sont d''accord');


-- ════════════════════════════════════════════════════════════
-- 7. LE GARDE-FOU STRIPE
--
-- Placé EN DERNIER, et pour une raison mécanique : la ligne posée ici ferait
-- lever toute exécution ultérieure du miroir. `throws_ok` capture l'exception
-- dans sa propre sous-transaction, donc la transaction du fichier survit.
-- ════════════════════════════════════════════════════════════

insert into public.organization_module_grants
  (organization_id, module, kind, source, source_reference, starts_at, ends_at)
values
  ('d40a0000-0000-4000-8000-000000000001', 'vitrine', 'recurring', 'stripe',
   'sub_tap_produit', now() - interval '1 day', null);

select throws_ok(
  $$select public.mirror_vitrine_entitlements()$$,
  '22023', null,
  'STRIPE-1 un octroi `vitrine` gouverné par Stripe ARRÊTE le remplissage : trois miroirs de back-office qu''aucun webhook ne révoque seraient un sur-octroi perpétuel');

select * from finish();
rollback;
