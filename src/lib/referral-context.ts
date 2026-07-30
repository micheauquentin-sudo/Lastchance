import "server-only";

import { peekAnonymousPlayerKey } from "@/lib/anonymous-player";
import { reportError } from "@/lib/monitoring";
import { mapReferralPublicState, type ReferralPublicState } from "@/lib/referral";
import { createAdminClient } from "@/lib/supabase/admin";
import { hasActiveAccess } from "@/lib/subscription";
import type { Organization } from "@/types/database";

/**
 * Colonnes d'organisation lues sur un chemin ANONYME servi par la service role :
 * exactement les entrées du garde (`hasReferralAccess`) plus `id`, qui sert au
 * contrôle de cohérence de tenant. Rien d'autre — ce contexte ne rend plus
 * d'en-tête de commerce à afficher (nom, logo, fuseau), et une colonne lue sans
 * être évaluée est une colonne qu'on finit par publier.
 */
type ReferralGateOrganization = Pick<
  Organization,
  | "id"
  | "subscription_status"
  | "trial_ends_at"
  | "past_due_since"
  | "addon_referral"
  | "comp_access"
  | "comp_access_until"
>;

const ORG_COLUMNS =
  "id, subscription_status, trial_ends_at, past_due_since, addon_referral, comp_access, comp_access_until";

/**
 * Le module Parrainage est-il utilisable par cette organisation ? Addon activé
 * (option payante ou incluse, géré au back-office) + accès actif — un essai
 * expiré coupe aussi le parrainage. Miroir de hasCalendarAccess / hasLoyaltyAccess ;
 * défini LOCALEMENT (le fichier subscription.ts relève de l'agent stripe-billing).
 * Les RPC service_role gardent addon + enabled + campagne active mais NON l'accès
 * d'abonnement : c'est précisément ce que ce contexte referme avant tout appel.
 */
export function hasReferralAccess(
  org: Pick<
    Organization,
    | "addon_referral"
    | "subscription_status"
    | "trial_ends_at"
    | "past_due_since"
    | "comp_access"
    | "comp_access_until"
  >,
  now = new Date(),
): boolean {
  return org.addon_referral && hasActiveAccess(org, now);
}

interface ProgramRow {
  campaign_id: string;
  organization_id: string;
  enabled: boolean;
  organizations: ReferralGateOrganization | null;
}

interface CampaignRow {
  id: string;
  organization_id: string;
  status: string;
  starts_at: string | null;
  ends_at: string | null;
  wheels: { id: string }[] | null;
}

interface ReferralGate {
  organizationId: string;
  /** Roue de la campagne (best-effort) ; la RPC reste l'autorité au tirage. */
  wheelId: string | undefined;
}

/**
 * Résout et VÉRIFIE la disponibilité du parrainage d'une campagne : programme
 * opt-in existant, cohérence inter-tenant (service role contourne la RLS : chaque
 * relation doit pointer le même tenant), accès d'abonnement (hasReferralAccess),
 * programme activé, campagne active et dans sa fenêtre. Deux lectures indexées —
 * pas d'amplification sur un chemin ouvert à Internet. null si l'un des gardes
 * échoue (réponse générique en amont, aucun oracle).
 */
async function gateReferralCampaign(
  admin: ReturnType<typeof createAdminClient>,
  campaignId: string,
): Promise<ReferralGate | null> {
  const { data: progData } = await admin
    .from("referral_programs")
    .select(`campaign_id, organization_id, enabled, organizations(${ORG_COLUMNS})`)
    .eq("campaign_id", campaignId)
    .maybeSingle();
  if (!progData) return null;

  const prog = progData as unknown as ProgramRow;
  const org = prog.organizations;
  if (!org || org.id !== prog.organization_id) {
    // La service role contourne la RLS : une telle divergence ne devrait pas
    // exister. Elle part à Sentry, pas seulement dans un journal serveur que
    // personne ne lit — c'est le seul signal qu'une donnée croise deux tenants.
    reportError(
      "referral.context",
      `organisation incohérente (campagne ${campaignId})`,
    );
    return null;
  }
  if (!hasReferralAccess(org)) return null;
  if (!prog.enabled) return null;

  const { data: campData } = await admin
    .from("campaigns")
    .select(
      "id, organization_id, status, starts_at, ends_at, wheels!wheels_campaign_id_fkey(id)",
    )
    .eq("id", campaignId)
    .eq("organization_id", prog.organization_id)
    .maybeSingle();
  if (!campData) return null;

  const camp = campData as unknown as CampaignRow;
  if (camp.organization_id !== prog.organization_id) return null;
  if (camp.status !== "active") return null;
  const now = Date.now();
  if (camp.starts_at && new Date(camp.starts_at).getTime() > now) return null;
  if (camp.ends_at && new Date(camp.ends_at).getTime() < now) return null;

  return {
    organizationId: prog.organization_id,
    wheelId: camp.wheels?.[0]?.id,
  };
}

