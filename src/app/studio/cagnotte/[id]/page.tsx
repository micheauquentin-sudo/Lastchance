import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { getUserAndOrg } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { capacitesDuModule } from "@/lib/module-capabilities-server";
import { CagnotteStudio } from "@/components/jackpot/cagnotte-studio";
import type { JackpotCampaign } from "@/types/database";

export const metadata: Metadata = { title: "Mon studio — cagnotte" };

/**
 * LE STUDIO DE LA CAGNOTTE (VIT-44) — plein écran, HORS du tableau de bord.
 *
 * ── POURQUOI CETTE ROUTE N'EST PAS SOUS `/dashboard` ──
 *
 * Ce n'est pas un choix d'URL, c'est ce qui fait DISPARAÎTRE la colonne de
 * navigation : `/dashboard/layout.tsx` la pose sur tout ce qu'il contient, et
 * un studio qui garde le menu à gauche n'a plus la largeur de son aperçu. C'est
 * le motif de `/vitrine-studio`, de `/poster/[id]`, de `/studio/calendrier`, de
 * `/studio/quiz` et de `/studio/fidelite`, y compris dans ses gardes : session,
 * organisation, puis le droit du module.
 *
 * ── LA REVALIDATION EST UN DÉFAUT DÉJÀ PAYÉ QUATRE FOIS ──
 *
 * Vivant hors de `/dashboard`, cette page n'est atteinte par AUCUN des
 * `revalidatePath("/dashboard/jackpot/…")` de `src/actions/jackpot.ts` — Next
 * revalide un CHEMIN, pas une ressource. C'est le défaut VIT-37, puis VIT-39,
 * puis VIT-41, puis VIT-42, mot pour mot : un enregistrement qui réussit sans
 * jamais apparaître. Chacune des revalidations détaillées de la cagnotte a donc
 * désormais son jumeau `/studio/cagnotte/${id}`, et
 * `revalidation-studio.test.ts` échoue s'il en manque un.
 *
 * ── LES COLONNES SONT ÉNUMÉRÉES, ET `select("*")` SERAIT UN BOGUE ICI ──
 *
 * `jackpot_campaigns.rotating_secret` est le secret du code tournant, exclu du
 * grant de colonne. La liste est donc celle, mot pour mot, de la page du
 * tableau de bord.
 */
const CAMPAIGN_COLUMNS =
  "id, organization_id, name, status, public_slug, validation_mode, rotating_period_seconds, min_participation_interval_seconds, draw_mode, threshold, win_probability, draw_at, reward_label, reward_details, reward_stock, reward_claimed_count, display_base_cents, display_increment_cents, merchant_content, current_count, cycle, created_at, code_ttl_days";

export default async function StudioCagnottePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { user, organization, role } = await getUserAndOrg();
  if (!user) redirect("/login");
  if (!organization) redirect("/onboarding");

  // REFUS AVANT LECTURE, comme sur la page du tableau de bord : un caissier
  // déclencherait sinon une requête dont le résultat part aussitôt au
  // `notFound()`. Seulement `canExplore` — découvrir reste ouvert, c'est la
  // PUBLICATION qui est payante, et elle est fermée en base.
  const capacites = await capacitesDuModule("jackpot");
  if (!capacites.canExplore) notFound();

  const supabase = await createClient();
  const { data: campaignRow } = await supabase
    .from("jackpot_campaigns")
    .select(CAMPAIGN_COLUMNS)
    .eq("id", id)
    .eq("organization_id", organization.id)
    .maybeSingle();

  if (!campaignRow) notFound();
  // PostgREST ne relie pas une chaîne de `select()` à une interface : les pages
  // de module portent le même cast depuis toujours. Ce qui protège ici est la
  // garde de CHARGEMENT — la colonne est-elle DEMANDÉE ? —, pas ce cast, qui ne
  // fait que nommer une forme invisible au compilateur.
  // unsafe-cast-justification: écart PostgREST/interface, garde de chargement ailleurs
  const campaign = campaignRow as unknown as JackpotCampaign;

  // Le MÊME calcul que la page du tableau de bord, et il DOIT le rester : deux
  // vérités sur « qu'est-ce qui manque ? » sont exactement ce que
  // `src/lib/activation/jackpot.ts` a été écrit pour éviter.
  const entreeVerification = {
    draw_mode: campaign.draw_mode,
    threshold: campaign.threshold,
    draw_at: campaign.draw_at,
    reward_stock: campaign.reward_stock,
    reward_label: campaign.reward_label,
    status: campaign.status,
    validation_mode: campaign.validation_mode,
    public_slug: campaign.public_slug,
    code_ttl_days: campaign.code_ttl_days,
  };

  return (
    <CagnotteStudio
      campaign={campaign}
      entreeVerification={entreeVerification}
      organizationName={organization.name}
      logoUrl={organization.logo_url}
      timeZone={organization.timezone}
      // `updateJackpotCampaign` exige `owner|editor`, ET RIEN DE PLUS.
      //
      // Le studio du calendrier et celui du quiz ajoutent `capacites.canEditDraft`
      // parce que LEURS actions le vérifient. Celle de la cagnotte ne le fait
      // pas : l'ajouter ici gèlerait des réglages que l'atelier laisse modifier —
      // un écran qui refuse ce que l'autre accepte, sur la même campagne.
      peutEditer={role === "owner" || role === "editor"}
    />
  );
}
