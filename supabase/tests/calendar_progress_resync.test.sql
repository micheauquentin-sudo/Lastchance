-- ============================================================
-- 20260816120000 — resync_calendar_progress
--
-- `calendar_players.opened_count` est un compteur STOCKÉ ; les ouvertures
-- réelles vivent dans `calendar_openings`, qui cascade avec `calendar_days`.
-- Réduire la grille détruit donc des ouvertures SANS toucher au compteur, et
-- la divergence part dans les deux sens.
--
-- Ce que ce fichier démontre, par ordre d'importance :
--
--   1. LE COMPTEUR MENSONGER DANS LE SENS QUI COÛTE (sections 3-4). P2 n'a
--      ouvert QUE des cases détruites : zéro ouverture survivante, compteur à
--      3, seuil à 2. Sans recomptage il décroche la récompense d'assiduité
--      SANS AVOIR RIEN OUVERT, et consomme le stock fini d'un autre. C'est
--      l'assertion que le sabotage du recomptage doit faire tomber.
--   2. LE SENS INVERSE, tout aussi réel : P1 a ouvert 4 cases dont 2 ont
--      survécu ; il est complet pour de bon (2 sur 2) mais la complétion n'est
--      calculée que PENDANT une ouverture, et il ne lui reste plus une seule
--      case à ouvrir. Sans cette fonction il ne recevrait JAMAIS son cadeau —
--      jumeau exact de la carte de victoire vide de la chasse au trésor.
--   3. LES DEUX GARDES DE CONTEXTE, et l'ASYMÉTRIE DÉLIBÉRÉE (section 6).
--      La fonction fait deux choses de nature différente : elle RÉPARE un
--      compteur (n'accorde rien) et elle ÉMET un code de retrait (accorde un
--      droit). La réparation court dans tous les contextes — laisser un
--      compteur mensonger sur un calendrier clos, ce serait garder le défaut
--      pour la moitié des cas. L'émission reprend strictement les deux gardes
--      d'`open_calendar_box` : `addon_calendar` et `status = 'active'`. La
--      section 6 prouve les deux moitiés SÉPARÉMENT sur le même appel, et se
--      termine par un contrôle positif.
--   4. L'autorisation précède TOUTE écriture : un caissier n'obtient pas
--      seulement 0, il ne déclenche même pas la réparation (section 2).
--   5. Le stock fini est respecté à l'unité près, le plus ancien d'abord, et
--      un cadeau déjà émis n'est JAMAIS repris.
--
-- Rappel de modélisation, vérifié et non supposé : `calendars` n'a pas de
-- `starts_at`/`ends_at` — la fenêtre du module est par case (`unlock_at`) et
-- ne concerne pas la complétion. D'où DEUX gardes ici, contre quatre pour la
-- chasse au trésor (20260815120000).
-- ============================================================
begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

select set_config('request.jwt.claims', '{"role":"service_role"}', true);

-- ── Fixtures ────────────────────────────────────────────────
insert into public.organizations (id, name, slug, addon_calendar) values
  ('d8000000-0000-4000-8000-000000000001', 'Org Calendrier', 'tap-cal',   true),
  ('d8000000-0000-4000-8000-000000000002', 'Org Voisine',    'tap-cal-2', true);

insert into auth.users (id, email) values
  ('d8000000-0000-4000-8000-0000000000a1', 'proprio@tap-cal.local'),
  ('d8000000-0000-4000-8000-0000000000a2', 'editeur@tap-cal.local'),
  ('d8000000-0000-4000-8000-0000000000a3', 'caissier@tap-cal.local'),
  ('d8000000-0000-4000-8000-0000000000b1', 'proprio@tap-cal-2.local');

insert into public.organization_members (organization_id, user_id, role) values
  ('d8000000-0000-4000-8000-000000000001', 'd8000000-0000-4000-8000-0000000000a1', 'owner'),
  ('d8000000-0000-4000-8000-000000000001', 'd8000000-0000-4000-8000-0000000000a2', 'editor'),
  ('d8000000-0000-4000-8000-000000000001', 'd8000000-0000-4000-8000-0000000000a3', 'cashier'),
  ('d8000000-0000-4000-8000-000000000002', 'd8000000-0000-4000-8000-0000000000b1', 'owner');

