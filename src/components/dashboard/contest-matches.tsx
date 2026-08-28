"use client";

import { useState } from "react";
import {
  addContestMatches,
  addMatch,
  deleteMatch,
  importContestRound,
  importContestSeason,
  previewContestRound,
  setMatchResult,
  syncContest,
  type AddMatchesResult,
  type CalendarPreview,
} from "@/actions/pronostics";
import type { Competition } from "@/lib/competitions";
import { useActionForm } from "@/lib/use-action-form";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { FieldError, Input, Label } from "@/components/ui/input";
import { ParticipantBadge } from "@/components/dashboard/contest-status";
import type { ContestMatch } from "@/types/database";

function formatKickoff(value: string, timeZone: string): string {
  return new Intl.DateTimeFormat("fr-FR", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone,
  }).format(new Date(value));
}

const selectClass =
  "w-full rounded-xl border-2 border-k-ink bg-white px-3.5 py-2.5 text-sm text-k-ink focus:outline-none focus:ring-2 focus:ring-k-yellow focus:ring-offset-1";

/** « a.p. » / « t.a.b. 4–2 » après le score d'un match à élimination directe. */
function finishSuffix(match: ContestMatch): string {
  if (match.status !== "finished") return "";
  if (match.finish_type === "extra_time") return " a.p.";
  if (match.finish_type === "penalties") {
    return match.home_penalties !== null && match.away_penalties !== null
      ? ` t.a.b. ${match.home_penalties}–${match.away_penalties}`
      : " t.a.b.";
  }
  return "";
}

/**
 * Formulaire d'ajout : deux participants pris dans le catalogue de la
 * compétition (ou saisis librement pour « Autre / Match isolé ») + date
 * du coup d'envoi. Le serveur convertit l'heure civile du commerce en UTC.
 *
 * useActionForm et non useActionState : l'état de chargement doit retomber
 * même quand le rendu ne rejoue pas la revalidation — docs/bugs.md.
 */
export function AddMatchForm({
  contestId,
  competition,
  timeZone,
}: {
  contestId: string;
  competition: Competition;
  timeZone: string;
}) {
  // Pas de resetOnSuccess : `kickoffLocal` est un état contrôlé que
  // form.reset() ne viderait qu'à moitié (champ visuel vidé, state conservé).
  const { state, pending, onSubmit } = useActionForm(addMatch, {
    // `reloadOnSuccess` : signature mécanique « insère une ligne dans une liste
    // rendue par le serveur, sans rendre aucun succès » — la seule famille où
    // l'échec du rafraîchissement fait recommencer le geste, donc crée un
    // doublon. Vérifiée par `use-action-form-coverage.test.ts`.
    reloadOnSuccess: true,
    networkError: "Ajout impossible, réessayez.",
  });
  const [kickoffLocal, setKickoffLocal] = useState("");
  const hasCatalogue = competition.entries.length > 0;

  return (
    <form onSubmit={onSubmit} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <input type="hidden" name="contest_id" value={contestId} />
      <input type="hidden" name="kickoff_at" value={kickoffLocal} />

      {hasCatalogue ? (
        <>
          <ParticipantSelect competition={competition} side="home" label="Domicile" />
          <ParticipantSelect competition={competition} side="away" label="Extérieur" />
        </>
      ) : (
        <>
          <div>
            <Label htmlFor="match-home">Participant 1</Label>
            <Input id="match-home" name="home_name" required maxLength={60} placeholder="Ex : Équipe du patron" />
          </div>
          <div>
            <Label htmlFor="match-away">Participant 2</Label>
            <Input id="match-away" name="away_name" required maxLength={60} placeholder="Ex : Équipe des habitués" />
          </div>
        </>
      )}

      <div>
        <Label htmlFor="match-kickoff">Coup d&apos;envoi</Label>
        <Input
          id="match-kickoff"
          type="datetime-local"
          required
          onChange={(e) => setKickoffLocal(e.target.value)}
        />
        <p className="mt-1 text-xs text-zinc-500">
          Heure de l&apos;établissement ({timeZone}).
        </p>
      </div>
      <div className="flex items-end">
        <Button type="submit" disabled={pending} className="w-full">
          {pending ? "Ajout…" : "+ Ajouter le match"}
        </Button>
      </div>
      <FieldError message={state && !state.ok ? state.error : undefined} />
    </form>
  );
}

