"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { submitPredictions } from "@/actions/pronostics";
import { grouperParJournee } from "@/lib/pronostics";
import { Badge, formatKickoff, scoreInputValue } from "./contest-experience";
import type { ContestMatch } from "@/types/database";

/**
 * LA GRILLE — la semaine d'abord, la saison à la demande.
 *
 * ── LE DÉFAUT QUE ÇA FERME (capture du 2026-08-28) ──
 *
 * Un commerçant qui importe sa saison pose 201 matchs d'un coup. La grille les
 * affichait tous, à la file : « 201 matchs ouverts », une liste interminable,
 * et le joueur n'avait aucun moyen de savoir par où commencer. Le geste réel
 * — « je pronostique le week-end qui vient » — était noyé sous huit mois de
 * calendrier.
 *
 * ── DEUX BLOCS, ET UN SEUL EST OUVERT ──
 *
 * 1. LES MATCHS DE LA SEMAINE, dépliés. C'est ce que le joueur vient faire, et
 *    c'est la même fenêtre de sept jours que le rappel hebdomadaire
 *    (`FENETRE_SEMAINE_MS`) : on ne le relance jamais sur des matchs que son
 *    écran ne lui montre pas en premier.
 *
 * 2. TOUTE LA SAISON, repliée, derrière un CHOIX DE JOURNÉE — le même geste
 *    que dans l'atelier du commerçant. Une journée à la fois, jamais 201
 *    matchs. Qui veut pronostiquer l'année entière le peut, journée par
 *    journée, sans que ce soit imposé aux autres.
 *
 * ── CE QUI RESTE VRAI, ET QU'IL NE FAUT PAS PERDRE ──
 *
 * · Le bouton valide TOUT ce qui est saisi, y compris dans une journée qu'on a
 *   quittée depuis. Changer de journée cache des lignes, ça n'annule rien.
 * · Le serveur reste l'AUTORITÉ sur chaque ligne : un match qui démarre pendant
 *   la saisie est refusé, et lui seul.
 * · Un match sans les deux scores n'est pas envoyé — une grille à moitié
 *   remplie est un état légitime.
 *
 * ── POURQUOI LE PARTAGE SEMAINE/SAISON VIENT DU SERVEUR ──
 *
 * Il dépend de l'heure, et lire l'horloge pendant un rendu est impur
 * (`react-hooks/purity`). La page le calcule et le passe ligne par ligne, comme
 * elle le fait déjà pour `attenteResultat`.
 */

/** Score saisi pour un match, tel qu'il vit dans l'état du composant. */
interface Saisie {
  home: string;
  away: string;
}

/** Pronostic déjà enregistré, tel que la page le passe. */
export interface GrillePrediction {
  home_score: number | null;
  away_score: number | null;
}

export interface GrilleMatch {
  match: ContestMatch;
  prediction: GrillePrediction | null;
  /** Coup d'envoi dans les sept prochains jours — calculé au SERVEUR. */
  dansLaSemaine: boolean;
}

