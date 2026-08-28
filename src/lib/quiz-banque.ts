/**
 * GÉNÉRATEUR DE QUESTIONS — le moteur de la banque thématique.
 *
 * Ce que le commerçant demande : « une heure de jeu, thèmes Cinéma et Musique,
 * avec quelques sondages ». Ce que ce module rend : une liste de questions
 * PRÊTES À ÉCRIRE, dans l'ordre, avec leurs réponses officielles.
 *
 * ── Trois décisions de conception ──
 *
 * 1. **PUR, sans accès base ni import server-only.** Comme `src/lib/quiz.ts` et
 *    `contest-event-kinds.ts` : l'éditeur peut prévisualiser un tirage sans
 *    aller-retour serveur, et la server action rejoue EXACTEMENT le même calcul
 *    à partir de la même graine. C'est ce qui rend l'aperçu honnête — ce que le
 *    commerçant voit est ce qui sera écrit.
 *
 * 2. **Aucune migration.** Un sondage et un pronostic sont des `preset` (modèle
 *    d'INTERFACE), pas de nouveaux types moteur : la base ne contraint que la
 *    forme de la clé (`^[a-z][a-z0-9_]{1,39}$`). Ils valent 0 point et sont
 *    rendus sans correction côté joueur (voir `quizPresetInfo(...).sansVerite`).
 *    La colonne `correct_answer` étant `not null`, un sondage porte la première
 *    proposition comme vérité de FORME : elle n'est jamais affichée, jamais
 *    comparée à l'écran, et ne rapporte rien puisque `points` vaut 0.
 *
 * 3. **La durée est une ESTIMATION, pas une promesse.** Le chronomètre d'une
 *    question est un plafond, pas une durée : un joueur ne le consomme pas en
 *    entier. `PART_CHRONO_CONSOMMEE` porte cette hypothèse à un seul endroit,
 *    et l'écran annonce « environ » — jamais un compte à rebours de partie.
 *
 * Le CATALOGUE (thèmes et questions) vit dans `quiz-banque-questions.ts` :
 * relire une réponse fausse n'oblige pas à rouvrir la logique.
 */

import type { QuizQuestionType, QuizSolutionInput, QuizTheme } from "./quiz";
import { BANQUE_QUESTIONS, THEMES_BANQUE } from "./quiz-banque-questions";

// ────────────────────────────────────────────────────────────
// Types du catalogue
// ────────────────────────────────────────────────────────────

export type DifficulteBanque = 1 | 2 | 3;

/**
 * Les trois natures de contenu proposées au commerçant.
 *  · `question`  — il y a une bonne réponse, elle rapporte des points ;
 *  · `sondage`   — un avis, aucune vérité, 0 point, aucune correction ;
 *  · `pronostic` — un pari sur ce que personne ne sait encore (même mécanique
 *    qu'un sondage côté moteur : le quiz corrige à l'instant, il ne peut pas
 *    attendre un résultat. Pour un pronostic ARBITRÉ APRÈS COUP, le module
 *    Pronostics reste l'outil : lui sait recevoir la vérité plus tard).
 */
export type GenreBanque = "question" | "sondage" | "pronostic";

export type FormeBanque =
  | { type: "choice"; options: readonly string[]; bonne: number }
  | { type: "vrai_faux"; bonne: boolean }
  | { type: "number"; valeur: number; tolerance: number }
  | { type: "text"; variantes: readonly string[] }
  | { type: "sondage"; options: readonly string[] }
  | { type: "pronostic"; options: readonly string[] };

export interface QuestionBanque {
  /** Identifiant stable, unique dans toute la banque (sert aux exclusions). */
  id: string;
  /** Clé du thème (`ThemeBanque.cle`). */
  theme: string;
  prompt: string;
  difficulte: DifficulteBanque;
  forme: FormeBanque;
}

