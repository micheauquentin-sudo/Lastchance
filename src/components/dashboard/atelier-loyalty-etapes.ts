import {
  definitionEtape,
  hrefEtape,
  type EtapeAtelier,
} from "@/components/dashboard/atelier-etapes";

/**
 * LES QUATRE ÉTAPES DE L'ATELIER DU PASSEPORT — déclinaison des primitives.
 *
 * Comme pour la chasse, l'étape vit dans la query string de
 * `/dashboard/loyalty/[id]` : les dix `revalidatePath("/dashboard/loyalty/…")`
 * de `src/actions/loyalty.ts` visent la page nue.
 *
 * L'étape 1 « Le programme » est la cible de `liens.editeur` de la Carte de
 * l'Aventure — là encore parce que l'ancre `#reglages` d'aujourd'hui désigne
 * l'éditeur de PALIERS et non les réglages du programme (loyalty/[id]/page.tsx).
 *
 * « Les cartes de commande » est une étape DÉLIBÉRÉMENT non bloquante : elle ne
 * conditionne aucune publication (un programme s'ouvre sans avoir émis une
 * seule carte) et l'étape de vérification ne la juge donc pas.
 */
export type EtapeFidelite =
  | "programme"
  | "recompenses"
  | "cartes"
  | "verification";

export const ETAPES_FIDELITE = [
  {
    cle: "programme",
    titre: "Le programme",
    resume:
      "Le nom, la façon de valider une visite, la fréquence et l'habillage.",
  },
  {
    cle: "recompenses",
    titre: "Les récompenses",
    resume: "Les niveaux, les paliers à débloquer, leur lot ou leur tour offert.",
  },
  {
    cle: "cartes",
    titre: "Les cartes de commande",
    resume: "Facultatif : un QR à glisser dans les colis pour tamponner à distance.",
  },
  {
    cle: "verification",
    titre: "La vérification",
    resume: "Ce qu'il reste à faire avant d'ouvrir aux clients.",
  },
] as const satisfies readonly EtapeAtelier[];

export function baseAtelierFidelite(programId: string): string {
  return `/dashboard/loyalty/${programId}`;
}

export function hrefEtapeFidelite(
  programId: string,
  cle: EtapeFidelite,
): string {
  return hrefEtape(baseAtelierFidelite(programId), cle);
}

export function definitionEtapeFidelite(cle: EtapeFidelite): EtapeAtelier {
  return definitionEtape(ETAPES_FIDELITE, cle) ?? ETAPES_FIDELITE[0];
}
