import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getUserAndOrg } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { PrizeEditor } from "@/components/dashboard/prize-editor";
import { WheelPreviewTest } from "@/components/dashboard/wheel-preview-test";
import { WheelScheduleEditor } from "@/components/dashboard/wheel-schedule-editor";
import { WheelSettings } from "@/components/dashboard/wheel-settings";
import { WheelStyleEditor } from "@/components/dashboard/wheel-style-editor";
import type { Prize, Wheel } from "@/types/database";

export const metadata: Metadata = { title: "Configuration du jeu" };

export default async function WheelConfigPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ wheel?: string }>;
}) {
  const { id } = await params;
  const { wheel: wheelParam } = await searchParams;
  const { organization } = await getUserAndOrg();
  const supabase = await createClient();

  // Multi-roues : on liste les roues de la campagne (triées par
  // position) et on configure celle demandée (?wheel=) sinon la
  // première. Lots embarqués via la FK prizes→wheels.
  const { data: wheelsData } = await supabase
    .from("wheels")
    .select("*, prizes!prizes_wheel_id_fkey(*)")
    .eq("campaign_id", id)
    .eq("organization_id", organization!.id)
    .order("position", { ascending: true })
    .order("created_at", { ascending: true });

  const wheels = (wheelsData ?? []) as (Wheel & { prizes: Prize[] })[];
  if (wheels.length === 0) notFound();

  const selected =
    wheels.find((wh) => wh.id === wheelParam) ?? wheels[0];
  const { prizes: embeddedPrizes, ...w } = selected;
  const allPrizes = (embeddedPrizes ?? []).sort(
    (a, b) =>
      a.position - b.position || a.created_at.localeCompare(b.created_at),
  );
  const activePrizes = allPrizes.filter((p) => p.is_active);
  const totalWeight = activePrizes.reduce((a, p) => a + p.weight, 0);

  return (
    <div>
      <Link
        href={`/dashboard/campaigns/${id}`}
        className="text-sm text-zinc-500 hover:text-zinc-900"
      >
        ← Campagne
      </Link>
      <h1 className="text-2xl font-bold mt-3 mb-6">Configuration du jeu</h1>

      {wheels.length > 1 && (
        <div className="mb-6 flex flex-wrap gap-2">
          {wheels.map((wh) => (
            <Link
              key={wh.id}
              href={`/dashboard/campaigns/${id}/wheel?wheel=${wh.id}`}
              className={`rounded-lg px-3 py-1.5 text-sm font-semibold transition-colors ${
                wh.id === w.id
                  ? "bg-zinc-900 text-white"
                  : "border border-zinc-300 text-zinc-700 hover:bg-zinc-50"
              }`}
            >
              {wh.name}
            </Link>
          ))}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[380px_1fr] items-start">
        <div className="space-y-4">
          <WheelSettings wheel={w} />
          <WheelPreviewTest wheelId={w.id} />
          <WheelScheduleEditor wheel={w} />

          {w.game_type === "scratch" ? (
            <p className="rounded-2xl border border-zinc-200 bg-white p-4 text-sm text-zinc-500">
              La carte à gratter reprend les couleurs du bouton de jeu
              (réglables dans les styles ci-dessous une fois repassé en
              mode « Roue »). Un habillage dédié à la carte arrive
              prochainement.
            </p>
          ) : (
            <WheelStyleEditor
              wheelId={w.id}
              initialStyle={w.style}
              organizationName={organization!.name}
              segments={activePrizes.map((p) => ({
                id: p.id,
                label: p.label,
                color: p.color,
              }))}
            />
          )}
        </div>

        <PrizeEditor
          wheelId={w.id}
          prizes={allPrizes}
          totalWeight={totalWeight}
        />
      </div>
    </div>
  );
}
