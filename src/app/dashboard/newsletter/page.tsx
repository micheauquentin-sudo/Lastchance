import type { Metadata } from "next";
import { getUserAndOrg } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { NewsletterComposer } from "@/components/dashboard/newsletter-composer";
import type { NewsletterCampaign } from "@/types/database";

export const metadata: Metadata = { title: "Newsletter" };

export default async function NewsletterPage() {
  const { organization } = await getUserAndOrg();
  const supabase = await createClient();

  const [{ count: subscriberCount }, { data: campaigns }] = await Promise.all([
    supabase
      .from("newsletter_subscribers")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", organization!.id)
      .is("unsubscribed_at", null),
    supabase
      .from("newsletter_campaigns")
      .select("*")
      .eq("organization_id", organization!.id)
      .order("created_at", { ascending: false })
      .limit(20),
  ]);

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
          {(subscriberCount ?? 0) === 0 ? (
            <p className="text-sm text-zinc-500">
              Aucun abonné pour le moment. Activez l&apos;action
              d&apos;engagement « Newsletter » sur une campagne pour commencer
              à en collecter.
            </p>
          ) : (
            <NewsletterComposer subscriberCount={subscriberCount ?? 0} />
          )}
        </Card>

        <Card>
          <h2 className="font-semibold mb-4">Historique</h2>
          {history.length === 0 ? (
            <p className="text-sm text-zinc-500">Aucun envoi pour l&apos;instant.</p>
          ) : (
            <ul className="space-y-4">
              {history.map((c) => (
                <li key={c.id} className="border-b border-zinc-100 pb-3 last:border-0 last:pb-0">
                  <p className="text-sm font-medium text-zinc-900 truncate">{c.subject}</p>
                  <p className="text-xs text-zinc-500 mt-0.5">
                    {formatDate(c.created_at)} · {c.recipient_count} destinataire
                    {c.recipient_count > 1 ? "s" : ""}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
