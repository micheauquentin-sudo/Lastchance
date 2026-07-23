import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  calendarDayUnlockAt,
  mapCalendarJoin,
  mapCalendarOpen,
  mapCalendarPublicState,
  mapCalendarSpinGrant,
} from "./calendar";
import { normalizeCalendarCode } from "./utils";
import {
  calendarRedeemCodeSchema,
  consumeCalendarSpinSchema,
  joinCalendarSchema,
  updateCalendarDaySchema,
  updateCalendarSchema,
} from "./validations/calendar";

const UUID = "00000000-0000-4000-8000-000000000001";
const WHEEL = "00000000-0000-4000-8000-0000000000aa";

// ────────────────────────────────────────────────────────────
// mapCalendarJoin — jsonb join_calendar
// ────────────────────────────────────────────────────────────

describe("mapCalendarJoin", () => {
  it("mappe un join réussi (joined)", () => {
    const result = mapCalendarJoin({
      state: "joined",
      calendar: {
        id: UUID,
        name: "Avent Chez Marco",
        theme: "noel",
        day_count: 24,
        merchant_content: "Une surprise par jour !",
      },
      player: {
        id: "player-1",
        opened_count: 3,
        marketing_opt_in: true,
        reminder_opt_in: false,
        has_email: true,
      },
    });
    expect(result.state).toBe("joined");
    expect(result.calendar).toEqual({
      id: UUID,
      name: "Avent Chez Marco",
      theme: "noel",
      dayCount: 24,
      merchantContent: "Une surprise par jour !",
    });
    expect(result.player?.openedCount).toBe(3);
    expect(result.player?.marketingOptIn).toBe(true);
    expect(result.player?.reminderOptIn).toBe(false);
    expect(result.player?.hasEmail).toBe(true);
  });

  it("unavailable / jsonb non reconnu → défauts sûrs (aucun oracle)", () => {
    for (const raw of [{ state: "unavailable" }, null, 42, {}, { state: "bogus" }]) {
      const result = mapCalendarJoin(raw);
      expect(result.state).toBe("unavailable");
      expect(result.calendar).toBeNull();
      expect(result.player).toBeNull();
    }
  });

  it("thème inconnu → défaut 'neutre'", () => {
    const result = mapCalendarJoin({
      state: "joined",
      calendar: { id: UUID, name: "x", theme: "???", day_count: 7 },
      player: { id: "p", opened_count: 0 },
    });
    expect(result.calendar?.theme).toBe("neutre");
  });
});

// ────────────────────────────────────────────────────────────
// mapCalendarOpen — jsonb open_calendar_box
// ────────────────────────────────────────────────────────────

