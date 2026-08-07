import Link from "next/link";
import { Card } from "@/components/ui/card";
import {
  ETAPES_CALENDRIER,
  hrefEtapeCalendrier,
  type EtapeCalendrier,
} from "@/components/dashboard/atelier-calendar-etapes";

/**
 * LA PORTE DE L'ATELIER, sur la vue suivi.
 *
 * La page nue ne porte plus les cartes d'édition : sans cette carte, le
 * commerçant qui arrive sur son calendrier n'aurait AUCUN chemin visible vers
 * la préparation. Les étapes sont listées en toutes lettres parce que revenir
 * garnir une case précise est le geste le plus fréquent d'un calendrier, et
 * qu'il ne mérite pas de traverser le fil depuis le début.
 */
export function AtelierEntreeCalendrier({
  calendarId,
  garnies,
  total,
}: {
  calendarId: string;
  /** Cases complètes pour leur usage — le chiffre que la grille ne dit pas. */
  garnies: number;
  total: number;
}) {
  return (
    <Card>
      <h2 className="font-semibold mb-1">L&apos;atelier du calendrier</h2>
      <p className="text-sm text-zinc-500 mb-4">
        {total > 0 ? (
          <>
            <strong>
              {garnies} case{garnies > 1 ? "s" : ""} garnie
              {garnies > 1 ? "s" : ""} sur {total}
            </strong>
            . La préparation se fait en trois étapes, chacune s&apos;enregistre
            pour elle-même.
          </>
        ) : (
          <>
            La préparation se fait en trois étapes, chacune s&apos;enregistre
            pour elle-même.
          </>
        )}
      </p>

      <ol className="mb-4 grid gap-2 sm:grid-cols-3">
        {ETAPES_CALENDRIER.map((etape, index) => (
          <li key={etape.cle}>
            <Link
              href={hrefEtapeCalendrier(calendarId, etape.cle as EtapeCalendrier)}
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
                <span className="mt-0.5 block text-xs font-semibold text-k-body">
                  {etape.resume}
                </span>
              </span>
            </Link>
          </li>
        ))}
      </ol>

      <Link
        href={hrefEtapeCalendrier(calendarId, "cases")}
        className="k-btn-sm inline-flex rounded-xl border-2 border-k-ink bg-k-yellow px-4 py-2.5 text-sm font-black text-k-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-k-ink"
      >
        Ouvrir l&apos;atelier
      </Link>
    </Card>
  );
}