-- Grille de 5 cases, active, récompense d'assiduité au stock de 1.
insert into public.calendars (
  id, organization_id, name, status, start_date, timezone, day_count,
  public_slug, completion_reward_label, completion_reward_stock
) values (
  'd8000000-0000-4000-8000-000000000010',
  'd8000000-0000-4000-8000-000000000001',
  'Avent du café', 'active', current_date - 10, 'Europe/Paris', 5,
  'tap-cal-avent', 'Coffret dégustation', 1
);

insert into public.calendar_days (id, calendar_id, organization_id, day_index, unlock_at, content_type) values
  ('d8000000-0000-4000-8000-000000000021', 'd8000000-0000-4000-8000-000000000010',
   'd8000000-0000-4000-8000-000000000001', 1, now() - interval '9 days', 'content'),
  ('d8000000-0000-4000-8000-000000000022', 'd8000000-0000-4000-8000-000000000010',
   'd8000000-0000-4000-8000-000000000001', 2, now() - interval '8 days', 'content'),
  ('d8000000-0000-4000-8000-000000000023', 'd8000000-0000-4000-8000-000000000010',
   'd8000000-0000-4000-8000-000000000001', 3, now() - interval '7 days', 'content'),
  ('d8000000-0000-4000-8000-000000000024', 'd8000000-0000-4000-8000-000000000010',
   'd8000000-0000-4000-8000-000000000001', 4, now() - interval '6 days', 'content'),
  ('d8000000-0000-4000-8000-000000000025', 'd8000000-0000-4000-8000-000000000010',
   'd8000000-0000-4000-8000-000000000001', 5, now() - interval '5 days', 'content');

-- Quatre joueurs d'âges distincts : sous stock fini, le cadeau va au plus
-- ancien, il faut donc que l'ordre soit observable. La grille va tomber de 5
-- à 2 cases : seules les cases 1 et 2 survivront.
insert into public.calendar_players
  (id, calendar_id, organization_id, token_hash, opened_count, created_at) values
  -- P1 : cases 1-2-3-4. Après réduction, 2 ouvertures RÉELLES sur 2 cases :
  --      réellement complet, mais plus AUCUNE case à ouvrir.
  ('d8000000-0000-4000-8000-0000000000f1', 'd8000000-0000-4000-8000-000000000010',
   'd8000000-0000-4000-8000-000000000001', repeat('a', 64), 4, now() - interval '4 hours'),
  -- P4 : cases 1-2-5. Même situation, mais plus jeune : le stock de 1 doit
  --      aller à P1, pas à lui.
  ('d8000000-0000-4000-8000-0000000000f4', 'd8000000-0000-4000-8000-000000000010',
   'd8000000-0000-4000-8000-000000000001', repeat('d', 64), 3, now() - interval '3 hours'),
  -- P2 : UNIQUEMENT les cases 3-4-5, celles qui vont disparaître. Compteur à 3
  --      pour ZÉRO ouverture survivante, seuil à 2 : sans recomptage il touche
  --      la récompense d'assiduité sans avoir rien ouvert du tout.
  ('d8000000-0000-4000-8000-0000000000f2', 'd8000000-0000-4000-8000-000000000010',
   'd8000000-0000-4000-8000-000000000001', repeat('b', 64), 3, now() - interval '2 hours'),
  -- P3 : case 1 seulement. Incomplet avant comme après.
  ('d8000000-0000-4000-8000-0000000000f3', 'd8000000-0000-4000-8000-000000000010',
   'd8000000-0000-4000-8000-000000000001', repeat('c', 64), 1, now() - interval '1 hour');

