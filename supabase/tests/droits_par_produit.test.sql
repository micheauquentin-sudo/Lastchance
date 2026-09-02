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
--   7 bis. LES DEUX JEUX SUIVENT LA MEME REGLE, ET L'UN DES DEUX NE LA
--      SUIVAIT PAS. `portes.experiences` ne portait AUCUNE cle `bande` :
--      la page annoncait le Portrait de la Bande a tout le monde, y compris
--      a qui ne l'avait pas, alors que `create_player_lobby` refusait. Les
--      deux droits sont poses SEPAREMENT, dans cet ordre, pour qu'une porte
--      qui lirait la cle de l'autre soit vue. La porte du Duo est prouvee
--      INCHANGEE de part et d'autre : c'est la non-regression du lot.
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
-- 5 bis. LES DEUX JEUX — CHAQUE PORTE SUIT SA PROPRE CLÉ (DUO-3a)
--
-- Le §5 ci-dessus a prouvé la règle sur Réserver. Elle avait UN trou, et il est
-- resté invisible tant que `duo` et `bande` étaient inclus dans les cinq
-- offres : `portes.experiences` ne portait AUCUNE clé `bande`, si bien que la
-- page annonçait le Portrait de la Bande à tout le monde, y compris à qui ne
-- l'avait pas — alors que `create_player_lobby`, lui, refusait. Depuis DUO-2 ce
-- sont deux options vendables séparément, et le trou devient visible chez le
-- client.
--
-- ── POURQUOI LE PLATEAU EST RENDU JOUABLE AVANT DE MESURER ──
--
-- La porte du Duo est une CONJONCTION : le droit `duo` ET `duo_jouable` (deux
-- options épinglées, 20261020120000). Sans plateau, un `duo` à faux serait faux
-- pour la mauvaise raison, et JEU-2 comme JEU-6 seraient verts sur une
-- organisation qui n'a simplement rien configuré. On pose donc le plateau
-- D'ABORD, et JEU-0 le mesure : tout ce qui suit ne fait plus varier QUE le
-- droit. Les deux options sont des LIBELLÉS saisis (20261126120000) — la carte
-- Vitrine n'a rien à voir avec le sujet, et deux fiches de plus l'auraient
-- mêlée à la preuve.
--
-- ── L'ORDRE DES OCTROIS EST LA PREUVE, PAS UN DÉTAIL DE MISE EN PLACE ──
--
-- `bande` est posé SEUL, puis `duo` SEUL. Deux droits posés ensemble auraient
-- rendu les deux portes vraies d'un coup, et un `v_bande` qui aurait lu le
-- droit `duo` — la faute exacte que ce lot répare dans l'autre sens — serait
-- passé inaperçu. JEU-5 est l'assertion qui coûte le moins et qui prouve le
-- plus : la porte de la Bande s'est ouverte, celle du Duo NON.
-- ════════════════════════════════════════════════════════════

-- LES DEUX JEUX SONT RETIRÉS D'ABORD, ET C'EST LE MÊME GESTE QUE §5 POUR
-- RÉSERVER. `mirror_vitrine_entitlements()` (§3) recopie `vitrine` en
-- `reserver`, `duo` ET `bande` — sur PORTE comme sur les autres. Sans cette
-- révocation, « sans le droit » serait FAUX et JEU-1 comme JEU-2 seraient verts
-- pour la mauvaise raison : la porte serait ouverte, et on lirait `false` nulle
-- part. C'est exactement ce qu'une première version de cette section a fait, et
-- c'est le test qui l'a dit — on ne l'a pas supposé.
update public.organization_module_grants
   set revoked_at = now() - interval '1 hour',
       revoked_reason = 'témoin du test'
 where organization_id = 'd40a0000-0000-4000-8000-000000000005'
   and module in ('duo', 'bande');

insert into public.duo_options (organization_id, libelle, ordre)
values
  ('d40a0000-0000-4000-8000-000000000005', 'Le plat du chef', 1),
  ('d40a0000-0000-4000-8000-000000000005', 'Le dessert maison', 2);

select ok(
  public.duo_jouable('d40a0000-0000-4000-8000-000000000005'),
  'JEU-0 le plateau Duo est JOUABLE : ce qui suit ne fait donc varier que le DROIT, jamais le seuil');
select ok(
  not public.org_has_module_access(
    'd40a0000-0000-4000-8000-000000000005', 'duo')
  and not public.org_has_module_access(
    'd40a0000-0000-4000-8000-000000000005', 'bande'),
  'JEU-0b … et PORTE n''a AUCUN des deux jeux, À L''INSTANT QUE LA RPC LIT');

