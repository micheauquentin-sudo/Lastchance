"use server";

import { revalidatePath } from "next/cache";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { getUserAndOrg } from "@/lib/auth";
import {
  mapEventJoin,
  mapEventPublicState,
  mapEventSubmit,
  mapEventTransition,
  type EventJoinResult,
  type EventPublicState,
  type EventSubmitResult,
} from "@/lib/event";
import {
  eventTokenCookieName,
  loadEventActionContext,
} from "@/lib/event-context";
import { broadcastEventRefresh } from "@/lib/event-realtime";
import { monitored, reportError } from "@/lib/monitoring";
import { generatePlayerToken, hashPlayerToken } from "@/lib/pronostics";
import {
  observeSharedKey,
  RATE_LIMITS,
  rateLimit,
  rateLimitBucket,
} from "@/lib/rate-limit";
import { clientIpFromHeaders } from "@/lib/request-ip";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import type { ActionResult } from "@/lib/utils";
import {
  createEventGameSchema,
  createEventQuestionSchema,
  createEventSessionSchema,
  deleteEventGameSchema,
  deleteEventQuestionSchema,
  deleteEventSessionSchema,
  eventStateSchema,
  eventSessionIdSchema,
  joinEventSchema,
  launchEventQuestionSchema,
  revealEventQuestionSchema,
  setEventGameStatusSchema,
  submitEventAnswerSchema,
  updateEventGameSchema,
  updateEventQuestionSchema,
  updateEventSessionSchema,
} from "@/lib/validations/events";

/** Durée de vie du cookie joueur d'une session (30 j : la soirée + rappels). */
const EVENT_COOKIE_MAX_AGE = 60 * 60 * 24 * 30;

const NOT_EDITOR = "Action non autorisée";
const GENERIC_ERROR = "Une erreur est survenue, réessayez.";

// ════════════════════════════════════════════════════════════
// Contrôle d'abus — principe de conception (ADR-032)
//
// join / submit sont des chemins PUBLICS servis derrière le Wi-Fi PARTAGÉ d'un
// bar : l'IP est commune à tous les joueurs. AUCUN seau `failClosed` ne porte
// donc sur une clé partagée (IP, session) — un tel seau deviendrait un
// interrupteur qu'un tiers allume en le saturant (« déni de participation d'une
// soirée entière »). Les clés partagées ne portent que des compteurs
// d'OBSERVABILITÉ fail-OPEN (`observeSharedKey`).
//
// Le `failClosed` reste légitime — et employé — sur une clé propre à UNE
// identité (hash du jeton joueur, `eventPlayerAction`) ou à UN opérateur
// authentifié (org + user.id, `eventRemote`) : la saturer ne coupe que son
// porteur.
//
// La borne réelle contre l'abus n'est pas un rate-limit : ce sont les
// contraintes d'unicité SQL (un joueur par session, une réponse par question,
// scoring serveur-autoritatif sur le temps) + le stock FINI obligatoire du lot.
// Fabriquer N cookies ne crée pas N lots (podium borné, unicité (session, rank)).
// ════════════════════════════════════════════════════════════

// ────────────────────────────────────────────────────────────
// Parcours public — join / submit / repli polling
// ────────────────────────────────────────────────────────────

/** Seau d'observabilité de la pression publique (clé partagée, jamais un refus). */
async function observeEventPressure(sessionId: string, ip: string): Promise<void> {
  await observeSharedKey(
    rateLimitBucket("event:public:ip", sessionId, ip),
    RATE_LIMITS.eventPublicIp,
    "event_public_pressure",
    { session_id: sessionId },
  );
}

/**
 * Rejoindre une session par son code (POST du bouton). Pose le cookie joueur
 * PAR SESSION (httpOnly, jamais renvoyé au client), appelle join_event_session
 * (idempotent : re-join = même joueur, pseudo/avatar rafraîchis) et renvoie
 * l'état sans aucune correction. Réponse générique `unavailable` si la session
 * n'est pas joignable (aucun oracle sur le motif).
 */
