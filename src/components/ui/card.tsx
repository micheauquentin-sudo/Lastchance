import { cn } from "@/lib/utils";
import type { ComponentPropsWithRef } from "react";

/* Carte « Kermesse simple » : blanc, bordure encre 2px, petite ombre
   dure décalée — pas d'inclinaison dans le panel.

   Le titre porte un TRAIT DE MARQUEUR JAUNE : le gras seul ne suffisait pas à
   le détacher du corps de texte. Le trait est décoratif (le texte reste encre,
   aucun enjeu de contraste). `inline-block` — et non `w-fit` — pour que le
   trait s'arrête au mot : un bloc `w-fit` resterait collé à gauche dans les
   cartes `text-center` (dashboard/error.tsx, dashboard/not-found.tsx,
   dashboard/progression), là où un inline-block suit l'alignement du texte. */
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
        "rounded-2xl border-2 border-k-ink bg-white p-6 shadow-[4px_4px_0_rgba(33,29,22,0.9)] [&>h2]:inline-block [&>h2]:border-b-4 [&>h2]:border-k-yellow [&>h2]:pb-0.5 [&>h2]:text-lg [&>h2]:font-black",
        className,
      )}
      {...props}
    />
  );
}
