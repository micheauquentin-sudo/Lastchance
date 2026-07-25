-- ============================================================
-- Analytics métier universels : contrat borné, isolation tenant et ACL.
-- ============================================================
begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

insert into public.organizations (id, name, slug, data_retention_months) values
  ('a1000000-0000-4000-8000-000000000001', 'Analytics A', 'tap-analytics-a', 6),
  ('a1000000-0000-4000-8000-000000000002', 'Analytics B', 'tap-analytics-b', 6);

insert into auth.users (id, aud, role, email, encrypted_password, created_at, updated_at)
values (
  'a1000000-0000-4000-8000-0000000000a1',
  'authenticated', 'authenticated', 'owner@analytics.test', '', now(), now()
);
insert into public.organization_members (organization_id, user_id, role)
values (
  'a1000000-0000-4000-8000-000000000001',
  'a1000000-0000-4000-8000-0000000000a1',
  'owner'
);

insert into public.campaigns (id, organization_id, name, status) values
  (
    'a1000000-0000-4000-8000-000000000011',
    'a1000000-0000-4000-8000-000000000001',
    'Roue A', 'active'
  ),
  (
    'a1000000-0000-4000-8000-000000000012',
    'a1000000-0000-4000-8000-000000000002',
    'Roue B', 'active'
  );

select set_config('request.jwt.claims', '{"role":"service_role"}', true);

select lives_ok(
  $$select public.record_experience_event(
    'a1000000-0000-4000-8000-000000000001',
    'experience_viewed', 'campaign',
    'a1000000-0000-4000-8000-000000000011',
    'qr', null, repeat('a', 64), null, null, null, null, null,
    'view:campaign:a1', '{"game_type":"wheel"}'::jsonb
  )$$,
  'le serveur enregistre un événement borné sans PII'
);
select public.record_experience_event(
  'a1000000-0000-4000-8000-000000000001',
  'experience_started', 'campaign',
  'a1000000-0000-4000-8000-000000000011',
  'qr', null, repeat('a', 64)
);
select public.record_experience_event(
  'a1000000-0000-4000-8000-000000000001',
  'experience_completed', 'campaign',
  'a1000000-0000-4000-8000-000000000011',
  'qr', null, repeat('a', 64)
);
select public.record_experience_event(
  'a1000000-0000-4000-8000-000000000001',
  'reward_issued', 'campaign',
  'a1000000-0000-4000-8000-000000000011',
  'qr', null, repeat('a', 64)
);
select public.record_experience_event(
  'a1000000-0000-4000-8000-000000000001',
  'reward_redeemed', 'campaign',
  'a1000000-0000-4000-8000-000000000011',
  'qr', null, repeat('a', 64), null, null, null, 4200, 500
);

-- Même clé idempotente : la ligne initiale est retrouvée, jamais dupliquée.
select public.record_experience_event(
  'a1000000-0000-4000-8000-000000000001',
  'experience_viewed', 'campaign',
  'a1000000-0000-4000-8000-000000000011',
  'qr', null, repeat('a', 64), null, null, null, null, null,
  'view:campaign:a1'
);
select is(
  (select count(*)::integer from public.experience_events
    where organization_id = 'a1000000-0000-4000-8000-000000000001'
      and idempotency_key = 'view:campaign:a1'),
  1,
  'la clé d''idempotence empêche un double comptage'
);

select throws_ok(
  $$select public.record_experience_event(
    'a1000000-0000-4000-8000-000000000001',
    'experience_viewed', 'campaign',
    'a1000000-0000-4000-8000-000000000012'
  )$$,
  'P0001', 'experience not found',
  'une expérience d''un autre tenant ne peut pas être attribuée à l''organisation'
);
select throws_ok(
  $$select public.record_experience_event(
    'a1000000-0000-4000-8000-000000000001',
    'experience_completed', 'campaign',
    'a1000000-0000-4000-8000-000000000011',
    'direct', null, repeat('b', 64), null, null, null, null, null, null,
    '{"customer_email":"alice@example.test"}'::jsonb
  )$$,
  'P0001', 'invalid metadata',
  'les métadonnées ne peuvent contenir de clé PII'
);
select throws_ok(
  $$select public.record_experience_event(
    'a1000000-0000-4000-8000-000000000001',
    'experience_completed', 'campaign',
    'a1000000-0000-4000-8000-000000000011',
    'direct', null, repeat('b', 64), null, null, null, 100
  )$$,
  'P0001', 'invalid basket',
  'un panier n''est accepté que sur reward_redeemed'
);

