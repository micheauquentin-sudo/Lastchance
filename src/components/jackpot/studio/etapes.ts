/**
 * LES HUIT ÉTAPES DU STUDIO DE LA CAGNOTTE (VIT-44).
 *
 * ── POURQUOI HUIT, ALORS QUE L'ATELIER N'EN A QU'UNE QUI ÉCRIT ──
 *
 * L'atelier du jackpot n'a JAMAIS découpé sa carte de réglages, et son propre
 * code dit pourquoi (`atelier-jackpot-etapes.ts`) : `updateJackpotCampaign`
 * réécrit toutes ses colonnes en bloc (`campaignFieldsForMode`). Un champ non
 * rendu n'y est jamais « absent » — il vaut le défaut de son schéma, et
 * l'action l'écrit :
 *
 *  · `public_slug` retombe à `null` → tous les QR imprimés cessent de pointer
 *    sur l'adresse lisible ;
 *  · `reward_label` se vide → l'activation est bloquée ;
 *  · `display_base` / `display_increment` tombent à 0.
 *
 * En silence, dans les trois cas. Découper cette carte dans l'atelier — où
 * chaque étape est une NAVIGATION, donc un formulaire NEUF — aurait exigé que
 * chaque morceau reposte les champs des autres en caché. C'est-à-dire la classe
 * de défaut que les gardes de `champ-formulaire` existent pour fermer.
 *
 * Le socle des studios lève exactement cette contrainte (VIT-38) : l'état vit
 * en mémoire, aucun contrôle visible ne porte de `name`, et la charge utile est
 * rendue EN ENTIER à chaque rendu par `ChampsCachesCagnotte`. Il n'existe alors
 * aucun chemin par lequel un champ manque, et le découpage devient possible
 * sans un seul miroir.
 *
 * ── LA DÉCOUPE SUIT CE QUE LE COMMERÇANT CHERCHE ──
 *
 * Un découpage par contrainte serveur — « les champs liés par le superRefine »,
 * « les champs normalisés par le mode » — aurait été plus court à écrire et
 * illisible : personne ne cherche « la charge utile d'updateJackpotCampaign »,
 * on cherche « mon lot » ou « le montant qui s'affiche ».
 *
 * L'ORDRE SUIT LA PRÉPARATION : on nomme, on décide comment on participe, on
 * pose l'objectif, on choisit comment le gagnant est désigné, on écrit le lot,
 * on règle le compteur qui chauffe la salle, on parle aux clients, on vérifie.
 *
 * ── CE QUI RESTE HORS DU FIL, ET POURQUOI ──
 *
 * Le statut et la SUPPRESSION, le QR et le lien de partage, les statistiques :
 * ils vivent sur l'écran de SUIVI, qui est le seul endroit qui publie (c'est
 * écrit dans `AtelierJackpotVerification`, et son bouton y renvoie).
 *
 * L'ÉCRAN COMPTOIR aussi, et pour une raison plus dure : c'est une TABLETTE
 * tenue par la caisse, face aux clients, avec sa propre garde de permission
 * (`hasJackpotAccess`, rôle `owner|editor`) et son `force-dynamic`. L'absorber
 * ici ferait entrer dans le studio une autorisation qui n'est pas la sienne.
 * Le studio n'en montre qu'un LIEN, et seulement en mode « Code au comptoir »,
 * où `getJackpotCounterCode` produit réellement un code.
 */
import {
  type DeclarationEtape,
  libelleEtape,
  parseEtape,
} from "@/components/studio/etapes";

export const ETAPES_STUDIO_CAGNOTTE = [
  {
    cle: "nom",
    titre: "Le nom de la cagnotte",
    resume: "Comment votre cagnotte s'appelle en haut de la page de vos clients.",
  },
  {
    cle: "participation",
    titre: "Comment on participe",
    resume:
      "Code au comptoir ou validation en caisse, la rotation du code, le délai entre deux participations et la validité du code gagnant.",
  },
  {
    cle: "objectif",
    titre: "L'objectif à atteindre",
    resume: "Le nombre de participations qui remplit la jauge.",
  },
  {
    cle: "tirage",
    titre: "Comment le gagnant est désigné",
    resume:
      "Tirage à l'objectif, gain instantané au rescan, ou tirage à une date.",
  },
  {
    cle: "lot",
    titre: "Le lot et combien j'en ai",
    resume: "Ce qui se gagne, ses conditions, et le nombre de gagnants prévus.",
  },
  {
    cle: "montant",
    titre: "Le montant qui s'affiche",
    resume: "Le compteur en euros qui monte à chaque participation.",
  },
  {
    cle: "message",
    titre: "Mon message aux clients",
    resume:
      "Vos actualités sur la page, et l'adresse du lien que vos clients ouvrent.",
  },
  {
    cle: "verification",
    titre: "Vérifier et ouvrir",
    resume: "Ce qu'il reste à faire avant d'ouvrir la cagnotte à vos clients.",
  },
] as const;

export type EtapeStudioCagnotte = (typeof ETAPES_STUDIO_CAGNOTTE)[number]["cle"];

/**
 * Les deux fonctions ci-dessous ne font que NOMMER leur liste : le libellé
 * accessible et le repli vivent au socle (`@/components/studio/etapes`). Elles
 * restent exportées d'ici parce que c'est ce nom-là que les gardes cherchent —
 * un libellé recopié dans un test divergerait au premier renommage, et la garde
 * chercherait un bouton qui n'existe plus.
 */
export function parseEtapeStudioCagnotte(
  brut: string | null | undefined,
): EtapeStudioCagnotte {
  return parseEtape(ETAPES_STUDIO_CAGNOTTE, brut);
}

export function libelleEtapeStudioCagnotte(cle: EtapeStudioCagnotte): string {
  return libelleEtape(ETAPES_STUDIO_CAGNOTTE, cle);
}

/** La liste satisfait le contrat du socle — vérifié à la compilation. */
const _contrat: readonly DeclarationEtape<EtapeStudioCagnotte>[] =
  ETAPES_STUDIO_CAGNOTTE;
void _contrat;