export async function joinEvent(input: {
  joinCode: string;
  pseudo: string;
  avatar?: string;
}): Promise<ActionResult<EventJoinResult>> {
  const parsed = joinEventSchema.safeParse({
    joinCode: input.joinCode,
    pseudo: input.pseudo,
    avatar: input.avatar ?? "",
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0].message };
  }

  // Résolution de la session par son code AVANT toute écriture : le cookie
  // d'identité est keyé par l'UUID de session, qu'on doit donc connaître pour le
  // réutiliser (re-scan = même identité). Une résolution vide ne trahit rien :
  // la RPC répond `unavailable` de toute façon.
  const admin = createAdminClient();
  const { data: sessionRow } = await admin
    .from("event_sessions")
    .select("id")
    .eq("join_code", parsed.data.joinCode)
    .maybeSingle();
  if (!sessionRow) {
    return { ok: true, data: mapEventJoin({ state: "unavailable" }) };
  }
  const sessionId = sessionRow.id as string;

  // Identité cookie PAR SESSION : réutilise le jeton existant (re-join), sinon en
  // génère un — posé seulement après un join réussi (plus bas), pour ne pas
  // laisser un cookie orphelin sur une session fermée.
  const store = await cookies();
  const cookieName = eventTokenCookieName(sessionId);
  const existing = store.get(cookieName)?.value;
  const token = existing ?? generatePlayerToken();
  const tokenHash = hashPlayerToken(token);

  // PREMIER REMPART — clé d'IDENTITÉ (`failClosed` légitime), avant la RPC.
  if (
    !(await rateLimit(
      rateLimitBucket("event:player", sessionId, tokenHash),
      RATE_LIMITS.eventPlayerAction,
      { failClosed: true },
    ))
  ) {
    return { ok: false, error: "Trop de tentatives. Patientez un instant." };
  }

  return monitored("event.join", () =>
    joinInner(parsed.data, sessionId, token, tokenHash, Boolean(existing)),
  );
}

async function joinInner(
  parsed: { joinCode: string; pseudo: string; avatar: string },
  sessionId: string,
  token: string,
  tokenHash: string,
  returning: boolean,
): Promise<ActionResult<EventJoinResult>> {
  try {
    const admin = createAdminClient();
    const ip = clientIpFromHeaders(await headers());
    await observeEventPressure(sessionId, ip);

    const { data, error } = await admin.rpc("join_event_session", {
      p_join_code: parsed.joinCode,
      p_player_token_hash: tokenHash,
      p_pseudo: parsed.pseudo,
      p_avatar: parsed.avatar,
    });
    if (error) {
      reportError("event.join", error.message);
      return { ok: false, error: GENERIC_ERROR };
    }

    const result = mapEventJoin(data);

    // Cookie posé UNIQUEMENT sur un join réussi : le joueur a désormais une ligne
    // event_players ; le jeton (jamais renvoyé au client) atteste son identité.
    if (result.state === "joined" && !returning) {
      const store = await cookies();
      store.set(eventTokenCookieName(sessionId), token, {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        path: "/",
        maxAge: EVENT_COOKIE_MAX_AGE,
      });
    }

    return { ok: true, data: result };
  } catch (err) {
    reportError("event.join", err);
    return { ok: false, error: GENERIC_ERROR };
  }
}

/**
 * Soumettre une réponse (POST du bouton). Le scoring est SERVEUR (calculé au
 * reveal en base) ; cette action ne renvoie QU'UN état neutre, JAMAIS la
 * justesse (invariant #1). Le jeton d'identité vient du cookie de session ;
 * absent → `not_joined` sans appel base.
 */
