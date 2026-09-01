-- ============================================================
-- DUO MIROIR TIENT SES PROMESSES (L17)
--
-- Ce que ce fichier prouve, et dans quel ordre :
--
--   1. LE COMMERÇANT COMPOSE SON PLATEAU, et lui seul. `set_duo_options`
--      remplace la sélection en entier, refuse le caissier, refuse le
--      propriétaire d'en face, refuse un cardinal hors 2..6, refuse un doublon,
--      et refuse un item inconnu du MÊME refus qu'un item du commerce voisin.
--   2. `duo_start` EST IDEMPOTENTE. Deux appels rendent le MÊME document et il
--      n'existe qu'UNE manche — l'arbitrage « une seule manche » tient par la
--      contrainte, pas par la politesse de l'appelant.
--   3. LE CHOIX DE L'AUTRE EST INVISIBLE AVANT LA RÉVÉLATION. C'est LA
--      propriété du lot, et elle est prouvée DEUX FOIS : sur le JEU DE CLÉS
--      (neuf, et la liste est close) et sur le TEXTE du document (ni le nom ni
--      l'identifiant de la fiche choisie par l'autre ne s'y lisent). Avec son
--      CONTRÔLE DE PORTÉE : après la révélation, les deux mêmes assertions
--      doivent s'inverser — sans quoi elles seraient vertes par vacuité.
--   4. LA RÉVÉLATION EST AUTOMATIQUE AU SECOND CHOIX, dans la même transaction,
--      et elle FERME la salle. Cette fermeture — par la révélation OU par le
--      commerçant — VOYAGE jusqu'au joueur, par la neuvième clé `salle_close` :
--      le scrutin du lobby s'est arrêté au verrouillage, `duo_state` est le seul
--      canal qui tourne encore, et la clé ne dit rien de plus qu'un booléen.
--   5. LE CHOIX EST SCELLÉ. Rejouer le même item est idempotent ; en désigner
--      un autre est refusé ET n'écrit rien — Y COMPRIS quand la fiche scellée a
--      disparu (`item_id` nul), le cas où un `<>` rendrait NUL et ouvrirait le
--      sceau de celui-là même que le remède protège.
--   6. LES REFUS SONT INDISTINCTS. Item hors options = item inexistant = item
--      du voisin ; non-membre = lobby inventé.
--   7. LA FICHE PEUT MOURIR, LE CHOIX RESTE (revue L17, M-1). Le nom est GRAVÉ
--      au moment du geste : un renommage ne le touche pas, une suppression ne
--      l'emporte pas, et `autre_a_choisi` cesse d'être révocable par un tiers —
--      c'est l'oracle de l'initié qui se ferme. Avec sa LIMITE, écrite plutôt
--      que tue : les DEUX fiches effacées, l'accord ne se prononce plus.
--   8. LES ACL. service_role seul sur les six RPC de jeu ; `anon` et
--      `authenticated` nus sur les deux tables de partie, `references` /
--      `trigger` / `truncate` compris (leçon SEC-4).
--
-- ── CE QUE CE FICHIER NE PROUVE PAS, ET IL FAUT LE DIRE ──
--
-- pgTAP tourne dans UNE session et UNE transaction : il ne peut pas lancer deux
-- `duo_start` réellement simultanés. Ce qui est prouvé ici, c'est (a) que le
-- second appel VOIT le premier — la propriété qui casse si la création et la
-- lecture ne sont pas le même geste — et (b) que le verrou d'avis attendu EST
-- détenu, sur la clé exacte, recalculée ici comme dans la RPC. La sérialisation
-- elle-même est une propriété de `pg_advisory_xact_lock` ; prétendre la
-- démontrer ici serait un vert qui ne prouve rien. Motif socle_lobby.test.sql,
-- et la même honnêteté.
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
-- A : LE COMMERCE QUI JOUE. Vitrine publiée, module `vitrine` par octroi daté
--     vivant (seul chemin ouvert en bêta), six fiches, quatre options épinglées
--     et une suggestion.
-- B : LE VOISIN. Servi lui aussi — sans son droit, « l'item du voisin est
--     refusé » se confondrait avec « le voisin n'a pas de catalogue ». Il porte
--     UNE fiche, qui est celle qu'on tentera d'épingler chez A.
-- C : LE COMMERCE QUI N'A PAS CONFIGURÉ. Deux fiches, UNE SEULE option
--     épinglée : c'est la borne basse de `duo_start`, et elle a besoin d'une
--     organisation à elle — mélanger les sélections ferait compter ensemble ce
--     que la RPC compte par organisation.
insert into public.organizations
  (id, name, slug, subscription_status, plan, timezone, data_retention_months)
values
  ('d0000000-0000-4000-8000-00000000000a', 'Duo A', 'tap-duo-a',
   'active', 'starter', 'Europe/Paris', 6),
  ('d0000000-0000-4000-8000-00000000000b', 'Duo B', 'tap-duo-b',
   'active', 'starter', 'Europe/Paris', 6),
  ('d0000000-0000-4000-8000-00000000000c', 'Duo C', 'tap-duo-c',
   'active', 'starter', 'Europe/Paris', 6);

-- LES ACTEURS. `set_duo_options` et `set_duo_suggestion` vérifient
-- l'appartenance EN SQL, donc il faut de vrais membres : un propriétaire et un
-- éditeur chez A (les deux habilités), un CAISSIER chez A (le refus qui prouve
-- que le RÔLE est lu, et pas seulement l'appartenance), et un propriétaire chez
-- B (celui qui prouve que le LOCATAIRE est comparé — il est habilité, mais pas
-- ici).
insert into auth.users (id, email) values
  ('d0000001-0000-4000-8000-000000000001', 'proprio-a@tap-duo.local'),
  ('d0000001-0000-4000-8000-000000000002', 'editeur-a@tap-duo.local'),
  ('d0000001-0000-4000-8000-000000000003', 'caissier-a@tap-duo.local'),
  ('d0000001-0000-4000-8000-000000000004', 'proprio-b@tap-duo.local');

insert into public.organization_members (organization_id, user_id, role) values
  ('d0000000-0000-4000-8000-00000000000a',
   'd0000001-0000-4000-8000-000000000001', 'owner'),
  ('d0000000-0000-4000-8000-00000000000a',
   'd0000001-0000-4000-8000-000000000002', 'editor'),
  ('d0000000-0000-4000-8000-00000000000a',
   'd0000001-0000-4000-8000-000000000003', 'cashier'),
  ('d0000000-0000-4000-8000-00000000000b',
   'd0000001-0000-4000-8000-000000000004', 'owner');

-- DEUX DROITS DEPUIS 20261020120000, et pas quatre : `vitrine` pour la page et
-- sa publication, `duo` pour le jeu. Ne PAS semer `reserver` ni `bande` est
-- délibéré — un octroi qu'aucune assertion n'exige rendrait ce fichier vert le
-- jour où la garde du salon retomberait sur la mauvaise clé.
insert into public.organization_module_grants
  (organization_id, module, kind, source, starts_at, ends_at)
select o.id, m.module, 'pass', 'backoffice',
       now() - interval '1 day', now() + interval '365 days'
  from (values
    ('d0000000-0000-4000-8000-00000000000a'::uuid),
    ('d0000000-0000-4000-8000-00000000000b'::uuid),
    ('d0000000-0000-4000-8000-00000000000c'::uuid)) as o(id)
 cross join (values ('vitrine'), ('duo')) as m(module);

-- LA VITRINE, ET SA PUBLICATION. `create_player_lobby` exige les DEUX (le droit
-- ET `published`). L'ordre compte : `vitrine_settings_guard_publication` refuse
-- la TRANSITION vers `published = true` à qui n'a pas le droit, donc les octrois
-- ci-dessus doivent précéder ces inserts.
insert into public.vitrine_settings (organization_id, slug, published)
values
  ('d0000000-0000-4000-8000-00000000000a', 'tap-vitrine-duo-a', true),
  ('d0000000-0000-4000-8000-00000000000b', 'tap-vitrine-duo-b', true),
  ('d0000000-0000-4000-8000-00000000000c', 'tap-vitrine-duo-c', true);

-- LA CARTE. Une carte, une rubrique, des fiches — le minimum pour que
-- `vitrine_items` existe, puisque sa FK composite passe par `vitrine_categories`
-- qui passe par `vitrine_menus`.
insert into public.vitrine_menus (id, organization_id, nom, ordre) values
  ('d0000002-0000-4000-8000-00000000000a',
   'd0000000-0000-4000-8000-00000000000a', 'Carte A', 0),
  ('d0000002-0000-4000-8000-00000000000b',
   'd0000000-0000-4000-8000-00000000000b', 'Carte B', 0),
  ('d0000002-0000-4000-8000-00000000000c',
   'd0000000-0000-4000-8000-00000000000c', 'Carte C', 0);

insert into public.vitrine_categories (id, menu_id, organization_id, nom, ordre)
values
  ('d0000003-0000-4000-8000-00000000000a', 'd0000002-0000-4000-8000-00000000000a',
   'd0000000-0000-4000-8000-00000000000a', 'Rubrique A', 0),
  ('d0000003-0000-4000-8000-00000000000b', 'd0000002-0000-4000-8000-00000000000b',
   'd0000000-0000-4000-8000-00000000000b', 'Rubrique B', 0),
  ('d0000003-0000-4000-8000-00000000000c', 'd0000002-0000-4000-8000-00000000000c',
   'd0000000-0000-4000-8000-00000000000c', 'Rubrique C', 0);

-- LES NOMS SONT VOLONTAIREMENT UNIQUES ET IMPROBABLES. Les assertions
-- d'invisibilité cherchent une SOUS-CHAÎNE dans le document : un nom banal
-- (« Café ») s'y trouverait par accident, et l'assertion rougirait sans qu'aucun
-- secret n'ait fui. « Choix Alpha » n'apparaît nulle part ailleurs dans le
-- schéma, ni dans le seed.
insert into public.vitrine_items
  (id, categorie_id, organization_id, nom, description, prix_affiche, ordre)
values
  ('d0000004-0000-4000-8000-000000000001', 'd0000003-0000-4000-8000-00000000000a',
   'd0000000-0000-4000-8000-00000000000a', 'Choix Alpha', 'La fiche alpha', '8 €', 1),
  ('d0000004-0000-4000-8000-000000000002', 'd0000003-0000-4000-8000-00000000000a',
   'd0000000-0000-4000-8000-00000000000a', 'Choix Bravo', 'La fiche bravo', '9 €', 2),
  ('d0000004-0000-4000-8000-000000000003', 'd0000003-0000-4000-8000-00000000000a',
   'd0000000-0000-4000-8000-00000000000a', 'Choix Charlie', null, '10 €', 3),
  ('d0000004-0000-4000-8000-000000000004', 'd0000003-0000-4000-8000-00000000000a',
   'd0000000-0000-4000-8000-00000000000a', 'Choix Delta', null, null, 4),
  ('d0000004-0000-4000-8000-000000000005', 'd0000003-0000-4000-8000-00000000000a',
   'd0000000-0000-4000-8000-00000000000a', 'Choix Echo', null, null, 5),
  -- LA SUGGESTION. Elle n'est PAS une option : personne ne doit pouvoir la
  -- choisir, et c'est ce que prouve SCEAU-6.
  ('d0000004-0000-4000-8000-000000000006', 'd0000003-0000-4000-8000-00000000000a',
   'd0000000-0000-4000-8000-00000000000a', 'Choix Foxtrot', 'La maison propose', '12 €', 6),
  -- LA FICHE DU VOISIN.
  ('d0000005-0000-4000-8000-000000000001', 'd0000003-0000-4000-8000-00000000000b',
   'd0000000-0000-4000-8000-00000000000b', 'Choix Voisin', null, null, 1),
  -- LES DEUX FICHES DE C, dont une seule sera épinglée.
  ('d0000006-0000-4000-8000-000000000001', 'd0000003-0000-4000-8000-00000000000c',
   'd0000000-0000-4000-8000-00000000000c', 'Choix Solo', null, null, 1),
  ('d0000006-0000-4000-8000-000000000002', 'd0000003-0000-4000-8000-00000000000c',
   'd0000000-0000-4000-8000-00000000000c', 'Choix Duo', null, null, 2);

-- La mécanique du fichier : chaque RPC est appelée UNE SEULE FOIS, son document
-- mémorisé ici, et toutes les assertions relisent la table — jamais la RPC.
-- Motif socle_lobby.test.sql : sans cela, on éprouverait la stabilité de la base
-- au lieu du contrat de la fonction.
create temporary table dm (nom text primary key, j jsonb);


-- ════════════════════════════════════════════════════════════
-- 1. LE COMMERÇANT COMPOSE SON PLATEAU
-- ════════════════════════════════════════════════════════════

insert into dm values ('conf', public.set_duo_options(
  'd0000000-0000-4000-8000-00000000000a',
  array['d0000004-0000-4000-8000-000000000001',
        'd0000004-0000-4000-8000-000000000002',
        'd0000004-0000-4000-8000-000000000003',
        'd0000004-0000-4000-8000-000000000004']::uuid[],
  'd0000001-0000-4000-8000-000000000001'));

select is(
  (select j from dm where nom = 'conf'),
  '{"state": "ok", "options": 4}'::jsonb,
  'CONF-1 quatre fiches épinglées, et le document dit combien');

-- L'ORDRE EST LA POSITION DANS LE TABLEAU REÇU, pas l'ordre de la carte ni
-- celui des uuid. On le lit à l'envers de la saisie pour que l'assertion ne
-- puisse pas être vraie par coïncidence.
select is(
  (select pg_catalog.string_agg(i.nom, ',' order by o.ordre)
     from public.duo_options o
     join public.vitrine_items i on i.id = o.item_id
    where o.organization_id = 'd0000000-0000-4000-8000-00000000000a'),
  'Choix Alpha,Choix Bravo,Choix Charlie,Choix Delta',
  'CONF-2 l''ordre est la POSITION DANS LE TABLEAU reçu');

-- LE REMPLACEMENT EST INTÉGRAL, et c'est ce que « remplace » veut dire : on
-- renvoie une sélection PLUS COURTE et dans un autre ordre, et il ne doit rien
-- rester de l'ancienne.
insert into dm values ('conf2', public.set_duo_options(
  'd0000000-0000-4000-8000-00000000000a',
  array['d0000004-0000-4000-8000-000000000003',
        'd0000004-0000-4000-8000-000000000001',
        'd0000004-0000-4000-8000-000000000005']::uuid[],
  'd0000001-0000-4000-8000-000000000002'));

select is(
  (select pg_catalog.string_agg(i.nom, ',' order by o.ordre)
     from public.duo_options o
     join public.vitrine_items i on i.id = o.item_id
    where o.organization_id = 'd0000000-0000-4000-8000-00000000000a'),
  'Choix Charlie,Choix Alpha,Choix Echo',
  'CONF-3 la sélection est REMPLACÉE en entier, pas fusionnée (et l''éditeur y a droit)');
select is(
  (select pg_catalog.count(*)::integer from public.duo_options o
    where o.organization_id = 'd0000000-0000-4000-8000-00000000000a'),
  3,
  'CONF-4 … et il n''en reste QUE trois : Bravo et Delta sont partis');

-- ── LES REFUS D'ACTEUR ───────────────────────────────────────
select throws_ok(
  format($$select public.set_duo_options(%L, %L::uuid[], %L)$$,
    'd0000000-0000-4000-8000-00000000000a',
    array['d0000004-0000-4000-8000-000000000001',
          'd0000004-0000-4000-8000-000000000002']::uuid[],
    'd0000001-0000-4000-8000-000000000003'),
  '42501', 'not authorized',
  'CONF-5 le CAISSIER est refusé : composer le plateau est éditorial, pas un geste de comptoir');
select throws_ok(
  format($$select public.set_duo_options(%L, %L::uuid[], null)$$,
    'd0000000-0000-4000-8000-00000000000a',
    array['d0000004-0000-4000-8000-000000000001',
          'd0000004-0000-4000-8000-000000000002']::uuid[]),
  '42501', 'not authorized',
  'CONF-6 un acteur ABSENT est refusé du même mot');
select throws_ok(
  format($$select public.set_duo_options(%L, %L::uuid[], %L)$$,
    'd0000000-0000-4000-8000-00000000000a',
    array['d0000004-0000-4000-8000-000000000001',
          'd0000004-0000-4000-8000-000000000002']::uuid[],
    'd0000001-0000-4000-8000-000000000004'),
  '42501', 'not authorized',
  'CONF-7 le propriétaire du VOISIN est refusé chez A : le locataire est comparé');

-- ── LES REFUS DE CARDINAL ────────────────────────────────────
select throws_ok(
  format($$select public.set_duo_options(%L, %L::uuid[], %L)$$,
    'd0000000-0000-4000-8000-00000000000a',
    array['d0000004-0000-4000-8000-000000000001',
          'd0000004-0000-4000-8000-000000000002',
          'd0000004-0000-4000-8000-000000000003',
          'd0000004-0000-4000-8000-000000000004',
          'd0000004-0000-4000-8000-000000000005',
          'd0000004-0000-4000-8000-000000000006',
          'd0000004-0000-4000-8000-000000000009']::uuid[],
    'd0000001-0000-4000-8000-000000000001'),
  '22023', 'invalid duo options count',
  'CONF-8 SEPT fiches sont refusées : le plateau est borné à six');
select throws_ok(
  format($$select public.set_duo_options(%L, %L::uuid[], %L)$$,
    'd0000000-0000-4000-8000-00000000000a',
    array['d0000004-0000-4000-8000-000000000001']::uuid[],
    'd0000001-0000-4000-8000-000000000001'),
  '22023', 'invalid duo options count',
  'CONF-9 UNE fiche est refusée : avec une seule, l''accord serait certain et le choix nul');
select throws_ok(
  format($$select public.set_duo_options(%L, %L::uuid[], %L)$$,
    'd0000000-0000-4000-8000-00000000000a',
    array[]::uuid[],
    'd0000001-0000-4000-8000-000000000001'),
  '22023', 'invalid duo options count',
  'CONF-10 un tableau VIDE aussi (array_length rend null, pas zéro)');

select throws_ok(
  format($$select public.set_duo_options(%L, %L::uuid[], %L)$$,
    'd0000000-0000-4000-8000-00000000000a',
    array['d0000004-0000-4000-8000-000000000001',
          'd0000004-0000-4000-8000-000000000001',
          'd0000004-0000-4000-8000-000000000002']::uuid[],
    'd0000001-0000-4000-8000-000000000001'),
  '22023', 'duplicate duo option item',
  'CONF-11 un DOUBLON est refusé lisiblement, et non par une violation de contrainte brute');

-- UN NUL DANS LE TABLEAU EST REFUSÉ COMME « INCONNU », PAS COMME « DOUBLON ».
-- La nuance n'est pas cosmétique : `count(distinct x)` ignore les nuls, si bien
-- qu'un tableau {fiche, null} aurait compté UN distinct pour DEUX éléments et
-- se serait fait refuser sous un motif qui n'a rien à voir. Un message faux
-- envoie chercher la panne au mauvais endroit.
select throws_ok(
  format($$select public.set_duo_options(%L, %L::uuid[], %L)$$,
    'd0000000-0000-4000-8000-00000000000a',
    array['d0000004-0000-4000-8000-000000000001', null]::uuid[],
    'd0000001-0000-4000-8000-000000000001'),
  '22023', 'unknown duo option item',
  'CONF-11b un NUL dans le tableau est refusé comme INCONNU : un nul n''est la fiche de personne');

-- ── LES DEUX REFUS QUI DOIVENT ÊTRE INDISTINCTS ──────────────
-- Item du VOISIN et item INEXISTANT : le même code ET le même message. Les
-- distinguer donnerait à un commerçant un oracle d'existence sur le catalogue
-- d'en face, une requête à la fois.
select throws_ok(
  format($$select public.set_duo_options(%L, %L::uuid[], %L)$$,
    'd0000000-0000-4000-8000-00000000000a',
    array['d0000004-0000-4000-8000-000000000001',
          'd0000005-0000-4000-8000-000000000001']::uuid[],
    'd0000001-0000-4000-8000-000000000001'),
  '22023', 'unknown duo option item',
  'CONF-12 la fiche du VOISIN est refusée');
select throws_ok(
  format($$select public.set_duo_options(%L, %L::uuid[], %L)$$,
    'd0000000-0000-4000-8000-00000000000a',
    array['d0000004-0000-4000-8000-000000000001',
          'd0000004-0000-4000-8000-0000000000ff']::uuid[],
    'd0000001-0000-4000-8000-000000000001'),
  '22023', 'unknown duo option item',
  'CONF-13 … et une fiche INEXISTANTE rend le MÊME refus, au message près : aucun oracle');

-- AUCUN DE CES DIX REFUS N'A RIEN ÉCRIT. Sans cette assertion, un refus qui
-- laisserait la table à moitié remplacée passerait inaperçu — le `delete`
-- précède l'`insert` dans la même transaction, donc c'est exactement le dégât
-- possible : une validation qui lèverait APRÈS le `delete` viderait le plateau
-- d'un commerce au lieu de refuser.
select is(
  (select pg_catalog.string_agg(i.nom, ',' order by o.ordre)
     from public.duo_options o
     join public.vitrine_items i on i.id = o.item_id
    where o.organization_id = 'd0000000-0000-4000-8000-00000000000a'),
  'Choix Charlie,Choix Alpha,Choix Echo',
  'CONF-14 aucun des dix refus n''a touché la sélection en place');

-- ── LE JOURNAL ───────────────────────────────────────────────
select is(
  (select pg_catalog.count(*)::integer from public.audit_logs a
    where a.organization_id = 'd0000000-0000-4000-8000-00000000000a'
      and a.action = 'duo.options_set'),
  2,
  'CONF-15 les DEUX gestes réussis sont journalisés, et les dix refus ne le sont pas');
-- LE COMPTE DE CHAQUE GESTE, AGRÉGÉ ET NON « LE DERNIER ». `audit_logs.created_at`
-- vaut `now()`, qui est l'instant de DÉBUT DE TRANSACTION : les deux lignes
-- portent la MÊME date à la microseconde près, et un `order by created_at desc,
-- id desc limit 1` retomberait sur l'ordre ALÉATOIRE des uuid — vert ou rouge
-- selon le tirage. C'est le motif `org_segment_emails` (20260930120000), et il
-- vaut pour les tests autant que pour les RPC : une borne posée sur un ensemble
-- non totalement ordonné coupe dans un sous-ensemble arbitraire.
select is(
  (select pg_catalog.string_agg(a.metadata->>'options', ','
                                order by a.metadata->>'options')
     from public.audit_logs a
    where a.organization_id = 'd0000000-0000-4000-8000-00000000000a'
      and a.action = 'duo.options_set'),
  '3,4',
  'CONF-16 le journal porte le COMPTE de CHAQUE geste : quatre fiches puis trois');

-- ── LA SUGGESTION ────────────────────────────────────────────
insert into dm values ('sugg', public.set_duo_suggestion(
  'd0000000-0000-4000-8000-00000000000a',
  'd0000004-0000-4000-8000-000000000006',
  'd0000001-0000-4000-8000-000000000001'));
select is(
  (select j->>'state' from dm where nom = 'sugg'),
  'ok', 'SUGG-1 la maison pose sa proposition');
select is(
  (select s.suggestion_item_id from public.duo_settings s
    where s.organization_id = 'd0000000-0000-4000-8000-00000000000a'),
  'd0000004-0000-4000-8000-000000000006'::uuid,
  'SUGG-2 … et la ligne duo_settings NAÎT de la RPC (aucun grant insert ailleurs)');
select throws_ok(
  format($$select public.set_duo_suggestion(%L, %L, %L)$$,
    'd0000000-0000-4000-8000-00000000000a',
    'd0000005-0000-4000-8000-000000000001',
    'd0000001-0000-4000-8000-000000000001'),
  '22023', 'unknown duo suggestion item',
  'SUGG-3 la fiche du VOISIN est refusée en suggestion aussi');
select throws_ok(
  format($$select public.set_duo_suggestion(%L, %L, %L)$$,
    'd0000000-0000-4000-8000-00000000000a',
    'd0000004-0000-4000-8000-000000000006',
    'd0000001-0000-4000-8000-000000000003'),
  '42501', 'not authorized',
  'SUGG-4 le caissier est refusé sur la suggestion aussi');

-- ── L'ÉCRAN DU COMMERÇANT ────────────────────────────────────
insert into dm values ('optstate',
  public.duo_options_state('d0000000-0000-4000-8000-00000000000a'));
select is(
  (select pg_catalog.jsonb_array_length(j->'options') from dm where nom = 'optstate'),
  3, 'OPTS-1 l''écran commerçant rend les trois fiches épinglées');
select is(
  (select j->'suggestion'->>'nom' from dm where nom = 'optstate'),
  'Choix Foxtrot', 'OPTS-2 … et la proposition de la maison, avec son nom');
-- ELLE NE MONTRE AUCUNE PARTIE. Le jeu de clés est CLOS à deux : le jour où
-- quelqu'un y ajouterait « manches » ou « choix », cette assertion rougirait.
select is(
  (select pg_catalog.string_agg(k, ',' order by k)
     from dm, pg_catalog.jsonb_object_keys(j) as k
    where nom = 'optstate'),
  'options,suggestion',
  'OPTS-3 DEUX clés, et la liste est close : le commerçant configure, il ne regarde pas jouer');
select is(
  public.duo_options_state('d0000000-0000-4000-8000-0000000000ff'),
  '{"options": [], "suggestion": null}'::jsonb,
  'OPTS-4 une organisation inconnue rend le même document vide qu''une organisation sans sélection');

-- On remet QUATRE options pour la suite : c'est le plateau des parties.
insert into dm values ('conf3', public.set_duo_options(
  'd0000000-0000-4000-8000-00000000000a',
  array['d0000004-0000-4000-8000-000000000001',
        'd0000004-0000-4000-8000-000000000002',
        'd0000004-0000-4000-8000-000000000003',
        'd0000004-0000-4000-8000-000000000004']::uuid[],
  'd0000001-0000-4000-8000-000000000001'));

-- C n'épingle QU'UNE fiche : c'est la borne basse de `duo_start`. On passe par
-- un insert direct, puisque `set_duo_options` refuse précisément ce cardinal —
-- et c'est bien le refus de CONF-9 qui garantit qu'on ne peut pas y arriver par
-- la RPC.
insert into public.duo_options (organization_id, item_id, ordre)
values ('d0000000-0000-4000-8000-00000000000c',
        'd0000006-0000-4000-8000-000000000001', 1);


-- ── LA PORTE SUR LA VITRINE PUBLIQUE ─────────────────────────
--
-- Sans porte, le jeu existe et personne ne le trouve. `duo` vaut vrai si et
-- seulement si `duo_jouable` — LA MÊME fonction dont `duo_start` tire son
-- `non_configure` — et c'est cette identité qui garantit la seule propriété qui
-- compte pour le visiteur : la porte est visible si et seulement si le jeu
-- démarre. Les trois cas du seuil sont éprouvés (0, 1, puis 2 fiches), parce
-- qu'un seuil ne se prouve pas d'un seul côté.

select is(
  public.vitrine_public_state('tap-vitrine-duo-a') #> '{portes,experiences,duo}',
  'true'::jsonb,
  'PORTE-1 A épingle trois fiches : sa vitrine annonce le jeu');
select is(
  public.vitrine_public_state('tap-vitrine-duo-b') #> '{portes,experiences,duo}',
  'false'::jsonb,
  'PORTE-2 B n''a AUCUNE fiche épinglée : sa vitrine ne l''annonce pas');
select is(
  public.vitrine_public_state('tap-vitrine-duo-c') #> '{portes,experiences,duo}',
  'false'::jsonb,
  'PORTE-3 C n''en a QU''UNE : le seuil est deux, et une seule ne suffit pas');

-- LA CLÉ EXISTE TOUJOURS, MÊME À FAUX. Motif des listes de VIT-3 : une clé
-- absente aurait obligé l'écran à porter deux chemins pour un seul état, et une
-- clé qu'on oublie de tester est une clé qu'on affiche. On l'éprouve sur B —
-- celle qui n'a rien, c'est-à-dire là où une implémentation paresseuse aurait
-- omis la clé.
select results_eq(
  $$select key from pg_catalog.jsonb_each(
      public.vitrine_public_state('tap-vitrine-duo-b')
        #> '{portes,experiences}') order by key$$,
  array['bande', 'calendars', 'duo', 'pronostics', 'quiz'],
  'PORTE-4 le bloc Expériences porte ses CINQ clés — `bande` est entrée en DUO-3a, où elle manquait — et cette liste est close');

-- LA PORTE N'EST PAS TRADUISIBLE, ET LA PREUVE SE FAIT SUR UNE SEULE VITRINE,
-- DE PART ET D'AUTRE DE SA TRANSITION.
--
-- Comparer A (avec porte) à B (sans) n'aurait RIEN prouvé : les deux n'ont pas
-- le même catalogue, donc pas le même dénominateur — onze champs contre trois —
-- et l'écart mesuré aurait été celui de leurs CARTES, pas celui de la porte.
-- C'est l'erreur qu'une première version de ce fichier a commise, et elle est
-- écrite ici pour qu'on ne la refasse pas : une invariance se montre en faisant
-- varier UNE chose sur UN sujet.
--
-- On mémorise donc la couverture de C MAINTENANT, porte fermée. START-15
-- l'ouvrira en épinglant une seconde fiche, et PORTE-7 relira le même document
-- sur la même vitrine. C'est la garde qui protège le sélecteur de langue : la
-- même arithmétique appliquée à l'envers ferait tomber toute vitrine traduite
-- sous le seuil (leçon VIT-3, rejouée pour L17).
insert into dm values ('couv_c_porte_fermee',
  public.vitrine_public_state('tap-vitrine-duo-c') -> 'lang_coverage');


-- ════════════════════════════════════════════════════════════
-- 2. LES SALLES — on passe par les VRAIES RPC de L16
--
-- Écrire les lobbies en direct aurait été plus court, et aurait prouvé moins :
-- ce lot repose sur le socle, et le faire passer par `create` / `join` / `lock`
-- vérifie au passage que les deux s'emboîtent (capacité figée à deux, hôte
-- membre de son propre lobby, verrouillage à deux).
-- ════════════════════════════════════════════════════════════

insert into dm values ('p1', public.create_player_lobby(
  'd0000000-0000-4000-8000-00000000000a', 'duo', 2, repeat('a1', 32), 'Hote Un'));
insert into dm values ('p1j', public.join_player_lobby(
  (select j->>'join_code' from dm where nom = 'p1'), repeat('a2', 32), 'Invite Un'));
insert into dm values ('p1l', public.lock_player_lobby(
  (select (j->>'lobby_id')::uuid from dm where nom = 'p1'), repeat('a1', 32)));

select is((select j->>'state' from dm where nom = 'p1'), 'created',
  'SALLE-1 la salle duo s''ouvre');
select is((select j->>'state' from dm where nom = 'p1l'), 'locked',
  'SALLE-2 … et se verrouille à deux : la partie peut commencer');

-- La salle de l'ACCORD : les deux y choisiront la MÊME fiche.
insert into dm values ('p2', public.create_player_lobby(
  'd0000000-0000-4000-8000-00000000000a', 'duo', 2, repeat('b1', 32), 'Hote Deux'));
insert into dm values ('p2j', public.join_player_lobby(
  (select j->>'join_code' from dm where nom = 'p2'), repeat('b2', 32), 'Invite Deux'));
insert into dm values ('p2l', public.lock_player_lobby(
  (select (j->>'lobby_id')::uuid from dm where nom = 'p2'), repeat('b1', 32)));

-- La salle du SCEAU : elle reste ouverte, on y éprouve l'immuabilité.
insert into dm values ('p3', public.create_player_lobby(
  'd0000000-0000-4000-8000-00000000000a', 'duo', 2, repeat('c1', 32), 'Hote Trois'));
insert into dm values ('p3j', public.join_player_lobby(
  (select j->>'join_code' from dm where nom = 'p3'), repeat('c2', 32), 'Invite Trois'));
insert into dm values ('p3l', public.lock_player_lobby(
  (select (j->>'lobby_id')::uuid from dm where nom = 'p3'), repeat('c1', 32)));

-- La salle NON VERROUILLÉE : l'hôte n'a pas fermé la porte.
insert into dm values ('pouv', public.create_player_lobby(
  'd0000000-0000-4000-8000-00000000000a', 'duo', 2, repeat('d1', 32), 'Hote Ouvert'));

-- La salle « BANDE » : bon socle, mauvais jeu.
insert into dm values ('pband', public.create_player_lobby(
  'd0000000-0000-4000-8000-00000000000a', 'bande', 4, repeat('e1', 32), 'Hote Bande'));
insert into dm values ('pbandj', public.join_player_lobby(
  (select j->>'join_code' from dm where nom = 'pband'), repeat('e2', 32), 'Invite Bande'));
insert into dm values ('pbandl', public.lock_player_lobby(
  (select (j->>'lobby_id')::uuid from dm where nom = 'pband'), repeat('e1', 32)));

-- La salle de C : verrouillée, mais son commerce n'a qu'une option.
insert into dm values ('pc', public.create_player_lobby(
  'd0000000-0000-4000-8000-00000000000c', 'duo', 2, repeat('f1', 32), 'Hote C'));
insert into dm values ('pcj', public.join_player_lobby(
  (select j->>'join_code' from dm where nom = 'pc'), repeat('f2', 32), 'Invite C'));
insert into dm values ('pcl', public.lock_player_lobby(
  (select (j->>'lobby_id')::uuid from dm where nom = 'pc'), repeat('f1', 32)));


-- ════════════════════════════════════════════════════════════
-- 3. `duo_start` — IDEMPOTENTE, ET SES REFUS
-- ════════════════════════════════════════════════════════════

insert into dm values ('start1', public.duo_start(
  (select (j->>'lobby_id')::uuid from dm where nom = 'p1'), repeat('a1', 32)));
insert into dm values ('start2', public.duo_start(
  (select (j->>'lobby_id')::uuid from dm where nom = 'p1'), repeat('a2', 32)));

select is((select j->>'state' from dm where nom = 'start1'), 'ok',
  'START-1 la manche s''ouvre');
select is(
  (select pg_catalog.jsonb_array_length(j->'options') from dm where nom = 'start1'),
  4, 'START-2 … avec les quatre fiches du plateau');
select is(
  (select j->'options'->0->>'nom' from dm where nom = 'start1'),
  'Choix Alpha',
  'START-3 … ordonnées par `ordre`, pas par uuid');

-- L'IDEMPOTENCE : le SECOND téléphone ouvre le même plateau, et il n'existe
-- qu'UNE manche. C'est l'arbitrage « une seule manche », prouvé sur l'objet.
select is(
  (select j->'round_id' from dm where nom = 'start1'),
  (select j->'round_id' from dm where nom = 'start2'),
  'START-4 le second appel rend la MÊME manche : duo_start est idempotente');
select is(
  (select pg_catalog.count(*)::integer from public.duo_rounds r
    where r.lobby_id = (select (j->>'lobby_id')::uuid from dm where nom = 'p1')),
  1,
  'START-5 … et il n''existe qu''UNE manche pour cette salle');

-- LE VERROU SUR LEQUEL REPOSE CETTE IDEMPOTENCE. La clé est construite ici
-- EXACTEMENT comme dans la RPC — si l'une des deux change, cette assertion
-- rougit. C'est aussi la MÊME clé que celle de L16, ce qui est délibéré : une
-- manche ne doit pas s'ouvrir pendant que le commerçant ferme la salle.
with k as (
  select pg_catalog.hashtextextended(
    'player_lobby:' || 'd0000000-0000-4000-8000-00000000000a' || ':'
      || (select (j->>'lobby_id') from dm where nom = 'p1'), 0) as v
)
select ok(
  exists (
    select 1 from pg_locks l, k
     where l.locktype = 'advisory'
       and l.objsubid = 1
       and l.classid::bigint = ((k.v >> 32) & 4294967295)
       and l.objid::bigint = (k.v & 4294967295)
  ),
  'START-6 le verrou d''avis (organisation + lobby) est détenu, sur la clé de L16');

-- ── LES REFUS ────────────────────────────────────────────────
select is(
  public.duo_start(
    (select (j->>'lobby_id')::uuid from dm where nom = 'p1'), repeat('99', 32)),
  '{"state": "unavailable"}'::jsonb,
  'START-7 un NON-MEMBRE est refusé');
select is(
  public.duo_start(
    (select (j->>'lobby_id')::uuid from dm where nom = 'p1'), repeat('99', 32)),
  public.duo_start('d0000009-0000-4000-8000-0000000000ff', repeat('99', 32)),
  'START-8 … du MÊME document qu''un lobby inventé : le refus est indistinct');
select is(
  public.duo_start(
    (select (j->>'lobby_id')::uuid from dm where nom = 'pband'), repeat('e1', 32)),
  '{"state": "unavailable"}'::jsonb,
  'START-9 une salle « bande » est refusée : Duo Miroir ne se joue pas à quatre');
select is(
  public.duo_start(
    (select (j->>'lobby_id')::uuid from dm where nom = 'pouv'), repeat('d1', 32)),
  '{"state": "unavailable"}'::jsonb,
  'START-10 une salle NON VERROUILLÉE est refusée : on ne pose pas un plateau sur une porte ouverte');
select is(
  public.duo_start(null, repeat('a1', 32)),
  '{"state": "unavailable"}'::jsonb,
  'START-11 un identifiant absent est un refus muet, pas une exception');
select throws_ok(
  format($$select public.duo_start(%L, %L)$$,
    (select (j->>'lobby_id')::uuid from dm where nom = 'p1'), 'pas-un-hash'),
  '22023', 'invalid player key',
  'START-12 un jeton MALFORMÉ est un bogue d''appelant, et il se dit fort');

-- ── `non_configure` ──────────────────────────────────────────
select is(
  public.duo_start(
    (select (j->>'lobby_id')::uuid from dm where nom = 'pc'), repeat('f1', 32)),
  '{"state": "non_configure"}'::jsonb,
  'START-13 sous DEUX options, le jeu ne peut pas se jouer et le DIT');
select is(
  (select pg_catalog.count(*)::integer from public.duo_rounds r
    where r.organization_id = 'd0000000-0000-4000-8000-00000000000c'),
  0,
  'START-14 … et n''a créé AUCUNE manche : on n''ouvre pas une partie injouable');
-- LE CONTRÔLE DE PORTÉE de START-13 : sans lui, l'assertion serait verte le
-- jour où C échouerait pour une tout autre raison. On épingle une SECONDE
-- fiche, et rien d'autre — si la manche s'ouvre alors, c'est bien le compte qui
-- refusait.
insert into public.duo_options (organization_id, item_id, ordre)
values ('d0000000-0000-4000-8000-00000000000c',
        'd0000006-0000-4000-8000-000000000002', 2);
select is(
  (public.duo_start(
    (select (j->>'lobby_id')::uuid from dm where nom = 'pc'), repeat('f1', 32)))->>'state',
  'ok',
  'START-15 une seconde fiche débloque la manche : c''est bien le COMPTE qui refusait');

-- ET LA PORTE S'OUVRE AU MÊME INSTANT — c'est l'assertion qui prouve que
-- `duo_start` et `vitrine_public_state` lisent bien LE MÊME seuil. PORTE-3 a vu
-- C fermée à une fiche ; la seconde fiche qui débloque la manche débloque aussi
-- sa vitrine, sans qu'aucun autre geste ait été posé. Deux seuils écrits
-- séparément auraient laissé cette paire diverger en silence.
select is(
  public.vitrine_public_state('tap-vitrine-duo-c') #> '{portes,experiences,duo}',
  'true'::jsonb,
  'PORTE-6 … et la porte de C s''ouvre au MÊME instant : un seul seuil, deux lecteurs');

-- L'INVARIANCE, RELUE SUR LA MÊME VITRINE. Entre la capture et cette ligne, C a
-- gagné sa porte Duo et RIEN d'autre. Le document de couverture doit être
-- identique au caractère près — pas seulement le dénominateur : le jour où la
-- porte entrerait dans `vitrine_champs_traduisibles`, le numérateur bougerait
-- aussi, et c'est le sélecteur de langue de toutes les vitrines traduites qui
-- tomberait.
select is(
  public.vitrine_public_state('tap-vitrine-duo-c') -> 'lang_coverage',
  (select j from dm where nom = 'couv_c_porte_fermee'),
  'PORTE-7 gagner sa porte ne change RIEN à la couverture de traduction de C');


-- ════════════════════════════════════════════════════════════
-- 4. LE CŒUR — LE CHOIX DE L'AUTRE EST INVISIBLE
-- ════════════════════════════════════════════════════════════

-- L'HÔTE SCELLE « Choix Alpha ». L'invité, lui, n'a rien choisi.
insert into dm values ('ch1', public.duo_choose(
  (select (j->>'lobby_id')::uuid from dm where nom = 'p1'),
  repeat('a1', 32), 'd0000004-0000-4000-8000-000000000001'));

select is(
  (select j from dm where nom = 'ch1'),
  '{"state": "ok", "scelle": true, "revelee": false}'::jsonb,
  'SEC-1 le premier choix est scellé, et la manche N''EST PAS révélée');

-- CE QUE VOIT L'INVITÉ : l'autre a scellé, mais son choix n'existe pas dans le
-- document. C'est LA propriété du lot.
insert into dm values ('vue_invite', public.duo_state(
  (select (j->>'lobby_id')::uuid from dm where nom = 'p1'), repeat('a2', 32)));

select is(
  (select j->>'status' from dm where nom = 'vue_invite'),
  'ouverte', 'SEC-2 la manche est ouverte');
select is(
  (select j->'mon_choix' from dm where nom = 'vue_invite'),
  'null'::jsonb, 'SEC-3 l''invité n''a rien choisi, et son propre choix est null');
select is(
  (select j->'autre_a_choisi' from dm where nom = 'vue_invite'),
  'true'::jsonb, 'SEC-4 il APPREND que l''autre a scellé — c''est un fait sur l''EXISTENCE');

-- ── LA PREUVE, PREMIÈRE MOITIÉ : LE JEU DE CLÉS ──────────────
-- L'assertion porte sur l'ENSEMBLE EXACT des clés, et non sur l'absence de
-- trois d'entre elles : « pas d'autre_choix » serait vert le jour où une
-- QUATRIÈME donnée réservée apparaîtrait sous un autre nom. Neuf clés, et la
-- liste est close.
--
-- LA LISTE EST PASSÉE DE HUIT À NEUF, ET C'EST UN GESTE DÉLIBÉRÉ : `salle_close`
-- a été ajoutée par la contre-revue L17 (R-2) pour que la fermeture de la salle
-- atteigne un écran dont le scrutin de lobby s'est arrêté au verrouillage. Cette
-- assertion est précisément ce qui rend l'ajout COÛTEUX, donc conscient — une
-- dixième clé se paiera du même prix.
select is(
  (select pg_catalog.string_agg(k, ',' order by k)
     from dm, pg_catalog.jsonb_object_keys(j) as k
    where nom = 'vue_invite'),
  'accord,autre_a_choisi,autre_choix,mon_choix,options,salle_close,state,status,suggestion',
  'SEC-5 le document porte NEUF clés, et la liste est close');
select is(
  (select j->'salle_close' from dm where nom = 'vue_invite'),
  'false'::jsonb,
  'SEC-5a salle_close est FAUX : la salle est verrouillée, vivante, et la partie court');
select is(
  (select j->'autre_choix' from dm where nom = 'vue_invite'),
  'null'::jsonb, 'SEC-6 autre_choix est NULL, la clé étant présente pour que la forme soit stable');
select is(
  (select j->'accord' from dm where nom = 'vue_invite'),
  'null'::jsonb, 'SEC-7 accord est NULL : il ne se prononce pas sur un seul choix');
select is(
  (select j->'suggestion' from dm where nom = 'vue_invite'),
  'null'::jsonb, 'SEC-8 la suggestion est NULL : l''afficher maintenant surlignerait une réponse');

-- ── LA PREUVE, SECONDE MOITIÉ : LE TEXTE DU DOCUMENT ─────────
-- Le jeu de clés seul ne suffit pas : une clé mal nommée qui transporterait le
-- choix de l'autre passerait SEC-5. On cherche donc la SOUS-CHAÎNE, et sur les
-- DEUX désignations — le nom lisible et l'identifiant.
--
-- `- 'options'` EST NÉCESSAIRE, ET C'EST TOUTE LA SUBTILITÉ DE CE TEST. Le
-- plateau contient forcément « Choix Alpha » : c'est une des quatre fiches
-- proposées, et les deux joueurs choisissent dans la MÊME liste. Chercher la
-- chaîne dans le document ENTIER rougirait toujours, et n'aurait rien prouvé.
-- Ce qui doit être vrai, c'est qu'aucune clé HORS du plateau ne DÉSIGNE la
-- fiche choisie par l'autre — c'est-à-dire que rien ne la distingue de ses
-- trois voisines.
select ok(
  ((select j from dm where nom = 'vue_invite') - 'options')::text
    not like '%Choix Alpha%',
  'SEC-9 hors du plateau, le NOM choisi par l''autre ne se lit nulle part');
select ok(
  ((select j from dm where nom = 'vue_invite') - 'options')::text
    not like '%d0000004-0000-4000-8000-000000000001%',
  'SEC-10 … ni son IDENTIFIANT : pas même chiffré, pas même en compte');

-- ── LE CONTRÔLE DE PORTÉE DES DEUX PRÉCÉDENTES ───────────────
-- Sans lui, SEC-9 et SEC-10 seraient vertes le jour où `duo_state` rendrait un
-- document vide, ou le jour où la fixture cesserait de nommer sa fiche ainsi.
-- On prouve que la MÊME expression trouve bien la chaîne quand elle DOIT s'y
-- trouver — ici, dans le choix de l'hôte lu par l'hôte lui-même.
insert into dm values ('vue_hote', public.duo_state(
  (select (j->>'lobby_id')::uuid from dm where nom = 'p1'), repeat('a1', 32)));
select ok(
  ((select j from dm where nom = 'vue_hote') - 'options')::text
    like '%Choix Alpha%',
  'SEC-11 CONTRÔLE DE PORTÉE : la même expression TROUVE le nom dans mon_choix de l''hôte');
select is(
  (select j->'autre_a_choisi' from dm where nom = 'vue_hote'),
  'false'::jsonb,
  'SEC-12 … et l''hôte, lui, voit que l''autre n''a PAS encore scellé');
select is(
  (select j->'mon_choix'->>'nom' from dm where nom = 'vue_hote'),
  'Choix Alpha', 'SEC-13 mon PROPRE choix m''est toujours rendu, avec son nom');

-- ── LE REFUS DE `duo_state` ──────────────────────────────────
select is(
  public.duo_state(
    (select (j->>'lobby_id')::uuid from dm where nom = 'p1'), repeat('99', 32)),
  '{"state": "unavailable"}'::jsonb,
  'SEC-14 un NON-MEMBRE ne lit rien de la partie');
select is(
  public.duo_state(
    (select (j->>'lobby_id')::uuid from dm where nom = 'p1'), repeat('99', 32)),
  public.duo_state('d0000009-0000-4000-8000-0000000000ff', repeat('99', 32)),
  'SEC-15 … et son refus est INDISTINCT de celui d''un lobby inventé');


-- ════════════════════════════════════════════════════════════
-- 5. LA RÉVÉLATION — AUTOMATIQUE, ET ELLE FERME LA SALLE
-- ════════════════════════════════════════════════════════════

insert into dm values ('ch2', public.duo_choose(
  (select (j->>'lobby_id')::uuid from dm where nom = 'p1'),
  repeat('a2', 32), 'd0000004-0000-4000-8000-000000000002'));

select is(
  (select j from dm where nom = 'ch2'),
  '{"state": "ok", "scelle": true, "revelee": true}'::jsonb,
  'REV-1 le SECOND choix révèle la manche, et le document le dit');

-- DANS LA MÊME TRANSACTION : aucune autre RPC n'a été appelée entre le choix et
-- ces trois lectures. Si la révélation avait été déléguée à un cron ou à un
-- appel de suivi, elles seraient toutes les trois fausses ici.
select is(
  (select r.status from public.duo_rounds r
    where r.lobby_id = (select (j->>'lobby_id')::uuid from dm where nom = 'p1')),
  'revelee',
  'REV-2 la manche est révélée DANS LA MÊME TRANSACTION que le second choix');
select ok(
  (select r.revealed_at is not null from public.duo_rounds r
    where r.lobby_id = (select (j->>'lobby_id')::uuid from dm where nom = 'p1')),
  'REV-3 … avec sa date, que le check d''ÉQUIVALENCE rend obligatoire');
select is(
  (select l.status from public.player_lobbies l
    where l.id = (select (j->>'lobby_id')::uuid from dm where nom = 'p1')),
  'closed',
  'REV-4 … et la salle est FERMÉE automatiquement : elle a fini son office');
select ok(
  (select l.expires_at <= pg_catalog.clock_timestamp() from public.player_lobbies l
    where l.id = (select (j->>'lobby_id')::uuid from dm where nom = 'p1')),
  'REV-5 … sa date de mort ramenée à l''instant : fermer ne prolonge jamais');

-- LE CHECK D'ÉQUIVALENCE, ÉPROUVÉ DIRECTEMENT SUR LA TABLE. La RPC ne peut pas
-- produire ces deux états, mais une écriture future le pourrait.
--
-- LES DEUX `update` VISENT LA MANCHE DE P1, qui EXISTE et qui est révélée. Une
-- contrainte ne se prouve que sur une ligne : un `update` dont le `where` ne
-- ramène rien réussit sans rien vérifier, et l'assertion serait verte par
-- vacuité — c'est exactement le piège dans lequel une première version de ce
-- fichier est tombée en visant une salle dont la manche n'était pas encore
-- ouverte.
select throws_ok(
  format($$update public.duo_rounds set revealed_at = null where lobby_id = %L$$,
    (select (j->>'lobby_id')::uuid from dm where nom = 'p1')),
  '23514', null,
  'REV-6 la base refuse une manche RÉVÉLÉE SANS DATE');
select throws_ok(
  format($$update public.duo_rounds set status = 'ouverte' where lobby_id = %L$$,
    (select (j->>'lobby_id')::uuid from dm where nom = 'p1')),
  '23514', null,
  'REV-7 … et une DATE sur une manche OUVERTE : l''équivalence dit les DEUX sens');

-- ── CE QUE CHACUN VOIT APRÈS ─────────────────────────────────
insert into dm values ('apres_invite', public.duo_state(
  (select (j->>'lobby_id')::uuid from dm where nom = 'p1'), repeat('a2', 32)));
insert into dm values ('apres_hote', public.duo_state(
  (select (j->>'lobby_id')::uuid from dm where nom = 'p1'), repeat('a1', 32)));

select is(
  (select j->>'status' from dm where nom = 'apres_invite'),
  'revelee', 'REV-8 l''invité lit une manche révélée');
select is(
  (select j->'autre_choix'->>'nom' from dm where nom = 'apres_invite'),
  'Choix Alpha', 'REV-9 … et voit ENFIN le choix de l''hôte');
select is(
  (select j->'autre_choix'->>'nom' from dm where nom = 'apres_hote'),
  'Choix Bravo', 'REV-10 … réciproquement, l''hôte voit celui de l''invité');

-- LE MIROIR DE SEC-9 : la même expression, le même document, la révélation en
-- plus. C'est ce basculement qui prouve que SEC-9 mesurait quelque chose.
select ok(
  ((select j from dm where nom = 'apres_invite') - 'options')::text
    like '%Choix Alpha%',
  'REV-11 MIROIR DE SEC-9 : après la révélation, le nom de l''autre EST dans le document');

select is(
  (select j->'accord' from dm where nom = 'apres_invite'),
  'false'::jsonb,
  'REV-12 deux fiches différentes : accord FAUX, et ce n''est ni une note ni une punition');
select is(
  (select j->'suggestion'->>'nom' from dm where nom = 'apres_invite'),
  'Choix Foxtrot',
  'REV-13 … et la maison présente ENFIN sa proposition, qui n''était pas sur le plateau');
select is(
  (select pg_catalog.string_agg(k, ',' order by k)
     from dm, pg_catalog.jsonb_object_keys(j) as k
    where nom = 'apres_invite'),
  'accord,autre_a_choisi,autre_choix,mon_choix,options,salle_close,state,status,suggestion',
  'REV-14 les NEUF clés sont les mêmes avant et après : la forme du document ne bouge pas');
-- LE MIROIR DE SEC-5a, et l'autre moitié de la promesse de `salle_close` : la
-- révélation a fermé la salle (REV-4), et le joueur l'APPREND — par le seul
-- canal qui tourne encore. Ce basculement est ce qui prouve que SEC-5a mesurait
-- quelque chose : la clé SUIT la salle, elle n'est pas constante.
select is(
  (select j->'salle_close' from dm where nom = 'apres_invite'),
  'true'::jsonb,
  'REV-15 … et salle_close a BASCULÉ à vrai : la révélation ferme la salle, et le document le dit');

-- ── L'ACCORD ─────────────────────────────────────────────────
-- Salle 2 : les deux choisissent la MÊME fiche.
insert into dm values ('p2start', public.duo_start(
  (select (j->>'lobby_id')::uuid from dm where nom = 'p2'), repeat('b1', 32)));
insert into dm values ('p2c1', public.duo_choose(
  (select (j->>'lobby_id')::uuid from dm where nom = 'p2'),
  repeat('b1', 32), 'd0000004-0000-4000-8000-000000000003'));
insert into dm values ('p2c2', public.duo_choose(
  (select (j->>'lobby_id')::uuid from dm where nom = 'p2'),
  repeat('b2', 32), 'd0000004-0000-4000-8000-000000000003'));
insert into dm values ('p2vue', public.duo_state(
  (select (j->>'lobby_id')::uuid from dm where nom = 'p2'), repeat('b1', 32)));

select is(
  (select j->'revelee' from dm where nom = 'p2c2'),
  'true'::jsonb, 'ACC-1 la manche se révèle au second choix, identique ou non');
select is(
  (select j->'accord' from dm where nom = 'p2vue'),
  'true'::jsonb, 'ACC-2 la MÊME fiche des deux côtés : l''accord est NOMMÉ');
select is(
  (select j->'mon_choix'->>'item_id' from dm where nom = 'p2vue'),
  (select j->'autre_choix'->>'item_id' from dm where nom = 'p2vue'),
  'ACC-3 … et les deux choix sont bien le même, rendus CÔTE À CÔTE');

-- L'ACCORD N'EST NI NOTÉ NI RÉCOMPENSÉ. Aucune colonne ne le porte, et il ne se
-- lit nulle part ailleurs que dans le document. Le cahier exclut « gain, score,
-- classement » : cette assertion est ce qui empêche qu'ils reviennent par la
-- petite porte d'une colonne ajoutée un jour.
select is(
  (select pg_catalog.string_agg(a.attname, ',' order by a.attname)
     from pg_catalog.pg_attribute a
    where a.attrelid = 'public.duo_choices'::regclass
      and a.attnum > 0 and not a.attisdropped),
  'created_at,id,item_id,member_token_hash,nom_fige,organization_id,round_id',
  'ACC-4 duo_choices ne porte NI score, NI rang, NI gagnant, NI accord : la liste est close');
-- `nom_fige` EST DANS LA LISTE, ET IL N'EST PAS UN ACCROC À ACC-4. Il ne note
-- rien et ne classe personne : il grave le NOM de la fiche au moment du geste,
-- c'est-à-dire la seule chose qui, sans lui, disparaîtrait avec elle (§7 ter).
-- La liste reste close — c'est le fait qu'elle soit ÉNUMÉRÉE qui l'empêche de
-- s'allonger en silence, pas sa longueur.


-- ════════════════════════════════════════════════════════════
-- 6. LE SCEAU — SALLE 3, ENCORE OUVERTE
-- ════════════════════════════════════════════════════════════

insert into dm values ('p3start', public.duo_start(
  (select (j->>'lobby_id')::uuid from dm where nom = 'p3'), repeat('c1', 32)));
insert into dm values ('p3c1', public.duo_choose(
  (select (j->>'lobby_id')::uuid from dm where nom = 'p3'),
  repeat('c1', 32), 'd0000004-0000-4000-8000-000000000001'));

-- REJOUER LE MÊME ITEM : idempotent. Le double-clic ne doit pas punir.
insert into dm values ('p3c1bis', public.duo_choose(
  (select (j->>'lobby_id')::uuid from dm where nom = 'p3'),
  repeat('c1', 32), 'd0000004-0000-4000-8000-000000000001'));
select is(
  (select j from dm where nom = 'p3c1'),
  (select j from dm where nom = 'p3c1bis'),
  'SCEAU-1 rejouer le MÊME item rend le MÊME document, au caractère près');
select is(
  (select pg_catalog.count(*)::integer from public.duo_choices c
    where c.round_id = (select (j->>'round_id')::uuid from dm where nom = 'p3start')),
  1,
  'SCEAU-2 … et n''écrit pas un second choix');

-- UN AUTRE ITEM APRÈS AVOIR SCELLÉ : REFUS. C'est ce qui empêche d'attendre
-- `autre_a_choisi` pour changer d'avis.
select is(
  public.duo_choose(
    (select (j->>'lobby_id')::uuid from dm where nom = 'p3'),
    repeat('c1', 32), 'd0000004-0000-4000-8000-000000000002'),
  '{"state": "scelle"}'::jsonb,
  'SCEAU-3 désigner un AUTRE item après avoir scellé est REFUSÉ');
select is(
  (select c.item_id from public.duo_choices c
    where c.round_id = (select (j->>'round_id')::uuid from dm where nom = 'p3start')
      and c.member_token_hash = repeat('c1', 32)),
  'd0000004-0000-4000-8000-000000000001'::uuid,
  'SCEAU-4 … et le choix scellé n''a PAS bougé : « scellé » veut dire scellé');
select is(
  (select r.status from public.duo_rounds r
    where r.lobby_id = (select (j->>'lobby_id')::uuid from dm where nom = 'p3')),
  'ouverte',
  'SCEAU-5 … la manche reste ouverte : un refus n''est pas un second choix');

-- ── LES TROIS REFUS D'ITEM, ET LEUR INDISTINCTION ────────────
select is(
  public.duo_choose(
    (select (j->>'lobby_id')::uuid from dm where nom = 'p3'),
    repeat('c2', 32), 'd0000004-0000-4000-8000-000000000006'),
  '{"state": "unavailable"}'::jsonb,
  'SCEAU-6 la SUGGESTION n''est pas jouable : elle n''est pas sur le plateau');
select is(
  public.duo_choose(
    (select (j->>'lobby_id')::uuid from dm where nom = 'p3'),
    repeat('c2', 32), 'd0000005-0000-4000-8000-000000000001'),
  '{"state": "unavailable"}'::jsonb,
  'SCEAU-7 la fiche du VOISIN non plus');
select is(
  public.duo_choose(
    (select (j->>'lobby_id')::uuid from dm where nom = 'p3'),
    repeat('c2', 32), 'd0000004-0000-4000-8000-0000000000ff'),
  '{"state": "unavailable"}'::jsonb,
  'SCEAU-8 … ni une fiche INEXISTANTE : les trois rendent le MÊME document, aucun oracle');
select is(
  public.duo_choose(
    (select (j->>'lobby_id')::uuid from dm where nom = 'p3'),
    repeat('99', 32), 'd0000004-0000-4000-8000-000000000001'),
  '{"state": "unavailable"}'::jsonb,
  'SCEAU-9 un NON-MEMBRE est refusé du même mot');
select is(
  (select pg_catalog.count(*)::integer from public.duo_choices c
    where c.round_id = (select (j->>'round_id')::uuid from dm where nom = 'p3start')),
  1,
  'SCEAU-10 aucun de ces quatre refus n''a écrit quoi que ce soit');

-- CHOISIR DANS UNE SALLE DÉJÀ RÉVÉLÉE : refusé. La salle est `closed`, donc le
-- premier filet mord ; le second (manche non `ouverte`) est écrit derrière lui.
select is(
  public.duo_choose(
    (select (j->>'lobby_id')::uuid from dm where nom = 'p1'),
    repeat('a1', 32), 'd0000004-0000-4000-8000-000000000003'),
  '{"state": "unavailable"}'::jsonb,
  'SCEAU-11 on ne choisit plus dans une salle dont la manche est révélée');

-- ── L'ÉCRAN DE RÉSULTAT SURVIT À LA FERMETURE ────────────────
-- La conséquence la plus facile à casser du lot : la révélation FERME la salle
-- et ramène sa date de mort à l'instant. Si `duo_state` ou `duo_start` exigeait
-- une salle vivante, l'écran de résultat serait `unavailable` au moment même où
-- il doit s'afficher.
select is(
  (select j->>'state' from dm where nom = 'apres_invite'),
  'ok',
  'SURVIE-1 duo_state répond encore sur une salle CLOSE et dépassée');
select is(
  (public.duo_start(
    (select (j->>'lobby_id')::uuid from dm where nom = 'p1'), repeat('a1', 32)))->>'state',
  'ok',
  'SURVIE-2 duo_start aussi : recharger l''écran de résultat ne doit pas le perdre');
select is(
  (select pg_catalog.count(*)::integer from public.duo_rounds r
    where r.lobby_id = (select (j->>'lobby_id')::uuid from dm where nom = 'p1')),
  1,
  'SURVIE-3 … et n''a pas fabriqué une seconde manche au passage');


-- ════════════════════════════════════════════════════════════
-- 6 bis. LA SALLE SE REFERME PENDANT QUE LA MANCHE EST OUVERTE
--
-- LE CAS QUE `salle_close` EXISTE POUR DIRE, et il n'est atteignable QUE par ce
-- chemin : la révélation ferme la salle DANS LE MÊME GESTE qu'elle révèle la
-- manche (§5), donc « salle close ET manche encore ouverte » ne se produit que
-- si le COMMERÇANT referme. C'est aussi le seul état que l'écran ne peut pas
-- déduire tout seul — son scrutin de lobby s'est arrêté au verrouillage,
-- `locked` étant terminal, et son statut de salle est figé pour toute la partie.
-- Sans cette clé, le joueur reste devant son plateau et boucle sur des
-- `unavailable` génériques sans jamais apprendre pourquoi.
--
-- UNE SALLE NEUVE, ET PAS P3 : la fermeture est DÉFINITIVE. L'éprouver sur une
-- salle dont les sections suivantes ont encore besoin (P3 sert au §7 bis, et
-- son sceau y est rejoué) ferait dépendre celles-ci de l'ordre des blocs — et
-- une garde ne se confie pas à un ordre.
-- ════════════════════════════════════════════════════════════

insert into dm values ('p5', public.create_player_lobby(
  'd0000000-0000-4000-8000-00000000000a', 'duo', 2, repeat('0a', 32), 'Hote Quatre'));
insert into dm values ('p5j', public.join_player_lobby(
  (select j->>'join_code' from dm where nom = 'p5'), repeat('0b', 32), 'Invite Quatre'));
insert into dm values ('p5l', public.lock_player_lobby(
  (select (j->>'lobby_id')::uuid from dm where nom = 'p5'), repeat('0a', 32)));
insert into dm values ('p5start', public.duo_start(
  (select (j->>'lobby_id')::uuid from dm where nom = 'p5'), repeat('0a', 32)));
insert into dm values ('p5avant', public.duo_state(
  (select (j->>'lobby_id')::uuid from dm where nom = 'p5'), repeat('0b', 32)));

select is(
  (select j->'salle_close' from dm where nom = 'p5avant'),
  'false'::jsonb,
  'CLOSE-1 salle VERROUILLÉE ET VIVANTE, manche ouverte : salle_close est FAUX');

-- LE COMMERÇANT REFERME. Rien d'autre ne bouge : personne n'a scellé, les deux
-- joueurs restent membres, et la manche n'est pas touchée.
insert into dm values ('p5close', public.close_player_lobby_as_org(
  'd0000000-0000-4000-8000-00000000000a',
  (select (j->>'lobby_id')::uuid from dm where nom = 'p5'),
  'd0000001-0000-4000-8000-000000000001'));
select is(
  (select j from dm where nom = 'p5close'),
  '{"state": "ok", "closed": true}'::jsonb,
  'CLOSE-2 CONTRÔLE DE PORTÉE : la fermeture a bien MORDU — sans elle, CLOSE-3 serait verte sur une salle jamais fermée');

insert into dm values ('p5apres', public.duo_state(
  (select (j->>'lobby_id')::uuid from dm where nom = 'p5'), repeat('0b', 32)));

select is(
  (select j->'salle_close' from dm where nom = 'p5apres'),
  'true'::jsonb,
  'CLOSE-3 … et le joueur l''APPREND par duo_state, le seul canal qui tourne encore après le verrouillage');
-- CE COUPLE EST TOUT LE SUJET. `status` dit « ouverte » — la manche n'a pas
-- bougé, donc rien dans le document ne trahirait la fermeture — et pourtant la
-- salle est close. C'est la combinaison que la révélation ne peut PAS produire,
-- et celle qu'aucune autre clé ne porte.
select is(
  (select j->>'status' from dm where nom = 'p5apres'),
  'ouverte',
  'CLOSE-4 … alors que la MANCHE, elle, est encore OUVERTE : l''état exact que l''écran ne pouvait pas déduire');
-- LE JEU DE CLÉS SUR LA COMBINAISON NEUVE. SEC-5 l'éprouve sur « manche ouverte,
-- salle vivante », REV-14 sur « manche révélée, salle close » ; il manquait
-- « manche ouverte, salle close ». La forme ne doit pas dépendre de la salle.
select is(
  (select pg_catalog.string_agg(k, ',' order by k)
     from dm, pg_catalog.jsonb_object_keys(j) as k
    where nom = 'p5apres'),
  'accord,autre_a_choisi,autre_choix,mon_choix,options,salle_close,state,status,suggestion',
  'CLOSE-5 … et la forme du document ne bouge toujours pas : NEUF clés, salle close ou non');
-- ELLE NE DIT RIEN DE PLUS QU'UN BOOLÉEN, et c'est ICI que ça rougira le jour
-- où quelqu'un voudra « expliquer » la fermeture au joueur. Ni raison, ni
-- auteur, ni date : `lobby.closed_by_org` grave déjà tout cela au journal, à
-- l'usage de ceux qui y ont droit — le porteur d'un jeton de partie n'en est pas.
select is(
  (select pg_catalog.jsonb_typeof(j->'salle_close') from dm where nom = 'p5apres'),
  'boolean',
  'CLOSE-6 salle_close est un BOOLÉEN NU : pas un objet, pas une raison, pas un auteur, pas une date');
-- LA CLÉ RENSEIGNE, ELLE NE RELÂCHE RIEN. Le refus de `duo_choose` reste
-- exactement celui de §6 — le même mot que pour un non-membre. Ce qui change
-- n'est pas le droit du joueur, c'est ce qu'il peut COMPRENDRE de son écran.
select is(
  public.duo_choose(
    (select (j->>'lobby_id')::uuid from dm where nom = 'p5'),
    repeat('0b', 32), 'd0000004-0000-4000-8000-000000000002'),
  '{"state": "unavailable"}'::jsonb,
  'CLOSE-7 on ne choisit plus dans une salle refermée par le commerçant, et le refus reste GÉNÉRIQUE');


-- ════════════════════════════════════════════════════════════
-- 7. LE LOCATAIRE TIENT PAR LA BASE
-- ════════════════════════════════════════════════════════════

-- LA FK COMPOSITE, ÉPROUVÉE DIRECTEMENT. La RPC refuse déjà l'item du voisin
-- (SCEAU-7), mais une écriture qui la contournerait doit se heurter à la base.
select throws_ok(
  format($$insert into public.duo_options (organization_id, item_id, ordre)
           values (%L, %L, 6)$$,
    'd0000000-0000-4000-8000-00000000000a',
    'd0000005-0000-4000-8000-000000000001'),
  '23503', null,
  'TENANT-1 la base refuse d''épingler la fiche d''un AUTRE commerce (FK composite)');
-- `nom_fige` EST FOURNI ICI, ET SON ABSENCE AURAIT FAUSSÉ L'ASSERTION : la
-- colonne est `not null`, donc un insert qui l'omet lève 23502 AVANT que la clé
-- étrangère soit seulement regardée. L'assertion serait restée rouge en
-- prouvant… l'existence d'une contrainte `not null`. Même raison en TENANT-4.
select throws_ok(
  format($$insert into public.duo_choices
             (round_id, organization_id, member_token_hash, item_id, nom_fige)
           values (%L, %L, %L, %L, %L)$$,
    (select (j->>'round_id')::uuid from dm where nom = 'p3start'),
    'd0000000-0000-4000-8000-00000000000b',
    -- UNE EMPREINTE NEUVE, et c'est nécessaire : `repeat('c1',32)` a déjà un
    -- choix dans cette manche, donc `duo_choices_round_membre_unique` mordrait
    -- AVANT la clé étrangère et l'assertion prouverait l'unicité au lieu du
    -- locataire. Deux gardes se recouvrent ici ; il faut désarmer la première
    -- pour éprouver la seconde.
    repeat('c9', 32),
    'd0000005-0000-4000-8000-000000000001',
    'Choix Voisin'),
  '23503', null,
  'TENANT-2 … ni de rattacher un choix à la manche d''un autre locataire');

-- UNE SEULE MANCHE PAR SALLE, éprouvée sur la contrainte et non sur la RPC.
select throws_ok(
  format($$insert into public.duo_rounds (lobby_id, organization_id)
           values (%L, %L)$$,
    (select (j->>'lobby_id')::uuid from dm where nom = 'p3'),
    'd0000000-0000-4000-8000-00000000000a'),
  '23505', null,
  'TENANT-3 la base refuse une SECONDE manche pour la même salle');

-- UN CHOIX PAR PERSONNE, sur la contrainte elle aussi.
select throws_ok(
  format($$insert into public.duo_choices
             (round_id, organization_id, member_token_hash, item_id, nom_fige)
           values (%L, %L, %L, %L, %L)$$,
    (select (j->>'round_id')::uuid from dm where nom = 'p3start'),
    'd0000000-0000-4000-8000-00000000000a',
    repeat('c1', 32),
    'd0000004-0000-4000-8000-000000000002',
    'Choix Bravo'),
  '23505', null,
  'TENANT-4 … et un SECOND choix pour la même personne dans la même manche');

-- LA CASCADE. Purger la salle emporte la manche ET les choix : c'est ce qui
-- fait de la partie une « session privée éphémère », et ce qui garantit que les
-- deux identifiants de fiches ne lui survivent pas.
delete from public.player_lobbies l
 where l.id = (select (j->>'lobby_id')::uuid from dm where nom = 'p2');
select is(
  (select pg_catalog.count(*)::integer from public.duo_rounds r
    where r.lobby_id = (select (j->>'lobby_id')::uuid from dm where nom = 'p2')),
  0, 'TENANT-5 supprimer la salle emporte la manche');
select is(
  (select pg_catalog.count(*)::integer from public.duo_choices c
    where c.round_id = (select (j->>'round_id')::uuid from dm where nom = 'p2start')),
  0, 'TENANT-6 … et les choix avec elle : la partie ne survit pas à la salle');


-- ════════════════════════════════════════════════════════════
-- 7 bis. LA FICHE DISPARAÎT, LE CHOIX RESTE (revue L17, M-1)
--
-- Ce que ce bloc prouve, et pourquoi il existe. `duo_choices.item_id` portait
-- une FK `on delete cascade` vers `vitrine_items`, ce qui donnait à quiconque
-- peut supprimer une fiche — un compte `owner|editor` de l'organisation hôte —
-- le pouvoir d'EFFACER un choix déjà scellé. Deux dégâts, et le second est le
-- plus fréquent :
--
--   · L'ORACLE. Supprimer une fiche, regarder si `autre_a_choisi` retombe à
--     faux, recommencer : trois à cinq suppressions binarisaient le choix de
--     l'autre AVANT d'avoir scellé le sien. Toute la §4 de ce fichier existe
--     pour que ce choix soit invisible ; une cascade le rendait DEVINABLE.
--   · LA RÉVÉLATION VIDE. Le commerçant qui retire un plat épuisé pendant une
--     partie ne triche pas — et la cascade faisait disparaître le choix du
--     joueur, dont la révélation n'avait plus rien à montrer.
--
-- Le remède est `nom_fige` + `on delete set null (item_id)`, et il se prouve en
-- trois temps : le RENOMMAGE (le gravé ne bouge pas, le plateau si), la
-- SUPPRESSION (le choix survit, l'oracle est fermé), et LA LIMITE ASSUMÉE (les
-- deux fiches effacées, l'accord ne se prononce plus).
--
-- CE BLOC DÉMONTE SES PROPRES FIXTURES — il supprime deux fiches du plateau de
-- A — donc il passe APRÈS tout ce qui les nomme, comme le §7 ter d'en dessous.
-- ════════════════════════════════════════════════════════════

-- ── PREMIER TEMPS : LE RENOMMAGE ─────────────────────────────
-- On renomme la fiche que l'hôte de P3 a scellée au §6. Rien d'autre ne bouge :
-- elle est toujours sur le plateau, la manche est toujours ouverte.
update public.vitrine_items
   set nom = 'Choix Alpha Renomme'
 where id = 'd0000004-0000-4000-8000-000000000001';

insert into dm values ('grave_p3_hote', public.duo_state(
  (select (j->>'lobby_id')::uuid from dm where nom = 'p3'), repeat('c1', 32)));

select is(
  (select j->'mon_choix'->>'nom' from dm where nom = 'grave_p3_hote'),
  'Choix Alpha',
  'GRAVE-1 renommer la fiche APRÈS le sceau ne touche pas le nom GRAVÉ : le choix reflète le GESTE');
-- LA MÊME LECTURE, L'AUTRE MOITIÉ. C'est ce couple qui prouve la distinction, et
-- non chaque assertion prise seule : sur LE MÊME document et pour LA MÊME fiche,
-- le choix rend l'ancien nom et le plateau rend le nouveau. Une seule des deux
-- aurait été verte même si `duo_state` lisait deux fois au même endroit.
-- LE DOCUMENT EST CHOISI DANS UNE SOUS-REQUÊTE, ET NON PAR UN `where` SUR `dm`
-- JOINT À LA FONCTION : `jsonb_array_elements` appliquée à toutes les lignes de
-- `dm` lèverait sur celles dont `options` n'est pas un tableau — `conf` porte
-- `{"options": 4}` — et l'assertion dépendrait alors de l'ordre dans lequel le
-- planificateur applique le filtre. Une garde ne se confie pas à un plan.
select is(
  (select o.item->>'nom'
     from pg_catalog.jsonb_array_elements(
            (select j->'options' from dm where nom = 'grave_p3_hote')) as o(item)
    where o.item->>'item_id' = 'd0000004-0000-4000-8000-000000000001'),
  'Choix Alpha Renomme',
  'GRAVE-2 … et le PLATEAU, lui, porte le NOUVEAU nom : le plateau reflète la CARTE');

-- ── DEUXIÈME TEMPS : LA SUPPRESSION ──────────────────────────
-- Le geste du commerçant qui nettoie sa carte, et celui de l'initié qui sonde :
-- c'est la MÊME instruction, et c'est pour cela qu'aucune garde applicative ne
-- pouvait les départager. Seule la base pouvait décider ce qu'il advient du
-- choix, et elle décide désormais de le garder.
delete from public.vitrine_items i
 where i.id = 'd0000004-0000-4000-8000-000000000001';

select is(
  (select pg_catalog.count(*)::integer from public.duo_choices c
    where c.round_id = (select (j->>'round_id')::uuid from dm where nom = 'p3start')),
  1,
  'GRAVE-3 le choix SURVIT à la suppression de sa fiche : la cascade ne l''emporte plus');
select is(
  (select c.nom_fige from public.duo_choices c
    where c.round_id = (select (j->>'round_id')::uuid from dm where nom = 'p3start')
      and c.member_token_hash = repeat('c1', 32)),
  'Choix Alpha',
  'GRAVE-4 … sous le nom gravé AU MOMENT DU GESTE, celui d''avant le renommage');
-- CE QUE `set null (item_id)` FAIT, ET CE QU'UN `set null` NU AURAIT FAIT. La
-- liste de colonnes n'est pas un raffinement : sans elle, Postgres tenterait de
-- vider AUSSI `organization_id`, qui est `not null`, et la suppression de la
-- fiche aurait ÉCHOUÉ — rendant tout plat indélébile tant qu'un joueur l'a
-- désigné. L'assertion tient les deux moitiés à la fois.
select ok(
  (select c.item_id is null
      and c.organization_id = 'd0000000-0000-4000-8000-00000000000a'
     from public.duo_choices c
    where c.round_id = (select (j->>'round_id')::uuid from dm where nom = 'p3start')
      and c.member_token_hash = repeat('c1', 32)),
  'GRAVE-5 … item_id VIDÉ mais LOCATAIRE INTACT : c''est ce que fait set null (item_id), et un set null NU aurait refusé la suppression');

-- ── L'ASSERTION QUI FERME M-1 ────────────────────────────────
-- L'invité de P3 n'a toujours rien scellé. Avant le remède, la suppression
-- ci-dessus aurait fait retomber son `autre_a_choisi` à FAUX — et c'est
-- exactement le signal que l'initié cherchait, une fiche à la fois.
insert into dm values ('grave_p3_invite', public.duo_state(
  (select (j->>'lobby_id')::uuid from dm where nom = 'p3'), repeat('c2', 32)));

select is(
  (select j->'autre_a_choisi' from dm where nom = 'grave_p3_invite'),
  'true'::jsonb,
  'GRAVE-6 L''ORACLE EST FERMÉ (M-1) : supprimer la fiche ne fait PAS retomber autre_a_choisi à faux');
select is(
  (select j->'mon_choix' from dm where nom = 'grave_p3_invite'),
  'null'::jsonb,
  'GRAVE-7 … et l''invité n''a toujours rien scellé : « fiche disparue » et « rien choisi » restent deux états distincts');
-- LE NOM GRAVÉ EST UN NOUVEL ENDROIT OÙ VIT LE CHOIX DE L'AUTRE, donc il doit
-- obéir à la MÊME garde. La manche est ouverte : `nom_fige` est lu par la RPC,
-- et il ne doit pas franchir le `if`. On cherche dans le document ENTIER et non
-- « hors du plateau » comme en SEC-9 — la fiche vient de quitter la carte, donc
-- toute occurrence de son nom serait forcément une fuite du choix.
select ok(
  (select j from dm where nom = 'grave_p3_invite')::text
    not like '%Choix Alpha%',
  'GRAVE-8 … et le nom GRAVÉ ne fuit pas plus que l''ancien : il ne se lit NULLE PART avant la révélation');
-- LE CONTRÔLE DE PORTÉE DES TROIS PRÉCÉDENTES : la suppression a bien mordu.
-- Sans lui, GRAVE-6 serait verte le jour où le `delete` ne supprimerait plus
-- rien — et prouverait alors la persistance d'une fiche jamais partie.
select is(
  (select pg_catalog.jsonb_array_length(j->'options') from dm where nom = 'grave_p3_invite'),
  3,
  'GRAVE-9 CONTRÔLE DE PORTÉE : le plateau est bien AMPUTÉ (quatre fiches moins une) — il perd des options, jamais un choix');

-- ── LE SCEAU DU JOUEUR DONT LA FICHE A DISPARU ───────────────
--
-- LA GARDE QUE PERSONNE NE MARCHAIT (contre-revue L17, R-1). `duo_choose`
-- compare le choix déjà scellé par un `is distinct from` et non par un `<>`,
-- parce que `item_id` est devenu nullable avec le remède : sur un `item_id` NUL,
-- `null <> p_item_id` rend NUL — donc FAUX pour un `if` — et le geste tomberait
-- dans la branche IDEMPOTENTE. Le joueur recevrait un `ok` MENTANT sur ce qu'il
-- a scellé, sans qu'une ligne soit écrite : le sceau s'ouvrirait exactement pour
-- celui à qui l'on vient d'effacer sa fiche, c'est-à-dire pour celui que le
-- remède existe pour protéger.
--
-- AUCUNE ASSERTION NE PARCOURAIT CE CHEMIN avant cette ligne, et le fichier
-- restait ENTIÈREMENT VERT si l'on repassait à `<>`. La raison est mécanique :
-- les seules tentatives de re-choix (§6) portaient sur une fiche VIVANTE, et les
-- seules salles où un `item_id` était nul étaient DÉJÀ RÉVÉLÉES — `duo_choose`
-- y sort en `unavailable` sur la salle close, puis sur la manche non `ouverte`,
-- DEUX gardes avant d'atteindre la comparaison du sceau.
--
-- P3 EST LA SEULE SALLE QUI CONVIENNE, ET ELLE DOIT LE RESTER : verrouillée,
-- VIVANTE, manche ENCORE OUVERTE (SCEAU-5), et son hôte porte depuis GRAVE-5 un
-- choix à `item_id` nul sous son `nom_fige` intact. Révéler ou fermer P3 avant
-- cette ligne ferait mordre les deux filets en amont, l'assertion redeviendrait
-- verte par vacuité, et la garde cesserait d'être tenue par quoi que ce soit.
-- C'est écrit ici pour que ce ne soit pas fait par distraction.
--
-- L'ITEM VISÉ DOIT ÊTRE SUR LE PLATEAU — `Choix Bravo`, vivant, et non la fiche
-- supprimée. La validation du plateau précède la comparaison du sceau : viser
-- une fiche effacée rendrait `unavailable` et prouverait autre chose.
--
-- ET L'ASSERTION EST PARCOURANTE PAR CONSTRUCTION : `{"state":"scelle"}` n'a
-- qu'UN SEUL `return` dans toute la fonction, et il est DERRIÈRE la comparaison.
-- Ce document ne peut donc pas sortir sans qu'elle ait tranché.
select is(
  public.duo_choose(
    (select (j->>'lobby_id')::uuid from dm where nom = 'p3'),
    repeat('c1', 32), 'd0000004-0000-4000-8000-000000000002'),
  '{"state": "scelle"}'::jsonb,
  'GRAVE-9a LE SCEAU TIENT SANS SA FICHE : item_id nul, un AUTRE item reste REFUSÉ — avec <> la comparaison rendrait NUL et le sceau s''ouvrirait');
select ok(
  (select c.item_id is null and c.nom_fige = 'Choix Alpha'
     from public.duo_choices c
    where c.round_id = (select (j->>'round_id')::uuid from dm where nom = 'p3start')
      and c.member_token_hash = repeat('c1', 32)),
  'GRAVE-9b … et RIEN n''a été réécrit : ni l''identifiant vidé, ni le nom gravé');
select is(
  (select pg_catalog.count(*)::integer from public.duo_choices c
    where c.round_id = (select (j->>'round_id')::uuid from dm where nom = 'p3start')),
  1,
  'GRAVE-9c … ni ajouté : le refus n''écrit pas un second choix');

-- ── LA RÉVÉLATION MONTRE ENCORE LE GESTE ─────────────────────
-- P1 est révélée depuis le §5 : l'hôte y avait scellé la fiche qu'on vient de
-- supprimer, l'invité une autre. C'est le cas du commerçant qui nettoie sa
-- carte, et l'écran de résultat doit lui survivre entier.
insert into dm values ('grave_p1_invite', public.duo_state(
  (select (j->>'lobby_id')::uuid from dm where nom = 'p1'), repeat('a2', 32)));

select is(
  (select j->'autre_choix'->>'nom' from dm where nom = 'grave_p1_invite'),
  'Choix Alpha',
  'GRAVE-10 la RÉVÉLATION montre encore ce que l''autre avait choisi, sous son nom gravé');
select is(
  (select j->'autre_choix'->'item_id' from dm where nom = 'grave_p1_invite'),
  'null'::jsonb,
  'GRAVE-11 … avec item_id NUL, et l''OBJET bien présent : la fiche n''existe plus, le geste si');
select is(
  (select j->'accord' from dm where nom = 'grave_p1_invite'),
  'false'::jsonb,
  'GRAVE-12 … et l''accord reste FAUX : une fiche EFFACÉE n''est pas la fiche qui SURVIT, et cela se tranche encore');

-- ── TROISIÈME TEMPS : LA LIMITE ASSUMÉE ──────────────────────
-- Le seul cas que le remède ne referme pas, écrit ici pour qu'on ne le
-- découvre pas en production. Deux joueurs scellent la MÊME fiche, puis elle est
-- supprimée : les deux `item_id` valent nul, et deux nuls ne disent pas s'ils
-- désignaient la même chose. L'accord porte sur l'IDENTITÉ et jamais sur le nom
-- — deux fiches distinctes peuvent s'appeler pareil, et une même fiche peut
-- avoir été renommée entre les deux sceaux — donc `nom_fige` ne peut pas
-- trancher à sa place.
-- LES EMPREINTES SONT HEXADÉCIMALES, et le motif `repeat('xx', 32)` de ce
-- fichier le cache : `repeat('g1', 32)` a la bonne LONGUEUR mais pas le bon
-- ALPHABET, et `create_player_lobby` le refuse par un `raise` — qui interrompt
-- le fichier entier au lieu de rougir une assertion. Les paires disponibles
-- doivent rester dans [0-9a-f].
insert into dm values ('p4', public.create_player_lobby(
  'd0000000-0000-4000-8000-00000000000a', 'duo', 2, repeat('ab', 32), 'Hote Cinq'));
insert into dm values ('p4j', public.join_player_lobby(
  (select j->>'join_code' from dm where nom = 'p4'), repeat('cd', 32), 'Invite Cinq'));
insert into dm values ('p4l', public.lock_player_lobby(
  (select (j->>'lobby_id')::uuid from dm where nom = 'p4'), repeat('ab', 32)));
insert into dm values ('p4start', public.duo_start(
  (select (j->>'lobby_id')::uuid from dm where nom = 'p4'), repeat('ab', 32)));
insert into dm values ('p4c1', public.duo_choose(
  (select (j->>'lobby_id')::uuid from dm where nom = 'p4'),
  repeat('ab', 32), 'd0000004-0000-4000-8000-000000000004'));
insert into dm values ('p4c2', public.duo_choose(
  (select (j->>'lobby_id')::uuid from dm where nom = 'p4'),
  repeat('cd', 32), 'd0000004-0000-4000-8000-000000000004'));
insert into dm values ('p4avant', public.duo_state(
  (select (j->>'lobby_id')::uuid from dm where nom = 'p4'), repeat('ab', 32)));

select is(
  (select j->'accord' from dm where nom = 'p4avant'),
  'true'::jsonb,
  'GRAVE-13 la même fiche des deux côtés : l''accord est NOMMÉ, tant que la fiche vit');

delete from public.vitrine_items i
 where i.id = 'd0000004-0000-4000-8000-000000000004';

insert into dm values ('p4apres', public.duo_state(
  (select (j->>'lobby_id')::uuid from dm where nom = 'p4'), repeat('ab', 32)));

select is(
  (select j->'mon_choix'->>'nom' from dm where nom = 'p4apres'),
  'Choix Delta',
  'GRAVE-14 les DEUX noms gravés restent lisibles après la suppression…');
select is(
  (select j->'autre_choix'->>'nom' from dm where nom = 'p4apres'),
  'Choix Delta',
  'GRAVE-15 … côte à côte, et identiques : le joueur VOIT qu''ils ont pensé pareil');
select is(
  (select j->'accord' from dm where nom = 'p4apres'),
  'null'::jsonb,
  'GRAVE-16 LA LIMITE ASSUMÉE : les deux identités effacées, l''accord ne se PRONONCE plus (null) — il ne se DÉMENT pas (false), ce qui aurait été un mensonge');


-- ════════════════════════════════════════════════════════════
-- 7 ter. LE RETRAIT DE LA SUGGESTION
--
-- Placé ICI, et pas au §1 avec les autres gestes de configuration, pour une
-- raison bête et suffisante : il EFFACE ce dont REV-13 avait besoin. Un test
-- qui démonte sa propre fixture doit passer en dernier.
-- ════════════════════════════════════════════════════════════

insert into dm values ('suggoff', public.set_duo_suggestion(
  'd0000000-0000-4000-8000-00000000000a', null,
  'd0000001-0000-4000-8000-000000000001'));

select is(
  (select j from dm where nom = 'suggoff'),
  '{"state": "ok", "suggestion": null}'::jsonb,
  'SUGG-5 un item NUL RETIRE la suggestion : ce n''est pas un cas d''erreur');
select ok(
  (select s.suggestion_item_id is null from public.duo_settings s
    where s.organization_id = 'd0000000-0000-4000-8000-00000000000a'),
  'SUGG-6 … la colonne est vidée, et la ligne reste (elle se repose au geste suivant)');
select is(
  public.duo_options_state('d0000000-0000-4000-8000-00000000000a')->'suggestion',
  'null'::jsonb,
  'SUGG-7 … et l''écran commerçant ne propose plus rien');
-- LE RETRAIT EST UN GESTE, DONC IL SE JOURNALISE. C'est l'inverse du non-geste
-- de set_vitrine_slug : réenregistrer la même adresse n'écrit rien, mais
-- décider de ne plus rien proposer est une décision, et « depuis quand la
-- maison ne propose-t-elle plus rien » est une question qu'on se pose.
select is(
  (select pg_catalog.count(*)::integer from public.audit_logs a
    where a.organization_id = 'd0000000-0000-4000-8000-00000000000a'
      and a.action = 'duo.suggestion_set'),
  2,
  'SUGG-8 le retrait est journalisé comme la pose');


-- ════════════════════════════════════════════════════════════
-- 8. RLS, GRANTS ET ACL
-- ════════════════════════════════════════════════════════════

select ok(
  (select c.relrowsecurity from pg_catalog.pg_class c
    where c.oid = 'public.duo_options'::regclass),
  'ACL-1 duo_options porte la RLS');
select ok(
  (select c.relrowsecurity from pg_catalog.pg_class c
    where c.oid = 'public.duo_settings'::regclass),
  'ACL-2 duo_settings porte la RLS');
select ok(
  (select c.relrowsecurity from pg_catalog.pg_class c
    where c.oid = 'public.duo_rounds'::regclass),
  'ACL-3 duo_rounds porte la RLS');
select ok(
  (select c.relrowsecurity from pg_catalog.pg_class c
    where c.oid = 'public.duo_choices'::regclass),
  'ACL-4 duo_choices porte la RLS');

-- LES DEUX TABLES DE PARTIE SONT NUES POUR TOUT LE MONDE SAUF service_role.
-- L'ACL est lue EXHAUSTIVEMENT par `aclexplode` et non privilège par privilège :
-- `select`, `insert`, `update`, `delete` sont ceux auxquels on pense, mais
-- `references`, `trigger` et `truncate` sont ceux qu'on oublie (leçon SEC-4,
-- wagon 7) — et `references` suffit à apprendre la forme d'une table.
select is(
  (select coalesce(pg_catalog.string_agg(
            acl.privilege_type || '@' || acl.grantee::regrole::text, ',' order by 1), '')
     from pg_catalog.pg_class c,
          lateral pg_catalog.aclexplode(
            coalesce(c.relacl, pg_catalog.acldefault('r', c.relowner))) as acl
    where c.oid = 'public.duo_rounds'::regclass
      and acl.grantee::regrole::text in ('anon', 'authenticated', 'public')),
  '',
  'ACL-5 duo_rounds : anon et authenticated n''ont AUCUN privilège, references/trigger/truncate compris');
select is(
  (select coalesce(pg_catalog.string_agg(
            acl.privilege_type || '@' || acl.grantee::regrole::text, ',' order by 1), '')
     from pg_catalog.pg_class c,
          lateral pg_catalog.aclexplode(
            coalesce(c.relacl, pg_catalog.acldefault('r', c.relowner))) as acl
    where c.oid = 'public.duo_choices'::regclass
      and acl.grantee::regrole::text in ('anon', 'authenticated', 'public')),
  '',
  'ACL-6 duo_choices : idem — une partie n''appartient à aucun compte marchand');

-- LES DEUX TABLES DE CONFIGURATION, ELLES, SONT LISIBLES PAR LES MEMBRES.
-- `anon` reste nu dans les deux cas.
select ok(
  has_table_privilege('authenticated', 'public.duo_options', 'SELECT'),
  'ACL-7 duo_options est LISIBLE par authenticated (la policy filtre le locataire)');
select is(
  (select coalesce(pg_catalog.string_agg(
            acl.privilege_type, ',' order by acl.privilege_type), '')
     from pg_catalog.pg_class c,
          lateral pg_catalog.aclexplode(
            coalesce(c.relacl, pg_catalog.acldefault('r', c.relowner))) as acl
    where c.oid = 'public.duo_options'::regclass
      and acl.grantee::regrole::text = 'anon'),
  '',
  'ACL-8 … et anon n''y a RIEN : le visiteur ne lit pas le plateau par la table');
-- AUCUN `grant insert` SUR duo_settings — c'est le motif vitrine_settings, et
-- c'est ce qui force le passage par set_duo_suggestion, qui journalise.
select ok(
  not has_table_privilege('authenticated', 'public.duo_settings', 'INSERT'),
  'ACL-9 duo_settings n''accorde AUCUN insert : la ligne naît de la RPC, qui audite');
select ok(
  has_table_privilege('authenticated', 'public.duo_settings', 'SELECT'),
  'ACL-10 … mais reste lisible par les membres');

-- LES SIX RPC : service_role seul. Le motif est triplé par fonction — vrai pour
-- service_role, faux pour authenticated, faux pour anon.
select ok(has_function_privilege('service_role', 'public.duo_start(uuid,text)', 'EXECUTE'),
  'ACL-11 duo_start : service_role OUI');
select ok(not has_function_privilege('authenticated', 'public.duo_start(uuid,text)', 'EXECUTE'),
  'ACL-12 duo_start : authenticated NON');
select ok(not has_function_privilege('anon', 'public.duo_start(uuid,text)', 'EXECUTE'),
  'ACL-13 duo_start : anon NON');

select ok(has_function_privilege('service_role', 'public.duo_choose(uuid,text,uuid)', 'EXECUTE'),
  'ACL-14 duo_choose : service_role OUI');
select ok(not has_function_privilege('authenticated', 'public.duo_choose(uuid,text,uuid)', 'EXECUTE'),
  'ACL-15 duo_choose : authenticated NON');
select ok(not has_function_privilege('anon', 'public.duo_choose(uuid,text,uuid)', 'EXECUTE'),
  'ACL-16 duo_choose : anon NON');

select ok(has_function_privilege('service_role', 'public.duo_state(uuid,text)', 'EXECUTE'),
  'ACL-17 duo_state : service_role OUI');
select ok(not has_function_privilege('authenticated', 'public.duo_state(uuid,text)', 'EXECUTE'),
  'ACL-18 duo_state : authenticated NON');
select ok(not has_function_privilege('anon', 'public.duo_state(uuid,text)', 'EXECUTE'),
  'ACL-19 duo_state : anon NON');

select ok(has_function_privilege('service_role', 'public.set_duo_options(uuid,uuid[],uuid)', 'EXECUTE'),
  'ACL-20 set_duo_options : service_role OUI');
select ok(not has_function_privilege('authenticated', 'public.set_duo_options(uuid,uuid[],uuid)', 'EXECUTE'),
  'ACL-21 set_duo_options : authenticated NON');
select ok(not has_function_privilege('anon', 'public.set_duo_options(uuid,uuid[],uuid)', 'EXECUTE'),
  'ACL-22 set_duo_options : anon NON');

select ok(has_function_privilege('service_role', 'public.set_duo_suggestion(uuid,uuid,uuid)', 'EXECUTE'),
  'ACL-23 set_duo_suggestion : service_role OUI');
select ok(not has_function_privilege('authenticated', 'public.set_duo_suggestion(uuid,uuid,uuid)', 'EXECUTE'),
  'ACL-24 set_duo_suggestion : authenticated NON');
select ok(not has_function_privilege('anon', 'public.set_duo_suggestion(uuid,uuid,uuid)', 'EXECUTE'),
  'ACL-25 set_duo_suggestion : anon NON');

select ok(has_function_privilege('service_role', 'public.duo_options_state(uuid)', 'EXECUTE'),
  'ACL-26 duo_options_state : service_role OUI');
select ok(not has_function_privilege('authenticated', 'public.duo_options_state(uuid)', 'EXECUTE'),
  'ACL-27 duo_options_state : authenticated NON');
select ok(not has_function_privilege('anon', 'public.duo_options_state(uuid)', 'EXECUTE'),
  'ACL-28 duo_options_state : anon NON');

-- L'AIDE INTERNE N'EST RENDUE À PERSONNE, service_role compris : elle n'a de
-- sens qu'à l'intérieur des RPC, qui l'exécutent avec les privilèges de leur
-- propriétaire (motif player_lobby_rang).
select ok(not has_function_privilege('service_role', 'public.duo_options_json(uuid)', 'EXECUTE'),
  'ACL-29 duo_options_json n''est rendue à PERSONNE, service_role compris');
select ok(not has_function_privilege('authenticated', 'public.duo_options_json(uuid)', 'EXECUTE'),
  'ACL-30 … ni à authenticated');
select ok(not has_function_privilege('service_role', 'public.duo_jouable(uuid)', 'EXECUTE'),
  'ACL-30a duo_jouable non plus : c''est un seuil partagé, pas un point d''entrée');

-- LES HUIT FONCTIONS PORTENT `search_path = ''`. La garde globale
-- (search_path_invariant.test.sql) le vérifie sur tout le schéma ; on le vérifie
-- ICI aussi, parce qu'une garde globale nomme la faute sans dire de quel lot
-- elle vient. `vitrine_public_state` n'y figure pas : elle est RECRÉÉE par ce
-- lot mais elle appartient à Vitrine, et c'est vitrine.test.sql qui en répond.
select is(
  (select coalesce(pg_catalog.string_agg(p.proname, ',' order by p.proname), '')
     from pg_catalog.pg_proc p
     join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in ('duo_start', 'duo_choose', 'duo_state', 'set_duo_options',
                        'set_duo_suggestion', 'duo_options_state', 'duo_options_json',
                        'duo_jouable')
      -- LE PRÉDICAT EST CELUI DE `search_path_invariant.test.sql`, à la lettre :
      -- « aucun search_path du tout » OU « search_path = public ». Comparer à un
      -- littéral `search_path=` supposerait de deviner comment Postgres CITE la
      -- chaîne vide dans proconfig — il écrit `search_path=""` — et une garde
      -- qui repose sur une supposition de format n'en est pas une.
      and (p.proconfig is null
           or not exists (select 1 from pg_catalog.unnest(p.proconfig) c
                           where c like 'search_path=%')
           or 'search_path=public' = any(p.proconfig))),
  '',
  'ACL-31 les huit fonctions du lot portent un search_path, et ce n''est pas `public`');

-- ── LA RÈGLE CATALOGUE : CHECK ⇒ EXECUTE ─────────────────────
-- Une contrainte `check` s'évalue sous le rôle qui ÉCRIT la table. Toute
-- fonction qu'elle appelle doit donc être exécutable par ce rôle, sinon
-- l'insertion casse à l'exécution alors que le DDL s'est appliqué sans bruit.
-- Règle du dépôt, rejouée ici sur le schéma entier : ce lot ajoute des tables
-- écrites par `authenticated` (duo_options, duo_settings), donc il est
-- exactement dans la classe de bug qu'elle attrape.
select is(
  (select coalesce(pg_catalog.string_agg(distinct
       c.relname || '.' || con.conname || ' → ' || p.proname
         || ' [' || r.roleoid::regrole::text || ']', ', '), '')
     from pg_constraint con
     join pg_class c on c.oid = con.conrelid
     join pg_namespace n on n.oid = c.relnamespace
     join pg_depend dep
       on dep.classid = 'pg_constraint'::regclass
      and dep.objid = con.oid
      and dep.refclassid = 'pg_proc'::regclass
     join pg_proc p on p.oid = dep.refobjid
     cross join (values ('anon'::regrole::oid),
                        ('authenticated'::regrole::oid)) as r(roleoid)
    where n.nspname = 'public'
      and con.contype = 'c'
      and (has_any_column_privilege(r.roleoid, c.oid, 'INSERT')
        or has_any_column_privilege(r.roleoid, c.oid, 'UPDATE'))
      and not has_function_privilege(r.roleoid, p.oid, 'EXECUTE')),
  '',
  'ACL-32 toute fonction appelée par un check est exécutable par les rôles qui écrivent la table');
select cmp_ok(
  (select count(*)::int
     from pg_constraint con
     join pg_class c on c.oid = con.conrelid
     join pg_namespace n on n.oid = c.relnamespace
     join pg_depend dep
       on dep.classid = 'pg_constraint'::regclass
      and dep.objid = con.oid
      and dep.refclassid = 'pg_proc'::regclass
    where n.nspname = 'public' and con.contype = 'c'),
  '>=', 10,
  'ACL-33 … et la règle porte bien sur un ensemble NON VIDE de contraintes');

select * from finish();
rollback;
