import type { WheelStyle } from "@/lib/wheel-style";

/**
 * L'habillage de la « roue offerte » — un seul exemplaire, et sans zod.
 *
 * ── CE QU'IL REMPLACE ───────────────────────────────────────────────
 *
 * Le même objet vivait en QUATRE copies identiques, une par module qui offre
 * un tour de roue : `calendar-spin-experience`, `loyalty-spin-experience`,
 * `quiz-spin-experience`, `referral-spin-experience`. Quatre copies d'une
 * décision visuelle unique — changer le pointeur en orange demandait quatre
 * modifications, et trois suffisaient à faire diverger les modules.
 *
 * ── POURQUOI UN STYLE COMPLET ET NON UN `Partial` ───────────────────
 *
 * `WheelSvg` exige désormais un style RÉSOLU (voir la prop `style` de
 * `wheel-svg.tsx`). La voie évidente — garder le `Partial` et le passer à
 * `resolveWheelStyle` — est écartée : cette fonction est un `safeParse` zod,
 * et l'appeler ici remettrait zod et le schéma complet de la roue dans le lot
 * de départ de /calendar, /passeport, /quiz et /play, exactement ce que la
 * prop obligatoire vient d'en retirer. Ces quatre écrans ne lisent aucun style
 * de commerçant : leur habillage est une constante du produit, il n'y a rien à
 * valider à l'exécution.
 *
 * Le prix de ce choix est que les valeurs par défaut du schéma sont recopiées
 * ici. `spin-wheel-style.test.ts` les compare à `resolveWheelStyle` et rougit à
 * la première divergence — la copie est gardée mécaniquement, pas par vigilance.
 */
export const SPIN_WHEEL_STYLE: WheelStyle = {
  // ── Les six choix propres à la roue offerte ──
  // Lisible sur fond crème : anneau + moyeu encre, pointeur orange.
  // Les couleurs des segments viennent des lots (prizes) eux-mêmes.
  ring: "gold",
  ringColor: "#211d16",
  hub: "disc",
  hubColor: "#211d16",
  pointerColor: "#f5793b",
  labelColor: "auto",

  // ── Le reste : les défauts du schéma, prouvés identiques par le test ──
  pageTheme: "nuit",
  lights: true,
  lightColorA: "#ffffff",
  lightColorB: "#ffd34d",
  segmentBorderColor: "#000000",
  segmentBorderWidth: 2,
  labelOutline: true,
  pointer: "triangle",
  font: "sans",
  bgFrom: "#2e1065",
  bgTo: "#000000",
  buttonFrom: "#7c3aed",
  buttonTo: "#d946ef",
  cartoonAnimations: false,
  fond: undefined,
  games: undefined,
};
