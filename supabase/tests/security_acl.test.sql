begin;
create extension if not exists pgtap with schema extensions;
select plan(42);

-- ACL réelles des fonctions exposées par PostgREST.
select ok(not has_function_privilege('anon', 'public.decrement_prize_stock(uuid)', 'EXECUTE'), 'anon cannot decrement stock');
select ok(not has_function_privilege('anon', 'public.restore_prize_stock(uuid)', 'EXECUTE'), 'anon cannot restore stock');
select ok(not has_function_privilege('anon', 'public.check_rate_limit(text,integer,integer)', 'EXECUTE'), 'anon cannot call rate limiter');
select ok(not has_function_privilege('authenticated', 'public.prune_rate_limits(integer)', 'EXECUTE'), 'authenticated cannot prune limits');
select ok(not has_function_privilege('authenticated', 'public.increment_qr_scan(text)', 'EXECUTE'), 'authenticated cannot increment scans directly');
select ok(not has_function_privilege('authenticated', 'public.decrement_prize_stock(uuid)', 'EXECUTE'), 'authenticated cannot change stock directly');
select ok(has_function_privilege('service_role', 'public.decrement_prize_stock(uuid)', 'EXECUTE'), 'service role can decrement stock');
select ok(has_function_privilege('authenticated', 'public.create_organization(text,text)', 'EXECUTE'), 'authenticated can onboard');
select ok(has_function_privilege('authenticated', 'public.lookup_redeem_code(uuid,text)', 'EXECUTE'), 'authenticated can use cashier lookup');
select ok(not has_function_privilege('anon', 'public.lookup_redeem_code(uuid,text)', 'EXECUTE'), 'anon cannot use cashier lookup');
select ok(not has_column_privilege('authenticated', 'public.organizations', 'webhook_secret', 'SELECT'), 'merchant sessions cannot read webhook secrets');
select ok(not exists (
  select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace,
  lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) acl
  where n.nspname = 'public' and acl.grantee = 0 and acl.privilege_type = 'EXECUTE'
), 'PUBLIC has no EXECUTE on public functions');
select ok(not exists (
  select 1 from pg_default_acl d join pg_namespace n on n.oid = d.defaclnamespace,
  lateral aclexplode(d.defaclacl) acl
  where n.nspname = 'public' and d.defaclobjtype = 'f'
    and acl.grantee = 0 and acl.privilege_type = 'EXECUTE'
), 'future public functions do not grant PUBLIC execute');

-- RLS présente sur chaque table sensible.
select ok((select relrowsecurity from pg_class where oid = 'public.organizations'::regclass), 'organizations RLS enabled');
select ok((select relrowsecurity from pg_class where oid = 'public.participations'::regclass), 'participations RLS enabled');
select ok((select relrowsecurity from pg_class where oid = 'public.newsletter_subscribers'::regclass), 'newsletter RLS enabled');
select ok((select relrowsecurity from pg_class where oid = 'public.audit_logs'::regclass), 'audit RLS enabled');
select ok((select relrowsecurity from pg_class where oid = 'public.team_invitations'::regclass), 'invitations RLS enabled');
select ok((select relrowsecurity from pg_class where oid = 'public.admin_users'::regclass), 'admin users RLS enabled');

-- Politiques owner-only et absence d'update directe des organisations.
select is((select count(*) from pg_policies where schemaname='public' and tablename='organizations' and cmd='UPDATE'), 0::bigint, 'no direct organization update policy');
select is((select count(*) from pg_policies where schemaname='public' and tablename='participations' and policyname='participations: owner select'), 1::bigint, 'participations are owner-only');
select is((select count(*) from pg_policies where schemaname='public' and tablename='newsletter_subscribers' and policyname='newsletter: owner select'), 1::bigint, 'newsletter is owner-only');
select is((select count(*) from pg_policies where schemaname='public' and tablename='audit_logs' and policyname='audit: owner select'), 1::bigint, 'audit is owner-only');

