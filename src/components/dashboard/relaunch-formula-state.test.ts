import { describe, expect, it } from "vitest";
import {
  getRelaunchFormulaState,
  relanceADeQuoiSAfficher,
} from "@/components/dashboard/relaunch-formula-state";

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

describe("relanceADeQuoiSAfficher", () => {
  // LE DÉFAUT QUI A MOTIVÉ CE VERDICT : la carte rendait `null` sur un
  // brouillon, mais l'enveloppe repliable des six pages détail restait posée —
  // titre, pastille, résumé et « + ». Le commerçant dépliait « Relancer la
  // formule » et trouvait un bloc vide.
  it("se tait sur une animation qui n'est pas terminée", () => {
    expect(
      relanceADeQuoiSAfficher({
        sourceState: "not_completed",
        canCreateDraft: true,
        isSupported: true,
      }),
    ).toBe(false);
  });

  it("se tait sur une formule que l'éditeur ne sait pas copier", () => {
    expect(
      relanceADeQuoiSAfficher({
        sourceState: "completed",
        canCreateDraft: true,
        isSupported: false,
      }),
    ).toBe(false);
  });

  it("parle dès que la relance est éligible", () => {
    expect(
      relanceADeQuoiSAfficher({
        sourceState: "completed",
        canCreateDraft: true,
        isSupported: true,
      }),
    ).toBe(true);
  });

  it("parle sur le refus de RÔLE : l'éditeur doit savoir pourquoi le bouton manque", () => {
    expect(
      relanceADeQuoiSAfficher({
        sourceState: "completed",
        canCreateDraft: false,
        isSupported: true,
      }),
    ).toBe(true);
  });

  // LA GARDE D'ACCORD, et c'est elle qui compte : le verdict et le rendu de la
  // carte doivent dire la même chose sur les HUIT combinaisons, sinon on
  // recrée le bloc vide ailleurs. Les deux conditions reproduites ici sont
  // celles que `RelaunchFormulaCard` portait en propre avant l'extraction.
  it("rend exactement le verdict que la carte appliquait", () => {
    for (const sourceState of ["completed", "not_completed"] as const) {
      for (const canCreateDraft of [true, false]) {
        for (const isSupported of [true, false]) {
          const input = { sourceState, canCreateDraft, isSupported };
          const state = getRelaunchFormulaState(input);
          const attendu = !(
            (state.kind === "blocked" && sourceState !== "completed") ||
            (state.kind === "blocked" && !isSupported)
          );
          expect(relanceADeQuoiSAfficher(input)).toBe(attendu);
        }
      }
    }
  });
});
