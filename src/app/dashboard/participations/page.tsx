import type { Metadata } from "next";
import Link from "next/link";
import { getUserAndOrg } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { RedeemButton } from "@/components/dashboard/redeem-button";
import type { Campaign } from "@/types/database";

export const metadata: Metadata = { title: "Participations" };

interface ParticipationRow {
  id: string;
  created_at: string;
  first_name: string;
  email: string;
  marketing_opt_in: boolean;
  redeem_code: string | null;
  redeemed_at: string | null;
  prizes: { label: string } | null;
  campaigns: { name: string } | null;
}

export default async function ParticipationsPage({
  searchParams,
}: {
  searchParams: Promise<{ campaign?: string; q?: string }>;
}) {
  const { campaign: campaignFilter, q } = await searchParams;
  const { organization } = await getUserAndOrg();
  const supabase = await createClient();

  const { data: campaigns } = await supabase
    .from("campaigns")
    .select("id, name")
    .eq("organization_id", organization!.id)
    .order("created_at", { ascending: false });

  let query = supabase
    .from("participations")
    .select(
      "id, created_at, first_name, email, marketing_opt_in, redeem_code, redeemed_at, prizes(label), campaigns(name)",
    )
    .eq("organization_id", organization!.id)
    .order("created_at", { ascending: false })
    .limit(200);

  if (campaignFilter) query = query.eq("campaign_id", campaignFilter);
  if (q) query = query.ilike("redeem_code", `%${q.trim()}%`);

  const { data } = await query;
  const rows = (data ?? []) as unknown as ParticipationRow[];
  const campaignList = (campaigns ?? []) as Pick<Campaign, "id" | "name">[];

  const { count: newsletterCount } = await supabase
    .from("newsletter_subscribers")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", organization!.id);

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl font-bold">Participations</h1>
          <p className="text-zinc-500 mt-1 text-sm">
            Vérifiez un code et validez la remise du gain.
          </p>
        </div>
        <a
          href="/dashboard/participations/export"
          className="text-sm font-semibold text-violet-600 hover:underline"
        >
          Exporter en CSV
        </a>
      </div>

      {(newsletterCount ?? 0) > 0 && (
        <Card className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm">
            <span className="font-semibold">{newsletterCount}</span>{" "}
            abonné{(newsletterCount ?? 0) > 1 ? "s" : ""} à la newsletter via
            la roue.
          </p>
          <a
            href="/dashboard/participations/export?type=newsletter"
            className="text-sm font-semibold text-violet-600 hover:underline"
          >
            Exporter les emails
          </a>
        </Card>
      )}

      <form method="get" className="flex flex-wrap gap-3 mb-6">
        <input
          name="q"
          defaultValue={q ?? ""}
          placeholder="Rechercher un code (GAIN-…)"
          className="rounded-lg border border-zinc-300 bg-white px-3.5 py-2.5 text-sm w-56 focus:outline-none focus:ring-2 focus:ring-violet-500"
        />
        <select
          name="campaign"
          defaultValue={campaignFilter ?? ""}
          className="rounded-lg border border-zinc-300 bg-white px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
        >
          <option value="">Toutes les campagnes</option>
          {campaignList.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <button
          type="submit"
          className="rounded-lg bg-zinc-900 text-white text-sm font-semibold px-4 py-2.5 hover:bg-zinc-700"
        >
          Filtrer
        </button>
        {(q || campaignFilter) && (
          <Link
            href="/dashboard/participations"
            className="self-center text-sm text-zinc-500 hover:text-zinc-900"
          >
            Réinitialiser
          </Link>
        )}
      </form>

      {rows.length === 0 ? (
        <Card className="text-center py-12">
          <p className="text-zinc-500">Aucune participation trouvée.</p>
        </Card>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-zinc-200 bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-200 text-left text-xs uppercase tracking-wide text-zinc-500">
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3">Client</th>
                <th className="px-4 py-3">Lot</th>
                <th className="px-4 py-3">Code</th>
                <th className="px-4 py-3">Opt-in</th>
                <th className="px-4 py-3">Statut</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-b border-zinc-100 last:border-0">
                  <td className="px-4 py-3 whitespace-nowrap text-zinc-500">
                    {formatDate(row.created_at)}
                  </td>
                  <td className="px-4 py-3">
                    <p className="font-medium">{row.first_name}</p>
                    <p className="text-zinc-500 text-xs">{row.email}</p>
                  </td>
                  <td className="px-4 py-3">{row.prizes?.label ?? "—"}</td>
                  <td className="px-4 py-3 font-mono text-xs">
                    {row.redeem_code ?? "—"}
                  </td>
                  <td className="px-4 py-3">
                    {row.marketing_opt_in ? (
                      <span className="text-emerald-600 font-medium">Oui</span>
                    ) : (
                      <span className="text-zinc-400">Non</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {row.redeemed_at ? (
                      <span className="inline-flex rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-700 whitespace-nowrap">
                        Récupéré {formatDate(row.redeemed_at)}
                      </span>
                    ) : (
                      <RedeemButton id={row.id} />
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