insert into public.calendar_openings (player_id, day_id, calendar_id, organization_id, content_type)
select p.id, d.id,
       'd8000000-0000-4000-8000-000000000010',
       'd8000000-0000-4000-8000-000000000001', 'content'
  from (values
    ('d8000000-0000-4000-8000-0000000000f1'::uuid, 'd8000000-0000-4000-8000-000000000021'::uuid),
    ('d8000000-0000-4000-8000-0000000000f1'::uuid, 'd8000000-0000-4000-8000-000000000022'::uuid),
    ('d8000000-0000-4000-8000-0000000000f1'::uuid, 'd8000000-0000-4000-8000-000000000023'::uuid),
    ('d8000000-0000-4000-8000-0000000000f1'::uuid, 'd8000000-0000-4000-8000-000000000024'::uuid),
    ('d8000000-0000-4000-8000-0000000000f4'::uuid, 'd8000000-0000-4000-8000-000000000021'::uuid),
    ('d8000000-0000-4000-8000-0000000000f4'::uuid, 'd8000000-0000-4000-8000-000000000022'::uuid),
    ('d8000000-0000-4000-8000-0000000000f4'::uuid, 'd8000000-0000-4000-8000-000000000025'::uuid),
    ('d8000000-0000-4000-8000-0000000000f2'::uuid, 'd8000000-0000-4000-8000-000000000023'::uuid),
    ('d8000000-0000-4000-8000-0000000000f2'::uuid, 'd8000000-0000-4000-8000-000000000024'::uuid),
    ('d8000000-0000-4000-8000-0000000000f2'::uuid, 'd8000000-0000-4000-8000-000000000025'::uuid),
    ('d8000000-0000-4000-8000-0000000000f3'::uuid, 'd8000000-0000-4000-8000-000000000021'::uuid)
  ) as v(pid, did)
  join public.calendar_players p on p.id = v.pid
  join public.calendar_days d on d.id = v.did;

-- ══ 1. ACL de fonction ═══════════════════════════════════════
select ok(not has_function_privilege('anon',
  'public.resync_calendar_progress(uuid)', 'execute'),
  'anon ne peut pas resynchroniser un calendrier — la fonction émet des codes réels');
select ok(has_function_privilege('authenticated',
  'public.resync_calendar_progress(uuid)', 'execute'),
  'un utilisateur authentifié peut l''appeler (le prédicat filtre ensuite)');
-- `revoke … from public, anon` ne suffit PAS : les privilèges par défaut du
-- schéma public accordent EXECUTE à service_role sur toute fonction créée. Le
-- retrait est donc écrit explicitement dans la migration.
select ok(not has_function_privilege('service_role',
  'public.resync_calendar_progress(uuid)', 'execute'),
  'service_role explicitement révoqué : sans auth.uid() la garde is_org_editor est structurellement fausse');

-- ══ LE GESTE DU COMMERÇANT : la grille passe de 5 à 2 cases ══
-- `syncCalendarDays` supprime les cases d'index > day_count, le calendrier
-- porte déjà le nouveau day_count. Les ouvertures des cases 3, 4 et 5 partent
-- en cascade ; AUCUN compteur ne bouge.
delete from public.calendar_days
 where calendar_id = 'd8000000-0000-4000-8000-000000000010' and day_index > 2;
update public.calendars set day_count = 2
 where id = 'd8000000-0000-4000-8000-000000000010';

-- Le défaut, constaté avant toute réparation.
select is((select opened_count from public.calendar_players
             where id = 'd8000000-0000-4000-8000-0000000000f2'),
  3, 'P2 affiche 3 ouvertures pour un seuil de 2…');
select is((select count(*) from public.calendar_openings
             where player_id = 'd8000000-0000-4000-8000-0000000000f2'),
  0::bigint, '…alors qu''il n''en a plus AUCUNE : il est « complet » sans avoir rien ouvert');
select is((select opened_count from public.calendar_players
             where id = 'd8000000-0000-4000-8000-0000000000f1'),
  4, 'P1 affiche encore 4 ouvertures…');
select is((select count(*) from public.calendar_openings
             where player_id = 'd8000000-0000-4000-8000-0000000000f1'),
  2::bigint, '…alors qu''il n''en a plus que 2 — mais 2 sur 2, donc réellement complet');

-- ══ 2. L'autorisation précède TOUTE écriture ═════════════════
-- Un caissier ne doit pas seulement obtenir 0 : la réparation elle-même ne
-- doit pas courir. Les compteurs restent donc faux après son appel — c'est ce
-- qui prouve que la garde est AVANT l'`update`, et pas après.
select set_config('request.jwt.claims',
  '{"role":"authenticated","sub":"d8000000-0000-4000-8000-0000000000a3"}', true);
