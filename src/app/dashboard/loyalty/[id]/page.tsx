import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getUserAndOrg } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { hasLoyaltyAccess } from "@/lib/subscription";
import { Card } from "@/components/ui/card";
import {
  LoyaltyMilestonesEditor,
  LoyaltySettings,
  LoyaltyStatusControls,
  type WheelOption,
} from "@/components/dashboard/loyalty-editor";
import { LoyaltyStatusBadge } from "@/components/dashboard/loyalty-status";
import type { LoyaltyMilestone, LoyaltyProgram } from "@/types/database";

export const metadata: Metadata = { title: "Programme de fidélité" };

interface WheelRow {
  id: string;
  name: string;
}

interface PrizeRow {
  wheel_id: string;
  label: string;
  is_losing: boolean;
  stock: number | null;
  weight: number;
}

/**
 * Roues + état de leurs lots, tel que l'éditeur de paliers en a besoin.
 *
 * Miroir EXACT du filtre de tirage de `consume_loyalty_spin_grant`
 * (20260725200000) : `is_active and weight > 0 and (is_losing or stock > 0)`.
 * Un lot non perdant laissé « vide = illimité » est donc hors tirage pour un
 * tour offert — c'est ce que l'avertissement annonce au commerçant.
 */
function toWheelOptions(wheels: WheelRow[], prizes: PrizeRow[]): WheelOption[] {
  const byWheel = new Map<string, PrizeRow[]>();
  for (const prize of prizes) {
    const list = byWheel.get(prize.wheel_id) ?? [];
    list.push(prize);
    byWheel.set(prize.wheel_id, list);
  }

  return wheels.map((w) => {
    const list = byWheel.get(w.id) ?? [];
    const drawn = list.filter((prize) => prize.weight > 0);
    return {
      id: w.id,
      name: w.name,
      unlimitedPrizes: drawn
        .filter((prize) => !prize.is_losing && prize.stock === null)
        .map((prize) => prize.label),
      hasDrawablePrize: drawn.some(
        (prize) => prize.is_losing || (prize.stock ?? 0) > 0,
      ),
    };
  });
}

export default async function LoyaltyDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { organization, role } = await getUserAndOrg();
  if (!organization || !hasLoyaltyAccess(organization)) notFound();
  const supabase = await createClient();
  const canViewStats = role === "owner";

  const [
    { data: program },
    { data: milestoneRows },
    { data: wheelRows },
    { data: prizeRows },
  ] = await Promise.all([
    supabase
      .from("loyalty_programs")
      .select(
        "id, organization_id, name, status, validation_mode, rotating_period_seconds, min_stamp_interval_seconds, silver_threshold, gold_threshold, created_at",
      )
      .eq("id", id)
      .eq("organization_id", organization.id)
      .maybeSingle(),
    supabase
      .from("loyalty_milestones")
      .select("*")
      .eq("program_id", id)
      .eq("organization_id", organization.id)
      .order("visit_count", { ascending: true }),
    supabase
      .from("wheels")
      .select("id, name")
      .eq("organization_id", organization.id)
      .order("created_at", { ascending: true }),
    // Lots actifs de l'organisation : l'éditeur avertit quand la roue ciblée
    // par un palier « tour offert » porte des lots à stock illimité — un tour
    // offert ne les tire jamais (migration 20260725200000).
    supabase
      .from("prizes")
      .select("wheel_id, label, is_losing, stock, weight")
      .eq("organization_id", organization.id)
      .eq("is_active", true),
  ]);

  if (!program) notFound();
  const p = program as LoyaltyProgram;
  const milestones = (milestoneRows ?? []) as LoyaltyMilestone[];
  const wheels = toWheelOptions(wheelRows ?? [], prizeRows ?? []);

  // Stats agrégées (owner) — org-scopées, honorées par la RLS « member select ».
  let passports = 0;
  let rewardsEarned = 0;
  let rewardsRedeemed = 0;
  if (canViewStats) {
    const [{ count: memberCount }, { count: earnedCount }, { count: redeemedCount }] =
      await Promise.all([
        supabase
          .from("loyalty_members")
          .select("id", { count: "exact", head: true })
          .eq("program_id", id)
          .eq("organization_id", organization.id),
        supabase
          .from("loyalty_rewards")
          .select("id", { count: "exact", head: true })
          .eq("program_id", id)
          .eq("organization_id", organization.id),
        supabase
          .from("loyalty_rewards")
          .select("id", { count: "exact", head: true })
          .eq("program_id", id)
          .eq("organization_id", organization.id)
          .not("redeemed_at", "is", null),
      ]);
    passports = memberCount ?? 0;
    rewardsEarned = earnedCount ?? 0;
    rewardsRedeemed = redeemedCount ?? 0;
  }

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/dashboard/loyalty"
          className="text-sm text-zinc-500 hover:text-k-ink"
        >
          ← Fidélité
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <span className="text-3xl" aria-hidden>
            🎟️
          </span>
          <h1 className="text-2xl font-bold">{p.name}</h1>
          <LoyaltyStatusBadge status={p.status} />
        </div>
      </div>

      {canViewStats && (
        <Card>
          <h2 className="font-semibold mb-4">En un coup d&apos;œil</h2>
          <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <Stat label="Paliers" value={milestones.length} />
            <Stat label="Passeports" value={passports} />
            <Stat label="Récompenses" value={rewardsEarned} />
            <Stat label="Lots remis" value={rewardsRedeemed} />
          </dl>
        </Card>
      )}

      <LoyaltyStatusControls program={p} milestoneCount={milestones.length} />

      {p.validation_mode === "rotating_code" && (
        <Card className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-semibold mb-1">Écran comptoir</h2>
            <p className="text-sm text-zinc-500">
              Affichez le code tournant face aux clients pour qu&apos;ils valident
              leur visite.
            </p>
          </div>
          <Link
            href={`/dashboard/loyalty/${p.id}/comptoir`}
            className="k-btn-sm inline-flex items-center gap-2 rounded-xl border-2 border-k-ink bg-k-yellow px-4 py-2.5 text-sm font-bold text-k-ink"
          >
            Ouvrir l&apos;écran comptoir →
          </Link>
        </Card>
      )}

      <LoyaltyMilestonesEditor
        programId={p.id}
        milestones={milestones}
        wheels={wheels}
      />

      <LoyaltySettings program={p} />
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
