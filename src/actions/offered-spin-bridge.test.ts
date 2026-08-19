// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

/* ════════════════════════════════════════════════════════════
 * LE PONT `campaign` DU TOUR OFFERT EST-IL ATTEIGNABLE ?
 *
 * ── LE DÉFAUT QUI JUSTIFIE CE FICHIER ───────────────────────
 *
 * Quatre modules offrent un tour de roue (calendrier, fidélité, quiz,
 * parrainage). Chacun posait le pont d'identité de SA famille ; aucun ne posait
 * celui de la CAMPAGNE sur laquelle le tour est réellement joué. La
 * `participations` que `claimPrize` crée ensuite est pourtant résolue par le
 * triplet (`campaign`, campaign_id, player_key) : sans ce pont,
 * `reward_issuances.player_id` reste null et le lot gagné n'apparaît JAMAIS sur
 * `/portefeuille` — sans une erreur nulle part (ADR-066).
 *
 * ── POURQUOI CE FICHIER EXISTE EN PLUS DE LA GARDE TEXTUELLE ──
 *
 * `player-identity-coverage.test.ts` cherche `bridgeOfferedSpinToCampaign(`
 * dans le SOURCE des quatre fichiers. QA l'a mesuré : préfixer les quatre
 * appels par `void 0 &&` — soit exactement la régression à attraper, un appel
 * présent mais jamais exécuté — laissait cette garde VERTE. Elle prouve qu'un
 * appel EXISTE dans un fichier, pas qu'il est ATTEIGNABLE.
 *
 * Ici les quatre actions sont réellement EXÉCUTÉES, contre des doubles, et
 * c'est l'appel au pont qui est observé. Le même sabotage `void 0 &&` fait
 * rougir ce fichier.
 *
 * ── CE QUE NI L'UNE NI L'AUTRE NE PROUVE ────────────────────
 *
 * Que le pont écrive la BONNE ligne. `bridgeOfferedSpinToCampaign` relit
 * organisation, campagne et `player_key` sur le spin que la RPC vient
 * d'écrire ; sa justesse est éprouvée dans `player-identity.test.ts`, et le
 * miroir SQL par pgTAP. Ici il est remplacé par un espion : on mesure la
 * jonction entre les quatre modules et lui, rien d'autre.
 *
 * Et la garde textuelle garde une valeur que celle-ci n'a pas : elle se dérive
 * du dossier `src/actions`, donc un module d'offre écrit demain y arrive avec
 * son exigence, sans que personne pense à l'inscrire. Ce fichier-ci, lui,
 * énumère les modules à la main — il ne dira rien du suivant. Les deux se
 * complètent ; aucune ne remplace l'autre.
 *
 * ── LE CINQUIÈME EST ARRIVÉ (RES-4) ────────────────────────
 *
 * La Pause Chance du Mode Attente active offre un tour sur la campagne que le
 * commerçant a dotée. C'est exactement le patron des quatre autres, donc
 * exactement le même défaut à attraper : la liste ci-dessous a été portée à
 * cinq, et c'est le geste que la garde textuelle ne sait pas faire toute seule.
 * ════════════════════════════════════════════════════════════ */

const ORG_ID = "11111111-1111-4111-8111-111111111111";
const CAMPAIGN_ID = "22222222-2222-4222-8222-222222222222";
const CALENDAR_ID = "33333333-3333-4333-8333-333333333333";
const PROGRAM_ID = "44444444-4444-4444-8444-444444444444";
const QUIZ_ID = "55555555-5555-4555-8555-555555555555";
const WHEEL_ID = "66666666-6666-4666-8666-666666666666";
const PRIZE_ID = "77777777-7777-4777-8777-777777777777";
const SPIN_ID = "88888888-8888-4888-8888-888888888888";
/** 48 hexa : le CHECK SQL du jeton de grant, recopié par les cinq schémas. */
const GRANT_TOKEN = "a".repeat(48);
const REFERRAL_SLUG = "chez-marcel";
/** La session d'attente active (RES-4) qui porte la Pause Chance. */
const WAIT_SESSION_ID = "99999999-9999-4999-8999-999999999999";
/** Empreinte du cookie joueur — 64 hexa, la forme exigée par les RPC RES-4. */
const EMPREINTE = "a".repeat(64);

