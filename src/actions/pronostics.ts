"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getUserAndOrg } from "@/lib/auth";
import { getCompetition, getEntry, isAutoCompetition } from "@/lib/competitions";
import { syncContestFixtures } from "@/lib/contest-sync";
import { monitored, reportError } from "@/lib/monitoring";
import {
  generatePlayerToken,
  hashPlayerToken,
  isPredictionOpen,
} from "@/lib/pronostics";
import {
  contestTokenCookieName,
  loadContestContext,
} from "@/lib/pronostics-context";
import { RATE_LIMITS, rateLimit, rateLimitBucket } from "@/lib/rate-limit";
import { clientIpFromHeaders } from "@/lib/request-ip";
import { sendContestRecoveryEmail } from "@/lib/resend";
import { APP_URL } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { hasPronosticsAccess } from "@/lib/subscription";
import { verifyTurnstile } from "@/lib/turnstile";
import { randomCode, type ActionResult } from "@/lib/utils";
import {
  addMatchSchema,
  createContestSchema,
  deleteContestSchema,
  deleteMatchSchema,
  finalizeContestSchema,
  recoveryConfirmSchema,
  recoveryRequestSchema,
  registerPlayerSchema,
  setAwardStatusSchema,
  setMatchResultSchema,
  submitPredictionSchema,
  syncContestSchema,
  updateContestRewardsSchema,
  updateContestSchema,
  updateContestScoringSchema,
  updateContestTiebreakerSchema,
  updatePlayerSchema,
} from "@/lib/validations/pronostics";
import { headers } from "next/headers";

// ────────────────────────────────────────────────────────────
// Dashboard commerçant (session + RLS éditeurs)
// ────────────────────────────────────────────────────────────

/**
 * Messages lisibles pour les refus des RPC de règlement (gel,
 * clôture, transitions) — le détail technique part en console.
 */
function contestRuleError(message: string | undefined, fallback: string): string {
  if (!message) return fallback;
  if (message.includes("locked: reason required")) {
    return "Championnat verrouillé : indiquez un motif d'au moins 10 caractères — il sera journalisé.";
  }
  if (message.includes("locked: question frozen")) {
    return "La question subsidiaire ne peut plus changer après le premier pronostic ou coup d'envoi.";
  }
  if (message.includes("contest finalized")) {
    return "Championnat clôturé : règlement et classement sont définitifs.";
  }
  if (message.includes("scoring tiers")) {
    return "Les paliers doivent être strictement décroissants (exact > différence > vainqueur).";
  }
  if (message.includes("matches pending")) {
    return "Des matchs ne sont pas encore joués : renseignez leurs résultats (ou supprimez-les) avant la clôture.";
  }
  if (message.includes("contest not started")) {
    return "Un brouillon ne se clôture pas : ouvrez d'abord le championnat.";
  }
  if (message.includes("invalid transition")) {
    return "Ce changement de statut n'est pas permis.";
  }
  if (message.includes("award already settled")) {
    return "Cette récompense est déjà réglée (remise ou annulée).";
  }
  if (message.includes("managed match")) {
    return "Ce match est géré par le calendrier officiel : il ne peut pas être supprimé à la main.";
  }
  return fallback;
}

export async function createContest(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = createContestSchema.safeParse({
    name: formData.get("name"),
    competition_key: formData.get("competition_key"),
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0].message };
  }

  const { user, organization } = await getUserAndOrg();
  if (!user || !organization) redirect("/login");

  // Module en option : jamais accessible sans l'addon (ni essai coupé).
  if (!hasPronosticsAccess(organization)) {
    return {
      ok: false,
      error:
        "Le module Pronostics n'est pas activé sur votre compte. Contactez-nous pour l'ajouter.",
    };
  }

  const supabase = await createClient();
  const { data: contest, error } = await supabase
    .from("contests")
    .insert({
      organization_id: organization.id,
      name: parsed.data.name,
      competition_key: parsed.data.competition_key,
      slug: randomCode(8),
    })
    .select("id")
    .single();

  if (error || !contest) {
    console.error("[pronostics] create:", error?.message);
    return { ok: false, error: "Impossible de créer le championnat" };
  }

  // Compétition du catalogue : le calendrier du fournisseur est importé
  // automatiquement — le commerçant n'a rien à saisir. Best-effort : un
  // fournisseur indisponible ne bloque pas la création (le bouton
  // « Synchroniser » et le cron rattraperont).
  if (isAutoCompetition(parsed.data.competition_key)) {
    try {
      await syncContestFixtures(createAdminClient(), {
        id: contest.id,
        organization_id: organization.id,
        competition_key: parsed.data.competition_key,
      });
    } catch (err) {
      reportError("pronostics.create.autosync", err);
    }
  }

  revalidatePath("/dashboard/pronostics");
  redirect(`/dashboard/pronostics/${contest.id}`);
}

export interface SyncOutcome {
  imported: number;
  resultsApplied: number;
  rescheduled: number;
}

