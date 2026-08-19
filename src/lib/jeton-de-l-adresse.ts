/**
 * LE JETON, LU DE L'ADRESSE — jamais reçu en prop d'un composant serveur.
 *
 * Une prop passée d'un composant SERVEUR à un composant CLIENT est SÉRIALISÉE
 * DANS LE PAYLOAD RSC, c'est-à-dire recopiée en clair dans le HTML
 * (`self.__next_f.push`). Un jeton secret s'y retrouvait donc dans le CORPS de
 * la page — pas seulement dans son adresse — là où le mettent aussi les caches
 * intermédiaires et les extensions qui lisent le DOM.
 *
 * La lecture se fait donc ici, côté client, AU MOMENT DE L'USAGE (juste avant
 * l'appel réseau, jamais au rendu). Ce n'est pas une seconde source de vérité :
 * c'est LA source, la seule qui existe déjà côté client de toute façon, et sa
 * lecture ne franchit aucune frontière. Les actions serveur revalident le jeton
 * de bout en bout — rien n'est cru sur parole ici.
 *
 * Le geste vient de `src/components/reserver/invitation-experience.tsx`
 * (revue de sécurité du lot L5), qui en garde la démonstration détaillée.
 *
 * @returns le dernier segment de `window.location.pathname`, décodé — l'adresse
 * est percent-encodée par le navigateur, et un jeton rendu tel quel ne
 * correspondrait plus à son empreinte. Chaîne vide côté serveur.
 */
export function jetonDeLAdresse(): string {
  if (typeof window === "undefined") return "";
  const segments = window.location.pathname.split("/").filter(Boolean);
  const dernier = segments[segments.length - 1] ?? "";
  try {
    return decodeURIComponent(dernier);
  } catch {
    // Séquence `%` invalide : la valeur brute part telle quelle et sera refusée
    // par la validation, ce qui est exactement le bon résultat.
    return dernier;
  }
}
