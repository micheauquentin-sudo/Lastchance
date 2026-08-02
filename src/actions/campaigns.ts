"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getUserAndOrg } from "@/lib/auth";
import { zonedDateTimeToIso } from "@/lib/date-time";
import { messageAccesCampagne } from "@/lib/message-acces-campagne";
import { reportError } from "@/lib/monitoring";
import { revalidatePlaySlugs } from "@/lib/revalidate-play";
import { hasEverSubscribed } from "@/lib/stripe";
import { createClient } from "@/lib/supabase/server";
import { hasActiveAccess, isTrialExpired } from "@/lib/subscription";
import { getPreset } from "@/lib/wheel-style";
import {
  CAMPAIGN_OUTSTANDING_LOSS_HINT,
  createCampaignSchema,
  deleteCampaignSchema,
  duplicateCampaignSchema,
  resumeCampaignBudgetSchema,
  updateCampaignAutomationSchema,
  updateCampaignClaimSchema,
  updateCampaignEngagementSchema,
  updateCampaignSchema,
} from "@/lib/validations/campaigns";
import type { ActionResult } from "@/lib/utils";
import type {
  EngagementConfig,
  Organization,
  Prize,
  Wheel,
} from "@/types/database";

/** Lots par défaut d'une nouvelle roue : jouable immédiatement. */
const DEFAULT_PRIZES = [
  { label: "Café offert", description: "Un café offert au comptoir.", color: "#f59e0b", weight: 40, is_losing: false, position: 0 },
  { label: "Dessert offert", description: "Un dessert au choix.", color: "#ec4899", weight: 20, is_losing: false, position: 1 },
  { label: "Surprise", description: "Une surprise de la maison.", color: "#8b5cf6", weight: 10, is_losing: false, position: 2 },
  { label: "Pas de chance", description: "Retentez votre chance bientôt !", color: "#64748b", weight: 30, is_losing: true, position: 3 },
];

/**
 * L'organisation est-elle un ESSAI expiré, ou un abonnement mort ?
 *
 * NON EXPORTÉE : ce module est `"use server"`, tout export y devient un
 * endpoint réseau à protéger individuellement.
 *
 * Composée avec ce qui est réellement disponible ici. `getUserAndOrg` ne porte
 * pas `stripe_event_created_at` — la colonne est hors du `grant select(…)`
 * accordé à `authenticated` (00017) — d'où cette lecture `service_role`, payée
 * UNIQUEMENT sur `canceled`, le seul statut ambigu depuis que le cron
 * `expire-trials` y bascule aussi les essais jamais convertis. Partout ailleurs
 * la question ne se pose pas et aucune requête n'est faite. C'est exactement la
 * composition que `dashboard/layout.tsx` applique pour choisir son bandeau : le
 * refus sous le bouton et le bandeau au-dessus doivent dire la même chose.
 */
async function essaiExpire(
  organization: Pick<
    Organization,
    | "id"
    | "subscription_status"
    | "trial_ends_at"
    | "past_due_since"
    | "comp_access"
    | "comp_access_until"
  >,
): Promise<boolean> {
  const everSubscribed =
    organization.subscription_status === "canceled"
      ? await hasEverSubscribed(organization.id)
      : true;
  return isTrialExpired({ ...organization, ever_subscribed: everSubscribed });
}

export async function createCampaign(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = createCampaignSchema.safeParse({
    name: formData.get("name"),
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0].message };
  }

  const { user, organization, role } = await getUserAndOrg();
  if (!user || !organization) redirect("/login");

  // Défense en profondeur, même patron que `updateCampaignAutomation` et
  // `resumeCampaignAfterBudget` plus bas. Tant que la création passait par le
  // client de session, la RLS suffisait ; depuis qu'elle passe par une RPC
  // `security definer`, un seul prédicat trop large en base ouvre la porte —
  // c'est précisément ce qui est arrivé (migration 20260808120000). Deux
  // gardes indépendantes valent mieux qu'une, surtout après une escalade.
  if (role !== "owner" && role !== "editor") {
    return { ok: false, error: "Action non autorisée" };
  }

  const supabase = await createClient();

  // UNE transaction pour campagne + roue + lots (RPC
  // `create_campaign_with_defaults`, migration 20260806120000). Ces trois
  // écritures étaient auparavant séparées et sans rattrapage : un échec au
  // milieu laissait une campagne SANS ROUE, donc injouable, et le message
  // d'erreur l'avouait au commerçant (« Campagne créée mais roue manquante »),
  // à charge pour lui de la retrouver et de la supprimer. Désormais : soit la
  // campagne est complète, soit rien n'est écrit.
  //
  // Le style et les lots restent définis ICI, en TypeScript, et voyagent en
  // paramètres : la RPC apporte l'atomicité, pas une seconde source de vérité.
  // Style initial : préréglage « Kermesse » (l'univers du site) — le
  // commerçant peut ensuite tout personnaliser dans le Studio.
  const { data: campaignId, error } = await supabase.rpc(
    "create_campaign_with_defaults",
    {
      org_id: organization.id,
      campaign_name: parsed.data.name,
      wheel_style: getPreset("kermesse")?.style ?? {},
      default_prizes: DEFAULT_PRIZES,
    },
  );

  if (error || !campaignId) {
    reportError("campaigns.create", error?.message ?? "raison inconnue");
    return { ok: false, error: "Impossible de créer la campagne" };
  }

  revalidatePath("/dashboard/campaigns");
  redirect(`/dashboard/campaigns/${campaignId}`);
}

