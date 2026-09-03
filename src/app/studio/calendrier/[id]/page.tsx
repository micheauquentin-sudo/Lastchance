import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { getUserAndOrg } from "@/lib/auth";
import { APP_URL } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";
import { capacitesDuModule } from "@/lib/module-capabilities-server";
import { sortieDeLOrganisation } from "@/lib/sortie-apres-jeu";
import { CalendrierStudio } from "@/components/calendar/calendrier-studio";
import {
  bilanCasesCalendrier,
  toCalendarWheelOptions,
  type CalendarPrizeRow,
  type CalendarWheelRow,
} from "@/components/dashboard/calendar-donnees-editeur";
import type { Calendar, CalendarDay } from "@/types/database";

export const metadata: Metadata = { title: "Mon studio — calendrier" };

/**
 * LE STUDIO DU CALENDRIER (VIT-39) — plein écran, HORS du tableau de bord.
 *
 * ── POURQUOI CETTE ROUTE N'EST PAS SOUS `/dashboard` ──
 *
 * Ce n'est pas un choix d'URL, c'est ce qui fait DISPARAÎTRE la colonne de
 * navigation : `/dashboard/layout.tsx` la pose sur tout ce qu'il contient, et
 * un studio qui garde le menu à gauche n'a plus la largeur de son aperçu.
 * C'est le motif de `/vitrine-studio` et de `/poster/[id]`, y compris dans ses
 * gardes : session, organisation, puis le droit du module.
 *
 * Et c'est ce que la demande exige : le commerçant doit voir le MÊME écran
 * quel que soit le module qu'il règle. Un studio encadré ici et plein écran
 * là-bas serait deux produits.
 *
 * ── LA REVALIDATION EST UN DÉFAUT DÉJÀ PAYÉ ──
 *
 * Vivant hors de `/dashboard`, cette page n'est atteinte par AUCUN des
 * `revalidatePath("/dashboard/calendar/…")` de `src/actions/calendar.ts`.
 * C'est exactement le défaut VIT-37 — un lien Instagram enregistré
 * n'apparaissait jamais dans `/vitrine-studio`. Chaque revalidation du
 * calendrier a donc désormais son jumeau `/studio/calendrier/${id}`, et
 * `revalidation-studio.test.ts` échoue s'il en manque un.
 *
 * ── `select("*")`, ET C'EST DÉLIBÉRÉ ──
 *
 * La page du tableau de bord énumère ses colonnes dans une constante
 * littérale, parce qu'une garde textuelle (`code-ttl-days-chargement.test.ts`)
 * y vérifie la présence de `code_ttl_days` et sait résoudre une constante du
 * MÊME fichier. La recopier ici aurait créé une seconde liste à tenir
 * d'accord ; `*` charge tout, ne peut rien oublier, et coûte une ligne.
 */
export default async function StudioCalendrierPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { user, organization, role } = await getUserAndOrg();
  if (!user) redirect("/login");
  if (!organization) redirect("/onboarding");

  // REFUS AVANT LECTURE, comme sur la page du tableau de bord : un caissier
  // déclencherait sinon quatre requêtes dont le résultat part aussitôt au
  // `notFound()`.
  const capacites = await capacitesDuModule("calendar");
  if (!capacites.canExplore) notFound();

  const supabase = await createClient();

  const [
    { data: calendarRow },
    { data: dayRows },
    { data: wheelRows },
    { data: prizeRows },
  ] = await Promise.all([
    supabase
      .from("calendars")
      .select("*")
      .eq("id", id)
      .eq("organization_id", organization.id)
      .maybeSingle(),
    supabase
      .from("calendar_days")
      .select("*")
      .eq("calendar_id", id)
      .eq("organization_id", organization.id)
      .order("day_index", { ascending: true }),
    supabase
      .from("wheels")
      .select("id, name")
      .eq("organization_id", organization.id)
      .order("created_at", { ascending: true }),
    supabase
      .from("prizes")
      .select("wheel_id, label, is_losing, stock, weight")
      .eq("organization_id", organization.id)
      .eq("is_active", true),
  ]);

  if (!calendarRow) notFound();
  const calendar = calendarRow as unknown as Calendar;
  const jours = (dayRows ?? []) as CalendarDay[];
  const roues = toCalendarWheelOptions(
    (wheelRows ?? []) as CalendarWheelRow[],
    (prizeRows ?? []) as CalendarPrizeRow[],
  );
  const bilan = bilanCasesCalendrier(calendar, jours, roues);

  // Le bas de la page du client — vitrine publiée et réseaux du commerce. Sans
  // lui, l'aperçu montrerait une page publique amputée d'un bloc que ses
  // clients voient : c'est le seul défaut qu'un aperçu ne doit jamais avoir.
  // Toute panne y vaut `null`, comme sur la page publique.
  const sortie = await sortieDeLOrganisation(organization.id);

  // URL ABSOLUE : même source que la page du tableau de bord (APP_URL), pour
  // que le lien « Voir le jeu » mène là où mène le QR déjà imprimé.
  const publicUrl =
    calendar.status === "active"
      ? `${APP_URL}/calendar/${calendar.public_slug}`
      : null;

  return (
    <CalendrierStudio
      calendar={calendar}
      jours={jours}
      roues={roues}
      entreeVerification={bilan.entree}
      garnies={bilan.garnies}
      organizationName={organization.name}
      organizationId={organization.id}
      logoUrl={organization.logo_url}
      publicUrl={publicUrl}
      sortie={sortie}
      // `updateCalendar` exige `owner|editor` ET le droit d'éditer un
      // brouillon : mieux vaut ne rien proposer que laisser l'action refuser
      // après coup.
      peutEditer={
        (role === "owner" || role === "editor") && capacites.canEditDraft
      }
    />
  );
}
