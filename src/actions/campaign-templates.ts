"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getUserAndOrg } from "@/lib/auth";
import {
  blueprintToDraft,
  getCampaignTemplate,
  CAMPAIGN_BLUEPRINT_VERSION,
  DEFAULT_TEMPLATE_DURATION_DAYS,
  type BlueprintPrize,
  type CampaignBlueprint,
} from "@/lib/campaign-templates";
import { reportError } from "@/lib/monitoring";
import { createClient } from "@/lib/supabase/server";
import { toJson } from "@/lib/supabase/json";
import type { ActionResult } from "@/lib/utils";
import {
  applyCampaignTemplateSchema,
  BLUEPRINT_MAX_DURATION_DAYS,
  BLUEPRINT_MAX_PRIZES,
  BLUEPRINT_MIN_DURATION_DAYS,
  campaignBlueprintSchema,
  type CampaignBlueprintParsed,
  deleteCampaignTemplateSchema,
  saveCampaignAsTemplateSchema,
} from "@/lib/validations/campaign-templates";
import { resolveWheelStyle } from "@/lib/wheel-style";
import type { EngagementConfig, Prize, Wheel } from "@/types/database";

/**
 * Place de marché de campagnes — actions commerçant.
 *
 * TROIS INVARIANTS, vérifiables en lisant ce fichier :
 *
 *  1. AUCUNE AUTOMATISATION N'EST ACTIVÉE. Rien ici n'écrit dans
 *     `automation_settings`, ne dépose de job (`enqueueJob`) ni n'appelle
 *     `@/lib/resend` — cherchez : ces symboles n'apparaissent nulle part.
 *     Les textes d'email d'un modèle restent des TEXTES, transportés dans
 *     le blueprint pour que le commerçant les copie s'il le veut. Un
 *     modèle appliqué par curiosité n'écrit jamais à un client.
 *
 *  2. LA CAMPAGNE CRÉÉE EST UN BROUILLON. `status: 'draft'` ET
 *     `auto_schedule: false` (posés par `blueprintToDraft`) : sans le
 *     second, `run_campaign_schedule()` — pg_cron toutes les 10 min —
 *     ferait passer le brouillon en `active` tout seul dès que
 *     `starts_at <= now()`, c'est-à-dire immédiatement. L'activation
 *     reste un geste explicite du commerçant.
 *
 *  3. TOUT EST ORG-SCOPÉ PAR LA SESSION. L'organisation et le rôle
 *     viennent de `getUserAndOrg()`, jamais du formulaire ; toutes les
 *     requêtes passent par le client de SESSION (donc sous RLS) et
 *     portent en plus un filtre `organization_id` explicite. Aucun
 *     `createAdminClient()` ici : un modèle privé n'est lisible que par
 *     son organisation, et le service_role n'a rien à faire sur ce
 *     chemin.
 *
 * ── LIMITE CONNUE : l'application d'un modèle n'est PAS atomique ──
 *
 * `applyCampaignTemplate` écrit campagne, jeu puis lots en TROIS requêtes
 * PostgREST distinctes, chacune validée pour elle-même. La création
 * manuelle, elle, tient dans une transaction depuis
 * `create_campaign_with_defaults` — dont la définition VIVANTE est celle
 * de la migration 20260808120000, PAS celle de 20260806120000 qui l'a
 * introduite (la première se gardait par `is_org_member` et ouvrait donc
 * campagnes, roues et lots au caissier).
 *
 * Cette RPC écrit bien campagne + roue + lots, et reçoit même le style de
 * roue et la liste des lots en paramètres. Ce qu'elle ne sait PAS
 * transporter est exactement ce qui fait un modèle : dates, budget,
 * règles de collecte, TTL du code, type de jeu, limite de participation,
 * configuration de défi, stock et coût des lots. L'appeler ici rendrait
 * bien la création atomique, mais livrerait un « Noël » sans dates ni
 * stock — une campagne complète et méconnaissable.
 *
 * Tant qu'une RPC équivalente n'existe pas pour ce chemin, l'atomicité
 * est REMPLACÉE par un rattrapage explicite (`discardPartialCampaign`) :
 * moins solide qu'une transaction — il peut lui-même échouer, et il ne
 * couvre que les deux étapes où l'identifiant de la campagne est déjà
 * connu — mais il ne laisse plus le commerçant devant une campagne
 * fantôme sans le lui dire.
 */

