// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  cookieValue: null as string | null,
  cookieWrites: [] as Array<{ name: string; value: string; options: unknown }>,
  rpcCalls: [] as Array<{ name: string; args: Record<string, unknown> }>,
  resolveData: [
    {
      player_id: "10000000-0000-4000-8000-000000000001",
      device_id: "10000000-0000-4000-8000-000000000002",
      experience_membership_id: "10000000-0000-4000-8000-000000000003",
      should_rotate: false,
    },
  ] as unknown,
  resolveError: null as unknown,
  resolveResponses: null as
    | Array<{ data: unknown; error: unknown }>
    | null,
  rotationData: [
    {
      player_id: "10000000-0000-4000-8000-000000000001",
      device_id: "10000000-0000-4000-8000-000000000004",
    },
  ] as unknown,
  rotationError: null as unknown,
  /** Compteurs `ops_metrics` posés — la mesure du silence d'ADR-048. */
  compteurs: [] as string[],
  /** Alertes Sentry posées, par scope. */
  erreurs: [] as string[],
  /** Ligne rendue par `from("spins")…maybeSingle()`. */
  spinRow: null as Record<string, unknown> | null,
  spinError: null as unknown,
  /** Filtres appliqués à la lecture du spin — org-scoping et cible. */
  spinFilters: [] as Array<Record<string, unknown>>,
}));

vi.mock("@/lib/monitoring", () => ({
  recordCounter: (op: string) => state.compteurs.push(op),
  reportError: (scope: string) => state.erreurs.push(scope),
}));

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) =>
      name === "lc-player" && state.cookieValue
        ? { value: state.cookieValue }
        : undefined,
    set: (name: string, value: string, options: unknown) => {
      state.cookieValue = value;
      state.cookieWrites.push({ name, value, options });
    },
  }),
}));

function adminMock() {
  return {
    rpc: async (name: string, args: Record<string, unknown>) => {
      state.rpcCalls.push({ name, args });
      if (name === "resolve_player_identity" && state.resolveResponses) {
        const response = state.resolveResponses.shift();
        if (response) return response;
      }
      return name === "rotate_player_device"
        ? { data: state.rotationData, error: state.rotationError }
        : { data: state.resolveData, error: state.resolveError };
    },
    // La table et les colonnes ne sont pas discriminées : ce module ne lit
    // qu'une seule table (`spins`), et c'est le filtre `id` qui est asserté.
    from: () => ({
      select: () => {
        const filters: Record<string, unknown> = {};
        const builder = {
          eq: (column: string, value: unknown) => {
            filters[column] = value;
            return builder;
          },
          maybeSingle: async () => {
            state.spinFilters.push({ ...filters });
            return { data: state.spinRow, error: state.spinError };
          },
        };
        return builder;
      },
    }),
  };
}

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => adminMock(),
}));

import {
  bridgeOfferedSpinToCampaign,
  ensurePlayerDeviceCookie,
  ensureProgressivePlayerIdentity,
  generatePlayerDeviceToken,
  hashPlayerDeviceToken,
  PLAYER_COOKIE_NAME,
  PLAYER_DEVICE_TOKEN_PATTERN,
  PLAYER_IDENTITY_HASH_PATTERN,
} from "./player-identity";

const ORGANIZATION_ID = "20000000-0000-4000-8000-000000000001";
const CAMPAIGN_ID = "20000000-0000-4000-8000-000000000002";
const QR_ID = "20000000-0000-4000-8000-000000000003";
const LEGACY_HASH = "a".repeat(64);

beforeEach(() => {
  state.cookieValue = null;
  state.cookieWrites = [];
  state.rpcCalls = [];
  state.resolveData = [
    {
      player_id: "10000000-0000-4000-8000-000000000001",
      device_id: "10000000-0000-4000-8000-000000000002",
      experience_membership_id: "10000000-0000-4000-8000-000000000003",
      should_rotate: false,
    },
  ];
  state.resolveError = null;
  state.resolveResponses = null;
  state.rotationData = [
    {
      player_id: "10000000-0000-4000-8000-000000000001",
      device_id: "10000000-0000-4000-8000-000000000004",
    },
  ];
  state.rotationError = null;
  state.compteurs = [];
  state.erreurs = [];
  state.spinRow = null;
  state.spinError = null;
  state.spinFilters = [];
});