export interface ThemeBanque {
  cle: string;
  label: string;
  icon: string;
  /** Une ligne : ce que le commerçant comprend sans ouvrir le thème. */
  hint: string;
  /** Habillage de page publique cohérent avec le thème (jamais imposé). */
  habillage: QuizTheme;
}

export { BANQUE_QUESTIONS, THEMES_BANQUE };

// ────────────────────────────────────────────────────────────
// Lecture d'une question — la forme porte tout le reste
// ────────────────────────────────────────────────────────────

export function genreDe(question: QuestionBanque): GenreBanque {
  if (question.forme.type === "sondage") return "sondage";
  if (question.forme.type === "pronostic") return "pronostic";
  return "question";
}

/** Modèle d'INTERFACE (`quiz_questions.preset`). Le moteur SQL l'ignore. */
export function presetDe(question: QuestionBanque): string {
  switch (question.forme.type) {
    case "choice":
      return "multiple_choice";
    case "vrai_faux":
      return "true_false";
    case "number":
      return "estimate";
    case "text":
      return "free_prediction";
    case "sondage":
      return "sondage";
    case "pronostic":
      return "pronostic";
  }
}

/** Forme de réponse MOTEUR (`quiz_questions.question_type`). */
export function questionTypeDe(question: QuestionBanque): QuizQuestionType {
  switch (question.forme.type) {
    case "number":
      return "number";
    case "text":
      return "text";
    default:
      return "choice";
  }
}

/** Chronomètre proposé, en secondes — toujours dans [5, 600] (borne SQL). */
export function secondesDe(question: QuestionBanque): number {
  switch (question.forme.type) {
    case "vrai_faux":
      return 15;
    case "choice":
      return 25;
    case "number":
      return 40;
    case "text":
      return 40;
    case "sondage":
      return 20;
    case "pronostic":
      return 25;
  }
}

/**
 * Points d'une question. Un avis ne rapporte RIEN — sinon le classement
 * récompenserait d'avoir cliqué, pas d'avoir su. La difficulté fait le barème :
 * 1 point, 2 points, 3 points.
 */
export function pointsDe(question: QuestionBanque): number {
  return genreDe(question) === "question" ? question.difficulte : 0;
}

/**
 * Part du chronomètre réellement consommée par un joueur. Le chronomètre est un
 * PLAFOND : personne n'attend la dernière seconde pour valider « Vrai ». Un
 * seul endroit porte l'hypothèse, pour qu'elle se corrige d'un chiffre le jour
 * où on la mesure vraiment.
 */
export const PART_CHRONO_CONSOMMEE = 0.75;
/** Lire l'énoncé et les propositions avant même de réfléchir. */
export const SECONDES_LECTURE = 6;
/** Lire la correction, souffler, appuyer sur « Question suivante ». */
export const SECONDES_VERDICT = 6;

/** Temps de jeu ESTIMÉ d'une question, en secondes. */
export function coutSecondes(question: QuestionBanque): number {
  return (
    secondesDe(question) * PART_CHRONO_CONSOMMEE +
    SECONDES_LECTURE +
    SECONDES_VERDICT
  );
}

/** Durée estimée d'un tirage entier, en secondes (arrondie à la seconde). */
export function dureeEstimeeSecondes(
  questions: readonly QuestionBanque[],
): number {
  return Math.round(questions.reduce((total, q) => total + coutSecondes(q), 0));
}

// ────────────────────────────────────────────────────────────
// Vers une question écrivable en base
// ────────────────────────────────────────────────────────────

/** Propositions d'un `choice`, avec les identifiants `opt_N` de l'éditeur. */
function optionsDe(question: QuestionBanque): Array<{ id: string; label: string }> {
  const labels: readonly string[] =
    question.forme.type === "choice" ||
    question.forme.type === "sondage" ||
    question.forme.type === "pronostic"
      ? question.forme.options
      : question.forme.type === "vrai_faux"
        ? ["Vrai", "Faux"]
        : [];
  return labels.map((label, i) => ({ id: `opt_${i + 1}`, label }));
}

