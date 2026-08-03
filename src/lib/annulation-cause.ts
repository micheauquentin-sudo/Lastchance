/**
 * POURQUOI un lot a été annulé — et qui n'en est PAS responsable.
 *
 * ── LE DÉFAUT FERMÉ ─────────────────────────────────────────
 *
 * Deux surfaces affirmaient un motif UNIQUE là où il y a trois causes :
 * le portefeuille du client (« Le commerçant a annulé ce lot. ») et la carte
 * d'annulation de la caisse (« l'opération qui le portait a été supprimée »).
 * Depuis `20260902120000`, la rétention RGPD annule elle aussi des lignes de
 * registre — sur le seul critère d'âge, sans qu'aucun humain ne décide. Les
 * deux textes devenaient alors FAUX, et faux dans le sens le plus coûteux :
 * ils imputent à un commerçant un geste qu'il n'a pas fait, et le caissier
 * répète la phrase AU CLIENT, en face.
 *
 * ── CE QUI TRAVERSE LA FRONTIÈRE, ET CE QUI NE LA TRAVERSE PAS ──
 *
 * Une CAUSE normalisée, jamais `cancelled_reason`. Ce champ-là est du texte
 * libre saisi par le commerçant (300 caractères, lus d'un formulaire par
 * `cancelParticipation`) : le publier déposerait des notes internes — « client
 * indésirable », « suspicion de fraude » — sur l'écran du client, et sur celui
 * que le caissier lui montre. Le vocabulaire ci-dessous est fermé à trois
 * valeurs ; il dit QUI a agi, rien de plus.
 *
 * ── POURQUOI PLUS AUCUNE FONCTION NE LIT LE MOTIF ───────────
 *
 * Une première version dérivait la cause du TEXTE (`causeDepuisMotif`,
 * retirée) : la caisse comparait `cancelled_reason` aux deux sentinelles que
 * le trigger y écrit. C'était un trou, et le seul qui restait après la
 * bascule du portefeuille — un commerçant qui saisissait exactement
 * « source purgée » dans son formulaire d'annulation faisait dire au caissier,
 * au client en face : « Ce n'est une décision de personne — ni la vôtre, ni
 * celle de votre équipe. » Deux chemins d'écriture le permettaient, dont un
 * `PATCH` PostgREST direct sur `participations` qui ne laisse même pas de
 * trace d'audit.
 *
 * Les deux surfaces lisent désormais `reward_issuances.cancelled_source`
 * (20260903120000) : colonne à vocabulaire fermé, écrite par le SEUL trigger
 * d'annulation, jamais nommée par un chemin d'écriture legacy ni atteignable
 * depuis l'application. Ce n'est pas sa valeur qui la rend fiable, c'est que
 * personne d'autre ne peut la poser.
 *
 * ── LES DEUX TABLES DE TEXTE VIVENT ICI, ET C'EST VOULU ──
 *
 * Elles sont des `Record<CauseAnnulation, string>` : ajouter une cause au
 * vocabulaire fait échouer `tsc` sur les deux tables tant qu'elles ne l'ont pas
 * traitée. La garantie « aucune branche muette » est donc tenue par le
 * compilateur et non par une relecture — ce dépôt a déjà payé deux fois une
 * branche d'affichage oubliée sur une seule famille.
 *
 * Les deux audiences ne partagent PAS leur phrase : le client lit un écran de
 * téléphone et n'a rien à corriger ; le caissier, lui, a besoin de savoir s'il
 * doit faire retaper la saisie, et lit sa phrase à voix haute devant le client.
 */

/**
 * Vocabulaire fermé, identique à celui du `check` de
 * `reward_issuances.cancelled_source` et à ce que `player_wallet` rend
 * (20260903120000). `null` hors annulation, et pour toute valeur inattendue.
 */
export const CAUSES_ANNULATION = [
  /** La rétention a emporté la source. Aucun humain n'a décidé. */
  "purged",
  /** Geste d'entretien du commerçant : roue, chasse ou calendrier supprimé. */
  "source_deleted",
  /** Annulation explicite d'un lot, motif à l'appui. */
  "merchant",
] as const;

export type CauseAnnulation = (typeof CAUSES_ANNULATION)[number];

