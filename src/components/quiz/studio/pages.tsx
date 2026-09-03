"use client";

import { useState } from "react";
import { Input, Label } from "@/components/ui/input";
import { InfoBulle } from "@/components/dashboard/info-bulle";
import { CodeTtlDaysField } from "@/components/dashboard/code-ttl-days-field";
import { FondEcran } from "@/components/ui/fond-ecran";
import { fondPourQuizTheme } from "@/lib/fonds-ecran";
import {
  QUIZ_THEME_ORDER,
  quizThemeTokens,
} from "@/components/quiz/quiz-theme";
import {
  QuestionForm,
  QuizQuestionsEditor,
  QuizShareSettings,
  type DashboardQuiz,
  type DashboardQuizQuestion,
  type QuizWheelOption,
} from "@/components/dashboard/quiz-editor";
import { spinWheelIssue } from "@/components/dashboard/loyalty-settings-presets";
import {
  QUIZ_INTRO_MAX,
  QUIZ_NAME_MAX,
  type QuizRewardMode,
  type QuizTheme,
} from "@/lib/quiz";
import {
  modeDiffereQuiz,
  modeImmediatQuiz,
  type EtatQuiz,
} from "@/components/quiz/studio/etat";

/**
 * LE CONTENU DES ÉTAPES DU STUDIO DU QUIZ (VIT-41).
 *
 * ── AUCUN CONTRÔLE DE CE FICHIER NE PORTE DE `name` DE CHARGE UTILE ──
 *
 * C'est la règle du socle, et elle ne se négocie pas : une étape qu'on quitte
 * est DÉMONTÉE. Un `name` posé ici disparaîtrait du formulaire de réglages, et
 * l'enregistrement automatique suivant effacerait la colonne — sur une action
 * qui écrit `intro_text || null` sans regarder si le champ était là, c'est-à-dire
 * sans un mot.
 *
 * Tout écrit donc dans `EtatQuiz` par `majEtat` ; la charge d'`updateQuiz` est
 * rendue à part, en entier, par `ChampsCachesQuiz`, et celle d'`updateQuizReward`
 * est construite par `chargeDotationQuiz` au moment de l'envoi.
 *
 * Les seuls `name` de ce fichier groupent des boutons radio (`…-choice`,
 * `…-mode`) : ils ne partent nulle part — ces contrôles ne sont dans AUCUN
 * formulaire — et servent uniquement à ce qu'un lecteur d'écran lise la planche
 * comme un groupe navigable aux flèches.
 */

const textareaClass =
  "w-full rounded-xl border-2 border-k-ink bg-white px-3.5 py-2.5 text-sm text-k-ink placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-k-yellow focus:ring-offset-1 disabled:border-zinc-300 disabled:bg-zinc-100 disabled:text-zinc-500";
const selectClass =
  "w-full rounded-xl border-2 border-k-ink bg-white px-3.5 py-2.5 text-sm text-k-ink focus:outline-none focus:ring-2 focus:ring-k-yellow focus:ring-offset-1 disabled:border-zinc-300 disabled:bg-zinc-100 disabled:text-zinc-500";

export interface ProprietesEtape {
  etat: EtatQuiz;
  majEtat: (patch: Partial<EtatQuiz>) => void;
  peutEditer: boolean;
}

function TitreEtape({ titre, aide }: { titre: string; aide: React.ReactNode }) {
  return (
    <div>
      <h2 className="text-lg font-black text-k-ink">{titre}</h2>
      <p className="mt-1 text-sm text-k-body">{aide}</p>
    </div>
  );
}

// ── 1. Le nom et l'adresse ──────────────────────────────────

