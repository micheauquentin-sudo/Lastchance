-- ============================================================
-- Registre universel progressif — miroir, tenant, cycle de vie
-- ============================================================
begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

select set_config('request.jwt.claims', '{"role":"service_role"}', true);

select has_trigger('public', 'participations', 'participations_reward_issuance', 'wheel emissions are mirrored');
select has_trigger('public', 'hunt_completions', 'hunt_completions_reward_issuance', 'hunt emissions are mirrored');
select has_trigger('public', 'loyalty_rewards', 'loyalty_rewards_reward_issuance', 'code-bearing loyalty emissions are mirrored');
select has_trigger('public', 'jackpot_wins', 'jackpot_wins_reward_issuance', 'jackpot emissions are mirrored');
select has_trigger('public', 'event_wins', 'event_wins_reward_issuance', 'event emissions are mirrored');
select has_trigger('public', 'calendar_openings', 'calendar_openings_reward_issuance', 'calendar day lots are mirrored');
select has_trigger('public', 'calendar_rewards', 'calendar_rewards_reward_issuance', 'calendar completion lots are mirrored');
select has_trigger('public', 'referral_rewards', 'referral_rewards_reward_issuance', 'code-bearing referral emissions are mirrored');
select has_trigger('public', 'quiz_rewards', 'quiz_rewards_reward_issuance', 'code-bearing quiz emissions are mirrored');
select has_trigger('public', 'contest_awards', 'contest_awards_reward_issuance', 'contest emissions are mirrored');
-- 10e famille (RES-5, 20261010120000). La table des prises reste L'AUTORITÉ du
-- stock : ce trigger ne fait que porter le code jusqu'à la caisse universelle.
select has_trigger('public', 'reservation_stock_holds', 'reservation_stock_holds_reward_issuance', 'stock holds are mirrored');

insert into auth.users (
  id, aud, role, email, encrypted_password, created_at, updated_at
) values
  (
    'f1000000-0000-4000-8000-00000000a001',
    'authenticated', 'authenticated', 'cashier-one@tap.local', '',
    now(), now()
  ),
  (
    'f1000000-0000-4000-8000-00000000a002',
    'authenticated', 'authenticated', 'cashier-two@tap.local', '',
    now(), now()
  ),
  (
    'f1000000-0000-4000-8000-00000000a003',
    'authenticated', 'authenticated', 'outsider@tap.local', '',
    now(), now()
  );

insert into public.organizations (id, name, slug) values
  ('f1000000-0000-4000-8000-000000000001', 'Rewards TAP', 'tap-rewards'),
  ('f1000000-0000-4000-8000-000000000002', 'Other Rewards TAP', 'tap-rewards-other');

insert into public.organization_members (organization_id, user_id, role) values
  (
    'f1000000-0000-4000-8000-000000000001',
    'f1000000-0000-4000-8000-00000000a001',
    'cashier'
  ),
  (
    'f1000000-0000-4000-8000-000000000002',
    'f1000000-0000-4000-8000-00000000a002',
    'cashier'
  );

insert into public.campaigns (
  id, organization_id, name, status, code_ttl_seconds
) values (
  'f1000000-0000-4000-8000-000000000010',
  'f1000000-0000-4000-8000-000000000001',
  'Campagne registre', 'active', null
);

insert into public.wheels (
  id, organization_id, campaign_id, name, play_limit
) values (
  'f1000000-0000-4000-8000-000000000020',
  'f1000000-0000-4000-8000-000000000001',
  'f1000000-0000-4000-8000-000000000010',
  'Roue registre', 'unlimited'
);

insert into public.prizes (
  id, organization_id, wheel_id, label, description, stock
) values (
  'f1000000-0000-4000-8000-000000000030',
  'f1000000-0000-4000-8000-000000000001',
  'f1000000-0000-4000-8000-000000000020',
  'Café offert', 'Sur place', 10
);

-- Nouvelle émission : le trigger écrit le registre dans la même transaction.
insert into public.participations (
  id, organization_id, campaign_id, wheel_id, prize_id,
  first_name, email, accepted_terms, redeem_code, player_key
) values (
  'f1000000-0000-4000-8000-000000000101',
  'f1000000-0000-4000-8000-000000000001',
  'f1000000-0000-4000-8000-000000000010',
  'f1000000-0000-4000-8000-000000000020',
  'f1000000-0000-4000-8000-000000000030',
  'Alice', 'alice@tap.local', true, 'GAIN-ABCD2345', repeat('a', 64)
);

