import { describe, expect, it } from "vitest";
import {
  campaignDisplayStatus,
  campaignWindowState,
  repriseBudgetRequise,
  repriseGeneriqueImpossible,
} from "@/lib/campaign-window";

const NOW = new Date("2026-07-31T12:00:00.000Z");
const PASSE = "2026-07-30T12:00:00.000Z";
const FUTUR = "2026-08-30T12:00:00.000Z";

describe("campaignWindowState", () => {
  it("rend open sans aucune borne", () => {
    expect(campaignWindowState({ starts_at: null, ends_at: null }, NOW)).toBe(
      "open",
    );
  });

  it("rend open dans la fenêtre", () => {
    expect(
      campaignWindowState({ starts_at: PASSE, ends_at: FUTUR }, NOW),
    ).toBe("open");
  });

  it("rend ended dès que la date de fin est passée", () => {
    expect(campaignWindowState({ starts_at: PASSE, ends_at: PASSE }, NOW)).toBe(
      "ended",
    );
  });

  it("rend scheduled avant la date de début", () => {
    expect(campaignWindowState({ starts_at: FUTUR, ends_at: null }, NOW)).toBe(
      "scheduled",
    );
  });

  it("privilégie scheduled sur des dates incohérentes, comme /play", () => {
    expect(campaignWindowState({ starts_at: FUTUR, ends_at: PASSE }, NOW)).toBe(
      "scheduled",
    );
  });

  it("laisse open une date illisible (NaN), comportement historique", () => {
    expect(campaignWindowState({ ends_at: "pas-une-date" }, NOW)).toBe("open");
  });

  it("est strict aux bornes exactes (ni terminée ni programmée à la seconde pile)", () => {
    const t = NOW.toISOString();
    expect(campaignWindowState({ starts_at: t, ends_at: t }, NOW)).toBe("open");
  });
});

describe("campaignDisplayStatus", () => {
  it("dérive Terminée/Programmée d'une campagne active hors fenêtre", () => {
    expect(campaignDisplayStatus("active", "ended")).toBe("ended");
    expect(campaignDisplayStatus("active", "scheduled")).toBe("scheduled");
    expect(campaignDisplayStatus("active", "open")).toBe("active");
  });

  it("ne touche jamais aux états décidés par le commerçant", () => {
    for (const status of ["draft", "paused", "archived"] as const) {
      for (const w of ["open", "ended", "scheduled"] as const) {
        expect(campaignDisplayStatus(status, w)).toBe(status);
      }
    }
  });
});

describe("repriseBudgetRequise — la table de cas complète", () => {
  const base = {
    status: "paused",
    paused_reason: "budget_reached",
    budget_cents: 20_000,
    budget_spent_cents: 30_000,
  };

  it("pause budget avec plafond TOUJOURS dépassé : la reprise générique est un cul-de-sac", () => {
    expect(repriseBudgetRequise(base)).toBe(true);
    // Exactement au plafond compte aussi : c'est le seuil qui a DÉCLENCHÉ la
    // pause (`>=`), pas un cran au-dessus.
    expect(repriseBudgetRequise({ ...base, budget_spent_cents: 20_000 })).toBe(
      true,
    );
  });

  it("plafond RELEVÉ : le motif n'est plus qu'un résidu, la reprise redevient offerte", () => {
    // Le cas qui interdit d'écrire la garde sur le seul `paused_reason`. Le
    // commerçant vient de faire ce qu'on lui demandait ; refuser ici
    // l'enfermerait dans une pause qu'il a déjà réparée.
    expect(repriseBudgetRequise({ ...base, budget_cents: 50_000 })).toBe(false);
  });

  it("plafond RETIRÉ : plus rien ne peut se dépasser", () => {
    expect(repriseBudgetRequise({ ...base, budget_cents: null })).toBe(false);
  });

  it("les autres motifs de pause ne sont pas concernés", () => {
    for (const motif of ["schedule_end", "droit_expire", null]) {
      expect(repriseBudgetRequise({ ...base, paused_reason: motif })).toBe(
        false,
      );
    }
  });

  it("hors pause, la question ne se pose pas", () => {
    for (const status of ["draft", "active", "archived"]) {
      expect(repriseBudgetRequise({ ...base, status })).toBe(false);
    }
  });
});

describe("repriseGeneriqueImpossible — ce qui masque le bouton", () => {
  it("couvre le budget non résorbé ET le droit expiré", () => {
    // `droit_expire` : la RPC refuserait via `assert_module_publish_allowed`,
    // et la bannière dit déjà qu'il n'y a rien à relancer à la main — le
    // planificateur réactive de lui-même. Le bouton ne peut produire qu'un
    // échec ; il n'a rien à faire à l'écran.
    expect(
      repriseGeneriqueImpossible({
        status: "paused",
        paused_reason: "droit_expire",
        budget_cents: null,
        budget_spent_cents: 0,
      }),
    ).toBe(true);
    expect(
      repriseGeneriqueImpossible({
        status: "paused",
        paused_reason: "budget_reached",
        budget_cents: 20_000,
        budget_spent_cents: 30_000,
      }),
    ).toBe(true);
  });

  it("une pause MANUELLE ou de fin de programmation garde son bouton", () => {
    // CONTRÔLE DE NON-VACUITÉ. Sans lui, un prédicat toujours vrai passerait
    // les deux assertions ci-dessus, et « Rouvrir aux joueurs » disparaîtrait
    // du seul cas où il sert vraiment.
    for (const motif of [null, "schedule_end"]) {
      expect(
        repriseGeneriqueImpossible({
          status: "paused",
          paused_reason: motif,
          budget_cents: null,
          budget_spent_cents: 0,
        }),
      ).toBe(false);
    }
  });
});
