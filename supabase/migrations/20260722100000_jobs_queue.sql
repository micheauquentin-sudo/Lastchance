-- ============================================================
-- Lastchance — File de travaux générique (audit #7)
--
-- Les traitements longs sortent des requêtes HTTP : une table `jobs`
-- unique (emails par lots, relances, exports, rappels… extensible par
-- type), réclamée par un worker fréquent (pg_cron → /api/cron/jobs,
-- même mécanique Vault que le worker de synchro), avec verrou par
-- ligne, reprise après expiration, backoff et idempotence.
--
--  - newsletter : l'action ne fait plus qu'inscrire la campagne
--    (statut queued) et déposer un job — l'envoi des lots se fait au
--    worker ; le journal affiche queued/sending/completed/partial/
--    failed avec relance.
--  - réengagement : le cron quotidien DÉPOSE un job par organisation
--    (idempotent par jour) au lieu de tout traiter dans sa requête.
--  - webhooks sortants : la file webhook_deliveries existait déjà —
--    le worker fréquent la draine désormais aussi (les retys en
--    minutes redeviennent réels), et l'épuisement des tentatives est
--    matérialisé (failed_at = dead-letter) avec rejeu commerçant.
-- ============================================================

-- ── File générique ───────────────────────────────────────────
create table public.jobs (
  id uuid primary key default gen_random_uuid(),
  type text not null check (char_length(type) between 1 and 60),
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'queued'
    check (status in ('queued', 'running', 'completed', 'partial', 'failed')),
  run_after timestamptz not null default now(),
  attempts integer not null default 0,
  max_attempts integer not null default 5 check (max_attempts between 1 and 20),
  locked_until timestamptz,
  idempotency_key text,
  last_error text,
  organization_id uuid references public.organizations(id) on delete cascade,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  unique (idempotency_key)
);

comment on table public.jobs is
  'File de travaux générique (newsletter, relances, webhooks demain : exports, rappels, passes Wallet). Service role uniquement.';

-- Le worker ne parcourt que le dû ; l'index reste minuscule.
create index jobs_due_idx on public.jobs (run_after, created_at)
  where status = 'queued';
create index jobs_org_idx on public.jobs (organization_id, created_at desc);

alter table public.jobs enable row level security;
revoke all on table public.jobs from public, anon, authenticated;
grant select, insert, update, delete on table public.jobs to service_role;

-- Claim atomique : passe les jobs dus en `running`, verrouillés le
-- temps du traitement (reprise automatique si le worker meurt :
-- locked_until expire et le job redevient réclamable tant que
-- attempts < max_attempts via requeue du worker).
create or replace function public.claim_jobs(
  p_types text[],
  p_limit integer default 10,
  p_lock_seconds integer default 120
)
returns setof public.jobs
language sql
security definer
set search_path = ''
as $$
  update public.jobs j set
    status = 'running',
    attempts = j.attempts + 1,
    locked_until = pg_catalog.now()
      + pg_catalog.make_interval(secs => least(greatest(p_lock_seconds, 30), 600))
  from (
    select q.id from public.jobs q
    where q.status = 'queued'
      and q.type = any (p_types)
      and q.run_after <= pg_catalog.now()
    order by q.run_after, q.created_at
    for update skip locked
    limit least(greatest(p_limit, 1), 50)
  ) due
  where j.id = due.id
  returning j.*
$$;

revoke all on function public.claim_jobs(text[], integer, integer)
  from public, anon, authenticated;
grant execute on function public.claim_jobs(text[], integer, integer) to service_role;

-- Reprise des jobs zombies : un `running` dont le verrou a expiré
-- redevient réclamable (le worker est mort en plein traitement).
create or replace function public.requeue_stale_jobs()
returns integer
language sql
security definer
set search_path = ''
as $$
  with revived as (
    update public.jobs j
       set status = 'queued', locked_until = null
     where j.status = 'running'
       and j.locked_until is not null
       and j.locked_until < pg_catalog.now()
     returning 1
  )
  select coalesce(pg_catalog.count(*), 0)::integer from revived
$$;

revoke all on function public.requeue_stale_jobs()
  from public, anon, authenticated;
grant execute on function public.requeue_stale_jobs() to service_role;

-- ── Journal newsletter : cycle de vie visible ────────────────
alter table public.newsletter_campaigns
  add column if not exists status text not null default 'completed'
    check (status in ('queued', 'sending', 'completed', 'partial', 'failed')),
  add column if not exists sent_count integer,
  add column if not exists segment text not null default 'all'
    check (segment in ('all', 'loyal', 'new', 'inactive')),
  add column if not exists completed_at timestamptz;

-- Historique : les campagnes existantes étaient synchrones et réussies ;
-- recipient_count désigne désormais les CIBLÉS, sent_count les envoyés.
update public.newsletter_campaigns
   set sent_count = recipient_count,
       completed_at = created_at
 where sent_count is null;

comment on column public.newsletter_campaigns.status is
  'queued → sending → completed / partial (une partie des lots a échoué) / failed (aucun email parti).';

-- ── Webhooks sortants : dead-letter matérialisée ─────────────
alter table public.webhook_deliveries
  add column if not exists failed_at timestamptz;

comment on column public.webhook_deliveries.failed_at is
  'Tentatives épuisées (dead-letter) : plus jamais réclamée jusqu''au rejeu commerçant (attempts remis à zéro).';

create index if not exists webhook_deliveries_failed_idx
  on public.webhook_deliveries (organization_id, failed_at)
  where failed_at is not null;

-- ── Segments newsletter : le worker (service role) doit cibler ──
-- Même corps que 00017 ; seule la garde s'élargit au service role —
-- l'envoi se fait désormais hors session, dans le worker.
create or replace function public.org_segment_emails(
  p_organization_id uuid, p_segment text,
  p_loyal_wins int default 3, p_inactive_days int default 60
)
returns table (subscriber_id uuid, email text)
language plpgsql security definer set search_path = public stable as $$
begin
  if not (
    coalesce(auth.role(), '') = 'service_role'
    or public.is_org_owner(p_organization_id)
  ) then
    raise exception 'not authorized';
  end if;
  return query
  select s.id, s.email from public.newsletter_subscribers s
  left join lateral (
    select count(*) as wins, max(p.created_at) as last_win
    from public.participations p
    where p.organization_id = s.organization_id and p.email = s.email
  ) agg on true
  where s.organization_id = p_organization_id and s.unsubscribed_at is null
    and case p_segment
      when 'all' then true
      when 'loyal' then coalesce(agg.wins, 0) >= greatest(1, p_loyal_wins)
      when 'new' then coalesce(agg.wins, 0) = 1
      when 'inactive' then agg.last_win is not null and agg.last_win < now() - make_interval(days => greatest(1, p_inactive_days))
      else false
    end;
end;
$$;

-- ── Worker fréquent (pg_cron + pg_net, même mécanique Vault) ──
-- Inactif tant que les secrets Vault n'existent pas (local, CI) ;
-- réutilise le secret du worker de synchro, seule l'URL est nouvelle
-- (jobs_worker_url → /api/cron/jobs).
select cron.schedule(
  'lastchance-jobs-worker',
  '*/5 * * * *',
  $job$
  select net.http_get(
    url := (select decrypted_secret from vault.decrypted_secrets
             where name = 'jobs_worker_url'),
    headers := jsonb_build_object(
      'Authorization',
      'Bearer ' || (select decrypted_secret from vault.decrypted_secrets
                     where name = 'sync_contests_secret')
    ),
    timeout_milliseconds := 55000
  )
  where (select count(*) from vault.decrypted_secrets
          where name in ('jobs_worker_url', 'sync_contests_secret')) = 2
  $job$
);
