-- ============================================================
-- UN LOT PORTE UN EMOJI — 20261113120000 (EMOJI-1)
--
-- Ce que ces assertions gardent n'est pas l'existence de la colonne — un
-- `alter table` ne rate pas silencieusement — mais son ÉCRITURE. Le précédent
-- est frais : `reservation_activities.booking_mode` a vécu six lots posée sans
-- son grant, et tout le module bâti dessus échouait sur « permission denied
-- for column » sans que rien à l'écran ne le dise.
-- ============================================================

begin;
select plan(9);


-- ────────────────────────────────────────────────────────────
-- EMO-1..3 · LA COLONNE S'ÉCRIT ET SE LIT
-- ────────────────────────────────────────────────────────────

select ok(
  pg_catalog.has_column_privilege('authenticated', 'public.prizes', 'emoji', 'INSERT'),
  'EMO-1 · emoji s''insère : un lot créé depuis le tableau de bord naît avec son icône'
);

select ok(
  pg_catalog.has_column_privilege('authenticated', 'public.prizes', 'emoji', 'UPDATE'),
  'EMO-2 · emoji se modifie : le commerçant peut changer OU retirer l''icône'
);

select ok(
  pg_catalog.has_column_privilege('authenticated', 'public.prizes', 'emoji', 'SELECT'),
  'EMO-3 · emoji se lit : l''éditeur montre le choix déjà fait'
);


-- ────────────────────────────────────────────────────────────
-- EMO-4 · CE QUI RESTE FERMÉ, ET CE QUI NE SE GARDE PAS ICI
--
-- `anon` — le rôle du joueur, qui LIT la roue publique — n'écrit rien, icône
-- comprise.
--
-- CE QU'ON N'ASSERTE PAS, ET POURQUOI. La première version de ce fichier
-- vérifiait qu'`organization_id` n'est pas modifiable par `authenticated`, par
-- analogie avec `reglages_rendez_vous_ecrivables`. C'est FAUX sur cette table :
-- 00018 accorde `update` à `prizes` AU NIVEAU TABLE, donc toutes ses colonnes
-- le sont. Ce qui borne un lot à son organisation est la policy RLS, pas le
-- grant — `security_acl.test.sql` en est le gardien. L'assertion fausse a
-- d'ailleurs fait échouer l'application de la migration, ce qui est exactement
-- ce qu'on attend d'une garde ; la garder ici aurait donné l'illusion d'une
-- protection qui n'existe pas.
-- ────────────────────────────────────────────────────────────

select ok(
  not pg_catalog.has_column_privilege('anon', 'public.prizes', 'emoji', 'UPDATE'),
  'EMO-4 · anon ne modifie pas l''icône d''un lot'
);


-- ────────────────────────────────────────────────────────────
-- EMO-5..9 · DES ÉCRITURES RÉELLES
--
-- Les quatre assertions ci-dessus lisent le catalogue. Celles-ci ÉCRIVENT :
-- naissance avec icône, changement, RETRAIT (le `null` doit rester atteignable
-- — « aucune » est un choix du commerçant, pas une absence de saisie), puis les
-- deux refus de la contrainte.
-- ────────────────────────────────────────────────────────────

insert into public.organizations (id, name, slug)
values ('ea000000-0000-4000-8000-000000000001', 'Test Emoji', 'tap-emoji');

insert into public.campaigns (id, organization_id, name, status, code_ttl_seconds)
values ('ea000000-0000-4000-8000-000000000002',
        'ea000000-0000-4000-8000-000000000001', 'Campagne Emoji', 'active', 300);

insert into public.wheels (id, organization_id, campaign_id, name, play_limit)
values ('ea000000-0000-4000-8000-000000000003',
        'ea000000-0000-4000-8000-000000000001',
        'ea000000-0000-4000-8000-000000000002', 'Roue Emoji', 'unlimited');

insert into public.prizes (id, organization_id, wheel_id, label, emoji)
values ('ea000000-0000-4000-8000-000000000004',
        'ea000000-0000-4000-8000-000000000001',
        'ea000000-0000-4000-8000-000000000003', 'Verre de vin', '🍷');

select is(
  (select emoji from public.prizes where id = 'ea000000-0000-4000-8000-000000000004'),
  '🍷',
  'EMO-5 · un lot naît avec l''icône choisie'
);

update public.prizes set emoji = '🧀'
 where id = 'ea000000-0000-4000-8000-000000000004';

select is(
  (select emoji from public.prizes where id = 'ea000000-0000-4000-8000-000000000004'),
  '🧀',
  'EMO-6 · l''icône se change'
);

update public.prizes set emoji = null
 where id = 'ea000000-0000-4000-8000-000000000004';

select is(
  (select emoji from public.prizes where id = 'ea000000-0000-4000-8000-000000000004'),
  null,
  'EMO-7 · « aucune icône » est un état atteignable, pas un piège à sens unique'
);

select throws_ok(
  $$update public.prizes set emoji = ''
     where id = 'ea000000-0000-4000-8000-000000000004'$$,
  '23514',
  null,
  'EMO-8 · la chaîne vide est refusée : un seul « rien », et c''est null'
);

select throws_ok(
  $$update public.prizes set emoji = '🍷🧀🥖🍺🍕🍔🌮🥗🍣'
     where id = 'ea000000-0000-4000-8000-000000000004'$$,
  '23514',
  null,
  'EMO-9 · la colonne ne se détourne pas en second libellé : au-delà de 8 points de code, refus'
);


select * from finish();
rollback;
