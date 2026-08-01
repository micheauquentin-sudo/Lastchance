// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

/* ════════════════════════════════════════════════════════════
 * LE CODE DE RETRAIT PAR SMS — ce que ces tests prouvent
 *
 * Trois choses, et rien d'autre :
 *
 *   1. LE MESSAGE. Il porte le code, il porte la mention STOP, et il la porte
 *      MÊME quand l'enseigne et le lot sont hostiles — parce qu'un message
 *      sans mention est refusé par le worker, donc perdu.
 *   2. LES CONDITIONS D'ADMISSION. Un consentement absent ou retiré, un
 *      expéditeur non déclaré, un numéro illisible : aucun ne dépose de job.
 *      Et le CRÉDIT n'est PAS relu ici — c'est une propriété, pas un oubli.
 *   3. LE SILENCE. Le code de retrait est un secret porteur : il n'apparaît
 *      dans aucune trace. Cette assertion est doublée d'un TÉMOIN — le même
 *      code EST cherché, et TROUVÉ, là où il doit légitimement se trouver.
 *      Sans lui, une sonde qui ne cherche rien serait verte pour rien.
 * ════════════════════════════════════════════════════════════ */

const mocks = vi.hoisted(() => ({
  recordCounter: vi.fn<(name: string) => void>(),
  reportError: vi.fn<(scope: string, detail?: unknown) => void>(),
  enqueueSmsSend: vi.fn<
    (admin: unknown, payload: SmsSendJobPayload) => Promise<boolean>
  >(() => Promise.resolve(true)),
}));

vi.mock("@/lib/monitoring", () => ({
  recordCounter: (...a: [string]) => mocks.recordCounter(...a),
  reportError: (...a: [string, unknown?]) => mocks.reportError(...a),
}));

// SEUL `enqueueSmsSend` est remplacé : `smsDedupKey` et `normalizeSmsPhone`
// restent les fonctions réelles, sans quoi le test ne prouverait rien sur la
// clé d'unicité ni sur le passage par la normalisation de la base.
vi.mock("@/lib/sms-dispatch", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/sms-dispatch")>()),
  enqueueSmsSend: mocks.enqueueSmsSend,
}));

import {
  enqueuePrizeRedeemSms,
  prizeSmsContent,
  SMS_PRIZE_SCENARIO,
} from "@/lib/sms-prize";
import type { SmsSendJobPayload } from "@/lib/sms-dispatch";
import { smsSegments } from "@/lib/sms-segments";

const ORG_ID = "org-1";
const OTHER_ORG_ID = "org-2";
const PARTICIPATION_ID = "participation-1";
const CODE = "GAIN-ABCD2345";

interface Consent {
  organizationId: string;
  phoneKey: string;
  revokedAt: string | null;
}

/* ── Double de base ──────────────────────────────────────────
 *
 * Il ne simule que ce que ce module interroge : la normalisation E.164,
 * la table des consentements (avec son filtre de retrait), et la porte
 * `sms_sender_for_send`. Toute autre table lue serait ENREGISTRÉE et rendrait
 * l'assertion « le crédit n'est pas relu ici » capable de rougir.
 * ─────────────────────────────────────────────────────────── */
