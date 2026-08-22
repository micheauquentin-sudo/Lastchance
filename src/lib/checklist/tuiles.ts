/**
 * LES BLOCS D'UNE PAGE DÉTAIL, DANS L'ORDRE, ET CE QU'ILS DOIVENT PROUVER.
 *
 * Chaque page détail empile des blocs pleine largeur ; le commerçant ne sait
 * pas lesquels sont finis. Une tuile = UN bloc de la page, avec son rang
 * (index + 1) et son verdict. Le rang n'est pas stocké : il se lit de l'ordre
 * de la liste, qui est celui du rendu. Réordonner la page, c'est réordonner
 * ici — et rien d'autre à mettre à jour.
 *
 * ── CE QU'UNE TUILE N'EST PAS ──
 *
 * Ce n'est PAS une étape d'atelier. Le champ `etape` des modules d'activation
 * désigne l'étape qui CORRIGE un point (les cinq contrôles du jackpot pointent
 * tous « reglages »), pas le bloc qui l'affiche. Les deux notions coïncident
 * rarement : elles restent séparées.
 *
 * ── LES TUILES SANS CONTRÔLE ──
 *
 * La plupart des blocs (classement, écran comptoir, relance) ne portent aucun
 * contrôle et sont donc « complet ». C'est voulu : optionnel et vide reste
 * valide. Une tuile ne devient « incomplet » que si un contrôle BLOQUANT lui
 * est rattaché et qu'il est rouge, « attention » si un contrôle rattaché est
 * rouge sans bloquer.
 */
import {
  normaliserControles,
  type ControleBrut,
  type ControleNormalise,
  type ModuleChecklist,
} from "@/lib/checklist/controles";

export interface TuileChecklist {
  /** Identifiant stable de la tuile — jamais rendu, sert aux tests et aux clés. */
  cle: string;
  /** Nom du bloc, tel qu'il est déjà titré sur la page. */
  titre: string;
  /** Ancre de la page quand le bloc en porte une (`statut`, `suivi`, …). */
  ancre?: string;
  /** Clés des contrôles du module qui décident du verdict de ce bloc. */
  controles: readonly string[];
}

/**
 * LA ROUE — `src/app/dashboard/campaigns/[id]/page.tsx`.
 *
 * Les quatre contrôles de mécanique et de lots se corrigent dans l'éditeur de
 * roue, atteint depuis le bloc « Vos jeux » : c'est donc lui qui les porte.
 * `fenetre` (les dates de la campagne) va aux Réglages, où vit son formulaire.
 */
export const TUILES_ROUE: readonly TuileChecklist[] = [
  { cle: "statut", titre: "Statut", ancre: "statut", controles: [] },
  {
    cle: "jeux",
    titre: "Vos jeux",
    controles: ["mecanique", "defi", "lot-gagnant", "poids"],
  },
  { cle: "qr", titre: "QR codes", ancre: "qr", controles: ["qr"] },
  {
    cle: "performance",
    titre: "Performance par lot",
    ancre: "suivi",
    controles: [],
  },
  { cle: "prejeu", titre: "Avant de jouer", controles: [] },
  { cle: "gain", titre: "Après le gain", controles: [] },
  { cle: "programmation", titre: "Programmation et budget", controles: [] },
  { cle: "parrainage", titre: "Partage et parrainage", controles: [] },
  { cle: "modele", titre: "Enregistrer comme modèle", controles: [] },
  {
    cle: "reglages",
    titre: "Réglages",
    ancre: "reglages",
    controles: ["fenetre"],
  },
];

/**
 * LE QUIZ — `src/app/dashboard/quiz/[id]/page.tsx`, vue suivi (URL nue).
 *
 * Tout ce qui se règle vit dans l'atelier : sa carte d'entrée porte donc les
 * sept contrôles de préparation. `tirage` est le seul qui appartienne à un
 * autre bloc — c'est un geste d'exploitation, définitif, sur le suivi.
 */
