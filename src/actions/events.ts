"use server";

import { revalidatePath } from "next/cache";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { blocageActivationEvent } from "@/lib/activation/events";
import { getUserAndOrg } from "@/lib/auth";
import { hrefEtapeEvenement } from "@/components/dashboard/atelier-event-etapes";
import { refuserSiQuotaBrouillonAtteint } from "@/lib/quota-brouillons";
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
import { optionalEnv } from "@/lib/env";
import { etatPartageAvecCache } from "@/lib/event-etat-cache";
import { broadcastEventRefresh } from "@/lib/event-realtime";
import {
  COMPTAGE_INDISPONIBLE,
  verdictCodesEnAttente,
} from "@/lib/codes-en-attente";
import { monitored, reportError } from "@/lib/monitoring";
import { ensureProgressivePlayerIdentity } from "@/lib/player-identity";
import { generatePlayerToken, hashPlayerToken } from "@/lib/pronostics";
import { classerTransition, refusTransition } from "@/lib/publication-transition";
import {
  RATE_LIMITS,
  rateLimit,
  rateLimitBucket,
} from "@/lib/rate-limit";
import { clientIpFromHeaders, observerPressionIp } from "@/lib/request-ip";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { filledByTrigger } from "@/lib/supabase/insert";
import type { TablesInsert } from "@/types/database.generated";
import { verifyTurnstile } from "@/lib/turnstile";
import type { ActionResult } from "@/lib/utils";
import {
  createEventGameSchema,
  createEventQuestionSchema,
  createEventSessionSchema,
  deleteEventGameSchema,
  deleteEventQuestionSchema,
  deleteEventSessionSchema,
  EVENT_ANSWER_MEANING_HINT,
  EVENT_SESSION_LOSS_HINT,
  eventStateSchema,
  eventSessionIdSchema,
  joinEventSchema,
  launchEventQuestionSchema,
  moderateEventPlayerSchema,
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
  await observerPressionIp(
    ["event:public:ip", sessionId],
    ip,
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
  turnstileToken?: string;
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
    .select("id, organization_id, reward_stock")
    .eq("join_code", parsed.data.joinCode)
    .maybeSingle();
  if (!sessionRow) {
    return { ok: true, data: mapEventJoin({ state: "unavailable" }) };
  }
  const sessionId = sessionRow.id as string;
  const organizationId = sessionRow.organization_id as string;

  // Identité cookie PAR SESSION : réutilise le jeton existant (re-join), sinon en
  // génère un — posé seulement après un join réussi (plus bas), pour ne pas
  // laisser un cookie orphelin sur une session fermée.
  const store = await cookies();
  const cookieName = eventTokenCookieName(sessionId);
  const existing = store.get(cookieName)?.value;
  const token = existing ?? generatePlayerToken();
  const tokenHash = hashPlayerToken(token);

  // Le challenge n'est demandé qu'à la PREMIÈRE inscription d'une session qui
  // distribue réellement un lot. Un joueur de retour ne le repasse jamais.
  const ip = clientIpFromHeaders(await headers());
  if (
    !existing &&
    (sessionRow.reward_stock as number) > 0 &&
    !(await verifyTurnstile(input.turnstileToken, ip, "event-join"))
  ) {
    return {
      ok: false,
      error: "Vérification anti-robot échouée. Rechargez la page et réessayez.",
    };
  }

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
    joinInner(
      parsed.data,
      sessionId,
      organizationId,
      token,
      tokenHash,
      Boolean(existing),
    ),
  );
}

