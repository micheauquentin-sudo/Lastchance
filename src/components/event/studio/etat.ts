import { codeTtlDaysInitial } from "@/components/dashboard/code-ttl-days-field";
import type {
  EditorQuestion,
  EditorSession,
} from "@/components/dashboard/event-editor";
import type { EventQuestionType } from "@/types/database";

/**
 * L'ÉTAT DU STUDIO DE LA SOIRÉE — TROIS CANAUX D'ÉCRITURE, ET C'EST LE MODULE
 * QUI LES IMPOSE (VIT-47).
 *
 * ADR-156 a tranché qu'un studio peut avoir plusieurs canaux d'écriture mais
 * jamais deux états sur la MÊME chose. La soirée en porte trois, de formes
 * différentes, parce que ses actions ne se ressemblent pas :
 *
 *  · `updateEventGame(prev, FormData)` — le nom du jeu, posté par le `<form>`
 *    vide de la coquille (`ChampsCachesSoiree`) ;
 *  · `updateEventQuestion({ … })` — un OBJET typé, appelé à la main, qui écrit
 *    type + intitulé + temps + points + options D'UN SEUL TENANT ;
 *  · `updateEventSession({ … })` — un OBJET typé lui aussi, qui écrit
 *    étiquette + lot + détails + stock, plus l'échéance du code.
 *
 * Les fusionner aurait voulu dire réécrire trois actions serveur pour arranger
 * un écran. Ce qui est unifié, c'est ce qui doit l'être : une seule source par
 * chose réglée, et une seule fonction qui construit chaque charge.
 *
 * ── LES DEUX PIÈGES QUE CE FICHIER EXISTE POUR DÉSAMORCER ──
 *
 * 1. `updateEventQuestion` EST INDIVISIBLE. Son schéma exige le type, et
 *    `refineQuestion` croise le type et la bonne réponse : une charge qui ne
 *    porterait que le chronomètre serait refusée, ou pire, retomberait sur un
 *    défaut. « Vos questions » et « Le temps de réponse » sont donc deux VUES
 *    d'une seule charge, construite ici par `chargeRythmeEvenement` — jamais
 *    deux soumissions.
 *
 * 2. `updateEventSession` LIT SES CHAMPS AVEC `input.X ?? ""`. Omettre le stock
 *    n'écrit pas « inchangé », il écrit `0` — c'est-à-dire « podium sans lot »,
 *    en silence, sur une salle qui en avait un. `chargeSalleEvenement` rend donc
 *    TOUJOURS les quatre, quelle que soit l'étape ouverte.
 *
 *    Et `codeTtlDays` y est le champ inverse : l'ABSENCE de la clé vaut « ne
 *    touche pas », la chaîne VIDE vaut « sans limite ». Les deux sont légitimes
 *    et l'action ne les distingue que par `undefined`. Le studio l'affiche
 *    toujours, donc il le rend toujours — jamais `codeTtlDays || undefined`.
 */

// ────────────────────────────────────────────────────────────
// 1. Le nom du jeu — canal `FormData`
// ────────────────────────────────────────────────────────────

export interface EtatSoiree {
  /** La charge d'`updateEventGame`, moins l'identifiant. */
  name: string;
}

/**
 * Aucun défaut n'est INVENTÉ ici : le nom vient de la ligne, tel quel. Le studio
 * du produit voisin a payé l'inverse — résoudre des défauts au montage grave en
 * base des décisions que personne n'a prises (VIT-19), et l'enregistrement
 * automatique du socle les enverrait dès l'ouverture de l'écran.
 */
export function etatInitialSoiree(name: string): EtatSoiree {
  return { name };
}

// ────────────────────────────────────────────────────────────
// 2. Le rythme d'une question — canal OBJET, charge INDIVISIBLE
// ────────────────────────────────────────────────────────────

export interface EtatRythme {
  /** Secondes accordées pour répondre (5 à 300 côté schéma). */
  timeLimitSeconds: number;
  /** Base des points ; sans effet sur un sondage. */
  pointsBase: number;
}

export function etatInitialRythme(question: EditorQuestion): EtatRythme {
  return {
    timeLimitSeconds: question.timeLimitSeconds,
    pointsBase: question.pointsBase,
  };
}

/** L'entrée EXACTE d'`updateEventQuestion`, moins la confirmation de sens. */
export interface ChargeQuestionSoiree {
  id: string;
  questionType: EventQuestionType;
  prompt: string;
  timeLimitSeconds: number;
  pointsBase: number;
  options: Array<{ label: string; is_correct: boolean }>;
}

