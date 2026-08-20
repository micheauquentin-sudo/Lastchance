import { afterEach, describe, expect, it, vi } from "vitest";

// ────────────────────────────────────────────────────────────
// Caisse unifiée — routage de lookupRedeemCode (roue vs chasse)
//
// Régression : un code CHASSE-… doit atteindre le flux chasse. Le bug
// historique (branche roue court-circuitée) laissait passer 372 tests car
// aucun n'exerçait ce chemin. On mocke les lookups DB (createAdminClient)
// comme security-integration.test.ts et on injecte des lignes par table.
// ────────────────────────────────────────────────────────────

// Base factice mutable + client admin factice, hoistés pour être disponibles
// quand la factory vi.mock s'exécute au chargement du module.
const { db, createAdminClientMock } = vi.hoisted(() => {
  /** Ligne de contest_awards telle que la voit la caisse (mutable). */
  interface ContestAwardRow {
    id: string;
    organization_id: string;
    code: string;
    created_at: string;
    redeemed_at: string | null;
    redeemed_by: string | null;
    redeem_expires_at: string | null;
    status: "pending" | "delivered" | "cancelled";
    rank: number;
    reward_label: string;
    basket_cents: number | null;
    contest_id: string;
    player_id: string;
  }

  /** Prise de stock telle que la voit la caisse (mutable). */
  interface StockHoldRow {
    id: string;
    organization_id: string;
    offer_id: string;
    code: string;
    created_at: string;
    redeemed_at: string | null;
    cancelled_at: string | null;
    /** Échéance GRAVÉE sur la prise — c'est elle qui fait expirer. */
    redeem_expires_at: string | null;
    basket_cents: number | null;
    status: "held" | "redeemed" | "cancelled";
  }

  /** Offre de stock — elle porte LA FENÊTRE, dont la borne basse. */
  interface StockOfferRow {
    id: string;
    organization_id: string;
    title: string;
    description: string | null;
    window_starts_at: string;
    window_ends_at: string;
  }

  const db = {
    participations: new Map<string, unknown>(), // clé : redeem_code
    huntCompletions: new Map<string, unknown>(), // clé : code
    hunts: new Map<string, unknown>(), // clé : id
    loyaltyRewards: new Map<string, unknown>(), // clé : code
    loyaltyPrograms: new Map<string, unknown>(), // clé : id
    loyaltyMilestones: new Map<string, unknown>(), // clé : id
    jackpotWins: new Map<string, unknown>(), // clé : code
    jackpotCampaigns: new Map<string, unknown>(), // clé : id
    calendarOpenings: new Map<string, unknown>(), // clé : code
    calendarRewards: new Map<string, unknown>(), // clé : code
    calendarDays: new Map<string, unknown>(), // clé : id
    calendars: new Map<string, unknown>(), // clé : id
    // Pronostics — 9e source. Les awards sont MUTÉS par la RPC factice
    // redeem_contest_award pour exercer réellement l'idempotence.
    contestAwards: new Map<string, ContestAwardRow>(), // clé : code
    contests: new Map<string, unknown>(), // clé : id
    contestPlayers: new Map<string, unknown>(), // clé : id
    // Réservation de stock — 10e source (RES-5). Les prises sont MUTÉES par la
    // RPC factice du routeur : c'est le seul chemin de retrait de cette
    // famille, elle n'a AUCUN repli legacy.
    stockHolds: new Map<string, StockHoldRow>(), // clé : code
    stockOffers: new Map<string, StockOfferRow>(), // clé : id
    queries: [] as Array<{ table: string; filters: Record<string, unknown> }>,
    rewardIssuances: new Map<
      string,
      {
        organization_id: string;
        /** Libellé GRAVÉ à l'émission — ce que la caisse doit afficher. */
        label?: string | null;
        /**
         * `metadata` du registre. Sa clé `reward_details` porte la DESCRIPTION
         * gravée (20260901120000) ; les autres clés sont du contexte, non gelé.
         */
        metadata?: Record<string, unknown> | null;
        source_type:
          | "wheel"
          | "hunt"
          | "loyalty"
          | "jackpot"
          | "event"
          | "calendar"
          | "referral"
          | "quiz"
          | "contest"
          | "reserver_stock";
        source_id: string;
        code: string;
        /**
         * Annulation au registre. Depuis `20260902120000`, la suppression de la
         * source la pose : c'est la SEULE trace qui survit à la disparition de
         * la table parente, donc la seule qui permette à la caisse de dire
         * « annulé » plutôt qu'« introuvable ».
         */
        cancelled_at?: string | null;
        /**
         * Motif BRUT de l'annulation : texte libre saisi par le commerçant, ou
         * l'une des deux sentinelles que le trigger y écrit. La fixture le pose
         * parce que la colonne existe toujours en base — mais PLUS AUCUN code
         * applicatif ne doit le lire, et c'est ce que ce fichier mesure.
         */
        cancelled_reason?: string | null;
        /**
         * CAUSE de l'annulation, vocabulaire fermé
         * (`merchant` / `source_deleted` / `purged`), posée par le seul trigger
         * d'annulation (`20260903120000`) et inatteignable depuis
         * l'application. `null` sur une annulation décidée par le commerçant :
         * le miroir `upsert_reward_issuance` ne nomme jamais cette colonne.
         */
        cancelled_source?: string | null;
      }
    >(),
    rpcCalls: [] as Array<{ name: string; args: Record<string, unknown> }>,
    reset() {
      db.participations.clear();
      db.huntCompletions.clear();
      db.hunts.clear();
      db.loyaltyRewards.clear();
      db.loyaltyPrograms.clear();
      db.loyaltyMilestones.clear();
      db.jackpotWins.clear();
      db.jackpotCampaigns.clear();
      db.calendarOpenings.clear();
      db.calendarRewards.clear();
      db.calendarDays.clear();
      db.calendars.clear();
      db.contestAwards.clear();
      db.contests.clear();
      db.contestPlayers.clear();
      db.stockHolds.clear();
      db.stockOffers.clear();
      db.queries = [];
      db.rewardIssuances.clear();
      db.rpcCalls = [];
    },
  };

  // Reproduit les chaînes utilisées par lookupParticipationByCode /
  // lookupHuntCompletionByCode : from().select().eq()…limit().maybeSingle().
  function createAdminClientMock() {
    return {
      /**
       * RPC factice de la caisse. `redeem_contest_award` reproduit fidèlement
       * la sémantique SQL : UPDATE conditionnel (jamais remis + pending + non
       * expiré) puis lecture INCONDITIONNELLE de la ligne si le code existe
       * dans l'org — c'est ce qui permet à l'action d'expliquer un refus.
       */
      rpc(name: string, args: Record<string, unknown>) {
        db.rpcCalls.push({ name, args });
        if (name === "redeem_reward_by_code") {
          const code = String(args.p_code);
          const issuance = db.rewardIssuances.get(code);
          if (!issuance || issuance.organization_id !== args.p_organization_id) {
            return Promise.resolve({ data: [], error: null });
          }
          // ── LA 10e FAMILLE : le bras source borne la fenêtre AUX DEUX BOUTS
          //
          // Reproduit fidèlement `redeem_stock_hold` : `update` conditionnel
          // (vivante ET dans la fenêtre) puis lecture INCONDITIONNELLE si le
          // code existe — c'est ce qui distingue `source_missing` de
          // `source_refused`, et c'est le second qui porte « trop tôt ».
          if (issuance.source_type === "reserver_stock") {
            const hold = db.stockHolds.get(code);
            if (!hold || hold.organization_id !== args.p_organization_id) {
              return Promise.resolve({
                data: [
                  {
                    ...issuance,
                    state: "source_missing",
                    redeemed_at: null,
                    redeemed_by: null,
                    expires_at: null,
                    cancelled_at: null,
                    basket_cents: null,
                    wallet_status: "not_requested",
                    redeemed_now: false,
                  },
                ],
                error: null,
              });
            }
            const offer = db.stockOffers.get(hold.offer_id);
            const maintenant = Date.now();
            const echue = hold.redeem_expires_at
              ? new Date(hold.redeem_expires_at).getTime() <= maintenant
              : false;
            const tropTot = offer
              ? new Date(offer.window_starts_at).getTime() > maintenant
              : false;
            const retireMaintenant =
              hold.status === "held" && !echue && !tropTot;
            if (retireMaintenant) {
              hold.status = "redeemed";
              hold.redeemed_at = new Date(maintenant).toISOString();
              hold.basket_cents =
                (args.p_basket_cents as number | null) ?? null;
            }
            const etat = retireMaintenant
              ? "redeemed"
              : hold.redeemed_at
                ? "already_redeemed"
                : hold.cancelled_at
                  ? "cancelled"
                  : echue
                    ? "expired"
                    : "source_refused";
            return Promise.resolve({
              data: [
                {
                  ...issuance,
                  state: etat,
                  redeemed_at: hold.redeemed_at,
                  redeemed_by: retireMaintenant ? String(args.p_actor) : null,
                  expires_at: hold.redeem_expires_at,
                  cancelled_at: hold.cancelled_at,
                  basket_cents: hold.basket_cents,
                  wallet_status: retireMaintenant
                    ? "revocation_requested"
                    : "not_requested",
                  redeemed_now: retireMaintenant,
                },
              ],
              error: null,
            });
          }
          if (issuance.source_type !== "contest") {
            return Promise.resolve({
              data: [
                {
                  ...issuance,
                  state: "source_refused",
                  redeemed_at: null,
                  redeemed_by: null,
                  expires_at: null,
                  cancelled_at: null,
                  basket_cents: null,
                  wallet_status: "not_requested",
                  redeemed_now: false,
                },
              ],
              error: null,
            });
          }

          const award = db.contestAwards.get(code);
          if (!award || award.organization_id !== args.p_organization_id) {
            return Promise.resolve({
              data: [
                {
                  ...issuance,
                  state: "source_missing",
                  redeemed_at: null,
                  redeemed_by: null,
                  expires_at: null,
                  cancelled_at: null,
                  basket_cents: null,
                  wallet_status: "not_requested",
                  redeemed_now: false,
                },
              ],
              error: null,
            });
          }

          const now = Date.now();
          const expired = award.redeem_expires_at
            ? new Date(award.redeem_expires_at).getTime() <= now
            : false;
          const redeemedNow =
            award.redeemed_at === null && award.status === "pending" && !expired;
          if (redeemedNow) {
            award.status = "delivered";
            award.redeemed_at = new Date(now).toISOString();
            award.redeemed_by = String(args.p_actor);
            award.basket_cents = (args.p_basket_cents as number | null) ?? null;
          }
          const state = redeemedNow
            ? "redeemed"
            : award.redeemed_at
              ? "already_redeemed"
              : award.status === "cancelled"
                ? "cancelled"
                : expired
                  ? "expired"
                  : "source_refused";
          return Promise.resolve({
            data: [
              {
                ...issuance,
                state,
                redeemed_at: award.redeemed_at,
                redeemed_by: award.redeemed_by,
                expires_at: award.redeem_expires_at,
                cancelled_at: award.status === "cancelled" ? award.created_at : null,
                basket_cents: award.basket_cents,
                wallet_status: redeemedNow
                  ? "revocation_requested"
                  : "not_requested",
                redeemed_now: redeemedNow,
              },
            ],
            error: null,
          });
        }
        if (name !== "redeem_contest_award") {
          return Promise.resolve({ data: null, error: null });
        }
        const award = db.contestAwards.get(String(args.p_code));
        // Code inconnu OU autre organisation : indistinguables (zéro ligne).
        if (!award || award.organization_id !== args.p_organization_id) {
          return Promise.resolve({ data: [], error: null });
        }
        const now = Date.now();
        const expired = award.redeem_expires_at
          ? new Date(award.redeem_expires_at).getTime() <= now
          : false;
        const redeemedNow =
          award.redeemed_at === null && award.status === "pending" && !expired;
        if (redeemedNow) {
          award.status = "delivered";
          award.redeemed_at = new Date(now).toISOString();
          award.redeemed_by = String(args.p_actor);
          award.basket_cents = (args.p_basket_cents as number | null) ?? null;
        }
        return Promise.resolve({
          data: [
            {
              id: award.id,
              code: award.code,
              created_at: award.created_at,
              redeemed_at: award.redeemed_at,
              redeem_expires_at: award.redeem_expires_at,
              status: award.status,
              rank: award.rank,
              reward_label: award.reward_label,
              contest_name: "Pronos du comptoir",
              player_name: "Alice",
              basket_cents: award.basket_cents,
              redeemed_now: redeemedNow,
            },
          ],
          error: null,
        });
      },
      from(table: string) {
        const filters: Record<string, unknown> = {};
        // COLONNES RÉELLEMENT DEMANDÉES. Le harnais les ignorait : il rendait
        // la ligne de fixture ENTIÈRE quel que soit le `select`, donc une
        // colonne oubliée dans la requête restait invisible du test. C'est
        // exactement le défaut fermé ici — `metadata` absent du select, donc
        // description gravée jamais lue — et un contrôle négatif joué sur ce
        // harnais rendait zéro rouge, c'est-à-dire ne prouvait rien.
        let colonnes: string[] | null = null;
        const builder = {
          select: (cols?: string) => {
            colonnes = cols
              ? cols.split(",").map((c) => c.trim()).filter(Boolean)
              : null;
            return builder;
          },
          eq: (col: string, val: unknown) => {
            filters[col] = val;
            return builder;
          },
          in: (col: string, vals: unknown[]) => {
            filters[col] = vals;
            db.queries.push({ table, filters: { ...filters } });
            if (table !== "reward_issuances") {
              return Promise.resolve({ data: [], error: null });
            }
            const demandees = colonnes;
            return Promise.resolve({
              data: vals
                .map((value) => db.rewardIssuances.get(String(value)))
                .filter(
                  (row) =>
                    row && row.organization_id === filters.organization_id,
                )
                .map((row) => {
                  if (!row || !demandees) return row;
                  // PostgREST ne rend que les colonnes demandées : le
                  // reproduire est ce qui rend un oubli de select détectable.
                  const projete: Record<string, unknown> = {};
                  for (const col of demandees) {
                    projete[col] = (row as Record<string, unknown>)[col];
                  }
                  return projete;
                }),
              error: null,
            });
          },
          limit: () => builder,
          maybeSingle: () => {
            db.queries.push({ table, filters: { ...filters } });
            if (table === "participations") {
              return Promise.resolve({
                data: db.participations.get(String(filters.redeem_code)) ?? null,
                error: null,
              });
            }
            if (table === "hunt_completions") {
              return Promise.resolve({
                data: db.huntCompletions.get(String(filters.code)) ?? null,
                error: null,
              });
            }
            if (table === "hunts") {
              return Promise.resolve({
                data: db.hunts.get(String(filters.id)) ?? null,
                error: null,
              });
            }
            if (table === "loyalty_rewards") {
              return Promise.resolve({
                data: db.loyaltyRewards.get(String(filters.code)) ?? null,
                error: null,
              });
            }
            if (table === "loyalty_programs") {
              return Promise.resolve({
                data: db.loyaltyPrograms.get(String(filters.id)) ?? null,
                error: null,
              });
            }
            if (table === "loyalty_milestones") {
              return Promise.resolve({
                data: db.loyaltyMilestones.get(String(filters.id)) ?? null,
                error: null,
              });
            }
            if (table === "jackpot_wins") {
              return Promise.resolve({
                data: db.jackpotWins.get(String(filters.code)) ?? null,
                error: null,
              });
            }
            if (table === "jackpot_campaigns") {
              return Promise.resolve({
                data: db.jackpotCampaigns.get(String(filters.id)) ?? null,
                error: null,
              });
            }
            if (table === "calendar_openings") {
              // Lot de case : filtré sur content_type='lot' (autres usages
              // n'ont pas de code de retrait).
              const opening = db.calendarOpenings.get(String(filters.code));
              return Promise.resolve({
                data: filters.content_type === "lot" ? opening ?? null : null,
                error: null,
              });
            }
            if (table === "calendar_rewards") {
              return Promise.resolve({
                data: db.calendarRewards.get(String(filters.code)) ?? null,
                error: null,
              });
            }
            if (table === "calendar_days") {
              return Promise.resolve({
                data: db.calendarDays.get(String(filters.id)) ?? null,
                error: null,
              });
            }
            if (table === "calendars") {
              return Promise.resolve({
                data: db.calendars.get(String(filters.id)) ?? null,
                error: null,
              });
            }
            if (table === "contest_awards") {
              const award = db.contestAwards.get(String(filters.code));
              return Promise.resolve({
                data:
                  award && award.organization_id === filters.organization_id
                    ? award
                    : null,
                error: null,
              });
            }
            if (table === "contests") {
              return Promise.resolve({
                data: db.contests.get(String(filters.id)) ?? null,
                error: null,
              });
            }
            if (table === "contest_players") {
              return Promise.resolve({
                data: db.contestPlayers.get(String(filters.id)) ?? null,
                error: null,
              });
            }
            if (table === "reservation_stock_holds") {
              const hold = db.stockHolds.get(String(filters.code));
              return Promise.resolve({
                data:
                  hold && hold.organization_id === filters.organization_id
                    ? hold
                    : null,
                error: null,
              });
            }
            if (table === "reservation_stock_offers") {
              const offer = db.stockOffers.get(String(filters.id));
              return Promise.resolve({
                data:
                  offer && offer.organization_id === filters.organization_id
                    ? offer
                    : null,
                error: null,
              });
            }
            return Promise.resolve({ data: null, error: null });
          },
        };
        return builder;
      },
    };
  }

  return { db, createAdminClientMock };
});

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: createAdminClientMock,
}));

