-- ============================================================
-- Monitoring opérationnel — RPC de santé et métriques réelles.
-- ============================================================
begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

-- ── ops_metrics_summary : p50/p95 et taux d'erreur exacts ────
insert into public.ops_metrics (op, duration_ms, ok)
select 'tap.op', v, true from unnest(array[100, 200, 300, 400, 500, 600, 700, 800, 900]) as v;
insert into public.ops_metrics (op, duration_ms, ok) values ('tap.op', 1000, false);

select results_eq(
  $$select calls, error_rate, p50_ms, p95_ms
      from public.ops_metrics_summary(24) where op = 'tap.op'$$,
  $$values (10::bigint, 0.1000::numeric, 550, 955)$$,
  'p50/p95 (percentile_cont) et taux d''erreur calculés sur la fenêtre'
);
select is(
  (select count(*) from public.ops_metrics_summary(24) where op = 'tap.vieux'),
  0::bigint, 'une opération sans mesure récente n''apparaît pas'
);

-- ── cron_last_success : les jobs planifiés par les migrations ──
select ok(
  exists (select 1 from public.cron_last_success()
           where jobname = 'lastchance-jobs-worker'),
  'le worker de file est planifié et visible'
);
select ok(
  exists (select 1 from public.cron_last_success()
           where jobname = 'lastchance-sync-contests'),
  'le worker de synchro est planifié et visible'
);

-- ── applied_migrations_info : version réellement appliquée ───
select ok(
  (select latest from public.applied_migrations_info()) >= '20260722120000',
  'la version appliquée couvre la migration du monitoring'
);
select ok(
  (select total from public.applied_migrations_info()) >= 30,
  'le compte de migrations appliquées est plausible'
);

-- ── ACL : mesures et santé réservées au serveur ──────────────
select ok(not has_table_privilege('authenticated', 'public.ops_metrics', 'SELECT'), 'merchants cannot read ops metrics');
select ok(not has_table_privilege('anon', 'public.ops_metrics', 'SELECT'), 'anon cannot read ops metrics');
select ok(has_function_privilege('service_role', 'public.ops_metrics_summary(integer)', 'EXECUTE'), 'server can summarize metrics');
select ok(not has_function_privilege('authenticated', 'public.ops_metrics_summary(integer)', 'EXECUTE'), 'merchants cannot summarize metrics');
select ok(has_function_privilege('service_role', 'public.cron_last_success()', 'EXECUTE'), 'server can read cron health');
select ok(not has_function_privilege('authenticated', 'public.cron_last_success()', 'EXECUTE'), 'merchants cannot read cron health');
select ok(has_function_privilege('service_role', 'public.applied_migrations_info()', 'EXECUTE'), 'server can read applied migrations');
select ok(not has_function_privilege('anon', 'public.applied_migrations_info()', 'EXECUTE'), 'anon cannot probe migrations');

select finish();
rollback;
