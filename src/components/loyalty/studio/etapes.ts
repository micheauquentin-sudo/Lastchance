/**
 * LES HUIT ÉTAPES DU STUDIO DU PASSEPORT (VIT-42).
 *
 * ── POURQUOI HUIT, ALORS QUE L'ATELIER N'EN A QUE QUATRE ──
 *
 * L'atelier n'en a jamais eu que quatre pour une raison mécanique : chaque
 * étape y est une NAVIGATION (`?etape=` recharge la page), donc rend un
 * formulaire NEUF, donc une charge utile amputée de tout ce qui n'est pas à
 * l'écran. Or `updateLoyaltyProgram` réécrit HUIT colonnes en bloc. Séparer
 * « le nom » de « les niveaux » y aurait exigé que chaque moitié reposte la
 * part de l'autre en champs cachés — ce que l'atelier fait effectivement,
 * `LoyaltySettings` et `LoyaltyTiersForm` se rendant mutuellement service.
 *
 * Le socle des studios lève exactement cette contrainte (VIT-38) : l'état vit
 * en mémoire, aucun contrôle visible ne porte de `name`, et la charge utile est
 * rendue EN ENTIER à chaque rendu par `ChampsCachesFidelite`. Il n'existe alors
 * aucun chemin par lequel un champ manque, et les miroirs cachés — qui ne
 * tenaient que sur « ces deux formulaires ne sont jamais à l'écran ensemble » —
 * n'ont plus de raison d'être.
 *
 * ── LE RATTACHEMENT AU JACKPOT VIT AVEC LA VALIDATION, PAS SEUL ──
 *
 * `jackpot_campaign_id` est inter-module, et le `superRefine` du schéma le lie
 * au mode : « Un jackpot associé exige la validation en caisse ». Le poser dans
 * une étape à lui aurait rendu ce refus INSOLUBLE — le commerçant lirait, sur
 * l'étape du jackpot, un reproche portant sur un réglage qu'il ne voit pas.
 * Les deux se règlent donc au même endroit, comme dans l'atelier.
 *
 * ── LA DÉCOUPE SUIT CE QUE LE COMMERÇANT CHERCHE ──
 *
 * « Le nom », « Les niveaux », « Mes cadeaux » sont ce qu'il vient régler. Un
 * découpage par action serveur — updateLoyaltyProgram, puis …Style, puis
 * …Referral — aurait été plus simple à écrire et illisible : personne ne
 * cherche « la charge utile d'updateLoyaltyProgram », on cherche « mes
 * cadeaux ».
 *
 * L'ORDRE SUIT LA PRÉPARATION : on nomme, on décide comment une visite se
 * valide, on pose les niveaux, on écrit les cadeaux, on ouvre le parrainage,
 * on habille, on émet éventuellement des cartes, puis on vérifie.
 *
 * ── CE QUI RESTE HORS DU FIL, ET POURQUOI ──
 *
 * Le statut et la suppression, le QR et le lien de partage, les statistiques,
 * la carte de relance : ils vivent sur l'écran de SUIVI, qui est le seul
 * endroit qui publie (c'est écrit dans `AtelierVerificationFidelite`, et son
 * bouton y renvoie). L'ÉCRAN COMPTOIR aussi, et pour une raison plus dure : il
 * est une TABLETTE tenue par la caisse, face aux clients, avec sa propre garde
 * de permission (`hasLoyaltyAccess`, rôle `owner|editor`, mode `rotating_code`).
 * L'absorber ici ferait entrer dans le studio une autorisation qui n'est pas la
 * sienne. Le studio n'en montre qu'un lien.
 */
import {
  type DeclarationEtape,
  libelleEtape,
  parseEtape,
} from "@/components/studio/etapes";

export const ETAPES_STUDIO_FIDELITE = [
  {
    cle: "nom",
    titre: "Le nom du programme",
    resume: "Comment votre passeport de fidélité s'appelle sur la carte de vos clients.",
  },
  {
    cle: "validation",
    titre: "Comment le client valide sa visite",
    resume:
      "Code au comptoir ou scan en caisse, la fréquence des visites et la validité du code de retrait.",
  },
  {
    cle: "niveaux",
    titre: "Les niveaux",
    resume: "Les seuils de points qui font passer une carte de bronze à argent puis à or.",
  },
  {
    cle: "cadeaux",
    titre: "Mes cadeaux et leur prix en points",
    resume: "Ce que vos clients peuvent s'offrir, à quel prix, et en quelle quantité.",
  },
  {
    cle: "parrainage",
    titre: "Le parrainage",
    resume: "Proposer à vos clients d'inviter un proche, et ce que cela leur rapporte.",
  },
  {
    cle: "allure",
    titre: "L'allure du passeport",
    resume: "La grande image de fond derrière la carte, et le logo de votre établissement.",
  },
  {
    cle: "cartes",
    titre: "Les cartes pour les colis",
    resume: "Facultatif : un QR à glisser dans un colis pour tamponner à distance.",
  },
  {
    cle: "verification",
    titre: "Vérifier et ouvrir aux clients",
    resume: "Ce qu'il reste à faire avant d'ouvrir le passeport à vos clients.",
  },
] as const;

export type EtapeStudioFidelite = (typeof ETAPES_STUDIO_FIDELITE)[number]["cle"];

/**
 * Les deux fonctions ci-dessous ne font que NOMMER leur liste : le libellé
 * accessible et le repli vivent au socle (`@/components/studio/etapes`). Elles
 * restent exportées d'ici parce que c'est ce nom-là que les gardes cherchent —
 * un libellé recopié dans un test divergerait au premier renommage, et la garde
 * chercherait un bouton qui n'existe plus.
 */
export function parseEtapeStudioFidelite(
  brut: string | null | undefined,
): EtapeStudioFidelite {
  return parseEtape(ETAPES_STUDIO_FIDELITE, brut);
}

export function libelleEtapeStudioFidelite(cle: EtapeStudioFidelite): string {
  return libelleEtape(ETAPES_STUDIO_FIDELITE, cle);
}

/** La liste satisfait le contrat du socle — vérifié à la compilation. */
const _contrat: readonly DeclarationEtape<EtapeStudioFidelite>[] =
  ETAPES_STUDIO_FIDELITE;
void _contrat;
