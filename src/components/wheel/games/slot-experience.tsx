"use client";

import {
  playOnLightSurface,  slotSymbols,
  type WheelStyle,
} from "@/lib/wheel-style";
import type { ClaimConfig } from "../claim-form";
import { GameShell } from "../game-shell";
import { SlotReveal } from "./slot-reveal";

/**
 * Jeu « machine à sous » : câble le socle partagé (GameShell) à la révélation
 * par rouleaux (SlotReveal). Même patron que FlipCardExperience. Le résultat
 * vient de `spinWheel` (serveur) ; les rouleaux ne font que le révéler.
 */
export function SlotExperience({
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
      gameType="slot"
      renderReveal={(outcome, onRevealed) => (
        <SlotReveal
          outcome={outcome}
          onRevealed={onRevealed}
          kermesse={kermesse}
          buttonFrom={style.buttonFrom}
          buttonTo={style.buttonTo}
          symbols={slotSymbols(style)}
        />
      )}
    />
  );
}
