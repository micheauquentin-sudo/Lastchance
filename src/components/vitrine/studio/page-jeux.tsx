"use client";

import { JeuxVitrineEditeur } from "@/components/vitrine/jeux-vitrine";
import { resoudreThemeVitrine } from "@/components/vitrine/theme";
import { DUO_OPTIONS_MIN_BASE } from "@/lib/duo";
import type { SecteurVitrine, ThemeVitrine } from "@/lib/vitrine";

/**
 * LA PAGE « LES JEUX » DU STUDIO (VIT-22).
 *
 * ── ELLE MONTE L'ÉDITEUR EXISTANT, ELLE NE LE REFAIT PAS ──
 *
 * `JeuxVitrineEditeur` fait déjà tout ce que cette page réclame : le bilan de
 * ce que l'offre comprend, les trois états par jeu, les deux cases. Le rendre
 * une seconde fois ici — même en apparence identique — aurait mis DEUX
 * contrôles sur une seule ligne en base : l'un revalidé, l'autre servi depuis
 * un cache, et un commerçant qui lit deux réponses différentes à la même
 * question selon l'écran ouvert. C'est le motif déjà écarté pour le plateau du
 * Duo (DUO-3b, `RenvoiVersLeJeu`) : le même réglage se règle à UN endroit.
 *
 * ── PAS DE CASE POUR LE BLOC « JEUX » ──
 *
 * On pourrait croire qu'il en manque une, puisque les autres pages du studio
 * cochent leurs blocs. Elle serait fausse : `setVitrineJeux` écrit
 * `ordre_blocs` LUI-MÊME — cocher un jeu ajoute `experiences`, ne rien cocher
 * le retire (ADR-129). Une case de plus serait le même réglage à deux
 * endroits, et le premier des deux à partir écraserait l'autre. La phrase
 * ci-dessous se contente donc de DIRE l'état, sans offrir de le contredire.
 *
 * ── ET SON FORMULAIRE EST UN FRÈRE, PAS UN DESCENDANT ──
 *
 * L'éditeur porte son propre `<form>` : il a son action à lui. C'est prévu —
 * le formulaire de réglages du studio est vide de mise en page et posé en
 * VOISIN de la colonne (voir l'en-tête de `vitrine-studio.tsx`). Un `<form>`
 * dans un `<form>` ferait échouer l'hydratation et tuerait l'interactivité de
 * l'écran entier, ce que garde `studio-charge.test.tsx` (`form form === 0`).
 */
export function PageJeuxStudio({
  jeuxVisibles,
  duoPossede,
  bandePossede,
  nbFichesDuo,
  themeInitial,
  secteur,
  peutEditer,
}: {
  jeuxVisibles: boolean;
  /** Le droit du JEU, pas celui de la vitrine (clé par produit). */
  duoPossede: boolean;
  bandePossede: boolean;
  /** Le COMPTE décide du « prêt / pas prêt », pas le contenu du plateau. */
  nbFichesDuo: number;
  /** Le thème EN BASE : `resoudreThemeVitrine` y lit les cases déjà faites. */
  themeInitial: ThemeVitrine;
  secteur: SecteurVitrine;
  peutEditer: boolean;
}) {
  /**
   * L'ÉTAT DES CASES SE LIT PAR LE RÉSOLVEUR, JAMAIS DANS LE THÈME BRUT.
   *
   * `theme.jeux` est ABSENT sur toutes les vitrines d'avant VIT-16, et cette
   * absence vaut « les deux » (ADR-129). Lire `themeInitial.jeux?.duo` aurait
   * rendu `undefined`, donc deux cases vides, donc un enregistrement qui
   * retire en silence les jeux d'une vitrine qui les affichait.
   */
  const themeResolu = resoudreThemeVitrine(themeInitial, secteur);

  return (
    <div className="space-y-3">
      {/* Ce que la carte montre AUJOURD'HUI, en un mot. Le rechargement
          ci-dessous garantit que cette phrase n'est jamais en retard sur le
          choix qu'on vient d'enregistrer. */}
      <p className="text-xs text-zinc-500">
        {jeuxVisibles
          ? "Le bloc « Jeux » figure actuellement sur votre carte."
          : "Aucun jeu n'est actuellement annoncé sur votre carte."}
      </p>

      <JeuxVitrineEditeur
        duoPossede={duoPossede}
        bandePossede={bandePossede}
        // Le PLANCHER du plateau, pas un chiffre recopié : la même constante
        // que la page du jeu et que le tableau de bord.
        duoPret={nbFichesDuo >= DUO_OPTIONS_MIN_BASE}
        duoCoche={themeResolu.jeux.duo}
        bandeCoche={themeResolu.jeux.bande}
        nbFichesDuo={nbFichesDuo}
        peutEditer={peutEditer}
        // OBLIGATOIRE ICI, ET NULLE PART AILLEURS : le studio tient
        // `ordre_blocs` dans son état client, que `setVitrineJeux` vient de
        // modifier en base. Sans ce rechargement, le prochain « Enregistrer »
        // reposte l'ancien ordre et fait disparaître le bloc « Jeux » que le
        // commerçant vient de demander. Voir le commentaire de la prop.
        rechargerApresSucces
      />
    </div>
  );
}
