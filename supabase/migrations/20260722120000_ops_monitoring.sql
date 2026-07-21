-- ============================================================
-- Lastchance — Monitoring opérationnel réel (audit #8)
--
-- 1. ops_metrics : chaque opération critique passée par monitored()
--    (spin, claim, webhook Stripe, pronostics) écrit durée + issue —
--    les latences p50/p95 et taux d'erreur affichés au back-office
--    sortent de mesures réelles, plus d'état « OK » statique.
-- 2. RPC de santé : dernier succès de chaque job pg_cron, version de
--    migration réellement appliquée — comparée à celle attendue par la
--    release (constante vérifiée par test unitaire).
-- ============================================================

create table public.ops_metrics (
  id bigint generated always as identity primary key,
  op text not null check (char_length(op) between 1 and 60),
  duration_ms integer not null check (duration_ms >= 0),
  ok boolean not null,
  created_at timestamptz not null default now()
);

comment on table public.ops_metrics is
  'Mesures des opérations critiques (monitored()) : latence + issue. Purge à 30 jours par le cron purge-data. Service role uniquement.';

create index ops_metrics_op_idx on public.ops_metrics (op, created_at desc);
create index ops_metrics_purge_idx on public.ops_metrics (created_at);

alter table public.ops_metrics enable row level security;
revoke all on table public.ops_metrics from public, anon, authenticated;
grant select, insert, delete on table public.ops_metrics to service_role;

-- Latence p50/p95 et taux d'erreur par opération sur une fenêtre.
create or replace function public.ops_metrics_summary(p_hours integer default 24)
returns table (
  op text,
  calls bigint,
  error_rate numeric,
  p50_ms integer,
  p95_ms integer
)
language sql
stable
security definer
set search_path = ''
as $$
  select m.op,
         count(*) as calls,
         round(avg((not m.ok)::int)::numeric, 4) as error_rate,
         (percentile_cont(0.5) within group (order by m.duration_ms))::integer as p50_ms,
         (percentile_cont(0.95) within group (order by m.duration_ms))::integer as p95_ms
    from public.ops_metrics m
   where m.created_at > pg_catalog.now()
         - pg_catalog.make_interval(hours => least(greatest(coalesce(p_hours, 24), 1), 720))
   group by m.op
   order by m.op
$$;

revoke all on function public.ops_metrics_summary(integer)
  from public, anon, authenticated;
grant execute on function public.ops_metrics_summary(integer) to service_role;

-- Dernier passage (et dernier succès) de chaque job pg_cron.
create or replace function public.cron_last_success()
returns table (
  jobname text,
  schedule text,
  last_run timestamptz,
  last_success timestamptz,
  last_status text
)
language sql
stable
security definer
set search_path = ''
as $$
  select j.jobname,
         j.schedule,
         max(d.start_time) as last_run,
         max(d.start_time) filter (where d.status = 'succeeded') as last_success,
         (array_agg(d.status order by d.start_time desc))[1] as last_status
    from cron.job j
    left join cron.job_run_details d on d.jobid = j.jobid
   group by j.jobname, j.schedule
   order by j.jobname
$$;

revoke all on function public.cron_last_success()
  from public, anon, authenticated;
grant execute on function public.cron_last_success() to service_role;

-- Version de migration réellement appliquée (comparée côté app à la
-- version attendue par la release).
create or replace function public.applied_migrations_info()
returns table (latest text, total integer)
language sql
stable
security definer
set search_path = ''
as $$
  select max(version) as latest, count(*)::integer as total
    from supabase_migrations.schema_migrations
$$;

revoke all on function public.applied_migrations_info()
  from public, anon, authenticated;
grant execute on function public.applied_migrations_info() to service_role;
