"use server";

import { redirect } from "next/navigation";
import { getUserAndOrg } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { pickWeightedIndex } from "@/lib/spin";
import type { ActionResult } from "@/lib/utils";

export interface PreviewOutcome {
  label: string;
  description: string;
  isLosing: boolean;
}

/**
 * Mode démo / bac à sable : simule un tirage sur une roue du dashboard,
 * sans aucune écriture en base (pas de spin, pas de décrément de stock,
 * pas de participation) — pour vérifier probabilités et lots sans
 * polluer les statistiques ni le stock réel. Réservé aux membres de
 * l'organisation propriétaire de la roue (RLS sur `prizes`).
 */
export async function previewSpin(
  _prev: ActionResult<PreviewOutcome> | null,
  formData: FormData,
): Promise<ActionResult<PreviewOutcome>> {
  const wheelId = String(formData.get("wheelId") ?? "");
  if (!wheelId) return { ok: false, error: "Roue manquante" };

  const { user, organization } = await getUserAndOrg();
  if (!user || !organization) redirect("/login");

  const supabase = await createClient();
  const { data: prizes } = await supabase
    .from("prizes")
    .select("id, label, description, weight, is_losing, stock")
    .eq("wheel_id", wheelId)
    .eq("organization_id", organization.id)
    .eq("is_active", true);

  const list = prizes ?? [];
  if (list.length < 2) {
    return {
      ok: false,
      error: "Configurez au moins 2 lots actifs pour lancer un essai.",
    };
  }

  const idx = pickWeightedIndex(
    list.map((p) => ({ weight: p.weight, outOfStock: p.stock === 0 })),
  );
  if (idx === -1) {
    return { ok: false, error: "Aucun lot tirable (stock épuisé ou poids nuls)." };
  }

  const prize = list[idx];
  return {
    ok: true,
    data: {
      label: prize.label,
      description: prize.description,
      isLosing: prize.is_losing,
    },
  };
}
