"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { submitPredictions } from "@/actions/pronostics";
import { Badge, formatKickoff, scoreInputValue } from "./contest-experience";
import type { ContestMatch } from "@/types/database";

/**
 * LA GRILLE — plusieurs matchs, UN bouton.
 *
 * ── CE QUE ÇA REMPLACE ──
 *
 * Chaque match ouvert portait sa propre carte et son propre bouton
 * « Valider ». Pronostiquer une journée de Ligue 1, c'était neuf boutons, neuf
 * allers-retours, et neuf occasions d'en oublier un — sur un téléphone, debout
 * dans un commerce. Le joueur pose maintenant toute sa grille, puis valide une
 * fois.
 *
 * ── CE QUI RESTE VRAI, ET QU'IL NE FAUT PAS PERDRE ──
 *
 * · Le serveur reste l'AUTORITÉ sur chaque ligne. Un match qui démarre pendant
 *   que le joueur remplit sa grille est refusé — et lui seul : les autres sont
 *   enregistrés, et la carte nomme celui qui ne l'a pas été. Tout rejeter aurait
 *   fait perdre la grille entière au moment où il n'y a plus le temps de la
 *   refaire.
 * · Un match SANS les deux scores n'est pas envoyé. Une grille à moitié remplie
 *   est un état légitime : le joueur revient demain finir. Envoyer un 0-0
 *   implicite à sa place serait pronostiquer pour lui.
 * · Le pronostic déjà posé est PRÉ-REMPLI et reste modifiable jusqu'au coup
 *   d'envoi ; revalider écrase, ce que la RPC fait déjà.
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

export interface GrilleMatch {
  match: ContestMatch;
  /** Pronostic déjà enregistré, s'il existe. */
  prediction: { home_score: number | null; away_score: number | null } | null;
}

export function GrillePronostics({
  slug,
  entrees,
  scoreLabel,
  timeZone,
}: {
  slug: string;
  /** Matchs OUVERTS uniquement — le tri et le filtrage sont faits au serveur. */
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

  const lire = (id: string): Saisie => saisies[id] ?? { home: "", away: "" };

  /** Les lignes COMPLÈTES : deux scores saisis, et eux seuls partent. */
  const pretes = useMemo(
    () =>
      entrees
        .map(({ match }) => ({ id: match.id, ...lire(match.id) }))
        .filter((l) => l.home !== "" && l.away !== ""),
    // `saisies` est la seule dépendance réelle ; `entrees` vient du serveur et
    // ne change qu'au rafraîchissement, qui remonte le composant.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [saisies, entrees],
  );

  const changer = (id: string, cote: "home" | "away", valeur: string) => {
    setSaisies((prec) => ({ ...prec, [id]: { ...lire(id), [cote]: valeur } }));
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
        setRefus(
          Object.fromEntries(
            res.data.refused.map((r) => [r.matchId, r.error]),
          ),
        );
        // Le classement, la progression et la liste des matchs sont rendus par
        // le serveur : sans ce rafraîchissement, le joueur lit « 9 pronostics
        // enregistrés » au-dessus d'une grille inchangée.
        router.refresh();
      } catch {
        setErreur("Enregistrement impossible, réessayez.");
      } finally {
        setPending(false);
      }
    })();
  };

  if (entrees.length === 0) return null;

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

      <ul className="space-y-2.5">
        {entrees.map(({ match, prediction }) => {
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
                <p
                  role="alert"
                  className="mt-2 text-xs font-bold text-red-700"
                >
                  {refuse}
                </p>
              )}
            </li>
          );
        })}
      </ul>

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
