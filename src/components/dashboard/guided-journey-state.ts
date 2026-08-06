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
