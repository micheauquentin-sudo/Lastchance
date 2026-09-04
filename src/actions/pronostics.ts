"use server";

import { revalidatePath } from "next/cache";
import { destinationApresCreation } from "@/lib/atterrissage-studio";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { hrefEtapeContest } from "@/components/dashboard/atelier-contest-etapes";
import { blocageActivationContest } from "@/lib/activation/pronostics";
import { getUserAndOrg } from "@/lib/auth";
import { getCompetition, getEntry, isAutoCompetition } from "@/lib/competitions";
import { syncContestFixtures } from "@/lib/contest-sync";
import { fetchLeagueAnchor, fetchLeagueRound } from "@/lib/fixtures";
import { zonedDateTimeToIso } from "@/lib/date-time";
import { monitored, reportError } from "@/lib/monitoring";
import {
  contestAnswerToJson,
  DEFAULT_EVENT_KIND,
  isContestQuestionType,
  generatePlayerToken,
  hashPlayerToken,
  isPredictionOpen,
  isQuestionLocked,
  parseQuestionOptions,
  type ContestAnswer,
} from "@/lib/pronostics";
import {
  contestTokenCookieName,
  loadContestContext,
  resoudreIdentiteContest,
} from "@/lib/pronostics-context";
import {
  RATE_LIMITS,
  rateLimit,
  rateLimitBucket,
} from "@/lib/rate-limit";
import { ensureProgressivePlayerIdentity } from "@/lib/player-identity";
import { clientIpFromHeaders, observerPressionIp } from "@/lib/request-ip";
import { sendContestRecoveryEmail } from "@/lib/resend";
import { APP_URL } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { refuserSiQuotaBrouillonAtteint } from "@/lib/quota-brouillons";
import { hasPronosticsAccess } from "@/lib/subscription";
import { verifyTurnstile } from "@/lib/turnstile";
import { randomCode, type ActionResult } from "@/lib/utils";
import {
  addContestQuestionSchema,
  addMatchSchema,
  addMatchesSchema,
  contestAnswerSchema,
  createContestSchema,
  createLeagueSchema,
  deleteContestSchema,
  deleteMatchSchema,
  finalizeContestSchema,
  joinLeagueSchema,
  leaveLeagueSchema,
  matchRowErrors,
  recoveryConfirmSchema,
  recoveryRequestSchema,
  registerPlayerSchema,
  setAwardStatusSchema,
  setMatchResultSchema,
  setQuestionResultSchema,
  submitAnswerSchema,
  submitPredictionSchema,
  submitPredictionsSchema,
  contestRoundSchema,
  syncContestSchema,
  updateContestGenericScoringSchema,
  updateContestRewardsSchema,
  updateContestSchema,
  updateContestEventSettingsSchema,
  updateContestScoringSchema,
  updateContestTiebreakerSchema,
  updatePlayerSchema,
  type MatchRowError,
} from "@/lib/validations/pronostics";
import { headers } from "next/headers";

// ────────────────────────────────────────────────────────────
// Dashboard commerçant (session + RLS éditeurs)
// ────────────────────────────────────────────────────────────

/**
 * CHAQUE REVALIDATION DE L'ATELIER A SON JUMEAU DE STUDIO (VIT-43).
 *
 * Le studio du championnat vit à `/studio/pronostics/[id]`, HORS de
 * `/dashboard` — c'est ce qui lui retire la colonne de navigation et lui donne
 * la largeur de son aperçu. Next revalide un CHEMIN, pas une ressource : aucun
 * `revalidatePath('/dashboard/pronostics/…')` ne l'atteint donc, et une action
 * qui réussit y laisse l'écran sur la version d'avant.
 *
 * Ce n'est pas une précaution : c'est le défaut VIT-37, puis VIT-39, puis
 * VIT-41, mot pour mot. Il coûte un lot à trouver parce que rien ne casse —
 * l'action répond « enregistré », et elle dit vrai. Chacun des dix-sept appels
 * détaillés porte donc son jumeau, et
 * `src/components/pronos/studio/revalidation-studio.test.ts` échoue s'il en
 * manque un ; il DÉRIVE sa liste de ce fichier, donc une action ajoutée demain
 * entre dans la garde toute seule.
 */

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
  if (message.includes("locked: event kind frozen")) {
    return "Le modèle d'événement ne peut plus changer après le premier pronostic ou coup d'envoi.";
  }
  if (message.includes("invalid event kind")) {
    return "Modèle d'événement invalide.";
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
  if (message.includes("invalid question type")) {
    return "Cette question n'est pas de ce type : utilisez le formulaire correspondant.";
  }
  if (message.includes("question not locked")) {
    return "Le résultat ne peut être saisi qu'une fois la question verrouillée.";
  }
  if (message.includes("invalid answer")) {
    return "Réponse invalide pour cette question.";
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
    // Champs optionnels, absents du formulaire football d'origine :
    // sans eux le modèle reste `football` et aucune date de
    // verrouillage par défaut n'est posée (comportement inchangé).
    event_kind: formData.get("event_kind"),
    default_locks_at: formData.get("default_locks_at"),
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0].message };
  }

  const { user, organization } = await getUserAndOrg();
  if (!user || !organization) redirect("/login");

  // CRÉER N'EST PLUS PAYANT, PUBLIER L'EST — et pronostics était le seul des
  // neuf modules à garder l'inverse.
  //
  // Les huit autres gardent leur `set…Status`, c'est-à-dire la publication ;
  // celui-ci gardait la CRÉATION, donc interdisait de préparer un championnat
  // sans avoir payé. Le cahier §3 tranche l'autre sens : « Le dashboard donne
  // accès à tout pour découvrir ; seule la publication est verrouillée. » Un
  // commerçant doit pouvoir monter sa Coupe du monde en amont et n'ouvrir le
  // module qu'au coup d'envoi.
  //
  // Ce qui reste fermé sans droit est inchangé et vit ailleurs :
  // `setContestStatus` / `set_contest_status` refusent le passage à `active`,
  // le trigger `contests_guard_publication` ferme l'INSERT direct d'une ligne
  // publiée, et `syncContest` exige le module (il appelle un fournisseur
  // externe). Le brouillon, lui, n'expose rien à personne.
  const refus = await refuserSiQuotaBrouillonAtteint("pronostics");
  if (refus) return refus;

  const supabase = await createClient();
  let defaultLocksAt: string | null;
  try {
    defaultLocksAt = parsed.data.default_locks_at
      ? zonedDateTimeToIso(
          parsed.data.default_locks_at,
          organization.timezone,
        )
      : null;
  } catch (error) {
    return {
      ok: false,
      error:
        error instanceof Error ? error.message : "Date de verrouillage invalide",
    };
  }
  const { data: contest, error } = await supabase
    .from("contests")
    .insert({
      organization_id: organization.id,
      name: parsed.data.name,
      competition_key: parsed.data.competition_key,
      event_kind: parsed.data.event_kind,
      default_locks_at: defaultLocksAt,
      slug: randomCode(8),
    })
    .select("id")
    .single();

  if (error || !contest) {
    console.error("[pronostics] create:", error?.message);
    return { ok: false, error: "Impossible de créer le championnat" };
  }

  // FOOTBALL uniquement : un événement générique (cérémonie, élection…)
  // n'a pas de compétition au catalogue, donc aucun fournisseur à
  // interroger. Compétition du catalogue : le calendrier du fournisseur
  // est importé automatiquement — le commerçant n'a rien à saisir.
  // Best-effort : un fournisseur indisponible ne bloque pas la création
  // (le bouton « Synchroniser » et le cron rattraperont).
  if (
    parsed.data.event_kind === DEFAULT_EVENT_KIND &&
    isAutoCompetition(parsed.data.competition_key)
  ) {
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
  // Atterrissage sur la PREMIÈRE ÉTAPE de l'atelier, pas sur la vue suivi : un
  // championnat qui vient de naître n'a rien à suivre — ni classement, ni
  // clôture, ni palmarès. L'URL est construite par `hrefEtapeContest` pour
  // qu'il n'existe qu'un seul endroit qui sache la fabriquer.
  // ATTERRISSAGE : LE STUDIO SUR GRAND ÉCRAN, L'ATELIER SINON (VIT-51).
  // Le serveur ne connaît pas la taille de l'écran ; le formulaire la lui a
  // dite (`ChampGrandEcran`). Champ absent — JavaScript coupé — on retombe sur
  // l'atelier, qui fonctionne partout : un clic de plus sur un ordinateur vaut
  // mieux qu'un écran à deux colonnes servi à un téléphone.
  redirect(
    destinationApresCreation(
      formData,
      `/studio/pronostics/${contest.id}`,
      hrefEtapeContest(contest.id, "championnat"),
    ),
  );
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
    revalidatePath(`/studio/pronostics/${contest.id}`);
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

/**
 * LES CHAMPS RÉELLEMENT ÉCRITS — et pourquoi `Object.keys` ne suffisait pas.
 *
 * ── LE DÉFAUT MESURÉ (2026-08-27) ──
 *
 * Le formulaire « Ouvrir aux joueurs » ne poste que `id` et `status`. Mais
 * l'action lit TOUS les champs du schéma depuis le FormData (`name: null`,
 * `theme: null`…), et Zod, lui, CONSERVE une clé dès lors qu'elle était
 * présente à l'entrée — même repliée sur `undefined` par `absentSiNonRendu`.
 * `Object.keys(fields).length` valait donc 5, jamais 0, et l'action entrait
 * dans sa branche d'écriture avec cinq valeurs indéfinies.
 *
 * `JSON.stringify` les élague : PostgREST recevait `PATCH {}`. Vérifié sur
 * l'instance locale — un corps vide sur une ligne EXISTANTE rend
 * `PGRST116 / 0 rows`, là où le même PATCH non vide rend la ligne. Donc
 * `!updated`, donc « Mise à jour impossible ».
 *
 * ── POURQUOI C'ÉTAIT SI DÉROUTANT ──
 *
 * Le refus tombait APRÈS `set_contest_status`, déjà commité. Le championnat
 * ÉTAIT ouvert aux joueurs, la page publique servait, et le commerçant lisait
 * une erreur — jusqu'à ce qu'un rafraîchissement lui montre le contraire. Un
 * message d'échec sur un geste réussi est pire qu'un échec franc : il fait
 * recommencer, et ici le re-clic ne détrompait pas (la RPC est idempotente,
 * elle rend `true` sur un statut déjà atteint, et l'écriture vide échouait à
 * nouveau).
 *
 * ── LA GARDE EST ICI ET NON DANS LE SCHÉMA ──
 *
 * `absentSiNonRendu` fait déjà son travail : il replie `null` sur `undefined`,
 * ce qui est la bonne SÉMANTIQUE (« champ non rendu »). Ce que Zod ne peut pas
 * faire, c'est retirer la clé — et c'est la présence de la clé, pas sa valeur,
 * que testait l'appelant. On corrige donc au point de décision : ce qui part
 * en base, ce sont les champs qui ont une VALEUR.
 */
function champsEcrits<T extends Record<string, unknown>>(fields: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(fields).filter(([, valeur]) => valeur !== undefined),
  ) as Partial<T>;
}

