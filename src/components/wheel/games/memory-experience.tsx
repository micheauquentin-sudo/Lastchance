"use client";

import {
  gameObjectColor,
  playOnLightSurface,  type WheelStyle,
} from "@/lib/wheel-style";
import type { ClaimConfig } from "../claim-form";
import { GameShell } from "../game-shell";
import { MemoryReveal } from "./memory-reveal";

/**
 * Jeu « memory » : câble le socle partagé (GameShell) à la révélation par
 * grille (MemoryReveal). Même patron que FlipCardExperience. Le résultat vient
 * de `spinWheel` (serveur) ; trouver la paire ne fait que le révéler.
 */
export function MemoryExperience({
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
}) {  const kermesse = playOnLightSurface(style);

  return (
    <GameShell
      slug={slug}
      organizationName={organizationName}
      organizationId={organizationId}
      logoUrl={logoUrl}
      claimConfig={claimConfig}
      style={style}
      shareEnabled={shareEnabled}
      gameType="memory"
      renderReveal={(outcome, onRevealed) => (
        <MemoryReveal
          outcome={outcome}
          onRevealed={onRevealed}
          kermesse={kermesse}
          buttonFrom={style.buttonFrom}
          buttonTo={style.buttonTo}
          objectColor={gameObjectColor(style, "memory")}
        />
      )}
    />
  );
}
