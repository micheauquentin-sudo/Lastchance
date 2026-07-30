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
 *
 * INVARIANT : l'éligibilité d'un SEGMENT doit rester la copie exacte de celle
 * de `perform_atomic_spin`. C'est tout l'intérêt de l'essai — un commerçant y
 * règle ses poids et ses stocks ; une distribution qui diverge du moteur ne
 * l'informe pas, elle le trompe sur ce que ses clients rencontreront. Toute
 * évolution du filtre côté SQL doit être répercutée ici (et réciproquement).
 *
 * Portée volontairement bornée au filtre de segment : l'essai joue toujours la
 * branche « défi réussi ». Sur les six jeux de DÉFI (rps, reflex, gauge,
 * puzzle, mystery_word, estimate), un joueur qui échoue reçoit une perte forcée
 * sans aucun tirage pondéré (`p_force_losing`) ; le commerçant voit donc ici le
 * taux de gain d'un joueur qui ne se trompe jamais, alors que l'essai lui est
 * proposé sur ces roues comme sur les autres. Divergence connue, NON traitée.
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

  // Transcription littérale (De Morgan) du filtre d'éligibilité de
  // `perform_atomic_spin`, lu sur sa définition VIVANTE
  // (20260731120000_quick_games_skill.sql) — inchangé sur ses trois définitions
  // successives (00019, 20260720150500, 20260731120000) :
  //   `p.is_active and p.weight > 0 and (p.is_losing or p.stock is null or p.stock > 0)`
  // `is_active` est déjà posé sur la requête, `weight > 0` est traité par
  // `pickWeightedIndex` ; reste la clause de stock, ci-dessous.
  //
  // NE PAS étendre cette égalité aux AUTRES moteurs de tirage : le tour offert
  // du passeport de fidélité et ceux du parrainage filtrent
  // `(p.is_losing or p.stock > 0)`, SANS `p.stock is null` — un lot illimité y
  // est exclu, à dessein. Ces tirages n'ont ni play_limit, ni dates de campagne,
  // ni Turnstile pour les borner : le décrément d'un stock RÉEL est leur seule
  // borne économique (cf. « BORNE 2 », 20260725200000_loyalty_spin_bounds.sql).
  // Les « harmoniser » sur la ligne ci-dessous offrirait des lots illimités sur
  // des tours gratuits.
  //
  // Le point qui compte : `is_losing` COURT-CIRCUITE le stock. Le segment
  // perdant reste toujours tirable — c'est ce qui permet à une roue dont tous
  // les lots sont épuisés de continuer à tourner au lieu de refuser le jeu — et
  // la boucle de décrément l'épargne explicitement, donc son stock n'est jamais
  // consommé. Un `0` saisi sur « Pas de chance » ne le retire pas du tirage réel.
  //
  // Sans cette exception, l'essai écartait le segment perdant dès que le
  // commerçant y saisissait 0 — croyant l'avoir mis en pause — et lui montrait
  // une roue qui gagne à TOUS les coups pendant que ses clients continuaient à
  // perdre au poids configuré : il recalibrait ses lots sur une distribution qui
  // n'existe pas. Pour retirer un segment du jeu, c'est `is_active` qui fait
  // foi, et les deux moteurs l'honorent.
  const idx = pickWeightedIndex(
    list.map((p) => ({
      weight: p.weight,
      outOfStock: !p.is_losing && p.stock !== null && p.stock <= 0,
    })),
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
