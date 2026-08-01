"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { logAdminAction } from "@/lib/admin/audit";
import { AdminForbiddenError, authorizeAction } from "@/lib/admin/auth";
import { createAdminBackofficeClient } from "@/lib/admin/db";
import { authorizeOrTrace } from "@/lib/admin/denied-trace";
import { buildWorkerCronUrl } from "@/lib/admin/worker-cadence";
import { APP_URL, optionalEnv } from "@/lib/env";
import { enqueueJob } from "@/lib/jobs";
import { reportError } from "@/lib/monitoring";
import { createAdminClient } from "@/lib/supabase/admin";
import { workerCadenceSchema } from "@/lib/validations/admin";
import type { ActionResult } from "@/lib/utils";

/**
 * Teste la chaîne HTTP + file + claim + clôture avec un job inerte.
 * Le mode probe de la route ne réclame aucun job métier et ne draine
 * aucun webhook.
 */
export async function runWorkerProbe(
  _previous: ActionResult | null,
): Promise<ActionResult> {
  void _previous;
  let actor;
  try {
    actor = await authorizeAction("monitoring.probe");
  } catch (error) {
    return {
      ok: false,
      error:
        error instanceof AdminForbiddenError
          ? error.message
          : "Action non autorisée.",
    };
  }

  const cronSecret = optionalEnv("CRON_SECRET");
  if (!cronSecret) {
    return { ok: false, error: "CRON_SECRET n'est pas configuré." };
  }

  const admin = createAdminClient();
  const probeKey = `ops-probe:${actor.id}:${randomUUID()}`;
  const enqueued = await enqueueJob(admin, {
    type: "ops.probe",
    payload: {},
    idempotencyKey: probeKey,
    maxAttempts: 1,
  });
  if (!enqueued) {
    return { ok: false, error: "Impossible de déposer le test dans la file." };
  }

  try {
    const response = await fetch(new URL("/api/cron/jobs?probe=1", APP_URL), {
      headers: { Authorization: `Bearer ${cronSecret}` },
      cache: "no-store",
      signal: AbortSignal.timeout(20_000),
    });
    const body = (await response.json()) as {
      probe?: boolean;
      completed?: number;
    };
    const ok =
      response.ok
      && body.probe === true
      && Number(body.completed ?? 0) >= 1;

    await logAdminAction({
      actor,
      action: "monitoring.worker.probe",
      targetType: "worker",
      metadata: {
        ok,
        http_status: response.status,
        completed: Number(body.completed ?? 0),
      },
    });
    revalidatePath("/admin/monitoring");
    return ok
      ? { ok: true, data: undefined }
      : { ok: false, error: "Le worker n'a pas terminé le job de test." };
  } catch (error) {
    reportError("admin.worker-probe", error);
    await logAdminAction({
      actor,
      action: "monitoring.worker.probe",
      targetType: "worker",
      metadata: { ok: false, failure: "request_failed" },
    });
    return { ok: false, error: "Le worker est injoignable." };
  }
}

/* ════════════════════════════════════════════════════════════
 * CADENCE RAPIDE — poser dans le Vault les deux secrets qui réveillent
 * le pg_cron, sans qu'aucun humain ne voie le secret.
 *
 * ── Le fait produit ──
 *
 * `/api/cron/jobs` ne tourne QU'UNE FOIS PAR JOUR : `vercel.json` le planifie à
 * `20 4 * * *`, et le plan Hobby n'accepte pas mieux (assertion « les crons
 * Vercel restent quotidiens » dans `cron-coverage.test.ts`). Conséquence
 * mesurable pour un client : un code de retrait envoyé par SMS peut arriver
 * 24 h après le gain.
 *
 * ── Pourquoi cette action, plutôt qu'un bout de SQL collé à la main ──
 *
 * `CRON_SECRET` est une variable d'environnement SENSIBLE de Vercel : elle ne se
 * relit ni par la CLI ni par personne. L'APPLICATION, elle, l'a dans son propre
 * environnement — c'est même elle qui la vérifie à chaque appel de cron. Elle
 * peut donc la déposer dans le Vault sans que la valeur transite par un humain,
 * un presse-papier ou un journal. Un opérateur qui collerait le SQL devrait
 * d'abord faire ressortir le secret quelque part ; ici, il ne le voit jamais.
 *
 * ── Ce que cette action NE fait pas ──
 *
 * Elle ne planifie rien : le pg_cron `lastchance-jobs-worker` existe depuis
 * `20260722100000_jobs_queue.sql`, toutes les 5 minutes, et porte lui-même sa
 * garde (`where (select count(*) from vault.decrypted_secrets where name in
 * (…)) = 2`). Il est inerte faute des deux secrets, et rien d'autre.
 * ════════════════════════════════════════════════════════════ */

/**
 * Nom de la RPC qui écrit dans le Vault. Contrat attendu (lot db-supabase,
 * voir le blocage remonté avec ce chantier) :
 *
 *   public.set_worker_vault_secrets(p_worker text, p_url text, p_secret text)
 *
 * `security definer`, `service_role` seule, `revoke all … from public, anon,
 * authenticated`. Elle lit `vault_url_secret` / `vault_shared_secret` dans
 * `ops_worker_definitions` — l'appelant ne CHOISIT donc pas où le secret est
 * écrit — puis crée ou remplace les deux entrées du Vault.
 *
 * Tant qu'elle n'existe pas, l'appel échoue proprement (PostgREST `PGRST202`)
 * et cette action le dit : aucun demi-état, aucun secret posé à moitié.
 */
const RPC_CADENCE = "set_worker_vault_secrets";

