"use server";

import { revalidatePath } from "next/cache";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { getUserAndOrg } from "@/lib/auth";
import {
  calendarDayUnlockAt,
  mapCalendarJoin,
  mapCalendarOpen,
  mapCalendarPublicState,
  mapCalendarSpinGrant,
  type CalendarJoinResult,
  type CalendarOpenResult,
  type CalendarPublicState,
} from "@/lib/calendar";
import {
  calendarTokenCookieName,
  loadCalendarActionContext,
} from "@/lib/calendar-context";
import {
  loadCalendarSpinBundles,
  type CalendarSpinBundle,
} from "@/lib/calendar-spin-bundle";
import { monitored, reportError } from "@/lib/monitoring";
import { generatePlayerToken, hashPlayerToken } from "@/lib/pronostics";
import {
  observeSharedKey,
  RATE_LIMITS,
  rateLimit,
  rateLimitBucket,
} from "@/lib/rate-limit";
import { clientIpFromHeaders } from "@/lib/request-ip";
import { signClaimToken } from "@/lib/spin";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { hasCalendarAccess } from "@/lib/subscription";
import { type ActionResult } from "@/lib/utils";
import {
  createCalendarSchema,
  deleteCalendarSchema,
  getCalendarStateSchema,
  joinCalendarSchema,
  openCalendarBoxSchema,
  consumeCalendarSpinSchema,
  setCalendarStatusSchema,
  updateCalendarDaySchema,
  updateCalendarSchema,
} from "@/lib/validations/calendar";

/** Durée de vie du cookie joueur d'un calendrier (180 j, comme la fidélité). */
const CALENDAR_COOKIE_MAX_AGE = 60 * 60 * 24 * 180;

/** Défaut de création (l'Avent) — le commerçant ajuste ensuite. */
const DEFAULT_DAY_COUNT = 24;

const NOT_EDITOR = "Action non autorisée";
const GENERIC_ERROR = "Une erreur est survenue, réessayez.";

// ════════════════════════════════════════════════════════════
// Contrôle d'abus — principe de conception du module (ADR-032)
//
// join / open sont des chemins PUBLICS servis par le service_role à des joueurs
// qui ouvrent leur case DE CHEZ EUX comme depuis un même Wi-Fi / CGNAT : l'IP est
// souvent PARTAGÉE. AUCUN seau `failClosed` ne porte donc sur une clé partagée
// (IP, calendrier) — un tel seau deviendrait un interrupteur qu'un tiers allume
// en le saturant (« déni d'ouverture d'un calendrier entier »). Les clés
// partagées ne portent que des compteurs d'OBSERVABILITÉ fail-OPEN
// (`observeSharedKey`, seau `calendarPublicIp`).
//
// Le `failClosed` reste légitime — et employé — sur une clé propre à UNE identité
// (hash du jeton joueur, `calendarPlayerAction`) : la saturer ne coupe que son
// porteur.
//
// La borne réelle contre l'abus n'est pas un rate-limit : c'est le gating
// TEMPOREL serveur-autoritatif (une case ne s'ouvre pas en avance), les
// contraintes d'unicité SQL (un joueur par calendrier, une ouverture par jour)
// et le stock FINI obligatoire du lot. Fabriquer N cookies ne crée pas N lots.
// ════════════════════════════════════════════════════════════

// ────────────────────────────────────────────────────────────
// Parcours public — identité cookie + observabilité
// ────────────────────────────────────────────────────────────

/** Identité du joueur portée par le cookie httpOnly du navigateur. */
interface CalendarIdentity {
  tokenHash: string;
  returning: boolean;
}

/**
 * Résout — et pose au besoin — l'identité du joueur. AUCUN aller-retour base :
 * ce qui permet de trancher le premier seau avant la moindre requête SQL, avant
 * tout appel sortant et avant l'instrumentation (`monitored`). Le cookie est posé
 * dès la première tentative (miroir jackpot/fidélité).
 */
async function resolveCalendarIdentity(calendarId: string): Promise<CalendarIdentity> {
  const store = await cookies();
  const cookieName = calendarTokenCookieName(calendarId);
  const existing = store.get(cookieName)?.value;
  const token = existing ?? generatePlayerToken();
  if (!existing) {
    store.set(cookieName, token, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: CALENDAR_COOKIE_MAX_AGE,
    });
  }
  return { tokenHash: hashPlayerToken(token), returning: Boolean(existing) };
}

/** Seau d'observabilité de la pression publique (clé partagée, jamais un refus). */
async function observeCalendarPressure(calendarId: string, ip: string): Promise<void> {
  await observeSharedKey(
    rateLimitBucket("calendar:public:ip", calendarId, ip),
    RATE_LIMITS.calendarPublicIp,
    "calendar_public_pressure",
    { calendar_id: calendarId },
  );
}

