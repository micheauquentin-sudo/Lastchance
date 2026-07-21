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

export const metadata: Metadata = {
  title: "Classement — mode TV",
  robots: { index: false },
};

export default async function ContestTvPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const tv = await loadContestTvContext(slug);
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
