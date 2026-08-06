"use server";

import { createHash } from "node:crypto";
import { redirect } from "next/navigation";
import { z } from "zod";
import {
  applyExperienceBlueprintVersion,
  createExperienceBlueprint,
  publishExperienceBlueprintVersion,
} from "@/actions/experience-blueprints";
import { getUserAndOrg } from "@/lib/auth";
import {
  KINDS_RELANCE,
  etatSourceRelance,
  serialiserRelance,
  type KindRelance,
  type SourceRelance,
} from "@/lib/experience-relance";
import { reportError } from "@/lib/monitoring";
import { createClient } from "@/lib/supabase/server";
import type { ActionResult } from "@/lib/utils";
import type { ExperienceKind } from "@/platform/experiences/contract";
import { getExperienceBlueprintAdapter } from "@/platform/experiences/templates/adapters";
import { EXPERIENCE_BLUEPRINT_SCHEMA_VERSION } from "@/platform/experiences/templates/contract";

/**
 * « RELANCER UNE FORMULE » — l'action.
 *
 * Elle ne recode RIEN du moteur : la chaîne existante est reprise telle quelle,
 * `createExperienceBlueprint` → `publishExperienceBlueprintVersion` →
 * `applyExperienceBlueprintVersion`, cette dernière portant déjà la RPC
 * transactionnelle, la vérification d'entitlement et le journal d'idempotence.
 * Ce fichier n'ajoute que la marche qui manquait : LIRE une animation terminée
 * et la traduire en configuration (`@/lib/experience-relance`).
 *
 * ── UN SEUL EXPORT, ET C'EST DÉLIBÉRÉ ──
 *
 * Dans un module « use server », chaque export est une route publique. Le
 * sérialiseur, les chargeurs et la dérivation de clé restent donc internes :
 * ils sont testés à travers `@/lib/experience-relance`, qui est pur. C'est la
 * leçon de `createExperienceBlueprintVersion`, retirée pour avoir été un point
 * d'entrée HTTP acceptant une configuration venue du client.
 *
 * Corollaire du même principe : `relancerFormule` prend un IDENTIFIANT et lit
 * la base. Jamais une configuration fournie par l'appelant — sans quoi
 * n'importe quel navigateur authentifié pourrait écrire le contenu de son
 * choix dans un module.
 *
 * ── LES GARDES, DANS CET ORDRE ──
 *
 * 1. session et organisation active (`getUserAndOrg`) ;
 * 2. rôle `owner` ou `editor` — le patron est celui de `campaign-templates.ts`,
 *    PAS celui de `duplicateCampaign` qui omet la vérification de rôle ;
 * 3. adaptateur applicable — sinon on refuse avec le message métier ;
 * 4. lecture de la source par le client de SESSION (donc sous RLS) ET filtre
 *    `organization_id` explicite : une source d'une autre organisation est
 *    « introuvable », jamais « refusée » ;
 * 5. source CLÔTURÉE — le même prédicat que la Carte de l'Aventure.
 */

const NOT_EDITOR = "Action non autorisée";
const GENERIC_ERROR = "Une erreur est survenue, réessayez.";
const SOURCE_INTROUVABLE = "Animation introuvable.";
const PAS_TERMINEE =
  "Terminez d'abord cette animation : la relance repart d'une formule qui a fini de tourner.";
const RELANCE_CAMPAGNE =
  "Pour repartir d'une campagne, utilisez « Dupliquer » depuis la liste des campagnes.";
const DEJA_LANCEE =
  "Cette relance vient d'être lancée. Retrouvez le nouveau brouillon dans votre espace.";

const relanceSchema = z.object({
  kind: z.enum([
    "campaign",
    "pronostics",
    "hunt",
    "loyalty",
    "jackpot",
    "event",
    "calendar",
    "quiz",
    "referral",
  ]),
  sourceId: z.string().uuid(),
  /**
   * Clé d'idempotence du geste, fournie par le bouton. Facultative : à défaut,
   * une clé DÉRIVÉE et stable prend le relais (voir `identifiantDeGeste`).
   */
  requestId: z.string().uuid().optional(),
});

/**
 * Fenêtre de repli de l'idempotence, alignée sur celle du moteur d'application
 * (`APPLY_REQUEST_WINDOW_MS`, 10 s) : double-clic et rejeu réseau retombent sur
 * la même clé, une seconde relance délibérée aboutit.
 */
