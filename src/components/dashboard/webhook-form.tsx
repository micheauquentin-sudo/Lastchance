"use client";

import { useActionState, useState } from "react";
import { regenerateWebhookSecret, updateWebhookUrl } from "@/actions/webhooks";
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
}: {
  webhookUrl: string | null;
  webhookSecret: string;
}) {
  const [urlState, urlAction, urlPending] = useActionState(updateWebhookUrl, null);
  const [secretState, secretAction, secretPending] = useActionState(
    regenerateWebhookSecret,
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
    </div>
  );
}
