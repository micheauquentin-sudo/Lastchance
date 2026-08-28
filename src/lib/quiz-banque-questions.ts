/**
 * LE CATALOGUE de la banque de questions — la DONNÉE, séparée du moteur.
 *
 * Le générateur (`src/lib/quiz-banque.ts`) porte les types, le tirage et le
 * calcul durée ↔ nombre de questions. Ici : rien que du contenu, pour qu'une
 * relecture éditoriale (une réponse fausse, une formulation ambiguë) n'oblige
 * jamais à rouvrir la logique — et pour que le moteur reste testable sans
 * dépendre du volume du catalogue.
 *
 * RÈGLES ÉDITORIALES, tenues par `quiz-banque.test.ts` :
 *  · identifiants UNIQUES et stables (`cg-01`) — ils servent d'exclusion pour
 *    ne pas retirer deux fois la même question dans un même quiz ;
 *  · une question `choix` a 3 ou 4 propositions, dont UNE SEULE vraie ;
 *  · une réponse libre liste les formulations acceptées APRÈS normalisation
 *    serveur (minuscules, accents repliés, ponctuation ramenée à des espaces —
 *    `quiz_normalize_text`) : « Rubik's cube » et « rubiks cube » sont deux
 *    variantes DISTINCTES, l'apostrophe devenant une espace ;
 *  · un `sondage` et un `pronostic` n'ont PAS de bonne réponse : ils valent
 *    0 point et ne sont jamais corrigés à l'écran (voir les modèles `sondage`
 *    et `pronostic` dans quiz-presets.ts).
 *
 * Les faits retenus sont volontairement STABLES (géographie, sciences,
 * classiques du cinéma) : une banque qui vieillit mal ferait perdre des points
 * à un joueur qui a raison.
 */

import type { QuestionBanque, ThemeBanque } from "./quiz-banque";

// ────────────────────────────────────────────────────────────
// Fabriques — la forme est portée par le nom, pas par un champ à relire
// ────────────────────────────────────────────────────────────

type Diff = 1 | 2 | 3;

/** Choix multiple : `bonne` est l'INDEX (0-based) de la proposition vraie. */
function choix(
  id: string,
  prompt: string,
  options: readonly string[],
  bonne: number,
  difficulte: Diff = 2,
): Omit<QuestionBanque, "theme"> {
  return { id, prompt, difficulte, forme: { type: "choice", options, bonne } };
}

/** Vrai / faux : les deux propositions sont posées par le modèle. */
function vraiFaux(
  id: string,
  prompt: string,
  bonne: boolean,
  difficulte: Diff = 1,
): Omit<QuestionBanque, "theme"> {
  return { id, prompt, difficulte, forme: { type: "vrai_faux", bonne } };
}

/** Estimation chiffrée. `tolerance` = écart absolu accepté (0 = valeur exacte). */
function nombre(
  id: string,
  prompt: string,
  valeur: number,
  tolerance = 0,
  difficulte: Diff = 2,
): Omit<QuestionBanque, "theme"> {
  return {
    id,
    prompt,
    difficulte,
    forme: { type: "number", valeur, tolerance },
  };
}

/** Réponse libre : toutes les formulations acceptées, la première fait foi. */
function libre(
  id: string,
  prompt: string,
  variantes: readonly string[],
  difficulte: Diff = 2,
): Omit<QuestionBanque, "theme"> {
  return { id, prompt, difficulte, forme: { type: "text", variantes } };
}

/** Sondage d'opinion : aucune bonne réponse, 0 point, aucune correction. */
function sondage(
  id: string,
  prompt: string,
  options: readonly string[],
): Omit<QuestionBanque, "theme"> {
  return { id, prompt, difficulte: 1, forme: { type: "sondage", options } };
}

/** Pronostic de soirée : on parie sur ce que personne ne sait encore. */
function pronostic(
  id: string,
  prompt: string,
  options: readonly string[],
): Omit<QuestionBanque, "theme"> {
  return { id, prompt, difficulte: 1, forme: { type: "pronostic", options } };
}

/** Rattache un lot de questions à son thème (le champ n'est saisi qu'ici). */
function lot(
  theme: string,
  questions: readonly Omit<QuestionBanque, "theme">[],
): QuestionBanque[] {
  return questions.map((q) => ({ ...q, theme }));
}

// ────────────────────────────────────────────────────────────
// Les thèmes proposés au commerçant
// ────────────────────────────────────────────────────────────

export const THEMES_BANQUE: readonly ThemeBanque[] = [
  {
    cle: "culture_generale",
    label: "Culture générale",
    icon: "🧠",
    hint: "Le tout-venant qui met tout le monde d'accord.",
    habillage: "culture",
  },
  {
    cle: "cinema",
    label: "Cinéma & séries",
    icon: "🎬",
    hint: "Grands classiques, répliques et acteurs.",
    habillage: "culture",
  },
  {
    cle: "musique",
    label: "Musique",
    icon: "🎵",
    hint: "Instruments, groupes et tubes de toutes les époques.",
    habillage: "culture",
  },
  {
    cle: "sport",
    label: "Sport",
    icon: "⚽",
    hint: "Règles, records et grands rendez-vous.",
    habillage: "sport",
  },
  {
    cle: "cuisine",
    label: "Cuisine & gastronomie",
    icon: "🍽️",
    hint: "Recettes, produits et spécialités — parfait au comptoir.",
    habillage: "gourmand",
  },
  {
    cle: "histoire",
    label: "Histoire",
    icon: "🏛️",
    hint: "Dates, personnages et grands basculements.",
    habillage: "culture",
  },
  {
    cle: "geographie",
    label: "Géographie",
    icon: "🌍",
    hint: "Capitales, fleuves et reliefs.",
    habillage: "culture",
  },
  {
    cle: "sciences",
    label: "Sciences & nature",
    icon: "🔬",
    hint: "Corps humain, chimie, espace.",
    habillage: "culture",
  },
  {
    cle: "animaux",
    label: "Animaux",
    icon: "🐾",
    hint: "Records du vivant et curiosités — le thème qui marche avec les enfants.",
    habillage: "neutre",
  },
  {
    cle: "france",
    label: "La France",
    icon: "🥖",
    hint: "Régions, monuments et symboles.",
    habillage: "produit",
  },
  {
    cle: "retro",
    label: "Années 80-90",
    icon: "📼",
    hint: "Walkman, Game Boy et génériques — la carte nostalgie.",
    habillage: "neutre",
  },
  {
    cle: "fetes",
    label: "Fêtes & traditions",
    icon: "🎄",
    hint: "Noël, Pâques, 14 juillet : à sortir au bon moment de l'année.",
    habillage: "gourmand",
  },
];

