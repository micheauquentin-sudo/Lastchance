import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { loadLoyaltyContext } from "@/lib/loyalty-context";
import {
  LoyaltyPassport,
  type LoyaltySpinBundle,
} from "@/components/loyalty/loyalty-passport";
import type { WheelSegment } from "@/components/wheel/wheel-svg";
import { SkipLink } from "@/components/ui/skip-link";

/**
 * Page publique du passeport de fidélité — DA « Kermesse », même famille
 * visuelle que la chasse au trésor. Le client arrive ici en scannant le QR
 * du commerce (rotating_code) ou l'affiche du programme (staff).
 *
 * Rendu dynamique : le contenu dépend du cookie joueur (passeport personnel).
 * Aucune écriture au chargement — le tampon se fait au POST du bouton.
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Passeport de fidélité",
  robots: { index: false },
};

/**
 * Précharge les roues cibles des paliers « spin » (segments publics + config
 * de collecte réelle de la campagne), pour que le tour offert puisse animer
 * la roue et brancher le claimToken sur claimPrize. Ordre des segments
 * aligné sur le tirage serveur (position, puis created_at).
 */
async function loadSpinWheels(
  ctx: Extract<Awaited<ReturnType<typeof loadLoyaltyContext>>, { ok: true }>,
): Promise<Record<string, LoyaltySpinBundle>> {
  const spinMilestones = ctx.milestones.filter(
    (m) => m.rewardType === "spin" && m.targetWheelId,
  );
  const wheelIds = [...new Set(spinMilestones.map((m) => m.targetWheelId as string))];
  if (wheelIds.length === 0) return {};

  const orgId = ctx.organization.id;
  const [{ data: prizeRows }, { data: wheelRows }] = await Promise.all([
    ctx.admin
      .from("prizes")
      .select("id, label, color, position, created_at, wheel_id")
      .in("wheel_id", wheelIds)
      .eq("is_active", true)
      .eq("organization_id", orgId),
    ctx.admin
      .from("wheels")
      .select("id, campaign_id")
      .in("id", wheelIds)
      .eq("organization_id", orgId),
  ]);

  interface PrizeRow {
    id: string;
    label: string;
    color: string;
    position: number;
    created_at: string;
    wheel_id: string;
  }
  interface CampaignRow {
    id: string;
    collect_email: boolean;
    collect_phone: boolean;
    code_ttl_seconds: number | null;
  }

  const campaignIds = [
    ...new Set((wheelRows ?? []).map((w) => w.campaign_id as string)),
  ];
  const { data: campaignRows } = campaignIds.length
    ? await ctx.admin
        .from("campaigns")
        .select("id, collect_email, collect_phone, code_ttl_seconds")
        .in("id", campaignIds)
        .eq("organization_id", orgId)
    : { data: [] };

  const campaignById = new Map(
    ((campaignRows ?? []) as CampaignRow[]).map((c) => [c.id, c]),
  );
  const wheelCampaign = new Map(
    (wheelRows ?? []).map((w) => [w.id as string, w.campaign_id as string]),
  );

  // Segments par roue : filtrés actifs (requête) puis triés comme le tirage
  // serveur (position, puis created_at) — l'index doit coïncider avec prizeIndex.
  const prizeByWheel = new Map<string, PrizeRow[]>();
  for (const row of (prizeRows ?? []) as PrizeRow[]) {
    const list = prizeByWheel.get(row.wheel_id) ?? [];
    list.push(row);
    prizeByWheel.set(row.wheel_id, list);
  }
  const segByWheel = new Map<string, WheelSegment[]>();
  for (const [wid, list] of prizeByWheel) {
    list.sort(
      (a, b) => a.position - b.position || a.created_at.localeCompare(b.created_at),
    );
    segByWheel.set(
      wid,
      list.map((p) => ({ id: p.id, label: p.label, color: p.color })),
    );
  }

  const bundles: Record<string, LoyaltySpinBundle> = {};
  for (const m of spinMilestones) {
    const wid = m.targetWheelId as string;
    const campaignId = wheelCampaign.get(wid);
    const campaign = campaignId ? campaignById.get(campaignId) : null;
    bundles[m.id] = {
      wheelId: wid,
      segments: segByWheel.get(wid) ?? [],
      claimConfig: {
        collectEmail: Boolean(campaign?.collect_email),
        collectPhone: Boolean(campaign?.collect_phone),
        codeTtlSeconds: campaign?.code_ttl_seconds ?? null,
      },
    };
  }
  return bundles;
}

export default async function LoyaltyPassportPage({
  params,
}: {
  params: Promise<{ programId: string }>;
}) {
  const { programId } = await params;
  const ctx = await loadLoyaltyContext(programId);

  // Réponse générique unique (404) : aucun oracle sur le motif d'invalidité
  // (programme inconnu, archivé, module coupé, abonnement inactif…).
  if (!ctx.ok) notFound();

  const spinWheels = await loadSpinWheels(ctx);

  return (
    <Shell>
      <LoyaltyPassport
        programId={ctx.program.id}
        organizationName={ctx.organization.name}
        logoUrl={ctx.organization.logo_url}
        programName={ctx.program.name}
        validationMode={ctx.program.validation_mode}
        silverThreshold={ctx.program.silver_threshold}
        goldThreshold={ctx.program.gold_threshold}
        milestones={ctx.milestones}
        passport={ctx.passport}
        spinWheels={spinWheels}
      />

      <footer className="mx-auto max-w-md px-4 pb-10 text-center text-xs text-k-body">
        Programme de fidélité proposé par {ctx.organization.name} · propulsé par{" "}
        <Link
          href="/?utm_source=loyalty&utm_medium=footer"
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
