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
    octroiRessource: false,
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
const octroiRessourceVivant = vi.fn(async () => state.octroiRessource);
vi.mock("@/lib/module-grants-loader", () => ({
  etatOctroiModule,
  octroiRessourceVivant,
}));

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
    state.octroiRessource = false;
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

/**
 * Le pass borné à UNE ressource (SD-5), moitié dashboard.
 *
 * La moitié SQL était livrée — l'octroi porte `resource_id`,
 * `org_has_live_resource_grant` autorise la publication — et ce pont-ci ne la
 * lisait pas : le commerçant qui venait de payer 39 € lisait « la publication
 * demande d'ouvrir ce module » sur le championnat que la base l'autorisait à
 * publier. Les deux surfaces se contredisaient.
 */
describe("capacitesDuModule — la ressource nommée", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    state.organization = ORG;
    state.role = "owner";
    state.droitEffectif = false;
    state.etat = null;
    state.octroiRessource = false;
    supabaseSelect.mockReturnValue({ count: 0, error: null });
  });

  it("un octroi borné à CE championnat rend la publication permise", async () => {
    state.octroiRessource = true;
    const capacites = await capacitesDuModule("pronostics", "contest-1");
    expect(capacites.canPublish).toBe(true);
    expect(capacites.raison).toBeNull();
    expect(octroiRessourceVivant).toHaveBeenCalledWith(
      ORG.id,
      "pronostics",
      "contest-1",
    );
    // Un droit payé n'a plus rien à expliquer, et son quota de brouillon ne
    // s'applique pas : les deux lectures suivantes sont donc évitées.
    expect(etatOctroiModule).not.toHaveBeenCalled();
  });

  it("sans ressource nommée, la publication reste fermée — la LISTE n'est pas ouverte par un pass borné", async () => {
    // L'arbitrage explicite du chantier : `pronostics/page.tsx` n'appelle
    // volontairement pas avec une ressource. Un pass acheté pour un championnat
    // ne doit pas ouvrir la publication des autres.
    state.octroiRessource = true;
    const capacites = await capacitesDuModule("pronostics");
    expect(capacites.canPublish).toBe(false);
    expect(octroiRessourceVivant).not.toHaveBeenCalled();
  });

  it("sans octroi sur cette ressource, le refus tient", async () => {
    const capacites = await capacitesDuModule("pronostics", "contest-2");
    expect(capacites.canPublish).toBe(false);
    expect(capacites.raison).toBe("droit_absent");
  });

  it("un module DÉJÀ payé n'interroge pas la ressource", async () => {
    // Même ordre que `org_has_module_access_for_resource` : le droit du module
    // ouvre toutes ses ressources, la seconde lecture ne peut rien changer.
    state.droitEffectif = true;
    const capacites = await capacitesDuModule("pronostics", "contest-1");
    expect(capacites.canPublish).toBe(true);
    expect(octroiRessourceVivant).not.toHaveBeenCalled();
  });

  it("sans organisation, la ressource n'est même pas lue", async () => {
    state.organization = null;
    state.role = null;
    state.octroiRessource = true;
    const capacites = await capacitesDuModule("pronostics", "contest-1");
    expect(capacites.raison).toBe("role");
    expect(octroiRessourceVivant).not.toHaveBeenCalled();
  });
});
