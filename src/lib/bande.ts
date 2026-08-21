/**
 * PORTRAIT DE LA BANDE (L18) — le vocabulaire et la LECTURE DÉFENSIVE des
 * sept RPC.
 *
 * ── CE FICHIER EST UN MIROIR, PAS UNE AUTORITÉ ──
 *
 * L'autorité est la migration `20261019120000_portrait_bande.sql` : ses `check`
 * refusent ce que ce fichier accepterait par erreur, et ses RPC décident seules
 * de ce qui sort. Ce qui vit ici sert à donner une forme TYPÉE à des documents
 * `jsonb` que PostgREST rend en `Json`, et à ne jamais laisser un document
 * inattendu se propager jusqu'à un écran. Motif exact de `src/lib/duo.ts` (L17)
 * et de `src/lib/lobby.ts` (L16).
 *
 * ── L'ENVELOPPE EST EN camelCase, PARTOUT ──
 *
 * `duo.ts` gardait les noms de la base sur la FICHE (`prix_affiche`,
 * `photo_path`) parce qu'un composant existant les consommait déjà tels quels.
 * Ici, rien de tel : aucun document de ce lot n'atterrit dans un composant
 * antérieur, donc la couture n'a pas lieu d'être et tout est traduit une fois,
 * au même endroit — motif `LobbyMembreView` (`pseudo`, `rang`, `estMoi`).
 *
 * ── LE TEXTE DES QUESTIONS EST RÉSOLU ICI, PAS EN BASE ──
 *
 * La base ne connaît que des CLÉS (`question_cle`), les soixante textes vivent
 * dans `bande-packs.ts`. La résolution se fait donc dans les mappeurs, une fois,
 * et elle rend `null` quand la question a été retirée d'un pack depuis la partie
 * jouée : `questionBande` le prévoit explicitement, et l'écran doit le supporter
 * — un récapitulatif de la veille ne doit pas devenir illisible parce qu'une
 * question a été écartée ce matin.
 *
 * ── LE POURCENTAGE VIENT DU SERVEUR, ENTIER, ET NE SE RECALCULE PAS ──
 *
 * `bande_state` le calcule sur le dénominateur FIGÉ du tour et l'arrondit. Le
 * refaire ici donnerait un second arrondi, qui finirait par différer d'un point
 * sur une tablée de sept — et deux écrans ouverts côte à côte n'afficheraient
 * pas le même chiffre.
 */

import {
  BANDE_PACK_CLES,
  questionBande,
  type BandeQuestion,
} from "@/lib/bande-packs";

// ────────────────────────────────────────────────────────────
// Vocabulaire — miroir des `check` de la migration
// ────────────────────────────────────────────────────────────

/** Les deux états d'une PARTIE. Liste FERMÉE, miroir du `check`. */
export const BANDE_PARTIE_STATUTS = ["en_cours", "recap"] as const;
export type BandePartieStatut = (typeof BANDE_PARTIE_STATUTS)[number];

/** Les deux états d'un TOUR. Liste FERMÉE, miroir du `check`. */
export const BANDE_TOUR_STATUTS = ["ouverte", "revelee"] as const;
export type BandeTourStatut = (typeof BANDE_TOUR_STATUTS)[number];

// ────────────────────────────────────────────────────────────
// Les vues — ce que l'écran reçoit
// ────────────────────────────────────────────────────────────

/** Une question, texte RÉSOLU — `texte` vaut `null` si le pack l'a retirée. */
export interface BandeQuestionView {
  cle: string;
  texte: string | null;
}

/**
 * UN PARTICIPANT — quatre clés.
 *
 * `memberId` SORT, contrairement à `LobbyMembreView` (L16), et il le faut :
 * c'est lui qu'on passe à `bande_vote` pour désigner quelqu'un. Ce n'est pas un
 * jeton — c'est l'identifiant d'une ligne, il ne vaut que dans cette salle, il
 * n'ouvre aucune porte, et seul un membre de la salle peut l'obtenir.
 */
export interface BandeParticipantView {
  memberId: string;
  pseudo: string;
  /** Rang d'arrivée, 1 pour l'hôte — calculé en SQL, jamais ici. */
  rang: number;
  /** Le porteur du cookie de CETTE salle est-il ce membre ? */
  estMoi: boolean;
}

