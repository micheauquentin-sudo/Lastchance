"use client";

import {
  gameObjectColor,
  playOnLightSurface,
  resolveWheelStyle,
  type WheelStyle,
} from "@/lib/wheel-style";
import type { ClaimConfig } from "../claim-form";
import { GameShell } from "../game-shell";
import { ChestReveal } from "./chest-reveal";

/**
 * Jeu « coffres » : câble le socle partagé (GameShell) à la révélation par
 * coffres (ChestReveal). Même patron que FlipCardExperience. Le résultat vient
 * de `spinWheel` (serveur) ; le coffre ouvert ne fait que le révéler.
 */
export function ChestExperience({
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
  const style = resolveWheelStyle(rawStyle);
  const kermesse = playOnLightSurface(style);

  return (
    <GameShell
      slug={slug}
      organizationName={organizationName}
      organizationId={organizationId}
      logoUrl={logoUrl}
      claimConfig={claimConfig}
      style={rawStyle}
      gameType="chest"
      renderReveal={(outcome, onRevealed) => (
        <ChestReveal
          outcome={outcome}
          onRevealed={onRevealed}
          kermesse={kermesse}
          buttonFrom={style.buttonFrom}
          buttonTo={style.buttonTo}
          objectColor={gameObjectColor(style, "chest")}
        />
      )}
    />
  );
}
