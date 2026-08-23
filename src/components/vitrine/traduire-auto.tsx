"use client";

import { useState } from "react";
import { traduireVitrineAutomatiquement } from "@/actions/vitrine";
import { useActionForm } from "@/lib/use-action-form";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { FieldError } from "@/components/ui/input";

/**
 * VIT-6 — UN BOUTON, ET CE QU'IL PROMET EXACTEMENT.
 *
 * ── UN CORRECTIF FACULTATIF, PAS UN REMPLACEMENT ──
 *
 * L'éditeur manuel reste juste en dessous, inchangé. Ce bouton ne fait que
 * remplir ce qui manque ou ce qui a périmé ; le commerçant garde le dernier
 * mot sur chaque champ, et une traduction automatique se retouche exactement
 * comme une traduction écrite à la main.
 *
 * ── CE QUE LE MESSAGE DIT, ET POURQUOI IL DIT LES CARACTÈRES ──
 *
 * Le fournisseur facture au caractère. Afficher « 12 champs traduits » sans le
 * volume aurait caché l'unité qui compte : c'est en caractères qu'on comprend
 * ce qu'une relance coûtera, et pourquoi une carte déjà traduite ne coûte plus
 * rien.
 *
 * ── LE RAFRAÎCHISSEMENT DOUX SUFFIT, ET IL GARDE LE COMPTE RENDU ──
 *
 * L'écriture se fait en base et l'état de traduction est rendu au SERVEUR par
 * la page : `router.refresh()` — le comportement par défaut de `useActionForm`
 * — rejoue les composants serveur, donc la jauge et le tableau montrent
 * l'après. Un rechargement franc aurait fait la même chose en une seconde de
 * plus, en emportant le message qui dit combien de caractères ont été
 * consommés.
 */
export function TraduireAuto({ peutEditer }: { peutEditer: boolean }) {
  const [compteRendu, setCompteRendu] = useState<string | null>(null);

  const { state, pending, onSubmit } = useActionForm(
    traduireVitrineAutomatiquement,
    {
      networkError: "Traduction impossible, réessayez.",
      onSuccess: (data) => setCompteRendu(data.message),
    },
  );

  if (!peutEditer) return null;

  return (
    <Card>
      <h2>Traduire automatiquement</h2>
      <p className="mb-4 mt-2 text-sm text-zinc-500">
        Remplit en anglais les champs qui manquent ou qui ont changé depuis leur
        traduction. Les prix, la disponibilité, les badges et les allergènes n
        &apos;y passent jamais. Relisez ensuite&nbsp;: ce sont des traductions
        automatiques, et le français reste la référence.
      </p>

      {compteRendu ? (
        <p
          role="status"
          className="mb-4 rounded-xl border-2 border-green-700/30 bg-green-50 px-3 py-2 text-sm font-semibold text-green-700"
        >
          {compteRendu}
        </p>
      ) : null}

      <form onSubmit={onSubmit}>
        <Button type="submit" disabled={pending}>
          {pending ? "Traduction en cours…" : "Traduire ce qui manque"}
        </Button>
        {state && !state.ok ? <FieldError message={state.error} /> : null}
      </form>
    </Card>
  );
}
