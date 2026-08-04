"use server";

import { revalidatePath } from "next/cache";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { getUserAndOrg } from "@/lib/auth";
import {
  loadCalendarSpinBundles,
  type CalendarSpinBundle,
} from "@/lib/calendar-spin-bundle";
import {
  COMPTAGE_INDISPONIBLE,
  verdictCodesEnAttente,
} from "@/lib/codes-en-attente";
import { monitored, reportError } from "@/lib/monitoring";
import { generatePlayerToken, hashPlayerToken } from "@/lib/pronostics";
import { refusTransition } from "@/lib/publication-transition";
import {
  mapQuizAnswerResult,
  mapQuizDraw,
  mapQuizFinish,
  mapQuizJoin,
  mapQuizLeaderboard,
  mapQuizPublicState,
  mapQuizQuestion,
  mapQuizSpinGrant,
  planQuizReorder,
  quizAnswerToJson,
  quizSolutionToJson,
  type QuizAnswerInput,
  type QuizAnswerResult,
  type QuizDrawResult,
  type QuizFinishResult,
  type QuizJoinResult,
  type QuizLeaderboardEntry,
  type QuizPublicState,
  type QuizSolutionInput,
  type QuizStartResult,
} from "@/lib/quiz";
import { hasQuizAccess, loadQuizActionContext, quizTokenCookieName } from "@/lib/quiz-context";
import {
  bridgeOfferedSpinToCampaign,
  ensureProgressivePlayerIdentity,
} from "@/lib/player-identity";
import {
  RATE_LIMITS,
  rateLimit,
  rateLimitBucket,
} from "@/lib/rate-limit";
import { clientIpFromHeaders, observerPressionIp } from "@/lib/request-ip";
import { signClaimToken } from "@/lib/spin";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { turnstileEnabled, verifyTurnstile } from "@/lib/turnstile";
import { type ActionResult } from "@/lib/utils";
import {
  consumeQuizSpinSchema,
  createQuizQuestionSchema,
  createQuizSchema,
  deleteQuizQuestionSchema,
  deleteQuizSchema,
  drawQuizWinnersSchema,
  QUIZ_DELETE_LOSS_HINT,
  finishQuizSchema,
  getQuizLeaderboardSchema,
  getQuizStateSchema,
  joinQuizSchema,
  reorderQuizQuestionsSchema,
  setQuizStatusSchema,
  startQuizQuestionSchema,
  submitQuizAnswerSchema,
  updateQuizQuestionSchema,
  updateQuizRewardSchema,
  updateQuizSchema,
} from "@/lib/validations/quiz";

/** Durée de vie du cookie joueur d'un quiz (180 j, comme le calendrier). */
const QUIZ_COOKIE_MAX_AGE = 60 * 60 * 24 * 180;

const NOT_EDITOR = "Action non autorisée";
const GENERIC_ERROR = "Une erreur est survenue, réessayez.";

/** Roue offerte préchargée (type partagé avec le calendrier : besoin identique). */
export type QuizSpinBundle = CalendarSpinBundle;

// ════════════════════════════════════════════════════════════
// Contrôle d'abus — principe de conception du module (ADR-032)
//
// join / start / submit / finish sont des chemins PUBLICS servis par le
// service_role à des joueurs qui scannent le QR d'un restaurant, d'une cave ou
// d'un musée : derrière un Wi-Fi ou un CGNAT, l'IP est PARTAGÉE par tous. AUCUN
// seau `failClosed` ne porte donc sur une clé partagée (IP, quiz) — un tel seau
// deviendrait un interrupteur qu'un tiers allume en le saturant (« déni de
// participation d'un quiz entier »). Les clés partagées ne portent que des
// compteurs d'OBSERVABILITÉ fail-OPEN (`observeSharedKey`, seau `quizPublicIp`).
//
// Le `failClosed` reste légitime — et employé — sur une clé propre à UNE identité
// (hash du jeton joueur, `quizPlayerAction`) : la saturer ne coupe que son
// porteur. Aucun seau n'est consommé avant que cette identité soit résolue.
//
// La borne réelle contre l'abus n'est pas un rate-limit : ce sont les invariants
// SQL — une réponse par (joueur, question) IMMUABLE (trigger de gel), un joueur
// par quiz, le chronomètre serveur inforgeable et le stock FINI obligatoire du
// lot. Rejouer une question est structurellement impossible.
//
// ANTI-ROBOT (SYBIL) — ce que les invariants ne couvrent PAS : le stock borne le
// NOMBRE de lots, pas la DIVERSITÉ des mains qui les reçoivent. Répondre est
// gratuit et `submit_quiz_answer` rend la bonne réponse au joueur dès qu'il a
// répondu (elle lui est due) : une passe jetable peut donc collecter le corrigé
// complet, puis chaque identité neuve le rejouer et franchir `reward_threshold` à
// coup sûr — un bot remplit de même les premières places d'un `draw`/`ranking`
// avec un `elapsed_ms` de latence réseau. Le seul appel ÉMETTEUR du parcours
// public est `finishQuiz` : c'est là — et là seulement — qu'un challenge Turnstile
// est opposé, et UNIQUEMENT si le quiz met un lot en jeu (`reward_mode <> 'none'`).
// RIEN sur join / start / submit : aucune friction sur le chemin de jeu, et aucun
// contrôle avant que l'identité soit résolue (cf. ADR-032 ci-dessus).
// ════════════════════════════════════════════════════════════

// ────────────────────────────────────────────────────────────
// Parcours public — identité cookie + observabilité
// ────────────────────────────────────────────────────────────

/** Identité du joueur portée par le cookie httpOnly du navigateur. */
interface QuizIdentity {
  tokenHash: string;
  returning: boolean;
}

/**
 * Résout — et pose au besoin — l'identité du joueur. AUCUN aller-retour base : ce
 * qui permet de trancher le premier seau avant la moindre requête SQL, avant tout
 * appel sortant et avant l'instrumentation (`monitored`). Le cookie est posé dès
 * la première tentative (miroir calendrier / jackpot / fidélité).
 */
async function resolveQuizIdentity(quizId: string): Promise<QuizIdentity> {
  const store = await cookies();
  const cookieName = quizTokenCookieName(quizId);
  const existing = store.get(cookieName)?.value;
  const token = existing ?? generatePlayerToken();
  if (!existing) {
    store.set(cookieName, token, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: QUIZ_COOKIE_MAX_AGE,
    });
  }
  return { tokenHash: hashPlayerToken(token), returning: Boolean(existing) };
}

/** Seau d'observabilité de la pression publique (clé partagée, jamais un refus). */
async function observeQuizPressure(quizId: string, ip: string): Promise<void> {
  await observerPressionIp(
    ["quiz:public:ip", quizId],
    ip,
    RATE_LIMITS.quizPublicIp,
    "quiz_public_pressure",
    { quiz_id: quizId },
    );
}