/**
 * Active la cadence rapide d'un worker (5 min côté Postgres au lieu du cron
 * quotidien de Vercel).
 *
 * Quatre gardes, chacune pour une raison DIFFÉRENTE :
 *
 *  1. RBAC — `monitoring.cadence`, super_admin seul, session fraîche exigée, et
 *     le refus est tracé. Ce n'est pas un geste de commerçant.
 *  2. L'URL doit être celle de la production. C'est la garde qui compte le plus
 *     et la moins évidente : voir l'en-tête de `@/lib/admin/worker-cadence`.
 *  3. `CRON_SECRET` absente : refus DIT. Un échec muet ici laisserait croire la
 *     cadence armée alors que le pg_cron resterait sous sa garde des deux
 *     secrets.
 *  4. Le secret ne sort nulle part : ni dans le retour, ni dans l'audit, ni
 *     dans un message d'erreur, ni dans Sentry. Seuls les NOMS des entrées du
 *     Vault circulent.
 */
export async function enableWorkerFastCadence(
  formData: FormData,
): Promise<ActionResult<{ worker: string; url: string }>> {
  // ── GARDE 1 : RBAC + fraîcheur, refus tracé ──────────────
  const guard = await authorizeOrTrace(
    "monitoring.cadence",
    "monitoring.cadence.enable.denied",
    // `targetId` reste nul : `auditTargetId` n'accepte qu'un uuid, or la cible
    // est ici un NOM de worker. Il part donc dans `metadata` plutôt que de
    // forcer une valeur que la contrainte de la table refuserait — auquel cas
    // on perdrait la trace, précisément pour la requête fabriquée qu'on
    // cherche à voir.
    { type: "worker", id: null },
    { requireFresh: true },
  );
  if (!guard.granted) return guard.denied;
  const actor = guard.actor;

  const parsed = workerCadenceSchema.safeParse({ worker: formData.get("worker") });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0].message };
  }
  const { worker } = parsed.data;

  const db = createAdminBackofficeClient();

  /* Le registre décide QUELS workers ont une cadence rapide, et sous quels
   * noms de secrets. Deux lignes seulement portent aujourd'hui les deux
   * colonnes (`jobs`, `sync-contests`) ; les autres sont des crons quotidiens
   * sans prérequis Vault. Lire la ligne AVANT l'appel n'est que le message :
   * la RPC relit le registre et reste le rempart. */
  const { data: definition, error: definitionError } = await db
    .from("ops_worker_definitions")
    .select("worker, vault_url_secret, vault_shared_secret")
    .eq("worker", worker)
    .maybeSingle();
  if (definitionError) {
    reportError("admin.worker-cadence.registry", definitionError.message);
    return { ok: false, error: "Registre des workers illisible." };
  }
  if (!definition) {
    return { ok: false, error: "Worker inconnu du registre." };
  }
  if (!definition.vault_url_secret || !definition.vault_shared_secret) {
    return {
      ok: false,
      error:
        "Ce worker n'a pas de cadence rapide : aucun secret Vault ne lui est associé dans le registre.",
    };
  }

  /* ── GARDE 2 : l'URL doit être joignable depuis Postgres ── */
  const cible = buildWorkerCronUrl(worker, APP_URL);
  if (!cible.ok) {
    await logAdminAction({
      actor,
      action: "monitoring.cadence.enable.refused",
      targetType: "worker",
      metadata: { worker, refusal: cible.refusal },
    });
    return { ok: false, error: cible.error };
  }

  /* ── GARDE 3 : sans CRON_SECRET, on le DIT ─────────────── */
  const cronSecret = optionalEnv("CRON_SECRET");
  if (!cronSecret) {
    await logAdminAction({
      actor,
      action: "monitoring.cadence.enable.refused",
      targetType: "worker",
      metadata: { worker, refusal: "cron_secret_absent" },
    });
    return {
      ok: false,
      error:
        "CRON_SECRET n'est pas configuré dans cet environnement : la cadence rapide poserait un secret que la route refuserait.",
    };
  }

  const { error } = await db.rpc(RPC_CADENCE, {
    p_worker: worker,
    p_url: cible.url,
    p_secret: cronSecret,
  });
  if (error) {
    /* ── GARDE 4 : le message d'erreur n'est PAS journalisé ──
     * Une erreur Postgres peut recopier la valeur d'un paramètre (« value too
     * long for type… »), et `p_secret` en est un. Seul le code SQLSTATE sort
     * d'ici : il suffit à distinguer « RPC absente » (PGRST202) d'un refus de
     * droits, et il ne peut porter aucune valeur. */
    const code = typeof error.code === "string" ? error.code : "inconnu";
    reportError("admin.worker-cadence.rpc", `echec RPC (code ${code})`);
    await logAdminAction({
      actor,
      action: "monitoring.cadence.enable.refused",
      targetType: "worker",
      metadata: { worker, refusal: "rpc_error", code },
    });
    return {
      ok: false,
      error:
        code === "PGRST202"
          ? "La fonction d'écriture au Vault n'existe pas encore en base."
          : "Écriture des secrets impossible.",
    };
  }

  /* Ce qui entre au journal : le worker, l'URL posée (publique par
   * construction — c'est celle du site) et les NOMS des deux entrées du Vault.
   * Jamais leur contenu. Les clés sont suffixées `_name` pour qu'aucun lecteur
   * du journal ne prenne un nom pour une valeur. */
  await logAdminAction({
    actor,
    action: "monitoring.cadence.enable",
    targetType: "worker",
    metadata: {
      worker,
      url: cible.url,
      url_secret_name: definition.vault_url_secret,
      shared_secret_name: definition.vault_shared_secret,
    },
  });
  revalidatePath("/admin/monitoring");
  return { ok: true, data: { worker, url: cible.url } };
}
