import type { Metadata } from "next";
import Link from "next/link";
import { getUserAndOrg } from "@/lib/auth";
import { capacitesDuModule } from "@/lib/module-capabilities-server";
import { createClient } from "@/lib/supabase/server";
import { campaignWindowState } from "@/lib/campaign-window";
import { formatDate } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { ModuleCapabilityNotice } from "@/components/dashboard/module-capability-notice";
import { CampaignStateBanner } from "@/components/dashboard/campaign-automation";
import { CampaignStatusBadge } from "@/components/dashboard/campaign-status";
import {
  CampaignTemplateGallery,
  type PrivateTemplateRow,
} from "@/components/dashboard/campaign-template-gallery";
import { NewCampaignForm } from "@/components/dashboard/new-campaign-form";
import type { Campaign } from "@/types/database";
import { Pagination } from "@/components/dashboard/pagination";
import { parsePageParam } from "@/lib/pagination";

export const metadata: Metadata = { title: "Jeux instantanés" };

const PAGE_SIZE = 20;
/** Bibliothèque privée : les modèles les plus récents suffisent à la galerie. */
const TEMPLATES_LIMIT = 24;

export default async function CampaignsPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const { page: rawPage } = await searchParams;
  const page = parsePageParam(rawPage);
  const { organization } = await getUserAndOrg();
  // PARITÉ AVEC LES SEPT AUTRES LISTES. Cette page était la seule à ne pas
  // consulter les capacités du module : elle offrait son formulaire de
  // création sans jamais dire à quelles conditions la campagne pourrait être
  // ouverte aux joueurs. Le verrou de publication, lui, est en base
  // (`assert_module_publish_allowed`) — l'écran cesse seulement de proposer
  // un geste qui échouerait.
  const capacites = await capacitesDuModule("wheel");
  const supabase = await createClient();

  const [{ data: campaigns }, { data: stats }, { data: templates }] = await Promise.all([
    supabase.from("campaigns").select("*").eq("organization_id", organization!.id)
      .order("created_at", { ascending: false })
      .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
    supabase.rpc("org_campaign_stats", { p_organization_id: organization!.id }),
    // Modèles PRIVÉS de l'organisation active : client de SESSION (donc sous
    // RLS `campaign_templates: editors`) + filtre `organization_id`
    // explicite, comme partout ailleurs dans le dashboard. Un modèle privé
    // n'est jamais partagé entre commerçants.
    supabase
      .from("campaign_templates")
      .select("id, name, description, blueprint, created_at")
      .eq("organization_id", organization!.id)
      .order("created_at", { ascending: false })
      .limit(TEMPLATES_LIMIT),
  ]);

  const campaignList = (campaigns ?? []) as Campaign[];

  const statsByCampaign = new Map(
    ((stats ?? []) as { campaign_id: string; spins: number; wins: number; pending: number }[])
      .map((row) => [row.campaign_id, row] as const),
  );
  const hasNext = campaignList.length > PAGE_SIZE;
  if (hasNext) campaignList.pop();

  const privateTemplates = (templates ?? []) as PrivateTemplateRow[];

  return (
    <div>
      <PageHeader
        surtitre="Vos animations"
        titre="Jeux instantanés"
        sousTitre="Chaque campagne est une roue ou un mini-jeu, avec ses QR codes et ses dates."
        actions={capacites.canEditDraft ? <NewCampaignForm /> : null}
      />

      <ModuleCapabilityNotice capacites={capacites} entitlement="core">
        La roue de la fortune, ses lots, ses QR codes et la remise en caisse —
        le socle de toutes vos animations.
      </ModuleCapabilityNotice>

      {/* Place de marché : partir d'un modèle plutôt que d'une page blanche.
          Dépliée d'emblée tant que le commerçant n'a aucune campagne. */}
      <CampaignTemplateGallery
        privateTemplates={privateTemplates}
        defaultOpen={!campaignList.length}
      />

      {!campaignList.length ? (
        <Card className="text-center py-12">
          <p className="text-zinc-500">
            Aucune campagne pour l&apos;instant. Créez la première !
          </p>
          {/* LE BOUTON EST ICI AUSSI : « créez la première » sans rien à
              cliquer laissait le seul bouton en haut d'écran, hors du regard
              de celui qui vient de lire la phrase. */}
          {capacites.canEditDraft ? (
            <div className="mt-4 flex justify-center">
              <NewCampaignForm instanceId="-vide" />
            </div>
          ) : null}
        </Card>
      ) : (
        <ul className="space-y-3">
          {campaignList.map((c) => {
            const s = statsByCampaign.get(c.id);
            // `select("*")` ramène starts_at/ends_at : jouabilité réelle
            // calculée ici, côté serveur (lib/campaign-window.ts).
            const windowState = campaignWindowState(c);
            return (
              <li key={c.id}>
                <Link
                  href={`/dashboard/campaigns/${c.id}`}
                  className="block rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm hover:border-orange-300 transition-colors"
                >
                  <div className="flex items-center justify-between gap-4">
                    <div className="min-w-0">
                      <p className="font-semibold truncate">{c.name}</p>
                      <p className="text-sm text-zinc-500 mt-0.5">
                        Créée le {formatDate(c.created_at)}
                      </p>
                    </div>
                    <CampaignStatusBadge
                      status={c.status}
                      windowState={windowState}
                    />
                  </div>
                  {/* Variante liste : texte seul (la carte est un lien),
                      le bouton « Relancer » vit sur la page détail. */}
                  {((c.status === "paused" && c.paused_reason) ||
                    (c.status === "active" && windowState !== "open")) && (
                    <div className="mt-3">
                      <CampaignStateBanner
                        campaign={c}
                        windowState={windowState}
                      />
                    </div>
                  )}
                  {s && (
                    <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-sm text-zinc-500">
                      <span>
                        <span className="font-semibold text-zinc-900">
                          {s.spins}
                        </span>{" "}
                        tour{s.spins > 1 ? "s" : ""} joué
                        {s.spins > 1 ? "s" : ""}
                      </span>
                      <span>
                        <span className="font-semibold text-zinc-900">
                          {s.wins}
                        </span>{" "}
                        gain{s.wins > 1 ? "s" : ""}
                      </span>
                      {s.pending > 0 && (
                        <span className="text-amber-600 font-medium">
                          {s.pending} à valider
                        </span>
                      )}
                    </div>
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
      <Pagination page={page} hasNext={hasNext} />
    </div>
  );
}
