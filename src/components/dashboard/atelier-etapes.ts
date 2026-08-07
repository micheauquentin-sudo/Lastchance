/**
 * LES CINQ ÉTAPES DE L'ATELIER DU JEU.
 *
 * Module PUR (aucun React, aucun IO) : la page, le stepper et l'étape de
 * vérification lisent la MÊME liste et le MÊME constructeur d'URL. L'étape
 * vit dans la query string de la route existante
 * `/dashboard/campaigns/[id]/wheel` — c'est ce qui garde valides les six
 * `revalidatePath(.../wheel)` de `src/actions/prizes.ts` et les trois écrans
 * qui citent déjà cette URL. Le `?wheel=` multi-roues est transporté tel quel.
 */
export type EtapeAtelier =
  | "jeu"
  | "lots"
  | "habillage"
  | "creneau"
  | "verification";

export interface DefinitionEtape {
  cle: EtapeAtelier;
  /** Numéro affiché dans la pastille — 1 à 5, jamais dérivé d'un index. */
  numero: number;
  label: string;
  /** Ce que le commerçant règle ici, en une ligne. */
  resume: string;
}

export const ETAPES_ATELIER: readonly DefinitionEtape[] = [
  {
    cle: "jeu",
    numero: 1,
    label: "Le jeu",
    resume: "La mécanique, l'éventuel défi et la limite de participation.",
  },
  {
    cle: "lots",
    numero: 2,
    label: "Les lots",
    resume: "Ce que vos clients peuvent gagner, et à quelle fréquence.",
  },
  {
    cle: "habillage",
    numero: 3,
    label: "L'habillage",
    resume: "Les couleurs, la police et l'ambiance de la page de jeu.",
  },
  {
    cle: "creneau",
    numero: 4,
    label: "Le créneau",
    resume: "Les jours et les heures où le jeu est ouvert.",
  },
  {
    cle: "verification",
    numero: 5,
    label: "La vérification",
    resume: "Ce qu'il reste à faire avant d'ouvrir aux joueurs.",
  },
] as const;

const CLES = ETAPES_ATELIER.map((e) => e.cle);

/** Une valeur d'URL inconnue retombe sur la première étape, jamais sur 404. */
export function parseEtapeAtelier(valeur: string | undefined): EtapeAtelier {
  return CLES.includes(valeur as EtapeAtelier)
    ? (valeur as EtapeAtelier)
    : "jeu";
}

export function definitionEtape(cle: EtapeAtelier): DefinitionEtape {
  return ETAPES_ATELIER.find((e) => e.cle === cle) ?? ETAPES_ATELIER[0];
}

/**
 * URL d'une étape. `wheelId` n'est ajouté que s'il est fourni : la page sait
 * déjà retomber sur la première roue, et une URL sans `?wheel=` reste celle
 * que citent la Carte de l'Aventure et le hero du tableau de bord.
 */
export function hrefEtapeAtelier(
  campaignId: string,
  etape: EtapeAtelier,
  wheelId?: string | null,
): string {
  const base = `/dashboard/campaigns/${campaignId}/wheel?etape=${etape}`;
  return wheelId ? `${base}&wheel=${wheelId}` : base;
}

export function etapePrecedente(cle: EtapeAtelier): DefinitionEtape | null {
  const index = CLES.indexOf(cle);
  return index > 0 ? ETAPES_ATELIER[index - 1] : null;
}

export function etapeSuivante(cle: EtapeAtelier): DefinitionEtape | null {
  const index = CLES.indexOf(cle);
  return index >= 0 && index < ETAPES_ATELIER.length - 1
    ? ETAPES_ATELIER[index + 1]
    : null;
}
