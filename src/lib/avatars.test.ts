// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  ANIMAL_AVATAR_IDS,
  AVATAR_GROUPS,
  AVATAR_IDS,
  avatarLabel,
  coerceAvatarId,
  DEFAULT_AVATAR,
  FLAG_AVATAR_IDS,
  isAvatarId,
} from "./avatars";

describe("avatars", () => {
  it("le catalogue compte 12 animaux + 30 nations et contient le défaut", () => {
    expect(ANIMAL_AVATAR_IDS).toHaveLength(12);
    expect(FLAG_AVATAR_IDS).toHaveLength(30);
    expect(AVATAR_IDS).toHaveLength(42);
    expect(AVATAR_IDS).toContain(DEFAULT_AVATAR);
  });

  it("des clés uniquement en minuscules ascii (contrainte SQL ^[a-z]{1,20}$)", () => {
    for (const id of AVATAR_IDS) {
      expect(id).toMatch(/^[a-z]{1,20}$/);
    }
    expect(new Set(AVATAR_IDS).size).toBe(AVATAR_IDS.length);
  });

  it("les groupes du sélecteur partitionnent exactement le catalogue", () => {
    const union = AVATAR_GROUPS.flatMap((g) => [...g.ids]);
    expect(new Set(union).size).toBe(union.length);
    expect([...union].sort()).toEqual([...AVATAR_IDS].sort());
  });

  it("isAvatarId distingue le catalogue du reste", () => {
    expect(isAvatarId(AVATAR_IDS[0])).toBe(true);
    expect(isAvatarId("france")).toBe(true);
    expect(isAvatarId("inconnu")).toBe(false);
    expect(isAvatarId("")).toBe(false);
  });

  it("coerceAvatarId retombe sur le défaut pour une valeur invalide", () => {
    expect(coerceAvatarId(AVATAR_IDS[1])).toBe(AVATAR_IDS[1]);
    expect(coerceAvatarId("bresil")).toBe("bresil");
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
