import "server-only";

import { createAdminBackofficeClient } from "@/lib/admin/db";
import { getPlan } from "@/lib/stripe";
import { sanitizeSearchTerm } from "@/lib/utils";
import type { SubscriptionStatus } from "@/types/database";
import type { AdminAuditLog, AdminNote, AdminUser } from "@/types/admin";

/**
 * Couche d'accès en LECTURE du back-office. Toutes les requêtes passent
 * par la service role key (RLS contournée) — elles ne sont donc jamais
 * exécutées sans une garde `requireAdmin(...)` en amont dans la page.
 * Aucune écriture ici (voir les server actions par module).
 */

type Db = ReturnType<typeof createAdminBackofficeClient>;
type FilterQ = ReturnType<ReturnType<Db["from"]>["select"]>;

async function count(
  db: Db,
  table: string,
  filter?: (q: FilterQ) => FilterQ,
): Promise<number> {
  let q = db.from(table).select("id", { count: "exact", head: true }) as unknown as FilterQ;
  if (filter) q = filter(q);
  const { count: c } = await q;
  return c ?? 0;
}

export interface DashboardMetrics {
  mrr: number;
  activeSubs: number;
  trialing: number;
  pastDue: number;
  canceled: number;
  totalOrgs: number;
  totalSpins: number;
  totalParticipations: number;
  activeCampaigns: number;
  pendingRedemptions: number;
}

export async function getDashboardMetrics(): Promise<DashboardMetrics> {
  const db = createAdminBackofficeClient();

  const [{ data: orgs }, totalSpins, totalParticipations, activeCampaigns, pending] =
    await Promise.all([
      db.from("organizations").select("subscription_status, plan"),
      count(db, "spins"),
      count(db, "participations"),
      count(db, "campaigns", (q) => q.eq("status", "active")),
      count(db, "participations", (q) => q.is("redeemed_at", null)),
    ]);

  const rows = orgs ?? [];
  const byStatus = (s: SubscriptionStatus) =>
    rows.filter((o) => o.subscription_status === s).length;

  // MRR : somme du prix mensuel du plan de chaque abonnement actif.
  const mrr = rows
    .filter((o) => o.subscription_status === "active")
    .reduce((sum, o) => sum + getPlan(o.plan).priceMonthly, 0);

  return {
    mrr,
    activeSubs: byStatus("active"),
    trialing: byStatus("trialing"),
    pastDue: byStatus("past_due"),
    canceled: byStatus("canceled") + byStatus("inactive"),
    totalOrgs: rows.length,
    totalSpins,
    totalParticipations,
    activeCampaigns,
    pendingRedemptions: pending,
  };
}

export interface MerchantRow {
  id: string;
  name: string;
  slug: string;
  subscription_status: SubscriptionStatus;
  plan: string;
  trial_ends_at: string;
  created_at: string;
}

export interface MerchantListResult {
  rows: MerchantRow[];
  total: number;
  page: number;
  pageSize: number;
}

const MERCHANT_STATUSES: SubscriptionStatus[] = [
  "trialing",
  "active",
  "past_due",
  "canceled",
  "inactive",
];

export async function listMerchants(opts: {
  search?: string;
  status?: string;
  page?: number;
  pageSize?: number;
}): Promise<MerchantListResult> {
  const db = createAdminBackofficeClient();
  const pageSize = Math.min(Math.max(opts.pageSize ?? 20, 1), 100);
  const page = Math.max(opts.page ?? 1, 1);
  const from = (page - 1) * pageSize;

  let q = db
    .from("organizations")
    .select(
      "id, name, slug, subscription_status, plan, trial_ends_at, created_at",
      { count: "exact" },
    )
    .order("created_at", { ascending: false })
    .range(from, from + pageSize - 1);

  const status = opts.status ?? "";
  if (MERCHANT_STATUSES.includes(status as SubscriptionStatus)) {
    q = q.eq("subscription_status", status);
  }

  const term = sanitizeSearchTerm(opts.search ?? "");
  if (term) q = q.or(`name.ilike.%${term}%,slug.ilike.%${term}%`);

  const { data, count: total } = await q;
  return {
    rows: (data as MerchantRow[]) ?? [],
    total: total ?? 0,
    page,
    pageSize,
  };
}

export interface MerchantDetail {
  org: {
    id: string;
    name: string;
    slug: string;
    subscription_status: SubscriptionStatus;
    plan: string;
    stripe_customer_id: string | null;
    trial_ends_at: string;
    past_due_since: string | null;
    addon_pronostics: boolean;
    addon_hunts: boolean;
    addon_loyalty: boolean;
    addon_jackpot: boolean;
    addon_events: boolean;
    addon_calendar: boolean;
    comp_access: boolean;
    comp_access_until: string | null;
    comp_access_note: string;
    created_at: string;
  };
  members: { user_id: string; role: string; created_at: string }[];
  counts: {
    campaigns: number;
    spins: number;
    participations: number;
    qrCodes: number;
  };
  notes: AdminNote[];
}

