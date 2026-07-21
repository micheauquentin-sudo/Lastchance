-- ============================================================
-- Chasse au trésor multi-QR — comportement réel de la RPC
-- record_hunt_scan et de la remise en caisse, sur base migrée
-- vierge (fixtures locales) :
--   1. Indisponibilité : addon coupé, chasse non active, fenêtre
--      de dates close → 'unavailable', sans oracle sur le motif.
--   2. Ordre imposé : l'étape attendue est la première position
--      non tamponnée ; scan hors ordre refusé sans effet.
--   3. Délai minimal entre deux scans d'un même joueur.
--   4. Idempotence : re-scan d'une étape déjà tamponnée = 'already',
--      re-scan d'une chasse complétée = 'completed' + même code.
--   5. Complétion : code CHASSE-XXXXXXXX, compteur de stock ;
--      stock épuisé = 'hunt_full' (scan conservé), réarmé si le
--      commerçant relève le stock.
--   6. Caisse : remise atomique auditée, code insensible à la
--      casse, déjà remis ou autre organisation → refus générique.
--   7. Purge RGPD : purge_expired_hunt_players cascade vers les
--      scans et complétions.
-- ============================================================
begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

select set_config('request.jwt.claims', '{"role":"service_role"}', true);

-- ── Fixtures : chasse ordonnée, 3 étapes, délai 10 min, stock 1 ─
insert into public.organizations (id, name, slug, addon_hunts)
values ('ab000000-0000-4000-8000-000000000001', 'Test Chasse', 'tap-hunts', true);
-- Seconde organisation : preuve du cloisonnement de la caisse.
insert into public.organizations (id, name, slug, addon_hunts)
values ('ab000000-0000-4000-8000-000000000031', 'Autre Org', 'tap-hunts-2', true);

insert into public.hunts (
  id, organization_id, name, status, order_mode,
  min_scan_interval_seconds, reward_label, reward_stock
) values (
  'ab000000-0000-4000-8000-000000000002',
  'ab000000-0000-4000-8000-000000000001',
  'Chasse du café', 'active', 'ordered', 600, 'Trésor du patron', 1
);

insert into public.hunt_steps (id, hunt_id, organization_id, position, label, hint_text, token) values
  ('ab000000-0000-4000-8000-000000000011', 'ab000000-0000-4000-8000-000000000002',
   'ab000000-0000-4000-8000-000000000001', 1, 'Comptoir', 'Cherchez la vitrine', 'TAPHUNTSTEP1'),
  ('ab000000-0000-4000-8000-000000000012', 'ab000000-0000-4000-8000-000000000002',
   'ab000000-0000-4000-8000-000000000001', 2, 'Vitrine', 'Direction la terrasse', 'TAPHUNTSTEP2'),
  ('ab000000-0000-4000-8000-000000000013', 'ab000000-0000-4000-8000-000000000002',
   'ab000000-0000-4000-8000-000000000001', 3, 'Terrasse', null, 'TAPHUNTSTEP3');

-- Capture d'une seule évaluation par appel à effet de bord.
create temporary table tap_r (r jsonb) on commit drop;

-- ══ 1. Indisponibilité (même réponse quel que soit le motif) ══
select is((public.record_hunt_scan('INCONNU-123', repeat('a', 64)))->>'state',
  'unavailable', 'jeton d''étape inconnu : unavailable');

update public.organizations set addon_hunts = false
 where id = 'ab000000-0000-4000-8000-000000000001';
select is((public.record_hunt_scan('TAPHUNTSTEP1', repeat('a', 64)))->>'state',
  'unavailable', 'addon coupé : unavailable, indistinguable d''un jeton inconnu');
update public.organizations set addon_hunts = true
 where id = 'ab000000-0000-4000-8000-000000000001';

update public.hunts set status = 'draft'
 where id = 'ab000000-0000-4000-8000-000000000002';
select is((public.record_hunt_scan('TAPHUNTSTEP1', repeat('a', 64)))->>'state',
  'unavailable', 'chasse en brouillon : unavailable');
update public.hunts set status = 'active', ends_at = now() - interval '1 hour'
 where id = 'ab000000-0000-4000-8000-000000000002';
