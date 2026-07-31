import { describe, expect, it } from "vitest";
import {
  campaignDisplayStatus,
  campaignWindowState,
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
