"use server";

import { headers } from "next/headers";
import {
  computePlayerKey,
  pickWeightedIndex,
  playWindowStart,
  signClaimToken,
} from "@/lib/spin";
import { loadPlayContext } from "@/lib/play-context";
import type { ActionResult } from "@/lib/utils";

export interface SpinOutcome {
  /** Index du segment gagné dans la liste des lots actifs (ordre d'affichage). */
  prizeIndex: number;
  label: string;
  description: string;
  isLosing: boolean;
  /** Présent uniquement pour un lot gagnant : à renvoyer au claim. */
  claimToken: string | null;
}

async function getPlayerKey(): Promise<string> {
  const h = await headers();
  const ip =
    h.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    h.get("x-real-ip") ??
    "unknown";
  const ua = h.get("user-agent") ?? "unknown";
  return computePlayerKey(ip, ua);
}

export async function spinWheel(slug: string): Promise<ActionResult<SpinOutcome>> {
  try {
    const ctx = await loadPlayContext(String(slug));
    if (!ctx.ok) return { ok: false, error: ctx.error };
    const { admin, campaign, wheel, prizes } = ctx;

    if (prizes.length < 2) {
      return { ok: false, error: "Cette roue n'est pas encore configurée." };
    }

    const playerKey = await getPlayerKey();

    // Limite de jeu — vérifiée sur les spins, pas les participations :
    // impossible de relancer la roue jusqu'au lot désiré.
    const windowStart = playWindowStart(wheel.play_limit, new Date());
    if (windowStart) {
      const { count } = await admin
        .from("spins")
        .select("id", { count: "exact", head: true })
        .eq("wheel_id", wheel.id)
        .eq("player_key", playerKey)
        .gte("created_at", windowStart.toISOString());
      if ((count ?? 0) > 0) {
        return {
          ok: false,
          error:
            wheel.play_limit === "once"
              ? "Vous avez déjà joué à ce jeu."
              : wheel.play_limit === "daily"
                ? "Vous avez déjà joué aujourd'hui. Revenez demain !"
                : "Vous avez déjà joué cette semaine. Revenez la semaine prochaine !",
        };
      }
    }

    // Tirage pondéré serveur, avec réservation atomique du stock.
    // Si le stock d'un lot vient de s'épuiser (course), on l'exclut
    // et on retire à nouveau.
    const exhausted = new Set<string>();
    let winnerIdx = -1;

    for (let attempt = 0; attempt < prizes.length + 1; attempt++) {
      const idx = pickWeightedIndex(
        prizes.map((p) => ({
          weight: p.weight,
          outOfStock: exhausted.has(p.id) || p.stock === 0,
        })),
      );
      if (idx === -1) break;

      const prize = prizes[idx];
      if (prize.is_losing) {
        winnerIdx = idx;
        break;
      }
      const { data: reserved } = await admin.rpc("decrement_prize_stock", {
        p_prize_id: prize.id,
      });
      if (reserved) {
        winnerIdx = idx;
        break;
      }
      exhausted.add(prize.id);
    }

    if (winnerIdx === -1) {
      return { ok: false, error: "Plus aucun lot disponible pour le moment." };
    }

    const prize = prizes[winnerIdx];

    const { data: spin, error: spinError } = await admin
      .from("spins")
      .insert({
        organization_id: campaign.organization_id,
        campaign_id: campaign.id,
        wheel_id: wheel.id,
        prize_id: prize.is_losing ? null : prize.id,
        is_losing: prize.is_losing,
        player_key: playerKey,
      })
      .select("id")
      .single();

    if (spinError || !spin) {
      console.error("[play] insert spin:", spinError?.message);
      return { ok: false, error: "Une erreur est survenue, réessayez." };
    }

    return {
      ok: true,
      data: {
        prizeIndex: winnerIdx,
        label: prize.label,
        description: prize.description,
        isLosing: prize.is_losing,
        claimToken: prize.is_losing ? null : signClaimToken(spin.id),
      },
    };
  } catch (err) {
    console.error("[play] spinWheel:", err);
    return { ok: false, error: "Une erreur est survenue, réessayez." };
  }
}
