"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { getUserAndOrg } from "@/lib/auth";
import {
  ajouterRappelFerme,
  cleRappelValide,
  RAPPELS_COOKIE,
} from "@/lib/rappels";

/** Six mois : au-delà, le rappel a de toute façon changé de version. */
const DUREE_SECONDES = 180 * 24 * 60 * 60;

/**
 * Ferme un rappel informatif du tableau de bord.
 *
 * ── Retour silencieux, et pourquoi ──
 *
 * Cette action ne rend rien et n'affiche jamais d'erreur : elle ne modifie
 * aucune donnée du commerce, seulement une préférence d'affichage. Une clé
 * malformée ou une session expirée ne méritent pas un message — dans le pire
 * des cas le bandeau reste, ce qui est exactement l'état d'avant le clic.
 *
 * ── La session est vérifiée quand même ──
 *
 * Le cookie est `httpOnly` et lu par le layout : sans garde, n'importe quelle
 * requête anonyme pourrait en poser un et faire taire des bandeaux chez le
 * prochain visiteur de ce navigateur. Même garde que les autres actions du
 * tableau de bord (`getUserAndOrg`), sans redirection : on se tait, c'est tout.
 */
export async function fermerRappel(formData: FormData): Promise<void> {
  const cle = formData.get("cle");
  if (!cleRappelValide(cle)) return;

  const { user, organization } = await getUserAndOrg();
  if (!user || !organization) return;

  const boite = await cookies();
  boite.set(RAPPELS_COOKIE, ajouterRappelFerme(boite.get(RAPPELS_COOKIE)?.value, cle), {
    maxAge: DUREE_SECONDES,
    // `/dashboard` et pas `/` : les seuls lecteurs (le layout, la page) et cette
    // action vivent sous ce préfixe. Un cookie en `/` repartait dans CHAQUE
    // requête publique — /play, /pronos, /scan, /api — en y portant l'UUID de
    // l'organisation et des signaux commerciaux qui n'y ont rien à faire.
    path: "/dashboard",
    sameSite: "lax",
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
  });

  // C'est le LAYOUT qui rend les bandeaux, pas la page : sans le second
  // argument, la page se régénérerait et le bandeau resterait affiché.
  revalidatePath("/dashboard", "layout");
}
