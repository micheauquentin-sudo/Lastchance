"use client";

import { playOnLightSurface, type WheelStyle } from "@/lib/wheel-style";
import type { ClaimConfig } from "../claim-form";
import type { PlayLimit } from "@/types/database";
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
  organizationId = null,
  logoUrl = null,
  claimConfig = { collectEmail: true, collectPhone: false, codeTtlSeconds: null },
  style,
  shareEnabled,
  playLimit = null,
}: {
  slug: string;
  organizationName: string;
  organizationId?: string | null;
  logoUrl?: string | null;
  claimConfig?: ClaimConfig;
  style: WheelStyle;
  /** Le commerçant propose-t-il le partage du jeu après la partie ? */
  shareEnabled: boolean;
  /** Limite de participation annoncée au joueur (`wheels.play_limit`). */
  playLimit?: PlayLimit | null;
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
      playLimit={playLimit}
      gameType="puzzle"
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
