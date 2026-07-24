"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { SkillAttempt, SkillChallengePublic } from "@/lib/skill";
import { playText } from "../play-theme";

/** Délai aléatoire avant l'allumage de la cible (bornes en ms). */
const ARM_DELAY_MIN_MS = 1500;
const ARM_DELAY_MAX_MS = 3500;
/** Répit après l'armement : un double-tap du départ n'est PAS un faux départ. */
const FALSE_START_GRACE_MS = 300;

type Stage = "ready" | "waiting" | "go" | "done";

/**
 * Phase de DÉFI « réflexe » : après un départ EXPLICITE (« Touchez pour lancer
 * le signal »), la cible s'allume au bout d'un délai aléatoire ; le joueur doit
 * toucher dans la fenêtre `durationMs` du défi. Réussite évaluée CLIENT (non
 * vérifiable serveur — bornée par l'économie du tirage, cf. skill.ts) :
 * on envoie `{ gameType: "reflex", succeeded }`, le shell affiche l'issue.
 *
 * Anti-frustration : départ clair en 2 temps, petite grâce anti double-tap
 * après l'armement ; toucher pendant l'attente = faux départ (raté), ne pas
 * toucher à temps = raté (soumis automatiquement).
 *
 * `prefers-reduced-motion` : la cible s'allume SANS animation (bascule statique
 * de couleur + texte, pulsation coupée via `motion-safe:`) — le défi reste
 * jouable à l'identique, seule la décoration bouge moins.
 */
export function ReflexChallenge({
  challenge,
  onSubmit,
  pending,
  kermesse = false,
}: {
  /** Vue publique du défi (fenêtre de réaction en ms). */
  challenge: Extract<SkillChallengePublic, { gameType: "reflex" }>;
  /** Transmet la tentative construite au shell (SkillGameShell.submit). */
  onSubmit: (attempt: SkillAttempt) => void;
  /** Soumission en cours (fourni par le shell). */
  pending: boolean;
  /** Thème de page « kermesse » (crème + encre) — classes sombres sinon. */
  kermesse?: boolean;
}) {
  const [stage, setStage] = useState<Stage>("ready");
  const [status, setStatus] = useState("");
  // Verrou de fin : la tentative ne part qu'UNE fois (timers et taps rivaux).
  const doneRef = useRef(false);
  const armedAtRef = useRef(0);
  const goAtRef = useRef(0);
  const timersRef = useRef<number[]>([]);

  // Purge des minuteurs au démontage (départ, allumage, fenêtre).
  useEffect(
    () => () => {
      timersRef.current.forEach((t) => window.clearTimeout(t));
    },
    [],
  );

  const finish = useCallback(
    (succeeded: boolean) => {
      if (doneRef.current) return;
      doneRef.current = true;
      timersRef.current.forEach((t) => window.clearTimeout(t));
      timersRef.current = [];
      setStage("done");
      onSubmit({ gameType: "reflex", succeeded });
    },
    [onSubmit],
  );

  function start() {
    setStage("waiting");
    setStatus("Attendez le signal…");
    armedAtRef.current = performance.now();
    const delay =
      ARM_DELAY_MIN_MS + Math.random() * (ARM_DELAY_MAX_MS - ARM_DELAY_MIN_MS);
    timersRef.current.push(
      window.setTimeout(() => {
        goAtRef.current = performance.now();
        setStage("go");
        setStatus("Maintenant ! Touchez !");
        // Fenêtre écoulée sans tap : raté, soumis automatiquement.
        timersRef.current.push(
          window.setTimeout(() => {
            setStatus("Trop tard…");
            finish(false);
          }, challenge.durationMs),
        );
      }, delay),
    );
  }

  function handleTap() {
    if (doneRef.current || pending) return;
    if (stage === "ready") {
      start();
      return;
    }
    if (stage === "waiting") {
      // Grâce anti double-tap juste après le départ.
      if (performance.now() - armedAtRef.current < FALSE_START_GRACE_MS) return;
      setStatus("Trop tôt ! Faux départ…");
      finish(false);
      return;
    }
    if (stage === "go") {
      const reactionMs = performance.now() - goAtRef.current;
      finish(reactionMs <= challenge.durationMs);
    }
  }

  const windowLabel = `${(challenge.durationMs / 1000).toLocaleString("fr-FR", {
    maximumFractionDigits: 1,
  })} s`;

  const targetTone =
    stage === "go"
      ? "border-emerald-600 bg-emerald-400 text-emerald-950"
      : stage === "waiting"
        ? kermesse
          ? "border-k-orange bg-white"
          : "border-amber-400/60 bg-white/5"
        : kermesse
          ? "border-k-ink/40 bg-white"
          : "border-white/20 bg-white/5";

  const targetLabel =
    stage === "ready"
      ? "Toucher pour lancer le signal"
      : stage === "waiting"
        ? "Attendez que la cible s'allume avant de toucher"
        : stage === "go"
          ? "Touchez maintenant !"
          : "Défi terminé";

  return (
    <div className="w-full">
      <h1 className={`text-2xl font-extrabold mb-2 ${playText.title(kermesse)}`}>
        Réflexe éclair
      </h1>
      <p className={`mb-8 text-sm ${playText.body(kermesse)}`}>
        Touchez dès que ça s&apos;allume ! Vous aurez {windowLabel} — toucher
        avant le signal compte comme un faux départ.
      </p>

      <button
        type="button"
        onClick={handleTap}
        disabled={stage === "done"}
        aria-label={targetLabel}
        className={`mx-auto flex aspect-[8/5] w-full max-w-[320px] flex-col items-center justify-center gap-2 rounded-3xl border-2 px-6 text-center transition-colors duration-100 focus-visible:outline-none focus-visible:ring-4 disabled:cursor-default ${
          kermesse ? "focus-visible:ring-k-ink/40" : "focus-visible:ring-white/50"
        } ${targetTone}`}
      >
        {stage === "ready" && (
          <>
            <span aria-hidden className="text-5xl">⚡</span>
            <span className={`text-sm font-semibold ${kermesse ? "text-k-body" : "text-white/70"}`}>
              Touchez pour lancer le signal
            </span>
          </>
        )}
        {stage === "waiting" && (
          <>
            <span aria-hidden className="motion-safe:animate-pulse text-5xl">🟠</span>
            <span className={`text-sm font-semibold ${kermesse ? "text-k-body" : "text-white/70"}`}>
              Attendez… touchez dès que ça s&apos;allume !
            </span>
          </>
        )}
        {stage === "go" && (
          <span className="text-3xl font-extrabold uppercase tracking-wider">
            Maintenant !
          </span>
        )}
        {stage === "done" && (
          <span className={`text-sm font-semibold ${kermesse ? "text-k-body" : "text-white/70"}`}>
            C&apos;est envoyé !
          </span>
        )}
      </button>

      <p
        role="status"
        aria-live="assertive"
        className={`mt-6 min-h-5 text-sm font-semibold ${kermesse ? "text-k-body" : "text-white/70"}`}
      >
        {pending ? "On vérifie votre réflexe…" : status || " "}
      </p>
    </div>
  );
}
