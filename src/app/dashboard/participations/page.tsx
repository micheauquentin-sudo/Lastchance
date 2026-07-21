import type { Metadata } from "next";
import Link from "next/link";
import { getUserAndOrg } from "@/lib/auth";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { formatDate, sanitizeSearchTerm } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { RedeemButton } from "@/components/dashboard/redeem-button";
import { CancelParticipationButton } from "@/components/dashboard/cancel-participation";
import type { Campaign } from "@/types/database";
import { Pagination } from "@/components/dashboard/pagination";

export const metadata: Metadata = { title: "Participations" };

interface ParticipationRow {
  id: string;
  created_at: string;
  first_name: string | null;
  email: string | null;
  phone: string | null;
  marketing_opt_in: boolean;
  redeem_code: string | null;
  redeemed_at: string | null;
  redeem_expires_at: string | null;
  cancelled_at: string | null;
  basket_cents: number | null;
  prizes: { label: string } | null;
  campaigns: { name: string } | null;
}

interface FunnelRow {
  spins_total: number;
  wins: number;
  claimed: number;
  redeemed: number;
  expired: number;
  cancelled: number;
  basket_revenue_cents: number;
  redeemed_cost_cents: number;
  redeemed_value_cents: number;
}

const euros = (cents: number) =>
  (cents / 100).toLocaleString("fr-FR", { style: "currency", currency: "EUR" });

const pct = (num: number, den: number) =>
  den > 0 ? `${Math.round((num / den) * 100)} %` : "—";

/** Échéance serveur dépassée (le retrait serait refusé par la RPC). */
const isCodeExpired = (row: Pick<ParticipationRow, "redeem_expires_at">) =>
  row.redeem_expires_at !== null &&
  new Date(row.redeem_expires_at).getTime() <= Date.now();

