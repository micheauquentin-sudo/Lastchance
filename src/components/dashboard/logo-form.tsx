"use client";

import { removeLogo, uploadLogo } from "@/actions/branding";
import { Button } from "@/components/ui/button";
import { FieldError } from "@/components/ui/input";
import { useActionForm } from "@/lib/use-action-form";

/**
 * Upload du logo de l'établissement — affiché sur la page publique
 * /play (au-dessus de la roue) et disponible pour l'affiche.
 *
 * `useActionForm` et non `useActionState` : l'état de chargement doit retomber
 * même quand le rendu ne rejoue pas la revalidation — docs/bugs.md.
 */
export function LogoForm({ logoUrl }: { logoUrl: string | null }) {
  const {
    state: uploadState,
    pending: uploading,
    onSubmit: uploadSubmit,
  } = useActionForm(uploadLogo, {
    networkError: "Envoi impossible, réessayez.",
    // La vignette ci-dessous EST le résultat, et elle vient de la prop serveur
    // `logoUrl`. Sans rechargement, un envoi réussi laisse l'ancien logo à
    // l'écran : le commerçant renvoie le fichier, ou conclut que le produit
    // refuse son image et publie sa page avec l'ancienne.
    //
    // COÛT ASSUMÉ, propre à ces deux appels : `/dashboard/settings` porte un
    // `WebhookForm` dont l'URL et le secret sont saisis à la main, et le
    // rechargement les efface. On le paie quand même — un message texte ne
    // remplace pas une vignette, et c'est la vignette que le commerçant
    // regarde pour décider s'il a fini.
    reloadOnSuccess: true,
  });
  const {
    state: removeState,
    pending: removing,
    onSubmit: removeSubmit,
  } = useActionForm(removeLogo, {
    // Symétrique de l'envoi : sans rechargement, le logo retiré reste affiché
    // avec son bouton « Retirer le logo », donc le geste paraît sans effet.
    networkError: "Retrait impossible, réessayez.",
    reloadOnSuccess: true,
  });

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
          <form onSubmit={removeSubmit}>
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

      <form onSubmit={uploadSubmit} className="flex flex-wrap items-center gap-3">
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
      <p className="text-xs text-k-muted">
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
