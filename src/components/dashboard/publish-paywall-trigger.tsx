"use client";

import { useState } from "react";
import type { RessourceAchat } from "@/components/dashboard/addon-purchase";
import { PublishPaywallModal } from "@/components/dashboard/publish-paywall-modal";
import { Button } from "@/components/ui/button";
import type { Entitlement } from "@/platform/experiences/contract";

/**
 * Bouton autonome qui ouvre la modale de choix d'offre pour publier un module.
 * Utilisé dans les bandeaux d'aperçu / upsell sans dupliquer l'état de modale.
 */
export function PublishPaywallTrigger({
  entitlement,
  peutAcheter,
  ressource,
  label = "Choisir une offre pour publier",
  className,
}: {
  entitlement: Entitlement;
  peutAcheter: boolean;
  ressource?: RessourceAchat;
  label?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={
          className ??
          "inline-block rounded-lg border border-k-ink bg-k-yellow px-4 py-2.5 text-sm font-bold text-k-ink hover:bg-k-yellow/80 transition-colors"
        }
      >
        {label}
      </button>
      <PublishPaywallModal
        open={open}
        onClose={() => setOpen(false)}
        entitlement={entitlement}
        peutAcheter={peutAcheter}
        ressource={ressource}
      />
    </>
  );
}

/**
 * Remplace le bouton submit « Ouvrir aux joueurs » / « Publier » lorsque
 * `canPublish` est faux : au clic, ouvre la modale de paiement ciblée au lieu
 * d'envoyer une action vouée au refus serveur.
 */
export function PublishActionButton({
  canPublish = true,
  peutAcheter = true,
  entitlement,
  ressource,
  pending = false,
  label = "Ouvrir aux joueurs",
  pendingLabel = "…",
  variant = "primary",
  className,
}: {
  canPublish?: boolean;
  peutAcheter?: boolean;
  entitlement: Entitlement;
  ressource?: RessourceAchat;
  pending?: boolean;
  label?: string;
  pendingLabel?: string;
  variant?: "primary" | "secondary";
  className?: string;
}) {
  const [open, setOpen] = useState(false);

  if (canPublish) {
    return (
      <Button
        type="submit"
        variant={variant}
        disabled={pending}
        className={className}
      >
        {pending ? pendingLabel : label}
      </Button>
    );
  }

  return (
    <>
      <Button
        type="button"
        variant={variant}
        onClick={() => setOpen(true)}
        className={className}
      >
        {label}
      </Button>
      <PublishPaywallModal
        open={open}
        onClose={() => setOpen(false)}
        entitlement={entitlement}
        peutAcheter={peutAcheter}
        ressource={ressource}
      />
    </>
  );
}
