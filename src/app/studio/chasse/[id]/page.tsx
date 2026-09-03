import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { getUserAndOrg } from "@/lib/auth";
import { APP_URL } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";
import { capacitesDuModule } from "@/lib/module-capabilities-server";
import { readModulePageOpenCounts } from "@/lib/module-page-opens";
import { ChasseStudio } from "@/components/hunts/chasse-studio";
import type { Hunt, HuntStep } from "@/types/database";

export const metadata: Metadata = { title: "Mon studio — Chasse au QR" };

/**
 * LE STUDIO DE LA CHASSE (VIT-40) — plein écran, HORS du tableau de bord.
 *
 * ── POURQUOI CETTE ROUTE N'EST PAS SOUS `/dashboard` ──
 *
 * Ce n'est pas un choix d'URL, c'est ce qui fait DISPARAÎTRE la colonne de
 * navigation : `/dashboard/layout.tsx` la pose sur tout ce qu'il contient, et
 * un studio qui garde le menu à gauche n'a plus la largeur de son aperçu.
 * C'est le motif de `/studio/calendrier/[id]`, de `/vitrine-studio` et de
 * `/poster/[id]`, y compris dans ses gardes : session, organisation, puis le
 * droit du module.
 *
 * Et c'est ce que la demande exige : le commerçant doit voir le MÊME écran
 * quel que soit le module qu'il règle. Un studio encadré ici et plein écran
 * là-bas serait deux produits.
 *
 * ── LA REVALIDATION EST UN DÉFAUT DÉJÀ PAYÉ DEUX FOIS ──
 *
 * Vivant hors de `/dashboard`, cette page n'est atteinte par AUCUN des
 * `revalidatePath("/dashboard/hunts/…")` de `src/actions/hunts.ts` : Next
 * revalide un CHEMIN, pas une ressource. C'est exactement le défaut VIT-37 —
 * un lien Instagram enregistré n'apparaissait jamais dans `/vitrine-studio` —
 * repayé en VIT-39. Chaque revalidation détaillée de la chasse a donc désormais
 * son jumeau `/studio/chasse/${id}`, et
 * `src/components/hunts/studio/revalidation-studio.test.ts` échoue s'il en
 * manque un.
 *
 * ── `select("*")`, ET C'EST DÉLIBÉRÉ ──
 *
 * La page du tableau de bord fait de même. Énumérer les colonnes ici aurait
 * créé une seconde liste à tenir d'accord avec la sienne ; `*` charge tout, ne
 * peut rien oublier, et coûte une ligne.
 */
export default async function StudioChassePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { user, organization, role } = await getUserAndOrg();
  if (!user) redirect("/login");
  if (!organization) redirect("/onboarding");

  // REFUS AVANT LECTURE, comme sur la page du tableau de bord : un caissier
  // déclencherait sinon plusieurs requêtes dont le résultat part aussitôt au
  // `notFound()`.
  const capacites = await capacitesDuModule("hunts");
  if (!capacites.canExplore) notFound();

  const supabase = await createClient();

  const [{ data: huntRow }, { data: stepRows }] = await Promise.all([
    supabase
      .from("hunts")
      .select("*")
      .eq("id", id)
      .eq("organization_id", organization.id)
      .maybeSingle(),
    supabase
      .from("hunt_steps")
      .select("*")
      .eq("hunt_id", id)
      .eq("organization_id", organization.id)
      .order("position", { ascending: true }),
  ]);

  if (!huntRow) notFound();
  // PostgREST ne relie pas une chaîne de `select()` à une interface : les sept
  // pages de module portent le même cast depuis toujours. Ce cast ne fait que
  // nommer une forme invisible au compilateur ; il ne protège rien par lui-même.
  // unsafe-cast-justification: écart PostgREST/interface, colonnes chargées par `*`
  const hunt = huntRow as unknown as Hunt;
  const steps = (stepRows ?? []) as HuntStep[];

  // Compteur d'ouvertures PAR ÉTAPE, comme sur la page du tableau de bord : le
  // grain de `module_page_opens.resource_id` est ce que le QR désigne — ici
  // l'étape. Une ressource sans ligne rend 0, pour que l'affiche dise
  // « 0 ouverture » plutôt qu'un blanc.
  const openCounts = await readModulePageOpenCounts(
    supabase,
    "hunts",
    steps.map((step) => step.id),
  );

  const posterSteps = steps.map((step) => ({
    id: step.id,
    position: step.position,
    label: step.label,
    token: step.token,
    url: `${APP_URL}/hunt/${step.token}`,
    opens: openCounts[step.id] ?? 0,
  }));

  const entreeVerification = {
    huntId: hunt.id,
    rewardLabel: hunt.reward_label,
    rewardStock: hunt.reward_stock,
    rewardClaimedCount: hunt.reward_claimed_count,
    stepCount: steps.length,
    endsAt: hunt.ends_at,
  };

  return (
    <ChasseStudio
      hunt={hunt}
      steps={steps}
      posterSteps={posterSteps}
      entreeVerification={entreeVerification}
      timeZone={organization.timezone}
      organizationName={organization.name}
      organizationId={organization.id}
      logoUrl={organization.logo_url}
      // Le QR de la PREMIÈRE étape : c'est ce que le joueur scanne en premier,
      // et c'est déjà ce que la page du tableau de bord passe à ce composant.
      publicUrl={posterSteps[0]?.url ?? null}
      // `updateHunt` exige `owner|editor` ET le droit d'éditer un brouillon :
      // mieux vaut ne rien proposer que laisser l'action refuser après coup.
      peutEditer={
        (role === "owner" || role === "editor") && capacites.canEditDraft
      }
    />
  );
}
