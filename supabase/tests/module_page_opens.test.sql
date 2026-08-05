-- ============================================================
-- COMPTEUR D'OUVERTURES DES PAGES PUBLIQUES DE MODULE
--
-- Ce que ce fichier doit prouver, dans l'ordre d'importance :
--
--   1. QU'UN COMMERÇANT NE LIT PAS LE COMPTEUR D'UN AUTRE. C'est la seule
--      assertion dont l'échec coûterait un incident multi-tenant : le nombre
--      d'ouvertures d'une vitrine concurrente est une donnée commerciale.
--   2. QU'UN IDENTIFIANT INCONNU NE CRÉE RIEN. C'est la borne qui rend
--      l'endpoint public tenable : sans elle, un POST en boucle avec des
--      chaînes aléatoires fait croître la table depuis Internet. Une table de
--      comptage polymorphe SANS cette garde est un défaut de disponibilité,
--      pas un détail de propreté.
--   3. QUE LE DISCRIMINANT SERT VRAIMENT. Un slug de quiz passé en `calendar`
--      ne doit rien compter. Sans cette assertion, une RPC qui ignorerait
--      `p_module` et chercherait dans les six tables passerait tout le reste.
--   4. QUE LA PORTE `anon`/`authenticated` EST FERMÉE. Vérifiée en lisant le
--      CATALOGUE (`pg_proc` + privilèges), jamais par une tentative d'appel :
--      confondre « ça lève » et « c'est révoqué » ferait croire à une preuve
--      de fermeture là où il n'y en a aucune.
--   5. QUE L'INCRÉMENT CUMULE au lieu d'empiler des lignes.
-- ============================================================
begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

select set_config('request.jwt.claims', '{"role":"service_role"}', true);

-- ── Fixtures ────────────────────────────────────────────────
-- Deux organisations qui ne diffèrent QUE par leur identité, pour que tout
-- refus de lecture soit imputable au seul cloisonnement.
insert into public.organizations (id, name, slug, subscription_status) values
  ('5c000000-0000-4000-8000-000000000001', 'Org Compteur A', 'tap-open-a', 'active'),
  ('5c000000-0000-4000-8000-000000000002', 'Org Compteur B', 'tap-open-b', 'active');

insert into auth.users (id, email) values
  ('5c000000-0000-4000-8000-0000000000a1', 'proprio-a@tap-open.local'),
  ('5c000000-0000-4000-8000-0000000000a2', 'proprio-b@tap-open.local');

insert into public.organization_members (organization_id, user_id, role) values
  ('5c000000-0000-4000-8000-000000000001', '5c000000-0000-4000-8000-0000000000a1', 'owner'),
  ('5c000000-0000-4000-8000-000000000002', '5c000000-0000-4000-8000-0000000000a2', 'owner');

-- Une ressource par module, chez A. Toutes en brouillon : la résolution ne
-- dépend pas du statut, et rester en brouillon évite les gardes de
-- publication, qui ne sont pas le sujet de ce fichier.
insert into public.quizzes (id, organization_id, name, public_slug) values
  ('5c000000-0000-4000-8000-000000000101',
   '5c000000-0000-4000-8000-000000000001', 'Quiz A', 'tap-open-quiz-a');

insert into public.calendars (
  id, organization_id, name, start_date, timezone,
  day_count, public_slug, completion_reward_stock
) values
  ('5c000000-0000-4000-8000-000000000102',
   '5c000000-0000-4000-8000-000000000001', 'Calendrier A', date '2026-12-01',
   'Europe/Paris', 24, 'tap-open-cal-a', 0);

insert into public.jackpot_campaigns (
  id, organization_id, name, reward_stock, public_slug
) values
  ('5c000000-0000-4000-8000-000000000103',
   '5c000000-0000-4000-8000-000000000001', 'Jackpot A', 0, 'tap-open-jack-a');

