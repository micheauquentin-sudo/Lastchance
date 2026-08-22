// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

/* ════════════════════════════════════════════════════════════
 * LE MODE ATTENTE ACTIVE (RES-4, lot L7) — les trois gestes publics
 *
 * Ce que ces tests attestent, et qui est le cœur du lot :
 *   · L'ORGANISATION N'EST JAMAIS POSTÉE. Elle est résolue serveur depuis la
 *     SOURCE (entrée de file, réservation) ou depuis la SESSION, et c'est
 *     CETTE valeur-là qui part vers la RPC. Un `organizationId` glissé dans le
 *     corps n'atteint rien.
 *   · LA CAMPAGNE NON PLUS : `wait_session_use_pause` ne reçoit pas de cible.
 *     C'est ce qui rend « gains décidés côté serveur » vrai plutôt que promis.
 *   · L'OUVERTURE DÉPENSE LE SEAU DE LECTURE, les deux gestes celui de
 *     l'appareil — série distincte, sans quoi un écran qui se rafraîchit
 *     épuiserait le budget de `queueLeave`, c'est-à-dire de quelqu'un qui veut
 *     quitter la file dans laquelle il est debout.
 *   · AUCUN SEAU N'EST COMPOSÉ avec un identifiant choisi par l'appelant
 *     (session, entrée, réservation) : ce serait un seau neuf par UUID inventé,
 *     donc aucune borne (motif `progressionDevice`, wagon 7).
 *   · L'IP SEULE est comptée AVANT l'IP par organisation, et elle l'est même
 *     quand la source ne résout rien — un balayage d'UUID doit rester visible.
 *   · LE REFUS EST MUET et UNIQUE : rien ne distingue « inconnue » de « pas la
 *     vôtre », sur aucun des trois chemins.
 *
 * Le PONT `campaign` du tour offert n'est pas mesuré ici : il l'est dans
 * `offered-spin-bridge.test.ts`, qui joue les cinq modules d'offre contre le
 * même espion.
 * ════════════════════════════════════════════════════════════ */

/**
 * Les identifiants vivent DANS le bloc hoisté, parce que les doubles en ont
 * besoin avant que le module de test ne s'évalue — `vi.hoisted` remonte au-dessus
 * des `const` du fichier, et s'y référer d'en haut lève « before initialization ».
 */
