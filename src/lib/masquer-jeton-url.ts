/**
 * Masque les JETONS PORTEURS qui voyagent dans le CHEMIN d'une URL.
 *
 * Trois routes du produit portent un secret en clair dans leur chemin, et pas
 * dans la query — c'est là tout le problème, puisque l'assainissement des URLs
 * (src/lib/sentry-scrub.ts) travaille paramètre par paramètre et laisse le
 * chemin intact :
 *
 *  - `/commande/<jeton>` — QR de commande à usage unique ;
 *  - `/hunt/<jeton>` — jeton d'étape de chasse au trésor ;
 *  - `/invite/<jeton>` — invitation d'équipe (HMAC, 7 jours) : qui l'ouvre
 *    entre dans l'organisation avec le rôle inscrit dedans ;
 *  - `/reserver/invitation/<jeton>` — invitation privée Réserver (révocable,
 *    usages bornés) : qui l'ouvre peut réserver une place du quota invité.
 *
 * L'invitation voyage AUSSI encodée dans `?next=%2Finvite%2F…`, puisque la
 * page redirige un visiteur non connecté vers /login et /signup en emportant
 * sa destination. Ajouter le préfixe ne suffisait donc pas : la valeur de
 * `next` est décodée, masquée, puis ré-encodée (voir `PARAM_REDIRECTION`).
 *
 * Qui détient l'URL détient le droit. Or l'URL courante part chez PostHog à
 * chaque pageview (`$current_url`, `$pathname`, `$referrer`) et chez Sentry
 * dans les breadcrumbs de navigation, les transactions et `request.url` : deux
 * tiers finissaient donc par stocker, dans leurs journaux, de quoi rejouer une
 * commande ou tamponner une étape à la place du joueur.
 *
 * LISTE FERMÉE, volontairement. Masquer « tout segment qui ressemble à un
 * jeton » coûterait le diagnostic (les identifiants techniques se ressemblent
 * tous) et raterait quand même les formes inattendues. Quatre préfixes connus,
 * ajoutés à la main quand une cinquième route porteuse apparaîtra.
 *
 * Fonction PURE et sans dépendance : elle est appelée depuis
 * `src/components/analytics.tsx`, monté sur TOUTES les pages.
 */

/** Remplacement du segment. Même vocabulaire que `sentry-scrub`. */
export const SEGMENT_JETON_MASQUE = "[jeton]";

/**
 * `/(commande|hunt|invite)/<segment>` où qu'il se trouve dans la chaîne — début
 * de chemin, milieu d'une URL absolue, ou au fil d'un message d'erreur (« GET
 * /commande/abc 404 »).
 *
 * Le groupe capturé s'arrête à `/`, `?`, `#` ou à un blanc : la query, le
 * fragment et la suite du chemin sont donc PRÉSERVÉS — une URL masquée reste
 * lisible et regroupable, elle n'est plus rejouable. Insensible à la casse.
 *
 * Le `/` final du préfixe est exigé dans le motif : `/hunts/…` (la liste du
 * dashboard, au pluriel) n'y correspond pas et n'est pas touché.
 */
const CHEMIN_PORTEUR =
  /(\/(?:commande|hunt|invite|reserver\/invitation)\/)([^/?#\s"'<>\\]+)/gi;

/**
 * `?next=<valeur>` / `&next=<valeur>` — le SEUL paramètre du produit dont la
 * valeur est un chemin interne complet, donc le seul qui puisse transporter un
 * jeton de chemin sous forme percent-encodée (`%2Finvite%2F…`), invisible pour
 * `CHEMIN_PORTEUR` qui exige des `/` littéraux.
 *
 * Les autres paramètres restent l'affaire de `sentry-scrub`, qui expurge PAR
 * NOM. Chacun son poste.
 */
const PARAM_REDIRECTION = /([?&]next=)([^&#\s"'<>\\]+)/gi;

/** Le masquage de chemin seul, réutilisé sur la valeur décodée de `next`. */
function masquerChemins(valeur: string): string {
  // `String.replace` avec un motif global remet `lastIndex` à zéro de lui-même :
  // le motif partagé au niveau module ne garde donc pas d'état entre appels.
  return valeur.replace(
    CHEMIN_PORTEUR,
    (_m, prefixe: string) => `${prefixe}${SEGMENT_JETON_MASQUE}`,
  );
}

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
  return masquerChemins(valeur).replace(
    PARAM_REDIRECTION,
    (entier: string, prefixe: string, encode: string) => {
      let decode: string;
      try {
        decode = decodeURIComponent(encode);
      } catch {
        // Séquence `%` invalide : rien à décoder de fiable, on ne touche pas.
        return entier;
      }
      const masque = masquerChemins(decode);
      // Destination inoffensive (`?next=%2Fdashboard`) : rendue OCTET POUR
      // OCTET telle qu'elle est arrivée. Ré-encoder pour rien changerait la
      // forme des URLs de tout le monde et casserait le regroupement.
      if (masque === decode) return entier;
      // Ré-encodé pour rester une URL valide, sauf les crochets du marqueur :
      // `%5Bjeton%5D` se lit mal, et ceci est un journal qu'on relit à l'œil.
      const reencode = encodeURIComponent(masque)
        .replaceAll("%5B", "[")
        .replaceAll("%5D", "]");
      return `${prefixe}${reencode}`;
    },
  );
}
