import { describe, expect, it } from "vitest";
import { cleanupErrorMessage, selectAuthCleanupCandidates } from "./merchant-deletion";

describe("selectAuthCleanupCandidates", () => {
  it("protège l'acteur et tous les comptes administrateurs", () => {
    expect(
      selectAuthCleanupCandidates(
        ["member", "actor", "admin", "member"],
        "actor",
        ["admin"],
      ),
    ).toEqual(["member"]);
  });
});

describe("cleanupErrorMessage", () => {
  it("normalise les erreurs retournées par Supabase", () => {
    expect(cleanupErrorMessage({ message: "storage failed" })).toBe("storage failed");
    expect(cleanupErrorMessage("bad")).toBe("Erreur inconnue");
  });
});
