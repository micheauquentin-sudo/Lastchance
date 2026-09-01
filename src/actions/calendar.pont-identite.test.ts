// @vitest-environment node
import { createHash } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

// ────────────────────────────────────────────────────────────
// LE PONT D'ANCIENNETÉ `calendar` FUITAIT PAR LA CASE (ID-6)
//
// `ensureProgressivePlayerIdentity` n'était appelé que par `joinCalendar`, et
// seulement en `state === "joined"`. Or `open_calendar_box` CRÉE lui aussi le
// `calendar_players` (migration 20260728120000:605), et il le fait AVANT la
// garde `too_early`.
//
// Conséquence pour un joueur qui scanne le QR et touche directement une case —
// le parcours le plus court, et le plus fréquent : aucun pont n'était jamais
// posé. Son code `CADEAU-` n'atteignait pas `/portefeuille`, et le jour où son
// cookie disparaîtrait, le repli d'identité globale n'aurait RIEN à rattraper.
// La bascule de lecture serait arrivée sur un module vide de ponts.
//
// Ce fichier fige les CHEMINS où le pont est posé et, surtout, l'empreinte
// qu'il reçoit : celle du cookie de MODULE (SHA-256 nu), jamais celle de
// l'appareil (salée). Les substituer ne lèverait aucune erreur.
// ────────────────────────────────────────────────────────────

const CAL_ID = "3f1b6c2a-0000-4000-8000-000000000001";
const ORG_ID = "9a2b6c2a-0000-4000-8000-0000000000aa";
const DAY_ID = "7c4d6c2a-0000-4000-8000-0000000000dd";
const TOKEN = "jeton-du-joueur-de-decembre";
/** Jeton d'octroi : 48 hexadécimaux, exactement ce que le schéma exige.
 *  Un jeton mal formé serait refusé AVANT tout, et rendrait ces tests muets. */
const JETON_OFFERT = "a".repeat(48);

const sha256 = (v: string) => createHash("sha256").update(v).digest("hex");

const { etat } = vi.hoisted(() => ({
  etat: {
    /** Cookie `lc-calendar-<id>` présent dans le navigateur, ou absent. */
    cookie: null as string | null,
    /** Cookies posés par l'action (on vérifie que le module en pose toujours). */
    poses: [] as Array<{ name: string; value: string }>,
    /** Réponse simulée de la RPC appelée, par nom. */
    rpc: {} as Record<string, unknown>,
    /** Appels RPC réellement partis. */
    appels: [] as Array<{ name: string; args: Record<string, unknown> }>,
    /** Ponts d'ancienneté posés, dans l'ordre — le cœur du sujet. */
    ponts: [] as Array<Record<string, unknown>>,
    /** Le contexte d'action résout-il ? (calendrier vivant ou non) */
    contexteOk: true,
  },
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) =>
      etat.cookie !== null && name === `lc-calendar-${CAL_ID}`
        ? { value: etat.cookie }
        : undefined,
    set: (name: string, value: string) => {
      etat.poses.push({ name, value });
      etat.cookie = value;
    },
  }),
  headers: async () => new Headers(),
}));

vi.mock("@/lib/auth", () => ({ getUserAndOrg: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn() }));

vi.mock("@/lib/monitoring", () => ({
  monitored: <T,>(_n: string, fn: () => Promise<T>) => fn(),
  reportError: vi.fn(),
  reportSecurityEvent: vi.fn(),
  recordCounter: vi.fn(),
}));

// Les deux remparts publics passent : ce fichier n'éprouve pas le débit.
vi.mock("@/lib/rate-limit", () => ({
  RATE_LIMITS: { calendarPlayerAction: {}, calendarPublicIp: {} },
  rateLimit: () => Promise.resolve(true),
  rateLimitBucket: (...parts: unknown[]) => parts.join(":"),
}));
vi.mock("@/lib/request-ip", () => ({
  clientIpFromHeaders: () => "203.0.113.7",
  observerPressionIp: () => Promise.resolve(),
}));