/**
 * Résout la campagne d'un slug public (segment /play/[slug]) via qr_codes, comme
 * loadPlayContext. Plusieurs QR peuvent pointer la même campagne : le parrainage
 * est PAR CAMPAGNE. Slug inconnu → null (réponse générique en amont, pas d'oracle).
 */
async function resolveReferralCampaignId(
  admin: ReturnType<typeof createAdminClient>,
  slug: string,
): Promise<string | null> {
  const { data } = await admin
    .from("qr_codes")
    .select("campaign_id")
    .eq("slug", slug)
    .maybeSingle();
  return (data?.campaign_id as string | undefined) ?? null;
}

export type ReferralActionContext =
  | { ok: false }
  | {
      ok: true;
      admin: ReturnType<typeof createAdminClient>;
      campaignId: string;
      organizationId: string;
      /** Roue de la campagne (best-effort) — la RPC reste l'autorité au tirage. */
      wheelId?: string;
    };

/**
 * Contexte MINIMAL d'une action publique de parrainage (ensure / validate /
 * consume / getState), résolu par l'UUID de campagne : campagne + organisation +
 * programme vérifiés côté service role (addon + abonnement + enabled + campagne
 * active), rien de plus. Miroir de loadCalendarActionContext / loadLoyaltyActionContext.
 * Module coupé, programme absent/désactivé, campagne inactive → échec générique
 * sans oracle.
 */
export async function loadReferralActionContext(
  campaignId: string,
): Promise<ReferralActionContext> {
  const admin = createAdminClient();
  const gate = await gateReferralCampaign(admin, campaignId);
  if (!gate) return { ok: false };
  return {
    ok: true,
    admin,
    campaignId,
    organizationId: gate.organizationId,
    wheelId: gate.wheelId,
  };
}

export type ReferralPublicContext =
  | { ok: false }
  | {
      ok: true;
      campaignId: string;
      /** État public du parrain courant (jauge/coffre/SES codes) — déjà filtré. */
      publicState: ReferralPublicState;
    };

/**
 * CHEMIN DE LECTURE UNIQUE du parrainage côté joueur : résout le slug → campagne
 * (qr_codes), vérifie addon + abonnement + enabled + campagne active, puis charge
 * l'état suivable du parrain courant via referral_public_state. Identité device en
 * LECTURE SEULE (peekAnonymousPlayerKey ne pose JAMAIS le cookie ; il est écrit
 * par un spin ou par ensureReferralSponsor) : son empreinte alimente la vue
 * « moi » (jauge, code, versements) sans jamais quitter le serveur.
 *
 * POURQUOI ICI ET NULLE PART AILLEURS : cette chaîne a vécu en DEUX exemplaires
 * — celui-ci, sans appelant, et une recopie à la main dans `getReferralState`.
 * Deux copies d'une même règle divergent, et c'est la morte qu'on relit en
 * croyant relire la vivante ; ce projet a déjà livré des défauts par là. Le seul
 * appelant est désormais `getReferralState` (src/actions/referral.ts), qui garde
 * ce qui relève de sa couche : validation d'entrée et compteur de pression.
 *
 * Refus SANS MOTIF (`{ ok: false }`) : les gardes sont indistinguables entre
 * elles — « module coupé », « essai expiré » et « programme désactivé » se
 * liraient sinon depuis la rue, et diraient à un concurrent où en est le
 * commerce. L'appelant les écrase toutes en un état neutre.
 */
export async function loadReferralPublicContext(
  slug: string,
): Promise<ReferralPublicContext> {
  const admin = createAdminClient();

  const campaignId = await resolveReferralCampaignId(admin, slug);
  if (!campaignId) return { ok: false };

  // Seul le VERDICT du garde compte ici : l'organisation et la roue qu'il
  // résout n'intéressent que les actions d'écriture.
  const gate = await gateReferralCampaign(admin, campaignId);
  if (!gate) return { ok: false };

  // Identité device en lecture seule. `p_sponsor_key` est un paramètre REQUIS
  // sans défaut SQL : un visiteur sans cookie passe une chaîne vide (rejetée par
  // le regex 64-hex de la RPC → parrain inconnu, jauge 0), jamais `undefined`
  // (qui serait dropé du corps JSON et ferait échouer l'appel).
  const deviceKey = await peekAnonymousPlayerKey();

  const { data: stateRaw, error } = await admin.rpc("referral_public_state", {
    p_campaign_id: campaignId,
    p_sponsor_key: deviceKey ?? "",
  });
  if (error) {
    // Fail-closed ET visible : un parrain qui ne voit plus sa jauge croit ses
    // filleuls perdus et repart partager un code. L'incident doit remonter.
    reportError("referral.state", error.message);
    return { ok: false };
  }

  const publicState = mapReferralPublicState(stateRaw);
  if (publicState.state !== "ok") return { ok: false };

  return { ok: true, campaignId, publicState };
}

export { resolveReferralCampaignId };
