"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import {
  createQuizQuestion,
  deleteQuizQuestion,
  reorderQuizQuestions,
  updateQuizQuestion,
} from "@/actions/quiz";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { InfoBulle } from "@/components/dashboard/info-bulle";
import { GenerateurQuestions } from "@/components/dashboard/generateur-questions";
import { AutoSaveEtat } from "@/components/dashboard/auto-save-etat";
import { FieldError, Input, Label } from "@/components/ui/input";
import { RankingPicker } from "@/components/ui/ranking-picker";
import {
  NUMBER_ANSWER_MAX as NUMBER_MAX,
  OPTION_LABEL_MAX,
  OPTIONS_MAX,
  OPTIONS_MIN,
} from "@/lib/pronostics-bornes";
import {
  QUIZ_POINTS_MAX,
  QUIZ_PROMPT_MAX,
  QUIZ_TEXT_VARIANT_MAX,
  QUIZ_TEXT_VARIANTS_MAX,
  QUIZ_TIME_LIMIT_MAX,
  QUIZ_TIME_LIMIT_MIN,
  type QuizOption,
  type QuizQuestionType,
  type QuizSolutionInput,
} from "@/lib/quiz";
import { cleOrdre, ordreAffiche, type OrdreLocal } from "@/lib/ordre-optimiste";
import { useActionForm } from "@/lib/use-action-form";
import { useAutoSaveManuel } from "@/lib/use-auto-save-manuel";
import {
  QUIZ_PRESET_INFOS,
  quizFormShape,
  quizPresetAllowsType,
  quizPresetDefaultType,
  quizPresetInfo,
  quizPresetSansVerite,
  quizQuestionTypeLabel,
} from "@/components/quiz/quiz-presets";
import type { DashboardQuizQuestion } from "./quiz-editor-types";

const selectClass =
  "w-full rounded-xl border-2 border-k-ink bg-white px-3.5 py-2.5 text-sm text-k-ink focus:outline-none focus:ring-2 focus:ring-k-yellow focus:ring-offset-1";

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
export function QuestionForm({
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
    // Sondage et pronostic ne se notent pas : 0 point, sans quoi le classement
    // récompenserait d'avoir cliqué. Le retour à un modèle noté rend le point
    // par défaut — mais seulement si le commerçant n'avait rien saisi d'autre.
    if (next.sansVerite) setPoints("0");
    else if (info.sansVerite) setPoints((current) => (current === "0" ? "1" : current));
  };

  const labelledRows = rows.filter((r) => r.label.trim() !== "");
  const rankingOptions = labelledRows.map((r) => ({ id: r.id, label: r.label.trim() }));
  const size = Number(rankingSize) || 0;

  const solution = (): QuizSolutionInput | null => {
    // Modèle SANS vérité (sondage, pronostic) : la colonne `correct_answer` est
    // `not null`, on y pose la première proposition. Elle n'est jamais affichée
    // au joueur ni comparée à l'écran, et la question vaut 0 point — c'est une
    // exigence de FORME, pas une bonne réponse. Voir quiz-presets.ts.
    if (!shape.showVerite) {
      const premiere = rankingOptions[0];
      return premiere ? { type: "choice", optionId: premiere.id } : null;
    }
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
            <Image
              src={imageUrl}
              alt="Aperçu de l'image de la question"
              width={640}
              height={360}
              unoptimized
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

        {/* ── Modèle sans vérité : il n'y a rien à corriger, et on le dit ── */}
        {!shape.showVerite && (
          <p className="rounded-xl border-2 border-k-ink/20 bg-white p-3 text-sm text-zinc-600">
            <span aria-hidden>{info.icon} </span>
            Ce modèle n&apos;a <strong>pas de bonne réponse</strong> : le joueur
            voit un simple « c&apos;est noté », la question ne rapporte aucun
            point et n&apos;influence pas le classement.
          </p>
        )}

        {/* ── Le résultat officiel : SECRET côté serveur ── */}
        {shape.showVerite && (
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
        )}

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

        {shape.showVerite && (
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
        )}

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
  // Un sondage et un pronostic PORTENT une `correct_answer` — la colonne est
  // `not null` — mais ce n'est pas une réponse. L'afficher ferait croire au
  // commerçant qu'il a désigné une vérité qu'il n'a jamais saisie.
  if (quizPresetSansVerite(question.preset)) return null;
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
              ? ` · ⏱️ ${question.timeLimitSeconds} s`
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
        Neuf modèles au choix — le formulaire s&apos;adapte au modèle retenu. Les
        questions sont posées au joueur dans l&apos;ordre de cette liste, une par
        une, et corrigées aussitôt. Pressé ? Le générateur remplit le quiz pour
        vous à partir de thèmes.
      </p>

      <GenerateurQuestions
        cible="quiz"
        cibleId={quizId}
        promptsExistants={questions.map((q) => q.prompt)}
      />

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
