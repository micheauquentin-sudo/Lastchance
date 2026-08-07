import type { ReactNode } from "react";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import type { EtapeAtelier } from "@/components/dashboard/atelier-etapes";

/**
 * LA PORTE DE L'ATELIER, sur la vue suivi — générique, partagée par tous les
 * modules.
 *
 * Les sept modules à atelier (quiz, calendrier, championnat, chasse,
 * passeport, cagnotte, soirée) en avaient chacun leur copie : trois composants
 * quasi identiques et quatre variantes inline, écrites en parallèle par des
 * lots qui n'avaient pas le droit de toucher aux primitives. Le geste est
 * pourtant le même partout — lister les étapes en toutes lettres plutôt qu'un
 * bouton unique, parce que le commerçant qui revient ne recommence pas au
 * début : il vient corriger UN point, et il sait lequel.
 *
 * Ce qui reste PROPRE À CHAQUE MODULE reste passé en props : le titre, la
 * phrase d'introduction (parfois calculée, comme le « N cases garnies » du
 * calendrier) et les compléments spécifiques (`children` — le bandeau de
 * règlement gelé des pronostics).
 */
export function AtelierEntree({
  etapes,
  hrefPour,
  titre = "L'atelier",
  sousTitre,
  cleOuverture,
  children,
}: {
  etapes: readonly EtapeAtelier[];
  /** URL de l'étape, construite par le module (il connaît sa base). */
  hrefPour: (cle: string) => string;
  titre?: string;
  /** Une ligne sur ce qui se prépare ici. Peut être calculée. */
  sousTitre?: ReactNode;
  /**
   * Étape que vise le bouton « Ouvrir l'atelier ». Par défaut la première —
   * le calendrier vise « Les cases », qui est son geste le plus fréquent.
   */
  cleOuverture?: string;
  /** Compléments propres au module, rendus au-dessus de la liste. */
  children?: ReactNode;
}) {
  const ouverture = cleOuverture ?? etapes[0]?.cle;

  return (
    <Card>
      <h2 className="font-semibold mb-1">{titre}</h2>
      {sousTitre ? (
        <p className="text-sm text-zinc-500 mb-4">{sousTitre}</p>
      ) : null}

      {children}

      <ol className="mb-4 grid gap-2 sm:grid-cols-2">
        {etapes.map((etape, index) => (
          <li key={etape.cle}>
            <Link
              href={hrefPour(etape.cle)}
              className="flex h-full items-start gap-3 rounded-2xl border-2 border-k-ink/25 bg-white p-3 transition-colors hover:border-k-ink hover:bg-k-yellow/20 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-k-ink"
            >
              <span
                aria-hidden
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 border-k-ink bg-k-bg text-sm font-black text-k-ink"
              >
                {index + 1}
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-black text-k-ink">
                  {etape.titre}
                </span>
                {etape.resume ? (
                  <span className="mt-0.5 block text-xs font-semibold text-k-body">
                    {etape.resume}
                  </span>
                ) : null}
              </span>
            </Link>
          </li>
        ))}
      </ol>

      {ouverture ? (
        <Link
          href={hrefPour(ouverture)}
          className="k-btn-sm inline-flex rounded-xl border-2 border-k-ink bg-k-yellow px-4 py-2.5 text-sm font-black text-k-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-k-ink"
        >
          Ouvrir l&apos;atelier
        </Link>
      ) : null}
    </Card>
  );
}
