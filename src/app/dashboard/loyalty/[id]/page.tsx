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

  const [{ data: program }, { data: milestoneRows }, { data: wheelRows }] =
    await Promise.all([
      supabase
        .from("loyalty_programs")
        .select("*")
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
    ]);

  if (!program) notFound();
  const p = program as LoyaltyProgram;
  const milestones = (milestoneRows ?? []) as LoyaltyMilestone[];
  const wheels = (wheelRows ?? []) as WheelOption[];

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
