// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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

import {
  countStaleSmsDeliveries,
  processSmsSendJob,
  smsDedupKey,
} from "@/lib/sms-dispatch";

/* ── Le double de base ───────────────────────────────────── */

interface LogLine {
  organizationId: string;
  dedupKey: string;
  recipient: string;
  senderId: string;
  status: "sending" | "sent" | "failed" | "undeliverable";
  creditEntryId: string | null;
  /** Unités réellement débitées pour cette ligne (le compte de segments). */
  units: number;
  refundedAt: number | null;
  /** Instant de la réservation, sur l'horloge du double (voir `advance`). */
  claimedAt: number;
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
    /** Nombre de MOUVEMENTS de débit — un par réservation, jamais par segment. */
    debits: 0,
    /** Nombre d'UNITÉS débitées : c'est lui qui suit le compte de segments. */
    unitsDebited: 0,
    refunds: 0,
  };
  const consents = new Map<string, { revokedAt: number | null }>();
  const log = new Map<string, LogLine>();
  /**
   * L'horloge du double, en millisecondes, avancée à la main par `advance`.
   *
   * Sans elle, la fenêtre de péremption des réservations serait invérifiable :
   * c'est une propriété qui ne se manifeste QUE dans le temps — un worker tué,
   * puis une reprise plus tard.
   */
  let clock = 0;

  for (const c of options.consents ?? []) {
    const key = e164(c.phone);
    if (key) consents.set(`${c.organizationId}|${key}`, { revokedAt: null });
  }

  /**
   * Débite N UNITÉS en UN mouvement.
   *
   * Transcription de `debit_sms_credit` après `20260827120000` : le solde doit
   * couvrir la totalité, sans quoi rien n'est débité — un demi-message n'a
   * pas de sens, et laisser passer un solde partiel ferait partir un SMS
   * facturé plus cher que le crédit disponible.
   */
  function debit(units: number): string | null {
    if (state.credits < units) return null;
    state.credits -= units;
    state.debits += 1;
    state.unitsDebited += units;
    return `entry-${state.debits}`;
  }

  /** Miroir du clamp de la RPC : `least(greatest(coalesce(p_segments,1),1),6)`. */
  function clampSegments(raw: unknown): number {
    const value = Number(raw ?? 1);
    if (!Number.isFinite(value)) return 1;
    return Math.min(Math.max(Math.trunc(value), 1), 6);
  }

  /**
   * Miroir du clamp de la fenêtre : `least(greatest(coalesce(p,900),60),86400)`.
   *
   * Le DÉFAUT à 900 est transcrit tel quel, et c'est le point : un appelant qui
   * ne passe rien hérite d'une fenêtre sept fois plus longue que le verrou de
   * job, ce qui est exactement le défaut que ce lot ferme.
   */
  function clampStale(raw: unknown): number {
    const value = Number(raw ?? 900);
    if (!Number.isFinite(value)) return 900;
    return Math.min(Math.max(Math.trunc(value), 60), 86400);
  }

  function claim(args: Record<string, unknown>): boolean {
    const org = String(args.p_organization_id);
    const dedupKey = String(args.p_dedup_key);
    const units = clampSegments(args.p_segments);
    const key = e164(String(args.p_recipient));
    if (!key) return false;

    const consent = consents.get(`${org}|${key}`);
    if (!consent || consent.revokedAt !== null) return false;
    if (!sender) return false;

    const staleMs = clampStale(args.p_stale_after_seconds) * 1000;
    const existing = log.get(`${org}|${dedupKey}`);
    if (existing) {
      if (existing.status === "sent") return false;
      if (existing.status === "undeliverable") return false;
      // (4c) de la RPC : réservé ET ENCORE FRAIS = un autre worker est dessus.
      // Périmée, la ligne se reprend — c'est le seul chemin par lequel un
      // message dont le worker est mort peut encore partir.
      if (
        existing.status === "sending"
        && existing.claimedAt > clock - staleMs
      ) {
        return false;
      }

      // Reprise : le crédit déjà consommé est RÉUTILISÉ, jamais redébité.
      let entry = existing.creditEntryId;
      if (entry === null) {
        entry = debit(units);
        if (entry === null) return false;
        existing.units = units;
      }
      existing.status = "sending";
      existing.claimedAt = clock;
      existing.creditEntryId = entry;
      existing.recipient = key;
      existing.senderId = sender;
      return true;
    }

    const entry = debit(units);
    if (entry === null) return false;
    log.set(`${org}|${dedupKey}`, {
      organizationId: org,
      dedupKey,
      recipient: key,
      senderId: sender,
      status: "sending",
      creditEntryId: entry,
      units,
      refundedAt: null,
      claimedAt: clock,
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
      // `refund_sms_credit` contrepasse le mouvement d'origine : il rend
      // `-delta_units`, donc TOUTES les unités et pas une seule.
      state.credits += line.units;
      state.refunds += 1;
      line.refundedAt = Date.now();
    }
    return true;
  }

  const admin = {
    rpc: vi.fn(async (name: string, args: Record<string, unknown>) => {
      if (name === "claim_sms_delivery") return { data: claim(args), error: null };
      if (name === "finish_sms_delivery") return { data: finish(args), error: null };
      // Les deux lectures du DIAGNOSTIC post-hoc. Elles sont servies par le
      // même double que la porte d'envoi : c'est ce qui garantit que le
      // compteur nomme l'état RÉELLEMENT observé par la RPC, et non un état
      // que le test aurait décrit une seconde fois de son côté.
      if (name === "sms_phone_e164") {
        return { data: e164(String(args.p_phone)), error: null };
      }
      if (name === "sms_sender_for_send") return { data: sender, error: null };
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
      if (table !== "sms_log" && table !== "sms_consents" && table !== "sms_credits") {
        throw new Error(`table inattendue: ${table}`);
      }
      const filters: Record<string, string> = {};
      const chain = {
        select: () => chain,
        eq: (column: string, value: string) => {
          filters[column] = value;
          return chain;
        },
        maybeSingle: async () => {
          if (table === "sms_consents") {
            const consent = consents.get(
              `${filters.organization_id}|${filters.phone_key}`,
            );
            return {
              data: consent
                ? {
                    revoked_at:
                      consent.revokedAt === null
                        ? null
                        : new Date(consent.revokedAt).toISOString(),
                  }
                : null,
              error: null,
            };
          }
          if (table === "sms_credits") {
            return { data: { balance_units: state.credits }, error: null };
          }
          const line = log.get(
            `${filters.organization_id}|${filters.dedup_key}`,
          );
          return {
            data: line
              ? {
                  recipient: line.recipient,
                  sender_id: line.senderId,
                  status: line.status,
                  credit_entry_id: line.creditEntryId,
                }
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
    /** Avance l'horloge du double de N secondes. */
    advance(seconds: number) {
      clock += seconds * 1000;
    },
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

/**
 * Un job d'envoi. Le premier argument surcharge le PAYLOAD, le second la LIGNE
 * elle-même — `created_at` porte désormais une décision (le plafond d'âge du
 * report de fenêtre), il devait devenir réglable.
 *
 * Le payload par défaut est PUBLICITAIRE : `marketing` n'est pas passé, et le
 * défaut du worker est « publicitaire ». C'est délibéré, et c'est ce qui garde
 * vivantes les gardes de la mention STOP et de la fenêtre horaire, maintenant
 * que le seul producteur réel (le code de retrait) est passé transactionnel.
 */
function job(
  overrides: Record<string, unknown> = {},
  row: Partial<JobRow> = {},
): JobRow {
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
    ...row,
  };
}

/**
 * L'INSTANT PAR DÉFAUT DE TOUS LES TESTS DE CE FICHIER.
 *
 * Mardi 4 août 2026, 10 h 30 à Paris : jour ouvré, hors fenêtre interdite.
 *
 * ── POURQUOI L'HORLOGE EST GELÉE ────────────────────────────
 *
 * `processSmsSendJob` refuse désormais un SMS publicitaire entre 22 h et 8 h,
 * le dimanche et les jours fériés. Sans gel, TOUTE cette suite deviendrait
 * rouge un dimanche, une nuit ou un 14 juillet — un test qui dépend du moment
 * où on le lance ne prouve rien du code. Le gel ne masque pas la règle : elle
 * est éprouvée en propre dans `sms-window.test.ts`, et ci-dessous sur ses
 * effets de bord (débit, sort du job).
 *
 * Seul `Date` est simulé : les minuteries réelles ne sont pas touchées, et
 * l'horloge du double de base (`advance`) est indépendante de celle-ci.
 */
const OUVRE = new Date("2026-08-04T08:30:00Z"); // 10 h 30 à Paris

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(OUVRE);
  // Le numéro court est lu dans l'environnement à CHAQUE appel : sans cette
  // remise à zéro, un test qui le pose contaminerait les suivants — et le
  // « comportement strictement inchangé sans la variable » ne serait plus
  // vérifié par rien.
  vi.unstubAllEnvs();
});

afterEach(() => {
  vi.useRealTimers();
});

/** Les arguments du dernier `claim_sms_delivery` réellement appelé. */
function claimArgs(
  admin: { rpc: { mock: { calls: unknown[][] } } },
): Record<string, unknown> | null {
  const call = admin.rpc.mock.calls.find((c) => c[0] === "claim_sms_delivery");
  return call ? (call[1] as Record<string, unknown>) : null;
}

/* ════════════════════════════════════════════════════════════
 * GARANTIE 0 — la fenêtre horaire légale, et son PRIX
 *
 * La règle elle-même (22 h–8 h, dimanche, fériés) est démontrée dans
 * `sms-window.test.ts`, sur une fonction pure. Ce qui se joue ICI est autre
 * chose, et c'est ce que le worker seul peut dire : que le refus tombe AVANT
 * le débit, et qu'il est TEMPORAIRE.
 *
 * `failed` perdrait le message pour toujours — le gagnant n'aurait jamais son
 * code de retrait. Un test qui se contenterait de « le message n'est pas
 * parti » serait vert sur les deux.
 * ════════════════════════════════════════════════════════════ */

describe("la fenêtre horaire légale", () => {
  /** Dimanche 9 août 2026, 14 h à Paris. */
  const DIMANCHE = new Date("2026-08-09T12:00:00Z");
  /** Mardi 4 août 2026, 23 h 35 à Paris — le gain de 23 h 30 du brief. */
  const NUIT = new Date("2026-08-04T21:35:00Z");
  /** Mardi 14 juillet 2026, 11 h à Paris. */
  const FERIE = new Date("2026-07-14T09:00:00Z");

  const backendPret = () =>
    createSmsBackend({
      credits: 10,
      consents: [{ organizationId: ORG, phone: PHONE }],
    });

  it.each([
    ["la nuit", NUIT, "night"],
    ["le dimanche", DIMANCHE, "sunday"],
    ["un jour férié", FERIE, "holiday"],
  ])("refuse %s, SANS RIEN DÉBITER", async (_label, instant, closure) => {
    const backend = backendPret();
    const provider = providerReturning({
      status: "sent",
      providerMessageId: "brevo-1",
      segments: 1,
    });

    const outcome = await processSmsSendJob(
      backend.client,
      job(),
      provider,
      instant,
    );

    // TEMPORAIRE, et c'est le point : le message reste dû.
    expect(outcome.status).toBe("deferred");
    // La porte d'envoi n'a pas été poussée : aucun crédit n'a pu être pris.
    expect(backend.admin.rpc).not.toHaveBeenCalled();
    expect(backend.state.credits).toBe(10);
    expect(backend.state.debits).toBe(0);
    // Et rien n'est parti chez le prestataire.
    expect(provider.calls).toBe(0);
    expect(mocks.recordCounter).toHaveBeenCalledWith(`sms.out_of_window.${closure}`);
  });

  it("laisse passer le même message aux heures ouvrées", async () => {
    // CONTRÔLE POSITIF. Sans lui, une garde qui refuserait TOUT rendrait les
    // trois assertions ci-dessus vertes.
    const backend = backendPret();
    const provider = providerReturning({
      status: "sent",
      providerMessageId: "brevo-1",
      segments: 1,
    });

    const outcome = await processSmsSendJob(
      backend.client,
      job(),
      provider,
      new Date("2026-08-04T08:30:00Z"), // mardi, 10 h 30 à Paris
    );

    expect(outcome.status).toBe("completed");
    expect(provider.calls).toBe(1);
    expect(backend.state.credits).toBe(9);
  });

  it("un message TRANSACTIONNEL n'est pas borné par la fenêtre", async () => {
    /* La règle vise la PROSPECTION. `marketing: false` sort du champ, et la
     * garde le respecte — comme la mention STOP, armée par le même drapeau.
     *
     * CE N'EST PLUS UN MÉCANISME SANS USAGE : `enqueuePrizeRedeemSms` passe
     * désormais `marketing: false` (décision du client, ADR-061). Un gain de
     * 23 h 30 part à 23 h 30. La garde nommée qui empêche ce message de
     * redevenir publicitaire vit dans `sms-prize.test.ts`. */
    const backend = backendPret();
    const provider = providerReturning({
      status: "sent",
      providerMessageId: "brevo-1",
      segments: 1,
    });

    const outcome = await processSmsSendJob(
      backend.client,
      job({ marketing: false, content: "Votre code 4H2K9. Sans mention STOP." }),
      provider,
      NUIT,
    );

    expect(outcome.status).toBe("completed");
    expect(provider.calls).toBe(1);
  });

  it("un message hors fenêtre ET trop long est refusé DÉFINITIVEMENT", async () => {
    /* L'ORDRE DES GARDES EST LA SUBSTANCE. Un message hors plafond ne se
     * répare pas en attendant 8 h : le classer `retry` parce qu'il est 23 h
     * ferait tourner le job cinq fois pour rien. Les refus TERMINAUX passent
     * donc avant la fenêtre. ROUGE SI : la garde horaire est remontée. */
    const backend = backendPret();

    const outcome = await processSmsSendJob(
      backend.client,
      job({ content: `${"a".repeat(1200)} STOP` }),
      providerReturning({ status: "sent", providerMessageId: "x", segments: 1 }),
      NUIT,
    );

    expect(outcome.status).toBe("failed");
    expect(mocks.recordCounter).toHaveBeenCalledWith("sms.too_long");
  });

  /* ── LE REPORT EST DATÉ, ET NE COÛTE PAS UNE TENTATIVE ─────
   *
   * Mesuré par la contre-revue : 5 tentatives et un backoff [1, 5, 15, 60]
   * minutes donnent 81 MINUTES d'horizon, contre 10 h de nuit et 34 h du
   * samedi 22 h au lundi 8 h. Le message mourait avant la réouverture. Ce
   * n'est pas une opinion sur la conception, c'est une soustraction.
   * ──────────────────────────────────────────────────────── */

  it("REPORTE À L'OUVERTURE, et pas au backoff des pannes", async () => {
    /* ROUGE SI : le report retombe sur `retry`. Le job repartirait alors dans
     * 1 minute — en pleine nuit — pour se faire refuser à nouveau, quatre fois,
     * et mourir à 00 h 56 pendant que la fenêtre s'ouvre à 8 h. */
    const backend = backendPret();

    const outcome = await processSmsSendJob(
      backend.client,
      job(),
      providerReturning({ status: "sent", providerMessageId: "x", segments: 1 }),
      NUIT, // mardi 4 août 2026, 23 h 35 à Paris
    );

    expect(outcome.status).toBe("deferred");
    if (outcome.status !== "deferred") return;
    // Mercredi 5 août, 08 h 00 à Paris = 06 h 00 UTC. Pile à l'ouverture :
    // une minute avant et le job se ferait refuser une fois de plus.
    expect(outcome.runAfter.toISOString()).toBe("2026-08-05T06:00:00.000Z");
  });

  it("un samedi soir, le report vise le LUNDI matin", async () => {
    const backend = backendPret();
    const samediSoir = new Date("2026-08-08T20:30:00Z"); // 22 h 30 à Paris

    const outcome = await processSmsSendJob(
      backend.client,
      job({}, { created_at: "2026-08-08T18:00:00Z" }),
      providerReturning({ status: "sent", providerMessageId: "x", segments: 1 }),
      samediSoir,
    );

    expect(outcome.status).toBe("deferred");
    if (outcome.status !== "deferred") return;
    expect(outcome.runAfter.toISOString()).toBe("2026-08-10T06:00:00.000Z");
    // 34 h. C'est le chiffre que 81 minutes de budget ne pouvaient pas franchir.
    const heures =
      (outcome.runAfter.getTime() - samediSoir.getTime()) / 3_600_000;
    expect(heures).toBeGreaterThan(33);
  });

  it("au bout de sept jours, un report devient un ÉCHEC — la boucle est bornée", async () => {
    /* PARCE QUE LE REPORT NE CONSOMME PLUS DE TENTATIVE, `max_attempts` ne
     * borne plus rien : il fallait un autre plafond, sinon un job pouvait être
     * reporté à vie. C'est le cas RÉEL sous la cadence quotidienne — le worker
     * passe à 05 h 20 Paris, DANS la fenêtre interdite, tous les jours.
     *
     * ROUGE SI : le plafond d'âge disparaît. Le job resterait en file
     * indéfiniment, invisible, sans jamais partir ni jamais échouer. */
    const backend = backendPret();

    const outcome = await processSmsSendJob(
      backend.client,
      // Déposé huit jours avant l'instant de décision.
      job({}, { created_at: "2026-07-27T21:35:00Z" }),
      providerReturning({ status: "sent", providerMessageId: "x", segments: 1 }),
      NUIT,
    );

    expect(outcome.status).toBe("failed");
    expect(mocks.recordCounter).toHaveBeenCalledWith(
      "sms.window_deferral_exhausted",
    );
    // TÉMOIN : rien n'a été débité pour autant. L'échec reste en amont de la
    // porte d'envoi, comme les quatre gardes qui le précèdent.
    expect(backend.admin.rpc).not.toHaveBeenCalled();
    expect(backend.state.credits).toBe(10);
  });

  it("le même job, six jours plus tôt, est encore reporté", async () => {
    // CONTRÔLE POSITIF du plafond. Sans lui, une garde qui échouerait TOUJOURS
    // rendrait l'assertion précédente verte pour la mauvaise raison.
    const backend = backendPret();

    const outcome = await processSmsSendJob(
      backend.client,
      job({}, { created_at: "2026-07-30T21:35:00Z" }),
      providerReturning({ status: "sent", providerMessageId: "x", segments: 1 }),
      NUIT,
    );

    expect(outcome.status).toBe("deferred");
  });
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

/* ════════════════════════════════════════════════════════════
 * LE PRIX D'UN MESSAGE — un crédit par SEGMENT, pas par message
 * ════════════════════════════════════════════════════════════ */

describe("le débit suit la longueur réelle du message", () => {
  /** Un contenu GSM-7 de N segments, mention STOP comprise. */
  function contenuDeSegments(segments: number): string {
    const base = "STOP. ";
    const cible = segments === 1 ? 160 : 153 * segments - 100;
    return base + "a".repeat(Math.max(0, cible - base.length));
  }

  it("un message d'un segment débite UNE unité", async () => {
    const backend = createSmsBackend({
      credits: 10,
      consents: [{ organizationId: ORG, phone: PHONE }],
    });

    await processSmsSendJob(
      backend.client,
      job({ content: contenuDeSegments(1) }),
      providerReturning({ status: "sent", providerMessageId: "m", segments: 1 }),
    );

    expect(claimArgs(backend.admin)?.p_segments).toBe(1);
    expect(backend.state.unitsDebited).toBe(1);
    expect(backend.state.credits).toBe(9);
  });

  it("un message de TROIS segments en débite TROIS", async () => {
    // LE DÉFAUT QUE CE LOT FERME : l'appelant passait le littéral 1. Le
    // commerçant payait un crédit pour un message que le prestataire facture
    // trois.
    const backend = createSmsBackend({
      credits: 10,
      consents: [{ organizationId: ORG, phone: PHONE }],
    });

    await processSmsSendJob(
      backend.client,
      job({ content: contenuDeSegments(3) }),
      providerReturning({ status: "sent", providerMessageId: "m", segments: 3 }),
    );

    expect(claimArgs(backend.admin)?.p_segments).toBe(3);
    // UN mouvement, TROIS unités : la ligne de journal reste unique.
    expect(backend.state.debits).toBe(1);
    expect(backend.state.unitsDebited).toBe(3);
    expect(backend.state.credits).toBe(7);
  });

  it("un solde de deux refuse un message de trois segments, sans rien débiter", async () => {
    const backend = createSmsBackend({
      credits: 2,
      consents: [{ organizationId: ORG, phone: PHONE }],
    });
    const provider = providerReturning({
      status: "sent",
      providerMessageId: "m",
      segments: 3,
    });

    const outcome = await processSmsSendJob(
      backend.client,
      job({ content: contenuDeSegments(3) }),
      provider,
    );

    expect(outcome.status).toBe("completed");
    expect(provider.calls).toBe(0);
    // Ni partiellement débité, ni parti : un demi-message n'existe pas.
    expect(backend.state.credits).toBe(2);
    expect(backend.state.unitsDebited).toBe(0);
  });

  it("un échec définitif rembourse TOUTES les unités, pas une", async () => {
    const backend = createSmsBackend({
      credits: 10,
      consents: [{ organizationId: ORG, phone: PHONE }],
    });

    await processSmsSendJob(
      backend.client,
      job({ content: contenuDeSegments(3) }),
      providerReturning({ status: "undeliverable", error: "HTTP 400" }),
    );

    // Les deux moitiés comptent : trois unités prises, trois rendues. Sans la
    // première, un remboursement d'UNE unité sur un débit d'UNE unité rendrait
    // ce test vert alors que le compte de segments n'a jamais circulé.
    expect(backend.state.unitsDebited).toBe(3);
    expect(backend.state.credits).toBe(10);
  });

  it("au-delà de SIX segments : refusé, terminal, et AVANT le débit", async () => {
    // Terminal parce que rejouer ne raccourcira pas le message. Avant le débit
    // parce que la RPC écrêterait silencieusement à 6 : le commerçant paierait
    // six segments pour un message qui en coûte davantage.
    const backend = createSmsBackend({
      credits: 100,
      consents: [{ organizationId: ORG, phone: PHONE }],
    });
    const provider = providerReturning({
      status: "sent",
      providerMessageId: "m",
      segments: 7,
    });

    const outcome = await processSmsSendJob(
      backend.client,
      job({ content: "STOP. " + "a".repeat(1000) }),
      provider,
    );

    expect(outcome.status).toBe("failed");
    expect(backend.admin.rpc).not.toHaveBeenCalled();
    expect(provider.calls).toBe(0);
    expect(backend.state.credits).toBe(100);
    expect(mocks.recordCounter).toHaveBeenCalledWith("sms.too_long");
  });

  it("un écart avec le compte du PRESTATAIRE est mesuré", async () => {
    // La seule chose qui puisse un jour infirmer notre calcul. Tant que ce
    // compteur reste à zéro, débiter sur notre compte est justifié.
    const backend = createSmsBackend({
      credits: 10,
      consents: [{ organizationId: ORG, phone: PHONE }],
    });

    await processSmsSendJob(
      backend.client,
      job({ content: contenuDeSegments(2) }),
      providerReturning({ status: "sent", providerMessageId: "m", segments: 3 }),
    );

    expect(mocks.recordCounter).toHaveBeenCalledWith("sms.segment_mismatch");
  });

  it("TÉMOIN — un accord parfait n'allume pas le compteur d'écart", async () => {
    // Sans cette moitié, l'assertion précédente serait verte avec un compteur
    // incrémenté à chaque envoi.
    const backend = createSmsBackend({
      credits: 10,
      consents: [{ organizationId: ORG, phone: PHONE }],
    });

    await processSmsSendJob(
      backend.client,
      job({ content: contenuDeSegments(2) }),
      providerReturning({ status: "sent", providerMessageId: "m", segments: 2 }),
    );

    expect(mocks.recordCounter).not.toHaveBeenCalledWith("sms.segment_mismatch");
    expect(mocks.recordCounter).toHaveBeenCalledWith("sms.multipart");
  });
});

/* ════════════════════════════════════════════════════════════
 * LE NUMÉRO COURT DU STOP
 *
 * Le texte de consentement promet « STOP au numéro court indiqué dans chaque
 * message ». Tant qu'aucun message ne porte de numéro, c'est un droit de
 * retrait que la personne croit exercer sans l'exercer.
 * ════════════════════════════════════════════════════════════ */

describe("le numéro court de désinscription", () => {
  it("posé : un SMS publicitaire qui ne le porte pas est refusé avant le débit", async () => {
    vi.stubEnv("SMS_STOP_SHORTCODE", "36111");
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
      job({ content: "Offre du jour. STOP pour ne plus en recevoir." }),
      provider,
    );

    expect(outcome.status).toBe("failed");
    expect(backend.admin.rpc).not.toHaveBeenCalled();
    expect(provider.calls).toBe(0);
    expect(backend.state.credits).toBe(10);
    expect(mocks.recordCounter).toHaveBeenCalledWith(
      "sms.missing_stop_shortcode",
    );
  });

  it("posé : un message qui le porte passe", async () => {
    vi.stubEnv("SMS_STOP_SHORTCODE", "36111");
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
      job({ content: "Offre du jour. STOP au 36111." }),
      provider,
    );

    expect(outcome.status).toBe("completed");
    expect(provider.calls).toBe(1);
  });

  it("posé : un message TRANSACTIONNEL n'a pas à le porter", async () => {
    // La mention de désinscription ne pèse que sur le publicitaire ; l'exiger
    // ailleurs bloquerait un code de retrait que le gagnant attend.
    vi.stubEnv("SMS_STOP_SHORTCODE", "36111");
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

  it("ABSENT : comportement strictement inchangé, le mot STOP suffit", async () => {
    // TÉMOIN de la garde ci-dessus, et garantie de non-régression : c'est
    // l'état réel de la production tant que le compte du prestataire n'existe
    // pas. Un défaut fabriqué imprimerait un numéro FAUX sur des messages
    // réels — pire qu'aucun numéro, puisqu'il aurait l'air d'une porte.
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
      job({ content: "Offre du jour. STOP pour ne plus en recevoir." }),
      provider,
    );

    expect(outcome.status).toBe("completed");
    expect(provider.calls).toBe(1);
    expect(mocks.recordCounter).not.toHaveBeenCalledWith(
      "sms.missing_stop_shortcode",
    );
  });
});

/* ════════════════════════════════════════════════════════════
 * UN WORKER TUÉ APRÈS LA RÉSERVATION
 *
 * Le crédit est débité à la réservation, le remboursement n'existe que sur
 * `undeliverable` : entre les deux, un processus tué laisse une ligne
 * `sending`. Toute la question est de savoir si la reprise peut encore la
 * prendre — sans quoi le commerçant a payé, le gagnant n'a rien, et le job a
 * disparu en rendant `completed`.
 * ════════════════════════════════════════════════════════════ */

describe("un worker tué après la réservation ne perd ni le crédit ni le message", () => {
  /** Un prestataire dont l'appel ne revient jamais : le processus meurt. */
  const tue: SmsProvider = {
    name: "tué",
    async send() {
      throw new Error("processus interrompu");
    },
  };

  function backendPret() {
    return createSmsBackend({
      credits: 10,
      consents: [{ organizationId: ORG, phone: PHONE }],
    });
  }

  it("la fenêtre passée à la porte d'envoi est celle du VERROU DE JOB, pas le défaut de la RPC", async () => {
    const backend = backendPret();

    await processSmsSendJob(
      backend.client,
      job(),
      providerReturning({ status: "sent", providerMessageId: "m", segments: 1 }),
    );

    // 120 s = `p_lock_seconds` de `claim_jobs` dans /api/cron/jobs. Le défaut
    // de la RPC est 900 s ; c'est cet écart qui faisait disparaître le message.
    expect(claimArgs(backend.admin)?.p_stale_after_seconds).toBe(120);
  });

  it("reprise après la mort du worker : le message part, et n'a coûté QU'UN débit", async () => {
    const backend = backendPret();

    await expect(
      processSmsSendJob(backend.client, job(), tue),
    ).rejects.toThrow();

    // L'état exact du défaut : ligne réservée, crédit pris, rien d'envoyé.
    expect(backend.line(ORG, DEDUP)?.status).toBe("sending");
    expect(backend.state.credits).toBe(9);

    // Le job est remis en file par `requeue_stale_jobs` (verrou 120 s), puis
    // rejoué au tick suivant.
    backend.advance(130);
    const reprise = await processSmsSendJob(
      backend.client,
      job(),
      providerReturning({ status: "sent", providerMessageId: "m-2", segments: 1 }),
    );

    expect(reprise.status).toBe("completed");
    expect(backend.line(ORG, DEDUP)?.status).toBe("sent");
    // Le crédit déjà pris est réutilisé : la reprise ne redébite pas.
    expect(backend.state.debits).toBe(1);
    expect(backend.state.credits).toBe(9);
  });

  it("TÉMOIN — avec le DÉFAUT de la RPC (900 s), cette même reprise est refusée", async () => {
    // Contrôle négatif : sans le paramètre, la ligne est encore « fraîche »
    // pour la porte d'envoi alors que le job, lui, est déjà repris. Le refus
    // était lu comme un refus ordinaire, le job rendait `completed`, et le
    // crédit restait pris pour un message jamais parti.
    const backend = backendPret();

    await expect(
      processSmsSendJob(backend.client, job(), tue),
    ).rejects.toThrow();
    backend.advance(130);

    const refuse = await backend.admin.rpc("claim_sms_delivery", {
      p_organization_id: ORG,
      p_scenario: "promo",
      p_recipient: PHONE,
      p_dedup_key: DEDUP,
      p_segments: 1,
      // p_stale_after_seconds volontairement absent.
    });

    expect(refuse.data).toBe(false);
    expect(backend.line(ORG, DEDUP)?.status).toBe("sending");
  });

  it("une reprise IMMÉDIATE reste refusée : deux workers n'envoient pas ensemble", async () => {
    // L'autre moitié du réglage. Raccourcir la fenêtre ne doit pas rouvrir le
    // doublon : tant que la réservation est fraîche, elle appartient à son
    // porteur.
    const backend = backendPret();

    await expect(
      processSmsSendJob(backend.client, job(), tue),
    ).rejects.toThrow();

    const provider = providerReturning({
      status: "sent",
      providerMessageId: "m",
      segments: 1,
    });
    const outcome = await processSmsSendJob(backend.client, job(), provider);

    expect(outcome.status).toBe("completed");
    expect(provider.calls).toBe(0);
    expect(backend.state.debits).toBe(1);
  });
});

/* ════════════════════════════════════════════════════════════
 * POURQUOI LE MESSAGE N'EST PAS PARTI — observabilité seulement
 *
 * La porte d'envoi rend un booléen nu. Le diagnostic ci-dessous est POST-HOC :
 * il ne décide rien, il nomme. Chaque test vérifie les deux moitiés — la cause
 * comptée, ET le fait que le sort du job n'a pas changé.
 * ════════════════════════════════════════════════════════════ */

describe("la cause d'un refus de réservation est nommée", () => {
  /** Les compteurs de cause allumés, sans le total. */
  function causes(): string[] {
    return mocks.recordCounter.mock.calls
      .map((call) => String(call[0]))
      .filter((op) => op.startsWith("sms.claim_refused."));
  }

  const envoie = () =>
    providerReturning({ status: "sent", providerMessageId: "m", segments: 1 });

  it("aucun consentement", async () => {
    const backend = createSmsBackend({ credits: 10, consents: [] });

    await processSmsSendJob(backend.client, job(), envoie());

    expect(causes()).toEqual(["sms.claim_refused.no_consent"]);
    // Le total reste compté : la somme des causes doit lui être égale, sans
    // quoi un trou d'attribution passerait pour une baisse des refus.
    expect(mocks.recordCounter).toHaveBeenCalledWith("sms.claim_refused");
  });

  it("consentement RETIRÉ — distinct de l'absence, parce que c'est le produit qui fonctionne", async () => {
    const backend = createSmsBackend({
      credits: 10,
      consents: [{ organizationId: ORG, phone: PHONE }],
    });
    backend.revoke(ORG, PHONE);

    await processSmsSendJob(backend.client, job(), envoie());

    expect(causes()).toEqual(["sms.claim_refused.consent_revoked"]);
  });

  it("expéditeur non déclaré", async () => {
    const backend = createSmsBackend({
      credits: 10,
      sender: null,
      consents: [{ organizationId: ORG, phone: PHONE }],
    });

    await processSmsSendJob(backend.client, job(), envoie());

    expect(causes()).toEqual(["sms.claim_refused.no_sender"]);
  });

  it("CRÉDIT ÉPUISÉ — le cas que le débit par segment a rendu douloureux", async () => {
    // Un solde de 2 fait disparaître un message de 3 segments. C'est la seule
    // cause que le commerçant peut corriger, et la seule qu'il ne pouvait pas
    // distinguer d'un STOP.
    const backend = createSmsBackend({
      credits: 2,
      consents: [{ organizationId: ORG, phone: PHONE }],
    });
    const provider = envoie();

    const outcome = await processSmsSendJob(
      backend.client,
      job({ content: "STOP. " + "a".repeat(400) }),
      provider,
    );

    expect(causes()).toEqual(["sms.claim_refused.insufficient_credit"]);
    // LA SECONDE MOITIÉ : le diagnostic n'a rien décidé. Même sort du job,
    // aucun envoi, aucun mouvement de solde.
    expect(outcome.status).toBe("completed");
    expect(provider.calls).toBe(0);
    expect(backend.state.credits).toBe(2);
    expect(backend.state.debits).toBe(0);
  });

  it("message déjà parti", async () => {
    const backend = createSmsBackend({
      credits: 10,
      consents: [{ organizationId: ORG, phone: PHONE }],
    });
    const provider = envoie();

    await processSmsSendJob(backend.client, job(), provider);
    vi.clearAllMocks();
    await processSmsSendJob(backend.client, job(), provider);

    expect(causes()).toEqual(["sms.claim_refused.already_sent"]);
  });

  it("échec définitif : le refus est SAIN, et compté comme tel", async () => {
    const backend = createSmsBackend({
      credits: 10,
      consents: [{ organizationId: ORG, phone: PHONE }],
    });
    const provider = providerReturning({
      status: "undeliverable",
      error: "HTTP 400",
    });

    await processSmsSendJob(backend.client, job(), provider);
    vi.clearAllMocks();
    await processSmsSendJob(backend.client, job(), provider);

    expect(causes()).toEqual(["sms.claim_refused.undeliverable"]);
  });

  it("réservation tenue par un autre worker", async () => {
    const backend = createSmsBackend({
      credits: 10,
      consents: [{ organizationId: ORG, phone: PHONE }],
    });

    await expect(
      processSmsSendJob(backend.client, job(), {
        name: "tué",
        async send() {
          throw new Error("processus interrompu");
        },
      }),
    ).rejects.toThrow();
    vi.clearAllMocks();
    await processSmsSendJob(backend.client, job(), envoie());

    expect(causes()).toEqual(["sms.claim_refused.in_flight"]);
  });

  it("numéro illisible", async () => {
    const backend = createSmsBackend({
      credits: 10,
      consents: [{ organizationId: ORG, phone: PHONE }],
    });

    await processSmsSendJob(
      backend.client,
      job({ recipient: "numéro inconnu" }),
      envoie(),
    );

    expect(causes()).toEqual(["sms.claim_refused.bad_number"]);
  });

  it("TÉMOIN — un envoi qui réussit n'allume aucun compteur de refus", async () => {
    // Sans cette moitié, les assertions ci-dessus seraient vertes avec un
    // compteur allumé à chaque passage.
    const backend = createSmsBackend({
      credits: 10,
      consents: [{ organizationId: ORG, phone: PHONE }],
    });

    await processSmsSendJob(backend.client, job(), envoie());

    expect(causes()).toEqual([]);
    expect(mocks.recordCounter).not.toHaveBeenCalledWith("sms.claim_refused");
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

/* ════════════════════════════════════════════════════════════
 * LES LIGNES FIGÉES — rendre visible ce qui coûte en silence
 *
 * Une ligne `sms_log` restée en `sending` porte 1 à 6 crédits DÉBITÉS, sans
 * SMS prouvé et sans remboursement. `sms_log_stale_idx` (20260823120000)
 * indexe exactement ces lignes depuis leur création et N'AVAIT AUCUN LECTEUR :
 * l'index rendait la lecture possible, personne ne l'écrivait.
 *
 * CE QUI N'EST PAS FAIT, ET POURQUOI : on ne rembourse pas. Une ligne figée
 * peut aussi bien signifier « le worker est mort avant d'appeler Brevo » que
 * « Brevo a accepté et le worker est mort avant de refermer ». Rembourser un
 * SMS réellement parti rendrait au commerçant un crédit que le prestataire lui
 * facture — et ferait diverger le grand livre, le défaut exact que ce canal a
 * passé un chantier à fermer.
 * ════════════════════════════════════════════════════════════ */

function staleBackend(rows: number, options: { fail?: boolean } = {}) {
  const queries: Array<Record<string, unknown>> = [];
  const admin = {
    from(table: string) {
      const filters: Record<string, unknown> = { table };
      const builder = {
        select(columns: string) {
          filters.columns = columns;
          return builder;
        },
        eq(column: string, value: unknown) {
          filters[`eq:${column}`] = value;
          return builder;
        },
        lt(column: string, value: unknown) {
          filters[`lt:${column}`] = value;
          return builder;
        },
        limit(count: number) {
          filters.limit = count;
          queries.push(filters);
          return Promise.resolve(
            options.fail
              ? { data: null, error: { message: "lecture impossible" } }
              : {
                  data: Array.from({ length: rows }, (_, i) => ({ id: `l-${i}` })),
                  error: null,
                },
          );
        },
      };
      return builder;
    },
  };
  // La fonction mesurée n'utilise que from().select().eq().lt().limit().
  // unsafe-cast-justification: bouchon minimal de client Supabase.
  return { queries, client: admin as unknown as Parameters<typeof countStaleSmsDeliveries>[0] };
}

describe("countStaleSmsDeliveries — l'index enfin lu", () => {
  const MAINTENANT = new Date("2026-08-04T08:30:00Z");

  it("compte une fois par ligne figée, et ne cherche QUE des lignes figées", async () => {
    const backend = staleBackend(3);

    const count = await countStaleSmsDeliveries(backend.client, MAINTENANT);

    expect(count).toBe(3);
    // Le nombre de LIGNES du compteur porte l'information (voir recordCounter).
    expect(
      mocks.recordCounter.mock.calls.filter((c) => c[0] === "sms.stale_sending"),
    ).toHaveLength(3);

    // ROUGE SI : le filtre s'élargit. Compter les lignes `sent` ou les
    // réservations fraîches ferait crier au loup sur le fonctionnement normal,
    // et le compteur deviendrait illisible donc inutile.
    expect(backend.queries[0]).toMatchObject({
      table: "sms_log",
      "eq:status": "sending",
      // 24 h avant l'instant donné, et pas les 120 s du verrou de reprise :
      // entre les deux vit tout le fonctionnement normal.
      "lt:claimed_at": "2026-08-03T08:30:00.000Z",
    });
  });

  it("TÉMOIN — aucune ligne figée n'allume aucun compteur", async () => {
    // Sans lui, une sonde qui compterait à chaque passage serait verte
    // ci-dessus tout en rendant le compteur incapable de dire qu'il se passe
    // quelque chose.
    const backend = staleBackend(0);

    expect(await countStaleSmsDeliveries(backend.client, MAINTENANT)).toBe(0);
    expect(mocks.recordCounter).not.toHaveBeenCalledWith("sms.stale_sending");
  });

  it("une panne de lecture ne fait échouer personne", async () => {
    // La mesure est greffée sur le worker de la file : la faire lever ferait
    // échouer un passage entier — newsletters et relances comprises — pour un
    // compteur d'observation.
    const backend = staleBackend(2, { fail: true });

    expect(await countStaleSmsDeliveries(backend.client, MAINTENANT)).toBe(0);
    expect(mocks.reportError).toHaveBeenCalledWith(
      "sms.stale_scan",
      "lecture impossible",
    );
  });

  it("borne ce qu'elle compte en un passage", async () => {
    // Chaque unité comptée est une insertion dans `ops_metrics` : sans
    // plafond, un incident massif transformerait une observation en charge.
    const backend = staleBackend(0);

    await countStaleSmsDeliveries(backend.client, MAINTENANT);

    expect(backend.queries[0].limit).toBe(50);
  });
});
