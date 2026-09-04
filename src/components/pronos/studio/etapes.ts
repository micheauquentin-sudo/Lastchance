/**
 * LES HUIT ÉTAPES DU STUDIO DU CHAMPIONNAT (VIT-43).
 *
 * ── POURQUOI HUIT, ALORS QUE L'ATELIER N'EN A QUE SIX ──
 *
 * L'atelier n'a jamais pu en avoir plus, et la raison est mécanique : chez lui
 * une étape est une NAVIGATION (`?etape=` recharge la page), donc un formulaire
 * NEUF. Or `updateContest` sert TROIS formulaires distincts — le nom, les
 * données d'inscription, l'apparence — qui postent la même action et se
 * discriminent par des champs cachés (`collection_settings`,
 * `code_ttl_seconds`). Les trois devaient donc tenir dans une seule étape, « Le
 * championnat », qui mélange le nom du jeu et l'échéance des codes de retrait.
 *
 * Le socle des studios lève exactement cette contrainte (VIT-38) : l'état vit
 * en mémoire, aucun contrôle visible ne porte de `name`, et `ChampsCachesContest`
 * rend la charge EN ENTIER à chaque rendu. Une seule charge utile complète, donc
 * plus aucun discriminant à deviner — et la découpe redevient libre.
 *
 * ── L'ORDRE N'EST PAS NÉGOCIABLE ENTRE « LES QUESTIONS » ET « LES POINTS » ──
 *
 * `ContestScoringForm` ne montre que les paliers des types de questions
 * RÉELLEMENT créés (`questionTypes`). Régler le barème avant d'avoir posé les
 * questions est structurellement impossible : l'écran serait vide. C'est déjà
 * l'arbitrage de `atelier-contest-etapes.ts`, et il est repris tel quel —
 * « Les points » vient après « Les questions bonus », et l'étape le DIT quand
 * il n'y a encore rien à noter, au lieu de rendre un écran blanc.
 *
 * ── CE QUI N'ENTRE PAS DANS LE FIL, ET POURQUOI ──
 *
 * Le classement, le palmarès, la clôture, la zone de danger, la relance et la
 * SAISIE DE RÉSULTAT restent dehors. Ce sont des gestes d'EXPLOITATION : ils se
 * posent sur un championnat qui tourne, pas sur un championnat qu'on prépare.
 * Le studio est un écran de préparation ; y glisser « Clôturer » — définitif —
 * entre deux réglages d'apparence serait la même erreur que de poser une zone
 * de danger au milieu d'un formulaire.
 *
 * La saisie de résultat est le cas limite : elle est aujourd'hui MÊLÉE aux
 * cartes des matchs et des questions de l'atelier. Le studio monte les mêmes
 * cartes avec `saisieResultat={false}` plutôt que d'en écrire des copies — la
 * préparation garde l'ajout et la suppression, l'exploitation reste au tableau
 * de bord.
 */
import {
  type DeclarationEtape,
  libelleEtape,
  parseEtape,
} from "@/components/studio/etapes";

export const ETAPES_STUDIO_CONTEST = [
  {
    cle: "nom",
    titre: "Le nom du championnat",
    resume: "Comment votre championnat s'appelle, en haut de la page de vos clients.",
  },
  {
    cle: "inscription",
    titre: "Ce que je demande à l'inscription",
    resume: "Email, téléphone, et combien de temps un code de retrait reste valable.",
  },
  {
    cle: "allure",
    titre: "L'allure",
    resume: "Le thème saisonnier et le fond d'écran de la page suivie par vos joueurs.",
  },
  {
    cle: "matchs",
    titre: "Les matchs",
    resume: "Les rencontres à pronostiquer, et le verrouillage par défaut.",
  },
  {
    cle: "questions",
    titre: "Les questions bonus",
    resume: "Ce que vous demandez en plus des matchs : choix, classement, estimation.",
  },
  {
    cle: "subsidiaire",
    titre: "La question subsidiaire",
    resume: "Celle qui départage les ex æquo, posée à l'inscription.",
  },
  {
    cle: "bareme",
    titre: "Les points",
    resume: "Combien rapporte chaque bonne réponse, par type de question.",
  },
  {
    cle: "lots",
    titre: "Les lots par rang",
    resume: "Ce que gagnent vos clients selon leur rang final, puis l'ouverture.",
  },
] as const;

export type EtapeStudioContest = (typeof ETAPES_STUDIO_CONTEST)[number]["cle"];

/**
 * Les deux fonctions ci-dessous ne font que NOMMER leur liste : le libellé
 * accessible et le repli vivent au socle (`@/components/studio/etapes`). Elles
 * restent exportées d'ici parce que c'est ce nom-là que les gardes cherchent —
 * un libellé recopié dans un test divergerait au premier renommage, et la garde
 * chercherait un bouton qui n'existe plus.
 */
export function parseEtapeStudioContest(
  brut: string | null | undefined,
): EtapeStudioContest {
  return parseEtape(ETAPES_STUDIO_CONTEST, brut);
}

export function libelleEtapeStudioContest(cle: EtapeStudioContest): string {
  return libelleEtape(ETAPES_STUDIO_CONTEST, cle);
}

/** La liste satisfait le contrat du socle — vérifié à la compilation. */
const _contrat: readonly DeclarationEtape<EtapeStudioContest>[] =
  ETAPES_STUDIO_CONTEST;
void _contrat;
