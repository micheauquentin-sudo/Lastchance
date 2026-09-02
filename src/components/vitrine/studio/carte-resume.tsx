"use client";

import { compterFiches } from "@/lib/vitrine-indexation";
import type { VitrineCarteView } from "@/lib/vitrine";

/**
 * CE QUE LA CARTE CONTIENT — et surtout ce qui n'arrivera PAS jusqu'au client.
 *
 * ── POURQUOI UN RÉSUMÉ, ALORS QUE L'APERÇU EST JUSTE À CÔTÉ ──
 *
 * Parce que l'aperçu ne peut pas expliquer son propre vide. Une carte sans
 * fiche, une carte décochée : dans les deux cas le centre de l'écran ne montre
 * rien, et rien ne distingue « je n'ai pas encore saisi » de « c'est cassé ».
 * Le studio a été fait pour composer EN VOYANT ; un écran qui montre du vide
 * sans le nommer retire précisément ce qu'il promettait.
 *
 * ── DEUX VIDES, ET CE N'EST PAS LE MÊME ──
 *
 * `apercuVide` dit ce que le commerçant voit au centre. `publicVide` dit ce que
 * ses clients verront. Ils DIVERGENT, et c'est le piège que ce bloc existe pour
 * dire : l'aperçu du studio ne filtre pas les cartes décochées (il reçoit les
 * cartes du commerçant, et `CatalogueVitrine` ne regarde pas `active`), alors
 * que la RPC publique ne rend que les cartes actives. Une carte entièrement
 * décochée s'affiche donc pleine dans l'aperçu et vide chez le client — le
 * genre d'écart qu'on ne découvre qu'en scannant son propre QR code.
 *
 * Corriger l'aperçu lui-même appartient à `studio/apercu.tsx`, hors du lot
 * VIT-23 ; le nommer ici coûte trois lignes et évite la mauvaise surprise en
 * attendant.
 */
export interface ResumeCarte {
  /** Toutes les cartes du commerçant, décochées comprises. */
  cartes: number;
  /** Celles qui sont cochées « Afficher cette carte à mes clients ». */
  actives: number;
  masquees: number;
  rubriques: number;
  fiches: number;
  /** L'aperçu au centre n'a rien à montrer. */
  apercuVide: boolean;
  /** Les CLIENTS n'auront rien à lire — cartes décochées retirées. */
  publicVide: boolean;
}

export function resumerCartes(
  cartes: readonly VitrineCarteView[],
): ResumeCarte {
  const actives = cartes.filter((carte) => carte.active);
  const rubriques = cartes.reduce(
    (total, carte) => total + carte.categories.length,
    0,
  );
  // `compterFiches` plutôt qu'une seconde réduction à la main : la même somme
  // est déjà écrite pour le seuil d'indexation, et deux comptes de fiches qui
  // divergeraient d'un jour à l'autre sont exactement la dette que ce dépôt
  // paie ailleurs.
  const fiches = compterFiches(cartes);

  return {
    cartes: cartes.length,
    actives: actives.length,
    masquees: cartes.length - actives.length,
    rubriques,
    fiches,
    apercuVide: fiches === 0,
    publicVide: compterFiches(actives) === 0,
  };
}

/**
 * Le résumé rendu, en tête de la page « La carte ».
 *
 * Les avertissements sont des `role="status"` et non des `role="alert"` : rien
 * n'est en panne, et une carte en cours de composition est un état NORMAL du
 * studio. Un `alert` aurait interrompu le lecteur d'écran à chaque fiche
 * ajoutée pour lui annoncer une situation qu'il est en train de résoudre.
 */
export function ResumeCarteStudio({
  cartes,
}: {
  cartes: readonly VitrineCarteView[];
}) {
  const resume = resumerCartes(cartes);

  if (resume.cartes === 0) {
    return (
      <p className="text-sm text-k-body">
        Aucune carte pour l&apos;instant. Importez la vôtre ou créez-la
        ci-dessous : l&apos;aperçu au centre la montrera telle que vos clients
        la liront.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      <p className="text-sm text-k-body">
        {resume.cartes} carte{resume.cartes > 1 ? "s" : ""} ·{" "}
        {resume.rubriques} rubrique{resume.rubriques > 1 ? "s" : ""} ·{" "}
        {resume.fiches} fiche{resume.fiches > 1 ? "s" : ""}.
      </p>

      {resume.apercuVide ? (
        <p
          role="status"
          className="rounded-xl border-2 border-k-ink/15 bg-white px-3 py-2 text-xs font-semibold text-k-ink"
        >
          Vos cartes n&apos;ont encore aucune fiche : l&apos;aperçu au centre
          reste vide tant que vous n&apos;en avez pas ajouté une.
        </p>
      ) : resume.publicVide ? (
        // LE CAS QUI TROMPE : l'aperçu est plein, la page publique est vide.
        <p
          role="status"
          className="rounded-xl border-2 border-k-orange-text/40 bg-k-yellow/30 px-3 py-2 text-xs font-semibold text-k-ink"
        >
          Aucune de vos cartes n&apos;est affichée à vos clients. L&apos;aperçu
          vous les montre quand même — cochez « Afficher cette carte » pour
          qu&apos;elles paraissent vraiment.
        </p>
      ) : resume.masquees > 0 ? (
        <p
          role="status"
          className="rounded-xl border-2 border-k-ink/15 bg-white px-3 py-2 text-xs font-semibold text-k-ink"
        >
          {resume.masquees} carte{resume.masquees > 1 ? "s" : ""} masquée
          {resume.masquees > 1 ? "s" : ""} : l&apos;aperçu{" "}
          {resume.masquees > 1 ? "les" : "la"} montre encore, vos clients non.
        </p>
      ) : null}
    </div>
  );
}
