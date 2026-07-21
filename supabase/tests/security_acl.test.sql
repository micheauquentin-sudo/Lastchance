begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

-- L'audit interroge les ACL réellement installées, pas une liste maintenue
-- dans la CI ou une analyse textuelle des migrations.
select ok(not has_schema_privilege('anon', 'public', 'CREATE'), 'anon cannot create objects in public');
select ok(not has_schema_privilege('authenticated', 'public', 'CREATE'), 'authenticated cannot shadow SECURITY DEFINER objects');
select ok(not has_function_privilege('anon', 'public.decrement_prize_stock(uuid)', 'EXECUTE'), 'anon cannot decrement stock');
select ok(not has_table_privilege('anon', 'public.campaigns', 'SELECT'), 'anon cannot query campaigns directly');
select ok(not has_table_privilege('anon', 'public.participations', 'SELECT'), 'anon cannot query customer data directly');
select ok(not has_table_privilege('anon', 'public.spins', 'INSERT'), 'anon cannot create spins directly');
select ok(not has_function_privilege('authenticated', 'public.decrement_prize_stock(uuid)', 'EXECUTE'), 'merchant cannot decrement stock RPC');
select ok(has_function_privilege('service_role', 'public.perform_atomic_spin(uuid,uuid,uuid,text,text,text)', 'EXECUTE'), 'only server can perform atomic spin');
select ok(not has_function_privilege('authenticated', 'public.perform_atomic_spin(uuid,uuid,uuid,text,text,text)', 'EXECUTE'), 'merchant cannot perform atomic spin');
select ok(has_function_privilege('service_role', 'public.claim_winning_spin(uuid,text,text,text,boolean,boolean)', 'EXECUTE'), 'only server can atomically claim');
select ok(not has_function_privilege('authenticated', 'public.claim_winning_spin(uuid,text,text,text,boolean,boolean)', 'EXECUTE'), 'merchant cannot claim arbitrary spin');
select ok(has_function_privilege('service_role', 'public.redeem_by_code(uuid,text,text,integer)', 'EXECUTE'), 'server can redeem by code');
select ok(not has_function_privilege('authenticated', 'public.redeem_by_code(uuid,text,text,integer)', 'EXECUTE'), 'cashier session cannot bypass server guards');
select ok(has_function_privilege('authenticated', 'public.cancel_participation(uuid,uuid,text,boolean)', 'EXECUTE'), 'editor can cancel a claim through the audited RPC');
select ok(not has_function_privilege('anon', 'public.cancel_participation(uuid,uuid,text,boolean)', 'EXECUTE'), 'anon cannot cancel claims');
select ok(has_function_privilege('authenticated', 'public.org_prize_funnel(uuid,integer)', 'EXECUTE'), 'team can read its prize funnel (guarded in-function)');
select ok(not has_function_privilege('anon', 'public.org_prize_funnel(uuid,integer)', 'EXECUTE'), 'anon cannot read funnels');
select ok(not has_function_privilege('authenticated', 'public.lookup_redeem_code(uuid,text)', 'EXECUTE'), 'legacy cashier lookup is revoked');
select ok(not has_function_privilege('authenticated', 'public.redeem_participation(uuid,uuid)', 'EXECUTE'), 'legacy redeem is revoked');
select ok(has_function_privilege('authenticated', 'public.create_organization(text,text)', 'EXECUTE'), 'authenticated can onboard through narrow RPC');
select ok(not has_column_privilege('authenticated', 'public.organizations', 'webhook_secret', 'SELECT'), 'merchant cannot read webhook secret');
select ok(has_column_privilege('authenticated', 'public.organizations', 'addon_pronostics', 'SELECT'), 'merchant can read pronostics entitlement');
select ok(has_column_privilege('authenticated', 'public.organizations', 'comp_access', 'SELECT'), 'merchant can read complimentary entitlement');
select ok(has_column_privilege('authenticated', 'public.organizations', 'comp_access_until', 'SELECT'), 'merchant can read complimentary entitlement expiry');
select ok(not has_column_privilege('authenticated', 'public.organizations', 'comp_access_note', 'SELECT'), 'merchant cannot read internal complimentary-access note');
select ok(not has_table_privilege('authenticated', 'public.merchant_deletion_jobs', 'SELECT'), 'merchant cannot read deletion jobs');
select ok(has_table_privilege('service_role', 'public.merchant_deletion_jobs', 'INSERT'), 'server can create deletion jobs');
select ok(has_table_privilege('service_role', 'public.merchant_deletion_jobs', 'UPDATE'), 'server can advance deletion jobs');
select ok(has_function_privilege('service_role', 'public.submit_contest_prediction(uuid,uuid,uuid,integer,integer)', 'EXECUTE'), 'only server can submit a public prediction');
select ok(not has_function_privilege('authenticated', 'public.submit_contest_prediction(uuid,uuid,uuid,integer,integer)', 'EXECUTE'), 'merchant cannot impersonate a contest player');
select ok(has_function_privilege('authenticated', 'public.set_contest_match_result(uuid,uuid,integer,integer,text,integer,integer)', 'EXECUTE'), 'editor can use the guarded result RPC');
select ok(has_function_privilege('service_role', 'public.purge_expired_contest_players()', 'EXECUTE'), 'server can purge contest PII');
select ok(has_function_privilege('service_role', 'public.contest_leaderboard(uuid,integer,integer)', 'EXECUTE'), 'server can read the aggregated leaderboard');
select ok(has_function_privilege('authenticated', 'public.contest_leaderboard(uuid,integer,integer)', 'EXECUTE'), 'owner dashboard can read the leaderboard (guarded in-function)');
select ok(not has_function_privilege('anon', 'public.contest_leaderboard(uuid,integer,integer)', 'EXECUTE'), 'anon cannot read the leaderboard (emails in payload)');
select ok(has_function_privilege('service_role', 'public.contest_player_rank(uuid,uuid)', 'EXECUTE'), 'server can read a single player rank');
select ok(not has_function_privilege('authenticated', 'public.contest_player_rank(uuid,uuid)', 'EXECUTE'), 'merchant cannot probe arbitrary player ranks');
select ok(has_function_privilege('service_role', 'public.claim_fixture_refresh(text,integer)', 'EXECUTE'), 'server can claim a fixture refresh');
select ok(not has_function_privilege('authenticated', 'public.claim_fixture_refresh(text,integer)', 'EXECUTE'), 'merchant cannot hold the shared refresh lock');
select ok(not has_table_privilege('authenticated', 'public.contest_players', 'INSERT'), 'merchant cannot create contest players directly');
select ok(not has_table_privilege('authenticated', 'public.contest_predictions', 'UPDATE'), 'merchant cannot rewrite customer predictions');
select ok(not has_column_privilege('authenticated', 'public.contests', 'scoring', 'UPDATE'), 'scoring changes must use the recalculation RPC');
select ok(has_column_privilege('authenticated', 'public.contests', 'name', 'UPDATE'), 'editor can still rename a contest');
select ok(not has_table_privilege('authenticated', 'public.contest_matches', 'UPDATE'), 'match results must use the atomic RPC');
select ok(not has_table_privilege('authenticated', 'public.contest_matches', 'DELETE'), 'match deletion must use the audited RPC');
select ok(not has_table_privilege('authenticated', 'public.contests', 'DELETE'), 'contest deletion must use the audited RPC');
select ok(has_function_privilege('authenticated', 'public.delete_contest_match(uuid,uuid,text)', 'EXECUTE'), 'editor can use guarded match deletion');
select ok(not has_column_privilege('authenticated', 'public.contests', 'status', 'UPDATE'), 'status transitions must use the guarded RPC');
select ok(not has_column_privilege('authenticated', 'public.contests', 'rewards', 'UPDATE'), 'rewards changes must use the audited RPC');
select ok(has_function_privilege('authenticated', 'public.set_contest_status(uuid,uuid,text,text)', 'EXECUTE'), 'editor can transition status through the RPC');
select ok(has_function_privilege('authenticated', 'public.update_contest_rewards(uuid,uuid,jsonb,text)', 'EXECUTE'), 'editor can update rewards through the RPC');
select ok(has_function_privilege('authenticated', 'public.update_contest_tiebreaker(uuid,uuid,text,integer)', 'EXECUTE'), 'editor can configure the tiebreaker question');
select ok(has_function_privilege('authenticated', 'public.finalize_contest(uuid,uuid,integer)', 'EXECUTE'), 'owner can finalize through the RPC (owner-guarded in-function)');
select ok(has_function_privilege('authenticated', 'public.set_contest_award_status(uuid,uuid,text,text)', 'EXECUTE'), 'team can settle awards through the audited RPC');
select ok(not has_function_privilege('anon', 'public.finalize_contest(uuid,uuid,integer)', 'EXECUTE'), 'anon cannot finalize a contest');
select ok(not has_table_privilege('authenticated', 'public.contest_final_standings', 'SELECT'), 'final standings are served through the leaderboard RPC only');
select ok(not has_table_privilege('authenticated', 'public.contest_recovery_tokens', 'SELECT'), 'recovery tokens are server-only');
select ok(not has_table_privilege('anon', 'public.contest_recovery_tokens', 'SELECT'), 'anon cannot read recovery tokens');
select ok(has_table_privilege('service_role', 'public.contest_recovery_tokens', 'INSERT'), 'server can mint recovery tokens');
select ok(not has_table_privilege('authenticated', 'public.contest_awards', 'INSERT'), 'awards are only created by the finalize RPC');
select ok(has_table_privilege('authenticated', 'public.contest_awards', 'SELECT'), 'team can list awards (RLS-scoped)');
select ok(has_function_privilege('authenticated', 'public.delete_contest(uuid,uuid)', 'EXECUTE'), 'editor can use guarded contest deletion');
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