/**
 * LA CHARGE D'`updateEventQuestion`, CONSTRUITE À UN SEUL ENDROIT.
 *
 * ── CE QU'ELLE PROTÈGE, ET LE DÉFAUT QU'ELLE FERME AVANT QU'IL ARRIVE ──
 *
 * L'étape « Le temps de réponse et les points » ne règle que deux nombres. Si
 * elle n'envoyait que ces deux nombres, le schéma `updateEventQuestionSchema`
 * exigerait quand même `question_type`, `prompt` et `options` : une charge
 * amputée serait refusée — au mieux — et un défaut posé à la main aurait
 * transformé chaque quiz en sondage, en effaçant sa bonne réponse. Personne ne
 * relierait « j'ai changé le chrono » à « mon classement de fin de soirée est
 * faux ».
 *
 * Le type, l'intitulé et les options viennent donc de la LIGNE SERVEUR, jamais
 * d'un défaut : ce qui n'est pas réglé ici est renvoyé tel qu'il est en base.
 * `is_correct` compris — c'est la valeur que `reveal_event_question` lira le
 * soir venu.
 *
 * (Le serveur gèle de toute façon `is_correct` et `question_type` dès la
 * première réponse reçue. Cette garde-là est la sienne ; celle-ci est la nôtre,
 * et elle vaut AVANT la première réponse, c'est-à-dire pendant toute la
 * préparation.)
 */
export function chargeRythmeEvenement(
  question: EditorQuestion,
  etat: EtatRythme,
): ChargeQuestionSoiree {
  return {
    id: question.id,
    questionType: question.questionType,
    prompt: question.prompt,
    timeLimitSeconds: etat.timeLimitSeconds,
    pointsBase: etat.pointsBase,
    options: question.options.map((o) => ({
      label: o.label,
      is_correct: o.isCorrect,
    })),
  };
}

// ────────────────────────────────────────────────────────────
// 3. Une salle — canal OBJET, quatre champs qui voyagent ensemble
// ────────────────────────────────────────────────────────────

export interface EtatSalle {
  label: string;
  rewardLabel: string;
  rewardDetails: string;
  /**
   * Saisie BRUTE du stock. Même parti pris que le calendrier (VIT-39) et le
   * quiz (VIT-41) : la chaîne voyage telle quelle et se fait valider par le
   * schéma, qui porte déjà tous les messages. Reconstruire un nombre ici
   * transformerait un champ vidé le temps de retaper en un `0` silencieux — et
   * un stock à zéro n'émet plus aucun code de retrait au podium.
   */
  rewardStock: string;
  /** Saisie BRUTE en jours ; `""` = sans limite, et c'est une VALEUR. */
  codeTtlDays: string;
}

export function etatInitialSalle(session: EditorSession): EtatSalle {
  return {
    label: session.label ?? "",
    rewardLabel: session.rewardLabel,
    rewardDetails: session.rewardDetails ?? "",
    rewardStock: String(session.rewardStock),
    codeTtlDays: codeTtlDaysInitial(session.codeTtlDays),
  };
}

/** L'entrée EXACTE d'`updateEventSession`. */
export interface ChargeSalleSoiree {
  id: string;
  label: string;
  rewardLabel: string;
  rewardDetails: string;
  rewardStock: string;
  codeTtlDays: string;
}

/**
 * LA CHARGE D'`updateEventSession`, CONSTRUITE À UN SEUL ENDROIT.
 *
 * LES CINQ CHAMPS, TOUJOURS, et ce n'est pas une précaution de style : l'action
 * lit `input.label ?? ""`, `input.rewardStock ?? ""` et consorts. Une étape qui
 * n'aurait rendu que l'étiquette aurait remis à zéro le lot, ses détails et son
 * stock — « podium sans lot » — sur une salle que personne n'avait touchée, et
 * l'action aurait répondu « enregistré » en disant vrai.
 *
 * `codeTtlDays` est le seul champ où l'action distingue l'absence du vide :
 * absent ⇒ colonne intacte, vide ⇒ « sans limite ». Le studio l'affiche
 * toujours, il le rend donc toujours — `.trim()` et jamais `|| undefined`.
 */
export function chargeSalleEvenement(
  id: string,
  etat: EtatSalle,
): ChargeSalleSoiree {
  return {
    id,
    label: etat.label,
    rewardLabel: etat.rewardLabel,
    rewardDetails: etat.rewardDetails,
    rewardStock: etat.rewardStock,
    codeTtlDays: etat.codeTtlDays.trim(),
  };
}
