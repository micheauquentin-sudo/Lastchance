"use server";

import { revalidatePath } from "next/cache";
import { requireOrganizationOwner } from "@/lib/authorization";
import { loadPlayContext } from "@/lib/play-context";
import { reportError } from "@/lib/monitoring";
import { RATE_LIMITS, rateLimit, rateLimitBucket } from "@/lib/rate-limit";
import { smsStopShortcode } from "@/lib/sms-dispatch";
import { isSmsConfigured } from "@/lib/sms-provider";
import {
  findUnresolvedSuspension,
  isVisibleToMerchant,
  suspensionRefusalMessage,
} from "@/lib/sms-sender-state";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import {
  SMS_CONSENT_VERSION,
  smsConsentSchema,
  smsSenderRequestSchema,
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

/* ════════════════════════════════════════════════════════════
 * L'EXPÉDITEUR — le réglage sans lequel le canal reste INERTE
 *
 * ── LE CONSTAT QUI JUSTIFIE CES DEUX FONCTIONS ──────────────
 *
 * Les quatre RPC d'expéditeur (`request_sms_sender`, `declare_sms_sender`,
 * `set_sms_sender_status`, `sms_sender_for_send`) n'avaient AUCUN appelant
 * applicatif. Sans expéditeur déclaré, `sms_sender_for_send` rend `null` et
 * `claim_sms_delivery` refuse tout : aucune variable d'environnement, aucun
 * crédit, aucun consentement ne pouvait faire partir un seul message. Le socle
 * était complet et la porte d'entrée n'existait pas.
 *
 * ── POURQUOI LE CLIENT ADMIN DERRIÈRE UNE GARDE D'ACTION ────
 *
 * `request_sms_sender` est `security definer`, `grant execute` à `service_role`
 * SEUL, et lève « not authorized » pour tout autre rôle. C'est le motif
 * standard du dépôt : l'action contrôle elle-même l'appartenance et le rôle,
 * puis appelle la RPC avec le client admin.
 *
 * ── DEUX DES QUATRE RPC RESTENT SANS APPELANT, ET C'EST VOULU ──
 *
 * `declare_sms_sender` et `set_sms_sender_status` appartiennent à la
 * PLATEFORME : la déclaration au registre AF2M exige une référence de
 * registre, et la migration `20260824120000` sépare les deux portes très
 * exactement pour que la déclaration ne soit pas « un champ que le commerçant
 * remplit lui-même ». Leur donner une action commerçant annulerait cette
 * propriété de sécurité.
 * ════════════════════════════════════════════════════════════ */

/** Un expéditeur tel qu'il est montré au commerçant. */
export interface SmsSenderView {
  senderId: string;
  /** `pending` | `declared` | `rejected` | `suspended`. */
  status: string;
  statusReason: string | null;
  declaredAt: string | null;
  /**
   * Le retrait, remonté à l'écran plutôt que filtré en SQL : c'est lui qui,
   * combiné au statut, distingue « retiré » de « suspendu puis retiré ».
   */
  retiredAt: string | null;
}

/** Un mouvement du grand livre, tel qu'il est montré au commerçant. */
export interface SmsCreditMovement {
  id: string;
  createdAt: string;
  deltaUnits: number;
  reason: string;
}

export interface SmsSettings {
  /** Une clé de prestataire est-elle posée ? Aucune valeur n'est exposée. */
  providerConfigured: boolean;
  /** Le numéro court du STOP, s'il est connu — il s'imprime sur les messages. */
  stopShortcode: string | null;
  /**
   * Les expéditeurs encore utiles au commerçant, le déclaré d'abord : les non
   * retirés, PLUS les suspensions retirées — celles-ci sont la seule trace à
   * l'écran de ce qui bloque toutes ses demandes suivantes.
   *
   * Une liste et non une valeur : l'index unique de `sms_senders` est PARTIEL
   * à dessein — un `pending` coexiste avec le `declared` en service pendant le
   * délai de déclaration d'un changement d'enseigne. N'en montrer qu'un
   * cacherait au commerçant la demande qu'il vient de déposer, et il la
   * redéposerait.
   */
  senders: SmsSenderView[];
  balanceUnits: number;
  movements: SmsCreditMovement[];
  activeConsents: number;
  /**
   * La lecture a échoué quelque part.
   *
   * Distinct d'un solde à zéro, et c'est tout l'intérêt : afficher « 0 crédit »
   * sur une panne de lecture ferait croire à un commerçant que son canal est
   * vide alors qu'il ne l'est pas.
   */
  unavailable: boolean;
}

/** Combien de mouvements du grand livre sont remontés à l'écran. */
const MOVEMENT_LIMIT = 20;

/**
 * Demande un expéditeur alphanumérique pour l'organisation active.
 *
 * RÔLE EXIGÉ : propriétaire. Aligné sur les autres réglages qui engagent
 * l'IDENTITÉ de l'établissement — le logo (`branding.ts`), le webhook sortant,
 * la confidentialité passent tous par `requireOrganizationOwner`. Et la
 * lecture de `sms_senders` est elle-même réservée au propriétaire par sa
 * policy : ouvrir l'écriture à un éditeur lui donnerait le droit de changer un
 * nom qu'il ne peut pas lire.
 *
 * La demande ne DÉCLARE rien : l'état initial est `pending`, et rien ne part
 * tant que la plateforme n'a pas déclaré le nom au registre AF2M.
 */
export async function requestSmsSender(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const { user, organization } = await requireOrganizationOwner();

  const parsed = smsSenderRequestSchema.safeParse({
    sender_id: formData.get("sender_id") ?? "",
  });
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Formulaire invalide",
    };
  }

  // Clé d'OPÉRATEUR authentifié, résolue avant le seau : `failClosed` est
  // légitime au sens de l'ADR-032, la saturer ne coupe que son porteur.
  const allowed = await rateLimit(
    rateLimitBucket("sms:sender", organization.id, user.id),
    RATE_LIMITS.smsSenderRequest,
    { failClosed: true },
  );
  if (!allowed) {
    return {
      ok: false,
      error: "Trop de demandes rapprochées. Réessayez plus tard.",
    };
  }

  // ── LE CLIC QUI NE FAISAIT RIEN ───────────────────────────
  //
  // Depuis 20260828120000, `request_sms_sender` ne touche PAS une ligne
  // suspendue : elle rend son identifiant sans rien réécrire. Depuis
  // 20260829120000, `declare_sms_sender` refuse tant que l'organisation porte
  // une suspension non résolue, quel que soit le nom demandé. Les deux gardes
  // sont justes — et vues de l'écran, elles produisaient un NO-OP MUET : le
  // propriétaire cliquait, la RPC rendait « ok », rien ne changeait, rien ne
  // le lui disait. Il recommençait, puis concluait à une panne du produit.
  //
  // On lit donc l'état AVANT d'appeler, pour pouvoir DIRE le refus. Ce n'est
  // pas la garde — elle est en base, et le reste : c'est sa traduction. Une
  // course entre cette lecture et la RPC ne peut produire qu'un message, la
  // base tranchant toujours.
  const supabase = await createClient();
  const { data: suspensionRows, error: suspensionError } = await supabase
    .from("sms_senders")
    .select("sender_id, status, retired_at")
    .eq("organization_id", organization.id)
    .eq("status", "suspended")
    .limit(1);

  if (suspensionError) {
    reportError("sms.sender.suspension", suspensionError.message);
    return { ok: false, error: "Enregistrement de l'expéditeur impossible" };
  }

  const suspension = findUnresolvedSuspension(
    (suspensionRows ?? []).map((row) => ({
      senderId: row.sender_id,
      status: row.status,
      retiredAt: row.retired_at,
    })),
  );
  if (suspension) {
    return { ok: false, error: suspensionRefusalMessage(suspension.senderId) };
  }

  const admin = createAdminClient();
  const { error } = await admin.rpc("request_sms_sender", {
    p_organization_id: organization.id,
    p_sender_id: parsed.data.sender_id,
  });

  if (error) {
    // La RPC cite le nom refusé dans son message ; il vient du commerçant
    // lui-même, mais on ne le renvoie pas tel quel — Zod a déjà dit ce qu'il
    // fallait corriger, et le seul refus restant est celui de la base.
    reportError("sms.sender.request", error.message);
    return { ok: false, error: "Enregistrement de l'expéditeur impossible" };
  }

  revalidatePath("/dashboard/settings");
  // L'écran qui AFFICHE l'expéditeur, et le seul depuis lequel on le demande.
  // Il n'existait pas quand cette ligne a été écrite : sans lui, le
  // propriétaire soumettait sa demande et relisait « aucun expéditeur ».
  revalidatePath("/dashboard/settings/sms");
  return { ok: true, data: undefined };
}

