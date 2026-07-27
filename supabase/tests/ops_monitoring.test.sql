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

-- ── Heartbeats réels : jamais de faux vert sans Vault ───────
insert into public.ops_worker_runs (
  worker, status, started_at, completed_at, duration_ms, counters
) values (
  'jobs', 'succeeded', now() - interval '1 second', now(), 1000,
  '{"processed":1}'::jsonb
);

select is(
  (select count(*) from public.ops_workers_health()),
  2::bigint,
  'la santé expose exactement les deux workers attendus'
);
select is(
  (select last_status from public.ops_workers_health() where worker = 'jobs'),
  'succeeded'::text,
  'le dernier statut provient du heartbeat réel'
);
select is(
  (select healthy from public.ops_workers_health() where worker = 'jobs'),
  (select configured from public.ops_workers_health() where worker = 'jobs'),
  'un heartbeat récent est sain si et seulement si le worker est configuré'
);
select ok(
  (select reason from public.ops_workers_health() where worker = 'jobs')
    in ('vault_missing', 'ok'),
  'la raison de santé reste bornée et ne révèle aucun secret'
);
select ok(
  (select relrowsecurity from pg_class
    where oid = 'public.ops_worker_runs'::regclass),
  'ops_worker_runs a RLS active'
);
select ok(
  not has_table_privilege('authenticated', 'public.ops_worker_runs', 'SELECT'),
  'les commerçants ne lisent pas les heartbeats'
);
select ok(
  has_function_privilege('service_role', 'public.ops_workers_health()', 'EXECUTE'),
  'le serveur peut lire la santé réelle'
);
select ok(
  not has_function_privilege('authenticated', 'public.ops_workers_health()', 'EXECUTE'),
  'les commerçants ne peuvent pas sonder Vault'
);

select finish();
rollback;