export async function submitEventAnswer(input: {
  sessionId: string;
  questionId: string;
  optionId: string;
}): Promise<ActionResult<EventSubmitResult>> {
  const parsed = submitEventAnswerSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0].message };
  }

  // Identité cookie PAR SESSION : sans elle, rien n'a été rejoint.
  const store = await cookies();
  const token = store.get(eventTokenCookieName(parsed.data.sessionId))?.value;
  if (!token) {
    return { ok: true, data: mapEventSubmit({ state: "not_joined" }) };
  }
  const tokenHash = hashPlayerToken(token);

  // PREMIER REMPART — clé d'IDENTITÉ (`failClosed` légitime), avant la RPC.
  if (
    !(await rateLimit(
      rateLimitBucket("event:player", parsed.data.sessionId, tokenHash),
      RATE_LIMITS.eventPlayerAction,
      { failClosed: true },
    ))
  ) {
    return { ok: false, error: "Trop de tentatives. Patientez un instant." };
  }

  return monitored("event.submit", () => submitInner(parsed.data, tokenHash));
}

async function submitInner(
  parsed: { sessionId: string; questionId: string; optionId: string },
  tokenHash: string,
): Promise<ActionResult<EventSubmitResult>> {
  try {
    const ctx = await loadEventActionContext(parsed.sessionId);
    if (!ctx.ok) {
      return { ok: true, data: mapEventSubmit({ state: "unavailable" }) };
    }

    const ip = clientIpFromHeaders(await headers());
    await observeEventPressure(parsed.sessionId, ip);

    const { data, error } = await ctx.admin.rpc("submit_event_answer", {
      p_session_id: parsed.sessionId,
      p_question_id: parsed.questionId,
      p_player_token_hash: tokenHash,
      p_option_id: parsed.optionId,
    });
    if (error) {
      reportError("event.submit", error.message);
      return { ok: false, error: GENERIC_ERROR };
    }

    const result = mapEventSubmit(data);

    // Une réponse RÉELLEMENT enregistrée change les compteurs (distribution) :
    // on diffuse un refresh pour que les écrans resynchronisent sans attendre le
    // prochain poll. Best-effort — le polling reste le filet.
    if (result.state === "recorded") {
      await broadcastEventRefresh(parsed.sessionId);
    }

    return { ok: true, data: result };
  } catch (err) {
    reportError("event.submit", err);
    return { ok: false, error: GENERIC_ERROR };
  }
}

/**
 * Repli POLLING : renvoie l'état public d'une session (écran / téléphone /
 * télécommande). C'est le FILET qui fonctionne même sans Realtime — l'UI
 * l'interroge toutes les ~2-3 s ET à chaque (re)connexion. Passe le hash du
 * cookie de session, s'il existe, pour la vue « moi » (score/rang/code) ; la
 * bonne réponse n'est jamais servie hors reveal (event_public_state + mapping).
 */
export async function getEventState(input: {
  sessionId: string;
}): Promise<EventPublicState> {
  const parsed = eventStateSchema.safeParse(input);
  if (!parsed.success) return mapEventPublicState(null);

  const ctx = await loadEventActionContext(parsed.data.sessionId);
  if (!ctx.ok) return mapEventPublicState(null);

  // Observabilité seule (clé partagée, jamais un refus) : le poll est fréquent
  // et légitime, on ne le bride pas.
  await observeEventPressure(
    parsed.data.sessionId,
    clientIpFromHeaders(await headers()),
  );

  const store = await cookies();
  const token = store.get(eventTokenCookieName(parsed.data.sessionId))?.value;
  const tokenHash = token ? hashPlayerToken(token) : undefined;

  const { data, error } = await ctx.admin.rpc("event_public_state", {
    p_session_id: parsed.data.sessionId,
    p_player_token_hash: tokenHash,
  });
  if (error) {
    reportError("event.state", error.message);
    return mapEventPublicState(null);
  }
  return mapEventPublicState(data);
}

// ════════════════════════════════════════════════════════════
// Télécommande organisateur — machine à états (authentifié owner/editor)
// ════════════════════════════════════════════════════════════

/** Garde commune : owner/editor + seau opérateur + session dans l'org active. */
async function authorizeRemote(
  sessionId: string,
): Promise<
  | { ok: false; error: string }
  | { ok: true; organizationId: string; admin: ReturnType<typeof createAdminClient> }
