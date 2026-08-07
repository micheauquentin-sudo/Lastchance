"use client";

import { playOnLightSurface, resolveWheelStyle, type WheelStyle } from "@/lib/wheel-style";
import type { ClaimConfig } from "../claim-form";
import { SkillGameShell } from "../skill-game-shell";
import { ReflexChallenge } from "./reflex-challenge";

/**
 * Jeu de DÉFI « réflexe » : câble le socle partagé (SkillGameShell, à 2 temps)
 * à la phase de défi (ReflexChallenge). Copie du patron rps-experience —
 * l'issue vient de `submitSkillChallenge` (serveur), le client rapporte
 * seulement `succeeded` (non vérifiable, borné par l'économie du tirage).
 */
export function ReflexExperience({
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
  const kermesse = playOnLightSurface(resolveWheelStyle(rawStyle));

  return (
    <SkillGameShell
      slug={slug}
      organizationName={organizationName}
      organizationId={organizationId}
      logoUrl={logoUrl}
      claimConfig={claimConfig}
      style={rawStyle}
      gameType="reflex"
      renderChallenge={(challenge, submit, pending) =>
        challenge.gameType === "reflex" ? (
          <ReflexChallenge
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
