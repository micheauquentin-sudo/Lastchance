/**
 * Masque les JETONS PORTEURS qui voyagent dans le CHEMIN d'une URL.
 *
 * Deux routes du produit portent un secret en clair dans leur chemin, et pas
 * dans la query — c'est là tout le problème, puisque l'assainissement des URLs
 * (src/lib/sentry-scrub.ts) travaille paramètre par paramètre et laisse le
 * chemin intact :
 *
 *  - `/commande/<jeton>` — QR de commande à usage unique ;
 *  - `/hunt/<jeton>` — jeton d'étape de chasse au trésor.
 *
 * Qui détient l'URL détient le droit. Or l'URL courante part chez PostHog à
 * chaque pageview (`$current_url`, `$pathname`, `$referrer`) et chez Sentry
 * dans les breadcrumbs de navigation, les transactions et `request.url` : deux
 * tiers finissaient donc par stocker, dans leurs journaux, de quoi rejouer une
 * commande ou tamponner une étape à la place du joueur.
 *
 * LISTE FERMÉE, volontairement. Masquer « tout segment qui ressemble à un
 * jeton » coûterait le diagnostic (les identifiants techniques se ressemblent
 * tous) et raterait quand même les formes inattendues. Deux préfixes connus,
 * ajoutés à la main quand une troisième route porteuse apparaîtra.
 *
 * Fonction PURE et sans dépendance : elle est appelée depuis
 * `src/components/analytics.tsx`, monté sur TOUTES les pages.
 */

/** Remplacement du segment. Même vocabulaire que `sentry-scrub`. */
export const SEGMENT_JETON_MASQUE = "[jeton]";

/**
 * `/(commande|hunt)/<segment>` où qu'il se trouve dans la chaîne — début de
 * chemin, milieu d'une URL absolue, ou au fil d'un message d'erreur (« GET
 * /commande/abc 404 »).
 *
 * Le groupe capturé s'arrête à `/`, `?`, `#` ou à un blanc : la query, le
 * fragment et la suite du chemin sont donc PRÉSERVÉS — une URL masquée reste
 * lisible et regroupable, elle n'est plus rejouable. Insensible à la casse.
 *
 * Le `/` final du préfixe est exigé dans le motif : `/hunts/…` (la liste du
 * dashboard, au pluriel) n'y correspond pas et n'est pas touché.
 */
const CHEMIN_PORTEUR = /(\/(?:commande|hunt)\/)([^/?#\s"'<>\\]+)/gi;

/**
 * Rend la chaîne débarrassée de ses jetons de chemin, inchangée si elle n'en
 * contient aucun.
 *
 * Accepte indifféremment une URL absolue, un chemin relatif ou un texte libre :
 * les trois formes arrivent, selon qu'on regarde `$current_url`, `$pathname` ou
 * le message d'une exception.
 */
export function masquerJetonUrl(valeur: string): string {
  if (!valeur) return valeur;
  // `String.replace` avec un motif global remet `lastIndex` à zéro de lui-même :
  // le motif partagé au niveau module ne garde donc pas d'état entre appels.
  return valeur.replace(
    CHEMIN_PORTEUR,
    (_m, prefixe: string) => `${prefixe}${SEGMENT_JETON_MASQUE}`,
  );
}
