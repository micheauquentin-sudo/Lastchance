"use server";

import { revalidatePath } from "next/cache";
import { requireOrganizationOwner } from "@/lib/authorization";
import { createAdminClient } from "@/lib/supabase/admin";
import type { ActionResult } from "@/lib/utils";

/**
 * Active/désactive la notification email au propriétaire à chaque
 * gain réclamé (temps réel).
 */
export async function updateNotifyOnWin(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const { organization } = await requireOrganizationOwner();

  const enabled = formData.get("notify_on_win") === "on";

  const admin = createAdminClient();
  const { error } = await admin
    .from("organizations")
    .update({ notify_on_win: enabled })
    .eq("id", organization.id);

  if (error) {
    console.error("[notifications] update:", error.message);
    return { ok: false, error: "Enregistrement impossible" };
  }

  revalidatePath("/dashboard/settings");
  return { ok: true, data: undefined };
}

/**
 * Active/désactive le rapport hebdomadaire du lundi (opt-OUT : la colonne
 * vaut `true` par défaut).
 *
 * C'est la SORTIE que promet le pied de page de chaque rapport. Sans elle, le
 * lien « Ne plus le recevoir » mènerait à un écran sans interrupteur, et un
 * hebdomadaire sans issue finit en signalement de spam — qui coûte la
 * délivrabilité de tous les e-mails du domaine, code de gain compris.
 *
 * Propriétaire seul, comme `updateNotifyOnWin` : le destinataire du rapport
 * est le titulaire du compte, personne d'autre n'a à le couper pour lui.
 */
export async function updateWeeklyDigest(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const { organization } = await requireOrganizationOwner();

  const enabled = formData.get("weekly_digest") === "on";

  const admin = createAdminClient();
  const { error } = await admin
    .from("organizations")
    .update({ weekly_digest: enabled })
    .eq("id", organization.id);

  if (error) {
    console.error("[notifications] weekly digest:", error.message);
    return { ok: false, error: "Enregistrement impossible" };
  }

  revalidatePath("/dashboard/settings");
  return { ok: true, data: undefined };
}
