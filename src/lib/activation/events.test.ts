import { describe, expect, it } from "vitest";
import {
  blocageActivationEvent,
  construireActivationEvent,
  type EntreeActivationEvent,
  type SalleActivation,
} from "@/lib/activation/events";

function salle(patch: Partial<SalleActivation> = {}): SalleActivation {
  return {
    label: "Soirée du 12 juillet",
    joinCode: "ABCD12",
    rewardLabel: "Une tournée offerte",
    rewardStock: 3,
    codeTtlDays: 30,
    ...patch,
  };
}

function jeu(patch: Partial<EntreeActivationEvent> = {}): EntreeActivationEvent {
  return {
    nombreQuestions: 5,
    status: "active",
    salles: [salle()],
    ...patch,
  };
}

describe("blocageActivationEvent — miroir exact du refus serveur", () => {
  it("laisse passer un jeu qui porte au moins une question", () => {
    expect(blocageActivationEvent({ nombreQuestions: 1 })).toBeNull();
  });

  it("refuse un jeu sans question, avec la phrase du serveur", () => {
    expect(blocageActivationEvent({ nombreQuestions: 0 })).toBe(
      "Ajoutez au moins une question avant d'activer le jeu.",
    );
  });
});

describe("construireActivationEvent", () => {
  it("est d'accord avec le serveur : toutPret ⟺ aucun blocage", () => {
    for (const patch of [
      {},
      { nombreQuestions: 0 },
      { salles: [] },
      { salles: [salle({ rewardStock: 0 })] },
      { status: "draft" },
    ] as Partial<EntreeActivationEvent>[]) {
      const etat = construireActivationEvent(jeu(patch));
      expect(etat.toutPret).toBe(etat.blocage === null);
    }
  });

  it("une salle sans lot ne bloque pas, mais est NOMMÉE", () => {
    const etat = construireActivationEvent(
      jeu({
        salles: [
          salle(),
          salle({ label: "Salle B", rewardStock: 0 }),
          salle({ label: null, joinCode: "ZZZZ99", rewardLabel: "  " }),
        ],
      }),
    );
    const stock = etat.controles.find((c) => c.cle === "stock")!;
    expect(stock.ok).toBe(false);
    expect(stock.bloquant).toBe(false);
    expect(stock.detail).toContain("Salle B");
    // Sans étiquette, la salle est désignée par son code d'accès — celui qu'on
    // lit à voix haute en salle, jamais l'UUID.
    expect(stock.detail).toContain("Session ZZZZ99");
    expect(etat.toutPret).toBe(true);
  });

  it("sans aucune salle, le contrôle de stock n'accuse personne", () => {
    const etat = construireActivationEvent(jeu({ salles: [] }));
    expect(etat.controles.find((c) => c.cle === "salle")!.ok).toBe(false);
    expect(etat.controles.find((c) => c.cle === "stock")!.detail).toContain(
      "Rien à vérifier",
    );
  });

  it("compte les manches et renvoie sur l'étape qui les corrige", () => {
    const vide = construireActivationEvent(jeu({ nombreQuestions: 0 }));
    const controle = vide.controles.find((c) => c.cle === "questions")!;
    expect(controle.ok).toBe(false);
    expect(controle.bloquant).toBe(true);
    expect(controle.etape).toBe("manches");
    expect(vide.toutPret).toBe(false);
  });

  it("dit que le jeu fermé empêche de piloter, sans le compter comme un manque", () => {
    const etat = construireActivationEvent(jeu({ status: "draft" }));
    const actif = etat.controles.find((c) => c.cle === "actif")!;
    expect(actif.ok).toBe(false);
    expect(actif.bloquant).toBe(false);
    expect(etat.toutPret).toBe(true);
  });

  it("nomme les salles dont le code EVENT- n'a pas d'échéance", () => {
    const etat = construireActivationEvent(
      jeu({ salles: [salle(), salle({ label: "Salle C", codeTtlDays: null })] }),
    );
    expect(etat.rappels.join(" ")).toContain("Salle C");
  });
});