select is(
  public.vitrine_public_state('tap-produit-porte') #> '{portes,experiences,bande}',
  'false'::jsonb,
  'JEU-1 sans le droit `bande`, la page N''ANNONCE PAS le Portrait de la Bande — c''est le défaut que DUO-3a répare : elle l''annonçait à tous, et le clic se prenait le refus de create_player_lobby');
select is(
  public.vitrine_public_state('tap-produit-porte') #> '{portes,experiences,duo}',
  'false'::jsonb,
  'JEU-2 … et le Duo reste fermé lui aussi, PLATEAU JOUABLE COMPRIS : c''est bien le droit qui manque');

-- LA FORME NE BOUGE PAS. `bande` est PRÉSENTE à faux, jamais absente — motif
-- des six listes de VIT-3 et du drapeau `duo` de L17 : une clé qui apparaît et
-- disparaît oblige l'écran à porter deux chemins pour un seul état. La liste
-- est CLOSE : une septième clé ajoutée un jour fera rougir ici.
--
-- `loyalty` L'A REJOINTE EN VIT-32, ET SOUS SA PROPRE FORME : une LISTE vide, et
-- non un booléen à faux. L'adresse du passeport (`/passeport/{id}`) porte un
-- identifiant que rien d'autre ne publie — un drapeau aurait dit qu'il existe un
-- passeport sans dire où. La forme, elle, ne bouge pas davantage : la clé est
-- présente et vide, jamais absente.
select results_eq(
  $$select key from jsonb_object_keys(
      public.vitrine_public_state('tap-produit-porte') #> '{portes,experiences}') as key
     order by key$$,
  $$values ('bande'), ('calendars'), ('duo'), ('loyalty'), ('pronostics'),
           ('quiz')$$,
  'JEU-3 le bloc Expériences porte ses SIX clés, `bande` à faux et `loyalty` vide comprises, et cette liste est close');

-- LE CONTRÔLE DE PORTÉE, MOITIÉ « BANDE ». Sans lui, JEU-1 serait vert le jour
-- où cette organisation échouerait pour une tout autre raison.
insert into public.organization_module_grants
  (organization_id, module, kind, source, starts_at, ends_at)
values
  ('d40a0000-0000-4000-8000-000000000005', 'bande', 'pass', 'backoffice',
   now() - interval '1 day', now() + interval '365 days');

select is(
  public.vitrine_public_state('tap-produit-porte') #> '{portes,experiences,bande}',
  'true'::jsonb,
  'JEU-4 le SEUL droit `bande` posé, la MÊME page annonce le jeu : c''était bien lui qui fermait la porte');
select is(
  public.vitrine_public_state('tap-produit-porte') #> '{portes,experiences,duo}',
  'false'::jsonb,
  'JEU-5 … et le Duo N''A PAS SUIVI : les deux portes ont chacune leur clé, aucune ne lit celle de l''autre');

-- LE CONTRÔLE DE PORTÉE, MOITIÉ « DUO » — et c'est la NON-RÉGRESSION du lot :
-- la conjonction droit + seuil de 20261020120000 doit se comporter exactement
-- comme avant DUO-3a, de part et d'autre de la même transition.
insert into public.organization_module_grants
  (organization_id, module, kind, source, starts_at, ends_at)
values
  ('d40a0000-0000-4000-8000-000000000005', 'duo', 'pass', 'backoffice',
   now() - interval '1 day', now() + interval '365 days');

select is(
  public.vitrine_public_state('tap-produit-porte') #> '{portes,experiences,duo}',
  'true'::jsonb,
  'JEU-6 le droit `duo` posé à son tour et le plateau étant jouable, la porte du Duo s''ouvre : la conjonction de 20261020120000 est INTACTE');
select is(
  public.vitrine_public_state('tap-produit-porte') #> '{portes,experiences,bande}',
  'true'::jsonb,
  'JEU-7 … et celle de la Bande n''a pas bougé');

-- LE DERNIER MAILLON : la porte et le refus disent LA MÊME CHOSE. `duo` est
-- retiré seul ; la porte se referme, et le seuil n'y est pour rien puisque le
-- plateau n'a pas bougé. C'est la propriété que L17 tenait et que ce lot devait
-- rendre à `bande` — les deux gardes ne peuvent plus diverger que si l'une est
-- modifiée seule.
update public.organization_module_grants
   set revoked_at = now() - interval '1 hour',
       revoked_reason = 'témoin du test'
 where organization_id = 'd40a0000-0000-4000-8000-000000000005'
   and module = 'duo';

select is(
  public.vitrine_public_state('tap-produit-porte') #> '{portes,experiences,duo}',
  'false'::jsonb,
  'JEU-8 le droit `duo` retiré, la porte se referme — le plateau, lui, n''a pas bougé');
select ok(
  public.duo_jouable('d40a0000-0000-4000-8000-000000000005'),
  'JEU-9 … et on le vérifie plutôt que de le supposer : le plateau est TOUJOURS jouable, seul le droit a changé');


-- ════════════════════════════════════════════════════════════
-- 5 ter. LA PORTE DU PASSEPORT DE FIDÉLITÉ (VIT-32)
--
-- Elle n'existait PAS DU TOUT. `portes.experiences` publiait les quiz, les
-- calendriers, les pronostics et les deux salons — et rien pour le passeport,
-- alors que sa page publique existe depuis 20260725120000. Un client attablé
-- n'y arrivait qu'en connaissant déjà l'adresse : le cul-de-sac que VIT-3 a
-- défait pour Réserver, resté ouvert pour la fidélité.
--
-- ── DEUX GARDES, ET ELLES SONT PROUVÉES SÉPARÉMENT ──
--
-- Le droit `loyalty` ET `status = 'active'` — les deux refus exacts de
-- `loadLoyaltyContext`. Les poser ensemble aurait rendu la porte ouverte d'un
-- coup, et une garde qui aurait oublié le statut serait passée inaperçue. On
-- pose donc le PROGRAMME d'abord, sans le droit (PASS-1 : fermée), puis le
-- droit (PASS-2 : ouverte), puis un SECOND programme en brouillon (PASS-4 : il
-- n'entre pas), puis on retire le droit (PASS-5 : refermée).
--
-- ── LES CINQ AUTRES CLÉS SONT PROUVÉES INCHANGÉES ──
--
-- C'est la non-régression du lot, et elle est portée par JEU-3 (la liste close
-- des clés) et par PASS-3 : à l'instant où la porte du passeport s'ouvre, celles
-- du Duo et de la Bande n'ont pas bougé d'un iota. Une porte qui lirait la clé
-- d'une autre — la faute exacte que DUO-3a a réparée — serait vue ici.
-- ════════════════════════════════════════════════════════════

-- PORTE n'a PAS `addon_loyalty` (défaut `false` à l'insertion) et le miroir de
-- §3 ne recopie `vitrine` que vers `reserver`, `duo` et `bande` : le droit
-- `loyalty` est donc absent, à l'instant que la RPC lit. On le vérifie plutôt
-- que de le supposer — sans quoi PASS-1 serait vert pour la mauvaise raison.
select ok(
  not public.org_has_module_access(
    'd40a0000-0000-4000-8000-000000000005', 'loyalty'),
  'PASS-0 PORTE n''a AUCUN droit `loyalty`, À L''INSTANT QUE LA RPC LIT');

