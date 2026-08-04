"use client";

import { useState } from "react";
import { cancelParticipation } from "@/actions/participations";
import { FieldError } from "@/components/ui/input";
import { useActionForm } from "@/lib/use-action-form";

/**
 * Annulation d'un gain réclamé mais pas retiré (fraude, erreur,
 * rupture) : motif obligatoire journalisé, lot remis en stock.
 *
 * useActionForm et non useActionState : l'état de chargement doit retomber
 * même quand le rendu ne rejoue pas la revalidation — docs/bugs.md.
 */
export function CancelParticipationButton({ id }: { id: string }) {
  const [open, setOpen] = useState(false);
  const { state, pending, onSubmit } = useActionForm(cancelParticipation, {
    networkError: "Annulation impossible, réessayez.",
    // Le geste n'a AUCUN retour propre : la seule preuve qu'il a abouti est le
    // badge « Annulé … », rendu par le serveur dans la même cellule. Si le
    // rafraîchissement ne s'applique pas — mesuré 5 à 32 % —, cette cellule
    // continue d'afficher `RedeemButton` À CÔTÉ d'un gain que la base vient
    // d'annuler et dont le lot est déjà remis en stock. Le commerçant remet
    // alors physiquement un lot annulé. C'est le seul des sept où l'écran
    // périmé ne trompe pas seulement sur un état, mais fait donner un objet.
    reloadOnSuccess: true,
  });

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-xs text-zinc-400 underline underline-offset-2 hover:text-red-600"
      >
        Annuler…
      </button>
    );
  }

  return (
    <form onSubmit={onSubmit} className="mt-1.5 space-y-1.5">
      <input type="hidden" name="id" value={id} />
      <input
        name="reason"
        required
        minLength={5}
        maxLength={300}
        placeholder="Motif (journalisé)"
        className="w-44 rounded-lg border border-zinc-300 bg-white px-2.5 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-red-400"
        aria-label="Motif d'annulation"
      />
      <div className="flex items-center gap-2">
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-red-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-red-500 disabled:bg-red-300"
        >
          {pending ? "…" : "Annuler le gain"}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="text-xs text-zinc-500 underline underline-offset-2"
        >
          Fermer
        </button>
      </div>
      <FieldError message={state && !state.ok ? state.error : undefined} />
    </form>
  );
}