/**
 * MON VOTE — et la nuance qui compte tient en deux `null` différents.
 *
 *   · `monVote === null` → je n'ai RIEN scellé, la question m'attend ;
 *   · `monVote.ciblePseudo === null` → j'ai PASSÉ, et c'est un geste scellé.
 *
 * Les confondre ferait réafficher le bulletin à quelqu'un qui a déjà choisi de
 * ne nommer personne — c'est-à-dire lui redemander un vote que la base
 * refusera.
 *
 * `cibleMemberId` peut être `null` sur un vote NOMMÉ : la ligne du membre a pu
 * disparaître depuis, et c'est `ciblePseudo` — gravé au moment du geste — qui
 * survit. Motif `DuoChoixView` (L17), remède M-1.
 */
export interface BandeMonVoteView {
  cibleMemberId: string | null;
  ciblePseudo: string | null;
}

/**
 * UNE LIGNE DE RÉSULTAT — un DÉCOMPTE PAR CIBLE, jamais un votant.
 *
 * `voter_token_hash` ne sort d'aucune RPC de ce lot, à aucun moment : ce type
 * ne prévoit donc aucune place où il pourrait atterrir.
 */
export interface BandeResultatView {
  /** `null` si la cible a quitté la salle depuis — son nom, lui, est gravé. */
  cibleMemberId: string | null;
  ciblePseudo: string;
  voix: number;
  /**
   * ENTIER, CALCULÉ PAR LE SERVEUR sur le dénominateur figé du tour. Il est
   * rendu tel quel — voir l'en-tête du fichier : deux arrondis finiraient par
   * différer.
   */
  pourcentage: number;
}

/** LA PARTIE — le pack joué, où l'on en est, et si elle est finie. */
export interface BandePartieView {
  /** La CLÉ du pack, copiée au démarrage. `packBande` en donne le libellé. */
  pack: string;
  position: number;
  nbQuestions: number;
  status: BandePartieStatut;
}

/** LE TOUR COURANT — la question posée, et l'attente invisible. */
export interface BandeTourView {
  position: number;
  /** La clé telle que la base la porte — stable, gravée dans le tour. */
  questionCle: string;
  /** Le texte résolu. `null` = la question a été retirée du pack depuis. */
  questionTexte: string | null;
  status: BandeTourStatut;
  /** FIGÉ à l'ouverture du tour. Il ne baisse pas quand quelqu'un part. */
  denominateur: number;
  /**
   * Un COMPTE de gestes — jamais qui, jamais pour qui. Les passes y sont.
   *
   * `null` TANT QU'ON N'A PAS SOI-MÊME VOTÉ, et c'est une défense, pas un
   * oubli : l'hôte votait, regardait ce compte passer de un à deux, révélait,
   * et le résultat ne portait alors que le vote du voisin qu'il venait de voir
   * taper (revue L18, E-1). Le plancher de participation ferme la révélation ;
   * ceci ferme l'observation. Qui n'a rien scellé n'a rien à compter.
   */
  votesExprimes: number | null;
}

/**
 * `bande_state` — ce que voit un joueur. SEPT clés, toujours les mêmes.
 *
 * `resultats` vaut `null` avant la révélation plutôt que de disparaître (motif
 * `lobby_state` / `duo_state`) : un document de forme STABLE se type une fois,
 * là où une clé qui apparaît et disparaît se teste à chaque lecture — et une
 * clé qu'on oublie de tester est une clé qu'on affiche.
 */
export type BandeStateView =
  | { state: "unavailable" }
  | {
      state: "ok";
      partie: BandePartieView;
      tour: BandeTourView;
      /** `null` = je n'ai pas encore scellé. Voir `BandeMonVoteView`. */
      monVote: BandeMonVoteView | null;
      /** Ordonnés par rang, l'hôte en tête. Jamais `undefined`. */
      participants: BandeParticipantView[];
      /** `null` TANT QUE LE TOUR N'EST PAS RÉVÉLÉ. Voir `mapBandeState`. */
      resultats: BandeResultatView[] | null;
      /**
       * La salle porteuse est-elle finie (close ou expirée) ? UN BOOLÉEN SEC,
       * motif `DuoStateView` : le récapitulatif FERME la salle, et le joueur n'a
       * pas à savoir qui a refermé, seulement que la partie ne continuera pas.
       */
      salleClose: boolean;
    };