describe("mapCalendarOpen", () => {
  it("mappe une case 'content' ouverte", () => {
    const result = mapCalendarOpen({
      state: "opened",
      day: { id: "day-1", day_index: 1, content_type: "content", unlock_at: "2026-12-01T00:00:00Z" },
      content_text: "Joyeux 1er décembre !",
      reward_label: null,
      code: null,
      spin_grant_token: null,
      target_wheel_id: null,
      out_of_stock: false,
      progression: { opened_count: 1, day_count: 24 },
      completion: { rewarded: false, code: null, out_of_stock: false },
    });
    expect(result.state).toBe("opened");
    expect(result.day?.contentType).toBe("content");
    expect(result.day?.contentText).toBe("Joyeux 1er décembre !");
    expect(result.day?.code).toBeNull();
    expect(result.progression).toEqual({ openedCount: 1, dayCount: 24 });
    expect(result.completion).toEqual({ rewarded: false, code: null, outOfStock: false });
  });

  it("mappe une case 'lot' avec code CADEAU-…", () => {
    const result = mapCalendarOpen({
      state: "opened",
      day: { id: "day-5", day_index: 5, content_type: "lot", unlock_at: "2026-12-05T00:00:00Z" },
      reward_label: "Un café offert",
      reward_details: "Sur place",
      code: "CADEAU-ABCD2345",
      spin_grant_token: null,
      out_of_stock: false,
      progression: { opened_count: 5, day_count: 24 },
      completion: { rewarded: false, code: null, out_of_stock: false },
    });
    expect(result.day?.rewardLabel).toBe("Un café offert");
    expect(result.day?.code).toBe("CADEAU-ABCD2345");
    expect(result.day?.contentText).toBeNull();
  });

  it("mappe une case 'lot' en rupture (out_of_stock, aucun code)", () => {
    const result = mapCalendarOpen({
      state: "opened",
      day: { id: "day-6", day_index: 6, content_type: "lot", unlock_at: "2026-12-06T00:00:00Z" },
      reward_label: "Un magnum",
      code: null,
      out_of_stock: true,
      progression: { opened_count: 6, day_count: 24 },
      completion: { rewarded: false, code: null, out_of_stock: false },
    });
    expect(result.day?.outOfStock).toBe(true);
    expect(result.day?.code).toBeNull();
  });

  it("mappe une case 'spin' avec grant + roue cible", () => {
    const result = mapCalendarOpen({
      state: "opened",
      day: { id: "day-7", day_index: 7, content_type: "spin", unlock_at: "2026-12-07T00:00:00Z" },
      spin_grant_token: "a".repeat(48),
      target_wheel_id: WHEEL,
      out_of_stock: false,
      progression: { opened_count: 7, day_count: 24 },
      completion: { rewarded: false, code: null, out_of_stock: false },
    });
    expect(result.day?.contentType).toBe("spin");
    expect(result.day?.spinGrantToken).toBe("a".repeat(48));
    expect(result.day?.targetWheelId).toBe(WHEEL);
  });

  it("mappe une completion récompensée (dernière case)", () => {
    const result = mapCalendarOpen({
      state: "opened",
      day: { id: "day-24", day_index: 24, content_type: "content", unlock_at: "2026-12-24T00:00:00Z" },
      content_text: "Bravo !",
      progression: { opened_count: 24, day_count: 24 },
      completion: { rewarded: true, code: "CADEAU-WXYZ2345", out_of_stock: false },
    });
    expect(result.completion).toEqual({
      rewarded: true,
      code: "CADEAU-WXYZ2345",
      outOfStock: false,
    });
  });

  it("mappe too_early (unlock_at exposé, aucun contenu)", () => {
    const result = mapCalendarOpen({
      state: "too_early",
      day: { id: "day-10", day_index: 10, unlock_at: "2026-12-10T00:00:00Z" },
      unlock_at: "2026-12-10T00:00:00Z",
    });
    expect(result.state).toBe("too_early");
    expect(result.unlockAt).toBe("2026-12-10T00:00:00Z");
    expect(result.day).toBeNull();
    expect(result.completion).toBeNull();
  });

  it("already_opened : contenu du joueur, pas de completion", () => {
    const result = mapCalendarOpen({
      state: "already_opened",
      day: { id: "day-1", day_index: 1, content_type: "lot", unlock_at: "2026-12-01T00:00:00Z" },
      reward_label: "Un café",
      code: "CADEAU-ABCD2345",
      out_of_stock: false,
      progression: { opened_count: 1, day_count: 24 },
    });
    expect(result.state).toBe("already_opened");
    expect(result.day?.code).toBe("CADEAU-ABCD2345");
    // La completion n'est renvoyée que sur une NOUVELLE ouverture (opened).
    expect(result.completion).toBeNull();
  });

  it("jsonb non reconnu → unavailable neutre", () => {
    for (const raw of [null, undefined, 42, {}, { state: "bogus" }]) {
      const result = mapCalendarOpen(raw);
      expect(result.state).toBe("unavailable");
      expect(result.day).toBeNull();
      expect(result.progression).toBeNull();
    }
  });
});

// ────────────────────────────────────────────────────────────
// mapCalendarSpinGrant — jsonb consume_calendar_spin_grant
// ────────────────────────────────────────────────────────────

