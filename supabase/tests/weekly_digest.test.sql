-- ============================================================
-- 20260821120000 — org_weekly_digest + opt-out + worker
--
-- Ce que ce fichier démontre, par ordre d'importance :
--
--   1. LA COMPARAISON EST JUSTE (section 3). C'est la raison d'être de la
--      RPC : « 3 lots » ne veut rien dire, « 3 lots contre 1 » se lit d'un
--      coup d'œil. Les deux fenêtres sont peuplées DIFFÉREMMENT et
--      volontairement, pour qu'une confusion entre elles soit visible — deux
--      fenêtres égales rendraient le test vert quelle que soit l'erreur.
--   2. LES MONTANTS SUIVENT LE RÔLE (section 5), y compris `null` et non
--      zéro. Un caissier ne lit pas la marge de sa boutique.
--   3. L'ISOLATION MULTI-TENANT (section 6) : l'organisation voisine a des
--      lots dans la même fenêtre, ils ne doivent JAMAIS entrer dans le
--      rapport — ni dans les volumes, ni dans le top des lots.
--   4. LE TOP LIT LE LIBELLÉ GRAVÉ et ne rend AUCUN code (section 4). Cette
--      sortie part dans un e-mail : un code de retrait y serait un droit au
--      porteur recopié dans une boîte aux lettres.
--   5. Les bornes de `p_days` et l'autorisation (sections 2 et 7).
--
-- TOUTES les assertions de volume sont scopées à l'organisation de test.
-- Aucune ne compte globalement : ce projet a déjà livré cinq assertions
-- vertes sur base vide et rouges sur base semée pour avoir écrit
-- `count(*) from reward_issuances` sans clause `where`.
-- ============================================================
begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

select set_config('request.jwt.claims', '{"role":"service_role"}', true);

-- ── Fixtures ────────────────────────────────────────────────
insert into public.organizations (id, name, slug) values
  ('ea000000-0000-4000-8000-000000000001', 'Org Digest',  'tap-digest'),
  ('ea000000-0000-4000-8000-000000000002', 'Org Voisine', 'tap-digest-2');

insert into auth.users (id, email) values
  ('ea000000-0000-4000-8000-0000000000a1', 'proprio@tap-digest.local'),
  ('ea000000-0000-4000-8000-0000000000a2', 'editeur@tap-digest.local'),
  ('ea000000-0000-4000-8000-0000000000a3', 'caissier@tap-digest.local'),
  ('ea000000-0000-4000-8000-0000000000b1', 'proprio@tap-digest-2.local');

insert into public.organization_members (organization_id, user_id, role) values
  ('ea000000-0000-4000-8000-000000000001', 'ea000000-0000-4000-8000-0000000000a1', 'owner'),
  ('ea000000-0000-4000-8000-000000000001', 'ea000000-0000-4000-8000-0000000000a2', 'editor'),
  ('ea000000-0000-4000-8000-000000000001', 'ea000000-0000-4000-8000-0000000000a3', 'cashier'),
  ('ea000000-0000-4000-8000-000000000002', 'ea000000-0000-4000-8000-0000000000b1', 'owner');

-- ── Le registre : fenêtre COURANTE (J-3) ────────────────────
-- 3 lots émis, 2 retirés, panier 1000 + 500 = 1500.
-- « Café offert » x2, « Croissant offert » x1 → le top doit ordonner.
insert into public.reward_issuances (
  organization_id, source_type, source_id, code, label,
  issued_at, redeemed_at, basket_cents
) values
  ('ea000000-0000-4000-8000-000000000001', 'wheel',
   'ea000000-0000-4000-8000-000000000011', 'GAIN-CUR1', 'Café offert',
   now() - interval '3 days', now() - interval '3 days', 1000),
  ('ea000000-0000-4000-8000-000000000001', 'wheel',
   'ea000000-0000-4000-8000-000000000012', 'GAIN-CUR2', 'Café offert',
   now() - interval '2 days', now() - interval '2 days', 500),
  ('ea000000-0000-4000-8000-000000000001', 'wheel',
   'ea000000-0000-4000-8000-000000000013', 'GAIN-CUR3', 'Croissant offert',
   now() - interval '1 day', null, null);