select is(public.resync_calendar_progress('d8000000-0000-4000-8000-000000000010'),
  0, 'un CAISSIER ne resynchronise rien');

select set_config('request.jwt.claims',
  '{"role":"authenticated","sub":"d8000000-0000-4000-8000-0000000000b1"}', true);
select is(public.resync_calendar_progress('d8000000-0000-4000-8000-000000000010'),
  0, 'le propriétaire d''une AUTRE organisation ne resynchronise rien');

select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select is((select opened_count from public.calendar_players
             where id = 'd8000000-0000-4000-8000-0000000000f2'),
  3, 'après les deux refus, le compteur est TOUJOURS faux — aucune écriture n''a eu lieu');
select is((select count(*) from public.calendar_rewards
             where calendar_id = 'd8000000-0000-4000-8000-000000000010'),
  0::bigint, 'et aucun cadeau n''a été émis');

-- ══ 3. Le nominal : réparation + solde ═══════════════════════
select set_config('request.jwt.claims',
  '{"role":"authenticated","sub":"d8000000-0000-4000-8000-0000000000a1"}', true);
select is(public.resync_calendar_progress('d8000000-0000-4000-8000-000000000010'),
  1, 'stock de 1 : un seul cadeau accordé, bien que DEUX joueurs soient réellement complets');

select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select is((select opened_count from public.calendar_players
             where id = 'd8000000-0000-4000-8000-0000000000f1'),
  2, 'P1 : le compteur redescend à ses ouvertures réelles');
select ok((select completion_rewarded from public.calendar_players
             where id = 'd8000000-0000-4000-8000-0000000000f1'),
  'P1 obtient enfin sa récompense d''assiduité — il n''avait plus AUCUNE case à ouvrir');
select matches((select code from public.calendar_rewards
                  where player_id = 'd8000000-0000-4000-8000-0000000000f1'),
  '^CADEAU-[A-HJ-NP-Z2-9]{8}$',
  'code au format CADEAU-XXXXXXXX (alphabet sans I/O/0/1), comme open_calendar_box');
select is((select count(*) from public.calendar_rewards
             where calendar_id = 'd8000000-0000-4000-8000-000000000010'),
  1::bigint, 'un seul cadeau émis');
select is((select completion_reward_claimed_count from public.calendars
             where id = 'd8000000-0000-4000-8000-000000000010'),
  1, 'le compteur de stock du calendrier avance d''exactement 1');

-- Le plus ancien d'abord : P4 était complet lui aussi, mais plus jeune.
select ok(not (select completion_rewarded from public.calendar_players
                 where id = 'd8000000-0000-4000-8000-0000000000f4'),
  'P4, complet mais plus jeune, attend son tour (order by created_at asc)');
select is((select opened_count from public.calendar_players
             where id = 'd8000000-0000-4000-8000-0000000000f4'),
  2, 'son compteur est tout de même réparé — la réparation ne dépend pas du stock');

-- ══ 4. LE COMPTEUR MENSONGER, DANS LE SENS QUI COÛTE ═════════
select is((select opened_count from public.calendar_players
             where id = 'd8000000-0000-4000-8000-0000000000f2'),
  0, 'P2 retombe à 0 : ses trois ouvertures ont été détruites avec les cases');
select ok(not (select completion_rewarded from public.calendar_players
                 where id = 'd8000000-0000-4000-8000-0000000000f2'),
  'et il n''a RIEN gagné — sans le recomptage, il touchait le cadeau sans avoir rien ouvert');
select is((select count(*) from public.calendar_rewards
             where player_id = 'd8000000-0000-4000-8000-0000000000f2'),
  0::bigint, 'aucun code à son nom, et le stock d''un autre est préservé');
select is((select opened_count from public.calendar_players
             where id = 'd8000000-0000-4000-8000-0000000000f3'),
  1, 'P3, dont l''unique ouverture a survécu, garde son compteur intact');

