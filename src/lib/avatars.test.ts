// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  AVATAR_IDS,
  avatarLabel,
  coerceAvatarId,
  DEFAULT_AVATAR,
  isAvatarId,
} from "./avatars";

describe("avatars", () => {
  it("le catalogue est non vide et l'avatar par défaut en fait partie", () => {
    expect(AVATAR_IDS.length).toBeGreaterThanOrEqual(8);
    expect(AVATAR_IDS).toContain(DEFAULT_AVATAR);
  });

  it("des clés uniquement en minuscules ascii (contrainte SQL ^[a-z]{1,20}$)", () => {
    for (const id of AVATAR_IDS) {
      expect(id).toMatch(/^[a-z]{1,20}$/);
    }
    expect(new Set(AVATAR_IDS).size).toBe(AVATAR_IDS.length);
  });

  it("isAvatarId distingue le catalogue du reste", () => {
    expect(isAvatarId(AVATAR_IDS[0])).toBe(true);
    expect(isAvatarId("inconnu")).toBe(false);
    expect(isAvatarId("")).toBe(false);
  });

  it("coerceAvatarId retombe sur le défaut pour une valeur invalide", () => {
    expect(coerceAvatarId(AVATAR_IDS[1])).toBe(AVATAR_IDS[1]);
    expect(coerceAvatarId("")).toBe(DEFAULT_AVATAR);
    expect(coerceAvatarId(null)).toBe(DEFAULT_AVATAR);
    expect(coerceAvatarId("<script>")).toBe(DEFAULT_AVATAR);
  });

  it("chaque avatar a un libellé lisible", () => {
    for (const id of AVATAR_IDS) {
      expect(avatarLabel(id).length).toBeGreaterThan(0);
    }
  });
});
