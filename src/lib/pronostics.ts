/**
 * Cœur métier du module Pronostics : barème de points, classement,
 * récompenses par rang et identité joueur. Fonctions pures (testables),
 * miroir des colonnes jsonb de `contests` (scoring, rewards).
 */

import { createHash, randomBytes } from "node:crypto";
import { OPTION_ID_PATTERN, OPTION_LABEL_MAX } from "@/lib/pronostics-bornes";
import type { Json } from "@/types/database.generated";

// ────────────────────────────────────────────────────────────
// Barème de points
// ────────────────────────────────────────────────────────────

export interface ContestScoring {
  /** Score exact trouvé. */
  exact: number;
  /** Bonne différence de buts/points (sans le score exact). */
  diff: number;
  /** Bon vainqueur (ou nul) seulement. */
  winner: number;
  // ── Paliers génériques (facultatifs : un championnat football
  //    historique ne porte que les trois clés ci-dessus, et les défauts
  //    de DEFAULT_GENERIC_SCORING s'appliquent AU CALCUL — miroir exact
  //    de la fonction SQL contest_scoring_points). ──
  /** Bonne option d'une question `choice`. */
  choice?: number;
  /** Ordre complet juste d'une question `ranking`. */
  ranking_exact?: number;
  /** Points PAR élément bien placé quand l'ordre n'est pas complet. */
  ranking_partial?: number;
  /** Valeur exacte d'une question `number`. */
  number_exact?: number;
  /** Valeur dans la tolérance d'une question `number`. */
  number_close?: number;
  /** Écart absolu toléré pour `number_close` (0 = palier inactif). */
  number_tolerance?: number;
}

export const DEFAULT_SCORING: ContestScoring = { exact: 3, diff: 2, winner: 1 };

const GENERIC_SCORING_KEYS = [
  "choice",
  "ranking_exact",
  "ranking_partial",
  "number_exact",
  "number_close",
  "number_tolerance",
] as const;

export type GenericScoringKey = (typeof GENERIC_SCORING_KEYS)[number];

/**
 * Défauts des paliers génériques, appliqués AU MOMENT DU CALCUL (et non à
 * la lecture) : `contests.scoring` d'un championnat football ne porte pas
 * ces clés et ne doit pas être réécrit pour autant.
 */
export const DEFAULT_GENERIC_SCORING: Record<GenericScoringKey, number> = {
  choice: 3,
  ranking_exact: 5,
  ranking_partial: 1,
  number_exact: 5,
  number_close: 2,
  number_tolerance: 0,
};

/** Borne de saisie des scores (miroir du CHECK SQL 0..99). */
export const MAX_SCORE = 99;

function scoringPoints(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isInteger(value)) return null;
  if (value < 0 || value > 100) return null;
  return value;
}

/**
 * Lecture d'un palier générique — miroir de `contest_scoring_points` :
 * entier, 0..1 000 000, toute autre valeur retombe sur le défaut.
 */
function genericScoringPoints(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isInteger(value)) return null;
  if (value < 0 || value > 1_000_000) return null;
  return value;
}


/**
 * Lit la colonne jsonb `contests.scoring` sans jamais faire confiance à
 * sa forme (défauts sur toute valeur invalide). Les paliers génériques
 * absents restent ABSENTS de l'objet retourné : leur défaut est appliqué
 * par la fonction SQL `contest_generic_points`, seule autorité en base.
 */
export function parseScoring(raw: unknown): ContestScoring {
  if (typeof raw !== "object" || raw === null) return { ...DEFAULT_SCORING };
  const obj = raw as Record<string, unknown>;
  const scoring: ContestScoring = {
    exact: scoringPoints(obj.exact) ?? DEFAULT_SCORING.exact,
    diff: scoringPoints(obj.diff) ?? DEFAULT_SCORING.diff,
    winner: scoringPoints(obj.winner) ?? DEFAULT_SCORING.winner,
  };
  for (const key of GENERIC_SCORING_KEYS) {
    const value = genericScoringPoints(obj[key]);
    if (value !== null) scoring[key] = value;
  }
  return scoring;
}

/* `scorePrediction` (barème football) a été SUPPRIMÉ ici — DETTE-1.
 *
 * C'était un miroir TypeScript d'une règle dont l'autorité est en base
 * (`contest_match_points`), sans aucun appelant de production : rien ne
 * l'appelait, seuls ses propres tests le tenaient. Un miroir sans appelant ne
 * protège de rien et dérive en silence — il donne au lecteur l'impression que
 * le barème se décide ici, alors qu'un écart entre les deux ne se serait vu
 * nulle part. La règle vit en SQL et y est couverte par pgTAP.
 */

