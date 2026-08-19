import type { CheckinVerdict } from "@/lib/reserver";

/**
 * CE QUE LE COMPTOIR LIT APRÈS AVOIR SAISI UN CODE — logique pure, testable.
 *
 * Même découpage que `jackpot-state.ts` : aucun réseau, aucun React, aucune
 * dépendance serveur. Le composant ne fait que peindre ce qui sort d'ici.
 *
 * ── L'ORDRE EST DÉJÀ TRANCHÉ EN AMONT, ET CE FICHIER NE LE REJOUE PAS ──
 *
 * `checkin_reservation` rend DEUX informations qui peuvent être vraies en même
 * temps : le STATUT de la réservation, et `window_state`, qui dit si le geste
 * serait recevable maintenant. Un client pointé HIER qui se représente est
 * `checked_in` ET `too_late` — c'est une arrivée DÉJÀ ENREGISTRÉE, pas un refus
 * de fenêtre. Lire la fenêtre d'abord aurait fait afficher « trop tard » sur un
 * client pourtant venu, et envoyé le caissier chercher une dérogation.
 *
 * `mapCheckinReservation` (src/lib/reserver.ts) applique cet ordre et rend UN
 * `CheckinVerdict` déjà arbitré. Cette table n'a donc plus qu'à donner les mots
 * de chaque verdict — refaire l'arbitrage ici créerait une seconde règle,
 * capable de diverger de celle qui décide.
 */

export type TonArrivee = "success" | "info" | "warning" | "error";

export interface MessageArrivee {
  ton: TonArrivee;
  titre: string;
  corps: string;
  /** Le créneau et l'activité méritent-ils d'être rappelés sous le message ? */
  montrerCreneau: boolean;
}

const MESSAGES: Record<CheckinVerdict, MessageArrivee> = {
  // AUCUNE ligne rendue = code inconnu OU code d'une autre organisation : la
  // RPC ne les distingue pas, et l'écran ne doit pas prétendre le savoir. On
  // propose la seule action utile — refaire lire le code.
  unknown: {
    ton: "error",
    titre: "Code inconnu",
    corps:
      "Aucune réservation de votre établissement ne porte ce code. Faites-le relire au client : les caractères I, O, 0 et 1 n'y figurent jamais.",
    montrerCreneau: false,
  },
  cancelled: {
    ton: "warning",
    titre: "Réservation annulée",
    corps:
      "Ce client a annulé sa réservation : sa place a été rendue au créneau. Rien n'a été enregistré.",
    montrerCreneau: true,
  },
  checked_in: {
    ton: "success",
    titre: "Arrivée enregistrée",
    corps: "Le client est attendu sur ce créneau. Bon accueil !",
    montrerCreneau: true,
  },
  already_checked_in: {
    ton: "info",
    titre: "Déjà enregistrée",
    corps:
      "Cette arrivée avait déjà été validée. Rien n'a été enregistré une seconde fois — la place reste occupée par ce client.",
    montrerCreneau: true,
  },
  too_early: {
    ton: "warning",
    titre: "Trop tôt pour enregistrer",
    corps:
      "La réservation est bien confirmée, mais son créneau n'a pas encore commencé. L'enregistrement s'ouvre une heure avant le début.",
    montrerCreneau: true,
  },
  too_late: {
    ton: "warning",
    titre: "Fenêtre d'arrivée refermée",
    corps:
      "La réservation est restée confirmée, mais le délai d'enregistrement de ce créneau est passé. Rien n'a été enregistré.",
    montrerCreneau: true,
  },
};

export function messageArrivee(verdict: CheckinVerdict): MessageArrivee {
  return MESSAGES[verdict];
}

/** Habillage par ton — même vocabulaire que la caisse du jackpot. */
export const TON_ARRIVEE: Record<TonArrivee, string> = {
  success: "border-emerald-300 bg-emerald-50 text-emerald-900",
  info: "border-sky-300 bg-sky-50 text-sky-900",
  warning: "border-amber-300 bg-amber-50 text-amber-900",
  error: "border-red-300 bg-red-50 text-red-800",
};
