import "server-only";

/**
 * CACHE DE L'ÉTAT COMMUN D'UNE SESSION LIVE — une seconde, pas davantage.
 *
 * ── POURQUOI ────────────────────────────────────────────────────────
 *
 * Un participant d'une soirée n'est pas une requête, c'est un rafraîchissement
 * CONTINU : `eventPollDelay` fixe 2 500 ms par joueur pendant une question quand
 * Realtime n'est pas connecté. Mille joueurs demandent donc 400 req/s soutenues,
 * et chacune recalculait le MÊME classement. Mesuré (`docs/perf-report.md` §7) :
 * 26 req/s à 20 connexions, p50 à 10,5 s à 150 — pour une offre qui vend 1 000
 * places.
 *
 * ── CE QUI REND CE CACHE ADMISSIBLE ─────────────────────────────────
 *
 * La clé est l'IDENTIFIANT DE SESSION SEUL, et la valeur vient de
 * `event_etat_partage`, une fonction SQL qui ne prend AUCUN jeton joueur — elle
 * ne peut donc rien rendre de personnel. La vue « moi » (score, rang, code
 * gagné) reste calculée à chaque appel et n'entre jamais ici.
 *
 * C'est la seule raison pour laquelle partager une réponse entre deux joueurs
 * n'est pas une fuite. Si un jour quelqu'un ajoute un paramètre d'identité à
 * `event_etat_partage`, ce cache devient un défaut de sécurité le jour même :
 * le commentaire de la fonction SQL le dit aussi, aux deux endroits.
 *
 * ── POURQUOI UNE SECONDE ────────────────────────────────────────────
 *
 * L'écran interroge toutes les 2 500 ms au plus vite. Un cache d'une seconde est
 * donc invisible pour un joueur — il ne peut pas voir une donnée plus vieille
 * que ce que son propre rythme lui impose déjà — tout en effondrant le travail
 * base : mille joueurs ne produisent plus qu'une requête par seconde et par
 * instance, au lieu de quatre cents.
 *
 * Ce n'est PAS un cache de correction : le classement peut retarder d'une
 * seconde. Sur un quiz de salle où les scores bougent à chaque réponse, c'est
 * un compromis assumé, et il est plus honnête que la situation actuelle — un
 * classement « frais » servi avec dix secondes de latence est plus périmé qu'un
 * classement d'une seconde servi immédiatement.
 *
 * ── PORTÉE : UNE INSTANCE ───────────────────────────────────────────
 *
 * En serverless, chaque instance a sa propre carte. Le gain n'est donc pas
 * « une requête par seconde » mais « une par seconde ET par instance » — ce qui
 * suffit largement : la charge se répartit entre instances, et chacune amortit
 * sa part. Aucun état partagé, donc aucune cohérence à garantir entre elles.
 */

interface Entree {
  /** Instant (ms) au-delà duquel l'entrée n'est plus servie. */
  expireA: number;
  valeur: unknown;
}

/** Durée de vie. Volontairement plus courte que la cadence de poll (2 500 ms). */
export const ETAT_PARTAGE_TTL_MS = 1_000;

/**
 * Plafond de la carte. Une instance ne sert qu'un nombre borné de sessions
 * simultanées ; sans plafond, une rafale sur des identifiants inventés ferait
 * grossir la carte indéfiniment — la clé vient de l'appelant.
 */
const TAILLE_MAX = 500;

const carte = new Map<string, Entree>();

/** Horloge injectable : les tests ne doivent pas dépendre du temps réel. */
let maintenant = () => Date.now();

/** @internal réservé aux tests */
export function _remplacerHorloge(fn: () => number): void {
  maintenant = fn;
}

/** @internal réservé aux tests */
export function _viderCache(): void {
  carte.clear();
}

/**
 * Rend l'état commun d'une session, depuis le cache s'il est frais, sinon en
 * appelant `charger` — dont le résultat est mémorisé.
 *
 * Un chargement qui échoue (exception) n'est PAS mémorisé : une panne d'une
 * seconde ne doit pas se figer en une seconde d'erreur servie à toute la salle.
 */
export async function etatPartageAvecCache(
  sessionId: string,
  charger: () => Promise<unknown>,
): Promise<unknown> {
  const t = maintenant();
  const existante = carte.get(sessionId);
  if (existante && existante.expireA > t) {
    return existante.valeur;
  }

  const valeur = await charger();

  // Purge paresseuse : on ne balaie que si la carte dépasse son plafond, et on
  // retire d'abord les entrées périmées. C'est O(n) mais amorti, et n est borné.
  if (carte.size >= TAILLE_MAX) {
    for (const [cle, entree] of carte) {
      if (entree.expireA <= t) carte.delete(cle);
    }
    // Toujours pleine (que des entrées fraîches) : on sacrifie la plus ancienne
    // insérée — Map conserve l'ordre d'insertion.
    if (carte.size >= TAILLE_MAX) {
      const premiere = carte.keys().next();
      if (!premiere.done) carte.delete(premiere.value);
    }
  }

  carte.set(sessionId, { expireA: t + ETAT_PARTAGE_TTL_MS, valeur });
  return valeur;
}
