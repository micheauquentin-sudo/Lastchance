/**
 * Masque les SECRETS PORTEURS qui voyagent dans une URL — dans son CHEMIN
 * comme dans sa QUERY.
 *
 * ── POURQUOI CE MODULE COUVRE LES DEUX, ET PAS SEULEMENT LE CHEMIN ──
 *
 * Il y a DEUX destinataires, et ils ne branchent pas la même chose :
 *  - Sentry passe par `src/lib/sentry-scrub.ts`, qui appelle `masquerJetonUrl`
 *    PUIS expurge la query par NOM de paramètre ;
 *  - PostHog ne branche QUE ce module (`src/components/analytics.tsx`,
 *    `before_send` → `masquerJetonsDeLEvenement`). Il n'y a pas de second
 *    poste derrière.
 *
 * Ce module s'est longtemps décrit comme ne traitant que le chemin, « les
 * autres paramètres restant l'affaire de sentry-scrub ». C'était vrai pour
 * Sentry et FAUX pour PostHog : un `?token=…` partait expurgé chez l'un et
 * intact chez l'autre — chez celui, précisément, qui reçoit l'URL de CHAQUE
 * pageview et pas seulement celle des incidents. D'où la règle : **tout ce que
 * PostHog ne doit pas voir se masque ICI**.
 *
 * ── LES SECRETS DANS LE CHEMIN ──
 *
 * Cinq routes du produit portent un secret en clair dans leur chemin :
 *
 *  - `/commande/<jeton>` — QR de commande à usage unique ;
 *  - `/hunt/<jeton>` — jeton d'étape de chasse au trésor ;
 *  - `/invite/<jeton>` — invitation d'équipe (HMAC, 7 jours) : qui l'ouvre
 *    entre dans l'organisation avec le rôle inscrit dedans ;
 *  - `/reserver/invitation/<jeton>` — invitation privée Réserver (révocable,
 *    usages bornés) : qui l'ouvre peut réserver une place du quota invité ;
 *  - `/ticket/<code>` — Ticket d'or. Le code N'EST PAS consommé au GET (choix
 *    délibéré : un préchargement ou un antivirus qui suit les liens aurait
 *    « joué » à la place du client), il reste donc ACTIF et REJOUABLE pendant
 *    et après la pageview qui l'emporte chez le tiers.
 *
 * L'invitation voyage AUSSI encodée dans `?next=%2Finvite%2F…`, puisque la
 * page redirige un visiteur non connecté vers /login et /signup en emportant
 * sa destination. Ajouter le préfixe ne suffisait donc pas : la valeur de
 * `next` est décodée, masquée, puis ré-encodée (voir `PARAM_REDIRECTION`).
 *
 * ── LES SECRETS DANS LA QUERY ──
 *
 * `?token=` porte un droit sur au moins deux pages publiques :
 * `/pronos/<slug>/recover` (lien magique de récupération) et
 * `/newsletter/unsubscribe` — ce dernier étant PERMANENT (`src/lib/unsubscribe.ts`).
 * Ils sont expurgés PAR NOM de paramètre, avec la liste PARTAGÉE de
 * `src/lib/cles-sensibles.ts` — la même que `sentry-scrub`, pas une copie qui
 * divergerait au premier ajout.
 *
 * Qui détient l'URL détient le droit. Or l'URL courante part chez PostHog à
 * chaque pageview (`$current_url`, `$pathname`, `$referrer`) et chez Sentry
 * dans les breadcrumbs de navigation, les transactions et `request.url` : deux
 * tiers finissaient donc par stocker, dans leurs journaux, de quoi rejouer une
 * commande ou tamponner une étape à la place du joueur.
 *
 * LISTE FERMÉE, volontairement — pour les chemins. Masquer « tout segment qui
 * ressemble à un jeton » coûterait le diagnostic (les identifiants techniques
 * se ressemblent tous) et raterait quand même les formes inattendues. Cinq
 * préfixes connus, ajoutés à la main quand une sixième route porteuse
 * apparaîtra. Pour la query, c'est l'inverse : le nom du paramètre est une
 * déclaration d'intention fiable, la liste partagée s'applique donc telle
 * quelle.
 *
 * Fonction PURE : elle est appelée depuis `src/components/analytics.tsx`,
 * monté sur TOUTES les pages. Sa seule dépendance est un module de constantes
 * sans dépendance à son tour.
 */

import { isSensitiveKey, REDEEM_CODE_PATTERN } from "./cles-sensibles";

/** Remplacement du segment. Même vocabulaire que `sentry-scrub`. */
export const SEGMENT_JETON_MASQUE = "[jeton]";

/**
 * Remplacement d'un code de retrait. `sentry-scrub` écrit `[code de retrait]` ;
 * ici le marqueur est plus court parce qu'il vit DANS une URL, où un espace
 * couperait la valeur en deux au premier relecteur — et parce que ces chaînes
 * sont regroupées par PostHog, qui n'aime pas les espaces dans un chemin.
 */
export const SEGMENT_CODE_MASQUE = "[code]";

/**
 * `/(commande|hunt|invite|reserver/invitation|ticket)/<segment>` où qu'il se
 * trouve dans la chaîne — début de chemin, milieu d'une URL absolue, ou au fil
 * d'un message d'erreur (« GET /commande/abc 404 »).
 *
 * Le groupe capturé s'arrête à `/`, `?`, `#` ou à un blanc : la query, le
 * fragment et la suite du chemin sont donc PRÉSERVÉS — une URL masquée reste
 * lisible et regroupable, elle n'est plus rejouable. Insensible à la casse.
 *
 * Le `/` final du préfixe est exigé dans le motif : `/hunts/…` (la liste du
 * dashboard, au pluriel) n'y correspond pas et n'est pas touché.
 */
