import "server-only";

import { cookies } from "next/headers";
import { getUserAndOrg } from "@/lib/auth";
import { mapEventPublicState, type EventPublicState } from "@/lib/event";
import { hashPlayerToken } from "@/lib/pronostics";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { hasEventsAccess } from "@/lib/subscription";
import type {
  EventQuestionType,
  EventSessionPhase,
  EventSessionStatus,
  Organization,
} from "@/types/database";

/** Erreur générique unique : aucun oracle sur l'existence/l'état interne. */
const UNAVAILABLE = "Cet événement n'est pas disponible.";

/** UUID canonique (pour distinguer un id d'un join_code à la résolution). */
const UUID_PATTERN =
  /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

/** Nom du cookie httpOnly portant le jeton joueur d'une SESSION. */
export function eventTokenCookieName(sessionId: string): string {
  return `lc-event-${sessionId}`;
}

type PublicEventOrganization = Pick<
  Organization,
  | "id"
  | "name"
  | "logo_url"
  | "subscription_status"
  | "trial_ends_at"
  | "past_due_since"
  | "addon_events"
  | "comp_access"
  | "comp_access_until"
  | "timezone"
>;

const ORG_COLUMNS =
  "id, name, logo_url, subscription_status, trial_ends_at, past_due_since, addon_events, comp_access, comp_access_until, timezone";

export type EventPublicContext =
  | { ok: false; error: string }
  | {
      ok: true;
      sessionId: string;
      joinCode: string;
      organization: PublicEventOrganization;
      /** État public complet (déjà filtré : aucune correction hors reveal). */
      publicState: EventPublicState;
      /** Le visiteur a-t-il déjà une identité de joueur sur cette session ? */
      hasIdentity: boolean;
    };

/**
 * Résout une session par son UUID ou son join_code (service role + garde
 * inter-tenant), vérifie le module + l'abonnement, puis charge l'état public via
 * event_public_state. Identité cookie PAR SESSION en LECTURE SEULE : rien n'est
 * posé ici (le cookie est écrit par joinEvent) ; s'il existe, son hash alimente
 * la vue « moi » (score/rang/code) sans jamais quitter le serveur. Réponse
 * générique unique en cas d'invalidité (404 côté page) — pas d'oracle.
 *
 * Sessions non joignables du grand public (draft / archived) : masquées comme
 * inexistantes. lobby / live / ended restent suivables (podium à l'écran).
 */
export async function loadEventPublicContext(
  joinCodeOrSessionId: string,
): Promise<EventPublicContext> {
  const admin = createAdminClient();

  const query = admin
    .from("event_sessions")
    .select(`id, join_code, status, organization_id, organizations(${ORG_COLUMNS})`);
  const { data } = UUID_PATTERN.test(joinCodeOrSessionId)
    ? await query.eq("id", joinCodeOrSessionId).maybeSingle()
    : await query
        .eq("join_code", joinCodeOrSessionId.trim().toUpperCase())
        .maybeSingle();
  if (!data) return { ok: false, error: UNAVAILABLE };

  const row = data as unknown as {
    id: string;
    join_code: string;
    status: EventSessionStatus;
    organization_id: string;
    organizations: PublicEventOrganization | null;
  };
  const org = row.organizations;
  // La service role contourne la RLS : chaque relation doit pointer le même
  // tenant, sinon on refuse (incohérence = 404 générique).
  if (!org || org.id !== row.organization_id) {
    console.error("[event-context] organisation incohérente", { joinCodeOrSessionId });
    return { ok: false, error: UNAVAILABLE };
  }
  if (!hasEventsAccess(org)) return { ok: false, error: UNAVAILABLE };
  if (row.status === "draft" || row.status === "archived") {
    return { ok: false, error: UNAVAILABLE };
  }

  // Identité cookie PAR SESSION, lecture seule (le hash ne quitte pas le
  // serveur ; le jeton non plus).
  const store = await cookies();
  const token = store.get(eventTokenCookieName(row.id))?.value;
  const tokenHash = token ? hashPlayerToken(token) : undefined;

  const { data: stateRaw, error } = await admin.rpc("event_public_state", {
    p_session_id: row.id,
    p_player_token_hash: tokenHash,
  });
  if (error) {
    console.error("[event-context] public state", error.message);
    return { ok: false, error: UNAVAILABLE };
  }

  const publicState = mapEventPublicState(stateRaw);
  if (publicState.state !== "ok") return { ok: false, error: UNAVAILABLE };

  return {
    ok: true,
    sessionId: row.id,
    joinCode: row.join_code,
    organization: org,
    publicState,
    hasIdentity: Boolean(token),
  };
}

// ────────────────────────────────────────────────────────────
// Télécommande organisateur (authentifié owner/editor)
// ────────────────────────────────────────────────────────────

/** Option côté organisateur : is_correct INCLUS (membre de l'org, jamais public). */
export interface EventRemoteOption {
  id: string;
  label: string;
  position: number;
  isCorrect: boolean;
}

export interface EventRemoteQuestion {
  id: string;
  position: number;
  questionType: EventQuestionType;
  prompt: string;
  timeLimitSeconds: number;
  pointsBase: number;
  options: EventRemoteOption[];
  /** Cette question a-t-elle déjà été jouée dans la session (réponses en base) ? */
  alreadyPlayed: boolean;
}

export interface EventRemoteSession {
  id: string;
  gameId: string;
  label: string | null;
  joinCode: string;
  status: EventSessionStatus;
  phase: EventSessionPhase;
  currentQuestionId: string | null;
  currentQuestionStartedAt: string | null;
  pronoCorrectOptionId: string | null;
  rewardLabel: string;
  rewardStock: number;
  rewardClaimedCount: number;
}

