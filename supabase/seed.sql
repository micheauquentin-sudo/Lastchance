-- ============================================================
-- Seed E2E déterministe (Supabase local uniquement).
--
-- Appliqué explicitement par le job CI « e2e » (psql) — jamais en
-- production. Fournit des parcours reproductibles :
--   comptes    owner@e2e.local / editor@e2e.local / cashier@e2e.local
--              (mot de passe commun : Password123!)
--   E2EWIN01   campagne garantie GAGNANTE (collecte email, illimitée)
--   E2ELOSE1   campagne garantie PERDANTE (limite hebdomadaire)
--   E2ESCRT1   campagne GRATTAGE (garantie gagnante, sans collecte)
--   E2EPAUSE   campagne en pause (message « pas active »)
--   E2EPRONO   championnat pronostics (1 match futur + 1 match terminé)
--   E2EHUNT100000001..3  chasse au trésor active (3 étapes, jetons 16 car.)
--   e2eb0000-…     passeport de fidélité (staff) : palier lot + palier spin
--   GAIN-E2ESCAN2  participation à retirer (spec scanner caméra)
--
-- Les UUID e2e0xxxx-… n'entrent jamais en collision avec les fixtures
-- pgTAP (10000000-…/20000000-…) ni avec des données réelles.
-- ============================================================

-- ── Utilisateurs auth (connectables par mot de passe) ─────────
-- Les jetons `confirmation_token` & co sont des chaînes vides : GoTrue
-- ne tolère pas NULL sur ces colonnes lors du scan des comptes.
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, created_at, updated_at,
  raw_app_meta_data, raw_user_meta_data,
  confirmation_token, recovery_token, email_change,
  email_change_token_new, email_change_token_current
)
select
  '00000000-0000-0000-0000-000000000000', u.id, 'authenticated', 'authenticated',
  u.email, crypt('Password123!', gen_salt('bf')),
  now(), now(), now(),
  '{"provider":"email","providers":["email"]}', '{}',
  '', '', '', '', ''
from (values
  ('e2e00000-0000-4000-8000-000000000001'::uuid, 'owner@e2e.local'),
  ('e2e00000-0000-4000-8000-000000000002'::uuid, 'editor@e2e.local'),
  ('e2e00000-0000-4000-8000-000000000003'::uuid, 'cashier@e2e.local'),
  ('e2e00000-0000-4000-8000-000000000004'::uuid, 'stripe-owner@e2e.local')
) as u(id, email)
on conflict (id) do nothing;

insert into auth.identities (
  id, user_id, provider_id, identity_data, provider,
  created_at, updated_at, last_sign_in_at
)
select
  gen_random_uuid(), u.id, u.id::text,
  jsonb_build_object('sub', u.id::text, 'email', u.email),
  'email', now(), now(), now()
from (values
  ('e2e00000-0000-4000-8000-000000000001'::uuid, 'owner@e2e.local'),
  ('e2e00000-0000-4000-8000-000000000002'::uuid, 'editor@e2e.local'),
  ('e2e00000-0000-4000-8000-000000000003'::uuid, 'cashier@e2e.local'),
  ('e2e00000-0000-4000-8000-000000000004'::uuid, 'stripe-owner@e2e.local')
) as u(id, email)
on conflict do nothing;

-- ── Organisation (accès offert : indépendant de Stripe) ───────
insert into public.organizations (id, name, slug, comp_access, addon_pronostics, addon_hunts, addon_loyalty, addon_jackpot, addon_events, addon_calendar, addon_referral, addon_quiz, timezone)
values (
  'e2e10000-0000-4000-8000-000000000001', 'E2E Café', 'e2e-cafe',
  true, true, true, true, true, true, true, true, true, 'Europe/Paris'
)
on conflict (id) do nothing;

insert into public.organization_members (organization_id, user_id, role) values
  ('e2e10000-0000-4000-8000-000000000001', 'e2e00000-0000-4000-8000-000000000001', 'owner'),
  ('e2e10000-0000-4000-8000-000000000001', 'e2e00000-0000-4000-8000-000000000002', 'editor'),
  ('e2e10000-0000-4000-8000-000000000001', 'e2e00000-0000-4000-8000-000000000003', 'cashier')
on conflict do nothing;

-- ── Campagne garantie GAGNANTE (collecte email → formulaire) ──
insert into public.campaigns (id, organization_id, name, status, collect_email, collect_phone)
values ('e2e20000-0000-4000-8000-000000000001', 'e2e10000-0000-4000-8000-000000000001',
        'E2E Gagnante', 'active', true, false)
on conflict (id) do nothing;

insert into public.wheels (id, organization_id, campaign_id, name, play_limit)
values ('e2e30000-0000-4000-8000-000000000001', 'e2e10000-0000-4000-8000-000000000001',
        'e2e20000-0000-4000-8000-000000000001', 'Roue gagnante', 'unlimited')
on conflict (id) do nothing;

-- Le spin exige ≥ 2 lots actifs : un gagnant à poids 100, un perdant à
-- poids 0 (jamais tiré) — résultat déterministe, gagné à 100 %.
-- Le gagnant porte un stock FINI (5000, largement au-delà de ce qu'une suite
-- E2E consomme) : cette roue est la cible du palier `spin` du passeport de
-- fidélité, et depuis 20260725200000 un tour OFFERT n'est jamais tiré sur un
-- lot à stock illimité (consume_loyalty_spin_grant filtre `p.stock > 0`).
-- Sans ce stock, le tour offert du seed répondrait `no_prize`.
insert into public.prizes (id, organization_id, wheel_id, label, description, color, weight, is_losing, position, stock) values
  ('e2e40000-0000-4000-8000-000000000001', 'e2e10000-0000-4000-8000-000000000001',
   'e2e30000-0000-4000-8000-000000000001', 'Café offert E2E', 'Gain déterministe.', '#f59e0b', 100, false, 0, 5000),
  ('e2e40000-0000-4000-8000-000000000002', 'e2e10000-0000-4000-8000-000000000001',
   'e2e30000-0000-4000-8000-000000000001', 'Perdu (jamais tiré)', '', '#64748b', 0, true, 1, null)
on conflict (id) do nothing;

insert into public.qr_codes (organization_id, campaign_id, slug, label)
values ('e2e10000-0000-4000-8000-000000000001', 'e2e20000-0000-4000-8000-000000000001', 'E2EWIN01', 'Comptoir E2E')
on conflict (slug) do nothing;

-- ── Campagne garantie PERDANTE (limite hebdomadaire) ──────────
insert into public.campaigns (id, organization_id, name, status, collect_email, collect_phone)
values ('e2e20000-0000-4000-8000-000000000002', 'e2e10000-0000-4000-8000-000000000001',
        'E2E Perdante', 'active', false, false)
on conflict (id) do nothing;

insert into public.wheels (id, organization_id, campaign_id, name, play_limit)
values ('e2e30000-0000-4000-8000-000000000002', 'e2e10000-0000-4000-8000-000000000001',
        'e2e20000-0000-4000-8000-000000000002', 'Roue perdante', 'weekly')
on conflict (id) do nothing;

insert into public.prizes (id, organization_id, wheel_id, label, description, color, weight, is_losing, position) values
  ('e2e40000-0000-4000-8000-000000000003', 'e2e10000-0000-4000-8000-000000000001',
   'e2e30000-0000-4000-8000-000000000002', 'Perdu', 'Pas de chance.', '#64748b', 100, true, 0),
  ('e2e40000-0000-4000-8000-000000000004', 'e2e10000-0000-4000-8000-000000000001',
   'e2e30000-0000-4000-8000-000000000002', 'Gagné (jamais tiré)', '', '#f59e0b', 0, false, 1)
on conflict (id) do nothing;

insert into public.qr_codes (organization_id, campaign_id, slug, label)
values ('e2e10000-0000-4000-8000-000000000001', 'e2e20000-0000-4000-8000-000000000002', 'E2ELOSE1', 'Comptoir E2E')
on conflict (slug) do nothing;

-- ── Campagne GRATTAGE (gagnante, sans collecte → auto-claim) ──
insert into public.campaigns (id, organization_id, name, status, collect_email, collect_phone)
values ('e2e20000-0000-4000-8000-000000000003', 'e2e10000-0000-4000-8000-000000000001',
        'E2E Grattage', 'active', false, false)
on conflict (id) do nothing;

insert into public.wheels (id, organization_id, campaign_id, name, play_limit, game_type)
values ('e2e30000-0000-4000-8000-000000000003', 'e2e10000-0000-4000-8000-000000000001',
        'e2e20000-0000-4000-8000-000000000003', 'Carte à gratter', 'unlimited', 'scratch')
on conflict (id) do nothing;

-- Le gagnant porte un stock FINI (5000) : cette campagne est AUSSI la cible
-- de la Pause Chance (RES-4, lot L7) — un tour OFFERT n'est jamais tiré sur
-- un lot à stock illimité (BORNE 2, `consume_reserver_wait_spin_grant` filtre
-- `p.stock > 0`). Sans ce stock, la Pause Chance répondrait `no_prize`.
insert into public.prizes (id, organization_id, wheel_id, label, description, color, weight, is_losing, position, stock) values
  ('e2e40000-0000-4000-8000-000000000005', 'e2e10000-0000-4000-8000-000000000001',
   'e2e30000-0000-4000-8000-000000000003', 'Dessert offert E2E', 'Gain grattage.', '#ec4899', 100, false, 0, 5000),
  ('e2e40000-0000-4000-8000-000000000006', 'e2e10000-0000-4000-8000-000000000001',
   'e2e30000-0000-4000-8000-000000000003', 'Perdu (jamais tiré)', '', '#64748b', 0, true, 1, null)
on conflict (id) do nothing;

insert into public.qr_codes (organization_id, campaign_id, slug, label)
values ('e2e10000-0000-4000-8000-000000000001', 'e2e20000-0000-4000-8000-000000000003', 'E2ESCRT1', 'Comptoir E2E')
on conflict (slug) do nothing;

-- ── Campagne EN PAUSE (message « pas active ») ────────────────
insert into public.campaigns (id, organization_id, name, status)
values ('e2e20000-0000-4000-8000-000000000004', 'e2e10000-0000-4000-8000-000000000001',
        'E2E En pause', 'paused')
on conflict (id) do nothing;

insert into public.wheels (id, organization_id, campaign_id, name)
values ('e2e30000-0000-4000-8000-000000000004', 'e2e10000-0000-4000-8000-000000000001',
        'e2e20000-0000-4000-8000-000000000004', 'Roue en pause')
on conflict (id) do nothing;

insert into public.qr_codes (organization_id, campaign_id, slug, label)
values ('e2e10000-0000-4000-8000-000000000001', 'e2e20000-0000-4000-8000-000000000004', 'E2EPAUSE', 'Comptoir E2E')
on conflict (slug) do nothing;

-- ── Jeux de RÉVÉLATION (vague 1) — démos gagnantes déterministes ──
-- Chaque game_type de révélation est une PRÉSENTATION du même moteur : on
-- DUPLIQUE la roue gagnante (2 lots : gagnant poids 100, perdant poids 0 →
-- gagné à 100 %) en ne changeant QUE game_type + le slug QR. Sans collecte
-- (comme le grattage) : le parcours atteint « ✦ GAGNÉ ✦ » sans formulaire.
-- Le smoke E2E (player-win.spec) charge /play/E2EFLIP et /play/E2ECUPS,
-- vérifie le bon bouton idle puis le passage en phase de jeu/gain.

-- Carte retournée (flip_card) → slug E2EFLIP
insert into public.campaigns (id, organization_id, name, status, collect_email, collect_phone)
values ('e2e20000-0000-4000-8000-000000000005', 'e2e10000-0000-4000-8000-000000000001',
        'E2E Carte', 'active', false, false)
on conflict (id) do nothing;

insert into public.wheels (id, organization_id, campaign_id, name, play_limit, game_type)
values ('e2e30000-0000-4000-8000-000000000005', 'e2e10000-0000-4000-8000-000000000001',
        'e2e20000-0000-4000-8000-000000000005', 'Carte à retourner', 'unlimited', 'flip_card')
on conflict (id) do nothing;

insert into public.prizes (id, organization_id, wheel_id, label, description, color, weight, is_losing, position) values
  ('e2e40000-0000-4000-8000-000000000007', 'e2e10000-0000-4000-8000-000000000001',
   'e2e30000-0000-4000-8000-000000000005', 'Carte gagnante E2E', 'Gain carte retournée.', '#ec4899', 100, false, 0),
  ('e2e40000-0000-4000-8000-000000000008', 'e2e10000-0000-4000-8000-000000000001',
   'e2e30000-0000-4000-8000-000000000005', 'Perdu (jamais tiré)', '', '#64748b', 0, true, 1)
on conflict (id) do nothing;

insert into public.qr_codes (organization_id, campaign_id, slug, label)
values ('e2e10000-0000-4000-8000-000000000001', 'e2e20000-0000-4000-8000-000000000005', 'E2EFLIP', 'Comptoir E2E')
on conflict (slug) do nothing;

-- Bonneteau (cups) → slug E2ECUPS
insert into public.campaigns (id, organization_id, name, status, collect_email, collect_phone)
values ('e2e20000-0000-4000-8000-000000000006', 'e2e10000-0000-4000-8000-000000000001',
        'E2E Bonneteau', 'active', false, false)
on conflict (id) do nothing;

insert into public.wheels (id, organization_id, campaign_id, name, play_limit, game_type)
values ('e2e30000-0000-4000-8000-000000000006', 'e2e10000-0000-4000-8000-000000000001',
        'e2e20000-0000-4000-8000-000000000006', 'Gobelets', 'unlimited', 'cups')
on conflict (id) do nothing;

insert into public.prizes (id, organization_id, wheel_id, label, description, color, weight, is_losing, position) values
  ('e2e40000-0000-4000-8000-000000000009', 'e2e10000-0000-4000-8000-000000000001',
   'e2e30000-0000-4000-8000-000000000006', 'Gobelet gagnant E2E', 'Gain bonneteau.', '#ec4899', 100, false, 0),
  ('e2e40000-0000-4000-8000-00000000000a', 'e2e10000-0000-4000-8000-000000000001',
   'e2e30000-0000-4000-8000-000000000006', 'Perdu (jamais tiré)', '', '#64748b', 0, true, 1)
on conflict (id) do nothing;

insert into public.qr_codes (organization_id, campaign_id, slug, label)
values ('e2e10000-0000-4000-8000-000000000001', 'e2e20000-0000-4000-8000-000000000006', 'E2ECUPS', 'Comptoir E2E')
on conflict (slug) do nothing;