const CHEMIN_PORTEUR =
  /(\/(?:commande|hunt|invite|reserver\/invitation|ticket)\/)([^/?#\s"'<>\\]+)/gi;

/**
 * `?<nom>=<valeur>` / `&<nom>=<valeur>`, sur DEUX critères — le nom, puis la
 * forme de la valeur.
 *
 * Le nom d'abord, confronté à la liste PARTAGÉE (`isSensitiveKey`) : `token`,
 * `sig`, `signature`, `apikey`… tombent, `page`, `src`, `statut`, `code` et
 * `next` restent.
 *
 * La forme ensuite, pour le cas que le nom ne peut pas trancher :
 * `/dashboard/redeem?code=GAIN-ABCD2345`. Le nom `code` doit rester lisible
 * (SQLSTATE, `error.code`, code PKCE de `/auth/callback`), mais sa valeur est
 * ici un droit encaissable en caisse. `REDEEM_CODE_PATTERN` tranche donc sur
 * la valeur.
 *
 * CE SECOND CRITÈRE NE S'APPLIQUE QU'ICI, dans la query, et JAMAIS au chemin —
 * c'est l'unique raison pour laquelle il vit dans ce motif-ci et pas dans un
 * passage à part. `qr_codes.slug` et `contests.slug` acceptent les MAJUSCULES
 * en base : `/play/EVENT-BRETAGNE` est une URL légitime, de la forme exacte
 * d'un code de retrait. La manger rendrait illisible la dimension que le
 * commerçant regarde, pour fermer une fuite qui n'existe pas — aucune route du
 * produit ne porte un code PRÉFIXÉ dans son chemin (vérifié : `/ticket/<code>`
 * et `/lobby/<code>` portent des codes NUS, fermés par leur préfixe de chemin).
 *
 * Le `[?&]` en tête est exigé : sans lui, le motif mordrait dans un texte libre
 * (« attempts=3 », « CRON_SECRET=… ») qui n'est pas une query et dont
 * l'expurgation appartient à `sentry-scrub`. Ici on ne traite QUE des URLs.
 */
const PARAM_SENSIBLE = /([?&])([A-Za-z0-9_.%[\]-]+)=([^&#\s"'<>\\]*)/g;

/**
 * `?next=<valeur>` / `&next=<valeur>` — le SEUL paramètre du produit dont la
 * valeur est un chemin interne complet, donc le seul qui puisse transporter un
 * secret sous forme percent-encodée (`%2Finvite%2F…`, ou un `%3Ftoken%3D…`),
 * invisible pour les deux motifs ci-dessus qui exigent des `/`, `?` et `&`
 * littéraux. Sa valeur est donc décodée, repassée au masquage COMPLET, puis
 * ré-encodée.
 */
const PARAM_REDIRECTION = /([?&]next=)([^&#\s"'<>\\]+)/gi;

function decodeSansLever(valeur: string): string {
  try {
    return decodeURIComponent(valeur);
  } catch {
    return valeur;
  }
}

/**
 * Le masquage complet d'une URL — chemin ET query —, réutilisé tel quel sur la
 * valeur décodée de `next`.
 */
function masquerUrl(valeur: string): string {
  // `String.replace` avec un motif global remet `lastIndex` à zéro de lui-même :
  // les motifs partagés au niveau module ne gardent donc pas d'état entre appels.
  return valeur
    .replace(
      CHEMIN_PORTEUR,
      (_m, prefixe: string) => `${prefixe}${SEGMENT_JETON_MASQUE}`,
    )
    .replace(
      PARAM_SENSIBLE,
      (
        entier: string,
        separateur: string,
        nom: string,
        valeur: string,
      ) => {
        // 1. Le NOM annonce un secret : la valeur disparaît en entier.
        if (isSensitiveKey(decodeSansLever(nom))) {
          return `${separateur}${nom}=${SEGMENT_JETON_MASQUE}`;
        }
        // 2. Le nom est anodin mais la VALEUR a la forme d'un code de retrait.
        //    C'est le cas de `/dashboard/redeem?code=GAIN-ABCD2345` : `code`
        //    doit rester lisible (SQLSTATE, code PKCE de /auth/callback), mais
        //    ce qu'il porte là est encaissable en caisse.
        const masque = valeur.replace(REDEEM_CODE_PATTERN, SEGMENT_CODE_MASQUE);
        return masque === valeur ? entier : `${separateur}${nom}=${masque}`;
      },
    );
}

/**
 * Rend la chaîne débarrassée de ses secrets porteurs, inchangée si elle n'en
 * contient aucun.
 *
 * Accepte indifféremment une URL absolue, un chemin relatif ou un texte libre :
 * les trois formes arrivent, selon qu'on regarde `$current_url`, `$pathname` ou
 * le message d'une exception.
 */
export function masquerJetonUrl(valeur: string): string {
  if (!valeur) return valeur;
  return masquerUrl(valeur).replace(
    PARAM_REDIRECTION,
    (entier: string, prefixe: string, encode: string) => {
      let decode: string;
      try {
        decode = decodeURIComponent(encode);
      } catch {
        // Séquence `%` invalide : rien à décoder de fiable, on ne touche pas.
        return entier;
      }
      const masque = masquerUrl(decode);
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