// ────────────────────────────────────────────────────────────
// Questions génériques : « événement → questions → résultat »
// ────────────────────────────────────────────────────────────

/**
 * Familles de questions d'un événement. `score` est la forme HISTORIQUE
 * (football, deux camps, résultat dans home_score/away_score) : elle ne
 * passe jamais par le barème générique ci-dessous.
 */
export const CONTEST_QUESTION_TYPES = [
  "score",
  "choice",
  "ranking",
  "number",
] as const;

export type ContestQuestionType = (typeof CONTEST_QUESTION_TYPES)[number];

/** Types saisis à la main hors football (le foot passe par addMatch). */
export const GENERIC_QUESTION_TYPES = ["choice", "ranking", "number"] as const;

export type GenericQuestionType = (typeof GENERIC_QUESTION_TYPES)[number];

export function isContestQuestionType(
  value: unknown,
): value is ContestQuestionType {
  return (
    typeof value === "string" &&
    (CONTEST_QUESTION_TYPES as readonly string[]).includes(value)
  );
}

// Bornes miroir des fonctions SQL is_valid_contest_options /
// is_valid_contest_question / is_valid_contest_answer.
//
// Elles vivent dans `pronostics-bornes.ts`, un module SANS aucun import : ce
// fichier-ci tire `node:crypto` (identité joueur, tout en bas), et une chaîne
// d'imports partie d'une simple borne y embarquait ~121 Ko de polyfill dans
// deux écrans client. Ré-exportées ici pour que les importateurs serveur
// existants n'aient rien à changer.
import { DUREE_MATCH_MS } from "@/lib/pronostics-bornes";

export {
  NUMBER_ANSWER_MAX,
  OPTION_ID_PATTERN,
  OPTION_LABEL_MAX,
  OPTIONS_MAX,
  OPTIONS_MIN,
  QUESTION_PROMPT_MAX,
} from "@/lib/pronostics-bornes";

/**
 * Modèle d'événement (`contests.event_kind`) — miroir EXACT du CHECK SQL
 * `contests_event_kind_format_check` : initiale minuscule, puis
 * minuscules / chiffres / underscore, 2 à 40 caractères (pas de tiret).
 */
export const EVENT_KIND_PATTERN = /^[a-z][a-z0-9_]{1,39}$/;

/** Modèle par défaut : le football, seul parcours d'origine. */
export const DEFAULT_EVENT_KIND = "football";

/** Option ordonnée d'une question choice/ranking. */
export interface ContestQuestionOption {
  id: string;
  label: string;
}

/**
 * Vue métier d'une ligne de `contest_matches` lue comme une QUESTION
 * (le nom de table reste historique).
 */
export interface ContestQuestion {
  id: string;
  question_type: ContestQuestionType;
  /** Intitulé — null pour `score` : l'UI compose « A – B ». */
  prompt: string | null;
  /** Options ordonnées (vide hors choice/ranking). */
  options: ContestQuestionOption[];
  /** Taille du top N attendu (null hors ranking). */
  ranking_size: number | null;
  /** Verrouillage propre à la question (null : repli sur l'événement). */
  locks_at: string | null;
  /** Échéance : coup d'envoi pour le football, date de l'événement sinon. */
  kickoff_at: string;
  status: "scheduled" | "finished";
  /** Résultat officiel générique — null tant que non résolu. */
  correct_answer: unknown;
}

/** Réponse d'un joueur (ou résultat officiel), une forme par type. */
export type ContestAnswer =
  | { type: "score"; home: number; away: number }
  | { type: "choice"; optionId: string }
  | { type: "ranking"; order: string[] }
  | { type: "number"; value: number };

/**
 * Valeur jsonb envoyée à `submit_contest_answer` /
 * `set_contest_question_result`. Un score n'a pas de représentation jsonb :
 * il vit dans home_score/away_score et passe par les RPC dédiées.
 */
export function contestAnswerToJson(answer: ContestAnswer): Json {
  switch (answer.type) {
    case "choice":
      return answer.optionId;
    case "ranking":
      return answer.order;
    case "number":
      return answer.value;
    case "score":
      return null;
  }
}

/**
 * Lit la colonne jsonb `contest_matches.options` sans faire confiance à
 * sa forme : entrées invalides ou identifiants dupliqués ignorés.
 */
