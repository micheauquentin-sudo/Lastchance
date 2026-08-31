// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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
  /**
   * Ce que `lookup_player_legacy_identities` rend — la reprise après rotation.
   * N LIGNES, de la plus récente à la plus ancienne : c'est tout l'objet de la
   * RPC neuve (ID-3, migration 20261117120000).
   */
  lookupData: null as unknown,
  lookupError: null as unknown,
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
      if (name === "lookup_player_legacy_identities") {
        return { data: state.lookupData, error: state.lookupError };
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
  lookupLegacyIdentityHashes,
  PLAYER_COOKIE_NAME,
  PLAYER_DEVICE_TOKEN_PATTERN,
  PLAYER_IDENTITY_HASH_PATTERN,
} from "./player-identity";

const ORGANIZATION_ID = "20000000-0000-4000-8000-000000000001";
const CAMPAIGN_ID = "20000000-0000-4000-8000-000000000002";
const QR_ID = "20000000-0000-4000-8000-000000000003";
const LEGACY_HASH = "a".repeat(64);

/**
 * HORLOGE PILOTÉE — obligatoire depuis que la trace est étouffée par fenêtre.
 *
 * `traceIdentityFailure` ne rend qu'une alerte et un compteur par cause et par
 * minute, et cet état vit dans le MODULE, pas dans `state` : sans horloge
 * pilotée, un test étoufferait le suivant et la suite deviendrait dépendante
 * de son ordre. Chaque test démarre donc une minute plus loin que le
 * précédent, ce qui est aussi le cas nominal en production (des pannes
 * espacées).
 */
let horloge = Date.parse("2026-08-03T09:00:00.000Z");

beforeEach(() => {
  vi.useFakeTimers();
  horloge += 120_000;
  vi.setSystemTime(horloge);
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
  state.lookupData = null;
  state.lookupError = null;
  state.spinRow = null;
  state.spinError = null;
  state.spinFilters = [];
});

