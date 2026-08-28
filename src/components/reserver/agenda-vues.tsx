"use client";

import { useMemo, useState } from "react";

import { Card } from "@/components/ui/card";
import {
  ECHELLES,
  JOURS_COURTS,
  decaler,
  densite,
  fenetre,
  grouperParJour,
  grouperParMois,
  joursDeLaFenetre,
  libelleFenetre,
  libelleMois,
  remplissage,
  type CreneauAgenda,
  type EchelleAgenda,
  type JourAgenda,
} from "@/lib/agenda-vues";

/**
 * L'AGENDA DU COMMERÇANT — jour, semaine, mois, année (RDV-3).
 *
 * ── POURQUOI QUATRE VUES, ET PAS UNE LISTE ──
 *
 * L'agenda existant était une liste de créneaux, du plus proche au plus
 * lointain. Elle répond à « qu'est-ce qui vient » et à rien d'autre : ni « ai-je
 * de la place jeudi », ni « quelle semaine est creuse », ni « mon mois de
 * septembre est-il rempli ». Chaque échelle répond à une question que les
 * autres ne posent pas.
 *
 * ── LES QUATRE ÉCHELLES NE MONTRENT PAS LA MÊME CHOSE ──
 *
 *  · JOUR    — les créneaux à l'heure près, avec qui vient. C'est le service.
 *  · SEMAINE — sept colonnes, les heures dedans. C'est la vue de travail.
 *  · MOIS    — une grille de cases, une par jour, colorée par le remplissage.
 *              On n'y lit pas les heures : on y cherche les trous.
 *  · ANNÉE   — douze lignes de mois. On n'y lit ni heure ni jour : on y voit
 *              la saison. Rendre 365 cases aurait fait défiler un écran entier
 *              pour une information qu'on lit en douze lignes.
 *
 * ── TOUT EST CALCULÉ PAR UN MODULE PUR ──
 *
 * Le regroupement, les fenêtres, le fuseau et les libellés vivent dans
 * `@/lib/agenda-vues`, testés sans DOM. Ce fichier ne fait que peindre — c'est
 * ce qui permet de garantir qu'un créneau de 23 h 30 UTC tombe bien le
 * lendemain à Paris sans avoir à monter un navigateur pour le vérifier.
 */

const CLASSES_DENSITE: Record<ReturnType<typeof densite>, string> = {
  vide: "bg-white text-zinc-400 border-k-ink/10",
  calme: "bg-k-yellow/20 text-k-ink border-k-ink/25",
  actif: "bg-k-yellow/60 text-k-ink border-k-ink/50",
  complet: "bg-k-green/30 text-k-ink border-k-green",
};

