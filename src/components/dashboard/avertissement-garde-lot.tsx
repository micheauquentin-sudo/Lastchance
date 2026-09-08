import {
  PHRASES_GARDE_LOT,
  type NiveauGardeLot,
} from "@/lib/lot-forte-valeur";

/**
 * L'AVERTISSEMENT « LOT DE FORTE VALEUR MAL GARDÉ », rendu une seule fois.
 *
 * Deux écrans du tableau de bord posent la même question — l'éditeur de lots,
 * où la valeur se saisit, et l'étape « Le jeu », où la limite de participation
 * se choisit. Le VERDICT vient de `src/lib/lot-forte-valeur.ts` (module pur,
 * seuil unique, phrases uniques) ; ce composant n'est que sa mise en page, et
 * il ne décide de rien.
 *
 * ── IL AVERTIT, IL NE BLOQUE PAS ──
 *
 * Aucun bouton n'est désactivé, aucune soumission n'est empêchée : des
 * campagnes tournent aujourd'hui chez des commerçants qui n'ont jamais vu
 * cette règle, et un blocage rétroactif les casserait sans préavis. Le
 * commerçant reste seul juge de son économie.
 *
 * ── LE PIÈGE DE CONTRASTE, NOMMÉ ──
 *
 * Un avertissement est un PETIT LIBELLÉ COLORÉ, c'est-à-dire exactement le cas
 * que `src/app/globals.css:43-49` documente : l'orange décoratif `k-orange`
 * (#f5793b) tombe à 2,73:1 et fait rougir la garde axe `color-contrast` de
 * `e2e/a11y.spec.ts`. On utilise donc `k-orange-text` (#b45309 — 5,02:1 sur
 * blanc, 4,66:1 sur le crème `k-bg`), et l'orange décoratif ne sert qu'à la
 * bordure, où aucun texte ne se lit.
 */
export function AvertissementGardeLot({
  niveau,
  lots,
  id,
  className = "",
}: {
  niveau: NiveauGardeLot;
  /**
   * Cible d'`aria-describedby` depuis le champ qui déclenche l'avertissement :
   * le texte est ainsi ANNONCÉ au lecteur d'écran quand le curseur revient
   * dans le champ, au lieu de n'exister que pour l'œil, plus bas dans la
   * carte. Pas de copie masquée : un seul texte, décrit une seule fois.
   */
  id?: string;
  /**
   * Les lots concernés, quand l'écran en connaît PLUSIEURS (l'étape « Le
   * jeu »). L'éditeur de lots n'en traite qu'un à la fois : la ligne parle
   * d'elle-même, la liste serait un doublon de son propre champ « Nom du lot ».
   */
  lots?: string[];
  className?: string;
}) {
  if (niveau === "aucun") return null;
  return (
    <p
      id={id}
      role="note"
      className={`rounded-xl border-2 border-k-orange/50 bg-k-bg px-3 py-2 text-xs font-semibold leading-5 text-k-orange-text ${className}`}
    >
      {lots && lots.length > 0 && (
        <span className="block font-black">
          {lots.length > 1 ? "Lots concernés" : "Lot concerné"} :{" "}
          {lots.join(", ")}
        </span>
      )}
      {PHRASES_GARDE_LOT[niveau]}
    </p>
  );
}