vi.mock("@/lib/calendar-spin-bundle", () => ({
  loadCalendarSpinBundles: () => Promise.resolve({}),
}));

/**
 * LE PONT, DOUBLÉ. On n'éprouve pas ici ce qu'il écrit (player-identity.test.ts
 * s'en charge) mais QU'IL EST APPELÉ, depuis quels chemins, et avec quelle
 * empreinte.
 */
vi.mock("@/lib/player-identity", () => ({
  ensureProgressivePlayerIdentity: (entree: Record<string, unknown>) => {
    etat.ponts.push(entree);
    return Promise.resolve({ ok: true });
  },
  bridgeOfferedSpinToCampaign: () => Promise.resolve(),
}));

/** Client admin minimal : seul `rpc` est emprunté par ces chemins. */
const admin = {
  rpc(name: string, args: Record<string, unknown>) {
    etat.appels.push({ name, args });
    return Promise.resolve({ data: etat.rpc[name] ?? null, error: null });
  },
};

vi.mock("@/lib/calendar-context", () => ({
  calendarTokenCookieName: (id: string) => `lc-calendar-${id}`,
  loadCalendarActionContext: () =>
    Promise.resolve(
      etat.contexteOk
        ? { ok: true, admin, calendarId: CAL_ID, organizationId: ORG_ID }
        : { ok: false },
    ),
  resoudreIdentiteCalendrier: () =>
    Promise.resolve({ tokenHash: null, joueur: null, cookiePose: false }),
}));

import { consumeCalendarSpin, openCalendarBox } from "./calendar";

beforeEach(() => {
  etat.cookie = TOKEN;
  etat.poses = [];
  etat.rpc = {};
  etat.appels = [];
  etat.ponts = [];
  etat.contexteOk = true;
});

// ────────────────────────────────────────────────────────────
// openCalendarBox — la fuite colmatée
// ────────────────────────────────────────────────────────────
describe("openCalendarBox — le pont d'ancienneté suit l'ouverture", () => {
  /** Les trois états qui ont DÉJÀ créé la ligne `calendar_players` en SQL. */
  const etatsAvecJoueur = ["opened", "already_opened", "too_early"] as const;

  it.each(etatsAvecJoueur)(
    "pose le pont sur `%s` — le joueur EXISTE déjà en base à ce stade",
    async (state) => {
      // `too_early` compte comme les autres : l'insertion du joueur précède la
      // garde de déverrouillage côté SQL. Rouge si quelqu'un restreignait le
      // pont aux seules ouvertures réussies — un joueur qui tape trop tôt sur
      // la case du lendemain existerait sans pont.
      etat.rpc.open_calendar_box = {
        state,
        day: { id: DAY_ID, day_index: 3, content_type: "lot", unlock_at: null },
        progression: { opened_count: 1, day_count: 24 },
      };

      const res = await openCalendarBox({ calendarId: CAL_ID, dayId: DAY_ID });

      expect(res.ok).toBe(true);
      expect(etat.ponts).toEqual([
        {
          organizationId: ORG_ID,
          experienceKind: "calendar",
          experienceId: CAL_ID,
          legacyIdentityHash: sha256(TOKEN),
          acquisitionSource: "direct",
        },
      ]);
    },
  );

  it("ne pose AUCUN pont sur `unavailable` — le seul état sans joueur créé", async () => {
    // Le SQL sort avant l'insertion quand le calendrier ou la case n'existe
    // pas. Rouge si le pont partait quand même : on inscrirait une adhésion à
    // une expérience que le joueur n'a jamais touchée.
    etat.rpc.open_calendar_box = { state: "unavailable" };

    await openCalendarBox({ calendarId: CAL_ID, dayId: DAY_ID });

    expect(etat.ponts).toEqual([]);
  });

  it("l'empreinte pontée est celle du COOKIE DE MODULE, jamais le jeton brut", async () => {
    // `calendar_players.token_hash` est un SHA-256 NU. Rouge si le jeton lui-
    // même partait vers le pont — il finirait dans `player_legacy_identities`,
    // et une fuite de cette table suffirait à rejouer l'identité du joueur.
    etat.rpc.open_calendar_box = {
      state: "opened",
      day: { id: DAY_ID, day_index: 1, content_type: "content" },
    };

    await openCalendarBox({ calendarId: CAL_ID, dayId: DAY_ID });

    expect(etat.ponts[0].legacyIdentityHash).toBe(sha256(TOKEN));
    expect(JSON.stringify(etat.ponts)).not.toContain(TOKEN);
    // Et la RPC reçoit la MÊME empreinte : c'est la condition pour que le pont
    // rattache l'ancienneté au joueur réellement créé.
    expect(etat.appels[0].args.p_player_token_hash).toBe(sha256(TOKEN));
  });

  it("le cookie de module reste POSÉ quand il manque (ADR-041)", async () => {
    // Le pont d'identité globale ne remplace rien : le module continue de
    // fabriquer et d'écrire son propre cookie. Rouge s'il cessait de le poser —
    // la production entière lit encore ce chemin en premier.
    etat.cookie = null;
    etat.rpc.open_calendar_box = {
      state: "opened",
      day: { id: DAY_ID, day_index: 1, content_type: "content" },
    };

    await openCalendarBox({ calendarId: CAL_ID, dayId: DAY_ID });

    expect(etat.poses).toHaveLength(1);
    expect(etat.poses[0].name).toBe(`lc-calendar-${CAL_ID}`);
    // Et le pont est posé sous l'empreinte de CE cookie neuf.
    expect(etat.ponts[0].legacyIdentityHash).toBe(sha256(etat.poses[0].value));
  });

  it("un calendrier fermé ne pose aucun pont et n'appelle aucune RPC", async () => {
    etat.contexteOk = false;

    await openCalendarBox({ calendarId: CAL_ID, dayId: DAY_ID });

    expect(etat.ponts).toEqual([]);
    expect(etat.appels).toEqual([]);
  });
});