export function EtapeNom({ etat, majEtat, peutEditer }: ProprietesEtape) {
  return (
    <div className="space-y-5">
      <TitreEtape
        titre="Le nom et l'adresse"
        aide="Le nom s'affiche en grand, en haut de la page que voient vos clients. L'adresse est ce que porte le QR code."
      />

      <div className="max-w-sm">
        <Label htmlFor="studio-quiz-nom">Nom du quiz</Label>
        <Input
          id="studio-quiz-nom"
          value={etat.name}
          onChange={(e) => majEtat({ name: e.target.value })}
          disabled={!peutEditer}
          maxLength={QUIZ_NAME_MAX}
          placeholder="Ex : Le quiz du comptoir"
        />
      </div>

      <div>
        <Label htmlFor="studio-quiz-slug">URL publique</Label>
        <div className="flex flex-wrap items-center gap-1 text-sm text-zinc-500">
          <span className="font-mono">…/quiz/</span>
          <Input
            id="studio-quiz-slug"
            value={etat.public_slug}
            onChange={(e) => majEtat({ public_slug: e.target.value })}
            disabled={!peutEditer}
            maxLength={64}
            pattern="[a-z0-9-]{3,64}"
            placeholder="mon-quiz"
            className="w-56 font-mono"
            aria-describedby="studio-quiz-slug-help"
          />
        </div>
        <p id="studio-quiz-slug-help" className="mt-1.5 text-xs text-zinc-500">
          Une adresse lisible pour le QR et le partage (3 à 64 caractères : a-z,
          0-9, tirets).
        </p>
        <InfoBulle
          id="studio-aide-quiz-slug"
          resume="Puis-je la changer après avoir imprimé le QR code ?"
          className="mt-2"
        >
          Techniquement oui, mais l&apos;ancienne adresse ne répondra plus : les
          affiches déjà collées en vitrine mèneraient vers une page introuvable.
          Changez-la avant d&apos;imprimer, ou réimprimez le QR après.
        </InfoBulle>
      </div>
    </div>
  );
}

// ── 2. L'habillage ──────────────────────────────────────────

