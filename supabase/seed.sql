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
insert into public.organizations (id, name, slug, comp_access, addon_pronostics, addon_hunts, addon_loyalty, addon_jackpot, addon_events, addon_calendar, addon_referral, timezone)
values (
  'e2e10000-0000-4000-8000-000000000001', 'E2E Café', 'e2e-cafe',
  true, true, true, true, true, true, true, true, 'Europe/Paris'
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
   'e2e10000-0000-4000-8000-000000000001', 0, 'quiz', 'Capitale de la France ?', 20, 1000),
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
insert into public.event_sessions (
  id, game_id, organization_id, label, join_code, status, reward_stock, reward_label, reward_details
) values (
  'e2ed0000-0000-4000-8000-000000000021', 'e2ed0000-0000-4000-8000-000000000001',
  'e2e10000-0000-4000-8000-000000000001', 'Soirée E2E', 'E2EVNT', 'lobby', 3,
  'Tournée offerte', 'À retirer au comptoir E2E.')
on conflict (id) do nothing;

-- ── Calendrier / campagne quotidienne (thème Noël, actif) ─────
-- Un calendrier actif (page suivable À DISTANCE) avec public_slug déterministe
-- (e2e-calendar) et 3 cases : jour 1 ouvrable AUJOURD'HUI (unlock_at passé, une
-- offre 'content'), jour 2 ouvrable AUJOURD'HUI (un lot 'lot' à stock fini), et
-- jour 3 VERROUILLÉ (unlock_at futur → open_calendar_box répond too_early). Le
-- gating serveur se teste sans dépendance : la case future doit refuser
-- l'ouverture. Récompense d'assiduité à stock fini (5). day_count=3.
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