// ────────────────────────────────────────────────────────────
// joinCalendar — rejoindre + opt-in email (RGPD)
// ────────────────────────────────────────────────────────────

/**
 * Rejoindre un calendrier par son slug (POST du bouton). Résout d'abord l'UUID
 * du calendrier (le cookie d'identité est keyé par cet UUID, comme joinEvent),
 * pose le cookie joueur, appelle join_calendar (idempotent) et, si consentement
 * marketing + email fournis, abonne à la newsletter du commerçant (best-effort,
 * source `calendar`, miroir claimPrize). L'opt-in email/reminder est RGPD :
 * EXPLICITE côté UI, jamais pré-coché ; join_calendar ne fait MONTER les opt-in
 * (OR), un re-join ne rétracte jamais un consentement.
 */
export async function joinCalendar(input: {
  slug: string;
  email?: string;
  marketingOptIn?: boolean;
  reminderOptIn?: boolean;
}): Promise<ActionResult<CalendarJoinResult>> {
  const parsed = joinCalendarSchema.safeParse({
    slug: input.slug,
    email: input.email ?? "",
    marketingOptIn: input.marketingOptIn ?? false,
    reminderOptIn: input.reminderOptIn ?? false,
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0].message };
  }

  // Résolution de l'UUID + du public_slug avant toute écriture : le cookie
  // d'identité est keyé par l'UUID, qu'on doit donc connaître pour le réutiliser
  // (re-visite = même identité). Une résolution vide ne trahit rien : la RPC
  // répond `unavailable` de toute façon.
  const admin = createAdminClient();
  const isUuid =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(parsed.data.slug);
  const { data: calRow } = isUuid
    ? await admin.from("calendars").select("id, public_slug").eq("id", parsed.data.slug).maybeSingle()
    : await admin
        .from("calendars")
        .select("id, public_slug")
        .eq("public_slug", parsed.data.slug)
        .maybeSingle();
  if (!calRow) {
    return { ok: true, data: mapCalendarJoin({ state: "unavailable" }) };
  }
  const calendarId = calRow.id as string;
  const publicSlug = calRow.public_slug as string;

  const identity = await resolveCalendarIdentity(calendarId);

  // PREMIER REMPART — clé d'IDENTITÉ (`failClosed` légitime), avant la RPC.
  if (
    !(await rateLimit(
      rateLimitBucket("calendar:player", calendarId, identity.tokenHash),
      RATE_LIMITS.calendarPlayerAction,
      { failClosed: true },
    ))
  ) {
    return { ok: false, error: "Trop de tentatives. Patientez un instant." };
  }

  return monitored("calendar.join", () =>
    joinInner(parsed.data, calendarId, publicSlug, identity.tokenHash),
  );
}

async function joinInner(
  parsed: {
    slug: string;
    email?: string;
    marketingOptIn: boolean;
    reminderOptIn: boolean;
  },
  calendarId: string,
  publicSlug: string,
  tokenHash: string,
): Promise<ActionResult<CalendarJoinResult>> {
  try {
    const admin = createAdminClient();
    await observeCalendarPressure(calendarId, clientIpFromHeaders(await headers()));

    const { data, error } = await admin.rpc("join_calendar", {
      p_slug: publicSlug,
      p_player_token_hash: tokenHash,
      p_email: parsed.email ?? undefined,
      p_marketing_opt_in: parsed.marketingOptIn,
      p_reminder_opt_in: parsed.reminderOptIn,
    });
    if (error) {
      reportError("calendar.join", error.message);
      return { ok: false, error: GENERIC_ERROR };
    }

    const result = mapCalendarJoin(data);

    // Opt-in marketing avec email : abonné à la newsletter du commerçant
    // (idempotent, best-effort, miroir claim_winning_spin / hunts). L'org du
    // calendrier est résolue ici (la RPC ne la renvoie pas).
    if (result.state === "joined" && parsed.marketingOptIn && parsed.email) {
      await subscribeToNewsletter(admin, calendarId, parsed.email);
    }

    return { ok: true, data: result };
  } catch (err) {
    reportError("calendar.join", err);
    return { ok: false, error: GENERIC_ERROR };
  }
}

/**
 * Abonne un email à la newsletter du commerçant (source `calendar`). Idempotent
 * (on-conflict-do-nothing) et best-effort : jamais bloquant pour le join. Émet
 * `newsletter.subscriber.created` UNIQUEMENT sur une insertion réelle (miroir
 * hunts / roue).
 */