/**
 * Charge utile d'une question, prête pour `createQuizQuestion`. Les noms sont
 * ceux de la server action, pas ceux des colonnes : c'est elle qui traduit.
 */
export interface QuestionAEcrire {
  questionType: QuizQuestionType;
  preset: string;
  prompt: string;
  options: Array<{ id: string; label: string }>;
  correctAnswer: QuizSolutionInput;
  timeLimitSeconds: number;
  points: number;
  /** Écart absolu toléré — `undefined` sauf pour une estimation chiffrée. */
  tolerance?: number;
}

export function questionAEcrire(question: QuestionBanque): QuestionAEcrire {
  const options = optionsDe(question);
  const base = {
    questionType: questionTypeDe(question),
    preset: presetDe(question),
    prompt: question.prompt,
    options,
    timeLimitSeconds: secondesDe(question),
    points: pointsDe(question),
  };

  switch (question.forme.type) {
    case "choice":
      return {
        ...base,
        correctAnswer: {
          type: "choice",
          optionId: options[question.forme.bonne].id,
        },
      };
    case "vrai_faux":
      return {
        ...base,
        correctAnswer: {
          type: "choice",
          optionId: question.forme.bonne ? "opt_1" : "opt_2",
        },
      };
    case "number":
      return {
        ...base,
        correctAnswer: { type: "number", value: question.forme.valeur },
        tolerance: question.forme.tolerance,
      };
    case "text":
      return {
        ...base,
        correctAnswer: {
          type: "text",
          variants: [...question.forme.variantes],
        },
      };
    // Sondage et pronostic : la « vérité » n'est qu'une exigence de FORME
    // (`correct_answer` est `not null`). Elle vaut 0 point et n'est jamais
    // rendue à l'écran — voir l'en-tête de ce fichier.
    case "sondage":
    case "pronostic":
      return {
        ...base,
        correctAnswer: { type: "choice", optionId: "opt_1" },
      };
  }
}

// ────────────────────────────────────────────────────────────
// Vers une question du Mode événement live
//
// Le live et le quiz ne partagent PAS de schéma : `event_questions` connaît
// nativement les trois natures (`quiz` / `poll` / `prono`) et n'accepte QUE des
// questions à options — aucune saisie libre, aucun nombre à deviner, puisqu'on
// répond en tapant sur un gros bouton depuis la salle. La banque est donc
// filtrée avant d'y être versée, pas adaptée de force.
//
// Différence de barème assumée avec le quiz : ici un PRONOSTIC rapporte. Le
// live sait recevoir la vérité plus tard (l'animateur désigne l'option
// gagnante au reveal, `session.prono_correct_option_id`) là où le quiz corrige
// à l'instant et ne le peut pas.
// ────────────────────────────────────────────────────────────

/** Nature d'une question live (`event_questions.question_type`). */
export type GenreEvenement = "quiz" | "poll" | "prono";

/** Cette question tient-elle dans le Mode événement live (options seulement) ? */
export function compatibleEvenement(question: QuestionBanque): boolean {
  return question.forme.type !== "number" && question.forme.type !== "text";
}

export interface QuestionEvenementAEcrire {
  questionType: GenreEvenement;
  prompt: string;
  timeLimitSeconds: number;
  pointsBase: number;
  options: Array<{ label: string; is_correct: boolean }>;
}

/**
 * Points de base d'une question live. Le moteur y ajoute un bonus de rapidité
 * borné par la fenêtre de réponse ; 1000 est la valeur par défaut du schéma, la
 * difficulté la module. Un SONDAGE ne rapporte rien (c'est un avis), un
 * PRONOSTIC si — l'animateur tranchera.
 */
function pointsEvenement(question: QuestionBanque): number {
  switch (question.forme.type) {
    case "sondage":
      return 0;
    case "pronostic":
      return 1000;
    default:
      return question.difficulte * 400 + 400;
  }
}

