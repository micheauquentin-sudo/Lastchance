import { cache } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import {
  loadLoyaltyContext,
  loyaltyReferralCookieName,
} from "@/lib/loyalty-context";
import {
  LoyaltyPassport,
  type LoyaltySpinAvailability,
  type LoyaltySpinBundle,
} from "@/components/loyalty/loyalty-passport";
import type { WheelSegment } from "@/components/wheel/wheel-svg";
import { wheelMatchesNow } from "@/lib/wheel-schedule";
import { PlayerPageShell } from "@/components/ui/player-page-shell";
import { resolveLoyaltyStyle } from "@/lib/loyalty-style";
import { PageOpenBeacon } from "@/components/page-open-beacon";

/**
 * Page publique du passeport de fidélité — DA « Kermesse », même famille
 * visuelle que la chasse au trésor. Le client arrive ici en scannant le QR
 * du commerce (rotating_code) ou l'affiche du programme (staff).
 *
 * Rendu dynamique : le contenu dépend du cookie joueur (passeport personnel).
 * Aucune écriture au chargement — le tampon se fait au POST du bouton.
 */
export const dynamic = "force-dynamic";

/** Un seul chargement par requête, partagé entre generateMetadata et la page. */
const loadContext = cache((programId: string) => loadLoyaltyContext(programId));

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
  params: Promise<{ programId: string }>;
}): Promise<Metadata> {
  const { programId } = await params;
  const ctx = await loadContext(programId);
  if (!ctx.ok) notFound();
  return { title: "Passeport de fidélité", robots: { index: false } };
}

/**
 * Précharge les roues cibles des paliers « spin » (segments publics + config
 * de collecte réelle de la campagne), pour que le tour offert puisse animer
 * la roue et brancher le claimToken sur claimPrize. Ordre des segments
 * aligné sur le tirage serveur (position, puis created_at).
 *
 * Chaque bundle porte aussi sa JOUABILITÉ (`availability`), miroir applicatif
 * des gardes de `consume_loyalty_spin_grant` (20260725200000) : campagne
 * active + dans ses dates, créneau horaire de la roue, et au moins un lot
 * tirable (les lots à stock illimité sont exclus du tirage d'un tour offert).
 * Ces deux refus laissent le grant INTACT côté base : les annoncer sur le
 * passeport évite au joueur de lancer une roue qui ne peut rien lui donner, et
 * évite surtout de lui faire croire qu'il vient de perdre son tour.
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
      .select(
        "id, label, color, position, created_at, wheel_id, weight, is_losing, stock",
      )
      .in("wheel_id", wheelIds)
      .eq("is_active", true)
      .eq("organization_id", orgId),
    ctx.admin
      .from("wheels")
      .select(
        "id, campaign_id, schedule_days, schedule_start_hour, schedule_end_hour",
      )
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
    weight: number;
    is_losing: boolean;
    stock: number | null;
  }
  interface WheelRow {
    id: string;
    campaign_id: string;
    schedule_days: number[] | null;
    schedule_start_hour: number | null;
    schedule_end_hour: number | null;
  }
  interface CampaignRow {
    id: string;
    collect_email: boolean;
    collect_phone: boolean;
    code_ttl_seconds: number | null;
    status: string;
    starts_at: string | null;
    ends_at: string | null;
  }

  const wheels = (wheelRows ?? []) as WheelRow[];
  const campaignIds = [...new Set(wheels.map((w) => w.campaign_id))];
  const { data: campaignRows } = campaignIds.length
    ? await ctx.admin
        .from("campaigns")
        .select(
          "id, collect_email, collect_phone, code_ttl_seconds, status, starts_at, ends_at",
        )
        .in("id", campaignIds)
        .eq("organization_id", orgId)
    : { data: [] };

  const campaignById = new Map(
    ((campaignRows ?? []) as CampaignRow[]).map((c) => [c.id, c]),
  );
  const wheelById = new Map(wheels.map((w) => [w.id, w]));

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

  const now = new Date();
  const timeZone = ctx.organization.timezone || "UTC";

  /** Miroir des bornes 2 et 3 de consume_loyalty_spin_grant. */
  function availabilityOf(wheelId: string): LoyaltySpinAvailability {
    const wheel = wheelById.get(wheelId);
    const campaign = wheel ? campaignById.get(wheel.campaign_id) : null;
    if (!wheel || !campaign) return "closed";

    const started = !campaign.starts_at || new Date(campaign.starts_at) <= now;
    const ended = campaign.ends_at ? new Date(campaign.ends_at) < now : false;
    if (campaign.status !== "active" || !started || ended) return "closed";

    const inWindow = wheelMatchesNow(
      {
        id: wheel.id,
        position: 0,
        created_at: "",
        schedule_days: wheel.schedule_days,
        schedule_start_hour: wheel.schedule_start_hour,
        schedule_end_hour: wheel.schedule_end_hour,
      },
      now,
      timeZone,
    );
    if (!inWindow) return "closed";

    // `is_active and weight > 0 and (is_losing or stock > 0)` : un lot non
    // perdant sans stock (illimité) n'est plus tirable par un tour offert.
    const drawable = (prizeByWheel.get(wheelId) ?? []).some(
      (p) => p.weight > 0 && (p.is_losing || (p.stock ?? 0) > 0),
    );
    return drawable ? "open" : "no_prize";
  }

  const bundles: Record<string, LoyaltySpinBundle> = {};
  for (const m of spinMilestones) {
    const wid = m.targetWheelId as string;
    const wheel = wheelById.get(wid);
    const campaign = wheel ? campaignById.get(wheel.campaign_id) : null;
    bundles[m.id] = {
      wheelId: wid,
      segments: segByWheel.get(wid) ?? [],
      claimConfig: {
        collectEmail: Boolean(campaign?.collect_email),
        collectPhone: Boolean(campaign?.collect_phone),
        codeTtlSeconds: campaign?.code_ttl_seconds ?? null,
      },
      availability: availabilityOf(wid),
    };
  }
  return bundles;
}