-- ══ 5. Stock et idempotence ══════════════════════════════════
select set_config('request.jwt.claims',
  '{"role":"authenticated","sub":"d8000000-0000-4000-8000-0000000000a1"}', true);
select is(public.resync_calendar_progress('d8000000-0000-4000-8000-000000000010'),
  0, 'stock épuisé : le second appel n''accorde rien');

select set_config('request.jwt.claims', '{"role":"service_role"}', true);
update public.calendars set completion_reward_stock = 5
 where id = 'd8000000-0000-4000-8000-000000000010';
select set_config('request.jwt.claims',
  '{"role":"authenticated","sub":"d8000000-0000-4000-8000-0000000000a2"}', true);
select is(public.resync_calendar_progress('d8000000-0000-4000-8000-000000000010'),
  1, 'stock relevé : P4 SEUL obtient son cadeau — et c''est un ÉDITEUR qui a soldé');
select is(public.resync_calendar_progress('d8000000-0000-4000-8000-000000000010'),
  0, 'IDEMPOTENCE : rappelée, elle n''accorde rien de plus');
select is(public.resync_calendar_progress('d8000000-0000-4000-8000-000000000010'),
  0, 'et pas davantage au troisième appel');

select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select is((select count(*) from public.calendar_rewards
             where calendar_id = 'd8000000-0000-4000-8000-000000000010'),
  2::bigint, 'exactement deux cadeaux, malgré du stock disponible');
select is((select count(distinct code) from public.calendar_rewards
             where calendar_id = 'd8000000-0000-4000-8000-000000000010'),
  2::bigint, 'et deux codes distincts');
select is((select completion_reward_claimed_count from public.calendars
             where id = 'd8000000-0000-4000-8000-000000000010'),
  2, 'le stock consommé n''a pas dérivé');

-- Un cadeau déjà émis n'est JAMAIS repris, même si le compteur redescend : le
-- joueur l'a peut-être déjà présenté en caisse.
delete from public.calendar_openings
 where player_id = 'd8000000-0000-4000-8000-0000000000f1';
select set_config('request.jwt.claims',
  '{"role":"authenticated","sub":"d8000000-0000-4000-8000-0000000000a1"}', true);
select is(public.resync_calendar_progress('d8000000-0000-4000-8000-000000000010'),
  0, 'un joueur qui repasse sous le seuil ne déclenche rien');
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select is((select opened_count from public.calendar_players
             where id = 'd8000000-0000-4000-8000-0000000000f1'),
  0, 'son compteur suit la vérité, jusqu''à zéro');
select is((select count(*) from public.calendar_rewards
             where player_id = 'd8000000-0000-4000-8000-0000000000f1'),
  1::bigint, 'MAIS SON CADEAU RESTE — on ne reprend pas un code déjà remis');
select ok((select completion_rewarded from public.calendar_players
             where id = 'd8000000-0000-4000-8000-0000000000f1'),
  'et son drapeau de récompense reste posé');

-- ══ 6. LES DEUX GARDES DE CONTEXTE, ET L'ASYMÉTRIE ═══════════
-- P5 arrive avec deux ouvertures réelles et un compteur à ZÉRO : il est donc à
-- la fois « à réparer » et « à solder ». Chaque appel ci-dessous teste les DEUX
-- moitiés d'un coup — la réparation doit courir, l'émission non.
insert into public.calendar_players
  (id, calendar_id, organization_id, token_hash, opened_count, created_at)
values ('d8000000-0000-4000-8000-0000000000f5', 'd8000000-0000-4000-8000-000000000010',
        'd8000000-0000-4000-8000-000000000001', repeat('5', 64), 0, now());
insert into public.calendar_openings (player_id, day_id, calendar_id, organization_id, content_type)
values
  ('d8000000-0000-4000-8000-0000000000f5', 'd8000000-0000-4000-8000-000000000021',
   'd8000000-0000-4000-8000-000000000010', 'd8000000-0000-4000-8000-000000000001', 'content'),
  ('d8000000-0000-4000-8000-0000000000f5', 'd8000000-0000-4000-8000-000000000022',
   'd8000000-0000-4000-8000-000000000010', 'd8000000-0000-4000-8000-000000000001', 'content');