insert into public.contests (id, organization_id, slug, name, competition_key) values
  ('5c000000-0000-4000-8000-000000000104',
   '5c000000-0000-4000-8000-000000000001', 'tap-open-prono-a', 'Pronos A', 'FL1');

insert into public.loyalty_programs (id, organization_id, name) values
  ('5c000000-0000-4000-8000-000000000105',
   '5c000000-0000-4000-8000-000000000001', 'Passeport A');

insert into public.event_games (id, organization_id, name) values
  ('5c000000-0000-4000-8000-000000000106',
   '5c000000-0000-4000-8000-000000000001', 'Jeu A');

insert into public.event_sessions (
  id, game_id, organization_id, join_code, reward_stock
) values
  ('5c000000-0000-4000-8000-000000000107',
   '5c000000-0000-4000-8000-000000000106',
   -- Format imposé : `^[A-HJ-NP-Z2-9]{6}$` (ni I, ni O, ni 0, ni 1 — l'alphabet
   -- est fait pour être lu à voix haute en salle sans ambiguïté).
   '5c000000-0000-4000-8000-000000000001', 'TAPQR7', 0);

-- ────────────────────────────────────────────────────────────
-- 0. LA PORTE EST FERMÉE — lu dans le catalogue, jamais par un appel
-- ────────────────────────────────────────────────────────────
select is(
  (select p.prosecdef from pg_catalog.pg_proc p
     join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'increment_module_page_open'),
  true,
  'increment_module_page_open est security definer'
);

select is(
  (select pg_catalog.array_to_string(p.proconfig, ',') from pg_catalog.pg_proc p
     join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'increment_module_page_open'),
  'search_path=""',
  'increment_module_page_open fige son search_path a la chaine vide'
);

select is(
  has_function_privilege('anon',
    'public.increment_module_page_open(text, text)', 'execute'),
  false,
  'anon ne peut pas executer increment_module_page_open'
);

select is(
  has_function_privilege('authenticated',
    'public.increment_module_page_open(text, text)', 'execute'),
  false,
  'authenticated ne peut pas executer increment_module_page_open'
);

select is(
  has_function_privilege('service_role',
    'public.increment_module_page_open(text, text)', 'execute'),
  true,
  'service_role — le client admin derriere /api/scan — peut l''executer'
);

-- ────────────────────────────────────────────────────────────
-- 1. LA BORNE : un identifiant inconnu ne crée AUCUNE ligne
--    (assertion n°2 du préambule — la disponibilité en dépend)
-- ────────────────────────────────────────────────────────────
select public.increment_module_page_open('quiz', 'slug-qui-n-existe-pas');
select public.increment_module_page_open('calendar', 'ni-celui-ci');
select public.increment_module_page_open('pronostics', 'ni-celui-la');
select public.increment_module_page_open('events', 'ZZZZZZZZ');
-- Un uuid bien formé mais inexistant : la forme est valide, la ressource non.
select public.increment_module_page_open('loyalty',
  '5c000000-0000-4000-8000-0000000000ff');
select public.increment_module_page_open('jackpot',
  '5c000000-0000-4000-8000-0000000000ff');

select is(
  (select count(*)::int from public.module_page_opens),
  0,
  'six identifiants inconnus n''ont cree AUCUNE ligne — la table est bornee par les ressources reelles'
);

-- Une chaîne malformée là où la colonne est un uuid : doit ne rien désigner,
-- surtout PAS lever une 22P02 depuis un endpoint public.
select lives_ok(
  $$select public.increment_module_page_open('loyalty', 'pas-du-tout-un-uuid')$$,
  'un identifiant malforme ne leve pas (loyalty) — le cast va de l''uuid vers le texte'
);
select lives_ok(
  $$select public.increment_module_page_open('jackpot', 'pas-du-tout-un-uuid')$$,
  'un identifiant malforme ne leve pas (jackpot)'
);

