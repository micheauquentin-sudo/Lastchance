"use client";

import Link from "next/link";
import type { SecteurVitrine, ThemeVitrine } from "@/lib/vitrine";

/**
 * LA PAGE « LES JEUX » DU STUDIO — coquille (VIT-20), remplie par VIT-22.
 *
 * Y viendront le bilan de ce que l'offre comprend et les deux cases — Duo
 * Miroir, Portrait de la Bande — qui décident de ce qui paraît sur la carte.
 * Le CONTENU des plateaux reste sur la page de chaque jeu (ADR-135) : ce qui
 * se règle ici est « ce jeu paraît-il sur ma vitrine », pas « que contient-il ».
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
  void duoPossede;
  void bandePossede;
  void nbFichesDuo;
  void themeInitial;
  void secteur;
  void peutEditer;
  return (
    <div className="space-y-3">
      <h2 className="text-sm font-black uppercase tracking-[0.14em] text-k-orange-text">
        Les jeux sur la carte
      </h2>
      <p className="text-sm text-k-body">
        {jeuxVisibles
          ? "Le bloc « Jeux » figure sur votre carte."
          : "Aucun jeu n'est annoncé sur votre carte."}
      </p>
      <Link
        href="/dashboard/vitrine?etape=jeux"
        className="inline-block rounded-xl border-2 border-k-ink bg-white px-3 py-2 text-sm font-black text-k-ink hover:bg-k-yellow"
      >
        Choisir mes jeux
      </Link>
    </div>
  );
}