describe("mapCalendarSpinGrant", () => {
  it("mappe un tirage gagnant (spun)", () => {
    const result = mapCalendarSpinGrant({
      state: "spun",
      spin_id: "spin-1",
      wheel_id: WHEEL,
      prize_id: "prize-1",
      is_losing: false,
    });
    expect(result.state).toBe("spun");
    expect(result.spinId).toBe("spin-1");
    expect(result.isLosing).toBe(false);
  });

  it("mappe already_consumed / no_prize / unavailable", () => {
    expect(mapCalendarSpinGrant({ state: "already_consumed", spin_id: "s" }).spinId).toBe("s");
    expect(mapCalendarSpinGrant({ state: "no_prize", wheel_id: WHEEL }).wheelId).toBe(WHEEL);
    expect(mapCalendarSpinGrant({ state: "bogus" }).state).toBe("unavailable");
  });
});

// ────────────────────────────────────────────────────────────
// mapCalendarPublicState — NON-FUITE du contenu d'une case non ouverte
// ────────────────────────────────────────────────────────────

describe("mapCalendarPublicState", () => {
  it("expose le contenu UNIQUEMENT des cases ouvertes par le joueur", () => {
    const result = mapCalendarPublicState({
      state: "ok",
      calendar: {
        id: UUID,
        name: "Avent",
        theme: "noel",
        status: "active",
        day_count: 3,
        merchant_content: null,
        completion_reward_label: "Le grand lot",
        completion_reward_details: null,
      },
      days: [
        {
          day_index: 1,
          unlock_at: "2026-12-01T00:00:00Z",
          status: "opened",
          is_special: false,
          content_type: "lot",
          reward_label: "Un café",
          reward_details: "Sur place",
          code: "CADEAU-ABCD2345",
          out_of_stock: false,
        },
        { day_index: 2, unlock_at: "2026-12-02T00:00:00Z", status: "available", is_special: true },
        { day_index: 3, unlock_at: "2026-12-03T00:00:00Z", status: "locked", is_special: false },
      ],
      progression: { opened_count: 1, day_count: 3 },
      completion_reward: null,
    });

    expect(result.state).toBe("ok");
    const [d1, d2, d3] = result.days;
    // Case ouverte : contenu complet (le sien).
    expect(d1.status).toBe("opened");
    expect(d1.rewardLabel).toBe("Un café");
    expect(d1.code).toBe("CADEAU-ABCD2345");
    // Cases NON ouvertes : statut temporel + is_special SEULEMENT.
    expect(d2.status).toBe("available");
    expect(d2.isSpecial).toBe(true);
    expect(d2.contentType).toBeNull();
    expect(d3.status).toBe("locked");
    expect(d3.contentType).toBeNull();
  });

  it("DÉFENSE EN PROFONDEUR : une case non ouverte ne laisse JAMAIS fuir de contenu, même si la RPC en renvoyait", () => {
    // Si la RPC régressait et incluait du contenu sur une case verrouillée /
    // ouvrable, le mapping doit le neutraliser (invariant #2, anti-triche).
    const result = mapCalendarPublicState({
      state: "ok",
      calendar: {
        id: UUID,
        name: "Avent",
        theme: "noel",
        status: "active",
        day_count: 2,
        completion_reward_label: "",
      },
      days: [
        {
          day_index: 1,
          unlock_at: "2026-12-01T00:00:00Z",
          status: "locked",
          is_special: false,
          // Contenu injecté par erreur : DOIT être ignoré.
          content_type: "lot",
          reward_label: "LOT SECRET",
          reward_details: "à ne pas révéler",
          code: "CADEAU-STOLEN99",
          spin_grant_token: "b".repeat(48),
          target_wheel_id: WHEEL,
          resulting_spin_id: "spin-x",
          out_of_stock: true,
        },
        {
          day_index: 2,
          unlock_at: "2026-12-02T00:00:00Z",
          status: "available",
          is_special: false,
          content_type: "spin",
          code: "CADEAU-LEAK1234",
          spin_grant_token: "c".repeat(48),
        },
      ],
      progression: { opened_count: 0, day_count: 2 },
      completion_reward: null,
    });

    for (const day of result.days) {
      expect(day.contentType).toBeNull();
      expect(day.contentText).toBeNull();
      expect(day.rewardLabel).toBeNull();
      expect(day.rewardDetails).toBeNull();
      expect(day.code).toBeNull();
      expect(day.spinGrantToken).toBeNull();
      expect(day.targetWheelId).toBeNull();
      expect(day.resultingSpinId).toBeNull();
      expect(day.outOfStock).toBe(false);
    }
  });

  it("expose la récompense d'assiduité du joueur (son code)", () => {
    const result = mapCalendarPublicState({
      state: "ok",
      calendar: { id: UUID, name: "x", theme: "noel", status: "active", day_count: 1, completion_reward_label: "Lot" },
      days: [],
      progression: { opened_count: 1, day_count: 1 },
      completion_reward: { code: "CADEAU-WXYZ2345", redeemed_at: null },
    });
    expect(result.completionReward).toEqual({ code: "CADEAU-WXYZ2345", redeemedAt: null });
  });

  it("state ≠ ok / jsonb non reconnu → unavailable neutre", () => {
    for (const raw of [null, {}, { state: "unavailable" }, { state: "ok" }]) {
      const result = mapCalendarPublicState(raw);
      expect(result.state).toBe("unavailable");
      expect(result.calendar).toBeNull();
      expect(result.days).toEqual([]);
    }
  });
});