// ────────────────────────────────────────────────────────────
// consumeCalendarSpin — la famille `calendar`, pas seulement la campagne
// ────────────────────────────────────────────────────────────
describe("consumeCalendarSpin — le pont de la famille `calendar`", () => {
  it("pose le pont `calendar` quand un tour offert est consommé", async () => {
    // Ce chemin posait DÉJÀ le pont de la CAMPAGNE (le lot du tour), mais aucun
    // pour le calendrier. Il rattrape en outre les joueurs entrés par une
    // ouverture antérieure à ce lot, qui n'ont encore aucun pont du tout.
    etat.rpc.consume_calendar_spin_grant = {
      state: "no_prize",
      wheel_id: null,
    };

    await consumeCalendarSpin({ calendarId: CAL_ID, grantToken: JETON_OFFERT });

    expect(etat.ponts).toEqual([
      {
        organizationId: ORG_ID,
        experienceKind: "calendar",
        experienceId: CAL_ID,
        legacyIdentityHash: sha256(TOKEN),
        acquisitionSource: "direct",
      },
    ]);
  });

  it("aucun pont quand le tour offert est indisponible", async () => {
    // `unavailable` veut dire que la RPC n'a reconnu ni le jeton ni le joueur :
    // rien à rattacher.
    etat.rpc.consume_calendar_spin_grant = { state: "unavailable" };

    await consumeCalendarSpin({ calendarId: CAL_ID, grantToken: JETON_OFFERT });

    expect(etat.ponts).toEqual([]);
  });

  it("sans cookie de module : aucun pont, aucune RPC", async () => {
    // Il n'y a rien à consommer sans identité, et l'action sort avant tout
    // aller-retour. Rouge si elle fabriquait une identité au passage : afficher
    // ou tenter une action ne doit jamais créer un joueur ex nihilo ici.
    etat.cookie = null;
    etat.rpc.consume_calendar_spin_grant = { state: "spun" };

    await consumeCalendarSpin({ calendarId: CAL_ID, grantToken: JETON_OFFERT });

    expect(etat.ponts).toEqual([]);
    expect(etat.appels).toEqual([]);
  });
});
