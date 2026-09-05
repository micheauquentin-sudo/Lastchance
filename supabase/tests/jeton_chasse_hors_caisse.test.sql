-- ============================================================
-- LE JETON DE LA CHASSE SORT DE LA CAISSE — 20261204120000
--
-- CE QUE CE FICHIER DOIT PROUVER, ET DANS QUEL ORDRE
--
--  1. LE CATALOGUE. `authenticated` n'a plus SELECT sur `hunt_steps.token`,
--     ET n'a plus le grant SELECT TABLE-WIDE qui rendait tout grant de colonne
--     décoratif. Les deux ensemble, jamais l'un sans l'autre : la seconde est
--     ce qui distingue une révocation qui MORD d'une révocation muette
--     (20260905120000, piège (a)).
--  2. LE CONTRE-EXEMPLE. Les sept autres colonnes restent lisibles, et
--     `service_role` garde le jeton. Sans eux, les assertions du point 1
--     seraient vraies sur une table devenue inutilisable, et le fichier
--     verdirait sur un produit cassé.
--  3. LE COMPORTEMENT, en session réelle. Le catalogue dit ce que Postgres
--     a enregistré ; il ne dit pas ce qu'une requête obtient sous RLS. Le
--     caissier de ce fichier est un vrai caissier, avec son JWT, et il tente
--     vraiment de lire le jeton.
--  4. LA PORTE DE REMPLACEMENT. `hunt_step_tokens` rend les jetons à
--     l'éditeur, les refuse au caissier, et ne franchit pas la frontière du
--     locataire — dans les DEUX sens : l'organisation demandée (garde) et la
--     chasse demandée (filtre `organization_id`). Le second est le seul qui
--     attrape un `where` posé sur `hunt_id` seul.
--  5. `anon` reste dehors, table comme fonction.
--
-- ── POURQUOI UN CAISSIER RÉEL ET PAS UN `has_column_privilege` DE PLUS ──
--
-- Parce que les trois rôles applicatifs sont LE MÊME rôle Postgres. Le
-- catalogue ne connaît qu'`authenticated` : il ne peut pas dire si un caissier
-- lit le jeton, seulement si `authenticated` le peut. Le fichier a donc besoin
-- des deux moitiés, et c'est la session qui prouve le produit.
--
-- ── CE QUE CE FICHIER NE PROUVE PAS ──
--
-- Rien sur le code appelant. Qu'aucune page ne fasse plus `select("*")` sur
-- `hunt_steps` est une propriété du TypeScript ; ici, une telle requête
-- lèverait 42501, ce qui est exactement ce qu'on veut de la base.
-- ============================================================
begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

-- ════════════════════════════════════════════════════════════
-- 1. CATALOGUE — LA RÉVOCATION, ET LA PREUVE QU'ELLE MORD
-- ════════════════════════════════════════════════════════════

select ok(
  not pg_catalog.has_column_privilege(
    'authenticated', 'public.hunt_steps', 'token', 'SELECT'),
  'JCH-1 · authenticated ne lit plus hunt_steps.token'
);

-- L'assertion jumelle, et la plus importante des deux : tant que le grant
-- TABLE-WIDE existe, la révocation de colonne ne retire rien et n'émet aucun
-- avertissement. Sans cette ligne, JCH-1 pourrait être vraie pour la mauvaise
-- raison le jour où quelqu'un re-grante la table.
select ok(
  not pg_catalog.has_table_privilege(
    'authenticated', 'public.hunt_steps', 'SELECT'),
  'JCH-2 · aucun grant SELECT table-wide ne subsiste sur hunt_steps'
);

-- ── Le contre-exemple : la caisse voit toujours ses étapes ───
select is(
  (select pg_catalog.count(*)::integer
     from pg_catalog.unnest(array[
       'id', 'hunt_id', 'organization_id', 'position',
       'label', 'hint_text', 'created_at'
     ]) as c(nom)
    where pg_catalog.has_column_privilege(
      'authenticated', 'public.hunt_steps', c.nom, 'SELECT')),
  7,
  'JCH-3 · les sept autres colonnes de hunt_steps restent lisibles en session'
);

