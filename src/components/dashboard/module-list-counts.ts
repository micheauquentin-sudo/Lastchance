/**
 * LES COMPTES DES LISTES DE MODULES, BORNÉS À LA PAGE AFFICHÉE.
 *
 * Quatre listes (quiz, chasses, pronostics, passeports) affichaient, sous
 * chaque animation, un nombre d'enfants — questions, étapes, inscrits — et le
 * calculaient en ramenant TOUTE la table de l'organisation pour n'en garder
 * que les vingt lignes visibles. Un championnat à vingt mille pronostiqueurs
 * transférait vingt mille lignes pour afficher « 20 000 ».
 *
 * Deux régimes, et le choix entre eux n'est pas un détail :
 *
 * 1. `comptesGroupes` — pour les tables de CONFIGURATION (questions, étapes,
 *    paliers). Leur volume est borné par le module lui-même : vingt parents ×
 *    quelques dizaines de lignes. Une requête, bornée par `in`, agrégée en JS.
 * 2. `comptesParParent` — pour les tables de JOUEURS. Un `in` n'y suffirait
 *    pas : le volume est dans les joueurs, pas dans le nombre de parents. Seul
 *    un `count exact head` par parent ne transfère aucune ligne. Vingt
 *    allers-retours au plus — c'est le motif déjà en service sur la liste des
 *    événements (`app/dashboard/events/page.tsx`).
 *
 * LA BORNE EST ICI, PAS DANS LES PAGES. Chaque page passe sa requête déjà
 * filtrée sur son organisation ; c'est ce module qui pose le `in` (ou le `eq`
 * par parent). Quatre pages qui poseraient chacune leur borne, c'est quatre
 * occasions de l'oublier — celle de la cinquième liste, écrite en recopiant la
 * voisine, ne serait bornée par personne.
 *
 * Dans les deux cas, les identifiants passés sont ceux de la page COUPÉE
 * (`couperPage` retire la ligne excédentaire qui sert à détecter la suite) :
 * compter sur les vingt-et-une lignes brutes afficherait un parent de plus que
 * l'écran n'en montre.
 */

/** Le peu qu'on attend d'un builder PostgREST — testable sans base. */
export interface RequeteGroupee {
  in(
    colonne: string,
    valeurs: readonly string[],
  ): PromiseLike<{ data: Array<Record<string, unknown>> | null }>;
}

export interface RequeteComptee {
  eq(colonne: string, valeur: string): PromiseLike<{ count: number | null }>;
}

/** Une liste vide ne déclenche AUCUNE requête : `in ()` ne rendrait rien. */
export async function comptesGroupes(
  ids: readonly string[],
  colonneParent: string,
  requete: () => RequeteGroupee,
): Promise<Map<string, number>> {
  const comptes = new Map<string, number>();
  if (ids.length === 0) return comptes;
  const { data } = await requete().in(colonneParent, ids);
  for (const ligne of data ?? []) {
    const parent = ligne[colonneParent];
    if (typeof parent !== "string") continue;
    comptes.set(parent, (comptes.get(parent) ?? 0) + 1);
  }
  return comptes;
}

/**
 * Un `count exact head` par parent, en parallèle. Un compte indisponible vaut
 * 0 — comme l'agrégation JS qu'il remplace, qui ne comptait rien non plus
 * quand la requête échouait : ce n'est pas une garde de sécurité, c'est un
 * nombre d'affichage.
 */
export async function comptesParParent(
  ids: readonly string[],
  colonneParent: string,
  requete: () => RequeteComptee,
): Promise<Map<string, number>> {
  const entrees = await Promise.all(
    ids.map(async (id) => {
      const { count } = await requete().eq(colonneParent, id);
      return [id, count ?? 0] as const;
    }),
  );
  return new Map(entrees);
}
