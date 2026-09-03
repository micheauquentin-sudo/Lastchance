"use client";

import type { CSSProperties, ReactNode } from "react";

/**
 * LA COLONNE D'APERÇU D'UN STUDIO (VIT-36, généralisée VIT-38).
 *
 * ── LE CADRE NE S'ÉLARGIT PAS POUR FAIRE PLAISIR ──
 *
 * `max-w-[480px]` n'est pas une largeur choisie ici pour l'esthétique : c'est
 * la borne de la page publique de la vitrine. Un cadre plus large rendrait des
 * blocs que PERSONNE ne verra — le texte se couperait ailleurs, une grille
 * passerait de deux à trois colonnes — et le commerçant validerait une mise en
 * page qui n'existe pas.
 *
 * C'est le seul défaut qu'un aperçu ne doit jamais avoir, parce qu'il est
 * INVISIBLE : rien ne casse, tout a l'air de fonctionner, et l'écart ne se
 * découvre qu'en ouvrant la vraie page. La lisibilité se gagne en
 * rééquilibrant la rangée du studio (`CoquilleStudio`), jamais en étirant le
 * cadre. Un module dont la page publique est plus large passe `classeCadre` —
 * et la garde qui compare les deux vit à côté de ce module, pas ici.
 *
 * ── LA LÉGENDE DIT CE QUI SE PASSE VRAIMENT ──
 *
 * Elle a dit pendant deux lots « Rien n'est enregistré tant que vous n'avez pas
 * cliqué sur Enregistrer », alors que le studio enregistrait tout seul depuis
 * VIT-30. C'est le défaut d'ADR-153 pris par l'autre bout : un écran qui
 * raconte le contraire de ce qu'il fait. Le défaut de cette légende décrit
 * donc l'automatisme, et un module qui n'enregistrerait pas seul doit le dire.
 */
export function CadreApercu({
  legende = "Aperçu — ce que verront vos clients. Vos modifications s'enregistrent toutes seules.",
  banniere,
  classeCadre = "w-full max-w-[480px]",
  style,
  children,
}: {
  legende?: string;
  /** Un avertissement posé DANS la colonne, au-dessus du cadre. */
  banniere?: ReactNode;
  /** La largeur fidèle de la page publique du module. Doit rester littérale :
   *  Tailwind ne compile pas une valeur arbitraire construite à l'exécution. */
  classeCadre?: string;
  /** Les variables CSS du thème du module, posées sur le cadre. */
  style?: CSSProperties;
  children: ReactNode;
}) {
  return (
    <div className="flex min-h-0 w-full shrink-0 flex-col items-center gap-2 overflow-y-auto lg:w-[544px]">
      <p className="text-xs font-semibold text-zinc-500">{legende}</p>
      {banniere}
      <div
        style={style}
        className={`${classeCadre} shrink-0 overflow-hidden rounded-2xl border-2 border-k-ink shadow-[8px_8px_0_rgba(33,29,22,0.9)]`}
      >
        {children}
      </div>
    </div>
  );
}