export async function updateCampaign(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = updateCampaignSchema.safeParse({
    id: formData.get("id"),
    name: formData.get("name") ?? undefined,
    status: formData.get("status") ?? undefined,
  });
  if (!parsed.success) {
    return { ok: false, error: "Données invalides" };
  }

  const { user, organization } = await getUserAndOrg();
  if (!user || !organization) redirect("/login");

  const { id, ...fields } = parsed.data;
  if (Object.keys(fields).length === 0) return { ok: true, data: undefined };

  // Essai expiré / abonnement inactif : les QR codes restent créables,
  // mais aucune campagne ne peut être (ré)activée. Le MOTIF est nommé, pas
  // présumé — le refus annonçait « votre essai gratuit est terminé » à un
  // résilié et à un impayé, pendant que le bandeau du même écran disait
  // correctement « votre abonnement est inactif ».
  if (fields.status === "active" && !hasActiveAccess(organization)) {
    return {
      ok: false,
      error: messageAccesCampagne({
        essaiTermine: await essaiExpire(organization),
        geste: "activation",
      }),
    };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("campaigns")
    .update(fields)
    .eq("id", id)
    .eq("organization_id", organization.id);

  if (error) {
    reportError("campaigns.update", error.message);
    return { ok: false, error: "Mise à jour impossible" };
  }

  revalidatePath("/dashboard/campaigns");
  revalidatePath(`/dashboard/campaigns/${id}`);
  // Le statut (active/paused) gate la page publique : purge ISR /play.
  await revalidatePlaySlugs(supabase, { campaignId: id });
  return { ok: true, data: undefined };
}

/**
 * Actions proposées au joueur avant de lancer la roue (par campagne) :
 * newsletter, Instagram, TikTok, avis Google.
 */
export async function updateCampaignEngagement(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  // Fonction conservée uniquement pour invalider proprement d'anciens
  // formulaires encore ouverts pendant un déploiement. Le jeu n'est plus
  // conditionnable à une action ni à la fourniture d'une coordonnée.
  const engagementGatesEnabled = false as boolean;
  if (!engagementGatesEnabled) {
    return { ok: false, error: "Les actions obligatoires avant le jeu ont été supprimées." };
  }
  const parsed = updateCampaignEngagementSchema.safeParse({
    id: formData.get("id"),
    newsletter: formData.get("newsletter") === "on",
    instagram: formData.get("instagram") === "on",
    instagram_url: formData.get("instagram_url") ?? "",
    tiktok: formData.get("tiktok") === "on",
    tiktok_url: formData.get("tiktok_url") ?? "",
    google_review: formData.get("google_review") === "on",
    google_review_url: formData.get("google_review_url") ?? "",
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0].message };
  }

  const { user, organization } = await getUserAndOrg();
  if (!user || !organization) redirect("/login");

  const d = parsed.data;
  const engagement: EngagementConfig = {
    newsletter: { enabled: d.newsletter },
    instagram: { enabled: d.instagram, url: d.instagram_url },
    tiktok: { enabled: d.tiktok, url: d.tiktok_url },
    google_review: { enabled: d.google_review, url: d.google_review_url },
  };

  const supabase = await createClient();
  const { error } = await supabase
    .from("campaigns")
    .update({ engagement })
    .eq("id", d.id)
    .eq("organization_id", organization.id);

  if (error) {
    reportError("campaigns.engagement", error.message);
    return { ok: false, error: "Enregistrement impossible" };
  }

  revalidatePath(`/dashboard/campaigns/${d.id}`);
  await revalidatePlaySlugs(supabase, { campaignId: d.id });
  return { ok: true, data: undefined };
}

