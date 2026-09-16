"use client";

import { useActionState, useRef, useState } from "react";
import {
  deleteQuiz,
  setQuizStatus,
  updateQuiz,
  updateQuizShareInvite,
} from "@/actions/quiz";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  CodeTtlDaysField,
  codeTtlDaysInitial,
} from "@/components/dashboard/code-ttl-days-field";
import { InfoBulle } from "@/components/dashboard/info-bulle";
import { CarteStatutAnimation } from "@/components/dashboard/carte-statut-animation";
import { QuizStatusBadge } from "@/components/dashboard/quiz-status";
import { AutoSaveEtat } from "@/components/dashboard/auto-save-etat";
import type { QuizStatus } from "@/lib/quiz";
import { RaccourciAtelier, VoirLeJeu } from "@/components/dashboard/atelier-raccourci";
import { hrefEtapeQuiz } from "@/components/dashboard/atelier-quiz-etapes";
import { FieldError, Input, Label } from "@/components/ui/input";
import {
  QUIZ_INTRO_MAX,
  QUIZ_NAME_MAX,
  type QuizTheme,
} from "@/lib/quiz";
import { QUIZ_DELETE_LOSS_HINT } from "@/lib/validations/quiz";
import { useActionForm } from "@/lib/use-action-form";
import { useAutoSave } from "@/lib/use-auto-save";
import { QUIZ_THEME_ORDER, quizThemeTokens } from "@/components/quiz/quiz-theme";
import { FondEcran } from "@/components/ui/fond-ecran";
import { fondPourQuizTheme } from "@/lib/fonds-ecran";
import type { DashboardQuiz } from "./quiz-editor-types";

export type {
  DashboardQuiz,
  DashboardQuizQuestion,
  QuizWheelOption,
} from "./quiz-editor-types";

/* Entrée client des réglages transverses du Créateur de quiz : statut,
   habillage et partage. Les questions et la dotation ont leurs propres
   frontières client afin que le Studio ne charge pas leurs actions. */

const textareaClass =
  "w-full rounded-xl border-2 border-k-ink bg-white px-3.5 py-2.5 text-sm text-k-ink placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-k-yellow focus:ring-offset-1";

// ────────────────────────────────────────────────────────────
// Statut (activer / archiver) + suppression
// ────────────────────────────────────────────────────────────

/**
 * CE QUI EST VRAI MAINTENANT — les trois états du quiz, du point de vue du
 * client. La carte n'annonçait la conséquence QUE sur « ouverte », et par une
 * pastille verte dessinée à la main plutôt que par le badge commun : un
 * brouillon et un quiz clôturé n'affichaient rien.
 */
const PHRASE_ETAT: Record<QuizStatus, string> = {
  draft:
    "Vos clients ne peuvent pas encore jouer : la page du quiz n'est pas ouverte.",
  active: "La page du quiz est accessible à vos clients.",
  archived:
    "Le quiz est terminé : la page n'accepte plus de partie, et les codes déjà gagnés restent retirables.",
};

export function QuizStatusControls({
  quiz,
  hrefJeu = null,
}: {
  quiz: DashboardQuiz;
  /** Page publique du quiz, `null` tant qu'il n'est pas ouvert aux joueurs. */
  hrefJeu?: string | null;
}) {
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
    <CarteStatutAnimation
      titre="Statut du quiz"
      badge={<QuizStatusBadge status={quiz.status} />}
      phrase={PHRASE_ETAT[quiz.status] ?? PHRASE_ETAT.draft}
      actions={
        quiz.status !== "active" ? (
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
        )
      }
      raccourcis={
        <>
          <RaccourciAtelier href={hrefEtapeQuiz(quiz.id, "quiz")} />
          <VoirLeJeu href={hrefJeu} />
        </>
      }
      notes={
        quiz.status !== "active" ? (
          <p className="mt-2 text-xs font-bold text-k-body">
            Pour ouvrir aux joueurs : au moins une question, et — dès qu&apos;un
            mode remet un lot — un lot nommé (ou une roue offerte) avec son
            stock.
          </p>
        ) : null
      }
      /* Le refus d'activation vient du serveur : on affiche SON message tel quel. */
      erreur={statusState && !statusState.ok ? statusState.error : undefined}
    >

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
    </CarteStatutAnimation>
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
          const fond = fondPourQuizTheme(key);
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
              {/* `relative` + fond en premier enfant : même empilement que la
                  page publique (ordre du DOM, aucun z-index) — la vignette
                  montre ce que verront vraiment les clients. */}
              <div
                aria-hidden
                className="relative mb-2 flex items-center gap-1.5 overflow-hidden rounded-lg border-2 border-k-ink p-1.5"
                style={tokens.pageStyle}
              >
                {/* Le fond d'écran du thème, quand il en a un : la vignette
                    montre au commerçant l'image que verra son client.
                    Premier enfant, donc SOUS les pastilles — ordre du DOM,
                    aucun z-index. */}
                {fond && <FondEcran fond={fond} variant="vignette" />}
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
// Partage du quiz par les joueurs
// ────────────────────────────────────────────────────────────

/**
 * L'interrupteur « partage du quiz » — miroir de `CampaignShareSettings` côté
 * campagne. Formulaire À PART d'`updateQuiz` : les deux écrivent la même ligne
 * `quizzes`, et un champ commun ferait qu'enregistrer les réglages réécrirait
 * ce drapeau (ou l'inverse) selon celui qui poste en dernier.
 */
export function QuizShareSettings({ quiz }: { quiz: DashboardQuiz }) {
  const { state, onSubmit } = useActionForm(updateQuizShareInvite, {
    networkError: "Enregistrement impossible, réessayez.",
    toastOnSuccess: "Enregistré.",
  });

  return (
    <Card>
      <h2 className="font-semibold mb-1">Partage du quiz</h2>
      <p className="text-sm text-zinc-500 mb-4">
        Vos joueurs peuvent défier leurs proches et partager leur score. Rien
        n&apos;est récompensé : c&apos;est une invitation, pas un parrainage.
      </p>

      <form onSubmit={onSubmit} className="space-y-3">
        <input type="hidden" name="id" value={quiz.id} />
        <label className="flex cursor-pointer items-start gap-3">
          <input
            type="checkbox"
            name="share_enabled"
            defaultChecked={quiz.shareEnabled}
            onChange={(e) => e.currentTarget.form?.requestSubmit()}
            className="mt-0.5 h-4 w-4 rounded border-zinc-300 text-orange-600 focus:ring-orange-500"
          />
          <span className="text-sm text-zinc-700">
            Proposer le partage du quiz aux joueurs
          </span>
        </label>

        <FieldError message={state && !state.ok ? state.error : undefined} />
        {state?.ok && (
          <p className="text-sm font-medium text-emerald-600">Enregistré.</p>
        )}
      </form>
    </Card>
  );
}
