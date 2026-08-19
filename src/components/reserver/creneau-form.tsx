"use client";

import { useState } from "react";
import {
  createReserverSlot,
  updateReserverSlot,
  updateReserverSlotStatus,
} from "@/actions/reserver";
import { Button } from "@/components/ui/button";
import { FieldError, Input, Label } from "@/components/ui/input";
import { isoToZonedDateTimeInput } from "@/lib/date-time";
import {
  RESERVER_CAPACITY_MAX,
  RESERVER_CAPACITY_MIN,
  RESERVER_WAITLIST_OFFER_MINUTES_DEFAUT,
  RESERVER_WAITLIST_OFFER_MINUTES_MAX,
  RESERVER_WAITLIST_OFFER_MINUTES_MIN,
  type ReservationSlotStatus,
} from "@/lib/reserver";
import type { ReserverSlotDashboardView } from "@/lib/reserver-context";
import { useActionForm } from "@/lib/use-action-form";
import { CAPACITE_DEFAUT, champSelect } from "@/components/reserver/champs";

// useActionForm et non useActionState : l'état de chargement doit retomber même
// quand le rendu ne rejoue pas la revalidation — docs/bugs.md. Aucune de ces
// actions ne redirige, l'exception de `NewQuizForm` ne s'applique donc pas.

/**
 * Les trois valeurs du `check` de `reservation_slots.status`, dans les mots du
 * commerçant. Le brouillon est invisible du joueur ; seul « ouvert » est
 * réservable ; « fermé » arrête les inscriptions sans toucher à une seule
 * réservation déjà confirmée (critère d'acceptation RES-2).
 */
const STATUTS: { valeur: ReservationSlotStatus; label: string }[] = [
  { valeur: "draft", label: "Brouillon — invisible de vos clients" },
  { valeur: "open", label: "Ouvert aux réservations" },
  { valeur: "closed", label: "Fermé — plus de nouvelle réservation" },
];

/**
 * Création ET édition d'un créneau — un seul formulaire, deux actions.
 *
 * ── L'ÉTAT N'EST PAS DANS CE FORMULAIRE, ET C'EST VOULU ──
 *
 * `createReserverSlot` n'accepte aucun statut : un créneau naît en brouillon, et
 * l'ouvrir est un SECOND geste (`updateReserverSlotStatus`, rendu par
 * `EtatCreneauForm` juste en dessous). Le mêler aux heures et à la capacité
 * ferait de l'ouverture aux clients un effet de bord d'un enregistrement de
 * réglages — c'est le seul geste de cet écran qui rende un créneau visible du
 * public, il mérite son propre bouton.
 *
 * ── LES HEURES SONT SAISIES ET AFFICHÉES DANS LE FUSEAU DU COMMERCE ──
 *
 * Un champ `datetime-local` ne connaît que l'heure murale. Sa valeur est donc
 * préremplie par `isoToZonedDateTimeInput`, qui projette l'instant dans le
 * fuseau de l'établissement : un créneau de 14 h à Paris se relit « 14:00 » et
 * non « 12:00 » comme le ferait un `iso.slice(0, 16)` — un simple aller-retour
 * d'édition l'aurait alors décalé de deux heures sans que personne n'y touche.
 *
 * Symétriquement, ce que le commerçant écrit part TEL QUEL : c'est la server
 * action, seule à connaître le fuseau qui fait foi, qui en fait un instant —
 * et qui REFUSE une heure inexistante ou ambiguë au changement d'heure. Le
 * navigateur du commerçant peut être n'importe où ; c'est l'heure de sa
 * boutique qui compte, jamais celle de son téléphone.
 *
 * ── `capacity` A UN MINIMUM DE 1, PAS DE 0 ──
 *
 * La base l'exige (`check (capacity > 0)`) et sa raison est écrite dans la
 * migration : un créneau à zéro place n'est pas un créneau fermé — `status` dit
 * cela — c'est une promesse d'attente sans issue, affichée comme une offre.
 */
