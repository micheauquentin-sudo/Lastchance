"use client";

import { playOnLightSurface, resolveWheelStyle, type WheelStyle } from "@/lib/wheel-style";
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
  organizationId = null,
  logoUrl = null,
  claimConfig = { collectEmail: true, collectPhone: false, codeTtlSeconds: null },
  style: rawStyle,
}: {
  slug: string;
  organizationName: string;
  organizationId?: string | null;
  logoUrl?: string | null;
  claimConfig?: ClaimConfig;
  style?: Partial<WheelStyle>;
}) {
  const kermesse = playOnLightSurface(resolveWheelStyle(rawStyle));

  return (
    <SkillGameShell
      slug={slug}
      organizationName={organizationName}
      organizationId={organizationId}
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
