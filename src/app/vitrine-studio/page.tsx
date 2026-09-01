import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getUserAndOrg } from "@/lib/auth";
import { capacitesDuModule } from "@/lib/module-capabilities-server";
import { loadVitrineDashboardContext } from "@/lib/vitrine-context";
import { VitrineStudio } from "@/components/vitrine/vitrine-studio";

export const metadata: Metadata = { title: "Personnaliser ma vitrine" };

/**
 * LE STUDIO DE LA VITRINE (VIT-17) — plein écran, hors du tableau de bord.
 *
 * ── POURQUOI CETTE ROUTE N'EST PAS SOUS `/dashboard` ──
 *
 * Ce n'est pas un choix d'URL, c'est ce qui fait DISPARAÎTRE la colonne de
 * navigation : `/dashboard/layout.tsx` la pose sur tout ce qu'il contient. Un
 * studio qui garde le menu à gauche n'a plus la largeur de son aperçu, et un
 * aperçu qu'on ne voit qu'à moitié ne sert à rien.
 *
 * C'est exactement le motif de `/poster/[id]`, l'éditeur d'affiche, y compris
 * dans ses gardes : session, organisation, puis le droit du module.
 *
 * ── PAS D'IDENTIFIANT DANS L'URL ──
 *
 * Il y a UNE vitrine par commerce. `/vitrine-studio` suffit, et c'est
 * l'organisation de la session qui dit laquelle — même raison que
 * `/dashboard/vitrine`, qui n'en porte pas non plus.
 *
 * ── SANS ADRESSE, IL N'Y A RIEN À PERSONNALISER ──
 *
 * On renvoie alors à l'étape qui la choisit plutôt que d'ouvrir un studio sur
 * une page qui n'existe pas. La base dessine déjà ce premier pas :
 * `vitrine_dashboard_state` rend `settings = null` tant qu'aucune adresse n'a
 * été prise.
 */
export default async function VitrineStudioPage() {
  const { user, organization } = await getUserAndOrg();
  if (!user) redirect("/login");
  if (!organization) redirect("/onboarding");

  const capacites = await capacitesDuModule("vitrine");
  const ctx = await loadVitrineDashboardContext();
  if (!ctx.ok || !ctx.settings) redirect("/dashboard/vitrine?etape=adresse");

  const s = ctx.settings;

  return (
    <VitrineStudio
      slug={s.slug}
      identiteInitiale={{
        // Le nom et le logo viennent des réglages GÉNÉRAUX du commerce : ils
        // ne se saisissent pas ici, et les redemander aurait créé une seconde
        // identité à tenir d'accord avec celle de la roue.
        nom: organization.name,
        logoUrl: organization.logo_url,
        coverPath: s.cover_path,
        coverAlt: s.cover_alt,
        accroche: s.accroche ?? "",
        histoire: s.histoire ?? "",
        horaires: s.horaires_texte ?? "",
        badge: s.badge_ouverture ?? "",
        secteur: s.secteur,
      }}
      themeInitial={s.theme}
      cartes={ctx.cartes}
      // LES LIENS VIENNENT DE L ORGANISATION, pas des réglages de vitrine :
      // ce sont les mêmes que la page publique reçoit, et ils se saisissent
      // dans les réglages généraux du commerce.
      liens={{
        google_review_url: organization.google_review_url,
        instagram_url: organization.instagram_url,
        tiktok_url: organization.tiktok_url,
      }}
      peutEditer={capacites.canEditDraft}
    />
  );
}