select results_eq(
  $$select source_type, source_id, code, label
      from public.reward_issuances
     where organization_id = 'f1000000-0000-4000-8000-000000000001'$$,
  $$values (
    'wheel'::text,
    'f1000000-0000-4000-8000-000000000101'::uuid,
    'GAIN-ABCD2345'::text,
    'Café offert'::text
  )$$,
  'a new legacy issuance is mirrored with its stable source identity'
);

select is(
  (select player_id from public.reward_issuances
    where code = 'GAIN-ABCD2345'),
  null::uuid,
  'central player identity remains nullable when no legacy bridge exists'
);

select ok(
  (select metadata ? 'experience_label'
      and metadata->>'legacy_table' = 'participations'
      and metadata::text not ilike '%alice%'
      and metadata::text not ilike '%tap.local%'
     from public.reward_issuances
    where code = 'GAIN-ABCD2345'),
  'mirror metadata is useful but contains no legacy PII'
);

-- Un autre tenant ne peut ni découvrir ni remettre le code.
select results_eq(
  $$select count(*)::bigint
      from public.redeem_reward_by_code(
        'f1000000-0000-4000-8000-000000000002',
        'GAIN-ABCD2345',
        'f1000000-0000-4000-8000-00000000a002',
        999
      )$$,
  array[0::bigint],
  'cross-tenant universal redemption is indistinguishable from an unknown code'
);

select is(
  (select redeemed_at from public.participations
    where id = 'f1000000-0000-4000-8000-000000000101'),
  null::timestamptz,
  'cross-tenant attempt leaves the authoritative source untouched'
);

select throws_ok(
  $$select * from public.redeem_reward_by_code(
      'f1000000-0000-4000-8000-000000000001',
      'GAIN-ABCD2345',
      'f1000000-0000-4000-8000-00000000a002'
    )$$,
  '42501', 'not authorized',
  'a cashier from another organization cannot be attributed a redemption'
);

select throws_ok(
  $$select * from public.redeem_reward_by_code(
      'f1000000-0000-4000-8000-000000000001',
      'GAIN-ABCD2345',
      'f1000000-0000-4000-8000-00000000a003'
    )$$,
  '42501', 'not authorized',
  'a non-member cannot be attributed a universal redemption'
);

select throws_ok(
  $$select * from public.redeem_reward_by_code(
      'f1000000-0000-4000-8000-000000000001',
      'GAIN-ABCD2345',
      'cashier-free-text'
    )$$,
  '42501', 'not authorized',
  'a free-text actor cannot be forged in the central audit'
);

-- Premier appel : l'unique UPDATE métier est effectué par redeem_by_code.
select results_eq(
  $$select state, redeemed_now, basket_cents
      from public.redeem_reward_by_code(
        'f1000000-0000-4000-8000-000000000001',
        'gain-abcd2345',
        'f1000000-0000-4000-8000-00000000a001',
        1250
      )$$,
  $$values ('redeemed'::text, true, 1250)$$,
  'universal RPC routes to the legacy RPC and records the basket'
);

select ok(
  (select redeemed_at is not null and basket_cents = 1250
     from public.participations
    where id = 'f1000000-0000-4000-8000-000000000101'),
  'legacy table remains authoritative for the redeemed state'
);

select results_eq(
  $$select redeemed_by, basket_cents, wallet_status
      from public.reward_issuances where code = 'GAIN-ABCD2345'$$,
  $$values (
    'f1000000-0000-4000-8000-00000000a001'::text,
    1250,
    'revocation_requested'::text
  )$$,
  'registry reconciles actor, basket and Wallet invalidation request'
);

-- Le second appel simule le concurrent perdant : aucune seconde mutation,
-- aucun écrasement du panier et un état explicite.
select results_eq(
  $$select state, redeemed_now, basket_cents
      from public.redeem_reward_by_code(
        'f1000000-0000-4000-8000-000000000001',
        'GAIN-ABCD2345',
        'f1000000-0000-4000-8000-00000000a001',
        9900
      )$$,
  $$values ('already_redeemed'::text, false, 1250)$$,
  'a competing or repeated redemption is idempotently refused'
);

select is(
  (select count(*) from public.reward_issuances
    where source_type = 'wheel'
      and source_id = 'f1000000-0000-4000-8000-000000000101'),
  1::bigint,
  'mirror upsert never duplicates an issuance'
);

