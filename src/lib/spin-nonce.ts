/**
 * Nonce de LA TENTATIVE de tirage en cours, côté navigateur.
 *
 * ── Ce qu'il ferme ──
 * La base valide un tirage, la réponse réseau se perd (4G qui décroche,
 * invocation qui expire) : le joueur recharge et rejoue. Sur une roue
 * `play_limit = 'unlimited'`, un SECOND tirage est créé, avec un second
 * décrément de stock, et le premier gain reste orphelin. `spinWheel` sait
 * reconnaître un rejeu (clé dérivée `play:<player_key>:<nonce>`,
 * src/actions/play.ts) — encore faut-il que la seconde tentative porte LE MÊME
 * nonce que la première.
 *
 * ── Pourquoi la mémoire de session, et pas un `useRef` ──
 * Il n'existe aucun bouton « Réessayer » sur le tirage : le rejeu réel est un
 * RECHARGEMENT DE PAGE suivi d'un nouveau clic. Un nonce gardé en mémoire de
 * composant meurt avec la page et ne fermerait donc rien. `sessionStorage`
 * survit au rechargement et reste propre à l'onglet — soit exactement la
 * portée de « la même tentative ». La clé porte le slug : deux jeux ouverts
 * dans deux onglets ne partagent pas leur tentative.
 *
 * ── Défaut fermé ──
 * `sessionStorage` peut lever (navigation privée verrouillée, politique du
 * navigateur). Sans persistance, un rechargement après un commit dont la
 * réponse s'est perdue créerait une nouvelle tentative. L'appelant doit donc
 * refuser de lancer le tirage et expliquer au joueur que ce navigateur ne peut
 * pas sécuriser sa tentative.
 */

function cle(slug: string): string {
  return `lastchance:spin-nonce:${slug}`;
}

/** Même borne que `spinNonceSchema` côté serveur : une valeur hors forme serait ignorée. */
const FORME = /^[A-Za-z0-9_-]{16,64}$/;

/**
 * Le nonce de la tentative en cours pour ce jeu : celui déjà mémorisé s'il
 * existe, sinon un nouveau, mémorisé au passage.
 *
 * Lève si la valeur ne peut pas être générée ET relue depuis `sessionStorage`.
 * Aucun appel serveur ne doit partir dans ce cas.
 */
export function lireOuCreerNonceTirage(slug: string): string {
  try {
    const memorise = sessionStorage.getItem(cle(slug));
    if (memorise && FORME.test(memorise)) return memorise;
  } catch {
    throw new Error("stockage_nonce_indisponible");
  }

  if (typeof crypto === "undefined" || typeof crypto.randomUUID !== "function") {
    throw new Error("generation_nonce_indisponible");
  }
  const nonce = crypto.randomUUID();

  try {
    sessionStorage.setItem(cle(slug), nonce);
    if (sessionStorage.getItem(cle(slug)) !== nonce) {
      throw new Error("nonce_non_persiste");
    }
  } catch {
    throw new Error("stockage_nonce_indisponible");
  }
  return nonce;
}

/**
 * Oublie la tentative : la partie SUIVANTE devra en ouvrir une nouvelle.
 *
 * À appeler dès qu'une réponse est parvenue au client — succès comme refus.
 * Sans cet oubli, le tirage suivant rejouerait le précédent et le joueur ne
 * pourrait plus jamais jouer. À NE PAS appeler quand l'appel s'est rompu sans
 * réponse : c'est précisément le cas que le nonce existe pour couvrir.
 */
export function oublierNonceTirage(slug: string): void {
  try {
    sessionStorage.removeItem(cle(slug));
  } catch {
    // Rien à oublier si rien n'a pu être écrit.
  }
}