export async function updateContest(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = updateContestSchema.safeParse({
    id: formData.get("id"),
    name: formData.get("name"),
    status: formData.get("status"),
    reason: formData.get("reason"),
    collect_email: formData.get("collection_settings") === "1"
      ? formData.get("collect_email") === "on"
      : undefined,
    collect_phone: formData.get("collection_settings") === "1"
      ? formData.get("collect_phone") === "on"
      : undefined,
    // Lecture NUE (pas de `has`) : pour le thème, « champ non rendu » et
    // « absent » disent la même chose, et le schéma replie déjà `null` sur
    // l'absence. Seul le panneau Réglages porte ce `<select>` — les autres
    // formulaires de la page laissent donc la colonne intacte.
    theme: formData.get("theme"),
    // Gate `has` et non lecture nue, contrairement au thème juste au-dessus :
    // pour le fond, `''` (« suivre le thème ») est une valeur légitime, donc
    // indiscernable d'un champ absent si on lisait `get() ?? ""`.
    fond_key: formData.has("fond_key")
      ? formData.get("fond_key")
      : undefined,
    // Gate PROPRE (pas `collection_settings`) : le réglage n'est écrit que
    // si le formulaire porte réellement le champ. Sinon toute sauvegarde
    // d'un autre formulaire remettrait l'expiration à « sans limite ».
    // '' = pas d'expiration, valeur légitime → `has`, pas `get() ?? ""`.
    code_ttl_seconds: formData.has("code_ttl_seconds")
      ? formData.get("code_ttl_seconds")
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

  // ── LA GARDE MÉTIER QUI MANQUAIT (FIA-2) ──
  //
  // Pronostics était le seul des huit modules à n'opposer AUCUNE précondition
  // d'ouverture : on publiait un championnat à zéro match et zéro question, et
  // /pronos/<slug> affichait une page sans rien à pronostiquer. L'atelier le
  // racontait pourtant, et le promettait bloquant.
  //
  // Elle passe AVANT la RPC, comme les gardes métier des sept autres modules :
  // le commerçant doit lire « ajoutez un match », pas un refus de droit
  // générique. Le verdict lui-même vient de `blocageActivationContest`, la
  // fonction pure que l'étape « Vérification » consomme aussi — recopier le
  // seuil ici ferait diverger les deux côtés au premier contrôle ajouté.
  //
  // Deux comptages plutôt qu'un : le blocage ne dépend que du TOTAL, mais la
  // fonction pure est la même des deux côtés et l'atelier, lui, nomme les deux
  // chiffres. Un `count` en panne rend `null` — traité comme zéro, donc refus :
  // même choix que `setHuntStatus` (`count ?? 0`), une garde de publication
  // échoue FERMÉ.
  if (status === "active") {
    const [{ data: contest }, { count: nbMatchs }, { count: nbQuestions }] =
      await Promise.all([
        supabase
          .from("contests")
          .select("competition_key")
          .eq("id", id)
          .eq("organization_id", organization.id)
          .maybeSingle(),
        supabase
          .from("contest_matches")
          .select("id", { count: "exact", head: true })
          .eq("contest_id", id)
          .eq("organization_id", organization.id)
          .eq("question_type", "score"),
        supabase
          .from("contest_matches")
          .select("id", { count: "exact", head: true })
          .eq("contest_id", id)
          .eq("organization_id", organization.id)
          .neq("question_type", "score"),
      ]);
    const blocage = blocageActivationContest({
      nbMatchs: nbMatchs ?? 0,
      nbQuestions: nbQuestions ?? 0,
      // Calendrier synchronisé : la phrase envoie resynchroniser plutôt que
      // saisir à la main. `competition_key` absente (championnat introuvable)
      // vaut « pas de calendrier », jamais une exception — l'existence de la
      // ligne reste tranchée par la RPC, qui rend « Mise à jour impossible ».
      autoCompetition: isAutoCompetition(contest?.competition_key ?? ""),
    });
    if (blocage) return { ok: false, error: blocage };
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

  // `champsEcrits` et non `fields` : une clé présente mais indéfinie n'est pas
  // un champ à écrire (voir l'en-tête de la fonction — c'est le défaut du
  // 2026-08-27, « Ouvrir aux joueurs » qui réussit en annonçant un échec).
  const aEcrire = champsEcrits(fields);
  let slug: string | null = null;
  if (Object.keys(aEcrire).length > 0) {
    const { data: updated, error } = await supabase
      .from("contests")
      .update(aEcrire)
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
  revalidatePath(`/studio/pronostics/${id}`);
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
    reason: formData.get("reason"),
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
  revalidatePath(`/studio/pronostics/${id}`);
  revalidatePath(`/pronos/${contest.slug}`);
  return { ok: true, data: undefined };
}

/**
 * Paliers génériques du barème (choice, ranking_*, number_*). Le barème
 * football (exact/diff/winner) garde `updateContestScoring` : son chemin
 * est INCHANGÉ, et la RPC fusionne les deux jeux de clés sans jamais que
 * l'un efface l'autre.
 */
export async function updateContestGenericScoring(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = updateContestGenericScoringSchema.safeParse({
    id: formData.get("id"),
    values: formData.get("values"),
    reason: formData.get("reason"),
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0].message };
  }

  const { user, organization, role } = await getUserAndOrg();
  if (!user || !organization) redirect("/login");
  // Miroir applicatif du `is_org_editor` de la RPC (la base fait autorité).
  if (role !== "owner" && role !== "editor") {
    return { ok: false, error: "Action non autorisée" };
  }

  const supabase = await createClient();
  const { data: contest } = await supabase
    .from("contests")
    .select("slug")
    .eq("id", parsed.data.id)
    .eq("organization_id", organization.id)
    .maybeSingle();
  if (!contest) return { ok: false, error: "Championnat introuvable" };

  const { data: updated, error } = await supabase.rpc(
    "update_contest_generic_scoring",
    {
      p_organization_id: organization.id,
      p_contest_id: parsed.data.id,
      p_values: parsed.data.values,
      p_reason: parsed.data.reason ?? null,
    },
  );

  if (error || updated !== true) {
    console.error("[pronostics] generic scoring:", error?.message);
    return {
      ok: false,
      error: contestRuleError(error?.message, "Enregistrement impossible"),
    };
  }

  revalidatePath(`/dashboard/pronostics/${parsed.data.id}`);
  revalidatePath(`/studio/pronostics/${parsed.data.id}`);
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
    reason: formData.get("reason"),
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
  revalidatePath(`/studio/pronostics/${parsed.data.id}`);
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
    question: formData.get("question"),
    answer: formData.get("answer"),
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
  revalidatePath(`/studio/pronostics/${parsed.data.id}`);
  revalidatePath(`/pronos/${contest.slug}`);
  return { ok: true, data: undefined };
}

/**
 * Réglages de l'événement : modèle (`event_kind`, pivot des modèles
 * préconfigurés) et verrouillage par défaut (`default_locks_at`, appliqué
 * aux questions sans échéance propre).
 *
 * Mêmes gardes que la question subsidiaire, portées par la RPC : org
 * scopée, éditeur requis, refus après clôture, audit du changement. Le
 * modèle se FIGE dès le premier pronostic/coup d'envoi (les joueurs ont
 * déjà vu l'habillage) ; la date reste ajustable — un événement reporté
 * doit pouvoir être déplacé — avec motif journalisé une fois verrouillé.
 * Un champ vide vaut « ne change pas » pour le modèle et « efface » pour
 * la date (le verrouillage retombe alors sur chaque question).
 */
export async function updateContestEventSettings(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = updateContestEventSettingsSchema.safeParse({
    id: formData.get("id"),
    event_kind: formData.get("event_kind"),
    default_locks_at: formData.get("default_locks_at"),
    reason: formData.get("reason"),
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0].message };
  }

  const { user, organization, role } = await getUserAndOrg();
  if (!user || !organization) redirect("/login");
  // Miroir applicatif du `is_org_editor` de la RPC (le caissier n'édite
  // pas le règlement) — la base reste l'autorité.
  if (role !== "owner" && role !== "editor") {
    return { ok: false, error: "Action non autorisée" };
  }

  let defaultLocksAt: string | null;
  try {
    defaultLocksAt =
      parsed.data.default_locks_at === ""
        ? null
        : zonedDateTimeToIso(
            parsed.data.default_locks_at,
            organization.timezone,
          );
  } catch (dateError) {
    return {
      ok: false,
      error:
        dateError instanceof Error
          ? dateError.message
          : "Date de verrouillage invalide",
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

  const { data: ok, error } = await supabase.rpc(
    "update_contest_event_settings",
    {
      p_organization_id: organization.id,
      p_contest_id: parsed.data.id,
      // '' = « ne change pas » : la colonne est NOT NULL, elle ne s'efface jamais.
      p_event_kind: parsed.data.event_kind || null,
      p_default_locks_at:
        parsed.data.default_locks_at === ""
          ? null
          : defaultLocksAt,
      p_reason: parsed.data.reason ?? null,
    },
  );
  if (error || ok !== true) {
    console.error("[pronostics] event settings:", error?.message);
    return {
      ok: false,
      error: contestRuleError(error?.message, "Enregistrement impossible"),
    };
  }

  revalidatePath(`/dashboard/pronostics/${parsed.data.id}`);
  revalidatePath(`/studio/pronostics/${parsed.data.id}`);
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
    tiebreaker_answer: formData.get("tiebreaker_answer"),
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
  revalidatePath(`/studio/pronostics/${parsed.data.id}`);
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
    reason: formData.get("reason"),
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
  if (contestId) revalidatePath(`/studio/pronostics/${contestId}`);
  return { ok: true, data: undefined };
}

export async function addMatch(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = addMatchSchema.safeParse({
    contest_id: formData.get("contest_id"),
    home_key: formData.get("home_key"),
    away_key: formData.get("away_key"),
    home_name: formData.get("home_name"),
    away_name: formData.get("away_name"),
    kickoff_at: formData.get("kickoff_at"),
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0].message };
  }

  const { user, organization } = await getUserAndOrg();
  if (!user || !organization) redirect("/login");

  let kickoffAt: string;
  try {
    kickoffAt = zonedDateTimeToIso(
      parsed.data.kickoff_at,
      organization.timezone,
    );
  } catch (dateError) {
    return {
      ok: false,
      error:
        dateError instanceof Error
          ? dateError.message
          : "Date de coup d'envoi invalide",
    };
  }

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
    kickoff_at: kickoffAt,
    position: count ?? 0,
  });

  if (error) {
    console.error("[pronostics] add match:", error.message);
    return { ok: false, error: "Impossible d'ajouter le match" };
  }

  revalidatePath(`/dashboard/pronostics/${contest.id}`);
  revalidatePath(`/studio/pronostics/${contest.id}`);
  revalidatePath(`/pronos/${contest.slug}`);
  return { ok: true, data: undefined };
}

export interface AddMatchesOutcome {
  /** Nombre de matchs insérés (tout ou rien : l'insertion est atomique). */
  inserted: number;
}

/** Résultat de la saisie rapide : les erreurs de ligne portent l'index
 *  (0-based) de la ligne fautive, exploitable directement par l'UI. */
export type AddMatchesResult =
  | { ok: true; data: AddMatchesOutcome }
  | { ok: false; error: string; rowErrors?: MatchRowError[] };

/**
 * Saisie rapide de matchs (1 à 30 lignes en une fois) : mêmes gardes et
 * même résolution de vignettes que addMatch, positions séquentielles à
 * la suite de l'existant, insertion en un seul lot atomique — soit tout
 * passe, soit rien n'est écrit et les lignes fautives sont désignées.
 */
export async function addContestMatches(
  _prev: AddMatchesResult | null,
  formData: FormData,
): Promise<AddMatchesResult> {
  const parsed = addMatchesSchema.safeParse({
    contest_id: formData.get("contest_id"),
    matches: formData.get("matches"),
  });
  if (!parsed.success) {
    return { ok: false, ...matchRowErrors(parsed.error) };
  }

  const { user, organization } = await getUserAndOrg();
  if (!user || !organization) redirect("/login");

  const supabase = await createClient();

  const { data: contest } = await supabase
    .from("contests")
    .select("id, competition_key, slug, finalized_at")
    .eq("id", parsed.data.contest_id)
    .eq("organization_id", organization.id)
    .maybeSingle();
  if (!contest) return { ok: false, error: "Championnat introuvable" };
  if (contest.finalized_at) {
    return {
      ok: false,
      error: "Championnat clôturé : règlement et classement sont définitifs.",
    };
  }

  // Vignettes résolues côté serveur depuis le catalogue, comme addMatch :
  // le client n'envoie que des clés (ou des noms libres).
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

  const rowErrors: MatchRowError[] = [];
  const rows = parsed.data.matches.map((row, index) => {
    const home = resolveSide(row.home_key, row.home_name);
    const away = resolveSide(row.away_key, row.away_name);
    if (
      (home.key && home.key === away.key) ||
      home.name.localeCompare(away.name, "fr", { sensitivity: "base" }) === 0
    ) {
      rowErrors.push({
        index,
        message: "Choisissez deux participants différents",
      });
    }
    let kickoffAt = "";
    try {
      kickoffAt = zonedDateTimeToIso(
        row.kickoff_at,
        organization.timezone,
      );
    } catch (dateError) {
      rowErrors.push({
        index,
        message:
          dateError instanceof Error
            ? dateError.message
            : "Date de coup d'envoi invalide",
      });
    }
    return { home, away, kickoff_at: kickoffAt };
  });
  if (rowErrors.length > 0) {
    return {
      ok: false,
      error: `Ligne ${rowErrors[0].index + 1} : ${rowErrors[0].message}`,
      rowErrors,
    };
  }

  const { count } = await supabase
    .from("contest_matches")
    .select("id", { count: "exact", head: true })
    .eq("contest_id", contest.id);
  const base = count ?? 0;

  // Un seul INSERT multi-lignes : atomique (tout ou rien), positions
  // séquentielles dans l'ordre soumis à la suite des matchs existants.
  const { error } = await supabase.from("contest_matches").insert(
    rows.map((m, i) => ({
      contest_id: contest.id,
      organization_id: organization.id,
      home_key: m.home.key,
      home_name: m.home.name,
      home_badge: m.home.badge,
      home_color: m.home.color,
      away_key: m.away.key,
      away_name: m.away.name,
      away_badge: m.away.badge,
      away_color: m.away.color,
      kickoff_at: m.kickoff_at,
      position: base + i,
    })),
  );

  if (error) {
    console.error("[pronostics] add matches:", error.message);
    return { ok: false, error: "Impossible d'ajouter les matchs" };
  }

  revalidatePath(`/dashboard/pronostics/${contest.id}`);
  revalidatePath(`/studio/pronostics/${contest.id}`);
  revalidatePath(`/pronos/${contest.slug}`);
  return { ok: true, data: { inserted: rows.length } };
}

/**
 * Ajout d'une question générique (choix unique, classement, estimation).
 * Le football garde `addMatch` : son chemin de création est INCHANGÉ.
 *
 * `contest_matches` est INSERT-only pour l'éditeur (UPDATE révoqué en
 * base) : corriger une question = la supprimer (deleteMatch) puis la
 * recréer ici.
 */
export async function addContestQuestion(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = addContestQuestionSchema.safeParse({
    contest_id: formData.get("contest_id"),
    question_type: formData.get("question_type"),
    prompt: formData.get("prompt"),
    options: formData.get("options"),
    ranking_size: formData.get("ranking_size"),
    locks_at: formData.get("locks_at"),
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0].message };
  }

  const { user, organization } = await getUserAndOrg();
  if (!user || !organization) redirect("/login");

  const supabase = await createClient();
  let locksAt: string;
  try {
    locksAt = zonedDateTimeToIso(
      parsed.data.locks_at,
      organization.timezone,
    );
  } catch (dateError) {
    return {
      ok: false,
      error:
        dateError instanceof Error
          ? dateError.message
          : "Date de verrouillage invalide",
    };
  }
  const { data: contest } = await supabase
    .from("contests")
    .select("id, slug, finalized_at")
    .eq("id", parsed.data.contest_id)
    .eq("organization_id", organization.id)
    .maybeSingle();
  if (!contest) return { ok: false, error: "Championnat introuvable" };
  if (contest.finalized_at) {
    return {
      ok: false,
      error: "Championnat clôturé : règlement et classement sont définitifs.",
    };
  }

  const { question_type: type, prompt, options, ranking_size } = parsed.data;

  const { count } = await supabase
    .from("contest_matches")
    .select("id", { count: "exact", head: true })
    .eq("contest_id", contest.id);

  const { error } = await supabase.from("contest_matches").insert({
    contest_id: contest.id,
    organization_id: organization.id,
    question_type: type,
    prompt,
    options: type === "number" ? null : options,
    ranking_size: type === "ranking" && ranking_size !== "" ? ranking_size : null,
    // Une question générique n'a ni domicile ni extérieur : les colonnes
    // football restent vides (le CHECK ne les exige que pour `score`).
    home_name: "",
    away_name: "",
    // L'échéance sert de date d'événement ET de verrouillage :
    // coalesce(locks_at, default_locks_at, kickoff_at) rend cette date.
    kickoff_at: locksAt,
    locks_at: locksAt,
    position: count ?? 0,
  });

  if (error) {
    console.error("[pronostics] add question:", error.message);
    return { ok: false, error: "Impossible d'ajouter la question" };
  }

  revalidatePath(`/dashboard/pronostics/${contest.id}`);
  revalidatePath(`/studio/pronostics/${contest.id}`);
  revalidatePath(`/pronos/${contest.slug}`);
  return { ok: true, data: undefined };
}