-- ── Jeux de DÉFI skill-gated (vague 2) — démos déterministes ──
-- Même patron que la vague 1 (roue 2 lots : gagnant poids 100, perdant
-- poids 0 → tirage 100 % gagnant, sans collecte), mais la PORTE est le
-- DÉFI : réussite → tirage normal ; échec → spin PERDANT forcé. Le spec
-- e2e/skill-games.spec.ts charge /play/E2ERPS (issue libre : le coup
-- serveur décide, gagné ET perdu sont valides) et /play/E2EWORD (bon mot
-- → gagné déterministe ; play_limit daily → 2e device-essai bloqué).

-- Pierre-feuille-ciseaux (rps) → slug E2ERPS. skill_config NULL : aucun
-- paramètre, le coup serveur dérive du seed signé (HMAC server-only).
-- Thème KERMESSE (fond crème SOLIDE bg-k-bg, texte encre) : c'est la surface
-- que le scan axe de la spec peut réellement évaluer (le thème « nuit » pose un
-- dégradé CSS inline qu'axe ne lit pas → il retombe sur le <body> crème et
-- produit un faux positif de contraste). En kermesse, tout le texte du défi est
-- en encre AA sur crème.
insert into public.campaigns (id, organization_id, name, status, collect_email, collect_phone)
values ('e2e20000-0000-4000-8000-000000000007', 'e2e10000-0000-4000-8000-000000000001',
        'E2E Chifoumi', 'active', false, false)
on conflict (id) do nothing;

insert into public.wheels (id, organization_id, campaign_id, name, play_limit, game_type, style)
values ('e2e30000-0000-4000-8000-000000000007', 'e2e10000-0000-4000-8000-000000000001',
        'e2e20000-0000-4000-8000-000000000007', 'Chifoumi', 'unlimited', 'rps',
        '{"pageTheme":"kermesse"}')
on conflict (id) do nothing;

insert into public.prizes (id, organization_id, wheel_id, label, description, color, weight, is_losing, position) values
  ('e2e40000-0000-4000-8000-00000000000b', 'e2e10000-0000-4000-8000-000000000001',
   'e2e30000-0000-4000-8000-000000000007', 'Défi chifoumi E2E', 'Gain défi chifoumi.', '#ec4899', 100, false, 0),
  ('e2e40000-0000-4000-8000-00000000000c', 'e2e10000-0000-4000-8000-000000000001',
   'e2e30000-0000-4000-8000-000000000007', 'Perdu (jamais tiré)', '', '#64748b', 0, true, 1)
on conflict (id) do nothing;

insert into public.qr_codes (organization_id, campaign_id, slug, label)
values ('e2e10000-0000-4000-8000-000000000001', 'e2e20000-0000-4000-8000-000000000007', 'E2ERPS', 'Comptoir E2E')
on conflict (slug) do nothing;

-- Mot mystère (mystery_word) → slug E2EWORD. skill_config porte le mot
-- SECRET « MERINGUE » (8 lettres, volontairement long : le spec vérifie
-- par regex qu'il ne fuit JAMAIS dans le HTML servi — un mot court
-- risquerait des collisions fortuites). L'indice ne le contient pas.
-- play_limit 'daily' : une participation par device — le spec vérifie
-- qu'une 2e soumission du même device est bloquée (limit_reached).
insert into public.campaigns (id, organization_id, name, status, collect_email, collect_phone)
values ('e2e20000-0000-4000-8000-000000000008', 'e2e10000-0000-4000-8000-000000000001',
        'E2E Mot mystère', 'active', false, false)
on conflict (id) do nothing;

insert into public.wheels (id, organization_id, campaign_id, name, play_limit, game_type, skill_config)
values ('e2e30000-0000-4000-8000-000000000008', 'e2e10000-0000-4000-8000-000000000001',
        'e2e20000-0000-4000-8000-000000000008', 'Mot mystère', 'daily', 'mystery_word',
        '{"word": "MERINGUE", "hint": "La pâtisserie née d''un blanc d''œuf battu"}'::jsonb)
on conflict (id) do nothing;

insert into public.prizes (id, organization_id, wheel_id, label, description, color, weight, is_losing, position) values
  ('e2e40000-0000-4000-8000-00000000000d', 'e2e10000-0000-4000-8000-000000000001',
   'e2e30000-0000-4000-8000-000000000008', 'Mot trouvé E2E', 'Gain mot mystère.', '#ec4899', 100, false, 0),
  ('e2e40000-0000-4000-8000-00000000000e', 'e2e10000-0000-4000-8000-000000000001',
   'e2e30000-0000-4000-8000-000000000008', 'Perdu (jamais tiré)', '', '#64748b', 0, true, 1)
on conflict (id) do nothing;

insert into public.qr_codes (organization_id, campaign_id, slug, label)
values ('e2e10000-0000-4000-8000-000000000001', 'e2e20000-0000-4000-8000-000000000008', 'E2EWORD', 'Comptoir E2E')
on conflict (slug) do nothing;

-- ── Participation à retirer (spec scanner caméra simulée) ─────
insert into public.participations (
  id, organization_id, campaign_id, wheel_id, prize_id,
  first_name, accepted_terms, redeem_code, player_key
)
values (
  'e2e50000-0000-4000-8000-000000000001',
  'e2e10000-0000-4000-8000-000000000001',
  'e2e20000-0000-4000-8000-000000000001',
  'e2e30000-0000-4000-8000-000000000001',
  'e2e40000-0000-4000-8000-000000000001',
  'Scan E2E', true, 'GAIN-E2ESCAN2', 'seed-e2e-scan'
)
on conflict (id) do nothing;

-- ── Organisation Stripe dédiée (tests webhook + checkout) ─────
-- comp_access=false : le statut Stripe gouverne réellement l'accès.
-- SANS stripe_customer_id : posé par le spec (le test « Démarrer mon
-- abonnement » exige un customer absent). Owner dédié : l'index unique
-- « un seul rôle owner par utilisateur » interdit de réutiliser
-- owner@e2e.local.
insert into public.organizations (id, name, slug, comp_access, timezone)
values ('e2e10000-0000-4000-8000-000000000002', 'E2E Stripe', 'e2e-stripe', false, 'Europe/Paris')
on conflict (id) do nothing;

insert into public.organization_members (organization_id, user_id, role) values
  ('e2e10000-0000-4000-8000-000000000002', 'e2e00000-0000-4000-8000-000000000004', 'owner')
on conflict do nothing;

-- ── Abonnés newsletter (org principale — segment « Tous » = 3) ─
insert into public.newsletter_subscribers (id, organization_id, email) values
  ('e2e80000-0000-4000-8000-000000000001', 'e2e10000-0000-4000-8000-000000000001', 'niouz1@e2e.local'),
  ('e2e80000-0000-4000-8000-000000000002', 'e2e10000-0000-4000-8000-000000000001', 'niouz2@e2e.local'),
  ('e2e80000-0000-4000-8000-000000000003', 'e2e10000-0000-4000-8000-000000000001', 'niouz3@e2e.local')
on conflict (id) do nothing;

-- ── Championnat de pronostics (match futur + match terminé) ───
insert into public.contests (id, organization_id, slug, name, competition_key, status, collect_email, collect_phone)
values ('e2e60000-0000-4000-8000-000000000001', 'e2e10000-0000-4000-8000-000000000001',
        'E2EPRONO', 'Championnat E2E', 'custom', 'active', false, false)
on conflict (id) do nothing;

insert into public.contest_matches (
  id, contest_id, organization_id, home_name, away_name,
  kickoff_at, status, home_score, away_score, position
) values
  ('e2e70000-0000-4000-8000-000000000001', 'e2e60000-0000-4000-8000-000000000001',
   'e2e10000-0000-4000-8000-000000000001', 'Rouges', 'Bleus',
   now() + interval '2 days', 'scheduled', null, null, 0),
  ('e2e70000-0000-4000-8000-000000000002', 'e2e60000-0000-4000-8000-000000000001',
   'e2e10000-0000-4000-8000-000000000001', 'Verts', 'Jaunes',
   now() - interval '2 days', 'finished', 2, 1, 1)
on conflict (id) do nothing;

-- ── Chasse au trésor (3 étapes, ordre libre, sans délai) ──────
-- Jetons d'étapes déterministes de 16 caractères (contrainte durcie
-- hunt_steps_token_check, min 16) : E2EHUNT100000001 / E2EHUNT200000002 /
-- E2EHUNT300000003. Les specs scannent les trois QR et vérifient code de
-- retrait + remise en caisse. e2e/hunt.spec.ts dépend de ces valeurs
-- exactes — les modifier casse le spec s'il n'est pas aligné en même temps.
insert into public.hunts (
  id, organization_id, name, status, order_mode,
  min_scan_interval_seconds, reward_label, reward_details, reward_stock
)
values (
  'e2ea0000-0000-4000-8000-000000000001',
  'e2e10000-0000-4000-8000-000000000001',
  'Chasse E2E', 'active', 'free', 0,
  'Trésor du café E2E', 'Un café + un dessert offerts.', null
)
on conflict (id) do nothing;

insert into public.hunt_steps (id, hunt_id, organization_id, position, label, hint_text, token) values
  ('e2ea0000-0000-4000-8000-000000000011', 'e2ea0000-0000-4000-8000-000000000001',
   'e2e10000-0000-4000-8000-000000000001', 1, 'Le comptoir', 'Cherchez la vitrine aux pâtisseries.', 'E2EHUNT100000001'),
  ('e2ea0000-0000-4000-8000-000000000012', 'e2ea0000-0000-4000-8000-000000000001',
   'e2e10000-0000-4000-8000-000000000001', 2, 'La vitrine', 'Direction la terrasse.', 'E2EHUNT200000002'),
  ('e2ea0000-0000-4000-8000-000000000013', 'e2ea0000-0000-4000-8000-000000000001',
   'e2e10000-0000-4000-8000-000000000001', 3, 'La terrasse', null, 'E2EHUNT300000003')
on conflict (id) do nothing;

-- ── Passeport de fidélité (staff : 1 palier lot + 1 palier spin) ──
-- Programme actif de l'org E2E, validation staff (l'équipe tamponne depuis
-- la caisse). Palier à 2 visites = lot (code FIDELITE-…), palier à 3 visites
-- = tour de roue offert sur la roue E2E gagnante. Le secret du code tournant
-- est rempli par le trigger (mode staff → inutilisé ici). NB : un passeport
-- (loyalty_members) stocke un hash SHA-256 (64 hex) créé au premier
-- tampon — pas de jeton public 16 car. comme la chasse.
-- Verrous économiques (20260725190000, étendus par 20260725200000) respectés
-- par ces fixtures :
--   · aucun palier avant la VISITE 2 — un passeport neuf ne vaut rien ;
--   · TOUT palier porte un stock FINI, jamais « illimité » : 25 codes pour le
--     lot, 25 tours offerts pour le palier `spin` (sur un palier `spin` le
--     stock compte les GRANTS ÉMIS, pas les lots de la roue).
-- Cooldown au plancher staff (300 s, CHECK
-- loyalty_programs_cooldown_floor_check) : la valeur la plus permissive
-- que la base accepte, pour un aller-retour manuel rapide en dev. Les
-- specs E2E n'apposent aucun tampon (affichage seul), rien n'en dépend.
insert into public.loyalty_programs (
  id, organization_id, name, status, validation_mode,
  min_stamp_interval_seconds, silver_threshold, gold_threshold
)
values ('e2eb0000-0000-4000-8000-000000000001', 'e2e10000-0000-4000-8000-000000000001',
        'Passeport E2E', 'active', 'staff', 300, 2, 3)
on conflict (id) do nothing;

insert into public.loyalty_milestones (
  id, program_id, organization_id, visit_count, reward_type,
  reward_label, reward_details, reward_stock, position
)
values ('e2eb0000-0000-4000-8000-000000000011', 'e2eb0000-0000-4000-8000-000000000001',
        'e2e10000-0000-4000-8000-000000000001', 2, 'lot',
        'Café fidélité E2E', 'Offert dès le deuxième passage.', 25, 0)
on conflict (id) do nothing;

insert into public.loyalty_milestones (
  id, program_id, organization_id, visit_count, reward_type, target_wheel_id,
  reward_stock, position
)
values ('e2eb0000-0000-4000-8000-000000000012', 'e2eb0000-0000-4000-8000-000000000001',
        'e2e10000-0000-4000-8000-000000000001', 3, 'spin',
        'e2e30000-0000-4000-8000-000000000001', 25, 1)
on conflict (id) do nothing;

-- ── Jackpot collectif (threshold_draw, staff, seuil bas) ──────
-- Campagne active de l'org E2E, validation staff (l'équipe valide depuis la
-- caisse). Jauge PARTAGÉE : au 5e passage (threshold), tirage au sort parmi les
-- participants du cycle → 1 gagnant (code JACKPOT-…), nouveau cycle. Stock FINI
-- obligatoire (ADR-031) : 20 cycles gagnants. Jackpot croissant : le montant
-- affiché part de 50 € (+2 €/participation). public_slug déterministe pour la
-- page publique suivable. Cooldown au plancher staff (300 s). Les specs E2E ne
-- posent aucune participation par défaut (affichage seul), rien n'en dépend.
insert into public.jackpot_campaigns (
  id, organization_id, name, status, public_slug, validation_mode,
  min_participation_interval_seconds, draw_mode, threshold, reward_stock,
  reward_label, reward_details, display_base_cents, display_increment_cents,
  merchant_content
)
values (
  'e2ec0000-0000-4000-8000-000000000001',
  'e2e10000-0000-4000-8000-000000000001',
  'Jackpot E2E', 'active', 'e2e-jackpot', 'staff', 300, 'threshold_draw', 5, 20,
  'Le grand panier E2E', 'Tiré au sort tous les 5 passages.', 5000, 200,
  'Soirée jackpot chaque vendredi — venez tenter votre chance !'
)
on conflict (id) do nothing;