select is((public.record_hunt_scan('TAPHUNTSTEP1', repeat('a', 64)))->>'state',
  'unavailable', 'fenêtre close : unavailable');
update public.hunts set ends_at = null
 where id = 'ab000000-0000-4000-8000-000000000002';

select is((select count(*) from public.hunt_players), 0::bigint,
  'aucun joueur créé par un scan indisponible');

-- ══ 2. Ordre imposé ══════════════════════════════════════════
select is((public.record_hunt_scan('TAPHUNTSTEP2', repeat('a', 64)))->>'state',
  'wrong_order', 'ordre imposé : l''étape 2 est refusée avant l''étape 1');
select is((public.record_hunt_scan('TAPHUNTSTEP2', repeat('a', 64)))->>'expected_position',
  '1', 'l''étape attendue est la première non tamponnée');
select is((select count(*) from public.hunt_scans), 0::bigint,
  'un scan hors ordre ne tamponne rien');

delete from tap_r;
insert into tap_r select public.record_hunt_scan('TAPHUNTSTEP1', repeat('a', 64));
select is((select r->>'state' from tap_r), 'scanned', 'étape 1 tamponnée');
select is((select r->'progress'->>'done' from tap_r), '1', 'progression 1/3');
select is((select r->'progress'->>'total' from tap_r), '3', 'total = 3 étapes');
select is((select r->'step'->>'hint' from tap_r), 'Cherchez la vitrine',
  'l''indice est révélé une fois l''étape tamponnée');
select is((select count(*) from public.hunt_players), 1::bigint,
  'le joueur est créé à son premier scan');

-- ══ 3. Délai minimal entre deux scans ════════════════════════
delete from tap_r;
insert into tap_r select public.record_hunt_scan('TAPHUNTSTEP2', repeat('a', 64));
select is((select r->>'state' from tap_r), 'too_soon',
  'scan enchaîné trop vite : refusé (anti-partage de photos)');
select is((select r->>'retry_in_seconds' from tap_r), '600',
  'le délai restant est annoncé');
select is((select count(*) from public.hunt_scans), 1::bigint,
  'un scan trop tôt ne tamponne rien');

update public.hunt_scans set scanned_at = scanned_at - interval '11 minutes';
delete from tap_r;
insert into tap_r select public.record_hunt_scan('TAPHUNTSTEP2', repeat('a', 64));
select is((select r->>'state' from tap_r), 'scanned',
  'délai écoulé : l''étape 2 se tamponne');

-- ══ 4. Idempotence du re-scan ════════════════════════════════
delete from tap_r;
insert into tap_r select public.record_hunt_scan('TAPHUNTSTEP2', repeat('a', 64));
select is((select r->>'state' from tap_r), 'already',
  're-scan d''une étape déjà tamponnée : état renvoyé sans erreur');
select is((select r->'progress'->>'done' from tap_r), '2', 'progression inchangée 2/3');
select is((select count(*) from public.hunt_scans), 2::bigint,
  'aucun tampon dupliqué');

select is((public.record_hunt_scan('TAPHUNTSTEP1', repeat('a', 64)))->>'state',
  'already', 'le re-scan ignore aussi le délai minimal');

-- ══ 5. Complétion et stock ═══════════════════════════════════
update public.hunt_scans set scanned_at = scanned_at - interval '11 minutes';
delete from tap_r;
insert into tap_r select public.record_hunt_scan('TAPHUNTSTEP3', repeat('a', 64));
select is((select r->>'state' from tap_r), 'completed', 'dernière étape : chasse complétée');
select is((select r->>'already' from tap_r), 'false', 'complétion fraîche');
select matches((select r->>'code' from tap_r), '^CHASSE-[A-HJ-NP-Z2-9]{8}$',
  'code de retrait au format CHASSE-XXXXXXXX (alphabet sans I/O/0/1)');
select is((select r->'stamped' from tap_r), '[1, 2, 3]'::jsonb, 'les trois positions sont tamponnées');
select is((select reward_claimed_count from public.hunts
  where id = 'ab000000-0000-4000-8000-000000000002'), 1, 'le compteur de lots émis avance');