-- Contraintes composites d'intégrité multi-tenant.
select ok(exists (select 1 from pg_constraint where conrelid='public.wheels'::regclass and conname='wheels_campaign_org_fk' and contype='f'), 'wheel campaign tenant FK exists');
select ok(exists (select 1 from pg_constraint where conrelid='public.prizes'::regclass and conname='prizes_wheel_org_fk' and contype='f'), 'prize wheel tenant FK exists');
select ok(exists (select 1 from pg_constraint where conrelid='public.qr_codes'::regclass and conname='qr_campaign_org_fk' and contype='f'), 'QR campaign tenant FK exists');
select ok(exists (select 1 from pg_constraint where conrelid='public.spins'::regclass and conname='spins_wheel_campaign_org_fk' and contype='f'), 'spin wheel tenant FK exists');
select ok(exists (select 1 from pg_constraint where conrelid='public.spins'::regclass and conname='spins_prize_wheel_org_fk' and contype='f'), 'spin prize tenant FK exists');
select ok(exists (select 1 from pg_constraint where conrelid='public.participations'::regclass and conname='participations_wheel_campaign_org_fk' and contype='f'), 'participation wheel tenant FK exists');
select ok(exists (select 1 from pg_constraint where conrelid='public.participations'::regclass and conname='participations_prize_wheel_org_fk' and contype='f'), 'participation prize tenant FK exists');
select ok(position('quota propriétaire atteint' in pg_get_functiondef('public.create_organization(text,text)'::regprocedure)) > 0, 'owner quota enforced in database');
select ok(position('role = ''staff''' in pg_get_constraintdef((select oid from pg_constraint where conname='team_invitations_role_check'))) > 0, 'team invitations cannot grant owner');
select has_index('public', 'organization_members', 'organization_members_one_owned_org_idx', 'one owned organization per user');

-- Données réalistes pour vérifier les RLS en exécutant réellement comme staff.
insert into auth.users (id, aud, role, email, encrypted_password, created_at, updated_at)
values
 ('10000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'owner@test.local', '', now(), now()),
 ('10000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'staff@test.local', '', now(), now());
insert into public.organizations (id, name, slug) values
 ('20000000-0000-4000-8000-000000000001', 'Test ACL', 'test-acl');
insert into public.organization_members (organization_id, user_id, role) values
 ('20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 'owner'),
 ('20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000002', 'staff');
insert into public.campaigns (id, organization_id, name) values
 ('30000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', 'Test');
insert into public.wheels (id, organization_id, campaign_id, name) values
 ('40000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001', 'Test');
insert into public.prizes (id, organization_id, wheel_id, label) values
 ('50000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000001', 'Café');
insert into public.participations (
  id, organization_id, campaign_id, wheel_id, prize_id, first_name, email,
  accepted_terms, redeem_code, player_key
) values (
 '60000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001',
 '30000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000001',
 '50000000-0000-4000-8000-000000000001', 'Alice', 'alice@test.local', true, 'GAIN-TEST', 'hash'
);
insert into public.newsletter_subscribers (organization_id, email)
values ('20000000-0000-4000-8000-000000000001', 'alice@test.local');

set local role authenticated;
set local "request.jwt.claim.sub" = '10000000-0000-4000-8000-000000000002';
select results_eq('select count(*) from public.participations', array[0::bigint], 'staff cannot enumerate PII');
select results_eq('select count(*) from public.newsletter_subscribers', array[0::bigint], 'staff cannot enumerate newsletter');
select results_eq($$select count(*) from public.lookup_redeem_code('20000000-0000-4000-8000-000000000001','GAIN-TEST')$$, array[1::bigint], 'staff can lookup one redeem code');
select throws_ok($$select * from public.org_team_members('20000000-0000-4000-8000-000000000001')$$, 'P0001', 'not authorized', 'staff cannot enumerate team emails');
select throws_ok($$select * from public.org_customer_profiles('20000000-0000-4000-8000-000000000001')$$, 'P0001', 'not authorized', 'staff cannot enumerate customer profiles');
select results_eq($$update public.organizations set subscription_status='active' where id='20000000-0000-4000-8000-000000000001' returning 1$$, $$select 1 where false$$, 'staff cannot alter billing state');
select results_eq($$select public.redeem_participation('20000000-0000-4000-8000-000000000001','60000000-0000-4000-8000-000000000001')$$, array['60000000-0000-4000-8000-000000000001'::uuid], 'staff can redeem a prize');

set local "request.jwt.claim.sub" = '10000000-0000-4000-8000-000000000001';
select results_eq('select count(*) from public.participations', array[1::bigint], 'owner can read participations');
select results_eq('select count(*) from public.newsletter_subscribers', array[1::bigint], 'owner can read newsletter');

reset role;
select * from finish();
rollback;
