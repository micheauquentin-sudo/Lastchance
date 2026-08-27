// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const { db, moduleOpen, loadState, cookiesRead } = vi.hoisted(() => {
  const db = {
    session: null as Record<string, unknown> | null,
  };
  return {
    db,
    moduleOpen: vi.fn(),
    loadState: vi.fn(),
    cookiesRead: vi.fn(),
  };
});

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: () => ({
      select: () => {
        const query: {
          eq: () => typeof query;
          maybeSingle: () => Promise<{ data: Record<string, unknown> | null; error: null }>;
        } = {
          eq: () => query,
          maybeSingle: async () => ({ data: db.session, error: null }),
        };
        return query;
      },
    }),
  }),
}));

vi.mock("@/lib/module-acces-public", () => ({
  moduleOuvertAuJoueur: (...args: unknown[]) => moduleOpen(...args),
}));

vi.mock("@/lib/event-etat", () => ({
  chargerEtatLive: (...args: unknown[]) => loadState(...args),
}));

vi.mock("next/headers", () => ({
  cookies: async () => {
    cookiesRead();
    return { get: () => undefined };
  },
}));

import { loadEventPublicContext } from "./event-context";

const ORG_ID = "11111111-1111-4111-8111-111111111111";
const SESSION_ID = "22222222-2222-4222-8222-222222222222";

function draft(status: "draft" | "archived" = "draft") {
  return {
    id: SESSION_ID,
    join_code: "KRR3S",
    status,
    organization_id: ORG_ID,
    organizations: {
      id: ORG_ID,
      name: "Chez Marcel",
      logo_url: null,
      subscription_status: "active",
      trial_ends_at: null,
      past_due_since: null,
      addon_events: true,
      comp_access: false,
      comp_access_until: null,
      timezone: "Europe/Paris",
    },
  };
}

beforeEach(() => {
  db.session = draft();
  moduleOpen.mockReset();
  moduleOpen.mockResolvedValue(true);
  loadState.mockReset();
  loadState.mockResolvedValue({ state: "unavailable" });
  cookiesRead.mockReset();
});

describe("loadEventPublicContext — lien de salle d'attente", () => {
  it("rend seulement l'enveloppe sûre d'un brouillon, sans état ni cookie joueur", async () => {
    const ctx = await loadEventPublicContext("KRR3S", { allowDraftWaiting: true });

    expect(ctx).toMatchObject({
      ok: true,
      mode: "waiting",
      sessionId: SESSION_ID,
      joinCode: "KRR3S",
    });
    expect(loadState).not.toHaveBeenCalled();
    expect(cookiesRead).not.toHaveBeenCalled();
    expect(moduleOpen).toHaveBeenCalledWith("events", expect.objectContaining({ id: ORG_ID }));
  });

  it("ne rend pas archived joignable, même quand la salle d'attente est demandée", async () => {
    db.session = draft("archived");

    const ctx = await loadEventPublicContext("KRR3S", { allowDraftWaiting: true });

    expect(ctx.ok).toBe(false);
    expect(moduleOpen).not.toHaveBeenCalled();
  });

  it("garde le brouillon fermé pour les appels qui n'autorisent pas la salle d'attente", async () => {
    const ctx = await loadEventPublicContext("KRR3S");

    expect(ctx.ok).toBe(false);
    expect(loadState).toHaveBeenCalledTimes(1);
  });
});