const {
  state,
  makeAdmin,
  ouvrirMock,
  ORG_ID,
  AUTRE_ORG,
  ENTRY_ID,
  RESERVATION_ID,
  SESSION_ID,
  CAMPAIGN_ID,
  WHEEL_ID,
  PRIZE_ID,
  SPIN_ID,
  GRANT_TOKEN,
  EMPREINTE,
} = vi.hoisted(() => {
  const ORG_ID = "11111111-1111-4111-8111-111111111111";
  const AUTRE_ORG = "22222222-2222-4222-8222-222222222222";
  const ENTRY_ID = "33333333-3333-4333-8333-333333333333";
  const RESERVATION_ID = "44444444-4444-4444-8444-444444444444";
  const SESSION_ID = "55555555-5555-4555-8555-555555555555";
  const CAMPAIGN_ID = "66666666-6666-4666-8666-666666666666";
  const WHEEL_ID = "77777777-7777-4777-8777-777777777777";
  const PRIZE_ID = "88888888-8888-4888-8888-888888888888";
  const SPIN_ID = "99999999-9999-4999-8999-999999999999";
  const GRANT_TOKEN = "a".repeat(48);
  const EMPREINTE = "b".repeat(64);

  const state = {
    empreinte: EMPREINTE as string | null,
    /** La ligne que la résolution d'organisation rapporte, par table. */
    lignes: {} as Record<string, Record<string, unknown> | null>,
    usePauseResponse: {} as unknown,
    consumeResponse: {} as unknown,
    rpcCalls: [] as Array<{ name: string; args: Record<string, unknown> }>,
    lectures: [] as Array<{ table: string; filtres: Record<string, unknown> }>,
    rateLimitCalls: [] as Array<{ bucket: string; failClosed: boolean }>,
    seauxASec: [] as string[],
    pressions: [] as string[],
    reset() {
      state.empreinte = EMPREINTE;
      state.lignes = {
        reservation_queue_entries: { id: ENTRY_ID, organization_id: ORG_ID },
        reservations: { id: RESERVATION_ID, organization_id: ORG_ID },
        reservation_wait_sessions: {
          id: SESSION_ID,
          organization_id: ORG_ID,
        },
        spins: {
          wheel_id: WHEEL_ID,
          prize_id: PRIZE_ID,
          is_losing: false,
        },
      };
      state.usePauseResponse = {
        state: "granted",
        session_id: SESSION_ID,
        campaign_id: CAMPAIGN_ID,
        grant_token: GRANT_TOKEN,
      };
      state.consumeResponse = {
        state: "spun",
        spin_id: SPIN_ID,
        wheel_id: WHEEL_ID,
        campaign_id: CAMPAIGN_ID,
        prize_id: PRIZE_ID,
        is_losing: false,
      };
      state.rpcCalls = [];
      state.lectures = [];
      state.rateLimitCalls = [];
      state.seauxASec = [];
      state.pressions = [];
    },
  };

  function makeAdmin() {
    return {
      rpc: (name: string, args: Record<string, unknown>) => {
        state.rpcCalls.push({ name, args });
        if (name === "wait_session_use_pause") {
          return Promise.resolve({ data: state.usePauseResponse, error: null });
        }
        return Promise.resolve({ data: state.consumeResponse, error: null });
      },
      from(table: string) {
        const filtres: Record<string, unknown> = {};
        const builder = {
          select: () => builder,
          eq: (colonne: string, valeur: unknown) => {
            filtres[colonne] = valeur;
            return builder;
          },
          maybeSingle: () => {
            state.lectures.push({ table, filtres });
            return Promise.resolve({
              data: state.lignes[table] ?? null,
              error: null,
            });
          },
          // La seule lecture en liste du chemin : les lots de la roue cible.
          then: (
            onFulfilled: (v: { data: unknown; error: unknown }) => unknown,
          ) => {
            state.lectures.push({ table, filtres });
            const data =
              table === "prizes"
                ? [
                    {
                      id: PRIZE_ID,
                      label: "Un café offert",
                      description: "",
                      position: 1,
                      created_at: "2026-01-01T00:00:00.000Z",
                    },
                  ]
                : [];
            return Promise.resolve({ data, error: null }).then(onFulfilled);
          },
        };
        return builder;
      },
    };
  }

  return {
    state,
    makeAdmin,
    ouvrirMock: vi.fn(),
    ORG_ID,
    AUTRE_ORG,
    ENTRY_ID,
    RESERVATION_ID,
    SESSION_ID,
    CAMPAIGN_ID,
    WHEEL_ID,
    PRIZE_ID,
    SPIN_ID,
    GRANT_TOKEN,
    EMPREINTE,
  };
});

