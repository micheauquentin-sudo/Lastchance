"use client";

import { useActionState, useState } from "react";
import { ChampGrandEcran } from "@/components/studio/champ-grand-ecran";
import { createJackpotCampaign } from "@/actions/jackpot";
import { Button } from "@/components/ui/button";
import { InfoBulle } from "@/components/dashboard/info-bulle";
import { FieldError, Input, Label } from "@/components/ui/input";

/**
 * `instanceId` : suffixe d'identifiants, pour que la page liste puisse monter
 * DEUX fois ce formulaire — en tête d'écran et dans l'état vide — sans
 * dupliquer un `id` dans le document (ce qui casserait `htmlFor` et
 * `aria-describedby`, donc l'annonce au lecteur d'écran).
 */
export function NewJackpotForm({ instanceId = "" }: { instanceId?: string }) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState(createJackpotCampaign, null);

  if (!open) {
    return <Button onClick={() => setOpen(true)}>+ Nouveau jackpot</Button>;
  }

  return (
    <form
      action={formAction}
      className="w-full max-w-xl flex flex-wrap items-end gap-2 rounded-2xl border-2 border-k-ink bg-white p-4 shadow-[4px_4px_0_rgba(33,29,22,0.9)]"
    >
      {/* Dit au serveur sur quel écran on est, pour atterrir dans le
          studio plutôt que dans l'atelier (VIT-51). */}
      <ChampGrandEcran />
      <div className="w-full sm:w-auto">
        <Label htmlFor={`jackpot-name${instanceId}`}>Nom du jackpot</Label>
        <Input
          id={`jackpot-name${instanceId}`}
          name="name"
          required
          maxLength={80}
          placeholder="Ex : La grande cagnotte du bar"
          autoFocus
          className="w-full sm:w-64"
        />
      </div>
      <Button type="submit" disabled={pending}>
        {pending ? "Création…" : "Créer"}
      </Button>
      <Button
        type="button"
        variant="ghost"
        onClick={() => setOpen(false)}
        disabled={pending}
      >
        Annuler
      </Button>
      <FieldError message={state && !state.ok ? state.error : undefined} />
      <InfoBulle
        id={`creation-jackpot${instanceId}`}
        resume="Ce qui va se passer"
        defaultOpen
        className="w-full"
      >
        Créer prépare une cagnotte en brouillon : rien n&apos;est publié et
        personne ne peut encore y contribuer. Vous atterrissez directement dans
        l&apos;atelier, à l&apos;étape « Les réglages », où se fixent le palier à
        atteindre et le lot commun. Vous la retrouverez à tout moment dans la
        liste de vos jackpots.
      </InfoBulle>
    </form>
  );
}