async function subscribeToNewsletter(
  admin: ReturnType<typeof createAdminClient>,
  calendarId: string,
  email: string,
): Promise<void> {
  const { data: cal } = await admin
    .from("calendars")
    .select("organization_id")
    .eq("id", calendarId)
    .maybeSingle();
  const organizationId = cal?.organization_id as string | undefined;
  if (!organizationId) return;

  const { data: inserted, error } = await admin
    .from("newsletter_subscribers")
    .upsert(
      { organization_id: organizationId, email, source: "calendar" },
      { onConflict: "organization_id,email", ignoreDuplicates: true },
    )
    .select("id");
  if (error) {
    reportError("calendar.join.subscribe", error.message);
    return;
  }
  if ((inserted?.length ?? 0) === 0) return;

  const { data: org } = await admin
    .from("organizations")
    .select("webhook_url")
    .eq("id", organizationId)
    .maybeSingle();
  if (!org?.webhook_url) return;
  const { error: whError } = await admin.from("webhook_deliveries").insert({
    organization_id: organizationId,
    event: "newsletter.subscriber.created",
    data: { email, source: "calendar" },
  });
  if (whError) reportError("calendar.join.webhook", whError.message);
}

// ────────────────────────────────────────────────────────────
// openCalendarBox — ouvrir une case (gating temporel serveur)
// ────────────────────────────────────────────────────────────

/**
 * Ouvre une case (POST du bouton). Le gating est SERVEUR (open_calendar_box
 * compare now() >= unlock_at) : une case en avance renvoie `too_early` (« revenez
 * le … »). Selon l'usage, l'ouverture renvoie un message, un code de lot CADEAU-…
 * (ou `out_of_stock`), ou un jeton de tour offert ; et déclenche la récompense
 * d'assiduité quand toutes les cases sont ouvertes. Le contenu n'est jamais servi
 * avant l'ouverture par CE joueur (invariant #2).
 */
export async function openCalendarBox(input: {
  calendarId: string;
  dayId: string;
}): Promise<ActionResult<CalendarOpenResult & { spinBundle?: CalendarSpinBundle | null }>> {
  const parsed = openCalendarBoxSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0].message };
  }

  const identity = await resolveCalendarIdentity(parsed.data.calendarId);

  // PREMIER REMPART — clé d'IDENTITÉ (`failClosed` légitime), avant la RPC.
  if (
    !(await rateLimit(
      rateLimitBucket("calendar:player", parsed.data.calendarId, identity.tokenHash),
      RATE_LIMITS.calendarPlayerAction,
      { failClosed: true },
    ))
  ) {
    return { ok: false, error: "Trop de tentatives. Patientez un instant." };
  }

  return monitored("calendar.open", () =>
    openInner(parsed.data, identity.tokenHash),
  );
}

async function openInner(
  parsed: { calendarId: string; dayId: string },
  tokenHash: string,
): Promise<ActionResult<CalendarOpenResult & { spinBundle?: CalendarSpinBundle | null }>> {
  try {
    const ctx = await loadCalendarActionContext(parsed.calendarId);
    // Calendrier inconnu / non actif / module coupé : résultat générique typé
    // (l'UI affiche le même message, aucun oracle sur le motif).
    if (!ctx.ok) {
      return { ok: true, data: { ...mapCalendarOpen({ state: "unavailable" }), spinBundle: null } };
    }

    await observeCalendarPressure(parsed.calendarId, clientIpFromHeaders(await headers()));

    const { data, error } = await ctx.admin.rpc("open_calendar_box", {
      p_calendar_id: parsed.calendarId,
      p_player_token_hash: tokenHash,
      p_day_id: parsed.dayId,
    });
    if (error) {
      reportError("calendar.open", error.message);
      return { ok: false, error: GENERIC_ERROR };
    }

    // La case ouverte (opened / already_opened) est une roue offerte : on précharge
    // SON bundle (et lui seul) pour enchaîner ouvrir→tourner dans la même session,
    // sans jamais précharger l'avenir. C'est l'unique roue à laquelle CE joueur a
    // droit à cet instant — la page publique ne précharge, elle, que les roues des
    // cases DÉJÀ ouvertes (pas de spoiler du lot d'une case future dans le RSC).
    const result = mapCalendarOpen(data);
    if (result.day?.contentType === "spin" && result.day.targetWheelId) {
      const bundles = await loadCalendarSpinBundles(
        ctx.admin,
        [result.day.targetWheelId],
        ctx.organizationId,
      );
      return {
        ok: true,
        data: { ...result, spinBundle: bundles[result.day.targetWheelId] ?? null },
      };
    }
    return { ok: true, data: { ...result, spinBundle: null } };
  } catch (err) {
    reportError("calendar.open", err);
    return { ok: false, error: GENERIC_ERROR };
  }
}

