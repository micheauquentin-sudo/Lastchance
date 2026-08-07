import { describe, expect, it } from "vitest";
import {
  construireVerificationChasse,
  type EntreeVerificationChasse,
} from "@/components/dashboard/atelier-hunt-verification-state";

const MAINTENANT = new Date("2026-08-07T12:00:00.000Z");

function entree(
  partiel: Partial<EntreeVerificationChasse> = {},
): EntreeVerificationChasse {
  return {
    huntId: "hunt-1",
    rewardLabel: "Un dessert offert",
    rewardStock: null,
    rewardClaimedCount: 0,
    stepCount: 3,
    endsAt: null,
    now: MAINTENANT,
    ...partiel,
  };
}

function controle(
  etat: ReturnType<typeof construireVerificationChasse>,
  cle: string,
) {
  const trouve = etat.controles.find((c) => c.cle === cle);
  if (!trouve) throw new Error(`contrôle « ${cle} » absent`);
  return trouve;
}

describe("construireVerificationChasse — le cas nominal", () => {
  it("déclare tout prêt et vise l'unique écran qui publie", () => {
    const etat = construireVerificationChasse(entree());
    expect(etat.toutPret).toBe(true);
    expect(etat.controles.every((c) => c.ok)).toBe(true);
    expect(etat.ctaHref).toBe("/dashboard/hunts/hunt-1#statut");
  });

  it("rend les quatre points, chacun rattaché à l'étape qui le corrige", () => {
    const etat = construireVerificationChasse(entree());
    expect(etat.controles.map((c) => c.cle)).toEqual([
      "parcours",
      "lot",
      "stock",
      "fenetre",
    ]);
    expect(controle(etat, "parcours").etape).toBe("parcours");
    expect(controle(etat, "lot").etape).toBe("chasse");
    expect(controle(etat, "stock").etape).toBe("chasse");
    expect(controle(etat, "fenetre").etape).toBe("chasse");
  });
});

describe("les deux points que le SERVEUR refuse déjà", () => {
  it("signale un parcours trop court sans jamais l'inventer", () => {
    const etat = construireVerificationChasse(entree({ stepCount: 1 }));
    expect(controle(etat, "parcours").ok).toBe(false);
    expect(controle(etat, "parcours").detail).toContain("1 étape");
    expect(etat.toutPret).toBe(false);
  });

  it("signale un lot final vide, y compris fait d'espaces", () => {
    expect(
      controle(construireVerificationChasse(entree({ rewardLabel: "" })), "lot").ok,
    ).toBe(false);
    expect(
      controle(construireVerificationChasse(entree({ rewardLabel: "  " })), "lot")
        .ok,
    ).toBe(false);
  });

  it("cite le lot au commerçant quand il est renseigné", () => {
    expect(controle(construireVerificationChasse(entree()), "lot").detail).toContain(
      "Un dessert offert",
    );
  });
});

describe("le stock — FACULTATIF sur une chasse, contrairement au passeport", () => {
  it("tient un stock vide pour illimité, et le DIT", () => {
    const point = controle(
      construireVerificationChasse(entree({ rewardStock: null })),
      "stock",
    );
    expect(point.ok).toBe(true);
    expect(point.detail).toContain("illimité");
  });

  it("compte le restant sur le stock, pas sur le stock initial seul", () => {
    const point = controle(
      construireVerificationChasse(
        entree({ rewardStock: 10, rewardClaimedCount: 4 }),
      ),
      "stock",
    );
    expect(point.ok).toBe(true);
    expect(point.detail).toContain("6 lots");
  });

  it("refuse un stock épuisé — ce que le serveur laisse passer sans un mot", () => {
    const etat = construireVerificationChasse(
      entree({ rewardStock: 10, rewardClaimedCount: 10 }),
    );
    expect(controle(etat, "stock").ok).toBe(false);
    expect(etat.toutPret).toBe(false);
  });

  it("ne s'affole pas d'un compteur au-delà du stock (le restant reste borné à 0)", () => {
    const point = controle(
      construireVerificationChasse(
        entree({ rewardStock: 3, rewardClaimedCount: 9 }),
      ),
      "stock",
    );
    expect(point.ok).toBe(false);
    expect(point.detail).not.toContain("-6");
  });
});

describe("la fenêtre de jeu", () => {
  it("laisse passer une chasse sans date de fin", () => {
    expect(
      controle(construireVerificationChasse(entree({ endsAt: null })), "fenetre").ok,
    ).toBe(true);
  });

  it("laisse passer une date de fin à venir", () => {
    expect(
      controle(
        construireVerificationChasse(
          entree({ endsAt: "2026-08-08T12:00:00.000Z" }),
        ),
        "fenetre",
      ).ok,
    ).toBe(true);
  });

  it("refuse une date de fin déjà passée", () => {
    const point = controle(
      construireVerificationChasse(entree({ endsAt: "2026-08-06T12:00:00.000Z" })),
      "fenetre",
    );
    expect(point.ok).toBe(false);
    expect(point.detail).toContain("indisponibles");
  });

  it("traite l'instant EXACT de la fin comme passé — la chasse n'est plus jouable", () => {
    expect(
      controle(
        construireVerificationChasse(
          entree({ endsAt: MAINTENANT.toISOString() }),
        ),
        "fenetre",
      ).ok,
    ).toBe(false);
  });
});