/**
 * Charge utile prête pour `createEventQuestion`. Lève sur une question
 * incompatible plutôt que d'en fabriquer une fausse : l'appelant DOIT filtrer
 * par `compatibleEvenement` — c'est le seul contrat, et il est vérifiable.
 */
export function questionEvenementAEcrire(
  question: QuestionBanque,
): QuestionEvenementAEcrire {
  const forme = question.forme;
  const base = {
    prompt: question.prompt,
    timeLimitSeconds: secondesDe(question),
    pointsBase: pointsEvenement(question),
  };

  switch (forme.type) {
    case "choice":
      return {
        ...base,
        questionType: "quiz",
        options: forme.options.map((label, i) => ({
          label,
          is_correct: i === forme.bonne,
        })),
      };
    case "vrai_faux":
      return {
        ...base,
        questionType: "quiz",
        options: [
          { label: "Vrai", is_correct: forme.bonne },
          { label: "Faux", is_correct: !forme.bonne },
        ],
      };
    // `poll` et `prono` n'ont AUCUNE option correcte à la création — le
    // `superRefine` de validations/events.ts le refuse explicitement.
    case "sondage":
      return {
        ...base,
        questionType: "poll",
        options: forme.options.map((label) => ({ label, is_correct: false })),
      };
    case "pronostic":
      return {
        ...base,
        questionType: "prono",
        options: forme.options.map((label) => ({ label, is_correct: false })),
      };
    default:
      throw new Error(
        `Question ${question.id} incompatible avec le Mode événement (${forme.type}) : filtrer par compatibleEvenement.`,
      );
  }
}

// ────────────────────────────────────────────────────────────
// Le tirage
// ────────────────────────────────────────────────────────────

