"use client";

import { useMemo, useState } from "react";

import { Card } from "@/components/ui/card";
import {
  JOURS_COURTS,
  cleJour,
  decaler,
  fenetre,
  heureLocale,
  joursDeLaFenetre,
  libelleFenetre,
  partsDansFuseau,
} from "@/lib/agenda-vues";
import {
  dureeService,
  minutesDepuisHeure,
  occupeLaTable,
  vueService,
  type ReservationSalle,
  type ServiceTable,
  type TableSalle,
  type VueService,
} from "@/lib/plan-de-salle";

/**
 * LE PLAN DE SALLE — le service en un coup d'œil (RDV-7).
 *
 * ── POURQUOI LE PLAN N'EXISTE QU'EN VUE JOUR ──
 *
 * Un plan de salle est une grille tables × heures. Sur sept jours elle en
 * ferait sept côte à côte, sur un mois trente : illisible sur n'importe quel
 * écran, et surtout inutile — à l'échelle de la semaine on ne cherche pas QUI
 * est à la table 4 à 20 h, on cherche QUELS SOIRS sont pleins. Semaine et mois
 * rendent donc une grille de journées, et un clic sur une journée bascule en
 * plan de salle. C'est le même arbitrage que `agenda-vues.tsx`, pour la même
 * raison.
 *
 * ── LES ORPHELINES SONT MONTRÉES, JAMAIS TUES ──
 *
 * Une réservation vivante sans table — un Moment converti, une donnée abîmée,
 * une table supprimée — n'apparaît sur aucune ligne du plan. La laisser tomber
 * la ferait disparaître de l'écran du service : un client qu'on n'attend pas,
 * qui se présente quand même. `vueService` la range dans `orphelines`, et cet
 * encart la rend visible.
 *
 * ── LE FUSEAU EST CELUI DU COMMERCE ──
 *
 * `startsAt` est un instant absolu ; « 20 h » est un rendu. La conversion passe
 * par `agenda-vues`, qui sait le faire correctement, et est INJECTÉE dans
 * `plan-de-salle` — module pur, sans `Intl`, testable sans fuseau réel.
 */

type VuePlan = "jour" | "semaine" | "mois";

const VUES: ReadonlyArray<{ cle: VuePlan; label: string }> = [
  { cle: "jour", label: "Jour" },
  { cle: "semaine", label: "Semaine" },
  { cle: "mois", label: "Mois" },
];

/** La grille du plan démarre et finit à l'heure ronde — sinon rien ne s'aligne. */
const PAS_GRILLE = 60;

interface JourneeSalle {
  couverts: number;
  reservations: number;
}

