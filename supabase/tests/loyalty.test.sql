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
--  12. Verrous économiques (20260725190000) : aucun palier avant la
--      VISITE 2 (un passeport neuf ne vaut RIEN), stock FINI obligatoire
--      (la perte maximale d'un programme vaut le stock choisi par le
--      commerçant, quel que soit le nombre d'identités fabriquées), et
--      drapeau `is_new_member` remonté par record_loyalty_stamp — c'est
--      lui qui permet au backend de compter des CRÉATIONS réelles plutôt
--      que des tentatives.
--  13. Bornes du palier `spin` (20260725200000) : le stock fini couvre
--      AUSSI les paliers `spin` (il y compte les GRANTS ÉMIS), un tour
--      offert ne tire jamais un lot à stock illimité, et la campagne de
--      la roue cible est vérifiée (statut + dates) — une campagne fermée
--      renvoie `unavailable` SANS consommer le grant, qui redevient
--      jouable à la réactivation.
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
-- Le lot gagnant porte un stock FINI : depuis 20260725200000, un tour OFFERT
-- par la fidélité n'est jamais tiré sur un lot à stock illimité (la roue
-- publique l'accepte, elle est bornée par play_limit et la fenêtre de
-- campagne ; le tour offert ne l'est pas).
insert into public.prizes (id, organization_id, wheel_id, label, weight, is_losing, position, stock) values
  ('ca000000-0000-4000-8000-000000000023', 'ca000000-0000-4000-8000-000000000001',
   'ca000000-0000-4000-8000-000000000022', 'Lot bonus', 100, false, 0, 10),
  ('ca000000-0000-4000-8000-000000000024', 'ca000000-0000-4000-8000-000000000001',
   'ca000000-0000-4000-8000-000000000022', 'Perdu (jamais tiré)', 0, true, 1, null);

-- Paliers du programme A : lot à 2 visites (stock 1), spin à 3 visites
-- (stock 5 : sur un palier `spin`, le stock compte les GRANTS ÉMIS).
insert into public.loyalty_milestones (
  id, program_id, organization_id, visit_count, reward_type,
  reward_label, reward_stock, position
) values (
  'ca000000-0000-4000-8000-000000000011',
  'ca000000-0000-4000-8000-000000000002',
  'ca000000-0000-4000-8000-000000000001', 2, 'lot', 'Café offert', 1, 0
);
insert into public.loyalty_milestones (
  id, program_id, organization_id, visit_count, reward_type, target_wheel_id,
  reward_stock, position
) values (
  'ca000000-0000-4000-8000-000000000012',
  'ca000000-0000-4000-8000-000000000002',
  'ca000000-0000-4000-8000-000000000001', 3, 'spin',
  'ca000000-0000-4000-8000-000000000022', 5, 1
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
-- 20260725190000 : le tampon qui CRÉE le passeport le dit. Le backend compte
-- ainsi des créations réelles, sans SELECT préalable ni comptage de tentatives.
select is((select r->>'is_new_member' from tap_r), 'true',
  'is_new_member = true : ce tampon a créé le passeport');
select is((select jsonb_array_length(r->'milestones_reached') from tap_r), 0,
  'un passeport fraîchement créé ne débloque AUCUNE récompense (plancher visite 2)');
select is((select r->'next_milestone'->>'visit_count' from tap_r), '2',
  'prochain palier annoncé (2 visites)');
select is((select count(*) from public.loyalty_members), 1::bigint,
  'le passeport est créé à la première visite');

-- ══ 3. Cooldown ══════════════════════════════════════════════
delete from tap_r;
insert into tap_r select public.record_loyalty_stamp(
  'ca000000-0000-4000-8000-000000000002', repeat('a', 64),
  public.current_loyalty_code('ca000000-0000-4000-8000-000000000002'));
select is((select r->>'state' from tap_r), 'too_soon',
  'second tampon immédiat : too_soon (cooldown)');
select is((select r->>'is_new_member' from tap_r), 'false',
  'is_new_member = false sur un passeport déjà connu (too_soon)');
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
select is((select r->>'is_new_member' from tap_r), 'false',
  'is_new_member = false sur un tampon qui n''a créé aucun passeport');

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

-- ══ 11. Verrous économiques (20260725190000) ═════════════════
-- Deux invariants qui, ensemble, retirent son objet à la frappe de masse de
-- passeports : une identité neuve ne vaut RIEN (aucun palier avant la 2ᵉ
-- visite) et la perte maximale d'un programme est un stock FINI choisi par le
-- commerçant (plus de lot « illimité »). Ils sont posés en base, donc valables
-- pour TOUS les chemins d'appel — c'est ce qui autorise le volet applicatif à
-- supprimer les seaux de création sur clés partagées.
--
-- Le programme A ('…002') porte déjà des paliers aux visites 2 et 3 : les
-- insertions ci-dessous utilisent des visites libres (5 à 8) pour ne buter que
-- sur les CHECK visés, jamais sur unique (program_id, visit_count).

-- Palier à la visite 1 : refusé (un passeport fraîchement créé ne doit rien
-- valoir — c'est le seul cas où fabriquer une identité paierait sans rien
-- fournir en échange).
select throws_ok($$
  insert into public.loyalty_milestones (
    program_id, organization_id, visit_count, reward_type,
    reward_label, reward_stock, position)
  values ('ca000000-0000-4000-8000-000000000002',
          'ca000000-0000-4000-8000-000000000001', 1, 'lot',
          'Cadeau de bienvenue', 5, 9)
$$, '23514', null,
  'palier à la visite 1 refusé (un passeport neuf ne vaut rien)');

-- Le plancher résiste aussi à un UPDATE (contournement direct du palier
-- existant, déjà validé à l'insertion).
select throws_ok($$
  update public.loyalty_milestones set visit_count = 1
   where id = 'ca000000-0000-4000-8000-000000000011'
$$, '23514', null,
  'le plancher de visite résiste à un UPDATE vers 1');

-- Palier `lot` SANS stock : refusé. C'était le trou économique — un lot
-- illimité rend la perte maximale illimitée, donc la fabrication d'identités
-- rentable sans borne.
select throws_ok($$
  insert into public.loyalty_milestones (
    program_id, organization_id, visit_count, reward_type,
    reward_label, reward_stock, position)
  values ('ca000000-0000-4000-8000-000000000002',
          'ca000000-0000-4000-8000-000000000001', 6, 'lot',
          'Lot sans stock', null, 9)
$$, '23514', null,
  'palier lot sans stock refusé (plus d''« illimité »)');

-- Idem par UPDATE : on ne repasse pas un lot existant en illimité.
select throws_ok($$
  update public.loyalty_milestones set reward_stock = null
   where id = 'ca000000-0000-4000-8000-000000000011'
$$, '23514', null,
  'repasser un lot en stock illimité par UPDATE est refusé');

-- Stock 0 accepté : « épuisé / en pause » est un état LÉGITIME (le RPC le rend
-- par out_of_stock). C'est la seule façon non destructrice de suspendre un
-- palier — le supprimer cascaderait sur les codes déjà émis et non remis.
select lives_ok($$
  insert into public.loyalty_milestones (
    program_id, organization_id, visit_count, reward_type,
    reward_label, reward_stock, position)
  values ('ca000000-0000-4000-8000-000000000002',
          'ca000000-0000-4000-8000-000000000001', 5, 'lot',
          'Lot en pause', 0, 9)
$$, 'palier lot à stock 0 accepté (« épuisé » est un état légitime)');

-- Palier `spin` SANS stock : refusé depuis 20260725200000. C'était le second
-- trou économique, jumeau du précédent : 20260725190000 avait interdit le stock
-- sur un `spin` en croyant que « le tour offert consomme le stock des lots de la
-- roue » — or un lot de roue est illimité PAR DÉFAUT et le tirage du tour offert
-- sortait alors sans décrément. Un palier `spin` était donc une fabrique de
-- codes de gain sans borne. Le stock d'un palier `spin` compte les GRANTS ÉMIS.
select throws_ok($$
  insert into public.loyalty_milestones (
    program_id, organization_id, visit_count, reward_type,
    target_wheel_id, position)
  values ('ca000000-0000-4000-8000-000000000002',
          'ca000000-0000-4000-8000-000000000001', 7, 'spin',
          'ca000000-0000-4000-8000-000000000022', 9)
$$, '23514', null,
  'palier spin sans stock refusé (le stock y compte les tours offerts émis)');

-- Idem par UPDATE : on ne repasse pas un palier spin existant en illimité.
select throws_ok($$
  update public.loyalty_milestones set reward_stock = null
   where id = 'ca000000-0000-4000-8000-000000000012'
$$, '23514', null,
  'repasser un palier spin en stock illimité par UPDATE est refusé');

-- Palier `spin` AVEC stock : accepté (c'est désormais la seule forme valide).
select lives_ok($$
  insert into public.loyalty_milestones (
    program_id, organization_id, visit_count, reward_type,
    target_wheel_id, reward_stock, position)
  values ('ca000000-0000-4000-8000-000000000002',
          'ca000000-0000-4000-8000-000000000001', 8, 'spin',
          'ca000000-0000-4000-8000-000000000022', 3, 9)
$$, 'palier spin avec stock fini accepté');

-- ══ 12. Comportement du RPC sous les deux verrous ════════════
-- Programme C dédié : palier lot à la visite 2, stock 0 (donc en pause).
-- Il prouve d'un seul parcours les deux propriétés qui ferment la boucle :
--   · la 1ʳᵉ visite ne débloque RIEN (aucun palier n'existe avant la 2ᵉ) ;
--   · à la 2ᵉ visite, un stock épuisé signale out_of_stock et n'émet AUCUN
--     code — le stock est bien le plafond de perte du programme.
insert into public.loyalty_programs (
  id, organization_id, name, status, validation_mode,
  min_stamp_interval_seconds, silver_threshold, gold_threshold
) values (
  'ca000000-0000-4000-8000-000000000051',
  'ca000000-0000-4000-8000-000000000001',
  'Passeport verrous', 'active', 'staff', 300, 5, 6
);
insert into public.loyalty_milestones (
  id, program_id, organization_id, visit_count, reward_type,
  reward_label, reward_stock, position
) values (
  'ca000000-0000-4000-8000-000000000052',
  'ca000000-0000-4000-8000-000000000051',
  'ca000000-0000-4000-8000-000000000001', 2, 'lot', 'Lot en pause', 0, 0
);

delete from tap_r;
insert into tap_r select public.record_loyalty_stamp(
  'ca000000-0000-4000-8000-000000000051', repeat('f', 64), null,
  'ca000000-0000-4000-8000-000000000099');
select is((select r->>'state' from tap_r), 'stamped', 'programme C : première visite validée');
select is((select r->>'is_new_member' from tap_r), 'true',
  'programme C : le premier tampon est signalé comme une création de passeport');
select is((select jsonb_array_length(r->'milestones_reached') from tap_r), 0,
  'programme C : la première visite ne débloque aucune récompense');
select is((select r->'next_milestone'->>'visit_count' from tap_r), '2',
  'programme C : le premier palier annoncé est bien à la visite 2');

-- Deuxième visite (cooldown consommé) : le palier tombe, mais à stock 0.
update public.loyalty_members set last_stamp_at = last_stamp_at - interval '2 days'
 where token_hash = repeat('f', 64);
delete from tap_r;
insert into tap_r select public.record_loyalty_stamp(
  'ca000000-0000-4000-8000-000000000051', repeat('f', 64), null,
  'ca000000-0000-4000-8000-000000000099');
select is((select r->>'is_new_member' from tap_r), 'false',
  'programme C : le second tampon ne crée aucun passeport');
select is((select r->'milestones_reached'->0->>'out_of_stock' from tap_r), 'true',
  'programme C : stock 0 = palier en pause, signalé out_of_stock');
select is((select count(*) from public.loyalty_rewards r
    join public.loyalty_members m on m.id = r.member_id
   where m.token_hash = repeat('f', 64)), 0::bigint,
  'programme C : aucun code émis au-delà du stock (plafond de perte respecté)');

-- ══ 13. Bornes du palier `spin` (20260725200000) ═════════════
-- Trois propriétés, toutes vérifiées sur un parcours réel :
--   · le stock FINI couvre aussi les paliers `spin` — il y compte les GRANTS
--     ÉMIS, donc le nombre de tours offerts que le palier peut distribuer ;
--   · un tour offert ne tire JAMAIS un lot à stock illimité (la roue publique
--     l'accepte parce qu'elle est bornée par play_limit et la fenêtre de
--     campagne ; le tour offert n'a aucune de ces bornes) ;
--   · la campagne de la roue cible est vérifiée (statut + dates) et une
--     campagne fermée renvoie `unavailable` SANS consommer le grant.

-- Roue APPROVISIONNÉE (lot à stock fini) et roue ILLIMITÉE (lot sans stock).
insert into public.campaigns (id, organization_id, name, status)
values ('ca000000-0000-4000-8000-000000000061',
        'ca000000-0000-4000-8000-000000000001', 'Campagne bornée', 'active');
insert into public.wheels (id, organization_id, campaign_id, name, play_limit)
values ('ca000000-0000-4000-8000-000000000062',
        'ca000000-0000-4000-8000-000000000001',
        'ca000000-0000-4000-8000-000000000061', 'Roue bornée', 'unlimited');
insert into public.prizes (id, organization_id, wheel_id, label, weight, is_losing, position, stock) values
  ('ca000000-0000-4000-8000-000000000063', 'ca000000-0000-4000-8000-000000000001',
   'ca000000-0000-4000-8000-000000000062', 'Lot borné', 100, false, 0, 5),
  ('ca000000-0000-4000-8000-000000000064', 'ca000000-0000-4000-8000-000000000001',
   'ca000000-0000-4000-8000-000000000062', 'Perdu (jamais tiré)', 0, true, 1, null);

insert into public.campaigns (id, organization_id, name, status)
values ('ca000000-0000-4000-8000-000000000071',
        'ca000000-0000-4000-8000-000000000001', 'Campagne illimitée', 'active');
insert into public.wheels (id, organization_id, campaign_id, name, play_limit)
values ('ca000000-0000-4000-8000-000000000072',
        'ca000000-0000-4000-8000-000000000001',
        'ca000000-0000-4000-8000-000000000071', 'Roue illimitée', 'unlimited');
insert into public.prizes (id, organization_id, wheel_id, label, weight, is_losing, position, stock) values
  ('ca000000-0000-4000-8000-000000000073', 'ca000000-0000-4000-8000-000000000001',
   'ca000000-0000-4000-8000-000000000072', 'Lot illimité', 100, false, 0, null),
  ('ca000000-0000-4000-8000-000000000074', 'ca000000-0000-4000-8000-000000000001',
   'ca000000-0000-4000-8000-000000000072', 'Perdu (jamais tiré)', 0, true, 1, null);

-- Programme D : palier spin à la visite 2, stock 1 (UN seul tour offert).
insert into public.loyalty_programs (
  id, organization_id, name, status, validation_mode, min_stamp_interval_seconds
) values (
  'ca000000-0000-4000-8000-000000000081',
  'ca000000-0000-4000-8000-000000000001',
  'Passeport spin borné', 'active', 'staff', 300
);
insert into public.loyalty_milestones (
  id, program_id, organization_id, visit_count, reward_type,
  target_wheel_id, reward_stock, position
) values (
  'ca000000-0000-4000-8000-000000000082',
  'ca000000-0000-4000-8000-000000000081',
  'ca000000-0000-4000-8000-000000000001', 2, 'spin',
  'ca000000-0000-4000-8000-000000000062', 1, 0
);

-- Programme E : palier spin à la visite 2 ciblant la roue ILLIMITÉE.
insert into public.loyalty_programs (
  id, organization_id, name, status, validation_mode, min_stamp_interval_seconds
) values (
  'ca000000-0000-4000-8000-000000000091',
  'ca000000-0000-4000-8000-000000000001',
  'Passeport spin illimité', 'active', 'staff', 300
);
insert into public.loyalty_milestones (
  id, program_id, organization_id, visit_count, reward_type,
  target_wheel_id, reward_stock, position
) values (
  'ca000000-0000-4000-8000-000000000092',
  'ca000000-0000-4000-8000-000000000091',
  'ca000000-0000-4000-8000-000000000001', 2, 'spin',
  'ca000000-0000-4000-8000-000000000072', 5, 0
);

-- ── 13.a Le stock d'un palier spin s'épuise ──────────────────
-- Passeport X : deux visites → le seul tour offert du palier.
select is((public.record_loyalty_stamp(
    'ca000000-0000-4000-8000-000000000081', repeat('ab', 32), null,
    'ca000000-0000-4000-8000-000000000099'))->>'state',
  'stamped', 'passeport X : première visite');
update public.loyalty_members set last_stamp_at = last_stamp_at - interval '2 days'
 where token_hash = repeat('ab', 32);
delete from tap_r;
insert into tap_r select public.record_loyalty_stamp(
  'ca000000-0000-4000-8000-000000000081', repeat('ab', 32), null,
  'ca000000-0000-4000-8000-000000000099');
select matches((select r->'milestones_reached'->0->>'grant_token' from tap_r),
  '^[0-9a-f]{48}$', 'passeport X : le tour offert est émis');
select is((select reward_claimed_count from public.loyalty_milestones
    where id = 'ca000000-0000-4000-8000-000000000082'), 1,
  'le stock d''un palier spin est décompté à l''émission du grant');

-- Passeport Y : le stock (1) est épuisé → out_of_stock, AUCUN grant. C'est ce
-- qui retire tout rendement à la frappe de masse de passeports sur un palier
-- spin : au-delà du stock, un passeport de plus ne rapporte plus rien.
select is((public.record_loyalty_stamp(
    'ca000000-0000-4000-8000-000000000081', repeat('cd', 32), null,
    'ca000000-0000-4000-8000-000000000099'))->>'state',
  'stamped', 'passeport Y : première visite');
update public.loyalty_members set last_stamp_at = last_stamp_at - interval '2 days'
 where token_hash = repeat('cd', 32);
delete from tap_r;
insert into tap_r select public.record_loyalty_stamp(
  'ca000000-0000-4000-8000-000000000081', repeat('cd', 32), null,
  'ca000000-0000-4000-8000-000000000099');
select is((select r->'milestones_reached'->0->>'out_of_stock' from tap_r), 'true',
  'palier spin épuisé : out_of_stock');
select is((select r->'milestones_reached'->0->>'reward_type' from tap_r), 'spin',
  'le palier épuisé se présente bien comme un palier spin');
select is((select r->'milestones_reached'->0->>'grant_token' from tap_r), null::text,
  'aucun grant_token émis au-delà du stock du palier');
select is((select count(*) from public.loyalty_rewards
    where program_id = 'ca000000-0000-4000-8000-000000000081'), 1::bigint,
  'une seule récompense au total sur un palier spin à stock 1');
select is((select reward_claimed_count from public.loyalty_milestones
    where id = 'ca000000-0000-4000-8000-000000000082'), 1,
  'le compteur ne dépasse jamais le stock');

-- ── 13.b Un tour offert ne tire jamais un lot illimité ───────
-- Passeport Z sur le programme E : la roue cible ne propose qu'un lot à stock
-- NULL. La roue publique le tirerait (elle est bornée ailleurs) ; le tour
-- offert, lui, l'exclut — sinon chaque identité fabriquée produirait un code
-- de gain réel sans qu'aucun compteur ne bouge.
select is((public.record_loyalty_stamp(
    'ca000000-0000-4000-8000-000000000091', repeat('12', 32), null,
    'ca000000-0000-4000-8000-000000000099'))->>'state',
  'stamped', 'passeport Z : première visite');
update public.loyalty_members set last_stamp_at = last_stamp_at - interval '2 days'
 where token_hash = repeat('12', 32);
select is((public.record_loyalty_stamp(
    'ca000000-0000-4000-8000-000000000091', repeat('12', 32), null,
    'ca000000-0000-4000-8000-000000000099'))->>'state',
  'stamped', 'passeport Z : deuxième visite (grant émis)');

select is((public.consume_loyalty_spin_grant(
    'ca000000-0000-4000-8000-000000000091', repeat('12', 32),
    (select r.grant_token from public.loyalty_rewards r
       join public.loyalty_members m on m.id = r.member_id
      where m.token_hash = repeat('12', 32) and r.reward_type = 'spin')))->>'state',
  'no_prize',
  'roue sans lot à stock fini : no_prize (un lot illimité n''est pas tiré)');
select is((select count(*) from public.loyalty_rewards r
    join public.loyalty_members m on m.id = r.member_id
   where m.token_hash = repeat('12', 32) and r.consumed_at is not null), 0::bigint,
  'no_prize ne consomme pas le grant (rejouable après approvisionnement)');

-- ── 13.c Campagne fermée : unavailable sans consommer ────────
-- Le parcours de roue sain refuse une campagne non active, pas commencée ou
-- terminée (loadPlayContext) ; le tour offert doit passer les mêmes portes.
-- Il ne doit PAS coûter son tour au joueur : le grant reste intact.
update public.campaigns set status = 'paused'
 where id = 'ca000000-0000-4000-8000-000000000061';
select is((public.consume_loyalty_spin_grant(
    'ca000000-0000-4000-8000-000000000081', repeat('ab', 32),
    (select r.grant_token from public.loyalty_rewards r
       join public.loyalty_members m on m.id = r.member_id
      where m.token_hash = repeat('ab', 32) and r.reward_type = 'spin')))->>'state',
  'unavailable', 'campagne en PAUSE : unavailable');

update public.campaigns set status = 'archived'
 where id = 'ca000000-0000-4000-8000-000000000061';
select is((public.consume_loyalty_spin_grant(
    'ca000000-0000-4000-8000-000000000081', repeat('ab', 32),
    (select r.grant_token from public.loyalty_rewards r
       join public.loyalty_members m on m.id = r.member_id
      where m.token_hash = repeat('ab', 32) and r.reward_type = 'spin')))->>'state',
  'unavailable', 'campagne ARCHIVÉE : unavailable');

update public.campaigns set status = 'active', ends_at = now() - interval '1 day'
 where id = 'ca000000-0000-4000-8000-000000000061';
select is((public.consume_loyalty_spin_grant(
    'ca000000-0000-4000-8000-000000000081', repeat('ab', 32),
    (select r.grant_token from public.loyalty_rewards r
       join public.loyalty_members m on m.id = r.member_id
      where m.token_hash = repeat('ab', 32) and r.reward_type = 'spin')))->>'state',
  'unavailable', 'campagne TERMINÉE (ends_at passé) : unavailable');

update public.campaigns set ends_at = null, starts_at = now() + interval '1 day'
 where id = 'ca000000-0000-4000-8000-000000000061';
select is((public.consume_loyalty_spin_grant(
    'ca000000-0000-4000-8000-000000000081', repeat('ab', 32),
    (select r.grant_token from public.loyalty_rewards r
       join public.loyalty_members m on m.id = r.member_id
      where m.token_hash = repeat('ab', 32) and r.reward_type = 'spin')))->>'state',
  'unavailable', 'campagne PAS ENCORE COMMENCÉE (starts_at futur) : unavailable');

select is((select count(*) from public.loyalty_rewards r
    join public.loyalty_members m on m.id = r.member_id
   where m.token_hash = repeat('ab', 32) and r.consumed_at is not null), 0::bigint,
  'aucun de ces refus n''a consommé le grant');
select is((select stock from public.prizes
    where id = 'ca000000-0000-4000-8000-000000000063'), 5,
  'aucun de ces refus n''a réservé de stock sur la roue');

-- ── 13.d Le grant redevient jouable à la réactivation ────────
update public.campaigns set status = 'active', starts_at = null, ends_at = null
 where id = 'ca000000-0000-4000-8000-000000000061';
delete from tap_r;
insert into tap_r select public.consume_loyalty_spin_grant(
  'ca000000-0000-4000-8000-000000000081', repeat('ab', 32),
  (select r.grant_token from public.loyalty_rewards r
     join public.loyalty_members m on m.id = r.member_id
    where m.token_hash = repeat('ab', 32) and r.reward_type = 'spin'));
select is((select r->>'state' from tap_r), 'spun',
  'campagne réactivée : le grant conservé se joue enfin');
select is((select r->>'prize_id' from tap_r),
  'ca000000-0000-4000-8000-000000000063',
  'le lot tiré est celui qui porte un stock fini');
select is((select stock from public.prizes
    where id = 'ca000000-0000-4000-8000-000000000063'), 4,
  'le tour offert RÉSERVE le stock du lot (c''est sa borne de coût)');
select is((select count(*) from public.loyalty_rewards r
    join public.loyalty_members m on m.id = r.member_id
   where m.token_hash = repeat('ab', 32) and r.consumed_at is not null
     and r.resulting_spin_id is not null), 1::bigint,
  'le grant est enfin marqué consommé et lié à son spin');

select finish();
rollback;
