import { describe, expect, it } from "vitest";
import {
  construireVerificationFidelite,
  type EntreeVerificationFidelite,
  type PalierVerification,
  type RoueVerification,
} from "@/components/dashboard/atelier-loyalty-verification-state";

function palier(partiel: Partial<PalierVerification> = {}): PalierVerification {
  return {
    id: "ms-1",
    visitCount: 10,
    rewardType: "lot",
    rewardLabel: "Un café offert",
    rewardStock: 50,
    targetWheelId: null,
    ...partiel,
  };
}

function roue(partiel: Partial<RoueVerification> = {}): RoueVerification {
  return {
    id: "wheel-1",
    name: "Roue du comptoir",
    unlimitedPrizes: [],
    hasDrawablePrize: true,
    ...partiel,
  };
}

function entree(
  partiel: Partial<EntreeVerificationFidelite> = {},
): EntreeVerificationFidelite {
  return {
    programId: "prog-1",
    paliers: [palier()],
    roues: [roue()],
    ...partiel,
  };
}

function controle(
  etat: ReturnType<typeof construireVerificationFidelite>,
  cle: string,
) {
  const trouve = etat.controles.find((c) => c.cle === cle);
  if (!trouve) throw new Error(`contrôle « ${cle} » absent`);
  return trouve;
}

describe("construireVerificationFidelite — le cas nominal", () => {
  it("déclare tout prêt et vise l'unique écran qui publie", () => {
    const etat = construireVerificationFidelite(entree());
    expect(etat.toutPret).toBe(true);
    expect(etat.ctaHref).toBe("/dashboard/loyalty/prog-1#statut");
  });

  it("rattache chaque point à l'étape « Les récompenses »", () => {
    const etat = construireVerificationFidelite(entree());
    expect(etat.controles.every((c) => c.etape === "recompenses")).toBe(true);
  });
});

describe("la précondition serveur : au moins un palier", () => {
  it("refuse un programme sans palier", () => {
    const etat = construireVerificationFidelite(entree({ paliers: [] }));
    expect(controle(etat, "paliers").ok).toBe(false);
    expect(etat.toutPret).toBe(false);
  });

  it("nomme les paliers existants plutôt que de les compter seulement", () => {
    const etat = construireVerificationFidelite(
      entree({
        paliers: [palier({ visitCount: 5 }), palier({ id: "ms-2", visitCount: 12 })],
      }),
    );
    expect(controle(etat, "paliers").detail).toContain("5 visites");
    expect(controle(etat, "paliers").detail).toContain("12 visites");
  });
});

describe("le stock — OBLIGATOIRE et fini ici, 0 = palier en pause", () => {
  it("laisse passer des paliers dotés", () => {
    expect(controle(construireVerificationFidelite(entree()), "stock").ok).toBe(
      true,
    );
  });

  it("signale un palier à stock 0, que le serveur laisse ouvrir sans un mot", () => {
    const etat = construireVerificationFidelite(
      entree({ paliers: [palier({ visitCount: 7, rewardStock: 0 })] }),
    );
    expect(controle(etat, "stock").ok).toBe(false);
    expect(controle(etat, "stock").detail).toContain("7 visites");
    expect(etat.toutPret).toBe(false);
  });

  it("ne prend pas un stock absent (null) pour un stock épuisé", () => {
    expect(
      controle(
        construireVerificationFidelite(
          entree({ paliers: [palier({ rewardStock: null })] }),
        ),
        "stock",
      ).ok,
    ).toBe(true);
  });
});

describe("les paliers « tour de roue offert »", () => {
  it("ne rend AUCUN point de roue quand aucun palier n'en offre", () => {
    const etat = construireVerificationFidelite(entree());
    expect(etat.controles.some((c) => c.cle === "roues")).toBe(false);
  });

  it("laisse passer un tour offert sur une roue qui a de quoi distribuer", () => {
    const etat = construireVerificationFidelite(
      entree({
        paliers: [palier({ rewardType: "spin", targetWheelId: "wheel-1" })],
      }),
    );
    expect(controle(etat, "roues").ok).toBe(true);
  });

  it("refuse un palier spin sans roue choisie", () => {
    const etat = construireVerificationFidelite(
      entree({
        paliers: [palier({ rewardType: "spin", targetWheelId: null })],
      }),
    );
    expect(controle(etat, "roues").ok).toBe(false);
    expect(controle(etat, "roues").detail).toContain("Aucune roue choisie");
  });

  it("refuse un palier spin dont la roue a été supprimée", () => {
    const etat = construireVerificationFidelite(
      entree({
        paliers: [palier({ rewardType: "spin", targetWheelId: "wheel-disparue" })],
        roues: [roue()],
      }),
    );
    expect(controle(etat, "roues").ok).toBe(false);
  });

  it("refuse une roue dont aucun lot n'est tirable par un tour offert", () => {
    const etat = construireVerificationFidelite(
      entree({
        paliers: [palier({ rewardType: "spin", targetWheelId: "wheel-1" })],
        roues: [
          roue({ hasDrawablePrize: false, unlimitedPrizes: ["Un menu offert"] }),
        ],
      }),
    );
    expect(controle(etat, "roues").ok).toBe(false);
    expect(controle(etat, "roues").detail).toContain("ne peut rien distribuer");
  });

  it("laisse passer une roue simplement porteuse de lots illimités — elle tourne encore", () => {
    const etat = construireVerificationFidelite(
      entree({
        paliers: [palier({ rewardType: "spin", targetWheelId: "wheel-1" })],
        roues: [
          roue({ hasDrawablePrize: true, unlimitedPrizes: ["Un menu offert"] }),
        ],
      }),
    );
    expect(controle(etat, "roues").ok).toBe(true);
  });
});