/**
 * Fuseau de l'organisation active, mutable par test.
 *
 * `Europe/Paris` par défaut, comme la quasi-totalité du parc. Les commerçants
 * hors métropole — Papeete, La Réunion, la Guadeloupe sont dans le sélecteur —
 * sont ceux à qui les motifs de refus datés annonçaient le mauvais JOUR.
 */
const orgTimezone = { valeur: "Europe/Paris" };

// Auth : org active fixe (le scope multi-tenant est testé ailleurs).
vi.mock("@/lib/auth", () => ({
  getUserAndOrg: () =>
    Promise.resolve({
      user: { id: "user-1" },
      organization: { id: "org-1", timezone: orgTimezone.valeur },
      role: "owner",
    }),
}));

// Rate-limit : espionné (les tests comptent les jetons consommés) et autorisé
// par défaut, sans toucher à la vraie infra.
const { rateLimitMock } = vi.hoisted(() => ({
  rateLimitMock: vi.fn<(bucket: string) => Promise<boolean>>(() =>
    Promise.resolve(true),
  ),
}));

vi.mock("@/lib/rate-limit", () => ({
  rateLimit: rateLimitMock,
  rateLimitBucket: (...parts: string[]) => parts.join(":"),
  RATE_LIMITS: { cashier: { limit: 30, windowSeconds: 60 } },
}));

/** Jetons consommés sur le seau de RECHERCHE en caisse depuis le dernier reset. */
function lookupTokens(): string[] {
  return rateLimitMock.mock.calls
    .map(([bucket]) => String(bucket))
    .filter((bucket) => bucket.startsWith("cashier:lookup"));
}

// Monitoring : espionné pour vérifier l'ÉTIQUETTE de famille des compteurs de
// repli. TypeScript garantit qu'une famille est fournie ; il ne garantit pas
// qu'elle est la BONNE — un « quiz » étiqueté « hunt » compilerait et rendrait
// la mesure de bascule fausse là où elle sert à décider.
const { recordCounterMock } = vi.hoisted(() => ({
  recordCounterMock: vi.fn<(op: string) => void>(),
}));

vi.mock("@/lib/monitoring", () => ({
  recordCounter: recordCounterMock,
  reportError: vi.fn(),
  reportSecurityEvent: vi.fn(),
  slowThresholdMs: () => 2000,
  monitored: <T,>(_name: string, fn: () => Promise<T>) => fn(),
}));

/** Compteurs de repli émis depuis le dernier reset. */
function missCounters(): string[] {
  return recordCounterMock.mock.calls
    .map(([op]) => String(op))
    .filter((op) => op.startsWith("rewards.registry_miss."));
}

// Effets de bord non pertinents pour le routage.
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/google-wallet", () => ({ expireGoogleWalletPass: vi.fn() }));

import {
  lookupRedeemCode,
  redeemCalendarReward,
  redeemContestAward,
  redeemEventPrize,
  redeemHuntCompletion,
  redeemJackpotPrize,
  redeemLoyaltyReward,
  redeemQuizReward,
  redeemReferralReward,
  redeemStockHold,
} from "./participations";

/** Seed d'une complétion de chasse retrouvable par son code normalisé. */
function seedHunt(code: string, huntId = "hunt-1") {
  db.huntCompletions.set(code, {
    id: `completion-${code}`,
    code,
    hunt_id: huntId,
    completed_at: "2026-07-20T10:00:00.000Z",
    redeemed_at: null,
  });
  db.hunts.set(huntId, {
    name: "Chasse de l'été",
    reward_label: "Un café offert",
    reward_details: null,
  });
}

