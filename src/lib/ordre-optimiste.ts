/**
 * Écrasement local d'un ORDRE, avec l'ordre serveur comme date de péremption.
 *
 * ── Le défaut qui a rendu ce module nécessaire (2026-07-30) ──
 *
 * Les listes réordonnables du back-office (questions de quiz, étapes de chasse)
 * envoient au serveur l'ORDRE COMPLET, recalculé depuis la liste affichée. Or
 * l'affichage dépendait de `router.refresh()`, mesuré défaillant 5 à 32 % du
 * temps (docs/bugs.md). Quand il ne s'appliquait pas, la liste affichée restait
 * périmée — et le clic SUIVANT écrivait en base un ordre que le commerçant
 * n'avait jamais demandé. Pas un écran figé : une donnée fausse, sans signal.
 *
 * ── Pourquoi ce mécanisme plutôt qu'un rechargement franc ──
 *
 * Le rechargement est le correctif retenu pour les créations (docs/bugs.md),
 * mais il ne convient pas ici : on clique ↑ et ↓ des dizaines de fois de suite,
 * et chaque rechargement remettrait la page en haut. Le réordonnancement est
 * aussi le seul geste dont on connaît le résultat SANS demander au serveur —
 * c'est nous qui venons de calculer l'ordre.
 *
 * ── La péremption, sans effet et sans nettoyage ──
 *
 * On retient l'ordre serveur qui prévalait au moment du clic. Tant qu'il n'a
 * pas bougé, on affiche le nôtre ; dès qu'il bouge, la correspondance échoue et
 * l'écrasement cesse de s'appliquer DE LUI-MÊME. Aucun `setState` dans un
 * effet, donc aucun état périmé à nettoyer. Même patron que `applied` dans
 * `progression-season-card.tsx`, dont la mesure (8 cas sur 25) a établi la
 * valeur.
 *
 * ── Pourquoi c'est ici et pas recopié dans les deux composants ──
 *
 * Il a été écrit deux fois avant d'être extrait, et deux copies d'une même
 * règle sont exactement la classe de défaut qui a coûté le plus cher à ce
 * projet. Ici la règle est unique, et surtout : elle devient TESTABLE. Le
 * projet n'a pas d'environnement de rendu React (`environment: "node"`), donc
 * une logique laissée dans un composant est une logique que personne ne peut
 * vérifier.
 */

export interface OrdreLocal {
  /** Ordre serveur au moment du clic — sert de date de péremption. */
  depuis: string;
  /** Ordre demandé, par identifiants. */
  vers: string[];
}

/** Signature d'un ordre : ce qu'on compare pour savoir si le serveur a bougé. */
export function cleOrdre(items: readonly { id: string }[]): string {
  return items.map((i) => i.id).join(",");
}

/**
 * L'ordre à AFFICHER : celui du serveur, sauf si un écrasement local est encore
 * valide.
 *
 * Trois cas rendent la liste serveur, et le troisième est une garde de sûreté :
 *  - aucun écrasement ;
 *  - le serveur a bougé depuis le clic (l'écrasement a péri) ;
 *  - l'écrasement ne recouvre pas exactement la liste serveur. Ce dernier ne
 *    devrait pas arriver — un ajout ou une suppression change la clé, donc fait
 *    déjà périmer — mais sans lui, un `vers` incomplet MASQUERAIT une ligne.
 *    Afficher un ordre discutable est un désagrément ; escamoter une étape de
 *    chasse ou une question de quiz est un défaut.
 */
export function ordreAffiche<T extends { id: string }>(
  serveur: readonly T[],
  local: OrdreLocal | null,
): T[] {
  if (!local || local.depuis !== cleOrdre(serveur)) return [...serveur];
  const parId = new Map(serveur.map((item) => [item.id, item]));
  const reordonne = local.vers
    .map((id) => parId.get(id))
    .filter((item): item is T => item !== undefined);
  return reordonne.length === serveur.length ? reordonne : [...serveur];
}