// ────────────────────────────────────────────────────────────
// calendarDayUnlockAt — dérivation de l'unlock_at par fuseau (gating)
// ────────────────────────────────────────────────────────────

describe("calendarDayUnlockAt", () => {
  it("Europe/Paris en hiver (UTC+1) : minuit local = 23:00 UTC la veille", () => {
    // 1er décembre 2026, minuit à Paris (CET) = 30 nov 23:00 UTC.
    expect(calendarDayUnlockAt("2026-12-01", 0, "Europe/Paris").toISOString()).toBe(
      "2026-11-30T23:00:00.000Z",
    );
    // 24e case (offset 23) = 24 déc minuit Paris = 23 déc 23:00 UTC.
    expect(calendarDayUnlockAt("2026-12-01", 23, "Europe/Paris").toISOString()).toBe(
      "2026-12-23T23:00:00.000Z",
    );
  });

  it("réévalue l'offset au JOUR près (bascule heure d'été)", () => {
    // Bascule CET→CEST le 29 mars 2026. Case du 28 (CET, UTC+1), du 30 (CEST, UTC+2).
    expect(calendarDayUnlockAt("2026-03-01", 27, "Europe/Paris").toISOString()).toBe(
      "2026-03-27T23:00:00.000Z",
    );
    expect(calendarDayUnlockAt("2026-03-01", 29, "Europe/Paris").toISOString()).toBe(
      "2026-03-29T22:00:00.000Z",
    );
  });

  it("UTC : minuit local = minuit UTC", () => {
    expect(calendarDayUnlockAt("2026-01-01", 0, "UTC").toISOString()).toBe(
      "2026-01-01T00:00:00.000Z",
    );
  });

  it("fuseau inconnu → repli UTC (jamais d'exception)", () => {
    expect(calendarDayUnlockAt("2026-01-01", 0, "Mars/Olympus").toISOString()).toBe(
      "2026-01-01T00:00:00.000Z",
    );
  });
});

// ────────────────────────────────────────────────────────────
// normalizeCalendarCode — routage caisse (préfixe distinct CADEAU-)
// ────────────────────────────────────────────────────────────

describe("normalizeCalendarCode", () => {
  it("normalise une saisie tolérante vers CADEAU-XXXXXXXX", () => {
    for (const raw of ["cadeau abcd2345", "  CADEAU-abcd2345 ", "cadeauabcd2345", "ABCD2345"]) {
      expect(normalizeCalendarCode(raw)).toBe("CADEAU-ABCD2345");
    }
  });

  it("rejette les codes d'autres familles et les formes invalides", () => {
    expect(normalizeCalendarCode("GAIN-ABCD2345")).toBe("");
    expect(normalizeCalendarCode("CHASSE-ABCD2345")).toBe("");
    expect(normalizeCalendarCode("FIDELITE-ABCD2345")).toBe("");
    expect(normalizeCalendarCode("JACKPOT-ABCD2345")).toBe("");
    expect(normalizeCalendarCode("EVENT-ABCD2345")).toBe("");
    // Alphabet exclut I/O/0/1 et exige 8 caractères.
    expect(normalizeCalendarCode("CADEAU-ABCI2345")).toBe("");
    expect(normalizeCalendarCode("CADEAU-ABCD234")).toBe("");
    expect(normalizeCalendarCode("")).toBe("");
  });
});