export const TUILES_QUIZ: readonly TuileChecklist[] = [
  { cle: "statut", titre: "Statut du quiz", ancre: "statut", controles: [] },
  {
    cle: "partage",
    titre: "QR code et lien du quiz",
    ancre: "suivi",
    controles: [],
  },
  { cle: "tirage", titre: "Le tirage au sort", controles: ["tirage"] },
  {
    cle: "atelier",
    titre: "L'atelier du quiz",
    controles: [
      "questions",
      "dotation",
      "lot",
      "stock",
      "stock-epuise",
      "roue-absente",
      "roue-tirable",
    ],
  },
  {
    cle: "relance",
    titre: "Relancer la formule",
    ancre: "relance",
    controles: [],
  },
];

/** LE CALENDRIER — `src/app/dashboard/calendar/[id]/page.tsx`, vue suivi. */
export const TUILES_CALENDRIER: readonly TuileChecklist[] = [
  {
    cle: "statut",
    titre: "Statut du calendrier",
    ancre: "statut",
    controles: [],
  },
  {
    cle: "partage",
    titre: "QR code et lien du calendrier",
    ancre: "suivi",
    controles: [],
  },
  {
    cle: "atelier",
    titre: "L'atelier du calendrier",
    controles: [
      "grille",
      "cases",
      "cases-vides",
      "aucun-gain",
      "cases-en-pause",
      "roues",
      "assiduite",
    ],
  },
  {
    cle: "relance",
    titre: "Relancer la formule",
    ancre: "relance",
    controles: [],
  },
];

/** LA CHASSE — `src/app/dashboard/hunts/[id]/page.tsx`, vue suivi. */
export const TUILES_CHASSE: readonly TuileChecklist[] = [
  { cle: "statut", titre: "Statut de la chasse", ancre: "statut", controles: [] },
  {
    cle: "atelier",
    titre: "L'atelier de la chasse",
    controles: ["parcours", "lot", "stock", "fenetre"],
  },
  {
    cle: "suivi",
    titre: "Ce que font vos joueurs",
    ancre: "suivi",
    controles: [],
  },
  {
    cle: "relance",
    titre: "Relancer la formule",
    ancre: "relance",
    controles: [],
  },
];

/** LE PASSEPORT — `src/app/dashboard/loyalty/[id]/page.tsx`, vue suivi. */
export const TUILES_FIDELITE: readonly TuileChecklist[] = [
  {
    cle: "statut",
    titre: "Statut du programme",
    ancre: "statut",
    controles: [],
  },
  {
    cle: "atelier",
    titre: "L'atelier du passeport",
    controles: ["paliers", "stock", "roues"],
  },
  { cle: "apercu", titre: "En un coup d'œil", controles: [] },
  {
    cle: "partage",
    titre: "QR code et lien du passeport",
    ancre: "suivi",
    controles: [],
  },
  { cle: "comptoir", titre: "Écran comptoir", controles: [] },
  {
    cle: "relance",
    titre: "Relancer la formule",
    ancre: "relance",
    controles: [],
  },
];

/** LA CAGNOTTE — `src/app/dashboard/jackpot/[id]/page.tsx`, vue suivi. */
export const TUILES_JACKPOT: readonly TuileChecklist[] = [
  {
    cle: "statut",
    titre: "Statut de la cagnotte",
    ancre: "statut",
    controles: [],
  },
  { cle: "apercu", titre: "En un coup d'œil", controles: [] },
  {
    cle: "partage",
    titre: "QR code et lien de la cagnotte",
    ancre: "suivi",
    controles: [],
  },
  { cle: "comptoir", titre: "Écran comptoir", controles: [] },
  {
    cle: "atelier",
    titre: "L'atelier de la cagnotte",
    controles: ["lot", "stock", "objectif", "tirage", "url"],
  },
];

/** LA SOIRÉE — `src/app/dashboard/events/[id]/page.tsx`, vue suivi. */
export const TUILES_EVENEMENT: readonly TuileChecklist[] = [
  { cle: "statut", titre: "Statut du jeu", ancre: "statut", controles: [] },
  { cle: "suivi", titre: "Les sessions", ancre: "suivi", controles: [] },
  {
    cle: "atelier",
    titre: "L'atelier de la soirée",
    controles: ["questions", "salle", "stock", "actif"],
  },
  {
    cle: "relance",
    titre: "Relancer la formule",
    ancre: "relance",
    controles: [],
  },
];

