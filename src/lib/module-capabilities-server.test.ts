import { beforeEach, describe, expect, it, vi } from "vitest";

// ────────────────────────────────────────────────────────────
// capacitesDuModule — LE PONT, testé en assemblage.
//
// `droitEffectifModule`, `capacitesModule` et `etatOctroiModule` ont chacun
// leur test unitaire ; ce fichier manquait, alors que c'est ici que les trois
// pièces se rencontrent. Ce qu'on veut prouver n'est pas leur logique propre
// (déjà couverte ailleurs) mais le CÂBLAGE : les trois gardes de
// `finDuPassExpire` (payé, caissier, état ≠ `expired`) évitent bien l'appel à
// `etatOctroiModule`, et son résultat traverse jusqu'à `passTermineLe`.
// ────────────────────────────────────────────────────────────

const { state } = vi.hoisted(() => ({
  state: {
    organization: null as { id: string; timezone: string | null } | null,
    role: null as string | null,
    droitEffectif: false,
    etat: null as { etat: string; endsAt: string | null; activateBy: string | null } | null,
  },
}));

vi.mock("server-only", () => ({}));

vi.mock("@/lib/auth", () => ({
  getUserAndOrg: vi.fn(async () => ({
    organization: state.organization,
    role: state.role,
  })),
}));

vi.mock("@/lib/monitoring", () => ({ reportError: vi.fn() }));

vi.mock("@/lib/subscription", async () => {
  const actual = await vi.importActual<typeof import("@/lib/subscription")>(
    "@/lib/subscription",
  );
  return {
    ...actual,
    droitEffectifModule: vi.fn(() => state.droitEffectif),
  };
});

const etatOctroiModule = vi.fn(async () => state.etat);
vi.mock("@/lib/module-grants-loader", () => ({ etatOctroiModule }));

const supabaseSelect = vi.fn(() => ({ count: 0, error: null }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          eq: vi.fn(() => supabaseSelect()),
          not: vi.fn(() => supabaseSelect()),
        })),
      })),
    })),
  })),
}));

const { capacitesDuModule } = await import("@/lib/module-capabilities-server");

const ORG = { id: "org-1", timezone: "Europe/Paris" };

describe("capacitesDuModule — l'assemblage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    state.organization = ORG;
    state.role = "owner";
    state.droitEffectif = false;
    state.etat = null;
    supabaseSelect.mockReturnValue({ count: 0, error: null });
  });

  it("sans organisation, refuse sans consulter l'état de l'octroi", async () => {
    state.organization = null;
    state.role = null;
    const capacites = await capacitesDuModule("wheel");
    expect(capacites.raison).toBe("role");
    expect(capacites.passTermineLe).toBeNull();
    expect(etatOctroiModule).not.toHaveBeenCalled();
  });

  it("un module payé ne consulte pas l'état de l'octroi", async () => {
    state.droitEffectif = true;
    const capacites = await capacitesDuModule("wheel");
    expect(capacites.passTermineLe).toBeNull();
    expect(etatOctroiModule).not.toHaveBeenCalled();
  });

  it("un caissier ne consulte pas l'état de l'octroi", async () => {
    state.role = "cashier";
    const capacites = await capacitesDuModule("wheel");
    expect(capacites.raison).toBe("role");
    expect(capacites.passTermineLe).toBeNull();
    expect(etatOctroiModule).not.toHaveBeenCalled();
  });

  it("un état autre que 'expired' ne produit pas de date", async () => {
    state.etat = { etat: "pending", endsAt: "2026-09-01T00:00:00.000Z", activateBy: null };
    const capacites = await capacitesDuModule("wheel");
    expect(capacites.passTermineLe).toBeNull();
    expect(etatOctroiModule).toHaveBeenCalledWith(ORG.id, "wheel");
  });

  it("un pass expiré fait traverser la date, formatée, jusqu'à passTermineLe", async () => {
    state.etat = { etat: "expired", endsAt: "2026-09-01T00:00:00.000Z", activateBy: null };
    const capacites = await capacitesDuModule("wheel");
    expect(capacites.raison).toBe("pass_expire");
    expect(capacites.passTermineLe).not.toBeNull();
  });
});
