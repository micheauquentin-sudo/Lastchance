"use client";

import { useActionState, useState } from "react";
import {
  deleteContest,
  finalizeContest,
  setContestAwardStatus,
  updateContest,
  updateContestRewards,
  updateContestScoring,
  updateContestTiebreaker,
} from "@/actions/pronostics";
import type { ContestReward, ContestScoring } from "@/lib/pronostics";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { FieldError, Input, Label } from "@/components/ui/input";
import type { Contest, ContestAward, ContestStatus } from "@/types/database";

const STATUS_ACTIONS: Array<{
  from: ContestStatus[];
  to: ContestStatus;
  label: string;
  /** La RPC exige un motif journalisé pour cette transition. */
  needsReason?: boolean;
}> = [
  { from: ["draft"], to: "active", label: "Ouvrir le championnat" },
  { from: ["active"], to: "finished", label: "Marquer terminé" },
  { from: ["finished"], to: "active", label: "Rouvrir", needsReason: true },
];

/** Bandeau commun : règlement verrouillé → toute correction est motivée. */
function LockedNotice({ finalized }: { finalized: boolean }) {
  if (finalized) {
    return (
      <p className="mb-3 rounded-lg bg-zinc-100 px-3 py-2 text-xs text-zinc-600">
        🔒 Championnat clôturé : règlement et classement sont définitifs.
      </p>
    );
  }
  return (
    <p className="mb-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
      🔒 Le jeu a commencé : toute modification exige un motif, journalisé et
      visible dans l&apos;audit.
    </p>
  );
}

/** Champ motif (min. 10 caractères — même règle que la base). */
function ReasonInput({ id }: { id: string }) {
  return (
    <div>
      <Label htmlFor={id}>Motif de la correction (journalisé)</Label>
      <Input
        id={id}
        name="reason"
        required
        minLength={10}
        maxLength={300}
        placeholder="Ex : erreur de saisie signalée par les joueurs"
      />
    </div>
  );
}

