"use client";

import { resolveWheelStyle, type WheelStyle } from "@/lib/wheel-style";
import type { ClaimConfig } from "../claim-form";
import { GameShell } from "../game-shell";
import { FlipCardReveal } from "./flip-card-reveal";

/**
 * Jeu « carte retournée » : câble le socle partagé (GameShell) à la
 * révélation par bascule (FlipCardReveal). Ce fichier est LE patron des
 * mini-jeux de révélation — chaque nouveau jeu le recopie en changeant
 * l'habillage `idle` et le composant de `renderReveal`. Le résultat vient de
 * `spinWheel` (serveur) ; la carte ne fait que le révéler.
 */
export function FlipCardExperience({
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
      idle={{ emoji: "🃏", buttonLabel: "Retourner la carte" }}
      renderReveal={(outcome, onRevealed) => (
        <FlipCardReveal
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
