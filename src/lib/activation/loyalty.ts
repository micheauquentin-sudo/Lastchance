/**
 * « PEUT-ON OUVRIR CE PROGRAMME DE FIDÉLITÉ AUX CLIENTS ? » — EN FONCTION PURE.
 *
 * Même geste, et même raison, que `src/lib/activation/hunts.ts` : le verdict
 * vivait en ligne dans `setLoyaltyProgramStatus` (src/actions/loyalty.ts), donc
 * illisible depuis l'écran. Il est extrait ici pour être consommé par l'action
 * ET par l'étape « La vérification » de l'atelier — une seule vérité.
 *
 * La précondition serveur est MINCE (un palier suffit) et c'est justement ce
 * qui rend l'étape de vérification utile : un palier à stock 0 est « en
 * pause », un palier « tour de roue offert » peut pointer une roue qui ne
 * distribue rien — deux situations que la base laisse passer et que personne ne
 * disait au commerçant. Ces contrôles-là vivent dans
 * `atelier-loyalty-verification-state.ts` : ils RACONTENT, ils ne refusent pas.
 */

/** Miroir de la garde serveur : au moins un palier pour ouvrir. */
export const LOYALTY_MIN_MILESTONES = 1;

export interface EtatActivationFidelite {
  /** Nombre de lignes `loyalty_milestones` du programme. */
  milestoneCount: number;
}

export type ManqueActivationFidelite = "paliers";

export const MESSAGES_ACTIVATION_FIDELITE: Record<
  ManqueActivationFidelite,
  string
> = {
  paliers: "Ajoutez au moins un palier avant d'activer le programme.",
};

export function manquesActivationFidelite(
  etat: EtatActivationFidelite,
): ManqueActivationFidelite[] {
  const manques: ManqueActivationFidelite[] = [];
  if (etat.milestoneCount < LOYALTY_MIN_MILESTONES) manques.push("paliers");
  return manques;
}

/**
 * Le message de refus de `setLoyaltyProgramStatus`, ou `null` si l'ouverture
 * est possible.
 */
export function refusActivationFidelite(
  etat: EtatActivationFidelite,
): string | null {
  const [premier] = manquesActivationFidelite(etat);
  return premier ? MESSAGES_ACTIVATION_FIDELITE[premier] : null;
}