const NOT_EDITOR = "Action non autorisée";
const GENERIC_ERROR = "Une erreur est survenue, réessayez.";

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Défait une campagne à moitié créée, puis rédige le message qui décrit ce
 * qui s'est RÉELLEMENT passé.
 *
 * Le défaut réparé ici : les trois écritures d'`applyCampaignTemplate` ne
 * partagent aucune transaction. Un échec sur le jeu ou sur les lots laissait
 * en base une campagne INJOUABLE — sans jeu, ou avec un jeu sans lot — et le
 * message se contentait de l'avouer (« Campagne créée mais jeu manquant »),
 * à charge pour le commerçant de la retrouver dans sa liste et de la
 * supprimer. C'est mot pour mot le défaut que la PR #36 a corrigé sur la
 * création manuelle ; il survivait intact sur ce chemin-ci.
 *
 * Faute de transaction, on compense : on supprime la campagne. Le jeu et les
 * lots éventuellement écrits partent avec elle — `wheels.campaign_id` et
 * `prizes.wheel_id` sont en `on delete cascade` (00001:55 et 00001:68). La
 * suppression passe par le client de SESSION et porte le filtre org : elle ne
 * peut rien atteindre hors de l'organisation active, et la policy VIVANTE
 * « campaigns: editors » (00019:66-68, `is_org_editor`) l'autorise au rôle
 * déjà vérifié en tête d'action.
 *
 * Si le rattrapage échoue à son tour, on ne fait pas semblant : le message
 * NOMME la campagne restée en place et dit quoi en faire, et la liste est
 * revalidée pour qu'elle y soit visible. Un commerçant qui lit « rien n'a été
 * créé » alors qu'une campagne fantôme traîne dans sa liste perd plus de
 * temps que celui à qui on dit la vérité.
 *
 * Trois limites écrites ici pour que personne ne les redécouvre :
 *  • la promesse « aucune campagne n'a été créée » se déduit de l'ABSENCE
 *    d'erreur, pas d'un nombre de lignes — PostgREST ne signale pas un
 *    DELETE à zéro ligne. Elle tient parce que le `using` de la policy
 *    « campaigns: editors » est le MÊME prédicat que le `with check` qui
 *    vient d'accepter l'insertion : ce qui a pu être écrit peut être repris ;
 *  • pas de `revalidatePlaySlugs` avant la suppression, contrairement à
 *    `deleteCampaign` : ce chemin ne crée AUCUN `qr_code` (aucune migration
 *    n'en insère), donc aucun slug `/play` n'est en cache à purger ;
 *  • l'échec de la PREMIÈRE écriture reste hors couverture — sans
 *    identifiant de campagne, il n'y a rien à supprimer.
 */
async function discardPartialCampaign(
  supabase: Awaited<ReturnType<typeof createClient>>,
  organizationId: string,
  campaign: { id: string; name: string },
): Promise<string> {
  const { error } = await supabase
    .from("campaigns")
    .delete()
    .eq("id", campaign.id)
    .eq("organization_id", organizationId);

  if (!error) {
    return "Ce modèle n'a pas pu être appliqué, réessayez. Aucune campagne n'a été créée.";
  }

  reportError("campaign-templates.rollback", error.message);
  revalidatePath("/dashboard/campaigns");
  // « Ouvrez-la … dans ses réglages » et non « supprimez-la depuis la liste » :
  // la liste des campagnes n'offre aucun bouton de suppression, il est dans les
  // réglages de la campagne (`CampaignSettings`, /dashboard/campaigns/[id]).
  // Un message qui envoie le commerçant chercher un bouton inexistant coûte
  // autant qu'un message absent.
  return `Ce modèle n'a pas pu être appliqué jusqu'au bout : la campagne « ${campaign.name} » est restée incomplète et injouable. Ouvrez-la depuis la liste des campagnes et supprimez-la dans ses réglages, puis réessayez.`;
}

/**
 * Applique un modèle : crée une campagne EN BROUILLON entièrement
 * configurée (règles + dates relatives, roue stylée, lots suggérés) et
 * renvoie son id pour que l'appelant ouvre l'éditeur.
 *
 * Trois sources, une seule à la fois :
 *  • `blueprint` — un blueprint fourni DIRECTEMENT (assistant IA de création) ;
 *  • `templateKey` — un modèle du CATALOGUE Lastchance (code versionné) ;
 *  • `templateId` — un modèle PRIVÉ, lu avec le client de SESSION (donc
 *    sous RLS `campaign_templates: editors`) ET filtré explicitement
 *    sur l'organisation active. Jamais de service_role : c'est l'invariant
 *    signalé par la revue DB.
 *
 * Le blueprint est revalidé dans les TROIS cas avant application — y
 * compris celui fourni en direct : un blueprint proposé par l'assistant, un
 * modèle privé écrit par une version antérieure, ou un jsonb trafiqué, ne
 * doit jamais produire une campagne incohérente.
 */
export async function applyCampaignTemplate(input: {
  templateKey?: string;
  templateId?: string;
  blueprint?: CampaignBlueprintParsed;
}): Promise<ActionResult<{ campaignId: string }>> {
  const parsed = applyCampaignTemplateSchema.safeParse({
    templateKey: input.templateKey || undefined,
    templateId: input.templateId || undefined,
    blueprint: input.blueprint,
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0].message };
  }

  const { user, organization, role } = await getUserAndOrg();
  if (!user || !organization) redirect("/login");
  if (role !== "owner" && role !== "editor") return { ok: false, error: NOT_EDITOR };

  const supabase = await createClient();

  let rawBlueprint: unknown;
  if (parsed.data.blueprint) {
    // Fourni en direct : accepté tel quel, la garde `campaignBlueprintSchema`
    // ci-dessous en revalide la forme comme pour les deux autres sources.
    rawBlueprint = parsed.data.blueprint;
  } else if (parsed.data.templateKey) {
    const template = getCampaignTemplate(parsed.data.templateKey);
    if (!template) return { ok: false, error: "Modèle introuvable" };
    rawBlueprint = template.blueprint;
  } else {
    // Modèle PRIVÉ : client de session (RLS) + filtre org explicite.
    const { data: row, error } = await supabase
      .from("campaign_templates")
      .select("blueprint")
      .eq("id", parsed.data.templateId!)
      .eq("organization_id", organization.id)
      .maybeSingle();
    if (error) {
      reportError("campaign-templates.load-private", error.message);
      return { ok: false, error: GENERIC_ERROR };
    }
    if (!row) return { ok: false, error: "Modèle introuvable" };
    rawBlueprint = row.blueprint;
  }

  const blueprint = campaignBlueprintSchema.safeParse(rawBlueprint);
  if (!blueprint.success) {
    reportError(
      "campaign-templates.blueprint-invalide",
      blueprint.error.issues[0]?.message ?? "raison inconnue",
    );
    return {
      ok: false,
      error: "Ce modèle est illisible, enregistrez-le à nouveau.",
    };
  }

  const draft = blueprintToDraft(blueprint.data as CampaignBlueprint, new Date());

  const { data: campaign, error: campaignError } = await supabase
    .from("campaigns")
    .insert({
      organization_id: organization.id,
      name: draft.campaign.name,
      // Brouillon + programmation désactivée : rien ne se publie tout seul.
      status: draft.campaign.status,
      auto_schedule: draft.campaign.auto_schedule,
      starts_at: draft.campaign.starts_at,
      ends_at: draft.campaign.ends_at,
      budget_cents: draft.campaign.budget_cents,
      engagement: toJson(draft.campaign.engagement),
      collect_email: draft.campaign.collect_email,
      collect_phone: draft.campaign.collect_phone,
      code_ttl_seconds: draft.campaign.code_ttl_seconds,
    })
    .select("id")
    .single();

  if (campaignError || !campaign) {
    reportError(
      "campaign-templates.create-campaign",
      campaignError?.message ?? "raison inconnue",
    );
    return { ok: false, error: "Impossible de créer la campagne" };
  }

  const { data: wheel, error: wheelError } = await supabase
    .from("wheels")
    .insert({
      organization_id: organization.id,
      campaign_id: campaign.id,
      name: draft.wheel.name,
      style: draft.wheel.style,
      game_type: draft.wheel.game_type,
      play_limit: draft.wheel.play_limit,
      skill_config: toJson(draft.wheel.skill_config),
    })
    .select("id")
    .single();

  if (wheelError || !wheel) {
    reportError(
      "campaign-templates.create-wheel",
      wheelError?.message ?? "raison inconnue",
    );
    // Une campagne sans jeu n'est pas une campagne « presque prête » : le
    // parcours /play n'a rien à servir. On la retire plutôt que de l'annoncer.
    return {
      ok: false,
      error: await discardPartialCampaign(supabase, organization.id, {
        id: campaign.id,
        name: draft.campaign.name,
      }),
    };
  }

  const { error: prizesError } = await supabase.from("prizes").insert(
    draft.prizes.map((prize) => ({
      organization_id: organization.id,
      wheel_id: wheel.id,
      label: prize.label,
      description: prize.description,
      color: prize.color,
      weight: prize.weight,
      is_losing: prize.is_losing,
      stock: prize.stock,
      cost_cents: prize.cost_cents,
      position: prize.position,
    })),
  );
  if (prizesError) {
    reportError("campaign-templates.create-prizes", prizesError.message);
    // Les lots partent en UNE insertion multi-lignes : elle est refusée en
    // bloc, donc l'état laissé derrière est « campagne + jeu, zéro lot » —
    // une roue qui ne peut rien faire tourner. Même traitement que le jeu
    // manquant : on retire tout et on le dit.
    return {
      ok: false,
      error: await discardPartialCampaign(supabase, organization.id, {
        id: campaign.id,
        name: draft.campaign.name,
      }),
    };
  }

  // Aucun scénario d'email activé, aucun job déposé : le brouillon est
  // inerte tant que le commerçant ne l'active pas lui-même.
  revalidatePath("/dashboard/campaigns");
  return { ok: true, data: { campaignId: campaign.id } };
}

