import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { getUserAndOrg } from "@/lib/auth";
import { APP_URL } from "@/lib/env";
import { capacitesDuModule } from "@/lib/module-capabilities-server";
import { urlActiviteReserver } from "@/lib/reserver";
import { loadReserverDashboardContext } from "@/lib/reserver-context";
import { loadHorairesActivite } from "@/lib/reserver-horaires-context";
import { ReservationStudio } from "@/components/reserver/reservation-studio";

export const metadata: Metadata = { title: "Mon studio — réservation" };

/**
 * LE STUDIO DE RÉSERVATION (VIT-49) — plein écran, HORS du tableau de bord.
 *
 * ── POURQUOI CETTE ROUTE N'EST PAS SOUS `/dashboard` ──
 *
 * Ce n'est pas un choix d'URL, c'est ce qui fait DISPARAÎTRE la colonne de
 * navigation : `/dashboard/layout.tsx` la pose sur tout ce qu'il contient, et
 * un studio qui garde le menu à gauche n'a plus la largeur de son aperçu.
 * C'est le motif des neuf studios déjà portés, y compris dans ses gardes :
 * session, organisation, puis le droit du module.
 *
 * ── L'ACTIVITÉ EST CHERCHÉE DANS L'AGENDA DÉJÀ CHARGÉ ──
 *
 * `loadReserverDashboardContext` rend les activités de l'organisation ACTIVE,
 * avec leurs créneaux et leurs invitations, en une lecture bornée. Une requête
 * dédiée par identifiant aurait ajouté un SECOND chemin d'accès à ces tables —
 * donc un second endroit où oublier la borne de locataire. C'est mot pour mot
 * l'arbitrage de `/dashboard/reservations/[activityId]`, et le reprendre ici
 * garde les deux écrans sur la même vérité.
 *
 * L'activité demandée est simplement introuvable dans la liste quand elle
 * appartient à quelqu'un d'autre, et la page rend 404 : même réponse que pour
 * une activité qui n'existe pas, aucun oracle.
 *
 * ── LES HORAIRES SONT CHARGÉS À PART, PAR LE MÊME CHARGEUR QUE L'ATELIER ──
 *
 * `loadHorairesActivite` porte les cinq réglages, les plages, les fermetures et
 * les tables. Le studio et l'écran-salle lisent donc la MÊME source : deux
 * lecteurs divergents sur la même donnée auraient été pires que pas de studio.
 *
 * ── CE QUI N'EST PAS MONTÉ ICI, ET CE N'EST PAS UN OUBLI ──
 *
 * Ni `CreneauxAgenda`, ni `AgendaVues`, ni `PlanSalleVue`, ni `ArriveesCheckin`.
 * Ce sont des gestes d'EXPLOITATION — voir l'en-tête de `reservation-studio.tsx`.
 * Rien n'a été retiré de `/dashboard/reservations/[activityId]`, qui les garde
 * tous.
 */
export default async function StudioReservationPage({
  params,
}: {
  params: Promise<{ activityId: string }>;
}) {
  const { activityId } = await params;

  const { user, organization, role } = await getUserAndOrg();
  if (!user) redirect("/login");
  if (!organization) redirect("/onboarding");

  // REFUS AVANT LECTURE, comme sur la page du tableau de bord : un caissier
  // déclencherait sinon deux chargements dont le résultat part aussitôt au
  // `notFound()`. Le droit est `reserver`, celui de l'écran d'activité.
  const capacites = await capacitesDuModule("reserver");
  if (!capacites.canExplore) notFound();

  const agenda = await loadReserverDashboardContext();
  if (!agenda.ok) notFound();

  const activite = agenda.activities.find((a) => a.id === activityId);
  // Activité inconnue OU d'une autre organisation : même réponse.
  if (!activite) notFound();

  const horaires = await loadHorairesActivite(activite.id);

  // Les créneaux OUVERTS : la quatrième étape du fil de la salle ne demande pas
  // « avez-vous des créneaux » mais « en avez-vous d'ouverts » — un brouillon
  // ne prend aucune réservation. Même calcul que sur l'écran d'activité.
  const creneauxOuverts = activite.slots.filter(
    (slot) => slot.status === "open",
  ).length;

  /**
   * LES CRÉNEAUX DE L'APERÇU — OUVERTS ET À VENIR, comme la page publique.
   *
   * `ReserverSlotDashboardView` ÉTEND `ReserverSlotPublicView` : aucune
   * projection n'est faite ici, et c'est délibéré — recopier les champs aurait
   * créé une seconde vue publique, qui aurait divergé de la vraie au premier
   * ajout de colonne.
   *
   * Le FILTRE, lui, est nécessaire : `loadReserverPublicContext` ne rend que
   * les créneaux ouverts et à venir, alors que l'agenda du commerçant porte
   * aussi les brouillons, les fermés et les passés. Sans lui, l'aperçu
   * montrerait des créneaux qu'aucun client ne voit — le seul défaut qu'un
   * aperçu ne doit jamais avoir, parce qu'il est invisible (ADR-152).
   *
   * Et le chargeur public N'EST PAS appelé ici, sciemment : il compte la
   * pression IP de la page publique (`reserver:page:ip`) et lit le cookie
   * joueur du navigateur. Un commerçant ouvrant son studio aurait pollué un
   * signal de supervision et vu, le cas échéant, ses PROPRES réservations
   * s'afficher dans l'aperçu de ce que voient ses clients.
   */
  const maintenant = new Date();
  const creneauxApercu = activite.slots.filter(
    (slot) => slot.status === "open" && new Date(slot.startsAt) > maintenant,
  );

  return (
    <ReservationStudio
      activite={activite}
      activityId={activite.id}
      plages={horaires.plages}
      fermetures={horaires.fermetures}
      tables={horaires.tables}
      dureeServiceMinutes={horaires.reglages.dureeServiceMinutes}
      creneauxOuverts={creneauxOuverts}
      creneauxApercu={creneauxApercu}
      invitations={activite.invitations}
      // TOUS les créneaux : une invitation peut viser un créneau déjà fermé, et
      // elle doit rester lisible.
      creneaux={activite.slots}
      organizationName={organization.name}
      logoUrl={organization.logo_url}
      timeZone={agenda.timezone}
      // L'adresse est STABLE — elle ne porte que l'identifiant de l'activité,
      // jamais un jeton (ADR-109) — donc une affiche imprimée survit à la page
      // qui l'a produite. Même source que l'écran d'activité (APP_URL).
      url={urlActiviteReserver(activite.id, APP_URL)}
      // Le Mode Attente active (RES-4) : les deux listes de l'organisation,
      // résolues côté serveur — un identifiant ne se saisit pas à la main.
      quiz={agenda.waitQuiz}
      campagnes={agenda.waitCampaigns}
      bookingMode={horaires.reglages.bookingMode}
      dureeMinutes={horaires.reglages.dureeMinutes}
      capacite={horaires.reglages.capacite}
      horizonJours={horaires.reglages.horizonJours}
      delaiMinutes={horaires.reglages.delaiMinutes}
      // `enregistrerReglagesRendezVous` exige `owner|editor` : mieux vaut ne
      // rien proposer que laisser l'action refuser après coup.
      peutEditer={role === "owner" || role === "editor"}
    />
  );
}