// ────────────────────────────────────────────────────────────
// consumeCalendarSpin — tour de roue offert par une case `spin`
// ────────────────────────────────────────────────────────────

/** Issue d'un tour de roue offert consommé, prête pour l'UI de la roue. */
export interface CalendarSpinOutcome {
  state: "spun" | "already_consumed" | "no_prize";
  wheelId: string | null;
  prizeId: string | null;
  isLosing: boolean;
  /** Index du lot dans la roue cible (animation), null si perdant/indispo. */
  prizeIndex: number | null;
  label: string | null;
  description: string | null;
  /** Gain non perdant : jeton signé à passer à claimPrize (flux GAIN-…). */
  claimToken: string | null;
}

interface SpinRow {
  wheelId: string;
  prizeId: string | null;
  isLosing: boolean;
}

/** Relit un spin (reprise already_consumed via resulting_spin_id). */
async function loadSpinRow(
  admin: ReturnType<typeof createAdminClient>,
  spinId: string,
): Promise<SpinRow | null> {
  const { data } = await admin
    .from("spins")
    .select("wheel_id, prize_id, is_losing")
    .eq("id", spinId)
    .maybeSingle();
  if (!data) return null;
  return {
    wheelId: data.wheel_id as string,
    prizeId: (data.prize_id as string | null) ?? null,
    isLosing: data.is_losing as boolean,
  };
}

/** Enrichit l'issue avec le libellé et l'index du lot dans la roue cible. */
async function enrichSpinPrize(
  admin: ReturnType<typeof createAdminClient>,
  wheelId: string | null,
  prizeId: string | null,
): Promise<{ prizeIndex: number | null; label: string | null; description: string | null }> {
  const empty = { prizeIndex: null, label: null, description: null };
  if (!wheelId || !prizeId) return empty;

  const { data } = await admin
    .from("prizes")
    .select("id, label, description, position, created_at")
    .eq("wheel_id", wheelId)
    .eq("is_active", true);
  const prizes = ((data as Array<{
    id: string;
    label: string;
    description: string;
    position: number;
    created_at: string;
  }> | null) ?? []).sort(
    (a, b) => a.position - b.position || a.created_at.localeCompare(b.created_at),
  );
  const idx = prizes.findIndex((p) => p.id === prizeId);
  if (idx < 0) return empty;
  return { prizeIndex: idx, label: prizes[idx].label, description: prizes[idx].description };
}

/**
 * Consomme un tour de roue offert (grant d'une case `spin`). Échange le
 * grant_token contre un tirage atomique sur la roue cible via
 * consume_calendar_spin_grant, puis, pour un gain non perdant, signe un jeton
 * claim (spin_id) rebranché sur le flux claimPrize existant (code GAIN-…). Le
 * player_key du spin étant le hash du cookie du calendrier, la reprise passe par
 * resulting_spin_id (état already_consumed). Miroir exact de consumeLoyaltySpin.
 */
export async function consumeCalendarSpin(input: {
  calendarId: string;
  grantToken: string;
}): Promise<ActionResult<CalendarSpinOutcome>> {
  const parsed = consumeCalendarSpinSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0].message };
  }

  // Sans cookie il n'y a rien à consommer : on sort avant toute requête, tout
  // compteur et toute instrumentation.
  const store = await cookies();
  const token = store.get(calendarTokenCookieName(parsed.data.calendarId))?.value;
  if (!token) return { ok: false, error: "Tour offert indisponible." };
  const tokenHash = hashPlayerToken(token);

  // PREMIER REMPART — clé d'IDENTITÉ (`failClosed` légitime), avant la RPC.
  if (
    !(await rateLimit(
      rateLimitBucket("calendar:player", parsed.data.calendarId, tokenHash),
      RATE_LIMITS.calendarPlayerAction,
      { failClosed: true },
    ))
  ) {
    return { ok: false, error: "Trop de tentatives. Patientez un instant." };
  }

  return monitored("calendar.consumeSpin", () =>
    consumeSpinInner(parsed.data, tokenHash),
  );
}

