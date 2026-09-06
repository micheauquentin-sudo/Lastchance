import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SmsSendJobPayload } from "@/lib/sms-dispatch";

// ────────────────────────────────────────────────────────────
// claimPrize — ORDRE DES GARDES et DÉPARTAGE DES SEAUX
//
// Régression fermée ici : le claim se terminait sur `claim:ip`, un seau
// `failClosed` porté par l'IP SEULE, à portée PLATEFORME (toutes organisations
// confondues) et consommé AVANT la vérification du jeton. Deux conséquences,
// toutes deux subies par des joueurs légitimes :
//   · un tiers derrière le même CGNAT / Wi-Fi de commerce épuisait le budget et
//     empêchait les autres d'encaisser leur lot ;
//   · un abus visant UNE organisation coupait les joueurs de TOUTES les autres.
//
// PRINCIPE appliqué (identique au parcours de fidélité) : dans un parcours
// PUBLIC, aucune clé PARTAGÉE entre utilisateurs ne porte de seau fail-closed —
// elle ne porte qu'un compteur LARGE et fail-OPEN, à valeur d'observabilité. Le
// `failClosed` n'est admis que sur une clé propre à UNE identité, ici le
// `spin_id` extrait du jeton de claim VÉRIFIÉ. Et aucun seau n'est consommé
// avant la garde qui identifie l'appelant.
//
// Ce chemin est PARTAGÉ : la roue publique et le tour offert du passeport de
// fidélité appellent tous deux `claimPrize` avec un jeton signé par
// `signClaimToken` (le module @/lib/spin n'est donc PAS mocké : les tests
// signent et vérifient de vrais jetons HMAC).
// ────────────────────────────────────────────────────────────

const ORG_ID = "org-1";
const CAMPAIGN_ID = "campaign-1";
const WHEEL_ID = "wheel-1";
const PRIZE_ID = "prize-1";
const SPIN_ID = "11111111-1111-4111-8111-111111111111";
/** Second gain, tiré par un AUTRE joueur : sert à prouver l'isolement. */
const OTHER_SPIN_ID = "22222222-2222-4222-8222-222222222222";

const { state, makeAdmin } = vi.hoisted(() => {
  interface SpinRow {
    id: string;
    organization_id: string;
    campaign_id: string;
    wheel_id: string;
    prize_id: string | null;
    is_losing: boolean;
    claimed: boolean;
    /**
     * Empreinte de l'appareil qui a TIRÉ ce spin. Optionnelle ici comme elle
     * peut l'être en base sur les lignes anciennes : la liaison ne doit
     * refuser un gain que sur une CONTRADICTION, jamais sur une absence.
     */
    player_key?: string | null;
    /**
     * Origine du spin. `direct`/`share` : parcours public, où `player_key` EST
     * l'empreinte du cookie anonyme. Toute autre valeur désigne un TOUR OFFERT
     * (`reserver_wait`, fidélité, calendrier…), qui y écrit l'identité de SON
     * module — et que la liaison gain/appareil doit donc laisser passer.
     */
    source: string;
  }

  const makeSpin = (id: string): SpinRow => ({
    id,
    organization_id: ORG_ID,
    campaign_id: CAMPAIGN_ID,
    wheel_id: WHEEL_ID,
    prize_id: PRIZE_ID,
    is_losing: false,
    claimed: false,
    // `source` n'est PAS décoratif ici : la liaison gain/appareil ne s'applique
    // qu'aux spins du parcours public (`direct`/`share`), parce que les tours
    // OFFERTS des autres modules écrivent une tout autre identité dans
    // `player_key`. Sans cette valeur, la fixture décrivait un spin d'origine
    // inconnue, la garde se désarmait, et le cas « cookie divergent » passait
    // pour vert alors qu'il ne prouvait plus rien. La colonne est `not null`
    // en base : une fixture sans elle ne représentait aucune ligne réelle.
    source: "direct",
  });

  // NB : `vi.hoisted` s'exécute AVANT les `const` du module — rien ici ne doit
  // lire ORG_ID/SPIN_ID à l'évaluation. Les identifiants ne sont touchés que
  // par `reset()` et `makeAdmin()`, tous deux appelés plus tard.
  const state = {
    spins: new Map<string, SpinRow>(),
    /**
     * Participations INDEXÉES PAR SPIN, comme la colonne unique
     * `participations.spin_id` de la base. C'est ce qui rend mesurable la
     * différence entre « le même code est rendu » et « un second lot est
     * émis » : chaque appel réussi de `claim_winning_spin` ajoute une entrée,
     * et le rejeu n'en ajoute aucune.
     */
    participations: new Map<string, string>(),
    /** Compteurs de seaux — modèle fidèle de `check_rate_limit` (incrément et
     *  verdict dans le MÊME appel). */
    counters: new Map<string, number>(),
    rateLimitCalls: [] as string[],
    /**
     * Retard injecté dans le compteur PARTAGÉ, et drapeau de sa TERMINAISON.
     *
     * Le compteur de pression est démarré sans être attendu (son verdict ne
     * décide de rien) puis attendu avant tout retour. Ces deux champs rendent
     * la seconde moitié PROUVABLE : sans retard, un compteur abandonné en vol
     * se terminerait quand même avant l'assertion et le test passerait à tort.
     */
    pressionRetardMs: 0,
    pressionTerminee: false,
    /** Seaux dont le verdict a été NÉGATIF : sert à distinguer « le seau a
     *  refusé » de « le seau a seulement alerté ». */
    rateLimitDenied: [] as string[],
    rpcCalls: [] as Array<{ name: string; args: Record<string, unknown> }>,
    /**
     * Les tirages RÉELLEMENT ÉMIS par `perform_atomic_spin`, dans l'ordre.
     * C'est le seul compteur qui distingue « la même issue est rendue » de
     * « un second spin a été créé, avec son second décrément de stock ».
     */
    tiragesEmis: [] as Array<{
      spin_id: string;
      prize_id: string | null;
      is_losing: boolean;
      denial_reason: string | null;
      next_eligible_at: string | null;
    }>,
    /** Index de rejeu de la RPC : (clé d'idempotence, roue, joueur) → tirage. */
    tiragesParCle: new Map<
      string,
      {
        spin_id: string;
        prize_id: string | null;
        is_losing: boolean;
        denial_reason: string | null;
        next_eligible_at: string | null;
      }
    >(),
    ip: "203.0.113.7",
    /** Empreinte joueur rendue par le cookie — MUTABLE, pour pouvoir simuler
     *  une salle entière derrière une seule IP (contre-épreuve du plafond). */
    playerKey: "anonymous-player-key",
    /** La campagne collecte-t-elle un téléphone ? (c'est le cas SMS.) */
    collectPhone: false,
    /** Existe-t-il un consentement SMS ACTIF pour ce couple (org, numéro) ? */
    smsConsent: false,
    /** `record_sms_consent` lève-t-elle ? (numéro retiré, numéro illisible) */
    consentWriteError: null as string | null,
    /** L'expéditeur AF2M déclaré, ou `null` s'il n'y en a pas. */
    smsSender: "MONRESTO" as string | null,
    /** La RELECTURE de `participations` par `spin_id` échoue-t-elle ? */
    relectureEnPanne: false,
    /** `claim_winning_spin` refuse-t-elle, quel que soit l'état du spin ? */
    rpcEnPanne: false,
    /**
     * `perform_atomic_spin` rend-elle une ERREUR de transport ?
     *
     * Distinct de `rpcEnPanne`, qui vise la réclamation. Ce levier-ci sert le
     * seul cas où le serveur ne peut PAS dire si un tirage a été commis : la
     * coupure d'après-commit rend la même erreur qu'un refus d'avant écriture.
     */
    tirageEnPanne: false,
    /**
     * Ce que `recover_pending_spin` rend — la fenêtre de reprise est calculée
     * DANS la base (elle suit le `play_limit`), ce double n'a donc qu'à jouer
     * le rôle du guichet : une ligne, ou aucune.
     */
    recovery: null as Array<{
      spin_id: string;
      prize_id: string | null;
      created_at: string;
    }> | null,
    reset() {
      state.spins = new Map([
        [SPIN_ID, makeSpin(SPIN_ID)],
        [OTHER_SPIN_ID, makeSpin(OTHER_SPIN_ID)],
      ]);
      state.participations = new Map();
      state.counters = new Map();
      state.rateLimitCalls = [];
      state.rateLimitDenied = [];
      state.pressionRetardMs = 0;
      state.pressionTerminee = false;
      state.rpcCalls = [];
      state.ip = "203.0.113.7";
      state.playerKey = "anonymous-player-key";
      state.collectPhone = false;
      state.smsConsent = false;
      state.consentWriteError = null;
      state.smsSender = "MONRESTO";
      state.relectureEnPanne = false;
      state.rpcEnPanne = false;
      state.tirageEnPanne = false;
      state.recovery = null;
      state.tiragesEmis = [];
      state.tiragesParCle = new Map();
    },
  };

  function makeAdmin() {
    return {
      rpc: (name: string, args: Record<string, unknown>) => {
        state.rpcCalls.push({ name, args });
        if (name === "perform_atomic_spin") {
          /* Tirage gagnant déterministe (le spin réussit et désigne PRIZE_ID),
           * PLUS la recherche de rejeu JOB-8 transcrite du SQL.
           *
           * Cette moitié-là n'est pas décorative : sans elle, le double rendait
           * le MÊME `spin_id` à chaque appel, si bien qu'un tirage idempotent
           * et un double tirage étaient indiscernables — un test « le même
           * résultat est rendu » serait passé au vert sur une fonction qui
           * tire deux fois. Ce qu'on compte ici, ce sont les ÉMISSIONS.
           *
           * La recherche est bornée à (clé, wheel_id, player_key) exactement
           * comme la RPC (20261210120000:208-213) : une clé portée par un autre
           * joueur ne rend RIEN, elle ne rend pas le spin de ce joueur-là.
           * Et sans clé, aucune recherche n'a lieu — c'est le comportement
           * d'origine, celui de tous les spins antérieurs. */
          if (state.tirageEnPanne) {
            return Promise.resolve({
              data: null,
              error: { message: "connexion perdue apres commit" },
            });
          }
          const cle = args.p_idempotency_key;
          const empreinte =
            typeof cle === "string" && cle.length > 0
              ? `${cle}|${String(args.p_wheel_id)}|${String(args.p_player_key)}`
              : null;
          if (empreinte) {
            const deja = state.tiragesParCle.get(empreinte);
            if (deja) return Promise.resolve({ data: [deja], error: null });
          }
          const rang = state.tiragesEmis.length;
          const ligne = {
            spin_id:
              rang === 0
                ? SPIN_ID
                : `${SPIN_ID.slice(0, -3)}${String(rang).padStart(3, "0")}`,
            prize_id: PRIZE_ID,
            is_losing: false,
            denial_reason: null as string | null,
            next_eligible_at: null as string | null,
          };
          state.tiragesEmis.push(ligne);
          if (empreinte) state.tiragesParCle.set(empreinte, ligne);
          return Promise.resolve({ data: [ligne], error: null });
        }
        // ── Le canal SMS, tel que le socle le présente ──────
        // Transcription minimale, pour ce double SEUL : le produit ne
        // normalise jamais un numéro en TypeScript, il appelle la base.
        if (name === "recover_pending_spin") {
          return Promise.resolve({ data: state.recovery, error: null });
        }
        if (name === "sms_phone_e164") {
          const digits = String(args.p_phone ?? "").replace(/[^0-9]/g, "");
          return Promise.resolve({
            data: digits.length < 6 ? null : `+33${digits.replace(/^0/, "")}`,
            error: null,
          });
        }
        if (name === "sms_sender_for_send") {
          return Promise.resolve({ data: state.smsSender, error: null });
        }
        if (name === "record_sms_consent") {
          // Le socle, tel qu'il se comporte : l'écriture rend la ligne
          // LISIBLE pour la lecture qui suit. C'est exactement ce que
          // l'ancien ordre ne permettait pas — le consentement était écrit
          // par un second appel, APRÈS que le dépôt eut déjà lu et abandonné.
          if (state.consentWriteError) {
            return Promise.resolve({
              data: null,
              error: { message: state.consentWriteError },
            });
          }
          state.smsConsent = true;
          return Promise.resolve({ data: "consent-1", error: null });
        }
        if (name !== "claim_winning_spin") {
          return Promise.resolve({ data: null, error: null });
        }
        const spin = state.spins.get(String(args.p_spin_id));
        // ── POURQUOI UN REFUS DE RPC INDÉPENDANT DU SPIN ───────────────
        // La branche corrigée de `claimPrizeInner` n'est atteignable que si le
        // spin LU EN AMONT porte encore `claimed = false` (sinon le contrôle de
        // play.ts:597 sort avant) ET que la RPC refuse quand même. Comme les
        // deux lisent le même objet de ce double, seul un refus qui ne dépend
        // pas de `spin.claimed` permet d'y arriver — c'est aussi ce que le
        // correctif affirme couvrir : « quel que soit le chemin par lequel la
        // RPC a refusé ». Sans ce levier les deux contrôles négatifs
        // n'atteignaient pas la branche qu'ils prétendaient éprouver.
        if (state.rpcEnPanne) {
          return Promise.resolve({
            data: null,
            error: { message: "gain unavailable" },
          });
        }
        // Transaction à usage unique : un spin déjà réclamé ne repasse pas.
        //
        // ── LE MESSAGE EXACT COMPTE, ET IL A ÉTÉ MESURÉ ────────────────
        // Ce double rendait « spin already claimed », et la production
        // décidait du rejeu en cherchant « already claimed » dans le message :
        // le test confirmait donc la prémisse au lieu de l'éprouver. La
        // définition VIVANTE de `claim_winning_spin`
        // (20260723110000_merchant_automations.sql:97-99) ouvre sur un
        // `select … for update` du spin, qui SÉRIALISE les appels concurrents :
        // le second attend, relit `claimed = true` et sort sur
        // `gain unavailable`. Le `raise exception 'gain already claimed'`
        // (:189-191) ne vit que dans le handler `unique_violation`, que ce
        // verrou rend inatteignable. C'est ce message-là que la base rend.
        if (!spin || spin.claimed) {
          return Promise.resolve({
            data: null,
            error: { message: "gain unavailable" },
          });
        }
        spin.claimed = true;
        state.participations.set(spin.id, "GAIN-ABCD2345");
        // ── LE CONSENTEMENT SMS EST ÉCRIT ICI, DANS LA MÊME TRANSACTION ──
        //
        // Il l'était par un appel SÉPARÉ (`record_sms_consent`), émis APRÈS le
        // commit de ce claim. Une invocation serverless morte entre les deux
        // le perdait définitivement — et sans consentement, tout envoi
        // ultérieur échoue en silence : ce n'était pas un message perdu, mais
        // le canal SMS de ce client. La migration 20261213120000 l'a fait
        // entrer dans la transaction, via `p_sms_opt_in`.
        //
        // Ce double doit refléter ce commerce-là, sinon les tests d'envoi
        // continueraient de prouver l'ancienne architecture.
        // Le SAVEPOINT compte autant que l'écriture : `record_sms_consent`
        // LÈVE sur deux cas parfaitement ordinaires — numéro ayant fait STOP,
        // numéro illisible. La migration l'appelle donc sous un sous-bloc
        // `exception when others` (20261213120000:245-249) : le consentement
        // est annulé, le GAIN reste délivré. Sans ce `&& !consentWriteError`,
        // ce double prétendrait qu'un numéro retiré se réactive tout seul.
        if (args.p_sms_opt_in === true && !state.consentWriteError) {
          state.smsConsent = true;
        }
        return Promise.resolve({
          data: [
            { participation_id: `participation-${spin.id}`, redeem_code: "GAIN-ABCD2345" },
          ],
          error: null,
        });
      },
      from(table: string) {
        const filters: Record<string, unknown> = {};
        const builder = {
          select: () => builder,
          update: () => builder,
          eq: (column: string, value: unknown) => {
            filters[column] = value;
            return builder;
          },
          is: (column: string, value: unknown) => {
            filters[`${column}:is`] = value;
            return builder;
          },
          maybeSingle: () => {
            const data = (() => {
              switch (table) {
                case "spins":
                  return state.spins.get(String(filters.id)) ?? null;
                case "campaigns":
                  return {
                    id: CAMPAIGN_ID,
                    organization_id: ORG_ID,
                    collect_email: false,
                    collect_phone: state.collectPhone,
                  };
                case "wheels":
                  return {
                    id: WHEEL_ID,
                    organization_id: ORG_ID,
                    campaign_id: CAMPAIGN_ID,
                  };
                case "prizes":
                  return {
                    id: PRIZE_ID,
                    organization_id: ORG_ID,
                    wheel_id: WHEEL_ID,
                    label: "Un café offert",
                    description: "",
                  };
                case "organizations":
                  return { id: ORG_ID, name: "Ma boutique", notify_on_win: false };
                case "participations": {
                  // Deux lectures distinctes visent cette table : l'échéance
                  // par `redeem_code` (chemin nominal), et la RELECTURE du
                  // gain déjà enregistré par `spin_id` (chemin de rejeu). La
                  // seconde ne doit rendre une ligne QUE si une participation
                  // existe réellement pour ce spin — sinon le double dirait
                  // « code rendu » là où la base dirait « rien ».
                  if (filters.spin_id) {
                    const code = state.participations.get(String(filters.spin_id));
                    return code
                      ? { redeem_code: code, redeem_expires_at: null }
                      : null;
                  }
                  return { redeem_expires_at: null };
                }
                case "sms_consents":
                  // Le filtre de retrait est honoré : un consentement révoqué
                  // ne doit pas ressortir, même présent en base.
                  return state.smsConsent &&
                    filters.organization_id === ORG_ID &&
                    "revoked_at:is" in filters
                    ? { id: "consent-1" }
                    : null;
                default:
                  return null;
              }
            })();
            return Promise.resolve({ data, error: null });
          },
          then: (
            onFulfilled: (v: {
              data: unknown;
              error: unknown;
              count?: number | null;
            }) => unknown,
            onRejected?: (e: unknown) => unknown,
          ) => {
            // Comptage terminal (`head: true`), et non plus un `{ data: null }`
            // uniforme. C'est par lui que `claimPrize` décide désormais si un
            // refus de la RPC est un REJEU (la participation existe) ou une
            // vraie panne — un fait en base, jamais le texte d'une exception.
            if (table === "participations" && filters.spin_id) {
              if (state.relectureEnPanne) {
                return Promise.resolve({
                  data: null,
                  error: { message: "relecture indisponible" },
                  count: null,
                }).then(onFulfilled, onRejected);
              }
              return Promise.resolve({
                data: null,
                error: null,
                count: state.participations.has(String(filters.spin_id)) ? 1 : 0,
              }).then(onFulfilled, onRejected);
            }
            return Promise.resolve({ data: null, error: null }).then(
              onFulfilled,
              onRejected,
            );
          },
        };
        return builder;
      },
    };
  }

  return { state, makeAdmin };
});