-- Module hors vocabulaire, chaîne vide, chaîne surdimensionnée : mêmes règles.
select lives_ok(
  $$select public.increment_module_page_open('module-invente', 'tap-open-quiz-a')$$,
  'un module hors vocabulaire ne leve pas'
);
select lives_ok(
  $$select public.increment_module_page_open('quiz', repeat('x', 5000))$$,
  'une chaine surdimensionnee ne leve pas (elle est refusee avant toute lecture)'
);
select lives_ok(
  $$select public.increment_module_page_open('quiz', '')$$,
  'une chaine vide ne leve pas'
);
select lives_ok(
  $$select public.increment_module_page_open(null, null)$$,
  'des arguments nuls ne levent pas'
);

select is(
  (select count(*)::int from public.module_page_opens),
  0,
  'aucune entree malformee n''a cree de ligne non plus'
);

-- ────────────────────────────────────────────────────────────
-- 2. LE DISCRIMINANT SERT VRAIMENT
--    Un slug de quiz passé en `calendar` ne compte rien. Sans cette
--    assertion, une RPC qui chercherait dans les six tables sans regarder
--    `p_module` passerait toutes les autres.
-- ────────────────────────────────────────────────────────────
select public.increment_module_page_open('calendar', 'tap-open-quiz-a');
select public.increment_module_page_open('pronostics', 'tap-open-cal-a');
select is(
  (select count(*)::int from public.module_page_opens),
  0,
  'un slug valide passe sous le MAUVAIS module ne compte rien'
);

-- ────────────────────────────────────────────────────────────
-- 3. RÉSOLUTION — les six modules, chacun par la forme de SON url
-- ────────────────────────────────────────────────────────────
select public.increment_module_page_open('quiz', 'tap-open-quiz-a');
select public.increment_module_page_open('calendar', 'tap-open-cal-a');
select public.increment_module_page_open('jackpot', 'tap-open-jack-a');
select public.increment_module_page_open('pronostics', 'tap-open-prono-a');
select public.increment_module_page_open('loyalty',
  '5c000000-0000-4000-8000-000000000105');
select public.increment_module_page_open('events',
  (select join_code from public.event_sessions
    where id = '5c000000-0000-4000-8000-000000000107'));

select is(
  (select count(*)::int from public.module_page_opens),
  6,
  'les six modules resolvent leur identifiant public et creent une ligne chacun'
);

select is(
  (select pg_catalog.string_agg(
            m.module || '=' || m.resource_id::text, ' | ' order by m.module)
     from public.module_page_opens m),
  'calendar=5c000000-0000-4000-8000-000000000102'
  || ' | events=5c000000-0000-4000-8000-000000000107'
  || ' | jackpot=5c000000-0000-4000-8000-000000000103'
  || ' | loyalty=5c000000-0000-4000-8000-000000000105'
  || ' | pronostics=5c000000-0000-4000-8000-000000000104'
  || ' | quiz=5c000000-0000-4000-8000-000000000101',
  'chaque compteur pointe la BONNE ressource — pas seulement une ressource'
);

select is(
  (select count(distinct organization_id)::int from public.module_page_opens),
  1,
  'l''organisation est resolue depuis la ressource, jamais fournie par l''appelant'
);

-- /jackpot/[id] accepte l'identifiant OU le slug : les deux doivent tomber
-- sur la même ligne, sinon un même QR compterait deux fois.
select public.increment_module_page_open('jackpot',
  '5c000000-0000-4000-8000-000000000103');
select is(
  (select open_count from public.module_page_opens
    where module = 'jackpot'),
  2,
  'jackpot : l''identifiant et le slug incrementent LA MEME ligne'
);

