-- ============================================================
-- LE TIRAGE REFUSE UNE CAMPAGNE FERMÉE (20261210120000)
--
-- `perform_atomic_spin` joignait `campaigns` pour vérifier une APPARTENANCE
-- (roue → campagne → organisation) sans jamais lire son ÉTAT. Statut et
-- fenêtre étaient tranchés uniquement par `src/lib/play-context.ts`, en tête de
-- la server action, avec trois à quatre allers-retours serveur avant l'appel de
-- la RPC : une campagne mise en pause dans cet intervalle distribuait encore.
--
-- CE QUE CE FICHIER ÉPROUVE : le COMPORTEMENT, jamais le texte du corps. Aucune
-- lecture de `pg_proc.prosrc` ici — une garde textuelle rougirait sur une
-- réécriture équivalente et verdirait sur une régression mise en commentaire.
-- On appelle la fonction et on regarde ce qu'elle fait au stock et à `spins`.
--
-- UNE SEULE ROUE, UNE SEULE CAMPAGNE, dont on fait varier l'état entre les
-- appels. Quatre campagnes distinctes auraient introduit quatre chaînes de
-- ressources différentes : un refus n'aurait plus prouvé que la garde d'état
-- travaille, seulement qu'un des quatre montages était mauvais.
--
-- LA CONTRE-ÉPREUVE EST EN PREMIER ET EN DERNIER, délibérément. Sans un tirage
-- qui ABOUTIT sur la même roue, toutes les assertions de refus ci-dessous
-- passeraient sur une fonction totalement cassée — celle qui ne rend jamais
-- rien est le test parfait pour un fichier qui ne vérifie que des refus.
-- ============================================================
begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

-- service_role : c'est le seul rôle qui peut appeler la RPC, et c'est aussi ce
-- qui DÉSARME `campaigns_guard_publication` — armé pour le seul
-- `auth.role() = 'authenticated'` (20260905120000). Sans ça, remettre la
-- campagne en `active` exigerait un droit de module et le montage échouerait
-- sur une cause sans rapport avec ce qu'on mesure.
select set_config('request.jwt.claims', '{"role":"service_role"}', true);

-- ── Fixtures ─────────────────────────────────────────────────
insert into public.organizations (id, name, slug)
values ('c1000000-0000-4000-8000-000000000001', 'Test Campagne Fermée', 'tap-campagne-fermee');

insert into public.campaigns (id, organization_id, name, status, code_ttl_seconds)
values ('c1000000-0000-4000-8000-000000000002',
        'c1000000-0000-4000-8000-000000000001', 'Campagne à ouvrir et fermer', 'active', 300);

-- `unlimited` : la limite de jeu n'a rien à voir avec ce qu'on mesure, et une
-- limite quotidienne masquerait un refus de campagne derrière un
-- « limit_reached » — c'est-à-dire ferait passer le test pour la mauvaise
-- raison. Même choix que `scripts/concurrency-probe.mjs` pour le même motif.
insert into public.wheels (id, organization_id, campaign_id, name, play_limit)
values ('c1000000-0000-4000-8000-000000000003',
        'c1000000-0000-4000-8000-000000000001',
        'c1000000-0000-4000-8000-000000000002', 'Roue TAP fermeture', 'unlimited');

-- Un seul lot, gagnant, à stock FINI : le tirage est déterministe (poids total
-- = 100, un seul candidat) et le stock devient le témoin de ce qui a été
-- réellement engagé. C'est lui qui distingue « refusé » de « joué en silence ».
insert into public.prizes (id, organization_id, wheel_id, label, stock, weight, is_active, is_losing)
values ('c1000000-0000-4000-8000-000000000004',
        'c1000000-0000-4000-8000-000000000001',
        'c1000000-0000-4000-8000-000000000003', 'Lot TAP fermeture', 5, 100, true, false);


-- ════════════════════════════════════════════════════════════
-- CONTRE-ÉPREUVE 1/2 — campagne ACTIVE et sans bornes : ça tire
-- ════════════════════════════════════════════════════════════
create table public.tap_fermeture_r0 as
  select * from public.perform_atomic_spin(
    'c1000000-0000-4000-8000-000000000001',
    'c1000000-0000-4000-8000-000000000002',
    'c1000000-0000-4000-8000-000000000003',
    repeat('a', 64), null, 'direct');

select is(
  (select prize_id from public.tap_fermeture_r0),
  'c1000000-0000-4000-8000-000000000004'::uuid,
  'campagne active sans bornes : le tirage ABOUTIT (sans quoi tout ce fichier serait vert sur une fonction morte)'
);

select is(
  (select stock from public.prizes where id = 'c1000000-0000-4000-8000-000000000004'),
  4,
  'campagne active : le stock a bien été engagé (5 → 4)'
);