const FENETRE_GESTE_MS = 10_000;

/**
 * UUID déterministe (forme v4) dérivé d'une graine et d'un seau de temps.
 *
 * Même technique que `deriveApplyRequestId` — volontairement recopiée plutôt
 * que partagée : la fonction voisine vit dans un module « use server » où
 * aucune fonction non-async ne peut être exportée, et la factoriser
 * demanderait de déplacer un helper d'un fichier hors du périmètre de ce lot.
 */
function identifiantDeGeste(graine: string, maintenant = Date.now()): string {
  const seau = Math.floor(maintenant / FENETRE_GESTE_MS);
  const digest = createHash("sha256")
    .update(`experience-relance:v1:${graine}:${seau}`)
    .digest("hex")
    .slice(0, 32)
    .split("");
  digest[12] = "4";
  digest[16] = "89ab"[Number.parseInt(digest[16], 16) % 4];
  const hex = digest.join("");
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20, 32),
  ].join("-");
}

function estKindRelance(kind: ExperienceKind): kind is KindRelance {
  return (KINDS_RELANCE as readonly string[]).includes(kind);
}

/*
 * Les colonnes `status` du schéma généré sont des `text`. Ces trois fonctions
 * les ramènent au vocabulaire fermé des marqueurs — TOTALES, donc sans `as` :
 * un état inconnu retombe sur le plus prudent (« pas encore ouvert »), ce qui
 * refuse la relance plutôt que de l'autoriser sur une animation vivante.
 */
function statutTroisEtats(valeur: string): "draft" | "active" | "archived" {
  if (valeur === "active") return "active";
  if (valeur === "archived") return "archived";
  return "draft";
}

function statutConcours(valeur: string): "draft" | "active" | "finished" {
  if (valeur === "active") return "active";
  if (valeur === "finished") return "finished";
  return "draft";
}

function statutSession(
  valeur: string,
): "draft" | "lobby" | "live" | "ended" | "archived" {
  if (valeur === "lobby") return "lobby";
  if (valeur === "live") return "live";
  if (valeur === "ended") return "ended";
  if (valeur === "archived") return "archived";
  return "draft";
}

type SupabaseSession = Awaited<ReturnType<typeof createClient>>;

type Chargement = { source: SourceRelance; cloturee: boolean };

/**
 * Lit l'animation d'origine — client de SESSION, filtre `organization_id`.
 *
 * Une source appartenant à une autre organisation ne remonte pas : la RLS la
 * cache déjà, et le filtre explicite la cacherait encore si une policy venait à
 * s'élargir. Le résultat est `null`, indiscernable d'un identifiant inexistant.
 */