export function AgendaVues({
  creneaux,
  timeZone,
  /** Journée d'ancrage, `YYYY-MM-DD` — calculée au serveur, jamais ici. */
  aujourdHui,
}: {
  creneaux: CreneauAgenda[];
  timeZone: string;
  aujourdHui: string;
}) {
  const [echelle, setEchelle] = useState<EchelleAgenda>("semaine");
  const [ancre, setAncre] = useState(aujourdHui);

  const jours = useMemo(
    () => grouperParJour(creneaux, timeZone),
    [creneaux, timeZone],
  );
  const bornes = useMemo(() => fenetre(echelle, ancre), [echelle, ancre]);
  const periode = useMemo(
    () => joursDeLaFenetre(bornes, jours),
    [bornes, jours],
  );

  const total = periode.reduce((n, j) => n + j.creneaux.length, 0);
  const places = periode.reduce((n, j) => n + j.capacite, 0);
  const prises = periode.reduce((n, j) => n + j.occupees, 0);
  const taux = remplissage(places, prises);

  return (
    <Card className="mt-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-semibold">Agenda</h2>
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Échelle">
          {ECHELLES.map((e) => (
            <button
              key={e.cle}
              type="button"
              onClick={() => setEchelle(e.cle)}
              aria-pressed={echelle === e.cle}
              className={`rounded-xl border-2 px-3 py-1.5 text-xs font-black text-k-ink transition-colors ${
                echelle === e.cle
                  ? "border-k-ink bg-k-yellow/40 shadow-[3px_3px_0_var(--color-k-ink)]"
                  : "border-k-ink/20 bg-white hover:border-k-ink/50"
              }`}
            >
              {e.label}
            </button>
          ))}
        </div>
      </div>

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setAncre(decaler(echelle, ancre, -1))}
            aria-label="Période précédente"
            className="rounded-xl border-2 border-k-ink/25 bg-white px-3 py-1.5 text-sm font-black text-k-ink hover:border-k-ink"
          >
            ←
          </button>
          <span className="min-w-[12rem] text-center text-sm font-black text-k-ink">
            {libelleFenetre(echelle, ancre)}
          </span>
          <button
            type="button"
            onClick={() => setAncre(decaler(echelle, ancre, 1))}
            aria-label="Période suivante"
            className="rounded-xl border-2 border-k-ink/25 bg-white px-3 py-1.5 text-sm font-black text-k-ink hover:border-k-ink"
          >
            →
          </button>
          {ancre !== aujourdHui && (
            <button
              type="button"
              onClick={() => setAncre(aujourdHui)}
              className="rounded-xl border-2 border-k-ink/25 bg-white px-3 py-1.5 text-xs font-bold text-k-ink hover:border-k-ink"
            >
              Aujourd&apos;hui
            </button>
          )}
        </div>

        <p className="text-xs text-zinc-500">
          {total === 0
            ? "Aucun créneau sur cette période."
            : `${total} créneau${total > 1 ? "x" : ""} · ${prises}/${places} place${places > 1 ? "s" : ""}${taux !== null ? ` · ${taux} %` : ""}`}
        </p>
      </div>

      {echelle === "jour" && <VueJour jour={periode[0]} />}
      {echelle === "semaine" && <VueSemaine jours={periode} />}
      {echelle === "mois" && (
        <VueMois jours={periode} onJour={(cle) => { setAncre(cle); setEchelle("jour"); }} />
      )}
      {echelle === "annee" && (
        <VueAnnee
          jours={periode}
          onMois={(cle) => { setAncre(`${cle}-01`); setEchelle("mois"); }}
        />
      )}

      <p className="mt-4 text-xs text-zinc-500">
        Heures affichées dans le fuseau de votre commerce ({timeZone}).
      </p>
    </Card>
  );
}

// ────────────────────────────────────────────────────────────
// Jour — le service, à l'heure près
// ────────────────────────────────────────────────────────────

