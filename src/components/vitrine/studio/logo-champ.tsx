"use client";

import { useState } from "react";
import Image from "next/image";
import { removeLogo, uploadLogo } from "@/actions/branding";
import { useActionForm } from "@/lib/use-action-form";
import { Button } from "@/components/ui/button";
import { FieldError } from "@/components/ui/input";
import type { ActionResult } from "@/lib/utils";

const retirerAction = (): Promise<ActionResult> => removeLogo();

/**
 * LE LOGO, RÉGLABLE DEPUIS LE STUDIO (VIT-20).
 *
 * ── POURQUOI IL N'Y ÉTAIT PAS, ET POURQUOI IL Y VIENT ──
 *
 * Le logo appartient au COMMERCE, pas à la vitrine : il paraît aussi sur la
 * page de la roue et sur les affiches, et il se réglait donc dans les réglages
 * généraux. C'est cohérent, et c'était quand même le mauvais endroit — le seul
 * écran où l'on voit ce que le logo donne, posé sur la bannière et à la taille
 * réelle, est celui-ci.
 *
 * Il reste LE MÊME logo et LA MÊME action : ce composant n'en crée pas un
 * second pour la vitrine. Le changer ici le change partout, et la phrase le
 * dit — sans quoi un commerçant croirait régler une image « de sa carte » et
 * découvrirait sa roue changée.
 *
 * ── DEUX FORMULAIRES, ET C'EST VOULU ──
 *
 * Envoyer et retirer sont deux gestes distincts. Motif de `PhotoChamp`, à qui
 * ce composant ressemble volontairement : le commerçant a déjà appris cette
 * forme un cran plus bas dans la même colonne.
 */
export function LogoChamp({
  logoUrl,
  peutEditer,
}: {
  logoUrl: string | null;
  peutEditer: boolean;
}) {
  const [choisi, setChoisi] = useState<string | null>(null);
  const envoi = useActionForm(uploadLogo, {
    networkError: "Envoi impossible, réessayez.",
    toastOnSuccess: "Logo enregistré.",
  });
  const retrait = useActionForm(retirerAction, {
    networkError: "Retrait impossible, réessayez.",
    toastOnSuccess: "Logo retiré.",
  });

  return (
    <div className="rounded-xl border-2 border-k-ink/15 bg-white p-3">
      <p className="text-xs font-black text-k-ink">Logo</p>
      <p className="mt-0.5 text-xs text-zinc-500">
        Le logo de votre commerce. Il sert aussi sur votre roue et vos affiches
        — le changer ici le change partout.
      </p>

      {logoUrl ? (
        <div className="mt-2 flex items-center gap-3">
          {/* `unoptimized` : l'URL vient d'un seau public Supabase et le logo
              est déjà réduit à 256 px par l'action. Le repasser au pipeline
              d'images ne gagnerait rien et exigerait d'autoriser l'hôte. */}
          <Image
            src={logoUrl}
            alt=""
            width={48}
            height={48}
            unoptimized
            className="size-12 shrink-0 rounded-lg border-2 border-k-ink object-contain"
          />
          <form onSubmit={retrait.onSubmit}>
            <Button
              type="submit"
              variant="secondary"
              disabled={!peutEditer || retrait.pending}
            >
              {retrait.pending ? "Retrait…" : "Retirer"}
            </Button>
          </form>
        </div>
      ) : (
        <p className="mt-2 text-xs font-semibold text-zinc-400">
          Aucun logo — votre initiale est affichée à la place.
        </p>
      )}

      <form onSubmit={envoi.onSubmit} className="mt-2 space-y-2">
        <input
          type="file"
          name="logo"
          accept="image/png,image/jpeg,image/webp"
          onChange={(e) => setChoisi(e.target.files?.[0]?.name ?? null)}
          disabled={!peutEditer}
          className="block w-full text-xs font-semibold text-k-ink file:mr-2 file:rounded-lg file:border-2 file:border-k-ink file:bg-k-yellow file:px-2 file:py-1 file:text-xs file:font-black"
        />
        {choisi ? (
          <Button type="submit" disabled={!peutEditer || envoi.pending}>
            {envoi.pending ? "Envoi…" : "Enregistrer le logo"}
          </Button>
        ) : null}
        <FieldError
          message={
            envoi.state && !envoi.state.ok ? envoi.state.error : undefined
          }
        />
      </form>
      <FieldError
        message={
          retrait.state && !retrait.state.ok ? retrait.state.error : undefined
        }
      />
    </div>
  );
}