select ok((select relrowsecurity from pg_class where oid = 'public.organizations'::regclass), 'organizations RLS enabled');
select ok((select relrowsecurity from pg_class where oid = 'public.participations'::regclass), 'participations RLS enabled');
select ok((select relrowsecurity from pg_class where oid = 'public.newsletter_subscribers'::regclass), 'newsletter RLS enabled');
select ok((select relrowsecurity from pg_class where oid = 'public.audit_logs'::regclass), 'audit RLS enabled');
select ok((select relrowsecurity from pg_class where oid = 'public.team_invitations'::regclass), 'invitations RLS enabled');
select ok((select relrowsecurity from pg_class where oid = 'public.admin_users'::regclass), 'admin users RLS enabled');
select ok((select relrowsecurity from pg_class where oid = 'public.admin_sessions'::regclass), 'admin sessions RLS enabled');
select ok((select relrowsecurity from pg_class where oid = 'public.merchant_deletion_jobs'::regclass), 'merchant deletion jobs RLS enabled');
select ok((select relrowsecurity from pg_class where oid = 'public.webhook_deliveries'::regclass), 'webhook outbox RLS enabled');
select ok((select relrowsecurity from pg_class where oid = 'public.contest_players'::regclass), 'contest players RLS enabled');
select ok((select relrowsecurity from pg_class where oid = 'public.contest_predictions'::regclass), 'contest predictions RLS enabled');
select ok(not has_table_privilege('authenticated', 'public.webhook_deliveries', 'SELECT'), 'merchant cannot read webhook payloads');
select is((select count(*) from pg_policies where schemaname='public' and tablename='organizations' and cmd='UPDATE'), 0::bigint, 'no direct organization update policy');
select is((select count(*) from pg_policies where schemaname='public' and tablename='participations' and policyname='participations: owner select'), 1::bigint, 'participations are owner-only');
select is((select count(*) from pg_policies where schemaname='public' and tablename='newsletter_subscribers' and policyname='newsletter: owner select'), 1::bigint, 'newsletter is owner-only');
select is((select count(*) from pg_policies where schemaname='public' and tablename='campaigns' and policyname='campaigns: editors'), 1::bigint, 'campaign mutations are editor-only');
select ok(not exists (
  select 1 from pg_policies
  where schemaname = 'public'
    and 'public' = any(roles)
    and (
      coalesce(qual, '') ~ 'is_org_(member|owner|editor)'
      or coalesce(with_check, '') ~ 'is_org_(member|owner|editor)'
    )
), 'member policies are never evaluated for anon');

