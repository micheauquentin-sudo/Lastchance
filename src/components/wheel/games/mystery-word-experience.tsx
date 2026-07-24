"use client";

import { resolveWheelStyle, type WheelStyle } from "@/lib/wheel-style";
import type { ClaimConfig } from "../claim-form";
import { SkillGameShell } from "../skill-game-shell";
import { MysteryWordChallenge } from "./mystery-word-challenge";

/**
 * Jeu de DÉFI « mot mystère » : câble le socle partagé (SkillGameShell, à
 * 2 temps) à la phase de défi (MysteryWordChallenge). Copie du patron
 * rps-experience — l'issue vient de `submitSkillChallenge` (serveur), le
 * client n'envoie que le mot brut (le mot secret ne quitte jamais le serveur).
 */
export function MysteryWordExperience({
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
      idle={{ emoji: "🔤", buttonLabel: "Deviner le mot" }}
      renderChallenge={(challenge, submit, pending) =>
        challenge.gameType === "mystery_word" ? (
          <MysteryWordChallenge
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
