"use client";

import { useId } from "react";
import { cn } from "@/lib/utils";

/**
 * Composition d'un ordre (top N) par taps successifs — MOBILE D'ABORD :
 * on tape une option pour la placer au rang libre suivant, on tape un
 * rang déjà rempli pour le retirer (les suivants remontent). Aucun
 * glisser-déposer n'est requis : le joueur répond au comptoir, au doigt,
 * sur un téléphone.
 *
 * Partagé par le parcours joueur (/pronos) et la saisie du résultat
 * officiel côté commerçant (dashboard) — même geste des deux côtés.
 */
export interface RankingOption {
  id: string;
  label: string;
}

export function RankingPicker({
  options,
  size,
  value,
  onChange,
  disabled = false,
  className,
}: {
  options: RankingOption[];
  /** Nombre de places à composer (ranking_size de la question). */
  size: number;
  /** Ordre courant : identifiants d'options, du 1er au dernier. */
  value: string[];
  onChange: (order: string[]) => void;
  disabled?: boolean;
  className?: string;
}) {
  const statusId = useId();
  const labelOf = (id: string) =>
    options.find((option) => option.id === id)?.label ?? id;
  const placed = value.slice(0, size);
  const remaining = options.filter((option) => !placed.includes(option.id));
  const slots = Array.from({ length: size }, (_, i) => placed[i] ?? null);

  return (
    <div className={className}>
      <ol className="space-y-1.5" aria-describedby={statusId}>
        {slots.map((id, index) => (
          <li key={index} className="flex items-center gap-2">
            <span className="w-6 shrink-0 text-center text-sm font-black tabular-nums text-k-body">
              {index + 1}.
            </span>
            {id ? (
              <button
                type="button"
                onClick={() =>
                  onChange(placed.filter((_, position) => position !== index))
                }
                disabled={disabled}
                aria-label={`Retirer ${labelOf(id)} du rang ${index + 1}`}
                className="flex min-w-0 flex-1 items-center justify-between gap-2 rounded-xl border-2 border-k-ink bg-k-yellow px-3 py-2 text-left text-sm font-bold text-k-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-k-ink disabled:pointer-events-none disabled:border-zinc-300 disabled:bg-zinc-100 disabled:text-zinc-500"
              >
                <span className="truncate">{labelOf(id)}</span>
                <span aria-hidden>✕</span>
              </button>
            ) : (
              <span className="flex-1 rounded-xl border-2 border-dashed border-k-ink/30 px-3 py-2 text-sm text-zinc-400">
                À choisir
              </span>
            )}
          </li>
        ))}
      </ol>

      {!disabled && remaining.length > 0 && placed.length < size && (
        <div className="mt-3 flex flex-wrap gap-2">
          {remaining.map((option) => (
            <button
              key={option.id}
              type="button"
              onClick={() => onChange([...placed, option.id])}
              aria-label={`Placer ${option.label} au rang ${placed.length + 1}`}
              className={cn(
                "rounded-xl border-2 border-k-ink bg-white px-3 py-2 text-sm font-bold text-k-ink",
                "hover:bg-k-yellow/30 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-k-ink",
              )}
            >
              {option.label}
            </button>
          ))}
        </div>
      )}

      <p
        id={statusId}
        role="status"
        aria-live="polite"
        className="mt-2 text-xs text-k-body"
      >
        {placed.length}/{size} place{size > 1 ? "s" : ""} composée
        {placed.length > 1 ? "s" : ""}
        {placed.length < size && !disabled
          ? ` — touchez une option pour le rang ${placed.length + 1}.`
          : ""}
      </p>
    </div>
  );
}
