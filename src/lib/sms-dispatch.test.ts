// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { JobRow } from "@/lib/jobs";
import type { SmsProvider, SmsSendOutcome } from "@/lib/sms-provider";

/* ════════════════════════════════════════════════════════════
 * L'ENVOI SMS — ce que ces tests prouvent réellement
 *
 * Les trois garanties demandées portent sur l'ARGENT et sur la LOI, et
 * aucune des trois ne se démontre en observant le worker seul : elles
 * naissent de la conversation entre le worker et le socle SQL. Un test qui
 * se contenterait de vérifier « la bonne RPC a été appelée » serait vert
 * même si la RPC faisait le contraire de ce qu'on croit.
 *
 * D'où le DOUBLE DE BASE ci-dessous : une transcription du contrat de
 * `claim_sms_delivery` / `finish_sms_delivery` — cinq refus, débit à la
 * réservation, un crédit par `dedup_key` et non par tentative, remboursement
 * du seul échec définitif, ligne close qui ne se rouvre pas. Les tests
 * interrogent alors le SOLDE et le JOURNAL, pas les appels.
 *
 * CE QUE CE DOUBLE NE PROUVE PAS, et il faut le dire : que le vrai SQL se
 * comporte ainsi. Cela, ce sont les 37 fichiers pgTAP qui le prouvent. Ici on
 * démontre que le worker, BRANCHÉ SUR CE CONTRAT, ne débite pas à tort et ne
 * boucle pas. Les deux moitiés sont nécessaires ; aucune ne remplace l'autre.
 * ════════════════════════════════════════════════════════════ */

const mocks = vi.hoisted(() => ({
  recordCounter: vi.fn(),
  reportError: vi.fn(),
}));

vi.mock("@/lib/monitoring", () => ({
  recordCounter: (...a: unknown[]) => mocks.recordCounter(...a),
  reportError: (...a: unknown[]) => mocks.reportError(...a),
}));

import { processSmsSendJob, smsDedupKey } from "@/lib/sms-dispatch";

/* ── Le double de base ───────────────────────────────────── */

interface LogLine {
  organizationId: string;
  dedupKey: string;
  recipient: string;
  senderId: string;
  status: "sending" | "sent" | "failed" | "undeliverable";
  creditEntryId: string | null;
  refundedAt: number | null;
}

/**
 * Transcription MINIMALE de `sms_phone_e164`, pour le double uniquement.
 *
 * Ce n'est pas un second site de normalisation du produit : aucun code de
 * production n'y touche, et le worker ne normalise rien — il relit le numéro
 * que la base a écrit. C'est ici la base qu'on simule.
 */
function e164(phone: string): string | null {
  const raw = phone.replace(/[^0-9+]/g, "");
  const digits = raw.replace(/[^0-9]/g, "");
  if (!digits) return null;
  if (raw.startsWith("+")) return `+${digits}`;
  if (digits.length === 10 && digits.startsWith("0")) return `+33${digits.slice(1)}`;
  return `+${digits}`;
}

