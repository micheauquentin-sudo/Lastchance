-- ============================================================
-- P0 lot 1 — LES PORTES DE PUBLICATION
--
-- Ce que ce fichier doit prouver, dans l'ordre d'importance :
--
--   1. LE REFUS. Un éditeur en règle — vrai membre, vrai rôle, JWT valide —
--      qui n'a PAS le droit du module ne publie pas, y compris par écriture
--      directe PostgREST. C'est l'assertion qui compte : avant ce lot, les
--      neuf modules se publiaient par un simple
--      `PATCH /rest/v1/<table>?id=eq.…`, la garde ne vivant que dans la
--      server action.
--   2. LE REFUS QUAND L'ABONNEMENT EST MORT. Addon allumé ne suffit pas :
--      un résilié dont on a laissé les addons ne publie pas non plus. C'était
--      l'asymétrie de fond — les RPC lisaient `addon_*` sans jamais regarder
--      l'état d'abonnement.
--   3. LA NON-RÉGRESSION. Avec le droit, il publie. Sans ce contrôle,
--      « ça refuse » ne prouverait rien qu'un `raise exception` inconditionnel
--      ne prouverait aussi.
--   4. LE RETOUR EN ARRIÈRE RESTE LIBRE. Un commerçant sans abonnement doit
--      pouvoir ARRÊTER ce qu'il a lancé. Une garde qui l'enferme dans l'état
--      publié est pire que pas de garde.
--
-- ── DEUX PREUVES DISTINCTES, ET C'EST DÉLIBÉRÉ ──
--
-- `supabase test db` s'exécute en tant que `postgres`, superutilisateur : les
-- GRANTS ne le contraignent pas. Une tentative d'UPDATE directe depuis ce
-- fichier ne mesure donc PAS la révocation — elle mesure le TRIGGER.
-- Les deux gardes sont donc éprouvées séparément :
--   * la révocation, par `has_column_privilege` (section 1) ;
--   * le trigger, par des écritures réelles sous un JWT `authenticated`
--     (section 3).
-- Confondre les deux ferait croire à une preuve de la révocation là où il n'y
-- en a aucune. C'est précisément le piège que la migration documente :
-- `revoke update (status)` sur un grant table-wide ne révoque RIEN et ne
-- prévient personne.
-- ============================================================
begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

select set_config('request.jwt.claims', '{"role":"service_role"}', true);

-- ── Fixtures ────────────────────────────────────────────────
-- Trois organisations qui ne diffèrent QUE par le droit, pour que chaque
-- refus soit imputable à une seule cause :
--   A = addons allumés + abonnement actif  → doit publier
--   B = addons ÉTEINTS + abonnement actif  → refus par le module
--   C = addons allumés + abonnement RÉSILIÉ → refus par l'abonnement
insert into public.organizations (
  id, name, slug, subscription_status,
  addon_hunts, addon_calendar, addon_loyalty, addon_quiz,
  addon_jackpot, addon_events, addon_referral, addon_pronostics
) values
  ('ca000000-0000-4000-8000-000000000001', 'Org Droit',   'tap-pub-a', 'active',
   true,  true,  true,  true,  true,  true,  true,  true),
  ('ca000000-0000-4000-8000-000000000002', 'Org Sans',    'tap-pub-b', 'active',
   false, false, false, false, false, false, false, false),
  ('ca000000-0000-4000-8000-000000000003', 'Org Resilie', 'tap-pub-c', 'canceled',
   true,  true,  true,  true,  true,  true,  true,  true);

insert into auth.users (id, email) values
  ('ca000000-0000-4000-8000-0000000000a1', 'proprio-a@tap-pub.local'),
  ('ca000000-0000-4000-8000-0000000000a2', 'proprio-b@tap-pub.local'),
  ('ca000000-0000-4000-8000-0000000000a3', 'proprio-c@tap-pub.local'),
  ('ca000000-0000-4000-8000-0000000000a4', 'caissier-a@tap-pub.local');

insert into public.organization_members (organization_id, user_id, role) values
  ('ca000000-0000-4000-8000-000000000001', 'ca000000-0000-4000-8000-0000000000a1', 'owner'),
  ('ca000000-0000-4000-8000-000000000002', 'ca000000-0000-4000-8000-0000000000a2', 'owner'),
  ('ca000000-0000-4000-8000-000000000003', 'ca000000-0000-4000-8000-0000000000a3', 'owner'),
  ('ca000000-0000-4000-8000-000000000001', 'ca000000-0000-4000-8000-0000000000a4', 'cashier');