/**
 * Cause telle que la rend `player_wallet`. Une valeur hors vocabulaire vaut
 * `null` : on ne devine pas une cause qu'on n'a pas su lire.
 */
export function normaliserCauseAnnulation(
  valeur: string | null | undefined,
): CauseAnnulation | null {
  return (CAUSES_ANNULATION as readonly string[]).includes(valeur ?? "")
    ? (valeur as CauseAnnulation)
    : null;
}

/**
 * Cause lue à même le registre, pour le seul appelant qui n'a pas
 * `player_wallet` : la caisse (`lookupUniversalRewardRoute` lit
 * `reward_issuances` en direct, la RPC étant scopée au joueur porteur du
 * cookie).
 *
 * Reproduit à l'identique le `case` de `player_wallet` (20260903120000) :
 * hors annulation → `null` ; annulée sans cause → `merchant`, le repli qui
 * n'exonère personne. `merchant` couvre le cas NORMAL et non un accident : le
 * miroir `upsert_reward_issuance`, qui propage l'annulation d'une
 * participation par son commerçant, ne nomme jamais `cancelled_source` — une
 * annulation décidée à la main arrive donc ici avec la colonne à `null`.
 *
 * Le motif brut n'est PAS un paramètre, et c'est le correctif : tant qu'il en
 * était un, un commerçant tapant « source purgée » dans son formulaire faisait
 * dire au comptoir que personne n'avait annulé son lot.
 */
export function causeAnnulationRegistre(
  cancelledAt: string | null | undefined,
  cancelledSource: string | null | undefined,
): CauseAnnulation | null {
  if (!cancelledAt) return null;
  return normaliserCauseAnnulation(cancelledSource) ?? "merchant";
}

/**
 * CE QUE LE CLIENT LIT sur son portefeuille, sous le code devenu inutile.
 *
 * `purged` ne nomme ni le RGPD, ni la rétention, ni une durée de conservation :
 * un client qui ouvre son téléphone n'a pas à recevoir un cours de conformité.
 * Il a besoin de deux choses, et elles y sont — ce n'est pas sa faute, et ce
 * n'est pas une décision du commerçant.
 */
const PHRASE_CLIENT: Record<CauseAnnulation, string> = {
  purged:
    "Ce lot était trop ancien : il a été effacé automatiquement. Personne ne l'a annulé.",
  source_deleted: "Le jeu qui offrait ce lot n'existe plus chez ce commerçant.",
  merchant: "Le commerçant a annulé ce lot.",
};

/**
 * Repli des annulations ANTÉRIEURES à ce chantier : leur `cancelled_reason`
 * n'a jamais porté de cause normalisée. On n'accuse personne plutôt que de
 * désigner le commerçant par défaut — c'est très exactement le défaut d'origine.
 */
const PHRASE_CLIENT_INCONNUE = "Ce lot n'est plus valable.";

export function phraseClientAnnulation(
  cause: CauseAnnulation | null | undefined,
): string {
  return cause ? PHRASE_CLIENT[cause] : PHRASE_CLIENT_INCONNUE;
}

/**
 * CE QUE LE CAISSIER LIT — et répète au client qui lui tend son téléphone.
 *
 * Aucune de ces phrases ne demande de retaper la saisie : la carte le dit déjà
 * une fois, au-dessus. Elles répondent à la seule question qui reste ouverte
 * au comptoir devant quelqu'un qui a réellement gagné : « pourquoi ? ».
 */
const PHRASE_CAISSE: Record<CauseAnnulation, string> = {
  purged:
    "Ce code est trop ancien : le ménage automatique des données a emporté l'opération qui le portait. Ce n'est une décision de personne — ni la vôtre, ni celle de votre équipe.",
  source_deleted:
    "L'opération qui le portait a été supprimée depuis votre espace.",
  merchant: "Ce lot a été annulé depuis votre espace, motif à l'appui.",
};

const PHRASE_CAISSE_INCONNUE =
  "Le registre ne dit pas ce qui l'a annulé : cette annulation est antérieure au suivi des causes.";

export function phraseCaisseAnnulation(
  cause: CauseAnnulation | null | undefined,
): string {
  return cause ? PHRASE_CAISSE[cause] : PHRASE_CAISSE_INCONNUE;
}