function createSmsBackend(options: {
  credits?: number;
  sender?: string | null;
  consents?: Array<{ organizationId: string; phone: string }>;
} = {}) {
  const sender = options.sender === undefined ? "MONRESTO" : options.sender;
  const state = {
    credits: options.credits ?? 100,
    debits: 0,
    refunds: 0,
  };
  const consents = new Map<string, { revokedAt: number | null }>();
  const log = new Map<string, LogLine>();

  for (const c of options.consents ?? []) {
    const key = e164(c.phone);
    if (key) consents.set(`${c.organizationId}|${key}`, { revokedAt: null });
  }

  function debit(): string | null {
    if (state.credits <= 0) return null;
    state.credits -= 1;
    state.debits += 1;
    return `entry-${state.debits}`;
  }

  function claim(args: Record<string, unknown>): boolean {
    const org = String(args.p_organization_id);
    const dedupKey = String(args.p_dedup_key);
    const key = e164(String(args.p_recipient));
    if (!key) return false;

    const consent = consents.get(`${org}|${key}`);
    if (!consent || consent.revokedAt !== null) return false;
    if (!sender) return false;

    const existing = log.get(`${org}|${dedupKey}`);
    if (existing) {
      if (existing.status === "sent") return false;
      if (existing.status === "undeliverable") return false;
      if (existing.status === "sending") return false;

      // Reprise : le crédit déjà consommé est RÉUTILISÉ, jamais redébité.
      let entry = existing.creditEntryId;
      if (entry === null) {
        entry = debit();
        if (entry === null) return false;
      }
      existing.status = "sending";
      existing.creditEntryId = entry;
      existing.recipient = key;
      existing.senderId = sender;
      return true;
    }

    const entry = debit();
    if (entry === null) return false;
    log.set(`${org}|${dedupKey}`, {
      organizationId: org,
      dedupKey,
      recipient: key,
      senderId: sender,
      status: "sending",
      creditEntryId: entry,
      refundedAt: null,
    });
    return true;
  }

  function finish(args: Record<string, unknown>): boolean {
    const org = String(args.p_organization_id);
    const dedupKey = String(args.p_dedup_key);
    const status = String(args.p_status) as LogLine["status"];
    const line = log.get(`${org}|${dedupKey}`);
    // Une ligne close ne se rouvre pas.
    if (!line || line.status !== "sending") return false;
    line.status = status;
    if (status === "undeliverable" && line.creditEntryId !== null) {
      state.credits += 1;
      state.refunds += 1;
      line.refundedAt = Date.now();
    }
    return true;
  }

  const admin = {
    rpc: vi.fn(async (name: string, args: Record<string, unknown>) => {
      if (name === "claim_sms_delivery") return { data: claim(args), error: null };
      if (name === "finish_sms_delivery") return { data: finish(args), error: null };
      if (name === "revoke_sms_consent") {
        const org = String(args.p_organization_id);
        const key = e164(String(args.p_phone));
        const consent = key ? consents.get(`${org}|${key}`) : undefined;
        if (!consent || consent.revokedAt !== null) return { data: false, error: null };
        consent.revokedAt = Date.now();
        return { data: true, error: null };
      }
      return { data: null, error: { message: `rpc inconnue: ${name}` } };
    }),
    from: vi.fn((table: string) => {
      if (table !== "sms_log") throw new Error(`table inattendue: ${table}`);
      const filters: Record<string, string> = {};
      const chain = {
        select: () => chain,
        eq: (column: string, value: string) => {
          filters[column] = value;
          return chain;
        },
        maybeSingle: async () => {
          const line = log.get(
            `${filters.organization_id}|${filters.dedup_key}`,
          );
          return {
            data: line
              ? { recipient: line.recipient, sender_id: line.senderId }
              : null,
            error: null,
          };
        },
      };
      return chain;
    }),
  };

  return {
    // `admin` garde son type de stub : c'est lui qu'on interroge dans les
    // assertions (`admin.rpc` est un espion). `client` est le MÊME objet, vu
    // au travers du type attendu par le worker — la conversion est le prix du
    // fait que `createAdminClient()` ne porte pas le générique `Database`.
    admin,
    // Même motif que le bouchon du rapport hebdomadaire : un double ne peut
    // pas satisfaire `SupabaseClient` structurellement, et il LÈVE sur un
    // chemin inattendu plutôt que de rendre `undefined` en silence.
    // unsafe-cast-justification: bouchon de client Supabase, cf. ci-dessus.
    client: admin as unknown as Parameters<typeof processSmsSendJob>[0],
    state,
    log,
    consents,
    revoke(organizationId: string, phone: string) {
      const key = e164(phone);
      const consent = key ? consents.get(`${organizationId}|${key}`) : undefined;
      if (consent) consent.revokedAt = Date.now();
    },
    line(organizationId: string, dedupKey: string) {
      return log.get(`${organizationId}|${dedupKey}`) ?? null;
    },
  };
}

/* ── Prestataires de test ────────────────────────────────── */

function providerReturning(...outcomes: SmsSendOutcome[]): SmsProvider & {
  calls: number;
} {
  let index = 0;
  const provider = {
    name: "test",
    calls: 0,
    async send() {
      provider.calls += 1;
      const outcome = outcomes[Math.min(index, outcomes.length - 1)];
      index += 1;
      return outcome;
    },
  };
  return provider;
}

const ORG = "org-1";
const PHONE = "06 12 34 56 78";
const DEDUP = smsDedupKey(ORG, "promo", "participation-9");

