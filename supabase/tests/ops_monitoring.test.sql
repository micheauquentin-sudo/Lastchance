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

-- ── Registre : la liste des workers cesse d'être du code ─────
--
-- Un `count(*) = 8` figurait ici. Il a tenu jusqu'au neuvième worker
-- (`expire-trials`), et son échec disait « 8 attendu, 9 obtenu » — vrai, mais
-- muet sur QUI a bougé : un worker ajouté et un worker perdu se ressemblent
-- dans un compte. `results_eq` nomme la différence, ce qui est tout ce qu'on
-- demande à une assertion qui tombe.
--
-- Le contrôle vraiment mécanique vit côté Vitest (`worker-health.test.ts`),
-- qui DÉRIVE le registre du dossier `supabase/migrations` — pgTAP ne peut pas
-- lire un dossier. Le rôle de cette assertion-ci est complémentaire et
-- distinct : vérifier que les migrations ont RÉELLEMENT posé les lignes, ce
-- qu'aucune lecture de fichier ne peut prouver.
select results_eq(
  $$select worker from public.ops_worker_definitions order by worker$$,
  $$values ('automations'), ('calendar-reminders'), ('contest-reminders'),
           ('expire-trials'), ('jackpot-draws'), ('jobs'), ('purge-data'),
           ('reengage'), ('reservation-waitlist'), ('sync-contests'),
           ('webhooks'), ('weekly-digest')$$,
  'le registre porte exactement les douze workers du projet, nommés'
);
-- CONTRÔLE NÉGATIF DE LA RÈGLE DE 20260820120000. Cette migration supervise
-- tout worker ayant DÉJÀ déposé un succès dans `ops_worker_runs`. Sur une
-- base fraîchement remise à zéro, cette table est VIDE : la règle ne doit
-- donc rallumer personne, et le compte reste celui des deux workers externes
-- (`jobs`, `sync-contests`) activés à l'inscription.
--
-- C'est l'assertion qui empêche la règle de déborder. Si quelqu'un remplace
-- un jour la condition par une liste en dur, ce test tombe ici — et il
-- tombe AVANT que la CI et les postes de développement n'affichent un
-- objectif de service rouge en permanence, pour des workers qui n'ont
-- simplement jamais tourné.
select is(
  (select count(*) from public.ops_worker_definitions where enabled),
  2::bigint,
  'base sans historique : la règle de supervision ne rallume personne'
);
-- J'avais ajouté ici une seconde assertion « et aucun succès n'est
-- enregistré », censée établir la prémisse. Elle est TOMBÉE, et elle avait
-- tort : ce fichier sème lui-même des exécutions de worker plus haut pour
-- éprouver `ops_workers_health()`. Elle mesurait donc l'état APRÈS ses
-- propres insertions, pas celui qui vaut au moment où la migration
-- s'applique.
--
-- Retirée plutôt que rafistolée : une prémisse qu'on ne peut pas observer au
-- bon instant n'est pas une prémisse. Ce qui compte est déjà dit par
-- l'assertion ci-dessus — la règle ne s'exécute qu'UNE fois, au passage de
-- la migration, sur une base alors vierge de tout historique.
select results_eq(
  $$select expected_period_seconds, tolerance_seconds, job_backlog_threshold_minutes
      from public.ops_worker_definitions where worker = 'jobs'$$,
  $$values (300, 900, 30)$$,
  'les seuils de jobs reproduisent EXACTEMENT ceux qui étaient codés en dur'
);
select is(
  (select expected_period_seconds from public.ops_workers_health() where worker = 'jobs'),
  300,
  'la santé lit sa période dans le registre, plus dans son propre corps'
);
select throws_ok(
  $$insert into public.ops_worker_runs (worker, status)
      values ('worker-fantome', 'running')$$,
  '23503', null,
  'un worker absent du registre ne peut pas ouvrir de heartbeat'
);

-- Enregistré mais pas encore branché : le heartbeat est accepté (la
-- route peut être livrée avant la mise sous supervision), et le
-- worker reste INVISIBLE de la santé — un worker jamais branché
-- serait sinon rouge à tort.
insert into public.ops_worker_runs (worker, status, started_at, completed_at, duration_ms)
values ('reengage', 'succeeded', now() - interval '2 seconds', now(), 2000);
select is(
  (select count(*) from public.ops_workers_health()),
  2::bigint,
  'un worker enregistré mais non supervisé reste invisible de la santé'
);

-- ── Retard : mesuré par la base, jamais par le worker ────────
-- purge-data est enregistré à 86 400 s de période et NON supervisé :
-- ces trois exécutions n'influencent aucune des assertions de santé.
insert into public.ops_worker_runs (worker, status, started_at, completed_at, duration_ms)
values ('purge-data', 'succeeded',
        now() - interval '3 days', now() - interval '3 days' + interval '1 second', 1000);
