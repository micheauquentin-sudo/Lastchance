"use client";

import { useState } from "react";
import type { SkillAttempt, SkillChallengePublic } from "@/lib/skill";
import { playText } from "../play-theme";

/**
 * Phase de DÉFI « mot mystère » : indice public + masque du mot (une case par
 * lettre) et champ libre. On envoie le MOT BRUT (`{ gameType: "mystery_word",
 * guess }`) — le SERVEUR seul compare (accents/casse ignorés côté moteur).
 * UNE seule proposition : le champ se verrouille dès l'envoi (le play_limit
 * consomme la tentative). Jamais d'issue ni de solution affichée ici.
 */
export function MysteryWordChallenge({
  challenge,
  onSubmit,
  pending,
  kermesse = false,
}: {
  /** Vue publique du défi (longueur du mot + indice éventuel — jamais le mot). */
  challenge: Extract<SkillChallengePublic, { gameType: "mystery_word" }>;
  /** Transmet la tentative construite au shell (SkillGameShell.submit). */
  onSubmit: (attempt: SkillAttempt) => void;
  /** Soumission en cours (fourni par le shell). */
  pending: boolean;
  /** Thème de page « kermesse » (crème + encre) — classes sombres sinon. */
  kermesse?: boolean;
}) {
  const [guess, setGuess] = useState("");
  const [sent, setSent] = useState(false);
  const locked = pending || sent;

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const word = guess.trim();
    if (!word || locked) return;
    setSent(true);
    onSubmit({ gameType: "mystery_word", guess: word });
  }

  const inputClass = kermesse
    ? "w-full rounded-xl border-2 border-k-ink bg-white px-4 py-3 text-k-ink placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-k-yellow focus:ring-offset-1"
    : "w-full rounded-xl border border-white/15 bg-black/30 px-4 py-3 text-white placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-violet-400";

  return (
    <div className="w-full">
      <h1 className={`text-2xl font-extrabold mb-2 ${playText.title(kermesse)}`}>
        Le mot mystère
      </h1>
      <p className={`mb-6 text-sm ${playText.body(kermesse)}`}>
        {challenge.hint ? (
          <>
            Indice : <span className="font-semibold">« {challenge.hint} »</span>
          </>
        ) : (
          "Devinez le mot caché."
        )}
      </p>

      {/* Masque du mot : une case par lettre — décor, décrit par le sr-only. */}
      <div aria-hidden className="mb-2 flex flex-wrap justify-center gap-1.5">
        {Array.from({ length: challenge.length }, (_, i) => (
          <span
            key={i}
            className={`h-9 w-7 rounded-md border-2 ${
              kermesse ? "border-k-ink/30 bg-white" : "border-white/25 bg-white/5"
            }`}
          />
        ))}
      </div>
      <p className={`mb-6 text-xs ${playText.body(kermesse)}`}>
        Mot de {challenge.length} lettres
      </p>

      <form onSubmit={handleSubmit} className="text-left">
        <label
          htmlFor="mystery-word-guess"
          className={`mb-1.5 block text-sm font-semibold ${kermesse ? "text-k-ink" : "text-white"}`}
        >
          Votre proposition
        </label>
        <input
          id="mystery-word-guess"
          name="guess"
          required
          maxLength={80}
          value={guess}
          onChange={(e) => setGuess(e.target.value)}
          disabled={locked}
          placeholder="Tapez le mot ici"
          autoComplete="off"
          autoCapitalize="off"
          spellCheck={false}
          enterKeyHint="done"
          aria-describedby="mystery-word-once"
          className={`${inputClass} disabled:opacity-60`}
        />
        <p id="mystery-word-once" className={`mt-2 text-xs ${playText.body(kermesse)}`}>
          Une seule proposition possible — réfléchissez bien !
        </p>

        <button
          type="submit"
          disabled={locked}
          className={`mt-5 w-full rounded-2xl border-2 px-6 py-4 text-lg font-extrabold uppercase tracking-wider transition-all duration-100 focus-visible:outline-none focus-visible:ring-4 disabled:cursor-default ${
            kermesse
              ? "border-k-ink bg-white text-k-ink shadow-[4px_4px_0_var(--color-k-ink)] focus-visible:ring-k-ink/40 active:translate-x-[2px] active:translate-y-[2px] active:shadow-[1px_1px_0_var(--color-k-ink)]"
              : "border-white/40 bg-white/10 text-white focus-visible:ring-white/50 hover:border-white/70"
          } ${locked ? "opacity-60" : ""}`}
        >
          Proposer ce mot
        </button>
      </form>

      <p
        role="status"
        aria-live="polite"
        className={`mt-5 min-h-5 text-sm font-semibold ${kermesse ? "text-k-body" : "text-white/70"}`}
      >
        {pending ? "On vérifie votre mot…" : " "}
      </p>
    </div>
  );
}
