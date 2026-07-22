import { afterEach, describe, expect, it, vi } from "vitest";

// ────────────────────────────────────────────────────────────
// claimHuntReward — attache-email À USAGE UNIQUE (sécurité)
//
// Régression security-review : une fois la chasse terminée, claimHuntReward
// pouvait être rappelée sans borne avec un destinataire ARBITRAIRE à chaque
// appel → email-bombing depuis le domaine Resend du commerçant + empoisonnement
// de la newsletter. Le correctif rend l'attache-email idempotente (update
// conditionnel `email is null`, compare-and-swap atomique) : seul le PREMIER
// email déclenche l'envoi + l'abonnement ; les appels suivants sont des no-op.
//
// On mocke le contexte de claim (admin stateful) comme participations.test.ts
// et on espionne le sender + l'upsert newsletter pour compter les effets.
// ────────────────────────────────────────────────────────────

interface DbResult {
  data: unknown;
  error: null;
}

/** Builder Supabase factice : chaînable pour les lectures, thenable pour
 *  l'update terminé par .select() (comme le PostgrestBuilder réel). */
interface Builder {
  select(cols?: string): Builder;
  update(values: Record<string, unknown>): Builder;
  upsert(values: Record<string, unknown>, opts?: unknown): Builder;
  insert(values: Record<string, unknown>): Builder;
  eq(col: string, val: unknown): Builder;
  is(col: string, val: unknown): Builder;
  maybeSingle(): Promise<DbResult>;
  then(
    onFulfilled: (value: DbResult) => unknown,
    onRejected?: (reason: unknown) => unknown,
  ): Promise<unknown>;
}

const {
  state,
  sendHuntRewardEmailMock,
  subscribeUpsertSpy,
  webhookInsertSpy,
  makeAdmin,
} = vi.hoisted(() => {
    // Complétion factice unique, partagée entre tous les clients admin d'un
    // même cas de test (l'état `email` persiste d'un appel de claim à l'autre).
    const state = {
      completion: {
        id: "completion-1",
        code: "CHASSE-ABCD2345",
        email: null as string | null,
        marketing_opt_in: false,
      },
      // L'email est-il DÉJÀ présent dans newsletter_subscribers ? Pilote la
      // sémantique insert-vs-existant de l'upsert on-conflict-do-nothing.
      subscriberExists: false,
      // Webhook sortant configuré côté org (null → la gate ferme l'enfilement).
      webhookUrl: "https://merchant.example.com/hook" as string | null,
      reset() {
        state.completion.email = null;
        state.completion.marketing_opt_in = false;
        state.subscriberExists = false;
        state.webhookUrl = "https://merchant.example.com/hook";
      },
    };

    const sendHuntRewardEmailMock = vi.fn(() => Promise.resolve(true));
    const subscribeUpsertSpy = vi.fn();
    const webhookInsertSpy = vi.fn();

    interface Op {
      table: string;
      kind: "select" | "update" | "upsert" | "insert";
      values: Record<string, unknown> | null;
      isNull: string[];
    }

    /** Résout les opérations « thenables » (terminées par .select() ou un
     *  insert directement awaité). */
    function resolveTerminal(op: Op): Promise<DbResult> {
      // hunt_completions : compare-and-swap `email is null` (attache à usage
      // unique) — une ligne au PREMIER email, zéro ligne ensuite.
      if (
        op.table === "hunt_completions" &&
        op.kind === "update" &&
        op.isNull.includes("email")
      ) {
        if (state.completion.email === null) {
          state.completion.email = String(op.values?.email ?? "");
          state.completion.marketing_opt_in = Boolean(
            op.values?.marketing_opt_in,
          );
          return Promise.resolve({
            data: [{ id: state.completion.id }],
            error: null,
          });
        }
        return Promise.resolve({ data: [], error: null });
      }
      // newsletter_subscribers : on-conflict-do-nothing → une ligne renvoyée
      // UNIQUEMENT si l'abonné n'existait pas encore (parité `found` SQL).
      if (op.table === "newsletter_subscribers" && op.kind === "upsert") {
        if (state.subscriberExists) {
          return Promise.resolve({ data: [], error: null });
        }
        state.subscriberExists = true;
        return Promise.resolve({ data: [{ id: "subscriber-1" }], error: null });
      }
      // webhook_deliveries : enfilement dans l'outbox.
      if (op.table === "webhook_deliveries" && op.kind === "insert") {
        return Promise.resolve({ data: null, error: null });
      }
      return Promise.resolve({ data: [], error: null });
    }

    function makeAdmin() {
      return {
        from(table: string) {
          const op: Op = { table, kind: "select", values: null, isNull: [] };
          const builder: Builder = {
            select: () => builder,
            update: (values) => {
              op.kind = "update";
              op.values = values;
              return builder;
            },
            upsert: (values) => {
              op.kind = "upsert";
              op.values = values;
              subscribeUpsertSpy(values);
              return builder;
            },
            insert: (values) => {
              op.kind = "insert";
              op.values = values;
              if (table === "webhook_deliveries") webhookInsertSpy(values);
              return builder;
            },
            eq: () => builder,
            is: (col) => {
              op.isNull.push(col);
              return builder;
            },
            maybeSingle: () => {
              if (table === "hunt_players") {
                return Promise.resolve({ data: { id: "player-1" }, error: null });
              }
              if (table === "hunt_completions") {
                return Promise.resolve({
                  data: { id: state.completion.id, code: state.completion.code },
                  error: null,
                });
              }
              if (table === "organizations") {
                return Promise.resolve({
                  data: { webhook_url: state.webhookUrl },
                  error: null,
                });
              }
              return Promise.resolve({ data: null, error: null });
            },
            then: (onFulfilled, onRejected) =>
              resolveTerminal(op).then(onFulfilled, onRejected),
          };
          return builder;
        },
      };
    }

    return {
      state,
      sendHuntRewardEmailMock,
      subscribeUpsertSpy,
      webhookInsertSpy,
      makeAdmin,
    };
  });