// ────────────────────────────────────────────────────────────
// Culture générale
// ────────────────────────────────────────────────────────────

const CULTURE_GENERALE = lot("culture_generale", [
  choix("cg-01", "Combien de côtés a un hexagone ?", ["5", "6", "7", "8"], 1, 1),
  vraiFaux("cg-02", "Le Soleil est une étoile.", true, 1),
  choix(
    "cg-03",
    "Quelle est la capitale de l'Australie ?",
    ["Sydney", "Melbourne", "Canberra", "Perth"],
    2,
    3,
  ),
  nombre("cg-04", "Combien de touches compte un piano standard ?", 88, 2, 2),
  libre(
    "cg-05",
    "Quel métal est liquide à température ambiante ?",
    ["mercure", "le mercure"],
    2,
  ),
  choix(
    "cg-06",
    "Quelle couleur obtient-on en mélangeant du bleu et du jaune ?",
    ["Vert", "Orange", "Violet", "Marron"],
    0,
    1,
  ),
  vraiFaux("cg-07", "Le mont Everest est le plus haut sommet du monde.", true, 1),
  nombre("cg-08", "Combien de minutes compte une journée ?", 1440, 0, 2),
  choix(
    "cg-09",
    "Quel organe produit l'insuline ?",
    ["Le foie", "Le pancréas", "La rate", "Les reins"],
    1,
    2,
  ),
  libre("cg-10", "Quelle est la monnaie du Japon ?", ["yen", "le yen"], 1),
  choix(
    "cg-11",
    "Combien de cordes a une guitare classique ?",
    ["4", "6", "8", "12"],
    1,
    1,
  ),
  vraiFaux("cg-12", "Une année bissextile compte 366 jours.", true, 1),
  choix(
    "cg-13",
    "Quel est le plus grand océan du monde ?",
    ["L'Atlantique", "L'Indien", "Le Pacifique", "L'Arctique"],
    2,
    1,
  ),
  nombre("cg-14", "Combien de lettres compte l'alphabet français ?", 26, 0, 1),
  sondage("cg-15", "Plutôt lève-tôt ou couche-tard ?", [
    "Lève-tôt",
    "Couche-tard",
    "Ça dépend des jours",
  ]),
  sondage("cg-16", "Le meilleur moment de la journée ?", [
    "Le matin",
    "L'après-midi",
    "Le soir",
    "La nuit",
  ]),
  choix(
    "cg-17",
    "Quel jeu se joue avec 32 pièces sur 64 cases ?",
    ["Les dames", "Les échecs", "Le go", "Le backgammon"],
    1,
    1,
  ),
  libre(
    "cg-18",
    "Comment appelle-t-on la peur du vide ?",
    ["acrophobie", "l'acrophobie"],
    3,
  ),
  choix(
    "cg-19",
    "Quelle planète est surnommée la planète rouge ?",
    ["Mars", "Vénus", "Jupiter", "Mercure"],
    0,
    1,
  ),
  pronostic("cg-20", "Qui aura le meilleur score ce soir, à votre avis ?", [
    "Moi, évidemment",
    "La personne à ma droite",
    "La personne à ma gauche",
    "Aucune idée",
  ]),
]);

// ────────────────────────────────────────────────────────────
// Cinéma & séries
// ────────────────────────────────────────────────────────────

const CINEMA = lot("cinema", [
  choix(
    "ci-01",
    "Qui a réalisé « Pulp Fiction » ?",
    ["Martin Scorsese", "Quentin Tarantino", "Steven Spielberg", "Ridley Scott"],
    1,
    2,
  ),
  vraiFaux("ci-02", "Le film « Titanic » a remporté 11 Oscars.", true, 2),
  choix(
    "ci-03",
    "Dans « Star Wars », qui est le père de Luke Skywalker ?",
    ["Obi-Wan Kenobi", "Dark Vador", "L'Empereur", "Han Solo"],
    1,
    1,
  ),
  libre(
    "ci-04",
    "Quel est le prénom du personnage joué par Tom Hanks dans « Forrest Gump » ?",
    ["forrest"],
    1,
  ),
  choix(
    "ci-05",
    "Quelle ville accueille le plus célèbre festival de cinéma français ?",
    ["Deauville", "Cannes", "Venise", "Berlin"],
    1,
    1,
  ),
  choix(
    "ci-06",
    "Qui incarne Jack Sparrow dans « Pirates des Caraïbes » ?",
    ["Orlando Bloom", "Johnny Depp", "Brad Pitt", "Colin Farrell"],
    1,
    1,
  ),
  vraiFaux("ci-07", "« Le Roi Lion » est un film d'animation Disney.", true, 1),
  choix(
    "ci-08",
    "Quel animal est Simba ?",
    ["Un tigre", "Un lion", "Un guépard", "Un léopard"],
    1,
    1,
  ),
  nombre(
    "ci-09",
    "En quelle année est sorti le premier film « Harry Potter » ?",
    2001,
    1,
    3,
  ),
  choix(
    "ci-10",
    "Quelle série met en scène la famille Stark ?",
    ["Vikings", "Game of Thrones", "The Witcher", "Peaky Blinders"],
    1,
    1,
  ),
  libre(
    "ci-11",
    "Quel réalisateur a signé « E.T. » et « Jurassic Park » ?",
    ["spielberg", "steven spielberg"],
    2,
  ),
  choix(
    "ci-12",
    "Dans « Le Seigneur des anneaux », qui porte l'Anneau jusqu'en Mordor ?",
    ["Sam", "Frodon", "Merry", "Pippin"],
    1,
    1,
  ),
  vraiFaux(
    "ci-13",
    "« Le Fabuleux Destin d'Amélie Poulain » se déroule principalement à Montmartre.",
    true,
    2,
  ),
  choix(
    "ci-14",
    "Quelle récompense de cinéma est remise chaque année à Hollywood ?",
    ["Le César", "L'Oscar", "Le Molière", "L'Ours d'or"],
    1,
    1,
  ),
  sondage("ci-15", "Cinéma ou canapé ?", [
    "Salle obscure",
    "Canapé et plaid",
    "Les deux, selon l'humeur",
  ]),
  sondage("ci-16", "Le meilleur genre pour une soirée ?", [
    "Comédie",
    "Action",
    "Horreur",
    "Thriller",
  ]),
  choix(
    "ci-17",
    "Qui incarne James Bond dans « Casino Royale » (2006) ?",
    ["Pierce Brosnan", "Daniel Craig", "Sean Connery", "Roger Moore"],
    1,
    2,
  ),
  choix(
    "ci-18",
    "Dans « Matrix », quelle pilule Neo choisit-il ?",
    ["La bleue", "La rouge", "La verte", "Aucune des deux"],
    1,
    2,
  ),
  nombre(
    "ci-19",
    "Combien de films composent la trilogie originale de « Star Wars » ?",
    3,
    0,
    1,
  ),
  libre(
    "ci-20",
    "Quel film Pixar met en scène un rat qui rêve de devenir cuisinier ?",
    ["ratatouille"],
    1,
  ),
]);

