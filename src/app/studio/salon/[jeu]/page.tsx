import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import { getUserAndOrg } from "@/lib/auth";
import { BANDE_PACK_DEFAUT } from "@/lib/bande-packs";
import { loadBandePack } from "@/lib/bande-context";
import { loadDuoOptions } from "@/lib/duo-context";
import { APP_URL } from "@/lib/env";
import { LOBBY_KINDS, type LobbyKind } from "@/lib/lobby";
import { capacitesDuModule } from "@/lib/module-capabilities-server";
import { asSeasonalTheme } from "@/lib/seasonal-theme";
import { createClient } from "@/lib/supabase/server";
import { loadVitrineDashboardContext } from "@/lib/vitrine-context";
import { entreeModule } from "@/platform/experiences/catalog";
import { SalonStudio } from "@/components/salons/salon-studio";

export const metadata: Metadata = { title: "Mon studio — salons" };

export const dynamic = "force-dynamic";

/**
 * LE STUDIO DES SALONS (VIT-48) — plein écran, HORS du tableau de bord.
 *
 * ── POURQUOI CETTE ROUTE N'EST PAS SOUS `/dashboard` ──
 *
 * Ce n'est pas un choix d'URL, c'est ce qui fait DISPARAÎTRE la colonne de
 * navigation : `/dashboard/layout.tsx` la pose sur tout ce qu'il contient, et
 * un studio qui garde le menu à gauche n'a plus la largeur de son aperçu. C'est
 * le motif de `/vitrine-studio`, de `/poster/[id]`, et des six studios déjà
 * portés.
 *
 * ── ET POURQUOI ELLE PORTE `[jeu]` PLUTÔT QU'UN `[id]` ──
 *
 * Les salons n'ont pas de campagne : `lobby_settings`, `duo_options` et le pack
 * de la Bande portent `organization_id`. Il n'y a donc rien à mettre dans un
 * `[id]`. Le segment nomme le JEU, exactement comme
 * `/dashboard/salons/[jeu]` — et pour la même raison qu'ici un `[id]` aurait
 * ouvert une deuxième manière de désigner un commerce, celle qui vient du
 * navigateur, la seule que la garde ne connaît pas.
 *
 * ── LA REVALIDATION EST UN DÉFAUT DÉJÀ PAYÉ CINQ FOIS ──
 *
 * Vivant hors de `/dashboard`, cette page n'est atteinte par AUCUN des
 * `revalidatePath("/dashboard/salons/…")` de `src/actions/{duo,bande,salon-habillage}.ts`
 * — Next revalide un CHEMIN, pas une ressource. C'est le défaut VIT-37, puis
 * VIT-39, VIT-41, VIT-42, VIT-45, mot pour mot : un enregistrement qui réussit
 * sans jamais apparaître, sur l'écran même où l'on vient vérifier. Chaque
 * revalidation d'atelier a donc son jumeau, et
 * `revalidation-studio.test.ts` échoue s'il en manque un.
 *
 * `setHabillageSalons` est le cas particulier, et il est traité comme tel : il
 * revalide LES DEUX ateliers parce que le réglage est commun aux deux jeux, il
 * revalide donc LES DEUX studios. N'en rafraîchir qu'un laisserait l'autre
 * afficher l'ancien décor, et le commerçant croirait à deux réglages distincts.
 *
 * ── L'ADRESSE PUBLIQUE A DEUX SOURCES, ET L'ORDRE COMPTE ──
 *
 * La vitrine publiée d'abord — c'est l'adresse déjà imprimée sur les QR, la
 * faire passer après changerait la page servie à un client qui scanne. Le slug
 * d'organisation ensuite, pour les commerces sans carte. Même ordre que
 * `resoudreCommerceLobby`, qui résout l'autre bout du même lien ; les deux
 * divergeraient s'ils choisissaient différemment. Cette page ne la RECALCULE
 * pas : elle applique le même ordre que `/dashboard/salons/[jeu]`, et
 * l'expression est identique aux deux endroits.
 *
 * ── LE REFUS RENVOIE AU TABLEAU DE BORD, IL NE DISPARAÎT PAS ──
 *
 * Motif du Ticket d'Or : `notFound()` dirait « cette page n'existe pas » à un
 * commerçant dont l'abonnement vient d'expirer — ce qui est faux, et ne lui
 * apprend pas quoi faire. `/dashboard/salons/[jeu]` porte déjà le texte de
 * refus ; c'est là qu'on l'envoie. Un SEGMENT inconnu, lui, reste un `404` :
 * il ne désigne aucun jeu, et il n'y a pas de tableau de bord où le renvoyer.
 */