-- ── Jackpot collectif nº2 : RÉSERVÉ AU PARCOURS CAISSE E2E ────
-- Même org, même mode staff, mêmes ordres de grandeur — et une SECONDE
-- campagne, parce que les deux specs veulent deux choses incompatibles sur une
-- seule ligne. Celle du dessus est ASSERTÉE À « 0 / 5 » (affichage d'un cycle
-- neuf, cagnotte à 50 €) : une spec caisse qui valide une participation ferait
-- passer sa jauge à 1 / 5 et casserait l'autre, au premier passage et sans
-- rapport visible avec ce qu'elle testait. La première reste donc FIGÉE à zéro
-- participation ; toute spec qui ÉCRIT (validation comptoir, incrément de
-- jauge, tirage au seuil) travaille sur celle-ci.
-- Nom volontairement SANS le libellé « Jackpot E2E » : les specs existantes
-- ciblent leur titre par correspondance de sous-chaîne (`getByRole` avec
-- `name`), qu'un « Jackpot E2E caisse » rendrait ambigu.
insert into public.jackpot_campaigns (
  id, organization_id, name, status, public_slug, validation_mode,
  min_participation_interval_seconds, draw_mode, threshold, reward_stock,
  reward_label, reward_details, display_base_cents, display_increment_cents,
  merchant_content
)
values (
  'e2ec0000-0000-4000-8000-000000000002',
  'e2e10000-0000-4000-8000-000000000001',
  'Cagnotte comptoir E2E', 'active', 'e2e-jackpot-staff', 'staff', 300,
  'threshold_draw', 5, 20,
  'Le panier du comptoir E2E', 'Tiré au sort tous les 5 passages.', 5000, 200,
  'Passez au comptoir : l''équipe valide votre passage.'
)
on conflict (id) do nothing;

-- ── Jackpot collectif nº3 : RÉSERVÉ AU PARCOURS JOUEUR `rotating_code` ────
-- Le troisième mode de la même famille : le joueur SAISIT lui-même le code
-- tournant affiché sur l'écran comptoir (`/dashboard/jackpot/[id]/comptoir`),
-- là où les deux campagnes du dessus se valident depuis la caisse. Dédiée à
-- la spec E2E « le joueur saisit le code et la jauge avance » — même raison
-- d'isolement que la nº2 : une participation écrite ici ne doit déranger ni
-- l'affichage figé de la nº1 ni le décompte de la spec caisse sur la nº2.
-- Nom sans « Jackpot E2E » ni « comptoir » : les specs ciblent leur titre par
-- sous-chaîne.
insert into public.jackpot_campaigns (
  id, organization_id, name, status, public_slug, validation_mode,
  min_participation_interval_seconds, draw_mode, threshold, reward_stock,
  reward_label, reward_details, display_base_cents, display_increment_cents,
  merchant_content
)
values (
  'e2ec0000-0000-4000-8000-000000000003',
  'e2e10000-0000-4000-8000-000000000001',
  'Tirelire au code E2E', 'active', 'e2e-jackpot-code', 'rotating_code', 300,
  'threshold_draw', 5, 20,
  'Le pot du code tournant E2E', 'Tiré au sort tous les 5 passages.', 5000, 200,
  'Saisissez le code affiché au comptoir pour faire monter le pot.'
)
on conflict (id) do nothing;

-- ── Participation au code EXPIRÉ (E2E cycle du gain) ──────────
-- L'échéance serveur est dépassée : la caisse doit refuser le retrait
-- (badge « Code expiré », pas de bouton) — le compte à rebours client
-- n'est qu'un affichage, cette ligne prouve le refus en base.
insert into public.participations (
  id, organization_id, campaign_id, wheel_id, prize_id, first_name, email,
  accepted_terms, marketing_opt_in, redeem_code, redeem_expires_at, player_key
)
select 'e2e90000-0000-4000-8000-000000000001',
       'e2e10000-0000-4000-8000-000000000001',
       c.id, w.id, p.id, 'Gaston Expire', 'gaston@e2e.local',
       true, false, 'GAIN-E2EEXPIRE', now() - interval '1 hour', repeat('9', 64)
  from public.campaigns c
  join public.wheels w on w.campaign_id = c.id
  join public.prizes p on p.wheel_id = w.id and p.is_losing = false
 where c.id = 'e2e20000-0000-4000-8000-000000000001'
 limit 1
on conflict (id) do nothing;

-- ── Championnat prêt à CLÔTURER (E2E règles de compétition) ───
-- Tous les matchs joués, deux inscrits départagés par le nombre de
-- scores exacts, une récompense au rang 1 : le parcours dashboard
-- « clôturer → palmarès + code » se teste sans dépendre d'E2EPRONO
-- (que les projets mobiles utilisent en parallèle).
-- collect_email=true : Zoe a un email seedé → le parcours « Retrouver
-- mes pronostics » (lien magique) se teste sur ce championnat.
insert into public.contests (id, organization_id, slug, name, competition_key, status, collect_email, collect_phone, rewards)
values ('e2e60000-0000-4000-8000-000000000002', 'e2e10000-0000-4000-8000-000000000001',
        'E2EPRONO2', 'Clôture E2E', 'custom', 'active', true, false,
        '[{"from":1,"to":1,"label":"Coupe du patron"}]'::jsonb)
on conflict (id) do nothing;

insert into public.contest_matches (
  id, contest_id, organization_id, home_name, away_name,
  kickoff_at, status, home_score, away_score, position
) values
  ('e2e70000-0000-4000-8000-000000000011', 'e2e60000-0000-4000-8000-000000000002',
   'e2e10000-0000-4000-8000-000000000001', 'Nord', 'Sud',
   now() - interval '3 days', 'finished', 2, 1, 0),
  ('e2e70000-0000-4000-8000-000000000012', 'e2e60000-0000-4000-8000-000000000002',
   'e2e10000-0000-4000-8000-000000000001', 'Est', 'Ouest',
   now() - interval '2 days', 'finished', 0, 0, 1)
on conflict (id) do nothing;

insert into public.contest_players (
  id, contest_id, organization_id, token_hash, first_name, avatar, email, accepted_terms, created_at
) values
  ('e2e75000-0000-4000-8000-000000000001', 'e2e60000-0000-4000-8000-000000000002',
   'e2e10000-0000-4000-8000-000000000001', repeat('e', 64), 'Zoe E2E', 'renard',
   'zoe@e2e.local', true, now() - interval '4 days'),
  ('e2e75000-0000-4000-8000-000000000002', 'e2e60000-0000-4000-8000-000000000002',
   'e2e10000-0000-4000-8000-000000000001', repeat('f', 64), 'Yann E2E', 'ours',
   'yann@e2e.local', true, now() - interval '4 days')
on conflict (id) do nothing;

-- Zoe : 3 + 3 = 6 pts (2 exacts) · Yann : 3 + 2 = 5 pts — Zoe gagne.
insert into public.contest_predictions (
  contest_id, organization_id, match_id, player_id, home_score, away_score, points
) values
  ('e2e60000-0000-4000-8000-000000000002', 'e2e10000-0000-4000-8000-000000000001',
   'e2e70000-0000-4000-8000-000000000011', 'e2e75000-0000-4000-8000-000000000001', 2, 1, 3),
  ('e2e60000-0000-4000-8000-000000000002', 'e2e10000-0000-4000-8000-000000000001',
   'e2e70000-0000-4000-8000-000000000012', 'e2e75000-0000-4000-8000-000000000001', 0, 0, 3),
  ('e2e60000-0000-4000-8000-000000000002', 'e2e10000-0000-4000-8000-000000000001',
   'e2e70000-0000-4000-8000-000000000011', 'e2e75000-0000-4000-8000-000000000002', 3, 2, 2),
  ('e2e60000-0000-4000-8000-000000000002', 'e2e10000-0000-4000-8000-000000000001',
   'e2e70000-0000-4000-8000-000000000012', 'e2e75000-0000-4000-8000-000000000002', 1, 1, 2)
on conflict (match_id, player_id) do nothing;

-- ── Événement GÉNÉRIQUE hors football (cérémonie) ─────────────
-- Le moteur de pronostics ne se limite plus au sport : une cérémonie n'a
-- ni équipes ni compétition au catalogue, seulement des questions typées
-- et un verrouillage porté par l'événement
-- (coalesce(question.locks_at, contest.default_locks_at, kickoff_at)).
-- e2e/pronostics-generic.spec.ts dépend de ces valeurs EXACTES (slug,
-- intitulés, libellés d'options) — les modifier casse la spec.
--   · default_locks_at à +30 jours : les deux questions SANS locks_at
--     propre restent ouvertes, la prise de réponse est testable ;
--   · la question `choice` ouverte porte DÉJÀ son correct_answer en base
--     alors qu'elle n'est PAS résolue (status 'scheduled') : c'est la
--     fixture de NON-FUITE — publicCorrectAnswer doit la masquer, la
--     bonne réponse ne doit apparaître nulle part côté joueur ;
--   · une 3e question porte un locks_at PASSÉ : verrouillée sans être
--     résolue, plus aucune réponse n'est acceptée.
-- Championnat séparé à dessein : E2EPRONO/E2EPRONO2 restent 100 %
-- football (question_type 'score'), leurs specs ne bougent pas.
insert into public.contests (
  id, organization_id, slug, name, competition_key, event_kind,
  default_locks_at, status, collect_email, collect_phone
)
values ('e2e60000-0000-4000-8000-000000000003', 'e2e10000-0000-4000-8000-000000000001',
        'E2EPRONO3', 'Cérémonie E2E', 'custom', 'ceremony',
        now() + interval '30 days', 'active', false, false)
on conflict (id) do nothing;

insert into public.contest_matches (
  id, contest_id, organization_id, home_name, away_name,
  kickoff_at, locks_at, status, question_type, prompt, options,
  correct_answer, ranking_size, position
) values
  -- Question à choix, OUVERTE (pas de locks_at → défaut de l'événement),
  -- résultat déjà connu en base mais NON publié (status 'scheduled').
  ('e2e70000-0000-4000-8000-000000000021', 'e2e60000-0000-4000-8000-000000000003',
   'e2e10000-0000-4000-8000-000000000001', '', '',
   now() + interval '30 days', null, 'scheduled', 'choice',
   'Qui recevra le trophée de la Cérémonie E2E ?',
   '[{"id":"opt-a","label":"Alice Cinéma"},
     {"id":"opt-b","label":"Bruno Théâtre"},
     {"id":"opt-c","label":"Carla Musique"}]'::jsonb,
   '"opt-b"'::jsonb, null, 0),
  -- Question d'estimation, OUVERTE.
  ('e2e70000-0000-4000-8000-000000000022', 'e2e60000-0000-4000-8000-000000000003',
   'e2e10000-0000-4000-8000-000000000001', '', '',
   now() + interval '30 days', null, 'scheduled', 'number',
   'Combien de trophées seront remis pendant la cérémonie ?',
   null, null, null, 1),
  -- Question VERROUILLÉE (échéance dépassée) et non résolue.
  ('e2e70000-0000-4000-8000-000000000023', 'e2e60000-0000-4000-8000-000000000003',
   'e2e10000-0000-4000-8000-000000000001', '', '',
   now() - interval '2 days', now() - interval '1 day', 'scheduled', 'choice',
   'Quelle sera la couleur du tapis d''entrée ?',
   '[{"id":"tapis-rouge","label":"Tapis rouge"},
     {"id":"tapis-bleu","label":"Tapis bleu"}]'::jsonb,
   null, null, 2)
on conflict (id) do nothing;

-- ── Mode événement en direct (quiz, session en lobby) ─────────
-- Un game actif + une session ouverte (status lobby → joignable) avec un
-- join_code déterministe pour le QR/URL et les specs E2E. Trois questions
-- couvrant les trois types (quiz / poll / prono). Aucun joueur seedé : la page
-- publique s'affiche (lobby, comptoir) sans dépendance de parcours.
insert into public.event_games (id, organization_id, name, status)
values ('e2ed0000-0000-4000-8000-000000000001',
        'e2e10000-0000-4000-8000-000000000001', 'Quiz du bar E2E', 'active')
on conflict (id) do nothing;

insert into public.event_questions (
  id, game_id, organization_id, position, question_type, prompt, time_limit_seconds, points_base
) values
  ('e2ed0000-0000-4000-8000-000000000011', 'e2ed0000-0000-4000-8000-000000000001',
   'e2e10000-0000-4000-8000-000000000001', 0, 'quiz', 'Capitale de la France ?', 90, 1000),
  ('e2ed0000-0000-4000-8000-000000000012', 'e2ed0000-0000-4000-8000-000000000001',
   'e2e10000-0000-4000-8000-000000000001', 1, 'poll', 'Bière préférée ?', 30, 1000),
  ('e2ed0000-0000-4000-8000-000000000013', 'e2ed0000-0000-4000-8000-000000000001',
   'e2e10000-0000-4000-8000-000000000001', 2, 'prono', 'Vainqueur du match de ce soir ?', 30, 1000)
on conflict (id) do nothing;

insert into public.event_question_options (
  id, question_id, organization_id, position, label, is_correct
) values
  ('e2ed0000-0000-4000-8000-000000001101', 'e2ed0000-0000-4000-8000-000000000011',
   'e2e10000-0000-4000-8000-000000000001', 0, 'Paris', true),
  ('e2ed0000-0000-4000-8000-000000001102', 'e2ed0000-0000-4000-8000-000000000011',
   'e2e10000-0000-4000-8000-000000000001', 1, 'Lyon', false),
  ('e2ed0000-0000-4000-8000-000000001201', 'e2ed0000-0000-4000-8000-000000000012',
   'e2e10000-0000-4000-8000-000000000001', 0, 'Blonde', false),
  ('e2ed0000-0000-4000-8000-000000001202', 'e2ed0000-0000-4000-8000-000000000012',
   'e2e10000-0000-4000-8000-000000000001', 1, 'Brune', false),
  ('e2ed0000-0000-4000-8000-000000001301', 'e2ed0000-0000-4000-8000-000000000013',
   'e2e10000-0000-4000-8000-000000000001', 0, 'Équipe A', false),
  ('e2ed0000-0000-4000-8000-000000001302', 'e2ed0000-0000-4000-8000-000000000013',
   'e2e10000-0000-4000-8000-000000000001', 1, 'Équipe B', false)
on conflict (id) do nothing;

-- Session ouverte (lobby) : join_code déterministe E2EVNT (alphabet sans I/O/0/1).
-- Stock fini de 3 codes EVENT-… pour le podium récompensé.
--
-- ⚠️ SESSION EN LECTURE SEULE. `e2e/event.spec.ts` lit ici l'état INITIAL et
-- IMMUABLE — phase `lobby`, « En attente des premiers joueurs… », aucun joueur.
-- Ne rien piloter dessus : toute spec qui lance/verrouille/révèle une question
-- ou qui inscrit un joueur doit utiliser la session dédiée ci-dessous.
insert into public.event_sessions (
  id, game_id, organization_id, label, join_code, status, reward_stock, reward_label, reward_details
) values (
  'e2ed0000-0000-4000-8000-000000000021', 'e2ed0000-0000-4000-8000-000000000001',
  'e2e10000-0000-4000-8000-000000000001', 'Soirée E2E', 'E2EVNT', 'lobby', 3,
  'Tournée offerte', 'À retirer au comptoir E2E.')