/** PREMIER REMPART — clé d'IDENTITÉ (`failClosed` légitime), avant toute RPC. */
async function allowQuizPlayerAction(
  quizId: string,
  tokenHash: string,
): Promise<boolean> {
  return rateLimit(
    rateLimitBucket("quiz:player", quizId, tokenHash),
    RATE_LIMITS.quizPlayerAction,
    { failClosed: true },
  );
}

const TOO_MANY = "Trop de tentatives. Patientez un instant.";

// ────────────────────────────────────────────────────────────
// joinQuiz — rejoindre + identité facultative (RGPD)
// ────────────────────────────────────────────────────────────

/**
 * Rejoindre un quiz par son slug (POST du bouton « Je joue »). Résout d'abord
 * l'UUID du quiz (le cookie d'identité est keyé par cet UUID, comme joinCalendar),
 * pose le cookie joueur, appelle join_quiz (idempotent) et, si consentement
 * marketing + email fournis, abonne à la newsletter du commerçant (best-effort,
 * source `quiz`). Prénom / email / avatar sont FACULTATIFS : aucune PII n'est
 * imposée pour jouer ; l'opt-in est RGPD (EXPLICITE côté UI, jamais pré-coché) et
 * join_quiz ne fait que le FAIRE MONTER — un re-join ne rétracte jamais un
 * consentement.
 *
 * RGPD : un email SANS consentement est refusé par `joinQuizSchema` (la case de
 * l'interface n'est pas une garde : cette action est un endpoint) et, en défense
 * en profondeur, n'est de toute façon jamais transmis à la base par `joinInner`.
 */
export async function joinQuiz(input: {
  slug: string;
  firstName?: string;
  email?: string;
  avatar?: string;
  marketingOptIn?: boolean;
}): Promise<ActionResult<QuizJoinResult>> {
  const parsed = joinQuizSchema.safeParse({
    slug: input.slug,
    firstName: input.firstName ?? "",
    email: input.email ?? "",
    avatar: input.avatar ?? "",
    marketingOptIn: input.marketingOptIn ?? false,
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
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(
      parsed.data.slug,
    );
  const { data: quizRow } = isUuid
    ? await admin.from("quizzes").select("id, public_slug").eq("id", parsed.data.slug).maybeSingle()
    : await admin
        .from("quizzes")
        .select("id, public_slug")
        .eq("public_slug", parsed.data.slug)
        .maybeSingle();
  if (!quizRow) {
    return { ok: true, data: mapQuizJoin({ state: "unavailable" }) };
  }
  const quizId = quizRow.id as string;
  const publicSlug = quizRow.public_slug as string;

  const identity = await resolveQuizIdentity(quizId);
  if (!(await allowQuizPlayerAction(quizId, identity.tokenHash))) {
    return { ok: false, error: TOO_MANY };
  }

  return monitored("quiz.join", () =>
    joinInner(parsed.data, quizId, publicSlug, identity.tokenHash),
  );
}

async function joinInner(
  parsed: {
    slug: string;
    firstName?: string;
    email?: string;
    avatar?: string;
    marketingOptIn: boolean;
  },
  quizId: string,
  publicSlug: string,
  tokenHash: string,
): Promise<ActionResult<QuizJoinResult>> {
  try {
    // Le module + l'abonnement + le statut actif sont vérifiés ici (la RPC garde
    // l'addon et le statut, pas l'abonnement) : un accès expiré ne joue plus.
    const ctx = await loadQuizActionContext(quizId);
    if (!ctx.ok) return { ok: true, data: mapQuizJoin({ state: "unavailable" }) };

    await observeQuizPressure(quizId, clientIpFromHeaders(await headers()));

    const { data, error } = await ctx.admin.rpc("join_quiz", {
      p_slug: publicSlug,
      p_player_token_hash: tokenHash,
      p_first_name: parsed.firstName ?? undefined,
      // DÉFENSE EN PROFONDEUR (RGPD) : aucun email n'atteint la base sans la base
      // légale qui l'accompagne. Le schéma refuse déjà la combinaison, mais la
      // règle est écrite là où l'écriture se produit — la seule PII persistée du
      // module ne doit dépendre d'aucun appelant.
      p_email: parsed.marketingOptIn ? (parsed.email ?? undefined) : undefined,
      p_avatar: parsed.avatar ?? undefined,
      p_marketing_opt_in: parsed.marketingOptIn,
    });
    if (error) {
      reportError("quiz.join", error.message);
      return { ok: false, error: GENERIC_ERROR };
    }

    const result = mapQuizJoin(data);

    if (result.state === "joined") {
      await ensureProgressivePlayerIdentity({
        organizationId: ctx.organizationId,
        experienceKind: "quiz",
        experienceId: quizId,
        legacyIdentityHash: tokenHash,
        acquisitionSource: "direct",
      });
    }

    // Opt-in marketing avec email : abonné à la newsletter du commerçant
    // (idempotent, best-effort, miroir joinCalendar).
    if (result.state === "joined" && parsed.marketingOptIn && parsed.email) {
      await subscribeToNewsletter(ctx.admin, ctx.organizationId, parsed.email);
    }

    return { ok: true, data: result };
  } catch (err) {
    reportError("quiz.join", err);
    return { ok: false, error: GENERIC_ERROR };
  }
}

/**
 * Abonne un email à la newsletter du commerçant (source `quiz`). Idempotent
 * (on-conflict-do-nothing) et best-effort : jamais bloquant pour le join. Émet
 * `newsletter.subscriber.created` UNIQUEMENT sur une insertion réelle (miroir
 * calendrier / chasses / roue).
 */
async function subscribeToNewsletter(
  admin: ReturnType<typeof createAdminClient>,
  organizationId: string,
  email: string,
): Promise<void> {
  const { data: inserted, error } = await admin
    .from("newsletter_subscribers")
    .upsert(
      { organization_id: organizationId, email, source: "quiz" },
      { onConflict: "organization_id,email", ignoreDuplicates: true },
    )
    .select("id");
  if (error) {
    reportError("quiz.join.subscribe", error.message);
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
    data: { email, source: "quiz" },
  });
  if (whError) reportError("quiz.join.webhook", whError.message);
}

// ────────────────────────────────────────────────────────────
// startQuizQuestion — présentation + chronomètre SERVEUR
// ────────────────────────────────────────────────────────────

/**
 * Présente une question et fait POSER LE CHRONOMÈTRE PAR LA BASE
 * (start_quiz_question écrit `started_at = now()`, une seule fois : un re-start ne
 * rembobine rien). Aucun paramètre de temps n'est envoyé, aucune borne n'est
 * évaluée ici. La charge utile renvoyée ne contient JAMAIS la bonne réponse
 * (invariant #2, garanti par la RPC ET par le type de sortie de mapQuizQuestion).
 */
export async function startQuizQuestion(input: {
  quizId: string;
  questionId: string;
}): Promise<ActionResult<QuizStartResult>> {
  const parsed = startQuizQuestionSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0].message };
  }

  const identity = await resolveQuizIdentity(parsed.data.quizId);
  if (!(await allowQuizPlayerAction(parsed.data.quizId, identity.tokenHash))) {
    return { ok: false, error: TOO_MANY };
  }

  return monitored("quiz.start", () => startInner(parsed.data, identity.tokenHash));
}