const {
  reportSecurityEventMock,
  monitoredMock,
  sendPrizeEmailMock,
  reportErrorMock,
  recordCounterMock,
  enqueueSmsSendMock,
} = vi.hoisted(() => ({
  reportSecurityEventMock:
    vi.fn<(event: string, extra?: Record<string, unknown>) => void>(),
  monitoredMock: vi.fn((_name: string, fn: () => unknown) => fn()),
  sendPrizeEmailMock: vi.fn(() => Promise.resolve(true)),
  reportErrorMock: vi.fn<(scope: string, detail?: unknown) => void>(),
  recordCounterMock: vi.fn<(name: string) => void>(),
  enqueueSmsSendMock: vi.fn<
    (admin: unknown, payload: SmsSendJobPayload) => Promise<boolean>
  >(() => Promise.resolve(true)),
}));

/**
 * Compteur de seaux calqué sur `public.check_rate_limit` : l'incrément et le
 * verdict tiennent dans le même appel. `failClosed` n'entre pas dans le calcul
 * — c'est l'APPELANT qui décide d'honorer ou d'ignorer le verdict, et c'est
 * précisément ce que ces tests vérifient. `observeSharedKey` modélise la clé
 * PARTAGÉE : il consulte le MÊME compteur et signale au dépassement, mais NE
 * REFUSE JAMAIS (il ne renvoie aucun verdict).
 */
vi.mock("@/lib/rate-limit", () => {
  const rateLimit = (bucket: string, rule: { limit: number }) => {
    const next = (state.counters.get(bucket) ?? 0) + 1;
    state.counters.set(bucket, next);
    state.rateLimitCalls.push(bucket);
    const allowed = next <= rule.limit;
    if (!allowed) state.rateLimitDenied.push(bucket);
    return Promise.resolve(allowed);
  };
  return {
    rateLimit,
    rateLimitBucket: (...parts: Array<string | number>) => parts.join(":"),
    observeSharedKey: async (
      bucket: string,
      rule: { limit: number; windowSeconds: number },
      event: string,
      extra: Record<string, unknown> = {},
    ) => {
      // Consomme le compteur partagé ; au dépassement il ALERTE seulement.
      // L'incrément reste SYNCHRONE (avant tout `await`) : l'ordre d'apparition
      // dans `rateLimitCalls` ne dépend donc pas de l'ordonnancement, et le
      // test (d) continue de verrouiller la séquence partagée → identité.
      const allowed = await rateLimit(bucket, rule);
      if (state.pressionRetardMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, state.pressionRetardMs));
      }
      if (!allowed) {
        reportSecurityEventMock(event, { ...extra, bucket });
      }
      state.pressionTerminee = true;
    },
    // Valeurs RÉELLES de src/lib/rate-limit.ts (épinglées par rate-limit.test.ts).
    RATE_LIMITS: {
      claim: { limit: 15, windowSeconds: 60 },
      claimIp: { limit: 600, windowSeconds: 600 },
      spinBurst: { limit: 1, windowSeconds: 4 },
      spin: { limit: 8, windowSeconds: 60 },
      spinIp: { limit: 40, windowSeconds: 60 },
      spinIpPlafond: { limit: 1500, windowSeconds: 60 },
    },
  };
});

vi.mock("@/lib/monitoring", () => ({
  monitored: monitoredMock,
  reportError: reportErrorMock,
  reportSecurityEvent: reportSecurityEventMock,
  recordCounter: recordCounterMock,
}));

