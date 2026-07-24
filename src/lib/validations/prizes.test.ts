// @vitest-environment node
import { describe, expect, it } from "vitest";
import { updateWheelSchema } from "./prizes";

// ────────────────────────────────────────────────────────────
// updateWheelSchema — play_limit BORNÉ pour les jeux à SECRET serveur
//
// Sous `play_limit = unlimited`, la garde `limit_reached` de perform_atomic_spin
// est inactive : un jeton de défi réutilisable laisserait rejouer la même
// tentative en variant la réponse pour extraire le secret par force brute. Le
// schéma REFUSE donc `unlimited` pour mystery_word / estimate / puzzle, et le
// tolère pour tous les autres jeux (roue, révélation, rps/reflex/gauge).
// ────────────────────────────────────────────────────────────

const WHEEL_ID = "11111111-1111-4111-8111-111111111111";
const base = { id: WHEEL_ID, play_limit: "unlimited", skill_config: "" };

const SECRET_GAMES = ["mystery_word", "estimate", "puzzle"] as const;
const OTHER_GAMES = [
  "wheel",
  "scratch",
  "flip_card",
  "rps",
  "reflex",
  "gauge",
] as const;

describe("updateWheelSchema — jeux à secret serveur", () => {
  it.each(SECRET_GAMES)(
    "refuse play_limit=unlimited pour %s avec un message clair",
    (gameType) => {
      const result = updateWheelSchema.safeParse({ ...base, game_type: gameType });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toContain("limite de participation");
      }
    },
  );

  it.each(SECRET_GAMES)("tolère une limite bornée (daily) pour %s", (gameType) => {
    const result = updateWheelSchema.safeParse({
      ...base,
      play_limit: "daily",
      game_type: gameType,
    });
    expect(result.success).toBe(true);
  });

  it.each(OTHER_GAMES)("tolère play_limit=unlimited pour %s", (gameType) => {
    const result = updateWheelSchema.safeParse({ ...base, game_type: gameType });
    expect(result.success).toBe(true);
  });
});
