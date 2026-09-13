-- Le budget depense est maintenu par les fonctions serveur. Un editeur reel,
-- meme autorise sur sa campagne, ne doit pas pouvoir le diminuer directement.
begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

select ok(
  not pg_catalog.has_column_privilege(
    'authenticated', 'public.campaigns', 'budget_spent_cents', 'UPDATE'
  ),
  'authenticated ne modifie pas campaigns.budget_spent_cents'
);
select ok(
  not pg_catalog.has_column_privilege(
    'authenticated', 'public.campaigns', 'budget_reserved_cents', 'UPDATE'
  ),
  'authenticated ne modifie pas davantage le budget reserve'
);
select ok(
  pg_catalog.has_column_privilege(
    'authenticated', 'public.campaigns', 'budget_cents', 'UPDATE'
  ),
  'le marchand conserve le reglage de son plafond budgetaire'
);
select ok(
  pg_catalog.has_column_privilege(
    'service_role', 'public.campaigns', 'budget_spent_cents', 'UPDATE'
  ),
  'service_role conserve l ecriture necessaire au claim'
);

select set_config('request.jwt.claims', '{"role":"service_role"}', true);
insert into public.organizations (
  id, name, slug, subscription_status
) values (
  'cb000000-0000-4000-8000-000000000001',
  'Organisation budget ACL',
  'tap-campaign-budget-acl',
  'active'
);
insert into auth.users (id, email) values (
  'cb000000-0000-4000-8000-0000000000a1',
  'owner@tap-campaign-budget-acl.local'
);
insert into public.organization_members (organization_id, user_id, role)
values (
  'cb000000-0000-4000-8000-000000000001',
  'cb000000-0000-4000-8000-0000000000a1',
  'owner'
);
insert into public.campaigns (
  id, organization_id, name, status, budget_cents, budget_spent_cents
) values (
  'cb000000-0000-4000-8000-000000000101',
  'cb000000-0000-4000-8000-000000000001',
  'Campagne budget ACL',
  'draft',
  500,
  75
);

select set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"cb000000-0000-4000-8000-0000000000a1"}',
  true
);
select ok(
  public.is_org_editor('cb000000-0000-4000-8000-000000000001'),
  'la sonde utilise un editeur legitime de la campagne'
);

create temporary table tap_budget_acl_result (
  sqlstate text not null,
  message text not null
) on commit drop;

do $probe$
declare
  v_sqlstate text;
  v_message text;
begin
  set local role authenticated;
  begin
    update public.campaigns
       set budget_spent_cents = 0
     where id = 'cb000000-0000-4000-8000-000000000101';
    v_sqlstate := '00000';
    v_message := 'update unexpectedly succeeded';
  exception when others then
    get stacked diagnostics
      v_sqlstate = returned_sqlstate,
      v_message = message_text;
  end;
  reset role;

  insert into tap_budget_acl_result(sqlstate, message)
  values (v_sqlstate, v_message);
end
$probe$;
reset role;

select is(
  (select sqlstate from tap_budget_acl_result),
  '42501',
  'le PATCH direct du budget depense est refuse par les privileges'
);
select is(
  (select budget_spent_cents
     from public.campaigns
    where id = 'cb000000-0000-4000-8000-000000000101'),
  75,
  'le refus conserve le montant depense autoritatif'
);

select * from finish();
rollback;
