"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getUserAndOrg } from "@/lib/auth";
import { reportError } from "@/lib/monitoring";
import { createClient } from "@/lib/supabase/server";
import {
  automationConfigSchemas,
  automationScenarioSchema,
} from "@/lib/validations/automations";
import type { ActionResult } from "@/lib/utils";
import type { AutomationScenario } from "@/types/database";

/**
 * Réglages des scénarios d'emails automatiques (automation_settings).
 * Écriture réservée aux éditeurs (owner/editor) — revérifiée par la RLS
 * (policy automation_settings_editor_write). Le cron quotidien
 * /api/cron/automations ne traite que les scénarios enabled.
 */

/** Config affichable d'un scénario (champs selon le scénario). */
export interface AutomationSettingView {
  scenario: AutomationScenario;
  enabled: boolean;
  config: {
    /** won_not_redeemed : âge minimal du gain (heures, 1..720, déf. 48). */
    minAgeHours?: number;
    /** inactive : paliers en jours (7..365, max 4, déf. [30, 60]). */
    tiers?: number[];
    /** post_redemption : délai après retrait (heures, 1..720, déf. 24). */
    delayHours?: number;
  };
}

const ALL_SCENARIOS: AutomationScenario[] = [
  "won_not_redeemed",
  "inactive",
  "post_redemption",
  "birthday",
];

/**
 * Lecture pour le dashboard : les 4 scénarios, avec les défauts pour
 * ceux jamais enregistrés (enabled=false, config par défaut).
 */
export async function getAutomationSettings(): Promise<AutomationSettingView[]> {
  const { user, organization } = await getUserAndOrg();
  if (!user || !organization) redirect("/login");

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("automation_settings")
    .select("scenario, enabled, config")
    .eq("organization_id", organization.id);
  if (error) {
    reportError("automations.read", error.message);
  }

  const byScenario = new Map(
    (data ?? []).map((row) => [row.scenario as AutomationScenario, row]),
  );

  return ALL_SCENARIOS.map((scenario) => {
    const row = byScenario.get(scenario);
    const schema = automationConfigSchemas[scenario];
    const parsed = schema.safeParse(row?.config ?? {});
    return {
      scenario,
      enabled: row?.enabled ?? false,
      config: (parsed.success
        ? parsed.data
        : schema.parse({})) as AutomationSettingView["config"],
    };
  });
}

/**
 * Valeur de formulaire → `null` si absente ou vide.
 *
 * Ce helper rendait `undefined` dans les deux cas, ce qui NORMALISAIT le champ
 * non rendu avant que le schéma ne le voie : le filet vivait ici, donc il ne
 * valait que pour ce fichier. Les schémas de `validations/automations.ts`
 * absorbent désormais `null` eux-mêmes (`nonRenduVaut`), et ce helper n'a plus
 * qu'un seul rôle — dire que le champ VIDE vaut la même chose que le champ
 * absent, ce qui est une règle de ce formulaire et non du schéma.
 */
function formValue(formData: FormData, name: string): string | null {
  const value = formData.get(name);
  if (value === null) return null;
  const s = String(value).trim();
  return s === "" ? null : s;
}

/**
 * Enregistre UN scénario (enabled + config). Champs de formulaire :
 * - scenario : won_not_redeemed | inactive | post_redemption | birthday
 * - enabled : checkbox « on »
 * - min_age_hours (won_not_redeemed), tiers (inactive : valeurs répétées
 *   ou liste « 30,60 »), delay_hours (post_redemption).
 */
export async function updateAutomationSettings(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const scenarioParsed = automationScenarioSchema.safeParse(
    formData.get("scenario"),
  );
  if (!scenarioParsed.success) {
    return { ok: false, error: "Scénario inconnu" };
  }
  const scenario = scenarioParsed.data;
  const enabled = formData.get("enabled") === "on";

  let rawConfig: Record<string, unknown> = {};
  if (scenario === "won_not_redeemed") {
    rawConfig = { minAgeHours: formValue(formData, "min_age_hours") };
  } else if (scenario === "inactive") {
    const tiers = formData
      .getAll("tiers")
      .flatMap((v) => String(v).split(","))
      .map((s) => s.trim())
      .filter(Boolean);
    rawConfig = { tiers: tiers.length > 0 ? tiers : null };
  } else if (scenario === "post_redemption") {
    rawConfig = { delayHours: formValue(formData, "delay_hours") };
  }

  const configParsed = automationConfigSchemas[scenario].safeParse(rawConfig);
  if (!configParsed.success) {
    return {
      ok: false,
      error: configParsed.error.issues[0]?.message ?? "Réglages invalides",
    };
  }

  const { user, organization, role } = await getUserAndOrg();
  if (!user || !organization) redirect("/login");
  // Écriture éditeur uniquement (les caissiers lisent, ne règlent pas).
  if (role !== "owner" && role !== "editor") {
    return { ok: false, error: "Action non autorisée" };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("automation_settings").upsert(
    {
      organization_id: organization.id,
      scenario,
      enabled,
      config: configParsed.data,
    },
    { onConflict: "organization_id,scenario" },
  );

  if (error) {
    reportError("automations.upsert", error.message);
    return { ok: false, error: "Enregistrement impossible" };
  }

  revalidatePath("/dashboard/settings");
  return { ok: true, data: undefined };
}