async function joinInner(
  parsed: { joinCode: string; pseudo: string; avatar: string },
  sessionId: string,
  organizationId: string,
  token: string,
  tokenHash: string,
  returning: boolean,
): Promise<ActionResult<EventJoinResult>> {
  try {
    const admin = createAdminClient();
    await observeEventPressure(
      sessionId,
      clientIpFromHeaders(await headers()),
    );

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

    if (result.state === "joined") {
      const identity = await ensureProgressivePlayerIdentity({
        organizationId,
        experienceKind: "event",
        experienceId: sessionId,
        legacyIdentityHash: tokenHash,
        acquisitionSource: "direct",
      });
      if (identity.ok) {
        const { error: aliasError } = await admin.rpc("upsert_player_alias", {
          p_experience_membership_id: identity.experienceMembershipId,
          p_alias: parsed.pseudo,
        });
        if (aliasError) reportError("event.join-alias", aliasError.message);
      }
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

    return { ok: true, data: mapEventSubmit(data) };
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

  // INTERRUPTEUR DE COMPARAISON — `EVENT_ETAT_CACHE=off` rend le chemin
  // historique (un seul appel `event_public_state`). Il existe pour une raison
  // précise : sans lui, comparer « avant » et « après » demande deux builds sur
  // une machine qui dérive entre les deux, et l'on attribue au correctif ce qui
  // revient à la fatigue de la machine. Avec lui, les deux chemins se mesurent
  // dos à dos dans le MÊME processus, à la même seconde.
  //
  // Il vaut aussi comme interrupteur d'exploitation : un cache qui se révélerait
  // néfaste se coupe par une variable, sans redéploiement de code.
  if (optionalEnv("EVENT_ETAT_CACHE") === "off") {
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

  // ── L'état se lit en DEUX morceaux, et c'est ce qui le rend tenable ──
  //
  // Le morceau COMMUN (session, question, répartition, top 50) est identique
  // pour toute la salle à la même seconde : mille joueurs le faisaient
  // recalculer mille fois. Il passe par un cache d'une seconde, plus court que
  // la cadence de poll (2 500 ms) — donc invisible pour un joueur.
  //
  // Le morceau PERSONNEL (score, rang, code gagné) n'est cacheable par
  // personne : le rang est un `count` sur tous les joueurs de la session. Il
  // reste calculé à chaque appel, et n'est demandé que si le joueur a un
  // cookie — un spectateur ne paie pas ce qu'il ne reçoit pas.
  //
  // La séparation vient du SQL (`event_etat_partage` ne prend aucun jeton) :
  // c'est elle qui garantit qu'une réponse partagée ne peut rien contenir de
  // personnel. Voir `src/lib/event-etat-cache.ts`.
  const [partageResult, joueurResult] = await Promise.all([
    etatPartageAvecCache(parsed.data.sessionId, async () => {
      const { data, error } = await ctx.admin.rpc("event_etat_partage", {
        p_session_id: parsed.data.sessionId,
      });
      if (error) throw new Error(error.message);
      return data;
    }).then(
      (data) => ({ ok: true as const, data }),
      (err: unknown) => ({
        ok: false as const,
        message: err instanceof Error ? err.message : "état partagé indisponible",
      }),
    ),
    tokenHash
      ? ctx.admin
          .rpc("event_etat_joueur", {
            p_session_id: parsed.data.sessionId,
            p_player_token_hash: tokenHash,
          })
          .then(({ data, error }) =>
            error
              ? { ok: false as const, message: error.message }
              : { ok: true as const, data },
          )
      : Promise.resolve({ ok: true as const, data: null }),
  ]);

  if (!partageResult.ok) {
    reportError("event.state", partageResult.message);
    return mapEventPublicState(null);
  }
  // Un échec de la seule vue personnelle ne doit PAS effacer l'état de la
  // salle : le joueur perdrait la question en cours pour un rang manquant.
  if (!joueurResult.ok) {
    reportError("event.state.joueur", joueurResult.message);
  }

  const partage = partageResult.data;
  if (
    partage === null
    || typeof partage !== "object"
    || (partage as { state?: unknown }).state !== "ok"
  ) {
    return mapEventPublicState(partage);
  }

  // La clé est `you` — celle que lit `mapEventPublicState`. Le nom compte :
  // avec `your`, la vue personnelle disparaîtrait silencieusement pour tout le
  // monde, sans erreur ni test rouge évident.
  return mapEventPublicState({
    ...(partage as Record<string, unknown>),
    you: joueurResult.ok ? joueurResult.data : null,
  });
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
      // ── CLASSER AVANT DE REMPLACER ──
      //
      // `start_event_session` LÈVE `module access required: events` plutôt que
      // de rendre `invalid_transition`, et sa migration dit pourquoi : « confondre
      // "votre module n'est pas actif" avec "cette session ne peut pas démarrer"
      // enverrait l'organisateur chercher une panne technique un soir
      // d'événement, devant sa salle ». Écraser ce message par `GENERIC_ERROR`
      // rendait exactement la phrase que ce raisonnement voulait éviter — et
      // c'est ce lot qui crée le cas, la RPC ne pouvant pas lever pour cette
      // cause auparavant.
      //
      // La traduction est posée dans `runTransition` et non dans
      // `startEventSession` : les cinq transitions passent par ici, seule la
      // première est gardée aujourd'hui, et une garde ajoutée demain sur
      // `end_event_session` parlerait déjà la bonne langue.
      const issue = classerTransition({ data: null, error });
      if (issue === "module") {
        return {
          ok: false,
          error: "Le module Mode événement n'est pas activé sur votre compte.",
        };
      }
      // `not authorized` : la RPC porte ce refus, `authorizeRemote` l'a déjà
      // opposé plus haut. Ce chemin ne s'ouvre donc que si l'application et la
      // base divergent sur le rôle — et il vaut mieux le nommer que rendre
      // « réessayez » à quelqu'un dont aucun réessai ne changera le sort.
      if (issue === "role") return { ok: false, error: NOT_EDITOR };
      return { ok: false, error: GENERIC_ERROR };
    }
    const result = mapEventTransition(data);
    if (result.state !== "ok") {
      return { ok: false, error: "Transition impossible dans l'état actuel." };
    }

    // Read the final monotonic revision only after the transaction committed.
    // The tenant predicate is mandatory because this client bypasses RLS.
    const { data: session, error: revisionError } = await guard.admin
      .from("event_sessions")
      .select("state_revision")
      .eq("id", sessionId)
      .eq("organization_id", guard.organizationId)
      .maybeSingle();
    const revision =
      typeof session?.state_revision === "number" &&
      Number.isSafeInteger(session.state_revision) &&
      session.state_revision >= 0
        ? session.state_revision
        : null;
    if (revisionError || revision === null) {
      reportError(`${scope}.revision`, revisionError?.message ?? "Invalid revision");
    } else {
      await broadcastEventRefresh(sessionId, revision);
    }
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

export async function moderateEventPlayer(input: {
  sessionId: string;
  playerId: string;
  moderationState: "active" | "hidden" | "banned";
  reason?: string;
}): Promise<EventTransitionActionResult> {
  const parsed = moderateEventPlayerSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Données invalides" };

  return runTransition(
    parsed.data.sessionId,
    (admin, organizationId) =>
      admin.rpc("moderate_event_player", {
        p_organization_id: organizationId,
        p_session_id: parsed.data.sessionId,
        p_player_id: parsed.data.playerId,
        p_moderation_state: parsed.data.moderationState,
        p_reason: parsed.data.reason || null,
      }),
    "event.moderate-player",
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
  // Le brouillon gratuit du module, borne cote SERVEUR : l'ecran cache
  // deja le formulaire, mais une server action reste POSTable en direct.
  const refusQuota = await refuserSiQuotaBrouillonAtteint("events");
  if (refusQuota) return refusQuota;

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
  // ATTERRISSAGE SUR L'ATELIER, et non en haut de la page de suivi : un jeu
  // qui vient de naître n'a rien à suivre, il a tout à préparer.
  redirect(hrefEtapeEvenement(game.id, "jeu"));
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
    // Le prédicat vit dans `src/lib/activation/events.ts` : c'est le MÊME que
    // celui qu'affiche l'étape « La vérification » de l'atelier. Ce qui est
    // annoncé avant le clic est ce qui sera opposé après.
    const blocage = blocageActivationEvent({ nombreQuestions: count ?? 0 });
    if (blocage) return { ok: false, error: blocage };
  }

  // `event_games.status` n'est plus écrivable par `authenticated` (migration
  // 20260905120000, qui a dû révoquer l'UPDATE TABLE-WIDE de cette table et le
  // re-granter colonne à colonne) : la transition passe par la RPC gardée. La
  // garde « au moins une question » ci-dessus reste AVANT elle.
  const { data: transition, error } = await supabase.rpc("set_event_game_status", {
    p_organization_id: organization.id,
    p_game_id: id,
    p_status: status,
  });
  const refus = refusTransition(
    { data: transition, error },
    {
      introuvable: "Jeu introuvable",
      module: "Le module Mode événement n'est pas activé sur votre compte.",
      role: NOT_EDITOR,
      echec: "Mise à jour impossible",
    },
  );
  if (refus) {
    console.error("[events] game status:", error?.message ?? `rpc=${transition}`);
    return { ok: false, error: refus };
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
  /**
   * L'organisateur a-t-il vu, et accepté, qu'un libellé modifié réécrit le
   * sens des réponses déjà données ? Optionnel : le refus qui le demande
   * NOMME d'abord le nombre de réponses concernées, et lui seul fait
   * apparaître la case. On ne demande pas de confirmer un coût inconnu.
   */
  confirmLabelMeaning?: boolean;
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
    .select("game_id, question_type")
    .eq("id", parsed.data.id)
    .eq("organization_id", organization.id)
    .maybeSingle();
  if (!existing) return { ok: false, error: "Question introuvable" };

  // ── CORRIGER UNE COQUILLE NE DOIT RIEN DÉTRUIRE ──
  //
  // `event_answers.option_id` cascade depuis `event_question_options`
  // (20260727120000:264). Cette action réécrivait TOUTES les options par
  // delete+insert à chaque enregistrement : le commerçant qui corrigeait une
  // faute de frappe pendant sa soirée effaçait, en silence, toutes les
  // réponses déjà données à la question en cours. Le dévoilement ne marquait
  // plus personne (ses deux UPDATE touchaient zéro ligne), le classement
  // final et donc l'attribution des codes EVENT- en sortaient faussés. Rien
  // ne pouvait l'en avertir : `authenticated` n'a même pas le droit de
  // supprimer une ligne d'`event_answers` (:386) — c'est la contrainte
  // référentielle, qui contourne RLS et les grants, qui les emportait.
  // Effet de bord aggravant : `launch_event_question` (:716-721) fonde sa
  // garde anti-rejeu sur l'EXISTENCE des réponses ; les effacer rouvrait la
  // porte au relancement d'une question déjà jouée.
  //
  // Deux cas, désormais distingués :
  //  · MÊME NOMBRE d'options → mise à jour EN PLACE, position par position.
  //    Les `id` survivent, donc les réponses aussi. C'est correct au sens du
  //    joueur : il a désigné le bouton n° i, et c'est ce bouton-là dont le
  //    LIBELLÉ est corrigé.
  //  · NOMBRE DIFFÉRENT (ajout / retrait) → la correspondance « position ↔
  //    choix du joueur » n'a plus de sens, et rien ne permet de la rejouer.
  //    On ne réécrit qu'à condition qu'AUCUNE réponse n'existe ; sinon on
  //    refuse, en nommant le nombre de réponses en jeu.
  //
  // ── ET LA JUSTESSE, ELLE, NE SE CORRIGE PLUS APRÈS COUP ──
  //
  // La première version de ce correctif laissait la mise à jour en place
  // réécrire `is_correct` « le cas échéant ». C'était une régression de
  // sécurité déguisée en confort : `reveal_event_question`
  // (20260727120000:823-829) lit `is_correct` AU MOMENT du dévoilement, et
  // rien ici ne borne la phase de la session ni la question courante. Quarante
  // joueurs répondent A ; avant le `reveal`, on ré-enregistre la question avec
  // le même nombre d'options et la bonne réponse déplacée sur B ; les quarante
  // réponses SURVIVENT (c'est tout l'objet du correctif) et sont notées contre
  // une vérité inversée. Les codes EVENT- de fin de soirée partent aux mauvaises
  // personnes.
  //
  // L'ancien delete+insert faisait la même chose, mais il détruisait les
  // réponses au passage : le truquage se voyait au classement. Le rendre propre
  // l'aurait rendu invisible. On gèle donc, dès la PREMIÈRE réponse reçue et
  // sur LES DEUX branches, ce qui définit la vérité de la question — sa
  // `is_correct` et son `question_type` (passer un quiz en sondage annule le
  // barème). Le libellé, lui, reste modifiable : c'est le seul geste que ce
  // correctif devait rendre sûr.
  const { data: optionsExistantes } = await supabase
    .from("event_question_options")
    .select("id, position, is_correct, label")
    .eq("question_id", parsed.data.id)
    .eq("organization_id", organization.id)
    .order("position", { ascending: true });
  const anciennes = (optionsExistantes ?? []) as Array<{
    id: string;
    position: number;
    is_correct: boolean;
    label: string;
  }>;
  const structurel = anciennes.length !== parsed.data.options.length;
  // Comparaison position par position : `anciennes` est trié par `position`,
  // et c'est exactement l'ordre dans lequel la mise à jour en place écrira.
  const veriteChangee =
    existing.question_type !== parsed.data.question_type ||
    (!structurel &&
      parsed.data.options.some(
        (option, index) =>
          Boolean(anciennes[index]?.is_correct) !== option.is_correct,
      ));

  // ── CE QU'UN LIBELLÉ MODIFIÉ FAIT AUX RÉPONSES DÉJÀ DONNÉES ──
  //
  // Le gel ci-dessus protège la VÉRITÉ de la question. Il laisse le libellé
  // modifiable, et c'était l'intention : corriger une coquille en pleine
  // soirée est le geste que ce correctif devait rendre sûr.
  //
  // Mais une réponse déjà enregistrée pointe une OPTION, pas un texte. Si
  // l'organisateur PERMUTE deux libellés — geste tout aussi légitime quand
  // il s'aperçoit qu'il les a intervertis — les quarante personnes qui
  // avaient choisi le premier bouton se retrouvent créditées de ce que dit
  // maintenant ce bouton. Leur réponse n'a pas bougé ; son SENS, si.
  //
  // Aucun `id` ne circule dans le formulaire, et en ajouter n'y changerait
  // rien : le problème n'est pas de savoir quelle ligne modifier, c'est que
  // déplacer un libellé après coup réécrit ce que des gens ont voulu dire.
  //
  // MAIS ON NE TAXE PAS TOUTE MODIFICATION DE LIBELLÉ. Le chantier précédent
  // avait rendu la correction de coquille gratuite, et c'était son objet :
  // demander une confirmation pour chaque faute de frappe corrigée en pleine
  // soirée reviendrait à défaire ce qu'il a gagné, et à apprendre à
  // l'organisateur à cocher sans lire.
  //
  // Les deux gestes se distinguent, et par une mesure et non une intention :
  // une PERMUTATION laisse l'ENSEMBLE des libellés identique — seul leur
  // ordre change — là où une coquille corrigée modifie cet ensemble. On
  // compare donc les libellés triés. C'est exactement le geste dangereux, et
  // lui seul.
  const memeEnsembleDeLibelles = (a: string[], b: string[]) => {
    if (a.length !== b.length) return false;
    const trier = (l: string[]) => [...l].sort();
    const ta = trier(a);
    const tb = trier(b);
    return ta.every((valeur, index) => valeur === tb[index]);
  };
  const permutationDeLibelles =
    !structurel &&
    parsed.data.options.some(
      (option, index) => (anciennes[index]?.label ?? "") !== option.label,
    ) &&
    memeEnsembleDeLibelles(
      anciennes.map((o) => o.label),
      parsed.data.options.map((o) => o.label),
    );

  // Un seul aller-retour, et seulement quand la modification peut coûter
  // quelque chose : renommer la question elle-même n'en paie aucun.
  if (structurel || veriteChangee || permutationDeLibelles) {
    const { count: reponses } = await supabase
      .from("event_answers")
      .select("id", { count: "exact", head: true })
      .eq("question_id", parsed.data.id)
      .eq("organization_id", organization.id);
    if ((reponses ?? 0) > 0) {
      if (structurel) {
        return {
          ok: false,
          error:
            `Cette question a déjà reçu ${reponses} réponse(s) : ajouter ou ` +
            "retirer une option les effacerait toutes, et le classement de la " +
            "soirée serait faussé. Corrigez les libellés sans changer le " +
            "nombre d'options, ou créez une nouvelle question.",
        };
      }
      if (veriteChangee) {
        return {
          ok: false,
          error:
            `Cette question a déjà reçu ${reponses} réponse(s) : la bonne ` +
            "réponse et le type de question ne peuvent plus changer, sinon " +
            "elles seraient notées contre une vérité qui n'était pas celle " +
            "posée. Corrigez les libellés seuls, ou créez une nouvelle question.",
        };
      }
      if (!input.confirmLabelMeaning) {
        return {
          ok: false,
          error:
            `Vous intervertissez deux libellés, et ${reponses} réponse(s) ` +
            "ont déjà été données sur cette question. Une réponse " +
            "enregistrée désigne un BOUTON, pas un texte : ces " +
            `${EVENT_ANSWER_MEANING_HINT} à l'autre libellé, et les ` +
            "personnes concernées seront créditées de l'autre choix. " +
            "Confirmez ci-dessous pour permuter quand même.",
        };
      }
    }
  }

  // Le refus ci-dessus tombe AVANT toute écriture : un enregistrement refusé
  // ne laisse pas la question à moitié modifiée.
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

  if (structurel) {
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
  } else {
    for (const [index, option] of parsed.data.options.entries()) {
      const { error: majError } = await supabase
        .from("event_question_options")
        .update({
          label: option.label,
          is_correct: option.is_correct,
          position: index,
        })
        .eq("id", anciennes[index].id)
        .eq("organization_id", organization.id);
      if (majError) {
        console.error("[events] update question options:", majError.message);
        return { ok: false, error: "Impossible d'enregistrer les options" };
      }
    }
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
    .insert(
      // join_code OMIS : posé par le trigger event_sessions_set_join_code.
      filledByTrigger<TablesInsert<"event_sessions">, "join_code">({
        game_id: parsed.data.game_id,
        organization_id: organization.id,
        label: parsed.data.label || null,
        reward_label: parsed.data.reward_label,
        reward_details: parsed.data.reward_details || null,
        reward_stock: parsed.data.reward_stock,
      }),
    )
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
  /** Échéance du code EVENT-, en jours. '' = sans limite ; ABSENT = ne pas
   *  toucher au réglage (voir la garde ci-dessous). */
  codeTtlDays?: string | number | null;
}): Promise<ActionResult> {
  const parsed = updateEventSessionSchema.safeParse({
    id: input.id,
    label: input.label ?? "",
    reward_label: input.rewardLabel ?? "",
    reward_details: input.rewardDetails ?? "",
    reward_stock: input.rewardStock ?? "",
    // Même garde que les cinq actions FormData, transposée à une entrée
    // typée : la valeur est passée TELLE QUELLE, donc l'absence de la clé
    // (`undefined`) se distingue de la chaîne vide, qui vaut « sans limite ».
    // Surtout PAS `input.codeTtlDays ?? ""`, l'équivalent exact du
    // `formData.get(...) ?? ""` proscrit ailleurs : tout écran appelant cette
    // action sans porter le champ effacerait l'échéance sans que personne y
    // ait touché.
    code_ttl_days: input.codeTtlDays,
  });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };

  const { user, organization, role } = await getUserAndOrg();
  if (!user || !organization) redirect("/login");
  if (role !== "owner" && role !== "editor") return { ok: false, error: NOT_EDITOR };

  // label / reward_* sont les seules colonnes accordées à authenticated en
  // update (les colonnes de la machine à états sont RPC-only) : on passe par la
  // RLS éditeur.
  const supabase = await createClient();
  // `game_id` relu à l'écriture : c'est lui qui porte la page à revalider, et
  // il n'est pas dans l'entrée. Même geste que `updateEventQuestion` (l.886) et
  // `deleteEventQuestion` (l.920), qui le relisent aussi.
  const { data: session, error } = await supabase
    .from("event_sessions")
    .update({
      label: parsed.data.label || null,
      reward_label: parsed.data.reward_label,
      reward_details: parsed.data.reward_details || null,
      reward_stock: parsed.data.reward_stock,
      // Champ absent de l'entrée → colonne non touchée (pas remise à null).
      ...(parsed.data.code_ttl_days !== undefined
        ? { code_ttl_days: parsed.data.code_ttl_days }
        : {}),
    })
    .eq("id", parsed.data.id)
    .eq("organization_id", organization.id)
    .select("game_id")
    .single();
  if (error) {
    console.error("[events] update session:", error.message);
    return { ok: false, error: "Mise à jour impossible" };
  }

  // Cette ligne visait `/dashboard/events/sessions/${id}` — un chemin qui ne
  // correspond à AUCUNE route du produit (les seules sont /dashboard/events,
  // /dashboard/events/[id] et /dashboard/events/[id]/remote). Deux erreurs en
  // une : le segment `sessions/` n'existe pas, et l'identifiant était celui de
  // la session, pas celui de la partie. La page qui porte ce formulaire n'était
  // donc revalidée par personne — le commerçant modifiait le lot d'une session
  // et l'écran gardait l'ancien, jusqu'à un rechargement manuel.
  revalidatePath(`/dashboard/events/${session.game_id}`);
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

  // ── GARDE : des lots de cette soirée attendent-ils encore d'être remis ? ──
  //
  // `event_wins` cascade depuis `event_sessions` (20260727120000:290-291) : la
  // suppression emportait, EN SILENCE et au premier clic, tous les codes
  // EVENT- distribués à la clôture. Les gagnants qui n'étaient pas encore
  // passés en caisse se présentaient avec un code introuvable.
  //
  // Le bouton n'avait aucune confirmation, alors que la suppression du JEU,
  // dans le même fichier d'écran, en a une depuis toujours. On ne touche pas
  // à la cascade — la retirer donnerait un 23503 opaque : on demande une
  // confirmation qui NOMME le nombre de lots en jeu.
  const verdict = verdictCodesEnAttente(
    await supabase
      .from("event_wins")
      .select("id", { count: "exact", head: true })
      .eq("session_id", parsed.data.id)
      .eq("organization_id", organization.id)
      .is("redeemed_at", null),
  );

  if (verdict.etat === "indisponible") {
    reportError("events.delete-session-outstanding", verdict.motif);
    return { ok: false, error: COMPTAGE_INDISPONIBLE };
  }

  if (verdict.etat === "en-attente" && formData.get("confirm_outstanding") !== "1") {
    return {
      ok: false,
      error:
        `${verdict.nombre} lot(s) de cette soirée n'ont pas encore été retirés en ` +
        "caisse. Les supprimer rendra leurs codes introuvables : vos gagnants " +
        `se verront refuser un lot qu'ils ont vraiment obtenu. ${EVENT_SESSION_LOSS_HINT} ` +
        "pour supprimer quand même.",
    };
  }

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
