"use client";

import { resolveWheelStyle, type WheelStyle } from "@/lib/wheel-style";
import type { ClaimConfig } from "../claim-form";
import { SkillGameShell } from "../skill-game-shell";
import { PuzzleChallenge } from "./puzzle-challenge";

/**
 * Jeu de DÉFI « puzzle » : câble le socle partagé (SkillGameShell, à 2 temps)
 * à la phase de défi (PuzzleChallenge). Copie du patron rps-experience —
 * l'issue vient de `submitSkillChallenge` (serveur), le client n'envoie que
 * l'ordre brut des fragments (la solution reste secrète côté serveur).
 */
export function PuzzleExperience({
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
      idle={{ emoji: "🧩", buttonLabel: "Reconstituer le puzzle" }}
      renderChallenge={(challenge, submit, pending) =>
        challenge.gameType === "puzzle" ? (
          <PuzzleChallenge
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