-- Une ligne en BROUILLON par module et par organisation. Les identifiants
-- suivent le motif ca……-<module><org>.
insert into public.campaigns (id, organization_id, name, status) values
  ('ca000000-0000-4000-8000-000000000101', 'ca000000-0000-4000-8000-000000000001', 'Campagne A', 'draft'),
  ('ca000000-0000-4000-8000-000000000102', 'ca000000-0000-4000-8000-000000000002', 'Campagne B', 'draft'),
  ('ca000000-0000-4000-8000-000000000103', 'ca000000-0000-4000-8000-000000000003', 'Campagne C', 'draft');

insert into public.hunts (id, organization_id, name, status, reward_label) values
  ('ca000000-0000-4000-8000-000000000111', 'ca000000-0000-4000-8000-000000000001', 'Chasse A', 'draft', 'Lot A'),
  ('ca000000-0000-4000-8000-000000000112', 'ca000000-0000-4000-8000-000000000002', 'Chasse B', 'draft', 'Lot B'),
  ('ca000000-0000-4000-8000-000000000113', 'ca000000-0000-4000-8000-000000000003', 'Chasse C', 'draft', 'Lot C');

insert into public.calendars (id, organization_id, name, status, start_date, day_count, completion_reward_stock) values
  ('ca000000-0000-4000-8000-000000000121', 'ca000000-0000-4000-8000-000000000001', 'Calendrier A', 'draft', current_date, 3, 5),
  ('ca000000-0000-4000-8000-000000000122', 'ca000000-0000-4000-8000-000000000002', 'Calendrier B', 'draft', current_date, 3, 5),
  ('ca000000-0000-4000-8000-000000000123', 'ca000000-0000-4000-8000-000000000003', 'Calendrier C', 'draft', current_date, 3, 5);

insert into public.loyalty_programs (id, organization_id, name, status) values
  ('ca000000-0000-4000-8000-000000000131', 'ca000000-0000-4000-8000-000000000001', 'Fidelite A', 'draft'),
  ('ca000000-0000-4000-8000-000000000132', 'ca000000-0000-4000-8000-000000000002', 'Fidelite B', 'draft'),
  ('ca000000-0000-4000-8000-000000000133', 'ca000000-0000-4000-8000-000000000003', 'Fidelite C', 'draft');

insert into public.quizzes (id, organization_id, name, status, reward_mode) values
  ('ca000000-0000-4000-8000-000000000141', 'ca000000-0000-4000-8000-000000000001', 'Quiz A', 'draft', 'none'),
  ('ca000000-0000-4000-8000-000000000142', 'ca000000-0000-4000-8000-000000000002', 'Quiz B', 'draft', 'none'),
  ('ca000000-0000-4000-8000-000000000143', 'ca000000-0000-4000-8000-000000000003', 'Quiz C', 'draft', 'none');

insert into public.jackpot_campaigns (id, organization_id, name, status, threshold, reward_stock, reward_label) values
  ('ca000000-0000-4000-8000-000000000151', 'ca000000-0000-4000-8000-000000000001', 'Jackpot A', 'draft', 5, 10, 'Lot A'),
  ('ca000000-0000-4000-8000-000000000152', 'ca000000-0000-4000-8000-000000000002', 'Jackpot B', 'draft', 5, 10, 'Lot B'),
  ('ca000000-0000-4000-8000-000000000153', 'ca000000-0000-4000-8000-000000000003', 'Jackpot C', 'draft', 5, 10, 'Lot C');

insert into public.event_games (id, organization_id, name, status) values
  ('ca000000-0000-4000-8000-000000000161', 'ca000000-0000-4000-8000-000000000001', 'Jeu A', 'draft'),
  ('ca000000-0000-4000-8000-000000000162', 'ca000000-0000-4000-8000-000000000002', 'Jeu B', 'draft'),
  ('ca000000-0000-4000-8000-000000000163', 'ca000000-0000-4000-8000-000000000003', 'Jeu C', 'draft');

insert into public.referral_programs (id, campaign_id, organization_id, enabled) values
  ('ca000000-0000-4000-8000-000000000171', 'ca000000-0000-4000-8000-000000000101', 'ca000000-0000-4000-8000-000000000001', false),
  ('ca000000-0000-4000-8000-000000000172', 'ca000000-0000-4000-8000-000000000102', 'ca000000-0000-4000-8000-000000000002', false),
  ('ca000000-0000-4000-8000-000000000173', 'ca000000-0000-4000-8000-000000000103', 'ca000000-0000-4000-8000-000000000003', false);