function VueJour({ jour }: { jour: JourAgenda | undefined }) {
  if (!jour || jour.creneaux.length === 0) {
    return (
      <p className="rounded-xl border-2 border-dashed border-zinc-300 px-4 py-8 text-center text-sm text-zinc-500">
        Rien de prévu ce jour-là.
      </p>
    );
  }

  return (
    <ul className="space-y-2">
      {jour.creneaux.map((creneau) => {
        const complet = creneau.occupees >= creneau.capacity;
        return (
          <li
            key={creneau.id}
            className={`flex flex-wrap items-center gap-3 rounded-xl border-2 px-3 py-2.5 ${
              creneau.status !== "open"
                ? "border-zinc-200 bg-zinc-50"
                : complet
                  ? "border-k-green bg-k-green/10"
                  : "border-k-ink/20 bg-white"
            }`}
          >
            <span className="w-16 shrink-0 font-mono text-sm font-black tabular-nums text-k-ink">
              {creneau.heure}
            </span>
            <span className="flex-1 text-sm font-bold text-k-ink">
              {creneau.occupees} / {creneau.capacity} place
              {creneau.capacity > 1 ? "s" : ""}
            </span>
            <span className="text-xs font-bold text-zinc-500">
              {creneau.status === "draft"
                ? "Brouillon"
                : creneau.status === "closed"
                  ? "Fermé"
                  : complet
                    ? "Complet"
                    : "Ouvert"}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

// ────────────────────────────────────────────────────────────
// Semaine — sept colonnes, la vue de travail
// ────────────────────────────────────────────────────────────

function VueSemaine({ jours }: { jours: JourAgenda[] }) {
  return (
    <div className="overflow-x-auto">
      <div className="grid min-w-[44rem] grid-cols-7 gap-2">
        {jours.map((jour) => (
          <div
            key={jour.cle}
            className="rounded-xl border-2 border-k-ink/15 bg-white p-2"
          >
            <p className="mb-2 text-center text-xs font-black text-k-ink">
              {JOURS_COURTS[jour.jourSemaine]}{" "}
              <span className="font-normal text-zinc-500">
                {Number(jour.cle.slice(8))}
              </span>
            </p>
            {jour.creneaux.length === 0 ? (
              <p className="py-2 text-center text-[11px] text-zinc-400">—</p>
            ) : (
              <ul className="space-y-1">
                {jour.creneaux.map((creneau) => (
                  <li
                    key={creneau.id}
                    className={`rounded-lg border px-1.5 py-1 text-[11px] font-bold ${
                      CLASSES_DENSITE[densite(creneau.capacity, creneau.occupees)]
                    }`}
                    title={`${creneau.heure} · ${creneau.occupees}/${creneau.capacity}`}
                  >
                    <span className="font-mono tabular-nums">{creneau.heure}</span>{" "}
                    <span className="tabular-nums">
                      {creneau.occupees}/{creneau.capacity}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// Mois — une grille de cases, on y cherche les trous
// ────────────────────────────────────────────────────────────

function VueMois({
  jours,
  onJour,
}: {
  jours: JourAgenda[];
  onJour: (cle: string) => void;
}) {
  // Les cases vides AVANT le 1er : sans elles, le 1er ne tomberait pas sous son
  // jour de semaine et toute la grille serait décalée.
  const avant = jours.length > 0 ? jours[0].jourSemaine : 0;

  return (
    <div>
      <div className="mb-1 grid grid-cols-7 gap-1.5">
        {JOURS_COURTS.map((jour) => (
          <p key={jour} className="text-center text-[11px] font-black text-zinc-500">
            {jour}
          </p>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1.5">
        {Array.from({ length: avant }, (_, i) => (
          <div key={`vide-${i}`} aria-hidden />
        ))}
        {jours.map((jour) => {
          const taux = remplissage(jour.capacite, jour.occupees);
          return (
            <button
              key={jour.cle}
              type="button"
              onClick={() => onJour(jour.cle)}
              className={`min-h-[3.5rem] rounded-lg border-2 p-1.5 text-left transition-colors hover:border-k-ink ${
                CLASSES_DENSITE[densite(jour.capacite, jour.occupees)]
              }`}
              aria-label={`${Number(jour.cle.slice(8))} — ${jour.creneaux.length} créneau${jour.creneaux.length > 1 ? "x" : ""}`}
            >
              <span className="block text-xs font-black tabular-nums">
                {Number(jour.cle.slice(8))}
              </span>
              {jour.creneaux.length > 0 && (
                <span className="mt-0.5 block text-[10px] font-bold tabular-nums">
                  {jour.occupees}/{jour.capacite}
                  {taux !== null && ` · ${taux}%`}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// Année — douze lignes, on y voit la saison
// ────────────────────────────────────────────────────────────

function VueAnnee({
  jours,
  onMois,
}: {
  jours: JourAgenda[];
  onMois: (cle: string) => void;
}) {
  const mois = useMemo(() => grouperParMois(jours), [jours]);
  const maxCreneaux = Math.max(1, ...mois.map((m) => m.creneaux));

  return (
    <ul className="space-y-1.5">
      {mois.map((ligne) => {
        const taux = remplissage(ligne.capacite, ligne.occupees);
        return (
          <li key={ligne.cle}>
            <button
              type="button"
              onClick={() => onMois(ligne.cle)}
              className="flex w-full items-center gap-3 rounded-xl border-2 border-k-ink/15 bg-white px-3 py-2 text-left transition-colors hover:border-k-ink"
            >
              <span className="w-24 shrink-0 text-sm font-black capitalize text-k-ink">
                {libelleMois(ligne.mois)}
              </span>
              {/* Une barre PROPORTIONNELLE au mois le plus chargé : la
                  comparaison entre mois est la seule chose qu'on lit ici. */}
              <span className="h-3 flex-1 overflow-hidden rounded-full bg-k-stripe">
                <span
                  className="block h-full rounded-full bg-k-yellow"
                  style={{ width: `${(ligne.creneaux / maxCreneaux) * 100}%` }}
                />
              </span>
              <span className="w-32 shrink-0 text-right text-xs font-bold tabular-nums text-zinc-600">
                {ligne.creneaux === 0
                  ? "—"
                  : `${ligne.creneaux} créneaux${taux !== null ? ` · ${taux}%` : ""}`}
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