// Le producteur SMS (`@/lib/sms-prize`) N'EST PAS mocké : ses quatre
// conditions d'admission sont exactement ce que ces tests doivent exercer.
// Seul le DÉPÔT en file est remplacé — c'est la frontière au-delà de laquelle
// le worker prend le relais, et il a ses propres tests.
vi.mock("@/lib/sms-dispatch", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/sms-dispatch")>()),
  enqueueSmsSend: enqueueSmsSendMock,
}));

vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => makeAdmin() }));
vi.mock("@/lib/play-context", () => ({ loadPlayContext: vi.fn() }));
vi.mock("@/lib/resend", () => ({
  sendPrizeEmail: sendPrizeEmailMock,
  sendWinNotificationEmail: vi.fn(() => Promise.resolve(true)),
}));
vi.mock("@/lib/merchant-contact", () => ({ getOrgOwnerEmail: vi.fn() }));
vi.mock("@/lib/google-wallet", () => ({ buildGoogleWalletSaveUrl: () => null }));
vi.mock("@/lib/apple-wallet", () => ({ buildAppleWalletPassUrl: () => null }));
vi.mock("@/lib/turnstile", () => ({ verifyTurnstile: () => Promise.resolve(true) }));
vi.mock("@/lib/audit", () => ({ writeAuditLog: vi.fn() }));
/**
 * Le cookie joueur TEL QUE LE VOIT LA RÉCLAMATION, rendu variable.
 *
 * `anonymousPlayerKey` EN ÉMET un si le cookie manque — c'est le chemin du
 * tirage. `peekAnonymousPlayerKey` REGARDE sans rien émettre, et peut donc
 * rendre `null` : c'est le chemin de la réclamation, et cette différence est
 * exactement ce que la liaison gain/appareil doit traiter. Un holder mutable
 * permet aux tests de poser les trois cas (concordant, divergent, absent).
 */
const cookieJoueur = vi.hoisted(() => ({
  cle: "anonymous-player-key" as string | null,
}));

vi.mock("@/lib/anonymous-player", () => ({
  anonymousPlayerKey: () => Promise.resolve(state.playerKey),
  peekAnonymousPlayerKey: () => Promise.resolve(cookieJoueur.cle),
}));
vi.mock("@/lib/request-ip", async (importOriginal) => ({
  // Le module RÉEL est conservé : `observerPressionIp` doit s'exécuter
  // pour vrai, sinon ces tests ne prouveraient plus rien du seau qu'ils
  // observent. Seule la lecture d'IP est doublée — elle lit des en-têtes
  // que ce harnais n'a pas.
  ...(await importOriginal<typeof import("@/lib/request-ip")>()),
  clientIpFromHeaders: () => state.ip,
}));
vi.mock("next/headers", () => ({
  headers: () => Promise.resolve({}),
  cookies: () => Promise.resolve({ get: () => undefined, set: vi.fn() }),
}));

// Le moteur de jeton de claim n'est PAS mocké : vrais HMAC (secret fourni par
// vitest.config), donc la garde « jeton d'abord » est réellement exercée.
import { signClaimToken, verifyClaimToken } from "@/lib/spin";
import { loadPlayContext } from "@/lib/play-context";
import { claimPrize, recoverPendingWin, spinWheel } from "./play";

/** Seau d'IDENTITÉ du gain (fail-closed légitime : clé d'un seul porteur). */
const SPIN_BUCKET = (spinId: string) => `claim:spin:${spinId}`;
/** Seau PARTAGÉ par IP (fail-open, observabilité seule). */
const IP_BUCKET = (ip: string) => `claim:ip:${ip}`;

/** Sature une clé au-delà de toute limite plausible. */
function saturate(bucket: string) {
  state.counters.set(bucket, 99_999);
}