> {
  const { user, organization, role } = await getUserAndOrg();
  if (!user || !organization) redirect("/login");
  if (role !== "owner" && role !== "editor") return { ok: false, error: NOT_EDITOR };

  // Clé d'OPÉRATEUR authentifié (jamais partagée) : `failClosed` légitime.
  const allowed = await rateLimit(
    rateLimitBucket("event:remote", organization.id, user.id),
    RATE_LIMITS.eventRemote,
    { failClosed: true },
  );
  if (!allowed) return { ok: false, error: "Trop de tentatives, patientez." };

  // Multi-tenant : la session doit appartenir à l'organisation active.
  const supabase = await createClient();
  const { data: session } = await supabase
    .from("event_sessions")
    .select("id")
    .eq("id", sessionId)
    .eq("organization_id", organization.id)
    .maybeSingle();
  if (!session) return { ok: false, error: "Session introuvable" };

  return { ok: true, organizationId: organization.id, admin: createAdminClient() };
}

/** Issue d'une transition : état typé + diffusion best-effort. */
type EventTransitionActionResult = ActionResult<{ state: string }>;

async function runTransition(
  sessionId: string,
  run: (
    admin: ReturnType<typeof createAdminClient>,
    organizationId: string,
  ) => PromiseLike<{ data: unknown; error: { message: string } | null }>,
  scope: string,
): Promise<EventTransitionActionResult> {
  const guard = await authorizeRemote(sessionId);
  if (!guard.ok) return { ok: false, error: guard.error };

  try {
    const { data, error } = await run(guard.admin, guard.organizationId);
    if (error) {
      reportError(scope, error.message);
      return { ok: false, error: GENERIC_ERROR };
    }
    const result = mapEventTransition(data);
    if (result.state !== "ok") {
      return { ok: false, error: "Transition impossible dans l'état actuel." };
    }

    // À chaque transition : diffusion d'un refresh (best-effort) pour que les
    // trois interfaces resynchronisent immédiatement. Le polling reste le filet.
    await broadcastEventRefresh(sessionId);
    return { ok: true, data: { state: result.state } };
  } catch (err) {
    reportError(scope, err);
    return { ok: false, error: GENERIC_ERROR };
  }
}

export async function startEventSession(input: {
  sessionId: string;
}): Promise<EventTransitionActionResult> {
  const parsed = eventSessionIdSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Données invalides" };
  return runTransition(
    parsed.data.sessionId,
    (admin, organizationId) =>
      admin.rpc("start_event_session", {
        p_organization_id: organizationId,
        p_session_id: parsed.data.sessionId,
      }),
    "event.start",
  );
}

export async function launchEventQuestion(input: {
  sessionId: string;
  questionId: string;
}): Promise<EventTransitionActionResult> {
  const parsed = launchEventQuestionSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Données invalides" };
  return runTransition(
    parsed.data.sessionId,
    (admin, organizationId) =>
      admin.rpc("launch_event_question", {
        p_organization_id: organizationId,
        p_session_id: parsed.data.sessionId,
        p_question_id: parsed.data.questionId,
      }),
    "event.launch",
  );
}

export async function lockEventQuestion(input: {
  sessionId: string;
}): Promise<EventTransitionActionResult> {
  const parsed = eventSessionIdSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Données invalides" };
  return runTransition(
    parsed.data.sessionId,
    (admin, organizationId) =>
      admin.rpc("lock_event_question", {
        p_organization_id: organizationId,
        p_session_id: parsed.data.sessionId,
      }),
    "event.lock",
  );
}

export async function revealEventQuestion(input: {
  sessionId: string;
  correctOptionId?: string;
}): Promise<EventTransitionActionResult> {
  const parsed = revealEventQuestionSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Données invalides" };
  return runTransition(
    parsed.data.sessionId,
    (admin, organizationId) =>
      admin.rpc("reveal_event_question", {
        p_organization_id: organizationId,
        p_session_id: parsed.data.sessionId,
        p_correct_option_id: parsed.data.correctOptionId,
      }),
    "event.reveal",
  );
}

