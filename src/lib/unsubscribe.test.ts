import { describe, expect, it } from "vitest";
import { signUnsubscribeToken, verifyUnsubscribeToken } from "./unsubscribe";

describe("signUnsubscribeToken / verifyUnsubscribeToken", () => {
  it("round-trip : le jeton signé se vérifie et renvoie le bon id", () => {
    const id = "a1b2c3d4-0000-0000-0000-000000000000";
    const token = signUnsubscribeToken(id);
    expect(verifyUnsubscribeToken(token)).toBe(id);
  });

  it("rejette un jeton altéré (signature invalide)", () => {
    const token = signUnsubscribeToken("some-id");
    const tampered = token.slice(0, -1) + (token.endsWith("A") ? "B" : "A");
    expect(verifyUnsubscribeToken(tampered)).toBeNull();
  });

  it("rejette un jeton mal formé", () => {
    expect(verifyUnsubscribeToken("not-a-token")).toBeNull();
    expect(verifyUnsubscribeToken("")).toBeNull();
    expect(verifyUnsubscribeToken(".onlysig")).toBeNull();
  });

  it("n'expire jamais (pas de champ de temps dans le payload)", () => {
    const token = signUnsubscribeToken("stable-id");
    // Vérifié à nouveau plus tard sans dépendance au temps système.
    expect(verifyUnsubscribeToken(token)).toBe("stable-id");
  });
});
