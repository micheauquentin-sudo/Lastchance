/**
 * Lit la provenance de la partie depuis l'URL, côté client uniquement.
 *
 * La page /play est mise en cache (ISR) : lire `searchParams` côté
 * serveur casserait ce cache sur le chemin le plus chaud de l'app. On
 * lit donc `?ref=share` au moment du spin, dans le navigateur, et on
 * transmet la source au server action. Toute valeur autre que `share`
 * est normalisée en `direct` côté serveur (voir actions/play.ts).
 */
export function readShareSource(): "share" | "direct" {
  if (typeof window === "undefined") return "direct";
  const ref = new URLSearchParams(window.location.search).get("ref");
  return ref === "share" ? "share" : "direct";
}