insert into public.loyalty_programs (id, organization_id, name, status)
values
  ('d40a0000-0000-4000-8000-0000000000a1',
   'd40a0000-0000-4000-8000-000000000005', 'Carte du Comptoir', 'active');

select is(
  public.vitrine_public_state('tap-produit-porte') #> '{portes,experiences,loyalty}',
  '[]'::jsonb,
  'PASS-1 le programme est ACTIF mais le droit manque : la page n''annonce PAS le passeport — elle enverrait le client sur un `unavailable` signé du commerce');

insert into public.organization_module_grants
  (organization_id, module, kind, source, starts_at, ends_at)
values
  ('d40a0000-0000-4000-8000-000000000005', 'loyalty', 'pass', 'backoffice',
   now() - interval '1 day', now() + interval '365 days');

-- L'IDENTIFIANT ET LE NOM, ET NON UN SIMPLE COMPTE : c'est l'adresse publique
-- `/passeport/{id}` que l'écran doit pouvoir construire. Un booléen n'aurait
-- rien eu à peindre — le passeport, contrairement aux deux salons, n'a pas
-- d'adresse déductible du slug.
select is(
  public.vitrine_public_state('tap-produit-porte') #> '{portes,experiences,loyalty}',
  '[{"id": "d40a0000-0000-4000-8000-0000000000a1", "nom": "Carte du Comptoir"}]'::jsonb,
  'PASS-2 le SEUL droit `loyalty` posé, la MÊME page annonce le passeport, AVEC SON IDENTIFIANT : c''était bien lui qui fermait la porte');

