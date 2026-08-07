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
