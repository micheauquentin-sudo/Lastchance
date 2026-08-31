-- ============================================================
-- LA VITRINE NE SORT QUE PUBLIÉE, ET SEULEMENT CHEZ SOI (VIT-1a, lot L10)
--
-- Ce que ce fichier prouve, et dans quel ordre :
--
--   1. LES VOCABULAIRES SONT DANS LE CATALOGUE VIVANT, ET ON LES COMPTE. Huit
--      badges, quatorze allergènes, sept polices, SEPT blocs (cinq en VIT-1a,
--      plus les deux portes de VIT-3), trois styles de cartes. Le compte est lu
--      dans `pg_get_constraintdef` et dans `prosrc`,
--      pas dans une liste recopiée ici : une valeur retirée d'une migration
--      future fera rougir ce fichier, une liste jumelle n'aurait rien vu.
--   2. LE THÈME EST FERMÉ AUX DEUX RANGS. Une clé parasite de premier rang, une
--      couleur inconnue, une police hors catalogue, un bloc en double : tout est
--      refusé par la CONTRAINTE, donc en 23514, donc avant la base.
--   3. LE VOCABULAIRE DES FICHES EST FERMÉ, doublons compris.
--   4. L'ADRESSE PUBLIQUE EST UNIQUE, ET LE VOCABULAIRE RÉSERVÉ REFUSÉ. Aux
--      deux bouts : par la contrainte de table, et par la RPC qui rend trois
--      refus DISTINCTS — un écran ne peut pas dire « cette adresse est prise »
--      s'il reçoit le même mot pour « mal formée ».
--   5. LA PUBLICATION A DEUX GARDES, ET ELLES NE SE RECOUVRENT PAS. En lecture,
--      `published = false` et « droit éteint » rendent le MÊME `unavailable` ;
--      en écriture, le trigger refuse la transition vers `true` sans le droit.
--   6. L'ORDRE EST STABLE, ET C'EST (ordre, id). Prouvé sur des EX ÆQUO insérés
--      À L'ENVERS : sans le second rang, l'ordre rendu serait celui du plan.
--   7. LA FICHE INDISPONIBLE SORT QUAND MÊME, avec son drapeau.
--   8. LA SUPPRESSION D'UNE CARTE COMPTE D'ABORD. Non vide : refusée, et le
--      message nomme le compte. Vide : acceptée.
--   9. LE VOISIN NE VOIT RIEN, et il ne l'est pas parce qu'il serait cassé : sa
--      propre vitrine fonctionne normalement.
--  10. ANON N'A RIEN, sur aucune des quatre tables, ni en lecture ni ailleurs.
--
-- ── CE QUE CE FICHIER NE PROUVE PAS, ET IL FAUT LE DIRE ──
--
-- Il ne prouve rien du DRAPEAU SERVEUR qui retient la fonctionnalité jusqu'à
-- L11 : ce drapeau vit côté application, par décision, et aucune assertion SQL
-- ne peut l'observer. Ce qui est prouvé ici, c'est que la base ne laisse rien
-- sortir même si le drapeau tombait par erreur.
--
-- Il ne prouve pas non plus la parité entre les sept polices du `check` et
-- `FONT_KEYS` de src/lib/fonts.ts : le compte est vérifié des deux côtés, mais
-- la comparaison des DEUX LISTES demande une garde applicative, qui reste à
-- écrire (relayée dans le rapport du lot).
--
-- Le fichier doit passer sur une base VIDE comme sur une base SEMÉE : toutes
-- les assertions de données sont bornées aux organisations créées ici, et les
-- seules assertions globales portent sur le SCHÉMA, qui ne dépend pas du seed.
-- ============================================================
begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

select set_config('request.jwt.claims', '{"role":"service_role"}', true);

-- ── Fixtures ─────────────────────────────────────────────────
-- A : SERVIE — droit `vitrine` par OCTROI daté vivant (seul chemin ouvert en
--     bêta, 20261001120000). C'est la vitrine de référence.
-- B : VOISINE, servie elle aussi — sans quoi « le voisin ne voit rien » se
--     confondrait avec « le voisin n'a pas le module ».
-- C : SANS DROIT, et pourtant `published = true`. C'est la seule façon de
--     prouver que la garde de LECTURE est bien le droit et non la publication.
insert into public.organizations
  (id, name, slug, subscription_status, plan, timezone, data_retention_months)
values
  ('f1000000-0000-4000-8000-00000000000a', 'Vitrine A', 'tap-vitrine-a',
   'active', 'starter', 'Europe/Paris', 6),
  ('f1000000-0000-4000-8000-00000000000b', 'Vitrine B', 'tap-vitrine-b',
   'active', 'starter', 'Europe/Paris', 6),
  ('f1000000-0000-4000-8000-00000000000c', 'Vitrine C', 'tap-vitrine-c',
   'active', 'starter', 'Europe/Paris', 6);

insert into public.organization_module_grants
  (organization_id, module, kind, source, starts_at, ends_at)
values
  ('f1000000-0000-4000-8000-00000000000a', 'vitrine', 'pass', 'backoffice',
   now() - interval '1 day', now() + interval '365 days'),
  ('f1000000-0000-4000-8000-00000000000b', 'vitrine', 'pass', 'backoffice',
   now() - interval '1 day', now() + interval '365 days');

insert into auth.users
  (id, aud, role, email, encrypted_password, created_at, updated_at)
values
  ('f1000000-0000-4000-8000-000000000f01', 'authenticated', 'authenticated',
   'proprio-a@test.local', '', now(), now()),
  ('f1000000-0000-4000-8000-000000000f02', 'authenticated', 'authenticated',
   'caissier-a@test.local', '', now(), now()),
  ('f1000000-0000-4000-8000-000000000f03', 'authenticated', 'authenticated',
   'proprio-b@test.local', '', now(), now()),
  ('f1000000-0000-4000-8000-000000000f04', 'authenticated', 'authenticated',
   'proprio-c@test.local', '', now(), now());

insert into public.organization_members (organization_id, user_id, role) values
  ('f1000000-0000-4000-8000-00000000000a',
   'f1000000-0000-4000-8000-000000000f01', 'owner'),
  ('f1000000-0000-4000-8000-00000000000a',
   'f1000000-0000-4000-8000-000000000f02', 'cashier'),
  ('f1000000-0000-4000-8000-00000000000b',
   'f1000000-0000-4000-8000-000000000f03', 'owner'),
  ('f1000000-0000-4000-8000-00000000000c',
   'f1000000-0000-4000-8000-000000000f04', 'owner');


-- ══ 1. LES VOCABULAIRES, LUS DANS LE CATALOGUE VIVANT ═══════
--
-- Comptés et non recopiés. Une liste jumelle dans ce fichier n'aurait prouvé
-- qu'une chose : que quelqu'un sait copier-coller.

select is(
  (select pg_catalog.count(*)::bigint
     from pg_constraint c
     cross join lateral
       pg_catalog.regexp_matches(pg_catalog.pg_get_constraintdef(c.oid),
                                 '''([a-z_]+)''::text', 'g') m
    where c.conrelid = 'public.vitrine_items'::regclass
      and c.conname = 'vitrine_items_badges_check'),
  8::bigint,
  'les huit badges de régime sont portés par la contrainte VIVANTE de vitrine_items'
);

select is(
  (select pg_catalog.count(*)::bigint
     from pg_constraint c
     cross join lateral
       pg_catalog.regexp_matches(pg_catalog.pg_get_constraintdef(c.oid),
                                 '''([a-z_]+)''::text', 'g') m
    where c.conrelid = 'public.vitrine_items'::regclass
      and c.conname = 'vitrine_items_allergenes_check'),
  14::bigint,
  'les quatorze allergènes de l''annexe II du règlement UE 1169/2011 sont portés par la contrainte VIVANTE'
);

-- Les trois vocabulaires du thème vivent dans le CORPS du validateur : c'est là
-- qu'on les compte. `prosrc` est le texte installé, pas celui du fichier.
--
-- ── CHAQUE COMPTE EST BORNÉ À SA PROPRE CLAUSE, ET IL LE FAUT (VIT-13) ──
--
-- Ces trois gardes comptaient leurs mots dans TOUT le corps de la fonction.
-- Tant que le validateur ne portait que ces trois listes, c'était équivalent.
-- Il en porte onze de plus depuis l'allure, et `photo_taille` y a introduit la
-- valeur `sans` — qui est aussi une clé de POLICE. Le compte est passé à huit,
-- et la garde des polices a rougi pour une valeur qui n'a rien à voir avec
-- elles. Le commentaire SQL qui l'expliquait a rougi une seconde fois :
-- `prosrc` porte les commentaires.
--
-- On isole donc la LISTE de chaque clause avant de compter. C'est plus STRICT,
-- pas plus permissif : la garde vérifie désormais que les mots sont au bon
-- endroit, là où elle se contentait de les trouver quelque part. Et le prochain
-- vocabulaire qui contiendra `mono`, `script`, `liste` ou `social` ne fera
-- plus tomber une garde qui ne le concerne pas.
--
-- `substring(… from '…')` rend NULL si l'ancre a disparu ; `coalesce` en fait
-- alors une chaîne vide, donc un compte de zéro, donc un échec — jamais un
-- vert silencieux sur une garde devenue aveugle.

select is(
  (select pg_catalog.count(*)::bigint
     from pg_proc p
     cross join lateral
       pg_catalog.regexp_matches(
         coalesce(
           pg_catalog.substring(p.prosrc,
             '\(v_polices ->> e\.key\) not in[[:space:]]*\(([^)]*)\)'), ''),
         '''([a-z_]+)''', 'g') m
    where p.oid = 'public.is_valid_vitrine_theme(jsonb)'::regprocedure),
  7::bigint,
  'les sept polices de src/lib/fonts.ts sont recopiées DANS LA CLAUSE polices du validateur'
);

select is(
  (select pg_catalog.count(*)::bigint
     from pg_proc p
     cross join lateral
       pg_catalog.regexp_matches(
         coalesce(
           pg_catalog.substring(p.prosrc,
             '\(e\.value #>> ''\{\}''\) not in[[:space:]]*\(([^)]*)\)'), ''),
         '''([a-z_]+)''', 'g') m
    where p.oid = 'public.is_valid_vitrine_theme(jsonb)'::regprocedure),
  7::bigint,
  'les SEPT blocs de la page d''accueil sont le vocabulaire fermé d''ordre_blocs — les cinq de VIT-1a, plus les deux portes de VIT-3'
);

select is(
  (select pg_catalog.count(*)::bigint
     from pg_proc p
     cross join lateral
       pg_catalog.regexp_matches(
         coalesce(
           pg_catalog.substring(p.prosrc,
             '->> ''style_cartes''\) not in[[:space:]]*\(([^)]*)\)'), ''),
         '''([a-z_]+)''', 'g') m
    where p.oid = 'public.is_valid_vitrine_theme(jsonb)'::regprocedure),
  3::bigint,
  'les trois styles de cartes sont un vocabulaire fermé, pas une chaîne libre'
);

-- Le slug de vitrine N'EST PAS celui de l'organisation, et la longueur est ce
-- qui le prouve dans le catalogue : 3..60 ici, 2..48 sur `organizations`.
select ok(
  (select pg_catalog.pg_get_constraintdef(c.oid)
     from pg_constraint c
    where c.conrelid = 'public.vitrine_settings'::regclass
      and c.conname = 'vitrine_settings_slug_check')
  like '%{3,60}%',
  'le slug de vitrine a sa propre forme (3..60), distincte de organizations.slug (2..48)'
);


-- ══ 2. LE THÈME EST FERMÉ AUX DEUX RANGS ════════════════════
--
-- Chaque refus est celui de la CONTRAINTE (23514), donc il arrive avant que la
-- ligne existe — pas après, dans un écran qui aurait à la rattraper.

select is(public.set_vitrine_slug(
  'f1000000-0000-4000-8000-00000000000a', 'tap-comptoir',
  'f1000000-0000-4000-8000-000000000f01') ->> 'state', 'ok',
  'l''adresse publique se pose par la RPC, qui crée la ligne de réglages');

select ok(public.is_valid_vitrine_theme(
  '{"couleurs":{"primary":"#112233","secondary":"#AABBCC"},
    "polices":{"heading":"elegant","body":"sans"},
    "style_cartes":"grille",
    "ordre_blocs":["accroche","cartes","horaires"]}'::jsonb),
  'un thème complet et bien formé est accepté');

select ok(public.is_valid_vitrine_theme('{}'::jsonb),
  'un thème vide est accepté : « aucune personnalisation » est un état légitime');

select throws_ok(
  $$update public.vitrine_settings
       set theme = '{"couleurs":{"primary":"#112233"},"cta":"https://exemple.test"}'::jsonb
     where organization_id = 'f1000000-0000-4000-8000-00000000000a'$$,
  '23514',
  null,
  'une clé PARASITE de premier rang est refusée par la contrainte (leçon L8)');

select throws_ok(
  $$update public.vitrine_settings
       set theme = '{"couleurs":{"primary":"#112233","tertiary":"#000000"}}'::jsonb
     where organization_id = 'f1000000-0000-4000-8000-00000000000a'$$,
  '23514', null,
  'une couleur hors de {primary, secondary} est refusée');

select throws_ok(
  $$update public.vitrine_settings
       set theme = '{"polices":{"heading":"comic"}}'::jsonb
     where organization_id = 'f1000000-0000-4000-8000-00000000000a'$$,
  '23514', null,
  'une police absente du catalogue de fonts.ts est refusée');

select throws_ok(
  $$update public.vitrine_settings
       set theme = '{"couleurs":{"primary":"#123"}}'::jsonb
     where organization_id = 'f1000000-0000-4000-8000-00000000000a'$$,
  '23514', null,
  'la forme hexadécimale COURTE est refusée : deux écritures d''une même couleur casseraient la comparaison de version');

select throws_ok(
  $$update public.vitrine_settings
       set theme = '{"ordre_blocs":["cartes","cartes"]}'::jsonb
     where organization_id = 'f1000000-0000-4000-8000-00000000000a'$$,
  '23514', null,
  'un bloc listé DEUX FOIS est refusé : la page rendrait deux fois la même chose');

select throws_ok(
  $$update public.vitrine_settings
       set theme = '{"ordre_blocs":["menu"]}'::jsonb
     where organization_id = 'f1000000-0000-4000-8000-00000000000a'$$,
  '23514', null,
  'un bloc hors vocabulaire est refusé');

-- ── LES DEUX PORTES DE VIT-3, ET LA BORNE QUI PASSE DE CINQ À SEPT ──
--
-- LA PREMIÈRE ASSERTION PORTE LES DEUX CHANGEMENTS À ELLE SEULE : sept blocs
-- valides d'un coup ne passent QUE si le vocabulaire s'est élargi ET si la borne
-- de longueur a suivi. Restée à cinq, elle refuserait cette liste-là.
--
-- LA DEUXIÈME EST SUR-DÉTERMINÉE, ET C'EST ÉCRIT PLUTÔT QUE CACHÉ. Il n'existe
-- que sept blocs : toute liste de huit éléments contient forcément un doublon ou
-- un mot inconnu, donc son refus ne peut pas isoler la borne de longueur — le
-- test du doublon la refuserait aussi. Elle garde le CONTRAT (huit est refusé),
-- pas le mécanisme, et la borne reste dans la migration comme ceinture par
-- dessus les bretelles.
--
-- LA TROISIÈME prouve que le vocabulaire reste FERMÉ malgré son élargissement :
-- sans elle, ouvrir la liste à tout et n'importe quoi serait vert aux deux
-- premières.
--
-- LE RETRAIT D'UN BLOC EST LE RÉGLAGE COMMERÇANT : la permutation est PARTIELLE
-- depuis VIT-1a, donc masquer les portes c'est les omettre de l'ordre. C'est ce
-- que le thème à trois blocs plus haut exerce déjà, et c'est pourquoi aucun
-- drapeau « afficher les portes » n'est cherché ici — il n'en existe pas, et
-- une colonne de plus aurait donné deux façons de dire la même chose.
select ok(public.is_valid_vitrine_theme(
  '{"ordre_blocs":["accroche","histoire","cartes","horaires","social",
                   "reserver","experiences"]}'::jsonb),
  'les SEPT blocs à la fois sont acceptés : `reserver` et `experiences` rejoignent le vocabulaire fermé');

select ok(not public.is_valid_vitrine_theme(
  '{"ordre_blocs":["accroche","histoire","cartes","horaires","social",
                   "reserver","experiences","accroche"]}'::jsonb),
  'un HUITIÈME élément est refusé — sur-déterminé (le doublon le refuserait aussi), gardé pour le contrat et non pour le mécanisme');

select throws_ok(
  $$update public.vitrine_settings
       set theme = '{"ordre_blocs":["reserver","boutique"]}'::jsonb
     where organization_id = 'f1000000-0000-4000-8000-00000000000a'$$,
  '23514', null,
  'le vocabulaire reste FERMÉ après son élargissement : un huitième bloc inventé est refusé par la contrainte');


-- ══ 3. LE CATALOGUE, ET SES VOCABULAIRES FERMÉS ═════════════
--
-- ORDRE D'INSERTION VOLONTAIREMENT INVERSE de l'ordre attendu sur les ex æquo :
-- c'est la seule façon de prouver que le second rang de tri (`id`) fait un
-- travail, et non que la base rend par hasard ce qu'on vient d'écrire.

insert into public.vitrine_menus (id, organization_id, nom, ordre, active) values
  ('f1000000-0000-4000-8000-000000000101',
   'f1000000-0000-4000-8000-00000000000a', 'Carte du midi', 1, true),
  ('f1000000-0000-4000-8000-000000000102',
   'f1000000-0000-4000-8000-00000000000a', 'Hiver', 2, false),
  ('f1000000-0000-4000-8000-000000000103',
   'f1000000-0000-4000-8000-00000000000a', 'Carte vide', 3, true);

-- 202 AVANT 201, et les deux au MÊME `ordre`.
insert into public.vitrine_categories (id, menu_id, organization_id, nom, ordre) values
  ('f1000000-0000-4000-8000-000000000202',
   'f1000000-0000-4000-8000-000000000101',
   'f1000000-0000-4000-8000-00000000000a', 'Plats', 4),
  ('f1000000-0000-4000-8000-000000000201',
   'f1000000-0000-4000-8000-000000000101',
   'f1000000-0000-4000-8000-00000000000a', 'Entrées', 4);

-- 302 AVANT 301, et les deux au MÊME `ordre`. 303 est l'indisponible.
insert into public.vitrine_items
  (id, categorie_id, organization_id, nom, description, prix_affiche,
   badges, allergenes, disponible, ordre)
values
  ('f1000000-0000-4000-8000-000000000302',
   'f1000000-0000-4000-8000-000000000201',
   'f1000000-0000-4000-8000-00000000000a', 'Tartare de bœuf',
   'Coupé au couteau.', '19 €',
   array['traditionnel']::text[], array['oeufs', 'moutarde']::text[], true, 7),
  ('f1000000-0000-4000-8000-000000000301',
   'f1000000-0000-4000-8000-000000000201',
   'f1000000-0000-4000-8000-00000000000a', 'Velouté de potiron',
   'Crème légère et graines torréfiées.', 'à partir de 8 €',
   array['vegetarien', 'sain']::text[], array['lait', 'celeri']::text[], true, 7),
  ('f1000000-0000-4000-8000-000000000303',
   'f1000000-0000-4000-8000-000000000201',
   'f1000000-0000-4000-8000-00000000000a', 'Huîtres n°3',
   null, '3 pièces / 9 €',
   array[]::text[], array['mollusques', 'sulfites']::text[], false, 9);

-- PRIX AFFICHÉ : c'est du TEXTE, et ces trois formes sont exactement celles
-- qu'un décimal contraint aurait refusées.
select is(
  (select pg_catalog.count(*)::bigint from public.vitrine_items i
    where i.organization_id = 'f1000000-0000-4000-8000-00000000000a'
      and i.prix_affiche in ('19 €', 'à partir de 8 €', '3 pièces / 9 €')),
  3::bigint,
  '« à partir de 8 € » et « 3 pièces / 9 € » sont des prix affichés valides — un décimal les aurait refusés');

select throws_ok(
  $$update public.vitrine_items set badges = array['halal']::text[]
     where id = 'f1000000-0000-4000-8000-000000000301'$$,
  '23514', null,
  'un badge hors du vocabulaire de la plateforme est refusé');

select throws_ok(
  $$update public.vitrine_items set badges = array['vegan','vegan']::text[]
     where id = 'f1000000-0000-4000-8000-000000000301'$$,
  '23514', null,
  'un badge en DOUBLE est refusé : l''écran rendrait deux fois la même pastille');

select throws_ok(
  $$update public.vitrine_items set allergenes = array['noix']::text[]
     where id = 'f1000000-0000-4000-8000-000000000301'$$,
  '23514', null,
  'un allergène hors de l''annexe II est refusé — c''est le champ où se tromper compte');

select throws_ok(
  $$update public.vitrine_items set allergenes = array['gluten', null]::text[]
     where id = 'f1000000-0000-4000-8000-000000000301'$$,
  '23514', null,
  'un `null` DANS le tableau est refusé : `<@` seul l''aurait laissé passer en silence');

-- LA FK EST COMPOSITE, et voici ce qu'elle refuse : coudre une rubrique de A
-- sous la carte de… A, mais en la déclarant chez B. Une FK d'une seule colonne
-- aurait accepté.
select throws_ok(
  $$insert into public.vitrine_categories (menu_id, organization_id, nom, ordre)
    values ('f1000000-0000-4000-8000-000000000101',
            'f1000000-0000-4000-8000-00000000000b', 'Volée', 1)$$,
  '23503', null,
  'la FK COMPOSITE refuse une rubrique déclarée chez un autre locataire que sa carte');


-- ══ 4. L'ADRESSE PUBLIQUE ═══════════════════════════════════

select is(public.set_vitrine_slug(
  'f1000000-0000-4000-8000-00000000000b', 'tap-comptoir',
  'f1000000-0000-4000-8000-000000000f03') ->> 'state', 'slug_taken',
  'l''adresse est UNIQUE GLOBALEMENT : le voisin ne peut pas prendre celle de A');

select is(public.set_vitrine_slug(
  'f1000000-0000-4000-8000-00000000000b', 'admin',
  'f1000000-0000-4000-8000-000000000f03') ->> 'state', 'reserved_slug',
  'le vocabulaire réservé de la plateforme est refusé, et se DISTINGUE de « mal formé »');

select is(public.set_vitrine_slug(
  'f1000000-0000-4000-8000-00000000000b', 'Le Comptoir !',
  'f1000000-0000-4000-8000-000000000f03') ->> 'state', 'invalid_slug',
  'un slug hors forme est refusé sous son propre mot');

select is(public.set_vitrine_slug(
  'f1000000-0000-4000-8000-00000000000b', 'ab',
  'f1000000-0000-4000-8000-000000000f03') ->> 'state', 'invalid_slug',
  'deux caractères ne suffisent pas : la borne basse est trois');