async function chargerSource(
  supabase: SupabaseSession,
  kind: KindRelance,
  sourceId: string,
  organizationId: string,
): Promise<Chargement | null> {
  const maintenant = new Date();

  if (kind === "quiz") {
    const { data } = await supabase
      .from("quizzes")
      .select(
        "name, theme, intro_text, status, draw_state, drawn_at, reward_label, reward_details, reward_stock, quiz_questions(position, question_type, prompt, options, correct_answer, preset, time_limit_seconds, points)",
      )
      .eq("id", sourceId)
      .eq("organization_id", organizationId)
      .maybeSingle();
    if (!data) return null;
    return {
      source: {
        kind: "quiz",
        name: data.name,
        theme: data.theme,
        intro_text: data.intro_text,
        reward_label: data.reward_label,
        reward_details: data.reward_details,
        reward_stock: data.reward_stock,
        questions: data.quiz_questions,
      },
      cloturee:
        etatSourceRelance(
          "quiz",
          {
            status: statutTroisEtats(data.status),
            draw_state: data.draw_state === "done" ? "done" : "pending",
            drawn_at: data.drawn_at,
          },
          maintenant,
        ) === "completed",
    };
  }

  if (kind === "hunt") {
    const { data } = await supabase
      .from("hunts")
      .select(
        "name, status, order_mode, min_scan_interval_seconds, starts_at, ends_at, reward_label, reward_details, reward_stock, hunt_steps(position, label, hint_text)",
      )
      .eq("id", sourceId)
      .eq("organization_id", organizationId)
      .maybeSingle();
    if (!data) return null;
    return {
      source: {
        kind: "hunt",
        name: data.name,
        order_mode: data.order_mode,
        min_scan_interval_seconds: data.min_scan_interval_seconds,
        reward_label: data.reward_label,
        reward_details: data.reward_details,
        reward_stock: data.reward_stock,
        steps: data.hunt_steps,
      },
      cloturee:
        etatSourceRelance(
          "hunt",
          {
            status: statutTroisEtats(data.status),
            starts_at: data.starts_at,
            ends_at: data.ends_at,
          },
          maintenant,
        ) === "completed",
    };
  }

  if (kind === "calendar") {
    const { data } = await supabase
      .from("calendars")
      .select(
        "name, theme, status, start_date, day_count, merchant_content, completion_reward_label, completion_reward_details, completion_reward_stock, calendar_days(day_index, content_text, is_special)",
      )
      .eq("id", sourceId)
      .eq("organization_id", organizationId)
      .maybeSingle();
    if (!data) return null;
    return {
      source: {
        kind: "calendar",
        name: data.name,
        theme: data.theme,
        merchant_content: data.merchant_content,
        completion_reward_label: data.completion_reward_label,
        completion_reward_details: data.completion_reward_details,
        completion_reward_stock: data.completion_reward_stock,
        days: data.calendar_days,
      },
      cloturee:
        etatSourceRelance(
          "calendar",
          {
            status: statutTroisEtats(data.status),
            start_date: data.start_date,
            day_count: data.day_count,
          },
          maintenant,
        ) === "completed",
    };
  }

  if (kind === "loyalty") {
    const { data } = await supabase
      .from("loyalty_programs")
      .select(
        "name, status, validation_mode, rotating_period_seconds, min_stamp_interval_seconds, silver_threshold, gold_threshold, loyalty_milestones(position, visit_count, reward_type, reward_label, reward_details, reward_stock)",
      )
      .eq("id", sourceId)
      .eq("organization_id", organizationId)
      .maybeSingle();
    if (!data) return null;
    return {
      source: {
        kind: "loyalty",
        name: data.name,
        validation_mode: data.validation_mode,
        rotating_period_seconds: data.rotating_period_seconds,
        min_stamp_interval_seconds: data.min_stamp_interval_seconds,
        silver_threshold: data.silver_threshold,
        gold_threshold: data.gold_threshold,
        milestones: data.loyalty_milestones,
      },
      cloturee:
        etatSourceRelance(
          "loyalty",
          { status: statutTroisEtats(data.status) },
          maintenant,
        ) === "completed",
    };
  }

  if (kind === "event") {
    const { data } = await supabase
      .from("event_games")
      .select(
        "name, status, event_questions(position, question_type, prompt, time_limit_seconds, points_base, event_question_options(position, label, is_correct)), event_sessions(status, label, reward_label, reward_details, reward_stock, created_at)",
      )
      .eq("id", sourceId)
      .eq("organization_id", organizationId)
      .maybeSingle();
    if (!data) return null;
    // La première salle ouverte porte le libellé et la dotation de référence :
    // c'est celle que le moteur d'application recrée, une par jeu.
    const salle = [...data.event_sessions].sort((a, b) =>
      a.created_at.localeCompare(b.created_at),
    )[0];
    return {
      source: {
        kind: "event",
        name: data.name,
        session_label: salle?.label ?? null,
        reward_label: salle?.reward_label ?? "",
        reward_details: salle?.reward_details ?? null,
        reward_stock: salle?.reward_stock ?? 0,
        questions: data.event_questions.map((question) => ({
          position: question.position,
          question_type: question.question_type,
          prompt: question.prompt,
          time_limit_seconds: question.time_limit_seconds,
          points_base: question.points_base,
          options: question.event_question_options,
        })),
      },
      cloturee:
        etatSourceRelance(
          "event",
          {
            status: statutTroisEtats(data.status),
            sessions: data.event_sessions.map((session) => ({
              status: statutSession(session.status),
            })),
          },
          maintenant,
        ) === "completed",
    };
  }

  const { data } = await supabase
    .from("contests")
    .select(
      "name, status, finalized_at, competition_key, event_kind, collect_email, collect_phone, scoring, contest_matches!contest_matches_contest_id_fkey(position, home_name, away_name, kickoff_at)",
    )
    .eq("id", sourceId)
    .eq("organization_id", organizationId)
    .maybeSingle();
  if (!data) return null;
  return {
    source: {
      kind: "pronostics",
      name: data.name,
      competition_key: data.competition_key,
      event_kind: data.event_kind,
      collect_email: data.collect_email,
      collect_phone: data.collect_phone,
      scoring: data.scoring,
      matches: data.contest_matches,
    },
    cloturee:
      etatSourceRelance(
        "pronostics",
        {
          status: statutConcours(data.status),
          finalized_at: data.finalized_at,
        },
        maintenant,
      ) === "completed",
  };
}

