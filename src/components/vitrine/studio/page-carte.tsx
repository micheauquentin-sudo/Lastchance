"use client";

import Link from "next/link";

/**
 * LA PAGE « LA CARTE » DU STUDIO — coquille (VIT-20), remplie par VIT-23.
 *
 * L'éditeur complet — cartes, rubriques, fiches, prix, photos — et l'import
 * viendront ici, avec l'aperçu qui suit à droite. En attendant, cette page
 * MÈNE à l'éditeur existant plutôt que de faire semblant : un onglet qui
 * s'ouvre sur un écran vide se lit comme une panne, là où un renvoi explicite
 * se lit comme un chemin.
 */
export function PageCarteStudio({ nbCartes }: { nbCartes: number }) {
  return (
    <div className="space-y-3">
      <h2 className="text-sm font-black uppercase tracking-[0.14em] text-k-orange-text">
        Votre carte
      </h2>
      <p className="text-sm text-k-body">
        {nbCartes > 0
          ? `${nbCartes} carte${nbCartes > 1 ? "s" : ""} composée${nbCartes > 1 ? "s" : ""}. L'aperçu au centre les montre telles que vos clients les liront.`
          : "Aucune carte pour l'instant. L'aperçu au centre reste vide tant que vous n'avez pas composé la première."}
      </p>
      <Link
        href="/dashboard/vitrine?etape=carte"
        className="inline-block rounded-xl border-2 border-k-ink bg-white px-3 py-2 text-sm font-black text-k-ink hover:bg-k-yellow"
      >
        Composer ma carte
      </Link>
    </div>
  );
}
