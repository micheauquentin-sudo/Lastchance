/**
 * LES ANCRES DE LA PAGE VITRINE — trois chaînes, une seule définition.
 *
 * Elles vivent dans un module À PART, et non dans `sommaire-vitrine.tsx`, parce
 * que deux des trois sections qui les posent sont des composants client
 * (`duo-editeur`, `bande-editeur`) : importer le sommaire depuis eux aurait
 * traîné un composant serveur entier dans leur bundle pour trois constantes.
 *
 * Elles sont STABLES ET SANS IDENTIFIANT D'ENTITÉ — même motif que
 * `#bloc-reserver` côté public (`portes.tsx`) : un lien collé dans une note ne
 * doit pas dépendre d'une salle, d'une fiche ou d'une carte que le commerçant
 * peut supprimer le lendemain.
 */
export const ANCRE_SALONS = "salons-ouverts";
export const ANCRE_DUO = "duo-miroir";
export const ANCRE_BANDE = "portrait-bande";
