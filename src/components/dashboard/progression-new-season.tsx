"use client";

import { useId, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createProgressionSeason } from "@/actions/meta-progression";
import { Button } from "@/components/ui/button";
import { FieldError, Input, Label } from "@/components/ui/input";
import {
  PROGRESSION_SEASON_MAX_DAYS,
  PROGRESSION_SEASON_NAME_MAX,
} from "@/lib/meta-progression";

/**
 * Création d'une saison de méta-progression (miroir de NewQuizForm, à ceci près
 * que l'action prend un objet typé et non une FormData — d'où `useTransition`
 * plutôt que `useActionState`).
 *
 * L'IRRÉVERSIBILITÉ EST ANNONCÉE AVANT LE PREMIER CLIC, pas découverte après.
 * Elle ne porte pas sur la création — un brouillon se corrige et se supprime —
 * mais sur le LANCEMENT : `draft → active → ended → archived` est un aller
 * simple, aucune RPC ne relance une saison close. Le formulaire le dit en
 * toutes lettres et exige une case cochée pour armer le bouton.
 */
export function ProgressionNewSeasonForm({
  hasActiveSeason,
}: {
  /** Une saison tourne déjà : l'unicité de la saison active est rappelée. */
  hasActiveSeason: boolean;
}) {
  const fieldId = useId();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [acknowledged, setAcknowledged] = useState(false);
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();

  if (!open) {
    return <Button onClick={() => setOpen(true)}>+ Nouvelle saison</Button>;
  }

  const submit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (pending || !acknowledged) return;
    const form = event.currentTarget;
    const data = new FormData(form);
    startTransition(async () => {
      const result = await createProgressionSeason({
        name: String(data.get("name") ?? ""),
        startsAt: String(data.get("startsAt") ?? ""),
        endsAt: String(data.get("endsAt") ?? ""),
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setError("");
      setAcknowledged(false);
      form.reset();
      setOpen(false);
      // `setOpen(false)` démonte ce formulaire DANS la transition qui porte la
      // mise à jour de `revalidatePath` : le rafraîchissement peut se perdre,
      // et la saison créée n'apparaît jamais. Constaté sur trace Playwright.
      router.refresh();
    });
  };

  return (
    <form
      onSubmit={submit}
      className="w-full rounded-2xl border-2 border-k-ink bg-white p-4 shadow-[4px_4px_0_rgba(33,29,22,0.9)]"
    >
      <h2 className="text-base font-black text-k-ink">Nouvelle saison</h2>

      <div
        role="note"
        className="mt-3 rounded-xl border-2 border-dashed border-k-orange bg-k-yellow/40 p-3 text-sm text-k-ink"
      >
        <p className="font-black">À lire avant de créer</p>
        <ul className="mt-1.5 list-disc space-y-1 pl-5 font-semibold">
          <li>
            En <strong>brouillon</strong>, tout se corrige et se supprime :
            badges, collections, objets, missions, coffres — et la saison
            elle-même.
          </li>
          <li>
            Le <strong>lancement est définitif</strong> : la configuration est
            alors figée, et une saison lancée ne se supprime plus — elle ne peut
            que se clore, ce qui est tout aussi irréversible.
          </li>
          <li>
            Une <strong>seule saison</strong> peut être en cours à la fois
            {hasActiveSeason
              ? " — une saison tourne déjà, celle-ci restera en brouillon."
              : "."}
          </li>
        </ul>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <div className="sm:col-span-3">
          <Label htmlFor={`${fieldId}-name`}>Nom de la saison</Label>
          <Input
            id={`${fieldId}-name`}
            name="name"
            required
            maxLength={PROGRESSION_SEASON_NAME_MAX}
            placeholder="Ex : Saison d'automne"
            autoFocus
          />
        </div>
        <div>
          <Label htmlFor={`${fieldId}-starts`}>Début</Label>
          <Input
            id={`${fieldId}-starts`}
            name="startsAt"
            type="datetime-local"
            required
          />
        </div>
        <div>
          <Label htmlFor={`${fieldId}-ends`}>Fin</Label>
          <Input
            id={`${fieldId}-ends`}
            name="endsAt"
            type="datetime-local"
            required
            aria-describedby={`${fieldId}-ends-hint`}
          />
          <p
            id={`${fieldId}-ends-hint`}
            className="mt-1 text-xs font-semibold text-k-body"
          >
            {PROGRESSION_SEASON_MAX_DAYS} jours maximum, à l&apos;heure de votre
            établissement.
          </p>
        </div>
      </div>

      <label className="mt-4 flex items-start gap-2.5 text-sm font-bold text-k-ink">
        <input
          type="checkbox"
          checked={acknowledged}
          onChange={(event) => setAcknowledged(event.currentTarget.checked)}
          className="mt-0.5 h-4 w-4 shrink-0 accent-k-orange"
        />
        J&apos;ai compris qu&apos;une fois lancée, la saison ne pourra plus être
        modifiée, et que sa clôture sera définitive.
      </label>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Button type="submit" disabled={pending || !acknowledged}>
          {pending ? "Création…" : "Créer la saison"}
        </Button>
        <Button
          type="button"
          variant="ghost"
          onClick={() => {
            setOpen(false);
            setError("");
          }}
          disabled={pending}
        >
          Annuler
        </Button>
      </div>
      <FieldError message={error || undefined} />
    </form>
  );
}