export type EventRemoteContext =
  | { ok: false; error: string }
  | {
      ok: true;
      organizationId: string;
      session: EventRemoteSession;
      /** Questions du game, triées par position, avec corrections (org-scopé). */
      questions: EventRemoteQuestion[];
    };

/**
 * Contexte de la télécommande organisateur : session + questions du game pour
 * piloter la machine à états. AUTHENTIFIÉ (owner/editor), org-scopé via la RLS.
 * is_correct EST inclus (l'organisateur en a besoin pour piloter) — ce chemin
 * n'est jamais public, la RLS is_org_member le garantit. 404 générique sinon.
 */
export async function loadEventRemoteContext(
  sessionId: string,
): Promise<EventRemoteContext> {
  const { user, organization, role } = await getUserAndOrg();
  if (!user || !organization) return { ok: false, error: UNAVAILABLE };
  if (role !== "owner" && role !== "editor") return { ok: false, error: UNAVAILABLE };

  const supabase = await createClient();
  const { data: sessionRow } = await supabase
    .from("event_sessions")
    .select(
      "id, game_id, label, join_code, status, phase, current_question_id, current_question_started_at, prono_correct_option_id, reward_label, reward_stock, reward_claimed_count",
    )
    .eq("id", sessionId)
    .eq("organization_id", organization.id)
    .maybeSingle();
  if (!sessionRow) return { ok: false, error: UNAVAILABLE };

  // Questions + options du game (org-scopé RLS), + réponses existantes pour
  // marquer les questions déjà jouées (une question ne se relance pas).
  const [{ data: questionRows }, { data: optionRows }, { data: answeredRows }] =
    await Promise.all([
      supabase
        .from("event_questions")
        .select("id, position, question_type, prompt, time_limit_seconds, points_base")
        .eq("game_id", sessionRow.game_id)
        .eq("organization_id", organization.id)
        .order("position", { ascending: true }),
      supabase
        .from("event_question_options")
        .select("id, question_id, position, label, is_correct")
        .eq("organization_id", organization.id),
      supabase
        .from("event_answers")
        .select("question_id")
        .eq("session_id", sessionId)
        .eq("organization_id", organization.id),
    ]);

  const optionsByQuestion = new Map<string, EventRemoteOption[]>();
  for (const o of (optionRows ?? []) as Array<{
    id: string;
    question_id: string;
    position: number;
    label: string;
    is_correct: boolean;
  }>) {
    const list = optionsByQuestion.get(o.question_id) ?? [];
    list.push({ id: o.id, label: o.label, position: o.position, isCorrect: o.is_correct });
    optionsByQuestion.set(o.question_id, list);
  }
  for (const list of optionsByQuestion.values()) {
    list.sort((a, b) => a.position - b.position);
  }

  const playedQuestionIds = new Set(
    ((answeredRows ?? []) as Array<{ question_id: string }>).map((r) => r.question_id),
  );

  const questions: EventRemoteQuestion[] = (
    (questionRows ?? []) as Array<{
      id: string;
      position: number;
      question_type: EventQuestionType;
      prompt: string;
      time_limit_seconds: number;
      points_base: number;
    }>
  ).map((q) => ({
    id: q.id,
    position: q.position,
    questionType: q.question_type,
    prompt: q.prompt,
    timeLimitSeconds: q.time_limit_seconds,
    pointsBase: q.points_base,
    options: optionsByQuestion.get(q.id) ?? [],
    alreadyPlayed: playedQuestionIds.has(q.id),
  }));

  return {
    ok: true,
    organizationId: organization.id,
    session: {
      id: sessionRow.id,
      gameId: sessionRow.game_id,
      label: sessionRow.label,
      joinCode: sessionRow.join_code,
      status: sessionRow.status as EventSessionStatus,
      phase: sessionRow.phase as EventSessionPhase,
      currentQuestionId: sessionRow.current_question_id,
      currentQuestionStartedAt: sessionRow.current_question_started_at,
      pronoCorrectOptionId: sessionRow.prono_correct_option_id,
      rewardLabel: sessionRow.reward_label,
      rewardStock: sessionRow.reward_stock,
      rewardClaimedCount: sessionRow.reward_claimed_count,
    },
    questions,
  };
}

/**
 * Contexte MINIMAL d'une action publique (join/submit) : session résolue par son
 * UUID, module + statut vérifiés côté service role, rien de plus. Le join est
 * résolu par join_code directement dans la RPC join_event_session ; ce contexte
 * ne sert qu'aux actions qui reçoivent déjà un sessionId (submit, getEventState).
 */
export type EventActionContext =
  | { ok: false }
  | { ok: true; admin: ReturnType<typeof createAdminClient>; sessionId: string };

/**
 * Résout et vérifie une session pour une action publique par sessionId. Une
 * seule requête (session + organisation) précède l'appel RPC — pas
 * d'amplification de lecture sur un chemin ouvert à Internet. Module coupé,
 * session inexistante, draft/archived → échec générique sans oracle.
 */
export async function loadEventActionContext(
  sessionId: string,
): Promise<EventActionContext> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("event_sessions")
    .select(`id, status, organization_id, organizations(${ORG_COLUMNS})`)
    .eq("id", sessionId)
    .maybeSingle();
  if (!data) return { ok: false };

  const row = data as unknown as {
    id: string;
    status: EventSessionStatus;
    organization_id: string;
    organizations: PublicEventOrganization | null;
  };
  const org = row.organizations;
  if (!org || org.id !== row.organization_id) return { ok: false };
  if (!hasEventsAccess(org)) return { ok: false };
  if (row.status === "draft" || row.status === "archived") return { ok: false };

  return { ok: true, admin, sessionId: row.id };
}
