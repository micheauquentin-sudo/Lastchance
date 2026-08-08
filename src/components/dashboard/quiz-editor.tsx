"use client";

import { useActionState, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  createQuizQuestion,
  deleteQuiz,
  deleteQuizQuestion,
  drawQuizWinners,
  reorderQuizQuestions,
  setQuizStatus,
  updateQuiz,
  updateQuizQuestion,
  updateQuizReward,
  type QuizDrawActionResult,
} from "@/actions/quiz";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  CodeTtlDaysField,
  codeTtlDaysInitial,
} from "@/components/dashboard/code-ttl-days-field";
import { InfoBulle } from "@/components/dashboard/info-bulle";
import { FieldError, Input, Label } from "@/components/ui/input";
import { RankingPicker } from "@/components/ui/ranking-picker";
import {
  QUIZ_INTRO_MAX,
  QUIZ_NAME_MAX,
  QUIZ_POINTS_MAX,
  QUIZ_PROMPT_MAX,
  QUIZ_TEXT_VARIANT_MAX,
  QUIZ_TEXT_VARIANTS_MAX,
  QUIZ_TIME_LIMIT_MAX,
  QUIZ_TIME_LIMIT_MIN,
  type QuizOption,
  type QuizQuestionType,
  type QuizRewardMode,
  type QuizSolutionInput,
  type QuizTheme,
} from "@/lib/quiz";
import { QUIZ_DELETE_LOSS_HINT } from "@/lib/validations/quiz";
import { cleOrdre, ordreAffiche, type OrdreLocal } from "@/lib/ordre-optimiste";
import { useActionForm } from "@/lib/use-action-form";
import { useAutoSave } from "@/lib/use-auto-save";
import { useAutoSaveManuel } from "@/lib/use-auto-save-manuel";
import { AutoSaveEtat } from "@/components/dashboard/auto-save-etat";
import type { ActionResult } from "@/lib/utils";
import {
  QUIZ_PRESET_INFOS,
  quizFormShape,
  quizPresetAllowsType,
  quizPresetDefaultType,
  quizPresetInfo,
  quizQuestionTypeLabel,
} from "@/components/quiz/quiz-presets";
import { QUIZ_THEME_ORDER, quizThemeTokens } from "@/components/quiz/quiz-theme";
import { ThemeDecor } from "@/components/ui/theme-decor";
import { spinWheelIssue, type SpinWheelPrizes } from "./loyalty-settings-presets";

/* Éditeur commerçant du Créateur de quiz. Trois cartes, dans l'ordre du travail
   réel : statut → réglages → questions → dotation. Miroir de structure de
   calendar-editor.tsx (mêmes primitives, mêmes classes, mêmes gestes). */

/** Bornes miroir de src/lib/pronostics.ts (non importable côté client : node:crypto). */
const OPTIONS_MIN = 2;
const OPTIONS_MAX = 50;
const OPTION_LABEL_MAX = 120;
const NUMBER_MAX = 1_000_000_000;

const selectClass =
  "w-full rounded-xl border-2 border-k-ink bg-white px-3.5 py-2.5 text-sm text-k-ink focus:outline-none focus:ring-2 focus:ring-k-yellow focus:ring-offset-1";
const textareaClass =
  "w-full rounded-xl border-2 border-k-ink bg-white px-3.5 py-2.5 text-sm text-k-ink placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-k-yellow focus:ring-offset-1";

// ────────────────────────────────────────────────────────────
// Vues préparées côté serveur
// ────────────────────────────────────────────────────────────

/** Roue de l'organisation ciblable par un tour offert, avec l'état de ses lots. */
export interface QuizWheelOption extends SpinWheelPrizes {
  id: string;
  name: string;
}

export interface DashboardQuiz {
  id: string;
  name: string;
  theme: QuizTheme;
  status: "draft" | "active" | "archived";
  publicSlug: string | null;
  introText: string | null;
  rewardMode: QuizRewardMode;
  rewardThreshold: number | null;
  drawTopN: number | null;
  rewardLabel: string;
  rewardDetails: string | null;
  rewardStock: number;
  rewardClaimedCount: number;
  targetWheelId: string | null;
  /** Tirage différé déjà effectué (colonne RPC-only, jamais remise à pending). */
  drawState: "pending" | "done";
  drawnAt: string | null;
  /** Validité du code QUIZ- émis, en jours (null = sans limite). */
  codeTtlDays: number | null;
}

export interface DashboardQuizQuestion {
  id: string;
  position: number;
  questionType: QuizQuestionType;
  preset: string;
  prompt: string;
  options: QuizOption[];
  /** Résultat officiel (jsonb brut). Côté commerçant : aucun enjeu de fuite. */
  correctAnswer: unknown;
  imageUrl: string | null;
  timeLimitSeconds: number | null;
  points: number;
  tolerance: number | null;
  rankingSize: number | null;
}

// ────────────────────────────────────────────────────────────
// Statut (activer / archiver) + suppression
// ────────────────────────────────────────────────────────────

export function QuizStatusControls({ quiz }: { quiz: DashboardQuiz }) {
  // useActionForm et non useActionState : l'état de chargement doit retomber
  // même quand le rendu ne rejoue pas la revalidation — docs/bugs.md.
  const {
    state: statusState,
    pending: statusPending,
    onSubmit: statusSubmit,
  } = useActionForm(setQuizStatus, {
    // `reloadOnSuccess` : le badge d'état et la carte « Page publique »
    // suivent la prop serveur, donc le rafraîchissement — mesuré défaillant
    // (docs/bugs.md). Le geste est idempotent, mais l'écran affirmerait le
    // CONTRAIRE de l'état réel d'une page ouverte aux clients.
    reloadOnSuccess: true,
    networkError: "Changement de statut impossible, réessayez.",
  });
  /* `deleteQuiz` RESTE en useActionState : son succès EST un redirect() vers
     /dashboard/quiz. Appelée impérativement, le NEXT_REDIRECT sortirait par le
     catch et afficherait une erreur sur une suppression pourtant réussie. Le
     défaut de transition figée ne peut pas s'y manifester : la navigation quitte
     l'écran, le `pending` n'a pas à retomber. */
  const [deleteState, deleteAction, deletePending] = useActionState(
    deleteQuiz,
    null,
  );
  const [confirmDelete, setConfirmDelete] = useState(false);

  return (
    <Card>
      <h2 className="font-semibold mb-4">Statut du quiz</h2>

      <div className="flex flex-wrap items-center gap-3">
        {quiz.status !== "active" ? (
          <form onSubmit={statusSubmit}>
            <input type="hidden" name="id" value={quiz.id} />
            <input type="hidden" name="status" value="active" />
            <Button type="submit" disabled={statusPending}>
              {statusPending ? "…" : "Ouvrir aux joueurs"}
            </Button>
          </form>
        ) : (
          <form onSubmit={statusSubmit}>
            <input type="hidden" name="id" value={quiz.id} />
            <input type="hidden" name="status" value="archived" />
            <Button type="submit" variant="secondary" disabled={statusPending}>
              {statusPending ? "…" : "Clôturer"}
            </Button>
          </form>
        )}

        {quiz.status === "active" && (
          <span className="rounded-full border-2 border-k-ink bg-k-green/40 px-3 py-1 text-xs font-black text-k-ink">
            Ouverte aux joueurs — la page du quiz est accessible à vos clients
          </span>
        )}
      </div>

      {quiz.status !== "active" && (
        <p className="mt-3 text-sm text-zinc-500">
          Pour ouvrir aux joueurs : au moins une question, et — dès qu&apos;un mode remet un
          lot — un lot nommé (ou une roue offerte) avec son stock.
        </p>
      )}
      {/* Le refus d'activation vient du serveur : on affiche SON message tel quel. */}
      <FieldError
        message={statusState && !statusState.ok ? statusState.error : undefined}
      />

      <div className="mt-5 border-t border-zinc-100 pt-4">
        {confirmDelete ? (
          <form action={deleteAction} className="flex flex-wrap items-center gap-2">
            <input type="hidden" name="id" value={quiz.id} />
            <span className="text-sm text-k-body">
              Supprimer ce quiz, ses questions et les participations ?
            </span>
            {/* La case n'apparaît qu'APRÈS le refus qui NOMME le nombre de
                codes QUIZ- encore à retirer : avant ce refus, le commerçant ne
                saurait pas ce qu'il confirme. */}
            {deleteState &&
              !deleteState.ok &&
              deleteState.error.includes(QUIZ_DELETE_LOSS_HINT) && (
                <label className="flex w-full max-w-md items-start gap-1.5 text-xs font-semibold text-red-700">
                  <input
                    type="checkbox"
                    name="confirm_outstanding"
                    value="1"
                    className="mt-0.5 h-3.5 w-3.5 shrink-0"
                  />
                  Je comprends que les codes non retirés deviendront
                  introuvables en caisse.
                </label>
              )}
            <Button type="submit" variant="danger" disabled={deletePending}>
              {deletePending ? "Suppression…" : "Confirmer"}
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={() => setConfirmDelete(false)}
              disabled={deletePending}
            >
              Annuler
            </Button>
          </form>
        ) : (
          <Button
            type="button"
            variant="ghost"
            className="text-red-600 hover:bg-red-50"
            onClick={() => setConfirmDelete(true)}
          >
            Supprimer le quiz
          </Button>
        )}
        <FieldError
          message={deleteState && !deleteState.ok ? deleteState.error : undefined}
        />
      </div>
    </Card>
  );
}

