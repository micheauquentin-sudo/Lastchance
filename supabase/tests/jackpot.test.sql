-- ============================================================
-- Jackpot collectif — comportement réel des RPC sur base migrée
-- vierge (fixtures locales) :
--   1. Indisponibilité : addon coupé / campagne non active → 'unavailable',
--      sans oracle et sans créer de joueur ; mode staff sans validateur →
--      'unavailable' (chemin public fermé).
--   2. Jauge PARTAGÉE : incrément atomique de +1 par participation, reflété
--      dans la réponse ET la colonne current_count ; montant d'affichage
--      croissant (display_base + count · display_increment).
--   3. threshold_draw : au seuil atteint, tirage → EXACTEMENT 1 gagnant, code
--      JACKPOT-…, cycle incrémenté, jauge remise à 0, stock décrémenté ; le
--      gagnant est l'un des participants du cycle.
--   4. rescan_win : la participation qui ARME (count = seuil) ne gagne pas ;
--      la suivante gagne (win_probability = 1 → déterministe) → 1 gagnant.
--   5. date_draw : aucun tirage à la participation ; run_jackpot_date_draws()
--      (le job pg_cron) tire à draw_at échu → 1 gagnant.
--   6. Stock FINI épuisé (ADR-031) : au seuil suivant, reward_claimed_count >=
--      reward_stock → out_of_stock, AUCUN nouveau tirage.
--   7. Cooldown : seconde participation d'un même joueur avant l'échéance →
--      'too_soon' avec retry_in_seconds.
--   8. Code tournant : longueur invalide → 'invalid_code' ; hors fenêtre →
--      'invalid_code' ; code courant (current_jackpot_code) → 'recorded' ;
--      aucun joueur créé par un code refusé.
--   9. Unicité du code de gain (contrainte + codes distincts émis).
--  10. Caisse : redeem_jackpot_prize atomique, auditée, insensible à la casse ;
--      déjà remis ou autre organisation → refus générique ; actor obligatoire.
--  11. Purge RGPD : purge_expired_jackpot_players supprime les joueurs
--      dormants au-delà de la rétention (dernière activité).
-- ============================================================
begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

select set_config('request.jwt.claims', '{"role":"service_role"}', true);

-- Réplique locale de la troncature TOTP de la RPC : fabrique un code pour un
-- compteur ARBITRAIRE (dont un hors fenêtre) de façon déterministe. Le chemin
-- « valide » passe par current_jackpot_code (test croisé des deux).
create function pg_temp.tap_jackpot_code(p_secret bytea, p_counter bigint)
returns text language plpgsql as $$
declare v_mac bytea; v_off integer; v_bin bigint;
begin
  v_mac := extensions.hmac(int8send(p_counter), p_secret, 'sha1');
  v_off := get_byte(v_mac, 19) & 15;
  v_bin := ((get_byte(v_mac, v_off) & 127)::bigint * 16777216)
         + (get_byte(v_mac, v_off + 1)::bigint * 65536)
         + (get_byte(v_mac, v_off + 2)::bigint * 256)
         + (get_byte(v_mac, v_off + 3)::bigint);
  return lpad((v_bin % 1000000)::text, 6, '0');
end $$;

create function pg_temp.tap_counter() returns bigint language sql as $$
  select floor(extract(epoch from now()) / 60)::bigint;
$$;

