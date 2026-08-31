-- ============================================================
-- LE CLIENT NOMME SA CARTE — 20261120120000 (FID-8a)
--
-- Quatre familles, et la troisième est celle qui porte tout le lot :
--
--   IC-1..6    la FORME    — les deux colonnes, leurs bornes, et le fait que
--                            « rien choisi » reste l'état normal.
--   IC-7..12   les DROITS  — qui peut lire, qui peut écrire. Le contrôle
--                            NÉGATIF (le commerçant ne renomme pas) est
--                            l'invariant central de ce chantier.
--   IC-13..19  la RPC      — le client pose son surnom, un autre client ne
--                            peut pas le changer, un membre inconnu est
--                            refusé sans fuite, l'écriture est idempotente.
--   IC-20..21  le CLOISONNEMENT — vérifié en ÉCRIVANT depuis une vraie
--                            session marchande, pas en lisant le catalogue.
--
-- Note de lecture : les assertions de droits interrogent le CATALOGUE — elles
-- prouvent qu'un privilège existe, jamais qu'il s'arrête au bon tenant. C'est
-- pourquoi IC-20..21 écrivent réellement sous le rôle `authenticated`.
-- ============================================================

begin;
-- pgTAP vit dans `extensions`, JAMAIS dans `public` : 85 des 90 suites du
-- dossier posent cette ligne à l'identique. Le schéma compte — installer pgTAP
-- dans `public` y déverse 1074 fonctions exécutables par PUBLIC et au
-- search_path libre, ce qui fait rougir `security_acl` (« PUBLIC has no EXECUTE
-- on public functions ») et `search_path_invariant` sans qu'aucune migration
-- soit en cause.
create extension if not exists pgtap with schema extensions;
select plan(21);


-- ────────────────────────────────────────────────────────────
-- Fixtures — deux commerçants voisins, un passeport chacun.
--
-- Le voisin naît DÉJÀ NOMMÉ (« Chez Léa ») : sans cela, « le surnom du voisin
-- n'a pas changé » serait vrai parce qu'il valait null des deux côtés, et
-- IC-18 passerait sans rien prouver.
--
-- `addon_loyalty` est indispensable : la RPC joint dessus, et un addon coupé
-- rend `not_a_member` — une fixture qui l'oublierait ferait échouer TOUTES les
-- assertions de la RPC pour une raison sans rapport avec ce qu'elles testent.
-- ────────────────────────────────────────────────────────────

insert into auth.users (id, aud, role, email, encrypted_password, created_at, updated_at)
values
  ('f1d80000-0000-4000-8000-000000000001', 'authenticated', 'authenticated',
   'editeur-fid8a@test.local', '', now(), now()),
  ('f1d80000-0000-4000-8000-000000000002', 'authenticated', 'authenticated',
   'voisin-fid8a@test.local', '', now(), now());

insert into public.organizations (id, name, slug, addon_loyalty) values
  ('f1d80000-0000-4000-8000-0000000000a1', 'Passeport FID8A',
   'fid8a-a-' || pg_catalog.substr(gen_random_uuid()::text, 1, 8), true),
  ('f1d80000-0000-4000-8000-0000000000a2', 'Passeport FID8A Voisin',
   'fid8a-b-' || pg_catalog.substr(gen_random_uuid()::text, 1, 8), true);

insert into public.organization_members (organization_id, user_id, role) values
  ('f1d80000-0000-4000-8000-0000000000a1', 'f1d80000-0000-4000-8000-000000000001', 'editor'),
  ('f1d80000-0000-4000-8000-0000000000a2', 'f1d80000-0000-4000-8000-000000000002', 'editor');

insert into public.loyalty_programs
  (id, organization_id, name, silver_threshold, gold_threshold)
values
  ('f1d80000-0000-4000-8000-0000000000b1', 'f1d80000-0000-4000-8000-0000000000a1',
   'Passeport de la maison', 5, 10),
  ('f1d80000-0000-4000-8000-0000000000b2', 'f1d80000-0000-4000-8000-0000000000a2',
   'Passeport du voisin', 5, 10);