// ────────────────────────────────────────────────────────────
// Réglages : nom, habillage, URL publique, consigne
// ────────────────────────────────────────────────────────────

function ThemeSelector({ value }: { value: QuizTheme }) {
  const [theme, setTheme] = useState<QuizTheme>(value);
  return (
    <fieldset>
      <legend className="mb-1 text-sm font-bold text-k-ink">Habillage</legend>
      <p className="mb-3 text-xs text-zinc-500">
        Change les couleurs, les emoji et les dessins de fond de la page jouée
        par vos clients — la DA « carton kermesse » reste la même.
      </p>
      {/* La valeur retenue voyage dans un champ caché contrôlé. */}
      <input type="hidden" name="theme" value={theme} />
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
        {QUIZ_THEME_ORDER.map((key) => {
          const tokens = quizThemeTokens(key);
          const active = key === theme;
          return (
            <label
              key={key}
              className={`cursor-pointer rounded-2xl border-2 p-2.5 transition-colors ${
                active
                  ? "border-k-ink bg-k-yellow/20 shadow-[3px_3px_0_var(--color-k-ink)]"
                  : "border-k-ink/20 bg-white hover:border-k-ink/50"
              }`}
            >
              <input
                type="radio"
                name="theme-choice"
                value={key}
                checked={active}
                onChange={() => setTheme(key)}
                className="sr-only"
              />
              {/* `relative` + décor en premier enfant : même empilement que la
                  page publique (ordre du DOM, aucun z-index) — la vignette
                  montre le décor que verront vraiment les clients. */}
              <div
                aria-hidden
                className="relative mb-2 flex items-center gap-1.5 overflow-hidden rounded-lg border-2 border-k-ink p-1.5"
                style={tokens.pageStyle}
              >
                <ThemeDecor decor={tokens.decor} variant="vignette" />
                <span
                  className={`relative flex h-7 w-7 items-center justify-center rounded-md text-sm ${tokens.accentChip}`}
                >
                  {tokens.faceEmoji}
                </span>
                <span
                  className={`relative h-2 flex-1 rounded-full ${tokens.progressFill}`}
                />
              </div>
              <p className="flex items-center justify-between text-sm font-black text-k-ink">
                <span>
                  {tokens.titleEmoji} {tokens.label}
                </span>
                {active && <span className="text-k-green">✓</span>}
              </p>
              <p className="mt-0.5 text-[11px] leading-snug text-zinc-600">
                {tokens.usage}
              </p>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

export function QuizSettings({ quiz }: { quiz: DashboardQuiz }) {
  // useActionForm et non useActionState : l'état de chargement doit retomber
  // même quand le rendu ne rejoue pas la revalidation — docs/bugs.md.
  //
  // PAS de `resetOnSuccess` : les trois champs sont NON CONTRÔLÉS et PRÉ-REMPLIS
  // (nom, consigne, URL publique). React 19 les réinitialisait après CHAQUE
  // action, y compris en échec — sur « Cette URL publique est déjà utilisée », la
  // saisie du commerçant était effacée. Elle survit désormais au refus, ce qui
  // est le comportement voulu.
  const { state, pending, onSubmit } = useActionForm(updateQuiz, {
    networkError: "Enregistrement impossible, réessayez.",
    // Sans bouton à regarder, le résultat d'un enregistrement automatique doit
    // s'annoncer ailleurs : le « Enregistré. » ci-dessous reste, le bandeau
    // global le double pour la sauvegarde qui part toute seule.
    toastOnSuccess: "Enregistré.",
  });
  // À CÔTÉ de `useActionForm`, jamais autour : deux gardes mécaniques du dépôt
  // cherchent l'appel littéral dans les `.tsx`.
  const formRef = useRef<HTMLFormElement>(null);
  const { enAttente, bloqueParValidation } = useAutoSave(formRef);
  // Le réglage vit dans le formulaire de RÉGLAGES (`updateQuizSchema`) et non
  // dans celui de la dotation : c'est le quiz qui porte la colonne, et le
  // formulaire de dotation n'a pas le droit d'y toucher — s'il portait le
  // champ, enregistrer une dotation réécrirait l'échéance.
  const [codeTtlDays, setCodeTtlDays] = useState(() =>
    codeTtlDaysInitial(quiz.codeTtlDays),
  );

  return (
    <Card>
      <h2 className="font-semibold mb-1">Réglages</h2>
      <p className="text-sm text-zinc-500 mb-5">
        Nom, habillage, adresse publique et consigne d&apos;accueil.
      </p>

      <form ref={formRef} onSubmit={onSubmit} className="space-y-6">
        <input type="hidden" name="id" value={quiz.id} />

        <div className="max-w-sm">
          <Label htmlFor="quiz-settings-name">Nom du quiz</Label>
          <Input
            id="quiz-settings-name"
            name="name"
            defaultValue={quiz.name}
            required
            maxLength={QUIZ_NAME_MAX}
          />
        </div>

        <ThemeSelector value={quiz.theme} />

        <div>
          <Label htmlFor="quiz-intro">Consigne d&apos;accueil (optionnel)</Label>
          <textarea
            id="quiz-intro"
            name="intro_text"
            defaultValue={quiz.introText ?? ""}
            maxLength={QUIZ_INTRO_MAX}
            rows={4}
            placeholder="Ce texte s'affiche avant la première question : règle du jeu, durée, ce qu'on peut gagner…"
            className={textareaClass}
          />
        </div>

        {/* URL publique PRÉ-REMPLIE : un enregistrement sans ce champ la viderait. */}
        <div>
          <Label htmlFor="quiz-slug">URL publique</Label>
          <div className="flex flex-wrap items-center gap-1 text-sm text-zinc-500">
            <span className="font-mono">…/quiz/</span>
            <Input
              id="quiz-slug"
              name="public_slug"
              defaultValue={quiz.publicSlug ?? ""}
              maxLength={64}
              pattern="[a-z0-9-]{3,64}"
              placeholder="mon-quiz"
              className="w-56 font-mono"
              aria-describedby="quiz-slug-help"
            />
          </div>
          <p id="quiz-slug-help" className="mt-1.5 text-xs text-zinc-500">
            Une adresse lisible pour le QR et le partage (3 à 64 caractères :
            a-z, 0-9, tirets).
          </p>
          <InfoBulle
            id="aide-quiz-slug"
            resume="Puis-je la changer après avoir imprimé le QR code ?"
            className="mt-2"
          >
            Techniquement oui, mais l&apos;ancienne adresse ne répondra plus :
            les affiches déjà collées en vitrine mèneraient vers une page
            introuvable. Changez-la avant d&apos;imprimer, ou réimprimez le QR
            après.
          </InfoBulle>
        </div>

        <CodeTtlDaysField
          idPrefix="quiz"
          value={codeTtlDays}
          onChange={setCodeTtlDays}
          emissionHint="Délai laissé au joueur pour présenter son code QUIZ- en caisse, à partir du moment où le lot lui est attribué (fin du quiz, ou tirage pour les modes différés)."
        />

        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" variant="secondary" disabled={pending}>
            {pending ? "…" : "Enregistrer"}
          </Button>
          {state?.ok && (
            <p className="text-sm font-medium text-emerald-600">Enregistré.</p>
          )}
          <AutoSaveEtat
            enAttente={enAttente}
            bloqueParValidation={bloqueParValidation}
          />
        </div>
        <FieldError message={state && !state.ok ? state.error : undefined} />
      </form>
    </Card>
  );
}

// ────────────────────────────────────────────────────────────
// Dotation : les 5 modes de récompense
// ────────────────────────────────────────────────────────────

const REWARD_MODES: Array<{
  key: QuizRewardMode;
  label: string;
  icon: string;
  hint: string;
}> = [
  {
    key: "threshold",
    label: "À partir de X bonnes réponses",
    icon: "🎯",
    hint: "Le lot est remis dès que le joueur atteint le seuil que vous fixez.",
  },
  {
    key: "draw",
    label: "Tirage au sort parmi les meilleurs",
    icon: "🎲",
    hint: "Vous déclenchez le tirage quand vous voulez, dans un vivier des meilleurs scores.",
  },
  {
    key: "ranking",
    label: "Classement (score puis rapidité)",
    icon: "🥇",
    hint: "Les premiers du classement sont dotés, dans la limite du stock.",
  },
  {
    key: "instant",
    label: "Gain immédiat pour tous",
    icon: "🎁",
    hint: "Chaque joueur qui termine reçoit un lot, tant qu'il y a du stock.",
  },
  {
    key: "none",
    label: "Sans gain",
    icon: "🙂",
    hint: "Pour le plaisir : aucun lot, rien à provisionner.",
  },
];

/** Le mode émet-il un lot au moment même où le joueur termine ? */
function isImmediateMode(mode: QuizRewardMode): boolean {
  return mode === "threshold" || mode === "instant";
}

/** Le mode attend-il un tirage/classement déclenché par le commerçant ? */
function isDeferredMode(mode: QuizRewardMode): boolean {
  return mode === "draw" || mode === "ranking";
}

export function QuizRewardEditor({
  quiz,
  wheels,
}: {
  quiz: DashboardQuiz;
  wheels: QuizWheelOption[];
}) {
  const router = useRouter();
  const [mode, setMode] = useState<QuizRewardMode>(quiz.rewardMode);
  const [threshold, setThreshold] = useState(
    quiz.rewardThreshold === null ? "" : String(quiz.rewardThreshold),
  );
  const [drawTopN, setDrawTopN] = useState(
    quiz.drawTopN === null ? "" : String(quiz.drawTopN),
  );
  const [label, setLabel] = useState(quiz.rewardLabel);
  const [details, setDetails] = useState(quiz.rewardDetails ?? "");
  const [stock, setStock] = useState(String(quiz.rewardStock));
  const missingWheel =
    quiz.targetWheelId !== null && !wheels.some((w) => w.id === quiz.targetWheelId);
  const [wheelId, setWheelId] = useState(
    missingWheel ? "" : (quiz.targetWheelId ?? ""),
  );

  // Patron manuel et non useTransition : l'état de chargement doit retomber même
  // quand le rendu ne rejoue pas la revalidation — docs/bugs.md. (L'action prend
  // un objet typé, pas une FormData : useActionForm ne s'y applique pas.)
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<ActionResult | null>(null);

  const emits = mode !== "none";
  const wheelAllowed = isImmediateMode(mode);
  const selectedWheel = wheels.find((w) => w.id === wheelId) ?? null;
  const issue =
    wheelAllowed && wheelId ? spinWheelIssue(selectedWheel) : "none";

  const enregistrer = async (): Promise<boolean> => {
    setPending(true);
    setResult(null);
    try {
      // Chaque mode ne porte QUE ses propres champs : les autres partent vides,
      // sinon le superRefine (miroir des CHECK SQL) refuse la mise à jour.
      const res = await updateQuizReward({
        id: quiz.id,
        rewardMode: mode,
        rewardThreshold: mode === "threshold" ? threshold : "",
        drawTopN: mode === "draw" ? drawTopN : "",
        rewardLabel: emits ? label : "",
        rewardDetails: emits ? details : "",
        rewardStock: emits ? stock : 0,
        targetWheelId: wheelAllowed ? wheelId : "",
      });
      setResult(res);
      if (res.ok) router.refresh();
      return res.ok;
    } catch {
      // Réseau coupé : le dire, plutôt que de laisser le bouton tourner.
      setResult({ ok: false, error: "Enregistrement impossible, réessayez." });
      return false;
    } finally {
      setPending(false);
    }
  };

  /**
   * ENREGISTREMENT AUTOMATIQUE — à la main, faute de `<form>` : l'action prend
   * un objet typé et le bouton est un `type="button"`.
   *
   * Le bouton passe par le MÊME chemin (`declencher`), sans le délai : un seul
   * verrou, une seule file, donc aucun vol parallèle entre un clic et un
   * minuteur qui arrive. C'est ce que l'ancien `if (pending) return;` faisait
   * en JETANT la seconde — perte silencieuse dès qu'on tape après un départ.
   */
  const carteRef = useRef<HTMLDivElement>(null);
  const { enAttente, declencher } = useAutoSaveManuel(carteRef, {
    signature: JSON.stringify([
      mode,
      threshold,
      drawTopN,
      label,
      details,
      stock,
      wheelId,
    ]),
    enregistrer,
  });

  return (
    <Card ref={carteRef}>
      <h2 className="font-semibold mb-1">Dotation</h2>
      <p className="text-sm text-zinc-500 mb-5">
        Ce que le joueur gagne, et à quelle condition. Le lot se retire en caisse
        avec un code <span className="font-mono">QUIZ-…</span>, sauf si vous
        offrez un tour de roue.
      </p>

      <fieldset className="mb-5 space-y-2">
        <legend className="mb-2 text-sm font-bold text-k-ink">
          Mode de récompense
        </legend>
        {REWARD_MODES.map((m) => {
          const active = m.key === mode;
          return (
            <label
              key={m.key}
              className={`flex cursor-pointer items-start gap-3 rounded-xl border-2 px-3 py-2.5 transition-colors ${
                active
                  ? "border-k-ink bg-k-yellow/25"
                  : "border-k-ink/15 bg-white hover:border-k-ink/40"
              }`}
            >
              <input
                type="radio"
                name="quiz-reward-mode"
                value={m.key}
                checked={active}
                onChange={() => setMode(m.key)}
                className="mt-1 h-4 w-4 shrink-0 accent-k-ink"
              />
              <span className="min-w-0">
                <span className="block text-sm font-bold text-k-ink">
                  <span aria-hidden>{m.icon} </span>
                  {m.label}
                </span>
                <span className="mt-0.5 block text-xs text-zinc-600">{m.hint}</span>
              </span>
            </label>
          );
        })}
      </fieldset>

      {mode === "threshold" && (
        <div className="mb-4">
          <Label htmlFor="quiz-threshold">
            Nombre de bonnes réponses qui donne le lot
          </Label>
          <Input
            id="quiz-threshold"
            type="number"
            min={1}
            max={500}
            value={threshold}
            onChange={(e) => setThreshold(e.target.value)}
            placeholder="Ex : 8"
            className="w-32"
            aria-describedby="quiz-threshold-help"
          />
          <p id="quiz-threshold-help" className="mt-1.5 text-xs text-zinc-500">
            Compté sur les bonnes réponses, pas sur les points.
          </p>
        </div>
      )}

      {mode === "draw" && (
        <div className="mb-4">
          <Label htmlFor="quiz-draw-top">
            Vivier : parmi combien de meilleurs joueurs tirer au sort ?
          </Label>
          <Input
            id="quiz-draw-top"
            type="number"
            min={1}
            max={10_000}
            value={drawTopN}
            onChange={(e) => setDrawTopN(e.target.value)}
            placeholder="Ex : 20"
            className="w-32"
            aria-describedby="quiz-draw-top-help"
          />
          <p id="quiz-draw-top-help" className="mt-1.5 text-xs text-zinc-500">
            Les 20 meilleurs scores (puis les plus rapides) entrent dans le
            chapeau ; le sort désigne les gagnants dans la limite du stock.
          </p>
        </div>
      )}

      {emits && (
        <div className="space-y-3">
          <div>
            <Label htmlFor="quiz-reward-label">Lot remis au joueur</Label>
            <Input
              id="quiz-reward-label"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              maxLength={120}
              placeholder="Ex : Un café offert"
            />
          </div>
          <div>
            <Label htmlFor="quiz-reward-details">Détails (optionnel)</Label>
            <textarea
              id="quiz-reward-details"
              value={details}
              onChange={(e) => setDetails(e.target.value)}
              maxLength={2000}
              rows={2}
              placeholder="Conditions, validité, modalités de retrait…"
              className={textareaClass}
            />
          </div>
          <div>
            <Label htmlFor="quiz-reward-stock">
              Stock du lot (obligatoire, fini)
            </Label>
            <Input
              id="quiz-reward-stock"
              type="number"
              min={0}
              max={1_000_000}
              value={stock}
              onChange={(e) => setStock(e.target.value)}
              className="w-40"
              aria-describedby="quiz-reward-stock-help"
            />
            <p id="quiz-reward-stock-help" className="mt-1.5 text-xs text-zinc-500">
              C&apos;est le nombre MAXIMAL de joueurs récompensés : au-delà, plus
              aucun code n&apos;est émis.
              {quiz.rewardClaimedCount > 0 && (
                <>
                  {" "}
                  {quiz.rewardClaimedCount} lot(s) déjà remis — le stock ne peut
                  pas descendre en dessous.
                </>
              )}
            </p>
          </div>

          {wheelAllowed ? (
            <div>
              <Label htmlFor="quiz-reward-wheel">
                Ou offrir un tour de roue (optionnel)
              </Label>
              {wheels.length === 0 ? (
                <p className="rounded-xl border-2 border-amber-300 bg-amber-50 px-3 py-2 text-sm font-bold text-amber-800">
                  Aucune roue disponible — créez d&apos;abord une roue dans vos
                  campagnes.
                </p>
              ) : (
                <select
                  id="quiz-reward-wheel"
                  value={wheelId}
                  onChange={(e) => setWheelId(e.target.value)}
                  className={`${selectClass} max-w-sm`}
                >
                  <option value="">— Pas de roue, un lot classique —</option>
                  {wheels.map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.name}
                    </option>
                  ))}
                </select>
              )}
              {missingWheel && (
                <p className="mt-1.5 text-xs font-semibold text-amber-700">
                  La roue ciblée a été supprimée — choisissez-en une autre.
                </p>
              )}
              <div aria-live="polite">
                {issue !== "none" && selectedWheel && (
                  <p className="mt-2 rounded-xl border-2 border-amber-300 bg-amber-50 px-3 py-2 text-xs font-bold text-amber-900">
                    {issue === "nothing_drawable"
                      ? "⚠️ Cette roue ne peut rien distribuer en tour offert : donnez un stock à au moins un de ses lots (page de la campagne)."
                      : "⚠️ Certains lots de cette roue (stock illimité) ne sortiront pas en tour offert. Donnez-leur un stock pour les rendre tirables."}
                  </p>
                )}
              </div>
            </div>
          ) : (
            <p className="rounded-xl border-2 border-k-ink/15 bg-zinc-50 px-3 py-2 text-xs text-zinc-600">
              Un tour de roue offert n&apos;est possible qu&apos;en remise
              immédiate (seuil ou gain immédiat) : un jeton émis des heures après
              le passage du joueur ne serait jamais utilisé.
            </p>
          )}
        </div>
      )}

      <div className="mt-5 flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="secondary"
          onClick={declencher}
          disabled={pending}
        >
          {pending ? "…" : "Enregistrer la dotation"}
        </Button>
        {result?.ok && (
          <span className="text-sm font-medium text-emerald-600">Enregistré.</span>
        )}
        <AutoSaveEtat enAttente={enAttente} bloqueParValidation={false} />
      </div>
      <FieldError message={result && !result.ok ? result.error : undefined} />

      <InfoBulle
        id="aide-quiz-dotation"
        resume="Pourquoi le mode et le lot s'enregistrent ensemble ?"
        className="mt-5"
      >
        Parce que la base les vérifie l&apos;un par l&apos;autre : un seuil sans
        mode « à partir de X », ou une roue offerte sur un tirage différé, sont
        refusés. Le bouton enregistre donc les deux d&apos;un coup — et changer
        de mode remplace la dotation précédente, il n&apos;y a pas deux
        dotations en parallèle.
      </InfoBulle>
      {isDeferredMode(quiz.rewardMode) && (
        <p className="mt-3 rounded-xl border-2 border-k-ink/15 bg-zinc-50 px-3 py-2 text-xs text-zinc-600">
          Ce mode ne remet rien pendant la partie : le tirage se déclenche depuis
          le suivi du quiz, quand vous l&apos;estimez terminé.
        </p>
      )}
    </Card>
  );
}

/**
 * Le tirage, monté sur la VUE SUIVI et non dans une étape de l'atelier.
 *
 * Ce n'est pas de la préparation : c'est un geste d'EXPLOITATION, définitif et
 * one-shot, sur un quiz déjà joué. Le laisser au milieu d'un fil « préparer »
 * mettait un bouton irréversible entre deux réglages.
 */
export function QuizDrawCard({ quiz }: { quiz: DashboardQuiz }) {
  if (!isDeferredMode(quiz.rewardMode)) return null;
  return (
    <Card>
      {/* Le tirage porte sur le mode ENREGISTRÉ, pas sur la case cochée : son
          libellé vient donc de `quiz.rewardMode`, jamais de l'état local. */}
      <DrawPanel
        quiz={quiz}
        modeLabel={
          REWARD_MODES.find((m) => m.key === quiz.rewardMode)?.label ?? "tirage"
        }
      />
    </Card>
  );
}

/**
 * Déclenchement du tirage / de l'attribution au classement. L'opération est
 * ATOMIQUE et IDEMPOTENTE côté base (un second appel renvoie `already_drawn` sans
 * rien émettre) : on prévient quand même que le geste est définitif, parce qu'il
 * l'est du point de vue du commerçant.
 */
function DrawPanel({
  quiz,
  modeLabel,
}: {
  quiz: DashboardQuiz;
  modeLabel: string;
}) {
  const router = useRouter();
  // État local typé et non useActionState : d'une part l'état de chargement doit
  // retomber même quand le rendu ne rejoue pas la revalidation — docs/bugs.md ;
  // d'autre part `QuizDrawActionResult` porte le drapeau `retryable`, que le
  // `ActionResult<T>` de useActionForm ne connaît pas.
  const [state, setState] = useState<QuizDrawActionResult | null>(null);
  const [pending, setPending] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const done = quiz.drawState === "done";

  const onSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (pending) return;
    const formData = new FormData(event.currentTarget);
    setPending(true);
    setState(null);
    void (async () => {
      try {
        const res = await drawQuizWinners(null, formData);
        setState(res);
        // Indispensable : c'est la prop serveur `quiz.drawState` qui fait
        // basculer l'écran sur « ✓ Tirage effectué », pas cet état local.
        if (res.ok) router.refresh();
      } catch {
        setState({ ok: false, error: "Tirage impossible, réessayez." });
      } finally {
        setPending(false);
      }
    })();
  };

  // Un tirage À VIDE (personne n'a encore terminé, ou stock épuisé) est renvoyé en
  // `ok: false` À DESSEIN : rien n'a été émis, `draw_state` reste `pending` et le
  // geste reste DISPONIBLE — un `ok: true` afficherait « Tirage effectué », ce qui
  // laisserait croire que la dotation est passée et perdue. Ce n'est pour autant
  // pas une erreur : on le rend en information neutre, pas en rouge.
  //
  // Le cas est reconnu par le drapeau STRUCTUREL `retryable` du contrat : une
  // reformulation du message ne casse donc pas cet affichage.
  const refusal = state && !state.ok ? state.error : null;
  const retryable = Boolean(state && !state.ok && state.retryable);

  return (
    <div>
      <h2 className="font-semibold text-k-ink">
        Tirage — {modeLabel.toLowerCase()}
      </h2>

      {done ? (
        <p className="mt-2 rounded-xl border-2 border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-800">
          ✓ Tirage effectué
          {quiz.drawnAt ? ` le ${new Date(quiz.drawnAt).toLocaleString("fr-FR")}` : ""}
          {" · "}
          {quiz.rewardClaimedCount} lot(s) attribué(s). Les gagnants voient leur
          code sur la page du quiz.
        </p>
      ) : (
        <>
          <p className="mt-2 text-xs text-zinc-500">
            À déclencher quand vous estimez le quiz terminé. Les gagnants sont
            désignés parmi les participations CLOSES, dans la limite du stock.
            <strong> Le tirage n&apos;a lieu qu&apos;une fois</strong> : il ne
            peut pas être rejoué ni annulé.
          </p>
          {confirming ? (
            <form onSubmit={onSubmit} className="mt-3 flex flex-wrap items-center gap-2">
              <input type="hidden" name="id" value={quiz.id} />
              <span className="text-sm font-bold text-k-body">
                Lancer le tirage maintenant ? C&apos;est définitif.
              </span>
              <Button type="submit" disabled={pending}>
                {pending ? "Tirage…" : "Confirmer le tirage"}
              </Button>
              <Button
                type="button"
                variant="ghost"
                onClick={() => setConfirming(false)}
                disabled={pending}
              >
                Annuler
              </Button>
            </form>
          ) : (
            <Button
              type="button"
              variant="secondary"
              className="mt-3"
              onClick={() => setConfirming(true)}
            >
              🎲 Lancer le tirage
            </Button>
          )}
        </>
      )}

      <div aria-live="polite">
        {state?.ok && (
          <p className="mt-2 text-sm font-semibold text-emerald-700">
            {/* `drawn` implique au moins un lot émis : un tirage sans gagnant
                repart en refus relançable ci-dessous, jamais en succès à 0. */}
            {state.data.state === "already_drawn"
              ? "Le tirage avait déjà été effectué : rien n'a été réémis."
              : `Tirage effectué : ${state.data.winners} gagnant${
                  state.data.winners > 1 ? "s" : ""
                }.`}
            {state.data.outOfStock && " Le stock est désormais épuisé."}
          </p>
        )}
        {retryable && (
          <p className="mt-2 rounded-xl border-2 border-k-ink/15 bg-zinc-50 px-3 py-2 text-sm text-zinc-600">
            <span aria-hidden>ℹ️ </span>
            {refusal}
          </p>
        )}
      </div>
      <FieldError message={retryable ? undefined : (refusal ?? undefined)} />
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// Questions : les 7 modèles au-dessus des 4 formes de réponse
// ────────────────────────────────────────────────────────────

interface OptionRow {
  /** Clé React stable (les positions bougent au réordonnancement). */
  uid: number;
  /** Identifiant d'option, ATTRIBUÉ DÈS LA CRÉATION de la ligne : la bonne
   *  réponse s'y réfère avant tout enregistrement, et il reste STABLE à
   *  l'édition (les réponses déjà données pointent dessus). */
  id: string;
  label: string;
}

let optionUid = 1;

/** Prochain identifiant `opt_N` libre parmi les lignes courantes. */
function nextOptionId(rows: readonly OptionRow[]): string {
  const used = new Set(rows.map((r) => r.id));
  let n = rows.length + 1;
  while (used.has(`opt_${n}`)) n += 1;
  return `opt_${n}`;
}

function optionRowsFrom(options: readonly QuizOption[]): OptionRow[] {
  return options.map((o) => ({ uid: optionUid++, id: o.id, label: o.label }));
}

/** Deux lignes vides (minimum SQL) pour un nouveau formulaire à options. */
function blankOptionRows(labels: readonly string[] = []): OptionRow[] {
  const count = Math.max(OPTIONS_MIN, labels.length);
  return Array.from({ length: count }, (_, i) => ({
    uid: optionUid++,
    id: `opt_${i + 1}`,
    label: labels[i] ?? "",
  }));
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((v): v is string => typeof v === "string")
    : [];
}

/**
 * Formulaire d'UNE question, en création comme en édition. Le sélecteur de modèle
 * (`preset`) pilote tout le reste : formes de réponse proposées, présence des
 * options, de l'image, de la tolérance, des variantes acceptées et du chronomètre
 * (cf. `quizFormShape`). Changer de modèle ramène la forme de réponse sur celle
 * du modèle si l'actuelle n'est pas compatible.
 */
function QuestionForm({
  quizId,
  question,
  onDone,
  onCancel,
}: {
  quizId: string;
  /** Question existante : le formulaire édite. Absente : il crée. */
  question?: DashboardQuizQuestion;
  onDone: () => void;
  onCancel: () => void;
}) {
  const editing = question !== undefined;
  const router = useRouter();

  const [preset, setPreset] = useState(question?.preset ?? "multiple_choice");
  const [questionType, setQuestionType] = useState<QuizQuestionType>(
    question?.questionType ?? quizPresetDefaultType(preset),
  );
  const [prompt, setPrompt] = useState(question?.prompt ?? "");
  const [rows, setRows] = useState<OptionRow[]>(() =>
    question ? optionRowsFrom(question.options) : blankOptionRows(),
  );
  const [choiceId, setChoiceId] = useState(
    typeof question?.correctAnswer === "string" ? question.correctAnswer : "",
  );
  const [numberValue, setNumberValue] = useState(
    typeof question?.correctAnswer === "number" ? String(question.correctAnswer) : "",
  );
  const [order, setOrder] = useState<string[]>(() =>
    asStringArray(question?.correctAnswer),
  );
  const [variants, setVariants] = useState<string[]>(() => {
    const existing = asStringArray(question?.correctAnswer);
    return existing.length > 0 ? existing : [""];
  });
  const [imageUrl, setImageUrl] = useState(question?.imageUrl ?? "");
  const [timerOn, setTimerOn] = useState(
    question ? question.timeLimitSeconds !== null : false,
  );
  const [timeLimit, setTimeLimit] = useState(
    question?.timeLimitSeconds !== null && question?.timeLimitSeconds !== undefined
      ? String(question.timeLimitSeconds)
      : "",
  );
  const [points, setPoints] = useState(String(question?.points ?? 1));
  const [tolerance, setTolerance] = useState(
    question?.tolerance !== null && question?.tolerance !== undefined
      ? String(question.tolerance)
      : "",
  );
  const [rankingSize, setRankingSize] = useState(
    question?.rankingSize !== null && question?.rankingSize !== undefined
      ? String(question.rankingSize)
      : "3",
  );

  // Patron manuel et non useTransition : l'état de chargement doit retomber même
  // quand le rendu ne rejoue pas la revalidation — docs/bugs.md. (Les actions
  // prennent un objet typé, pas une FormData : useActionForm ne s'y applique pas.)
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const info = quizPresetInfo(preset);
  const shape = quizFormShape(preset, questionType);

  /** Changement de modèle : options figées posées, chronomètre imposé, forme
   *  ramenée sur celle du modèle si l'actuelle n'est pas compatible. */
  const pickPreset = (key: string) => {
    const next = quizPresetInfo(key);
    setPreset(key);
    if (!quizPresetAllowsType(key, questionType)) {
      setQuestionType(next.types[0]);
    }
    if (next.fixedOptions) {
      setRows(blankOptionRows(next.fixedOptions));
      setChoiceId("");
    }
    if (next.requiresTimer) {
      setTimerOn(true);
      setTimeLimit((current) => current || String(next.suggestedTimeLimit));
    }
  };

  const labelledRows = rows.filter((r) => r.label.trim() !== "");
  const rankingOptions = labelledRows.map((r) => ({ id: r.id, label: r.label.trim() }));
  const size = Number(rankingSize) || 0;

  const solution = (): QuizSolutionInput | null => {
    switch (questionType) {
      case "choice":
        return choiceId ? { type: "choice", optionId: choiceId } : null;
      case "number":
        return numberValue.trim() === ""
          ? null
          : { type: "number", value: Number(numberValue) };
      case "ranking":
        return order.length === size && size >= OPTIONS_MIN
          ? { type: "ranking", order }
          : null;
      case "text": {
        const cleaned = variants.map((v) => v.trim()).filter((v) => v !== "");
        return cleaned.length > 0 ? { type: "text", variants: cleaned } : null;
      }
    }
  };

  const ready =
    prompt.trim() !== "" &&
    solution() !== null &&
    (!shape.showOptions || labelledRows.length >= OPTIONS_MIN) &&
    // Le modèle « image mystère » n'a pas de sens sans son image.
    (!shape.imageFeatured || imageUrl.trim() !== "") &&
    (!timerOn || timeLimit.trim() !== "");

  /** Ce que les deux chemins d'enregistrement postent, à la lettre près. */
  const charge = (correctAnswer: QuizSolutionInput) => ({
    questionType,
    preset,
    prompt,
    options: shape.showOptions ? rankingOptions : [],
    correctAnswer,
    imageUrl: imageUrl.trim(),
    timeLimitSeconds: timerOn ? timeLimit : "",
    points,
    tolerance: shape.showTolerance ? tolerance : "",
    rankingSize: shape.showRankingSize ? rankingSize : "",
  });

  /**
   * ENREGISTREMENT AUTOMATIQUE — seulement en ÉDITION, jamais en création.
   *
   * Créer est un geste qui INSÈRE : une question à demi saisie partirait en
   * base à la première frappe, puis une deuxième au mot suivant. Le formulaire
   * de création garde donc son seul bouton, qui est aussi ce que le commerçant
   * attend (« + Ajouter la question »).
   *
   * En édition, on ne recharge PAS et on ne referme PAS le formulaire, à la
   * différence du bouton : ce serait arracher l'écran des mains de quelqu'un
   * qui est en train d'écrire. `router.refresh()` suffit à remettre la liste
   * au propre derrière lui.
   */
  const enregistrerAuto = async (): Promise<boolean> => {
    const correctAnswer = solution();
    if (!correctAnswer || !question) return false;
    setPending(true);
    try {
      const res = await updateQuizQuestion({
        id: question.id,
        ...charge(correctAnswer),
      });
      if (!res.ok) {
        setError(res.error);
        return false;
      }
      setError(null);
      router.refresh();
      return true;
    } catch {
      setError("Enregistrement impossible, réessayez.");
      return false;
    } finally {
      setPending(false);
    }
  };

  const blocRef = useRef<HTMLDivElement>(null);
  const { enAttente, bloqueParValidation } = useAutoSaveManuel(blocRef, {
    signature: JSON.stringify([
      preset,
      questionType,
      prompt,
      rows,
      choiceId,
      numberValue,
      order,
      variants,
      imageUrl,
      timerOn,
      timeLimit,
      points,
      tolerance,
      rankingSize,
    ]),
    enregistrer: enregistrerAuto,
    // La même condition que le bouton : une question incomplète ne part pas, et
    // le dit — sans quoi la saisie cesserait d'être enregistrée en silence,
    // exactement au moment où elle est la plus fragile.
    valide: () => ready,
    actif: editing,
  });

  const save = () => {
    // Pré-validation : hors du try/catch réseau, elle sort avant tout appel.
    const correctAnswer = solution();
    if (!correctAnswer) {
      setError("Renseignez le résultat officiel de cette question.");
      return;
    }
    setError(null);
    if (pending) return;
    setPending(true);
    void (async () => {
      try {
        const payload = charge(correctAnswer);
        const res = editing
          ? await updateQuizQuestion({ id: question.id, ...payload })
          : await createQuizQuestion({ quizId, ...payload });
        if (!res.ok) {
          setError(res.error);
          return;
        }
        // RECHARGEMENT FRANC, et non `router.refresh()` : ce dernier a été
        // mesuré défaillant ~5 % du temps (docs/bugs.md). Ici il était le seul
        // moyen d'afficher la question — la liste n'a aucun état local, et la
        // fermeture du formulaire est le SEUL signal reçu, strictement
        // identique à celle d'« Annuler ». Le commerçant qui ne voit rien
        // ressaisit : `position = max+1` puis insert, sans aucune unicité sur
        // l'intitulé — la question est posée deux fois aux joueurs, sur un quiz
        // asynchrone que personne ne surveille.
        window.location.reload();
        onDone();
      } catch {
        setError("Enregistrement impossible, réessayez.");
      } finally {
        setPending(false);
      }
    })();
  };

  const move = (index: number, delta: number) => {
    setRows((current) => {
      const next = [...current];
      const target = index + delta;
      if (target < 0 || target >= next.length) return current;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  };

  /** Retire une proposition ET les références que la bonne réponse y faisait. */
  const removeRow = (row: OptionRow) => {
    if (rows.length <= OPTIONS_MIN) return;
    setRows((current) => current.filter((r) => r.uid !== row.uid));
    if (choiceId === row.id) setChoiceId("");
    setOrder((current) => current.filter((id) => id !== row.id));
  };

  const prefix = `qform-${question?.id ?? "new"}`;

  return (
    <div
      ref={blocRef}
      className="rounded-xl border-2 border-k-ink/15 bg-zinc-50/60 p-4"
    >
      <div className="space-y-4">
        {/* ── Modèle de question : pilote tout le formulaire ── */}
        <fieldset>
          <legend className="mb-1.5 text-sm font-bold text-k-ink">
            Modèle de question
          </legend>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {QUIZ_PRESET_INFOS.map((p) => {
              const active = p.key === preset;
              return (
                <label
                  key={p.key}
                  className={`cursor-pointer rounded-xl border-2 px-2.5 py-2 text-left transition-colors ${
                    active
                      ? "border-k-ink bg-k-yellow/30 shadow-[3px_3px_0_var(--color-k-ink)]"
                      : "border-k-ink/20 bg-white hover:border-k-ink/50"
                  }`}
                >
                  <input
                    type="radio"
                    name={`${prefix}-preset`}
                    value={p.key}
                    checked={active}
                    onChange={() => pickPreset(p.key)}
                    className="sr-only"
                  />
                  <span className="block text-xs font-black text-k-ink">
                    <span aria-hidden>{p.icon} </span>
                    {p.label}
                  </span>
                </label>
              );
            })}
          </div>
          <p className="mt-1.5 text-xs text-zinc-500">{info.hint}</p>
        </fieldset>

        {/* ── Forme de réponse : proposée seulement si le modèle en accepte plusieurs ── */}
        {shape.typeSelectable ? (
          <div className="max-w-xs">
            <Label htmlFor={`${prefix}-type`}>Forme de la réponse</Label>
            <select
              id={`${prefix}-type`}
              value={questionType}
              onChange={(e) => setQuestionType(e.target.value as QuizQuestionType)}
              className={selectClass}
            >
              {info.types.map((t) => (
                <option key={t} value={t}>
                  {quizQuestionTypeLabel(t)}
                </option>
              ))}
            </select>
          </div>
        ) : (
          <p className="text-xs text-zinc-500">
            Forme de la réponse :{" "}
            <strong className="text-k-ink">
              {quizQuestionTypeLabel(questionType)}
            </strong>{" "}
            (imposée par ce modèle).
          </p>
        )}

        {/* ── Intitulé ── */}
        <div>
          <Label htmlFor={`${prefix}-prompt`}>Intitulé de la question</Label>
          <Input
            id={`${prefix}-prompt`}
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            maxLength={QUIZ_PROMPT_MAX}
            required
            placeholder={info.promptPlaceholder}
          />
        </div>

        {/* ── Image : mise en avant pour l'image mystère, sinon repliée en option ── */}
        <div>
          <Label htmlFor={`${prefix}-image`}>
            {shape.imageFeatured
              ? "Image à montrer (obligatoire pour ce modèle)"
              : "Image d'illustration (optionnel)"}
          </Label>
          <Input
            id={`${prefix}-image`}
            type="url"
            value={imageUrl}
            onChange={(e) => setImageUrl(e.target.value)}
            placeholder="https://…"
            className="font-mono"
            aria-describedby={`${prefix}-image-help`}
          />
          <p id={`${prefix}-image-help`} className="mt-1.5 text-xs text-zinc-500">
            {shape.imageFeatured
              ? "Elle est affichée en grand au-dessus de la question."
              : "Lien d'une image déjà en ligne (https)."}
          </p>
          {shape.imageFeatured && imageUrl.trim() !== "" && (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={imageUrl}
              alt="Aperçu de l'image de la question"
              className="mt-2 max-h-40 rounded-xl border-2 border-k-ink object-contain"
            />
          )}
        </div>

        {/* ── Propositions (choix / classement) ── */}
        {shape.showOptions && (
          <fieldset>
            <legend className="mb-1.5 block text-sm font-bold text-k-ink">
              Propositions ({OPTIONS_MIN} minimum)
            </legend>
            {shape.optionsLocked && (
              <p className="mb-2 text-xs text-zinc-500">
                Ce modèle impose ses deux propositions — indiquez seulement
                laquelle est vraie ci-dessous.
              </p>
            )}
            <ol className="space-y-2">
              {rows.map((row, index) => (
                <li key={row.uid} className="flex items-center gap-2">
                  <span className="w-6 shrink-0 text-center text-xs font-black tabular-nums text-zinc-600">
                    {index + 1}
                  </span>
                  <Input
                    value={row.label}
                    onChange={(e) =>
                      setRows((current) =>
                        current.map((r) =>
                          r.uid === row.uid ? { ...r, label: e.target.value } : r,
                        ),
                      )
                    }
                    readOnly={shape.optionsLocked}
                    maxLength={OPTION_LABEL_MAX}
                    placeholder={`Proposition ${index + 1}`}
                    aria-label={`Proposition ${index + 1}`}
                    className="flex-1"
                  />
                  {!shape.optionsLocked && (
                    <>
                      <Button
                        type="button"
                        variant="ghost"
                        onClick={() => move(index, -1)}
                        disabled={index === 0}
                        aria-label={`Monter la proposition ${index + 1}`}
                      >
                        ↑
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        onClick={() => move(index, 1)}
                        disabled={index === rows.length - 1}
                        aria-label={`Descendre la proposition ${index + 1}`}
                      >
                        ↓
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        onClick={() => removeRow(row)}
                        disabled={rows.length <= OPTIONS_MIN}
                        aria-label={`Supprimer la proposition ${index + 1}`}
                      >
                        ✕
                      </Button>
                    </>
                  )}
                </li>
              ))}
            </ol>
            {!shape.optionsLocked && (
              <Button
                type="button"
                variant="secondary"
                className="mt-2"
                disabled={rows.length >= OPTIONS_MAX}
                onClick={() =>
                  setRows((current) => [
                    ...current,
                    { uid: optionUid++, id: nextOptionId(current), label: "" },
                  ])
                }
              >
                + Ajouter une proposition
              </Button>
            )}
          </fieldset>
        )}

        {/* ── Taille du top (classement) ── */}
        {shape.showRankingSize && (
          <div>
            <Label htmlFor={`${prefix}-ranking-size`}>
              Nombre de places à classer
            </Label>
            <Input
              id={`${prefix}-ranking-size`}
              type="number"
              min={OPTIONS_MIN}
              max={Math.max(OPTIONS_MIN, labelledRows.length)}
              value={rankingSize}
              onChange={(e) => setRankingSize(e.target.value)}
              className="w-24 text-center"
              aria-describedby={`${prefix}-ranking-size-help`}
            />
            <p
              id={`${prefix}-ranking-size-help`}
              className="mt-1.5 text-xs text-zinc-500"
            >
              Ne peut pas dépasser le nombre de propositions ({labelledRows.length}).
            </p>
          </div>
        )}

        {/* ── Le résultat officiel : SECRET côté serveur ── */}
        <fieldset className="rounded-xl border-2 border-k-ink/20 bg-white p-3">
          <legend className="px-1.5 text-sm font-bold text-k-ink">
            Bonne réponse
          </legend>
          <p className="mb-3 inline-flex items-start gap-1.5 rounded-lg bg-k-yellow/30 px-2.5 py-1.5 text-xs font-semibold text-k-ink">
            <span aria-hidden>🔒</span>
            <span>
              Elle reste sur le serveur : elle n&apos;est envoyée au joueur
              qu&apos;APRÈS sa propre réponse, et la correction est calculée en
              base — jamais dans son navigateur.
            </span>
          </p>

          {questionType === "choice" && (
            <div className="max-w-sm">
              <Label htmlFor={`${prefix}-choice`}>Proposition correcte</Label>
              <select
                id={`${prefix}-choice`}
                value={choiceId}
                onChange={(e) => setChoiceId(e.target.value)}
                className={selectClass}
              >
                <option value="">Choisir…</option>
                {rankingOptions.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.label}
                  </option>
                ))}
              </select>
              {rankingOptions.length === 0 && (
                <p className="mt-1.5 text-xs text-zinc-500">
                  Renseignez d&apos;abord vos propositions.
                </p>
              )}
            </div>
          )}

          {questionType === "number" && (
            <div className="flex flex-wrap gap-4">
              <div>
                <Label htmlFor={`${prefix}-number`}>Valeur exacte</Label>
                <Input
                  id={`${prefix}-number`}
                  type="number"
                  step="any"
                  min={-NUMBER_MAX}
                  max={NUMBER_MAX}
                  value={numberValue}
                  onChange={(e) => setNumberValue(e.target.value)}
                  className="w-40"
                />
              </div>
              <div>
                <Label htmlFor={`${prefix}-tolerance`}>
                  Marge acceptée (optionnel)
                </Label>
                <Input
                  id={`${prefix}-tolerance`}
                  type="number"
                  step="any"
                  min={0}
                  max={NUMBER_MAX}
                  value={tolerance}
                  onChange={(e) => setTolerance(e.target.value)}
                  className="w-40"
                  aria-describedby={`${prefix}-tolerance-help`}
                />
                <p
                  id={`${prefix}-tolerance-help`}
                  className="mt-1.5 text-xs text-zinc-500"
                >
                  « à ±N près ». Vide = valeur exacte exigée.
                </p>
              </div>
            </div>
          )}

          {questionType === "ranking" && (
            <div>
              <span className="mb-1.5 block text-sm font-bold text-k-ink">
                Ordre officiel
              </span>
              <RankingPicker
                options={rankingOptions}
                size={Math.max(size, OPTIONS_MIN)}
                value={order}
                onChange={setOrder}
              />
            </div>
          )}

          {questionType === "text" && (
            <div>
              <span className="mb-1.5 block text-sm font-bold text-k-ink">
                Formulations acceptées ({QUIZ_TEXT_VARIANTS_MAX} maximum)
              </span>
              <p className="mb-2 text-xs text-zinc-500">
                La comparaison ignore la casse, les accents et la ponctuation :
                « L&apos;Italie » et « italie » se valent déjà. Ajoutez une
                variante par synonyme réellement différent.
              </p>
              <ul className="space-y-2">
                {variants.map((variant, index) => (
                  <li key={index} className="flex items-center gap-2">
                    <Input
                      value={variant}
                      onChange={(e) =>
                        setVariants((current) =>
                          current.map((v, i) => (i === index ? e.target.value : v)),
                        )
                      }
                      maxLength={QUIZ_TEXT_VARIANT_MAX}
                      placeholder={index === 0 ? "Réponse principale" : "Autre formulation"}
                      aria-label={`Formulation acceptée ${index + 1}`}
                      className="flex-1"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() =>
                        setVariants((current) =>
                          current.length > 1
                            ? current.filter((_, i) => i !== index)
                            : current,
                        )
                      }
                      disabled={variants.length <= 1}
                      aria-label={`Supprimer la formulation ${index + 1}`}
                    >
                      ✕
                    </Button>
                  </li>
                ))}
              </ul>
              <Button
                type="button"
                variant="secondary"
                className="mt-2"
                disabled={variants.length >= QUIZ_TEXT_VARIANTS_MAX}
                onClick={() => setVariants((current) => [...current, ""])}
              >
                + Ajouter une formulation
              </Button>
            </div>
          )}
        </fieldset>

        {/* ── Chronomètre : option TRANSVERSALE, imposée par le modèle « chronométrée » ── */}
        <fieldset className="space-y-2">
          <legend className="text-sm font-bold text-k-ink">Chronomètre</legend>
          <label className="flex items-center gap-2 text-sm text-k-ink">
            <input
              type="checkbox"
              checked={timerOn}
              disabled={shape.timerLocked}
              onChange={(e) => {
                setTimerOn(e.target.checked);
                if (e.target.checked && timeLimit.trim() === "") {
                  setTimeLimit(String(info.suggestedTimeLimit));
                }
              }}
              className="h-4 w-4 accent-k-ink"
            />
            Limiter le temps de réponse
            {shape.timerLocked && (
              <span className="text-xs text-zinc-500">
                (imposé par le modèle « {info.label} »)
              </span>
            )}
          </label>
          {timerOn && (
            <div>
              <Label htmlFor={`${prefix}-timer`}>Secondes accordées</Label>
              <Input
                id={`${prefix}-timer`}
                type="number"
                min={QUIZ_TIME_LIMIT_MIN}
                max={QUIZ_TIME_LIMIT_MAX}
                value={timeLimit}
                onChange={(e) => setTimeLimit(e.target.value)}
                className="w-32"
                aria-describedby={`${prefix}-timer-help`}
              />
              <p id={`${prefix}-timer-help`} className="mt-1.5 text-xs text-zinc-500">
                De {QUIZ_TIME_LIMIT_MIN} à {QUIZ_TIME_LIMIT_MAX} secondes. Le
                décompte part quand le joueur affiche la question, et c&apos;est
                l&apos;horloge du serveur qui tranche le hors-délai.
              </p>
            </div>
          )}
        </fieldset>

        <div>
          <Label htmlFor={`${prefix}-points`}>Points de la question</Label>
          <Input
            id={`${prefix}-points`}
            type="number"
            min={0}
            max={QUIZ_POINTS_MAX}
            value={points}
            onChange={(e) => setPoints(e.target.value)}
            className="w-28"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" onClick={save} disabled={pending || !ready}>
            {pending
              ? "…"
              : editing
                ? "Enregistrer la question"
                : "+ Ajouter la question"}
          </Button>
          <Button
            type="button"
            variant="ghost"
            onClick={onCancel}
            disabled={pending}
          >
            Annuler
          </Button>
          {/* En création, rien ne s'enregistre tout seul : le dire serait
              faux. */}
          {editing && (
            <AutoSaveEtat
              enAttente={enAttente}
              bloqueParValidation={bloqueParValidation}
              messageBloque="Non enregistré : complétez la question et son résultat officiel."
            />
          )}
        </div>
        <FieldError message={error ?? undefined} />
      </div>
    </div>
  );
}

/** Résultat officiel en clair (côté commerçant : aucun enjeu de fuite). */
function officialAnswerLabel(question: DashboardQuizQuestion): string | null {
  const labelOf = (id: unknown) =>
    question.options.find((o) => o.id === id)?.label ?? String(id);
  const answer = question.correctAnswer;
  if (answer === null || answer === undefined) return null;
  if (question.questionType === "choice") return labelOf(answer);
  if (question.questionType === "ranking") {
    return asStringArray(answer)
      .map((id, i) => `${i + 1}. ${labelOf(id)}`)
      .join(" · ");
  }
  if (question.questionType === "text") {
    return asStringArray(answer).join(" / ");
  }
  return String(answer);
}

function QuestionRow({
  quizId,
  question,
  index,
  total,
  editing,
  onEdit,
  onCloseEdit,
  onMove,
  movePending,
}: {
  quizId: string;
  question: DashboardQuizQuestion;
  index: number;
  total: number;
  editing: boolean;
  onEdit: () => void;
  onCloseEdit: () => void;
  onMove: (delta: number) => void;
  movePending: boolean;
}) {
  // useActionForm et non useActionState : l'état de chargement doit retomber même
  // quand le rendu ne rejoue pas la revalidation — docs/bugs.md.
  const {
    state: deleteState,
    pending: deletePending,
    onSubmit: deleteSubmit,
  } = useActionForm(deleteQuizQuestion, {
    networkError: "Suppression impossible, réessayez.",
  });
  const info = quizPresetInfo(question.preset);
  const official = officialAnswerLabel(question);

  if (editing) {
    return (
      <li>
        <QuestionForm
          quizId={quizId}
          question={question}
          onDone={onCloseEdit}
          onCancel={onCloseEdit}
        />
      </li>
    );
  }

  return (
    <li className="rounded-xl border-2 border-k-ink/15 bg-white p-4">
      <div className="flex flex-wrap items-start gap-3">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 border-k-ink bg-k-yellow text-xs font-black tabular-nums text-k-ink">
          {index + 1}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-k-ink">
            <span aria-hidden>{info.icon} </span>
            {question.prompt}
          </p>
          <p className="mt-0.5 text-xs text-zinc-500">
            {info.label} · {quizQuestionTypeLabel(question.questionType)}
            {question.questionType === "ranking" && question.rankingSize
              ? ` · top ${question.rankingSize}`
              : ""}
            {question.options.length > 0
              ? ` · ${question.options.length} proposition${question.options.length > 1 ? "s" : ""}`
              : ""}
            {question.tolerance !== null ? ` · à ±${question.tolerance} près` : ""}
            {question.timeLimitSeconds !== null
              ? ` · ⏱ ${question.timeLimitSeconds} s`
              : ""}
            {` · ${question.points} pt${question.points > 1 ? "s" : ""}`}
            {question.imageUrl ? " · 🖼️ image" : ""}
          </p>
          {official && (
            <p className="mt-1 text-xs font-bold text-k-green">
              <span aria-hidden>🔒 </span>Bonne réponse : {official}
              <span className="ml-1 font-normal text-zinc-500">
                (visible ici seulement)
              </span>
            </p>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <Button
            type="button"
            variant="ghost"
            onClick={() => onMove(-1)}
            disabled={index === 0 || movePending}
            aria-label={`Monter la question ${index + 1}`}
          >
            ↑
          </Button>
          <Button
            type="button"
            variant="ghost"
            onClick={() => onMove(1)}
            disabled={index === total - 1 || movePending}
            aria-label={`Descendre la question ${index + 1}`}
          >
            ↓
          </Button>
          <Button type="button" variant="secondary" onClick={onEdit}>
            Modifier
          </Button>
          <form
            onSubmit={(event) => {
              // La confirmation reste une GARDE, avant tout appel de l'action.
              if (
                !confirm(
                  "Supprimer cette question et les réponses déjà données ?",
                )
              ) {
                event.preventDefault();
                return;
              }
              deleteSubmit(event);
            }}
          >
            <input type="hidden" name="id" value={question.id} />
            <Button
              type="submit"
              variant="ghost"
              disabled={deletePending}
              aria-label={`Supprimer la question « ${question.prompt} »`}
            >
              ✕
            </Button>
          </form>
        </div>
      </div>
      <FieldError
        message={deleteState && !deleteState.ok ? deleteState.error : undefined}
      />
    </li>
  );
}

export function QuizQuestionsEditor({
  quizId,
  questions,
}: {
  quizId: string;
  questions: DashboardQuizQuestion[];
}) {
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  // Patron manuel et non useTransition : l'état de chargement doit retomber même
  // quand le rendu ne rejoue pas la revalidation — docs/bugs.md. (L'action est de
  // forme (prev, FormData) mais n'est PAS déclenchée par un <form> : la FormData
  // est fabriquée ici, useActionForm ne s'y applique pas.)
  const [movePending, setMovePending] = useState(false);
  const [moveError, setMoveError] = useState<string | null>(null);

  /**
   * ÉCRASEMENT LOCAL DE L'ORDRE, avec l'ordre serveur comme date de péremption.
   *
   * ── Le défaut (audit du 2026-07-30) ──
   *
   * `router.refresh()` a été mesuré défaillant (5 à 32 % selon le geste,
   * docs/bugs.md). Ici, son échec ne se contentait pas de figer l'écran : il
   * CORROMPAIT la donnée au clic suivant. L'ordre complet part au serveur, et
   * il était recalculé depuis la liste AFFICHÉE — donc périmée. Deux flèches
   * cliquées d'affilée après un rafraîchissement raté écrivaient en base un
   * ordre que le commerçant n'avait jamais demandé, sans aucun signal.
   *
   * ── Pourquoi PAS un rechargement franc ici ──
   *
   * C'est le correctif retenu ailleurs, mais il ne convient pas au
   * réordonnancement : on clique ↑ et ↓ des dizaines de fois de suite, et
   * chaque rechargement remettrait la page en haut, faisant perdre au
   * commerçant sa place dans une longue liste. Le geste est aussi le seul du
   * fichier dont on CONNAÎT déjà le résultat sans demander au serveur — c'est
   * nous qui venons de calculer l'ordre.
   *
   * ── La péremption, sans effet ni nettoyage ──
   *
   * Même patron que `applied` dans progression-season-card.tsx : on retient
   * l'ordre serveur qui prévalait au moment du clic. Tant qu'il n'a pas bougé,
   * on affiche le nôtre ; dès qu'il bouge, la correspondance échoue et
   * l'écrasement cesse de s'appliquer de lui-même. Aucun `setState` dans un
   * effet, donc aucun état périmé à nettoyer.
   */
  const [ordreLocal, setOrdreLocal] = useState<OrdreLocal | null>(null);

  const ordreServeur = [...questions].sort((a, b) => a.position - b.position);
  const cleServeur = cleOrdre(ordreServeur);
  const ordered = ordreAffiche(ordreServeur, ordreLocal);

  /** Réordonnancement : l'ordre COMPLET part au serveur (JSON), qui recalcule
   *  les positions sans jamais violer l'unicité (quiz_id, position). */
  const move = (index: number, delta: number) => {
    const target = index + delta;
    if (target < 0 || target >= ordered.length) return;
    if (movePending) return;
    const ids = ordered.map((q) => q.id);
    [ids[index], ids[target]] = [ids[target], ids[index]];
    setMoveError(null);
    setMovePending(true);
    // Appliqué AVANT l'aller-retour : c'est ce qui rend le clic suivant juste,
    // même si le rafraîchissement ne revient jamais.
    setOrdreLocal({ depuis: cleServeur, vers: ids });
    void (async () => {
      try {
        const formData = new FormData();
        formData.set("quiz_id", quizId);
        formData.set("order", JSON.stringify(ids));
        const res = await reorderQuizQuestions(null, formData);
        if (!res.ok) {
          // Le serveur a refusé : l'écran doit revenir à la vérité serveur,
          // sinon on afficherait un ordre qui n'existe nulle part.
          setOrdreLocal(null);
          setMoveError(res.error);
          return;
        }
        router.refresh();
      } catch {
        setOrdreLocal(null);
        setMoveError("Réordonnancement impossible, réessayez.");
      } finally {
        setMovePending(false);
      }
    })();
  };

  return (
    <Card>
      <h2 className="font-semibold mb-1">Questions</h2>
      <p className="text-sm text-zinc-500 mb-4">
        Sept modèles au choix — le formulaire s&apos;adapte au modèle retenu. Les
        questions sont posées au joueur dans l&apos;ordre de cette liste, une par
        une, et corrigées aussitôt.
      </p>

      {ordered.length > 0 ? (
        <ul className="mb-4 space-y-2.5">
          {ordered.map((question, index) => (
            <QuestionRow
              key={question.id}
              quizId={quizId}
              question={question}
              index={index}
              total={ordered.length}
              editing={editingId === question.id}
              onEdit={() => {
                setEditingId(question.id);
                setAdding(false);
              }}
              onCloseEdit={() => setEditingId(null)}
              onMove={(delta) => move(index, delta)}
              movePending={movePending}
            />
          ))}
        </ul>
      ) : (
        <p className="mb-4 text-sm text-zinc-500">
          Aucune question pour l&apos;instant — un quiz sans question ne peut pas
          être activé.
        </p>
      )}
      <FieldError message={moveError ?? undefined} />

      {adding ? (
        <QuestionForm
          quizId={quizId}
          onDone={() => setAdding(false)}
          onCancel={() => setAdding(false)}
        />
      ) : (
        <Button
          type="button"
          onClick={() => {
            setAdding(true);
            setEditingId(null);
          }}
        >
          + Ajouter une question
        </Button>
      )}

      <InfoBulle
        id="aide-quiz-questions"
        resume="Puis-je modifier une question déjà jouée ?"
        className="mt-4"
      >
        Oui, et c&apos;est à manier avec soin : la correction est immédiate côté
        joueur, donc changer la bonne réponse ne recorrige pas les parties déjà
        terminées. Sur un quiz ouvert, mieux vaut ajouter une question que
        réécrire celles auxquelles vos clients ont déjà répondu.
      </InfoBulle>
    </Card>
  );
}
