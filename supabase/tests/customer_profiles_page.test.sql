-- ============================================================
-- `org_customer_profiles_page` — CE QUE CE FICHIER DOIT PROUVER
--
--  1. La fonction fige son `search_path` et n'est exécutable ni par `anon` ni
--     par PUBLIC (ADR-082 : la fermeture se vérifie dans le CATALOGUE, jamais
--     par une tentative d'appel, qui ne distingue pas « refusé » de « cassé »).
--     Et il n'existe qu'UNE entrée `pg_proc` : la signature ayant changé, un
--     `create or replace` aurait laissé l'ancienne en place et rendu ambigu
--     chaque appel de la page en production.
--  2. La garde est `is_org_owner` — ni membre, ni éditeur. C'est le régime
--     d'origine et il est CONSERVÉ : cette liste est nominative (e-mails,
--     prénoms, téléphones, historique de gains). Le contre-exemple qui compte
--     est donc l'ÉDITEUR, un rôle admis presque partout ailleurs dans le
--     tableau de bord et qui doit malgré tout être refusé ici. Sans lui,
--     « le caissier est refusé » ne distinguerait pas `is_org_owner` de
--     `is_org_editor`.
--  3. `p_segment` applique EXACTEMENT le prédicat d'`org_segment_counts` —
--     c'est la raison d'être de `customer_segment_matches`. La preuve n'est pas
--     « le filtre rend deux lignes » : c'est la COMPARAISON des deux fonctions
--     sur les mêmes fixtures. Elles vivent sinon dans deux fichiers séparés,
--     vertes chacune de son côté pendant que leurs définitions divergent.
--
--     Pour que la comparaison ait un sens, les fixtures font coïncider les deux
--     populations SUR LES PROFILS SEGMENTABLES : les quatre joueurs qui tombent
--     dans un segment sont aussi abonnés à la newsletter. Ailleurs elles
--     divergent exprès — `jamais-joue@` est abonné sans avoir jamais joué,
--     `moyen@`, `exaequo@` et `sansprenom@` jouent sans être abonnés — parce
--     que c'est la réalité de production et que la factorisation ne prétend PAS
--     la supprimer : elle unifie le prédicat, pas l'ensemble sur lequel il
--     porte. La dernière assertion de la section 5 mesure cet écart plutôt que
--     de le passer sous silence.
--
--  4. Les segments ne sont PAS exclusifs, exactement comme les `filter` du
--     compteur : « Ancienne » a cinq gains ET un dernier gain vieux de
--     quatre-vingt-dix jours. Elle doit sortir sous `fidele` ET sous
--     `a_relancer`. La pastille de la page, elle, la classe dans un seul
--     segment — c'est un affichage, pas le prédicat, et c'est le SQL qui fait
--     foi pour le filtre.
--  5. `p_q` cherche sur l'e-mail, le prénom ET le téléphone, échappé : `%` et
--     `_` ne doivent pas se comporter en jokers.
--  6. `p_tri` est une liste blanche : quatre tris, et une valeur inconnue
--     retombe sur le défaut au lieu de lever ou d'interpoler.
--  7. La pagination est STABLE : le départage par e-mail est nouveau, et sans
--     lui deux clients au même critère de tri pouvaient se croiser entre deux
--     pages. Les fixtures posent exprès deux ex æquo parfaits.
--
-- ── UNE NOTE SUR LES DATES ──
--
-- Aucune date en dur. Le segment « à relancer » se compare à `now() - 60
-- jours` : une fixture datée `2026-01-01` deviendrait fausse le jour où on la
-- dépasse, et le fichier rougirait des mois plus tard pour une raison sans
-- rapport avec ce qu'il teste. Tout est relatif à `now()`, qui est constant
-- dans la transaction — c'est aussi ce qui rend les ex æquo EXACTS.
-- ============================================================
begin;
create extension if not exists pgtap with schema extensions;
select plan(61);

-- ════════════════════════════════════════════════════════════
-- PRÉAMBULE — CATALOGUE ET ACL (ADR-082)
-- ════════════════════════════════════════════════════════════
select is(
  (select p.prosecdef from pg_catalog.pg_proc p
     join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'org_customer_profiles_page'),
  true,
  'org_customer_profiles_page est security definer'
);

select is(
  (select pg_catalog.array_to_string(p.proconfig, ',') from pg_catalog.pg_proc p
     join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'org_customer_profiles_page'),
  'search_path=""',
  'org_customer_profiles_page fige son search_path a la chaine vide'
);

-- UNE SEULE entrée `pg_proc`. La signature a gagné trois paramètres, et un
-- `create or replace` aurait créé une SURCHARGE au lieu de remplacer : deux
-- fonctions homonymes toutes deux appelables avec les anciens arguments
-- rendraient ambigu chaque appel de la page en production (42725). C'est ce que
-- le `drop function` de 20260923120000 évite, et c'est ici qu'on le vérifie —
-- une migration qui l'oublierait laisserait une base parfaitement valide et une
-- page cassée.
select is(
  (select count(*)::int from pg_catalog.pg_proc p
     join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'org_customer_profiles_page'),
  1,
  'une seule entree pg_proc : l''ancienne signature a bien ete DROP, pas surchargee'
);

select is(
  has_function_privilege('anon',
    'public.org_customer_profiles_page(uuid, integer, integer, text, text, text)',
    'execute'),
  false,
  'anon ne peut pas executer org_customer_profiles_page'
);

select is(
  has_function_privilege('authenticated',
    'public.org_customer_profiles_page(uuid, integer, integer, text, text, text)',
    'execute'),
  true,
  'authenticated peut l''executer — la garde interne fait le reste'
);