select ok(exists (select 1 from pg_constraint where conrelid='public.wheels'::regclass and conname='wheels_campaign_org_fk' and contype='f'), 'wheel campaign tenant FK exists');
select ok(exists (select 1 from pg_constraint where conrelid='public.prizes'::regclass and conname='prizes_wheel_org_fk' and contype='f'), 'prize wheel tenant FK exists');
select ok(exists (select 1 from pg_constraint where conrelid='public.qr_codes'::regclass and conname='qr_campaign_org_fk' and contype='f'), 'QR campaign tenant FK exists');
select ok(exists (select 1 from pg_constraint where conrelid='public.spins'::regclass and conname='spins_wheel_campaign_org_fk' and contype='f'), 'spin wheel tenant FK exists');
select ok(exists (select 1 from pg_constraint where conrelid='public.spins'::regclass and conname='spins_prize_wheel_org_fk' and contype='f'), 'spin prize tenant FK exists');
select ok(exists (select 1 from pg_constraint where conrelid='public.participations'::regclass and conname='participations_wheel_campaign_org_fk' and contype='f'), 'participation wheel tenant FK exists');
select ok(exists (select 1 from pg_constraint where conrelid='public.participations'::regclass and conname='participations_prize_wheel_org_fk' and contype='f'), 'participation prize tenant FK exists');
select ok(exists (select 1 from pg_constraint where conrelid='public.contest_matches'::regclass and conname='contest_matches_contest_org_fk' and contype='f'), 'contest match tenant FK exists');
select ok(exists (select 1 from pg_constraint where conrelid='public.contest_predictions'::regclass and conname='contest_predictions_match_contest_org_fk' and contype='f'), 'prediction match tenant FK exists');
select ok(exists (select 1 from pg_constraint where conrelid='public.contest_predictions'::regclass and conname='contest_predictions_player_contest_org_fk' and contype='f'), 'prediction player tenant FK exists');
select ok(exists (
  select 1 from storage.buckets
  where id = 'poster-images' and public
    and file_size_limit = 2097152
    and allowed_mime_types = array['image/webp']
), 'poster images use the bounded public WebP bucket');
select ok(position('quota propriétaire atteint' in pg_get_functiondef('public.create_organization(text,text)'::regprocedure)) > 0, 'owner quota enforced in database');
select ok(position('editor' in pg_get_constraintdef((select oid from pg_constraint where conname='team_invitations_role_check'))) > 0, 'editor invitations allowed');
select ok(position('cashier' in pg_get_constraintdef((select oid from pg_constraint where conname='team_invitations_role_check'))) > 0, 'cashier invitations allowed');
select ok(position('owner' in pg_get_constraintdef((select oid from pg_constraint where conname='team_invitations_role_check'))) = 0, 'invitations cannot grant owner');
select has_index('public', 'organization_members', 'organization_members_one_owned_org_idx', 'one owned organization per user');
select has_index('public', 'spins', 'spins_one_per_window_idx', 'one spin per play window enforced');
select ok(exists (
  select 1 from pg_trigger
  where tgrelid = 'public.admin_users'::regclass
    and tgname = 'admin_users_protect_last_super_admin_delete'
    and not tgisinternal
), 'last active super admin is protected from deletion');

