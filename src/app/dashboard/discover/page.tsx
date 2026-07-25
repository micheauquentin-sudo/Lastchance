import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getUserAndOrg } from "@/lib/auth";
import {
  EXPERIENCE_CATALOG,
  isExperienceActive,
  type ExperienceObjective,
} from "@/platform/experiences/catalog";

export const metadata: Metadata = { title: "Découvrir les expériences" };

const OBJECTIVES: ExperienceObjective[] = [
  "Acquérir",
  "Fidéliser",
  "Animer en direct",
  "Créer du trafic",
];

export default async function DiscoverExperiencesPage() {
  const { organization, role } = await getUserAndOrg();
  if (!organization) redirect("/login");
  if (role !== "owner" && role !== "editor") redirect("/dashboard/redeem");

  return (
    <div>
      <div className="mb-8 max-w-3xl">
        <p className="mb-2 text-sm font-black uppercase tracking-[0.16em] text-k-orange">
          Galerie d&apos;expériences
        </p>
        <h1 className="text-3xl font-black text-k-ink">
          Choisissez un objectif, pas seulement un jeu
        </h1>
        <p className="mt-3 text-sm font-semibold text-k-body">
          La navigation principale reste concentrée sur vos modules actifs.
          Retrouvez ici toute la plateforme et les usages adaptés à votre
          établissement.
        </p>
      </div>

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
                      <Link
                        href={
                          active
                            ? entry.dashboardHref
                            : "/dashboard/settings#subscription"
                        }
                        className="mt-5 inline-flex rounded-xl border-2 border-k-ink bg-k-yellow px-4 py-2 text-sm font-black text-k-ink hover:bg-k-orange/30"
                      >
                        {active ? "Ouvrir" : "Voir les offres"}
                      </Link>
                    </article>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