// ────────────────────────────────────────────────────────────
// Schémas Zod — bornes miroir des CHECK SQL
// ────────────────────────────────────────────────────────────

describe("updateCalendarSchema", () => {
  const base = {
    id: UUID,
    name: "Avent Chez Marco",
    theme: "noel",
    start_date: "2026-12-01",
    timezone: "Europe/Paris",
    day_count: 24,
    public_slug: "",
    merchant_content: "",
    completion_reward_label: "",
    completion_reward_details: "",
    completion_reward_stock: "",
  };
  const parse = (o: Record<string, unknown>) => updateCalendarSchema.safeParse({ ...base, ...o });

  it("accepte une configuration cohérente ('' → défauts sûrs)", () => {
    const res = parse({});
    expect(res.success).toBe(true);
    if (res.success) {
      expect(res.data.public_slug).toBeNull();
      expect(res.data.timezone).toBe("Europe/Paris");
      expect(res.data.completion_reward_stock).toBe(0);
    }
  });

  it("day_count borné 1..60", () => {
    expect(parse({ day_count: 0 }).success).toBe(false);
    expect(parse({ day_count: 61 }).success).toBe(false);
    expect(parse({ day_count: 1 }).success).toBe(true);
    expect(parse({ day_count: 60 }).success).toBe(true);
  });

  it("thème invalide refusé", () => {
    expect(parse({ theme: "halloween" }).success).toBe(false);
  });

  it("start_date : forme AAAA-MM-JJ requise", () => {
    expect(parse({ start_date: "01/12/2026" }).success).toBe(false);
    expect(parse({ start_date: "2026-13-40" }).success).toBe(false);
  });

  it("timezone : IANA valide, '' → null (fuseau de l'org)", () => {
    expect(parse({ timezone: "Mars/Olympus" }).success).toBe(false);
    const ok = parse({ timezone: "" });
    expect(ok.success).toBe(true);
    if (ok.success) expect(ok.data.timezone).toBeNull();
  });

  it("public_slug : forme ^[a-z0-9-]{3,64}$ ('' → null, normalisé)", () => {
    expect(parse({ public_slug: "ab" }).success).toBe(false);
    expect(parse({ public_slug: "Bad Slug!" }).success).toBe(false);
    const ok = parse({ public_slug: "MON-AVENT" });
    expect(ok.success).toBe(true);
    if (ok.success) expect(ok.data.public_slug).toBe("mon-avent");
  });
});

describe("updateCalendarDaySchema — cohérence usage ↔ champs", () => {
  const base = {
    id: UUID,
    content_type: "content",
    content_text: "Un message",
    reward_label: "",
    reward_details: "",
    reward_stock: "",
    target_wheel_id: "",
    is_special: false,
  };
  const parse = (o: Record<string, unknown>) => updateCalendarDaySchema.safeParse({ ...base, ...o });

  it("content : message obligatoire", () => {
    expect(parse({ content_type: "content", content_text: "Coucou" }).success).toBe(true);
    expect(parse({ content_type: "content", content_text: "" }).success).toBe(false);
  });

  it("lot : stock FINI obligatoire (verrou économique) + libellé", () => {
    // stock manquant → refusé.
    expect(
      parse({ content_type: "lot", reward_label: "Un café", reward_stock: "" }).success,
    ).toBe(false);
    // libellé manquant → refusé.
    expect(
      parse({ content_type: "lot", reward_label: "", reward_stock: "10" }).success,
    ).toBe(false);
    // stock 0 admis (épuisé / en pause).
    expect(
      parse({ content_type: "lot", reward_label: "Un café", reward_stock: "0" }).success,
    ).toBe(true);
  });

  it("spin : roue cible obligatoire", () => {
    expect(parse({ content_type: "spin", target_wheel_id: "" }).success).toBe(false);
    expect(parse({ content_type: "spin", target_wheel_id: WHEEL }).success).toBe(true);
  });
});

