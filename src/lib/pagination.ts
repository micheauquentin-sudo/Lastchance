/**
 * ── UN NUMÉRO DE PAGE VENU D'UNE URL, LU UNE SEULE FOIS ──
 *
 * Cinq écrans lisaient `?page=` avec la même expression recopiée —
 * `Math.max(1, Number.parseInt(brut ?? "1", 10) || 1)` — et aucun ne posait de
 * `Math.min`. Un `?page=1000000` tapé dans la barre d'adresse partait donc tel
 * quel en base : `offset 19 999 980`, que Postgres calcule et jette pour rendre
 * zéro ligne. Cinq copies, cinq occasions de diverger au premier plafond posé.
 *
 * ── POURQUOI UN PLAFOND CONSTANT, ET PAS `ceil(total / pageSize)` ──
 *
 * Le plafond « juste » suppose un total EXACT, c'est-à-dire le `count:
 * "exact"` que l'autre moitié du même constat fait justement disparaître de
 * Participations. Les deux moitiés de la correction étaient en tension ; une
 * constante est le seul chemin cohérent, et 500 pages (25 000 lignes sur
 * Participations, 10 000 sur les listes de modules) place la borne bien
 * au-delà de tout usage réel.
 *
 * ── LE MÊME CHIFFRE VIT EN BASE ──
 *
 * `org_customer_profiles_page` et `org_qr_hub` sont `grant execute … to
 * authenticated` : un clamp posé ici couvre l'ÉCRAN, pas les RPC. Elles
 * portent donc le même 500 (migration 20260928120000, section CNT-1). Les deux
 * sites doivent bouger ensemble ou pas du tout.
 *
 * ── AU-DESSUS DU PLAFOND : REPLI SILENCIEUX ──
 *
 * Convention du dépôt pour un paramètre d'URL hors domaine — un `statut`
 * inconnu ou une date mal formée retombent sur le défaut sans un mot
 * (`module-list-filters.tsx`). Une page demandée trop loin n'est pas une
 * erreur, juste une page vide ; rediriger vers « la dernière page » supposerait
 * de savoir laquelle, c'est-à-dire le total qu'on vient de retirer.
 */

/** Plafond de pagination, en PAGES. Le même en base (les deux RPC bornées). */
export const PLAFOND_PAGE = 500;

/**
 * Numéro de page d'un paramètre d'URL, borné à `[1, plafond]`.
 *
 * Tout ce qui n'est pas un entier lisible — absent, vide, `"abc"`, `"-3"`,
 * `"NaN"` — vaut 1 : c'est le comportement que les cinq écrans avaient déjà,
 * et le seul repli qui affiche quelque chose plutôt que rien.
 */
export function parsePageParam(
  brut: string | string[] | undefined | null,
  plafond: number = PLAFOND_PAGE,
): number {
  // `string[]` : Next rend un tableau quand le paramètre est répété dans
  // l'URL (`?page=2&page=9`). Non géré par les cinq copies, qui passaient
  // alors un tableau à `parseInt` — donc `NaN`, donc 1. Même issue, écrite.
  const valeur = Array.isArray(brut) ? brut[0] : brut;
  const page = Math.max(1, Number.parseInt(valeur ?? "1", 10) || 1);
  return Math.min(page, plafond);
}