insert into public.ops_worker_runs (worker, status, started_at, completed_at, duration_ms, error_code)
values ('purge-data', 'failed',
        now() - interval '12 hours', now() - interval '12 hours' + interval '1 second', 1000, 'boom');
insert into public.ops_worker_runs (worker, status, started_at)
values ('purge-data', 'running', now() - interval '2 days');

select is(
  (select lag_seconds from public.ops_worker_runs
    where worker = 'purge-data' and status = 'succeeded'),
  null::integer,
  'la toute première exécution d''un worker n''invente pas un retard de zéro'
);
select is(
  (select expected_at from public.ops_worker_runs
    where worker = 'purge-data' and status = 'failed'),
  (select started_at + interval '1 day' from public.ops_worker_runs
    where worker = 'purge-data' and status = 'succeeded'),
  'l''échéance attendue est le démarrage précédent + la période du registre'
);
select is(
  (select lag_seconds from public.ops_worker_runs
    where worker = 'purge-data' and status = 'failed'),
  129600,
  'le retard réel est mesuré en secondes (36 h ici)'
);
select is(
  (select lag_seconds from public.ops_worker_runs
    where worker = 'purge-data' and status = 'running'),
  0,
  'une exécution partie à l''heure porte un retard NUL, pas null'
);

update public.ops_worker_runs
   set lag_seconds = 0, expected_at = now()
 where worker = 'purge-data' and status = 'failed';
select is(
  (select lag_seconds from public.ops_worker_runs
    where worker = 'purge-data' and status = 'failed'),
  129600,
  'le retard mesuré par la base ne peut pas être réécrit à la clôture'
);

-- ── Exécutions abandonnées et rétention ─────────────────────
select results_eq(
  $$select reaped, deleted from public.purge_ops_worker_runs(30, 60)$$,
  $$values (1, 0)$$,
  'une exécution abandonnée est refermée, aucune ligne dans la rétention n''est purgée'
);
select results_eq(
  $$select status, duration_ms > 0 from public.ops_worker_runs
      where error_code = 'run_abandoned'$$,
  $$values ('failed'::text, true)$$,
  'l''exécution interrompue cesse de mentir « running » indéfiniment'
);
select results_eq(
  $$select reaped, deleted from public.purge_ops_worker_runs(1, 60)$$,
  $$values (0, 1)$$,
  'la rétention ne supprime que ce qui est hors fenêtre et non protégé'
);
select is(
  (select count(*) from public.ops_worker_runs where worker = 'purge-data'),
  2::bigint,
  'la dernière exécution et le dernier succès survivent à la rétention'
);
select ok(
  exists (
    select 1 from public.ops_worker_runs
     where worker = 'purge-data' and status = 'succeeded'
  ),
  'le dernier succès n''est jamais purgé — la santé le lirait « jamais réussi »'
);

-- ── Passage à l'échelle : superviser = un UPDATE ─────────────
update public.ops_worker_definitions set enabled = true where worker = 'reengage';
select is(
  (select count(*) from public.ops_workers_health()),
  3::bigint,
  'mettre un worker de plus sous supervision est un UPDATE, pas une migration'
);
select is(
  (select reason from public.ops_workers_health() where worker = 'reengage'),
  'ok'::text,
  'un worker sans prérequis Vault et au heartbeat frais est sain'
);
update public.ops_worker_definitions set enabled = false where worker = 'reengage';

-- ── ACL du registre et de la purge ──────────────────────────
select ok(
  (select relrowsecurity from pg_class
    where oid = 'public.ops_worker_definitions'::regclass),
  'ops_worker_definitions a RLS active'
);
select ok(
  not has_table_privilege('authenticated', 'public.ops_worker_definitions', 'SELECT'),
  'les commerçants ne lisent pas le registre des workers'
);
select ok(
  not has_table_privilege('anon', 'public.ops_worker_definitions', 'SELECT'),
  'anon ne lit pas le registre des workers'
);
select ok(
  has_table_privilege('service_role', 'public.ops_worker_definitions', 'UPDATE'),
  'le serveur peut brancher un worker sans migration'
);
select ok(
  has_function_privilege('service_role', 'public.purge_ops_worker_runs(integer,integer)', 'EXECUTE'),
  'le serveur peut purger le journal des workers'
);
select ok(
  not has_function_privilege('authenticated', 'public.purge_ops_worker_runs(integer,integer)', 'EXECUTE'),
  'les commerçants ne purgent pas le journal des workers'
);
select ok(
  not has_function_privilege('anon', 'public.purge_ops_worker_runs(integer,integer)', 'EXECUTE'),
  'anon ne purge pas le journal des workers'
);

select finish();
rollback;