// ────────────────────────────────────────────────────────────
// Musique
// ────────────────────────────────────────────────────────────

const MUSIQUE = lot("musique", [
  choix(
    "mu-01",
    "Combien de touches noires compte une octave de piano ?",
    ["3", "4", "5", "6"],
    2,
    2,
  ),
  choix(
    "mu-02",
    "Quel instrument Jimi Hendrix a-t-il rendu célèbre ?",
    ["La batterie", "La guitare", "Le saxophone", "Le piano"],
    1,
    1,
  ),
  vraiFaux("mu-03", "Mozart est né en Autriche.", true, 2),
  libre(
    "mu-04",
    "Quel groupe britannique a enregistré « Let It Be » ?",
    ["les beatles", "beatles", "the beatles"],
    1,
  ),
  choix("mu-05", "Combien de musiciens compte un quatuor ?", ["2", "3", "4", "5"], 2, 1),
  choix(
    "mu-06",
    "Quel chanteur est surnommé « le King » ?",
    ["Michael Jackson", "Elvis Presley", "Frank Sinatra", "Johnny Hallyday"],
    1,
    1,
  ),
  nombre("mu-07", "Combien de cordes a un violon ?", 4, 0, 1),
  choix(
    "mu-08",
    "Quelle note suit le « la » dans la gamme ?",
    ["Si", "Do", "Sol", "Fa"],
    0,
    1,
  ),
  vraiFaux("mu-09", "Le saxophone est un instrument à vent.", true, 1),
  choix(
    "mu-10",
    "Quel groupe a chanté « Bohemian Rhapsody » ?",
    ["Queen", "The Rolling Stones", "Pink Floyd", "Led Zeppelin"],
    0,
    1,
  ),
  libre(
    "mu-11",
    "Quel compositeur a écrit la Symphonie n°5 et ses quatre notes célèbres ?",
    ["beethoven", "ludwig van beethoven"],
    2,
  ),
  choix(
    "mu-12",
    "Quel instrument à cordes pincées compte 47 cordes en version de concert ?",
    ["La harpe", "Le piano", "La contrebasse", "Le luth"],
    0,
    3,
  ),
  choix(
    "mu-13",
    "Quel pas de danse a rendu Michael Jackson célèbre ?",
    ["Le moonwalk", "Le charleston", "Le tango", "Le sirtaki"],
    0,
    1,
  ),
  vraiFaux("mu-14", "Un métronome sert à donner le tempo.", true, 1),
  sondage("mu-15", "Votre madeleine musicale ?", [
    "Les années 80",
    "Les années 90",
    "Les années 2000",
    "La musique d'aujourd'hui",
  ]),
  sondage("mu-16", "Karaoké : vous vous lancez ?", [
    "Toujours",
    "Après un verre",
    "Jamais de la vie",
  ]),
  choix(
    "mu-17",
    "Combien de lignes compte une portée musicale ?",
    ["3", "4", "5", "6"],
    2,
    2,
  ),
  nombre("mu-18", "Combien de temps compte une mesure à 4/4 ?", 4, 0, 2),
  choix(
    "mu-19",
    "Quel groupe suédois a gagné l'Eurovision 1974 avec « Waterloo » ?",
    ["ABBA", "Roxette", "Ace of Base", "A-ha"],
    0,
    2,
  ),
  libre(
    "mu-20",
    "Quel instrument à archet se joue assis, tenu entre les genoux ?",
    ["violoncelle", "le violoncelle"],
    2,
  ),
]);

// ────────────────────────────────────────────────────────────
// Sport
// ────────────────────────────────────────────────────────────