export function PlanSalleVue({
  tables,
  reservations,
  timeZone,
  /** Journée d'ancrage, `YYYY-MM-DD` — calculée au serveur, jamais ici. */
  aujourdHui,
  dureeServiceMinutes,
}: {
  tables: TableSalle[];
  reservations: ReservationSalle[];
  timeZone: string;
  aujourdHui: string;
  dureeServiceMinutes: number;
}) {
  const [vue, setVue] = useState<VuePlan>("jour");
  const [ancre, setAncre] = useState(aujourdHui);

  // La conversion est mémoïsée par FUSEAU et non par réservation :
  // `Intl.DateTimeFormat` est l'appel coûteux ici, et une salle chargée en
  // demande une par réservation et par rendu.
  const minutesDe = useMemo(() => {
    return (iso: string): number | null => {
      const parts = partsDansFuseau(iso, timeZone);
      return parts ? minutesDepuisHeure(heureLocale(parts)) : null;
    };
  }, [timeZone]);

  const datees = useMemo(
    () =>
      reservations.map((reservation) => {
        const parts = partsDansFuseau(reservation.startsAt, timeZone);
        return { reservation, cle: parts ? cleJour(parts) : null };
      }),
    [reservations, timeZone],
  );

  const duJour = useMemo(
    () =>
      datees.filter((ligne) => ligne.cle === ancre).map((ligne) => ligne.reservation),
    [datees, ancre],
  );

  const service = useMemo(
    () => vueService(tables, duJour, minutesDe),
    [tables, duJour, minutesDe],
  );

  /**
   * Les couverts par journée, agrégés ICI et non par `grouperParJour`.
   *
   * Ce dernier compte des CRÉNEAUX — capacité, places prises, statut d'ouverture
   * — qu'une réservation ne porte pas. Ce qu'on veut par journée est autre
   * chose : des couverts servis et des lignes. Seul le squelette de dates est
   * repris à `agenda-vues`, où il est déjà correct.
   */
  const journees = useMemo(() => {
    const parJour = new Map<string, JourneeSalle>();
    for (const { reservation, cle } of datees) {
      if (!cle || !occupeLaTable(reservation.statut)) continue;
      const ligne = parJour.get(cle) ?? { couverts: 0, reservations: 0 };
      ligne.couverts += reservation.effectif;
      ligne.reservations += 1;
      parJour.set(cle, ligne);
    }
    return parJour;
  }, [datees]);

  const bornes = useMemo(() => fenetre(vue, ancre), [vue, ancre]);
  const periode = useMemo(
    // Le squelette de journées vient d'`agenda-vues` — fenêtres, jours de
    // semaine et bornes y sont déjà justes. La Map vide n'est là que parce que
    // les agrégats de CETTE vue ne sont pas ceux d'un agenda de créneaux.
    () => joursDeLaFenetre(bornes, new Map()),
    [bornes],
  );

  return (
    <Card className="mt-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-semibold">Votre salle, service par service</h2>
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Échelle">
          {VUES.map((choix) => (
            <button
              key={choix.cle}
              type="button"
              onClick={() => setVue(choix.cle)}
              aria-pressed={vue === choix.cle}
              className={`rounded-xl border-2 px-3 py-1.5 text-xs font-black text-k-ink transition-colors ${
                vue === choix.cle
                  ? "border-k-ink bg-k-yellow/40 shadow-[3px_3px_0_var(--color-k-ink)]"
                  : "border-k-ink/20 bg-white hover:border-k-ink/50"
              }`}
            >
              {choix.label}
            </button>
          ))}
        </div>
      </div>

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setAncre(decaler(vue, ancre, -1))}
            aria-label="Période précédente"
            className="rounded-xl border-2 border-k-ink/25 bg-white px-3 py-1.5 text-sm font-black text-k-ink hover:border-k-ink"
          >
            ←
          </button>
          <span className="min-w-[12rem] text-center text-sm font-black text-k-ink">
            {libelleFenetre(vue, ancre)}
          </span>
          <button
            type="button"
            onClick={() => setAncre(decaler(vue, ancre, 1))}
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

        {vue === "jour" && (
          <p className="text-xs text-zinc-500">
            {service.reservationsVivantes === 0
              ? "Personne d'attendu ce jour-là."
              : `${service.reservationsVivantes} réservation${service.reservationsVivantes > 1 ? "s" : ""} · ${service.couvertsServis} couvert${service.couvertsServis > 1 ? "s" : ""} sur ${service.couvertsOfferts} en salle`}
          </p>
        )}
      </div>

      {vue === "jour" ? (
        <PlanDuJour service={service} dureeServiceMinutes={dureeServiceMinutes} />
      ) : (
        <GrilleJournees
          jours={periode}
          journees={journees}
          couvertsOfferts={service.couvertsOfferts}
          compact={vue === "mois"}
          onJour={(cle) => {
            setAncre(cle);
            setVue("jour");
          }}
        />
      )}

      {service.orphelines.length > 0 && vue === "jour" && (
        <Orphelines
          reservations={service.orphelines}
          timeZone={timeZone}
        />
      )}

      <p className="mt-4 text-xs text-zinc-500">
        Une table reste prise {dureeService(dureeServiceMinutes)}. Heures
        affichées dans le fuseau de votre commerce ({timeZone}).
      </p>
    </Card>
  );
}

// ────────────────────────────────────────────────────────────
// Jour — le plan de salle : les tables en lignes, l'heure en abscisse
// ────────────────────────────────────────────────────────────