-- Les deux moitiés indissociables : une ACL NULLE vaut EXECUTE à PUBLIC par
-- défaut, et `aclexplode(null)` rend zéro ligne — sans la première assertion,
-- la seconde verdirait précisément dans le cas qu'elle doit attraper. Le point
-- est d'autant plus sensible ici que le `drop` a emporté l'ACL d'origine : la
-- fonction repart de zéro, donc de PUBLIC.
select isnt(
  (select p.proacl from pg_catalog.pg_proc p
     join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'org_customer_profiles_page'),
  null,
  'l''ACL est POSEE — une ACL nulle vaudrait EXECUTE a PUBLIC par defaut'
);

select is(
  (select count(*)::int
     from pg_catalog.pg_proc p
     join pg_catalog.pg_namespace n on n.oid = p.pronamespace
     cross join lateral pg_catalog.aclexplode(p.proacl) a
    where n.nspname = 'public'
      and p.proname = 'org_customer_profiles_page'
      and a.grantee = 0),
  0,
  'PUBLIC ne porte aucun privilege sur la fonction (grantee 0 = PUBLIC)'
);

-- ── La fonction de prédicat partagée ────────────────────────
-- Elle n'est appelée que depuis le corps de fonctions `security definer`, qui
-- s'exécutent sous leur propriétaire : `authenticated` n'a donc AUCUNE raison
-- de l'atteindre. Le vérifier évite qu'un `grant to authenticated` de confort
-- n'ouvre un jour une porte dont personne n'a besoin.
select is(
  (select pg_catalog.array_to_string(p.proconfig, ',') from pg_catalog.pg_proc p
     join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'customer_segment_matches'),
  'search_path=""',
  'customer_segment_matches fige son search_path a la chaine vide'
);

select is(
  has_function_privilege('anon',
    'public.customer_segment_matches(text, bigint, timestamptz)', 'execute'),
  false,
  'anon ne peut pas executer customer_segment_matches'
);

select is(
  has_function_privilege('authenticated',
    'public.customer_segment_matches(text, bigint, timestamptz)', 'execute'),
  false,
  'authenticated non plus : la fonction est INTERNE aux deux RPC security definer'
);

select is(
  (select count(*)::int
     from pg_catalog.pg_proc p
     join pg_catalog.pg_namespace n on n.oid = p.pronamespace
     cross join lateral pg_catalog.aclexplode(p.proacl) a
    where n.nspname = 'public'
      and p.proname = 'customer_segment_matches'
      and a.grantee = 0),
  0,
  'PUBLIC ne porte aucun privilege sur customer_segment_matches'
);

-- ════════════════════════════════════════════════════════════
-- FIXTURES
--
-- Le préfixe `ae` des UUID est arbitraire mais hexadécimal, comme `ab` pour le
-- hub QR et `ac` pour le centre d'animation.
--
-- SEPT profils chez A, choisis pour couvrir les trois segments, leurs
-- INTERSECTIONS et leur COMPLÉMENT :
--
--   fidele@      5 gains, dernier il y a  2 j  → fidele
--   ancienne@    5 gains, dernier il y a 90 j  → fidele ET a_relancer
--   nouveau@     1 gain,             il y a  1 j  → nouveau
--   dormeur@     1 gain,             il y a 90 j  → nouveau ET a_relancer
--   moyen@       2 gains, dernier il y a  3 j  → AUCUN segment
--   exaequo@     2 gains, dernier il y a  3 j  → AUCUN segment, EX ÆQUO avec moyen@
--   sansprenom@  2 gains, dernier il y a  1 h  → AUCUN segment, prénom RESSAISI
--
-- `moyen@` est la fixture qu'on oublie : sans un profil dans AUCUN segment, un
-- filtre cassé qui rendrait tout le monde passerait les trois assertions de
-- segment sans broncher. `exaequo@` porte exactement les mêmes dates et le même
-- nombre de gains que `moyen@` pour que le départage de tri soit observable.
--
-- Deuxième ex æquo, celui-là non prémédité mais gardé : `ancienne@` et
-- `dormeur@` ont tous deux leur dernier gain à `now() - 90 j` EXACTEMENT —
-- `now()` étant constant dans la transaction. Le tri par défaut doit donc les
-- départager par e-mail, et il le fait.
-- ════════════════════════════════════════════════════════════
insert into public.organizations (id, name, slug) values
  ('ae000000-0000-4000-8000-000000000001', 'Clients A', 'tap-cli-a'),
  ('ae000000-0000-4000-8000-000000000002', 'Clients B', 'tap-cli-b');

insert into auth.users (id, email) values
  ('ae000000-0000-4000-8000-0000000000a1', 'proprio-a@tap-cli.local'),
  ('ae000000-0000-4000-8000-0000000000a2', 'proprio-b@tap-cli.local'),
  ('ae000000-0000-4000-8000-0000000000a3', 'editeur-a@tap-cli.local'),
  ('ae000000-0000-4000-8000-0000000000a4', 'caissier-a@tap-cli.local');

insert into public.organization_members (organization_id, user_id, role) values
  ('ae000000-0000-4000-8000-000000000001',
   'ae000000-0000-4000-8000-0000000000a1', 'owner'),
  ('ae000000-0000-4000-8000-000000000002',
   'ae000000-0000-4000-8000-0000000000a2', 'owner'),
  -- Le contre-exemple du point 2 : éditeur, donc admis presque partout
  -- ailleurs, et refusé ici.
  ('ae000000-0000-4000-8000-000000000001',
   'ae000000-0000-4000-8000-0000000000a3', 'editor'),
  ('ae000000-0000-4000-8000-000000000001',
   'ae000000-0000-4000-8000-0000000000a4', 'cashier');

-- Une campagne et sa roue par organisation : `participations` porte des FK
-- COMPOSITES validées vers (campagne, organisation) et (roue, campagne,
-- organisation), on ne peut pas insérer à côté.
insert into public.campaigns (id, organization_id, name, status) values
  ('ae000000-0000-4000-8000-000000000101',
   'ae000000-0000-4000-8000-000000000001', 'Roue clients A', 'active'),
  ('ae000000-0000-4000-8000-000000000102',
   'ae000000-0000-4000-8000-000000000002', 'Roue clients B', 'active');