/**
 * Réglages du formulaire après gain : email/téléphone demandés ou non
 * avant d'afficher le code, compte à rebours avant masquage du code.
 */
export async function updateCampaignClaim(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = updateCampaignClaimSchema.safeParse({
    id: formData.get("id"),
    collect_email: formData.get("collect_email") === "on",
    collect_phone: formData.get("collect_phone") === "on",
    code_ttl_seconds: formData.get("code_ttl_seconds") ?? "",
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0].message };
  }

  const { user, organization } = await getUserAndOrg();
  if (!user || !organization) redirect("/login");

  const { id, ...fields } = parsed.data;
  const supabase = await createClient();
  const { error } = await supabase
    .from("campaigns")
    .update(fields)
    .eq("id", id)
    .eq("organization_id", organization.id);

  if (error) {
    reportError("campaigns.claim-settings", error.message);
    return { ok: false, error: "Enregistrement impossible" };
  }

  revalidatePath(`/dashboard/campaigns/${id}`);
  await revalidatePlaySlugs(supabase, { campaignId: id });
  return { ok: true, data: undefined };
}

/**
 * Programmation automatique + budget d'une campagne. Champs de
 * formulaire : id, auto_schedule (checkbox), starts_at / ends_at
 * (datetime-local, vide = sans borne), budget (euros, vide = sans
 * plafond). La bascule active/pause elle-même est faite côté base
 * (run_campaign_schedule, pg_cron 10 min) ; l'imputation du budget vit
 * dans claim_winning_spin.
 */
export async function updateCampaignAutomation(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = updateCampaignAutomationSchema.safeParse({
    id: formData.get("id"),
    auto_schedule: formData.get("auto_schedule") === "on",
    starts_at: formData.get("starts_at") ?? "",
    ends_at: formData.get("ends_at") ?? "",
    budget_cents: formData.get("budget") ?? "",
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0].message };
  }

  const { user, organization, role } = await getUserAndOrg();
  if (!user || !organization) redirect("/login");
  // Budget et programmation : éditeurs uniquement (pas les caissiers).
  if (role !== "owner" && role !== "editor") {
    return { ok: false, error: "Action non autorisée" };
  }

  let startsAt: string | null;
  let endsAt: string | null;
  try {
    startsAt = parsed.data.starts_at
      ? zonedDateTimeToIso(parsed.data.starts_at, organization.timezone)
      : null;
    endsAt = parsed.data.ends_at
      ? zonedDateTimeToIso(parsed.data.ends_at, organization.timezone)
      : null;
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Date invalide",
    };
  }

  const { id } = parsed.data;
  const fields = {
    auto_schedule: parsed.data.auto_schedule,
    starts_at: startsAt,
    ends_at: endsAt,
    budget_cents: parsed.data.budget_cents,
  };
  const supabase = await createClient();
  const { error } = await supabase
    .from("campaigns")
    .update(fields)
    .eq("id", id)
    .eq("organization_id", organization.id);

  if (error) {
    reportError("campaigns.automation", error.message);
    return { ok: false, error: "Enregistrement impossible" };
  }

  revalidatePath("/dashboard/campaigns");
  revalidatePath(`/dashboard/campaigns/${id}`);
  // La période gate la page publique : purge ISR /play.
  await revalidatePlaySlugs(supabase, { campaignId: id });
  return { ok: true, data: undefined };
}

/**
 * Relance une campagne mise en pause automatiquement pour budget
 * atteint : repasse active (le trigger efface paused_reason), avec un
 * nouveau budget facultatif (champ `budget` en euros ; vide = budget
 * inchangé — la campagne se remettra en pause au prochain gain si le
 * plafond reste dépassé). budget_spent_cents n'est jamais remis à zéro :
 * c'est le cumul réel de la campagne.
 */