function estJeuDeSalon(valeur: string): valeur is LobbyKind {
  return (LOBBY_KINDS as readonly string[]).includes(valeur);
}

export default async function StudioSalonPage({
  params,
}: {
  params: Promise<{ jeu: string }>;
}) {
  const { jeu } = await params;
  // Un segment inconnu est un 404, jamais un repli sur le premier jeu : un
  // repli ferait ouvrir le studio d'un jeu que le commerçant n'a pas demandé.
  if (!estJeuDeSalon(jeu)) notFound();

  const { user, organization, role } = await getUserAndOrg();
  if (!user) redirect("/login");
  if (!organization) redirect("/onboarding");

  // REFUS AVANT LECTURE, comme sur la page du tableau de bord : un caissier
  // déclencherait sinon quatre requêtes dont le résultat part aussitôt au refus.
  const capacites = await capacitesDuModule(jeu);
  if (!capacites.canExplore) redirect(`/dashboard/salons/${jeu}`);

  const fiche = entreeModule(jeu);
  if (!fiche) notFound();

  const supabase = await createClient();
  const [{ data: vitrine }, { data: habillage }] = await Promise.all([
    supabase
      .from("vitrine_settings")
      .select("slug, published")
      .eq("organization_id", organization.id)
      .maybeSingle(),
    // L'ABSENCE DE LIGNE EST L'ÉTAT NORMAL d'un commerce qui n'a jamais ouvert
    // cet écran : `maybeSingle` rend `null`, et les défauts ci-dessous sont ceux
    // des colonnes — `neutre`, « suivre le thème », enseigne affichée.
    supabase
      .from("lobby_settings")
      .select("theme, fond_key, affiche_identite")
      .eq("organization_id", organization.id)
      .maybeSingle(),
  ]);

  const slugPublic =
    vitrine?.published && vitrine.slug ? vitrine.slug : organization.slug;

  /**
   * CE QUE CHAQUE JEU A À RÉGLER — lu seulement pour le jeu de cette page, et
   * la carte SEULEMENT pour le Duo, qui est le seul à en tirer des fiches.
   * Aucun des chargeurs ne rend un refus : le plateau vide et le pack par défaut
   * sont exactement ce qu'il faut afficher quand la lecture échoue.
   */
  const [plateau, cartes, pack] = await Promise.all([
    jeu === "duo"
      ? loadDuoOptions().then((r) =>
          r.ok ? r.plateau : { options: [], suggestion: null },
        )
      : { options: [], suggestion: null },
    jeu === "duo"
      ? loadVitrineDashboardContext().then((r) => (r.ok ? r.cartes : []))
      : [],
    jeu === "bande"
      ? loadBandePack().then((r) => (r.ok ? r.pack : BANDE_PACK_DEFAUT))
      : BANDE_PACK_DEFAUT,
  ]);

  return (
    <SalonStudio
      jeu={jeu}
      libelleJeu={fiche.label}
      theme={asSeasonalTheme(habillage?.theme)}
      fondKey={habillage?.fond_key ?? null}
      afficheIdentite={habillage?.affiche_identite ?? true}
      nomOrganisation={organization.name}
      organizationId={organization.id}
      logoUrl={organization.logo_url}
      url={`${APP_URL}/lobby/nouveau/${slugPublic}`}
      vitrinePubliee={!!vitrine?.published}
      plateau={plateau}
      cartes={cartes}
      pack={pack}
      // `setHabillageSalons` exige `owner|editor` (`gardeEditeurJeuSalon`) ET le
      // droit d'éditer un brouillon : mieux vaut ne rien proposer que laisser
      // l'action refuser après coup.
      peutEditer={
        (role === "owner" || role === "editor") && capacites.canEditDraft
      }
    />
  );
}
