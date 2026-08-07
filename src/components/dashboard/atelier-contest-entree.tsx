import Link from "next/link";
import { Card } from "@/components/ui/card";
import {
  ETAPES_CONTEST,
  hrefEtapeContest,
  type EtapeContest,
} from "@/components/dashboard/atelier-contest-etapes";
import { LockedNotice } from "@/components/dashboard/contest-settings";

/**
 * LA PORTE DE L'ATELIER, SUR LA VUE SUIVI.
 *
 * La page détail a deux visages : sans `?etape=`, elle SUIT (classement,
 * clôture, palmarès) ; avec, elle PRÉPARE. Cette carte est la seule couture
 * entre les deux — sans elle, l'atelier ne serait atteignable que par la Carte
 * de l'Aventure, c'est-à-dire par un seul lien vers une seule étape.
 *
 * Elle liste les six étapes plutôt qu'un bouton unique parce que le commerçant
 * qui revient ne recommence pas au début : il vient corriger UN point, et il
 * sait lequel.
 */
export function AtelierContestEntree({
  contestId,
  locked,
  finalized,
}: {
  contestId: string;
  /** Premier pronostic déposé ou coup d'envoi passé : règlement gelé. */
  locked: boolean;
  finalized: boolean;
}) {
  return (
    <Card>
      <h2 className="font-semibold mb-1">L&apos;atelier du championnat</h2>
      <p className="text-sm text-zinc-500 mb-4">
        Six étapes pour préparer votre championnat, du nom aux récompenses.
        Chacune s&apos;enregistre pour elle-même : vous pouvez vous arrêter et
        revenir.
      </p>
      {(locked || finalized) && <LockedNotice finalized={finalized} />}
      <ol className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {ETAPES_CONTEST.map((etape, index) => (
          <li key={etape.cle}>
            <Link
              href={hrefEtapeContest(contestId, etape.cle as EtapeContest)}
              className="flex h-full items-center gap-3 rounded-2xl border-2 border-k-ink/40 bg-white p-3 text-k-body transition-colors hover:border-k-ink hover:bg-k-yellow/30 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-k-ink"
            >
              <span
                aria-hidden
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 border-k-ink bg-k-bg text-sm font-black text-k-ink"
              >
                {index + 1}
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-black">{etape.titre}</span>
                <span className="mt-0.5 block text-xs font-bold leading-4">
                  {etape.resume}
                </span>
              </span>
            </Link>
          </li>
        ))}
      </ol>
      <Link
        href={hrefEtapeContest(contestId, "championnat")}
        className="mt-4 inline-flex rounded-xl border-2 border-k-ink bg-k-yellow px-4 py-2.5 text-sm font-black text-k-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-k-ink"
      >
        Ouvrir l&apos;atelier
      </Link>
    </Card>
  );
}
