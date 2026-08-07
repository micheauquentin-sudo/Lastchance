import type { EtapeContest } from "@/components/dashboard/atelier-contest-etapes";

/**
 * L'ÉTAPE « VÉRIFICATION » DES PRONOSTICS, EN FONCTION PURE.
 *
 * ── CE QUE LE SERVEUR NE VÉRIFIE PAS ──
 *
 * Contrairement aux six autres modules, il n'existe AUCUNE précondition métier
 * à l'ouverture d'un championnat : `set_contest_status` ne contrôle que le rôle
 * (`is_org_editor`), la matrice de transitions et le droit module
 * (`assert_module_publish_allowed`). On peut donc ouvrir aux joueurs un
 * championnat à zéro match, zéro question et zéro récompense — /pronos/<slug>
 * affiche alors une page sans rien à pronostiquer et sans lot.
 *
 * Il n'y a donc RIEN à extraire d'une action : il n'existe pas d'`activationBlocker`
 * côté pronostics. Ce module n'a qu'un seul lecteur, l'écran, et c'est assumé —
 * il ne referme pas le trou, il le RACONTE avant le geste, et renvoie sur
 * l'étape qui le corrige. Refermer côté base serait une décision de produit,
 * pas une décision d'atelier.
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

export interface ControleContest {
  cle: string;
  ok: boolean;
  titre: string;
  detail: string;
  /** Étape de l'Atelier qui corrige ce point. */
  etape: EtapeContest;
}

export interface EtatVerificationContest {
  controles: ControleContest[];
  toutPret: boolean;
  /** Le SEUL endroit qui publie : la vue suivi, ancre `#statut`. */
  ctaHref: string;
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

  // 1. De la matière à pronostiquer. Un championnat vide s'ouvre sans broncher.
  const total = nbMatchs + nbQuestions;
  controles.push({
    cle: "matiere",
    ok: total > 0,
    titre: "Il y a quelque chose à pronostiquer",
    detail:
      total > 0
        ? `${nbMatchs} match${nbMatchs > 1 ? "s" : ""} et ${nbQuestions} question${nbQuestions > 1 ? "s" : ""} — vos joueurs ont de quoi jouer.`
        : autoCompetition
          ? "Le calendrier synchronisé n'a encore remonté aucun match : ouvert maintenant, le championnat afficherait une page vide. Relancez la synchronisation ou ajoutez une question."
          : "Ni match ni question : ouvert maintenant, le championnat afficherait une page vide à vos clients.",
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
