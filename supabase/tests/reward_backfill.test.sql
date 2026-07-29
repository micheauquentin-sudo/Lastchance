-- ============================================================
-- Backfill du registre universel — preuve du prérequis de l'item 4
--
-- Ce que ces tests établissent, dans l'ordre d'importance :
--   1. une ligne historique SANS miroir devient encaissable par le moteur
--      SEUL, c'est-à-dire sans le repli legacy — c'est tout l'objet ;
--   2. rejouer la synchro est IDEMPOTENT : ni doublon, ni écrasement d'un
--      état déjà remis ;
--   3. le contrôle négatif : sans la synchro, le moteur reste aveugle.
--
-- Le motif du test (1) reprend délibérément celui de
-- `universal_rewards.test.sql:311-341`, qui supprime la ligne de registre pour
-- SIMULER une émission antérieure à la migration. Là où ce test-là prouvait
-- que le repli sauve la mise, celui-ci prouve qu'après backfill le repli n'est
-- plus nécessaire.
-- ============================================================
begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

select set_config('request.jwt.claims', '{"role":"service_role"}', true);

-- ── Fixtures : une organisation, un caissier, une chasse remportée ────
insert into public.organizations (id, name, slug)
values ('d0000000-0000-4000-8000-000000000001', 'Org Backfill', 'tap-backfill');

insert into auth.users (id, email)
values ('d0000000-0000-4000-8000-0000000000a1', 'caissier@tap.local');

insert into public.organization_members (organization_id, user_id, role)
values (
  'd0000000-0000-4000-8000-000000000001',
  'd0000000-0000-4000-8000-0000000000a1',
  'cashier'
);

insert into public.hunts (id, organization_id, name, status)
values (
  'd0000000-0000-4000-8000-000000000010',
  'd0000000-0000-4000-8000-000000000001',
  'Chasse Backfill',
  'active'
);

-- `hunt_completions.player_id` référence `hunt_players` (FK composite sur
-- id + hunt_id + organization_id) : le joueur existe d'abord, la complétion
-- ensuite. Le miroir lit `hp.token_hash` pour résoudre l'identité
-- (universal_rewards.sql:307), d'où un jeton réaliste de 64 caractères.
insert into public.hunt_players (id, hunt_id, organization_id, token_hash)
values (
  'd0000000-0000-4000-8000-000000000015',
  'd0000000-0000-4000-8000-000000000010',
  'd0000000-0000-4000-8000-000000000001',
  repeat('b', 64)
);

insert into public.hunt_completions (
  id, organization_id, hunt_id, player_id, code, completed_at
)
values (
  'd0000000-0000-4000-8000-000000000020',
  'd0000000-0000-4000-8000-000000000001',
  'd0000000-0000-4000-8000-000000000010',
  'd0000000-0000-4000-8000-000000000015',
  'CHASSE-BFCD2345',
  pg_catalog.now()
);

-- ── Simulation d'une émission ANTÉRIEURE à la migration ──────────────
-- Le trigger vient de créer le miroir ; on le retire pour reproduire l'état
-- réel du parc historique.
delete from public.reward_issuances
where source_type = 'hunt'
  and source_id = 'd0000000-0000-4000-8000-000000000020';

select is(
  (select count(*)::int from public.reward_issuances
   where code = 'CHASSE-BFCD2345'),
  0,
  'point de départ : la ligne historique n''a aucun miroir au registre'
);

-- ── 1. CONTRÔLE NÉGATIF : sans backfill, le moteur est aveugle ───────
select is(
  (select count(*)::int from public.redeem_reward_by_code(
     'd0000000-0000-4000-8000-000000000001',
     'CHASSE-BFCD2345',
     'd0000000-0000-4000-8000-0000000000a1'
   )),
  0,
  'sans backfill le moteur ne rend AUCUNE ligne — c''est le repli legacy qui sauvait ce code'
);

select is(
  (select redeemed_at is null from public.hunt_completions
   where id = 'd0000000-0000-4000-8000-000000000020'),
  true,
  'et la source legacy reste intacte : rien n''a été remis à l''insu du caissier'
);

-- ── 2. Le backfill rend la ligne visible ─────────────────────────────
select lives_ok(
  $$select public.sync_reward_issuance(
      'hunt_completions', 'd0000000-0000-4000-8000-000000000020')$$,
  'la synchro rejouée sur une ligne historique aboutit'
);

select is(
  (select count(*)::int from public.reward_issuances
   where code = 'CHASSE-BFCD2345'
     and organization_id = 'd0000000-0000-4000-8000-000000000001'),
  1,
  'le miroir existe désormais, et une seule fois'
);

-- ── 3. IDEMPOTENCE : rejouer ne duplique pas ─────────────────────────
select lives_ok(
  $$select public.sync_reward_issuance(
      'hunt_completions', 'd0000000-0000-4000-8000-000000000020')$$,
  'rejouer la synchro une seconde fois n''échoue pas'
);

select is(
  (select count(*)::int from public.reward_issuances
   where code = 'CHASSE-BFCD2345'),
  1,
  'toujours une seule ligne — le backfill est rejouable sans dégât'
);

-- ── 4. LE POINT CENTRAL : le moteur SEUL encaisse maintenant ─────────
select is(
  (select state from public.redeem_reward_by_code(
     'd0000000-0000-4000-8000-000000000001',
     'CHASSE-BFCD2345',
     'd0000000-0000-4000-8000-0000000000a1'
   )),
  'redeemed',
  'APRÈS BACKFILL le moteur remet le lot SANS repli legacy — le prérequis de l''item 4 est levé'
);

select is(
  (select redeemed_at is not null from public.hunt_completions
   where id = 'd0000000-0000-4000-8000-000000000020'),
  true,
  'et la source legacy est bien marquée remise : le moteur a traversé jusqu''à elle'
);

-- ── 5. Le second passage est refusé, pas rejoué ──────────────────────
select is(
  (select state from public.redeem_reward_by_code(
     'd0000000-0000-4000-8000-000000000001',
     'CHASSE-BFCD2345',
     'd0000000-0000-4000-8000-0000000000a1'
   )),
  'already_redeemed',
  'une seconde présentation du même code est refusée — pas de double remise'
);

-- ── 6. Une synchro rejouée APRÈS remise n'efface pas l'encaissement ──
-- Cas réel : le backfill tourne alors que des remises ont déjà eu lieu.
select lives_ok(
  $$select public.sync_reward_issuance(
      'hunt_completions', 'd0000000-0000-4000-8000-000000000020')$$,
  'la synchro accepte de repasser sur une ligne déjà remise'
);

select is(
  (select state from public.redeem_reward_by_code(
     'd0000000-0000-4000-8000-000000000001',
     'CHASSE-BFCD2345',
     'd0000000-0000-4000-8000-0000000000a1'
   )),
  'already_redeemed',
  'le lot reste remis — un backfill tardif ne ROUVRE JAMAIS un lot déjà encaissé'
);

select * from finish();
rollback;