export async function showEventLeaderboard(input: {
  sessionId: string;
}): Promise<EventTransitionActionResult> {
  const parsed = eventSessionIdSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Données invalides" };
  return runTransition(
    parsed.data.sessionId,
    (admin, organizationId) =>
      admin.rpc("show_event_leaderboard", {
        p_organization_id: organizationId,
        p_session_id: parsed.data.sessionId,
      }),
    "event.leaderboard",
  );
}

export async function endEventSession(input: {
  sessionId: string;
}): Promise<EventTransitionActionResult> {
  const parsed = eventSessionIdSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Données invalides" };
  return runTransition(
    parsed.data.sessionId,
    (admin, organizationId) =>
      admin.rpc("end_event_session", {
        p_organization_id: organizationId,
        p_session_id: parsed.data.sessionId,
      }),
    "event.end",
  );
}

// ════════════════════════════════════════════════════════════
// Dashboard commerçant — CRUD contenu (session + RLS éditeurs)
// ════════════════════════════════════════════════════════════

export async function createEventGame(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = createEventGameSchema.safeParse({ name: formData.get("name") });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };

  const { user, organization, role } = await getUserAndOrg();
  if (!user || !organization) redirect("/login");
  if (role !== "owner" && role !== "editor") return { ok: false, error: NOT_EDITOR };

  const supabase = await createClient();
  const { data: game, error } = await supabase
    .from("event_games")
    .insert({ organization_id: organization.id, name: parsed.data.name })
    .select("id")
    .single();

  if (error || !game) {
    console.error("[events] create game:", error?.message);
    return { ok: false, error: "Impossible de créer le jeu" };
  }

  revalidatePath("/dashboard/events");
  redirect(`/dashboard/events/${game.id}`);
}

export async function updateEventGame(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = updateEventGameSchema.safeParse({
    id: formData.get("id"),
    name: formData.get("name"),
  });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };

  const { user, organization, role } = await getUserAndOrg();
  if (!user || !organization) redirect("/login");
  if (role !== "owner" && role !== "editor") return { ok: false, error: NOT_EDITOR };

  const supabase = await createClient();
  const { error } = await supabase
    .from("event_games")
    .update({ name: parsed.data.name })
    .eq("id", parsed.data.id)
    .eq("organization_id", organization.id);

  if (error) {
    console.error("[events] update game:", error.message);
    return { ok: false, error: "Mise à jour impossible" };
  }

  revalidatePath("/dashboard/events");
  revalidatePath(`/dashboard/events/${parsed.data.id}`);
  return { ok: true, data: undefined };
}

/**
 * Change le statut d'un jeu (brouillon / actif / archivé). L'activation exige le
 * module actif et au moins une question (mêmes gardes que les autres modules).
 */
export async function setEventGameStatus(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = setEventGameStatusSchema.safeParse({
    id: formData.get("id"),
    status: formData.get("status"),
  });
  if (!parsed.success) return { ok: false, error: "Données invalides" };

  const { user, organization, role } = await getUserAndOrg();
  if (!user || !organization) redirect("/login");
  if (role !== "owner" && role !== "editor") return { ok: false, error: NOT_EDITOR };

  const { id, status } = parsed.data;
  const supabase = await createClient();

  if (status === "active") {
    // Import dynamique : la garde d'abonnement n'a pas à être chargée pour les
    // transitions non-activantes (miroir loyalty/jackpot).
    const { hasEventsAccess } = await import("@/lib/subscription");
    if (!hasEventsAccess(organization)) {
      return {
        ok: false,
        error: "Le module Mode événement n'est pas activé sur votre compte.",
      };
    }
    const { data: game } = await supabase
      .from("event_games")
      .select("id")
      .eq("id", id)
      .eq("organization_id", organization.id)
      .maybeSingle();
    if (!game) return { ok: false, error: "Jeu introuvable" };

    const { count } = await supabase
      .from("event_questions")
      .select("id", { count: "exact", head: true })
      .eq("game_id", id)
      .eq("organization_id", organization.id);
    if ((count ?? 0) < 1) {
      return { ok: false, error: "Ajoutez au moins une question avant d'activer le jeu." };
    }
  }

  const { error } = await supabase
    .from("event_games")
    .update({ status })
    .eq("id", id)
    .eq("organization_id", organization.id);

  if (error) {
    console.error("[events] game status:", error.message);
    return { ok: false, error: "Mise à jour impossible" };
  }

  revalidatePath("/dashboard/events");
  revalidatePath(`/dashboard/events/${id}`);
  return { ok: true, data: undefined };
}