describe("schémas du parcours public / caisse", () => {
  it("joinCalendarSchema : slug requis, email opt-in facultatif (RGPD)", () => {
    expect(joinCalendarSchema.safeParse({ slug: "mon-avent" }).success).toBe(true);
    expect(joinCalendarSchema.safeParse({ slug: "ab" }).success).toBe(false);
    // Email '' → undefined (aucune PII), opt-in par défaut false.
    const noEmail = joinCalendarSchema.safeParse({ slug: "mon-avent", email: "" });
    expect(noEmail.success).toBe(true);
    if (noEmail.success) {
      expect(noEmail.data.email).toBeUndefined();
      expect(noEmail.data.marketingOptIn).toBe(false);
      expect(noEmail.data.reminderOptIn).toBe(false);
    }
    // Email valide conservé (minuscules).
    const withEmail = joinCalendarSchema.safeParse({
      slug: "mon-avent",
      email: "Client@Exemple.FR",
      marketingOptIn: true,
    });
    expect(withEmail.success).toBe(true);
    if (withEmail.success) expect(withEmail.data.email).toBe("client@exemple.fr");
    // Email sans @ refusé.
    expect(joinCalendarSchema.safeParse({ slug: "mon-avent", email: "invalide" }).success).toBe(false);
  });

  it("consumeCalendarSpinSchema : grant 48 hex", () => {
    expect(
      consumeCalendarSpinSchema.safeParse({ calendarId: UUID, grantToken: "a".repeat(48) }).success,
    ).toBe(true);
    expect(
      consumeCalendarSpinSchema.safeParse({ calendarId: UUID, grantToken: "a".repeat(47) }).success,
    ).toBe(false);
    expect(
      consumeCalendarSpinSchema.safeParse({ calendarId: UUID, grantToken: "Z".repeat(48) }).success,
    ).toBe(false);
  });

  it("calendarRedeemCodeSchema : CADEAU-XXXXXXXX, casse tolérée", () => {
    expect(calendarRedeemCodeSchema.safeParse("cadeau-abcd2345").success).toBe(true);
    expect(calendarRedeemCodeSchema.safeParse("  CADEAU-ABCD2345 ").success).toBe(true);
    expect(calendarRedeemCodeSchema.safeParse("EVENT-ABCD2345").success).toBe(false);
    expect(calendarRedeemCodeSchema.safeParse("CADEAU-ABCI2345").success).toBe(false); // I interdit
  });
});

// ────────────────────────────────────────────────────────────
// ADR-032 — AUCUN failClosed sur une clé PARTAGÉE (garde de conception)
// ────────────────────────────────────────────────────────────

describe("ADR-032 — contrôle d'abus du parcours public calendrier", () => {
  const source = readFileSync(new URL("../actions/calendar.ts", import.meta.url), "utf8");
  // Espaces normalisés : robuste au formatage (retours à la ligne de Prettier).
  const flat = source.replace(/\s+/g, " ");

  it("la clé PARTAGÉE (IP) passe par observeSharedKey (fail-OPEN), jamais par un refus", () => {
    expect(flat).toMatch(/observeSharedKey\(\s*rateLimitBucket\(\s*"calendar:public:ip"/);
  });

  it("la clé IP partagée n'est JAMAIS remise à un rateLimit failClosed", () => {
    // Aucune occurrence de "calendar:public:ip" suivie d'un failClosed (interrupteur interdit).
    expect(/"calendar:public:ip"[^;]*failClosed/.test(flat)).toBe(false);
  });

  it("le failClosed n'est employé QUE sur la clé d'IDENTITÉ (calendar:player)", () => {
    // Chaque failClosed du module est précédé, dans le même appel, de la clé d'identité.
    expect(flat).toMatch(/"calendar:player"[^;]*failClosed:\s*true/);
    // Le seau d'IP n'apparaît jamais avec failClosed (déjà vérifié ci-dessus),
    // et le seul autre bucket rate-limité du module est calendar:player.
    const failClosedCount = (flat.match(/failClosed:\s*true/g) ?? []).length;
    const playerFailClosed = (flat.match(/"calendar:player"[\s\S]*?failClosed:\s*true/g) ?? []).length;
    expect(failClosedCount).toBeGreaterThan(0);
    expect(playerFailClosed).toBe(failClosedCount);
  });
});