insert into public.contests (id, organization_id, slug, name, competition_key, status) values
  ('ca000000-0000-4000-8000-000000000181', 'ca000000-0000-4000-8000-000000000001', 'TAPPUBA', 'Champ A', 'custom', 'draft'),
  ('ca000000-0000-4000-8000-000000000182', 'ca000000-0000-4000-8000-000000000002', 'TAPPUBB', 'Champ B', 'custom', 'draft'),
  ('ca000000-0000-4000-8000-000000000183', 'ca000000-0000-4000-8000-000000000003', 'TAPPUBC', 'Champ C', 'custom', 'draft');

insert into public.event_sessions (id, game_id, organization_id, label, status, reward_stock) values
  ('ca000000-0000-4000-8000-000000000191', 'ca000000-0000-4000-8000-000000000161', 'ca000000-0000-4000-8000-000000000001', 'Session A', 'draft', 10),
  ('ca000000-0000-4000-8000-000000000192', 'ca000000-0000-4000-8000-000000000162', 'ca000000-0000-4000-8000-000000000002', 'Session B', 'draft', 10),
  ('ca000000-0000-4000-8000-000000000193', 'ca000000-0000-4000-8000-000000000163', 'ca000000-0000-4000-8000-000000000003', 'Session C', 'draft', 10);

-- ══ 1. LA COLONNE N'EST PLUS ÉCRIVABLE PAR `authenticated` ══
-- Mesure du GRANT, pas du trigger. Sur `campaigns` et `event_games` ces deux
-- assertions sont les seules qui auraient attrapé le piège du grant
-- table-wide : un `revoke update (status)` y aurait laissé le privilège
-- intact, sans erreur ni avertissement.
select ok(not has_column_privilege('authenticated', 'public.campaigns', 'status', 'UPDATE'),
  'campaigns.status n''est plus ecrivable en direct (grant TABLE-WIDE reconstruit)');
select ok(not has_column_privilege('authenticated', 'public.event_games', 'status', 'UPDATE'),
  'event_games.status n''est plus ecrivable en direct (grant TABLE-WIDE reconstruit)');
select ok(not has_column_privilege('authenticated', 'public.hunts', 'status', 'UPDATE'),
  'hunts.status n''est plus ecrivable en direct');
select ok(not has_column_privilege('authenticated', 'public.calendars', 'status', 'UPDATE'),
  'calendars.status n''est plus ecrivable en direct');
select ok(not has_column_privilege('authenticated', 'public.loyalty_programs', 'status', 'UPDATE'),
  'loyalty_programs.status n''est plus ecrivable en direct');
select ok(not has_column_privilege('authenticated', 'public.quizzes', 'status', 'UPDATE'),
  'quizzes.status n''est plus ecrivable en direct');
select ok(not has_column_privilege('authenticated', 'public.jackpot_campaigns', 'status', 'UPDATE'),
  'jackpot_campaigns.status n''est plus ecrivable en direct');
select ok(not has_column_privilege('authenticated', 'public.referral_programs', 'enabled', 'UPDATE'),
  'referral_programs.enabled n''est plus ecrivable en direct');
select ok(not has_column_privilege('authenticated', 'public.contests', 'status', 'UPDATE'),
  'contests.status reste ferme (20260721150000)');

-- ── 1bis. NON-RÉGRESSION DU RE-GRANT ────────────────────────
-- `campaigns` et `event_games` ont subi un `revoke update` de TABLE puis un
-- re-grant colonne à colonne. Une colonne oubliée dans cette liste retirerait
-- en silence au commerçant le droit de renommer sa campagne ou d'ajuster son
-- budget — un correctif de sécurité qui casse le produit à côté.
select ok(has_column_privilege('authenticated', 'public.campaigns', 'name', 'UPDATE'),
  'campaigns.name survit au re-grant');
select ok(has_column_privilege('authenticated', 'public.campaigns', 'budget_cents', 'UPDATE'),
  'campaigns.budget_cents survit au re-grant');
select ok(has_column_privilege('authenticated', 'public.campaigns', 'paused_reason', 'UPDATE'),
  'campaigns.paused_reason survit au re-grant');
select ok(has_column_privilege('authenticated', 'public.campaigns', 'code_ttl_seconds', 'UPDATE'),
  'campaigns.code_ttl_seconds survit au re-grant');
select ok(has_column_privilege('authenticated', 'public.event_games', 'name', 'UPDATE'),
  'event_games.name survit au re-grant');

