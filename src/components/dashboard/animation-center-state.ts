export type AnimationCenterInput = Readonly<{
  drafts: number;
  qrToTest: number;
  liveExperiences: number;
  lowStockPrizes: number;
  rewardsToHandOver: number;
  teamTasks: number;
}>;

export type AnimationCenterMetric = {
  key: keyof AnimationCenterInput;
  label: string;
  description: string;
  count: number;
  tone: "calm" | "live" | "attention";
};

function safeCount(value: number): number {
  return Number.isFinite(value) ? Math.max(0, Math.trunc(value)) : 0;
}

/**
 * Transforme seulement des compteurs déjà calculés par le domaine. Aucun accès
 * aux données, aucun droit et aucun stock ne sont décidés dans cette synthèse.
 *
 * ── DEUX ÉTIQUETTES QUI NE DISENT PAS CE QUE LA CLÉ SUGGÈRE ──────────
 *
 * `qrToTest` s'affiche « QR jamais scannés » et non « QR à tester » : le
 * compteur derrière est `scan_count = 0`, donc un QR jamais scanné par
 * PERSONNE — ni le commerçant, ni un joueur. Écrire « à tester » promettait
 * une vérification que le produit ne mesure pas.
 *
 * `lowStockPrizes` s'affiche « Stocks faibles (roue) » : le seuil de stock
 * n'existe que sur les lots de la roue. Sans la parenthèse, un commerçant qui
 * gère un calendrier ou une chasse lirait un zéro rassurant sur des lots que
 * ce compteur ne regarde pas.
 *
 * Les CLÉS ne changent pas — elles sont le contrat avec le serveur qui calcule
 * ces nombres. Seul le mot affiché est ramené à ce qui est vrai.
 */
export function getAnimationCenterMetrics(
  input: AnimationCenterInput,
): AnimationCenterMetric[] {
  const drafts = safeCount(input.drafts);
  const qrToTest = safeCount(input.qrToTest);
  const liveExperiences = safeCount(input.liveExperiences);
  const lowStockPrizes = safeCount(input.lowStockPrizes);
  const rewardsToHandOver = safeCount(input.rewardsToHandOver);
  const teamTasks = safeCount(input.teamTasks);

  return [
    {
      key: "drafts",
      label: "Brouillons",
      description: "animations à terminer",
      count: drafts,
      tone: "calm",
    },
    {
      key: "qrToTest",
      label: "QR jamais scannés",
      description: "aucun scan enregistré pour l'instant",
      count: qrToTest,
      tone: qrToTest > 0 ? "attention" : "calm",
    },
    {
      key: "liveExperiences",
      label: "En cours",
      description: "animations ouvertes aux joueurs",
      count: liveExperiences,
      tone: "live",
    },
    {
      key: "lowStockPrizes",
      label: "Stocks faibles (roue)",
      description: "lots de la roue à réapprovisionner",
      count: lowStockPrizes,
      tone: lowStockPrizes > 0 ? "attention" : "calm",
    },
    {
      key: "rewardsToHandOver",
      label: "Gains à remettre",
      description: "retraits en attente en boutique",
      count: rewardsToHandOver,
      tone: rewardsToHandOver > 0 ? "attention" : "calm",
    },
    {
      key: "teamTasks",
      label: "Tâches d'équipe",
      description: "coups de main à organiser",
      count: teamTasks,
      tone: teamTasks > 0 ? "attention" : "calm",
    },
  ];
}

export function attentionCount(metrics: AnimationCenterMetric[]): number {
  return metrics.filter((metric) => metric.tone === "attention" && metric.count > 0).length;
}