-- ── L'écriture du jeton n'a pas bougé : createHuntStep l'écrit ─
select ok(
  pg_catalog.has_column_privilege(
    'authenticated', 'public.hunt_steps', 'token', 'INSERT'),
  'JCH-4 · le jeton reste INSERABLE en session (createHuntStep)'
);
select ok(
  pg_catalog.has_column_privilege(
    'authenticated', 'public.hunt_steps', 'token', 'UPDATE'),
  'JCH-5 · le jeton reste MODIFIABLE en session (la policy editor decide qui)'
);

-- ── Le parcours joueur passe par service_role ────────────────
select ok(
  pg_catalog.has_column_privilege(
    'service_role', 'public.hunt_steps', 'token', 'SELECT'),
  'JCH-6 · service_role garde le jeton : record_hunt_scan resout encore un QR'
);

-- ── anon reste dehors ────────────────────────────────────────
select ok(
  not pg_catalog.has_table_privilege('anon', 'public.hunt_steps', 'SELECT'),
  'JCH-7 · anon ne lit rien de hunt_steps'
);
select ok(
  not pg_catalog.has_column_privilege(
    'anon', 'public.hunt_steps', 'token', 'SELECT'),
  'JCH-8 · anon ne lit pas davantage la colonne du jeton'
);

-- ════════════════════════════════════════════════════════════
-- 2. CATALOGUE — LA FONCTION DE REMPLACEMENT (ADR-082)
--
-- La fermeture se vérifie dans le CATALOGUE, jamais par une tentative
-- d'appel : un appel refusé ne se distingue pas d'un appel cassé.
-- ════════════════════════════════════════════════════════════

select is(
  (select p.prosecdef from pg_catalog.pg_proc p
     join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'hunt_step_tokens'),
  true,
  'JCH-9 · hunt_step_tokens est security definer — c''est la premisse de sa garde'
);

select is(
  (select pg_catalog.array_to_string(p.proconfig, ',') from pg_catalog.pg_proc p
     join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'hunt_step_tokens'),
  'search_path=""',
  'JCH-10 · hunt_step_tokens fige son search_path a la chaine vide'
);

-- Les deux moitiés indissociables : une ACL NULLE vaut EXECUTE à PUBLIC par
-- défaut, et `aclexplode(null)` rend zéro ligne — sans la première assertion,
-- la seconde verdirait précisément dans le cas qu'elle doit attraper.
select isnt(
  (select p.proacl from pg_catalog.pg_proc p
     join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'hunt_step_tokens'),
  null,
  'JCH-11 · l''ACL est POSEE — une ACL nulle vaudrait EXECUTE a PUBLIC'
);

select is(
  (select pg_catalog.count(*)::integer
     from pg_catalog.pg_proc p
     join pg_catalog.pg_namespace n on n.oid = p.pronamespace
     cross join lateral pg_catalog.aclexplode(p.proacl) a
    where n.nspname = 'public'
      and p.proname = 'hunt_step_tokens'
      and a.grantee = 0),
  0,
  'JCH-12 · PUBLIC ne porte aucun privilege sur hunt_step_tokens (grantee 0)'
);

select is(
  has_function_privilege(
    'anon', 'public.hunt_step_tokens(uuid, uuid)', 'execute'),
  false,
  'JCH-13 · anon ne peut pas executer hunt_step_tokens'
);
select is(
  has_function_privilege(
    'authenticated', 'public.hunt_step_tokens(uuid, uuid)', 'execute'),
  true,
  'JCH-14 · authenticated le peut : c''est la session marchande qui appelle'
);
-- `is_org_editor` lit `auth.uid()` : sous service_role il est structurellement
-- faux et la fonction leverait toujours. Un grant qui ne peut rien executer
-- laisse croire a un chemin d'appel qui n'existe pas.
select is(
  has_function_privilege(
    'service_role', 'public.hunt_step_tokens(uuid, uuid)', 'execute'),
  false,
  'JCH-15 · service_role ne l''execute pas : il lit la table directement'
);