const SPORT = lot("sport", [
  nombre(
    "sp-01",
    "Combien de joueurs une équipe de football aligne-t-elle sur le terrain ?",
    11,
    0,
    1,
  ),
  choix(
    "sp-02",
    "Tous les combien d'années ont lieu les Jeux olympiques d'été ?",
    ["2 ans", "3 ans", "4 ans", "5 ans"],
    2,
    1,
  ),
  vraiFaux("sp-03", "Un marathon mesure 42,195 kilomètres.", true, 2),
  choix(
    "sp-04",
    "Dans quel sport réalise-t-on un « strike » ?",
    ["Le bowling", "Le tennis", "Le judo", "Le golf"],
    0,
    1,
  ),
  nombre("sp-05", "Combien de points vaut un essai au rugby à XV ?", 5, 0, 2),
  choix(
    "sp-06",
    "Dans quel pays le judo est-il né ?",
    ["La Chine", "Le Japon", "La Corée", "La Thaïlande"],
    1,
    1,
  ),
  libre(
    "sp-07",
    "Quelle grande course cycliste traverse la France chaque été ?",
    ["tour de france", "le tour de france"],
    1,
  ),
  choix(
    "sp-08",
    "Combien de joueurs une équipe de basket aligne-t-elle sur le terrain ?",
    ["4", "5", "6", "7"],
    1,
    1,
  ),
  vraiFaux("sp-09", "Au tennis, il faut au minimum six jeux pour gagner un set.", true, 2),
  choix(
    "sp-10",
    "Quelle couleur de maillot porte le leader du Tour de France ?",
    ["Vert", "Jaune", "Blanc", "À pois rouges"],
    1,
    1,
  ),
  nombre("sp-11", "Combien de trous compte un parcours de golf complet ?", 18, 0, 1),
  choix(
    "sp-12",
    "Quel sport se pratique sur un tatami ?",
    ["L'escrime", "Le judo", "Le tir à l'arc", "Le squash"],
    1,
    1,
  ),
  vraiFaux("sp-13", "Le badminton se joue avec un volant.", true, 1),
  choix(
    "sp-14",
    "Dans quelle discipline décerne-t-on le Ballon d'or ?",
    ["Le football", "Le basket", "Le handball", "Le volley"],
    0,
    1,
  ),
  sondage("sp-15", "Le sport, vous préférez…", [
    "Le pratiquer",
    "Le regarder",
    "Les deux",
    "Ni l'un ni l'autre",
  ]),
  sondage("sp-16", "Votre sport de canapé préféré ?", [
    "Le football",
    "Le rugby",
    "Le tennis",
    "Les Jeux olympiques",
  ]),
  nombre(
    "sp-17",
    "Combien de joueurs une équipe de rugby à XV aligne-t-elle sur le terrain ?",
    15,
    0,
    1,
  ),
  choix(
    "sp-18",
    "Dans quel pays se déroule le tournoi de Wimbledon ?",
    ["En France", "En Angleterre", "Aux États-Unis", "En Australie"],
    1,
    1,
  ),
  libre(
    "sp-19",
    "Quel sport se joue sur la terre battue de Roland-Garros ?",
    ["tennis", "le tennis"],
    1,
  ),
  pronostic("sp-20", "Qui finira premier de notre classement ce soir ?", [
    "Moi",
    "Mon voisin de table",
    "La personne la plus discrète",
    "Suspense complet",
  ]),
]);

// ────────────────────────────────────────────────────────────
// Cuisine & gastronomie
// ────────────────────────────────────────────────────────────

const CUISINE = lot("cuisine", [
  choix(
    "cu-01",
    "Quel ingrédient donne sa couleur verte au pesto ?",
    ["Le persil", "Le basilic", "L'épinard", "La menthe"],
    1,
    1,
  ),
  vraiFaux("cu-02", "La tomate est botaniquement un fruit.", true, 2),
  choix(
    "cu-03",
    "De quelle région vient la tartiflette ?",
    ["La Savoie", "La Bretagne", "L'Alsace", "Le Périgord"],
    0,
    1,
  ),
  libre(
    "cu-04",
    "Quel fromage entre traditionnellement dans une tartiflette ?",
    ["reblochon", "le reblochon"],
    2,
  ),
  nombre("cu-05", "Combien de minutes cuit un œuf à la coque ?", 3, 1, 1),
  choix(
    "cu-06",
    "Quelle épice donne sa couleur jaune au curry ?",
    ["Le paprika", "Le curcuma", "Le safran", "Le cumin"],
    1,
    2,
  ),
  choix(
    "cu-07",
    "Quelle pâte sert à faire des choux à la crème ?",
    ["La pâte brisée", "La pâte à choux", "La pâte feuilletée", "La pâte sablée"],
    1,
    1,
  ),
  vraiFaux(
    "cu-08",
    "Un vin ne peut porter le nom de champagne que s'il vient de Champagne.",
    true,
    1,
  ),
  choix(
    "cu-09",
    "Quel est l'ingrédient principal du houmous ?",
    ["Le pois chiche", "La lentille", "Le haricot blanc", "La fève"],
    0,
    2,
  ),
  libre(
    "cu-10",
    "Comment appelle-t-on le plat de riz espagnol au safran ?",
    ["paella", "la paella"],
    1,
  ),
  choix(
    "cu-11",
    "De quel pays le sushi est-il originaire ?",
    ["La Chine", "Le Japon", "La Corée", "Le Vietnam"],
    1,
    1,
  ),
  nombre("cu-12", "À quelle température l'eau bout-elle au niveau de la mer ?", 100, 0, 1),
  choix(
    "cu-13",
    "Quel fruit est à la base du guacamole ?",
    ["La courgette", "L'avocat", "Le concombre", "La tomate verte"],
    1,
    1,
  ),
  vraiFaux("cu-14", "Le safran est l'épice la plus chère au monde.", true, 2),
  sondage("cu-15", "Sucré ou salé au petit-déjeuner ?", [
    "Sucré",
    "Salé",
    "Les deux",
    "Rien du tout",
  ]),
  sondage("cu-16", "L'ananas sur la pizza : pour ou contre ?", [
    "Pour, sans hésiter",
    "Contre, fermement",
    "Sans avis",
  ]),
  choix(
    "cu-17",
    "Quelle est la base d'une sauce béchamel ?",
    [
      "Beurre, farine et lait",
      "Œuf, huile et moutarde",
      "Crème et vin blanc",
      "Tomate et oignon",
    ],
    0,
    2,
  ),
  libre(
    "cu-18",
    "Quel légume fait pleurer quand on le coupe ?",
    ["oignon", "l'oignon"],
    1,
  ),
  choix(
    "cu-19",
    "De quelle ville italienne la sauce bolognaise tire-t-elle son nom ?",
    ["Naples", "Bologne", "Rome", "Milan"],
    1,
    1,
  ),
  choix(
    "cu-20",
    "Quelle pâtisserie française est faite de deux coques et d'une ganache ?",
    ["Le macaron", "L'éclair", "Le mille-feuille", "Le paris-brest"],
    0,
    1,
  ),
]);

// ────────────────────────────────────────────────────────────
// Histoire
// ────────────────────────────────────────────────────────────

