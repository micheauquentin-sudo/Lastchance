-- ============================================================
-- VIT-4 — CONTENUS MIS EN AVANT, BEACON, SEGMENTS RÉSERVÉ/VENU
--
-- Ce que ce fichier prouve, et dans quel ordre :
--
--   1. LE CATALOGUE D'ABORD. Quatre fonctions, UNE entrée `pg_proc` chacune —
--      deux signatures ont changé dans ce lot, et un `create or replace` y
--      aurait créé une SURCHARGE au lieu de remplacer (42725 à chaque appel
--      resté à l'ancienne forme). L'ACL est vérifiée dans le CATALOGUE et jamais
--      par une tentative d'appel, qui ne distingue pas « refusé » de « cassé »
--      (ADR-082).
--   2. `vitrine_contenus` TIENT SA SPÉCIFICATION EN BASE. « Un à trois » n'est
--      pas une consigne d'écran : rang hors 1..3 refusé, deux contenus au même
--      rang refusés. Et l'adresse est close à `https` — `http:`, `javascript:`
--      et une adresse porteuse d'espace sont refusées par la même contrainte.
--   3. LA LECTURE EST D'ÉQUIPE, L'ÉCRITURE EST D'ÉDITEUR, et le caissier est le
--      contre-exemple qui distingue les deux : il LIT (c'est ce qui sépare cette
--      table des quatre autres tables vitrine_*, fermées au comptoir) et il
--      n'écrit pas. Le voisin ne voit rien, et il n'est pas cassé pour autant.
--   4. LE RENDU PUBLIC est ORDONNÉ PAR RANG, borné à trois, toujours présent —
--      même vide — et strictement cloisonné : la vitrine du voisin rend SES
--      contenus, jamais ceux du locataire d'à côté.
--   5. LE BEACON accepte `vitrine` et refuse un module inconnu ; la RPC résout
--      le slug vers `vitrine_settings.id` et compte. La branche manquante est le
--      défaut MUET que ce lot doit rendre impossible.
--   6. LES SEGMENTS RÉSERVÉ/VENU disent vrai sur les TROIS sources qui portent
--      un e-mail (réservation, file, offre de stock), la liste d'attente est
--      exclue, et — c'est la propriété centrale — AUCUN E-MAIL NOUVEAU ne sort
--      des deux RPC. `fantome@` a réservé sans jamais avoir joué ni s'être
--      abonné : il ne doit apparaître NULLE PART.
--   7. LA COUVERTURE DE TRADUCTION NE BOUGE PAS. Ni les portes de L13 ni les
--      contenus de ce lot n'entrent au dénominateur — la même arithmétique
--      appliquée à l'envers ferait tomber le sélecteur de langue de toute
--      vitrine traduite.
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
-- A : la vitrine de référence — publiée, droit `vitrine` vivant.
-- B : la VOISINE, servie elle aussi — sans quoi « le voisin ne voit rien » se
--     confondrait avec « le voisin n'a pas le module ».
-- C : NON PUBLIÉE, et pourtant porteuse de contenus : c'est la seule façon de
--     prouver que la garde de publication tient AVANT eux.
insert into public.organizations
  (id, name, slug, subscription_status, plan, timezone, data_retention_months)
values
  ('f4000000-0000-4000-8000-00000000000a', 'Social A', 'tap-l14-a',
   'active', 'starter', 'Europe/Paris', 6),
  ('f4000000-0000-4000-8000-00000000000b', 'Social B', 'tap-l14-b',
   'active', 'starter', 'Europe/Paris', 6),
  ('f4000000-0000-4000-8000-00000000000c', 'Social C', 'tap-l14-c',
   'active', 'starter', 'Europe/Paris', 6);

insert into public.organization_module_grants
  (organization_id, module, kind, source, starts_at, ends_at)
values
  ('f4000000-0000-4000-8000-00000000000a', 'vitrine', 'pass', 'backoffice',
   now() - interval '1 day', now() + interval '365 days'),
  ('f4000000-0000-4000-8000-00000000000b', 'vitrine', 'pass', 'backoffice',
   now() - interval '1 day', now() + interval '365 days'),
  ('f4000000-0000-4000-8000-00000000000c', 'vitrine', 'pass', 'backoffice',
   now() - interval '1 day', now() + interval '365 days');

insert into auth.users (id, email) values
  ('f4000000-0000-4000-8000-000000000f01', 'proprio-a@tap-l14.local'),
  ('f4000000-0000-4000-8000-000000000f02', 'editeur-a@tap-l14.local'),
  ('f4000000-0000-4000-8000-000000000f03', 'caissier-a@tap-l14.local'),
  ('f4000000-0000-4000-8000-000000000f04', 'proprio-b@tap-l14.local');

insert into public.organization_members (organization_id, user_id, role) values
  ('f4000000-0000-4000-8000-00000000000a',
   'f4000000-0000-4000-8000-000000000f01', 'owner'),
  ('f4000000-0000-4000-8000-00000000000a',
   'f4000000-0000-4000-8000-000000000f02', 'editor'),
  ('f4000000-0000-4000-8000-00000000000a',
   'f4000000-0000-4000-8000-000000000f03', 'cashier'),
  ('f4000000-0000-4000-8000-00000000000b',
   'f4000000-0000-4000-8000-000000000f04', 'owner');

insert into public.vitrine_settings (id, organization_id, slug, published) values
  ('f4000000-0000-4000-8000-000000000101',
   'f4000000-0000-4000-8000-00000000000a', 'tap-l14-social', true),
  ('f4000000-0000-4000-8000-000000000102',
   'f4000000-0000-4000-8000-00000000000b', 'tap-l14-voisin', true),
  ('f4000000-0000-4000-8000-000000000103',
   'f4000000-0000-4000-8000-00000000000c', 'tap-l14-brouillon', false);


-- ══ 1. LE CATALOGUE — UNE ENTRÉE PAR NOM, ET LES PORTES FERMÉES ══
--
-- Deux signatures ont changé dans ce lot (`customer_segment_matches` gagne deux
-- booléens, `org_segment_counts` et `org_customer_profiles_page` changent de
-- type de RETOUR). Pour la première, un `create or replace` aurait laissé
-- l'ancienne forme en place et rendu AMBIGU chaque appel resté à trois
-- arguments ; pour les deux autres, Postgres aurait refusé la migration (42P13).
-- Les trois cas se vérifient de la même façon : une entrée, pas deux.

select is(
  (select count(*)::int from pg_catalog.pg_proc p
     join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'customer_segment_matches'),
  1,
  'une seule entree pg_proc pour customer_segment_matches : l''ancienne forme a bien ete DROP');

select is(
  (select count(*)::int from pg_catalog.pg_proc p
     join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'org_segment_counts'),
  1,
  'une seule entree pg_proc pour org_segment_counts');

select is(
  (select count(*)::int from pg_catalog.pg_proc p
     join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'org_customer_profiles_page'),
  1,
  'une seule entree pg_proc pour org_customer_profiles_page');

select is(
  (select count(*)::int from pg_catalog.pg_proc p
     join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'org_customer_reserver_facts'),
  1,
  'une seule entree pg_proc pour org_customer_reserver_facts');

select is(
  (select count(*)::int from pg_catalog.pg_proc p
     join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'vitrine_public_state'),
  1,
  'une seule entree pg_proc pour vitrine_public_state : la signature n''a PAS bouge');

-- Les quatre fonctions figent leur `search_path`. La règle est gardée pour le
-- schéma entier par `search_path_invariant.test.sql` ; ici on garde CE lot.
select is(
  (select pg_catalog.array_to_string(p.proconfig, ',') from pg_catalog.pg_proc p
     join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'org_customer_reserver_facts'),
  'search_path=""',
  'org_customer_reserver_facts fige son search_path a la chaine vide');

select is(
  (select p.prosecdef from pg_catalog.pg_proc p
     join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'org_customer_reserver_facts'),
  true,
  'org_customer_reserver_facts est security definer');

-- RENDUE À PERSONNE, `service_role` COMPRIS. Appelée directement elle rendrait
-- la liste complète des e-mails ayant réservé chez un commerçant, sans aucune
-- garde : c'est le contraire de ce qu'elle sert. Ses deux appelantes sont
-- `security definer` et s'exécutent sous leur propriétaire.
select ok(not has_function_privilege('anon',
    'public.org_customer_reserver_facts(uuid)', 'execute'),
  'anon ne peut pas executer org_customer_reserver_facts');
select ok(not has_function_privilege('authenticated',
    'public.org_customer_reserver_facts(uuid)', 'execute'),
  'authenticated non plus');
select ok(not has_function_privilege('service_role',
    'public.org_customer_reserver_facts(uuid)', 'execute'),
  'service_role NON PLUS : elle rendrait la liste des e-mails ayant reserve, sans garde');

-- Les deux moitiés indissociables : une ACL NULLE vaut EXECUTE à PUBLIC par
-- défaut, et `aclexplode(null)` rend zéro ligne — sans la première assertion,
-- la seconde verdirait précisément dans le cas qu'elle doit attraper.
select isnt(
  (select p.proacl from pg_catalog.pg_proc p
     join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'org_customer_reserver_facts'),
  null,
  'l''ACL d''org_customer_reserver_facts est POSEE — une ACL nulle vaudrait EXECUTE a PUBLIC');
select is(
  (select count(*)::int
     from pg_catalog.pg_proc p
     join pg_catalog.pg_namespace n on n.oid = p.pronamespace
     cross join lateral pg_catalog.aclexplode(p.proacl) a
    where n.nspname = 'public'
      and p.proname = 'org_customer_reserver_facts'
      and a.grantee = 0),
  0,
  'PUBLIC ne porte aucun privilege sur org_customer_reserver_facts');

-- `customer_segment_matches` reste INTERNE aux deux RPC, à sa nouvelle
-- signature comme à l'ancienne. Le `drop` a emporté l'ACL d'origine : sans le
-- couple `revoke`/`grant` réémis, la fonction porterait l'EXECUTE par défaut de
-- PUBLIC, dont `anon` hérite.
select ok(not has_function_privilege('anon',
    'public.customer_segment_matches(text, bigint, timestamptz, boolean, boolean)',
    'execute'),
  'anon ne peut pas executer customer_segment_matches a sa nouvelle signature');
select ok(not has_function_privilege('authenticated',
    'public.customer_segment_matches(text, bigint, timestamptz, boolean, boolean)',
    'execute'),
  'authenticated non plus : la fonction est INTERNE aux deux RPC security definer');

-- ANON N'A RIEN SUR LA TABLE NEUVE, et la RLS est armée. Ces deux assertions
-- doublent la règle catalogue de `security_acl.test.sql`, et c'est voulu :
-- celle-là garde le schéma entier, celle-ci garde CE lot.
select ok(not has_table_privilege('anon', 'public.vitrine_contenus', 'SELECT'),
  'anon ne lit pas les contenus mis en avant directement : il passe par la RPC publique');
select ok(not has_table_privilege('anon', 'public.vitrine_contenus', 'INSERT'),
  'anon ne peut pas forger un contenu mis en avant');
select is(
  (select c.relrowsecurity from pg_catalog.pg_class c
     join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = 'vitrine_contenus'),
  true,
  'vitrine_contenus tourne sous row level security');


-- ══ 2. « UN À TROIS » EST TENU PAR LA BASE ══════════════════
--
-- Ce n'est pas une consigne d'écran. Un `ordre` libre plus un comptage à
-- l'insertion aurait laissé passer la quatrième ligne à la première course
-- entre deux onglets — et personne ne l'aurait vue avant de la lire en
-- production.

insert into public.vitrine_contenus (id, organization_id, rang, titre, url)
values
  ('f4000000-0000-4000-8000-000000000201',
   'f4000000-0000-4000-8000-00000000000a', 1,
   'Notre plat signature en vidéo', 'https://exemple.test/video-1'),
  ('f4000000-0000-4000-8000-000000000202',
   'f4000000-0000-4000-8000-00000000000a', 2,
   'Le reportage du journal local', 'https://exemple.test/presse'),
  ('f4000000-0000-4000-8000-000000000203',
   'f4000000-0000-4000-8000-00000000000a', 3,
   'La visite de l''atelier', 'https://exemple.test/atelier');

select throws_ok(
  $$insert into public.vitrine_contenus (organization_id, rang, titre, url)
    values ('f4000000-0000-4000-8000-00000000000b', 0, 'Rang zero',
            'https://exemple.test/zero')$$,
  '23514', null,
  'le rang 0 est refuse : la place commence a 1');

select throws_ok(
  $$insert into public.vitrine_contenus (organization_id, rang, titre, url)
    values ('f4000000-0000-4000-8000-00000000000b', 4, 'Le quatrieme',
            'https://exemple.test/quatre')$$,
  '23514', null,
  'le rang 4 est refuse : « un a trois » est tenu par la contrainte, pas par un ecran');

select throws_ok(
  $$insert into public.vitrine_contenus (organization_id, rang, titre, url)
    values ('f4000000-0000-4000-8000-00000000000a', 2, 'Le doublon',
            'https://exemple.test/doublon')$$,
  '23505', null,
  'deux contenus ne peuvent pas se disputer la meme place');

-- ── L'ADRESSE, CLOSE À `https` ──────────────────────────────
-- Les trois refus tombent sous la MÊME contrainte, ce qui est le point : une
-- expression unique vaut mieux que trois gardes qui divergeront.
select throws_ok(
  $$insert into public.vitrine_contenus (organization_id, rang, titre, url)
    values ('f4000000-0000-4000-8000-00000000000b', 1, 'En clair',
            'http://exemple.test/clair')$$,
  '23514', null,
  'une adresse en clair est refusee : servie depuis une page TLS elle serait bloquee sans explication');

select throws_ok(
  $$insert into public.vitrine_contenus (organization_id, rang, titre, url)
    values ('f4000000-0000-4000-8000-00000000000b', 1, 'Script',
            'javascript:alert(1)')$$,
  '23514', null,
  'un pseudo-schema executable est refuse par la meme expression');

select throws_ok(
  $$insert into public.vitrine_contenus (organization_id, rang, titre, url)
    values ('f4000000-0000-4000-8000-00000000000b', 1, 'Avec espace',
            'https://exemple.test/a b')$$,
  '23514', null,
  'une adresse porteuse d''un espace est refusee : elle pourrait emporter un attribut de plus dans le balisage');

select throws_ok(
  $$insert into public.vitrine_contenus (organization_id, rang, titre, url)
    values ('f4000000-0000-4000-8000-00000000000b', 1, '   ',
            'https://exemple.test/vide')$$,
  '23514', null,
  'un titre fait de blancs est refuse : le `btrim` du check le voit');

select lives_ok(
  $$insert into public.vitrine_contenus
      (id, organization_id, rang, titre, url)
    values ('f4000000-0000-4000-8000-000000000211',
            'f4000000-0000-4000-8000-00000000000b', 1,
            'Le contenu du voisin', 'https://voisin.test/chez-moi')$$,
  'une adresse https bien formee passe — le refus d''en face n''est pas une panne');

-- Le trigger générique de L11 est bien posé : `updated_at` avance à l'écriture.
update public.vitrine_contenus
   set titre = 'Notre plat signature, en vidéo'
 where id = 'f4000000-0000-4000-8000-000000000201';
select ok(
  (select c.updated_at > c.created_at from public.vitrine_contenus c
    where c.id = 'f4000000-0000-4000-8000-000000000201'),
  'le trigger touch_updated_at est pose sur vitrine_contenus : updated_at avance');


-- ══ 3. LECTURE D'ÉQUIPE, ÉCRITURE D'ÉDITEUR ════════════════
--
-- C'est l'ÉCART assumé avec les quatre tables de 20261011120000, fermées au
-- comptoir. Un contenu mis en avant est ce que le commerce MONTRE : le caissier
-- a une raison de le lire, aucune de l'écrire. Le caissier est donc le
-- contre-exemple qui distingue les deux policies — sans lui, « l'éditeur écrit »
-- ne prouverait pas que la lecture est plus large.

-- L'IDENTITÉ SE POSE PAR `request.jwt.claim.sub` DANS TOUT CE BLOC, et pas par
-- `request.jwt.claims` : `auth.uid()` est un `coalesce` qui lit la PREMIÈRE en
-- priorité, et un `set_config('request.jwt.claims', …)` laissé seul serait donc
-- ignoré tant que l'autre porte une valeur. La faute est muette — les
-- assertions passent sous l'identité précédente — d'où le motif unique ici et
-- la remise à blanc en fin de section.
set local role authenticated;

-- L'ÉDITEUR ÉCRIT.
set local "request.jwt.claim.sub" = 'f4000000-0000-4000-8000-000000000f02';
select lives_ok(
  $$update public.vitrine_contenus set titre = 'Retouche editeur'
     where id = 'f4000000-0000-4000-8000-000000000202'$$,
  'l''editeur modifie un contenu mis en avant');
select is(
  (select c.titre from public.vitrine_contenus c
    where c.id = 'f4000000-0000-4000-8000-000000000202'),
  'Retouche editeur',
  '… et la modification a bien atterri');

-- LE CAISSIER LIT…
set local "request.jwt.claim.sub" = 'f4000000-0000-4000-8000-000000000f03';
select results_eq(
  $$select count(*) from public.vitrine_contenus
     where organization_id = 'f4000000-0000-4000-8000-00000000000a'$$,
  array[3::bigint],
  'le caissier LIT les contenus mis en avant : c''est ce que le commerce montre, pas de la configuration');

-- … ET N'ÉCRIT PAS. La policy de lecture est `for select` : elle ne s'applique
-- pas à l'UPDATE, et celle d'écriture refuse. Zéro ligne touchée, sans erreur —
-- c'est le comportement d'une RLS, pas d'un refus de privilège, et c'est
-- pourquoi on compte le RÉSULTAT et non l'exception.
update public.vitrine_contenus set titre = 'Le caissier est passe par la'
 where id = 'f4000000-0000-4000-8000-000000000203';
select is(
  (select c.titre from public.vitrine_contenus c
    where c.id = 'f4000000-0000-4000-8000-000000000203'),
  'La visite de l''atelier',
  'le caissier n''ecrit PAS : sa tentative ne touche aucune ligne et le titre est intact');

-- LE VOISIN NE VOIT RIEN, ET IL N'EST PAS CASSÉ.
set local "request.jwt.claim.sub" = 'f4000000-0000-4000-8000-000000000f04';
select results_eq(
  $$select count(*) from public.vitrine_contenus
     where organization_id = 'f4000000-0000-4000-8000-00000000000a'$$,
  array[0::bigint],
  'le proprietaire voisin ne lit aucun contenu mis en avant d''un autre locataire');
select results_eq(
  $$select count(*) from public.vitrine_contenus
     where organization_id = 'f4000000-0000-4000-8000-00000000000b'$$,
  array[1::bigint],
  '… et il lit BIEN le sien : le zero d''en face est un refus, pas une panne');

reset role;
-- REMISE À BLANC OBLIGATOIRE : `auth.uid()` lit `request.jwt.claim.sub` AVANT
-- `request.jwt.claims`. La laisser posée ferait ignorer, dans toute la suite du
-- fichier, l'identité que la section 6 pose par les claims — et les assertions
-- passeraient sous le voisin sans que rien ne le dise.
set local "request.jwt.claim.sub" = '';
select set_config('request.jwt.claims', '{"role":"service_role"}', true);


-- ══ 4. LE RENDU PUBLIC — ORDONNÉ, BORNÉ, CLOISONNÉ ═════════

select is(
  pg_catalog.jsonb_typeof(
    public.vitrine_public_state('tap-l14-social') -> 'contenus'),
  'array',
  'la cle `contenus` est un TABLEAU, et elle existe toujours');

select is(
  pg_catalog.jsonb_array_length(
    public.vitrine_public_state('tap-l14-social') -> 'contenus'),
  3,
  'les trois contenus de A sortent');

-- L'ORDRE DE SORTIE, ET NON L'ENSEMBLE. `with ordinality` capture la position
-- RENDUE, et le `order by` vit DANS l'agrégat : posé à côté, il trierait les
-- lignes en entrée d'une fonction d'agrégation qui n'en rend qu'une, ce que
-- Postgres refuse. Un `string_agg` sans ordre aurait rendu « 1,2,3 » la plupart
-- du temps et laissé passer une permutation le jour où le plan change.
select is(
  (select pg_catalog.string_agg(e.c ->> 'rang', ',' order by e.i)
     from pg_catalog.jsonb_array_elements(
       public.vitrine_public_state('tap-l14-social') -> 'contenus')
       with ordinality as e(c, i)),
  '1,2,3',
  'ils sortent ORDONNÉS par rang : l''unicite (organization_id, rang) rend le tri total sans departage');

select is(
  public.vitrine_public_state('tap-l14-social') #>> '{contenus,0,titre}',
  'Notre plat signature, en vidéo',
  'le premier contenu porte son titre — celui que l''editeur vient de retoucher');

select is(
  public.vitrine_public_state('tap-l14-social') #>> '{contenus,0,url}',
  'https://exemple.test/video-1',
  '… et son adresse');

-- LA FORME EST FERMÉE À TROIS CLÉS. Une quatrième glissée un jour dans le
-- `jsonb_build_object` sortirait sur une page publique sans que personne l'ait
-- décidé — même garde que `lang_coverage` en L11.
select is(
  (select pg_catalog.array_agg(k order by k)
     from pg_catalog.jsonb_object_keys(
       public.vitrine_public_state('tap-l14-social') #> '{contenus,0}') k),
  array['rang', 'titre', 'url'],
  'un contenu rendu porte EXACTEMENT {rang, titre, url} — ni identifiant interne, ni horodatage');

-- LE CLOISONNEMENT, sur la RPC publique elle-même : la vitrine du voisin rend
-- SES contenus. C'est l'assertion qui manquerait le plus si elle n'était pas
-- écrite — les deux vitrines sont servies par la MÊME fonction.
select is(
  public.vitrine_public_state('tap-l14-voisin') #>> '{contenus,0,titre}',
  'Le contenu du voisin',
  'la vitrine du voisin rend SES contenus, jamais ceux du locataire d''a cote');
select is(
  pg_catalog.jsonb_array_length(
    public.vitrine_public_state('tap-l14-voisin') -> 'contenus'),
  1,
  '… et rien que les siens');

-- LA LISTE EXISTE TOUJOURS, MÊME VIDE. C'est la règle des six listes de
-- `portes` : une cle absente aurait oblige la page a porter deux chemins pour
-- un seul etat. C est publiee ici juste le temps de l observer.
update public.vitrine_settings set published = true
 where id = 'f4000000-0000-4000-8000-000000000103';
select is(
  public.vitrine_public_state('tap-l14-brouillon') #>> '{contenus}',
  '[]',
  'une vitrine sans aucun contenu mis en avant rend une liste VIDE, jamais une cle absente');

-- … ET LA GARDE DE PUBLICATION PASSE AVANT EUX.
insert into public.vitrine_contenus (organization_id, rang, titre, url)
values ('f4000000-0000-4000-8000-00000000000c', 1, 'Brouillon',
        'https://exemple.test/brouillon');
update public.vitrine_settings set published = false
 where id = 'f4000000-0000-4000-8000-000000000103';
select is(
  public.vitrine_public_state('tap-l14-brouillon') ->> 'state',
  'unavailable',
  'une vitrine DEPUBLIEE ne rend aucun contenu : la garde de publication passe avant eux');


-- ══ 5. LE BEACON — HUITIÈME VALEUR, ET SA RÉSOLUTION ═══════
--
-- La faute que ce lot doit rendre impossible est MUETTE : une clé acceptée par
-- le `check` mais absente des branches de la RPC tombe dans le `else return` —
-- zéro erreur, zéro comptage, pour toujours. Le commerçant lit 0 et croit que
-- personne ne scanne son affiche. On teste donc les DEUX bouts.

select lives_ok(
  $$insert into public.module_page_opens
      (organization_id, module, resource_id)
    values ('f4000000-0000-4000-8000-00000000000a', 'vitrine',
            'f4000000-0000-4000-8000-000000000101')$$,
  'le vocabulaire des modules comptes accepte `vitrine`');

select throws_ok(
  $$insert into public.module_page_opens
      (organization_id, module, resource_id)
    values ('f4000000-0000-4000-8000-00000000000a', 'wheel',
            'f4000000-0000-4000-8000-000000000101')$$,
  '23514', null,
  'un module hors vocabulaire reste refuse : le check a ete REMPLACE, pas double');

delete from public.module_page_opens
 where organization_id = 'f4000000-0000-4000-8000-00000000000a';

-- LA RÉSOLUTION. Le grain est la VITRINE — une ligne par commerce, parce que
-- `/v/[slug]` est une page unique, contrairement à `events` et `hunts` qui
-- impriment une affiche par sous-objet.
select public.increment_module_page_open('vitrine', 'tap-l14-social');

select is(
  (select o.resource_id from public.module_page_opens o
    where o.organization_id = 'f4000000-0000-4000-8000-00000000000a'
      and o.module = 'vitrine'),
  'f4000000-0000-4000-8000-000000000101'::uuid,
  'la RPC resout le slug vers vitrine_settings.id — le grain est la vitrine, une ligne par commerce');

select is(
  (select o.open_count from public.module_page_opens o
    where o.organization_id = 'f4000000-0000-4000-8000-00000000000a'
      and o.module = 'vitrine'),
  1,
  '… et elle compte une ouverture');

select public.increment_module_page_open('vitrine', 'tap-l14-social');
select is(
  (select o.open_count from public.module_page_opens o
    where o.organization_id = 'f4000000-0000-4000-8000-00000000000a'
      and o.module = 'vitrine'),
  2,
  'la seconde ouverture INCREMENTE la meme ligne au lieu d''en creer une autre');

-- UN SLUG INCONNU NE CRÉE RIEN. C'est CETTE ligne qui borne la table et rend
-- l'endpoint public tenable : un POST en boucle avec des slugs aléatoires ne
-- fait pas enfler la table.
select public.increment_module_page_open('vitrine', 'tap-l14-inexistant');
select is(
  (select count(*)::int from public.module_page_opens o
    where o.module = 'vitrine'
      and o.organization_id in ('f4000000-0000-4000-8000-00000000000a',
                                'f4000000-0000-4000-8000-00000000000b',
                                'f4000000-0000-4000-8000-00000000000c')),
  1,
  'un slug qui ne designe aucune vitrine ne cree AUCUNE ligne');


-- ══ 6. LES SEGMENTS RÉSERVÉ / VENU ═════════════════════════
--
-- SIX profils chez A, choisis pour couvrir les trois SOURCES qui portent un
-- e-mail, l'exclusion de la liste d'attente, et le complément :
--
--   venu@      1 gain + reservation `checked_in`      → a_reserve ET venu
--   reserve@   1 gain + reservation `confirmed`       → a_reserve seul
--   file@      1 gain + entree de file `served`       → a_reserve ET venu
--   offre@     1 gain + hold de stock `redeemed`      → a_reserve ET venu
--   attente@   1 gain + entree de LISTE D'ATTENTE     → NI l'un NI l'autre
--   rien@      1 gain, aucune trace dans Reserver     → NI l'un NI l'autre
--
-- `attente@` est la fixture qu'on oublie : s'inscrire sur une liste d'attente
-- n'est pas réserver, et sans elle un `union` de trop dans la fonction passerait
-- toutes les autres assertions sans broncher.
--
-- `fantome@` est la propriété CENTRALE du lot : il a réservé sans jamais avoir
-- joué ni s'être abonné. Il ne doit apparaître NULLE PART — ni dans la liste,
-- ni dans les compteurs. Un `full join` au lieu d'un `left join` aurait retourné
-- cette décision sans rien casser d'autre.

insert into public.campaigns (id, organization_id, name, status) values
  ('f4000000-0000-4000-8000-000000000301',
   'f4000000-0000-4000-8000-00000000000a', 'Roue L14', 'active');
insert into public.wheels (id, organization_id, campaign_id) values
  ('f4000000-0000-4000-8000-000000000311',
   'f4000000-0000-4000-8000-00000000000a',
   'f4000000-0000-4000-8000-000000000301');

insert into public.participations
  (organization_id, campaign_id, wheel_id, first_name, email,
   accepted_terms, player_key, created_at)
select
  'f4000000-0000-4000-8000-00000000000a',
  'f4000000-0000-4000-8000-000000000301',
  'f4000000-0000-4000-8000-000000000311',
  f.prenom, f.mail, true, 'tap-l14-' || f.mail, now() - interval '1 day'
  from (values
    ('Venu',    'venu@tap-l14.local'),
    ('Reserve', 'reserve@tap-l14.local'),
    ('File',    'file@tap-l14.local'),
    ('Offre',   'offre@tap-l14.local'),
    ('Attente', 'attente@tap-l14.local'),
    ('Rien',    'rien@tap-l14.local')
  ) as f(prenom, mail);

-- ── Les traces « Réserver » ─────────────────────────────────
insert into public.reservation_activities (id, organization_id, name, active)
values ('f4000000-0000-4000-8000-000000000401',
        'f4000000-0000-4000-8000-00000000000a', 'Degustation L14', true);
insert into public.reservation_slots
  (id, activity_id, organization_id, starts_at, ends_at, capacity, status)
values ('f4000000-0000-4000-8000-000000000411',
        'f4000000-0000-4000-8000-000000000401',
        'f4000000-0000-4000-8000-00000000000a',
        now() + interval '2 days', now() + interval '2 days 30 minutes',
        10, 'open');

-- `consent_transactional_at` est OBLIGATOIRE dès qu'un e-mail est posé : le
-- `check` de la table en fait une ÉQUIVALENCE, pas une implication.
-- `checked_in_at` de même — le statut et la date ne peuvent pas diverger.
insert into public.reservations
  (id, slot_id, organization_id, player_key_hash, email,
   consent_transactional_at, status, checked_in_at)
values
  ('f4000000-0000-4000-8000-000000000421',
   'f4000000-0000-4000-8000-000000000411',
   'f4000000-0000-4000-8000-00000000000a', repeat('a1', 32),
   'venu@tap-l14.local', now(), 'checked_in', now()),
  ('f4000000-0000-4000-8000-000000000422',
   'f4000000-0000-4000-8000-000000000411',
   'f4000000-0000-4000-8000-00000000000a', repeat('a2', 32),
   'reserve@tap-l14.local', now(), 'confirmed', null),
  -- LE FANTÔME : il a réservé, il n'a jamais joué, il n'est pas abonné.
  ('f4000000-0000-4000-8000-000000000423',
   'f4000000-0000-4000-8000-000000000411',
   'f4000000-0000-4000-8000-00000000000a', repeat('a3', 32),
   'fantome@tap-l14.local', now(), 'confirmed', null);

-- La FILE. `served` exige `called_at` ET `resolved_at` : les deux `check`
-- d'origine (`_outcome_origin` et `_resolved_state`) le tiennent.
insert into public.reservation_queues (id, organization_id, name, status)
values ('f4000000-0000-4000-8000-000000000431',
        'f4000000-0000-4000-8000-00000000000a', 'File L14', 'open');
insert into public.reservation_queue_entries
  (id, queue_id, organization_id, player_key_hash, email,
   consent_transactional_at, status, called_at, resolved_at)
values ('f4000000-0000-4000-8000-000000000441',
        'f4000000-0000-4000-8000-000000000431',
        'f4000000-0000-4000-8000-00000000000a', repeat('b1', 32),
        'file@tap-l14.local', now(), 'served',
        now() - interval '10 minutes', now() - interval '5 minutes');

-- L'OFFRE DE STOCK. `code` est posé par son trigger, la fenêtre de retrait est
-- gravée depuis l'offre par le sien : on ne les écrit pas.
insert into public.reservation_stock_offers
  (id, organization_id, title, stock_total,
   window_starts_at, window_ends_at, status)
values ('f4000000-0000-4000-8000-000000000451',
        'f4000000-0000-4000-8000-00000000000a', 'Panier L14', 20,
        now() - interval '1 hour', now() + interval '1 day', 'open');
insert into public.reservation_stock_holds
  (id, offer_id, organization_id, player_key_hash, email,
   consent_transactional_at, status, redeemed_at)
values ('f4000000-0000-4000-8000-000000000461',
        'f4000000-0000-4000-8000-000000000451',
        'f4000000-0000-4000-8000-00000000000a', repeat('c1', 32),
        'offre@tap-l14.local', now(), 'redeemed', now());

-- LA LISTE D'ATTENTE, VOLONTAIREMENT EXCLUE des faits « a réservé ».
insert into public.reservation_waitlist_entries
  (id, slot_id, organization_id, player_key_hash, email,
   consent_transactional_at, status)
values ('f4000000-0000-4000-8000-000000000471',
        'f4000000-0000-4000-8000-000000000411',
        'f4000000-0000-4000-8000-00000000000a', repeat('d1', 32),
        'attente@tap-l14.local', now(), 'waiting');

-- La population du COMPTEUR : `org_segment_counts` compte des abonnés
-- newsletter, pas des joueurs. Trois abonnés seulement — et `fantome@` n'en est
-- pas, ce qui rend `all_count = 3` porteur.
insert into public.newsletter_subscribers (organization_id, email) values
  ('f4000000-0000-4000-8000-00000000000a', 'venu@tap-l14.local'),
  ('f4000000-0000-4000-8000-00000000000a', 'reserve@tap-l14.local'),
  ('f4000000-0000-4000-8000-00000000000a', 'rien@tap-l14.local');

-- `is_org_owner` lit `auth.uid()`, donc la revendication `sub` du JWT — pas le
-- rôle Postgres. On pose la revendication et on appelle : le fichier tourne sous
-- `postgres`, qui n'a pas besoin du `grant execute`, et l'on évite ainsi la
-- plomberie du basculement de rôle (`authenticated` n'a pas le privilège
-- TEMPORARY sur la base).
select set_config('request.jwt.claims',
  '{"role":"authenticated","sub":"f4000000-0000-4000-8000-000000000f01"}', true);

-- ── LA LISTE : AUCUN E-MAIL NOUVEAU ─────────────────────────
select is(
  (select pg_catalog.string_agg(t.email, ',' order by t.email)
     from public.org_customer_profiles_page(
       'f4000000-0000-4000-8000-00000000000a', 0, 50, null, null, null) t),
  'attente@tap-l14.local,file@tap-l14.local,offre@tap-l14.local,'
  || 'reserve@tap-l14.local,rien@tap-l14.local,venu@tap-l14.local',
  'la liste rend EXACTEMENT les six e-mails de participations : `fantome@`, qui a reserve sans jamais jouer, n''y entre PAS');

-- ── LES FAITS, PROFIL PAR PROFIL ────────────────────────────
select is(
  (select t.est_venu from public.org_customer_profiles_page(
     'f4000000-0000-4000-8000-00000000000a', 0, 50, null, null, null) t
    where t.email = 'venu@tap-l14.local'),
  true,
  'une reservation `checked_in` rend `est_venu` vrai');
select is(
  (select t.a_reserve from public.org_customer_profiles_page(
     'f4000000-0000-4000-8000-00000000000a', 0, 50, null, null, null) t
    where t.email = 'venu@tap-l14.local'),
  true,
  '… et `a_reserve` avec, evidemment : venir suppose avoir reserve');

select is(
  (select t.a_reserve from public.org_customer_profiles_page(
     'f4000000-0000-4000-8000-00000000000a', 0, 50, null, null, null) t
    where t.email = 'reserve@tap-l14.local'),
  true,
  'une reservation `confirmed` rend `a_reserve` vrai…');
select is(
  (select t.est_venu from public.org_customer_profiles_page(
     'f4000000-0000-4000-8000-00000000000a', 0, 50, null, null, null) t
    where t.email = 'reserve@tap-l14.local'),
  false,
  '… et `est_venu` FAUX : reserver n''est pas venir, c''est tout l''interet des deux segments');

select is(
  (select t.est_venu from public.org_customer_profiles_page(
     'f4000000-0000-4000-8000-00000000000a', 0, 50, null, null, null) t
    where t.email = 'file@tap-l14.local'),
  true,
  'une entree de file `served` rend `est_venu` vrai : la file a appele ET la personne s''est presentee');

select is(
  (select t.est_venu from public.org_customer_profiles_page(
     'f4000000-0000-4000-8000-00000000000a', 0, 50, null, null, null) t
    where t.email = 'offre@tap-l14.local'),
  true,
  'un hold de stock `redeemed` rend `est_venu` vrai : l''offre a ete retiree au comptoir');

select is(
  (select t.a_reserve from public.org_customer_profiles_page(
     'f4000000-0000-4000-8000-00000000000a', 0, 50, null, null, null) t
    where t.email = 'attente@tap-l14.local'),
  false,
  's''inscrire sur une LISTE D''ATTENTE n''est pas reserver : la table est volontairement exclue');

select is(
  (select t.a_reserve from public.org_customer_profiles_page(
     'f4000000-0000-4000-8000-00000000000a', 0, 50, null, null, null) t
    where t.email = 'rien@tap-l14.local'),
  false,
  'un client sans aucune trace dans Reserver a `a_reserve` faux…');
select is(
  (select t.est_venu from public.org_customer_profiles_page(
     'f4000000-0000-4000-8000-00000000000a', 0, 50, null, null, null) t
    where t.email = 'rien@tap-l14.local'),
  false,
  '… et `est_venu` faux. Ce sont des BOOLEENS, jamais `null` : le coalesce est pose dans la RPC');

-- ── LE FILTRE PAR SEGMENT ───────────────────────────────────
select is(
  (select pg_catalog.string_agg(t.email, ',' order by t.email)
     from public.org_customer_profiles_page(
       'f4000000-0000-4000-8000-00000000000a', 0, 50, null, 'a_reserve', null) t),
  'file@tap-l14.local,offre@tap-l14.local,reserve@tap-l14.local,venu@tap-l14.local',
  'le segment `a_reserve` rend les QUATRE clients qui ont une trace dans Reserver, toutes sources confondues');

select is(
  (select pg_catalog.string_agg(t.email, ',' order by t.email)
     from public.org_customer_profiles_page(
       'f4000000-0000-4000-8000-00000000000a', 0, 50, null, 'venu', null) t),
  'file@tap-l14.local,offre@tap-l14.local,venu@tap-l14.local',
  'le segment `venu` rend les TROIS qui se sont presentes — `reserve@` en est exclu');

-- LES SEGMENTS EXISTANTS N'ONT PAS BOUGÉ. Les six profils ont exactement un
-- gain : ils sont tous « nouveau », et aucun n'est « fidèle ».
select is(
  (select count(*)::int from public.org_customer_profiles_page(
     'f4000000-0000-4000-8000-00000000000a', 0, 50, null, 'nouveau', null) t),
  6,
  'le segment `nouveau` compte toujours ce qu''il comptait : les deux nouveaux libelles n''ont rien deplace');
select is(
  (select count(*)::int from public.org_customer_profiles_page(
     'f4000000-0000-4000-8000-00000000000a', 0, 50, null, 'fidele', null) t),
  0,
  '… et `fidele` reste vide : un gain n''en fait pas trois');

-- UN SEGMENT INCONNU REND ZÉRO LIGNE, jamais la liste entière. Une faute de
-- frappe doit vider la liste, pas laisser croire au filtre.
select is(
  (select count(*)::int from public.org_customer_profiles_page(
     'f4000000-0000-4000-8000-00000000000a', 0, 50, null, 'a_reserv', null) t),
  0,
  'un segment mal tape rend zero ligne : il ne retombe pas sur « tous »');

-- ── LES COMPTEURS ───────────────────────────────────────────
-- Population : abonnés newsletter non désabonnés. Trois ici, et `fantome@` n'en
-- fait pas partie — c'est ce qui rend `all_count = 3` porteur.
select is(
  (select c.all_count from public.org_segment_counts(
     'f4000000-0000-4000-8000-00000000000a') c),
  3::bigint,
  'le compteur porte sur les TROIS abonnes : `fantome@` n''entre pas par la porte des faits Reserver');
select is(
  (select c.reserve_count from public.org_segment_counts(
     'f4000000-0000-4000-8000-00000000000a') c),
  2::bigint,
  '`reserve_count` compte les DEUX abonnes ayant une trace dans Reserver');
select is(
  (select c.venu_count from public.org_segment_counts(
     'f4000000-0000-4000-8000-00000000000a') c),
  1::bigint,
  '`venu_count` n''en compte qu''UN : celui dont l''arrivee a ete enregistree');
select is(
  (select c.new_count from public.org_segment_counts(
     'f4000000-0000-4000-8000-00000000000a') c),
  3::bigint,
  'les compteurs existants ne bougent pas : les trois abonnes ont un gain chacun');

-- LA PARITÉ ENTRE LES DEUX FONCTIONS, sur le prédicat et non sur la population.
-- C'est la raison d'être de `customer_segment_matches`, et elle vaut pour les
-- deux nouveaux segments comme pour les trois anciens : les deux abonnés
-- `a_reserve` sont exactement ceux que la liste rend quand on la restreint aux
-- abonnés.
select is(
  (select count(*)::int from public.org_customer_profiles_page(
     'f4000000-0000-4000-8000-00000000000a', 0, 50, null, 'a_reserve', null) t
    where t.email in ('venu@tap-l14.local', 'reserve@tap-l14.local',
                      'rien@tap-l14.local')),
  2,
  'la liste et le compteur appliquent LE MEME predicat `a_reserve` : deux des trois abonnes');

-- LE VOISIN NE LIT PAS LA LISTE D'À CÔTÉ. La garde `is_org_owner` est inchangée
-- et ce lot ne l'a pas desserrée en réécrivant la fonction.
select set_config('request.jwt.claims',
  '{"role":"authenticated","sub":"f4000000-0000-4000-8000-000000000f04"}', true);
select throws_ok(
  $$select 1 from public.org_customer_profiles_page(
      'f4000000-0000-4000-8000-00000000000a', 0, 50, null, null, null)$$,
  null, 'not authorized',
  'le proprietaire voisin ne lit pas la liste clients d''un autre locataire');
select throws_ok(
  $$select 1 from public.org_segment_counts(
      'f4000000-0000-4000-8000-00000000000a')$$,
  null, 'not authorized',
  '… ni ses compteurs de segments');

-- LE PLAFOND D'OFFSET DU WAGON 4 SURVIT À LA RÉÉCRITURE. Cette fonction a été
-- réécrite en entier ici : la garde `v_offset > 500 * v_limit` aurait disparu en
-- silence si elle avait été recopiée depuis la migration qui a INTRODUIT la
-- fonction plutôt que depuis celle qui la définit.
select set_config('request.jwt.claims',
  '{"role":"authenticated","sub":"f4000000-0000-4000-8000-000000000f01"}', true);
select throws_ok(
  $$select 1 from public.org_customer_profiles_page(
      'f4000000-0000-4000-8000-00000000000a', 25001, 50, null, null, null)$$,
  null, 'invalid pagination',
  'le plafond d''offset (500 pages) survit a la reecriture de la fonction');
select lives_ok(
  $$select 1 from public.org_customer_profiles_page(
      'f4000000-0000-4000-8000-00000000000a', 25000, 50, null, null, null)$$,
  '… et il mord PILE au bon endroit : 500 pages de 50 passent encore');

select set_config('request.jwt.claims', '{"role":"service_role"}', true);


-- ══ 7. LA COUVERTURE DE TRADUCTION NE BOUGE PAS ════════════
--
-- A porte trois contenus mis en avant et UN seul champ traduisible : son
-- accroche. Le jour où un contenu entrerait dans `vitrine_champs_traduisibles`,
-- ce total passerait à quatre et cette ligne rougirait — ce qui est exactement
-- le but, parce que la même arithmétique ferait tomber le sélecteur de langue
-- des vitrines E2E. C'est la garde de L13 (§14d), reprise pour ce lot.

update public.vitrine_settings
   set accroche = 'La table du quartier.'
 where id = 'f4000000-0000-4000-8000-000000000101';

select is(
  public.vitrine_public_state('tap-l14-social')
    #>> '{lang_coverage,total_champs_traduisibles}',
  '1',
  'les trois contenus mis en avant n''ajoutent AUCUN champ traduisible : le denominateur ne bouge pas en VIT-4');

-- ET LE VOCABULAIRE DES CIBLES TRADUISIBLES RESTE FERMÉ À QUATRE. C'est l'autre
-- bout de la même propriété, et il se lit dans le catalogue VIVANT : une
-- cinquième cible ajoutée un jour à `vitrine_translations` ferait rougir ici
-- avant d'atteindre une page.
select is(
  (select pg_catalog.count(*)::bigint
     from pg_constraint c
     cross join lateral
       pg_catalog.regexp_matches(pg_catalog.pg_get_constraintdef(c.oid),
                                 '''([a-z_]+)''::text', 'g') m
    where c.conrelid = 'public.vitrine_translations'::regclass
      and c.conname = 'vitrine_translations_cible_type_check'),
  4::bigint,
  'les cibles traduisibles restent QUATRE (settings, menu, categorie, item) : un contenu mis en avant ne se traduit pas');


select * from finish();
rollback;
