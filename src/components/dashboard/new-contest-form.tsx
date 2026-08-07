"use client";

import { useActionState, useState } from "react";
import { createContest } from "@/actions/pronostics";
import { COMPETITIONS } from "@/lib/competitions";
import { Button } from "@/components/ui/button";
import { InfoBulle } from "@/components/dashboard/info-bulle";
import { FieldError, Input, Label } from "@/components/ui/input";
import {
  EVENT_KINDS,
  FOOTBALL_EVENT_KIND,
  getEventKind,
  suggestedQuestionsFor,
} from "@/components/dashboard/contest-event-kinds";

/**
 * `instanceId` : suffixe d'identifiants, pour que la page liste puisse monter
 * DEUX fois ce formulaire — en tête d'écran et dans l'état vide — sans
 * dupliquer un `id` dans le document (ce qui casserait `htmlFor` et
 * `aria-describedby`, donc l'annonce au lecteur d'écran).
 */
export function NewContestForm({
  timeZone,
  instanceId = "",
}: {
  timeZone: string;
  instanceId?: string;
}) {
  const [open, setOpen] = useState(false);
  const [eventKind, setEventKind] = useState(FOOTBALL_EVENT_KIND);
  const [locksLocal, setLocksLocal] = useState("");
  const [state, formAction, pending] = useActionState(createContest, null);

  if (!open) {
    return <Button onClick={() => setOpen(true)}>+ Nouveau championnat</Button>;
  }

  const kind = getEventKind(eventKind);
  // Le catalogue de compétitions (et l'import de calendrier qui va avec)
  // ne concerne que le football : un événement générique n'a pas de
  // fournisseur, sa clé retombe sur « custom » côté serveur.
  const usesCompetition = kind?.usesCompetition ?? false;
  const suggestionCount = suggestedQuestionsFor(eventKind).length;

  return (
    <form
      action={formAction}
      className="flex flex-wrap items-end gap-2 rounded-2xl border-2 border-k-ink bg-white p-4 shadow-[4px_4px_0_rgba(33,29,22,0.9)]"
    >
      {/* Modèles préconfigurés : le football n'est qu'une carte parmi les
          autres. La valeur envoyée EST la case cochée (`event_kind`), il
          n'y a donc aucun champ caché à tenir synchronisé. */}
      <fieldset className="w-full">
        <legend className="mb-1.5 block text-sm font-bold text-k-ink">
          Type d&apos;événement
        </legend>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {EVENT_KINDS.map((option) => (
            <label
              key={option.key}
              className="relative flex cursor-pointer gap-2.5 rounded-xl border-2 border-k-ink/15 bg-white p-3 transition-colors has-[:checked]:border-k-ink has-[:checked]:bg-k-yellow/25 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-k-yellow has-[:focus-visible]:ring-offset-1"
            >
              <input
                type="radio"
                name="event_kind"
                value={option.key}
                checked={eventKind === option.key}
                onChange={() => setEventKind(option.key)}
                className="sr-only"
              />
              <span className="text-xl leading-none" aria-hidden>
                {option.icon}
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-bold text-k-ink">
                  {option.label}
                </span>
                <span className="mt-0.5 block text-xs text-zinc-500">
                  {option.hint}
                </span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      {usesCompetition && (
        <div>
          <Label htmlFor={`contest-competition${instanceId}`}>Compétition</Label>
          <select
            id={`contest-competition${instanceId}`}
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
        <Label htmlFor={`contest-name${instanceId}`}>
          {usesCompetition ? "Nom du championnat" : "Nom de l'événement"}
        </Label>
        <Input
          id={`contest-name${instanceId}`}
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

      {/* Le verrouillage par défaut ne s'applique JAMAIS à une question de
          type `score` : les matchs importés gardent le coup d'envoi comme
          échéance, pour suivre les reports de calendrier. Sur un modèle
          football — dont l'événement ne contient à la création que des
          matchs — le champ n'aurait aucun effet : il n'est pas proposé
          (champ ET valeur retirés du formulaire, aucun label orphelin). */}
      {!usesCompetition && (
        <div>
          <input type="hidden" name="default_locks_at" value={locksLocal} />
          <Label htmlFor={`contest-default-locks${instanceId}`}>
            Verrouillage par défaut (optionnel)
          </Label>
          <Input
            id={`contest-default-locks${instanceId}`}
            type="datetime-local"
            className="w-56"
            onChange={(e) => setLocksLocal(e.target.value)}
          />
        </div>
      )}

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
      <p className="w-full text-xs text-zinc-500">
        {usesCompetition
          ? "Chaque match ferme à son coup d'envoi, reports de calendrier compris : aucune date de verrouillage à régler ici."
          : `La date de verrouillage s'applique aux questions qui n'ont pas leur propre échéance. Heure de l'établissement (${timeZone}).`}
        {suggestionCount > 0 &&
          ` Après création, ${suggestionCount} question${suggestionCount > 1 ? "s" : ""} vous ${suggestionCount > 1 ? "seront proposées" : "sera proposée"} en brouillon — à compléter puis valider.`}
      </p>
      <FieldError message={state && !state.ok ? state.error : undefined} />
      {/* Les cartes ci-dessus guident déjà le CHOIX du type d'événement, et le
          paragraphe au-dessus explique le verrouillage. Il manquait la seule
          chose que les deux supposent sans la dire : ce bouton ne publie
          rien. */}
      <InfoBulle
        id={`creation-pronostics${instanceId}`}
        resume="Ce qui va se passer"
        defaultOpen
        className="w-full"
      >
        Créer prépare un événement de pronostics en brouillon : rien n&apos;est
        publié et aucun joueur ne peut encore parier. Vous relisez et validez
        les questions sur la page qui s&apos;ouvre. Vous le retrouverez à tout
        moment dans la liste de vos pronostics.
      </InfoBulle>
    </form>
  );
}