beforeEach(() => {
  state.reset();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("claimPrize — le gain appartient à l'appareil qui l'a tiré", () => {
  // Le holder est global au fichier : sans restauration, un cas fuiterait sur
  // les ~60 autres tests de claim, qui supposent tous un cookie concordant.
  afterEach(() => {
    cookieJoueur.cle = "anonymous-player-key";
  });

  /** Lie le spin de fixture à une empreinte d'appareil donnée. */
  function lierSpinA(cle: string) {
    const spin = state.spins.get(SPIN_ID);
    if (!spin) throw new Error("fixture absente : state.reset() non appelé");
    spin.player_key = cle;
  }

  it("cookie CONCORDANT : le gagnant légitime encaisse", async () => {
    lierSpinA("anonymous-player-key");

    const res = await claimPrize({ claimToken: signClaimToken(SPIN_ID) });

    expect(res.ok).toBe(true);
    if (res.ok) expect(res.data.redeemCode).toBe("GAIN-ABCD2345");
  });

  it("cookie DIVERGENT : un jeton capté n'encaisse pas le lot d'un autre", async () => {
    // C'est le scénario que la garde existe pour fermer : le jeton de claim
    // signe `{ spinId, exp }` et RIEN d'autre, donc sa seule possession valait
    // autorisation pendant 15 minutes.
    lierSpinA("empreinte-du-vrai-gagnant");
    cookieJoueur.cle = "empreinte-d-un-tiers";

    const res = await claimPrize({ claimToken: signClaimToken(SPIN_ID) });

    expect(res.ok).toBe(false);
    // Même libellé que « gain introuvable » : un message distinct confirmerait
    // au tiers que ce spin_id porte bien un lot.
    if (!res.ok) expect(res.error).toBe("Gain introuvable.");
    // Et surtout : RIEN n'a été enregistré. Sans cette assertion, le test
    // passerait aussi sur un refus survenu APRÈS la création du gain.
    expect(state.rpcCalls.some((c) => c.name === "claim_winning_spin")).toBe(
      false,
    );
    expect(state.participations.size).toBe(0);
  });

  it("cookie ABSENT : le gain n'est pas confisqué (repli délibéré)", async () => {
    // Refuser ici coûterait son lot à un gagnant qui a nettoyé son navigateur
    // entre le tirage et la réclamation. On refuse la CONTRADICTION, jamais
    // l'absence — voir le pavé de `claimPrizeInner`.
    lierSpinA("empreinte-du-vrai-gagnant");
    cookieJoueur.cle = null;

    const res = await claimPrize({ claimToken: signClaimToken(SPIN_ID) });

    expect(res.ok).toBe(true);
  });

  it("TOUR OFFERT : une autre identité n'est pas une contradiction", async () => {
    // LA RÉGRESSION QUE CE TEST EXISTE POUR EMPÊCHER.
    //
    // `spins.player_key` n'est l'empreinte du cookie anonyme QUE sur le
    // parcours public. Les tours offerts y écrivent la leur : la Pause Chance
    // de la réservation y met le hachage `lc-player` de la file d'attente
    // (20261006120000_reserver_attente_active.sql:1197). Comparer les deux,
    // c'est comparer deux identités sans rapport — et la première version de
    // cette garde refusait donc des gains parfaitement légitimes.
    //
    // Elle n'a PAS été attrapée en unitaire : il a fallu la suite E2E
    // `reserver-attente`, sur les deux navigateurs, treize minutes de CI, et
    // un échec qui se présentait comme un simple dépassement de délai. D'où ce
    // test-ci, qui pose la question en une seconde.
    const spin = state.spins.get(SPIN_ID);
    if (!spin) throw new Error("fixture absente : state.reset() non appelé");
    spin.source = "reserver_wait";
    spin.player_key = "hachage-lc-player-de-la-file";
    cookieJoueur.cle = "empreinte-anonyme-sans-rapport";

    const res = await claimPrize({ claimToken: signClaimToken(SPIN_ID) });

    expect(res.ok).toBe(true);
  });

  it("spin SANS empreinte : rien à contredire, donc rien à refuser", async () => {
    // Contre-épreuve indispensable : les lignes anciennes peuvent ne porter
    // aucune empreinte, et une garde écrite avec `!== null` les aurait toutes
    // refusées (`undefined !== null` est vrai). Ce test épingle ce cas précis.
    cookieJoueur.cle = "une-empreinte-quelconque";

    const res = await claimPrize({ claimToken: signClaimToken(SPIN_ID) });

    expect(res.ok).toBe(true);
  });
});

describe("claimPrize — ordre des gardes", () => {
  it("(b) le jeton est vérifié AVANT tout seau : un jeton forgé n'en consomme aucun", async () => {
    const res = await claimPrize({ claimToken: "jeton-forge-sans-signature" });

    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toContain("expiré");
    // AUCUN seau touché : un flot de jetons forgés ne peut pas entamer le
    // budget d'un joueur légitime, ni même gonfler le compteur d'observabilité.
    expect(state.rateLimitCalls).toEqual([]);
    // Aucune requête non plus : la vérification est purement locale (HMAC).
    expect(state.rpcCalls).toEqual([]);
  });

  it("un jeton EXPIRÉ est refusé sans consommer de seau", async () => {
    const expired = signClaimToken(SPIN_ID, new Date(Date.now() - 60 * 60 * 1000));

    const res = await claimPrize({ claimToken: expired });

    expect(res.ok).toBe(false);
    expect(state.rateLimitCalls).toEqual([]);
  });

  it("jeton valide : identité D'ABORD, puis observabilité IP", async () => {
    const res = await claimPrize({ claimToken: signClaimToken(SPIN_ID) });

    expect(res.ok).toBe(true);
    if (res.ok) expect(res.data.redeemCode).toBe("GAIN-ABCD2345");
    // Ordre exact : seau d'identité (fail-closed) puis seau partagé (fail-open).
    expect(state.rateLimitCalls).toEqual([
      SPIN_BUCKET(SPIN_ID),
      IP_BUCKET("203.0.113.7"),
    ]);
    // Plus AUCUN seau fail-closed sur une clé partagée.
    expect(state.rateLimitCalls).not.toContain("claim:ip");
  });
});

describe("claimPrize — la clé partagée ne refuse jamais", () => {
  it("(c) un tiers qui sature la clé IP n'empêche pas un porteur de jeton valide", async () => {
    // Voisin de CGNAT / Wi-Fi de commerce : même IP, budget épuisé.
    saturate(IP_BUCKET("203.0.113.7"));

    const res = await claimPrize({ claimToken: signClaimToken(SPIN_ID) });

    // Le gain est délivré : la clé partagée alerte, elle ne refuse pas.
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.data.redeemCode).toBe("GAIN-ABCD2345");
    expect(state.rateLimitDenied).toEqual([IP_BUCKET("203.0.113.7")]);
    expect(reportSecurityEventMock).toHaveBeenCalledWith(
      "claim_ip_pressure",
      expect.objectContaining({ spin_id: SPIN_ID }),
    );
  });

  it("le seau d'identité d'un gain ne coupe PAS le gain d'un autre joueur", async () => {
    saturate(SPIN_BUCKET(OTHER_SPIN_ID));

    const res = await claimPrize({ claimToken: signClaimToken(SPIN_ID) });

    expect(res.ok).toBe(true);
    expect(state.rateLimitDenied).toEqual([]);
  });
});

describe("claimPrize — le rejeu d'un même jeton reste borné", () => {
  it("(d) 15 passages par gain, le 16e est refusé — et seul CE gain est bridé", async () => {
    const token = signClaimToken(SPIN_ID);

    // 1er appel : le gain est délivré et le spin passe à `claimed`.
    const first = await claimPrize({ claimToken: token });
    expect(first.ok).toBe(true);

    // Rejeux : chacun RELIT et rend le même code (le gagnant qui réappuie
    // après une coupure réseau doit voir son code, pas un mur), et chacun
    // consomme le seau d'IDENTITÉ — c'est lui, et lui seul, qui borne la
    // boucle. Le rejeu étant devenu un succès, cette borne est désormais la
    // seule chose qui sépare « rendre son code au gagnant » d'un point de
    // lecture illimité sur un code de retrait.
    for (let i = 2; i <= 15; i++) {
      const replay = await claimPrize({ claimToken: token });
      expect(replay.ok).toBe(true);
      if (replay.ok) expect(replay.data.redeemCode).toBe("GAIN-ABCD2345");
    }
    // Et aucun de ces quatorze passages n'a créé de participation.
    expect(state.participations.size).toBe(1);

    const refused = await claimPrize({ claimToken: token });
    expect(refused.ok).toBe(false);
    if (!refused.ok) expect(refused.error).toContain("Trop de tentatives");
    expect(state.rateLimitDenied).toEqual([SPIN_BUCKET(SPIN_ID)]);
    // Le refus interrompt la chaîne AVANT le seau d'observabilité.
    expect(state.counters.get(IP_BUCKET("203.0.113.7"))).toBe(15);

    // Un autre gain, même IP : intact.
    const other = await claimPrize({ claimToken: signClaimToken(OTHER_SPIN_ID) });
    expect(other.ok).toBe(true);
  });

  it("changer d'IP ne relâche pas la borne de rejeu (clé = le gain, pas le réseau)", async () => {
    const token = signClaimToken(SPIN_ID);
    for (let i = 0; i < 15; i++) {
      await claimPrize({ claimToken: token });
      // Rotation d'IP à chaque tour (proxy, réseau mobile…).
      state.ip = `198.51.100.${i}`;
    }

    const refused = await claimPrize({ claimToken: token });
    expect(refused.ok).toBe(false);
    if (!refused.ok) expect(refused.error).toContain("Trop de tentatives");
  });
});

/* ════════════════════════════════════════════════════════════
 * claimPrize — LE CONTRAT DE COLLECTE, HONNÊTE DES DEUX CÔTÉS
 *
 * `claimSchema` accepte `email`, `phone` et `marketingOptIn` sans rien savoir
 * de la campagne : il ne peut pas faire autrement, il est validé avant qu'elle
 * soit lue. L'appelant, lui, la connaît.
 *
 * La RPC normalise déjà ces champs quand la campagne ne les collecte pas
 * (migration 20261209120000) — il n'y a plus de FUITE, et cette garde SQL
 * reste l'autorité. Ce qui se mesure ici est autre chose : l'application
 * n'envoie plus une donnée personnelle en sachant que la base la jettera. Une
 * adresse transmise pour rien voyage quand même — journaux de requêtes,
 * traces, tout ce qui regarde entre les deux.
 *
 * Le harnais tourne sur `collect_email: false`, `collect_phone` piloté par
 * `state.collectPhone` : c'est exactement le cas à couvrir.
 * ════════════════════════════════════════════════════════════ */
describe("claimPrize — ce que la campagne ne collecte pas ne part pas", () => {
  it("campagne sans collecte : l'e-mail du joueur n'atteint jamais la RPC", async () => {
    const res = await claimPrize({
      claimToken: signClaimToken(SPIN_ID),
      firstName: "Camille",
      email: "camille@example.com",
      marketingOptIn: true,
      acceptedTerms: true,
    });

    expect(res.ok).toBe(true);
    const appel = state.rpcCalls.find((c) => c.name === "claim_winning_spin");
    expect(appel?.args).toMatchObject({
      p_email: null,
      p_phone: null,
      p_first_name: null,
      p_accepted_terms: false,
      p_marketing_opt_in: false,
    });
    // La mesure qui compte : l'adresse ne figure NULLE PART dans l'appel.
    expect(JSON.stringify(appel?.args)).not.toContain("camille@example.com");
  });

  it("campagne qui collecte le téléphone : il passe, lui", async () => {
    // La normalisation ne doit pas devenir un filtre qui mange tout : ce que
    // la campagne déclare collecter arrive intact, sinon le claim ne peut plus
    // envoyer le code par SMS.
    state.collectPhone = true;

    const res = await claimPrize({
      claimToken: signClaimToken(SPIN_ID),
      firstName: "Marcel",
      phone: "06 12 34 56 78",
      email: "marcel@example.com",
      acceptedTerms: true,
    });

    expect(res.ok).toBe(true);
    const appel = state.rpcCalls.find((c) => c.name === "claim_winning_spin");
    expect(appel?.args).toMatchObject({
      p_phone: "06 12 34 56 78",
      p_first_name: "Marcel",
      p_accepted_terms: true,
      // …et l'e-mail reste écarté : `collect_email` vaut toujours false.
      p_email: null,
    });
  });
});

describe("claimPrize — non-régression des parcours consommateurs", () => {
  it("roue publique : un jeton signé sur un spin gagnant délivre le code", async () => {
    const res = await claimPrize({ claimToken: signClaimToken(SPIN_ID) });

    expect(res.ok).toBe(true);
    if (res.ok) expect(res.data.redeemCode).toBe("GAIN-ABCD2345");
    expect(state.rpcCalls[0]).toMatchObject({
      name: "claim_winning_spin",
      args: { p_spin_id: SPIN_ID },
    });
  });

  it("tour offert du passeport : même jeton, même chemin, même code", async () => {
    // consumeLoyaltySpin signe exactement le même jeton (signClaimToken sur le
    // spin_id renvoyé par consume_loyalty_spin_grant) : le claim ne distingue
    // pas les deux origines, et ne doit pas commencer à le faire.
    const res = await claimPrize({ claimToken: signClaimToken(OTHER_SPIN_ID) });

    expect(res.ok).toBe(true);
    if (res.ok) expect(res.data.redeemCode).toBe("GAIN-ABCD2345");
    expect(state.rateLimitCalls).toEqual([
      SPIN_BUCKET(OTHER_SPIN_ID),
      IP_BUCKET("203.0.113.7"),
    ]);
  });

  /* ══════════════════════════════════════════════════════════
   * LE REJEU DU CLAIM — ce que « transaction à usage unique » veut dire
   *
   * CETTE ASSERTION A ÉTÉ RETOURNÉE, et le motif compte autant que le
   * correctif. Elle exigeait « un gain déjà réclamé reste REFUSÉ », en
   * lisant le message d'erreur. La propriété visée était juste ; la mesure
   * ne l'était pas — elle épinglait la RÉPONSE au lieu de l'EFFET.
   *
   * Le scénario réel : la 4G décroche au fond du magasin après le commit.
   * L'écran affiche « Connexion perdue […] réessayez » — ce que ses deux
   * `catch` promettent explicitement, en affirmant l'idempotence — le
   * gagnant réappuie, et il obtenait un mur. Le lot était décrémenté, la
   * participation et le code existaient en base, et il ne voyait JAMAIS son
   * code ; recharger n'aidait pas non plus, `recoverPendingWin` filtrant
   * `claimed = false`.
   *
   * Ce qui doit rester vrai est l'EFFET, pas le message : AUCUN second lot.
   * C'est ce que les deux tests ci-dessous mesurent — nombre de
   * participations créées, nombre d'appels réellement transactionnels — en
   * plus d'exiger que le même code revienne.
   * ══════════════════════════════════════════════════════════ */

  it("un rejeu rend LE MÊME code, et n'émet AUCUN second lot", async () => {
    const token = signClaimToken(SPIN_ID);
    const premier = await claimPrize({ claimToken: token });
    expect(premier.ok).toBe(true);

    const second = await claimPrize({ claimToken: token });

    // Ce que le gagnant doit obtenir : son code, pas un mur.
    expect(second.ok).toBe(true);
    if (second.ok && premier.ok) {
      expect(second.data.redeemCode).toBe(premier.data.redeemCode);
    }
    // Ce qui doit rester intact : la transaction à usage unique. UNE seule
    // participation pour ce spin, et UN seul passage par la RPC qui décrémente
    // le stock et impute le budget.
    expect(state.participations.size).toBe(1);
    expect(
      state.rpcCalls.filter((c) => c.name === "claim_winning_spin"),
      "un second lot a été émis",
    ).toHaveLength(1);
  });

  it("deux rejeux SIMULTANÉS : le perdant de la course reçoit le code, pas un refus", async () => {
    // L'autre porte du même défaut — et le mécanisme décrit ici était FAUX.
    //
    // Ce qui était écrit : « le second appel atteint la RPC et tombe sur
    // l'unicité de `participations.spin_id` ». Mesuré contre la définition
    // vivante (20260723110000:97-99), c'est impossible : la RPC ouvre sur un
    // `select … for update` du spin, qui SÉRIALISE. Le second n'entre pas en
    // collision d'unicité, il ATTEND, relit `claimed = true` et sort sur
    // `gain unavailable` — un message qui ne contient pas « already claimed ».
    //
    // Ce que ça coûtait, tant que le code décidait sur le TEXTE : le
    // double-tap donnait « Impossible d'enregistrer votre participation,
    // réessayez. », c'est-à-dire une IMPASSE devant un gain réel, dont le
    // joueur ne sortait qu'au TROISIÈME tap. La décision porte désormais sur
    // un FAIT — la participation existe-t-elle — qui reste vrai quel que soit
    // le chemin par lequel la RPC a refusé.
    const token = signClaimToken(SPIN_ID);
    const [a, b] = await Promise.all([
      claimPrize({ claimToken: token }),
      claimPrize({ claimToken: token }),
    ]);

    expect(a.ok).toBe(true);
    expect(b.ok).toBe(true);
    if (a.ok && b.ok) expect(a.data.redeemCode).toBe(b.data.redeemCode);
    expect(state.participations.size).toBe(1);
  });

  it("un double-tap n'envoie AUCUNE fausse alerte à Sentry", async () => {
    // Le second symptôme, qui ne se voit pas à l'écran : chaque double-tap
    // faisait `reportError("play.claim-transaction")` sur un chemin
    // parfaitement nominal. Une alerte qui se déclenche sur un geste normal
    // finit par être ignorée le jour où elle signale une vraie panne.
    const token = signClaimToken(SPIN_ID);
    await Promise.all([
      claimPrize({ claimToken: token }),
      claimPrize({ claimToken: token }),
    ]);

    expect(
      reportErrorMock.mock.calls.filter(
        ([scope]) => scope === "play.claim-transaction",
      ),
      "un rejeu a été signalé comme une panne",
    ).toHaveLength(0);
  });

  it("le rejeu est COMPTÉ : il dit combien de gagnants repartent sans e-mail", async () => {
    // `sendPrizeEmail`, `recordPrizeSmsConsent` et `enqueuePrizeRedeemSms` sont
    // tous appelés APRÈS la RPC. Si l'invocation d'origine est morte entre le
    // commit et eux (délai serverless, redéploiement, OOM), le gagnant a son
    // code à l'écran mais n'a reçu NI e-mail NI SMS, et son consentement n'a
    // jamais été écrit. On ne réémet pas — aucune trace par participation ne
    // permet de distinguer ce cas de la réponse simplement perdue en transit,
    // et réémettre ferait des doublons dans le cas fréquent. On COMPTE, pour
    // que la population cesse d'être supposée.
    const token = signClaimToken(SPIN_ID);
    await claimPrize({ claimToken: token });
    recordCounterMock.mockClear();
    await claimPrize({ claimToken: token });

    expect(recordCounterMock).toHaveBeenCalledWith(
      "play.claim-replay-sans-renvoi",
    );
  });

  it("RPC refusée AVEC participation : le code est rendu, sans alerte", async () => {
    // ── LE CAS CENTRAL DU CORRECTIF, ET IL N'ÉTAIT COUVERT PAR RIEN ─────
    //
    // Trouvé par contrôle négatif : en rétablissant le défaut d'origine
    // (décider du rejeu en cherchant « already claimed » dans le message de
    // l'exception), la suite entière restait VERTE. Les deux tests qui
    // semblaient l'éprouver — « deux rejeux SIMULTANÉS » et « un double-tap
    // n'envoie AUCUNE fausse alerte » — n'atteignent en réalité jamais cette
    // branche : les doubles étant synchrones, le second appel voit déjà
    // `spin.claimed = true` à la lecture amont et part par play.ts:597, sans
    // jamais appeler la RPC. Ils prouvent le chemin voisin, pas celui-ci.
    //
    // Ce test-ci force la seule fenêtre où la décision se prend réellement :
    // la RPC refuse, la participation existe, la relecture répond. Le joueur
    // doit récupérer son code — et Sentry ne doit rien recevoir, puisqu'il
    // n'y a aucune panne.
    const token = signClaimToken(SPIN_ID);
    state.participations.set(SPIN_ID, "GAIN-ABCD2345");
    state.rpcEnPanne = true;

    const res = await claimPrize({ claimToken: token });

    expect(res.ok, "un rejeu servable a été refusé").toBe(true);
    if (res.ok) expect(res.data.redeemCode).toBe("GAIN-ABCD2345");
    expect(
      reportErrorMock.mock.calls.filter(
        ([scope]) => scope === "play.claim-transaction",
      ),
      "un rejeu a été signalé comme une panne",
    ).toHaveLength(0);
  });

  it("une RPC en panne SANS participation reste une vraie erreur", async () => {
    // CONTRÔLE NÉGATIF DU CORRECTIF : décider sur un fait plutôt que sur un
    // message ne doit pas transformer toute panne en « rejeu ». Ici la RPC
    // refuse et AUCUNE participation n'existe — c'est une panne, elle doit se
    // dire et partir à Sentry.
    //
    // Le spin est LAISSÉ EN PLACE et non supprimé : sans lui, `claimPrizeInner`
    // sort dès sa lecture amont sur « Gain introuvable. » (play.ts:545) et
    // n'atteint jamais la décision qu'on prétend éprouver — le test passait
    // alors sans rien mesurer. C'est la RPC seule qui refuse ici.
    state.rpcEnPanne = true;

    const res = await claimPrize({ claimToken: signClaimToken(SPIN_ID) });

    expect(res.ok).toBe(false);
    expect(reportErrorMock).toHaveBeenCalledWith(
      "play.claim-transaction",
      expect.anything(),
    );
  });

  it("une RELECTURE en panne ne se fait pas passer pour un rejeu", async () => {
    // Le cas limite du fait : on ne peut pas LIRE le fait. Ne pas trancher est
    // alors la seule réponse honnête — on refuse franchement plutôt que de
    // promettre un code qu'on n'a pas vu.
    //
    // Le montage vise la SEULE fenêtre où la question se pose : le spin lu en
    // amont porte encore `claimed = false` (sinon play.ts:597 sert le rejeu
    // sans jamais appeler la RPC), la RPC refuse quand même, la participation
    // existe bel et bien — et c'est la relecture, elle seule, qui ne répond
    // pas. Remettre `spin.claimed` à false ne suffisait pas : le double faisait
    // alors RÉUSSIR la RPC, le claim aboutissait normalement, et l'assertion
    // « ok === false » tombait sur un chemin qui n'avait rien à voir.
    const token = signClaimToken(SPIN_ID);
    state.participations.set(SPIN_ID, "GAIN-ABCD2345");
    state.rpcEnPanne = true;
    state.relectureEnPanne = true;

    const res = await claimPrize({ claimToken: token });

    expect(res.ok).toBe(false);
    expect(reportErrorMock).toHaveBeenCalledWith(
      "play.claim-transaction",
      expect.anything(),
    );
  });

  it("un spin réclamé SANS participation lisible retombe sur le refus", async () => {
    // TÉMOIN du correctif : il ne fabrique pas un code, il en RELIT un. Si la
    // relecture ne trouve rien — état qui ne devrait pas exister, les deux
    // écritures étant dans la même transaction — on refuse comme avant plutôt
    // que de rendre un succès vide, et l'incident part à Sentry.
    const spin = state.spins.get(SPIN_ID)!;
    spin.claimed = true;

    const res = await claimPrize({ claimToken: signClaimToken(SPIN_ID) });

    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toContain("déjà été enregistré");
    expect(reportErrorMock).toHaveBeenCalledWith(
      "play.claim-replay",
      expect.anything(),
    );
  });
});

// ────────────────────────────────────────────────────────────
// spinWheel — DÉSHARDAGE de `spin:ip`
//
// Régression fermée ici : le tour de roue s'ouvrait sur `spin:ip`, un seau
// `failClosed` porté par la clé PARTAGÉE (IP × roue). Sur un Wi-Fi de commerce
// (CGNAT), un tiers à faible débit épuisait le budget commun et empêchait TOUS
// les joueurs présents de tourner.
//
// PRINCIPE appliqué (ADR-032) : dans un parcours PUBLIC, une clé PARTAGÉE ne
// porte qu'un compteur LARGE et fail-OPEN (observabilité) — Turnstile arrête
// déjà le devinage EN AMONT, et la valeur n'est distribuée qu'au `claim`,
// lui-même borné par l'identité du gain. Le `failClosed` reste sur l'empreinte
// joueur (cookie anonyme) : anti double-clic (burst) et débit soutenu.
// ────────────────────────────────────────────────────────────

const SLUG = "boutique";
const SPIN_IP = (ip: string) => `spin:ip:${WHEEL_ID}:${ip}`;
/** Seau par IP BLOQUANT (1500/min par roue) — le coût de la rotation. */
const SPIN_IP_PLAFOND = (ip: string) => `spin:ip:plafond:${WHEEL_ID}:${ip}`;
const SPIN_BURST = `spin:burst:${WHEEL_ID}:anonymous-player-key`;
const SPIN_SUSTAINED = `spin:${WHEEL_ID}:anonymous-player-key`;

/** Contexte public d'une roue prête à tourner (2 lots, dont PRIZE_ID). */
function spinCtx() {
  return {
    ok: true as const,
    admin: makeAdmin(),
    qr: {
      id: "00000000-0000-4000-8000-000000000021",
      campaign_id: CAMPAIGN_ID,
      organization_id: ORG_ID,
    },
    campaign: { id: CAMPAIGN_ID, organization_id: ORG_ID },
    wheel: { id: WHEEL_ID, play_limit: "unlimited" },
    prizes: [
      { id: PRIZE_ID, label: "Un café offert", description: "" },
      { id: "prize-2", label: "Perdu", description: "" },
    ],
  };
}

describe("spinWheel — la clé IP partagée ne refuse jamais", () => {
  beforeEach(() => {
    vi.mocked(loadPlayContext).mockResolvedValue(
      spinCtx() as unknown as Awaited<ReturnType<typeof loadPlayContext>>,
    );
  });

  it("(d) parcours nominal : la roue tourne et délivre un jeton de claim", async () => {
    const res = await spinWheel(SLUG);

    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.data.prizeIndex).toBe(0);
      expect(res.data.claimToken).toBeTruthy();
    }
    // Ordre exact : clé PARTAGÉE (observabilité) d'ABORD — car l'empreinte est
    // déjà résolue —, puis les seaux d'IDENTITÉ (fail-closed). La présence de
    // l'empreinte dans les clés prouve qu'elle est résolue avant tout verdict.
    expect(state.rateLimitCalls).toEqual([
      SPIN_IP("203.0.113.7"),
      SPIN_IP_PLAFOND("203.0.113.7"),
      SPIN_BURST,
      SPIN_SUSTAINED,
    ]);
    expect(state.rpcCalls.some((c) => c.name === "perform_atomic_spin")).toBe(true);
  });

  it("(a) un tiers qui sature spin:ip n'empêche PAS un joueur de tourner", async () => {
    // Voisin de CGNAT / Wi-Fi de commerce : même IP, budget épuisé.
    saturate(SPIN_IP("203.0.113.7"));

    const res = await spinWheel(SLUG);

    // La roue tourne : la clé partagée alerte, elle ne refuse pas.
    expect(res.ok).toBe(true);
    expect(state.rateLimitDenied).toEqual([SPIN_IP("203.0.113.7")]);
    expect(reportSecurityEventMock).toHaveBeenCalledWith(
      "spin_ip_pressure",
      expect.objectContaining({ wheel_id: WHEEL_ID }),
    );
  });

  it("(c) le refus vient de l'IDENTITÉ (débit soutenu), jamais de la clé IP", async () => {
    // Seul le seau d'empreinte (identité) est saturé : la clé IP reste sous son
    // seuil et n'intervient pas dans le verdict.
    saturate(SPIN_SUSTAINED);

    const res = await spinWheel(SLUG);

    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toContain("Trop de tentatives");
    // Refus porté par l'IDENTITÉ, pas par la clé partagée.
    expect(state.rateLimitDenied).toEqual([SPIN_SUSTAINED]);
    expect(state.rateLimitDenied).not.toContain(SPIN_IP("203.0.113.7"));
  });

  it("(e) le compteur de pression est ATTENDU, même quand l'identité refuse", async () => {
    // Le compteur partagé part en parallèle des seaux d'identité — c'est ce qui
    // retire un aller-retour base du chemin de spin. Mais il doit être ATTENDU
    // avant que l'action ne rende la main : une invocation serverless qui
    // renvoie sa réponse coupe les écritures encore en vol, et la pression d'IP
    // — le seul signal qui reste sur cette clé, puisqu'elle ne refuse jamais —
    // disparaîtrait silencieusement des tableaux de supervision.
    //
    // Le retard rend l'oubli DÉTECTABLE : sans lui, un compteur abandonné se
    // terminerait quand même avant l'assertion et le test passerait à tort.
    state.pressionRetardMs = 5;
    saturate(SPIN_BURST);

    const res = await spinWheel(SLUG);

    expect(res.ok).toBe(false);
    expect(state.pressionTerminee).toBe(true);
  });
});

