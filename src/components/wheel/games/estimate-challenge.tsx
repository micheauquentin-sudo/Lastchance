"use client";

import { useState } from "react";
import type { SkillAttempt, SkillChallengePublic } from "@/lib/skill";
import { challengeButtonTone, playText } from "../play-theme";

/**
 * Phase de DÉFI « estimation » : question (+ image éventuelle) et champ
 * numérique. On envoie le NOMBRE BRUT (`{ gameType: "estimate", value }`) —
 * le SERVEUR seul compare à la cible/tolérance (secrètes). UNE seule
 * estimation : le champ se verrouille dès l'envoi. Jamais d'issue ni de
 * bonne valeur affichée ici (pas d'oracle).
 */
export function EstimateChallenge({
  challenge,
  onSubmit,
  pending,
  kermesse = false,
}: {
  /** Vue publique du défi (habillage seul — jamais la cible ni la tolérance). */
  challenge: Extract<SkillChallengePublic, { gameType: "estimate" }>;
  /** Transmet la tentative construite au shell (SkillGameShell.submit). */
  onSubmit: (attempt: SkillAttempt) => void;
  /** Soumission en cours (fourni par le shell). */
  pending: boolean;
  /** Thème de page « kermesse » (crème + encre) — classes sombres sinon. */
  kermesse?: boolean;
}) {
  const [raw, setRaw] = useState("");
  const [localError, setLocalError] = useState("");
  const [sent, setSent] = useState(false);
  const locked = pending || sent;

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (locked) return;
    // Saisie FR tolérée : « 1 234,5 » → 1234.5.
    const value = Number(raw.trim().replace(/\s+/g, "").replace(",", "."));
    if (!Number.isFinite(value)) {
      setLocalError("Entrez un nombre valide.");
      return;
    }
    setLocalError("");
    setSent(true);
    onSubmit({ gameType: "estimate", value });
  }

  // Verrouillé : bordure atténuée + encre `k-muted`, jamais `opacity` — le
  // joueur doit pouvoir relire l'estimation qu'il vient d'envoyer.
  const inputClass = kermesse
    ? "w-full rounded-xl border-2 border-k-ink bg-white px-4 py-3 text-k-ink placeholder:text-zinc-300 focus:outline-none focus:ring-2 focus:ring-k-yellow focus:ring-offset-1 disabled:border-k-ink/40 disabled:text-k-muted"
    : "w-full rounded-xl border border-white/15 bg-black/30 px-4 py-3 text-white placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-violet-400 disabled:border-white/10 disabled:text-white/75";

  return (
    <div className="w-full">
      <h1 className={`text-2xl font-extrabold mb-2 ${playText.title(kermesse)}`}>
        Le juste nombre
      </h1>
      <p className={`mb-6 text-sm ${playText.body(kermesse)}`}>
        {challenge.question || "Quelle est la bonne valeur, selon vous ?"}
      </p>

      {challenge.imageUrl && (
        // eslint-disable-next-line @next/next/no-img-element -- URL externe du commerçant, hors pipeline next/image.
        <img
          src={challenge.imageUrl}
          alt={challenge.question ? "" : "Illustration du défi à estimer"}
          className={`mx-auto mb-6 max-h-48 w-full max-w-[320px] rounded-2xl border-2 object-cover ${
            kermesse ? "border-k-ink/30" : "border-white/20"
          }`}
        />
      )}

      <form onSubmit={handleSubmit} className="text-left">
        <label
          htmlFor="estimate-value"
          className={`mb-1.5 block text-sm font-semibold ${kermesse ? "text-k-ink" : "text-white"}`}
        >
          Votre estimation{challenge.unit ? ` (en ${challenge.unit})` : ""}
        </label>
        <div className="flex items-center gap-2">
          <input
            id="estimate-value"
            name="value"
            required
            inputMode="decimal"
            maxLength={20}
            value={raw}
            onChange={(e) => setRaw(e.target.value)}
            disabled={locked}
            placeholder="Ex. 42"
            autoComplete="off"
            enterKeyHint="done"
            aria-describedby="estimate-once"
            className={inputClass}
          />
          {challenge.unit && (
            <span
              aria-hidden
              className={`shrink-0 text-sm font-semibold ${kermesse ? "text-k-body" : "text-white/70"}`}
            >
              {challenge.unit}
            </span>
          )}
        </div>
        <p id="estimate-once" className={`mt-2 text-xs ${playText.body(kermesse)}`}>
          Une seule estimation possible — visez juste !
        </p>

        {localError && (
          <p role="alert" className={`mt-2 text-sm ${kermesse ? "text-red-600 font-semibold" : "text-red-400"}`}>
            {localError}
          </p>
        )}

        <button
          type="submit"
          disabled={locked}
          className={`mt-5 w-full rounded-2xl border-2 px-6 py-4 text-lg font-extrabold uppercase tracking-wider transition-all duration-100 focus-visible:outline-none focus-visible:ring-4 disabled:cursor-default ${challengeButtonTone(kermesse, locked)}`}
        >
          Envoyer mon estimation
        </button>
      </form>

      <p
        role="status"
        aria-live="polite"
        className={`mt-5 min-h-5 text-sm font-semibold ${kermesse ? "text-k-body" : "text-white/70"}`}
      >
        {pending ? "On vérifie votre estimation…" : " "}
      </p>
    </div>
  );
}
