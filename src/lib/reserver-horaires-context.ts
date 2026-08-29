import "server-only";

import { getUserAndOrg } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type {
  Fermeture,
  JourSemaine,
  PlageHoraireIdentifiee,
} from "@/lib/reserver-horaires";

/**
 * LES HORAIRES D'UNE ACTIVITÉ, pour l'écran du commerçant (RDV-1).
 *
 * ── POURQUOI UN CHARGEUR À PART ──
 *
 * `loadReserverDashboardContext` rend DÉJÀ toutes les activités avec leurs
 * créneaux, leurs réservations et leurs invitations, en une lecture bornée.
 * Y greffer les horaires aurait fait payer deux requêtes de plus à la LISTE des
 * activités — écran qui ne les affiche pas — pour servir la seule page de
 * détail. Ce chargeur est donc appelé par cette page-là, et par elle seule.
 *
 * ── LE CLIENT DE SESSION, PAS `service_role` ──
 *
 * Les deux tables sont protégées par RLS `is_org_editor`. Lire avec la session
 * du commerçant, c'est laisser la base appliquer sa propre garde ; passer par
 * `service_role` l'aurait contournée et aurait fait reposer l'isolation sur le
 * seul `eq('organization_id', …)` écrit ici. Deux barrières valent mieux
 * qu'une, et la base est la plus fiable des deux.
 */

/**
 * Les quatre réglages de rendez-vous, lus ICI et non dans
 * `ReserverActivityDashboardView`.
 *
 * Les ajouter à la vue partagée les aurait fait charger par la LISTE des
 * activités, qui ne les affiche pas, et par les deux autres écrans du module.
 * Ils vivent donc avec les horaires — les seules données qui s'en servent.
 */
export interface ReglagesRendezVousView {
  bookingMode: string;
  dureeMinutes: number | null;
  capacite: number | null;
  horizonJours: number;
  delaiMinutes: number;
}

export interface HorairesActiviteView {
  reglages: ReglagesRendezVousView;
  plages: PlageHoraireIdentifiee[];
  fermetures: Fermeture[];
}

/** Les valeurs par défaut de la migration : un Moment, sans horaires. */
export function horairesVides(): HorairesActiviteView {
  return {
    reglages: {
      bookingMode: "moment",
      dureeMinutes: null,
      capacite: null,
      horizonJours: 30,
      delaiMinutes: 0,
    },
    plages: [],
    fermetures: [],
  };
}

/**
 * Repli FERMÉ, comme les autres chargeurs du module : une lecture qui échoue
 * rend un état VIDE, jamais une exception. Le commerçant a le droit de voir sa
 * page ; il n'a peut-être rien à y lire, et une panne de lecture ne doit pas
 * lui retirer l'agenda et les réservations qui l'entourent.
 */
export async function loadHorairesActivite(
  activityId: string,
): Promise<HorairesActiviteView> {
  const { user, organization, role } = await getUserAndOrg();
  if (!user || !organization) return horairesVides();
  if (role !== "owner" && role !== "editor") return horairesVides();

  const supabase = await createClient();

  const [reglagesRes, plagesRes, fermeturesRes] = await Promise.all([
    supabase
      .from("reservation_activities")
      .select(
        "booking_mode, duration_minutes, slot_capacity, booking_horizon_days, lead_time_minutes",
      )
      .eq("id", activityId)
      .eq("organization_id", organization.id)
      .maybeSingle(),
    supabase
      .from("reservation_openings")
      .select("id, weekday, starts_at_minute, ends_at_minute")
      .eq("activity_id", activityId)
      .eq("organization_id", organization.id)
      // Lundi d'abord, puis l'heure : c'est l'ordre de lecture de l'écran, et
      // le trier ici évite de le retrier à chaque rendu.
      .order("weekday", { ascending: true })
      .order("starts_at_minute", { ascending: true }),
    supabase
      .from("reservation_closures")
      .select("id, starts_on, ends_on, reason")
      .eq("activity_id", activityId)
      .eq("organization_id", organization.id)
      .order("starts_on", { ascending: true }),
  ]);

  const defauts = horairesVides().reglages;
  const reglage = reglagesRes.data;

  return {
    reglages: reglage
      ? {
          bookingMode: (reglage.booking_mode as string) || defauts.bookingMode,
          dureeMinutes:
            typeof reglage.duration_minutes === "number"
              ? reglage.duration_minutes
              : null,
          capacite:
            typeof reglage.slot_capacity === "number"
              ? reglage.slot_capacity
              : null,
          horizonJours:
            typeof reglage.booking_horizon_days === "number"
              ? reglage.booking_horizon_days
              : defauts.horizonJours,
          delaiMinutes:
            typeof reglage.lead_time_minutes === "number"
              ? reglage.lead_time_minutes
              : defauts.delaiMinutes,
        }
      : defauts,
    plages: (plagesRes.data ?? []).map((row) => ({
      id: row.id as string,
      weekday: row.weekday as JourSemaine,
      debut: row.starts_at_minute as number,
      fin: row.ends_at_minute as number,
    })),
    fermetures: (fermeturesRes.data ?? []).map((row) => ({
      id: row.id as string,
      debut: row.starts_on as string,
      fin: row.ends_on as string,
      motif: (row.reason as string | null) ?? null,
    })),
  };
}