export function GrillePronostics({
  slug,
  entrees,
  scoreLabel,
  timeZone,
}: {
  slug: string;
  /** Matchs OUVERTS uniquement — le filtrage est fait au serveur. */
  entrees: GrilleMatch[];
  scoreLabel: string;
  timeZone: string;
}) {
  const router = useRouter();
  const [saisies, setSaisies] = useState<Record<string, Saisie>>(() =>
    Object.fromEntries(
      entrees.map(({ match, prediction }) => [
        match.id,
        {
          home: scoreInputValue(prediction?.home_score),
          away: scoreInputValue(prediction?.away_score),
        },
      ]),
    ),
  );
  const [pending, setPending] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [refus, setRefus] = useState<Record<string, string>>({});
  const [enregistres, setEnregistres] = useState(0);

  const parId = useMemo(
    () => new Map(entrees.map((e) => [e.match.id, e])),
    [entrees],
  );

  // ── Le partage semaine / reste de la saison ──
  const semaine = useMemo(
    () =>
      entrees
        .filter((e) => e.dansLaSemaine)
        .sort((a, b) => a.match.kickoff_at.localeCompare(b.match.kickoff_at)),
    [entrees],
  );
  const journeesSaison = useMemo(
    () =>
      grouperParJournee(
        entrees.filter((e) => !e.dansLaSemaine).map((e) => e.match),
      ),
    [entrees],
  );

  // Le sélecteur s'ouvre sur la première journée à venir hors semaine.
  const [journeeChoisie, setJourneeChoisie] = useState<string>(() =>
    String(journeesSaison[0]?.round ?? ""),
  );
  const [saisonOuverte, setSaisonOuverte] = useState(false);
  const journeeActive =
    journeesSaison.find((j) => String(j.round ?? "") === journeeChoisie) ??
    journeesSaison[0] ??
    null;

  const lire = (id: string): Saisie => saisies[id] ?? { home: "", away: "" };

  /**
   * Les lignes COMPLÈTES, dans TOUTE la grille — semaine et saison, journée
   * affichée ou non. Quitter une journée cache des lignes, ça n'efface pas ce
   * qui y est saisi.
   */
  const pretes = useMemo(
    () =>
      entrees
        .map(({ match }) => ({
          id: match.id,
          ...(saisies[match.id] ?? { home: "", away: "" }),
        }))
        .filter((l) => l.home !== "" && l.away !== ""),
    [saisies, entrees],
  );

  const changer = (id: string, cote: "home" | "away", valeur: string) => {
    setSaisies((prec) => ({
      ...prec,
      [id]: { ...(prec[id] ?? { home: "", away: "" }), [cote]: valeur },
    }));
    // Un refus porte sur la valeur PRÉCÉDENTE : dès que le joueur retouche la
    // ligne, le message n'a plus d'objet et disparaît.
    setRefus((prec) => {
      if (!(id in prec)) return prec;
      const suite = { ...prec };
      delete suite[id];
      return suite;
    });
  };

  const valider = () => {
    if (pretes.length === 0) return;
    setPending(true);
    setErreur(null);
    setRefus({});
    void (async () => {
      try {
        const res = await submitPredictions({
          slug,
          predictions: pretes.map((l) => ({
            matchId: l.id,
            homeScore: Number(l.home),
            awayScore: Number(l.away),
          })),
        });
        if (!res.ok) {
          setErreur(res.error);
          return;
        }
        setEnregistres(res.data.saved);
        const refuses = Object.fromEntries(
          res.data.refused.map((r) => [r.matchId, r.error]),
        );
        setRefus(refuses);
        // Un refus dans une journée qu'on ne regarde pas serait invisible : on
        // l'ouvre. La semaine, elle, est toujours à l'écran.
        const journeeEnFaute = journeesSaison.find((j) =>
          j.matchs.some((m) => m.id in refuses),
        );
        if (journeeEnFaute) {
          setJourneeChoisie(String(journeeEnFaute.round ?? ""));
          setSaisonOuverte(true);
        }
        router.refresh();
      } catch {
        setErreur("Enregistrement impossible, réessayez.");
      } finally {
        setPending(false);
      }
    })();
  };

  if (entrees.length === 0) return null;

  const poses = (liste: ReadonlyArray<{ id: string }>) =>
    liste.filter((m) => parId.get(m.id)?.prediction != null).length;

  const ligne = ({ match, prediction }: GrilleMatch) => {
    const saisie = lire(match.id);
    const refuse = refus[match.id];
    const complete = saisie.home !== "" && saisie.away !== "";
    return (
      <li
        key={match.id}
        className={`rounded-xl border-2 p-3 ${
          refuse
            ? "border-red-500 bg-red-50"
            : complete
              ? "border-k-ink/25 bg-k-yellow/10"
              : "border-k-ink/15 bg-white"
        }`}
      >
        <p className="mb-2 text-xs text-k-body">
          {formatKickoff(match.kickoff_at, timeZone)}
          {prediction && !refuse && (
            <span className="ml-2 font-bold text-k-green">
              ✓ déjà pronostiqué
            </span>
          )}
        </p>
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
          <div className="flex min-w-0 items-center gap-2">
            <Badge badge={match.home_badge} color={match.home_color} />
            <span className="truncate text-sm font-black text-k-ink">
              {match.home_name}
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <input
              type="number"
              min={0}
              max={99}
              inputMode="numeric"
              value={saisie.home}
              onChange={(e) => changer(match.id, "home", e.target.value)}
              disabled={pending}
              aria-label={`${scoreLabel} de ${match.home_name}`}
              className="h-11 w-12 rounded-xl border-2 border-k-ink bg-white text-center text-lg font-black text-k-ink focus:outline-none focus:ring-2 focus:ring-k-yellow disabled:bg-zinc-100"
            />
            <span className="font-black text-k-body">–</span>
            <input
              type="number"
              min={0}
              max={99}
              inputMode="numeric"
              value={saisie.away}
              onChange={(e) => changer(match.id, "away", e.target.value)}
              disabled={pending}
              aria-label={`${scoreLabel} de ${match.away_name}`}
              className="h-11 w-12 rounded-xl border-2 border-k-ink bg-white text-center text-lg font-black text-k-ink focus:outline-none focus:ring-2 focus:ring-k-yellow disabled:bg-zinc-100"
            />
          </div>
          <div className="flex min-w-0 items-center justify-end gap-2">
            <span className="truncate text-right text-sm font-black text-k-ink">
              {match.away_name}
            </span>
            <Badge badge={match.away_badge} color={match.away_color} />
          </div>
        </div>
        {refuse && (
          <p role="alert" className="mt-2 text-xs font-bold text-red-700">
            {refuse}
          </p>
        )}
      </li>
    );
  };

  return (
    <section
      aria-labelledby="grille-titre"
      className="k-border rounded-2xl bg-white p-4 shadow-[4px_4px_0_var(--color-k-ink)]"
    >
      <h2 id="grille-titre" className="mb-3 text-lg font-black text-k-ink">
        À pronostiquer
      </h2>

      {/* ── 1. LA SEMAINE — ouverte, c'est le geste du jour ── */}
      {semaine.length > 0 && (
        <section aria-label="Matchs de la semaine" className="mb-4">
          <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2 rounded-xl border-2 border-k-ink bg-k-yellow/30 px-3 py-2">
            <span className="text-sm font-black text-k-ink">
              ⚡ Matchs de la semaine
            </span>
            <span className="text-xs font-bold text-k-body">
              {poses(semaine.map((e) => e.match))}/{semaine.length} posé
              {poses(semaine.map((e) => e.match)) > 1 ? "s" : ""}
            </span>
          </div>
          <ul className="space-y-2.5">{semaine.map(ligne)}</ul>
        </section>
      )}

      {/* ── 2. LE RESTE DE LA SAISON — replié, une journée à la fois ── */}
      {journeesSaison.length > 0 && (
        <section
          aria-label="Le reste de la saison"
          className="border-t-2 border-k-ink/10 pt-3"
        >
          {!saisonOuverte ? (
            <button
              type="button"
              onClick={() => setSaisonOuverte(true)}
              className="text-sm font-bold text-k-ink underline underline-offset-2"
            >
              📅 Pronostiquer d&apos;autres journées ({journeesSaison.length} à
              venir)
            </button>
          ) : (
            <>
              <div className="mb-2 flex flex-wrap items-end justify-between gap-2">
                <div>
                  <label
                    htmlFor="grille-journee"
                    className="mb-1 block text-xs font-bold text-k-body"
                  >
                    Journée
                  </label>
                  {/* MÊME GESTE QUE L'ATELIER : un choix de journée, pas une
                      liste de toutes. C'est ce qui empêche 201 matchs de
                      s'afficher d'un coup. */}
                  <select
                    id="grille-journee"
                    value={journeeChoisie}
                    onChange={(e) => setJourneeChoisie(e.target.value)}
                    className="rounded-xl border-2 border-k-ink bg-white px-3 py-2 text-sm font-bold text-k-ink"
                  >
                    {journeesSaison.map((j) => (
                      <option key={String(j.round)} value={String(j.round ?? "")}>
                        {j.libelle} ({poses(j.matchs)}/{j.matchs.length})
                      </option>
                    ))}
                  </select>
                </div>
                <button
                  type="button"
                  onClick={() => setSaisonOuverte(false)}
                  className="text-xs font-bold text-k-body underline underline-offset-2"
                >
                  Masquer
                </button>
              </div>
              {journeeActive && (
                <ul className="space-y-2.5">
                  {journeeActive.matchs.map((m) => {
                    const entree = parId.get(m.id);
                    return entree ? ligne(entree) : null;
                  })}
                </ul>
              )}
            </>
          )}
        </section>
      )}

      {/* ── LE BOUTON UNIQUE, sous la grille ── */}
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t-2 border-k-ink/10 pt-3">
        <p className="text-xs text-k-body">
          Modifiable jusqu&apos;au coup d&apos;envoi de chaque match.
        </p>
        <button
          type="button"
          onClick={valider}
          disabled={pending || pretes.length === 0}
          className="k-btn rounded-xl border-2 border-k-ink bg-k-yellow px-5 py-2.5 text-sm font-black text-k-ink disabled:pointer-events-none disabled:opacity-40"
        >
          {pending
            ? "Enregistrement…"
            : pretes.length === 0
              ? "Saisissez un score"
              : `Valider ${pretes.length} pronostic${pretes.length > 1 ? "s" : ""}`}
        </button>
      </div>

      {enregistres > 0 && Object.keys(refus).length === 0 && (
        <p
          role="status"
          className="mt-3 rounded-xl bg-k-green/15 px-3 py-2 text-sm font-bold text-k-green"
        >
          ✓ {enregistres} pronostic{enregistres > 1 ? "s" : ""} enregistré
          {enregistres > 1 ? "s" : ""}.
        </p>
      )}
      {Object.keys(refus).length > 0 && (
        <p
          role="status"
          className="mt-3 rounded-xl bg-amber-50 px-3 py-2 text-sm font-bold text-amber-800"
        >
          {enregistres > 0
            ? `${enregistres} pronostic${enregistres > 1 ? "s" : ""} enregistré${enregistres > 1 ? "s" : ""}. `
            : ""}
          {Object.keys(refus).length} match
          {Object.keys(refus).length > 1 ? "s" : ""} n&apos;a pas pu être pris —
          voir le détail ci-dessus.
        </p>
      )}
      {erreur && (
        <p role="alert" className="mt-3 text-sm font-semibold text-red-600">
          {erreur}
        </p>
      )}
    </section>
  );
}