-- ── 1ter. Les fonctions de droit ne sont pas une sonde publique ──
-- SECURITY DEFINER + grant à `authenticated` aurait donné à tout commerçant
-- le moyen d'interroger l'abonnement et les addons de ses concurrents.
select ok(not has_function_privilege('authenticated',
  'public.org_has_active_access(uuid,timestamp with time zone)', 'EXECUTE'),
  'un marchand ne peut pas sonder l''abonnement d''une autre organisation');
select ok(not has_function_privilege('authenticated',
  'public.org_has_module_access(uuid,text,timestamp with time zone)', 'EXECUTE'),
  'un marchand ne peut pas sonder les addons d''une autre organisation');
select ok(not has_function_privilege('anon',
  'public.org_has_active_access(uuid,timestamp with time zone)', 'EXECUTE'),
  'anon non plus');

-- ══ 2. LE DROIT EFFECTIF LUI-MÊME ═══════════════════════════
select ok(public.org_has_module_access('ca000000-0000-4000-8000-000000000001', 'hunts'),
  'A : addon allume + abonnement actif = droit');
select ok(not public.org_has_module_access('ca000000-0000-4000-8000-000000000002', 'hunts'),
  'B : addon eteint = pas de droit');
select ok(not public.org_has_module_access('ca000000-0000-4000-8000-000000000003', 'hunts'),
  'C : addon allume mais abonnement RESILIE = pas de droit — c''est l''asymetrie que ce lot ferme');
select ok(public.org_has_module_access('ca000000-0000-4000-8000-000000000002', 'wheel'),
  'la roue ne depend d''aucun addon : B la garde malgre ses addons eteints');
select ok(not public.org_has_module_access('ca000000-0000-4000-8000-000000000003', 'wheel'),
  'mais un resilie perd meme la roue');
select throws_ok(
  $$select public.org_has_module_access('ca000000-0000-4000-8000-000000000001', 'chasse-au-tresor')$$,
  'P0001', 'unknown module: chasse-au-tresor',
  'un module inconnu LEVE — un refus silencieux masquerait une faute de frappe indefiniment');

-- ══ 3. ÉCRITURE DIRECTE : LE TRIGGER REFUSE LA PUBLICATION ══
-- Le cas central de ce lot. L'éditeur est légitime, son JWT est valide, sa
-- policy RLS l'autorise : seul le droit de module manque.
select set_config('request.jwt.claims',
  '{"role":"authenticated","sub":"ca000000-0000-4000-8000-0000000000a2"}', true);

select throws_ok(
  $$update public.hunts set status = 'active' where id = 'ca000000-0000-4000-8000-000000000112'$$,
  'P0001', 'module access required: hunts',
  'PATCH direct hunts.status=active refuse sans le module');
select throws_ok(
  $$update public.calendars set status = 'active' where id = 'ca000000-0000-4000-8000-000000000122'$$,
  'P0001', 'module access required: calendar',
  'PATCH direct calendars.status=active refuse sans le module');
select throws_ok(
  $$update public.loyalty_programs set status = 'active' where id = 'ca000000-0000-4000-8000-000000000132'$$,
  'P0001', 'module access required: loyalty',
  'PATCH direct loyalty_programs.status=active refuse sans le module');
select throws_ok(
  $$update public.quizzes set status = 'active' where id = 'ca000000-0000-4000-8000-000000000142'$$,
  'P0001', 'module access required: quiz',
  'PATCH direct quizzes.status=active refuse sans le module');
select throws_ok(
  $$update public.jackpot_campaigns set status = 'active' where id = 'ca000000-0000-4000-8000-000000000152'$$,
  'P0001', 'module access required: jackpot',
  'PATCH direct jackpot_campaigns.status=active refuse sans le module');
select throws_ok(
  $$update public.event_games set status = 'active' where id = 'ca000000-0000-4000-8000-000000000162'$$,
  'P0001', 'module access required: events',
  'PATCH direct event_games.status=active refuse sans le module');
select throws_ok(
  $$update public.referral_programs set enabled = true where id = 'ca000000-0000-4000-8000-000000000172'$$,
  'P0001', 'module access required: referral',
  'PATCH direct referral_programs.enabled=true refuse sans le module');
select throws_ok(
  $$update public.contests set status = 'active' where id = 'ca000000-0000-4000-8000-000000000182'$$,
  'P0001', 'module access required: pronostics',
  'PATCH direct contests.status=active refuse sans le module');