const HISTOIRE = lot("histoire", [
  nombre("hi-01", "En quelle année a débuté la Révolution française ?", 1789, 0, 1),
  choix(
    "hi-02",
    "Qui fut le premier empereur des Français ?",
    ["Louis XVI", "Napoléon Bonaparte", "Charlemagne", "Louis XIV"],
    1,
    1,
  ),
  vraiFaux("hi-03", "La Seconde Guerre mondiale s'est terminée en 1945.", true, 1),
  choix(
    "hi-04",
    "Quel roi de France est surnommé le Roi-Soleil ?",
    ["Louis XIII", "Louis XIV", "Louis XV", "François Ier"],
    1,
    1,
  ),
  nombre("hi-05", "En quelle année le mur de Berlin est-il tombé ?", 1989, 0, 2),
  libre(
    "hi-06",
    "Quelle civilisation a construit les pyramides de Gizeh ?",
    ["egyptiens", "les egyptiens", "egypte", "l'egypte antique"],
    1,
  ),
  choix(
    "hi-07",
    "Qui a écrit « Du contrat social » ?",
    ["Voltaire", "Jean-Jacques Rousseau", "Montesquieu", "Diderot"],
    1,
    3,
  ),
  vraiFaux("hi-08", "Jeanne d'Arc a été brûlée à Rouen.", true, 2),
  choix(
    "hi-09",
    "Quel empire antique avait Rome pour capitale ?",
    ["L'Empire perse", "L'Empire romain", "L'Empire ottoman", "L'Empire byzantin"],
    1,
    1,
  ),
  nombre(
    "hi-10",
    "En quelle année un homme a-t-il marché sur la Lune pour la première fois ?",
    1969,
    0,
    1,
  ),
  choix(
    "hi-11",
    "Quelle reine de France a été guillotinée en 1793 ?",
    [
      "Catherine de Médicis",
      "Marie-Antoinette",
      "Anne d'Autriche",
      "Blanche de Castille",
    ],
    1,
    2,
  ),
  libre(
    "hi-12",
    "Quel monument parisien a été bâti pour l'Exposition universelle de 1889 ?",
    ["tour eiffel", "la tour eiffel"],
    1,
  ),
  choix(
    "hi-13",
    "Quel événement du 14 juillet 1789 ouvre la Révolution française ?",
    [
      "Le sacre de Napoléon",
      "La prise de la Bastille",
      "La bataille de Waterloo",
      "La nuit du 4 août",
    ],
    1,
    1,
  ),
  vraiFaux("hi-14", "Christophe Colomb a atteint l'Amérique en 1492.", true, 1),
  sondage("hi-15", "Quelle époque auriez-vous aimé visiter ?", [
    "L'Antiquité",
    "Le Moyen Âge",
    "La Renaissance",
    "Les Années folles",
  ]),
  choix(
    "hi-16",
    "Quel pays a offert la statue de la Liberté aux États-Unis ?",
    ["Le Royaume-Uni", "La France", "L'Espagne", "Les Pays-Bas"],
    1,
    1,
  ),
  nombre("hi-17", "Combien d'années a duré la guerre de Cent Ans ?", 116, 5, 3),
  choix(
    "hi-18",
    "Qui a lancé l'Appel du 18 Juin 1940 ?",
    ["Philippe Pétain", "Charles de Gaulle", "Jean Moulin", "Georges Clemenceau"],
    1,
    1,
  ),
  vraiFaux("hi-19", "Le Titanic a coulé lors de son voyage inaugural.", true, 1),
  choix(
    "hi-20",
    "Quelle ville romaine le Vésuve a-t-il ensevelie en l'an 79 ?",
    ["Pompéi", "Florence", "Vérone", "Sienne"],
    0,
    2,
  ),
]);

// ────────────────────────────────────────────────────────────
// Géographie
// ────────────────────────────────────────────────────────────

const GEOGRAPHIE = lot("geographie", [
  choix(
    "ge-01",
    "Quel est le plus long fleuve de France ?",
    ["La Seine", "La Loire", "Le Rhône", "La Garonne"],
    1,
    1,
  ),
  libre("ge-02", "Quelle est la capitale de l'Italie ?", ["rome"], 1),
  nombre("ge-03", "Combien de pays composent l'Union européenne ?", 27, 0, 2),
  choix(
    "ge-04",
    "Quel est le plus grand désert chaud du monde ?",
    ["Le Gobi", "Le Sahara", "L'Atacama", "Le Kalahari"],
    1,
    1,
  ),
  vraiFaux("ge-05", "L'Islande est une île.", true, 1),
  choix(
    "ge-06",
    "Quelle mer borde la ville de Nice ?",
    ["La mer du Nord", "La Méditerranée", "L'Atlantique", "La Manche"],
    1,
    1,
  ),
  libre("ge-07", "Quelle est la capitale du Portugal ?", ["lisbonne"], 1),
  choix(
    "ge-08",
    "Quel pays a la forme d'une botte ?",
    ["L'Espagne", "L'Italie", "La Grèce", "La Croatie"],
    1,
    1,
  ),
  nombre("ge-09", "Combien d'océans compte-t-on aujourd'hui sur Terre ?", 5, 0, 2),
  choix(
    "ge-10",
    "Quelle chaîne de montagnes sépare la France de l'Espagne ?",
    ["Les Alpes", "Les Pyrénées", "Le Jura", "Les Vosges"],
    1,
    1,
  ),
  vraiFaux("ge-11", "Le Nil traverse l'Égypte.", true, 1),
  choix(
    "ge-12",
    "Quel est le plus grand pays du monde par superficie ?",
    ["Le Canada", "La Russie", "La Chine", "Les États-Unis"],
    1,
    1,
  ),
  libre("ge-13", "Quelle est la capitale de l'Espagne ?", ["madrid"], 1),
  choix(
    "ge-14",
    "Dans quel pays se trouve le Machu Picchu ?",
    ["Le Chili", "Le Pérou", "La Bolivie", "L'Équateur"],
    1,
    2,
  ),
  sondage("ge-15", "Vos vacances idéales ?", [
    "La mer",
    "La montagne",
    "La ville",
    "La campagne",
  ]),
  choix(
    "ge-16",
    "Quel océan sépare l'Europe de l'Amérique ?",
    ["Le Pacifique", "L'Atlantique", "L'Indien", "L'Arctique"],
    1,
    1,
  ),
  nombre("ge-17", "Combien de départements compte la France, outre-mer compris ?", 101, 0, 3),
  choix(
    "ge-18",
    "Quelle capitale la Tamise traverse-t-elle ?",
    ["Dublin", "Londres", "Édimbourg", "Manchester"],
    1,
    1,
  ),
  vraiFaux("ge-19", "L'Australie est à la fois un pays et un continent.", true, 2),
  choix(
    "ge-20",
    "Quel est le pays le plus peuplé de l'Union européenne ?",
    ["La France", "L'Allemagne", "L'Italie", "L'Espagne"],
    1,
    2,
  ),
]);

