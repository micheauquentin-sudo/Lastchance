/**
 * LES SEPT ÉTAPES DU STUDIO DE LA CHASSE (VIT-40).
 *
 * ── POURQUOI SEPT, ALORS QUE L'ATELIER N'EN A QUE QUATRE ──
 *
 * L'atelier n'en a que quatre, et sa première — « La chasse et son lot » —
 * empile le nom, l'ordre, le délai anti-partage, la fenêtre de jeu et le lot
 * final sur un seul écran. Ce n'était pas un choix de mise en page : c'est
 * `updateHunt` qui lit NEUF champs d'un seul `FormData` et réécrit la ligne en
 * bloc. Un champ absent est ÉCRASÉ. Découper cet écran en pages navigables,
 * dans l'atelier, aurait donc effacé le lot final en réglant les dates —
 * chaque étape y est une NAVIGATION, donc un formulaire neuf, donc une charge
 * utile amputée.
 *
 * Le socle des studios lève exactement cette contrainte (VIT-38) : l'état vit
 * en mémoire, aucun contrôle visible ne porte de `name`, et
 * `ChampsCachesChasse` rend la charge EN ENTIER à chaque rendu, quelle que
 * soit l'étape affichée. Il n'existe alors aucun chemin par lequel un champ
 * manque — c'est ce qui rend le découpage possible, et non un changement de
 * goût sur le nombre d'écrans.
 *
 * ── LA DÉCOUPE SUIT LE PARCOURS DU JOUEUR, PAS LA TABLE ──
 *
 * « Mes étapes » puis « Les indices » séparent deux gestes que le commerçant
 * ne fait PAS au même moment : on nomme d'abord ses emplacements, on écrit
 * ensuite l'indice qui mène de l'un à l'autre — et le second se relit en
 * chaîne, étape après étape, ce qu'un écran mêlant libellés et indices rend
 * illisible. Les deux vivent pourtant dans la même action atomique
 * (`updateHuntStep`), qui écrit `label` ET `hint` : chaque ligne rend donc en
 * champ caché celui des deux qu'elle ne montre pas (voir `hunt-editor.tsx`).
 *
 * L'ORDRE des étapes du studio, lui, suit ce qu'on prépare : les emplacements
 * avant les indices (un indice désigne l'étape suivante, qui doit exister), la
 * règle du jeu avant la fenêtre, et le lot avant l'impression — c'est le lot
 * qui conditionne l'ouverture aux joueurs.
 */
import {
  type DeclarationEtape,
  libelleEtape,
  parseEtape,
} from "@/components/studio/etapes";

export const ETAPES_STUDIO_CHASSE = [
  {
    cle: "nom",
    titre: "Le nom de ma chasse",
    resume: "Comment votre chasse s'appelle chez vos clients.",
  },
  {
    cle: "etapes",
    titre: "Mes étapes",
    resume: "Les emplacements à tamponner, leur nom et leur ordre.",
  },
  {
    cle: "indices",
    titre: "Les indices",
    resume: "Ce qui oriente le joueur d'une étape vers la suivante.",
  },
  {
    cle: "ordre",
    titre: "Dans quel ordre on joue",
    resume: "Ordre libre ou imposé, et le délai qui empêche le partage de QR.",
  },
  {
    cle: "quand",
    titre: "Quand ça se joue",
    resume: "Le début et la fin, aux heures de votre établissement.",
  },
  {
    cle: "lot",
    titre: "Le lot final",
    resume: "Ce que gagne le joueur qui a tamponné toutes les étapes.",
  },
  {
    cle: "verification",
    titre: "J'imprime et j'ouvre",
    resume: "Les affiches QR, ce qu'il reste à faire, et l'ouverture aux joueurs.",
  },
] as const;

export type EtapeStudioChasse = (typeof ETAPES_STUDIO_CHASSE)[number]["cle"];

/**
 * Les deux fonctions ci-dessous ne font que NOMMER leur liste : le libellé
 * accessible et le repli vivent au socle (`@/components/studio/etapes`).
 * Elles restent exportées d'ici parce que c'est ce nom-là que les gardes
 * cherchent — un libellé recopié dans un test divergerait au premier
 * renommage, et la garde chercherait un bouton qui n'existe plus.
 */
export function parseEtapeStudioChasse(
  brut: string | null | undefined,
): EtapeStudioChasse {
  return parseEtape(ETAPES_STUDIO_CHASSE, brut);
}

export function libelleEtapeStudioChasse(cle: EtapeStudioChasse): string {
  return libelleEtape(ETAPES_STUDIO_CHASSE, cle);
}

/** La liste satisfait le contrat du socle — vérifié à la compilation. */
const _contrat: readonly DeclarationEtape<EtapeStudioChasse>[] =
  ETAPES_STUDIO_CHASSE;
void _contrat;
