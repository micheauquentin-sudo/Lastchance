// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/* ════════════════════════════════════════════════════════════
 * Le portefeuille du client — chargement serveur.
 *
 * Trois interdits, et ce sont eux qui sont testés :
 *   1. aucun jeton en entrée (donc aucun lien partageable possible) ;
 *   2. AUCUN code de retrait journalisé — c'est un droit au porteur ;
 *   3. aucun cookie posé sur un chemin de consultation.
 *
 * Plus un quatrième point, de qualité de service : « pas de cookie » est un
 * état NORMAL et distinct de « base injoignable ».
 * ════════════════════════════════════════════════════════════ */

const TOKEN_HASH = "a".repeat(64);
const CODE_1 = "WHEEL-SECRET-1";
const CODE_2 = "HUNT-SECRET-2";

const mocks = vi.hoisted(() => ({
  peekPlayerDeviceTokenHash: vi.fn(),
  ensurePlayerDeviceCookie: vi.fn(),
  ensureProgressivePlayerIdentity: vi.fn(),
  reportError: vi.fn(),
  rpc: vi.fn(),
}));

vi.mock("@/lib/player-identity", () => ({
  peekPlayerDeviceTokenHash: (...a: unknown[]) => mocks.peekPlayerDeviceTokenHash(...a),
  ensurePlayerDeviceCookie: (...a: unknown[]) => mocks.ensurePlayerDeviceCookie(...a),
  ensureProgressivePlayerIdentity: (...a: unknown[]) =>
    mocks.ensureProgressivePlayerIdentity(...a),
}));
vi.mock("@/lib/monitoring", () => ({
  reportError: (...a: unknown[]) => mocks.reportError(...a),
}));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({ rpc: (...a: unknown[]) => mocks.rpc(...a) }),
}));

import { loadPlayerWallet } from "./player-wallet";

function row(over: Record<string, unknown> = {}) {
  return {
    organization_id: "org-1",
    organization_name: "Chez Marco",
    source_type: "wheel",
    label: "Café offert",
    code: CODE_1,
    status: "active",
    cancelled_cause: null,
    issued_at: "2026-07-20T10:00:00.000Z",
    expires_at: "2026-08-20T10:00:00.000Z",
    ...over,
  };
}

/** Tout ce qui a pu sortir du module : journaux, supervision, console. */
function trace(): string {
  return JSON.stringify([
    mocks.reportError.mock.calls,
    consoleSpies.log.mock.calls,
    consoleSpies.warn.mock.calls,
    consoleSpies.error.mock.calls,
    consoleSpies.info.mock.calls,
    consoleSpies.debug.mock.calls,
  ]);
}

let consoleSpies: Record<"log" | "warn" | "error" | "info" | "debug", ReturnType<typeof vi.spyOn>>;