insert into public.wheels (id, organization_id, campaign_id) values
  ('ae000000-0000-4000-8000-000000000111',
   'ae000000-0000-4000-8000-000000000001',
   'ae000000-0000-4000-8000-000000000101'),
  ('ae000000-0000-4000-8000-000000000112',
   'ae000000-0000-4000-8000-000000000002',
   'ae000000-0000-4000-8000-000000000102');

-- `generate_series` fabrique les gains multiples. Les `created_at` s'échelonnent
-- EN ARRIÈRE depuis la date du dernier gain, qui est ce que le segment regarde.
--
-- `redeemed_at` n'est posé que sur une PARTIE des lignes, et dans des
-- proportions différentes d'un profil à l'autre : c'est ce qui rend le tri
-- `recuperes` distinct du tri `gains`. Sans cet écart les deux tris rendraient
-- le même ordre, et l'un des deux pourrait être cassé sans qu'on le voie.
--
-- Aucun `redeem_code` n'est posé : le trigger `participations_set_redeem_expiry`
-- ne se déclenche que sur les lignes qui en portent un, on l'évite.
insert into public.participations
  (organization_id, campaign_id, wheel_id, first_name, email, phone,
   accepted_terms, player_key, redeemed_at, created_at)
select
  'ae000000-0000-4000-8000-000000000001',
  'ae000000-0000-4000-8000-000000000101',
  'ae000000-0000-4000-8000-000000000111',
  f.prenom,
  f.mail,
  f.tel,
  true,
  'tap-cli-' || f.mail || '-' || i::text,
  case when i <= f.recup then now() end,
  now() - make_interval(days => f.jours) - make_interval(days => i - 1)
  from (values
    ('Fidele',   'fidele@tap-cli.local',   '+33600000001', 5, 4,  2),
    ('Ancienne', 'ancienne@tap-cli.local', '+33600000002', 5, 1, 90),
    ('Nouveau',  'nouveau@tap-cli.local',  '+33600000003', 1, 0,  1),
    ('Dormeur',  'dormeur@tap-cli.local',  '+33600000004', 1, 1, 90),
    ('Moyen',    'moyen@tap-cli.local',    '+33600000005', 2, 2,  3),
    ('Exaequo',  'exaequo@tap-cli.local',  '+33600000006', 2, 0,  3)
  ) as f(prenom, mail, tel, gains, recup, jours)
 cross join generate_series(1, 5) as i
 where i <= f.gains;

-- Le prénom RESSAISI, et c'est une fixture de régression. `first_name` est
-- nullable depuis 00004 (campagnes sans collecte) : la participation la plus
-- RÉCENTE de ce profil n'en porte pas, une plus ancienne si. L'ancienne version
-- de la fonction prenait le premier élément du tableau trié sans filtrer les
-- NULL et rendait donc un prénom VIDE — et le client serait resté introuvable
-- par la nouvelle recherche sur le prénom.
insert into public.participations
  (organization_id, campaign_id, wheel_id, first_name, email, phone,
   accepted_terms, player_key, created_at)
values
  ('ae000000-0000-4000-8000-000000000001',
   'ae000000-0000-4000-8000-000000000101',
   'ae000000-0000-4000-8000-000000000111',
   null, 'sansprenom@tap-cli.local', null, true, 'tap-cli-sansprenom-1',
   now() - interval '1 hour'),
  ('ae000000-0000-4000-8000-000000000001',
   'ae000000-0000-4000-8000-000000000101',
   'ae000000-0000-4000-8000-000000000111',
   'Ressaisi', 'sansprenom@tap-cli.local', '+33600000007', true,
   'tap-cli-sansprenom-2', now() - interval '10 days');

-- Une participation SANS e-mail. La fonction regroupe sur `p.email` et le
-- filtre explicitement : elle ne doit produire NI ligne, NI groupe NULL — ce
-- dernier serait une ligne fantôme dans la liste du commerçant, et un `null`
-- là où le type TypeScript annonce `string`.
insert into public.participations
  (organization_id, campaign_id, wheel_id, first_name, email, phone,
   accepted_terms, player_key, created_at)
values
  ('ae000000-0000-4000-8000-000000000001',
   'ae000000-0000-4000-8000-000000000101',
   'ae000000-0000-4000-8000-000000000111',
   'Anonyme', null, '+33600000099', true, 'tap-cli-anonyme',
   now() - interval '2 days');

-- Le voisin : deux profils chez B, pour que « A ne voit pas B » se distingue
-- d'une fonction qui ne rendrait rien à personne.
insert into public.participations
  (organization_id, campaign_id, wheel_id, first_name, email, phone,
   accepted_terms, player_key, created_at)
values
  ('ae000000-0000-4000-8000-000000000002',
   'ae000000-0000-4000-8000-000000000102',
   'ae000000-0000-4000-8000-000000000112',
   'ChezB', 'chez-b@tap-cli.local', '+33611111111', true, 'tap-cli-b1',
   now() - interval '1 day'),
  ('ae000000-0000-4000-8000-000000000002',
   'ae000000-0000-4000-8000-000000000102',
   'ae000000-0000-4000-8000-000000000112',
   'ChezB2', 'chez-b2@tap-cli.local', '+33611111112', true, 'tap-cli-b2',
   now() - interval '1 day');

