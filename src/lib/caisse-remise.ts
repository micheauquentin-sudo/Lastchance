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
 * ── Ce qui est corrigé ici, et ce qui ne l'est pas ──
 *
 * Le registre universel ne gèle PAS la description : son `on conflict` fait
 * `metadata = excluded.metadata`, donc `reward_details` y est réécrit à chaque
 * resynchronisation. Il n'existe aujourd'hui aucune description gravée à
 * afficher — la rétablir demande une migration, hors de ce périmètre.
 *
 * Ce qui est en notre pouvoir est de ne pas AFFICHER une contradiction
 * démontrée : quand le libellé gravé diffère du libellé courant, la récompense
 * a été réécrite depuis l'émission, et la description courante décrit alors
 * autre chose que ce que le client a gagné. On la retire plutôt que de la
 * présenter comme faisant foi. Le titre gravé, lui, reste affiché : c'est lui
 * que l'e-mail du client porte.
 *
 * Reste non couvert, et assumé : une description réécrite SANS renommage passe
 * inaperçue — rien à l'écran ne permet de la détecter. C'est la moitié que la
 * migration devra fermer.
 */
export function descriptionDeCaisse(input: {
  /** Libellé gravé au registre, `null` pour un code antérieur au registre. */
  nomGagne: string | null;
  /** Libellé ACTUEL de la table parente. */
  labelCourant: string | null | undefined;
  /** Description ACTUELLE de la table parente. */
  descriptionCourante: string | null | undefined;
}): string | null {
  const description = input.descriptionCourante?.trim();
  if (!description) return null;
  // Sans libellé gravé (codes antérieurs au registre) la comparaison n'est pas
  // possible : on garde l'ancien comportement, qui reste le meilleur pour eux.
  if (input.nomGagne === null) return description;
  const courant = input.labelCourant?.trim() ?? "";
  return courant && courant !== input.nomGagne.trim() ? null : description;
}
