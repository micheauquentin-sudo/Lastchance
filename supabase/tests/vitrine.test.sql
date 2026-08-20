-- ============================================================
-- LA VITRINE NE SORT QUE PUBLIÉE, ET SEULEMENT CHEZ SOI (VIT-1a, lot L10)
--
-- Ce que ce fichier prouve, et dans quel ordre :
--
--   1. LES VOCABULAIRES SONT DANS LE CATALOGUE VIVANT, ET ON LES COMPTE. Huit
--      badges, quatorze allergènes, sept polices, cinq blocs, trois styles de
--      cartes. Le compte est lu dans `pg_get_constraintdef` et dans `prosrc`,
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
select is(
  (select pg_catalog.count(*)::bigint
     from pg_proc p
     cross join lateral
       pg_catalog.regexp_matches(p.prosrc,
         '''(sans|elegant|impact|rounded|script|modern|mono)''', 'g') m
    where p.oid = 'public.is_valid_vitrine_theme(jsonb)'::regprocedure),
  7::bigint,
  'les sept polices de src/lib/fonts.ts sont recopiées dans le validateur de thème'
);

select is(
  (select pg_catalog.count(*)::bigint
     from pg_proc p
     cross join lateral
       pg_catalog.regexp_matches(p.prosrc,
         '''(accroche|histoire|cartes|horaires|social)''', 'g') m
    where p.oid = 'public.is_valid_vitrine_theme(jsonb)'::regprocedure),
  5::bigint,
  'les cinq blocs de la page d''accueil sont le vocabulaire fermé d''ordre_blocs'
);

select is(
  (select pg_catalog.count(*)::bigint
     from pg_proc p
     cross join lateral
       pg_catalog.regexp_matches(p.prosrc,
         '''(liste|grille|magazine)''', 'g') m
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

select ok(has_function_privilege('service_role', 'public.vitrine_public_state(text)', 'EXECUTE'),
  'seul le serveur rend l''état public d''une vitrine');
select ok(not has_function_privilege('anon', 'public.vitrine_public_state(text)', 'EXECUTE'),
  'anon n''appelle pas la RPC publique de vitrine directement');
select ok(not has_function_privilege('authenticated', 'public.set_vitrine_slug(uuid,text,text)', 'EXECUTE'),
  'le marchand ne contourne pas l''action serveur pour poser son adresse');
select ok(not has_function_privilege('service_role', 'public.vitrine_cartes_json(uuid,boolean)', 'EXECUTE'),
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

select * from finish();
rollback;
