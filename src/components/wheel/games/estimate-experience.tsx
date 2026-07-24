"use client";

import { resolveWheelStyle, type WheelStyle } from "@/lib/wheel-style";
import type { ClaimConfig } from "../claim-form";
import { SkillGameShell } from "../skill-game-shell";
import { EstimateChallenge } from "./estimate-challenge";

/**
 * Jeu de DÉFI « estimation » : câble le socle partagé (SkillGameShell, à
 * 2 temps) à la phase de défi (EstimateChallenge). Copie du patron
 * rps-experience — l'issue vient de `submitSkillChallenge` (serveur), le
 * client n'envoie que le nombre brut (cible et tolérance restent secrètes).
 */
export function EstimateExperience({
  slug,
  organizationName,
  logoUrl = null,
  claimConfig = { collectEmail: true, collectPhone: false, codeTtlSeconds: null },
  style: rawStyle,
}: {
  slug: string;
  organizationName: string;
  logoUrl?: string | null;
  claimConfig?: ClaimConfig;
  style?: Partial<WheelStyle>;
}) {
  const kermesse = resolveWheelStyle(rawStyle).pageTheme === "kermesse";

  return (
    <SkillGameShell
      slug={slug}
      organizationName={organizationName}
      logoUrl={logoUrl}
      claimConfig={claimConfig}
      style={rawStyle}
      idle={{ emoji: "🔢", buttonLabel: "Faire une estimation" }}
      renderChallenge={(challenge, submit, pending) =>
        challenge.gameType === "estimate" ? (
          <EstimateChallenge
            challenge={challenge}
            onSubmit={submit}
            pending={pending}
            kermesse={kermesse}
          />
        ) : null
      }
    />
  );
}