export async function getMerchantDetail(id: string): Promise<MerchantDetail | null> {
  const db = createAdminBackofficeClient();
  const { data: org } = await db
    .from("organizations")
    .select(
      "id, name, slug, subscription_status, plan, stripe_customer_id, trial_ends_at, past_due_since, addon_pronostics, addon_hunts, addon_loyalty, addon_jackpot, addon_events, addon_calendar, comp_access, comp_access_until, comp_access_note, created_at",
    )
    .eq("id", id)
    .maybeSingle();
  if (!org) return null;

  const [{ data: members }, campaigns, spins, participations, qrCodes, { data: notes }] =
    await Promise.all([
      db
        .from("organization_members")
        .select("user_id, role, created_at")
        .eq("organization_id", id),
      count(db, "campaigns", (q) => q.eq("organization_id", id)),
      count(db, "spins", (q) => q.eq("organization_id", id)),
      count(db, "participations", (q) => q.eq("organization_id", id)),
      count(db, "qr_codes", (q) => q.eq("organization_id", id)),
      db
        .from("admin_notes")
        .select("*")
        .eq("organization_id", id)
        .order("created_at", { ascending: false }),
    ]);

  return {
    org: org as MerchantDetail["org"],
    members: (members as MerchantDetail["members"]) ?? [],
    counts: { campaigns, spins, participations, qrCodes },
    notes: (notes as AdminNote[]) ?? [],
  };
}

/**
 * Séries pour l'analytics : participations/jour sur `days` jours.
 * Agrégat calculé en base (RPC) puis complété des jours vides côté serveur.
 */
export async function getParticipationsSeries(days = 30): Promise<{ date: string; count: number }[]> {
  const db = createAdminBackofficeClient();
  const { data } = await db.rpc("admin_participations_daily", { p_days: days });

  const counts = new Map<string, number>();
  for (const row of (data as { day: string; count: number }[]) ?? []) {
    counts.set(String(row.day).slice(0, 10), Number(row.count));
  }
  const series: { date: string; count: number }[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(Date.now() - i * 86_400_000).toISOString().slice(0, 10);
    series.push({ date: d, count: counts.get(d) ?? 0 });
  }
  return series;
}

/** Top commerçants par nombre de tours joués (agrégat SQL). */
export async function getTopMerchants(limit = 5): Promise<{ name: string; spins: number }[]> {
  const db = createAdminBackofficeClient();
  const { data } = await db.rpc("admin_top_merchants", { p_limit: limit });
  return ((data as { name: string; spins: number }[]) ?? []).map((r) => ({
    name: r.name ?? "—",
    spins: Number(r.spins),
  }));
}

export interface AuditLogQuery {
  action?: string;
  page?: number;
  pageSize?: number;
}

export async function listAuditLogs(
  opts: AuditLogQuery,
): Promise<{ rows: AdminAuditLog[]; total: number; page: number; pageSize: number }> {
  const db = createAdminBackofficeClient();
  const pageSize = Math.min(Math.max(opts.pageSize ?? 30, 1), 100);
  const page = Math.max(opts.page ?? 1, 1);
  const from = (page - 1) * pageSize;

  let q = db
    .from("admin_audit_logs")
    .select("*", { count: "exact" })
    .order("created_at", { ascending: false })
    .range(from, from + pageSize - 1);

  const action = sanitizeSearchTerm(opts.action ?? "");
  if (action) q = q.ilike("action", `%${action}%`);

  const { data, count: total } = await q;
  return { rows: (data as AdminAuditLog[]) ?? [], total: total ?? 0, page, pageSize };
}

export async function listAdminTeam(): Promise<AdminUser[]> {
  const db = createAdminBackofficeClient();
  const { data } = await db
    .from("admin_users")
    .select("*")
    .order("created_at", { ascending: true });
  return (data as AdminUser[]) ?? [];
}

export async function getAdminById(id: string): Promise<AdminUser | null> {
  const db = createAdminBackofficeClient();
  const { data } = await db.from("admin_users").select("*").eq("id", id).maybeSingle();
  return (data as AdminUser | null) ?? null;
}

export interface MonitoringSnapshot {
  dbReachable: boolean;
  spins24h: number;
  participations24h: number;
  stripeEventsTotal: number;
  pendingRedemptions: number;
  pastDueOrgs: number;
}

export async function getMonitoringSnapshot(): Promise<MonitoringSnapshot> {
  const db = createAdminBackofficeClient();
  const since = new Date(Date.now() - 86_400_000).toISOString();
  try {
    const [spins24h, participations24h, stripeEventsTotal, pending, pastDue] =
      await Promise.all([
        count(db, "spins", (q) => q.gte("created_at", since)),
        count(db, "participations", (q) => q.gte("created_at", since)),
        count(db, "stripe_events"),
        count(db, "participations", (q) => q.is("redeemed_at", null)),
        count(db, "organizations", (q) => q.eq("subscription_status", "past_due")),
      ]);
    return {
      dbReachable: true,
      spins24h,
      participations24h,
      stripeEventsTotal,
      pendingRedemptions: pending,
      pastDueOrgs: pastDue,
    };
  } catch {
    return {
      dbReachable: false,
      spins24h: 0,
      participations24h: 0,
      stripeEventsTotal: 0,
      pendingRedemptions: 0,
      pastDueOrgs: 0,
    };
  }
}
