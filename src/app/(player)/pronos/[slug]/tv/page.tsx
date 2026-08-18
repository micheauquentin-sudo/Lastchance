import { cache } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { APP_URL } from "@/lib/env";
import { loadContestTvContext } from "@/lib/pronostics-context";
import { TvScreen } from "@/components/pronos/tv-screen";

/**
 * Mode TV — /pronos/[slug]/tv : classement plein écran pour le
 * téléviseur du commerce. Lecture seule, sans cookie joueur ; le
 * rafraîchissement est assuré côté client (polling de l'API TV).
 */

export const dynamic = "force-dynamic";

/** Un seul chargement par requête, partagé entre generateMetadata et la page. */
const loadContext = cache((slug: string) => loadContestTvContext(slug));

/**
 * LE 404 SE DÉCIDE ICI, ET PAS SEULEMENT DANS LE CORPS.
 *
 * Depuis que le groupe `(player)` porte un `loading.tsx`, le rendu est STREAMÉ :
 * Next envoie l'en-tête HTTP — donc le STATUT — dès que la coquille est prête,
 * et le `notFound()` du corps n'arrive que dans un chunk ultérieur. Une
 * ressource inconnue rendait alors **200** avec un digest 404 dans le flux :
 * juste à l'œil, faux pour tout ce qui lit un statut — moteurs, sondes, tests.
 * `generateMetadata` s'exécute AVANT le premier octet ; c'est le dernier
 * endroit où le statut est encore négociable. Le `notFound()` du corps reste
 * en filet, et `loadContext` est mémoïsé par `cache()` : la page relit le même
 * résultat, la requête n'est pas doublée.
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const ctx = await loadContext(slug);
  if (!ctx.ok) notFound();
  return { title: "Classement — mode TV", robots: { index: false } };
}

export default async function ContestTvPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const tv = await loadContext(slug);
  if (!tv.ok) notFound();

  // Adresse publique affichée à l'écran : APP_URL est l'URL canonique
  // déjà utilisée pour le lien partagé du championnat (dashboard).
  const joinLabel = `${APP_URL}/pronos/${slug}`.replace(/^https?:\/\//, "");

  return (
    <TvScreen
      slug={slug}
      initial={{
        contest: tv.contest,
        organization: tv.organization,
        totalPlayers: tv.totalPlayers,
        entries: tv.entries,
        generatedAt: tv.generatedAt,
      }}
      joinLabel={joinLabel}
    />
  );
}
