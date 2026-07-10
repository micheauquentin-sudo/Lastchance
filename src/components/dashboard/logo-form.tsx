"use client";

import { useActionState } from "react";
import { removeLogo, uploadLogo } from "@/actions/branding";
import { Button } from "@/components/ui/button";
import { FieldError } from "@/components/ui/input";

/**
 * Upload du logo de l'établissement — affiché sur la page publique
 * /play (au-dessus de la roue) et disponible pour l'affiche.
 */
export function LogoForm({ logoUrl }: { logoUrl: string | null }) {
  const [uploadState, uploadAction, uploading] = useActionState(uploadLogo, null);
  const [removeState, removeAction, removing] = useActionState(removeLogo, null);

  return (
    <div className="space-y-4">
      {logoUrl ? (
        <div className="flex items-center gap-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={logoUrl}
            alt="Logo de l'établissement"
            className="h-16 w-16 rounded-xl border border-zinc-200 object-contain bg-white p-1"
          />
          <form action={removeAction}>
            <button
              type="submit"
              disabled={removing}
              className="text-sm font-semibold text-red-600 hover:underline disabled:text-red-300"
            >
              {removing ? "…" : "Retirer le logo"}
            </button>
          </form>
        </div>
      ) : (
        <p className="text-sm text-zinc-500">
          Aucun logo — vos clients voient uniquement le nom de
          l&apos;établissement.
        </p>
      )}

      <form action={uploadAction} className="flex flex-wrap items-center gap-3">
        <input
          type="file"
          name="logo"
          accept="image/png,image/jpeg,image/webp"
          required
          className="text-sm text-zinc-600 file:mr-3 file:rounded-lg file:border-0 file:bg-zinc-100 file:px-3 file:py-2 file:text-sm file:font-semibold file:text-zinc-700 hover:file:bg-zinc-200"
        />
        <Button type="submit" variant="secondary" disabled={uploading}>
          {uploading ? "Envoi…" : logoUrl ? "Remplacer" : "Ajouter"}
        </Button>
      </form>
      <p className="text-xs text-zinc-400">
        PNG, JPEG ou WebP · 2 Mo max · fond transparent recommandé.
      </p>
      <FieldError
        message={
          (uploadState && !uploadState.ok ? uploadState.error : undefined) ??
          (removeState && !removeState.ok ? removeState.error : undefined)
        }
      />
    </div>
  );
}