-- NORMALISATION : majuscules et espaces de bord sont ramenés, le reste ne l'est
-- jamais en silence.
select is(public.set_vitrine_slug(
  'f1000000-0000-4000-8000-00000000000b', '  Chez-Bee  ',
  'f1000000-0000-4000-8000-000000000f03') ->> 'slug', 'chez-bee',
  'l''adresse est normalisée en minuscules détourées avant d''être validée');

select throws_ok(
  $$insert into public.vitrine_settings (organization_id, slug)
    values ('f1000000-0000-4000-8000-00000000000c', 'dashboard')$$,
  '23514', null,
  'le vocabulaire réservé est AUSSI refusé par la contrainte de table, pas seulement par la RPC');

-- LE CAISSIER N'EST PAS UN ÉDITEUR D'ADRESSE. Ce n'est pas un geste de
-- comptoir : il engage les QR déjà imprimés.
select throws_ok(
  $$select public.set_vitrine_slug(
      'f1000000-0000-4000-8000-00000000000a', 'tap-autre-nom',
      'f1000000-0000-4000-8000-000000000f02')$$,
  '42501', 'not authorized',
  'le caissier ne change pas l''adresse publique');

-- LE JOURNAL COMPTE LES GESTES, PAS LES NON-GESTES.
select is(
  (select pg_catalog.count(*)::bigint from public.audit_logs a
    where a.organization_id = 'f1000000-0000-4000-8000-00000000000a'
      and a.action = 'vitrine.slug_set'),
  1::bigint,
  'la pose de l''adresse est journalisée UNE fois');

select is(public.set_vitrine_slug(
  'f1000000-0000-4000-8000-00000000000a', 'tap-comptoir',
  'f1000000-0000-4000-8000-000000000f01') ->> 'changed', 'false',
  'réenregistrer la MÊME adresse ne change rien');

select is(
  (select pg_catalog.count(*)::bigint from public.audit_logs a
    where a.organization_id = 'f1000000-0000-4000-8000-00000000000a'
      and a.action = 'vitrine.slug_set'),
  1::bigint,
  '… et n''écrit pas une seconde ligne d''audit : un journal qui compte les non-gestes devient illisible');


-- ══ 5. LA PUBLICATION, ET SES DEUX GARDES ═══════════════════

select is(public.vitrine_public_state('tap-comptoir') ->> 'state', 'unavailable',
  'une vitrine NON PUBLIÉE est muette');

update public.vitrine_settings set published = true
 where organization_id = 'f1000000-0000-4000-8000-00000000000a';

select is(public.vitrine_public_state('tap-comptoir') ->> 'state', 'ok',
  'publiée et servie par son droit, la vitrine répond');

select is(public.vitrine_public_state('tap-inconnue') ->> 'state', 'unavailable',
  'un slug inconnu rend le MÊME mot : ce point d''entrée n''est pas un oracle');

select is(public.vitrine_public_state('AB') ->> 'state', 'unavailable',
  'un slug hors forme rend `unavailable` et ne LÈVE pas — lever distinguerait « impossible » d''« inconnu »');

-- C EST PUBLIÉE ET SANS DROIT. C'est le cas qui sépare les deux gardes.
insert into public.vitrine_settings (organization_id, slug, published)
values ('f1000000-0000-4000-8000-00000000000c', 'tap-sans-droit', true);

select is(public.vitrine_public_state('tap-sans-droit') ->> 'state', 'unavailable',
  'une vitrine PUBLIÉE dont l''organisation n''a pas le droit `vitrine` reste muette');

select ok(
  not public.org_has_module_access('f1000000-0000-4000-8000-00000000000c', 'vitrine'),
  '… et c''est bien le droit qui manque, pas la publication');

-- LA GARDE D'ÉCRITURE, celle que le lot L2 annonçait. Le propriétaire de C est
-- légitime, sa policy l'autorise : seul le droit de module manque.
select set_config('request.jwt.claims',
  '{"role":"authenticated","sub":"f1000000-0000-4000-8000-000000000f04"}', true);

update public.vitrine_settings set published = false
 where organization_id = 'f1000000-0000-4000-8000-00000000000c';

select throws_ok(
  $$update public.vitrine_settings set published = true
     where organization_id = 'f1000000-0000-4000-8000-00000000000c'$$,
  'P0001', 'module access required: vitrine',
  'le trigger de publication refuse la TRANSITION vers `true` sans le droit');

-- LE RETOUR EN ARRIÈRE N'EST JAMAIS GARDÉ : on ne bloque pas quelqu'un qui veut
-- cesser de publier.
update public.vitrine_settings set published = false
 where organization_id = 'f1000000-0000-4000-8000-00000000000c';
select is(
  (select published from public.vitrine_settings
    where organization_id = 'f1000000-0000-4000-8000-00000000000c'),
  false,
  'dépublier reste possible sans le droit — la garde ne prend pas le commerçant en otage');

select set_config('request.jwt.claims', '{"role":"service_role"}', true);


-- ══ 6. L'ORDRE EST (ordre, id), AUX TROIS NIVEAUX ═══════════
--
-- Les deux rubriques et les deux premières fiches ont été insérées À L'ENVERS,
-- au MÊME `ordre`. Sans le second rang de tri, la réponse serait celle du plan
-- d'exécution — c'est-à-dire susceptible de changer entre deux consultations,
-- sans que personne n'ait touché à la carte.

select is(
  public.vitrine_public_state('tap-comptoir')
    #>> '{cartes,0,categories,0,nom}',
  'Entrées',
  'à `ordre` égal, les rubriques sortent par `id` — pas par ordre d''insertion');

select is(
  public.vitrine_public_state('tap-comptoir')
    #>> '{cartes,0,categories,1,nom}',
  'Plats',
  '… et la seconde suit, stablement');

select is(
  public.vitrine_public_state('tap-comptoir')
    #>> '{cartes,0,categories,0,fiches,0,nom}',
  'Velouté de potiron',
  'à `ordre` égal, les fiches sortent par `id` — même invariant, même raison');

select is(
  public.vitrine_public_state('tap-comptoir')
    #>> '{cartes,0,nom}',
  'Carte du midi',
  'les cartes sortent par (ordre, id)');


-- ══ 7. CE QUI SORT, ET CE QUI NE SORT PAS ═══════════════════

-- LA CARTE INACTIVE NE SORT PAS. Deux cartes actives sur trois.
select is(
  pg_catalog.jsonb_array_length(
    public.vitrine_public_state('tap-comptoir') -> 'cartes'),
  2,
  'la carte `active = false` disparaît du parcours public — c''est la carte saisonnière');