/** LE CHAMPIONNAT — `src/app/dashboard/pronostics/[id]/page.tsx`, vue nue. */
export const TUILES_PRONOSTICS: readonly TuileChecklist[] = [
  {
    cle: "statut",
    titre: "Statut du championnat",
    ancre: "statut",
    controles: [],
  },
  {
    cle: "atelier",
    titre: "L'atelier du championnat",
    controles: [
      "matiere",
      "recompenses",
      "echeances",
      "subsidiaire",
      "contact",
    ],
  },
  { cle: "partage", titre: "QR code et lien à partager", controles: [] },
  { cle: "suivi", titre: "Classement", ancre: "suivi", controles: [] },
  { cle: "palmares", titre: "Le palmarès", controles: [] },
  { cle: "cloture", titre: "Clôturer le championnat", controles: [] },
  { cle: "danger", titre: "Zone de danger", controles: [] },
  {
    cle: "relance",
    titre: "Relancer la formule",
    ancre: "relance",
    controles: [],
  },
];

/**
 * LA VITRINE — `src/app/dashboard/vitrine/page.tsx`.
 *
 * Cette page porte QUATRE modules livrés : la Vitrine elle-même, et les deux
 * jeux de salon qui s'y règlent, Duo Miroir et Portrait de la Bande. (Réserver
 * a sa page à lui, plus bas.) Ils sont ici parce qu'ils sont des BLOCS DE CETTE
 * PAGE — voir le commentaire de `ModuleChecklist` sur ce qu'une entrée d'union
 * désigne vraiment.
 *
 * ── DEUX BLOCS RENDUS QUI NE SONT PAS DES TUILES, ET C'EST VOULU ──
 *
 * · `SommaireVitrine` (« Aller directement à ») est une TABLE DES MATIÈRES, pas
 *   une étape. La numéroter ferait de « lire le sommaire » la deuxième chose à
 *   faire pour ouvrir sa vitrine.
 * · `SalonsOuverts` est une console de SUPERVISION en direct, et elle ne se
 *   peint qu'avec au moins une salle ouverte. Un rang qui disparaît de l'écran
 *   selon l'heure de la journée n'est pas un rang.
 *
 * Aucun des deux ne porte donc de pastille : la suite des blocs NUMÉROTÉS reste
 * 1 → 9 dans l'ordre du rendu, exactement comme l'en-tête l'exige.
 *
 * ── LE PORTRAIT DE LA BANDE : UNE TUILE, ZÉRO CONTRÔLE ──
 *
 * Ce n'est pas un oubli et ce n'est pas de la place gardée au chaud. Son unique
 * réglage — le pack de questions — a un défaut en base et trois replis en
 * TypeScript : il n'existe aucun état « pas configuré », donc aucun contrôle qui
 * ne serait pas vert pour toujours. La tuile existe parce que le bloc existe et
 * qu'un commerçant doit pouvoir le situer dans la page ; elle ne prétend rien
 * vérifier.
 */
export const TUILES_VITRINE: readonly TuileChecklist[] = [
  { cle: "reglages", titre: "Réglages de la vitrine", controles: ["adresse"] },
  { cle: "audience", titre: "Audience", controles: [] },
  { cle: "traductions", titre: "Traductions (anglais)", controles: [] },
  { cle: "alaune", titre: "À la une (3 max)", controles: [] },
  { cle: "import", titre: "Importer une carte existante", controles: [] },
  { cle: "catalogue", titre: "Vos cartes", controles: ["catalogue"] },
  {
    cle: "duo",
    titre: "Duo Miroir",
    ancre: "duo-miroir",
    controles: ["duo-plateau"],
  },
  {
    cle: "bande",
    titre: "Portrait de la Bande",
    ancre: "portrait-bande",
    controles: [],
  },
  { cle: "qr", titre: "QR et impression", controles: ["publiee"] },
];

