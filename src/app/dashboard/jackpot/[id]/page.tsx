import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getUserAndOrg } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { hasJackpotAccess } from "@/lib/subscription";
import { Card } from "@/components/ui/card";
import {
  JackpotSettings,
  JackpotStatusControls,
} from "@/components/dashboard/jackpot-editor";
import { JackpotStatusBadge } from "@/components/dashboard/jackpot-status";
import type { JackpotCampaign } from "@/types/database";

export const metadata: Metadata = { title: "Jackpot collectif" };

/** Colonnes du merchant (rotating_secret exclu du grant, jamais lu ici). */
const CAMPAIGN_COLUMNS =
  "id, organization_id, name, status, public_slug, validation_mode, rotating_period_seconds, min_participation_interval_seconds, draw_mode, threshold, win_probability, draw_at, reward_label, reward_details, reward_stock, reward_claimed_count, display_base_cents, display_increment_cents, merchant_content, current_count, cycle, created_at";

export default async function JackpotDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { organization, role } = await getUserAndOrg();
  if (!organization || !hasJackpotAccess(organization)) notFound();
  const supabase = await createClient();
  const canViewStats = role === "owner";

  const { data: campaign } = await supabase
    .from("jackpot_campaigns")
    .select(CAMPAIGN_COLUMNS)
    .eq("id", id)
    .eq("organization_id", organization.id)
    .maybeSingle();

  if (!campaign) notFound();
  const c = campaign as unknown as JackpotCampaign;

  // Nombre de lots déjà remis (owner) — org-scopé, honoré par la RLS.
  let redeemed = 0;
  if (canViewStats) {
    const { count } = await supabase
      .from("jackpot_wins")
      .select("id", { count: "exact", head: true })
      .eq("campaign_id", id)
      .eq("organization_id", organization.id)
      .not("redeemed_at", "is", null);
    redeemed = count ?? 0;
  }

  const publicPath = `/jackpot/${c.public_slug ?? c.id}`;

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/dashboard/jackpot"
          className="text-sm text-zinc-500 hover:text-k-ink"
        >
          ← Jackpot
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <span className="text-3xl" aria-hidden>
            🎰
          </span>
          <h1 className="text-2xl font-bold">{c.name}</h1>
          <JackpotStatusBadge status={c.status} />
        </div>
      </div>

      {canViewStats && (
        <Card>
          <h2 className="font-semibold mb-4">En un coup d&apos;œil</h2>
          <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <Stat label="Objectif" value={c.threshold} />
            <Stat label="Participations (cycle)" value={c.current_count} />
            <Stat label={`Gagnants / ${c.reward_stock}`} value={c.reward_claimed_count} />
            <Stat label="Lots remis" value={redeemed} />
          </dl>
        </Card>
      )}

      <JackpotStatusControls campaign={c} />

      {c.status === "active" && (
        <Card className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <h2 className="font-semibold mb-1">Page publique</h2>
            <p className="truncate text-sm text-zinc-500">
              À mettre dans le QR code du commerce.{" "}
              <span className="font-mono text-k-ink">{publicPath}</span>
            </p>
          </div>
          <Link
            href={publicPath}
            target="_blank"
            className="k-btn-sm inline-flex items-center gap-2 rounded-xl border-2 border-k-ink bg-white px-4 py-2.5 text-sm font-bold text-k-ink hover:bg-k-yellow/30"
          >
            Ouvrir la page →
          </Link>
        </Card>
      )}

      <Card className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-semibold mb-1">Écran comptoir</h2>
          <p className="text-sm text-zinc-500">
            Affichez la jauge géante face aux clients — et le code tournant en
            mode « Code au comptoir ».
          </p>
        </div>
        <Link
          href={`/dashboard/jackpot/${c.id}/comptoir`}
          className="k-btn-sm inline-flex items-center gap-2 rounded-xl border-2 border-k-ink bg-k-yellow px-4 py-2.5 text-sm font-bold text-k-ink"
        >
          Ouvrir l&apos;écran comptoir →
        </Link>
      </Card>

      <JackpotSettings campaign={c} />
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl bg-zinc-50 px-3 py-2">
      <dt className="text-xs uppercase tracking-wide text-zinc-500">{label}</dt>
      <dd className="mt-1 text-2xl font-black tabular-nums text-k-ink">{value}</dd>
    </div>
  );
}
