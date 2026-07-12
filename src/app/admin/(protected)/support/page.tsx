import type { Metadata } from "next";
import Link from "next/link";
import { requireAdmin } from "@/lib/admin/auth";
import { listMerchants } from "@/lib/admin/data";
import { formatDate } from "@/lib/utils";
import { EmptyState, PageHeader, Panel, StatusBadge } from "@/components/admin/ui";

export const metadata: Metadata = { title: "Support · Back-office", robots: { index: false } };

export default async function SupportPage() {
  await requireAdmin("support.view");

  // File d'attente support : commerçants nécessitant un suivi.
  const [pastDue, canceled] = await Promise.all([
    listMerchants({ status: "past_due", pageSize: 50 }),
    listMerchants({ status: "canceled", pageSize: 50 }),
  ]);

  const queues = [
    { title: "Impayés en cours", tone: "amber", rows: pastDue.rows },
    { title: "Abonnements annulés", tone: "red", rows: canceled.rows },
  ];

  return (
    <div>
      <PageHeader
        title="Support"
        description="Commerçants nécessitant un suivi. Ouvrez une fiche pour ajouter une note interne."
      />

      <div className="space-y-8">
        {queues.map((q) => (
          <section key={q.title}>
            <h2 className="mb-3 text-sm font-semibold text-white">
              {q.title} <span className="text-zinc-500">({q.rows.length})</span>
            </h2>
            {q.rows.length === 0 ? (
              <EmptyState title="Rien à traiter" hint="Aucun commerçant dans cette file." />
            ) : (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {q.rows.map((r) => (
                  <Link key={r.id} href={`/admin/merchants/${r.id}`}>
                    <Panel className="p-4 transition-colors hover:border-white/20 hover:bg-white/[0.04]">
                      <div className="flex items-center justify-between gap-2">
                        <p className="truncate font-medium text-white">{r.name}</p>
                        <StatusBadge status={r.subscription_status} />
                      </div>
                      <p className="mt-1 font-mono text-xs text-zinc-500">{r.slug}</p>
                      <p className="mt-3 text-xs text-zinc-500">Inscrit le {formatDate(r.created_at)}</p>
                    </Panel>
                  </Link>
                ))}
              </div>
            )}
          </section>
        ))}
      </div>
    </div>
  );
}