/**
 * `bande_start` — ouvrir, ou retrouver, la partie.
 *
 * PAS DE `non_configure` ICI, contrairement à L17, et ce n'est pas un oubli :
 * le pack a TOUJOURS une valeur (défaut `amis` en base comme en TypeScript), il
 * n'existe donc aucun état « le commerçant n'a rien composé ». Ce qui peut
 * manquer, c'est un second joueur — et cela, la RPC le rend `unavailable` comme
 * le reste, parce que l'écran de salle d'attente est déjà celui qui le dit.
 */
export type BandeStartResult =
  | {
      state: "ok";
      partieId: string;
      pack: string;
      position: number;
      nbQuestions: number;
    }
  | { state: "unavailable" };

/**
 * `bande_vote` — sceller son vote, ou son passe.
 *
 * ATTENTION AU MOT `scelle`, QUI DÉSIGNE DEUX CHOSES OPPOSÉES DANS LE CONTRAT
 * SQL (piège hérité de L17) : la clé `scelle: true` d'un `ok` dit « votre vote
 * EST scellé » (succès), tandis que l'état `{"state":"scelle"}` dit « vous aviez
 * DÉJÀ voté autrement » (refus, et rien n'a été écrit). Le second est renommé
 * `deja-vote` dès la sortie de l'action (`VoteBandeOutcome`), justement pour que
 * ce piège ne voyage pas jusqu'à l'écran.
 */
export type BandeVoteResult =
  | { state: "ok"; scelle: true; revelee: boolean }
  | { state: "scelle" }
  | { state: "unavailable" };

/**
 * `bande_reveal` — l'hôte clôt la question. IDEMPOTENTE côté base.
 *
 * `trop_tot` N'EST PAS UNE PANNE, c'est une règle du jeu : sous trois réponses
 * (ou sous le dénominateur s'il est plus petit), révéler reviendrait à lire le
 * vote d'une personne qu'on vient de voir taper. L'écran doit dire combien il
 * en manque — d'où les deux compteurs, qui voyagent par contrat.
 */
export type BandeRevealResult =
  | { state: "ok"; revelee: true }
  | { state: "trop_tot"; requis: number; exprimes: number }
  | { state: "unavailable" };

/** `bande_next` — question suivante, ou récapitulatif. */
export type BandeNextResult =
  | { state: "ok"; position: number; status: BandePartieStatut }
  | { state: "unavailable" };

/**
 * UNE LIGNE DU PORTRAIT — qui a été nommé, et sur quelles questions.
 *
 * SEULS LES NOMMÉS Y SONT : quelqu'un que personne n'a nommé n'a pas de ligne.
 * Lister tout le monde avec un zéro aurait fabriqué le classement que le cahier
 * exclut — un tableau où chacun lit son rang par le bas.
 */
export interface BandeRecapLigneView {
  cibleMemberId: string | null;
  ciblePseudo: string;
  foisNomme: number;
  /** Les questions DISTINCTES, dans l'ordre des tours. Textes résolus. */
  questions: BandeQuestionView[];
}

/** `bande_recap` — le portrait de session, et rien de plus. */
export type BandeRecapView =
  | { state: "unavailable" }
  | { state: "ok"; portrait: BandeRecapLigneView[] };

// ────────────────────────────────────────────────────────────
// Lecture défensive du jsonb (motif src/lib/duo.ts)
// ────────────────────────────────────────────────────────────

