import type { StatutTuile, TuileRendue } from "@/lib/checklist/tuiles";

/**
 * LES PROPS DE `CarteRepliable` POUR UNE TUILE, CHERCHÉE PAR SA CLÉ.
 *
 * Une page détail rend ses blocs dans un ordre fixe et doit poser sur chacun
 * son titre, son ancre, son rang et son verdict. Les recopier à la main dans le
 * JSX ferait de la page une SECONDE table des tuiles, qui divergerait de
 * `tuiles.ts` au premier bloc réordonné — et le rang, lui, ne peut pas être
 * recopié : il se lit de la position dans la liste.
 *
 * D'où cette lecture par clé : la page nomme le bloc, la table répond tout le
 * reste.
 *
 *   <CarteRepliable {...carteTuile(tuiles, "partage")} defaultOuvert={false}>
 *
 * Une clé inconnue ne fait PAS tomber la page : la liste est statique, donc une
 * clé absente est une faute de frappe dans le JSX, jamais un cas d'exécution.
 * On rend alors une carte nue — sans pastille, sans ancre — plutôt que de
 * refuser d'afficher tout le suivi d'un commerçant pour un rang manquant.
 */
export interface ProprietesCarteTuile {
  titre: string;
  id?: string;
  numero?: number;
  statut?: StatutTuile;
}

export function carteTuile(
  tuiles: readonly TuileRendue[],
  cle: string,
): ProprietesCarteTuile {
  const trouvee = tuiles.find((t) => t.tuile.cle === cle);
  if (!trouvee) return { titre: cle };
  return {
    titre: trouvee.tuile.titre,
    id: trouvee.tuile.ancre,
    numero: trouvee.numero,
    statut: trouvee.statut,
  };
}