export function ContestSettings({
  contest,
  locked = false,
}: {
  contest: Contest;
  /** Premier pronostic déposé ou coup d'envoi passé : règlement gelé. */
  locked?: boolean;
}) {
  const [renameState, renameAction, renamePending] = useActionState(
    updateContest,
    null,
  );
  const [statusState, statusAction, statusPending] = useActionState(
    updateContest,
    null,
  );
  const [collectState, collectAction, collectPending] = useActionState(
    updateContest,
    null,
  );
  const [deleteState, deleteAction, deletePending] = useActionState(
    deleteContest,
    null,
  );
  const [confirmDelete, setConfirmDelete] = useState(false);

  const finalized = contest.finalized_at !== null;
  // Un championnat clôturé ne change plus de statut (la RPC le refuse
  // aussi — ceci évite juste de proposer un bouton voué à l'échec).
  const transitions = finalized
    ? []
    : STATUS_ACTIONS.filter((a) => a.from.includes(contest.status));

  return (
    <Card>
      <h2 className="font-semibold mb-4">Réglages</h2>

      <form action={renameAction} className="flex items-end gap-2">
        <input type="hidden" name="id" value={contest.id} />
        <div className="flex-1 max-w-xs">
          <Label htmlFor="contest-name">Nom du championnat</Label>
          <Input
            id="contest-name"
            name="name"
            defaultValue={contest.name}
            required
            maxLength={120}
          />
        </div>
        <Button type="submit" variant="secondary" disabled={renamePending}>
          {renamePending ? "…" : "Renommer"}
        </Button>
      </form>
      <FieldError
        message={renameState && !renameState.ok ? renameState.error : undefined}
      />

      <div className="mt-5 space-y-2">
        {finalized && (
          <p className="text-sm text-zinc-500">
            🔒 Championnat clôturé le{" "}
            {new Date(contest.finalized_at!).toLocaleDateString("fr-FR")} —
            statut définitif.
          </p>
        )}
        <div className="flex flex-wrap items-end gap-2">
          {transitions.map((t) => (
            <form key={t.to} action={statusAction} className="flex items-end gap-2">
              <input type="hidden" name="id" value={contest.id} />
              <input type="hidden" name="status" value={t.to} />
              {t.needsReason && (
                <div className="max-w-xs">
                  <ReasonInput id={`status-reason-${t.to}`} />
                </div>
              )}
              <Button
                type="submit"
                variant={t.to === "active" ? "primary" : "secondary"}
                disabled={statusPending}
              >
                {t.label}
              </Button>
            </form>
          ))}
        </div>
      </div>
      <FieldError
        message={statusState && !statusState.ok ? statusState.error : undefined}
      />

      <form action={collectAction} className="mt-5 border-t border-zinc-100 pt-4">
        <input type="hidden" name="id" value={contest.id} />
        <input type="hidden" name="collection_settings" value="1" />
        <p className="text-sm font-bold text-k-ink mb-2">
          Données demandées à l&apos;inscription
        </p>
        <div className="flex flex-wrap gap-x-6 gap-y-2">
          <label className="flex items-center gap-2 text-sm text-k-body">
            <input
              type="checkbox"
              name="collect_email"
              defaultChecked={contest.collect_email}
              className="h-4 w-4 accent-k-ink"
            />
            Email
          </label>
          <label className="flex items-center gap-2 text-sm text-k-body">
            <input
              type="checkbox"
              name="collect_phone"
              defaultChecked={contest.collect_phone}
              className="h-4 w-4 accent-k-ink"
            />
            Téléphone
          </label>
          <Button type="submit" variant="secondary" disabled={collectPending}>
            {collectPending ? "…" : "Enregistrer"}
          </Button>
        </div>
        <FieldError
          message={collectState && !collectState.ok ? collectState.error : undefined}
        />
      </form>

      <TiebreakerSection contest={contest} locked={locked} finalized={finalized} />

      <div className="mt-5 border-t border-zinc-100 pt-4">
        {confirmDelete ? (
          <form action={deleteAction} className="flex items-center gap-2">
            <input type="hidden" name="id" value={contest.id} />
            <span className="text-sm text-k-body">
              Supprimer ce championnat, ses matchs et tous les pronostics ?
            </span>
            <Button type="submit" variant="danger" disabled={deletePending}>
              {deletePending ? "Suppression…" : "Confirmer"}
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={() => setConfirmDelete(false)}
              disabled={deletePending}
            >
              Annuler
            </Button>
          </form>
        ) : (
          <Button
            type="button"
            variant="ghost"
            className="text-red-600 hover:bg-red-50"
            onClick={() => setConfirmDelete(true)}
          >
            Supprimer le championnat
          </Button>
        )}
        <FieldError
          message={deleteState && !deleteState.ok ? deleteState.error : undefined}
        />
      </div>
    </Card>
  );
}

/**
 * Question subsidiaire : départage les ex æquo (écart absolu à la
 * réponse officielle). La question se fige au premier pronostic ; la
 * réponse reste saisissable jusqu'à la clôture.
 */
