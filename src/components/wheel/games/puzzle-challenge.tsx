"use client";

import { useState } from "react";
import type { SkillAttempt, SkillChallengePublic } from "@/lib/skill";
import { challengeButtonTone, playText } from "../play-theme";

/**
 * Phase de DÉFI « puzzle » : les fragments arrivent MÉLANGÉS (l'ordre attendu
 * reste secret côté serveur). Le joueur touche DEUX fragments pour les
 * échanger — pas de drag&drop, mobile-first — puis valide. On envoie l'ORDRE
 * BRUT (`{ gameType: "puzzle", order }` : à chaque position, l'indice du
 * fragment d'origine) et le SERVEUR seul vérifie. Aucune issue ni « bonne
 * réponse » affichée ici : le shell prend le relais (won / lost / blocked).
 */
export function PuzzleChallenge({
  challenge,
  onSubmit,
  pending,
  kermesse = false,
}: {
  /** Vue publique du défi (fragments dans l'ordre mélangé reçu). */
  challenge: Extract<SkillChallengePublic, { gameType: "puzzle" }>;
  /** Transmet la tentative construite au shell (SkillGameShell.submit). */
  onSubmit: (attempt: SkillAttempt) => void;
  /** Soumission en cours (fourni par le shell). */
  pending: boolean;
  /** Thème de page « kermesse » (crème + encre) — classes sombres sinon. */
  kermesse?: boolean;
}) {
  // À chaque position d'affichage, l'indice du fragment d'ORIGINE — c'est
  // exactement la forme attendue par le serveur (attempt.order).
  const [arrangement, setArrangement] = useState<number[]>(() =>
    challenge.fragments.map((_, i) => i),
  );
  const [selected, setSelected] = useState<number | null>(null);
  const [announce, setAnnounce] = useState("");
  const [sent, setSent] = useState(false);
  const locked = pending || sent;

  function tap(pos: number) {
    if (locked) return;
    if (selected === null) {
      setSelected(pos);
      setAnnounce(`Fragment de la position ${pos + 1} sélectionné. Touchez un autre fragment pour échanger.`);
      return;
    }
    if (selected === pos) {
      setSelected(null);
      setAnnounce("Sélection annulée.");
      return;
    }
    const from = selected;
    setArrangement((prev) => {
      const next = [...prev];
      [next[from], next[pos]] = [next[pos], next[from]];
      return next;
    });
    setSelected(null);
    setAnnounce(`Fragments des positions ${from + 1} et ${pos + 1} échangés.`);
  }

  function submit() {
    if (locked) return;
    setSent(true);
    onSubmit({ gameType: "puzzle", order: arrangement });
  }

  return (
    <div className="w-full">
      <h1 className={`text-2xl font-extrabold mb-2 ${playText.title(kermesse)}`}>
        Puzzle en morceaux
      </h1>
      <p className={`mb-6 text-sm ${playText.body(kermesse)}`}>
        Touchez deux fragments pour les échanger, jusqu&apos;à retrouver le bon
        ordre, puis validez.
      </p>

      <div className="grid gap-2" role="group" aria-label="Fragments à remettre dans l'ordre">
        {arrangement.map((fragIdx, pos) => {
          const isSelected = selected === pos;
          return (
            <button
              key={fragIdx}
              type="button"
              onClick={() => tap(pos)}
              disabled={locked}
              aria-pressed={isSelected}
              aria-label={`Position ${pos + 1} : ${challenge.fragments[fragIdx]}${isSelected ? " — sélectionné" : ""}`}
              className={`flex w-full items-center gap-3 rounded-2xl border-2 px-4 py-3 text-left transition-all duration-100 focus-visible:outline-none focus-visible:ring-4 disabled:cursor-default ${
                isSelected
                  ? kermesse
                    ? "border-k-ink bg-k-ink/10 focus-visible:ring-k-ink/40"
                    : "border-white bg-white/15 focus-visible:ring-white/50"
                  : kermesse
                    ? "border-k-ink/30 bg-white hover:border-k-ink/60 focus-visible:ring-k-ink/40"
                    : "border-white/20 bg-white/5 hover:border-white/40 focus-visible:ring-white/50"
              }`}
            >
              <span
                aria-hidden
                className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-extrabold ${
                  kermesse ? "bg-k-ink/10 text-k-ink" : "bg-white/10 text-white/80"
                } ${locked ? "opacity-50" : ""}`}
              >
                {pos + 1}
              </span>
              {/* Verrouillé : encre atténuée, jamais `opacity` — le joueur relit
                  l'ordre qu'il vient d'envoyer pendant que le serveur tranche. */}
              <span
                className={`text-sm font-semibold break-words ${
                  locked
                    ? kermesse
                      ? "text-k-muted"
                      : "text-white/75"
                    : kermesse
                      ? "text-k-ink"
                      : "text-white"
                }`}
              >
                {challenge.fragments[fragIdx]}
              </span>
            </button>
          );
        })}
      </div>

      <button
        type="button"
        onClick={submit}
        disabled={locked}
        className={`mt-7 w-full rounded-2xl border-2 px-6 py-4 text-lg font-extrabold uppercase tracking-wider transition-all duration-100 focus-visible:outline-none focus-visible:ring-4 disabled:cursor-default ${challengeButtonTone(kermesse, locked)}`}
      >
        Valider cet ordre
      </button>

      <p
        role="status"
        aria-live="polite"
        className={`mt-5 min-h-5 text-sm font-semibold ${kermesse ? "text-k-body" : "text-white/70"}`}
      >
        {pending ? "On vérifie votre puzzle…" : announce || " "}
      </p>
    </div>
  );
}
