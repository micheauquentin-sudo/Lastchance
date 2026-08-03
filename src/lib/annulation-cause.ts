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
 * Vocabulaire fermé, posé par la RPC `player_wallet` (20260902120000:706-712).
 * `null` hors annulation, et pour toute valeur inattendue.
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
 * Les deux motifs que `cancel_reward_issuance_on_source_delete` écrit dans
 * `cancelled_reason` (20260902120000:247-251).
 *
 * Ils sont recopiés ici parce que la caisse n'a PAS d'autre chemin : elle lit
 * `reward_issuances` en direct (`lookupUniversalRewardRoute`), pas
 * `player_wallet`, qui est scopée au joueur porteur du cookie. La recopie est
 * une duplication réelle du `case` SQL, et c'est pour cela qu'elle est
 * confinée à ces deux constantes et vérifiée contre le fichier de migration
 * par `annulation-cause.test.ts` : sans cette garde, renommer un motif côté
 * base ferait silencieusement retomber toutes les annulations automatiques
 * dans `merchant` — c'est-à-dire recréerait exactement l'accusation qu'on
 * ferme ici.
 */
export const MOTIF_PURGE = "source purgée";
export const MOTIF_SUPPRESSION = "source supprimée";

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
 * Cause déduite du motif brut de `reward_issuances.cancelled_reason`, pour le
 * seul appelant qui n'a que lui : la caisse.
 *
 * Un motif absent vaut `null` et non `merchant` — l'appelant ne sait alors même
 * pas si la ligne est annulée. Tout autre texte est un motif SAISI, donc une
 * décision du commerçant : c'est le repli du `case` SQL, à l'identique.
 */
export function causeDepuisMotif(
  motif: string | null | undefined,
): CauseAnnulation | null {
  if (motif === null || motif === undefined) return null;
  if (motif === MOTIF_PURGE) return "purged";
  if (motif === MOTIF_SUPPRESSION) return "source_deleted";
  return "merchant";
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