function job(overrides: Record<string, unknown> = {}): JobRow {
  return {
    id: "job-1",
    type: "sms.send",
    payload: {
      organizationId: ORG,
      scenario: "promo",
      recipient: PHONE,
      content: "Offre du jour chez Mon Resto. STOP au 36111",
      dedupKey: DEDUP,
      ...overrides,
    },
    status: "running",
    run_after: new Date().toISOString(),
    attempts: 1,
    max_attempts: 5,
    organization_id: ORG,
    idempotency_key: DEDUP,
    last_error: null,
    created_at: new Date().toISOString(),
    completed_at: null,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

/* ════════════════════════════════════════════════════════════
 * GARANTIE 1 — une panne Brevo ne débite personne
 * ════════════════════════════════════════════════════════════ */

describe("une panne Brevo ne débite personne", () => {
  it("prestataire NON CONFIGURÉ : rien n'est réservé, donc rien n'est débité", async () => {
    const backend = createSmsBackend({
      credits: 10,
      consents: [{ organizationId: ORG, phone: PHONE }],
    });

    const outcome = await processSmsSendJob(backend.client, job(), null);

    expect(outcome.status).toBe("retry");
    // LE POINT : la porte d'envoi n'a même pas été poussée.
    expect(backend.admin.rpc).not.toHaveBeenCalled();
    expect(backend.state.credits).toBe(10);
    expect(backend.state.debits).toBe(0);
  });

  it("panne réseau : UN SEUL crédit consommé sur trois tentatives", async () => {
    const backend = createSmsBackend({
      credits: 10,
      consents: [{ organizationId: ORG, phone: PHONE }],
    });
    const provider = providerReturning({
      status: "failed",
      error: "transport: fetch failed",
    });

    for (let attempt = 0; attempt < 3; attempt += 1) {
      const outcome = await processSmsSendJob(backend.client, job(), provider);
      expect(outcome.status).toBe("retry");
    }

    expect(provider.calls).toBe(3);
    // Un crédit par `dedup_key`, jamais par tentative : trois appels à un
    // opérateur en panne ne factureraient pas trois SMS pour un message.
    expect(backend.state.debits).toBe(1);
    expect(backend.state.credits).toBe(9);
    // Non remboursé, et c'est correct : la reprise réutilise ce crédit.
    expect(backend.state.refunds).toBe(0);
    expect(backend.line(ORG, DEDUP)?.status).toBe("failed");
  });

  it("panne puis rétablissement : le message part, et n'a coûté qu'un crédit", async () => {
    const backend = createSmsBackend({
      credits: 10,
      consents: [{ organizationId: ORG, phone: PHONE }],
    });
    const provider = providerReturning(
      { status: "failed", error: "HTTP 503" },
      { status: "sent", providerMessageId: "m-1", segments: 1 },
    );

    await processSmsSendJob(backend.client, job(), provider);
    const second = await processSmsSendJob(backend.client, job(), provider);

    expect(second.status).toBe("completed");
    expect(backend.line(ORG, DEDUP)?.status).toBe("sent");
    expect(backend.state.debits).toBe(1);
  });

  it("solde nul : refus AVANT tout appel au prestataire", async () => {
    const backend = createSmsBackend({
      credits: 0,
      consents: [{ organizationId: ORG, phone: PHONE }],
    });
    const provider = providerReturning({
      status: "sent",
      providerMessageId: "m",
      segments: 1,
    });

    const outcome = await processSmsSendJob(backend.client, job(), provider);

    expect(outcome.status).toBe("completed");
    expect(provider.calls).toBe(0);
    expect(backend.state.credits).toBe(0);
  });
});

/* ════════════════════════════════════════════════════════════
 * GARANTIE 2 — un numéro invalide ne boucle pas
 * ════════════════════════════════════════════════════════════ */

describe("un numéro invalide ne boucle pas indéfiniment", () => {
  it("échec définitif : remboursé, terminal, et toute reprise refusée", async () => {
    const backend = createSmsBackend({
      credits: 10,
      consents: [{ organizationId: ORG, phone: PHONE }],
    });
    const provider = providerReturning({
      status: "undeliverable",
      error: "HTTP 400 invalid_parameter",
    });

    const first = await processSmsSendJob(backend.client, job(), provider);

    // (a) Le job ne demande PAS de nouvelle tentative.
    expect(first.status).toBe("completed");
    // (b) Le commerçant est remboursé.
    expect(backend.state.refunds).toBe(1);
    expect(backend.state.credits).toBe(10);
    expect(backend.line(ORG, DEDUP)?.status).toBe("undeliverable");

    // (c) ET LA BOUCLE EST FERMÉE PAR LE BAS : même si quelque chose
    // redéposait ce job, la porte d'envoi refuse — sans quoi « rembourser
    // puis renvoyer » donnerait des SMS gratuits à volonté.
    const replay = await processSmsSendJob(backend.client, job(), provider);
    expect(replay.status).toBe("completed");
    expect(provider.calls).toBe(1);
    expect(backend.state.debits).toBe(1);
    expect(backend.state.refunds).toBe(1);
  });

  it("un message déjà parti n'est jamais renvoyé", async () => {
    const backend = createSmsBackend({
      credits: 10,
      consents: [{ organizationId: ORG, phone: PHONE }],
    });
    const provider = providerReturning({
      status: "sent",
      providerMessageId: "m-1",
      segments: 1,
    });

    await processSmsSendJob(backend.client, job(), provider);
    await processSmsSendJob(backend.client, job(), provider);

    expect(provider.calls).toBe(1);
    expect(backend.state.debits).toBe(1);
  });
});

/* ════════════════════════════════════════════════════════════
 * GARANTIE 3 — un STOP empêche réellement l'envoi suivant
 * ════════════════════════════════════════════════════════════ */

describe("un STOP reçu empêche réellement l'envoi suivant", () => {
  it("consentement retiré entre deux envois : le second ne part pas", async () => {
    const backend = createSmsBackend({
      credits: 10,
      consents: [{ organizationId: ORG, phone: PHONE }],
    });
    const provider = providerReturning({
      status: "sent",
      providerMessageId: "m-1",
      segments: 1,
    });

    const first = await processSmsSendJob(backend.client, job(), provider);
    expect(first.status).toBe("completed");
    expect(provider.calls).toBe(1);

    // Le client répond STOP — ce que fait la route webhook.
    await backend.admin.rpc("revoke_sms_consent", {
      p_organization_id: ORG,
      p_phone: "+33612345678",
      p_reason: "stop",
    });

    // Message SUIVANT : autre clé, même personne.
    const next = job({ dedupKey: smsDedupKey(ORG, "promo", "participation-10") });
    const second = await processSmsSendJob(backend.client, next, provider);

    expect(second.status).toBe("completed");
    // LE POINT : le prestataire n'a jamais été appelé une seconde fois.
    expect(provider.calls).toBe(1);
    // Et rien n'a été facturé pour ce message.
    expect(backend.state.debits).toBe(1);
  });

  it("le STOP au format INTERNATIONAL retire le consentement pris au format national", async () => {
    // C'est le défaut que 20260826120000 ferme : le STOP arrive par le numéro
    // court du prestataire, donc en international ; le consentement a été
    // recueilli en caisse en national.
    const backend = createSmsBackend({
      credits: 10,
      consents: [{ organizationId: ORG, phone: "0612345678" }],
    });
    const provider = providerReturning({
      status: "sent",
      providerMessageId: "m",
      segments: 1,
    });

    await backend.admin.rpc("revoke_sms_consent", {
      p_organization_id: ORG,
      p_phone: "+33612345678",
      p_reason: "stop",
    });

    const outcome = await processSmsSendJob(backend.client, job(), provider);

    expect(outcome.status).toBe("completed");
    expect(provider.calls).toBe(0);
  });

  it("sans aucun consentement, rien ne part et rien n'est facturé", async () => {
    const backend = createSmsBackend({ credits: 10, consents: [] });
    const provider = providerReturning({
      status: "sent",
      providerMessageId: "m",
      segments: 1,
    });

    await processSmsSendJob(backend.client, job(), provider);

    expect(provider.calls).toBe(0);
    expect(backend.state.debits).toBe(0);
  });
});

/* ════════════════════════════════════════════════════════════
 * Les gardes d'entrée — tout refus AVANT le débit
 * ════════════════════════════════════════════════════════════ */

describe("gardes antérieures à la réservation", () => {
  it("SMS publicitaire sans mention STOP : refusé, non facturé, non rejoué", async () => {
    const backend = createSmsBackend({
      credits: 10,
      consents: [{ organizationId: ORG, phone: PHONE }],
    });
    const provider = providerReturning({
      status: "sent",
      providerMessageId: "m",
      segments: 1,
    });

    const outcome = await processSmsSendJob(
      backend.client,
      job({ content: "Offre du jour chez Mon Resto." }),
      provider,
    );

    expect(outcome.status).toBe("failed");
    expect(backend.admin.rpc).not.toHaveBeenCalled();
    expect(provider.calls).toBe(0);
    expect(backend.state.debits).toBe(0);
  });

  it("un SMS transactionnel n'exige pas la mention", async () => {
    const backend = createSmsBackend({
      credits: 10,
      consents: [{ organizationId: ORG, phone: PHONE }],
    });
    const provider = providerReturning({
      status: "sent",
      providerMessageId: "m",
      segments: 1,
    });

    const outcome = await processSmsSendJob(
      backend.client,
      job({ content: "Votre code de retrait : ABC123", marketing: false }),
      provider,
    );

    expect(outcome.status).toBe("completed");
    expect(provider.calls).toBe(1);
  });

  it("expéditeur non déclaré AF2M : rien ne part, rien n'est facturé", async () => {
    const backend = createSmsBackend({
      credits: 10,
      sender: null,
      consents: [{ organizationId: ORG, phone: PHONE }],
    });
    const provider = providerReturning({
      status: "sent",
      providerMessageId: "m",
      segments: 1,
    });

    await processSmsSendJob(backend.client, job(), provider);

    expect(provider.calls).toBe(0);
    expect(backend.state.debits).toBe(0);
  });

  it("payload incomplet : échec sans rejeu", async () => {
    const backend = createSmsBackend({ credits: 10 });

    const outcome = await processSmsSendJob(
      backend.client,
      job({ content: "" }),
      providerReturning({ status: "sent", providerMessageId: "m", segments: 1 }),
    );

    expect(outcome.status).toBe("failed");
    expect(backend.admin.rpc).not.toHaveBeenCalled();
  });
});

/* ════════════════════════════════════════════════════════════
 * Le numéro composé, et la clé d'unicité
 * ════════════════════════════════════════════════════════════ */

describe("le numéro composé vient de la base", () => {
  it("compose la forme NORMALISÉE, pas celle du payload", async () => {
    const backend = createSmsBackend({
      credits: 10,
      consents: [{ organizationId: ORG, phone: PHONE }],
    });
    let dialled: string | null = null;
    const provider: SmsProvider = {
      name: "spy",
      async send(request) {
        dialled = request.recipient;
        return { status: "sent", providerMessageId: "m", segments: 1 };
      },
    };

    await processSmsSendJob(backend.client, job(), provider);

    // Le payload portait « 06 12 34 56 78 » ; la base a écrit l'E.164.
    expect(dialled).toBe("+33612345678");
  });

  it("compose sous l'expéditeur GELÉ sur la ligne", async () => {
    const backend = createSmsBackend({
      credits: 10,
      sender: "MONRESTO",
      consents: [{ organizationId: ORG, phone: PHONE }],
    });
    let sender: string | null = null;
    const provider: SmsProvider = {
      name: "spy",
      async send(request) {
        sender = request.sender;
        return { status: "sent", providerMessageId: "m", segments: 1 };
      },
    };

    await processSmsSendJob(backend.client, job(), provider);

    expect(sender).toBe("MONRESTO");
  });
});

describe("smsDedupKey", () => {
  it("préfixe par l'organisation — deux organisations ne collisionnent pas", () => {
    expect(smsDedupKey("org-a", "promo", "p-1")).not.toBe(
      smsDedupKey("org-b", "promo", "p-1"),
    );
    expect(smsDedupKey("org-a", "promo", "p-1").startsWith("sms:org-a:")).toBe(true);
  });

  it("TÉMOIN — la même entrée donne toujours la même clé", () => {
    // Modification sans effet : recalculer ne doit rien changer. Si ce test
    // devenait rouge, la clé aurait acquis une dépendance cachée (horloge,
    // aléa) et l'anti-doublon ne tiendrait plus d'un passage à l'autre.
    expect(smsDedupKey(ORG, "promo", "participation-9")).toBe(DEDUP);
  });
});
