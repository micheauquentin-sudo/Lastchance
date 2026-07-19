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
  registerPlayerSchema,
  setMatchResultSchema,
  submitPredictionSchema,
  syncContestSchema,
  updateContestRewardsSchema,
  updateContestSchema,
  updateContestScoringSchema,
} from "@/lib/validations/pronostics";
import { headers } from "next/headers";

// ────────────────────────────────────────────────────────────
// Dashboard commerçant (session + RLS éditeurs)
// ────────────────────────────────────────────────────────────

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

  const { id, ...fields } = parsed.data;
  if (Object.keys(fields).length === 0) return { ok: true, data: undefined };

  // L'activation d'un championnat exige le module actif (même règle que
  // l'activation de campagne avec l'abonnement).
  if (fields.status === "active" && !hasPronosticsAccess(organization)) {
    return {
      ok: false,
      error: "Le module Pronostics n'est pas activé sur votre compte.",
    };
  }

  const supabase = await createClient();
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

  revalidatePath("/dashboard/pronostics");
  revalidatePath(`/dashboard/pronostics/${id}`);
  revalidatePath(`/pronos/${updated.slug}`);
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
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0].message };
  }

  const { user, organization } = await getUserAndOrg();
  if (!user || !organization) redirect("/login");

  const { id, exact, diff, winner } = parsed.data;
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
    },
  );

  if (error || updated !== true) {
    console.error("[pronostics] scoring:", error?.message);
    return { ok: false, error: "Enregistrement impossible" };
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
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0].message };
  }

  const { user, organization } = await getUserAndOrg();
  if (!user || !organization) redirect("/login");

  const supabase = await createClient();
  const { data: updated, error } = await supabase
    .from("contests")
    .update({ rewards: parsed.data.rewards })
    .eq("id", parsed.data.id)
    .eq("organization_id", organization.id)
    .select("slug")
    .maybeSingle();

  if (error || !updated) {
    console.error("[pronostics] rewards:", error?.message);
    return { ok: false, error: "Enregistrement impossible" };
  }

  revalidatePath(`/dashboard/pronostics/${parsed.data.id}`);
  revalidatePath(`/pronos/${updated.slug}`);
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
  const { data: deleted, error } = await supabase
    .from("contests")
    .delete()
    .eq("id", parsed.data.id)
    .eq("organization_id", organization.id)
    .select("slug")
    .maybeSingle();

  if (error) {
    console.error("[pronostics] delete:", error.message);
    return { ok: false, error: "Suppression impossible" };
  }

  if (deleted?.slug) revalidatePath(`/pronos/${deleted.slug}`);
  revalidatePath("/dashboard/pronostics");
  redirect("/dashboard/pronostics");
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
  const parsed = deleteMatchSchema.safeParse({ id: formData.get("id") });
  if (!parsed.success) {
    return { ok: false, error: "Données invalides" };
  }

  const { user, organization } = await getUserAndOrg();
  if (!user || !organization) redirect("/login");

  const supabase = await createClient();
  const { data: deleted, error } = await supabase
    .from("contest_matches")
    .delete()
    .eq("id", parsed.data.id)
    .eq("organization_id", organization.id)
    // FK nommée : deux relations existent vers contests (PGRST201 sinon).
    .select("contest_id, contests!contest_matches_contest_id_fkey(slug)")
    .maybeSingle();

  if (error) {
    console.error("[pronostics] delete match:", error.message);
    return { ok: false, error: "Suppression impossible" };
  }

  if (deleted) {
    revalidatePath(`/dashboard/pronostics/${deleted.contest_id}`);
    const slug = (deleted.contests as unknown as { slug: string } | null)?.slug;
    if (slug) revalidatePath(`/pronos/${slug}`);
  }
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
  email?: string;
  phone?: string;
  acceptedTerms: boolean;
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
      email: input.email ?? "",
      phone: input.phone ?? "",
      accepted_terms: input.acceptedTerms,
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
      // Minimisation RGPD : un appel forgé ne peut pas injecter une donnée
      // que le commerçant a choisi de ne pas collecter.
      email: ctx.contest.collect_email ? parsed.data.email || null : null,
      phone: ctx.contest.collect_phone ? parsed.data.phone || null : null,
      accepted_terms: true,
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
