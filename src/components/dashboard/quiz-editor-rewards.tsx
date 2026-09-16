"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  drawQuizWinners,
  updateQuizReward,
  type QuizDrawActionResult,
} from "@/actions/quiz";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { InfoBulle } from "@/components/dashboard/info-bulle";
import { AutoSaveEtat } from "@/components/dashboard/auto-save-etat";
import { FieldError, Input, Label } from "@/components/ui/input";
import type { QuizRewardMode } from "@/lib/quiz";
import { useAutoSaveManuel } from "@/lib/use-auto-save-manuel";
import type { ActionResult } from "@/lib/utils";
import type { DashboardQuiz, QuizWheelOption } from "./quiz-editor-types";
import { spinWheelIssue } from "./loyalty-settings-presets";

const selectClass =
  "w-full rounded-xl border-2 border-k-ink bg-white px-3.5 py-2.5 text-sm text-k-ink focus:outline-none focus:ring-2 focus:ring-k-yellow focus:ring-offset-1";
const textareaClass =
  "w-full rounded-xl border-2 border-k-ink bg-white px-3.5 py-2.5 text-sm text-k-ink placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-k-yellow focus:ring-offset-1";

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