/** Durée relative (jours) déduite de la période d'une campagne existante. */
function durationDaysFrom(startsAt: string | null, endsAt: string | null): number {
  if (!startsAt || !endsAt) return DEFAULT_TEMPLATE_DURATION_DAYS;
  const start = Date.parse(startsAt);
  const end = Date.parse(endsAt);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
    return DEFAULT_TEMPLATE_DURATION_DAYS;
  }
  const days = Math.ceil((end - start) / DAY_MS);
  return Math.min(BLUEPRINT_MAX_DURATION_DAYS, Math.max(BLUEPRINT_MIN_DURATION_DAYS, days));
}

/**
 * Enregistre une campagne existante comme modèle PRIVÉ réutilisable :
 * sérialise campagne + roue principale + lots actifs en blueprint, puis
 * insère dans `campaign_templates` (RLS éditeur).
 *
 * `created_by`, `created_at` et `updated_at` ne sont PAS envoyés : le
 * trigger `campaign_templates_attribution` les pose depuis la session
 * (l'auteur ne vient jamais du corps de la requête).
 *
 * Le modèle ne capture AUCUN état d'automatisation : `automation_settings`
 * n'est pas lu, et le blueprint part sans textes d'email (le commerçant
 * les ajoutera s'il le souhaite). Enregistrer un modèle ne peut donc pas
 * propager un scénario d'emailing d'une campagne à une autre.
 */