function ParticipantSelect({
  competition,
  side,
  label,
}: {
  competition: Competition;
  side: "home" | "away";
  label: string;
}) {
  // key ET name partent au serveur : le nom sert de repli custom, la clé
  // fait autorité (vignette résolue côté serveur depuis le catalogue).
  const [key, setKey] = useState(competition.entries[0]?.key ?? "");
  const entry = competition.entries.find((e) => e.key === key);
  return (
    <div>
      <Label htmlFor={`match-${side}`}>{label}</Label>
      <select
        id={`match-${side}`}
        name={`${side}_key`}
        value={key}
        onChange={(e) => setKey(e.target.value)}
        className={selectClass}
      >
        {competition.entries.map((e) => (
          <option key={e.key} value={e.key}>
            {e.flag ? `${e.flag} ` : ""}{e.name}
          </option>
        ))}
      </select>
      <input type="hidden" name={`${side}_name`} value={entry?.name ?? ""} />
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// Saisie rapide : plusieurs matchs en une seule soumission
// ────────────────────────────────────────────────────────────

/** Limite serveur (addMatchesSchema) : 30 lignes par saisie. */
const QUICK_MAX_ROWS = 30;

interface QuickRow {
  /** Clé React stable (les index bougent à la suppression d'une ligne). */
  uid: number;
  homeKey: string;
  awayKey: string;
  homeName: string;
  awayName: string;
  /** Heure civile brute du champ datetime-local (fuseau de l'établissement). */
  kickoff: string;
}

/** Compteur de clés React des lignes (module : jamais lu au rendu). */
let quickRowUid = 1;

/**
 * Saisie rapide : tableau de lignes (domicile, extérieur, coup d'envoi)
 * soumis en un seul lot atomique à addContestMatches. Une nouvelle ligne
 * duplique la date de la précédente (plusieurs matchs d'une même
 * journée se saisissent en quelques secondes). Les erreurs renvoyées
 * par le serveur sont réaffichées ligne à ligne.
 */
export function QuickAddMatchesForm({
  contestId,
  competition,
  timeZone,
}: {
  contestId: string;
  competition: Competition;
  timeZone: string;
}) {
  const hasCatalogue = competition.entries.length > 0;
  const makeRow = (previous: QuickRow | null): QuickRow => ({
    uid: quickRowUid++,
    homeKey: competition.entries[0]?.key ?? "",
    awayKey: competition.entries[1]?.key ?? competition.entries[0]?.key ?? "",
    homeName: "",
    awayName: "",
    // Réutilise la date de la ligne précédente : l'essentiel des saisies
    // groupées concerne une même journée de matchs.
    kickoff: previous?.kickoff ?? "",
  });
  const [rows, setRows] = useState<QuickRow[]>(() => [makeRow(null)]);

  const {
    state: rawState,
    pending,
    onSubmit,
  } = useActionForm(addContestMatches, {
    // Tout est passé : la grille repart vide pour la saisie suivante.
    onSuccess: () => setRows([makeRow(null)]),
    networkError: "Ajout impossible, réessayez.",
  });
  // Le state générique du hook (ActionResult) effacerait `rowErrors`, la
  // branche d'échec élargie d'AddMatchesResult : on retype localement — à
  // l'exécution, ce state EST la valeur rendue par addContestMatches.
  const state = rawState as AddMatchesResult | null;

  // Erreurs de ligne (index 0-based) renvoyées par le serveur, indexées
  // pour surligner les lignes fautives de la soumission courante.
  const rowErrors = new Map<number, string>();
  if (state && !state.ok) {
    for (const e of state.rowErrors ?? []) rowErrors.set(e.index, e.message);
  }

  const entryName = (key: string) =>
    competition.entries.find((e) => e.key === key)?.name ?? "";

  // Sérialisation au format attendu par le serveur : clés du catalogue
  // (vignettes résolues côté serveur) ou noms libres, heures civiles.
  const serialized = JSON.stringify(
    rows.map((r) => ({
      home_key: hasCatalogue ? r.homeKey : "",
      away_key: hasCatalogue ? r.awayKey : "",
      home_name: hasCatalogue ? entryName(r.homeKey) : r.homeName.trim(),
      away_name: hasCatalogue ? entryName(r.awayKey) : r.awayName.trim(),
      kickoff_at: r.kickoff,
    })),
  );

  const updateRow = (uid: number, patch: Partial<QuickRow>) => {
    setRows((current) =>
      current.map((r) => (r.uid === uid ? { ...r, ...patch } : r)),
    );
  };

  const participantField = (
    row: QuickRow,
    index: number,
    side: "home" | "away",
  ) => {
    const label = `${side === "home" ? "Domicile" : "Extérieur"} — ligne ${index + 1}`;
    if (hasCatalogue) {
      return (
        <select
          value={side === "home" ? row.homeKey : row.awayKey}
          onChange={(e) =>
            updateRow(row.uid, {
              [side === "home" ? "homeKey" : "awayKey"]: e.target.value,
            })
          }
          aria-label={label}
          className={selectClass}
        >
          {competition.entries.map((e) => (
            <option key={e.key} value={e.key}>
              {e.flag ? `${e.flag} ` : ""}{e.name}
            </option>
          ))}
        </select>
      );
    }
    return (
      <Input
        value={side === "home" ? row.homeName : row.awayName}
        onChange={(e) =>
          updateRow(row.uid, {
            [side === "home" ? "homeName" : "awayName"]: e.target.value,
          })
        }
        required
        maxLength={60}
        aria-label={label}
        placeholder={side === "home" ? "Participant 1" : "Participant 2"}
      />
    );
  };

  return (
    <form onSubmit={onSubmit}>
      <input type="hidden" name="contest_id" value={contestId} />
      <input type="hidden" name="matches" value={serialized} />

      <ol className="space-y-2.5">
        {rows.map((row, index) => {
          const error = rowErrors.get(index);
          const errorId = error ? `quick-row-error-${row.uid}` : undefined;
          return (
            <li
              key={row.uid}
              aria-describedby={errorId}
              className={
                error
                  ? "rounded-xl border-2 border-red-500 bg-red-50/50 p-3"
                  : "rounded-xl border-2 border-k-ink/15 bg-white p-3"
              }
            >
              <div className="grid gap-2 sm:grid-cols-[auto_1fr_1fr_auto_auto] sm:items-center">
                <span className="text-xs font-black tabular-nums text-zinc-600 sm:w-6 sm:text-center">
                  {index + 1}
                </span>
                {participantField(row, index, "home")}
                {participantField(row, index, "away")}
                <Input
                  type="datetime-local"
                  value={row.kickoff}
                  onChange={(e) => updateRow(row.uid, { kickoff: e.target.value })}
                  required
                  aria-label={`Coup d'envoi — ligne ${index + 1}`}
                  className="sm:w-52"
                />
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() =>
                    setRows((current) =>
                      current.length > 1
                        ? current.filter((r) => r.uid !== row.uid)
                        : current,
                    )
                  }
                  disabled={rows.length === 1}
                  aria-label={`Supprimer la ligne ${index + 1}`}
                >
                  ✕
                </Button>
              </div>
              {error && (
                <p id={errorId} className="mt-2 text-sm font-semibold text-red-600">
                  {error}
                </p>
              )}
            </li>
          );
        })}
      </ol>
      <p className="mt-2 text-xs text-zinc-500">
        Coups d&apos;envoi dans le fuseau de l&apos;établissement ({timeZone}).
      </p>

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <Button
          type="button"
          variant="secondary"
          onClick={() => setRows((current) => [...current, makeRow(current[current.length - 1] ?? null)])}
          disabled={rows.length >= QUICK_MAX_ROWS}
        >
          + Ajouter une ligne
        </Button>
        <Button type="submit" disabled={pending}>
          {pending
            ? "Ajout…"
            : `Ajouter ${rows.length > 1 ? `les ${rows.length} matchs` : "le match"}`}
        </Button>
        <span className="text-xs text-zinc-600">
          {rows.length}/{QUICK_MAX_ROWS} ligne{rows.length > 1 ? "s" : ""}
        </span>
      </div>

      {state?.ok && (
        <p role="status" className="mt-3 text-sm font-semibold text-k-green">
          {state.data.inserted} match{state.data.inserted > 1 ? "s" : ""} ajouté
          {state.data.inserted > 1 ? "s" : ""} ✓
        </p>
      )}
      <FieldError message={state && !state.ok ? state.error : undefined} />
    </form>
  );
}

/** Bouton de synchronisation à la demande (championnats auto). */
function SyncContestButton({ contestId }: { contestId: string }) {
  const { state, pending, onSubmit } = useActionForm(syncContest, {
    networkError: "Synchronisation impossible, réessayez.",
  });

  return (
    <form onSubmit={onSubmit} className="flex flex-wrap items-center gap-3">
      <input type="hidden" name="id" value={contestId} />
      <Button type="submit" variant="secondary" disabled={pending}>
        {pending ? "Synchronisation…" : "⟳ Synchroniser maintenant"}
      </Button>
      {state?.ok && (
        <span className="text-sm font-semibold text-k-green">
          {state.data.imported} match{state.data.imported > 1 ? "s" : ""} importé
          {state.data.imported > 1 ? "s" : ""} ·{" "}
          {state.data.resultsApplied} résultat
          {state.data.resultsApplied > 1 ? "s" : ""} mis à jour
        </span>
      )}
      <FieldError message={state && !state.ok ? state.error : undefined} />
    </form>
  );
}

/**
 * LE CALENDRIER COMPLET — parcourir la saison, journée par journée.
 *
 * ── CE QUE ÇA RÉPARE ──
 *
 * La synchronisation ne sert que les journées PROCHES. Tout le reste de la
 * saison n'était atteignable par aucun chemin : un commerçant qui voulait
 * ouvrir son jeu sur la journée du mois prochain n'avait qu'à attendre. Et
 * comme le fournisseur ne rendait plus qu'UN match (voir l'en-tête de
 * `src/lib/fixtures.ts`), sa grille restait à une ligne sans qu'il sache
 * pourquoi.
 *
 * ── CONSULTER N'EST PAS IMPORTER ──
 *
 * Deux gestes, deux actions, et l'ordre compte : on regarde une journée
 * (aucune écriture), puis on décide de l'importer. Un écran qui importerait
 * en affichant remplirait la grille de quelqu'un qui ne faisait que
 * chercher — et la grille de pronostics est ce que ses clients devront
 * remplir un à un.
 *
 * ── LA BORNE VIENT DU CATALOGUE, ET PARFOIS ELLE N'EXISTE PAS ──
 *
 * `competition.journees` vaut 34 en Ligue 1, 5 au Tournoi, et RIEN pour les
 * coupes — leurs tours ne se numérotent pas en continu. Sans borne, le champ
 * reste libre plutôt que d'afficher une liste de journées inventées.
 */
/**
 * IMPORTER TOUTE LA SAISON RESTANTE — un geste de début de saison.
 *
 * Le calendrier d'un championnat est publié d'un bloc en août. Le commerçant
 * qui veut que ses clients pronostiquent l'année entière n'a aucune raison
 * de revenir trente-quatre fois.
 *
 * CONFIRMATION EXIGÉE : le geste peut ajouter trois cents matchs à la grille,
 * et rien ne les retire en masse. Un `confirm` n'est pas une politesse ici,
 * c'est la seule barrière avant un écran de saisie très long.
 *
 * Il n'apparaît QUE pour une compétition dont le catalogue connaît le nombre
 * de journées — voir `competition.journees`.
 */
function ImporterSaison({ contestId }: { contestId: string }) {
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);

  // `pending` manuel, comme partout dans ce fichier : il doit retomber même
  // quand le rendu ne rejoue pas la revalidation (docs/bugs.md).
  const lancer = () => {
    if (
      !confirm(
        "Importer toutes les journées restantes de la saison ? Cela peut ajouter plusieurs centaines de matchs à votre grille.",
      )
    ) {
      return;
    }
    setPending(true);
    setErreur(null);
    setMessage(null);
    void (async () => {
      try {
        const res = await importContestSeason({ id: contestId });
        if (!res.ok) {
          setErreur(res.error);
          return;
        }
        setMessage(
          `${res.data.imported} match${res.data.imported > 1 ? "s" : ""} importé${res.data.imported > 1 ? "s" : ""} sur ${res.data.journees} journée${res.data.journees > 1 ? "s" : ""}.`,
        );
        // La grille est rendue par le serveur : sans rechargement, le
        // commerçant lit « 280 matchs importés » au-dessus d'une liste
        // inchangée, et relance.
        window.location.reload();
      } catch {
        setErreur("Import impossible, réessayez.");
      } finally {
        setPending(false);
      }
    })();
  };

  return (
    <div className="mt-2">
      <button
        type="button"
        onClick={lancer}
        disabled={pending}
        className="text-sm font-bold text-k-ink underline underline-offset-2 disabled:opacity-50"
      >
        {pending ? "Import de la saison…" : "⏬ Importer toute la saison"}
      </button>
      <p className="mt-1 text-xs text-zinc-500">
        Vos clients pourront pronostiquer l&apos;année entière d&apos;un seul
        coup. Les journées déjà jouées ne sont jamais importées.
      </p>
      {message && (
        <p className="mt-1 text-sm font-semibold text-k-green">{message}</p>
      )}
      <FieldError message={erreur ?? undefined} />
    </div>
  );
}

