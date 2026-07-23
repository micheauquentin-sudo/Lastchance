/**
 * Cœur métier « pur » du Jackpot collectif : mapping du jsonb renvoyé par la
 * RPC record_jackpot_participation vers un résultat typé pour l'UI. Fonction
 * testable sans accès base ni imports server-only (miroir de src/lib/loyalty.ts
 * et src/lib/hunts.ts).
 */

import type {
  JackpotDrawMode,
  JackpotParticipationState,
  JackpotValidationMode,
} from "@/types/database";

/**
 * Résultat typé d'une participation (mapping du jsonb
 * record_jackpot_participation). Défauts sûrs sur toute valeur manquante ou
 * invalide : un jsonb non reconnu retombe sur `unavailable`.
 */
export interface JackpotParticipationResult {
  state: JackpotParticipationState;
  /** null sur `unavailable`/`invalid_code` (aucun oracle sur l'état interne). */
  campaign: {
    id: string;
    name: string;
    drawMode: JackpotDrawMode;
    validationMode: JackpotValidationMode;
  } | null;
  /** Jauge PARTAGÉE après cette participation (recorded/too_soon). */
  currentCount: number;
  /** Objectif de la jauge (déclencheur ou affichage selon le mode). */
  threshold: number;
  /** Cycle courant. */
  cycle: number;
  /** `true` ⇔ cette participation a CRÉÉ le joueur (`is_new_player` de la RPC). */
  isNewPlayer: boolean;
  /** `true` ⇔ cette participation gagne le jackpot (code présent). */
  isWinner: boolean;
  /** reward gagné : code de retrait JACKPOT-… (null sinon). */
  code: string | null;
  /** Seuil atteint mais stock épuisé : aucun tirage, aucune sur-émission. */
  outOfStock: boolean;
  /** rescan_win : jackpot armé (seuil atteint, gain instantané possible). */
  armed: boolean;
  /** Montant d'AFFICHAGE (cosmétique) : base + count · increment. */
  displayAmountCents: number;
  /** date_draw : instant du tirage à date (null sinon). */
  drawAt: string | null;
  /** Secondes avant de pouvoir reparticiper (`too_soon`). */
  retryInSeconds: number | null;
}

const JACKPOT_PARTICIPATION_STATES: readonly JackpotParticipationState[] = [
  "unavailable",
  "invalid_code",
  "too_soon",
  "recorded",
];

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : null;
}

function asString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function asInt(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.trunc(value)
    : null;
}

function asDrawMode(value: unknown): JackpotDrawMode {
  return value === "rescan_win"
    ? "rescan_win"
    : value === "date_draw"
      ? "date_draw"
      : "threshold_draw";
}

function asValidationMode(value: unknown): JackpotValidationMode {
  return value === "rotating_code" ? "rotating_code" : "staff";
}

/**
 * Convertit le jsonb de record_jackpot_participation en résultat typé, sans
 * jamais faire confiance à sa forme (défauts sûrs sur toute valeur manquante ou
 * invalide). Un jsonb non reconnu retombe sur `unavailable`.
 */
export function mapJackpotParticipation(raw: unknown): JackpotParticipationResult {
  const root = asRecord(raw);
  const stateRaw = root ? asString(root.state) : null;
  const state: JackpotParticipationState =
    stateRaw && (JACKPOT_PARTICIPATION_STATES as string[]).includes(stateRaw)
      ? (stateRaw as JackpotParticipationState)
      : "unavailable";

  const campaignRec = root ? asRecord(root.campaign) : null;
  const campaign = campaignRec
    ? {
        id: asString(campaignRec.id) ?? "",
        name: asString(campaignRec.name) ?? "",
        drawMode: asDrawMode(campaignRec.draw_mode),
        validationMode: asValidationMode(campaignRec.validation_mode),
      }
    : null;

  const isWinner = root?.is_winner === true;

  return {
    state,
    campaign,
    currentCount: (root ? asInt(root.current_count) : null) ?? 0,
    threshold: (root ? asInt(root.threshold) : null) ?? 0,
    cycle: (root ? asInt(root.cycle) : null) ?? 0,
    isNewPlayer: root?.is_new_player === true,
    isWinner,
    // Défense en profondeur : le code de retrait n'est JAMAIS remonté à un
    // non-gagnant. Le tirage `threshold_draw` désigne un gagnant qui n'est pas
    // forcément l'appelant ; si la RPC renvoyait le code par erreur (régression),
    // ce garde empêche qu'il atteigne le navigateur d'un tiers.
    code: isWinner && root ? asString(root.code) : null,
    outOfStock: root?.out_of_stock === true,
    armed: root?.armed === true,
    displayAmountCents: (root ? asInt(root.display_amount_cents) : null) ?? 0,
    drawAt: root ? asString(root.draw_at) : null,
    retryInSeconds: root ? asInt(root.retry_in_seconds) : null,
  };
}