-- (a) CALENDRIER EN BROUILLON
update public.calendars set status = 'draft'
 where id = 'd8000000-0000-4000-8000-000000000010';
select set_config('request.jwt.claims',
  '{"role":"authenticated","sub":"d8000000-0000-4000-8000-0000000000a1"}', true);
select is(public.resync_calendar_progress('d8000000-0000-4000-8000-000000000010'),
  0, 'calendrier en BROUILLON : aucun cadeau, alors que P5 est complet et le stock disponible');
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select is((select opened_count from public.calendar_players
             where id = 'd8000000-0000-4000-8000-0000000000f5'),
  2, 'MAIS le compteur de P5 a bien été réparé : la réparation n''est pas gardée, l''émission l''est');

-- (b) CALENDRIER ARCHIVÉ
update public.calendars set status = 'archived'
 where id = 'd8000000-0000-4000-8000-000000000010';
update public.calendar_players set opened_count = 0
 where id = 'd8000000-0000-4000-8000-0000000000f5';
select set_config('request.jwt.claims',
  '{"role":"authenticated","sub":"d8000000-0000-4000-8000-0000000000a1"}', true);
select is(public.resync_calendar_progress('d8000000-0000-4000-8000-000000000010'),
  0, 'calendrier ARCHIVÉ : aucun cadeau');
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select is((select opened_count from public.calendar_players
             where id = 'd8000000-0000-4000-8000-0000000000f5'),
  2, 'et son compteur est réparé là aussi — un calendrier clos ne doit pas mentir');

-- (c) MODULE DÉSACTIVÉ
update public.calendars set status = 'active'
 where id = 'd8000000-0000-4000-8000-000000000010';
update public.organizations set addon_calendar = false
 where id = 'd8000000-0000-4000-8000-000000000001';
update public.calendar_players set opened_count = 0
 where id = 'd8000000-0000-4000-8000-0000000000f5';
select set_config('request.jwt.claims',
  '{"role":"authenticated","sub":"d8000000-0000-4000-8000-0000000000a1"}', true);
select is(public.resync_calendar_progress('d8000000-0000-4000-8000-000000000010'),
  0, 'module Calendrier DÉSACTIVÉ : aucun cadeau — un commerçant qui ne paie plus n''en frappe pas');
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select is((select opened_count from public.calendar_players
             where id = 'd8000000-0000-4000-8000-0000000000f5'),
  2, 'compteur réparé malgré l''addon coupé');
select is((select count(*) from public.calendar_rewards
             where calendar_id = 'd8000000-0000-4000-8000-000000000010'),
  2::bigint, 'les trois contextes fermés n''ont RIEN émis en tout');

-- (d) CONTRÔLE POSITIF — même joueur, même stock, même calendrier : seul le
--     contexte est rouvert. Sans lui, les trois refus ci-dessus seraient verts
--     même si la fonction ne faisait plus rien du tout.
update public.organizations set addon_calendar = true
 where id = 'd8000000-0000-4000-8000-000000000001';
select set_config('request.jwt.claims',
  '{"role":"authenticated","sub":"d8000000-0000-4000-8000-0000000000a1"}', true);
select is(public.resync_calendar_progress('d8000000-0000-4000-8000-000000000010'),
  1, 'CONTRÔLE POSITIF : contexte rouvert, P5 obtient son cadeau');
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select is((select count(*) from public.calendar_rewards
             where calendar_id = 'd8000000-0000-4000-8000-000000000010'),
  3::bigint, 'trois cadeaux au total');
select ok((select completion_rewarded from public.calendar_players
             where id = 'd8000000-0000-4000-8000-0000000000f5'),
  'et le drapeau de P5 est posé');

-- ══ 7. Calendrier inconnu ════════════════════════════════════
select set_config('request.jwt.claims',
  '{"role":"authenticated","sub":"d8000000-0000-4000-8000-0000000000a1"}', true);
select is(public.resync_calendar_progress('d8000000-0000-4000-8000-0000000000ff'),
  0, 'un calendrier inconnu rend 0 sans rien révéler — indistinguable de celui d''un autre tenant');

select * from finish();
rollback;
