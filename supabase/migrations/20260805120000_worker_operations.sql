-- ============================================================
-- Santé réelle des workers fréquents.
--
-- `cron.job_run_details` prouve seulement que pg_cron a exécuté
-- `net.http_get` ; il ne prouve ni la réponse HTTP ni le traitement
-- métier. Ce journal est alimenté par les routes elles-mêmes, après
-- authentification, et n'enregistre ni payload, ni URL, ni secret.
-- ============================================================

create table public.ops_worker_runs (
  id uuid primary key default gen_random_uuid(),
  worker text not null check (worker in ('jobs', 'sync-contests')),
  status text not null default 'running'
    check (status in ('running', 'succeeded', 'degraded', 'failed')),
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  duration_ms integer check (duration_ms is null or duration_ms >= 0),
  counters jsonb not null default '{}'::jsonb
    check (jsonb_typeof(counters) = 'object' and octet_length(counters::text) <= 8192),
  error_code text check (error_code is null or char_length(error_code) between 1 and 120),
  constraint ops_worker_runs_state_check check (
    (status = 'running' and completed_at is null and duration_ms is null)
    or
    (status <> 'running' and completed_at is not null and duration_ms is not null)
  )
);

comment on table public.ops_worker_runs is
  'Heartbeats réels des workers HTTP. Service role uniquement ; aucun payload, secret, URL ou PII.';

create index ops_worker_runs_latest_idx
  on public.ops_worker_runs (worker, started_at desc);
create index ops_worker_runs_success_idx
  on public.ops_worker_runs (worker, completed_at desc)
  where status = 'succeeded';

alter table public.ops_worker_runs enable row level security;
revoke all on table public.ops_worker_runs from public, anon, authenticated;
grant select, insert, update, delete on table public.ops_worker_runs to service_role;

-- Une ligne par worker, sans jamais exposer la valeur des secrets Vault.
-- Le worker jobs est attendu toutes les 5 minutes (tolérance 15 min),
-- la synchro toutes les 10 minutes (tolérance 30 min).
create or replace function public.ops_workers_health()
returns table (
  worker text,
  configured boolean,
  last_started_at timestamptz,
  last_completed_at timestamptz,
  last_status text,
  last_success_at timestamptz,
  oldest_due_job_age_minutes integer,
  healthy boolean,
  reason text
)
language sql
security definer
set search_path = ''
as $$
  with secret_flags as (
    select
      exists(
        select 1 from vault.decrypted_secrets where name = 'jobs_worker_url'
      ) as has_jobs_url,
      exists(
        select 1 from vault.decrypted_secrets where name = 'sync_contests_url'
      ) as has_sync_url,
      exists(
        select 1 from vault.decrypted_secrets where name = 'sync_contests_secret'
      ) as has_shared_secret
  ),
  definitions(worker, configured, max_age_minutes) as (
    select 'jobs'::text, has_jobs_url and has_shared_secret, 15
      from secret_flags
    union all
    select 'sync-contests'::text, has_sync_url and has_shared_secret, 30
      from secret_flags
  ),
  oldest_due as (
    select pg_catalog.floor(
      extract(
        epoch from (pg_catalog.now() - pg_catalog.min(
          case
            when j.status = 'queued' then j.run_after
            else j.created_at
          end
        ))
      ) / 60
    )::integer as age_minutes
    from public.jobs j
    where (j.status = 'queued' and j.run_after <= pg_catalog.now())
       or j.status = 'running'
  )
  select
    d.worker,
    d.configured,
    latest.started_at,
    latest.completed_at,
    latest.status,
    succeeded.completed_at,
    case
      when d.worker = 'jobs' and due.age_minutes is not null
        then greatest(0, due.age_minutes)
      else null
    end,
    (
      d.configured
      and succeeded.completed_at is not null
      and succeeded.completed_at
        >= pg_catalog.now() - pg_catalog.make_interval(mins => d.max_age_minutes)
      and not (
        latest.status in ('failed', 'degraded')
        and (succeeded.completed_at is null or latest.started_at > succeeded.completed_at)
      )
      and (
        d.worker <> 'jobs'
        or due.age_minutes is null
        or due.age_minutes < 30
      )
    ) as healthy,
    case
      when not d.configured then 'vault_missing'
      when succeeded.completed_at is null then 'never_succeeded'
      when latest.status in ('failed', 'degraded')
        and latest.started_at > succeeded.completed_at then 'last_run_' || latest.status
      when succeeded.completed_at
        < pg_catalog.now() - pg_catalog.make_interval(mins => d.max_age_minutes)
        then 'heartbeat_stale'
      when d.worker = 'jobs' and due.age_minutes >= 30 then 'job_backlog_stale'
      else 'ok'
    end
  from definitions d
  left join lateral (
    select r.started_at, r.completed_at, r.status
      from public.ops_worker_runs r
     where r.worker = d.worker
     order by r.started_at desc
     limit 1
  ) latest on true
  left join lateral (
    select r.completed_at
      from public.ops_worker_runs r
     where r.worker = d.worker
       and r.status = 'succeeded'
     order by r.completed_at desc
     limit 1
  ) succeeded on true
  cross join oldest_due due
  order by d.worker
$$;

revoke all on function public.ops_workers_health()
  from public, anon, authenticated;
grant execute on function public.ops_workers_health() to service_role;