-- ── La population du COMPTEUR ───────────────────────────────
-- `org_segment_counts` compte des `newsletter_subscribers`, pas des joueurs.
-- N'y figurent que les QUATRE profils segmentables — c'est la condition pour
-- que la comparaison des deux fonctions porte sur le PRÉDICAT et non sur
-- l'écart de population.
--
-- `jamais-joue@` est l'écart volontaire : abonné, zéro gain, donc dans le
-- compteur `all` et dans AUCUN segment ni AUCUNE ligne de la liste. Il prouve
-- au passage que « nouveau » est bien `wins = 1` et non `wins <= 1`.
--
-- `moyen@`, `exaequo@` et `sansprenom@` sont l'écart inverse : ils jouent sans
-- être abonnés. Comme ils ne tombent dans aucun segment, leur absence ne fausse
-- aucune des trois comparaisons.
insert into public.newsletter_subscribers (organization_id, email) values
  ('ae000000-0000-4000-8000-000000000001', 'fidele@tap-cli.local'),
  ('ae000000-0000-4000-8000-000000000001', 'ancienne@tap-cli.local'),
  ('ae000000-0000-4000-8000-000000000001', 'nouveau@tap-cli.local'),
  ('ae000000-0000-4000-8000-000000000001', 'dormeur@tap-cli.local'),
  ('ae000000-0000-4000-8000-000000000001', 'jamais-joue@tap-cli.local');

-- ════════════════════════════════════════════════════════════
-- LECTURES
--
-- Même discipline que `qr_hub.test.sql` : on lit sous JWT, on ACCUMULE dans un
-- scalaire `jsonb`, et on n'écrit dans les tables temporaires qu'APRÈS
-- `reset role` — `authenticated` n'a pas le privilège TEMPORARY sur la base, et
-- un `insert` glissé avant ferait échouer le fichier sur un détail de plomberie
-- plutôt que sur son sujet.
-- ════════════════════════════════════════════════════════════
create temporary table tap_cli_a (
  email text, first_name text, wins bigint, redeemed bigint,
  first_win timestamptz, last_win timestamptz, total_count bigint
) on commit drop;

create temporary table tap_cli_err (
  cas text, erreur text
) on commit drop;

-- `emails` porte la liste ORDONNÉE des e-mails rendus : c'est ce qui permet
-- d'asserter à la fois le contenu d'un filtre et l'ORDRE d'un tri, là où un
-- simple compte de lignes laisserait passer une permutation.
create temporary table tap_cli_cas (
  cas text, n integer, total bigint, emails text
) on commit drop;

-- La parité : les trois segments, comptés par l'une et listés par l'autre.
create temporary table tap_cli_parite (
  segment text, liste integer, compteur integer
) on commit drop;

do $lectures$
declare
  v_a jsonb;
  v_err_editeur text;
  v_err_caissier text;
  v_err_ab text;
  v_err_limite text;
  v_err_offset text;
  v_err_offset_haut text;
  v_err_offset_pile text;
  v_err_null text;
begin
  perform set_config('request.jwt.claims',
    '{"role":"authenticated","sub":"ae000000-0000-4000-8000-0000000000a1"}', true);
  set local role authenticated;

  select jsonb_agg(to_jsonb(t)) into v_a
    from public.org_customer_profiles_page(
      'ae000000-0000-4000-8000-000000000001', 0, 50, null, null, null) t;

  -- Le propriétaire de A chez B : refusé.
  begin
    perform 1 from public.org_customer_profiles_page(
      'ae000000-0000-4000-8000-000000000002', 0, 50, null, null, null);
    v_err_ab := 'AUCUNE ERREUR — la liste clients du voisin est lisible';
  exception when others then
    v_err_ab := sqlerrm;
  end;

  -- Le plafond de cent tient toujours…
  begin
    perform 1 from public.org_customer_profiles_page(
      'ae000000-0000-4000-8000-000000000001', 0, 200, null, null, null);
    v_err_limite := 'AUCUNE ERREUR — p_limit 200 depasse le plafond';
  exception when others then
    v_err_limite := sqlerrm;
  end;

  begin
    perform 1 from public.org_customer_profiles_page(
      'ae000000-0000-4000-8000-000000000001', -1, 50, null, null, null);
    v_err_offset := 'AUCUNE ERREUR — offset negatif accepte';
  exception when others then
    v_err_offset := sqlerrm;
  end;

  -- CNT-1 (wagon 4) : l'offset n'avait qu'un PLANCHER. La RPC est
  -- `grant execute … to authenticated` : ce n'est pas l'écran qui choisit
  -- `p_offset`, c'est le client, et un `?page=1000000` recopié dans la barre
  -- d'adresse faisait trier puis jeter la liste entière pour rendre zéro ligne.
  -- Le plafond est de 500 pages de la taille demandée — ici 500 × 50 = 25 000.
  begin
    perform 1 from public.org_customer_profiles_page(
      'ae000000-0000-4000-8000-000000000001', 25001, 50, null, null, null);
    v_err_offset_haut := 'AUCUNE ERREUR — offset au-dela du plafond accepte';
  exception when others then
    v_err_offset_haut := sqlerrm;
  end;

  -- Le contrôle qui empêche de lire l'assertion précédente à l'envers : le
  -- plafond est une BORNE, pas un refus général. À 25 000 pile, ça passe.
  begin
    perform 1 from public.org_customer_profiles_page(
      'ae000000-0000-4000-8000-000000000001', 25000, 50, null, null, null);
    v_err_offset_pile := '(aucune)';
  exception when others then
    v_err_offset_pile := sqlerrm;
  end;

  -- … et `p_limit => null` ne le CONTOURNE plus. C'était le trou : PostgREST
  -- transmet un `null` explicite, le défaut de signature ne s'applique alors
  -- pas, `null > 100` valait NULL donc pas d'exception, et `limit null` signifie
  -- AUCUNE limite. Depuis 20260923120000 le `coalesce` précède le contrôle : la
  -- valeur retombe sur le défaut, donc PAS d'erreur — ce que cette sonde vérifie.
  begin
    perform 1 from public.org_customer_profiles_page(
      'ae000000-0000-4000-8000-000000000001', null, null, null, null, null);
    v_err_null := '(aucune)';
  exception when others then
    v_err_null := sqlerrm;
  end;

  -- L'ÉDITEUR de A : le contre-exemple du point 2.
  perform set_config('request.jwt.claims',
    '{"role":"authenticated","sub":"ae000000-0000-4000-8000-0000000000a3"}', true);
  begin
    perform 1 from public.org_customer_profiles_page(
      'ae000000-0000-4000-8000-000000000001', 0, 50, null, null, null);
    v_err_editeur := 'AUCUNE ERREUR — un editeur lit la liste nominative';
  exception when others then
    v_err_editeur := sqlerrm;
  end;

  perform set_config('request.jwt.claims',
    '{"role":"authenticated","sub":"ae000000-0000-4000-8000-0000000000a4"}', true);
  begin
    perform 1 from public.org_customer_profiles_page(
      'ae000000-0000-4000-8000-000000000001', 0, 50, null, null, null);
    v_err_caissier := 'AUCUNE ERREUR — un caissier lit la liste nominative';
  exception when others then
    v_err_caissier := sqlerrm;
  end;

  reset role;
  perform set_config('request.jwt.claims', '{"role":"service_role"}', true);

  insert into tap_cli_a
  select * from jsonb_populate_recordset(null::tap_cli_a, v_a);

  insert into tap_cli_err (cas, erreur) values
    ('A chez B',        v_err_ab),
    ('limite 200',      v_err_limite),
    ('offset negatif',  v_err_offset),
    ('offset au-dela',  v_err_offset_haut),
    ('offset pile',     v_err_offset_pile),
    ('limite null',     v_err_null),
    ('editeur A',       v_err_editeur),
    ('caissier A',      v_err_caissier);