async function consumeSpinInner(
  parsed: { calendarId: string; grantToken: string },
  tokenHash: string,
): Promise<ActionResult<CalendarSpinOutcome>> {
  try {
    const ctx = await loadCalendarActionContext(parsed.calendarId);
    if (!ctx.ok) return { ok: false, error: "Tour offert indisponible." };

    // Clé PARTAGÉE (calendrier + IP) : fail-OPEN, observabilité seule.
    await observeCalendarPressure(parsed.calendarId, clientIpFromHeaders(await headers()));

    const { data, error } = await ctx.admin.rpc("consume_calendar_spin_grant", {
      p_calendar_id: parsed.calendarId,
      p_player_token_hash: tokenHash,
      p_grant_token: parsed.grantToken,
    });
    if (error) {
      reportError("calendar.consumeSpin", error.message);
      return { ok: false, error: GENERIC_ERROR };
    }

    const grant = mapCalendarSpinGrant(data);
    if (grant.state === "unavailable") {
      return { ok: false, error: "Tour offert indisponible." };
    }
    if (grant.state === "no_prize") {
      return {
        ok: true,
        data: {
          state: "no_prize",
          wheelId: grant.wheelId,
          prizeId: null,
          isLosing: false,
          prizeIndex: null,
          label: null,
          description: null,
          claimToken: null,
        },
      };
    }

    // spun / already_consumed : reconstruire l'issue à partir du spin.
    let wheelId = grant.wheelId;
    let prizeId = grant.prizeId;
    let isLosing = grant.isLosing;
    if (grant.state === "already_consumed" && grant.spinId) {
      const spin = await loadSpinRow(ctx.admin, grant.spinId);
      if (spin) {
        wheelId = spin.wheelId;
        prizeId = spin.prizeId;
        isLosing = spin.isLosing;
      }
    }

    const enriched = await enrichSpinPrize(ctx.admin, wheelId, prizeId);
    const claimToken =
      !isLosing && prizeId && grant.spinId ? signClaimToken(grant.spinId) : null;

    return {
      ok: true,
      data: {
        state: grant.state,
        wheelId,
        prizeId,
        isLosing,
        prizeIndex: enriched.prizeIndex,
        label: enriched.label,
        description: enriched.description,
        claimToken,
      },
    };
  } catch (err) {
    reportError("calendar.consumeSpin", err);
    return { ok: false, error: GENERIC_ERROR };
  }
}

// ────────────────────────────────────────────────────────────
// getCalendarState — repli polling (page suivable)
// ────────────────────────────────────────────────────────────

/**
 * Repli POLLING : renvoie l'état public d'un calendrier (page suivable). Passe le
 * hash du cookie du calendrier, s'il existe, pour la vue « moi » (cases ouvertes,
 * codes) ; le contenu d'une case non ouverte n'est jamais servi (invariant #2,
 * appliqué par calendar_public_state + mapping).
 */
export async function getCalendarState(input: {
  calendarId: string;
}): Promise<CalendarPublicState> {
  const parsed = getCalendarStateSchema.safeParse(input);
  if (!parsed.success) return mapCalendarPublicState(null);

  const ctx = await loadCalendarActionContext(parsed.data.calendarId);
  if (!ctx.ok) return mapCalendarPublicState(null);

  // Observabilité seule (clé partagée, jamais un refus) : le poll est fréquent et
  // légitime, on ne le bride pas.
  await observeCalendarPressure(
    parsed.data.calendarId,
    clientIpFromHeaders(await headers()),
  );

  const store = await cookies();
  const token = store.get(calendarTokenCookieName(parsed.data.calendarId))?.value;
  const tokenHash = token ? hashPlayerToken(token) : undefined;

  const { data, error } = await ctx.admin.rpc("calendar_public_state", {
    p_calendar_id: parsed.data.calendarId,
    p_player_token_hash: tokenHash,
  });
  if (error) {
    reportError("calendar.state", error.message);
    return mapCalendarPublicState(null);
  }
  return mapCalendarPublicState(data);
}

// ════════════════════════════════════════════════════════════
// Dashboard commerçant — calendriers (session + RLS éditeurs)
// ════════════════════════════════════════════════════════════

type EditorSupabase = Awaited<ReturnType<typeof createClient>>;

/**
 * (Re)génère la grille de cases d'un calendrier : pour chaque jour 1..day_count,
 * pose `unlock_at` = début du jour civil `start_date + (index-1)` dans le fuseau
 * du calendrier (SERVEUR-AUTORITATIF). Préserve le contenu des cases existantes
 * (seul unlock_at est réécrit) ; crée les cases manquantes en placeholder
 * `content` ; supprime les cases hors grille (index > day_count). Toutes les
 * écritures sont org-scopées (RLS éditeur + filtre explicite).
 */
