import { describe, expect, it } from "vitest";
import { mapJackpotParticipation } from "./jackpot";
import { normalizeJackpotCode } from "./utils";
import {
  createJackpotCampaignSchema,
  jackpotCheckinTokenSchema,
  jackpotRedeemCodeSchema,
  jackpotRotatingCodeSchema,
  participateJackpotSchema,
  updateJackpotCampaignSchema,
} from "./validations/jackpot";

const UUID = "00000000-0000-4000-8000-000000000001";

// ────────────────────────────────────────────────────────────
// mapJackpotParticipation — mapping du jsonb record_jackpot_participation
// ────────────────────────────────────────────────────────────

describe("mapJackpotParticipation", () => {
  const campaignJson = {
    id: UUID,
    name: "Jackpot Chez Marco",
    draw_mode: "threshold_draw",
    validation_mode: "rotating_code",
  };

  it("mappe une participation simple (recorded) sans gain", () => {
    const result = mapJackpotParticipation({
      state: "recorded",
      campaign: campaignJson,
      current_count: 42,
      threshold: 100,
      cycle: 3,
      is_new_player: false,
      is_winner: false,
      code: null,
      out_of_stock: false,
      armed: false,
      display_amount_cents: 5000 + 42 * 50,
      draw_at: null,
    });
    expect(result.state).toBe("recorded");
    expect(result.campaign).toEqual({
      id: UUID,
      name: "Jackpot Chez Marco",
      drawMode: "threshold_draw",
      validationMode: "rotating_code",
    });
    expect(result.currentCount).toBe(42);
    expect(result.threshold).toBe(100);
    expect(result.cycle).toBe(3);
    expect(result.isWinner).toBe(false);
    expect(result.code).toBeNull();
    expect(result.displayAmountCents).toBe(7100);
    expect(result.retryInSeconds).toBeNull();
  });

  it("mappe un gagnant (is_winner + code JACKPOT-…)", () => {
    const result = mapJackpotParticipation({
      state: "recorded",
      campaign: campaignJson,
      current_count: 0,
      threshold: 100,
      cycle: 4,
      is_new_player: true,
      is_winner: true,
      code: "JACKPOT-ABCD2345",
      out_of_stock: false,
      armed: false,
      display_amount_cents: 0,
      draw_at: null,
    });
    expect(result.isWinner).toBe(true);
    expect(result.code).toBe("JACKPOT-ABCD2345");
    expect(result.isNewPlayer).toBe(true);
    // Le cycle a été clôturé et la jauge remise à zéro par la RPC.
    expect(result.currentCount).toBe(0);
  });

  it("mappe un jackpot ARMÉ (rescan_win, seuil atteint sans gain instantané)", () => {
    const result = mapJackpotParticipation({
      state: "recorded",
      campaign: { ...campaignJson, draw_mode: "rescan_win" },
      current_count: 101,
      threshold: 100,
      cycle: 1,
      is_winner: false,
      code: null,
      armed: true,
      out_of_stock: false,
      display_amount_cents: 0,
      draw_at: null,
    });
    expect(result.armed).toBe(true);
    expect(result.campaign?.drawMode).toBe("rescan_win");
    expect(result.isWinner).toBe(false);
  });

  it("mappe une rupture de stock (out_of_stock : seuil atteint, aucun tirage)", () => {
    const result = mapJackpotParticipation({
      state: "recorded",
      campaign: campaignJson,
      current_count: 100,
      threshold: 100,
      cycle: 2,
      is_winner: false,
      code: null,
      out_of_stock: true,
      armed: false,
      display_amount_cents: 0,
      draw_at: null,
    });
    expect(result.outOfStock).toBe(true);
    expect(result.isWinner).toBe(false);
    expect(result.code).toBeNull();
  });

  it("mappe un cooldown (too_soon) avec retry et sans gain", () => {
    const result = mapJackpotParticipation({
      state: "too_soon",
      campaign: campaignJson,
      current_count: 10,
      threshold: 100,
      cycle: 1,
      is_new_player: false,
      armed: false,
      display_amount_cents: 1000,
      draw_at: null,
      retry_in_seconds: 120,
    });
    expect(result.state).toBe("too_soon");
    expect(result.retryInSeconds).toBe(120);
    expect(result.currentCount).toBe(10);
    expect(result.isWinner).toBe(false);
  });

  it("mappe date_draw (draw_at exposé)", () => {
    const result = mapJackpotParticipation({
      state: "recorded",
      campaign: { ...campaignJson, draw_mode: "date_draw" },
      current_count: 5,
      threshold: 100,
      cycle: 1,
      is_winner: false,
      code: null,
      out_of_stock: false,
      armed: false,
      display_amount_cents: 0,
      draw_at: "2026-08-01T18:00:00.000Z",
    });
    expect(result.campaign?.drawMode).toBe("date_draw");
    expect(result.drawAt).toBe("2026-08-01T18:00:00.000Z");
  });

  it("unavailable / invalid_code : aucun oracle (campaign null)", () => {
    for (const state of ["unavailable", "invalid_code"] as const) {
      const result = mapJackpotParticipation({ state });
      expect(result.state).toBe(state);
      expect(result.campaign).toBeNull();
      expect(result.isWinner).toBe(false);
      expect(result.code).toBeNull();
    }
  });

  it("jsonb non reconnu → défauts sûrs (unavailable)", () => {
    for (const raw of [null, undefined, 42, "nope", {}, { state: "bogus" }]) {
      const result = mapJackpotParticipation(raw);
      expect(result.state).toBe("unavailable");
      expect(result.campaign).toBeNull();
      expect(result.currentCount).toBe(0);
      expect(result.threshold).toBe(0);
      expect(result.isWinner).toBe(false);
      expect(result.armed).toBe(false);
      expect(result.outOfStock).toBe(false);
      expect(result.displayAmountCents).toBe(0);
    }
  });

  it("draw_mode / validation_mode inconnus → défauts sûrs", () => {
    const result = mapJackpotParticipation({
      state: "recorded",
      campaign: { id: UUID, name: "x", draw_mode: "???", validation_mode: "???" },
    });
    expect(result.campaign?.drawMode).toBe("threshold_draw");
    expect(result.campaign?.validationMode).toBe("staff");
  });
});

