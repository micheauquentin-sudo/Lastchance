"use client";

import { useActionState } from "react";
import Link from "next/link";
import { createWheel, deleteWheel } from "@/actions/prizes";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { FieldError, Input } from "@/components/ui/input";
import { describeSchedule } from "@/lib/wheel-schedule";
import type { Wheel } from "@/types/database";

/**
 * Gestion des roues d'une campagne (multi-roues). Chaque roue peut
 * porter un créneau (édité depuis sa page de configuration) ; la roue
 * active au moment du jeu est choisie par créneau puis position.
 */
export function CampaignWheels({
  campaignId,
  wheels,
  activeWheelId = null,
}: {
  campaignId: string;
  wheels: Wheel[];
  /** Roue qui serait servie sur /play à l'instant présent (aperçu live). */
  activeWheelId?: string | null;
}) {
  const [createState, createAction, creating] = useActionState(createWheel, null);
  const [deleteState, deleteAction, deleting] = useActionState(deleteWheel, null);

  const canDelete = wheels.length > 1;

  return (
    <Card>
      <h2 className="font-semibold mb-1">Roues du jeu</h2>
      <p className="text-sm text-zinc-500 mb-4">
        Plusieurs roues par campagne : planifiez des créneaux (happy hour,
        week-end…). La roue sans créneau reste active par défaut.
      </p>

      <ul className="space-y-2 mb-5">
        {wheels.map((w) => (
          <li
            key={w.id}
            className="flex items-center justify-between gap-3 rounded-lg border border-zinc-200 px-3 py-2.5"
          >
            <div className="min-w-0">
              <p className="flex items-center gap-2 font-medium truncate">
                {w.name}
                {w.id === activeWheelId && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-700 shrink-0">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                    Active maintenant
                  </span>
                )}
              </p>
              <p className="text-xs text-zinc-500">
                {describeSchedule(w)} ·{" "}
                {w.game_type === "scratch" ? "Carte à gratter" : "Roue"}
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <Link
                href={`/dashboard/campaigns/${campaignId}/wheel?wheel=${w.id}`}
                className="text-sm font-semibold text-zinc-900 hover:underline"
              >
                Configurer
              </Link>
              {canDelete && (
                <form
                  action={deleteAction}
                  onSubmit={(e) => {
                    if (!confirm(`Supprimer la roue « ${w.name} » ?`)) {
                      e.preventDefault();
                    }
                  }}
                >
                  <input type="hidden" name="id" value={w.id} />
                  <button
                    type="submit"
                    disabled={deleting}
                    className="text-sm text-red-600 hover:underline disabled:opacity-50"
                  >
                    Supprimer
                  </button>
                </form>
              )}
            </div>
          </li>
        ))}
      </ul>
      <FieldError
        message={deleteState && !deleteState.ok ? deleteState.error : undefined}
      />

      <form action={createAction} className="flex items-end gap-2">
        <input type="hidden" name="campaign_id" value={campaignId} />
        <div className="flex-1 max-w-xs">
          <Input
            name="name"
            placeholder="Nom de la nouvelle roue"
            required
            maxLength={80}
          />
        </div>
        <Button type="submit" variant="secondary" disabled={creating}>
          {creating ? "…" : "Ajouter une roue"}
        </Button>
      </form>
      <FieldError
        message={createState && !createState.ok ? createState.error : undefined}
      />
    </Card>
  );
}
