import type { Metadata } from "next";
import { loadPlayContext } from "@/lib/play-context";
import { enabledEngagementActions } from "@/lib/engagement";
import { fontGoogleHref } from "@/lib/fonts";
import { playBackground, resolveWheelStyle } from "@/lib/wheel-style";
import { PlayExperience } from "@/components/wheel/play-experience";
import { ScanBeacon } from "@/components/wheel/scan-beacon";

/**
 * ISR : le HTML d'un slug est identique pour tous les visiteurs — le
 * re-rendre à chaque scan saturait le CPU SSR (~55 req/s par instance,
 * mesuré). Mis en cache 30 s : les changements du commerçant (pause,
 * lots…) apparaissent sous 30 s, et le spin lui-même revalide tout côté
 * server action au moment de jouer — aucune décision d'autorité ne
 * repose sur ce HTML. Le comptage de scans, lui, reste à l'unité via
 * <ScanBeacon /> (POST /api/scan à chaque chargement navigateur).
 */
export const revalidate = 30;

/** Aucun slug prérendu au build : chaque slug est généré à la première
 *  visite puis servi depuis le cache (ISR à la demande). */
export function generateStaticParams(): Array<{ slug: string }> {
  return [];
}

export const metadata: Metadata = {
  title: "Tournez la roue !",
  robots: { index: false },
};

export default async function PlayPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const ctx = await loadPlayContext(slug);

  if (!ctx.ok) {
    return (
      <PlayShell>
        <div className="play-in text-center px-8">
          <div className="text-5xl mb-6">🎡</div>
          <h1 className="text-2xl font-bold text-white mb-3">Oups</h1>
          <p className="text-zinc-400">{ctx.error}</p>
        </div>
      </PlayShell>
    );
  }

  // Seules les données publiques partent au client — jamais les poids.
  const segments = ctx.prizes.map((p) => ({
    id: p.id,
    label: p.label,
    color: p.color,
  }));

  // Actions d'engagement proposées avant de jouer (config par campagne).
  const engagementActions = enabledEngagementActions(ctx.campaign.engagement);

  // Personnalisation du commerçant (roue, police, fond, logo).
  const style = resolveWheelStyle(ctx.wheel.style);
  const fontHref = fontGoogleHref(style.font);

  return (
    <PlayShell background={playBackground(style)}>
      {fontHref && (
        // Charge uniquement la police sélectionnée par le commerçant.
        <link rel="stylesheet" href={fontHref} />
      )}
      {/* Compteur de scans (1 chargement navigateur = 1 scan) : hors du
          rendu serveur, sinon l'ISR ne compterait qu'une fois par 30 s. */}
      <ScanBeacon slug={slug} />
      <PlayExperience
        slug={slug}
        organizationName={ctx.organization.name}
        logoUrl={ctx.organization.logo_url}
        segments={segments}
        engagementActions={engagementActions}
        claimConfig={{
          collectEmail: ctx.campaign.collect_email,
          collectPhone: ctx.campaign.collect_phone,
          codeTtlSeconds: ctx.campaign.code_ttl_seconds,
        }}
        style={style}
      />
    </PlayShell>
  );
}

function PlayShell({
  children,
  background = "radial-gradient(circle at 50% -10%, #2e1065, #0c0118 60%, #000)",
}: {
  children: React.ReactNode;
  background?: string;
}) {
  return (
    <div
      className="fixed inset-0 flex items-center justify-center overflow-y-auto"
      style={{ background }}
    >
      {children}
    </div>
  );
}
