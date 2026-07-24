-- ============================================================
-- Parrainage ludique — comportement réel des RPC sur base migrée vierge
-- (fixtures locales) :
--   1. Gating : addon coupé / programme désactivé → ensure & validate
--      'unavailable' (pas d'oracle).
--   2. ensure_referral_sponsor : get-or-create idempotent, referral_code STABLE.
--   3. validate_referral chemin heureux : signup créé (preuve = spin PERDANT →
--      un participant non-gagnant compte), jauge++, versement PARRAIN (spin
--      grant) + FILLEUL (lot) émis, COFFRE au 3e filleul.
--   4. Code inconnu → 'invalid'.
--   5. ANTI-CLIC : preuve = spin RÉEL du filleul (gagnant OU perdant, claim NON
--      exigé). Rejet 'no_participation' si autre device / autre campagne / trop
--      ancien / inexistant.
--   6. SELF-PARRAINAGE : même device ET même email → 'self_referral'.
--   7. FILLEUL DUPLIQUÉ : même device ET même email → 'duplicate'.
--   8. BOUCLE A→B→A → 'loop'.
--   9. PLAFOND (sponsor_max_filleuls) → 'capped' ; PÉRIODE (window_days) →
--      'expired'.
--  10. STOCK FINI épuisé (versement filleul) → out_of_stock (aucun code).
--  11. NON-FUITE : referral_public_state d'un parrain n'expose PAS les jetons
--      d'un autre parrain.
--  12. consume_referral_spin_grant : usage unique (spun → already_consumed),
--      jeton étranger / mauvais device → 'unavailable', tirage déterministe.
--  13. Caisse : redeem_referral_reward — lot valide, cross-org = zéro ligne,
--      double retrait refusé, audit.
--  14. Purge RGPD : emails des parrains/filleuls de campagnes archivées neutralisés.
--
-- Note assertions : les champs sont testés À LEUR NIVEAU RÉEL dans le jsonb —
-- state/gauge/sponsor_rewarded/chest_unlocked à la RACINE ; kind/code/out_of_stock
-- DANS le sous-objet filleul_reward/sponsor_reward.
-- ============================================================
begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

select set_config('request.jwt.claims', '{"role":"service_role"}', true);
-- Préfixe UUID hex-valide 'ef…' (fixtures locales à cette transaction, annulée).

-- ── Fixtures ─────────────────────────────────────────────────
insert into public.organizations (id, name, slug, addon_referral, data_retention_months, timezone)
values ('ef000000-0000-4000-8000-000000000001', 'Test Referral', 'tap-referral-org', true, 6, 'Europe/Paris');
-- Seconde organisation (addon on) : cloisonnement de la caisse + programme désactivé.
insert into public.organizations (id, name, slug, addon_referral)
values ('ef000000-0000-4000-8000-0000000000ff', 'Autre Org', 'tap-referral-org-2', true);
-- Troisième organisation : addon COUPÉ (verrou d'addon).
insert into public.organizations (id, name, slug, addon_referral)
values ('ef000000-0000-4000-8000-0000000000fe', 'Sans Addon', 'tap-referral-org-3', false);

-- Campagne roue gagnante (org1) : un lot gagnant (poids 100, STOCK FINI) et un
-- perdant (poids 0) → un tour offert y tire le gain (BORNE 2 : stock fini exigé).
insert into public.campaigns (id, organization_id, name, status)
values ('ef000000-0000-4000-8000-000000000005', 'ef000000-0000-4000-8000-000000000001', 'Campagne roue parrainage', 'active');
insert into public.wheels (id, organization_id, campaign_id, name, play_limit)
values ('ef000000-0000-4000-8000-000000000006', 'ef000000-0000-4000-8000-000000000001',
        'ef000000-0000-4000-8000-000000000005', 'Roue parrainage', 'unlimited');
insert into public.prizes (id, organization_id, wheel_id, label, weight, is_losing, position, stock)
values
  ('ef000000-0000-4000-8000-000000000007', 'ef000000-0000-4000-8000-000000000001',
   'ef000000-0000-4000-8000-000000000006', 'Lot parrainage', 100, false, 0, 100),
  ('ef000000-0000-4000-8000-000000000008', 'ef000000-0000-4000-8000-000000000001',
   'ef000000-0000-4000-8000-000000000006', 'Perdu (jamais tiré)', 0, true, 1, null);

-- Programme actif : seuil 3, plafond 10, fenêtre 30 j. PARRAIN = spin (stock
-- illimité, borné par la roue), FILLEUL = lot (stock 1 → out_of_stock au 2e),
-- COFFRE = lot (stock 5).
insert into public.referral_programs (
  id, campaign_id, organization_id, enabled, chest_threshold, sponsor_max_filleuls, window_days,
  sponsor_reward_kind, sponsor_reward_label,
  filleul_reward_kind, filleul_reward_label, filleul_reward_stock,
  chest_reward_kind, chest_reward_label, chest_reward_stock
) values (
  'ef000000-0000-4000-8000-000000000010', 'ef000000-0000-4000-8000-000000000005',
  'ef000000-0000-4000-8000-000000000001', true, 3, 10, 30,
  'spin', 'Un tour offert',
  'lot', 'Bienvenue filleul', 1,
  'lot', 'Le coffre du parrain', 5
);

-- Campagne + programme sur l'org SANS addon (verrou d'addon).
insert into public.campaigns (id, organization_id, name, status)
values ('ef000000-0000-4000-8000-000000000305', 'ef000000-0000-4000-8000-0000000000fe', 'Campagne sans addon', 'active');
insert into public.referral_programs (id, campaign_id, organization_id, enabled)
values ('ef000000-0000-4000-8000-000000000310', 'ef000000-0000-4000-8000-000000000305',
        'ef000000-0000-4000-8000-0000000000fe', true);

-- Campagne + programme DÉSACTIVÉ sur l'org2 (verrou enabled).
insert into public.campaigns (id, organization_id, name, status)
values ('ef000000-0000-4000-8000-000000000205', 'ef000000-0000-4000-8000-0000000000ff', 'Campagne désactivée', 'active');
insert into public.referral_programs (id, campaign_id, organization_id, enabled)
values ('ef000000-0000-4000-8000-000000000210', 'ef000000-0000-4000-8000-000000000205',
        'ef000000-0000-4000-8000-0000000000ff', false);

-- ── Preuves : SPINS RÉELS du filleul (gagnant OU perdant) ────
-- La preuve anti-clic = un spin RÉEL du device filleul sur la campagne. On
-- utilise ici des spins PERDANTS (is_losing=true, prize_id=null, AUCUNE
-- participation/claim) pour PROUVER qu'un filleul non-gagnant compte désormais
-- comme participant (« participant », pas « inscrit »).
insert into public.spins (id, organization_id, campaign_id, wheel_id, prize_id, is_losing, player_key, claimed, source)
values
  ('ef000000-0000-4000-8000-00000000b001', 'ef000000-0000-4000-8000-000000000001', 'ef000000-0000-4000-8000-000000000005',
   'ef000000-0000-4000-8000-000000000006', null, true, repeat('1', 64), false, 'direct'),
  ('ef000000-0000-4000-8000-00000000b002', 'ef000000-0000-4000-8000-000000000001', 'ef000000-0000-4000-8000-000000000005',
   'ef000000-0000-4000-8000-000000000006', null, true, repeat('2', 64), false, 'direct'),
  ('ef000000-0000-4000-8000-00000000b003', 'ef000000-0000-4000-8000-000000000001', 'ef000000-0000-4000-8000-000000000005',
   'ef000000-0000-4000-8000-000000000006', null, true, repeat('3', 64), false, 'direct'),
  ('ef000000-0000-4000-8000-00000000b004', 'ef000000-0000-4000-8000-000000000001', 'ef000000-0000-4000-8000-000000000005',
   'ef000000-0000-4000-8000-000000000006', null, true, repeat('4', 64), false, 'direct'),
  ('ef000000-0000-4000-8000-00000000b00f', 'ef000000-0000-4000-8000-000000000001', 'ef000000-0000-4000-8000-000000000005',
   'ef000000-0000-4000-8000-000000000006', null, true, repeat('f', 64), false, 'direct');

-- Seconde campagne roue (org1) : héberge une preuve d'une AUTRE campagne.
insert into public.campaigns (id, organization_id, name, status)
values ('ef000000-0000-4000-8000-000000000025', 'ef000000-0000-4000-8000-000000000001', 'Autre campagne roue', 'active');
insert into public.wheels (id, organization_id, campaign_id, name, play_limit)
values ('ef000000-0000-4000-8000-000000000026', 'ef000000-0000-4000-8000-000000000001',
        'ef000000-0000-4000-8000-000000000025', 'Autre roue', 'unlimited');
-- Preuve d'une AUTRE campagne (rejet attendu : campaign_id ≠).
insert into public.spins (id, organization_id, campaign_id, wheel_id, prize_id, is_losing, player_key, claimed, source)
values ('ef000000-0000-4000-8000-00000000d001', 'ef000000-0000-4000-8000-000000000001', 'ef000000-0000-4000-8000-000000000025',
        'ef000000-0000-4000-8000-000000000026', null, true, repeat('99', 32), false, 'direct');
-- Preuve TROP ANCIENNE (hors window_days) sur la campagne (rejet attendu).
insert into public.spins (id, organization_id, campaign_id, wheel_id, prize_id, is_losing, player_key, claimed, source, created_at)
values ('ef000000-0000-4000-8000-00000000d002', 'ef000000-0000-4000-8000-000000000001', 'ef000000-0000-4000-8000-000000000005',
        'ef000000-0000-4000-8000-000000000006', null, true, repeat('77', 32), false, 'direct', now() - interval '100 days');

create temporary table tap_r (r jsonb) on commit drop;
create temporary table tap_code (code text) on commit drop;
create temporary table tap_grant (g text) on commit drop;

-- ══ 1. Gating : addon coupé / programme désactivé ════════════
select is((public.ensure_referral_sponsor(
    'ef000000-0000-4000-8000-000000000305', repeat('a', 64)))->>'state',
  'unavailable', 'ensure refusé quand l''addon est coupé');
select is((public.ensure_referral_sponsor(
    'ef000000-0000-4000-8000-000000000205', repeat('a', 64)))->>'state',
  'unavailable', 'ensure refusé quand le programme est désactivé');
select is((public.validate_referral(
    'ef000000-0000-4000-8000-000000000305', 'PR-AAAAAAAA', repeat('a', 64),
    'ef000000-0000-4000-8000-00000000b001'))->>'state',
  'unavailable', 'validate refusé quand l''addon est coupé');

-- ══ 2. ensure_referral_sponsor : idempotent, code stable ═════
insert into tap_r select public.ensure_referral_sponsor(
  'ef000000-0000-4000-8000-000000000005', repeat('a', 64), 'Parrain-A@Test.Local');
select is((select r->>'state' from tap_r), 'ready', 'ensure valide → ready');
select ok((select r->>'referral_code' ~ '^PR-[A-HJ-NP-Z2-9]{8}$' from tap_r),
  'referral_code au bon format PR-…');
insert into tap_code select r->>'referral_code' from tap_r;
delete from tap_r;
-- Idempotence : même clé → même code, aucun doublon.
select is((public.ensure_referral_sponsor(
    'ef000000-0000-4000-8000-000000000005', repeat('a', 64)))->>'referral_code',
  (select code from tap_code), 'ensure idempotent : referral_code stable');
select is((select count(*)::int from public.referral_sponsors
             where campaign_id = 'ef000000-0000-4000-8000-000000000005'
               and sponsor_key = repeat('a', 64)),
  1, 're-ensure ne crée pas de doublon');
select is((select sponsor_email from public.referral_sponsors
             where campaign_id = 'ef000000-0000-4000-8000-000000000005'
               and sponsor_key = repeat('a', 64)),
  'parrain-a@test.local', 'email parrain normalisé (minuscules) et stocké');

-- ══ 4. Code inconnu → invalid ════════════════════════════════
select is((public.validate_referral(
    'ef000000-0000-4000-8000-000000000005', 'PR-ZZZZZZZZ', repeat('1', 64),
    'ef000000-0000-4000-8000-00000000b001'))->>'state',
  'invalid', 'code de parrainage inconnu → invalid');

-- ══ 3. Chemin heureux : SA parraine F1, F2, F3 ═══════════════
-- F1 : preuve = spin PERDANT (b001, is_losing=true, AUCUNE participation) →
-- PROUVE qu'un filleul non-gagnant (participant, pas « inscrit ») compte.
-- Jauge 1, PARRAIN spin grant, FILLEUL lot (stock 1 → code).
insert into tap_r select public.validate_referral(
  'ef000000-0000-4000-8000-000000000005', (select code from tap_code), repeat('1', 64),
  'ef000000-0000-4000-8000-00000000b001', 'f1@test.local');
select is((select r->>'state' from tap_r), 'validated',
  'F1 validé sur un spin PERDANT (un participant non-gagnant compte)');
select is((select (r->>'gauge')::int from tap_r), 1, 'jauge = 1 après F1');
select is((select (r->>'sponsor_rewarded')::boolean from tap_r), true,
  'versement PARRAIN émis (spin)');
select is((select r->'sponsor_reward'->>'kind' from tap_r), 'spin',
  'versement PARRAIN de type spin (sous-objet)');
select ok((select r->'sponsor_reward'->>'grant' ~ '^[0-9a-f]{48}$' from tap_r),
  'versement PARRAIN : grant_token émis');
select is((select r->'filleul_reward'->>'kind' from tap_r), 'lot',
  'versement FILLEUL de type lot');
select ok((select r->'filleul_reward'->>'code' ~ '^PARRAIN-[A-HJ-NP-Z2-9]{8}$' from tap_r),
  'versement FILLEUL : code PARRAIN-… (stock disponible)');
select is((select (r->>'chest_unlocked')::boolean from tap_r), false,
  'coffre pas encore débloqué (jauge 1 < seuil 3)');
delete from tap_r;
select is((select validated_count from public.referral_sponsors
             where campaign_id = 'ef000000-0000-4000-8000-000000000005' and sponsor_key = repeat('a', 64)),
  1, 'validated_count persisté = 1');

-- F2 : validé, jauge 2, FILLEUL lot en RUPTURE (stock 1 épuisé par F1).
insert into tap_r select public.validate_referral(
  'ef000000-0000-4000-8000-000000000005', (select code from tap_code), repeat('2', 64),
  'ef000000-0000-4000-8000-00000000b002', 'f2@test.local');
select is((select r->>'state' from tap_r), 'validated', 'F2 validé');
select is((select (r->>'gauge')::int from tap_r), 2, 'jauge = 2 après F2');
select is((select (r->'filleul_reward'->>'out_of_stock')::boolean from tap_r), true,
  'versement FILLEUL : stock fini épuisé → out_of_stock');
select is((select r->'filleul_reward'->>'code' from tap_r), null,
  'versement FILLEUL en rupture : aucun code émis');
delete from tap_r;
select is((select filleul_reward_claimed_count from public.referral_programs
             where id = 'ef000000-0000-4000-8000-000000000010'),
  1, 'compteur filleul borné au stock (1, pas de sur-émission)');

-- F3 : validé, jauge 3 → COFFRE débloqué (lot).
insert into tap_r select public.validate_referral(
  'ef000000-0000-4000-8000-000000000005', (select code from tap_code), repeat('3', 64),
  'ef000000-0000-4000-8000-00000000b003', 'f3@test.local');
select is((select r->>'state' from tap_r), 'validated', 'F3 validé');
select is((select (r->>'gauge')::int from tap_r), 3, 'jauge = 3 après F3');
select is((select (r->>'chest_unlocked')::boolean from tap_r), true,
  'coffre débloqué au 3e filleul (seuil)');
select is((select r->'chest_reward'->>'kind' from tap_r), 'lot', 'coffre : versement lot');
select ok((select r->'chest_reward'->>'code' ~ '^PARRAIN-[A-HJ-NP-Z2-9]{8}$' from tap_r),
  'coffre : code PARRAIN-… émis');
delete from tap_r;
select is((select chest_rewarded from public.referral_sponsors
             where campaign_id = 'ef000000-0000-4000-8000-000000000005' and sponsor_key = repeat('a', 64)),
  true, 'chest_rewarded=true (coffre versé une fois)');

-- ══ 5. ANTI-CLIC : preuve = spin RÉEL du filleul ; sinon no_participation ═══
-- Un claim N'est PAS exigé (un spin PERDANT compte, prouvé au chemin heureux).
-- Rejets : autre device / autre campagne / trop ancien / inexistant.
-- (a) preuve d'un AUTRE device (b001 = device F1 ≠ filleul courant).
select is((public.validate_referral(
    'ef000000-0000-4000-8000-000000000005', (select code from tap_code), repeat('88', 32),
    'ef000000-0000-4000-8000-00000000b001'))->>'state',
  'no_participation', 'preuve d''un autre device → no_participation');
-- (b) preuve d'une AUTRE campagne (d001 sur campagne 2, MÊME device).
select is((public.validate_referral(
    'ef000000-0000-4000-8000-000000000005', (select code from tap_code), repeat('99', 32),
    'ef000000-0000-4000-8000-00000000d001'))->>'state',
  'no_participation', 'preuve d''une autre campagne → no_participation');
-- (c) preuve TROP ANCIENNE (d002, hors window_days, MÊME device et campagne).
select is((public.validate_referral(
    'ef000000-0000-4000-8000-000000000005', (select code from tap_code), repeat('77', 32),
    'ef000000-0000-4000-8000-00000000d002'))->>'state',
  'no_participation', 'preuve trop ancienne (hors window_days) → no_participation');
-- (d) preuve inexistante (uuid aléatoire).
select is((public.validate_referral(
    'ef000000-0000-4000-8000-000000000005', (select code from tap_code), repeat('66', 32),
    'ef000000-0000-4000-8000-000000009999'))->>'state',
  'no_participation', 'preuve inexistante → no_participation');
select is((select count(*)::int from public.referral_signups
             where filleul_key in (repeat('88', 32), repeat('99', 32), repeat('77', 32), repeat('66', 32))),
  0, 'anti-clic : aucun signup créé sur preuve invalide');
select is((select validated_count from public.referral_sponsors
             where campaign_id = 'ef000000-0000-4000-8000-000000000005' and sponsor_key = repeat('a', 64)),
  3, 'anti-clic : jauge inchangée (reste 3)');

-- ══ 6-7. SELF-PARRAINAGE / DUPLICATE (parrain SB) ════════════
create temporary table tap_sb (code text) on commit drop;
insert into tap_sb select public.ensure_referral_sponsor(
  'ef000000-0000-4000-8000-000000000005', repeat('b', 64), 'sb@test.local')->>'referral_code';
-- Self device : filleul_key = sponsor_key.
select is((public.validate_referral(
    'ef000000-0000-4000-8000-000000000005', (select code from tap_sb), repeat('b', 64),
    'ef000000-0000-4000-8000-00000000b004'))->>'state',
  'self_referral', 'self-parrainage (même device) refusé');
-- Self email : filleul_email = email du parrain.
select is((public.validate_referral(
    'ef000000-0000-4000-8000-000000000005', (select code from tap_sb), repeat('4', 64),
    'ef000000-0000-4000-8000-00000000b004', 'SB@test.local'))->>'state',
  'self_referral', 'self-parrainage (même email) refusé');
-- Validation réelle de F4 (avec email) par SB → jauge SB 1.
select is((public.validate_referral(
    'ef000000-0000-4000-8000-000000000005', (select code from tap_sb), repeat('4', 64),
    'ef000000-0000-4000-8000-00000000b004', 'f4@test.local'))->>'state',
  'validated', 'SB valide F4');
-- Duplicate device : re-valider F4.
select is((public.validate_referral(
    'ef000000-0000-4000-8000-000000000005', (select code from tap_sb), repeat('4', 64),
    'ef000000-0000-4000-8000-00000000b004'))->>'state',
  'duplicate', 'filleul dupliqué (même device) refusé');
-- Duplicate email : nouveau device, email de F4 (retourne avant la preuve).
select is((public.validate_referral(
    'ef000000-0000-4000-8000-000000000005', (select code from tap_sb), repeat('5', 64),
    'ef000000-0000-4000-8000-000000009999', 'f4@test.local'))->>'state',
  'duplicate', 'filleul dupliqué (même email) refusé');

-- ══ 11. NON-FUITE : state de SA n'expose pas les jetons de SB ══
-- Le jeton PARRAIN de SB (émis en validant F4) ne doit pas apparaître dans l'état
-- public de SA.
create temporary table tap_sbgrant (g text) on commit drop;
insert into tap_sbgrant select spin_grant_token from public.referral_rewards
 where beneficiary = 'sponsor' and spin_grant_token is not null
   and sponsor_id = (select id from public.referral_sponsors
     where campaign_id = 'ef000000-0000-4000-8000-000000000005' and sponsor_key = repeat('b', 64));
insert into tap_r select public.referral_public_state(
  'ef000000-0000-4000-8000-000000000005', repeat('a', 64));
select is((select r->>'state' from tap_r), 'ok', 'referral_public_state OK pour SA');
select is((select (r->>'gauge')::int from tap_r), 3, 'state SA : jauge 3');
select ok((select not exists (
    select 1 from jsonb_array_elements((select r->'rewards' from tap_r)) e
     where e->>'spin_grant_token' = (select g from tap_sbgrant))),
  'non-fuite : le jeton de SB n''apparaît pas dans l''état de SA');
select ok((select exists (
    select 1 from jsonb_array_elements((select r->'rewards' from tap_r)) e
     where e->>'beneficiary' = 'sponsor')),
  'state SA : ses propres versements sponsor présents');
delete from tap_r;

-- ══ 8. BOUCLE A→B→A ══════════════════════════════════════════
-- SE (clé e) parraine KF (clé f) ; puis SF (clé f) tente de parrainer SE (clé e).
create temporary table tap_se (code text) on commit drop;
insert into tap_se select public.ensure_referral_sponsor(
  'ef000000-0000-4000-8000-000000000005', repeat('e', 64))->>'referral_code';
select is((public.validate_referral(
    'ef000000-0000-4000-8000-000000000005', (select code from tap_se), repeat('f', 64),
    'ef000000-0000-4000-8000-00000000b00f'))->>'state',
  'validated', 'SE parraine KF (prépare la boucle)');
create temporary table tap_sf (code text) on commit drop;
insert into tap_sf select public.ensure_referral_sponsor(
  'ef000000-0000-4000-8000-000000000005', repeat('f', 64))->>'referral_code';
select is((public.validate_referral(
    'ef000000-0000-4000-8000-000000000005', (select code from tap_sf), repeat('e', 64),
    'ef000000-0000-4000-8000-00000000b00f'))->>'state',
  'loop', 'réciprocité directe A→B→A refusée (loop)');

-- ══ 9. PLAFOND (capped) / PÉRIODE (expired) ══════════════════
insert into public.referral_sponsors (id, campaign_id, organization_id, sponsor_key, referral_code, validated_count)
values ('ef000000-0000-4000-8000-0000000000c1', 'ef000000-0000-4000-8000-000000000005',
        'ef000000-0000-4000-8000-000000000001', repeat('c', 64), 'PR-CAPPED22', 10);
select is((public.validate_referral(
    'ef000000-0000-4000-8000-000000000005', 'PR-CAPPED22', repeat('1', 64),
    'ef000000-0000-4000-8000-00000000b001'))->>'state',
  'capped', 'plafond sponsor_max_filleuls atteint → capped');
insert into public.referral_sponsors (id, campaign_id, organization_id, sponsor_key, referral_code, created_at)
values ('ef000000-0000-4000-8000-0000000000d1', 'ef000000-0000-4000-8000-000000000005',
        'ef000000-0000-4000-8000-000000000001', repeat('d', 64), 'PR-EXPRED22', now() - interval '40 days');
select is((public.validate_referral(
    'ef000000-0000-4000-8000-000000000005', 'PR-EXPRED22', repeat('1', 64),
    'ef000000-0000-4000-8000-00000000b001'))->>'state',
  'expired', 'période window_days dépassée → expired');

-- ══ 12. consume_referral_spin_grant : usage unique ═══════════
insert into tap_grant select spin_grant_token from public.referral_rewards
 where beneficiary = 'sponsor' and spin_grant_token is not null and grant_consumed_at is null
   and sponsor_id = (select id from public.referral_sponsors
     where campaign_id = 'ef000000-0000-4000-8000-000000000005' and sponsor_key = repeat('a', 64))
 limit 1;
-- Jeton inconnu → unavailable.
select is((public.consume_referral_spin_grant(
    'ef000000-0000-4000-8000-000000000005', repeat('a', 64), repeat('0', 48)))->>'state',
  'unavailable', 'jeton inconnu → unavailable');
-- Bon jeton, MAUVAIS device (clé d'un filleul) → unavailable (liaison device).
select is((public.consume_referral_spin_grant(
    'ef000000-0000-4000-8000-000000000005', repeat('1', 64), (select g from tap_grant)))->>'state',
  'unavailable', 'jeton d''un parrain consommé avec un autre device → unavailable');
-- Bon jeton, bon device → spun (tirage déterministe sur le lot gagnant).
insert into tap_r select public.consume_referral_spin_grant(
  'ef000000-0000-4000-8000-000000000005', repeat('a', 64), (select g from tap_grant));
select is((select r->>'state' from tap_r), 'spun', 'tour offert consommé → spun');
select is((select (r->>'is_losing')::boolean from tap_r), false,
  'tirage déterministe : lot gagnant');
delete from tap_r;
-- Second appel → already_consumed (anti-rejeu).
select is((public.consume_referral_spin_grant(
    'ef000000-0000-4000-8000-000000000005', repeat('a', 64), (select g from tap_grant)))->>'state',
  'already_consumed', 'jeton déjà consommé → already_consumed');
select is((select source from public.spins
             where player_key = repeat('a', 64) and source = 'referral' limit 1),
  'referral', 'le spin du tour offert porte source=referral');

-- ══ 13. Caisse : redeem_referral_reward ══════════════════════
-- Code du versement FILLEUL de F1 (lot).
create temporary table tap_lot (code text) on commit drop;
insert into tap_lot select code from public.referral_rewards
 where beneficiary = 'filleul' and kind = 'lot' and code is not null
   and signup_id = (select id from public.referral_signups
     where campaign_id = 'ef000000-0000-4000-8000-000000000005' and filleul_key = repeat('1', 64));
-- Cross-org → aucune ligne.
select is((select count(*)::int from public.redeem_referral_reward(
    'ef000000-0000-4000-8000-0000000000ff', (select code from tap_lot), 'caisse-autre')),
  0, 'code d''une autre organisation : aucune ligne');
-- Retrait valide (insensible à la casse).
select is((select redeemed_now from public.redeem_referral_reward(
    'ef000000-0000-4000-8000-000000000001', lower((select code from tap_lot)), 'caisse-1')),
  true, 'lot parrainage : retrait valide');
-- Double retrait refusé.
select is((select redeemed_now from public.redeem_referral_reward(
    'ef000000-0000-4000-8000-000000000001', (select code from tap_lot), 'caisse-1')),
  false, 'lot parrainage : pas de double retrait');
select ok(exists (select 1 from public.audit_logs
             where organization_id = 'ef000000-0000-4000-8000-000000000001'
               and action = 'referral.redeem'),
  'le retrait est audité');

-- ══ 14. Purge RGPD ═══════════════════════════════════════════
-- Campagne archivée + rétention 6 mois : parrains/filleuls créés il y a 7 mois →
-- emails neutralisés (hash device conservés).
update public.campaigns set status = 'archived'
 where id = 'ef000000-0000-4000-8000-000000000005';
update public.referral_sponsors set created_at = now() - interval '7 months'
 where campaign_id = 'ef000000-0000-4000-8000-000000000005';
update public.referral_signups set created_at = now() - interval '7 months'
 where campaign_id = 'ef000000-0000-4000-8000-000000000005';
select ok(public.purge_expired_referral_data() >= 2,
  'purge neutralise les emails des campagnes archivées au-delà de la rétention');
select is((select count(*)::int from public.referral_sponsors
             where campaign_id = 'ef000000-0000-4000-8000-000000000005' and sponsor_email is not null),
  0, 'emails parrains purgés');
select is((select count(*)::int from public.referral_signups
             where campaign_id = 'ef000000-0000-4000-8000-000000000005' and filleul_email is not null),
  0, 'emails filleuls purgés');
select ok((select count(*) > 0 from public.referral_sponsors
             where campaign_id = 'ef000000-0000-4000-8000-000000000005'),
  'les parrains subsistent (hash device conservé, seule la PII est neutralisée)');

select * from finish();
rollback;