const HUNT = {
  id: "hunt-1",
  organization_id: "org-1",
  name: "Chasse de l'été",
  reward_label: "Un café offert",
  reward_details: null,
};

vi.mock("@/lib/hunt-context", () => ({
  huntTokenCookieName: (id: string) => `lc-hunt-${id}`,
  loadHuntClaimContext: () =>
    Promise.resolve({
      ok: true,
      admin: makeAdmin(),
      hunt: HUNT,
      organization: { name: "Ma boutique" },
    }),
  loadHuntStepContext: vi.fn(),
}));

vi.mock("@/lib/resend", () => ({
  sendHuntRewardEmail: sendHuntRewardEmailMock,
}));

// Rate-limit toujours autorisé (calibrage testé dans rate-limit.test.ts).
vi.mock("@/lib/rate-limit", () => ({
  rateLimit: () => Promise.resolve(true),
  rateLimitBucket: (...parts: Array<string | number>) => parts.join(":"),
  RATE_LIMITS: { claim: { limit: 15, windowSeconds: 60 } },
}));

vi.mock("@/lib/monitoring", () => ({
  monitored: <T>(_name: string, fn: () => Promise<T>) => fn(),
  reportError: vi.fn(),
  reportSecurityEvent: vi.fn(),
}));

// Empreinte joueur : hash déterministe, IP figée (le mock admin les ignore).
vi.mock("@/lib/pronostics", () => ({
  hashPlayerToken: (token: string) => `hash:${token}`,
  generatePlayerToken: () => "player-token",
}));
vi.mock("@/lib/request-ip", () => ({
  clientIpFromHeaders: () => "203.0.113.7",
}));

// Cookie joueur présent (chasse terminée par ce joueur) + en-têtes neutres.
vi.mock("next/headers", () => ({
  cookies: () =>
    Promise.resolve({ get: () => ({ value: "player-cookie-token" }) }),
  headers: () => Promise.resolve({}),
}));

// Effets de bord non pertinents pour le claim public.
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/auth", () => ({ getUserAndOrg: vi.fn() }));

import { claimHuntReward } from "./hunts";

const HUNT_ID = "00000000-0000-4000-8000-000000000001";

afterEach(() => {
  state.reset();
  vi.clearAllMocks();
});

describe("claimHuntReward — attache-email à usage unique", () => {
  it("envoie et abonne au PREMIER email, puis reste no-op pour un email différent", async () => {
    // 1er appel : email frais (email était null) → envoi + abonnement.
    const first = await claimHuntReward({
      huntId: HUNT_ID,
      email: "Alice@Example.COM",
      marketingOptIn: true,
    });

    expect(first.ok).toBe(true);
    if (first.ok) {
      expect(first.data.code).toBe("CHASSE-ABCD2345");
      expect(first.data.emailed).toBe(true);
    }
    expect(sendHuntRewardEmailMock).toHaveBeenCalledTimes(1);
    // L'email est normalisé (minuscules) par le schéma Zod avant l'envoi.
    expect(sendHuntRewardEmailMock).toHaveBeenCalledWith(
      expect.objectContaining({ to: "alice@example.com", code: "CHASSE-ABCD2345" }),
    );
    expect(subscribeUpsertSpy).toHaveBeenCalledTimes(1);
    expect(subscribeUpsertSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        organization_id: "org-1",
        email: "alice@example.com",
        source: "hunt",
      }),
    );
    expect(state.completion.email).toBe("alice@example.com");

    // 2e appel avec un destinataire ARBITRAIRE : l'update conditionnel voit
    // email non nul → 0 ligne → aucun réenvoi ni réabonnement (le cœur du fix).
    const second = await claimHuntReward({
      huntId: HUNT_ID,
      email: "victime-arbitraire@example.com",
      marketingOptIn: true,
    });

    expect(second.ok).toBe(true);
    if (second.ok) {
      expect(second.data.code).toBe("CHASSE-ABCD2345");
      expect(second.data.emailed).toBe(false); // no-op : rien n'a été envoyé
    }
    // Toujours 1 seul envoi et 1 seul abonnement au total.
    expect(sendHuntRewardEmailMock).toHaveBeenCalledTimes(1);
    expect(subscribeUpsertSpy).toHaveBeenCalledTimes(1);
    // L'email attaché n'a PAS été écrasé par le destinataire arbitraire.
    expect(state.completion.email).toBe("alice@example.com");
  });

  it("sans email fourni : renvoie le code sans envoi ni abonnement", async () => {
    const result = await claimHuntReward({ huntId: HUNT_ID });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.code).toBe("CHASSE-ABCD2345");
      expect(result.data.emailed).toBe(false);
    }
    expect(sendHuntRewardEmailMock).not.toHaveBeenCalled();
    expect(subscribeUpsertSpy).not.toHaveBeenCalled();
    expect(state.completion.email).toBeNull();
  });

  it("premier email sans opt-in : envoie le code mais n'abonne PAS à la newsletter", async () => {
    const result = await claimHuntReward({
      huntId: HUNT_ID,
      email: "bob@example.com",
      marketingOptIn: false,
    });

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.emailed).toBe(true);
    expect(sendHuntRewardEmailMock).toHaveBeenCalledTimes(1);
    expect(subscribeUpsertSpy).not.toHaveBeenCalled();
  });
});

