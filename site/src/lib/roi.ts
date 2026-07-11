/**
 * Moteur du futur simulateur de ROI (section à venir sur l'accueil).
 *
 * Fonctions pures, sans dépendance UI : le composant interactif
 * (`components/roi/`) n'aura qu'à brancher des champs sur
 * `computeRoi()`. Les hypothèses sont regroupées dans ASSUMPTIONS
 * pour être ajustées facilement.
 */

export interface RoiInputs {
  /** Clients par jour, tous établissements confondus. */
  customersPerDay: number;
  /** Panier moyen en euros. */
  averageTicket: number;
  /** Visites par mois d'un client fidèle aujourd'hui. */
  currentVisitsPerMonth: number;
  /** Nombre d'établissements. */
  locations: number;
}

/** Hypothèses du modèle — à calibrer avec les données de la bêta. */
export const ASSUMPTIONS = {
  /** Part des clients qui scannent et jouent. */
  playRate: 0.25,
  /** Part des joueurs qui laissent un email (consentement). */
  emailOptInRate: 0.6,
  /** Part des joueurs qui gagnent un lot. */
  winRate: 0.35,
  /** Coût moyen d'un lot distribué (€). */
  averagePrizeCost: 2.5,
  /** Visites mensuelles supplémentaires générées par joueur régulier. */
  extraVisitsPerPlayerPerMonth: 0.4,
  /** Marge brute appliquée au chiffre d'affaires supplémentaire. */
  grossMargin: 0.7,
  /** Jours d'ouverture par mois. */
  openDaysPerMonth: 26,
  /** Abonnement mensuel par établissement (€). */
  subscriptionPerLocation: 29,
} as const;

export interface RoiResults {
  playersPerMonth: number;
  newEmailsPerMonth: number;
  prizesPerMonth: number;
  extraVisitsPerMonth: number;
  extraRevenuePerMonth: number;
  totalCostPerMonth: number;
  netGainPerMonth: number;
  netGainPerYear: number;
  /** Retour sur investissement mensuel (gain net / coût), ex : 3.2 = ×3,2. */
  roiMultiple: number;
}

export function computeRoi(
  inputs: RoiInputs,
  a: typeof ASSUMPTIONS = ASSUMPTIONS,
): RoiResults {
  const monthlyCustomers =
    Math.max(0, inputs.customersPerDay) * a.openDaysPerMonth;

  const playersPerMonth = Math.round(monthlyCustomers * a.playRate);
  const newEmailsPerMonth = Math.round(playersPerMonth * a.emailOptInRate);
  const prizesPerMonth = Math.round(playersPerMonth * a.winRate);
  const extraVisitsPerMonth = Math.round(
    playersPerMonth * a.extraVisitsPerPlayerPerMonth,
  );

  const extraRevenuePerMonth = Math.round(
    extraVisitsPerMonth * Math.max(0, inputs.averageTicket),
  );

  const totalCostPerMonth = Math.round(
    prizesPerMonth * a.averagePrizeCost +
      Math.max(1, inputs.locations) * a.subscriptionPerLocation,
  );

  const netGainPerMonth = Math.round(
    extraRevenuePerMonth * a.grossMargin - totalCostPerMonth,
  );

  return {
    playersPerMonth,
    newEmailsPerMonth,
    prizesPerMonth,
    extraVisitsPerMonth,
    extraRevenuePerMonth,
    totalCostPerMonth,
    netGainPerMonth,
    netGainPerYear: netGainPerMonth * 12,
    roiMultiple:
      totalCostPerMonth > 0
        ? Math.round((netGainPerMonth / totalCostPerMonth) * 10) / 10
        : 0,
  };
}
