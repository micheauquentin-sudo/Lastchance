import {
  VITRINE_SECTEUR_DEFAUT,
  type LangueVitrine,
  type SecteurVitrine,
} from "@/lib/vitrine";

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

/**
 * LES MOTS QUI DÉPENDENT DU MÉTIER (VIT-13).
 *
 * ── CINQ ENTRÉES, ET PAS UNE DE PLUS ──
 *
 * La très grande majorité du chrome est NEUTRE et le reste : « Notre
 * histoire », « Horaires », « Nous suivre », « Allergènes », « Indisponible
 * aujourd'hui » se disent pareil chez un coiffeur et chez un restaurateur.
 * Seules les cinq entrées ci-dessous nomment la MARCHANDISE — et une carte de
 * coiffeur qui annonce « Aucun plat ne correspond à votre recherche » est
 * exactement ce qui fait qu'un commerçant ne publie pas sa page.
 *
 * ── LES ALLERGÈNES NE BOUGENT PAS, MÊME CHEZ UN FLEURISTE ──
 *
 * Ils sont facultatifs par fiche : un fleuriste n'en coche aucun, le bloc ne
 * s'affiche pas, et le mot n'a pas à changer pour un bloc qui n'existe pas.
 *
 * ── `Partial` ET FUSION, PLUTÔT QUE SEPT DICTIONNAIRES COMPLETS ──
 *
 * Sept copies des quarante entrées auraient fait diverger « Nous suivre » entre
 * un bar et un spa au premier oubli, sans que rien ne le signale. Ce qui n'est
 * pas écrit ici retombe donc sur `TEXTES_VITRINE`, qui reste la seule source du
 * vocabulaire neutre.
 */
type MotsSecteur = Pick<
  TextesVitrine,
  | "nosCartes"
  | "recherchePlaceholder"
  | "aucunPlat"
  | "carteEnPreparation"
  | "reserverActivites"
>;

const MOTS_SECTEUR: Record<
  SecteurVitrine,
  Record<LangueVitrine, MotsSecteur>
> = {
  restaurant: {
    fr: {
      nosCartes: "Nos cartes",
      recherchePlaceholder: "Un plat, un ingrédient…",
      aucunPlat: "Aucun plat ne correspond à votre recherche.",
      carteEnPreparation: "Cette carte est en cours de préparation.",
      reserverActivites: "Réserver une table",
    },
    en: {
      nosCartes: "Our menus",
      recherchePlaceholder: "A dish, an ingredient…",
      aucunPlat: "No dish matches your search.",
      carteEnPreparation: "This menu is being prepared.",
      reserverActivites: "Book a table",
    },
  },
  bar: {
    fr: {
      nosCartes: "Nos cartes",
      recherchePlaceholder: "Une boisson, un ingrédient…",
      aucunPlat: "Aucune boisson ne correspond à votre recherche.",
      carteEnPreparation: "Cette carte est en cours de préparation.",
      reserverActivites: "Réserver une table",
    },
    en: {
      nosCartes: "Our menus",
      recherchePlaceholder: "A drink, an ingredient…",
      aucunPlat: "No drink matches your search.",
      carteEnPreparation: "This menu is being prepared.",
      reserverActivites: "Book a table",
    },
  },
  coiffeur: {
    fr: {
      nosCartes: "Nos prestations",
      recherchePlaceholder: "Une coupe, un soin…",
      aucunPlat: "Aucune prestation ne correspond à votre recherche.",
      carteEnPreparation: "Ces prestations sont en cours de préparation.",
      // « Prendre rendez-vous » et non « Réserver » : c'est le mot que le
      // client emploie lui-même au téléphone chez un coiffeur.
      reserverActivites: "Prendre rendez-vous",
    },
    en: {
      nosCartes: "Our services",
      recherchePlaceholder: "A cut, a treatment…",
      aucunPlat: "No service matches your search.",
      carteEnPreparation: "These services are being prepared.",
      reserverActivites: "Book an appointment",
    },
  },
  fleuriste: {
    fr: {
      nosCartes: "Nos créations",
      recherchePlaceholder: "Une fleur, une occasion…",
      aucunPlat: "Aucune création ne correspond à votre recherche.",
      carteEnPreparation: "Ces créations sont en cours de préparation.",
      reserverActivites: "Réserver un retrait",
    },
    en: {
      nosCartes: "Our arrangements",
      recherchePlaceholder: "A flower, an occasion…",
      aucunPlat: "No arrangement matches your search.",
      carteEnPreparation: "These arrangements are being prepared.",
      reserverActivites: "Book a pickup",
    },
  },
  hotel: {
    fr: {
      nosCartes: "Nos chambres",
      recherchePlaceholder: "Une chambre, un service…",
      aucunPlat: "Aucune chambre ne correspond à votre recherche.",
      carteEnPreparation: "Ces chambres sont en cours de préparation.",
      reserverActivites: "Réserver une chambre",
    },
    en: {
      nosCartes: "Our rooms",
      recherchePlaceholder: "A room, a service…",
      aucunPlat: "No room matches your search.",
      carteEnPreparation: "These rooms are being prepared.",
      reserverActivites: "Book a room",
    },
  },
  spa: {
    fr: {
      nosCartes: "Nos soins",
      recherchePlaceholder: "Un soin, un moment…",
      aucunPlat: "Aucun soin ne correspond à votre recherche.",
      carteEnPreparation: "Ces soins sont en cours de préparation.",
      reserverActivites: "Prendre rendez-vous",
    },
    en: {
      nosCartes: "Our treatments",
      recherchePlaceholder: "A treatment, a moment…",
      aucunPlat: "No treatment matches your search.",
      carteEnPreparation: "These treatments are being prepared.",
      reserverActivites: "Book an appointment",
    },
  },
  // LE NEUTRE. Il ne parle ni de plats, ni de rendez-vous, ni de chambres :
  // c'est ce que lit le visiteur d'une vitrine dont le commerçant n'a pas dit
  // son métier, et il ne doit jamais avoir l'air d'un restaurant par défaut.
  commerce: {
    fr: {
      nosCartes: "Notre catalogue",
      recherchePlaceholder: "Un produit, une envie…",
      aucunPlat: "Aucun article ne correspond à votre recherche.",
      carteEnPreparation: "Ce catalogue est en cours de préparation.",
      reserverActivites: "Réserver",
    },
    en: {
      nosCartes: "Our catalogue",
      recherchePlaceholder: "A product, an idea…",
      aucunPlat: "No item matches your search.",
      carteEnPreparation: "This catalogue is being prepared.",
      reserverActivites: "Book",
    },
  },
};

/**
 * LE CHROME DE LA PAGE, DANS SA LANGUE ET DANS SON MÉTIER.
 *
 * C'est le seul point d'entrée que les composants doivent appeler.
 * `TEXTES_VITRINE` reste exporté — il porte le vocabulaire neutre, et le
 * sélecteur de langue n'a besoin que de `nomLangue`, qui ne dépend d'aucun
 * métier — mais tout ce qui nomme la marchandise passe par ici.
 *
 * L'objet est reconstruit à chaque appel plutôt que mémoïsé : c'est une fusion
 * de deux objets figés sur une page rendue par le serveur, et un cache aurait
 * coûté plus de lignes à relire qu'il n'économise de microsecondes.
 */
export function textesVitrine(
  lang: LangueVitrine,
  secteur: SecteurVitrine = VITRINE_SECTEUR_DEFAUT,
): TextesVitrine {
  return { ...TEXTES_VITRINE[lang], ...MOTS_SECTEUR[secteur][lang] };
}
