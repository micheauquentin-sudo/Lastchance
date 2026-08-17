// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * `etatOctroiModule` — la RAISON d'un module fermé, pas le verdict.
 *
 * Ce que ces tests tiennent : la lecture passe par la RPC `org_module_grant_state`
 * (et non par une requête recopiée), l'absence d'octroi se distingue d'une panne
 * sans se distinguer dans le RÉSULTAT — les deux rendent `null`, donc le message
 * générique —, et un état que le TypeScript ne sait pas nommer ne remonte jamais
 * jusqu'à une phrase affichée au commerçant.
 */

const mocks = vi.hoisted(() => ({ rpc: vi.fn(), reportError: vi.fn() }));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({ rpc: mocks.rpc }),
}));
vi.mock("@/lib/monitoring", () => ({
  reportError: (...args: unknown[]) => mocks.reportError(...args),
}));

const { etatOctroiModule } = await import("./module-grants-loader");

const ORG = "org-1";
const MAINTENANT = new Date("2026-06-15T12:00:00.000Z");

/** Une ligne de `org_module_grant_state`, telle que la RPC la rend. */
function ligne(over: Record<string, unknown> = {}) {
  return {
    state: "expired",
    grant_id: "grant-1",
    starts_at: "2026-05-01T00:00:00.000Z",
    ends_at: "2026-06-01T00:00:00.000Z",
    activate_by: null,
    capacity: null,
    ...over,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("etatOctroiModule", () => {
  it("rend l'état et les deux dates, en interrogeant la RPC", async () => {
    mocks.rpc.mockResolvedValue({ data: [ligne()], error: null });

    const etat = await etatOctroiModule(ORG, "wheel", MAINTENANT);

    expect(etat).toEqual({
      etat: "expired",
      endsAt: "2026-06-01T00:00:00.000Z",
      activateBy: null,
    });
    // L'instant est TRANSMIS et non laissé au `now()` de la base : sans lui, un
    // test ne pourrait pas fixer la frontière entre `live` et `expired`, et un
    // appelant qui raisonne sur une date donnée obtiendrait un autre état.
    expect(mocks.rpc).toHaveBeenCalledWith("org_module_grant_state", {
      p_organization_id: ORG,
      p_module: "wheel",
      p_now: MAINTENANT.toISOString(),
    });
  });

  it("aucune ligne : rien n'a jamais été acheté sur ce module", async () => {
    mocks.rpc.mockResolvedValue({ data: [], error: null });
    expect(await etatOctroiModule(ORG, "hunts", MAINTENANT)).toBeNull();
    expect(mocks.reportError).not.toHaveBeenCalled();
  });

  it("une panne rend `null` et se signale — jamais un droit, jamais un mensonge", async () => {
    // Le sens de l'erreur est le point. Cette fonction n'alimente qu'une PHRASE :
    // dégrader vers `null` fait retomber le message sur le générique. Rendre un
    // état deviné y écrirait une date fausse ; rendre `live` ouvrirait un module
    // payant à la faveur d'une coupure réseau.
    mocks.rpc.mockResolvedValue({ data: null, error: { message: "indisponible" } });

    expect(await etatOctroiModule(ORG, "quiz", MAINTENANT)).toBeNull();
    expect(mocks.reportError).toHaveBeenCalledWith(
      "module-grants-loader",
      expect.objectContaining({ message: "indisponible" }),
    );
  });

  it("un état inconnu du TypeScript est signalé, jamais rendu", async () => {
    // La base et le miroir TS peuvent diverger (un septième état ajouté côté
    // SQL). Le laisser passer ferait choisir une branche de message sur une
    // valeur que rien ici ne sait interpréter.
    mocks.rpc.mockResolvedValue({ data: [ligne({ state: "suspendu" })], error: null });

    expect(await etatOctroiModule(ORG, "wheel", MAINTENANT)).toBeNull();
    expect(mocks.reportError).toHaveBeenCalledWith(
      "module-grants-loader",
      expect.objectContaining({ message: expect.stringContaining("suspendu") }),
    );
  });

  it("les six états connus passent tous, `expired` n'est pas un cas à part", async () => {
    for (const etat of [
      "live",
      "scheduled",
      "pending",
      "expired",
      "activation_expired",
      "revoked",
    ]) {
      mocks.rpc.mockResolvedValue({ data: [ligne({ state: etat })], error: null });
      expect((await etatOctroiModule(ORG, "wheel", MAINTENANT))?.etat).toBe(etat);
    }
    expect(mocks.reportError).not.toHaveBeenCalled();
  });

  it("ne rend que la PREMIÈRE ligne : la RPC classe déjà par faveur au client", async () => {
    // `org_module_grant_state` porte `limit 1` et un `order by` qui met `live`
    // devant. Choisir ici parmi plusieurs lignes rejouerait ce tri — et un jour
    // autrement que la base, donc en contredisant le droit.
    mocks.rpc.mockResolvedValue({
      data: [ligne({ state: "live", ends_at: null }), ligne({ state: "expired" })],
      error: null,
    });

    const etat = await etatOctroiModule(ORG, "wheel", MAINTENANT);
    expect(etat).toEqual({ etat: "live", endsAt: null, activateBy: null });
  });
});
