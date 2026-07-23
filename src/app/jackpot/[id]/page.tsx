import { cache } from "react";
import type { Metadata, Viewport } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { loadJackpotContext } from "@/lib/jackpot-context";
import { JackpotTracker } from "@/components/jackpot/jackpot-tracker";
import { SkipLink } from "@/components/ui/skip-link";

/**
 * Page publique SUIVABLE du jackpot collectif — DA « Kermesse », même famille
 * visuelle que le passeport de fidélité et la chasse au trésor. Le client
 * arrive en scannant le QR du commerce et peut « ajouter à l'écran d'accueil »
 * pour suivre la jauge partagée en direct (PWA installable, cf. metadata +
 * /jackpot/[id]/manifest.webmanifest).
 *
 * Rendu dynamique : la jauge évolue et l'état dépend du cookie joueur. Aucune
 * écriture au chargement — la participation se fait au POST du bouton.
 */
export const dynamic = "force-dynamic";

/** Un seul chargement par requête, partagé entre generateMetadata et la page. */
const loadContext = cache((idOrSlug: string) => loadJackpotContext(idOrSlug));

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const ctx = await loadContext(id);
  if (!ctx.ok) return { title: "Jackpot", robots: { index: false } };

  const name = ctx.campaign.name;
  return {
    title: name,
    description: `Suivez le jackpot collectif de ${ctx.organization.name} en direct et tentez votre chance.`,
    // Page privée par commerce : suivable par lien, pas indexée.
    robots: { index: false },
    manifest: `/jackpot/${encodeURIComponent(id)}/manifest.webmanifest`,
    // « Ajouter à l'écran d'accueil » : titre et mode plein écran sur iOS.
    appleWebApp: { capable: true, title: name, statusBarStyle: "default" },
    formatDetection: { telephone: false },
  };
}

export function generateViewport(): Viewport {
  return { themeColor: "#fdf6e3" };
}

export default async function JackpotPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const ctx = await loadContext(id);

  // Réponse générique unique (404) : aucun oracle sur le motif d'invalidité
  // (campagne inconnue, archivée, module coupé, abonnement inactif…).
  if (!ctx.ok) notFound();

  return (
    <Shell>
      <JackpotTracker
        campaignId={ctx.campaign.id}
        organizationName={ctx.organization.name}
        logoUrl={ctx.organization.logo_url}
        campaignName={ctx.campaign.name}
        validationMode={ctx.gauge.validationMode}
        drawMode={ctx.gauge.drawMode}
        rewardLabel={ctx.campaign.reward_label}
        rewardDetails={ctx.campaign.reward_details}
        merchantContent={ctx.campaign.merchant_content}
        gauge={{
          currentCount: ctx.gauge.currentCount,
          threshold: ctx.gauge.threshold,
          cycle: ctx.gauge.cycle,
          displayAmountCents: ctx.gauge.displayAmountCents,
          drawAt: ctx.gauge.drawAt,
          drawDone: ctx.gauge.drawDone,
          drawnAt: ctx.gauge.drawnAt,
          soldOut: ctx.gauge.soldOut,
        }}
        wins={ctx.player.wins.map((w) => ({
          id: w.id,
          cycle: w.cycle,
          code: w.code,
          redeemedAt: w.redeemedAt,
        }))}
      />

      <footer className="mx-auto max-w-md px-4 pb-10 text-center text-xs text-k-body">
        Jackpot collectif proposé par {ctx.organization.name} · propulsé par{" "}
        <Link
          href="/?utm_source=jackpot&utm_medium=footer"
          className="font-bold text-k-ink underline underline-offset-2 hover:text-k-orange"
        >
          Lastchance
        </Link>
      </footer>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh bg-k-bg">
      <SkipLink />
      {/* Bandeau rayé kermesse en tête de page (identité du parcours joueur). */}
      <div
        aria-hidden
        className="h-3 w-full border-b-2 border-k-ink"
        style={{
          background:
            "repeating-linear-gradient(45deg, var(--color-k-yellow) 0 12px, var(--color-k-ink) 12px 24px)",
        }}
      />
      <main id="contenu" tabIndex={-1} className="outline-none">
        {children}
      </main>
    </div>
  );
}