end
$lectures$;
reset role;

-- Les scénarios de filtre, de tri et de pagination, chacun sous l'identité du
-- propriétaire de A.
--
-- `with ordinality` n'est pas une coquetterie : sans lui, `string_agg` agrège
-- dans l'ordre où les lignes lui parviennent, ce que rien ne garantit
-- formellement. La moitié des assertions de ce fichier porte sur un ORDRE —
-- elles vaudraient alors « ça marche aujourd'hui ». L'ordinalité fige l'ordre
-- de sortie de la fonction et le rend explicitement triable.
do $cas$
declare
  v_n integer;
  v_total bigint;
  v_emails text;
  v_scenario record;
  v_releve jsonb := '[]'::jsonb;
begin
  perform set_config('request.jwt.claims',
    '{"role":"authenticated","sub":"ae000000-0000-4000-8000-0000000000a1"}', true);
  set local role authenticated;

  for v_scenario in
    select * from (values
      -- ── p_q : la recherche
      ('q email',          'fidele@',       null::text,  null::text,     50, 0),
      ('q prenom',         'Dormeur',       null,        null,           50, 0),
      ('q prenom casse',   'dOrMeUr',       null,        null,           50, 0),
      ('q telephone',      '+33600000004',  null,        null,           50, 0),
      ('q prenom ressaisi','Ressaisi',      null,        null,           50, 0),
      ('q partiel',        'tap-cli.local', null,        null,           50, 0),
      ('q joker souligne', '_',             null,        null,           50, 0),
      ('q joker pourcent', '%',             null,        null,           50, 0),
      ('q sans resultat',  'zzzzz',         null,        null,           50, 0),
      -- ── p_segment
      ('segment fidele',   null,            'fidele',    null,           50, 0),
      ('segment nouveau',  null,            'nouveau',   null,           50, 0),
      ('segment relancer', null,            'a_relancer',null,           50, 0),
      ('segment alias',    null,            'loyal',     null,           50, 0),
      ('segment tous',     null,            'all',       null,           50, 0),
      ('segment vide',     null,            null,        null,           50, 0),
      ('segment inconnu',  null,            'zzz',       null,           50, 0),
      ('segment+q',        'ancienne@',     'fidele',    null,           50, 0),
      -- ── p_tri
      ('tri defaut',       null,            null,        null,           50, 0),
      ('tri dernier_gain', null,            null,        'dernier_gain', 50, 0),
      ('tri gains',        null,            null,        'gains',        50, 0),
      ('tri recuperes',    null,            null,        'recuperes',    50, 0),
      ('tri premier_gain', null,            null,        'premier_gain', 50, 0),
      ('tri inconnu',      null,            null,        'zzz',          50, 0),
      -- ── pagination, sur un tri qui porte DEUX ex aequo
      ('page 1',           null,            null,        'gains',        3,  0),
      ('page 2',           null,            null,        'gains',        3,  3)
    ) as s(cas, q, segment, tri, lim, dep)
  loop
    select count(*)::integer,
           max(t.total_count),
           coalesce(string_agg(t.email, ',' order by t.ord), '(rien)')
      into v_n, v_total, v_emails
      from public.org_customer_profiles_page(
        'ae000000-0000-4000-8000-000000000001',
        v_scenario.dep, v_scenario.lim,
        v_scenario.q, v_scenario.segment, v_scenario.tri)
      with ordinality as t(email, first_name, wins, redeemed,
                           first_win, last_win, total_count, ord);

    v_releve := v_releve || jsonb_build_object(
      'cas', v_scenario.cas, 'n', v_n, 'total', v_total, 'emails', v_emails);
  end loop;

  reset role;
  perform set_config('request.jwt.claims', '{"role":"service_role"}', true);

  insert into tap_cli_cas
  select * from jsonb_populate_recordset(null::tap_cli_cas, v_releve);
end
$cas$;
reset role;