// ────────────────────────────────────────────────────────────
// normalizeJackpotCode — routage caisse (préfixe distinct JACKPOT-)
// ────────────────────────────────────────────────────────────

describe("normalizeJackpotCode", () => {
  it("normalise une saisie tolérante vers JACKPOT-XXXXXXXX", () => {
    for (const raw of ["jackpot abcd2345", "  JACKPOT-abcd2345 ", "jackpotabcd2345", "ABCD2345"]) {
      expect(normalizeJackpotCode(raw)).toBe("JACKPOT-ABCD2345");
    }
  });

  it("rejette les codes d'autres familles et les formes invalides", () => {
    expect(normalizeJackpotCode("GAIN-ABCD2345")).toBe("");
    expect(normalizeJackpotCode("CHASSE-ABCD2345")).toBe("");
    expect(normalizeJackpotCode("FIDELITE-ABCD2345")).toBe("");
    // Alphabet exclut I/O/0/1 et exige 8 caractères.
    expect(normalizeJackpotCode("JACKPOT-ABCI2345")).toBe("");
    expect(normalizeJackpotCode("JACKPOT-ABCD234")).toBe("");
    expect(normalizeJackpotCode("")).toBe("");
  });
});

// ────────────────────────────────────────────────────────────
// Schémas Zod — bornes miroir des CHECK SQL
// ────────────────────────────────────────────────────────────

describe("createJackpotCampaignSchema", () => {
  it("exige un nom non vide, borné à 80 caractères", () => {
    expect(createJackpotCampaignSchema.safeParse({ name: "" }).success).toBe(false);
    expect(createJackpotCampaignSchema.safeParse({ name: "x".repeat(81) }).success).toBe(false);
    const ok = createJackpotCampaignSchema.safeParse({ name: "  Jackpot d'été  " });
    expect(ok.success).toBe(true);
    if (ok.success) expect(ok.data.name).toBe("Jackpot d'été");
  });
});

