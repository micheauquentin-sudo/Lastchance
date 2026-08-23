import {
  FACETTES_FR,
  VITRINE_FACETTES,
  type FacetteVitrine,
  type VitrineFicheView,
} from "@/lib/vitrine";

/**
 * LA BOUSSOLE DE CHOIX (VIT-10) — quatre questions, et rien qui se souvienne.
 *
 * ── CE QU'ELLE EST ──
 *
 * Quelques questions fermées qui réduisent la carte à ce qui correspond. Elle
 * ne classe pas, ne note pas, ne recommande rien qui ne soit pas déjà sur la
 * carte du commerce : elle FILTRE des fiches que le commerçant a étiquetées
 * lui-même.
 *
 * ── CE QU'ELLE N'EST PAS ──
 *
 * Ni un quiz — aucune réponse n'est bonne ou mauvaise — ni un profil : les
 * réponses vivent dans l'état d'un composant et meurent avec l'onglet. Rien
 * n'est écrit côté serveur, donc rien n'est à conserver, à exporter ou à
 * effacer. Elle ne déduit AUCUN allergène, ne donne aucun conseil médical, et
 * n'a aucun effet sur la file, le rang, la capacité ou le droit à une
 * réservation.
 *
 * ── LA RÈGLE D'APPARIEMENT, ET POURQUOI CELLE-LÀ ──
 *
 * Une fiche correspond si, POUR CHAQUE DIMENSION RÉPONDUE :
 *
 *   · elle porte la valeur choisie ; OU
 *   · elle ne porte AUCUNE valeur de cette dimension — elle y est neutre.
 *
 * La neutralité est ce qui rend l'étiquetage supportable : le commerçant
 * n'étiquette que ce qui DISTINGUE son plat, et un café qui va avec tout n'a
 * pas à cocher les quatre occasions.
 *
 * MAIS UNE FICHE SANS AUCUNE FACETTE N'EST JAMAIS PROPOSÉE. Sans cette règle,
 * une carte non étiquetée sortirait en entier à chaque question, et la
 * Boussole donnerait l'illusion de savoir choisir alors qu'elle rendrait la
 * liste telle quelle. Étiqueter est le geste qui fait exister une fiche ici.
 */

/** Les quatre dimensions, dans l'ordre où la Boussole les demande. */
export const DIMENSIONS_BOUSSOLE = [
  "occasion",
  "temps",
  "envie",
  "table",
] as const;

export type DimensionBoussole = (typeof DIMENSIONS_BOUSSOLE)[number];

export interface QuestionBoussole {
  dimension: DimensionBoussole;
  intitule: string;
  choix: FacetteVitrine[];
}

/** La dimension d'une facette — c'est son préfixe, et rien d'autre. */
export function dimensionDeLaFacette(
  facette: FacetteVitrine,
): DimensionBoussole {
  return facette.slice(0, facette.indexOf("_")) as DimensionBoussole;
}

/**
 * Les questions, DÉRIVÉES du vocabulaire et non recopiées à côté.
 *
 * Une liste écrite à la main aurait pu oublier une valeur ajoutée à
 * `VITRINE_FACETTES` : la facette aurait alors été enregistrable par le
 * commerçant et invisible dans la Boussole — un filtre qui exclut sur un
 * critère que personne ne peut choisir.
 */
const INTITULES: Array<{ dimension: DimensionBoussole; intitule: string }> = [
  { dimension: "occasion", intitule: "C'est pour quoi ?" },
  { dimension: "temps", intitule: "Vous avez le temps ?" },
  { dimension: "envie", intitule: "Plutôt…" },
  { dimension: "table", intitule: "Vous êtes…" },
];

export const QUESTIONS_BOUSSOLE: QuestionBoussole[] = INTITULES.map((question) => ({
  ...question,
  choix: VITRINE_FACETTES.filter(
    (facette) => dimensionDeLaFacette(facette) === question.dimension,
  ),
}));

/** Ce que le visiteur a répondu — au plus une valeur par dimension. */
export type ReponsesBoussole = Partial<Record<DimensionBoussole, FacetteVitrine>>;

/** Le libellé d'une facette, pour l'écran. */
export function libelleFacette(facette: FacetteVitrine): string {
  return FACETTES_FR[facette];
}

/**
 * Cette fiche répond-elle aux choix faits ?
 *
 * `facettes` vide ⇒ jamais. Voir l'en-tête : c'est la règle qui empêche la
 * Boussole de rendre la carte entière en prétendant avoir choisi.
 */
export function ficheCorrespond(
  facettes: readonly FacetteVitrine[],
  reponses: ReponsesBoussole,
): boolean {
  if (facettes.length === 0) return false;

  for (const dimension of DIMENSIONS_BOUSSOLE) {
    const choisie = reponses[dimension];
    if (!choisie) continue;

    const portees = facettes.filter(
      (facette) => dimensionDeLaFacette(facette) === dimension,
    );
    // Neutre sur cette dimension : la fiche ne s'y oppose pas.
    if (portees.length === 0) continue;
    if (!portees.includes(choisie)) return false;
  }

  return true;
}

/**
 * Les fiches retenues, dans l'ordre du catalogue.
 *
 * L'ORDRE N'EST PAS UN CLASSEMENT. Il est celui que le commerçant a composé —
 * aucune note, aucune pertinence calculée, rien qui laisse croire qu'une
 * machine a jugé qu'un plat valait mieux qu'un autre.
 *
 * Les fiches INDISPONIBLES sont écartées : proposer ce que la cuisine n'a plus
 * est le seul résultat pire qu'une liste vide.
 */
export function fichesDeLaBoussole(
  fiches: readonly VitrineFicheView[],
  reponses: ReponsesBoussole,
): VitrineFicheView[] {
  return fiches.filter(
    (fiche) => fiche.disponible && ficheCorrespond(fiche.facettes, reponses),
  );
}

/** Une seule question a-t-elle reçu une réponse ? */
export function boussoleCommencee(reponses: ReponsesBoussole): boolean {
  return DIMENSIONS_BOUSSOLE.some((dimension) => reponses[dimension]);
}

/**
 * La Boussole a-t-elle de quoi fonctionner sur cette carte ?
 *
 * Une carte dont AUCUNE fiche n'est étiquetée rendrait une liste vide à chaque
 * question. Mieux vaut ne pas ouvrir la porte du tout que de la faire pousser
 * pour rien — c'est le même arbitrage que la porte du Duo Miroir, qui
 * n'apparaît qu'à partir de deux fiches épinglées.
 */
export function boussoleUtilisable(
  fiches: readonly VitrineFicheView[],
): boolean {
  return fiches.some((fiche) => fiche.disponible && fiche.facettes.length > 0);
}
