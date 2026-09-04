import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { getUserAndOrg } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { capacitesDuModule } from "@/lib/module-capabilities-server";
import { hasReferralAccess } from "@/lib/referral-context";
import { RoueStudio, type RoueDuStudio } from "@/components/wheel/roue-studio";
import type { ReferralProgramRow } from "@/components/dashboard/referral-program-settings";
import type { Campaign, Prize, Wheel } from "@/types/database";

export const metadata: Metadata = { title: "Mon studio — jeu instantané" };

/**
 * LE STUDIO DE LA ROUE (VIT-46) — plein écran, HORS du tableau de bord.
 *
 * ── POURQUOI CETTE ROUTE N'EST PAS SOUS `/dashboard` ──
 *
 * Ce n'est pas un choix d'URL, c'est ce qui fait DISPARAÎTRE la colonne de
 * navigation : `/dashboard/layout.tsx` la pose sur tout ce qu'il contient, et
 * un studio qui garde le menu à gauche n'a plus la largeur de son aperçu.
 * C'est le motif de `/studio/calendrier`, `/studio/fidelite`, `/vitrine-studio`
 * et `/poster/[id]`, y compris dans ses gardes : session, organisation, puis le
 * droit du module.
 *
 * ── `[id]` EST LA CAMPAGNE, PAS LA ROUE ──
 *
 * Une campagne porte jusqu'à HUIT roues, et le studio les règle toutes : le
 * sélecteur vit dans les `outils` de la coquille, transverse aux neuf étapes.
 * Prendre la roue comme identifiant aurait fait une URL par roue pour un seul
 * écran, et surtout aurait rendu la revalidation impossible à jumeler — les
 * `revalidatePath` du module portent tous un identifiant de CAMPAGNE.
 *
 * ── LA REVALIDATION EST UN DÉFAUT DÉJÀ PAYÉ QUATRE FOIS ──
 *
 * Vivant hors de `/dashboard`, cette page n'est atteinte par AUCUN des
 * `revalidatePath("/dashboard/campaigns/…")` de `src/actions/prizes.ts`,
 * `campaigns.ts` et `referral.ts` : Next revalide un CHEMIN, pas une
 * ressource. C'est le défaut VIT-37, puis VIT-39, VIT-41 et VIT-42, mot pour
 * mot — un enregistrement qui réussit sans jamais apparaître, sur l'écran même
 * où l'on enregistre en regardant. Chaque revalidation d'atelier de ces trois
 * fichiers a donc son jumeau `/studio/roue/${campaignId}`, et
 * `src/components/wheel/studio/revalidation-studio.test.ts` échoue s'il en
 * manque un — par FONCTION, pas par fichier.
 *
 * ── `select("*")`, ET C'EST DÉLIBÉRÉ ──
 *
 * Les deux pages du tableau de bord font de même sur `campaigns` et `wheels` :
 * aucune de leurs colonnes n'est interdite à une session marchande, et
 * `CampaignClaimSettings` prend la campagne COMPLÈTE. Énumérer ici aurait créé
 * une seconde liste à tenir d'accord avec la leur.
 */
export default async function StudioRouePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { user, organization, role } = await getUserAndOrg();
  if (!user) redirect("/login");
  if (!organization) redirect("/onboarding");

  // REFUS AVANT LECTURE, comme sur la page du tableau de bord : un caissier
  // déclencherait sinon six requêtes dont le résultat part aussitôt au
  // `notFound()`.
  const capacites = await capacitesDuModule("wheel");
  if (!capacites.canExplore) notFound();

  const supabase = await createClient();

  // MÊMES REQUÊTES QUE L'ATELIER, au champ près : les deux écrans règlent la
  // même chose et doivent lire la même chose.
  const [
    { data: campaignData },
    { data: wheelsData },
    { count: qrCount },
    { data: referralProgram },
    { data: liensOrg },
  ] = await Promise.all([
    supabase
      .from("campaigns")
      .select("*")
      .eq("id", id)
      .eq("organization_id", organization.id)
      .maybeSingle(),
    supabase
      .from("wheels")
      .select("*, prizes!prizes_wheel_id_fkey(*)")
      .eq("campaign_id", id)
      .eq("organization_id", organization.id)
      .order("position", { ascending: true })
      .order("created_at", { ascending: true }),
    // Lecture RLS simple, comme /dashboard/qr-codes : on ne veut savoir qu'une
    // chose — vos clients ont-ils une porte d'entrée ?
    supabase
      .from("qr_codes")
      .select("id", { count: "exact", head: true })
      .eq("campaign_id", id)
      .eq("organization_id", organization.id),
    supabase
      .from("referral_programs")
      .select(
        "enabled, chest_threshold, sponsor_max_filleuls, window_days, sponsor_reward_kind, sponsor_reward_label, sponsor_reward_details, sponsor_reward_stock, filleul_reward_kind, filleul_reward_label, filleul_reward_details, filleul_reward_stock, chest_reward_kind, chest_reward_label, chest_reward_details, chest_reward_stock, code_ttl_days",
      )
      .eq("campaign_id", id)
      .eq("organization_id", organization.id)
      .maybeSingle(),
    // Sans un seul lien renseigné, cocher « Avant de jouer » n'afficherait rien
    // au joueur : le bloc renvoie alors vers les Réglages. Même prédicat que la
    // page de suivi.
    supabase
      .from("organizations")
      .select("google_review_url, instagram_url, tiktok_url")
      .eq("id", organization.id)
      .maybeSingle(),
  ]);

  const rouesBrutes = (wheelsData ?? []) as (Wheel & { prizes: Prize[] })[];
  if (!campaignData || rouesBrutes.length === 0) notFound();

  const campagne = campaignData as Campaign;

  const roues: RoueDuStudio[] = rouesBrutes.map((brute) => {
    const { prizes, ...roue } = brute;
    return {
      roue,
      // MÊME TRI QUE L'ATELIER : position, puis date de création à égalité.
      // L'éditeur de lots rend ses lignes dans cet ordre, et deux ordres pour
      // une même liste finiraient par se contredire à l'écran.
      lots: (prizes ?? [])
        .slice()
        .sort(
          (a, b) =>
            a.position - b.position || a.created_at.localeCompare(b.created_at),
        ),
    };
  });

  const liens = liensOrg as {
    google_review_url: string | null;
    instagram_url: string | null;
    tiktok_url: string | null;
  } | null;
  const aDesLiens = Boolean(
    liens?.google_review_url || liens?.instagram_url || liens?.tiktok_url,
  );

  return (
    <RoueStudio
      campagne={campagne}
      roues={roues}
      aDesLiens={aDesLiens}
      programmeParrainage={(referralProgram as ReferralProgramRow | null) ?? null}
      parrainageDisponible={hasReferralAccess(organization)}
      qrExistant={(qrCount ?? 0) > 0}
      organizationName={organization.name}
      // `updateWheel`, `updateWheelStyle` et `updateWheelSchedule` passent
      // toutes par `requireOrg()` et la RLS d'écriture — elles n'ajoutent AUCUN
      // contrôle de rôle applicatif. Le studio n'en invente donc pas non plus
      // au-delà de ce que fait déjà l'atelier : `owner|editor`, le même
      // prédicat que celui qui décide de la création d'un QR sur la page de
      // suivi. L'ajouter plus strict gèlerait ici des réglages que l'atelier
      // laisse modifier — un écran qui refuse ce que l'autre accepte.
      peutEditer={role === "owner" || role === "editor"}
    />
  );
}