select is(
  (select count(*) from public.audit_logs
    where organization_id = 'f1000000-0000-4000-8000-000000000001'
      and action = 'reward.redeem'),
  1::bigint,
  'only the successful universal redemption adds a central audit event'
);

-- Annulation legacy : le trigger réconcilie sans jamais restocker lui-même.
insert into public.participations (
  id, organization_id, campaign_id, wheel_id, prize_id,
  first_name, email, accepted_terms, redeem_code, player_key
) values (
  'f1000000-0000-4000-8000-000000000102',
  'f1000000-0000-4000-8000-000000000001',
  'f1000000-0000-4000-8000-000000000010',
  'f1000000-0000-4000-8000-000000000020',
  'f1000000-0000-4000-8000-000000000030',
  'Bob', 'bob@tap.local', true, 'GAIN-EFGH2345', repeat('b', 64)
);

select is(
  public.cancel_participation(
    'f1000000-0000-4000-8000-000000000001',
    'f1000000-0000-4000-8000-000000000102',
    'annulation motivée pour test'
  ),
  true,
  'legacy cancellation remains the only cancellation business operation'
);

select ok(
  (select cancelled_at is not null
      and cancelled_reason = 'annulation motivée pour test'
      and wallet_status = 'revocation_requested'
     from public.reward_issuances where code = 'GAIN-EFGH2345'),
  'cancellation and its reason are mirrored with Wallet invalidation'
);

select results_eq(
  $$select state, redeemed_now
      from public.redeem_reward_by_code(
        'f1000000-0000-4000-8000-000000000001',
        'GAIN-EFGH2345',
        'f1000000-0000-4000-8000-00000000a001'
      )$$,
  $$values ('cancelled'::text, false)$$,
  'a cancelled reward cannot be redeemed through the universal RPC'
);

-- Expiration dérivée côté serveur, sans mutation opportuniste du registre.
insert into public.participations (
  id, organization_id, campaign_id, wheel_id, prize_id,
  first_name, email, accepted_terms, redeem_code, player_key,
  created_at, redeem_expires_at
) values (
  'f1000000-0000-4000-8000-000000000103',
  'f1000000-0000-4000-8000-000000000001',
  'f1000000-0000-4000-8000-000000000010',
  'f1000000-0000-4000-8000-000000000020',
  'f1000000-0000-4000-8000-000000000030',
  'Chloé', 'chloe@tap.local', true, 'GAIN-JKLM2345', repeat('c', 64),
  now() - interval '1 day', now() - interval '5 minutes'
);

select results_eq(
  $$select state, redeemed_now
      from public.redeem_reward_by_code(
        'f1000000-0000-4000-8000-000000000001',
        'GAIN-JKLM2345',
        'f1000000-0000-4000-8000-00000000a001'
      )$$,
  $$values ('expired'::text, false)$$,
  'expired reward is refused before touching the legacy source'
);

select is(
  (select redeemed_at from public.participations
    where id = 'f1000000-0000-4000-8000-000000000103'),
  null::timestamptz,
  'expired universal attempt leaves the legacy source unredeemed'
);

-- Ancien code non backfillé : au premier changement legacy, le trigger le
-- recrée. Cette suppression simule une ligne antérieure à la migration.
insert into public.participations (
  id, organization_id, campaign_id, wheel_id, prize_id,
  first_name, email, accepted_terms, redeem_code, player_key
) values (
  'f1000000-0000-4000-8000-000000000104',
  'f1000000-0000-4000-8000-000000000001',
  'f1000000-0000-4000-8000-000000000010',
  'f1000000-0000-4000-8000-000000000020',
  'f1000000-0000-4000-8000-000000000030',
  'Dan', 'dan@tap.local', true, 'GAIN-NPQR2345', repeat('d', 64)
);
delete from public.reward_issuances where code = 'GAIN-NPQR2345';

select results_eq(
  $$select redeemed_now from public.redeem_by_code(
      'f1000000-0000-4000-8000-000000000001',
      'GAIN-NPQR2345', 'legacy-cashier'
    )$$,
  $$values (true)$$,
  'legacy fallback still redeems a non-mirrored historical code'
);

select ok(
  (select redeemed_at is not null
      and source_type = 'wheel'
      and source_id = 'f1000000-0000-4000-8000-000000000104'
     from public.reward_issuances where code = 'GAIN-NPQR2345'),
  'legacy mutation lazily recreates and reconciles the central issuance'
);

select * from finish();
rollback;