export default async function LoyaltyPassportPage({
  params,
  searchParams,
}: {
  params: Promise<{ programId: string }>;
  searchParams: Promise<{ parrain?: string | string[] }>;
}) {
  const { programId } = await params;
  const ctx = await loadContext(programId);

  // Réponse générique unique (404) : aucun oracle sur le motif d'invalidité
  // (programme inconnu, archivé, module coupé, abonnement inactif…).
  if (!ctx.ok) notFound();

  // ── LE LIEN DE PARRAINAGE (FID-5) ──
  //
  // Le code voyage dans l'URL du lien partagé. Il est passé TEL QUEL au
  // composant, sans normalisation ici : la seule autorité sur sa forme est
  // `loyaltyReferralCodeSchema`, côté server action. Valider deux fois, à deux
  // endroits, c'est se donner deux occasions de diverger.
  //
  // Un tableau (`?parrain=a&parrain=b`) est ramené à la première valeur — la
  // lecture la plus sûre d'une URL bricolée.
  const { parrain } = await searchParams;
  const codeParrainInvite =
    (Array.isArray(parrain) ? parrain[0] : parrain) ?? null;
  // Le cookie est `httpOnly` : seul le serveur peut dire s'il y a une
  // invitation en attente, et c'est ce booléen qui évite au client d'appeler
  // la server action de parrainage à chaque ouverture du passeport.
  const parrainageEnAttente = Boolean(
    (await cookies()).get(loyaltyReferralCookieName(programId))?.value,
  );

  const spinWheels = await loadSpinWheels(ctx);
  // HABILLAGE — schéma de LECTURE : un fond retiré du catalogue rend un
  // passeport SANS image, jamais une page en erreur (src/lib/loyalty-style.ts).
  const habillage = resolveLoyaltyStyle(ctx.program.style);

  return (
    // Le passeport est peint sur le crème du site, et le voile du fond suit
    // cette surface (`voile="creme"`, posé par le shell).
    <PlayerPageShell
      pageStyle={{ backgroundColor: "var(--color-k-bg)" }}
      fond={habillage.fond ?? null}
    >
      {/* Le passeport n'a pas de slug : son URL porte l'identifiant. */}
      <PageOpenBeacon module="loyalty" publicId={ctx.program.id} />
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
        jackpot={ctx.jackpot}
        spinWheels={spinWheels}
        commerce={ctx.commerce}
        timeZone={ctx.organization.timezone}
        referralEnabled={ctx.program.referral_enabled}
        codeParrainInvite={codeParrainInvite}
        parrainageEnAttente={parrainageEnAttente}
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
    </PlayerPageShell>
  );
}