function TiebreakerSection({
  contest,
  locked,
  finalized,
}: {
  contest: Contest;
  locked: boolean;
  finalized: boolean;
}) {
  const [state, formAction, pending] = useActionState(updateContestTiebreaker, null);
  const questionFrozen = locked || finalized;

  return (
    <form action={formAction} className="mt-5 border-t border-zinc-100 pt-4">
      <input type="hidden" name="id" value={contest.id} />
      <p className="text-sm font-bold text-k-ink mb-1">Question subsidiaire</p>
      <p className="text-xs text-zinc-500 mb-3">
        Départage les ex æquo : le joueur le plus proche de la réponse
        officielle passe devant. Posée à l&apos;inscription, figée dès le
        premier pronostic.
      </p>
      <div className="space-y-3">
        <div>
          <Label htmlFor="tiebreaker-question">Question (nombre attendu)</Label>
          <Input
            id="tiebreaker-question"
            name="question"
            defaultValue={contest.tiebreaker_question ?? ""}
            maxLength={160}
            placeholder="Ex : Combien de buts au total dans la compétition ?"
            disabled={questionFrozen}
          />
          {questionFrozen && !finalized && (
            <p className="mt-1 text-xs text-zinc-500">
              🔒 Figée — le jeu a commencé.
            </p>
          )}
          {/* La question figée doit repartir telle quelle avec la réponse. */}
          {questionFrozen && (
            <input
              type="hidden"
              name="question"
              value={contest.tiebreaker_question ?? ""}
            />
          )}
        </div>
        <div className="flex items-end gap-2">
          <div>
            <Label htmlFor="tiebreaker-answer">Réponse officielle</Label>
            <Input
              id="tiebreaker-answer"
              name="answer"
              type="number"
              min={0}
              max={1000000}
              defaultValue={contest.tiebreaker_answer ?? ""}
              placeholder="À saisir en fin de saison"
              className="w-40"
              disabled={finalized}
            />
          </div>
          {!finalized && (
            <Button type="submit" variant="secondary" disabled={pending}>
              {pending ? "…" : "Enregistrer"}
            </Button>
          )}
        </div>
      </div>
      <FieldError message={state && !state.ok ? state.error : undefined} />
    </form>
  );
}

export function ContestScoringForm({
  contestId,
  scoring,
  locked = false,
  finalized = false,
}: {
  contestId: string;
  scoring: ContestScoring;
  locked?: boolean;
  finalized?: boolean;
}) {
  const [state, formAction, pending] = useActionState(updateContestScoring, null);

  const fields: Array<{ name: "exact" | "diff" | "winner"; label: string; hint: string }> = [
    { name: "exact", label: "Score exact", hint: "Ex : prono 2-1, résultat 2-1" },
    { name: "diff", label: "Bonne différence", hint: "Ex : prono 2-1, résultat 3-2" },
    { name: "winner", label: "Bon vainqueur", hint: "Ex : prono 1-0, résultat 4-0" },
  ];

  return (
    <Card>
      <h2 className="font-semibold mb-1">Barème de points</h2>
      <p className="text-sm text-zinc-500 mb-4">
        Un pronostic rapporte le palier le plus haut atteint. Toute modification
        recalcule immédiatement les points des matchs déjà terminés.
      </p>
      {(locked || finalized) && <LockedNotice finalized={finalized} />}
      <form action={formAction} className="space-y-3">
        <input type="hidden" name="id" value={contestId} />
        {fields.map((f) => (
          <div key={f.name} className="flex items-center gap-3">
            <Input
              name={f.name}
              type="number"
              min={0}
              max={100}
              defaultValue={scoring[f.name]}
              required
              className="w-20 text-center"
              aria-label={f.label}
              disabled={finalized}
            />
            <div>
              <p className="text-sm font-bold text-k-ink">{f.label}</p>
              <p className="text-xs text-zinc-500">{f.hint}</p>
            </div>
          </div>
        ))}
        {locked && !finalized && <ReasonInput id="scoring-reason" />}
        {!finalized && (
          <Button type="submit" variant="secondary" disabled={pending}>
            {pending ? "…" : "Enregistrer le barème"}
          </Button>
        )}
        <FieldError message={state && !state.ok ? state.error : undefined} />
      </form>
    </Card>
  );
}