/**
 * L'état du canal SMS d'une organisation.
 *
 * PAS DE SEAU DE LIMITATION ici, et c'est délibéré : c'est une LECTURE, servie
 * à l'affichage d'un écran de réglages. Un seau la ferait tomber en panne
 * précisément quand le propriétaire recharge sa page — et il ne protégerait
 * rien qu'une garde `owner` et les policies de lecture ne protègent déjà.
 *
 * Les quatre lectures passent par le client RLS et non par le client admin :
 * les policies `*_owner_read` de `20260824120000` / `20260825120000` sont ici
 * une seconde barrière gratuite, alors que le client admin les contournerait.
 */
export async function loadSmsSettings(): Promise<SmsSettings> {
  const { organization } = await requireOrganizationOwner();
  const supabase = await createClient();

  const [sendersResult, creditsResult, movementsResult, consentsResult] =
    await Promise.all([
      supabase
        .from("sms_senders")
        .select("sender_id, status, status_reason, declared_at, retired_at")
        .eq("organization_id", organization.id)
        // `retired_at is null` N'EST PLUS UN FILTRE SQL, et c'est le correctif.
        // `set_sms_sender_status(…, 'retired')` conserve le statut : une ligne
        // suspendue puis retirée porte encore `status = 'suspended'`. Le filtre
        // la faisait disparaître, et l'écran annonçait « aucun expéditeur
        // demandé » à une organisation dont TOUTES les demandes suivantes sont
        // refusées en base. Le tri des lignes retirées à conserver revient à
        // `isVisibleToMerchant`, seul endroit où cette règle est écrite.
        .order("status", { ascending: true })
        .order("created_at", { ascending: false }),
      supabase
        .from("sms_credits")
        .select("balance_units")
        .eq("organization_id", organization.id)
        .maybeSingle(),
      supabase
        .from("sms_credit_entries")
        .select("id, created_at, delta_units, reason")
        .eq("organization_id", organization.id)
        .order("created_at", { ascending: false })
        .limit(MOVEMENT_LIMIT),
      supabase
        .from("sms_consents")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", organization.id)
        .is("revoked_at", null),
    ]);

  const failures = [
    sendersResult.error,
    creditsResult.error,
    movementsResult.error,
    consentsResult.error,
  ].filter((error) => error !== null);

  for (const failure of failures) reportError("sms.settings", failure.message);

  const senders: SmsSenderView[] = (sendersResult.data ?? [])
    .map((row) => ({
      senderId: row.sender_id,
      status: row.status,
      statusReason: row.status_reason,
      declaredAt: row.declared_at,
      retiredAt: row.retired_at,
    }))
    .filter((sender) =>
      isVisibleToMerchant({
        senderId: sender.senderId,
        status: sender.status,
        retiredAt: sender.retiredAt,
      }),
    );

  return {
    providerConfigured: isSmsConfigured(),
    stopShortcode: smsStopShortcode(),
    // `declared` précède `pending` par ordre alphabétique : le tri SQL suffit,
    // et l'expéditeur EN SERVICE arrive en tête.
    senders,
    balanceUnits: creditsResult.data?.balance_units ?? 0,
    movements: (movementsResult.data ?? []).map((row) => ({
      id: row.id,
      createdAt: row.created_at,
      deltaUnits: row.delta_units,
      reason: row.reason,
    })),
    activeConsents: consentsResult.count ?? 0,
    unavailable: failures.length > 0,
  };
}
