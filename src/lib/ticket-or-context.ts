import "server-only";

import { getUserAndOrg } from "@/lib/auth";
import { droitEffectifModule } from "@/lib/subscription";
import { createAdminClient } from "@/lib/supabase/admin";
import { mapTicketOrState, ticketOrVide, type TicketOrView } from "@/lib/ticket-or";

/**
 * LE TICKET D'OR (TKT-1) — la garde et la lecture, côté commerçant.
 *
 * ── LE COMPTOIR EST UNE SESSION DU COMMERCE, PAS UN RÔLE PARTICULIER ──
 *
 * `cashier` est admis ici, contrairement à la Vitrine : remettre un ticket
 * après une visite EST un geste de caisse, et le réserver au propriétaire
 * aurait rendu le jeu inutilisable aux heures où le propriétaire n'est pas là.
 * La configuration des lots, elle, reste à `owner`/`editor` — c'est le
 * paramétrage d'une animation, pas un geste de service.
 *
 * ── LA CLÉ EST CELLE DE L'OFFRE DE BASE ──
 *
 * `droitEffectifModule("wheel", …)` : le Ticket d'Or est un jeu du socle, il
 * n'a pas de clé à lui. Le miroir applicatif doit dire la même chose que
 * `org_has_module_access(…, 'wheel')` en base, sans quoi l'écran ouvrirait un
 * bouton que la RPC refuse.
 */

const NON_AUTHENTIFIE = "Connectez-vous pour accéder au Ticket d'Or.";
const SANS_DROIT =
  "Votre abonnement ne couvre pas les animations. Réactivez-le pour émettre des Tickets d'Or.";
const PAS_LE_ROLE =
  "Seuls le propriétaire et les éditeurs règlent les lots du Ticket d'Or.";

export type GardeTicketOr =
  | { ok: false; error: string }
  | { ok: true; organizationId: string; userId: string; peutRegler: boolean };

/**
 * Membre du commerce + offre active.
 *
 * `peutRegler` distingue les deux gestes de l'écran : tout membre ÉMET, seuls
 * le propriétaire et l'éditeur RÈGLENT les lots.
 */
export async function gardeTicketOr(): Promise<GardeTicketOr> {
  const { user, organization, role } = await getUserAndOrg();
  if (!user || !organization) return { ok: false, error: NON_AUTHENTIFIE };
  if (!droitEffectifModule("wheel", organization)) {
    return { ok: false, error: SANS_DROIT };
  }
  return {
    ok: true,
    organizationId: organization.id,
    userId: user.id,
    peutRegler: role === "owner" || role === "editor",
  };
}

/** Le refus opposé à qui n'a pas le rôle de réglage. */
export const TICKET_PAS_LE_ROLE = PAS_LE_ROLE;

export type ContexteTicketOr =
  | { ok: false; error: string }
  | { ok: true; organizationId: string; peutRegler: boolean; etat: TicketOrView };

/**
 * Les lots et les mesures de l'organisation de la SESSION.
 *
 * UNE PANNE DE LECTURE REND UN ÉTAT VIDE, pas un refus : le commerçant a le
 * droit, il n'a simplement rien à afficher. Confondre les deux lui ferait
 * croire que son abonnement a changé.
 */
export async function loadTicketOr(): Promise<ContexteTicketOr> {
  const garde = await gardeTicketOr();
  if (!garde.ok) return { ok: false, error: garde.error };

  const admin = createAdminClient();
  const { data, error } = await admin.rpc("tickets_or_state", {
    // DE LA SESSION. Jamais d'un paramètre de requête : la RPC vérifie
    // l'appartenance, mais elle la vérifie sur ce qu'on lui donne.
    p_organization_id: garde.organizationId,
  });

  return {
    ok: true,
    organizationId: garde.organizationId,
    peutRegler: garde.peutRegler,
    etat: error ? ticketOrVide() : mapTicketOrState(data),
  };
}
