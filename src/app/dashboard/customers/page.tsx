import type { Metadata } from "next";
import Link from "next/link";
import { getUserAndOrg } from "@/lib/auth";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import type { CustomerProfile } from "@/types/database";
import { Pagination } from "@/components/dashboard/pagination";

export const metadata: Metadata = { title: "Clients" };

const DAY_MS = 86_400_000;
const INACTIVE_AFTER_DAYS = 60;
const LOYAL_FROM_WINS = 3;

function segment(profile: CustomerProfile): { label: string; className: string } | null {
  const daysSinceLastWin = (Date.now() - new Date(profile.last_win).getTime()) / DAY_MS;
  if (daysSinceLastWin > INACTIVE_AFTER_DAYS) {
    return { label: "À relancer", className: "bg-amber-50 text-amber-700" };
  }
  if (profile.wins >= LOYAL_FROM_WINS) {
    return { label: "Fidèle", className: "bg-orange-50 text-orange-700" };
  }
  if (profile.wins === 1) {
    return { label: "Nouveau", className: "bg-sky-50 text-sky-700" };
  }
  return null;
}

export default async function CustomersPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const { page: rawPage } = await searchParams;
  const page = Math.max(1, Number.parseInt(rawPage ?? "1", 10) || 1);
  const pageSize = 50;
  const { organization, role } = await getUserAndOrg();
  if (role !== "owner") redirect("/dashboard/redeem");
  const supabase = await createClient();

  const [{ data, error }, { data: segmentData }] = await Promise.all([
    supabase.rpc("org_customer_profiles_page", {
      p_organization_id: organization!.id,
      p_offset: (page - 1) * pageSize,
      p_limit: pageSize,
    }),
    supabase.rpc("org_segment_counts", { p_organization_id: organization!.id }),
  ]);
  if (error) console.error("[customers] org_customer_profiles:", error.message);

  const profiles = (data ?? []) as (CustomerProfile & { total_count: number })[];
  const totalCount = profiles[0]?.total_count ?? 0;
  const rows = profiles.map((p) => ({ profile: p, segment: segment(p) }));
  const inactiveCount = ((segmentData ?? [])[0] as { inactive_count?: number } | undefined)?.inactive_count ?? 0;

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl font-bold">Clients</h1>
          <p className="text-zinc-500 mt-1 text-sm">
            Les joueurs identifiés lors d&apos;un gain (coordonnées collectées).
          </p>
        </div>
        {inactiveCount > 0 && (
          <Link
            href="/dashboard/newsletter"
            className="text-sm font-semibold text-orange-600 hover:underline"
          >
            {inactiveCount} client{inactiveCount > 1 ? "s" : ""} à relancer →
          </Link>
        )}
      </div>

      {profiles.length === 0 ? (
        <Card className="text-center py-12">
          <p className="text-zinc-500">
            Aucun client identifié pour l&apos;instant — dès qu&apos;un joueur
            gagne et laisse son email, il apparaît ici.
          </p>
        </Card>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-zinc-200 bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-200 text-left text-xs uppercase tracking-wide text-zinc-500">
                <th className="px-4 py-3">Client</th>
                <th className="px-4 py-3">Gains</th>
                <th className="px-4 py-3">Récupérés</th>
                <th className="px-4 py-3">1er gain</th>
                <th className="px-4 py-3">Dernier gain</th>
                <th className="px-4 py-3">Statut</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ profile: p, segment: s }) => (
                <tr key={p.email} className="border-b border-zinc-100 last:border-0">
                  <td className="px-4 py-3">
                    <p className="font-medium text-zinc-900">{p.first_name || "—"}</p>
                    <p className="text-zinc-500 text-xs">{p.email}</p>
                  </td>
                  <td className="px-4 py-3 tabular-nums">{p.wins}</td>
                  <td className="px-4 py-3 tabular-nums">{p.redeemed}</td>
                  <td className="px-4 py-3 text-zinc-500">{formatDate(p.first_win)}</td>
                  <td className="px-4 py-3 text-zinc-500">{formatDate(p.last_win)}</td>
                  <td className="px-4 py-3">
                    {s && (
                      <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${s.className}`}>
                        {s.label}
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Pagination page={page} hasNext={totalCount > page * pageSize} />
    </div>
  );
}