/**
 * Nom du modèle créé : « Relance de <source> », suivi d'un discriminant.
 *
 * `experience_blueprints` porte `unique (organization_id, name)`. Sans
 * discriminant, la deuxième relance d'une même animation échouerait sur « Un
 * modèle porte déjà ce nom » — c'est-à-dire qu'une formule ne serait
 * relançable qu'une fois. Le discriminant vient du geste : il est STABLE pour
 * un double-clic (qui retombe alors, à dessein, sur le refus d'unicité) et
 * différent d'une relance à l'autre.
 */
function nomDuModele(nomSource: string, geste: string): string {
  const suffixe = ` · ${geste.slice(0, 6)}`;
  const prefixe = `Relance de ${nomSource}`;
  return `${prefixe.slice(0, 120 - suffixe.length)}${suffixe}`;
}

export async function relancerFormule(input: {
  kind: ExperienceKind;
  sourceId: string;
  requestId?: string;
}): Promise<ActionResult<{ targetId: string; dashboardHref: string }>> {
  const parsed = relanceSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Relance invalide." };

  const { user, organization, role } = await getUserAndOrg();
  if (!user || !organization) redirect("/login");
  if (role !== "owner" && role !== "editor") return { ok: false, error: NOT_EDITOR };

  const kind = parsed.data.kind;
  if (!estKindRelance(kind)) {
    // Une campagne a déjà son geste — « Dupliquer » — et il fait mieux : il
    // recopie la roue, ses lots et son style. Y renvoyer vaut mieux que
    // d'avouer une limite du moteur universel.
    if (kind === "campaign") return { ok: false, error: RELANCE_CAMPAGNE };
    const adapter = getExperienceBlueprintAdapter(kind);
    return {
      ok: false,
      error: adapter.support.supported ? GENERIC_ERROR : adapter.support.reason,
    };
  }

  const supabase = await createClient();
  const chargement = await chargerSource(
    supabase,
    kind,
    parsed.data.sourceId,
    organization.id,
  );
  if (!chargement) return { ok: false, error: SOURCE_INTROUVABLE };
  if (!chargement.cloturee) return { ok: false, error: PAS_TERMINEE };

  const serialise = serialiserRelance(chargement.source);
  if (!serialise.ok) return { ok: false, error: serialise.error };

  const geste =
    parsed.data.requestId ??
    identifiantDeGeste(`${user.id}:${kind}:${parsed.data.sourceId}`);

  const modele = await createExperienceBlueprint({
    kind,
    name: nomDuModele(chargement.source.name, geste),
    description: "Créé par « Relancer une formule ».",
    schemaVersion: EXPERIENCE_BLUEPRINT_SCHEMA_VERSION,
    configuration: serialise.configuration,
    defaultRewards: serialise.defaultRewards,
  });
  if (!modele.ok) {
    // L'unicité de nom est ici le filet du double-clic : le geste a déjà créé
    // son modèle, inutile d'en fabriquer un second.
    if (modele.error.includes("porte déjà ce nom")) {
      return { ok: false, error: DEJA_LANCEE };
    }
    return modele;
  }

  const publication = await publishExperienceBlueprintVersion({
    blueprintId: modele.data.blueprintId,
    version: modele.data.version,
  });
  if (!publication.ok) {
    reportError("experience-relance.publish", publication.error);
    return { ok: false, error: publication.error };
  }

  // Le moteur historique fait le reste : transaction, entitlement, journal
  // d'idempotence sur (organisation, request_id). Rien n'est publié — la
  // relance rend un BROUILLON, comme tout modèle appliqué.
  return await applyExperienceBlueprintVersion({
    blueprintId: modele.data.blueprintId,
    version: modele.data.version,
    requestId: geste,
  });
}