/**
 * Synchronisation à la demande d'un championnat auto : importe les
 * nouveaux matchs annoncés, suit les reports et applique les résultats
 * (points recalculés aussitôt). Le cron fait la même chose chaque nuit.
 */
export async function syncContest(
  _prev: ActionResult<SyncOutcome> | null,
  formData: FormData,
): Promise<ActionResult<SyncOutcome>> {
  const parsed = syncContestSchema.safeParse({ id: formData.get("id") });
  if (!parsed.success) {
    return { ok: false, error: "Données invalides" };
  }

  const { user, organization, role } = await getUserAndOrg();
  if (!user || !organization) redirect("/login");
  if (role !== "owner" && role !== "editor") {
    return { ok: false, error: "Action non autorisée" };
  }
  if (!hasPronosticsAccess(organization)) {
    return { ok: false, error: "Le module Pronostics n'est pas activé." };
  }

  const allowed = await rateLimit(
    rateLimitBucket("prono:sync", organization.id, user.id),
    RATE_LIMITS.contestSync,
    { failClosed: true },
  );
  if (!allowed) {
    return {
      ok: false,
      error: "Trop de synchronisations rapprochées. Réessayez dans quelques minutes.",
    };
  }

  const supabase = await createClient();
  const { data: contest } = await supabase
    .from("contests")
    .select("id, organization_id, competition_key, slug")
    .eq("id", parsed.data.id)
    .eq("organization_id", organization.id)
    .maybeSingle();
  if (!contest) return { ok: false, error: "Championnat introuvable" };

  if (!isAutoCompetition(contest.competition_key)) {
    return {
      ok: false,
      error: "Cette compétition est en saisie manuelle.",
    };
  }

  try {
    const summary = await syncContestFixtures(createAdminClient(), contest);
    revalidatePath(`/dashboard/pronostics/${contest.id}`);
    revalidatePath(`/pronos/${contest.slug}`);
    return { ok: true, data: summary };
  } catch (err) {
    reportError("pronostics.sync", err);
    return {
      ok: false,
      error: "Fournisseur de calendriers indisponible, réessayez plus tard.",
    };
  }
}

export async function updateContest(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = updateContestSchema.safeParse({
    id: formData.get("id"),
    name: formData.get("name") ?? undefined,
    status: formData.get("status") ?? undefined,
    reason: formData.get("reason") ?? undefined,
    collect_email: formData.get("collection_settings") === "1"
      ? formData.get("collect_email") === "on"
      : undefined,
    collect_phone: formData.get("collection_settings") === "1"
      ? formData.get("collect_phone") === "on"
      : undefined,
  });
  if (!parsed.success) {
    return { ok: false, error: "Données invalides" };
  }

  const { user, organization } = await getUserAndOrg();
  if (!user || !organization) redirect("/login");

  const { id, status, reason, ...fields } = parsed.data;
  const supabase = await createClient();

  // L'activation d'un championnat exige le module actif (même règle que
  // l'activation de campagne avec l'abonnement).
  if (status === "active" && !hasPronosticsAccess(organization)) {
    return {
      ok: false,
      error: "Le module Pronostics n'est pas activé sur votre compte.",
    };
  }

  // Les transitions de statut passent par la RPC gardée : matrice de
  // transitions, motif exigé pour rouvrir/retirer, réouverture bloquée
  // après clôture — le tout journalisé.
  if (status) {
    const { data: ok, error } = await supabase.rpc("set_contest_status", {
      p_organization_id: organization.id,
      p_contest_id: id,
      p_status: status,
      p_reason: reason ?? null,
    });
    if (error || ok !== true) {
      console.error("[pronostics] statut:", error?.message);
      return {
        ok: false,
        error: contestRuleError(error?.message, "Mise à jour impossible"),
      };
    }
  }

  let slug: string | null = null;
  if (Object.keys(fields).length > 0) {
    const { data: updated, error } = await supabase
      .from("contests")
      .update(fields)
      .eq("id", id)
      .eq("organization_id", organization.id)
      .select("slug")
      .maybeSingle();
    if (error || !updated) {
      console.error("[pronostics] update:", error?.message);
      return { ok: false, error: "Mise à jour impossible" };
    }
    slug = updated.slug;
  } else if (status) {
    const { data: row } = await supabase
      .from("contests")
      .select("slug")
      .eq("id", id)
      .eq("organization_id", organization.id)
      .maybeSingle();
    slug = row?.slug ?? null;
  } else {
    return { ok: true, data: undefined };
  }

  revalidatePath("/dashboard/pronostics");
  revalidatePath(`/dashboard/pronostics/${id}`);
  if (slug) revalidatePath(`/pronos/${slug}`);
  return { ok: true, data: undefined };
}

