import {
  definitionEtape,
  hrefEtape,
  type EtapeAtelier,
} from "@/components/dashboard/atelier-etapes";

/**
 * LES CINQ ÉTAPES DE L'ATELIER DU JEU — la déclinaison ROUE des primitives.
 *
 * Elle vit dans son propre module, et pas en const locale à
 * `wheel/page.tsx`, parce qu'elle a TROIS lecteurs : la page, l'étape de
 * vérification (qui nomme l'étape à corriger) et `wheel-settings` (qui
 * enchaîne sur « Les lots » après enregistrement). Une const locale aurait
 * obligé à recopier les libellés ou à les faire redescendre en props sur deux
 * niveaux — deux vérités pour une même liste.
 *
 * L'étape reste dans la query string de `/dashboard/campaigns/[id]/wheel` :
 * c'est ce qui garde valides les six `revalidatePath(.../wheel)` de
 * `src/actions/prizes.ts` et les trois écrans qui citent déjà cette URL. Le
 * `?wheel=` multi-roues est transporté comme PORTEUR.
 */
export type EtapeRoue =
  | "jeu"
  | "lots"
  | "habillage"
  | "creneau"
  | "verification";

export const ETAPES_ROUE = [
  {
    cle: "jeu",
    titre: "Le jeu",
    resume: "La mécanique, l'éventuel défi et la limite de participation.",
  },
  {
    cle: "lots",
    titre: "Les lots",
    resume: "Ce que vos clients peuvent gagner, et à quelle fréquence.",
  },
  {
    cle: "habillage",
    titre: "L'habillage",
    resume: "Les couleurs, la police et l'ambiance de la page de jeu.",
  },
  {
    cle: "creneau",
    titre: "Le créneau",
    resume: "Les jours et les heures où le jeu est ouvert.",
  },
  {
    cle: "verification",
    titre: "La vérification",
    resume: "Ce qu'il reste à faire avant d'ouvrir aux joueurs.",
  },
] as const satisfies readonly EtapeAtelier[];

export function baseAtelierRoue(campaignId: string): string {
  return `/dashboard/campaigns/${campaignId}/wheel`;
}

/**
 * URL d'une étape de l'atelier du jeu. `wheelId` n'est ajouté que s'il est
 * fourni : la page sait déjà retomber sur la première roue, et une URL sans
 * `?wheel=` reste celle que citent la Carte de l'Aventure et le hero du
 * tableau de bord.
 */
export function hrefEtapeRoue(
  campaignId: string,
  cle: EtapeRoue,
  wheelId?: string | null,
): string {
  return hrefEtape(baseAtelierRoue(campaignId), cle, { wheel: wheelId });
}

export function definitionEtapeRoue(cle: EtapeRoue): EtapeAtelier {
  return definitionEtape(ETAPES_ROUE, cle) ?? ETAPES_ROUE[0];
}
