import "server-only";

import { reportError } from "@/lib/monitoring";
import type {
  SmsProvider,
  SmsSendOutcome,
  SmsSendRequest,
} from "@/lib/sms-provider";

/* ════════════════════════════════════════════════════════════
 * BREVO — le seul module qui sache que le prestataire s'appelle Brevo
 *
 * REST pur, aucune dépendance npm : le SDK Brevo tire une couche de
 * génération OpenAPI pour un unique appel POST. Même arbitrage que
 * `src/lib/upstash.ts` et `src/lib/turnstile.ts`.
 * ════════════════════════════════════════════════════════════ */

const BREVO_SMS_URL = "https://api.brevo.com/v3/transactionalSMS/send";

/**
 * Dix secondes. Au-delà, on ne sait plus si le message est parti — et ce
 * doute a un coût qu'on assume plus bas (voir « LE DOUTE DU DÉLAI »).
 */
const TIMEOUT_MS = 10_000;

/* ── LA FRONTIÈRE : temporaire ou définitif ──────────────────
 *
 * La règle, et elle tient en une phrase :
 *
 *   DÉFINITIF  = rejouer la MÊME requête donnerait la MÊME réponse.
 *   TEMPORAIRE = rejouer la même requête pourrait réussir plus tard.
 *
 * Appliquée au protocole, elle donne un partage net : un 4xx dit que la
 * REQUÊTE est fautive, et une requête fautive le restera — sauf si ce dont
 * elle se plaint n'est pas le message mais NOTRE COMPTE. Un quota épuisé, une
 * clé révoquée, une permission manquante : rien de tout cela ne concerne le
 * numéro, tout cela se répare, et le message doit partir une fois réparé.
 *
 * D'où l'ordre de lecture ci-dessous : le CODE d'abord (il parle du compte),
 * le STATUT ensuite (il parle de la requête). L'inverse classerait
 * « not_enough_credits », rendu en HTTP 400, comme un numéro invalide — et
 * rembourserait un message parfaitement envoyable en s'interdisant de le
 * renvoyer.
 */

/**
 * Codes Brevo qui parlent de NOTRE COMPTE et jamais du destinataire.
 * Tous temporaires : ils décrivent un état réparable de la plateforme.
 */
const ACCOUNT_ERROR_CODES = new Set([
  "unauthorized",
  "permission_denied",
  "reseller_permission_denied",
  "not_enough_credits",
  "account_under_validation",
]);

/**
 * Statuts HTTP qui ne mettent en cause ni le numéro ni le contenu.
 * 408 délai, 429 débit, 401/403 identité — tous réparables ou passagers.
 */
const TEMPORARY_HTTP_STATUSES = new Set([401, 403, 408, 425, 429]);

/**
 * Le classement, isolé et pur pour être éprouvable sans réseau.
 *
 * `httpStatus === null` = on n'a jamais eu de réponse (coupure, délai). C'est
 * le cas le plus temporaire qui soit : rien ne dit que la requête était
 * mauvaise, seulement qu'elle n'est pas arrivée.
 */
export function classifyBrevoFailure(params: {
  httpStatus: number | null;
  code: string | null;
}): "failed" | "undeliverable" {
  const { httpStatus, code } = params;

  // Aucune réponse : panne réseau ou délai dépassé.
  if (httpStatus === null) return "failed";

  // Le compte, pas le message — lu AVANT le statut, voir plus haut.
  if (code && ACCOUNT_ERROR_CODES.has(code)) return "failed";

  if (TEMPORARY_HTTP_STATUSES.has(httpStatus)) return "failed";

  // Panne du prestataire.
  if (httpStatus >= 500) return "failed";

  // Toute autre requête refusée : « invalid_parameter » sur un numéro qui
  // n'existe pas, « missing_parameter » sur un contenu vide, un expéditeur
  // que le registre ne connaît pas. Rejouer à l'identique redonnerait le même
  // refus — et c'est très exactement ce qui ferait boucler un numéro mort
  // jusqu'au plafond de tentatives, en tenant un crédit qui ne sera jamais
  // rendu.
  if (httpStatus >= 400) return "undeliverable";

  // Un 2xx/3xx qui atterrit ici est une réponse qu'on n'a pas su lire : on ne
  // rembourse pas sur une incompréhension, on retentera.
  return "failed";
}

/**
 * Le numéro sur le fil.
 *
 * Brevo attend l'international SANS le « + » (« 33612345678 »). Retirer ce
 * signe n'est PAS une normalisation : rien n'est déduit, aucun indicatif
 * n'est présumé, aucune forme n'est reconnue — c'est un encodage de
 * transport, appliqué au dernier moment, sur un numéro que la base a déjà
 * normalisé. La distinction compte : le jour où quelqu'un voudra « réparer »
 * un numéro ici, il verra que cette fonction ne sait rien réparer.
 */
