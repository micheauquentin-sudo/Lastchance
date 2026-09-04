import {
  type DeclarationEtape,
  libelleEtape,
  parseEtape,
} from "@/components/studio/etapes";
import type { LobbyKind } from "@/lib/lobby";

/**
 * LES ÉTAPES DU STUDIO DES SALONS — DÉRIVÉES DU JEU, jamais écrites en dur
 * (VIT-48).
 *
 * ── CE MODULE EST UNE ROUTE À DEUX JEUX, ET C'EST TOUT LE SUJET ──
 *
 * `/studio/salon/[jeu]` sert Duo Miroir ET Portrait de la Bande. Les six autres
 * studios règlent UNE animation ; celui-ci en règle deux, qui ne partagent ni
 * leur contenu ni leur nombre de réglages :
 *
 *  - le Duo pose des QUESTIONS (`set_duo_plateau`, trois places au minimum) et
 *    porte en plus une SUGGESTION DU JOUR (`set_duo_suggestion`) ;
 *  - la Bande choisit un PACK DE CARTES (`set_bande_pack`), et n'a pas de
 *    suggestion — ni colonne, ni RPC, ni écran.
 *
 * Une liste unique aurait donc affiché « Votre suggestion du jour » sur le
 * Portrait de la Bande : une étape annonçant un réglage qui n'existe pas, sur
 * un écran vide. C'est mot pour mot ce qu'ADR-160 a déjà tranché en retirant
 * « Le détail de chaque lot » du Ticket d'Or — **une étape qui n'a rien à
 * régler n'existe pas**. `etapesStudioSalon(jeu)` est donc une FONCTION du
 * segment d'URL, et le fil s'en déduit.
 *
 * ── POURQUOI IL N'Y A PAS D'ÉTAPE « LE JEU QUE VOUS OUVREZ » ──
 *
 * Le découpage proposé en portait une. Elle est retirée, et pas par économie :
 * le jeu est décidé par le SEGMENT D'URL, il n'y a rien à y choisir. Pire, une
 * étape qui le changerait devrait NAVIGUER — `/studio/salon/duo` et
 * `/studio/salon/bande` sont deux routes — alors que tout le fil du socle
 * existe précisément pour que changer d'étape ne navigue PAS (`barre-etapes`,
 * ADR-154) : l'état vit en mémoire, et une navigation le perdrait avec ce que
 * le commerçant est en train d'essayer.
 *
 * ── POURQUOI L'HABILLAGE EST UNE ÉTAPE ET NON TROIS ──
 *
 * Le découpage proposé en portait trois — le thème, le décor, l'enseigne. Elles
 * sont regroupées, pour deux raisons qui vont dans le même sens.
 *
 * 1. CE N'EST PAS TROIS RÉGLAGES, C'EST UN SEUL VU SOUS TROIS ANGLES. Une seule
 *    ligne de `lobby_settings`, une seule action (`setHabillageSalons`), un
 *    seul aperçu — celui de la salle. Le critère d'ADR-157/ADR-160 est que des
 *    étapes soient DISJOINTES ; ici les trois se jugent ensemble, parce qu'on
 *    ne choisit pas un fond sans voir la palette qu'il recouvre.
 * 2. ET SURTOUT : C'EST LE RÉGLAGE PARTAGÉ ENTRE LES DEUX JEUX. Le titre de
 *    l'étape porte la portée — « L'habillage, commun aux deux jeux » — et le
 *    titre d'une étape est le SEUL texte que le commerçant ne peut pas manquer :
 *    il est dans le fil en permanence, dans l'infobulle, et dans le nom
 *    accessible que compose `libelleEtape`. Éclaté en trois, cet avertissement
 *    aurait dû être répété trois fois, ou — le vrai risque — n'être porté que
 *    par la première, laissant deux étapes changer l'autre jeu sans le dire.
 *
 * ── ET POURQUOI « VOIR LES SALLES OUVERTES » N'EN EST PAS UNE ──
 *
 * `SalonsOuverts` rend `null` quand aucune salle n'est ouverte, et une salle
 * n'existe que le temps d'une partie. L'étape aurait donc été VIDE pour la
 * plupart des commerçants la plupart du temps — la forme même qu'ADR-160
 * refuse. C'est de la SURVEILLANCE, pas un réglage : elle change sans que
 * personne n'ait rien touché, et ni l'enregistrement automatique ni l'aperçu du
 * socle n'ont de sens sur elle. Elle reste donc sur `/dashboard/salons/[jeu]`,
 * d'où rien n'a été retiré.
 */