/**
 * RÉSERVER — `src/app/dashboard/reservations/page.tsx`.
 *
 * Les trois contrôles d'agenda vivent sur la liste des activités : c'est de là
 * qu'on ouvre une activité, et c'est de là qu'on entre dans son agenda pour
 * ouvrir un créneau. « Arrivées » et « Offres de stock » n'en portent aucun —
 * la première est une console de comptoir, la seconde n'a aucun état qu'un
 * contrôle honnête puisse distinguer (voir `activation/reserver.ts`).
 */
export const TUILES_RESERVER: readonly TuileChecklist[] = [
  {
    cle: "activites",
    titre: "Vos activités",
    controles: ["activites", "creneaux", "places"],
  },
  { cle: "arrivees", titre: "Arrivées", controles: [] },
  {
    cle: "files",
    titre: "Files d'accueil",
    controles: ["files-activite"],
  },
  { cle: "offres", titre: "Offres de stock", controles: [] },
];

export const TUILES_PAR_MODULE: Record<
  ModuleChecklist,
  readonly TuileChecklist[]
> = {
  roue: TUILES_ROUE,
  quiz: TUILES_QUIZ,
  calendrier: TUILES_CALENDRIER,
  chasse: TUILES_CHASSE,
  fidelite: TUILES_FIDELITE,
  jackpot: TUILES_JACKPOT,
  evenement: TUILES_EVENEMENT,
  pronostics: TUILES_PRONOSTICS,
  vitrine: TUILES_VITRINE,
  reserver: TUILES_RESERVER,
};

export type StatutTuile = "complet" | "attention" | "incomplet";

/**
 * LE VERDICT D'UNE TUILE — TROIS ÉTATS, PARCE QUE DEUX MENTAIENT.
 *
 * · `incomplet` (rouge) : ≥1 contrôle rattaché BLOQUANT et rouge. Tant qu'il
 *   l'est, l'animation ne devrait pas s'ouvrir aux joueurs.
 * · `attention` (orange) : aucun bloquant en échec, mais ≥1 contrôle rattaché
 *   rouge quand même. Ce n'est pas un empêchement — c'est un « pas rempli, à
 *   regarder ». La tuile « QR codes » d'une campagne sans aucun QR tombait
 *   exactement là, et l'ancien binaire l'affichait VERTE sous un résumé qui
 *   disait « personne ne peut la scanner ».
 * · `complet` (vert) : tous les contrôles rattachés sont ok, ou la tuile n'en
 *   a aucun de rattaché.
 *
 * ── LA FRONTIÈRE : « AUCUN CONTRÔLE » N'EST PAS « ATTENTION » ──
 *
 * Une tuile sans contrôle rattaché — ou dont les contrôles n'ont pas été
 * produits par le module (contrôle conditionnel : `roues` sur un passeport sans
 * tour de roue offert, le bloc « Parrainage ludique » quand le parrainage est
 * désactivé) — reste « complet ». Un choix assumé n'est pas un oubli : le
 * commerçant qui n'a pas voulu de parrainage n'a rien à corriger, et lui poser
 * un point orange permanent le dresserait à ignorer la couleur. L'orange ne
 * naît QUE d'un contrôle réellement émis et réellement rouge.
 */
export function statutTuile(
  tuile: TuileChecklist,
  controles: readonly ControleNormalise[],
): StatutTuile {
  const vises = new Set(tuile.controles);
  const rouges = controles.filter((c) => vises.has(c.cle) && !c.ok);
  if (rouges.some((c) => c.bloquant)) return "incomplet";
  return rouges.length > 0 ? "attention" : "complet";
}

export interface TuileRendue {
  tuile: TuileChecklist;
  /** Rang affiché en pastille — l'index dans la liste, à partir de 1. */
  numero: number;
  statut: StatutTuile;
}

/**
 * La liste prête à rendre : normalisation, rangs et verdicts en un appel.
 * C'est le seul point d'entrée dont une page détail a besoin.
 */
export function tuilesDuModule(
  module: ModuleChecklist,
  controles: readonly ControleBrut[],
): TuileRendue[] {
  const normalises = normaliserControles(module, controles);
  return TUILES_PAR_MODULE[module].map((tuile, index) => ({
    tuile,
    numero: index + 1,
    statut: statutTuile(tuile, normalises),
  }));
}