export async function updateContestScoring(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = updateContestScoringSchema.safeParse({
    id: formData.get("id"),
    exact: formData.get("exact"),
    diff: formData.get("diff"),
    winner: formData.get("winner"),
    reason: formData.get("reason") ?? undefined,
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0].message };
  }

  const { user, organization } = await getUserAndOrg();
  if (!user || !organization) redirect("/login");

  const { id, exact, diff, winner, reason } = parsed.data;
  const supabase = await createClient();
  const { data: contest } = await supabase
    .from("contests")
    .select("slug")
    .eq("id", id)
    .eq("organization_id", organization.id)
    .maybeSingle();
  if (!contest) return { ok: false, error: "Championnat introuvable" };

  const { data: updated, error } = await supabase.rpc(
    "update_contest_scoring",
    {
      p_organization_id: organization.id,
      p_contest_id: id,
      p_exact: exact,
      p_diff: diff,
      p_winner: winner,
      p_reason: reason ?? null,
    },
  );

  if (error || updated !== true) {
    console.error("[pronostics] scoring:", error?.message);
    return {
      ok: false,
      error: contestRuleError(error?.message, "Enregistrement impossible"),
    };
  }

  revalidatePath(`/dashboard/pronostics/${id}`);
  revalidatePath(`/pronos/${contest.slug}`);
  return { ok: true, data: undefined };
}

export async function updateContestRewards(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = updateContestRewardsSchema.safeParse({
    id: formData.get("id"),
    rewards: formData.get("rewards"),
    reason: formData.get("reason") ?? undefined,
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0].message };
  }

  const { user, organization } = await getUserAndOrg();
  if (!user || !organization) redirect("/login");

  const supabase = await createClient();
  const { data: contest } = await supabase
    .from("contests")
    .select("slug")
    .eq("id", parsed.data.id)
    .eq("organization_id", organization.id)
    .maybeSingle();
  if (!contest) return { ok: false, error: "Championnat introuvable" };

  // RPC gardée : gel après le premier pronostic (motif journalisé),
  // refus après clôture — la colonne n'est plus modifiable en direct.
  const { data: updated, error } = await supabase.rpc(
    "update_contest_rewards",
    {
      p_organization_id: organization.id,
      p_contest_id: parsed.data.id,
      p_rewards: parsed.data.rewards,
      p_reason: parsed.data.reason ?? null,
    },
  );

  if (error || updated !== true) {
    console.error("[pronostics] rewards:", error?.message);
    return {
      ok: false,
      error: contestRuleError(error?.message, "Enregistrement impossible"),
    };
  }

  revalidatePath(`/dashboard/pronostics/${parsed.data.id}`);
  revalidatePath(`/pronos/${contest.slug}`);
  return { ok: true, data: undefined };
}

export async function deleteContest(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = deleteContestSchema.safeParse({ id: formData.get("id") });
  if (!parsed.success) {
    return { ok: false, error: "Données invalides" };
  }

  const { user, organization } = await getUserAndOrg();
  if (!user || !organization) redirect("/login");

  const supabase = await createClient();
  const { data: deletedSlug, error } = await supabase.rpc("delete_contest", {
    p_organization_id: organization.id,
    p_contest_id: parsed.data.id,
  });

  if (error || typeof deletedSlug !== "string") {
    console.error("[pronostics] delete:", error?.message ?? "championnat introuvable");
    return { ok: false, error: "Suppression impossible" };
  }

  revalidatePath(`/pronos/${deletedSlug}`);
  revalidatePath("/dashboard/pronostics");
  redirect("/dashboard/pronostics");
}

/**
 * Question subsidiaire (départage des ex æquo) : la question se fige au
 * premier pronostic/coup d'envoi, la réponse officielle reste saisissable
 * jusqu'à la clôture.
 */
export async function updateContestTiebreaker(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = updateContestTiebreakerSchema.safeParse({
    id: formData.get("id"),
    question: formData.get("question") ?? "",
    answer: formData.get("answer") ?? "",
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0].message };
  }

  const { user, organization } = await getUserAndOrg();
  if (!user || !organization) redirect("/login");

  const supabase = await createClient();
  const { data: contest } = await supabase
    .from("contests")
    .select("slug")
    .eq("id", parsed.data.id)
    .eq("organization_id", organization.id)
    .maybeSingle();
  if (!contest) return { ok: false, error: "Championnat introuvable" };

  const { data: ok, error } = await supabase.rpc("update_contest_tiebreaker", {
    p_organization_id: organization.id,
    p_contest_id: parsed.data.id,
    p_question: parsed.data.question || null,
    p_answer: parsed.data.answer === "" ? null : parsed.data.answer,
  });
  if (error || ok !== true) {
    console.error("[pronostics] tiebreaker:", error?.message);
    return {
      ok: false,
      error: contestRuleError(error?.message, "Enregistrement impossible"),
    };
  }

  revalidatePath(`/dashboard/pronostics/${parsed.data.id}`);
  revalidatePath(`/pronos/${contest.slug}`);
  return { ok: true, data: undefined };
}

/**
 * Clôture des récompenses : photographie le classement final (politique
 * d'ex æquo complète + tirage auditable), attribue un lot par rang
 * couvert par le règlement et fige définitivement le championnat.
 */
