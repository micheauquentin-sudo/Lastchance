// @vitest-environment node
import { describe, expect, it } from "vitest";
import { hasPendingResults } from "./contest-sync";

const NOW = new Date("2026-07-19T22:00:00Z");

describe("hasPendingResults", () => {
  it("vrai quand un match « scheduled » a débuté il y a plus d'une durée de match", () => {
    expect(
      hasPendingResults(
        [{ status: "scheduled", kickoff_at: "2026-07-19T20:00:00Z" }],
        NOW,
      ),
    ).toBe(true);
  });

  it("faux pendant le match (résultat pas encore attendu)", () => {
    expect(
      hasPendingResults(
        [{ status: "scheduled", kickoff_at: "2026-07-19T21:00:00Z" }],
        NOW,
      ),
    ).toBe(false);
  });

  it("faux pour un match futur ou déjà soldé", () => {
    expect(
      hasPendingResults(
        [
          { status: "scheduled", kickoff_at: "2026-07-20T20:00:00Z" },
          { status: "finished", kickoff_at: "2026-07-19T18:00:00Z" },
        ],
        NOW,
      ),
    ).toBe(false);
  });

  it("faux sur une liste vide", () => {
    expect(hasPendingResults([], NOW)).toBe(false);
  });
});
