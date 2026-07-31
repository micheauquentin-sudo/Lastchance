"use client";

import { useActionState } from "react";
import { deleteCampaign, duplicateCampaign, updateCampaign } from "@/actions/campaigns";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { FieldError, Input, Label } from "@/components/ui/input";
import { useActionForm } from "@/lib/use-action-form";
import { CAMPAIGN_OUTSTANDING_LOSS_HINT } from "@/lib/validations/campaigns";
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
  // useActionForm et non useActionState : l'état de chargement doit retomber
  // même quand le rendu ne rejoue pas la revalidation — docs/bugs.md.
  const {
    state: renameState,
    pending: renamePending,
    onSubmit: renameSubmit,
  } = useActionForm(updateCampaign, {
    networkError: "Renommage impossible, réessayez.",
  });
  // Une SEULE instance pour les N formulaires de transition : tous les boutons
  // se désactivent ensemble et une seule zone de message les sert. Distincte de
  // celle du renommage, pour qu'une erreur ne s'affiche jamais sous l'autre.
  const {
    state: statusState,
    pending: statusPending,
    onSubmit: statusSubmit,
  } = useActionForm(updateCampaign, {
    // `reloadOnSuccess` : la pastille de statut, la liste des transitions
    // offertes et la bannière sont TOUTES des props serveur. Le commerçant
    // ouvrait son jeu au public — l'ISR de /play est purgé dans la foulée — et
    // son écran continuait d'afficher « brouillon ». Les formulaires ne
    // portent que des champs cachés : le rechargement ne coûte rien.
    reloadOnSuccess: true,
    networkError: "Changement de statut impossible, réessayez.",
  });
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

        <form onSubmit={renameSubmit} className="flex items-end gap-2 mb-6">
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
            <form key={t.to} onSubmit={statusSubmit}>
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
          {/* La case n'apparaît PAS d'emblée : elle ne sert qu'après CE refus
              précis, lequel NOMME le nombre de lots en attente. Demander la
              confirmation avant de savoir combien serait du bruit ; la
              demander après, c'est un choix informé. Le filtre porte sur le
              marqueur partagé et non sur `!ok` : « Suppression impossible »
              ou une coupure réseau montraient la même case destructive. */}
          {deleteState &&
            !deleteState.ok &&
            deleteState.error.includes(CAMPAIGN_OUTSTANDING_LOSS_HINT) && (
              <label className="mb-2 flex items-start gap-2 text-sm font-semibold text-red-700">
                <input
                  type="checkbox"
                  name="confirm_outstanding"
                  value="1"
                  className="mt-0.5 h-4 w-4 shrink-0"
                />
                Je comprends que les codes non retirés deviendront introuvables
                en caisse.
              </label>
            )}
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