function makeBackend(options: {
  consents?: Consent[];
  sender?: string | null;
  consentError?: string | null;
  senderError?: string | null;
  normalizeError?: string | null;
} = {}) {
  const state = {
    tables: [] as string[],
    rpc: [] as string[],
    consents: options.consents ?? [],
    sender: options.sender === undefined ? "MONRESTO" : options.sender,
  };

  /** Transcription minimale de `sms_phone_e164` — pour le double SEUL. */
  function e164(phone: string): string | null {
    const raw = phone.replace(/[^0-9+]/g, "");
    const digits = raw.replace(/[^0-9]/g, "");
    if (digits.length < 6) return null;
    if (raw.startsWith("+")) return `+${digits}`;
    if (digits.startsWith("0")) return `+33${digits.slice(1)}`;
    return `+${digits}`;
  }

  const admin = {
    rpc(name: string, args: Record<string, unknown>) {
      state.rpc.push(name);
      if (name === "sms_phone_e164") {
        return Promise.resolve(
          options.normalizeError
            ? { data: null, error: { message: options.normalizeError } }
            : { data: e164(String(args.p_phone)), error: null },
        );
      }
      if (name === "sms_sender_for_send") {
        return Promise.resolve(
          options.senderError
            ? { data: null, error: { message: options.senderError } }
            : { data: state.sender, error: null },
        );
      }
      return Promise.resolve({ data: null, error: null });
    },

    from(table: string) {
      state.tables.push(table);
      const filters: Record<string, unknown> = {};
      const builder = {
        select: () => builder,
        eq: (column: string, value: unknown) => {
          filters[column] = value;
          return builder;
        },
        is: (column: string, value: unknown) => {
          filters[`${column}:is`] = value;
          return builder;
        },
        maybeSingle: () => {
          if (table !== "sms_consents") {
            return Promise.resolve({ data: null, error: null });
          }
          if (options.consentError) {
            return Promise.resolve({
              data: null,
              error: { message: options.consentError },
            });
          }
          // Le filtre de RETRAIT est honoré : sans cela, un test « le
          // consentement retiré n'envoie pas » serait vert même si le code
          // avait oublié le `.is("revoked_at", null)`.
          const revokedFiltered = "revoked_at:is" in filters;
          const found = state.consents.find(
            (c) =>
              c.organizationId === filters.organization_id &&
              c.phoneKey === filters.phone_key &&
              (!revokedFiltered || c.revokedAt === null),
          );
          return Promise.resolve({
            data: found ? { id: "consent-1" } : null,
            error: null,
          });
        },
      };
      return builder;
    },
  };

  return { state, admin };
}

type AdminArg = Parameters<typeof enqueuePrizeRedeemSms>[0];

function asAdmin(admin: unknown): AdminArg {
  // unsafe-cast-justification: double de base minimal — reproduire le type complet du client Supabase pour les trois points d'appel de ce module n'ajouterait aucune garantie et masquerait le contrat reellement exerce.
  return admin as AdminArg;
}

function enqueuedPayload(): SmsSendJobPayload {
  expect(mocks.enqueueSmsSend, "aucun envoi déposé").toHaveBeenCalledTimes(1);
  return mocks.enqueueSmsSend.mock.calls[0][1];
}

const NOMINAL_CONSENT: Consent = {
  organizationId: ORG_ID,
  phoneKey: "+33612345678",
  revokedAt: null,
};

function params(over: Partial<Parameters<typeof enqueuePrizeRedeemSms>[1]> = {}) {
  return {
    organizationId: ORG_ID,
    organizationName: "Chez Marcel",
    prizeLabel: "Un café offert",
    redeemCode: CODE,
    phone: "06 12 34 56 78",
    participationId: PARTICIPATION_ID,
    ...over,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
  mocks.enqueueSmsSend.mockResolvedValue(true);
});

/* ════════════════════════════════════════════════════════════
 * 1. Le message
 * ════════════════════════════════════════════════════════════ */

