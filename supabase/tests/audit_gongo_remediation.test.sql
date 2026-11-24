-- ============================================================================
-- pgTAP : Remédiation audit GO / NO GO (migration 20261223120000)
-- ============================================================================
begin;
select plan(8);

-- ── Fixtures isolées ────────────────────────────────────────────────────────
insert into public.organizations (
  id, name, slug, subscription_status, plan, addon_loyalty, addon_calendar, addon_quiz
) values
  ('a7000000-0000-4000-8000-000000000001', 'Org Audit A', 'tap-audit-a', 'active', 'full', true, true, true),
  ('a7000000-0000-4000-8000-000000000002', 'Org Audit B', 'tap-audit-b', 'active', 'full', true, true, true);

-- Campagne budget plafonné à 100 cents : 1 lot cher (500 cents, poids 100) +
-- 1 lot abordable (50 cents, poids 10, stock 5).
insert into public.campaigns (
  id, organization_id, name, status, budget_cents, budget_spent_cents, budget_reserved_cents
) values
  ('a7000000-0000-4000-8000-000000000010', 'a7000000-0000-4000-8000-000000000001',
   'Campagne budget serré', 'active', 100, 0, 0),
  ('a7000000-0000-4000-8000-000000000011', 'a7000000-0000-4000-8000-000000000001',
   'Campagne en pause', 'paused', 1000, 0, 0);

insert into public.wheels (id, organization_id, campaign_id, name, play_limit) values
  ('a7000000-0000-4000-8000-000000000020', 'a7000000-0000-4000-8000-000000000001',
   'a7000000-0000-4000-8000-000000000010', 'Roue budget', 'once'),
  ('a7000000-0000-4000-8000-000000000021', 'a7000000-0000-4000-8000-000000000001',
   'a7000000-0000-4000-8000-000000000011', 'Roue pause', 'once');

insert into public.prizes (
  id, organization_id, wheel_id, label, weight, is_losing, position, stock, cost_cents, value_cents
) values
  ('a7000000-0000-4000-8000-000000000030', 'a7000000-0000-4000-8000-000000000001',
   'a7000000-0000-4000-8000-000000000020', 'Lot hors budget', 100, false, 0, 10, 500, 500),
  ('a7000000-0000-4000-8000-000000000031', 'a7000000-0000-4000-8000-000000000001',
   'a7000000-0000-4000-8000-000000000020', 'Lot abordable', 10, false, 1, 5, 50, 50),
  ('a7000000-0000-4000-8000-000000000032', 'a7000000-0000-4000-8000-000000000001',
   'a7000000-0000-4000-8000-000000000021', 'Lot pause', 100, false, 0, 5, 50, 50);

-- Fixtures Calendrier (1 case sur roue active à budget serré, 1 case sur roue en pause)
insert into public.calendars (
  id, organization_id, name, theme, status, start_date, timezone, day_count,
  public_slug, completion_reward_stock
) values (
  'a7000000-0000-4000-8000-000000000040', 'a7000000-0000-4000-8000-000000000001',
  'Cal audit', 'noel', 'active', current_date, 'Europe/Paris', 2,
  'tap-cal-audit-gongo', 5
);

insert into public.calendar_days (
  id, calendar_id, organization_id, day_index, unlock_at, content_type, target_wheel_id
) values
  ('a7000000-0000-4000-8000-000000000041', 'a7000000-0000-4000-8000-000000000040',
   'a7000000-0000-4000-8000-000000000001', 1, now() - interval '1 hour', 'spin',
   'a7000000-0000-4000-8000-000000000020'),
  ('a7000000-0000-4000-8000-000000000042', 'a7000000-0000-4000-8000-000000000040',
   'a7000000-0000-4000-8000-000000000001', 2, now() - interval '1 hour', 'spin',
   'a7000000-0000-4000-8000-000000000021');

insert into public.calendar_players (
  id, calendar_id, organization_id, token_hash
) values (
  'a7000000-0000-4000-8000-000000000045', 'a7000000-0000-4000-8000-000000000040',
  'a7000000-0000-4000-8000-000000000001',
  repeat('a', 64)
);

