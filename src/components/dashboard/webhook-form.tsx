"use client";

import { useActionState, useState } from "react";
import {
  regenerateWebhookSecret,
  retryFailedWebhookDeliveries,
  updateWebhookUrl,
} from "@/actions/webhooks";
import { Button } from "@/components/ui/button";
import { FieldError, Input, Label } from "@/components/ui/input";

/**
 * Réglage du webhook sortant : URL + secret de signature (HMAC
 * SHA-256 du corps JSON, header X-Lastchance-Signature). Événements
 * envoyés : participation.claimed, newsletter.subscriber.created.
 */
export function WebhookForm({
  webhookUrl,
  webhookSecret,
  failedDeliveries = 0,
}: {
  webhookUrl: string | null;
  webhookSecret: string;
  /** Livraisons en dead-letter (tentatives épuisées), rejouables. */
  failedDeliveries?: number;
}) {
  const [urlState, urlAction, urlPending] = useActionState(updateWebhookUrl, null);
  const [secretState, secretAction, secretPending] = useActionState(
    regenerateWebhookSecret,
    null,
  );
  const [retryState, retryAction, retryPending] = useActionState(
    async () => retryFailedWebhookDeliveries(),
    null,
  );
  const [revealed, setRevealed] = useState(false);

  return (
    <div className="space-y-4">
      <form action={urlAction} className="flex items-end gap-2">
        <div className="flex-1">
          <Label htmlFor="webhook-url">URL du webhook</Label>
          <Input
            id="webhook-url"
            name="url"
            type="url"
            defaultValue={webhookUrl ?? ""}
            placeholder="https://votre-outil.exemple.com/webhooks/lastchance"
          />
        </div>
        <Button type="submit" variant="secondary" disabled={urlPending}>
          {urlPending ? "…" : "Enregistrer"}
        </Button>
      </form>
      {urlState?.ok && (
        <p className="text-sm font-medium text-emerald-600">Enregistré.</p>
      )}
      <FieldError message={urlState && !urlState.ok ? urlState.error : undefined} />

      <div>
        <Label>Secret de signature</Label>
        <div className="flex items-center gap-2">
          <code className="flex-1 truncate rounded-lg border border-zinc-300 bg-zinc-50 px-3.5 py-2.5 text-sm">
            {revealed ? webhookSecret : "•".repeat(24)}
          </code>
          <button
            type="button"
            onClick={() => setRevealed((v) => !v)}
            className="text-sm font-semibold text-zinc-600 hover:text-zinc-900"
          >
            {revealed ? "Masquer" : "Afficher"}
          </button>
        </div>
        <p className="mt-1 text-xs text-zinc-400">
          Signe chaque envoi (HMAC SHA-256) dans le header
          X-Lastchance-Signature — à vérifier côté récepteur.
        </p>
      </div>

      <form
        action={secretAction}
        onSubmit={(e) => {
          if (
            !confirm(
              "Régénérer le secret ? Les anciennes signatures deviendront invalides.",
            )
          ) {
            e.preventDefault();
          }
        }}
      >
        <Button type="submit" variant="secondary" disabled={secretPending}>
          {secretPending ? "…" : "Régénérer le secret"}
        </Button>
      </form>
      <FieldError
        message={secretState && !secretState.ok ? secretState.error : undefined}
      />

      {failedDeliveries > 0 && (
        <form
          action={retryAction}
          className="rounded-xl bg-red-50 px-3 py-2.5"
        >
          <p className="text-sm font-semibold text-red-700">
            {failedDeliveries} livraison{failedDeliveries > 1 ? "s" : ""} en
            échec définitif (tentatives épuisées).
          </p>
          <p className="mt-0.5 text-xs text-red-600">
            Réparez votre récepteur puis rejouez : nouvelle livraison dans
            les 5 minutes.
          </p>
          <Button
            type="submit"
            variant="secondary"
            disabled={retryPending}
            className="mt-2"
          >
            {retryPending ? "…" : "Rejouer les livraisons en échec"}
          </Button>
          <FieldError
            message={retryState && !retryState.ok ? retryState.error : undefined}
          />
        </form>
      )}
      {retryState?.ok && (
        <p className="text-sm text-emerald-600">
          {retryState.data.retried} livraison
          {retryState.data.retried > 1 ? "s" : ""} remise
          {retryState.data.retried > 1 ? "s" : ""} en file.
        </p>
      )}
    </div>
  );
}