/* ════════════════════════════════════════════════════════════
 * spinWheel — LE PLAFOND BLOQUANT PAR IP
 *
 * Les deux seaux qui refusent sont indexés sur l'empreinte du cookie : ils
 * TOURNENT AVEC LUI, et effacer le cookie rendait un tour toutes les quatre
 * secondes sans total. Ce plafond-ci borne le total qu'une IP peut extraire
 * d'une roue en une minute. Il ne rend pas `play_limit` fiable — il rend la
 * rotation coûteuse.
 *
 * Trois choses à prouver, et la troisième est la plus importante : qu'il ne
 * se déclenche PAS sur une salle réelle.
 * ════════════════════════════════════════════════════════════ */
describe("spinWheel — le plafond par IP borne la rotation de cookie", () => {
  beforeEach(() => {
    vi.mocked(loadPlayContext).mockResolvedValue(
      // unsafe-cast-justification: contexte de jeu réduit aux champs lus, même forme que les 4 casts historiques du fichier
      spinCtx() as unknown as Awaited<ReturnType<typeof loadPlayContext>>,
    );
  });

  it("plafond atteint : la roue refuse, et le signal DIT que c'est l'IP", async () => {
    saturate(SPIN_IP_PLAFOND("203.0.113.7"));

    const res = await spinWheel(SLUG);

    expect(res.ok).toBe(false);
    // Message IDENTIQUE à un refus d'identité : un refus ne dit jamais QUELLE
    // limite a mordu, sinon il indique quoi faire tourner.
    if (!res.ok) expect(res.error).toContain("Trop de tentatives");
    expect(state.rateLimitDenied).toContain(SPIN_IP_PLAFOND("203.0.113.7"));
    // La distinction n'existe qu'en supervision — c'est elle qui décide de la
    // suite : « ce joueur va vite » n'appelle rien, « cette IP a franchi le
    // plafond » est une automatisation.
    expect(reportSecurityEventMock).toHaveBeenCalledWith(
      "spin_ip_ceiling_blocked",
      expect.objectContaining({ wheel_id: WHEEL_ID }),
    );
    // Court-circuit : les seaux d'identité ne sont même pas consommés.
    expect(state.rateLimitCalls).not.toContain(SPIN_BURST);
    expect(state.rpcCalls.some((c) => c.name === "perform_atomic_spin")).toBe(false);
  });

  it("IP NON MESURABLE : le plafond n'est pas consommé du tout", async () => {
    // Sans proxy déclaré, `clientIpFromHeaders` rend `unknown` : bloquer sur
    // cette valeur ferait partager UNE clé à tout Internet — l'interrupteur
    // global qu'ADR-032 proscrit. On ne compte alors rien.
    state.ip = "unknown";

    const res = await spinWheel(SLUG);

    expect(res.ok).toBe(true);
    expect(state.rateLimitCalls.some((b) => b.startsWith("spin:ip:plafond"))).toBe(
      false,
    );
  });

  it("CONTRE-ÉPREUVE : une salle pleine derrière une seule IP passe", async () => {
    /* Le cas que ce plafond ne doit JAMAIS toucher, joué pour de vrai.
     *
     * 250 joueurs — la jauge d'une soirée en direct (VEN-2), le plus grand
     * rassemblement que le produit sache vendre — TOUS derrière le même
     * uplink, et tous dans la MÊME minute : un « top départ » simultané, le
     * pire groupement plausible. Chacun s'y reprend à trois fois (le seau
     * d'identité en autorise huit ; personne ne regarde huit fois une roue
     * tourner en une minute).
     *
     * 750 tours consommés sur la clé d'IP. Le plafond est à 1500 : il reste
     * un facteur deux pour l'agrégation qu'on n'a pas prévue — deux salles
     * sur le même uplink, un NAT d'opérateur qui recouvre le lieu.
     *
     * Ce que le test NE dit pas : que ces 750 tours aboutissent tous. Les
     * deuxième et troisième tentatives d'un même joueur sont refusées par
     * l'anti double-clic, et c'est très bien — elles ont quand même consommé
     * le plafond d'IP, qui est compté AVANT. C'est donc le pire cas pour lui.
     */
    for (let joueur = 0; joueur < 250; joueur += 1) {
      state.playerKey = `joueur-${joueur}`;
      for (let essai = 0; essai < 3; essai += 1) {
        await spinWheel(SLUG);
      }
    }

    expect(state.counters.get(SPIN_IP_PLAFOND("203.0.113.7"))).toBe(750);
    expect(state.rateLimitDenied).not.toContain(SPIN_IP_PLAFOND("203.0.113.7"));
    expect(reportSecurityEventMock).not.toHaveBeenCalledWith(
      "spin_ip_ceiling_blocked",
      expect.anything(),
    );
  });
});