afterEach(() => {
  vi.useRealTimers();
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

  it("une panne GÉNÉRALE ne produit pas une trace par requête", async () => {
    // LE DÉFAUT FERMÉ. `ensureProgressivePlayerIdentity` est appelée à chaque
    // spin, tampon et join des neuf modules — deux fois sur les quatre chemins
    // de tour offert. Une cause générale (sel mal déployé, RPC en échec après
    // migration) faisait donc produire à CHAQUE requête joueur un événement
    // Sentry ET une ligne `ops_metrics` (`recordCounter` fait un `insert`,
    // jamais un upsert). La mesure s'emballait au moment précis où
    // l'infrastructure est déjà en difficulté, et le quota Sentry brûlé rendait
    // aveugle sur tout le reste.
    state.resolveData = null;
    state.resolveError = { code: "PGRST202", message: "fonction absente" };

    for (let i = 0; i < 50; i += 1) {
      await ensureProgressivePlayerIdentity({
        organizationId: ORGANIZATION_ID,
        experienceKind: "hunt",
        experienceId: CAMPAIGN_ID,
        legacyIdentityHash: LEGACY_HASH,
      });
    }

    // UNE trace pour cinquante requêtes — et surtout : pas zéro. Zéro reste la
    // valeur SAINE, une population non nulle nomme toujours la famille dont les
    // lots n'atteindront pas `/portefeuille`.
    expect(state.compteurs).toEqual([
      "player-identity.bridge-failed.unavailable.hunt",
    ]);
    expect(state.erreurs).toEqual(["player-identity.bridge"]);
  });

  it("l'étouffement est PAR CAUSE : une seconde panne n'est pas masquée", async () => {
    // ROUGE SI la fenêtre devient globale. Une panne de la famille `hunt`
    // masquerait alors une panne de `quiz` commencée dans la même minute — on
    // aurait remplacé un emballement par un angle mort.
    state.resolveData = null;
    state.resolveError = { message: "panne" };

    for (const famille of ["hunt", "quiz", "hunt", "quiz"] as const) {
      await ensureProgressivePlayerIdentity({
        organizationId: ORGANIZATION_ID,
        experienceKind: famille,
        experienceId: CAMPAIGN_ID,
        legacyIdentityHash: LEGACY_HASH,
      });
    }

    expect(state.compteurs).toEqual([
      "player-identity.bridge-failed.unavailable.hunt",
      "player-identity.bridge-failed.unavailable.quiz",
    ]);
  });

  it("la fenêtre écoulée, la panne se recompte — elle ne se tait pas", async () => {
    // Le contrepoids du test précédent : étouffer n'est pas éteindre. Une panne
    // d'une heure rend au moins soixante lignes, largement de quoi la voir.
    state.resolveData = null;
    state.resolveError = { message: "panne" };
    const appel = () =>
      ensureProgressivePlayerIdentity({
        organizationId: ORGANIZATION_ID,
        experienceKind: "calendar",
        experienceId: CAMPAIGN_ID,
        legacyIdentityHash: LEGACY_HASH,
      });

    await appel();
    // Juste EN DEÇÀ de la fenêtre : encore étouffé.
    vi.setSystemTime(horloge + 59_000);
    await appel();
    expect(state.compteurs).toHaveLength(1);

    // Au-delà : la trace repart.
    vi.setSystemTime(horloge + 61_000);
    await appel();
    expect(state.compteurs).toHaveLength(2);
  });

  it("AUCUNE saisie n'entre dans la clé d'étouffement", async () => {
    // La clé est `${reason}.${experienceKind}` : deux motifs × dix étiquettes,
    // toutes issues d'un vocabulaire fermé. Une clé nourrie d'une valeur
    // d'appelant ferait croître sans borne une Map de module — et rendrait
    // l'étouffement inopérant par la même occasion.
    await ensureProgressivePlayerIdentity({
      organizationId: ORGANIZATION_ID,
      experienceKind: "famille-inventee" as never,
      experienceId: CAMPAIGN_ID,
    });
    await ensureProgressivePlayerIdentity({
      organizationId: ORGANIZATION_ID,
      experienceKind: "autre-invention" as never,
      experienceId: CAMPAIGN_ID,
    });

    // Deux familles inventées, UNE seule trace : les deux ont été ramenées à
    // l'étiquette `unvalidated` avant d'atteindre la clé.
    expect(state.compteurs).toEqual([
      "player-identity.bridge-failed.invalid_input.unvalidated",
    ]);
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
    expect(state.compteurs).toEqual([
      "player-identity.bridge-failed.unavailable.offered-spin",
    ]);
    expect(state.erreurs).toEqual(["player-identity.offered-spin"]);
  });

  it("spin illisible en RAFALE : une trace par fenêtre, pas une par requête", async () => {
    // ROUGE SI cette branche retrouve sa trace directe (`reportError` +
    // `recordCounter` sans étouffement), ce qu'elle a portée jusqu'à ce que la
    // revue sécurité le relève ailleurs. Le chemin est PUBLIC et parcouru à
    // chaque tour offert : une cause générale — base qui refuse, spin effacé
    // par une purge — y produisait une écriture `ops_metrics` et un événement
    // Sentry PAR REQUÊTE. Corriger trois branches sur quatre laissait la
    // dernière porter tout le débit d'une panne, ce qui ne corrige rien.
    state.spinRow = null;

    await bridgeOfferedSpinToCampaign(adminMock() as never, SPIN_ID);
    await bridgeOfferedSpinToCampaign(adminMock() as never, SPIN_ID);
    await bridgeOfferedSpinToCampaign(adminMock() as never, SPIN_ID);

    expect(state.compteurs, "la rafale n'a pas été étouffée").toHaveLength(1);
    expect(state.erreurs, "Sentry a reçu la rafale entière").toHaveLength(1);
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

// ────────────────────────────────────────────────────────────
// `lookupLegacyIdentityHashes` — la reprise après rotation du cookie
//
// Au-delà de 90 jours, `resolve_player_identity` fait tourner le cookie
// `lc-player` : l'empreinte change, et les lignes déjà écrites portent
// l'ancienne. Cette fonction est le SECOND essai — jamais le premier — que ses
// appelants ne paient que lorsqu'une lecture normale n'a rien rendu.
// ────────────────────────────────────────────────────────────

const ANCIENNE_EMPREINTE = "b".repeat(64);
/** Deux rotations plus tôt, et trois — le cas qu'ID-3 rend atteignable. */
const PLUS_ANCIENNE = "d".repeat(64);
const LA_PREMIERE = "e".repeat(64);
const EMPREINTE_COURANTE = "c".repeat(64);
const OFFRE_ID = "20000000-0000-4000-8000-000000000004";

describe("lookupLegacyIdentityHashes", () => {
  it("rend l'ancienne empreinte, sur la portée EXACTE demandée", async () => {
    state.lookupData = [
      {
        player_id: "10000000-0000-4000-8000-000000000001",
        experience_membership_id: "10000000-0000-4000-8000-000000000003",
        legacy_identity_hash: ANCIENNE_EMPREINTE,
      },
    ];

    const anciennes = await lookupLegacyIdentityHashes({
      deviceTokenHash: EMPREINTE_COURANTE,
      organizationId: ORGANIZATION_ID,
      experienceKind: "reserver_stock",
      experienceId: OFFRE_ID,
    });

    expect(anciennes).toEqual([ANCIENNE_EMPREINTE]);
    // LA PORTÉE EST LA GARDE. La RPC part de `player_devices.token_hash` et ne
    // rend que l'empreinte d'une adhésion du MÊME joueur, sur la MÊME
    // organisation et la MÊME expérience — c'est ce qui empêche de retrouver la
    // ligne de quelqu'un d'autre. Élargir ces arguments, ou en omettre un,
    // rouvrirait exactement ce trou : on les assert donc un par un.
    expect(state.rpcCalls).toEqual([
      {
        name: "lookup_player_legacy_identities",
        args: {
          p_device_token_hash: EMPREINTE_COURANTE,
          p_organization_id: ORGANIZATION_ID,
          p_experience_kind: "reserver_stock",
          p_experience_id: OFFRE_ID,
        },
      },
    ]);
  });

  it("rend TOUTES les empreintes, dans l'ordre rendu par la RPC", async () => {
    // LE CŒUR D'ID-3. L'ancienne `lookup_player_identity` rendait `limit 1` : un
    // joueur ayant tourné DEUX fois d'appareil voyait toutes ses empreintes sauf
    // l'avant-dernière devenir inatteignables, et la prise écrite sous la plus
    // ancienne était perdue pour de bon. Un seul élément ici, et le repli
    // multi-empreintes de `reserver-context` retomberait au comportement d'hier
    // sans qu'aucun test ne rougisse.
    state.lookupData = [
      { legacy_identity_hash: ANCIENNE_EMPREINTE },
      { legacy_identity_hash: PLUS_ANCIENNE },
      { legacy_identity_hash: LA_PREMIERE },
    ];

    expect(
      await lookupLegacyIdentityHashes({
        deviceTokenHash: EMPREINTE_COURANTE,
        organizationId: ORGANIZATION_ID,
        experienceKind: "reserver_stock",
        experienceId: OFFRE_ID,
      }),
      // L'ORDRE EST UN CONTRAT : `last_seen_at desc` en base, donc la première
      // rendue ici est exactement celle que rendait l'ancienne RPC.
    ).toEqual([ANCIENNE_EMPREINTE, PLUS_ANCIENNE, LA_PREMIERE]);
  });

  it("écarte les valeurs illisibles et les doublons, garde le reste", async () => {
    // Une seule ligne fautive ne doit pas emporter les autres : le repli qui
    // consomme cette liste n'a besoin que d'UNE empreinte juste pour retrouver
    // la prise, et refuser en bloc lui retirerait celles qui vont bien.
    state.lookupData = [
      { legacy_identity_hash: "pas-une-empreinte" },
      { legacy_identity_hash: null },
      { legacy_identity_hash: PLUS_ANCIENNE },
      { legacy_identity_hash: PLUS_ANCIENNE },
    ];

    expect(
      await lookupLegacyIdentityHashes({
        deviceTokenHash: EMPREINTE_COURANTE,
        organizationId: ORGANIZATION_ID,
        experienceKind: "reserver_stock",
        experienceId: OFFRE_ID,
      }),
    ).toEqual([PLUS_ANCIENNE]);
  });

  it("les deux familles neuves de Réserver sont acceptées par le schéma", async () => {
    // ROUGE SI le miroir applicatif du `check` SQL perd une famille : le schéma
    // Zod la refuserait AVANT la requête, et la reprise d'un service ou d'une
    // file serait morte sans une ligne de journal — `invalid_input`, compté
    // sous `unvalidated`, donc sans même nommer la famille perdue.
    state.lookupData = [{ legacy_identity_hash: ANCIENNE_EMPREINTE }];
    for (const famille of ["reserver_activity", "reserver_queue"] as const) {
      state.rpcCalls = [];
      expect(
        await lookupLegacyIdentityHashes({
          deviceTokenHash: EMPREINTE_COURANTE,
          organizationId: ORGANIZATION_ID,
          experienceKind: famille,
          experienceId: OFFRE_ID,
        }),
      ).toEqual([ANCIENNE_EMPREINTE]);
      expect(state.rpcCalls[0]?.args.p_experience_kind).toBe(famille);
    }
  });

  it("appareil inconnu : aucune ligne, liste VIDE, et AUCUNE trace", async () => {
    // Le contrôle négatif du repli : un appareil qui n'a jamais rien fait sur
    // cette expérience — celui d'un autre joueur, ou d'un visiteur neuf — ne
    // reçoit l'empreinte de personne. Et ce silence est SAIN : le tracer ferait
    // du cas majoritaire un incident permanent.
    state.lookupData = [];

    const anciennes = await lookupLegacyIdentityHashes({
      deviceTokenHash: EMPREINTE_COURANTE,
      organizationId: ORGANIZATION_ID,
      experienceKind: "reserver_stock",
      experienceId: OFFRE_ID,
    });

    expect(anciennes).toEqual([]);
    expect(state.compteurs).toEqual([]);
    expect(state.erreurs).toEqual([]);
  });

  it("empreinte nulle sur une ligne : écartée, pas propagée", async () => {
    // La jointure de la RPC neuve est INTERNE, donc ce cas ne devrait plus
    // arriver — et c'est justement pourquoi la garde reste : cette valeur repart
    // en argument d'une RPC qui lève `22023` sur une empreinte mal formée, et
    // une garde qui repose sur « le générateur l'a dit » ne garde rien.
    state.lookupData = [
      {
        player_id: "10000000-0000-4000-8000-000000000001",
        experience_membership_id: "10000000-0000-4000-8000-000000000003",
        legacy_identity_hash: null,
      },
    ];

    expect(
      await lookupLegacyIdentityHashes({
        deviceTokenHash: EMPREINTE_COURANTE,
        organizationId: ORGANIZATION_ID,
        experienceKind: "reserver_stock",
        experienceId: OFFRE_ID,
      }),
    ).toEqual([]);
  });

  it("empreinte rendue ÉGALE à la courante : écartée, rien à reprendre", async () => {
    // Cas réel côté Réserver, où l'empreinte du cookie EST l'empreinte
    // historique : le joueur qui reprend une part après sa rotation réinscrit la
    // NOUVELLE dans `player_legacy_identities`, qui devient la plus récente. La
    // rendre ferait relire deux fois la même chose.
    state.lookupData = [
      {
        player_id: "10000000-0000-4000-8000-000000000001",
        experience_membership_id: "10000000-0000-4000-8000-000000000003",
        legacy_identity_hash: EMPREINTE_COURANTE,
      },
    ];

    expect(
      await lookupLegacyIdentityHashes({
        deviceTokenHash: EMPREINTE_COURANTE,
        organizationId: ORGANIZATION_ID,
        experienceKind: "reserver_stock",
        experienceId: OFFRE_ID,
      }),
    ).toEqual([]);
  });

  it("RPC en panne : liste VIDE, et un compteur DISTINCT de celui des ponts", async () => {
    state.lookupError = { message: "boom" };

    expect(
      await lookupLegacyIdentityHashes({
        deviceTokenHash: EMPREINTE_COURANTE,
        organizationId: ORGANIZATION_ID,
        experienceKind: "reserver_stock",
        experienceId: OFFRE_ID,
      }),
    ).toEqual([]);
    // Deux santés distinctes : un pont qui ne se pose plus perd des lots à
    // VENIR, une reprise qui ne répond plus cache des lignes DÉJÀ écrites.
    expect(state.compteurs).toEqual([
      "player-identity.lookup-failed.unavailable.reserver_stock",
    ]);
    expect(state.erreurs).toEqual(["player-identity.lookup"]);
  });

  it("entrée malformée : refus AVANT la moindre requête", async () => {
    expect(
      await lookupLegacyIdentityHashes({
        deviceTokenHash: "pas-une-empreinte",
        organizationId: ORGANIZATION_ID,
        experienceKind: "reserver_stock",
        experienceId: OFFRE_ID,
      }),
    ).toEqual([]);

    expect(state.rpcCalls).toEqual([]);
    expect(state.compteurs).toEqual([
      "player-identity.lookup-failed.invalid_input.unvalidated",
    ]);
  });
});
