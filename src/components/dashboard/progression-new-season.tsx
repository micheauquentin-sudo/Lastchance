"use client";

import { useId, useState, useTransition } from "react";
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
 * L'IRRÉVERSIBILITÉ EST ANNONCÉE AVANT LE PREMIER CLIC, pas découverte après :
 * la migration n'expose que des `create_*`, donc rien de ce qui est créé ici ne
 * pourra être modifié ni supprimé. Le formulaire le dit en toutes lettres et
 * exige une case cochée pour armer le bouton.
 */
export function ProgressionNewSeasonForm({
  hasActiveSeason,
}: {
  /** Une saison tourne déjà : l'unicité de la saison active est rappelée. */
  hasActiveSeason: boolean;
}) {
  const fieldId = useId();
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
      setOpen(false);
      form.reset();
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
            Une saison et tout son contenu (badges, collections, objets,
            missions, coffres) sont <strong>définitifs</strong> : ni
            modification ni suppression une fois créés.
          </li>
          <li>
            Une <strong>seule saison</strong> peut être en cours à la fois
            {hasActiveSeason
              ? " — une saison tourne déjà, celle-ci restera en brouillon."
              : "."}
          </li>
          <li>
            Préparez la saison entièrement en brouillon, puis lancez-la : après
            le lancement, la configuration est figée.
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
        J&apos;ai compris que la saison et son contenu seront définitifs.
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
