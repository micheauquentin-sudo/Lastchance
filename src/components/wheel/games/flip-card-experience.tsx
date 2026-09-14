"use client";

import {
  gameObjectColor,
  playOnLightSurface,  type WheelStyle,
} from "@/lib/wheel-style";
import type { ClaimConfig } from "../claim-form";
import type { PlayLimit } from "@/types/database";
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
      playLimit={playLimit}
      gameType="flip_card"
      renderReveal={(outcome, onRevealed) => (
        <FlipCardReveal
          outcome={outcome}
          onRevealed={onRevealed}
          kermesse={kermesse}
          buttonFrom={style.buttonFrom}
          buttonTo={style.buttonTo}
          objectColor={gameObjectColor(style, "flip_card")}
        />
      )}
    />
  );
}
