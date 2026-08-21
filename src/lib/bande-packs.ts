/**
 * LES PACKS DE QUESTIONS DU PORTRAIT DE LA BANDE (L18).
 *
 * ── POURQUOI CE CONTENU EST ÉCRIT ICI, ET PAS SAISI PAR LE COMMERÇANT ──
 *
 * Le cahier l'exige (`docs/lastchance-reserver.md`) : « le commerçant choisit un
 * pack validé […] mais ne rédige pas librement les questions au MVP ». La raison
 * n'est pas la commodité : une question posée à une tablée est lue par des gens
 * qui ne l'ont pas choisie, sur un écran qui porte le nom du commerce. Un champ
 * de texte libre aurait fait de ce jeu un mégaphone dont personne ne répond.
 *
 * Les packs vivent donc en TypeScript, versionnés, relus, et la base ne connaît
 * que leur CLÉ (motif `campaign-templates.ts` : le contenu de plateforme est du
 * code, pas des lignes de table). Une question retirée ici disparaît des parties
 * suivantes sans migration ; une partie déjà jouée garde la sienne, parce que le
 * tour a copié son texte.
 *
 * ── LES EXCLUSIONS SONT DES RÈGLES, PAS DES INTENTIONS ──
 *
 * Interdits par le cahier, et vérifiés par `bande-packs.test.ts` : le corps, la
 * santé, l'âge, la sexualité, la religion, la politique, l'argent, et toute
 * formulation qui désigne quelqu'un par un défaut qu'il ne choisit pas. Le test
 * ne peut pas juger le goût — il tient la liste des mots qui n'ont rien à faire
 * dans une salle de restaurant, et il rougit si l'un d'eux entre.
 *
 * ── LA TONALITÉ PAR DÉFAUT EST POSITIVE, ET LE TAQUIN SE CHOISIT ──
 *
 * Quatre packs de circonstance (`amis`, `duo`, `equipe`, `anniversaire`) sont
 * écrits pour qu'être nommé fasse plaisir. Le cinquième (`taquin`) moque des
 * travers UNIVERSELS — perdre ses clés, hésiter dix minutes sur une carte — et
 * jamais une personne pour ce qu'elle est. Il ne s'active que si le commerçant
 * le choisit explicitement : c'est la différence entre une équipe qui rit d'elle
 * même et une salle où quelqu'un découvre qu'on rit de lui.
 *
 * ── DOUZE QUESTIONS PAR PACK, CINQ À HUIT PAR PARTIE ──
 *
 * Le cahier fixe la partie à « 5 à 8 questions ». Douze laissent de quoi tirer
 * sans répéter deux soirées de suite, et restent relisibles d'un coup d'œil par
 * qui veut vérifier ce que son commerce va poser à ses clients.
 */

/** Une question, et la clé stable qui la désigne dans un tour joué. */
export interface BandeQuestion {
  /** Stable : elle est copiée dans le tour, elle ne doit jamais être réutilisée
   *  pour un autre texte. */
  readonly cle: string;
  readonly texte: string;
}

export type BandeTonalite = "positif" | "taquin";

export interface BandePack {
  readonly cle: string;
  readonly nom: string;
  readonly tonalite: BandeTonalite;
  /** Ce que le commerçant lit avant de choisir — la promesse faite à sa salle. */
  readonly description: string;
  readonly questions: readonly BandeQuestion[];
}

/**
 * ENTRE AMIS — le pack par défaut.
 *
 * Il est le défaut parce qu'il marche sans contexte : une tablée qui ne s'est
 * pas vue depuis un mois y répond aussi bien qu'un groupe qui se voit tous les
 * jours. Chaque question a une réponse dont on est CONTENT.
 */
const PACK_AMIS: BandePack = {
  cle: "amis",
  nom: "Entre amis",
  tonalite: "positif",
  description:
    "Le pack de tous les jours : douze questions qui font plaisir à celui ou celle qu'on nomme.",
  questions: [
    { cle: "amis-histoires", texte: "Qui raconte les meilleures histoires ?" },
    { cle: "amis-sortie", texte: "Qui propose toujours la sortie du samedi ?" },
    { cle: "amis-repond", texte: "Qui répond le plus vite aux messages ?" },
    { cle: "amis-adresse", texte: "Qui connaît la meilleure adresse du quartier ?" },
    { cle: "amis-rire", texte: "Qui a le rire le plus reconnaissable ?" },
    { cle: "amis-calme", texte: "Qui garde son calme quand tout part de travers ?" },
    { cle: "amis-playlist", texte: "Qui met la musique que tout le monde reprend ?" },
    { cle: "amis-avance", texte: "Qui arrive toujours en avance ?" },
    { cle: "amis-conseil", texte: "Qui donne les conseils qu'on suit vraiment ?" },
    { cle: "amis-attention", texte: "Qui remarque en premier que quelqu'un ne va pas bien ?" },
    { cle: "amis-projets", texte: "Qui a le plus de projets en cours ?" },
    { cle: "amis-partage", texte: "Qui apporte quelque chose à partager sans qu'on demande ?" },
  ],
};

