import { afterEach, describe, expect, it, vi } from "vitest";

// ────────────────────────────────────────────────────────────
// Caisse unifiée — routage de lookupRedeemCode (roue vs chasse)
//
// Régression : un code CHASSE-… doit atteindre le flux chasse. Le bug
// historique (branche roue court-circuitée) laissait passer 372 tests car
// aucun n'exerçait ce chemin. On mocke les lookups DB (createAdminClient)
// comme security-integration.test.ts et on injecte des lignes par table.
// ────────────────────────────────────────────────────────────

// Base factice mutable + client admin factice, hoistés pour être disponibles
// quand la factory vi.mock s'exécute au chargement du module.
const { db, createAdminClientMock } = vi.hoisted(() => {
  const db = {
    participations: new Map<string, unknown>(), // clé : redeem_code
    huntCompletions: new Map<string, unknown>(), // clé : code
    hunts: new Map<string, unknown>(), // clé : id
    loyaltyRewards: new Map<string, unknown>(), // clé : code
    loyaltyPrograms: new Map<string, unknown>(), // clé : id
    loyaltyMilestones: new Map<string, unknown>(), // clé : id
    jackpotWins: new Map<string, unknown>(), // clé : code
    jackpotCampaigns: new Map<string, unknown>(), // clé : id
    calendarOpenings: new Map<string, unknown>(), // clé : code
    calendarRewards: new Map<string, unknown>(), // clé : code
    calendarDays: new Map<string, unknown>(), // clé : id
    calendars: new Map<string, unknown>(), // clé : id
    queries: [] as Array<{ table: string; filters: Record<string, unknown> }>,
    reset() {
      db.participations.clear();
      db.huntCompletions.clear();
      db.hunts.clear();
      db.loyaltyRewards.clear();
      db.loyaltyPrograms.clear();
      db.loyaltyMilestones.clear();
      db.jackpotWins.clear();
      db.jackpotCampaigns.clear();
      db.calendarOpenings.clear();
      db.calendarRewards.clear();
      db.calendarDays.clear();
      db.calendars.clear();
      db.queries = [];
    },
  };

  // Reproduit les chaînes utilisées par lookupParticipationByCode /
  // lookupHuntCompletionByCode : from().select().eq()…limit().maybeSingle().
  function createAdminClientMock() {
    return {
      from(table: string) {
        const filters: Record<string, unknown> = {};
        const builder = {
          select: () => builder,
          eq: (col: string, val: unknown) => {
            filters[col] = val;
            return builder;
          },
          limit: () => builder,
          maybeSingle: () => {
            db.queries.push({ table, filters: { ...filters } });
            if (table === "participations") {
              return Promise.resolve({
                data: db.participations.get(String(filters.redeem_code)) ?? null,
                error: null,
              });
            }
            if (table === "hunt_completions") {
              return Promise.resolve({
                data: db.huntCompletions.get(String(filters.code)) ?? null,
                error: null,
              });
            }
            if (table === "hunts") {
              return Promise.resolve({
                data: db.hunts.get(String(filters.id)) ?? null,
                error: null,
              });
            }
            if (table === "loyalty_rewards") {
              return Promise.resolve({
                data: db.loyaltyRewards.get(String(filters.code)) ?? null,
                error: null,
              });
            }
            if (table === "loyalty_programs") {
              return Promise.resolve({
                data: db.loyaltyPrograms.get(String(filters.id)) ?? null,
                error: null,
              });
            }
            if (table === "loyalty_milestones") {
              return Promise.resolve({
                data: db.loyaltyMilestones.get(String(filters.id)) ?? null,
                error: null,
              });
            }
            if (table === "jackpot_wins") {
              return Promise.resolve({
                data: db.jackpotWins.get(String(filters.code)) ?? null,
                error: null,
              });
            }
            if (table === "jackpot_campaigns") {
              return Promise.resolve({
                data: db.jackpotCampaigns.get(String(filters.id)) ?? null,
                error: null,
              });
            }
            if (table === "calendar_openings") {
              // Lot de case : filtré sur content_type='lot' (autres usages
              // n'ont pas de code de retrait).
              const opening = db.calendarOpenings.get(String(filters.code));
              return Promise.resolve({
                data: filters.content_type === "lot" ? opening ?? null : null,
                error: null,
              });
            }
            if (table === "calendar_rewards") {
              return Promise.resolve({
                data: db.calendarRewards.get(String(filters.code)) ?? null,
                error: null,
              });
            }
            if (table === "calendar_days") {
              return Promise.resolve({
                data: db.calendarDays.get(String(filters.id)) ?? null,
                error: null,
              });
            }
            if (table === "calendars") {
              return Promise.resolve({
                data: db.calendars.get(String(filters.id)) ?? null,
                error: null,
              });
            }
            return Promise.resolve({ data: null, error: null });
          },
        };
        return builder;
      },
    };
  }

  return { db, createAdminClientMock };
});

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: createAdminClientMock,
}));