export async function deleteEventGame(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = deleteEventGameSchema.safeParse({ id: formData.get("id") });
  if (!parsed.success) return { ok: false, error: "Données invalides" };

  const { user, organization, role } = await getUserAndOrg();
  if (!user || !organization) redirect("/login");
  if (role !== "owner" && role !== "editor") return { ok: false, error: NOT_EDITOR };

  const supabase = await createClient();
  const { error } = await supabase
    .from("event_games")
    .delete()
    .eq("id", parsed.data.id)
    .eq("organization_id", organization.id);

  if (error) {
    console.error("[events] delete game:", error.message);
    return { ok: false, error: "Suppression impossible" };
  }

  revalidatePath("/dashboard/events");
  redirect("/dashboard/events");
}

// ── Questions + options (nested) ──

/**
 * Réécrit l'ensemble des options d'une question dans une transaction logique :
 * suppression puis réinsertion ordonnée. La cohérence type ↔ corrections est
 * déjà validée par le schéma Zod (quiz = 1 correcte, poll/prono = 0). Toutes les
 * écritures sont org-scopées (RLS éditeur + filtre explicite).
 */
async function rewriteQuestionOptions(
  supabase: Awaited<ReturnType<typeof createClient>>,
  questionId: string,
  organizationId: string,
  options: Array<{ label: string; is_correct: boolean }>,
): Promise<{ error: string | null }> {
  const { error: delError } = await supabase
    .from("event_question_options")
    .delete()
    .eq("question_id", questionId)
    .eq("organization_id", organizationId);
  if (delError) return { error: delError.message };

  const { error: insError } = await supabase.from("event_question_options").insert(
    options.map((o, index) => ({
      question_id: questionId,
      organization_id: organizationId,
      position: index,
      label: o.label,
      is_correct: o.is_correct,
    })),
  );
  return { error: insError?.message ?? null };
}

export async function createEventQuestion(input: {
  gameId: string;
  questionType: "quiz" | "poll" | "prono";
  prompt: string;
  timeLimitSeconds: number;
  pointsBase: number;
  options: Array<{ label: string; is_correct: boolean }>;
}): Promise<ActionResult<{ id: string }>> {
  const parsed = createEventQuestionSchema.safeParse({
    game_id: input.gameId,
    question_type: input.questionType,
    prompt: input.prompt,
    time_limit_seconds: input.timeLimitSeconds,
    points_base: input.pointsBase,
    options: input.options,
  });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };

  const { user, organization, role } = await getUserAndOrg();
  if (!user || !organization) redirect("/login");
  if (role !== "owner" && role !== "editor") return { ok: false, error: NOT_EDITOR };

  const supabase = await createClient();
  const { data: game } = await supabase
    .from("event_games")
    .select("id")
    .eq("id", parsed.data.game_id)
    .eq("organization_id", organization.id)
    .maybeSingle();
  if (!game) return { ok: false, error: "Jeu introuvable" };

  // Position = fin de liste.
  const { data: existing } = await supabase
    .from("event_questions")
    .select("position")
    .eq("game_id", parsed.data.game_id)
    .eq("organization_id", organization.id);
  const position =
    Math.max(0, ...(existing ?? []).map((q) => (q.position as number) ?? 0)) +
    ((existing?.length ?? 0) > 0 ? 1 : 0);

  const { data: question, error } = await supabase
    .from("event_questions")
    .insert({
      game_id: parsed.data.game_id,
      organization_id: organization.id,
      position,
      question_type: parsed.data.question_type,
      prompt: parsed.data.prompt,
      time_limit_seconds: parsed.data.time_limit_seconds,
      points_base: parsed.data.points_base,
    })
    .select("id")
    .single();
  if (error || !question) {
    console.error("[events] create question:", error?.message);
    return { ok: false, error: "Impossible d'ajouter la question" };
  }

  const { error: optError } = await rewriteQuestionOptions(
    supabase,
    question.id,
    organization.id,
    parsed.data.options,
  );
  if (optError) {
    // Rollback best-effort : la question sans option est inutilisable.
    await supabase
      .from("event_questions")
      .delete()
      .eq("id", question.id)
      .eq("organization_id", organization.id);
    console.error("[events] create question options:", optError);
    return { ok: false, error: "Impossible d'enregistrer les options" };
  }

  revalidatePath(`/dashboard/events/${parsed.data.game_id}`);
  return { ok: true, data: { id: question.id } };
}