-- ════════════════════════════════════════════════════════════
-- LA PARITÉ AVEC `org_segment_counts`
--
-- Les deux fonctions sont interrogées SOUS LA MÊME IDENTITÉ, sur la MÊME
-- organisation, dans le même bloc : c'est la condition pour que la comparaison
-- prouve quelque chose. Toutes deux sont gardées par `is_org_owner`.
-- ════════════════════════════════════════════════════════════
do $parite$
declare
  v_loyal bigint;
  v_new bigint;
  v_inactive bigint;
  v_all bigint;
  v_fidele integer;
  v_nouveau integer;
  v_relancer integer;
  v_liste integer;
begin
  perform set_config('request.jwt.claims',
    '{"role":"authenticated","sub":"ae000000-0000-4000-8000-0000000000a1"}', true);
  set local role authenticated;

  select c.loyal_count, c.new_count, c.inactive_count, c.all_count
    into v_loyal, v_new, v_inactive, v_all
    from public.org_segment_counts('ae000000-0000-4000-8000-000000000001') c;

  select count(*)::integer into v_fidele
    from public.org_customer_profiles_page(
      'ae000000-0000-4000-8000-000000000001', 0, 50, null, 'fidele', null) t;

  select count(*)::integer into v_nouveau
    from public.org_customer_profiles_page(
      'ae000000-0000-4000-8000-000000000001', 0, 50, null, 'nouveau', null) t;

  select count(*)::integer into v_relancer
    from public.org_customer_profiles_page(
      'ae000000-0000-4000-8000-000000000001', 0, 50, null, 'a_relancer', null) t;

  select count(*)::integer into v_liste
    from public.org_customer_profiles_page(
      'ae000000-0000-4000-8000-000000000001', 0, 50, null, null, null) t;

  reset role;
  perform set_config('request.jwt.claims', '{"role":"service_role"}', true);

  insert into tap_cli_parite (segment, liste, compteur) values
    ('fidele',      v_fidele,   v_loyal::integer),
    ('nouveau',     v_nouveau,  v_new::integer),
    ('a_relancer',  v_relancer, v_inactive::integer),
    -- La quatrième ligne n'est PAS une parité : c'est la mesure de l'écart de
    -- POPULATION, celui que la factorisation ne prétend pas supprimer.
    ('population',  v_liste,    v_all::integer);
end
$parite$;
reset role;

-- ════════════════════════════════════════════════════════════
-- 1. LA GARDE — `is_org_owner`, NI MEMBRE NI ÉDITEUR
-- ════════════════════════════════════════════════════════════
select is(
  (select erreur from tap_cli_err where cas = 'A chez B'),
  'not authorized',
  'le proprietaire de A est refuse chez B'
);

-- L'assertion qui distingue `is_org_owner` d'`is_org_editor`. Sans elle, le
-- refus du caissier serait compatible avec les DEUX gardes, et un
-- assouplissement en `is_org_editor` passerait toute la suite au vert.
select is(
  (select erreur from tap_cli_err where cas = 'editeur A'),
  'not authorized',
  'l''EDITEUR de A est refuse : la liste nominative est reservee au proprietaire'
);

select is(
  (select erreur from tap_cli_err where cas = 'caissier A'),
  'not authorized',
  'le caissier de A est refuse'
);

select is(
  (select erreur from tap_cli_err where cas = 'limite 200'),
  'invalid pagination',
  'le plafond de cent lignes tient'
);

select is(
  (select erreur from tap_cli_err where cas = 'offset negatif'),
  'invalid pagination',
  'un offset negatif est refuse'
);

select is(
  (select erreur from tap_cli_err where cas = 'offset au-dela'),
  'invalid pagination',
  'un offset au-dela de 500 pages est refuse EN BASE — le clamp TypeScript ne couvre pas PostgREST'
);

select is(
  (select erreur from tap_cli_err where cas = 'offset pile'),
  '(aucune)',
  'et 500 pages PILE passent : c''est une borne, pas un refus general'
);

select is(
  (select erreur from tap_cli_err where cas = 'limite null'),
  '(aucune)',
  'p_limit null ne leve PAS : il retombe sur le defaut, il ne signifie plus « sans limite »'
);

-- ════════════════════════════════════════════════════════════
-- 2. LE CONTENU DE BASE
-- ════════════════════════════════════════════════════════════
select is(
  (select count(*)::int from tap_cli_a),
  7,
  'A voit SEPT profils, un par e-mail distinct'
);

select is(
  (select max(total_count) from tap_cli_a),
  7::bigint,
  'total_count vaut 7 sur chaque ligne — le total AVANT pagination'
);

select is(
  (select count(*)::int from tap_cli_a
    where email in ('chez-b@tap-cli.local', 'chez-b2@tap-cli.local')),
  0,
  'aucun profil de B ne fuit chez A'
);

select is(
  (select count(*)::int from tap_cli_a where email is null),
  0,
  'la participation SANS e-mail ne produit aucune ligne, ni de groupe NULL'
);

select is(
  (select wins::int from tap_cli_a where email = 'fidele@tap-cli.local'),
  5,
  'wins compte les participations du profil'
);

select is(
  (select redeemed::int from tap_cli_a where email = 'fidele@tap-cli.local'),
  4,
  'redeemed compte celles qui portent un redeemed_at'
);

-- Le prénom le plus récent NON NUL — changement de comportement délibéré de
-- 20260923120000. L'ancienne version prenait le premier élément du tableau
-- trié sans filtrer : la participation la plus récente de `sansprenom@` n'ayant
-- pas de prénom, la ligne s'affichait vide alors qu'une plus ancienne en
-- portait un, et le client restait introuvable par la recherche sur le prénom.
select is(
  (select first_name from tap_cli_a where email = 'sansprenom@tap-cli.local'),
  'Ressaisi',
  'first_name retient le plus recent NON NUL, pas le plus recent tout court'
);

-- ════════════════════════════════════════════════════════════
-- 3. `p_q` — LA RECHERCHE, ET SON ÉCHAPPEMENT
-- ════════════════════════════════════════════════════════════
select is(
  (select n from tap_cli_cas where cas = 'q email'),
  1,
  'p_q trouve sur l''e-mail'
);