vi.mock("next/headers", () => ({
  headers: () => Promise.resolve({ get: () => null }),
  cookies: () => Promise.resolve({ get: () => undefined, set: vi.fn() }),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("next/server", () => ({ after: (fn: () => unknown) => void fn() }));

vi.mock("@/lib/reserver-context", () => ({
  lireIdentiteReserver: () => Promise.resolve(state.empreinte),
  assurerIdentiteReserver: () => Promise.resolve(state.empreinte),
  // L'ouverture RÉELLE (RPC + mapper) a ses tests dans `reserver-context`.
  // Ce qu'on mesure ici, c'est CE QU'ON LUI PASSE — l'organisation résolue
  // serveur, jamais une valeur du corps.
  ouvrirSessionAttente: ouvrirMock,
  lireEtatFilePublic: vi.fn(),
  droitReserverOuvertPourFile: () => Promise.resolve(true),
  generateInvitationToken: () => "jeton",
  hashInvitationToken: () => null,
}));

vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => makeAdmin() }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: () => Promise.resolve({ from: () => ({}) }),
}));
vi.mock("@/lib/auth", () => ({
  getUserAndOrg: () =>
    Promise.resolve({ user: null, organization: null, role: null, memberships: [] }),
}));
vi.mock("@/lib/resend", () => ({
  sendReservationConfirmationEmail: vi.fn(),
}));
vi.mock("@/lib/turnstile", () => ({
  turnstileEnabled: () => false,
  verifyTurnstile: () => Promise.resolve(true),
}));
vi.mock("@/lib/player-identity", () => ({
  bridgeOfferedSpinToCampaign: vi.fn(() => Promise.resolve()),
  ensureProgressivePlayerIdentity: vi.fn(() => Promise.resolve()),
}));
vi.mock("@/lib/spin", () => ({
  signClaimToken: (spinId: string) => `claim:${spinId}`,
}));

vi.mock("@/lib/rate-limit", async (importOriginal) => {
  const reel = await importOriginal<typeof import("@/lib/rate-limit")>();
  return {
    ...reel,
    rateLimit: (
      bucket: string,
      _rule: unknown,
      options?: { failClosed?: boolean },
    ) => {
      state.rateLimitCalls.push({
        bucket,
        failClosed: options?.failClosed === true,
      });
      if (state.seauxASec.some((prefixe) => bucket.startsWith(prefixe))) {
        return Promise.resolve(false);
      }
      return Promise.resolve(true);
    },
  };
});

vi.mock("@/lib/request-ip", () => ({
  clientIpFromHeaders: () => "203.0.113.7",
  observerPressionIp: (parts: Array<string | number>) => {
    state.pressions.push(parts.join(":"));
    return Promise.resolve();
  },
}));

vi.mock("@/lib/monitoring", () => ({
  monitored: <T,>(_nom: string, fn: () => T) => fn(),
  reportError: vi.fn(),
  recordCounter: vi.fn(),
  reportSecurityEvent: vi.fn(),
}));

import {
  consumeReserverWaitSpin,
  waitSessionOpen,
  waitUsePause,
} from "./reserver";

/** Les seaux consommés, dans l'ordre — la prémisse de la plupart des tests. */
const seaux = () => state.rateLimitCalls.map((appel) => appel.bucket);

beforeEach(() => {
  state.reset();
  ouvrirMock.mockReset();
  ouvrirMock.mockResolvedValue({
    sessionId: SESSION_ID,
    source: "queue_entry",
    quizId: null,
    pauseCampaignId: CAMPAIGN_ID,
    activityId: null,
    pauseChanceUsed: false,
    pause: "disponible",
    animations: ["pause"],
  });
});

