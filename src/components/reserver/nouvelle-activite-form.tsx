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
import { ChampsExperience } from "@/components/reserver/champs-experience";

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
/**
 * `bookingMode` VIENT DE LA PAGE, et il n'a pas de valeur devinable ici
 * (RDV-11).
 *
 * Ce formulaire est monté par DEUX écrans qui filtrent chacun sur ce
 * champ : « Moments » et « Réservation ». Tant qu'il ne le portait pas, la
 * base appliquait son défaut — `moment` — et une activité créée depuis
 * Réservation disparaissait de la page à l'instant même où elle naissait,
 * pour réapparaître dans un autre menu. Le module était injoignable depuis
 * son propre tableau de bord.
 *
 * Le défaut reste `moment` : c'est ce que veut la page Moments, et ce que
 * rendait le formulaire avant ce champ.
 */
export function NouvelleActiviteForm({
  instanceId = "",
  bookingMode = "moment",
  libelle,
}: {
  instanceId?: string;
  bookingMode?: "moment" | "rendez_vous";
  /** Le mot du bouton — « activité » ne dit rien à un restaurateur. */
  libelle?: string;
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
    return (
      <Button onClick={() => setOuvert(true)}>
        {libelle ?? "+ Nouvelle activité"}
      </Button>
    );
  }

  return (
    <form
      onSubmit={onSubmit}
      className="w-full max-w-xl rounded-2xl border-2 border-k-ink bg-white p-4 shadow-[4px_4px_0_rgba(33,29,22,0.9)]"
    >
      {/* LE MODE, EN CHAMP CACHÉ ET NON EN ARGUMENT D'ACTION : ce
          formulaire passe par `useActionForm`, qui envoie un FormData —
          une valeur portée en fermeture ne serait jamais transmise. */}
      <input type="hidden" name="booking_mode" value={bookingMode} />

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

      {/* LES EXPÉRIENCES SIGNATURE (RES-5). Le format est demandé DÈS LA
          CRÉATION, et non renvoyé aux réglages : « Moment Signature » exige au
          moins une étape et une durée — créer d'abord une activité standard,
          puis la convertir, aurait fait rencontrer ces exigences à un moment où
          le commerçant croyait avoir fini. Le défaut reste « Standard », donc ce
          bloc n'ajoute qu'un menu déroulant à qui ne cherche rien de plus. */}
      <ChampsExperience instanceId={instanceId} espacement="mt-3" />

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
