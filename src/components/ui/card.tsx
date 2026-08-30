import { cn } from "@/lib/utils";

/**
 * LE SURLIGNAGE DE TITRE, écrit UNE fois.
 *
 * `Card` l'applique à ses `h2` par un sélecteur d'enfant, mais une dizaine
 * de titres vivent HORS d'une carte — écrans d'événement, télé des
 * pronostics, blocs d'éditeur. Ils recopiaient l'ancien trait de marqueur à
 * la main, et ils auraient divergé au premier ajustement : deux styles pour
 * la même chose, l'un jaune surligné et l'autre souligné.
 *
 * Ils importent donc cette constante. Elle est exportée depuis `Card` et non
 * depuis un module de style à part, parce que c'est la carte qui la définit :
 * ailleurs, c'est une citation.
 */
export const TITRE_SURLIGNE =
  "inline-block rounded-xl border-2 border-k-ink bg-k-yellow px-3 py-1 text-lg font-black leading-tight text-k-ink shadow-[2px_2px_0_var(--color-k-ink)] sm:text-xl";
import type { ComponentPropsWithRef } from "react";

/* Carte « Kermesse simple » : blanc, bordure encre 2px, petite ombre
   dure décalée — pas d'inclinaison dans le panel.

   Le titre est SURLIGNÉ EN JAUNE, comme la pastille du numéro qui le précède.
   Il portait un simple trait de marqueur sous le mot ; à côté d'une pastille
   jaune vif, le titre passait au second plan alors que c'est lui qui dit de
   quoi la case parle. Le rond et le titre lisent maintenant le même signal.

   ── POURQUOI PAS DU TEXTE JAUNE ──

   #fcca59 sur blanc plafonne à ~1,7:1 : c'est illisible, et deux fois moins
   que le minimum exigé. Le jaune reste donc un FOND et le texte reste encre —
   exactement le rapport de la pastille, qui n'a jamais eu de chiffre jaune.
   C'est la lecture fidèle de « le jaune des numéros », et la seule lisible.

   `inline-block` — et non `w-fit` — pour que le surlignage s'arrête au mot :
   un bloc `w-fit` resterait collé à gauche dans les cartes `text-center`
   (dashboard/error.tsx, dashboard/not-found.tsx, dashboard/progression), là
   où un inline-block suit l'alignement du texte.

   La bordure encre et l'ombre dure reprennent celles de la pastille : dans
   cette charte, un élément jaune sans contour flotte au lieu de se poser. */
/* `ComponentPropsWithRef` et non `HTMLAttributes` : la carte doit pouvoir
   RENDRE SON ÉLÉMENT. L'enregistrement automatique des blocs sans `<form>`
   (`useAutoSaveManuel`) écoute le conteneur du bloc — quand ce conteneur EST la
   carte, il lui faut une référence. En React 19, `ref` est une prop comme une
   autre : elle voyage dans le `...props` ci-dessous, sans `forwardRef`. */
export function Card({
  className,
  ...props
}: ComponentPropsWithRef<"div">) {
  return (
    <div
      className={cn(
        "rounded-2xl border-2 border-k-ink bg-white p-6 shadow-[4px_4px_0_rgba(33,29,22,0.9)]",
        // LE TITRE, SURLIGNÉ. `leading-tight` parce qu'un fond coloré rend
        // visible l'interligne par défaut, qui gonfle le bloc sans raison.
        "[&>h2]:inline-block [&>h2]:rounded-xl [&>h2]:border-2 [&>h2]:border-k-ink [&>h2]:bg-k-yellow [&>h2]:px-3 [&>h2]:py-1 [&>h2]:text-lg [&>h2]:font-black [&>h2]:leading-tight [&>h2]:text-k-ink [&>h2]:shadow-[2px_2px_0_var(--color-k-ink)] sm:[&>h2]:text-xl",
        className,
      )}
      {...props}
    />
  );
}
