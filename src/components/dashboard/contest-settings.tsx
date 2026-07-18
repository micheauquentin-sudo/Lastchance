"use client";

import { useActionState, useState } from "react";
import {
  deleteContest,
  updateContest,
  updateContestRewards,
  updateContestScoring,
} from "@/actions/pronostics";
import type { ContestReward, ContestScoring } from "@/lib/pronostics";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { FieldError, Input, Label } from "@/components/ui/input";
import type { Contest, ContestStatus } from "@/types/database";

const STATUS_ACTIONS: Array<{
  from: ContestStatus[];
  to: ContestStatus;
  label: string;
}> = [
  { from: ["draft"], to: "active", label: "Ouvrir le championnat" },
  { from: ["active"], to: "finished", label: "Clôturer" },
  { from: ["finished"], to: "active", label: "Rouvrir" },
];

export function ContestSettings({ contest }: { contest: Contest }) {
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

  const transitions = STATUS_ACTIONS.filter((a) =>
    a.from.includes(contest.status),
  );

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

      <div className="mt-5 flex flex-wrap gap-2">
        {transitions.map((t) => (
          <form key={t.to} action={statusAction}>
            <input type="hidden" name="id" value={contest.id} />
            <input type="hidden" name="status" value={t.to} />
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

export function ContestScoringForm({
  contestId,
  scoring,
}: {
  contestId: string;
  scoring: ContestScoring;
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
        Un pronostic rapporte le palier le plus haut atteint.
      </p>
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
            />
            <div>
              <p className="text-sm font-bold text-k-ink">{f.label}</p>
              <p className="text-xs text-zinc-500">{f.hint}</p>
            </div>
          </div>
        ))}
        <Button type="submit" variant="secondary" disabled={pending}>
          {pending ? "…" : "Enregistrer le barème"}
        </Button>
        <FieldError message={state && !state.ok ? state.error : undefined} />
      </form>
    </Card>
  );
}

export function ContestRewardsEditor({
  contestId,
  rewards,
}: {
  contestId: string;
  rewards: ContestReward[];
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
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="secondary"
            disabled={rows.length >= 20}
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
          <Button type="submit" disabled={pending}>
            {pending ? "…" : "Enregistrer les récompenses"}
          </Button>
        </div>
        <FieldError message={state && !state.ok ? state.error : undefined} />
      </form>
    </Card>
  );
}
