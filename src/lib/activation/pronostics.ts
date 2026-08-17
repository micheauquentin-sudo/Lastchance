import type { EtapeContest } from "@/components/dashboard/atelier-contest-etapes";
import type { PointControle } from "./controle";

/**
 * L'ÉTAPE « VÉRIFICATION » DES PRONOSTICS, EN FONCTION PURE.
 *
 * ── CE QUE LE SERVEUR VÉRIFIE, ET DEPUIS QUAND ──
 *
 * Ce module a longtemps porté l'inverse de cette phrase : « il n'existe AUCUNE
 * précondition métier à l'ouverture d'un championnat ». C'était vrai, et c'était
 * le défaut FIA-2 du wagon 4 — on ouvrait aux joueurs un championnat à zéro
 * match et zéro question, et /pronos/<slug> affichait une page sans rien à
 * pronostiquer, pendant que l'écran promettait le contraire.
 *
 * Depuis, `blocageActivationContest` ci-dessous est opposé par `updateContest`
 * AVANT `set_contest_status` — exactement comme `blocageActivationEvent` l'est
 * par `setEventGameStatus`. La règle reste APPLICATIVE et non SQL (arbitrage du
 * 2026-08-17, ADR du wagon 4) : `set_contest_status` ne contrôle toujours que
 * le rôle (`is_org_editor`), la matrice de transitions et le droit module
 * (`assert_module_publish_allowed`).
 *
 * Les QUATRE autres contrôles de cette liste (récompenses, échéances,
 * subsidiaire, contact) ne bloquent toujours rien : ils avertissent. Un
 * championnat sans palier de récompense est un réglage légitime, pas une page
 * vide.
 *
 * Il est PUR et testé : aucun réseau, aucune date implicite (`now` est un
 * paramètre — sans quoi le test « échéance déjà passée » ne serait pas
 * reproductible), aucune décision de droit (les capacités restent lues par la
 * page, la publication reste gardée en base).
 */
export interface EntreeVerificationContest {
  contestId: string;
  /** Compétition à calendrier synchronisé (`competition.providerLeagueId`). */
  autoCompetition: boolean;
  /** Lignes `contest_matches` de type `score`. */
  nbMatchs: number;
  /** Lignes `contest_matches` d'un autre type (choice / ranking / number). */
  nbQuestions: number;
  /**
   * Échéance EFFECTIVE de chaque question générique (`effectiveLocksAt`, donc
   * déjà repliée sur le verrouillage par défaut du championnat). `null` = pas
   * d'échéance connue, ce qui n'est pas un défaut ici.
   */
  echeances: Array<string | null>;
  /** Paliers enregistrés dans `contests.rewards`. */
  nbRecompenses: number;
  tiebreakerQuestion: string | null;
  tiebreakerAnswer: number | null;
  collectEmail: boolean;
  collectPhone: boolean;
  /** Injectée par les tests ; le rendu serveur passe l'heure courante. */
  now?: Date;
}

/**
 * Un point de vérification d'un championnat : le tronc commun, SANS
 * `bloquant` — le caractère bloquant du seul contrôle qui l'est (`matiere`) est
 * porté par la table de `checklist/controles.ts`, comme pour la roue, la chasse
 * et la fidélité — et avec une `etape` REQUISE : ici, chaque point sait où il se
 * corrige.
 */
export interface ControleContest extends PointControle<EtapeContest> {
  /** Étape de l'Atelier qui corrige ce point. */
  etape: EtapeContest;
}

export interface EtatVerificationContest {
  controles: ControleContest[];
  toutPret: boolean;
  /** Le SEUL endroit qui publie : la vue suivi, ancre `#statut`. */
  ctaHref: string;
}

/**
 * Championnat prêt à l'ouverture ? Message de refus sinon (`null` = OK).
 *
 * Miroir EXACT du contrôle `matiere` ci-dessous : même seuil (au moins une
 * ligne de `contest_matches`, match ou question générique), mêmes phrases. Le
 * contrôle de l'atelier le CONSOMME — les deux ne peuvent donc pas diverger,
 * ce qui est tout l'objet de l'extraction : l'écran promettait un refus que le
 * serveur ne prononçait pas.
 *
 * `autoCompetition` change le geste à faire, pas la règle : sur un calendrier
 * synchronisé, la matière ne se saisit pas à la main, elle se resynchronise.
 * Le seuil est le même dans les deux cas.
 */
export function blocageActivationContest(entree: {
  nbMatchs: number;
  nbQuestions: number;
  autoCompetition: boolean;
}): string | null {
  if (entree.nbMatchs + entree.nbQuestions > 0) return null;
  return entree.autoCompetition
    ? "Le calendrier synchronisé n'a encore remonté aucun match : ouvert maintenant, le championnat afficherait une page vide. Relancez la synchronisation ou ajoutez une question."
    : "Ni match ni question : ouvert maintenant, le championnat afficherait une page vide à vos clients.";
}

