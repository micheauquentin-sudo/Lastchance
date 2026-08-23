"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { reportError } from "@/lib/monitoring";
import { RATE_LIMITS, rateLimit, rateLimitBucket } from "@/lib/rate-limit";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  gardeTicketOr,
  TICKET_PAS_LE_ROLE,
} from "@/lib/ticket-or-context";
import {
  mapTirage,
  TICKET_JOURS_DEFAUT,
  TICKET_JOURS_MAX,
  TICKET_JOURS_MIN,
  TICKET_LIBELLE_MAX,
  TICKET_POIDS_MAX,
  type EtatTirage,
} from "@/lib/ticket-or";
import type { ActionResult } from "@/lib/utils";

/**
 * LE TICKET D'OR (TKT-1) — les gestes du comptoir et du réglage.
 *
 * ── LE TIRAGE N'EST PAS UNE ACTION SERVEUR ──
 *
 * Il vit dans `tirerTicketOr` ci-dessous, appelé depuis un BOUTON du client —
 * jamais au chargement de la page. Un `GET` qui consomme un ticket serait
 * consommé par un préchargement de navigateur, un antivirus qui suit les
 * liens, ou un simple retour arrière : le client aurait « joué » sans avoir
 * rien touché, et ne pourrait pas le prouver.
 */

const ERREUR = "Une erreur est survenue, réessayez.";
const TROP_DE_TICKETS =
  "Trop de tickets émis en peu de temps. Réessayez dans un instant.";

const idSchema = z.string().uuid("Identifiant invalide");

const lotSchema = z.object({
  libelle: z
    .string()
    .trim()
    .min(1, "Donnez un nom à ce lot")
    .max(TICKET_LIBELLE_MAX, `Nom trop long (${TICKET_LIBELLE_MAX} caractères max)`),
  poids: z.coerce
    .number()
    .int("Le poids est un nombre entier")
    .min(0, "Le poids ne peut pas être négatif")
    .max(TICKET_POIDS_MAX, `Poids trop élevé (${TICKET_POIDS_MAX} max)`),
  /**
   * VIDE = ILLIMITÉ, ET C'EST LE POINT. Un champ vide et un « 0 » saisi sont
   * deux intentions différentes — « je ne compte pas » et « il n'y en a plus ».
   * Les confondre aurait épuisé un café offert au premier tirage.
   */
  stock: z
    .string()
    .trim()
    .transform((valeur) => (valeur === "" ? null : Number(valeur)))
    .refine(
      (valeur) =>
        valeur === null || (Number.isInteger(valeur) && valeur >= 0),
      "Le stock est un nombre entier, ou vide pour illimité",
    ),
  actif: z.string().nullable().transform((valeur) => valeur !== null),
});

/**
 * ÉMETTRE UN TICKET — le geste du comptoir, après une visite constatée.
 *
 * Le code rendu n'est affiché QU'UNE FOIS, à l'écran de caisse : il n'est
 * jamais renvoyé par une lecture ultérieure. C'est ce qui fait qu'un ticket se
 * remet à quelqu'un plutôt qu'il ne se consulte.
 */
export async function emettreTicketOr(
  _prev: ActionResult<{ code: string; expireLe: string | null }> | null,
  formData: FormData,
): Promise<ActionResult<{ code: string; expireLe: string | null }>> {
  const garde = await gardeTicketOr();
  if (!garde.ok) return { ok: false, error: garde.error };

  // APRÈS la garde, sur la clé du locataire — motif `vitrine:slug`. Un ticket
  // est un droit de gain : une boucle en émettrait mille en une minute.
  const autorise = await rateLimit(
    rateLimitBucket("ticket-or:emission", garde.organizationId),
    RATE_LIMITS.ticketOrEmission,
    { failClosed: true },
  );
  if (!autorise) return { ok: false, error: TROP_DE_TICKETS };

  const jours = z.coerce
    .number()
    .int()
    .min(TICKET_JOURS_MIN)
    .max(TICKET_JOURS_MAX)
    .catch(TICKET_JOURS_DEFAUT)
    .parse(formData.get("jours"));

  const admin = createAdminClient();
  const { data, error } = await admin.rpc("emettre_ticket_or", {
    p_organization_id: garde.organizationId,
    p_jours: jours,
  });

  if (error) {
    reportError("ticket-or.emission", error.message);
    return { ok: false, error: ERREUR };
  }

  const doc = (data ?? {}) as Record<string, unknown>;
  if (doc.state !== "ok" || typeof doc.code !== "string") {
    return { ok: false, error: ERREUR };
  }

  revalidatePath("/dashboard/ticket-or");
  return {
    ok: true,
    data: {
      code: doc.code,
      expireLe: typeof doc.expire_le === "string" ? doc.expire_le : null,
    },
  };
}

