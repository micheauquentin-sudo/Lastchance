import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getUserAndOrg } from "@/lib/auth";
import { capacitesDuModule } from "@/lib/module-capabilities-server";
import { loadVitrineDashboardContext } from "@/lib/vitrine-context";
import { loadDuoOptions } from "@/lib/duo-context";
import { droitEffectifModule } from "@/lib/subscription";
import { createClient } from "@/lib/supabase/server";
import { VitrineStudio } from "@/components/vitrine/vitrine-studio";
import type { DuoOptionsAdminView } from "@/lib/duo";
import type { ContenuVitrineView } from "@/lib/vitrine";

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

  /**
   * CE QUE LE COMMERÇANT POSSÈDE, ET CE QU'IL A DÉJÀ COMPOSÉ.
   *
   * Ces quatre valeurs se calculaient jusqu'ici dans `/dashboard/vitrine`
   * SEULEMENT, ce qui suffisait tant que le bilan des jeux et l'éditeur de
   * carte vivaient là-bas. Le studio les porte désormais : sans elles, sa page
   * « Les jeux » afficherait « non compris dans votre offre » aux deux jeux —
   * c'est-à-dire un MENSONGE, pire qu'une page vide, parce qu'il ressemble à
   * une réponse.
   *
   * Deux droits distincts depuis la clé par produit (`20261020120000`) : un
   * commerce peut avoir la Vitrine sans avoir aucun des deux jeux.
   *
   * Le plateau du Duo n'est pas lu pour être édité — il l'est sur la page du
   * jeu (ADR-135) — mais parce que son COMPTE décide du « prêt / pas prêt »
   * qu'affiche le bilan. `loadDuoOptions` ne rend jamais un refus : garde
   * échouée ou lecture vide donnent le même plateau vide, et les deux méritent
   * la même phrase.
   */
  const duoPossede = droitEffectifModule("duo", organization);
  const bandePossede = droitEffectifModule("bande", organization);
  const [contenus, plateauDuo] = await Promise.all([
    (async (): Promise<ContenuVitrineView[]> => {
      const supabase = await createClient();
      const { data } = await supabase
        .from("vitrine_contenus")
        .select("rang, titre, url")
        .eq("organization_id", ctx.organizationId)
        .order("rang");
      return (data ?? []) as ContenuVitrineView[];
    })(),
    (async (): Promise<DuoOptionsAdminView> => {
      const duo = await loadDuoOptions();
      return duo.ok ? duo.plateau : { options: [], suggestion: null };
    })(),
  ]);

  return (
    <VitrineStudio
      slug={s.slug}
      duoPossede={duoPossede}
      bandePossede={bandePossede}
      nbFichesDuo={plateauDuo.options.length}
      contenus={contenus}
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