describe("jeton lc-player", () => {
  it("génère un jeton opaque de 256 bits et un hash domaine-séparé", () => {
    const token = generatePlayerDeviceToken();
    const hash = hashPlayerDeviceToken(token);

    expect(token).toMatch(PLAYER_DEVICE_TOKEN_PATTERN);
    expect(hash).toMatch(PLAYER_IDENTITY_HASH_PATTERN);
    expect(hash).not.toContain(token);
    expect(hashPlayerDeviceToken(token)).toBe(hash);
  });

  it("pose une seule fois le cookie commun sans appeler la base", async () => {
    await ensurePlayerDeviceCookie();
    const first = state.cookieValue;
    await ensurePlayerDeviceCookie();

    expect(first).toMatch(PLAYER_DEVICE_TOKEN_PATTERN);
    expect(state.cookieWrites).toHaveLength(1);
    expect(state.cookieWrites[0].name).toBe(PLAYER_COOKIE_NAME);
    expect(state.rpcCalls).toEqual([]);
  });
});

describe("ensureProgressivePlayerIdentity", () => {
  it("lazy-link le hash legacy sans envoyer les jetons bruts", async () => {
    state.cookieValue = "A".repeat(43);

    const result = await ensureProgressivePlayerIdentity({
      organizationId: ORGANIZATION_ID,
      experienceKind: "campaign",
      experienceId: CAMPAIGN_ID,
      legacyIdentityHash: LEGACY_HASH,
      acquisitionSource: "qr",
      acquisitionQrCodeId: QR_ID,
    });

    expect(result).toEqual({
      ok: true,
      playerId: "10000000-0000-4000-8000-000000000001",
      deviceId: "10000000-0000-4000-8000-000000000002",
      experienceMembershipId: "10000000-0000-4000-8000-000000000003",
    });
    expect(state.rpcCalls).toHaveLength(1);
    expect(state.rpcCalls[0]).toMatchObject({
      name: "resolve_player_identity",
      args: {
        p_organization_id: ORGANIZATION_ID,
        p_experience_kind: "campaign",
        p_experience_id: CAMPAIGN_ID,
        p_legacy_identity_hash: LEGACY_HASH,
        p_acquisition_source: "qr",
        p_acquisition_qr_code_id: QR_ID,
      },
    });
    expect(state.rpcCalls[0].args.p_device_token_hash).toMatch(
      PLAYER_IDENTITY_HASH_PATTERN,
    );
    expect(JSON.stringify(state.rpcCalls[0])).not.toContain(state.cookieValue);
    expect(state.cookieWrites).toEqual([]);
  });

  it("ne persiste un nouveau cookie qu'après la résolution DB", async () => {
    const result = await ensureProgressivePlayerIdentity({
      organizationId: ORGANIZATION_ID,
      experienceKind: "campaign",
      experienceId: CAMPAIGN_ID,
    });

    expect(result.ok).toBe(true);
    expect(state.cookieWrites).toHaveLength(1);
    expect(state.cookieValue).toMatch(PLAYER_DEVICE_TOKEN_PATTERN);
    expect(state.rpcCalls[0].args).toMatchObject({
      p_legacy_identity_hash: null,
      p_acquisition_qr_code_id: null,
    });
  });

  it("fait tourner le cookie lorsque la base le demande", async () => {
    state.cookieValue = "B".repeat(43);
    state.resolveData = [
      {
        player_id: "10000000-0000-4000-8000-000000000001",
        device_id: "10000000-0000-4000-8000-000000000002",
        experience_membership_id: "10000000-0000-4000-8000-000000000003",
        should_rotate: true,
      },
    ];

    const result = await ensureProgressivePlayerIdentity({
      organizationId: ORGANIZATION_ID,
      experienceKind: "campaign",
      experienceId: CAMPAIGN_ID,
    });

    expect(result).toMatchObject({
      ok: true,
      deviceId: "10000000-0000-4000-8000-000000000004",
    });
    expect(state.rpcCalls.map((call) => call.name)).toEqual([
      "resolve_player_identity",
      "rotate_player_device",
    ]);
    expect(state.cookieWrites).toHaveLength(1);
    expect(state.cookieValue).not.toBe("B".repeat(43));
  });

  it("récupère via le hash legacy si un ancien cookie roté a expiré", async () => {
    const expiredToken = "C".repeat(43);
    state.cookieValue = expiredToken;
    state.resolveResponses = [
      {
        data: null,
        error: {
          code: "22023",
          message: "expired player device token",
        },
      },
      {
        data: state.resolveData,
        error: null,
      },
    ];

    const result = await ensureProgressivePlayerIdentity({
      organizationId: ORGANIZATION_ID,
      experienceKind: "campaign",
      experienceId: CAMPAIGN_ID,
      legacyIdentityHash: LEGACY_HASH,
    });

    expect(result.ok).toBe(true);
    expect(
      state.rpcCalls.filter((call) => call.name === "resolve_player_identity"),
    ).toHaveLength(2);
    expect(state.cookieWrites).toHaveLength(1);
    expect(state.cookieValue).not.toBe(expiredToken);
  });

  it("reste best-effort si le pont DB est indisponible", async () => {
    state.resolveData = null;
    state.resolveError = { code: "PGRST202" };

    await expect(
      ensureProgressivePlayerIdentity({
        organizationId: ORGANIZATION_ID,
        experienceKind: "campaign",
        experienceId: CAMPAIGN_ID,
        legacyIdentityHash: LEGACY_HASH,
      }),
    ).resolves.toEqual({ ok: false, reason: "unavailable" });
    expect(state.cookieWrites).toEqual([]);
  });

  it("refuse localement un scope ou un hash non conforme", async () => {
    await expect(
      ensureProgressivePlayerIdentity({
        organizationId: "pas-un-uuid",
        experienceKind: "campaign",
        experienceId: CAMPAIGN_ID,
        legacyIdentityHash: "hash-brut",
      }),
    ).resolves.toEqual({ ok: false, reason: "invalid_input" });
    expect(state.rpcCalls).toEqual([]);
  });
});

