"use client";

import { useMemo, useState } from "react";

import {
  ajouterFermeture,
  ajouterPlageHoraire,
  enregistrerReglagesRendezVous,
  genererCreneaux,
  supprimerFermeture,
  supprimerPlageHoraire,
} from "@/actions/reserver";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { FieldError, Input, Label } from "@/components/ui/input";
import { InfoBulle } from "@/components/dashboard/info-bulle";
import { useActionForm } from "@/lib/use-action-form";
import {
  CAPACITE_CRENEAU_MAX,
  CAPACITE_CRENEAU_MIN,
  HORIZON_MAX,
  HORIZON_MIN,
  JOURS_SEMAINE,
  apercuSemaine,
  dureeLisibleMinutes,
  etatGeneration,
  heureVersMinutes,
  libelleJour,
  libellePlage,
  refusPlage,
  type Fermeture,
  type JourSemaine,
  type PlageHoraireIdentifiee,
} from "@/lib/reserver-horaires";

/**
 * LES HORAIRES RÉCURRENTS, CÔTÉ COMMERÇANT (RDV-1).
 *
 * ── LE GESTE QUE CET ÉCRAN REMPLACE ──
 *
 * Créer ses créneaux un par un. Un commerce ouvert six jours sur sept, c'est
 * une centaine de créneaux par mois — le module était livré et inutilisable
 * pour une prise de rendez-vous. Ici, le commerçant décrit sa SEMAINE TYPE une
 * fois, et la base engendre.
 *
 * ── POURQUOI LA GÉNÉRATION EST UN BOUTON, ET NON UN EFFET ──
 *
 * Enregistrer une plage ne touche à aucun créneau. C'est délibéré : on compose
 * ses horaires en plusieurs gestes — ajouter le lundi, corriger le mardi,
 * retirer le samedi — et régénérer à chaque clic ferait bouger l'agenda sous
 * les pieds du commerçant, trois fois pour une seule décision. Il voit son
 * aperçu, puis il applique.
 *
 * ── L'APERÇU DIT LA SEMAINE TYPE, PAS L'HORIZON ──
 *
 * Projeter sur les trente jours à venir demanderait de connaître les
 * fermetures, le délai de prévenance et la date du jour — tout ce que la base
 * sait mieux que le navigateur. On montre donc ce que le commerçant vient de
 * saisir, et le compte réel arrive avec la réponse de la génération.
 */

const HEURES_SUGGEREES = [
  { label: "Matin", debut: "09:00", fin: "12:30" },
  { label: "Après-midi", debut: "14:00", fin: "18:00" },
  { label: "Journée", debut: "09:00", fin: "18:00" },
  { label: "Soirée", debut: "18:00", fin: "22:00" },
] as const;

export const DUREES_SUGGEREES = [15, 20, 30, 45, 60, 90] as const;