insert into auth.users (id, aud, role, email, encrypted_password, created_at, updated_at)
values
 ('10000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'owner@test.local', '', now(), now()),
 ('10000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'editor@test.local', '', now(), now()),
 ('10000000-0000-4000-8000-000000000003', 'authenticated', 'authenticated', 'cashier@test.local', '', now(), now());
insert into public.admin_users (user_id, email, role, is_active)
values ('10000000-0000-4000-8000-000000000001', 'owner@test.local', 'super_admin', true);
select throws_ok(
  $$delete from public.admin_users where user_id = '10000000-0000-4000-8000-000000000001'$$,
  'P0001', 'last active super admin',
  'last active super admin cannot be deleted directly'
);
insert into public.organizations (id, name, slug) values
 ('20000000-0000-4000-8000-000000000001', 'Test ACL', 'test-acl');
insert into public.organization_members (organization_id, user_id, role) values
 ('20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 'owner'),
 ('20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000002', 'editor'),
 ('20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000003', 'cashier');
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
 '50000000-0000-4000-8000-000000000001', 'Alice', 'alice@test.local', true, 'GAIN-ABCDEFGH', repeat('a', 64)
);
insert into public.newsletter_subscribers (organization_id, email)
values ('20000000-0000-4000-8000-000000000001', 'alice@test.local');
insert into public.contests (id, organization_id, slug, name, competition_key)
values (
  '70000000-0000-4000-8000-000000000001',
  '20000000-0000-4000-8000-000000000001',
  'TESTPRONO', 'Test pronostics', 'custom'
);
insert into public.contest_players (
  id, contest_id, organization_id, token_hash, first_name, email, accepted_terms
) values (
  '80000000-0000-4000-8000-000000000001',
  '70000000-0000-4000-8000-000000000001',
  '20000000-0000-4000-8000-000000000001',
  repeat('b', 64), 'Bob', 'bob@test.local', true
);
insert into public.contest_matches (
  id, contest_id, organization_id, home_name, away_name, kickoff_at, external_ref, position
) values
  ('71000000-0000-4000-8000-000000000001', '70000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', 'A', 'B', now() - interval '2 hours', '', 0),
  ('71000000-0000-4000-8000-000000000002', '70000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', 'C', 'D', now() - interval '2 hours', 'provider-1', 1),
  ('71000000-0000-4000-8000-000000000003', '70000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', 'E', 'F', now() + interval '1 day', '', 2);
insert into public.contest_predictions (
  contest_id, organization_id, match_id, player_id, home_score, away_score
) values (
  '70000000-0000-4000-8000-000000000001',
  '20000000-0000-4000-8000-000000000001',
  '71000000-0000-4000-8000-000000000001',
  '80000000-0000-4000-8000-000000000001', 2, 1
);

-- Régression 42702 : le tirage atomique doit s'exécuter réellement.
-- (« column reference is_losing is ambiguous » — variable du returns
-- table vs colonne de prizes — cassait 100 % des spins en production.)
select lives_ok(
  $$select * from public.perform_atomic_spin(
    '20000000-0000-4000-8000-000000000001',
    '30000000-0000-4000-8000-000000000001',
    '40000000-0000-4000-8000-000000000001',
    repeat('c', 64), null, 'direct')$$,
  'atomic spin executes end-to-end (no plpgsql ambiguity)'
);
select results_eq(
  $$select count(*)::int from public.perform_atomic_spin(
    '20000000-0000-4000-8000-000000000001',
    '30000000-0000-4000-8000-000000000001',
    '40000000-0000-4000-8000-000000000001',
    repeat('d', 64), null, 'direct')$$,
  array[1],
  'atomic spin always returns exactly one row (result or denial)'
);

set local role authenticated;
set local "request.jwt.claim.sub" = '10000000-0000-4000-8000-000000000003';
select results_eq('select count(*) from public.campaigns', array[0::bigint], 'cashier cannot enumerate campaigns');
select results_eq('select count(*) from public.participations', array[0::bigint], 'cashier cannot enumerate PII');
select results_eq('select count(*) from public.newsletter_subscribers', array[0::bigint], 'cashier cannot enumerate newsletter');
select results_eq('select count(*) from public.contest_players', array[0::bigint], 'cashier cannot enumerate contest PII');
select throws_ok($$select * from public.org_customer_profiles('20000000-0000-4000-8000-000000000001')$$, 'P0001', 'not authorized', 'cashier cannot enumerate customer profiles');

set local "request.jwt.claim.sub" = '10000000-0000-4000-8000-000000000002';
select results_eq('select count(*) from public.campaigns', array[1::bigint], 'editor can read campaigns');
select results_eq('select count(*) from public.participations', array[0::bigint], 'editor cannot enumerate PII');
select results_eq('select count(*) from public.contest_players', array[0::bigint], 'editor cannot enumerate contest PII');
update public.campaigns set name = 'Modifiée' where id = '30000000-0000-4000-8000-000000000001';
select results_eq($$select count(*) from public.audit_logs where action = 'campaigns.update'$$, array[0::bigint], 'editor cannot read even their mutation audit');
select is(
  public.set_contest_match_result(
    '20000000-0000-4000-8000-000000000001',
    '71000000-0000-4000-8000-000000000001', 3, 1
  ), true, 'editor can set a result after kickoff'
);
select throws_ok(
  $$select public.set_contest_match_result('20000000-0000-4000-8000-000000000001','71000000-0000-4000-8000-000000000002',1,0)$$,
  'P0001', 'managed match', 'editor cannot overwrite a provider-managed result'
);
select throws_ok(
  $$select public.set_contest_match_result('20000000-0000-4000-8000-000000000001','71000000-0000-4000-8000-000000000003',1,0)$$,
  'P0001', 'match not started', 'editor cannot publish a result before kickoff'
);
-- Le championnat a des pronostics : règlement verrouillé, motif exigé.
select throws_ok(
  $$select public.update_contest_scoring('20000000-0000-4000-8000-000000000001','70000000-0000-4000-8000-000000000001', 5, 3, 2)$$,
  'P0001', 'locked: reason required',
  'a locked contest refuses a silent scoring change'
);
select is(
  public.update_contest_scoring(
    '20000000-0000-4000-8000-000000000001',
    '70000000-0000-4000-8000-000000000001', 5, 3, 2,
    'correction du barème pour le test de verrouillage'
  ), true, 'scoring update succeeds atomically (with audited reason)'
);

set local "request.jwt.claim.sub" = '10000000-0000-4000-8000-000000000001';
select results_eq('select count(*) from public.participations', array[1::bigint], 'owner can read participations');
select results_eq('select count(*) from public.newsletter_subscribers', array[1::bigint], 'owner can read newsletter');
select results_eq('select count(*) from public.contest_players', array[1::bigint], 'owner can read contest players');
select results_eq($$select count(*) from public.audit_logs where action = 'campaigns.update'$$, array[1::bigint], 'direct editor mutation is audited for owner');
select results_eq(
  $$select points from public.contest_predictions where match_id = '71000000-0000-4000-8000-000000000001'$$,
  array[2], 'scoring update recalculates a finished prediction'
);
select results_eq(
  $$select count(*) from public.audit_logs where action in ('contest.result.set','contest.scoring.update')$$,
  array[2::bigint], 'result and scoring mutations are audited'
);
select throws_ok(
  $$delete from public.contest_matches where id = '71000000-0000-4000-8000-000000000001'$$,
  '42501', 'permission denied for table contest_matches',
  'direct match deletion is forbidden'
);
select throws_ok(
  $$select public.delete_contest_match('20000000-0000-4000-8000-000000000001','71000000-0000-4000-8000-000000000002')$$,
  'P0001', 'managed match', 'managed match deletion is forbidden'
);
-- Le match porte un pronostic : suppression motivée uniquement.
select throws_ok(
  $$select public.delete_contest_match('20000000-0000-4000-8000-000000000001','71000000-0000-4000-8000-000000000001')$$,
  'P0001', 'locked: reason required',
  'deleting a predicted match without a reason is refused'
);
select is(
  public.delete_contest_match(
    '20000000-0000-4000-8000-000000000001',
    '71000000-0000-4000-8000-000000000001',
    'match annulé par la fédération (test)'
  ), true, 'manual match deletion uses the guarded RPC'
);
select results_eq(
  $$select count(*) from public.audit_logs where action = 'contest.match.delete'$$,
  array[1::bigint], 'match deletion is audited'
);
select is(
  public.delete_contest(
    '20000000-0000-4000-8000-000000000001',
    '70000000-0000-4000-8000-000000000001'
  ), 'TESTPRONO', 'contest deletion returns its invalidated slug'
);
select results_eq(
  $$select count(*) from public.audit_logs where action = 'contest.delete'$$,
  array[1::bigint], 'contest deletion is audited'
);

reset role;
select * from finish();
rollback;