export default async function ParticipationsPage({
  searchParams,
}: {
  searchParams: Promise<{ campaign?: string; q?: string; statut?: string; page?: string }>;
}) {
  const { campaign: campaignFilter, q, statut, page: rawPage } = await searchParams;
  const page = Math.max(1, Number.parseInt(rawPage ?? "1", 10) || 1);
  const pageSize = 50;
  const statusFilter =
    statut === "a-valider" || statut === "recuperes" ? statut : undefined;
  const { organization, role } = await getUserAndOrg();
  if (role !== "owner") redirect("/dashboard/redeem");
  const supabase = await createClient();

  let query = supabase
    .from("participations")
    .select(
      "id, created_at, first_name, email, phone, marketing_opt_in, redeem_code, redeemed_at, redeem_expires_at, cancelled_at, basket_cents, prizes!participations_prize_id_fkey(label), campaigns!participations_campaign_id_fkey(name)",
      { count: "exact" },
    )
    .eq("organization_id", organization!.id)
    .order("created_at", { ascending: false })
    .range((page - 1) * pageSize, page * pageSize - 1);

  if (campaignFilter) query = query.eq("campaign_id", campaignFilter);
  if (q) {
    const term = sanitizeSearchTerm(q);
    if (term) {
      query = query.or(
        `redeem_code.ilike.%${term}%,first_name.ilike.%${term}%,email.ilike.%${term}%`,
      );
    }
  }
  if (statusFilter === "a-valider") query = query.is("redeemed_at", null);
  if (statusFilter === "recuperes") query = query.not("redeemed_at", "is", null);

  // Les requêtes sont indépendantes : un seul aller-retour de latence.
  const [
    { data: campaigns },
    { data, count },
    { count: newsletterCount },
    { data: funnelRows },
  ] = await Promise.all([
    supabase
      .from("campaigns")
      .select("id, name")
      .eq("organization_id", organization!.id)
      .order("created_at", { ascending: false }),
    query,
    supabase
      .from("newsletter_subscribers")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", organization!.id)
      .is("unsubscribed_at", null),
    // Entonnoir gagné → réclamé → retiré + revenu attribuable (30 j).
    supabase.rpc("org_prize_funnel", {
      p_organization_id: organization!.id,
      p_days: 30,
    }),
  ]);

  const rows = (data ?? []) as unknown as ParticipationRow[];
  const campaignList = (campaigns ?? []) as Pick<Campaign, "id" | "name">[];
  const funnel = ((funnelRows ?? []) as FunnelRow[])[0] ?? null;
  const roi =
    funnel && funnel.redeemed_cost_cents > 0
      ? Math.round(
          ((funnel.basket_revenue_cents - funnel.redeemed_cost_cents) /
            funnel.redeemed_cost_cents) *
            100,
        )
      : null;

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
          className="text-sm font-semibold text-orange-600 hover:underline"
        >
          Exporter en CSV
        </a>
      </div>

      {funnel && funnel.spins_total > 0 && (
        <Card className="mb-6">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
            <h2 className="font-semibold">Cycle du gain (30 jours)</h2>
            {roi !== null ? (
              <span
                className={`rounded-full px-3 py-1 text-xs font-bold ${roi >= 0 ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"}`}
              >
                ROI estimé : {roi > 0 ? "+" : ""}
                {roi} %
              </span>
            ) : (
              <span className="text-xs text-zinc-400">
                ROI : renseignez le coût des lots (éditeur de roue)
              </span>
            )}
          </div>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <div>
              <p className="text-2xl font-bold">{funnel.wins}</p>
              <p className="text-xs text-zinc-500">
                gagnés · {pct(funnel.wins, funnel.spins_total)} des{" "}
                {funnel.spins_total} tours
              </p>
            </div>
            <div>
              <p className="text-2xl font-bold">{funnel.claimed}</p>
              <p className="text-xs text-zinc-500">
                réclamés · {pct(funnel.claimed, funnel.wins)} des gagnés
              </p>
            </div>
            <div>
              <p className="text-2xl font-bold">{funnel.redeemed}</p>
              <p className="text-xs text-zinc-500">
                retirés · {pct(funnel.redeemed, funnel.claimed)} des réclamés
                {funnel.expired > 0 && ` · ${funnel.expired} expirés`}
                {funnel.cancelled > 0 && ` · ${funnel.cancelled} annulés`}
              </p>
            </div>
            <div>
              <p className="text-2xl font-bold">
                {euros(funnel.basket_revenue_cents)}
              </p>
              <p className="text-xs text-zinc-500">
                paniers en caisse · coût des lots retirés{" "}
                {euros(funnel.redeemed_cost_cents)}
              </p>
            </div>
          </div>
        </Card>
      )}

      {(newsletterCount ?? 0) > 0 && (
        <Card className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm">
            <span className="font-semibold">{newsletterCount}</span>{" "}
            abonné{(newsletterCount ?? 0) > 1 ? "s" : ""} à la newsletter via
            la roue.
          </p>
          <div className="flex items-center gap-4">
            <Link
              href="/dashboard/newsletter"
              className="text-sm font-semibold text-orange-600 hover:underline"
            >
              Envoyer un email →
            </Link>
            <a
              href="/dashboard/participations/export?type=newsletter"
              className="text-sm font-semibold text-orange-600 hover:underline"
            >
              Exporter les emails
            </a>
          </div>
        </Card>
      )}

      <form method="get" className="flex flex-wrap gap-3 mb-6">
        <input
          name="q"
          defaultValue={q ?? ""}
          placeholder="Code, prénom ou email…"
          className="rounded-lg border border-zinc-300 bg-white px-3.5 py-2.5 text-sm w-56 focus:outline-none focus:ring-2 focus:ring-orange-500"
        />
        <select
          name="statut"
          defaultValue={statusFilter ?? ""}
          className="rounded-lg border border-zinc-300 bg-white px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
        >
          <option value="">Tous les statuts</option>
          <option value="a-valider">À valider</option>
          <option value="recuperes">Récupérés</option>
        </select>
        <select
          name="campaign"
          defaultValue={campaignFilter ?? ""}
          className="rounded-lg border border-zinc-300 bg-white px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
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
        {(q || campaignFilter || statusFilter) && (
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
                    <p className="font-medium">{row.first_name ?? "Anonyme"}</p>
                    {row.email && (
                      <p className="text-zinc-500 text-xs">{row.email}</p>
                    )}
                    {row.phone && (
                      <p className="text-zinc-500 text-xs">{row.phone}</p>
                    )}
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
                    {row.cancelled_at ? (
                      <span className="inline-flex rounded-full bg-zinc-200 px-3 py-1 text-xs font-semibold text-zinc-600 whitespace-nowrap">
                        Annulé {formatDate(row.cancelled_at)}
                      </span>
                    ) : row.redeemed_at ? (
                      <span className="inline-flex rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-700 whitespace-nowrap">
                        Récupéré {formatDate(row.redeemed_at)}
                        {row.basket_cents !== null &&
                          ` · ${euros(row.basket_cents)}`}
                      </span>
                    ) : isCodeExpired(row) ? (
                      <>
                        <span className="inline-flex rounded-full bg-red-100 px-3 py-1 text-xs font-semibold text-red-700 whitespace-nowrap">
                          Expiré {formatDate(row.redeem_expires_at!)}
                        </span>
                        <div className="mt-1">
                          <CancelParticipationButton id={row.id} />
                        </div>
                      </>
                    ) : (
                      <>
                        <RedeemButton id={row.id} compact />
                        <div className="mt-1">
                          <CancelParticipationButton id={row.id} />
                        </div>
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Pagination
        page={page}
        hasNext={(count ?? 0) > page * pageSize}
        params={{ campaign: campaignFilter, q, statut: statusFilter }}
      />
    </div>
  );
}