-- La campagne/roue se teste sur l'organisation RÉSILIÉE et non sur celle aux
-- addons éteints : la roue est le produit de base, aucun addon ne la
-- conditionne, donc B la garde légitimement (section 2 l'affirme et le
-- prouve). Prendre B ici aurait fabriqué un rouge qui accuse la garde alors
-- que c'est l'assertion qui se trompe de population.
select set_config('request.jwt.claims',
  '{"role":"authenticated","sub":"ca000000-0000-4000-8000-0000000000a3"}', true);
select throws_ok(
  $$update public.campaigns set status = 'active' where id = 'ca000000-0000-4000-8000-000000000103'$$,
  'P0001', 'module access required: wheel',
  'PATCH direct campaigns.status=active refuse a un RESILIE');
select set_config('request.jwt.claims',
  '{"role":"authenticated","sub":"ca000000-0000-4000-8000-0000000000a2"}', true);

-- ── 3bis. LA PORTE D'À CÔTÉ : L'INSERT ──────────────────────
-- `authenticated` porte `insert(status)` sur les neuf tables, et le garde.
-- Fermer l'UPDATE en laissant l'INSERT ouvert n'aurait rien fermé : il suffit
-- de POSTer une ligne déjà active. Vrai jusque pour `contests`, dont l'UPDATE
-- était pourtant verrouillé depuis 20260721150000.
select throws_ok(
  $$insert into public.hunts (id, organization_id, name, status, reward_label)
    values ('ca000000-0000-4000-8000-0000000001f1', 'ca000000-0000-4000-8000-000000000002',
            'Chasse par la fenetre', 'active', 'Lot')$$,
  'P0001', 'module access required: hunts',
  'POST direct d''une chasse DEJA active refuse — la fenetre a cote de la porte');
select throws_ok(
  $$insert into public.contests (id, organization_id, slug, name, competition_key, status)
    values ('ca000000-0000-4000-8000-0000000001f2', 'ca000000-0000-4000-8000-000000000002',
            'TAPFEN', 'Champ par la fenetre', 'custom', 'active')$$,
  'P0001', 'module access required: pronostics',
  'POST direct d''un championnat DEJA actif refuse — UPDATE verrouille ne suffisait pas');
select throws_ok(
  $$insert into public.campaigns (id, organization_id, name, status)
    values ('ca000000-0000-4000-8000-0000000001f3', 'ca000000-0000-4000-8000-000000000003',
            'Campagne par la fenetre', 'active')$$,
  'P0001', 'module access required: wheel',
  'POST direct d''une campagne active refuse a un resilie');

-- Un INSERT en BROUILLON reste libre : c'est ce que font `duplicateCampaign`
-- et `applyCampaignTemplate`, et c'est la raison pour laquelle `insert(status)`
-- n'a pas été révoqué.
select lives_ok(
  $$insert into public.campaigns (id, organization_id, name, status)
    values ('ca000000-0000-4000-8000-0000000001f4', 'ca000000-0000-4000-8000-000000000002',
            'Duplication en brouillon', 'draft')$$,
  'INSERT en brouillon reste libre — duplicateCampaign et les modeles en dependent');

-- ── 3ter. RIEN N'A ÉTÉ PUBLIÉ PAR LES REFUS ─────────────────
-- Un refus qui laisse la ligne publiée derrière lui n'est pas un refus.
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select is((select pg_catalog.count(*) from public.campaigns
           where organization_id in ('ca000000-0000-4000-8000-000000000002',
                                     'ca000000-0000-4000-8000-000000000003')
             and status = 'active'), 0::bigint,
  'aucune campagne publiee par les refus');
select is((select pg_catalog.count(*) from public.hunts
           where organization_id = 'ca000000-0000-4000-8000-000000000002'
             and status = 'active'), 0::bigint,
  'aucune chasse publiee par les refus');
select is((select pg_catalog.count(*) from public.contests
           where organization_id = 'ca000000-0000-4000-8000-000000000002'
             and status = 'active'), 0::bigint,
  'aucun championnat publie par les refus');

-- ══ 4. LES RPC DE TRANSITION ════════════════════════════════
-- ── 4a. Le rôle d'abord : un CAISSIER de A ne publie rien, bien que
--        l'organisation A ait tous les droits. La RPC n'est jamais plus large
--        que la RLS.
select set_config('request.jwt.claims',
  '{"role":"authenticated","sub":"ca000000-0000-4000-8000-0000000000a4"}', true);
