import { beforeEach, describe, expect, it, vi } from "vitest";

/* ════════════════════════════════════════════════════════════
 * L'EXPÉDITEUR SMS — la porte qui n'existait pas
 *
 * Les quatre RPC d'expéditeur n'avaient AUCUN appelant applicatif. Sans
 * expéditeur déclaré, `sms_sender_for_send` rend `null` et
 * `claim_sms_delivery` refuse tout : le canal était INERTE quelles que soient
 * les variables d'environnement, le crédit ou les consentements.
 *
 * Ces tests portent sur ce que l'action doit garantir AVANT d'atteindre une
 * RPC `service_role` : le rôle, le seau, la validation, et le fait que le
 * tenant vient de la session et jamais du formulaire.
 * ════════════════════════════════════════════════════════════ */

const { state } = vi.hoisted(() => ({
  state: {
    role: "owner" as string,
    /** Verdict du seau de limitation. */
    allowed: true,
    /** Seaux réellement consommés. */
    buckets: [] as string[],
    /** Appels à la RPC `service_role`. */
    rpcCalls: [] as Array<{ name: string; args: Record<string, unknown> }>,
    rpcError: null as { message: string } | null,
    revalidated: [] as string[],
    /** Résultats de lecture, par table. */
    reads: {} as Record<string, { data: unknown; error: unknown; count?: number }>,
  },
}));

vi.mock("next/cache", () => ({
  revalidatePath: (path: string) => state.revalidated.push(path),
}));
vi.mock("next/navigation", () => ({
  redirect: vi.fn((to: string) => {
    throw new Error(`NEXT_REDIRECT:${to}`);
  }),
}));
vi.mock("@/lib/auth", () => ({
  getUserAndOrg: vi.fn(async () => ({
    user: { id: "user-1", email: "patron@exemple.fr" },
    organization: { id: "org-1", name: "Chez Marcel" },
    role: state.role,
  })),
}));
vi.mock("@/lib/monitoring", () => ({ reportError: vi.fn() }));
// `RATE_LIMITS` et `rateLimitBucket` restent RÉELS : l'assertion sur le seau
// porte alors sur la clé réellement composée, et non sur un double d'elle.
vi.mock("@/lib/rate-limit", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/rate-limit")>()),
  rateLimit: vi.fn(async (bucket: string) => {
    state.buckets.push(bucket);
    return state.allowed;
  }),
}));
vi.mock("@/lib/play-context", () => ({ loadPlayContext: vi.fn() }));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    rpc: (name: string, args: Record<string, unknown>) => {
      state.rpcCalls.push({ name, args });
      return Promise.resolve({ data: null, error: state.rpcError });
    },
  }),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    from(table: string) {
      const resultat = () =>
        state.reads[table] ?? { data: null, error: null, count: 0 };
      // Chaîne « thenable » : les filtres se chaînent, et l'attente résout au
      // résultat préparé — comme le fait le vrai constructeur de requête.
      const chain = {
        select: () => chain,
        eq: () => chain,
        is: () => chain,
        order: () => chain,
        limit: () => chain,
        maybeSingle: () => Promise.resolve(resultat()),
        then: (
          onFulfilled: (value: unknown) => unknown,
          onRejected?: (reason: unknown) => unknown,
        ) => Promise.resolve(resultat()).then(onFulfilled, onRejected),
      };
      return chain;
    },
  }),
}));

const { loadSmsSettings, requestSmsSender } = await import("./sms");

function senderForm(senderId: string) {
  const fd = new FormData();
  fd.set("sender_id", senderId);
  return fd;
}

beforeEach(() => {
  vi.unstubAllEnvs();
  state.role = "owner";
  state.allowed = true;
  state.buckets = [];
  state.rpcCalls = [];
  state.rpcError = null;
  state.revalidated = [];
  state.reads = {
    sms_senders: {
      data: [
        {
          sender_id: "MONRESTO",
          status: "declared",
          status_reason: null,
          declared_at: "2026-08-01T09:00:00Z",
        },
        {
          sender_id: "CHEZMARCEL",
          status: "pending",
          status_reason: null,
          declared_at: null,
        },
      ],
      error: null,
    },
    sms_credits: { data: { balance_units: 42 }, error: null },
    sms_credit_entries: {
      data: [
        {
          id: "e-1",
          created_at: "2026-08-01T10:00:00Z",
          delta_units: -3,
          reason: "send",
        },
      ],
      error: null,
    },
    sms_consents: { data: null, error: null, count: 7 },
  };
});

