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
insert into public.organizations (id, name, slug, comp_access, addon_pronostics, timezone)
values (
  'e2e10000-0000-4000-8000-000000000001', 'E2E Café', 'e2e-cafe',
  true, true, 'Europe/Paris'
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
insert into public.prizes (id, organization_id, wheel_id, label, description, color, weight, is_losing, position) values
  ('e2e40000-0000-4000-8000-000000000001', 'e2e10000-0000-4000-8000-000000000001',
   'e2e30000-0000-4000-8000-000000000001', 'Café offert E2E', 'Gain déterministe.', '#f59e0b', 100, false, 0),
  ('e2e40000-0000-4000-8000-000000000002', 'e2e10000-0000-4000-8000-000000000001',
   'e2e30000-0000-4000-8000-000000000001', 'Perdu (jamais tiré)', '', '#64748b', 0, true, 1)
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

insert into public.prizes (id, organization_id, wheel_id, label, description, color, weight, is_losing, position) values
  ('e2e40000-0000-4000-8000-000000000005', 'e2e10000-0000-4000-8000-000000000001',
   'e2e30000-0000-4000-8000-000000000003', 'Dessert offert E2E', 'Gain grattage.', '#ec4899', 100, false, 0),
  ('e2e40000-0000-4000-8000-000000000006', 'e2e10000-0000-4000-8000-000000000001',
   'e2e30000-0000-4000-8000-000000000003', 'Perdu (jamais tiré)', '', '#64748b', 0, true, 1)
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