export function ContestRewardsEditor({
  contestId,
  rewards,
  locked = false,
  finalized = false,
}: {
  contestId: string;
  rewards: ContestReward[];
  locked?: boolean;
  finalized?: boolean;
}) {
  const [rows, setRows] = useState<ContestReward[]>(
    rewards.length > 0 ? rewards : [{ from: 1, to: 1, label: "" }],
  );
  const [state, formAction, pending] = useActionState(updateContestRewards, null);

  const update = (i: number, patch: Partial<ContestReward>) => {
    setRows((prev) => prev.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  };

  // Seuls les paliers avec libellé partent au serveur (lignes vides ignorées).
  const payload = JSON.stringify(rows.filter((r) => r.label.trim() !== ""));

  return (
    <Card>
      <h2 className="font-semibold mb-1">Récompenses</h2>
      <p className="text-sm text-zinc-500 mb-4">
        Ce que gagnent vos clients selon leur rang au classement final.
      </p>
      {(locked || finalized) && <LockedNotice finalized={finalized} />}
      <form action={formAction} className="space-y-3">
        <input type="hidden" name="id" value={contestId} />
        <input type="hidden" name="rewards" value={payload} />
        {rows.map((r, i) => (
          <div key={i} className="flex flex-wrap items-center gap-2">
            <span className="text-sm text-k-body">Du rang</span>
            <Input
              type="number"
              min={1}
              max={999}
              value={r.from}
              onChange={(e) => update(i, { from: Number(e.target.value) })}
              className="w-16 text-center"
              aria-label={`Rang de début du palier ${i + 1}`}
            />
            <span className="text-sm text-k-body">au</span>
            <Input
              type="number"
              min={1}
              max={999}
              value={r.to}
              onChange={(e) => update(i, { to: Number(e.target.value) })}
              className="w-16 text-center"
              aria-label={`Rang de fin du palier ${i + 1}`}
            />
            <Input
              value={r.label}
              onChange={(e) => update(i, { label: e.target.value })}
              maxLength={120}
              placeholder="Ex : Repas offert pour deux"
              className="flex-1 min-w-40"
              aria-label={`Récompense du palier ${i + 1}`}
            />
            <Button
              type="button"
              variant="ghost"
              onClick={() => setRows((prev) => prev.filter((_, j) => j !== i))}
              aria-label={`Supprimer le palier ${i + 1}`}
            >
              ✕
            </Button>
          </div>
        ))}
        {locked && !finalized && <ReasonInput id="rewards-reason" />}
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="secondary"
            disabled={rows.length >= 20 || finalized}
            onClick={() =>
              setRows((prev) => [
                ...prev,
                {
                  from: (prev[prev.length - 1]?.to ?? 0) + 1,
                  to: (prev[prev.length - 1]?.to ?? 0) + 1,
                  label: "",
                },
              ])
            }
          >
            + Ajouter un palier
          </Button>
          {!finalized && (
            <Button type="submit" disabled={pending}>
              {pending ? "…" : "Enregistrer les récompenses"}
            </Button>
          )}
        </div>
        <FieldError message={state && !state.ok ? state.error : undefined} />
      </form>
    </Card>
  );
}

// ────────────────────────────────────────────────────────────
// Clôture des récompenses + palmarès
// ────────────────────────────────────────────────────────────

/**
 * Clôture : photographie le classement (politique d'ex æquo complète,
 * tirage auditable en dernier recours) et attribue un lot par rang.
 * Action définitive, réservée au propriétaire.
 */
export function ContestFinalizeCard({
  contest,
}: {
  contest: Contest;
}) {
  const [state, formAction, pending] = useActionState(finalizeContest, null);
  const [confirm, setConfirm] = useState(false);

  return (
    <Card>
      <h2 className="font-semibold mb-1">Clôture des récompenses</h2>
      <p className="text-sm text-zinc-500 mb-4">
        Fige le classement final (ex æquo départagés : points, scores
        exacts, bons écarts, question subsidiaire, puis tirage auditable),
        attribue les lots et génère les codes de retrait.{" "}
        <strong>Action définitive</strong> — plus aucune modification ensuite.
      </p>
      <form action={formAction} className="space-y-3">
        <input type="hidden" name="id" value={contest.id} />
        {contest.tiebreaker_question && (
          <div>
            <Label htmlFor="finalize-answer">
              Réponse officielle — « {contest.tiebreaker_question} »
            </Label>
            <Input
              id="finalize-answer"
              name="tiebreaker_answer"
              type="number"
              min={0}
              max={1000000}
              defaultValue={contest.tiebreaker_answer ?? ""}
              className="w-40"
            />
          </div>
        )}
        {confirm ? (
          <div className="flex items-center gap-2">
            <span className="text-sm text-k-body">
              Clôturer définitivement et attribuer les lots ?
            </span>
            <Button type="submit" variant="danger" disabled={pending}>
              {pending ? "Clôture…" : "Confirmer la clôture"}
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={() => setConfirm(false)}
              disabled={pending}
            >
              Annuler
            </Button>
          </div>
        ) : (
          <Button type="button" onClick={() => setConfirm(true)}>
            Clôturer et attribuer les récompenses
          </Button>
        )}
        <FieldError message={state && !state.ok ? state.error : undefined} />
      </form>
    </Card>
  );
}

const AWARD_STATUS_LABELS: Record<ContestAward["status"], string> = {
  pending: "À remettre",
  delivered: "Remis",
  cancelled: "Annulé",
};

/** Palmarès : lots attribués à la clôture, remise en caisse contre code. */
export function ContestAwardsList({
  contestId,
  awards,
}: {
  contestId: string;
  awards: Array<ContestAward & { playerName: string }>;
}) {
  const [state, formAction, pending] = useActionState(setContestAwardStatus, null);
  const [cancelId, setCancelId] = useState<string | null>(null);

  return (
    <Card>
      <h2 className="font-semibold mb-1">🏅 Récompenses attribuées</h2>
      <p className="text-sm text-zinc-500 mb-4">
        Le gagnant présente son code en caisse ; marquez le lot « remis »
        à la remise. Chaque mouvement est journalisé.
      </p>
      <ul className="space-y-2">
        {awards.map((award) => (
          <li
            key={award.id}
            className="flex flex-wrap items-center gap-3 rounded-xl bg-zinc-50 px-3 py-2"
          >
            <span className="w-8 text-center font-black tabular-nums text-k-ink">
              {award.rank}
            </span>
            <span className="min-w-0 flex-1 truncate text-sm font-bold text-k-ink">
              {award.playerName}
              <span className="ml-2 font-normal text-zinc-500">
                {award.reward_label}
              </span>
            </span>
            <code className="rounded bg-white px-2 py-0.5 text-xs font-mono font-bold text-k-ink border border-zinc-200">
              {award.code}
            </code>
            <span
              className={
                award.status === "delivered"
                  ? "rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-bold text-emerald-700"
                  : award.status === "cancelled"
                    ? "rounded-full bg-zinc-200 px-2.5 py-0.5 text-xs font-bold text-zinc-600"
                    : "rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-bold text-amber-700"
              }
            >
              {AWARD_STATUS_LABELS[award.status]}
            </span>
            {award.status === "pending" && (
              <span className="flex items-center gap-1.5">
                <form action={formAction}>
                  <input type="hidden" name="id" value={award.id} />
                  <input type="hidden" name="contest_id" value={contestId} />
                  <input type="hidden" name="status" value="delivered" />
                  <Button type="submit" variant="secondary" disabled={pending}>
                    Marquer remis
                  </Button>
                </form>
                {cancelId === award.id ? (
                  <form action={formAction} className="flex items-center gap-1.5">
                    <input type="hidden" name="id" value={award.id} />
                    <input type="hidden" name="contest_id" value={contestId} />
                    <input type="hidden" name="status" value="cancelled" />
                    <Input
                      name="reason"
                      required
                      minLength={10}
                      maxLength={300}
                      placeholder="Motif d'annulation (journalisé)"
                      className="w-56"
                      aria-label="Motif d'annulation"
                    />
                    <Button type="submit" variant="danger" disabled={pending}>
                      Annuler le lot
                    </Button>
                  </form>
                ) : (
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => setCancelId(award.id)}
                  >
                    Annuler…
                  </Button>
                )}
              </span>
            )}
          </li>
        ))}
      </ul>
      <FieldError message={state && !state.ok ? state.error : undefined} />
    </Card>
  );
}