-- ════════════════════════════════════════════════════════════
-- FIXTURES — deux organisations, quatre comptes
--
-- `cc` en préfixe d'UUID : hexadécimal, et distinct des `ab` de hunts.test.sql
-- pour qu'un identifiant reste lisible dans un diff.
--
-- Le VOISIN porte lui aussi une chasse avec des étapes. Sans lui, « A ne voit
-- pas B » serait indistinguable d'une fonction qui ne rend jamais rien.
-- ════════════════════════════════════════════════════════════
select set_config('request.jwt.claims', '{"role":"service_role"}', true);

insert into public.organizations (id, name, slug, addon_hunts) values
  ('cc000000-0000-4000-8000-000000000001', 'Chasse A', 'tap-jch-a', true),
  ('cc000000-0000-4000-8000-000000000002', 'Chasse B', 'tap-jch-b', true);

insert into auth.users (id, email) values
  ('cc000000-0000-4000-8000-0000000000a1', 'proprio-a@tap-jch.local'),
  ('cc000000-0000-4000-8000-0000000000a2', 'editeur-a@tap-jch.local'),
  ('cc000000-0000-4000-8000-0000000000a3', 'caissier-a@tap-jch.local'),
  ('cc000000-0000-4000-8000-0000000000a4', 'proprio-b@tap-jch.local');

insert into public.organization_members (organization_id, user_id, role) values
  ('cc000000-0000-4000-8000-000000000001',
   'cc000000-0000-4000-8000-0000000000a1', 'owner'),
  ('cc000000-0000-4000-8000-000000000001',
   'cc000000-0000-4000-8000-0000000000a2', 'editor'),
  -- Membre de A, mais CAISSIER : le sujet du fichier.
  ('cc000000-0000-4000-8000-000000000001',
   'cc000000-0000-4000-8000-0000000000a3', 'cashier'),
  ('cc000000-0000-4000-8000-000000000002',
   'cc000000-0000-4000-8000-0000000000a4', 'owner');

insert into public.hunts (
  id, organization_id, name, status, order_mode, reward_label
) values
  ('cc000000-0000-4000-8000-000000000101',
   'cc000000-0000-4000-8000-000000000001',
   'Chasse du comptoir', 'active', 'free', 'Un cafe'),
  ('cc000000-0000-4000-8000-000000000201',
   'cc000000-0000-4000-8000-000000000002',
   'Chasse du voisin', 'active', 'free', 'Un the');

insert into public.hunt_steps
  (id, hunt_id, organization_id, position, label, hint_text, token) values
  ('cc000000-0000-4000-8000-000000000111',
   'cc000000-0000-4000-8000-000000000101',
   'cc000000-0000-4000-8000-000000000001', 1, 'Comptoir', 'Sous la caisse',
   'TAPJCHETAPEA00001'),
  ('cc000000-0000-4000-8000-000000000112',
   'cc000000-0000-4000-8000-000000000101',
   'cc000000-0000-4000-8000-000000000001', 2, 'Vitrine', null,
   'TAPJCHETAPEA00002'),
  ('cc000000-0000-4000-8000-000000000113',
   'cc000000-0000-4000-8000-000000000101',
   'cc000000-0000-4000-8000-000000000001', 3, 'Terrasse', null,
   'TAPJCHETAPEA00003'),
  ('cc000000-0000-4000-8000-000000000211',
   'cc000000-0000-4000-8000-000000000201',
   'cc000000-0000-4000-8000-000000000002', 1, 'Chez le voisin', null,
   'TAPJCHETAPEB00001');

