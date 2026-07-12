import type { Metadata } from "next";
import Link from "next/link";
import { requireAdmin } from "@/lib/admin/auth";
import { listMerchants } from "@/lib/admin/data";
import { formatDate } from "@/lib/utils";
import { EmptyState, PageHeader, StatusBadge, Table } from "@/components/admin/ui";

export const metadata: Metadata = { title: "Commerçants · Back-office", robots: { index: false } };

const STATUS_FILTERS = [
  { value: "", label: "Tous" },
  { value: "active", label: "Actifs" },
  { value: "trialing", label: "Essai" },
  { value: "past_due", label: "Impayés" },
  { value: "canceled", label: "Annulés" },
] as const;

export default async function MerchantsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string; page?: string }>;
}) {
  await requireAdmin("merchants.view");
  const sp = await searchParams;
  const page = Number(sp.page ?? "1") || 1;
  const { rows, total, pageSize } = await listMerchants({
    search: sp.q,
    status: sp.status,
    page,
  });
  const pages = Math.max(1, Math.ceil(total / pageSize));

  const qs = (over: Record<string, string | number>) => {
    const p = new URLSearchParams();
    if (sp.q) p.set("q", sp.q);
    if (sp.status) p.set("status", sp.status);
    for (const [k, v] of Object.entries(over)) {
      if (v === "" || v == null) p.delete(k);
      else p.set(k, String(v));
    }
    const s = p.toString();
    return s ? `?${s}` : "";
  };

  return (
    <div>
      <PageHeader title="Commerçants" description={`${total} organisation${total > 1 ? "s" : ""}.`} />

      <form className="mb-4 flex flex-wrap items-center gap-2" action="/admin/merchants">
        <input
          type="search"
          name="q"
          defaultValue={sp.q ?? ""}
          placeholder="Rechercher nom ou slug…"
          className="min-w-[220px] flex-1 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder:text-zinc-500 focus:border-violet-400/50 focus:outline-none focus:ring-2 focus:ring-violet-500/30"
        />
        {sp.status && <input type="hidden" name="status" value={sp.status} />}
        <button className="rounded-lg bg-white px-3 py-2 text-sm font-semibold text-zinc-950 hover:bg-zinc-200">
          Rechercher
        </button>
      </form>

      <div className="mb-4 flex flex-wrap gap-1.5">
        {STATUS_FILTERS.map((f) => {
          const active = (sp.status ?? "") === f.value;
          return (
            <Link
              key={f.value}
              href={`/admin/merchants${qs({ status: f.value, page: 1 })}`}
              className={`rounded-full px-3 py-1 text-xs font-medium ring-1 ring-inset transition-colors ${
                active
                  ? "bg-white/10 text-white ring-white/20"
                  : "text-zinc-400 ring-white/10 hover:bg-white/5"
              }`}
            >
              {f.label}
            </Link>
          );
        })}
      </div>

      {rows.length === 0 ? (
        <EmptyState title="Aucun commerçant" hint="Ajustez la recherche ou les filtres." />
      ) : (
        <>
          <Table
            head={
              <tr>
                <th className="px-4 py-2.5">Nom</th>
                <th className="px-4 py-2.5">Statut</th>
                <th className="px-4 py-2.5">Plan</th>
                <th className="px-4 py-2.5">Inscription</th>
                <th className="px-4 py-2.5"></th>
              </tr>
            }
          >
            {rows.map((r) => (
              <tr key={r.id} className="text-zinc-300 hover:bg-white/[0.02]">
                <td className="px-4 py-3">
                  <p className="font-medium text-white">{r.name}</p>
                  <p className="font-mono text-xs text-zinc-500">{r.slug}</p>
                </td>
                <td className="px-4 py-3"><StatusBadge status={r.subscription_status} /></td>
                <td className="px-4 py-3 capitalize">{r.plan}</td>
                <td className="px-4 py-3 text-zinc-400">{formatDate(r.created_at)}</td>
                <td className="px-4 py-3 text-right">
                  <Link href={`/admin/merchants/${r.id}`} className="text-violet-300 hover:text-violet-200">
                    Ouvrir →
                  </Link>
                </td>
              </tr>
            ))}
          </Table>

          {pages > 1 && (
            <div className="mt-4 flex items-center justify-between text-sm text-zinc-400">
              <span>Page {page} / {pages}</span>
              <div className="flex gap-2">
                {page > 1 && (
                  <Link href={`/admin/merchants${qs({ page: page - 1 })}`} className="rounded-lg border border-white/10 px-3 py-1.5 hover:bg-white/5">
                    Précédent
                  </Link>
                )}
                {page < pages && (
                  <Link href={`/admin/merchants${qs({ page: page + 1 })}`} className="rounded-lg border border-white/10 px-3 py-1.5 hover:bg-white/5">
                    Suivant
                  </Link>
                )}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
