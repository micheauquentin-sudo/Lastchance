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
  /** Ligne de contest_awards telle que la voit la caisse (mutable). */
  interface ContestAwardRow {
    id: string;
    organization_id: string;
    code: string;
    created_at: string;
    redeemed_at: string | null;
    redeemed_by: string | null;
    redeem_expires_at: string | null;
    status: "pending" | "delivered" | "cancelled";
    rank: number;
    reward_label: string;
    basket_cents: number | null;
    contest_id: string;
    player_id: string;
  }

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
    // Pronostics — 9e source. Les awards sont MUTÉS par la RPC factice
    // redeem_contest_award pour exercer réellement l'idempotence.
    contestAwards: new Map<string, ContestAwardRow>(), // clé : code
    contests: new Map<string, unknown>(), // clé : id
    contestPlayers: new Map<string, unknown>(), // clé : id
    queries: [] as Array<{ table: string; filters: Record<string, unknown> }>,
    rpcCalls: [] as Array<{ name: string; args: Record<string, unknown> }>,
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
      db.contestAwards.clear();
      db.contests.clear();
      db.contestPlayers.clear();
      db.queries = [];
      db.rpcCalls = [];
    },
  };

  // Reproduit les chaînes utilisées par lookupParticipationByCode /
  // lookupHuntCompletionByCode : from().select().eq()…limit().maybeSingle().
  function createAdminClientMock() {
    return {
      /**
       * RPC factice de la caisse. `redeem_contest_award` reproduit fidèlement
       * la sémantique SQL : UPDATE conditionnel (jamais remis + pending + non
       * expiré) puis lecture INCONDITIONNELLE de la ligne si le code existe
       * dans l'org — c'est ce qui permet à l'action d'expliquer un refus.
       */
      rpc(name: string, args: Record<string, unknown>) {
        db.rpcCalls.push({ name, args });
        if (name !== "redeem_contest_award") {
          return Promise.resolve({ data: null, error: null });
        }
        const award = db.contestAwards.get(String(args.p_code));
        // Code inconnu OU autre organisation : indistinguables (zéro ligne).
        if (!award || award.organization_id !== args.p_organization_id) {
          return Promise.resolve({ data: [], error: null });
        }
        const now = Date.now();
        const expired = award.redeem_expires_at
          ? new Date(award.redeem_expires_at).getTime() <= now
          : false;
        const redeemedNow =
          award.redeemed_at === null && award.status === "pending" && !expired;
        if (redeemedNow) {
          award.status = "delivered";
          award.redeemed_at = new Date(now).toISOString();
          award.redeemed_by = String(args.p_actor);
          award.basket_cents = (args.p_basket_cents as number | null) ?? null;
        }
        return Promise.resolve({
          data: [
            {
              id: award.id,
              code: award.code,
              created_at: award.created_at,
              redeemed_at: award.redeemed_at,
              redeem_expires_at: award.redeem_expires_at,
              status: award.status,
              rank: award.rank,
              reward_label: award.reward_label,
              contest_name: "Pronos du comptoir",
              player_name: "Alice",
              basket_cents: award.basket_cents,
              redeemed_now: redeemedNow,
            },
          ],
          error: null,
        });
      },
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
            if (table === "contest_awards") {
              const award = db.contestAwards.get(String(filters.code));
              return Promise.resolve({
                data:
                  award && award.organization_id === filters.organization_id
                    ? award
                    : null,
                error: null,
              });
            }
            if (table === "contests") {
              return Promise.resolve({
                data: db.contests.get(String(filters.id)) ?? null,
                error: null,
              });
            }
            if (table === "contest_players") {
              return Promise.resolve({
                data: db.contestPlayers.get(String(filters.id)) ?? null,
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

import { lookupRedeemCode, redeemContestAward } from "./participations";

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

/** Seed d'un lot de pronostics (code PRONO-…) émis à la clôture. */
function seedContestAward(
  code: string,
  overrides: Partial<{
    status: "pending" | "delivered" | "cancelled";
    redeemed_at: string | null;
    redeem_expires_at: string | null;
    organization_id: string;
  }> = {},
) {
  db.contestAwards.set(code, {
    id: `award-${code}`,
    organization_id: "org-1",
    code,
    created_at: "2026-07-20T10:00:00.000Z",
    redeemed_at: null,
    redeemed_by: null,
    redeem_expires_at: null,
    status: "pending",
    rank: 1,
    reward_label: "Un magnum de champagne",
    basket_cents: null,
    contest_id: "contest-1",
    player_id: "player-1",
    ...overrides,
  });
  db.contests.set("contest-1", { name: "Pronos du comptoir" });
  db.contestPlayers.set("player-1", { first_name: "Alice" });
}

/** Formulaire de caisse : code + montant du panier facultatif. */
function redeemForm(code: string, basket?: string): FormData {
  const fd = new FormData();
  fd.set("code", code);
  if (basket !== undefined) fd.set("basket", basket);
  return fd;
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

  // (j) Pronostics — 9e source. Les codes PRONO-… étaient émis et affichés au
  // joueur mais AUCUN chemin caisse ne les routait : ils tombaient dans le
  // repli roue (normalizeRedeemCode est permissif) et ressortaient introuvables.
  it("(j) route un code PRONO-… valide vers le flux pronostics", async () => {
    seedContestAward("PRONO-ABCD2345");

    const match = await lookupRedeemCode("PRONO-ABCD2345");

    expect(match?.source).toBe("contest");
    if (match?.source === "contest") {
      expect(match.award.code).toBe("PRONO-ABCD2345");
      expect(match.award.contest_name).toBe("Pronos du comptoir");
      expect(match.award.player_name).toBe("Alice");
      expect(match.award.reward_label).toBe("Un magnum de champagne");
      expect(match.award.status).toBe("pending");
      expect(match.award.rank).toBe(1);
    }
    // Aucune autre famille n'est interrogée pour un PRONO-….
    expect(db.queries.some((q) => q.table === "hunt_completions")).toBe(false);
    expect(db.queries.some((q) => q.table === "loyalty_rewards")).toBe(false);
    expect(db.queries.some((q) => q.table === "jackpot_wins")).toBe(false);
    expect(db.queries.some((q) => q.table === "participations")).toBe(false);
  });

  it("(j bis) route une saisie pronostics tolérante (casse/espaces/sans tiret)", async () => {
    seedContestAward("PRONO-ABCD2345");

    for (const raw of ["prono abcd2345", "  PRONO-abcd2345 ", "pronoabcd2345"]) {
      const match = await lookupRedeemCode(raw);
      expect(match?.source).toBe("contest");
    }
  });

  it("(j ter) un PRONO-… inconnu renvoie null sans jamais interroger la roue", async () => {
    // Autorité du préfixe : on seede la participation GARBAGE que produirait
    // normalizeRedeemCode("PRONO-…"). Le préfixe court-circuite AVANT la roue.
    seedWheel("GAIN-PRONOABCD2345");

    const match = await lookupRedeemCode("PRONO-ABCD2345");

    expect(match).toBeNull();
    expect(db.queries.some((q) => q.table === "participations")).toBe(false);
  });

  it("(j quater) un PRONO-… d'une AUTRE organisation est introuvable", async () => {
    seedContestAward("PRONO-ABCD2345", { organization_id: "org-2" });

    expect(await lookupRedeemCode("PRONO-ABCD2345")).toBeNull();
  });

  it("(j quinquies) un lot ANNULÉ reste retrouvable (la caisse doit l'expliquer)", async () => {
    seedContestAward("PRONO-ABCD2345", { status: "cancelled" });

    const match = await lookupRedeemCode("PRONO-ABCD2345");

    expect(match?.source).toBe("contest");
    if (match?.source === "contest") expect(match.award.status).toBe("cancelled");
  });

  // (k) Non-régression : aucune autre famille ne part vers les pronostics, et
  // le repli roue (dernier maillon) reste intact derrière la 9e branche.
  it("(k) les 8 autres familles ne routent pas vers les pronostics", async () => {
    seedWheel("GAIN-AB2C3D4E");
    seedHunt("CHASSE-ABCD2345");
    seedLoyalty("FIDELITE-EFGH2345");
    seedJackpot("JACKPOT-JKLM2345");
    seedCalendarDayLot("CADEAU-NPQR2345");

    for (const raw of [
      "GAIN-AB2C3D4E",
      "CHASSE-ABCD2345",
      "FIDELITE-EFGH2345",
      "JACKPOT-JKLM2345",
      "CADEAU-NPQR2345",
      "EVENT-STUV2345",
      "PARRAIN-WXYZ2345",
      "QUIZ-ABCD2345",
    ]) {
      const match = await lookupRedeemCode(raw);
      expect(match?.source).not.toBe("contest");
    }
    // contest_awards n'est jamais interrogée pour un code d'une autre famille.
    expect(db.queries.some((q) => q.table === "contest_awards")).toBe(false);
  });

  it("(k bis) code nu : le repli roue survit à l'ajout de la 9e branche", async () => {
    seedWheel("GAIN-ABCD2345");

    const match = await lookupRedeemCode("ABCD2345");

    expect(match?.source).toBe("wheel");
    // La branche pronostics a bien été TENTÉE avant le repli (code nu ambigu).
    expect(db.queries.some((q) => q.table === "contest_awards")).toBe(true);
  });

  it("(k ter) code nu : les pronostics l'emportent sur la roue si les deux existent", async () => {
    seedContestAward("PRONO-ABCD2345");
    seedWheel("GAIN-ABCD2345");

    const match = await lookupRedeemCode("ABCD2345");

    expect(match?.source).toBe("contest");
  });
});

// ────────────────────────────────────────────────────────────
// redeemContestAward — remise en caisse d'un lot de pronostics
//
// C'est le cœur du correctif : avant, seule set_contest_award_status
// (is_org_editor) pouvait marquer le lot remis — un CAISSIER en était
// incapable. L'action ne pose donc AUCUNE garde de rôle : l'autorisation
// vient de getUserAndOrg, comme pour les 8 autres sources.
// ────────────────────────────────────────────────────────────

describe("redeemContestAward", () => {
  const rpcArgs = () =>
    db.rpcCalls.find((c) => c.name === "redeem_contest_award")?.args;

  it("remet le lot et journalise l'acteur (aucune garde d'éditeur)", async () => {
    seedContestAward("PRONO-ABCD2345");

    const res = await redeemContestAward(null, redeemForm("PRONO-ABCD2345"));

    expect(res.ok).toBe(true);
    expect(rpcArgs()).toMatchObject({
      p_organization_id: "org-1",
      p_code: "PRONO-ABCD2345",
      p_actor: "user-1",
      p_basket_cents: null,
    });
    expect(db.contestAwards.get("PRONO-ABCD2345")?.status).toBe("delivered");
  });

  it("convertit le panier saisi à la française en centimes", async () => {
    seedContestAward("PRONO-ABCD2345");

    const res = await redeemContestAward(
      null,
      redeemForm("PRONO-ABCD2345", "12,50"),
    );

    expect(res.ok).toBe(true);
    expect(rpcArgs()?.p_basket_cents).toBe(1250);
    expect(db.contestAwards.get("PRONO-ABCD2345")?.basket_cents).toBe(1250);
  });

  it("panier vide = pas de montant (null), pas une erreur", async () => {
    seedContestAward("PRONO-ABCD2345");

    const res = await redeemContestAward(null, redeemForm("PRONO-ABCD2345", "  "));

    expect(res.ok).toBe(true);
    expect(rpcArgs()?.p_basket_cents).toBeNull();
  });

  it("panier illisible ou négatif : refus AVANT tout appel à la base", async () => {
    seedContestAward("PRONO-ABCD2345");

    for (const basket of ["douze euros", "-5", "9999999"]) {
      const res = await redeemContestAward(
        null,
        redeemForm("PRONO-ABCD2345", basket),
      );
      expect(res.ok).toBe(false);
      if (!res.ok) expect(res.error).toBe("Montant du panier invalide");
    }
    expect(db.rpcCalls).toEqual([]);
  });

  it("code mal formé : refus AVANT tout appel à la base", async () => {
    for (const code of ["PRONO-ABCD234", "PRONO-ABCD2I45", "QUIZ-ABCD2345", ""]) {
      const res = await redeemContestAward(null, redeemForm(code));
      expect(res.ok).toBe(false);
      if (!res.ok) expect(res.error).toBe("Code de retrait invalide");
    }
    expect(db.rpcCalls).toEqual([]);
  });

  it("code inconnu ou d'une autre organisation : « introuvable », indistinguable", async () => {
    seedContestAward("PRONO-ABCD2345", { organization_id: "org-2" });

    const autreOrg = await redeemContestAward(null, redeemForm("PRONO-ABCD2345"));
    const inconnu = await redeemContestAward(null, redeemForm("PRONO-WXYZ2345"));

    expect(autreOrg.ok).toBe(false);
    expect(inconnu.ok).toBe(false);
    if (!autreOrg.ok && !inconnu.ok) {
      expect(autreOrg.error).toBe("Code introuvable");
      expect(autreOrg.error).toBe(inconnu.error);
    }
  });

  // MOTIF 1/3 — idempotence : le second appel ne remet rien et le dit.
  it("idempotent : le 2e appel refuse en datant la remise", async () => {
    seedContestAward("PRONO-ABCD2345");

    const first = await redeemContestAward(null, redeemForm("PRONO-ABCD2345", "12,50"));
    const second = await redeemContestAward(null, redeemForm("PRONO-ABCD2345", "99"));

    expect(first.ok).toBe(true);
    expect(second.ok).toBe(false);
    if (!second.ok) expect(second.error).toMatch(/déjà été remis le /);
    // Le 2e panier n'écrase PAS le premier : rien n'a été réécrit.
    expect(db.contestAwards.get("PRONO-ABCD2345")?.basket_cents).toBe(1250);
  });

  // MOTIF 2/3 — lot annulé par le commerçant.
  it("lot annulé : motif explicite, distinct de « déjà remis »", async () => {
    seedContestAward("PRONO-ABCD2345", { status: "cancelled" });

    const res = await redeemContestAward(null, redeemForm("PRONO-ABCD2345"));

    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toBe("Ce lot a été annulé");
    expect(db.contestAwards.get("PRONO-ABCD2345")?.status).toBe("cancelled");
  });

  // MOTIF 3/3 — code expiré (l'échéance fait foi côté base, pas côté écran).
  it("code expiré : motif explicite et daté", async () => {
    seedContestAward("PRONO-ABCD2345", {
      redeem_expires_at: new Date(Date.now() - 60_000).toISOString(),
    });

    const res = await redeemContestAward(null, redeemForm("PRONO-ABCD2345"));

    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/^Code expiré le /);
    expect(db.contestAwards.get("PRONO-ABCD2345")?.status).toBe("pending");
  });

  it("échéance encore valable : la remise passe", async () => {
    seedContestAward("PRONO-ABCD2345", {
      redeem_expires_at: new Date(Date.now() + 86_400_000).toISOString(),
    });

    const res = await redeemContestAward(null, redeemForm("PRONO-ABCD2345"));

    expect(res.ok).toBe(true);
  });
});
