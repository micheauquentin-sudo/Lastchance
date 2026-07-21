/**
 * Navigation clavier d'une tablist WAI-ARIA à activation automatique
 * (pattern « Tabs » de l'APG) : calcule l'index de l'onglet visé par une
 * touche. Retourne `null` si la touche ne pilote pas la navigation —
 * l'appelant laisse alors le comportement natif.
 */
export function nextTabIndex(
  current: number,
  key: string,
  count: number,
): number | null {
  if (count <= 0) return null;
  switch (key) {
    case "ArrowRight":
      return (current + 1) % count;
    case "ArrowLeft":
      return (current - 1 + count) % count;
    case "Home":
      return 0;
    case "End":
      return count - 1;
    default:
      return null;
  }
}
