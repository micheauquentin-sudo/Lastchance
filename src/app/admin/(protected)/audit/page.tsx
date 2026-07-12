import type { Metadata } from "next";
import Link from "next/link";
import { requireAdmin } from "@/lib/admin/auth";
import { listAuditLogs } from "@/lib/admin/data";
import { EmptyState, Badge, PageHeader, Table } from "@/components/admin/ui";

export const metadata: Metadata = { title: "Audit Logs · Back-office", robots: { index: false } };

function fmt(iso: string): string {
  return new Intl.DateTimeFormat("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

function actionTone(action: string): "red" | "amber" | "emerald" | "default" {
  if (action.includes("denied") || action.includes("deactivate")) return "red";
  if (action.includes("status") || action.includes("role") || action.includes("plan")) return "amber";
  if (action.includes("login") || action.includes("create")) return "emerald";
  return "default";
}

export default async function AuditPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string }>;
}) {
  await requireAdmin("audit.view");
  const sp = await searchParams;
  const page = Number(sp.page ?? "1") || 1;
  const { rows, total, pageSize } = await listAuditLogs({ action: sp.q, page });
  const pages = Math.max(1, Math.ceil(total / pageSize));

  const link = (p: number) => {
    const q = new URLSearchParams();
    if (sp.q) q.set("q", sp.q);
    q.set("page", String(p));
    return `/admin/audit?${q.toString()}`;
  };

  return (
    <div>
      <PageHeader
        title="Audit Logs"
        description="Journal immuable des actions sensibles du back-office."
      />

      <form className="mb-4 flex gap-2" action="/admin/audit">
        <input
          type="search"
          name="q"
          defaultValue={sp.q ?? ""}
          placeholder="Filtrer par action (ex : merchant.status)…"
          className="min-w-[240px] flex-1 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder:text-zinc-500 focus:border-violet-400/50 focus:outline-none focus:ring-2 focus:ring-violet-500/30"
        />
        <button className="rounded-lg bg-white px-3 py-2 text-sm font-semibold text-zinc-950 hover:bg-zinc-200">
          Filtrer
        </button>
      </form>

      {rows.length === 0 ? (
        <EmptyState title="Aucune entrée" hint="Les actions sensibles apparaîtront ici." />
      ) : (
        <>
          <Table
            head={
              <tr>
                <th className="px-4 py-2.5">Date</th>
                <th className="px-4 py-2.5">Acteur</th>
                <th className="px-4 py-2.5">Action</th>
                <th className="px-4 py-2.5">Cible</th>
              </tr>
            }
          >
            {rows.map((r) => (
              <tr key={r.id} className="align-top text-zinc-300">
                <td className="whitespace-nowrap px-4 py-3 font-mono text-xs text-zinc-500">{fmt(r.created_at)}</td>
                <td className="px-4 py-3">
                  <p className="text-white">{r.actor_email}</p>
                  <p className="text-xs text-zinc-500">{r.actor_role}</p>
                </td>
                <td className="px-4 py-3"><Badge tone={actionTone(r.action)}>{r.action}</Badge></td>
                <td className="px-4 py-3 font-mono text-xs text-zinc-400">
                  {r.target_type ? `${r.target_type}:${(r.target_id ?? "").slice(0, 8)}` : "—"}
                </td>
              </tr>
            ))}
          </Table>

          {pages > 1 && (
            <div className="mt-4 flex items-center justify-between text-sm text-zinc-400">
              <span>Page {page} / {pages}</span>
              <div className="flex gap-2">
                {page > 1 && (
                  <Link href={link(page - 1)} className="rounded-lg border border-white/10 px-3 py-1.5 hover:bg-white/5">
                    Précédent
                  </Link>
                )}
                {page < pages && (
                  <Link href={link(page + 1)} className="rounded-lg border border-white/10 px-3 py-1.5 hover:bg-white/5">
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