export function HorairesPanneau({
  activityId,
  bookingMode,
  dureeMinutes,
  capacite,
  horizonJours,
  delaiMinutes,
  plages,
  fermetures,
}: {
  activityId: string;
  bookingMode: string;
  dureeMinutes: number | null;
  capacite: number | null;
  horizonJours: number;
  delaiMinutes: number;
  plages: PlageHoraireIdentifiee[];
  fermetures: Fermeture[];
}) {
  return (
    <div className="mt-6 space-y-6">
      <ReglagesRendezVous
        activityId={activityId}
        bookingMode={bookingMode}
        dureeMinutes={dureeMinutes}
        capacite={capacite}
        horizonJours={horizonJours}
        delaiMinutes={delaiMinutes}
      />

      {bookingMode === "rendez_vous" && (
        <>
          <SemaineType
            activityId={activityId}
            plages={plages}
            dureeMinutes={dureeMinutes}
          />
          <Fermetures activityId={activityId} fermetures={fermetures} />
          <Generation
            activityId={activityId}
            bookingMode={bookingMode}
            dureeMinutes={dureeMinutes}
            capacite={capacite}
            plages={plages}
            horizonJours={horizonJours}
          />
        </>
      )}
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// Les réglages : mode, durée, capacité, horizon, délai
// ────────────────────────────────────────────────────────────

function ReglagesRendezVous({
  activityId,
  bookingMode,
  dureeMinutes,
  capacite,
  horizonJours,
  delaiMinutes,
}: {
  activityId: string;
  bookingMode: string;
  dureeMinutes: number | null;
  capacite: number | null;
  horizonJours: number;
  delaiMinutes: number;
}) {
  const [mode, setMode] = useState(bookingMode);
  const [duree, setDuree] = useState(dureeMinutes ? String(dureeMinutes) : "30");
  const { state, pending, onSubmit } = useActionForm(
    enregistrerReglagesRendezVous,
    { networkError: "Enregistrement impossible, réessayez." },
  );

  return (
    <Card>
      <h2 className="font-semibold">Prise de rendez-vous</h2>
      <p className="mb-4 mt-2 text-sm text-zinc-500">
        Un <strong>Moment</strong> se compose créneau par créneau — un atelier,
        une dégustation, une date précise. Une <strong>prise de rendez-vous</strong>{" "}
        se décrit une fois en horaires, et les créneaux se génèrent tout seuls.
      </p>

      <form onSubmit={onSubmit} className="space-y-4">
        <input type="hidden" name="activity_id" value={activityId} />

        <fieldset>
          <legend className="mb-1.5 text-sm font-bold text-k-ink">
            Comment naissent les créneaux
          </legend>
          <div className="flex flex-wrap gap-2">
            {[
              { valeur: "moment", label: "Moment — créneaux à la main" },
              { valeur: "rendez_vous", label: "Rendez-vous — horaires récurrents" },
            ].map((choix) => (
              <label
                key={choix.valeur}
                className={`cursor-pointer rounded-xl border-2 px-3 py-2 text-sm font-bold transition-colors ${
                  mode === choix.valeur
                    ? "border-k-ink bg-k-yellow/40 shadow-[3px_3px_0_var(--color-k-ink)]"
                    : "border-k-ink/20 bg-white hover:border-k-ink/50"
                }`}
              >
                <input
                  type="radio"
                  name="booking_mode"
                  value={choix.valeur}
                  checked={mode === choix.valeur}
                  onChange={() => setMode(choix.valeur)}
                  className="sr-only"
                />
                {choix.label}
              </label>
            ))}
          </div>
        </fieldset>

        {mode === "rendez_vous" && (
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="rdv-duree">Durée d&apos;un rendez-vous (minutes)</Label>
              <div className="flex flex-wrap items-center gap-2">
                <Input
                  id="rdv-duree"
                  name="duration_minutes"
                  type="number"
                  min={5}
                  max={480}
                  value={duree}
                  onChange={(e) => setDuree(e.target.value)}
                  className="w-24 text-center"
                  required
                />
                {DUREES_SUGGEREES.map((d) => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => setDuree(String(d))}
                    className={`rounded-lg border-2 px-2 py-1 text-xs font-black text-k-ink transition-colors ${
                      Number(duree) === d
                        ? "border-k-ink bg-k-yellow/40"
                        : "border-k-ink/20 bg-white hover:border-k-ink/50"
                    }`}
                  >
                    {d}
                  </button>
                ))}
              </div>
              <p className="mt-1.5 text-xs text-zinc-500">
                C&apos;est aussi le pas de la grille : une plage de 9 h à 11 h en{" "}
                {duree || "30"} minutes donne{" "}
                {Math.max(0, Math.floor(120 / (Number(duree) || 30)))} créneaux.
              </p>
            </div>

            <div>
              <Label htmlFor="rdv-capacite">Personnes par créneau</Label>
              <Input
                id="rdv-capacite"
                name="slot_capacity"
                type="number"
                min={CAPACITE_CRENEAU_MIN}
                max={CAPACITE_CRENEAU_MAX}
                defaultValue={capacite ?? 1}
                className="w-24 text-center"
                required
              />
              <p className="mt-1.5 text-xs text-zinc-500">
                <strong>1</strong> pour un rendez-vous individuel. Au-delà,
                plusieurs clients partagent le même horaire.
              </p>
            </div>

            <div>
              <Label htmlFor="rdv-horizon">Réservable jusqu&apos;à (jours)</Label>
              <Input
                id="rdv-horizon"
                name="booking_horizon_days"
                type="number"
                min={HORIZON_MIN}
                max={HORIZON_MAX}
                defaultValue={horizonJours}
                className="w-24 text-center"
              />
              <p className="mt-1.5 text-xs text-zinc-500">
                Au-delà, vos clients ne voient rien à réserver.
              </p>
            </div>

            <div>
              <Label htmlFor="rdv-delai">Délai de prévenance (minutes)</Label>
              <Input
                id="rdv-delai"
                name="lead_time_minutes"
                type="number"
                min={0}
                max={20160}
                defaultValue={delaiMinutes}
                className="w-24 text-center"
              />
              <p className="mt-1.5 text-xs text-zinc-500">
                Aucun créneau proposé avant ce délai — évite le rendez-vous
                pris pour dans dix minutes. <strong>0</strong> = sans délai.
              </p>
            </div>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" disabled={pending}>
            {pending
              ? "Enregistrement…"
              : "Enregistrer la prise de rendez-vous"}
          </Button>
          {state && !state.ok ? <FieldError message={state.error} /> : null}
          {state?.ok ? (
            <span role="status" className="text-sm font-bold text-k-green">
              Réglages enregistrés.
            </span>
          ) : null}
        </div>
      </form>
    </Card>
  );
}

// ────────────────────────────────────────────────────────────
// La semaine type
// ────────────────────────────────────────────────────────────

export function SemaineType({
  activityId,
  plages,
  dureeMinutes,
}: {
  activityId: string;
  plages: PlageHoraireIdentifiee[];
  dureeMinutes: number | null;
}) {
  const duree = dureeMinutes ?? 30;
  const apercu = useMemo(() => apercuSemaine(plages, duree), [plages, duree]);

  return (
    <Card>
      <h2 className="font-semibold">Vos horaires</h2>
      <p className="mb-4 mt-2 text-sm text-zinc-500">
        Décrivez une semaine type. Pour une coupure de midi, posez{" "}
        <strong>deux plages</strong> le même jour — il n&apos;y a pas de
        « pause » à régler.
      </p>

      <ul className="mb-4 space-y-2">
        {apercu.jours.map((jour) => (
          <li
            key={jour.weekday}
            className="rounded-xl border-2 border-k-ink/15 bg-white px-3 py-2"
          >
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <span className="text-sm font-black text-k-ink">{jour.libelle}</span>
              <span className="text-xs text-zinc-500">
                {jour.plages.length === 0
                  ? "Fermé"
                  : `${dureeLisibleMinutes(jour.minutesOuvertes)} · ${jour.creneaux} créneau${jour.creneaux > 1 ? "x" : ""}`}
              </span>
            </div>
            {jour.plages.length > 0 && (
              <ul className="mt-2 space-y-1">
                {jour.plages.map((plage) => {
                  const identifiee = plages.find(
                    (p) =>
                      p.weekday === plage.weekday &&
                      p.debut === plage.debut &&
                      p.fin === plage.fin,
                  );
                  return (
                    <li
                      key={`${plage.weekday}-${plage.debut}`}
                      className="flex items-center justify-between gap-2 text-sm"
                    >
                      <span className="font-mono text-k-ink">
                        {libellePlage(plage)}
                      </span>
                      {identifiee && (
                        <SupprimerPlage id={identifiee.id} plage={plage} />
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </li>
        ))}
      </ul>

      {apercu.vide ? (
        <p className="mb-4 rounded-xl border-2 border-dashed border-zinc-300 px-4 py-6 text-center text-sm text-zinc-500">
          Aucun horaire pour l&apos;instant — ajoutez votre première plage
          ci-dessous.
        </p>
      ) : (
        <p className="mb-4 rounded-xl bg-k-stripe px-3 py-2 text-sm font-bold text-k-ink">
          Une semaine complète : {apercu.creneauxParSemaine} créneau
          {apercu.creneauxParSemaine > 1 ? "x" : ""}, pour{" "}
          {dureeLisibleMinutes(apercu.minutesOuvertesParSemaine)}{" "}
          d&apos;ouverture.
        </p>
      )}

      <AjouterPlage activityId={activityId} plages={plages} duree={duree} />

      <InfoBulle
        id="aide-horaires-generation"
        resume="Ajouter une plage change-t-il mon agenda tout de suite ?"
        className="mt-4"
      >
        Non, et c&apos;est voulu. Vos horaires se composent en plusieurs gestes ;
        régénérer à chaque clic ferait bouger votre agenda trois fois pour une
        seule décision. Quand vos horaires vous conviennent, le bouton{" "}
        <strong>Générer les créneaux</strong> plus bas les applique — et vous dit
        exactement combien de créneaux il a ouverts.
      </InfoBulle>
    </Card>
  );
}

function SupprimerPlage({
  id,
  plage,
}: {
  id: string;
  plage: { weekday: JourSemaine; debut: number; fin: number };
}) {
  const { pending, onSubmit } = useActionForm(supprimerPlageHoraire, {
    networkError: "Suppression impossible, réessayez.",
  });
  return (
    <form onSubmit={onSubmit}>
      <input type="hidden" name="id" value={id} />
      <Button
        type="submit"
        variant="ghost"
        disabled={pending}
        aria-label={`Supprimer la plage du ${libelleJour(plage.weekday).toLowerCase()} ${libellePlage(plage)}`}
      >
        ✕
      </Button>
    </form>
  );
}

function AjouterPlage({
  activityId,
  plages,
  duree,
}: {
  activityId: string;
  plages: PlageHoraireIdentifiee[];
  duree: number;
}) {
  const [weekday, setWeekday] = useState<JourSemaine>(0);
  const [debut, setDebut] = useState("09:00");
  const [fin, setFin] = useState("18:00");
  const { state, pending, onSubmit } = useActionForm(ajouterPlageHoraire, {
    networkError: "Ajout impossible, réessayez.",
  });

  // LE MÊME REFUS QUE LE SERVEUR, montré AVANT l'envoi. Ce n'est pas la garde —
  // l'action revérifie tout — c'est ce qui évite un aller-retour pour une
  // erreur que l'écran voyait déjà.
  const minutesDebut = heureVersMinutes(debut);
  const minutesFin = heureVersMinutes(fin);
  const refus =
    minutesDebut === null || minutesFin === null
      ? "Indiquez des heures valides (par exemple 09:00)."
      : refusPlage(
          { weekday, debut: minutesDebut, fin: minutesFin },
          plages.filter((p) => p.weekday === weekday),
        );

  const creneaux =
    minutesDebut !== null && minutesFin !== null && minutesFin > minutesDebut
      ? Math.floor((minutesFin - minutesDebut) / duree)
      : 0;

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <input type="hidden" name="activity_id" value={activityId} />
      <input type="hidden" name="weekday" value={weekday} />
      <input type="hidden" name="starts_at_minute" value={minutesDebut ?? ""} />
      <input type="hidden" name="ends_at_minute" value={minutesFin ?? ""} />

      <div className="flex flex-wrap items-end gap-3">
        <div>
          <Label htmlFor="plage-jour">Jour</Label>
          <select
            id="plage-jour"
            value={weekday}
            onChange={(e) => setWeekday(Number(e.target.value) as JourSemaine)}
            className="rounded-xl border-2 border-k-ink bg-white px-3 py-2.5 text-sm text-k-ink focus:outline-none focus:ring-2 focus:ring-k-yellow"
          >
            {JOURS_SEMAINE.map((jour, index) => (
              <option key={jour} value={index}>
                {jour}
              </option>
            ))}
          </select>
        </div>
        <div>
          <Label htmlFor="plage-debut">De</Label>
          <Input
            id="plage-debut"
            type="time"
            value={debut}
            onChange={(e) => setDebut(e.target.value)}
            className="w-32"
          />
        </div>
        <div>
          <Label htmlFor="plage-fin">À</Label>
          <Input
            id="plage-fin"
            type="time"
            value={fin}
            onChange={(e) => setFin(e.target.value)}
            className="w-32"
          />
        </div>
        <Button type="submit" disabled={pending || refus !== null}>
          {pending ? "Ajout…" : "Ajouter la plage"}
        </Button>
      </div>

      <div className="flex flex-wrap gap-2">
        {HEURES_SUGGEREES.map((suggestion) => (
          <button
            key={suggestion.label}
            type="button"
            onClick={() => {
              setDebut(suggestion.debut);
              setFin(suggestion.fin);
            }}
            className="rounded-lg border-2 border-k-ink/20 bg-white px-2.5 py-1 text-xs font-bold text-k-ink hover:border-k-ink/50"
          >
            {suggestion.label} · {suggestion.debut}–{suggestion.fin}
          </button>
        ))}
      </div>

      <p role="status" className="text-xs text-zinc-500">
        {refus ? (
          <span className="font-bold text-red-600">{refus}</span>
        ) : (
          `Cette plage ouvrira ${creneaux} créneau${creneaux > 1 ? "x" : ""} chaque ${libelleJour(weekday).toLowerCase()}.`
        )}
      </p>

      {state && !state.ok ? <FieldError message={state.error} /> : null}
    </form>
  );
}

// ────────────────────────────────────────────────────────────
// Les fermetures
// ────────────────────────────────────────────────────────────

export function Fermetures({
  activityId,
  fermetures,
}: {
  activityId: string;
  fermetures: Fermeture[];
}) {
  const { state, pending, onSubmit } = useActionForm(ajouterFermeture, {
    networkError: "Ajout impossible, réessayez.",
  });

  return (
    <Card>
      <h2 className="font-semibold">Fermetures exceptionnelles</h2>
      <p className="mb-4 mt-2 text-sm text-zinc-500">
        Congés, jours fériés, fermeture technique. Aucun créneau n&apos;est
        engendré sur ces journées — bornes <strong>incluses</strong>.
      </p>

      {fermetures.length === 0 ? (
        <p className="mb-4 text-sm text-zinc-500">Aucune fermeture prévue.</p>
      ) : (
        <ul className="mb-4 space-y-2">
          {fermetures.map((fermeture) => (
            <li
              key={fermeture.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-xl border-2 border-k-ink/15 bg-white px-3 py-2"
            >
              <span className="text-sm font-bold text-k-ink">
                {fermeture.debut === fermeture.fin
                  ? `Le ${fermeture.debut}`
                  : `Du ${fermeture.debut} au ${fermeture.fin}`}
                {fermeture.motif ? (
                  <span className="ml-2 font-normal text-zinc-500">
                    {fermeture.motif}
                  </span>
                ) : null}
              </span>
              <SupprimerFermetureBouton id={fermeture.id} />
            </li>
          ))}
        </ul>
      )}

      <form onSubmit={onSubmit} className="flex flex-wrap items-end gap-3">
        <input type="hidden" name="activity_id" value={activityId} />
        <div>
          <Label htmlFor="fermeture-debut">Du</Label>
          <Input id="fermeture-debut" name="starts_on" type="date" required />
        </div>
        <div>
          <Label htmlFor="fermeture-fin">Au</Label>
          <Input id="fermeture-fin" name="ends_on" type="date" required />
        </div>
        <div className="min-w-[12rem] flex-1">
          <Label htmlFor="fermeture-motif">Motif (optionnel)</Label>
          <Input
            id="fermeture-motif"
            name="reason"
            maxLength={200}
            placeholder="Congés d'été"
          />
        </div>
        <Button type="submit" disabled={pending}>
          {pending ? "Ajout…" : "Ajouter la fermeture"}
        </Button>
        {state && !state.ok ? (
          <div className="w-full">
            <FieldError message={state.error} />
          </div>
        ) : null}
      </form>
    </Card>
  );
}

function SupprimerFermetureBouton({ id }: { id: string }) {
  const { pending, onSubmit } = useActionForm(supprimerFermeture, {
    networkError: "Suppression impossible, réessayez.",
  });
  return (
    <form onSubmit={onSubmit}>
      <input type="hidden" name="id" value={id} />
      <Button type="submit" variant="ghost" disabled={pending}>
        Retirer
      </Button>
    </form>
  );
}

// ────────────────────────────────────────────────────────────
// La génération
// ────────────────────────────────────────────────────────────

export function Generation({
  activityId,
  bookingMode,
  dureeMinutes,
  capacite,
  plages,
  horizonJours,
}: {
  activityId: string;
  bookingMode: string;
  dureeMinutes: number | null;
  capacite: number | null;
  plages: PlageHoraireIdentifiee[];
  horizonJours: number;
}) {
  const { state, pending, onSubmit } = useActionForm(genererCreneaux, {
    networkError: "Génération impossible, réessayez.",
  });

  const etat = etatGeneration({
    bookingMode,
    dureeMinutes,
    capacite,
    plages,
  });

  return (
    <Card>
      <h2 className="font-semibold">Ouvrir les créneaux</h2>
      <p className="mb-4 mt-2 text-sm text-zinc-500">
        Applique vos horaires sur les <strong>{horizonJours} prochains jours</strong>.
        Un créneau déjà réservé n&apos;est jamais retiré, même s&apos;il sort de
        vos horaires — vous le fermez vous-même, vos clients prévenus. Les
        créneaux que vous avez posés à la main ne bougent pas non plus.
      </p>

      <form onSubmit={onSubmit} className="flex flex-wrap items-center gap-3">
        <input type="hidden" name="activity_id" value={activityId} />
        <Button type="submit" disabled={pending || !etat.possible}>
          {pending ? "Génération…" : "Générer les créneaux"}
        </Button>
        {!etat.possible && etat.raison ? (
          <span className="text-sm font-semibold text-amber-700">
            {etat.raison}
          </span>
        ) : null}
      </form>

      <div role="status" aria-live="polite" className="mt-3">
        {state?.ok ? (
          <p className="rounded-xl bg-k-green/10 px-3 py-2 text-sm font-bold text-k-ink">
            {state.data.message}
          </p>
        ) : null}
        {state && !state.ok ? <FieldError message={state.error} /> : null}
      </div>
    </Card>
  );
}
