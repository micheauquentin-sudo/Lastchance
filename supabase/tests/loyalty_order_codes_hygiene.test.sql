-- ============================================================
-- QR de commande — hygiène du lot C (revue sécurité). Ce fichier PROUVE :
--
--   A. FAIBLE 2 — LA PORTE FERMÉE. `authenticated` n'a PLUS le privilège
--      `delete` sur loyalty_order_codes : le cycle delete/réinsertion qui
--      ressuscitait un jeton dépensé n'est plus possible. On vérifie aussi
--      qu'on n'a pas trop révoqué (insert/select/update(label) intacts) et
--      que service_role garde delete (cascade/admin).
--
--   B. ADR-082 — L'ACL de purge_expired_loyalty_members intacte après le
--      `create or replace` : service_role exécute, anon/authenticated non,
--      PUBLIC ne porte rien. Lu au CATALOGUE (sous postgres, les grants ne
--      contraignent pas — seul le catalogue dit la vérité).
--
--   C. FAIBLE 3 — LA RÉTENTION. La purge efface le `label` d'un code CONSOMMÉ
--      au-delà de data_retention_months, et LUI SEUL : un code consommé récent
--      le garde, un code ANCIEN mais NON consommé (à distribuer) le garde, une
--      organisation SANS rétention le garde. Le verrou consumed_at survit à
--      l'effacement (un jeton dépensé le reste). Et la purge des passeports
--      dormants — la raison d'être historique de la fonction — marche toujours.
--
-- Comme loyalty_order_codes.test.sql : `supabase test db` tourne en postgres
-- (superutilisateur), donc les privilèges de table/fonction sont éprouvés par
-- has_*_privilege (le catalogue), jamais par un appel — confondre les deux
-- ferait croire à une preuve de fermeture là où il n'y en a aucune.
-- ============================================================
begin;
create extension if not exists pgtap with schema extensions;
select plan(18);

-- ════════════════════════════════════════════════════════════
-- A. FAIBLE 2 — le droit delete a disparu pour la session marchande
-- ════════════════════════════════════════════════════════════
select ok(
  not has_table_privilege('authenticated', 'public.loyalty_order_codes', 'DELETE'),
  'authenticated ne peut PLUS supprimer un code (fin de la resurrection du pauvre)'
);
-- On n'a pas trop révoqué : émettre et lire restent le cœur du MVP.
select ok(
  has_table_privilege('authenticated', 'public.loyalty_order_codes', 'INSERT'),
  'authenticated emet toujours des codes (insert intact)'
);
select ok(
  has_table_privilege('authenticated', 'public.loyalty_order_codes', 'SELECT'),
  'authenticated lit toujours ses codes (select intact)'
);
select ok(
  has_column_privilege('authenticated', 'public.loyalty_order_codes', 'label', 'UPDATE'),
  'authenticated corrige toujours la reference de commande (update label intact)'
);
-- Le service role garde delete : cascade d'organisation et gestes admin.
select ok(
  has_table_privilege('service_role', 'public.loyalty_order_codes', 'DELETE'),
  'service_role conserve delete (cascade et administration)'
);

-- ════════════════════════════════════════════════════════════
-- B. ADR-082 — l'ACL de la purge survit au create or replace
-- ════════════════════════════════════════════════════════════
select is(
  has_function_privilege('service_role',
    'public.purge_expired_loyalty_members()', 'EXECUTE'),
  true,
  'service_role execute toujours purge_expired_loyalty_members'
);
select is(
  has_function_privilege('anon',
    'public.purge_expired_loyalty_members()', 'EXECUTE'),
  false,
  'anon n''execute pas la purge (ACL preservee, pas de retour a PUBLIC)'
);
select is(
  has_function_privilege('authenticated',
    'public.purge_expired_loyalty_members()', 'EXECUTE'),
  false,
  'authenticated n''execute pas la purge'
);
-- proacl non nul : une ACL NULLE vaudrait EXECUTE a PUBLIC par defaut, l'etat
-- exact d'un create or replace qui aurait perdu ses privileges (il ne le fait
-- pas, mais c'est precisement ce qu'on doit prouver).
select isnt(
  (select p.proacl from pg_catalog.pg_proc p
     join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'purge_expired_loyalty_members'),
  null,
  'l''ACL de la purge est POSEE (une ACL nulle vaudrait EXECUTE a PUBLIC)'
);
select is(
  (select count(*)::int
     from pg_catalog.pg_proc p
     join pg_catalog.pg_namespace n on n.oid = p.pronamespace
     cross join lateral pg_catalog.aclexplode(p.proacl) a
    where n.nspname = 'public'
      and p.proname = 'purge_expired_loyalty_members'
      and a.grantee = 0),
  0,
  'PUBLIC ne porte aucun privilege sur la purge (grantee 0)'
);

-- ════════════════════════════════════════════════════════════
-- FIXTURES — deux organisations : l'une avec rétention, l'autre sans
-- ════════════════════════════════════════════════════════════
insert into public.organizations (id, name, slug, data_retention_months) values
  ('cc000000-0000-4000-8000-000000000001', 'Retention 12', 'hyg-ret-12', 12),
  ('cc000000-0000-4000-8000-000000000002', 'Sans retention', 'hyg-no-ret', null);