async function startInner(
  parsed: { quizId: string; questionId: string },
  tokenHash: string,
): Promise<ActionResult<QuizStartResult>> {
  try {
    const ctx = await loadQuizActionContext(parsed.quizId);
    // Quiz inconnu / non actif / module coupé : résultat générique typé (l'UI
    // affiche le même message, aucun oracle sur le motif).
    if (!ctx.ok) {
      return { ok: true, data: mapQuizQuestion({ state: "unavailable" }) };
    }

    await observeQuizPressure(parsed.quizId, clientIpFromHeaders(await headers()));

    const { data, error } = await ctx.admin.rpc("start_quiz_question", {
      p_quiz_id: parsed.quizId,
      p_player_token_hash: tokenHash,
      p_question_id: parsed.questionId,
    });
    if (error) {
      reportError("quiz.start", error.message);
      return { ok: false, error: GENERIC_ERROR };
    }
    return { ok: true, data: mapQuizQuestion(data) };
  } catch (err) {
    reportError("quiz.start", err);
    return { ok: false, error: GENERIC_ERROR };
  }
}

// ────────────────────────────────────────────────────────────
// submitQuizAnswer — évaluation et délai 100 % en base
// ────────────────────────────────────────────────────────────

/**
 * Enregistre LA réponse du joueur à une question. Le délai (`now() - started_at`)
 * et la JUSTESSE sont calculés EN BASE : aucun temps, aucun score, aucun verdict
 * ne transite depuis le client, et rien n'est recalculé ici. La forme de la
 * réponse est validée deux fois — Zod (message lisible) puis
 * `is_valid_quiz_answer` contre les options et le `ranking_size` de LA question,
 * qui seule fait autorité. Un refus (`invalid_answer`) ne révèle jamais la vérité.
 */
export async function submitQuizAnswer(input: {
  quizId: string;
  questionId: string;
  answer: QuizAnswerInput;
}): Promise<ActionResult<QuizAnswerResult>> {
  const parsed = submitQuizAnswerSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0].message };
  }

  const identity = await resolveQuizIdentity(parsed.data.quizId);
  if (!(await allowQuizPlayerAction(parsed.data.quizId, identity.tokenHash))) {
    return { ok: false, error: TOO_MANY };
  }

  return monitored("quiz.submit", () =>
    submitInner(
      {
        quizId: parsed.data.quizId,
        questionId: parsed.data.questionId,
        answer: parsed.data.answer as QuizAnswerInput,
      },
      identity.tokenHash,
    ),
  );
}

async function submitInner(
  parsed: { quizId: string; questionId: string; answer: QuizAnswerInput },
  tokenHash: string,
): Promise<ActionResult<QuizAnswerResult>> {
  try {
    const ctx = await loadQuizActionContext(parsed.quizId);
    if (!ctx.ok) {
      return { ok: true, data: mapQuizAnswerResult({ state: "unavailable" }) };
    }

    await observeQuizPressure(parsed.quizId, clientIpFromHeaders(await headers()));

    const { data, error } = await ctx.admin.rpc("submit_quiz_answer", {
      p_quiz_id: parsed.quizId,
      p_player_token_hash: tokenHash,
      p_question_id: parsed.questionId,
      p_answer: quizAnswerToJson(parsed.answer),
    });
    if (error) {
      reportError("quiz.submit", error.message);
      return { ok: false, error: GENERIC_ERROR };
    }
    return { ok: true, data: mapQuizAnswerResult(data) };
  } catch (err) {
    reportError("quiz.submit", err);
    return { ok: false, error: GENERIC_ERROR };
  }
}

// ────────────────────────────────────────────────────────────
// finishQuiz — clôture + récompense immédiate (threshold / instant)
// ────────────────────────────────────────────────────────────

/**
 * Le challenge anti-robot est-il RÉELLEMENT jouable par un joueur ?
 *
 * Il faut les DEUX clés : le secret côté serveur (vérification) et la clé de site
 * côté client (rendu du widget). N'en provisionner qu'une briserait la clôture —
 * `verifyTurnstile` refuserait en production sans qu'aucun widget ne s'affiche, et
 * plus personne ne pourrait terminer un quiz doté.
 *
 * COMPROMIS ASSUMÉ quand Turnstile n'est pas provisionné (miroir exact de la
 * fidélité et du jackpot) : on n'oppose pas de challenge — un parcours de jeu
 * inutilisable est pire que l'abus visé. Ce que cela coûte reste borné par le
 * produit : le stock est FINI et OBLIGATOIRE (ADR-031), un Sybil ne peut donc pas
 * émettre plus de lots que le commerçant n'en a mis en jeu, seulement se les
 * approprier. Provisionner TURNSTILE_SECRET_KEY *et*
 * NEXT_PUBLIC_TURNSTILE_SITE_KEY reste la configuration attendue en production.
 */
function quizChallengeAvailable(): boolean {
  return turnstileEnabled() && Boolean(process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY);
}

/**
 * Résultat de la clôture : `ActionResult` augmenté de `challengeRequired` — clore
 * un quiz DOTÉ exige un challenge anti-robot, l'UI affiche alors le widget et
 * rejoue la clôture avec le jeton (miroir de la fidélité et du jackpot).
 */
export type QuizFinishActionResult =
  | { ok: true; data: QuizFinishResult & { spinBundle?: QuizSpinBundle | null } }
  | { ok: false; error: string; challengeRequired?: boolean };

/**
 * Résultat du tirage : `ActionResult` augmenté de `retryable`. Un tirage « à vide »
 * (personne n'a terminé, ou stock épuisé) n'est PAS un échec — la base ne l'a pas
 * consommé, il reste relançable. Ce drapeau le dit STRUCTURELLEMENT, pour que
 * l'éditeur n'ait pas à reconnaître le cas au texte du message.
 */
export type QuizDrawActionResult =
  | { ok: true; data: QuizDrawResult }
  | { ok: false; error: string; retryable?: boolean };

/**
 * Clôt la participation. finish_quiz RECALCULE le score depuis les réponses figées
 * (les agrégats ne sont qu'un cache) puis applique le mode : threshold / instant
 * émettent ici, draw / ranking sont DIFFÉRÉS (pendingDraw), none n'émet rien.
 * Idempotent : un second appel renvoie l'état et le lot déjà émis (`already_finished`)
 * sans jamais ré-émettre. Quand le lot est un tour de roue offert, la roue cible est
 * préchargée pour enchaîner clôture → roue dans la même session.
 *
 * `turnstileToken` n'est demandé que lorsque l'appel précédent a répondu
 * `challengeRequired` : quiz DOTÉ uniquement (cf. finishInner). Un quiz sans gain
 * ne le voit jamais.
 */
