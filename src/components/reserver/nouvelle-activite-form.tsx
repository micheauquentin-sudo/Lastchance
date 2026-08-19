"use client";

import { useState } from "react";
import { createReserverActivity } from "@/actions/reserver";
import { Button } from "@/components/ui/button";
import { FieldError, Input, Label } from "@/components/ui/input";
import { InfoBulle } from "@/components/dashboard/info-bulle";
import { useActionForm } from "@/lib/use-action-form";
import {
  RESERVER_ACTIVITY_DESCRIPTION_MAX,
  RESERVER_ACTIVITY_NAME_MAX,
} from "@/lib/reserver";
import { champDescription } from "@/components/reserver/champs";

/**
 * Création d'une activité réservable.
 *
 * ── `useActionForm`, ET `reloadOnSuccess` ──
 *
 * `useActionForm` parce que c'est la règle du dépôt : le `pending` de
 * `useActionState` peut ne jamais retomber (docs/bugs.md). L'exception —
 * `NewQuizForm` — ne vaut que pour une action qui REDIRIGE, ce que celle-ci ne
 * fait pas : elle rend l'activité créée dans la liste d'à côté.
 *
 * Et `reloadOnSuccess` pour la raison exacte d'`AddPrizeForm` : le
 * rafraîchissement est le SEUL moyen pour cet écran de montrer l'activité qui
 * vient de naître — la liste n'a aucun état local. Le commerçant qui ne voit
 * rien retape et re-clique ; ici la base le rattraperait (unicité du nom par
 * organisation), mais il lirait alors un refus incompréhensible sur une
 * création qui avait réussi.
 *
 * `instanceId` suffixe les identifiants : la page liste monte ce formulaire
 * DEUX fois (en tête d'écran et dans l'état vide), et deux `id` identiques
 * casseraient `htmlFor`, donc l'annonce au lecteur d'écran.
 */
export function NouvelleActiviteForm({
  instanceId = "",
}: {
  instanceId?: string;
}) {
  const [ouvert, setOuvert] = useState(false);
  const { state, pending, onSubmit } = useActionForm(
    createReserverActivity,
    {
      resetOnSuccess: true,
      reloadOnSuccess: true,
      networkError: "Création impossible, réessayez.",
    },
  );

  if (!ouvert) {
    return <Button onClick={() => setOuvert(true)}>+ Nouvelle activité</Button>;
  }

  return (
    <form
      onSubmit={onSubmit}
      className="w-full max-w-xl rounded-2xl border-2 border-k-ink bg-white p-4 shadow-[4px_4px_0_rgba(33,29,22,0.9)]"
    >
      <div>
        <Label htmlFor={`activite-nom${instanceId}`}>Nom de l&apos;activité</Label>
        <Input
          id={`activite-nom${instanceId}`}
          name="name"
          required
          maxLength={RESERVER_ACTIVITY_NAME_MAX}
          placeholder="Ex : Dégustation du samedi"
          autoFocus
        />
      </div>
      <div className="mt-3">
        <Label htmlFor={`activite-description${instanceId}`}>
          Description{" "}
          <span className="font-semibold text-k-body">(facultatif)</span>
        </Label>
        <textarea
          id={`activite-description${instanceId}`}
          name="description"
          rows={3}
          maxLength={RESERVER_ACTIVITY_DESCRIPTION_MAX}
          placeholder="Ce que vos clients trouveront sur place : durée, ce qui est fourni, où se présenter…"
          className={champDescription}
        />
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button type="submit" disabled={pending}>
          {pending ? "Création…" : "Créer l'activité"}
        </Button>
        <Button
          type="button"
          variant="ghost"
          onClick={() => setOuvert(false)}
          disabled={pending}
        >
          Annuler
        </Button>
      </div>
      <FieldError message={state && !state.ok ? state.error : undefined} />
      <InfoBulle
        id={`creation-activite${instanceId}`}
        resume="Ce qui va se passer"
        defaultOpen
        className="mt-3"
      >
        Créer l&apos;activité ne la rend réservable par personne : vous y ajoutez
        ensuite des créneaux, chacun avec sa date, son heure et son nombre de
        places, et un créneau reste en brouillon tant que vous ne l&apos;ouvrez
        pas. Une activité ne se supprime pas — vous la coupez, et les
        réservations déjà prises restent intactes.
      </InfoBulle>
    </form>
  );
}