export async function finalizeContest(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = finalizeContestSchema.safeParse({
    id: formData.get("id"),
    tiebreaker_answer: formData.get("tiebreaker_answer") ?? "",
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0].message };
  }

  const { user, organization, role } = await getUserAndOrg();
  if (!user || !organization) redirect("/login");
  if (role !== "owner") {
    return {
      ok: false,
      error: "La clôture des récompenses est réservée au propriétaire.",
    };
  }

  const supabase = await createClient();
  const { data: contest } = await supabase
    .from("contests")
    .select("slug")
    .eq("id", parsed.data.id)
    .eq("organization_id", organization.id)
    .maybeSingle();
  if (!contest) return { ok: false, error: "Championnat introuvable" };

  const { error } = await supabase.rpc("finalize_contest", {
    p_organization_id: organization.id,
    p_contest_id: parsed.data.id,
    p_tiebreaker_answer:
      parsed.data.tiebreaker_answer === "" ? null : parsed.data.tiebreaker_answer,
  });
  if (error) {
    console.error("[pronostics] finalize:", error.message);
    return {
      ok: false,
      error: contestRuleError(error.message, "Clôture impossible"),
    };
  }

  revalidatePath("/dashboard/pronostics");
  revalidatePath(`/dashboard/pronostics/${parsed.data.id}`);
  revalidatePath(`/pronos/${contest.slug}`);
  return { ok: true, data: undefined };
}

/** Remise (ou annulation motivée) d'une récompense attribuée. */
export async function setContestAwardStatus(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = setAwardStatusSchema.safeParse({
    id: formData.get("id"),
    status: formData.get("status"),
    reason: formData.get("reason") ?? undefined,
  });
  if (!parsed.success) {
    return { ok: false, error: "Données invalides" };
  }

  const { user, organization } = await getUserAndOrg();
  if (!user || !organization) redirect("/login");

  const supabase = await createClient();
  const { data: ok, error } = await supabase.rpc("set_contest_award_status", {
    p_organization_id: organization.id,
    p_award_id: parsed.data.id,
    p_status: parsed.data.status,
    p_reason: parsed.data.reason ?? null,
  });
  if (error || ok !== true) {
    console.error("[pronostics] award:", error?.message);
    return {
      ok: false,
      error: contestRuleError(error?.message, "Mise à jour impossible"),
    };
  }

  const contestId = String(formData.get("contest_id") ?? "");
  if (contestId) revalidatePath(`/dashboard/pronostics/${contestId}`);
  return { ok: true, data: undefined };
}

export async function addMatch(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = addMatchSchema.safeParse({
    contest_id: formData.get("contest_id"),
    home_key: formData.get("home_key") ?? "",
    away_key: formData.get("away_key") ?? "",
    home_name: formData.get("home_name"),
    away_name: formData.get("away_name"),
    kickoff_at: formData.get("kickoff_at"),
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0].message };
  }

  const { user, organization } = await getUserAndOrg();
  if (!user || !organization) redirect("/login");

  const supabase = await createClient();

  const { data: contest } = await supabase
    .from("contests")
    .select("id, competition_key, slug")
    .eq("id", parsed.data.contest_id)
    .eq("organization_id", organization.id)
    .maybeSingle();
  if (!contest) return { ok: false, error: "Championnat introuvable" };

  // La vignette (drapeau/initiales/couleur) vient toujours du catalogue
  // serveur — le client n'envoie que des clés.
  const competition = getCompetition(contest.competition_key);
  const resolveSide = (key: string, fallbackName: string) => {
    const entry = competition && key ? getEntry(competition, key) : undefined;
    return {
      key: entry?.key ?? "",
      name: entry?.name ?? fallbackName,
      badge: entry?.flag ?? entry?.short ?? "",
      color: entry?.color ?? "",
    };
  };
  const home = resolveSide(parsed.data.home_key, parsed.data.home_name);
  const away = resolveSide(parsed.data.away_key, parsed.data.away_name);

  if (
    (home.key && home.key === away.key) ||
    home.name.localeCompare(away.name, "fr", { sensitivity: "base" }) === 0
  ) {
    return { ok: false, error: "Choisissez deux participants différents" };
  }

  const { count } = await supabase
    .from("contest_matches")
    .select("id", { count: "exact", head: true })
    .eq("contest_id", contest.id);

  const { error } = await supabase.from("contest_matches").insert({
    contest_id: contest.id,
    organization_id: organization.id,
    home_key: home.key,
    home_name: home.name,
    home_badge: home.badge,
    home_color: home.color,
    away_key: away.key,
    away_name: away.name,
    away_badge: away.badge,
    away_color: away.color,
    kickoff_at: parsed.data.kickoff_at.toISOString(),
    position: count ?? 0,
  });

  if (error) {
    console.error("[pronostics] add match:", error.message);
    return { ok: false, error: "Impossible d'ajouter le match" };
  }

  revalidatePath(`/dashboard/pronostics/${contest.id}`);
  revalidatePath(`/pronos/${contest.slug}`);
  return { ok: true, data: undefined };
}

