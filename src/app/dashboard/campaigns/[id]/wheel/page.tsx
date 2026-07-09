import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireOrg } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/card";
import { WheelPointer, WheelSvg } from "@/components/wheel/wheel-svg";
import { PrizeEditor } from "@/components/dashboard/prize-editor";
import { WheelSettings } from "@/components/dashboard/wheel-settings";

export const metadata: Metadata = { title: "Configuration de la roue" };

export default async function WheelConfigPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { organization } = await requireOrg();
  const supabase = await createClient();

  const { data: wheel } = await supabase
    .from("wheels")
    .select("*")
    .eq("campaign_id", id)
    .eq("organization_id", organization.id)
    .maybeSingle();

  if (!wheel) notFound();

  const { data: prizes } = await supabase
    .from("prizes")
    .select("*")
    .eq("wheel_id", wheel.id)
    .order("position")
    .order("created_at");

  const w = wheel;
  const allPrizes = prizes ?? [];
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

      <div className="grid gap-6 lg:grid-cols-[340px_1fr]">
        <div className="space-y-4">
          <Card className="bg-zinc-950 border-zinc-800">
            <p className="text-xs font-semibold uppercase tracking-widest text-zinc-400 mb-4">
              Aperçu
            </p>
            <div className="relative mx-auto max-w-70">
              <WheelPointer />
              <WheelSvg
                segments={activePrizes.map((p) => ({
                  id: p.id,
                  label: p.label,
                  color: p.color,
                }))}
              />
            </div>
            <p className="text-xs text-zinc-500 mt-4 text-center">
              Segments visuels égaux — les probabilités restent privées.
            </p>
          </Card>

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