describe("prizeSmsContent — le code, et la porte de sortie", () => {
  it("porte le code de retrait et la mention STOP", () => {
    const content = prizeSmsContent({
      organizationName: "Chez Marcel",
      prizeLabel: "Un café offert",
      redeemCode: CODE,
    });

    expect(content).toContain(CODE);
    expect(content).toMatch(/\bSTOP\b/);
    expect(content).toContain("Chez Marcel");
    expect(content).toContain("caisse");
  });

  it("garde la mention STOP même sur une enseigne et un lot démesurés", () => {
    // ROUGE SI : la mention est posée AVANT la troncature. Le worker refuse
    // alors le message avant réservation — le SMS ne part pas, et le gagnant
    // qui n'a laissé qu'un téléphone se retrouve exactement comme avant ce
    // chantier : sans rien.
    const content = prizeSmsContent({
      organizationName: "B".repeat(400),
      prizeLabel: "L".repeat(400),
      redeemCode: CODE,
    });

    expect(content).toMatch(/\bSTOP\b/);
    expect(content).toContain(CODE);
    expect(content.length).toBeLessThanOrEqual(160);
  });

  it("tient dans un segment GSM-7 sur des valeurs plausibles", () => {
    // 160 caractères = un segment. Au-delà, le grand livre débite 1 crédit
    // quand le prestataire en facture plusieurs — l'écart consigné, mesuré par
    // `sms.multipart`. Ce test borne ce que NOUS écrivons ; il ne peut rien
    // sur un « ê » saisi par le commerçant, qui bascule le message en UCS-2.
    const content = prizeSmsContent({
      organizationName: "Boulangerie du Vieux Marche",
      prizeLabel: "Une viennoiserie au choix a emporter",
      redeemCode: CODE,
    });

    expect(content.length).toBeLessThanOrEqual(160);
  });

  it("LE MESSAGE TYPE TIENT EN UN SEGMENT, mention STOP comprise", () => {
    /* LA MESURE, et non l'affirmation. La mention est gardée alors qu'aucune
     * garde ne l'exige plus (message transactionnel) : il fallait donc dire ce
     * qu'elle COÛTE. Un segment GSM-7 vaut 160 caractères ; un seul accent
     * dans la partie fixe basculerait le message entier en UCS-2, où un
     * segment ne fait plus que 70 — et le grand livre débite UNE UNITÉ PAR
     * SEGMENT depuis `20260827120000`. Autrement dit : de l'argent.
     *
     * ROUGE SI : la partie fixe gagne un accent, ou la mention s'allonge au
     * point de faire déborder un message type. */
    const content = prizeSmsContent({
      organizationName: "Boulangerie du Vieux Marche",
      prizeLabel: "Une viennoiserie au choix a emporter",
      redeemCode: CODE,
    });

    const measured = smsSegments(content);
    expect(measured.encoding).toBe("gsm7");
    expect(measured.segments).toBe(1);

    // Avec le numéro court, la mention s'allonge — et tient encore.
    const withShortcode = smsSegments(
      prizeSmsContent(
        {
          organizationName: "Boulangerie du Vieux Marche",
          prizeLabel: "Une viennoiserie au choix a emporter",
          redeemCode: CODE,
        },
        "36111",
      ),
    );
    expect(withShortcode.segments).toBe(1);
  });

  it("aplatit les retours à la ligne d'un libellé saisi sur plusieurs lignes", () => {
    const content = prizeSmsContent({
      organizationName: "Chez\nMarcel",
      prizeLabel: "Un café\r\noffert",
      redeemCode: CODE,
    });

    expect(content).not.toMatch(/[\r\n]/);
    expect(content).toContain("Chez Marcel");
  });

  it("porte le NUMÉRO COURT quand la plateforme le connaît", () => {
    // Le texte de consentement promet « STOP au numéro court indiqué dans
    // chaque message ». Sans numéro dans le message, c'est un droit de
    // retrait que la personne croit exercer sans l'exercer — et le worker
    // refuse désormais un publicitaire qui ne le porte pas.
    const content = prizeSmsContent(
      {
        organizationName: "Chez Marcel",
        prizeLabel: "Un café offert",
        redeemCode: CODE,
      },
      "36111",
    );

    expect(content).toContain("STOP au 36111");
    expect(content.length).toBeLessThanOrEqual(160);
  });

  it("sans numéro connu, garde la formulation d'origine — rien n'est inventé", () => {
    // TÉMOIN. Un numéro court fabriqué s'imprimerait sur des messages réels,
    // et un numéro faux vaut moins qu'aucun numéro : il a l'apparence d'une
    // porte de sortie.
    const content = prizeSmsContent({
      organizationName: "Chez Marcel",
      prizeLabel: "Un café offert",
      redeemCode: CODE,
    });

    expect(content).toContain("STOP pour ne plus en recevoir.");
    expect(content).not.toMatch(/STOP au/);
  });

  it("ne rend jamais un message amputé de son sujet", () => {
    const content = prizeSmsContent({
      organizationName: "   ",
      prizeLabel: "",
      redeemCode: CODE,
    });

    expect(content).toContain("Votre commerce");
    expect(content).toContain("votre lot");
    expect(content).toMatch(/\bSTOP\b/);
  });
});

/* ════════════════════════════════════════════════════════════
 * 2. Les conditions d'admission
 * ════════════════════════════════════════════════════════════ */

