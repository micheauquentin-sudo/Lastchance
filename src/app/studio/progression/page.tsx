import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import { getOrgProgression } from "@/actions/meta-progression";
import { ProgressionStudio } from "@/components/progression/progression-studio";
import { getUserAndOrg } from "@/lib/auth";

export const metadata: Metadata = { title: "Mon studio — missions & coffres" };

/**
 * LE STUDIO DE LA MÉTA-PROGRESSION (VIT-50) — plein écran, HORS du tableau de
 * bord.
 *
 * ── POURQUOI CETTE ROUTE N'EST PAS SOUS `/dashboard` ──
 *
 * Ce n'est pas un choix d'URL, c'est ce qui fait DISPARAÎTRE la colonne de
 * navigation : `/dashboard/layout.tsx` la pose sur tout ce qu'il contient, et un
 * studio qui garde le menu à gauche n'a plus la largeur de son aperçu. C'est le
 * motif des neuf studios déjà portés.
 *
 * ── ET POURQUOI ELLE N'A PAS D'IDENTIFIANT ──
 *
 * La méta-progression est TRANSVERSE : scopée par organisation, nourrie par
 * toutes les expériences, elle n'a pas d'objet propre à adresser. La saison
 * réglée est choisie côté client (brouillon d'abord), et un sélecteur apparaît
 * dès qu'il y en a plusieurs. Le chemin reste donc littéral — ce qui oblige la
 * garde de revalidation à compter par FONCTION plutôt que par chemin.
 *
 * ── LA REVALIDATION EST UN DÉFAUT DÉJÀ PAYÉ SIX FOIS ──
 *
 * Vivant hors de `/dashboard`, cette page n'est atteinte par AUCUN des
 * `revalidatePath("/dashboard/progression")` de `src/actions/meta-progression.ts`.
 * `revalidateProgression()` jumelle donc les deux chemins, et
 * `revalidation-studio.test.ts` échoue si une future mutation revalide sans
 * jumeler.
 *
 * ── LA GARDE EST `canConfigure`, PAS LE RÔLE ──
 *
 * Le module n'est adossé à AUCUN addon (il n'existe pas de drapeau
 * `addon_progression` en base) : il n'y a donc pas de `capacitesDuModule` à
 * consulter, contrairement au calendrier ou au quiz. L'autorité est celle que
 * rend la RPC — la même qui décide de servir ou non la branche `seasons`. Un
 * studio qui se garderait sur `role` afficherait des formulaires d'édition sur
 * une liste que la RPC a refusé de remplir ; et `canConfigure` vaut aussi
 * `false` quand l'agrégat est ILLISIBLE, ce qu'un rôle ne peut pas savoir.
 *
 * `notFound()` plutôt qu'un écran d'explication, et c'est l'écart assumé avec
 * `/dashboard/progression` : cette page-là garde ses COMPTEURS lisibles par
 * toute l'équipe et doit donc dire pourquoi la configuration manque. Un studio
 * n'a rien d'autre à montrer qu'une configuration — sans le droit de la lire, il
 * n'a pas de contenu du tout.
 */
export default async function StudioProgressionPage() {
  const { user, organization } = await getUserAndOrg();
  if (!user) redirect("/login");
  if (!organization) redirect("/onboarding");

  const snapshot = await getOrgProgression();
  if (!snapshot.canConfigure) notFound();

  return (
    <ProgressionStudio
      seasons={snapshot.seasons}
      peutRegler={snapshot.canConfigure}
      organization={{ id: organization.id, name: organization.name }}
    />
  );
}
