// @vitest-environment node
import { describe, expect, it } from "vitest";
import { updateWheelSchema } from "./prizes";

// ────────────────────────────────────────────────────────────
// updateWheelSchema — play_limit BORNÉ pour les jeux à SECRET serveur
//
// Sous `play_limit = unlimited`, la garde `limit_reached` de perform_atomic_spin
// est inactive : un jeton de défi réutilisable laisserait rejouer la même
// tentative en variant la réponse pour extraire le secret par force brute. Le
// schéma REFUSE donc `unlimited` pour mystery_word / estimate / puzzle.
//
// Il le refuse AUSSI pour reflex / gauge, mais pour une raison DIFFÉRENTE :
// ces deux-là n'ont aucun secret (le joueur doit voir la fenêtre de réaction et
// la zone verte pour jouer), donc leur issue est rapportée par l'appareil du
// joueur et forgeable par construction. Ce qui la borne est la limite de
// participation ; sous `unlimited` la porte de compétence devient décorative.
// Le message d'erreur est distinct — les deux tests le vérifient.
//
// `unlimited` reste toléré partout ailleurs (roue, révélation, rps — dont le
// coup serveur, lui, EST vérifiable).
// ────────────────────────────────────────────────────────────

const WHEEL_ID = "11111111-1111-4111-8111-111111111111";
const base = { id: WHEEL_ID, play_limit: "unlimited", skill_config: "" };

const SECRET_GAMES = ["mystery_word", "estimate", "puzzle"] as const;
const CLIENT_REPORTED_GAMES = ["reflex", "gauge"] as const;
const OTHER_GAMES = ["wheel", "scratch", "flip_card", "rps"] as const;

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

describe("updateWheelSchema — défis évalués par l'appareil du joueur", () => {
  it.each(CLIENT_REPORTED_GAMES)(
    "refuse play_limit=unlimited pour %s",
    (gameType) => {
      const result = updateWheelSchema.safeParse({
        ...base,
        game_type: gameType,
        skill_config:
          gameType === "reflex"
            ? '{"durationMs":800}'
            : '{"tolerancePct":10}',
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].path).toEqual(["play_limit"]);
        expect(result.error.issues[0].message).toContain("appareil du joueur");
      }
    },
  );

  // CONTRE-ÉPREUVE : sans elle, le test ci-dessus passerait aussi sur une
  // validation cassée qui refuserait reflex/gauge en toutes circonstances.
  it.each(CLIENT_REPORTED_GAMES)(
    "accepte play_limit=daily pour %s",
    (gameType) => {
      const result = updateWheelSchema.safeParse({
        ...base,
        play_limit: "daily",
        game_type: gameType,
        skill_config:
          gameType === "reflex"
            ? '{"durationMs":800}'
            : '{"tolerancePct":10}',
      });
      expect(result.success).toBe(true);
    },
  );

  // Le message doit RESTER distinct de celui des jeux à secret : les deux
  // interdictions ont la même conséquence mais des raisons différentes, et
  // c'est leur fusion qui avait fait oublier reflex/gauge.
  it("porte un message distinct de celui des jeux à secret", () => {
    const reflex = updateWheelSchema.safeParse({ ...base, game_type: "reflex" });
    const secret = updateWheelSchema.safeParse({
      ...base,
      game_type: "mystery_word",
    });
    expect(reflex.success).toBe(false);
    expect(secret.success).toBe(false);
    if (!reflex.success && !secret.success) {
      expect(reflex.error.issues[0].message).not.toBe(
        secret.error.issues[0].message,
      );
    }
  });
});