/**
 * EN DUO — deux personnes, donc une réponse sur deux.
 *
 * À deux, la statistique n'existe plus : chaque question est un pile ou face
 * qui dit quelque chose. Les questions sont donc écrites pour que LES DEUX
 * réponses soient flatteuses — « qui parle le plus » amuse celui qui parle et
 * celui qui écoute.
 */
const PACK_DUO: BandePack = {
  cle: "duo",
  nom: "En duo",
  tonalite: "positif",
  description:
    "Pour une table de deux : douze questions où les deux réponses font sourire.",
  questions: [
    { cle: "duo-table", texte: "Qui a choisi cette table ?" },
    { cle: "duo-parle", texte: "Qui parle le plus des deux ?" },
    { cle: "duo-dessert", texte: "Qui décidera du dessert ?" },
    { cle: "duo-sortie", texte: "Qui a proposé cette sortie ?" },
    { cle: "duo-photos", texte: "Qui prend le plus de photos ?" },
    { cle: "duo-carte", texte: "Qui connaît le mieux la carte ?" },
    { cle: "duo-assiette", texte: "Qui goûte dans l'assiette de l'autre ?" },
    { cle: "duo-telephone", texte: "Qui range son téléphone en premier ?" },
    { cle: "duo-anecdote", texte: "Qui a la meilleure anecdote de la semaine ?" },
    { cle: "duo-memoire", texte: "Qui se souvient des détails que l'autre oublie ?" },
    { cle: "duo-revenir", texte: "Qui proposera de revenir ici ?" },
    { cle: "duo-merci", texte: "Qui remercie le plus souvent le service ?" },
  ],
};

/**
 * ÉQUIPE — le repas d'équipe, et ce qui s'y dit sans se dire.
 *
 * Le piège de ce pack est l'évaluation : « qui travaille le mieux » n'a rien à
 * faire dans un restaurant, et transformerait un déjeuner en entretien annuel.
 * Les questions portent donc sur des GESTES, jamais sur une performance.
 */
const PACK_EQUIPE: BandePack = {
  cle: "equipe",
  nom: "Équipe",
  tonalite: "positif",
  description:
    "Pour un repas d'équipe : douze questions sur des gestes, jamais sur des résultats.",
  questions: [
    { cle: "equipe-question", texte: "Qui pose la question que tout le monde avait en tête ?" },
    { cle: "equipe-solution", texte: "Qui trouve la sortie quand ça coince ?" },
    { cle: "equipe-felicite", texte: "Qui pense à féliciter les autres ?" },
    { cle: "equipe-clair", texte: "Qui explique le plus clairement ?" },
    { cle: "equipe-pause", texte: "Qui propose la pause au bon moment ?" },
    { cle: "equipe-connait", texte: "Qui connaît tout le monde dans le bâtiment ?" },
    { cle: "equipe-notes", texte: "Qui prend les notes que tout le monde relit ?" },
    { cle: "equipe-ose", texte: "Qui ose dire qu'une idée ne marchera pas ?" },
    { cle: "equipe-service", texte: "Qui rend service sans que ça se voie ?" },
    { cle: "equipe-appris", texte: "Qui a le plus appris cette année ?" },
    { cle: "equipe-accueil", texte: "Qui accueille le mieux les nouveaux ?" },
    { cle: "equipe-cafe", texte: "Qui lance la machine à café pour les autres ?" },
  ],
};

/**
 * ANNIVERSAIRE — et la personne fêtée n'est pas la cible.
 *
 * Un pack d'anniversaire qui ne parlerait que du héros du jour ferait de tous
 * les autres des spectateurs. Les questions visent LA TABLÉE, avec le héros
 * comme point de repère commun.
 */