describe("spinWheel — le rejeu d'une même empreinte reste borné", () => {
  beforeEach(() => {
    vi.mocked(loadPlayContext).mockResolvedValue(
      spinCtx() as unknown as Awaited<ReturnType<typeof loadPlayContext>>,
    );
  });

  it("(b) deux tours consécutifs : le second est refusé par le seau d'empreinte", async () => {
    const first = await spinWheel(SLUG);
    expect(first.ok).toBe(true);

    // Anti double-clic (burst 1/4 s) : le tour immédiat suivant, même empreinte,
    // est refusé — la borne de rejeu tient sur l'IDENTITÉ.
    const second = await spinWheel(SLUG);
    expect(second.ok).toBe(false);
    if (!second.ok) expect(second.error).toContain("Trop de tentatives");
    expect(state.rateLimitDenied).toContain(SPIN_BURST);
    // La clé IP partagée n'a jamais refusé au cours des deux tours.
    expect(state.rateLimitDenied).not.toContain(SPIN_IP("203.0.113.7"));
  });
});

/* ════════════════════════════════════════════════════════════
 * spinWheel — LE REJEU D'UNE MÊME PARTIE NE TIRE QU'UNE FOIS
 *
 * Régression fermée ici : `spinWheelInner` appelait `perform_atomic_spin`
 * SANS `p_idempotency_key`, alors que le chemin des jeux d'adresse en passe
 * un depuis JOB-8 (`skill:<nonce>`). La réponse réseau se perd après le
 * commit, le joueur recharge et rejoue : sur une roue `unlimited` un SECOND
 * spin était créé, avec un second décrément de stock et un premier gain
 * orphelin ; sur une roue limitée l'index de fenêtre bloquait le second et le
 * joueur lisait « vous avez déjà joué » au lieu de son lot.
 *
 * CE QUE CES TESTS NE PRÉTENDENT PAS. Aucun bouton « Réessayer » n'existe sur
 * le tirage : le rejeu réel est un rechargement de page suivi d'un nouveau
 * clic, et `recoverPendingWin` rattrape déjà le gain non réclamé. Ce qui se
 * vérifie ici est ce que la reprise ne couvre pas — le second TIRAGE.
 *
 * Le seau anti double-clic (1/4 s, indexé sur l'empreinte) refuse un second
 * clic immédiat AVANT même la RPC : c'est `rechargementDePage()` qui le laisse
 * expirer, sans quoi ces tests mesureraient le seau et non la clé de rejeu.
 * ════════════════════════════════════════════════════════════ */
describe("spinWheel — le rejeu d'une même partie ne tire qu'une fois", () => {
  /** Ce qu'un `crypto.randomUUID()` client produit — 36 caractères, recevable. */
  const NONCE = "b7f4c2a1-9d3e-4f58-8a6c-0e2b1d4c7f93";
  const AUTRE_NONCE = "0c5e8b17-2a44-4d90-91f3-6ab7de052c81";

  beforeEach(() => {
    vi.mocked(loadPlayContext).mockResolvedValue(
      // unsafe-cast-justification: contexte de jeu réduit aux champs lus, même forme que les 4 casts historiques du fichier
      spinCtx() as unknown as Awaited<ReturnType<typeof loadPlayContext>>,
    );
  });

  /**
   * Le temps qui passe entre la réponse perdue et le nouveau clic : le seau
   * anti double-clic (1/4 s) a expiré, les autres non. C'est exactement la
   * fenêtre dans laquelle le second tirage se produisait.
   */
  const rechargementDePage = () => {
    state.counters.delete(SPIN_BURST);
  };

  /** La clé d'idempotence portée par le Nième appel de la RPC. */
  const cleDuTirage = (rang = 0) =>
    state.rpcCalls.filter((c) => c.name === "perform_atomic_spin")[rang]?.args
      .p_idempotency_key;

  it("MÊME nonce : un seul tirage émis, et la même issue rendue deux fois", async () => {
    const premier = await spinWheel(SLUG, undefined, undefined, NONCE);
    rechargementDePage();
    const second = await spinWheel(SLUG, undefined, undefined, NONCE);

    expect(premier.ok).toBe(true);
    expect(second.ok).toBe(true);
    // UN SEUL spin matérialisé : un seul décrément de stock, aucun gain orphelin.
    expect(state.tiragesEmis).toHaveLength(1);
    if (premier.ok && second.ok) {
      // Même spin, même segment : le joueur revoit SON lot, pas un autre.
      expect(second.data.spinId).toBe(premier.data.spinId);
      expect(second.data.prizeIndex).toBe(premier.data.prizeIndex);
      // Le jeton est réémis (son `exp` court depuis l'instant présent, il n'a
      // donc aucune raison d'être identique octet pour octet) mais il désigne
      // LE MÊME spin — sans quoi le rejeu rendrait un gain inréclamable.
      expect(second.data.claimToken).toBeTruthy();
      expect(verifyClaimToken(String(second.data.claimToken))?.spinId).toBe(
        premier.data.spinId,
      );
    }
  });

  it("RPC en panne : le refus DIT que l'issue est inconnue, pour que le nonce survive", async () => {
    // ── LE CHEMIN QUI INVITE AU REJEU EST CELUI QUI DOIT LE PLUS SE PROTÉGER ──
    //
    // « Une erreur est survenue, réessayez. » est rendu quand l'appel RPC
    // échoue — mais rien ne dit à quel moment il a échoué. Une coupure APRÈS le
    // commit rend exactement la même erreur qu'un refus d'avant écriture : le
    // serveur ne peut pas les distinguer, donc il ne prétend pas le faire.
    //
    // Sans le drapeau, les shells oubliaient le nonce sur CE refus-là — celui
    // qui demande explicitement de réessayer. Le rejeu repartait alors sans
    // clé et créait le second tirage que tout ce bloc existe pour empêcher :
    // la protection manquait précisément là où elle servait.
    //
    // ROUGE SI : `outcomeUnknown` disparaît du refus, ou s'il se met à
    // apparaître sur un refus qui TRANCHE (limite atteinte, campagne fermée) —
    // le client cesserait alors de pouvoir rejouer.
    state.tirageEnPanne = true;

    const res = await spinWheel(SLUG, undefined, undefined, NONCE);

    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error).toContain("réessayez");
      expect(
        res.outcomeUnknown,
        "le client va oublier son nonce et rejouer sans protection",
      ).toBe(true);
    }
  });

  it("CONTRE-ÉPREUVE : un refus qui TRANCHE ne porte pas `outcomeUnknown`", async () => {
    // Sans cette épreuve, poser le drapeau partout passerait pour un succès —
    // et le joueur garderait son nonce à vie, donc rejouerait éternellement la
    // même partie sans jamais pouvoir en commencer une autre.
    vi.mocked(loadPlayContext).mockResolvedValue(
      // unsafe-cast-justification: contexte de jeu réduit aux champs lus, même forme que les 4 casts historiques du fichier
      { ok: false, error: "Cette campagne n'est pas active." } as unknown as Awaited<
        ReturnType<typeof loadPlayContext>
      >,
    );

    const res = await spinWheel(SLUG, undefined, undefined, NONCE);

    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.outcomeUnknown).toBeUndefined();
  });

  it("CONTRE-ÉPREUVE : deux nonces différents produisent bien DEUX tirages", async () => {
    // Sans elle, le test ci-dessus passerait aussi sur une fonction qui refuse
    // tout second tirage — une roue cassée aurait l'air idempotente.
    const premier = await spinWheel(SLUG, undefined, undefined, NONCE);
    rechargementDePage();
    const second = await spinWheel(SLUG, undefined, undefined, AUTRE_NONCE);

    expect(premier.ok).toBe(true);
    expect(second.ok).toBe(true);
    expect(state.tiragesEmis).toHaveLength(2);
    if (premier.ok && second.ok) {
      expect(second.data.spinId).not.toBe(premier.data.spinId);
    }
  });

  it("nonce ABSENT : clé nulle, et deux appels tirent deux fois (comportement d'aujourd'hui)", async () => {
    await spinWheel(SLUG);
    rechargementDePage();
    await spinWheel(SLUG);

    // `null` et non l'absence du champ : la RPC le lit et saute sa recherche de
    // rejeu, la colonne reste nulle, donc hors de l'index partiel d'unicité.
    expect(cleDuTirage(0)).toBeNull();
    expect(cleDuTirage(1)).toBeNull();
    expect(state.tiragesEmis).toHaveLength(2);
  });

  it.each([
    ["trop court", "abc"],
    ["trop long", "a".repeat(65)],
    ["hors alphabet", "nonce avec espaces et accents é"],
    ["porteur du séparateur", "play:autre-joueur:0123456789abcdef"],
    ["vide", ""],
  ])("nonce MALFORMÉ (%s) : on retombe sur le comportement d'aujourd'hui", async (
    _cas,
    nonce,
  ) => {
    // On n'oppose PAS de refus au joueur pour un nonce bancal : il perdrait sa
    // partie pour une valeur dont il n'a, la plupart du temps, pas la main.
    const res = await spinWheel(SLUG, undefined, undefined, nonce);

    expect(res.ok).toBe(true);
    expect(cleDuTirage(0)).toBeNull();
  });

  it("la clé transmise est DÉRIVÉE et porte l'identité joueur, jamais le nonce brut", async () => {
    await spinWheel(SLUG, undefined, undefined, NONCE);

    const cle = cleDuTirage(0);
    expect(cle).toBe(`play:${state.playerKey}:${NONCE}`);
    // Le nonce vient du client et n'est ni signé ni émis par le serveur : le
    // transmettre tel quel l'exposerait à l'unicité `(idempotency_key,
    // organization_id)` (20261214120000), PARTAGÉE entre les joueurs d'un même
    // commerce — un nonce choisi ferait échouer le tirage d'un tiers.
    expect(cle).not.toBe(NONCE);
    expect(String(cle)).toContain(state.playerKey);
    // Espace de nonce distinct de celui des défis (`skill:<nonce>`).
    expect(String(cle).startsWith("play:")).toBe(true);
  });

  it("deux JOUEURS, le même nonce : deux clés distinctes et deux tirages", async () => {
    // La propriété qui rend la dérivation nécessaire : un client ne peut entrer
    // en collision qu'avec lui-même. Le second joueur tire pour de bon, il ne
    // reçoit pas le gain du premier et ne se voit pas refuser son tour.
    state.playerKey = "joueur-a";
    const premier = await spinWheel(SLUG, undefined, undefined, NONCE);
    state.playerKey = "joueur-b";
    const second = await spinWheel(SLUG, undefined, undefined, NONCE);

    expect(premier.ok).toBe(true);
    expect(second.ok).toBe(true);
    expect(cleDuTirage(0)).toBe(`play:joueur-a:${NONCE}`);
    expect(cleDuTirage(1)).toBe(`play:joueur-b:${NONCE}`);
    expect(state.tiragesEmis).toHaveLength(2);
  });
});