describe("requestSmsSender — le geste qui rend le canal utilisable", () => {
  it("le propriétaire demande un expéditeur, en majuscules", async () => {
    const res = await requestSmsSender(null, senderForm("monresto"));

    expect(res.ok).toBe(true);
    expect(state.rpcCalls).toEqual([
      {
        name: "request_sms_sender",
        // Le tenant vient de la SESSION, jamais du formulaire.
        args: { p_organization_id: "org-1", p_sender_id: "MONRESTO" },
      },
    ]);
    expect(state.revalidated).toContain("/dashboard/settings");
  });

  it("un nom que l'opérateur refuserait est arrêté AVANT la base", async () => {
    // « CAFÉ LÉON » : accent et espace, tous deux hors de la charte AF2M. Zod
    // dit quoi corriger ; sans lui, le commerçant recevrait une violation de
    // contrainte Postgres.
    const res = await requestSmsSender(null, senderForm("Café Léon"));

    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toContain("11 caractères");
    expect(state.rpcCalls).toEqual([]);
  });

  it("un ÉDITEUR ne touche pas à l'identité commerciale", async () => {
    // Aligné sur le logo, le webhook et la confidentialité : ce sont des
    // réglages de propriétaire. Et la policy de lecture de `sms_senders` est
    // elle-même réservée au propriétaire — ouvrir l'écriture à un éditeur lui
    // donnerait le droit de changer un nom qu'il ne peut pas lire.
    state.role = "editor";

    await expect(
      requestSmsSender(null, senderForm("MONRESTO")),
    ).rejects.toThrow("NEXT_REDIRECT");
    expect(state.rpcCalls).toEqual([]);
  });

  it("le seau porte l'organisation ET l'opérateur, et refuse sans appeler la base", async () => {
    state.allowed = false;

    const res = await requestSmsSender(null, senderForm("MONRESTO"));

    expect(res.ok).toBe(false);
    expect(state.buckets).toEqual(["sms:sender:org-1:user-1"]);
    expect(state.rpcCalls).toEqual([]);
  });

  it("un refus de la base ne recopie pas son message à l'écran", async () => {
    state.rpcError = { message: "not authorized" };

    const res = await requestSmsSender(null, senderForm("MONRESTO"));

    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).not.toContain("not authorized");
  });
});

describe("loadSmsSettings — l'état du canal", () => {
  it("rend le solde, les mouvements, les consentements et TOUS les expéditeurs", async () => {
    const settings = await loadSmsSettings();

    expect(settings.balanceUnits).toBe(42);
    expect(settings.activeConsents).toBe(7);
    expect(settings.movements).toHaveLength(1);
    expect(settings.movements[0].deltaUnits).toBe(-3);
    // DEUX expéditeurs, et c'est voulu : l'index unique de `sms_senders` est
    // partiel, un `pending` coexiste avec le `declared` en service pendant un
    // changement d'enseigne. N'en montrer qu'un cacherait au commerçant la
    // demande qu'il vient de déposer — et il la redéposerait.
    expect(settings.senders.map((s) => s.senderId)).toEqual([
      "MONRESTO",
      "CHEZMARCEL",
    ]);
    expect(settings.unavailable).toBe(false);
  });

  it("expose le numéro court quand il est configuré, jamais la clé du prestataire", async () => {
    vi.stubEnv("SMS_STOP_SHORTCODE", "36111");
    vi.stubEnv("BREVO_API_KEY", "xkeysib-secret");

    const settings = await loadSmsSettings();

    expect(settings.stopShortcode).toBe("36111");
    // On dit QU'IL Y A une clé, jamais laquelle.
    expect(settings.providerConfigured).toBe(true);
    expect(JSON.stringify(settings)).not.toContain("xkeysib-secret");
  });

  it("une panne de lecture n'est PAS un solde à zéro", async () => {
    // Afficher « 0 crédit » sur une panne ferait croire au commerçant que son
    // canal est vide alors qu'il ne l'est pas — et il rachèterait du crédit.
    state.reads.sms_credits = { data: null, error: { message: "boom" } };

    const settings = await loadSmsSettings();

    expect(settings.unavailable).toBe(true);
    expect(settings.balanceUnits).toBe(0);
  });

  it("un membre non propriétaire ne lit rien", async () => {
    state.role = "cashier";

    await expect(loadSmsSettings()).rejects.toThrow("NEXT_REDIRECT");
  });
});
