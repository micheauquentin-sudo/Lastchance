"use server";

import { loadPlayContext } from "@/lib/play-context";
import { reportError } from "@/lib/monitoring";
import { rateLimit, rateLimitBucket } from "@/lib/rate-limit";
import {
  SMS_CONSENT_VERSION,
  smsConsentSchema,
} from "@/lib/validations/sms";
import type { ActionResult } from "@/lib/utils";

/* ════════════════════════════════════════════════════════════
 * ENREGISTREMENT DU CONSENTEMENT SMS
 *
 * ── OÙ CETTE ACTION SE POSE ─────────────────────────────────
 *
 * Sur le parcours joueur `/play/[slug]`, à côté du champ téléphone déjà
 * piloté par `campaigns.collect_phone`. C'est le seul endroit où la personne
 * concernée est présente : un consentement recueilli ailleurs — par le
 * commerçant, dans son tableau de bord — serait un commerçant qui coche une
 * case à la place de son client, ce qui n'est pas un consentement.
 *
 * ── L'ORGANISATION NE VIENT PAS DU CLIENT ───────────────────
 *
 * Elle est résolue côté serveur depuis le slug. Accepter un identifiant
 * d'organisation dans le formulaire laisserait n'importe qui inscrire
 * n'importe quel numéro sur la liste de n'importe quel commerçant.
 *
 * ── LA CASE N'EST JAMAIS PRÉ-COCHÉE ─────────────────────────
 *
 * Décision du client, et c'est aussi la loi : un consentement pré-coché n'en
 * est pas un. Ce fichier ne peut pas garantir le rendu de la case — il
 * garantit ce qu'il peut : `opt_in` non vrai ne produit AUCUNE écriture.
 * `smsConsentSchema` refuse `false`, et la garde ci-dessous sort avant même
 * de valider. Le câblage de l'écran revient à `frontend-ui` ; la signature
 * est en bas de ce fichier.
 * ════════════════════════════════════════════════════════════ */

/**
 * Enregistre le consentement SMS d'un joueur.
 *
 * Champs attendus dans le `FormData` :
 *   - `slug`         slug du QR de jeu (résout l'organisation, serveur seul)
 *   - `phone`        numéro tel que saisi (la base le normalise)
 *   - `sms_opt_in`   « on » si la case est cochée — ABSENT sinon
 *
 * Rend `{ ok: true }` uniquement si un consentement a été écrit.
 */
export async function submitSmsConsent(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const slug = String(formData.get("slug") ?? "").trim();
  const phone = String(formData.get("phone") ?? "");
  // Une case non cochée n'est pas envoyée par le navigateur : son absence EST
  // le refus. On ne cherche donc pas « false », on exige « on ».
  const optIn = formData.get("sms_opt_in") === "on";

  if (!optIn) {
    // Pas une erreur de formulaire : une absence de consentement. Rien n'est
    // écrit, et surtout rien n'est écrit qui dirait « a refusé » — le socle
    // ne modélise que le consentement donné puis retiré.
    return { ok: false, error: "Le consentement SMS doit être coché" };
  }

  const parsed = smsConsentSchema.safeParse({ phone, opt_in: optIn });
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Formulaire invalide",
    };
  }

  // Clé d'identité (le numéro) : `failClosed` est autorisé par l'ADR-032 sur
  // ce type de clé. Ce qu'on borne ici est l'écriture répétée de consentements
  // depuis un formulaire public.
  const allowed = await rateLimit(
    rateLimitBucket("sms-consent", slug, parsed.data.phone),
    // Règle locale plutôt qu'une entrée de `RATE_LIMITS` : ce seuil ne sert
    // qu'ici, et une constante partagée invite à la réutiliser là où elle ne
    // conviendrait pas. Cinq consentements par heure pour un même numéro sur
    // une même campagne — largement au-dessus de tout usage réel.
    { limit: 5, windowSeconds: 3600 },
    { failClosed: true },
  );
  if (!allowed) {
    return { ok: false, error: "Trop de tentatives, réessayez plus tard" };
  }

  const ctx = await loadPlayContext(slug);
  if (!ctx.ok) {
    return { ok: false, error: "Campagne indisponible" };
  }

  // `p_renew` N'EST PAS PASSÉ, donc `false`. Un numéro qui a demandé l'arrêt
  // n'est jamais réactivé par une simple case cochée sur un formulaire : la
  // RPC lève, et c'est le comportement voulu. Le réactiver silencieusement
  // annulerait le STOP que la personne a envoyé.
  const { error } = await ctx.admin.rpc("record_sms_consent", {
    p_organization_id: ctx.qr.organization_id,
    p_phone: parsed.data.phone,
    p_consent_version: SMS_CONSENT_VERSION,
    p_consent_source: "play",
  });

  if (error) {
    // Le message de la RPC peut citer une date de retrait : on ne le rend pas
    // tel quel à un écran public, et on ne journalise pas le numéro.
    reportError("sms.consent", error.message);
    return {
      ok: false,
      error: "Enregistrement du consentement SMS impossible",
    };
  }

  return { ok: true, data: undefined };
}
