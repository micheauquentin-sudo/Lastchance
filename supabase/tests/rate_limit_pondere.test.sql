begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

select ok(
  not has_function_privilege(
    'anon',
    'public.check_rate_limit_weighted(text,integer,integer,integer)',
    'execute'
  ),
  'RATE-BATCH-1 anon ne peut pas appeler le compteur pondere'
);
select ok(
  not has_function_privilege(
    'authenticated',
    'public.check_rate_limit_weighted(text,integer,integer,integer)',
    'execute'
  ),
  'RATE-BATCH-2 authenticated ne peut pas appeler le compteur pondere'
);
select ok(
  has_function_privilege(
    'service_role',
    'public.check_rate_limit_weighted(text,integer,integer,integer)',
    'execute'
  ),
  'RATE-BATCH-3 service_role peut appeler le compteur pondere'
);

select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select is(
  public.check_rate_limit_weighted('tap:weighted', 10, 600, 4),
  true,
  'RATE-BATCH-4 un premier lot sous le plafond passe'
);
select is(
  (select count from public.rate_limits where bucket = 'tap:weighted'),
  4,
  'RATE-BATCH-5 le poids complet du lot est conserve'
);
select is(
  public.check_rate_limit_weighted('tap:weighted', 10, 600, 7),
  false,
  'RATE-BATCH-6 le lot qui franchit le plafond est refuse'
);
select is(
  (select count from public.rate_limits where bucket = 'tap:weighted'),
  11,
  'RATE-BATCH-7 les passages restent tous comptes apres franchissement'
);

select * from finish();
rollback;