export async function resumeCampaignAfterBudget(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = resumeCampaignBudgetSchema.safeParse({
    id: formData.get("id"),
    budget_cents: formData.get("budget") ?? "",
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0].message };
  }

  const { user, organization, role } = await getUserAndOrg();
  if (!user || !organization) redirect("/login");
  // Relance d'une campagne (budget) : éditeurs uniquement.
  if (role !== "owner" && role !== "editor") {
    return { ok: false, error: "Action non autorisée" };
  }

  // Même règle que updateCampaign : pas de (ré)activation sans accès actif,
  // et le motif est nommé plutôt que présumé.
  if (!hasActiveAccess(organization)) {
    return {
      ok: false,
      error: messageAccesCampagne({
        essaiTermine: await essaiExpire(organization),
        geste: "relance",
      }),
    };
  }

  const supabase = await createClient();
  const { data: campaign } = await supabase
    .from("campaigns")
    .select("id, status, paused_reason")
    .eq("id", parsed.data.id)
    .eq("organization_id", organization.id)
    .maybeSingle();
  if (!campaign) return { ok: false, error: "Campagne introuvable" };
  if (campaign.status !== "paused" || campaign.paused_reason !== "budget_reached") {
    return { ok: false, error: "Cette campagne n'est pas en pause budget." };
  }

  const { error } = await supabase
    .from("campaigns")
    .update({
      status: "active",
      paused_reason: null,
      ...(parsed.data.budget_cents !== null
        ? { budget_cents: parsed.data.budget_cents }
        : {}),
    })
    .eq("id", campaign.id)
    .eq("organization_id", organization.id);

  if (error) {
    reportError("campaigns.resume-budget", error.message);
    return { ok: false, error: "Relance impossible" };
  }

  revalidatePath("/dashboard/campaigns");
  revalidatePath(`/dashboard/campaigns/${campaign.id}`);
  await revalidatePlaySlugs(supabase, { campaignId: campaign.id });
  return { ok: true, data: undefined };
}

/**
 * Duplique une campagne (réglages, roues, lots, PLAFOND DE DÉPENSE) comme
 * point de départ d'une nouvelle campagne — utile pour relancer un jeu
 * saisonnier sans tout recréer à la main. La copie démarre toujours en
 * brouillon et sans historique (spins/participations restent attachés à la
 * campagne d'origine).
 *
 * ── Ce que la copie NE reprend PAS, et pourquoi ──
 *
 *  • les QR codes : ils désignent des supports physiques déjà en circulation ;
 *  • la période de dates (`starts_at` / `ends_at`) : celles d'une opération
 *    passée n'ont aucun sens pour la suivante, elles sont à reconfigurer ;
 *  • la programmation automatique (`auto_schedule`), volontairement à `false` :
 *    `auto_schedule = true` avec un `starts_at` déjà passé ferait basculer le
 *    brouillon en « active » sans repasser par la garde d'abonnement — c'est
 *    la raison pour laquelle `blueprintToDraft` la force elle aussi.
 *
 * ── Ce qu'elle reprend, et pourquoi c'est un correctif ──
 *
 * `budget_cents` était omis alors que la colonne est nullable : la copie
 * naissait SANS plafond, `claim_winning_spin` imputait la dépense sur un
 * plafond inexistant, et la pause automatique « budget atteint » — que le
 * commerçant croit héritée avec le reste des réglages — ne se serait jamais
 * déclenchée. Le chemin frère (« Enregistrer comme modèle » / « Appliquer »)
 * le transporte de bout en bout depuis toujours.
 *
 * `budget_spent_cents` et `paused_reason` restent, eux, à zéro : ce sont des
 * compteurs de l'opération d'origine, pas des réglages.
 *
 * Tout ou rien : une copie partielle n'est jamais livrée en silence (voir
 * `abandonPartialCopy` plus bas).
 */