-- ════════════════════════════════════════════════════════════
-- 1. STATUT — `paused`, le geste que le commerçant déclenche
-- ════════════════════════════════════════════════════════════
update public.campaigns set status = 'paused'
  where id = 'c1000000-0000-4000-8000-000000000002';

create table public.tap_fermeture_r1 as
  select * from public.perform_atomic_spin(
    'c1000000-0000-4000-8000-000000000001',
    'c1000000-0000-4000-8000-000000000002',
    'c1000000-0000-4000-8000-000000000003',
    repeat('b', 64), null, 'direct');

select is(
  (select denial_reason from public.tap_fermeture_r1),
  'campaign_closed',
  'campagne en PAUSE : refus explicite, et pas une exception (les appelants la rendraient en « une erreur est survenue »)'
);

select is(
  (select spin_id from public.tap_fermeture_r1),
  null::uuid,
  'campagne en PAUSE : aucun spin_id rendu'
);

select is(
  (select count(*)::int from public.spins
     where wheel_id = 'c1000000-0000-4000-8000-000000000003'
       and player_key = repeat('b', 64)),
  0,
  'campagne en PAUSE : AUCUN spin créé en base'
);

select is(
  (select stock from public.prizes where id = 'c1000000-0000-4000-8000-000000000004'),
  4,
  'campagne en PAUSE : AUCUN stock décrémenté'
);

-- Le chemin skill-gated passe par la même fonction avec `p_force_losing`, et il
-- ÉCRIT un spin perdant pour consommer la participation. Il doit être arrêté
-- aussi : sur une campagne fermée il n'y a plus rien à brute-forcer, donc plus
-- aucune raison de consommer le tour d'un joueur.
select is(
  (select denial_reason from public.perform_atomic_spin(
     'c1000000-0000-4000-8000-000000000001',
     'c1000000-0000-4000-8000-000000000002',
     'c1000000-0000-4000-8000-000000000003',
     repeat('c', 64), null, 'direct', true)),
  'campaign_closed',
  'campagne en PAUSE : le chemin skill-gated (p_force_losing) est refusé lui aussi'
);

select is(
  (select count(*)::int from public.spins
     where wheel_id = 'c1000000-0000-4000-8000-000000000003'
       and player_key = repeat('c', 64)),
  0,
  'campagne en PAUSE : le spin perdant forcé n''est PAS écrit'
);


-- ════════════════════════════════════════════════════════════
-- 2. STATUT — `draft` : une campagne jamais publiée ne distribue pas
-- ════════════════════════════════════════════════════════════
update public.campaigns set status = 'draft'
  where id = 'c1000000-0000-4000-8000-000000000002';

select is(
  (select denial_reason from public.perform_atomic_spin(
     'c1000000-0000-4000-8000-000000000001',
     'c1000000-0000-4000-8000-000000000002',
     'c1000000-0000-4000-8000-000000000003',
     repeat('d', 64), null, 'direct')),
  'campaign_closed',
  'campagne en BROUILLON : refusée (la garde lit `is distinct from ''active''`, pas seulement ''paused'')'
);


-- ════════════════════════════════════════════════════════════
-- 3. FENÊTRE — `ends_at` dépassé, statut resté `active`
--
-- C'est le cas que le statut seul ne peut pas voir : la campagne est TOUJOURS
-- `active` en base — `run_campaign_schedule()` ne bascule que celles en
-- `auto_schedule = true` — et le dashboard l'affiche « Terminée » par un état
-- DÉRIVÉ (`campaignDisplayStatus`). Le moteur doit dériver la même chose.
-- ════════════════════════════════════════════════════════════
update public.campaigns
   set status = 'active',
       starts_at = pg_catalog.now() - interval '2 days',
       ends_at = pg_catalog.now() - interval '1 day'
 where id = 'c1000000-0000-4000-8000-000000000002';

create table public.tap_fermeture_r2 as
  select * from public.perform_atomic_spin(
    'c1000000-0000-4000-8000-000000000001',
    'c1000000-0000-4000-8000-000000000002',
    'c1000000-0000-4000-8000-000000000003',
    repeat('e', 64), null, 'direct');

select is(
  (select denial_reason from public.tap_fermeture_r2),
  'campaign_closed',
  'campagne ACTIVE mais `ends_at` dépassé : refusée (miroir de campaignWindowState → ended)'
);

select is(
  (select count(*)::int from public.spins
     where wheel_id = 'c1000000-0000-4000-8000-000000000003'
       and player_key = repeat('e', 64)),
  0,
  '`ends_at` dépassé : AUCUN spin créé'
);

select is(
  (select stock from public.prizes where id = 'c1000000-0000-4000-8000-000000000004'),
  4,
  '`ends_at` dépassé : AUCUN stock décrémenté'
);


