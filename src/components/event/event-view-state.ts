/**
 * Cœur « pur » de l'affichage du Mode événement en direct : mapping phase →
 * vue, calcul du chrono restant (purement visuel), répartition des votes en
 * pourcentages, tri du classement et libellés des types de question. Aucune
 * dépendance réseau ni server-only — testable en isolation (Vitest), miroir de
 * jackpot-state.ts.
 *
 * Le chrono N'EST PAS autoritatif : le scoring se fait côté serveur au reveal.
 * Ces helpers ne servent qu'à animer l'écran et le téléphone.
 */

import type {
  EventDistributionEntry,
  EventLeaderboardEntry,
} from "@/lib/event";
import type { EventQuestionType, EventSessionPhase } from "@/types/database";

// ────────────────────────────────────────────────────────────
// Mapping phase → vue affichée
// ────────────────────────────────────────────────────────────

/** Vue de haut niveau rendue par l'écran / le téléphone selon la phase. */
export type EventView =
  | "lobby"
  | "question"
  | "locked"
  | "reveal"
  | "leaderboard"
  | "ended";

/**
 * Réduit une phase de la machine à états à la vue à rendre. `question_active`
 * et `question_locked` partagent l'écran de question (la seconde fige la saisie),
 * mais restent deux vues distinctes pour couper le chrono et l'entrée joueur.
 */
export function viewForPhase(phase: EventSessionPhase): EventView {
  switch (phase) {
    case "question_active":
      return "question";
    case "question_locked":
      return "locked";
    case "reveal":
      return "reveal";
    case "leaderboard":
      return "leaderboard";
    case "ended":
      return "ended";
    case "lobby":
    default:
      return "lobby";
  }
}

// ────────────────────────────────────────────────────────────
// Chrono visuel du compte à rebours
// ────────────────────────────────────────────────────────────

export interface EventCountdown {
  /** Secondes restantes, bornées [0, timeLimit]. */
  secondsLeft: number;
  /** Millisecondes restantes, bornées [0, timeLimit×1000]. */
  msLeft: number;
  /** Fraction écoulée [0, 1] (1 = temps entièrement écoulé). */
  elapsedRatio: number;
  /** Fraction restante [0, 1] (largeur d'une barre de chrono). */
  remainingRatio: number;
  /** Le temps imparti est-il écoulé ? */
  expired: boolean;
}

/**
 * Calcule le compte à rebours d'une question depuis l'instant de lancement
 * serveur et la fenêtre de la question. Purement visuel. Tolérant : un
 * startedAt absent ou illisible, un timeLimit nul → chrono « plein » non expiré
 * (l'écran n'affiche pas de barre trompeuse). Jamais de NaN, jamais de valeur
 * hors bornes.
 */
export function computeCountdown(
  startedAt: string | null,
  timeLimitSeconds: number,
  nowMs: number,
): EventCountdown {
  const limit = Math.max(0, Math.trunc(timeLimitSeconds));
  const limitMs = limit * 1000;

  const startMs = startedAt ? Date.parse(startedAt) : Number.NaN;
  if (Number.isNaN(startMs) || limitMs <= 0) {
    return {
      secondsLeft: limit,
      msLeft: limitMs,
      elapsedRatio: 0,
      remainingRatio: 1,
      expired: false,
    };
  }

  const msLeft = Math.max(0, Math.min(limitMs, startMs + limitMs - nowMs));
  const remainingRatio = limitMs > 0 ? msLeft / limitMs : 0;
  return {
    secondsLeft: Math.ceil(msLeft / 1000),
    msLeft,
    elapsedRatio: 1 - remainingRatio,
    remainingRatio,
    expired: msLeft <= 0,
  };
}

// ────────────────────────────────────────────────────────────
// Ancrage du chrono sur l'horloge SERVEUR
// ────────────────────────────────────────────────────────────

/**
 * Écart toléré entre deux mesures d'offset avant de se ré-ancrer (ms).
 *
 * `server_now` est servi depuis un cache d'au plus une seconde : deux lectures
 * consécutives peuvent donc rendre des instants figés, et se ré-ancrer sur
 * chacune ferait sauter le décompte d'une seconde en avant puis en arrière à
 * chaque poll. On ne corrige donc que les écarts qui ne peuvent PAS venir du
 * cache — c'est-à-dire une vraie dérive de l'horloge du téléphone.
 */
export const EVENT_CLOCK_RESYNC_MS = 1500;

