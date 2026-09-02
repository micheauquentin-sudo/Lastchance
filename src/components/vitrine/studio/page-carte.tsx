"use client";

import { useState } from "react";
import { CatalogueEditeur } from "@/components/vitrine/catalogue-editeur";
import { ImportCarte } from "@/components/vitrine/import-carte";
import { ResumeCarteStudio } from "@/components/vitrine/studio/carte-resume";
import type { VitrineCarteView } from "@/lib/vitrine";

/**
 * LA PAGE « LA CARTE » DU STUDIO (VIT-20 → VIT-23).
 *
 * ── TOUT EST ICI, ET C'EST LE CHOIX DU PROPRIÉTAIRE ──
 *
 * La coquille de VIT-20 renvoyait vers l'atelier. Un renvoi valait mieux qu'un
 * écran vide, mais il coûtait ce que le studio existe pour donner : composer sa
 * carte EN VOYANT la page que ses clients liront. Aller la saisir ailleurs,
 * c'est retrouver l'atelier — et l'aperçu ne sert plus à rien.
 *
 * ── LES DEUX COMPOSANTS SONT MONTÉS, PAS RÉÉCRITS ──
 *
 * `CatalogueEditeur` et `ImportCarte` portent déjà tout : les trois niveaux,
 * les prix, les photos, les allergènes, la relecture ligne à ligne de l'import.
 * En écrire une version « compacte » aurait donné deux éditeurs à tenir
 * d'accord, appelant les mêmes actions, divergeant au premier ajustement — la
 * classe de dette exacte que ce dépôt paie ailleurs. Ils sont donc montés tels
 * quels ; l'atelier `/dashboard/vitrine?etape=carte` les monte encore, et c'est
 * le MÊME arbre.
 *
 * ── LA LARGEUR : MONTÉS TELS QUELS, ET C'EST VÉRIFIÉ, PAS SUPPOSÉ ──
 *
 * La colonne fait 340 px (≈ 304 px de contenu), l'éditeur avait été dessiné
 * pour la pleine largeur de l'atelier. Il s'y replie, parce qu'il n'a AUCUNE
 * largeur plancher : chaque rangée est un `flex flex-wrap` dont les champs sont
 * `min-w-0 flex-1`, chaque `Input`/`textarea` est `w-full`, les boutons
 * n'interdisent pas le retour à la ligne, et les seules largeurs fixes
 * (`w-28` du prix d'import, `max-w-40`, `max-w-sm`) sont des PLAFONDS, jamais
 * des minimums. L'ombre dure des cartes (4 px) tient dans le `p-4` de la
 * colonne, donc rien ne déborde horizontalement.
 *
 * Ce qui reste vrai, et qui est dit plutôt que caché : l'imbrication
 * carte → rubrique → fiche empile trois niveaux de gouttière et laisse ≈ 195 px
 * au formulaire d'une fiche dépliée. C'est utilisable — tout y est lisible et
 * atteignable au clavier — mais c'est étroit. La vraie réponse serait de passer
 * CETTE page à deux colonnes, ce qui demande de toucher `vitrine-studio.tsx`,
 * hors du lot. Écrit ici pour que ce soit une décision et non un oubli.
 *
 * ── AUCUNE COURSE AVEC LES RÉGLAGES EN COURS D'ESSAI ──
 *
 * Le studio tient `ordre_blocs`, `style_cartes`, l'allure et l'identité dans un
 * état CLIENT qu'il repostera au prochain « Enregistrer ». Une action montée
 * ici qui écrirait la colonne `theme` de `vitrine_settings` entrerait en course
 * avec lui : la base gagnerait, puis le clic suivant l'écraserait. Vérifié —
 * les actions de ces deux composants (`createVitrineCarte`,
 * `updateVitrineCarte`, `deleteVitrineCarte`, les trois de rubrique, les
 * quatre de fiche, les trois `reorder`, et `importVitrineCarte` via la RPC
 * `import_vitrine_carte`) n'écrivent QUE `vitrine_menus`, `vitrine_categories`,
 * `vitrine_items` et `audit_logs`. Aucune ne lit ni n'écrit `theme` : les
 * quatre seules qui y touchent sont `saveVitrineSettings`,
 * `activerExperiencesVitrine`, `resetVitrineCouleurs` et `setVitrineJeux`, et
 * aucune n'est montée sur cette page.
 *
 * Leur `router.refresh()` est donc sans danger : il re-rend l'arbre serveur,
 * mais l'état du studio vit dans un `useState` de `VitrineStudio`, qui n'est
 * pas remonté par un rafraîchissement.
 *
 * ── ET AUCUN CONTRÔLE NE PORTE UN `name` DES RÉGLAGES ──
 *
 * Les `name` d'ici (`nom`, `id`, `active`, `menu_id`, `categorie_id`, `order`,
 * `import`, `badges`, `facettes`, `allergenes`, `disponible`, `action`,
 * `description`, `prix_affiche`) appartiennent aux actions du catalogue. Aucun
 * ne recoupe la charge de `saveVitrineSettings` — sans quoi il aurait voyagé
 * avec elle depuis une page, et disparu de la charge en la quittant
 * (`studio-charge.test.tsx`). Les `<form>` montés ici sont des FRÈRES du
 * `form#studio-reglages`, jamais ses descendants : il est vide et posé à côté
 * de la mise en page, précisément pour cela.
 */
export function PageCarteStudio({
  nbCartes,
  cartes,
  peutEditer,
}: {
  /** Le même compte que `cartes.length`, déjà calculé par la coquille. */
  nbCartes: number;
  cartes: VitrineCarteView[];
  peutEditer: boolean;
}) {
  /**
   * L'IMPORT EST REPLIÉ, SAUF QUAND IL N'Y A RIEN À REPLIER SUR.
   *
   * Il porte un champ fichier, une zone de dix lignes et son mode d'emploi :
   * déplié en permanence dans une colonne de 340 px, il repousse sous la ligne
   * de flottaison les cartes qu'on vient modifier — or l'import est un geste
   * qu'on fait UNE fois, et l'édition un geste qu'on fait chaque semaine.
   * Ouvert d'emblée sur une vitrine sans carte, parce que c'est alors le chemin
   * le plus court.
   *
   * L'état est CLIENT et non un `open` recalculé : chaque mutation du catalogue
   * est suivie d'un `router.refresh()`, et un `open` dérivé de `nbCartes` aurait
   * refermé le pli sous les doigts du commerçant au premier import réussi —
   * exactement le défaut mesuré sur les plis de `fiche-editeur.tsx`.
   */
  const [importOuvert, setImportOuvert] = useState(nbCartes === 0);

  return (
    <div className="space-y-4">
      <section className="space-y-3">
        <h2 className="text-sm font-black uppercase tracking-[0.14em] text-k-orange-text">
          Votre carte
        </h2>
        <ResumeCarteStudio cartes={cartes} />
      </section>

      {peutEditer ? (
        <details
          open={importOuvert}
          onToggle={(e) => setImportOuvert(e.currentTarget.open)}
          className="rounded-xl border-2 border-k-ink/15 bg-white px-3 py-2"
        >
          <summary className="cursor-pointer list-none text-sm font-bold text-k-ink underline underline-offset-2">
            J&apos;ai déjà ma carte dans un fichier
          </summary>
          <div className="mt-3">
            <ImportCarte peutEditer={peutEditer} />
          </div>
        </details>
      ) : null}

      <CatalogueEditeur cartes={cartes} peutEditer={peutEditer} />
    </div>
  );
}
