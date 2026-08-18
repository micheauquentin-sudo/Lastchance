"use client";

import { playOnLightSurface, type WheelStyle } from "@/lib/wheel-style";
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
  style,
  shareEnabled,
}: {
  slug: string;
  organizationName: string;
  organizationId?: string | null;
  logoUrl?: string | null;
  claimConfig?: ClaimConfig;
  style: WheelStyle;
  /** Le commerçant propose-t-il le partage du jeu après la partie ? */
  shareEnabled: boolean;
}) {
  const kermesse = playOnLightSurface(style);

  return (
    <SkillGameShell
      slug={slug}
      organizationName={organizationName}
      organizationId={organizationId}
      logoUrl={logoUrl}
      claimConfig={claimConfig}
      style={style}
      shareEnabled={shareEnabled}
      gameType="estimate"
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