const INDISPONIBLE = { state: "unavailable" } as const;

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function asInt(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.trunc(value)
    : null;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function asPartieStatut(value: unknown): BandePartieStatut | null {
  const mot = asString(value);
  return mot && (BANDE_PARTIE_STATUTS as readonly string[]).includes(mot)
    ? (mot as BandePartieStatut)
    : null;
}

function asTourStatut(value: unknown): BandeTourStatut | null {
  const mot = asString(value);
  return mot && (BANDE_TOUR_STATUTS as readonly string[]).includes(mot)
    ? (mot as BandeTourStatut)
    : null;
}

/**
 * La question derrière une clé — texte RÉSOLU, ou `null`.
 *
 * `questionBande` rend `null` quand la clé désigne une question retirée depuis.
 * Ce n'est ni une erreur ni un document corrompu : c'est le prix assumé de faire
 * vivre les packs en TypeScript plutôt qu'en table (voir `bande-packs.ts`), et
 * la clé, elle, reste rendue — un écran qui n'a pas le texte peut au moins dire
 * « question retirée » plutôt que d'afficher un vide sans nom.
 */
function questionView(cle: string): BandeQuestionView {
  const question: BandeQuestion | null = questionBande(cle);
  return { cle, texte: question?.texte ?? null };
}

// ────────────────────────────────────────────────────────────
// Les mappeurs
// ────────────────────────────────────────────────────────────

/**
 * LES PARTICIPANTS — toujours un tableau, et la ligne illisible est SAUTÉE.
 *
 * Motif `mapLobbyMembres` : un document tronqué ne doit pas faire tomber un
 * écran qui itère dessus toutes les deux secondes, et un participant sans
 * identifiant ni pseudo ne peut rien produire d'utile — ni un bouton à cliquer,
 * ni une cible à envoyer. `memberId` est EXIGÉ ici, contrairement au `item_id`
 * d'un choix de L17 : sans lui il n'y a personne à nommer, donc rien à peindre.
 *
 * RE-TRIÉ PAR RANG. Le `jsonb_agg` porte déjà son `order by`, donc ce tri ne
 * corrige rien aujourd'hui ; il existe parce que l'ordre est ce que TOUTE la
 * table a sous les yeux au même instant. Une agrégation dont l'ordonnancement se
 * perdrait un jour ferait sauter les noms sous les doigts entre deux sondages —
 * c'est-à-dire ferait voter quelqu'un pour un nom qui n'était plus là quand il a
 * visé.
 */
export function mapBandeParticipants(raw: unknown): BandeParticipantView[] {
  const sortie: BandeParticipantView[] = [];
  for (const brut of asArray(raw)) {
    const root = asRecord(brut);
    if (!root) continue;
    const memberId = asString(root.member_id);
    const pseudo = asString(root.pseudo);
    const rang = asInt(root.rang);
    if (!memberId || !pseudo || rang === null) continue;
    // Booléen EXACT, motif `est_moi` de L16 : un « true » textuel vient d'un
    // document qu'on ne comprend pas, et le repli `false` n'affirme rien.
    sortie.push({ memberId, pseudo, rang, estMoi: root.est_moi === true });
  }
  return sortie.sort((a, b) => a.rang - b.rang);
}

/**
 * LES RÉSULTATS D'UN TOUR RÉVÉLÉ.
 *
 * ── L'ORDRE DU SQL EST GARDÉ TEL QUEL ──
 *
 * `bande_state` ordonne par voix décroissantes puis pseudo, et tous les ex æquo
 * sortent. Le re-trier ici écrirait une SECONDE définition du classement, qui
 * finirait par diverger de celle qui compte — celle qui a lu les votes. C'est
 * l'écart assumé avec `mapBandeParticipants`, où le tri protège un geste (viser
 * un nom) et non un affichage.
 *
 * ── UNE LIGNE INCOMPLÈTE EST SAUTÉE, ET LE POURCENTAGE N'EST JAMAIS DEVINÉ ──
 *
 * Sans `voix` ou sans `pourcentage`, il ne reste rien d'honnête à peindre : le
 * recalculer à partir du dénominateur reviendrait à faire la division que le
 * serveur a déjà faite, avec un second arrondi. Sauter la ligne dit moins, mais
 * ne dit rien de faux.
 */
export function mapBandeResultats(raw: unknown): BandeResultatView[] {
  const sortie: BandeResultatView[] = [];
  for (const brut of asArray(raw)) {
    const root = asRecord(brut);
    if (!root) continue;
    const ciblePseudo = asString(root.cible_pseudo);
    const voix = asInt(root.voix);
    const pourcentage = asInt(root.pourcentage);
    if (!ciblePseudo || voix === null || pourcentage === null) continue;
    sortie.push({
      // NULLABLE, et c'est le remède L17 : la cible a pu quitter la salle, son
      // nom gravé survit. Exiger l'identifiant aurait effacé du portrait
      // quelqu'un que la tablée a bel et bien nommé.
      cibleMemberId: asString(root.cible_member_id),
      ciblePseudo,
      voix,
      pourcentage,
    });
  }
  return sortie;
}

/**
 * MON VOTE — `null` si je n'ai rien scellé.
 *
 * Aucune exigence sur les deux clés : le PASSE est un vote scellé dont les deux
 * valeurs sont nulles (arbitrage 1), et le refuser ici l'aurait rendu
 * indiscernable de « pas encore voté » — donc aurait fait redemander un bulletin
 * que la base refuse d'accepter deux fois.
 */
export function mapBandeMonVote(raw: unknown): BandeMonVoteView | null {
  const root = asRecord(raw);
  if (!root) return null;
  return {
    cibleMemberId: asString(root.cible_member_id),
    ciblePseudo: asString(root.cible_pseudo),
  };
}

/**
 * Lecture de `bande_start`.
 *
 * UN « ok » AMPUTÉ N'EST PAS UNE OUVERTURE UTILISABLE : les quatre valeurs sont
 * le CONTENU de la réponse (quel pack, où l'on en est, combien de questions), et
 * les deviner ferait peindre une partie qui n'a été ouverte nulle part.
 */
export function mapBandeStart(raw: unknown): BandeStartResult {
  const root = asRecord(raw);
  if (!root || asString(root.state) !== "ok") return INDISPONIBLE;

  const partieId = asString(root.partie_id);
  const pack = asString(root.pack);
  const position = asInt(root.position);
  const nbQuestions = asInt(root.nb_questions);
  if (!partieId || !pack || position === null || nbQuestions === null) {
    return INDISPONIBLE;
  }

  return { state: "ok", partieId, pack, position, nbQuestions };
}

/**
 * Lecture de `bande_vote`.
 *
 * ── UN « ok » SANS SES DEUX BOOLÉENS EXACTS EST INDISPONIBLE ──
 *
 * Motif `mapDuoChoose`, et pour la même raison : `revelee` est le CONTENU de
 * cette réponse — c'est lui qui décide si l'écran bascule sur le résultat ou
 * reste en attente, et la révélation se produit DANS LA MÊME TRANSACTION que le
 * dernier vote. Le deviner à `false` ferait attendre celui-là même qui vient de
 * la déclencher. Et `scelle` est exigé strictement `true` parce que la RPC ne
 * sait pas écrire autre chose.
 */
export function mapBandeVote(raw: unknown): BandeVoteResult {
  const root = asRecord(raw);
  if (!root) return INDISPONIBLE;
  const state = asString(root.state);
  if (state === "scelle") return { state: "scelle" };
  if (state !== "ok") return INDISPONIBLE;
  if (root.scelle !== true) return INDISPONIBLE;
  if (typeof root.revelee !== "boolean") return INDISPONIBLE;
  return { state: "ok", scelle: true, revelee: root.revelee };
}

/**
 * Lecture de `bande_reveal` — `revelee` est exigé strictement `true`.
 *
 * La RPC ne sait pas écrire autre chose : un `ok` qui dirait `false` est un
 * document qu'on ne comprend pas, et l'afficher comme un succès annoncerait à
 * une table qui attend un résultat qui n'a peut-être pas été écrit.
 */
export function mapBandeReveal(raw: unknown): BandeRevealResult {
  const root = asRecord(raw);
  if (!root) return INDISPONIBLE;
  const etat = asString(root.state);

  // TROP TÔT N'EST PAS UNE PANNE. Le rabattre sur `unavailable` ferait dire à
  // l'écran « ce salon n'est pas disponible » là où la seule chose vraie est
  // « il manque des réponses » — et l'hôte chercherait une panne au lieu
  // d'attendre sa tablée. Les deux compteurs sont exigés : sans eux, l'écran ne
  // pourrait pas dire combien il en manque, et le message redeviendrait vague.
  if (etat === "trop_tot") {
    const requis = asInt(root.requis);
    const exprimes = asInt(root.exprimes);
    if (requis === null || exprimes === null) return INDISPONIBLE;
    return { state: "trop_tot", requis, exprimes };
  }

  if (etat !== "ok") return INDISPONIBLE;
  if (root.revelee !== true) return INDISPONIBLE;
  return { state: "ok", revelee: true };
}

/**
 * Lecture de `bande_next`.
 *
 * `status` est ce qui décide de l'écran suivant — question ou récapitulatif —
 * et `position` ce qu'il affiche. Hors vocabulaire ou absents, il n'y a pas
 * d'écran à peindre : le refus est plus honnête qu'un repli sur `en_cours`, qui
 * renverrait une table finie sur une question qui n'existe plus.
 */
export function mapBandeNext(raw: unknown): BandeNextResult {
  const root = asRecord(raw);
  if (!root || asString(root.state) !== "ok") return INDISPONIBLE;
  const position = asInt(root.position);
  const status = asPartieStatut(root.status);
  if (position === null || !status) return INDISPONIBLE;
  return { state: "ok", position, status };
}

/**
 * Lecture de `bande_state` — LE MAPPEUR QUI COMPTE.
 *
 * ── DES `resultats` NON NULS SUR UN TOUR OUVERT SONT UN DOCUMENT CORROMPU ──
 *
 * La RPC ne peut PAS produire cela : `v_resultats` naît `null` et n'est calculé
 * que dans la branche `if v_tour.status = 'revelee'`. En lire hors de cette
 * branche signifie donc qu'on ne lit pas ce qu'on croit — un `bande_state`
 * réécrit, un cache qui rend un vieux document, une RPC homonyme. Ils sont
 * FORCÉS à `null` tant que le tour n'est pas `revelee`.
 *
 * C'est de la DÉFENSE EN PROFONDEUR, pas une garde qui remplace l'autre (motif
 * exact de `mapDuoState`) : la vraie garde reste en SQL, parce qu'un document
 * qui transite est un document qu'on peut ouvrir, et qu'un `curl` verrait ce que
 * ce mappeur écarterait. Ce qu'on achète ici est plus modeste et bien réel :
 * l'écran ne dépend plus que d'UNE promesse — « si le tour est `ouverte`,
 * `resultats` vaut `null` » — et cette promesse-là est tenue par du code qu'on
 * peut lire, pas par la confiance dans un document reçu. Tout le jeu repose sur
 * le fait que les votes sont scellés ; s'ils ne le sont que par politesse du
 * client, il n'y a plus de jeu.
 *
 * ── LA PARTIE ET LE TOUR SONT EXIGÉS ENTIERS ──
 *
 * Position, nombre de questions, statuts, dénominateur, compte de votes, clé de
 * question : ces sept valeurs SONT l'écran. À moitié lisible, il n'est pas
 * peignable — « question 3 sur 0 » ou une question sans clé ne sont pas des
 * affichages dégradés, ce sont des affirmations fausses. Le refus indistinct est
 * le seul repli honnête, et il est celui que l'écran sait déjà rendre.
 *
 * `questionTexte`, lui, a le droit de manquer : c'est le cas PRÉVU d'une
 * question retirée d'un pack, pas un document corrompu.
 */
export function mapBandeState(raw: unknown): BandeStateView {
  const root = asRecord(raw);
  if (!root || asString(root.state) !== "ok") return INDISPONIBLE;

  const partieBrute = asRecord(root.partie);
  const tourBrut = asRecord(root.tour);
  if (!partieBrute || !tourBrut) return INDISPONIBLE;

  const pack = asString(partieBrute.pack);
  const partiePosition = asInt(partieBrute.position);
  const nbQuestions = asInt(partieBrute.nb_questions);
  const partieStatut = asPartieStatut(partieBrute.status);
  if (!pack || partiePosition === null || nbQuestions === null || !partieStatut) {
    return INDISPONIBLE;
  }

  const tourPosition = asInt(tourBrut.position);
  const questionCle = asString(tourBrut.question_cle);
  const tourStatut = asTourStatut(tourBrut.status);
  const denominateur = asInt(tourBrut.denominateur);
  // `votes_exprimes` EST NUL POUR QUI N'A PAS VOTÉ, par contrat (revue L18,
  // E-1) : ce n'est donc plus un champ manquant, c'est une réponse. L'exiger
  // ferait tomber en « indisponible » l'écran de TOUT joueur qui n'a pas encore
  // scellé — c'est-à-dire au moment précis où il doit voir sa question.
  const votesExprimes = asInt(tourBrut.votes_exprimes);
  if (
    tourPosition === null ||
    !questionCle ||
    !tourStatut ||
    denominateur === null
  ) {
    return INDISPONIBLE;
  }

  const revelee = tourStatut === "revelee";

  return {
    state: "ok",
    partie: {
      pack,
      position: partiePosition,
      nbQuestions,
      status: partieStatut,
    },
    tour: {
      position: tourPosition,
      questionCle,
      questionTexte: questionView(questionCle).texte,
      status: tourStatut,
      denominateur,
      votesExprimes,
    },
    // TOUJOURS LISIBLE : c'est le mien, lu sur MA ligne par mon propre jeton.
    monVote: mapBandeMonVote(root.mon_vote),
    participants: mapBandeParticipants(root.participants),
    // LA GARDE REDOUBLÉE — voir l'en-tête. `null` avant la révélation, sans
    // même regarder ce que le document porte.
    resultats: revelee ? mapBandeResultats(root.resultats) : null,
    // MÊME EXIGENCE DE BOOLÉEN EXACT, REPLI SÛR : `false`, c'est-à-dire « la
    // salle vit encore ». Un document illisible qui déclarerait la partie finie
    // arrêterait un jeu en cours ; l'inverse ne coûte qu'un tour de sondage de
    // plus, et la base refusera de toute façon le geste suivant.
    salleClose: root.salle_close === true,
  };
}

/**
 * Lecture de `bande_recap` — le portrait de session.
 *
 * ── UNE LIGNE SANS NOM EST SAUTÉE, LE PORTRAIT SURVIT ──
 *
 * Motif `mapLobbyMembres` : le récapitulatif est le dernier écran de la soirée,
 * et le faire tomber en entier parce qu'une ligne est illisible serait perdre le
 * portrait de tous pour l'erreur d'un seul. `foisNomme` est en revanche exigé —
 * c'est le chiffre que la ligne EXISTE pour dire.
 *
 * ── LES QUESTIONS SONT DES CLÉS, ET LEUR TEXTE PEUT MANQUER ──
 *
 * Une question retirée d'un pack après la partie rend `texte: null`. La clé
 * reste, l'ordre reste (celui des tours, posé par le SQL), et l'écran affiche ce
 * qu'il peut. C'est le prix assumé de packs qui vivent en TypeScript.
 */
export function mapBandeRecap(raw: unknown): BandeRecapView {
  const root = asRecord(raw);
  if (!root || asString(root.state) !== "ok") return INDISPONIBLE;

  const portrait: BandeRecapLigneView[] = [];
  for (const brut of asArray(root.portrait)) {
    const ligne = asRecord(brut);
    if (!ligne) continue;
    const ciblePseudo = asString(ligne.cible_pseudo);
    const foisNomme = asInt(ligne.fois_nomme);
    if (!ciblePseudo || foisNomme === null) continue;

    const questions: BandeQuestionView[] = [];
    for (const cleBrute of asArray(ligne.questions)) {
      const cle = asString(cleBrute);
      if (!cle) continue;
      questions.push(questionView(cle));
    }

    portrait.push({
      cibleMemberId: asString(ligne.cible_member_id),
      ciblePseudo,
      foisNomme,
      questions,
    });
  }

  return { state: "ok", portrait };
}

/**
 * Lecture de `set_bande_pack` — la CLÉ écrite, ou `null` si illisible.
 *
 * Le pack rendu est le contenu de la réponse : c'est lui que l'écran affiche en
 * confirmation (« pack Taquin activé »). Le deviner — en réaffichant ce que le
 * formulaire portait — annoncerait un réglage qui n'a peut-être pas été écrit.
 *
 * LA CLÉ EST VÉRIFIÉE CONTRE LES CINQ CONNUES. Un pack rendu par la base que ce
 * dépôt ne connaît pas signifie que le `check` SQL et `BANDE_PACK_CLES` ont
 * divergé ; l'afficher ferait promettre au commerçant un pack dont personne ici
 * ne peut lire les questions.
 */
export function mapBandePackSaved(raw: unknown): string | null {
  const root = asRecord(raw);
  if (!root || asString(root.state) !== "ok") return null;
  const pack = asString(root.pack);
  return pack !== null && packConnu(pack) ? pack : null;
}

/**
 * La clé désigne-t-elle un des cinq packs de ce dépôt ?
 *
 * L'autorité reste `bande-packs.ts` : cette fonction ne fait que la consulter,
 * elle ne redéfinit pas la liste. Le schéma de validation s'en sert aussi, pour
 * que « pack connu » n'ait qu'une seule définition dans tout le lot.
 */
export function packConnu(cle: string): boolean {
  return BANDE_PACK_CLES.includes(cle);
}
