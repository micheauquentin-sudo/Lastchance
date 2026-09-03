/**
 * LES ÉTAPES D'UN STUDIO — la déclaration, et rien d'autre.
 *
 * Ce fichier est le premier morceau du socle extrait du studio vitrine (VIT-35
 * à VIT-37) pour que les douze animations du produit se règlent dans la même
 * forme. Il ne connaît aucun module : il sait qu'une étape a une clé, un titre
 * et un résumé, et il sait fabriquer le nom que lira un lecteur d'écran.
 *
 * ── POURQUOI LE LIBELLÉ ACCESSIBLE VIT ICI ──
 *
 * Le numéro est ce qui transforme un panneau de réglages en parcours : il dit
 * combien il en reste et où l'on en est. Mais à l'écran il tient dans une
 * pastille, et lu seul il ne dit rien — « 3 Ma carte » n'apprend pas de quoi
 * trois est le numéro. Le nom accessible est donc COMPOSÉ, à un seul endroit,
 * et les gardes s'en servent aussi : recopié dans un test, il divergerait au
 * premier renommage et la garde chercherait un bouton qui n'existe plus.
 */

export interface DeclarationEtape<C extends string = string> {
  readonly cle: C;
  readonly titre: string;
  /** Ce que l'étape règle, en une phrase de commerçant. Sert d'infobulle. */
  readonly resume: string;
}

/** « Étape 3 sur 9 : Ma carte ». */
export function libelleEtape<C extends string>(
  etapes: readonly DeclarationEtape<C>[],
  cle: C,
): string {
  const index = etapes.findIndex((e) => e.cle === cle);
  if (index < 0) throw new Error(`Étape inconnue : ${cle}`);
  return `Étape ${index + 1} sur ${etapes.length} : ${etapes[index].titre}`;
}

/**
 * Une étape INCONNUE retombe sur la première, jamais sur un écran vide.
 *
 * Même arbitrage que partout ailleurs dans ce dépôt (ADR-129) : ce qui n'est
 * pas reconnu mène quelque part d'utile. Un lien périmé, un signet d'avant un
 * redécoupage, une faute de frappe — tous ouvrent le studio, aucun ne montre
 * une page blanche.
 */
export function parseEtape<C extends string>(
  etapes: readonly DeclarationEtape<C>[],
  brut: string | null | undefined,
): C {
  const trouvee = etapes.find((e) => e.cle === brut);
  return trouvee ? trouvee.cle : etapes[0].cle;
}
