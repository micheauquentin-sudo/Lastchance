/**
 * LES HUIT ÉTAPES DU STUDIO DU CALENDRIER (VIT-39).
 *
 * ── POURQUOI HUIT, ALORS QUE L'ATELIER N'EN A QUE TROIS ──
 *
 * L'atelier n'en a jamais eu que trois pour une raison mécanique, écrite noir
 * sur blanc dans `atelier-calendar-etapes.ts` : « Les réglages est
 * INDIVISIBLE ». `updateCalendar` lit TREIZE champs d'un seul `FormData` et
 * réécrit la ligne en bloc — un champ absent est ÉCRASÉ. Découper cet écran en
 * pages navigables, dans l'atelier, aurait donc effacé le thème en réglant les
 * dates, et l'URL publique en réglant le cadeau final : chaque étape y est une
 * NAVIGATION, donc un formulaire neuf, donc une charge utile amputée.
 *
 * Le socle des studios lève exactement cette contrainte (VIT-38) : l'état vit
 * en mémoire, aucun contrôle visible ne porte de `name`, et
 * `ChampsCachesCalendrier` rend la charge EN ENTIER à chaque rendu, quelle que
 * soit l'étape affichée. Il n'existe alors aucun chemin par lequel un champ
 * manque — c'est ce qui rend le découpage possible, et non un changement de
 * goût sur le nombre d'écrans.
 *
 * ── LA DÉCOUPE SUIT LA PAGE DU CLIENT, PAS LA TABLE ──
 *
 * « Le nom », « L'allure », « Les dates », « Les cases » sont ce qu'un
 * commerçant REGARDE en descendant la page de ses clients. Un découpage par
 * colonne — les chaînes, puis les nombres, puis les dates — aurait été plus
 * simple à écrire et illisible : personne ne cherche « une colonne texte », on
 * cherche « mon cadeau de fin ».
 *
 * L'ORDRE, LUI, RESTE IMPOSÉ PAR LA MÉCANIQUE : `start_date`, `day_count` et
 * `timezone` déclenchent `syncCalendarDays`, qui crée les cases manquantes,
 * recalcule les dates d'ouverture et SUPPRIME celles d'index supérieur au
 * nouveau `day_count`. « Les dates » précède donc « Les cases », et porte
 * l'avertissement destructif.
 */
import {
  type DeclarationEtape,
  libelleEtape,
  parseEtape,
} from "@/components/studio/etapes";

export const ETAPES_STUDIO_CALENDRIER = [
  {
    cle: "nom",
    titre: "Le nom",
    resume: "Comment votre calendrier s'appelle chez vos clients.",
  },
  {
    cle: "allure",
    titre: "L'allure",
    resume: "Le thème saisonnier et le fond d'écran de la page.",
  },
  {
    cle: "dates",
    titre: "Les dates",
    resume: "Le jour de départ, le nombre de cases et le fuseau horaire.",
  },
  {
    cle: "cases",
    titre: "Les cases",
    resume: "Ce que chaque case révèle : un message, un lot ou un tour de roue.",
  },
  {
    cle: "cadeau",
    titre: "Le cadeau de fin",
    resume: "Ce que gagne le client qui a ouvert toutes les cases.",
  },
  {
    cle: "codes",
    titre: "Les codes en caisse",
    resume: "Le délai laissé pour présenter un code CADEAU- au comptoir.",
  },
  {
    cle: "message",
    titre: "Mon message",
    resume: "Vos actualités sur la page, et son adresse publique.",
  },
  {
    cle: "verification",
    titre: "Je vérifie et j'ouvre",
    resume: "Ce qu'il reste à faire avant d'ouvrir aux joueurs.",
  },
] as const;

export type EtapeStudioCalendrier =
  (typeof ETAPES_STUDIO_CALENDRIER)[number]["cle"];

/**
 * Les deux fonctions ci-dessous ne font que NOMMER leur liste : le libellé
 * accessible et le repli vivent au socle (`@/components/studio/etapes`).
 * Elles restent exportées d'ici parce que c'est ce nom-là que les gardes
 * cherchent — un libellé recopié dans un test divergerait au premier
 * renommage, et la garde chercherait un bouton qui n'existe plus.
 */
export function parseEtapeStudioCalendrier(
  brut: string | null | undefined,
): EtapeStudioCalendrier {
  return parseEtape(ETAPES_STUDIO_CALENDRIER, brut);
}

export function libelleEtapeStudioCalendrier(
  cle: EtapeStudioCalendrier,
): string {
  return libelleEtape(ETAPES_STUDIO_CALENDRIER, cle);
}

/** La liste satisfait le contrat du socle — vérifié à la compilation. */
const _contrat: readonly DeclarationEtape<EtapeStudioCalendrier>[] =
  ETAPES_STUDIO_CALENDRIER;
void _contrat;
