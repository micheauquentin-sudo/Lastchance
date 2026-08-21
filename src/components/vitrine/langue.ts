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
  /**
   * Titre des CONTENUS MIS EN AVANT (VIT-4) — un à trois liens choisis à la
   * main par le commerçant. Du chrome, et rien d'autre : les titres, eux, sont
   * saisis en base et ne se traduisent pas (`vitrine_contenus` n'entre pas dans
   * `vitrine_translations.cible_type`). Un mot SOBRE des deux côtés — « À la
   * une » / « Highlights » — parce que ce bloc voisine « Nous suivre » et que
   * deux titres emphatiques côte à côte se neutralisent.
   */
  contenus: string;
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

  // ── LES PORTES DES MODULES (VIT-3) ──────────────────────────────
  //
  // SEUL LE CHROME EST ICI. Les NOMS des activités, des files, des offres et
  // des quiz restent en français sur les deux variantes : `portes` ne porte
  // aucun champ traduisible (migration 20261014120000), et les y faire entrer
  // aurait fait retomber toute vitrine traduite sous le seuil de 95 % du
  // sélecteur de langue le jour de la livraison.
  /** Titre du bloc « Réserver ». */
  reserverTitre: string;
  /** Groupe des activités à créneaux → `/reserver/{id}`. */
  reserverActivites: string;
  /** Groupe des files d'accueil → `/reserver/file/{id}`. */
  reserverFiles: string;
  /** Groupe des offres à stock → `/reserver/stock/{id}`. */
  reserverOffres: string;
  /** Titre du bloc des jeux. */
  experiencesTitre: string;
  /**
   * La phrase du LANCEMENT VOLONTAIRE : rien ne démarre tout seul. Elle est de
   * produit, pas de décoration — c'est ce qui distingue une porte d'une
   * redirection.
   */
  experiencesInvite: string;
  /**
   * LA LIGNE SOUS LA PORTE « DUO MIROIR » (L17).
   *
   * Le NOM du jeu, lui, n'est pas ici et reste « Duo Miroir » sur les deux
   * variantes : c'est un nom propre de produit, au même titre qu'« Instagram »
   * et « TikTok » dans `BlocLiens`, et le traduire aurait donné deux noms à une
   * chose que les deux joueurs se désignent l'un à l'autre à voix haute, à la
   * même table. Ce qui se traduit est ce qui EXPLIQUE — cette phrase-là.
   */
  duoInvite: string;
  /**
   * LA LIGNE SOUS LA PORTE « PORTRAIT DE LA BANDE » (L18).
   *
   * Même arbitrage que `duoInvite` : le NOM du jeu reste français sur les deux
   * variantes — c'est un nom propre de produit, et c'est le mot que la tablée se
   * dit à voix haute autour d'une même table. Ce qui se traduit est ce qui
   * EXPLIQUE, et l'explication porte la seule chose qu'un visiteur doit savoir
   * avant d'entrer : à partir de trois joueurs, personne ne saura qui a voté.
   *
   * LE SEUIL EST DIT, ET IL N'EST PAS UNE PRÉCAUTION DE JURISTE. À deux, le
   * secret n'existe pas : celui qui passe déduit que l'unique voix est celle de
   * l'autre, et la révélation la lui nomme. La phrase est lue par des clients,
   * en salle, sur une page publique — elle ne peut pas promettre à deux ce que
   * l'arithmétique ne tient qu'à trois.
   */
  bandeInvite: string;
  /**
   * L'étiquette BCP 47 pour `Intl.DateTimeFormat`. `en-GB` et non `en-US` :
   * l'anglais servi ici s'adresse à un visiteur EN EUROPE, à qui « 6:00 PM »
   * pour une fermeture à 18 h se lit moins vite que « 18:00 ».
   */
  localeFenetre: string;
  /** La fenêtre de retrait d'une offre, bornes DÉJÀ formatées. */
  fenetreOffre: (debut: string, fin: string) => string;
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
    contenus: "À la une",
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
    reserverTitre: "Réserver",
    reserverActivites: "Réserver une table",
    reserverFiles: "File d'attente",
    reserverOffres: "Offres du moment",
    experiencesTitre: "Jeux",
    experiencesInvite: "À vous de jouer, quand vous voulez.",
    duoInvite: "À deux : chacun choisit ce qu’il offrirait à l’autre.",
    bandeInvite:
      "De 2 à 12 : la table nomme quelqu’un à chaque question. Dès trois joueurs, personne ne sait qui a voté.",
    localeFenetre: "fr-FR",
    fenetreOffre: (debut, fin) => `À retirer de ${debut} à ${fin}`,
    rechercherDans: (carte) => `Rechercher dans ${carte}`,
    compteResultats: (n) => `${n} résultat${n > 1 ? "s" : ""}`,
    proposeePar: (nom) => `Vitrine proposée par ${nom} · propulsé par`,
  },
  en: {
    histoire: "Our story",
    horaires: "Opening hours",
    liens: "Follow us",
    contenus: "Highlights",
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
    reserverTitre: "Book",
    reserverActivites: "Book a table",
    reserverFiles: "Join the queue",
    reserverOffres: "Offers right now",
    experiencesTitre: "Games",
    experiencesInvite: "Your call — start whenever you like.",
    duoInvite: "For two: each picks what they would offer the other.",
    bandeInvite:
      "From 2 to 12: the table names someone each round. With three players or more, no one learns who voted.",
    localeFenetre: "en-GB",
    fenetreOffre: (debut, fin) => `Pick up from ${debut} to ${fin}`,
    rechercherDans: (carte) => `Search in ${carte}`,
    compteResultats: (n) => `${n} result${n > 1 ? "s" : ""}`,
    proposeePar: (nom) => `Menu by ${nom} · powered by`,
  },
};