/** Seed d'un lot de roue retrouvable par son redeem_code normalisé. */
function seedWheel(code: string) {
  db.participations.set(code, {
    id: `participation-${code}`,
    created_at: "2026-07-20T10:00:00.000Z",
    first_name: "Marco",
    redeem_code: code,
    redeemed_at: null,
    redeem_expires_at: null,
    cancelled_at: null,
    basket_cents: null,
    prizes: { label: "Un cookie", description: "" },
    campaigns: { name: "Campagne test" },
  });
}

/** Seed d'un lot de fidélité retrouvable par son code normalisé. */
function seedLoyalty(code: string, programId = "program-1", milestoneId = "milestone-1") {
  db.loyaltyRewards.set(code, {
    id: `reward-${code}`,
    code,
    earned_at: "2026-07-20T10:00:00.000Z",
    redeemed_at: null,
    program_id: programId,
    milestone_id: milestoneId,
  });
  db.loyaltyPrograms.set(programId, { name: "Fidélité Chez Marco" });
  db.loyaltyMilestones.set(milestoneId, {
    reward_label: "Un dessert offert",
    reward_details: "Au choix",
  });
}

/** Seed d'un gain de jackpot retrouvable par son code normalisé. */
function seedJackpot(code: string, campaignId = "campaign-1") {
  db.jackpotWins.set(code, {
    id: `win-${code}`,
    code,
    drawn_at: "2026-07-26T10:00:00.000Z",
    redeemed_at: null,
    campaign_id: campaignId,
  });
  db.jackpotCampaigns.set(campaignId, {
    name: "Jackpot Chez Marco",
    reward_label: "Un magnum de champagne",
    reward_details: "À retirer au bar",
  });
}

/** Seed d'un lot de CASE de calendrier (source `day`) retrouvable par son code. */
function seedCalendarDayLot(code: string, dayId = "day-1", calendarId = "calendar-1") {
  db.calendarOpenings.set(code, {
    id: `opening-${code}`,
    code,
    opened_at: "2026-12-05T08:00:00.000Z",
    redeemed_at: null,
    day_id: dayId,
    calendar_id: calendarId,
    content_type: "lot",
  });
  db.calendarDays.set(dayId, {
    reward_label: "Un chocolat chaud offert",
    reward_details: "À déguster sur place",
  });
  db.calendars.set(calendarId, {
    name: "Calendrier de l'Avent",
    completion_reward_label: "Le grand lot de fin",
    completion_reward_details: "Réservé aux plus assidus",
  });
}

/** Seed d'une RÉCOMPENSE D'ASSIDUITÉ de calendrier (source `completion`). */
function seedCalendarCompletion(code: string, calendarId = "calendar-2") {
  db.calendarRewards.set(code, {
    id: `reward-${code}`,
    code,
    created_at: "2026-12-24T20:00:00.000Z",
    redeemed_at: null,
    calendar_id: calendarId,
  });
  db.calendars.set(calendarId, {
    name: "Calendrier de l'Avent",
    completion_reward_label: "Le grand lot de fin",
    completion_reward_details: "Réservé aux plus assidus",
  });
}

/** Seed d'un lot de pronostics (code PRONO-…) émis à la clôture. */
function seedContestAward(
  code: string,
  overrides: Partial<{
    status: "pending" | "delivered" | "cancelled";
    redeemed_at: string | null;
    redeem_expires_at: string | null;
    organization_id: string;
  }> = {},
) {
  db.contestAwards.set(code, {
    id: `award-${code}`,
    organization_id: "org-1",
    code,
    created_at: "2026-07-20T10:00:00.000Z",
    redeemed_at: null,
    redeemed_by: null,
    redeem_expires_at: null,
    status: "pending",
    rank: 1,
    reward_label: "Un magnum de champagne",
    basket_cents: null,
    contest_id: "contest-1",
    player_id: "player-1",
    ...overrides,
  });
  db.contests.set("contest-1", { name: "Pronos du comptoir" });
  db.contestPlayers.set("player-1", { first_name: "Alice" });
}

/** Formulaire de caisse : code + montant du panier facultatif. */
function redeemForm(code: string, basket?: string): FormData {
  const fd = new FormData();
  fd.set("code", code);
  if (basket !== undefined) fd.set("basket", basket);
  return fd;
}

function seedUniversalReward(
  code: string,
  sourceType:
    | "wheel"
    | "hunt"
    | "loyalty"
    | "jackpot"
    | "event"
    | "calendar"
    | "referral"
    | "quiz"
    | "contest"
    | "reserver_stock",
  organizationId = "org-1",
  label: string | null = null,
  rewardDetails: string | null | undefined = undefined,
  cancelledAt: string | null = null,
  /**
   * CAUSE de l'annulation (`reward_issuances.cancelled_source`), la seule
   * donnée dont la caisse dispose pour dire QUI a annulé. `null` reproduit
   * l'annulation décidée par le commerçant : le miroir ne pose pas la colonne.
   */
  cancelledSource: string | null = "source_deleted",
  /**
   * Motif BRUT, texte libre du formulaire. Séparé de la cause EXPRÈS : c'est
   * le seul montage qui permette de vérifier qu'un commerçant recopiant une
   * sentinelle ici ne fabrique plus l'affichage de l'automatique.
   */
  cancelledReason: string | null = "source supprimée",
) {
  db.rewardIssuances.set(code, {
    organization_id: organizationId,
    source_type: sourceType,
    source_id: `source-${code}`,
    code,
    label,
    cancelled_at: cancelledAt,
    cancelled_source: cancelledAt ? cancelledSource : null,
    cancelled_reason: cancelledAt ? cancelledReason : null,
    // Contexte TOUJOURS présent, description seulement si la fixture en pose
    // une : `sync_reward_issuance` compose son `metadata` avec
    // `jsonb_strip_nulls`, qui retire la clé quand la colonne parente est
    // nulle — c'est le cas permanent de la famille `contest`.
    metadata: {
      legacy_table: "fixture",
      ...(rewardDetails === undefined ? {} : { reward_details: rewardDetails }),
    },
  });
}

afterEach(() => {
  db.reset();
  orgTimezone.valeur = "Europe/Paris";
  vi.clearAllMocks();
  // clearAllMocks n'efface que les appels : on rétablit explicitement le
  // verdict par défaut pour qu'un test « saturé » ne fuite pas sur le suivant.
  rateLimitMock.mockImplementation(() => Promise.resolve(true));
});

/**
 * Raccourci des tests de ROUTAGE : le `CashierMatch` trouvé, sinon null.
 * `lookupRedeemCode` distingue désormais « introuvable » de « trop de
 * recherches » ; les tests qui n'exercent que le routage restent écrits sur le
 * match, ceux qui exercent la garde appellent l'action directement.
 */
async function lookupMatch(rawCode: string) {
  const result = await lookupRedeemCode(rawCode);
  return result.status === "found" ? result.match : null;
}

