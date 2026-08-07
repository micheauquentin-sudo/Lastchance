import type { GameType } from "@/types/database";

/**
 * CE QUE L'ÉTAPE « HABILLAGE » A LE DROIT DE MONTRER — ET POURQUOI ELLE MENTAIT.
 *
 * L'éditeur de style expose une vingtaine de réglages et un aperçu de roue.
 * Or `game-shell.tsx` — l'écran que reçoit le joueur sur les quatorze
 * mécaniques qui ne sont PAS la roue — ne consomme du style que cinq choses :
 * `pageTheme` (l'ambiance de la page), `font`, `title` (l'accroche) et le
 * dégradé `buttonFrom → buttonTo` du bouton. Anneau, ampoules, bordure des
 * segments, couleur du texte des lots, centre et pointeur ne sont JAMAIS
 * rendus : ils n'existent que dans le SVG de la roue.
 *
 * Le commerçant qui choisissait « Bonneteau » réglait donc douze contrôles
 * sans effet, en se fiant à un aperçu de roue que son client ne verrait
 * jamais. Ce n'était pas un bug d'affichage : c'était un écran qui affirmait
 * quelque chose de faux sur le produit livré.
 *
 * Cette fonction est PURE et testée à part parce que c'est la seule règle
 * réellement décidable ici : le reste de l'éditeur n'est que du rendu.
 *
 * ── Ce qu'elle NE décide PAS ──
 *
 * Elle ne réduit jamais l'objet `style` ENVOYÉ. Le champ caché continue de
 * porter le style COMPLET : `wheelStyleSchema` revalide les vingt champs, les
 * presets en produisent vingt (propriété tenue par wheel-style.test.ts), et
 * masquer un contrôle ne doit pas effacer la valeur qu'il portait — un
 * commerçant qui essaie « Memory » puis revient à « Roue » retrouve son
 * pointeur et ses ampoules intacts.
 */
export interface HabillagePortee {
  /** Les réglages qui n'existent que sur le SVG de la roue sont-ils exposés ? */
  reglagesRoue: boolean;
  /** L'aperçu dessine-t-il la roue, ou l'écran neutre du joueur ? */
  apercuRoue: boolean;
  /** Le verbe du faux bouton de l'aperçu, tel que le joueur le lira. */
  libelleBouton: string;
  /** Pourquoi la liste est plus courte — null quand elle est complète. */
  note: string | null;
}

const PORTEE_ROUE: HabillagePortee = {
  reglagesRoue: true,
  apercuRoue: true,
  libelleBouton: "Lancer la roue",
  note: null,
};

const PORTEE_AUTRES: HabillagePortee = {
  reglagesRoue: false,
  apercuRoue: false,
  libelleBouton: "Jouer",
  note:
    "Ce jeu n'affiche pas de roue — voici ce que vos clients verront. Anneau, ampoules, segments, centre et pointeur n'appartiennent qu'à la roue : ils restent enregistrés, mais les régler ici ne changerait rien à l'écran du joueur.",
};

/**
 * `undefined` rend la portée complète : c'est le comportement historique de
 * l'éditeur, conservé pour tout appelant qui ne connaît pas la mécanique.
 */
export function porteeHabillage(gameType?: GameType | null): HabillagePortee {
  if (gameType === undefined || gameType === null) return PORTEE_ROUE;
  return gameType === "wheel" ? PORTEE_ROUE : PORTEE_AUTRES;
}
