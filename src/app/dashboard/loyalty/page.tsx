import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getUserAndOrg } from "@/lib/auth";
import { capacitesDuModule } from "@/lib/module-capabilities-server";
import { createClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { LoyaltyStatusBadge } from "@/components/dashboard/loyalty-status";
import { ModuleCapabilityNotice } from "@/components/dashboard/module-capability-notice";
import { NewLoyaltyForm } from "@/components/dashboard/new-loyalty-form";
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
import type { LoyaltyProgram } from "@/types/database";

export const metadata: Metadata = { title: "Passeport fidélité" };

/** Le `check` de `loyalty_programs.status` : trois valeurs, pas de `paused`. */
const STATUTS: readonly StatutModule[] = [
  { value: "draft", etat: "brouillon" },
  { value: "active", etat: "ouverte" },
  { value: "archived", etat: "cloturee" },
];

const MODE_LABEL = {
  rotating_code: "Code au comptoir",
  staff: "Validation en caisse",
} as const;

export default async function LoyaltyPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; statut?: string; page?: string }>;
}) {
  const filtres = litFiltresModule(await searchParams, STATUTS);
  const { organization, role } = await getUserAndOrg();
  const supabase = await createClient();

  // Découvrir / préparer / publier (cahier §3).
  const capacites = await capacitesDuModule("loyalty");
  if (!capacites.canExplore) notFound();

  let requete = supabase
    .from("loyalty_programs")
    .select(
      "id, name, status, validation_mode, silver_threshold, gold_threshold, created_at",
    )
    .eq("organization_id", organization!.id)
    .order("created_at", { ascending: false })
    .range(filtres.from, filtres.to);
  if (filtres.terme) requete = requete.ilike("name", `%${filtres.terme}%`);
  if (filtres.statut) requete = requete.eq("status", filtres.statut);

  const { data: programs } = await requete;

  const { lignes: programList, hasNext } = couperPage(
    (programs ?? []) as Array<
      Pick<
        LoyaltyProgram,
        "id" | "name" | "status" | "validation_mode" | "created_at"
      >
    >,
  );

  /**
   * LES COMPTES DE LA PAGE, ET D'ELLE SEULE.
   *
   * Paliers et membres étaient chargés pour TOUTE l'organisation afin d'en
   * compter vingt programmes — un passeport à vingt mille porteurs transférait
   * vingt mille lignes par affichage. Les paliers se bornent (`in`), les
   * MEMBRES se comptent en base : deux chiffres par programme (le total, et
   * les niveaux argent/or que la carte affiche à part), donc deux `count exact
   * head`. Les identifiants sont ceux d'APRÈS `couperPage`, ce qui impose
   * l'aller-retour supplémentaire. La garde `role === "owner"` est inchangée.
   */
  const programIds = programList.map((p) => p.id);
  const idsMembres = role === "owner" ? programIds : [];
  const [milestoneCount, memberCount, tierCount] = await Promise.all([
    comptesGroupes(programIds, "program_id", () =>
      supabase
        .from("loyalty_milestones")
        .select("program_id")
        .eq("organization_id", organization!.id),
    ),
    comptesParParent(idsMembres, "program_id", () =>
      supabase
        .from("loyalty_members")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", organization!.id),
    ),
    // Le second chiffre de la carte : les porteurs argent et or.
    comptesParParent(idsMembres, "program_id", () =>
      supabase
        .from("loyalty_members")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", organization!.id)
        .in("tier", ["silver", "gold"]),
    ),
  ]);

  return (
    <div>
      <PageHeader
        surtitre="Vos animations"
        titre="Passeport fidélité"
        sousTitre="Des passeports de fidélité : cumul de visites, niveaux et paliers à débloquer."
        actions={capacites.canEditDraft ? <NewLoyaltyForm /> : null}
      />

      <ModuleCapabilityNotice capacites={capacites} entitlement="loyalty">
        Validation par code tournant au comptoir ou par scan en caisse, niveaux
        et paliers personnalisables.
      </ModuleCapabilityNotice>

      <ModuleListFilters
        idPrefix="loyalty-filtre"
        filtres={filtres}
        statuts={STATUTS}
        placeholder="Nom du programme…"
      />

      {!programList.length ? (
        <Card className="text-center py-12">
          {filtres.actif ? (
            <ModuleListAucunResultat quoi="programme" />
          ) : (
            <>
              <p className="text-zinc-500">
                Aucun programme pour l&apos;instant. Créez le premier !
              </p>
              {/* LE BOUTON EST ICI AUSSI : « créez le premier » sans rien à
                  cliquer laissait le seul bouton en haut d'écran, hors du
                  regard de celui qui vient de lire la phrase. */}
              {capacites.canEditDraft ? (
                <div className="mt-4 flex justify-center">
                  <NewLoyaltyForm instanceId="-vide" />
                </div>
              ) : null}
            </>
          )}
        </Card>
      ) : (
        <ul className="space-y-3">
          {programList.map((p) => {
            const paliers = milestoneCount.get(p.id) ?? 0;
            const passports = memberCount.get(p.id) ?? 0;
            const levels = tierCount.get(p.id) ?? 0;
            return (
              <li key={p.id}>
                <Link
                  href={`/dashboard/loyalty/${p.id}`}
                  className="block rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm hover:border-orange-300 transition-colors"
                >
                  <div className="flex items-center justify-between gap-4">
                    <div className="min-w-0 flex items-center gap-3">
                      <span className="text-2xl" aria-hidden>
                        🎟️
                      </span>
                      <div className="min-w-0">
                        <p className="font-semibold truncate">{p.name}</p>
                        <p className="text-sm text-zinc-500 mt-0.5">
                          {paliers} palier{paliers > 1 ? "s" : ""} ·{" "}
                          {MODE_LABEL[p.validation_mode]} · créé le{" "}
                          {formatDate(p.created_at)}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      {role === "owner" && (
                        <span className="text-sm text-zinc-500">
                          <span className="font-semibold text-zinc-900">
                            {passports}
                          </span>{" "}
                          passeport{passports > 1 ? "s" : ""}
                          {levels > 0 && (
                            <>
                              {" · "}
                              <span className="font-semibold text-zinc-900">
                                {levels}
                              </span>{" "}
                              niveau{levels > 1 ? "x" : ""}
                            </>
                          )}
                        </span>
                      )}
                      <LoyaltyStatusBadge status={p.status} />
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
