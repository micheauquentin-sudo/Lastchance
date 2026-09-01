/**
 * LES PAGES DU STUDIO (VIT-20).
 *
 * ── POURQUOI DES PAGES, ET NON UN LONG DÉFILEMENT ──
 *
 * Le studio règle désormais tout : identité visuelle, carte, mises en avant,
 * jeux. Empilé dans une seule colonne, c'est le mur que l'atelier par étape
 * avait été créé pour défaire (VIT-15) — et cette fois avec un aperçu à tenir
 * visible en même temps.
 *
 * ── LA PAGE EST DANS `?page=`, JAMAIS DANS UNE SOUS-ROUTE ──
 *
 * Même raison qu'`?etape=` dans l'atelier : `/vitrine-studio` est une route
 * unique, et l'état des réglages vit en mémoire (rien n'est enregistré tant
 * qu'on n'a pas enregistré). Une sous-route serait une navigation serveur —
 * donc une remontée de composant, donc la PERTE des réglages en cours d'essai,
 * ce qui est exactement contraire à la promesse d'un studio.
 *
 * C'est aussi pourquoi le changement de page se fait par un bouton et non par
 * un `<Link>` : il ne touche pas à l'historique du navigateur, il déplace un
 * état.
 */
export const PAGES_STUDIO = [
  {
    cle: "identite",
    titre: "Identité",
    resume: "Votre logo, votre bannière, vos mots, et ce qui paraît sur la page.",
  },
  {
    cle: "carte",
    titre: "La carte",
    resume: "Vos cartes, vos rubriques et vos fiches.",
  },
  {
    cle: "alaune",
    titre: "À la une",
    resume: "Ce que vous mettez en avant, vos réseaux et vos avis.",
  },
  {
    cle: "jeux",
    titre: "Les jeux",
    resume: "Ce que vos clients peuvent jouer depuis votre carte.",
  },
] as const;

export type PageStudio = (typeof PAGES_STUDIO)[number]["cle"];

export const PAGE_STUDIO_DEFAUT: PageStudio = "identite";

/**
 * Une page INCONNUE retombe sur la première, jamais sur un écran vide.
 *
 * Un lien gardé en favori doit mener quelque part d'utile — même arbitrage que
 * `parseEtape` pour les étapes d'un jeu décoché (ADR-129).
 */
export function parsePageStudio(brut: string | null | undefined): PageStudio {
  const trouvee = PAGES_STUDIO.find((p) => p.cle === brut);
  return trouvee ? trouvee.cle : PAGE_STUDIO_DEFAUT;
}