-- ────────────────────────────────────────────────────────────
-- 4. L'INCRÉMENT CUMULE au lieu d'empiler des lignes
-- ────────────────────────────────────────────────────────────
select public.increment_module_page_open('quiz', 'tap-open-quiz-a');
select public.increment_module_page_open('quiz', 'tap-open-quiz-a');
select is(
  (select open_count from public.module_page_opens where module = 'quiz'),
  3,
  'trois ouvertures du quiz font 3, pas trois lignes'
);
select is(
  (select count(*)::int from public.module_page_opens where module = 'quiz'),
  1,
  'et toujours une seule ligne pour ce quiz'
);
select ok(
  (select last_opened_at >= first_opened_at from public.module_page_opens
    where module = 'quiz'),
  'la derniere ouverture n''est jamais anterieure a la premiere'
);

-- ────────────────────────────────────────────────────────────
-- 5. LE CLOISONNEMENT — assertion n°1 du préambule
--    On bascule RÉELLEMENT de rôle : sous `postgres`, la RLS ne s'applique
--    pas et les deux lectures rendraient la même chose, donnant un test vert
--    qui ne garde rien.
-- ────────────────────────────────────────────────────────────
create temporary table tap_open_lecture (cas text, n int) on commit drop;

do $sonde$
declare
  v_chez_soi int;
  v_chez_autrui int;
  v_ecriture text;
begin
  -- Le propriétaire de B, qui n'est membre que de B.
  perform set_config('request.jwt.claims',
    '{"role":"authenticated","sub":"5c000000-0000-4000-8000-0000000000a2"}', true);
  set local role authenticated;

  select count(*)::int into v_chez_autrui from public.module_page_opens;

  -- Le contre-exemple, indispensable : si la RLS rendait 0 à TOUT LE MONDE,
  -- l'assertion de cloisonnement passerait sur une table simplement illisible.
  perform set_config('request.jwt.claims',
    '{"role":"authenticated","sub":"5c000000-0000-4000-8000-0000000000a1"}', true);
  select count(*)::int into v_chez_soi from public.module_page_opens;

  -- Et la porte d'à côté : lire est permis, ÉCRIRE ne l'est pas. Un éditeur
  -- qui pourrait gonfler son propre compteur rendrait le chiffre sans valeur.
  begin
    update public.module_page_opens set open_count = 9999 where module = 'quiz';
    v_ecriture := 'AUCUNE ERREUR — le compteur est falsifiable';
  exception when others then
    v_ecriture := 'refuse';
  end;

  reset role;
  perform set_config('request.jwt.claims', '{"role":"service_role"}', true);

  insert into tap_open_lecture (cas, n) values
    ('chez soi', v_chez_soi),
    ('chez autrui', v_chez_autrui),
    ('ecriture', case when v_ecriture = 'refuse' then 1 else 0 end);
end
$sonde$;
reset role;

select is(
  (select n from tap_open_lecture where cas = 'chez autrui'),
  0,
  'le proprietaire de B ne lit AUCUN compteur de A'
);
select is(
  (select n from tap_open_lecture where cas = 'chez soi'),
  6,
  'le proprietaire de A lit bien ses six compteurs — la table n''est pas juste illisible'
);
select is(
  (select n from tap_open_lecture where cas = 'ecriture'),
  1,
  'authenticated ne peut PAS ecrire le compteur — il ne s''incremente que par la RPC'
);

-- Les privilèges de table, lus dans le catalogue en complément de la sonde.
select is(
  has_table_privilege('authenticated', 'public.module_page_opens', 'select'),
  true,
  'authenticated a le SELECT (filtre par la policy)'
);
select is(
  has_table_privilege('authenticated', 'public.module_page_opens', 'update')
    or has_table_privilege('authenticated', 'public.module_page_opens', 'insert')
    or has_table_privilege('authenticated', 'public.module_page_opens', 'delete'),
  false,
  'authenticated n''a aucun droit d''ecriture sur le compteur'
);
select is(
  has_table_privilege('anon', 'public.module_page_opens', 'select'),
  false,
  'anon ne lit rien du tout'
);

select * from finish();
rollback;