async function syncCalendarDays(
  supabase: EditorSupabase,
  calendar: {
    id: string;
    organization_id: string;
    start_date: string;
    day_count: number;
    timezone: string;
  },
): Promise<void> {
  const { data: existing } = await supabase
    .from("calendar_days")
    .select("id, day_index")
    .eq("calendar_id", calendar.id)
    .eq("organization_id", calendar.organization_id);

  const byIndex = new Map<number, string>();
  for (const d of (existing ?? []) as Array<{ id: string; day_index: number }>) {
    byIndex.set(d.day_index, d.id);
  }

  const toInsert: Array<Record<string, unknown>> = [];
  for (let index = 1; index <= calendar.day_count; index += 1) {
    const unlockAt = calendarDayUnlockAt(
      calendar.start_date,
      index - 1,
      calendar.timezone,
    ).toISOString();
    const dayId = byIndex.get(index);
    if (dayId) {
      await supabase
        .from("calendar_days")
        .update({ unlock_at: unlockAt })
        .eq("id", dayId)
        .eq("organization_id", calendar.organization_id);
    } else {
      toInsert.push({
        calendar_id: calendar.id,
        organization_id: calendar.organization_id,
        day_index: index,
        unlock_at: unlockAt,
        content_type: "content",
      });
    }
  }
  if (toInsert.length > 0) {
    await supabase.from("calendar_days").insert(toInsert);
  }

  const removable = ((existing ?? []) as Array<{ id: string; day_index: number }>)
    .filter((d) => d.day_index > calendar.day_count)
    .map((d) => d.id);
  if (removable.length > 0) {
    await supabase
      .from("calendar_days")
      .delete()
      .in("id", removable)
      .eq("organization_id", calendar.organization_id);
  }
}

/**
 * Crée un calendrier (brouillon) avec des défauts sûrs et génère sa grille de
 * cases. La date de départ vaut aujourd'hui, la grille l'Avent (24 cases) — le
 * commerçant ajuste ensuite. timezone / public_slug sont posés par le trigger SQL
 * (service-authoritatifs) ; on relit le fuseau pour dériver les unlock_at.
 */
export async function createCalendar(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = createCalendarSchema.safeParse({ name: formData.get("name") });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0].message };
  }

  const { user, organization, role } = await getUserAndOrg();
  if (!user || !organization) redirect("/login");
  if (role !== "owner" && role !== "editor") return { ok: false, error: NOT_EDITOR };

  const supabase = await createClient();
  const today = new Date().toISOString().slice(0, 10);
  const { data: calendar, error } = await supabase
    .from("calendars")
    .insert({
      organization_id: organization.id,
      name: parsed.data.name,
      start_date: today,
      day_count: DEFAULT_DAY_COUNT,
      completion_reward_stock: 0,
      // timezone / public_slug OMIS : posés par le trigger calendars_set_defaults.
    })
    .select("id, start_date, timezone, day_count")
    .single();

  if (error || !calendar) {
    console.error("[calendar] create:", error?.message);
    return { ok: false, error: "Impossible de créer le calendrier" };
  }

  await syncCalendarDays(supabase, {
    id: calendar.id,
    organization_id: organization.id,
    start_date: calendar.start_date,
    day_count: calendar.day_count,
    timezone: calendar.timezone,
  });

  revalidatePath("/dashboard/calendar");
  redirect(`/dashboard/calendar/${calendar.id}`);
}

/**
 * Réglages d'un calendrier (nom, thème, date de départ, fuseau, nombre de cases,
 * slug, contenu marchand, récompense d'assiduité). Toute modification de
 * start_date / day_count / timezone re-génère la grille (unlock_at recalculés,
 * contenu des cases préservé).
 */
