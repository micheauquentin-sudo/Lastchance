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

/**
 * LISTE BLANCHE DES FAMILLES DE RAPPELS FERMABLES.
 *
 * La grammaire seule ne dit QUE la forme : `abonnement-inactif:<org>` la
 * respecte parfaitement. Or ce bandeau-là est BLOQUANT — il annonce que le
 * commerce ne peut plus jouer — et il n'a jamais eu de croix. Le jour où
 * quelqu'un en poserait une par copier-coller du bandeau d'essai, le rappel le
 * plus grave du produit deviendrait le plus facile à faire taire, pour six mois,
 * sans que rien ne l'empêche.
 *
 * D'où cette liste : l'invariant « un bandeau bloquant n'est jamais fermable »
 * n'est plus une consigne, il est tenu mécaniquement. Ajouter une famille
 * fermable exige d'étendre CETTE liste — donc une décision explicite, relue,
 * plutôt qu'un effet de bord d'une clé bien formée.
 *
 * Filtrée à l'ÉCRITURE (l'action `fermerRappel`) comme à la LECTURE
 * (`estRappelFerme`, et le filtre de `lire`) : un cookie hérité d'une version
 * antérieure, ou fabriqué avant l'ajout de cette garde, ne fait rien taire.
 */
export const PREFIXES_RAPPELS = [
  "acces-offert:",
  "essai:",
  "conseiller:",
] as const;

export function cleRappelValide(cle: unknown): cle is string {
  return (
    typeof cle === "string" &&
    MOTIF_CLE.test(cle) &&
    PREFIXES_RAPPELS.some((prefixe) => cle.startsWith(prefixe))
  );
}

/**
 * Ramène un segment de clé à la grammaire, comme le fait `cleRappelConseils`.
 * Un segment vidé par le filtrage devient `inconnu` plutôt que vide : deux
 * `::` de suite restent une clé valide, mais illisible et — surtout — un
 * segment absent NE DOIT PAS pouvoir se confondre avec un autre.
 */
function segment(valeur: string): string {
  return valeur.toLowerCase().replace(/[^a-z0-9._-]/g, "") || "inconnu";
}

/**
 * Clé du bandeau « accès offert », versionnée par son ÉCHÉANCE : quand la date
 * bouge, le fait change et le bandeau revient. `null` = accès sans terme.
 *
 * Une `Date` invalide (`getTime()` → `NaN`) ne produit plus un segment fantôme :
 * elle rend `inconnu`. Sans cela, la clé partait avec un `nan` dans une famille
 * autorisée, donc la croix « marchait » — et taisait la même clé pour toutes les
 * échéances illisibles, c'est-à-dire potentiellement pour un autre fait.
 */
export function cleAccesOffert(orgId: string, echeance: Date | null): string {
  let quand = "sans-fin";
  if (echeance) {
    const instant = echeance.getTime();
    quand = Number.isFinite(instant) ? String(instant) : "inconnu";
  }
  return `acces-offert:${segment(orgId)}:${segment(quand)}`;
}

/**
 * Clé du bandeau d'essai, versionnée par les JOURS RESTANTS : fermer « il vous
 * reste 12 jours » ne fait pas taire « il vous en reste 3 ». Un compte non fini
 * (`NaN`, `Infinity`) rend `inconnu` au lieu d'une clé bancale.
 */
export function cleEssai(orgId: string, joursRestants: number): string {
  const jours = Number.isFinite(joursRestants)
    ? String(Math.trunc(joursRestants))
    : "inconnu";
  return `essai:${segment(orgId)}:j-${segment(jours)}`;
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