describe("enqueuePrizeRedeemSms — quatre conditions, aucune optionnelle", () => {
  it("dépose l'envoi quand tout est réuni", async () => {
    const { admin } = makeBackend({ consents: [NOMINAL_CONSENT] });

    const queued = await enqueuePrizeRedeemSms(asAdmin(admin), params());

    expect(queued).toBe(true);
    const payload = enqueuedPayload();
    expect(payload.organizationId).toBe(ORG_ID);
    expect(payload.scenario).toBe(SMS_PRIZE_SCENARIO);
    // Le numéro part TEL QUE SAISI : c'est `claim_sms_delivery` qui écrit la
    // forme composée dans `sms_log.recipient`. Renormaliser ici serait le
    // second site de normalisation.
    expect(payload.recipient).toBe("06 12 34 56 78");
    expect(payload.content).toContain(CODE);
    expect(mocks.recordCounter).toHaveBeenCalledWith("sms.prize.enqueued");
  });

  it("LE CODE DE RETRAIT EST TRANSACTIONNEL, ET DOIT LE RESTER", async () => {
    /* ⚠️ GARDE NOMMÉE — LIRE AVANT DE LA « CORRIGER ».
     *
     * Si ce test rougit, c'est que quelqu'un a repassé le code de retrait en
     * publicitaire (`marketing: true`, ou la ligne `marketing: false` retirée
     * du dépôt — le défaut du payload étant « publicitaire »). Ce geste a
     * l'air prudent. Il ne l'est pas, et il a déjà été fait une fois.
     *
     * CE QU'IL COÛTE : la fenêtre horaire légale (22 h–8 h, dimanche, fériés)
     * se réarme sur un message qu'elle n'a jamais visé, et un gain remporté à
     * 23 h 30 attend le lendemain 8 h — quand il ne meurt pas en attendant. Le
     * joueur a laissé son numéro POUR recevoir ce code ; il ne le reçoit pas.
     *
     * POURQUOI CE MESSAGE N'EST PAS DE LA PROSPECTION : il part à la suite
     * d'une action explicite du joueur, ne porte aucun contenu promotionnel,
     * et est nécessaire au service demandé — sans lui, le lot déjà décrémenté
     * du stock n'est pas retirable. C'est la définition du transactionnel.
     * Décision du client, ADR-061.
     *
     * CE QUE CETTE GARDE NE DIT PAS : que le consentement soit devenu
     * facultatif. Il ne l'est pas — c'est l'assertion voisine « SANS
     * CONSENTEMENT, aucun SMS n'est déposé », inchangée. */
    const { admin } = makeBackend({ consents: [NOMINAL_CONSENT] });

    await enqueuePrizeRedeemSms(asAdmin(admin), params());

    expect(enqueuedPayload().marketing).toBe(false);
  });

  it("garde la mention STOP alors que plus aucune garde ne l'exige", async () => {
    /* Le passage au transactionnel DÉSARME la seule vérification mécanique de
     * la mention (`processSmsSendJob` ne la contrôle que sur le publicitaire).
     * Elle est conservée par choix : quelques caractères pour le seul rappel
     * du droit de retrait que ce client recevra jamais. Sans ce test, plus
     * rien au monde ne la retiendrait. */
    const { admin } = makeBackend({ consents: [NOMINAL_CONSENT] });

    await enqueuePrizeRedeemSms(asAdmin(admin), params());

    expect(enqueuedPayload().content).toMatch(/\bSTOP\b/);
  });

  it("le message déposé porte le numéro court configuré", async () => {
    // ROUGE SI : l'accesseur est écrit mais jamais appelé. Le message partirait
    // sans numéro, et le worker le refuserait AVANT réservation — le gagnant
    // qui n'a laissé qu'un téléphone se retrouverait sans rien.
    vi.stubEnv("SMS_STOP_SHORTCODE", "36111");
    const { admin } = makeBackend({ consents: [NOMINAL_CONSENT] });

    await enqueuePrizeRedeemSms(asAdmin(admin), params());

    expect(enqueuedPayload().content).toContain("STOP au 36111");
  });

  it("SANS CONSENTEMENT, aucun SMS n'est déposé", async () => {
    // Le test nommément demandé. ROUGE SI : la vérification du consentement
    // disparaît ou passe après le dépôt. Ce n'est pas une préférence produit —
    // envoyer une offre commerciale à qui n'a rien coché est illégal.
    const { admin, state } = makeBackend({ consents: [] });

    const queued = await enqueuePrizeRedeemSms(asAdmin(admin), params());

    expect(queued).toBe(false);
    expect(mocks.enqueueSmsSend).not.toHaveBeenCalled();
    expect(mocks.recordCounter).toHaveBeenCalledWith("sms.prize.no_consent");
    // La table a bien été interrogée : sans cela, « aucun envoi » pourrait
    // venir d'un tout autre refus et le test serait vert par accident.
    expect(state.tables).toContain("sms_consents");
  });

  it("un consentement RETIRÉ ne vaut pas un consentement", async () => {
    const { admin } = makeBackend({
      consents: [{ ...NOMINAL_CONSENT, revokedAt: "2026-07-01T10:00:00Z" }],
    });

    const queued = await enqueuePrizeRedeemSms(asAdmin(admin), params());

    expect(queued).toBe(false);
    expect(mocks.enqueueSmsSend).not.toHaveBeenCalled();
  });

  it("le consentement d'une AUTRE organisation ne vaut pas pour celle-ci", async () => {
    // ROUGE SI : le filtre `organization_id` disparaît. Un consentement donné
    // à une boulangerie autoriserait le garage d'à côté.
    const { admin } = makeBackend({
      consents: [{ ...NOMINAL_CONSENT, organizationId: OTHER_ORG_ID }],
    });

    const queued = await enqueuePrizeRedeemSms(asAdmin(admin), params());

    expect(queued).toBe(false);
    expect(mocks.enqueueSmsSend).not.toHaveBeenCalled();
  });

  it("sans expéditeur déclaré, rien ne part", async () => {
    const { admin } = makeBackend({
      consents: [NOMINAL_CONSENT],
      sender: null,
    });

    const queued = await enqueuePrizeRedeemSms(asAdmin(admin), params());

    expect(queued).toBe(false);
    expect(mocks.enqueueSmsSend).not.toHaveBeenCalled();
    expect(mocks.recordCounter).toHaveBeenCalledWith("sms.prize.no_sender");
  });

  it("un numéro illisible ne produit ni envoi ni exception", async () => {
    const { admin } = makeBackend({ consents: [NOMINAL_CONSENT] });

    const queued = await enqueuePrizeRedeemSms(
      asAdmin(admin),
      params({ phone: "12" }),
    );

    expect(queued).toBe(false);
    expect(mocks.enqueueSmsSend).not.toHaveBeenCalled();
    expect(mocks.recordCounter).toHaveBeenCalledWith("sms.prize.unreadable");
  });

  it("un téléphone vide sort avant toute requête", async () => {
    const { admin, state } = makeBackend({ consents: [NOMINAL_CONSENT] });

    const queued = await enqueuePrizeRedeemSms(
      asAdmin(admin),
      params({ phone: "   " }),
    );

    expect(queued).toBe(false);
    expect(state.rpc).toEqual([]);
    expect(state.tables).toEqual([]);
  });

  it("une panne de lecture du consentement n'est PAS un consentement", async () => {
    const { admin } = makeBackend({
      consents: [NOMINAL_CONSENT],
      consentError: "connexion perdue",
    });

    const queued = await enqueuePrizeRedeemSms(asAdmin(admin), params());

    expect(queued).toBe(false);
    expect(mocks.enqueueSmsSend).not.toHaveBeenCalled();
    expect(mocks.reportError).toHaveBeenCalledWith(
      "sms.prize.consent",
      "connexion perdue",
    );
  });

  it("NE RELIT PAS le solde : le crédit appartient à la réservation", async () => {
    // ROUGE SI : quelqu'un ajoute un contrôle applicatif du solde « pour
    // éviter un job inutile ». Il serait FAUX sous concurrence — deux lecteurs
    // concluraient tous deux « il en reste un » —, et le socle prend déjà le
    // verrou dans la transaction qui débite.
    const { admin, state } = makeBackend({ consents: [NOMINAL_CONSENT] });

    await enqueuePrizeRedeemSms(asAdmin(admin), params());

    expect(state.tables).not.toContain("sms_credits");
    expect(state.tables).not.toContain("sms_credit_entries");
    expect(state.rpc).not.toContain("debit_sms_credit");
  });
});

