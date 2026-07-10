import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getUserAndOrg } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { PrizeEditor } from "@/components/dashboard/prize-editor";
import { WheelSettings } from "@/components/dashboard/wheel-settings";
import { WheelStyleEditor } from "@/components/dashboard/wheel-style-editor";
import type { Prize, Wheel } from "@/types/database";

export const metadata: Metadata = { title: "Configuration de la roue" };

export default async function WheelConfigPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { organization } = await getUserAndOrg();
  const supabase = await createClient();

  const { data: wheel } = await supabase
    .from("wheels")
    .select("*")
    .eq("campaign_id", id)
    .eq("organization_id", organization!.id)
    .maybeSingle();

  if (!wheel) notFound();

  const { data: prizes } = await supabase
    .from("prizes")
    .select("*")
    .eq("wheel_id", wheel.id)
    .order("position")
    .order("created_at");

  const w = wheel as Wheel;
  const allPrizes = (prizes ?? []) as Prize[];
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
      <h1 className="text-2xl font-bold mt-3 mb-8">Configuration de la roue</h1>

      <div className="grid gap-6 lg:grid-cols-[380px_1fr] items-start">
        <div className="space-y-4">
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

          <WheelSettings wheel={w} />
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
