import { afterEach, describe, expect, it, vi } from "vitest";

// Mock du client admin Supabase : on capture les appels RPC / insert sans
// toucher à une vraie base. Permet de vérifier le comportement de la couche
// applicative (fail-open/closed, forme des payloads) de façon déterministe.
const rpcMock = vi.fn();
const insertMock = vi.fn();

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    rpc: rpcMock,
    from: () => ({ insert: insertMock }),
  }),
}));

import { rateLimit } from "./rate-limit";
import { writeAuditLog } from "./audit";
import { verifyTurnstile } from "./turnstile";

afterEach(() => {
  vi.restoreAllMocks();
  rpcMock.mockReset();
  insertMock.mockReset();
  delete process.env.TURNSTILE_SECRET_KEY;
});

describe("rateLimit — couche applicative", () => {
  it("autorise quand le RPC renvoie true", async () => {
    rpcMock.mockResolvedValue({ data: true, error: null });
    expect(await rateLimit("b", { limit: 5, windowSeconds: 60 })).toBe(true);
    expect(rpcMock).toHaveBeenCalledWith("check_rate_limit", {
      p_bucket: "b",
      p_limit: 5,
      p_window_seconds: 60,
    });
  });

  it("bloque quand le RPC renvoie false (limite atteinte)", async () => {
    rpcMock.mockResolvedValue({ data: false, error: null });
    expect(await rateLimit("b", { limit: 5, windowSeconds: 60 })).toBe(false);
  });

  it("fail-open sur erreur RPC (ne bloque pas les légitimes sur incident infra)", async () => {
    rpcMock.mockResolvedValue({ data: null, error: { message: "boom" } });
    expect(await rateLimit("b", { limit: 5, windowSeconds: 60 })).toBe(true);
  });

  it("fail-open sur exception réseau", async () => {
    rpcMock.mockRejectedValue(new Error("network down"));
    expect(await rateLimit("b", { limit: 5, windowSeconds: 60 })).toBe(true);
  });
});

describe("writeAuditLog — couche applicative", () => {
  it("insère la ligne d'audit avec le bon payload", async () => {
    insertMock.mockResolvedValue({ error: null });
    await writeAuditLog({
      organizationId: "org-1",
      actor: "public",
      action: "participation.claim",
      metadata: { prize_id: "p1" },
    });
    expect(insertMock).toHaveBeenCalledWith({
      organization_id: "org-1",
      actor: "public",
      action: "participation.claim",
      metadata: { prize_id: "p1" },
    });
  });

  it("ne jette jamais si l'écriture échoue (best-effort)", async () => {
    insertMock.mockResolvedValue({ error: { message: "insert failed" } });
    await expect(
      writeAuditLog({ organizationId: null, actor: "system", action: "x" }),
    ).resolves.toBeUndefined();
  });

  it("métadonnées par défaut à {} si absentes", async () => {
    insertMock.mockResolvedValue({ error: null });
    await writeAuditLog({ organizationId: "o", actor: "a", action: "b" });
    expect(insertMock).toHaveBeenCalledWith(
      expect.objectContaining({ metadata: {} }),
    );
  });
});

describe("verifyTurnstile — chemins réseau (mock fetch)", () => {
  it("désactivé sans secret → accepte sans appel réseau", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    expect(await verifyTurnstile("token")).toBe(true);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("activé + jeton valide (siteverify success:true) → accepte", async () => {
    process.env.TURNSTILE_SECRET_KEY = "s";
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      json: async () => ({ success: true }),
    } as Response);
    expect(await verifyTurnstile("good-token", "1.2.3.4")).toBe(true);
  });

  it("activé + jeton refusé (siteverify success:false) → refuse", async () => {
    process.env.TURNSTILE_SECRET_KEY = "s";
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      json: async () => ({ success: false }),
    } as Response);
    expect(await verifyTurnstile("bad-token")).toBe(false);
  });

  it("activé + panne réseau siteverify → refuse (fail-closed)", async () => {
    process.env.TURNSTILE_SECRET_KEY = "s";
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("timeout"));
    expect(await verifyTurnstile("token")).toBe(false);
  });
});
