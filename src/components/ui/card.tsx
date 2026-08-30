import { cn } from "@/lib/utils";

/**
 * LE STYLE DE TITRE DE CARTE, écrit UNE fois.
 *
 * `Card` l'applique à ses `h2` par un sélecteur d'enfant, mais une dizaine
 * de titres vivent HORS d'une carte — écrans d'événement, télé des
 * pronostics, blocs d'éditeur. Ils recopiaient l'ancien trait de marqueur à
 * la main, et ils auraient divergé au premier ajustement : deux styles pour
 * la même chose, l'un souligné et l'autre non.
 *
 * Ils importent donc cette constante. Elle est exportée depuis `Card` et non
 * depuis un module de style à part, parce que c'est la carte qui la définit :
 * ailleurs, c'est une citation.
 */
export const TITRE_CARTE =
  "w-fit border-b-4 border-k-yellow pb-0.5 text-lg font-black";
import type { ComponentPropsWithRef } from "react";

/* Carte « Kermesse simple » : blanc, bordure encre 2px, petite ombre
   dure décalée — pas d'inclinaison dans le panel.

   Le titre porte un TRAIT DE MARQUEUR JAUNE : le gras seul ne suffisait pas à
   le détacher du corps de texte. Le trait est décoratif (le texte reste encre,
   aucun enjeu de contraste).

   ── IL A ÉTÉ SURLIGNÉ EN PLEIN, ET C'ÉTAIT TROP ──

   Un bloc jaune bordé et ombré, repris de la pastille du numéro. Vu une
   fois, c'était juste ; vu sept fois sur la même page, c'était un mur. Le
   propriétaire l'a tranché à l'écran, ce qu'aucun raisonnement ne pouvait
   faire à sa place : la répétition change la valeur d'un signal fort.

   `inline-block` — et non `w-fit` — pour que le trait s'arrête au mot : un
   bloc `w-fit` resterait collé à gauche dans les cartes `text-center`
   (dashboard/error.tsx, dashboard/not-found.tsx, dashboard/progression), là
   où un inline-block suit l'alignement du texte. */
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
        "[&>h2]:inline-block [&>h2]:border-b-4 [&>h2]:border-k-yellow [&>h2]:pb-0.5 [&>h2]:text-lg [&>h2]:font-black",
        className,
      )}
      {...props}
    />
  );
}