// ────────────────────────────────────────────────────────────
// Sciences & nature
// ────────────────────────────────────────────────────────────

const SCIENCES = lot("sciences", [
  choix(
    "sc-01",
    "Quel gaz les plantes absorbent-elles pour la photosynthèse ?",
    ["L'oxygène", "Le dioxyde de carbone", "L'azote", "L'hydrogène"],
    1,
    1,
  ),
  nombre("sc-02", "Combien de planètes compte le système solaire ?", 8, 0, 1),
  vraiFaux("sc-03", "L'eau gèle à 0 °C au niveau de la mer.", true, 1),
  choix(
    "sc-04",
    "Quel est le symbole chimique de l'or ?",
    ["Ag", "Au", "Fe", "Or"],
    1,
    2,
  ),
  libre("sc-05", "Quelle planète est la plus proche du Soleil ?", ["mercure"], 1),
  choix(
    "sc-06",
    "Quel organe pompe le sang dans le corps ?",
    ["Le foie", "Le cœur", "Les poumons", "L'estomac"],
    1,
    1,
  ),
  nombre("sc-07", "Combien d'os compte le corps humain adulte ?", 206, 4, 3),
  vraiFaux("sc-08", "La lumière voyage plus vite que le son.", true, 1),
  choix(
    "sc-09",
    "Qui a formulé la théorie de la relativité ?",
    ["Isaac Newton", "Albert Einstein", "Galilée", "Niels Bohr"],
    1,
    1,
  ),
  choix(
    "sc-10",
    "Quel est le métal le plus abondant de la croûte terrestre ?",
    ["Le fer", "L'aluminium", "Le cuivre", "Le zinc"],
    1,
    3,
  ),
  libre(
    "sc-11",
    "Quel gaz de l'air nous est indispensable pour respirer ?",
    ["oxygene", "l'oxygene", "dioxygene"],
    1,
  ),
  choix(
    "sc-12",
    "Combien de chromosomes possède l'être humain ?",
    ["23", "46", "64", "92"],
    1,
    2,
  ),
  vraiFaux("sc-13", "Le diamant est composé de carbone.", true, 2),
  nombre("sc-14", "Quelle est la température normale du corps humain, en °C ?", 37, 0.5, 1),
  sondage("sc-15", "Quelle invention vous manquerait le plus ?", [
    "Internet",
    "L'électricité",
    "La voiture",
    "Le réfrigérateur",
  ]),
  choix(
    "sc-16",
    "Quelle force retient la Lune en orbite autour de la Terre ?",
    ["Le magnétisme", "La gravité", "L'électricité statique", "La pression"],
    1,
    1,
  ),
  choix(
    "sc-17",
    "Quel astre est le plus proche de la Terre ?",
    ["Le Soleil", "La Lune", "Mars", "Vénus"],
    1,
    1,
  ),
  libre(
    "sc-18",
    "Quelle scientifique a découvert le radium avec son mari Pierre ?",
    ["marie curie", "curie"],
    2,
  ),
  vraiFaux("sc-19", "Une année-lumière mesure une distance, pas une durée.", true, 2),
  choix(
    "sc-20",
    "Quel appareil mesure la pression atmosphérique ?",
    ["Le thermomètre", "Le baromètre", "L'hygromètre", "L'anémomètre"],
    1,
    2,
  ),
]);

// ────────────────────────────────────────────────────────────
// Animaux
// ────────────────────────────────────────────────────────────

const ANIMAUX = lot("animaux", [
  choix(
    "an-01",
    "Quel est l'animal terrestre le plus rapide ?",
    ["Le lion", "Le guépard", "L'antilope", "Le cheval"],
    1,
    1,
  ),
  vraiFaux("an-02", "Le dauphin est un mammifère.", true, 1),
  nombre("an-03", "Combien de pattes a une araignée ?", 8, 0, 1),
  choix(
    "an-04",
    "Quel est le plus grand animal du monde ?",
    ["L'éléphant", "La baleine bleue", "Le requin-baleine", "La girafe"],
    1,
    1,
  ),
  libre("an-05", "Comment appelle-t-on le petit de la vache ?", ["veau", "le veau"], 1),
  choix(
    "an-06",
    "Quel animal peut dormir debout ?",
    ["Le chat", "Le cheval", "Le lapin", "Le chien"],
    1,
    2,
  ),
  vraiFaux("an-07", "Les manchots vivent au pôle Sud, jamais au pôle Nord.", true, 2),
  choix("an-08", "Combien de cœurs possède une pieuvre ?", ["1", "2", "3", "4"], 2, 3),
  libre(
    "an-09",
    "Quel oiseau ne vole pas et vit en Antarctique ?",
    ["manchot", "le manchot"],
    2,
  ),
  nombre("an-10", "Combien de bosses a un dromadaire ?", 1, 0, 1),
  choix(
    "an-11",
    "Quel animal figure sur le logo du WWF ?",
    ["Le tigre", "Le panda", "Le loup", "L'ours polaire"],
    1,
    1,
  ),
  vraiFaux("an-12", "L'abeille meurt après avoir piqué un humain.", true, 2),
  choix(
    "an-13",
    "Quel est le plus grand félin sauvage ?",
    ["Le lion", "Le tigre", "Le jaguar", "Le léopard"],
    1,
    2,
  ),
  libre(
    "an-14",
    "Comment appelle-t-on un groupe de loups ?",
    ["meute", "une meute", "la meute"],
    2,
  ),
  sondage("an-15", "Team chien ou team chat ?", [
    "Chien",
    "Chat",
    "Les deux",
    "Ni l'un ni l'autre",
  ]),
  choix(
    "an-16",
    "Quel insecte produit le miel ?",
    ["La guêpe", "L'abeille", "Le bourdon", "La fourmi"],
    1,
    1,
  ),
  nombre("an-17", "Combien de mois dure la gestation d'une éléphante ?", 22, 2, 3),
  choix(
    "an-18",
    "De quoi le koala se nourrit-il principalement ?",
    ["De bambou", "D'eucalyptus", "D'herbe", "De fruits"],
    1,
    2,
  ),
  vraiFaux(
    "an-19",
    "La girafe a le même nombre de vertèbres cervicales que l'être humain.",
    true,
    3,
  ),
  choix(
    "an-20",
    "Quel reptile change de couleur pour se camoufler ?",
    ["Le caméléon", "Le gecko", "L'iguane", "Le varan"],
    0,
    1,
  ),
]);