/* ════════════════════════════════════════════════════════════
 * 3. La clé d'unicité
 * ════════════════════════════════════════════════════════════ */

describe("la clé de déduplication", () => {
  it("est préfixée par l'organisation, et vise la participation", async () => {
    const { admin } = makeBackend({ consents: [NOMINAL_CONSENT] });

    await enqueuePrizeRedeemSms(asAdmin(admin), params());

    expect(enqueuedPayload().dedupKey).toBe(
      `sms:${ORG_ID}:${SMS_PRIZE_SCENARIO}:${PARTICIPATION_ID}`,
    );
  });

  it("ne dépend PAS de l'orthographe du numéro", async () => {
    // ROUGE SI : la cible redevient le téléphone. « 0612345678 » et
    // « +33612345678 » sont deux chaînes, donc deux clés, donc DEUX SMS au
    // même client pour un seul lot — et deux crédits débités.
    const { admin } = makeBackend({ consents: [NOMINAL_CONSENT] });

    await enqueuePrizeRedeemSms(asAdmin(admin), params({ phone: "0612345678" }));
    const premiere = enqueuedPayload().dedupKey;

    mocks.enqueueSmsSend.mockClear();
    await enqueuePrizeRedeemSms(
      asAdmin(admin),
      params({ phone: "+33 6 12 34 56 78" }),
    );

    expect(enqueuedPayload().dedupKey).toBe(premiere);
  });
});