-- ════════════════════════════════════════════════════════════
-- 4. FENÊTRE — `starts_at` à venir : une campagne programmée ne tire pas
-- ════════════════════════════════════════════════════════════
update public.campaigns
   set starts_at = pg_catalog.now() + interval '1 day',
       ends_at = null
 where id = 'c1000000-0000-4000-8000-000000000002';

select is(
  (select denial_reason from public.perform_atomic_spin(
     'c1000000-0000-4000-8000-000000000001',
     'c1000000-0000-4000-8000-000000000002',
     'c1000000-0000-4000-8000-000000000003',
     repeat('f', 64), null, 'direct')),
  'campaign_closed',
  'campagne ACTIVE mais `starts_at` à venir : refusée (miroir de campaignWindowState → scheduled)'
);


-- ════════════════════════════════════════════════════════════
-- 5. LE REJEU IDEMPOTENT SURVIT À LA FERMETURE — le piège du correctif
--
-- La garde est placée APRÈS la recherche de rejeu (JOB-8, 20260927120000), et
-- c'est le seul point non évident de la migration. Un rejeu rend l'issue d'un
-- spin DÉJÀ matérialisé : stock déjà décrémenté, lot déjà engagé. Refuser ce
-- rejeu-là parce que la campagne s'est fermée entre-temps ferait perdre au
-- joueur un lot gagné pendant qu'elle était ouverte — exactement l'erreur que
-- l'en-tête de JOB-8 décrit pour `limit_reached`, à un étage près.
--
-- Sans cette assertion, quelqu'un remonterait la garde de dix lignes pour
-- « économiser le verrou » et personne ne le verrait avant qu'un joueur ne
-- perde son lot.
-- ════════════════════════════════════════════════════════════
update public.campaigns
   set status = 'active', starts_at = null, ends_at = null
 where id = 'c1000000-0000-4000-8000-000000000002';

create table public.tap_fermeture_rejeu as
  select * from public.perform_atomic_spin(
    'c1000000-0000-4000-8000-000000000001',
    'c1000000-0000-4000-8000-000000000002',
    'c1000000-0000-4000-8000-000000000003',
    repeat('g', 64), null, 'direct', false, 'tap-nonce-fermeture');

select isnt(
  (select spin_id from public.tap_fermeture_rejeu),
  null::uuid,
  'montage du rejeu : le premier appel nonce a bien matérialisé un spin'
);

update public.campaigns set status = 'paused'
  where id = 'c1000000-0000-4000-8000-000000000002';

select is(
  (select spin_id from public.perform_atomic_spin(
     'c1000000-0000-4000-8000-000000000001',
     'c1000000-0000-4000-8000-000000000002',
     'c1000000-0000-4000-8000-000000000003',
     repeat('g', 64), null, 'direct', false, 'tap-nonce-fermeture')),
  (select spin_id from public.tap_fermeture_rejeu),
  'campagne fermée APRÈS coup : le rejeu idempotent rend toujours le spin gagné — la fermeture n''annule pas un tirage passé'
);

select is(
  (select count(*)::int from public.spins
     where wheel_id = 'c1000000-0000-4000-8000-000000000003'
       and player_key = repeat('g', 64)),
  1,
  'rejeu sur campagne fermée : toujours UN seul spin, aucune écriture supplémentaire'
);


-- ════════════════════════════════════════════════════════════
-- CONTRE-ÉPREUVE 2/2 — remise DANS la fenêtre : ça retire
--
-- Bornes posées des DEUX côtés, cette fois : une garde qui refuserait toute
-- campagne bornée (par exemple sur un `>` inversé) passerait les quatre refus
-- ci-dessus et tomberait ici.
-- ════════════════════════════════════════════════════════════
update public.campaigns
   set status = 'active',
       starts_at = pg_catalog.now() - interval '1 day',
       ends_at = pg_catalog.now() + interval '1 day'
 where id = 'c1000000-0000-4000-8000-000000000002';

select is(
  (select prize_id from public.perform_atomic_spin(
     'c1000000-0000-4000-8000-000000000001',
     'c1000000-0000-4000-8000-000000000002',
     'c1000000-0000-4000-8000-000000000003',
     repeat('h', 64), null, 'direct')),
  'c1000000-0000-4000-8000-000000000004'::uuid,
  'campagne active DANS sa fenêtre : le tirage aboutit — la garde ne refuse pas ce qu''elle doit laisser passer'
);

select is(
  (select stock from public.prizes where id = 'c1000000-0000-4000-8000-000000000004'),
  2,
  'bilan du stock : exactement trois engagements (contre-épreuve 1, rejeu, contre-épreuve 2), aucun des cinq refus n''a coûté un lot'
);

select * from finish();
rollback;
