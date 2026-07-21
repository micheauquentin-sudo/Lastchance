// @vitest-environment node
import { describe, expect, it } from "vitest";
import { groupContestsByLeague, hasPendingResults } from "./contest-sync";

const NOW = new Date("2026-07-19T22:00:00Z");

describe("groupContestsByLeague", () => {
  it("regroupe par ligue fournisseur (une paire d'appels par ligue)", () => {
    const groups = groupContestsByLeague([
      { id: "a", competition_key: "ligue1" },
      { id: "b", competition_key: "ligue1" },
      { id: "c", competition_key: "ldc" },
    ]);
    // ligue1 → 4334, ldc → 4480 (catalogue src/lib/competitions.ts)
    expect(groups.get("4334")?.map((c) => c.id)).toEqual(["a", "b"]);
    expect(groups.get("4480")?.map((c) => c.id)).toEqual(["c"]);
    expect(groups.size).toBe(2);
  });

  it("ignore les compétitions manuelles ou inconnues du catalogue", () => {
    const groups = groupContestsByLeague([
      { id: "a", competition_key: "custom" },
      { id: "b", competition_key: "roland-garros" },
      { id: "c", competition_key: "n-existe-pas" },
    ]);
    expect(groups.size).toBe(0);
  });

  it("liste vide → aucun groupe", () => {
    expect(groupContestsByLeague([]).size).toBe(0);
  });
});

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