function CalendrierComplet({
  contestId,
  competition,
  timeZone,
}: {
  contestId: string;
  competition: Competition;
  timeZone: string;
}) {
  const [ouvert, setOuvert] = useState(false);
  const [journee, setJournee] = useState(1);
  const [apercu, setApercu] = useState<CalendarPreview | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [chargement, setChargement] = useState(false);
  const [importEnCours, setImportEnCours] = useState(false);
  const [importe, setImporte] = useState<string | null>(null);

  // `pending` manuel et non `useTransition` : l'état doit retomber même quand
  // le rendu ne rejoue pas la revalidation — docs/bugs.md, comme partout
  // ailleurs dans ce fichier.
  const consulter = (round: number) => {
    setChargement(true);
    setErreur(null);
    setImporte(null);
    void (async () => {
      try {
        const res = await previewContestRound({ id: contestId, round });
        if (res.ok) setApercu(res.data);
        else {
          setApercu(null);
          setErreur(res.error);
        }
      } catch {
        setErreur("Consultation impossible, réessayez.");
      } finally {
        setChargement(false);
      }
    })();
  };

  const importer = () => {
    if (!apercu) return;
    setImportEnCours(true);
    setErreur(null);
    void (async () => {
      try {
        const res = await importContestRound({
          id: contestId,
          round: apercu.round,
        });
        if (!res.ok) {
          setErreur(res.error);
          return;
        }
        setImporte(
          res.data.imported > 0
            ? `${res.data.imported} match${res.data.imported > 1 ? "s" : ""} ajouté${res.data.imported > 1 ? "s" : ""} à votre grille.`
            : "Rien à ajouter : cette journée est déjà dans votre grille.",
        );
        // La grille est rendue par le SERVEUR : sans rechargement, le
        // commerçant lit « 9 matchs ajoutés » au-dessus d'une liste qui n'en
        // montre aucun — et réimporte. Même raison que `reloadOnSuccess`
        // ailleurs dans le tableau de bord (voir `use-action-form.ts`).
        //
        // Rien après cette ligne : reconsulter la journée serait du travail
        // jeté, la page part.
        window.location.reload();
      } catch {
        setErreur("Import impossible, réessayez.");
      } finally {
        setImportEnCours(false);
      }
    })();
  };

  if (!ouvert) {
    return (
      <div className="mt-3">
        <button
          type="button"
          onClick={() => {
            setOuvert(true);
            consulter(journee);
          }}
          className="text-sm font-bold text-k-ink underline underline-offset-2"
        >
          📅 Voir le calendrier complet
        </button>
        {competition.journees && <ImporterSaison contestId={contestId} />}
        <p className="mt-1 text-xs text-zinc-500">
          La synchronisation apporte les journées proches. Ici, vous choisissez
          n&apos;importe quelle journée de la saison.
        </p>
      </div>
    );
  }

  return (
    <section aria-label="Calendrier complet" className="mt-4 rounded-2xl border-2 border-k-ink/20 bg-white p-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <Label htmlFor="calendrier-journee">Journée</Label>
          <div className="flex items-center gap-2">
            {competition.journees ? (
              <select
                id="calendrier-journee"
                value={journee}
                onChange={(e) => {
                  const n = Number(e.target.value);
                  setJournee(n);
                  consulter(n);
                }}
                className="rounded-xl border-2 border-k-ink bg-white px-3 py-2 text-sm font-bold text-k-ink"
              >
                {Array.from({ length: competition.journees }, (_, i) => i + 1).map(
                  (n) => (
                    <option key={n} value={n}>
                      Journée {n}
                    </option>
                  ),
                )}
              </select>
            ) : (
              <>
                <Input
                  id="calendrier-journee"
                  type="number"
                  min={1}
                  max={99}
                  value={journee}
                  onChange={(e) => setJournee(Number(e.target.value))}
                  className="w-24"
                />
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => consulter(journee)}
                  disabled={chargement}
                >
                  {chargement ? "…" : "Voir"}
                </Button>
              </>
            )}
          </div>
        </div>
        <button
          type="button"
          onClick={() => setOuvert(false)}
          className="text-xs font-bold text-zinc-600 underline underline-offset-2"
        >
          Masquer
        </button>
      </div>

      {chargement && (
        <p className="mt-3 text-sm text-zinc-500">Lecture du calendrier…</p>
      )}

      {!chargement && apercu && (
        <>
          {apercu.matches.length === 0 ? (
            <p className="mt-3 text-sm text-zinc-500">
              Le fournisseur n&apos;annonce aucun match pour cette journée. Les
              coupes ne numérotent pas toujours leurs tours de 1 à N.
            </p>
          ) : (
            <>
              <ul className="mt-3 space-y-1.5">
                {apercu.matches.map((m) => (
                  <li
                    key={m.ref}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-xl border-2 border-k-ink/10 px-3 py-2 text-sm"
                  >
                    <span className="font-bold text-k-ink">
                      {m.homeName} – {m.awayName}
                    </span>
                    <span className="flex items-center gap-2 text-xs text-zinc-500">
                      {formatKickoff(m.kickoffAt, timeZone)}
                      {m.imported && (
                        <span className="font-bold text-k-green">✓ dans votre grille</span>
                      )}
                      {!m.imported && m.past && (
                        <span className="font-bold text-k-muted">déjà joué</span>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
              <div className="mt-3 flex flex-wrap items-center gap-3">
                <Button
                  type="button"
                  onClick={importer}
                  disabled={importEnCours || apercu.importable === 0}
                >
                  {importEnCours
                    ? "Import…"
                    : apercu.importable === 0
                      ? "Rien à importer"
                      : `Importer ${apercu.importable} match${apercu.importable > 1 ? "s" : ""}`}
                </Button>
                {importe && (
                  <span className="text-sm font-semibold text-k-green">{importe}</span>
                )}
              </div>
              {apercu.importable === 0 && apercu.matches.some((m) => m.past) && (
                <p className="mt-2 text-xs text-zinc-500">
                  Un match déjà joué n&apos;est jamais importé : personne
                  n&apos;aurait pu le pronostiquer.
                </p>
              )}
            </>
          )}
        </>
      )}

      <FieldError message={erreur ?? undefined} />
    </section>
  );
}

function MatchRow({
  match,
  scoreLabel,
  timeZone,
  auto,
}: {
  match: ContestMatch;
  scoreLabel: string;
  timeZone: string;
  /** Championnat synchronisé : matchs et résultats gérés automatiquement. */
  auto: boolean;
}) {
  const {
    state: resultState,
    pending: resultPending,
    onSubmit: resultSubmit,
  } = useActionForm(setMatchResult, {
    networkError: "Enregistrement impossible, réessayez.",
    // `reloadOnSuccess` : publier un résultat verrouille les pronostics de ce
    // match et recalcule le CLASSEMENT PUBLIC pour tous les joueurs. L'écran
    // du commerçant, lui, ne bouge que par `match.status` — prop serveur — et
    // ne rend que l'erreur. Muet en succès, il ressaisit : au pire une autre
    // valeur, parce qu'il doute de ce qu'il avait tapé, et publie une
    // correction de classement non voulue sur une surface consultée en direct.
    reloadOnSuccess: true,
  });
  const {
    state: deleteState,
    pending: deletePending,
    onSubmit: deleteSubmit,
  } = useActionForm(deleteMatch, {
    networkError: "Suppression impossible, réessayez.",
  });
  const [editing, setEditing] = useState(false);
  const finished = match.status === "finished";

  return (
    <li className="rounded-xl border-2 border-k-ink/15 bg-white p-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <ParticipantBadge badge={match.home_badge} color={match.home_color} />
          <span className="truncate text-sm font-bold text-k-ink">
            {match.home_name}
          </span>
          <span className="shrink-0 rounded-lg bg-zinc-100 px-2 py-1 text-sm font-black tabular-nums">
            {finished
              ? `${match.home_score} – ${match.away_score}${finishSuffix(match)}`
              : "vs"}
          </span>
          <span className="truncate text-sm font-bold text-k-ink">
            {match.away_name}
          </span>
          <ParticipantBadge badge={match.away_badge} color={match.away_color} />
        </div>
        <span className="text-xs text-zinc-500">
          {formatKickoff(match.kickoff_at, timeZone)}
        </span>
        {auto ? (
          // Matchs et résultats viennent du calendrier synchronisé : aucune
          // action manuelle (la synchro écraserait toute modification).
          !finished && (
            <span className="rounded-full bg-zinc-100 px-2.5 py-0.5 text-xs font-semibold text-zinc-500">
              résultat auto
            </span>
          )
        ) : (
          <>
            {finished && !editing ? (
              <Button type="button" variant="ghost" onClick={() => setEditing(true)}>
                Corriger
              </Button>
            ) : null}
            {!finished || editing ? (
              <form onSubmit={resultSubmit} className="flex items-center gap-1.5">
                <input type="hidden" name="id" value={match.id} />
                <Input
                  name="home_score"
                  type="number"
                  min={0}
                  max={99}
                  required
                  defaultValue={match.home_score ?? undefined}
                  className="w-14 text-center"
                  aria-label={`${scoreLabel} de ${match.home_name}`}
                />
                <span aria-hidden className="text-sm text-zinc-400">–</span>
                <Input
                  name="away_score"
                  type="number"
                  min={0}
                  max={99}
                  required
                  defaultValue={match.away_score ?? undefined}
                  className="w-14 text-center"
                  aria-label={`${scoreLabel} de ${match.away_name}`}
                />
                <Button type="submit" variant="secondary" disabled={resultPending}>
                  {resultPending ? "…" : finished ? "Corriger" : "Résultat"}
                </Button>
              </form>
            ) : null}
            <form
              onSubmit={(event) => {
                // Confirmer d'abord ; le hook n'est saisi que sur oui.
                if (!confirm("Supprimer ce match et tous les pronostics associés ?")) {
                  event.preventDefault();
                  return;
                }
                deleteSubmit(event);
              }}
            >
              <input type="hidden" name="id" value={match.id} />
              <Button
                type="submit"
                variant="ghost"
                disabled={deletePending}
                aria-label={`Supprimer ${match.home_name} – ${match.away_name}`}
              >
                ✕
              </Button>
            </form>
          </>
        )}
      </div>
      <FieldError
        message={
          (resultState && !resultState.ok ? resultState.error : undefined) ??
          (deleteState && !deleteState.ok ? deleteState.error : undefined)
        }
      />
    </li>
  );
}

export function ContestMatchList({
  matches,
  contestId,
  competition,
  timeZone,
}: {
  matches: ContestMatch[];
  contestId: string;
  competition: Competition;
  timeZone: string;
}) {
  const auto = Boolean(competition.providerLeagueId);
  // Mode de saisie (compétitions manuelles uniquement) : match par match
  // ou saisie rapide de plusieurs lignes d'un coup.
  const [quickMode, setQuickMode] = useState(false);

  return (
    <Card>
      <h2 className="font-semibold mb-1">Matchs</h2>
      {auto ? (
        <>
          <p className="text-sm text-zinc-500 mb-4">
            Calendrier et résultats importés automatiquement depuis le
            calendrier synchronisé — les points sont attribués dès la fin de
            chaque match, sans rien saisir. Mise à jour chaque nuit, ou à
            la demande :
          </p>
          <SyncContestButton contestId={contestId} />
          <CalendrierComplet
            contestId={contestId}
            competition={competition}
            timeZone={timeZone}
          />
        </>
      ) : (
        <>
          <p className="text-sm text-zinc-500 mb-4">
            Les pronostics ferment automatiquement au coup d&apos;envoi.
            Saisissez le résultat après le match : les points sont attribués
            aussitôt.
          </p>
          <div
            role="group"
            aria-label="Mode de saisie des matchs"
            className="mb-4 inline-flex rounded-xl border-2 border-k-ink/15 p-0.5"
          >
            {([
              [false, "Match par match"],
              [true, "Saisie rapide"],
            ] as const).map(([mode, label]) => (
              <button
                key={label}
                type="button"
                onClick={() => setQuickMode(mode)}
                aria-pressed={quickMode === mode}
                className={
                  quickMode === mode
                    ? "rounded-lg bg-k-ink px-3 py-1.5 text-xs font-bold text-white"
                    : "rounded-lg px-3 py-1.5 text-xs font-bold text-zinc-600 hover:text-k-ink"
                }
              >
                {label}
              </button>
            ))}
          </div>
          {quickMode ? (
            <QuickAddMatchesForm
              contestId={contestId}
              competition={competition}
              timeZone={timeZone}
            />
          ) : (
            <AddMatchForm
              contestId={contestId}
              competition={competition}
              timeZone={timeZone}
            />
          )}
        </>
      )}
      {matches.length > 0 ? (
        <ul className="mt-5 space-y-2.5">
          {matches.map((m) => (
            <MatchRow
              key={m.id}
              match={m}
              scoreLabel={competition.scoreLabel}
              timeZone={timeZone}
              auto={auto}
            />
          ))}
        </ul>
      ) : (
        <p className="mt-5 text-sm text-zinc-500">
          {auto
            ? "Aucun match annoncé pour l'instant — le calendrier se remplira automatiquement dès que les prochaines rencontres seront connues."
            : "Aucun match pour l'instant — ajoutez le premier ci-dessus."}
        </p>
      )}
    </Card>
  );
}