select is(
  (select n from tap_cli_cas where cas = 'q prenom'),
  1,
  'p_q trouve sur le prenom'
);

select is(
  (select emails from tap_cli_cas where cas = 'q prenom casse'),
  'dormeur@tap-cli.local',
  'la recherche est insensible a la casse : « dOrMeUr » trouve « Dormeur »'
);

select is(
  (select emails from tap_cli_cas where cas = 'q telephone'),
  'dormeur@tap-cli.local',
  'p_q trouve sur le TELEPHONE, bien que la colonne ne soit pas rendue'
);

select is(
  (select emails from tap_cli_cas where cas = 'q prenom ressaisi'),
  'sansprenom@tap-cli.local',
  'le prenom CHERCHE est celui qui est AFFICHE — sinon le champ paraitrait casse'
);

select is(
  (select n from tap_cli_cas where cas = 'q partiel'),
  7,
  'p_q sur un fragment commun a tous les e-mails les rend tous les sept'
);

-- Non échappé, `_` serait le joker « un caractère quelconque » et rendrait les
-- sept lignes : l'assertion verdirait alors sur un bug.
select is(
  (select n from tap_cli_cas where cas = 'q joker souligne'),
  0,
  'p_q = « _ » ne trouve rien — le joker d''un caractere est echappe'
);

select is(
  (select n from tap_cli_cas where cas = 'q joker pourcent'),
  0,
  'p_q = « % » ne trouve rien — aucune fixture ne porte un % litteral'
);

select is(
  (select n from tap_cli_cas where cas = 'q sans resultat'),
  0,
  'une recherche sans resultat rend zero ligne, sans lever'
);

-- ════════════════════════════════════════════════════════════
-- 4. `p_segment`
-- ════════════════════════════════════════════════════════════
select is(
  (select emails from tap_cli_cas where cas = 'segment fidele'),
  'fidele@tap-cli.local,ancienne@tap-cli.local',
  'segment fidele : les deux profils a cinq gains, du plus recent au plus ancien'
);

select is(
  (select emails from tap_cli_cas where cas = 'segment nouveau'),
  'nouveau@tap-cli.local,dormeur@tap-cli.local',
  'segment nouveau : EXACTEMENT un gain — ni zero (jamais-joue@), ni deux'
);

-- `ancienne@` et `dormeur@` ont le MÊME dernier gain à la microseconde près :
-- c'est le departage par e-mail qui les ordonne, et il est observable ici.
select is(
  (select emails from tap_cli_cas where cas = 'segment relancer'),
  'ancienne@tap-cli.local,dormeur@tap-cli.local',
  'segment a_relancer : dernier gain vieux de plus de 60 jours, ex aequo departages par e-mail'
);

-- LE point du 4 de l'en-tête : les segments ne partitionnent pas. « Ancienne »
-- sort sous fidele ET sous a_relancer, comme elle compte dans les DEUX colonnes
-- d'`org_segment_counts`. Un filtre qui se croirait exclusif la perdrait dans
-- l'un des deux.
select is(
  (select count(*)::int from tap_cli_cas
    where cas in ('segment fidele', 'segment relancer')
      and emails like '%ancienne@%'),
  2,
  'les segments ne sont PAS exclusifs : « Ancienne » sort sous fidele ET a_relancer'
);

-- `moyen@` et `exaequo@` ont deux gains récents : ni 1, ni ≥ 3, ni vieux. Ils
-- ne doivent apparaître dans AUCUN des trois segments. Sans eux, un filtre
-- cassé qui rendrait tout le monde passerait les assertions ci-dessus.
select is(
  (select count(*)::int from tap_cli_cas
    where cas in ('segment fidele', 'segment nouveau', 'segment relancer')
      and (emails like '%moyen@%' or emails like '%exaequo@%')),
  0,
  'les profils a DEUX gains recents ne sont dans aucun segment — le filtre filtre'
);

select is(
  (select emails from tap_cli_cas where cas = 'segment alias'),
  (select emails from tap_cli_cas where cas = 'segment fidele'),
  'l''alias anglais « loyal » rend exactement la meme chose que « fidele »'
);

select is(
  (select n from tap_cli_cas where cas = 'segment tous'),
  7,
  'segment « all » ne filtre rien'
);

select is(
  (select n from tap_cli_cas where cas = 'segment vide'),
  7,
  'p_segment null ne filtre rien non plus — c''est le defaut de la page'
);

-- Un segment inconnu VIDE la liste au lieu de la rendre en entier : une faute
-- de frappe doit se voir, pas se confondre avec « pas de filtre ».
select is(
  (select n from tap_cli_cas where cas = 'segment inconnu'),
  0,
  'un p_segment hors vocabulaire rend zero ligne — il ne retombe pas sur « tous »'
);

select is(
  (select n from tap_cli_cas where cas = 'segment+q'),
  1,
  'p_segment et p_q se CUMULENT'
);

select is(
  (select total from tap_cli_cas where cas = 'segment fidele'),
  2::bigint,
  'total_count suit p_segment — il vaut 2, pas 7'
);

-- ════════════════════════════════════════════════════════════
-- 5. LA PARITÉ AVEC `org_segment_counts`
--
-- C'est l'assertion pour laquelle `customer_segment_matches` existe. Elle
-- casserait si l'une des deux fonctions changeait de seuil sans l'autre — ce
-- qu'aucun des deux fichiers de test ne verrait seul.
-- ════════════════════════════════════════════════════════════
select is(
  (select liste from tap_cli_parite where segment = 'fidele'),
  (select compteur from tap_cli_parite where segment = 'fidele'),
  'fidele : la liste et le compteur donnent le meme nombre'
);

select is(
  (select liste from tap_cli_parite where segment = 'nouveau'),
  (select compteur from tap_cli_parite where segment = 'nouveau'),
  'nouveau : la liste et le compteur donnent le meme nombre'
);

