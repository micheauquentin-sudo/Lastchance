import { AtelierEntree } from "@/components/dashboard/atelier-entree";
import {
  ETAPES_CONTEST,
  hrefEtapeContest,
  type EtapeContest,
} from "@/components/dashboard/atelier-contest-etapes";
import { LockedNotice } from "@/components/dashboard/contest-settings";

/**
 * LA PORTE DE L'ATELIER DU CHAMPIONNAT — la déclinaison pronostics
 * d'`AtelierEntree`.
 *
 * La page détail a deux visages : sans `?etape=`, elle SUIT (classement,
 * clôture, palmarès) ; avec, elle PRÉPARE. Cette carte est la seule couture
 * entre les deux — sans elle, l'atelier ne serait atteignable que par la Carte
 * de l'Aventure, c'est-à-dire par un seul lien vers une seule étape.
 *
 * Ce qui lui est propre : le bandeau de règlement gelé, rendu ici (en
 * `children`) et non ailleurs, parce qu'il doit se lire AVANT de cliquer sur
 * une étape qui n'acceptera plus de modification.
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
    <AtelierEntree
      etapes={ETAPES_CONTEST}
      hrefPour={(cle) => hrefEtapeContest(contestId, cle as EtapeContest)}
      titre="L'atelier du championnat"
      sousTitre="Six étapes pour préparer votre championnat, du nom aux récompenses. Chacune s'enregistre pour elle-même : vous pouvez vous arrêter et revenir."
    >
      {(locked || finalized) && <LockedNotice finalized={finalized} />}
    </AtelierEntree>
  );
}