describe("updateJackpotCampaignSchema", () => {
  const base = {
    id: UUID,
    name: "Jackpot Chez Marco",
    public_slug: "",
    validation_mode: "staff",
    rotating_period_seconds: 60,
    min_participation_interval_seconds: 86400,
    draw_mode: "threshold_draw",
    threshold: 100,
    win_probability: "",
    draw_at: "",
    reward_label: "Un magnum de champagne",
    reward_details: "",
    reward_stock: "1",
    display_base: "50",
    display_increment: "0,50",
    merchant_content: "",
  };
  const parse = (o: Record<string, unknown>) =>
    updateJackpotCampaignSchema.safeParse({ ...base, ...o });

  it("accepte une configuration threshold_draw cohérente", () => {
    const res = parse({});
    expect(res.success).toBe(true);
    if (res.success) {
      // Montants d'affichage convertis euros → centimes.
      expect(res.data.display_base).toBe(5000);
      expect(res.data.display_increment).toBe(50);
      expect(res.data.reward_stock).toBe(1);
      expect(res.data.public_slug).toBeNull();
    }
  });

  it("VERROU ÉCONOMIQUE : le stock est obligatoire (null refusé)", () => {
    const res = parse({ reward_stock: "" });
    expect(res.success).toBe(false);
    if (!res.success) {
      expect(res.error.issues[0].path).toContain("reward_stock");
    }
  });

  it("stock 0 admis (épuisé / en pause)", () => {
    expect(parse({ reward_stock: "0" }).success).toBe(true);
  });

  it("plancher de cooldown en mode code tournant : max(2·période, 300)", () => {
    // période 200 → plancher 400 ; 300 est refusé.
    expect(
      parse({
        validation_mode: "rotating_code",
        rotating_period_seconds: 200,
        min_participation_interval_seconds: 300,
      }).success,
    ).toBe(false);
    expect(
      parse({
        validation_mode: "rotating_code",
        rotating_period_seconds: 200,
        min_participation_interval_seconds: 400,
      }).success,
    ).toBe(true);
  });

  it("plancher de cooldown en mode caisse : 300 s", () => {
    expect(parse({ validation_mode: "staff", min_participation_interval_seconds: 200 }).success).toBe(
      false,
    );
    expect(parse({ validation_mode: "staff", min_participation_interval_seconds: 300 }).success).toBe(
      true,
    );
  });

  it("période de rotation bornée 15..300", () => {
    expect(parse({ rotating_period_seconds: 10 }).success).toBe(false);
    expect(parse({ rotating_period_seconds: 400 }).success).toBe(false);
  });

  it("date_draw : la date de tirage est obligatoire", () => {
    expect(parse({ draw_mode: "date_draw", draw_at: "" }).success).toBe(false);
    const ok = parse({ draw_mode: "date_draw", draw_at: "2026-08-01T18:00" });
    expect(ok.success).toBe(true);
    if (ok.success) expect(ok.data.draw_at).toBe(new Date("2026-08-01T18:00").toISOString());
  });

  it("rescan_win : probabilité dans ]0, 1] ('' = défaut)", () => {
    expect(parse({ draw_mode: "rescan_win", win_probability: "" }).success).toBe(true);
    expect(parse({ draw_mode: "rescan_win", win_probability: "0.05" }).success).toBe(true);
    expect(parse({ draw_mode: "rescan_win", win_probability: "1" }).success).toBe(true);
    expect(parse({ draw_mode: "rescan_win", win_probability: "0" }).success).toBe(false);
    expect(parse({ draw_mode: "rescan_win", win_probability: "1.5" }).success).toBe(false);
  });

  it("threshold >= 1", () => {
    expect(parse({ threshold: 0 }).success).toBe(false);
    expect(parse({ threshold: 1 }).success).toBe(true);
  });

  it("public_slug : forme ^[a-z0-9-]{3,64}$ ('' → null)", () => {
    expect(parse({ public_slug: "ok-slug-42" }).success).toBe(true);
    expect(parse({ public_slug: "ab" }).success).toBe(false); // trop court
    expect(parse({ public_slug: "Bad Slug!" }).success).toBe(false);
    const ok = parse({ public_slug: "MON-JACKPOT" });
    expect(ok.success).toBe(true);
    if (ok.success) expect(ok.data.public_slug).toBe("mon-jackpot"); // normalisé en minuscules
  });
});

describe("schémas du parcours public / caisse", () => {
  it("participateJackpotSchema : campaignId uuid, code optionnel 6 chiffres", () => {
    expect(participateJackpotSchema.safeParse({ campaignId: "nope" }).success).toBe(false);
    // Code absent : autorisé (mode staff public → RPC ferme sans oracle).
    const noCode = participateJackpotSchema.safeParse({ campaignId: UUID });
    expect(noCode.success).toBe(true);
    if (noCode.success) expect(noCode.data.code).toBeUndefined();
    // Chaîne vide → undefined (pas d'échec de validation).
    const empty = participateJackpotSchema.safeParse({ campaignId: UUID, code: "" });
    expect(empty.success).toBe(true);
    if (empty.success) expect(empty.data.code).toBeUndefined();
    // 6 chiffres OK, autres formes refusées.
    expect(participateJackpotSchema.safeParse({ campaignId: UUID, code: "123456" }).success).toBe(true);
    expect(participateJackpotSchema.safeParse({ campaignId: UUID, code: "12ab56" }).success).toBe(false);
  });

  it("jackpotRotatingCodeSchema : 6 chiffres exactement", () => {
    expect(jackpotRotatingCodeSchema.safeParse("123456").success).toBe(true);
    expect(jackpotRotatingCodeSchema.safeParse("12345").success).toBe(false);
    expect(jackpotRotatingCodeSchema.safeParse("1234567").success).toBe(false);
  });

  it("jackpotRedeemCodeSchema : JACKPOT-XXXXXXXX, casse tolérée", () => {
    expect(jackpotRedeemCodeSchema.safeParse("jackpot-abcd2345").success).toBe(true);
    expect(jackpotRedeemCodeSchema.safeParse("  JACKPOT-ABCD2345 ").success).toBe(true);
    expect(jackpotRedeemCodeSchema.safeParse("FIDELITE-ABCD2345").success).toBe(false);
    expect(jackpotRedeemCodeSchema.safeParse("JACKPOT-ABCI2345").success).toBe(false); // I interdit
  });

  it("jackpotCheckinTokenSchema : deux segments base64url, >= 24 caractères", () => {
    expect(
      jackpotCheckinTokenSchema.safeParse(`${"a".repeat(20)}.${"b".repeat(20)}`).success,
    ).toBe(true);
    expect(jackpotCheckinTokenSchema.safeParse("pas-un-jeton").success).toBe(false);
    expect(jackpotCheckinTokenSchema.safeParse("court.x").success).toBe(false); // < 24 caractères
  });
});
