import type { SpinWheelIssue } from "@/components/dashboard/loyalty-settings-presets";
import type { EtapeQuiz } from "@/components/dashboard/atelier-quiz-etapes";

/**
 * LES PRÉCONDITIONS D'OUVERTURE D'UN QUIZ — une seule vérité, deux lecteurs.
 *
 * Ces règles vivaient dans une fonction PRIVÉE de `src/actions/quiz.ts`
 * (`activationBlocker`), calculée APRÈS le clic sur « Ouvrir aux joueurs ». Le
 * commerçant apprenait donc ce qui manquait au moment où il croyait avoir fini.
 * L'étape « La vérification » de l'Atelier a besoin des MÊMES règles AVANT le
 * geste : les recopier aurait créé deux vérités sur « peut-on ouvrir ? », la
 * faute que `atelier-verification-state.ts` interdit explicitement.
 *
 * Ce module est donc PUR (aucun IO, aucune date implicite) et il est consommé
 * par les deux : l'action, dont le comportement et les messages sont
 * INCHANGÉS, et l'écran de vérification, qui raconte en plus ce que le serveur
 * ne vérifie PAS (roue offerte incapable de distribuer, stock déjà consommé,
 * tirage différé encore à déclencher).
 */

export const QUIZ_BLOCAGE_QUESTIONS =
  "Ajoutez au moins une question avant d'activer le quiz.";
export const QUIZ_BLOCAGE_LOT =
  "Indiquez le libellé du lot (ou choisissez une roue offerte) avant d'activer.";
export const QUIZ_BLOCAGE_STOCK =
  "Indiquez le stock du lot : il borne le nombre de joueurs récompensés.";

/** Ce que l'ACTION relit en base avant d'autoriser la transition. */
export interface EtatActivationQuiz {
  reward_mode: string;
  reward_label: string;
  target_wheel_id: string | null;
  reward_stock: number;
  questionCount: number;
}

/**
 * Quiz prêt à l'activation ? Message d'erreur sinon (null = OK).
 *
 * Ordre et libellés STRICTEMENT identiques à ceux de l'action d'origine : ce
 * message part tel quel au commerçant, un test le compare.
 */
export function blocageActivationQuiz(quiz: EtatActivationQuiz): string | null {
  if (quiz.questionCount < 1) return QUIZ_BLOCAGE_QUESTIONS;
  if (quiz.reward_mode !== "none") {
    if (!quiz.target_wheel_id && !quiz.reward_label.trim()) {
      return QUIZ_BLOCAGE_LOT;
    }
    if (quiz.reward_stock < 1) return QUIZ_BLOCAGE_STOCK;
  }
  return null;
}

// ────────────────────────────────────────────────────────────
// L'étape « La vérification » : les mêmes règles, plus ce que
// le serveur ne regarde pas.
// ────────────────────────────────────────────────────────────

export interface EntreeVerificationQuiz {
  rewardMode: string;
  rewardLabel: string;
  rewardStock: number;
  rewardClaimedCount: number;
  targetWheelId: string | null;
  drawState: "pending" | "done";
  questionCount: number;
  /**
   * La roue offerte désignée, telle que la page la connaît. `null` quand
   * aucune n'est choisie OU quand celle qui l'était a été supprimée — les deux
   * cas se distinguent par `targetWheelId`.
   */
  roueCible: { nom: string; probleme: SpinWheelIssue } | null;
}

export interface ControleQuiz {
  cle: string;
  ok: boolean;
  /** Faux = simple avertissement : il n'empêche PAS l'ouverture. */
  bloquant: boolean;
  titre: string;
  detail: string;
  /** Étape de l'Atelier qui corrige ce point. */
  etape?: EtapeQuiz;
}

export interface VerificationQuiz {
  controles: ControleQuiz[];
  /** Tous les points BLOQUANTS sont-ils satisfaits ? */
  toutPret: boolean;
}

