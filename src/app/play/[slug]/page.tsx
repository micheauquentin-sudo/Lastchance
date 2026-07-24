import type { Metadata } from "next";
import { loadPlayContext, type PlayContext } from "@/lib/play-context";
import { fontGoogleHref } from "@/lib/fonts";
import { hasReferralAccess } from "@/lib/referral-context";
import { playSurface, resolveWheelStyle } from "@/lib/wheel-style";
import { KermesseStripe, playText } from "@/components/wheel/play-theme";
import { PlayExperience } from "@/components/wheel/play-experience";
import type { PlayReferral } from "@/components/wheel/referral-panel";
import { ScratchExperience } from "@/components/wheel/scratch-experience";
import { FlipCardExperience } from "@/components/wheel/games/flip-card-experience";
import { ScanBeacon } from "@/components/wheel/scan-beacon";
import { SkipLink } from "@/components/ui/skip-link";
import type { Organization } from "@/types/database";

/** Client service_role tel qu'exposé par un contexte de jeu valide. */
type PlayAdminClient = Extract<PlayContext, { ok: true }>["admin"];

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

  // Aiguillage par mécanique de jeu. Les jeux de révélation autonomes
  // (grattage, carte retournée) affichent leur propre parcours ; les autres
  // game_types de révélation pas encore livrés (cups, slot, memory, chest,
  // dice, draw_card) retombent provisoirement sur la roue — jamais de plantage.
  const gameType = ctx.wheel.game_type;
  const isScratch = gameType === "scratch";
  const isFlipCard = gameType === "flip_card";

  // Parrainage ludique : prop MINIMAL et PUBLIC dérivé du programme de la
  // campagne (service role). Roue uniquement — les jeux de révélation
  // autonomes (grattage, carte retournée) n'embarquent pas le parrainage.
  const referral =
    isScratch || isFlipCard
      ? null
      : await loadPlayReferral(ctx.admin, ctx.campaign.id);

  return (
    <PlayShell background={surface.background} kermesse={surface.kermesse}>
      {fontHref && (
        // Charge uniquement la police sélectionnée par le commerçant.
        <link rel="stylesheet" href={fontHref} />
      )}
      {/* Compteur de scans (1 chargement navigateur = 1 scan) : hors du
          rendu serveur, sinon l'ISR ne compterait qu'une fois par 30 s. */}
      <ScanBeacon slug={slug} />
      {isScratch ? (
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
      ) : isFlipCard ? (
        <FlipCardExperience
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
        // wheel + jeux de révélation pas encore livrés (cups, slot, memory,
        // chest, dice, draw_card) → repli sur la roue jusqu'à leur livraison.
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
          referral={referral}
        />
      )}
    </PlayShell>
  );
}

/**
 * Dérive le prop `referral` MINIMAL et PUBLIC pour la roue : uniquement les
 * libellés/natures des 3 versements + le seuil du coffre — JAMAIS de stock ni de
 * compteur. `enabled` n'est vrai que si le module est réellement actif (addon +
 * abonnement via hasReferralAccess) ET le programme activé : sinon les actions de
 * parrainage renverraient un état neutre, autant ne pas afficher l'UI. Service
 * role (la page /play est anonyme), une lecture indexée sur le chemin ISR.
 */
async function loadPlayReferral(
  admin: PlayAdminClient,
  campaignId: string,
): Promise<PlayReferral | null> {
  const { data } = await admin
    .from("referral_programs")
    .select(
      "enabled, chest_threshold, sponsor_reward_kind, sponsor_reward_label, filleul_reward_kind, filleul_reward_label, chest_reward_kind, chest_reward_label, organizations(addon_referral, subscription_status, trial_ends_at, past_due_since, comp_access, comp_access_until)",
    )
    .eq("campaign_id", campaignId)
    .maybeSingle();

  const row = data as unknown as ReferralProgramProbe | null;
  if (!row || !row.enabled) return null;

  const org = Array.isArray(row.organizations)
    ? row.organizations[0]
    : row.organizations;
  if (!org || !hasReferralAccess(org)) return null;

  return {
    enabled: true,
    config: {
      sponsorRewardKind: row.sponsor_reward_kind,
      sponsorRewardLabel: row.sponsor_reward_label,
      filleulRewardKind: row.filleul_reward_kind,
      filleulRewardLabel: row.filleul_reward_label,
      chestRewardKind: row.chest_reward_kind,
      chestRewardLabel: row.chest_reward_label,
      chestThreshold: row.chest_threshold,
    },
  };
}

/** Forme lue de referral_programs (colonnes publiques + org pour le gate d'accès). */
interface ReferralProgramProbe {
  enabled: boolean;
  chest_threshold: number;
  sponsor_reward_kind: PlayReferral["config"]["sponsorRewardKind"];
  sponsor_reward_label: string;
  filleul_reward_kind: PlayReferral["config"]["filleulRewardKind"];
  filleul_reward_label: string;
  chest_reward_kind: PlayReferral["config"]["chestRewardKind"];
  chest_reward_label: string;
  organizations:
    | ReferralOrgProbe
    | ReferralOrgProbe[]
    | null;
}

type ReferralOrgProbe = Pick<
  Organization,
  | "addon_referral"
  | "subscription_status"
  | "trial_ends_at"
  | "past_due_since"
  | "comp_access"
  | "comp_access_until"
>;

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
        <SkipLink />
        <KermesseStripe className="sticky top-0 z-10 h-3" />
        <main
          id="contenu"
          tabIndex={-1}
          className="flex min-h-[calc(100dvh-0.75rem)] items-start justify-center outline-none sm:items-center"
        >
          {children}
        </main>
      </div>
    );
  }
  return (
    <div
      className="fixed inset-0 overflow-y-auto overscroll-contain"
      style={{ background }}
    >
      <SkipLink />
      <main
        id="contenu"
        tabIndex={-1}
        className="flex min-h-dvh items-start justify-center outline-none sm:items-center"
      >
        {children}
      </main>
    </div>
  );
}