-- ── Le registre : fenêtre PRÉCÉDENTE (J-10) ─────────────────
-- Volontairement DIFFÉRENTE : 1 lot émis, 1 retiré, panier 200.
insert into public.reward_issuances (
  organization_id, source_type, source_id, code, label,
  issued_at, redeemed_at, basket_cents
) values
  ('ea000000-0000-4000-8000-000000000001', 'wheel',
   'ea000000-0000-4000-8000-000000000021', 'GAIN-PRV1', 'Thé offert',
   now() - interval '10 days', now() - interval '10 days', 200);

-- ── Hors des DEUX fenêtres (J-30) : ne doit jamais compter ──
insert into public.reward_issuances (
  organization_id, source_type, source_id, code, label,
  issued_at, redeemed_at, basket_cents
) values
  ('ea000000-0000-4000-8000-000000000001', 'wheel',
   'ea000000-0000-4000-8000-000000000031', 'GAIN-OLD1', 'Lot ancien',
   now() - interval '30 days', now() - interval '30 days', 99999);

-- ── L'organisation VOISINE, dans la MÊME fenêtre ────────────
-- Si l'isolation manque, ces lignes gonflent le rapport de l'org 1.
insert into public.reward_issuances (
  organization_id, source_type, source_id, code, label,
  issued_at, redeemed_at, basket_cents
) values
  ('ea000000-0000-4000-8000-000000000002', 'wheel',
   'ea000000-0000-4000-8000-000000000041', 'GAIN-NEI1', 'Lot du voisin',
   now() - interval '2 days', now() - interval '2 days', 7777),
  ('ea000000-0000-4000-8000-000000000002', 'wheel',
   'ea000000-0000-4000-8000-000000000042', 'GAIN-NEI2', 'Lot du voisin',
   now() - interval '2 days', null, null);

