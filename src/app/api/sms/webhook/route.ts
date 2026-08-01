import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { optionalEnv } from "@/lib/env";
import {
  monitored,
  recordCounter,
  reportError,
  reportSecurityEvent,
} from "@/lib/monitoring";
import { observeSharedKey, rateLimitBucket } from "@/lib/rate-limit";
import { normalizeSmsPhone } from "@/lib/sms-dispatch";
import { createAdminClient } from "@/lib/supabase/admin";

/* ════════════════════════════════════════════════════════════
 * RÉCEPTION DU « STOP »
 *
 * ── POURQUOI CETTE ROUTE EXISTE ─────────────────────────────
 *
 * Un expéditeur alphanumérique NE PEUT PAS recevoir de réponse. Le « STOP »
 * du client n'arrive donc jamais chez le commerçant : il arrive sur le numéro
 * court du prestataire, qui nous le relaie ici. Sans cette route, un client
 * qui répond STOP continue de recevoir des SMS — c'est-à-dire que le produit
 * est illégal.
 *
 * Traitée avec le soin d'un webhook de paiement, sur la forme de
 * `src/app/api/stripe/webhook/route.ts` : authentification de l'appel,
 * idempotence, aucun oracle. Avec DEUX DIFFÉRENCES, chacune motivée.
 *
 *   • Pas de signature HMAC. Brevo ne signe pas ses webhooks : il n'expose
 *     qu'une URL qu'on choisit. Le secret voyage donc dans l'appel lui-même
 *     (en-tête, ou paramètre d'URL quand la console du prestataire ne permet
 *     pas d'en-tête), et la comparaison est à temps constant.
 *
 *   • JAMAIS de refus par limite de débit. Ailleurs on ferme la porte ; ici
 *     la conséquence d'un refus est un client qui a demandé l'arrêt et
 *     continue d'être démarché. On OBSERVE (ADR-032), on ne bloque pas.
 *
 * ── L'IDEMPOTENCE VIENT DE LA BASE ──────────────────────────
 *
 * Aucune table d'événements ici, contrairement à Stripe. `revoke_sms_consent`
 * est idempotente par construction : son `where revoked_at is null` fait
 * qu'un second STOP ne touche aucune ligne et surtout NE REPOUSSE PAS la date
 * du premier retrait, qui est la preuve du moment où les envois cessent
 * d'être légitimes. Dédupliquer en amont n'ajouterait rien et ferait dépendre
 * une garantie légale d'un identifiant d'événement fourni par un tiers.
 * ════════════════════════════════════════════════════════════ */

export const dynamic = "force-dynamic";

/** Événements de désabonnement, quel que soit le vocabulaire du prestataire. */
const STOP_EVENTS = new Set([
  "unsubscribe",
  "unsubscribed",
  "blocked",
  "blacklisted",
  "stop",
  "spam",
]);

/**
 * Ce qu'un client écrit pour se désinscrire. « STOP » est la mention légale,
 * les autres formes sont ce que les gens tapent réellement. Ancré en tête :
 * un message qui PARLE de stop (« stop, c'est génial ») n'est pas un retrait.
 */
const STOP_WORDS = /^\s*(stop|stopsms|stop sms|arret|arrêt|desabo|désabo)\b/i;

export async function POST(request: Request) {
  return monitored("sms.webhook", () => handleSmsWebhook(request));
}