export async function deleteMatch(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = deleteMatchSchema.safeParse({
    id: formData.get("id"),
    reason: formData.get("reason") ?? undefined,
  });
  if (!parsed.success) {
    return { ok: false, error: "Données invalides" };
  }

  const { user, organization } = await getUserAndOrg();
  if (!user || !organization) redirect("/login");

  const supabase = await createClient();
  const { data: match } = await supabase
    .from("contest_matches")
    // FK nommée : deux relations existent vers contests (PGRST201 sinon).
    .select("contest_id, contests!contest_matches_contest_id_fkey(slug)")
    .eq("id", parsed.data.id)
    .eq("organization_id", organization.id)
    .maybeSingle();
  if (!match) return { ok: false, error: "Match introuvable" };

  const { data: deleted, error } = await supabase.rpc("delete_contest_match", {
    p_organization_id: organization.id,
    p_match_id: parsed.data.id,
    p_reason: parsed.data.reason ?? null,
  });

  if (error || deleted !== true) {
    console.error("[pronostics] delete match:", error?.message ?? "match introuvable");
    return {
      ok: false,
      error: contestRuleError(error?.message, "Suppression impossible"),
    };
  }

  revalidatePath(`/dashboard/pronostics/${match.contest_id}`);
  const slug = (match.contests as unknown as { slug: string } | null)?.slug;
  if (slug) revalidatePath(`/pronos/${slug}`);
  return { ok: true, data: undefined };
}

/**
 * Saisie (ou correction) du résultat d'un match : fige le score, marque
 * le match joué et recalcule les points de tous les pronostics du match
 * selon le barème du championnat.
 */
export async function setMatchResult(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = setMatchResultSchema.safeParse({
    id: formData.get("id"),
    home_score: formData.get("home_score"),
    away_score: formData.get("away_score"),
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0].message };
  }

  const { user, organization } = await getUserAndOrg();
  if (!user || !organization) redirect("/login");

  const supabase = await createClient();

  const { data: match } = await supabase
    .from("contest_matches")
    // FK nommée : deux relations existent vers contests (PGRST201 sinon).
    .select("id, contest_id, contests!contest_matches_contest_id_fkey(id, slug)")
    .eq("id", parsed.data.id)
    .eq("organization_id", organization.id)
    .maybeSingle();
  if (!match) return { ok: false, error: "Match introuvable" };

  const contest = match.contests as unknown as {
    id: string;
    slug: string;
  } | null;
  if (!contest) return { ok: false, error: "Championnat introuvable" };

  const { data: updated, error: updateError } = await supabase.rpc(
    "set_contest_match_result",
    {
      p_organization_id: organization.id,
      p_match_id: match.id,
      p_home_score: parsed.data.home_score,
      p_away_score: parsed.data.away_score,
    },
  );

  if (updateError || updated !== true) {
    console.error("[pronostics] set result:", updateError?.message);
    return { ok: false, error: "Enregistrement du résultat impossible" };
  }

  revalidatePath(`/dashboard/pronostics/${contest.id}`);
  revalidatePath(`/pronos/${contest.slug}`);
  return { ok: true, data: undefined };
}

// ────────────────────────────────────────────────────────────
// Parcours public /pronos (anonyme, service role via contexte)
// ────────────────────────────────────────────────────────────

export interface RegisterOutcome {
  firstName: string;
}

/**
 * Inscription d'un client au championnat. Pose un cookie httpOnly propre
 * au championnat ; seul le hash du jeton est stocké en base.
 */
export async function registerContestPlayer(input: {
  slug: string;
  firstName: string;
  avatar?: string;
  email?: string;
  phone?: string;
  acceptedTerms: boolean;
  /** Réponse à la question subsidiaire (départage des ex æquo). */
  tiebreakerGuess?: number | "";
  turnstileToken?: string;
}): Promise<ActionResult<RegisterOutcome>> {
  return monitored("pronostics.register", () => registerInner(input));
}

