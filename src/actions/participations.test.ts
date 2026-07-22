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
    queries: [] as Array<{ table: string; filters: Record<string, unknown> }>,
    reset() {
      db.participations.clear();
      db.huntCompletions.clear();
      db.hunts.clear();
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
});