insert into public.calendar_openings (
  id, calendar_id, day_id, player_id, organization_id, content_type, spin_grant_token
) values
  ('a7000000-0000-4000-8000-000000000046', 'a7000000-0000-4000-8000-000000000040',
   'a7000000-0000-4000-8000-000000000041', 'a7000000-0000-4000-8000-000000000045',
   'a7000000-0000-4000-8000-000000000001', 'spin', repeat('b', 48)),
  ('a7000000-0000-4000-8000-000000000047', 'a7000000-0000-4000-8000-000000000040',
   'a7000000-0000-4000-8000-000000000042', 'a7000000-0000-4000-8000-000000000045',
   'a7000000-0000-4000-8000-000000000001', 'spin', repeat('c', 48));

-- Exécution en tant que service_role
select set_config('request.jwt.claims', '{"role":"service_role"}', true);

-- 1. Tour offert calendrier sur campagne en pause -> 'unavailable' (jamais spun)
select is(
  (public.consume_calendar_spin_grant(
    'a7000000-0000-4000-8000-000000000040',
    repeat('a', 64),
    repeat('c', 48)
  ))->>'state',
  'unavailable',
  'consume_calendar_spin_grant refuse une campagne cible en pause'
);

-- 2. Tour offert calendrier sur campagne à budget serré : ignore le lot hors
--    budget (500c > 100c) et tire le lot abordable (50c) sans lever P0001.
create temp table tap_cal_res as
select public.consume_calendar_spin_grant(
  'a7000000-0000-4000-8000-000000000040',
  repeat('a', 64),
  repeat('b', 48)
) as body;

select is(
  (select body->>'state' from tap_cal_res),
  'spun',
  'consume_calendar_spin_grant tire un lot abordable sans crash P0001'
);

select is(
  (select body->>'prize_id' from tap_cal_res),
  'a7000000-0000-4000-8000-000000000031',
  'consume_calendar_spin_grant exclut le lot hors budget et choisit le lot abordable'
);

-- 3. Claim + cancel_participation : budget_spent_cents doit être remboursé
create temp table tap_claim_res as
select * from public.claim_winning_spin(
  (select (body->>'spin_id')::uuid from tap_cal_res),
  'Alice', 'alice@example.test', null, true, false, false
);

select is(
  (select budget_spent_cents from public.campaigns where id = 'a7000000-0000-4000-8000-000000000010'),
  50,
  'claim_winning_spin transfère bien les 50 cents en budget_spent_cents'
);

select is(
  public.cancel_participation(
    'a7000000-0000-4000-8000-000000000001',
    (select participation_id from tap_claim_res),
    'Annulation test audit budget',
    true
  ),
  true,
  'cancel_participation réussit'
);

select is(
  (select budget_spent_cents from public.campaigns where id = 'a7000000-0000-4000-8000-000000000010'),
  0,
  'cancel_participation rembourse budget_spent_cents sur la campagne'
);

-- 4. Contrainte wheels_secret_skill_finite_check : interdit unlimited sur mystery_word
select throws_ok(
  $$
    insert into public.wheels (organization_id, campaign_id, name, game_type, play_limit)
    values (
      'a7000000-0000-4000-8000-000000000001',
      'a7000000-0000-4000-8000-000000000010',
      'Mot mystère illimité interdit',
      'mystery_word',
      'unlimited'
    )
  $$,
  '23514',
  null,
  'wheels_secret_skill_finite_check bloque mystery_word en play_limit unlimited'
);

-- 5. set_campaign_status cross-tenant retourne false sans toucher la campagne d'Org A
select is(
  public.set_campaign_status(
    'a7000000-0000-4000-8000-000000000002',
    'a7000000-0000-4000-8000-000000000010',
    'paused',
    'Tentative cross-tenant'
  ),
  false,
  'set_campaign_status refuse une campagne d une autre organisation'
);

select * from finish();
rollback;
