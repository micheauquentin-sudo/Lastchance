/**
 * Le verdict d'un comptage « des codes attendent-ils encore en caisse ? ».
 *
 * ── LE DÉFAUT FERMÉ ─────────────────────────────────────────
 *
 * Les huit gardes de suppression du produit s'écrivaient toutes de la même
 * façon : `const { count } = await supabase…` puis `(count ?? 0) > 0`. Deux
 * choses s'y perdaient, et la seconde est la dangereuse.
 *
 * `error` n'était JAMAIS lu. Et `count` vaut `null` dès que la requête n'a pas
 * abouti — coupure réseau, délai PostgREST dépassé, policy absente le temps
 * d'une migration. Le `?? 0` transformait alors « je n'ai pas pu savoir » en
 * « il n'y a rien à perdre » : la suppression irréversible passait sans
 * confirmation, sans case à cocher, sans la moindre trace, et le commerçant
 * n'apprenait jamais qu'on n'avait rien vérifié. Une garde qui échoue OUVERT
 * protège exactement les jours où rien ne va mal.
 *
 * ── POURQUOI UN VERDICT, ET PAS UN BOOLÉEN ──────────────────
 *
 * Les trois issues sont réellement distinctes à l'écran, et un booléen en
 * écrase deux : « aucun code » laisse passer, « N codes » demande une
 * confirmation COCHABLE, « indisponible » refuse SANS case — cocher une case
 * qu'aucun chiffre n'accompagne n'apprendrait au commerçant qu'à cocher sans
 * lire, et c'est précisément ce que le registre des confirmations destructives
 * de ce dépôt cherche à éviter.
 *
 * Le refus est RENDU, jamais levé : c'est la règle déjà adoptée ici pour la
 * cadence des workers (ADR-062). Un refus prévisible — et une base
 * momentanément injoignable en est un — n'a rien à faire dans un journal
 * d'erreur sous forme d'exception.
 */
export type VerdictCodesEnAttente =
  /** La question n'a pas pu être posée : on refuse, et on ne propose rien à cocher. */
  | { etat: "indisponible"; motif: string }
  /** Aucun engagement en cours : le geste d'entretien est banal, il passe. */
  | { etat: "aucun" }
  /** N codes émis et non retirés : le refus doit NOMMER ce chiffre. */
  | { etat: "en-attente"; nombre: number };

/**
 * Refus commun aux gardes qui comptent des CODES quand le comptage a échoué.
 *
 * Elles étaient huit à l'écriture de cette ligne, elles sont onze : le nombre
 * n'est plus écrit ici, il l'est une seule fois, dans le registre
 * `destructive-confirm-coverage.test.ts`, où un test le fait rougir.
 *
 * Toutes les gardes de ce dépôt ne comptent pas des codes : la suppression
 * d'une manche de soirée compte des RÉPONSES, et porte donc son propre message
 * d'indisponibilité — celui-ci parle de caisse, ce qui serait faux là-bas.
 */
export const COMPTAGE_INDISPONIBLE =
  "Impossible de vérifier les codes encore en attente en caisse. " +
  "Réessayez dans un instant : tant que ce contrôle n'a pas abouti, " +
  "la suppression est refusée pour ne rien détruire à l'aveugle.";

/**
 * Lit un `{ count, error }` de PostgREST et tranche.
 *
 * `error` d'abord, `count === null` ensuite : les deux valent « indisponible »,
 * mais un `error` porte un message exploitable et un `null` muet n'en a pas —
 * les distinguer donne à `reportError` quelque chose à dire dans les deux cas.
 */
export function verdictCodesEnAttente(resultat: {
  count: number | null;
  error: { message: string } | null;
}): VerdictCodesEnAttente {
  if (resultat.error) {
    return { etat: "indisponible", motif: resultat.error.message };
  }
  if (resultat.count === null) {
    return { etat: "indisponible", motif: "comptage sans résultat ni erreur" };
  }
  return resultat.count > 0
    ? { etat: "en-attente", nombre: resultat.count }
    : { etat: "aucun" };
}

/**
 * Somme de PLUSIEURS comptages, pour une suppression qui emporte plusieurs
 * tables de codes (le calendrier en a deux : la case et l'assiduité).
 *
 * Un seul comptage indisponible suffit à rendre le tout indisponible : on ne
 * sait pas ce que la table muette contenait, et additionner les autres
 * afficherait un chiffre qu'on sait incomplet — pire qu'aucun chiffre, parce
 * qu'il aurait l'air d'en être un.
 */
export function verdictCumule(
  resultats: Array<{ count: number | null; error: { message: string } | null }>,
): VerdictCodesEnAttente {
  let total = 0;
  for (const resultat of resultats) {
    const verdict = verdictCodesEnAttente(resultat);
    if (verdict.etat === "indisponible") return verdict;
    if (verdict.etat === "en-attente") total += verdict.nombre;
  }
  return total > 0 ? { etat: "en-attente", nombre: total } : { etat: "aucun" };
}