/**
 * Décalage à ajouter à `Date.now()` pour obtenir l'heure SERVEUR.
 *
 * Le chrono d'une soirée live se lisait jusqu'ici sur l'horloge du téléphone,
 * confrontée à un `started_at` serveur : un appareil réglé dix minutes en avance
 * affichait « Temps écoulé » sur une question qui venait d'être lancée, et
 * l'inverse laissait une barre pleine après la fermeture. La borne vient
 * désormais des instants serveur (`serverNow` mesuré à la réception) ; seule la
 * DÉCRUE seconde par seconde s'appuie sur l'horloge locale — même modèle que le
 * quiz (`useRemainingMs`, `src/lib/quiz.ts`).
 *
 * Tolérant : un `serverNow` absent ou illisible conserve l'offset connu (0 au
 * premier appel), donc le comportement historique plutôt qu'un écran faux.
 */
export function serverClockOffset(
  current: number | null,
  serverNow: string | null,
  localNow: number,
): number {
  const serverMs = serverNow ? Date.parse(serverNow) : Number.NaN;
  if (Number.isNaN(serverMs)) return current ?? 0;

  const candidate = serverMs - localNow;
  if (current === null) return candidate;
  return Math.abs(candidate - current) > EVENT_CLOCK_RESYNC_MS ? candidate : current;
}

// ────────────────────────────────────────────────────────────
// Répartition des votes (barres %) — sondage / reveal
// ────────────────────────────────────────────────────────────

export interface EventDistributionBar {
  optionId: string;
  label: string;
  position: number;
  votes: number;
  /** Pourcentage entier [0, 100] du total des votes (0 si aucun vote). */
  percent: number;
  /** Cette option a-t-elle le plus de voix ? (ex æquo → toutes marquées). */
  isTop: boolean;
}

export interface EventDistribution {
  bars: EventDistributionBar[];
  totalVotes: number;
}

/**
 * Convertit la répartition brute en barres triées par position, avec un
 * pourcentage entier par option et le repérage du (des) maximum(s). Tolérant à
 * un total nul (aucune division par zéro, tous à 0 %). Ne suppose aucun ordre
 * en entrée : trie par position pour un rendu stable.
 */
export function computeDistribution(
  distribution: EventDistributionEntry[] | null,
): EventDistribution {
  const entries = distribution ?? [];
  const totalVotes = entries.reduce((sum, e) => sum + Math.max(0, e.votes), 0);
  const maxVotes = entries.reduce((m, e) => Math.max(m, Math.max(0, e.votes)), 0);

  const bars = [...entries]
    .sort((a, b) => a.position - b.position)
    .map((e) => {
      const votes = Math.max(0, e.votes);
      return {
        optionId: e.optionId,
        label: e.label,
        position: e.position,
        votes,
        percent: totalVotes > 0 ? Math.round((votes / totalVotes) * 100) : 0,
        isTop: maxVotes > 0 && votes === maxVotes,
      };
    });

  return { bars, totalVotes };
}

// ────────────────────────────────────────────────────────────
// Classement : tri stable
// ────────────────────────────────────────────────────────────

/**
 * Trie le classement par rang croissant (le serveur fait foi sur le rang) ;
 * départage les rangs égaux par score décroissant puis pseudo, pour un ordre
 * d'affichage déterministe. Renvoie une nouvelle liste (n'altère pas l'entrée).
 */
export function sortLeaderboard(
  entries: EventLeaderboardEntry[],
): EventLeaderboardEntry[] {
  return [...entries].sort(
    (a, b) =>
      a.rank - b.rank ||
      b.score - a.score ||
      a.pseudo.localeCompare(b.pseudo, "fr"),
  );
}

/** Les trois premiers du classement (podium), déjà triés. */
export function podiumEntries(
  entries: EventLeaderboardEntry[],
): EventLeaderboardEntry[] {
  return sortLeaderboard(entries).slice(0, 3);
}

// ────────────────────────────────────────────────────────────
// Libellés des types de question (écran + éditeur)
// ────────────────────────────────────────────────────────────

export interface EventQuestionTypeMeta {
  label: string;
  /** Explication courte (une ligne) pour l'éditeur. */
  hint: string;
  emoji: string;
}

const QUESTION_TYPE_META: Record<EventQuestionType, EventQuestionTypeMeta> = {
  quiz: {
    label: "Quiz",
    hint: "Une bonne réponse à désigner : les joueurs marquent des points, d'autant plus vite qu'ils répondent tôt.",
    emoji: "🧠",
  },
  poll: {
    label: "Sondage",
    hint: "Aucune bonne réponse : on affiche la répartition des votes en direct, sans score.",
    emoji: "📊",
  },
  prono: {
    label: "Pronostic",
    hint: "La bonne réponse est désignée au moment de la révélation (ex. : résultat d'un match) — vous la choisissez en direct.",
    emoji: "🎯",
  },
};

export function eventQuestionTypeMeta(
  type: EventQuestionType,
): EventQuestionTypeMeta {
  return QUESTION_TYPE_META[type] ?? QUESTION_TYPE_META.quiz;
}

/** Ordre d'affichage canonique des types dans l'éditeur. */
export const EVENT_QUESTION_TYPES: readonly EventQuestionType[] = [
  "quiz",
  "poll",
  "prono",
] as const;

