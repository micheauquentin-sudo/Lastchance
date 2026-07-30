import type { ReactElement } from "react";

/**
 * Thème partagé des écrans /play — la SEULE source des classes qui
 * différencient les deux ambiances (« nuit » sombre / « kermesse »
 * crème + encre). L'aperçu de l'éditeur commerçant promet « exactement
 * ce que verront vos clients » : il lit ces jetons, il ne les recopie
 * jamais.
 */

/** Bandeau rayé jaune/encre — signature visuelle du site Lastchance. */
export function KermesseStripe({ className = "" }: { className?: string }): ReactElement {
  return (
    <div
      aria-hidden
      className={`w-full border-b-2 border-k-ink ${className}`}
      style={{
        background:
          "repeating-linear-gradient(45deg, var(--color-k-yellow) 0 12px, var(--color-k-ink) 12px 24px)",
      }}
    />
  );
}

/**
 * Contrastes texte communs aux écrans /play et à l'aperçu commerçant.
 *
 * LE BOOLÉEN A CHANGÉ DE SENS le 2026-07-30, et c'est le fond du correctif.
 * Il valait « le thème kermesse est déclaré » ; il vaut désormais « la surface
 * sous ce texte est CLAIRE » (`playOnLightSurface`). Le nom `kermesse` est
 * conservé parce qu'il circule comme prop dans une vingtaine de composants et
 * que le renommer en masse coûterait plus qu'il ne clarifierait — mais le seul
 * point de décision est cette fonction, plus les dix-sept comparaisons qu'elle
 * remplace.
 */
export const playText = {
  /** Nom du commerce, au-dessus de l'accroche. */
  kicker: (kermesse: boolean): string => (kermesse ? "text-k-body" : "text-white/60"),
  /** Titres (accroche, gain, perte, écrans d'état). */
  title: (kermesse: boolean): string => (kermesse ? "text-k-ink" : "text-white"),
  /** Corps de texte secondaire (descriptions, messages de statut). */
  body: (kermesse: boolean): string => (kermesse ? "text-k-body" : "text-zinc-300"),
  /**
   * Mentions discrètes : note de bas d'écran, pied « propulsé par », légendes.
   * Les deux valeurs recopiées jusqu'ici passaient sous le seuil AA de WCAG
   * 1.4.3 aux petites tailles où elles servent (11–12 px) : `text-zinc-500`
   * (#71717a) tombe à 4,21:1 sur le bout sombre du dégradé « nuit », et
   * `text-k-body/70` à 4,49:1 sur le crème — l'opacité est encore le moyen
   * qui fait reculer un texte au prix de sa lisibilité.
   *
   * `zinc-400` A ÉTÉ RETIRÉ DE LA BRANCHE SOMBRE le 2026-07-30, et la raison
   * vaut d'être retenue : il avait été validé à 8,9:1 « sur #0c0118 » — une
   * couleur qui n'est JAMAIS PEINTE. C'était le fond par défaut de `PlayShell`,
   * paramètre mort puisque la page passe toujours `surface.background`. Le
   * jeton était donc calibré contre une valeur imaginaire. Contre les fonds
   * réellement livrés il tombe à 3,82:1 (« Festif ») et 3,98:1 (« Minimal »),
   * sous le seuil. `zinc-300` (#d4d4d8) rend 6,78 et 7,07 tout en restant
   * nettement en retrait du blanc : 14,2:1 contre 21:1 sur le noir.
   *
   * `k-muted` A ÉTÉ RETIRÉ DE LA BRANCHE CLAIRE le même jour — il était
   * calibré pour LE CRÈME (#fdf6e3) et pour lui seul. Depuis que la branche
   * claire couvre aussi les dégradés clairs du commerçant, il n'y tient plus :
   * 3,09:1 sur le rose de « Pastel », 2,72:1 sur l'ambre de « Cartoon » — un
   * fond de demi-teinte est hostile au texte clair COMME au gris clair.
   * `k-body` passe partout (5,42:1 et 6,15:1 au pire) et reste secondaire face
   * à `k-ink`.
   *
   * Le prix est assumé et visible : sur la page crème, les mentions discrètes
   * passent de #6b6459 à #3d382f. Elles reculent un peu moins. C'est le seul
   * changement d'apparence de ce correctif, et il va dans le sens de la
   * lisibilité — le contraste y monte de 5,4:1 à ~9:1.
   */
  muted: (kermesse: boolean): string => (kermesse ? "text-k-body" : "text-zinc-300"),
} as const;

/**
 * Habillage du bouton de validation d'un défi *skill-gated* (jauge,
 * estimation, mot mystère, puzzle) — la seule source de ces classes, qui
 * étaient recopiées à l'identique dans les quatre composants.
 *
 * VERROUILLÉ (défi soumis) : on atténue le CHROME — bordure, ombre dure,
 * fond — et JAMAIS par `opacity`. Un `opacity-60` s'applique aussi au
 * libellé : sur le crème `k-bg`, l'encre atténuée de la sorte retombe à
 * 3,45:1, sous le seuil AA de WCAG 1.4.3. Le jeton `k-muted` obtient le
 * même effet de recul en gardant 5,4:1.
 */
export function challengeButtonTone(kermesse: boolean, locked: boolean): string {
  if (kermesse) {
    return locked
      ? "border-k-ink/40 bg-white text-k-muted focus-visible:ring-k-ink/40"
      : "border-k-ink bg-white text-k-ink shadow-[4px_4px_0_var(--color-k-ink)] focus-visible:ring-k-ink/40 active:translate-x-[2px] active:translate-y-[2px] active:shadow-[1px_1px_0_var(--color-k-ink)]";
  }
  return locked
    ? "border-white/25 bg-white/5 text-white/75 focus-visible:ring-white/50"
    : "border-white/40 bg-white/10 text-white focus-visible:ring-white/50 hover:border-white/70";
}

/** Habillage kermesse du bouton « Lancer la roue » : bordure encre,
 *  ombre dure, enfoncement au clic — identique page et aperçu. */
export const SPIN_BUTTON_KERMESSE =
  "border-2 border-k-ink text-k-ink shadow-[6px_6px_0_var(--color-k-ink)] active:translate-x-[2px] active:translate-y-[2px] active:shadow-[2px_2px_0_var(--color-k-ink)]";
