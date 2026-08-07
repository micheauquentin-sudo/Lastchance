import { describe, expect, it } from "vitest";
import {
  construireVerification,
  type EntreeVerification,
  type LotVerification,
} from "@/components/dashboard/atelier-verification-state";

const MAINTENANT = new Date("2026-08-07T12:00:00.000Z");

function lot(partiel: Partial<LotVerification> = {}): LotVerification {
  return {
    is_active: true,
    is_losing: false,
    weight: 10,
    stock: null,
    ...partiel,
  };
}

function entree(partiel: Partial<EntreeVerification> = {}): EntreeVerification {
  return {
    campaignId: "camp-1",
    gameType: "wheel",
    skillConfig: null,
    prizes: [lot({ weight: 30 }), lot({ is_losing: true, weight: 70 })],
    qrExistant: true,
    campagne: { status: "draft", starts_at: null, ends_at: null },
    now: MAINTENANT,
    ...partiel,
  };
}

function controle(etat: ReturnType<typeof construireVerification>, cle: string) {
  const trouve = etat.controles.find((c) => c.cle === cle);
  if (!trouve) throw new Error(`contrôle « ${cle} » absent`);
  return trouve;
}

describe("construireVerification — le cas nominal", () => {
  it("déclare tout prêt sur une roue jouable, et vise l'unique endroit qui publie", () => {
    const etat = construireVerification(entree());
    expect(etat.toutPret).toBe(true);
    expect(etat.ctaHref).toBe("/dashboard/campaigns/camp-1#statut");
    expect(etat.controles.every((c) => c.ok)).toBe(true);
  });

  it("nomme la mécanique au commerçant plutôt que sa valeur technique", () => {
    const etat = construireVerification(entree({ gameType: "cups" }));
    expect(controle(etat, "mecanique").detail).toContain("Bonneteau");
  });

  it("n'ajoute le contrôle du défi que sur un jeu de défi", () => {
    expect(
      construireVerification(entree()).controles.some((c) => c.cle === "defi"),
    ).toBe(false);
    const skill = construireVerification(
      entree({ gameType: "rps", skillConfig: {} }),
    );
    expect(controle(skill, "defi").ok).toBe(true);
  });
});

describe("construireVerification — le défi", () => {
  it("refuse un mot mystère sans mot, en nommant la mécanique et la conséquence", () => {
    const etat = construireVerification(
      entree({ gameType: "mystery_word", skillConfig: null }),
    );
    expect(controle(etat, "defi").ok).toBe(false);
    expect(controle(etat, "defi").detail).toContain("Mot mystère");
    expect(controle(etat, "defi").detail).toContain(
      "Ce défi n'est pas disponible",
    );
    expect(etat.toutPret).toBe(false);
  });

  it("reporte le message du validateur quand il est parlant", () => {
    const etat = construireVerification(
      entree({ gameType: "puzzle", skillConfig: { fragments: ["seul"], order: [0] } }),
    );
    expect(controle(etat, "defi").ok).toBe(false);
    expect(controle(etat, "defi").detail).toMatch(/2 fragments/i);
  });

  it("accepte une estimation complète et renvoie sur l'étape du jeu", () => {
    const etat = construireVerification(
      entree({
        gameType: "estimate",
        skillConfig: { target: 100, tolerance: 10 },
      }),
    );
    expect(controle(etat, "defi").ok).toBe(true);
    expect(controle(etat, "defi").etape).toBe("jeu");
  });

  it("dit qu'un échec au défi consomme la participation", () => {
    const etat = construireVerification(
      entree({ gameType: "reflex", skillConfig: { durationMs: 1500 } }),
    );
    expect(controle(etat, "defi").detail).toContain("perdant");
  });
});

