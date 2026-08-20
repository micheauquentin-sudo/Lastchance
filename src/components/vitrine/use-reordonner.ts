"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { cleOrdre, ordreAffiche, type OrdreLocal } from "@/lib/ordre-optimiste";
import type { ActionResult } from "@/lib/utils";

/**
 * LES FLÈCHES ↑ ↓ D'UNE LISTE ORDONNÉE, avec écrasement local.
 *
 * ── POURQUOI UN HOOK ET NON TROIS COPIES ──
 *
 * La vitrine a TROIS niveaux réordonnables — cartes, rubriques, fiches — et le
 * geste est rigoureusement le même : permuter deux voisins, envoyer l'ordre
 * complet, tenir l'affichage jusqu'au retour. Recopié trois fois, il aurait
 * divergé au premier ajustement, et c'est la classe de dette que ce dépôt paie
 * déjà ailleurs. Le motif lui-même est celui de `HuntStepsEditor` (2026-07-30),
 * dont le commentaire porte la mesure : `router.refresh()` ne s'applique pas
 * 5 à 32 % du temps, et un clic suivant calculé depuis une liste périmée
 * ÉCRIT en base un ordre que personne n'a demandé.
 *
 * ── PAS DE `useTransition` ──
 *
 * Son `pending` est piloté par le rendu et peut ne jamais retomber
 * (docs/bugs.md). Ici il retombe dans un `finally`.
 */
export function useReordonner<T extends { id: string }>(
  items: readonly T[],
  envoyer: (ids: string[]) => Promise<ActionResult>,
) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [ordreLocal, setOrdreLocal] = useState<OrdreLocal | null>(null);

  const cleServeur = cleOrdre(items);
  const affiches = ordreAffiche(items, ordreLocal);

  const deplacer = (index: number, direction: -1 | 1) => {
    const cible = index + direction;
    if (cible < 0 || cible >= affiches.length) return;
    if (pending) return;
    const ids = affiches.map((item) => item.id);
    [ids[index], ids[cible]] = [ids[cible], ids[index]];
    setErreur(null);
    setPending(true);
    // Appliqué AVANT l'aller-retour : c'est ce qui rend le clic SUIVANT juste,
    // même si le rafraîchissement ne revient jamais.
    setOrdreLocal({ depuis: cleServeur, vers: ids });
    void (async () => {
      try {
        const resultat = await envoyer(ids);
        if (!resultat.ok) {
          // Refus serveur : revenir à la vérité serveur, sinon on afficherait
          // un ordre qui n'existe nulle part.
          setOrdreLocal(null);
          setErreur(resultat.error);
          return;
        }
        router.refresh();
      } catch {
        setOrdreLocal(null);
        setErreur("Réorganisation impossible, réessayez.");
      } finally {
        setPending(false);
      }
    })();
  };

  return { affiches, deplacer, pending, erreur };
}