export function parseQuestionOptions(raw: unknown): ContestQuestionOption[] {
  if (!Array.isArray(raw)) return [];
  const options: ContestQuestionOption[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    if (typeof item !== "object" || item === null) continue;
    const { id, label } = item as Record<string, unknown>;
    if (typeof id !== "string" || !OPTION_ID_PATTERN.test(id)) continue;
    if (
      typeof label !== "string" ||
      label.trim() === "" ||
      label.length > OPTION_LABEL_MAX
    ) {
      continue;
    }
    if (seen.has(id)) continue;
    seen.add(id);
    options.push({ id, label });
  }
  return options;
}

/* `scoreAnswer` et son aide `jsonEquals` ont été SUPPRIMÉS ici — DETTE-1.
 *
 * Même raison que `scorePrediction` plus haut : c'était un miroir TypeScript
 * de `contest_generic_points`, annoncé « MIROIR STRICT », et sans le moindre
 * appelant de production. Un miroir que personne n'appelle ne peut pas diverger
 * « visiblement » : il diverge en silence, et sa seule fonction restante est de
 * faire croire au lecteur que le barème générique se décide en TypeScript.
 * L'autorité est la fonction SQL, couverte par pgTAP.
 */

// ────────────────────────────────────────────────────────────
// Verrouillage d'une question
// ────────────────────────────────────────────────────────────

/** Question telle que la lisent effectiveLocksAt / isQuestionLocked. */
type LockableQuestion = {
  locks_at?: string | null;
  kickoff_at: string;
  question_type?: string | null;
};
/** Événement porteur du verrouillage par défaut. */
type LockableContest = { default_locks_at?: string | null } | null | undefined;

/**
 * Échéance effective d'une question — MIROIR EXACT de la règle appliquée par
 * les RPC :
 *
 *   score    → coalesce(locks_at, kickoff_at)
 *   générique → coalesce(locks_at, default_locks_at, kickoff_at)
 *
 * Le football IGNORE la date de verrouillage par défaut de l'événement : ses
 * matchs sont importés sans `locks_at`, leur fenêtre reste donc le coup
 * d'envoi — qui SUIT les reports de calendrier par construction (la synchro
 * ne met à jour que `kickoff_at`). Sans cette exception, une date par défaut
 * saisie par le commerçant fermerait d'un coup tout un championnat importé.
 *
 * Toute divergence avec le SQL ferait mentir l'UI (« verrouillé » sur un match
 * que le serveur accepte encore, ou l'inverse) : la base reste l'autorité.
 */
export function effectiveLocksAt(
  question: LockableQuestion,
  contest?: LockableContest,
): string {
  // Colonne NOT NULL DEFAULT 'score' en base : une valeur absente ne peut
  // venir que d'un SELECT incomplet — on retombe alors sur le football.
  if ((question.question_type ?? "score") === "score") {
    return question.locks_at ?? question.kickoff_at;
  }
  return question.locks_at ?? contest?.default_locks_at ?? question.kickoff_at;
}

/**
 * Question fermée aux réponses. Complément de `isPredictionOpen` : le SQL
 * n'accepte une réponse que tant que l'échéance est STRICTEMENT dans le
 * futur — à la seconde pile, c'est verrouillé.
 */
export function isQuestionLocked(
  question: LockableQuestion,
  contest?: LockableContest,
  now: Date = new Date(),
): boolean {
  return (
    new Date(effectiveLocksAt(question, contest)).getTime() <= now.getTime()
  );
}

/**
 * Résultat officiel servi au JOUEUR : rien ne sort tant que la question
 * n'est pas résolue. Toute sérialisation publique d'une question passe
 * par ici — la bonne réponse d'une question ouverte ne quitte jamais le
 * serveur.
 */
export function publicCorrectAnswer(question: {
  status: string;
  correct_answer?: unknown;
}): unknown {
  return question.status === "finished" ? question.correct_answer ?? null : null;
}

// ────────────────────────────────────────────────────────────
// Récompenses par rang
// ────────────────────────────────────────────────────────────

export interface ContestReward {
  /** Rang de début (1 = premier). */
  from: number;
  /** Rang de fin inclus. */
  to: number;
  label: string;
}

/** Lit la colonne jsonb `contests.rewards` (entrées invalides ignorées). */
export function parseRewards(raw: unknown): ContestReward[] {
  if (!Array.isArray(raw)) return [];
  const rewards: ContestReward[] = [];
  for (const item of raw) {
    if (typeof item !== "object" || item === null) continue;
    const { from, to, label } = item as Record<string, unknown>;
    if (
      typeof from !== "number" || !Number.isInteger(from) || from < 1 ||
      typeof to !== "number" || !Number.isInteger(to) || to < from ||
      typeof label !== "string" || label.trim() === ""
    ) {
      continue;
    }
    rewards.push({ from, to, label: label.trim() });
  }
  return rewards;
}