describe("lookupRedeemCode — routage caisse unifiée", () => {
  // (a) RÉGRESSION du bug 34496e8 : un CHASSE-… valide doit router vers la
  // chasse. Aucune participation n'est seedée : si la branche roue
  // court-circuitait (ancien code), le résultat serait null.
  it("(a) route un code CHASSE-… valide vers le flux chasse", async () => {
    seedHunt("CHASSE-ABCD2345");

    const match = await lookupMatch("CHASSE-ABCD2345");

    expect(match?.source).toBe("hunt");
    if (match?.source === "hunt") {
      expect(match.completion.code).toBe("CHASSE-ABCD2345");
      expect(match.completion.hunt_name).toBe("Chasse de l'été");
    }
  });

  it("(a bis) route une saisie chasse tolérante (casse/espaces/sans tiret)", async () => {
    seedHunt("CHASSE-ABCD2345");

    for (const raw of ["chasse abcd2345", "  CHASSE-abcd2345 ", "chasseabcd2345"]) {
      const match = await lookupMatch(raw);
      expect(match?.source).toBe("hunt");
    }
  });

  it("(a ter) un CHASSE-… inconnu renvoie null sans jamais interroger la roue", async () => {
    // Autorité du préfixe (défense en profondeur) : on seede la participation
    // GARBAGE que produirait normalizeRedeemCode("CHASSE-…"). Le préfixe CHASSE
    // court-circuite AVANT tout lookup roue → elle ne peut pas être renvoyée.
    seedWheel("GAIN-CHASSE-ABCD2345");

    const match = await lookupMatch("CHASSE-ABCD2345");

    expect(match).toBeNull();
    expect(db.queries.some((q) => q.table === "participations")).toBe(false);
  });

  // (b) Le flux roue historique doit rester intact : GAIN-… → wheel.
  it("(b) route un code GAIN-… vers la roue et jamais vers la chasse", async () => {
    seedWheel("GAIN-AB2C3D4E");

    const match = await lookupMatch("GAIN-AB2C3D4E");

    expect(match?.source).toBe("wheel");
    if (match?.source === "wheel") {
      expect(match.participation.redeem_code).toBe("GAIN-AB2C3D4E");
    }
    // Un code GAIN-… est rejeté par normalizeHuntCode : aucune requête sur
    // hunt_completions n'a lieu.
    expect(db.queries.some((q) => q.table === "hunt_completions")).toBe(false);
  });

  it("(b bis) normalise une saisie roue tolérante (casse/espaces)", async () => {
    seedWheel("GAIN-AB2C3D4E");

    for (const raw of ["gain ab2c3d4e", "  GAIN-ab2c3d4e "]) {
      const match = await lookupMatch(raw);
      expect(match?.source).toBe("wheel");
    }
  });

  // (c) Code NU (sans préfixe) : tie-break documenté = chasse d'abord, roue
  // en repli.
  it("(c) tie-break code nu : la chasse l'emporte quand les deux existent", async () => {
    seedHunt("CHASSE-ABCD2345");
    seedWheel("GAIN-ABCD2345");

    const match = await lookupMatch("ABCD2345");

    expect(match?.source).toBe("hunt");
  });

  it("(c bis) code nu : repli sur la roue si aucune chasse ne correspond", async () => {
    seedWheel("GAIN-ABCD2345");

    const match = await lookupMatch("ABCD2345");

    expect(match?.source).toBe("wheel");
  });

  it("(c ter) code nu totalement inconnu → null", async () => {
    const match = await lookupMatch("ABCD2345");
    expect(match).toBeNull();
  });

  it("ignore une saisie vide ou non exploitable", async () => {
    expect(await lookupMatch("")).toBeNull();
    expect(await lookupMatch("   ")).toBeNull();
  });

  // (d) Fidélité : un FIDELITE-… valide doit router vers le passeport et NE
  // JAMAIS être avalé par la roue (c'est exactement le trou du bug chasse).
  it("(d) route un code FIDELITE-… valide vers le flux fidélité", async () => {
    seedLoyalty("FIDELITE-ABCD2345");

    const match = await lookupMatch("FIDELITE-ABCD2345");

    expect(match?.source).toBe("loyalty");
    if (match?.source === "loyalty") {
      expect(match.reward.code).toBe("FIDELITE-ABCD2345");
      expect(match.reward.program_name).toBe("Fidélité Chez Marco");
      expect(match.reward.reward_label).toBe("Un dessert offert");
    }
    // Rejeté par normalizeHuntCode ET normalizeRedeemCode : ni chasse ni roue
    // ne sont interrogées pour un FIDELITE-….
    expect(db.queries.some((q) => q.table === "hunt_completions")).toBe(false);
    expect(db.queries.some((q) => q.table === "participations")).toBe(false);
  });

  it("(d bis) route une saisie fidélité tolérante (casse/espaces/sans tiret)", async () => {
    seedLoyalty("FIDELITE-ABCD2345");

    for (const raw of ["fidelite abcd2345", "  FIDELITE-abcd2345 ", "fideliteabcd2345"]) {
      const match = await lookupMatch(raw);
      expect(match?.source).toBe("loyalty");
    }
  });

  it("(d ter) un FIDELITE-… inconnu renvoie null sans jamais interroger la roue", async () => {
    // Autorité du préfixe : on seede la participation GARBAGE que produirait
    // normalizeRedeemCode("FIDELITE-…"). Le préfixe court-circuite AVANT la roue.
    seedWheel("GAIN-FIDELITEABCD2345");

    const match = await lookupMatch("FIDELITE-ABCD2345");

    expect(match).toBeNull();
    expect(db.queries.some((q) => q.table === "participations")).toBe(false);
  });

  // (e) Non-régression : chasse et roue ne partent jamais vers la fidélité.
  it("(e) un CHASSE-… ne route pas vers la fidélité", async () => {
    seedHunt("CHASSE-ABCD2345");

    const match = await lookupMatch("CHASSE-ABCD2345");

    expect(match?.source).toBe("hunt");
    expect(db.queries.some((q) => q.table === "loyalty_rewards")).toBe(false);
  });

  it("(e bis) un GAIN-… ne route pas vers la fidélité", async () => {
    seedWheel("GAIN-AB2C3D4E");

    const match = await lookupMatch("GAIN-AB2C3D4E");

    expect(match?.source).toBe("wheel");
    // Un code GAIN-… est rejeté par normalizeLoyaltyCode : loyalty_rewards
    // n'est jamais interrogée.
    expect(db.queries.some((q) => q.table === "loyalty_rewards")).toBe(false);
  });

  // (f) Jackpot : un JACKPOT-… valide doit router vers le jackpot et NE JAMAIS
  // être avalé par la roue, la chasse ou la fidélité.
  it("(f) route un code JACKPOT-… valide vers le flux jackpot", async () => {
    seedJackpot("JACKPOT-ABCD2345");

    const match = await lookupMatch("JACKPOT-ABCD2345");

    expect(match?.source).toBe("jackpot");
    if (match?.source === "jackpot") {
      expect(match.win.code).toBe("JACKPOT-ABCD2345");
      expect(match.win.campaign_name).toBe("Jackpot Chez Marco");
      expect(match.win.reward_label).toBe("Un magnum de champagne");
    }
    // Rejeté par normalizeHuntCode, normalizeLoyaltyCode ET normalizeRedeemCode :
    // aucune autre famille n'est interrogée pour un JACKPOT-….
    expect(db.queries.some((q) => q.table === "hunt_completions")).toBe(false);
    expect(db.queries.some((q) => q.table === "loyalty_rewards")).toBe(false);
    expect(db.queries.some((q) => q.table === "participations")).toBe(false);
  });

  it("(f bis) route une saisie jackpot tolérante (casse/espaces/sans tiret)", async () => {
    seedJackpot("JACKPOT-ABCD2345");

    for (const raw of ["jackpot abcd2345", "  JACKPOT-abcd2345 ", "jackpotabcd2345"]) {
      const match = await lookupMatch(raw);
      expect(match?.source).toBe("jackpot");
    }
  });

  it("(f ter) un JACKPOT-… inconnu renvoie null sans jamais interroger la roue", async () => {
    // Autorité du préfixe : on seede la participation GARBAGE que produirait
    // normalizeRedeemCode("JACKPOT-…"). Le préfixe court-circuite AVANT la roue.
    seedWheel("GAIN-JACKPOTABCD2345");

    const match = await lookupMatch("JACKPOT-ABCD2345");

    expect(match).toBeNull();
    expect(db.queries.some((q) => q.table === "participations")).toBe(false);
  });

  // (g) Non-régression : les autres familles ne partent jamais vers le jackpot.
  it("(g) un GAIN-… / CHASSE-… / FIDELITE-… ne route pas vers le jackpot", async () => {
    seedWheel("GAIN-AB2C3D4E");
    seedHunt("CHASSE-ABCD2345");
    seedLoyalty("FIDELITE-EFGH2345");

    for (const raw of ["GAIN-AB2C3D4E", "CHASSE-ABCD2345", "FIDELITE-EFGH2345"]) {
      const match = await lookupMatch(raw);
      expect(match?.source).not.toBe("jackpot");
    }
    // jackpot_wins n'est jamais interrogée pour un code d'une autre famille.
    expect(db.queries.some((q) => q.table === "jackpot_wins")).toBe(false);
  });

  // (h) Calendrier : un CADEAU-… valide route vers le calendrier et NE JAMAIS
  // être avalé par une autre famille. Deux sources : case-lot / assiduité.
  it("(h) route un code CADEAU-… (case-lot) vers le flux calendrier", async () => {
    seedCalendarDayLot("CADEAU-ABCD2345");

    const match = await lookupMatch("CADEAU-ABCD2345");

    expect(match?.source).toBe("calendar");
    if (match?.source === "calendar") {
      expect(match.reward.code).toBe("CADEAU-ABCD2345");
      expect(match.reward.source).toBe("day");
      expect(match.reward.calendar_name).toBe("Calendrier de l'Avent");
      expect(match.reward.reward_label).toBe("Un chocolat chaud offert");
    }
    // Aucune autre famille n'est interrogée pour un CADEAU-….
    expect(db.queries.some((q) => q.table === "hunt_completions")).toBe(false);
    expect(db.queries.some((q) => q.table === "loyalty_rewards")).toBe(false);
    expect(db.queries.some((q) => q.table === "jackpot_wins")).toBe(false);
    expect(db.queries.some((q) => q.table === "event_wins")).toBe(false);
    expect(db.queries.some((q) => q.table === "participations")).toBe(false);
  });

  it("(h bis) route un CADEAU-… (récompense d'assiduité) vers le calendrier", async () => {
    seedCalendarCompletion("CADEAU-EFGH2345");

    const match = await lookupMatch("CADEAU-EFGH2345");

    expect(match?.source).toBe("calendar");
    if (match?.source === "calendar") {
      expect(match.reward.source).toBe("completion");
      expect(match.reward.reward_label).toBe("Le grand lot de fin");
    }
  });

  it("(h ter) route une saisie calendrier tolérante (casse/espaces/sans tiret)", async () => {
    seedCalendarDayLot("CADEAU-ABCD2345");

    for (const raw of ["cadeau abcd2345", "  CADEAU-abcd2345 ", "cadeauabcd2345"]) {
      const match = await lookupMatch(raw);
      expect(match?.source).toBe("calendar");
    }
  });

  it("(h quater) un CADEAU-… inconnu renvoie null sans jamais interroger la roue", async () => {
    // Autorité du préfixe : on seede la participation GARBAGE que produirait
    // normalizeRedeemCode("CADEAU-…"). Le préfixe court-circuite AVANT la roue.
    seedWheel("GAIN-CADEAUABCD2345");

    const match = await lookupMatch("CADEAU-ABCD2345");

    expect(match).toBeNull();
    expect(db.queries.some((q) => q.table === "participations")).toBe(false);
  });

  // (i) Non-régression : aucune autre famille ne part vers le calendrier.
  it("(i) GAIN-… / CHASSE-… / FIDELITE-… / JACKPOT-… / EVENT-… ne routent pas vers le calendrier", async () => {
    seedWheel("GAIN-AB2C3D4E");
    seedHunt("CHASSE-ABCD2345");
    seedLoyalty("FIDELITE-EFGH2345");
    seedJackpot("JACKPOT-JKLM2345");

    for (const raw of [
      "GAIN-AB2C3D4E",
      "CHASSE-ABCD2345",
      "FIDELITE-EFGH2345",
      "JACKPOT-JKLM2345",
    ]) {
      const match = await lookupMatch(raw);
      expect(match?.source).not.toBe("calendar");
    }
    // calendar_openings / calendar_rewards jamais interrogées pour un autre code.
    expect(db.queries.some((q) => q.table === "calendar_openings")).toBe(false);
    expect(db.queries.some((q) => q.table === "calendar_rewards")).toBe(false);
  });

  // (j) Pronostics — 9e source. Les codes PRONO-… étaient émis et affichés au
  // joueur mais AUCUN chemin caisse ne les routait : ils tombaient dans le
  // repli roue (normalizeRedeemCode est permissif) et ressortaient introuvables.
  it("(j) route un code PRONO-… valide vers le flux pronostics", async () => {
    seedContestAward("PRONO-ABCD2345");

    const match = await lookupMatch("PRONO-ABCD2345");

    expect(match?.source).toBe("contest");
    if (match?.source === "contest") {
      expect(match.award.code).toBe("PRONO-ABCD2345");
      expect(match.award.contest_name).toBe("Pronos du comptoir");
      expect(match.award.player_name).toBe("Alice");
      expect(match.award.reward_label).toBe("Un magnum de champagne");
      expect(match.award.status).toBe("pending");
      expect(match.award.rank).toBe(1);
    }
    // Aucune autre famille n'est interrogée pour un PRONO-….
    expect(db.queries.some((q) => q.table === "hunt_completions")).toBe(false);
    expect(db.queries.some((q) => q.table === "loyalty_rewards")).toBe(false);
    expect(db.queries.some((q) => q.table === "jackpot_wins")).toBe(false);
    expect(db.queries.some((q) => q.table === "participations")).toBe(false);
  });

  it("(j bis) route une saisie pronostics tolérante (casse/espaces/sans tiret)", async () => {
    seedContestAward("PRONO-ABCD2345");

    for (const raw of ["prono abcd2345", "  PRONO-abcd2345 ", "pronoabcd2345"]) {
      const match = await lookupMatch(raw);
      expect(match?.source).toBe("contest");
    }
  });

  it("(j ter) un PRONO-… inconnu renvoie null sans jamais interroger la roue", async () => {
    // Autorité du préfixe : on seede la participation GARBAGE que produirait
    // normalizeRedeemCode("PRONO-…"). Le préfixe court-circuite AVANT la roue.
    seedWheel("GAIN-PRONOABCD2345");

    const match = await lookupMatch("PRONO-ABCD2345");

    expect(match).toBeNull();
    expect(db.queries.some((q) => q.table === "participations")).toBe(false);
  });

  it("(j quater) un PRONO-… d'une AUTRE organisation est introuvable", async () => {
    seedContestAward("PRONO-ABCD2345", { organization_id: "org-2" });

    expect(await lookupMatch("PRONO-ABCD2345")).toBeNull();
  });

  it("(j quinquies) un lot ANNULÉ reste retrouvable (la caisse doit l'expliquer)", async () => {
    seedContestAward("PRONO-ABCD2345", { status: "cancelled" });

    const match = await lookupMatch("PRONO-ABCD2345");

    expect(match?.source).toBe("contest");
    if (match?.source === "contest") expect(match.award.status).toBe("cancelled");
  });

  // (k) Non-régression : aucune autre famille ne part vers les pronostics, et
  // le repli roue (dernier maillon) reste intact derrière la 9e branche.
  it("(k) les 8 autres familles ne routent pas vers les pronostics", async () => {
    seedWheel("GAIN-AB2C3D4E");
    seedHunt("CHASSE-ABCD2345");
    seedLoyalty("FIDELITE-EFGH2345");
    seedJackpot("JACKPOT-JKLM2345");
    seedCalendarDayLot("CADEAU-NPQR2345");

    for (const raw of [
      "GAIN-AB2C3D4E",
      "CHASSE-ABCD2345",
      "FIDELITE-EFGH2345",
      "JACKPOT-JKLM2345",
      "CADEAU-NPQR2345",
      "EVENT-STUV2345",
      "PARRAIN-WXYZ2345",
      "QUIZ-ABCD2345",
    ]) {
      const match = await lookupMatch(raw);
      expect(match?.source).not.toBe("contest");
    }
    // contest_awards n'est jamais interrogée pour un code d'une autre famille.
    expect(db.queries.some((q) => q.table === "contest_awards")).toBe(false);
  });

  it("(k bis) code nu : le repli roue survit à l'ajout de la 9e branche", async () => {
    seedWheel("GAIN-ABCD2345");

    const match = await lookupMatch("ABCD2345");

    expect(match?.source).toBe("wheel");
    // La branche pronostics a bien été TENTÉE avant le repli (code nu ambigu).
    expect(db.queries.some((q) => q.table === "contest_awards")).toBe(true);
  });

  it("(k ter) code nu : les pronostics l'emportent sur la roue si les deux existent", async () => {
    seedContestAward("PRONO-ABCD2345");
    seedWheel("GAIN-ABCD2345");

    const match = await lookupMatch("ABCD2345");

    expect(match?.source).toBe("contest");
  });

  it("route d'abord via le registre quand une émission centrale existe", async () => {
    seedHunt("CHASSE-ABCD2345");
    seedWheel("GAIN-ABCD2345");
    seedUniversalReward("GAIN-ABCD2345", "wheel");

    const match = await lookupMatch("ABCD2345");

    expect(match?.source).toBe("wheel");
    expect(db.queries.some((query) => query.table === "reward_issuances")).toBe(
      true,
    );
    expect(db.queries.some((query) => query.table === "hunt_completions")).toBe(
      false,
    );
  });
});

