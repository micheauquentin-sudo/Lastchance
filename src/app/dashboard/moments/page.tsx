import type { Metadata } from "next";

import { PageAgenda } from "@/app/dashboard/reservations/page";

export const metadata: Metadata = { title: "Moments" };

/**
 * LA ROUTE « MOMENTS » — ateliers, dégustations, files d'accueil, invitations,
 * offres de dernière minute.
 *
 * ── LE MÊME CORPS DE PAGE QUE « RÉSERVATION », ET C'EST VOULU ──
 *
 * Les deux produits partagent les MÊMES tables : ce qui les sépare est
 * `reservation_activities.booking_mode`, jamais un second schéma. Dupliquer
 * 270 lignes d'écran pour un filtre aurait créé deux pages à tenir d'accord,
 * qui auraient divergé au premier ajustement.
 *
 * `PageAgenda` porte donc le corps, et chaque route lui dit lequel des deux
 * elle est. Le droit suit : `reserver` ici — la clé n'a pas changé de sens le
 * jour où son libellé est devenu « Moments » — et `rendez_vous` là-bas.
 */
export default async function MomentsPage() {
  return <PageAgenda mode="moment" />;
}
