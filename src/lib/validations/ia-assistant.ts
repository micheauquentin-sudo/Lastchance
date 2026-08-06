import { z } from "zod";
import { texteOptionnel } from "@/lib/validations/champ-formulaire";
import type { ExperienceObjective } from "@/platform/experiences/catalog";

/**
 * Assistant de CRÉATION IA — validation de l'entrée de l'action.
 *
 * L'assistant ne reçoit que deux champs ÉPHÉMÈRES (zéro migration, zéro donnée
 * nouvelle à protéger) : le TYPE de commerce saisi et l'OBJECTIF choisi. Rien
 * ici n'est relu en base ni persisté.
 */

/**
 * Garde de synchronisation avec `ExperienceObjective` : le `Record` force à
 * lister TOUS les objectifs du type (une clé manquante OU en trop fait échouer
 * le typecheck). `OBJECTIFS` en dérive, si bien que l'enum reste aligné sans
 * recopie manuelle — le jour où un objectif est ajouté au catalogue, ce fichier
 * ne compile plus tant qu'il n'y figure pas.
 */
const OBJECTIFS_CONNUS: Record<ExperienceObjective, null> = {
  Acquérir: null,
  Fidéliser: null,
  "Animer en direct": null,
  "Créer du trafic": null,
};

const OBJECTIFS = Object.keys(OBJECTIFS_CONNUS) as [
  ExperienceObjective,
  ...ExperienceObjective[],
];

export const suggererIdeesInputSchema = z.object({
  // Champ de formulaire SAISI, facultatif et tolérant à l'absence : un champ
  // non rendu vaut "" (jamais un refus), via `texteOptionnel` — c'est le patron
  // du dossier (cf. champ-formulaire). L'assistant sait proposer même sans type
  // précisé ; l'objectif, lui, reste la direction obligatoire.
  typeCommerce: texteOptionnel(
    z.string().trim().max(80, "Type de commerce trop long"),
  ),
  objectif: z.enum(OBJECTIFS),
});

export type SuggererIdeesInput = z.infer<typeof suggererIdeesInputSchema>;
