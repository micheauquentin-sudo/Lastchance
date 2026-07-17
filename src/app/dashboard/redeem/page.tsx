import type { Metadata } from "next";
import { getUserAndOrg } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatDate, normalizeRedeemCode } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { RedeemButton } from "@/components/dashboard/redeem-button";
import { RedeemScanner } from "@/components/dashboard/redeem-scanner";

export const metadata: Metadata = { title: "Caisse" };

interface FoundParticipation {
  id: string;
  created_at: string;
  first_name: string | null;
  redeem_code: string | null;
  redeemed_at: string | null;
  prizes: { label: string; description: string } | null;
  campaigns: { name: string } | null;
}

interface RedeemLookupRow {
  id: string;
  created_at: string;
  first_name: string | null;
  redeem_code: string | null;
  redeemed_at: string | null;
  prize_label: string | null;
  prize_description: string | null;
  campaign_name: string | null;
}

/**
 * Page caisse mobile-first : le staff tape le code du client et valide
 * la remise en un geste — sans chercher dans le tableau des
 * participations.
 */
export default async function RedeemPage({
  searchParams,
}: {
  searchParams: Promise<{ code?: string }>;
}) {
  const { code: rawCode } = await searchParams;
  const { organization } = await getUserAndOrg();

  const code = rawCode ? normalizeRedeemCode(rawCode) : "";
  let found: FoundParticipation | null = null;

  if (code) {
    const supabase = await createClient();
    const { data } = await supabase
      .rpc("lookup_redeem_code", {
        p_organization_id: organization!.id,
        p_redeem_code: code,
      })
      .limit(1)
      .maybeSingle();
    const row = data as unknown as RedeemLookupRow | null;
    found = row
      ? {
          id: row.id,
          created_at: row.created_at,
          first_name: row.first_name,
          redeem_code: row.redeem_code,
          redeemed_at: row.redeemed_at,
          prizes: row.prize_label
            ? { label: row.prize_label, description: row.prize_description ?? "" }
            : null,
          campaigns: row.campaign_name ? { name: row.campaign_name } : null,
        }
      : null;
  }

  return (
    <div className="max-w-md">
      <h1 className="text-2xl font-bold mb-1">Caisse</h1>
      <p className="text-zinc-500 mb-8 text-sm">
        Scannez ou tapez le code du client pour valider la remise du gain.
      </p>

      <RedeemScanner />

      <form method="get" className="flex gap-2 mb-6">
        <input
          name="code"
          defaultValue={rawCode ?? ""}
          placeholder="GAIN-…"
          autoFocus
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          className="flex-1 rounded-xl border border-zinc-300 bg-white px-4 py-3.5 text-lg font-mono tracking-widest uppercase focus:outline-none focus:ring-2 focus:ring-orange-500"
        />
        <button
          type="submit"
          className="rounded-xl bg-zinc-900 text-white text-base font-semibold px-5 hover:bg-zinc-700"
        >
          Vérifier
        </button>
      </form>

      {code && !found && (
        <Card className="border-red-200 bg-red-50 text-center py-8">
          <p className="text-3xl mb-2">✕</p>
          <p className="font-semibold text-red-700">Code introuvable</p>
          <p className="text-sm text-red-600/80 mt-1">
            Vérifiez la saisie — le code figure sur l&apos;écran ou
            l&apos;email du client.
          </p>
        </Card>
      )}

      {found && (
        <Card
          className={
            found.redeemed_at
              ? "border-amber-200 bg-amber-50"
              : "border-emerald-200 bg-emerald-50"
          }
        >
          <p className="font-mono text-sm text-zinc-500 mb-3">
            {found.redeem_code}
          </p>
          <p className="text-2xl font-bold mb-1">
            {found.prizes?.label ?? "Lot supprimé"}
          </p>
          {found.prizes?.description && (
            <p className="text-sm text-zinc-600 mb-2">
              {found.prizes.description}
            </p>
          )}
          <p className="text-sm text-zinc-500 mb-5">
            {found.first_name ?? "Anonyme"} ·{" "}
            {found.campaigns?.name ?? "Campagne supprimée"} · gagné le{" "}
            {formatDate(found.created_at)}
          </p>

          {found.redeemed_at ? (
            <p className="inline-flex rounded-full bg-amber-100 px-4 py-2 text-sm font-semibold text-amber-700">
              ⚠ Déjà récupéré le {formatDate(found.redeemed_at)}
            </p>
          ) : (
            <RedeemButton id={found.id} />
          )}
        </Card>
      )}
    </div>
  );
}