async function registerInner(
  input: Parameters<typeof registerContestPlayer>[0],
): Promise<ActionResult<RegisterOutcome>> {
  try {
    const parsed = registerPlayerSchema.safeParse({
      slug: input.slug,
      first_name: input.firstName,
      avatar: input.avatar ?? "",
      email: input.email ?? "",
      phone: input.phone ?? "",
      accepted_terms: input.acceptedTerms,
      tiebreaker_guess: input.tiebreakerGuess ?? "",
    });
    if (!parsed.success) {
      return { ok: false, error: parsed.error.issues[0].message };
    }

    const ctx = await loadContestContext(parsed.data.slug);
    if (!ctx.ok) return { ok: false, error: ctx.error };
    if (ctx.contest.status !== "active") {
      return { ok: false, error: "Les inscriptions sont closes." };
    }

    const ip = clientIpFromHeaders(await headers());
    if (!(await verifyTurnstile(input.turnstileToken, ip, "prono-register"))) {
      return {
        ok: false,
        error: "Vérification anti-robot échouée. Rechargez la page et réessayez.",
      };
    }
    if (
      !(await rateLimit(
        rateLimitBucket("prono:register:ip", ctx.contest.id, ip),
        RATE_LIMITS.pronoRegisterIp,
        { failClosed: true },
      ))
    ) {
      return {
        ok: false,
        error: "Trop de tentatives. Patientez un instant avant de réessayer.",
      };
    }

    // Exigences de collecte définies par le championnat (source de
    // vérité serveur, comme le claim de gain).
    if (ctx.contest.collect_email && !parsed.data.email) {
      return { ok: false, error: "Votre email est requis." };
    }
    if (ctx.contest.collect_phone && !parsed.data.phone) {
      return { ok: false, error: "Votre numéro de téléphone est requis." };
    }

    const token = generatePlayerToken();
    const { error } = await ctx.admin.from("contest_players").insert({
      contest_id: ctx.contest.id,
      organization_id: ctx.contest.organization_id,
      token_hash: hashPlayerToken(token),
      first_name: parsed.data.first_name,
      avatar: parsed.data.avatar,
      // Minimisation RGPD : un appel forgé ne peut pas injecter une donnée
      // que le commerçant a choisi de ne pas collecter.
      email: ctx.contest.collect_email ? parsed.data.email || null : null,
      phone: ctx.contest.collect_phone ? parsed.data.phone || null : null,
      accepted_terms: true,
      // La réponse subsidiaire n'existe que si le championnat pose la
      // question — même minimisation que pour email/téléphone.
      tiebreaker_guess:
        ctx.contest.tiebreaker_question && parsed.data.tiebreaker_guess !== ""
          ? parsed.data.tiebreaker_guess
          : null,
    });

    if (error) {
      // Index unique (contest_id, lower(email)) : déjà inscrit.
      if (error.code === "23505") {
        return {
          ok: false,
          error: "Cet email participe déjà à ce championnat.",
        };
      }
      reportError("pronostics.register", error.message);
      return { ok: false, error: "Inscription impossible, réessayez." };
    }

    const store = await cookies();
    store.set(contestTokenCookieName(ctx.contest.id), token, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      // Un championnat dure quelques semaines : 6 mois de marge.
      maxAge: 60 * 60 * 24 * 180,
    });

    return { ok: true, data: { firstName: parsed.data.first_name } };
  } catch (err) {
    reportError("pronostics.register", err);
    return { ok: false, error: "Une erreur est survenue, réessayez." };
  }
}

/**
 * Modifie le pseudo et l'avatar du joueur déjà inscrit. Identité par
 * cookie httpOnly (jamais l'identifiant en clair) ; ne touche ni aux
 * coordonnées collectées ni aux pronostics.
 */
export async function updateContestPlayer(input: {
  slug: string;
  firstName: string;
  avatar: string;
}): Promise<ActionResult<RegisterOutcome>> {
  return monitored("pronostics.update-player", () => updatePlayerInner(input));
}

async function updatePlayerInner(
  input: Parameters<typeof updateContestPlayer>[0],
): Promise<ActionResult<RegisterOutcome>> {
  try {
    const parsed = updatePlayerSchema.safeParse({
      slug: input.slug,
      first_name: input.firstName,
      avatar: input.avatar,
    });
    if (!parsed.success) {
      return { ok: false, error: parsed.error.issues[0].message };
    }

    const ctx = await loadContestContext(parsed.data.slug);
    if (!ctx.ok) return { ok: false, error: ctx.error };

    const store = await cookies();
    const token = store.get(contestTokenCookieName(ctx.contest.id))?.value;
    if (!token) {
      return { ok: false, error: "Inscrivez-vous d'abord au championnat." };
    }

    const ip = clientIpFromHeaders(await headers());
    if (
      !(await rateLimit(
        rateLimitBucket("prono:profile:ip", ctx.contest.id, ip),
        RATE_LIMITS.pronoPredictIp,
        { failClosed: true },
      ))
    ) {
      return {
        ok: false,
        error: "Trop de tentatives. Patientez un instant avant de réessayer.",
      };
    }

    const { data: updated, error } = await ctx.admin
      .from("contest_players")
      .update({
        first_name: parsed.data.first_name,
        avatar: parsed.data.avatar,
      })
      .eq("contest_id", ctx.contest.id)
      .eq("token_hash", hashPlayerToken(token))
      .select("id")
      .maybeSingle();

    if (error) {
      reportError("pronostics.update-player", error.message);
      return { ok: false, error: "Modification impossible, réessayez." };
    }
    if (!updated) {
      return { ok: false, error: "Inscrivez-vous d'abord au championnat." };
    }

    revalidatePath(`/pronos/${parsed.data.slug}`);
    return { ok: true, data: { firstName: parsed.data.first_name } };
  } catch (err) {
    reportError("pronostics.update-player", err);
    return { ok: false, error: "Une erreur est survenue, réessayez." };
  }
}

/**
 * Enregistre (ou met à jour) le pronostic du joueur sur un match, tant
 * que le coup d'envoi n'est pas passé. L'identité vient du cookie
 * httpOnly — rien d'usurpable côté client.
 */
export async function submitPrediction(input: {
  slug: string;
  matchId: string;
  homeScore: number;
  awayScore: number;
}): Promise<ActionResult> {
  return monitored("pronostics.predict", () => predictInner(input));
}