-- Re-scan après complétion : même code, sans erreur.
select is((public.record_hunt_scan('TAPHUNTSTEP2', repeat('a', 64)))->>'state',
  'completed', 're-scan après complétion : état final renvoyé');
select is(
  (public.record_hunt_scan('TAPHUNTSTEP2', repeat('a', 64)))->>'code',
  (select r->>'code' from tap_r), 'le code renvoyé est le même');

-- Second joueur : le stock (1) est épuisé.
select is((public.record_hunt_scan('TAPHUNTSTEP1', repeat('b', 64)))->>'state',
  'scanned', 'joueur B : étape 1');
update public.hunt_scans set scanned_at = scanned_at - interval '11 minutes';
select is((public.record_hunt_scan('TAPHUNTSTEP2', repeat('b', 64)))->>'state',
  'scanned', 'joueur B : étape 2');
update public.hunt_scans set scanned_at = scanned_at - interval '11 minutes';
delete from tap_r;
insert into tap_r select public.record_hunt_scan('TAPHUNTSTEP3', repeat('b', 64));
select is((select r->>'state' from tap_r), 'hunt_full',
  'stock épuisé : pas de code, échec propre');
select is((select count(*) from public.hunt_scans), 6::bigint,
  'le dernier tampon est conservé malgré le stock épuisé');
select is((select count(*) from public.hunt_completions), 1::bigint,
  'aucune complétion créée sans stock');

-- Le commerçant relève le stock : le joueur bloqué obtient son code.
update public.hunts set reward_stock = 2
 where id = 'ab000000-0000-4000-8000-000000000002';
delete from tap_r;
insert into tap_r select public.record_hunt_scan('TAPHUNTSTEP3', repeat('b', 64));
select is((select r->>'state' from tap_r), 'completed',
  'stock relevé : le re-scan délivre la complétion');
select is((select reward_claimed_count from public.hunts
  where id = 'ab000000-0000-4000-8000-000000000002'), 2, 'second lot décompté');

-- ══ 6. Remise en caisse ══════════════════════════════════════
create temporary table tap_code on commit drop as
select c.code from public.hunt_completions c
  join public.hunt_players p on p.id = c.player_id
 where p.token_hash = repeat('a', 64);

select is(
  (select redeemed_now from public.redeem_hunt_completion(
    'ab000000-0000-4000-8000-000000000001',
    (select lower(code) from tap_code), 'caisse@test.local')),
  true, 'remise validée (code insensible à la casse)');
select is((select count(*) from public.hunt_completions
  where redeemed_at is not null and redeemed_by = 'caisse@test.local'),
  1::bigint, 'horodatage et acteur posés atomiquement');
select is((select count(*) from public.audit_logs where action = 'hunt.redeem'),
  1::bigint, 'la remise est auditée');

select is(
  (select redeemed_now from public.redeem_hunt_completion(
    'ab000000-0000-4000-8000-000000000001',
    (select code from tap_code), 'caisse@test.local')),
  false, 'un code déjà remis est refusé (redeemed_now = false)');

select is(
  (select count(*) from public.redeem_hunt_completion(
    'ab000000-0000-4000-8000-000000000031',
    (select code from tap_code), 'caisse@test.local')),
  0::bigint, 'code d''une autre organisation : aucune ligne, refus générique');

select throws_ok(
  format($f$select * from public.redeem_hunt_completion(
    'ab000000-0000-4000-8000-000000000001', '%s', '')$f$,
    (select code from tap_code)),
  'P0001', 'actor required', 'la caisse doit s''identifier');

-- ══ 7. Purge RGPD ════════════════════════════════════════════
update public.organizations set data_retention_months = 1
 where id = 'ab000000-0000-4000-8000-000000000001';
update public.hunt_players set created_at = created_at - interval '2 months';
select is(public.purge_expired_hunt_players(), 2::bigint,
  'les joueurs au-delà de la rétention sont purgés');
select is((select count(*) from public.hunt_scans), 0::bigint,
  'leurs scans suivent (cascade)');
select is((select count(*) from public.hunt_completions), 0::bigint,
  'leurs complétions suivent (cascade)');
select is((select count(*) from public.hunt_steps), 3::bigint,
  'les étapes du commerçant restent intactes');

select finish();
rollback;