select throws_ok(
  $$select public.set_hunt_status('ca000000-0000-4000-8000-000000000001',
      'ca000000-0000-4000-8000-000000000111', 'active')$$,
  'P0001', 'not authorized',
  'un CAISSIER ne publie pas, meme dans une organisation qui a tous les droits');
select throws_ok(
  $$select public.set_campaign_status('ca000000-0000-4000-8000-000000000001',
      'ca000000-0000-4000-8000-000000000101', 'active')$$,
  'P0001', 'not authorized',
  'idem pour une campagne');

-- ── 4b. Le module ensuite : le propriétaire de B est bien éditeur, il n'a
--        simplement pas le module.
select set_config('request.jwt.claims',
  '{"role":"authenticated","sub":"ca000000-0000-4000-8000-0000000000a2"}', true);
select throws_ok(
  $$select public.set_hunt_status('ca000000-0000-4000-8000-000000000002',
      'ca000000-0000-4000-8000-000000000112', 'active')$$,
  'P0001', 'module access required: hunts',
  'set_hunt_status refuse au proprietaire sans le module');
select throws_ok(
  $$select public.set_calendar_status('ca000000-0000-4000-8000-000000000002',
      'ca000000-0000-4000-8000-000000000122', 'active')$$,
  'P0001', 'module access required: calendar', 'set_calendar_status refuse');
select throws_ok(
  $$select public.set_loyalty_program_status('ca000000-0000-4000-8000-000000000002',
      'ca000000-0000-4000-8000-000000000132', 'active')$$,
  'P0001', 'module access required: loyalty', 'set_loyalty_program_status refuse');
select throws_ok(
  $$select public.set_quiz_status('ca000000-0000-4000-8000-000000000002',
      'ca000000-0000-4000-8000-000000000142', 'active')$$,
  'P0001', 'module access required: quiz', 'set_quiz_status refuse');
select throws_ok(
  $$select public.set_jackpot_campaign_status('ca000000-0000-4000-8000-000000000002',
      'ca000000-0000-4000-8000-000000000152', 'active')$$,
  'P0001', 'module access required: jackpot', 'set_jackpot_campaign_status refuse');
select throws_ok(
  $$select public.set_event_game_status('ca000000-0000-4000-8000-000000000002',
      'ca000000-0000-4000-8000-000000000162', 'active')$$,
  'P0001', 'module access required: events', 'set_event_game_status refuse');
select throws_ok(
  $$select public.set_referral_program_enabled('ca000000-0000-4000-8000-000000000002',
      'ca000000-0000-4000-8000-000000000172', true)$$,
  'P0001', 'module access required: referral', 'set_referral_program_enabled refuse');
select throws_ok(
  $$select public.set_contest_status('ca000000-0000-4000-8000-000000000002',
      'ca000000-0000-4000-8000-000000000182', 'active')$$,
  'P0001', 'module access required: pronostics',
  'set_contest_status refuse — le droit qui lui manquait depuis 20260721150000');

-- ── 4b-bis. L'ORDRE DES REFUS EST UN CHOIX, DONC IL EST ÉPINGLÉ ──
-- `set_contest_status` porte DEUX exigences sur une réouverture
-- (`finished → active`) : un motif d'au moins 10 caractères, et — depuis ce
-- lot — le droit du module. Quand les deux manquent, c'est le DROIT qui est
-- annoncé, parce qu'envoyer le commerçant rédiger une justification pour un
-- geste qui sera refusé de toute façon lui fait perdre son temps deux fois.
-- L'inverse se défendait (préserver la précédence historique) : c'est
-- justement pour cela que le choix est mesuré ici plutôt que laissé au hasard
-- de l'ordre des lignes.
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
update public.contests set status = 'finished' where id = 'ca000000-0000-4000-8000-000000000182';
select set_config('request.jwt.claims',
  '{"role":"authenticated","sub":"ca000000-0000-4000-8000-0000000000a2"}', true);
select throws_ok(
  $$select public.set_contest_status('ca000000-0000-4000-8000-000000000002',
      'ca000000-0000-4000-8000-000000000182', 'active')$$,
  'P0001', 'module access required: pronostics',
  'droit ET motif manquants : c''est le DROIT qui est annonce, pas le motif');
-- Et une transition INVALIDE continue de se nommer telle, plutôt que de se
-- déguiser en défaut de droit : sans quoi le commerçant irait acheter un
-- module pour débloquer un geste que le module ne débloque pas.
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
update public.contests set status = 'draft' where id = 'ca000000-0000-4000-8000-000000000182';
select set_config('request.jwt.claims',
  '{"role":"authenticated","sub":"ca000000-0000-4000-8000-0000000000a2"}', true);