export async function updateEventQuestion(input: {
  id: string;
  questionType: "quiz" | "poll" | "prono";
  prompt: string;
  timeLimitSeconds: number;
  pointsBase: number;
  options: Array<{ label: string; is_correct: boolean }>;
}): Promise<ActionResult> {
  const parsed = updateEventQuestionSchema.safeParse({
    id: input.id,
    question_type: input.questionType,
    prompt: input.prompt,
    time_limit_seconds: input.timeLimitSeconds,
    points_base: input.pointsBase,
    options: input.options,
  });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };

  const { user, organization, role } = await getUserAndOrg();
  if (!user || !organization) redirect("/login");
  if (role !== "owner" && role !== "editor") return { ok: false, error: NOT_EDITOR };

  const supabase = await createClient();
  const { data: existing } = await supabase
    .from("event_questions")
    .select("game_id")
    .eq("id", parsed.data.id)
    .eq("organization_id", organization.id)
    .maybeSingle();
  if (!existing) return { ok: false, error: "Question introuvable" };

  const { error } = await supabase
    .from("event_questions")
    .update({
      question_type: parsed.data.question_type,
      prompt: parsed.data.prompt,
      time_limit_seconds: parsed.data.time_limit_seconds,
      points_base: parsed.data.points_base,
    })
    .eq("id", parsed.data.id)
    .eq("organization_id", organization.id);
  if (error) {
    console.error("[events] update question:", error.message);
    return { ok: false, error: "Mise à jour impossible" };
  }

  const { error: optError } = await rewriteQuestionOptions(
    supabase,
    parsed.data.id,
    organization.id,
    parsed.data.options,
  );
  if (optError) {
    console.error("[events] update question options:", optError);
    return { ok: false, error: "Impossible d'enregistrer les options" };
  }

  revalidatePath(`/dashboard/events/${existing.game_id}`);
  return { ok: true, data: undefined };
}

export async function deleteEventQuestion(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = deleteEventQuestionSchema.safeParse({ id: formData.get("id") });
  if (!parsed.success) return { ok: false, error: "Données invalides" };

  const { user, organization, role } = await getUserAndOrg();
  if (!user || !organization) redirect("/login");
  if (role !== "owner" && role !== "editor") return { ok: false, error: NOT_EDITOR };

  const supabase = await createClient();
  const { data: question } = await supabase
    .from("event_questions")
    .select("game_id")
    .eq("id", parsed.data.id)
    .eq("organization_id", organization.id)
    .maybeSingle();
  if (!question) return { ok: false, error: "Question introuvable" };

  const { error } = await supabase
    .from("event_questions")
    .delete()
    .eq("id", parsed.data.id)
    .eq("organization_id", organization.id);
  if (error) {
    console.error("[events] delete question:", error.message);
    return { ok: false, error: "Suppression impossible" };
  }

  revalidatePath(`/dashboard/events/${question.game_id}`);
  return { ok: true, data: undefined };
}

// ── Sessions (déroulé live d'un game) ──

/**
 * Crée une session (un déroulé live d'un game). GOTCHA : le join_code est posé
 * par le trigger SQL (SECURITY DEFINER) ; on insère en SERVICE ROLE SANS
 * join_code, la génération étant service-authoritative. La cohérence tenant est
 * vérifiée explicitement (le game doit appartenir à l'organisation active) — la
 * service role contourne la RLS, ce contrôle n'est donc pas optionnel.
 */
