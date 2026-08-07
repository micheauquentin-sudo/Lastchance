import Link from "next/link";
import { useId } from "react";
import { Card } from "@/components/ui/card";
import {
  attentionCount,
  getAnimationCenterMetrics,
  type AnimationCenterInput,
  type AnimationCenterMetric,
} from "@/components/dashboard/animation-center-state";

/**
 * Destinations fournies par le parent, clé par clé. Le composant n'en fabrique
 * AUCUNE : c'est la page serveur qui sait quel rôle a le droit d'aller où, et
 * une tuile sans lien reste un simple repère chiffré.
 */
export type AnimationCenterLinks = Partial<
  Record<keyof AnimationCenterInput, string>
>;

type AnimationCenterProps = {
  counts: AnimationCenterInput;
  links?: AnimationCenterLinks;
  /**
   * Rendu DANS la même carte, sous les tuiles : les « prochains coups de main »
   * y sont désormais fondus. Deux cartes voisines racontaient le même état de
   * l'animation avec deux barèmes de progression contradictoires — c'est UNE
   * section, donc un seul landmark et un seul titre.
   */
  children?: React.ReactNode;
};

/**
 * Centre d'animation : la synthèse que le commerçant lit en arrivant, à partir
 * de compteurs calculés côté serveur.
 *
 * Une tuile devient cliquable UNIQUEMENT si le parent a fourni un lien pour sa
 * clé. Aucun href n'est construit ici, et un lien fourni ne remplace jamais la
 * garde de la page cible : c'est un raccourci, pas une autorisation.
 */
export function AnimationCenter({
  counts,
  links,
  children,
}: AnimationCenterProps) {
  const metrics = getAnimationCenterMetrics(counts);
  const alerts = attentionCount(metrics);
  const headingId = useId();

  return (
    <section aria-labelledby={headingId}>
      <Card className="space-y-5 bg-k-bg">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-black uppercase tracking-wide text-k-orange">
              Centre d&apos;animation
            </p>
            <h2 id={headingId} className="mt-1 text-xl font-black text-k-ink">
              Où en sont vos animations
            </h2>
            <p className="mt-1 text-sm font-bold text-k-body">
              Les repères utiles avant d&apos;ouvrir une animation au public.
            </p>
          </div>
          {alerts > 0 && (
            <span className="rounded-full border-2 border-k-ink bg-k-yellow px-3 py-1 text-sm font-black text-k-ink">
              {alerts} point{alerts > 1 ? "s" : ""} à regarder
            </span>
          )}
        </div>

        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {metrics.map((metric) => (
            <li key={metric.key}>
              <MetricTile metric={metric} href={links?.[metric.key]} />
            </li>
          ))}
        </ul>

        {children}
      </Card>
    </section>
  );
}

function MetricTile({
  metric,
  href,
}: {
  metric: AnimationCenterMetric;
  href?: string;
}) {
  const background =
    metric.tone === "attention"
      ? "bg-k-yellow/30"
      : metric.tone === "live"
        ? "bg-k-green/30"
        : "bg-white";
  const className = `block h-full rounded-2xl border-2 border-k-ink p-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-k-ink ${background}`;

  const content = (
    <>
      <p className="tabular-nums text-3xl font-black text-k-ink">{metric.count}</p>
      <h3 className="mt-1 text-sm font-black text-k-ink">{metric.label}</h3>
      <p className="mt-1 text-xs font-bold leading-5 text-k-body">
        {metric.description}
      </p>
    </>
  );

  if (!href) return <div className={className}>{content}</div>;

  return (
    <Link href={href} className={`${className} transition-colors hover:bg-k-yellow/60`}>
      {content}
    </Link>
  );
}
