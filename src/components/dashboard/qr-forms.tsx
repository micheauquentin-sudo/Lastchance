"use client";

import { useActionState } from "react";
import { createQrCode, deleteQrCode } from "@/actions/qr-codes";
import { Button } from "@/components/ui/button";
import { FieldError, Input, Label } from "@/components/ui/input";

export function NewQrForm({
  campaigns,
  defaultCampaignId,
}: {
  campaigns: Array<{ id: string; name: string }>;
  defaultCampaignId?: string;
}) {
  const [state, formAction, pending] = useActionState(createQrCode, null);

  return (
    <form action={formAction} className="flex flex-wrap items-end gap-3">
      <div>
        <Label htmlFor="qr-campaign">Campagne</Label>
        <select
          id="qr-campaign"
          name="campaign_id"
          defaultValue={defaultCampaignId ?? campaigns[0]?.id}
          className="rounded-lg border border-zinc-300 bg-white px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
        >
          {campaigns.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>
      <div>
        <Label htmlFor="qr-label">Libellé (optionnel)</Label>
        <Input
          id="qr-label"
          name="label"
          maxLength={120}
          placeholder="Ex : Table 4, Comptoir…"
          className="w-48"
        />
      </div>
      <Button type="submit" disabled={pending}>
        {pending ? "Création…" : "+ Générer"}
      </Button>
      <FieldError message={state && !state.ok ? state.error : undefined} />
    </form>
  );
}

export function DeleteQrButton({ id }: { id: string }) {
  const [state, formAction, pending] = useActionState(deleteQrCode, null);

  return (
    <form
      action={formAction}
      onSubmit={(e) => {
        if (!confirm("Supprimer ce QR code ? Le lien cessera de fonctionner.")) {
          e.preventDefault();
        }
      }}
    >
      <input type="hidden" name="id" value={id} />
      <button
        type="submit"
        disabled={pending}
        className="text-sm font-semibold text-red-600 hover:underline disabled:text-red-300"
      >
        {pending ? "…" : "Supprimer"}
      </button>
      <FieldError message={state && !state.ok ? state.error : undefined} />
    </form>
  );
}
