-- ============================================================
-- Réconciliation des exécutions abandonnées, appelable SEULE.
--
-- Le mécanisme existait déjà, à l'intérieur de
-- purge_ops_worker_runs (20260805240000) : le défaut n'était pas
-- son absence, c'était sa CADENCE. Cette fonction n'est appelée
-- que par le cron de purge, à 03:00 — une exécution interrompue à
-- 09:20 ment donc « running » pendant près de dix-huit heures,
-- et `last_status` avec elle.
--
-- Extraire le geste permet de l'appeler toutes les cinq minutes
-- SANS traîner le balayage de rétention, qui est l'autre moitié
-- de la fonction et la plus chère : deux fenêtres temporelles,
-- deux window functions sur toute la table et une anti-jointure.
-- Le refermage, lui, est un seul UPDATE sur un index existant
-- (ops_worker_runs_purge_idx, sur started_at).
--
-- Il ne reste QU'UNE implémentation de la réconciliation :
-- purge_ops_worker_runs est réécrite plus bas pour appeler
-- celle-ci, sa signature et son type de retour inchangés.
-- ============================================================

create or replace function public.reap_ops_worker_runs(
  p_stale_after_minutes integer default 60
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_stale integer := least(1440, greatest(5, coalesce(p_stale_after_minutes, 60)));
  v_reaped integer := 0;
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

  return v_reaped;
end;
$$;

comment on function public.reap_ops_worker_runs(integer) is
  'Referme les exécutions de workers abandonnées (status running au-delà du seuil) en failed/run_abandoned, et retourne leur nombre. Existe séparément de purge_ops_worker_runs pour être appelable à cadence courte sans payer le balayage de rétention.';

revoke all on function public.reap_ops_worker_runs(integer)
  from public, anon, authenticated;
grant execute on function public.reap_ops_worker_runs(integer) to service_role;

-- ============================================================
-- purge_ops_worker_runs : même contrat, une seule implémentation
-- ============================================================
-- Signature et type de retour STRICTEMENT inchangés — la route
-- src/app/api/cron/purge-data/route.ts l'appelle sans argument et
-- lit reaped/deleted. Seul le bloc de refermage disparaît, délégué
-- à reap_ops_worker_runs : le bornage du seuil y est fait aussi,
-- on passe donc le paramètre brut plutôt que de le borner deux
-- fois. L'ordre reste celui d'origine — refermer AVANT de purger,
-- sinon la rétention raisonnerait sur des statuts périmés.
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
  v_reaped integer := 0;
  v_deleted integer := 0;
begin
  v_reaped := public.reap_ops_worker_runs(p_stale_after_minutes);

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
  'Hygiène du journal des workers : délègue le refermage des exécutions abandonnées à reap_ops_worker_runs, puis purge au-delà de la rétention en préservant la dernière exécution et le dernier succès de chaque worker.';

revoke all on function public.purge_ops_worker_runs(integer, integer)
  from public, anon, authenticated;
grant execute on function public.purge_ops_worker_runs(integer, integer) to service_role;