/** Récompense attachée à un rang, null si aucune. */
export function rewardForRank(
  rewards: ContestReward[],
  rank: number,
): string | null {
  const hit = rewards.find((r) => rank >= r.from && rank <= r.to);
  return hit ? hit.label : null;
}

/* `rankPlayers` et `RankedPlayer` ont été SUPPRIMÉS ici — DETTE-1.
 *
 * Le classement affiché (mode TV, tableau public, tableau commerçant) vient de
 * la base, déjà ordonné et déjà rangé ex æquo. Cette version TypeScript n'avait
 * aucun appelant : c'était une seconde définition du « rang » que rien ne
 * confrontait à la première.
 */

// ────────────────────────────────────────────────────────────
// Identité joueur : jeton navigateur → hash en base
// ────────────────────────────────────────────────────────────

/**
 * Jeton opaque remis au navigateur à l'inscription (cookie/localStorage
 * côté page publique). Seul son hash est stocké — un dump de la base ne
 * permet pas d'usurper un joueur.
 */
export function generatePlayerToken(): string {
  return randomBytes(24).toString("base64url");
}

export function hashPlayerToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

// ────────────────────────────────────────────────────────────
// Fenêtre de pronostic
// ────────────────────────────────────────────────────────────

/** Un pronostic n'est modifiable que jusqu'au coup d'envoi. */
export function isPredictionOpen(
  kickoffAt: string | Date,
  now: Date = new Date(),
): boolean {
  return new Date(kickoffAt).getTime() > now.getTime();
}

/**
 * Le coup d'envoi est passé depuis PLUS qu'une durée de match : la rencontre
 * ne « dure » plus, c'est son résultat qui tarde.
 *
 * L'écran joueur affichait « En cours 🔒 » pour tout match commencé sans
 * résultat — y compris celui de la semaine dernière, quand une synchro avait
 * pris du retard. Le joueur croyait la rencontre en train de se jouer et son
 * pronostic encore vivant.
 *
 * Fonction et non expression en ligne : lire l'horloge PENDANT un rendu est
 * impur (`react-hooks/purity`), comme pour `isPredictionOpen` juste au-dessus,
 * dont c'est le jumeau. Le `now` injectable est ce qui la rend testable.
 */
// ────────────────────────────────────────────────────────────
// Journées de championnat
// ────────────────────────────────────────────────────────────

/**
 * Libellé d'une journée en français — « 1re journée », « 3e journée ».
 *
 * `null` n'est pas un trou à combler : un match saisi à la main ou un tour
 * de coupe non numéroté n'a pas de journée, et lui en inventer une rangerait
 * un combat de boxe dans une « 1re journée » qui n'existe pas.
 */
export function libelleJournee(round: number | null): string {
  if (round === null) return "Autres matchs";
  return round === 1 ? "1re journée" : `${round}e journée`;
}

/** Une journée telle que l'écran la rend : son numéro et ses matchs. */
export interface JourneeMatchs<T> {
  round: number | null;
  libelle: string;
  matchs: T[];
}

/**
 * GROUPE LES MATCHS PAR JOURNÉE.
 *
 * ── LE DÉFAUT QUE ÇA FERME (capture du 2026-08-28) ──
 *
 * La grille listait les matchs à la file, triés par coup d'envoi. On passait
 * du dimanche 30 août au jeudi 3 septembre sans la moindre séparation, alors
 * que ce sont deux journées de championnat — l'unité dans laquelle un
 * calendrier de football se lit et se pronostique.
 *
 * ── L'ORDRE ──
 *
 * Par numéro de journée croissant. Les matchs SANS journée ferment la
 * marche : ils n'ont pas de place dans la numérotation, et les intercaler
 * (par date, par exemple) couperait une journée en deux.
 *
 * À l'intérieur d'une journée, l'ordre est celui du coup d'envoi — le
 * vendredi soir avant le dimanche après-midi, comme la journée se joue.
 */
export function grouperParJournee<
  T extends { round: number | null; kickoff_at: string },