function TuileTheme({
  cle,
  active,
  onSelect,
  disabled,
}: {
  cle: QuizTheme;
  active: boolean;
  onSelect: () => void;
  disabled: boolean;
}) {
  const tokens = quizThemeTokens(cle);
  const fond = fondPourQuizTheme(cle);
  return (
    <label
      className={`cursor-pointer rounded-2xl border-2 p-2.5 transition-colors ${
        active
          ? "border-k-ink bg-k-yellow/20 shadow-[3px_3px_0_var(--color-k-ink)]"
          : "border-k-ink/20 bg-white hover:border-k-ink/50"
      }`}
    >
      {/* Radio en `sr-only` sous un `label` : l'ensemble reste un groupe de
          boutons radio pour un lecteur d'écran, navigable aux flèches, alors
          qu'il se lit comme une planche d'images. Aucun `name` de charge
          utile : `…-choice` ne sert qu'au groupement natif, et ces contrôles
          ne sont dans aucun formulaire. */}
      <input
        type="radio"
        name="studio-quiz-theme-choice"
        value={cle}
        checked={active}
        onChange={onSelect}
        disabled={disabled}
        className="sr-only"
      />
      {/* `relative` + fond en premier enfant : même empilement que la page
          publique (ordre du DOM, aucun z-index). */}
      <div
        aria-hidden
        className="relative mb-2 flex items-center gap-1.5 overflow-hidden rounded-lg border-2 border-k-ink p-1.5"
        style={tokens.pageStyle}
      >
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
}

export function EtapeAllure({ etat, majEtat, peutEditer }: ProprietesEtape) {
  return (
    <div className="space-y-5">
      <TitreEtape
        titre="L'habillage de la page"
        aide="Les couleurs, les emoji et le motif de fond. Tout se voit à droite, sur la question de vos clients."
      />

      <fieldset>
        <legend className="mb-1 text-sm font-bold text-k-ink">Habillage</legend>
        <p className="mb-3 text-xs text-zinc-500">
          Change les couleurs, les emoji et les dessins de fond de la page jouée
          par vos clients — la DA « carton kermesse » reste la même.
        </p>
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
          {QUIZ_THEME_ORDER.map((cle) => (
            <TuileTheme
              key={cle}
              cle={cle}
              active={cle === etat.theme}
              onSelect={() => majEtat({ theme: cle })}
              disabled={!peutEditer}
            />
          ))}
        </div>
      </fieldset>

      <div>
        <Label htmlFor="studio-quiz-intro">
          Consigne d&apos;accueil (optionnel)
        </Label>
        <textarea
          id="studio-quiz-intro"
          value={etat.intro_text}
          onChange={(e) => majEtat({ intro_text: e.target.value })}
          disabled={!peutEditer}
          maxLength={QUIZ_INTRO_MAX}
          rows={4}
          placeholder="Ce texte s'affiche avant la première question : règle du jeu, durée, ce qu'on peut gagner…"
          className={textareaClass}
        />
        <p className="mt-1.5 text-xs text-zinc-500">
          Elle s&apos;affiche sur l&apos;écran d&apos;accueil, avant la première
          question — donc pas dans l&apos;aperçu ci-contre, qui montre une
          question.
        </p>
      </div>
    </div>
  );
}

// ── 3. Les questions ────────────────────────────────────────

/**
 * LA LISTE EST L'ÉDITEUR DE L'ATELIER, TEL QUEL. `createQuizQuestion`,
 * `updateQuizQuestion`, `deleteQuizQuestion` et `reorderQuizQuestions` sont
 * ATOMIQUES par question : elles sont immunisées au piège de l'écrasement en
 * bloc, et n'ont donc rien à faire dans la charge utile du studio. Une seconde
 * liste propre au studio aurait été une deuxième vérité sur ce qu'est une
 * question complète.
 */
export function EtapeQuestions({
  quizId,
  questions,
}: {
  quizId: string;
  questions: DashboardQuizQuestion[];
}) {
  return (
    <div className="space-y-4">
      <TitreEtape
        titre="Les questions"
        aide="Ce que vos clients auront à trouver, dans l'ordre de cette liste. Le générateur peut les écrire pour vous à partir de thèmes."
      />
      <QuizQuestionsEditor quizId={quizId} questions={questions} />
    </div>
  );
}

// ── 4. Le détail d'une question ─────────────────────────────

/**
 * LE DÉTAIL D'UNE QUESTION — le MÊME formulaire que la liste, choisi par un
 * sélecteur.
 *
 * ── POURQUOI UN SÉLECTEUR ET NON UNE SECONDE FICHE ──
 *
 * `QuestionForm` porte déjà tout ce que cette étape promet : le chronomètre,
 * les points, l'image et la tolérance, chacun apparaissant selon le modèle
 * retenu (`quizFormShape`). En réécrire une version « studio » aurait fait deux
 * vérités sur ce qu'est une question valide — et c'est ce formulaire-là, pas
 * une copie, qui sait qu'un sondage ne se note pas et qu'une question
 * chronométrée impose sa durée.
 *
 * Ce que l'étape ajoute est ce que la liste ne donne pas : on ouvre une
 * question par son nom, sans la chercher dans une liste qui peut en compter
 * vingt, et on la regarde à côté de l'aperçu.
 *
 * `key` sur l'identifiant : `QuestionForm` initialise ses douze états depuis la
 * prop `question`, une seule fois. Sans la clé, changer de question dans le
 * sélecteur garderait la saisie de la précédente — et l'enregistrement
 * automatique de ce formulaire l'écrirait sur la nouvelle.
 */
export function EtapeQuestionDetail({
  quizId,
  questions,
  selection,
  onAllerAuxQuestions,
}: {
  quizId: string;
  questions: DashboardQuizQuestion[];
  /** Identifiant de la question ouverte, `null` si le quiz n'en a aucune. */
  selection: string | null;
  onAllerAuxQuestions: () => void;
}) {
  const question = questions.find((q) => q.id === selection) ?? null;

  return (
    <div className="space-y-4">
      <TitreEtape
        titre="Le détail d'une question"
        aide="Le chronomètre, les points, l'image et la tolérance — question par question. Le sélecteur du bandeau, en haut, choisit laquelle : il pilote cette fiche ET l'aperçu, pour qu'on règle toujours la question qu'on regarde."
      />

      {question ? (
        <QuestionForm
          key={question.id}
          quizId={quizId}
          question={question}
          onDone={onAllerAuxQuestions}
          onCancel={onAllerAuxQuestions}
        />
      ) : (
        <p className="rounded-2xl border-2 border-k-ink/20 bg-white p-4 text-sm text-k-body">
          Ce quiz n&apos;a encore aucune question.{" "}
          <button
            type="button"
            onClick={onAllerAuxQuestions}
            className="font-black text-k-ink underline underline-offset-2"
          >
            Écrire la première
          </button>
          .
        </p>
      )}
    </div>
  );
}

/**
 * LE SÉLECTEUR DE QUESTION — dans le bandeau `outils` de la coquille.
 *
 * Il ne part JAMAIS au serveur : c'est un réglage d'AFFICHAGE, exactement ce
 * pour quoi le socle a prévu cette rangée. Et il est UNIQUE — un second
 * sélecteur dans l'étape aurait fait deux commandes pour un seul état, dont
 * l'une désynchronisée de l'aperçu à la première distraction.
 */
export function SelecteurQuestion({
  questions,
  selection,
  onSelection,
}: {
  questions: DashboardQuizQuestion[];
  selection: string | null;
  onSelection: (id: string) => void;
}) {
  if (questions.length === 0) return null;
  return (
    <div className="flex min-w-0 items-center gap-2">
      <label
        htmlFor="studio-quiz-question-choix"
        className="shrink-0 text-xs font-black text-k-ink"
      >
        Question affichée
      </label>
      <select
        id="studio-quiz-question-choix"
        value={selection ?? ""}
        onChange={(e) => onSelection(e.target.value)}
        className="min-w-0 max-w-xs truncate rounded-xl border-2 border-k-ink bg-white px-2.5 py-1.5 text-xs font-bold text-k-ink focus:outline-none focus:ring-2 focus:ring-k-yellow"
      >
        {questions.map((q, index) => (
          <option key={q.id} value={q.id}>
            {index + 1}. {q.prompt}
          </option>
        ))}
      </select>
    </div>
  );
}

// ── 5. Ce qu'on gagne ───────────────────────────────────────

const MODES_GAIN: Array<{
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

export function EtapeGain({ etat, majEtat, peutEditer }: ProprietesEtape) {
  return (
    <div className="space-y-5">
      <TitreEtape
        titre="Ce qu'on gagne"
        aide="À quelle condition le lot est remis. Ce que le lot est, et en quelle quantité, se règle à l'étape suivante."
      />

      <fieldset className="space-y-2">
        <legend className="mb-2 text-sm font-bold text-k-ink">
          Mode de récompense
        </legend>
        {MODES_GAIN.map((m) => {
          const active = m.key === etat.reward_mode;
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
                name="studio-quiz-reward-mode"
                value={m.key}
                checked={active}
                onChange={() => majEtat({ reward_mode: m.key })}
                disabled={!peutEditer}
                className="mt-1 h-4 w-4 shrink-0 accent-k-ink"
              />
              <span className="min-w-0">
                <span className="block text-sm font-bold text-k-ink">
                  <span aria-hidden>{m.icon} </span>
                  {m.label}
                </span>
                <span className="mt-0.5 block text-xs text-zinc-600">
                  {m.hint}
                </span>
              </span>
            </label>
          );
        })}
      </fieldset>

      {etat.reward_mode === "threshold" && (
        <div>
          <Label htmlFor="studio-quiz-threshold">
            Nombre de bonnes réponses qui donne le lot
          </Label>
          <Input
            id="studio-quiz-threshold"
            type="number"
            inputMode="numeric"
            min={1}
            max={500}
            value={etat.reward_threshold}
            onChange={(e) => majEtat({ reward_threshold: e.target.value })}
            disabled={!peutEditer}
            placeholder="Ex : 8"
            className="w-32"
            aria-describedby="studio-quiz-threshold-help"
          />
          <p
            id="studio-quiz-threshold-help"
            className="mt-1.5 text-xs text-zinc-500"
          >
            Compté sur les bonnes réponses, pas sur les points.
          </p>
        </div>
      )}

      {etat.reward_mode === "draw" && (
        <div>
          <Label htmlFor="studio-quiz-draw-top">
            Vivier : parmi combien de meilleurs joueurs tirer au sort ?
          </Label>
          <Input
            id="studio-quiz-draw-top"
            type="number"
            inputMode="numeric"
            min={1}
            max={10_000}
            value={etat.draw_top_n}
            onChange={(e) => majEtat({ draw_top_n: e.target.value })}
            disabled={!peutEditer}
            placeholder="Ex : 20"
            className="w-32"
            aria-describedby="studio-quiz-draw-top-help"
          />
          <p
            id="studio-quiz-draw-top-help"
            className="mt-1.5 text-xs text-zinc-500"
          >
            Les 20 meilleurs scores (puis les plus rapides) entrent dans le
            chapeau ; le sort désigne les gagnants dans la limite du stock.
          </p>
        </div>
      )}

      {modeDiffereQuiz(etat.reward_mode) && (
        <p className="rounded-xl border-2 border-k-ink/15 bg-zinc-50 px-3 py-2 text-xs text-zinc-600">
          Ce mode ne remet rien pendant la partie : le tirage se déclenche depuis
          le suivi du quiz, quand vous l&apos;estimez terminé.
        </p>
      )}

      <InfoBulle
        id="studio-aide-quiz-dotation"
        resume="Pourquoi le mode et le lot s'enregistrent ensemble ?"
      >
        Parce que la base les vérifie l&apos;un par l&apos;autre : un seuil sans
        mode « à partir de X », ou une roue offerte sur un tirage différé, sont
        refusés. Ces deux étapes n&apos;en font donc qu&apos;un seul
        enregistrement — changer de mode ici remplace la dotation précédente, il
        n&apos;y a pas deux dotations en parallèle.
      </InfoBulle>
    </div>
  );
}

// ── 6. Le lot et son stock ──────────────────────────────────

export function EtapeLot({
  etat,
  majEtat,
  peutEditer,
  roues,
  roueDisparue,
  lotsDejaRemis,
}: ProprietesEtape & {
  roues: QuizWheelOption[];
  /** La roue enregistrée n'existe plus dans l'organisation. */
  roueDisparue: boolean;
  /** Lots déjà émis : le stock ne peut pas descendre en dessous. */
  lotsDejaRemis: number;
}) {
  const emet = etat.reward_mode !== "none";
  const roueAutorisee = modeImmediatQuiz(etat.reward_mode);
  const roueChoisie = roues.find((r) => r.id === etat.target_wheel_id) ?? null;
  const probleme =
    roueAutorisee && etat.target_wheel_id ? spinWheelIssue(roueChoisie) : "none";

  return (
    <div className="space-y-5">
      <TitreEtape
        titre="Le lot et son stock"
        aide="Ce que le joueur reçoit, en quelle quantité, et combien de temps il a pour venir le chercher."
      />

      {!emet ? (
        <p className="rounded-2xl border-2 border-k-ink/20 bg-white p-4 text-sm text-k-body">
          Ce quiz est réglé « sans gain » : il n&apos;y a rien à provisionner.
          Choisissez un autre mode à l&apos;étape précédente pour remettre un
          lot.
        </p>
      ) : (
        <div className="space-y-4">
          <div className="max-w-sm">
            <Label htmlFor="studio-quiz-reward-label">
              Lot remis au joueur
            </Label>
            <Input
              id="studio-quiz-reward-label"
              value={etat.reward_label}
              onChange={(e) => majEtat({ reward_label: e.target.value })}
              disabled={!peutEditer}
              maxLength={120}
              placeholder="Ex : Un café offert"
            />
          </div>

          <div>
            <Label htmlFor="studio-quiz-reward-details">
              Détails (optionnel)
            </Label>
            <textarea
              id="studio-quiz-reward-details"
              value={etat.reward_details}
              onChange={(e) => majEtat({ reward_details: e.target.value })}
              disabled={!peutEditer}
              maxLength={2000}
              rows={2}
              placeholder="Conditions, validité, modalités de retrait…"
              className={textareaClass}
            />
          </div>

          <div>
            <Label htmlFor="studio-quiz-reward-stock">
              Stock du lot (obligatoire, fini)
            </Label>
            <Input
              id="studio-quiz-reward-stock"
              type="number"
              inputMode="numeric"
              min={0}
              max={1_000_000}
              value={etat.reward_stock}
              onChange={(e) => majEtat({ reward_stock: e.target.value })}
              disabled={!peutEditer}
              className="w-40"
              aria-describedby="studio-quiz-reward-stock-help"
            />
            <p
              id="studio-quiz-reward-stock-help"
              className="mt-1.5 text-xs text-zinc-500"
            >
              C&apos;est le nombre MAXIMAL de joueurs récompensés : au-delà, plus
              aucun code n&apos;est émis.
              {lotsDejaRemis > 0 && (
                <>
                  {" "}
                  {lotsDejaRemis} lot(s) déjà remis — le stock ne peut pas
                  descendre en dessous.
                </>
              )}
            </p>
          </div>

          {roueAutorisee ? (
            <div>
              <Label htmlFor="studio-quiz-reward-wheel">
                Ou offrir un tour de roue (optionnel)
              </Label>
              {roues.length === 0 ? (
                <p className="rounded-xl border-2 border-amber-300 bg-amber-50 px-3 py-2 text-sm font-bold text-amber-800">
                  Aucune roue disponible — créez d&apos;abord une roue dans vos
                  campagnes.
                </p>
              ) : (
                <select
                  id="studio-quiz-reward-wheel"
                  value={etat.target_wheel_id}
                  onChange={(e) => majEtat({ target_wheel_id: e.target.value })}
                  disabled={!peutEditer}
                  className={`${selectClass} max-w-sm`}
                >
                  <option value="">— Pas de roue, un lot classique —</option>
                  {roues.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name}
                    </option>
                  ))}
                </select>
              )}
              {roueDisparue && (
                <p className="mt-1.5 text-xs font-semibold text-amber-700">
                  La roue ciblée a été supprimée — choisissez-en une autre.
                </p>
              )}
              <div aria-live="polite">
                {probleme !== "none" && roueChoisie && (
                  <p className="mt-2 rounded-xl border-2 border-amber-300 bg-amber-50 px-3 py-2 text-xs font-bold text-amber-900">
                    {probleme === "nothing_drawable"
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

      {/* `champCache={false}`, ET C'EST LE PIÈGE DE CETTE ÉTAPE (VIT-39, VIT-41).
          Le champ caché du composant vivrait ICI, dans une étape DÉMONTABLE, hors
          du formulaire de réglages : il ne partirait jamais, et
          `formData.has("code_ttl_days")` serait faux à chaque enregistrement —
          l'échéance deviendrait impossible à régler, en silence. C'est
          `ChampsCachesQuiz` qui le rend, toujours. */}
      <CodeTtlDaysField
        idPrefix="studio-quiz"
        value={etat.code_ttl_days}
        onChange={(next) => majEtat({ code_ttl_days: next })}
        champCache={false}
        emissionHint="Délai laissé au joueur pour présenter son code QUIZ- en caisse, à partir du moment où le lot lui est attribué (fin du quiz, ou tirage pour les modes différés)."
      />
    </div>
  );
}

// ── 7. Le partage par le joueur ─────────────────────────────

/**
 * `QuizShareSettings` GARDE SON PROPRE FORMULAIRE, et ce n'est pas un oubli.
 *
 * `updateQuizShareInvite` et `updateQuiz` écrivent la MÊME ligne `quizzes` : un
 * champ commun ferait qu'enregistrer les réglages réécrirait le drapeau de
 * partage, ou l'inverse, selon celui qui poste en dernier. Le fusionner dans la
 * charge utile du studio aurait donc annulé la séparation que ce composant
 * existe pour tenir.
 *
 * Son `<form>` est un VOISIN de celui des réglages, jamais son descendant : la
 * coquille pose le formulaire de réglages hors de la mise en page, précisément
 * pour que des blocs comme celui-ci puissent avoir le leur (un `<form>` dans un
 * `<form>` tue l'hydratation de toute la page — défaut livré en VIT-16).
 */
export function EtapePartage({ quiz }: { quiz: DashboardQuiz }) {
  return (
    <div className="space-y-4">
      <TitreEtape
        titre="Le partage par le joueur"
        aide="Vos joueurs peuvent défier leurs proches et partager leur score à la fin de la partie."
      />
      <QuizShareSettings quiz={quiz} />
    </div>
  );
}

/** Rend la sélection de question utilisable comme état contrôlé. */
export function useSelectionQuestion(questions: DashboardQuizQuestion[]) {
  const premiere = questions[0]?.id ?? null;
  const [choisie, setChoisie] = useState<string | null>(premiere);
  // La question choisie peut disparaître (suppression depuis la liste) : on
  // retombe sur la première plutôt que sur un formulaire vide.
  const selection =
    choisie !== null && questions.some((q) => q.id === choisie)
      ? choisie
      : premiere;
  return { selection, setSelection: setChoisie };
}