on conflict (id) do nothing;

-- ── Session DÉDIÉE au cycle télécommande (E2E) ────────────────
-- Même isolation structurelle que le calendrier `e2e-calendar-vide` et que la
-- cagnotte `e2e-jackpot-code` : `e2e/event-remote-cycle.spec.ts` MUTE la
-- session qu'il pilote (lobby → question_active → question_locked → reveal, et
-- il y inscrit un joueur), alors que `e2e/event.spec.ts` exige de la sienne
-- l'état initial intact. Les deux specs tournant en parallèle (2 workers en
-- CI) sur le MÊME état serveur, la seule session partagée rendait l'échec
-- structurel et non ordonnancé : d'où cette seconde session, qu'aucune autre
-- spec ne lit.
--
-- Le GAME reste partagé (`…0001`) à dessein : seule la SESSION porte la
-- machine à états, les questions et leurs options sont en lecture seule dans
-- le cycle. Un game dédié ajouterait une ligne au hub QR (une ligne par JEU) et
-- à `/dashboard/events` sans rien isoler de plus.
--
-- `created_at` non forcé : psql applique le seed en autocommit, cette session
-- est donc strictement postérieure à `…0021`, qui reste la PREMIÈRE (adresse
-- représentative du hub QR, `order by created_at asc, id asc`).
insert into public.event_sessions (
  id, game_id, organization_id, label, join_code, status, reward_stock, reward_label, reward_details
) values (
  'e2ed0000-0000-4000-8000-000000000022', 'e2ed0000-0000-4000-8000-000000000001',
  'e2e10000-0000-4000-8000-000000000001', 'Cycle télécommande E2E', 'E2ERMT', 'lobby', 3,
  'Café offert', 'À retirer au comptoir E2E (cycle télécommande).')
on conflict (id) do nothing;

-- ── Calendrier / campagne quotidienne (thème Noël, actif) ─────
-- Un calendrier actif (page suivable À DISTANCE) avec public_slug déterministe
-- (e2e-calendar) et 3 cases : jour 1 ouvrable AUJOURD'HUI (unlock_at passé, une
-- offre 'content'), jour 2 ouvrable AUJOURD'HUI (un lot 'lot' à stock fini), et
-- jour 3 VERROUILLÉ (unlock_at futur → open_calendar_box répond too_early). Le
-- gating serveur se teste sans dépendance : la case future doit refuser
-- l'ouverture. Récompense d'assiduité à stock fini (5). day_count=3.
--
-- ⚠️ NE PAS AJOUTER DE CASE ICI. `e2e/atelier-modules.spec.ts` exige que ce
-- calendrier parte à `day_count=3` (:357), fait lui-même monter à 4 pour
-- fabriquer une case VIDE — c'est son oracle — puis redescend à 3, ce qui
-- SUPPRIME cette quatrième case. Toute case ajoutée ici serait donc détruite en
-- cours de suite. Le calendrier dédié plus bas existe pour cette raison.
insert into public.calendars (
  id, organization_id, name, theme, status, start_date, timezone, day_count,
  public_slug, merchant_content, completion_reward_label, completion_reward_details,
  completion_reward_stock
) values (
  'e2ee0000-0000-4000-8000-000000000001', 'e2e10000-0000-4000-8000-000000000001',
  'Calendrier de l''Avent E2E', 'noel', 'active', current_date, 'Europe/Paris', 3,
  'e2e-calendar', 'Une surprise chaque jour jusqu''à Noël !',
  'Le grand panier de Noël', 'À retirer au comptoir E2E.', 5
)
on conflict (id) do nothing;

insert into public.calendar_days (
  id, calendar_id, organization_id, day_index, unlock_at, content_type,
  content_text, reward_label, reward_details, reward_stock, is_special
) values
  ('e2ee0000-0000-4000-8000-000000000011', 'e2ee0000-0000-4000-8000-000000000001',
   'e2e10000-0000-4000-8000-000000000001', 1, now() - interval '1 hour', 'content',
   'Bienvenue ! -10 % sur votre café aujourd''hui.', '', null, null, false),
  ('e2ee0000-0000-4000-8000-000000000012', 'e2ee0000-0000-4000-8000-000000000001',
   'e2e10000-0000-4000-8000-000000000001', 2, now() - interval '30 minutes', 'lot',
   null, 'Croissant offert', 'À retirer au comptoir E2E.', 50, true),
  ('e2ee0000-0000-4000-8000-000000000013', 'e2ee0000-0000-4000-8000-000000000001',
   'e2e10000-0000-4000-8000-000000000001', 3, now() + interval '2 days', 'content',
   'Encore un peu de patience...', '', null, null, false)
on conflict (id) do nothing;

-- ── Calendrier DÉDIÉ au test « case message laissée vide » ────
-- `e2e/calendar.spec.ts` porte un test `fixme` (« une case message laissée vide
-- ouvre sur "Pas de chance aujourd'hui !" ») vert au PREMIER passage et faux aux
-- suivants : il vidait la case 1 du calendrier ci-dessus, seule case `content`
-- déverrouillée, que le test précédent du même fichier a déjà ouverte dans ce
-- seed PARTAGÉ. Le remède écrit dans son commentaire — « une case dédiée jamais
-- ouverte » — ne pouvait pas tenir sur ce calendrier-là : `atelier-modules`
-- fait varier son `day_count` et détruit toute case surnuméraire.
--
-- D'où un calendrier À PART, que rien d'autre ne touche. Sa case 1 est la
-- donnée du test : `content`, déverrouillée, jamais ouverte ailleurs, texte
-- stable (le test le vide puis le restaure dans un `finally`).
--
-- day_count=2, avec une case 2 VERROUILLÉE : à une seule case, l'ouvrir
-- terminerait le calendrier et déclencherait l'écran de récompense d'assiduité
-- par-dessus l'écran perdant que le test vient justement lire.
insert into public.calendars (
  id, organization_id, name, theme, status, start_date, timezone, day_count,
  public_slug, merchant_content, completion_reward_label, completion_reward_details,
  completion_reward_stock
) values (
  'e2ee0000-0000-4000-8000-000000000002', 'e2e10000-0000-4000-8000-000000000001',
  'Calendrier E2E — case vide', 'noel', 'active', current_date, 'Europe/Paris', 2,
  'e2e-calendar-vide', 'Une surprise par jour, réservée aux tests.',
  'Le petit panier de test', 'À retirer au comptoir E2E.', 5
)
on conflict (id) do nothing;

insert into public.calendar_days (
  id, calendar_id, organization_id, day_index, unlock_at, content_type,
  content_text, reward_label, reward_details, reward_stock, is_special
) values
  ('e2ee0000-0000-4000-8000-000000000021', 'e2ee0000-0000-4000-8000-000000000002',
   'e2e10000-0000-4000-8000-000000000001', 1, now() - interval '1 hour', 'content',
   'Une attention rien que pour vous aujourd''hui.', '', null, null, false),
  ('e2ee0000-0000-4000-8000-000000000022', 'e2ee0000-0000-4000-8000-000000000002',
   'e2e10000-0000-4000-8000-000000000001', 2, now() + interval '2 days', 'content',
   'Encore un peu de patience...', '', null, null, false)
on conflict (id) do nothing;

-- ── Parrainage ludique (campagne roue gagnante E2EWIN01) ──────
-- Programme activé sur la campagne « E2E Gagnante » (roue e2e30000-…001, dont le
-- lot gagnant porte un stock FINI 5000 → un tour offert de parrainage y tire un
-- gain, cf. BORNE 2 de consume_referral_spin_grant). Versement PARRAIN = tour
-- offert (spin, stock illimité borné par la roue), FILLEUL = rien (none), COFFRE
-- au 3e filleul = lot PARRAIN-… à stock fini (5). Plafond 20, fenêtre 30 j.
insert into public.referral_programs (
  id, campaign_id, organization_id, enabled, chest_threshold, sponsor_max_filleuls, window_days,
  sponsor_reward_kind, sponsor_reward_label,
  filleul_reward_kind,
  chest_reward_kind, chest_reward_label, chest_reward_details, chest_reward_stock
)
values (
  'e2ef0000-0000-4000-8000-000000000001', 'e2e20000-0000-4000-8000-000000000001',
  'e2e10000-0000-4000-8000-000000000001', true, 3, 20, 30,
  'spin', 'Un tour offert par ami parrainé',
  'none',
  'lot', 'Le panier du parrain', 'À retirer au comptoir E2E dès 3 amis parrainés.', 5
)
on conflict (id) do nothing;

-- Parrain déterministe (page parrain + parcours de validation E2E) : clé device
-- fixe (64 hex) et jeton partageable fixe PR-E2E2TEST (alphabet sans I/O/0/1).
insert into public.referral_sponsors (
  id, campaign_id, organization_id, sponsor_key, referral_code, sponsor_email
)
values (
  'e2ef0000-0000-4000-8000-000000000011', 'e2e20000-0000-4000-8000-000000000001',
  'e2e10000-0000-4000-8000-000000000001', repeat('e2', 32), 'PR-E2E2TEST', 'parrain@e2e.local'
)
on conflict (id) do nothing;

-- Lot de coffre PARRAIN-… DÉJÀ ÉMIS pour ce parrain (parcours caisse E2E) :
-- versement 'lot' à stock fini, code déterministe. redeem_referral_reward le
-- valide UNE fois puis refuse le double retrait. Code sur l'alphabet sans I/O/0/1.
insert into public.referral_rewards (
  id, campaign_id, organization_id, sponsor_id, beneficiary, kind, code
)
values (
  'e2ef0000-0000-4000-8000-000000000021', 'e2e20000-0000-4000-8000-000000000001',
  'e2e10000-0000-4000-8000-000000000001', 'e2ef0000-0000-4000-8000-000000000011',
  'chest', 'lot', 'PARRAIN-E2ECHEST'
)
on conflict (id) do nothing;

-- ── Méta-progression — saison ACTIVE déterministe (e2e/progression.spec.ts) ──
-- Semée directement en base (badge, collection, objet, mission, coffre) pour que
-- l'E2E n'ait plus à piloter treize étapes en série à l'écran : le formulaire est
-- prouvé par un test COURT et séparé (brouillon), ce fixture-ci ne sert que le
-- parcours joueur et la clôture. Une seule saison ACTIVE par organisation
-- (progression_seasons_one_active_org_idx) : le test d'éditeur ne peut donc créer
-- qu'un BROUILLON tant que celle-ci tourne, c'est voulu.
--
-- La mission N'OCTROIE PAS l'objet du coffre : `availableItems` compte les objets
-- NON encore possédés, une mission qui le donnerait viderait le coffre d'avance et
-- son bouton « Ouvrir » resterait désactivé (régression corrigée par e52c3df,
-- à ne pas réintroduire). La mission octroie le badge ; le coffre, lui seul,
-- octroie l'objet.
insert into public.progression_seasons (
  id, organization_id, name, status, starts_at, ends_at
)
values (
  'e2f00000-0000-4000-8000-000000000001', 'e2e10000-0000-4000-8000-000000000001',
  'Saison E2E', 'active', now() - interval '1 day', now() + interval '30 days'
)
on conflict (id) do nothing;

insert into public.progression_badges (
  id, season_id, organization_id, name, description, icon_key
)
values (
  'e2f00000-0000-4000-8000-000000000011', 'e2f00000-0000-4000-8000-000000000001',
  'e2e10000-0000-4000-8000-000000000001', 'Habitué du comptoir',
  'Décroché après un premier tour de roue.', 'star'
)
on conflict (id) do nothing;

insert into public.progression_collections (
  id, season_id, organization_id, name, description
)
values (
  'e2f00000-0000-4000-8000-000000000021', 'e2f00000-0000-4000-8000-000000000001',
  'e2e10000-0000-4000-8000-000000000001', 'Les vignerons', ''
)
on conflict (id) do nothing;

insert into public.progression_collection_items (
  id, collection_id, season_id, organization_id, name, description, position
)
values (
  'e2f00000-0000-4000-8000-000000000031', 'e2f00000-0000-4000-8000-000000000021',
  'e2f00000-0000-4000-8000-000000000001', 'e2e10000-0000-4000-8000-000000000001',
  'La carte du domaine', '', 0
)
on conflict (id) do nothing;

-- Palier à 1 : un unique spin gagnant suffit à faire progresser la mission.
-- Type d'expérience « campaign », exactement ce que couvre E2EWIN01.
insert into public.progression_missions (
  id, season_id, organization_id, name, description, enabled,
  active_rule_version, key_reward, badge_id, collection_item_id
)
values (
  'e2f00000-0000-4000-8000-000000000041', 'e2f00000-0000-4000-8000-000000000001',
  'e2e10000-0000-4000-8000-000000000001', 'Jouer une fois', '', true,
  1, 1, 'e2f00000-0000-4000-8000-000000000011', null
)
on conflict (id) do nothing;

insert into public.progression_mission_versions (
  mission_id, version, season_id, organization_id, rule
)
values (
  'e2f00000-0000-4000-8000-000000000041', 1, 'e2f00000-0000-4000-8000-000000000001',
  'e2e10000-0000-4000-8000-000000000001',
  '{"version":"1","event_name":"experience_completed","target":1,"experience_kinds":["campaign"]}'::jsonb
)
on conflict (mission_id, version) do nothing;

insert into public.progression_chests (
  id, season_id, organization_id, name, description, key_cost, enabled
)
values (
  'e2f00000-0000-4000-8000-000000000051', 'e2f00000-0000-4000-8000-000000000001',
  'e2e10000-0000-4000-8000-000000000001', 'Le coffre du cellier', '', 1, true
)
on conflict (id) do nothing;

insert into public.progression_chest_items (chest_id, item_id, season_id, organization_id)
values (
  'e2f00000-0000-4000-8000-000000000051', 'e2f00000-0000-4000-8000-000000000031',
  'e2f00000-0000-4000-8000-000000000001', 'e2e10000-0000-4000-8000-000000000001'
)
on conflict (chest_id, item_id) do nothing;

