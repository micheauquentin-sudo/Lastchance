-- ============================================================
-- COMPTEUR D'OUVERTURES — LA CHASSE AU TRÉSOR, PAR ÉTAPE
--
-- `module_page_opens.test.sql` garde les six modules à compteur unique. Ce
-- fichier garde ce qui est PROPRE à la chasse, dans l'ordre d'importance :
--
--   1. QUE LE GRAIN SOIT L'ÉTAPE, ET NON LA CHASSE. C'est la raison d'être du
--      lot : deux étapes d'une MÊME chasse doivent tenir deux lignes. Si elles
--      n'en tenaient qu'une, le commerçant lirait un total qui confond la
--      boulangerie et le fleuriste — précisément le chiffre pour lequel la
--      migration 20260911120000 avait écarté la chasse.
--   2. QUE LE CHECK AIT ÉTÉ REMPLACÉ, PAS DOUBLÉ. Vérifié par le
--      COMPORTEMENT (`hunts` s'insère, `wheel` est refusé) et non sur la foi
--      du nom `module_page_opens_module_check` : une contrainte d'origine
--      restée en place refuserait `hunts` en silence, et un test qui lirait le
--      nom au lieu de l'effet passerait au vert par-dessus.
--   3. QU'UN JETON INCONNU NE CRÉE RIEN. La borne qui rend l'endpoint public
--      tenable, reprise à l'identique pour l'étape : sans elle, un POST en
--      boucle avec des jetons aléatoires fait croître la table depuis Internet.
--   4. QU'UN COMMERÇANT NE LISE PAS LES COMPTEURS D'UN AUTRE — le nombre
--      d'ouvertures d'une affiche est une donnée commerciale.
--   5. QUE L'ORGANISATION VIENNE DE L'ÉTAPE, jamais de l'appelant.
-- ============================================================
begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

select set_config('request.jwt.claims', '{"role":"service_role"}', true);

-- ── Fixtures ────────────────────────────────────────────────
-- Deux organisations qui ne diffèrent QUE par leur identité, pour que tout
-- refus de lecture soit imputable au seul cloisonnement.
insert into public.organizations (id, name, slug, subscription_status) values
  ('5d000000-0000-4000-8000-000000000001', 'Org Chasse A', 'tap-hunt-open-a', 'active'),
  ('5d000000-0000-4000-8000-000000000002', 'Org Chasse B', 'tap-hunt-open-b', 'active');

insert into auth.users (id, email) values
  ('5d000000-0000-4000-8000-0000000000a1', 'proprio-a@tap-hunt-open.local'),
  ('5d000000-0000-4000-8000-0000000000a2', 'proprio-b@tap-hunt-open.local');

insert into public.organization_members (organization_id, user_id, role) values
  ('5d000000-0000-4000-8000-000000000001', '5d000000-0000-4000-8000-0000000000a1', 'owner'),
  ('5d000000-0000-4000-8000-000000000002', '5d000000-0000-4000-8000-0000000000a2', 'owner');

-- UNE chasse chez A, avec DEUX étapes : c'est le couple qui porte l'assertion
-- n°1. En brouillon — la résolution ne dépend pas du statut, et rester en
-- brouillon évite les gardes de publication, hors sujet ici.
insert into public.hunts (id, organization_id, name) values
  ('5d000000-0000-4000-8000-000000000101',
   '5d000000-0000-4000-8000-000000000001', 'Chasse A');

insert into public.hunt_steps (id, hunt_id, organization_id, position, label, token) values
  ('5d000000-0000-4000-8000-000000000201',
   '5d000000-0000-4000-8000-000000000101',
   '5d000000-0000-4000-8000-000000000001', 1, 'Boulangerie', 'tap-hunt-open-etape-1'),
  ('5d000000-0000-4000-8000-000000000202',
   '5d000000-0000-4000-8000-000000000101',
   '5d000000-0000-4000-8000-000000000001', 2, 'Fleuriste', 'tap-hunt-open-etape-2');

-- Une chasse chez B, pour le contre-exemple de cloisonnement.
insert into public.hunts (id, organization_id, name) values
  ('5d000000-0000-4000-8000-000000000102',
   '5d000000-0000-4000-8000-000000000002', 'Chasse B');

insert into public.hunt_steps (id, hunt_id, organization_id, position, label, token) values
  ('5d000000-0000-4000-8000-000000000203',
   '5d000000-0000-4000-8000-000000000102',
   '5d000000-0000-4000-8000-000000000002', 1, 'Chez B', 'tap-hunt-open-etape-b');

-- ────────────────────────────────────────────────────────────
-- 0. LE CHECK A ÉTÉ REMPLACÉ, PAS DOUBLÉ (assertion n°2)
--    Lu par l'effet : une contrainte d'origine laissée en place refuserait
--    `hunts` sans que le nom de la nouvelle ne trahisse quoi que ce soit.
-- ────────────────────────────────────────────────────────────
select lives_ok(
  $$insert into public.module_page_opens (module, resource_id, organization_id)
    values ('hunts', '5d000000-0000-4000-8000-0000000002ff',
            '5d000000-0000-4000-8000-000000000001')$$,
  'le CHECK accepte desormais hunts — l''ancienne contrainte a bien ete remplacee'
);

select throws_ok(
  $$insert into public.module_page_opens (module, resource_id, organization_id)
    values ('wheel', '5d000000-0000-4000-8000-0000000002fe',
            '5d000000-0000-4000-8000-000000000001')$$,
  '23514',
  null,
  'le CHECK refuse toujours wheel — l''ouverture a hunts n''a pas ouvert le vocabulaire entier'
);

-- On repart d'une table vide : les deux lignes ci-dessus prouvaient la
-- contrainte, elles ne doivent pas peser sur les comptes qui suivent.
delete from public.module_page_opens;

-- ────────────────────────────────────────────────────────────
-- 1. LA BORNE : un jeton inconnu ne crée AUCUNE ligne (assertion n°3)
-- ────────────────────────────────────────────────────────────
select public.increment_module_page_open('hunts', 'jeton-qui-n-existe-pas');
select public.increment_module_page_open('hunts',
  '5d000000-0000-4000-8000-0000000000ff');

select is(
  (select count(*)::int from public.module_page_opens),
  0,
  'un jeton d''etape inconnu ne cree AUCUNE ligne — la table reste bornee par les etapes reelles'
);

select lives_ok(
  $$select public.increment_module_page_open('hunts', 'pas-du-tout-un-uuid')$$,
  'un jeton malforme ne leve pas (la colonne comparee est du texte)'
);
select lives_ok(
  $$select public.increment_module_page_open('hunts', repeat('x', 5000))$$,
  'un jeton surdimensionne ne leve pas (il est refuse avant toute lecture)'
);
select lives_ok(
  $$select public.increment_module_page_open('hunts', '')$$,
  'un jeton vide ne leve pas'
);

-- LE GRAIN, PAR LA NÉGATIVE : l'identifiant de la CHASSE n'est pas un jeton
-- d'étape. Sans cette assertion, une RPC qui résoudrait `hunts` contre la table
-- `hunts` produirait le compteur global que ce lot existe pour éviter.
select public.increment_module_page_open('hunts',
  '5d000000-0000-4000-8000-000000000101');
select is(
  (select count(*)::int from public.module_page_opens),
  0,
  'l''identifiant de la CHASSE ne compte rien — seul un jeton d''ETAPE resout'
);

-- ────────────────────────────────────────────────────────────
-- 2. LE GRAIN EST L'ÉTAPE — la raison d'être du lot (assertion n°1)
-- ────────────────────────────────────────────────────────────
select public.increment_module_page_open('hunts', 'tap-hunt-open-etape-1');
select public.increment_module_page_open('hunts', 'tap-hunt-open-etape-2');

select is(
  (select count(*)::int from public.module_page_opens where module = 'hunts'),
  2,
  'DEUX etapes d''une MEME chasse tiennent DEUX lignes — les affiches ne sont pas confondues'
);

select is(
  (select pg_catalog.string_agg(
            m.resource_id::text, ' | ' order by m.resource_id)
     from public.module_page_opens m where m.module = 'hunts'),
  '5d000000-0000-4000-8000-000000000201'
  || ' | 5d000000-0000-4000-8000-000000000202',
  'resource_id porte hunt_steps.id — l''ETAPE, et la bonne'
);

-- Le compteur d'une affiche ne bouge pas quand on scanne l'autre : c'est ce
-- que le commerçant lit pour arbitrer entre ses deux emplacements.
select public.increment_module_page_open('hunts', 'tap-hunt-open-etape-1');
select public.increment_module_page_open('hunts', 'tap-hunt-open-etape-1');

select is(
  (select open_count from public.module_page_opens
    where resource_id = '5d000000-0000-4000-8000-000000000201'),
  3,
  'trois ouvertures de l''etape 1 font 3'
);
select is(
  (select open_count from public.module_page_opens
    where resource_id = '5d000000-0000-4000-8000-000000000202'),
  1,
  'et l''etape 2 reste a 1 — les compteurs ne se contaminent pas'
);
select is(
  (select count(*)::int from public.module_page_opens where module = 'hunts'),
  2,
  'toujours deux lignes : l''increment cumule au lieu d''empiler'
);
select ok(
  (select bool_and(last_opened_at >= first_opened_at)
     from public.module_page_opens where module = 'hunts'),
  'la derniere ouverture n''est jamais anterieure a la premiere'
);

-- Le discriminant sert ici aussi : un jeton d'étape valide passé sous un AUTRE
-- module ne compte rien.
select public.increment_module_page_open('quiz', 'tap-hunt-open-etape-1');
select is(
  (select count(*)::int from public.module_page_opens),
  2,
  'un jeton d''etape valide passe sous le MAUVAIS module ne compte rien'
);

-- ────────────────────────────────────────────────────────────
-- 3. L'ORGANISATION VIENT DE L'ÉTAPE (assertion n°5)
-- ────────────────────────────────────────────────────────────
select public.increment_module_page_open('hunts', 'tap-hunt-open-etape-b');

select is(
  (select organization_id from public.module_page_opens
    where resource_id = '5d000000-0000-4000-8000-000000000203'),
  '5d000000-0000-4000-8000-000000000002'::uuid,
  'l''etape de B porte l''organisation de B — resolue depuis l''etape, jamais fournie'
);

-- ────────────────────────────────────────────────────────────
-- 4. LE CLOISONNEMENT (assertion n°4)
--    On bascule RÉELLEMENT de rôle : sous `postgres` la RLS ne s'applique pas
--    et les deux lectures rendraient la même chose, donnant un test vert qui
--    ne garde rien.
-- ────────────────────────────────────────────────────────────
create temporary table tap_hunt_open_lecture (cas text, n int) on commit drop;

do $sonde$
declare
  v_chez_a int;
  v_chez_b int;
  v_ecriture text;
begin
  perform set_config('request.jwt.claims',
    '{"role":"authenticated","sub":"5d000000-0000-4000-8000-0000000000a1"}', true);
  set local role authenticated;
  select count(*)::int into v_chez_a
    from public.module_page_opens where module = 'hunts';

  -- Le contre-exemple, indispensable : si la RLS rendait 0 à TOUT LE MONDE,
  -- l'assertion de cloisonnement passerait sur une table simplement illisible.
  perform set_config('request.jwt.claims',
    '{"role":"authenticated","sub":"5d000000-0000-4000-8000-0000000000a2"}', true);
  select count(*)::int into v_chez_b
    from public.module_page_opens where module = 'hunts';

  -- Et la porte d'à côté : lire est permis, ÉCRIRE ne l'est pas. Un éditeur
  -- qui gonflerait le compteur de sa propre affiche rendrait le chiffre sans
  -- valeur pour l'arbitrage qu'il sert.
  begin
    update public.module_page_opens set open_count = 9999
      where resource_id = '5d000000-0000-4000-8000-000000000203';
    v_ecriture := 'AUCUNE ERREUR — le compteur est falsifiable';
  exception when others then
    v_ecriture := 'refuse';
  end;

  reset role;
  perform set_config('request.jwt.claims', '{"role":"service_role"}', true);

  insert into tap_hunt_open_lecture (cas, n) values
    ('chez a', v_chez_a),
    ('chez b', v_chez_b),
    ('ecriture', case when v_ecriture = 'refuse' then 1 else 0 end);
end
$sonde$;
reset role;

select is(
  (select n from tap_hunt_open_lecture where cas = 'chez a'),
  2,
  'le proprietaire de A lit SES deux compteurs d''etape'
);
select is(
  (select n from tap_hunt_open_lecture where cas = 'chez b'),
  1,
  'le proprietaire de B ne lit QUE le sien — pas les deux affiches de A'
);
select is(
  (select n from tap_hunt_open_lecture where cas = 'ecriture'),
  1,
  'authenticated ne peut PAS ecrire le compteur — il ne s''incremente que par la RPC'
);

-- ────────────────────────────────────────────────────────────
-- 5. LA PORTE RESTE FERMÉE après réécriture de la RPC
--    `create or replace` préserve les privilèges, mais c'est justement ce
--    qu'il faut prouver plutôt que supposer : une RPC recréée par `drop` +
--    `create` les perdrait et repartirait sur le `execute` par défaut, ouvert
--    à PUBLIC.
-- ────────────────────────────────────────────────────────────
select is(
  (select p.prosecdef from pg_catalog.pg_proc p
     join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'increment_module_page_open'),
  true,
  'increment_module_page_open est toujours security definer'
);
select is(
  (select pg_catalog.array_to_string(p.proconfig, ',') from pg_catalog.pg_proc p
     join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'increment_module_page_open'),
  'search_path=""',
  'increment_module_page_open fige toujours son search_path a la chaine vide'
);
select is(
  has_function_privilege('anon',
    'public.increment_module_page_open(text, text)', 'execute'),
  false,
  'anon ne peut toujours pas executer increment_module_page_open'
);
select is(
  has_function_privilege('authenticated',
    'public.increment_module_page_open(text, text)', 'execute'),
  false,
  'authenticated ne peut toujours pas executer increment_module_page_open'
);
select is(
  has_function_privilege('service_role',
    'public.increment_module_page_open(text, text)', 'execute'),
  true,
  'service_role — le client admin derriere /api/scan — peut l''executer'
);

select * from finish();
rollback;
