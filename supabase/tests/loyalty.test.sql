-- ============================================================
-- Passeport de fidélité — comportement réel des RPC sur base
-- migrée vierge (fixtures locales) :
--   1. Indisponibilité : addon coupé, programme non actif → 'unavailable',
--      sans oracle et sans créer de passeport.
--   2. Code tournant : longueur invalide → 'invalid_code' ; code hors
--      fenêtre (compteur lointain) → 'invalid_code' ; code courant
--      (current_loyalty_code) → 'stamped'. Aucun passeport créé par un
--      code refusé.
--   3. Cooldown : second tampon immédiat → 'too_soon' ; après expiration
--      du délai → 'stamped'.
--   4. Niveaux bronze/argent/or calqués sur visit_count.
--   5. Palier LOT : code FIDELITE-XXXXXXXX + compteur de stock ; stock
--      épuisé = 'out_of_stock' (aucune récompense), réarmé si relevé.
--   6. Palier SPIN : grant_token émis ; consume_loyalty_spin_grant →
--      'spun' + spin source='loyalty' + resulting_spin_id ; rejeu →
--      'already_consumed' ; mauvais jeton → 'unavailable'.
--   7. Mode staff : p_validated_by obligatoire (chemin public fermé) ;
--      tampon staff journalisé avec le validateur.
--   8. Caisse : remise atomique auditée, code insensible à la casse, déjà
--      remis ou autre organisation → refus générique ; actor obligatoire.
--   9. Purge RGPD : purge sur la DERNIÈRE ACTIVITÉ (un passeport actif
--      récemment est conservé même s'il est ancien).
--  10. Garde-fous de réglage (durcissement 20260725150000, planchers
--      alignés en 20260725170000, resserrés en 20260725180000) : le
--      cooldown a un plancher de 300 s dans LES DEUX modes — anti-relais
--      d'un code observé en rotating_code (et au moins DEUX périodes de
--      rotation, soit la durée d'acceptation complète d'un code),
--      anti-rejeu du jeton de check-in en staff — et la période de
--      rotation est plafonnée à 300 s.
--  11. Fenêtre d'acceptation du code tournant (20260725180000) : deux
--      fenêtres seulement (la précédente reste acceptée, la suivante ne
--      l'est plus). Combiné au plancher du point 10, un code affiché au
--      comptoir — donc lisible gratuitement — ne peut jamais valoir deux
--      tampons sur le même passeport. Unicité (program_id, token_hash)
--      des passeports attestée : c'est le contrat sur lequel s'appuie le
--      bornage applicatif des identités.
-- ============================================================
begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

select set_config('request.jwt.claims', '{"role":"service_role"}', true);

-- Réplique locale de la troncature TOTP de la RPC : permet de fabriquer un
-- code pour un compteur ARBITRAIRE (dont un hors fenêtre) de façon
-- déterministe. Le chemin « valide » passe lui par current_loyalty_code
-- (test croisé des deux implémentations).
create function pg_temp.tap_loyalty_code(p_secret bytea, p_counter bigint)
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

-- Compteur courant (période 60 s) et secret déterministe du programme A.
create function pg_temp.tap_counter() returns bigint language sql as $$
  select floor(extract(epoch from now()) / 60)::bigint;
$$;

-- ── Fixtures ─────────────────────────────────────────────────
insert into public.organizations (id, name, slug, addon_loyalty)
values ('ca000000-0000-4000-8000-000000000001', 'Test Fidélité', 'tap-loyalty', true);
-- Seconde organisation : preuve du cloisonnement de la caisse.
insert into public.organizations (id, name, slug, addon_loyalty)
values ('ca000000-0000-4000-8000-000000000031', 'Autre Org', 'tap-loyalty-2', true);

-- Programme A : code tournant, secret connu, cooldown 24 h,
-- argent à 2 visites, or à 3 visites.
insert into public.loyalty_programs (
  id, organization_id, name, status, validation_mode,
  rotating_secret, rotating_period_seconds, min_stamp_interval_seconds,
  silver_threshold, gold_threshold
) values (
  'ca000000-0000-4000-8000-000000000002',
  'ca000000-0000-4000-8000-000000000001',
  'Passeport café', 'active', 'rotating_code',
  decode('00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff', 'hex'),
  60, 86400, 2, 3
);

-- Programme B : validation staff, cooldown au plancher du mode (300 s).
-- Un seul tampon y est posé par ce fichier : le cooldown n'influe sur
-- aucune assertion.
insert into public.loyalty_programs (
  id, organization_id, name, status, validation_mode, min_stamp_interval_seconds
) values (
  'ca000000-0000-4000-8000-000000000003',
  'ca000000-0000-4000-8000-000000000001',
  'Passeport comptoir', 'active', 'staff', 300
);

-- Roue cible du palier SPIN (campagne + roue + lots).
insert into public.campaigns (id, organization_id, name, status)
values ('ca000000-0000-4000-8000-000000000021',
        'ca000000-0000-4000-8000-000000000001', 'Campagne fidélité', 'active');
insert into public.wheels (id, organization_id, campaign_id, name, play_limit)
values ('ca000000-0000-4000-8000-000000000022',
        'ca000000-0000-4000-8000-000000000001',
        'ca000000-0000-4000-8000-000000000021', 'Roue bonus', 'unlimited');
insert into public.prizes (id, organization_id, wheel_id, label, weight, is_losing, position) values
  ('ca000000-0000-4000-8000-000000000023', 'ca000000-0000-4000-8000-000000000001',
   'ca000000-0000-4000-8000-000000000022', 'Lot bonus', 100, false, 0),
  ('ca000000-0000-4000-8000-000000000024', 'ca000000-0000-4000-8000-000000000001',
   'ca000000-0000-4000-8000-000000000022', 'Perdu (jamais tiré)', 0, true, 1);

-- Paliers du programme A : lot à 2 visites (stock 1), spin à 3 visites.
insert into public.loyalty_milestones (
  id, program_id, organization_id, visit_count, reward_type,
  reward_label, reward_stock, position
) values (
  'ca000000-0000-4000-8000-000000000011',
  'ca000000-0000-4000-8000-000000000002',
  'ca000000-0000-4000-8000-000000000001', 2, 'lot', 'Café offert', 1, 0
);
insert into public.loyalty_milestones (
  id, program_id, organization_id, visit_count, reward_type, target_wheel_id, position
) values (
  'ca000000-0000-4000-8000-000000000012',
  'ca000000-0000-4000-8000-000000000002',
  'ca000000-0000-4000-8000-000000000001', 3, 'spin',
  'ca000000-0000-4000-8000-000000000022', 1
);

-- Le trigger a-t-il conservé le secret fourni (service role) ?
select is(
  (select rotating_secret from public.loyalty_programs
    where id = 'ca000000-0000-4000-8000-000000000002'),
  decode('00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff', 'hex'),
  'le secret fourni par le service role est conservé (trigger no-op)');

create temporary table tap_r (r jsonb) on commit drop;

-- ══ 1. Indisponibilité (aucun passeport créé) ════════════════
update public.organizations set addon_loyalty = false
 where id = 'ca000000-0000-4000-8000-000000000001';
select is((public.record_loyalty_stamp(
    'ca000000-0000-4000-8000-000000000002', repeat('a', 64), '000000'))->>'state',
  'unavailable', 'addon coupé : unavailable');
update public.organizations set addon_loyalty = true
 where id = 'ca000000-0000-4000-8000-000000000001';

update public.loyalty_programs set status = 'draft'
 where id = 'ca000000-0000-4000-8000-000000000002';
select is((public.record_loyalty_stamp(
    'ca000000-0000-4000-8000-000000000002', repeat('a', 64), '000000'))->>'state',
  'unavailable', 'programme en brouillon : unavailable');
update public.loyalty_programs set status = 'active'
 where id = 'ca000000-0000-4000-8000-000000000002';

select is((select count(*) from public.loyalty_members), 0::bigint,
  'aucun passeport créé par un tampon indisponible');

-- ══ 2. Code tournant : invalide / hors fenêtre / valide ══════
select is((public.record_loyalty_stamp(
    'ca000000-0000-4000-8000-000000000002', repeat('a', 64), '12345'))->>'state',
  'invalid_code', 'code de mauvaise longueur : invalid_code');

-- Code d'un compteur 100 périodes plus tard : hors fenêtre ±1
-- (collision avec la fenêtre courante ≈ 3/10^6, négligeable).
select is((public.record_loyalty_stamp(
    'ca000000-0000-4000-8000-000000000002', repeat('a', 64),
    pg_temp.tap_loyalty_code(
      decode('00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff', 'hex'),
      pg_temp.tap_counter() + 100)))->>'state',
  'invalid_code', 'code hors fenêtre : invalid_code');

select is((select count(*) from public.loyalty_members), 0::bigint,
  'aucun passeport créé par un code refusé');

-- Code courant valide → tampon.
delete from tap_r;
insert into tap_r select public.record_loyalty_stamp(
  'ca000000-0000-4000-8000-000000000002', repeat('a', 64),
  public.current_loyalty_code('ca000000-0000-4000-8000-000000000002'));
select is((select r->>'state' from tap_r), 'stamped', 'code courant : tampon validé');
select is((select r->>'visit_count' from tap_r), '1', 'première visite comptée');
select is((select r->>'tier' from tap_r), 'bronze', 'niveau bronze au départ');
select is((select r->'next_milestone'->>'visit_count' from tap_r), '2',
  'prochain palier annoncé (2 visites)');
select is((select count(*) from public.loyalty_members), 1::bigint,
  'le passeport est créé à la première visite');

-- ══ 3. Cooldown ══════════════════════════════════════════════
select is((public.record_loyalty_stamp(
    'ca000000-0000-4000-8000-000000000002', repeat('a', 64),
    public.current_loyalty_code('ca000000-0000-4000-8000-000000000002')))->>'state',
  'too_soon', 'second tampon immédiat : too_soon (cooldown)');
select is((select visit_count from public.loyalty_members
    where token_hash = repeat('a', 64)), 1,
  'un tampon trop tôt n''incrémente rien');

-- Le délai s'écoule : le tampon passe et atteint le palier LOT (2 visites).
update public.loyalty_members set last_stamp_at = last_stamp_at - interval '2 days'
 where token_hash = repeat('a', 64);
delete from tap_r;
insert into tap_r select public.record_loyalty_stamp(
  'ca000000-0000-4000-8000-000000000002', repeat('a', 64),
  public.current_loyalty_code('ca000000-0000-4000-8000-000000000002'));
select is((select r->>'state' from tap_r), 'stamped', 'délai écoulé : tampon validé');
select is((select r->>'visit_count' from tap_r), '2', 'deuxième visite');
select is((select r->>'tier' from tap_r), 'silver', 'niveau argent à 2 visites');

-- ══ 4. Palier LOT : code FIDELITE-… + stock ══════════════════
select is((select r->'milestones_reached'->0->>'reward_type' from tap_r), 'lot',
  'palier lot atteint ce tour');
select matches((select r->'milestones_reached'->0->>'code' from tap_r),
  '^FIDELITE-[A-HJ-NP-Z2-9]{8}$',
  'code de retrait FIDELITE-XXXXXXXX (alphabet sans I/O/0/1)');
select is((select reward_claimed_count from public.loyalty_milestones
    where id = 'ca000000-0000-4000-8000-000000000011'), 1,
  'le compteur de lots émis avance');
select is((select count(*) from public.loyalty_rewards
    where reward_type = 'lot' and code is not null), 1::bigint,
  'une récompense lot est créée avec son code');

-- Second passeport, stock (1) épuisé → out_of_stock, aucune récompense.
select is((public.record_loyalty_stamp(
    'ca000000-0000-4000-8000-000000000002', repeat('b', 64),
    public.current_loyalty_code('ca000000-0000-4000-8000-000000000002')))->>'state',
  'stamped', 'passeport B : première visite');
update public.loyalty_members set last_stamp_at = last_stamp_at - interval '2 days'
 where token_hash = repeat('b', 64);
delete from tap_r;
insert into tap_r select public.record_loyalty_stamp(
  'ca000000-0000-4000-8000-000000000002', repeat('b', 64),
  public.current_loyalty_code('ca000000-0000-4000-8000-000000000002'));
select is((select r->'milestones_reached'->0->>'out_of_stock' from tap_r), 'true',
  'stock épuisé : palier signalé sans récompense');
select is((select count(*) from public.loyalty_rewards
    where reward_type = 'lot'), 1::bigint,
  'aucune récompense lot supplémentaire sans stock');

-- Le commerçant relève le stock : le palier lot ET le palier spin
-- s'attribuent au tampon suivant du passeport B (3 visites).
update public.loyalty_milestones set reward_stock = 3
 where id = 'ca000000-0000-4000-8000-000000000011';
update public.loyalty_members set last_stamp_at = last_stamp_at - interval '2 days'
 where token_hash = repeat('b', 64);
delete from tap_r;
insert into tap_r select public.record_loyalty_stamp(
  'ca000000-0000-4000-8000-000000000002', repeat('b', 64),
  public.current_loyalty_code('ca000000-0000-4000-8000-000000000002'));
select is((select r->>'visit_count' from tap_r), '3', 'passeport B : troisième visite');
select is((select r->>'tier' from tap_r), 'gold', 'niveau or à 3 visites');
select is((select jsonb_array_length(r->'milestones_reached') from tap_r), 2,
  'stock relevé : le lot en attente ET le spin s''attribuent ensemble');
select is((select reward_claimed_count from public.loyalty_milestones
    where id = 'ca000000-0000-4000-8000-000000000011'), 2,
  'le lot différé est finalement décompté');

-- ══ 5. Palier SPIN : grant → consommation → gain ═════════════
-- Passeport A atteint le palier spin (3 visites).
update public.loyalty_members set last_stamp_at = last_stamp_at - interval '2 days'
 where token_hash = repeat('a', 64);
delete from tap_r;
insert into tap_r select public.record_loyalty_stamp(
  'ca000000-0000-4000-8000-000000000002', repeat('a', 64),
  public.current_loyalty_code('ca000000-0000-4000-8000-000000000002'));
select is((select r->'milestones_reached'->0->>'reward_type' from tap_r), 'spin',
  'palier spin atteint ce tour');
select matches((select r->'milestones_reached'->0->>'grant_token' from tap_r),
  '^[0-9a-f]{48}$', 'un grant_token à usage unique est émis');

create temporary table tap_grant on commit drop as
  select r.grant_token from public.loyalty_rewards r
    join public.loyalty_members m on m.id = r.member_id
   where m.token_hash = repeat('a', 64) and r.reward_type = 'spin';

-- Mauvais jeton → unavailable.
select is((public.consume_loyalty_spin_grant(
    'ca000000-0000-4000-8000-000000000002', repeat('a', 64),
    repeat('0', 48)))->>'state',
  'unavailable', 'grant inconnu : unavailable');

-- Consommation : un spin est produit dans le flux normal (source loyalty).
delete from tap_r;
insert into tap_r select public.consume_loyalty_spin_grant(
  'ca000000-0000-4000-8000-000000000002', repeat('a', 64),
  (select grant_token from tap_grant));
select is((select r->>'state' from tap_r), 'spun', 'grant consommé : spin produit');
select isnt((select r->>'spin_id' from tap_r), null, 'un spin_id est renvoyé au backend');
select is((select count(*) from public.spins where source = 'loyalty'), 1::bigint,
  'le spin offert est journalisé source=loyalty');
select is((select count(*) from public.loyalty_rewards
    where reward_type = 'spin' and consumed_at is not null
      and resulting_spin_id is not null), 1::bigint,
  'le grant est marqué consommé et lié au spin résultant');

-- Rejeu : anti-double.
select is((public.consume_loyalty_spin_grant(
    'ca000000-0000-4000-8000-000000000002', repeat('a', 64),
    (select grant_token from tap_grant)))->>'state',
  'already_consumed', 'rejeu du grant : already_consumed');

-- ══ 6. Mode staff ════════════════════════════════════════════
-- Chemin public (sans validateur) fermé sur un programme staff.
select is((public.record_loyalty_stamp(
    'ca000000-0000-4000-8000-000000000003', repeat('c', 64)))->>'state',
  'unavailable', 'staff sans validateur : unavailable (chemin public fermé)');
-- Tampon staff identifié.
delete from tap_r;
insert into tap_r select public.record_loyalty_stamp(
  'ca000000-0000-4000-8000-000000000003', repeat('c', 64), null,
  'ca000000-0000-4000-8000-000000000099');
select is((select r->>'state' from tap_r), 'stamped', 'tampon staff validé');
select is((select mode from public.loyalty_stamps
    where validated_by = 'ca000000-0000-4000-8000-000000000099'), 'staff',
  'le tampon staff enregistre le mode et le validateur');

-- ══ 7. Remise en caisse ══════════════════════════════════════
create temporary table tap_code on commit drop as
  select r.code from public.loyalty_rewards r
    join public.loyalty_members m on m.id = r.member_id
   where m.token_hash = repeat('a', 64) and r.reward_type = 'lot';

select is(
  (select redeemed_now from public.redeem_loyalty_reward(
    'ca000000-0000-4000-8000-000000000001',
    (select lower(code) from tap_code), 'caisse@test.local')),
  true, 'remise validée (code insensible à la casse)');
select is((select count(*) from public.loyalty_rewards
    where redeemed_at is not null and redeemed_by = 'caisse@test.local'),
  1::bigint, 'horodatage et acteur posés atomiquement');
select is((select count(*) from public.audit_logs where action = 'loyalty.redeem'),
  1::bigint, 'la remise est auditée');

select is(
  (select redeemed_now from public.redeem_loyalty_reward(
    'ca000000-0000-4000-8000-000000000001',
    (select code from tap_code), 'caisse@test.local')),
  false, 'un code déjà remis est refusé (redeemed_now = false)');

select is(
  (select count(*) from public.redeem_loyalty_reward(
    'ca000000-0000-4000-8000-000000000031',
    (select code from tap_code), 'caisse@test.local')),
  0::bigint, 'code d''une autre organisation : aucune ligne, refus générique');

select throws_ok(
  format($f$select * from public.redeem_loyalty_reward(
    'ca000000-0000-4000-8000-000000000001', '%s', '')$f$,
    (select code from tap_code)),
  'P0001', 'actor required', 'la caisse doit s''identifier');

-- ══ 8. Purge RGPD (dernière activité) ════════════════════════
update public.organizations set data_retention_months = 1
 where id = 'ca000000-0000-4000-8000-000000000001';
-- Passeport A dormant (dernière visite > rétention) ; passeport B actif.
update public.loyalty_members set last_stamp_at = now() - interval '2 months',
                                   created_at = now() - interval '2 months'
 where token_hash = repeat('a', 64);
update public.loyalty_members set created_at = now() - interval '2 months',
                                   last_stamp_at = now() - interval '1 hour'
 where token_hash = repeat('b', 64);

select ok(public.purge_expired_loyalty_members() >= 1::bigint,
  'au moins un passeport dormant est purgé');
select is((select count(*) from public.loyalty_members
    where token_hash = repeat('a', 64)), 0::bigint,
  'le passeport dormant est purgé');
select is((select count(*) from public.loyalty_members
    where token_hash = repeat('b', 64)), 1::bigint,
  'un passeport ancien mais ACTIF récemment est conservé (borne = activité)');
select is((select count(*) from public.loyalty_stamps ls
    join public.loyalty_members m on m.id = ls.member_id
   where m.token_hash = repeat('a', 64)), 0::bigint,
  'les tampons du passeport purgé suivent (cascade)');

-- ══ 9. Garde-fous de réglage (durcissement) ══════════════════
-- Un code tournant reste acceptable ~3 périodes : sans cooldown, une
-- seule observation du code se rejouerait en boucle. Plancher imposé.
select throws_ok($$
  insert into public.loyalty_programs (
    organization_id, name, status, validation_mode,
    rotating_period_seconds, min_stamp_interval_seconds)
  values ('ca000000-0000-4000-8000-000000000001', 'Rotation sans cooldown',
          'active', 'rotating_code', 60, 0)
$$, '23514', null,
  'rotating_code : cooldown 0 refusé (plancher anti-relais)');

select throws_ok($$
  insert into public.loyalty_programs (
    organization_id, name, status, validation_mode,
    rotating_period_seconds, min_stamp_interval_seconds)
  values ('ca000000-0000-4000-8000-000000000001', 'Cooldown trop court',
          'active', 'rotating_code', 60, 299)
$$, '23514', null,
  'rotating_code : cooldown sous 300 s refusé');

select lives_ok($$
  insert into public.loyalty_programs (
    organization_id, name, status, validation_mode,
    rotating_period_seconds, min_stamp_interval_seconds)
  values ('ca000000-0000-4000-8000-000000000001', 'Cooldown au plancher',
          'active', 'rotating_code', 60, 300)
$$, 'rotating_code : cooldown égal au plancher accepté');

-- Le plancher rotating couvre la DURÉE D'ACCEPTATION COMPLÈTE d'un code
-- (20260725180000) : la RPC accepte 2 fenêtres (courante + précédente),
-- le cooldown doit donc valoir au moins 2 × rotating_period_seconds. Sans
-- cela, une SEULE lecture du code affiché au comptoir — geste légitime et
-- gratuit — vaudrait deux tampons sur le même passeport : à une période de
-- 300 s, un code restait acceptable plus longtemps que le cooldown.
select throws_ok($$
  insert into public.loyalty_programs (
    organization_id, name, status, validation_mode,
    rotating_period_seconds, min_stamp_interval_seconds)
  values ('ca000000-0000-4000-8000-000000000001', 'Rotation 5 min, cooldown 5 min',
          'active', 'rotating_code', 300, 300)
$$, '23514', null,
  'rotating_code : cooldown 300 s refusé à période 300 s (code valide 600 s)');

select throws_ok($$
  insert into public.loyalty_programs (
    organization_id, name, status, validation_mode,
    rotating_period_seconds, min_stamp_interval_seconds)
  values ('ca000000-0000-4000-8000-000000000001', 'Cooldown sous 2 périodes',
          'active', 'rotating_code', 200, 399)
$$, '23514', null,
  'rotating_code : cooldown sous 2 × période refusé (399 < 400)');

select lives_ok($$
  insert into public.loyalty_programs (
    organization_id, name, status, validation_mode,
    rotating_period_seconds, min_stamp_interval_seconds)
  values ('ca000000-0000-4000-8000-000000000001', 'Rotation 5 min conforme',
          'active', 'rotating_code', 300, 600)
$$, 'rotating_code : période maximale (300 s) avec cooldown 600 s acceptée');

-- Cas d'égalité (2 × 150 = 300) : accepté, l'invariant est « ≤ », pas « < ».
select lives_ok($$
  insert into public.loyalty_programs (
    id, organization_id, name, status, validation_mode,
    rotating_period_seconds, min_stamp_interval_seconds)
  values ('ca000000-0000-4000-8000-000000000041',
          'ca000000-0000-4000-8000-000000000001', 'Cooldown égal à 2 périodes',
          'active', 'rotating_code', 150, 300)
$$, 'rotating_code : cooldown égal à 2 × période accepté (2 × 150 = 300)');

-- L'invariant croise deux colonnes : allonger la période sans toucher au
-- cooldown est un contournement, la contrainte le voit aussi.
select throws_ok($$
  update public.loyalty_programs set rotating_period_seconds = 151
   where id = 'ca000000-0000-4000-8000-000000000041'
$$, '23514', null,
  'rotating_code : allonger la période au-delà de cooldown / 2 est refusé');

-- Le mode staff a lui aussi un plancher, à 300 s : le jeton de check-in
-- signé (TTL 180 s) n'est pas à usage unique, et un plancher égal à sa
-- TTL n'offrirait aucune marge — un écart d'horloge entre instances
-- suffirait à laisser un rejeu intra-fenêtre valoir un second tampon.
select throws_ok($$
  insert into public.loyalty_programs (
    organization_id, name, status, validation_mode, min_stamp_interval_seconds)
  values ('ca000000-0000-4000-8000-000000000001', 'Comptoir sans cooldown',
          'active', 'staff', 0)
$$, '23514', null,
  'staff : cooldown 0 refusé (rejeu du jeton de check-in)');

select throws_ok($$
  insert into public.loyalty_programs (
    organization_id, name, status, validation_mode, min_stamp_interval_seconds)
  values ('ca000000-0000-4000-8000-000000000001', 'Comptoir à la TTL',
          'active', 'staff', 180)
$$, '23514', null,
  'staff : cooldown égal à la TTL du jeton (180 s) refusé — marge nulle');

select throws_ok($$
  insert into public.loyalty_programs (
    organization_id, name, status, validation_mode, min_stamp_interval_seconds)
  values ('ca000000-0000-4000-8000-000000000001', 'Comptoir sous le plancher',
          'active', 'staff', 299)
$$, '23514', null,
  'staff : cooldown sous 300 s refusé');

select lives_ok($$
  insert into public.loyalty_programs (
    organization_id, name, status, validation_mode, min_stamp_interval_seconds)
  values ('ca000000-0000-4000-8000-000000000001', 'Comptoir au plancher',
          'active', 'staff', 300)
$$, 'staff : cooldown égal au plancher (300 s) accepté');

-- Le plancher staff résiste aussi à un UPDATE (contournement direct).
select throws_ok($$
  update public.loyalty_programs set min_stamp_interval_seconds = 0
   where id = 'ca000000-0000-4000-8000-000000000003'
$$, '23514', null,
  'staff : le plancher résiste à un UPDATE vers 0');

select throws_ok($$
  update public.loyalty_programs set min_stamp_interval_seconds = 180
   where id = 'ca000000-0000-4000-8000-000000000003'
$$, '23514', null,
  'staff : le plancher résiste à un UPDATE vers 180 (ancien plancher)');

-- Bascule de mode : la contrainte porte sur la ligne RÉSULTANTE, le
-- changement de mode ne contourne donc rien. Depuis 20260725180000 le
-- plancher rotating vaut greatest(300, 2 × période) : un programme staff
-- conforme (cooldown ≥ 300 s) ne bascule que si sa période de rotation —
-- inutilisée en staff, donc laissée au défaut la plupart du temps — tient
-- dans la moitié de son cooldown. Les deux cas sont attestés.
insert into public.loyalty_programs (
  id, organization_id, name, status, validation_mode,
  rotating_period_seconds, min_stamp_interval_seconds)
values ('ca000000-0000-4000-8000-000000000042',
        'ca000000-0000-4000-8000-000000000001', 'Comptoir à période longue',
        'active', 'staff', 300, 300);
select throws_ok($$
  update public.loyalty_programs set validation_mode = 'rotating_code'
   where id = 'ca000000-0000-4000-8000-000000000042'
$$, '23514', null,
  'bascule staff → rotating_code refusée si le cooldown ne couvre pas 2 × période');

-- (NB : ce test mute le programme B ; il est en fin de fichier, aucune
-- assertion ultérieure n'en dépend.)
select lives_ok($$
  update public.loyalty_programs set validation_mode = 'rotating_code'
   where id = 'ca000000-0000-4000-8000-000000000003'
$$, 'bascule staff → rotating_code acceptée quand le cooldown couvre 2 × période (300 ≥ 2 × 60)');

-- Période de rotation plafonnée (fenêtre de devinette/relais bornée).
select throws_ok($$
  insert into public.loyalty_programs (
    organization_id, name, status, validation_mode,
    rotating_period_seconds, min_stamp_interval_seconds)
  values ('ca000000-0000-4000-8000-000000000001', 'Rotation trop lente',
          'active', 'rotating_code', 3600, 86400)
$$, '23514', null,
  'période de rotation > 300 s refusée');

select throws_ok($$
  update public.loyalty_programs set rotating_period_seconds = 301
   where id = 'ca000000-0000-4000-8000-000000000002'
$$, '23514', null,
  'la période plafonnée résiste aussi à un UPDATE');

-- ══ 10. Fenêtre d'acceptation du code tournant ═══════════════
-- 20260725180000 : la RPC n'accepte plus que DEUX fenêtres (la courante et
-- la précédente), au lieu de trois. `now()` est figé pour toute la
-- transaction de test — la RPC et pg_temp.tap_counter() calculent donc
-- exactement le même compteur : ces assertions sont déterministes, à la
-- collision de codes près (≈ 2·10⁻⁶).
--
-- Le programme A a un cooldown de 24 h : chaque assertion utilise un
-- passeport neuf, aucune n'est masquée par un 'too_soon'.

-- Fenêtre PRÉCÉDENTE : toujours acceptée. C'est la tolérance utile — elle
-- absorbe la latence entre la lecture du code à l'écran du comptoir et
-- l'envoi du formulaire, à cheval sur une bascule de fenêtre.
select is((public.record_loyalty_stamp(
    'ca000000-0000-4000-8000-000000000002', repeat('d', 64),
    pg_temp.tap_loyalty_code(
      decode('00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff', 'hex'),
      pg_temp.tap_counter() - 1)))->>'state',
  'stamped', 'code de la fenêtre précédente : encore accepté');

-- Fenêtre SUIVANTE : refusée. Elle était acceptée avant 20260725180000, ce
-- qui portait la validité d'un code à 3 périodes alors que le cooldown n'en
-- couvrait qu'une seule : un code lu une fois valait deux tampons. Aucune
-- utilité côté UX — le code affiché est calculé par CETTE base
-- (current_loyalty_code) et vérifié par elle : il n'existe pas d'émetteur
-- en avance sur l'horloge du vérificateur.
select is((public.record_loyalty_stamp(
    'ca000000-0000-4000-8000-000000000002', repeat('e', 64),
    pg_temp.tap_loyalty_code(
      decode('00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff', 'hex'),
      pg_temp.tap_counter() + 1)))->>'state',
  'invalid_code', 'code de la fenêtre suivante : refusé (tolérance -1..0)');

select is((select count(*) from public.loyalty_members
    where token_hash = repeat('e', 64)), 0::bigint,
  'un code hors fenêtre ne crée toujours aucun passeport');

-- Support du bornage applicatif des identités : le backend détermine AVANT
-- d'appeler la RPC si un tampon créerait un passeport NEUF (isKnownPassport,
-- src/actions/loyalty.ts) par un SELECT sur (program_id, token_hash).
-- L'unicité — donc l'index couvrant, et l'absence d'ambiguïté du maybeSingle
-- côté client — est un contrat de la base, pas un détail d'implémentation.
-- (`::name[]` explicite : la surcharge pgTAP attend name[], un array de
-- littéraux se résoudrait sinon en text[] sans conversion implicite.)
select col_is_unique('public', 'loyalty_members',
  array['program_id', 'token_hash']::name[],
  'loyalty_members : (program_id, token_hash) unique — lookup indexé et non ambigu pour le bornage applicatif');

select finish();
rollback;