const { state, ADMIN, bridgeMock, ensureMock } = vi.hoisted(() => {
  const state = {
    /** Issue rendue par les quatre RPC `consume_*_spin_grant`. */
    grant: {} as Record<string, unknown>,
    /** Noms des RPC appelées, dans l'ordre — prémisse des assertions. */
    rpcCalls: [] as string[],
    reset() {
      state.grant = {
        state: "spun",
        spin_id: SPIN_ID,
        wheel_id: WHEEL_ID,
        prize_id: PRIZE_ID,
        is_losing: false,
      };
      state.rpcCalls = [];
    },
  };

  /**
   * UN SEUL client admin pour tout le fichier : les contextes d'action le
   * rendent, et c'est lui qu'on s'attend à voir arriver au pont. Comparer
   * l'identité de l'objet est ce qui distingue « le pont reçoit le client du
   * contexte » de « le pont reçoit un client fabriqué au passage ».
   */
  const ADMIN = {
    rpc: (name: string) => {
      state.rpcCalls.push(name);
      return Promise.resolve({ data: state.grant, error: null });
    },
    from(table: string) {
      const filters: Record<string, unknown> = {};
      const builder = {
        select: () => builder,
        eq: (column: string, value: unknown) => {
          filters[column] = value;
          return builder;
        },
        maybeSingle: () =>
          Promise.resolve({
            data:
              table === "spins"
                ? { wheel_id: WHEEL_ID, prize_id: PRIZE_ID, is_losing: false }
                : null,
            error: null,
          }),
        then: (
          onFulfilled: (v: { data: unknown; error: unknown }) => unknown,
          onRejected?: (e: unknown) => unknown,
        ) => {
          // La seule lecture en liste du chemin : les lots de la roue cible,
          // pour l'index et le libellé rendus au joueur.
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
          return Promise.resolve({ data, error: null }).then(onFulfilled, onRejected);
        },
      };
      return builder;
    },
  };

  return {
    state,
    ADMIN,
    bridgeMock: vi.fn(() => Promise.resolve()),
    ensureMock: vi.fn(() => Promise.resolve()),
  };
});

// ── Le pont : espionné, jamais exécuté (sa justesse a ses propres tests) ──
vi.mock("@/lib/player-identity", () => ({
  bridgeOfferedSpinToCampaign: bridgeMock,
  ensureProgressivePlayerIdentity: ensureMock,
}));

// ── Socle Next / Supabase / observabilité ──
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({
  redirect: vi.fn(() => {
    throw new Error("NEXT_REDIRECT");
  }),
}));
vi.mock("next/headers", () => ({
  headers: () => Promise.resolve({}),
  // Un cookie joueur est rendu QUEL QUE SOIT le nom demandé : les trois
  // modules à cookie sortent avant toute requête s'il manque, et ce n'est pas
  // ce que ce fichier mesure.
  cookies: () =>
    Promise.resolve({
      get: () => ({ value: "jeton-joueur" }),
      set: vi.fn(),
      getAll: () => [],
    }),
}));
vi.mock("@/lib/auth", () => ({ getUserAndOrg: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ADMIN }));
vi.mock("@/lib/monitoring", () => ({
  monitored: <T,>(_name: string, fn: () => T) => fn(),
  reportError: vi.fn(),
  reportSecurityEvent: vi.fn(),
  recordCounter: vi.fn(),
}));
vi.mock("@/lib/request-ip", async (importOriginal) => ({
  // Le module RÉEL est conservé : `observerPressionIp` doit s'exécuter
  // pour vrai, sinon ces tests ne prouveraient plus rien du seau qu'ils
  // observent. Seule la lecture d'IP est doublée — elle lit des en-têtes
  // que ce harnais n'a pas.
  ...(await importOriginal<typeof import("@/lib/request-ip")>()),
  clientIpFromHeaders: () => "203.0.113.9",
}));
vi.mock("@/lib/turnstile", () => ({
  turnstileEnabled: () => false,
  verifyTurnstile: () => Promise.resolve(true),
}));
vi.mock("@/lib/anonymous-player", () => ({
  anonymousPlayerKey: () => Promise.resolve("cle-device"),
}));
vi.mock("@/lib/revalidate-play", () => ({ revalidatePlaySlugs: vi.fn() }));