select ok(
  (public.vitrine_public_state('tap-produit-porte') #>> '{portes,experiences,duo}')::boolean is false
  and (public.vitrine_public_state('tap-produit-porte') #>> '{portes,experiences,bande}')::boolean is true,
  'PASS-3 … et les deux portes de salon n''ont pas bougé : `duo` reste fermé (son droit a été retiré en JEU-8), `bande` reste ouvert');

-- LE STATUT EST L'AUTRE MOITIÉ DE LA GARDE. Un brouillon rend `unavailable`
-- côté page publique : l'annoncer serait la même promesse rompue que sans le
-- droit, à ceci près qu'aucun achat ne la réparerait.
insert into public.loyalty_programs (id, organization_id, name, status)
values
  ('d40a0000-0000-4000-8000-0000000000a2',
   'd40a0000-0000-4000-8000-000000000005', 'Brouillon de la rentree', 'draft'),
  ('d40a0000-0000-4000-8000-0000000000a3',
   'd40a0000-0000-4000-8000-000000000005', 'Ancienne carte', 'archived');

select results_eq(
  $$select jsonb_array_length(
      public.vitrine_public_state('tap-produit-porte') #> '{portes,experiences,loyalty}')$$,
  array[1],
  'PASS-4 un BROUILLON et un ARCHIVÉ n''entrent pas dans la porte : seul le programme actif est annoncé, comme le veut loadLoyaltyContext');

update public.organization_module_grants
   set revoked_at = now() - interval '1 hour',
       revoked_reason = 'témoin du test'
 where organization_id = 'd40a0000-0000-4000-8000-000000000005'
   and module = 'loyalty';

select is(
  public.vitrine_public_state('tap-produit-porte') #> '{portes,experiences,loyalty}',
  '[]'::jsonb,
  'PASS-5 le droit retiré, la porte se referme — le programme, lui, n''a pas bougé et reste actif');

select ok(
  exists (select 1 from public.loyalty_programs
           where id = 'd40a0000-0000-4000-8000-0000000000a1'
             and status = 'active'),
  'PASS-6 … et on le vérifie plutôt que de le supposer : c''est bien le DROIT qui a fermé la porte, pas le programme qui aurait disparu');

-- On repose le droit : JEU-3 et JEU-3b ci-dessous décrivent la FORME du
-- document, et une clé mesurée sur une porte fermée dirait moins.
insert into public.organization_module_grants
  (organization_id, module, kind, source, starts_at, ends_at)
values
  ('d40a0000-0000-4000-8000-000000000005', 'loyalty', 'pass', 'backoffice',
   now() - interval '1 day', now() + interval '365 days');


-- ── JEU-3b : LE VOCABULAIRE DES CHOIX EST CELUI DES PORTES, MOT POUR MOT ──
--
-- C'est l'invariant sur lequel repose TOUT le croisement de `BlocExperiences` :
-- l'écran y filtre `portes.experiences[cle]` par `theme.jeux[cle]`, clé par clé,
-- sans table de traduction. Renommer `calendars` d'un seul côté ne casserait
-- rien de visible — ça cesserait simplement de masquer ce que le commerçant a
-- décoché, et sa carte annoncerait de nouveau le calendrier qu'il vient de
-- retirer.
--
-- ELLE NE PEUT PAS VIVRE CÔTÉ TYPESCRIPT, et c'est pourquoi elle est ici :
-- `vitrine_public_state` est PATCHÉE par `pg_get_functiondef` depuis
-- 20261023120000, si bien que sa dernière définition en FICHIER ne porte ni
-- `bande` ni `loyalty`. Une garde textuelle y chercherait des clés que le
-- fichier n'a jamais eues. Ici, les deux objets VIVANTS sont interrogeables :
-- le document rendu d'un côté, le vocabulaire installé de l'autre.
--
-- LA GARDE DE LA GARDE VIENT D'ABORD. `substring` rend NULL si l'ancre a
-- disparu, ce qui donnerait deux ensembles… dont l'un vide, et `set_eq` le
-- verrait — mais il le dirait mal. On lève donc explicitement.
select ok(
  (select pg_catalog.substring(
            p.prosrc,
            'jsonb_object_keys\(v_jeux\) k\s+where k not in \(([^)]*)\)')
     from pg_catalog.pg_proc p
    where p.oid = 'public.is_valid_vitrine_theme(jsonb)'::regprocedure)
  is not null,
  'JEU-3b0 la clause `jeux` du validateur est LISIBLE : sans cette ligne, la garde suivante comparerait un ensemble vide et passerait au vert sans rien mesurer');

select set_eq(
  $$select k from jsonb_object_keys(
      public.vitrine_public_state('tap-produit-porte') #> '{portes,experiences}') as k$$,
  $$select m.mot[1]
      from pg_catalog.regexp_matches(
             (select pg_catalog.substring(
                       p.prosrc,
                       'jsonb_object_keys\(v_jeux\) k\s+where k not in \(([^)]*)\)')
                from pg_catalog.pg_proc p
               where p.oid = 'public.is_valid_vitrine_theme(jsonb)'::regprocedure),
             '''([a-z_]+)''', 'g') as m(mot)$$,
  'JEU-3b ce que le commerçant peut MASQUER est exactement ce que la page peut OUVRIR : les six mots de `theme.jeux` sont les six clés de `portes.experiences`, et le croisement de BlocExperiences n''a aucune traduction à faire');


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