/* ════════════════════════════════════════════════════════════
 * LE SILENCE EST MESURÉ — mais reste NON BLOQUANT
 *
 * Cette fonction avalait toute panne sans un mot : ni alerte, ni compteur.
 * La population des ponts non posés était donc SUPPOSÉE, jamais mesurée —
 * la forme exacte de silence qu'ADR-048 impose de rompre, et celle qui a
 * laissé vivre le défaut du tour offert sans que personne ne le voie.
 * ════════════════════════════════════════════════════════════ */
describe("pont d'identité — une panne se compte, elle ne bloque pas", () => {
  it("RPC indisponible : un compteur nommant la famille, et une alerte", async () => {
    state.resolveData = null;
    state.resolveError = { code: "PGRST202", message: "fonction absente" };

    const result = await ensureProgressivePlayerIdentity({
      organizationId: ORGANIZATION_ID,
      experienceKind: "hunt",
      experienceId: CAMPAIGN_ID,
      legacyIdentityHash: LEGACY_HASH,
    });

    // Le contrat de retour ne change PAS : un pont qui échoue ne doit jamais
    // empêcher un joueur de jouer. On veut le savoir, pas refuser.
    expect(result).toEqual({ ok: false, reason: "unavailable" });
    expect(state.compteurs).toEqual([
      "player-identity.bridge-failed.unavailable.hunt",
    ]);
    expect(state.erreurs).toEqual(["player-identity.bridge"]);
  });

  it("entrée invalide : comptée sans étiqueter une famille non validée", async () => {
    // ROUGE SI quelqu'un étiquette le compteur avec `input.experienceKind`
    // brut : c'est précisément la valeur que le schéma vient de refuser, donc
    // une chaîne arbitraire d'appelant dans un nom de métrique.
    await ensureProgressivePlayerIdentity({
      organizationId: ORGANIZATION_ID,
      experienceKind: "famille-inventee" as never,
      experienceId: CAMPAIGN_ID,
    });

    expect(state.compteurs).toEqual([
      "player-identity.bridge-failed.invalid_input.unvalidated",
    ]);
    expect(state.compteurs.join()).not.toContain("famille-inventee");
  });

  it("AUCUN secret ne part dans la trace — ni hash legacy, ni jeton", async () => {
    // La trace est une métrique et une alerte : elles sortent du périmètre du
    // joueur. Y laisser un hash d'identité en ferait un identifiant durable
    // dans un système d'observabilité.
    state.cookieValue = "D".repeat(43);
    state.resolveData = null;
    state.resolveError = { message: "panne" };

    await ensureProgressivePlayerIdentity({
      organizationId: ORGANIZATION_ID,
      experienceKind: "campaign",
      experienceId: CAMPAIGN_ID,
      legacyIdentityHash: LEGACY_HASH,
    });

    const trace = JSON.stringify([state.compteurs, state.erreurs]);
    expect(trace).not.toContain(LEGACY_HASH);
    expect(trace).not.toContain(state.cookieValue);
  });

  it("TÉMOIN : un pont qui réussit ne compte rien et n'alerte pas", async () => {
    // Zéro ligne est la valeur SAINE. Sans ce témoin, un compteur qui
    // s'incrémenterait en régime nominal rendrait la mesure inexploitable.
    await ensureProgressivePlayerIdentity({
      organizationId: ORGANIZATION_ID,
      experienceKind: "campaign",
      experienceId: CAMPAIGN_ID,
      legacyIdentityHash: LEGACY_HASH,
    });

    expect(state.compteurs).toEqual([]);
    expect(state.erreurs).toEqual([]);
  });
});

