begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

insert into public.organizations (id, name, slug, stripe_customer_id)
values
  ('ba100000-0000-4000-8000-000000000001', 'Projection A', 'projection-a', 'cus_projection_a'),
  ('ba100000-0000-4000-8000-000000000002', 'Projection B', 'projection-b', 'cus_projection_b');

select set_config('request.jwt.claims', '{"role":"service_role"}', true);

create temporary table tap_projection_first on commit drop as
select * from public.apply_stripe_subscription_projection_v1(
  'evt_projection_1',
  '2026-08-23T10:00:00Z',
  'cus_projection_a',
  'sub_projection_a',
  'active',
  false,
  null,
  null,
  null,
  '2026-09-23T10:00:00Z',
  '[{"item_id":"si_main","price_id":"price_main","product_id":"prod_main","price_nickname":"Sur Place","quantity":1,"currency":"eur","unit_amount_cents":7900,"recurring_interval":"month","recurring_interval_count":1,"usage_type":"licensed","current_period_end":"2026-09-23T10:00:00Z","monthly_amount_cents":7900}]'::jsonb,
  7900
);

select is((select applied from tap_projection_first), true,
  'la premiere photographie Stripe est appliquee');
select is((select duplicate from tap_projection_first), false,
  'la premiere photographie n est pas un doublon');
select is(
  (select mrr_monthly_cents from public.stripe_subscription_projections
    where subscription_id = 'sub_projection_a'),
  7900::bigint,
  'le MRR persiste vient des items recurrents Stripe'
);
select is(
  (select items -> 0 ->> 'price_id'
     from public.stripe_subscription_projections
    where subscription_id = 'sub_projection_a'),
  'price_main',
  'la ligne de prix Stripe est lisible sans appel distant'
);

select is(
  (select duplicate from public.apply_stripe_subscription_projection_v1(
    'evt_projection_1',
    '2026-08-23T10:00:00Z',
    'cus_projection_a',
    'sub_projection_a',
    'canceled',
    true,
    null,
    null,
    null,
    null,
    '[]'::jsonb,
    0
  )),
  true,
  'la relivraison du meme evenement est idempotente'
);
select is(
  (select stripe_status from public.stripe_subscription_projections
    where subscription_id = 'sub_projection_a'),
  'active',
  'un doublon ne reecrit pas la photographie'
);

select is(
  (select applied from public.apply_stripe_subscription_projection_v1(
    'evt_projection_2',
    '2026-08-23T11:00:00Z',
    'cus_projection_a',
    'sub_projection_a',
    'canceled',
    true,
    '2026-09-23T10:00:00Z',
    '2026-08-23T11:00:00Z',
    '2026-09-23T10:00:00Z',
    null,
    '[{"item_id":"si_main","price_id":"price_main","quantity":1,"currency":"eur","recurring_interval":"month","monthly_amount_cents":7900}]'::jsonb,
    7900
  )),
  true,
  'un evenement plus recent remplace la projection'
);
select is(
  (select applied from public.apply_stripe_subscription_projection_v1(
    'evt_projection_old',
    '2026-08-23T09:00:00Z',
    'cus_projection_a',
    'sub_projection_a',
    'active',
    false,
    null,
    null,
    null,
    '2026-10-23T10:00:00Z',
    '[{"item_id":"si_main","price_id":"price_main","quantity":1,"currency":"eur","recurring_interval":"month","monthly_amount_cents":9999}]'::jsonb,
    9999
  )),
  false,
  'un evenement ancien est acquitte sans ecraser le plus recent'
);
select is(
  (select stripe_status from public.stripe_subscription_projections
    where subscription_id = 'sub_projection_a'),
  'canceled',
  'le statut recent survit a un evenement desordonne'
);

select throws_ok(
  $$select * from public.apply_stripe_subscription_projection_v1(
    'evt_projection_foreign', '2026-08-23T12:00:00Z',
    'cus_projection_b', 'sub_projection_a', 'active', false,
    null, null, null, null, '[]'::jsonb, 0
  )$$,
  'P0001',
  'stripe subscription ownership mismatch',
  'un abonnement ne peut pas changer d organisation'
);

select ok(
  has_function_privilege(
    'service_role',
    'public.apply_stripe_subscription_projection_v1(text,timestamptz,text,text,text,boolean,timestamptz,timestamptz,timestamptz,timestamptz,jsonb,bigint)',
    'EXECUTE'
  ),
  'le webhook service_role peut appliquer la projection'
);
select is(
  has_function_privilege(
    'authenticated',
    'public.apply_stripe_subscription_projection_v1(text,timestamptz,text,text,text,boolean,timestamptz,timestamptz,timestamptz,timestamptz,jsonb,bigint)',
    'EXECUTE'
  ),
  false,
  'un membre ne peut pas forger une projection Stripe'
);
select is(
  has_table_privilege(
    'authenticated', 'public.stripe_subscription_projections', 'SELECT'
  ),
  false,
  'les details de facturation ne sont pas exposes aux membres'
);

select finish();
rollback;
