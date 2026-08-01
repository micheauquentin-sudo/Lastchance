"use client";

import { useState } from "react";
import {
  regenerateWebhookSecret,
  retryFailedWebhookDeliveries,
  updateWebhookUrl,
} from "@/actions/webhooks";
import { Button } from "@/components/ui/button";
import { FieldError, Input, Label } from "@/components/ui/input";
import { useActionForm } from "@/lib/use-action-form";

/**
 * Réglage du webhook sortant : URL + secret de signature (HMAC
 * SHA-256 du corps JSON, header X-Lastchance-Signature). Événements
 * envoyés : participation.claimed, newsletter.subscriber.created.
 *
 * useActionForm et non useActionState : l'état de chargement doit retomber
 * même quand le rendu ne rejoue pas la revalidation — docs/bugs.md.
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
  const urlForm = useActionForm(updateWebhookUrl, {
    networkError: "Enregistrement impossible, réessayez.",
  });
  const secretForm = useActionForm(regenerateWebhookSecret, {
    // `reloadOnSuccess` : le secret affiché est une PROP SERVEUR. Sans
    // rechargement, « Afficher » rend l'ANCIEN secret après régénération, et
    // le commerçant le recopie dans son système — toutes ses signatures
    // échouent ensuite, alors qu'il a tout fait correctement. L'action ne
    // renvoie pas le nouveau secret, seul le rendu serveur le porte.
    reloadOnSuccess: true,
    networkError: "Régénération impossible, réessayez.",
  });
  const retryForm = useActionForm(async () => retryFailedWebhookDeliveries(), {
    networkError: "Rejeu impossible, réessayez.",
  });
  const [revealed, setRevealed] = useState(false);

  return (
    <div className="space-y-4">
      <form onSubmit={urlForm.onSubmit} className="flex items-end gap-2">
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
        <Button type="submit" variant="secondary" disabled={urlForm.pending}>
          {urlForm.pending ? "…" : "Enregistrer"}
        </Button>
      </form>
      {urlForm.state?.ok && (
        <p className="text-sm font-medium text-emerald-600">Enregistré.</p>
      )}
      <FieldError
        message={
          urlForm.state && !urlForm.state.ok ? urlForm.state.error : undefined
        }
      />

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
        onSubmit={(e) => {
          if (
            !confirm(
              "Régénérer le secret ? Les anciennes signatures deviendront invalides.",
            )
          ) {
            e.preventDefault();
            return;
          }
          secretForm.onSubmit(e);
        }}
      >
        <Button type="submit" variant="secondary" disabled={secretForm.pending}>
          {secretForm.pending ? "…" : "Régénérer le secret"}
        </Button>
      </form>
      <FieldError
        message={
          secretForm.state && !secretForm.state.ok
            ? secretForm.state.error
            : undefined
        }
      />

      {failedDeliveries > 0 && (
        <form
          onSubmit={retryForm.onSubmit}
          className="rounded-xl bg-red-50 px-3 py-2.5"
        >
          <p className="text-sm font-semibold text-red-700">
            {failedDeliveries} livraison{failedDeliveries > 1 ? "s" : ""} en
            échec définitif (tentatives épuisées).
          </p>
          <p className="mt-0.5 text-xs text-red-600">
            {/* « dans les 5 minutes » était faux : les deux passages qui
                drainent cette file sont des crons quotidiens. Promettre un
                délai qu'on ne tient pas fait recliquer le commerçant. */}
            Réparez votre récepteur puis rejouez : nouvelle livraison au
            prochain passage du worker (au plus tard le lendemain).
          </p>
          <Button
            type="submit"
            variant="secondary"
            disabled={retryForm.pending}
            className="mt-2"
          >
            {retryForm.pending ? "…" : "Rejouer les livraisons en échec"}
          </Button>
          <FieldError
            message={
              retryForm.state && !retryForm.state.ok
                ? retryForm.state.error
                : undefined
            }
          />
        </form>
      )}
      {retryForm.state?.ok && (
        <p className="text-sm text-emerald-600">
          {retryForm.state.data.retried} livraison
          {retryForm.state.data.retried > 1 ? "s" : ""} remise
          {retryForm.state.data.retried > 1 ? "s" : ""} en file.
        </p>
      )}
    </div>
  );
}
