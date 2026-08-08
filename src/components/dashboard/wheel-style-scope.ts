import { gameIdle } from "@/lib/game-idle";
import { GAME_OBJECT_KEYS, type GameObjectKey } from "@/lib/wheel-style";
import type { GameType } from "@/types/database";

/**
 * CE QUE L'ÉTAPE « HABILLAGE » MONTRE — ET POURQUOI ELLE MENTAIT DEUX FOIS.
 *
 * ── Premier mensonge, fermé en V1.4x : les réglages ──
 *
 * L'éditeur exposait une vingtaine de réglages dont douze n'existent que dans
 * le SVG de la roue (anneau, ampoules, bordure des segments, texte des lots,
 * centre, pointeur). Le commerçant qui choisissait « Bonneteau » les réglait
 * sans le moindre effet sur l'écran de son client. `reglagesRoue` les réserve
 * à la roue.
 *
 * ── Second mensonge, fermé ici : l'APERÇU ──
 *
 * Sous cet aveu restait un aperçu qui dessinait, pour les quatorze autres
 * mécaniques, un cadre pointillé avec un 🎁 EN DUR et un bouton « Jouer ». Le
 * même carton pour un dé, un memory et une machine à sous — alors que la
 * phrase juste au-dessus promet « exactement ce que verront vos clients ».
 * Une roue affichée à tort est un mensonge visible ; un carton générique est
 * un mensonge qui a l'air d'un aperçu.
 *
 * La question n'est donc plus « roue ou pas », mais **QUEL ÉCRAN D'ACCUEIL** :
 * l'aperçu monte désormais le composant `GameIdleScreen` que le joueur reçoit
 * réellement, avec l'emoji, le verbe et l'accroche de sa mécanique
 * (`gameIdle`, source unique) — vraies couleurs, vraie police, vraie ambiance.
 * `apercuRoue` ne sert plus qu'à savoir s'il faut poser le SVG de la roue
 * À LA PLACE du cadre d'accueil.
 *
 * ── Ce qu'elle NE décide toujours PAS ──
 *
 * Elle ne réduit jamais l'objet `style` ENVOYÉ. Le champ caché continue de
 * porter le style COMPLET, y compris le sous-objet `games` d'une mécanique
 * qui n'est plus la mécanique courante : masquer un contrôle ne doit pas
 * effacer la valeur qu'il portait — un commerçant qui essaie « Memory » puis
 * revient à « Roue » retrouve son pointeur, ses ampoules ET la couleur de dos
 * qu'il avait choisie.
 */
export interface HabillagePortee {
  /** Les réglages qui n'existent que sur le SVG de la roue sont-ils exposés ? */
  reglagesRoue: boolean;
  /** L'aperçu dessine-t-il la roue, ou l'écran d'accueil du joueur ? */
  apercuRoue: boolean;
  /** Le verbe du bouton de l'aperçu, tel que le joueur le lira. */
  libelleBouton: string;
  /** L'emoji du visuel d'accueil, tel que le joueur le verra. */
  emoji: string;
  /** L'accroche par défaut, écrasée dès que le commerçant en écrit une. */
  accroche: string;
  /**
   * La mécanique a-t-elle un réglage qui lui est propre (section « Ce jeu ») ?
   * `null` quand elle n'en a pas — les six jeux de défi et la roue.
   */
  reglagesDuJeu: MecaniqueReglable | null;
  /** Pourquoi la liste est plus courte — null quand elle est complète. */
  note: string | null;
}

/**
 * Les huit mécaniques dont un élément visuel est personnalisable : la couche
 * à gratter, le jeu de symboles des rouleaux, et les six objets colorables.
 */
export type MecaniqueReglable = "scratch" | "slot" | GameObjectKey;

const REGLABLES = new Set<string>(["scratch", "slot", ...GAME_OBJECT_KEYS]);

function reglagesDuJeu(gameType: GameType): MecaniqueReglable | null {
  return REGLABLES.has(gameType) ? (gameType as MecaniqueReglable) : null;
}

/**
 * `undefined` rend la portée de la roue : c'est le comportement historique de
 * l'éditeur, conservé pour tout appelant qui ne connaît pas la mécanique.
 */
export function porteeHabillage(gameType?: GameType | null): HabillagePortee {
  const jeu: GameType = gameType ?? "wheel";
  const idle = gameIdle(jeu);
  const roue = jeu === "wheel";
  return {
    reglagesRoue: roue,
    apercuRoue: roue,
    libelleBouton: idle.buttonLabel,
    emoji: idle.emoji,
    accroche: idle.accroche,
    reglagesDuJeu: reglagesDuJeu(jeu),
    note: roue
      ? null
      : "Ce jeu n'affiche pas de roue — l'aperçu ci-dessus est l'écran d'accueil que verront vos clients. Anneau, ampoules, segments, centre et pointeur n'appartiennent qu'à la roue : ils restent enregistrés, mais les régler ici ne changerait rien à l'écran du joueur.",
  };
}
