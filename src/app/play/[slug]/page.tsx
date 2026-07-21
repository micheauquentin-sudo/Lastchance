import type { Metadata } from "next";
import { loadPlayContext } from "@/lib/play-context";
import { fontGoogleHref } from "@/lib/fonts";
import { playSurface, resolveWheelStyle } from "@/lib/wheel-style";
import { KermesseStripe, playText } from "@/components/wheel/play-theme";
import { PlayExperience } from "@/components/wheel/play-experience";
import { ScratchExperience } from "@/components/wheel/scratch-experience";
import { ScanBeacon } from "@/components/wheel/scan-beacon";

/**
 * ISR : le HTML d'un slug est identique pour tous les visiteurs — le
 * re-rendre à chaque scan saturait le CPU SSR (~55 req/s par instance,
 * mesuré). Mis en cache 30 s ; les modifications du commerçant (lots,
 * style, statut, logo) purgent en plus le cache immédiatement via
 * revalidatePlaySlugs() dans les server actions. Le spin lui-même
 * revalide tout côté server action au moment de jouer — aucune décision
 * d'autorité ne repose sur ce HTML. Le comptage de scans, lui, reste à
 * l'unité via <ScanBeacon /> (POST /api/scan à chaque chargement).
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
    // L'écran de statut (pause, pas commencée, terminée…) garde
    // l'ambiance du commerçant quand la roue est connue — un joueur
    // d'une campagne kermesse ne doit jamais retomber sur le thème nuit.
    const errorSurface = playSurface(resolveWheelStyle(ctx.wheelStyle));
    return (
      <PlayShell background={errorSurface.background} kermesse={errorSurface.kermesse}>
        <div className="play-in text-center px-8">
          <div className="text-5xl mb-6">🎡</div>
          <h1 className={`text-2xl font-bold mb-3 ${playText.title(errorSurface.kermesse)}`}>
            Oups
          </h1>
          <p className={playText.body(errorSurface.kermesse)}>{ctx.error}</p>
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

  // Personnalisation du commerçant (roue, police, fond, logo).
  const style = resolveWheelStyle(ctx.wheel.style);
  const fontHref = fontGoogleHref(style.font);
  const surface = playSurface(style);

  return (
    <PlayShell background={surface.background} kermesse={surface.kermesse}>
      {fontHref && (
        // Charge uniquement la police sélectionnée par le commerçant.
        <link rel="stylesheet" href={fontHref} />
      )}
      {/* Compteur de scans (1 chargement navigateur = 1 scan) : hors du
          rendu serveur, sinon l'ISR ne compterait qu'une fois par 30 s. */}
      <ScanBeacon slug={slug} />
      {ctx.wheel.game_type === "scratch" ? (
        <ScratchExperience
          slug={slug}
          organizationName={ctx.organization.name}
          logoUrl={ctx.organization.logo_url}
          claimConfig={{
            collectEmail: ctx.campaign.collect_email,
            collectPhone: ctx.campaign.collect_phone,
            codeTtlSeconds: ctx.campaign.code_ttl_seconds,
          }}
          style={style}
        />
      ) : (
        <PlayExperience
          slug={slug}
          organizationName={ctx.organization.name}
          logoUrl={ctx.organization.logo_url}
          segments={segments}
          claimConfig={{
            collectEmail: ctx.campaign.collect_email,
            collectPhone: ctx.campaign.collect_phone,
            codeTtlSeconds: ctx.campaign.code_ttl_seconds,
          }}
          style={style}
        />
      )}
    </PlayShell>
  );
}

function PlayShell({
  children,
  background = "radial-gradient(circle at 50% -10%, #2e1065, #0c0118 60%, #000)",
  kermesse = false,
}: {
  children: React.ReactNode;
  background?: string;
  /** Thème « kermesse » : crème + bandeau rayé, même univers que le site. */
  kermesse?: boolean;
}) {
  if (kermesse) {
    return (
      <div className="fixed inset-0 overflow-y-auto overscroll-contain bg-k-bg">
        <KermesseStripe className="sticky top-0 z-10 h-3" />
        <div className="flex min-h-[calc(100dvh-0.75rem)] items-start justify-center sm:items-center">
          {children}
        </div>
      </div>
    );
  }
  return (
    <div
      className="fixed inset-0 flex min-h-dvh items-start justify-center overflow-y-auto overscroll-contain sm:items-center"
      style={{ background }}
    >
      {children}
    </div>
  );
}
