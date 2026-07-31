-- ============================================================
-- Lastchance — superviser les workers dont le heartbeat a fait ses preuves
-- ============================================================
--
-- Aucune fonction créée ni redéfinie : un UPDATE conditionnel. Rien à
-- vérifier au catalogue vivant.
--
--
-- ── LE TROU ──────────────────────────────────────────────────
--
-- `ops_worker_definitions.enabled` décide de la supervision : seuls les
-- workers à `true` entrent dans `ops_workers_health()`, donc dans l'objectif
-- de service du back-office. `20260805240000` a inscrit les six crons
-- quotidiens à `false` avec un motif juste À L'ÉPOQUE — « faux tant que la
-- route du worker n'écrit pas de heartbeat ; un worker jamais branché serait
-- sinon rouge à tort ».
--
-- Leurs routes écrivent un heartbeat depuis. Mesuré, pas supposé :
-- `automations`, `calendar-reminders`, `jackpot-draws`, `purge-data`,
-- `reengage` et `webhooks` appellent tous `startWorkerRunSafely` /
-- `finishWorkerRunSafely` (deux appels chacun dans leur `route.ts`). Ils
-- déposent donc des lignes dans `ops_worker_runs` depuis des semaines —
-- **et personne ne les regarde**.
--
-- C'est la classe de défaut que ce projet a déjà payée : un back-office qui
-- n'enregistrait que ses succès, un cron qui travaille sans laisser de trace.
-- Ici le contraire, mais avec la même conséquence : la trace existe, elle
-- n'est lue par rien. Une purge RGPD qui échouerait chaque nuit ne
-- réveillerait personne.
--
--
-- ── POURQUOI UN UPDATE CONDITIONNEL, ET PAS UNE LISTE EN DUR ─
--
-- La table dit d'elle-même : « Brancher un worker = un UPDATE de enabled,
-- pas une migration. » Le motif est bon — l'état de supervision dépend de
-- l'ENVIRONNEMENT, pas du schéma. Écrire `enabled = true` en dur ici
-- l'imposerait aussi à une base neuve (CI, poste de développement), où
-- aucun worker n'a jamais tourné : `ops_workers_health()` les déclarerait
-- tous `never_succeeded`, et l'objectif de service serait rouge en
-- permanence, partout, pour une raison qui n'est pas un incident.
--
-- La condition résout les deux : on ne supervise QUE ce qui a déjà prouvé
-- qu'il sait déposer un succès. En production les six passent supervisés ;
-- sur une base fraîchement remise à zéro, `ops_worker_runs` est vide et
-- **rien ne change** — la garde ne se déclenche pas, et c'est vérifiable
-- (voir `ops_monitoring.test.sql`, qui relit le compte après reset).
--
-- La règle est GÉNÉRALE et non une énumération : tout worker ayant un
-- succès enregistré devient supervisé. `expire-trials`, déployé aujourd'hui,
-- n'a pas encore tourné (cron à 05:10) — il restera donc `false` ici, et se
-- branchera de lui-même au prochain passage de cette règle, ou par un
-- `UPDATE` d'exploitation une fois son premier succès constaté. C'est le
-- comportement voulu : on ne supervise pas une promesse, on supervise un
-- historique.
--
-- `ops_worker_runs` est purgée à 30 jours (cron `purge-data`) : « a déjà
-- réussi » signifie donc, en pratique, « a réussi dans le mois ». Un worker
-- éteint depuis plus longtemps ne serait pas rallumé par erreur.
-- ============================================================

update public.ops_worker_definitions d
   set enabled = true
 where not d.enabled
   and exists (
     select 1
       from public.ops_worker_runs r
      where r.worker = d.worker
        and r.status = 'succeeded'
   );