export async function saveCampaignAsTemplate(input: {
  campaignId: string;
  name: string;
  description?: string;
}): Promise<ActionResult<{ templateId: string }>> {
  const parsed = saveCampaignAsTemplateSchema.safeParse({
    campaignId: input.campaignId,
    name: input.name,
    description: input.description ?? "",
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0].message };
  }

  const { user, organization, role } = await getUserAndOrg();
  if (!user || !organization) redirect("/login");
  if (role !== "owner" && role !== "editor") return { ok: false, error: NOT_EDITOR };

  const supabase = await createClient();

  const { data: source } = await supabase
    .from("campaigns")
    .select("*, wheels!wheels_campaign_id_fkey(*, prizes!prizes_wheel_id_fkey(*))")
    .eq("id", parsed.data.campaignId)
    .eq("organization_id", organization.id)
    .maybeSingle();

  if (!source) return { ok: false, error: "Campagne introuvable" };

  const campaign = source as unknown as {
    id: string;
    name: string;
    starts_at: string | null;
    ends_at: string | null;
    budget_cents: number | null;
    engagement: EngagementConfig;
    collect_email: boolean;
    collect_phone: boolean;
    code_ttl_seconds: number | null;
    wheels: (Wheel & { skill_config: Record<string, unknown> | null; prizes: Prize[] })[];
  };

  // « Roue active » d'une campagne : la première par position — c'est
  // celle que le parcours joueur sert en priorité. Un modèle porte UNE
  // mécanique, pas la grille multi-roues.
  const wheel = [...(campaign.wheels ?? [])].sort((a, b) => a.position - b.position)[0];
  if (!wheel) return { ok: false, error: "Cette campagne n'a pas encore de jeu à enregistrer" };

  // Le style est relu en mode tolérant (jsonb potentiellement ancien) puis
  // reposé comme SURCHARGES complètes : le modèle reproduit exactement le
  // visuel, quel que soit l'état du préréglage d'origine. `preset` et
  // `title` sont retirés — ils sont portés par `visual.preset` et
  // `texts.wheelTitle`.
  const style = resolveWheelStyle(wheel.style);
  const { preset, title, ...styleOverrides } = style;

  const prizes: BlueprintPrize[] = (wheel.prizes ?? [])
    .filter((prize) => prize.is_active)
    .sort((a, b) => a.position - b.position)
    .slice(0, BLUEPRINT_MAX_PRIZES)
    .map((prize) => ({
      label: prize.label,
      description: prize.description ?? "",
      color: prize.color,
      weight: prize.weight,
      is_losing: prize.is_losing,
      stock: prize.stock,
      cost_cents: prize.cost_cents,
    }));

  const candidate = {
    version: CAMPAIGN_BLUEPRINT_VERSION,
    texts: {
      campaignName: campaign.name,
      wheelName: wheel.name,
      wheelTitle: title || "Tentez votre chance !",
    },
    visual: { preset: preset || "classic", style: styleOverrides },
    game: {
      game_type: wheel.game_type,
      skill_config: wheel.skill_config ?? null,
    },
    prizes,
    rules: {
      play_limit: wheel.play_limit,
      collect_email: campaign.collect_email,
      collect_phone: campaign.collect_phone,
      code_ttl_seconds: campaign.code_ttl_seconds,
      engagement: campaign.engagement ?? {},
      budget_cents: campaign.budget_cents,
    },
    durationDays: durationDaysFrom(campaign.starts_at, campaign.ends_at),
    // Aucun texte d'email repris : une campagne n'en porte pas, et un
    // modèle ne doit rien transporter qui ressemble à un envoi.
    emails: [],
  };

  const blueprint = campaignBlueprintSchema.safeParse(candidate);
  if (!blueprint.success) {
    // Messages déjà rédigés pour le commerçant (« au moins 2 lots », …).
    return { ok: false, error: blueprint.error.issues[0].message };
  }

  const { data: template, error } = await supabase
    .from("campaign_templates")
    .insert({
      organization_id: organization.id,
      name: parsed.data.name,
      description: parsed.data.description || null,
      blueprint: toJson(blueprint.data),
      source_campaign_id: campaign.id,
      // created_by / created_at / updated_at : posés par le trigger.
    })
    .select("id")
    .single();

  if (error || !template) {
    // Unicité (organization_id, name) — la bibliothèque du commerçant.
    if (error?.code === "23505") {
      return { ok: false, error: "Un modèle porte déjà ce nom." };
    }
    reportError("campaign-templates.save", error?.message ?? "raison inconnue");
    return { ok: false, error: "Enregistrement impossible" };
  }

  revalidatePath("/dashboard/campaigns");
  revalidatePath(`/dashboard/campaigns/${campaign.id}`);
  return { ok: true, data: { templateId: template.id } };
}

/** Supprime un modèle privé de la bibliothèque de l'organisation active. */
export async function deleteCampaignTemplate(input: {
  id: string;
}): Promise<ActionResult> {
  const parsed = deleteCampaignTemplateSchema.safeParse({ id: input.id });
  if (!parsed.success) {
    return { ok: false, error: "Données invalides" };
  }

  const { user, organization, role } = await getUserAndOrg();
  if (!user || !organization) redirect("/login");
  if (role !== "owner" && role !== "editor") return { ok: false, error: NOT_EDITOR };

  const supabase = await createClient();
  const { error } = await supabase
    .from("campaign_templates")
    .delete()
    .eq("id", parsed.data.id)
    .eq("organization_id", organization.id);

  if (error) {
    reportError("campaign-templates.delete", error.message);
    return { ok: false, error: "Suppression impossible" };
  }

  revalidatePath("/dashboard/campaigns");
  return { ok: true, data: undefined };
}