export async function createEventSession(
  input: {
    gameId: string;
    label?: string;
    rewardLabel?: string;
    rewardDetails?: string;
    rewardStock?: string | number;
  },
): Promise<ActionResult<{ id: string }>> {
  const parsed = createEventSessionSchema.safeParse({
    game_id: input.gameId,
    label: input.label ?? "",
    reward_label: input.rewardLabel ?? "",
    reward_details: input.rewardDetails ?? "",
    reward_stock: input.rewardStock ?? "",
  });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };

  const { user, organization, role } = await getUserAndOrg();
  if (!user || !organization) redirect("/login");
  if (role !== "owner" && role !== "editor") return { ok: false, error: NOT_EDITOR };

  const admin = createAdminClient();
  // Multi-tenant : la service role contourne la RLS → on vérifie le game.
  const { data: game } = await admin
    .from("event_games")
    .select("id")
    .eq("id", parsed.data.game_id)
    .eq("organization_id", organization.id)
    .maybeSingle();
  if (!game) return { ok: false, error: "Jeu introuvable" };

  const { data: session, error } = await admin
    .from("event_sessions")
    .insert({
      game_id: parsed.data.game_id,
      organization_id: organization.id,
      label: parsed.data.label || null,
      reward_label: parsed.data.reward_label,
      reward_details: parsed.data.reward_details || null,
      reward_stock: parsed.data.reward_stock,
      // join_code OMIS : posé par le trigger event_sessions_set_join_code.
    })
    .select("id")
    .single();
  if (error || !session) {
    console.error("[events] create session:", error?.message);
    return { ok: false, error: "Impossible de créer la session" };
  }

  revalidatePath(`/dashboard/events/${parsed.data.game_id}`);
  return { ok: true, data: { id: session.id } };
}

export async function updateEventSession(input: {
  id: string;
  label?: string;
  rewardLabel?: string;
  rewardDetails?: string;
  rewardStock?: string | number;
}): Promise<ActionResult> {
  const parsed = updateEventSessionSchema.safeParse({
    id: input.id,
    label: input.label ?? "",
    reward_label: input.rewardLabel ?? "",
    reward_details: input.rewardDetails ?? "",
    reward_stock: input.rewardStock ?? "",
  });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };

  const { user, organization, role } = await getUserAndOrg();
  if (!user || !organization) redirect("/login");
  if (role !== "owner" && role !== "editor") return { ok: false, error: NOT_EDITOR };

  // label / reward_* sont les seules colonnes accordées à authenticated en
  // update (les colonnes de la machine à états sont RPC-only) : on passe par la
  // RLS éditeur.
  const supabase = await createClient();
  const { error } = await supabase
    .from("event_sessions")
    .update({
      label: parsed.data.label || null,
      reward_label: parsed.data.reward_label,
      reward_details: parsed.data.reward_details || null,
      reward_stock: parsed.data.reward_stock,
    })
    .eq("id", parsed.data.id)
    .eq("organization_id", organization.id);
  if (error) {
    console.error("[events] update session:", error.message);
    return { ok: false, error: "Mise à jour impossible" };
  }

  revalidatePath(`/dashboard/events/sessions/${parsed.data.id}`);
  return { ok: true, data: undefined };
}

export async function deleteEventSession(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = deleteEventSessionSchema.safeParse({ id: formData.get("id") });
  if (!parsed.success) return { ok: false, error: "Données invalides" };

  const { user, organization, role } = await getUserAndOrg();
  if (!user || !organization) redirect("/login");
  if (role !== "owner" && role !== "editor") return { ok: false, error: NOT_EDITOR };

  const supabase = await createClient();
  const { error } = await supabase
    .from("event_sessions")
    .delete()
    .eq("id", parsed.data.id)
    .eq("organization_id", organization.id);
  if (error) {
    console.error("[events] delete session:", error.message);
    return { ok: false, error: "Suppression impossible" };
  }

  revalidatePath("/dashboard/events");
  return { ok: true, data: undefined };
}