function PlanDuJour({
  service,
  dureeServiceMinutes,
}: {
  service: VueService;
  dureeServiceMinutes: number;
}) {
  if (service.tables.length === 0) {
    return (
      <p className="rounded-xl border-2 border-dashed border-zinc-300 px-4 py-8 text-center text-sm text-zinc-500">
        Aucune table décrite : ajoutez-en dans <strong>Vos tables</strong>
        &nbsp;— sans salle, il n&apos;y a rien à placer.
      </p>
    );
  }

  const debuts = service.tables.flatMap((ligne) =>
    ligne.reservations.map((reservation) => reservation.debutMinutes),
  );

  if (debuts.length === 0) {
    return (
      <p className="rounded-xl border-2 border-dashed border-zinc-300 px-4 py-8 text-center text-sm text-zinc-500">
        Aucune table prise ce jour-là. Vos {service.couvertsOfferts} couverts
        sont libres.
      </p>
    );
  }

  // LA FENÊTRE SUIT LE SERVICE, elle ne va pas de minuit à minuit : afficher
  // vingt-quatre heures pour un service de deux heures écraserait toutes les
  // barres sur un dixième de la largeur. On borde à l'heure ronde de part et
  // d'autre pour que les repères tombent juste.
  const debut = Math.floor(Math.min(...debuts) / PAS_GRILLE) * PAS_GRILLE;
  const fin =
    Math.ceil((Math.max(...debuts) + dureeServiceMinutes) / PAS_GRILLE) * PAS_GRILLE;
  const amplitude = Math.max(PAS_GRILLE, fin - debut);
  const reperes = Array.from(
    { length: Math.floor(amplitude / PAS_GRILLE) + 1 },
    (_, i) => debut + i * PAS_GRILLE,
  );

  return (
    <div className="overflow-x-auto">
      <div className="min-w-[40rem]">
        <div className="mb-1 flex">
          <span className="w-36 shrink-0" aria-hidden />
          <div className="relative h-4 flex-1">
            {reperes.map((repere) => (
              <span
                key={repere}
                className="absolute -translate-x-1/2 text-[11px] font-bold tabular-nums text-zinc-500"
                style={{ left: `${((repere - debut) / amplitude) * 100}%` }}
              >
                {libelleMinutes(repere)}
              </span>
            ))}
          </div>
        </div>

        <ul className="space-y-1.5">
          {service.tables.map((ligne) => (
            <LigneDeTable
              key={ligne.table.id}
              ligne={ligne}
              debut={debut}
              amplitude={amplitude}
              dureeServiceMinutes={dureeServiceMinutes}
            />
          ))}
        </ul>
      </div>
    </div>
  );
}

function LigneDeTable({
  ligne,
  debut,
  amplitude,
  dureeServiceMinutes,
}: {
  ligne: ServiceTable;
  debut: number;
  amplitude: number;
  dureeServiceMinutes: number;
}) {
  return (
    <li className={`flex items-stretch ${ligne.table.active ? "" : "opacity-55"}`}>
      <div className="w-36 shrink-0 pr-2">
        <p className="truncate text-sm font-black text-k-ink">{ligne.table.nom}</p>
        <p className="text-[11px] text-zinc-500">
          {ligne.table.couverts} couvert{ligne.table.couverts > 1 ? "s" : ""}
          {ligne.table.active ? "" : " · désactivée"}
        </p>
      </div>

      <div className="relative min-h-[2.75rem] flex-1 rounded-lg border-2 border-k-ink/10 bg-k-stripe">
        {ligne.reservations.map((reservation) => {
          const arrivee = reservation.statut === "checked_in";
          return (
            <span
              key={reservation.id}
              className={`absolute inset-y-0 flex flex-col justify-center overflow-hidden rounded-lg border-2 px-1.5 text-[11px] leading-tight ${
                // L'ARRIVÉE se distingue de l'attendu : c'est la seule
                // information que le service relit toutes les dix minutes.
                arrivee
                  ? "border-k-green bg-k-green/40 text-k-ink"
                  : "border-k-ink bg-k-yellow/70 text-k-ink"
              }`}
              style={{
                left: `${((reservation.debutMinutes - debut) / amplitude) * 100}%`,
                width: `${(dureeServiceMinutes / amplitude) * 100}%`,
              }}
              title={`${libelleMinutes(reservation.debutMinutes)} · ${reservation.effectif} couvert${reservation.effectif > 1 ? "s" : ""} · ${reservation.code}${arrivee ? " · arrivé" : ""}`}
            >
              <span className="truncate font-black tabular-nums">
                {libelleMinutes(reservation.debutMinutes)} ·{" "}
                {reservation.effectif}p
              </span>
              <span className="truncate">
                {reservation.prenom ? `${reservation.prenom} · ` : ""}
                {reservation.code}
                {arrivee ? " ✓" : ""}
              </span>
            </span>
          );
        })}
      </div>
    </li>
  );
}