describe("waitSessionOpen — ouvrir sans jamais toucher à la file", () => {
  it("résout l'organisation depuis l'ENTRÉE DE FILE, et c'est elle qui part", async () => {
    const res = await waitSessionOpen({ queueEntryId: ENTRY_ID });

    expect(res.ok).toBe(true);
    expect(state.lectures[0]).toEqual({
      table: "reservation_queue_entries",
      filtres: { id: ENTRY_ID },
    });
    expect(ouvrirMock).toHaveBeenCalledWith(ORG_ID, EMPREINTE, {
      queueEntryId: ENTRY_ID,
    });
  });

  it("résout l'organisation depuis la RÉSERVATION pour l'attente avec créneau", async () => {
    const res = await waitSessionOpen({ reservationId: RESERVATION_ID });

    expect(res.ok).toBe(true);
    expect(state.lectures[0].table).toBe("reservations");
    expect(ouvrirMock).toHaveBeenCalledWith(ORG_ID, EMPREINTE, {
      reservationId: RESERVATION_ID,
    });
  });

  it("IGNORE une organisation postée : elle n'est pas un champ du schéma", async () => {
    // ROUGE SI le schéma laissait passer `organizationId` : le navigateur
    // choisirait sous quelle enseigne il ouvre sa session, sur le chemin exact
    // où le refus de la RPC est muet.
    await waitSessionOpen({
      queueEntryId: ENTRY_ID,
      organizationId: AUTRE_ORG,
    } as { queueEntryId: string });

    expect(ouvrirMock).toHaveBeenCalledWith(ORG_ID, EMPREINTE, {
      queueEntryId: ENTRY_ID,
    });
  });

  it("dépense le seau de LECTURE, jamais celui des gestes", async () => {
    await waitSessionOpen({ queueEntryId: ENTRY_ID });

    expect(seaux()).toEqual([`reserver:queue-read:${EMPREINTE}`]);
    expect(state.rateLimitCalls[0].failClosed).toBe(true);
    // AUCUN seau composé avec l'identifiant d'entrée : ce serait un seau neuf
    // par UUID inventé, donc aucune borne.
    expect(seaux().some((seau) => seau.includes(ENTRY_ID))).toBe(false);
  });

  it("compte l'IP SEULE AVANT l'IP par organisation", async () => {
    await waitSessionOpen({ queueEntryId: ENTRY_ID });

    expect(state.pressions).toEqual([
      "reserver:ip",
      `reserver:public:ip:${ORG_ID}`,
    ]);
  });

  it("compte l'IP SEULE MÊME quand la source ne résout rien, et refuse muettement", async () => {
    // C'est tout l'intérêt de l'ordre : un balayage d'UUID n'atteint aucune
    // attente, et resterait sinon invisible en supervision.
    state.lignes.reservation_queue_entries = null;

    const res = await waitSessionOpen({ queueEntryId: ENTRY_ID });

    expect(res.ok).toBe(false);
    expect(state.pressions).toEqual(["reserver:ip"]);
    expect(ouvrirMock).not.toHaveBeenCalled();
  });

  it("refuse sans cookie, AVANT toute lecture et tout seau", async () => {
    state.empreinte = null;

    const res = await waitSessionOpen({ queueEntryId: ENTRY_ID });

    expect(res.ok).toBe(false);
    expect(state.rateLimitCalls).toHaveLength(0);
    expect(state.lectures).toHaveLength(0);
  });

  it("refuse ZÉRO source et refuse les DEUX, sans rien lire", async () => {
    const aucune = await waitSessionOpen({});
    const deux = await waitSessionOpen({
      queueEntryId: ENTRY_ID,
      reservationId: RESERVATION_ID,
    });

    expect(aucune.ok).toBe(false);
    expect(deux.ok).toBe(false);
    expect(state.lectures).toHaveLength(0);
  });

  it("à sec, rend un refus de cadence et n'ouvre rien", async () => {
    state.seauxASec = ["reserver:queue-read"];

    const res = await waitSessionOpen({ queueEntryId: ENTRY_ID });

    expect(res.ok).toBe(false);
    expect(ouvrirMock).not.toHaveBeenCalled();
  });

  it("une session refusée par la RPC devient le MÊME refus muet", async () => {
    ouvrirMock.mockResolvedValue(null);

    const res = await waitSessionOpen({ queueEntryId: ENTRY_ID });

    expect(res).toEqual({
      ok: false,
      error: "Cette animation n'est pas disponible.",
    });
  });
});