async function handleSmsWebhook(request: Request) {
  const secret = optionalEnv("BREVO_WEBHOOK_SECRET");
  if (!secret) {
    reportError("sms.webhook", "BREVO_WEBHOOK_SECRET manquant");
    return NextResponse.json({ error: "Non configuré" }, { status: 500 });
  }

  if (!authorized(request, secret)) {
    reportSecurityEvent("sms_webhook_invalid_token");
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }

  // Observation seule : voir l'en-tête. Un pic anormal doit se voir sans
  // jamais faire tomber un retrait de consentement.
  await observeSharedKey(
    rateLimitBucket("sms-webhook"),
    { limit: 300, windowSeconds: 60 },
    "sms_webhook_burst",
  );

  let payload: Record<string, unknown>;
  try {
    payload = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Corps illisible" }, { status: 400 });
  }

  const text = firstString(payload, ["text", "message", "content"]);
  const kind = text ? "reply" : "event";

  if (!isStop(payload, text)) {
    /* Accusés de livraison et autres événements : acquittés sans agir.
     *
     * On ne s'en sert PAS pour clore une ligne d'envoi, et c'est délibéré :
     * `finish_sms_delivery` n'agit que sur une ligne `sending`, or le worker
     * a déjà clos la sienne. Un accusé tardif ne doit pas rouvrir une ligne
     * close — ce serait rendre le renvoi possible et, sur un second passage
     * en échec définitif, tenter un second remboursement.
     */
    recordCounter("sms.webhook.ignored");
    return NextResponse.json({ received: true });
  }

  const phone = extractPhone(payload, kind);
  if (!phone) {
    recordCounter("sms.stop.unreadable");
    // 200 : le prestataire ne peut rien y faire, le rejouer ne réparerait
    // rien. C'est nous qui devons regarder le compteur.
    return NextResponse.json({ received: true });
  }

  try {
    const admin = createAdminClient();

    // Normalisation par LA fonction de la base — jamais en TypeScript.
    const e164 = await normalizeSmsPhone(admin, phone);
    if (!e164) {
      recordCounter("sms.stop.unreadable");
      return NextResponse.json({ received: true });
    }

    /* QUELLE ORGANISATION ?
     *
     * Le STOP arrive sur le numéro court du prestataire, qui ne dit pas de
     * quel commerçant il s'agit. Le seul rattachement fiable est le message
     * auquel la personne RÉPOND : la dernière ligne d'envoi vers ce numéro.
     *
     * Le consentement est par (organisation, numéro) — un consentement donné
     * à une boulangerie ne vaut pas pour un garage — donc retirer partout
     * détruirait des consentements que la personne n'a pas visés. Arbitrage
     * remonté au client dans le rapport : c'est une décision produit, et
     * l'autre lecture (« STOP = plus rien, de personne ») est défendable.
     */
    const { data: rows, error } = await admin
      .from("sms_log")
      .select("organization_id")
      .eq("recipient_key", e164)
      .order("created_at", { ascending: false })
      .limit(1);

    if (error) {
      reportError("sms.webhook.lookup", error.message);
      // 500 VOLONTAIRE : le prestataire retentera. Perdre un STOP sur une
      // panne de base nous laisserait démarcher quelqu'un qui a demandé
      // l'arrêt — le seul cas où faire échouer bruyamment est le bon choix.
      return NextResponse.json({ error: "Erreur interne" }, { status: 500 });
    }

    const organizationId = (
      rows as Array<{ organization_id: string }> | null
    )?.[0]?.organization_id;

    if (!organizationId) {
      // Numéro qu'on n'a jamais contacté. Réponse IDENTIQUE au cas nominal :
      // ce point d'entrée ne dit jamais si un numéro nous est connu.
      recordCounter("sms.stop.unmatched");
      return NextResponse.json({ received: true });
    }

    const { data: revoked, error: revokeError } = await admin.rpc(
      "revoke_sms_consent",
      {
        p_organization_id: organizationId,
        p_phone: e164,
        p_reason: "stop",
      },
    );

    if (revokeError) {
      reportError("sms.webhook.revoke", revokeError.message);
      return NextResponse.json({ error: "Erreur interne" }, { status: 500 });
    }

    // `false` = déjà retiré. Un second STOP est normal et n'est pas un échec.
    recordCounter(revoked === true ? "sms.stop.revoked" : "sms.stop.repeated");

    return NextResponse.json({ received: true });
  } catch (err) {
    reportError("sms.webhook", err);
    return NextResponse.json({ error: "Erreur interne" }, { status: 500 });
  }
}

/**
 * Le secret, en en-tête ou à défaut en paramètre d'URL.
 *
 * Comparaison à temps constant, et longueurs comparées d'abord —
 * `timingSafeEqual` lève sur des tailles différentes.
 */
function authorized(request: Request, secret: string): boolean {
  const header = request.headers.get("x-lastchance-sms-token");
  const token =
    header ?? new URL(request.url).searchParams.get("token") ?? null;
  if (!token) return false;

  const provided = Buffer.from(token);
  const expected = Buffer.from(secret);
  return (
    provided.length === expected.length && timingSafeEqual(provided, expected)
  );
}

function firstString(
  payload: Record<string, unknown>,
  keys: string[],
): string | null {
  for (const key of keys) {
    const value = payload[key];
    if (typeof value === "string" && value.trim().length > 0) {
      return value.trim();
    }
  }
  return null;
}

function isStop(payload: Record<string, unknown>, text: string | null): boolean {
  const event = String(payload.event ?? payload.type ?? "")
    .trim()
    .toLowerCase();
  if (STOP_EVENTS.has(event)) return true;
  return text !== null && STOP_WORDS.test(text);
}

/**
 * Le numéro du CLIENT, qui n'est pas au même endroit selon la nature du
 * message.
 *
 * Sur une réponse entrante, `from` est le client et `to` le numéro court du
 * prestataire : les intervertir retirerait le consentement… du numéro court.
 * Sur un événement de livraison, c'est l'inverse — le client est la
 * destination.
 */
function extractPhone(
  payload: Record<string, unknown>,
  kind: "reply" | "event",
): string | null {
  const keys =
    kind === "reply"
      ? ["from", "msisdn", "sender", "originator"]
      : ["msisdn", "to", "recipient", "phone", "number"];
  return firstString(payload, keys);
}