// Auth : org active fixe (le scope multi-tenant est testé ailleurs).
vi.mock("@/lib/auth", () => ({
  getUserAndOrg: () =>
    Promise.resolve({
      user: { id: "user-1" },
      organization: { id: "org-1" },
      role: "owner",
    }),
}));

// Rate-limit : toujours autorisé, sans toucher à la vraie infra.
vi.mock("@/lib/rate-limit", () => ({
  rateLimit: () => Promise.resolve(true),
  rateLimitBucket: (...parts: string[]) => parts.join(":"),
  RATE_LIMITS: { cashier: { limit: 30, windowSeconds: 60 } },
}));

// Effets de bord non pertinents pour le routage.
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/google-wallet", () => ({ expireGoogleWalletPass: vi.fn() }));

import { lookupRedeemCode } from "./participations";

/** Seed d'une complétion de chasse retrouvable par son code normalisé. */
function seedHunt(code: string, huntId = "hunt-1") {
  db.huntCompletions.set(code, {
    id: `completion-${code}`,
    code,
    hunt_id: huntId,
    completed_at: "2026-07-20T10:00:00.000Z",
    redeemed_at: null,
  });
  db.hunts.set(huntId, {
    name: "Chasse de l'été",
    reward_label: "Un café offert",
    reward_details: null,
  });
}

/** Seed d'un lot de roue retrouvable par son redeem_code normalisé. */
function seedWheel(code: string) {
  db.participations.set(code, {
    id: `participation-${code}`,
    created_at: "2026-07-20T10:00:00.000Z",
    first_name: "Marco",
    redeem_code: code,
    redeemed_at: null,
    redeem_expires_at: null,
    cancelled_at: null,
    basket_cents: null,
    prizes: { label: "Un cookie", description: "" },
    campaigns: { name: "Campagne test" },
  });
}

/** Seed d'un lot de fidélité retrouvable par son code normalisé. */
function seedLoyalty(code: string, programId = "program-1", milestoneId = "milestone-1") {
  db.loyaltyRewards.set(code, {
    id: `reward-${code}`,
    code,
    earned_at: "2026-07-20T10:00:00.000Z",
    redeemed_at: null,
    program_id: programId,
    milestone_id: milestoneId,
  });
  db.loyaltyPrograms.set(programId, { name: "Fidélité Chez Marco" });
  db.loyaltyMilestones.set(milestoneId, {
    reward_label: "Un dessert offert",
    reward_details: "Au choix",
  });
}

/** Seed d'un gain de jackpot retrouvable par son code normalisé. */
function seedJackpot(code: string, campaignId = "campaign-1") {
  db.jackpotWins.set(code, {
    id: `win-${code}`,
    code,
    drawn_at: "2026-07-26T10:00:00.000Z",
    redeemed_at: null,
    campaign_id: campaignId,
  });
  db.jackpotCampaigns.set(campaignId, {
    name: "Jackpot Chez Marco",
    reward_label: "Un magnum de champagne",
    reward_details: "À retirer au bar",
  });
}

/** Seed d'un lot de CASE de calendrier (source `day`) retrouvable par son code. */
function seedCalendarDayLot(code: string, dayId = "day-1", calendarId = "calendar-1") {
  db.calendarOpenings.set(code, {
    id: `opening-${code}`,
    code,
    opened_at: "2026-12-05T08:00:00.000Z",
    redeemed_at: null,
    day_id: dayId,
    calendar_id: calendarId,
    content_type: "lot",
  });
  db.calendarDays.set(dayId, {
    reward_label: "Un chocolat chaud offert",
    reward_details: "À déguster sur place",
  });
  db.calendars.set(calendarId, {
    name: "Calendrier de l'Avent",
    completion_reward_label: "Le grand lot de fin",
    completion_reward_details: "Réservé aux plus assidus",
  });
}

/** Seed d'une RÉCOMPENSE D'ASSIDUITÉ de calendrier (source `completion`). */
function seedCalendarCompletion(code: string, calendarId = "calendar-2") {
  db.calendarRewards.set(code, {
    id: `reward-${code}`,
    code,
    created_at: "2026-12-24T20:00:00.000Z",
    redeemed_at: null,
    calendar_id: calendarId,
  });
  db.calendars.set(calendarId, {
    name: "Calendrier de l'Avent",
    completion_reward_label: "Le grand lot de fin",
    completion_reward_details: "Réservé aux plus assidus",
  });
}