-- ── Créateur de quiz — quiz DÉTERMINISTE (e2e/quiz.spec.ts) ────
-- Quiz ACTIF à slug STABLE `e2e-quiz` : quizzes_set_defaults n'écrase jamais un
-- public_slug fourni, l'URL /quiz/e2e-quiz est donc reproductible. Mode
-- `threshold` (lot dès 2 bonnes réponses) sur stock FINI (ADR-031) largement
-- au-delà de ce qu'une suite E2E consomme — chaque parcours complet émet
-- UN code QUIZ-… neuf, ressource jamais disputée entre projets.
insert into public.quizzes (
  id, organization_id, name, theme, status, public_slug, intro_text,
  reward_mode, reward_threshold, reward_label, reward_details, reward_stock
)
values (
  'e2e95000-0000-4000-8000-000000000001', 'e2e10000-0000-4000-8000-000000000001',
  'Quiz du Comptoir E2E', 'gourmand', 'active', 'e2e-quiz',
  'Trois questions pour repartir avec une douceur.',
  'threshold', 2, 'Le sablé du Comptoir E2E',
  'À retirer au comptoir E2E sur présentation du code.', 5000
)
on conflict (id) do nothing;

-- Trois questions : trois MODÈLES d'UI au-dessus de trois FORMES de réponse,
-- dont une CHRONOMÉTRÉE. Les deux dernières portent une vérité SECRÈTE, propre
-- au corpus E2E (« 1417 », « PERROQUET ») : la spec vérifie par page.content()
-- qu'aucune ne figure dans le HTML servi avant que le joueur ait répondu —
-- l'invariant de non-fuite ne se teste que sur une valeur qui n'a aucune autre
-- raison d'apparaître. Les options du choix multiple, elles, SONT servies :
-- elles ne désignent pas la bonne réponse (correct_answer reste en base).
insert into public.quiz_questions (
  id, quiz_id, organization_id, position, prompt, question_type, preset,
  options, correct_answer, time_limit_seconds, points, tolerance, ranking_size
)
values
  -- 0. multiple_choice / choice — 3 options ⇒ disposition « list ».
  ('e2e95000-0000-4000-8000-000000000011',
   'e2e95000-0000-4000-8000-000000000001', 'e2e10000-0000-4000-8000-000000000001',
   0, 'Quelle boisson fait la réputation du Comptoir E2E ?', 'choice', 'multiple_choice',
   '[{"id":"cafe","label":"Le café"},{"id":"limonade","label":"La limonade"},{"id":"orgeat","label":"Le sirop d''orgeat"}]'::jsonb,
   '"cafe"'::jsonb, null, 1, null, null),

  -- 1. estimate / number — valeur EXACTE exigée (tolerance nulle), secrète.
  --    407312 est CHOISI hors de toute plage plausible de `elapsed_ms` /
  --    `total_elapsed_ms` / `score` : ces agrégats figurent légitimement dans
  --    l'état des questions DÉJÀ répondues, et un secret à 3-4 chiffres y
  --    entrerait un jour en collision — l'assertion de non-fuite serait alors
  --    rouge sans aucune fuite. 407312 ms = 407 s : hors d'atteinte d'un test.
  ('e2e95000-0000-4000-8000-000000000012',
   'e2e95000-0000-4000-8000-000000000001', 'e2e10000-0000-4000-8000-000000000001',
   1, 'Combien de grains de café le bocal du Comptoir E2E contient-il ?', 'number', 'estimate',
   null, '407312'::jsonb, null, 1, null, null),

  -- 2. timed / text — CHRONOMÈTRE de 120 s : assez large pour que la spec
  --    constate son EXISTENCE sans jamais courir après son expiration (la base
  --    seule tranche le hors-délai). Variante acceptée insensible à la casse
  --    et aux accents (quiz_normalize_text).
  ('e2e95000-0000-4000-8000-000000000013',
   'e2e95000-0000-4000-8000-000000000001', 'e2e10000-0000-4000-8000-000000000001',
   2, 'Quel oiseau orne l''enseigne du Comptoir E2E ?', 'text', 'timed',
   null, '["PERROQUET"]'::jsonb, 120, 1, null, null)
on conflict (id) do nothing;

-- ── Réserver — activité et créneau DÉTERMINISTES (module vitrine) ────
-- Le droit `vitrine` est semé par OCTROI DATÉ et non par `addon_vitrine` :
-- l'addon n'ouvre le module qu'adossé à une OFFRE d'abonnement vivante, or
-- « E2E Café » tourne sur `comp_access`, pas sur un abonnement Stripe. L'octroi
-- de back-office est de toute façon le SEUL chemin ouvert pendant la bêta
-- (20261001120000), donc le seul qui vaille la peine d'être semé.
insert into public.organization_module_grants
  (id, organization_id, module, kind, source, starts_at, ends_at)
values (
  'e2ea0000-0000-4000-8000-000000000001', 'e2e10000-0000-4000-8000-000000000001',
  'vitrine', 'pass', 'backoffice', now() - interval '1 day', now() + interval '365 days'
)
on conflict (id) do nothing;

-- Une activité ACTIVE et un créneau OUVERT dans le futur proche, à capacité
-- petite mais PLURIELLE (4) : une place unique ferait échouer le second
-- parcours d'une même exécution E2E sur « full » plutôt que sur ce qu'il
-- teste, et une capacité large ne prouverait jamais que la borne existe.
insert into public.reservation_activities
  (id, organization_id, name, description, active)
values (
  'e2ea0000-0000-4000-8000-000000000011', 'e2e10000-0000-4000-8000-000000000001',
  'Dégustation du Comptoir E2E',
  'Trois cafés commentés, vingt minutes au comptoir.', true
)
on conflict (id) do nothing;

insert into public.reservation_slots
  (id, activity_id, organization_id, starts_at, ends_at, capacity, status)
values (
  'e2ea0000-0000-4000-8000-000000000021',
  'e2ea0000-0000-4000-8000-000000000011', 'e2e10000-0000-4000-8000-000000000001',
  now() + interval '2 days', now() + interval '2 days 20 minutes', 4, 'open'
)
on conflict (id) do nothing;

-- Un second créneau, PROCHE (dans 30 minutes) : sa fenêtre de check-in
-- (`starts_at - 1h`) est déjà ouverte au moment du seed, contrairement au
-- créneau ci-dessus qui reste à 2 jours. Le parcours E2E d'arrivée en caisse
-- a besoin d'une réservation IMMÉDIATEMENT enregistrable — sans lui, prouver
-- le check-in demanderait de recalculer l'horloge de la base à l'exécution.
insert into public.reservation_slots
  (id, activity_id, organization_id, starts_at, ends_at, capacity, status)
values (
  'e2ea0000-0000-4000-8000-000000000022',
  'e2ea0000-0000-4000-8000-000000000011', 'e2e10000-0000-4000-8000-000000000001',
  now() + interval '30 minutes', now() + interval '50 minutes', 4, 'open'
)
on conflict (id) do nothing;

-- ── Réserver RES-2 — liste prioritaire et invitation privée ──────────
--
-- SUR UNE SECONDE ACTIVITÉ, ET C'EST DÉLIBÉRÉ. Le parcours public rend UNE
-- activité par page (`ReserverExperience` reçoit un seul `activityName` et une
-- seule liste de créneaux) : poser ces fixtures sur « Dégustation du Comptoir
-- E2E » y aurait ajouté un créneau COMPLET que `e2e/reserver.spec.ts` aurait
-- attrapé avec son `.last()`, et le second scénario aurait échoué sur un
-- créneau sans place au lieu de tester ce qu'il teste. Les deux jeux de
-- fixtures ne se croisent donc jamais.
insert into public.reservation_activities
  (id, organization_id, name, description, active)
values (
  'e2ea0000-0000-4000-8000-000000000012', 'e2e10000-0000-4000-8000-000000000001',
  'Atelier privé du Comptoir E2E',
  'Six places, sur invitation ou liste prioritaire.', true
)
on conflict (id) do nothing;

-- Un créneau à UNE place, DÉJÀ PRISE : c'est la seule situation où
-- `waitlist_join` accepte quelqu'un — sur un créneau qui a de la place, elle
-- renvoie `not_full` et invite à réserver normalement. Sans ce créneau, aucun
-- parcours E2E ne pourrait atteindre la file.
insert into public.reservation_slots
  (id, activity_id, organization_id, starts_at, ends_at, capacity, status)
values (
  'e2ea0000-0000-4000-8000-000000000023',
  'e2ea0000-0000-4000-8000-000000000012', 'e2e10000-0000-4000-8000-000000000001',
  now() + interval '4 days', now() + interval '4 days 30 minutes', 1, 'open'
)
on conflict (id) do nothing;

-- La place qui rend le créneau complet. Le code de comptoir est posé par le
-- trigger `reservations_set_code`, jamais ici : le seed n'a pas à choisir un
-- identifiant que la base réserve au serveur.
insert into public.reservations
  (id, slot_id, organization_id, player_key_hash)
values (
  'e2ea0000-0000-4000-8000-000000000031',
  'e2ea0000-0000-4000-8000-000000000023', 'e2e10000-0000-4000-8000-000000000001',
  repeat('e2', 32)
)
on conflict (id) do nothing;

-- Un inscrit sur la liste, en attente. `waiting` et non `offered` : une offre
-- semée serait déjà en train de courir vers son échéance au moment où l'E2E
-- démarre, et le balayage pg_cron pourrait la faire expirer entre le seed et
-- le test. Une entrée en attente, elle, est stable.
insert into public.reservation_waitlist_entries
  (id, slot_id, organization_id, player_key_hash)
values (
  'e2ea0000-0000-4000-8000-000000000041',
  'e2ea0000-0000-4000-8000-000000000023', 'e2e10000-0000-4000-8000-000000000001',
  repeat('e3', 32)
)
on conflict (id) do nothing;

-- Un créneau FERMÉ au public : le cas d'usage même de l'invitation privée —
-- le commerçant a coupé les réservations et ouvre malgré tout quelques places.
insert into public.reservation_slots
  (id, activity_id, organization_id, starts_at, ends_at, capacity, status)
values (
  'e2ea0000-0000-4000-8000-000000000024',
  'e2ea0000-0000-4000-8000-000000000012', 'e2e10000-0000-4000-8000-000000000001',
  now() + interval '5 days', now() + interval '5 days 30 minutes', 2, 'closed'
)
on conflict (id) do nothing;

-- L'INVITATION. Le jeton CLAIR est `E2E-INVIT-TOKEN-0000000000000000` : il vit
-- dans ce commentaire et dans la spec E2E, jamais en base. La colonne ne porte
-- que son empreinte SHA-256 hexadécimale, calculée ici comme l'application
-- devra le faire — `sha256(jeton)`, SANS sel : le jeton est tiré côté serveur
-- avec assez d'entropie pour qu'aucun dictionnaire ne le retrouve, et un sel
-- applicatif rendrait toutes les invitations illisibles le jour où il
-- tournerait.
--
-- EXACTEMENT 32 CARACTÈRES `[A-Za-z0-9_-]`, ET C'EST OBLIGATOIRE :
-- `RESERVER_INVITATION_TOKEN_PATTERN` (src/lib/reserver.ts) est ce gabarit, et
-- `hashInvitationToken` (src/lib/reserver-context.ts) rend `null` — donc un
-- 404 générique, AVANT toute lecture de la table — sur un jeton qui ne le
-- respecte pas. Le jeton court `E2E-INVIT-0001` (14 caractères) posé au lot
-- L5 ne le respectait pas : aucun parcours E2E n'avait encore chargé cette
-- page pour le révéler (QA du lot L5 / RES-2, PR #161, 2026-08-19).
insert into public.reservation_invitations
  (id, organization_id, slot_id, label, token_hash, max_uses, created_by)
values (
  'e2ea0000-0000-4000-8000-000000000051', 'e2e10000-0000-4000-8000-000000000001',
  'e2ea0000-0000-4000-8000-000000000024', 'Invitation E2E',
  encode(extensions.digest('E2E-INVIT-TOKEN-0000000000000000', 'sha256'), 'hex'),
  5, 'e2e00000-0000-4000-8000-000000000001'
)
on conflict (id) do nothing;

-- Un créneau à UNE place, LIBRE — sans réservation ni entrée de file
-- pré-semées, DÉLIBÉRÉMENT, contrairement à `...023` ci-dessus. Ce dernier
-- porte déjà une entrée `waiting` posée avant tout navigateur E2E : un test qui
-- y rejoindrait la file puis libérerait la place verrait l'offre partir au FIFO
-- vers ce concurrent seedé, jamais vers le navigateur de test. Ce créneau-ci
-- sert le scénario complet « offre → prise » : le SEUL navigateur de test y
-- réserve la place (le remplit), un second navigateur (second cookie, même
-- test) rejoint la file en 1ère position, le premier annule, et le second
-- observe l'offre puis la prend.
insert into public.reservation_slots
  (id, activity_id, organization_id, starts_at, ends_at, capacity, status)
values (
  'e2ea0000-0000-4000-8000-000000000025',
  'e2ea0000-0000-4000-8000-000000000012', 'e2e10000-0000-4000-8000-000000000001',
  now() + interval '6 days', now() + interval '6 days 30 minutes', 1, 'open'
)
on conflict (id) do nothing;

-- UNE SECONDE ACTIVITÉ, ET UN SECOND CRÉNEAU DÉDIÉ IDENTIQUE — pour la MÊME
-- raison que la séparation `...011` / `...012` documentée plus haut :
-- `mobile-chrome` et `mobile-safari` exécutent le même fichier de specs EN
-- PARALLÈLE, sur la même base seedée. Un unique créneau à capacité 1 partagé
-- entre les deux projets ferait échouer celui qui arrive en second — le
-- bouton « Réserver ma place » aurait déjà disparu, pris par l'autre projet.
-- Chaque projet a donc SA PROPRE activité à une place, jamais touchée par
-- l'autre.
insert into public.reservation_activities
  (id, organization_id, name, description, active)
values (
  'e2ea0000-0000-4000-8000-000000000013', 'e2e10000-0000-4000-8000-000000000001',
  'Atelier privé du Comptoir E2E (bis)',
  'Six places, sur invitation ou liste prioritaire.', true
)
on conflict (id) do nothing;

insert into public.reservation_slots
  (id, activity_id, organization_id, starts_at, ends_at, capacity, status)
values (
  'e2ea0000-0000-4000-8000-000000000026',
  'e2ea0000-0000-4000-8000-000000000013', 'e2e10000-0000-4000-8000-000000000001',
  now() + interval '6 days', now() + interval '6 days 30 minutes', 1, 'open'
)
on conflict (id) do nothing;

-- ── Réserver RES-5 — les deux Expériences Signature ──────────────────
--
-- DEUX ACTIVITÉS DE PLUS, ET SUR LEURS PROPRES CRÉNEAUX. Le parcours public
-- rend UNE activité par page : poser ces formats sur une activité existante
-- aurait ajouté aux fixtures RES-1a/RES-2 des créneaux d'un autre format, que
-- les specs attrapent avec leur `.last()`.
--
-- LES CRÉNEAUX SONT PROCHES (2 h et 3 h) et non à plusieurs jours : les deux
-- formats se jouent sur la PAGE IMMERSIVE — promesse, durée, étapes,
-- préparation — et une spec qui doit lire ces éléments n'a pas besoin
-- d'attendre, mais a besoin d'un créneau visible en tête de liste.
insert into public.reservation_activities
  (id, organization_id, name, description, active,
   kind, promise, duration_minutes, steps, preparation)
values (
  'e2ea0000-0000-4000-8000-000000000014', 'e2e10000-0000-4000-8000-000000000001',
  'Moment Signature du Comptoir E2E',
  'Trente minutes au comptoir, en trois temps.', true,
  'signature',
  'Trente minutes hors du temps, entre le moulin et la tasse.',
  30,
  -- TROIS cartes, le maximum : c'est le format nominal, et c'est aussi ce qui
  -- vérifie au passage que la borne haute laisse bien passer trois.
  '[{"title":"On vous accueille",
     "body":"Un mot sur la maison, et le choix des grains du jour."},
    {"title":"On extrait ensemble",
     "body":"Vous tenez le porte-filtre ; on règle la mouture à deux."},
    {"title":"On déguste",
     "body":"Trois tasses commentées, et la fiche à emporter."}]'::jsonb,
  'Venez cinq minutes en avance. Évitez le parfum : il couvre les arômes.'
)
on conflict (id) do nothing;

