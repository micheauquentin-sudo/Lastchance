export type GuidedJourneyStep = {
  /** Identifiant stable pour React et les mesures produit du parent. */
  key: string;
  label: string;
  description: string;
  /** Une étape bloquée ne fournit jamais de lien. */
  href?: string;
  status: "complete" | "current" | "upcoming" | "blocked";
  /** Raison lisible affichée au lieu d'un bouton qui échouerait. */
  blockedReason?: string;
  /**
   * Libellé du bouton du bas quand cette étape est la prochaine. Absent, le
   * bouton retombe sur « Continuer : <label> » — le nom de la phase.
   */
  ctaLabel?: string;
};

/**
 * Ce que la carte dit quand il n'y a plus d'étape suivante.
 *
 * Le parent le fournit : lui seul sait si « plus d'étape » veut dire « c'est
 * terminé » ou « vos droits s'arrêtent là ». Sans cette distinction, la carte
 * félicitait dans les deux cas.
 */
export type GuidedJourneyConclusion = {
  message: string;
  cta?: { label: string; href: string };
};

export type GuidedJourneySnapshot = {
  total: number;
  completed: number;
  percentage: number;
  nextStep: (GuidedJourneyStep & { href: string }) | null;
};

function isNavigableStep(
  step: GuidedJourneyStep,
): step is GuidedJourneyStep & { href: string } {
  return Boolean(step.href) && step.status !== "blocked";
}

/**
 * Etat d'affichage pur de la Carte de l'Aventure.
 *
 * Le parent fournit seulement les étapes accessibles au rôle courant, ainsi
 * que leurs liens déjà autorisés. Cette fonction ne choisit aucun droit et ne
 * remplace jamais les contrôles des pages ou des actions serveur.
 */
export function getGuidedJourneySnapshot(
  steps: GuidedJourneyStep[],
): GuidedJourneySnapshot {
  const completed = steps.filter((step) => step.status === "complete").length;
  const total = steps.length;
  const current = steps.find(
    (step): step is GuidedJourneyStep & { href: string } =>
      step.status === "current" && isNavigableStep(step),
  );
  const upcoming = steps.find(
    (step): step is GuidedJourneyStep & { href: string } =>
      step.status === "upcoming" && isNavigableStep(step),
  );

  return {
    total,
    completed,
    percentage: total === 0 ? 0 : Math.round((completed / total) * 100),
    nextStep: current ?? upcoming ?? null,
  };
}

/**
 * LA CARTE DE L'AVENTURE EN UNE LIGNE — ce qu'on lit quand elle est repliée.
 *
 * La carte naît repliée sur les huit pages détail : sa barre est alors le SEUL
 * endroit où le commerçant lit où il en est. La ligne doit donc dire la phase
 * RÉELLE, jamais un texte figé — c'est exactement le reproche fait aux
 * anciennes félicitations de la carte, qui saluaient une animation en pause.
 *
 * Trois cas, dans cet ordre :
 *   1. une étape suivante atteignable → on la nomme ;
 *   2. plus rien d'atteignable mais tout n'est pas fait (étape bloquée, ou
 *      sans lien) → on nomme celle qui attend, plutôt que de laisser croire
 *      que c'est terminé ;
 *   3. tout est complet → le mot de la fin du parent s'il en fournit un.
 *
 * L'avancement `n/total` précède toujours : c'est le même chiffre que la
 * pastille de la carte ouverte, on ne veut pas deux comptes différents.
 */
export function resumeAventure(
  steps: GuidedJourneyStep[],
  conclusion?: GuidedJourneyConclusion | null,
): string {
  const { total, completed, nextStep } = getGuidedJourneySnapshot(steps);
  if (total === 0) return "";

  const avancement = `${completed}/${total}`;
  if (nextStep) return `${avancement} — prochaine étape : ${nextStep.label}`;

  const enAttente = steps.find((step) => step.status !== "complete");
  if (enAttente) return `${avancement} — en attente : ${enAttente.label}`;

  return conclusion
    ? `${avancement} — ${conclusion.message}`
    : `${avancement} — toutes les étapes sont faites.`;
}
