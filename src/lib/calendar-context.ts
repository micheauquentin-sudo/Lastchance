import "server-only";

import { cookies } from "next/headers";
import { mapCalendarPublicState, type CalendarPublicState } from "@/lib/calendar";
import { hashPlayerToken } from "@/lib/pronostics";
import { createAdminClient } from "@/lib/supabase/admin";
import { hasCalendarAccess } from "@/lib/subscription";
import type { Organization } from "@/types/database";

/** Erreur générique unique : aucun oracle sur l'existence/l'état interne. */
const UNAVAILABLE = "Ce calendrier n'est pas disponible.";

/** UUID canonique (pour distinguer un id d'un public_slug à la résolution). */
const UUID_PATTERN =
  /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

/** Nom du cookie httpOnly portant le jeton joueur d'un CALENDRIER. */
export function calendarTokenCookieName(calendarId: string): string {
  return `lc-calendar-${calendarId}`;
}

type PublicCalendarOrganization = Pick<
  Organization,
  | "id"
  | "name"
  | "logo_url"
  | "subscription_status"
  | "trial_ends_at"
  | "past_due_since"
  | "addon_calendar"
  | "comp_access"
  | "comp_access_until"
  | "timezone"
>;

const ORG_COLUMNS =
  "id, name, logo_url, subscription_status, trial_ends_at, past_due_since, addon_calendar, comp_access, comp_access_until, timezone";

const CALENDAR_COLUMNS =
  "id, organization_id, status, public_slug";

interface CalendarRow {
  id: string;
  organization_id: string;
  status: string;
  public_slug: string;
  organizations: PublicCalendarOrganization | null;
}

export type CalendarPublicContext =
  | { ok: false; error: string }
  | {
      ok: true;
      calendarId: string;
      publicSlug: string;
      organization: PublicCalendarOrganization;
      /** État public complet (déjà filtré : aucun contenu de case non ouverte). */
      publicState: CalendarPublicState;
      /** Le visiteur a-t-il déjà une identité de joueur sur ce calendrier ? */
      hasIdentity: boolean;
    };

/**
 * Résout un calendrier par son UUID ou son public_slug (service role + garde
 * inter-tenant), vérifie le module + l'abonnement + le statut actif, puis charge
 * l'état public via calendar_public_state. Identité cookie PAR CALENDRIER en
 * LECTURE SEULE : rien n'est posé ici (le cookie est écrit par les actions
 * join/open) ; s'il existe, son hash alimente la vue « moi » (cases ouvertes,
 * codes) sans jamais quitter le serveur. Réponse générique unique en cas
 * d'invalidité (404 côté page) — pas d'oracle.
 */
export async function loadCalendarPublicContext(
  slugOrId: string,
): Promise<CalendarPublicContext> {
  const admin = createAdminClient();

  const query = admin
    .from("calendars")
    .select(`${CALENDAR_COLUMNS}, organizations(${ORG_COLUMNS})`);
  const { data } = UUID_PATTERN.test(slugOrId)
    ? await query.eq("id", slugOrId).maybeSingle()
    : await query.eq("public_slug", slugOrId.toLowerCase()).maybeSingle();
  if (!data) return { ok: false, error: UNAVAILABLE };

  const row = data as unknown as CalendarRow;
  const org = row.organizations;
  // La service role contourne la RLS : chaque relation doit pointer le même
  // tenant, sinon on refuse (incohérence = 404 générique).
  if (!org || org.id !== row.organization_id) {
    console.error("[calendar-context] organisation incohérente", { slugOrId });
    return { ok: false, error: UNAVAILABLE };
  }
  if (!hasCalendarAccess(org)) return { ok: false, error: UNAVAILABLE };
  if (row.status !== "active") return { ok: false, error: UNAVAILABLE };

  // Identité cookie PAR CALENDRIER, lecture seule (ni le jeton ni son hash ne
  // quittent le serveur).
  const store = await cookies();
  const token = store.get(calendarTokenCookieName(row.id))?.value;
  const tokenHash = token ? hashPlayerToken(token) : undefined;

  const { data: stateRaw, error } = await admin.rpc("calendar_public_state", {
    p_calendar_id: row.id,
    p_player_token_hash: tokenHash,
  });
  if (error) {
    console.error("[calendar-context] public state", error.message);
    return { ok: false, error: UNAVAILABLE };
  }

  const publicState = mapCalendarPublicState(stateRaw);
  if (publicState.state !== "ok") return { ok: false, error: UNAVAILABLE };

  return {
    ok: true,
    calendarId: row.id,
    publicSlug: row.public_slug,
    organization: org,
    publicState,
    hasIdentity: Boolean(token),
  };
}

export type CalendarActionContext =
  | { ok: false }
  | {
      ok: true;
      admin: ReturnType<typeof createAdminClient>;
      calendarId: string;
      organizationId: string;
    };

/**
 * Contexte MINIMAL d'une action publique (open / consume / getState) : calendrier
 * résolu par son UUID, module + statut vérifiés côté service role, rien de plus.
 * Une seule requête (calendrier + organisation) précède l'appel RPC — pas
 * d'amplification de lecture sur un chemin ouvert à Internet (miroir
 * loadEventActionContext). Module coupé, calendrier inexistant, non actif →
 * échec générique sans oracle.
 */
export async function loadCalendarActionContext(
  calendarId: string,
): Promise<CalendarActionContext> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("calendars")
    .select(`${CALENDAR_COLUMNS}, organizations(${ORG_COLUMNS})`)
    .eq("id", calendarId)
    .maybeSingle();
  if (!data) return { ok: false };

  const row = data as unknown as CalendarRow;
  const org = row.organizations;
  if (!org || org.id !== row.organization_id) return { ok: false };
  if (!hasCalendarAccess(org)) return { ok: false };
  if (row.status !== "active") return { ok: false };

  return { ok: true, admin, calendarId: row.id, organizationId: row.organization_id };
}