// ────────────────────────────────────────────────────────────
// La France
// ────────────────────────────────────────────────────────────

const FRANCE = lot("france", [
  choix(
    "fr-01",
    "Quelle est la devise de la République française ?",
    [
      "Liberté, Égalité, Fraternité",
      "Travail, Famille, Patrie",
      "Un pour tous, tous pour un",
      "Honneur et Patrie",
    ],
    0,
    1,
  ),
  libre("fr-02", "Quel fleuve traverse Paris ?", ["seine", "la seine"], 1),
  nombre("fr-03", "Combien de régions compte la France métropolitaine ?", 13, 0, 2),
  choix(
    "fr-04",
    "Quelle ville est surnommée la capitale des Gaules ?",
    ["Marseille", "Lyon", "Bordeaux", "Toulouse"],
    1,
    2,
  ),
  vraiFaux(
    "fr-05",
    "Le mont Blanc est le plus haut sommet d'Europe occidentale.",
    true,
    1,
  ),
  choix(
    "fr-06",
    "Dans quelle ville se trouve le palais des Papes ?",
    ["Avignon", "Arles", "Nîmes", "Orange"],
    0,
    2,
  ),
  libre(
    "fr-07",
    "Quelle ville française accueille le Parlement européen ?",
    ["strasbourg"],
    2,
  ),
  choix(
    "fr-08",
    "Quel département porte le numéro 75 ?",
    ["Paris", "Le Rhône", "Le Nord", "Les Bouches-du-Rhône"],
    0,
    1,
  ),
  vraiFaux("fr-09", "La Guyane est le plus grand département français.", true, 3),
  choix(
    "fr-10",
    "Dans quelle région produit-on le vin de Bordeaux ?",
    ["La Nouvelle-Aquitaine", "L'Occitanie", "La Bourgogne", "La Provence"],
    0,
    1,
  ),
  nombre("fr-11", "Combien d'étoiles figurent sur le drapeau européen ?", 12, 0, 2),
  choix(
    "fr-12",
    "Quel château de la Loire est célèbre pour son escalier à double révolution ?",
    ["Chenonceau", "Chambord", "Amboise", "Blois"],
    1,
    3,
  ),
  libre(
    "fr-13",
    "Quelle est la plus haute montagne de France ?",
    ["mont blanc", "le mont blanc"],
    1,
  ),
  choix(
    "fr-14",
    "Quelle ville française est célèbre pour ses calanques ?",
    ["Nice", "Marseille", "Toulon", "Cannes"],
    1,
    2,
  ),
  sondage("fr-15", "Votre spécialité française préférée ?", [
    "Le fromage",
    "La baguette",
    "Le vin",
    "Les pâtisseries",
  ]),
  choix(
    "fr-16",
    "Quelle mer borde la Bretagne au nord ?",
    ["La Méditerranée", "La Manche", "La mer du Nord", "La mer Baltique"],
    1,
    2,
  ),
  vraiFaux("fr-17", "Le TGV est un train à grande vitesse français.", true, 1),
  choix(
    "fr-18",
    "Quel animal est un emblème traditionnel de la France ?",
    ["Le lion", "Le coq", "L'aigle", "L'ours"],
    1,
    1,
  ),
  nombre("fr-19", "Combien de mètres mesure la tour Eiffel, antennes comprises ?", 330, 10, 3),
  choix(
    "fr-20",
    "Quelle ville française est surnommée « la ville rose » ?",
    ["Toulouse", "Montpellier", "Perpignan", "Albi"],
    0,
    2,
  ),
]);

// ────────────────────────────────────────────────────────────
// Années 80-90
// ────────────────────────────────────────────────────────────

const RETRO = lot("retro", [
  choix(
    "re-01",
    "Quel jeu vidéo met en scène un plombier moustachu ?",
    ["Sonic", "Super Mario", "Zelda", "Pac-Man"],
    1,
    1,
  ),
  vraiFaux("re-02", "Le Rubik's Cube a été inventé dans les années 1970.", true, 2),
  choix(
    "re-03",
    "Quel appareil permettait d'écouter des cassettes en marchant, dans les années 80 ?",
    ["Le Walkman", "L'iPod", "Le Discman", "Le transistor"],
    0,
    1,
  ),
  libre(
    "re-04",
    "Quel casse-tête coloré à faire tourner a été inventé par Ernő Rubik ?",
    ["rubik s cube", "rubiks cube", "cube de rubik", "le rubik s cube"],
    2,
  ),
  choix(
    "re-05",
    "Quelle console portable Nintendo est sortie en 1989 ?",
    ["La Game Boy", "La Game Gear", "La Nintendo DS", "La PSP"],
    0,
    2,
  ),
  choix(
    "re-06",
    "Quel duo britannique chantait « Wake Me Up Before You Go-Go » ?",
    ["Wham!", "Duran Duran", "A-ha", "Tears for Fears"],
    0,
    3,
  ),
  vraiFaux("re-07", "Le premier épisode des Simpson a été diffusé en 1989.", true, 3),
  choix(
    "re-08",
    "Quel film de 1985 met en scène une DeLorean qui voyage dans le temps ?",
    ["Retour vers le futur", "Terminator", "Blade Runner", "Tron"],
    0,
    1,
  ),
  libre(
    "re-09",
    "Quel format de cassette vidéo lisait-on dans un magnétoscope ?",
    ["vhs", "la vhs", "cassette vhs"],
    2,
  ),
  choix(
    "re-10",
    "Quel personnage jaune avale des pac-gommes en évitant des fantômes ?",
    ["Pac-Man", "Donkey Kong", "Q*bert", "Frogger"],
    0,
    1,
  ),
  nombre("re-11", "En quelle année la Game Boy est-elle sortie ?", 1989, 1, 3),
  choix(
    "re-12",
    "Quel service français permettait de consulter l'annuaire sur un petit écran, avant Internet ?",
    ["Le Minitel", "Le télex", "Le fax", "Le bipeur"],
    0,
    2,
  ),
  vraiFaux("re-13", "Le premier iPhone est sorti dans les années 90.", false, 2),
  choix(
    "re-14",
    "Quel groupe suédois chantait « Dancing Queen » ?",
    ["ABBA", "Roxette", "Europe", "Ace of Base"],
    0,
    2,
  ),
  sondage("re-15", "Quelle décennie a votre préférence ?", [
    "Les années 80",
    "Les années 90",
    "Les années 2000",
    "Aujourd'hui",
  ]),
  choix(
    "re-16",
    "Quel jouet des années 90 consistait à élever une créature virtuelle sur un porte-clés ?",
    ["Le Tamagotchi", "Le Furby", "Le Bop It", "Le Game & Watch"],
    0,
    2,
  ),
  libre(
    "re-17",
    "Quel disque numérique a remplacé le vinyle dans les années 80 ?",
    ["cd", "le cd", "compact disc"],
    1,
  ),
  choix(
    "re-18",
    "Quelle série met en scène des sauveteurs en maillot rouge sur une plage californienne ?",
    ["Alerte à Malibu", "Beverly Hills", "Hélène et les garçons", "Melrose Place"],
    0,
    2,
  ),
  vraiFaux("re-19", "Le World Wide Web a été inventé au CERN.", true, 3),
  choix(
    "re-20",
    "Quel personnage bleu court très vite dans les jeux SEGA ?",
    ["Sonic", "Crash Bandicoot", "Rayman", "Bomberman"],
    0,
    1,
  ),
]);

