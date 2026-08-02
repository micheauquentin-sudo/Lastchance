/**
 * Décisions d'affichage de l'écran « Caisse », extraites pour être vérifiables.
 *
 * Ce dépôt n'a pas d'environnement de rendu React : une règle laissée dans le
 * corps d'un composant est une règle que personne ne peut tester. Les deux
 * qui suivent ont chacune coûté un lot ou une promesse au comptoir.
 */

/**
 * Quatre-vingt-dix secondes : le temps d'un geste de comptoir. Au-delà, la
 * remise est de l'histoire, pas une confirmation.
 */
export const FENETRE_CONFIRMATION_MS = 90_000;

export type BadgeDeRemise = "confirmation" | "historique";

/**
 * « Vous venez de le remettre » ou « il l'a déjà eu ».
 *
 * ── Ce que la version précédente donnait à un SECOND PORTEUR ──
 *
 * La distinction n'était faite que sur l'horloge : `Date.now()` moins
 * `redeemed_at`. Elle ne savait donc ni QUI avait remis le lot, ni si la page
 * affichée résultait de ce geste-là. Conséquence, sur les neuf familles de
 * codes : un ami du premier client — capture d'écran, e-mail transféré — qui
 * présentait le MÊME code moins de 90 secondes plus tard obtenait la pastille
 * VERTE « ✓ Remise enregistrée — remettez le lot au client », c'est-à-dire
 * l'ORDRE de donner un second lot. L'écran refusait correctement avant que
 * cette confirmation n'existe : le confort du caissier avait été acheté au
 * prix d'un feu vert donné à quelqu'un d'autre.
 *
 * ── Pourquoi le GESTE et non l'identité du remettant ──
 *
 * `reward_issuances.redeemed_by` existe, mais il est `null` pour la famille la
 * plus courante — la roue : `sync_reward_issuance` y écrit `null::text`, et
 * `participations` n'a tout simplement pas la colonne. Fonder la confirmation
 * dessus l'aurait éteinte sur le parcours principal, ou obligé à une migration
 * pour un problème d'affichage.
 *
 * Ce qui distingue vraiment les deux situations n'est d'ailleurs pas l'acteur
 * mais l'ORIGINE DE LA PAGE : la confirmation appartient à la navigation
 * déclenchée par la remise elle-même (le rechargement pose `?remis=1`). Un code
 * tapé dans le champ de recherche part en `GET` avec le seul paramètre `code` —
 * le second porteur ne peut donc pas hériter du drapeau.
 *
 * La fenêtre de 90 s est CONSERVÉE en plus : elle borne l'onglet resté ouvert,
 * ou l'URL remise dans l'historique du navigateur le lendemain.
 */
export function badgeDeRemise(input: {
  /** `redeemed_at` de la base — l'horodatage fait foi, jamais un état client. */
  remisA: string;
  /** La page vient-elle du rechargement déclenché par la remise ? */
  issuDuGeste: boolean;
  /** Injecté pour rester pur (`Date.now()` au rendu est refusé ici). */
  maintenant: number;
}): BadgeDeRemise {
  if (!input.issuDuGeste) return "historique";
  const remisA = Date.parse(input.remisA);
  if (!Number.isFinite(remisA)) return "historique";
  const ecart = input.maintenant - remisA;
  if (ecart < 0 || ecart >= FENETRE_CONFIRMATION_MS) return "historique";
  return "confirmation";
}

/**
 * Description à afficher SOUS le libellé gravé.
 *
 * ── Les deux lignes de la carte se contredisaient ──
 *
 * Le titre porte le libellé GRAVÉ à l'émission (migration 20260814120000) : le
 * nom sous lequel le client a gagné, celui que son e-mail annonce. La ligne
 * juste en dessous lisait, elle, la description COURANTE de la table parente.
 * Le commerçant renomme sa récompense ET réécrit sa description — geste banal
 * entre deux opérations — et la caisse affiche « Café offert » surmontant « un
 * croissant pur beurre, hors boissons ». C'est la seconde ligne qui porte les
 * conditions que le caissier va appliquer.
 *
 * ── Cette fonction a CHANGÉ DE NATURE ──
 *
 * Sa première version ne pouvait que RETIRER la description : le registre ne
 * gelait pas `reward_details` (son `on conflict` faisait `metadata =
 * excluded.metadata`), il n'existait donc aucune description gravée à afficher,
 * et l'en-tête d'alors assumait sa moitié manquante — « une description
 * réécrite SANS renommage passe inaperçue ».
 *
 * La migration 20260901120000 grave la description au même titre que le
 * libellé. La caisse affiche donc désormais la BONNE plutôt que rien, et la
 * moitié manquante est fermée : une réécriture sans renommage n'a plus d'effet
 * sur ce qui s'affiche.
 *
 * ── Le repli, identique à celui de `frozenLabel` ──
 *
 * `detailsGraves` est absent dans trois situations, toutes traitées pareil :
 * un code ANTÉRIEUR au registre, un lot dont la description était vide à
 * l'émission, et la famille `contest` — seule des neuf à ne jamais écrire
 * `reward_details`, pour qui ce repli est le chemin NORMAL et non une
 * exception. On retombe alors sur la table parente, l'ancien comportement,
 * qui reste le meilleur disponible.
 *
 * Sur ce repli SEULEMENT, la garde d'origine reste utile et est conservée :
 * un libellé gravé différent du libellé courant prouve que la récompense a été
 * réécrite depuis l'émission, donc que la description courante décrit autre
 * chose. On la retire plutôt que de la présenter comme faisant foi.
 */
export function descriptionDeCaisse(input: {
  /**
   * Description GRAVÉE au registre (`metadata->>'reward_details'`). Requise
   * et non optionnelle : les huit cartes porteuses d'une description doivent
   * toutes déclarer ce qu'elles savent, sinon l'une d'elles retomberait
   * silencieusement sur la table parente — c'est exactement l'oubli sur une
   * seule famille qui a produit le défaut d'origine.
   */
  detailsGraves: string | null;
  /** Libellé gravé au registre, `null` pour un code antérieur au registre. */
  nomGagne: string | null;
  /** Libellé ACTUEL de la table parente. */
  labelCourant: string | null | undefined;
  /** Description ACTUELLE de la table parente. */
  descriptionCourante: string | null | undefined;
}): string | null {
  // La description gravée fait foi : c'est le texte des conditions sous
  // lesquelles le client a gagné. Aucune comparaison n'a plus lieu d'être.
  const graves = input.detailsGraves?.trim();
  if (graves) return graves;

  const description = input.descriptionCourante?.trim();
  if (!description) return null;
  // Sans libellé gravé (codes antérieurs au registre) la comparaison n'est pas
  // possible : on garde l'ancien comportement, qui reste le meilleur pour eux.
  if (input.nomGagne === null) return description;
  const courant = input.labelCourant?.trim() ?? "";
  return courant && courant !== input.nomGagne.trim() ? null : description;
}