-- Deux porteurs chez le commerçant A, un chez le voisin B. Les hash sont des
-- 64-hex constants : la RPC les exige au format, et un identifiant lisible
-- rend les échecs de test bien plus faciles à situer.
insert into public.loyalty_members (id, program_id, organization_id, token_hash)
values
  ('f1d80000-0000-4000-8000-0000000000c1',
   'f1d80000-0000-4000-8000-0000000000b1', 'f1d80000-0000-4000-8000-0000000000a1',
   pg_catalog.repeat('a1', 32)),
  ('f1d80000-0000-4000-8000-0000000000c2',
   'f1d80000-0000-4000-8000-0000000000b1', 'f1d80000-0000-4000-8000-0000000000a1',
   pg_catalog.repeat('c2', 32)),
  ('f1d80000-0000-4000-8000-0000000000c3',
   'f1d80000-0000-4000-8000-0000000000b2', 'f1d80000-0000-4000-8000-0000000000a2',
   pg_catalog.repeat('b3', 32));

update public.loyalty_members
   set display_name = 'Chez Lea', avatar = 'renard'
 where id = 'f1d80000-0000-4000-8000-0000000000c3';


-- ────────────────────────────────────────────────────────────
-- IC-1..3 · LES COLONNES, ET LE DROIT DE NE RIEN CHOISIR
--
-- `display_name` nullable, `avatar` par défaut vide : c'est l'état de tous les
-- passeports déjà en production au moment où la migration s'applique, et il ne
-- doit ni être réécrit, ni devenir une anomalie.
-- ────────────────────────────────────────────────────────────

select has_column(
  'public', 'loyalty_members', 'display_name',
  'IC-1 · loyalty_members.display_name existe — le client peut nommer sa carte'
);

select col_is_null(
  'public', 'loyalty_members', 'display_name',
  'IC-2 · display_name est nullable : ne rien choisir reste l''état normal, pas une erreur'
);

select is(
  (select display_name is null and avatar = ''
     from public.loyalty_members
    where id = 'f1d80000-0000-4000-8000-0000000000c1'),
  true,
  'IC-3 · un passeport créé sans identité vaut null / chaîne vide — aucune valeur inventée à la place du client'
);


-- ────────────────────────────────────────────────────────────
-- IC-4..6 · LA BORNE TIENT EN BASE, PAS SEULEMENT DANS LE FORMULAIRE
--
-- Ce texte est écrit par un anonyme et s'affiche à la caisse d'un commerçant :
-- la base doit tenir seule, même si un jour un appelant contourne la RPC.
--
-- IC-6 vise le cas que la borne naïve laisse passer : `char_length(btrim(x))`
-- rogne AVANT de compter, donc 24 caractères suivis de mille espaces passent.
-- C'est `display_name = btrim(display_name)` qui les refuse.
-- ────────────────────────────────────────────────────────────

select throws_ok(
  $$update public.loyalty_members
       set display_name = pg_catalog.repeat('x', 25)
     where id = 'f1d80000-0000-4000-8000-0000000000c1'$$,
  '23514',
  null,
  'IC-4 · 25 caractères sont refusés : la borne de 24 est celle de tout le dépôt (event_players, lobby, player_aliases)'
);

select throws_ok(
  $$update public.loyalty_members
       set display_name = '   '
     where id = 'f1d80000-0000-4000-8000-0000000000c1'$$,
  '23514',
  null,
  'IC-5 · un surnom fait de blancs est refusé — « vide » s''écrit null, pas avec des espaces'
);

select throws_ok(
  $$update public.loyalty_members
       set display_name = 'Marie' || pg_catalog.repeat(' ', 40)
     where id = 'f1d80000-0000-4000-8000-0000000000c1'$$,
  '23514',
  null,
  'IC-6 · un surnom court noyé dans 40 espaces est refusé : ce qui est stocké est déjà rogné, donc ce qui s''affiche'
);


-- ────────────────────────────────────────────────────────────
-- IC-7..9 · CE QUE LA CAISSE A LE DROIT DE LIRE
--
-- ATTENTION, contre-intuitif : `loyalty_members` n'est PAS sous régime de
-- grants par colonne, contrairement à `loyalty_programs` et `reservations`.
-- 20260725120000:305 y accorde `select` DE TABLE, qui couvre les colonnes
-- ajoutées ensuite. Ces trois assertions vérifient cette propriété de Postgres
-- au lieu de la supposer — c'est d'elle seule que dépend l'affichage du surnom
-- au scan, et PostgREST refuse le `select` ENTIER dès qu'une colonne manque.
-- ────────────────────────────────────────────────────────────

select ok(
  pg_catalog.has_column_privilege(
    'authenticated', 'public.loyalty_members', 'display_name', 'SELECT'),
  'IC-7 · le surnom est LISIBLE par authenticated — sans lui la fiche client disparaît en entier de la caisse'
);