export async function updateCalendar(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = updateCalendarSchema.safeParse({
    id: formData.get("id"),
    name: formData.get("name"),
    theme: formData.get("theme"),
    start_date: formData.get("start_date"),
    timezone: formData.get("timezone") ?? "",
    day_count: formData.get("day_count"),
    public_slug: formData.get("public_slug") ?? "",
    merchant_content: formData.get("merchant_content") ?? "",
    completion_reward_label: formData.get("completion_reward_label") ?? "",
    completion_reward_details: formData.get("completion_reward_details") ?? "",
    completion_reward_stock: formData.get("completion_reward_stock") ?? "",
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0].message };
  }

  const { user, organization, role } = await getUserAndOrg();
  if (!user || !organization) redirect("/login");
  if (role !== "owner" && role !== "editor") return { ok: false, error: NOT_EDITOR };

  const { id } = parsed.data;
  const supabase = await createClient();

  // État courant (détection des changements de grille) — org-scopé.
  const { data: current } = await supabase
    .from("calendars")
    .select("start_date, day_count, timezone")
    .eq("id", id)
    .eq("organization_id", organization.id)
    .maybeSingle();
  if (!current) return { ok: false, error: "Calendrier introuvable" };

  // timezone : '' → on conserve le fuseau courant (la colonne est NOT NULL).
  const timezone = parsed.data.timezone ?? (current.timezone as string);

  const { error } = await supabase
    .from("calendars")
    .update({
      name: parsed.data.name,
      theme: parsed.data.theme,
      start_date: parsed.data.start_date,
      timezone,
      day_count: parsed.data.day_count,
      public_slug: parsed.data.public_slug ?? undefined,
      merchant_content: parsed.data.merchant_content || null,
      completion_reward_label: parsed.data.completion_reward_label,
      completion_reward_details: parsed.data.completion_reward_details || null,
      completion_reward_stock: parsed.data.completion_reward_stock,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("organization_id", organization.id);

  if (error) {
    if (error.code === "23505") {
      return { ok: false, error: "Cette URL publique est déjà utilisée" };
    }
    console.error("[calendar] update:", error.message);
    return { ok: false, error: "Mise à jour impossible" };
  }

  // Grille impactée ? → recalcul des unlock_at (contenu préservé).
  if (
    parsed.data.start_date !== current.start_date ||
    parsed.data.day_count !== current.day_count ||
    timezone !== current.timezone
  ) {
    await syncCalendarDays(supabase, {
      id,
      organization_id: organization.id,
      start_date: parsed.data.start_date,
      day_count: parsed.data.day_count,
      timezone,
    });
  }

  revalidatePath("/dashboard/calendar");
  revalidatePath(`/dashboard/calendar/${id}`);
  return { ok: true, data: undefined };
}

/** Calendrier prêt à l'activation ? Message d'erreur sinon (null = OK). */
function activationBlocker(
  dayCount: number,
  days: Array<{
    content_type: string;
    reward_stock: number | null;
    reward_label: string;
    target_wheel_id: string | null;
    content_text: string | null;
  }>,
): string | null {
  if (dayCount < 1) return "Le calendrier doit compter au moins une case.";
  if (days.length < 1) {
    return "Configurez les cases du calendrier avant de l'activer.";
  }
  for (const d of days) {
    if (d.content_type === "lot") {
      if (d.reward_stock === null) {
        return "Une case lot n'a pas de stock : indiquez le nombre de lots avant d'activer.";
      }
      if (!d.reward_label.trim()) {
        return "Une case lot n'a pas de libellé : renseignez le lot avant d'activer.";
      }
    }
    if (d.content_type === "spin" && !d.target_wheel_id) {
      return "Une case tour de roue n'a pas de roue : choisissez-la avant d'activer.";
    }
    if (d.content_type === "content" && !(d.content_text ?? "").trim()) {
      return "Une case message est vide : saisissez son texte avant d'activer.";
    }
  }
  return null;
}

/**
 * Change le statut d'un calendrier. L'activation exige le module actif et une
 * configuration cohérente (chaque case correctement renseignée selon son usage).
 */
export async function setCalendarStatus(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = setCalendarStatusSchema.safeParse({
    id: formData.get("id"),
    status: formData.get("status"),
  });
  if (!parsed.success) return { ok: false, error: "Données invalides" };

  const { user, organization, role } = await getUserAndOrg();
  if (!user || !organization) redirect("/login");
  if (role !== "owner" && role !== "editor") return { ok: false, error: NOT_EDITOR };

  const { id, status } = parsed.data;
  const supabase = await createClient();

  if (status !== "active") {
    const { error } = await supabase
      .from("calendars")
      .update({ status })
      .eq("id", id)
      .eq("organization_id", organization.id);
    if (error) {
      console.error("[calendar] status:", error.message);
      return { ok: false, error: "Mise à jour impossible" };
    }
    revalidatePath("/dashboard/calendar");
    revalidatePath(`/dashboard/calendar/${id}`);
    return { ok: true, data: undefined };
  }

  // Activation.
  if (!hasCalendarAccess(organization)) {
    return {
      ok: false,
      error: "Le module Calendrier n'est pas activé sur votre compte.",
    };
  }
  const { data: calendar } = await supabase
    .from("calendars")
    .select("id, day_count")
    .eq("id", id)
    .eq("organization_id", organization.id)
    .maybeSingle();
  if (!calendar) return { ok: false, error: "Calendrier introuvable" };

  const { data: days } = await supabase
    .from("calendar_days")
    .select("content_type, reward_stock, reward_label, target_wheel_id, content_text")
    .eq("calendar_id", id)
    .eq("organization_id", organization.id);

  const blocker = activationBlocker(
    calendar.day_count,
    (days ?? []) as Array<{
      content_type: string;
      reward_stock: number | null;
      reward_label: string;
      target_wheel_id: string | null;
      content_text: string | null;
    }>,
  );
  if (blocker) return { ok: false, error: blocker };

  const { error } = await supabase
    .from("calendars")
    .update({ status: "active" })
    .eq("id", id)
    .eq("organization_id", organization.id);
  if (error) {
    console.error("[calendar] activate:", error.message);
    return { ok: false, error: "Mise à jour impossible" };
  }

  revalidatePath("/dashboard/calendar");
  revalidatePath(`/dashboard/calendar/${id}`);
  return { ok: true, data: undefined };
}

export async function deleteCalendar(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = deleteCalendarSchema.safeParse({ id: formData.get("id") });
  if (!parsed.success) return { ok: false, error: "Données invalides" };

  const { user, organization, role } = await getUserAndOrg();
  if (!user || !organization) redirect("/login");
  if (role !== "owner" && role !== "editor") return { ok: false, error: NOT_EDITOR };

  const supabase = await createClient();
  const { error } = await supabase
    .from("calendars")
    .delete()
    .eq("id", parsed.data.id)
    .eq("organization_id", organization.id);

  if (error) {
    console.error("[calendar] delete:", error.message);
    return { ok: false, error: "Suppression impossible" };
  }

  revalidatePath("/dashboard/calendar");
  redirect("/dashboard/calendar");
}

// ── Cases (configuration d'une case existante de la grille) ──

/**
 * Champs d'une case normalisés selon l'usage (miroir des CHECK SQL
 * calendar_days_lot_stock_check / calendar_days_spin_wheel_check) : un lot porte
 * libellé/détails/stock et aucune roue ; un tour offert porte une roue et pas de
 * lot ; un message porte son texte. Écraser les champs hors-usage à null évite
 * une erreur SQL brute 23514.
 */
function dayFieldsForType(d: {
  content_type: "content" | "lot" | "spin";
  content_text: string;
  reward_label: string;
  reward_details: string;
  reward_stock: number | null;
  target_wheel_id: string | null;
  is_special: boolean;
}) {
  const isLot = d.content_type === "lot";
  const isSpin = d.content_type === "spin";
  const isContent = d.content_type === "content";
  return {
    content_type: d.content_type,
    content_text: isContent ? d.content_text || null : null,
    reward_label: isLot ? d.reward_label : "",
    reward_details: isLot ? d.reward_details || null : null,
    reward_stock: isLot ? d.reward_stock : null,
    target_wheel_id: isSpin ? d.target_wheel_id : null,
    is_special: d.is_special,
    updated_at: new Date().toISOString(),
  };
}

/** Vérifie qu'une roue cible existe DANS l'organisation (anti cross-tenant). */
async function wheelBelongsToOrg(
  supabase: EditorSupabase,
  wheelId: string,
  organizationId: string,
): Promise<boolean> {
  const { data } = await supabase
    .from("wheels")
    .select("id")
    .eq("id", wheelId)
    .eq("organization_id", organizationId)
    .maybeSingle();
  return Boolean(data);
}

/**
 * Configure une case existante de la grille (usage + contenu). day_index et
 * unlock_at ne sont PAS touchés : ils restent dérivés de la grille du calendrier
 * (gating serveur-autoritatif). Une roue de tour offert doit appartenir à l'org.
 */
export async function updateCalendarDay(input: {
  id: string;
  contentType: "content" | "lot" | "spin";
  contentText?: string;
  rewardLabel?: string;
  rewardDetails?: string;
  rewardStock?: string | number;
  targetWheelId?: string;
  isSpecial?: boolean;
}): Promise<ActionResult> {
  const parsed = updateCalendarDaySchema.safeParse({
    id: input.id,
    content_type: input.contentType,
    content_text: input.contentText ?? "",
    reward_label: input.rewardLabel ?? "",
    reward_details: input.rewardDetails ?? "",
    reward_stock: input.rewardStock ?? "",
    target_wheel_id: input.targetWheelId ?? "",
    is_special: input.isSpecial ?? false,
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0].message };
  }

  const { user, organization, role } = await getUserAndOrg();
  if (!user || !organization) redirect("/login");
  if (role !== "owner" && role !== "editor") return { ok: false, error: NOT_EDITOR };

  const supabase = await createClient();
  const { data: existing } = await supabase
    .from("calendar_days")
    .select("calendar_id")
    .eq("id", parsed.data.id)
    .eq("organization_id", organization.id)
    .maybeSingle();
  if (!existing) return { ok: false, error: "Case introuvable" };

  if (
    parsed.data.content_type === "spin" &&
    parsed.data.target_wheel_id &&
    !(await wheelBelongsToOrg(supabase, parsed.data.target_wheel_id, organization.id))
  ) {
    return { ok: false, error: "Roue introuvable dans votre organisation" };
  }

  const { error } = await supabase
    .from("calendar_days")
    .update(dayFieldsForType(parsed.data))
    .eq("id", parsed.data.id)
    .eq("organization_id", organization.id);

  if (error) {
    console.error("[calendar] update day:", error.message);
    return { ok: false, error: "Mise à jour impossible" };
  }

  revalidatePath(`/dashboard/calendar/${existing.calendar_id}`);
  return { ok: true, data: undefined };
}