// ────────────────────────────────────────────────────────────
// Fêtes & traditions
// ────────────────────────────────────────────────────────────

const FETES = lot("fetes", [
  choix(
    "fe-01",
    "Quelle fête célèbre-t-on le 31 octobre ?",
    ["Noël", "Halloween", "La Toussaint", "Le Nouvel An"],
    1,
    1,
  ),
  nombre("fe-02", "Quel jour de décembre fête-t-on Noël ?", 25, 0, 1),
  vraiFaux("fe-03", "La galette des Rois se mange au mois de janvier.", true, 1),
  choix(
    "fe-04",
    "Que cache-t-on dans la galette des Rois ?",
    ["Une pièce", "Une fève", "Une amande", "Un bonbon"],
    1,
    1,
  ),
  libre(
    "fe-05",
    "Quelle fête française a lieu le 14 juillet ?",
    ["fete nationale", "la fete nationale", "14 juillet", "le 14 juillet"],
    2,
  ),
  choix(
    "fe-06",
    "Quelle couleur est associée à la Saint-Patrick ?",
    ["Le rouge", "Le vert", "Le bleu", "Le doré"],
    1,
    1,
  ),
  vraiFaux("fe-07", "Le poisson d'avril se fête le 1er avril.", true, 1),
  choix(
    "fe-08",
    "Quel animal apporte les œufs de Pâques en Alsace et en Allemagne ?",
    ["La poule", "Le lapin", "La cloche", "Le renard"],
    1,
    2,
  ),
  nombre("fe-09", "Combien de bougies compte une couronne de l'Avent ?", 4, 0, 2),
  choix(
    "fe-10",
    "Quelle soirée marque le passage à la nouvelle année ?",
    ["La Chandeleur", "Le réveillon du Nouvel An", "L'Épiphanie", "Mardi gras"],
    1,
    1,
  ),
  libre(
    "fe-11",
    "Quelle pâtisserie mange-t-on à la Chandeleur ?",
    ["crepes", "des crepes", "la crepe", "les crepes"],
    1,
  ),
  choix(
    "fe-12",
    "Quel jour férié français commémore l'armistice de 1918 ?",
    ["Le 8 mai", "Le 11 novembre", "Le 1er mai", "Le 14 juillet"],
    1,
    2,
  ),
  vraiFaux("fe-13", "La Fête de la Musique a lieu le 21 juin en France.", true, 2),
  choix(
    "fe-14",
    "Quelle fête précède le début du carême ?",
    ["Mardi gras", "La Toussaint", "L'Épiphanie", "La Pentecôte"],
    0,
    2,
  ),
  sondage("fe-15", "Votre fête préférée de l'année ?", [
    "Noël",
    "Le Nouvel An",
    "Halloween",
    "Mon anniversaire",
  ]),
  choix(
    "fe-16",
    "Quel personnage distribue les cadeaux dans la nuit de Noël ?",
    ["Le Père Noël", "Saint Nicolas", "Le Père Fouettard", "La Befana"],
    0,
    1,
  ),
  sondage("fe-17", "Les cadeaux de Noël, vous les ouvrez…", [
    "Le 24 au soir",
    "Le 25 au matin",
    "Ça dépend des années",
  ]),
  choix(
    "fe-18",
    "Quelle fleur offre-t-on traditionnellement le 1er mai en France ?",
    ["La rose", "Le muguet", "La tulipe", "Le lilas"],
    1,
    1,
  ),
  vraiFaux("fe-19", "En France, le muguet du 1er mai est censé porter bonheur.", true, 1),
  pronostic("fe-20", "Qui portera le plus beau toast de la soirée ?", [
    "Moi",
    "L'organisateur",
    "Le plus timide de la table",
    "On verra bien",
  ]),
]);

// ────────────────────────────────────────────────────────────
// Le catalogue complet
// ────────────────────────────────────────────────────────────

/**
 * TOUTES les questions de la banque, tous thèmes confondus. L'ordre de
 * déclaration n'a AUCUNE portée : le générateur mélange à partir d'une graine
 * et répartit par thème.
 */
export const BANQUE_QUESTIONS: readonly QuestionBanque[] = [
  ...CULTURE_GENERALE,
  ...CINEMA,
  ...MUSIQUE,
  ...SPORT,
  ...CUISINE,
  ...HISTOIRE,
  ...GEOGRAPHIE,
  ...SCIENCES,
  ...ANIMAUX,
  ...FRANCE,
  ...RETRO,
  ...FETES,
];