// ────────────────────────────────────────────────────────────
// lookupRedeemCode — « annulé » n'est pas « introuvable »
//
// Depuis `20260902120000`, supprimer une roue, une chasse ou un calendrier
// ANNULE la ligne de registre au lieu de la laisser active : le portefeuille du
// client affiche « Annulé » et lui dit pourquoi. La caisse, elle, restait sur
// « Code introuvable » — le mot d'un code inventé — parce que `routeRedeemCode`
// rendait `null` dès que la table legacy ne portait plus la ligne.
//
// Les deux situations appellent des gestes OPPOSÉS : sur un code inventé le
// caissier fait recommencer la saisie, sur un lot annulé il n'a rien à
// vérifier. Ce bloc mesure la frontière entre les deux, dans les deux sens.
// ────────────────────────────────────────────────────────────

describe("lookupRedeemCode — un lot annulé se distingue d'un code inventé", () => {
  const ANNULE_LE = "2026-08-01T09:30:00.000Z";

  it("source supprimée + registre annulé → « annulé », avec le nom gravé", async () => {
    // Aucun `seedWheel` : la participation a disparu avec sa campagne, comme
    // après une suppression confirmée par le commerçant. Seul le registre reste.
    seedUniversalReward("GAIN-ABCD2345", "wheel", "org-1", "Café offert", undefined, ANNULE_LE);

    const result = await lookupRedeemCode("GAIN-ABCD2345");

    expect(result).toEqual({
      status: "cancelled",
      frozenLabel: "Café offert",
      cancelledAt: ANNULE_LE,
      cancelledCause: "source_deleted",
    });
  });

  it("LA CAUSE EST DITE — la rétention n'est pas imputée à l'établissement", async () => {
    // LE DÉFAUT FERMÉ. La carte de caisse affirmait à tout coup « l'opération
    // qui le portait a été supprimée ». Le caissier lit cette phrase À VOIX
    // HAUTE, devant le client. Depuis que la rétention annule elle aussi des
    // lignes de registre (sur le seul critère d'âge, sans décision de
    // personne), il accusait son propre établissement d'un geste automatique.
    //
    // ROUGE SI la caisse cesse de lire `cancelled_source`, ou si le repli
    // `merchant` avale la cause de la purge.
    seedUniversalReward(
      "GAIN-ABCD2345",
      "wheel",
      "org-1",
      "Café offert",
      undefined,
      ANNULE_LE,
      "purged",
    );

    const result = await lookupRedeemCode("GAIN-ABCD2345");

    expect(result).toMatchObject({ status: "cancelled", cancelledCause: "purged" });
  });

  it("LE COMMERÇANT NE PEUT PLUS FABRIQUER L'EXCUSE DE L'AUTOMATIQUE", async () => {
    // L'ASSERTION CENTRALE DE CE CORRECTIF. Tant que la caisse dérivait la
    // cause du TEXTE, saisir exactement « source purgée » dans le formulaire
    // d'annulation — ou l'écrire par un `PATCH` PostgREST direct, qui ne laisse
    // même pas de trace d'audit — faisait dire au caissier, au client en face :
    // « Ce n'est une décision de personne. »
    //
    // Ici le motif brut porte la sentinelle et la cause dit `merchant` (la
    // colonne reste `null`, le miroir ne la nomme jamais sur ce chemin).
    // ROUGE au premier retour de `causeDepuisMotif` ou de toute autre lecture
    // du texte libre.
    seedUniversalReward(
      "GAIN-ABCD2345",
      "wheel",
      "org-1",
      "Café offert",
      undefined,
      ANNULE_LE,
      null,
      "source purgée",
    );

    const result = await lookupRedeemCode("GAIN-ABCD2345");

    expect(result).toMatchObject({ status: "cancelled", cancelledCause: "merchant" });
  });

  it("le MOTIF BRUT ne franchit jamais la frontière de la caisse", async () => {
    // `cancelled_reason` est du texte libre saisi par le commerçant
    // (`cancelParticipation` le lit d'un formulaire, 300 caractères). Le rendre
    // à l'écran afficherait des notes internes sur la carte que le caissier
    // montre au client. Seule la CAUSE normalisée sort — ici `merchant`.
    const NOTE_INTERNE = "suspicion de fraude, client à surveiller";
    seedUniversalReward(
      "GAIN-ABCD2345",
      "wheel",
      "org-1",
      "Café offert",
      undefined,
      ANNULE_LE,
      null,
      NOTE_INTERNE,
    );

    const result = await lookupRedeemCode("GAIN-ABCD2345");

    expect(result).toMatchObject({ status: "cancelled", cancelledCause: "merchant" });
    expect(JSON.stringify(result)).not.toContain(NOTE_INTERNE);
  });

  it("une cause hors vocabulaire retombe sur `merchant`, jamais sur « personne »", async () => {
    // Repli du `case` de `player_wallet`, à l'identique : une valeur qu'on n'a
    // pas su lire n'exonère personne. L'inverse — retomber sur `purged` ou sur
    // « cause inconnue » — rendrait l'accusation optionnelle pour qui trouverait
    // un moyen d'écrire n'importe quoi dans la colonne.
    seedUniversalReward(
      "GAIN-ABCD2345",
      "wheel",
      "org-1",
      "Café offert",
      undefined,
      ANNULE_LE,
      "PURGED",
    );

    const result = await lookupRedeemCode("GAIN-ABCD2345");

    expect(result).toMatchObject({ status: "cancelled", cancelledCause: "merchant" });
  });

  it("un code JAMAIS ÉMIS reste introuvable — la garde ne doit pas déborder", async () => {
    // ROUGE SI quelqu'un rend « annulé » sur l'absence de match plutôt que sur
    // `cancelled_at` : le comptoir annoncerait alors une annulation pour une
    // faute de frappe, et le caissier cesserait de faire retaper la saisie.
    const result = await lookupRedeemCode("GAIN-ZZZZ9999");

    expect(result).toEqual({ status: "not_found" });
  });

  it("ligne de registre orpheline mais NON annulée : introuvable, comme avant", async () => {
    // Émission antérieure au trigger de suppression, ou incident : on n'a lu
    // aucun motif, on n'en invente pas. C'est l'ancien comportement, conservé.
    seedUniversalReward("GAIN-ABCD2345", "wheel", "org-1", "Café offert");

    const result = await lookupRedeemCode("GAIN-ABCD2345");

    expect(result).toEqual({ status: "not_found" });
  });

  it("TÉMOIN : un lot vivant reste trouvé, la garde ne mord pas dessus", async () => {
    seedWheel("GAIN-ABCD2345");
    seedUniversalReward("GAIN-ABCD2345", "wheel", "org-1", "Café offert", undefined, ANNULE_LE);

    const result = await lookupRedeemCode("GAIN-ABCD2345");

    // La source existe encore : la carte de caisse s'affiche et c'est elle —
    // pas ce chemin-ci — qui rend l'annulation, avec son bouton de remise.
    expect(result.status).toBe("found");
  });

  it("le registre d'une AUTRE organisation ne rend rien du tout", async () => {
    // La ligne annulée existe, mais chez le voisin : `lookupUniversalRewardRoute`
    // filtre sur l'organisation, donc aucune route, donc introuvable. Sans ce
    // filtre, la caisse confirmerait l'existence d'un code d'un autre tenant.
    seedUniversalReward("GAIN-ABCD2345", "wheel", "org-2", "Café offert", undefined, ANNULE_LE);

    const result = await lookupRedeemCode("GAIN-ABCD2345");

    expect(result).toEqual({ status: "not_found" });
  });
});

