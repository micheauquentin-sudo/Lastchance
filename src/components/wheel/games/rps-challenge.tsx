"use client";

import { useState } from "react";
import type { RpsMove, SkillAttempt } from "@/lib/skill";
import { playText } from "../play-theme";

/** Les 3 coups, dans l'ordre d'affichage, avec leur habillage. */
const MOVES: Array<{ move: RpsMove; emoji: string; label: string }> = [
  { move: "rock", emoji: "🪨", label: "Pierre" },
  { move: "paper", emoji: "📄", label: "Feuille" },
  { move: "scissors", emoji: "✂️", label: "Ciseaux" },
];

/**
 * Phase de DÉFI « pierre-feuille-ciseaux ». Le joueur choisit un coup ; on
 * envoie la TENTATIVE BRUTE (`{ gameType: "rps", move }`) au serveur, qui SEUL
 * décide de la réussite (le coup adverse dérive d'un seed résolu HMAC, jamais
 * calculable côté client). Aucun résultat n'est affiché ici : le shell prend le
 * relais (won / lost / blocked). Égalité = échec (règle serveur documentée).
 *
 * Le coup choisi reste mis en évidence pendant la soumission ; les boutons sont
 * verrouillés dès le premier choix pour éviter tout double envoi.
 */
export function RpsChallenge({
  onSubmit,
  pending,
  kermesse = false,
}: {
  /** Transmet la tentative construite au shell (SkillGameShell.submit). */
  onSubmit: (attempt: SkillAttempt) => void;
  /** Soumission en cours (fourni par le shell). */
  pending: boolean;
  /** Thème de page « kermesse » (crème + encre) — classes sombres sinon. */
  kermesse?: boolean;
}) {
  const [choice, setChoice] = useState<RpsMove | null>(null);
  const locked = pending || choice !== null;

  function pick(move: RpsMove) {
    if (locked) return;
    setChoice(move);
    onSubmit({ gameType: "rps", move });
  }

  return (
    <div className="w-full">
      <h1 className={`text-2xl font-extrabold mb-2 ${playText.title(kermesse)}`}>
        Pierre, feuille, ciseaux
      </h1>
      <p className={`mb-8 text-sm ${playText.body(kermesse)}`}>
        Choisissez votre coup pour battre la machine.
      </p>

      <div className="grid grid-cols-3 gap-3" role="group" aria-label="Choisissez votre coup">
        {MOVES.map((m) => {
          const selected = choice === m.move;
          return (
            <button
              key={m.move}
              type="button"
              onClick={() => pick(m.move)}
              disabled={locked}
              aria-pressed={selected}
              aria-label={`Jouer ${m.label}`}
              className={`flex aspect-square flex-col items-center justify-center gap-2 rounded-3xl border-2 text-center transition-all duration-100 focus-visible:outline-none focus-visible:ring-4 ${
                selected
                  ? kermesse
                    ? "border-k-ink bg-k-ink/10 focus-visible:ring-k-ink/40"
                    : "border-white bg-white/15 focus-visible:ring-white/50"
                  : kermesse
                    ? "border-k-ink/30 bg-white hover:border-k-ink/60 focus-visible:ring-k-ink/40"
                    : "border-white/20 bg-white/5 hover:border-white/40 focus-visible:ring-white/50"
              } ${locked && !selected ? "opacity-40" : ""} disabled:cursor-default`}
            >
              <span aria-hidden className="text-4xl">{m.emoji}</span>
              <span className={`text-xs font-semibold ${kermesse ? "text-k-body" : "text-white/80"}`}>
                {m.label}
              </span>
            </button>
          );
        })}
      </div>

      <p
        aria-live="polite"
        className={`mt-6 min-h-5 text-sm font-semibold ${kermesse ? "text-k-body" : "text-white/70"}`}
      >
        {pending ? "On vérifie votre coup…" : " "}
      </p>
    </div>
  );
}
