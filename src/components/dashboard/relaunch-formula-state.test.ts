import { describe, expect, it } from "vitest";
import { getRelaunchFormulaState } from "@/components/dashboard/relaunch-formula-state";

describe("getRelaunchFormulaState", () => {
  it("décrit une relance éligible sans créer ni promettre de brouillon", () => {
    expect(
      getRelaunchFormulaState({
        sourceState: "completed",
        canCreateDraft: true,
        isSupported: true,
      }),
    ).toEqual({
      kind: "eligible",
      copiedItems: ["La structure et les réglages compatibles"],
      reviewItems: [
        "Le nom et les dates",
        "Les lots et les stocks",
        "Les contenus",
        "Le QR et la diffusion",
      ],
      notCopiedItems: [
        "Les participants",
        "Les gains et les codes",
        "Les scans",
        "L'historique et les données joueur",
      ],
    });
  });

  it("refuse une animation qui n'est pas terminée", () => {
    expect(
      getRelaunchFormulaState({
        sourceState: "not_completed",
        canCreateDraft: true,
        isSupported: true,
      }),
    ).toMatchObject({ kind: "blocked" });
  });

  it("refuse la relance à un rôle qui ne peut pas créer de brouillon", () => {
    expect(
      getRelaunchFormulaState({
        sourceState: "completed",
        canCreateDraft: false,
        isSupported: true,
      }),
    ).toMatchObject({ kind: "blocked" });
  });

  it("refuse un type d'animation que l'éditeur ne sait pas copier", () => {
    expect(
      getRelaunchFormulaState({
        sourceState: "completed",
        canCreateDraft: true,
        isSupported: false,
      }),
    ).toMatchObject({ kind: "blocked" });
  });

  it("refuse d'abord ce qui n'est pas copiable, avant même de regarder le rôle", () => {
    // Une formule non supportée reste non supportée quel que soit le rôle :
    // dire « demandez au propriétaire » enverrait le commerçant vers un
    // interlocuteur qui ne pourrait rien non plus.
    const state = getRelaunchFormulaState({
      sourceState: "not_completed",
      canCreateDraft: false,
      isSupported: false,
    });

    expect(state).toMatchObject({
      kind: "blocked",
      reason: "Cette formule ne peut pas encore être relancée en brouillon.",
    });
  });
});