// ────────────────────────────────────────────────────────────
// lookupRedeemCode — budget de recherche du caissier (finding M2)
//
// Chaque lookup consommait SON jeton sur `cashier:lookup`. Une saisie NUE
// matche les neuf normaliseurs → neuf jetons pour UNE recherche, soit 3
// recherches/minute au lieu de 30. Pire, au-delà du seuil chaque lookup
// renvoyait `null`, indistinguable d'un code absent : le comptoir affichait
// « Code introuvable » sur un lot valide et le caissier refusait un client.
// ────────────────────────────────────────────────────────────

describe("lookupRedeemCode — un jeton par recherche", () => {
  it("code NU (les 9 familles tentées) : UN SEUL jeton consommé", async () => {
    seedWheel("GAIN-ABCD2345");

    const result = await lookupRedeemCode("ABCD2345");

    expect(result).toEqual({
      status: "found",
      match: expect.objectContaining({ source: "wheel" }),
    });
    // Le routage a bien tenté plusieurs familles (code nu ambigu)…
    expect(db.queries.some((q) => q.table === "contest_awards")).toBe(true);
    expect(db.queries.some((q) => q.table === "hunt_completions")).toBe(true);
    // … pour un seul jeton, sur la clé d'OPÉRATEUR (ADR-032).
    expect(lookupTokens()).toEqual(["cashier:lookup:org-1:user-1"]);
  });

  it("chacune des 9 sources ne coûte qu'un jeton par recherche", async () => {
    seedWheel("GAIN-AB2C3D4E");
    seedHunt("CHASSE-ABCD2345");
    seedLoyalty("FIDELITE-EFGH2345");
    seedJackpot("JACKPOT-JKLM2345");
    seedCalendarDayLot("CADEAU-NPQR2345");
    seedContestAward("PRONO-STUV2345");

    const codes = [
      "GAIN-AB2C3D4E",
      "CHASSE-ABCD2345",
      "FIDELITE-EFGH2345",
      "JACKPOT-JKLM2345",
      "CADEAU-NPQR2345",
      "EVENT-WXYZ2345",
      "PARRAIN-ABCD3456",
      "QUIZ-EFGH3456",
      "PRONO-STUV2345",
    ];
    for (const code of codes) await lookupRedeemCode(code);

    expect(lookupTokens()).toHaveLength(codes.length);
  });

  it("une saisie vide ne consomme aucun jeton (aucune famille possible)", async () => {
    expect(await lookupRedeemCode("")).toEqual({ status: "not_found" });
    expect(await lookupRedeemCode("   ")).toEqual({ status: "not_found" });

    expect(lookupTokens()).toEqual([]);
  });

  it("seau saturé : état « rate_limited » DISTINCT de « not_found »", async () => {
    seedContestAward("PRONO-ABCD2345");
    rateLimitMock.mockImplementation(() => Promise.resolve(false));

    const result = await lookupRedeemCode("PRONO-ABCD2345");

    expect(result).toEqual({ status: "rate_limited" });
    // Le lot EXISTE : le confondre avec « introuvable » ferait refuser un
    // client de bonne foi. Aucune lecture n'a eu lieu (garde AVANT le routage).
    expect(db.queries).toEqual([]);
  });

  it("un code réellement absent reste « not_found », pas « rate_limited »", async () => {
    const result = await lookupRedeemCode("PRONO-ABCD2345");

    expect(result).toEqual({ status: "not_found" });
    expect(lookupTokens()).toEqual(["cashier:lookup:org-1:user-1"]);
  });

  it("le verdict du seau ne fuit pas d'une recherche à l'autre", async () => {
    seedContestAward("PRONO-ABCD2345");
    rateLimitMock.mockImplementationOnce(() => Promise.resolve(false));

    const refusee = await lookupRedeemCode("PRONO-ABCD2345");
    const suivante = await lookupRedeemCode("PRONO-ABCD2345");

    expect(refusee).toEqual({ status: "rate_limited" });
    expect(suivante.status).toBe("found");
  });
});

// ────────────────────────────────────────────────────────────
// redeemContestAward — remise en caisse d'un lot de pronostics
//
// C'est le cœur du correctif : avant, seule set_contest_award_status
// (is_org_editor) pouvait marquer le lot remis — un CAISSIER en était
// incapable. L'action ne pose donc AUCUNE garde de rôle : l'autorisation
// vient de getUserAndOrg, comme pour les 8 autres sources.
// ────────────────────────────────────────────────────────────

describe("redeemContestAward", () => {
  const rpcArgs = () =>
    db.rpcCalls.find((c) => c.name === "redeem_contest_award")?.args;

  it("utilise la RPC centrale en premier sans doubler la remise legacy", async () => {
    seedContestAward("PRONO-ABCD2345");
    seedUniversalReward("PRONO-ABCD2345", "contest");

    const res = await redeemContestAward(
      null,
      redeemForm("PRONO-ABCD2345", "12,50"),
    );

    expect(res.ok).toBe(true);
    expect(
      db.rpcCalls.find((call) => call.name === "redeem_reward_by_code")?.args,
    ).toMatchObject({
      p_organization_id: "org-1",
      p_code: "PRONO-ABCD2345",
      p_actor: "user-1",
      p_basket_cents: 1250,
    });
    expect(rpcArgs()).toBeUndefined();
    expect(db.contestAwards.get("PRONO-ABCD2345")?.status).toBe("delivered");
    expect(db.contestAwards.get("PRONO-ABCD2345")?.basket_cents).toBe(1250);
  });

  it("la remise centrale reste idempotente au second appel", async () => {
    seedContestAward("PRONO-ABCD2345");
    seedUniversalReward("PRONO-ABCD2345", "contest");

    const first = await redeemContestAward(null, redeemForm("PRONO-ABCD2345"));
    const second = await redeemContestAward(null, redeemForm("PRONO-ABCD2345"));

    expect(first.ok).toBe(true);
    expect(second.ok).toBe(false);
    if (!second.ok) expect(second.error).toMatch(/déjà été remis le/);
    expect(
      db.rpcCalls.filter((call) => call.name === "redeem_contest_award"),
    ).toHaveLength(0);
  });

  it("remet le lot et journalise l'acteur (aucune garde d'éditeur)", async () => {
    seedContestAward("PRONO-ABCD2345");

    const res = await redeemContestAward(null, redeemForm("PRONO-ABCD2345"));

    expect(res.ok).toBe(true);
    expect(rpcArgs()).toMatchObject({
      p_organization_id: "org-1",
      p_code: "PRONO-ABCD2345",
      p_actor: "user-1",
      p_basket_cents: null,
    });
    expect(db.contestAwards.get("PRONO-ABCD2345")?.status).toBe("delivered");
  });

  it("convertit le panier saisi à la française en centimes", async () => {
    seedContestAward("PRONO-ABCD2345");

    const res = await redeemContestAward(
      null,
      redeemForm("PRONO-ABCD2345", "12,50"),
    );

    expect(res.ok).toBe(true);
    expect(rpcArgs()?.p_basket_cents).toBe(1250);
    expect(db.contestAwards.get("PRONO-ABCD2345")?.basket_cents).toBe(1250);
  });

  it("panier vide = pas de montant (null), pas une erreur", async () => {
    seedContestAward("PRONO-ABCD2345");

    const res = await redeemContestAward(null, redeemForm("PRONO-ABCD2345", "  "));

    expect(res.ok).toBe(true);
    expect(rpcArgs()?.p_basket_cents).toBeNull();
  });

  it("panier illisible ou négatif : refus AVANT tout appel à la base", async () => {
    seedContestAward("PRONO-ABCD2345");

    for (const basket of ["douze euros", "-5", "9999999"]) {
      const res = await redeemContestAward(
        null,
        redeemForm("PRONO-ABCD2345", basket),
      );
      expect(res.ok).toBe(false);
      if (!res.ok) expect(res.error).toBe("Montant du panier invalide");
    }
    expect(db.rpcCalls).toEqual([]);
  });

  it("code mal formé : refus AVANT tout appel à la base", async () => {
    for (const code of ["PRONO-ABCD234", "PRONO-ABCD2I45", "QUIZ-ABCD2345", ""]) {
      const res = await redeemContestAward(null, redeemForm(code));
      expect(res.ok).toBe(false);
      if (!res.ok) expect(res.error).toBe("Code de retrait invalide");
    }
    expect(db.rpcCalls).toEqual([]);
  });

  it("code inconnu ou d'une autre organisation : « introuvable », indistinguable", async () => {
    seedContestAward("PRONO-ABCD2345", { organization_id: "org-2" });

    const autreOrg = await redeemContestAward(null, redeemForm("PRONO-ABCD2345"));
    const inconnu = await redeemContestAward(null, redeemForm("PRONO-WXYZ2345"));

    expect(autreOrg.ok).toBe(false);
    expect(inconnu.ok).toBe(false);
    if (!autreOrg.ok && !inconnu.ok) {
      expect(autreOrg.error).toBe("Code introuvable");
      expect(autreOrg.error).toBe(inconnu.error);
    }
  });

  // MOTIF 1/3 — idempotence : le second appel ne remet rien et le dit.
  it("idempotent : le 2e appel refuse en datant la remise", async () => {
    seedContestAward("PRONO-ABCD2345");

    const first = await redeemContestAward(null, redeemForm("PRONO-ABCD2345", "12,50"));
    const second = await redeemContestAward(null, redeemForm("PRONO-ABCD2345", "99"));

    expect(first.ok).toBe(true);
    expect(second.ok).toBe(false);
    if (!second.ok) expect(second.error).toMatch(/déjà été remis le /);
    // Le 2e panier n'écrase PAS le premier : rien n'a été réécrit.
    expect(db.contestAwards.get("PRONO-ABCD2345")?.basket_cents).toBe(1250);
  });

  // MOTIF 2/3 — lot annulé par le commerçant.
  it("lot annulé : motif explicite, distinct de « déjà remis »", async () => {
    seedContestAward("PRONO-ABCD2345", { status: "cancelled" });

    const res = await redeemContestAward(null, redeemForm("PRONO-ABCD2345"));

    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toBe("Ce lot a été annulé");
    expect(db.contestAwards.get("PRONO-ABCD2345")?.status).toBe("cancelled");
  });

  // MOTIF 3/3 — code expiré (l'échéance fait foi côté base, pas côté écran).
  it("code expiré : motif explicite et daté", async () => {
    seedContestAward("PRONO-ABCD2345", {
      redeem_expires_at: new Date(Date.now() - 60_000).toISOString(),
    });

    const res = await redeemContestAward(null, redeemForm("PRONO-ABCD2345"));

    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/^Code expiré le /);
    expect(db.contestAwards.get("PRONO-ABCD2345")?.status).toBe("pending");
  });

  it("échéance encore valable : la remise passe", async () => {
    seedContestAward("PRONO-ABCD2345", {
      redeem_expires_at: new Date(Date.now() + 86_400_000).toISOString(),
    });

    const res = await redeemContestAward(null, redeemForm("PRONO-ABCD2345"));

    expect(res.ok).toBe(true);
  });

  /**
   * LE MOTIF DU REFUS EST DATÉ DANS LE FUSEAU DE L'ÉTABLISSEMENT.
   *
   * Les quatre `formatDate` de cette action n'avaient pas de second argument et
   * retombaient sur `Europe/Paris`. Un caissier de Papeete lisait le MAUVAIS
   * JOUR — « le 31 juil. » pour une remise du 30 au soir — pendant que la carte
   * affichée juste au-dessus, qui reçoit `organization.timezone`, donnait la
   * bonne date. Les deux dates du même écran se contredisaient.
   *
   * L'instant est choisi pour que le jour DIFFÈRE entre les deux fuseaux : il
   * est déjà le 31 à Paris, encore le 30 à Papeete (UTC−10).
   */
  describe("le motif de refus est daté dans le fuseau du commerçant", () => {
    const INSTANT = "2026-07-31T04:20:00.000Z";

    it("chemin registre : le jour est celui de l'établissement", async () => {
      orgTimezone.valeur = "Pacific/Tahiti";
      seedContestAward("PRONO-ABCD2345", { redeemed_at: INSTANT });
      seedUniversalReward("PRONO-ABCD2345", "contest");

      const res = await redeemContestAward(null, redeemForm("PRONO-ABCD2345"));

      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(res.error).toContain("30 juil.");
        expect(res.error).not.toContain("31 juil.");
      }
    });

    it("chemin legacy : même exigence, code hors registre", async () => {
      // Aucun `seedUniversalReward` : c'est la RPC historique qui refuse, et
      // ses deux messages datés ont le même défaut.
      orgTimezone.valeur = "Pacific/Tahiti";
      seedContestAward("PRONO-ABCD2345", { redeemed_at: INSTANT });

      const res = await redeemContestAward(null, redeemForm("PRONO-ABCD2345"));

      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(res.error).toContain("30 juil.");
        expect(res.error).not.toContain("31 juil.");
      }
    });

    it("code expiré : le fuseau vaut aussi pour l'échéance", async () => {
      orgTimezone.valeur = "Pacific/Tahiti";
      seedContestAward("PRONO-ABCD2345", { redeem_expires_at: INSTANT });
      seedUniversalReward("PRONO-ABCD2345", "contest");

      const res = await redeemContestAward(null, redeemForm("PRONO-ABCD2345"));

      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(res.error).toMatch(/^Code expiré le /);
        expect(res.error).toContain("30 juil.");
      }
    });

    it("CONTRÔLE : en métropole le jour ne bouge pas", async () => {
      // Sans ce témoin, un correctif qui décalerait TOUJOURS d'un jour
      // passerait pour une réussite sur les trois assertions ci-dessus.
      seedContestAward("PRONO-ABCD2345", { redeemed_at: INSTANT });
      seedUniversalReward("PRONO-ABCD2345", "contest");

      const res = await redeemContestAward(null, redeemForm("PRONO-ABCD2345"));

      expect(res.ok).toBe(false);
      if (!res.ok) expect(res.error).toContain("31 juil.");
    });
  });
});