>(matchs: ReadonlyArray<T>): Array<JourneeMatchs<T>> {
  const parRound = new Map<number | null, T[]>();
  for (const m of matchs) {
    const cle = typeof m.round === "number" ? m.round : null;
    const groupe = parRound.get(cle);
    if (groupe) groupe.push(m);
    else parRound.set(cle, [m]);
  }
  return [...parRound.entries()]
    .sort(([a], [b]) => {
      if (a === null) return 1;
      if (b === null) return -1;
      return a - b;
    })
    .map(([round, groupe]) => ({
      round,
      libelle: libelleJournee(round),
      matchs: [...groupe].sort((x, y) =>
        x.kickoff_at.localeCompare(y.kickoff_at),
      ),
    }));
}

/**
 * PROGRESSION DE LA GRILLE — « X/Y pronostics ».
 *
 * ── LE DÉFAUT MESURÉ (2026-08-28, capture joueur) ──
 *
 * Le dénominateur valait `matches.length` : TOUS les matchs jamais importés
 * dans le championnat, y compris ceux fermés avant que ce joueur ne
 * s'inscrive. Un joueur arrivé en cours de saison lisait « 0/7 » alors qu'UN
 * SEUL match lui était ouvert. La barre était donc impossible à remplir, et
 * le chiffre promettait sept pronostics qu'il ne pouvait pas poser.
 *
 * ── LA RÈGLE ──
 *
 * Le dénominateur est ce que le joueur PEUT ENCORE faire, plus ce qu'il a
 * DÉJÀ fait. Il monte quand une journée s'ouvre, jamais au-delà de
 * l'atteignable, et 100 % veut dire « ma grille est à jour ».
 *
 * Un match fermé SANS pronostic ne compte nulle part : il est hors de portée,
 * l'inscrire au dénominateur reviendrait à reprocher au joueur une absence
 * qu'il ne peut plus corriger. Un match fermé AVEC pronostic compte des deux
 * côtés — c'est du travail fait, il ne doit pas disparaître du compte le jour
 * où le match démarre.
 */
export function progressionPronostics(
  matchs: ReadonlyArray<{ ouvert: boolean; pronostique: boolean }>,
): { done: number; total: number } {
  let done = 0;
  let total = 0;
  for (const m of matchs) {
    if (m.pronostique) {
      done += 1;
      total += 1;
    } else if (m.ouvert) {
      total += 1;
    }
  }
  return { done, total };
}

/**
 * LE PARTAGE DE LA GRILLE — la prochaine journée, puis les suivantes.
 *
 * ── LE DÉFAUT QUE ÇA FERME (relevé le 2026-08-29) ──
 *
 * Le bloc de tête retenait les matchs des SEPT PROCHAINS JOURS. Mesuré sur
 * la Ligue 1 : 10 matchs le 28 août (la 2e journée entière PLUS le premier
 * match de la 3e), 8 le 4 septembre (la 3e journée amputée de son premier
 * match, déjà joué). Le joueur voyait un nombre différent chaque semaine
 * sans qu'aucun le lui explique.
 *
 * Une journée de championnat s'étale sur trois à quatre jours et les
 * intervalles entre journées ne font pas sept jours : une fenêtre de durée
 * coupe donc toujours au mauvais endroit. L'unité du football est la
 * JOURNÉE — c'est elle qu'on sert.
 *
 * ── AUCUNE HORLOGE ICI, ET C'EST UN GAIN ──
 *
 * La grille ne reçoit QUE des matchs ouverts : la journée la plus basse est
 * donc forcément la prochaine à se jouer. Le partage se lit sur les seules
 * données, sans lire l'heure — donc sans le calcul serveur qu'exigeait la
 * fenêtre glissante, et sans impureté de rendu.
 *
 * ── LE CAS SANS JOURNÉE EST COUVERT SANS EXCEPTION ──
 *
 * Un championnat en saisie manuelle (boxe, match isolé) n'a aucun `round` :
 * `grouperParJournee` rend alors un unique groupe « Autres matchs », qui
 * devient le bloc de tête. Rien à traiter à part.
 */
export function partagerGrille<
  T extends { round: number | null; kickoff_at: string },
>(
  matchs: ReadonlyArray<T>,
): { prochaine: JourneeMatchs<T> | null; suivantes: Array<JourneeMatchs<T>> } {
  const journees = grouperParJournee(matchs);
  return {
    prochaine: journees[0] ?? null,
    suivantes: journees.slice(1),
  };
}
export function attendResultat(
  kickoffAt: string | Date,
  now: Date = new Date(),
): boolean {
  return (
    now.getTime() - new Date(kickoffAt).getTime() > DUREE_MATCH_MS
  );
}
