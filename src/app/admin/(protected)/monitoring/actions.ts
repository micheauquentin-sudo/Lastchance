"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { logAdminAction } from "@/lib/admin/audit";
import { AdminForbiddenError, authorizeAction } from "@/lib/admin/auth";
import { APP_URL, optionalEnv } from "@/lib/env";
import { enqueueJob } from "@/lib/jobs";
import { reportError } from "@/lib/monitoring";
import { createAdminClient } from "@/lib/supabase/admin";
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