select is(
  (public.org_experience_analytics(
    'a1000000-0000-4000-8000-000000000001', 30
  ) #>> '{summary,completions}')::integer,
  1,
  'l''agrégat compte les complétions du tenant'
);
select is(
  (public.org_experience_analytics(
    'a1000000-0000-4000-8000-000000000001', 30
  ) #>> '{summary,basket_revenue_cents}')::integer,
  4200,
  'l''agrégat commercial additionne les paniers retirés'
);
select is(
  (public.org_experience_analytics(
    'a1000000-0000-4000-8000-000000000001', 30
  ) #>> '{summary,attributable_margin_cents}')::integer,
  3700,
  'la marge ne compare que les retraits ayant panier et coût'
);
select is(
  (public.org_experience_analytics(
    'a1000000-0000-4000-8000-000000000002', 30
  ) ->> 'total_events')::integer,
  0,
  'les événements de l''organisation A ne fuient pas dans B'
);

-- ACL structurelles.
select ok(
  (select relrowsecurity from pg_class
    where oid = 'public.experience_events'::regclass),
  'experience_events a la RLS active'
);
select ok(
  not has_table_privilege('authenticated', 'public.experience_events', 'SELECT'),
  'une session marchande ne lit jamais le journal brut'
);
select ok(
  not has_function_privilege(
    'authenticated',
    'public.record_experience_event(uuid,text,text,uuid,text,uuid,text,uuid,uuid,uuid,bigint,bigint,text,jsonb)',
    'EXECUTE'
  ),
  'une session marchande ne forge pas d''événement'
);
select ok(
  has_function_privilege(
    'service_role',
    'public.record_experience_event(uuid,text,text,uuid,text,uuid,text,uuid,uuid,uuid,bigint,bigint,text,jsonb)',
    'EXECUTE'
  ),
  'le serveur peut écrire via la RPC validante'
);
select ok(
  has_function_privilege(
    'authenticated',
    'public.org_experience_analytics(uuid,integer)',
    'EXECUTE'
  ),
  'les commerçants peuvent appeler l''agrégat gardé'
);
select ok(
  not has_function_privilege(
    'service_role',
    'public.append_experience_event_internal(uuid,text,text,uuid,text,uuid,text,uuid,text,timestamptz)',
    'EXECUTE'
  ),
  'l''émetteur interne n''est pas appelable, même par le service role'
);
select has_trigger(
  'public',
  'player_experience_memberships',
  'player_experience_memberships_analytics',
  'les vues, adhésions et retours passent par le registre joueur'
);
select has_trigger(
  'public',
  'reward_issuances',
  'reward_issuances_experience_analytics',
  'les émissions et retraits passent par le registre universel'
);
select has_trigger(
  'public',
  'spins',
  'spins_experience_analytics',
  'la roue alimente automatiquement le funnel'
);

-- Garde réelle de l'agrégat sous le rôle marchand.
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"a1000000-0000-4000-8000-0000000000a1"}',
  true
);
select lives_ok(
  $$select public.org_experience_analytics(
    'a1000000-0000-4000-8000-000000000001', 30
  )$$,
  'un membre lit uniquement son agrégat'
);
select throws_ok(
  $$select public.org_experience_analytics(
    'a1000000-0000-4000-8000-000000000002', 30
  )$$,
  'P0001', 'not authorized',
  'un membre ne lit pas l''agrégat d''un autre tenant'
);

select finish();
rollback;