describe("construireVerification — les lots, au miroir du moteur de tirage", () => {
  it("ne compte pas un lot gagnant épuisé (stock 0)", () => {
    const etat = construireVerification(
      entree({
        prizes: [lot({ weight: 30, stock: 0 }), lot({ is_losing: true, weight: 70 })],
      }),
    );
    expect(controle(etat, "lot-gagnant").ok).toBe(false);
    expect(etat.toutPret).toBe(false);
    expect(controle(etat, "lot-gagnant").etape).toBe("lots");
  });

  it("compte un lot gagnant à stock illimité comme un lot à stock restant", () => {
    const sansStock = construireVerification(
      entree({ prizes: [lot({ stock: null }), lot({ is_losing: true })] }),
    );
    const avecStock = construireVerification(
      entree({ prizes: [lot({ stock: 3 }), lot({ is_losing: true })] }),
    );
    expect(controle(sansStock, "lot-gagnant").ok).toBe(true);
    expect(controle(avecStock, "lot-gagnant").ok).toBe(true);
  });

  it("ne compte pas un lot gagnant désactivé ni un lot de poids nul", () => {
    const inactif = construireVerification(
      entree({ prizes: [lot({ is_active: false }), lot({ is_losing: true })] }),
    );
    const poidsNul = construireVerification(
      entree({ prizes: [lot({ weight: 0 }), lot({ is_losing: true })] }),
    );
    expect(controle(inactif, "lot-gagnant").ok).toBe(false);
    expect(controle(poidsNul, "lot-gagnant").ok).toBe(false);
  });

  it("refuse un poids total nul et le dit sans jargon", () => {
    const etat = construireVerification(
      entree({ prizes: [lot({ weight: 0 }), lot({ is_losing: true, weight: 0 })] }),
    );
    expect(controle(etat, "poids").ok).toBe(false);
    expect(etat.poidsTotal).toBe(0);
    expect(controle(etat, "poids").detail).toContain("nul");
  });

  it("calcule la part gagnante sur la liste COMPLÈTE, lot épuisé exclu du total", () => {
    // 30 gagnant tirable + 70 perdant = 100 → 3 clients sur 10.
    const etat = construireVerification(entree());
    expect(etat.poidsTotal).toBe(100);
    expect(etat.partGagnante).toBe("≈ 3 clients sur 10 gagnent quelque chose");
    expect(controle(etat, "poids").detail).toContain("3 clients sur 10");

    // Le lot épuisé sort du total : le perdant occupe alors tout le tirage.
    const epuise = construireVerification(
      entree({
        prizes: [
          lot({ weight: 30, stock: 0 }),
          lot({ weight: 20 }),
          lot({ is_losing: true, weight: 80 }),
        ],
      }),
    );
    expect(epuise.poidsTotal).toBe(100);
    expect(epuise.partGagnante).toBe("≈ 2 clients sur 10 gagnent quelque chose");
  });

  it("accorde le singulier quand un seul client sur 10 gagne", () => {
    const etat = construireVerification(
      entree({
        prizes: [lot({ weight: 10 }), lot({ is_losing: true, weight: 90 })],
      }),
    );
    expect(etat.partGagnante).toBe("≈ 1 client sur 10 gagne quelque chose");
  });
});

describe("construireVerification — le QR code", () => {
  it("manque de QR : le lien mène au bloc QR de la page du jeu", () => {
    // Le QR se crée sans quitter la page du jeu (bloc `#qr`) : le lien de
    // réparation reste sur l'écran où le commerçant travaille.
    const etat = construireVerification(entree({ qrExistant: false }));
    expect(controle(etat, "qr").ok).toBe(false);
    expect(controle(etat, "qr").lien?.href).toBe(
      "/dashboard/campaigns/camp-1#qr",
    );
    expect(etat.toutPret).toBe(false);
  });

  it("QR présent : aucun lien de réparation", () => {
    expect(controle(construireVerification(entree()), "qr").lien).toBeUndefined();
  });
});

describe("construireVerification — la fenêtre de la campagne", () => {
  it("refuse une campagne dont la date de fin est passée", () => {
    const etat = construireVerification(
      entree({
        campagne: {
          status: "draft",
          starts_at: "2026-08-01T00:00:00.000Z",
          ends_at: "2026-08-05T00:00:00.000Z",
        },
      }),
    );
    expect(controle(etat, "fenetre").ok).toBe(false);
    expect(controle(etat, "fenetre").lien?.href).toBe("/dashboard/campaigns/camp-1");
  });

  it("accepte une campagne programmée : elle ouvrira, elle n'est pas cassée", () => {
    const etat = construireVerification(
      entree({
        campagne: {
          status: "draft",
          starts_at: "2026-09-01T00:00:00.000Z",
          ends_at: null,
        },
      }),
    );
    expect(controle(etat, "fenetre").ok).toBe(true);
    expect(controle(etat, "fenetre").detail).toContain("date de début");
  });

  it("refuse une campagne clôturée", () => {
    const etat = construireVerification(
      entree({ campagne: { status: "archived", starts_at: null, ends_at: null } }),
    );
    expect(controle(etat, "fenetre").ok).toBe(false);
    expect(controle(etat, "fenetre").detail).toContain("clôturée");
  });
});

describe("construireVerification — les liens de réparation", () => {
  it("chaque contrôle en échec offre soit une étape, soit un lien — jamais rien", () => {
    const etat = construireVerification(
      entree({
        gameType: "mystery_word",
        skillConfig: null,
        prizes: [lot({ weight: 0 })],
        qrExistant: false,
        campagne: {
          status: "draft",
          starts_at: null,
          ends_at: "2026-01-01T00:00:00.000Z",
        },
      }),
    );
    expect(etat.toutPret).toBe(false);
    for (const c of etat.controles.filter((x) => !x.ok)) {
      expect(Boolean(c.etape) || Boolean(c.lien)).toBe(true);
    }
    // Le défaut de configuration touche les quatre familles à la fois.
    expect(etat.controles.filter((c) => !c.ok).map((c) => c.cle)).toEqual([
      "defi",
      "lot-gagnant",
      "poids",
      "qr",
      "fenetre",
    ]);
  });

  it("les clés de contrôle sont uniques", () => {
    const cles = construireVerification(entree()).controles.map((c) => c.cle);
    expect(new Set(cles).size).toBe(cles.length);
  });
});