/**
 * Observabilité du repli historique (prérequis de la bascule vers le moteur
 * unique). Le repli est MUET par construction : quand le registre ignore un
 * code, la caisse retombe sur la RPC de la famille et le caissier ne voit
 * rien. Sans compteur, rien ne dit s'il sert encore — donc rien ne permet de
 * décider de son retrait.
 *
 * TypeScript impose qu'une famille soit fournie ; il n'impose pas qu'elle soit
 * la bonne. Un « quiz » étiqueté « hunt » compilerait et fausserait la mesure
 * exactement là où elle sert à décider. D'où une assertion par famille.
 */
describe("compteur de repli du registre universel", () => {
  const familles: ReadonlyArray<
    [string, string, (prev: null, fd: FormData) => Promise<unknown>]
  > = [
    ["hunt", "CHASSE-ABCD2345", redeemHuntCompletion],
    ["loyalty", "FIDELITE-ABCD2345", redeemLoyaltyReward],
    ["jackpot", "JACKPOT-ABCD2345", redeemJackpotPrize],
    ["event", "EVENT-ABCD2345", redeemEventPrize],
    ["calendar", "CADEAU-ABCD2345", redeemCalendarReward],
    ["referral", "PARRAIN-ABCD2345", redeemReferralReward],
    ["quiz", "QUIZ-ABCD2345", redeemQuizReward],
    ["contest", "PRONO-ABCD2345", redeemContestAward],
  ];

  it.each(familles)(
    "étiquette le repli de la famille %s",
    async (famille, code, action) => {
      // Code ABSENT du registre : c'est très exactement l'état d'un lot émis
      // avant la migration du registre universel.
      await action(null, redeemForm(code));

      expect(missCounters()).toEqual([`rewards.registry_miss.${famille}`]);
    },
  );

  it("ne compte AUCUN repli quand le registre connaît le code", async () => {
    seedUniversalReward("PRONO-ABCD2345", "contest");

    await redeemContestAward(null, redeemForm("PRONO-ABCD2345"));

    expect(missCounters()).toEqual([]);
  });
});

/**
 * LE LIBELLÉ QUE LA CAISSE AFFICHE EST CELUI QUE LE CLIENT A GAGNÉ.
 *
 * Le commerçant renomme sa récompense — geste banal entre deux opérations — et
 * la caisse affichait le nom ACTUEL de la table parente. Le client se présente
 * avec un email qui annonce « Café offert » devant un écran qui dit
 * « Croissant offert » ; rien ne dit lequel fait foi, et le caissier tranche au
 * comptoir.
 *
 * Le registre grave le libellé à l'émission (migration 20260814120000). Ces
 * tests verrouillent le fait qu'on le LIT, et surtout qu'on retombe proprement
 * sur la table parente pour les codes qui l'ont précédé.
 */
describe("lookupRedeemCode — le libellé gravé remonte à la caisse", () => {
  it("remonte le libellé du registre quand il en porte un", async () => {
    seedWheel("GAIN-AB2C3D4E");
    seedUniversalReward("GAIN-AB2C3D4E", "wheel", "org-1", "Café offert");

    const result = await lookupRedeemCode("GAIN-AB2C3D4E");

    expect(result.status).toBe("found");
    if (result.status === "found") {
      // La fixture parente dit « Un cookie » : c'est bien le registre qui parle.
      expect(result.frozenLabel).toBe("Café offert");
      expect(
        result.match.source === "wheel" ? result.match.participation.prizes?.label : null,
      ).toBe("Un cookie");
    }
  });

  it("rend null quand le registre porte un libellé VIDE — pas une chaîne vide", async () => {
    // Une ligne rétro-alimentée peut avoir un libellé vide. L'afficher
    // donnerait un blanc au comptoir : on préfère retomber sur la table
    // parente, qui dira au moins quelque chose.
    seedWheel("GAIN-AB2C3D4E");
    seedUniversalReward("GAIN-AB2C3D4E", "wheel", "org-1", "");

    const result = await lookupRedeemCode("GAIN-AB2C3D4E");

    expect(result.status).toBe("found");
    if (result.status === "found") expect(result.frozenLabel).toBeNull();
  });

  it("rend null pour un code ANTÉRIEUR au registre, sans casser le routage", async () => {
    // CONTRÔLE NÉGATIF DU MÉCANISME. Aucun `seedUniversalReward` : le code est
    // historique, le routeur legacy le retrouve, et l'affichage doit retomber
    // sur la table parente — c'est-à-dire l'ancien comportement, qui reste le
    // meilleur disponible pour lui. Sans cette assertion, on pourrait livrer un
    // correctif qui rend la caisse muette sur tous les anciens lots.
    seedWheel("GAIN-AB2C3D4E");

    const result = await lookupRedeemCode("GAIN-AB2C3D4E");

    expect(result.status).toBe("found");
    if (result.status === "found") {
      expect(result.frozenLabel ?? null).toBeNull();
      expect(result.match.source).toBe("wheel");
    }
  });
});

/**
 * LA DESCRIPTION QUE LA CAISSE AFFICHE EST CELLE SOUS LAQUELLE IL A GAGNÉ.
 *
 * Moitié applicative de la migration 20260901120000. Le titre était déjà gravé,
 * la ligne juste en dessous restait la description COURANTE de la table
 * parente : les deux lignes d'une même carte se contredisaient, et c'est la
 * seconde qui énonce les CONDITIONS que le caissier applique au comptoir.
 */
describe("lookupRedeemCode — la description gravée remonte à la caisse", () => {
  it("remonte la description du registre quand il en porte une", async () => {
    seedWheel("GAIN-AB2C3D4E");
    seedUniversalReward(
      "GAIN-AB2C3D4E",
      "wheel",
      "org-1",
      "Café offert",
      "un expresso au comptoir",
    );

    const result = await lookupRedeemCode("GAIN-AB2C3D4E");

    expect(result.status).toBe("found");
    if (result.status === "found") {
      expect(result.frozenDetails).toBe("un expresso au comptoir");
    }
  });

  it("rend null quand le registre porte une description VIDE", async () => {
    // `prizes.description` est `not null default ''` : sur la ROUE la clé
    // existe toujours et vaut la chaîne vide tant que rien n'est écrit.
    // L'afficher rendrait la carte muette au lieu de retomber sur le parent.
    seedWheel("GAIN-AB2C3D4E");
    seedUniversalReward("GAIN-AB2C3D4E", "wheel", "org-1", "Café offert", "");

    const result = await lookupRedeemCode("GAIN-AB2C3D4E");

    expect(result.status).toBe("found");
    if (result.status === "found") expect(result.frozenDetails).toBeNull();
  });

  it("rend null pour la famille pronostics, dont la clé est TOUJOURS absente", async () => {
    // `contest` est la seule des neuf familles à ne jamais écrire
    // `reward_details` (20260805150000, l. 579-583) : pour elle le repli sur
    // la table parente est le chemin NORMAL, pas une panne.
    seedContestAward("PRONO-ABCD2345");
    seedUniversalReward("PRONO-ABCD2345", "contest", "org-1", "Maillot dédicacé");

    const result = await lookupRedeemCode("PRONO-ABCD2345");

    expect(result.status).toBe("found");
    if (result.status === "found") {
      expect(result.frozenLabel).toBe("Maillot dédicacé");
      expect(result.frozenDetails).toBeNull();
    }
  });

  it("rend null pour un code ANTÉRIEUR au registre, sans casser le routage", async () => {
    // CONTRÔLE NÉGATIF : aucun `seedUniversalReward`. La carte doit retomber
    // sur la table parente plutôt que de rester muette sur tous les anciens
    // lots — le même piège que pour le libellé.
    seedWheel("GAIN-AB2C3D4E");

    const result = await lookupRedeemCode("GAIN-AB2C3D4E");

    expect(result.status).toBe("found");
    if (result.status === "found") {
      expect(result.frozenDetails ?? null).toBeNull();
      expect(result.match.source).toBe("wheel");
    }
  });
});