// ────────────────────────────────────────────────────────────
// spinWheel — PORTE *skill-gated* (contournement de compétence)
//
// spinWheel matérialise UN tirage direct (jeux de RÉVÉLATION). Appelée sur une
// roue configurée en jeu de DÉFI (rps/reflex/gauge/puzzle/mystery_word/estimate),
// elle accorderait un tirage plein SANS résoudre le défi — bypass total de la
// porte de compétence. Elle doit refuser AVANT tout tirage, avec une réponse
// neutre (pas d'oracle). Les 9 jeux de RÉVÉLATION restent autorisés.
// ────────────────────────────────────────────────────────────

const SKILL_GAME_TYPES = [
  "rps",
  "reflex",
  "gauge",
  "puzzle",
  "mystery_word",
  "estimate",
] as const;

const REVEAL_GAME_TYPES = [
  "wheel",
  "scratch",
  "flip_card",
  "cups",
  "slot",
  "memory",
  "chest",
  "dice",
  "draw_card",
] as const;

/** Contexte d'une roue avec un game_type donné (2 lots, dont PRIZE_ID). */
function gameTypeCtx(gameType: string) {
  return {
    ok: true as const,
    admin: makeAdmin(),
    qr: {
      id: "00000000-0000-4000-8000-000000000022",
      campaign_id: CAMPAIGN_ID,
      organization_id: ORG_ID,
    },
    campaign: { id: CAMPAIGN_ID, organization_id: ORG_ID },
    wheel: { id: WHEEL_ID, play_limit: "unlimited", game_type: gameType },
    prizes: [
      { id: PRIZE_ID, label: "Un café offert", description: "" },
      { id: "prize-2", label: "Perdu", description: "" },
    ],
  };
}

describe("spinWheel — porte skill-gated", () => {
  it.each(SKILL_GAME_TYPES)(
    "refuse le tirage direct sur une roue de DÉFI (%s) sans matérialiser de spin",
    async (gameType) => {
      vi.mocked(loadPlayContext).mockResolvedValue(
        gameTypeCtx(gameType) as unknown as Awaited<ReturnType<typeof loadPlayContext>>,
      );

      const res = await spinWheel(SLUG);

      expect(res.ok).toBe(false);
      // Réponse neutre : ne révèle pas qu'il s'agit d'un jeu de défi (pas d'oracle).
      if (!res.ok) expect(res.error).toBe("Jeu indisponible.");
      // La porte ferme AVANT tout tirage : aucune participation consommée.
      expect(state.rpcCalls.some((c) => c.name === "perform_atomic_spin")).toBe(false);
    },
  );

  it.each(REVEAL_GAME_TYPES)(
    "AUTORISE le tirage direct sur un jeu de RÉVÉLATION (%s)",
    async (gameType) => {
      vi.mocked(loadPlayContext).mockResolvedValue(
        gameTypeCtx(gameType) as unknown as Awaited<ReturnType<typeof loadPlayContext>>,
      );

      const res = await spinWheel(SLUG);

      expect(res.ok).toBe(true);
      expect(state.rpcCalls.some((c) => c.name === "perform_atomic_spin")).toBe(true);
    },
  );
});

// ────────────────────────────────────────────────────────────
// recoverPendingWin — LA FENÊTRE DE REPRISE SUIT LE `play_limit`
//
// Régression fermée ici : la reprise interrogeait `spins` directement avec un
// cutoff FIXE de 30 minutes, écrit en TypeScript. Dès que la roue était réglée
// sur une limite plus large — une partie par jour, par semaine, une seule à vie
// —, un joueur qui perdait la réponse réseau au moment du tirage n'avait plus
// aucun chemin vers son code : la base tenait toujours le spin non réclamé (et
// refusait donc tout nouveau tour), mais la reprise, elle, ne le voyait plus.
// Gain gagné, enregistré, irrécupérable.
//
// La fenêtre est désormais calculée DANS la base (`recover_pending_spin`, RPC
// service_role) à partir du `play_limit` de la roue : une seule source de
// vérité pour « ce tour compte-t-il encore ».
// ────────────────────────────────────────────────────────────

/** Trois jours en arrière : hors de portée de l'ancien cutoff de 30 minutes. */
const REPRISE_ANCIENNE = new Date(
  Date.now() - 3 * 24 * 60 * 60 * 1000,
).toISOString();

describe("recoverPendingWin — la reprise passe par la RPC de fenêtre", () => {
  beforeEach(() => {
    vi.mocked(loadPlayContext).mockResolvedValue(
      // unsafe-cast-justification: contexte de jeu réduit aux champs lus, même forme que les 4 casts historiques du fichier
      spinCtx() as unknown as Awaited<ReturnType<typeof loadPlayContext>>,
    );
  });

  it("rend un gain vieux de trois jours (l'ancien cutoff l'aurait perdu)", async () => {
    state.recovery = [
      { spin_id: SPIN_ID, prize_id: PRIZE_ID, created_at: REPRISE_ANCIENNE },
    ];

    const res = await recoverPendingWin(SLUG);

    expect(res).not.toBeNull();
    expect(res?.prizeIndex).toBe(0);
    expect(res?.spinId).toBe(SPIN_ID);
    expect(res?.isLosing).toBe(false);
    expect(res?.claimToken).toBeTruthy();
    // La fenêtre est demandée à la base, avec la roue et l'empreinte joueur —
    // jamais une lecture nue de `spins` bornée côté application.
    const appel = state.rpcCalls.find((c) => c.name === "recover_pending_spin");
    expect(appel?.args).toEqual({
      p_wheel_id: WHEEL_ID,
      p_player_key: "anonymous-player-key",
    });
  });

  it("aucun gain en attente : rien à reprendre", async () => {
    state.recovery = [];

    expect(await recoverPendingWin(SLUG)).toBeNull();
  });

  it("un tour PERDANT n'est jamais repris comme un gain", async () => {
    // La RPC ne rend pas de perte, mais la garde reste : `prize_id` nul ne doit
    // en aucun cas produire une issue gagnante (c'est ce qui interdit de passer
    // une clé d'idempotence depuis la roue — un rejeu de perte reviendrait ici).
    state.recovery = [
      { spin_id: SPIN_ID, prize_id: null, created_at: REPRISE_ANCIENNE },
    ];

    expect(await recoverPendingWin(SLUG)).toBeNull();
  });

  it("lot retiré ou désactivé depuis le tirage : rien n'est rendu", async () => {
    // Le shell public ne saurait pas animer un segment absent de sa liste : la
    // garde `findIndex < 0` est conservée telle quelle.
    state.recovery = [
      { spin_id: SPIN_ID, prize_id: "prize-disparu", created_at: REPRISE_ANCIENNE },
    ];

    expect(await recoverPendingWin(SLUG)).toBeNull();
  });

  it("GARDE MÉCANIQUE : plus aucun cutoff de 30 minutes dans la reprise", () => {
    const src = readFileSync("src/actions/play.ts", "utf8");
    expect(src).toContain("recover_pending_spin");
    // L'expression exacte de l'ancien cutoff — sa réapparition rebornerait la
    // fenêtre côté application, en contradiction avec le `play_limit`.
    expect(src).not.toContain("30 * 60 * 1000");
  });
});