describe("waitUsePause — une Pause Chance, et le serveur choisit la campagne", () => {
  it("passe l'organisation de la SESSION, et AUCUNE campagne", async () => {
    const res = await waitUsePause({ sessionId: SESSION_ID });

    expect(res.ok).toBe(true);
    expect(state.lectures[0]).toEqual({
      table: "reservation_wait_sessions",
      filtres: { id: SESSION_ID },
    });
    expect(state.rpcCalls).toHaveLength(1);
    expect(state.rpcCalls[0].name).toBe("wait_session_use_pause");
    expect(state.rpcCalls[0].args).toEqual({
      p_organization_id: ORG_ID,
      p_session_id: SESSION_ID,
      p_player_key_hash: EMPREINTE,
    });
    // ROUGE SI une cible se mettait à voyager : le navigateur choisirait la
    // campagne sur laquelle il joue son tour offert.
    expect(
      Object.keys(state.rpcCalls[0].args).some((cle) =>
        cle.includes("campaign"),
      ),
    ).toBe(false);
  });

  it("rend le jeton et la campagne décidés par le serveur", async () => {
    const res = await waitUsePause({ sessionId: SESSION_ID });

    expect(res.ok && res.data.state).toBe("granted");
    expect(res.ok && res.data.grantToken).toBe(GRANT_TOKEN);
    expect(res.ok && res.data.campaignId).toBe(CAMPAIGN_ID);
  });

  it("rejouer rend LE MÊME jeton, avec le tour déjà tiré", async () => {
    // Le taire aurait puni un rechargement de page d'un tour perdu.
    state.usePauseResponse = {
      state: "already_used",
      session_id: SESSION_ID,
      campaign_id: CAMPAIGN_ID,
      grant_token: GRANT_TOKEN,
      spin_id: SPIN_ID,
    };

    const res = await waitUsePause({ sessionId: SESSION_ID });

    expect(res.ok && res.data.state).toBe("already_used");
    expect(res.ok && res.data.grantToken).toBe(GRANT_TOKEN);
    expect(res.ok && res.data.spinId).toBe(SPIN_ID);
  });

  it("« pas configurée » sort en SUCCÈS, « inconnue » en refus muet", async () => {
    // Les confondre aurait fait afficher une erreur au joueur d'un commerce qui
    // n'a simplement rien réglé.
    state.usePauseResponse = { state: "unconfigured" };
    const rien = await waitUsePause({ sessionId: SESSION_ID });
    expect(rien.ok && rien.data.state).toBe("unconfigured");

    state.usePauseResponse = { state: "unknown" };
    const inconnu = await waitUsePause({ sessionId: SESSION_ID });
    expect(inconnu).toEqual({
      ok: false,
      error: "Cette animation n'est pas disponible.",
    });
  });

  it("dépense le seau par APPAREIL — un geste, pas une lecture", async () => {
    await waitUsePause({ sessionId: SESSION_ID });

    expect(seaux()).toEqual([`reserver:device:${EMPREINTE}`]);
    expect(state.rateLimitCalls[0].failClosed).toBe(true);
    expect(seaux().some((seau) => seau.includes(SESSION_ID))).toBe(false);
  });

  it("tranche le seau AVANT la moindre requête", async () => {
    state.seauxASec = ["reserver:device"];

    const res = await waitUsePause({ sessionId: SESSION_ID });

    expect(res.ok).toBe(false);
    expect(state.lectures).toHaveLength(0);
    expect(state.rpcCalls).toHaveLength(0);
  });

  it("refuse muettement une session introuvable, sans appeler la RPC", async () => {
    state.lignes.reservation_wait_sessions = null;

    const res = await waitUsePause({ sessionId: SESSION_ID });

    expect(res.ok).toBe(false);
    expect(state.rpcCalls).toHaveLength(0);
    expect(state.pressions).toEqual(["reserver:ip"]);
  });
});