/** Combien de questions ferment déjà avant même l'ouverture ? */
function echeancesPassees(
  echeances: Array<string | null>,
  now: Date,
): number {
  return echeances.filter((iso) => {
    if (!iso) return false;
    const instant = new Date(iso);
    return !Number.isNaN(instant.getTime()) && instant.getTime() <= now.getTime();
  }).length;
}

export function construireVerificationContest(
  entree: EntreeVerificationContest,
): EtatVerificationContest {
  const {
    contestId,
    autoCompetition,
    nbMatchs,
    nbQuestions,
    echeances,
    nbRecompenses,
    tiebreakerQuestion,
    tiebreakerAnswer,
    collectEmail,
    collectPhone,
  } = entree;
  const now = entree.now ?? new Date();

  const controles: ControleContest[] = [];

  // 1. De la matière à pronostiquer — le SEUL contrôle bloquant, et celui que
  //    `updateContest` oppose désormais avant d'appeler `set_contest_status`.
  const blocage = blocageActivationContest({
    nbMatchs,
    nbQuestions,
    autoCompetition,
  });
  controles.push({
    cle: "matiere",
    ok: blocage === null,
    titre: "Il y a quelque chose à pronostiquer",
    detail:
      blocage ??
      `${nbMatchs} match${nbMatchs > 1 ? "s" : ""} et ${nbQuestions} question${nbQuestions > 1 ? "s" : ""} — vos joueurs ont de quoi jouer.`,
    etape: autoCompetition ? "matchs" : "questions",
  });

  // 2. Une récompense, sinon la clôture n'attribue rien du tout.
  controles.push({
    cle: "recompenses",
    ok: nbRecompenses > 0,
    titre: "Un lot récompense le classement",
    detail:
      nbRecompenses > 0
        ? `${nbRecompenses} palier${nbRecompenses > 1 ? "s" : ""} de récompense enregistré${nbRecompenses > 1 ? "s" : ""}.`
        : "Aucun palier de récompense : à la clôture, aucun lot ne sera attribué et personne ne recevra de code de retrait.",
    etape: "recompenses",
  });

  // 3. Une question dont l'échéance est déjà passée est fermée d'avance.
  const passees = echeancesPassees(echeances, now);
  controles.push({
    cle: "echeances",
    ok: passees === 0,
    titre: "Aucune question n'est fermée d'avance",
    detail:
      passees === 0
        ? "Toutes les questions ferment encore dans le futur."
        : `${passees} question${passees > 1 ? "s ont" : " a"} une échéance déjà passée : ${passees > 1 ? "elles seront" : "elle sera"} verrouillée${passees > 1 ? "s" : ""} dès l'ouverture, sans qu'un seul joueur puisse répondre.`,
    etape: "questions",
  });

  // 4. La subsidiaire : les deux colonnes s'écrivent d'un bloc, une réponse
  //    seule est donc atteignable — et strictement inutile.
  const aQuestion = (tiebreakerQuestion ?? "").trim() !== "";
  const aReponse = tiebreakerAnswer !== null;
  controles.push({
    cle: "subsidiaire",
    ok: aQuestion || !aReponse,
    titre: "La question subsidiaire tient debout",
    detail: aQuestion
      ? aReponse
        ? "Question et réponse officielle sont enregistrées."
        : "Question posée ; la réponse officielle se saisit en fin de saison, au moment de clôturer."
      : aReponse
        ? "Une réponse officielle est enregistrée sans question subsidiaire : elle ne départagera personne. Saisissez la question, ou effacez la réponse."
        : "Pas de question subsidiaire : les ex æquo seront départagés aux points, aux scores exacts, puis par tirage auditable.",
    etape: "questions",
  });

  // 5. Joindre le gagnant. Ni email ni téléphone = un lot sans destinataire
  //    joignable, et un joueur qui perd son appareil perd son compte.
  controles.push({
    cle: "contact",
    ok: collectEmail || collectPhone,
    titre: "Vous pourrez joindre le gagnant",
    detail:
      collectEmail || collectPhone
        ? `Demandé à l'inscription : ${[collectEmail ? "email" : null, collectPhone ? "téléphone" : null].filter(Boolean).join(" et ")}.`
        : "Ni email ni téléphone demandés à l'inscription : vous n'aurez aucun moyen de prévenir le gagnant, et un joueur qui change de téléphone perd ses pronostics.",
    etape: "championnat",
  });

  return {
    controles,
    toutPret: controles.every((c) => c.ok),
    ctaHref: `/dashboard/pronostics/${contestId}#statut`,
  };
}
