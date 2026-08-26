import { describe, expect, it } from "vitest";
import {
  decideBlueprintActions,
  kindLabel,
  restorableVersions,
  starterKinds,
  type BlueprintDecisionInput,
} from "./experience-blueprint-state";

function input(overrides: Partial<BlueprintDecisionInput> = {}): BlueprintDecisionInput {
  return {
    latestVersion: 2,
    latestStatus: "published",
    publishedVersion: 2,
    compatibilityError: null,
    moduleActive: true,
    ...overrides,
  };
}

describe("restorableVersions", () => {
  it("ne propose rien tant qu'il n'existe qu'une version", () => {
    expect(restorableVersions(0)).toEqual([]);
    expect(restorableVersions(1)).toEqual([]);
  });

  it("exclut la version courante — la restaurer sur elle-même ne ferait rien", () => {
    expect(restorableVersions(4)).toEqual([3, 2, 1]);
  });

  it("ignore une valeur non entière plutôt que de produire une liste absurde", () => {
    expect(restorableVersions(2.5)).toEqual([]);
    expect(restorableVersions(Number.NaN)).toEqual([]);
  });
});

describe("starterKinds", () => {
  it("ne retient que les types qu'un adaptateur sait réellement appliquer", () => {
    const kinds = starterKinds();
    expect(kinds).toEqual(
      expect.arrayContaining(["quiz", "hunt", "calendar", "loyalty", "event", "pronostics"]),
    );
    // Explicitement non portables en V1 : proposer un modèle mènerait à un
    // refus du moteur au moment de l'application.
    expect(kinds).not.toContain("campaign");
    expect(kinds).not.toContain("jackpot");
    expect(kinds).not.toContain("referral");
  });
});

describe("kindLabel", () => {
  it("rend le libellé du catalogue", () => {
    expect(kindLabel("quiz")).toBe("Quiz");
    expect(kindLabel("hunt")).toBe("Chasse au QR");
  });
});

describe("decideBlueprintActions", () => {
  it("ne vise QUE la version publiée — jamais un brouillon", () => {
    expect(decideBlueprintActions(input()).applicableVersion).toBe(2);

    // Ce cas asserait l'inverse (« la dernière sinon », donc 5) et gravait un
    // DÉFAUT : `apply_experience_blueprint_version` filtre sur
    // `publication_status = 'published'` (20260805180000:56) et lève
    // « published blueprint version not found » sinon. Proposer « Appliquer »
    // sur un brouillon envoyait donc le commerçant vers une erreur que rien à
    // l'écran ne lui permettait de comprendre.
    const brouillonSeul = decideBlueprintActions(
      input({ publishedVersion: null, latestVersion: 5 }),
    );
    expect(brouillonSeul.applicableVersion).toBe(0);
    expect(brouillonSeul.canApply).toBe(false);
    expect(brouillonSeul.blockedReason).toBe("not_published");
  });

  it("ne propose de publier qu'un brouillon existant", () => {
    expect(decideBlueprintActions(input({ latestStatus: "draft" })).canPublish).toBe(true);
    expect(decideBlueprintActions(input({ latestStatus: "published" })).canPublish).toBe(
      false,
    );
    expect(
      decideBlueprintActions(input({ latestStatus: "draft", latestVersion: 0 })).canPublish,
    ).toBe(false);
  });

  it("refuse d'appliquer un modèle sans aucune version", () => {
    const decision = decideBlueprintActions(
      input({ latestVersion: 0, publishedVersion: null }),
    );
    expect(decision.canApply).toBe(false);
    expect(decision.blockedReason).toBe("no_version");
  });

  it("refuse d'appliquer une version que le moteur ne sait plus lire", () => {
    const decision = decideBlueprintActions(
      input({ compatibilityError: "Version de schéma 0 incompatible avec quiz." }),
    );
    expect(decision.canApply).toBe(false);
    expect(decision.blockedReason).toBe("incompatible");
  });

  it("refuse d'appliquer quand le module n'est pas dans l'abonnement", () => {
    const decision = decideBlueprintActions(input({ moduleActive: false }));
    expect(decision.canApply).toBe(false);
    expect(decision.blockedReason).toBe("module_inactive");
  });

  it("un modèle vide n'est pas signalé comme incompatible", () => {
    // Le motif affiché change ce qu'on demande au commerçant : réécrire le
    // contenu, ou simplement enregistrer une première version.
    const decision = decideBlueprintActions(
      input({ latestVersion: 0, publishedVersion: null, compatibilityError: "illisible" }),
    );
    expect(decision.blockedReason).toBe("no_version");
  });

  it("un module inactif ne masque pas une incompatibilité", () => {
    const decision = decideBlueprintActions(
      input({ compatibilityError: "illisible", moduleActive: false }),
    );
    expect(decision.blockedReason).toBe("incompatible");
  });
});