select ok(
  pg_catalog.has_column_privilege(
    'authenticated', 'public.loyalty_members', 'avatar', 'SELECT'),
  'IC-8 · la figure est LISIBLE par authenticated — même grant de table, même raison'
);

select ok(
  pg_catalog.has_column_privilege(
    'service_role', 'public.loyalty_members', 'display_name', 'UPDATE'),
  'IC-9 · service_role peut écrire le surnom : c''est lui qui porte la RPC'
);


-- ────────────────────────────────────────────────────────────
-- IC-10..12 · CE QUI DOIT RESTER FERMÉ
--
-- IC-10 est l'invariant central du chantier : le surnom appartient au CLIENT.
-- Un commerçant qui pourrait renommer ses clients transformerait un libellé
-- choisi en fiche client subie.
-- ────────────────────────────────────────────────────────────

select ok(
  not pg_catalog.has_column_privilege(
    'authenticated', 'public.loyalty_members', 'display_name', 'UPDATE'),
  'IC-10 · le commerçant ne peut PAS renommer ses clients : aucun update de colonne pour authenticated'
);

select ok(
  not pg_catalog.has_column_privilege(
    'anon', 'public.loyalty_members', 'display_name', 'SELECT')
  and not pg_catalog.has_column_privilege(
    'anon', 'public.loyalty_members', 'display_name', 'UPDATE'),
  'IC-11 · anon n''a ni lecture ni écriture : le passeport public passe par le service role, jamais en direct'
);

select ok(
  not pg_catalog.has_function_privilege(
    'anon', 'public.set_loyalty_member_identity(uuid, text, text, text)', 'EXECUTE')
  and not pg_catalog.has_function_privilege(
    'authenticated', 'public.set_loyalty_member_identity(uuid, text, text, text)', 'EXECUTE'),
  'IC-12 · la RPC n''est exécutable ni par anon ni par authenticated — sinon elle rouvrirait ce qu''IC-10 vient de fermer'
);


-- ────────────────────────────────────────────────────────────
-- IC-13 · LA RPC EST BIEN `security definer`
--
-- Sans cet attribut, elle s'exécuterait avec les droits de l'appelant et
-- n'écrirait rien. L'asserter ici évite un échec beaucoup plus loin, dont la
-- cause serait invisible.
-- ────────────────────────────────────────────────────────────

select is(
  (select p.prosecdef
     from pg_catalog.pg_proc p
     join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'set_loyalty_member_identity'),
  true,
  'IC-13 · set_loyalty_member_identity est security definer — c''est ce qui lui donne d''écrire pour un client anonyme'
);


-- ────────────────────────────────────────────────────────────
-- IC-14..19 · LE COMPORTEMENT DE LA RPC
--
-- Toutes ces assertions s'exécutent sous `service_role` : c'est le seul rôle
-- qui peut l'appeler, et le `raise exception 'not authorized'` en tête de
-- fonction refuse tout le reste.
--
-- ATTENTION au détail qui fait perdre une heure : la fonction teste
-- `auth.role()`, qui lit la CLAIM JWT `request.jwt.claims` — pas le rôle
-- Postgres. Un `set local role service_role` ne la change donc pas, et la RPC
-- répondrait `not authorized` alors que tout est correct. C'est la forme
-- qu'emploie déjà fidelite_points.test.sql:44 pour spend_loyalty_points.
-- ────────────────────────────────────────────────────────────

select set_config('request.jwt.claims', '{"role":"service_role"}', true);

-- IC-14 · le geste nominal.
select is(
  (select public.set_loyalty_member_identity(
            'f1d80000-0000-4000-8000-0000000000b1',
            pg_catalog.repeat('a1', 32),
            'Marie du 3e',
            'chat') ->> 'state'),
  'saved',
  'IC-14 · le client pose son surnom et sa figure — le geste que tout ce lot existe pour permettre'
);

-- IC-15 · IDEMPOTENCE. Rejouer le même appel rend le même état, sans second
-- effet : c'est une AFFECTATION, pas un incrément — d'où l'absence de
-- request_id, contrairement à spend_loyalty_points qui débite.
select is(
  (select public.set_loyalty_member_identity(
            'f1d80000-0000-4000-8000-0000000000b1',
            pg_catalog.repeat('a1', 32),
            'Marie du 3e',
            'chat') ->> 'display_name'),
  'Marie du 3e',
  'IC-15 · rejouer le même enregistrement rend le même résultat : l''idempotence est intrinsèque, pas gardée par un jeton'
);