-- LA FICHE INDISPONIBLE SORT, AVEC SON DRAPEAU. Trois fiches, dont une grisée.
select is(
  pg_catalog.jsonb_array_length(
    public.vitrine_public_state('tap-comptoir')
      #> '{cartes,0,categories,0,fiches}'),
  3,
  'la fiche indisponible est rendue quand même : l''écran la grise, il ne la fait pas disparaître');

select is(
  public.vitrine_public_state('tap-comptoir')
    #>> '{cartes,0,categories,0,fiches,2,disponible}',
  'false',
  '… et elle porte son drapeau, pour que l''écran sache quoi en faire');

-- L'IDENTITÉ VIENT D'`organizations` et n'est pas recopiée.
select is(
  public.vitrine_public_state('tap-comptoir') #>> '{identite,nom}',
  'Vitrine A',
  'l''enseigne vient d''organizations : une seconde copie aurait donné deux enseignes à tenir d''accord');

select ok(
  public.vitrine_public_state('tap-comptoir') ? 'liens',
  'les liens sortants du commerce (avis Google, Instagram, TikTok) accompagnent la vitrine');

-- L'ÉDITEUR, LUI, VOIT TOUT.
select is(
  pg_catalog.jsonb_array_length(
    public.vitrine_dashboard_state('f1000000-0000-4000-8000-00000000000a')
      -> 'cartes'),
  3,
  'l''éditeur voit AUSSI la carte inactive — il ne doit pas la découvrir en créant son homonyme');

select is(
  public.vitrine_dashboard_state('f1000000-0000-4000-8000-00000000000a')
    ->> 'module_access', 'true',
  'l''éditeur sait s''il PEUT publier avant de cliquer');

-- Une organisation qui n'a jamais ouvert sa vitrine : `settings` vaut `null`,
-- pas un objet vide. « Choisissez votre adresse » n'est pas « enregistrez ».
insert into public.organizations
  (id, name, slug, subscription_status, plan, timezone, data_retention_months)
values ('f1000000-0000-4000-8000-00000000000d', 'Vitrine D', 'tap-vitrine-d',
        'active', 'starter', 'Europe/Paris', 6);

select is(
  public.vitrine_dashboard_state('f1000000-0000-4000-8000-00000000000d')
    -> 'settings',
  'null'::jsonb,
  'sans adresse choisie, `settings` vaut null — un premier pas à proposer, pas un formulaire vide');

select is(
  public.vitrine_dashboard_state('f1000000-0000-4000-8000-00000000000d')
    ->> 'state', 'ok',
  '… et l''état reste `ok` : l''organisation existe, sa vitrine n''a jamais été ouverte');


-- ══ 8. LA SUPPRESSION D'UNE CARTE COMPTE D'ABORD ════════════
--
-- La garde n'est armée que pour un JWT marchand : c'est le CLIC qu'elle
-- protège, pas la cascade d'une organisation supprimée.

select set_config('request.jwt.claims',
  '{"role":"authenticated","sub":"f1000000-0000-4000-8000-000000000f01"}', true);

select throws_ok(
  $$delete from public.vitrine_menus
     where id = 'f1000000-0000-4000-8000-000000000101'$$,
  '23503', null,
  'supprimer une carte NON VIDE est refusé : le geste unique aurait emporté rubriques et fiches sans que personne ne les compte');

delete from public.vitrine_menus
 where id = 'f1000000-0000-4000-8000-000000000103';
select is(
  (select pg_catalog.count(*)::bigint from public.vitrine_menus m
    where m.organization_id = 'f1000000-0000-4000-8000-00000000000a'),
  2::bigint,
  'une carte VIDE se supprime : rien n''est perdu, et les brouillons ne s''accumulent pas pour toujours');

-- LA RUBRIQUE, ELLE, SE SUPPRIME AVEC SES FICHES : c'est du contenu éditorial,
-- il tient sur un écran, et le commerçant voit ce qu'il retire.
delete from public.vitrine_categories
 where id = 'f1000000-0000-4000-8000-000000000202';
select is(
  (select pg_catalog.count(*)::bigint from public.vitrine_categories k
    where k.menu_id = 'f1000000-0000-4000-8000-000000000101'),
  1::bigint,
  'une rubrique se supprime librement — contenu éditorial, pas historique client');

select set_config('request.jwt.claims', '{"role":"service_role"}', true);


-- ══ 9. LE VOISIN NE VOIT RIEN, ET IL N'EST PAS CASSÉ ════════

set local role authenticated;
set local "request.jwt.claim.sub" = 'f1000000-0000-4000-8000-000000000f03';

select results_eq(
  $$select count(*) from public.vitrine_settings
     where organization_id = 'f1000000-0000-4000-8000-00000000000a'$$,
  array[0::bigint],
  'le propriétaire voisin ne lit pas les réglages de vitrine d''un autre locataire');
select results_eq(
  $$select count(*) from public.vitrine_menus
     where organization_id = 'f1000000-0000-4000-8000-00000000000a'$$,
  array[0::bigint],
  'le propriétaire voisin ne lit aucune carte d''un autre locataire');
select results_eq(
  $$select count(*) from public.vitrine_categories
     where organization_id = 'f1000000-0000-4000-8000-00000000000a'$$,
  array[0::bigint],
  'le propriétaire voisin ne lit aucune rubrique d''un autre locataire');
select results_eq(
  $$select count(*) from public.vitrine_items
     where organization_id = 'f1000000-0000-4000-8000-00000000000a'$$,
  array[0::bigint],
  'le propriétaire voisin ne lit aucune fiche d''un autre locataire');

-- ET IL N'EST PAS MUET PAR PANNE : sa propre vitrine se lit.
select results_eq(
  $$select count(*) from public.vitrine_settings
     where organization_id = 'f1000000-0000-4000-8000-00000000000b'$$,
  array[1::bigint],
  '… et le voisin lit BIEN sa propre vitrine — le zéro d''en face est un refus, pas une panne');

-- LE CAISSIER N'EST PAS UN ÉDITEUR. La vitrine est de la configuration : il
-- n'a pas à la lire, et encore moins à l'écrire.
set local "request.jwt.claim.sub" = 'f1000000-0000-4000-8000-000000000f02';
select results_eq(
  'select count(*) from public.vitrine_menus',
  array[0::bigint],
  'le caissier ne lit pas le catalogue de vitrine : ce n''est pas un écran de comptoir');

reset role;


-- ══ 10. LES ACL — anon n'a RIEN, nulle part ═════════════════
--
-- Ces assertions doublent celles de security_acl.test.sql, et c'est voulu :
-- celui-là garde le schéma entier, celui-ci garde CE lot. Un fichier qui ajoute
-- quatre tables doit dire lui-même ce qu'il a fermé.

select ok(not has_table_privilege('anon', 'public.vitrine_settings', 'SELECT'),
  'anon ne lit pas les réglages de vitrine directement');
select ok(not has_table_privilege('anon', 'public.vitrine_menus', 'SELECT'),
  'anon ne lit pas les cartes directement');
select ok(not has_table_privilege('anon', 'public.vitrine_categories', 'SELECT'),
  'anon ne lit pas les rubriques directement');
select ok(not has_table_privilege('anon', 'public.vitrine_items', 'SELECT'),
  'anon ne lit pas les fiches directement');

select ok(not has_column_privilege('authenticated', 'public.vitrine_settings', 'slug', 'UPDATE'),
  'le marchand ne réécrit pas l''adresse publique en direct : elle passe par la RPC qui journalise');
select ok(not has_table_privilege('authenticated', 'public.vitrine_settings', 'INSERT'),
  'le marchand ne CRÉE pas ses réglages en direct : le premier choix d''adresse est celui qui engage les QR');
select ok(not has_table_privilege('authenticated', 'public.vitrine_settings', 'DELETE'),
  'le marchand ne supprime pas ses réglages : dépublier suffit, et rien ne se perd');

select ok(has_function_privilege('service_role', 'public.vitrine_public_state(text,text)', 'EXECUTE'),
  'seul le serveur rend l''état public d''une vitrine');
select ok(not has_function_privilege('anon', 'public.vitrine_public_state(text,text)', 'EXECUTE'),
  'anon n''appelle pas la RPC publique de vitrine directement');
select ok(not has_function_privilege('authenticated', 'public.set_vitrine_slug(uuid,text,text)', 'EXECUTE'),
  'le marchand ne contourne pas l''action serveur pour poser son adresse');
select ok(not has_function_privilege('service_role', 'public.vitrine_cartes_json(uuid,boolean,text)', 'EXECUTE'),
  'l''arbre du catalogue n''est appelable par personne : il ne garde ni droit ni publication');

-- ── LES TROIS VALIDATEURS DE `check` SONT EXÉCUTABLES PAR L'ÉCRIVAIN ──
--
-- Motif ACL-32, une assertion PAR FONCTION. Ce sont les trois seules fonctions
-- de ce lot appelées depuis une contrainte `check`, et le sens de l'assertion
-- est l'INVERSE de ce que ce fichier a d'abord affirmé : un `check` de table
-- s'évalue avec les privilèges du rôle qui ÉCRIT la ligne, jamais « sans
-- contrôle de privilège ». Sans ces trois grants, aucun commerçant ne pouvait
-- écrire une fiche ni enregistrer ses réglages (même classe que
-- 20261008120000). La règle de schéma qui ferme la classe pour de bon vit dans
-- security_acl.test.sql.
select ok(has_function_privilege('authenticated', 'public.is_valid_vitrine_vocabulaire(text[],text[])', 'EXECUTE'),
  'le validateur de vocabulaire est exécutable par le rôle qui écrit les fiches');
select ok(has_function_privilege('authenticated', 'public.is_valid_vitrine_theme(jsonb)', 'EXECUTE'),
  'le validateur de thème est exécutable par le rôle qui écrit les réglages');
select ok(has_function_privilege('authenticated', 'public.is_reserved_vitrine_slug(text)', 'EXECUTE'),
  'le vocabulaire réservé est exécutable par le rôle qui écrit les réglages — un UPDATE réévalue TOUS les `check` de la ligne');
select ok(not has_function_privilege('anon', 'public.is_valid_vitrine_vocabulaire(text[],text[])', 'EXECUTE'),
  'anon n''écrit dans aucune des quatre tables : il n''a pas non plus les validateurs');
select ok(not has_function_privilege('anon', 'public.is_valid_vitrine_theme(jsonb)', 'EXECUTE'),
  'anon n''a pas le validateur de thème');
select ok(not has_function_privilege('anon', 'public.is_reserved_vitrine_slug(text)', 'EXECUTE'),
  'anon ne sonde pas le vocabulaire réservé des adresses');


-- ══ 11. LE COMMERÇANT ÉCRIT VRAIMENT — sous son propre rôle ═
--
-- CE QUE CETTE SECTION EXISTE POUR ATTRAPER, et que rien d'autre dans ce fichier
-- ne pouvait voir : toutes les écritures ci-dessus passent sous le rôle `postgres`
-- (celui de psql), qui POSSÈDE les validateurs et en a donc l'EXECUTE d'office.
-- Le fichier était entièrement vert alors que PAS UN commerçant ne pouvait
-- écrire une fiche ni enregistrer une accroche — « permission denied for
-- function is_valid_vitrine_vocabulaire », la même erreur qu'au lot L8.
--
-- Ce qui manquait n'est pas une assertion de plus, c'est LE RÔLE : `set local
-- role authenticated` fait passer les mêmes DML par les mêmes contrôles de
-- privilège que PostgREST. Aucune assertion d'ACL ne remplace cela — une ACL
-- prouve un grant, elle ne prouve pas qu'une écriture aboutit.
select set_config('request.jwt.claims',
  '{"role":"authenticated","sub":"f1000000-0000-4000-8000-000000000f01"}', true);
set local role authenticated;
set local "request.jwt.claim.sub" = 'f1000000-0000-4000-8000-000000000f01';

-- ── LA FICHE : le `check` de badges ET celui d'allergènes s'évaluent ──
select lives_ok(
  $$insert into public.vitrine_items
      (categorie_id, organization_id, nom, prix_affiche, badges, allergenes, ordre)
    values ('f1000000-0000-4000-8000-000000000201',
            'f1000000-0000-4000-8000-00000000000a',
            'Focaccia du jour', '5 €',
            array['vegetarien', 'fait_maison']::text[],
            array['gluten']::text[], 12)$$,
  'le commerçant crée une fiche SOUS SON PROPRE RÔLE — sans le grant, c''était « permission denied for function is_valid_vitrine_vocabulaire »');

-- LE GRANT N'A PAS DÉSARMÉ LE VALIDATEUR, et c'est le contrôle qui le prouve :
-- le refus est toujours un 23514 (la contrainte), pas un 42501 (le privilège).
select throws_ok(
  $$update public.vitrine_items set badges = array['halal']::text[]
     where id = 'f1000000-0000-4000-8000-000000000301'$$,
  '23514', null,
  '… et le vocabulaire fermé mord toujours sous ce rôle : 23514, pas 42501');

-- ── LES RÉGLAGES : une SEULE colonne touchée, TROIS `check` réévalués ──
--
-- C'est le cas le plus contre-intuitif de la classe, et celui qui rendait le bug
-- illisible : l'accroche n'a aucun validateur à elle. Ce sont les `check` du
-- SLUG et du THÈME — deux colonnes auxquelles le commerçant ne touche pas — qui
-- refusaient l'écriture, parce qu'un UPDATE réévalue toutes les contraintes de
-- la ligne.
select lives_ok(
  $$update public.vitrine_settings
       set accroche = 'La table du quartier, depuis 1998.'
     where organization_id = 'f1000000-0000-4000-8000-00000000000a'$$,
  'le commerçant enregistre son accroche : l''UPDATE réévalue les `check` du slug et du thème, qu''il n''a pourtant pas touchés');

select lives_ok(
  $$update public.vitrine_settings
       set theme = '{"couleurs":{"primary":"#112233"},"style_cartes":"grille"}'::jsonb
     where organization_id = 'f1000000-0000-4000-8000-00000000000a'$$,
  'le commerçant règle son thème sous son propre rôle');

-- PUBLIER ET DÉPUBLIER, sous le rôle marchand et avec le droit `vitrine` vivant.
update public.vitrine_settings set published = false
 where organization_id = 'f1000000-0000-4000-8000-00000000000a';
select lives_ok(
  $$update public.vitrine_settings set published = true
     where organization_id = 'f1000000-0000-4000-8000-00000000000a'$$,
  'le commerçant qui a le droit `vitrine` publie sous son propre rôle — la garde de publication passe, et les `check` de la ligne aussi');

reset role;

select is(
  (select accroche from public.vitrine_settings
    where organization_id = 'f1000000-0000-4000-8000-00000000000a'),
  'La table du quartier, depuis 1998.',
  '… et l''écriture a bien atterri : ce n''était pas un refus silencieux');


-- ══ 12. LA TRADUCTION (VIT-1b, lot L11) ═════════════════════
--
-- Ce que cette section prouve, et pourquoi elle a sa propre organisation :
--
--   * les onze sections précédentes ONT MUTÉ la vitrine A — carte supprimée,
--     rubrique supprimée, accroche réécrite, fiche ajoutée. Compter des champs
--     traduisibles sur elle aurait donné un nombre qui dépend de tout ce qui
--     précède, c'est-à-dire un nombre que personne ne peut relire. E est POSÉE
--     ICI, complète et immobile, et ses comptes se lisent à la main : 1 accroche
--     + 1 carte + 1 rubrique + 3 champs de fiches = SIX.
--
--   * une traduction FRAÎCHE se superpose champ à champ, aux quatre niveaux ;
--   * une traduction PÉRIMÉE est ignorée et le FRANÇAIS ressort — c'est le seul
--     comportement propre à ce lot, et un écran qui ignorerait `version_source`
--     serait vert partout ailleurs ;
--   * `touch_updated_at` PÉRIME vraiment : la même traduction est fraîche avant
--     un `update` de sa cible et périmée après, sans que rien d'autre ne bouge ;
--   * une langue inconnue retombe sur le français, sans lever ;
--   * l'écriture inter-locataire est refusée là où AUCUNE FK ne peut la refuser.

select set_config('request.jwt.claims', '{"role":"service_role"}', true);

-- ── Fixture E : petite, complète, et jamais touchée ailleurs ─
insert into public.organizations
  (id, name, slug, subscription_status, plan, timezone, data_retention_months)
values ('f1000000-0000-4000-8000-00000000000e', 'Vitrine E', 'tap-vitrine-e',
        'active', 'starter', 'Europe/Paris', 6);

insert into public.organization_module_grants
  (organization_id, module, kind, source, starts_at, ends_at)
values ('f1000000-0000-4000-8000-00000000000e', 'vitrine', 'pass', 'backoffice',
        now() - interval '1 day', now() + interval '365 days');

-- UN ACTEUR POUR E (VIT-5, point M2 de la revue L15). Les deux portes du calque
-- exigent désormais un membre `owner|editor` vérifié EN SQL : sans lui, toute
-- cette section lèverait 42501 avant d'atteindre ce qu'elle prouve. L'ÉDITEUR
-- suffit ici — le rôle est tranché dans la fixture L15, qui porte aussi un
-- caissier.
insert into auth.users
  (id, aud, role, email, encrypted_password, created_at, updated_at)
values
  ('f1000000-0000-4000-8000-000000000f0e', 'authenticated', 'authenticated',
   'editeur-e@test.local', '', now(), now());

insert into public.organization_members (organization_id, user_id, role) values
  ('f1000000-0000-4000-8000-00000000000e',
   'f1000000-0000-4000-8000-000000000f0e', 'editor');

-- `histoire` et `horaires_texte` restent NULLES, et c'est une assertion
-- déguisée : un champ vide n'est pas traduisible, donc le total doit valoir six
-- et non huit. Les compter aurait plafonné pour toujours la couverture d'une
-- vitrine sobre — donc éteint son sélecteur de langue alors que tout son texte
-- est traduit.
insert into public.vitrine_settings
  (id, organization_id, slug, published, accroche)
values ('f1000000-0000-4000-8000-000000000401',
        'f1000000-0000-4000-8000-00000000000e', 'tap-traduction', true,
        'Le bar à vins de la place.');

insert into public.vitrine_menus (id, organization_id, nom, ordre, active) values
  ('f1000000-0000-4000-8000-000000000501',
   'f1000000-0000-4000-8000-00000000000e', 'Carte du soir', 1, true);

insert into public.vitrine_categories (id, menu_id, organization_id, nom, ordre)
values
  ('f1000000-0000-4000-8000-000000000601',
   'f1000000-0000-4000-8000-000000000501',
   'f1000000-0000-4000-8000-00000000000e', 'Entrées', 1);

insert into public.vitrine_items
  (id, categorie_id, organization_id, nom, description, prix_affiche,
   badges, allergenes, disponible, ordre)
values
  ('f1000000-0000-4000-8000-000000000701',
   'f1000000-0000-4000-8000-000000000601',
   'f1000000-0000-4000-8000-00000000000e', 'Velouté de potiron',
   'Crème légère.', 'à partir de 8 €',
   array['vegetarien']::text[], array['lait']::text[], true, 1),
  -- SANS DESCRIPTION : sa seule ligne traduisible est son nom.
  ('f1000000-0000-4000-8000-000000000702',
   'f1000000-0000-4000-8000-000000000601',
   'f1000000-0000-4000-8000-00000000000e', 'Houmous du jour',
   null, '7 €',
   array['vegan']::text[], array['sesame']::text[], true, 2);


-- ── 12a. LE SCHÉMA : le signal de version, et la table du calque ──

select has_trigger('public', 'vitrine_settings',
  'vitrine_settings_touch_updated_at',
  'les réglages portent le signal de version : sans lui, `updated_at` mentait depuis L10');
select has_trigger('public', 'vitrine_menus',
  'vitrine_menus_touch_updated_at', 'les cartes portent le signal de version');
select has_trigger('public', 'vitrine_categories',
  'vitrine_categories_touch_updated_at', 'les rubriques portent le signal de version');
select has_trigger('public', 'vitrine_items',
  'vitrine_items_touch_updated_at', 'les fiches portent le signal de version');

-- `clock_timestamp` ET NON `now` : `now()` est constante sur toute la
-- transaction, deux écritures successives y rendraient le même instant et une
-- traduction capturée entre les deux passerait pour fraîche. L'assertion lit le
-- corps INSTALLÉ, pas le fichier de migration.
select ok(
  (select position('clock_timestamp' in p.prosrc) > 0
     from pg_proc p where p.oid = 'public.touch_updated_at()'::regprocedure),
  'le signal de version avance à `clock_timestamp`, pas à `now` — sinon la péremption serait aveugle à l''intérieur d''une transaction');

select ok(
  (select c.relrowsecurity from pg_class c
    where c.oid = 'public.vitrine_translations'::regclass),
  'la table des traductions tourne sous RLS');
select is(
  (select pg_catalog.count(*)::bigint from pg_policies
    where schemaname = 'public' and tablename = 'vitrine_translations'),
  0::bigint,
  'elle ne porte AUCUNE policy : ni le commerçant ni le visiteur ne la lisent en direct, ils passent par les RPC');

-- LA LANGUE CIBLE EST UN VOCABULAIRE FERMÉ, et son compte est ce qui force à
-- revenir ici : `vitrine_public_state` et `vitrine_translation_state` écrivent
-- toutes deux « la seule langue traduite ». Ajouter une seconde langue au
-- `check` sans toucher les deux RPC fera rougir cette ligne.
select is(
  (select pg_catalog.count(*)::bigint
     from pg_constraint c
     cross join lateral
       pg_catalog.regexp_matches(pg_catalog.pg_get_constraintdef(c.oid),
                                 '''([a-z]+)''::text', 'g') m
    where c.conrelid = 'public.vitrine_translations'::regclass
      and c.conname = 'vitrine_translations_lang_check'),
  1::bigint,
  'une seule langue cible aujourd''hui — l''ajouter au `check` oblige à revenir dans les deux RPC qui mesurent la couverture');

-- LA SIGNATURE A ÉTÉ REMPLACÉE, PAS SURCHARGÉE (leçon L3). Deux exemplaires
-- auraient rendu l'appel à un argument de `src/lib/vitrine-context.ts` ambigu —
-- « function is not unique », à l'exécution seulement.
select is(
  (select pg_catalog.count(*)::bigint from pg_proc p
     join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'vitrine_public_state'),
  1::bigint,
  'une seule `vitrine_public_state` existe : l''ancienne signature est SUPPRIMÉE, pas surchargée');
select is(
  (select pg_catalog.count(*)::bigint from pg_proc p
     join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'vitrine_cartes_json'),
  1::bigint,
  '… et une seule `vitrine_cartes_json`, sans quoi l''appel à deux arguments de vitrine_dashboard_state serait ambigu');

-- CONDITION 4 DE LA REVUE L10, GARDÉE plutôt que corrigée une fois. Le
-- commentaire de `set_vitrine_slug` affirmait que « préparer sa vitrine avant
-- d'avoir l'offre est légitime » : la RPC ne vérifie effectivement pas le droit
-- `vitrine`, mais son UNIQUE appelant le refuse, donc aucune surface n'offrait
-- cette préparation. La phrase corrigée NOMME la garde applicative — une
-- réécriture qui la perdrait fait rougir cette ligne, là où une correction sans
-- garde se serait effacée au chantier suivant.
select ok(
  position('gardeEditeurVitrine' in
    obj_description('public.set_vitrine_slug(uuid,text,text)'::regprocedure,
                    'pg_proc')) > 0,
  'le commentaire de la pose d''adresse dit les DEUX niveaux : la RPC n''exige pas le droit `vitrine`, son unique appelant si');


-- ── 12b. LA PORTE D'ÉCRITURE, ET SES REFUS NOMMÉS ────────────

select is(public.upsert_vitrine_translation(
  'f1000000-0000-4000-8000-00000000000e', 'settings',
  'f1000000-0000-4000-8000-000000000401', 'en', 'accroche',
  'The wine bar on the square.',
  (select s.updated_at from public.vitrine_settings s
    where s.id = 'f1000000-0000-4000-8000-000000000401'),
  'f1000000-0000-4000-8000-000000000f0e') ->> 'created', 'true',
  'la première traduction d''un champ CRÉE sa ligne');

select is(public.upsert_vitrine_translation(
  'f1000000-0000-4000-8000-00000000000e', 'menu',
  'f1000000-0000-4000-8000-000000000501', 'en', 'nom', 'Evening menu',
  (select m.updated_at from public.vitrine_menus m
    where m.id = 'f1000000-0000-4000-8000-000000000501'),
  'f1000000-0000-4000-8000-000000000f0e') ->> 'state', 'ok',
  'le nom d''une carte se traduit');

select is(public.upsert_vitrine_translation(
  'f1000000-0000-4000-8000-00000000000e', 'categorie',
  'f1000000-0000-4000-8000-000000000601', 'en', 'nom', 'Starters',
  (select k.updated_at from public.vitrine_categories k
    where k.id = 'f1000000-0000-4000-8000-000000000601'),
  'f1000000-0000-4000-8000-000000000f0e') ->> 'state', 'ok',
  'le nom d''une rubrique se traduit');

select is(public.upsert_vitrine_translation(
  'f1000000-0000-4000-8000-00000000000e', 'item',
  'f1000000-0000-4000-8000-000000000701', 'en', 'nom', 'Pumpkin velouté',
  (select i.updated_at from public.vitrine_items i
    where i.id = 'f1000000-0000-4000-8000-000000000701'),
  'f1000000-0000-4000-8000-000000000f0e') ->> 'state', 'ok',
  'le nom d''une fiche se traduit');

select is(public.upsert_vitrine_translation(
  'f1000000-0000-4000-8000-00000000000e', 'item',
  'f1000000-0000-4000-8000-000000000701', 'en', 'description', 'Light cream.',
  (select i.updated_at from public.vitrine_items i
    where i.id = 'f1000000-0000-4000-8000-000000000701'),
  'f1000000-0000-4000-8000-000000000f0e') ->> 'state', 'ok',
  '… et sa description aussi, indépendamment de son nom');

-- LA PÉRIMÉE, POSÉE PÉRIMÉE : sa version source est ANTÉRIEURE à celle de la
-- fiche. C'est le cas que rien d'autre dans ce fichier ne produit.
select is(public.upsert_vitrine_translation(
  'f1000000-0000-4000-8000-00000000000e', 'item',
  'f1000000-0000-4000-8000-000000000702', 'en', 'nom', 'Chickpea hummus',
  (select i.updated_at - interval '1 hour' from public.vitrine_items i
    where i.id = 'f1000000-0000-4000-8000-000000000702'),
  'f1000000-0000-4000-8000-000000000f0e') ->> 'state', 'ok',
  'une traduction datée d''une version ANTÉRIEURE s''écrit sans protester — c''est la lecture qui l''ignorera');

-- LE JOURNAL COMPTE LES GESTES, PAS LES NON-GESTES. Six écritures, six lignes ;
-- un pipeline qui repasserait à l'identique n'en ajouterait aucune.
select is(
  (select pg_catalog.count(*)::bigint from public.audit_logs a
    where a.organization_id = 'f1000000-0000-4000-8000-00000000000e'
      and a.action = 'vitrine.translation_set'),
  6::bigint,
  'chaque traduction posée laisse UNE ligne de journal');

select is(public.upsert_vitrine_translation(
  'f1000000-0000-4000-8000-00000000000e', 'menu',
  'f1000000-0000-4000-8000-000000000501', 'en', 'nom', 'Evening menu',
  (select m.updated_at from public.vitrine_menus m
    where m.id = 'f1000000-0000-4000-8000-000000000501'),
  'f1000000-0000-4000-8000-000000000f0e') ->> 'changed', 'false',
  'réécrire le MÊME texte pour la MÊME version ne change rien');

select is(
  (select pg_catalog.count(*)::bigint from public.audit_logs a
    where a.organization_id = 'f1000000-0000-4000-8000-00000000000e'
      and a.action = 'vitrine.translation_set'),
  6::bigint,
  '… et n''écrit pas une septième ligne : un pipeline qui repasse sur cinquante fiches noierait le journal');

-- LE JOURNAL NE CONTIENT PAS LE TEXTE : un journal n'est pas un stockage, et
-- l'y recopier aurait doublé le volume de chaque traduction.
select ok(
  not exists (
    select 1 from public.audit_logs a
     where a.organization_id = 'f1000000-0000-4000-8000-00000000000e'
       and a.action = 'vitrine.translation_set'
       and a.metadata::text like '%wine bar%'),
  'le journal dit QUOI a été traduit et QUAND, jamais le texte lui-même');

-- ── LES REFUS, CHACUN SOUS SON PROPRE MOT ──
-- Un pipeline doit pouvoir distinguer « ma langue n'est pas servie » de « mon
-- texte est vide » : les confondre en un seul 23514 aurait rendu chaque panne
-- indéchiffrable.
select is(public.upsert_vitrine_translation(
  'f1000000-0000-4000-8000-00000000000e', 'carte',
  'f1000000-0000-4000-8000-000000000501', 'en', 'nom', 'X', now(),
  'f1000000-0000-4000-8000-000000000f0e')
    ->> 'state', 'invalid_cible',
  'un type de cible hors des quatre niveaux est refusé sous son propre mot');

select is(public.upsert_vitrine_translation(
  'f1000000-0000-4000-8000-00000000000e', 'menu',
  'f1000000-0000-4000-8000-000000000501', 'fr', 'nom', 'Carte du soir', now(),
  'f1000000-0000-4000-8000-000000000f0e')
    ->> 'state', 'invalid_lang',
  'le FRANÇAIS n''est pas une traduction : il est la référence, et cette table ne le stocke jamais');

select is(public.upsert_vitrine_translation(
  'f1000000-0000-4000-8000-00000000000e', 'menu',
  'f1000000-0000-4000-8000-000000000501', 'en', 'description', 'X', now(),
  'f1000000-0000-4000-8000-000000000f0e')
    ->> 'state', 'invalid_champ',
  'une carte n''a pas de description : le couplage type↔champ est refusé sous son propre mot');

select is(public.upsert_vitrine_translation(
  'f1000000-0000-4000-8000-00000000000e', 'menu',
  'f1000000-0000-4000-8000-000000000501', 'en', 'nom', '   ', now(),
  'f1000000-0000-4000-8000-000000000f0e')
    ->> 'state', 'invalid_texte',
  'un texte vide une fois détouré est refusé : une traduction blanche effacerait un nom de carte');

-- LA CONTRAINTE DE TABLE EST LE FILET, et elle mord aussi — la RPC n'est pas la
-- seule chose qui tienne le couplage.
select throws_ok(
  $$insert into public.vitrine_translations
      (organization_id, cible_type, cible_id, lang, champ, texte, version_source)
    values ('f1000000-0000-4000-8000-00000000000e', 'menu',
            'f1000000-0000-4000-8000-000000000501', 'en', 'description',
            'X', now())$$,
  '23514', null,
  'le couplage type↔champ est AUSSI porté par la contrainte de table, pas seulement par la RPC');

-- ── L'INTER-LOCATAIRE : la garde qu'AUCUNE FK ne peut rendre ──
-- `cible_id` ne référence rien (quatre tables cibles). Sans cette vérification
-- par type, une traduction du locataire E s'écrirait sur la fiche de A.
select throws_ok(
  $$select public.upsert_vitrine_translation(
      'f1000000-0000-4000-8000-00000000000e', 'item',
      'f1000000-0000-4000-8000-000000000301', 'en', 'nom', 'Stolen', now(),
      'f1000000-0000-4000-8000-000000000f0e')$$,
  '42501', 'not authorized',
  'traduire la fiche d''un AUTRE locataire est refusé — la FK ne peut pas le refuser, la RPC le fait');

select throws_ok(
  $$select public.upsert_vitrine_translation(
      'f1000000-0000-4000-8000-00000000000e', 'item',
      'f1000000-0000-4000-8000-0000000009ff', 'en', 'nom', 'Fantôme', now(),
      'f1000000-0000-4000-8000-000000000f0e')$$,
  '42501', 'not authorized',
  '… et une cible INCONNUE rend le MÊME refus : distinguer ferait de cette RPC un oracle sur les identifiants d''autrui');

select is(
  (select pg_catalog.count(*)::bigint from public.vitrine_translations t
    where t.cible_id = 'f1000000-0000-4000-8000-000000000301'),
  0::bigint,
  '… et rien n''a été écrit chez le voisin : le refus n''était pas cosmétique');


-- ── 12c. LA SUPERPOSITION, CHAMP À CHAMP ─────────────────────

select is(public.vitrine_public_state('tap-traduction') ->> 'lang', 'fr',
  'sans langue demandée, la vitrine répond en FRANÇAIS — la référence est toujours servie');

select is(
  public.vitrine_public_state('tap-traduction') #>> '{identite,accroche}',
  'Le bar à vins de la place.',
  'en français, l''accroche est celle de la colonne d''origine');

select is(public.vitrine_public_state('tap-traduction', 'en') ->> 'lang', 'en',
  'la langue demandée est celle qui est servie, et la charge utile le DIT — l''écran n''a pas à redeviner la règle de repli');

select is(
  public.vitrine_public_state('tap-traduction', 'en') #>> '{identite,accroche}',
  'The wine bar on the square.',
  'l''accroche des réglages se superpose');

select is(
  public.vitrine_public_state('tap-traduction', 'en') #>> '{cartes,0,nom}',
  'Evening menu',
  'le nom de la carte se superpose');

select is(
  public.vitrine_public_state('tap-traduction', 'en')
    #>> '{cartes,0,categories,0,nom}',
  'Starters',
  'le nom de la rubrique se superpose');

select is(
  public.vitrine_public_state('tap-traduction', 'en')
    #>> '{cartes,0,categories,0,fiches,0,nom}',
  'Pumpkin velouté',
  'le nom de la fiche se superpose');

select is(
  public.vitrine_public_state('tap-traduction', 'en')
    #>> '{cartes,0,categories,0,fiches,0,description}',
  'Light cream.',
  '… et sa description AUSSI, indépendamment : la superposition est champ à champ, pas ligne à ligne');

-- ── LA PÉRIMÉE EST IGNORÉE, ET LA FICHE NE DISPARAÎT PAS ──
-- La condition de fraîcheur vit dans la JOINTURE. Mise dans un `where`, elle
-- aurait retiré le plat de la carte au lieu de le rendre en français.
select is(
  public.vitrine_public_state('tap-traduction', 'en')
    #>> '{cartes,0,categories,0,fiches,1,nom}',
  'Houmous du jour',
  'une traduction PÉRIMÉE est ignorée : le français ressort, et il ressort À SA PLACE');

select is(
  pg_catalog.jsonb_array_length(
    public.vitrine_public_state('tap-traduction', 'en')
      #> '{cartes,0,categories,0,fiches}'),
  2,
  '… et la fiche est toujours là : ignorer une traduction ne retire pas un plat de la carte');

-- ── CE QUI NE SE TRADUIT PAS PASSE INCHANGÉ ──
select is(
  public.vitrine_public_state('tap-traduction', 'en')
    #>> '{cartes,0,categories,0,fiches,0,prix_affiche}',
  'à partir de 8 €',
  'le PRIX passe inchangé en anglais : le traduire en ferait une promesse commerciale rédigée par une machine');

select is(
  public.vitrine_public_state('tap-traduction', 'en')
    #>> '{cartes,0,categories,0,fiches,0,allergenes,0}',
  'lait',
  'les ALLERGÈNES passent inchangés : vocabulaire FERMÉ de la plateforme, traduit à la main côté application, jamais par cette table');

select is(
  public.vitrine_public_state('tap-traduction', 'en') #>> '{identite,nom}',
  'Vitrine E',
  'l''enseigne ne se traduit pas : c''est un nom propre');

-- ── UNE LANGUE INCONNUE RETOMBE SUR LE FRANÇAIS, SANS LEVER ──
select is(public.vitrine_public_state('tap-traduction', 'de') ->> 'lang', 'fr',
  'une langue non servie retombe sur le français — `?lang=de` n''est pas une page d''erreur');

select is(
  public.vitrine_public_state('tap-traduction', 'de') #>> '{cartes,0,nom}',
  'Carte du soir',
  '… et le contenu est bien le français, pas un anglais servi par mégarde');

select is(public.vitrine_public_state('tap-traduction', 'EN') ->> 'lang', 'en',
  'la langue est normalisée : « EN » et « en » sont la même langue');


-- ── 12d. LA COUVERTURE, RENDUE DANS LES DEUX LANGUES ─────────
--
-- SIX champs traduisibles : accroche + nom de carte + nom de rubrique + nom et
-- description de la fiche 701 + nom de la fiche 702. `histoire` et
-- `horaires_texte` sont nulles, donc pas traduisibles. CINQ sont frais — la
-- traduction de 702 est périmée.

select is(
  public.vitrine_public_state('tap-traduction')
    #>> '{lang_coverage,total_champs_traduisibles}',
  '6',
  'six champs traduisibles : les deux colonnes NULLES des réglages ne comptent pas');

select is(
  public.vitrine_public_state('tap-traduction')
    #>> '{lang_coverage,traduits_frais}',
  '5',
  'cinq sont frais : la périmée ne compte pas, exactement comme elle n''est pas servie');

select is(
  public.vitrine_public_state('tap-traduction', 'en')
    #>> '{lang_coverage,traduits_frais}',
  '5',
  'la couverture est rendue DANS LES DEUX LANGUES : c''est sur la page française que l''écran décide d''offrir l''anglais');

select is(
  public.vitrine_public_state('tap-traduction') #>> '{lang_coverage,lang}',
  'en',
  '… et elle NOMME la langue qu''elle décrit, plutôt que de la laisser deviner');

-- LE SEUIL N'EST PAS EN BASE. `lang_coverage` porte EXACTEMENT trois clés — la
-- langue décrite et les deux compteurs — et aucun booléen de verdict : le
-- « 95 % » est une décision de produit, elle se règle sans migration. Une
-- quatrième clé « afficher_selecteur » ferait rougir cette ligne, et c'est
-- exactement le glissement qu'elle existe pour empêcher.
select results_eq(
  $$select key from jsonb_each(
      public.vitrine_public_state('tap-traduction') -> 'lang_coverage')
     order by key$$,
  array['lang', 'total_champs_traduisibles', 'traduits_frais'],
  'la couverture rend un COMPTE et rien d''autre : aucun verdict n''est calculé en base');

-- L'ÉTAT COMMERÇANT compte TOUT le catalogue, cartes désactivées comprises — E
-- n'en a pas, donc les six sont les mêmes, et les trois états se répartissent en
-- cinq frais et un périmé.
select is(
  public.vitrine_translation_state('f1000000-0000-4000-8000-00000000000e')
    #>> '{resume,total_champs_traduisibles}',
  '6',
  'l''état commerçant mesure les mêmes six champs');
select is(
  public.vitrine_translation_state('f1000000-0000-4000-8000-00000000000e')
    #>> '{resume,perimes}',
  '1',
  '… et il DISTINGUE le périmé de l''absent : « vos modifications ont périmé une fiche » n''est pas « il reste des plats à traduire »');
select is(
  public.vitrine_translation_state('f1000000-0000-4000-8000-00000000000e')
    #>> '{resume,manquants}',
  '0',
  'aucun champ n''est resté sans traduction sur cette vitrine');

select is(
  public.vitrine_translation_state('f1000000-0000-4000-8000-00000000000d')
    #>> '{resume,total_champs_traduisibles}',
  '0',
  'une organisation qui n''a jamais ouvert sa vitrine n''a rien à traduire, et ce n''est pas une erreur');

-- ── LA VITRINE SEMÉE EST TRADUITE À 100 %, ET ON LE GARDE ICI ──
--
-- HONNÊTETÉ SUR LA PORTÉE : ce fichier doit passer sur base VIDE comme sur base
-- SEMÉE, donc cette assertion est VACUE sur la première — l'ensemble y est vide
-- et la chaîne attendue l'est aussi. Elle ne garde donc rien dans ce run-là, et
-- c'est écrit plutôt que caché.
--
-- Sur base SEMÉE, en revanche, elle mord, et elle garde une règle de PRODUIT :
-- l'écran n'offre l'anglais qu'à partir de 95 % de couverture, et une seule
-- traduction manquante ou périmée sur les dix-neuf champs de `e2e-comptoir`
-- ferait 94,7 % — le sélecteur disparaîtrait de l'E2E par arithmétique, pas par
-- décision. L'échec NOMME les champs fautifs, de quoi corriger le seed sans
-- rien rouvrir.
--
-- LES DEUX VITRINES SEMÉES SONT GARDÉES ICI, et le libellé porte le slug pour
-- que l'échec dise LAQUELLE. Le seed en pose deux depuis le correctif E2E de
-- L11, et elles ne jouent pas le même rôle : `e2e-comptoir` est celle que le
-- spec dashboard MUTE (fiches créées, réglages enregistrés), `e2e-traduit` est
-- RÉSERVÉE aux assertions publiques et ne doit être mutée par personne. Les deux
-- doivent être intégralement traduites, pour des raisons différentes — la
-- seconde parce que l'E2E y lit la couverture, la première parce qu'elle reste
-- la carte de démonstration.
select is(
  (select coalesce(
     string_agg(s.slug || '.' || c.cible_type || '.' || c.champ, ', '
                order by s.slug, c.cible_type, c.champ), '')
     from public.vitrine_settings s
     join lateral public.vitrine_champs_traduisibles(s.organization_id, true) c
       on true
     left join public.vitrine_translations t
       on t.organization_id = s.organization_id
      and t.cible_type = c.cible_type
      and t.cible_id = c.cible_id
      and t.champ = c.champ
      and t.lang = 'en'
      and t.version_source >= c.version_courante
    where s.slug in ('e2e-comptoir', 'e2e-traduit')
      and t.id is null),
  '',
  'sur base semée, aucun champ des DEUX vitrines E2E ne reste sans anglais FRAIS — la règle « sélecteur si ≥ 95 % » doit y être observable');


-- ── … ET LE COMPTE DE `e2e-traduit`, CHIFFRÉ ────────────────
--
-- L'assertion du dessus dit « rien ne manque » ; celles-ci disent « il y a bien
-- CINQ champs, et les cinq sont frais ». Les deux sont nécessaires, et la
-- première ne remplace pas les secondes : une vitrine dont on aurait vidé
-- l'accroche la satisferait sans effort — plus rien à traduire — en ayant perdu
-- exactement ce que l'E2E vient y lire.
--
-- CINQ, PARCE QUE LE SEED LA VEUT SOBRE : accroche des réglages (histoire et
-- horaires restent NULS, donc non traduisibles), nom de carte, nom de rubrique,
-- nom et description de l'unique fiche. 5 frais sur 5 = 100 %, franchement
-- au-dessus du seuil de 95 % — c'est la marge qui manquait à `e2e-comptoir`,
-- où une seule fiche créée par un spec voisin suffisait à faire tomber le
-- sélecteur.
--
-- LA MESURE PASSE PAR LA RPC PUBLIQUE et non par un `count` direct : c'est
-- exactement le chemin que suit la page, `actives_seulement` compris.
--
-- VACUES SUR BASE VIDE comme leur voisine, par la même mécanique : les deux
-- membres valent alors `null` — `vitrine_public_state` rend `unavailable`, sans
-- clé `lang_coverage`, et le `select` de droite ne rend aucune ligne — et `is()`
-- tient `null = null` pour vrai.
select is(
  public.vitrine_public_state('e2e-traduit')
    #>> '{lang_coverage,total_champs_traduisibles}',
  (select '5' from public.vitrine_settings where slug = 'e2e-traduit'),
  'la vitrine réservée aux assertions publiques compte CINQ champs traduisibles, et pas un de plus');

select is(
  public.vitrine_public_state('e2e-traduit')
    #>> '{lang_coverage,traduits_frais}',
  (select '5' from public.vitrine_settings where slug = 'e2e-traduit'),
  '… et les cinq sont traduits ET FRAIS : 100 %, une couverture qui ne dépend d''aucun spec voisin');


-- ── 12e. `touch_updated_at` PÉRIME — la boucle se referme ────
--
-- LA PREUVE TIENT DANS LA COMPARAISON AVANT/APRÈS sur la MÊME traduction : elle
-- est fraîche à la ligne du dessus, elle est périmée à la ligne du dessous, et
-- la seule chose qui a bougé entre les deux est un `update` de sa cible. Sans le
-- trigger, `updated_at` serait resté à sa date de création et l'anglais
-- publierait indéfiniment l'ancien plat.

select ok(
  (select i.updated_at = i.created_at from public.vitrine_items i
    where i.id = 'f1000000-0000-4000-8000-000000000701'),
  'avant toute modification, la fiche n''a jamais bougé : `updated_at` vaut sa date de création');

update public.vitrine_items
   set description = 'Crème légère et graines torréfiées.'
 where id = 'f1000000-0000-4000-8000-000000000701';

select ok(
  (select i.updated_at > i.created_at from public.vitrine_items i
    where i.id = 'f1000000-0000-4000-8000-000000000701'),
  'le trigger a AVANCÉ `updated_at` — et il l''a avancé DANS la transaction, ce que `now()` n''aurait pas su faire');

select is(
  public.vitrine_public_state('tap-traduction', 'en')
    #>> '{cartes,0,categories,0,fiches,0,description}',
  'Crème légère et graines torréfiées.',
  'la description a changé : sa traduction est périmée et le FRANÇAIS ressort');

-- LA PORTÉE EST LA LIGNE, PAS LE CHAMP, et c'est assumé : le nom n'a pas bougé,
-- sa traduction est pourtant périmée elle aussi. Le coût de cette imprécision
-- est une retraduction de trop ; le coût de l'inverse serait un anglais faux.
select is(
  public.vitrine_public_state('tap-traduction', 'en')
    #>> '{cartes,0,categories,0,fiches,0,nom}',
  'Velouté de potiron',
  'le NOM repasse en français lui aussi : la clé de version porte sur la LIGNE, pas sur le champ');

select is(
  public.vitrine_public_state('tap-traduction')
    #>> '{lang_coverage,traduits_frais}',
  '3',
  'la couverture tombe de cinq à trois : un commerçant qui corrige une fiche éteint le sélecteur tant que le pipeline n''est pas repassé');

-- ET ELLE REMONTE : retraduire à la version courante suffit, rien n'est à
-- effacer. La ligne périmée n'était pas perdue, elle attendait.
select is(public.upsert_vitrine_translation(
  'f1000000-0000-4000-8000-00000000000e', 'item',
  'f1000000-0000-4000-8000-000000000701', 'en', 'nom', 'Pumpkin velouté',
  (select i.updated_at from public.vitrine_items i
    where i.id = 'f1000000-0000-4000-8000-000000000701'),
  'f1000000-0000-4000-8000-000000000f0e') ->> 'created', 'false',
  'rafraîchir une traduction périmée MET À JOUR sa ligne, il n''en crée pas une seconde');

select is(
  public.vitrine_public_state('tap-traduction', 'en')
    #>> '{cartes,0,categories,0,fiches,0,nom}',
  'Pumpkin velouté',
  '… et l''anglais revient sans que rien n''ait été effacé');


-- ── 12f. LES ACL — la table du calque est la plus fermée des cinq ──
--
-- Ces assertions doublent les règles catalogue de security_acl.test.sql, et
-- c'est voulu : celles-là gardent le schéma entier, celles-ci gardent CE lot.

select ok(not has_table_privilege('anon', 'public.vitrine_translations', 'SELECT'),
  'anon ne lit pas les traductions directement');
select ok(not has_table_privilege('authenticated', 'public.vitrine_translations', 'SELECT'),
  'le commerçant NON PLUS : contrairement aux quatre tables de L10, celle-ci ne se lit que par RPC');
select ok(not has_table_privilege('authenticated', 'public.vitrine_translations', 'INSERT'),
  'le commerçant n''écrit pas une traduction en direct : la seule porte vérifie l''appartenance de la cible');
select ok(has_table_privilege('service_role', 'public.vitrine_translations', 'SELECT'),
  'le serveur, lui, lit la table — c''est lui qui sert les RPC');

select ok(has_function_privilege('service_role', 'public.upsert_vitrine_translation(uuid,text,uuid,text,text,text,timestamp with time zone,uuid)', 'EXECUTE'),
  'seul le serveur pose une traduction');
select ok(not has_function_privilege('authenticated', 'public.upsert_vitrine_translation(uuid,text,uuid,text,text,text,timestamp with time zone,uuid)', 'EXECUTE'),
  'le marchand ne contourne pas l''action serveur pour écrire de l''anglais sur sa carte');
select ok(not has_function_privilege('anon', 'public.upsert_vitrine_translation(uuid,text,uuid,text,text,text,timestamp with time zone,uuid)', 'EXECUTE'),
  'anon n''écrit aucune traduction');
select ok(has_function_privilege('service_role', 'public.vitrine_translation_state(uuid)', 'EXECUTE'),
  'seul le serveur rend l''état de traduction');
select ok(not has_function_privilege('anon', 'public.vitrine_translation_state(uuid)', 'EXECUTE'),
  'anon ne sonde pas l''avancement de traduction des commerces');
select ok(not has_function_privilege('service_role', 'public.vitrine_champs_traduisibles(uuid,boolean)', 'EXECUTE'),
  'la définition des champs traduisibles n''est appelable par personne : elle ne garde ni droit ni publication');
select ok(not has_function_privilege('anon', 'public.vitrine_public_state(text,text)', 'EXECUTE'),
  'anon n''appelle toujours pas la RPC publique de vitrine, langue ou pas');

-- LE COMMERÇANT NE LIT PAS LA TABLE, et ce n'est pas la RLS qui le lui refuse :
-- c'est l'absence de privilège, qui mord AVANT toute policy.
set local role authenticated;
set local "request.jwt.claim.sub" = 'f1000000-0000-4000-8000-000000000f01';
select throws_ok(
  'select 1 from public.vitrine_translations',
  '42501', null,
  'le commerçant qui interroge la table en direct est refusé au privilège, avant même la RLS');
reset role;

select set_config('request.jwt.claims', '{"role":"service_role"}', true);



-- ══ 13. L'IMPORT EN LOT (VIT-2, lot L12) ════════════════════
--
-- Ce que cette section prouve, et pourquoi chaque assertion est là :
--
--   * L'ATOMICITÉ, PAR LE COMPTAGE ET NON PAR LA CONFIANCE. « Tout ou rien »
--     est gratuit dans une fonction PL/pgSQL — la transaction de l'appelant est
--     abandonnée par toute exception non rattrapée — et c'est exactement
--     pourquoi il faut le prouver : une garantie qui ne coûte rien est celle
--     qu'un futur `exception when others then return` fera disparaître sans
--     bruit. On ne vérifie donc pas que l'import ÉCHOUE, on compte les lignes
--     APRÈS l'échec et on exige que RIEN n'ait bougé.
--   * LES DEUX BORNES DE CARDINALITÉ SONT INCLUSIVES. 13 rubriques et 121 fiches
--     sont refusées ; 12 rubriques et 120 fiches passent. Sans la seconde
--     moitié, une borne écrite `>=` au lieu de `>` serait verte ici tout en
--     refusant le lot le plus large que le produit promet d'accepter.
--   * LES MESSAGES NE RELAIENT AUCUN TEXTE DU PAYLOAD. Chaque `throws_ok` de
--     refus porte le message ATTENDU EN ENTIER : c'est la seule façon de prouver
--     l'absence, puisqu'un message conforme ne peut pas contenir en plus le nom
--     que le lot portait.
--   * LE NOM DE CONTRAINTE, LUI, REMONTE. C'est un identifiant du schéma, borné
--     et écrit par nous, et il dit LAQUELLE des règles a mordu — un écran
--     d'import ne peut pas pointer la bonne colonne du fichier avec « ligne
--     invalide ».
--   * LA RÈGLE CHECK ⇒ EXECUTE, POUR UN CHEMIN QUE LA RÈGLE CATALOGUE NE VOIT
--     PAS. `security_acl.test.sql` n'inspecte qu'`anon` et `authenticated`, les
--     écrivains DIRECTS ; ici l'écriture passe par une fonction `security
--     definer`, donc sous son PROPRIÉTAIRE. La classe a coûté deux migrations
--     (20261008120000, puis les trois validateurs de 20261011120000) : elle est
--     réaffirmée ici pour le rôle qui écrit vraiment.
--   * L'IMPORT NE TRADUIT RIEN, et le compte le montre : huit champs
--     traduisibles, zéro frais. C'est l'invariant de L11 et non un oubli — une
--     machine ne publie pas d'anglais sur une carte que personne n'a relue.
--   * L'ACTEUR EST TRANCHÉ EN SQL, ET IL SIGNE LE JOURNAL (VIT-3, point I2 de la
--     revue L12). Le caissier — MEMBRE, et pourtant refusé — sépare le rôle de
--     l'appartenance ; le propriétaire d'une AUTRE organisation sépare
--     l'appartenance du rôle. Une garde bâclée passerait l'un ou l'autre.
--
-- ── POURQUOI UNE SIXIÈME ORGANISATION ──
--
-- Même raison qu'à la section 12 : les comptes exacts de l'atomicité ne se
-- lisent que sur un catalogue dont on connaît chaque ligne. F est posée ici, et
-- rien avant elle ne l'a touchée.
--
-- F N'A PAS D'OCTROI `vitrine`, ET C'EST UNE ASSERTION DÉGUISÉE : l'import
-- aboutit quand même. Comme `set_vitrine_slug`, cette RPC ne contrôle pas le
-- droit — la garde est applicative, seul endroit d'où elle peut se rouvrir sans
-- migration — et rien de ce qui est importé n'est visible du public tant que
-- `published` et le droit ne sont pas réunis.

select set_config('request.jwt.claims', '{"role":"service_role"}', true);

insert into public.organizations
  (id, name, slug, subscription_status, plan, timezone, data_retention_months)
values ('f1000000-0000-4000-8000-00000000000f', 'Vitrine F', 'tap-vitrine-f',
        'active', 'starter', 'Europe/Paris', 6);

-- DEUX ACTEURS POUR F, ET IL EN FAUT DEUX (VIT-3). L'import exige désormais un
-- acteur vérifié `owner|editor` EN SQL : l'ÉDITEUR joue tous les imports de
-- cette section, le CAISSIER n'existe que pour prouver que le RÔLE est tranché
-- et pas seulement l'appartenance — sans lui, « l'acteur doit être membre »
-- serait vert alors que n'importe quel membre passerait.
--
-- L'ACTEUR D'UNE AUTRE ORGANISATION est déjà disponible : `…f01`, propriétaire
-- de A. C'est le refus qui compte le plus des trois, et il ne demande aucune
-- fixture neuve.
insert into auth.users
  (id, aud, role, email, encrypted_password, created_at, updated_at)
values
  ('f1000000-0000-4000-8000-000000000f05', 'authenticated', 'authenticated',
   'editeur-f@test.local', '', now(), now()),
  ('f1000000-0000-4000-8000-000000000f06', 'authenticated', 'authenticated',
   'caissier-f@test.local', '', now(), now());

insert into public.organization_members (organization_id, user_id, role) values
  ('f1000000-0000-4000-8000-00000000000f',
   'f1000000-0000-4000-8000-000000000f05', 'editor'),
  ('f1000000-0000-4000-8000-00000000000f',
   'f1000000-0000-4000-8000-000000000f06', 'cashier');

-- UNE CARTE PRÉEXISTANTE, à l'ordre 4. Elle sert à prouver que la carte importée
-- se pose APRÈS et non en tête : un import s'ajoute à un catalogue, il ne le
-- réordonne pas. Sans elle, `max(ordre) + 1` et « toujours 0 » rendraient le
-- même résultat et l'assertion ne prouverait rien.
insert into public.vitrine_menus (id, organization_id, nom, ordre, active) values
  ('f1000000-0000-4000-8000-000000000801',
   'f1000000-0000-4000-8000-00000000000f', 'Carte du matin', 4, true);


-- ── 13a. L'IMPORT NOMINAL — structure, rangs, normalisation ──
--
-- Le lot porte tout ce qui doit être exercé en une fois : deux rubriques, trois
-- fiches, les deux vocabulaires, les deux champs facultatifs présents ET
-- absents, et un prix ENTOURÉ D'ESPACES — le `check` de `prix_affiche` exige une
-- valeur déjà détourée, donc sans le `btrim` de la RPC cet import entier
-- échouerait. C'est la ligne qui prouve la normalisation, et elle la prouve par
-- le fait que tout le reste passe.

select is(
  public.import_vitrine_carte(
    'f1000000-0000-4000-8000-00000000000f',
    '{"nom": "  Carte importée  ",
      "rubriques": [
        {"nom": "Entrées",
         "fiches": [
           {"nom": "Velouté de potiron",
            "description": "Crème légère.",
            "prix_affiche": "  à partir de 8 €  ",
            "badges": ["vegetarien"],
            "allergenes": ["lait"]},
           {"nom": "Houmous du jour", "description": "   "}
         ]},
        {"nom": "Desserts",
         "fiches": [{"nom": "Tarte du jour", "prix_affiche": "6 €"}]}
      ]}'::jsonb,
    'f1000000-0000-4000-8000-000000000f05') ->> 'rubriques_creees',
  '2',
  'l''import crée les deux rubriques du lot en un seul geste');

select is(
  (select pg_catalog.count(*)::bigint from public.vitrine_items i
     join public.vitrine_categories k
       on k.id = i.categorie_id and k.organization_id = i.organization_id
     join public.vitrine_menus m
       on m.id = k.menu_id and m.organization_id = k.organization_id
    where m.organization_id = 'f1000000-0000-4000-8000-00000000000f'
      and m.nom = 'Carte importée'),
  3::bigint,
  '… et les trois fiches, rattachées à la bonne carte par les deux FK composites');

-- LE NOM EST DÉTOURÉ, pas refusé : un fichier exporté d'un tableur porte des
-- espaces de bord une ligne sur trois, et refuser là-dessus aurait été de la
-- pédanterie. La LONGUEUR, elle, reste au `check` de la colonne.
select is(
  (select m.ordre from public.vitrine_menus m
    where m.organization_id = 'f1000000-0000-4000-8000-00000000000f'
      and m.nom = 'Carte importée'),
  5,
  'la carte importée se pose APRÈS les cartes existantes (4 → 5), elle ne prend pas la tête du catalogue');

-- LES RANGS SONT CEUX DU FICHIER, 0..n. L'ordre du payload est une information
-- que le commerçant a produite en écrivant sa carte ; la perdre l'obligerait à
-- tout réordonner à la main juste après l'avoir importée.
select results_eq(
  $$select k.nom, k.ordre from public.vitrine_categories k
      join public.vitrine_menus m
        on m.id = k.menu_id and m.organization_id = k.organization_id
     where m.organization_id = 'f1000000-0000-4000-8000-00000000000f'
       and m.nom = 'Carte importée'
     order by k.ordre$$,
  $$values ('Entrées', 0), ('Desserts', 1)$$,
  'les rubriques reçoivent les rangs 0..n DANS L''ORDRE DU FICHIER, pas dans celui de l''alphabet');

select results_eq(
  $$select i.nom, i.ordre from public.vitrine_items i
      join public.vitrine_categories k
        on k.id = i.categorie_id and k.organization_id = i.organization_id
     where i.organization_id = 'f1000000-0000-4000-8000-00000000000f'
       and k.nom = 'Entrées'
     order by i.ordre$$,
  $$values ('Velouté de potiron', 0), ('Houmous du jour', 1)$$,
  'les fiches sont rangées 0..n DANS LEUR rubrique — le compteur repart à zéro à chaque rubrique');

select is(
  (select i.ordre from public.vitrine_items i
     join public.vitrine_categories k
       on k.id = i.categorie_id and k.organization_id = i.organization_id
    where i.organization_id = 'f1000000-0000-4000-8000-00000000000f'
      and k.nom = 'Desserts'),
  0,
  '… et il repart bien à zéro : la fiche unique de la seconde rubrique est au rang 0, pas au rang 2');

select is(
  (select i.prix_affiche from public.vitrine_items i
    where i.organization_id = 'f1000000-0000-4000-8000-00000000000f'
      and i.nom = 'Velouté de potiron'),
  'à partir de 8 €',
  'le prix est DÉTOURÉ avant l''écriture — son `check` exige une valeur déjà détourée, sans quoi tout le lot tombait sur un espace de tableur');

-- « ABSENT », « null » ET « TROIS ESPACES » SONT LE MÊME ÉTAT. Trois façons de
-- l'écrire en base auraient donné trois chemins à tenir dans chaque lecture.
select is(
  (select i.description from public.vitrine_items i
    where i.organization_id = 'f1000000-0000-4000-8000-00000000000f'
      and i.nom = 'Houmous du jour'),
  null,
  'une description qui ne contient que des espaces devient NULL, comme une description absente');

select is(
  (select i.prix_affiche from public.vitrine_items i
    where i.organization_id = 'f1000000-0000-4000-8000-00000000000f'
      and i.nom = 'Houmous du jour'),
  null,
  '… et un champ facultatif absent du lot reste NULL, sans valeur inventée');

select results_eq(
  $$select i.badges, i.allergenes from public.vitrine_items i
     where i.organization_id = 'f1000000-0000-4000-8000-00000000000f'
       and i.nom = 'Velouté de potiron'$$,
  $$values (array['vegetarien']::text[], array['lait']::text[])$$,
  'les deux vocabulaires traversent l''import intacts');

select results_eq(
  $$select i.badges, i.allergenes from public.vitrine_items i
     where i.organization_id = 'f1000000-0000-4000-8000-00000000000f'
       and i.nom = 'Tarte du jour'$$,
  $$values ('{}'::text[], '{}'::text[])$$,
  '… et leur ABSENCE donne le tableau vide des colonnes, jamais NULL : elles sont `not null default ''{}''`');

-- LE JOURNAL COMPTE LES GESTES, PAS LES LIGNES. Une seule entrée pour cent vingt
-- fiches possibles : cent vingt lignes d'audit pour un clic auraient rendu le
-- journal illisible exactement quand on en a besoin.
select is(
  (select pg_catalog.count(*)::bigint from public.audit_logs a
    where a.organization_id = 'f1000000-0000-4000-8000-00000000000f'
      and a.action = 'vitrine.carte_imported'),
  1::bigint,
  'l''import journalise UNE ligne pour tout le lot, pas une par fiche');

select is(
  (select a.metadata ->> 'fiches_creees' from public.audit_logs a
    where a.organization_id = 'f1000000-0000-4000-8000-00000000000f'
      and a.action = 'vitrine.carte_imported'),
  '3',
  '… et elle porte le COMPTE, pas le contenu : un journal n''est pas un stockage');


-- ── 13b. L'IMPORT NE TRADUIT RIEN — l'invariant de L11 ──────
--
-- HUIT CHAMPS TRADUISIBLES, comptés à la main : 2 noms de cartes (celle du matin
-- et l'importée) + 2 noms de rubriques + 3 noms de fiches + 1 description (celle
-- du velouté ; les deux autres sont nulles). ZÉRO est traduit.
--
-- LA COUVERTURE BAISSE DONC MÉCANIQUEMENT À CHAQUE IMPORT, et c'est correct :
-- L11 a construit la péremption pour qu'une machine ne publie jamais d'anglais
-- sur un texte que personne n'a relu. Une carte déposée il y a une seconde est
-- exactement ce cas.

select is(
  public.vitrine_translation_state('f1000000-0000-4000-8000-00000000000f')
    #>> '{resume,total_champs_traduisibles}',
  '8',
  'une carte importée entre bien dans le décompte des champs traduisibles');

select is(
  public.vitrine_translation_state('f1000000-0000-4000-8000-00000000000f')
    #>> '{resume,manquants}',
  '8',
  '… et AUCUN n''est traduit : l''import n''écrit pas une ligne dans le calque, c''est l''invariant de L11');

select is(
  (select pg_catalog.count(*)::bigint from public.vitrine_translations t
    where t.organization_id = 'f1000000-0000-4000-8000-00000000000f'),
  0::bigint,
  'aucune traduction n''a été fabriquée par le chemin d''import — la seule porte reste upsert_vitrine_translation');


-- ── 13c. L'ATOMICITÉ — prouvée par ce qui N'EST PAS là ──────
--
-- Le lot est valide de bout en bout SAUF sa dernière fiche, dont le nom fait 121
-- caractères — un de trop pour le `check` de `vitrine_items.nom`. Les trois
-- lignes qui la précèdent (une carte, une rubrique, une fiche) sont
-- irréprochables et seraient écrites une à une par le chemin unitaire.
--
-- L'ÉTAT DE RÉFÉRENCE EST CELUI DE 13a : 2 cartes, 2 rubriques, 3 fiches. Il ne
-- doit pas avoir bougé d'une ligne.

select throws_ok(
  format($$select public.import_vitrine_carte(
      %L, %L::jsonb, 'f1000000-0000-4000-8000-000000000f05')$$,
    'f1000000-0000-4000-8000-00000000000f',
    jsonb_build_object(
      'nom', 'Carte atomique',
      'rubriques', jsonb_build_array(jsonb_build_object(
        'nom', 'Rubrique valide',
        'fiches', jsonb_build_array(
          jsonb_build_object('nom', 'Fiche parfaitement valide'),
          jsonb_build_object('nom', repeat('x', 121))))))),
  '23514',
  'a line of the import was rejected by constraint vitrine_items_nom_check',
  'une fiche au nom trop long fait échouer l''import, et le refus NOMME la contrainte qui a mordu');

select is(
  (select pg_catalog.count(*)::bigint from public.vitrine_menus m
    where m.organization_id = 'f1000000-0000-4000-8000-00000000000f'
      and m.nom = 'Carte atomique'),
  0::bigint,
  'ATOMICITÉ : la carte du lot refusé n''existe pas — pas même vide, pas même orpheline');

select is(
  (select pg_catalog.count(*)::bigint from public.vitrine_categories k
    where k.organization_id = 'f1000000-0000-4000-8000-00000000000f'),
  2::bigint,
  '… la rubrique VALIDE qui précédait la fiche fautive n''a pas survécu non plus : on reste aux deux de 13a');

select is(
  (select pg_catalog.count(*)::bigint from public.vitrine_items i
    where i.organization_id = 'f1000000-0000-4000-8000-00000000000f'),
  3::bigint,
  '… et la fiche VALIDE qui la précédait pas davantage : trois fiches, celles de 13a, et rien d''autre');

select is(
  (select pg_catalog.count(*)::bigint from public.vitrine_menus m
    where m.organization_id = 'f1000000-0000-4000-8000-00000000000f'),
  2::bigint,
  '… le catalogue entier est intact : tout ou rien, et ici ce fut rien');

-- LA CARTE A SON PROPRE BLOC `exception`, ET SON PROPRE MESSAGE. Un nom de
-- quatre-vingt-un caractères tombe sur `vitrine_menus_nom_check` AVANT que la
-- moindre rubrique ne soit tentée : le refus vient donc du bloc qui garde
-- l'insertion de la carte, pas de celui qui garde les lignes. Les deux messages
-- diffèrent, et sans cette assertion les intervertir serait vert.
select throws_ok(
  format($$select public.import_vitrine_carte(
      %L, %L::jsonb, 'f1000000-0000-4000-8000-000000000f05')$$,
    'f1000000-0000-4000-8000-00000000000f',
    jsonb_build_object('nom', repeat('c', 81), 'rubriques', '[]'::jsonb)),
  '23514',
  'carte rejected by constraint vitrine_menus_nom_check',
  'un nom de carte trop long est refuse par le bloc de la CARTE, sous son propre message');


-- ── 13d. LES BORNES DE CARDINALITÉ, DANS LES DEUX SENS ──────
--
-- Elles ne bornent AUCUNE ligne : elles bornent un GESTE. C'est pourquoi elles
-- vivent dans le corps de la RPC et non dans un `check`, et pourquoi aucun
-- `check` n'aurait pu les exprimer.

select throws_ok(
  format($$select public.import_vitrine_carte(
      %L, %L::jsonb, 'f1000000-0000-4000-8000-000000000f05')$$,
    'f1000000-0000-4000-8000-00000000000f',
    jsonb_build_object(
      'nom', 'Carte à treize rubriques',
      'rubriques', (select jsonb_agg(jsonb_build_object(
                             'nom', 'Rubrique ' || g, 'fiches', '[]'::jsonb))
                      from generate_series(1, 13) g))),
  '22023',
  'too many rubriques in one import (max 12)',
  'treize rubriques sont refusées, et le message NOMME la borne — un refus qui ne dit pas combien ne dit rien');

select throws_ok(
  format($$select public.import_vitrine_carte(
      %L, %L::jsonb, 'f1000000-0000-4000-8000-000000000f05')$$,
    'f1000000-0000-4000-8000-00000000000f',
    jsonb_build_object(
      'nom', 'Carte à cent vingt et une fiches',
      'rubriques', jsonb_build_array(jsonb_build_object(
        'nom', 'Rubrique unique',
        'fiches', (select jsonb_agg(jsonb_build_object('nom', 'Fiche ' || g))
                     from generate_series(1, 121) g))))),
  '22023',
  'too many fiches in one import (max 120)',
  'cent vingt et une fiches sont refusées, et la borne porte sur le TOTAL du lot, pas sur une rubrique');

-- LA BORNE EST INCLUSIVE, ET C'EST LA MOITIÉ QUI MANQUE TOUJOURS. Douze
-- rubriques de dix fiches : le lot le plus large que le produit promet
-- d'accepter. Un `>=` écrit à la place d'un `>` serait vert aux deux assertions
-- ci-dessus et refuserait pourtant cet import-ci.
select is(
  public.import_vitrine_carte(
    'f1000000-0000-4000-8000-00000000000f',
    jsonb_build_object(
      'nom', 'Carte à la borne exacte',
      'rubriques', (
        select jsonb_agg(jsonb_build_object(
          'nom', 'Rubrique ' || g,
          'fiches', (select jsonb_agg(jsonb_build_object(
                              'nom', 'Fiche ' || g || '-' || h))
                       from generate_series(1, 10) h)))
          from generate_series(1, 12) g)),
    'f1000000-0000-4000-8000-000000000f05') ->> 'fiches_creees',
  '120',
  'douze rubriques et cent vingt fiches PASSENT : les deux bornes sont inclusives, comme le produit les promet');


-- ── 13e. LES REFUS NOMMÉS, ET CE QU'ILS NE DISENT PAS ───────

-- L'ORGANISATION INCONNUE REND LE MÊME 42501 INDISTINCT que le reste du module.
-- Distinguer « cette organisation n'existe pas » aurait fait de cette RPC un
-- oracle sur les identifiants d'autrui, exactement ce que
-- `vitrine_public_state` refuse d'être.
select throws_ok(
  $$select public.import_vitrine_carte(
      '00000000-0000-4000-8000-0000000000ff'::uuid,
      '{"nom": "Carte de nulle part", "rubriques": []}'::jsonb,
      'f1000000-0000-4000-8000-000000000f05')$$,
  '42501', 'not authorized',
  'une organisation inconnue rend le 42501 INDISTINCT du module — pas un mot de plus');

-- LE CONFLIT DE NOM, ET LE NOM QUI N'Y EST PAS. Le message attendu est donné EN
-- ENTIER : c'est la seule façon de prouver une absence, puisqu'un message
-- conforme ne peut pas contenir en plus le libellé que le lot portait. Ce
-- message-ci finit dans un journal d'application que personne n'a borné.
select throws_ok(
  $$select public.import_vitrine_carte(
      'f1000000-0000-4000-8000-00000000000f',
      '{"nom": "Carte importée", "rubriques": []}'::jsonb,
      'f1000000-0000-4000-8000-000000000f05')$$,
  '23505', 'a carte of this name already exists in this catalogue',
  'un nom de carte déjà pris rend 23505, et le message ne relaie PAS le nom');

-- LE VOCABULAIRE RESTE AU `check` DE LA TABLE, et c'est lui qui refuse. La RPC
-- ne recopie ni les huit badges ni les quatorze allergènes : une liste jumelle
-- aurait divergé le jour où un quinzième allergène entre. Le nom de la
-- contrainte remonte, et c'est ce qui permet à un écran d'import de pointer LA
-- BONNE COLONNE du fichier.
select throws_ok(
  $$select public.import_vitrine_carte(
      'f1000000-0000-4000-8000-00000000000f',
      '{"nom": "Carte au badge inconnu",
        "rubriques": [{"nom": "R", "fiches": [{"nom": "F", "badges": ["licorne"]}]}]}'::jsonb,
      'f1000000-0000-4000-8000-000000000f05')$$,
  '23514',
  'a line of the import was rejected by constraint vitrine_items_badges_check',
  'un badge hors vocabulaire est refusé par le `check` de la table, et le refus dit LAQUELLE des règles a mordu');

select throws_ok(
  $$select public.import_vitrine_carte(
      'f1000000-0000-4000-8000-00000000000f',
      '{"nom": "Carte à l''allergène inconnu",
        "rubriques": [{"nom": "R", "fiches": [{"nom": "F", "allergenes": ["licorne"]}]}]}'::jsonb,
      'f1000000-0000-4000-8000-000000000f05')$$,
  '23514',
  'a line of the import was rejected by constraint vitrine_items_allergenes_check',
  '… et les quatorze allergènes de l''annexe II sont gardés par la même mécanique, sous leur propre nom de contrainte');

-- LA FORME EST FERMÉE AUX TROIS RANGS. Une clé inconnue acceptée en silence
-- produirait une carte de soixante plats SANS AUCUN PRIX et sans le moindre
-- message : le seul mode d'échec qu'un écran d'import ne peut pas rattraper,
-- parce qu'il ressemble à un succès.
select throws_ok(
  $$select public.import_vitrine_carte(
      'f1000000-0000-4000-8000-00000000000f',
      '{"nom": "C", "rubriques": [], "couleur": "rouge"}'::jsonb,
      'f1000000-0000-4000-8000-000000000f05')$$,
  '22023', 'payload carries an unknown key',
  'une clé inconnue au premier rang du lot est refusée');

select throws_ok(
  $$select public.import_vitrine_carte(
      'f1000000-0000-4000-8000-00000000000f',
      '{"nom": "C", "rubriques": [{"nom": "R", "fiches": [], "icone": "x"}]}'::jsonb,
      'f1000000-0000-4000-8000-000000000f05')$$,
  '22023', 'a rubrique carries an unknown key',
  '… au deuxième rang aussi');

select throws_ok(
  $$select public.import_vitrine_carte(
      'f1000000-0000-4000-8000-00000000000f',
      '{"nom": "C", "rubriques": [{"nom": "R", "fiches": [{"nom": "F", "prix": "8 €"}]}]}'::jsonb,
      'f1000000-0000-4000-8000-000000000f05')$$,
  '22023', 'a fiche carries an unknown key',
  '… et au troisième : « prix » au lieu de « prix_affiche » est REFUSÉ, pas ignoré');

-- DEUX RUBRIQUES DE MÊME NOM DANS LE MÊME LOT. La contrainte
-- `vitrine_categories_menu_nom_unique` le refuserait aussi — elle est le filet —
-- mais en 23505, sous le même mot que « cette carte existe déjà », que l'écran
-- devrait alors distinguer sans indice.
select throws_ok(
  $$select public.import_vitrine_carte(
      'f1000000-0000-4000-8000-00000000000f',
      '{"nom": "Carte aux rubriques jumelles",
        "rubriques": [{"nom": "Entrées", "fiches": []},
                      {"nom": "Entrées", "fiches": []}]}'::jsonb,
      'f1000000-0000-4000-8000-000000000f05')$$,
  '22023', 'two rubriques of the import share the same name',
  'deux rubriques homonymes dans le même lot sont refusées SOUS LEUR PROPRE MOT, avant que rien ne soit écrit');

select throws_ok(
  $$select public.import_vitrine_carte(
      'f1000000-0000-4000-8000-00000000000f',
      '{"nom": "Carte mal typée",
        "rubriques": [{"nom": "R", "fiches": [{"nom": "F", "badges": "vegan"}]}]}'::jsonb,
      'f1000000-0000-4000-8000-000000000f05')$$,
  '22023', 'a fiche has a field of the wrong type',
  'un vocabulaire passé en CHAÎNE au lieu d''un tableau est un fichier mal formé, et il le dit — pas « badge inconnu »');

select throws_ok(
  $$select public.import_vitrine_carte(
      'f1000000-0000-4000-8000-00000000000f',
      '{"nom": "Carte au badge numérique",
        "rubriques": [{"nom": "R", "fiches": [{"nom": "F", "badges": [7]}]}]}'::jsonb,
      'f1000000-0000-4000-8000-000000000f05')$$,
  '22023', 'badges and allergenes must be arrays of strings',
  '… et un élément non textuel dans un vocabulaire est refusé AVANT le `check`, qui aurait dit « badge inconnu » pour une faute de forme');


-- ── 13f. L'ACTEUR — TRANCHÉ EN SQL, ET IL SIGNE LE JOURNAL ──
--
-- Point I2 de la revue L12, fermé en VIT-3. La RPC journalisait `system` faute
-- de recevoir un acteur : cent vingt fiches écrites en un geste, et le journal
-- ne disait pas par qui — précisément le geste dont on voudra savoir l'auteur,
-- parce que c'est le seul du module qui refait toute une carte d'un coup.
--
-- LES QUATRE REFUS RENDENT LE MÊME 42501, et c'est l'objet de la moitié des
-- assertions : « acteur absent », « caissier », « membre d'une AUTRE
-- organisation » et « organisation inconnue » sont indistincts. Distinguer
-- aurait fait de cette RPC un oracle sur les équipes d'autrui.
--
-- LE REFUS DU MEMBRE D'UNE AUTRE ORGANISATION EST CELUI QUI COMPTE LE PLUS :
-- c'est le seul qui échouerait si la vérification avait été écrite « ce user
-- existe » au lieu de « ce user est membre de CETTE organisation ». Les trois
-- autres passeraient une garde bâclée.

-- LE JOURNAL PORTE L'ACTEUR, ET PLUS `system`. Deux imports ont abouti dans
-- cette section (13a et la borne exacte de 13d) : les DEUX doivent être signés,
-- et l'assertion porte sur l'ensemble plutôt que sur une ligne — une seule
-- signée sur deux serait verte à un `limit 1`.
select is(
  (select pg_catalog.string_agg(distinct a.actor, ',')
     from public.audit_logs a
    where a.organization_id = 'f1000000-0000-4000-8000-00000000000f'
      and a.action = 'vitrine.carte_imported'),
  'f1000000-0000-4000-8000-000000000f05',
  'TOUTES les lignes d''audit de l''import portent l''ÉDITEUR qui l''a joué — plus une seule ne dit « system » (point I2 de la revue L12)');

select is(
  (select pg_catalog.count(*)::bigint
     from public.audit_logs a
    where a.organization_id = 'f1000000-0000-4000-8000-00000000000f'
      and a.action = 'vitrine.carte_imported'),
  2::bigint,
  '… et le journal compte les GESTES : deux imports aboutis, deux lignes — pas une par fiche, pas une par lot refusé');

-- LE CAISSIER EST MEMBRE, ET IL EST REFUSÉ. C'est la différence entre
-- « appartenance » et « rôle », et sans cette assertion une garde écrite
-- `exists (… where user_id = …)` sans le `role in (…)` serait verte partout
-- ailleurs.
select throws_ok(
  $$select public.import_vitrine_carte(
      'f1000000-0000-4000-8000-00000000000f',
      '{"nom": "Carte du comptoir", "rubriques": []}'::jsonb,
      'f1000000-0000-4000-8000-000000000f06')$$,
  '42501', 'not authorized',
  'le CAISSIER est refusé : refaire une carte n''est pas un geste de comptoir, motif set_vitrine_slug');

-- LE PROPRIÉTAIRE DE A SUR LE CATALOGUE DE F. Il est `owner`, donc son rôle
-- suffirait — ce qui manque est l'appartenance à CETTE organisation.
select throws_ok(
  $$select public.import_vitrine_carte(
      'f1000000-0000-4000-8000-00000000000f',
      '{"nom": "Carte du voisin", "rubriques": []}'::jsonb,
      'f1000000-0000-4000-8000-000000000f01')$$,
  '42501', 'not authorized',
  'le propriétaire d''une AUTRE organisation est refusé sur ce catalogue : la garde lit l''appartenance, pas seulement le rôle');

select throws_ok(
  $$select public.import_vitrine_carte(
      'f1000000-0000-4000-8000-00000000000f',
      '{"nom": "Carte anonyme", "rubriques": []}'::jsonb,
      null)$$,
  '42501', 'not authorized',
  'un acteur ABSENT est refusé sous le même mot : la RPC n''a plus de chemin sans acteur depuis que l''ancienne forme est supprimée');

-- RIEN N'A ÉTÉ ÉCRIT PAR AUCUN DES TROIS REFUS. Le compte de référence est celui
-- de 13d : les deux cartes de 13a/13c plus celle de la borne exacte.
select is(
  (select pg_catalog.count(*)::bigint from public.vitrine_menus m
    where m.organization_id = 'f1000000-0000-4000-8000-00000000000f'
      and m.nom in ('Carte du comptoir', 'Carte du voisin', 'Carte anonyme')),
  0::bigint,
  'aucun des trois refus d''acteur n''a laissé de carte derrière lui — le refus tombe AVANT la première écriture');


-- ── 13g. LES ACL, ET LA RÈGLE CHECK ⇒ EXECUTE DU CHEMIN DEFINER ──
--
-- LA SIGNATURE A ÉTÉ REMPLACÉE, PAS SURCHARGÉE (leçon L3, motif §12a). Deux
-- exemplaires auraient laissé grand ouvert le chemin SANS acteur : un appelant
-- oublié aurait continué d'écrire `system` dans le journal, et rien ne l'aurait
-- dit — l'ancienne forme reste appelable tant qu'elle existe.
select is(
  (select pg_catalog.count(*)::bigint from pg_proc p
     join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'import_vitrine_carte'),
  1::bigint,
  'une seule `import_vitrine_carte` existe : la forme SANS acteur est SUPPRIMÉE, pas surchargée');

select ok(has_function_privilege('service_role', 'public.import_vitrine_carte(uuid,jsonb,uuid)', 'EXECUTE'),
  'seul le serveur importe une carte');
select ok(not has_function_privilege('authenticated', 'public.import_vitrine_carte(uuid,jsonb,uuid)', 'EXECUTE'),
  'le commerçant ne contourne pas l''action serveur pour écrire cent vingt fiches d''un coup');
select ok(not has_function_privilege('anon', 'public.import_vitrine_carte(uuid,jsonb,uuid)', 'EXECUTE'),
  'anon n''importe rien, nulle part');

-- LA LEÇON FRAPPÉE DEUX FOIS, RÉAFFIRMÉE POUR LE RÔLE QUI ÉCRIT VRAIMENT ICI.
-- 20261008120000 a dû rendre l'EXECUTE à `is_valid_experience_steps` après un
-- « permission denied » sur toute création de Moment Signature ; 20261011120000
-- l'a rendu aux trois validateurs de la Vitrine pour la même raison. La règle
-- catalogue de `security_acl.test.sql` garde ce cas — mais seulement pour `anon`
-- et `authenticated`, les écrivains DIRECTS. L'import écrit en `security
-- definer`, donc sous le PROPRIÉTAIRE de la fonction : c'est LUI qui doit
-- pouvoir déclencher l'évaluation du `check`, et aucune règle catalogue ne le
-- vérifie aujourd'hui.
select ok(
  has_function_privilege(
    (select p.proowner::regrole::text from pg_proc p
      where p.oid = 'public.import_vitrine_carte(uuid,jsonb,uuid)'::regprocedure),
    'public.is_valid_vitrine_vocabulaire(text[],text[])', 'EXECUTE'),
  'le PROPRIÉTAIRE de l''import peut exécuter le validateur de vocabulaire — un `check` s''évalue sous le rôle qui écrit, et ici ce rôle est le definer');

select ok(
  has_function_privilege('service_role',
    'public.is_valid_vitrine_vocabulaire(text[],text[])', 'EXECUTE'),
  '… et service_role le peut aussi, pour le jour où une écriture de fiche repasserait par PostgREST plutôt que par cette RPC');

-- LE `security definer` ET LE `search_path` VIDE, VÉRIFIÉS SUR LA FONCTION
-- INSTALLÉE et non sur le fichier : c'est le catalogue qui fait foi.
select ok(
  (select p.prosecdef from pg_proc p
    where p.oid = 'public.import_vitrine_carte(uuid,jsonb,uuid)'::regprocedure),
  'l''import est `security definer` — c''est ce qui lui donne le droit d''écrire sans session marchande');

select is(
  (select pg_catalog.array_to_string(p.proconfig, ',') from pg_catalog.pg_proc p
    where p.oid = 'public.import_vitrine_carte(uuid,jsonb,uuid)'::regprocedure),
  'search_path=""',
  '… et son search_path est VIDE : aucun schéma appelant ne peut lui glisser une fonction homonyme');


-- ══ 14. LES PORTES DES MODULES (VIT-3, lot L13) ═════════════
--
-- Ce que cette section prouve, et pourquoi chaque assertion est là :
--
--   * CHAQUE DRAPEAU EST EXERCÉ DANS LES DEUX SENS. Une activité coupée, une
--     file en pause, une file fermée, une offre dont la fenêtre n'a pas
--     commencé, une offre dont la fenêtre est passée, une offre en brouillon, un
--     quiz en brouillon : chacun a son jumeau SERVI. Un filtre oublié ne se voit
--     que si la ligne qu'il devait retenir existe.
--   * LE DROIT `quiz` EST LE SEUL REDEMANDÉ, et il l'est vraiment : H a une
--     vitrine servie et un quiz ACTIF, et sa liste de quiz est vide. Sans cette
--     organisation, « le droit est vérifié » et « il n'y a pas de quiz »
--     rendraient le même résultat.
--   * LES SIX LISTES EXISTENT TOUJOURS. La forme du document ne dépend pas de
--     son contenu : c'est l'écran qui masque un bloc vide, et il ne peut le
--     faire que si la clé est là.
--   * LA BORNE EST APPLIQUÉE APRÈS L'ORDRE, ce qui est la seule façon dont elle
--     soit utile. Prouvé sur quinze activités dont les noms disent leur rang :
--     un `limit` sans `order by` dans la sous-requête rendrait douze lignes au
--     choix du plan, et la page changerait de contenu d'un rafraîchissement à
--     l'autre sans que rien n'ait bougé en base.
--   * LES PORTES NE SONT PAS TRADUISIBLES, et c'est CHIFFRÉ. G porte quatre
--     portes et UN seul champ traduisible. Si elles entraient au dénominateur,
--     toute vitrine traduite serait retombée sous le seuil du sélecteur de
--     langue le jour de cette migration — sans que personne n'ait rien défait.

select set_config('request.jwt.claims', '{"role":"service_role"}', true);

-- ── Fixtures G et H ─────────────────────────────────────────
-- G : SERVIE, avec le droit `quiz` EN PLUS du droit `vitrine`. Elle porte un
--     jumeau retenu pour chaque jumeau servi.
-- H : SERVIE elle aussi, mais SANS le droit `quiz`. Son quiz actif doit rester
--     invisible pendant que tout le reste de sa vitrine répond.
insert into public.organizations
  (id, name, slug, subscription_status, plan, timezone, data_retention_months)
values
  ('f1000000-0000-4000-8000-000000001300', 'Vitrine G', 'tap-vitrine-g',
   'active', 'starter', 'Europe/Paris', 6),
  ('f1000000-0000-4000-8000-000000001301', 'Vitrine H', 'tap-vitrine-h',
   'active', 'starter', 'Europe/Paris', 6);

insert into public.organization_module_grants
  (organization_id, module, kind, source, starts_at, ends_at)
values
  ('f1000000-0000-4000-8000-000000001300', 'vitrine', 'pass', 'backoffice',
   now() - interval '1 day', now() + interval '365 days'),
  ('f1000000-0000-4000-8000-000000001300', 'quiz', 'pass', 'backoffice',
   now() - interval '1 day', now() + interval '365 days'),
  -- `reserver` DEPUIS 20261020120000 : les trois listes de `portes.reserver`
  -- reflètent le droit du PRODUIT qu'elles ouvrent, plus celui de la vitrine.
  -- Sans cet octroi, G annoncerait une page sans aucune porte — et les
  -- assertions ci-dessous liraient des listes vides sans savoir pourquoi.
  ('f1000000-0000-4000-8000-000000001300', 'reserver', 'pass', 'backoffice',
   now() - interval '1 day', now() + interval '365 days'),
  -- H n'a QUE `vitrine` : c'est toute la fixture.
  ('f1000000-0000-4000-8000-000000001301', 'vitrine', 'pass', 'backoffice',
   now() - interval '1 day', now() + interval '365 days');

-- `histoire` et `horaires_texte` restent NULLES : un champ vide n'est pas
-- traduisible, donc le total de G vaut UN — son accroche — et c'est ce chiffre
-- qui rend l'assertion de non-traduisibilité des portes lisible à la main.
insert into public.vitrine_settings
  (id, organization_id, slug, published, accroche)
values
  ('f1000000-0000-4000-8000-000000001310',
   'f1000000-0000-4000-8000-000000001300', 'tap-portes', true,
   'Le comptoir aux quatre portes.'),
  ('f1000000-0000-4000-8000-000000001311',
   'f1000000-0000-4000-8000-000000001301', 'tap-portes-sans-quiz', true,
   'Le bar sans quiz.');

-- UNE ACTIVE, UNE COUPÉE.
insert into public.reservation_activities
  (id, organization_id, name, description, active)
values
  ('f1000000-0000-4000-8000-000000001320',
   'f1000000-0000-4000-8000-000000001300', 'Dégustation', null, true),
  ('f1000000-0000-4000-8000-000000001321',
   'f1000000-0000-4000-8000-000000001300', 'Atelier suspendu', null, false);

-- UNE OUVERTE, UNE EN PAUSE, UNE FERMÉE. `paused` sert encore ceux qui
-- attendent déjà mais n'accepte plus personne : l'annoncer depuis la Vitrine
-- aurait envoyé un client sur une page qui le refuse.
insert into public.reservation_queues
  (id, organization_id, activity_id, name, status, max_live_entries)
values
  ('f1000000-0000-4000-8000-000000001330',
   'f1000000-0000-4000-8000-000000001300', null, 'Comptoir', 'open', 50),
  ('f1000000-0000-4000-8000-000000001331',
   'f1000000-0000-4000-8000-000000001300', null, 'En pause', 'paused', 50),
  ('f1000000-0000-4000-8000-000000001332',
   'f1000000-0000-4000-8000-000000001300', null, 'Fermée', 'closed', 50);

-- QUATRE OFFRES POUR TROIS REFUS. La fenêtre est la borne que le comptoir
-- applique (`redeem_stock_hold`) : une offre dont la fenêtre est passée ne se
-- retire plus, et une offre dont la fenêtre n'a pas commencé annoncerait un
-- retrait impossible aujourd'hui.
insert into public.reservation_stock_offers
  (id, organization_id, title, description, stock_total,
   window_starts_at, window_ends_at, per_player_limit, status)
values
  ('f1000000-0000-4000-8000-000000001340',
   'f1000000-0000-4000-8000-000000001300', 'Tarte du jour', null, 4,
   now() - interval '1 hour', now() + interval '3 hours', 1, 'open'),
  ('f1000000-0000-4000-8000-000000001341',
   'f1000000-0000-4000-8000-000000001300', 'Drop de demain', null, 4,
   now() + interval '2 hours', now() + interval '3 hours', 1, 'open'),
  ('f1000000-0000-4000-8000-000000001342',
   'f1000000-0000-4000-8000-000000001300', 'Drop d''hier', null, 4,
   now() - interval '3 hours', now() - interval '1 hour', 1, 'open'),
  -- EN BROUILLON ET DANS SA FENÊTRE : le seul des quatre dont le refus vient du
  -- statut et non de l'horloge.
  ('f1000000-0000-4000-8000-000000001343',
   'f1000000-0000-4000-8000-000000001300', 'Brouillon du soir', null, 4,
   now() - interval '1 hour', now() + interval '3 hours', 1, 'draft');

insert into public.quizzes
  (id, organization_id, name, status, public_slug)
values
  ('f1000000-0000-4000-8000-000000001350',
   'f1000000-0000-4000-8000-000000001300', 'Quiz du comptoir', 'active',
   'tap-quiz-servi'),
  ('f1000000-0000-4000-8000-000000001351',
   'f1000000-0000-4000-8000-000000001300', 'Quiz en préparation', 'draft',
   'tap-quiz-brouillon'),
  -- CELUI DE H : ACTIF, et pourtant invisible — son organisation n'a pas le
  -- droit `quiz`.
  ('f1000000-0000-4000-8000-000000001352',
   'f1000000-0000-4000-8000-000000001301', 'Quiz sans droit', 'active',
   'tap-quiz-sans-droit');


-- ── 14a. LA FORME DU DOCUMENT — les six listes existent ─────

select results_eq(
  $$select key from pg_catalog.jsonb_each(
      public.vitrine_public_state('tap-portes') -> 'portes') order by key$$,
  array['experiences', 'reserver'],
  'les portes se rangent en DEUX blocs, et cette liste de clés est close');

select results_eq(
  $$select key from pg_catalog.jsonb_each(
      public.vitrine_public_state('tap-portes') #> '{portes,reserver}')
     order by key$$,
  array['activites', 'files', 'offres'],
  'le bloc Réserver porte ses TROIS listes, nommées comme les trois pages publiques du module');

-- LE BLOC EXPÉRIENCES, ET SA LISTE EST CLOSE ELLE AUSSI (porte Duo Miroir,
-- L17). Cette assertion manquait : `experiences` était le seul bloc de `portes`
-- dont le jeu de clés n'était verrouillé nulle part, si bien qu'une clé ajoutée
-- là ne faisait rougir personne. Elle l'est maintenant.
--
-- `duo` EST UN BOOLÉEN, PAS UNE LISTE, et c'est la seule dissymétrie du
-- document : un commerce publie N quiz, chacun à son adresse — donc l'écran a
-- besoin de leurs slugs — mais UN seul Duo Miroir, à une adresse déductible du
-- slug de la vitrine. « Oui » ou « non » est tout ce qu'il y a à dire.
select results_eq(
  $$select key from pg_catalog.jsonb_each(
      public.vitrine_public_state('tap-portes') #> '{portes,experiences}')
     order by key$$,
  array['calendars', 'duo', 'pronostics', 'quiz'],
  'le bloc Expériences porte ses listes quiz, calendrier, pronostics et son drapeau duo, et cette liste de clés est close');

-- G n'a aucune fiche Duo épinglée : la porte est FAUSSE, et surtout elle est
-- PRÉSENTE. Une clé absente aurait obligé l'écran à distinguer « pas de jeu » de
-- « pas de clé » — exactement ce que les quatre listes évitent depuis VIT-3.
select is(
  public.vitrine_public_state('tap-portes') #> '{portes,experiences,duo}',
  'false'::jsonb,
  'une vitrine sans fiche Duo épinglée rend le drapeau à FAUX, et non une clé absente');

-- LES LISTES EXISTENT MÊME VIDES. E n'a aucune fixture de Réserver ni de quiz,
-- et pourtant sa réponse porte les six clés : c'est ce qui permet à l'écran de
-- masquer un bloc sans distinguer « pas de file » de « pas de clé ».
select is(
  public.vitrine_public_state('tap-traduction') #>> '{portes,reserver,files}',
  '[]',
  'une vitrine SANS aucune porte rend quand même la liste, VIDE : la forme du document ne dépend pas de son contenu');

select is(
  public.vitrine_public_state('tap-traduction') #>> '{portes,experiences,quiz}',
  '[]',
  '… et il en va de même du bloc Expériences');


-- ── 14b. CHAQUE DRAPEAU, ET SON JUMEAU RETENU ───────────────

select is(
  (select pg_catalog.string_agg(p ->> 'nom', ', ')
     from pg_catalog.jsonb_array_elements(
       public.vitrine_public_state('tap-portes')
         #> '{portes,reserver,activites}') p),
  'Dégustation',
  'seule l''activité ACTIVE est annoncée : « Atelier suspendu » existe et ne sort pas');

select is(
  (select pg_catalog.string_agg(p ->> 'nom', ', ')
     from pg_catalog.jsonb_array_elements(
       public.vitrine_public_state('tap-portes')
         #> '{portes,reserver,files}') p),
  'Comptoir',
  'seule la file OUVERTE est annoncée : ni « En pause » — qui sert encore ceux qui attendent mais n''accepte plus — ni « Fermée »');

select is(
  (select pg_catalog.string_agg(p ->> 'nom', ', ')
     from pg_catalog.jsonb_array_elements(
       public.vitrine_public_state('tap-portes')
         #> '{portes,reserver,offres}') p),
  'Tarte du jour',
  'seule l''offre OUVERTE ET DANS SA FENÊTRE est annoncée : la future, la passée et le brouillon restent dehors');

-- LES DEUX BORNES VOYAGENT AVEC LA PORTE, pour que l'écran puisse écrire
-- « jusqu'à 18 h » sans un second appel par offre.
select results_eq(
  $$select key from pg_catalog.jsonb_each(
      public.vitrine_public_state('tap-portes')
        #> '{portes,reserver,offres,0}') order by key$$,
  array['id', 'nom', 'window_ends_at', 'window_starts_at'],
  'une porte d''offre porte ses DEUX bornes de retrait, et rien de plus');

select is(
  (select pg_catalog.string_agg(p ->> 'titre', ', ')
     from pg_catalog.jsonb_array_elements(
       public.vitrine_public_state('tap-portes')
         #> '{portes,experiences,quiz}') p),
  'Quiz du comptoir',
  'seul le quiz ACTIF est annoncé : celui qui est encore en préparation ne l''est pas');

select is(
  public.vitrine_public_state('tap-portes')
    #>> '{portes,experiences,quiz,0,slug}',
  'tap-quiz-servi',
  '… et la porte porte le `public_slug`, c''est-à-dire l''adresse de la page, pas l''identifiant interne');


-- ── 14c. LE DROIT `quiz`, LE SEUL REDEMANDÉ ─────────────────
--
-- H EST SERVIE : c'est la moitié qui rend l'assertion utile. Une vitrine muette
-- aurait rendu la liste vide pour la mauvaise raison.

select is(public.vitrine_public_state('tap-portes-sans-quiz') ->> 'state', 'ok',
  'la vitrine sans le droit `quiz` répond normalement — c''est bien le quiz qui est retenu, pas la page');

select is(
  public.vitrine_public_state('tap-portes-sans-quiz')
    #>> '{portes,experiences,quiz}',
  '[]',
  'un quiz ACTIF reste invisible sans `org_has_module_access(…, ''quiz'')` : le droit `vitrine` ne couvre PAS le quiz');


-- ── 14d. LES PORTES NE SONT PAS TRADUISIBLES, ET C'EST CHIFFRÉ ──
--
-- G porte quatre portes et UN seul champ traduisible : son accroche. Le jour où
-- une porte entrerait dans `vitrine_champs_traduisibles`, ce total passerait à
-- cinq et cette ligne rougirait — ce qui est exactement le but, parce que la
-- même arithmétique ferait tomber le sélecteur de langue des vitrines E2E.

select is(
  public.vitrine_public_state('tap-portes')
    #>> '{lang_coverage,total_champs_traduisibles}',
  '1',
  'les quatre portes de G n''ajoutent AUCUN champ traduisible : le dénominateur de la couverture ne bouge pas en VIT-3');


-- ── 14e. DOUZE PAR LISTE, ET L'ORDRE PASSE AVANT LA BORNE ───
--
-- Quatorze activités de plus, dont le NOM dit le rang. Triées, « Atelier 01 » à
-- « Atelier 14 » précèdent « Dégustation » : les douze retenues sont donc
-- connues d'avance, et l'assertion mord sur l'ORDRE autant que sur le compte.
-- Un `limit` posé sans `order by` dans la sous-requête rendrait douze lignes au
-- choix du plan — le compte serait vert, la page changerait de contenu d'un
-- rafraîchissement à l'autre.

insert into public.reservation_activities (organization_id, name, active)
select 'f1000000-0000-4000-8000-000000001300',
       'Atelier ' || to_char(g, 'FM00'), true
  from generate_series(1, 14) g;

select is(
  pg_catalog.jsonb_array_length(
    public.vitrine_public_state('tap-portes') #> '{portes,reserver,activites}'),
  12,
  'quinze activités actives ne rendent que DOUZE portes : la page reste une page, pas un catalogue');

select is(
  public.vitrine_public_state('tap-portes') #>> '{portes,reserver,activites,0,nom}',
  'Atelier 01',
  '… et les douze retenues sont les douze PREMIÈRES par nom, pas douze au choix du plan');

select is(
  public.vitrine_public_state('tap-portes') #>> '{portes,reserver,activites,11,nom}',
  'Atelier 12',
  '… jusqu''à la douzième exactement : « Atelier 13 », « Atelier 14 » et « Dégustation » tombent au-delà de la borne');

-- LES IDENTIFIANTS SORTENT EN TEXTE. Ce sont des fragments d'URL
-- (`/reserver/{activityId}`), pas des clés que l'appelant recompose.
select is(
  pg_catalog.jsonb_typeof(
    public.vitrine_public_state('tap-portes') #> '{portes,reserver,files,0,id}'),
  'string',
  'les identifiants des portes sortent en TEXTE : ce sont des fragments d''URL');

select is(
  public.vitrine_public_state('tap-portes') #>> '{portes,reserver,files,0,id}',
  'f1000000-0000-4000-8000-000000001330',
  '… et c''est bien l''identifiant de la file ouverte, celui que `/reserver/file/{id}` attend');




-- ══ 15. L'ÉCRAN DE TRADUCTION : LE CONTRAT, ET LE RETRAIT (VIT-5, lot L15) ══
--
-- Ce que cette section prouve, et pourquoi chaque preuve existe :
--
--   1. LE CONTRAT DE SORTIE DE `vitrine_translation_state` EST EXACT, clé par
--      clé, aux quatre rangs. C'est un contrat d'ÉCRAN : le front construit une
--      liste à deux colonnes dessus, et une clé qui disparaît ne casse rien à la
--      compilation — elle rend une colonne vide en production. Les quatre
--      `results_eq` mordent sur l'ENSEMBLE des clés, pas sur leur présence : une
--      clé ajoutée les fait rougir autant qu'une clé retirée, ce qui est le but.
--      Le glissement qu'elles empêchent est celui que `lang_coverage` a déjà
--      failli connaître — un verdict calculé en base parce que c'était pratique.
--   2. LES TROIS VALEURS AJOUTÉES SONT LES BONNES : un libellé lisible par
--      cible, le français COURANT par champ, et l'anglais stocké s'il existe —
--      périmé compris. Le tout en UNE assertion qui rend les cinq lignes d'un
--      coup : un échec montre le tableau entier, pas une cellule.
--   3. LA JOINTURE DES TEXTES NE PERD PERSONNE, et c'est vérifié sur TOUTES les
--      vitrines de la base, pas sur la fixture. `vitrine_champs_traduisibles`
--      reste seule à décider quels champs comptent ; le jour où un sixième champ
--      y entrerait sans entrer dans la liste des sources, il sortirait ici avec
--      un français nul — l'écran afficherait une ligne à traduire sans montrer
--      quoi. La règle le nomme au lieu de le laisser passer.
--   4. LE RETRAIT FAIT CE QU'IL DIT : la traduction disparaît, l'état repasse
--      « absent », le français reste, le résumé bouge, et le journal compte UN
--      geste. Puis il est IDEMPOTENT — et les deux appels prouvent au passage
--      que « EN » et « en » désignent la même ligne, sans quoi une traduction
--      posée dans une casse serait ineffaçable dans l'autre.
--   5. LA VERSION RENDUE EST CELLE QUE L'ÉCRAN DEVRA RENVOYER, et le scénario
--      complet est joué : état lu, français modifié entre-temps, traduction
--      envoyée avec la version VUE — elle atterrit périmée d'emblée. C'est la
--      preuve que la fraîcheur se décide à l'AFFICHAGE et non à l'envoi ; sans
--      elle, la même saisie serait enregistrée fraîche et rien ne la périmerait
--      jamais.
--   6. LE RETRAIT NE FRANCHIT PAS LA FRONTIÈRE, et il refuse SANS RIEN
--      APPRENDRE : le même code et le même message pour « cible d'autrui » et
--      « cible inexistante ». Les distinguer aurait fait de cette RPC un oracle
--      sur les identifiants des autres locataires — ce que l'upsert refuse
--      d'être depuis L11, et une divergence entre les deux portes serait un
--      trou : ce qu'on ne peut pas écrire chez le voisin, on ne doit pas
--      pouvoir l'effacer.
--   7. LA VERSION POSÉE EST BORNÉE PAR LA RÉALITÉ (point M1 de la revue L15).
--      La clé du point 5 voyage par le client, donc elle est forgeable : une
--      version FUTURE rendait `version_source >= version_courante` vrai POUR
--      TOUJOURS, et l'anglais correspondant ne pouvait plus jamais périmer. §15h
--      pose une version 9999-12-31, constate que la ligne STOCKÉE porte
--      l'`updated_at` réel de la cible, puis fait bouger le français et la voit
--      périr. La borne est unilatérale : une version ANTÉRIEURE est conservée
--      telle quelle, sans quoi le point 5 deviendrait faux.
--   8. LES DEUX PORTES SIGNENT LEUR JOURNAL (point M2). L'acteur est vérifié EN
--      SQL membre `owner|editor` : le caissier — MEMBRE, et pourtant refusé —
--      sépare le rôle de l'appartenance, le propriétaire d'une AUTRE
--      organisation sépare l'appartenance du rôle, et l'acteur absent ferme le
--      chemin anonyme. Une garde bâclée passerait l'un ou l'autre.
--
-- ── CE QUE CETTE SECTION NE PROUVE PAS ──
--
-- Rien de l'écran lui-même : il vit dans `src/app`, et aucune assertion SQL ne
-- peut l'observer. Ce qui est prouvé ici, c'est que la base lui rend TOUT ce
-- qu'il lui faut en UN appel — c'est-à-dire qu'aucun second aller-retour par
-- cible n'est nécessaire pour afficher quatorze noms de plats.

select set_config('request.jwt.claims', '{"role":"service_role"}', true);

-- ── Fixture L15 : cinq champs, et les TROIS états d'un coup ──
--
-- NON PUBLIÉE, délibérément : on traduit AVANT d'ouvrir, et l'état de l'éditeur
-- ne doit pas dépendre de la publication — il mesure le travail restant, pas ce
-- que le visiteur voit. Aucun droit `vitrine` non plus, pour la même raison :
-- `vitrine_translation_state` ne garde ni l'un ni l'autre, et sa docstring le
-- dit. Si l'un des deux devenait nécessaire, tout ce qui suit rougirait.
insert into public.organizations
  (id, name, slug, subscription_status, plan, timezone, data_retention_months)
values ('f1000000-0000-4000-8000-000000001500', 'Vitrine L15', 'tap-vitrine-l15',
        'active', 'starter', 'Europe/Paris', 6);

-- DEUX ACTEURS POUR L15, ET IL EN FAUT DEUX (VIT-5, point M2 de la revue L15).
-- Les deux portes du calque exigent un membre `owner|editor` vérifié EN SQL :
-- l'ÉDITEUR joue tout ce qui suit, le CAISSIER n'existe que pour prouver que le
-- RÔLE est tranché et pas seulement l'appartenance — sans lui, une garde écrite
-- `exists (… where user_id = …)` sans le `role in (…)` serait verte partout
-- ailleurs. Le propriétaire de A (`…0f01`), lui, sépare l'inverse : son rôle
-- suffirait, c'est son appartenance à CETTE organisation qui manque.
insert into auth.users
  (id, aud, role, email, encrypted_password, created_at, updated_at)
values
  ('f1000000-0000-4000-8000-000000001505', 'authenticated', 'authenticated',
   'editeur-l15@test.local', '', now(), now()),
  ('f1000000-0000-4000-8000-000000001506', 'authenticated', 'authenticated',
   'caissier-l15@test.local', '', now(), now());

insert into public.organization_members (organization_id, user_id, role) values
  ('f1000000-0000-4000-8000-000000001500',
   'f1000000-0000-4000-8000-000000001505', 'editor'),
  ('f1000000-0000-4000-8000-000000001500',
   'f1000000-0000-4000-8000-000000001506', 'cashier');

-- `histoire` et `horaires_texte` restent NULLES : elles ne sont pas
-- traduisibles, donc elles ne doivent apparaître NI dans les cibles NI dans le
-- total. C'est la même assertion déguisée qu'à la fixture E, reprise ici parce
-- que la liste des sources de `vitrine_translation_state` est une SECONDE
-- énumération des mêmes colonnes : si elle laissait passer une colonne nulle,
-- le contrat rendrait un champ fantôme sans que le compteur bouge.
insert into public.vitrine_settings
  (id, organization_id, slug, published, accroche)
values ('f1000000-0000-4000-8000-000000001501',
        'f1000000-0000-4000-8000-000000001500', 'tap-l15-traduction', false,
        'Notre table du marché.');

insert into public.vitrine_menus (id, organization_id, nom, ordre, active) values
  ('f1000000-0000-4000-8000-000000001502',
   'f1000000-0000-4000-8000-000000001500', 'Carte de saison', 1, true);

insert into public.vitrine_categories (id, menu_id, organization_id, nom, ordre)
values
  ('f1000000-0000-4000-8000-000000001503',
   'f1000000-0000-4000-8000-000000001502',
   'f1000000-0000-4000-8000-000000001500', 'Desserts', 1);

insert into public.vitrine_items
  (id, categorie_id, organization_id, nom, description, prix_affiche,
   badges, allergenes, disponible, ordre)
values
  ('f1000000-0000-4000-8000-000000001504',
   'f1000000-0000-4000-8000-000000001503',
   'f1000000-0000-4000-8000-000000001500', 'Tarte aux figues',
   'Pâte brisée, miel de châtaignier.', '9 €',
   array['vegetarien']::text[], array['gluten']::text[], true, 1);

-- TROIS ÉTATS SUR CINQ CHAMPS, et c'est le minimum qui rende la section utile :
--   * accroche          → FRAIS  (version source = version courante)
--   * nom de la carte   → PÉRIMÉ (version source antérieure d'une heure)
--   * nom de la fiche   → FRAIS
--   * nom de la rubrique → ABSENT (jamais traduit)
--   * description       → ABSENT
-- La fiche porte donc UN champ frais et UN champ absent : c'est elle qui prouve
-- que le regroupement par cible ne scinde pas une entrée quand les états
-- diffèrent, et que son libellé tient sur les DEUX lignes.
select is(public.upsert_vitrine_translation(
  'f1000000-0000-4000-8000-000000001500', 'settings',
  'f1000000-0000-4000-8000-000000001501', 'en', 'accroche',
  'Our market table.',
  (select s.updated_at from public.vitrine_settings s
    where s.id = 'f1000000-0000-4000-8000-000000001501'),
  'f1000000-0000-4000-8000-000000001505') ->> 'state', 'ok',
  'L15 — l''accroche est traduite, et fraîche');

select is(public.upsert_vitrine_translation(
  'f1000000-0000-4000-8000-000000001500', 'menu',
  'f1000000-0000-4000-8000-000000001502', 'en', 'nom', 'Seasonal menu',
  (select m.updated_at - interval '1 hour' from public.vitrine_menus m
    where m.id = 'f1000000-0000-4000-8000-000000001502'),
  'f1000000-0000-4000-8000-000000001505') ->> 'state', 'ok',
  'L15 — le nom de la carte est traduit à une version ANTÉRIEURE : il naît périmé');

select is(public.upsert_vitrine_translation(
  'f1000000-0000-4000-8000-000000001500', 'item',
  'f1000000-0000-4000-8000-000000001504', 'en', 'nom', 'Fig tart',
  (select i.updated_at from public.vitrine_items i
    where i.id = 'f1000000-0000-4000-8000-000000001504'),
  'f1000000-0000-4000-8000-000000001505') ->> 'state', 'ok',
  'L15 — le nom de la fiche est traduit, et frais ; sa description ne l''est pas');


-- ── 15a. LE CONTRAT DE SORTIE, CLÉ PAR CLÉ, AUX QUATRE RANGS ──
--
-- `results_eq` sur l'ENSEMBLE des clés et non `has_key` sur chacune : une clé
-- AJOUTÉE doit rougir autant qu'une clé retirée. C'est la forme retenue pour
-- `lang_coverage` (« la couverture rend un COMPTE et rien d'autre »), et elle
-- vaut ici pour la raison inverse : cette sortie est un contrat d'écran, et
-- l'élargir en silence est le geste par lequel une RPC de lecture devient
-- lentement une API sans propriétaire.

select results_eq(
  $$select key from jsonb_each(
      public.vitrine_translation_state('f1000000-0000-4000-8000-000000001500'))
     order by key$$,
  array['cibles', 'lang', 'resume', 'state'],
  'le premier rang porte EXACTEMENT quatre clés : l''état, la langue décrite, le résumé chiffré et les cibles');

select results_eq(
  $$select key from jsonb_each(
      public.vitrine_translation_state('f1000000-0000-4000-8000-000000001500')
        -> 'resume')
     order by key$$,
  array['manquants', 'perimes', 'total_champs_traduisibles', 'traduits_frais'],
  'le résumé porte EXACTEMENT le total et les trois états — aucun pourcentage, aucun verdict : le seuil est une décision de produit');

select results_eq(
  $$select key from jsonb_each(
      public.vitrine_translation_state('f1000000-0000-4000-8000-000000001500')
        #> '{cibles,0}')
     order by key$$,
  array['champs', 'cible_id', 'cible_type', 'libelle', 'version'],
  'une cible porte EXACTEMENT son type, son identifiant, son LIBELLÉ lisible, sa VERSION et ses champs — sans le libellé l''écran afficherait une liste d''UUID, sans la version il enregistrerait des traductions faussement fraîches');

select results_eq(
  $$select key from jsonb_each(
      public.vitrine_translation_state('f1000000-0000-4000-8000-000000001500')
        #> '{cibles,0,champs,0}')
     order by key$$,
  array['champ', 'etat', 'texte_source', 'texte_traduit'],
  'un champ porte EXACTEMENT son nom, son état, le FRANÇAIS source et l''anglais stocké — sans le français, l''écran de saisie n''a qu''une colonne');

-- L'ORDRE FAIT PARTIE DU CONTRAT, et il est (cible_type, cible_id) — inchangé
-- depuis L11. Sans second rang, deux ouvertures de l'écran ne rendraient pas la
-- même liste ; sans premier rang stable, un test d'index serait un test du plan.
select is(
  public.vitrine_translation_state('f1000000-0000-4000-8000-000000001500')
    #>> '{cibles,0,cible_type}',
  'categorie',
  'les cibles sortent triées par type puis par identifiant : « categorie » ouvre la liste');
select is(
  public.vitrine_translation_state('f1000000-0000-4000-8000-000000001500')
    #>> '{cibles,3,cible_type}',
  'settings',
  '… et « settings » la ferme — quatre cibles, une par niveau');


-- ── 15b. LES TROIS VALEURS AJOUTÉES, LES CINQ LIGNES D'UN COUP ──
--
-- UNE assertion et non quinze : l'écran est un tableau, et un échec doit montrer
-- le tableau. Quinze `is()` auraient révélé la première cellule fausse et caché
-- les quatorze autres — c'est précisément ce qui rend une régression de forme
-- coûteuse à diagnostiquer.

select is(
  (select string_agg(
     (cb ->> 'cible_type') || ' [' || (cb ->> 'libelle') || '] '
       || (ch ->> 'champ') || ' = ' || (ch ->> 'etat')
       || ' | fr: ' || coalesce(ch ->> 'texte_source', '(vide)')
       || ' | en: ' || coalesce(ch ->> 'texte_traduit', '(vide)'),
     E'\n' order by cb ->> 'cible_type', cb ->> 'cible_id', ch ->> 'champ')
     from jsonb_array_elements(
            public.vitrine_translation_state(
              'f1000000-0000-4000-8000-000000001500') -> 'cibles') cb,
          lateral jsonb_array_elements(cb -> 'champs') ch),
  'categorie [Desserts] nom = absent | fr: Desserts | en: (vide)' || E'\n' ||
  'item [Tarte aux figues] description = absent | fr: Pâte brisée, miel de châtaignier. | en: (vide)' || E'\n' ||
  'item [Tarte aux figues] nom = frais | fr: Tarte aux figues | en: Fig tart' || E'\n' ||
  'menu [Carte de saison] nom = perime | fr: Carte de saison | en: Seasonal menu' || E'\n' ||
  'settings [Réglages] accroche = frais | fr: Notre table du marché. | en: Our market table.',
  'l''écran reçoit tout en UN appel : libellé lisible par cible, français courant par champ, anglais stocké s''il existe — et les réglages, qui n''ont pas de titre, s''appellent « Réglages »');

-- LE PÉRIMÉ GARDE SON ANGLAIS, et c'est la raison d'être de la conservation
-- décidée en L11 (« elle n'est pas effacée pour autant »). La ligne du dessus le
-- montre déjà ; celle-ci le NOMME, parce que c'est la propriété qu'une
-- réécriture distraite ferait disparaître en croyant simplifier — servir `null`
-- dès que l'état n'est pas `frais` semble propre et rend la conservation
-- inutile : une périmée se retouche, elle ne se réécrit pas.
select isnt(
  (select ch -> 'texte_traduit'
     from jsonb_array_elements(
            public.vitrine_translation_state(
              'f1000000-0000-4000-8000-000000001500') -> 'cibles') cb,
          lateral jsonb_array_elements(cb -> 'champs') ch
    where cb ->> 'cible_type' = 'menu'),
  'null'::jsonb,
  'une traduction PÉRIMÉE sort quand même : le commerçant la retouche, il ne la réécrit pas');

-- LE FRANÇAIS RENDU EST LE COURANT, PAS CELUI D'ALORS. Sur un champ périmé
-- c'est tout l'enjeu : montrer le texte d'avant la correction aurait fait
-- retraduire le mauvais.
update public.vitrine_menus
   set nom = 'Carte de printemps'
 where id = 'f1000000-0000-4000-8000-000000001502';

select is(
  (select ch ->> 'texte_source'
     from jsonb_array_elements(
            public.vitrine_translation_state(
              'f1000000-0000-4000-8000-000000001500') -> 'cibles') cb,
          lateral jsonb_array_elements(cb -> 'champs') ch
    where cb ->> 'cible_type' = 'menu'),
  'Carte de printemps',
  'le français rendu est le COURANT — celui qui vient de périmer la traduction, pas celui qu''elle traduisait');

select is(
  (select cb ->> 'libelle'
     from jsonb_array_elements(
            public.vitrine_translation_state(
              'f1000000-0000-4000-8000-000000001500') -> 'cibles') cb
    where cb ->> 'cible_type' = 'menu'),
  'Carte de printemps',
  '… et le libellé suit le renommage : il est LU dans la table, il n''est pas figé à la traduction');

-- LE RÉSUMÉ, AVANT TOUT RETRAIT : cinq champs, deux frais, un périmé, deux
-- absents. Il est chiffré ici pour que la section 15d puisse prouver qu'il BOUGE.
select is(
  public.vitrine_translation_state('f1000000-0000-4000-8000-000000001500')
    #>> '{resume,total_champs_traduisibles}',
  '5',
  'cinq champs traduisibles : les deux colonnes NULLES des réglages ne comptent toujours pas, et elles ne sortent pas non plus en cible');
select is(
  public.vitrine_translation_state('f1000000-0000-4000-8000-000000001500')
    #>> '{resume,traduits_frais}',
  '2',
  '… deux sont frais');
select is(
  public.vitrine_translation_state('f1000000-0000-4000-8000-000000001500')
    #>> '{resume,perimes}',
  '1',
  '… un est périmé');
select is(
  public.vitrine_translation_state('f1000000-0000-4000-8000-000000001500')
    #>> '{resume,manquants}',
  '2',
  '… et deux n''ont jamais été traduits');


-- ── 15c. LA JOINTURE NE PERD PERSONNE — la règle, pas la fixture ──
--
-- `vitrine_champs_traduisibles` décide QUELS champs existent ;
-- `vitrine_translation_state` leur colle leur texte par une SECONDE énumération
-- des mêmes colonnes. Deux listes qui doivent rester d'accord, et le désaccord
-- est silencieux : un sixième champ traduisible ajouté à la première sans être
-- ajouté à la seconde sortirait avec un français nul — l'écran demanderait de
-- traduire une ligne sans montrer quoi, et le compteur ne bougerait pas.
--
-- La règle balaie TOUTES les vitrines de la base, pas la fixture : sur base
-- semée elle passe sur `e2e-comptoir` et `e2e-traduit`, sur base vide sur les
-- fixtures `tap-*` de ce fichier. L'échec NOMME la vitrine, la cible et le
-- champ fautifs.
select is(
  (select coalesce(string_agg(
     s.slug || '.' || (cb ->> 'cible_type') || '.' || (ch ->> 'champ'), ', '
     order by s.slug, cb ->> 'cible_type', ch ->> 'champ'), '')
     from public.vitrine_settings s
     cross join lateral jsonb_array_elements(
       public.vitrine_translation_state(s.organization_id) -> 'cibles') cb
     cross join lateral jsonb_array_elements(cb -> 'champs') ch
    where ch -> 'texte_source' = 'null'::jsonb
       or cb -> 'libelle' = 'null'::jsonb),
  '',
  'aucun champ traduisible ne sort sans son français, aucune cible sans son libellé — les deux énumérations de colonnes restent d''accord');

-- CONTRÔLE DE PORTÉE, même raison que les 110 tables de `security_acl` : sans
-- lui, la règle ci-dessus serait verte sur un ensemble vide le jour où la
-- jointure se casserait en silence. VINGT-TROIS champs mesurés sur base VIDE —
-- c'est le plancher, la base semée en compte quarante-sept.
select cmp_ok(
  (select count(*)::int
     from public.vitrine_settings s
     cross join lateral jsonb_array_elements(
       public.vitrine_translation_state(s.organization_id) -> 'cibles') cb
     cross join lateral jsonb_array_elements(cb -> 'champs') ch),
  '>=', 23,
  'la règle porte bien sur les vingt-trois champs traduisibles des vitrines, pas sur un ensemble vide');


-- ── 15d. LE RETRAIT — ce qu'il fait, et ce qu'il refait ──
--
-- POURQUOI CETTE PORTE EXISTE : sans elle, une traduction posée était servie
-- pour toujours. Un nom propre traduit par erreur (« Kouign-amann » devenu autre
-- chose), une accroche dont l'anglais ne rend pas le ton : la seule issue était
-- d'écrire l'anglais IDENTIQUE au français, ce qui gonfle la couverture d'un
-- champ qui n'est pas traduit. Retirer la ligne fait la bonne chose : le champ
-- redevient « absent », le compteur baisse honnêtement, et la page publique sert
-- le français POUR CE CHAMP — ce que `vitrine_cartes_json` sait faire depuis
-- L11 sans qu'une ligne de code ait à changer.

-- « EN » ET « en » SONT LA MÊME LIGNE. Le retrait est envoyé en majuscules et il
-- trouve la traduction posée en minuscules : sans la normalisation, une
-- traduction serait ineffaçable par un appelant qui n'écrit pas la casse de
-- celui qui l'a posée.
select is(public.delete_vitrine_translation(
  'f1000000-0000-4000-8000-000000001500', 'settings',
  'f1000000-0000-4000-8000-000000001501', 'EN', 'accroche',
  'f1000000-0000-4000-8000-000000001505') ->> 'deleted', 'true',
  'le retrait enlève la traduction — et « EN » désigne bien la ligne posée en « en »');

select ok(
  not exists (
    select 1 from public.vitrine_translations t
     where t.organization_id = 'f1000000-0000-4000-8000-000000001500'
       and t.cible_type = 'settings'
       and t.champ = 'accroche'),
  '… la LIGNE a disparu de la table : ce n''est pas un drapeau, c''est un retrait');

select is(
  (select ch ->> 'etat'
     from jsonb_array_elements(
            public.vitrine_translation_state(
              'f1000000-0000-4000-8000-000000001500') -> 'cibles') cb,
          lateral jsonb_array_elements(cb -> 'champs') ch
    where cb ->> 'cible_type' = 'settings'),
  'absent',
  '… l''état repasse à « absent » : le champ redevient à traduire, il n''est pas perdu');

select is(
  (select ch ->> 'texte_source'
     from jsonb_array_elements(
            public.vitrine_translation_state(
              'f1000000-0000-4000-8000-000000001500') -> 'cibles') cb,
          lateral jsonb_array_elements(cb -> 'champs') ch
    where cb ->> 'cible_type' = 'settings'),
  'Notre table du marché.',
  '… et le FRANÇAIS reste : c''est la référence, elle n''a jamais vécu dans le calque');

select is(
  public.vitrine_translation_state('f1000000-0000-4000-8000-000000001500')
    #>> '{resume,manquants}',
  '3',
  'le résumé bouge : deux manquants deviennent trois, la couverture baisse HONNÊTEMENT');
select is(
  public.vitrine_translation_state('f1000000-0000-4000-8000-000000001500')
    #>> '{resume,total_champs_traduisibles}',
  '5',
  '… et le DÉNOMINATEUR ne bouge pas : retirer une traduction ne retire pas un champ à traduire');

-- LE JOURNAL COMPTE LE GESTE, symétriquement à `vitrine.translation_set`.
select is(
  (select count(*)::bigint from public.audit_logs a
    where a.organization_id = 'f1000000-0000-4000-8000-000000001500'
      and a.action = 'vitrine.translation_removed'),
  1::bigint,
  'le retrait laisse UNE ligne de journal : savoir quand un anglais a cessé d''être servi vaut autant que savoir quand il a été posé');

-- LE JOURNAL NE CONTIENT PAS LE TEXTE RETIRÉ. Un journal n'est pas une
-- corbeille : l'y recopier ferait du journal d'audit le seul endroit où survit
-- un contenu que le commerçant vient précisément de retirer.
select ok(
  not exists (
    select 1 from public.audit_logs a
     where a.organization_id = 'f1000000-0000-4000-8000-000000001500'
       and a.action = 'vitrine.translation_removed'
       and a.metadata::text like '%market table%'),
  '… et elle ne contient PAS le texte retiré : un journal n''est pas une corbeille');

-- L'IDEMPOTENCE. Un double-clic, un rejeu d'action serveur, un pipeline qui
-- repasse : le second retrait doit rendre le même succès, sans lever et sans
-- journaliser. Le journal compte les GESTES, pas les non-gestes.
select is(public.delete_vitrine_translation(
  'f1000000-0000-4000-8000-000000001500', 'settings',
  'f1000000-0000-4000-8000-000000001501', 'en', 'accroche',
  'f1000000-0000-4000-8000-000000001505') ->> 'state', 'ok',
  'retirer une traduction ABSENTE est un SUCCÈS : un double-clic ne doit pas afficher une erreur au commerçant');

select is(public.delete_vitrine_translation(
  'f1000000-0000-4000-8000-000000001500', 'settings',
  'f1000000-0000-4000-8000-000000001501', 'en', 'accroche',
  'f1000000-0000-4000-8000-000000001505') ->> 'deleted', 'false',
  '… et il dit honnêtement qu''il n''a rien retiré');

select is(
  (select count(*)::bigint from public.audit_logs a
    where a.organization_id = 'f1000000-0000-4000-8000-000000001500'
      and a.action = 'vitrine.translation_removed'),
  1::bigint,
  '… sans écrire une seconde ligne de journal : le journal compte les gestes, pas les non-gestes');

-- LES REFUS NOMMÉS, LES MÊMES QU'À L'UPSERT. Une divergence de vocabulaire entre
-- les deux portes obligerait l'appelant à écrire deux tables de correspondance
-- pour la même famille d'erreurs.
select is(public.delete_vitrine_translation(
  'f1000000-0000-4000-8000-000000001500', 'carte',
  'f1000000-0000-4000-8000-000000001502', 'en', 'nom',
  'f1000000-0000-4000-8000-000000001505') ->> 'state', 'invalid_cible',
  'un type de cible hors des quatre niveaux est refusé sous son propre mot, comme à l''écriture');

select is(public.delete_vitrine_translation(
  'f1000000-0000-4000-8000-000000001500', 'menu',
  'f1000000-0000-4000-8000-000000001502', 'fr', 'nom',
  'f1000000-0000-4000-8000-000000001505') ->> 'state', 'invalid_lang',
  'le français n''est pas dans le calque : il n''y a rien à en retirer');

select is(public.delete_vitrine_translation(
  'f1000000-0000-4000-8000-000000001500', 'menu',
  'f1000000-0000-4000-8000-000000001502', 'en', 'description',
  'f1000000-0000-4000-8000-000000001505') ->> 'state', 'invalid_champ',
  'une carte n''a pas de description : le couplage type↔champ refuse AUSSI au retrait, plutôt que de rendre un « rien à retirer » rassurant');


-- ── 15e. LE RETRAIT NE FRANCHIT PAS LA FRONTIÈRE, ET IL N'APPREND RIEN ──
--
-- `cible_id` ne porte toujours aucune FK (quatre tables cibles) : rien dans le
-- schéma n'empêche L15 d'effacer la traduction de E. C'est la RPC qui le refuse,
-- par la même jointure PAR TYPE que l'upsert — ce qu'on ne peut pas écrire chez
-- le voisin, on ne doit pas pouvoir l'effacer.
--
-- ET LE REFUS EST INDISTINCT : même code, même message pour « la cible est à
-- quelqu'un d'autre » et « la cible n'existe pas ». Les distinguer aurait fait
-- de cette RPC un oracle sur les identifiants d'autrui — il aurait suffi de
-- balayer des UUID pour savoir lesquels existent ailleurs.

select throws_ok(
  $$select public.delete_vitrine_translation(
      'f1000000-0000-4000-8000-000000001500', 'item',
      'f1000000-0000-4000-8000-000000000701', 'en', 'nom',
      'f1000000-0000-4000-8000-000000001505')$$,
  '42501', 'not authorized',
  'effacer la traduction d''un AUTRE locataire est refusé — la FK ne peut pas le refuser, la RPC le fait');

select throws_ok(
  $$select public.delete_vitrine_translation(
      'f1000000-0000-4000-8000-000000001500', 'item',
      'f1000000-0000-4000-8000-0000000019ff', 'en', 'nom',
      'f1000000-0000-4000-8000-000000001505')$$,
  '42501', 'not authorized',
  '… et une cible INEXISTANTE rend le MÊME refus, au message près : sans quoi le retrait deviendrait un oracle sur les identifiants d''autrui');

-- LA TRADUCTION DU VOISIN EST INTACTE. Le refus n'est pas cosmétique : rien
-- n'a été effacé avant qu'il ne tombe.
select ok(
  exists (
    select 1 from public.vitrine_translations t
     where t.organization_id = 'f1000000-0000-4000-8000-00000000000e'
       and t.cible_id = 'f1000000-0000-4000-8000-000000000701'
       and t.champ = 'nom'),
  'la traduction du voisin est TOUJOURS LÀ : le refus tombe avant le delete, pas après');


-- ── 15f. LES ACL DU RETRAIT — aussi fermé que l'écriture ─────
--
-- Ces assertions doublent les règles catalogue de `security_acl.test.sql`, et
-- c'est voulu : celles-là gardent le schéma entier, celles-ci gardent CE lot.

select ok(has_function_privilege('service_role', 'public.delete_vitrine_translation(uuid,text,uuid,text,text,uuid)', 'EXECUTE'),
  'seul le serveur retire une traduction');
select ok(not has_function_privilege('authenticated', 'public.delete_vitrine_translation(uuid,text,uuid,text,text,uuid)', 'EXECUTE'),
  'le marchand ne contourne pas l''action serveur pour effacer de l''anglais : la vérification d''appartenance est DANS la RPC');
select ok(not has_function_privilege('anon', 'public.delete_vitrine_translation(uuid,text,uuid,text,text,uuid)', 'EXECUTE'),
  'anon n''efface aucune traduction');

-- LA SUPPRESSION EN DIRECT RESTE FERMÉE, et ce n'est pas la RLS qui la refuse :
-- c'est l'absence de privilège, qui mord AVANT toute policy. Sans cette ligne,
-- la RPC serait une porte de plus à côté d'une porte ouverte.
select ok(not has_table_privilege('authenticated', 'public.vitrine_translations', 'DELETE'),
  'le commerçant ne supprime pas une traduction en direct : la seule porte vérifie l''appartenance de la cible');
select ok(not has_table_privilege('anon', 'public.vitrine_translations', 'DELETE'),
  'anon non plus, évidemment');

-- UNE SEULE `delete_vitrine_translation` EXISTE (leçon L3) : un `create or
-- replace` qui changerait un paramètre ne remplacerait rien, il créerait une
-- SURCHARGE — et l'appel à cinq arguments de l'action serveur deviendrait
-- ambigu, « function is not unique », à l'exécution seulement.
select is(
  (select count(*)::bigint from pg_proc p
     join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'delete_vitrine_translation'),
  1::bigint,
  'une seule `delete_vitrine_translation` existe : aucune surcharge ne rend l''appel ambigu');

-- … ET UNE SEULE `vitrine_translation_state`, pour la même raison : ce lot la
-- redéfinit par `create or replace` à signature IDENTIQUE, et c'est ce qui lui
-- conserve ses `grant` sans avoir à les réécrire.
select is(
  (select count(*)::bigint from pg_proc p
     join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'vitrine_translation_state'),
  1::bigint,
  '… et une seule `vitrine_translation_state` : la redéfinition de L15 garde la signature de L11, donc ses privilèges');


-- ── 15g. LA VERSION VUE — la fraîcheur se décide à l'AFFICHAGE ──
--
-- `upsert_vitrine_translation` exige la version du texte français que la
-- traduction traduit. SANS la clé `version`, l'action serveur n'aurait qu'un
-- choix — relire `updated_at` au moment de l'envoi — et elle enregistrerait la
-- version d'ARRIVÉE. Le trou est étroit et parfaitement atteignable : le
-- commerçant ouvre l'écran, part traduire, et pendant ce temps le français bouge
-- (autre onglet, associé, import de carte). Son anglais traduit l'ANCIEN texte
-- et il est enregistré FRAIS — `version_source >= version_courante` est vrai,
-- donc rien ne le périmera jamais et la page publique sert cet anglais faux
-- indéfiniment. Le pire cas d'un calque n'est pas le champ manquant, c'est le
-- champ faux qui se croit bon.
--
-- Les deux assertions qui suivent tiennent la clé ; les quatre d'après jouent le
-- SCÉNARIO COMPLET, qui est la seule preuve qui vaille : lire, laisser le
-- français bouger, envoyer la version vue, constater que la traduction est
-- périmée D'EMBLÉE.

select is(
  (select (cb ->> 'version')::timestamptz
     from jsonb_array_elements(
            public.vitrine_translation_state(
              'f1000000-0000-4000-8000-000000001500') -> 'cibles') cb
    where cb ->> 'cible_type' = 'item'),
  (select i.updated_at from public.vitrine_items i
    where i.id = 'f1000000-0000-4000-8000-000000001504'),
  'la version rendue est l''`updated_at` COURANT de la cible — et elle survit à l''aller-retour par JSON au microseconde près, sans quoi l''upsert la recevrait décalée et périmerait tout');

-- UNE SEULE VERSION POUR LES DEUX CHAMPS DE LA FICHE, et c'est la portée réelle
-- de la clé : `touch_updated_at` avance l'`updated_at` de la LIGNE. Une version
-- par champ aurait laissé croire à une granularité que la base n'a pas.
select is(
  (select count(distinct cb ->> 'version')::bigint
     from jsonb_array_elements(
            public.vitrine_translation_state(
              'f1000000-0000-4000-8000-000000001500') -> 'cibles') cb
    where cb ->> 'cible_type' = 'item'),
  1::bigint,
  '… et la fiche n''en porte qu''UNE pour son nom et sa description : la clé de version porte sur la LIGNE, pas sur le champ');

-- ── LE SCÉNARIO, EN QUATRE TEMPS ──
-- 1. L'écran lit l'état et EMBARQUE la version de la rubrique dans son
--    formulaire. `set_config` tient lieu de champ caché : la valeur est celle
--    qui SORT de la RPC, pas un `updated_at` relu à côté — c'est tout l'objet
--    de la preuve.
select set_config('tap.l15_version_vue',
  (select cb ->> 'version'
     from jsonb_array_elements(
            public.vitrine_translation_state(
              'f1000000-0000-4000-8000-000000001500') -> 'cibles') cb
    where cb ->> 'cible_type' = 'categorie'), true);

select is(
  (select ch ->> 'etat'
     from jsonb_array_elements(
            public.vitrine_translation_state(
              'f1000000-0000-4000-8000-000000001500') -> 'cibles') cb,
          lateral jsonb_array_elements(cb -> 'champs') ch
    where cb ->> 'cible_type' = 'categorie'),
  'absent',
  'la rubrique part d''un état ABSENT : ce qui suit ne peut donc pas être un reste de la section précédente');

-- 2. LE FRANÇAIS BOUGE pendant que le commerçant traduit. Le trigger avance
--    `updated_at` — c'est le geste qui rend la version vue OBSOLÈTE.
update public.vitrine_categories
   set nom = 'Desserts et douceurs'
 where id = 'f1000000-0000-4000-8000-000000001503';

-- 3. LE FORMULAIRE REVIENT, avec la version VUE et une traduction de l'ANCIEN
--    nom. L'upsert l'accepte sans protester : ce n'est pas son rôle de refuser
--    une version ancienne — L11 l'a écrit noir sur blanc (« c'est la lecture qui
--    l'ignorera »).
select is(public.upsert_vitrine_translation(
  'f1000000-0000-4000-8000-000000001500', 'categorie',
  'f1000000-0000-4000-8000-000000001503', 'en', 'nom', 'Desserts',
  current_setting('tap.l15_version_vue')::timestamptz,
  'f1000000-0000-4000-8000-000000001505') ->> 'state', 'ok',
  'la traduction de l''ANCIEN nom s''enregistre avec la version VUE — l''upsert n''a pas à juger, il enregistre ce que l''écran avait sous les yeux');

-- 4. ET ELLE ATTERRIT DÉJÀ PÉRIMÉE. C'est toute la démonstration : sans la clé,
--    l'action serveur aurait relu `updated_at` à cet instant et cette même
--    traduction serait « fraîche » — un anglais qui traduit « Desserts » servi
--    sous « Desserts et douceurs », que RIEN n'aurait jamais périmé.
select is(
  (select ch ->> 'etat'
     from jsonb_array_elements(
            public.vitrine_translation_state(
              'f1000000-0000-4000-8000-000000001500') -> 'cibles') cb,
          lateral jsonb_array_elements(cb -> 'champs') ch
    where cb ->> 'cible_type' = 'categorie'),
  'perime',
  'la traduction saisie sur un texte modifié entre-temps atterrit DÉJÀ PÉRIMÉE — honnête par construction, sans verrou ni relecture dans l''action serveur');

select is(
  (select ch ->> 'texte_source'
     from jsonb_array_elements(
            public.vitrine_translation_state(
              'f1000000-0000-4000-8000-000000001500') -> 'cibles') cb,
          lateral jsonb_array_elements(cb -> 'champs') ch
    where cb ->> 'cible_type' = 'categorie'),
  'Desserts et douceurs',
  '… et l''écran la ressort « à revoir » en face du français COURANT : le commerçant voit exactement ce qui a changé sous lui');


-- ── 15h. LA BORNE DE VERSION — point M1 de la revue L15 ──────
--
-- §15g vient de prouver que la version VUE est ce qu'il faut faire voyager. Elle
-- voyage donc dans le formulaire, c'est-à-dire chez le client — et ce que le
-- client tient, il peut l'inventer. Une version POSTÉRIEURE à l'`updated_at` de
-- la cible rendait `version_source >= version_courante` vrai POUR TOUJOURS :
-- l'anglais correspondant ne pouvait plus jamais périmer, quoi qu'il advienne du
-- français. C'est le pire cas nommé par L11 — « le champ faux qui se croit bon » —
-- mais rendu définitif, et donc invisible : aucun écran ne signale un champ qui
-- se déclare frais.
--
-- LA BORNE EST UNILATÉRALE, et les deux moitiés comptent autant :
--   * au-dessus de la réalité, la version est ramenée à l'`updated_at` de la
--     cible — le geste passe, l'éternité non ;
--   * en dessous, RIEN NE CHANGE, et c'est ce que §15g prouve déjà sans qu'une
--     ligne y ait bougé : une version ancienne est le cas HONNÊTE, celui que L11
--     décrit, et la remonter aurait détruit la propriété qu'on veut garder.

-- 1. LE GESTE PASSE. Refuser aurait transformé une horloge décalée de trois
--    secondes — le client n'est pas le serveur — en échec d'enregistrement
--    affiché au commerçant, pour un texte qu'il vient d'écrire juste.
select is(public.upsert_vitrine_translation(
  'f1000000-0000-4000-8000-000000001500', 'item',
  'f1000000-0000-4000-8000-000000001504', 'en', 'description',
  'Shortcrust pastry, chestnut honey.',
  '9999-12-31T23:59:59+00'::timestamptz,
  'f1000000-0000-4000-8000-000000001505') ->> 'state', 'ok',
  'une version FUTURE ne fait pas échouer l''enregistrement : la borne retire un privilège, elle ne refuse pas un geste');

-- 2. … ET LA LIGNE STOCKÉE PORTE LA RÉALITÉ. C'est M1 en une assertion : ce qui
--    est écrit dans la table n'est plus ce que l'appelant a demandé, c'est le
--    minimum entre sa demande et l'`updated_at` de la cible.
select is(
  (select t.version_source from public.vitrine_translations t
    where t.organization_id = 'f1000000-0000-4000-8000-000000001500'
      and t.cible_type = 'item'
      and t.cible_id = 'f1000000-0000-4000-8000-000000001504'
      and t.champ = 'description'),
  (select i.updated_at from public.vitrine_items i
    where i.id = 'f1000000-0000-4000-8000-000000001504'),
  '… mais la ligne STOCKÉE porte l''`updated_at` RÉEL de la cible et non le 9999-12-31 reçu : la version posée est bornée par la réalité');

-- 3. FRAÎCHE MAINTENANT, et c'est juste : elle traduit bien le texte courant.
--    La borne ne punit pas, elle ramène.
select is(
  (select ch ->> 'etat'
     from jsonb_array_elements(
            public.vitrine_translation_state(
              'f1000000-0000-4000-8000-000000001500') -> 'cibles') cb,
          lateral jsonb_array_elements(cb -> 'champs') ch
    where cb ->> 'cible_type' = 'item' and ch ->> 'champ' = 'description'),
  'frais',
  '… elle est FRAÎCHE dans l''instant, ce qui est exact : elle traduit bien le français courant');

-- 4. LE NON-GESTE SE MESURE SUR LA VERSION ÉCRITE, PAS SUR CELLE REÇUE. Sans
--    cela, un pipeline qui renvoie inlassablement sa version future rendrait
--    `changed: true` à chaque passage et noierait le journal — pour une table qui
--    n'a pas bougé d'un octet.
select is(public.upsert_vitrine_translation(
  'f1000000-0000-4000-8000-000000001500', 'item',
  'f1000000-0000-4000-8000-000000001504', 'en', 'description',
  'Shortcrust pastry, chestnut honey.',
  '9999-12-31T23:59:59+00'::timestamptz,
  'f1000000-0000-4000-8000-000000001505') ->> 'changed', 'false',
  'renvoyer DEUX FOIS la même version future ne change rien : le non-geste se compare à ce qui SERAIT écrit');

select is(
  (select pg_catalog.count(*)::bigint from public.audit_logs a
    where a.organization_id = 'f1000000-0000-4000-8000-000000001500'
      and a.action = 'vitrine.translation_set'
      and a.metadata ->> 'champ' = 'description'),
  1::bigint,
  '… et n''écrit pas une seconde ligne de journal');

-- 5. LE JOURNAL COMMENTE LA TABLE, IL NE RECOPIE PAS LA DEMANDE. Y laisser le
--    9999-12-31 aurait fait diverger la trace d'audit de la ligne qu'elle décrit.
select is(
  (select (a.metadata ->> 'version_source')::timestamptz from public.audit_logs a
    where a.organization_id = 'f1000000-0000-4000-8000-000000001500'
      and a.action = 'vitrine.translation_set'
      and a.metadata ->> 'champ' = 'description'),
  (select i.updated_at from public.vitrine_items i
    where i.id = 'f1000000-0000-4000-8000-000000001504'),
  '… et le journal porte la version ÉCRITE, pas celle reçue : il commente la table, il ne recopie pas la demande');

-- 6. ET ELLE PÉRIT À LA PREMIÈRE ÉDITION DU FRANÇAIS. Toute la démonstration est
--    là : SANS la borne, `version_source` valait 9999-12-31, donc
--    `version_source >= version_courante` restait vrai après CETTE modification
--    et après toutes les suivantes — cet anglais aurait été servi indéfiniment
--    sur un plat dont la description a changé.
update public.vitrine_items
   set description = 'Pâte brisée, miel de châtaignier et thym frais.'
 where id = 'f1000000-0000-4000-8000-000000001504';

select is(
  (select ch ->> 'etat'
     from jsonb_array_elements(
            public.vitrine_translation_state(
              'f1000000-0000-4000-8000-000000001500') -> 'cibles') cb,
          lateral jsonb_array_elements(cb -> 'champs') ch
    where cb ->> 'cible_type' = 'item' and ch ->> 'champ' = 'description'),
  'perime',
  'et elle PÉRIT à la première édition du français : l''invariant « honnête par construction » ne dépend plus du seul champ que le client tient');

-- 7. LA BORNE NE REMONTE RIEN. `least` et non « la version de la cible » : une
--    version antérieure est conservée TELLE QUELLE, sans quoi toute traduction
--    naîtrait fraîche et §15g deviendrait faux.
select is(public.upsert_vitrine_translation(
  'f1000000-0000-4000-8000-000000001500', 'menu',
  'f1000000-0000-4000-8000-000000001502', 'en', 'nom', 'Seasonal menu',
  (select m.updated_at - interval '2 hours' from public.vitrine_menus m
    where m.id = 'f1000000-0000-4000-8000-000000001502'),
  'f1000000-0000-4000-8000-000000001505') ->> 'state', 'ok',
  'une version ANTÉRIEURE s''enregistre toujours sans protester');

select is(
  (select t.version_source from public.vitrine_translations t
    where t.organization_id = 'f1000000-0000-4000-8000-000000001500'
      and t.cible_type = 'menu'
      and t.champ = 'nom'),
  (select m.updated_at - interval '2 hours' from public.vitrine_menus m
    where m.id = 'f1000000-0000-4000-8000-000000001502'),
  '… et elle est stockée TELLE QUELLE : la borne est unilatérale, elle ne remonte jamais une version honnête vers la fraîcheur');


-- ── 15i. L'ACTEUR — point M2 de la revue L15 ─────────────────
--
-- Les deux portes du calque journalisaient `system` faute de recevoir un acteur.
-- « Qui a écrit ça sur ma carte » est la question pour laquelle ce journal
-- existe, et « qui a retiré l'anglais de ma carte » est pire encore : le retrait
-- ne laisse, par construction, AUCUNE trace dans la table — le journal est la
-- seule mémoire du geste.
--
-- ET UN `p_actor` NON VÉRIFIÉ AURAIT ÉTÉ PIRE QUE PAS D'ACTEUR : une ligne
-- d'audit qui recopie ce que l'appelant déclare ne prouve rien, et elle est plus
-- dangereuse qu'un journal vide parce qu'on la croit. L'acteur est donc tranché
-- EN SQL, membre `owner|editor` de l'organisation VISÉE.
--
-- LES QUATRE REFUS RENDENT LE MÊME 42501 — acteur absent, caissier, membre d'une
-- AUTRE organisation, organisation inconnue — et le même que « cible d'autrui ».
-- Distinguer ferait de ces RPC un oracle sur les équipes et les identifiants des
-- autres locataires.

-- LE JOURNAL PORTE L'ACTEUR, SUR LES DEUX ACTIONS. `string_agg(distinct)` et non
-- un `limit 1` : une seule ligne restée à « system » ferait rougir celle-ci, là
-- où une assertion sur une ligne au hasard serait verte sur les autres.
select is(
  (select pg_catalog.string_agg(distinct a.actor, ',')
     from public.audit_logs a
    where a.organization_id = 'f1000000-0000-4000-8000-000000001500'
      and a.action in ('vitrine.translation_set', 'vitrine.translation_removed')),
  'f1000000-0000-4000-8000-000000001505',
  'TOUTES les lignes d''audit du calque — poses ET retraits — portent l''ÉDITEUR qui a joué le geste : plus une seule ne dit « system »');

-- LE CAISSIER EST MEMBRE, ET IL EST REFUSÉ, SUR LES DEUX PORTES. C'est la
-- différence entre « appartenance » et « rôle » : sans lui, une garde écrite
-- `exists (… where user_id = …)` sans le `role in (…)` serait verte partout.
select throws_ok(
  $$select public.upsert_vitrine_translation(
      'f1000000-0000-4000-8000-000000001500', 'menu',
      'f1000000-0000-4000-8000-000000001502', 'en', 'nom', 'Cashier menu',
      now(), 'f1000000-0000-4000-8000-000000001506')$$,
  '42501', 'not authorized',
  'le CAISSIER est refusé à l''écriture : publier de l''anglais sous l''enseigne n''est pas un geste de comptoir, motif set_vitrine_slug');

select throws_ok(
  $$select public.delete_vitrine_translation(
      'f1000000-0000-4000-8000-000000001500', 'menu',
      'f1000000-0000-4000-8000-000000001502', 'en', 'nom',
      'f1000000-0000-4000-8000-000000001506')$$,
  '42501', 'not authorized',
  '… et au retrait : une divergence entre les deux portes serait un trou — ce qu''on ne peut pas écrire, on ne doit pas pouvoir l''effacer');

-- LE PROPRIÉTAIRE D'UNE AUTRE ORGANISATION. Il est `owner`, donc son RÔLE
-- suffirait ; ce qui manque est l'appartenance à CETTE organisation.
select throws_ok(
  $$select public.upsert_vitrine_translation(
      'f1000000-0000-4000-8000-000000001500', 'menu',
      'f1000000-0000-4000-8000-000000001502', 'en', 'nom', 'Neighbour menu',
      now(), 'f1000000-0000-4000-8000-000000000f01')$$,
  '42501', 'not authorized',
  'le propriétaire d''une AUTRE organisation est refusé : la garde lit l''appartenance, pas seulement le rôle');

select throws_ok(
  $$select public.delete_vitrine_translation(
      'f1000000-0000-4000-8000-000000001500', 'menu',
      'f1000000-0000-4000-8000-000000001502', 'en', 'nom',
      'f1000000-0000-4000-8000-000000000f01')$$,
  '42501', 'not authorized',
  '… au retrait aussi, et sous le MÊME mot : distinguer ferait de ces RPC un oracle sur les équipes d''autrui');

select throws_ok(
  $$select public.upsert_vitrine_translation(
      'f1000000-0000-4000-8000-000000001500', 'menu',
      'f1000000-0000-4000-8000-000000001502', 'en', 'nom', 'Anonymous menu',
      now(), null)$$,
  '42501', 'not authorized',
  'un acteur ABSENT est refusé sous le même mot : il n''y a plus de chemin sans acteur depuis que les anciennes formes sont supprimées');

select throws_ok(
  $$select public.delete_vitrine_translation(
      'f1000000-0000-4000-8000-000000001500', 'menu',
      'f1000000-0000-4000-8000-000000001502', 'en', 'nom', null)$$,
  '42501', 'not authorized',
  '… et au retrait, sans quoi la seule mémoire d''un effacement redeviendrait anonyme');

-- AUCUN DES SIX REFUS N'A TOUCHÉ LA TABLE. Le refus tombe AVANT la première
-- écriture et avant le `delete` : sans cette ligne, une garde qui lèverait APRÈS
-- coup serait verte sur les six `throws_ok` ci-dessus.
select is(
  (select t.texte from public.vitrine_translations t
    where t.organization_id = 'f1000000-0000-4000-8000-000000001500'
      and t.cible_type = 'menu'
      and t.champ = 'nom'),
  'Seasonal menu',
  'aucun des six refus d''acteur n''a laissé de trace — ni écriture, ni effacement : le refus tombe avant la table');

-- UNE SEULE `upsert_vitrine_translation` (leçon L3). Sa signature a changé : un
-- `create or replace` n'aurait rien remplacé, il aurait SURCHARGÉ — et la forme
-- SANS acteur serait restée appelable par `service_role`, chemin oublié écrivant
-- « system » avec une version que personne ne borne. Le pendant pour le retrait
-- est en §15f, où vivent ses ACL.
select is(
  (select pg_catalog.count(*)::bigint from pg_proc p
     join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'upsert_vitrine_translation'),
  1::bigint,
  'une seule `upsert_vitrine_translation` existe : la forme sans acteur ni borne est SUPPRIMÉE, pas surchargée');



select * from finish();
rollback;
