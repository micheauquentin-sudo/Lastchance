import type { Metadata } from "next";
import Link from "next/link";
import { getUserAndOrg } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { hasJackpotAccess } from "@/lib/subscription";
import { formatDate } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { JackpotStatusBadge } from "@/components/dashboard/jackpot-status";
import { NewJackpotForm } from "@/components/dashboard/new-jackpot-form";
import type { JackpotCampaign } from "@/types/database";

export const metadata: Metadata = { title: "Jackpot" };

const MODE_LABEL = {
  rotating_code: "Code au comptoir",
  staff: "Validation en caisse",
} as const;

type CampaignRow = Pick<
  JackpotCampaign,
  | "id"
  | "name"
  | "status"
  | "validation_mode"
  | "current_count"
  | "threshold"
  | "reward_claimed_count"
  | "reward_stock"
  | "created_at"
>;

export default async function JackpotPage() {
  const { organization } = await getUserAndOrg();

  // Module en option : sans l'addon, la page présente l'offre au lieu de la
  // liste (miroir de la gate Fidélité / Chasse au trésor).
  if (!hasJackpotAccess(organization!)) {
    return (
      <div>
        <h1 className="text-2xl font-bold mb-8">Jackpot</h1>
        <Card className="text-center py-12">
          <div className="text-5xl mb-4">🎰</div>
          <h2 className="text-lg font-bold text-k-ink mb-2">
            Transformez chaque passage en événement collectif
          </h2>
          <p className="text-zinc-500 max-w-lg mx-auto mb-4">
            Un jackpot partagé : chaque client fait monter une cagnotte commune
            et une jauge géante. Quand l&apos;objectif tombe, un gagnant remporte
            le lot — à retirer en caisse. De quoi faire revenir toute la salle.
          </p>
          <div className="mx-auto max-w-md rounded-xl border-2 border-dashed border-zinc-300 px-4 py-3 mb-3">
            <p className="text-sm font-bold text-k-ink">
              Option à activer sur votre abonnement
            </p>
            <p className="text-xs text-zinc-500 mt-0.5">
              Code tournant au comptoir ou validation en caisse, objectif, lot à
              stock fini et montant d&apos;affichage croissant personnalisables.
            </p>
          </div>
          <p className="text-sm text-zinc-500">
            Contactez-nous pour l&apos;activer sur votre compte.
          </p>
        </Card>
      </div>
    );
  }

  const supabase = await createClient();
  const { data: campaigns } = await supabase
    .from("jackpot_campaigns")
    .select(
      "id, name, status, validation_mode, current_count, threshold, reward_claimed_count, reward_stock, created_at",
    )
    .eq("organization_id", organization!.id)
    .order("created_at", { ascending: false });

  const campaignList = (campaigns ?? []) as CampaignRow[];

  return (
    <div>
      <div className="flex items-center justify-between mb-8 gap-4">
        <div>
          <h1 className="text-2xl font-bold">Jackpot</h1>
          <p className="text-zinc-500 mt-1 text-sm">
            Des cagnottes collectives : une jauge partagée que vos clients
            remplissent ensemble, un lot à la clé.
          </p>
        </div>
        <NewJackpotForm />
      </div>

      {!campaignList.length ? (
        <Card className="text-center py-12">
          <p className="text-zinc-500">
            Aucun jackpot pour l&apos;instant. Créez le premier !
          </p>
        </Card>
      ) : (
        <ul className="space-y-3">
          {campaignList.map((c) => {
            const remaining = Math.max(0, c.threshold - c.current_count);
            return (
              <li key={c.id}>
                <Link
                  href={`/dashboard/jackpot/${c.id}`}
                  className="block rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm hover:border-orange-300 transition-colors"
                >
                  <div className="flex items-center justify-between gap-4">
                    <div className="min-w-0 flex items-center gap-3">
                      <span className="text-2xl" aria-hidden>
                        🎰
                      </span>
                      <div className="min-w-0">
                        <p className="font-semibold truncate">{c.name}</p>
                        <p className="text-sm text-zinc-500 mt-0.5">
                          {MODE_LABEL[c.validation_mode]} · créé le{" "}
                          {formatDate(c.created_at)}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <span className="hidden text-sm text-zinc-500 sm:inline">
                        <span className="font-semibold text-zinc-900 tabular-nums">
                          {c.current_count}/{c.threshold}
                        </span>{" "}
                        {remaining > 0 ? (
                          <>· encore {remaining}</>
                        ) : (
                          <>· objectif atteint</>
                        )}{" "}
                        ·{" "}
                        <span className="font-semibold text-zinc-900 tabular-nums">
                          {c.reward_claimed_count}/{c.reward_stock}
                        </span>{" "}
                        lot{c.reward_stock > 1 ? "s" : ""}
                      </span>
                      <JackpotStatusBadge status={c.status} />
                    </div>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