async function predictInner(
  input: Parameters<typeof submitPrediction>[0],
): Promise<ActionResult> {
  try {
    const parsed = submitPredictionSchema.safeParse({
      slug: input.slug,
      match_id: input.matchId,
      home_score: input.homeScore,
      away_score: input.awayScore,
    });
    if (!parsed.success) {
      return { ok: false, error: parsed.error.issues[0].message };
    }

    const ctx = await loadContestContext(parsed.data.slug);
    if (!ctx.ok) return { ok: false, error: ctx.error };
    if (ctx.contest.status !== "active") {
      return { ok: false, error: "Ce championnat est terminé." };
    }

    const ip = clientIpFromHeaders(await headers());
    if (
      !(await rateLimit(
        rateLimitBucket("prono:predict:ip", ctx.contest.id, ip),
        RATE_LIMITS.pronoPredictIp,
        { failClosed: true },
      ))
    ) {
      return {
        ok: false,
        error: "Trop de tentatives. Patientez un instant avant de réessayer.",
      };
    }

    const store = await cookies();
    const token = store.get(contestTokenCookieName(ctx.contest.id))?.value;
    if (!token) {
      return { ok: false, error: "Inscrivez-vous d'abord au championnat." };
    }

    const { data: player } = await ctx.admin
      .from("contest_players")
      .select("id")
      .eq("contest_id", ctx.contest.id)
      .eq("token_hash", hashPlayerToken(token))
      .maybeSingle();
    if (!player) {
      return { ok: false, error: "Inscrivez-vous d'abord au championnat." };
    }

    if (
      !(await rateLimit(
        rateLimitBucket("prono:predict:player", ctx.contest.id, player.id),
        RATE_LIMITS.pronoPredictPlayer,
        { failClosed: true },
      ))
    ) {
      return {
        ok: false,
        error: "Trop de tentatives. Patientez un instant avant de réessayer.",
      };
    }

    const match = ctx.matches.find((m) => m.id === parsed.data.match_id);
    if (!match) return { ok: false, error: "Match introuvable." };
    if (match.status === "finished" || !isPredictionOpen(match.kickoff_at)) {
      return { ok: false, error: "Ce match a commencé : pronostics fermés." };
    }

    const { data: saved, error } = await ctx.admin.rpc(
      "submit_contest_prediction",
      {
        p_contest_id: ctx.contest.id,
        p_match_id: match.id,
        p_player_id: player.id,
        p_home_score: parsed.data.home_score,
        p_away_score: parsed.data.away_score,
      },
    );

    if (error) {
      reportError("pronostics.predict", error.message);
      return { ok: false, error: "Pronostic non enregistré, réessayez." };
    }
    if (saved !== true) {
      return { ok: false, error: "Ce match a commencé : pronostics fermés." };
    }

    return { ok: true, data: undefined };
  } catch (err) {
    reportError("pronostics.predict", err);
    return { ok: false, error: "Une erreur est survenue, réessayez." };
  }
}

// ────────────────────────────────────────────────────────────
// Récupération d'identité joueur (lien magique par email)
// ────────────────────────────────────────────────────────────

/** Durée de vie d'un lien de récupération. */
const RECOVERY_TOKEN_TTL_MS = 30 * 60 * 1000;

/**
 * Demande de lien de récupération : réponse TOUJOURS neutre (pas
 * d'oracle d'inscription), jeton haché à usage unique (30 min), les
 * demandes précédentes du joueur sont invalidées, le tout sous double
 * rate limit (championnat+IP et email ciblé).
 */
