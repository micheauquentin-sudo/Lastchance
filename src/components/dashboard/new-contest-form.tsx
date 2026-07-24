"use client";

import { useActionState, useState } from "react";
import { createContest } from "@/actions/pronostics";
import { COMPETITIONS } from "@/lib/competitions";
import { Button } from "@/components/ui/button";
import { FieldError, Input, Label } from "@/components/ui/input";
import {
  EVENT_KINDS,
  FOOTBALL_EVENT_KIND,
  getEventKind,
} from "@/components/dashboard/contest-event-kinds";

export function NewContestForm() {
  const [open, setOpen] = useState(false);
  const [eventKind, setEventKind] = useState(FOOTBALL_EVENT_KIND);
  // Date saisie dans le fuseau du navigateur, envoyée en ISO/UTC (même
  // conversion que le coup d'envoi d'un match).
  const [locksIso, setLocksIso] = useState("");
  const [state, formAction, pending] = useActionState(createContest, null);

  if (!open) {
    return <Button onClick={() => setOpen(true)}>+ Nouveau championnat</Button>;
  }

  const kind = getEventKind(eventKind);
  // Le catalogue de compétitions (et l'import de calendrier qui va avec)
  // ne concerne que le football : un événement générique n'a pas de
  // fournisseur, sa clé retombe sur « custom » côté serveur.
  const usesCompetition = kind?.usesCompetition ?? false;

  return (
    <form
      action={formAction}
      className="flex flex-wrap items-end gap-2 rounded-2xl border-2 border-k-ink bg-white p-4 shadow-[4px_4px_0_rgba(33,29,22,0.9)]"
    >
      <input type="hidden" name="event_kind" value={eventKind} />
      <input type="hidden" name="default_locks_at" value={locksIso} />

      <div>
        <Label htmlFor="contest-event-kind">Type d&apos;événement</Label>
        <select
          id="contest-event-kind"
          value={eventKind}
          onChange={(e) => setEventKind(e.target.value)}
          className="w-56 rounded-xl border-2 border-k-ink bg-white px-3.5 py-2.5 text-sm text-k-ink focus:outline-none focus:ring-2 focus:ring-k-yellow focus:ring-offset-1"
        >
          {EVENT_KINDS.map((option) => (
            <option key={option.key} value={option.key}>
              {option.icon} {option.label}
            </option>
          ))}
        </select>
      </div>

      {usesCompetition && (
        <div>
          <Label htmlFor="contest-competition">Compétition</Label>
          <select
            id="contest-competition"
            name="competition_key"
            required
            className="w-56 rounded-xl border-2 border-k-ink bg-white px-3.5 py-2.5 text-sm text-k-ink focus:outline-none focus:ring-2 focus:ring-k-yellow focus:ring-offset-1"
          >
            {COMPETITIONS.map((c) => (
              <option key={c.key} value={c.key}>
                {c.icon} {c.label}
              </option>
            ))}
          </select>
        </div>
      )}

      <div>
        <Label htmlFor="contest-name">
          {usesCompetition ? "Nom du championnat" : "Nom de l'événement"}
        </Label>
        <Input
          id="contest-name"
          name="name"
          required
          maxLength={120}
          placeholder={
            usesCompetition ? "Ex : Pronos du comptoir" : "Ex : Soirée Eurovision"
          }
          autoFocus
          className="w-56"
        />
      </div>

      <div>
        <Label htmlFor="contest-default-locks">
          Verrouillage par défaut (optionnel)
        </Label>
        <Input
          id="contest-default-locks"
          type="datetime-local"
          className="w-56"
          onChange={(e) => {
            const value = e.target.value;
            setLocksIso(value ? new Date(value).toISOString() : "");
          }}
        />
      </div>

      <Button type="submit" disabled={pending}>
        {pending ? "Création…" : "Créer"}
      </Button>
      <Button
        type="button"
        variant="ghost"
        onClick={() => setOpen(false)}
        disabled={pending}
      >
        Annuler
      </Button>
      {kind && (
        <p className="w-full text-xs text-zinc-500">
          {kind.hint} La date de verrouillage s&apos;applique aux questions qui
          n&apos;ont pas leur propre échéance.
        </p>
      )}
      <FieldError message={state && !state.ok ? state.error : undefined} />
    </form>
  );
}
