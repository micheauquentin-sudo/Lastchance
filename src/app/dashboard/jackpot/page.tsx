import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getUserAndOrg } from "@/lib/auth";
import { capacitesDuModule } from "@/lib/module-capabilities-server";
import { createClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { sousTitreTableauDeBord } from "@/platform/experiences/catalog";
import { PageHeader } from "@/components/ui/page-header";
import { JackpotStatusBadge } from "@/components/dashboard/jackpot-status";
import { ModuleCapabilityNotice } from "@/components/dashboard/module-capability-notice";
import { NewJackpotForm } from "@/components/dashboard/new-jackpot-form";
import { Pagination } from "@/components/dashboard/pagination";
import {
  couperPage,
  litFiltresModule,
  ModuleListAucunResultat,
  ModuleListFilters,
  paramsPagination,
  type StatutModule,
} from "@/components/dashboard/module-list-filters";
import type { JackpotCampaign } from "@/types/database";

export const metadata: Metadata = { title: "Jackpot collectif" };

/** Le `check` de `jackpot_campaigns.status` : trois valeurs, pas de `paused`. */
const STATUTS: readonly StatutModule[] = [
  { value: "draft", etat: "brouillon" },
  { value: "active", etat: "ouverte" },
  { value: "archived", etat: "cloturee" },
];

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

export default async function JackpotPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; statut?: string; page?: string }>;
}) {
  const filtres = litFiltresModule(await searchParams, STATUTS);
  const { organization } = await getUserAndOrg();

  // Découvrir / préparer / publier (cahier §3).
  const capacites = await capacitesDuModule("jackpot");
  if (!capacites.canExplore) notFound();

  const supabase = await createClient();
  let requete = supabase
    .from("jackpot_campaigns")
    .select(
      "id, name, status, validation_mode, current_count, threshold, reward_claimed_count, reward_stock, created_at",
    )
    .eq("organization_id", organization!.id)
    .order("created_at", { ascending: false })
    .range(filtres.from, filtres.to);
  if (filtres.terme) requete = requete.ilike("name", `%${filtres.terme}%`);
  if (filtres.statut) requete = requete.eq("status", filtres.statut);
  const { data: campaigns } = await requete;

  const { lignes: campaignList, hasNext } = couperPage(
    (campaigns ?? []) as CampaignRow[],
  );

  return (
    <div>
      <PageHeader
        surtitre="Vos animations"
        titre="Jackpot collectif"
        sousTitre={sousTitreTableauDeBord("jackpot")}
        actions={capacites.canEditDraft ? <NewJackpotForm /> : null}
      />

      <ModuleCapabilityNotice capacites={capacites} entitlement="jackpot">
        Code tournant au comptoir ou validation en caisse, objectif, lot à stock
        fini et montant d&apos;affichage croissant personnalisables.
      </ModuleCapabilityNotice>

      <ModuleListFilters
        idPrefix="jackpot-filtre"
        filtres={filtres}
        statuts={STATUTS}
        placeholder="Nom du jackpot…"
      />

      {!campaignList.length ? (
        <Card className="text-center py-12">
          {filtres.actif ? (
            <ModuleListAucunResultat quoi="jackpot" />
          ) : (
            <>
              <p className="text-zinc-500">
                Aucun jackpot pour l&apos;instant. Créez le premier !
              </p>
              {/* LE BOUTON EST ICI AUSSI : « créez le premier » sans rien à
                  cliquer laissait le seul bouton en haut d'écran, hors du
                  regard de celui qui vient de lire la phrase. */}
              {capacites.canEditDraft ? (
                <div className="mt-4 flex justify-center">
                  <NewJackpotForm instanceId="-vide" />
                </div>
              ) : null}
            </>
          )}
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
      <Pagination
        page={filtres.page}
        hasNext={hasNext}
        params={paramsPagination(filtres)}
      />
    </div>
  );
}