export function CreneauForm({
  activityId,
  creneau = null,
  timeZone,
  onFerme,
}: {
  activityId: string;
  /** `null` : création. Sinon, édition de ce créneau. */
  creneau?: ReserverSlotDashboardView | null;
  timeZone: string;
  onFerme?: () => void;
}) {
  const edition = creneau !== null;
  const { state, pending, onSubmit } = useActionForm(
    edition ? updateReserverSlot : createReserverSlot,
    {
      // La création vide le formulaire : sans cela l'heure du créneau précédent
      // reste en place et invite à poser deux fois le même — ce que la base
      // refuserait (unicité activité + heure de début), après coup.
      resetOnSuccess: !edition,
      // Le rafraîchissement est le SEUL moyen de voir le créneau qui vient de
      // naître : la liste n'a aucun état local. Sans lui le commerçant ne voit
      // rien, ressaisit, et se fait refuser un doublon qu'il n'a pas compris.
      reloadOnSuccess: !edition,
      networkError: "Enregistrement impossible, réessayez.",
    },
  );
  const suffixe = edition ? `-${creneau.id}` : "-nouveau";

  return (
    <form
      onSubmit={onSubmit}
      className="rounded-2xl border-2 border-k-ink bg-white p-4 shadow-[4px_4px_0_rgba(33,29,22,0.9)]"
    >
      {edition ? (
        <input type="hidden" name="id" value={creneau.id} />
      ) : (
        <input type="hidden" name="activityId" value={activityId} />
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor={`creneau-debut${suffixe}`}>Début</Label>
          <Input
            id={`creneau-debut${suffixe}`}
            name="startsAt"
            type="datetime-local"
            required
            defaultValue={
              edition ? isoToZonedDateTimeInput(creneau.startsAt, timeZone) : ""
            }
            autoFocus={!edition}
          />
        </div>
        <div>
          <Label htmlFor={`creneau-fin${suffixe}`}>Fin</Label>
          <Input
            id={`creneau-fin${suffixe}`}
            name="endsAt"
            type="datetime-local"
            required
            defaultValue={
              edition ? isoToZonedDateTimeInput(creneau.endsAt, timeZone) : ""
            }
          />
        </div>
        <div className="sm:col-span-2">
          <Label htmlFor={`creneau-capacite${suffixe}`}>Nombre de places</Label>
          <Input
            id={`creneau-capacite${suffixe}`}
            name="capacity"
            type="number"
            inputMode="numeric"
            min={RESERVER_CAPACITY_MIN}
            max={RESERVER_CAPACITY_MAX}
            step={1}
            required
            defaultValue={edition ? creneau.capacity : CAPACITE_DEFAUT}
            aria-describedby={`creneau-capacite-aide${suffixe}`}
            className="sm:max-w-40"
          />
          <p
            id={`creneau-capacite-aide${suffixe}`}
            className="mt-1.5 text-xs font-semibold text-k-body"
          >
            {edition && creneau.vivantes > 0
              ? `${creneau.vivantes} place${creneau.vivantes > 1 ? "s" : ""} déjà prise${creneau.vivantes > 1 ? "s" : ""} sur ce créneau : n'allez pas en dessous.`
              : "Au moins une place. Un créneau sans place n'est pas un créneau fermé — c'est l'état qui sert à cela."}
          </p>
        </div>

        {/* ── LA FENÊTRE D'OFFRE DE LA LISTE PRIORITAIRE ──

            Le champ est VIDE par défaut, et vide ne veut pas dire zéro : la
            colonne accepte `null`, qui signifie « le défaut du produit »
            (deux heures). Écrire 120 dans chaque ligne aurait figé ce défaut
            dans autant de lignes qu'il y a de créneaux — le changer plus tard
            aurait demandé une migration de données au lieu d'une constante.

            Les bornes viennent de `src/lib/reserver.ts`, miroir du `check` SQL :
            sous cinq minutes l'offre est morte avant d'être lue, au-delà de
            vingt-quatre heures ce n'est plus une offre mais une réservation qui
            ne dit pas son nom. */}
        <div className="sm:col-span-2">
          <Label htmlFor={`creneau-fenetre${suffixe}`}>
            Fenêtre d&apos;offre de la liste d&apos;attente (minutes)
          </Label>
          <Input
            id={`creneau-fenetre${suffixe}`}
            name="waitlistOfferMinutes"
            type="number"
            inputMode="numeric"
            min={RESERVER_WAITLIST_OFFER_MINUTES_MIN}
            max={RESERVER_WAITLIST_OFFER_MINUTES_MAX}
            step={1}
            placeholder={String(RESERVER_WAITLIST_OFFER_MINUTES_DEFAUT)}
            defaultValue={
              edition ? (creneau.waitlistOfferMinutes ?? "") : ""
            }
            aria-describedby={`creneau-fenetre-aide${suffixe}`}
            className="sm:max-w-40"
          />
          <p
            id={`creneau-fenetre-aide${suffixe}`}
            className="mt-1.5 text-xs font-semibold text-k-body"
          >
            Quand une place se libère sur un créneau complet, elle est tenue ce
            temps-là pour la personne en tête de liste, puis passe
            automatiquement à la suivante. Laissez vide pour le réglage par
            défaut ({RESERVER_WAITLIST_OFFER_MINUTES_DEFAUT} minutes) ; entre{" "}
            {RESERVER_WAITLIST_OFFER_MINUTES_MIN} minutes et{" "}
            {RESERVER_WAITLIST_OFFER_MINUTES_MAX} minutes sinon. L&apos;offre ne
            dépasse jamais le début du créneau.
          </p>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Button type="submit" disabled={pending}>
          {pending
            ? "Enregistrement…"
            : edition
              ? "Enregistrer le créneau"
              : "Ajouter le créneau"}
        </Button>
        {onFerme ? (
          <Button
            type="button"
            variant="ghost"
            onClick={onFerme}
            disabled={pending}
          >
            Annuler
          </Button>
        ) : null}
        {state?.ok ? (
          <p className="text-sm font-bold text-emerald-700">Enregistré.</p>
        ) : null}
      </div>
      <FieldError message={state && !state.ok ? state.error : undefined} />

      {!edition ? (
        <p className="mt-3 rounded-xl border-2 border-k-ink/20 bg-k-bg px-3 py-2 text-xs leading-5 text-k-body">
          Le créneau est créé en <strong>brouillon</strong> : personne ne le voit
          encore. Vous l&apos;ouvrirez aux réservations en un clic, une fois ses
          heures et ses places relues.
        </p>
      ) : null}
    </form>
  );
}

/**
 * L'ÉTAT DU CRÉNEAU — le seul geste de cet écran qui change ce que le public voit.
 *
 * Formulaire séparé, et non un champ de plus dans les réglages : ouvrir un
 * créneau rend une page réservable par n'importe qui la scanne. En faire l'effet
 * de bord d'un « Enregistrer » qui corrige aussi une faute d'heure aurait
 * mélangé un geste de préparation et un geste de publication.
 */
export function EtatCreneauForm({
  creneau,
}: {
  creneau: ReserverSlotDashboardView;
}) {
  const { state, pending, onSubmit } = useActionForm(
    updateReserverSlotStatus,
    {
      // L'état posté ici est DÉRIVÉ de la prop serveur (`creneau.status`,
      // sélectionné par `defaultValue`) : la page publique le lit aussitôt
      // (ouvrir un créneau le rend réservable par QR). Sans rechargement, cet
      // écran affiche la valeur choisie alors que le geste suivant repartirait
      // de la même prop périmée — voir `use-action-form-bascule.test.ts`.
      reloadOnSuccess: true,
      networkError: "Enregistrement impossible, réessayez.",
    },
  );

  return (
    <form onSubmit={onSubmit} className="flex flex-wrap items-end gap-2">
      <input type="hidden" name="id" value={creneau.id} />
      <div>
        <Label htmlFor={`creneau-etat-${creneau.id}`} className="sr-only">
          État du créneau
        </Label>
        <select
          id={`creneau-etat-${creneau.id}`}
          name="status"
          defaultValue={creneau.status}
          className={`${champSelect} w-auto`}
        >
          {STATUTS.map(({ valeur, label }) => (
            <option key={valeur} value={valeur}>
              {label}
            </option>
          ))}
        </select>
      </div>
      <Button type="submit" variant="secondary" disabled={pending}>
        {pending ? "…" : "Appliquer"}
      </Button>
      {state?.ok ? (
        <p className="text-sm font-bold text-emerald-700">Enregistré.</p>
      ) : null}
      <FieldError message={state && !state.ok ? state.error : undefined} />
    </form>
  );
}

/** Le formulaire de création, replié derrière un bouton (motif NewQuizForm). */
export function NouveauCreneauForm({
  activityId,
  timeZone,
}: {
  activityId: string;
  timeZone: string;
}) {
  const [ouvert, setOuvert] = useState(false);
  if (!ouvert) {
    return <Button onClick={() => setOuvert(true)}>+ Ajouter un créneau</Button>;
  }
  return (
    <CreneauForm
      activityId={activityId}
      timeZone={timeZone}
      onFerme={() => setOuvert(false)}
    />
  );
}

/** L'édition d'un créneau existant, repliée derrière un bouton discret. */
export function EditerCreneau({
  creneau,
  activityId,
  timeZone,
}: {
  creneau: ReserverSlotDashboardView;
  activityId: string;
  timeZone: string;
}) {
  const [ouvert, setOuvert] = useState(false);
  if (!ouvert) {
    return (
      <Button variant="secondary" onClick={() => setOuvert(true)}>
        Modifier
      </Button>
    );
  }
  return (
    <div className="mt-3 w-full">
      <CreneauForm
        activityId={activityId}
        creneau={creneau}
        timeZone={timeZone}
        onFerme={() => setOuvert(false)}
      />
    </div>
  );
}
