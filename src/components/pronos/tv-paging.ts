/**
 * Pagination du classement en mode TV : au-delà d'un écran, les lignes
 * défilent par pages complètes (rotation douce côté client). Logique
 * pure et testée — le composant d'affichage ne fait que consommer.
 */

/** Lignes de classement affichées par écran (lisible à distance). */
export const TV_ROWS_PER_PAGE = 12;

/** Découpe le classement en pages pleines, dans l'ordre des rangs. */
export function tvPages<T>(
  entries: readonly T[],
  pageSize: number = TV_ROWS_PER_PAGE,
): T[][] {
  const size = Math.max(1, Math.floor(pageSize));
  const pages: T[][] = [];
  for (let i = 0; i < entries.length; i += size) {
    pages.push(entries.slice(i, i + size));
  }
  return pages;
}

/**
 * Index de page borné par rotation : le compteur avance sans fin côté
 * client tandis que le nombre de pages peut varier à chaque photo du
 * classement (joueurs qui arrivent ou repartent).
 */
export function clampTvPage(page: number, pageCount: number): number {
  if (pageCount <= 0) return 0;
  return ((page % pageCount) + pageCount) % pageCount;
}