insert into public.reservation_slots
  (id, activity_id, organization_id, starts_at, ends_at, capacity, status)
values (
  'e2ea0000-0000-4000-8000-000000000027',
  'e2ea0000-0000-4000-8000-000000000014', 'e2e10000-0000-4000-8000-000000000001',
  now() + interval '2 hours', now() + interval '2 hours 30 minutes', 4, 'open'
)
on conflict (id) do nothing;

-- L'ATELIER DUO. Capacité SIX, c'est-à-dire TROIS duos : un multiple de deux,
-- délibérément — sur une capacité impaire, la place esseulée finale rendrait
-- « complet » au dernier duo et une spec y verrait un échec plutôt que la
-- règle. Trois duos laissent en outre `mobile-chrome` et `mobile-safari` jouer
-- le même fichier en parallèle sans se prendre la dernière paire.
--
-- AUCUN score, AUCUN classement, AUCUN gain : c'est le cahier, et rien dans ce
-- seed n'attache de campagne ni de quiz à cette activité.
insert into public.reservation_activities
  (id, organization_id, name, description, active,
   kind, promise, duration_minutes, steps, preparation)
values (
  'e2ea0000-0000-4000-8000-000000000015', 'e2e10000-0000-4000-8000-000000000001',
  'Atelier Duo du Comptoir E2E',
  'Une heure et demie à deux, autour du latte art.', true,
  'duo',
  'À deux, les mains dans le lait : repartez avec votre première rosetta.',
  90,
  -- PAS D'ÉTAPES, et c'est la différence de format écrite dans les données :
  -- le Duo dit sa préparation en prose, le Signature la présente en cartes.
  null,
  'Réservez pour deux : la place de votre accompagnant est prise avec la '
  'vôtre. Prévoyez un tablier, tout le reste est fourni.'
)
on conflict (id) do nothing;

insert into public.reservation_slots
  (id, activity_id, organization_id, starts_at, ends_at, capacity, status)
values (
  'e2ea0000-0000-4000-8000-000000000028',
  'e2ea0000-0000-4000-8000-000000000015', 'e2e10000-0000-4000-8000-000000000001',
  now() + interval '3 hours', now() + interval '3 hours 90 minutes', 6, 'open'
)
on conflict (id) do nothing;

-- ── Réserver RES-3 — file d'accueil en continu ───────────────────────
--
-- SANS ACTIVITÉ, DÉLIBÉRÉMENT. `activity_id` est nul : c'est la file
-- « Comptoir » du cahier — celle qui n'a ni créneau ni prestation, juste un
-- endroit où l'on attend. C'est le cas dominant du produit, et le semer ainsi
-- vérifie au passage que la FK composite optionnelle laisse bien passer une
-- file qui n'en a pas.
insert into public.reservation_queues
  (id, organization_id, activity_id, name, status, max_live_entries)
values (
  'e2ea0000-0000-4000-8000-000000000061', 'e2e10000-0000-4000-8000-000000000001',
  null, 'Comptoir E2E', 'open', 50
)
on conflict (id) do nothing;

-- DEUX ENTRÉES EN ATTENTE, dans cet ordre. `created_at` est laissé au défaut
-- (`clock_timestamp()`) : deux valeurs écrites à la main auraient pu être
-- égales, et le rang serait alors retombé sur l'UUID — c'est-à-dire sur le
-- hasard. L'ordre d'insertion suffit et il est le seul honnête.
--
-- CE QU'UNE SPEC E2E DOIT SAVOIR : `mobile-chrome` et `mobile-safari` jouent le
-- même fichier EN PARALLÈLE sur la même base. Chaque navigateur a son propre
-- cookie, donc sa propre entrée — aucun conflit, contrairement aux créneaux à
-- une place. Mais le RANG obtenu dépend de qui arrive en premier : une
-- assertion doit porter sur « un rang est affiché » ou sur sa DÉCROISSANCE,
-- jamais sur un nombre précis.
insert into public.reservation_queue_entries
  (id, queue_id, organization_id, player_key_hash, display_name)
values (
  'e2ea0000-0000-4000-8000-000000000071',
  'e2ea0000-0000-4000-8000-000000000061', 'e2e10000-0000-4000-8000-000000000001',
  repeat('e4', 32), 'Camille'
)
on conflict (id) do nothing;

insert into public.reservation_queue_entries
  (id, queue_id, organization_id, player_key_hash, display_name)
values (
  'e2ea0000-0000-4000-8000-000000000072',
  'e2ea0000-0000-4000-8000-000000000061', 'e2e10000-0000-4000-8000-000000000001',
  repeat('e5', 32), 'Dominique'
)
on conflict (id) do nothing;

-- FILE DÉDIÉE au Mode Attente active (RES-4, lot L7), DISTINCTE de
-- « Comptoir E2E » ci-dessus.
--
-- `reserver-file.spec.ts` boucle sur « Appeler le suivant » jusqu'à ce que
-- SA PROPRE entrée bascule « appelée » — sans distinguer QUI elle appelle,
-- puisque `queue_call_next` sert le PREMIER de la file. Sur la même file que
-- `reserver-attente.spec.ts`, ce clic sert indifféremment l'entrée de l'un
-- ou de l'autre spec : l'appel plein écran (`AppelPleinEcran`) DÉMONTE alors
-- `PendantVotreAttente` avant que le test d'attente ait fini de jouer sa
-- Pause Chance — les deux specs tournent dans le MÊME run Playwright, sur
-- des workers parallèles, et se sont bel et bien percutées (constaté : les
-- deux timeouts à 90 s, l'un sur la section démontée, l'autre sur « notre
-- entrée doit finir par être appelée »). Une file séparée retire la course :
-- seul le test « appel du staff » de `reserver-attente.spec.ts` appelle sur
-- CETTE file, et il le fait lui-même — personne d'autre n'y touche.
insert into public.reservation_queues
  (id, organization_id, activity_id, name, status, max_live_entries)
values (
  'e2ea0000-0000-4000-8000-000000000063', 'e2e10000-0000-4000-8000-000000000001',
  null, 'Comptoir Attente E2E', 'open', 50
)
on conflict (id) do nothing;