export async function requestContestRecovery(input: {
  slug: string;
  email: string;
  turnstileToken?: string;
}): Promise<ActionResult<{ message: string }>> {
  const NEUTRAL =
    "Si cet email est inscrit à ce championnat, le lien de récupération vient de partir (valable 30 minutes).";
  try {
    const parsed = recoveryRequestSchema.safeParse(input);
    if (!parsed.success) {
      return { ok: false, error: parsed.error.issues[0].message };
    }

    const ctx = await loadContestContext(parsed.data.slug);
    if (!ctx.ok) return { ok: false, error: ctx.error };

    const ip = clientIpFromHeaders(await headers());
    if (!(await verifyTurnstile(input.turnstileToken, ip, "prono-recover"))) {
      return {
        ok: false,
        error: "Vérification anti-robot échouée. Rechargez la page et réessayez.",
      };
    }
    const [ipAllowed, emailAllowed] = await Promise.all([
      rateLimit(
        rateLimitBucket("prono:recover:ip", ctx.contest.id, ip),
        RATE_LIMITS.pronoRecoverIp,
        { failClosed: true },
      ),
      rateLimit(
        rateLimitBucket("prono:recover:email", ctx.contest.id, parsed.data.email),
        RATE_LIMITS.pronoRecoverEmail,
        { failClosed: true },
      ),
    ]);
    if (!ipAllowed || !emailAllowed) {
      return {
        ok: false,
        error: "Trop de demandes. Patientez avant de réessayer.",
      };
    }

    const { data: player } = await ctx.admin
      .from("contest_players")
      .select("id, first_name")
      .eq("contest_id", ctx.contest.id)
      .eq("email", parsed.data.email)
      .maybeSingle();

    // Email inconnu : même réponse, mêmes délais perçus — pas d'oracle.
    if (!player) return { ok: true, data: { message: NEUTRAL } };

    // Une demande chasse la précédente : un seul lien valide à la fois.
    await ctx.admin
      .from("contest_recovery_tokens")
      .delete()
      .eq("contest_id", ctx.contest.id)
      .eq("player_id", player.id);

    const rawToken = generatePlayerToken();
    const { error: insertError } = await ctx.admin
      .from("contest_recovery_tokens")
      .insert({
        contest_id: ctx.contest.id,
        organization_id: ctx.contest.organization_id,
        player_id: player.id,
        token_hash: hashPlayerToken(rawToken),
        expires_at: new Date(Date.now() + RECOVERY_TOKEN_TTL_MS).toISOString(),
      });
    if (insertError) {
      reportError("pronostics.recover.request", insertError.message);
      return { ok: false, error: "Une erreur est survenue, réessayez." };
    }

    const sent = await sendContestRecoveryEmail({
      to: parsed.data.email,
      contestName: ctx.contest.name,
      organizationName: ctx.organization.name,
      recoverUrl: `${APP_URL}/pronos/${ctx.contest.slug}/recover?token=${rawToken}`,
    });
    if (!sent) {
      // Panne d'envoi : mieux vaut le dire que laisser attendre un lien.
      return {
        ok: false,
        error: "Impossible d'envoyer l'email pour le moment, réessayez.",
      };
    }

    await ctx.admin.from("audit_logs").insert({
      organization_id: ctx.contest.organization_id,
      actor: "player",
      action: "contest.player.recovery_requested",
      metadata: { contest_id: ctx.contest.id, player_id: player.id },
    });

    return { ok: true, data: { message: NEUTRAL } };
  } catch (err) {
    reportError("pronostics.recover.request", err);
    return { ok: false, error: "Une erreur est survenue, réessayez." };
  }
}

/**
 * Confirmation du lien magique : consommation atomique du jeton (usage
 * unique), ROTATION du jeton appareil — les anciens appareils sont
 * déconnectés —, cookie reposé, récupération journalisée.
 */
export async function confirmContestRecovery(input: {
  slug: string;
  token: string;
}): Promise<ActionResult<{ firstName: string }>> {
  const INVALID =
    "Lien invalide ou expiré. Redemandez un lien depuis « Retrouver mes pronostics ».";
  try {
    const parsed = recoveryConfirmSchema.safeParse(input);
    if (!parsed.success) return { ok: false, error: INVALID };

    const ctx = await loadContestContext(parsed.data.slug);
    if (!ctx.ok) return { ok: false, error: ctx.error };

    const ip = clientIpFromHeaders(await headers());
    if (
      !(await rateLimit(
        rateLimitBucket("prono:recover:confirm", ctx.contest.id, ip),
        RATE_LIMITS.pronoRecoverIp,
        { failClosed: true },
      ))
    ) {
      return { ok: false, error: "Trop de tentatives. Patientez un instant." };
    }

    // Consommation atomique : seul le premier passage marque used_at.
    const now = new Date();
    const { data: consumed } = await ctx.admin
      .from("contest_recovery_tokens")
      .update({ used_at: now.toISOString() })
      .eq("contest_id", ctx.contest.id)
      .eq("token_hash", hashPlayerToken(parsed.data.token))
      .is("used_at", null)
      .gt("expires_at", now.toISOString())
      .select("player_id")
      .maybeSingle();
    if (!consumed) return { ok: false, error: INVALID };

    // Rotation du jeton appareil : la grille repart sur CET appareil,
    // tous les autres cookies deviennent orphelins.
    const deviceToken = generatePlayerToken();
    const { data: player, error: rotateError } = await ctx.admin
      .from("contest_players")
      .update({ token_hash: hashPlayerToken(deviceToken) })
      .eq("id", consumed.player_id)
      .eq("contest_id", ctx.contest.id)
      .select("first_name")
      .maybeSingle();
    if (rotateError || !player) {
      reportError("pronostics.recover.confirm", rotateError?.message ?? "joueur absent");
      return { ok: false, error: "Une erreur est survenue, réessayez." };
    }

    const store = await cookies();
    store.set(contestTokenCookieName(ctx.contest.id), deviceToken, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 24 * 180,
    });

    await ctx.admin.from("audit_logs").insert({
      organization_id: ctx.contest.organization_id,
      actor: "player",
      action: "contest.player.recovered",
      metadata: { contest_id: ctx.contest.id, player_id: consumed.player_id },
    });

    return { ok: true, data: { firstName: player.first_name } };
  } catch (err) {
    reportError("pronostics.recover.confirm", err);
    return { ok: false, error: "Une erreur est survenue, réessayez." };
  }
}