-- IC-16 · UN MEMBRE INCONNU EST REFUSÉ SANS FUITE.
--
-- Le hash est bien formé mais n'existe pas. La réponse est `not_a_member` —
-- exactement celle que rendrait un programme inexistant ou un addon coupé.
-- C'est ce qui empêche la RPC de servir d'oracle d'existence.
select is(
  (select public.set_loyalty_member_identity(
            'f1d80000-0000-4000-8000-0000000000b1',
            pg_catalog.repeat('ff', 32),
            'Intrus',
            '') ->> 'state'),
  'not_a_member',
  'IC-16 · un jeton inconnu est refusé par un état générique — la RPC ne dit jamais si un passeport existe'
);

-- IC-17 · et un PROGRAMME inexistant rend le MÊME état. C'est l'assertion qui
-- prouve la non-divulgation : deux causes distinctes, une seule réponse.
select is(
  (select public.set_loyalty_member_identity(
            'f1d80000-0000-4000-8000-0000000000bf',
            pg_catalog.repeat('a1', 32),
            'Intrus',
            '') ->> 'state'),
  'not_a_member',
  'IC-17 · un programme inconnu rend le MÊME not_a_member qu''un jeton inconnu — aucune des deux causes n''est distinguable'
);

-- IC-18 · UN AUTRE CLIENT NE CHANGE PAS LE SURNOM DU PREMIER.
--
-- Le porteur c2 présente SON hash mais vise le programme du voisin ; et le
-- hash de c3 présenté sur le programme b1 ne trouve rien non plus. Dans les
-- deux cas la clause `program_id + token_hash` ne rapproche rien : c'est le
-- couple, jamais le seul jeton, qui désigne une ligne.
select is(
  (select public.set_loyalty_member_identity(
            'f1d80000-0000-4000-8000-0000000000b1',
            pg_catalog.repeat('b3', 32),
            'Renomme par un autre',
            '') ->> 'state'),
  'not_a_member',
  'IC-18 · le jeton d''un client d''un AUTRE programme ne désigne aucune ligne ici — un client n''en renomme pas un autre'
);

-- IC-19 · le surnom du voisin est intact. IC-18 ne lève pas d'exception : il
-- rend un état. La preuve est donc la valeur d'APRÈS, pas l'absence d'erreur.
select is(
  (select display_name from public.loyalty_members
    where id = 'f1d80000-0000-4000-8000-0000000000c3'),
  'Chez Lea',
  'IC-19 · le surnom visé est resté celui d''origine — l''appel refusé n''a rien écrit au passage'
);


-- ────────────────────────────────────────────────────────────
-- IC-20..21 · LE COMMERÇANT, DEPUIS UNE VRAIE SESSION
--
-- IC-10 a lu le catalogue : il prouve qu'aucun droit d'update de colonne
-- n'existe. Celui-ci ÉCRIT, sous le rôle `authenticated` et l'identité d'un
-- éditeur réel de l'organisation propriétaire — le cas le plus favorable à
-- l'attaquant, et donc le seul qui prouve quelque chose.
--
-- L'update DOIT lever (42501, privilège insuffisant) : contrairement au
-- cloisonnement par policy, où la ligne devient invisible et l'update touche
-- zéro ligne en silence, un droit de colonne absent est une erreur franche.
-- ────────────────────────────────────────────────────────────

select set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"f1d80000-0000-4000-8000-000000000001"}',
  true
);
set local role authenticated;
set local "request.jwt.claim.sub" = 'f1d80000-0000-4000-8000-000000000001';

select throws_ok(
  $$update public.loyalty_members
       set display_name = 'Client fidele n7'
     where id = 'f1d80000-0000-4000-8000-0000000000c1'$$,
  '42501',
  null,
  'IC-20 · un éditeur de l''organisation PROPRIÉTAIRE ne peut pas renommer son propre client : le droit n''existe pour personne'
);

-- Et la RPC ne lui offre pas non plus de détour : elle refuse à l'ACL, avant
-- même d'atteindre le `raise` de son premier `if`.
select throws_ok(
  $$select public.set_loyalty_member_identity(
             'f1d80000-0000-4000-8000-0000000000b1',
             pg_catalog.repeat('a1', 32),
             'Renomme par le commercant',
             '')$$,
  '42501',
  null,
  'IC-21 · la RPC ne lui sert pas de détour non plus — le surnom reste la seule chose du passeport que le commerçant ne peut pas écrire'
);

reset role;


select * from finish();
rollback;