// ────────────────────────────────────────────────────────────
// Cadence de polling (repli primaire, cf. brief backend)
// ────────────────────────────────────────────────────────────

/** Intervalle de polling de l'état public (ms) — suspendu onglet masqué. */
export const EVENT_POLL_MS = 2500;

// ────────────────────────────────────────────────────────────
// Modération : le seul angle mort du polling de la télécommande
// ────────────────────────────────────────────────────────────

/**
 * Le pseudo de remplacement écrit par `moderate_event_player`.
 *
 * Recopié depuis la base, donc susceptible d'en diverger — c'est précisément
 * pour cela qu'un test relit la migration et compare. Une valeur recopiée que
 * rien ne confronte à sa source est une valeur qui finit fausse.
 */
export const PSEUDO_MODERE = "Joueur modéré";

/**
 * Applique à la liste serveur les modérations DÉJÀ acceptées par le serveur
 * mais que l'écran n'a pas encore rechargées.
 *
 * Pourquoi ce recouvrement existe. La télécommande tient son état de deux
 * sources : `event_public_state`, sondé toutes les 2,5 s, qui rapporte la
 * session, la question et la répartition — et des props serveur, qui portent
 * TOUT LE RESTE, dont la liste des joueurs. La modération est le seul geste de
 * cet écran dont l'effet ne passe par aucune des deux : la RPC réussit,
 * `router.refresh()` est censé remonter la nouvelle liste, et il ne s'applique
 * pas 5 à 32 % du temps (docs/bugs.md).
 *
 * En soirée, devant l'assistance, l'animateur bannit un pseudo obscène : le
 * joueur quitte l'écran de salle, mais sa ligne affiche toujours « Masquer /
 * Bannir ». Il croit la modération en panne et reclique — cette fois sur
 * « Masquer », ce qui remplace le bannissement par un simple masquage. Il
 * applique à un état périmé la transition qu'il n'aurait pas choisie en voyant
 * le vrai.
 *
 * Un rechargement franc (`reloadOnSuccess`) est le remède des bascules du
 * tableau de bord ; il ne convient PAS ici — on ne recharge pas la
 * télécommande au milieu d'une soirée, elle perdrait son polling et ses
 * quelques secondes. On reflète donc localement l'état que le serveur vient
 * d'accepter, et le prochain rafraîchissement qui aboutit le confirme.
 *
 * ── LE PSEUDO, ET POURQUOI IL A FALLU Y REVENIR ─────────────
 *
 * La première version ne recopiait que `moderationState`. Elle manquait donc
 * exactement le geste qui motive ce bouton : `moderate_event_player`
 * (20260805190000, catalogue vivant vérifié) ne change pas seulement l'état,
 * elle remplace le pseudo par « Joueur modéré » et remet le score à zéro. Un
 * animateur qui bannissait un pseudo obscène le voyait donc **rester sous ses
 * yeux** sur la télécommande, alors même que l'écran de salle l'avait déjà
 * retiré — le défaut qu'on venait de corriger, à un champ près.
 *
 * ── L'ASYMÉTRIE EST DÉLIBÉRÉE ───────────────────────────────
 *
 * On applique le masquage, jamais la restauration. Le serveur seul détient
 * `moderation_original_pseudo` ; le rendre localement exigerait de le garder
 * en mémoire, donc de porter côté client une copie du pseudo qu'on est en
 * train d'effacer. Le coût de l'asymétrie est de voir « Joueur modéré »
 * quelques secondes de trop après une réactivation — sans conséquence. Le
 * coût inverse serait d'afficher un pseudo obscène devant une salle.
 *
 * `pseudo` et `score` sont OPTIONNELS dans la contrainte de type : un appelant
 * qui ne les porte pas garde le comportement d'origine, et le recouvrement ne
 * fabrique jamais un champ que la liste n'avait pas.
 */
export function appliquerModerationLocale<
  T extends {
    id: string;
    moderationState: "active" | "hidden" | "banned";
    pseudo?: string;
    score?: number;
  },
>(joueurs: readonly T[], locales: Readonly<Record<string, T["moderationState"]>>): T[] {
  return joueurs.map((joueur) => {
    const locale = locales[joueur.id];
    if (locale === undefined || locale === joueur.moderationState) return joueur;
    if (locale === "active") {
      // On ne restaure PAS le pseudo, et l'asymétrie est voulue : seul le
      // serveur détient l'original (`moderation_original_pseudo`), qu'il rend
      // au prochain rafraîchissement. Voir le pavé ci-dessous.
      return { ...joueur, moderationState: locale };
    }
    return {
      ...joueur,
      moderationState: locale,
      ...(joueur.pseudo === undefined ? {} : { pseudo: PSEUDO_MODERE }),
      ...(joueur.score === undefined ? {} : { score: 0 }),
    };
  });
}
