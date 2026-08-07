/**
 * « PEUT-ON OUVRIR CE JEU ? » — LA SEULE RÉPONSE DU DÉPÔT.
 *
 * La précondition d'activation du Mode événement vivait EN LIGNE dans
 * `setEventGameStatus` (`src/actions/events.ts`) : un `count` de questions et
 * un message. À l'écran, rien n'était calculé — le paragraphe « Ajoutez au
 * moins une question, puis ouvrez le jeu » de `EventGameStatusControls` est
 * statique, et le composant ne reçoit même pas le nombre de questions.
 *
 * Le prédicat est ici, pur et testé, consommé par l'action ET par l'étape
 * « La vérification » de l'atelier. Une seule vérité sur l'ouverture d'un jeu.
 *
 * ── CE QUE LE SERVEUR NE VÉRIFIE PAS, ET QUI COÛTE UNE SOIRÉE ──
 *
 * Une salle sans lot ou à stock 0 s'ouvre parfaitement : le podium s'affiche à
 * l'écran, et AUCUN code de retrait n'est émis. Le serveur ne refuse rien —
 * c'est un réglage légitime. La liste le RACONTE donc, sans bloquer.
 */

/** Un point de la liste de vérification (voir `activation/jackpot.ts`). */
export interface ControleActivation {
  cle: string;
  ok: boolean;
  bloquant: boolean;
  titre: string;
  detail: string;
  /** Clé d'étape de l'atelier qui corrige ce point, quand elle existe. */
  etape?: string;
}

/**
 * Jeu prêt à l'activation ? Message de refus sinon (`null` = OK).
 *
 * Miroir EXACT du bloc qui vivait dans l'action : même seuil, même phrase.
 */
export function blocageActivationEvent(entree: {
  nombreQuestions: number;
}): string | null {
  if (entree.nombreQuestions < 1) {
    return "Ajoutez au moins une question avant d'activer le jeu.";
  }
  return null;
}

export interface SalleActivation {
  label: string | null;
  joinCode: string;
  rewardLabel: string;
  rewardStock: number;
  codeTtlDays: number | null;
}

export interface EntreeActivationEvent {
  nombreQuestions: number;
  status: string;
  salles: SalleActivation[];
}

export interface EtatActivationEvent {
  controles: ControleActivation[];
  rappels: string[];
  toutPret: boolean;
  blocage: string | null;
}

/** Nom lisible d'une salle : son étiquette, sinon son code d'accès. */
function nomSalle(salle: SalleActivation): string {
  return salle.label?.trim() || `Session ${salle.joinCode}`;
}

export function construireActivationEvent(
  entree: EntreeActivationEvent,
): EtatActivationEvent {
  const blocage = blocageActivationEvent(entree);
  const { salles } = entree;
  const sansLot = salles.filter(
    (s) => !s.rewardLabel.trim() || s.rewardStock < 1,
  );

  const controles: ControleActivation[] = [
    {
      cle: "questions",
      ok: entree.nombreQuestions >= 1,
      bloquant: true,
      titre: "Le jeu a de quoi se jouer",
      detail:
        entree.nombreQuestions >= 1
          ? `${entree.nombreQuestions} manche${entree.nombreQuestions > 1 ? "s" : ""} prête${entree.nombreQuestions > 1 ? "s" : ""} à lancer depuis la télécommande.`
          : "Aucune question : l'ouverture sera refusée, et il n'y aurait rien à projeter en salle.",
      etape: "manches",
    },
    {
      cle: "salle",
      ok: salles.length > 0,
      bloquant: false,
      titre: "Une soirée est préparée",
      detail:
        salles.length > 0
          ? `${salles.length} session${salles.length > 1 ? "s" : ""} — chacune a son code d'accès et son lot.`
          : "Aucune session : le jeu peut être ouvert, mais vous n'auriez rien à piloter le soir venu.",
      etape: "soiree",
    },
    {
      cle: "stock",
      ok: salles.length > 0 && sansLot.length === 0,
      bloquant: false,
      titre: "Chaque soirée a un lot à remettre",
      detail:
        salles.length === 0
          ? "Rien à vérifier tant qu'aucune session n'est préparée."
          : sansLot.length === 0
            ? "Toutes les sessions ont un lot nommé et au moins un gagnant : les codes de retrait seront émis au podium."
            : `Podium sans lot à retirer : ${sansLot.map(nomSalle).join(", ")}. Le classement s'affichera à l'écran, mais aucun code de retrait ne sera émis.`,
      etape: "soiree",
    },
    {
      cle: "actif",
      ok: entree.status === "active",
      bloquant: false,
      titre: "Le jeu est ouvert aux joueurs",
      detail:
        entree.status === "active"
          ? "Vous pouvez lancer une session en direct depuis la télécommande."
          : "Tant que le jeu n'est pas ouvert, la télécommande ne peut pas lancer de session en direct.",
    },
  ];

  const sansEcheance = salles.filter((s) => s.codeTtlDays === null);
  const rappels: string[] = [
    salles.length === 0
      ? "L'échéance des codes EVENT- se règle session par session, et seulement APRÈS création : une session neuve part « sans limite »."
      : sansEcheance.length === 0
        ? "Chaque session fixe le délai laissé au gagnant pour présenter son code EVENT- en caisse."
        : `Sans date limite pour le code EVENT- : ${sansEcheance.map(nomSalle).join(", ")}. Le réglage se fait en modifiant la session, jamais à sa création.`,
    "Le code d'accès, le QR imprimable, « Piloter » et « Écran » vivent sur la page de suivi : c'est là qu'on anime, ici qu'on prépare.",
    "Ouvrir le jeu ne se fait qu'à un seul endroit : la carte « Statut du jeu », sur la page de suivi.",
  ];

  return {
    controles,
    rappels,
    toutPret: controles.filter((c) => c.bloquant).every((c) => c.ok),
    blocage,
  };
}
