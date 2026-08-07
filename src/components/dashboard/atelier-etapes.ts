/**
 * LES PRIMITIVES DE L'ATELIER — génériques, partagées par tous les modules.
 *
 * Module PUR (aucun React, aucun IO, aucune connaissance d'un module en
 * particulier) : chaque module apporte SA liste d'étapes et SA base d'URL, et
 * réutilise ici le parseur, le constructeur d'URL et le voisinage.
 *
 * L'étape vit dans la query string de la route détail existante — jamais dans
 * une sous-route. C'est ce qui garde valides les `revalidatePath` déjà écrits
 * (ils visent la page nue, et la revalidation ignore la query) et les écrans
 * qui citent ces URLs. Les autres paramètres d'URL (`?wheel=`, `?page=`…) sont
 * reconduits tels quels par `hrefEtape` : ce sont des PORTEURS, pas des états
 * d'étape.
 */
export type EtapeAtelier = {
  cle: string;
  titre: string;
  /** Ce que le commerçant règle ici, en une ligne. Facultatif. */
  resume?: string;
};

/**
 * Que faire quand l'URL ne porte PAS d'étape :
 * - `"premiere"` : la page N'A QUE l'atelier (la roue) — on rend la 1ʳᵉ étape.
 * - `"nulle"` : la page a deux visages — l'absence d'étape est la vue SUIVI.
 */
export type PolitiqueAbsenceEtape = "premiere" | "nulle";

/**
 * Lit `?etape=`. Une valeur INCONNUE retombe toujours sur la première étape,
 * jamais sur un 404 : une URL vieillie ou tronquée doit rendre un écran utile.
 * Seule l'ABSENCE est ambiguë, et c'est l'appelant qui tranche via `defaut`.
 */
export function parseEtape(
  etapes: readonly EtapeAtelier[],
  brut: string | undefined,
  defaut: PolitiqueAbsenceEtape = "premiere",
): string | null {
  const premiere = etapes.length > 0 ? etapes[0].cle : null;
  if (brut === undefined || brut === "") {
    return defaut === "nulle" ? null : premiere;
  }
  return etapes.some((e) => e.cle === brut) ? brut : premiere;
}

/**
 * URL d'une étape sur `base`. Les porteurs sont ajoutés APRÈS `etape`, dans
 * l'ordre de l'objet ; une valeur vide, `null` ou `undefined` est omise — la
 * page sait retomber sur son défaut, et une URL nue reste celle que citent les
 * autres écrans.
 */
export function hrefEtape(
  base: string,
  cle: string,
  porteurs?: Record<string, string | null | undefined>,
): string {
  const parts = [`etape=${encodeURIComponent(cle)}`];
  for (const [nom, valeur] of Object.entries(porteurs ?? {})) {
    if (valeur === null || valeur === undefined || valeur === "") continue;
    parts.push(`${encodeURIComponent(nom)}=${encodeURIComponent(valeur)}`);
  }
  return `${base}?${parts.join("&")}`;
}

/**
 * L'étape voisine dans le sens demandé (`-1` précédente, `1` suivante), ou
 * `null` aux deux bouts. Une clé inconnue n'a pas de voisin.
 */
export function etapeVoisine(
  etapes: readonly EtapeAtelier[],
  cle: string,
  sens: -1 | 1,
): EtapeAtelier | null {
  const index = etapes.findIndex((e) => e.cle === cle);
  if (index < 0) return null;
  const voisin = index + sens;
  return voisin >= 0 && voisin < etapes.length ? etapes[voisin] : null;
}

/** Rang affiché (1 à N), jamais dérivé ailleurs. `0` si la clé est inconnue. */
export function numeroEtape(
  etapes: readonly EtapeAtelier[],
  cle: string,
): number {
  return etapes.findIndex((e) => e.cle === cle) + 1;
}

/** La définition d'une étape, ou la première si la clé est inconnue. */
export function definitionEtape(
  etapes: readonly EtapeAtelier[],
  cle: string,
): EtapeAtelier | null {
  return etapes.find((e) => e.cle === cle) ?? etapes[0] ?? null;
}