export function brevoWireRecipient(e164: string): string {
  return e164.startsWith("+") ? e164.slice(1) : e164;
}

/**
 * Nettoie un message de prestataire avant qu'il n'atteigne `sms_log.last_error`.
 *
 * Brevo cite volontiers le numéro fautif dans son message d'erreur — « Invalid
 * phone number: 33612345678 ». Recopié tel quel, ce message écrit une donnée
 * personnelle dans une colonne que la purge RGPD ne visait pas et que le
 * propriétaire de l'organisation peut lire. On remplace donc toute suite d'au
 * moins six chiffres, et on borne à la longueur qu'accepte le CHECK (500),
 * avec de la marge.
 */
export function scrubProviderError(message: string): string {
  return message
    .replace(/\+?\d[\d\s.()-]{5,}\d/g, "[numéro]")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 300);
}

interface BrevoSendResponse {
  reference?: string;
  messageId?: number | string;
  smsCount?: number;
}

interface BrevoErrorResponse {
  code?: string;
  message?: string;
}

/**
 * L'adaptateur. La clé lui est passée par `getSmsProvider()` ; il ne la lit
 * pas lui-même et ne l'écrit nulle part.
 */
export function brevoSmsProvider(apiKey: string): SmsProvider {
  return {
    name: "brevo",

    async send(request: SmsSendRequest): Promise<SmsSendOutcome> {
      const body = {
        // Brevo distingue les deux catégories, et l'obligation de mention de
        // désinscription ne porte que sur la première. La déclarer
        // honnêtement est aussi ce qui permet au prestataire d'appliquer les
        // plages horaires légales du publicitaire.
        type: request.marketing ? "marketing" : "transactional",
        sender: request.sender,
        recipient: brevoWireRecipient(request.recipient),
        content: request.content,
        // Rattachement support : retrouver un envoi à partir de la ligne de
        // journal sans jamais transporter d'identifiant de personne.
        tag: request.dedupKey.slice(0, 200),
      };

      let response: Response;
      try {
        response = await fetch(BREVO_SMS_URL, {
          method: "POST",
          headers: {
            "api-key": apiKey,
            "content-type": "application/json",
            accept: "application/json",
          },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(TIMEOUT_MS),
        });
      } catch (err) {
        /* LE DOUTE DU DÉLAI, assumé.
         *
         * Un délai dépassé ne dit pas si le message est parti. Le classer
         * `failed` le fera rejouer, donc pourra produire un DOUBLON ; le
         * classer `sent` PERDRAIT silencieusement les messages jamais partis.
         *
         * On choisit le doublon, pour une raison dissymétrique : un doublon
         * se voit, se compte, se raconte au client ; un message perdu est
         * indistinguable d'un message jamais demandé. Et il est borné — le
         * job s'arrête à `max_attempts`. L'alternative n'est pas bornée du
         * tout. Décision remontée au client dans le rapport de chantier.
         */
        reportError("brevo.sms", err);
        return {
          status: "failed",
          error: scrubProviderError(
            `transport: ${err instanceof Error ? err.message : String(err)}`,
          ),
        };
      }

      if (response.ok) {
        const payload = (await response
          .json()
          .catch(() => null)) as BrevoSendResponse | null;

        const segments = Number(payload?.smsCount ?? 1);
        return {
          status: "sent",
          providerMessageId:
            payload?.messageId != null ? String(payload.messageId) : null,
          segments: Number.isFinite(segments) && segments > 0 ? segments : 1,
        };
      }

      const errorPayload = (await response
        .json()
        .catch(() => null)) as BrevoErrorResponse | null;
      const code =
        typeof errorPayload?.code === "string" ? errorPayload.code : null;

      const status = classifyBrevoFailure({
        httpStatus: response.status,
        code,
      });
      const error = scrubProviderError(
        `HTTP ${response.status}${code ? ` ${code}` : ""}${
          errorPayload?.message ? ` — ${errorPayload.message}` : ""
        }`,
      );

      // Seuls les échecs TEMPORAIRES remontent à Sentry : ils signalent un
      // état de la plateforme (clé, quota, panne) sur lequel on peut agir. Un
      // numéro invalide est un fait ordinaire du canal, compté par
      // `sms.undeliverable` et non une alerte — le remonter noierait les
      // vraies pannes sous le bruit de la saisie client.
      if (status === "failed") reportError("brevo.sms", error);

      return { status, error };
    },
  };
}
