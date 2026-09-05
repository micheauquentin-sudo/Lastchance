import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { getUserAndOrg } from "@/lib/auth";
import { APP_URL } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";
import { HUNT_STEP_SESSION_COLUMNS } from "@/lib/hunts";
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
 * ── `select("*")` SUR LA CHASSE, MAIS PLUS SUR SES ÉTAPES ──
 *
 * La chasse se charge encore par `*`, comme sur la page du tableau de bord :
 * énumérer ses colonnes ici créerait une seconde liste à tenir d'accord avec
 * la sienne.
 *
 * Ses ÉTAPES, non. Depuis la migration 20261204120000, `hunt_steps.token` est
 * fermée à `authenticated` — le jeton EST le QR, et la caisse n'a aucune raison
 * de l'avoir — et un `select("*")` PostgREST échoue alors EN ENTIER. La liste
 * de colonnes qu'on aurait dû dupliquer vit donc à un seul endroit,
 * `HUNT_STEP_SESSION_COLUMNS`, et le jeton revient par la RPC
 * `hunt_step_tokens`, gardée par `is_org_editor`.
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

  const [{ data: huntRow }, { data: stepRows }, { data: tokenRows }] =
    await Promise.all([
      supabase
        .from("hunts")
        .select("*")
        .eq("id", id)
        .eq("organization_id", organization.id)
        .maybeSingle(),
      supabase
        .from("hunt_steps")
        .select(HUNT_STEP_SESSION_COLUMNS)
        .eq("hunt_id", id)
        .eq("organization_id", organization.id)
        .order("position", { ascending: true }),
      supabase.rpc("hunt_step_tokens", {
        p_organization_id: organization.id,
        p_hunt_id: id,
      }),
    ]);

  if (!huntRow) notFound();
  // PostgREST ne relie pas une chaîne de `select()` à une interface : les sept
  // pages de module portent le même cast depuis toujours. Ce cast ne fait que
  // nommer une forme invisible au compilateur ; il ne protège rien par lui-même.
  // unsafe-cast-justification: écart PostgREST/interface, colonnes chargées par `*`
  const hunt = huntRow as unknown as Hunt;
  // Le jeton est RECOLLÉ ici, il ne vient plus de la ligne. Cette page est
  // refusée à la caisse AVANT toute lecture (`canExplore` est faux pour
  // `cashier`), donc l'owner/editor qui arrive jusqu'ici obtient toujours ses
  // jetons ; la chaîne vide n'est atteignable que si la RPC a refusé, et
  // `posterSteps` écarte alors l'étape plutôt que d'imprimer un `/hunt/` nu.
  const jetonParEtape = new Map<string, string>(
    (tokenRows ?? []).map((ligne) => [ligne.step_id, ligne.token]),
  );
  const steps = (stepRows ?? []).map((ligne) => ({
    ...ligne,
    token: jetonParEtape.get(ligne.id) ?? "",
  })) as HuntStep[];

  // Compteur d'ouvertures PAR ÉTAPE, comme sur la page du tableau de bord : le
  // grain de `module_page_opens.resource_id` est ce que le QR désigne — ici
  // l'étape. Une ressource sans ligne rend 0, pour que l'affiche dise
  // « 0 ouverture » plutôt qu'un blanc.
  const openCounts = await readModulePageOpenCounts(
    supabase,
    "hunts",
    steps.map((step) => step.id),
  );

  const posterSteps = steps
    // Une affiche sans jeton n'est pas une affiche : elle imprimerait un QR
    // vers `/hunt/`. Mieux vaut ne rien proposer.
    .filter((step) => step.token !== "")
    .map((step) => ({
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
