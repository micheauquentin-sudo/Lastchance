"use server";

import { redirect } from "next/navigation";
import { getUserAndOrg } from "@/lib/auth";
import { setActiveOrganizationCookie } from "@/lib/active-organization-cookie";
import { requireOrganizationOwner } from "@/lib/authorization";
import { createAdminClient } from "@/lib/supabase/admin";
import { reportError } from "@/lib/monitoring";
import { revalidatePlaySlugs } from "@/lib/revalidate-play";
import { updateOrganizationSocialLinksSchema } from "@/lib/validations/organizations";
import { revalidatePath } from "next/cache";
import type { ActionResult } from "@/lib/utils";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Change le tenant courant après vérification de l'appartenance RLS. */
export async function switchActiveOrganization(formData: FormData): Promise<void> {
  const organizationId = String(formData.get("organizationId") ?? "");
  if (!UUID_RE.test(organizationId)) redirect("/dashboard");

  const { user, memberships } = await getUserAndOrg();
  if (!user) redirect("/login");

  const allowed = memberships.some(
    (membership) => membership.organizationId === organizationId,
  );
  if (!allowed) redirect("/dashboard");

  await setActiveOrganizationCookie(organizationId);
  redirect("/dashboard");
}

export async function updateOrganizationTimezone(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const timezone = String(formData.get("timezone") ?? "");
  try {
    new Intl.DateTimeFormat("fr-FR", { timeZone: timezone }).format();
  } catch {
    return { ok: false, error: "Fuseau horaire invalide." };
  }
  const { organization } = await requireOrganizationOwner();
  const admin = createAdminClient();
  const { data: valid } = await admin.rpc("is_valid_timezone", {
    p_timezone: timezone,
  });
  if (!valid) return { ok: false, error: "Fuseau horaire inconnu." };
  const { error } = await admin
    .from("organizations")
    .update({ timezone })
    .eq("id", organization.id);
  if (error) return { ok: false, error: "Enregistrement impossible." };
  revalidatePath("/dashboard", "layout");
  return { ok: true, data: undefined };
}

/**
 * Les trois liens de l'établissement (avis Google, Instagram, TikTok) proposés
 * au joueur AVANT le jeu quand une campagne active `prejeu_invitation`.
 *
 * SERVICE ROLE APRÈS GARDE OWNER, comme le fuseau ci-dessus et le logo
 * (`actions/branding.ts`) : `authenticated` n'a AUCUN privilège `UPDATE` sur
 * `organizations` — un `.update()` passé par le client de session échouerait.
 * La garde de rôle est donc le SEUL contrôle, et elle est en tête.
 *
 * `''` efface (la colonne n'admet pas de `null` concurrent). La liste blanche
 * d'hôtes vit dans le schéma : voir `lib/validations/organizations.ts`.
 */
export async function updateOrganizationSocialLinks(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = updateOrganizationSocialLinksSchema.safeParse({
    google_review_url: formData.get("google_review_url"),
    instagram_url: formData.get("instagram_url"),
    tiktok_url: formData.get("tiktok_url"),
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0].message };
  }

  const { organization } = await requireOrganizationOwner();
  const admin = createAdminClient();
  const { error } = await admin
    .from("organizations")
    .update(parsed.data)
    .eq("id", organization.id);
  if (error) {
    // Même geste que le jumeau `campaigns.prejeu-invitation` : le commerçant
    // lit « Enregistrement impossible », nous devons savoir POURQUOI — sans
    // cela un refus de contrainte côté base est un échec muet côté ops.
    reportError("organizations.social-links", error.message);
    return { ok: false, error: "Enregistrement impossible." };
  }

  revalidatePath("/dashboard", "layout");
  revalidatePath("/dashboard/settings");
  /**
   * LE STUDIO VIT HORS DE `/dashboard`, ET C'EST POURQUOI IL ÉTAIT OUBLIÉ.
   *
   * `revalidatePath("/dashboard", "layout")` couvre tout l'arbre du tableau de
   * bord — et rien d'autre. `/vitrine-studio` est délibérément à côté (c'est ce
   * qui lui retire la colonne de navigation), donc cette ligne ne l'atteignait
   * pas : après avoir saisi son Instagram dans le studio, le commerçant voyait
   * son aperçu inchangé. L'enregistrement avait pourtant réussi.
   *
   * Le défaut est de la classe la plus coûteuse ici : rien ne casse, rien ne
   * remonte, et l'écran donne raison à celui qui croit que son geste n'a pas
   * pris — il recommence, et doute de l'outil.
   *
   * Toute route posée HORS de `/dashboard` qui lit `organizations` doit venir
   * ici en même temps qu'elle naît. `/poster/[id]` n'en lit pas les liens ;
   * c'est la seule raison pour laquelle elle n'y figure pas.
   */
  revalidatePath("/vitrine-studio");
  // Le lien est ORG-WIDE : il apparaît sur TOUTES les pages /play de la maison,
  // pas sur celles d'une campagne. Même geste que le logo (branding.ts) —
  // `revalidatePlaySlugs` par organisation, une seule lecture des slugs pour
  // toute la purge. À défaut, l'ISR de /play (30 s, page.tsx) rattraperait de
  // toute façon : la purge n'est jamais bloquante.
  await revalidatePlaySlugs(admin, { organizationId: organization.id });
  return { ok: true, data: undefined };
}