export function verificationQuiz(
  entree: EntreeVerificationQuiz,
): VerificationQuiz {
  const controles: ControleQuiz[] = [];
  const emet = entree.rewardMode !== "none";

  controles.push({
    cle: "questions",
    ok: entree.questionCount >= 1,
    bloquant: true,
    titre: "Le quiz a au moins une question",
    detail:
      entree.questionCount >= 1
        ? `${entree.questionCount} question${entree.questionCount > 1 ? "s" : ""} enregistrée${entree.questionCount > 1 ? "s" : ""}.`
        : QUIZ_BLOCAGE_QUESTIONS,
    etape: "questions",
  });

  if (!emet) {
    controles.push({
      cle: "dotation",
      ok: true,
      bloquant: true,
      titre: "Ce quiz se joue sans gain",
      detail:
        "Aucun lot n'est remis : rien à provisionner, rien à retirer en caisse.",
      etape: "dotation",
    });
  } else {
    const lotNomme =
      Boolean(entree.targetWheelId) || entree.rewardLabel.trim().length > 0;
    controles.push({
      cle: "lot",
      ok: lotNomme,
      bloquant: true,
      titre: "Le lot est nommé",
      detail: lotNomme
        ? entree.targetWheelId
          ? "Les gagnants reçoivent un tour de roue offert."
          : `Les gagnants reçoivent « ${entree.rewardLabel.trim()} ».`
        : QUIZ_BLOCAGE_LOT,
      etape: "dotation",
    });

    controles.push({
      cle: "stock",
      ok: entree.rewardStock >= 1,
      bloquant: true,
      titre: "Le stock du lot est renseigné",
      detail:
        entree.rewardStock >= 1
          ? `${entree.rewardStock} lot${entree.rewardStock > 1 ? "s" : ""} au maximum, dont ${entree.rewardClaimedCount} déjà remis.`
          : QUIZ_BLOCAGE_STOCK,
      etape: "dotation",
    });

    // ── Ce que le serveur ne vérifie PAS ──
    const restants = entree.rewardStock - entree.rewardClaimedCount;
    if (entree.rewardStock >= 1 && restants <= 0) {
      controles.push({
        cle: "stock-epuise",
        ok: false,
        bloquant: false,
        titre: "Le stock est déjà épuisé",
        detail:
          "Le quiz peut s'ouvrir, mais plus aucun code ne sera émis : augmentez le stock pour récompenser de nouveaux joueurs.",
        etape: "dotation",
      });
    }

    if (entree.targetWheelId && !entree.roueCible) {
      controles.push({
        cle: "roue-absente",
        ok: false,
        bloquant: false,
        titre: "La roue offerte a été supprimée",
        detail:
          "La roue désignée n'existe plus : choisissez-en une autre, sinon le tour offert ne mènera nulle part.",
        etape: "dotation",
      });
    } else if (entree.roueCible && entree.roueCible.probleme !== "none") {
      controles.push({
        cle: "roue-tirable",
        ok: false,
        bloquant: false,
        titre: `La roue « ${entree.roueCible.nom} » ne distribuera pas tout`,
        detail:
          entree.roueCible.probleme === "nothing_drawable"
            ? "Aucun de ses lots n'est tirable en tour offert : le joueur conserverait son tour sans rien gagner. Donnez un stock à au moins un lot."
            : "Certains de ses lots sont à stock illimité et ne sortiront jamais en tour offert. Donnez-leur un stock pour les rendre tirables.",
        etape: "dotation",
      });
    }

    if (
      (entree.rewardMode === "draw" || entree.rewardMode === "ranking") &&
      entree.drawState === "pending"
    ) {
      controles.push({
        cle: "tirage",
        ok: true,
        bloquant: false,
        titre: "Le tirage reste à déclencher",
        detail:
          "Ce mode ne remet rien pendant la partie : c'est vous qui lancez le tirage, depuis le suivi du quiz, quand vous l'estimez terminé.",
      });
    }
  }

  return {
    controles,
    toutPret: controles.every((c) => !c.bloquant || c.ok),
  };
}