/* ════════════════════════════════════════════════════════════
 * LE CODE DE RETRAIT PAR SMS — le gagnant qui n'a laissé qu'un téléphone
 *
 * Jusqu'ici il ne recevait RIEN : `sendPrizeEmail` ne part que s'il y a une
 * adresse. Il voyait son code à l'écran, fermait l'onglet, et n'avait plus
 * rien à présenter en caisse.
 *
 * Le producteur (`@/lib/sms-prize`) tourne ici POUR DE VRAI — seul le dépôt en
 * file est remplacé. Les quatre conditions d'admission sont donc réellement
 * exercées contre le double de base, et non contre un mock qui dirait oui.
 * ════════════════════════════════════════════════════════════ */

describe("claimPrize — le code par SMS", () => {
  const CODE = "GAIN-ABCD2345";

  /** Une réclamation de campagne qui collecte le téléphone. */
  function claimAvecTelephone(smsOptIn = false) {
    return claimPrize({
      claimToken: signClaimToken(SPIN_ID),
      firstName: "Marcel",
      phone: "06 12 34 56 78",
      acceptedTerms: true,
      smsOptIn,
    });
  }

  /** Tout ce que le claim a dit au monde extérieur, hors corps du message. */
  function traces(): string {
    return JSON.stringify([
      reportErrorMock.mock.calls,
      recordCounterMock.mock.calls,
      reportSecurityEventMock.mock.calls,
      sendPrizeEmailMock.mock.calls,
    ]);
  }

  beforeEach(() => {
    state.collectPhone = true;
    state.smsConsent = true;
    state.smsSender = "MONRESTO";
  });

  it("dépose l'envoi quand le gagnant a consenti", async () => {
    const res = await claimAvecTelephone();

    expect(res.ok).toBe(true);
    expect(enqueueSmsSendMock).toHaveBeenCalledTimes(1);
    const payload = enqueueSmsSendMock.mock.calls[0][1];
    expect(payload.organizationId).toBe(ORG_ID);
    expect(payload.content).toContain(CODE);
    // Mention légale : sans elle le worker refuse le message AVANT réservation.
    expect(payload.content).toMatch(/\bSTOP\b/);
    // Clé préfixée par l'organisation, visant la participation.
    expect(payload.dedupKey).toBe(`sms:${ORG_ID}:prize_code:participation-${SPIN_ID}`);
  });

  it("UN GAGNANT SANS CONSENTEMENT NE DÉCLENCHE AUCUN SMS", async () => {
    // ROUGE SI : la vérification du consentement disparaît, ou passe après le
    // dépôt. Envoyer une offre commerciale à qui n'a rien coché est illégal —
    // et ce chemin est le seul du produit qui compose un SMS de lui-même.
    state.smsConsent = false;

    const res = await claimAvecTelephone();

    // Le lot est délivré : l'absence de SMS ne prive le gagnant de rien.
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.data.redeemCode).toBe(CODE);
    expect(enqueueSmsSendMock).not.toHaveBeenCalled();
  });

  it("sans expéditeur déclaré, aucun SMS — et le lot reste délivré", async () => {
    state.smsSender = null;

    const res = await claimAvecTelephone();

    expect(res.ok).toBe(true);
    expect(enqueueSmsSendMock).not.toHaveBeenCalled();
  });

  it("UN ÉCHEC D'EMPILEMENT NE FAIT PAS ÉCHOUER LA RÉCLAMATION", async () => {
    // ROUGE SI : le dépôt cesse d'être best-effort. Le stock du lot est DÉJÀ
    // décrémenté à ce point du parcours : faire échouer la réclamation sur une
    // file indisponible retirerait au gagnant un lot réellement gagné, pour un
    // SMS qui n'est qu'un rappel de ce qu'il a sous les yeux.
    enqueueSmsSendMock.mockRejectedValueOnce(new Error("file indisponible"));

    const res = await claimAvecTelephone();

    expect(res.ok).toBe(true);
    if (res.ok) expect(res.data.redeemCode).toBe(CODE);
  });

  it("un dépôt refusé (sans exception) ne fait pas échouer la réclamation non plus", async () => {
    enqueueSmsSendMock.mockResolvedValueOnce(false);

    const res = await claimAvecTelephone();

    expect(res.ok).toBe(true);
    if (res.ok) expect(res.data.redeemCode).toBe(CODE);
  });

  it("LE CODE DE RETRAIT N'APPARAÎT DANS AUCUNE TRACE", async () => {
    // Le code est un SECRET PORTEUR : qui le lit peut se présenter en caisse à
    // la place du gagnant. Il ne part que dans le corps du message.
    //
    // TÉMOIN, indispensable : le même code est cherché — et TROUVÉ — là où il
    // doit légitimement être. Sans cette moitié, une sonde qui ne regarderait
    // rien serait verte pour rien, et c'est exactement ainsi que quatre
    // harnais ont menti sur ce chantier.
    const res = await claimAvecTelephone();

    expect(res.ok).toBe(true);
    const payload = enqueueSmsSendMock.mock.calls[0][1];
    expect(payload.content, "TÉMOIN : la sonde doit voir le code là où il est")
      .toContain(CODE);
    expect(traces(), "le code ne doit apparaître dans aucune trace")
      .not.toContain(CODE);
  });

  it("le code ne fuit pas davantage quand le dépôt échoue", async () => {
    enqueueSmsSendMock.mockRejectedValueOnce(new Error("file indisponible"));

    await claimAvecTelephone();

    expect(reportErrorMock).toHaveBeenCalled();
    expect(traces()).not.toContain(CODE);
  });

  it("une campagne qui ne collecte PAS de téléphone ne compose rien", async () => {
    state.collectPhone = false;

    const res = await claimPrize({ claimToken: signClaimToken(SPIN_ID) });

    expect(res.ok).toBe(true);
    expect(enqueueSmsSendMock).not.toHaveBeenCalled();
  });

  /* ══════════════════════════════════════════════════════════
   * LE PREMIER GAIN D'UN NUMÉRO — l'ordre qui était inversé
   *
   * `sms_consents` est clé sur (organisation, numéro) et non sur la
   * participation : un RÉCIDIVISTE, ayant coché la case lors d'un gain
   * précédent, recevait bien son SMS — ce qui masquait entièrement le défaut
   * en essai. Le PRIMO-GAGNANT, lui, n'en recevait jamais : le consentement
   * partait dans un second appel envoyé après la réponse du claim, alors que
   * le dépôt vit DANS le claim et sort sur `if (!consent) return false`.
   *
   * Tous les tests ci-dessous partent donc de `smsConsent = false`.
   * ══════════════════════════════════════════════════════════ */
  describe("au tout premier gain d'un numéro", () => {
    beforeEach(() => {
      state.smsConsent = false;
    });

    it("LA CASE COCHÉE FAIT PARTIR LE SMS DÈS LE PREMIER GAIN", async () => {
      // ROUGE SI : l'écriture du consentement repasse après le dépôt, ou
      // repart dans un appel séparé. C'est LE défaut fermé.
      const res = await claimAvecTelephone(true);

      expect(res.ok).toBe(true);
      expect(enqueueSmsSendMock).toHaveBeenCalledTimes(1);
      expect(enqueueSmsSendMock.mock.calls[0][1].content).toContain(CODE);
    });

    it("le consentement est écrit DANS la transaction du gain, plus après", async () => {
      // ── CE TEST A CHANGÉ DE GARANTIE, ET ELLE EST PLUS FORTE ──
      //
      // Il prouvait un ORDRE : `record_sms_consent` avant `sms_sender_for_send`.
      // Un ordre est une propriété fragile — il tient tant que l'invocation va
      // à son terme, et c'est précisément ce qu'un délai serverless dépassé ne
      // garantit pas. Le consentement se perdait alors définitivement, et avec
      // lui le canal SMS du client, puisqu'un envoi sans consentement échoue en
      // silence.
      //
      // Il ne prouve plus un ordre mais une ATOMICITÉ : le consentement voyage
      // dans les arguments de `claim_winning_spin` (migration 20261213120000),
      // donc il est committé avec la participation, le code de retrait et le
      // budget — ou rien ne l'est.
      //
      // ROUGE SI : `p_sms_opt_in` cesse d'être transmis, ou si l'écriture du
      // consentement ressort de la transaction dans un appel séparé.
      await claimAvecTelephone(true);

      const noms = state.rpcCalls.map((c) => c.name);
      const iClaim = noms.indexOf("claim_winning_spin");
      const iSender = noms.indexOf("sms_sender_for_send");
      expect(iClaim, "aucune réclamation émise").toBeGreaterThan(-1);
      expect(iSender, "le dépôt n'a jamais atteint l'expéditeur").toBeGreaterThan(-1);
      expect(iClaim).toBeLessThan(iSender);
      // Le consentement est PORTÉ par la réclamation…
      expect(state.rpcCalls[iClaim].args).toMatchObject({
        p_spin_id: SPIN_ID,
        p_sms_opt_in: true,
      });
      // …et plus par un second appel, qui était tout le défaut.
      expect(noms).not.toContain("record_sms_consent");
    });

    it("SANS la case, rien n'est écrit et rien ne part", async () => {
      // L'absence de la case vaut refus : aucun consentement inventé au
      // passage sous prétexte que le joueur a laissé son numéro pour son lot.
      const res = await claimAvecTelephone(false);

      expect(res.ok).toBe(true);
      expect(state.rpcCalls.some((c) => c.name === "record_sms_consent")).toBe(
        false,
      );
      expect(enqueueSmsSendMock).not.toHaveBeenCalled();
    });

    it("un numéro RETIRÉ n'est pas réactivé, et le lot reste délivré", async () => {
      // `record_sms_consent` lève sur un consentement retiré tant que
      // `p_renew` n'est pas vrai — on ne le passe pas. Le refus est du BON
      // côté : pas de consentement, donc pas de SMS ; et la réclamation
      // aboutit quand même, le stock étant déjà décrémenté.
      state.consentWriteError = "consentement SMS retiré le 2026-07-01";

      const res = await claimAvecTelephone(true);

      expect(res.ok).toBe(true);
      if (res.ok) expect(res.data.redeemCode).toBe(CODE);
      expect(enqueueSmsSendMock).not.toHaveBeenCalled();
      // Et le numéro ne fuit pas dans la trace de l'incident.
      expect(traces()).not.toContain("0612345678");
    });

    it("le rejeu d'un claim déjà enregistré n'écrit RIEN et ne renvoie RIEN", async () => {
      // Le chemin de rejeu rend le code sans repasser par les effets de bord :
      // sans cela, chaque tapotement sur « Réessayer » écrirait un nouveau
      // consentement et déposerait un second SMS.
      await claimAvecTelephone(true);
      enqueueSmsSendMock.mockClear();
      state.rpcCalls = [];

      const rejeu = await claimAvecTelephone(true);

      expect(rejeu.ok).toBe(true);
      if (rejeu.ok) expect(rejeu.data.redeemCode).toBe(CODE);
      // AUCUNE RPC : ni consentement réécrit, ni claim retenté. C'est
      // l'assertion forte — l'e-mail n'est délibérément PAS asserté ici, ce
      // harnais tournant sur `collect_email = false` : la sonde serait verte
      // sans rien mesurer.
      expect(state.rpcCalls).toEqual([]);
      expect(enqueueSmsSendMock).not.toHaveBeenCalled();
    });
  });
});