-- ── Les joueurs (experience_events) ─────────────────────────
-- Fenêtre courante : DEUX joueurs distincts, dont un qui joue DEUX fois
-- (il ne doit compter qu'une fois — c'est tout l'intérêt du distinct).
-- Fenêtre précédente : UN seul.
insert into public.experience_events (
  organization_id, event_name, experience_kind, experience_id,
  player_key, occurred_at
) values
  ('ea000000-0000-4000-8000-000000000001', 'experience_started', 'campaign',
   'ea000000-0000-4000-8000-000000000051', repeat('7b', 32), now() - interval '3 days'),
  ('ea000000-0000-4000-8000-000000000001', 'experience_completed', 'campaign',
   'ea000000-0000-4000-8000-000000000051', repeat('7b', 32), now() - interval '2 days'),
  ('ea000000-0000-4000-8000-000000000001', 'experience_started', 'campaign',
   'ea000000-0000-4000-8000-000000000051', repeat('3c', 32), now() - interval '1 day'),
  ('ea000000-0000-4000-8000-000000000001', 'experience_started', 'campaign',
   'ea000000-0000-4000-8000-000000000051', repeat('5d', 32), now() - interval '10 days'),
  -- Le voisin, même fenêtre : ne doit pas être compté pour l'org 1.
  ('ea000000-0000-4000-8000-000000000002', 'experience_started', 'campaign',
   'ea000000-0000-4000-8000-000000000052', repeat('7b', 32), now() - interval '2 days');

-- ══ 1. L'opt-out ════════════════════════════════════════════
select has_column('public', 'organizations', 'weekly_digest',
  'organizations porte le réglage weekly_digest');
select col_not_null('public', 'organizations', 'weekly_digest',
  'weekly_digest est not null — un réglage à null ne se lit pas');
select is(
  (select weekly_digest from public.organizations
    where id = 'ea000000-0000-4000-8000-000000000001'),
  true,
  'le rapport est OPT-OUT : actif par défaut, comme notify_on_win');

-- ══ 2. Bornage de p_days ════════════════════════════════════
select is(
  (select period_days from public.org_weekly_digest(
     'ea000000-0000-4000-8000-000000000001', null)),
  7, 'p_days null retombe sur 7 — la RPC sert un rapport HEBDOMADAIRE');
select is(
  (select period_days from public.org_weekly_digest(
     'ea000000-0000-4000-8000-000000000001', 0)),
  1, 'p_days = 0 est remonté à 1 : une fenêtre vide ne renvoie pas un rapport vide silencieux');
select is(
  (select period_days from public.org_weekly_digest(
     'ea000000-0000-4000-8000-000000000001', 9999)),
  365, 'p_days est plafonné à 365, comme org_prize_funnel');

-- ══ 3. LA COMPARAISON — le cœur du sujet ════════════════════
select is(
  (select rewards_issued from public.org_weekly_digest(
     'ea000000-0000-4000-8000-000000000001', 7)),
  3::bigint, 'fenêtre courante : 3 lots émis');
select is(
  (select prev_rewards_issued from public.org_weekly_digest(
     'ea000000-0000-4000-8000-000000000001', 7)),
  1::bigint, 'fenêtre précédente : 1 lot émis — la comparaison ne confond pas les deux');
select is(
  (select rewards_redeemed from public.org_weekly_digest(
     'ea000000-0000-4000-8000-000000000001', 7)),
  2::bigint, 'fenêtre courante : 2 lots remis (le troisième est émis mais pas retiré)');
select is(
  (select prev_rewards_redeemed from public.org_weekly_digest(
     'ea000000-0000-4000-8000-000000000001', 7)),
  1::bigint, 'fenêtre précédente : 1 lot remis');

-- Le lot à J-30 est hors des DEUX fenêtres : son panier de 99999 ne doit
-- apparaître nulle part. S'il fuit, l'un des deux chiffres explose.
select is(
  (select basket_cents from public.org_weekly_digest(
     'ea000000-0000-4000-8000-000000000001', 7)),
  1500::bigint, 'panier attribuable courant = 1000 + 500, le lot non retiré ne compte pas');
select is(
  (select prev_basket_cents from public.org_weekly_digest(
     'ea000000-0000-4000-8000-000000000001', 7)),
  200::bigint, 'panier attribuable précédent = 200 — le lot à J-30 reste dehors');

-- Joueurs distincts : 2 en courant (dont un joue deux fois), 1 en précédent.
select is(
  (select players from public.org_weekly_digest(
     'ea000000-0000-4000-8000-000000000001', 7)),
  2::bigint, 'joueurs courants = 2 : celui qui joue DEUX fois ne compte qu''une');
select is(
  (select prev_players from public.org_weekly_digest(
     'ea000000-0000-4000-8000-000000000001', 7)),
  1::bigint, 'joueurs de la période précédente = 1');

-- ══ 4. Le top des lots ══════════════════════════════════════
select is(
  (select top_rewards -> 0 ->> 'label' from public.org_weekly_digest(
     'ea000000-0000-4000-8000-000000000001', 7)),
  'Café offert', 'le lot le plus gagné arrive en tête');
select is(
  (select (top_rewards -> 0 ->> 'count')::int from public.org_weekly_digest(
     'ea000000-0000-4000-8000-000000000001', 7)),
  2, 'et il est compté 2 fois');
select is(
  (select pg_catalog.jsonb_array_length(top_rewards) from public.org_weekly_digest(
     'ea000000-0000-4000-8000-000000000001', 7)),
  2, 'deux libellés distincts dans la fenêtre courante — « Thé offert » (précédente) et « Lot ancien » (J-30) sont dehors');

-- LE POINT QUI COMPTE : cette sortie part dans un e-mail.
select is(
  (select top_rewards::text like '%GAIN-%' from public.org_weekly_digest(
     'ea000000-0000-4000-8000-000000000001', 7)),
  false, 'AUCUN code de retrait dans le top — la sortie part dans un e-mail');

-- ══ 5. Les montants suivent le rôle ═════════════════════════
select set_config('request.jwt.claims',
  '{"role":"authenticated","sub":"ea000000-0000-4000-8000-0000000000a3"}', true);
select is(
  (select basket_cents from public.org_weekly_digest(
     'ea000000-0000-4000-8000-000000000001', 7)),
  null, 'un CAISSIER ne lit pas le panier : null, et non zéro');
select is(
  (select prev_basket_cents from public.org_weekly_digest(
     'ea000000-0000-4000-8000-000000000001', 7)),
  null, 'ni celui de la période précédente');
-- Mais il garde les VOLUMES : la RPC ne doit pas être plus étroite que la
-- policy « prizes: editors », qui ne porte que sur les montants.
select is(
  (select rewards_redeemed from public.org_weekly_digest(
     'ea000000-0000-4000-8000-000000000001', 7)),
  2::bigint, 'le caissier garde les VOLUMES — seuls les montants lui sont refusés');

select set_config('request.jwt.claims',
  '{"role":"authenticated","sub":"ea000000-0000-4000-8000-0000000000a2"}', true);
select is(
  (select basket_cents from public.org_weekly_digest(
     'ea000000-0000-4000-8000-000000000001', 7)),
  1500::bigint, 'un ÉDITEUR lit le panier');

-- ══ 6. Isolation multi-tenant ═══════════════════════════════
-- Le voisin a 2 lots et 1 joueur dans la MÊME fenêtre. Aucun chiffre de
-- l'org 1 ne doit bouger, et son top ne doit pas nommer « Lot du voisin ».
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select is(
  (select rewards_issued from public.org_weekly_digest(
     'ea000000-0000-4000-8000-000000000001', 7)),
  3::bigint, 'les lots du voisin n''entrent pas dans les volumes');
select is(
  (select basket_cents from public.org_weekly_digest(
     'ea000000-0000-4000-8000-000000000001', 7)),
  1500::bigint, 'ni dans le panier (le voisin porte 7777)');
select is(
  (select top_rewards::text like '%voisin%' from public.org_weekly_digest(
     'ea000000-0000-4000-8000-000000000001', 7)),
  false, 'ni dans le top des lots');
select is(
  (select players from public.org_weekly_digest(
     'ea000000-0000-4000-8000-000000000001', 7)),
  2::bigint, 'ni dans le compte des joueurs — le voisin partage pourtant le MÊME hash d''appareil');

-- ══ 7. Autorisation ═════════════════════════════════════════
select set_config('request.jwt.claims',
  '{"role":"authenticated","sub":"ea000000-0000-4000-8000-0000000000b1"}', true);
select throws_ok(
  $$ select * from public.org_weekly_digest('ea000000-0000-4000-8000-000000000001', 7) $$,
  'not authorized',
  'le propriétaire d''une AUTRE organisation ne lit pas ce rapport');

-- ══ 8. Le worker est inscrit ════════════════════════════════
-- Sans cette ligne, `ops_worker_runs.worker` (clé étrangère) refuse le
-- heartbeat, et `startWorkerRunSafely` avale l'échec PAR CONCEPTION : le cron
-- tournerait chaque lundi sans laisser la moindre trace.
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select is(
  (select count(*) from public.ops_worker_definitions where worker = 'weekly-digest'),
  1::bigint, 'le worker weekly-digest est inscrit au registre');
select is(
  (select expected_period_seconds from public.ops_worker_definitions
    where worker = 'weekly-digest'),
  604800, 'période hebdomadaire');
select is(
  (select enabled from public.ops_worker_definitions where worker = 'weekly-digest'),
  false, 'non supervisé tant qu''il n''a jamais réussi — sinon l''objectif de service naît rouge');
-- La contrainte `tolerance >= period` est la garde réelle : une tolérance
-- plus courte que le pas déclarerait malade un worker parfaitement sain.
select ok(
  (select tolerance_seconds >= expected_period_seconds
     from public.ops_worker_definitions where worker = 'weekly-digest'),
  'la tolérance couvre au moins une période complète');

-- La clé étrangère est le vrai mécanisme : on le prouve plutôt que de le
-- supposer. Un nom non inscrit doit être REFUSÉ.
select throws_ok(
  $$ insert into public.ops_worker_runs (worker, status)
     values ('digest-hebdo-inexistant', 'running') $$,
  '23503', null,
  'un heartbeat au nom non inscrit est refusé par la clé étrangère — c''est ce que l''inscription évite');

select * from finish();
rollback;
