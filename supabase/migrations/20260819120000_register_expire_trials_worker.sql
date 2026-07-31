-- ============================================================
-- Lastchance — inscrire `expire-trials` au registre des workers
-- ============================================================
--
-- Cette migration n'ajoute AUCUNE fonction et n'en redéfinit aucune : elle
-- insère une ligne de référence. Rien à vérifier au catalogue vivant.
--
--
-- ── POURQUOI ELLE EXISTE ─────────────────────────────────────
--
-- `ops_worker_runs.worker` est une CLÉ ÉTRANGÈRE vers
-- `ops_worker_definitions` (20260805240000, section 2). Un heartbeat portant
-- un nom absent du registre est donc refusé par la base.
--
-- Or `startWorkerRunSafely` avale son échec par conception — c'est ce qui
-- l'empêche de faire tomber un cron pour un défaut d'observabilité. La
-- conséquence, sans cette ligne, serait exactement le pire cas : le cron
-- `expire-trials` travaillerait chaque nuit, résilierait des essais, et ne
-- laisserait JAMAIS la moindre trace — un échec silencieux, invisible de la
-- sonde comme du back-office.
--
-- Le test `src/lib/worker-health.test.ts` a été rendu MÉCANIQUE pour cette
-- raison : il dérive désormais le registre du dossier `supabase/migrations`
-- au lieu de recopier la liste à la main. La version précédente serait
-- passée au vert en corrigeant la copie, pendant que la clé étrangère
-- continuait d'échouer chaque nuit en production.
--
--
-- ── POURQUOI `enabled = false` ───────────────────────────────
--
-- `ops_workers_health()` déclare `never_succeeded` — donc NON sain — tout
-- worker supervisé sans exécution réussie. L'activer ici rendrait l'objectif
-- rouge dès l'application de la migration et jusqu'au premier passage du
-- cron, pour une raison qui n'est pas un incident.
--
-- La table le dit elle-même : « Brancher un worker = un UPDATE de enabled,
-- pas une migration », et « Faux tant que la route du worker n'écrit pas de
-- heartbeat : un worker jamais branché serait sinon rouge à tort ». On suit
-- ce précédent, qui est aussi celui des six crons quotidiens inscrits en
-- 20260805240000.
--
-- ÉCART ASSUMÉ ET SIGNALÉ : la route d'`expire-trials`, elle, ÉCRIT bien un
-- heartbeat dès le premier jour — contrairement aux six autres au moment de
-- leur inscription. Ce `false` n'est donc pas « pas encore branché » mais
-- « pas encore observé ». Il se lève par un simple UPDATE une fois le premier
-- passage nominal constaté. Les sept crons quotidiens partagent aujourd'hui
-- cet état d'inscrits-non-supervisés : c'est une lacune réelle
-- d'observabilité, antérieure à ce chantier, qui mérite son propre geste.
--
-- Tolérance 30 h, comme ses six frères : le plan Hobby déclenche un cron
-- « dans l'heure », une tolérance à 25 h serait du bruit.
-- ============================================================

insert into public.ops_worker_definitions (
  worker, expected_period_seconds, tolerance_seconds, enabled
) values
  ('expire-trials', 86400, 108000, false)
on conflict (worker) do nothing;