export async function finishQuiz(input: {
  quizId: string;
  turnstileToken?: string;
}): Promise<QuizFinishActionResult> {
  const parsed = finishQuizSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0].message };
  }

  const identity = await resolveQuizIdentity(parsed.data.quizId);
  if (!(await allowQuizPlayerAction(parsed.data.quizId, identity.tokenHash))) {
    return { ok: false, error: TOO_MANY };
  }

  return monitored("quiz.finish", () =>
    finishInner(parsed.data, identity.tokenHash, input.turnstileToken),
  );
}

async function finishInner(
  parsed: { quizId: string },
  tokenHash: string,
  turnstileToken: string | undefined,
): Promise<QuizFinishActionResult> {
  try {
    const ctx = await loadQuizActionContext(parsed.quizId);
    if (!ctx.ok) {
      return {
        ok: true,
        data: { ...mapQuizFinish({ state: "unavailable" }), spinBundle: null },
      };
    }

    const ip = clientIpFromHeaders(await headers());

    // SEUL APPEL ÉMETTEUR du parcours public : c'est ici, et nulle part ailleurs,
    // qu'un challenge anti-robot a du sens (cf. en-tête du module). Il est
    // CONDITIONNEL au fait qu'un lot soit en jeu : un quiz purement ludique
    // (`none`) n'émet rien, rien à protéger, aucune friction. `verifyTurnstile`
    // sort sans aller-retour réseau quand le jeton manque.
    if (ctx.rewardMode !== "none") {
      if (
        quizChallengeAvailable() &&
        !(await verifyTurnstile(turnstileToken, ip, "quiz-finish"))
      ) {
        return {
          ok: false,
          error:
            "Vérification anti-robot requise. Validez le contrôle ci-dessous puis terminez.",
          challengeRequired: true,
        };
      }
    }

    await observeQuizPressure(parsed.quizId, ip);

    const { data, error } = await ctx.admin.rpc("finish_quiz", {
      p_quiz_id: parsed.quizId,
      p_player_token_hash: tokenHash,
    });
    if (error) {
      reportError("quiz.finish", error.message);
      return { ok: false, error: GENERIC_ERROR };
    }

    const result = mapQuizFinish(data);
    // Tour de roue offert : on précharge SA roue (et elle seule), comme
    // openCalendarBox — le joueur y a droit à cet instant.
    if (result.reward?.spinGrantToken && result.reward.targetWheelId) {
      const bundles = await loadCalendarSpinBundles(
        ctx.admin,
        [result.reward.targetWheelId],
        ctx.organizationId,
      );
      return {
        ok: true,
        data: { ...result, spinBundle: bundles[result.reward.targetWheelId] ?? null },
      };
    }
    return { ok: true, data: { ...result, spinBundle: null } };
  } catch (err) {
    reportError("quiz.finish", err);
    return { ok: false, error: GENERIC_ERROR };
  }
}

// ────────────────────────────────────────────────────────────
// consumeQuizSpin — tour de roue offert par un quiz
// ────────────────────────────────────────────────────────────

/** Issue d'un tour de roue offert consommé, prête pour l'UI de la roue. */
export interface QuizSpinOutcome {
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
 * Consomme le tour de roue offert par un quiz. Échange le grant_token contre un
 * tirage atomique sur la roue cible via consume_quiz_spin_grant, puis, pour un
 * gain non perdant, signe un jeton claim (spin_id) rebranché sur le flux
 * claimPrize existant (code GAIN-…) — comme tous les autres modules. Le player_key
 * du spin étant le hash du cookie du quiz, la reprise passe par resulting_spin_id
 * (état already_consumed). Miroir exact de consumeCalendarSpin.
 */
export async function consumeQuizSpin(input: {
  quizId: string;
  grantToken: string;
}): Promise<ActionResult<QuizSpinOutcome>> {
  const parsed = consumeQuizSpinSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0].message };
  }

  // Sans cookie il n'y a rien à consommer : on sort avant toute requête, tout
  // compteur et toute instrumentation.
  const store = await cookies();
  const token = store.get(quizTokenCookieName(parsed.data.quizId))?.value;
  if (!token) return { ok: false, error: "Tour offert indisponible." };
  const tokenHash = hashPlayerToken(token);

  if (!(await allowQuizPlayerAction(parsed.data.quizId, tokenHash))) {
    return { ok: false, error: TOO_MANY };
  }

  return monitored("quiz.consumeSpin", () => consumeSpinInner(parsed.data, tokenHash));
}

async function consumeSpinInner(
  parsed: { quizId: string; grantToken: string },
  tokenHash: string,
): Promise<ActionResult<QuizSpinOutcome>> {
  try {
    const ctx = await loadQuizActionContext(parsed.quizId);
    if (!ctx.ok) return { ok: false, error: "Tour offert indisponible." };

    // Clé PARTAGÉE (quiz + IP) : fail-OPEN, observabilité seule.
    await observeQuizPressure(parsed.quizId, clientIpFromHeaders(await headers()));

    const { data, error } = await ctx.admin.rpc("consume_quiz_spin_grant", {
      p_quiz_id: parsed.quizId,
      p_player_token_hash: tokenHash,
      p_grant_token: parsed.grantToken,
    });
    if (error) {
      reportError("quiz.consumeSpin", error.message);
      return { ok: false, error: GENERIC_ERROR };
    }

    const grant = mapQuizSpinGrant(data);
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

    // PONT `campaign` DU TOUR OFFERT (voir `bridgeOfferedSpinToCampaign`).
    //
    // Ce module pose déjà le pont de SA famille ; aucun ne posait celui de la
    // CAMPAGNE sur laquelle le tour offert est réellement joué. La
    // `participations` que `claimPrize` va créer est pourtant résolue par le
    // triplet (`campaign`, campaign_id, player_key) : sans ce pont, son
    // `player_id` reste null et le lot n'apparaît jamais sur `/portefeuille`.
    //
    // Posé ICI et pas plus haut : un jeton de claim émis est la condition
    // exacte sous laquelle une participation peut naître. Un tour perdant ou
    // sans lot n'a aucun lot à faire figurer nulle part.
    if (claimToken && grant.spinId) {
      await bridgeOfferedSpinToCampaign(ctx.admin, grant.spinId);
    }

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
    reportError("quiz.consumeSpin", err);
    return { ok: false, error: GENERIC_ERROR };
  }
}

// ────────────────────────────────────────────────────────────
// getQuizState / getQuizLeaderboard — repli polling (page suivable)
// ────────────────────────────────────────────────────────────

/**
 * Repli POLLING : renvoie l'état public d'un quiz. Passe le hash du cookie, s'il
 * existe, pour la vue « moi » (questions répondues, score, lot) ; la bonne réponse
 * d'une question NON répondue n'est jamais servie (invariant #2, appliqué par
 * quiz_public_state ET par le mapping).
 */
