"use client";

import { useActionState, useState } from "react";
import {
  addContestMatches,
  addMatch,
  deleteMatch,
  setMatchResult,
  syncContest,
  type AddMatchesResult,
} from "@/actions/pronostics";
import type { Competition } from "@/lib/competitions";
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
 * du coup d'envoi. La date locale du navigateur est convertie en ISO —
 * le commerçant saisit dans son fuseau, le serveur stocke de l'UTC.
 */
export function AddMatchForm({
  contestId,
  competition,
}: {
  contestId: string;
  competition: Competition;
}) {
  const [state, formAction, pending] = useActionState(addMatch, null);
  const [kickoffIso, setKickoffIso] = useState("");
  const hasCatalogue = competition.entries.length > 0;

  return (
    <form action={formAction} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <input type="hidden" name="contest_id" value={contestId} />
      <input type="hidden" name="kickoff_at" value={kickoffIso} />

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
          onChange={(e) => {
            const v = e.target.value;
            setKickoffIso(v ? new Date(v).toISOString() : "");
          }}
        />
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
  /** Valeur brute du champ datetime-local (fuseau du navigateur). */
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
}: {
  contestId: string;
  competition: Competition;
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

  const [state, formAction, pending] = useActionState(
    async (prev: AddMatchesResult | null, formData: FormData) => {
      const result = await addContestMatches(prev, formData);
      // Tout est passé : la grille repart vide pour la saisie suivante.
      if (result.ok) setRows([makeRow(null)]);
      return result;
    },
    null,
  );

  // Erreurs de ligne (index 0-based) renvoyées par le serveur, indexées
  // pour surligner les lignes fautives de la soumission courante.
  const rowErrors = new Map<number, string>();
  if (state && !state.ok) {
    for (const e of state.rowErrors ?? []) rowErrors.set(e.index, e.message);
  }

  const entryName = (key: string) =>
    competition.entries.find((e) => e.key === key)?.name ?? "";

  // Sérialisation au format attendu par le serveur : clés du catalogue
  // (vignettes résolues côté serveur) ou noms libres, dates en ISO/UTC.
  const serialized = JSON.stringify(
    rows.map((r) => ({
      home_key: hasCatalogue ? r.homeKey : "",
      away_key: hasCatalogue ? r.awayKey : "",
      home_name: hasCatalogue ? entryName(r.homeKey) : r.homeName.trim(),
      away_name: hasCatalogue ? entryName(r.awayKey) : r.awayName.trim(),
      kickoff_at: r.kickoff ? new Date(r.kickoff).toISOString() : "",
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
    <form action={formAction}>
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
                <span className="text-xs font-black tabular-nums text-zinc-400 sm:w-6 sm:text-center">
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
        <span className="text-xs text-zinc-400">
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
  const [state, formAction, pending] = useActionState(syncContest, null);

  return (
    <form action={formAction} className="flex flex-wrap items-center gap-3">
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
  const [resultState, resultAction, resultPending] = useActionState(
    setMatchResult,
    null,
  );
  const [deleteState, deleteAction, deletePending] = useActionState(
    deleteMatch,
    null,
  );
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
              <form action={resultAction} className="flex items-center gap-1.5">
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
                <span className="text-sm text-zinc-400">–</span>
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
              action={deleteAction}
              onSubmit={(event) => {
                if (!confirm("Supprimer ce match et tous les pronostics associés ?")) {
                  event.preventDefault();
                }
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
                    : "rounded-lg px-3 py-1.5 text-xs font-bold text-zinc-500 hover:text-k-ink"
                }
              >
                {label}
              </button>
            ))}
          </div>
          {quickMode ? (
            <QuickAddMatchesForm contestId={contestId} competition={competition} />
          ) : (
            <AddMatchForm contestId={contestId} competition={competition} />
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
