import { z } from "zod";

const REDEEM_CODE_ERROR = "Code de retrait invalide";

/**
 * Construit le schéma commun des codes porteurs présentés en caisse.
 *
 * Chaque famille conserve sa propre expression régulière, miroir de son
 * contrat SQL. Seules la normalisation de saisie et l'erreur publique sont
 * centralisées ici afin qu'elles ne divergent plus entre modules.
 */
export function createRedeemCodeSchema(pattern: RegExp) {
  return z
    .string()
    .trim()
    .toUpperCase()
    .regex(pattern, REDEEM_CODE_ERROR);
}