/** Les deux étapes que les deux jeux partagent, mot pour mot. */
const HABILLAGE = {
  cle: "habillage",
  titre: "L'habillage, commun aux deux jeux",
  resume:
    "Les couleurs, le décor et votre enseigne dans la salle d'attente. Un seul salon pour Duo Miroir et Portrait de la Bande : ce réglage habille les deux.",
} as const;

const QR = {
  cle: "qr",
  titre: "Le QR de vos tables",
  resume:
    "L'adresse à imprimer et à poser sur les tables : vos clients la scannent pour ouvrir une salle.",
} as const;

const ETAPES_DUO = [
  {
    cle: "contenu",
    titre: "Vos questions",
    resume:
      "Les propositions entre lesquelles la table doit trancher — au moins trois.",
  },
  {
    cle: "suggestion",
    titre: "Votre suggestion du jour",
    resume:
      "La fiche que le Duo met en avant à la fin de la partie. Propre au Duo Miroir.",
  },
  HABILLAGE,
  QR,
] as const;

const ETAPES_BANDE = [
  {
    cle: "contenu",
    titre: "Votre pack de cartes",
    resume:
      "Le jeu de questions que la table se posera, et le ton qu'il donne à la partie.",
  },
  HABILLAGE,
  QR,
] as const;

/** Toutes les clés existantes, les deux jeux confondus. */
export type EtapeStudioSalon =
  | (typeof ETAPES_DUO)[number]["cle"]
  | (typeof ETAPES_BANDE)[number]["cle"];

/**
 * LE FIL DU JEU DEMANDÉ. C'est la seule porte : rien dans ce studio ne lit une
 * liste d'étapes autrement, sans quoi le fil affiché et le fil parcouru
 * pourraient diverger — et « Votre suggestion du jour » réapparaîtrait sur la
 * Bande par le chemin qu'on n'a pas gardé.
 */
export function etapesStudioSalon(
  jeu: LobbyKind,
): readonly DeclarationEtape<EtapeStudioSalon>[] {
  return jeu === "duo" ? ETAPES_DUO : ETAPES_BANDE;
}

/**
 * Les deux fonctions ci-dessous ne font que NOMMER la liste du jeu : le libellé
 * accessible et le repli vivent au socle (`@/components/studio/etapes`). Elles
 * restent exportées d'ici parce que c'est ce nom-là que les gardes cherchent —
 * un libellé recopié dans un test divergerait au premier renommage, et la garde
 * chercherait un bouton qui n'existe plus.
 *
 * Elles prennent LE JEU en premier argument, et ce n'est pas une commodité :
 * `libelleEtape` compose « Étape 2 sur 4 », un rang qui n'a de sens que dans un
 * fil donné. « L'habillage » est la 3ᵉ de 4 sur le Duo et la 2ᵉ de 3 sur la
 * Bande — une signature sans le jeu aurait forcé à en choisir un, donc à mentir
 * sur l'autre.
 */
export function parseEtapeStudioSalon(
  jeu: LobbyKind,
  brut: string | null | undefined,
): EtapeStudioSalon {
  return parseEtape(etapesStudioSalon(jeu), brut);
}

export function libelleEtapeStudioSalon(
  jeu: LobbyKind,
  cle: EtapeStudioSalon,
): string {
  return libelleEtape(etapesStudioSalon(jeu), cle);
}

/** Les deux listes satisfont le contrat du socle — vérifié à la compilation. */
const _contrat: readonly (readonly DeclarationEtape<EtapeStudioSalon>[])[] = [
  ETAPES_DUO,
  ETAPES_BANDE,
];
void _contrat;