const PACK_ANNIVERSAIRE: BandePack = {
  cle: "anniversaire",
  nom: "Anniversaire",
  tonalite: "positif",
  description:
    "Pour une table qui fête quelqu'un : douze questions sur la tablée, pas seulement sur le héros du jour.",
  questions: [
    { cle: "anniv-idee", texte: "Qui a eu l'idée de cette soirée ?" },
    { cle: "anniv-lieu", texte: "Qui a choisi le lieu ?" },
    { cle: "anniv-discours", texte: "Qui fera le discours dont on se souviendra ?" },
    { cle: "anniv-cadeau", texte: "Qui offre les cadeaux les plus réfléchis ?" },
    { cle: "anniv-connait", texte: "Qui connaît le héros du jour depuis le plus longtemps ?" },
    { cle: "anniv-anecdote", texte: "Qui a la meilleure anecdote à raconter sur lui ou elle ?" },
    { cle: "anniv-chante", texte: "Qui chantera le plus fort ?" },
    { cle: "anniv-photos", texte: "Qui prend les photos que tout le monde gardera ?" },
    { cle: "anniv-details", texte: "Qui pense aux détails que personne ne remarque ?" },
    { cle: "anniv-tard", texte: "Qui restera le plus tard ?" },
    { cle: "anniv-trajet", texte: "Qui a fait le plus long trajet pour être là ?" },
    { cle: "anniv-prochaine", texte: "Qui organisera la prochaine ?" },
  ],
};

/**
 * TAQUIN — et il ne s'allume que si le commerçant le décide.
 *
 * LA RÈGLE D'ÉCRITURE de ce pack, sans laquelle il n'aurait pas sa place : on
 * ne moque QUE des travers que tout le monde a. Perdre ses clés, hésiter sur
 * une carte, raconter deux fois la même histoire — ce sont des choses qu'on
 * fait, pas des choses qu'on EST. Rien ici ne désigne quelqu'un par son corps,
 * son origine, ses moyens ou sa vie privée : une question qui ferait baisser
 * les yeux à la personne nommée est une question qui n'entre pas.
 */
const PACK_TAQUIN: BandePack = {
  cle: "taquin",
  nom: "Taquin",
  tonalite: "taquin",
  description:
    "À choisir en connaissance de cause : douze questions qui moquent des travers que tout le monde a.",
  questions: [
    { cle: "taquin-carte", texte: "Qui met le plus de temps à choisir sur la carte ?" },
    { cle: "taquin-repete", texte: "Qui raconte deux fois la même histoire ?" },
    { cle: "taquin-matin", texte: "Qui a le plus de mal à se lever le matin ?" },
    { cle: "taquin-cles", texte: "Qui perd toujours ses clés ?" },
    { cle: "taquin-telephone", texte: "Qui parle le plus longtemps au téléphone ?" },
    { cle: "taquin-orientation", texte: "Qui a le pire sens de l'orientation ?" },
    { cle: "taquin-habitude", texte: "Qui commande toujours exactement la même chose ?" },
    { cle: "taquin-retard", texte: "Qui arrive systématiquement en retard ?" },
    { cle: "taquin-playlist", texte: "Qui a la playlist la plus discutable ?" },
    { cle: "taquin-film", texte: "Qui met une heure à choisir un film ?" },
    { cle: "taquin-repond", texte: "Qui oublie le plus souvent de répondre ?" },
    { cle: "taquin-guide", texte: "Qui ferait le pire guide touristique ?" },
  ],
};

/**
 * LES CINQ PACKS. L'ORDRE COMPTE : le premier est le défaut proposé au
 * commerçant qui n'a rien choisi, et `taquin` est délibérément dernier.
 */
export const BANDE_PACKS: readonly BandePack[] = [
  PACK_AMIS,
  PACK_DUO,
  PACK_EQUIPE,
  PACK_ANNIVERSAIRE,
  PACK_TAQUIN,
];

/** Le pack servi quand le commerçant n'a rien réglé — toujours positif. */
export const BANDE_PACK_DEFAUT = PACK_AMIS.cle;

/** Les clés, pour le miroir du `check` SQL. Ordre identique à `BANDE_PACKS`. */
export const BANDE_PACK_CLES = BANDE_PACKS.map((p) => p.cle);

/** Nombre de questions tirées pour une partie — le cahier dit « 5 à 8 ». */
export const BANDE_QUESTIONS_MIN = 5;
export const BANDE_QUESTIONS_MAX = 8;

/** Le pack désigné par sa clé, ou `null` — jamais une exception : la clé peut
 *  venir d'une ligne écrite avant le retrait d'un pack. */
export function packBande(cle: string): BandePack | null {
  return BANDE_PACKS.find((p) => p.cle === cle) ?? null;
}

/** Le texte d'une question, par sa clé — pour un tour déjà joué dont on relit
 *  le récapitulatif. Rend `null` si la question n'existe plus. */
export function questionBande(cle: string): BandeQuestion | null {
  for (const pack of BANDE_PACKS) {
    const question = pack.questions.find((q) => q.cle === cle);
    if (question) return question;
  }
  return null;
}
