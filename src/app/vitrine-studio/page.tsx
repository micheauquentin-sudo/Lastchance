import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getUserAndOrg } from "@/lib/auth";
import { capacitesDuModule } from "@/lib/module-capabilities-server";
import {
  loadBilanJeuxVitrine,
  loadVitrineDashboardContext,
} from "@/lib/vitrine-context";
import { createClient } from "@/lib/supabase/server";
import { VitrineStudio } from "@/components/vitrine/vitrine-studio";
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
   * Ce bilan se calculait jusqu'ici dans `/dashboard/vitrine` SEULEMENT, ce qui
   * suffisait tant que le bilan des jeux et l'éditeur de carte vivaient là-bas.
   * Le studio le porte désormais : sans lui, sa page « Ce qui paraît sur ma
   * carte » afficherait « non compris dans votre offre » partout — c'est-à-dire
   * un MENSONGE, pire qu'une page vide, parce qu'il ressemble à une réponse.
   *
   * SIX DROITS DISTINCTS depuis la clé par produit (`20261020120000`), et non
   * deux : un commerce peut avoir la Vitrine sans aucun des salons, ou le
   * Passeport sans les quiz. VIT-32 en a fait six lignes à l'écran, donc six
   * droits à lire — et cinq comptes, qui disent lesquelles ont de quoi montrer.
   *
   * `loadBilanJeuxVitrine` ne rend jamais un refus : sans session ou sur une
   * lecture muette, il rend un bilan VIDE. C'est le même arbitrage que l'ancien
   * `loadDuoOptions` ici — « rien à montrer » et « rien à lire » méritent la
   * même phrase, et aucune des deux ne mérite un écran d'erreur.
   */
  const [contenus, bilanJeux] = await Promise.all([
    (async (): Promise<ContenuVitrineView[]> => {
      const supabase = await createClient();
      const { data } = await supabase
        .from("vitrine_contenus")
        .select("rang, titre, url")
        .eq("organization_id", ctx.organizationId)
        .order("rang");
      return (data ?? []) as ContenuVitrineView[];
    })(),
    loadBilanJeuxVitrine(),
  ]);

  return (
    <VitrineStudio
      slug={s.slug}
      bilanJeux={bilanJeux}
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
        horairesStructures: s.horaires,
      }}
      timezone={organization.timezone}
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