/** Générateur pseudo-aléatoire REPRODUCTIBLE (mulberry32) : même graine, même tirage. */
function alea(graine: number): () => number {
  let etat = graine >>> 0;
  return () => {
    etat = (etat + 0x6d2b79f5) >>> 0;
    let t = etat;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Fisher-Yates sur une copie — l'entrée n'est jamais mutée. */
function melanger<T>(items: readonly T[], tirer: () => number): T[] {
  const copie = [...items];
  for (let i = copie.length - 1; i > 0; i--) {
    const j = Math.floor(tirer() * (i + 1));
    [copie[i], copie[j]] = [copie[j], copie[i]];
  }
  return copie;
}

/**
 * Prélève `combien` questions en TOURNANT sur les thèmes : deux thèmes cochés
 * donnent une alternance, pas vingt questions de cinéma suivies de vingt de
 * musique. Chaque pile de thème est déjà mélangée.
 */
function preleverEnRondeDeThemes(
  questions: readonly QuestionBanque[],
  combien: number,
  tirer: () => number,
): QuestionBanque[] {
  const piles = new Map<string, QuestionBanque[]>();
  for (const q of questions) {
    const pile = piles.get(q.theme);
    if (pile) pile.push(q);
    else piles.set(q.theme, [q]);
  }
  // L'ordre des thèmes est lui aussi tiré : deux générations d'affilée ne
  // commencent pas systématiquement par le même thème.
  const cles = melanger([...piles.keys()], tirer);
  for (const cle of cles) piles.set(cle, melanger(piles.get(cle) ?? [], tirer));

  const sortie: QuestionBanque[] = [];
  let reste = true;
  while (sortie.length < combien && reste) {
    reste = false;
    for (const cle of cles) {
      if (sortie.length >= combien) break;
      const prise = piles.get(cle)?.shift();
      if (prise) {
        sortie.push(prise);
        reste = true;
      }
    }
  }
  return sortie;
}

/**
 * Répartit les avis (sondages, pronostics) DANS le fil des questions notées,
 * à intervalles réguliers, jamais en première position : on ouvre sur une vraie
 * question, et on ne pose pas deux avis de suite.
 */
function entrelacer(
  notees: readonly QuestionBanque[],
  avis: readonly QuestionBanque[],
): QuestionBanque[] {
  if (avis.length === 0) return [...notees];
  if (notees.length === 0) return [...avis];

  const total = notees.length + avis.length;
  const cibles = new Set<number>();
  for (let i = 0; i < avis.length; i++) {
    let p = Math.round(((i + 1) * total) / (avis.length + 1));
    if (p < 1) p = 1;
    while (p < total && cibles.has(p)) p += 1;
    while (p > 1 && cibles.has(p)) p -= 1;
    cibles.add(p);
  }

  const sortie: QuestionBanque[] = [];
  let iNotee = 0;
  let iAvis = 0;
  for (let p = 0; p < total; p++) {
    const prendreAvis = cibles.has(p) && iAvis < avis.length;
    if (prendreAvis || iNotee >= notees.length) sortie.push(avis[iAvis++]);
    else sortie.push(notees[iNotee++]);
  }
  return sortie;
}

/** Combien de questions demander : un nombre, ou une durée à convertir. */
export type ModeGeneration =
  | { type: "nombre"; nombre: number }
  | { type: "duree"; minutes: number };

/** Les durées proposées au commerçant, en minutes. */
export const DUREES_PROPOSEES: readonly number[] = [10, 15, 20, 30, 45, 60];

/** Bornes du nombre de questions générables en une fois. */
export const NOMBRE_MIN = 1;
export const NOMBRE_MAX = 120;

export interface OptionsGeneration {
  /** Thèmes retenus. Vide = MÉLANGE : toute la banque. */
  themes?: readonly string[];
  /** Natures acceptées. Défaut : les questions notées seulement. */
  genres?: readonly GenreBanque[];
  mode: ModeGeneration;
  /** Même graine ⇒ même tirage (aperçu commerçant = écriture serveur). */
  graine?: number;
  /** Plafond de difficulté (1 = facile seulement, 3 = tout). */
  difficulteMax?: DifficulteBanque;
  /** Identifiants déjà présents dans le quiz : jamais tirés deux fois. */
  exclure?: readonly string[];
  /**
   * Ne retenir que ce qui tient dans le Mode événement live (questions à
   * options). Écarte les estimations chiffrées et les réponses libres, qui n'y
   * ont pas de moyen de saisie.
   */
  pourEvenement?: boolean;
  /**
   * Plafond du nombre demandé, `NOMBRE_MAX` par défaut. Il s'applique AUSSI au
   * nombre déduit d'une durée : sans quoi « une heure » côté événement
   * afficherait un aperçu que le serveur tronquerait ensuite, et l'aperçu
   * cesserait d'être ce qui s'écrit.
   */
  plafond?: number;
}

export interface Tirage {
  questions: readonly QuestionBanque[];
  /** Nombre visé après conversion de la durée. */
  demande: number;
  /** Questions manquantes faute de banque : `demande - questions.length`. */
  manquantes: number;
  dureeEstimeeSecondes: number;
  /** Questions restées disponibles avec ces critères, hors tirage. */
  restantes: number;
}

/** Le vivier correspondant aux critères, avant tout tirage. */
export function vivier(options: OptionsGeneration): QuestionBanque[] {
  const themes = options.themes ?? [];
  const genres = options.genres ?? ["question"];
  const difficulteMax = options.difficulteMax ?? 3;
  const exclus = new Set(options.exclure ?? []);
  return BANQUE_QUESTIONS.filter(
    (q) =>
      (themes.length === 0 || themes.includes(q.theme)) &&
      genres.includes(genreDe(q)) &&
      q.difficulte <= difficulteMax &&
      (!options.pourEvenement || compatibleEvenement(q)) &&
      !exclus.has(q.id),
  );
}

/**
 * Combien de questions tiennent dans une durée, pour un vivier donné. Le coût
 * MOYEN du vivier fait foi : un thème riche en estimations chiffrées donne
 * moins de questions à durée égale, et c'est juste.
 */
export function nombreDeQuestionsPourDuree(
  minutes: number,
  pool: readonly QuestionBanque[],
): number {
  if (pool.length === 0 || minutes <= 0) return 0;
  const moyen = pool.reduce((t, q) => t + coutSecondes(q), 0) / pool.length;
  return Math.max(1, Math.round((minutes * 60) / moyen));
}

/**
 * LE TIRAGE. Déterministe pour une graine donnée : l'aperçu de l'éditeur et
 * l'écriture serveur produisent la même liste, dans le même ordre.
 */
export function genererQuestions(options: OptionsGeneration): Tirage {
  const pool = vivier(options);
  const demandeBrute =
    options.mode.type === "nombre"
      ? options.mode.nombre
      : nombreDeQuestionsPourDuree(options.mode.minutes, pool);
  const plafond = Math.max(NOMBRE_MIN, Math.min(NOMBRE_MAX, options.plafond ?? NOMBRE_MAX));
  const demande = Math.min(
    plafond,
    Math.max(NOMBRE_MIN, Math.round(demandeBrute) || NOMBRE_MIN),
  );
  const tirer = alea(options.graine ?? 1);

  const genres = options.genres ?? ["question"];
  const notees = pool.filter((q) => genreDe(q) === "question");
  const avisDisponibles = pool.filter((q) => genreDe(q) !== "question");

  // Un avis reste un ASSAISONNEMENT : au plus un cinquième du quiz, sauf si le
  // commerçant n'a demandé QUE des avis — auquel cas il les aura tous.
  const partAvis = genres.includes("question")
    ? Math.min(avisDisponibles.length, Math.floor(demande * 0.2))
    : Math.min(avisDisponibles.length, demande);
  const partNotees = Math.min(notees.length, demande - partAvis);
  // La banque de notées peut être plus courte que prévu : on récupère la place
  // avec des avis plutôt que de rendre un quiz plus court que demandé.
  const partAvisFinale = Math.min(avisDisponibles.length, demande - partNotees);

  const questions = entrelacer(
    preleverEnRondeDeThemes(notees, partNotees, tirer),
    preleverEnRondeDeThemes(avisDisponibles, partAvisFinale, tirer),
  );

  return {
    questions,
    demande,
    manquantes: Math.max(0, demande - questions.length),
    dureeEstimeeSecondes: dureeEstimeeSecondes(questions),
    restantes: pool.length - questions.length,
  };
}

// ────────────────────────────────────────────────────────────
// Aides d'affichage
// ────────────────────────────────────────────────────────────

export function themeBanque(cle: string): ThemeBanque | undefined {
  return THEMES_BANQUE.find((t) => t.cle === cle);
}

/** Libellé d'un thème — repli sur la clé brute plutôt qu'un blanc. */
export function libelleTheme(cle: string): string {
  return themeBanque(cle)?.label ?? cle;
}

/** Combien de questions la banque porte pour un thème, par nature. */
export function compteTheme(cle: string): Record<GenreBanque, number> {
  const compte: Record<GenreBanque, number> = {
    question: 0,
    sondage: 0,
    pronostic: 0,
  };
  for (const q of BANQUE_QUESTIONS) {
    if (q.theme === cle) compte[genreDe(q)] += 1;
  }
  return compte;
}

/** « environ 32 min » — jamais une promesse à la seconde près. */
export function dureeLisible(secondes: number): string {
  const minutes = Math.max(1, Math.round(secondes / 60));
  if (minutes < 60) return `${minutes} min`;
  const heures = Math.floor(minutes / 60);
  const reste = minutes % 60;
  return reste === 0
    ? `${heures} h`
    : `${heures} h ${String(reste).padStart(2, "0")}`;
}
