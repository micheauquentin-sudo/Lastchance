import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { getUserAndOrg } from "@/lib/auth";
import { loadTicketOr } from "@/lib/ticket-or-context";
import { TicketStudio } from "@/components/ticket/ticket-studio";

export const metadata: Metadata = { title: "Mon studio — Ticket d'Or" };

/**
 * LE STUDIO DU TICKET D'OR (VIT-45) — plein écran, HORS du tableau de bord.
 *
 * ── POURQUOI CETTE ROUTE N'EST PAS SOUS `/dashboard` ──
 *
 * Ce n'est pas un choix d'URL, c'est ce qui fait DISPARAÎTRE la colonne de
 * navigation : `/dashboard/layout.tsx` la pose sur tout ce qu'il contient, et
 * un studio qui garde le menu à gauche n'a plus la largeur de son aperçu. C'est
 * le motif de `/vitrine-studio`, de `/poster/[id]`, de `/studio/calendrier`, de
 * `/studio/chasse` et de `/studio/fidelite`.
 *
 * ── ET POURQUOI ELLE N'A PAS D'IDENTIFIANT ──
 *
 * Les lots du Ticket d'Or appartiennent à l'ORGANISATION, pas à une campagne :
 * `tickets_or_lots` porte `organization_id` et rien d'autre. Il n'y a donc rien
 * à mettre dans un `[id]`, et en poser un aurait ouvert une deuxième manière
 * de désigner un commerce — celle qui vient du navigateur, la seule que la
 * garde ne connaît pas.
 *
 * ── LA REVALIDATION EST UN DÉFAUT DÉJÀ PAYÉ QUATRE FOIS ──
 *
 * Vivant hors de `/dashboard`, cette page n'est atteinte par AUCUN des
 * `revalidatePath("/dashboard/ticket-or")` de `src/actions/ticket-or.ts` — Next
 * revalide un CHEMIN, pas une ressource. C'est le défaut VIT-37, puis VIT-39,
 * puis VIT-41, puis VIT-42, mot pour mot : un enregistrement qui réussit sans
 * jamais apparaître, sur l'écran même où l'on vient vérifier. Chacune des
 * revalidations de l'action a donc son jumeau `/studio/ticket-or`, et
 * `revalidation-studio.test.ts` échoue s'il en manque un.
 *
 * ── LE REFUS RENVOIE AU TABLEAU DE BORD, IL NE DISPARAÎT PAS ──
 *
 * `notFound()` aurait dit « cette page n'existe pas » à un commerçant dont
 * l'abonnement vient d'expirer — ce qui est faux, et ne lui apprend pas quoi
 * faire. `/dashboard/ticket-or` porte déjà la phrase exacte (« Votre abonnement
 * ne couvre pas les animations. Réactivez-le… ») : c'est là qu'on l'envoie, et
 * il n'y a qu'un seul texte de refus à tenir.
 */
export default async function StudioTicketOrPage() {
  const { user, organization } = await getUserAndOrg();
  if (!user) redirect("/login");
  if (!organization) redirect("/onboarding");

  const ctx = await loadTicketOr();
  if (!ctx.ok) redirect("/dashboard/ticket-or");

  return <TicketStudio lots={ctx.etat.lots} peutRegler={ctx.peutRegler} />;
}