-- Identité staff factice (la RPC exige seulement un p_validated_by non-null ;
-- l'autorisation réelle est faite côté backend).
-- ── Fixtures ─────────────────────────────────────────────────
insert into public.organizations (id, name, slug, addon_jackpot)
values ('da000000-0000-4000-8000-000000000001', 'Test Jackpot', 'tap-jackpot', true);
-- Seconde organisation : preuve du cloisonnement de la caisse.
insert into public.organizations (id, name, slug, addon_jackpot)
values ('da000000-0000-4000-8000-000000000031', 'Autre Org', 'tap-jackpot-2', true);

-- Campagne T : threshold_draw, staff, seuil 3, stock 1, jackpot croissant.
insert into public.jackpot_campaigns (
  id, organization_id, name, status, validation_mode,
  min_participation_interval_seconds, draw_mode, threshold, reward_stock,
  reward_label, display_base_cents, display_increment_cents
) values (
  'da000000-0000-4000-8000-000000000002',
  'da000000-0000-4000-8000-000000000001',
  'Cagnotte comptoir', 'active', 'staff', 300, 'threshold_draw', 3, 1,
  'Panier garni', 1000, 100
);

-- Campagne R : rescan_win, staff, seuil 2, proba 1 (gain déterministe une fois
-- armé), stock 5.
insert into public.jackpot_campaigns (
  id, organization_id, name, status, validation_mode,
  min_participation_interval_seconds, draw_mode, threshold, win_probability,
  reward_stock, reward_label
) values (
  'da000000-0000-4000-8000-000000000003',
  'da000000-0000-4000-8000-000000000001',
  'Cagnotte rescan', 'active', 'staff', 300, 'rescan_win', 2, 1.0, 5, 'Bon d''achat'
);

-- Campagne D : date_draw, staff, draw_at déjà passé, stock 1.
insert into public.jackpot_campaigns (
  id, organization_id, name, status, validation_mode,
  min_participation_interval_seconds, draw_mode, threshold, draw_at,
  reward_stock, reward_label
) values (
  'da000000-0000-4000-8000-000000000004',
  'da000000-0000-4000-8000-000000000001',
  'Cagnotte à date', 'active', 'staff', 300, 'date_draw', 100,
  now() - interval '1 hour', 1, 'Menu offert'
);

-- Campagne C : rotating_code, secret connu, période 60 s, seuil élevé (pas de
-- tirage pendant le test de code), stock 1.
insert into public.jackpot_campaigns (
  id, organization_id, name, status, validation_mode,
  rotating_secret, rotating_period_seconds, min_participation_interval_seconds,
  draw_mode, threshold, reward_stock, reward_label
) values (
  'da000000-0000-4000-8000-000000000005',
  'da000000-0000-4000-8000-000000000001',
  'Cagnotte code', 'active', 'rotating_code',
  decode('00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff', 'hex'),
  60, 300, 'threshold_draw', 1000, 1, 'Café offert'
);

-- Le trigger a-t-il conservé le secret fourni (service role) ?
select is(
  (select rotating_secret from public.jackpot_campaigns
    where id = 'da000000-0000-4000-8000-000000000005'),
  decode('00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff', 'hex'),
  'le secret fourni par le service role est conservé (trigger no-op)');

create temporary table tap_r (r jsonb) on commit drop;

-- ══ 1. Indisponibilité (aucun joueur créé) ═══════════════════
update public.organizations set addon_jackpot = false
 where id = 'da000000-0000-4000-8000-000000000001';
select is((public.record_jackpot_participation(
    'da000000-0000-4000-8000-000000000002', repeat('a', 64), null,
    'da000000-0000-4000-8000-0000000000aa'))->>'state',
  'unavailable', 'addon coupé : unavailable');
update public.organizations set addon_jackpot = true
 where id = 'da000000-0000-4000-8000-000000000001';

update public.jackpot_campaigns set status = 'draft'
 where id = 'da000000-0000-4000-8000-000000000002';
select is((public.record_jackpot_participation(
    'da000000-0000-4000-8000-000000000002', repeat('a', 64), null,
    'da000000-0000-4000-8000-0000000000aa'))->>'state',
  'unavailable', 'campagne en brouillon : unavailable');
update public.jackpot_campaigns set status = 'active'
 where id = 'da000000-0000-4000-8000-000000000002';

-- Mode staff sans validateur : chemin public fermé.
select is((public.record_jackpot_participation(
    'da000000-0000-4000-8000-000000000002', repeat('a', 64)))->>'state',
  'unavailable', 'staff sans validateur : unavailable');

select is((select count(*) from public.jackpot_players
            where campaign_id = 'da000000-0000-4000-8000-000000000002'),
  0::bigint, 'aucun joueur créé par une participation indisponible');

-- ══ 2. Jauge partagée : incrément atomique + affichage ═══════
delete from tap_r;
insert into tap_r select public.record_jackpot_participation(
  'da000000-0000-4000-8000-000000000002', repeat('a', 64), null,
  'da000000-0000-4000-8000-0000000000aa');
select is((select r->>'state' from tap_r), 'recorded', 'participation 1 : recorded');
select is((select r->>'current_count' from tap_r), '1', 'jauge = 1 après la 1re participation');
select is((select r->>'is_new_player' from tap_r), 'true', 'is_new_player = true à la création');
select is((select r->>'display_amount_cents' from tap_r), '1100',
  'montant affiché = base 1000 + 1·100');

delete from tap_r;
insert into tap_r select public.record_jackpot_participation(
  'da000000-0000-4000-8000-000000000002', repeat('b', 64), null,
  'da000000-0000-4000-8000-0000000000aa');
select is((select r->>'current_count' from tap_r), '2',
  'jauge = 2 après la 2e participation (incrément atomique partagé)');
select is((select current_count from public.jackpot_campaigns
            where id = 'da000000-0000-4000-8000-000000000002'),
  2, 'la colonne current_count reflète la jauge partagée');

-- ══ 3. threshold_draw : seuil atteint → 1 gagnant ════════════
delete from tap_r;
insert into tap_r select public.record_jackpot_participation(
  'da000000-0000-4000-8000-000000000002', repeat('c', 64), null,
  'da000000-0000-4000-8000-0000000000aa');
select is((select r->>'state' from tap_r), 'recorded', 'participation au seuil : recorded');
select is((select count(*) from public.jackpot_wins
            where campaign_id = 'da000000-0000-4000-8000-000000000002'),
  1::bigint, 'le tirage au seuil produit EXACTEMENT 1 gagnant');
select is((select cycle from public.jackpot_wins
            where campaign_id = 'da000000-0000-4000-8000-000000000002'),
  1, 'le gain porte le cycle 1');
select matches(
  (select code from public.jackpot_wins
    where campaign_id = 'da000000-0000-4000-8000-000000000002'),
  '^JACKPOT-[A-HJ-NP-Z2-9]{8}$', 'code de gain au format JACKPOT-…');
select ok(
  (select winner_token_hash from public.jackpot_wins
    where campaign_id = 'da000000-0000-4000-8000-000000000002')
   in (repeat('a',64), repeat('b',64), repeat('c',64)),
  'le gagnant est un des participants du cycle');
select is((select current_count from public.jackpot_campaigns
            where id = 'da000000-0000-4000-8000-000000000002'),
  0, 'la jauge est remise à 0 après le tirage');
select is((select cycle from public.jackpot_campaigns
            where id = 'da000000-0000-4000-8000-000000000002'),
  2, 'le cycle passe à 2 après le tirage');
select is((select reward_claimed_count from public.jackpot_campaigns
            where id = 'da000000-0000-4000-8000-000000000002'),
  1, 'le stock est décrémenté (1 lot émis)');
-- Le tirage est UNIFORME parmi les participants du cycle : le déclencheur
-- (joueur c) n'est pas forcément le gagnant. On vérifie la COHÉRENCE du drapeau
-- is_winner avec le gagnant réellement tiré, pas une valeur fixe.
select is(
  (select (r->>'is_winner')::boolean from tap_r),
  (select winner_token_hash = repeat('c', 64) from public.jackpot_wins
    where campaign_id = 'da000000-0000-4000-8000-000000000002'),
  'is_winner du déclencheur cohérent avec le tirage');

-- ══ 6. Stock FINI épuisé → plus de tirage (ADR-031) ══════════
-- Cycle 2 de la campagne T : 3 nouvelles participations atteignent de nouveau
-- le seuil, mais reward_claimed_count (1) >= reward_stock (1).
select public.record_jackpot_participation(
  'da000000-0000-4000-8000-000000000002', repeat('d', 64), null,
  'da000000-0000-4000-8000-0000000000aa');
select public.record_jackpot_participation(
  'da000000-0000-4000-8000-000000000002', repeat('e', 64), null,
  'da000000-0000-4000-8000-0000000000aa');
delete from tap_r;
insert into tap_r select public.record_jackpot_participation(
  'da000000-0000-4000-8000-000000000002', repeat('f', 64), null,
  'da000000-0000-4000-8000-0000000000aa');
select is((select r->>'out_of_stock' from tap_r), 'true',
  'seuil atteint sans stock : out_of_stock');
select is((select r->>'is_winner' from tap_r), 'false',
  'aucun gagnant quand le stock est épuisé');
select is((select count(*) from public.jackpot_wins
            where campaign_id = 'da000000-0000-4000-8000-000000000002'),
  1::bigint, 'toujours 1 seul gain : jamais de sur-émission');

-- ══ 4. rescan_win : armement puis gain instantané ════════════
-- Seuil 2 : joueur a (count 1, pas armé), joueur b (count 2 = seuil, armé mais
-- ne roll pas), joueur c (count 3 > seuil, roll à proba 1 → gagne).
delete from tap_r;
insert into tap_r select public.record_jackpot_participation(
  'da000000-0000-4000-8000-000000000003', repeat('a', 64), null,
  'da000000-0000-4000-8000-0000000000aa');
select is((select r->>'armed' from tap_r), 'false', 'rescan : pas armé sous le seuil');

delete from tap_r;
insert into tap_r select public.record_jackpot_participation(
  'da000000-0000-4000-8000-000000000003', repeat('b', 64), null,
  'da000000-0000-4000-8000-0000000000aa');
select is((select r->>'armed' from tap_r), 'true',
  'rescan : armé au seuil, mais la participation d''armement ne gagne pas');
select is((select r->>'is_winner' from tap_r), 'false',
  'rescan : l''armement ne produit pas de gagnant');
select is((select count(*) from public.jackpot_wins
            where campaign_id = 'da000000-0000-4000-8000-000000000003'),
  0::bigint, 'rescan : aucun gain à l''armement');

delete from tap_r;
insert into tap_r select public.record_jackpot_participation(
  'da000000-0000-4000-8000-000000000003', repeat('c', 64), null,
  'da000000-0000-4000-8000-0000000000aa');
select is((select r->>'is_winner' from tap_r), 'true',
  'rescan : la participation suivante gagne (proba 1) instantanément');
select is((select count(*) from public.jackpot_wins
            where campaign_id = 'da000000-0000-4000-8000-000000000003'),
  1::bigint, 'rescan : exactement 1 gagnant');
select is((select winner_token_hash from public.jackpot_wins
            where campaign_id = 'da000000-0000-4000-8000-000000000003'),
  repeat('c', 64), 'rescan : le gagnant est le joueur qui a scanné (gain instantané)');
select is((select cycle from public.jackpot_campaigns
            where id = 'da000000-0000-4000-8000-000000000003'),
  2, 'rescan : nouveau cycle après le gain');

-- ══ 5. date_draw : tirage par le job pg_cron ═════════════════
-- Deux participations, aucun tirage à la participation.
select public.record_jackpot_participation(
  'da000000-0000-4000-8000-000000000004', repeat('a', 64), null,
  'da000000-0000-4000-8000-0000000000aa');
select public.record_jackpot_participation(
  'da000000-0000-4000-8000-000000000004', repeat('b', 64), null,
  'da000000-0000-4000-8000-0000000000aa');
select is((select count(*) from public.jackpot_wins
            where campaign_id = 'da000000-0000-4000-8000-000000000004'),
  0::bigint, 'date_draw : aucun tirage à la participation');

-- Le job tire à draw_at échu.
create temporary table tap_draws on commit drop as
  select * from public.run_jackpot_date_draws();
select ok((select count(*) from tap_draws
            where campaign_id = 'da000000-0000-4000-8000-000000000004') = 1,
  'run_jackpot_date_draws tire la campagne à date échue');
select is((select count(*) from public.jackpot_wins
            where campaign_id = 'da000000-0000-4000-8000-000000000004'),
  1::bigint, 'date_draw : exactement 1 gagnant après le job');
select ok(
  (select winner_token_hash from public.jackpot_wins
    where campaign_id = 'da000000-0000-4000-8000-000000000004')
   in (repeat('a',64), repeat('b',64)),
  'date_draw : le gagnant est un des participants');
-- Rejouer le job ne tire pas une seconde fois (déjà gagné pour ce cycle).
select is((select count(*) from public.run_jackpot_date_draws()
            where campaign_id = 'da000000-0000-4000-8000-000000000004'),
  0::bigint, 'date_draw : le job ne re-tire pas un cycle déjà gagné');

-- ══ 7. Cooldown ══════════════════════════════════════════════
-- Joueur z sur la campagne D (staff, cooldown 300 s) : 1re OK, 2e trop tôt.
select is((public.record_jackpot_participation(
    'da000000-0000-4000-8000-000000000004', repeat('9', 64), null,
    'da000000-0000-4000-8000-0000000000aa'))->>'state',
  'recorded', 'cooldown : 1re participation acceptée');
delete from tap_r;
insert into tap_r select public.record_jackpot_participation(
  'da000000-0000-4000-8000-000000000004', repeat('9', 64), null,
  'da000000-0000-4000-8000-0000000000aa');
select is((select r->>'state' from tap_r), 'too_soon',
  'cooldown : 2e participation immédiate refusée (too_soon)');
select ok((select (r->>'retry_in_seconds')::int from tap_r) between 1 and 300,
  'cooldown : retry_in_seconds renseigné');

-- ══ 8. Code tournant : invalide / hors fenêtre / valide ══════
select is((public.record_jackpot_participation(
    'da000000-0000-4000-8000-000000000005', repeat('a', 64), '12345'))->>'state',
  'invalid_code', 'code de mauvaise longueur : invalid_code');
select is((public.record_jackpot_participation(
    'da000000-0000-4000-8000-000000000005', repeat('a', 64),
    pg_temp.tap_jackpot_code(
      decode('00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff', 'hex'),
      pg_temp.tap_counter() + 100)))->>'state',
  'invalid_code', 'code hors fenêtre : invalid_code');
select is((select count(*) from public.jackpot_players
            where campaign_id = 'da000000-0000-4000-8000-000000000005'),
  0::bigint, 'aucun joueur créé par un code refusé');

delete from tap_r;
insert into tap_r select public.record_jackpot_participation(
  'da000000-0000-4000-8000-000000000005', repeat('a', 64),
  public.current_jackpot_code('da000000-0000-4000-8000-000000000005'));
select is((select r->>'state' from tap_r), 'recorded', 'code courant : participation validée');
select is((select r->>'current_count' from tap_r), '1', 'code valide : jauge incrémentée');

-- ══ 9. Unicité du code de gain ═══════════════════════════════
select ok(exists (
  select 1 from pg_constraint
   where conrelid = 'public.jackpot_wins'::regclass
     and contype = 'u'
     and pg_get_constraintdef(oid) ilike '%(code)%'),
  'contrainte d''unicité sur jackpot_wins.code');
select ok(
  (select count(distinct code) = count(*) from public.jackpot_wins),
  'tous les codes de gain émis sont distincts');
-- Unicité (campaign_id, cycle) : borne structurelle à 1 gagnant/cycle.
select ok(exists (
  select 1 from pg_constraint
   where conrelid = 'public.jackpot_wins'::regclass
     and contype = 'u'
     and pg_get_constraintdef(oid) ilike '%(campaign_id, cycle)%'),
  'unicité (campaign_id, cycle) : un seul gagnant par cycle');

-- ══ 10. Caisse : remise atomique, auditée, org-scopée ════════
-- Un code de gain existant (campagne T, cycle 1).
delete from tap_r;
select is(
  (select redeemed_now from public.redeem_jackpot_prize(
    'da000000-0000-4000-8000-000000000001',
    (select lower(code) from public.jackpot_wins
      where campaign_id = 'da000000-0000-4000-8000-000000000002'),
    'Caissier E2E')),
  true, 'caisse : première remise → redeemed_now (code insensible à la casse)');
select is(
  (select redeemed_now from public.redeem_jackpot_prize(
    'da000000-0000-4000-8000-000000000001',
    (select code from public.jackpot_wins
      where campaign_id = 'da000000-0000-4000-8000-000000000002'),
    'Caissier E2E')),
  false, 'caisse : seconde remise du même code → refus (déjà remis)');
select is(
  (select count(*) from public.redeem_jackpot_prize(
    'da000000-0000-4000-8000-000000000031',
    (select code from public.jackpot_wins
      where campaign_id = 'da000000-0000-4000-8000-000000000002'),
    'Caissier Autre')),
  0::bigint, 'caisse : code d''une autre organisation → introuvable (cloisonnement)');
select results_eq(
  $$select count(*) from public.audit_logs where action = 'jackpot.redeem'$$,
  array[1::bigint], 'caisse : la remise est auditée une seule fois');
select throws_ok(
  $$select public.redeem_jackpot_prize('da000000-0000-4000-8000-000000000001', 'JACKPOT-AAAAAAAA', '')$$,
  'P0001', 'actor required', 'caisse : actor obligatoire');

-- ══ 11. Purge RGPD : joueurs dormants ════════════════════════
update public.organizations set data_retention_months = 6
 where id = 'da000000-0000-4000-8000-000000000001';
-- Joueur dormant : dernière activité au-delà de la rétention.
update public.jackpot_players
   set last_participation_at = now() - interval '8 months'
 where campaign_id = 'da000000-0000-4000-8000-000000000002'
   and token_hash = repeat('a', 64);
select ok((select public.purge_expired_jackpot_players()) >= 1,
  'purge : au moins un joueur dormant supprimé');
select is((select count(*) from public.jackpot_players
            where campaign_id = 'da000000-0000-4000-8000-000000000002'
              and token_hash = repeat('a', 64)),
  0::bigint, 'purge : le joueur dormant est bien supprimé');

reset role;
select * from finish();
rollback;
