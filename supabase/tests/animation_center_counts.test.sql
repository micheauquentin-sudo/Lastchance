-- ============================================================
-- COMPTEURS DU CENTRE D'ANIMATION — org_animation_center_counts
--
-- Ce que ce fichier doit prouver, par ordre d'importance :
--
--   1. QU'UN COMMERÇANT NE COMPTE PAS CHEZ SON VOISIN. Une RPC `security
--      definer` fait tomber la RLS de vingt et une tables : si une seule
--      sous-requête oubliait son `organization_id`, le chiffre affiché
--      mélangerait deux établissements sans qu'aucune erreur ne le dise. Les
--      deux organisations de ce fichier portent donc des données SEMBLABLES en
--      nature et DIFFÉRENTES en nombre — un oubli de filtre produit une somme,
--      pas un zéro, et une somme se voit.
--   2. QUE LA PORTE `anon` EST FERMÉE (ADR-082). Lue dans le CATALOGUE, jamais
--      par une tentative d'appel : une fonction dont la garde interne lève
--      « not authorized » se comporte, vue de l'extérieur, EXACTEMENT comme une
--      fonction révoquée. Confondre les deux, c'est croire une porte fermée
--      parce qu'on a entendu quelqu'un crier derrière.
--   3. QUE LA GARDE EST `is_org_editor` ET NON `is_org_member`. Le contre-
--      exemple est un CAISSIER : il est membre, il passe `is_org_member`, et
--      il n'a rien à faire dans le décompte des brouillons de son employeur.
--      Sans cette assertion, remplacer la garde par la plus permissive des deux
--      ne casserait rien de visible.
--   4. QUE « À REMETTRE » COMPTE LES DIX TABLES D'ÉMISSION, et pas neuf. Le
--      calendrier de l'Avent en porte DEUX (`calendar_openings` pour la case du
--      jour, `calendar_rewards` pour l'assiduité) : chaque table contribue ici
--      pour EXACTEMENT UNE unité, si bien que le total attendu — dix — nomme
--      son propre invariant. En oublier une rend 9, ce qui reste plausible.
--   5. QUE LES EXCLUSIONS EXCLUENT VRAIMENT : déjà remis, annulé (les DEUX
--      encodages : `cancelled_at` pour la roue, `status` pour les pronostics),
--      expiré, et sans code (tour perdant, case en rupture, récompense en tours
--      de roue). Chacune est présente dans les fixtures : un compteur naïf
--      rendrait 18 au lieu de 10, et un commerçant irait chercher au comptoir
--      des lots qui n'existent pas.
-- ============================================================
begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

-- Les fixtures s'insèrent SANS JWT marchand : `guard_module_publication` n'est
-- armé que pour `auth.role() = 'authenticated'`, et on veut ici poser des
-- lignes `active` sans acheter de module.
select set_config('request.jwt.claims', '{"role":"service_role"}', true);

-- ════════════════════════════════════════════════════════════
-- 0. LA PORTE, LUE DANS LE CATALOGUE
-- ════════════════════════════════════════════════════════════
select is(
  (select p.prosecdef from pg_catalog.pg_proc p
     join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'org_animation_center_counts'),
  true,
  'org_animation_center_counts est security definer'
);

select is(
  (select pg_catalog.array_to_string(p.proconfig, ',') from pg_catalog.pg_proc p
     join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'org_animation_center_counts'),
  'search_path=""',
  'org_animation_center_counts fige son search_path a la chaine vide'
);

select is(
  has_function_privilege('anon',
    'public.org_animation_center_counts(uuid)', 'execute'),
  false,
  'anon ne peut pas executer org_animation_center_counts'
);

select is(
  has_function_privilege('authenticated',
    'public.org_animation_center_counts(uuid)', 'execute'),
  true,
  'authenticated peut l''executer — la garde interne fait le reste'
);

select is(
  has_function_privilege('service_role',
    'public.org_animation_center_counts(uuid)', 'execute'),
  true,
  'service_role peut l''executer'
);

-- PUBLIC, lu DIRECTEMENT dans l'ACL, et c'est l'assertion qu'ADR-082 réclame.
-- Deux moitiés indissociables :
--   • `proacl is not null` — une ACL NULLE veut dire « privilèges par DÉFAUT »,
--     c'est-à-dire EXECUTE à PUBLIC. C'est l'état d'une fonction fraîchement
--     créée dont on a oublié le `revoke`, et `aclexplode(null)` rend zéro ligne :
--     sans cette première moitié, la seconde verdirait précisément dans le cas
--     qu'elle est censée attraper.
--   • aucune entrée de grantee 0 (0 = PUBLIC dans pg_authid).
select isnt(
  (select p.proacl from pg_catalog.pg_proc p
     join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'org_animation_center_counts'),
  null,
  'l''ACL est POSEE — une ACL nulle vaudrait EXECUTE a PUBLIC par defaut'
);

select is(
  (select count(*)::int
     from pg_catalog.pg_proc p
     join pg_catalog.pg_namespace n on n.oid = p.pronamespace
     cross join lateral pg_catalog.aclexplode(p.proacl) a
    where n.nspname = 'public'
      and p.proname = 'org_animation_center_counts'
      and a.grantee = 0),
  0,
  'PUBLIC ne porte aucun privilege sur la fonction (grantee 0 = PUBLIC)'
);

-- ════════════════════════════════════════════════════════════
-- FIXTURES
--
-- Deux organisations. A porte de quoi faire bouger les cinq compteurs ;
-- B porte les MÊMES natures de données en quantités DIFFÉRENTES — c'est ce
-- qui rend un oubli de filtre `organization_id` visible plutôt que muet.
-- ════════════════════════════════════════════════════════════
insert into public.organizations (id, name, slug) values
  ('ac000000-0000-4000-8000-000000000001', 'Animation A', 'tap-anim-a'),
  ('ac000000-0000-4000-8000-000000000002', 'Animation B', 'tap-anim-b');

insert into auth.users (id, email) values
  ('ac000000-0000-4000-8000-0000000000a1', 'editeur-a@tap-anim.local'),
  ('ac000000-0000-4000-8000-0000000000a2', 'editeur-b@tap-anim.local'),
  ('ac000000-0000-4000-8000-0000000000a3', 'caissier-a@tap-anim.local'),
  ('ac000000-0000-4000-8000-0000000000a4', 'inconnu@tap-anim.local');

insert into public.organization_members (organization_id, user_id, role) values
  ('ac000000-0000-4000-8000-000000000001',
   'ac000000-0000-4000-8000-0000000000a1', 'owner'),
  ('ac000000-0000-4000-8000-000000000002',
   'ac000000-0000-4000-8000-0000000000a2', 'owner'),
  -- Membre de A, mais CAISSIER : le contre-exemple de la garde (point 3).
  ('ac000000-0000-4000-8000-000000000001',
   'ac000000-0000-4000-8000-0000000000a3', 'cashier');
-- `ac…a4` n'est membre de rien : le non-membre du préambule.

-- ── A · les neuf modules ────────────────────────────────────
-- Un brouillon et une publication par module, plus deux états qui ne doivent
-- compter NULLE PART (`archived` pour la roue, `finished` pour les pronostics).
-- Attendu : drafts = 8 (le parrainage n'a pas de brouillon), live = 9.
insert into public.campaigns (id, organization_id, name, status) values
  ('ac000000-0000-4000-8000-000000000101',
   'ac000000-0000-4000-8000-000000000001', 'Roue brouillon', 'draft'),
  ('ac000000-0000-4000-8000-000000000102',
   'ac000000-0000-4000-8000-000000000001', 'Roue en ligne', 'active'),
  -- Ni brouillon ni publiée : une campagne archivée n'est plus un travail à
  -- reprendre. Sans cette ligne, `status <> 'active'` passerait pour `'draft'`.
  ('ac000000-0000-4000-8000-000000000103',
   'ac000000-0000-4000-8000-000000000001', 'Roue archivee', 'archived');

insert into public.hunts (id, organization_id, name, status, reward_label) values
  ('ac000000-0000-4000-8000-000000000110',
   'ac000000-0000-4000-8000-000000000001', 'Chasse brouillon', 'draft', 'Cafe'),
  ('ac000000-0000-4000-8000-000000000111',
   'ac000000-0000-4000-8000-000000000001', 'Chasse en ligne', 'active', 'Cafe');

insert into public.calendars (
  id, organization_id, name, start_date, timezone, day_count, public_slug,
  status, completion_reward_label, completion_reward_stock
) values
  ('ac000000-0000-4000-8000-000000000120',
   'ac000000-0000-4000-8000-000000000001', 'Avent brouillon', current_date,
   'Europe/Paris', 5, 'tap-anim-cal-draft', 'draft', 'Chocolat', 10),
  ('ac000000-0000-4000-8000-000000000121',
   'ac000000-0000-4000-8000-000000000001', 'Avent en ligne', current_date,
   'Europe/Paris', 5, 'tap-anim-cal-live', 'active', 'Chocolat', 10);

insert into public.loyalty_programs (id, organization_id, name, status) values
  ('ac000000-0000-4000-8000-000000000130',
   'ac000000-0000-4000-8000-000000000001', 'Passeport brouillon', 'draft'),
  ('ac000000-0000-4000-8000-000000000131',
   'ac000000-0000-4000-8000-000000000001', 'Passeport en ligne', 'active');

insert into public.quizzes (
  id, organization_id, name, public_slug, status,
  reward_mode, reward_threshold, reward_label, reward_stock
) values
  ('ac000000-0000-4000-8000-000000000140',
   'ac000000-0000-4000-8000-000000000001', 'Quiz brouillon',
   'tap-anim-quiz-draft', 'draft', 'threshold', 3, 'Verre', 10),
  ('ac000000-0000-4000-8000-000000000141',
   'ac000000-0000-4000-8000-000000000001', 'Quiz en ligne',
   'tap-anim-quiz-live', 'active', 'threshold', 3, 'Verre', 10);

insert into public.jackpot_campaigns (
  id, organization_id, name, status, reward_stock
) values
  ('ac000000-0000-4000-8000-000000000150',
   'ac000000-0000-4000-8000-000000000001', 'Cagnotte brouillon', 'draft', 10),
  ('ac000000-0000-4000-8000-000000000151',
   'ac000000-0000-4000-8000-000000000001', 'Cagnotte en ligne', 'active', 10);

insert into public.event_games (id, organization_id, name, status) values
  ('ac000000-0000-4000-8000-000000000160',
   'ac000000-0000-4000-8000-000000000001', 'Soiree brouillon', 'draft'),
  ('ac000000-0000-4000-8000-000000000161',
   'ac000000-0000-4000-8000-000000000001', 'Soiree en ligne', 'active');

insert into public.contests (
  id, organization_id, slug, name, competition_key, status
) values
  ('ac000000-0000-4000-8000-000000000170',
   'ac000000-0000-4000-8000-000000000001', 'tap-anim-prono-draft',
   'Prono brouillon', 'ligue1', 'draft'),
  ('ac000000-0000-4000-8000-000000000171',
   'ac000000-0000-4000-8000-000000000001', 'tap-anim-prono-live',
   'Prono en ligne', 'ligue1', 'active'),
  -- Terminé : porte les lots de la section « à remettre » sans peser sur les
  -- deux premiers compteurs — 'finished' n'est ni un brouillon ni une
  -- publication.
  ('ac000000-0000-4000-8000-000000000172',
   'ac000000-0000-4000-8000-000000000001', 'tap-anim-prono-done',
   'Prono termine', 'ligue1', 'finished');

-- Parrainage : un booléen, et une seule ligne par campagne. Les deux
-- programmes se greffent donc sur des campagnes DÉJÀ comptées ci-dessus, pour
-- que le décompte des campagnes reste celui qu'on a écrit.
insert into public.referral_programs (
  id, campaign_id, organization_id, enabled,
  sponsor_reward_kind, sponsor_reward_label, sponsor_reward_stock
) values
  ('ac000000-0000-4000-8000-000000000180',
   'ac000000-0000-4000-8000-000000000102',
   'ac000000-0000-4000-8000-000000000001', true, 'lot', 'Bon d''achat', 10),
  ('ac000000-0000-4000-8000-000000000181',
   'ac000000-0000-4000-8000-000000000103',
   'ac000000-0000-4000-8000-000000000001', false, 'lot', 'Bon d''achat', 10);

-- ── A · QR codes ────────────────────────────────────────────
-- Attendu : qr_never_scanned = 1.
insert into public.qr_codes (
  id, organization_id, campaign_id, slug, label, scan_count
) values
  ('ac000000-0000-4000-8000-000000000190',
   'ac000000-0000-4000-8000-000000000001',
   'ac000000-0000-4000-8000-000000000102', 'tap-anim-qr-neuf', 'Vitrine', 0),
  ('ac000000-0000-4000-8000-000000000191',
   'ac000000-0000-4000-8000-000000000001',
   'ac000000-0000-4000-8000-000000000102', 'tap-anim-qr-vu', 'Comptoir', 5);

-- ── A · lots de la roue et seuils de stock ──────────────────
-- Attendu : low_stock_prizes = 1 — le prédicat de `prizes_low_stock_watch`,
-- ni plus ni moins : un stock ILLIMITÉ (null) n'alerte pas, un lot SANS seuil
-- non plus, et l'alerte se déclenche à `<=`, pas à `<`.
insert into public.wheels (
  id, organization_id, campaign_id, name, play_limit
) values
  ('ac000000-0000-4000-8000-0000000001a0',
   'ac000000-0000-4000-8000-000000000001',
   'ac000000-0000-4000-8000-000000000102', 'Roue A', 'unlimited');

insert into public.prizes (
  id, organization_id, wheel_id, label, stock, low_stock_threshold
) values
  -- Sans seuil : jamais surveillé, quel que soit le stock.
  ('ac000000-0000-4000-8000-0000000001a1',
   'ac000000-0000-4000-8000-000000000001',
   'ac000000-0000-4000-8000-0000000001a0', 'Cafe offert', 10, null),
  -- Sous le seuil : LE lot attendu.
  ('ac000000-0000-4000-8000-0000000001a2',
   'ac000000-0000-4000-8000-000000000001',
   'ac000000-0000-4000-8000-0000000001a0', 'Croissant', 2, 3),
  -- Au-dessus du seuil.
  ('ac000000-0000-4000-8000-0000000001a3',
   'ac000000-0000-4000-8000-000000000001',
   'ac000000-0000-4000-8000-0000000001a0', 'The', 5, 3),
  -- Stock illimité AVEC un seuil : `stock is null` désarme la surveillance.
  ('ac000000-0000-4000-8000-0000000001a4',
   'ac000000-0000-4000-8000-000000000001',
   'ac000000-0000-4000-8000-0000000001a0', 'Sourire', null, 3);

-- ════════════════════════════════════════════════════════════
-- A · LES DIX TABLES D'ÉMISSION
--
-- Règle de lecture des fixtures : chaque table contribue pour EXACTEMENT UNE
-- unité au total attendu (10), et porte en plus ses cas d'exclusion. Un total
-- de 10 vaut donc « les dix tables sont lues ET les exclusions mordent ».
-- ════════════════════════════════════════════════════════════

-- 1) Roue — la seule famille où le commerçant annule sans effacer la ligne.
insert into public.participations (
  id, organization_id, campaign_id, wheel_id, prize_id,
  first_name, email, accepted_terms, redeem_code, player_key,
  redeemed_at, cancelled_at, redeem_expires_at
) values
  -- ✓ à remettre
  ('ac000000-0000-4000-8000-000000000201',
   'ac000000-0000-4000-8000-000000000001',
   'ac000000-0000-4000-8000-000000000102',
   'ac000000-0000-4000-8000-0000000001a0',
   'ac000000-0000-4000-8000-0000000001a1',
   'Alice', 'alice@tap-anim.local', true, 'GAIN-ANMA2345', repeat('a', 64),
   null, null, null),
  -- ✗ déjà remis
  ('ac000000-0000-4000-8000-000000000202',
   'ac000000-0000-4000-8000-000000000001',
   'ac000000-0000-4000-8000-000000000102',
   'ac000000-0000-4000-8000-0000000001a0',
   'ac000000-0000-4000-8000-0000000001a1',
   'Bob', 'bob@tap-anim.local', true, 'GAIN-ANMB2345', repeat('b', 64),
   now(), null, null),
  -- ✗ ANNULÉ par le commerçant : la ligne vit encore, seul `cancelled_at` dit
  --   qu'elle ne se remet plus. C'est l'assertion explicitement demandée.
  ('ac000000-0000-4000-8000-000000000203',
   'ac000000-0000-4000-8000-000000000001',
   'ac000000-0000-4000-8000-000000000102',
   'ac000000-0000-4000-8000-0000000001a0',
   'ac000000-0000-4000-8000-0000000001a1',
   'Carole', 'carole@tap-anim.local', true, 'GAIN-ANMC2345', repeat('c', 64),
   null, now(), null),
  -- ✗ EXPIRÉ : la caisse le refuserait, le compteur ne doit pas le promettre.
  ('ac000000-0000-4000-8000-000000000204',
   'ac000000-0000-4000-8000-000000000001',
   'ac000000-0000-4000-8000-000000000102',
   'ac000000-0000-4000-8000-0000000001a0',
   'ac000000-0000-4000-8000-0000000001a1',
   'David', 'david@tap-anim.local', true, 'GAIN-ANMD2345', repeat('d', 64),
   null, null, now() - interval '1 hour'),
  -- ✗ TOUR PERDANT : une participation existe, sans lot ni code. C'est le
  --   piège du comptage naïf — il y en a beaucoup plus que de gagnants.
  ('ac000000-0000-4000-8000-000000000205',
   'ac000000-0000-4000-8000-000000000001',
   'ac000000-0000-4000-8000-000000000102',
   'ac000000-0000-4000-8000-0000000001a0',
   null,
   'Eve', 'eve@tap-anim.local', true, null, repeat('e', 64),
   null, null, null);

-- 2) Chasse au trésor.
insert into public.hunt_players (id, hunt_id, organization_id, token_hash) values
  ('ac000000-0000-4000-8000-000000000210',
   'ac000000-0000-4000-8000-000000000111',
   'ac000000-0000-4000-8000-000000000001', repeat('1', 64)),
  ('ac000000-0000-4000-8000-000000000211',
   'ac000000-0000-4000-8000-000000000111',
   'ac000000-0000-4000-8000-000000000001', repeat('2', 64));
insert into public.hunt_completions (
  id, hunt_id, organization_id, player_id, code, redeemed_at
) values
  ('ac000000-0000-4000-8000-000000000212',
   'ac000000-0000-4000-8000-000000000111',
   'ac000000-0000-4000-8000-000000000001',
   'ac000000-0000-4000-8000-000000000210', 'CHASSE-ANMA2345', null),
  ('ac000000-0000-4000-8000-000000000213',
   'ac000000-0000-4000-8000-000000000111',
   'ac000000-0000-4000-8000-000000000001',
   'ac000000-0000-4000-8000-000000000211', 'CHASSE-ANMB2345', now());

-- 3) Fidélité — `reward_type = 'lot'` seul se remet au comptoir ; un palier
--    payé en TOUR DE ROUE porte un jeton, pas un code.
insert into public.loyalty_milestones (
  id, program_id, organization_id, visit_count, reward_type, reward_label,
  reward_stock
) values
  ('ac000000-0000-4000-8000-000000000220',
   'ac000000-0000-4000-8000-000000000131',
   'ac000000-0000-4000-8000-000000000001', 5, 'lot', 'Croissant', 10),
  ('ac000000-0000-4000-8000-000000000221',
   'ac000000-0000-4000-8000-000000000131',
   'ac000000-0000-4000-8000-000000000001', 10, 'spin', 'Un tour', null);
insert into public.loyalty_members (
  id, program_id, organization_id, token_hash
) values
  ('ac000000-0000-4000-8000-000000000222',
   'ac000000-0000-4000-8000-000000000131',
   'ac000000-0000-4000-8000-000000000001', repeat('3', 64));
insert into public.loyalty_rewards (
  id, member_id, program_id, organization_id, milestone_id,
  reward_type, code, grant_token
) values
  ('ac000000-0000-4000-8000-000000000223',
   'ac000000-0000-4000-8000-000000000222',
   'ac000000-0000-4000-8000-000000000131',
   'ac000000-0000-4000-8000-000000000001',
   'ac000000-0000-4000-8000-000000000220', 'lot', 'FIDELITE-ANMA2345', null),
  ('ac000000-0000-4000-8000-000000000224',
   'ac000000-0000-4000-8000-000000000222',
   'ac000000-0000-4000-8000-000000000131',
   'ac000000-0000-4000-8000-000000000001',
   'ac000000-0000-4000-8000-000000000221', 'spin', null, repeat('a', 48));

-- 4) Jackpot collectif.
insert into public.jackpot_wins (
  id, campaign_id, organization_id, cycle, winner_token_hash, code, draw_seed
) values
  ('ac000000-0000-4000-8000-000000000230',
   'ac000000-0000-4000-8000-000000000151',
   'ac000000-0000-4000-8000-000000000001', 1, repeat('4', 64),
   'JACKPOT-ANMA2345', 'graine');

-- 5) et 6) Calendrier — DEUX tables d'émission pour une seule parente.
insert into public.calendar_days (
  id, calendar_id, organization_id, day_index, unlock_at, content_type,
  reward_label, reward_stock
) values
  ('ac000000-0000-4000-8000-000000000240',
   'ac000000-0000-4000-8000-000000000121',
   'ac000000-0000-4000-8000-000000000001', 1, now() - interval '2 days',
   'lot', 'Chocolat', 10),
  ('ac000000-0000-4000-8000-000000000241',
   'ac000000-0000-4000-8000-000000000121',
   'ac000000-0000-4000-8000-000000000001', 2, now() - interval '1 day',
   'lot', 'Chocolat', 0);
insert into public.calendar_players (
  id, calendar_id, organization_id, token_hash
) values
  ('ac000000-0000-4000-8000-000000000242',
   'ac000000-0000-4000-8000-000000000121',
   'ac000000-0000-4000-8000-000000000001', repeat('5', 64));
insert into public.calendar_openings (
  id, player_id, day_id, calendar_id, organization_id, content_type,
  code, out_of_stock
) values
  -- ✓ à remettre
  ('ac000000-0000-4000-8000-000000000243',
   'ac000000-0000-4000-8000-000000000242',
   'ac000000-0000-4000-8000-000000000240',
   'ac000000-0000-4000-8000-000000000121',
   'ac000000-0000-4000-8000-000000000001', 'lot', 'CADEAU-ANMA2345', false),
  -- ✗ case ouverte EN RUPTURE : aucun code n'a été émis, il n'y a rien à
  --   remettre. Un comptage sur `redeemed_at is null` seul la compterait.
  ('ac000000-0000-4000-8000-000000000244',
   'ac000000-0000-4000-8000-000000000242',
   'ac000000-0000-4000-8000-000000000241',
   'ac000000-0000-4000-8000-000000000121',
   'ac000000-0000-4000-8000-000000000001', 'lot', null, true);
insert into public.calendar_rewards (
  id, player_id, calendar_id, organization_id, code
) values
  ('ac000000-0000-4000-8000-000000000245',
   'ac000000-0000-4000-8000-000000000242',
   'ac000000-0000-4000-8000-000000000121',
   'ac000000-0000-4000-8000-000000000001', 'CADEAU-ANMB2345');

-- 7) Mode événement live.
insert into public.event_sessions (
  id, game_id, organization_id, join_code, reward_stock
) values
  ('ac000000-0000-4000-8000-000000000250',
   'ac000000-0000-4000-8000-000000000161',
   'ac000000-0000-4000-8000-000000000001', 'TAPANM', 10);
insert into public.event_wins (
  id, session_id, organization_id, rank, winner_token_hash, code
) values
  ('ac000000-0000-4000-8000-000000000251',
   'ac000000-0000-4000-8000-000000000250',
   'ac000000-0000-4000-8000-000000000001', 1, repeat('6', 64),
   'EVENT-ANMA2345');

-- 8) Parrainage — `kind = 'lot'` seul se remet ; une rupture n'a pas de code.
insert into public.referral_sponsors (
  id, campaign_id, organization_id, sponsor_key, referral_code
) values
  ('ac000000-0000-4000-8000-000000000260',
   'ac000000-0000-4000-8000-000000000102',
   'ac000000-0000-4000-8000-000000000001', repeat('7', 64), 'PR-ANMA2345');
insert into public.referral_rewards (
  id, campaign_id, organization_id, sponsor_id, beneficiary, kind,
  code, out_of_stock
) values
  ('ac000000-0000-4000-8000-000000000261',
   'ac000000-0000-4000-8000-000000000102',
   'ac000000-0000-4000-8000-000000000001',
   'ac000000-0000-4000-8000-000000000260', 'sponsor', 'lot',
   'PARRAIN-ANMA2345', false),
  ('ac000000-0000-4000-8000-000000000262',
   'ac000000-0000-4000-8000-000000000102',
   'ac000000-0000-4000-8000-000000000001',
   'ac000000-0000-4000-8000-000000000260', 'filleul', 'lot',
   null, true);

-- 9) Quiz — un lot émis en rupture n'a pas de code.
insert into public.quiz_players (id, quiz_id, organization_id, token_hash) values
  ('ac000000-0000-4000-8000-000000000270',
   'ac000000-0000-4000-8000-000000000141',
   'ac000000-0000-4000-8000-000000000001', repeat('8', 64)),
  ('ac000000-0000-4000-8000-000000000271',
   'ac000000-0000-4000-8000-000000000141',
   'ac000000-0000-4000-8000-000000000001', repeat('9', 64));
insert into public.quiz_rewards (
  id, quiz_id, organization_id, player_id, source, code, out_of_stock
) values
  ('ac000000-0000-4000-8000-000000000272',
   'ac000000-0000-4000-8000-000000000141',
   'ac000000-0000-4000-8000-000000000001',
   'ac000000-0000-4000-8000-000000000270', 'threshold', 'QUIZ-ANMA2345', false),
  ('ac000000-0000-4000-8000-000000000273',
   'ac000000-0000-4000-8000-000000000141',
   'ac000000-0000-4000-8000-000000000001',
   'ac000000-0000-4000-8000-000000000271', 'threshold', null, true);

-- 10) Pronostics — l'annulation y est portée par `status`, PAS par une colonne
--     dédiée. Un code d'annulation écrit une seule fois, pour la roue,
--     laisserait passer celui-ci.
insert into public.contest_players (
  id, contest_id, organization_id, token_hash, first_name, accepted_terms
) values
  ('ac000000-0000-4000-8000-000000000280',
   'ac000000-0000-4000-8000-000000000172',
   'ac000000-0000-4000-8000-000000000001', repeat('b', 64), 'Fanny', true),
  ('ac000000-0000-4000-8000-000000000281',
   'ac000000-0000-4000-8000-000000000172',
   'ac000000-0000-4000-8000-000000000001', repeat('c', 64), 'Gaston', true),
  ('ac000000-0000-4000-8000-000000000282',
   'ac000000-0000-4000-8000-000000000172',
   'ac000000-0000-4000-8000-000000000001', repeat('d', 64), 'Hugo', true);
insert into public.contest_awards (
  id, contest_id, organization_id, player_id, rank, reward_label, code,
  status, redeem_expires_at
) values
  -- ✓ à remettre
  ('ac000000-0000-4000-8000-000000000283',
   'ac000000-0000-4000-8000-000000000172',
   'ac000000-0000-4000-8000-000000000001',
   'ac000000-0000-4000-8000-000000000280', 1, 'Une bouteille',
   'PRONO-ANMA2345', 'pending', null),
  -- ✗ annulé — second encodage de l'annulation
  ('ac000000-0000-4000-8000-000000000284',
   'ac000000-0000-4000-8000-000000000172',
   'ac000000-0000-4000-8000-000000000001',
   'ac000000-0000-4000-8000-000000000281', 2, 'Un dessert',
   'PRONO-ANMB2345', 'cancelled', null),
  -- ✗ expiré
  ('ac000000-0000-4000-8000-000000000285',
   'ac000000-0000-4000-8000-000000000172',
   'ac000000-0000-4000-8000-000000000001',
   'ac000000-0000-4000-8000-000000000282', 3, 'Un cafe',
   'PRONO-ANMC2345', 'pending', now() - interval '1 hour');

-- ── B · les mêmes natures, d'autres nombres ─────────────────
-- drafts = 2, live = 1, qr_never_scanned = 1, low_stock = 1, à remettre = 1.
-- Les deux compteurs qui valent 1 des DEUX côtés sont volontaires : si le
-- filtre `organization_id` sautait, ils rendraient 2 — un écart franc, là où
-- deux valeurs différentes se seraient contentées de « se ressembler ».
insert into public.campaigns (id, organization_id, name, status) values
  ('ac000000-0000-4000-8000-000000000301',
   'ac000000-0000-4000-8000-000000000002', 'Roue B', 'draft');
insert into public.hunts (id, organization_id, name, status, reward_label) values
  ('ac000000-0000-4000-8000-000000000310',
   'ac000000-0000-4000-8000-000000000002', 'Chasse B brouillon', 'draft', 'The'),
  ('ac000000-0000-4000-8000-000000000311',
   'ac000000-0000-4000-8000-000000000002', 'Chasse B en ligne', 'active', 'The');
insert into public.qr_codes (
  id, organization_id, campaign_id, slug, label, scan_count
) values
  ('ac000000-0000-4000-8000-000000000320',
   'ac000000-0000-4000-8000-000000000002',
   'ac000000-0000-4000-8000-000000000301', 'tap-anim-qr-b', 'Vitrine B', 0);
insert into public.wheels (
  id, organization_id, campaign_id, name, play_limit
) values
  ('ac000000-0000-4000-8000-000000000330',
   'ac000000-0000-4000-8000-000000000002',
   'ac000000-0000-4000-8000-000000000301', 'Roue B', 'unlimited');
insert into public.prizes (
  id, organization_id, wheel_id, label, stock, low_stock_threshold
) values
  ('ac000000-0000-4000-8000-000000000331',
   'ac000000-0000-4000-8000-000000000002',
   'ac000000-0000-4000-8000-000000000330', 'Bonbon B', 1, 5);
insert into public.participations (
  id, organization_id, campaign_id, wheel_id, prize_id,
  first_name, email, accepted_terms, redeem_code, player_key
) values
  ('ac000000-0000-4000-8000-000000000340',
   'ac000000-0000-4000-8000-000000000002',
   'ac000000-0000-4000-8000-000000000301',
   'ac000000-0000-4000-8000-000000000330',
   'ac000000-0000-4000-8000-000000000331',
   'Zoe', 'zoe@tap-anim.local', true, 'GAIN-ANMZ2345', repeat('f', 64));

-- ════════════════════════════════════════════════════════════
-- LA SONDE — on bascule RÉELLEMENT de rôle
--
-- Sous `postgres`, `auth.uid()` est nul et `is_org_editor` rendrait false pour
-- tout le monde : le fichier entier verdirait sur des refus, sans jamais lire
-- un seul compteur. Chaque appel se fait donc sous un JWT nommé.
-- ════════════════════════════════════════════════════════════
create temporary table tap_anim_lecture (
  cas text,
  drafts int,
  live int,
  qr int,
  stock int,
  remettre int,
  erreur text
) on commit drop;

do $sonde$
declare
  r record;
  v_err text;
begin
  -- ── L'éditeur de A, chez A ────────────────────────────────
  perform set_config('request.jwt.claims',
    '{"role":"authenticated","sub":"ac000000-0000-4000-8000-0000000000a1"}', true);
  set local role authenticated;
  select * into r
    from public.org_animation_center_counts('ac000000-0000-4000-8000-000000000001');
  insert into tap_anim_lecture (cas, drafts, live, qr, stock, remettre)
    values ('A chez A', r.drafts, r.live_experiences, r.qr_never_scanned,
            r.low_stock_prizes, r.rewards_to_hand_over);

  -- ── Le même, chez B : refusé ──────────────────────────────
  begin
    select * into r
      from public.org_animation_center_counts('ac000000-0000-4000-8000-000000000002');
    v_err := 'AUCUNE ERREUR — les compteurs du voisin sont lisibles';
  exception when others then
    v_err := sqlerrm;
  end;
  insert into tap_anim_lecture (cas, erreur) values ('A chez B', v_err);

  -- ── Le CAISSIER de A : membre, mais pas éditeur ───────────
  perform set_config('request.jwt.claims',
    '{"role":"authenticated","sub":"ac000000-0000-4000-8000-0000000000a3"}', true);
  begin
    select * into r
      from public.org_animation_center_counts('ac000000-0000-4000-8000-000000000001');
    v_err := 'AUCUNE ERREUR — un caissier compte les brouillons du patron';
  exception when others then
    v_err := sqlerrm;
  end;
  insert into tap_anim_lecture (cas, erreur) values ('caissier A', v_err);

  -- ── Un inconnu, membre de rien ────────────────────────────
  perform set_config('request.jwt.claims',
    '{"role":"authenticated","sub":"ac000000-0000-4000-8000-0000000000a4"}', true);
  begin
    select * into r
      from public.org_animation_center_counts('ac000000-0000-4000-8000-000000000001');
    v_err := 'AUCUNE ERREUR — un non-membre lit les compteurs';
  exception when others then
    v_err := sqlerrm;
  end;
  insert into tap_anim_lecture (cas, erreur) values ('inconnu', v_err);

  -- ── L'éditeur de B, chez B : le CONTRE-EXEMPLE ────────────
  -- Sans lui, « A ne voit pas B » serait indistinguable d'une fonction qui
  -- refuse tout le monde ou rend zéro à tous.
  perform set_config('request.jwt.claims',
    '{"role":"authenticated","sub":"ac000000-0000-4000-8000-0000000000a2"}', true);
  select * into r
    from public.org_animation_center_counts('ac000000-0000-4000-8000-000000000002');
  insert into tap_anim_lecture (cas, drafts, live, qr, stock, remettre)
    values ('B chez B', r.drafts, r.live_experiences, r.qr_never_scanned,
            r.low_stock_prizes, r.rewards_to_hand_over);

  reset role;
  perform set_config('request.jwt.claims', '{"role":"service_role"}', true);
end
$sonde$;
reset role;

-- ════════════════════════════════════════════════════════════
-- 1. LES CINQ COMPTEURS DE A
-- ════════════════════════════════════════════════════════════
select is(
  (select drafts from tap_anim_lecture where cas = 'A chez A'),
  8,
  'drafts = 8 : un brouillon par module a status, ZERO pour le parrainage (booleen)'
);
select is(
  (select live from tap_anim_lecture where cas = 'A chez A'),
  9,
  'live_experiences = 9 : huit status=active plus le parrainage enabled=true'
);
select is(
  (select qr from tap_anim_lecture where cas = 'A chez A'),
  1,
  'qr_never_scanned = 1 : celui a scan_count = 0, pas celui a 5'
);
select is(
  (select stock from tap_anim_lecture where cas = 'A chez A'),
  1,
  'low_stock_prizes = 1 : sous le seuil seulement — ni sans seuil, ni au-dessus, ni stock illimite'
);
select is(
  (select remettre from tap_anim_lecture where cas = 'A chez A'),
  10,
  'rewards_to_hand_over = 10 : UNE unite par table d''emission — les DIX sont lues'
);

-- ════════════════════════════════════════════════════════════
-- 2. LE CLOISONNEMENT, DANS LES DEUX SENS
-- ════════════════════════════════════════════════════════════
select is(
  (select erreur from tap_anim_lecture where cas = 'A chez B'),
  'not authorized',
  'l''editeur de A ne compte RIEN chez B'
);
select is(
  (select erreur from tap_anim_lecture where cas = 'inconnu'),
  'not authorized',
  'un non-membre est refuse'
);
select is(
  (select erreur from tap_anim_lecture where cas = 'caissier A'),
  'not authorized',
  'un CAISSIER de A est refuse : la garde est is_org_editor, pas is_org_member'
);

-- Le contre-exemple : B lit bien SES chiffres, et ce sont les siens — pas la
-- somme des deux organisations, pas zéro.
select is(
  (select drafts from tap_anim_lecture where cas = 'B chez B'),
  2,
  'B compte SES 2 brouillons (et non les 10 des deux organisations)'
);
select is(
  (select live from tap_anim_lecture where cas = 'B chez B'),
  1,
  'B compte SA seule experience publiee'
);
select is(
  (select qr from tap_anim_lecture where cas = 'B chez B'),
  1,
  'B compte SON QR jamais scanne — A en a un aussi, le total ne fait pas 2'
);
select is(
  (select stock from tap_anim_lecture where cas = 'B chez B'),
  1,
  'B compte SON lot en stock faible — A en a un aussi, le total ne fait pas 2'
);
select is(
  (select remettre from tap_anim_lecture where cas = 'B chez B'),
  1,
  'B compte SA seule recompense a remettre, pas les 10 de A'
);

-- ════════════════════════════════════════════════════════════
-- 3. LES EXCLUSIONS, NOMMÉES UNE À UNE
--
-- Le total de 10 les prouve toutes ensemble ; il ne dit pas LAQUELLE a cédé
-- quand il devient 11. Ces témoins comptent la même chose que la RPC, sur la
-- même table, pour que l'écart désigne son responsable.
-- ════════════════════════════════════════════════════════════
select is(
  (select count(*)::int from public.participations p
    where p.organization_id = 'ac000000-0000-4000-8000-000000000001'),
  5,
  'temoin : A porte bien 5 participations, dont UNE SEULE est a remettre'
);
select is(
  (select count(*)::int from public.participations p
    where p.organization_id = 'ac000000-0000-4000-8000-000000000001'
      and p.cancelled_at is not null),
  1,
  'temoin : une participation ANNULEE existe — le 10 ci-dessus l''ignore'
);
select is(
  (select count(*)::int from public.contest_awards a
    where a.organization_id = 'ac000000-0000-4000-8000-000000000001'
      and a.status = 'cancelled'),
  1,
  'temoin : un lot de pronostics ANNULE par status existe — le 10 l''ignore aussi'
);
select is(
  (select count(*)::int from public.calendar_openings o
    where o.organization_id = 'ac000000-0000-4000-8000-000000000001'),
  2,
  'temoin : le calendrier a bien DEUX tables d''emission, et l''une compte pour 1'
);

-- ════════════════════════════════════════════════════════════
-- 4. LE TÉMOIN VIVANT — les compteurs BOUGENT
--
-- Cinq nombres justes une fois peuvent l'être par coïncidence de fixtures.
-- On publie un brouillon, on remet un lot au comptoir, on réapprovisionne un
-- lot : les trois compteurs concernés doivent suivre, et EUX SEULS.
-- ════════════════════════════════════════════════════════════
update public.hunts set status = 'active'
 where id = 'ac000000-0000-4000-8000-000000000110';
update public.hunt_completions set redeemed_at = now()
 where id = 'ac000000-0000-4000-8000-000000000212';
update public.prizes set stock = 9
 where id = 'ac000000-0000-4000-8000-0000000001a2';

do $temoin$
declare r record;
begin
  perform set_config('request.jwt.claims',
    '{"role":"authenticated","sub":"ac000000-0000-4000-8000-0000000000a1"}', true);
  set local role authenticated;
  select * into r
    from public.org_animation_center_counts('ac000000-0000-4000-8000-000000000001');
  reset role;
  perform set_config('request.jwt.claims', '{"role":"service_role"}', true);
  insert into tap_anim_lecture (cas, drafts, live, qr, stock, remettre)
    values ('A apres gestes', r.drafts, r.live_experiences, r.qr_never_scanned,
            r.low_stock_prizes, r.rewards_to_hand_over);
end
$temoin$;
reset role;

select is(
  (select drafts from tap_anim_lecture where cas = 'A apres gestes'),
  7,
  'publier un brouillon le retire des brouillons (8 -> 7)'
);
select is(
  (select live from tap_anim_lecture where cas = 'A apres gestes'),
  10,
  'et l''ajoute aux experiences en ligne (9 -> 10)'
);
select is(
  (select remettre from tap_anim_lecture where cas = 'A apres gestes'),
  9,
  'remettre un lot au comptoir le retire du reste a remettre (10 -> 9)'
);
select is(
  (select stock from tap_anim_lecture where cas = 'A apres gestes'),
  0,
  'reapprovisionner au-dessus du seuil eteint l''alerte de stock (1 -> 0)'
);
select is(
  (select qr from tap_anim_lecture where cas = 'A apres gestes'),
  1,
  'et le compteur de QR, que rien n''a touche, n''a pas bouge'
);

select * from finish();
rollback;