/* ════════════════════════════════════════════════════════════
 * 4. Le silence — le code ne fuit nulle part
 * ════════════════════════════════════════════════════════════ */

describe("le code de retrait est un secret porteur", () => {
  /** Tout ce que le module a dit au monde extérieur, hors corps du message. */
  function traces(): string {
    return JSON.stringify([
      mocks.recordCounter.mock.calls,
      mocks.reportError.mock.calls,
    ]);
  }

  it("n'apparaît dans AUCUNE trace d'un envoi réussi — et le témoin le voit", async () => {
    const { admin } = makeBackend({ consents: [NOMINAL_CONSENT] });

    await enqueuePrizeRedeemSms(asAdmin(admin), params());

    // TÉMOIN : le code EST cherché, et TROUVÉ, là où il doit être. Sans cette
    // moitié, l'assertion suivante serait verte même si la sonde ne regardait
    // rien du tout.
    expect(enqueuedPayload().content).toContain(CODE);
    expect(traces()).not.toContain(CODE);
  });

  it("n'apparaît dans aucune trace quand tout échoue", async () => {
    const { admin } = makeBackend({
      consents: [NOMINAL_CONSENT],
      consentError: "connexion perdue",
      senderError: "connexion perdue",
    });

    await enqueuePrizeRedeemSms(asAdmin(admin), params());

    expect(mocks.reportError).toHaveBeenCalled();
    expect(traces()).not.toContain(CODE);
  });

  it("n'apparaît pas non plus quand le dépôt lève", async () => {
    const { admin } = makeBackend({ consents: [NOMINAL_CONSENT] });
    mocks.enqueueSmsSend.mockRejectedValueOnce(new Error("file indisponible"));

    const queued = await enqueuePrizeRedeemSms(asAdmin(admin), params());

    expect(queued).toBe(false);
    expect(traces()).not.toContain(CODE);
  });
});

/* ════════════════════════════════════════════════════════════
 * 5. Rien ne remonte à l'appelant
 * ════════════════════════════════════════════════════════════ */

describe("le module ne lève jamais", () => {
  it("un dépôt refusé rend false et le signale", async () => {
    const { admin } = makeBackend({ consents: [NOMINAL_CONSENT] });
    mocks.enqueueSmsSend.mockResolvedValueOnce(false);

    await expect(
      enqueuePrizeRedeemSms(asAdmin(admin), params()),
    ).resolves.toBe(false);
    expect(mocks.recordCounter).toHaveBeenCalledWith("sms.prize.enqueue_failed");
  });

  it("une exception du dépôt est absorbée", async () => {
    const { admin } = makeBackend({ consents: [NOMINAL_CONSENT] });
    mocks.enqueueSmsSend.mockRejectedValueOnce(new Error("file indisponible"));

    await expect(
      enqueuePrizeRedeemSms(asAdmin(admin), params()),
    ).resolves.toBe(false);
    expect(mocks.reportError).toHaveBeenCalled();
  });

  it("une panne de normalisation est absorbée", async () => {
    const { admin } = makeBackend({
      consents: [NOMINAL_CONSENT],
      normalizeError: "fonction indisponible",
    });

    await expect(
      enqueuePrizeRedeemSms(asAdmin(admin), params()),
    ).resolves.toBe(false);
    expect(mocks.enqueueSmsSend).not.toHaveBeenCalled();
  });
});