-- ── Réserver RES-4 — mode attente active ─────────────────────────────
--
-- La configuration est posée par UPDATE et non dans les `insert` ci-dessus, et
-- ce n'est pas une coquetterie : ces inserts portent tous `on conflict (id) do
-- nothing`, donc sur une base déjà semée ils ne feraient RIEN — la file
-- existerait sans son animation, et le parcours E2E échouerait sur une absence
-- de configuration au lieu de tester ce qu'il teste.
--
-- LES DEUX ANIMATIONS RÉUTILISENT DES FIXTURES EXISTANTES, ce qui est très
-- exactement la promesse de RES-4 : aucun moteur neuf, aucune récompense neuve.
--   · le quiz est `Quiz du Comptoir E2E` (e2e95000-…-01), `active`, stock 5000 ;
--   · la Pause Chance tire sur DEUX campagnes DIFFÉRENTES, une par porteur, et
--     c'est délibéré depuis que `wait_session_open` descend la configuration de
--     retrait réelle de la campagne : les deux moitiés du parcours de gain
--     doivent être couvertes.
--       — FILE (« Comptoir Attente E2E ») → `E2E Grattage` (e2e20000-…-03), qui
--         ne collecte RIEN : le retrait est automatique, le code s'affiche seul,
--         et le test lit le code sans formulaire à remplir.
--       — ACTIVITÉ (« Dégustation du Comptoir E2E ») → `E2E Gagnante`
--         (e2e20000-…-01), qui EXIGE l'email : c'est la moitié qui prouve le
--         correctif. Tant que l'écran supposait « ne rien collecter », le
--         retrait automatique partait sans adresse, le serveur le refusait —
--         et le lot était DÉJÀ tiré, le stock DÉJÀ décompté. Un tour offert
--         brûlé sans code. Le seul témoin possible est une campagne qui
--         collecte, et `reserver-attente.spec.ts` y vérifie que le formulaire
--         apparaît au lieu d'échouer en silence.
--     LES DEUX LOTS GAGNANTS PORTENT UN STOCK FINI (5000) — indispensable : la
--     BORNE 2 exclut du tour offert tout lot à stock illimité, et un lot par
--     défaut aurait rendu `no_prize` à chaque Pause Chance.
--
-- LES DEUX PORTEURS SONT CONFIGURÉS, un par forme d'attente : la file
-- « Comptoir Attente E2E » (attente DEBOUT — DÉDIÉE, pas « Comptoir E2E »,
-- voir le commentaire à sa création plus haut sur la course avec
-- `reserver-file.spec.ts`) et l'activité « Dégustation du Comptoir E2E »
-- (attente AVEC CRÉNEAU, celle dont le créneau proche porte déjà une
-- réservation confirmée dans les parcours de check-in).
update public.reservation_queues
   set wait_quiz_id = 'e2e95000-0000-4000-8000-000000000001',
       wait_pause_campaign_id = 'e2e20000-0000-4000-8000-000000000003'
 where id = 'e2ea0000-0000-4000-8000-000000000063';

update public.reservation_activities
   set wait_quiz_id = 'e2e95000-0000-4000-8000-000000000001',
       wait_pause_campaign_id = 'e2e20000-0000-4000-8000-000000000001'
 where id = 'e2ea0000-0000-4000-8000-000000000011';

-- ── Réserver RES-5 — offres de stock et Drop anti-gaspi ──────────────
--
-- DEUX offres, et elles ne servent pas au même parcours :
--
--   * « Tarte du jour » — fenêtre de retrait ENGLOBANT MAINTENANT (de −1 h à
--     +3 h). C'est la seule forme sur laquelle le RETRAIT EN CAISSE est
--     immédiatement jouable : la borne basse de `redeem_stock_hold` refuse
--     avant `window_starts_at`, donc une offre à fenêtre future ne permettrait
--     jamais de prouver le passage au comptoir sans manipuler l'horloge de la
--     base à l'exécution. Même raison que le créneau « à 30 minutes » de RES-1a.
--   * « Drop du soir » — fenêtre COURTE et À VENIR (+2 h à +3 h). C'est la
--     forme « Drop » du cahier, et elle prouve l'autre moitié de la décision du
--     lot : la PRISE est ouverte dès maintenant, le RETRAIT non.
--
-- STOCK PETIT MAIS PLURIEL (4 et 3) : une unité unique ferait échouer le second
-- parcours d'une même exécution E2E sur `sold_out` plutôt que sur ce qu'il
-- teste, et un stock large ne prouverait jamais que la borne existe. Même
-- arbitrage que la capacité 4 des créneaux.
--
-- `per_player_limit` À 1 sur les deux — c'est le défaut et le sens du module :
-- `mobile-chrome` et `mobile-safari` jouent le même spec EN PARALLÈLE sur la
-- même base, et un plafond plus large laisserait un projet consommer les unités
-- de l'autre sans que l'échec dise pourquoi.
insert into public.reservation_stock_offers
  (id, organization_id, title, description, stock_total,
   window_starts_at, window_ends_at, per_player_limit, status)
values (
  'e2ea0000-0000-4000-8000-0000000000a1', 'e2e10000-0000-4000-8000-000000000001',
  'Tarte du jour E2E',
  'Une part mise de côté, à retirer au comptoir avant la fermeture.', 4,
  now() - interval '1 hour', now() + interval '3 hours', 1, 'open'
)
on conflict (id) do nothing;

insert into public.reservation_stock_offers
  (id, organization_id, title, description, stock_total,
   window_starts_at, window_ends_at, per_player_limit, status)
values (
  'e2ea0000-0000-4000-8000-0000000000a2', 'e2e10000-0000-4000-8000-000000000001',
  'Drop du soir E2E',
  'Trois invendus du jour, à récupérer sur le créneau du soir.', 3,
  now() + interval '2 hours', now() + interval '3 hours', 1, 'open'
)
on conflict (id) do nothing;

-- ── Vitrine — catalogue QR PUBLIÉ (VIT-1a) ──────────────────────────
--
-- Slug 'e2e-comptoir', PUBLIÉ, et servi par l'octroi `vitrine` semé plus haut :
-- les trois conditions de `vitrine_public_state` sont réunies, donc la page
-- publique répond dès le premier `db reset` suivi du seed.
--
-- LA LIGNE DE RÉGLAGES EST INSÉRÉE EN DIRECT et non par `set_vitrine_slug` :
-- la RPC exige un ACTEUR membre et écrit une ligne d'audit, ce qui ferait du
-- seed un faux geste de commerçant dans le journal. C'est le même arbitrage que
-- partout ailleurs dans ce fichier — le seed pose des FAITS, il ne rejoue pas
-- les parcours. Le trigger de publication ne s'y oppose pas : il n'est armé que
-- pour `auth.role() = 'authenticated'`, et le seed tourne en `postgres`.
--
-- DEUX CARTES, TROIS RUBRIQUES, SIX FICHES, et ce n'est pas un nombre rond
-- choisi au hasard :
--   * DEUX cartes prouvent le pluriel du modèle — une seule aurait laissé
--     passer un écran qui ignore `vitrine_menus` et affiche les rubriques à
--     plat ;
--   * une carte à DEUX rubriques et une carte à UNE prouvent que la navigation
--     ne suppose pas un nombre fixe ;
--   * UNE fiche `disponible = false` est indispensable : c'est le seul état que
--     l'écran doit rendre AUTREMENT plutôt que de le masquer, et un jeu de
--     données tout-disponible n'aurait jamais fait échouer un écran qui la
--     fait disparaître.
-- Badges et allergènes sont VARIÉS et couvrent le cas du tableau VIDE, celui
-- qu'un rendu naïf transforme en « [] ».
insert into public.vitrine_settings
  (id, organization_id, slug, published, accroche, histoire, horaires_texte, theme)
values (
  'e2f10000-0000-4000-8000-000000000001', 'e2e10000-0000-4000-8000-000000000001',
  'e2e-comptoir', true,
  'Le comptoir de quartier, torréfaction maison depuis 2019.',
  'Une salle de vingt couverts, une torréfaction au fond, et une carte qui '
  'change avec le marché. On y vient pour le café le matin et pour la cuisine '
  'du midi, jamais pour attendre.',
  E'Lundi au vendredi : 8 h – 16 h\nSamedi : 9 h – 18 h\nDimanche : fermé',
  '{"couleurs":{"primary":"#7c3aed","secondary":"#f59e0b"},'
  '"polices":{"heading":"elegant","body":"sans"},'
  '"style_cartes":"grille",'
  -- LES DEUX PORTES SONT EN QUEUE D'ORDRE (VIT-3), et il FAUT les y écrire :
  -- `ordre_blocs` est une permutation PARTIELLE, donc un bloc absent de la
  -- liste est un bloc MASQUÉ. Cette vitrine portait un ordre explicite depuis
  -- VIT-1a ; sans cette ligne, `reserver` et `experiences` en seraient tombés
  -- par omission — les portes seraient bien rendues par la RPC et invisibles à
  -- l'écran, exactement le mode d'échec qui ressemble à un succès.
  --
  -- EN QUEUE et non en tête : la carte reste ce que le visiteur vient lire, les
  -- portes sont ce qu'il découvre ensuite.
  '"ordre_blocs":["accroche","cartes","histoire","horaires",'
  '"reserver","experiences"]}'::jsonb
)
on conflict (id) do nothing;

-- PAS D'`update` DE RATTRAPAGE ICI, contrairement à la configuration d'attente
-- active de RES-4 — et c'est un arbitrage, pas un oubli. L'insert ci-dessus
-- porte `on conflict (id) do nothing` : sur une base déjà semée SANS reset, il
-- ne fait rien et cette vitrine garde son ordre à quatre blocs. Le rattraper par
-- `update` aurait déclenché `vitrine_settings_touch_updated_at`, donc AVANCÉ
-- `updated_at` — et les trois traductions de réglages, elles aussi protégées par
-- `on conflict do nothing`, seraient restées à leur ancien `version_source` :
-- PÉRIMÉES. La vitrine E2E serait passée sous le seuil de 95 %, le sélecteur de
-- langue aurait disparu, et `vitrine.test.sql` aurait rougi sur une base semée
-- deux fois. Le remède aurait coûté plus cher que le mal.
--
-- LE CHEMIN NOMINAL EST `db reset` PUIS SEED, ensemble, et c'est ce que fait
-- `scripts/verif-complete.sh` : sur une base fraîche, l'ordre à six blocs est
-- posé par l'insert lui-même.

insert into public.vitrine_menus (id, organization_id, nom, ordre, active) values
  ('e2f10000-0000-4000-8000-000000000011', 'e2e10000-0000-4000-8000-000000000001',
   'Carte du midi', 1, true),
  ('e2f10000-0000-4000-8000-000000000012', 'e2e10000-0000-4000-8000-000000000001',
   'Vins & boissons', 2, true)
on conflict (id) do nothing;

insert into public.vitrine_categories (id, menu_id, organization_id, nom, ordre) values
  ('e2f10000-0000-4000-8000-000000000021', 'e2f10000-0000-4000-8000-000000000011',
   'e2e10000-0000-4000-8000-000000000001', 'Entrées', 1),
  ('e2f10000-0000-4000-8000-000000000022', 'e2f10000-0000-4000-8000-000000000011',
   'e2e10000-0000-4000-8000-000000000001', 'Plats', 2),
  ('e2f10000-0000-4000-8000-000000000023', 'e2f10000-0000-4000-8000-000000000012',
   'e2e10000-0000-4000-8000-000000000001', 'Au verre', 1)
on conflict (id) do nothing;

insert into public.vitrine_items
  (id, categorie_id, organization_id, nom, description, prix_affiche,
   badges, allergenes, disponible, ordre)
values
  ('e2f10000-0000-4000-8000-000000000031', 'e2f10000-0000-4000-8000-000000000021',
   'e2e10000-0000-4000-8000-000000000001', 'Velouté de potiron',
   'Crème légère, graines torréfiées maison.', 'à partir de 8 €',
   array['vegetarien', 'sain', 'fait_maison']::text[],
   array['lait', 'celeri']::text[], true, 1),
  ('e2f10000-0000-4000-8000-000000000032', 'e2f10000-0000-4000-8000-000000000021',
   'e2e10000-0000-4000-8000-000000000001', 'Houmous du jour',
   'Pois chiches, citron confit, huile d''olive.', '7 €',
   array['vegan', 'sain']::text[], array['sesame']::text[], true, 2),
  ('e2f10000-0000-4000-8000-000000000033', 'e2f10000-0000-4000-8000-000000000022',
   'e2e10000-0000-4000-8000-000000000001', 'Tartare de bœuf',
   'Coupé au couteau, frites maison.', '19 €',
   array['traditionnel']::text[], array['oeufs', 'moutarde']::text[], true, 1),
  -- LA FICHE ÉPUISÉE. Elle sort quand même de vitrine_public_state, avec son
  -- drapeau : l'écran doit la GRISER, pas la faire disparaître.
  ('e2f10000-0000-4000-8000-000000000034', 'e2f10000-0000-4000-8000-000000000022',
   'e2e10000-0000-4000-8000-000000000001', 'Curry de légumes grillés',
   'Épicé, servi avec un riz complet.', '16 €',
   array['vegan', 'epice', 'grille']::text[],
   array['fruits_a_coque', 'soja']::text[], false, 2),
  -- BADGES ET ALLERGÈNES VIDES : le cas qu'un rendu naïf transforme en « [] ».
  ('e2f10000-0000-4000-8000-000000000035', 'e2f10000-0000-4000-8000-000000000023',
   'e2e10000-0000-4000-8000-000000000001', 'Côtes-du-rhône',
   'Domaine de la Tour, 2023.', '5,5 / 24 €',
   array[]::text[], array['sulfites']::text[], true, 1),
  ('e2f10000-0000-4000-8000-000000000036', 'e2f10000-0000-4000-8000-000000000023',
   'e2e10000-0000-4000-8000-000000000001', 'Limonade artisanale',
   null, '4 €',
   array['nouveau', 'fait_maison']::text[], array[]::text[], true, 2)
on conflict (id) do nothing;

-- ── Vitrine — TRADUCTIONS anglaises, COUVERTURE 100 % (VIT-1b) ──────
--
-- DIX-NEUF LIGNES, C'EST-À-DIRE TOUS les champs traduisibles de cette vitrine :
-- accroche + histoire + horaires des réglages (3), les deux noms de cartes (2),
-- les trois noms de rubriques (3), et les noms et descriptions NON NULLES des
-- six fiches (11 — « Limonade artisanale » n'a pas de description, elle ne
-- compte donc pas). Toutes FRAÎCHES.
--
-- ── POURQUOI PAS UNE SEULE PÉRIMÉE ICI, ALORS QUE C'EST LE COMPORTEMENT
--    PROPRE À CE LOT ──
--
-- Parce que la règle de produit est « sélecteur de langue si la couverture
-- atteint 95 % », et que 18 fraîches sur 19 font 94,7 % : une seule ligne
-- périmée dans ce jeu de données ferait passer la vitrine E2E SOUS le seuil, et
-- le sélecteur disparaîtrait de l'écran — par accident d'arithmétique, pas par
-- décision. Un E2E ne pourrait alors plus observer le cas nominal, qui est
-- justement celui qu'il doit garder.
--
-- LA PÉREMPTION RESTE PROUVÉE, et mieux qu'ici : `vitrine.test.sql` §12e la
-- FABRIQUE — il pose une traduction fraîche, modifie sa cible, et vérifie que le
-- français ressort. Une donnée semée périmée d'avance prouve moins : elle ne
-- montre pas le trigger `touch_updated_at` en train de la périmer.
--
-- `version_source` EST LU DANS LA CIBLE, jamais écrit en dur : recopier `now()`
-- aurait produit une fraîcheur qui dépend de l'ordre des transactions du
-- fichier, et une couverture qui vacille d'un `db reset` à l'autre.
--
-- L'ANGLAIS EST ÉCRIT À LA MAIN, sobre, et il traduit VRAIMENT — c'est ce
-- qu'un écran de démonstration doit montrer. Les noms propres n'en sont pas
-- exemptés : « Côtes-du-Rhône » est son propre rendu anglais, et l'appellation
-- doit quand même porter sa ligne, sinon la couverture ne peut pas atteindre
-- 100 % sur une carte des vins.
insert into public.vitrine_translations
  (id, organization_id, cible_type, cible_id, lang, champ, texte, version_source)
select v.id::uuid, s.organization_id, 'settings', s.id, 'en', v.champ,
       v.texte, s.updated_at
  from public.vitrine_settings s
  cross join (values
    ('e2f10000-0000-4000-8000-000000000f01', 'accroche',
     'The neighbourhood coffee bar, roasting our own beans since 2019.'),
    ('e2f10000-0000-4000-8000-000000000f02', 'histoire',
     'A twenty-seat room, a roaster at the back, and a menu that follows the '
     'market. People come for the coffee in the morning and for lunch at '
     'midday, never to wait.'),
    ('e2f10000-0000-4000-8000-000000000f03', 'horaires_texte',
     E'Monday to Friday: 8 am – 4 pm\nSaturday: 9 am – 6 pm\nSunday: closed')
  ) as v(id, champ, texte)
 where s.id = 'e2f10000-0000-4000-8000-000000000001'
on conflict on constraint vitrine_translations_cible_unique do nothing;

insert into public.vitrine_translations
  (id, organization_id, cible_type, cible_id, lang, champ, texte, version_source)
select v.id::uuid, m.organization_id, 'menu', m.id, 'en', 'nom',
       v.texte, m.updated_at
  from public.vitrine_menus m
  join (values
    ('e2f10000-0000-4000-8000-000000000f04',
     'e2f10000-0000-4000-8000-000000000011', 'Lunch menu'),
    ('e2f10000-0000-4000-8000-000000000f05',
     'e2f10000-0000-4000-8000-000000000012', 'Wine & drinks')
  ) as v(id, cible, texte) on v.cible::uuid = m.id
on conflict on constraint vitrine_translations_cible_unique do nothing;

insert into public.vitrine_translations
  (id, organization_id, cible_type, cible_id, lang, champ, texte, version_source)
select v.id::uuid, k.organization_id, 'categorie', k.id, 'en', 'nom',
       v.texte, k.updated_at
  from public.vitrine_categories k
  join (values
    ('e2f10000-0000-4000-8000-000000000f06',
     'e2f10000-0000-4000-8000-000000000021', 'Starters'),
    ('e2f10000-0000-4000-8000-000000000f07',
     'e2f10000-0000-4000-8000-000000000022', 'Mains'),
    ('e2f10000-0000-4000-8000-000000000f08',
     'e2f10000-0000-4000-8000-000000000023', 'By the glass')
  ) as v(id, cible, texte) on v.cible::uuid = k.id
on conflict on constraint vitrine_translations_cible_unique do nothing;

insert into public.vitrine_translations
  (id, organization_id, cible_type, cible_id, lang, champ, texte, version_source)
select v.id::uuid, i.organization_id, 'item', i.id, 'en', v.champ,
       v.texte, i.updated_at
  from public.vitrine_items i
  join (values
    ('e2f10000-0000-4000-8000-000000000f09',
     'e2f10000-0000-4000-8000-000000000031', 'nom', 'Pumpkin velouté'),
    ('e2f10000-0000-4000-8000-000000000f10',
     'e2f10000-0000-4000-8000-000000000031', 'description',
     'Light cream, house-roasted seeds.'),
    ('e2f10000-0000-4000-8000-000000000f11',
     'e2f10000-0000-4000-8000-000000000032', 'nom', 'Hummus of the day'),
    ('e2f10000-0000-4000-8000-000000000f12',
     'e2f10000-0000-4000-8000-000000000032', 'description',
     'Chickpeas, preserved lemon, olive oil.'),
    ('e2f10000-0000-4000-8000-000000000f13',
     'e2f10000-0000-4000-8000-000000000033', 'nom', 'Beef tartare'),
    ('e2f10000-0000-4000-8000-000000000f14',
     'e2f10000-0000-4000-8000-000000000033', 'description',
     'Hand-cut, with house fries.'),
    ('e2f10000-0000-4000-8000-000000000f15',
     'e2f10000-0000-4000-8000-000000000034', 'nom',
     'Grilled vegetable curry'),
    ('e2f10000-0000-4000-8000-000000000f16',
     'e2f10000-0000-4000-8000-000000000034', 'description',
     'Spicy, served with brown rice.'),
    -- L'APPELLATION EST SON PROPRE RENDU ANGLAIS, et elle porte quand même sa
    -- ligne : sans elle, une carte des vins plafonnerait la couverture sous le
    -- seuil du sélecteur pour la seule raison qu'un nom propre ne se traduit
    -- pas.
    ('e2f10000-0000-4000-8000-000000000f17',
     'e2f10000-0000-4000-8000-000000000035', 'nom', 'Côtes-du-Rhône'),
    ('e2f10000-0000-4000-8000-000000000f18',
     'e2f10000-0000-4000-8000-000000000035', 'description',
     'Domaine de la Tour, 2023 vintage.'),
    -- « Limonade artisanale » n'a PAS de description : une seule ligne pour
    -- elle, et c'est ce qui fait dix-neuf et non vingt.
    ('e2f10000-0000-4000-8000-000000000f19',
     'e2f10000-0000-4000-8000-000000000036', 'nom', 'Craft lemonade')
  ) as v(id, cible, champ, texte) on v.cible::uuid = i.id
on conflict on constraint vitrine_translations_cible_unique do nothing;

-- ══ Vitrine — SECONDE VITRINE, RÉSERVÉE AUX ASSERTIONS PUBLIQUES ══
--
-- ── LE DÉFAUT QU'ELLE CORRIGE ──
--
-- `e2e-comptoir` tenait DEUX rôles incompatibles. C'est la vitrine que le spec
-- dashboard MUTE — il y crée une carte, une rubrique et une fiche, et il
-- enregistre les réglages — et c'est aussi celle sur laquelle les projets
-- Playwright PARALLÈLES assertent la couverture (seuil de 95 %) et l'accroche
-- anglaise. Les deux ne peuvent pas cohabiter :
--   * une fiche neuve non traduite porte le total de dix-neuf à vingt-deux
--     champs traduisibles, donc la couverture à 19/22 = 86 % ;
--   * une sauvegarde des réglages fait avancer `updated_at` par le trigger
--     `touch_updated_at` (20261012120000), ce qui PÉRIME d'un coup les trois
--     traductions des réglages.
-- Dans les deux cas le sélecteur de langue disparaît de la page française et
-- l'assertion anglaise tombe — en course, donc de façon intermittente, et sur
-- un test qui n'a rien demandé.
--
-- `e2e-traduit` est l'autre moitié de la réponse : PUBLIÉE, traduite à 100 %, et
-- hors d'atteinte des specs commerçant.
--
-- ── AUCUN TEST NE DOIT LA MUTER — C'EST LA RÈGLE À TENIR ──
--
-- Cette vitrine est RÉSERVÉE aux assertions publiques : `/v/e2e-traduit`,
-- `/v/e2e-traduit/en`, la couverture et le sélecteur de langue. Toute écriture
-- sur ses réglages, sa carte, sa rubrique ou sa fiche périmerait ses traductions
-- par `touch_updated_at` — silencieusement, sans erreur — et rendrait rouge un
-- test parallèle. Un spec qui a besoin d'ÉCRIRE écrit sur `e2e-comptoir`, dont
-- c'est désormais le seul rôle.
--
-- ── UNE ORGANISATION À ELLE, ET NON « E2E Stripe » ──
--
-- La seule autre organisation semée est `e2e-stripe`, dont le commentaire pose
-- l'invariant que `stripe-webhook.spec.ts` observe : « comp_access=false : le
-- statut Stripe gouverne réellement l'accès ». Lui adosser un octroi de
-- back-office valable un an aurait rendu cette phrase à moitié fausse, et aurait
-- fait dépendre la vitrine publique de l'état d'un abonnement que des webhooks
-- de test manipulent. Une troisième organisation coûte quatre lignes.

insert into public.organizations (id, name, slug, comp_access, timezone)
values ('e2e10000-0000-4000-8000-000000000003', 'E2E Quai', 'e2e-quai', false, 'Europe/Paris')
on conflict (id) do nothing;

-- AUCUN `organization_members`, ET C'EST LA GARANTIE MÉCANIQUE du paragraphe
-- ci-dessus : sans membre, aucun compte E2E ne peut ouvrir le tableau de bord de
-- cette organisation, donc aucun spec commerçant ne PEUT muter cette vitrine —
-- la règle ne repose pas sur la discipline de qui écrira le prochain test.
-- `vitrine_public_state` ne demande d'ailleurs aucun membre : elle exige la
-- publication et le droit, rien d'autre.

-- Le droit `vitrine` par le MÊME chemin qu'`e2e-comptoir` : un octroi daté de
-- back-office. `comp_access = false` et aucun abonnement, donc c'est la PREMIÈRE
-- branche d'`org_has_module_access` — l'octroi vivant — qui ouvre le module, et
-- elle ne consulte aucun état Stripe.
insert into public.organization_module_grants
  (id, organization_id, module, kind, source, starts_at, ends_at)
values (
  'e2ea0000-0000-4000-8000-000000000002', 'e2e10000-0000-4000-8000-000000000003',
  'vitrine', 'pass', 'backoffice', now() - interval '1 day', now() + interval '365 days'
)
on conflict (id) do nothing;

-- UNE CARTE, UNE RUBRIQUE, UNE FICHE, et `histoire` / `horaires_texte` laissés
-- NULS : l'exact contraire de la richesse d'`e2e-comptoir`, et c'est le but. Un
-- champ nul n'est pas traduisible (`vitrine_champs_traduisibles`), il ne pèse
-- donc pas au dénominateur — cinq champs traduisibles en tout, qui se recomptent
-- de tête : accroche, nom de carte, nom de rubrique, nom et description de la
-- fiche. La couverture attendue (5/5 = 100 %) ne dépend d'aucun décompte
-- fragile, alors que 19 en dépendait.
--
-- `theme` est OMIS : la colonne vaut `'{}'::jsonb` par défaut, et « thème par
-- défaut » est justement ce que cette vitrine doit rendre à l'écran.
insert into public.vitrine_settings
  (id, organization_id, slug, published, accroche)
values (
  'e2f20000-0000-4000-8000-000000000001', 'e2e10000-0000-4000-8000-000000000003',
  'e2e-traduit', true,
  'Le bar à vins du quai.'
)
on conflict (id) do nothing;

insert into public.vitrine_menus (id, organization_id, nom, ordre, active) values
  ('e2f20000-0000-4000-8000-000000000011', 'e2e10000-0000-4000-8000-000000000003',
   'La carte', 1, true)
on conflict (id) do nothing;

insert into public.vitrine_categories (id, menu_id, organization_id, nom, ordre) values
  ('e2f20000-0000-4000-8000-000000000021', 'e2f20000-0000-4000-8000-000000000011',
   'e2e10000-0000-4000-8000-000000000003', 'Au verre', 1)
on conflict (id) do nothing;

insert into public.vitrine_items
  (id, categorie_id, organization_id, nom, description, prix_affiche,
   badges, allergenes, disponible, ordre)
values (
  'e2f20000-0000-4000-8000-000000000031', 'e2f20000-0000-4000-8000-000000000021',
  'e2e10000-0000-4000-8000-000000000003', 'Planche du soir',
  'Fromages affinés et charcuterie.', '12 €',
  array['fait_maison']::text[], array['lait']::text[], true, 1
)
on conflict (id) do nothing;

-- ── LES CINQ TRADUCTIONS, ET L'ORDRE QUI LES REND FRAÎCHES ──────────
--
-- CONTRAINTE D'ORDRE, À NE PAS DÉFAIRE : ce bloc doit rester APRÈS toute
-- écriture de ses cibles dans ce fichier. `touch_updated_at` avance `updated_at`
-- à CHAQUE update ; un `update` sur les réglages, la carte, la rubrique ou la
-- fiche placé plus bas dans le seed périmerait donc les cinq lignes posées ici,
-- sans erreur et sans bruit, et la couverture tomberait sous le seuil du
-- sélecteur. C'est pour cette raison que TOUTE cette vitrine forme un bloc
-- contigu en fin de fichier : il n'y a rien après, donc rien qui puisse la
-- périmer.
--
-- `version_source` EST LU DANS LA CIBLE (`s.updated_at`, `m.updated_at`…) et
-- jamais écrit en dur — motif du bloc d'`e2e-comptoir` : recopier `now()`
-- produirait une fraîcheur dépendante de l'ordre des transactions, donc une
-- couverture qui vacille d'un `db reset` à l'autre.
insert into public.vitrine_translations
  (id, organization_id, cible_type, cible_id, lang, champ, texte, version_source)
select 'e2f20000-0000-4000-8000-000000000f01'::uuid, s.organization_id,
       'settings', s.id, 'en', 'accroche',
       'The quayside wine bar.', s.updated_at
  from public.vitrine_settings s
 where s.id = 'e2f20000-0000-4000-8000-000000000001'
on conflict on constraint vitrine_translations_cible_unique do nothing;

insert into public.vitrine_translations
  (id, organization_id, cible_type, cible_id, lang, champ, texte, version_source)
select 'e2f20000-0000-4000-8000-000000000f02'::uuid, m.organization_id,
       'menu', m.id, 'en', 'nom',
       'The menu', m.updated_at
  from public.vitrine_menus m
 where m.id = 'e2f20000-0000-4000-8000-000000000011'
on conflict on constraint vitrine_translations_cible_unique do nothing;

insert into public.vitrine_translations
  (id, organization_id, cible_type, cible_id, lang, champ, texte, version_source)
select 'e2f20000-0000-4000-8000-000000000f03'::uuid, k.organization_id,
       'categorie', k.id, 'en', 'nom',
       'By the glass', k.updated_at
  from public.vitrine_categories k
 where k.id = 'e2f20000-0000-4000-8000-000000000021'
on conflict on constraint vitrine_translations_cible_unique do nothing;

insert into public.vitrine_translations
  (id, organization_id, cible_type, cible_id, lang, champ, texte, version_source)
select v.id::uuid, i.organization_id, 'item', i.id, 'en', v.champ,
       v.texte, i.updated_at
  from public.vitrine_items i
  cross join (values
    ('e2f20000-0000-4000-8000-000000000f04', 'nom', 'Evening board'),
    ('e2f20000-0000-4000-8000-000000000f05', 'description',
     'Aged cheeses and charcuterie.')
  ) as v(id, champ, texte)
 where i.id = 'e2f20000-0000-4000-8000-000000000031'
on conflict on constraint vitrine_translations_cible_unique do nothing;


-- ══ VIT-4 — CONTENUS MIS EN AVANT, ET LES FAITS « RÉSERVER » ══════════
--
-- TOUT CE BLOC PORTE SUR « E2E Café » (e2e10000-…-01) ET SUR ELLE SEULE.
-- `e2e-traduit` (e2f20000-…) n'est TOUCHÉE PAR RIEN ici : c'est la vitrine
-- réservée aux assertions publiques, et sa couverture de traduction à 100 %
-- est ce qui fait apparaître le sélecteur de langue. Une écriture de plus chez
-- elle — même sur une table à part — n'aurait aucune raison d'exister.
--
-- ET AUCUNE ÉCRITURE, NULLE PART, SUR vitrine_settings / _menus / _categories /
-- _items. Ces quatre tables portent le trigger `touch_updated_at` : les toucher
-- ferait avancer leur `updated_at` et PÉRIMER les dix-neuf traductions semées
-- plus haut, exactement l'accident que le commentaire de la ligne 1440 décrit
-- avoir évité. Les contenus mis en avant vivent dans leur propre table, et c'est
-- une des raisons pour lesquelles elle existe.

-- ── Deux contenus mis en avant, rangs 1 et 2 ────────────────────────
-- DEUX et non trois : la table en accepte trois, et un jeu de données qui
-- occupe toutes les places ne permettrait pas de tester l'ajout d'un troisième
-- depuis l'écran. Les adresses sont en `https` — le `check` de la table refuse
-- tout le reste, `http:` compris.
insert into public.vitrine_contenus (id, organization_id, rang, titre, url)
values
  ('e2f30000-0000-4000-8000-000000000001',
   'e2e10000-0000-4000-8000-000000000001', 1,
   'Le comptoir en vidéo', 'https://exemple.test/e2e/comptoir-video'),
  ('e2f30000-0000-4000-8000-000000000002',
   'e2e10000-0000-4000-8000-000000000001', 2,
   'Notre torréfaction, expliquée', 'https://exemple.test/e2e/torrefaction')
on conflict (id) do nothing;

-- ── Deux réservations, pour que les segments réservé/venu disent quelque chose
--
-- SUR UN CRÉNEAU DÉDIÉ, PASSÉ ET FERMÉ, et c'est la précaution centrale de ce
-- bloc. Les quatre créneaux existants sont chacun la fixture d'un parcours E2E
-- précis — capacité pleine pour la liste d'attente, place libre pour la
-- réservation, fenêtre de check-in ouverte pour la caisse — et y glisser deux
-- réservations de plus aurait changé le remplissage que ces parcours lisent.
-- Un créneau `closed` et déjà passé n'est proposé par AUCUNE page publique
-- (`reservation_slot_state` refuse « créneau non ouvert » et « créneau passé »
-- sous le même mot) : il ne peut donc être choisi par aucun spec, et il porte
-- exactement ce qu'on veut ici — de l'HISTORIQUE.
insert into public.reservation_slots
  (id, activity_id, organization_id, starts_at, ends_at, capacity, status)
values (
  'e2f30000-0000-4000-8000-000000000011',
  'e2ea0000-0000-4000-8000-000000000011', 'e2e10000-0000-4000-8000-000000000001',
  now() - interval '7 days', now() - interval '7 days' + interval '30 minutes',
  4, 'closed'
)
on conflict (id) do nothing;

-- GASTON EST DÉJÀ UN CLIENT DU SEED : sa participation (e2e90000-…-01) porte
-- `gaston@e2e.local`, et c'est le SEUL e-mail de `participations` chez E2E Café.
-- C'est ce qui fait de cette ligne une fixture utile : le profil qu'affiche
-- l'écran Clients gagne `a_reserve` ET `est_venu`, sans qu'aucun e-mail nouveau
-- n'entre dans la liste. Poser la réservation sur une adresse inédite n'aurait
-- rien montré du tout — la RPC part des participations, pas des réservations.
--
-- `checked_in_at` est OBLIGATOIRE : `reservations_checkin_state` fait du statut
-- et de la date une ÉQUIVALENCE. `consent_transactional_at` de même dès qu'un
-- e-mail est posé. Le `code` est posé par le trigger `reservations_set_code`,
-- jamais ici.
--
-- NIOUZ1 EST UN ABONNÉ NEWSLETTER (e2e80000-…-01) et n'a jamais joué : sa
-- réservation `confirmed` fait donc bouger le COMPTEUR (`reserve_count`) sans
-- toucher la liste, et elle est l'autre moitié de la démonstration —
-- « a réservé » sans « est venu ».
--
-- CE QUE CE JEU DE DONNÉES NE PRODUIT PAS, ET IL FAUT LE DIRE : `venu_count`
-- vaut 0 sur base semée, parce que le seul « venu » est Gaston et qu'il n'est
-- pas abonné à la newsletter. C'est une conséquence exacte des deux populations
-- (la liste compte des joueurs, le compteur des abonnés), pas un oubli.
insert into public.reservations
  (id, slot_id, organization_id, player_key_hash, email,
   consent_transactional_at, status, checked_in_at)
values
  ('e2f30000-0000-4000-8000-000000000021',
   'e2f30000-0000-4000-8000-000000000011', 'e2e10000-0000-4000-8000-000000000001',
   repeat('7a', 32), 'gaston@e2e.local', now() - interval '7 days',
   'checked_in', now() - interval '7 days'),
  ('e2f30000-0000-4000-8000-000000000022',
   'e2f30000-0000-4000-8000-000000000011', 'e2e10000-0000-4000-8000-000000000001',
   repeat('7b', 32), 'niouz1@e2e.local', now() - interval '7 days',
   'confirmed', null)
on conflict (id) do nothing;
