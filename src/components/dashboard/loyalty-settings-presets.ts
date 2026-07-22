/**
 * Préréglages de durée des réglages du Passeport de fidélité, conscients du
 * mode de validation. Pur et sans dépendance réseau — testable en isolation
 * (Vitest), miroir des bornes SQL/Zod :
 *
 * - `rotating_period_seconds` : 15..300 s
 *   (CHECK loyalty_programs_rotating_period_seconds_check, migration
 *   20260725150000) ;
 * - `min_stamp_interval_seconds` porte un plancher dans les DEUX modes
 *   (CHECK loyalty_programs_cooldown_floor_check, migration 20260725160000,
 *   resserré par 20260725180000, + superRefine de `updateLoyaltyProgramSchema`) :
 *   `max(2 * rotating_period_seconds, 300)` en `rotating_code`, 300 s en
 *   `staff` (migration 20260725170000 : la TTL du jeton de check-in vaut 180 s,
 *   le plancher garde 2 min de marge). Base, Zod et UI partagent la valeur.
 *
 * Objectif UI : ne jamais proposer au commerçant une valeur que la base
 * refusera, et corriger d'office un réglage devenu invalide après changement
 * de mode plutôt que de laisser le formulaire en erreur.
 */

import type { LoyaltyValidationMode } from "@/types/database";

export interface DurationPreset {
  value: number;
  label: string;
}

/**
 * Plancher ABSOLU de cooldown en mode code tournant (secondes). Le plancher
 * réellement imposé vaut `max(2 × période, cette valeur)` — voir
 * `loyaltyCooldownFloor`.
 */
export const LOYALTY_ROTATING_COOLDOWN_FLOOR_SECONDS = 300;

/**
 * Plancher de cooldown proposé en mode caisse. La base garantit 180 s (la
 * TTL du jeton de check-in) ; l'UI propose 300 s pour laisser 2 minutes de
 * marge : à 180 s pile, une dérive d'horloge app↔Postgres de S secondes
 * rouvrirait une fenêtre de rejeu de S. La marge supprime cette dépendance.
 */
export const LOYALTY_STAFF_COOLDOWN_FLOOR_SECONDS = 300;

/** Bornes de la période de rotation du code au comptoir (secondes). */
export const LOYALTY_PERIOD_MIN_SECONDS = 15;
export const LOYALTY_PERIOD_MAX_SECONDS = 300;

/** Rotations proposées — toutes dans 15..300 s, comme la base l'exige. */
export const LOYALTY_PERIOD_PRESETS: readonly DurationPreset[] = [
  { value: 30, label: "30 secondes" },
  { value: 60, label: "1 minute" },
  { value: 120, label: "2 minutes" },
  { value: 300, label: "5 minutes" },
];

/**
 * Fréquences de visite proposées, du plus permissif au plus strict. Le palier
 * de 10 min existe pour la rotation la plus lente (300 s) : son plancher vaut
 * 2 × 300 = 600 s, sans quoi le commerçant sauterait directement à l'heure.
 */
export const LOYALTY_COOLDOWN_PRESETS: readonly DurationPreset[] = [
  { value: 0, label: "Aucune limite" },
  { value: 180, label: "1 visite toutes les 3 minutes au maximum" },
  { value: 300, label: "1 visite toutes les 5 minutes au maximum" },
  { value: 600, label: "1 visite toutes les 10 minutes au maximum" },
  { value: 3600, label: "1 visite par heure au maximum" },
  { value: 43200, label: "1 visite toutes les 12 heures au maximum" },
  { value: 86400, label: "1 visite par jour au maximum" },
  { value: 604800, label: "1 visite par semaine au maximum" },
];

/** Durée lisible en français court, pour les libellés « personnalisé ». */
export function formatDurationLabel(seconds: number): string {
  if (seconds <= 0) return "aucune limite";
  if (seconds % 86400 === 0) {
    const d = seconds / 86400;
    return `${d} jour${d > 1 ? "s" : ""}`;
  }
  if (seconds % 3600 === 0) {
    const h = seconds / 3600;
    return `${h} heure${h > 1 ? "s" : ""}`;
  }
  if (seconds % 60 === 0) return `${seconds / 60} min`;
  return `${seconds} s`;
}