export async function duplicateCampaign(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = duplicateCampaignSchema.safeParse({ id: formData.get("id") });
  if (!parsed.success) {
    return { ok: false, error: "Données invalides" };
  }

  const { user, organization } = await getUserAndOrg();
  if (!user || !organization) redirect("/login");

  const supabase = await createClient();

  const { data: source } = await supabase
    .from("campaigns")
    .select("*, wheels!wheels_campaign_id_fkey(*, prizes!prizes_wheel_id_fkey(*))")
    .eq("id", parsed.data.id)
    .eq("organization_id", organization.id)
    .maybeSingle();

  if (!source) return { ok: false, error: "Campagne introuvable" };

  const { wheels, ...sourceCampaign } = source as unknown as {
    name: string;
    engagement: EngagementConfig;
    collect_email: boolean;
    collect_phone: boolean;
    code_ttl_seconds: number | null;
    /** Plafond de dépense — nullable, et c'est ce qui rendait l'oubli muet. */
    budget_cents: number | null;
    wheels: (Wheel & { prizes: Prize[] })[];
  };

  // Nommé une seule fois : ce libellé sert aussi à DÉSIGNER la copie au
  // commerçant si le nettoyage échoue et qu'elle survit (voir plus bas).
  const copyName = `${sourceCampaign.name} (copie)`;

  const { data: newCampaign, error } = await supabase
    .from("campaigns")
    .insert({
      organization_id: organization.id,
      name: copyName,
      engagement: sourceCampaign.engagement,
      collect_email: sourceCampaign.collect_email,
      collect_phone: sourceCampaign.collect_phone,
      code_ttl_seconds: sourceCampaign.code_ttl_seconds,
      // Le plafond est un GARDE-FOU, pas un compteur : sans lui la copie
      // dépense sans limite là où la source s'arrêtait. `budget_spent_cents`
      // et `paused_reason`, eux, ne sont volontairement pas repris.
      budget_cents: sourceCampaign.budget_cents,
      status: "draft",
    })
    .select("id")
    .single();

  if (error || !newCampaign) {
    reportError("campaigns.duplicate", error?.message ?? "raison inconnue");
    return { ok: false, error: "Impossible de dupliquer la campagne" };
  }

  const newCampaignId = newCampaign.id;

  // Contrairement à `createCampaign` juste au-dessus, la duplication ne peut
  // pas tenir en UNE requête : elle recopie N roues et leurs lots, dont le
  // contenu vient de la base. PostgREST ouvre une transaction par requête, donc
  // ces écritures sont forcément séparées. Auparavant l'échec de l'une d'elles
  // était SEULEMENT journalisé — un `continue` sur la roue, un `reportError`
  // muet sur les lots — puis la fonction redirigeait quand même vers la copie :
  // le commerçant lisait « duplication réussie » sur une campagne SANS ROUE,
  // donc injouable, et ne le découvrait qu'au premier QR code scanné, devant un
  // client. À défaut d'atomicité vraie, on la simule : la première écriture
  // ratée annule la copie entière (supprimer la campagne emporte roues et lots
  // en cascade) et l'échec est dit. Un « rien n'a été créé, réessayez » vaut
  // mieux qu'un succès affiché sur une copie trouée.
  const abandonPartialCopy = async (
    step: string,
    reason: string,
  ): Promise<ActionResult> => {
    reportError(`campaigns.duplicate-${step}`, reason);

    // Pas de purge ISR ici, à la différence de `deleteCampaign` : la copie est
    // un brouillon sans QR code, aucune page /play ne la sert encore.
    const { error: rollbackError } = await supabase
      .from("campaigns")
      .delete()
      .eq("id", newCampaignId)
      .eq("organization_id", organization.id);

    if (rollbackError) {
      // Seul cas où la promesse du tout-ou-rien ne peut pas être tenue : la
      // copie incomplète SURVIT. On le dit franchement plutôt que de laisser le
      // commerçant la découvrir plus tard, et on la nomme — sans son nom il ne
      // saurait pas laquelle des deux campagnes homonymes supprimer.
      reportError("campaigns.duplicate-rollback", rollbackError.message);
      return {
        ok: false,
        error: `Duplication interrompue : la copie « ${copyName} » est incomplète et n'est pas jouable en l'état. Supprimez-la depuis la liste des campagnes, puis réessayez.`,
      };
    }

    return {
      ok: false,
      error:
        "Impossible de dupliquer la campagne. Rien n'a été créé, vous pouvez réessayer.",
    };
  };

  for (const w of wheels ?? []) {
    const { data: newWheel, error: wheelError } = await supabase
      .from("wheels")
      .insert({
        organization_id: organization.id,
        campaign_id: newCampaignId,
        name: w.name,
        theme: w.theme,
        play_limit: w.play_limit,
        style: w.style,
        position: w.position,
        schedule_start_hour: w.schedule_start_hour,
        schedule_end_hour: w.schedule_end_hour,
        schedule_days: w.schedule_days,
        game_type: w.game_type,
        // `skill_config` porte le secret du jeu (le mot de « Mot mystère », la
        // règle du défi). Recopier `game_type` SANS lui produisait une roue qui
        // s'annonce skill-gated et que le joueur ne peut pas jouer : le parcours
        // répond « Ce défi n'est pas disponible », et le commerçant n'a aucun
        // indice — son dashboard affiche pourtant bien le type de jeu.
        // `validations/campaign-templates.ts` refuse explicitement cet état sur
        // le chemin frère ; la duplication le fabriquait sans garde.
        skill_config: w.skill_config,
      })
      .select("id")
      .single();

    if (wheelError || !newWheel) {
      // Une campagne sans roue n'est pas une copie dégradée, c'est une copie
      // morte : le joueur qui scanne son QR code n'a rien à jouer.
      return abandonPartialCopy(
        "wheel",
        wheelError?.message ?? "raison inconnue",
      );
    }

    const prizesPayload = (w.prizes ?? []).map((p) => ({
      organization_id: organization.id,
      wheel_id: newWheel.id,
      label: p.label,
      description: p.description,
      color: p.color,
      weight: p.weight,
      is_losing: p.is_losing,
      stock: p.stock,
      position: p.position,
      is_active: p.is_active,
      // Économie du lot : sans ces trois colonnes, la copie perd la marge et
      // le seuil d'alerte de stock. Le commerçant croit dupliquer sa campagne
      // à l'identique et retrouve des lots dont le coût est nul.
      cost_cents: p.cost_cents,
      value_cents: p.value_cents,
      low_stock_threshold: p.low_stock_threshold,
    }));
    if (prizesPayload.length > 0) {
      const { error: prizesError } = await supabase
        .from("prizes")
        .insert(prizesPayload);
      if (prizesError) {
        // Même gravité que la roue manquante, et plus sournois : la roue
        // existe, le dashboard l'affiche, mais elle tourne à vide. Le
        // commerçant croit relancer son jeu saisonnier à l'identique.
        return abandonPartialCopy("prizes", prizesError.message);
      }
    }
  }

  // Atteint uniquement si TOUTES les roues et TOUS les lots ont été recopiés :
  // la redirection ne promet plus que ce qui existe vraiment.
  revalidatePath("/dashboard/campaigns");
  redirect(`/dashboard/campaigns/${newCampaignId}`);
}

