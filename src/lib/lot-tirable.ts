/**
 * ── UN LOT EST-IL TIRABLE ? UNE SEULE RÉPONSE, POUR L'ÉCRAN ET POUR LE SERVEUR ──
 *
 * Ces deux prédicats vivaient dans `src/components/dashboard/
 * atelier-verification-state.ts`, module-privés, sous un en-tête qui interdit
 * explicitement de les recopier (« DEUX PRÉDICATS QU'ON NE RECOPIE PAS ») : le
 * dashboard et /play avaient déjà divergé une fois sur cette question.
 *
 * Ils sont DÉPLACÉS ici, pas dupliqués, parce qu'une action serveur en a
 * désormais besoin (`updateCampaign`, `deletePrize`) et qu'une action serveur
 * n'importe pas un module de composant. L'atelier les importe depuis ce
 * fichier ; il n'en existe toujours qu'une définition.
 *
 * ── MIROIR DE `perform_atomic_spin` ──
 *
 * `p.is_active and p.weight > 0 and (p.is_losing or p.stock is null or
 * p.stock > 0)` — 20260927120000:256-257 et :275. Compter un lot épuisé dans
 * le total affichait des probabilités fausses ; l'exclure d'un refus de
 * publication laisserait ouvrir une roue que le tirage ne peut pas servir.
 *
 * ── CE QUE CE MODULE NE FAIT PAS ──
 *
 * Il ne lit rien, ne décide d'aucun droit et ne connaît pas le statut de la
 * campagne. Il répond à « ce lot peut-il sortir ? » et « cette roue a-t-elle de
 * quoi jouer ? », rien de plus : qui a le droit de publier reste la question de
 * `assert_module_publish_allowed` et des gardes d'accès des actions.
 */

/** Les quatre colonnes de `prizes` dont dépend la tirabilité, et elles seules. */
export interface LotTirable {
  is_active: boolean;
  is_losing: boolean;
  weight: number;
  stock: number | null;
}

/** Ce lot peut-il sortir du tirage aujourd'hui ? (gagnant ou perdant) */
export function estTirable(p: LotTirable): boolean {
  return p.is_active && (p.is_losing || p.stock === null || p.stock > 0);
}

/** Ce lot ferait-il GAGNER quelque chose à un client ? */
export function estGagnantTirable(p: LotTirable): boolean {
  return estTirable(p) && !p.is_losing && p.weight > 0;
}

/**
 * Phrase EXACTE du contrôle `lot-gagnant` de l'atelier
 * (`atelier-verification-state.ts`, contrôle « Au moins un lot peut être
 * gagné »). L'écran la promet bloquante (`checklist/controles.ts`, `roue.
 * "lot-gagnant": true`) : le serveur doit refuser avec LA MÊME phrase, sinon
 * l'écran annonce un refus qui n'existe pas — ou en annonce un autre.
 */
export const AUCUN_LOT_GAGNANT_TIRABLE =
  "Aucun lot gagnant n'est tirable : ils sont désactivés, à poids nul ou en " +
  "rupture de stock. Vos clients repartiraient tous bredouilles.";

/** Phrase EXACTE du contrôle `poids` (« Les chances de gain tiennent debout »). */
export const POIDS_TOTAL_NUL =
  "Le poids total est nul : aucun lot ne peut sortir, le tirage n'a rien à " +
  "distribuer.";

/**
 * Cette roue peut-elle s'ouvrir aux joueurs ? Message de refus sinon
 * (`null` = OK). Miroir des deux contrôles BLOQUANTS de la checklist de lots.
 *
 * ── POURQUOI LE POIDS EST TESTÉ EN PREMIER ──
 *
 * Les deux conditions ne sont pas indépendantes : `estGagnantTirable` exige
 * `weight > 0`, donc un seul lot gagnant tirable suffit à rendre le poids total
 * strictement positif. « Poids nul » IMPLIQUE donc « aucun lot gagnant
 * tirable » — les deux contrôles rougissent ensemble, jamais le second seul.
 *
 * L'ordre décide donc seulement de la phrase RENDUE, et la plus précise des
 * deux gagne : « poids nul » dit qu'absolument rien ne peut sortir, pas même le
 * segment perdant, ce qui est un autre réglage à corriger que « les perdants
 * sortent, les gagnants non ». Inverser l'ordre rendrait la phrase « poids
 * nul » inatteignable, et l'écran promettrait un refus que personne ne lit
 * jamais.
 */
export function blocageOuvertureRoue(
  prizes: readonly LotTirable[],
): string | null {
  const poidsTotal = prizes
    .filter(estTirable)
    .reduce((somme, p) => somme + p.weight, 0);
  if (poidsTotal <= 0) return POIDS_TOTAL_NUL;
  if (!prizes.some(estGagnantTirable)) return AUCUN_LOT_GAGNANT_TIRABLE;
  return null;
}