// ════════════════════════════════════════════════════════════
// La 10e famille en caisse : la réservation de stock (RESA-…, RES-5)
//
// Ce que ces tests attestent :
//   · un code RESA- est ROUTÉ vers sa famille, et jamais vers la roue — dont
//     le normaliseur est PERMISSIF et l'attraperait sans eux ;
//   · le retrait passe par le ROUTEUR UNIVERSEL et par lui seul : il n'y a
//     aucun repli legacy, parce que `redeem_stock_hold` est un bras source ;
//   · `source_refused` est PHRASÉ avec la fenêtre. Traduit par le générique
//     « ce lot ne peut pas être remis », il ferait renvoyer chez lui quelqu'un
//     dont la réservation est parfaitement valide.
// ════════════════════════════════════════════════════════════

/** Seed d'une prise de stock retrouvable par son code, avec son offre. */
function seedStockHold(
  code: string,
  overrides: Partial<{
    status: "held" | "redeemed" | "cancelled";
    redeemed_at: string | null;
    cancelled_at: string | null;
    redeem_expires_at: string | null;
    organization_id: string;
  }> = {},
  fenetre: { debut: string; fin: string } = {
    debut: "2020-01-01T10:00:00.000Z",
    fin: "2099-01-01T12:00:00.000Z",
  },
) {
  db.stockHolds.set(code, {
    id: `hold-${code}`,
    organization_id: "org-1",
    offer_id: "offer-1",
    code,
    created_at: "2026-07-20T10:00:00.000Z",
    redeemed_at: null,
    cancelled_at: null,
    redeem_expires_at: fenetre.fin,
    basket_cents: null,
    status: "held",
    ...overrides,
  });
  db.stockOffers.set("offer-1", {
    id: "offer-1",
    organization_id: overrides.organization_id ?? "org-1",
    title: "Panier surprise",
    description: "Les invendus du soir",
    window_starts_at: fenetre.debut,
    window_ends_at: fenetre.fin,
  });
}

describe("caisse — routage d'un code RESA-", () => {
  afterEach(() => {
    db.reset();
    rateLimitMock.mockClear();
    recordCounterMock.mockClear();
  });

  it("route vers la famille stock, jamais vers la roue", async () => {
    // ROUGE SI : le normaliseur ou la route disparaissent. `normalizeRedeemCode`
    // est PERMISSIF — sans la branche RESA-, ce code finirait en « lot de roue
    // introuvable », c'est-à-dire « Code introuvable » devant un client qui
    // tient sa réservation.
    seedStockHold("RESA-ABCD2345");
    seedUniversalReward("RESA-ABCD2345", "reserver_stock", "org-1", "Panier surprise");

    const result = await lookupRedeemCode("RESA-ABCD2345");

    expect(result.status).toBe("found");
    if (result.status === "found") {
      expect(result.match.source).toBe("reserver_stock");
      if (result.match.source === "reserver_stock") {
        expect(result.match.hold.code).toBe("RESA-ABCD2345");
        // LA FENÊTRE VOYAGE AVEC LA PRISE : sans elle, le comptoir n'a aucun
        // moyen de dire quand revenir.
        expect(result.match.hold.window_starts_at).toBe("2020-01-01T10:00:00.000Z");
        expect(result.match.hold.offer_title).toBe("Panier surprise");
      }
      expect(result.frozenLabel).toBe("Panier surprise");
    }
  });

  it("tolère la saisie manuelle (casse, espaces, préfixe absent)", async () => {
    seedStockHold("RESA-ABCD2345");
    seedUniversalReward("RESA-ABCD2345", "reserver_stock");

    for (const saisie of ["resa abcd2345", " RESA-abcd2345 ", "abcd2345"]) {
      const result = await lookupRedeemCode(saisie);
      expect(result.status, saisie).toBe("found");
    }
  });

  it("une prise d'une AUTRE organisation reste introuvable", async () => {
    seedStockHold("RESA-ABCD2345", { organization_id: "org-2" });
    seedUniversalReward("RESA-ABCD2345", "reserver_stock", "org-2");

    expect((await lookupRedeemCode("RESA-ABCD2345")).status).toBe("not_found");
  });

  it("le préfixe RESA fait AUTORITÉ : pas de repli sur la roue", async () => {
    // Aucune prise semée. Un code RESA- inconnu ne doit pas aller chercher un
    // lot de roue portant le même suffixe.
    seedWheel("GAIN-ABCD2345");
    expect((await lookupRedeemCode("RESA-ABCD2345")).status).toBe("not_found");
  });

  it("une recherche ne coûte qu'UN jeton, préfixe RESA compris", async () => {
    seedStockHold("RESA-ABCD2345");
    seedUniversalReward("RESA-ABCD2345", "reserver_stock");
    await lookupRedeemCode("RESA-ABCD2345");
    expect(lookupTokens()).toHaveLength(1);
  });
});

describe("redeemStockHold — le retrait au comptoir", () => {
  afterEach(() => {
    db.reset();
    rateLimitMock.mockClear();
    recordCounterMock.mockClear();
  });

  function form(champs: Record<string, string>): FormData {
    const fd = new FormData();
    for (const [cle, valeur] of Object.entries(champs)) fd.set(cle, valeur);
    return fd;
  }

  it("retire l'unité par le ROUTEUR UNIVERSEL, avec le panier saisi", async () => {
    seedStockHold("RESA-ABCD2345");
    seedUniversalReward("RESA-ABCD2345", "reserver_stock");

    const res = await redeemStockHold(
      null,
      form({ code: "RESA-ABCD2345", basket: "12,50" }),
    );

    expect(res.ok).toBe(true);
    const appel = db.rpcCalls.find((c) => c.name === "redeem_reward_by_code");
    expect(appel?.args.p_basket_cents).toBe(1250);
    // AUCUN appel au bras source : la caisse n'a qu'une porte.
    expect(db.rpcCalls.some((c) => c.name === "redeem_stock_hold")).toBe(false);
    expect(db.stockHolds.get("RESA-ABCD2345")?.status).toBe("redeemed");
  });

  it("le second passage est refusé, et daté", async () => {
    seedStockHold("RESA-ABCD2345");
    seedUniversalReward("RESA-ABCD2345", "reserver_stock");
    await redeemStockHold(null, form({ code: "RESA-ABCD2345" }));

    const rejeu = await redeemStockHold(null, form({ code: "RESA-ABCD2345" }));
    expect(rejeu.ok).toBe(false);
    expect(rejeu.ok === false && rejeu.error).toContain("déjà été remis");
  });

  it("PHRASE « pas encore ouvert » avec la fenêtre, jamais le refus générique", async () => {
    // C'est LE point de la famille : la borne BASSE n'existe que dans le bras
    // source, et le registre n'a pas de mot pour elle. Le générique « ce lot ne
    // peut pas être remis » renverrait chez lui quelqu'un dont la réservation
    // est parfaitement valide.
    seedStockHold(
      "RESA-ABCD2345",
      {},
      { debut: "2099-04-12T16:00:00.000Z", fin: "2099-04-12T18:00:00.000Z" },
    );
    seedUniversalReward("RESA-ABCD2345", "reserver_stock");

    const res = await redeemStockHold(null, form({ code: "RESA-ABCD2345" }));

    expect(res.ok).toBe(false);
    expect(res.ok === false && res.error).toContain("Retrait pas encore ouvert");
    expect(res.ok === false && res.error).toContain("fenêtre :");
    // L'unité N'EST PAS consommée : le client revient à l'heure dite.
    expect(db.stockHolds.get("RESA-ABCD2345")?.status).toBe("held");
  });

  it("une prise annulée et une fenêtre close se disent chacune pour elles-mêmes", async () => {
    seedStockHold("RESA-ABCD2345", {
      status: "cancelled",
      cancelled_at: "2026-07-21T10:00:00.000Z",
    });
    seedUniversalReward("RESA-ABCD2345", "reserver_stock");
    const annulee = await redeemStockHold(null, form({ code: "RESA-ABCD2345" }));
    expect(annulee.ok === false && annulee.error).toContain("annulé");

    db.reset();
    seedStockHold(
      "RESA-BCDE3456",
      {},
      { debut: "2020-01-01T10:00:00.000Z", fin: "2020-01-01T12:00:00.000Z" },
    );
    seedUniversalReward("RESA-BCDE3456", "reserver_stock");
    const close = await redeemStockHold(null, form({ code: "RESA-BCDE3456" }));
    expect(close.ok === false && close.error).toContain("expiré");
  });

  it("un code que le registre ne connaît pas est INTROUVABLE, sans repli legacy", async () => {
    // Cette famille est née AVEC le registre : un « miss » n'y est pas un code
    // historique, c'est un code inventé. Aucun repli ne doit être tenté.
    seedStockHold("RESA-ABCD2345");
    const res = await redeemStockHold(null, form({ code: "RESA-ABCD2345" }));
    expect(res.ok).toBe(false);
    expect(res.ok === false && res.error).toBe("Code introuvable");
    expect(db.stockHolds.get("RESA-ABCD2345")?.status).toBe("held");
  });

  it("refuse une forme de code invalide avant tout aller-retour", async () => {
    const res = await redeemStockHold(null, form({ code: "GAIN-ABCD2345" }));
    expect(res.ok).toBe(false);
    expect(db.rpcCalls).toHaveLength(0);
  });

  it("refuse un panier illisible sans rien retirer", async () => {
    seedStockHold("RESA-ABCD2345");
    seedUniversalReward("RESA-ABCD2345", "reserver_stock");
    const res = await redeemStockHold(
      null,
      form({ code: "RESA-ABCD2345", basket: "beaucoup" }),
    );
    expect(res.ok).toBe(false);
    expect(db.stockHolds.get("RESA-ABCD2345")?.status).toBe("held");
  });
});