export async function deleteMatch(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = deleteMatchSchema.safeParse({
    id: formData.get("id"),
    reason: formData.get("reason"),
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
  revalidatePath(`/studio/pronostics/${match.contest_id}`);
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
  revalidatePath(`/studio/pronostics/${contest.id}`);
  revalidatePath(`/pronos/${contest.slug}`);
  return { ok: true, data: undefined };
}

/**
 * Réponse brute d'un formulaire de question générique, telle qu'elle est
 * confrontée au schéma construit d'après la question (le type vient de la
 * BASE, jamais du client : aucun formulaire ne choisit son propre type).
 */
function answerFromFormData(
  questionType: string,
  formData: FormData,
): unknown {
  if (questionType === "choice") {
    // `?? ""` CONSERVÉ : l'identifiant d'option est OBLIGATOIRE. Contrairement
    // à `value` ci-dessous, la chaîne vide n'y est pas coercible en une valeur
    // valide — elle produit un refus lisible au lieu d'un « received null ».
    return { type: "choice", optionId: formData.get("option_id") ?? "" };
  }
  if (questionType === "ranking") {
    let order: unknown = [];
    try {
      order = JSON.parse(String(formData.get("order") ?? "[]"));
    } catch {
      order = null;
    }
    return { type: "ranking", order };
  }
  if (questionType === "number") {
    // `?? ""` RETIRÉ : la chaîne vide se coerce en 0, et 0 est une estimation
    // parfaitement valide. Ce filet transformait donc « le joueur n'a rien
    // envoyé » en « le joueur a répondu zéro » — et le classement départageait
    // sur cette réponse fantôme. `nombreRequis` refuse maintenant l'absence.
    return { type: "number", value: formData.get("value") };
  }
  return { type: questionType };
}

/**
 * Saisie (ou correction) du résultat d'une question générique : fige la
 * bonne réponse, marque la question résolue et recalcule les points de
 * toutes les réponses — la RPC fait les trois d'un bloc.
 *
 * Le pendant football (`setMatchResult`) est INCHANGÉ : un score continue
 * de passer par `set_contest_match_result`.
 */
export async function setQuestionResult(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = setQuestionResultSchema.safeParse({ id: formData.get("id") });
  if (!parsed.success) {
    return { ok: false, error: "Données invalides" };
  }

  const { user, organization } = await getUserAndOrg();
  if (!user || !organization) redirect("/login");

  const supabase = await createClient();
  const { data: question } = await supabase
    .from("contest_matches")
    // FK nommée : deux relations existent vers contests (PGRST201 sinon).
    .select(
      "id, contest_id, question_type, options, ranking_size, contests!contest_matches_contest_id_fkey(id, slug)",
    )
    .eq("id", parsed.data.id)
    .eq("organization_id", organization.id)
    .maybeSingle();
  if (!question) return { ok: false, error: "Question introuvable" };

  const contest = question.contests as unknown as {
    id: string;
    slug: string;
  } | null;
  if (!contest) return { ok: false, error: "Championnat introuvable" };
  // `contest_matches.question_type` est un `text` borné par un CHECK ; le type
  // généré n'en retient que `string`. On rétablit l'union par le garde qui fait
  // déjà foi ailleurs, plutôt que de forcer le type : une valeur hors CHECK
  // (base modifiée à la main, migration future) est alors REFUSÉE, pas ignorée.
  if (!isContestQuestionType(question.question_type)) {
    return { ok: false, error: "Type de question inconnu" };
  }
  if (question.question_type === "score") {
    return {
      ok: false,
      error: "Ce match attend un score : utilisez le formulaire de résultat.",
    };
  }

  const answer = contestAnswerSchema({
    question_type: question.question_type,
    options: parseQuestionOptions(question.options),
    ranking_size: question.ranking_size,
  }).safeParse(answerFromFormData(question.question_type, formData));
  if (!answer.success) {
    return { ok: false, error: answer.error.issues[0].message };
  }

  const { data: updated, error } = await supabase.rpc(
    "set_contest_question_result",
    {
      p_organization_id: organization.id,
      p_match_id: question.id,
      p_correct_answer: contestAnswerToJson(answer.data),
    },
  );

  if (error || updated !== true) {
    console.error("[pronostics] set question result:", error?.message);
    return {
      ok: false,
      error: contestRuleError(
        error?.message,
        "Enregistrement du résultat impossible",
      ),
    };
  }

  revalidatePath(`/dashboard/pronostics/${contest.id}`);
  revalidatePath(`/studio/pronostics/${contest.id}`);
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
  /**
   * Rappel hebdomadaire « il vous manque des pronostics ». OPT-IN strict :
   * absent vaut « non », exactement comme la case décochée.
   */
  reminderOptIn?: boolean;
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
      reminder_opt_in: input.reminderOptIn ?? false,
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
    // Inscription = PREMIÈRE action du joueur : aucune identité (cookie) encore
    // disponible sur laquelle poser un `failClosed`. La barrière anti-bot est
    // Turnstile (ci-dessus) et l'index unique (contest_id, lower(email)) contre
    // les doublons. La clé IP (partagée : Wi-Fi de commerce) ne porte donc plus
    // qu'un compteur LARGE et fail-OPEN — elle alerte sur un débit anormal,
    // elle ne refuse jamais l'inscription d'un championnat entier (ADR-032).
    //
    // Observation seule : ne PAS l'attendre avant l'écriture d'inscription qui
    // suit — un aller-retour rate-limit de plus en série sur le chemin qui
    // bloque le bouton « Inscription… » à l'écran. `after()` la retient
    // jusqu'à son terme sans retarder la réponse au joueur (même correction
    // que `submitInner`/`joinInner` dans `src/actions/events.ts`).
    after(() =>
      observerPressionIp(
        ["prono:register:ip", ctx.contest.id],
        ip,
        RATE_LIMITS.pronoRegisterIp,
        "prono_register_ip_pressure",
        { contest_id: ctx.contest.id },
      ).catch((err) => reportError("prono.register-pressure", err)),
    );

    // Exigences de collecte définies par le championnat (source de
    // vérité serveur, comme le claim de gain).
    if (ctx.contest.collect_email && !parsed.data.email) {
      return { ok: false, error: "Votre email est requis." };
    }
    if (ctx.contest.collect_phone && !parsed.data.phone) {
      return { ok: false, error: "Votre numéro de téléphone est requis." };
    }

    const token = generatePlayerToken();
    const tokenHash = hashPlayerToken(token);
    const { error } = await ctx.admin.from("contest_players").insert({
      contest_id: ctx.contest.id,
      organization_id: ctx.contest.organization_id,
      token_hash: tokenHash,
      first_name: parsed.data.first_name,
      avatar: parsed.data.avatar,
      // Minimisation RGPD : un appel forgé ne peut pas injecter une donnée
      // que le commerçant a choisi de ne pas collecter.
      email: ctx.contest.collect_email ? parsed.data.email || null : null,
      phone: ctx.contest.collect_phone ? parsed.data.phone || null : null,
      accepted_terms: true,
      // Opt-in STRICT : jamais pré-coché, jamais déduit d'autre chose. Un
      // appel forgé qui l'omet vaut « non », comme la case décochée.
      reminder_opt_in: parsed.data.reminder_opt_in === true,
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

    // ── PONT D'IDENTITÉ : la famille `contest` en était absente ────────────
    //
    // `ensureProgressivePlayerIdentity` est le SEUL écrivain de
    // `player_legacy_identities`, et il était appelé pour sept familles sur
    // neuf — `contest` et `referral` jamais. Deux conséquences mesurées, toutes
    // deux silencieuses :
    //
    //   · `reward_player_from_legacy(org, 'contest', contest_id, token_hash)`
    //     ne trouvait aucun pont, donc `reward_issuances.player_id` restait
    //     null et `/portefeuille` n'affichait JAMAIS un lot PRONO- ; le joueur
    //     qui n'avait fait que des pronostics n'avait même pas de cookie
    //     `lc-player` (ce parcours ne posait que `lc-prono-<id>` ci-dessus).
    //   · `apply_meta_progression_event` sort sur `player_id is null` : une
    //     mission de saison portant sur « contest » ne progressait pour
    //     personne, alors que l'éditeur propose bien les neuf familles.
    //
    // Le hash passé est celui que le registre universel interroge — le
    // `token_hash` de `contest_players`, pas une empreinte device. Best-effort
    // comme les huit autres sites : une panne du pont ne doit pas faire échouer
    // une inscription déjà écrite.
    await ensureProgressivePlayerIdentity({
      organizationId: ctx.contest.organization_id,
      experienceKind: "contest",
      experienceId: ctx.contest.id,
      legacyIdentityHash: tokenHash,
      acquisitionSource: "direct",
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

    // Identité joueur D'ABORD (cookie du module, puis identité globale) :
    // aucun seau n'est consommé avant elle (ADR-032).
    const identite = await resoudreIdentiteContest(ctx.admin, ctx.contest);
    if (!identite.joueur) {
      return { ok: false, error: "Inscrivez-vous d'abord au championnat." };
    }
    const { joueur: player, tokenHash } = identite;

    // `failClosed` sur l'IDENTITÉ joueur résolue ci-dessus : la saturer ne
    // borne que ce joueur, jamais un voisin de NAT (ADR-032).
    if (
      !(await rateLimit(
        rateLimitBucket("prono:profile:player", ctx.contest.id, player.id),
        RATE_LIMITS.pronoPredictPlayer,
        { failClosed: true },
      ))
    ) {
      return {
        ok: false,
        error: "Trop de tentatives. Patientez un instant avant de réessayer.",
      };
    }

    // Clé PARTAGÉE (IP) : compteur LARGE et fail-OPEN, observabilité pure.
    const ip = clientIpFromHeaders(await headers());
    await observerPressionIp(
      ["prono:profile:ip", ctx.contest.id],
      ip,
      RATE_LIMITS.pronoPredictIp,
      "prono_profile_ip_pressure",
      { contest_id: ctx.contest.id },
      );

    const { data: updated, error } = await ctx.admin
      .from("contest_players")
      .update({
        first_name: parsed.data.first_name,
        avatar: parsed.data.avatar,
      })
      .eq("contest_id", ctx.contest.id)
      // PAR IDENTIFIANT, plus par empreinte : l'identité est déjà résolue, et
      // le repli peut l'avoir trouvée sous une empreinte HISTORIQUE. Le filtre
      // de tenant (`contest_id`) reste, lui, exactement le même.
      .eq("id", player.id)
      .select("id")
      .maybeSingle();

    if (error) {
      reportError("pronostics.update-player", error.message);
      return { ok: false, error: "Modification impossible, réessayez." };
    }
    if (!updated) {
      return { ok: false, error: "Inscrivez-vous d'abord au championnat." };
    }

    // Le pont est REPOSÉ à chaque progression, pas seulement à l'inscription :
    // c'est ce qui garde `player_legacy_identities` à jour pour un joueur qui
    // a changé de cookie global depuis. Best-effort, comme les huit autres
    // sites — une panne du pont ne défait pas un pseudo déjà enregistré.
    await ensureProgressivePlayerIdentity({
      organizationId: ctx.contest.organization_id,
      experienceKind: "contest",
      experienceId: ctx.contest.id,
      legacyIdentityHash: tokenHash,
      acquisitionSource: "direct",
    });

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

    // Identité joueur D'ABORD (cookie du module, puis identité globale) : aucun seau
    // n'est consommé avant elle, et le `failClosed` porte sur le joueur, jamais
    // sur l'IP partagée (ADR-032).
    const identite = await resoudreIdentiteContest(ctx.admin, ctx.contest);
    if (!identite.joueur) {
      return { ok: false, error: "Inscrivez-vous d'abord au championnat." };
    }
    const { joueur: player, tokenHash } = identite;

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

    // Clé PARTAGÉE (IP) : compteur LARGE et fail-OPEN, observabilité pure.
    const ip = clientIpFromHeaders(await headers());
    await observerPressionIp(
      ["prono:predict:ip", ctx.contest.id],
      ip,
      RATE_LIMITS.pronoPredictIp,
      "prono_predict_ip_pressure",
      { contest_id: ctx.contest.id },
      );

    const match = ctx.matches.find((m) => m.id === parsed.data.match_id);
    if (!match) return { ok: false, error: "Match introuvable." };
    // Une question générique passe par submitContestAnswer (la RPC la
    // refuse déjà : ce test ne sert qu'à rendre un message juste).
    // Repli sur "score" si la colonne manque : elle est NOT NULL DEFAULT
    // 'score' en base, donc seule une régression du SELECT pourrait la rendre
    // absente — auquel cas le football doit continuer de fonctionner (la RPC
    // reste l'autorité et refuserait une question réellement générique).
    if ((match.question_type ?? "score") !== "score") {
      return { ok: false, error: "Cette question n'attend pas un score." };
    }
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

    // Le pont, APRÈS l'écriture : un pronostic est une progression, et c'est
    // lui qui rendra le lot `PRONO-` visible dans `/portefeuille`.
    await ensureProgressivePlayerIdentity({
      organizationId: ctx.contest.organization_id,
      experienceKind: "contest",
      experienceId: ctx.contest.id,
      legacyIdentityHash: tokenHash,
      acquisitionSource: "direct",
    });

    return { ok: true, data: undefined };
  } catch (err) {
    reportError("pronostics.predict", err);
    return { ok: false, error: "Une erreur est survenue, réessayez." };
  }
}

/** Ce qu'un lot de pronostics a réellement produit. */
export interface PredictionsOutcome {
  /** Pronostics effectivement enregistrés. */
  saved: number;
  /**
   * Matchs refusés, avec leur motif. NON VIDE n'est PAS un échec du lot :
   * un match qui a démarré pendant que le joueur remplissait sa grille est
   * un refus normal, et les autres doivent quand même être enregistrés.
   */
  refused: Array<{ matchId: string; error: string }>;
}

/**
 * UN LOT de pronostics — la grille remplie d'un coup, validée une fois.
 *
 * ── CE QUE ÇA RÉPARE ──
 *
 * Chaque carte portait son propre bouton « Valider ». Pronostiquer une
 * journée de Ligue 1, c'était neuf boutons, neuf allers-retours, et neuf
 * occasions d'en oublier un — sur un téléphone, en boutique. Le joueur pose
 * désormais toute sa grille et valide UNE fois.
 *
 * ── UN SEUL SEAU POUR TOUT LE LOT, ET C'EST LE POINT DÉLICAT ──
 *
 * `rateLimit` est consommé UNE fois, pas une par match. Le seau joueur
 * (40/min) était dimensionné pour « une grille complète ≈ 10 requêtes » : le
 * faire consommer par match transformerait une grille de 20 matchs en demi-
 * quota, et deux corrections d'affilée en refus. Ce que le seau borne, c'est
 * le nombre de REQUÊTES qu'un joueur envoie, et le lot n'en est qu'une.
 *
 * Le travail, lui, reste borné par le schéma (60 lignes au plus) — c'est LUI
 * qui empêche un appelant forgé de faire exécuter mille RPC en un appel.
 *
 * ── UN REFUS PARTIEL N'ANNULE RIEN ──
 *
 * Chaque match est jugé pour lui-même : un match qui a démarré pendant la
 * saisie est refusé, les autres sont enregistrés, et l'écran nomme ceux qui
 * n'ont pas pu l'être. Tout rejeter parce qu'une ligne est tombée aurait fait
 * perdre au joueur le reste de sa grille — exactement au moment où il
 * n'aurait plus le temps de la refaire.
 */
export async function submitPredictions(input: {
  slug: string;
  predictions: Array<{ matchId: string; homeScore: number; awayScore: number }>;
}): Promise<ActionResult<PredictionsOutcome>> {
  return monitored("pronostics.predict.lot", () => predictionsInner(input));
}

async function predictionsInner(
  input: Parameters<typeof submitPredictions>[0],
): Promise<ActionResult<PredictionsOutcome>> {
  try {
    const parsed = submitPredictionsSchema.safeParse({
      slug: input.slug,
      predictions: input.predictions.map((p) => ({
        match_id: p.matchId,
        home_score: p.homeScore,
        away_score: p.awayScore,
      })),
    });
    if (!parsed.success) {
      return { ok: false, error: parsed.error.issues[0].message };
    }

    const ctx = await loadContestContext(parsed.data.slug);
    if (!ctx.ok) return { ok: false, error: ctx.error };
    if (ctx.contest.status !== "active") {
      return { ok: false, error: "Ce championnat est terminé." };
    }

    // Identité joueur D'ABORD (cookie du module, puis identité globale) : aucun seau
    // n'est consommé avant elle, et le `failClosed` porte sur le joueur, jamais
    // sur l'IP partagée (ADR-032). Strictement le même ordre que
    // `predictInner` — une seconde porte d'entrée aux pronostics ne doit pas
    // avoir une seconde politique d'identité.
    const identite = await resoudreIdentiteContest(ctx.admin, ctx.contest);
    if (!identite.joueur) {
      return { ok: false, error: "Inscrivez-vous d'abord au championnat." };
    }
    const { joueur: player, tokenHash } = identite;

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

    // Clé PARTAGÉE (IP) : compteur LARGE et fail-OPEN, observabilité pure.
    const ip = clientIpFromHeaders(await headers());
    await observerPressionIp(
      ["prono:predict:ip", ctx.contest.id],
      ip,
      RATE_LIMITS.pronoPredictIp,
      "prono_predict_ip_pressure",
      { contest_id: ctx.contest.id },
    );

    const outcome: PredictionsOutcome = { saved: 0, refused: [] };
    // Doublons écartés AVANT la boucle : deux lignes sur le même match
    // feraient deux RPC dont la seconde écrase la première — du travail payé
    // pour un résultat que la dernière valeur détermine déjà.
    const vus = new Set<string>();

    for (const ligne of parsed.data.predictions) {
      if (vus.has(ligne.match_id)) continue;
      vus.add(ligne.match_id);

      const match = ctx.matches.find((m) => m.id === ligne.match_id);
      if (!match) {
        outcome.refused.push({
          matchId: ligne.match_id,
          error: "Match introuvable.",
        });
        continue;
      }
      if ((match.question_type ?? "score") !== "score") {
        outcome.refused.push({
          matchId: ligne.match_id,
          error: "Cette question n'attend pas un score.",
        });
        continue;
      }
      if (match.status === "finished" || !isPredictionOpen(match.kickoff_at)) {
        outcome.refused.push({
          matchId: ligne.match_id,
          error: "Ce match a commencé : pronostics fermés.",
        });
        continue;
      }

      const { data: saved, error } = await ctx.admin.rpc(
        "submit_contest_prediction",
        {
          p_contest_id: ctx.contest.id,
          p_match_id: match.id,
          p_player_id: player.id,
          p_home_score: ligne.home_score,
          p_away_score: ligne.away_score,
        },
      );

      if (error) {
        reportError("pronostics.predict.lot", error.message);
        outcome.refused.push({
          matchId: ligne.match_id,
          error: "Pronostic non enregistré, réessayez.",
        });
        continue;
      }
      if (saved !== true) {
        // La RPC reste l'AUTORITÉ : elle refuse un match démarré à la
        // milliseconde près, là où le test ci-dessus lisait une photo.
        outcome.refused.push({
          matchId: ligne.match_id,
          error: "Ce match a commencé : pronostics fermés.",
        });
        continue;
      }
      outcome.saved += 1;
    }

    // UN pont pour tout le lot, et seulement s'il a écrit : le poser par match
    // paierait N RPC pour une identité qui ne change pas d'une ligne à l'autre,
    // et le poser sur un lot entièrement refusé mentirait sur une progression
    // qui n'a pas eu lieu.
    if (outcome.saved > 0) {
      await ensureProgressivePlayerIdentity({
        organizationId: ctx.contest.organization_id,
        experienceKind: "contest",
        experienceId: ctx.contest.id,
        legacyIdentityHash: tokenHash,
        acquisitionSource: "direct",
      });
    }

    return { ok: true, data: outcome };
  } catch (err) {
    reportError("pronostics.predict.lot", err);
    return { ok: false, error: "Une erreur est survenue, réessayez." };
  }
}

/**
 * Enregistre (ou remplace) la réponse du joueur à une question générique
 * — choix unique, classement, estimation. Mêmes gardes que
 * `submitPrediction` (identité par cookie httpOnly, rate limit joueur,
 * IP en observabilité) ; un match de football continue de passer par
 * `submitPrediction`, ce chemin est INCHANGÉ.
 *
 * Aucun oracle : la réponse est validée contre la question chargée en
 * base, jamais contre la bonne réponse (qui ne quitte pas le serveur).
 */
export async function submitContestAnswer(input: {
  slug: string;
  questionId: string;
  answer: ContestAnswer;
}): Promise<ActionResult> {
  return monitored("pronostics.answer", () => answerInner(input));
}

async function answerInner(
  input: Parameters<typeof submitContestAnswer>[0],
): Promise<ActionResult> {
  try {
    const parsed = submitAnswerSchema.safeParse({
      slug: input.slug,
      match_id: input.questionId,
    });
    if (!parsed.success) {
      return { ok: false, error: parsed.error.issues[0].message };
    }

    const ctx = await loadContestContext(parsed.data.slug);
    if (!ctx.ok) return { ok: false, error: ctx.error };
    if (ctx.contest.status !== "active") {
      return { ok: false, error: "Ce championnat est terminé." };
    }

    // Identité joueur D'ABORD (cookie du module, puis identité globale) : aucun seau
    // n'est consommé avant elle, et le `failClosed` porte sur le joueur, jamais
    // sur l'IP partagée (ADR-032).
    const identite = await resoudreIdentiteContest(ctx.admin, ctx.contest);
    if (!identite.joueur) {
      return { ok: false, error: "Inscrivez-vous d'abord au championnat." };
    }
    const { joueur: player, tokenHash } = identite;

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

    // Clé PARTAGÉE (IP) : compteur LARGE et fail-OPEN, observabilité pure.
    const ip = clientIpFromHeaders(await headers());
    await observerPressionIp(
      ["prono:predict:ip", ctx.contest.id],
      ip,
      RATE_LIMITS.pronoPredictIp,
      "prono_predict_ip_pressure",
      { contest_id: ctx.contest.id },
      );

    const question = ctx.matches.find((m) => m.id === parsed.data.match_id);
    if (!question) return { ok: false, error: "Question introuvable." };
    if (question.question_type === "score") {
      return { ok: false, error: "Ce match attend un score." };
    }
    // Même règle que le SQL : coalesce(locks_at, default_locks_at, kickoff_at).
    if (
      question.status === "finished" ||
      isQuestionLocked(question, ctx.contest)
    ) {
      return { ok: false, error: "Cette question est verrouillée." };
    }

    const answer = contestAnswerSchema({
      question_type: question.question_type,
      options: parseQuestionOptions(question.options),
      ranking_size: question.ranking_size,
    }).safeParse(input.answer);
    if (!answer.success) {
      return { ok: false, error: answer.error.issues[0].message };
    }

    const { data: saved, error } = await ctx.admin.rpc(
      "submit_contest_answer",
      {
        p_contest_id: ctx.contest.id,
        p_match_id: question.id,
        p_player_id: player.id,
        p_answer: contestAnswerToJson(answer.data),
      },
    );

    if (error) {
      reportError("pronostics.answer", error.message);
      return { ok: false, error: "Réponse non enregistrée, réessayez." };
    }
    if (saved !== true) {
      return { ok: false, error: "Cette question est verrouillée." };
    }

    // Même geste que `predictInner` : une réponse générique est une
    // progression au même titre qu'un score.
    await ensureProgressivePlayerIdentity({
      organizationId: ctx.contest.organization_id,
      experienceKind: "contest",
      experienceId: ctx.contest.id,
      legacyIdentityHash: tokenHash,
      acquisitionSource: "direct",
    });

    return { ok: true, data: undefined };
  } catch (err) {
    reportError("pronostics.answer", err);
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
    // `failClosed` sur l'ADRESSE EMAIL ciblée — clé propre à UN destinataire,
    // pas partagée entre utilisateurs : elle borne l'email-bombing d'UNE boîte,
    // ce qui est exactement l'effet recherché. La clé IP (partagée : Wi-Fi de
    // commerce) ne porte plus qu'un compteur d'OBSERVABILITÉ — l'énumération est
    // de toute façon sans oracle (réponse neutre plus bas) et l'envoi réel reste
    // borné par la clé email (ADR-032).
    if (
      !(await rateLimit(
        rateLimitBucket("prono:recover:email", ctx.contest.id, parsed.data.email),
        RATE_LIMITS.pronoRecoverEmail,
        { failClosed: true },
      ))
    ) {
      return {
        ok: false,
        error: "Trop de demandes. Patientez avant de réessayer.",
      };
    }
    await observerPressionIp(
      ["prono:recover:ip", ctx.contest.id],
      ip,
      RATE_LIMITS.pronoRecover,
      "prono_recover_ip_pressure",
      { contest_id: ctx.contest.id },
      );

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

    // `failClosed` sur l'IDENTITÉ portée par l'appelant : le JETON de
    // récupération (haché), high-entropy et à usage unique — borne le
    // martèlement d'UN jeton donné, jamais un voisin de NAT. La clé IP
    // (partagée) passe en observabilité : le devinage d'un AUTRE jeton est déjà
    // infaisable (entropie) et la consommation reste atomique (used_at) plus
    // bas (ADR-032).
    const ip = clientIpFromHeaders(await headers());
    const recoveryTokenHash = hashPlayerToken(parsed.data.token);
    if (
      !(await rateLimit(
        rateLimitBucket(
          "prono:recover:confirm",
          ctx.contest.id,
          recoveryTokenHash,
        ),
        RATE_LIMITS.pronoRecover,
        { failClosed: true },
      ))
    ) {
      return { ok: false, error: "Trop de tentatives. Patientez un instant." };
    }
    await observerPressionIp(
      ["prono:recover:confirm:ip", ctx.contest.id],
      ip,
      RATE_LIMITS.pronoRecover,
      "prono_recover_confirm_ip_pressure",
      { contest_id: ctx.contest.id },
      );

    // Consommation atomique : seul le premier passage marque used_at.
    const now = new Date();
    const { data: consumed } = await ctx.admin
      .from("contest_recovery_tokens")
      .update({ used_at: now.toISOString() })
      .eq("contest_id", ctx.contest.id)
      .eq("token_hash", recoveryTokenHash)
      .is("used_at", null)
      .gt("expires_at", now.toISOString())
      .select("player_id")
      .maybeSingle();
    if (!consumed) return { ok: false, error: INVALID };

    // Rotation du jeton appareil : la grille repart sur CET appareil,
    // tous les autres cookies deviennent orphelins.
    const deviceToken = generatePlayerToken();
    const tokenHash = hashPlayerToken(deviceToken);
    const { data: player, error: rotateError } = await ctx.admin
      .from("contest_players")
      .update({ token_hash: tokenHash })
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

    // ── LE PONT SUIT LA ROTATION, ET C'EST LA FUITE QUE ÇA COLMATE ─────────
    //
    // La ligne ci-dessus vient de remplacer `contest_players.token_hash` par
    // une empreinte NEUVE. `player_legacy_identities.legacy_identity_hash`, lui,
    // portait encore l'ANCIENNE — celle du cookie qu'on vient de rendre
    // orphelin. Le pont désignait donc une empreinte que plus aucun cookie ne
    // produit, et rien ne levait :
    //
    //   · `reward_player_from_legacy(org, 'contest', ca.contest_id,
    //     cp.token_hash)` interroge le pont avec la NOUVELLE empreinte, ne
    //     trouvait rien, laissait `reward_issuances.player_id` à null — et le
    //     lot `PRONO-` disparaissait de `/portefeuille` ;
    //   · `apply_meta_progression_event` sort sur `player_id is null` : une
    //     mission de saison portant sur « contest » cessait de progresser.
    //
    // Le lien magique étant LE chemin officiel quand un client change de
    // navigateur, la fuite se déclenchait précisément quand elle faisait le
    // plus mal. Reposer le pont sur la nouvelle empreinte le remet d'aplomb.
    //
    // Best-effort comme les autres sites : une panne du pont ne doit pas
    // annuler une récupération déjà écrite et déjà journalisée.
    await ensureProgressivePlayerIdentity({
      organizationId: ctx.contest.organization_id,
      experienceKind: "contest",
      experienceId: ctx.contest.id,
      legacyIdentityHash: tokenHash,
      acquisitionSource: "direct",
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

// ────────────────────────────────────────────────────────────
// Ligues privées (parcours public, identité par cookie)
// ────────────────────────────────────────────────────────────

/** Ligne renvoyée par les RPC create/join_contest_league. */
interface LeagueRpcRow {
  league_id: string;
  name: string;
  code: string;
}

export interface LeagueOutcome {
  leagueId: string;
  name: string;
  /** Code d'invitation — retourné au membre uniquement (créateur ou
   *  joueur venant de rejoindre). */
  code: string;
}

/**
 * Création d'une ligue privée par un joueur inscrit : la RPC service
 * role génère le code d'invitation (unique par championnat) et inscrit
 * d'office le créateur.
 */
export async function createContestLeague(input: {
  slug: string;
  name: string;
}): Promise<ActionResult<LeagueOutcome>> {
  return monitored("pronostics.league.create", () => createLeagueInner(input));
}

async function createLeagueInner(
  input: Parameters<typeof createContestLeague>[0],
): Promise<ActionResult<LeagueOutcome>> {
  try {
    const parsed = createLeagueSchema.safeParse(input);
    if (!parsed.success) {
      return { ok: false, error: parsed.error.issues[0].message };
    }

    const ctx = await loadContestContext(parsed.data.slug);
    if (!ctx.ok) return { ok: false, error: ctx.error };

    const { joueur: player } = await resoudreIdentiteContest(
      ctx.admin,
      ctx.contest,
    );
    if (!player) {
      return { ok: false, error: "Inscrivez-vous d'abord au championnat." };
    }

    if (
      !(await rateLimit(
        rateLimitBucket("prono:league:create", ctx.contest.id, player.id),
        RATE_LIMITS.pronoLeagueCreatePlayer,
        { failClosed: true },
      ))
    ) {
      return {
        ok: false,
        error: "Trop de ligues créées récemment. Patientez un instant.",
      };
    }

    const { data, error } = await ctx.admin.rpc("create_contest_league", {
      p_contest_id: ctx.contest.id,
      p_player_id: player.id,
      p_name: parsed.data.name,
    });
    if (error) {
      if (error.message.includes("league limit reached")) {
        return {
          ok: false,
          error: "Ce championnat a atteint son nombre maximum de ligues.",
        };
      }
      reportError("pronostics.league.create", error.message);
      return { ok: false, error: "Création impossible, réessayez." };
    }

    const row = ((data ?? []) as LeagueRpcRow[])[0];
    if (!row) return { ok: false, error: "Création impossible, réessayez." };

    revalidatePath(`/pronos/${parsed.data.slug}`);
    return {
      ok: true,
      data: { leagueId: row.league_id, name: row.name, code: row.code },
    };
  } catch (err) {
    reportError("pronostics.league.create", err);
    return { ok: false, error: "Une erreur est survenue, réessayez." };
  }
}

/**
 * Rejoindre une ligue par son code d'invitation. Idempotent (déjà membre
 * → succès), rate-limité par IP et championnat contre le bruteforce des
 * codes ; un code d'un autre championnat répond « code invalide » —
 * jamais d'oracle inter-championnats.
 */
export async function joinContestLeague(input: {
  slug: string;
  code: string;
}): Promise<ActionResult<LeagueOutcome>> {
  return monitored("pronostics.league.join", () => joinLeagueInner(input));
}

async function joinLeagueInner(
  input: Parameters<typeof joinContestLeague>[0],
): Promise<ActionResult<LeagueOutcome>> {
  try {
    const parsed = joinLeagueSchema.safeParse(input);
    if (!parsed.success) {
      return { ok: false, error: parsed.error.issues[0].message };
    }

    const ctx = await loadContestContext(parsed.data.slug);
    if (!ctx.ok) return { ok: false, error: ctx.error };

    // Identité joueur D'ABORD (cookie httpOnly) : aucun seau n'est consommé
    // avant elle (ADR-032).
    const { joueur: player } = await resoudreIdentiteContest(
      ctx.admin,
      ctx.contest,
    );
    if (!player) {
      return { ok: false, error: "Inscrivez-vous d'abord au championnat." };
    }

    // Anti-bruteforce des codes borné PAR JOUEUR (`failClosed` sur player.id) :
    // un porteur ne teste qu'un petit nombre de codes ; en tenter davantage
    // exige autant d'inscriptions, chacune gardée par Turnstile. La clé IP
    // (partagée) passe en observabilité — elle ne coupe plus les rejointes
    // légitimes d'un même NAT ; l'entropie des codes reste la vraie barrière.
    if (
      !(await rateLimit(
        rateLimitBucket("prono:league:join", ctx.contest.id, player.id),
        RATE_LIMITS.pronoLeagueJoin,
        { failClosed: true },
      ))
    ) {
      return {
        ok: false,
        error: "Trop de tentatives. Patientez avant de réessayer.",
      };
    }
    const ip = clientIpFromHeaders(await headers());
    await observerPressionIp(
      ["prono:league:join:ip", ctx.contest.id],
      ip,
      RATE_LIMITS.pronoLeagueJoin,
      "prono_league_join_ip_pressure",
      { contest_id: ctx.contest.id },
      );

    const { data, error } = await ctx.admin.rpc("join_contest_league", {
      p_contest_id: ctx.contest.id,
      p_player_id: player.id,
      p_code: parsed.data.code,
    });
    if (error) {
      if (error.message.includes("league full")) {
        return { ok: false, error: "Cette ligue est complète." };
      }
      if (error.message.includes("invalid code")) {
        return { ok: false, error: "Code d'invitation invalide." };
      }
      reportError("pronostics.league.join", error.message);
      return { ok: false, error: "Impossible de rejoindre la ligue, réessayez." };
    }

    const row = ((data ?? []) as LeagueRpcRow[])[0];
    if (!row) {
      return { ok: false, error: "Code d'invitation invalide." };
    }

    revalidatePath(`/pronos/${parsed.data.slug}`);
    return {
      ok: true,
      data: { leagueId: row.league_id, name: row.name, code: row.code },
    };
  } catch (err) {
    reportError("pronostics.league.join", err);
    return { ok: false, error: "Une erreur est survenue, réessayez." };
  }
}

/**
 * Quitter une ligue. Idempotent : ne plus en faire partie (ou viser une
 * ligue inconnue de CE championnat) répond succès — rien à apprendre.
 */
export async function leaveContestLeague(input: {
  slug: string;
  leagueId: string;
}): Promise<ActionResult> {
  return monitored("pronostics.league.leave", () => leaveLeagueInner(input));
}

async function leaveLeagueInner(
  input: Parameters<typeof leaveContestLeague>[0],
): Promise<ActionResult> {
  try {
    const parsed = leaveLeagueSchema.safeParse({
      slug: input.slug,
      league_id: input.leagueId,
    });
    if (!parsed.success) {
      return { ok: false, error: "Données invalides" };
    }

    const ctx = await loadContestContext(parsed.data.slug);
    if (!ctx.ok) return { ok: false, error: ctx.error };

    // Identité joueur D'ABORD (cookie httpOnly) : aucun seau avant elle. Départ
    // idempotent et sans effet de bord — `failClosed` sur player.id, IP en
    // observabilité (ADR-032).
    const { joueur: player } = await resoudreIdentiteContest(
      ctx.admin,
      ctx.contest,
    );
    if (!player) {
      return { ok: false, error: "Inscrivez-vous d'abord au championnat." };
    }

    if (
      !(await rateLimit(
        rateLimitBucket("prono:league:leave", ctx.contest.id, player.id),
        RATE_LIMITS.pronoPredictPlayer,
        { failClosed: true },
      ))
    ) {
      return {
        ok: false,
        error: "Trop de tentatives. Patientez un instant avant de réessayer.",
      };
    }
    const ip = clientIpFromHeaders(await headers());
    await observerPressionIp(
      ["prono:league:leave:ip", ctx.contest.id],
      ip,
      RATE_LIMITS.pronoPredictIp,
      "prono_league_leave_ip_pressure",
      { contest_id: ctx.contest.id },
      );

    const { error } = await ctx.admin.rpc("leave_contest_league", {
      p_contest_id: ctx.contest.id,
      p_player_id: player.id,
      p_league_id: parsed.data.league_id,
    });
    if (error) {
      reportError("pronostics.league.leave", error.message);
      return { ok: false, error: "Une erreur est survenue, réessayez." };
    }

    revalidatePath(`/pronos/${parsed.data.slug}`);
    return { ok: true, data: undefined };
  } catch (err) {
    reportError("pronostics.league.leave", err);
    return { ok: false, error: "Une erreur est survenue, réessayez." };
  }
}

// ────────────────────────────────────────────────────────────
// LE CALENDRIER COMPLET — parcourir la saison, journée par journée
//
// La synchronisation automatique sert les journées PROCHES (la dernière
// jouée, la suivante, et celle d'après) : c'est ce qu'un commerçant veut
// voir arriver tout seul. Elle ne peut pas servir la saison entière — 34
// journées de Ligue 1 font 306 matchs, et personne ne pronostique 306
// matchs.
//
// Le reste de la saison n'était donc atteignable par AUCUN chemin : le
// commerçant qui voulait ouvrir son jeu sur la journée du mois prochain
// n'avait qu'à attendre. Ces deux actions ouvrent ce chemin — il consulte,
// puis il importe la journée qu'il a choisie, et lui seul.
// ────────────────────────────────────────────────────────────

/** Un match d'une journée consultée, tel que l'écran commerçant le lit. */
export interface CalendarPreviewMatch {
  ref: string;
  homeName: string;
  awayName: string;
  kickoffAt: string;
  /** Déjà présent dans la grille de ce championnat. */
  imported: boolean;
  /** Coup d'envoi passé : il ne sera jamais importé (personne n'a pu jouer). */
  past: boolean;
}

export interface CalendarPreview {
  round: number;
  /** Saison telle que la nomme le fournisseur (« 2026-2027 »). */
  season: string;
  matches: CalendarPreviewMatch[];
  /** Combien de matchs cette journée ajouterait à la grille. */
  importable: number;
}

/**
 * CONSULTER une journée. N'ÉCRIT RIEN — c'est tout l'intérêt : le commerçant
 * regarde avant de décider, et regarder ne doit pas remplir sa grille.
 *
 * La saison n'est pas devinée d'une date (un championnat européen chevauche
 * deux années civiles, un championnat d'été non) : elle vient de l'ANCRE du
 * fournisseur, seul à savoir comment il nomme sa saison en cours.
 */
export async function previewContestRound(input: {
  id: string;
  round: number;
}): Promise<ActionResult<CalendarPreview>> {
  const parsed = contestRoundSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Données invalides" };

  const { user, organization, role } = await getUserAndOrg();
  if (!user || !organization) redirect("/login");
  if (role !== "owner" && role !== "editor") {
    return { ok: false, error: "Action non autorisée" };
  }

  // MÊME SEAU que la synchronisation, et volontairement : les deux gestes
  // sortent vers le même fournisseur, sur le même quota. Deux seaux séparés
  // auraient laissé un écran de consultation vider le budget de l'autre.
  const allowed = await rateLimit(
    rateLimitBucket("prono:sync", organization.id, user.id),
    RATE_LIMITS.contestSync,
    { failClosed: true },
  );
  if (!allowed) {
    return {
      ok: false,
      error: "Trop de consultations rapprochées. Réessayez dans quelques minutes.",
    };
  }

  const supabase = await createClient();
  const { data: contest } = await supabase
    .from("contests")
    .select("id, competition_key")
    .eq("id", parsed.data.id)
    .eq("organization_id", organization.id)
    .maybeSingle();
  if (!contest) return { ok: false, error: "Championnat introuvable" };

  const competition = getCompetition(contest.competition_key as string);
  if (!competition?.providerLeagueId) {
    return { ok: false, error: "Cette compétition est en saisie manuelle." };
  }

  try {
    const admin = createAdminClient();
    // Les deux appels d'ancre passent par le cache HTTP de `fetchEvents`
    // (revalidate 300) : consulter trois journées d'affilée ne les repaie
    // pas trois fois.
    const saison = await saisonCourante(competition.providerLeagueId);
    if (!saison) {
      return {
        ok: false,
        error: "Le fournisseur n'annonce aucune saison en cours pour cette compétition.",
      };
    }

    const [fixtures, { data: existants }] = await Promise.all([
      fetchLeagueRound(competition.providerLeagueId, saison, parsed.data.round),
      admin
        .from("contest_matches")
        .select("external_ref")
        .eq("contest_id", contest.id)
        .eq("organization_id", organization.id),
    ]);

    const dejaLa = new Set(
      ((existants ?? []) as Array<{ external_ref: string | null }>)
        .map((m) => m.external_ref)
        .filter((ref): ref is string => Boolean(ref)),
    );
    const maintenant = Date.now();
    const matches: CalendarPreviewMatch[] = fixtures
      .map((f) => ({
        ref: f.ref,
        homeName: f.homeName,
        awayName: f.awayName,
        kickoffAt: f.kickoffAt,
        imported: dejaLa.has(f.ref),
        past: f.finished || new Date(f.kickoffAt).getTime() <= maintenant,
      }))
      .sort((a, b) => a.kickoffAt.localeCompare(b.kickoffAt));

    return {
      ok: true,
      data: {
        round: parsed.data.round,
        season: saison,
        matches,
        importable: matches.filter((m) => !m.imported && !m.past).length,
      },
    };
  } catch (err) {
    reportError("pronostics.calendrier.preview", err);
    return {
      ok: false,
      error: "Fournisseur de calendriers indisponible, réessayez plus tard.",
    };
  }
}

/**
 * IMPORTER une journée choisie.
 *
 * Elle ne réimplémente RIEN : elle passe la journée à `syncContestFixtures`
 * en `prefetched`, donc le même code que la synchronisation nocturne décide
 * ce qui entre (déduplication par `external_ref`, matchs déjà joués écartés,
 * résultats appliqués, reports suivis). Une seconde voie d'import aurait été
 * une seconde vérité sur ce qu'est un match importable.
 */
export async function importContestRound(input: {
  id: string;
  round: number;
}): Promise<ActionResult<SyncOutcome>> {
  const parsed = contestRoundSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Données invalides" };

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
      error: "Trop d'imports rapprochés. Réessayez dans quelques minutes.",
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

  const competition = getCompetition(contest.competition_key as string);
  if (!competition?.providerLeagueId) {
    return { ok: false, error: "Cette compétition est en saisie manuelle." };
  }

  try {
    const admin = createAdminClient();
    const saison = await saisonCourante(competition.providerLeagueId);
    if (!saison) {
      return {
        ok: false,
        error: "Le fournisseur n'annonce aucune saison en cours pour cette compétition.",
      };
    }
    const fixtures = await fetchLeagueRound(
      competition.providerLeagueId,
      saison,
      parsed.data.round,
    );
    const summary = await syncContestFixtures(
      admin,
      {
        id: contest.id as string,
        organization_id: organization.id,
        competition_key: contest.competition_key as string,
      },
      fixtures,
    );

    revalidatePath(`/dashboard/pronostics/${contest.id}`);
    revalidatePath(`/studio/pronostics/${contest.id}`);
    if (contest.slug) revalidatePath(`/pronos/${contest.slug}`);
    return { ok: true, data: summary };
  } catch (err) {
    reportError("pronostics.calendrier.import", err);
    return {
      ok: false,
      error: "Fournisseur de calendriers indisponible, réessayez plus tard.",
    };
  }
}

/**
 * IMPORTER TOUTES LES JOURNÉES RESTANTES, d'un seul geste.
 *
 * ── POURQUOI CE GESTE EXISTE ──
 *
 * Un calendrier de championnat est publié en début de saison : le
 * commerçant qui ouvre son jeu en août veut souvent poser les 34 journées
 * d'un coup, pour que ses clients puissent pronostiquer toute la saison
 * sans qu'il ait à revenir chaque semaine. Journée par journée, c'était
 * trente-quatre allers-retours.
 *
 * ── CE QU'IL N'IMPORTE PAS ──
 *
 * Les journées DÉJÀ JOUÉES. `syncContestFixtures` écarte tout match dont
 * le coup d'envoi est passé — personne n'a pu le pronostiquer — donc
 * balayer depuis la journée 1 ne fait qu'appeler le fournisseur pour rien.
 * On part de la journée en cours, celle que l'ancre désigne.
 *
 * ── LA BORNE EST CELLE DU CATALOGUE, PAS UNE DEVINETTE ──
 *
 * `competition.journees` vaut 34 en Ligue 1, 5 au Tournoi, et RIEN pour
 * les coupes — dont les tours ne se numérotent pas en continu. Sans borne,
 * ce geste n'est pas proposé : balayer 99 tours au hasard, ce sont 99
 * appels pour trouver du vide.
 *
 * ── UN TOUR EN ÉCHEC N'ARRÊTE PAS LES AUTRES ──
 *
 * Les journées sont importées EN SÉRIE et non en parallèle : le
 * fournisseur est en tier gratuit, et trente requêtes simultanées le
 * feraient répondre 429 pour tout le monde, y compris les pages joueur qui
 * partagent le même quota.
 */
export async function importContestSeason(input: {
  id: string;
}): Promise<ActionResult<SyncOutcome & { journees: number }>> {
  const parsed = syncContestSchema.safeParse({ id: input.id });
  if (!parsed.success) return { ok: false, error: "Données invalides" };

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
      error: "Trop d'imports rapprochés. Réessayez dans quelques minutes.",
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

  const competition = getCompetition(contest.competition_key as string);
  if (!competition?.providerLeagueId) {
    return { ok: false, error: "Cette compétition est en saisie manuelle." };
  }
  if (!competition.journees) {
    return {
      ok: false,
      error:
        "Cette compétition n'a pas de calendrier en journées numérotées : importez tour par tour.",
    };
  }

  try {
    const admin = createAdminClient();
    const ancre = await fetchLeagueAnchor(competition.providerLeagueId);
    if (!ancre) {
      return {
        ok: false,
        error: "Le fournisseur n'annonce aucune saison en cours pour cette compétition.",
      };
    }

    const total: SyncOutcome & { journees: number } = {
      imported: 0,
      resultsApplied: 0,
      rescheduled: 0,
      journees: 0,
    };

    for (let round = ancre.nextRound; round <= competition.journees; round += 1) {
      let fixtures;
      try {
        fixtures = await fetchLeagueRound(
          competition.providerLeagueId,
          ancre.season,
          round,
        );
      } catch (err) {
        // Une journée indisponible ne fait pas tomber les autres : il en
        // manquerait une là où, sans cette garde, il manquerait la saison.
        reportError("pronostics.saison.journee", err);
        continue;
      }
      if (fixtures.length === 0) continue;

      const resume = await syncContestFixtures(
        admin,
        {
          id: contest.id as string,
          organization_id: organization.id,
          competition_key: contest.competition_key as string,
        },
        fixtures,
      );
      total.imported += resume.imported;
      total.resultsApplied += resume.resultsApplied;
      total.rescheduled += resume.rescheduled;
      total.journees += 1;
    }

    revalidatePath(`/dashboard/pronostics/${contest.id}`);
    revalidatePath(`/studio/pronostics/${contest.id}`);
    if (contest.slug) revalidatePath(`/pronos/${contest.slug}`);
    return { ok: true, data: total };
  } catch (err) {
    reportError("pronostics.saison.import", err);
    return {
      ok: false,
      error: "Fournisseur de calendriers indisponible, réessayez plus tard.",
    };
  }
}

/**
 * Saison EN COURS telle que le fournisseur la nomme, lue sur ses deux ancres.
 *
 * Ni devinée d'une date, ni saisie par le commerçant : « 2026-2027 » pour un
 * championnat européen, « 2026 » pour une compétition d'été — seul le
 * fournisseur sait laquelle il sert, et se tromper de saison rend une journée
 * vide sans le moindre message.
 */
async function saisonCourante(leagueId: string): Promise<string | null> {
  return (await fetchLeagueAnchor(leagueId))?.season ?? null;
}