// Les seaux ne sont pas le sujet ici : ils autorisent, et leurs refus sont
// éprouvés dans les tests de chaque module.
vi.mock("@/lib/rate-limit", () => ({
  rateLimit: () => Promise.resolve(true),
  rateLimitBucket: (...parts: Array<string | number>) => parts.join(":"),
  observeSharedKey: () => Promise.resolve(),
  RATE_LIMITS: new Proxy(
    {},
    { get: () => ({ limit: 1_000, windowSeconds: 60 }) },
  ),
}));

// ── Les quatre contextes d'action : tous rendent LE MÊME client admin ──
vi.mock("@/lib/calendar-context", () => ({
  calendarTokenCookieName: (id: string) => `lc-cal-${id}`,
  loadCalendarActionContext: () =>
    Promise.resolve({
      ok: true,
      admin: ADMIN,
      calendar: { id: CALENDAR_ID, organization_id: ORG_ID },
      organization: { id: ORG_ID },
    }),
}));
vi.mock("@/lib/loyalty-context", () => ({
  loyaltyTokenCookieName: (id: string) => `lc-loy-${id}`,
  loadLoyaltyActionContext: () =>
    Promise.resolve({
      ok: true,
      admin: ADMIN,
      program: { id: PROGRAM_ID, min_stamp_interval_seconds: 60 },
      organization: { id: ORG_ID },
    }),
}));
vi.mock("@/lib/quiz-context", () => ({
  quizTokenCookieName: (id: string) => `lc-quiz-${id}`,
  hasQuizAccess: () => true,
  loadQuizActionContext: () =>
    Promise.resolve({
      ok: true,
      admin: ADMIN,
      quiz: { id: QUIZ_ID, organization_id: ORG_ID },
      organization: { id: ORG_ID },
    }),
}));
vi.mock("@/lib/referral-context", () => ({
  hasReferralAccess: () => true,
  resolveReferralCampaignId: () => Promise.resolve(CAMPAIGN_ID),
  loadReferralActionContext: () =>
    Promise.resolve({
      ok: true,
      admin: ADMIN,
      campaignId: CAMPAIGN_ID,
      organization: { id: ORG_ID },
    }),
  loadReferralPublicContext: vi.fn(),
}));
// RES-4 : le module d'attente active n'a pas de « contexte d'action » — la RPC
// de tirage résout la session par le jeton ET l'empreinte, donc il n'y a rien
// à charger. Seule l'identité cookie est doublée ; le reste du module
// (chargeurs de page, jeton d'invitation) n'est pas sur ce chemin.
vi.mock("@/lib/reserver-context", () => ({
  lireIdentiteReserver: () => Promise.resolve(EMPREINTE),
  assurerIdentiteReserver: () => Promise.resolve(EMPREINTE),
  ouvrirSessionAttente: vi.fn(),
  lireEtatFilePublic: vi.fn(),
  droitVitrineOuvertPourFile: () => Promise.resolve(true),
  generateInvitationToken: () => "jeton",
  hashInvitationToken: () => null,
}));

import { consumeCalendarSpin } from "./calendar";
import { consumeLoyaltySpin } from "./loyalty";
import { consumeQuizSpin } from "./quiz";
import { consumeReferralSpin } from "./referral";
import { consumeReserverWaitSpin } from "./reserver";

/**
 * Les quatre modules d'offre, joués pour de vrai. Chacun rend l'issue typée du
 * tour ; on n'inspecte ici que `claimToken` (la condition sous laquelle une
 * participation peut naître, donc sous laquelle le pont DOIT être posé).
 */
