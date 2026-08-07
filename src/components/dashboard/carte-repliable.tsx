"use client";

import { useState } from "react";

/**
 * UN BLOC DE LA PAGE DÉTAIL, REPLIABLE — SANS TOUCHER À SON CONTENU.
 *
 * La page d'un jeu instantané empile dix blocs pleine largeur : le commerçant
 * qui vient régler une seule chose scrolle à travers tout le reste. Ce
 * composant ENVELOPPE un bloc existant (sa `<Card>`, son `<h2>`) et lui ajoute
 * un bouton de repli. Le bloc enveloppé n'est PAS modifié : il ne sait pas
 * qu'il est repliable.
 *
 * ── TROIS CONTRAINTES QUI ONT DICTÉ LA FORME ──
 *
 * 1. **Ouvert par défaut.** Les E2E cliquent dans ces blocs sans les déplier
 *    (`e2e/referral.spec.ts` : heading « Parrainage ludique » visible puis
 *    « Enregistrer »), et les ancres `#suivi` / `#reglages` doivent mener à du
 *    contenu VISIBLE — une ancre qui saute sur une barre fermée ne raconte rien.
 * 2. **Pas de `<details>`/`<summary>`.** Chromium retire le rôle `heading` aux
 *    descendants d'un `<summary>` : les `getByRole("heading", …)` des E2E
 *    tomberaient sur des blocs pourtant affichés. D'où un bouton
 *    `aria-expanded` explicite.
 * 3. **Le titre replié est un `<span>`, jamais un `<h2>`.** Le bloc enveloppé
 *    porte déjà son `<h2>` du même nom ; deux headings identiques feraient
 *    échouer les locators par nom accessible dès que le bloc est ouvert.
 *
 * L'état n'est pas persisté : replier puis naviguer rouvre tout. C'est déjà le
 * comportement des `<details>` du produit, assumé plutôt que contourné par un
 * stockage local que rien ne viendrait purger.
 */
export function CarteRepliable({
  titre,
  id,
  children,
  defaultOuvert = true,
}: {
  /** Nom du bloc — repris dans la barre repliée et dans les libellés d'aide. */
  titre: string;
  /** Ancre de la page (`suivi`, `reglages`…) : portée dans les DEUX états. */
  id?: string;
  children: React.ReactNode;
  defaultOuvert?: boolean;
}) {
  const [ouvert, setOuvert] = useState(defaultOuvert);

  if (!ouvert) {
    return (
      <div id={id} className="scroll-mt-24">
        <button
          type="button"
          aria-expanded={false}
          aria-label={`Développer « ${titre} »`}
          onClick={() => setOuvert(true)}
          className="flex w-full items-center justify-between gap-3 rounded-2xl border-2 border-k-ink bg-white px-6 py-3 text-left shadow-[4px_4px_0_rgba(33,29,22,0.9)] transition-colors hover:bg-k-bg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-k-ink focus-visible:ring-offset-2"
        >
          <span className="truncate font-black text-k-ink">{titre}</span>
          <span aria-hidden className="shrink-0 text-lg font-black text-k-ink">
            +
          </span>
        </button>
      </div>
    );
  }

  return (
    <div id={id} className="relative scroll-mt-24">
      {children}
      {/* Posé DANS la marge `p-6` de la carte, contre son bord haut-droit :
          les blocs enveloppés y placent leur titre à gauche, jamais un bouton
          à droite. */}
      <button
        type="button"
        aria-expanded
        aria-label={`Réduire « ${titre} »`}
        onClick={() => setOuvert(false)}
        className="absolute right-3 top-3 z-10 flex h-8 w-8 items-center justify-center rounded-full border-2 border-k-ink bg-white text-lg font-black leading-none text-k-ink transition-colors hover:bg-k-yellow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-k-ink focus-visible:ring-offset-2"
      >
        <span aria-hidden>−</span>
      </button>
    </div>
  );
}
