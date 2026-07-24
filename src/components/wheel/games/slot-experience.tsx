"use client";

import { resolveWheelStyle, type WheelStyle } from "@/lib/wheel-style";
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
  const style = resolveWheelStyle(rawStyle);
  const kermesse = style.pageTheme === "kermesse";

  return (
    <GameShell
      slug={slug}
      organizationName={organizationName}
      logoUrl={logoUrl}
      claimConfig={claimConfig}
      style={rawStyle}
      idle={{ emoji: "🎰", buttonLabel: "Lancer la machine" }}
      renderReveal={(outcome, onRevealed) => (
        <SlotReveal
          outcome={outcome}
          onRevealed={onRevealed}
          kermesse={kermesse}
          buttonFrom={style.buttonFrom}
          buttonTo={style.buttonTo}
        />
      )}
    />
  );
}