export async function getQuizState(input: {
  quizId: string;
}): Promise<QuizPublicState> {
  const parsed = getQuizStateSchema.safeParse(input);
  if (!parsed.success) return mapQuizPublicState(null);

  const ctx = await loadQuizActionContext(parsed.data.quizId);
  if (!ctx.ok) return mapQuizPublicState(null);

  // Observabilité seule (clé partagée, jamais un refus) : le poll est fréquent et
  // légitime, on ne le bride pas.
  await observeQuizPressure(parsed.data.quizId, clientIpFromHeaders(await headers()));

  const store = await cookies();
  const token = store.get(quizTokenCookieName(parsed.data.quizId))?.value;
  const tokenHash = token ? hashPlayerToken(token) : undefined;

  const { data, error } = await ctx.admin.rpc("quiz_public_state", {
    p_quiz_id: parsed.data.quizId,
    p_player_token_hash: tokenHash,
  });
  if (error) {
    reportError("quiz.state", error.message);
    return mapQuizPublicState(null);
  }
  return mapQuizPublicState(data);
}

/**
 * Classement public d'un quiz (participations terminées) : score décroissant puis
 * rapidité, ex æquo partagés — l'ordre et les rangs viennent de SQL
 * (quiz_leaderboard), aucun calcul d'autorité ici. La charge utile ne contient
 * AUCUN email : prénom / avatar / score / temps seulement.
 */
export async function getQuizLeaderboard(input: {
  quizId: string;
  limit?: number;
}): Promise<QuizLeaderboardEntry[]> {
  const parsed = getQuizLeaderboardSchema.safeParse({
    quizId: input.quizId,
    limit: input.limit ?? 50,
  });
  if (!parsed.success) return [];

  const ctx = await loadQuizActionContext(parsed.data.quizId);
  if (!ctx.ok) return [];

  await observeQuizPressure(parsed.data.quizId, clientIpFromHeaders(await headers()));

  const { data, error } = await ctx.admin.rpc("quiz_leaderboard", {
    p_quiz_id: parsed.data.quizId,
    p_limit: parsed.data.limit,
    p_offset: 0,
  });
  if (error) {
    reportError("quiz.leaderboard", error.message);
    return [];
  }
  return mapQuizLeaderboard(data);
}

// ════════════════════════════════════════════════════════════
// Dashboard commerçant — quiz (session + RLS éditeurs)
// ════════════════════════════════════════════════════════════

type EditorSupabase = Awaited<ReturnType<typeof createClient>>;

/**
 * Crée un quiz (brouillon) avec des défauts sûrs : aucun gain (`none`), donc rien
 * à provisionner. Le public_slug est posé par le trigger SQL
 * (service-authoritatif) — on ne l'envoie jamais à la création.
 */
export async function createQuiz(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = createQuizSchema.safeParse({ name: formData.get("name") });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0].message };
  }

  const { user, organization, role } = await getUserAndOrg();
  if (!user || !organization) redirect("/login");
  if (role !== "owner" && role !== "editor") return { ok: false, error: NOT_EDITOR };

  const supabase = await createClient();
  const { data: quiz, error } = await supabase
    .from("quizzes")
    .insert({
      organization_id: organization.id,
      name: parsed.data.name,
      // public_slug OMIS : posé par le trigger quizzes_set_defaults.
    })
    .select("id")
    .single();

  if (error || !quiz) {
    console.error("[quiz] create:", error?.message);
    return { ok: false, error: "Impossible de créer le quiz" };
  }

  revalidatePath("/dashboard/quiz");
  redirect(`/dashboard/quiz/${quiz.id}`);
}

/** Réglages d'un quiz (nom, thème, URL publique, consigne d'introduction). */
export async function updateQuiz(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = updateQuizSchema.safeParse({
    id: formData.get("id"),
    name: formData.get("name"),
    theme: formData.get("theme"),
    public_slug: formData.get("public_slug") ?? "",
    intro_text: formData.get("intro_text") ?? "",
    // Le réglage n'est lu que si le formulaire porte RÉELLEMENT le champ.
    // '' = « sans limite », valeur LÉGITIME → `has`, jamais `get() ?? ""` :
    // sinon la sauvegarde de tout autre formulaire de la page (la dotation,
    // par exemple) remettrait l'échéance à « sans limite » sans que le
    // commerçant y ait touché.
    code_ttl_days: formData.has("code_ttl_days")
      ? formData.get("code_ttl_days")
      : undefined,
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0].message };
  }

  const { user, organization, role } = await getUserAndOrg();
  if (!user || !organization) redirect("/login");
  if (role !== "owner" && role !== "editor") return { ok: false, error: NOT_EDITOR };

  const supabase = await createClient();
  const { error } = await supabase
    .from("quizzes")
    .update({
      name: parsed.data.name,
      theme: parsed.data.theme,
      public_slug: parsed.data.public_slug ?? undefined,
      intro_text: parsed.data.intro_text || null,
      updated_at: new Date().toISOString(),
      // Champ absent du formulaire → colonne non touchée (pas remise à null).
      ...(parsed.data.code_ttl_days !== undefined
        ? { code_ttl_days: parsed.data.code_ttl_days }
        : {}),
    })
    .eq("id", parsed.data.id)
    .eq("organization_id", organization.id);

  if (error) {
    if (error.code === "23505") {
      return { ok: false, error: "Cette URL publique est déjà utilisée" };
    }
    console.error("[quiz] update:", error.message);
    return { ok: false, error: "Mise à jour impossible" };
  }

  revalidatePath("/dashboard/quiz");
  revalidatePath(`/dashboard/quiz/${parsed.data.id}`);
  return { ok: true, data: undefined };
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
 * Règle le mode de récompense et la dotation. Le stock est FINI et OBLIGATOIRE
 * (ADR-031) : il borne le nombre de joueurs récompensés, et la base refuse toute
 * émission au-delà (décrément atomique + CHECK claimed <= stock). Le tirage déjà
 * effectué n'est JAMAIS remis à `pending` par ce chemin (colonnes RPC-only).
 */