/* ════════════════════════════════════════════════════════════
 * LE PONT `campaign` DU TOUR OFFERT (ADR-066)
 *
 * Un tour offert (calendrier, fidélité, quiz, parrainage) crée un spin sur une
 * VRAIE roue ; `claimPrize` en tire une `participations`, que le miroir du
 * registre résout par (`campaign`, campaign_id, player_key). Aucun module ne
 * posait ce pont-là : `player_id` restait null et le lot n'apparaissait jamais
 * sur `/portefeuille`.
 * ════════════════════════════════════════════════════════════ */
describe("bridgeOfferedSpinToCampaign", () => {
  const SPIN_ID = "30000000-0000-4000-8000-000000000001";

  it("pointe la CAMPAGNE du spin, avec le player_key que le registre lira", async () => {
    state.spinRow = {
      organization_id: ORGANIZATION_ID,
      campaign_id: CAMPAIGN_ID,
      player_key: LEGACY_HASH,
    };

    await bridgeOfferedSpinToCampaign(adminMock() as never, SPIN_ID);

    // Le triplet ponté doit être EXACTEMENT celui que
    // `reward_player_from_legacy(org, 'campaign', p.campaign_id, p.player_key)`
    // interrogera. Une seule des trois valeurs prise ailleurs (par exemple un
    // `campaignId` d'appelant) et le pont est posé à côté de la serrure.
    expect(state.rpcCalls).toHaveLength(1);
    expect(state.rpcCalls[0]).toMatchObject({
      name: "resolve_player_identity",
      args: {
        p_organization_id: ORGANIZATION_ID,
        p_experience_kind: "campaign",
        p_experience_id: CAMPAIGN_ID,
        p_legacy_identity_hash: LEGACY_HASH,
      },
    });
    // Le spin est lu par son identifiant, pas balayé.
    expect(state.spinFilters).toEqual([{ id: SPIN_ID }]);
  });

  it("déclare son ignorance sur l'acquisition plutôt qu'une source fausse", async () => {
    // ROUGE SI quelqu'un met `qr` (aucun QR de cette campagne n'a été scanné)
    // ou `direct` : `resolve_player_identity` ne remplace une source déjà posée
    // que si elle vaut `unknown`. Mentir ici, c'est mentir DÉFINITIVEMENT.
    state.spinRow = {
      organization_id: ORGANIZATION_ID,
      campaign_id: CAMPAIGN_ID,
      player_key: LEGACY_HASH,
    };

    await bridgeOfferedSpinToCampaign(adminMock() as never, SPIN_ID);

    expect(state.rpcCalls[0].args.p_acquisition_source).toBe("unknown");
  });

  it("spin illisible : compté et signalé, jamais de pont posé à l'aveugle", async () => {
    state.spinRow = null;

    await bridgeOfferedSpinToCampaign(adminMock() as never, SPIN_ID);

    expect(state.rpcCalls).toEqual([]);
    expect(state.compteurs).toEqual(["player-identity.offered-spin-unreadable"]);
    expect(state.erreurs).toEqual(["player-identity.offered-spin"]);
  });

  it("spin sans campagne : refus net, aucun appel avec un champ nul", async () => {
    // Un `campaign_id` nul passé tel quel ferait lever `resolve_player_identity`
    // sur son contrôle de scope — panne comptée pour rien, pont jamais posé.
    state.spinRow = {
      organization_id: ORGANIZATION_ID,
      campaign_id: null,
      player_key: LEGACY_HASH,
    };

    await bridgeOfferedSpinToCampaign(adminMock() as never, SPIN_ID);

    expect(state.rpcCalls).toEqual([]);
  });
});
