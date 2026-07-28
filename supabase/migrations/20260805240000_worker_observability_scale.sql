-- ============================================================
-- LastChance — observabilité fiable des workers et passage à
-- l'échelle des crons.
--
-- Complément ADDITIF de 20260805120000 (ops_worker_runs +
-- ops_workers_health). Ce qui existait déjà et n'est PAS refait :
-- le heartbeat lui-même, le résultat (status), la durée
-- (duration_ms), les compteurs (counters jsonb borné), l'erreur
-- assainie (error_code, 120 car., sans payload ni URL ni secret),
-- la RLS et les grants service_role, les deux index de lecture.
--
-- Trois manques réels, et seulement ceux-là :
--
--   1. ÉCHELLE — `ops_worker_runs.worker` était un CHECK figé sur
--      deux valeurs et `ops_workers_health()` portait ses deux
--      workers, leurs tolérances et leurs noms de secrets Vault EN
--      DUR dans son corps. Huit workers tournent (vercel.json en
--      déclare sept, pg_cron pilote jobs et sync-contests) : six
--      d'entre eux ne peuvent PAS écrire un heartbeat, et en
--      brancher un exigeait une migration. Le registre
--      `ops_worker_definitions` déplace ces constantes en données ;
--      brancher un worker devient un UPDATE.
--
--   2. RETARD — rien ne mesurait l'écart entre le moment où une
--      exécution était DUE et celui où elle a réellement démarré.
--      `expected_at` / `lag_seconds` sont calculés PAR LA BASE
--      (trigger BEFORE INSERT) puis GELÉS : l'horloge d'un worker
--      qui va mal n'est pas une source fiable sur son propre retard.
--
--   3. RÉTENTION — `ops_worker_runs` n'était purgée par personne
--      (`ops_metrics` l'est à 30 j par le cron purge-data, pas
--      elle) et une exécution interrompue restait `running` POUR
--      TOUJOURS, laissant `last_status` mentir indéfiniment.
--
-- Aucune donnée n'est détruite ici, aucune règle de santé existante
-- n'est desserrée : les valeurs semées reproduisent EXACTEMENT le
-- comportement actuel (jobs 5 min / tolérance 15 min / backlog
-- 30 min ; sync-contests 10 min / tolérance 30 min), et les six
-- autres workers sont enregistrés `enabled = false`, donc absents
-- de la santé tant que leur route n'écrit pas de heartbeat.
-- ============================================================