select throws_ok(
  $$select public.set_contest_status('ca000000-0000-4000-8000-000000000002',
      'ca000000-0000-4000-8000-000000000182', 'finished')$$,
  'P0001', 'invalid transition',
  'draft -> finished reste une transition invalide, et non un defaut de droit');

-- ── 4c. L'ABONNEMENT ensuite : C a tous ses addons, et pourtant. C'est le
--        cœur du lot — aucune des 22 fonctions qui lisent `addon_*` ne
--        regardait l'état d'abonnement.
select set_config('request.jwt.claims',
  '{"role":"authenticated","sub":"ca000000-0000-4000-8000-0000000000a3"}', true);
select throws_ok(
  $$select public.set_hunt_status('ca000000-0000-4000-8000-000000000003',
      'ca000000-0000-4000-8000-000000000113', 'active')$$,
  'P0001', 'module access required: hunts',
  'ADDON ALLUME mais abonnement RESILIE : refus quand meme');
select throws_ok(
  $$select public.set_campaign_status('ca000000-0000-4000-8000-000000000003',
      'ca000000-0000-4000-8000-000000000103', 'active')$$,
  'P0001', 'module access required: wheel',
  'et la roue elle-meme est coupee pour un resilie');

-- ── 4d. LE RETOUR EN ARRIÈRE RESTE LIBRE ────────────────────
-- Le point le plus facile à rater : un commerçant dont l'abonnement s'arrête
-- doit pouvoir ARRÊTER ses modules. L'en empêcher serait un enfermement qui se
-- règle par un appel au support.
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
update public.hunts set status = 'active' where id = 'ca000000-0000-4000-8000-000000000113';
update public.campaigns set status = 'active' where id = 'ca000000-0000-4000-8000-000000000103';
select set_config('request.jwt.claims',
  '{"role":"authenticated","sub":"ca000000-0000-4000-8000-0000000000a3"}', true);
select ok(public.set_hunt_status('ca000000-0000-4000-8000-000000000003',
    'ca000000-0000-4000-8000-000000000113', 'archived'),
  'un RESILIE peut encore ARCHIVER sa chasse — on ne bloque pas qui veut cesser');
select ok(public.set_campaign_status('ca000000-0000-4000-8000-000000000003',
    'ca000000-0000-4000-8000-000000000103', 'paused'),
  'un RESILIE peut encore METTRE EN PAUSE sa campagne');
select is((select status from public.hunts where id = 'ca000000-0000-4000-8000-000000000113'),
  'archived', 'et l''archivage a bien eu lieu');

-- ══ 5. NON-RÉGRESSION : AVEC LE DROIT, ÇA PUBLIE ════════════
-- Sans cette section, « ça refuse » serait aussi vrai d'un `raise exception`
-- inconditionnel, qui casserait le produit entier.
select set_config('request.jwt.claims',
  '{"role":"authenticated","sub":"ca000000-0000-4000-8000-0000000000a1"}', true);
select ok(public.set_campaign_status('ca000000-0000-4000-8000-000000000001',
    'ca000000-0000-4000-8000-000000000101', 'active'), 'A publie sa campagne');
select ok(public.set_hunt_status('ca000000-0000-4000-8000-000000000001',
    'ca000000-0000-4000-8000-000000000111', 'active'), 'A publie sa chasse');
select ok(public.set_calendar_status('ca000000-0000-4000-8000-000000000001',
    'ca000000-0000-4000-8000-000000000121', 'active'), 'A publie son calendrier');
select ok(public.set_loyalty_program_status('ca000000-0000-4000-8000-000000000001',
    'ca000000-0000-4000-8000-000000000131', 'active'), 'A publie sa fidelite');
select ok(public.set_quiz_status('ca000000-0000-4000-8000-000000000001',
    'ca000000-0000-4000-8000-000000000141', 'active'), 'A publie son quiz');
select ok(public.set_jackpot_campaign_status('ca000000-0000-4000-8000-000000000001',
    'ca000000-0000-4000-8000-000000000151', 'active'), 'A publie son jackpot');
select ok(public.set_event_game_status('ca000000-0000-4000-8000-000000000001',
    'ca000000-0000-4000-8000-000000000161', 'active'), 'A publie son jeu d''evenement');
select ok(public.set_referral_program_enabled('ca000000-0000-4000-8000-000000000001',
    'ca000000-0000-4000-8000-000000000171', true), 'A allume son parrainage');