// ────────────────────────────────────────────────────────────
// claimHuntReward — parité webhook newsletter.subscriber.created
//
// La roue émet l'événement sortant via claim_winning_spin (SQL, outbox
// webhook_deliveries). Le claim de chasse abonne en app-layer : il doit
// enfiler le MÊME événement, avec la même charge utile ({ email, source }),
// UNIQUEMENT quand un abonné est réellement créé (jamais sur un email déjà
// abonné, ni sur le no-op d'attache à usage unique, ni sans opt-in).
// ────────────────────────────────────────────────────────────

describe("claimHuntReward — émission webhook newsletter.subscriber.created", () => {
  it("émet l'événement au premier abonnement opt-in (nouvel abonné)", async () => {
    const result = await claimHuntReward({
      huntId: HUNT_ID,
      email: "carol@example.com",
      marketingOptIn: true,
    });

    expect(result.ok).toBe(true);
    // Abonné réellement créé → un seul enfilement outbox, charge utile
    // identique à la roue ({ email, source }), organisation en colonne.
    expect(webhookInsertSpy).toHaveBeenCalledTimes(1);
    expect(webhookInsertSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        organization_id: "org-1",
        event: "newsletter.subscriber.created",
        data: { email: "carol@example.com", source: "hunt" },
      }),
    );
  });

  it("n'émet rien au 2e claim (no-op attache à usage unique)", async () => {
    await claimHuntReward({
      huntId: HUNT_ID,
      email: "dave@example.com",
      marketingOptIn: true,
    });
    expect(webhookInsertSpy).toHaveBeenCalledTimes(1);
    webhookInsertSpy.mockClear();

    // 2e claim : l'email est déjà rattaché (compare-and-swap → 0 ligne),
    // on n'atteint jamais l'upsert ni l'enfilement.
    const second = await claimHuntReward({
      huntId: HUNT_ID,
      email: "autre@example.com",
      marketingOptIn: true,
    });
    expect(second.ok).toBe(true);
    expect(webhookInsertSpy).not.toHaveBeenCalled();
  });

  it("n'émet rien sans opt-in marketing", async () => {
    const result = await claimHuntReward({
      huntId: HUNT_ID,
      email: "erin@example.com",
      marketingOptIn: false,
    });

    expect(result.ok).toBe(true);
    expect(subscribeUpsertSpy).not.toHaveBeenCalled();
    expect(webhookInsertSpy).not.toHaveBeenCalled();
  });

  it("n'émet pas quand l'email est déjà abonné (parité insert-vs-existant)", async () => {
    state.subscriberExists = true; // déjà présent dans newsletter_subscribers

    const result = await claimHuntReward({
      huntId: HUNT_ID,
      email: "frank@example.com",
      marketingOptIn: true,
    });

    expect(result.ok).toBe(true);
    // L'upsert est bien tenté (attache-email + opt-in)…
    expect(subscribeUpsertSpy).toHaveBeenCalledTimes(1);
    // …mais ne crée aucune ligne → pas de doublon de webhook pour un abonné existant.
    expect(webhookInsertSpy).not.toHaveBeenCalled();
  });

  it("n'émet pas quand aucun webhook n'est configuré (gate webhook_url)", async () => {
    state.webhookUrl = null;

    const result = await claimHuntReward({
      huntId: HUNT_ID,
      email: "grace@example.com",
      marketingOptIn: true,
    });

    expect(result.ok).toBe(true);
    expect(subscribeUpsertSpy).toHaveBeenCalledTimes(1); // abonné bien créé
    expect(webhookInsertSpy).not.toHaveBeenCalled(); // mais rien à livrer
  });
});