insert into public.loyalty_programs (id, organization_id, name, status, validation_mode)
values
  ('cc000000-0000-4000-8000-000000000011',
   'cc000000-0000-4000-8000-000000000001', 'Prog retention', 'active', 'staff'),
  ('cc000000-0000-4000-8000-000000000012',
   'cc000000-0000-4000-8000-000000000002', 'Prog sans retention', 'active', 'staff');

-- Codes de commande. consumed_at posé À LA MAIN (postgres) pour dater la
-- consommation ; consumed_member_id null (le passeport a déjà pu être purgé).
insert into public.loyalty_order_codes
  (id, program_id, organization_id, token, label, consumed_at, created_at)
values
  -- 1. CONSOMMÉ, hors fenêtre (18 mois > 12) : le label DOIT tomber.
  ('cc000000-0000-4000-8000-000000000031',
   'cc000000-0000-4000-8000-000000000011',
   'cc000000-0000-4000-8000-000000000001', 'CMD-HYG-OLDCONS',
   'PII-a-effacer', now() - interval '18 months', now() - interval '18 months'),
  -- 2. CONSOMMÉ, dans la fenêtre (2 mois < 12) : le label RESTE.
  ('cc000000-0000-4000-8000-000000000032',
   'cc000000-0000-4000-8000-000000000011',
   'cc000000-0000-4000-8000-000000000001', 'CMD-HYG-RECENT',
   'PII-recente', now() - interval '2 months', now() - interval '2 months'),
  -- 3. NON consommé, ancien (à distribuer) : le label RESTE, quoi qu'il arrive.
  ('cc000000-0000-4000-8000-000000000033',
   'cc000000-0000-4000-8000-000000000011',
   'cc000000-0000-4000-8000-000000000001', 'CMD-HYG-UNCONS',
   'PII-a-distribuer', null, now() - interval '18 months'),
  -- 4. CONSOMMÉ ET ancien MAIS org sans rétention : le label RESTE (opt-in).
  ('cc000000-0000-4000-8000-000000000034',
   'cc000000-0000-4000-8000-000000000012',
   'cc000000-0000-4000-8000-000000000002', 'CMD-HYG-NORET',
   'PII-sans-retention', now() - interval '18 months', now() - interval '18 months');

-- Passeports : la purge des membres dormants doit toujours fonctionner.
insert into public.loyalty_members
  (id, program_id, organization_id, token_hash, last_stamp_at)
values
  -- Dormant (18 mois) : purgé.
  ('cc000000-0000-4000-8000-000000000041',
   'cc000000-0000-4000-8000-000000000011',
   'cc000000-0000-4000-8000-000000000001', repeat('a', 64),
   now() - interval '18 months'),
  -- Actif récemment (2 mois) : conservé.
  ('cc000000-0000-4000-8000-000000000042',
   'cc000000-0000-4000-8000-000000000011',
   'cc000000-0000-4000-8000-000000000001', repeat('b', 64),
   now() - interval '2 months');

-- ── On lance la purge (auth.uid() null : contexte cron, audit no-ope) ────────
select public.purge_expired_loyalty_members();

-- ════════════════════════════════════════════════════════════
-- C. FAIBLE 3 — seul le label du code consommé HORS fenêtre disparaît
-- ════════════════════════════════════════════════════════════
select is(
  (select label from public.loyalty_order_codes
    where token = 'CMD-HYG-OLDCONS'),
  null,
  'code consomme hors fenetre : le label libre est efface (RGPD)'
);
-- Le verrou survit : effacer le label ne relache pas l'anti-rejeu du §7.
select ok(
  (select consumed_at is not null from public.loyalty_order_codes
    where token = 'CMD-HYG-OLDCONS'),
  'consumed_at survit a l''effacement du label (un jeton depense le reste)'
);
select is(
  (select count(*)::int from public.loyalty_order_codes
    where token = 'CMD-HYG-OLDCONS'),
  1,
  'la LIGNE reste (on efface le label, on ne supprime pas le verrou)'
);
select is(
  (select label from public.loyalty_order_codes
    where token = 'CMD-HYG-RECENT'),
  'PII-recente',
  'code consomme DANS la fenetre : label intact'
);
select is(
  (select label from public.loyalty_order_codes
    where token = 'CMD-HYG-UNCONS'),
  'PII-a-distribuer',
  'code NON consomme (a distribuer) : label intact meme ancien'
);
select is(
  (select label from public.loyalty_order_codes
    where token = 'CMD-HYG-NORET'),
  'PII-sans-retention',
  'organisation sans data_retention_months : rien n''est purge (opt-in)'
);

-- ── La raison d'être historique de la fonction marche toujours ──────────────
select is(
  (select count(*)::int from public.loyalty_members
    where id = 'cc000000-0000-4000-8000-000000000041'),
  0,
  'passeport dormant hors fenetre : toujours purge (comportement d''origine)'
);
select is(
  (select count(*)::int from public.loyalty_members
    where id = 'cc000000-0000-4000-8000-000000000042'),
  1,
  'passeport actif recemment : conserve'
);

select finish();
rollback;
