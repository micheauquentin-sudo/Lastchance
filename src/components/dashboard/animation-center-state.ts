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
      // La tuile a retrouvé une destination — le hub QR filtré sur l'état
      // « brouillon » —, après avoir perdu la précédente : « Découvrir » est un
      // catalogue de modules par objectif et ne contient aucun brouillon.
      //
      // MAIS ELLE NE MÈNE PAS À SON PROPRE CHIFFRE, et la description le dit.
      // Les deux comptent à un grain différent, et aucun paramètre ne les
      // réconcilie (migration 20260923120000) : ce compteur compte des
      // RESSOURCES sur NEUF modules — le parrainage inclus —, le hub rend une
      // LIGNE PAR AFFICHE sur huit. Une campagne brouillon sans QR vaut 1 ici
      // et 0 là-bas ; à trois affiches, 1 ici et 3 là-bas. « Voir les affiches
      // concernées » est donc une promesse tenable ; « voir les 3 » ne le
      // serait pas.
      label: "Brouillons",
      description: "à terminer — voir les affiches concernées",
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
      // Même écart de grain que « Brouillons », donc même prudence de libellé :
      // la destination est le hub filtré sur `etat=actif`, qui rend des
      // affiches, pas les ressources que ce compteur additionne.
      description: "ouvertes aux joueurs — voir les affiches concernées",
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

/**
 * LE CHIFFRE DE LA TUILE = LE NOMBRE DE LIGNES DE LA LISTE, TOUJOURS.
 *
 * `teamTasks` est calculé côté serveur AVANT que le hero « Votre prochaine
 * action » ne s'approprie une tâche : la tuile annonçait « 4 » et la liste juste
 * en dessous, dans la MÊME carte, en affichait 3. Un compteur qu'on peut
 * démentir en comptant à l'écran discrédite les cinq autres.
 *
 * Recalculé ici sur exactement le même prédicat que `getTeamActionBoardSnapshot`
 * (`status === "ready"`, après retrait des clés masquées) : deux endroits, une
 * seule règle, et un test qui les tient ensemble.
 */
export function teamTasksAffichees(
  actionsEquipe: readonly { key: string; status: "ready" | "done" | "blocked" }[],
  masquees: readonly string[],
): number {
  const promues = new Set(masquees);
  return actionsEquipe.filter(
    (action) => action.status === "ready" && !promues.has(action.key),
  ).length;
}

export function attentionCount(metrics: AnimationCenterMetric[]): number {
  return metrics.filter((metric) => metric.tone === "attention" && metric.count > 0).length;
}
