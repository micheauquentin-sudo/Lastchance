/**
 * « PEUT-ON OUVRIR CETTE CHASSE AUX JOUEURS ? » — EN FONCTION PURE.
 *
 * Ce verdict vivait EN LIGNE dans `setHuntStatus` (src/actions/hunts.ts), donc
 * inaccessible à tout écran. L'atelier a besoin de le raconter AVANT le geste,
 * et le recopier aurait créé deux vérités sur une même question — la faute que
 * `atelier-verification-state.ts` interdit explicitement en important
 * `campaignWindowState` plutôt qu'en le réécrivant.
 *
 * Il est donc extrait ici, PUR et testé, et il a exactement deux lecteurs :
 * l'action (qui refuse) et l'étape « La vérification » (qui explique). Les
 * messages sont ceux que l'action renvoyait, au caractère près : ils sont lus
 * par le commerçant dans les deux endroits, et la garde d'activation en base
 * (`assert_module_publish_allowed`) reste, elle, où elle est.
 *
 * Ce module ne dit RIEN du droit d'abonnement ni du rôle : ce sont des
 * questions d'autorisation, tranchées ailleurs et avant.
 */

/** Miroir de la garde serveur et du CHECK de complétion : 2 étapes minimum. */
export const HUNT_MIN_STEPS = 2;

export interface EtatActivationChasse {
  /** `hunts.reward_label` tel qu'il est en base (colonne NOT NULL, souvent ""). */
  rewardLabel: string;
  /** Nombre de lignes `hunt_steps` de cette chasse. */
  stepCount: number;
}

/** Ce qui manque, dans l'ordre où l'action le refusait. */
export type ManqueActivationChasse = "lot" | "etapes";

export const MESSAGES_ACTIVATION_CHASSE: Record<ManqueActivationChasse, string> =
  {
    lot: "Renseignez le lot final avant d'activer la chasse.",
    etapes: `Ajoutez au moins ${HUNT_MIN_STEPS} étapes avant d'activer la chasse.`,
  };

/**
 * TOUT ce qui manque, pas seulement le premier manque. L'action n'en montre
 * qu'un (elle refuse au premier), l'atelier les montre tous : corriger un
 * point pour en découvrir un second est précisément ce que l'étape de
 * vérification existe pour éviter.
 */
export function manquesActivationChasse(
  etat: EtatActivationChasse,
): ManqueActivationChasse[] {
  const manques: ManqueActivationChasse[] = [];
  if (!etat.rewardLabel.trim()) manques.push("lot");
  if (etat.stepCount < HUNT_MIN_STEPS) manques.push("etapes");
  return manques;
}

/**
 * Le message de refus de `setHuntStatus`, ou `null` si l'ouverture est
 * possible. L'ordre des manques est celui que l'action appliquait : le lot
 * d'abord, les étapes ensuite.
 */
export function refusActivationChasse(
  etat: EtatActivationChasse,
): string | null {
  const [premier] = manquesActivationChasse(etat);
  return premier ? MESSAGES_ACTIVATION_CHASSE[premier] : null;
}