beforeEach(() => {
  vi.clearAllMocks();
  mocks.peekPlayerDeviceTokenHash.mockResolvedValue(TOKEN_HASH);
  mocks.rpc.mockResolvedValue({ data: [row()], error: null });
  consoleSpies = {
    log: vi.spyOn(console, "log").mockImplementation(() => {}),
    warn: vi.spyOn(console, "warn").mockImplementation(() => {}),
    error: vi.spyOn(console, "error").mockImplementation(() => {}),
    info: vi.spyOn(console, "info").mockImplementation(() => {}),
    debug: vi.spyOn(console, "debug").mockImplementation(() => {}),
  };
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("INTERDIT 1 — aucun jeton en entrée, donc aucun lien partageable", () => {
  it("l'identité vient du COOKIE, et de rien d'autre", async () => {
    await loadPlayerWallet();

    expect(mocks.peekPlayerDeviceTokenHash).toHaveBeenCalledTimes(1);
    expect(mocks.rpc).toHaveBeenCalledWith("player_wallet", {
      p_token_hash: TOKEN_HASH,
      p_limit: 50,
    });
  });

  it("la signature n'accepte AUCUN identifiant — garantie de compilation", async () => {
    // Si un jour quelqu'un ouvre un paramètre (jeton, identifiant de joueur,
    // `searchParams`), cette ligne cesse d'être une erreur et `tsc` échoue sur
    // le `@ts-expect-error` devenu inutile. La garantie est donc tenue par le
    // compilateur, pas par une relecture.
    // @ts-expect-error — le portefeuille ne se charge QUE depuis le cookie.
    await loadPlayerWallet({ tokenHash: TOKEN_HASH });
  });
});

describe("INTERDIT 2 — le code de retrait n'est JAMAIS journalisé", () => {
  it("un chargement nominal ne laisse aucun code derrière lui", async () => {
    mocks.rpc.mockResolvedValue({
      data: [row(), row({ source_type: "hunt", code: CODE_2, status: "redeemed" })],
      error: null,
    });

    const view = await loadPlayerWallet();

    // Le code est bien RENDU au client — c'est la fonctionnalité.
    expect(view).toMatchObject({ status: "ready" });
    if (view.status !== "ready") throw new Error("état inattendu");
    expect(view.organizations[0].rewards[0].code).toBe(CODE_1);
    // …et il s'arrête là : ni console, ni Sentry, ni compteur.
    expect(trace()).not.toContain(CODE_1);
    expect(trace()).not.toContain(CODE_2);
    expect(mocks.reportError).not.toHaveBeenCalled();
  });

  it("même en cas de panne, ni le code ni le hash du cookie ne sortent", async () => {
    // Le message d'une erreur PostgREST peut recopier les paramètres de
    // l'appel : seul le CODE d'erreur, qui ne porte aucune donnée, part.
    mocks.rpc.mockResolvedValue({
      data: null,
      error: { code: "57014", message: `timeout sur p_token_hash=${TOKEN_HASH}` },
    });

    const view = await loadPlayerWallet();

    expect(view).toEqual({ status: "unavailable" });
    expect(mocks.reportError).toHaveBeenCalledWith("wallet.load", "player_wallet: 57014");
    expect(trace()).not.toContain(TOKEN_HASH);
  });

  it("TÉMOIN — la trace attrape bien ce qui sort", async () => {
    // Sans ce contrôle, les deux tests ci-dessus seraient verts sur une sonde
    // aveugle : c'est lui qui prouve qu'un `console.log` du code TOMBERAIT.
    console.log(`fuite: ${CODE_1}`);
    expect(trace()).toContain(CODE_1);
  });
});

describe("INTERDIT 3 — aucun cookie posé sur un chemin de consultation", () => {
  it("ni pose de cookie, ni création d'identité", async () => {
    await loadPlayerWallet();

    expect(mocks.ensurePlayerDeviceCookie).not.toHaveBeenCalled();
    expect(mocks.ensureProgressivePlayerIdentity).not.toHaveBeenCalled();
  });

  it("un visiteur sans cookie n'en repart pas avec une identité", async () => {
    mocks.peekPlayerDeviceTokenHash.mockResolvedValue(null);

    await loadPlayerWallet();

    expect(mocks.ensurePlayerDeviceCookie).not.toHaveBeenCalled();
    expect(mocks.ensureProgressivePlayerIdentity).not.toHaveBeenCalled();
  });
});

describe("« pas de cookie » est un état NORMAL", () => {
  it("aucune lecture, aucune remontée, un état à part entière", async () => {
    mocks.peekPlayerDeviceTokenHash.mockResolvedValue(null);

    const view = await loadPlayerWallet();

    expect(view).toEqual({ status: "no-device" });
    expect(mocks.rpc).not.toHaveBeenCalled();
    // Ce n'est pas un incident : ce visiteur n'a simplement jamais joué ici.
    expect(mocks.reportError).not.toHaveBeenCalled();
  });

  it("« rien à afficher » et « je ne sais pas » restent DISTINCTS", async () => {
    // Les confondre dirait « vous n'avez rien » à un client dont les gains
    // existent mais dont la base est momentanément injoignable.
    mocks.rpc.mockResolvedValue({ data: [], error: null });
    const vide = await loadPlayerWallet();

    mocks.rpc.mockResolvedValue({ data: null, error: { code: "08006" } });
    const panne = await loadPlayerWallet();

    expect(vide).toEqual({
      status: "ready",
      organizations: [],
      activeCount: 0,
      totalCount: 0,
    });
    expect(panne).toEqual({ status: "unavailable" });
  });
});

describe("regroupement et comptage", () => {
  it("groupe par commerçant, en conservant l'ordre de la RPC", async () => {
    mocks.rpc.mockResolvedValue({
      data: [
        row({ organization_id: "org-a", organization_name: "Alpha" }),
        row({
          organization_id: "org-a",
          organization_name: "Alpha",
          code: "A-2",
          status: "redeemed",
        }),
        row({
          organization_id: "org-b",
          organization_name: "Beta",
          code: "B-1",
          status: "expired",
        }),
      ],
      error: null,
    });

    const view = await loadPlayerWallet();
    if (view.status !== "ready") throw new Error("état inattendu");

    expect(view.organizations.map((o) => o.organizationName)).toEqual([
      "Alpha",
      "Beta",
    ]);
    expect(view.organizations[0].rewards).toHaveLength(2);
    // `activeCount` = ce qui est encore présentable en caisse.
    expect(view).toMatchObject({ activeCount: 1, totalCount: 3 });
  });

  it("le libellé GRAVÉ et l'échéance sont rendus tels quels", async () => {
    const view = await loadPlayerWallet();
    if (view.status !== "ready") throw new Error("état inattendu");

    expect(view.organizations[0].rewards[0]).toEqual({
      sourceType: "wheel",
      label: "Café offert",
      code: CODE_1,
      status: "active",
      cancelledCause: null,
      issuedAt: "2026-07-20T10:00:00.000Z",
      expiresAt: "2026-08-20T10:00:00.000Z",
    });
  });

  it("la CAUSE de l'annulation est portée jusqu'à l'écran", async () => {
    // Sans elle, l'écran servait un texte fixe accusant le commerçant — y
    // compris quand c'était la rétention qui avait emporté la source.
    mocks.rpc.mockResolvedValue({
      data: [
        row({ status: "cancelled", cancelled_cause: "purged" }),
        row({ code: "C-2", status: "cancelled", cancelled_cause: "merchant" }),
      ],
      error: null,
    });

    const view = await loadPlayerWallet();
    if (view.status !== "ready") throw new Error("état inattendu");

    expect(
      view.organizations[0].rewards.map((r) => r.cancelledCause),
    ).toEqual(["purged", "merchant"]);
  });

  it("une cause hors vocabulaire vaut `null`, jamais une cause devinée", async () => {
    // ROUGE SI quelqu'un recopie `row.cancelled_cause` tel quel : le type
    // généré l'annonce `string` alors que la RPC rend `null` hors annulation,
    // et une valeur inattendue ferait afficher une accusation inventée.
    mocks.rpc.mockResolvedValue({
      data: [
        row({ status: "cancelled", cancelled_cause: "PURGED" }),
        row({ code: "C-3", status: "active", cancelled_cause: null }),
      ],
      error: null,
    });

    const view = await loadPlayerWallet();
    if (view.status !== "ready") throw new Error("état inattendu");

    expect(
      view.organizations[0].rewards.map((r) => r.cancelledCause),
    ).toEqual([null, null]);
  });

  it("une ligne indescriptible est écartée, jamais présentée au hasard", async () => {
    mocks.rpc.mockResolvedValue({
      data: [row({ status: "inconnu" }), row({ code: "" }), row({ code: "OK-1" })],
      error: null,
    });

    const view = await loadPlayerWallet();
    if (view.status !== "ready") throw new Error("état inattendu");

    expect(view.totalCount).toBe(1);
    expect(view.organizations[0].rewards[0].code).toBe("OK-1");
  });
});