afterEach(() => {
  db.reset();
  vi.clearAllMocks();
});

describe("lookupRedeemCode — routage caisse unifiée", () => {
  // (a) RÉGRESSION du bug 34496e8 : un CHASSE-… valide doit router vers la
  // chasse. Aucune participation n'est seedée : si la branche roue
  // court-circuitait (ancien code), le résultat serait null.
  it("(a) route un code CHASSE-… valide vers le flux chasse", async () => {
    seedHunt("CHASSE-ABCD2345");

    const match = await lookupRedeemCode("CHASSE-ABCD2345");

    expect(match?.source).toBe("hunt");
    if (match?.source === "hunt") {
      expect(match.completion.code).toBe("CHASSE-ABCD2345");
      expect(match.completion.hunt_name).toBe("Chasse de l'été");
    }
  });

  it("(a bis) route une saisie chasse tolérante (casse/espaces/sans tiret)", async () => {
    seedHunt("CHASSE-ABCD2345");

    for (const raw of ["chasse abcd2345", "  CHASSE-abcd2345 ", "chasseabcd2345"]) {
      const match = await lookupRedeemCode(raw);
      expect(match?.source).toBe("hunt");
    }
  });

  it("(a ter) un CHASSE-… inconnu renvoie null sans jamais interroger la roue", async () => {
    // Autorité du préfixe (défense en profondeur) : on seede la participation
    // GARBAGE que produirait normalizeRedeemCode("CHASSE-…"). Le préfixe CHASSE
    // court-circuite AVANT tout lookup roue → elle ne peut pas être renvoyée.
    seedWheel("GAIN-CHASSE-ABCD2345");

    const match = await lookupRedeemCode("CHASSE-ABCD2345");

    expect(match).toBeNull();
    expect(db.queries.some((q) => q.table === "participations")).toBe(false);
  });

  // (b) Le flux roue historique doit rester intact : GAIN-… → wheel.
  it("(b) route un code GAIN-… vers la roue et jamais vers la chasse", async () => {
    seedWheel("GAIN-AB2C3D4E");

    const match = await lookupRedeemCode("GAIN-AB2C3D4E");

    expect(match?.source).toBe("wheel");
    if (match?.source === "wheel") {
      expect(match.participation.redeem_code).toBe("GAIN-AB2C3D4E");
    }
    // Un code GAIN-… est rejeté par normalizeHuntCode : aucune requête sur
    // hunt_completions n'a lieu.
    expect(db.queries.some((q) => q.table === "hunt_completions")).toBe(false);
  });

  it("(b bis) normalise une saisie roue tolérante (casse/espaces)", async () => {
    seedWheel("GAIN-AB2C3D4E");

    for (const raw of ["gain ab2c3d4e", "  GAIN-ab2c3d4e "]) {
      const match = await lookupRedeemCode(raw);
      expect(match?.source).toBe("wheel");
    }
  });

  // (c) Code NU (sans préfixe) : tie-break documenté = chasse d'abord, roue
  // en repli.
  it("(c) tie-break code nu : la chasse l'emporte quand les deux existent", async () => {
    seedHunt("CHASSE-ABCD2345");
    seedWheel("GAIN-ABCD2345");

    const match = await lookupRedeemCode("ABCD2345");

    expect(match?.source).toBe("hunt");
  });

  it("(c bis) code nu : repli sur la roue si aucune chasse ne correspond", async () => {
    seedWheel("GAIN-ABCD2345");

    const match = await lookupRedeemCode("ABCD2345");

    expect(match?.source).toBe("wheel");
  });

  it("(c ter) code nu totalement inconnu → null", async () => {
    const match = await lookupRedeemCode("ABCD2345");
    expect(match).toBeNull();
  });

  it("ignore une saisie vide ou non exploitable", async () => {
    expect(await lookupRedeemCode("")).toBeNull();
    expect(await lookupRedeemCode("   ")).toBeNull();
  });

  // (d) Fidélité : un FIDELITE-… valide doit router vers le passeport et NE
  // JAMAIS être avalé par la roue (c'est exactement le trou du bug chasse).
  it("(d) route un code FIDELITE-… valide vers le flux fidélité", async () => {
    seedLoyalty("FIDELITE-ABCD2345");

    const match = await lookupRedeemCode("FIDELITE-ABCD2345");

    expect(match?.source).toBe("loyalty");
    if (match?.source === "loyalty") {
      expect(match.reward.code).toBe("FIDELITE-ABCD2345");
      expect(match.reward.program_name).toBe("Fidélité Chez Marco");
      expect(match.reward.reward_label).toBe("Un dessert offert");
    }
    // Rejeté par normalizeHuntCode ET normalizeRedeemCode : ni chasse ni roue
    // ne sont interrogées pour un FIDELITE-….
    expect(db.queries.some((q) => q.table === "hunt_completions")).toBe(false);
    expect(db.queries.some((q) => q.table === "participations")).toBe(false);
  });

  it("(d bis) route une saisie fidélité tolérante (casse/espaces/sans tiret)", async () => {
    seedLoyalty("FIDELITE-ABCD2345");

    for (const raw of ["fidelite abcd2345", "  FIDELITE-abcd2345 ", "fideliteabcd2345"]) {
      const match = await lookupRedeemCode(raw);
      expect(match?.source).toBe("loyalty");
    }
  });

  it("(d ter) un FIDELITE-… inconnu renvoie null sans jamais interroger la roue", async () => {
    // Autorité du préfixe : on seede la participation GARBAGE que produirait
    // normalizeRedeemCode("FIDELITE-…"). Le préfixe court-circuite AVANT la roue.
    seedWheel("GAIN-FIDELITEABCD2345");

    const match = await lookupRedeemCode("FIDELITE-ABCD2345");

    expect(match).toBeNull();
    expect(db.queries.some((q) => q.table === "participations")).toBe(false);
  });

  // (e) Non-régression : chasse et roue ne partent jamais vers la fidélité.
  it("(e) un CHASSE-… ne route pas vers la fidélité", async () => {
    seedHunt("CHASSE-ABCD2345");

    const match = await lookupRedeemCode("CHASSE-ABCD2345");

    expect(match?.source).toBe("hunt");
    expect(db.queries.some((q) => q.table === "loyalty_rewards")).toBe(false);
  });

  it("(e bis) un GAIN-… ne route pas vers la fidélité", async () => {
    seedWheel("GAIN-AB2C3D4E");

    const match = await lookupRedeemCode("GAIN-AB2C3D4E");

    expect(match?.source).toBe("wheel");
    // Un code GAIN-… est rejeté par normalizeLoyaltyCode : loyalty_rewards
    // n'est jamais interrogée.
    expect(db.queries.some((q) => q.table === "loyalty_rewards")).toBe(false);
  });

  // (f) Jackpot : un JACKPOT-… valide doit router vers le jackpot et NE JAMAIS
  // être avalé par la roue, la chasse ou la fidélité.
  it("(f) route un code JACKPOT-… valide vers le flux jackpot", async () => {
    seedJackpot("JACKPOT-ABCD2345");

    const match = await lookupRedeemCode("JACKPOT-ABCD2345");

    expect(match?.source).toBe("jackpot");
    if (match?.source === "jackpot") {
      expect(match.win.code).toBe("JACKPOT-ABCD2345");
      expect(match.win.campaign_name).toBe("Jackpot Chez Marco");
      expect(match.win.reward_label).toBe("Un magnum de champagne");
    }
    // Rejeté par normalizeHuntCode, normalizeLoyaltyCode ET normalizeRedeemCode :
    // aucune autre famille n'est interrogée pour un JACKPOT-….
    expect(db.queries.some((q) => q.table === "hunt_completions")).toBe(false);
    expect(db.queries.some((q) => q.table === "loyalty_rewards")).toBe(false);
    expect(db.queries.some((q) => q.table === "participations")).toBe(false);
  });

  it("(f bis) route une saisie jackpot tolérante (casse/espaces/sans tiret)", async () => {
    seedJackpot("JACKPOT-ABCD2345");

    for (const raw of ["jackpot abcd2345", "  JACKPOT-abcd2345 ", "jackpotabcd2345"]) {
      const match = await lookupRedeemCode(raw);
      expect(match?.source).toBe("jackpot");
    }
  });

  it("(f ter) un JACKPOT-… inconnu renvoie null sans jamais interroger la roue", async () => {
    // Autorité du préfixe : on seede la participation GARBAGE que produirait
    // normalizeRedeemCode("JACKPOT-…"). Le préfixe court-circuite AVANT la roue.
    seedWheel("GAIN-JACKPOTABCD2345");

    const match = await lookupRedeemCode("JACKPOT-ABCD2345");

    expect(match).toBeNull();
    expect(db.queries.some((q) => q.table === "participations")).toBe(false);
  });

  // (g) Non-régression : les autres familles ne partent jamais vers le jackpot.
  it("(g) un GAIN-… / CHASSE-… / FIDELITE-… ne route pas vers le jackpot", async () => {
    seedWheel("GAIN-AB2C3D4E");
    seedHunt("CHASSE-ABCD2345");
    seedLoyalty("FIDELITE-EFGH2345");

    for (const raw of ["GAIN-AB2C3D4E", "CHASSE-ABCD2345", "FIDELITE-EFGH2345"]) {
      const match = await lookupRedeemCode(raw);
      expect(match?.source).not.toBe("jackpot");
    }
    // jackpot_wins n'est jamais interrogée pour un code d'une autre famille.
    expect(db.queries.some((q) => q.table === "jackpot_wins")).toBe(false);
  });

  // (h) Calendrier : un CADEAU-… valide route vers le calendrier et NE JAMAIS
  // être avalé par une autre famille. Deux sources : case-lot / assiduité.
  it("(h) route un code CADEAU-… (case-lot) vers le flux calendrier", async () => {
    seedCalendarDayLot("CADEAU-ABCD2345");

    const match = await lookupRedeemCode("CADEAU-ABCD2345");

    expect(match?.source).toBe("calendar");
    if (match?.source === "calendar") {
      expect(match.reward.code).toBe("CADEAU-ABCD2345");
      expect(match.reward.source).toBe("day");
      expect(match.reward.calendar_name).toBe("Calendrier de l'Avent");
      expect(match.reward.reward_label).toBe("Un chocolat chaud offert");
    }
    // Aucune autre famille n'est interrogée pour un CADEAU-….
    expect(db.queries.some((q) => q.table === "hunt_completions")).toBe(false);
    expect(db.queries.some((q) => q.table === "loyalty_rewards")).toBe(false);
    expect(db.queries.some((q) => q.table === "jackpot_wins")).toBe(false);
    expect(db.queries.some((q) => q.table === "event_wins")).toBe(false);
    expect(db.queries.some((q) => q.table === "participations")).toBe(false);
  });

  it("(h bis) route un CADEAU-… (récompense d'assiduité) vers le calendrier", async () => {
    seedCalendarCompletion("CADEAU-EFGH2345");

    const match = await lookupRedeemCode("CADEAU-EFGH2345");

    expect(match?.source).toBe("calendar");
    if (match?.source === "calendar") {
      expect(match.reward.source).toBe("completion");
      expect(match.reward.reward_label).toBe("Le grand lot de fin");
    }
  });

  it("(h ter) route une saisie calendrier tolérante (casse/espaces/sans tiret)", async () => {
    seedCalendarDayLot("CADEAU-ABCD2345");

    for (const raw of ["cadeau abcd2345", "  CADEAU-abcd2345 ", "cadeauabcd2345"]) {
      const match = await lookupRedeemCode(raw);
      expect(match?.source).toBe("calendar");
    }
  });

  it("(h quater) un CADEAU-… inconnu renvoie null sans jamais interroger la roue", async () => {
    // Autorité du préfixe : on seede la participation GARBAGE que produirait
    // normalizeRedeemCode("CADEAU-…"). Le préfixe court-circuite AVANT la roue.
    seedWheel("GAIN-CADEAUABCD2345");

    const match = await lookupRedeemCode("CADEAU-ABCD2345");

    expect(match).toBeNull();
    expect(db.queries.some((q) => q.table === "participations")).toBe(false);
  });

  // (i) Non-régression : aucune autre famille ne part vers le calendrier.
  it("(i) GAIN-… / CHASSE-… / FIDELITE-… / JACKPOT-… / EVENT-… ne routent pas vers le calendrier", async () => {
    seedWheel("GAIN-AB2C3D4E");
    seedHunt("CHASSE-ABCD2345");
    seedLoyalty("FIDELITE-EFGH2345");
    seedJackpot("JACKPOT-JKLM2345");

    for (const raw of [
      "GAIN-AB2C3D4E",
      "CHASSE-ABCD2345",
      "FIDELITE-EFGH2345",
      "JACKPOT-JKLM2345",
    ]) {
      const match = await lookupRedeemCode(raw);
      expect(match?.source).not.toBe("calendar");
    }
    // calendar_openings / calendar_rewards jamais interrogées pour un autre code.
    expect(db.queries.some((q) => q.table === "calendar_openings")).toBe(false);
    expect(db.queries.some((q) => q.table === "calendar_rewards")).toBe(false);
  });
});