export async function updateQuizReward(input: {
  id: string;
  rewardMode: "threshold" | "draw" | "ranking" | "instant" | "none";
  rewardThreshold?: string | number;
  drawTopN?: string | number;
  rewardLabel?: string;
  rewardDetails?: string;
  rewardStock?: string | number;
  targetWheelId?: string;
}): Promise<ActionResult> {
  const parsed = updateQuizRewardSchema.safeParse({
    id: input.id,
    reward_mode: input.rewardMode,
    reward_threshold: input.rewardThreshold ?? "",
    draw_top_n: input.drawTopN ?? "",
    reward_label: input.rewardLabel ?? "",
    reward_details: input.rewardDetails ?? "",
    reward_stock: input.rewardStock ?? "",
    target_wheel_id: input.targetWheelId ?? "",
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0].message };
  }

  const { user, organization, role } = await getUserAndOrg();
  if (!user || !organization) redirect("/login");
  if (role !== "owner" && role !== "editor") return { ok: false, error: NOT_EDITOR };

  const supabase = await createClient();
  const { data: current } = await supabase
    .from("quizzes")
    .select("id, reward_claimed_count, draw_state")
    .eq("id", parsed.data.id)
    .eq("organization_id", organization.id)
    .maybeSingle();
  if (!current) return { ok: false, error: "Quiz introuvable" };

  // Le stock ne peut pas descendre sous les lots DÉJÀ émis : le CHECK SQL
  // (claimed <= stock) le refuserait par une erreur brute 23514.
  const claimed = (current.reward_claimed_count as number) ?? 0;
  if (parsed.data.reward_stock < claimed) {
    return {
      ok: false,
      error: `${claimed} lot(s) ont déjà été remis : le stock ne peut pas être inférieur.`,
    };
  }
  if (parsed.data.reward_mode === "none" && claimed > 0) {
    return {
      ok: false,
      error: "Des lots ont déjà été remis : ce quiz ne peut plus passer « sans gain ».",
    };
  }
  // Le tirage est ONE-SHOT (invariant #5) : changer de mode différé après coup
  // n'est pas rejouable, on refuse plutôt que de laisser croire à un second tirage.
  if (
    current.draw_state === "done" &&
    parsed.data.reward_mode !== "draw" &&
    parsed.data.reward_mode !== "ranking"
  ) {
    return {
      ok: false,
      error: "Le tirage de ce quiz est déjà effectué : son mode ne peut plus changer.",
    };
  }

  if (
    parsed.data.target_wheel_id &&
    !(await wheelBelongsToOrg(supabase, parsed.data.target_wheel_id, organization.id))
  ) {
    return { ok: false, error: "Roue introuvable dans votre organisation" };
  }

  const { error } = await supabase
    .from("quizzes")
    .update({
      reward_mode: parsed.data.reward_mode,
      reward_threshold: parsed.data.reward_threshold,
      draw_top_n: parsed.data.draw_top_n,
      reward_label: parsed.data.reward_label,
      reward_details: parsed.data.reward_details || null,
      reward_stock: parsed.data.reward_stock,
      target_wheel_id: parsed.data.target_wheel_id,
      updated_at: new Date().toISOString(),
    })
    .eq("id", parsed.data.id)
    .eq("organization_id", organization.id);

  if (error) {
    console.error("[quiz] update reward:", error.message);
    return { ok: false, error: "Mise à jour impossible" };
  }

  revalidatePath(`/dashboard/quiz/${parsed.data.id}`);
  return { ok: true, data: undefined };
}

/** Quiz prêt à l'activation ? Message d'erreur sinon (null = OK). */
function activationBlocker(quiz: {
  reward_mode: string;
  reward_label: string;
  target_wheel_id: string | null;
  reward_stock: number;
  questionCount: number;
}): string | null {
  if (quiz.questionCount < 1) {
    return "Ajoutez au moins une question avant d'activer le quiz.";
  }
  if (quiz.reward_mode !== "none") {
    if (!quiz.target_wheel_id && !quiz.reward_label.trim()) {
      return "Indiquez le libellé du lot (ou choisissez une roue offerte) avant d'activer.";
    }
    if (quiz.reward_stock < 1) {
      return "Indiquez le stock du lot : il borne le nombre de joueurs récompensés.";
    }
  }
  return null;
}

/**
 * Change le statut d'un quiz. L'activation exige le module actif (abonnement
 * compris) et une configuration cohérente (au moins une question, dotation
 * renseignée dès qu'un mode émet un lot).
 */
export async function setQuizStatus(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = setQuizStatusSchema.safeParse({
    id: formData.get("id"),
    status: formData.get("status"),
  });
  if (!parsed.success) return { ok: false, error: "Données invalides" };

  const { user, organization, role } = await getUserAndOrg();
  if (!user || !organization) redirect("/login");
  if (role !== "owner" && role !== "editor") return { ok: false, error: NOT_EDITOR };

  const { id, status } = parsed.data;
  const supabase = await createClient();

  // `quizzes.status` n'est plus écrivable par `authenticated` (migration
  // 20260905120000) : les DEUX transitions passent par la RPC gardée, qui
  // n'exige le droit que pour publier — archiver ou repasser en brouillon
  // reste possible sans abonnement.
  const transitionQuiz = async () => {
    const { data, error } = await supabase.rpc("set_quiz_status", {
      p_organization_id: organization.id,
      p_quiz_id: id,
      p_status: status,
    });
    const refus = refusTransition(
      { data, error },
      {
        introuvable: "Quiz introuvable",
        module: "Le module Quiz n'est pas activé sur votre compte.",
        role: NOT_EDITOR,
        echec: "Mise à jour impossible",
      },
    );
    if (refus) console.error("[quiz] status:", error?.message ?? `rpc=${data}`);
    return refus;
  };

  if (status !== "active") {
    const refus = await transitionQuiz();
    if (refus) return { ok: false, error: refus };
    revalidatePath("/dashboard/quiz");
    revalidatePath(`/dashboard/quiz/${id}`);
    return { ok: true, data: undefined };
  }

  // Activation.
  if (!hasQuizAccess(organization)) {
    return { ok: false, error: "Le module Quiz n'est pas activé sur votre compte." };
  }
  const { data: quiz } = await supabase
    .from("quizzes")
    .select("id, reward_mode, reward_label, target_wheel_id, reward_stock")
    .eq("id", id)
    .eq("organization_id", organization.id)
    .maybeSingle();
  if (!quiz) return { ok: false, error: "Quiz introuvable" };

  const { count } = await supabase
    .from("quiz_questions")
    .select("id", { count: "exact", head: true })
    .eq("quiz_id", id)
    .eq("organization_id", organization.id);

  const blocker = activationBlocker({
    reward_mode: quiz.reward_mode as string,
    reward_label: (quiz.reward_label as string) ?? "",
    target_wheel_id: (quiz.target_wheel_id as string | null) ?? null,
    reward_stock: (quiz.reward_stock as number) ?? 0,
    questionCount: count ?? 0,
  });
  if (blocker) return { ok: false, error: blocker };

  const refus = await transitionQuiz();
  if (refus) return { ok: false, error: refus };

  revalidatePath("/dashboard/quiz");
  revalidatePath(`/dashboard/quiz/${id}`);
  return { ok: true, data: undefined };
}

