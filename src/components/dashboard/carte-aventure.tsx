import { CarteRepliable } from "@/components/dashboard/carte-repliable";
import { GuidedJourney } from "@/components/dashboard/guided-journey";
import {
  resumeAventure,
  type GuidedJourneyConclusion,
  type GuidedJourneyStep,
} from "@/components/dashboard/guided-journey-state";

/** Le nom du bloc, écrit une fois : les huit pages le rendaient à l'identique. */
export const TITRE_CARTE_AVENTURE = "Carte de l'Aventure";

/**
 * LA CARTE DE L'AVENTURE, REPLIÉE — le même geste sur les huit pages détail.
 *
 * Les huit pages rendaient `GuidedJourney` en pleine hauteur, au-dessus de
 * tout : cinq tuiles de parcours, une barre de progression et un mot de la fin
 * traversés à chaque visite par un commerçant venu régler UNE chose. La
 * demande est de tout replier ; la carte y passe comme le reste.
 *
 * ── DEUX CHOIX QUI LA DISTINGUENT DES AUTRES TUILES ──
 *
 * 1. **Ni numéro ni verdict.** C'est une boussole, pas une case à cocher : lui
 *    donner un rang la ferait entrer dans la checklist numérotée que
 *    `src/lib/checklist/tuiles.ts` ordonne, et lui donner un statut afficherait
 *    un second verdict à côté de celui des tuiles — deux comptes pour la même
 *    chose. Les tuiles numérotées portent déjà l'état.
 * 2. **Pas d'ancre.** Aucun lien ne vise la carte ; ce sont ELLE et ses étapes
 *    qui visent `#statut`, `#suivi`, `#relance`. Ces liens vivent dans le
 *    contenu replié : on les atteint après avoir déplié, et l'auto-ouverture
 *    par `hashchange` de `CarteRepliable` fait le reste côté cible.
 *
 * Le résumé vient de `resumeAventure` : la phase réelle, jamais une phrase
 * figée (voir le commentaire de ce module).
 */
export function CarteAventure({
  steps,
  conclusion = null,
  titre = TITRE_CARTE_AVENTURE,
}: {
  steps: GuidedJourneyStep[];
  conclusion?: GuidedJourneyConclusion | null;
  titre?: string;
}) {
  // `GuidedJourney` rend `null` sans étape ; sans cette garde, la barre repliée
  // promettrait un contenu vide.
  if (steps.length === 0) return null;

  return (
    <CarteRepliable
      titre={titre}
      defaultOuvert={false}
      resume={resumeAventure(steps, conclusion)}
    >
      <GuidedJourney steps={steps} title={titre} conclusion={conclusion} />
    </CarteRepliable>
  );
}