select is(
  (select liste from tap_cli_parite where segment = 'a_relancer'),
  (select compteur from tap_cli_parite where segment = 'a_relancer'),
  'a_relancer : la liste et le compteur donnent le meme nombre'
);

-- Le contre-exemple : sans lui, les trois égalités ci-dessus verdiraient sur
-- 0 = 0, c'est-à-dire sur deux fonctions cassées de la même façon.
select is(
  (select string_agg(compteur::text, ',' order by segment) from tap_cli_parite
    where segment in ('fidele', 'nouveau', 'a_relancer')),
  '2,2,2',
  'et ces nombres ne sont pas nuls : deux par segment — l''egalite n''est pas 0 = 0'
);

-- L'écart de POPULATION, mesuré plutôt que sous-entendu. Sept joueurs listés,
-- cinq abonnés comptés : les deux fonctions partagent le PRÉDICAT, pas
-- l'ensemble sur lequel il porte. Un lecteur qui verrait les trois égalités
-- ci-dessus pourrait croire les deux populations interchangeables — elles ne le
-- sont pas, et le jour où quelqu'un fera l'un des deux compteurs à partir de
-- l'autre, cette assertion le dira.
select is(
  (select liste::text || ' joueurs / ' || compteur::text || ' abonnes'
     from tap_cli_parite where segment = 'population'),
  '7 joueurs / 5 abonnes',
  'les POPULATIONS restent differentes — la factorisation unifie le predicat, pas l''ensemble'
);

-- ════════════════════════════════════════════════════════════
-- 6. `p_tri` — LISTE BLANCHE ET TRI TOTAL
-- ════════════════════════════════════════════════════════════
select is(
  (select emails from tap_cli_cas where cas = 'tri defaut'),
  (select emails from tap_cli_cas where cas = 'tri dernier_gain'),
  'p_tri null rend le meme ordre que « dernier_gain » — c''est le defaut'
);

-- `sansprenom@` a le gain le plus récent (une heure), devant `nouveau@` (un
-- jour).
select is(
  (select split_part(emails, ',', 1)
     from tap_cli_cas where cas = 'tri dernier_gain'),
  'sansprenom@tap-cli.local',
  'tri dernier_gain : le gain le plus recent ouvre la liste'
);

-- Cinq gains pour `fidele@` et `ancienne@` : ex æquo sur le critère de tri, le
-- départage par e-mail place `ancienne@` devant (a < f). Sans départage, cet
-- ordre serait celui que le planificateur voudrait bien rendre ce jour-là.
select is(
  (select split_part(emails, ',', 1)
     from tap_cli_cas where cas = 'tri gains'),
  'ancienne@tap-cli.local',
  'tri gains : cinq gains en tete, ex aequo departages par e-mail'
);

-- `fidele@` a quatre récupérations, `moyen@` deux, `ancienne@` et `dormeur@`
-- une. L'ordre DIFFÈRE donc de celui du tri par gains — c'est ce que les
-- `redeemed_at` inégaux des fixtures rendent observable, et sans quoi les deux
-- tris seraient indistinguables.
select is(
  (select split_part(emails, ',', 1)
     from tap_cli_cas where cas = 'tri recuperes'),
  'fidele@tap-cli.local',
  'tri recuperes : quatre recuperations en tete, un ordre DIFFERENT de « gains »'
);

-- Le premier gain le plus RÉCENT ouvre la liste : `nouveau@` n'a qu'un gain,
-- daté d'hier, donc son premier gain est le plus récent de tous. Ce n'est PAS
-- le même profil que pour `dernier_gain` — c'est ce qui distingue les deux
-- tris, et un `first_win` confondu avec `last_win` casserait ici.
select is(
  (select split_part(emails, ',', 1)
     from tap_cli_cas where cas = 'tri premier_gain'),
  'nouveau@tap-cli.local',
  'tri premier_gain : decroissant lui aussi, et il ne designe PAS le meme profil que dernier_gain'
);

-- Une valeur hors liste blanche ne lève pas et ne sort pas de la liste : elle
-- retombe sur le défaut. Un paramètre d'URL mal tapé ne doit pas rendre la page
-- inaccessible au commerçant.
select is(
  (select emails from tap_cli_cas where cas = 'tri inconnu'),
  (select emails from tap_cli_cas where cas = 'tri dernier_gain'),
  'un p_tri hors liste blanche retombe sur le defaut, sans lever'
);

-- ════════════════════════════════════════════════════════════
-- 7. LA PAGINATION EST STABLE
--
-- Le tri retenu (`gains`) porte DEUX paires d'ex æquo : `fidele@`/`ancienne@` à
-- cinq gains, et `moyen@`/`exaequo@`/`sansprenom@` à deux. Sans le départage
-- par e-mail, ces profils pouvaient permuter entre deux appels et donc
-- apparaître sur les DEUX pages, ou sur aucune.
-- ════════════════════════════════════════════════════════════
select is(
  (select n from tap_cli_cas where cas = 'page 1'),
  3,
  'page 1 : trois lignes'
);

select is(
  (select total from tap_cli_cas where cas = 'page 1'),
  7::bigint,
  'total_count reste 7 malgre la limite — le total AVANT pagination'
);

select is(
  (select n from tap_cli_cas where cas = 'page 2'),
  3,
  'page 2 : trois lignes de plus'
);

-- Six e-mails rendus, six DISTINCTS : aucun recouvrement, aucun oubli.
select is(
  (select count(distinct x.e)::int
     from unnest(string_to_array(
       (select emails from tap_cli_cas where cas = 'page 1') || ',' ||
       (select emails from tap_cli_cas where cas = 'page 2'), ',')) as x(e)),
  6,
  'les deux pages rendent SIX e-mails distincts — le tri est total, la pagination sure'
);

select * from finish();
rollback;