-- ════════════════════════════════════════════════════════════
-- 3. LE CAISSIER, EN SESSION RÉELLE
--
-- `request.jwt.claims` porte le RÔLE (lu par `auth.role()` et par le trigger
-- d'audit), `request.jwt.claim.sub` porte l'UTILISATEUR (lu par `auth.uid()`,
-- qui préfère ce réglage-ci quand les deux existent). Les trois sessions qui
-- suivent ne changent donc que le `sub`.
-- ════════════════════════════════════════════════════════════
select set_config('request.jwt.claims', '{"role":"authenticated"}', true);
set local role authenticated;
set local "request.jwt.claim.sub" = 'cc000000-0000-4000-8000-0000000000a3';

-- LE DÉFAUT QUE CE CHANTIER FERME. Avant 20261204120000 cette requête rendait
-- trois jetons, et trois jetons suffisent à tamponner la chasse entière depuis
-- l'arrière-boutique puis à réclamer le lot.
select throws_ok(
  $q$select token from public.hunt_steps$q$,
  '42501',
  'permission denied for table hunt_steps',
  'JCH-16 · un caissier ne peut plus lire hunt_steps.token'
);

-- `select *` est le geste ORDINAIRE, celui que faisaient les pages du
-- dashboard et du studio : il expanse `token` et tombe donc aussi.
select throws_ok(
  $q$select * from public.hunt_steps$q$,
  '42501',
  'permission denied for table hunt_steps',
  'JCH-17 · un « select * » sur hunt_steps est refuse a la caisse comme ailleurs'
);

-- Le contre-exemple, en session cette fois : la caisse garde le suivi. Trois
-- étapes chez A, zéro chez le voisin — la RLS `member select` fait le reste.
select results_eq(
  $q$select count(*) from public.hunt_steps$q$,
  array[3::bigint],
  'JCH-18 · le caissier voit toujours les trois etapes de SON organisation'
);
select results_eq(
  $q$select label from public.hunt_steps order by position$q$,
  array['Comptoir', 'Vitrine', 'Terrasse'],
  'JCH-19 · il lit label, position et indice — le suivi n''est pas casse'
);

-- La porte de remplacement lui est fermée, chez lui comme chez le voisin.
select throws_ok(
  $q$select * from public.hunt_step_tokens(
      'cc000000-0000-4000-8000-000000000001',
      'cc000000-0000-4000-8000-000000000101')$q$,
  'P0001',
  'not authorized',
  'JCH-20 · le caissier est refuse par hunt_step_tokens sur SA propre chasse'
);

-- ════════════════════════════════════════════════════════════
-- 4. L'ÉDITEUR — CE QUE LA RPC EXISTE POUR RENDRE
-- ════════════════════════════════════════════════════════════
set local "request.jwt.claim.sub" = 'cc000000-0000-4000-8000-0000000000a2';

-- La lecture directe reste fermée POUR LUI AUSSI : le grant est par rôle
-- Postgres, et un éditeur est le même `authenticated` qu'un caissier. C'est la
-- raison d'être de la RPC, et cette assertion est ce qui la rend visible.
select throws_ok(
  $q$select token from public.hunt_steps$q$,
  '42501',
  'permission denied for table hunt_steps',
  'JCH-21 · meme un editeur ne lit plus la colonne : le grant est par role Postgres'
);

select results_eq(
  $q$select token from public.hunt_step_tokens(
      'cc000000-0000-4000-8000-000000000001',
      'cc000000-0000-4000-8000-000000000101')$q$,
  array['TAPJCHETAPEA00001', 'TAPJCHETAPEA00002', 'TAPJCHETAPEA00003'],
  'JCH-22 · l''editeur obtient les trois jetons par la RPC, dans l''ordre des etapes'
);

select results_eq(
  $q$select step_id from public.hunt_step_tokens(
      'cc000000-0000-4000-8000-000000000001',
      'cc000000-0000-4000-8000-000000000101')
      where token = 'TAPJCHETAPEA00002'$q$,
  array['cc000000-0000-4000-8000-000000000112'::uuid],
  'JCH-23 · chaque jeton est rendu avec l''etape qu''il designe (jointure du poster)'
);

-- La frontière du locataire, DANS LES DEUX SENS.
--
-- (a) L'organisation demandée : la garde `is_org_editor` refuse tout net.
select throws_ok(
  $q$select * from public.hunt_step_tokens(
      'cc000000-0000-4000-8000-000000000002',
      'cc000000-0000-4000-8000-000000000201')$q$,
  'P0001',
  'not authorized',
  'JCH-24 · l''editeur de A est refuse sur l''organisation du voisin'
);

-- (b) La CHASSE demandée. Ici la garde PASSE — l'appelant est bien éditeur de
-- A — et seul le filtre `organization_id` de la requête empêche les jetons du
-- voisin de sortir. C'est la seule assertion du fichier qu'un `where` posé sur
-- `hunt_id` seul ferait rougir, et c'est pour cela qu'elle existe.
select is_empty(
  $q$select * from public.hunt_step_tokens(
      'cc000000-0000-4000-8000-000000000001',
      'cc000000-0000-4000-8000-000000000201')$q$,
  'JCH-25 · la chasse du voisin ne rend rien, meme demandee sous SA propre organisation'
);

-- L'écriture n'a pas bougé : le jeton s'écrit toujours en session.
insert into public.hunt_steps
  (id, hunt_id, organization_id, position, label, token)
values
  ('cc000000-0000-4000-8000-000000000114',
   'cc000000-0000-4000-8000-000000000101',
   'cc000000-0000-4000-8000-000000000001', 4, 'Cave',
   'TAPJCHETAPEA00004');
select results_eq(
  $q$select count(*) from public.hunt_step_tokens(
      'cc000000-0000-4000-8000-000000000001',
      'cc000000-0000-4000-8000-000000000101')$q$,
  array[4::bigint],
  'JCH-26 · l''editeur cree encore une etape avec son jeton, et la RPC la rend'
);

update public.hunt_steps
   set token = 'TAPJCHETAPEA00099'
 where id = 'cc000000-0000-4000-8000-000000000114';
select results_eq(
  $q$select token from public.hunt_step_tokens(
      'cc000000-0000-4000-8000-000000000001',
      'cc000000-0000-4000-8000-000000000101')
      where step_id = 'cc000000-0000-4000-8000-000000000114'$q$,
  array['TAPJCHETAPEA00099'],
  'JCH-27 · il regenere encore un jeton : la colonne reste ecrivable'
);

-- ════════════════════════════════════════════════════════════
-- 5. LE PROPRIÉTAIRE D'EN FACE — le contre-exemple de la garde
--
-- Sans lui, JCH-24 serait indistinguable d'une fonction qui refuse tout le
-- monde : le voisin doit bien obtenir SES jetons chez lui.
-- ════════════════════════════════════════════════════════════
set local "request.jwt.claim.sub" = 'cc000000-0000-4000-8000-0000000000a4';

select results_eq(
  $q$select token from public.hunt_step_tokens(
      'cc000000-0000-4000-8000-000000000002',
      'cc000000-0000-4000-8000-000000000201')$q$,
  array['TAPJCHETAPEB00001'],
  'JCH-28 · le proprietaire d''en face obtient bien SON jeton chez lui'
);

select throws_ok(
  $q$select * from public.hunt_step_tokens(
      'cc000000-0000-4000-8000-000000000001',
      'cc000000-0000-4000-8000-000000000101')$q$,
  'P0001',
  'not authorized',
  'JCH-29 · et rien du tout chez le locataire d''a cote'
);

reset role;
select * from finish();
rollback;