select ok(public.set_contest_status('ca000000-0000-4000-8000-000000000001',
    'ca000000-0000-4000-8000-000000000181', 'active'), 'A publie son championnat');

select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select is((select pg_catalog.count(*) from public.campaigns
           where organization_id = 'ca000000-0000-4000-8000-000000000001' and status = 'active'),
  1::bigint, 'la campagne de A est reellement active en base');
select is((select enabled from public.referral_programs where id = 'ca000000-0000-4000-8000-000000000171'),
  true, 'le parrainage de A est reellement allume');

-- ── 5bis. L'AUDIT EXISTE ────────────────────────────────────
-- Une transition sans trace ne se relit pas. Neuf publications viennent
-- d'avoir lieu ; neuf lignes doivent en témoigner.
select is((select pg_catalog.count(*) from public.audit_logs
           where organization_id = 'ca000000-0000-4000-8000-000000000001'
             and action in ('campaign.status.update','hunt.status.update','calendar.status.update',
                            'loyalty.status.update','quiz.status.update','jackpot.status.update',
                            'event_game.status.update','referral.enabled.update','contest.status.update')),
  9::bigint, 'les neuf publications sont auditees');

-- ══ 6. start_event_session — LA PORTE GARDÉE NULLE PART ═════
-- Publication joueur d'un événement live : `draft → lobby` rend la session
-- joignable. Elle est `grant execute … to authenticated` et ne testait que
-- `is_org_editor` — ni la base ni `authorizeRemote` ne portaient de droit.
select set_config('request.jwt.claims',
  '{"role":"authenticated","sub":"ca000000-0000-4000-8000-0000000000a2"}', true);
select throws_ok(
  $$select public.start_event_session('ca000000-0000-4000-8000-000000000002',
      'ca000000-0000-4000-8000-000000000192')$$,
  'P0001', 'module access required: events',
  'start_event_session refuse d''ouvrir le lobby sans le module');

select set_config('request.jwt.claims',
  '{"role":"authenticated","sub":"ca000000-0000-4000-8000-0000000000a3"}', true);
select throws_ok(
  $$select public.start_event_session('ca000000-0000-4000-8000-000000000003',
      'ca000000-0000-4000-8000-000000000193')$$,
  'P0001', 'module access required: events',
  'ni pour un resilie dont l''addon events est reste allume');

-- La session ne doit pas être joignable après ces deux refus.
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select is((select pg_catalog.count(*) from public.event_sessions
           where id in ('ca000000-0000-4000-8000-000000000192','ca000000-0000-4000-8000-000000000193')
             and status <> 'draft'), 0::bigint,
  'aucune session rendue joignable par les refus');

-- Non-régression : avec le droit, le lobby s'ouvre.
select set_config('request.jwt.claims',
  '{"role":"authenticated","sub":"ca000000-0000-4000-8000-0000000000a1"}', true);
select is(
  (public.start_event_session('ca000000-0000-4000-8000-000000000001',
     'ca000000-0000-4000-8000-000000000191'))->>'state',
  'ok', 'avec le module, le lobby s''ouvre');

-- Une session INEXISTANTE continue de rendre 'invalid_transition' et non un
-- défaut de droit : le droit est vérifié APRÈS la lecture, pour ne pas
-- révéler l'état d'abonnement à qui interroge un identifiant au hasard.
select is(
  (public.start_event_session('ca000000-0000-4000-8000-000000000001',
     'ca000000-0000-4000-8000-0000000000ff'))->>'state',
  'invalid_transition',
  'une session inconnue rend invalid_transition, sans rien dire de l''abonnement');

-- ══ 7. LES GRANTS D'EXÉCUTION DES RPC NEUVES ════════════════
select ok(has_function_privilege('authenticated', 'public.set_hunt_status(uuid,uuid,text,text)', 'EXECUTE'),
  'un editeur peut appeler la RPC de transition');
select ok(not has_function_privilege('anon', 'public.set_hunt_status(uuid,uuid,text,text)', 'EXECUTE'),
  'anon ne publie rien');
select ok(not has_function_privilege('anon', 'public.set_campaign_status(uuid,uuid,text,text)', 'EXECUTE'),
  'anon ne publie pas de campagne non plus');
select ok(not has_function_privilege('anon',
  'public.set_referral_program_enabled(uuid,uuid,boolean,text)', 'EXECUTE'),
  'anon n''allume pas le parrainage');

select * from finish();
rollback;