/**
 * Options du select de rotation : les préréglages, plus la valeur courante si
 * elle est atypique MAIS toujours acceptable par la base (15..300 s). Une
 * valeur hors bornes (programme créé avant le durcissement) n'est pas proposée.
 */
export function loyaltyPeriodOptions(current: number): DurationPreset[] {
  if (
    !Number.isFinite(current) ||
    current < LOYALTY_PERIOD_MIN_SECONDS ||
    current > LOYALTY_PERIOD_MAX_SECONDS ||
    LOYALTY_PERIOD_PRESETS.some((p) => p.value === current)
  ) {
    return [...LOYALTY_PERIOD_PRESETS];
  }
  return [
    { value: current, label: `${current} s (personnalisé)` },
    ...LOYALTY_PERIOD_PRESETS,
  ];
}

/**
 * Période de rotation ramenée dans les bornes acceptées (utile pour un
 * programme enregistré avant le durcissement des CHECK).
 */
export function clampLoyaltyPeriod(seconds: number): number {
  if (!Number.isFinite(seconds)) return 60;
  return Math.min(
    LOYALTY_PERIOD_MAX_SECONDS,
    Math.max(LOYALTY_PERIOD_MIN_SECONDS, Math.round(seconds)),
  );
}

/**
 * Plancher de cooldown selon le mode :
 * - `rotating_code` : `max(2 × période, 300 s)` — un code affiché au comptoir
 *   est accepté sur DEUX fenêtres (la courante et la précédente, cf.
 *   record_loyalty_stamp) ; le cooldown doit donc couvrir toute sa durée de
 *   validité, sinon un code lu une fois vaudrait deux tampons ;
 * - `staff` : 300 s — le QR de check-in reste rejouable pendant sa TTL (180 s),
 *   un cooldown plus court laisserait un même QR valoir plusieurs tampons.
 */
export function loyaltyCooldownFloor(
  mode: LoyaltyValidationMode,
  periodSeconds: number,
): number {
  if (mode !== "rotating_code") return LOYALTY_STAFF_COOLDOWN_FLOOR_SECONDS;
  return Math.max(
    LOYALTY_ROTATING_COOLDOWN_FLOOR_SECONDS,
    2 * clampLoyaltyPeriod(periodSeconds),
  );
}

export interface LoyaltyCooldownChoice {
  /** Valeur à afficher/poster : la valeur voulue, ou la correction conforme. */
  value: number;
  /** Plancher imposé par le mode courant (0 = aucun). */
  floorSeconds: number;
  /** true si la valeur voulue était refusée et a été remontée au plancher. */
  adjusted: boolean;
  /** Options du select, toutes acceptables dans le mode courant. */
  options: DurationPreset[];
}

/**
 * Résout la fréquence des visites pour le mode courant : filtre les
 * préréglages sous le plancher et corrige d'office une valeur devenue
 * invalide (bascule caisse → code au comptoir) vers le plus petit
 * préréglage conforme.
 */
export function resolveLoyaltyCooldown(input: {
  mode: LoyaltyValidationMode;
  periodSeconds: number;
  cooldownSeconds: number;
}): LoyaltyCooldownChoice {
  const floorSeconds = loyaltyCooldownFloor(input.mode, input.periodSeconds);
  const wanted = Number.isFinite(input.cooldownSeconds)
    ? Math.max(0, Math.round(input.cooldownSeconds))
    : 0;

  const allowed = LOYALTY_COOLDOWN_PRESETS.filter((p) => p.value >= floorSeconds);
  const adjusted = wanted < floorSeconds;
  // Plus petit préréglage conforme (les préréglages couvrent tout plancher
  // atteignable, 300 s étant le plus bas ≥ floor possible).
  const value = adjusted ? (allowed[0]?.value ?? floorSeconds) : wanted;

  const options = allowed.some((p) => p.value === value)
    ? [...allowed]
    : [
        { value, label: `${formatDurationLabel(value)} (personnalisé)` },
        ...allowed,
      ];

  return { value, floorSeconds, adjusted, options };
}
