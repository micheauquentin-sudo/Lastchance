"use client";

import { resolveWheelStyle, type WheelStyle } from "@/lib/wheel-style";
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
      idle={{ emoji: "🥤", buttonLabel: "Choisir un gobelet" }}
      renderReveal={(outcome, onRevealed) => (
        <CupsReveal
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