const MODULES: Array<{
  nom: string;
  rpc: string;
  jouer: () => Promise<{ ok: boolean; data?: { claimToken: string | null } }>;
}> = [
  {
    nom: "calendrier",
    rpc: "consume_calendar_spin_grant",
    jouer: () =>
      consumeCalendarSpin({ calendarId: CALENDAR_ID, grantToken: GRANT_TOKEN }),
  },
  {
    nom: "fidélité",
    rpc: "consume_loyalty_spin_grant",
    jouer: () =>
      consumeLoyaltySpin({ programId: PROGRAM_ID, grantToken: GRANT_TOKEN }),
  },
  {
    nom: "quiz",
    rpc: "consume_quiz_spin_grant",
    jouer: () => consumeQuizSpin({ quizId: QUIZ_ID, grantToken: GRANT_TOKEN }),
  },
  {
    nom: "parrainage",
    rpc: "consume_referral_spin_grant",
    jouer: () =>
      consumeReferralSpin({ slug: REFERRAL_SLUG, grantToken: GRANT_TOKEN }),
  },
  {
    nom: "attente active",
    rpc: "consume_reserver_wait_spin_grant",
    jouer: () =>
      consumeReserverWaitSpin({
        sessionId: WAIT_SESSION_ID,
        grantToken: GRANT_TOKEN,
      }),
  },
];

beforeEach(() => {
  state.reset();
  vi.clearAllMocks();
});

describe("tour offert — le pont `campaign` est réellement APPELÉ", () => {
  it.each(MODULES)(
    "$nom : un gain non perdant pose le pont, avec le client du contexte et le spin de la RPC",
    async ({ rpc, jouer }) => {
      const res = await jouer();

      // Prémisse : sans elle, un module qui refuserait tout (schéma changé,
      // contexte fermé) rendrait ce test VACANT tout en le laissant vert.
      expect(res.ok, "le tour offert n'a pas abouti").toBe(true);
      expect(state.rpcCalls).toContain(rpc);
      expect(res.data?.claimToken, "aucun jeton de claim émis").toBeTruthy();

      // ROUGE SI l'appel au pont devient inatteignable — `void 0 &&`, une
      // condition qui ne passe plus, un `return` déplacé au-dessus. C'est ce
      // que la garde textuelle ne voyait pas.
      expect(bridgeMock).toHaveBeenCalledTimes(1);
      // Le client admin est celui du CONTEXTE (identité de l'objet), et le
      // spin est celui que la RPC vient d'écrire — jamais un identifiant
      // fabriqué par l'appelant, qui rouvrirait l'écart qu'ADR-066 ferme.
      expect(bridgeMock).toHaveBeenCalledWith(ADMIN, SPIN_ID);
    },
  );

  it.each(MODULES)(
    "$nom : un tour PERDANT ne pose aucun pont",
    async ({ jouer }) => {
      // Contre-exemple indispensable : sans lui, un pont posé inconditionnellement
      // en tête de fonction passerait le test précédent. Un tour perdant n'a
      // aucun lot à faire figurer au portefeuille — et `claimPrize` ne créera
      // aucune participation.
      state.grant = { ...state.grant, is_losing: true };

      const res = await jouer();

      expect(res.ok).toBe(true);
      expect(res.data?.claimToken).toBeNull();
      expect(bridgeMock).not.toHaveBeenCalled();
    },
  );

  it.each(MODULES)(
    "$nom : un tour sans lot en jeu ne pose aucun pont",
    async ({ jouer }) => {
      // Second contre-exemple, sur l'AUTRE branche de sortie : la roue n'avait
      // rien à donner. Elle sort avant la reconstruction de l'issue, donc elle
      // ne serait pas couverte par le cas perdant ci-dessus.
      state.grant = { state: "no_prize", wheel_id: WHEEL_ID };

      const res = await jouer();

      expect(res.ok).toBe(true);
      expect(res.data?.claimToken).toBeNull();
      expect(bridgeMock).not.toHaveBeenCalled();
    },
  );
});