export async function deleteCampaign(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = deleteCampaignSchema.safeParse({ id: formData.get("id") });
  if (!parsed.success) {
    return { ok: false, error: "Données invalides" };
  }

  const { user, organization } = await getUserAndOrg();
  if (!user || !organization) redirect("/login");

  const supabase = await createClient();

  // ── GARDE : des lots gagnés attendent-ils encore d'être retirés ? ──
  //
  // `participations.campaign_id` porte `on delete cascade` (00001:99). La
  // suppression emportait donc, EN SILENCE, tous les codes déjà gagnés et non
  // encore présentés. Le client arrivait au comptoir avec son email, et la
  // caisse lui répondait « code introuvable » — un engagement du commerçant
  // annulé sans que personne, lui compris, ne l'ait décidé.
  //
  // On ne touche PAS à la cascade : la retirer transformerait la suppression
  // en erreur 23503 opaque. On demande une confirmation éclairée, qui NOMME le
  // nombre de lots en jeu — un chiffre, pas un avertissement de principe.
  const { count: enAttente } = await supabase
    .from("participations")
    .select("id", { count: "exact", head: true })
    .eq("campaign_id", parsed.data.id)
    .not("redeem_code", "is", null)
    .is("redeemed_at", null)
    .is("cancelled_at", null);

  if ((enAttente ?? 0) > 0 && formData.get("confirm_outstanding") !== "1") {
    return {
      ok: false,
      error:
        `${enAttente} lot(s) gagné(s) attendent encore d'être retirés en ` +
        "caisse. Les supprimer rendra leurs codes introuvables : vos clients " +
        `se verront refuser un gain qu'ils ont vraiment obtenu. ${CAMPAIGN_OUTSTANDING_LOSS_HINT} ` +
        "pour supprimer quand même.",
    };
  }

  // Purge ISR avant la suppression : les qr_codes partent en cascade
  // avec la campagne, leurs slugs seraient introuvables après coup.
  await revalidatePlaySlugs(supabase, { campaignId: parsed.data.id });

  const { error } = await supabase
    .from("campaigns")
    .delete()
    .eq("id", parsed.data.id)
    .eq("organization_id", organization.id);

  if (error) {
    reportError("campaigns.delete", error.message);
    return { ok: false, error: "Suppression impossible" };
  }

  revalidatePath("/dashboard/campaigns");
  redirect("/dashboard/campaigns");
}
