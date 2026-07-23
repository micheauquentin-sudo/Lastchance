import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getUserAndOrg } from "@/lib/auth";
import { getJackpotCounterCode } from "@/actions/jackpot";
import { createClient } from "@/lib/supabase/server";
import { hasJackpotAccess } from "@/lib/subscription";
import { JackpotCounterScreen } from "@/components/dashboard/jackpot-counter-screen";

export const metadata: Metadata = { title: "Écran comptoir — Jackpot" };

/** La jauge doit refléter l'état courant : jamais servie depuis un cache. */
export const dynamic = "force-dynamic";

/**
 * Écran comptoir du jackpot collectif — jauge géante temps réel, et code
 * tournant en mode rotating_code. Réservé au propriétaire / éditeur (même garde
 * que getJackpotCounterCode : le code courant vaut une participation).
 */
export default async function JackpotCounterPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { organization, role } = await getUserAndOrg();
  if (!organization || !hasJackpotAccess(organization)) notFound();
  if (role !== "owner" && role !== "editor") notFound();

  const supabase = await createClient();
  const { data: campaign } = await supabase
    .from("jackpot_campaigns")
    .select(
      "id, name, validation_mode, status, rotating_period_seconds, current_count, threshold, display_base_cents, display_increment_cents",
    )
    .eq("id", id)
    .eq("organization_id", organization.id)
    .maybeSingle();

  if (!campaign) notFound();

  const counter = await getJackpotCounterCode(campaign.id);
  const displayAmountCents =
    campaign.display_base_cents +
    campaign.current_count * campaign.display_increment_cents;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link
            href={`/dashboard/jackpot/${campaign.id}`}
            className="text-sm text-zinc-500 hover:text-k-ink"
          >
            ← {campaign.name}
          </Link>
          <h1 className="mt-1 text-2xl font-bold">Écran comptoir</h1>
        </div>
        {campaign.status !== "active" && (
          <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-700">
            Campagne non active — écran de démonstration
          </span>
        )}
      </div>

      <p className="max-w-2xl text-sm text-zinc-600">
        Affichez cet écran face aux clients (tablette, second écran) : le montant
        et la jauge montent en direct.{" "}
        {campaign.validation_mode === "rotating_code"
          ? "Les clients saisissent le code affiché sur leur page jackpot pour participer — il change tout seul à chaque rotation."
          : "Les clients participent en caisse en présentant le QR de leur page jackpot."}
      </p>

      <JackpotCounterScreen
        campaignId={campaign.id}
        campaignName={campaign.name}
        validationMode={campaign.validation_mode}
        periodSeconds={counter?.periodSeconds ?? campaign.rotating_period_seconds}
        initialCode={counter?.code ?? null}
        gauge={{
          currentCount: campaign.current_count,
          threshold: campaign.threshold,
          displayAmountCents,
        }}
      />
    </div>
  );
}
