import type { Metadata } from "next";
import { getUserAndOrg } from "@/lib/auth";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { NewsletterComposer } from "@/components/dashboard/newsletter-composer";
import { RetryCampaignButton } from "@/components/dashboard/newsletter-retry";
import type { NewsletterCampaign } from "@/types/database";

/** Cycle de vie d'une campagne (file de travaux) → libellé + couleurs. */
const CAMPAIGN_STATUS: Record<
  NewsletterCampaign["status"],
  { label: string; className: string }
> = {
  queued: { label: "En file", className: "bg-amber-100 text-amber-700" },
  sending: { label: "Envoi…", className: "bg-sky-100 text-sky-700" },
  completed: { label: "Envoyé", className: "bg-emerald-100 text-emerald-700" },
  partial: { label: "Partiel", className: "bg-orange-100 text-orange-700" },
  failed: { label: "Échec", className: "bg-red-100 text-red-700" },
};

export const metadata: Metadata = { title: "Newsletter" };

export default async function NewsletterPage() {
  const { organization, role } = await getUserAndOrg();
  if (role !== "owner") redirect("/dashboard/redeem");
  const supabase = await createClient();

  const [{ data: counts }, { data: campaigns }] = await Promise.all([
    supabase
      .rpc("org_segment_counts", { p_organization_id: organization!.id })
      .maybeSingle(),
    supabase
      .from("newsletter_campaigns")
      .select("*")
      .eq("organization_id", organization!.id)
      .order("created_at", { ascending: false })
      .limit(20),
  ]);

  const c = counts as {
    all_count: number;
    loyal_count: number;
    new_count: number;
    inactive_count: number;
  } | null;
  const segmentCounts = {
    all: Number(c?.all_count ?? 0),
    loyal: Number(c?.loyal_count ?? 0),
    new: Number(c?.new_count ?? 0),
    inactive: Number(c?.inactive_count ?? 0),
  };
  const subscriberCount = segmentCounts.all;
  const history = (campaigns ?? []) as NewsletterCampaign[];

  return (
    <div>
      <h1 className="text-2xl font-bold mb-1">Newsletter</h1>
      <p className="text-zinc-500 mb-8">
        Envoyez un message à vos clients inscrits via la roue. Chaque email
        inclut un lien de désinscription en un clic.
      </p>

      <div className="grid gap-6 lg:grid-cols-[1fr_320px] items-start">
        <Card>
          <h2 className="font-semibold mb-4">Nouveau message</h2>
          {subscriberCount === 0 ? (
            <p className="text-sm text-zinc-500">
              Aucun abonné pour le moment. Activez l&apos;action
              d&apos;engagement « Newsletter » sur une campagne pour commencer
              à en collecter.
            </p>
          ) : (
            <NewsletterComposer counts={segmentCounts} />
          )}
        </Card>

        <Card>
          <h2 className="font-semibold mb-4">Historique</h2>
          {history.length === 0 ? (
            <p className="text-sm text-zinc-500">Aucun envoi pour l&apos;instant.</p>
          ) : (
            <ul className="space-y-4">
              {history.map((c) => {
                const status = CAMPAIGN_STATUS[c.status] ?? CAMPAIGN_STATUS.completed;
                return (
                  <li key={c.id} className="border-b border-zinc-100 pb-3 last:border-0 last:pb-0">
                    <div className="flex items-center gap-2">
                      <p className="min-w-0 flex-1 truncate text-sm font-medium text-zinc-900">
                        {c.subject}
                      </p>
                      <span
                        className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold ${status.className}`}
                      >
                        {status.label}
                      </span>
                    </div>
                    <p className="text-xs text-zinc-500 mt-0.5">
                      {formatDate(c.created_at)} ·{" "}
                      {c.status === "completed" || c.status === "partial"
                        ? `${c.sent_count ?? c.recipient_count}/${c.recipient_count} envoyé${(c.sent_count ?? c.recipient_count) > 1 ? "s" : ""}`
                        : `${c.recipient_count} destinataire${c.recipient_count > 1 ? "s" : ""}`}
                    </p>
                    {(c.status === "failed" || c.status === "partial") && (
                      <RetryCampaignButton campaignId={c.id} />
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
