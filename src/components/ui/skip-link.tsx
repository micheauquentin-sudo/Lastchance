/**
 * Lien d'évitement : premier élément focusable de la page, masqué
 * visuellement (sr-only) et révélé au focus clavier. Cible `#contenu`
 * — le conteneur principal de la surface doit porter `id="contenu"` et
 * `tabIndex={-1}` pour que le focus s'y pose réellement. `z-[80]` : au-
 * dessus des en-têtes sticky du projet (site z-50, bandeau kermesse z-10).
 */
export function SkipLink() {
  return (
    <a
      href="#contenu"
      className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[80] focus:rounded-lg focus:bg-k-ink focus:px-4 focus:py-2 focus:text-sm focus:font-bold focus:text-k-bg"
    >
      Aller au contenu
    </a>
  );
}
