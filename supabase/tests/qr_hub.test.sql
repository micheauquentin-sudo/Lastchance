-- ============================================================
-- `org_qr_hub` — CE QUE CE FICHIER DOIT PROUVER
--
--  1. La fonction fige son `search_path` et n'est exécutable ni par `anon` ni
--     par PUBLIC (ADR-082 : la fermeture se vérifie dans le CATALOGUE, jamais
--     par une tentative d'appel, qui ne distingue pas « refusé » de « cassé »).
--  2. La garde est `is_org_editor`, PAS `is_org_member`. C'est le point le plus
--     important du fichier : la fonction est `security definer`, donc elle
--     traverse la RLS de onze tables, et `campaigns`, `contests` et `qr_codes`
--     n'ont AUCUNE policy de lecture membre. Un caissier qui obtiendrait une
--     ligne ici lirait ce que la RLS lui refuse par ailleurs. Le contre-exemple
--     du caissier (assertion 8) est donc une assertion de sécurité, pas de
--     confort.
--  3. Un éditeur ne voit que SON organisation, et l'éditeur de B voit bien
--     quelque chose chez B — sans ce contre-exemple, « A ne voit pas B » serait
--     indistinguable d'une fonction qui refuse tout le monde.
--  4. Les HUIT `kind` remontent, chacun avec la forme d'URL de son module.
--  5. `url_path` est NULL exactement quand il n'y a rien à imprimer : module non
--     publié, et chasse au trésor (dont les affiches sont par étape).
--     Cas limite explicitement couvert : un pronostic `finished` GARDE son URL,
--     parce que la règle est `<> 'draft'` et non `= 'active'`.
--  6. `open_count` agrège `module_page_opens` au GRAIN RÉEL de `resource_id` —
--     la session pour `events`, l'étape pour `hunts`. Une jointure posée sur
--     l'identifiant du jeu ou de la chasse ne lèverait aucune erreur : elle
--     rendrait NULL à vie. Les sommes 7 (2 sessions) et 11 (3 étapes dont une
--     sans compteur) sont là pour rendre cette erreur visible.
--  7. Les filtres `p_kind` et `p_q`, et surtout l'ÉCHAPPEMENT de `p_q` : la
--     campagne « Promo 50% remise » existe pour qu'une recherche sur « % » rende
--     UNE ligne et non les treize. Non échappé, `%` serait un joker et
--     l'assertion 35 verdirait sur un bug.
--  8. La pagination : `total_count` est le total AVANT limite, et le tri est
--     total (trois clés) — sans départage, une ligne pourrait être vue deux fois
--     ou jamais entre deux pages.
--  9. `p_etat` NORMALISE des vocabulaires qui divergent (20260923120000). Les
--     huit tables n'ont pas les mêmes statuts : `paused` n'existe QUE sur
--     `campaigns`, `finished` QUE sur `contests`, et `termine` recouvre à la
--     fois `archived` et `finished`. C'est pour cela que les fixtures portent
--     une campagne EN PAUSE et un quiz ARCHIVÉ : sans ces deux lignes, les deux
--     seules branches de mapping non triviales ne seraient jamais exécutées et
--     le test verdirait sur sept `case` identiques.
--     La colonne `status` doit rester le vocable BRUT — le front la mappe déjà.
-- 10. `p_jamais_scanne` désigne EXACTEMENT l'ensemble que compte
--     `org_animation_center_counts.qr_never_scanned`. L'assertion qui compte
--     n'est pas « la liste rend 2 lignes » — elle est la COMPARAISON des deux
--     fonctions sur les mêmes fixtures : si l'un des deux prédicats bouge seul,
--     la tuile mènerait à une liste qui ne la confirme pas, et rien d'autre
--     dans la suite ne le verrait.
-- ============================================================
begin;
create extension if not exists pgtap with schema extensions;
select plan(85);

-- ════════════════════════════════════════════════════════════
-- PRÉAMBULE — CATALOGUE ET ACL (ADR-082)
-- ════════════════════════════════════════════════════════════
-- `security definer` est la PRÉMISSE de tout le reste de ce fichier : c'est lui
-- qui fait tomber la RLS des onze tables lues, donc lui qui rend la garde
-- `is_org_editor` nécessaire plutôt que décorative. Si la fonction repassait un
-- jour en `security invoker`, le refus du caissier (assertion 8) verdirait
-- encore — mais pour une raison entièrement différente, la RLS le bloquant à la
-- place de la garde — et l'on perdrait sans le voir la couverture du cas qui
-- compte. On lit donc la porte dans le catalogue, comme le jumeau
-- `animation_center_counts.test.sql`.
select is(
  (select p.prosecdef from pg_catalog.pg_proc p
     join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'org_qr_hub'),
  true,
  'org_qr_hub est security definer'
);

select is(
  (select pg_catalog.array_to_string(p.proconfig, ',') from pg_catalog.pg_proc p
     join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'org_qr_hub'),
  'search_path=""',
  'org_qr_hub fige son search_path a la chaine vide'
);

select is(
  has_function_privilege('anon',
    'public.org_qr_hub(uuid, text, text, text, boolean, integer, integer)',
    'execute'),
  false,
  'anon ne peut pas executer org_qr_hub'
);

select is(
  has_function_privilege('authenticated',
    'public.org_qr_hub(uuid, text, text, text, boolean, integer, integer)',
    'execute'),
  true,
  'authenticated peut l''executer — la garde interne fait le reste'
);

select is(
  has_function_privilege('service_role',
    'public.org_qr_hub(uuid, text, text, text, boolean, integer, integer)',
    'execute'),
  true,
  'service_role peut l''executer'
);

-- Les deux moitiés indissociables : une ACL NULLE vaut EXECUTE à PUBLIC par
-- défaut, et `aclexplode(null)` rend zéro ligne — sans la première assertion,
-- la seconde verdirait précisément dans le cas qu'elle doit attraper.
select isnt(
  (select p.proacl from pg_catalog.pg_proc p
     join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'org_qr_hub'),
  null,
  'l''ACL est POSEE — une ACL nulle vaudrait EXECUTE a PUBLIC par defaut'
);

select is(
  (select count(*)::int
     from pg_catalog.pg_proc p
     join pg_catalog.pg_namespace n on n.oid = p.pronamespace
     cross join lateral pg_catalog.aclexplode(p.proacl) a
    where n.nspname = 'public'
      and p.proname = 'org_qr_hub'
      and a.grantee = 0),
  0,
  'PUBLIC ne porte aucun privilege sur la fonction (grantee 0 = PUBLIC)'
);

-- ════════════════════════════════════════════════════════════
-- FIXTURES
--
-- Le préfixe `ab` des UUID est arbitraire mais hexadécimal (comme `ac` pour le
-- centre d'animation) : il rend les identifiants lisibles dans un diff.
--
-- Deux organisations. A porte les HUIT kinds ; B porte les mêmes NATURES de
-- données en quantités différentes — c'est ce qui rend un oubli de filtre
-- `organization_id` visible plutôt que muet.
--
-- Les `created_at` sont posés explicitement et tous distincts : le tri global et
-- les assertions de pagination en dépendent, et un `default now()` les rendrait
-- tous égaux à la microseconde près sur une base rapide.
-- ════════════════════════════════════════════════════════════
insert into public.organizations (id, name, slug) values
  ('ab000000-0000-4000-8000-000000000001', 'Hub A', 'tap-hub-a'),
  ('ab000000-0000-4000-8000-000000000002', 'Hub B', 'tap-hub-b');

insert into auth.users (id, email) values
  ('ab000000-0000-4000-8000-0000000000a1', 'editeur-a@tap-hub.local'),
  ('ab000000-0000-4000-8000-0000000000a2', 'editeur-b@tap-hub.local'),
  ('ab000000-0000-4000-8000-0000000000a3', 'caissier-a@tap-hub.local'),
  ('ab000000-0000-4000-8000-0000000000a4', 'inconnu@tap-hub.local');

insert into public.organization_members (organization_id, user_id, role) values
  ('ab000000-0000-4000-8000-000000000001',
   'ab000000-0000-4000-8000-0000000000a1', 'owner'),
  ('ab000000-0000-4000-8000-000000000002',
   'ab000000-0000-4000-8000-0000000000a2', 'owner'),
  -- Membre de A, mais CAISSIER : le contre-exemple de la garde (point 2).
  ('ab000000-0000-4000-8000-000000000001',
   'ab000000-0000-4000-8000-0000000000a3', 'cashier');
-- `ab…a4` n'est membre de rien : le non-membre.

-- ── A · roue : TROIS campagnes, QUATRE QR ───────────────────
-- Une ligne par QR, pas par campagne : « Roue A » en porte deux (la vitrine et
-- le comptoir), ce qui est le cas d'usage réel.
-- « Promo 50% remise » porte le `%` littéral dont dépend le test d'échappement.
--
-- « Roue en pause » porte le SEUL statut `paused` du schéma : aucune des sept
-- autres tables du hub ne connaît ce vocable, c'est donc la seule fixture qui
-- puisse exercer la branche `paused → en_pause`. Elle est datée du 2026-08-31,
-- soit AVANT toutes les autres, pour se ranger en fin de tri et laisser
-- intactes les assertions de première page.
insert into public.campaigns (id, organization_id, name, status, created_at) values
  ('ab000000-0000-4000-8000-000000000101',
   'ab000000-0000-4000-8000-000000000001', 'Roue A', 'active',
   '2026-09-13 10:00:00+00'),
  ('ab000000-0000-4000-8000-000000000102',
   'ab000000-0000-4000-8000-000000000001', 'Promo 50% remise', 'draft',
   '2026-09-11 10:00:00+00'),
  ('ab000000-0000-4000-8000-000000000103',
   'ab000000-0000-4000-8000-000000000001', 'Roue en pause', 'paused',
   '2026-08-31 10:00:00+00');

-- `tap-hub-pause` est le SECOND QR à zéro scan (avec « Comptoir ») : les deux
-- ensemble font la liste que `p_jamais_scanne` doit rendre, et le nombre que
-- `org_animation_center_counts.qr_never_scanned` doit compter.
insert into public.qr_codes
  (id, organization_id, campaign_id, slug, label, scan_count, created_at) values
  ('ab000000-0000-4000-8000-000000000111',
   'ab000000-0000-4000-8000-000000000001',
   'ab000000-0000-4000-8000-000000000101',
   'tap-hub-roue-1', 'Vitrine', 12, '2026-09-13 10:00:00+00'),
  ('ab000000-0000-4000-8000-000000000112',
   'ab000000-0000-4000-8000-000000000001',
   'ab000000-0000-4000-8000-000000000101',
   'tap-hub-roue-2', 'Comptoir', 0, '2026-09-12 10:00:00+00'),
  ('ab000000-0000-4000-8000-000000000113',
   'ab000000-0000-4000-8000-000000000001',
   'ab000000-0000-4000-8000-000000000102',
   'tap-hub-promo', 'Affiche promo', 3, '2026-09-11 10:00:00+00'),
  ('ab000000-0000-4000-8000-000000000114',
   'ab000000-0000-4000-8000-000000000001',
   'ab000000-0000-4000-8000-000000000103',
   'tap-hub-pause', 'Affiche en pause', 0, '2026-08-31 10:00:00+00');

-- ── A · quiz : un publié (avec compteur), un brouillon, un archivé ──
-- « Quiz archive » est la seule fixture `archived` du fichier : c'est elle qui
-- prouve que `archived` et le `finished` des pronostics tombent bien tous deux
-- sur `termine`, alors qu'aucune table ne porte les deux vocables.
insert into public.quizzes
  (id, organization_id, name, status, public_slug, created_at) values
  ('ab000000-0000-4000-8000-000000000201',
   'ab000000-0000-4000-8000-000000000001', 'Quiz publie', 'active',
   'tap-hub-quiz', '2026-09-10 10:00:00+00'),
  ('ab000000-0000-4000-8000-000000000202',
   'ab000000-0000-4000-8000-000000000001', 'Quiz brouillon', 'draft',
   'tap-hub-quiz-brouillon', '2026-09-09 10:00:00+00'),
  ('ab000000-0000-4000-8000-000000000203',
   'ab000000-0000-4000-8000-000000000001', 'Quiz archive', 'archived',
   'tap-hub-quiz-archive', '2026-08-30 10:00:00+00');

insert into public.module_page_opens
  (organization_id, module, resource_id, open_count) values
  ('ab000000-0000-4000-8000-000000000001', 'quiz',
   'ab000000-0000-4000-8000-000000000201', 7);

-- ── A · calendrier ──────────────────────────────────────────
insert into public.calendars
  (id, organization_id, name, status, start_date, timezone, day_count,
   public_slug, completion_reward_stock, created_at) values
  ('ab000000-0000-4000-8000-000000000301',
   'ab000000-0000-4000-8000-000000000001', 'Calendrier A', 'active',
   '2026-12-01', 'Europe/Paris', 24, 'tap-hub-cal', 0,
   '2026-09-08 10:00:00+00');

-- ── A · pronostics : les TROIS statuts ──────────────────────
-- `finished` est le cas limite du point 5 : il garde son URL.
insert into public.contests
  (id, organization_id, slug, name, competition_key, status, created_at) values
  ('ab000000-0000-4000-8000-000000000401',
   'ab000000-0000-4000-8000-000000000001', 'tap-hub-pronos-actif',
   'Pronos actif', 'tap-hub-comp', 'active', '2026-09-07 10:00:00+00'),
  ('ab000000-0000-4000-8000-000000000402',
   'ab000000-0000-4000-8000-000000000001', 'tap-hub-pronos-fini',
   'Pronos termine', 'tap-hub-comp', 'finished', '2026-09-06 10:00:00+00'),
  ('ab000000-0000-4000-8000-000000000403',
   'ab000000-0000-4000-8000-000000000001', 'tap-hub-pronos-brouillon',
   'Pronos brouillon', 'tap-hub-comp', 'draft', '2026-09-05 10:00:00+00');

-- ── A · jackpot SANS public_slug ────────────────────────────
-- `public_slug` est la seule des trois colonnes de slug à être NULLABLE :
-- ce jackpot prouve que l'URL retombe sur l'identifiant.
insert into public.jackpot_campaigns
  (id, organization_id, name, status, reward_stock, created_at) values
  ('ab000000-0000-4000-8000-000000000501',
   'ab000000-0000-4000-8000-000000000001', 'Jackpot A', 'active', 0,
   '2026-09-04 10:00:00+00');

-- ── A · passeport de fidélité (URL sur l'identifiant) ───────
insert into public.loyalty_programs
  (id, organization_id, name, status, created_at) values
  ('ab000000-0000-4000-8000-000000000601',
   'ab000000-0000-4000-8000-000000000001', 'Passeport A', 'active',
   '2026-09-03 10:00:00+00');

-- ── A · événement : UN jeu, DEUX sessions ───────────────────
-- L'URL doit être celle de la PREMIÈRE session (la plus ancienne), et le
-- compteur la SOMME des deux (3 + 4 = 7) : c'est le grain « session » du
-- point 6.
insert into public.event_games
  (id, organization_id, name, status, created_at) values
  ('ab000000-0000-4000-8000-000000000701',
   'ab000000-0000-4000-8000-000000000001', 'Event A', 'active',
   '2026-09-02 10:00:00+00');

insert into public.event_sessions
  (id, game_id, organization_id, join_code, reward_stock, created_at) values
  ('ab000000-0000-4000-8000-000000000711',
   'ab000000-0000-4000-8000-000000000701',
   'ab000000-0000-4000-8000-000000000001', 'HUBAA2', 0,
   '2026-09-02 10:00:00+00'),
  ('ab000000-0000-4000-8000-000000000712',
   'ab000000-0000-4000-8000-000000000701',
   'ab000000-0000-4000-8000-000000000001', 'HUBAA3', 0,
   '2026-09-02 11:00:00+00');

insert into public.module_page_opens
  (organization_id, module, resource_id, open_count) values
  ('ab000000-0000-4000-8000-000000000001', 'events',
   'ab000000-0000-4000-8000-000000000711', 3),
  ('ab000000-0000-4000-8000-000000000001', 'events',
   'ab000000-0000-4000-8000-000000000712', 4);

-- ── A · chasse : UNE chasse, TROIS étapes ───────────────────
-- La troisième étape n'a PAS de compteur : la somme doit valoir 11 (5 + 6) et
-- non NULL. Un `sum` sur une jointure externe qui rendrait NULL dès qu'une
-- étape manque serait attrapé ici.
insert into public.hunts
  (id, organization_id, name, status, created_at) values
  ('ab000000-0000-4000-8000-000000000801',
   'ab000000-0000-4000-8000-000000000001', 'Chasse A', 'active',
   '2026-09-01 10:00:00+00');

insert into public.hunt_steps
  (id, hunt_id, organization_id, position, label, token) values
  ('ab000000-0000-4000-8000-000000000811',
   'ab000000-0000-4000-8000-000000000801',
   'ab000000-0000-4000-8000-000000000001', 1, 'Etape 1',
   'tap-hub-etape-un-000001'),
  ('ab000000-0000-4000-8000-000000000812',
   'ab000000-0000-4000-8000-000000000801',
   'ab000000-0000-4000-8000-000000000001', 2, 'Etape 2',
   'tap-hub-etape-deux-00002'),
  ('ab000000-0000-4000-8000-000000000813',
   'ab000000-0000-4000-8000-000000000801',
   'ab000000-0000-4000-8000-000000000001', 3, 'Etape 3',
   'tap-hub-etape-trois-0003');

insert into public.module_page_opens
  (organization_id, module, resource_id, open_count) values
  ('ab000000-0000-4000-8000-000000000001', 'hunts',
   'ab000000-0000-4000-8000-000000000811', 5),
  ('ab000000-0000-4000-8000-000000000001', 'hunts',
   'ab000000-0000-4000-8000-000000000812', 6);

-- ── B · le voisin, en quantités DIFFÉRENTES ─────────────────
insert into public.campaigns (id, organization_id, name, status, created_at) values
  ('ab000000-0000-4000-8000-000000000901',
   'ab000000-0000-4000-8000-000000000002', 'Roue B', 'active',
   '2026-09-20 10:00:00+00');

insert into public.qr_codes
  (id, organization_id, campaign_id, slug, label, scan_count, created_at) values
  ('ab000000-0000-4000-8000-000000000911',
   'ab000000-0000-4000-8000-000000000002',
   'ab000000-0000-4000-8000-000000000901',
   'tap-hub-roue-b', 'Vitrine B', 99, '2026-09-20 10:00:00+00');

insert into public.quizzes
  (id, organization_id, name, status, public_slug, created_at) values
  ('ab000000-0000-4000-8000-000000000921',
   'ab000000-0000-4000-8000-000000000002', 'Quiz B', 'active',
   'tap-hub-quiz-b', '2026-09-19 10:00:00+00');

-- ════════════════════════════════════════════════════════════
-- LECTURES
--
-- Tout se lit sous JWT, puis on REVIENT au rôle de session pour écrire les
-- relevés : `authenticated` n'a aucun droit sur une table temporaire créée par
-- `postgres`, et un `insert` glissé avant le `reset role` ferait échouer le
-- fichier sur un détail de plomberie, pas sur son sujet.
--
-- Le résultat complet transite par un `jsonb` — un scalaire, donc une variable
-- plpgsql ordinaire — puis est redéployé en lignes typées après `reset role`.
-- ════════════════════════════════════════════════════════════
-- `etat` est adossé à `status`, pas à sa place : les deux colonnes coexistent
-- et le fichier assert les DEUX (le vocable brut ET sa normalisation).
create temporary table tap_hub_a (
  kind text, item_id uuid, name text, status text, etat text, url_path text,
  open_count bigint, qr_id uuid, qr_slug text, qr_label text, qr_style jsonb,
  scan_count bigint, extra_count integer, created_at timestamptz,
  total_count bigint
) on commit drop;

create temporary table tap_hub_b (
  kind text, item_id uuid, name text, status text, etat text, url_path text,
  open_count bigint, qr_id uuid, qr_slug text, qr_label text, qr_style jsonb,
  scan_count bigint, extra_count integer, created_at timestamptz,
  total_count bigint
) on commit drop;

create temporary table tap_hub_err (
  cas text, erreur text
) on commit drop;

-- `premier` porte le `name` de la première ligne rendue : c'est ce qui permet
-- d'asserter le TRI et l'absence de recouvrement entre deux pages.
-- `kinds` et `scans` servent aux scénarios de `p_jamais_scanne` : ils disent
-- respectivement quels types et quels compteurs de scan la page a rendus, ce
-- qu'un simple compte de lignes ne dirait pas.
create temporary table tap_hub_filtre (
  cas text, n integer, total bigint, premier text, kinds text, scans text
) on commit drop;

-- Relevé de la PARITÉ avec le Centre d'animation : une ligne, deux nombres qui
-- doivent être égaux.
create temporary table tap_hub_parite (
  hub integer, tuile integer
) on commit drop;

do $sonde$
declare
  v_a jsonb;
  v_b jsonb;
  v_err_ab text;
  v_err_caissier text;
  v_err_inconnu text;
begin
  -- ── L'éditeur de A, chez A ────────────────────────────────
  perform set_config('request.jwt.claims',
    '{"role":"authenticated","sub":"ab000000-0000-4000-8000-0000000000a1"}', true);
  set local role authenticated;

  select jsonb_agg(to_jsonb(t)) into v_a
    from public.org_qr_hub(
      'ab000000-0000-4000-8000-000000000001', null, null, null, false, 100, 0) t;

  -- ── Le même, chez B : refusé ──────────────────────────────
  begin
    perform 1 from public.org_qr_hub(
      'ab000000-0000-4000-8000-000000000002', null, null, null, false, 100, 0);
    v_err_ab := 'AUCUNE ERREUR — le hub du voisin est lisible';
  exception when others then
    v_err_ab := sqlerrm;
  end;

  -- ── Le CAISSIER de A : membre, mais pas éditeur ───────────
  -- L'assertion de sécurité du fichier : `campaigns`, `contests` et `qr_codes`
  -- n'ont pas de policy de lecture membre, et cette RPC est `security definer`.
  perform set_config('request.jwt.claims',
    '{"role":"authenticated","sub":"ab000000-0000-4000-8000-0000000000a3"}', true);
  begin
    perform 1 from public.org_qr_hub(
      'ab000000-0000-4000-8000-000000000001', null, null, null, false, 100, 0);
    v_err_caissier := 'AUCUNE ERREUR — un caissier lit les slugs et statuts du patron';
  exception when others then
    v_err_caissier := sqlerrm;
  end;

  -- ── Un inconnu, membre de rien ────────────────────────────
  perform set_config('request.jwt.claims',
    '{"role":"authenticated","sub":"ab000000-0000-4000-8000-0000000000a4"}', true);
  begin
    perform 1 from public.org_qr_hub(
      'ab000000-0000-4000-8000-000000000001', null, null, null, false, 100, 0);
    v_err_inconnu := 'AUCUNE ERREUR — un non-membre lit le hub';
  exception when others then
    v_err_inconnu := sqlerrm;
  end;

  -- ── L'éditeur de B, chez B : le CONTRE-EXEMPLE ────────────
  perform set_config('request.jwt.claims',
    '{"role":"authenticated","sub":"ab000000-0000-4000-8000-0000000000a2"}', true);
  select jsonb_agg(to_jsonb(t)) into v_b
    from public.org_qr_hub(
      'ab000000-0000-4000-8000-000000000002', null, null, null, false, 100, 0) t;

  -- ── Retour chez A pour les filtres et la pagination ───────
  perform set_config('request.jwt.claims',
    '{"role":"authenticated","sub":"ab000000-0000-4000-8000-0000000000a1"}', true);

  reset role;
  perform set_config('request.jwt.claims', '{"role":"service_role"}', true);

  insert into tap_hub_a
  select * from jsonb_populate_recordset(null::tap_hub_a, v_a);
  insert into tap_hub_b
  select * from jsonb_populate_recordset(null::tap_hub_b, v_b);

  insert into tap_hub_err (cas, erreur) values
    ('A chez B', v_err_ab),
    ('caissier A', v_err_caissier),
    ('inconnu', v_err_inconnu);
end
$sonde$;
reset role;

-- Les scénarios de filtre et de pagination, chacun sous l'identité de l'éditeur
-- de A. Une procédure locale éviterait la répétition, mais rendrait le fichier
-- moins lisible qu'il n'est long.
do $filtres$
declare
  v_n integer;
  v_total bigint;
  v_premier text;
  v_kinds text;
  v_scans text;
  v_scenario record;
  -- Même discipline que le bloc précédent : on ACCUMULE dans un scalaire jsonb
  -- et on n'écrit qu'après `reset role`. Une table temporaire de travail créée
  -- ici ne marcherait pas — `authenticated` n'a pas le privilège TEMPORARY sur
  -- la base, et l'échec porterait sur la plomberie du test, pas sur son sujet.
  v_releve jsonb := '[]'::jsonb;
begin
  perform set_config('request.jwt.claims',
    '{"role":"authenticated","sub":"ab000000-0000-4000-8000-0000000000a1"}', true);
  set local role authenticated;

  for v_scenario in
    select * from (values
      ('kind pronostics', 'pronostics', null::text,      null::text,   false, 100, 0),
      ('kind campaign',   'campaign',   null,            null,         false, 100, 0),
      ('kind inconnu',    'zzz',        null,            null,         false, 100, 0),
      ('q sur nom',       null,         'Passeport',     null,         false, 100, 0),
      ('q sur qr_label',  null,         'Vitrine',       null,         false, 100, 0),
      ('q sur qr_slug',   null,         'tap-hub-promo', null,         false, 100, 0),
      ('q joker pourcent',null,         '%',             null,         false, 100, 0),
      ('q joker souligne',null,         '_',             null,         false, 100, 0),
      ('page 1',          null,         null,            null,         false, 5,   0),
      ('page 3',          null,         null,            null,         false, 5,   10),
      -- ── `p_etat` : les quatre valeurs normalisées, plus le hors-vocabulaire
      ('etat brouillon',  null,         null,            'brouillon',  false, 100, 0),
      ('etat actif',      null,         null,            'actif',      false, 100, 0),
      ('etat en_pause',   null,         null,            'en_pause',   false, 100, 0),
      ('etat termine',    null,         null,            'termine',    false, 100, 0),
      ('etat inconnu',    null,         null,            'zzz',        false, 100, 0),
      -- Le vocable BRUT ne doit PAS être accepté par `p_etat` : c'est ce qui
      -- distingue une vraie normalisation d'un `p_etat` qui laisserait passer
      -- les deux et masquerait un mapping oublié sur une branche.
      ('etat brut draft', null,         null,            'draft',      false, 100, 0),
      -- Combinaisons : le filtre d'état s'ajoute aux autres, il ne les remplace pas.
      ('etat+kind quiz',  'quiz',       null,            'termine',    false, 100, 0),
      ('etat+kind campagne','campaign', null,            'brouillon',  false, 100, 0),
      ('etat+q',          null,         'Pronos',        'termine',    false, 100, 0),
      -- ── `p_jamais_scanne`
      ('jamais scanne',   null,         null,            null,         true,  100, 0),
      ('jamais scanne faux',null,       null,            null,         false, 100, 0),
      -- Un module sans affiche ne peut pas être « jamais scanné » : la
      -- combinaison doit rendre ZÉRO, pas la liste des quiz.
      ('jamais+kind quiz','quiz',       null,            null,         true,  100, 0),
      ('jamais+kind campagne','campaign',null,           null,         true,  100, 0),
      ('jamais+q',        null,         'Comptoir',      null,         true,  100, 0),
      ('jamais+etat actif',null,        null,            'actif',      true,  100, 0)
    ) as s(cas, kind, q, etat, jamais, lim, dep)
  loop
    select count(*)::integer,
           max(t.total_count),
           (array_agg(t.name order by t.created_at desc))[1],
           coalesce(string_agg(distinct t.kind, ',' order by t.kind), '(rien)'),
           coalesce(string_agg(distinct t.scan_count::text, ','
                               order by t.scan_count::text), '(rien)')
      into v_n, v_total, v_premier, v_kinds, v_scans
      from public.org_qr_hub(
        'ab000000-0000-4000-8000-000000000001',
        v_scenario.kind, v_scenario.q, v_scenario.etat, v_scenario.jamais,
        v_scenario.lim, v_scenario.dep) t;

    v_releve := v_releve || jsonb_build_object(
      'cas', v_scenario.cas, 'n', v_n, 'total', v_total, 'premier', v_premier,
      'kinds', v_kinds, 'scans', v_scans);
  end loop;

  reset role;
  perform set_config('request.jwt.claims', '{"role":"service_role"}', true);

  insert into tap_hub_filtre
  select * from jsonb_populate_recordset(null::tap_hub_filtre, v_releve);
end
$filtres$;
reset role;

-- ════════════════════════════════════════════════════════════
-- LA PARITÉ AVEC LE CENTRE D'ANIMATION
--
-- Les deux fonctions sont interrogées SOUS LA MÊME IDENTITÉ et sur la MÊME
-- organisation, dans le même bloc — c'est la condition pour que la comparaison
-- prouve quelque chose. Toutes deux sont gardées par `is_org_editor`, donc
-- l'éditeur de A les atteint l'une comme l'autre.
--
-- Ce qu'on compare : le NOMBRE DE LIGNES rendues par `p_jamais_scanne = true`
-- et le compteur `qr_never_scanned` de la tuile. Les deux valent 2 sur ces
-- fixtures (« Comptoir » et « Affiche en pause »), mais le chiffre importe
-- moins que l'égalité : c'est elle qui casse le jour où l'un des deux
-- prédicats bouge seul.
-- ════════════════════════════════════════════════════════════
do $parite$
declare
  v_hub integer;
  v_tuile integer;
begin
  perform set_config('request.jwt.claims',
    '{"role":"authenticated","sub":"ab000000-0000-4000-8000-0000000000a1"}', true);
  set local role authenticated;

  select count(*)::integer into v_hub
    from public.org_qr_hub(
      'ab000000-0000-4000-8000-000000000001', null, null, null, true, 100, 0) t;

  select c.qr_never_scanned into v_tuile
    from public.org_animation_center_counts(
      'ab000000-0000-4000-8000-000000000001') c;

  reset role;
  perform set_config('request.jwt.claims', '{"role":"service_role"}', true);

  insert into tap_hub_parite (hub, tuile) values (v_hub, v_tuile);
end
$parite$;
reset role;

-- ════════════════════════════════════════════════════════════
-- 1. LA GARDE — `is_org_editor`, PAS `is_org_member`
-- ════════════════════════════════════════════════════════════
select is(
  (select erreur from tap_hub_err where cas = 'A chez B'),
  'not authorized',
  'l''editeur de A est refuse chez B'
);

select is(
  (select erreur from tap_hub_err where cas = 'caissier A'),
  'not authorized',
  'le CAISSIER de A est refuse : campaigns/contests/qr_codes n''ont pas de lecture membre'
);

select is(
  (select erreur from tap_hub_err where cas = 'inconnu'),
  'not authorized',
  'un non-membre est refuse'
);

-- Le contre-exemple : sans lui, « A ne voit pas B » serait indistinguable
-- d'une fonction qui refuse tout le monde ou rend zéro à tous.
select is(
  (select count(*)::int from tap_hub_b),
  2,
  'l''editeur de B voit bien ses DEUX lignes — la fonction ne refuse pas tout le monde'
);

select is(
  (select count(*)::int from tap_hub_b
    where name in ('Roue A', 'Promo 50% remise', 'Quiz publie', 'Chasse A')),
  0,
  'aucune ligne de A ne fuit dans le hub de B'
);

-- ════════════════════════════════════════════════════════════
-- 2. LE CONTENU GLOBAL DE A
-- ════════════════════════════════════════════════════════════
select is(
  (select count(*)::int from tap_hub_a),
  15,
  'A voit 15 lignes : 4 QR de roue + 3 quiz + 1 calendrier + 3 pronostics + 1 jackpot + 1 fidelite + 1 evenement + 1 chasse'
);

select is(
  (select max(total_count) from tap_hub_a),
  15::bigint,
  'total_count vaut 15 sur chaque ligne — le total AVANT pagination'
);

select is(
  (select string_agg(distinct kind, ',' order by kind) from tap_hub_a),
  'calendar,campaign,event,hunt,jackpot,loyalty,pronostics,quiz',
  'les HUIT kinds remontent, et le pronostic s''appelle bien « pronostics »'
);

-- ════════════════════════════════════════════════════════════
-- 3. LA ROUE — UNE LIGNE PAR QR, PAS PAR CAMPAGNE
-- ════════════════════════════════════════════════════════════
select is(
  (select count(*)::int from tap_hub_a where kind = 'campaign'),
  4,
  'quatre lignes de roue pour TROIS campagnes : une par QR'
);

select is(
  (select name from tap_hub_a where qr_slug = 'tap-hub-roue-1'),
  'Roue A',
  'name porte le nom de la CAMPAGNE, pas le libelle du QR'
);

select is(
  (select url_path from tap_hub_a where qr_slug = 'tap-hub-roue-1'),
  '/play/tap-hub-roue-1',
  'l''URL de la roue est batie sur le slug du QR'
);

select is(
  (select qr_label || '/' || scan_count::text || '/' ||
          (qr_id = 'ab000000-0000-4000-8000-000000000111')::text
     from tap_hub_a where qr_slug = 'tap-hub-roue-1'),
  'Vitrine/12/true',
  'qr_label, scan_count et qr_id sont remplis pour la roue'
);

select is(
  (select count(*)::int from tap_hub_a
    where kind = 'campaign' and open_count is not null),
  0,
  'open_count reste NULL pour la roue — son compteur est scan_count'
);

select is(
  (select count(*)::int from tap_hub_a
    where kind <> 'campaign' and (qr_id is not null or scan_count is not null)),
  0,
  'les sept autres modules n''ont ni qr_id ni scan_count'
);

-- ════════════════════════════════════════════════════════════
-- 4. LES URL DE CHAQUE MODULE, ET LE NULL QUI VEUT DIRE
--    « RIEN À IMPRIMER »
-- ════════════════════════════════════════════════════════════
select is(
  (select url_path from tap_hub_a where name = 'Quiz publie'),
  '/quiz/tap-hub-quiz',
  'quiz publie : URL sur le public_slug'
);

select is(
  (select url_path from tap_hub_a where name = 'Quiz brouillon'),
  null,
  'quiz brouillon : url_path NULL — rien a imprimer'
);

select is(
  (select url_path from tap_hub_a where name = 'Calendrier A'),
  '/calendar/tap-hub-cal',
  'calendrier publie : URL sur le public_slug'
);

select is(
  (select url_path from tap_hub_a where name = 'Pronos actif'),
  '/pronos/tap-hub-pronos-actif',
  'pronostic actif : URL sur le slug'
);

-- LE cas limite : la regle est `<> draft`, pas `= active`.
select is(
  (select url_path from tap_hub_a where name = 'Pronos termine'),
  '/pronos/tap-hub-pronos-fini',
  'pronostic FINISHED : garde son URL (classement, reclamation)'
);

select is(
  (select url_path from tap_hub_a where name = 'Pronos brouillon'),
  null,
  'pronostic brouillon : url_path NULL'
);

select is(
  (select url_path from tap_hub_a where name = 'Jackpot A'),
  '/jackpot/ab000000-0000-4000-8000-000000000501',
  'jackpot SANS public_slug : l''URL retombe sur l''identifiant'
);

select is(
  (select url_path from tap_hub_a where name = 'Passeport A'),
  '/passeport/ab000000-0000-4000-8000-000000000601',
  'passeport : URL sur l''identifiant, il n''a pas de slug'
);

-- ════════════════════════════════════════════════════════════
-- 5. LE GRAIN RÉEL DES COMPTEURS — SESSION ET ÉTAPE
-- ════════════════════════════════════════════════════════════
select is(
  (select url_path from tap_hub_a where name = 'Event A'),
  '/event/HUBAA2',
  'evenement : URL sur le code de jonction de la PREMIERE session'
);

select is(
  (select extra_count from tap_hub_a where name = 'Event A'),
  2,
  'evenement : extra_count = 2 sessions — la seconde n''est pas invisible'
);

select is(
  (select open_count from tap_hub_a where name = 'Event A'),
  7::bigint,
  'evenement : open_count = 3 + 4, somme sur les SESSIONS (grain de resource_id)'
);

select is(
  (select url_path from tap_hub_a where name = 'Chasse A'),
  null,
  'chasse : url_path TOUJOURS NULL — les affiches sont par etape'
);

select is(
  (select extra_count from tap_hub_a where name = 'Chasse A'),
  3,
  'chasse : extra_count = 3 etapes'
);

select is(
  (select open_count from tap_hub_a where name = 'Chasse A'),
  11::bigint,
  'chasse : open_count = 5 + 6, somme sur les ETAPES (la 3e n''a pas de compteur)'
);

select is(
  (select open_count from tap_hub_a where name = 'Quiz publie'),
  7::bigint,
  'quiz : open_count lu directement, le grain est le module'
);

select is(
  (select open_count from tap_hub_a where name = 'Quiz brouillon'),
  null,
  'sans ligne de compteur, open_count est NULL et non 0'
);

-- ════════════════════════════════════════════════════════════
-- 6. LES FILTRES
-- ════════════════════════════════════════════════════════════
select is(
  (select n from tap_hub_filtre where cas = 'kind pronostics'),
  3,
  'p_kind = pronostics : les trois concours, tous statuts confondus'
);

select is(
  (select total from tap_hub_filtre where cas = 'kind pronostics'),
  3::bigint,
  'total_count suit le filtre — il vaut 3, pas 13'
);

select is(
  (select n from tap_hub_filtre where cas = 'kind campaign'),
  4,
  'p_kind = campaign : les quatre QR'
);

select is(
  (select n from tap_hub_filtre where cas = 'kind inconnu'),
  0,
  'un p_kind hors vocabulaire rend zero ligne, sans lever'
);

select is(
  (select n from tap_hub_filtre where cas = 'q sur nom'),
  1,
  'p_q trouve sur le nom'
);

select is(
  (select n from tap_hub_filtre where cas = 'q sur qr_label'),
  1,
  'p_q trouve sur le libelle du QR'
);

select is(
  (select n from tap_hub_filtre where cas = 'q sur qr_slug'),
  1,
  'p_q trouve sur le slug du QR'
);

-- ════════════════════════════════════════════════════════════
-- 7. L'ÉCHAPPEMENT DE `p_q`
--
-- Non échappé, `%` serait un joker : la recherche rendrait les TREIZE lignes et
-- l'assertion suivante verdirait sur un bug. C'est « Promo 50% remise » qui
-- rend la différence observable.
-- ════════════════════════════════════════════════════════════
select is(
  (select n from tap_hub_filtre where cas = 'q joker pourcent'),
  1,
  'p_q = « % » ne trouve QUE la campagne au % litteral — le joker est echappe'
);

select is(
  (select n from tap_hub_filtre where cas = 'q joker souligne'),
  0,
  'p_q = « _ » ne trouve rien — le joker d''un caractere est echappe aussi'
);

-- ════════════════════════════════════════════════════════════
-- 8. LA PAGINATION
-- ════════════════════════════════════════════════════════════
select is(
  (select n from tap_hub_filtre where cas = 'page 1'),
  5,
  'page 1 : cinq lignes'
);

select is(
  (select total from tap_hub_filtre where cas = 'page 1'),
  15::bigint,
  'total_count reste 15 malgre la limite — c''est le total AVANT pagination'
);

select is(
  (select n from tap_hub_filtre where cas = 'page 3'),
  5,
  'page 3 (offset 10) : les cinq dernieres lignes'
);

select is(
  (select premier from tap_hub_filtre where cas = 'page 1'),
  'Roue A',
  'le tri est created_at decroissant : le QR le plus recent ouvre la page 1'
);

select is(
  (select premier from tap_hub_filtre where cas = 'page 3'),
  'Passeport A',
  'la page 3 reprend ou la 2 s''arrete, sans recouvrement'
);

-- ════════════════════════════════════════════════════════════
-- 9. `etat` — LA NORMALISATION, BRANCHE PAR BRANCHE
--
-- Le mapping est écrit huit fois dans la RPC, une par branche de l'union. Sept
-- de ces huit sont identiques (`draft`/`active`/`archived`) ; les assertions
-- qui comptent vraiment sont donc les DEUX autres, `paused` et `finished`, et
-- elles n'existent chacune que sur UNE table. Un fichier qui ne les couvrirait
-- pas verdirait sur un mapping recopié de travers.
-- ════════════════════════════════════════════════════════════
select is(
  (select etat from tap_hub_a where qr_slug = 'tap-hub-roue-1'),
  'actif',
  'campagne active → etat actif'
);

select is(
  (select etat from tap_hub_a where qr_slug = 'tap-hub-promo'),
  'brouillon',
  'campagne draft → etat brouillon'
);

-- LE cas propre à `campaigns` : aucune des sept autres tables ne connaît
-- `paused`, c'est la seule ligne du fichier qui puisse exercer cette branche.
select is(
  (select etat from tap_hub_a where qr_slug = 'tap-hub-pause'),
  'en_pause',
  'campagne paused → etat en_pause (statut propre a campaigns)'
);

select is(
  (select etat from tap_hub_a where name = 'Quiz publie'),
  'actif',
  'quiz active → etat actif'
);

select is(
  (select etat from tap_hub_a where name = 'Quiz brouillon'),
  'brouillon',
  'quiz draft → etat brouillon'
);

select is(
  (select etat from tap_hub_a where name = 'Quiz archive'),
  'termine',
  'quiz archived → etat termine'
);

select is(
  (select etat from tap_hub_a where name = 'Pronos actif'),
  'actif',
  'pronostic active → etat actif'
);

-- L'AUTRE cas propre : `contests` est la seule table à porter `finished`, et
-- elle n'a pas d'`archived`. Les deux vocables tombent sur `termine`, ce qui
-- est tout l'intérêt de la normalisation — et tout son risque.
select is(
  (select etat from tap_hub_a where name = 'Pronos termine'),
  'termine',
  'pronostic finished → etat termine, comme archived ailleurs'
);

select is(
  (select etat from tap_hub_a where name = 'Pronos brouillon'),
  'brouillon',
  'pronostic draft → etat brouillon'
);

select is(
  (select string_agg(distinct kind || ':' || etat, ','
                     order by kind || ':' || etat)
     from tap_hub_a
    where kind in ('calendar', 'jackpot', 'loyalty', 'event', 'hunt')),
  'calendar:actif,event:actif,hunt:actif,jackpot:actif,loyalty:actif',
  'les cinq branches restantes mappent active → actif'
);

-- `etat` s'AJOUTE, il ne remplace pas : le front mappe déjà `status` pour ses
-- pastilles, et une normalisation qui écraserait le vocable brut casserait cet
-- affichage sans qu'aucune autre assertion ne le voie.
select is(
  (select string_agg(status || '/' || etat, ' ' order by name)
     from tap_hub_a
    where name in ('Roue en pause', 'Pronos termine')),
  'finished/termine paused/en_pause',
  'status reste le vocable BRUT a cote de etat — les deux colonnes coexistent'
);

select is(
  (select count(*)::int from tap_hub_a where etat is null),
  0,
  'aucune ligne ne sort avec un etat NULL — les huit branches mappent toutes'
);

-- Le vocabulaire est FERMÉ : les quatre valeurs sont présentes, et rien
-- d'autre. Une branche qui laisserait fuir son vocable brut (`archived`,
-- `finished`, `draft`) casserait ici, même si sa ligne était bien mappée
-- ailleurs.
select is(
  (select string_agg(distinct etat, ',' order by etat) from tap_hub_a),
  'actif,brouillon,en_pause,termine',
  'le vocabulaire normalise est ferme : ces quatre valeurs, et aucune autre'
);

-- ════════════════════════════════════════════════════════════
-- 10. `p_etat` — LE FILTRE
-- ════════════════════════════════════════════════════════════
select is(
  (select n from tap_hub_filtre where cas = 'etat brouillon'),
  3,
  'p_etat = brouillon : le QR de la campagne draft + le quiz + le pronostic'
);

select is(
  (select n from tap_hub_filtre where cas = 'etat actif'),
  9,
  'p_etat = actif : 2 QR de Roue A + quiz + calendrier + pronos + jackpot + fidelite + event + chasse'
);

select is(
  (select n from tap_hub_filtre where cas = 'etat en_pause'),
  1,
  'p_etat = en_pause : la seule affiche de la campagne en pause'
);

select is(
  (select n from tap_hub_filtre where cas = 'etat termine'),
  2,
  'p_etat = termine : le quiz ARCHIVE et le pronostic FINISHED, deux vocables pour un etat'
);

-- 3 + 9 + 1 + 2 = 15 : la partition est complete et sans recouvrement. Sans
-- cette assertion, quatre filtres pourraient chacun rendre un sous-ensemble
-- plausible tout en oubliant des lignes au passage.
select is(
  (select sum(n)::int from tap_hub_filtre
    where cas in ('etat brouillon', 'etat actif', 'etat en_pause', 'etat termine')),
  15,
  'les quatre etats PARTITIONNENT les 15 lignes : aucune oubliee, aucune comptee deux fois'
);

select is(
  (select n from tap_hub_filtre where cas = 'etat inconnu'),
  0,
  'un p_etat hors vocabulaire rend zero ligne, sans lever — comme p_kind'
);

-- La distinction que ce fichier doit protéger : `p_etat` prend le vocabulaire
-- NORMALISÉ, jamais le brut. S'il acceptait « draft », la normalisation serait
-- décorative et une branche non mappée passerait inaperçue.
select is(
  (select n from tap_hub_filtre where cas = 'etat brut draft'),
  0,
  'p_etat n''accepte PAS le vocable brut « draft » — il prend l''etat normalise'
);

select is(
  (select total from tap_hub_filtre where cas = 'etat actif'),
  9::bigint,
  'total_count suit p_etat — il vaut 9, pas 15'
);

select is(
  (select n from tap_hub_filtre where cas = 'etat+kind quiz'),
  1,
  'p_etat et p_kind se CUMULENT : quiz + termine = le seul quiz archive'
);

select is(
  (select n from tap_hub_filtre where cas = 'etat+kind campagne'),
  1,
  'campaign + brouillon : l''affiche de « Promo 50% remise », pas les quatre QR'
);

select is(
  (select n from tap_hub_filtre where cas = 'etat+q'),
  1,
  'p_etat et p_q se cumulent aussi : « Pronos » + termine = une seule ligne sur trois'
);

-- ════════════════════════════════════════════════════════════
-- 11. `p_jamais_scanne`
-- ════════════════════════════════════════════════════════════
select is(
  (select n from tap_hub_filtre where cas = 'jamais scanne'),
  2,
  'p_jamais_scanne : « Comptoir » et « Affiche en pause », les deux QR a zero scan'
);

-- Les sept autres modules n'ont pas de `scan_count` : ils doivent disparaître
-- ENTIÈREMENT, et pas seulement « ne pas gêner ».
select is(
  (select kinds from tap_hub_filtre where cas = 'jamais scanne'),
  'campaign',
  'p_jamais_scanne ne rend QUE des lignes campaign — les sept autres modules sortent'
);

select is(
  (select scans from tap_hub_filtre where cas = 'jamais scanne'),
  '0',
  'toutes les lignes rendues ont scan_count = 0, aucune autre valeur'
);

-- Le contre-exemple sans lequel les trois assertions ci-dessus seraient
-- indistinguables d'un filtre qui viderait tout : à faux, rien n'est filtré.
select is(
  (select n from tap_hub_filtre where cas = 'jamais scanne faux'),
  15,
  'p_jamais_scanne = false ne filtre RIEN — les 15 lignes reviennent'
);

select is(
  (select n from tap_hub_filtre where cas = 'jamais+kind quiz'),
  0,
  'p_jamais_scanne + kind quiz : zero — un quiz n''a pas d''affiche a scanner'
);

select is(
  (select n from tap_hub_filtre where cas = 'jamais+kind campagne'),
  2,
  'p_jamais_scanne + kind campaign : les deux memes lignes, le kind est redondant'
);

select is(
  (select n from tap_hub_filtre where cas = 'jamais+q'),
  1,
  'p_jamais_scanne + p_q « Comptoir » : une seule des deux affiches a zero scan'
);

-- Les deux QR à zéro scan appartiennent à des campagnes d'états DIFFÉRENTS
-- (« Roue A » active, « Roue en pause » en pause) : la combinaison prouve donc
-- que les deux filtres se cumulent au lieu que l'un écrase l'autre.
select is(
  (select n from tap_hub_filtre where cas = 'jamais+etat actif'),
  1,
  'p_jamais_scanne + p_etat actif : « Comptoir » seul, « Affiche en pause » est en_pause'
);

-- ════════════════════════════════════════════════════════════
-- 12. LA PARITÉ AVEC LA TUILE DU CENTRE D'ANIMATION
--
-- C'est l'assertion pour laquelle ce chantier existe : une tuile qui compte 2
-- et une liste qui en montre 3 est un compteur menteur, et rien d'autre dans
-- la suite ne verrait la divergence — les deux fonctions sont testées dans des
-- fichiers séparés, sur des fixtures séparées, et resteraient vertes chacune
-- de son côté.
-- ════════════════════════════════════════════════════════════
select is(
  (select hub from tap_hub_parite),
  (select tuile from tap_hub_parite),
  'org_qr_hub(p_jamais_scanne) rend EXACTEMENT ce que qr_never_scanned compte'
);

-- Le contre-exemple indispensable : sans lui, « hub = tuile » verdirait sur
-- 0 = 0, c'est-à-dire sur deux fonctions cassées de la même façon.
select is(
  (select tuile from tap_hub_parite),
  2,
  'et ce nombre commun vaut bien 2 — l''egalite ci-dessus n''est pas 0 = 0'
);

select * from finish();
rollback;
