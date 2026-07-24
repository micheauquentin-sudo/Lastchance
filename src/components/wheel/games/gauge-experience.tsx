"use client";

import { resolveWheelStyle, type WheelStyle } from "@/lib/wheel-style";
import type { ClaimConfig } from "../claim-form";
import { SkillGameShell } from "../skill-game-shell";
import { GaugeChallenge } from "./gauge-challenge";

/**
 * Jeu de DÉFI « jauge » : câble le socle partagé (SkillGameShell, à 2 temps)
 * à la phase de défi (GaugeChallenge). Copie du patron rps-experience —
 * l'issue vient de `submitSkillChallenge` (serveur), le client rapporte
 * seulement `succeeded` (non vérifiable, borné par l'économie du tirage).
 */
export function GaugeExperience({
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
      idle={{ emoji: "🎯", buttonLabel: "Arrêter la jauge" }}
      renderChallenge={(challenge, submit, pending) =>
        challenge.gameType === "gauge" ? (
          <GaugeChallenge
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
