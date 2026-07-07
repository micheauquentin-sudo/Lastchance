import { describe, expect, it } from "vitest";
import { enabledEngagementActions } from "./engagement";

describe("enabledEngagementActions", () => {
  it("config vide ou absente → aucune action", () => {
    expect(enabledEngagementActions(null)).toEqual([]);
    expect(enabledEngagementActions({})).toEqual([]);
  });

  it("newsletter activée sans URL requise", () => {
    expect(
      enabledEngagementActions({ newsletter: { enabled: true } }),
    ).toEqual([{ action: "newsletter" }]);
  });

  it("action lien activée sans URL valide → ignorée", () => {
    expect(
      enabledEngagementActions({
        instagram: { enabled: true, url: "" },
        tiktok: { enabled: true, url: "http://tiktok.com/@x" },
      }),
    ).toEqual([]);
  });

  it("action lien activée avec URL https → proposée", () => {
    expect(
      enabledEngagementActions({
        google_review: { enabled: true, url: "https://g.page/r/x/review" },
        instagram: { enabled: false, url: "https://instagram.com/x" },
      }),
    ).toEqual([
      { action: "google_review", url: "https://g.page/r/x/review" },
    ]);
  });
});
