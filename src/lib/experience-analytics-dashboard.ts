/**
 * ── DES ÉVÉNEMENTS ET DES PERSONNES : DEUX FAMILLES DE COMPTEURS ──
 *
 * `views` / `starts` / `completions` comptent des ÉVÉNEMENTS. Depuis que les
 * clés d'idempotence de start et de complete sont datées (wagon 4, NUM-1), deux
 * jours de jeu d'un même client y comptent deux fois — ce qui est le but : une
 * mesure d'activité doit bouger quand l'activité bouge.
 *
 * `uniqueViewers` / `uniqueStarters` / `uniqueFinishers` comptent des
 * PERSONNES, sur les mêmes lignes. C'est la moitié qui manquait : les tuiles de
 * l'écran divisaient `starts / views`, donc des événements par des événements,
 * et annonçaient « 33 % des personnes ont joué » sur un chiffre qui n'en était
 * pas un. Les deux familles coexistent, aucune ne remplace l'autre.
 *
 * Le dédoublonnage se fait sur `coalesce(player_id::text, player_key)` : deux
 * espaces de noms distincts (uuid de joueur identifié, sha256 d'appareil), qui
 * ne se rejoignent que si la résolution d'identité a eu lieu.
 */
export interface ExperienceAnalyticsRow {
  experienceKind: string;
  experienceId: string;
  experienceName: string;
  views: number;
  joins: number;
  starts: number;
  completions: number;
  uniqueViewers: number;
  uniqueStarters: number;
  uniqueFinishers: number;
  rewardsIssued: number;
  rewardsClaimed: number;
  rewardsRedeemed: number;
  returningPlayers: number;
  shares: number;
  uniquePlayers: number;
  basketObservations: number;
  basketRevenueCents: number;
  rewardCostObservations: number;
  rewardCostCents: number;
  marginObservations: number;
  attributableMarginCents: number;
}

export interface ExperienceSourceRow {
  source: string;
  views: number;
  starts: number;
  completions: number;
  rewardsRedeemed: number;
  basketObservations: number;
  basketRevenueCents: number;
}

export interface ExperienceAnalyticsSnapshot {
  periodDays: number;
  totalEvents: number;
  summary: Omit<
    ExperienceAnalyticsRow,
    "experienceKind" | "experienceId" | "experienceName"
  >;
  experiences: ExperienceAnalyticsRow[];
  sources: ExperienceSourceRow[];
}

const emptyMetrics = {
  views: 0,
  joins: 0,
  starts: 0,
  completions: 0,
  uniqueViewers: 0,
  uniqueStarters: 0,
  uniqueFinishers: 0,
  rewardsIssued: 0,
  rewardsClaimed: 0,
  rewardsRedeemed: 0,
  returningPlayers: 0,
  shares: 0,
  uniquePlayers: 0,
  basketObservations: 0,
  basketRevenueCents: 0,
  rewardCostObservations: 0,
  rewardCostCents: 0,
  marginObservations: 0,
  attributableMarginCents: 0,
};

const record = (value: unknown): Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

const number = (value: unknown): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
};

const string = (value: unknown, fallback = ""): string =>
  typeof value === "string" && value !== "" ? value : fallback;

function parseMetrics(value: unknown) {
  const row = record(value);
  return {
    views: number(row.views),
    joins: number(row.joins),
    starts: number(row.starts),
    completions: number(row.completions),
    uniqueViewers: number(row.unique_viewers),
    uniqueStarters: number(row.unique_starters),
    uniqueFinishers: number(row.unique_finishers),
    rewardsIssued: number(row.rewards_issued),
    rewardsClaimed: number(row.rewards_claimed),
    rewardsRedeemed: number(row.rewards_redeemed),
    returningPlayers: number(row.returning_players),
    shares: number(row.shares),
    uniquePlayers: number(row.unique_players),
    basketObservations: number(row.basket_observations),
    basketRevenueCents: number(row.basket_revenue_cents),
    rewardCostObservations: number(row.reward_cost_observations),
    rewardCostCents: number(row.reward_cost_cents),
    marginObservations: number(row.margin_observations),
    attributableMarginCents: number(row.attributable_margin_cents),
  };
}

export function parseExperienceAnalytics(
  value: unknown,
): ExperienceAnalyticsSnapshot {
  const root = record(value);
  const experiences = Array.isArray(root.experiences)
    ? root.experiences.map((value) => {
        const row = record(value);
        return {
          experienceKind: string(row.experience_kind, "unknown"),
          experienceId: string(row.experience_id),
          experienceName: string(row.experience_name, "Expérience sans nom"),
          ...parseMetrics(row),
        };
      })
    : [];
  const sources = Array.isArray(root.sources)
    ? root.sources.map((value) => {
        const row = record(value);
        const metrics = parseMetrics(row);
        return {
          source: string(row.source, "unknown"),
          views: metrics.views,
          starts: metrics.starts,
          completions: metrics.completions,
          rewardsRedeemed: metrics.rewardsRedeemed,
          basketObservations: metrics.basketObservations,
          basketRevenueCents: metrics.basketRevenueCents,
        };
      })
    : [];

  return {
    periodDays: Math.min(Math.max(number(root.period_days) || 30, 1), 365),
    totalEvents: number(root.total_events),
    summary: { ...emptyMetrics, ...parseMetrics(root.summary) },
    experiences,
    sources,
  };
}

export function analyticsRate(numerator: number, denominator: number): number | null {
  return denominator > 0 ? Math.round((numerator / denominator) * 100) : null;
}