describe("consumeReserverWaitSpin — le tour offert, ordinaire", () => {
  it("échange le jeton contre un tour, sans passer AUCUNE organisation", async () => {
    // La RPC lit l'organisation sur la session, résolue par le jeton ET
    // l'empreinte : il n'y a rien à passer, donc rien à confondre.
    const res = await consumeReserverWaitSpin({
      sessionId: SESSION_ID,
      grantToken: GRANT_TOKEN,
    });

    expect(res.ok).toBe(true);
    expect(state.rpcCalls[0]).toEqual({
      name: "consume_reserver_wait_spin_grant",
      args: {
        p_session_id: SESSION_ID,
        p_player_key_hash: EMPREINTE,
        p_grant_token: GRANT_TOKEN,
      },
    });
  });

  it("signe un jeton de claim sur un gain, et rend l'index du lot", async () => {
    const res = await consumeReserverWaitSpin({
      sessionId: SESSION_ID,
      grantToken: GRANT_TOKEN,
    });

    expect(res.ok && res.data.claimToken).toBe(`claim:${SPIN_ID}`);
    expect(res.ok && res.data.prizeId).toBe(PRIZE_ID);
    expect(res.ok && res.data.prizeIndex).toBe(0);
    expect(res.ok && res.data.label).toBe("Un café offert");
  });

  it("ne signe RIEN sur un tour perdant", async () => {
    state.consumeResponse = {
      state: "spun",
      spin_id: SPIN_ID,
      wheel_id: WHEEL_ID,
      prize_id: null,
      is_losing: true,
    };

    const res = await consumeReserverWaitSpin({
      sessionId: SESSION_ID,
      grantToken: GRANT_TOKEN,
    });

    expect(res.ok && res.data.claimToken).toBeNull();
    expect(res.ok && res.data.isLosing).toBe(true);
  });

  it("`no_prize` sort en SUCCÈS sans lot : le jeton n'est pas brûlé", async () => {
    // Le joueur pourra revenir quand le commerçant aura réapprovisionné — un
    // jeton brûlé sur une roue vide serait une Pause Chance volée.
    state.consumeResponse = { state: "no_prize", wheel_id: WHEEL_ID };

    const res = await consumeReserverWaitSpin({
      sessionId: SESSION_ID,
      grantToken: GRANT_TOKEN,
    });

    expect(res.ok && res.data.state).toBe("no_prize");
    expect(res.ok && res.data.claimToken).toBeNull();
  });

  it("reprend un tour DÉJÀ tiré par son `resulting_spin_id`", async () => {
    // Le `player_key` du spin est l'empreinte du cookie : la reprise ne peut
    // pas passer par lui, elle passe par la ligne que la RPC a écrite.
    state.consumeResponse = { state: "already_consumed", spin_id: SPIN_ID };

    const res = await consumeReserverWaitSpin({
      sessionId: SESSION_ID,
      grantToken: GRANT_TOKEN,
    });

    expect(state.lectures.some((lecture) => lecture.table === "spins")).toBe(
      true,
    );
    expect(res.ok && res.data.state).toBe("already_consumed");
    expect(res.ok && res.data.wheelId).toBe(WHEEL_ID);
    expect(res.ok && res.data.claimToken).toBe(`claim:${SPIN_ID}`);
  });

  it("`unavailable` devient le MÊME refus muet que partout ailleurs", async () => {
    state.consumeResponse = { state: "unavailable" };

    const res = await consumeReserverWaitSpin({
      sessionId: SESSION_ID,
      grantToken: GRANT_TOKEN,
    });

    expect(res).toEqual({
      ok: false,
      error: "Cette animation n'est pas disponible.",
    });
  });

  it("refuse un jeton mal formé sans rien appeler", async () => {
    const res = await consumeReserverWaitSpin({
      sessionId: SESSION_ID,
      grantToken: "pas-un-jeton",
    });

    expect(res.ok).toBe(false);
    expect(state.rateLimitCalls).toHaveLength(0);
    expect(state.rpcCalls).toHaveLength(0);
  });

  it("dépense le seau par APPAREIL, et l'IP seule en observation", async () => {
    await consumeReserverWaitSpin({
      sessionId: SESSION_ID,
      grantToken: GRANT_TOKEN,
    });

    expect(seaux()).toEqual([`reserver:device:${EMPREINTE}`]);
    expect(state.pressions).toEqual(["reserver:ip"]);
  });
});
