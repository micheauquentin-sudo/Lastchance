"use client";

import { playOnLightSurface, resolveWheelStyle, type WheelStyle } from "@/lib/wheel-style";
import type { ClaimConfig } from "../claim-form";
import { SkillGameShell } from "../skill-game-shell";
import { RpsChallenge } from "./rps-challenge";

/**
 * Jeu de DÉFI « pierre-feuille-ciseaux » : câble le socle partagé
 * (SkillGameShell, à 2 temps) à la phase de défi (RpsChallenge). Patron des
 * mini-jeux skill-gated — chaque nouveau jeu le recopie en changeant
 * l'habillage `idle` et le composant de `renderChallenge`. L'issue vient de
 * `submitSkillChallenge` (serveur) ; le client n'envoie que le coup choisi.
 */
export function RpsExperience({
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
  const kermesse = playOnLightSurface(resolveWheelStyle(rawStyle));

  return (
    <SkillGameShell
      slug={slug}
      organizationName={organizationName}
      logoUrl={logoUrl}
      claimConfig={claimConfig}
      style={rawStyle}
      idle={{ emoji: "✊", buttonLabel: "Jouer à pierre-feuille-ciseaux" }}
      renderChallenge={(_challenge, submit, pending) => (
        <RpsChallenge onSubmit={submit} pending={pending} kermesse={kermesse} />
      )}
    />
  );
}