/**
 * TIRER — le geste du client, au prochain passage.
 *
 * Aucune garde d'organisation ici : la RPC résout le commerce par le CODE, et
 * rend `introuvable` indistinctement pour un code inventé, mal formé, ou dont
 * le commerce n'a plus d'offre. Ce point d'entrée est ouvert à Internet et ne
 * doit rien révéler.
 */
export async function tirerTicketOr(code: string): Promise<EtatTirage> {
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("tirer_ticket_or", { p_code: code });
  if (error) {
    reportError("ticket-or.tirage", error.message);
    return { state: "introuvable" };
  }
  return mapTirage(data);
}

/* ────────────────────────────────────────────────────────────
   Les lots — réservés au propriétaire et à l'éditeur
   ──────────────────────────────────────────────────────────── */

async function gardeReglage() {
  const garde = await gardeTicketOr();
  if (!garde.ok) return garde;
  if (!garde.peutRegler) return { ok: false as const, error: TICKET_PAS_LE_ROLE };
  return garde;
}

export async function creerLotTicketOr(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const garde = await gardeReglage();
  if (!garde.ok) return { ok: false, error: garde.error };

  const parsed = lotSchema.safeParse({
    libelle: formData.get("libelle"),
    poids: formData.get("poids") ?? 1,
    stock: formData.get("stock") ?? "",
    actif: formData.get("actif"),
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0].message };
  }

  const admin = createAdminClient();
  const { error } = await admin.from("tickets_or_lots").insert({
    organization_id: garde.organizationId,
    libelle: parsed.data.libelle,
    poids: parsed.data.poids,
    stock: parsed.data.stock,
    actif: parsed.data.actif,
  });
  if (error) {
    reportError("ticket-or.lot-creation", error.message);
    return { ok: false, error: ERREUR };
  }

  revalidatePath("/dashboard/ticket-or");
  return { ok: true, data: undefined };
}

export async function modifierLotTicketOr(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const garde = await gardeReglage();
  if (!garde.ok) return { ok: false, error: garde.error };

  const id = idSchema.safeParse(formData.get("id"));
  const parsed = lotSchema.safeParse({
    libelle: formData.get("libelle"),
    poids: formData.get("poids") ?? 1,
    stock: formData.get("stock") ?? "",
    actif: formData.get("actif"),
  });
  if (!id.success) return { ok: false, error: id.error.issues[0].message };
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0].message };
  }

  const admin = createAdminClient();
  // LE FILTRE D'ORGANISATION EST EXPLICITE, en plus de l'identifiant : le
  // `service_role` ignore la RLS, et un identifiant posté vient du navigateur.
  const { data, error } = await admin
    .from("tickets_or_lots")
    .update({
      libelle: parsed.data.libelle,
      poids: parsed.data.poids,
      stock: parsed.data.stock,
      actif: parsed.data.actif,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id.data)
    .eq("organization_id", garde.organizationId)
    .select("id")
    .maybeSingle();

  if (error || !data) {
    if (error) reportError("ticket-or.lot-modification", error.message);
    return { ok: false, error: ERREUR };
  }

  revalidatePath("/dashboard/ticket-or");
  return { ok: true, data: undefined };
}

export async function supprimerLotTicketOr(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const garde = await gardeReglage();
  if (!garde.ok) return { ok: false, error: garde.error };

  const id = idSchema.safeParse(formData.get("id"));
  if (!id.success) return { ok: false, error: id.error.issues[0].message };

  const admin = createAdminClient();
  const { error } = await admin
    .from("tickets_or_lots")
    .delete()
    .eq("id", id.data)
    .eq("organization_id", garde.organizationId);

  if (error) {
    reportError("ticket-or.lot-suppression", error.message);
    return { ok: false, error: ERREUR };
  }

  revalidatePath("/dashboard/ticket-or");
  return { ok: true, data: undefined };
}
