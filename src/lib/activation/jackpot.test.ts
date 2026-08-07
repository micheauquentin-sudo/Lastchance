import { describe, expect, it } from "vitest";
import {
  blocageActivationJackpot,
  construireActivationJackpot,
  type EntreeActivationJackpot,
} from "@/lib/activation/jackpot";

const MAINTENANT = new Date("2026-08-07T12:00:00.000Z");

function campagne(
  patch: Partial<EntreeActivationJackpot> = {},
): EntreeActivationJackpot {
  return {
    draw_mode: "threshold_draw",
    threshold: 50,
    draw_at: null,
    reward_stock: 3,
    reward_label: "Un magnum de champagne",
    status: "draft",
    validation_mode: "rotating_code",
    public_slug: "la-cagnotte",
    code_ttl_days: 30,
    now: MAINTENANT,
    ...patch,
  };
}

describe("blocageActivationJackpot — miroir exact du refus serveur", () => {
  it("laisse passer une campagne complète", () => {
    expect(blocageActivationJackpot(campagne(), MAINTENANT)).toBeNull();
  });

  it("refuse un lot vide, et AVANT tout autre motif", () => {
    // Deux motifs présents : c'est le lot qui doit être nommé, comme le
    // faisait la fonction privée de l'action. L'ordre est le message.
    const refus = blocageActivationJackpot(
      campagne({ reward_label: "   ", reward_stock: 0 }),
      MAINTENANT,
    );
    expect(refus).toBe("Renseignez le lot avant d'activer la campagne.");
  });

  it("refuse un stock nul (0 = en pause)", () => {
    expect(blocageActivationJackpot(campagne({ reward_stock: 0 }), MAINTENANT)).toBe(
      "Indiquez un stock d'au moins 1 lot avant d'activer (0 = en pause).",
    );
  });

  it("refuse un objectif inférieur à 1", () => {
    expect(blocageActivationJackpot(campagne({ threshold: 0 }), MAINTENANT)).toBe(
      "L'objectif de la jauge doit valoir au moins 1.",
    );
  });

  it("refuse le mode « Tirage à date » sans date, ou avec une date passée", () => {
    const attendu =
      "Planifiez le tirage à une date et heure futures avant d'activer.";
    expect(
      blocageActivationJackpot(campagne({ draw_mode: "date_draw" }), MAINTENANT),
    ).toBe(attendu);
    expect(
      blocageActivationJackpot(
        campagne({ draw_mode: "date_draw", draw_at: "2026-08-07T11:59:00.000Z" }),
        MAINTENANT,
      ),
    ).toBe(attendu);
  });

  it("accepte une date future en mode « Tirage à date »", () => {
    expect(
      blocageActivationJackpot(
        campagne({ draw_mode: "date_draw", draw_at: "2026-09-01T18:00:00.000Z" }),
        MAINTENANT,
      ),
    ).toBeNull();
  });

  it("ignore la date hors du mode « Tirage à date »", () => {
    expect(
      blocageActivationJackpot(
        campagne({ draw_mode: "rescan_win", draw_at: "2020-01-01T00:00:00.000Z" }),
        MAINTENANT,
      ),
    ).toBeNull();
  });
});

describe("construireActivationJackpot", () => {
  it("est d'accord avec le serveur : toutPret ⟺ aucun blocage", () => {
    // LA propriété qui justifie l'extraction. Une checklist verte qui mène à
    // un refus serveur (ou l'inverse) est précisément le défaut que ce module
    // ferme — elle est donc vérifiée sur chaque motif, un par un.
    const cas: Partial<EntreeActivationJackpot>[] = [
      {},
      { reward_label: "" },
      { reward_stock: 0 },
      { threshold: 0 },
      { draw_mode: "date_draw" },
      { draw_mode: "date_draw", draw_at: "2026-09-01T18:00:00.000Z" },
      { public_slug: null },
    ];
    for (const patch of cas) {
      const etat = construireActivationJackpot(campagne(patch));
      expect(etat.toutPret).toBe(etat.blocage === null);
    }
  });

  it("l'adresse publique manquante ne bloque RIEN — elle est racontée", () => {
    const etat = construireActivationJackpot(campagne({ public_slug: null }));
    const url = etat.controles.find((c) => c.cle === "url")!;
    expect(url.ok).toBe(false);
    expect(url.bloquant).toBe(false);
    expect(etat.toutPret).toBe(true);
    expect(url.detail).toContain("AVANT d'imprimer");
  });

  it("nomme le lot quand il existe, et renvoie sur l'étape des réglages", () => {
    const lot = construireActivationJackpot(campagne()).controles.find(
      (c) => c.cle === "lot",
    )!;
    expect(lot.ok).toBe(true);
    expect(lot.detail).toContain("Un magnum de champagne");
    expect(lot.etape).toBe("reglages");
  });

  it("dit le mode de tirage même quand rien ne cloche", () => {
    const rescan = construireActivationJackpot(
      campagne({ draw_mode: "rescan_win" }),
    ).controles.find((c) => c.cle === "tirage")!;
    expect(rescan.ok).toBe(true);
    expect(rescan.detail).toContain("rescan");
  });

  it("rappelle l'échéance du code selon qu'elle est posée ou non", () => {
    expect(
      construireActivationJackpot(campagne({ code_ttl_days: null })).rappels.join(" "),
    ).toContain("pas de date limite");
    expect(
      construireActivationJackpot(campagne({ code_ttl_days: 7 })).rappels.join(" "),
    ).toContain("7 jours");
  });

  it("rappelle l'écran comptoir en mode code tournant seulement", () => {
    expect(
      construireActivationJackpot(campagne()).rappels.join(" "),
    ).toContain("Code au comptoir");
    expect(
      construireActivationJackpot(campagne({ validation_mode: "staff" })).rappels.join(" "),
    ).toContain("Validation en caisse");
  });
});
