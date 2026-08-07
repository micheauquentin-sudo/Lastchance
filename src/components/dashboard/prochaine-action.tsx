import Link from "next/link";
import { useId } from "react";
import type { ProchaineAction } from "@/components/dashboard/prochaine-action-state";

/**
 * LE BLOC HERO DE LA VUE D'ENSEMBLE.
 *
 * Une seule réponse à « je fais quoi maintenant ? », avec un vrai bouton — la
 * page n'en avait aucun. Le guidage se DISTINGUE du contenu : fond `k-yellow`
 * bordé encre, quand les cartes de réglages et de résultats restent blanches.
 *
 * Le calcul vit dans `prochaine-action-state.ts` : ce composant ne décide rien,
 * ne fabrique aucune destination (elles sont déjà passées par `lienSelonRole`)
 * et ne peut donc pas inventer un lien que le rôle ne pourrait pas ouvrir.
 *
 * L'animation d'apparition est portée par `cartoon-pop-in`, neutralisée par la
 * règle `prefers-reduced-motion` de `globals.css` — pas de mouvement imposé.
 */
export function ProchaineActionPanel({ action }: { action: ProchaineAction }) {
  const headingId = useId();
  const progression = action.progression;

  return (
    <section aria-labelledby={headingId} className="mb-8">
      <div className="cartoon-pop-in rounded-2xl border-2 border-k-ink bg-k-yellow p-6 shadow-[4px_4px_0_rgba(33,29,22,0.9)]">
        <p className="text-xs font-black uppercase tracking-wide text-k-ink/70">
          Votre prochaine action
        </p>
        <h2
          id={headingId}
          className="mt-1 text-xl font-black text-k-ink sm:text-2xl"
        >
          {action.titre}
        </h2>
        <p className="mt-1 text-sm font-bold text-k-ink/80">{action.phrase}</p>

        {progression && (
          <div className="mt-4">
            <div
              className="h-2.5 overflow-hidden rounded-full border-2 border-k-ink bg-white"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={progression.total}
              aria-valuenow={progression.faites}
              aria-label={`${progression.faites} étape sur ${progression.total} terminée`}
            >
              <div
                className="h-full rounded-full bg-k-green transition-[width] duration-500"
                style={{
                  width: `${Math.round((progression.faites / progression.total) * 100)}%`,
                }}
              />
            </div>
          </div>
        )}

        {action.cta && (
          <Link
            href={action.cta.href}
            className="k-btn-sm mt-5 inline-flex items-center gap-2 rounded-xl border-2 border-k-ink bg-k-ink px-5 py-2.5 text-sm font-black text-k-bg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-k-ink"
          >
            {action.cta.label}
            <svg aria-hidden width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path
                d="M3 8h10M9 4l4 4-4 4"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </Link>
        )}

        {action.restantes && action.restantes.length > 0 && (
          <div className="mt-5">
            <p className="text-xs font-black uppercase tracking-wide text-k-ink/70">
              Ensuite
            </p>
            <ul className="mt-2 space-y-1.5">
              {action.restantes.map((etape) => (
                <li key={etape.key}>
                  <Link
                    href={etape.href}
                    className="text-sm font-bold text-k-ink underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-k-ink"
                  >
                    {etape.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </section>
  );
}
