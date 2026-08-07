"use client";

import { createQrCode, deleteQrCode } from "@/actions/qr-codes";
import { Button } from "@/components/ui/button";
import { FieldError, Input, Label } from "@/components/ui/input";
import { useActionForm } from "@/lib/use-action-form";

export function NewQrForm({
  campaigns,
  defaultCampaignId,
  campagneFigee = false,
  instanceId,
}: {
  campaigns: Array<{ id: string; name: string }>;
  defaultCampaignId?: string;
  /**
   * Le formulaire est servi DANS une campagne (page détail du jeu) : il n'y a
   * rien à choisir, la campagne est celle de la page. Le `<select>` cède la
   * place à un champ caché — un menu à une seule option n'est pas un choix,
   * c'est un piège à clic.
   */
  campagneFigee?: boolean;
  /**
   * Suffixe des `id` de champs. Le formulaire est monté sur DEUX pages ; sans
   * lui, deux instances sur un même écran partageraient `qr-campaign` et
   * `qr-label`, et un `<label for>` désignerait le champ de l'autre.
   */
  instanceId?: string;
}) {
  const suffixe = instanceId ? `-${instanceId}` : "";
  const idCampagne = `qr-campaign${suffixe}`;
  const idLibelle = `qr-label${suffixe}`;
  const campagneChoisie = defaultCampaignId ?? campaigns[0]?.id;

  const { state, pending, onSubmit } = useActionForm(createQrCode, {
    // `reloadOnSuccess` : signature mécanique « insère une ligne dans une liste
    // rendue par le serveur, sans rendre aucun succès » — la seule famille où
    // l'échec du rafraîchissement fait recommencer le geste, donc crée un
    // doublon. Vérifiée par `use-action-form-coverage.test.ts`.
    reloadOnSuccess: true,
    resetOnSuccess: true,
    networkError: "Création impossible, réessayez.",
  });

  return (
    <form onSubmit={onSubmit} className="flex flex-wrap items-end gap-3">
      {campagneFigee ? (
        <input type="hidden" name="campaign_id" value={campagneChoisie ?? ""} />
      ) : (
        <div>
          <Label htmlFor={idCampagne}>Campagne</Label>
          <select
            id={idCampagne}
            name="campaign_id"
            defaultValue={campagneChoisie}
            className="rounded-lg border border-zinc-300 bg-white px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
          >
            {campaigns.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
      )}
      <div>
        <Label htmlFor={idLibelle}>Libellé (optionnel)</Label>
        <Input
          id={idLibelle}
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
  const { state, pending, onSubmit } = useActionForm(deleteQrCode, {
    networkError: "Suppression impossible, réessayez.",
  });

  return (
    <form
      onSubmit={(e) => {
        if (!confirm("Supprimer ce QR code ? Le lien cessera de fonctionner.")) {
          e.preventDefault();
          return;
        }
        onSubmit(e);
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