// ────────────────────────────────────────────────────────────
// Semaine et mois — quels soirs sont pleins, jamais qui est où
// ────────────────────────────────────────────────────────────

function GrilleJournees({
  jours,
  journees,
  couvertsOfferts,
  compact,
  onJour,
}: {
  jours: Array<{ cle: string; jourSemaine: number }>;
  journees: Map<string, JourneeSalle>;
  couvertsOfferts: number;
  compact: boolean;
  onJour: (cle: string) => void;
}) {
  // Les cases vides AVANT le premier jour du mois : sans elles, le 1er ne
  // tomberait pas sous son jour de semaine et toute la grille serait décalée.
  const avant = compact && jours.length > 0 ? jours[0].jourSemaine : 0;

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
          const journee = journees.get(jour.cle);
          const couverts = journee?.couverts ?? 0;
          const taux =
            couvertsOfferts > 0
              ? Math.min(100, Math.round((couverts / couvertsOfferts) * 100))
              : 0;
          return (
            <button
              key={jour.cle}
              type="button"
              onClick={() => onJour(jour.cle)}
              className={`rounded-lg border-2 p-1.5 text-left transition-colors hover:border-k-ink ${
                compact ? "min-h-[4rem]" : "min-h-[6rem]"
              } ${
                couverts > 0
                  ? "border-k-ink/40 bg-white"
                  : "border-k-ink/10 bg-white text-zinc-400"
              }`}
              aria-label={`${Number(jour.cle.slice(8))} — ${couverts} couvert${couverts > 1 ? "s" : ""}`}
            >
              <span className="block text-xs font-black tabular-nums text-k-ink">
                {Number(jour.cle.slice(8))}
              </span>
              {couverts > 0 ? (
                <>
                  <span className="mt-0.5 block text-[11px] font-bold tabular-nums text-k-ink">
                    {couverts} couvert{couverts > 1 ? "s" : ""}
                  </span>
                  <span className="block text-[10px] tabular-nums text-zinc-500">
                    {journee?.reservations} résa
                    {(journee?.reservations ?? 0) > 1 ? "s" : ""}
                  </span>
                  {/* La barre compare la journée à ce que la SALLE peut servir
                      en un service : c'est le seul repère que le commerçant
                      possède, et il se lit sans chiffre. */}
                  <span className="mt-1 block h-1.5 overflow-hidden rounded-full bg-k-stripe">
                    <span
                      className="block h-full rounded-full bg-k-yellow"
                      style={{ width: `${taux}%` }}
                    />
                  </span>
                </>
              ) : (
                <span className="mt-0.5 block text-[10px]">—</span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// Sans table attribuée — ce qu'on refuse de perdre de vue
// ────────────────────────────────────────────────────────────

function Orphelines({
  reservations,
  timeZone,
}: {
  reservations: ReservationSalle[];
  timeZone: string;
}) {
  return (
    <div className="mt-4 rounded-xl border-2 border-amber-500 bg-amber-50 px-3 py-2.5">
      <p className="text-sm font-black text-k-ink">
        Sans table attribuée · {reservations.length}
      </p>
      <p className="mt-1 text-xs text-zinc-600">
        Ces clients sont attendus mais n&apos;occupent aucune ligne du plan :
        table supprimée, ou réservation prise avant que vous ne décriviez votre
        salle. Placez-les à la main à leur arrivée.
      </p>
      <ul className="mt-2 space-y-1">
        {reservations.map((reservation) => {
          const parts = partsDansFuseau(reservation.startsAt, timeZone);
          return (
            <li
              key={reservation.id}
              className="flex flex-wrap items-baseline gap-2 text-sm text-k-ink"
            >
              <span className="font-mono font-black tabular-nums">
                {parts ? heureLocale(parts) : "—"}
              </span>
              <span className="font-bold">
                {reservation.effectif} couvert{reservation.effectif > 1 ? "s" : ""}
              </span>
              {reservation.prenom ? <span>{reservation.prenom}</span> : null}
              <span className="text-zinc-500">{reservation.code}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** « 20:30 » à partir de minutes depuis minuit — le repère de la grille. */
function libelleMinutes(minutes: number): string {
  const h = Math.floor(minutes / 60) % 24;
  const m = minutes % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}
