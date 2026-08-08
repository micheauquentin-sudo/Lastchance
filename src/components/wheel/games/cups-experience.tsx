"use client";

import {
  gameObjectColor,
  playOnLightSurface,
  resolveWheelStyle,
  type WheelStyle,
} from "@/lib/wheel-style";
import type { ClaimConfig } from "../claim-form";
import { GameShell } from "../game-shell";
import { CupsReveal } from "./cups-reveal";

/**
 * Jeu « bonneteau » : câble le socle partagé (GameShell) à la révélation par
 * gobelets (CupsReveal). Même patron que FlipCardExperience — seul l'habillage
 * `idle` et le composant de `renderReveal` changent. Le résultat vient de
 * `spinWheel` (serveur) ; le gobelet choisi ne fait que le révéler.
 */
export function CupsExperience({
  slug,
  organizationName,
  organizationId = null,
  logoUrl = null,
  claimConfig = { collectEmail: true, collectPhone: false, codeTtlSeconds: null },
  style: rawStyle,
  shareEnabled,
}: {
  slug: string;
  organizationName: string;
  organizationId?: string | null;
  logoUrl?: string | null;
  claimConfig?: ClaimConfig;
  style?: Partial<WheelStyle>;
  /** Le commerçant propose-t-il le partage du jeu après la partie ? */
  shareEnabled: boolean;
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
      shareEnabled={shareEnabled}
      gameType="cups"
      renderReveal={(outcome, onRevealed) => (
        <CupsReveal
          outcome={outcome}
          onRevealed={onRevealed}
          kermesse={kermesse}
          buttonFrom={style.buttonFrom}
          buttonTo={style.buttonTo}
          objectColor={gameObjectColor(style, "cups")}
        />
      )}
    />
  );
}
