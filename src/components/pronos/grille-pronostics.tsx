"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { submitPredictions } from "@/actions/pronostics";
import { grouperParJournee } from "@/lib/pronostics";
import { Badge, formatKickoff, scoreInputValue } from "./contest-experience";
import type { ContestMatch } from "@/types/database";

/**
 * LA GRILLE — plusieurs matchs, groupés par JOURNÉE, un seul bouton.
 *
 * ── CE QUE ÇA REMPLACE ──
 *
 * Chaque match ouvert portait sa propre carte et son propre bouton
 * « Valider ». Pronostiquer une journée de Ligue 1, c'était neuf boutons, neuf
 * allers-retours, et neuf occasions d'en oublier un — sur un téléphone, debout
 * dans un commerce.
 *
 * Puis la grille, une fois d'un seul tenant, listait les matchs à la file :
 * on passait du dimanche 30 août au jeudi 3 septembre sans la moindre
 * séparation, alors que ce sont DEUX journées — l'unité dans laquelle un
 * calendrier de football se lit, se commente et se pronostique.
 *
 * ── UNE JOURNÉE DÉPLIÉE, LES AUTRES À PORTÉE ──
 *
 * Le calendrier d'un championnat est publié en début de saison : tout déplier
 * d'emblée noierait la journée du week-end sous trente-trois autres. La
 * PREMIÈRE journée à venir est donc ouverte, les suivantes repliées avec leur
 * compte de pronostics posés — et « Tout déplier » ouvre la saison entière,
 * pour qui veut remplir sa grille d'un coup en début de saison.
 *
 * ── CE QUI RESTE VRAI, ET QU'IL NE FAUT PAS PERDRE ──
 *
 * · Le serveur reste l'AUTORITÉ sur chaque ligne. Un match qui démarre pendant
 *   que le joueur remplit sa grille est refusé — et lui seul : les autres sont
 *   enregistrés, et la ligne nomme celui qui ne l'a pas été.
 * · Un match SANS les deux scores n'est pas envoyé. Une grille à moitié remplie
 *   est un état légitime : le joueur revient demain finir. Envoyer un 0-0
 *   implicite à sa place serait pronostiquer pour lui.
 * · Le bouton valide TOUT ce qui est rempli, journées repliées comprises — ce
 *   qui est saisi n'est jamais perdu parce qu'on a refermé un groupe.
 *
 * ── POURQUOI CE N'EST PAS UN `<form>` ──
 *
 * `useActionForm` lit un FormData ; ici l'état vit dans un dictionnaire indexé
 * par match, parce que le bouton doit savoir COMBIEN de lignes sont prêtes
 * avant qu'on clique dessus. Le `pending` manuel suit la règle du dépôt : il
 * retombe dans un `finally`, jamais par le rendu (docs/bugs.md).
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

  const journees = useMemo(
    () => grouperParJournee(entrees.map((e) => e.match)),
    [entrees],
  );
  const parId = useMemo(
    () => new Map(entrees.map((e) => [e.match.id, e])),
    [entrees],
  );

  // La première journée à venir est dépliée ; les autres attendent un clic.
  const premiere = journees[0]?.round ?? null;
  const [depliees, setDepliees] = useState<Set<number | null>>(
    () => new Set<number | null>([premiere]),
  );
  const toutDeplie = journees.length > 0 && depliees.size >= journees.length;

  const basculer = (round: number | null) =>
    setDepliees((prec) => {
      const suite = new Set(prec);
      if (suite.has(round)) suite.delete(round);
      else suite.add(round);
      return suite;
    });

  const toutBasculer = () =>
    setDepliees(
      toutDeplie
        ? new Set<number | null>([premiere])
        : new Set<number | null>(journees.map((j) => j.round)),
    );

  const lire = (id: string): Saisie => saisies[id] ?? { home: "", away: "" };

  /**
   * Les lignes COMPLÈTES, TOUTES journées confondues — repliées comprises.
   * Refermer un groupe cache des lignes, ça n'annule pas ce qui y est saisi.
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
        // Une journée qui contient un refus se rouvre : le message est sur la
        // ligne, et un message dans un groupe replié ne se lit pas.
        if (Object.keys(refuses).length > 0) {
          setDepliees((prec) => {
            const suite = new Set(prec);
            for (const j of journees) {
              if (j.matchs.some((m) => m.id in refuses)) suite.add(j.round);
            }
            return suite;
          });
        }
        // Le classement, la progression et la liste sont rendus par le serveur.
        router.refresh();
      } catch {
        setErreur("Enregistrement impossible, réessayez.");
      } finally {
        setPending(false);
      }
    })();
  };

  if (entrees.length === 0) return null;

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
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="grille-titre" className="text-lg font-black text-k-ink">
          À pronostiquer
        </h2>
        <span className="text-xs font-bold text-k-body">
          {entrees.length} match{entrees.length > 1 ? "s" : ""} ouvert
          {entrees.length > 1 ? "s" : ""}
        </span>
      </div>

      {journees.length > 1 && (
        <div className="mb-3">
          <button
            type="button"
            onClick={toutBasculer}
            className="text-sm font-bold text-k-ink underline underline-offset-2"
          >
            {toutDeplie
              ? "Ne montrer que la prochaine journée"
              : `Tout déplier — les ${journees.length} journées`}
          </button>
          <p className="mt-1 text-xs text-k-body">
            Le calendrier est publié en début de saison : remplissez tout
            d&apos;un coup, ou revenez chaque semaine.
          </p>
        </div>
      )}

      {journees.map((journee) => {
        const ouverte = depliees.has(journee.round);
        const poses = journee.matchs.filter(
          (m) => parId.get(m.id)?.prediction != null,
        ).length;
        return (
          <section key={String(journee.round)} className="mb-3">
            {/* L'en-tête est un BOUTON : replier une journée est le geste
                principal de cet écran dès qu'il y en a plus d'une. */}
            <button
              type="button"
              onClick={() => basculer(journee.round)}
              aria-expanded={ouverte}
              className="mb-2 flex w-full items-center justify-between gap-2 rounded-xl border-2 border-k-ink/15 bg-k-bg px-3 py-2 text-left"
            >
              <span className="text-sm font-black text-k-ink">
                {journee.libelle}
              </span>
              <span className="flex items-center gap-2 text-xs font-bold text-k-body">
                <span>
                  {poses}/{journee.matchs.length} posé{poses > 1 ? "s" : ""}
                </span>
                <span aria-hidden>{ouverte ? "▾" : "▸"}</span>
              </span>
            </button>
            {ouverte && (
              <ul className="space-y-2.5">
                {journee.matchs.map((m) => {
                  const entree = parId.get(m.id);
                  return entree ? ligne(entree) : null;
                })}
              </ul>
            )}
          </section>
        );
      })}

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
