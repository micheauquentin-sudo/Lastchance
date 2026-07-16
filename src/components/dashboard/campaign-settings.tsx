"use client";

import { useActionState } from "react";
import { deleteCampaign, duplicateCampaign, updateCampaign } from "@/actions/campaigns";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { FieldError, Input, Label } from "@/components/ui/input";
import type { Campaign, CampaignStatus } from "@/types/database";

const STATUS_ACTIONS: Array<{
  from: CampaignStatus[];
  to: CampaignStatus;
  label: string;
}> = [
  { from: ["draft", "paused"], to: "active", label: "Activer" },
  { from: ["active"], to: "paused", label: "Mettre en pause" },
  { from: ["draft", "active", "paused"], to: "archived", label: "Archiver" },
  { from: ["archived"], to: "draft", label: "Restaurer en brouillon" },
];

export function CampaignSettings({ campaign }: { campaign: Campaign }) {
  const [renameState, renameAction, renamePending] = useActionState(
    updateCampaign,
    null,
  );
  const [statusState, statusAction, statusPending] = useActionState(
    updateCampaign,
    null,
  );
  const [deleteState, deleteAction, deletePending] = useActionState(
    deleteCampaign,
    null,
  );
  const [duplicateState, duplicateAction, duplicatePending] = useActionState(
    duplicateCampaign,
    null,
  );

  const transitions = STATUS_ACTIONS.filter((a) =>
    a.from.includes(campaign.status),
  );

  return (
    <div className="space-y-4">
      <Card>
        <h2 className="font-semibold mb-4">Réglages</h2>

        <form action={renameAction} className="flex items-end gap-2 mb-6">
          <input type="hidden" name="id" value={campaign.id} />
          <div className="flex-1 max-w-xs">
            <Label htmlFor="campaign-name">Nom de la campagne</Label>
            <Input
              id="campaign-name"
              name="name"
              defaultValue={campaign.name}
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

        <div className="flex flex-wrap gap-2">
          {transitions.map((t) => (
            <form key={t.to} action={statusAction}>
              <input type="hidden" name="id" value={campaign.id} />
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

        <div className="mt-4 pt-4 border-t border-zinc-100">
          <form action={duplicateAction}>
            <input type="hidden" name="id" value={campaign.id} />
            <Button type="submit" variant="secondary" disabled={duplicatePending}>
              {duplicatePending ? "Duplication…" : "Dupliquer cette campagne"}
            </Button>
          </form>
          <p className="mt-2 text-xs text-zinc-500">
            Crée une copie en brouillon (roues, lots, réglages) — utile pour
            relancer un jeu saisonnier.
          </p>
          <FieldError
            message={
              duplicateState && !duplicateState.ok ? duplicateState.error : undefined
            }
          />
        </div>
      </Card>

      <Card className="border-red-200">
        <h2 className="font-semibold text-red-700 mb-1">Zone dangereuse</h2>
        <p className="text-sm text-zinc-500 mb-4">
          Supprime la campagne, sa roue, ses lots, ses QR codes et ses
          participations. Irréversible.
        </p>
        <form
          action={deleteAction}
          onSubmit={(e) => {
            if (!confirm("Supprimer définitivement cette campagne ?")) {
              e.preventDefault();
            }
          }}
        >
          <input type="hidden" name="id" value={campaign.id} />
          <Button type="submit" variant="danger" disabled={deletePending}>
            {deletePending ? "Suppression…" : "Supprimer la campagne"}
          </Button>
        </form>
        <FieldError
          message={deleteState && !deleteState.ok ? deleteState.error : undefined}
        />
      </Card>
    </div>
  );
}
