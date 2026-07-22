/**
 * Cœur « pur » de l'affichage de la Chasse au trésor côté joueur : mapping
 * d'un HuntScanState vers un message adapté, et libellés de progression.
 * Aucune dépendance réseau ni server-only — testable en isolation (Vitest).
 */

import type { HuntScanState } from "@/types/database";

export type HuntMessageTone = "success" | "info" | "warning" | "error";

export interface HuntStateMessage {
  tone: HuntMessageTone;
  title: string;
  /** Détail secondaire (null si le titre se suffit). */
  body: string | null;
}

/**
 * Message affiché après un tampon, selon l'état renvoyé par la RPC
 * record_hunt_scan. Les valeurs dynamiques (secondes d'attente, position
 * attendue) sont passées en paramètres pour rester déterministe.
 *
 * Aucun oracle : `wrong_order` ne divulgue que le NUMÉRO de l'étape
 * attendue (jamais son emplacement physique), `unavailable` reste
 * volontairement générique.
 */
export function messageForScanState(
  state: HuntScanState,
  opts: { retryInSeconds?: number | null; expectedPosition?: number | null } = {},
): HuntStateMessage {
  switch (state) {
    case "scanned":
      return {
        tone: "success",
        title: "Tampon validé !",
        body: "Une case de plus sur votre carte.",
      };
    case "already":
      return {
        tone: "info",
        title: "Étape déjà tamponnée",
        body: "Vous aviez déjà validé ce point — direction l'étape suivante.",
      };
    case "too_soon": {
      const seconds = opts.retryInSeconds ?? null;
      return {
        tone: "warning",
        title: "Un instant…",
        body:
          seconds && seconds > 0
            ? `Patientez ${seconds} seconde${seconds > 1 ? "s" : ""} avant de tamponner la prochaine étape.`
            : "Patientez quelques secondes avant de tamponner la prochaine étape.",
      };
    }
    case "wrong_order": {
      const position = opts.expectedPosition ?? null;
      return {
        tone: "warning",
        title: "Ce n'est pas encore le moment",
        body: position
          ? `Rendez-vous d'abord à l'étape ${position} du parcours.`
          : "Rendez-vous d'abord à l'étape précédente du parcours.",
      };
    }
    case "hunt_full":
      return {
        tone: "error",
        title: "Trésor épuisé",
        body: "Tous les lots de cette chasse ont déjà été gagnés. Merci d'avoir joué !",
      };
    case "completed":
      return {
        tone: "success",
        title: "Chasse terminée — bravo !",
        body: "Vous avez récupéré tous les tampons.",
      };
    case "unavailable":
    default:
      return {
        tone: "error",
        title: "Chasse indisponible",
        body: "Cette chasse au trésor n'est pas accessible pour le moment.",
      };
  }
}

/** Libellé compact de progression « X / Y » (done borné à [0, total]). */
export function huntProgressLabel(done: number, total: number): string {
  const safe = Math.max(0, Math.min(done, total));
  return `${safe} / ${total}`;
}

/** La chasse est-elle complétée (toutes les étapes tamponnées) ? */
export function isHuntComplete(done: number, total: number): boolean {
  return total > 0 && done >= total;
}

/**
 * Cases de la « carte de fidélité » : une par étape, marquée pleine si sa
 * position (1..total) figure dans les positions tamponnées. Indépendant de
 * l'ordre de scan — utile au rendu comme aux tests.
 */
export function huntStampCells(
  total: number,
  stamped: number[],
): Array<{ position: number; filled: boolean }> {
  const done = new Set(stamped);
  return Array.from({ length: Math.max(0, total) }, (_, i) => ({
    position: i + 1,
    filled: done.has(i + 1),
  }));
}