-- ============================================================
-- 1. Registre des workers — la liste cesse d'être du code
-- ============================================================
create table public.ops_worker_definitions (
  worker text primary key
    check (worker ~ '^[a-z][a-z0-9-]{1,39}$'),
  -- Période nominale de planification. 60 s = le pas le plus court
  -- qu'un cron externe puisse tenir ; 7 j = le plus long qui garde
  -- un sens de « heartbeat ».
  expected_period_seconds integer not null
    check (expected_period_seconds between 60 and 604800),
  -- Au-delà de cet âge sans succès, le worker est déclaré malade.
  -- Toujours >= la période : une tolérance plus courte que le pas de
  -- planification déclarerait malade un worker parfaitement sain.
  tolerance_seconds integer not null
    check (tolerance_seconds between 60 and 2592000),
  -- Secrets Vault requis pour que le worker soit seulement
  -- DÉCLENCHABLE. `null` = aucun prérequis Vault (cron Vercel
  -- authentifié par CRON_SECRET côté application, invisible d'ici) :
  -- ces workers sont alors réputés configurés, et c'est le heartbeat
  -- — pas le Vault — qui prouve qu'ils tournent.
  vault_url_secret text
    check (vault_url_secret is null or vault_url_secret ~ '^[a-z][a-z0-9_]{1,60}$'),
  vault_shared_secret text
    check (vault_shared_secret is null or vault_shared_secret ~ '^[a-z][a-z0-9_]{1,60}$'),
  -- Uniquement pour les workers qui DRAINENT public.jobs : âge du
  -- plus vieux job dû au-delà duquel la file est déclarée en retard.
  -- `null` = ce worker ne draine pas la file.
  job_backlog_threshold_minutes integer
    check (job_backlog_threshold_minutes is null
           or job_backlog_threshold_minutes between 1 and 1440),
  -- Faux par défaut, et c'est délibéré : un worker enregistré mais
  -- pas encore branché doit être INVISIBLE de la santé plutôt que
  -- rouge à tort. Passer un worker en supervision = un UPDATE, une
  -- fois que sa route écrit réellement son heartbeat.
  enabled boolean not null default false,
  created_at timestamptz not null default now(),
  constraint ops_worker_definitions_tolerance_check
    check (tolerance_seconds >= expected_period_seconds)
);

comment on table public.ops_worker_definitions is
  'Registre des workers supervisés : période, tolérance, secrets Vault requis. Service role uniquement ; aucune donnée personnelle. Brancher un worker = un UPDATE de enabled, pas une migration.';
comment on column public.ops_worker_definitions.enabled is
  'Supervisé par ops_workers_health(). Faux tant que la route du worker n''écrit pas de heartbeat : un worker jamais branché serait sinon rouge à tort.';
comment on column public.ops_worker_definitions.vault_url_secret is
  'Nom (jamais la valeur) du secret Vault portant l''URL du worker. null = worker sans prérequis Vault.';

alter table public.ops_worker_definitions enable row level security;
revoke all on table public.ops_worker_definitions from public, anon, authenticated;
grant select, insert, update, delete on table public.ops_worker_definitions to service_role;

-- Les deux workers fréquents, à l'identique de ce que
-- ops_workers_health() portait en dur (aucun changement de seuil).
insert into public.ops_worker_definitions (
  worker, expected_period_seconds, tolerance_seconds,
  vault_url_secret, vault_shared_secret,
  job_backlog_threshold_minutes, enabled
) values
  ('jobs', 300, 900, 'jobs_worker_url', 'sync_contests_secret', 30, true),
  ('sync-contests', 600, 1800, 'sync_contests_url', 'sync_contests_secret', null, true)
on conflict (worker) do nothing;

-- Les six crons quotidiens de vercel.json, enregistrés mais NON
-- supervisés : leurs routes n'ouvrent pas encore de heartbeat. Les
-- inscrire ici est ce qui rend leur branchement ultérieur sans
-- migration ; la clé étrangère posée en section 2 refusera tout
-- autre nom de worker. Tolérance 30 h : le plan Hobby déclenche un
-- cron « dans l'heure », une tolérance à 25 h serait du bruit.
insert into public.ops_worker_definitions (
  worker, expected_period_seconds, tolerance_seconds, enabled
) values
  ('reengage', 86400, 108000, false),
  ('purge-data', 86400, 108000, false),
  ('webhooks', 86400, 108000, false),
  ('automations', 86400, 108000, false),
  ('calendar-reminders', 86400, 108000, false),
  ('jackpot-draws', 86400, 108000, false)
on conflict (worker) do nothing;

-- ============================================================
-- 2. ops_worker_runs — le nom du worker devient une référence
-- ============================================================
-- Un heartbeat portant un worker inconnu du registre ne serait
-- rattachable à aucune attente de fréquence : il compterait comme
-- une exécution que personne ne surveille. La clé étrangère rend ce
-- cas impossible, là où le CHECK figé rendait impossible TOUT ajout.
do $$
declare
  v_orphans text;
begin
  select pg_catalog.string_agg(distinct r.worker, ', ' order by r.worker)
    into v_orphans
    from public.ops_worker_runs r
   where not exists (
     select 1 from public.ops_worker_definitions d where d.worker = r.worker
   );
  if v_orphans is not null then
    raise exception
      'ops_worker_runs contient des workers absents du registre : %. Ajoutez-les a public.ops_worker_definitions avant de rejouer cette migration.',
      v_orphans;
  end if;
end;
$$;

alter table public.ops_worker_runs
  drop constraint if exists ops_worker_runs_worker_check;

-- Contrôle explicite : si le CHECK figé avait porté un autre nom, il
-- survivrait au drop ci-dessus et continuerait de refuser les six
-- nouveaux workers — en silence, et seulement en production.
do $$
declare
  v_name text;
begin
  select con.conname
    into v_name
    from pg_catalog.pg_constraint con
   where con.conrelid = 'public.ops_worker_runs'::regclass
     and con.contype = 'c'
     and pg_catalog.pg_get_constraintdef(con.oid) like '%sync-contests%'
   limit 1;
  if v_name is not null then
    raise exception
      'La contrainte % fige encore la liste des workers de ops_worker_runs.',
      v_name;
  end if;
end;
$$;

alter table public.ops_worker_runs
  add constraint ops_worker_runs_worker_fkey
  foreign key (worker) references public.ops_worker_definitions (worker)
  on update cascade;

-- ============================================================
-- 3. Le retard, mesuré et gelé par la base
-- ============================================================
alter table public.ops_worker_runs
  add column if not exists expected_at timestamptz,
  add column if not exists lag_seconds integer;

alter table public.ops_worker_runs
  drop constraint if exists ops_worker_runs_lag_check;
alter table public.ops_worker_runs
  add constraint ops_worker_runs_lag_check
  check (lag_seconds is null or lag_seconds >= 0);

comment on column public.ops_worker_runs.expected_at is
  'Instant où cette exécution était due (démarrage précédent + période du registre). null pour la toute première exécution d''un worker.';
comment on column public.ops_worker_runs.lag_seconds is
  'Retard réel au démarrage, en secondes, calculé et gelé par la base. Jamais fourni par le worker : son horloge est justement ce qui peut aller mal.';

create or replace function public.ops_worker_runs_set_lag()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_period integer;
  v_previous timestamptz;
begin
  select d.expected_period_seconds
    into v_period
    from public.ops_worker_definitions d
   where d.worker = new.worker;

  select r.started_at
    into v_previous
    from public.ops_worker_runs r
   where r.worker = new.worker
     and r.started_at < new.started_at
   order by r.started_at desc
   limit 1;

  -- Première exécution connue, ou worker sans période déclarée :
  -- aucun retard n'est CALCULABLE. On écrit null, jamais zéro — un
  -- zéro se lirait « à l'heure » et masquerait exactement le trou
  -- qu'on cherche à voir.
  if v_period is null or v_previous is null then
    new.expected_at := null;
    new.lag_seconds := null;
    return new;
  end if;

  new.expected_at := v_previous + pg_catalog.make_interval(secs => v_period);
  new.lag_seconds := least(
    2147483647,
    greatest(
      0,
      pg_catalog.floor(extract(epoch from (new.started_at - new.expected_at)))
    )
  )::integer;
  return new;
end;
$$;

revoke all on function public.ops_worker_runs_set_lag()
  from public, anon, authenticated;

drop trigger if exists ops_worker_runs_set_lag on public.ops_worker_runs;
create trigger ops_worker_runs_set_lag
  before insert on public.ops_worker_runs
  for each row execute function public.ops_worker_runs_set_lag();

-- Le retard est une MESURE, pas un champ applicatif : la clôture du
-- heartbeat (status, completed_at, duration_ms, counters, error_code)
-- ne doit pas pouvoir le réécrire, même depuis le service_role.
create or replace function public.ops_worker_runs_freeze_lag()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.expected_at := old.expected_at;
  new.lag_seconds := old.lag_seconds;
  return new;
end;
$$;

revoke all on function public.ops_worker_runs_freeze_lag()
  from public, anon, authenticated;

drop trigger if exists ops_worker_runs_freeze_lag on public.ops_worker_runs;
create trigger ops_worker_runs_freeze_lag
  before update on public.ops_worker_runs
  for each row execute function public.ops_worker_runs_freeze_lag();

-- Balayage par ancienneté (rétention et réparation), tous workers
-- confondus : les deux index existants sont préfixés par `worker`.
-- Même motif que ops_metrics_purge_idx.
create index if not exists ops_worker_runs_purge_idx
  on public.ops_worker_runs (started_at);

-- ============================================================
-- 4. Rétention et exécutions abandonnées
-- ============================================================
-- Deux gestes indissociables, donc une seule fonction : purger sans
-- refermer les exécutions abandonnées laisserait un `running`
-- éternel en tête de journal (`last_status` ment), et refermer sans
-- purger laisserait la table croître indéfiniment.
create or replace function public.purge_ops_worker_runs(
  p_older_than_days integer default 30,
  p_stale_after_minutes integer default 60
)
returns table (reaped integer, deleted integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_days integer := least(3650, greatest(1, coalesce(p_older_than_days, 30)));
  v_stale integer := least(1440, greatest(5, coalesce(p_stale_after_minutes, 60)));
  v_reaped integer := 0;
  v_deleted integer := 0;
begin
  -- Une exécution interrompue (déploiement, timeout de la fonction,
  -- process tué) ne clôt jamais son heartbeat. `duration_ms` est
  -- BORNÉE avant le cast : un abandon de plusieurs jours dépasse
  -- l'int4 en millisecondes et ferait échouer la réparation entière.
  with reaped_runs as (
    update public.ops_worker_runs r
       set status = 'failed',
           completed_at = pg_catalog.now(),
           duration_ms = least(
             2147483647,
             pg_catalog.floor(
               extract(epoch from (pg_catalog.now() - r.started_at)) * 1000
             )
           )::integer,
           error_code = 'run_abandoned'
     where r.status = 'running'
       and r.started_at < pg_catalog.now() - pg_catalog.make_interval(mins => v_stale)
    returning r.id
  )
  select pg_catalog.count(*)::integer into v_reaped from reaped_runs;

  -- La dernière exécution de chaque worker ET son dernier succès
  -- SURVIVENT à la rétention, quel que soit leur âge : ce sont les
  -- deux lignes que lit ops_workers_health(). Les supprimer ferait
  -- basculer un worker simplement arrêté depuis longtemps sur
  -- « never_succeeded » — un diagnostic faux, et le plus trompeur
  -- des deux.
  with keep as (
    select x.id
      from (
        select r.id,
               pg_catalog.row_number() over (
                 partition by r.worker order by r.started_at desc
               ) as rn
          from public.ops_worker_runs r
      ) x
     where x.rn = 1
    union
    select y.id
      from (
        select r.id,
               pg_catalog.row_number() over (
                 partition by r.worker order by r.completed_at desc
               ) as rn
          from public.ops_worker_runs r
         where r.status = 'succeeded'
      ) y
     where y.rn = 1
  ),
  removed as (
    delete from public.ops_worker_runs r
     where r.started_at < pg_catalog.now() - pg_catalog.make_interval(days => v_days)
       and not exists (select 1 from keep k where k.id = r.id)
    returning r.id
  )
  select pg_catalog.count(*)::integer into v_deleted from removed;

  return query select v_reaped, v_deleted;
end;
$$;

comment on function public.purge_ops_worker_runs(integer, integer) is
  'Hygiène du journal des workers : referme les exécutions abandonnées puis purge au-delà de la rétention, en préservant la dernière exécution et le dernier succès de chaque worker.';

revoke all on function public.purge_ops_worker_runs(integer, integer)
  from public, anon, authenticated;
grant execute on function public.purge_ops_worker_runs(integer, integer) to service_role;

-- ============================================================
-- 5. ops_workers_health() — même verdict, source registre
-- ============================================================
-- Le corps ne porte plus ni liste de workers, ni tolérance, ni nom
-- de secret : tout vient de ops_worker_definitions. Deux colonnes
-- s'ajoutent en sortie (retard du dernier démarrage, période
-- attendue) ; les neuf existantes gardent leur nom, leur type et
-- leur sémantique. Le DROP est imposé par le changement de type de
-- retour ; il ne détruit aucune donnée.
drop function if exists public.ops_workers_health();

create function public.ops_workers_health()
returns table (
  worker text,
  configured boolean,
  last_started_at timestamptz,
  last_completed_at timestamptz,
  last_status text,
  last_success_at timestamptz,
  last_lag_seconds integer,
  expected_period_seconds integer,
  oldest_due_job_age_minutes integer,
  healthy boolean,
  reason text
)
language sql
security definer
set search_path = ''
as $$
  with definitions as (
    select
      d.worker,
      d.expected_period_seconds,
      d.tolerance_seconds,
      d.job_backlog_threshold_minutes,
      (
        (
          d.vault_url_secret is null
          or exists (
            select 1 from vault.decrypted_secrets s where s.name = d.vault_url_secret
          )
        )
        and (
          d.vault_shared_secret is null
          or exists (
            select 1 from vault.decrypted_secrets s where s.name = d.vault_shared_secret
          )
        )
      ) as configured
      from public.ops_worker_definitions d
     where d.enabled
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
    latest.lag_seconds,
    d.expected_period_seconds,
    case
      when d.job_backlog_threshold_minutes is not null and due.age_minutes is not null
        then greatest(0, due.age_minutes)
      else null
    end,
    (
      d.configured
      and succeeded.completed_at is not null
      and succeeded.completed_at
        >= pg_catalog.now() - pg_catalog.make_interval(secs => d.tolerance_seconds)
      and not (
        latest.status in ('failed', 'degraded')
        and (succeeded.completed_at is null or latest.started_at > succeeded.completed_at)
      )
      and (
        d.job_backlog_threshold_minutes is null
        or due.age_minutes is null
        or due.age_minutes < d.job_backlog_threshold_minutes
      )
    ) as healthy,
    case
      when not d.configured then 'vault_missing'
      when succeeded.completed_at is null then 'never_succeeded'
      when latest.status in ('failed', 'degraded')
        and latest.started_at > succeeded.completed_at then 'last_run_' || latest.status
      when succeeded.completed_at
        < pg_catalog.now() - pg_catalog.make_interval(secs => d.tolerance_seconds)
        then 'heartbeat_stale'
      when d.job_backlog_threshold_minutes is not null
        and due.age_minutes >= d.job_backlog_threshold_minutes then 'job_backlog_stale'
      else 'ok'
    end
  from definitions d
  left join lateral (
    select r.started_at, r.completed_at, r.status, r.lag_seconds
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
