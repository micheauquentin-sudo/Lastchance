/**
 * LES RAPPELS QUE LE COMMERÇANT PEUT FAIRE TAIRE.
 *
 * ── Pourquoi un cookie, et pas `localStorage` ni une colonne ──
 *
 * Le tableau de bord affichait cinq bandeaux, dont AUCUN n'était fermable :
 * un commerçant en essai relisait « il vous reste 12 jours » à chaque écran,
 * tous les jours, sans recours. Le seul mécanisme de masquage du produit
 * (`cookie-consent.tsx`) vit dans `localStorage` : il ne peut décider qu'APRÈS
 * hydratation, donc le bandeau apparaît puis disparaît — un clignotement à
 * chaque navigation, pire que le bandeau lui-même sur un layout serveur.
 *
 * Le cookie, lui, est lu par le Server Component AVANT le premier octet de
 * HTML : ce qui est fermé n'est jamais rendu. Une colonne en base donnerait la
 * même chose au prix d'une migration et d'une écriture par clic, pour une
 * préférence d'affichage qui n'a pas à survivre à un changement de navigateur.
 *
 * ── Ce que ce module est ──
 *
 * Une fonction pure de bout en bout : elle ne lit ni ne pose de cookie, elle
 * transforme des chaînes. La lecture appartient au layout, l'écriture à
 * `src/actions/rappels.ts`. C'est ce qui la rend testable sans requête.
 *
 * ── Ce qu'une clé porte ──
 *
 * Une clé est VERSIONNÉE par ce qu'elle annonce : `essai:<org>:j-12` n'est pas
 * `essai:<org>:j-11`. Fermer le rappel d'aujourd'hui ne fait donc pas taire
 * celui de demain — c'est voulu : l'échéance approche, l'information change.
 * L'identifiant d'organisation en fait partie parce qu'un même compte peut
 * basculer d'un établissement à l'autre (`OrganizationSwitcher`) et que le
 * silence obtenu sur l'un ne dit rien de l'autre.
 */

/** Nom du cookie. `httpOnly` : seul le serveur le lit, personne ne le bricole. */
export const RAPPELS_COOKIE = "lc-rappels-fermes";

/**
 * Plafond d'entrées. Un cookie est borné (~4 Ko par le navigateur, et il
 * repart dans CHAQUE requête) ; les clés étant versionnées, la liste
 * grossirait sans fin — un jour d'essai de plus, une entrée de plus. Au-delà,
 * la plus ancienne est éjectée : le rappel qu'elle taisait est le plus vieux,
 * donc le plus probablement périmé.
 */
export const RAPPELS_MAX = 20;

/**
 * Grammaire volontairement étroite : minuscules, chiffres, et les quelques
 * séparateurs dont les clés du produit ont besoin (`:` de segment, `-` de
 * `j-12`, `.` et `_` de réserve). Tout le reste est refusé — ce qui atterrit
 * ici vient d'un `formData`, donc du réseau.
 */
const MOTIF_CLE = /^[a-z0-9:._-]{1,120}$/;

export function cleRappelValide(cle: unknown): cle is string {
  return typeof cle === "string" && MOTIF_CLE.test(cle);
}

/**
 * Décode la valeur du cookie. TOUTE anomalie rend une liste vide plutôt que de
 * lever : un cookie tronqué par un proxy, réécrit à la main ou hérité d'un
 * ancien format ne doit pas faire tomber le tableau de bord entier. Le pire
 * qu'il puisse alors arriver est qu'un rappel réapparaisse.
 */
function lire(valeurCookie: string | undefined): string[] {
  if (!valeurCookie) return [];
  try {
    const brut: unknown = JSON.parse(valeurCookie);
    if (!Array.isArray(brut)) return [];
    return brut.filter(cleRappelValide);
  } catch {
    return [];
  }
}

/** Ce rappel a-t-il déjà été fermé ? Robuste à un cookie corrompu (→ `false`). */
export function estRappelFerme(
  valeurCookie: string | undefined,
  cle: string,
): boolean {
  if (!cleRappelValide(cle)) return false;
  return lire(valeurCookie).includes(cle);
}

/**
 * Rend la NOUVELLE valeur du cookie, clé ajoutée. Dédupliquée (re-fermer un
 * rappel déjà tu ne consomme pas une place) et plafonnée par la fin la plus
 * ancienne. Une clé invalide laisse la liste inchangée.
 */
export function ajouterRappelFerme(
  valeurCookie: string | undefined,
  cle: string,
): string {
  const existantes = lire(valeurCookie);
  if (!cleRappelValide(cle)) return JSON.stringify(existantes);
  const suivantes = [...existantes.filter((c) => c !== cle), cle];
  return JSON.stringify(suivantes.slice(-RAPPELS_MAX));
}
