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
import { HuntStatusBadge } from "@/components/dashboard/hunt-status";
import { ModuleCapabilityNotice } from "@/components/dashboard/module-capability-notice";
import { NewHuntForm } from "@/components/dashboard/new-hunt-form";
import { Pagination } from "@/components/dashboard/pagination";
import {
  couperPage,
  litFiltresModule,
  ModuleListAucunResultat,
  ModuleListFilters,
  paramsPagination,
  type StatutModule,
} from "@/components/dashboard/module-list-filters";
import {
  comptesGroupes,
  comptesParParent,
} from "@/components/dashboard/module-list-counts";
import type { Hunt } from "@/types/database";

export const metadata: Metadata = { title: "Chasse au QR" };

/** Le `check` de `hunts.status` : trois valeurs, pas de `paused`. */
const STATUTS: readonly StatutModule[] = [
  { value: "draft", etat: "brouillon" },
  { value: "active", etat: "ouverte" },
  { value: "archived", etat: "cloturee" },
];

export default async function HuntsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; statut?: string; page?: string }>;
}) {
  const filtres = litFiltresModule(await searchParams, STATUTS);
  const { organization, role } = await getUserAndOrg();
  const supabase = await createClient();

  // DÉCOUVRIR, PRÉPARER, PUBLIER — et non plus un seul booléen d'accès.
  // Avant, cette page rendait UNIQUEMENT une carte d'offre sans le module : le
  // commerçant devait payer pour voir ce qu'il payait. Le cahier §3 tranche
  // l'inverse — tout est visible, seule la publication est verrouillée, et
  // elle l'est en base (`assert_module_publish_allowed`), pas par cet écran.
  const capacites = await capacitesDuModule("hunts");
  if (!capacites.canExplore) notFound();

  let requete = supabase
    .from("hunts")
    .select("*")
    .eq("organization_id", organization!.id)
    .order("created_at", { ascending: false })
    .range(filtres.from, filtres.to);
  if (filtres.terme) requete = requete.ilike("name", `%${filtres.terme}%`);
  if (filtres.statut) requete = requete.eq("status", filtres.statut);

  const { data: hunts } = await requete;

  const { lignes: huntList, hasNext } = couperPage((hunts ?? []) as Hunt[]);

  /**
   * LES COMPTES DE LA PAGE, ET D'ELLE SEULE.
   *
   * Les deux requêtes ramenaient toutes les étapes ET tous les joueurs de
   * l'organisation pour n'en compter que ceux des vingt chasses affichées —
   * une chasse à vingt mille inscrits transférait vingt mille lignes pour
   * afficher « 20 000 ». Les identifiants ne sont connus qu'APRÈS
   * `couperPage` : le `Promise.all` d'origine ne pouvait pas les avoir, d'où
   * l'aller-retour supplémentaire, assumé.
   *
   * Les étapes se bornent (`in`), les JOUEURS se comptent en base — un `in`
   * ne réduirait pas le volume, seul `count exact head` ne transfère rien.
   * La garde `role === "owner"` est inchangée.
   */
  const huntIds = huntList.map((h) => h.id);
  const [stepCount, playerCount] = await Promise.all([
    comptesGroupes(huntIds, "hunt_id", () =>
      supabase
        .from("hunt_steps")
        .select("hunt_id")
        .eq("organization_id", organization!.id),
    ),
    comptesParParent(role === "owner" ? huntIds : [], "hunt_id", () =>
      supabase
        .from("hunt_players")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", organization!.id),
    ),
  ]);

  return (
    <div>
      <PageHeader
        surtitre="Vos animations"
        titre="Chasse au QR"
        sousTitre={sousTitreTableauDeBord("hunts")}
        actions={capacites.canEditDraft ? <NewHuntForm /> : null}
      />

      <ModuleCapabilityNotice capacites={capacites} entitlement="hunts">
        2 à 10 étapes par Chasse au QR, ordre libre ou imposé, lot final remis en
        caisse.
      </ModuleCapabilityNotice>

      <ModuleListFilters
        idPrefix="hunt-filtre"
        filtres={filtres}
        statuts={STATUTS}
        placeholder="Nom de la Chasse au QR…"
      />

      {!huntList.length ? (
        <Card className="text-center py-12">
          {filtres.actif ? (
            <ModuleListAucunResultat quoi="parcours QR" />
          ) : (
            <>
              <p className="text-zinc-500">
                Aucune Chasse au QR pour l&apos;instant. Créez la première !
              </p>
              {/* LE BOUTON EST ICI AUSSI, et ce n'est pas un doublon : l'état
                  vide disait « créez la première » sans rien à cliquer, et le
                  seul bouton vivait en haut d'écran, hors du regard de celui
                  qui vient de lire la phrase. */}
              {capacites.canEditDraft ? (
                <div className="mt-4 flex justify-center">
                  <NewHuntForm instanceId="-vide" />
                </div>
              ) : null}
            </>
          )}
        </Card>
      ) : (
        <ul className="space-y-3">
          {huntList.map((h) => {
            const steps = stepCount.get(h.id) ?? 0;
            const players = playerCount.get(h.id) ?? 0;
            return (
              <li key={h.id}>
                <Link
                  href={`/dashboard/hunts/${h.id}`}
                  className="block rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm hover:border-orange-300 transition-colors"
                >
                  <div className="flex items-center justify-between gap-4">
                    <div className="min-w-0 flex items-center gap-3">
                      <span className="text-2xl" aria-hidden>
                        🗺️
                      </span>
                      <div className="min-w-0">
                        <p className="font-semibold truncate">{h.name}</p>
                        <p className="text-sm text-zinc-500 mt-0.5">
                          {steps} étape{steps > 1 ? "s" : ""}
                          {h.reward_label ? ` · ${h.reward_label}` : ""} · créée
                          le {formatDate(h.created_at)}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      {role === "owner" && (
                        <span className="text-sm text-zinc-500">
                          <span className="font-semibold text-zinc-900">
                            {players}
                          </span>{" "}
                          joueur{players > 1 ? "s" : ""}
                        </span>
                      )}
                      <span className="text-sm text-zinc-500">
                        <span className="font-semibold text-zinc-900">
                          {h.reward_claimed_count}
                        </span>{" "}
                        gagné{h.reward_claimed_count > 1 ? "s" : ""}
                      </span>
                      <HuntStatusBadge status={h.status} />
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
