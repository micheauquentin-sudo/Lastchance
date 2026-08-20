-- ============================================================
-- UNE UNITÉ BLOQUÉE N'EST JAMAIS ATTRIBUÉE DEUX FOIS (RES-5, lot L9)
--
-- Ce que ce fichier prouve, et dans quel ordre :
--
--   1. LA 10e FAMILLE EST CARTOGRAPHIÉE PARTOUT. Les quatre sites SQL du
--      registre universel — famille admise, forme du code, correspondance
--      famille↔préfixe, filtre d'entrée de la caisse — plus les deux triggers.
--      Un site oublié ne se voit pas : il rend simplement un code introuvable au
--      comptoir, des mois plus tard, devant un client.
--   2. LA DERNIÈRE UNITÉ NE PART QU'UNE FOIS. Deux prises sur un stock de 1 :
--      la première tient, la seconde rend `sold_out` avec `remaining: 0`.
--   3. L'EXPIRÉ NE COMPTE PLUS, ET L'UNITÉ EST REVENUE SEULE. Une prise dont la
--      fenêtre est passée cesse d'être comptée : une prise NEUVE passe sur la
--      même offre, alors qu'AUCUNE ligne n'a changé d'état et qu'aucun travail
--      de fond n'a tourné. C'est l'invariant central du lot — la restitution
--      arithmétique — et c'est ce qui la rend exactement unique : il n'y a pas
--      de geste, donc pas de geste à répéter.
--   4. L'ANNULÉ PAREIL, ET UNE SEULE FOIS. Rejouer l'annulation n'écrit rien et
--      ne repousse pas `cancelled_at` ; l'unité ne revient pas deux fois.
--   5. LE RETIRÉ COMPTE POUR TOUJOURS. Passé la fenêtre, une unité CONSOMMÉE
--      reste comptée — sinon une part mangée serait remise en vente.
--   6. LE PLAFOND PAR PERSONNE, et son idempotence : au plafond, on rend LA
--      prise existante et son code, jamais un refus sec.
--   7. LE RETRAIT PASSE PAR LA CAISSE UNIVERSELLE, ET UNE SEULE FOIS. Le code
--      `RESA-` est routé ; hors fenêtre il est refusé AUX DEUX BOUTS — avant
--      (`source_refused`, la garde du bras source) et après (`expired`,
--      l'échéance gravée que le registre applique) ; la seconde présentation
--      rend `already_redeemed`. Hors fenêtre, la prise n'est PAS consommée.
--   8. LE PORTEFEUILLE. La prise apparaît dans `player_wallet` par le miroir du
--      registre, avec son libellé gravé.
--   9. LE VOISIN EST MUET, et il ne l'est pas parce qu'il serait cassé : sa
--      propre offre fonctionne normalement.
--
-- ── CE QUE CE FICHIER NE PROUVE PAS, ET IL FAUT LE DIRE ──
--
-- pgTAP tourne dans UNE session et UNE transaction : il ne peut pas lancer deux
-- `hold_stock_offer` réellement SIMULTANÉS. Ce qui est prouvé en section 2,
-- c'est que le second appel VOIT le premier — donc que le comptage est bien
-- relu à chaque appel et non mis en cache. Ce qui rend la course sûre, c'est le
-- verrou d'avis, et il est vérifié SÉPARÉMENT (section 2 bis) en lisant le corps
-- INSTALLÉ de la fonction dans le catalogue. La sérialisation elle-même est une
-- propriété de Postgres ; prétendre la démontrer ici serait un vert qui ne
-- prouve rien. Même honnêteté que `reserver_attente.test.sql` et
-- `reserver_queue.test.sql` sur leurs verrous.
--
-- De même, l'expiration est SIMULÉE en reculant `redeem_expires_at` sur la
-- ligne — c'est le seul moyen de faire passer le temps dans une transaction.
-- C'est fidèle : la colonne est GRAVÉE et fait foi seule, c'est précisément ce
-- que la section 3 vérifie au passage.
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
insert into public.organizations
  (id, name, slug, subscription_status, plan, timezone, data_retention_months)
values
  ('5c100000-0000-4000-8000-00000000000a', 'Stock A', 'tap-stock-a',
   'active', 'starter', 'Europe/Paris', 6),
  ('5c100000-0000-4000-8000-00000000000b', 'Stock B', 'tap-stock-b',
   'active', 'starter', 'Europe/Paris', 6);

insert into public.organization_module_grants
  (organization_id, module, kind, source, starts_at, ends_at)
values
  ('5c100000-0000-4000-8000-00000000000a', 'vitrine', 'pass', 'backoffice',
   now() - interval '1 day', now() + interval '365 days'),
  ('5c100000-0000-4000-8000-00000000000b', 'vitrine', 'pass', 'backoffice',
   now() - interval '1 day', now() + interval '365 days');

-- Les acteurs de comptoir. Le CAISSIER suffit à remettre une unité : c'est un
-- geste de comptoir, et le vérifier ici évite qu'un durcissement futur ferme la
-- porte au rôle qui s'en sert le plus.
insert into auth.users
  (id, aud, role, email, encrypted_password, created_at, updated_at)
values
  ('5c100000-0000-4000-8000-000000000f01', 'authenticated', 'authenticated',
   'caissier-a@test.local', '', now(), now()),
  ('5c100000-0000-4000-8000-000000000f02', 'authenticated', 'authenticated',
   'proprio-b@test.local', '', now(), now());

insert into public.organization_members (organization_id, user_id, role) values
  ('5c100000-0000-4000-8000-00000000000a',
   '5c100000-0000-4000-8000-000000000f01', 'cashier'),
  ('5c100000-0000-4000-8000-00000000000b',
   '5c100000-0000-4000-8000-000000000f02', 'owner');

-- Les offres. Toutes `open`. Les fenêtres sont RELATIVES à `now()` pour que le
-- fichier tienne quelle que soit l'heure d'exécution.
--   101 : stock 1 — la dernière unité (section 2)
--   102 : stock 1 — l'expiration arithmétique (section 3)
--   103 : stock 3, plafond 2 par personne (section 6) — ÉPUISÉE à la fin de
--         cette section-là, d'où l'offre 108 dédiée au portefeuille
--   108 : stock 2 — le pont d'identité et le portefeuille (section 8)
--   104 : stock 2, FENÊTRE À VENIR — le « Drop » (section 7, borne basse)
--   105 : stock 1 — l'annulation idempotente (section 4)
--   106 : stock 1 — le retiré compte toujours (section 5)
--   107 : stock 1 — le retrait nominal et le portefeuille (sections 7 et 8)
insert into public.reservation_stock_offers
  (id, organization_id, title, description, stock_total,
   window_starts_at, window_ends_at, per_player_limit, status)
values
  ('5c100000-0000-4000-8000-000000000101', '5c100000-0000-4000-8000-00000000000a',
   'Dernière part', null, 1,
   now() - interval '1 hour', now() + interval '3 hours', 1, 'open'),
  ('5c100000-0000-4000-8000-000000000102', '5c100000-0000-4000-8000-00000000000a',
   'Pain de la veille', null, 1,
   now() - interval '1 hour', now() + interval '3 hours', 1, 'open'),
  ('5c100000-0000-4000-8000-000000000103', '5c100000-0000-4000-8000-00000000000a',
   'Panier anti-gaspi', null, 3,
   now() - interval '1 hour', now() + interval '3 hours', 2, 'open'),
  ('5c100000-0000-4000-8000-000000000104', '5c100000-0000-4000-8000-00000000000a',
   'Drop de 19 h', 'Trois invendus, à retirer entre 19 h et 20 h.', 2,
   now() + interval '2 hours', now() + interval '4 hours', 1, 'open'),
  ('5c100000-0000-4000-8000-000000000105', '5c100000-0000-4000-8000-00000000000a',
   'Part rendue', null, 1,
   now() - interval '1 hour', now() + interval '3 hours', 1, 'open'),
  ('5c100000-0000-4000-8000-000000000106', '5c100000-0000-4000-8000-00000000000a',
   'Part mangée', null, 1,
   now() - interval '1 hour', now() + interval '3 hours', 1, 'open'),
  ('5c100000-0000-4000-8000-000000000107', '5c100000-0000-4000-8000-00000000000a',
   'Tarte du comptoir', null, 1,
   now() - interval '1 hour', now() + interval '3 hours', 1, 'open'),
  ('5c100000-0000-4000-8000-000000000108', '5c100000-0000-4000-8000-00000000000a',
   'Panier du portefeuille', null, 2,
   now() - interval '1 hour', now() + interval '3 hours', 1, 'open'),
  -- Chez le VOISIN.
  ('5c100000-0000-4000-8000-000000000109', '5c100000-0000-4000-8000-00000000000b',
   'Offre du voisin', null, 5,
   now() - interval '1 hour', now() + interval '3 hours', 1, 'open');


-- ════════════════════════════════════════════════════════════
-- 1. LA 10e FAMILLE EST CARTOGRAPHIÉE
--
-- Six sites, et chacun est vérifié par ce qu'il PRODUIT plutôt que par la
-- présence d'une chaîne dans un texte — sauf les deux qui ne sont observables
-- que dans le catalogue.
-- ════════════════════════════════════════════════════════════

select has_table('public', 'reservation_stock_offers', 'les offres de stock existent');
select has_table('public', 'reservation_stock_holds', 'les prises de stock existent');

select has_trigger('public', 'reservation_stock_holds',
  'reservation_stock_holds_reward_issuance',
  'les prises de stock sont miroitées au registre universel');
select has_trigger('public', 'reservation_stock_holds',
  'reservation_stock_holds_reward_issuance_delete',
  'la disparition d''une prise de stock est suivie');

-- ① La famille est admise par le registre. Prouvé par l'écriture, pas par le
-- texte de la contrainte : c'est l'écriture qui doit passer.
select lives_ok(
  $$insert into public.reward_issuances
      (organization_id, source_type, source_id, code, label, issued_at)
    values ('5c100000-0000-4000-8000-00000000000a',
            'reserver_stock', '5c100000-0000-4000-8000-0000000000e1',
            'RESA-ZZZZZZZZ', 'sonde', now())$$,
  'le registre admet la famille reserver_stock et le préfixe RESA-');

-- ③ La correspondance famille↔préfixe MORD dans les deux sens : un code d'une
-- autre famille sur cette famille est refusé, et réciproquement. Sans cette
-- assertion, un `when 'reserver_stock' then true` aurait passé la précédente.
select throws_ok(
  $$insert into public.reward_issuances
      (organization_id, source_type, source_id, code, label, issued_at)
    values ('5c100000-0000-4000-8000-00000000000a',
            'reserver_stock', '5c100000-0000-4000-8000-0000000000e2',
            'GAIN-ZZZZZZZZ', 'sonde', now())$$,
  '23514',
  null,
  'un code GAIN- est refusé sur la famille reserver_stock');
select throws_ok(
  $$insert into public.reward_issuances
      (organization_id, source_type, source_id, code, label, issued_at)
    values ('5c100000-0000-4000-8000-00000000000a',
            'wheel', '5c100000-0000-4000-8000-0000000000e3',
            'RESA-ZZZZZZZZ', 'sonde', now())$$,
  '23514',
  null,
  'un code RESA- est refusé sur la famille wheel');

delete from public.reward_issuances
 where source_id = '5c100000-0000-4000-8000-0000000000e1';

-- ⑤ La branche d'émission est dans le corps INSTALLÉ de sync_reward_issuance —
-- et les HUIT échéances gravées de 20260904120000 y sont TOUJOURS. Cette
-- seconde moitié est la vraie garde : la migration L9 dérive la fonction depuis
-- sa définition vivante, et une recopie maladroite de l'original aurait rendu
-- nulle l'échéance de huit familles sans qu'aucun test de ce lot ne le voie.
select ok(
  (select p.prosrc like '%reservation_stock_holds%'
     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'sync_reward_issuance'),
  'la branche des prises de stock est dans le corps installé de sync_reward_issuance');
select ok(
  (select p.prosrc not like '%null::timestamptz as expires_at%'
     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'sync_reward_issuance'),
  'AUCUNE branche de sync_reward_issuance ne rend une échéance nulle — les huit gravures de 20260904120000 ont survécu à la dérivation L9');

-- ④ Le filtre d'entrée de la caisse connaît le préfixe.
select ok(
  (select p.prosrc like '%RESA%' and p.prosrc like '%redeem_stock_hold%'
     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'redeem_reward_by_code'),
  'redeem_reward_by_code accepte le préfixe RESA- et route vers le bras source');


-- ════════════════════════════════════════════════════════════
-- 2. LA DERNIÈRE UNITÉ NE PART QU'UNE FOIS
-- ════════════════════════════════════════════════════════════

create temporary table tap_h1 on commit drop as
select public.hold_stock_offer(
  '5c100000-0000-4000-8000-00000000000a',
  '5c100000-0000-4000-8000-000000000101',
  repeat('a1', 32)) as r;

select is((select r ->> 'state' from tap_h1), 'held',
  'la première prise tient l''unique unité');
select is((select (r ->> 'remaining')::int from tap_h1), 0,
  'le restant tombe à zéro dans la réponse même');

-- Un AUTRE joueur, sur la même offre, dans la même transaction : il voit la
-- prise du premier. C'est le comptage relu, pas un cache.
create temporary table tap_h2 on commit drop as
select public.hold_stock_offer(
  '5c100000-0000-4000-8000-00000000000a',
  '5c100000-0000-4000-8000-000000000101',
  repeat('b2', 32)) as r;

select is((select r ->> 'state' from tap_h2), 'sold_out',
  'la seconde prise sur la dernière unité est refusée');
select is((select (r ->> 'remaining')::int from tap_h2), 0,
  'le refus annonce zéro, et RIEN d''autre — aucun oracle sur le stock réel');
select is(
  (select count(*)::int from public.reservation_stock_holds
    where offer_id = '5c100000-0000-4000-8000-000000000101'),
  1,
  'une seule ligne de prise existe : l''unité n''a pas été attribuée deux fois');

-- ── 2 bis. LE VERROU, LU DANS LE CATALOGUE ──
-- Voir l'en-tête : la sérialisation ne se démontre pas dans une transaction
-- unique. Ce qui se vérifie, c'est que les TROIS chemins qui touchent au
-- restant prennent bien un verrou, et LE MÊME.
select ok(
  (select bool_and(p.prosrc like '%pg_advisory_xact_lock%')
     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in ('hold_stock_offer', 'cancel_stock_hold', 'redeem_stock_hold')),
  'les trois chemins qui touchent au restant prennent un verrou d''avis');
select is(
  (select count(*)::int
     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in ('hold_stock_offer', 'cancel_stock_hold', 'redeem_stock_hold')
      and p.prosrc like '%reservation_stock_offer:%'),
  3,
  'et c''est la MÊME clé — organisation comprise — dans les trois');


-- ════════════════════════════════════════════════════════════
-- 3. L'EXPIRÉ NE COMPTE PLUS — LA RESTITUTION EST ARITHMÉTIQUE
--
-- Le cœur du lot. On prend l'unique unité, on fait passer la fenêtre de CETTE
-- prise, et une prise NEUVE doit passer — sans qu'aucune ligne n'ait changé
-- d'état, sans qu'aucun compteur n'ait été touché, sans qu'aucun job n'ait
-- tourné. La prise d'origine reste `held` : c'est vérifié, parce que c'est
-- exactement ce qui rend la restitution unique.
-- ════════════════════════════════════════════════════════════

create temporary table tap_h3 on commit drop as
select public.hold_stock_offer(
  '5c100000-0000-4000-8000-00000000000a',
  '5c100000-0000-4000-8000-000000000102',
  repeat('a1', 32)) as r;

select is((select r ->> 'state' from tap_h3), 'held',
  'l''unique unité du pain de la veille est prise');

-- La fenêtre de cette prise passe. On recule l'ÉCHÉANCE GRAVÉE, pas l'offre :
-- c'est la colonne qui fait foi, et le prouver au passage n'est pas gratuit.
update public.reservation_stock_holds
   set redeem_expires_at = now() - interval '1 minute'
 where offer_id = '5c100000-0000-4000-8000-000000000102';

select is(
  (select status from public.reservation_stock_holds
    where offer_id = '5c100000-0000-4000-8000-000000000102'),
  'held',
  'la prise échue reste `held` : AUCUNE ligne n''a changé d''état');

create temporary table tap_h4 on commit drop as
select public.hold_stock_offer(
  '5c100000-0000-4000-8000-00000000000a',
  '5c100000-0000-4000-8000-000000000102',
  repeat('b2', 32)) as r;

select is((select r ->> 'state' from tap_h4), 'held',
  'l''unité est REVENUE au restant sans qu''on la rende : une prise neuve passe');
select is((select (r ->> 'remaining')::int from tap_h4), 0,
  'et le restant est de nouveau juste');

-- L'écran de comptoir voit la prise éteinte, et il la voit COMME TELLE.
select is(
  (select (o -> 'expired_count')::int
     from pg_catalog.jsonb_array_elements(
       public.stock_offers_staff_state('5c100000-0000-4000-8000-00000000000a')
         -> 'offers') as o
    where o ->> 'offer_id' = '5c100000-0000-4000-8000-000000000102'),
  1,
  'le comptoir compte la prise éteinte sans retrait — la mesure du gaspillage');

-- LA DESCRIPTION EST DANS LE DOCUMENT DE COMPTOIR, et ce n'est pas cosmétique :
-- le panneau d'édition RÉÉCRIT ce champ. Sans elle, le formulaire se
-- préremplissait vide et le premier enregistrement effaçait le texte.
select is(
  (select o ->> 'description'
     from pg_catalog.jsonb_array_elements(
       public.stock_offers_staff_state('5c100000-0000-4000-8000-00000000000a')
         -> 'offers') as o
    where o ->> 'offer_id' = '5c100000-0000-4000-8000-000000000104'),
  'Trois invendus, à retirer entre 19 h et 20 h.',
  'le comptoir lit la description de l''offre — le panneau la réécrit');


-- ════════════════════════════════════════════════════════════
-- 4. L'ANNULÉ REVIENT AUSSI, ET UNE SEULE FOIS
-- ════════════════════════════════════════════════════════════

create temporary table tap_h5 on commit drop as
select public.hold_stock_offer(
  '5c100000-0000-4000-8000-00000000000a',
  '5c100000-0000-4000-8000-000000000105',
  repeat('a1', 32)) as r;

select is((select r ->> 'state' from tap_h5), 'held', 'la part est bloquée');

create temporary table tap_c1 on commit drop as
select public.cancel_stock_hold(
  ((select r ->> 'hold_id' from tap_h5))::uuid, repeat('a1', 32)) as r;

select is((select r ->> 'state' from tap_c1), 'cancelled', 'la part est rendue');

-- LE REJEU N'ÉCRIT RIEN. C'est le point : si `cancelled_at` était repoussé, la
-- restitution aurait eu lieu deux fois — et sur un module qui tiendrait un
-- compteur, l'unité serait revenue deux fois.
create temporary table tap_c2 on commit drop as
select public.cancel_stock_hold(
  ((select r ->> 'hold_id' from tap_h5))::uuid, repeat('a1', 32)) as r;

select is((select r ->> 'state' from tap_c2), 'cancelled',
  'la seconde annulation rend le même état');
select is(
  (select r ->> 'cancelled_at' from tap_c2),
  (select r ->> 'cancelled_at' from tap_c1),
  'et n''a PAS repoussé cancelled_at : la restitution est exactement unique');

select is(
  (select (public.stock_offer_public_state(
             '5c100000-0000-4000-8000-000000000105') ->> 'remaining')::int),
  1,
  'l''unité annulée est bien revenue au restant');


-- ════════════════════════════════════════════════════════════
-- 5. LE RETIRÉ COMPTE POUR TOUJOURS
--
-- Une part mangée ne se remet pas en vente. C'est le PENDANT EXACT de la
-- section 3, et c'est le couple des deux qui fait la démonstration : une prise
-- `held` dont la fenêtre est passée rend son unité, une prise `redeemed` ne la
-- rend JAMAIS — même prédicat de comptage, deux issues opposées, et c'est bien
-- l'état terminal qui fait la différence, pas le temps.
-- ════════════════════════════════════════════════════════════

create temporary table tap_h6 on commit drop as
select public.hold_stock_offer(
  '5c100000-0000-4000-8000-00000000000a',
  '5c100000-0000-4000-8000-000000000106',
  repeat('a1', 32)) as r;

select is((select r ->> 'state' from tap_h6), 'held', 'la part est bloquée');

-- FIXTURE, et il faut dire pourquoi elle n'emprunte pas la caisse : on consomme
-- la prise ET on fait passer sa fenêtre EN UN SEUL geste, tant que la ligne est
-- encore VIVANTE. Le gel d'état terminal (section 11) interdit — à raison — de
-- déplacer l'échéance d'une prise déjà retirée : une échéance gravée ne se
-- réécrit pas après coup. Passer par `redeem_reward_by_code` puis reculer la
-- date serait donc refusé par la base, et c'est une bonne nouvelle, pas une
-- gêne. Le retrait RÉEL par la caisse universelle est prouvé en section 7 ; ce
-- qui est en jeu ICI est le COMPTAGE, et lui seul.
update public.reservation_stock_holds
   set status = 'redeemed',
       redeemed_at = now(),
       redeem_expires_at = now() - interval '1 minute'
 where offer_id = '5c100000-0000-4000-8000-000000000106';

select is(
  (select (public.stock_offer_public_state(
             '5c100000-0000-4000-8000-000000000106') ->> 'remaining')::int),
  0,
  'passé la fenêtre, l''unité CONSOMMÉE reste comptée : elle est sortie du magasin');

-- Et la conséquence qui compte pour le commerçant : personne ne peut reprendre
-- la part. Sur la même offre, au même instant, une prise `held` échue aurait
-- rendu `held` (section 3) ; celle-ci rend `sold_out`.
select is(
  (select public.hold_stock_offer(
     '5c100000-0000-4000-8000-00000000000a',
     '5c100000-0000-4000-8000-000000000106', repeat('b2', 32)) ->> 'state'),
  'sold_out',
  'une part mangée ne se revend pas, même sa fenêtre passée');


-- ════════════════════════════════════════════════════════════
-- 6. LE PLAFOND PAR PERSONNE
-- ════════════════════════════════════════════════════════════

select is(
  (select public.hold_stock_offer(
     '5c100000-0000-4000-8000-00000000000a',
     '5c100000-0000-4000-8000-000000000103', repeat('a1', 32)) ->> 'state'),
  'held', 'première prise sous un plafond de 2');

create temporary table tap_h7 on commit drop as
select public.hold_stock_offer(
  '5c100000-0000-4000-8000-00000000000a',
  '5c100000-0000-4000-8000-000000000103', repeat('a1', 32)) as r;

select is((select r ->> 'state' from tap_h7), 'held', 'deuxième prise : encore permise');

-- LA TROISIÈME EST IDEMPOTENTE, PAS FAUTIVE : on rend la prise existante et son
-- code. Le joueur détient l'objet ; un refus sec lui ferait croire le contraire.
create temporary table tap_h8 on commit drop as
select public.hold_stock_offer(
  '5c100000-0000-4000-8000-00000000000a',
  '5c100000-0000-4000-8000-000000000103', repeat('a1', 32)) as r;

select is((select r ->> 'state' from tap_h8), 'already_held',
  'la troisième prise atteint le plafond par personne');
-- APPARTENANCE, et non égalité à une prise NOMMÉE : les deux prises de ce
-- joueur ont été posées dans la MÊME transaction, donc partagent `created_at`
-- à la microseconde. Laquelle des deux est « la plus récente » n'a pas de
-- réponse ici — la RPC départage par `id`, ce qui la rend STABLE mais pas
-- prédictible depuis un test. Ce qui doit être vrai, et qui l'est : le code
-- rendu est celui d'une prise que cette personne détient RÉELLEMENT.
select ok(
  (select r ->> 'code' from tap_h8) in (
    select code from public.reservation_stock_holds
     where offer_id = '5c100000-0000-4000-8000-000000000103'
       and player_key_hash = repeat('a1', 32)),
  'et rend le code d''une prise que cette personne détient, jamais un refus sec');
select is(
  (select count(*)::int from public.reservation_stock_holds
    where offer_id = '5c100000-0000-4000-8000-000000000103'),
  2,
  'aucune troisième ligne n''a été créée');

-- Le plafond est PAR PERSONNE, pas par offre : un autre joueur passe.
select is(
  (select public.hold_stock_offer(
     '5c100000-0000-4000-8000-00000000000a',
     '5c100000-0000-4000-8000-000000000103', repeat('b2', 32)) ->> 'state'),
  'held', 'un AUTRE joueur prend la troisième unité — le plafond est par personne');


-- ════════════════════════════════════════════════════════════
-- 7. LE RETRAIT — UNE SEULE PORTE, UNE SEULE FOIS, DANS LA FENÊTRE
-- ════════════════════════════════════════════════════════════

create temporary table tap_h9 on commit drop as
select public.hold_stock_offer(
  '5c100000-0000-4000-8000-00000000000a',
  '5c100000-0000-4000-8000-000000000107',
  repeat('a1', 32),
  'client@test.local', true) as r;

select is((select r ->> 'state' from tap_h9), 'held', 'la tarte est bloquée');
select matches((select r ->> 'code' from tap_h9), '^RESA-[A-HJ-NP-Z2-9]{8}$',
  'le code porte le préfixe du registre et l''alphabet sans ambiguïté');

-- Le miroir a fait son travail À L'INSERTION, sans qu'aucune RPC ne l'ait
-- demandé — et il a gravé l'échéance ET le libellé de l'offre.
select is(
  (select label from public.reward_issuances
    where code = (select r ->> 'code' from tap_h9)),
  'Tarte du comptoir',
  'le registre porte le libellé GRAVÉ de l''offre');
select is(
  (select expires_at from public.reward_issuances
    where code = (select r ->> 'code' from tap_h9)),
  (select window_ends_at from public.reservation_stock_offers
    where id = '5c100000-0000-4000-8000-000000000107'),
  'et l''échéance du registre est la FIN DE FENÊTRE, gravée à la prise');

-- ── 7a. AVANT LA FENÊTRE : REFUSÉ, ET LA PRISE N'EST PAS CONSOMMÉE ──
-- L'offre 104 est un Drop dont la fenêtre s'ouvre dans deux heures. La PRISE
-- est permise dès maintenant — c'est la décision du lot — le RETRAIT non.
create temporary table tap_hd on commit drop as
select public.hold_stock_offer(
  '5c100000-0000-4000-8000-00000000000a',
  '5c100000-0000-4000-8000-000000000104', repeat('a1', 32)) as r;

select is((select r ->> 'state' from tap_hd), 'held',
  'LE DROP SE BLOQUE AVANT SON HEURE : la prise est ouverte dès `open`');

create temporary table tap_rd on commit drop as
select * from public.redeem_reward_by_code(
  '5c100000-0000-4000-8000-00000000000a',
  (select r ->> 'code' from tap_hd),
  '5c100000-0000-4000-8000-000000000f01',
  null);

select is((select state from tap_rd), 'source_refused',
  'mais le retrait AVANT la fenêtre est refusé par le bras source');
select is((select redeemed_now from tap_rd), false,
  'et rien n''est consommé');
select is(
  (select status from public.reservation_stock_holds
    where offer_id = '5c100000-0000-4000-8000-000000000104'),
  'held',
  'la prise du Drop reste tenue : le client pourra venir à 19 h');

-- ── 7b. DANS LA FENÊTRE : LE RETRAIT PASSE, ET UNE SEULE FOIS ──
create temporary table tap_r9 on commit drop as
select * from public.redeem_reward_by_code(
  '5c100000-0000-4000-8000-00000000000a',
  (select r ->> 'code' from tap_h9),
  '5c100000-0000-4000-8000-000000000f01',
  780);

select is((select state from tap_r9), 'redeemed', 'le code RESA- est routé et remis');
select is((select redeemed_now from tap_r9), true, 'le geste est réel');
select is((select source_type from tap_r9), 'reserver_stock',
  'et la caisse sait de quelle famille il s''agit');

select is(
  (select status from public.reservation_stock_holds
    where code = (select r ->> 'code' from tap_h9)),
  'redeemed',
  'la PRISE — l''autorité — porte le retrait');
select is(
  (select basket_cents from public.reservation_stock_holds
    where code = (select r ->> 'code' from tap_h9)),
  780,
  'le panier est écrit sur la prise, preuve de retrait pour le staff');
select is(
  (select redeemed_by from public.reservation_stock_holds
    where code = (select r ->> 'code' from tap_h9)),
  '5c100000-0000-4000-8000-000000000f01'::uuid,
  'et l''acteur du comptoir est nommé');
-- Le panier a rejoint le registre SANS que le routeur ait eu à le recopier :
-- l'autorité écrit, le miroir suit.
select is(
  (select basket_cents from public.reward_issuances
    where code = (select r ->> 'code' from tap_h9)),
  780,
  'le miroir a propagé le panier au registre de lui-même');

create temporary table tap_r9b on commit drop as
select * from public.redeem_reward_by_code(
  '5c100000-0000-4000-8000-00000000000a',
  (select r ->> 'code' from tap_h9),
  '5c100000-0000-4000-8000-000000000f01',
  999);

select is((select state from tap_r9b), 'already_redeemed',
  'la seconde présentation du même code est refusée');
select is((select redeemed_now from tap_r9b), false, 'et ne consomme rien');
select is(
  (select basket_cents from public.reservation_stock_holds
    where code = (select r ->> 'code' from tap_h9)),
  780,
  'le panier du premier retrait n''est pas réécrit par la seconde tentative');

-- ── 7c. APRÈS LA FENÊTRE : REFUSÉ PAR L'ÉCHÉANCE GRAVÉE ──
-- On se sert de la prise que `a1` tient depuis la section 2 sur l'offre 101, et
-- on fait passer SA fenêtre. Elle est encore `held`, donc l'échéance gravée est
-- déplaçable — c'est précisément ce que le gel interdirait sur une prise
-- terminale (section 5).
update public.reservation_stock_holds
   set redeem_expires_at = now() - interval '1 minute'
 where offer_id = '5c100000-0000-4000-8000-000000000101';

create temporary table tap_ra on commit drop as
select * from public.redeem_reward_by_code(
  '5c100000-0000-4000-8000-00000000000a',
  (select code from public.reservation_stock_holds
    where offer_id = '5c100000-0000-4000-8000-000000000101'),
  '5c100000-0000-4000-8000-000000000f01',
  null);

select is((select state from tap_ra), 'expired',
  'le retrait APRÈS la fenêtre est refusé par l''échéance gravée');
select is((select redeemed_now from tap_ra), false,
  'et la prise n''est pas consommée');
select is(
  (select status from public.reservation_stock_holds
    where offer_id = '5c100000-0000-4000-8000-000000000101'),
  'held',
  'la prise expirée reste `held` — rien ne l''a réécrite');

-- ── 7d. UNE PRISE ANNULÉE NE SE RETIRE PAS ──
select is(
  (select state from public.redeem_reward_by_code(
     '5c100000-0000-4000-8000-00000000000a',
     (select code from public.reservation_stock_holds
       where offer_id = '5c100000-0000-4000-8000-000000000105'),
     '5c100000-0000-4000-8000-000000000f01', null)),
  'cancelled',
  'une part rendue ne se retire pas au comptoir');


-- ════════════════════════════════════════════════════════════
-- 8. LE PORTEFEUILLE
--
-- Le pont d'identité est créé AVANT la prise : c'est l'ordre réel du produit
-- (le joueur est reconnu en arrivant sur la page), et c'est le seul ordre où
-- `player_id` est résolu à l'émission — sinon il faut un rattrapage
-- (player_wallet.test.sql, section 6).
-- ════════════════════════════════════════════════════════════

select is(
  (select count(*) from public.resolve_player_identity(
     repeat('d1', 32), '5c100000-0000-4000-8000-00000000000a',
     'reserver_stock', '5c100000-0000-4000-8000-000000000108',
     repeat('c3', 32), 'direct', null)),
  1::bigint,
  'LE PONT ACCEPTE LA 10e FAMILLE : joueur, appareil et pont legacy sont créés');

create temporary table tap_hw on commit drop as
select public.hold_stock_offer(
  '5c100000-0000-4000-8000-00000000000a',
  '5c100000-0000-4000-8000-000000000108', repeat('c3', 32)) as r;

select is((select r ->> 'state' from tap_hw), 'held',
  'le joueur ponté bloque son panier du portefeuille');

select is(
  (select count(*)::int from public.player_wallet(repeat('d1', 32), 50)
    where code = (select r ->> 'code' from tap_hw)),
  1,
  'LA PRISE EST DANS LE PORTEFEUILLE, par le miroir du registre');
select is(
  (select label from public.player_wallet(repeat('d1', 32), 50)
    where code = (select r ->> 'code' from tap_hw)),
  'Panier du portefeuille',
  'avec le libellé gravé de l''offre');
select is(
  (select status from public.player_wallet(repeat('d1', 32), 50)
    where code = (select r ->> 'code' from tap_hw)),
  'active',
  'et l''état « active » tant que la fenêtre court');


-- ════════════════════════════════════════════════════════════
-- 9. `reservation_public_state` — le joueur relit ses parts
-- ════════════════════════════════════════════════════════════

select ok(
  (select public.reservation_public_state(
            '5c100000-0000-4000-8000-00000000000a', repeat('a1', 32))
          ? 'stockHolds'),
  'le document du joueur porte la clé stockHolds');

select ok(
  (select count(*) > 0
     from pg_catalog.jsonb_array_elements(
       public.reservation_public_state(
         '5c100000-0000-4000-8000-00000000000a', repeat('a1', 32))
       -> 'stockHolds') as h
    where h ->> 'offer_id' = '5c100000-0000-4000-8000-000000000104'),
  'la prise du Drop y figure, avec son offre');

-- L'EXPIRATION EST TRANCHÉE PAR LE SERVEUR, pas par le client : la ligne est
-- `held`, le document dit `expired: true`. Sans cela, la page afficherait
-- « réservé » sur une part déjà remise en vente.
select is(
  (select h ->> 'expired'
     from pg_catalog.jsonb_array_elements(
       public.reservation_public_state(
         '5c100000-0000-4000-8000-00000000000a', repeat('a1', 32))
       -> 'stockHolds') as h
    where h ->> 'offer_id' = '5c100000-0000-4000-8000-000000000101'),
  'true',
  'une prise échue est rendue `expired` alors que sa ligne est encore `held`');

-- Ni l'empreinte ni l'adresse ne sortent du document.
select ok(
  (select public.reservation_public_state(
            '5c100000-0000-4000-8000-00000000000a', repeat('a1', 32))::text
          not like '%client@test.local%'),
  'l''adresse du joueur ne sort JAMAIS du document public');


-- ════════════════════════════════════════════════════════════
-- 10. LE VOISIN EST MUET — ET IL N'EST PAS CASSÉ
-- ════════════════════════════════════════════════════════════

-- Sa propre offre marche : sans cela, tous les zéros ci-dessous seraient vrais
-- pour la mauvaise raison.
create temporary table tap_hb on commit drop as
select public.hold_stock_offer(
  '5c100000-0000-4000-8000-00000000000b',
  '5c100000-0000-4000-8000-000000000109', repeat('a1', 32)) as r;

select is((select r ->> 'state' from tap_hb), 'held',
  'le voisin sert normalement sa propre offre');

-- Une offre de A, demandée SOUS L'ORGANISATION B : indistinguable d'une offre
-- qui n'existe pas.
select is(
  (select public.hold_stock_offer(
     '5c100000-0000-4000-8000-00000000000b',
     '5c100000-0000-4000-8000-000000000103', repeat('a1', 32)) ->> 'state'),
  'unavailable',
  'une offre de A prise sous B est INDISTINGUABLE d''une offre inexistante');

select is(
  (select public.hold_stock_offer(
     '5c100000-0000-4000-8000-00000000000b',
     '5c100000-0000-4000-8000-0000000009ff', repeat('a1', 32)) ->> 'state'),
  'unavailable',
  'et une offre réellement inexistante rend exactement la même chose');

-- Le comptoir de B ne voit AUCUNE offre de A.
select is(
  (select count(*)::int
     from pg_catalog.jsonb_array_elements(
       public.stock_offers_staff_state('5c100000-0000-4000-8000-00000000000b')
         -> 'offers') as o
    where o ->> 'offer_id' like '5c100000-0000-4000-8000-00000000010%'
      and o ->> 'offer_id' <> '5c100000-0000-4000-8000-000000000109'),
  0,
  'le comptoir du voisin ne voit aucune offre de A');

-- Le comptoir de B ne peut pas retirer un code de A.
select is(
  (select count(*)::int from public.redeem_reward_by_code(
     '5c100000-0000-4000-8000-00000000000b',
     (select r ->> 'code' from tap_hw),
     '5c100000-0000-4000-8000-000000000f02', null)),
  0,
  'un code de A présenté au comptoir de B ne rend AUCUNE ligne');

-- Le document joueur de B ne porte aucune prise de A.
select is(
  (select count(*)::int
     from pg_catalog.jsonb_array_elements(
       public.reservation_public_state(
         '5c100000-0000-4000-8000-00000000000b', repeat('a1', 32))
       -> 'stockHolds') as h
    where h ->> 'offer_id' <> '5c100000-0000-4000-8000-000000000109'),
  0,
  'la page du voisin ne montre rien de ce que la personne a réservé chez A');


-- ════════════════════════════════════════════════════════════
-- 11. L'ÉTAT TERMINAL NE SE QUITTE PAS
--
-- C'est le gardien de l'exactly-once : sans lui, effacer `cancelled_at`
-- ferait repartir une unité déjà rendue, ou pire, une unité déjà CONSOMMÉE.
-- ════════════════════════════════════════════════════════════

select throws_ok(
  $$update public.reservation_stock_holds
       set status = 'held', cancelled_at = null
     where offer_id = '5c100000-0000-4000-8000-000000000105'$$,
  '23514',
  null,
  'une prise annulée ne se rouvre pas');

select throws_ok(
  $$update public.reservation_stock_holds
       set status = 'held', redeemed_at = null, redeemed_by = null,
           basket_cents = null
     where offer_id = '5c100000-0000-4000-8000-000000000106'$$,
  '23514',
  null,
  'une unité CONSOMMÉE ne se remet pas en vente');

-- Mais la purge, elle, doit passer sur une ligne terminale.
select lives_ok(
  $$update public.reservation_stock_holds
       set email = null, consent_transactional_at = null
     where offer_id = '5c100000-0000-4000-8000-000000000107'$$,
  'le gel laisse passer l''effacement des données personnelles');


-- ════════════════════════════════════════════════════════════
-- 12. LA PURGE RGPD — geste (h)
--
-- La ligne reste (le bilan anti-gaspi appartient au commerçant), la personne
-- s'efface. Bornée à l'organisation A, dont la rétention est de 6 mois.
-- ════════════════════════════════════════════════════════════

update public.reservation_stock_holds
   set created_at = now() - interval '30 months'
 where organization_id = '5c100000-0000-4000-8000-00000000000a';

create temporary table tap_avant on commit drop as
select count(*)::int as n from public.reservation_stock_holds
 where organization_id = '5c100000-0000-4000-8000-00000000000a';

select lives_ok(
  $$select public.purge_expired_personal_data()$$,
  'la purge tourne avec le geste des prises de stock');

select is(
  (select count(*)::int from public.reservation_stock_holds
    where organization_id = '5c100000-0000-4000-8000-00000000000a'),
  (select n from tap_avant),
  'AUCUNE prise n''est supprimée : le bilan anti-gaspi reste au commerçant');

select is(
  (select count(*)::int from public.reservation_stock_holds
    where organization_id = '5c100000-0000-4000-8000-00000000000a'
      and (email is not null or consent_transactional_at is not null)),
  0,
  'l''adresse et son consentement sont partis ensemble');

select is(
  (select count(*)::int from public.reservation_stock_holds
    where organization_id = '5c100000-0000-4000-8000-00000000000a'
      and player_key_hash not like 'purge:%'),
  0,
  'et le lien entre les prises d''une même personne est rompu');

-- Le marqueur met la ligne HORS DE PORTÉE des RPC joueur : sa forme ne peut pas
-- franchir la garde d'empreinte.
select is(
  (select count(*)::int
     from pg_catalog.jsonb_array_elements(
       public.reservation_public_state(
         '5c100000-0000-4000-8000-00000000000a', repeat('a1', 32))
       -> 'stockHolds') as h),
  0,
  'une prise purgée ne se relit plus par l''empreinte de son propriétaire');

select * from finish();
rollback;