export async function deleteQuiz(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = deleteQuizSchema.safeParse({ id: formData.get("id") });
  if (!parsed.success) return { ok: false, error: "Données invalides" };

  const { user, organization, role } = await getUserAndOrg();
  if (!user || !organization) redirect("/login");
  if (role !== "owner" && role !== "editor") return { ok: false, error: NOT_EDITOR };

  const supabase = await createClient();

  // ── GARDE : des codes QUIZ- attendent-ils encore en caisse ? ──
  //
  // `quiz_rewards` cascade depuis `quizzes` (20260803120000:789-790). Le texte
  // de confirmation annonçait « ce quiz, ses questions et les participations »
  // — le joueur, lui, tient un code que la caisse ne retrouvera plus.
  //
  // Prédicat sur `code`, pas sur `source` : une récompense en TOUR OFFERT porte
  // un `spin_grant_token` et aucun code, et une émission en rupture de stock
  // n'a ni l'un ni l'autre. Compter les lignes plutôt que les codes gonflerait
  // le chiffre avec des lots qui n'existent pas.
  const verdict = verdictCodesEnAttente(
    await supabase
      .from("quiz_rewards")
      .select("id", { count: "exact", head: true })
      .eq("quiz_id", parsed.data.id)
      .eq("organization_id", organization.id)
      .not("code", "is", null)
      .is("redeemed_at", null),
  );

  if (verdict.etat === "indisponible") {
    reportError("quiz.delete-outstanding", verdict.motif);
    return { ok: false, error: COMPTAGE_INDISPONIBLE };
  }

  if (verdict.etat === "en-attente" && formData.get("confirm_outstanding") !== "1") {
    return {
      ok: false,
      error:
        `${verdict.nombre} code(s) QUIZ- n'ont pas encore été retirés en caisse. ` +
        "Supprimer le quiz les rendra introuvables : vos gagnants se verront " +
        "refuser un lot qu'ils ont vraiment obtenu. " +
        `${QUIZ_DELETE_LOSS_HINT} pour supprimer quand même.`,
    };
  }

  const { error } = await supabase
    .from("quizzes")
    .delete()
    .eq("id", parsed.data.id)
    .eq("organization_id", organization.id);

  if (error) {
    console.error("[quiz] delete:", error.message);
    return { ok: false, error: "Suppression impossible" };
  }

  revalidatePath("/dashboard/quiz");
  redirect("/dashboard/quiz");
}

// ── Questions (4 formes de réponse, 7 modèles d'UI) ──

/**
 * Champs d'une question normalisés selon son TYPE MOTEUR (miroir du CHECK
 * quiz_questions_shape_check / is_valid_quiz_question) : écraser les champs
 * hors-usage à null évite une erreur SQL brute 23514. `preset` (modèle d'UI),
 * `image_url` et `time_limit_seconds` sont ORTHOGONAUX au type et passent tels
 * quels.
 */
function questionFieldsForType(q: {
  question_type: "choice" | "number" | "ranking" | "text";
  preset: string;
  prompt: string;
  options: Array<{ id: string; label: string }>;
  correct_answer: QuizSolutionInput;
  image_url: string | null;
  time_limit_seconds: number | null;
  points: number;
  tolerance: number | null;
  ranking_size: number | null;
}) {
  const usesOptions = q.question_type === "choice" || q.question_type === "ranking";
  return {
    question_type: q.question_type,
    preset: q.preset,
    prompt: q.prompt,
    options: usesOptions ? q.options : null,
    correct_answer: quizSolutionToJson(q.correct_answer),
    image_url: q.image_url,
    time_limit_seconds: q.time_limit_seconds,
    points: q.points,
    tolerance: q.question_type === "number" ? q.tolerance : null,
    ranking_size: q.question_type === "ranking" ? q.ranking_size : null,
    updated_at: new Date().toISOString(),
  };
}

export async function createQuizQuestion(input: {
  quizId: string;
  questionType: "choice" | "number" | "ranking" | "text";
  preset?: string;
  prompt: string;
  options?: Array<{ id: string; label: string }>;
  correctAnswer: QuizSolutionInput;
  imageUrl?: string;
  timeLimitSeconds?: string | number;
  points?: string | number;
  tolerance?: string | number;
  rankingSize?: string | number;
}): Promise<ActionResult<{ id: string }>> {
  const parsed = createQuizQuestionSchema.safeParse({
    quiz_id: input.quizId,
    question_type: input.questionType,
    preset: input.preset ?? "multiple_choice",
    prompt: input.prompt,
    options: input.options ?? [],
    correct_answer: input.correctAnswer,
    image_url: input.imageUrl ?? "",
    time_limit_seconds: input.timeLimitSeconds ?? "",
    points: input.points ?? 1,
    tolerance: input.tolerance ?? "",
    ranking_size: input.rankingSize ?? "",
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0].message };
  }

  const { user, organization, role } = await getUserAndOrg();
  if (!user || !organization) redirect("/login");
  if (role !== "owner" && role !== "editor") return { ok: false, error: NOT_EDITOR };

  const supabase = await createClient();
  const { data: quiz } = await supabase
    .from("quizzes")
    .select("id")
    .eq("id", parsed.data.quiz_id)
    .eq("organization_id", organization.id)
    .maybeSingle();
  if (!quiz) return { ok: false, error: "Quiz introuvable" };

  // Position = fin de liste (unicité (quiz_id, position)).
  const { data: existing } = await supabase
    .from("quiz_questions")
    .select("position")
    .eq("quiz_id", parsed.data.quiz_id)
    .eq("organization_id", organization.id);
  const position =
    (existing ?? []).length === 0
      ? 0
      : Math.max(...(existing ?? []).map((q) => (q.position as number) ?? 0)) + 1;

  const { data: question, error } = await supabase
    .from("quiz_questions")
    .insert({
      quiz_id: parsed.data.quiz_id,
      organization_id: organization.id,
      position,
      ...questionFieldsForType({
        ...parsed.data,
        correct_answer: parsed.data.correct_answer as QuizSolutionInput,
      }),
    })
    .select("id")
    .single();
  if (error || !question) {
    console.error("[quiz] create question:", error?.message);
    return { ok: false, error: "Impossible d'ajouter la question" };
  }

  revalidatePath(`/dashboard/quiz/${parsed.data.quiz_id}`);
  return { ok: true, data: { id: question.id } };
}

export async function updateQuizQuestion(input: {
  id: string;
  questionType: "choice" | "number" | "ranking" | "text";
  preset?: string;
  prompt: string;
  options?: Array<{ id: string; label: string }>;
  correctAnswer: QuizSolutionInput;
  imageUrl?: string;
  timeLimitSeconds?: string | number;
  points?: string | number;
  tolerance?: string | number;
  rankingSize?: string | number;
}): Promise<ActionResult> {
  const parsed = updateQuizQuestionSchema.safeParse({
    id: input.id,
    question_type: input.questionType,
    preset: input.preset ?? "multiple_choice",
    prompt: input.prompt,
    options: input.options ?? [],
    correct_answer: input.correctAnswer,
    image_url: input.imageUrl ?? "",
    time_limit_seconds: input.timeLimitSeconds ?? "",
    points: input.points ?? 1,
    tolerance: input.tolerance ?? "",
    ranking_size: input.rankingSize ?? "",
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0].message };
  }

  const { user, organization, role } = await getUserAndOrg();
  if (!user || !organization) redirect("/login");
  if (role !== "owner" && role !== "editor") return { ok: false, error: NOT_EDITOR };

  const supabase = await createClient();
  const { data: existing } = await supabase
    .from("quiz_questions")
    .select("quiz_id")
    .eq("id", parsed.data.id)
    .eq("organization_id", organization.id)
    .maybeSingle();
  if (!existing) return { ok: false, error: "Question introuvable" };

  const { error } = await supabase
    .from("quiz_questions")
    .update(
      questionFieldsForType({
        ...parsed.data,
        correct_answer: parsed.data.correct_answer as QuizSolutionInput,
      }),
    )
    .eq("id", parsed.data.id)
    .eq("organization_id", organization.id);
  if (error) {
    console.error("[quiz] update question:", error.message);
    return { ok: false, error: "Mise à jour impossible" };
  }

  revalidatePath(`/dashboard/quiz/${existing.quiz_id}`);
  return { ok: true, data: undefined };
}

