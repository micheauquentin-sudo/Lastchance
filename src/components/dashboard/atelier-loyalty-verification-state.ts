import { manquesActivationFidelite } from "@/lib/activation/loyalty";
import {
  spinWheelIssue,
  type SpinWheelPrizes,
} from "@/components/dashboard/loyalty-settings-presets";
import type { EtapeFidelite } from "@/components/dashboard/atelier-loyalty-etapes";
import type { LoyaltyRewardType } from "@/types/database";

/**
 * L'ÉTAPE 4 DE L'ATELIER DU PASSEPORT, EN FONCTION PURE.
 *
 * La précondition serveur (`manquesActivationFidelite`, IMPORTÉE) est mince :
 * un palier suffit. Tout le reste de cette liste est ce que la base laisse
 * passer sans un mot :
 *  · un palier à stock 0 — il est « en pause », le client atteint le nombre de
 *    visites et ne reçoit rien ;
 *  · un palier « tour de roue offert » dont la roue a disparu, ou dont aucun
 *    lot n'est tirable par un tour offert (`spinWheelIssue`, réutilisé tel
 *    quel — il est déjà le miroir du filtre de `consume_loyalty_spin_grant`).
 *
 * Pure et testée. Elle ne publie pas : le CTA renvoie sur `#statut` de la vue
 * suivi, seul écran qui ouvre le programme aux clients.
 */
export interface PalierVerification {
  id: string;
  visitCount: number;
  rewardType: LoyaltyRewardType;
  rewardLabel: string;
  /** `loyalty_milestones.reward_stock` — 0 = épuisé, palier en pause. */
  rewardStock: number | null;
  targetWheelId: string | null;
}

/** Roue de l'organisation + état de ses lots, tel que la page l'a déjà calculé. */
export interface RoueVerification extends SpinWheelPrizes {
  id: string;
  name: string;
}

export interface EntreeVerificationFidelite {
  programId: string;
  paliers: PalierVerification[];
  roues: RoueVerification[];
}

export interface ControleFidelite {
  cle: string;
  ok: boolean;
  titre: string;
  detail: string;
  etape: EtapeFidelite;
}

export interface EtatVerificationFidelite {
  controles: ControleFidelite[];
  toutPret: boolean;
  ctaHref: string;
}

function listePaliers(paliers: PalierVerification[]): string {
  return paliers.map((p) => `${p.visitCount} visites`).join(", ");
}

export function construireVerificationFidelite(
  entree: EntreeVerificationFidelite,
): EtatVerificationFidelite {
  const { programId, paliers, roues } = entree;

  const manques = new Set(
    manquesActivationFidelite({ milestoneCount: paliers.length }),
  );

  const controles: ControleFidelite[] = [];

  controles.push({
    cle: "paliers",
    ok: !manques.has("paliers"),
    titre: "Au moins un palier existe",
    detail: manques.has("paliers")
      ? "Aucun palier : un passeport sans récompense à débloquer n'a rien à offrir, et l'ouverture aux clients est refusée."
      : `${paliers.length} palier${paliers.length > 1 ? "s" : ""} à débloquer (${listePaliers(paliers)}).`,
    etape: "recompenses",
  });

  // Le stock d'un palier est OBLIGATOIRE et FINI (l'« illimité » n'existe pas
  // ici, contrairement à la chasse) : 0 est une valeur légitime, qui met le
  // palier en pause. C'est justement pour cela qu'elle mérite d'être dite.
  const enPause = paliers.filter((p) => p.rewardStock === 0);
  controles.push({
    cle: "stock",
    ok: enPause.length === 0,
    titre: "Aucun palier n'est en pause",
    detail:
      enPause.length === 0
        ? "Chaque palier a du stock : les clients qui les atteignent recevront bien leur récompense."
        : `Stock épuisé sur ${enPause.length} palier${enPause.length > 1 ? "s" : ""} (${listePaliers(enPause)}) : le client atteint le nombre de visites et ne reçoit rien. Remontez leur stock pour les remettre en service.`,
    etape: "recompenses",
  });

  // Contrôle rendu SEULEMENT s'il y a des paliers « tour de roue offert » :
  // une ligne verte « rien à vérifier » sur un programme qui n'en a aucun
  // serait du bruit dans une liste dont chaque ligne doit se mériter.
  const spins = paliers.filter((p) => p.rewardType === "spin");
  if (spins.length > 0) {
    const sansRoue = spins.filter(
      (p) => p.targetWheelId === null || !roues.some((r) => r.id === p.targetWheelId),
    );
    const sansLot = spins.filter((p) => {
      const roue = roues.find((r) => r.id === p.targetWheelId);
      return roue !== undefined && spinWheelIssue(roue) === "nothing_drawable";
    });
    const ok = sansRoue.length === 0 && sansLot.length === 0;
    controles.push({
      cle: "roues",
      ok,
      titre: "Les tours de roue offerts peuvent être joués",
      detail: ok
        ? `${spins.length} palier${spins.length > 1 ? "s offrent" : " offre"} un tour de roue, sur une roue qui a de quoi distribuer.`
        : sansRoue.length > 0
          ? `Aucune roue choisie (ou roue supprimée) sur ${sansRoue.length} palier${sansRoue.length > 1 ? "s" : ""} (${listePaliers(sansRoue)}) : le tour offert n'aurait rien à faire tourner.`
          : `La roue ciblée par ${sansLot.length} palier${sansLot.length > 1 ? "s" : ""} (${listePaliers(sansLot)}) ne peut rien distribuer en tour offert — ses lots sont tous à stock illimité, et un tour offert les exclut du tirage. Donnez un stock à au moins un lot depuis la page de la campagne.`,
      etape: "recompenses",
    });
  }

  return {
    controles,
    toutPret: controles.every((c) => c.ok),
    ctaHref: `/dashboard/loyalty/${programId}#statut`,
  };
}
