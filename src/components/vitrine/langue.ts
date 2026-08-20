import type { LangueVitrine } from "@/lib/vitrine";

/**
 * LE CHROME DE LA VITRINE PUBLIQUE — les mots qui ne viennent d'aucune table.
 *
 * ── TROIS ORIGINES, ET CE FICHIER N'EN PORTE QU'UNE ──
 *
 *  1. Le CONTENU du commerçant (nom, description, accroche, rubriques) est
 *     traduit EN BASE : `vitrine_public_state` superpose le calque
 *     `vitrine_translations` champ par champ, avec repli français pour ce qui
 *     manque ou a vieilli. L'écran affiche ce qu'on lui donne.
 *  2. Le VOCABULAIRE DE PLATEFORME (badges, allergènes) est traduit à la main,
 *     une fois pour toutes, dans `@/lib/vitrine` — `libelleBadge(badge, lang)`
 *     et `libelleAllergene(allergene, lang)`. Il est partagé avec l'éditeur
 *     commerçant, d'où sa place en bibliothèque et non ici.
 *  3. Le CHROME — « Notre histoire », « Rechercher dans… », « Indisponible
 *     aujourd'hui ». Il n'appartient qu'à cet écran, et c'est tout ce fichier.
 *
 * ── PAS DE BIBLIOTHÈQUE D'INTERNATIONALISATION ──
 *
 * Deux langues, une vingtaine de mots, aucune pluralisation autre que le « s »
 * du compte de résultats. Un dictionnaire figé et typé dit exactement cela ;
 * une bibliothèque aurait ajouté un format de fichier, un chargeur et un
 * découpage de bundle pour le même résultat, sur la page dont le budget est le
 * plus serré du dépôt — un téléphone, en salle, sur un réseau de comptoir.
 *
 * Le type `Record<LangueVitrine, …>` est la garde : ajouter une langue au
 * vocabulaire de `@/lib/vitrine` fait rougir la compilation ici tant que ses
 * mots ne sont pas écrits, plutôt que de servir une page à moitié française.
 */
export interface TextesVitrine {
  histoire: string;
  horaires: string;
  liens: string;
  /** Destination, pas nom propre : « Avis Google » se traduit, « TikTok » non. */
  avisGoogle: string;
  nosCartes: string;
  rubriques: string;
  recherchePlaceholder: string;
  aucunResultat: string;
  aucunPlat: string;
  carteEnPreparation: string;
  indisponible: string;
  allergenes: string;
  propulsePar: string;
  /** Le nom de CETTE langue, tel qu'on l'écrit dans cette langue. */
  nomLangue: string;
  /**
   * Les entrées à argument sont des FONCTIONS et non des gabarits à trous :
   * « Search in {menu} » et « Rechercher dans {carte} » ne placent pas leur
   * argument au même endroit, et un gabarit par concaténation aurait fini par
   * imposer l'ordre des mots du français à l'anglais.
   */
  rechercherDans: (carte: string) => string;
  compteResultats: (n: number) => string;
  proposeePar: (nom: string) => string;
}

export const TEXTES_VITRINE: Record<LangueVitrine, TextesVitrine> = {
  fr: {
    histoire: "Notre histoire",
    horaires: "Horaires",
    liens: "Nous suivre",
    avisGoogle: "Avis Google",
    nosCartes: "Nos cartes",
    rubriques: "Rubriques",
    recherchePlaceholder: "Un plat, un ingrédient…",
    aucunResultat: "Aucun résultat dans cette carte.",
    aucunPlat: "Aucun plat ne correspond à votre recherche.",
    carteEnPreparation: "Cette carte est en cours de préparation.",
    indisponible: "Indisponible aujourd'hui",
    allergenes: "Allergènes",
    propulsePar: "Lastchance",
    nomLangue: "Français",
    rechercherDans: (carte) => `Rechercher dans ${carte}`,
    compteResultats: (n) => `${n} résultat${n > 1 ? "s" : ""}`,
    proposeePar: (nom) => `Vitrine proposée par ${nom} · propulsé par`,
  },
  en: {
    histoire: "Our story",
    horaires: "Opening hours",
    liens: "Follow us",
    avisGoogle: "Google reviews",
    nosCartes: "Our menus",
    rubriques: "Sections",
    recherchePlaceholder: "A dish, an ingredient…",
    aucunResultat: "No result in this menu.",
    aucunPlat: "No dish matches your search.",
    carteEnPreparation: "This menu is being prepared.",
    indisponible: "Unavailable today",
    allergenes: "Allergens",
    propulsePar: "Lastchance",
    nomLangue: "English",
    rechercherDans: (carte) => `Search in ${carte}`,
    compteResultats: (n) => `${n} result${n > 1 ? "s" : ""}`,
    proposeePar: (nom) => `Menu by ${nom} · powered by`,
  },
};