export async function deleteQuizQuestion(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = deleteQuizQuestionSchema.safeParse({ id: formData.get("id") });
  if (!parsed.success) return { ok: false, error: "Données invalides" };

  const { user, organization, role } = await getUserAndOrg();
  if (!user || !organization) redirect("/login");
  if (role !== "owner" && role !== "editor") return { ok: false, error: NOT_EDITOR };

  const supabase = await createClient();
  const { data: question } = await supabase
    .from("quiz_questions")
    .select("quiz_id")
    .eq("id", parsed.data.id)
    .eq("organization_id", organization.id)
    .maybeSingle();
  if (!question) return { ok: false, error: "Question introuvable" };

  const { error } = await supabase
    .from("quiz_questions")
    .delete()
    .eq("id", parsed.data.id)
    .eq("organization_id", organization.id);
  if (error) {
    console.error("[quiz] delete question:", error.message);
    return { ok: false, error: "Suppression impossible" };
  }

  revalidatePath(`/dashboard/quiz/${question.quiz_id}`);
  return { ok: true, data: undefined };
}

/**
 * Réordonne les questions d'un quiz selon la liste d'identifiants reçue. Le plan
 * est calculé par `planQuizReorder` (positions garées au-dessus du maximum avant
 * d'être redescendues) : aucun état intermédiaire ne viole l'unicité
 * (quiz_id, position), et le CHECK position >= 0 est respecté. Le formulaire
 * sérialise l'ordre en JSON (champ caché), comme la réorganisation des chasses.
 */
export async function reorderQuizQuestions(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  let order: unknown;
  try {
    order = JSON.parse(String(formData.get("order") ?? "[]"));
  } catch {
    return { ok: false, error: "Données invalides" };
  }

  const parsed = reorderQuizQuestionsSchema.safeParse({
    quiz_id: formData.get("quiz_id"),
    order,
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0].message };
  }

  const { user, organization, role } = await getUserAndOrg();
  if (!user || !organization) redirect("/login");
  if (role !== "owner" && role !== "editor") return { ok: false, error: NOT_EDITOR };

  const supabase = await createClient();
  const { data: questions } = await supabase
    .from("quiz_questions")
    .select("id, position")
    .eq("quiz_id", parsed.data.quiz_id)
    .eq("organization_id", organization.id);
  if (!questions || questions.length === 0) {
    return { ok: false, error: "Quiz introuvable" };
  }

  const moves = planQuizReorder(
    questions.map((q) => ({ id: q.id as string, position: q.position as number })),
    parsed.data.order,
  );
  if (moves === null) {
    return { ok: false, error: "Réorganisation impossible : liste de questions incomplète." };
  }

  for (const move of moves) {
    const { error } = await supabase
      .from("quiz_questions")
      .update({ position: move.position })
      .eq("id", move.id)
      .eq("quiz_id", parsed.data.quiz_id)
      .eq("organization_id", organization.id);
    if (error) {
      reportError("quiz.reorder", error.message);
      return { ok: false, error: "Réorganisation impossible" };
    }
  }

  revalidatePath(`/dashboard/quiz/${parsed.data.quiz_id}`);
  return { ok: true, data: undefined };
}

// ── Tirage / classement différé (draw / ranking) ──

/**
 * Déclenche le tirage au sort (mode `draw`) ou l'attribution au classement (mode
 * `ranking`). L'appel passe par la session de l'éditeur : draw_quiz_winners est
 * gardée `is_org_editor(p_organization_id)` côté base — l'autorisation n'est donc
 * pas seulement applicative. L'opération est ATOMIQUE et IDEMPOTENTE (invariant
 * #5) : un second appel renvoie `already_drawn` sans rien émettre, et la boucle
 * d'émission est bornée par le stock restant.
 */
export async function drawQuizWinners(
  // L'état précédent doit porter le MÊME type que le retour, sinon
  // `useActionState` ne se typait pas côté client et imposait un contournement.
  _prev: QuizDrawActionResult | null,
  formData: FormData,
): Promise<QuizDrawActionResult> {
  const parsed = drawQuizWinnersSchema.safeParse({ id: formData.get("id") });
  if (!parsed.success) return { ok: false, error: "Données invalides" };

  const { user, organization, role } = await getUserAndOrg();
  if (!user || !organization) redirect("/login");
  if (role !== "owner" && role !== "editor") return { ok: false, error: NOT_EDITOR };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("draw_quiz_winners", {
    p_organization_id: organization.id,
    p_quiz_id: parsed.data.id,
  });
  if (error) {
    console.error("[quiz] draw:", error.message);
    return { ok: false, error: "Tirage impossible" };
  }

  const result = mapQuizDraw(data);
  if (result.state === "unavailable") return { ok: false, error: "Quiz introuvable" };
  if (result.state === "invalid_mode") {
    return {
      ok: false,
      error: "Le tirage ne s'applique qu'aux modes « tirage au sort » et « classement ».",
    };
  }
  // AUCUN LOT ÉMIS : le tirage n'a PAS été consommé côté base (`draw_state` reste
  // `pending`, cf. draw_quiz_winners), il reste donc relançable — ce n'est pas un
  // échec, il n'y avait rien à récompenser. On le dit tel quel plutôt que de
  // renvoyer `ok: true` : l'éditeur affiche « Tirage effectué : 0 gagnant(s) » sur
  // un succès, ce qui laisserait croire que le tirage est passé et perdu.
  if (result.state === "no_participants") {
    return {
      ok: false,
      // `retryable` est le marqueur STRUCTUREL de ce cas : sans lui, l'éditeur
      // devait reconnaître un tirage relançable en cherchant « Le tirage reste »
      // DANS LE MESSAGE — une simple reformulation aurait cassé l'affichage.
      retryable: true,
      error: result.outOfStock
        ? "Aucun lot disponible : le stock est épuisé. Le tirage reste possible après réapprovisionnement."
        : "Personne n'a encore terminé ce quiz : il n'y a rien à tirer pour l'instant. Le tirage reste disponible, relancez-le plus tard.",
    };
  }

  revalidatePath(`/dashboard/quiz/${parsed.data.id}`);
  return { ok: true, data: result };
}
