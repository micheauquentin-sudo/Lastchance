import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { listExperienceBlueprints } from "@/actions/experience-blueprints";
import { ExperienceBlueprintGallery } from "@/components/dashboard/experience-blueprint-gallery";
import { PageHeader } from "@/components/ui/page-header";
import { getUserAndOrg } from "@/lib/auth";
import { lienSelonRole } from "@/lib/liens-proprietaire";
import { hasCompAccess } from "@/lib/subscription";
import {
  activeExperienceKinds,
  EXPERIENCE_CATALOG,
  isExperienceActive,
  type ExperienceObjective,
} from "@/platform/experiences/catalog";

/**
 * UN SEUL NOM. Cet écran en portait trois — entrée de menu « Découvrir »,
 * titre d'onglet « Découvrir les expériences », h1 « Choisissez un objectif,
 * pas seulement un jeu » sous un sur-titre « Galerie d'expériences ». On ne
 * peut pas en parler au téléphone avec le support. Le libellé du menu fait
 * foi ; la phrase d'intention descend en sous-titre, où elle reste vraie.
 */
export const metadata: Metadata = { title: "Découvrir" };

/**
 * Retours des quatre actions de modèles. Elles redirigent ICI avec un
 * paramètre : la page est le seul endroit qui sache les rendre lisibles.
 */
const BLUEPRINT_NOTICES: Record<string, string> = {
  blueprint_created: "Modèle créé. Il est en brouillon, strictement privé à votre organisation.",
  blueprint_published: "Version publiée. Elle est désormais immuable et applicable.",
  blueprint_restored: "Version restaurée dans une nouvelle version, sans rien écraser.",
};

const OBJECTIVES: ExperienceObjective[] = [
  "Acquérir",
  "Fidéliser",
  "Animer en direct",
  "Créer du trafic",
];

export default async function DiscoverExperiencesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { organization, role } = await getUserAndOrg();
  if (!organization) redirect("/login");
  if (role !== "owner" && role !== "editor") redirect("/dashboard/redeem");

  const params = await searchParams;
  const rawError = params.blueprint_error;
  const blueprintError = typeof rawError === "string" ? rawError : null;
  const noticeKey = Object.keys(BLUEPRINT_NOTICES).find((key) => key in params);

  const fullAccess = hasCompAccess(organization);
  const [blueprints, activeKinds] = await Promise.all([
    listExperienceBlueprints(),
    Promise.resolve(activeExperienceKinds(organization, fullAccess)),
  ]);

  return (
    <div>
      <PageHeader
        surtitre="Outils"
        titre="Découvrir"
        sousTitre="Choisissez un objectif, pas seulement un jeu."
      />

      <p className="mb-8 max-w-3xl text-sm font-semibold text-k-body">
        La navigation principale reste concentrée sur vos modules actifs.
        Retrouvez ici toute la plateforme et les usages adaptés à votre
        établissement.
      </p>

      {blueprintError ? (
        <p
          role="alert"
          className="mb-6 rounded-xl border-2 border-red-300 bg-red-50 p-3 text-sm font-bold text-red-900"
        >
          {blueprintError}
        </p>
      ) : noticeKey ? (
        <p
          role="status"
          className="mb-6 rounded-xl border-2 border-emerald-300 bg-emerald-50 p-3 text-sm font-bold text-emerald-900"
        >
          {BLUEPRINT_NOTICES[noticeKey]}
        </p>
      ) : null}

      <div className="space-y-10">
        {OBJECTIVES.map((objective) => {
          const entries = EXPERIENCE_CATALOG.filter(
            (entry) => entry.objective === objective,
          );
          return (
            <section key={objective} aria-labelledby={`objective-${objective}`}>
              <h2
                id={`objective-${objective}`}
                className="mb-4 text-xl font-black text-k-ink"
              >
                {objective}
              </h2>
              <div className="grid gap-4 md:grid-cols-2">
                {entries.map((entry) => {
                  const active = isExperienceActive(
                    organization,
                    entry.kind,
                    fullAccess,
                  );
                  return (
                    <article
                      key={entry.kind}
                      className="rounded-2xl border-2 border-k-ink bg-white p-5 shadow-[4px_4px_0_rgba(33,29,22,0.9)]"
                    >
                      <div className="flex items-start justify-between gap-4">
                        <h3 className="text-lg font-black text-k-ink">
                          {entry.label}
                        </h3>
                        <span
                          className={
                            active
                              ? "rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-black text-emerald-800"
                              : "rounded-full bg-zinc-100 px-2.5 py-1 text-xs font-black text-zinc-600"
                          }
                        >
                          {active ? "Actif" : "À découvrir"}
                        </span>
                      </div>
                      <p className="mt-2 min-h-10 text-sm font-semibold text-k-body">
                        {entry.shortDescription}
                      </p>
                      {(() => {
                        // « Voir les offres » mène aux réglages, qui renvoient
                        // tout non-propriétaire sur « Vue d'ensemble » sans un
                        // mot : l'éditeur — qui a bien accès à cette page —
                        // cliquait dans le vide. On lui dit à qui s'adresser
                        // plutôt que de le promener, comme le fait déjà
                        // `PlanUpsell`.
                        const href = active
                          ? entry.dashboardHref
                          : lienSelonRole("/dashboard/settings#subscription", role);
                        return href ? (
                          <Link
                            href={href}
                            className="mt-5 inline-flex rounded-xl border-2 border-k-ink bg-k-yellow px-4 py-2 text-sm font-black text-k-ink hover:bg-k-orange/30"
                          >
                            {active ? "Ouvrir" : "Voir les offres"}
                          </Link>
                        ) : (
                          <p className="mt-5 text-sm font-semibold text-k-body">
                            Demandez au propriétaire du compte d&apos;activer ce
                            module.
                          </p>
                        );
                      })()}
                    </article>
                  );
                })}
              </div>
            </section>
          );
        })}

        <ExperienceBlueprintGallery
          blueprints={blueprints}
          activeKinds={activeKinds}
          role={role}
        />
      </div>
    </div>
  );
}
