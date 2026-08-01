import "server-only";

import { recordCounter, reportError } from "@/lib/monitoring";
import {
  enqueueSmsSend,
  normalizeSmsPhone,
  smsDedupKey,
} from "@/lib/sms-dispatch";
import type { createAdminClient } from "@/lib/supabase/admin";

type AdminClient = ReturnType<typeof createAdminClient>;

/* ════════════════════════════════════════════════════════════
 * LE CODE DE RETRAIT PAR SMS — premier producteur du canal
 *
 * ── CE QUE CE MODULE RÉPARE ─────────────────────────────────
 *
 * Un gagnant qui laisse son TÉLÉPHONE au lieu de son e-mail ne recevait rien :
 * `sendPrizeEmail` ne part que s'il y a une adresse. Le joueur voyait son code
 * à l'écran, fermait l'onglet, et n'avait plus rien à présenter en caisse.
 * C'est le scénario qui justifie l'existence du canal SMS.
 *
 * ── LE CODE DE RETRAIT EST UN SECRET PORTEUR ────────────────
 *
 * Quiconque le lit peut se présenter en caisse à la place du gagnant : le
 * comptoir ne demande rien d'autre. Il ne part donc QUE dans le corps du
 * message, et n'entre dans AUCUNE trace — ni `console`, ni `reportError`, ni
 * nom de compteur. Chaque `reportError` de ce fichier ne transmet que le
 * message d'erreur du socle, jamais le contenu composé ; et aucun compteur
 * n'est paramétré par autre chose qu'un littéral.
 *
 * ── QUATRE CONDITIONS CUMULATIVES, ET AUCUNE N'EST OPTIONNELLE ──
 *
 *   1. CONSENTEMENT actif pour ce couple (organisation, numéro). C'est la loi.
 *   2. EXPÉDITEUR déclaré AF2M pour l'organisation.
 *   3. CRÉDIT — vérifié par `claim_sms_delivery` SEULE. Le relire ici serait
 *      faux sous concurrence : deux lecteurs concluraient tous deux « il en
 *      reste un ». Le socle prend le verrou, ce module ne le prend pas.
 *   4. MENTION STOP dans le message. Le worker refuse tout SMS publicitaire
 *      qui en est dépourvu AVANT la réservation, donc sans le facturer — mais
 *      un message refusé est un message perdu : c'est le producteur qui doit
 *      la poser, et `prizeSmsContent` l'ajoute TOUJOURS en dernier, après
 *      toute troncature.
 *
 * Les conditions 1 et 2 sont relues par `claim_sms_delivery` au moment de la
 * réservation, et c'est cette relecture-là qui fait foi — un consentement peut
 * être retiré entre le dépôt du job et son exécution. Les vérifier ici n'est
 * donc pas la garantie : c'est ce qui évite de déposer un job dont on sait
 * déjà qu'il ne partira pas, et de composer un message avec un code de retrait
 * pour un numéro qui n'a rien demandé.
 * ════════════════════════════════════════════════════════════ */

/** Le scénario, tel qu'il apparaît dans `sms_log.scenario` et la clé d'unicité. */
export const SMS_PRIZE_SCENARIO = "prize_code";

/**
 * La mention de désinscription.
 *
 * Reprend le mot exact que `STOP_MENTION` attend côté worker et que le
 * consentement annonce (`SMS_CONSENT_TEXTS["sms.v1"]` : « en répondant STOP »).
 * AUCUN numéro court n'y figure : celui du prestataire dépend du pays et du
 * compte Brevo, il n'est configuré nulle part dans ce produit, et l'inventer
 * imprimerait un numéro faux sur des messages réels.
 */
const STOP_MENTION = "STOP pour ne plus en recevoir.";

/**
 * Longueurs allouées aux deux textes libres.
 *
 * Un SMS d'un seul segment fait 160 caractères en alphabet GSM-7. La partie
 * fixe ci-dessous en consomme ~99 avec un code de 13 caractères ; il reste 61
 * à partager, d'où 24 pour l'enseigne et 40 pour le lot.
 *
 * CE QUE CE BUDGET NE GARANTIT PAS, et il faut le dire : le nombre de
 * SEGMENTS. Un seul caractère hors GSM-7 dans le nom du commerce ou du lot —
 * « ê », « œ », une emoji — bascule le message entier en UCS-2, où un segment
 * ne fait plus que 70 caractères. Le grand livre débite alors 1 crédit pendant
 * que le prestataire en facture trois. L'écart est mesuré par le compteur
 * `sms.multipart` du worker ; son arbitrage est consigné et hors de ce
 * chantier.
 *
 * La partie fixe, elle, est volontairement SANS ACCENT (« A presenter ») :
 * « À » majuscule accentué n'appartient pas au GSM-7, et l'écrire ferait
 * basculer en UCS-2 TOUS les messages, y compris ceux dont l'enseigne et le lot
 * sont irréprochables.
 */
const ORG_NAME_BUDGET = 24;
const PRIZE_LABEL_BUDGET = 40;

/**
 * Ramène un texte libre à une ligne, bornée.
 *
 * Le passage à la ligne compte comme un caractère et casse l'affichage sur
 * certains combinés : les espaces sont donc normalisés avant la coupe.
 */
function clip(value: string, max: number): string {
  const flat = value.replace(/\s+/g, " ").trim();
  return flat.length <= max ? flat : flat.slice(0, max).trimEnd();
}

/**
 * Compose le message. Fonction PURE, exportée pour être éprouvée seule :
 * c'est le seul endroit du produit où un code de retrait est écrit dans une
 * chaîne, et la mention STOP doit y survivre à toute entrée hostile.
 */
export function prizeSmsContent(params: {
  organizationName: string;
  prizeLabel: string;
  redeemCode: string;
}): string {
  const org = clip(params.organizationName, ORG_NAME_BUDGET) || "Votre commerce";
  const prize = clip(params.prizeLabel, PRIZE_LABEL_BUDGET) || "votre lot";
  // La mention est ajoutée EN DERNIER, après les troncatures : aucune entrée,
  // si longue soit-elle, ne peut la faire disparaître.
  return `${org} : votre code ${params.redeemCode} pour ${prize}. A presenter en caisse. ${STOP_MENTION}`;
}

export interface PrizeSmsParams {
  organizationId: string;
  organizationName: string;
  prizeLabel: string;
  redeemCode: string;
  /** Numéro tel que le gagnant l'a saisi. La base le normalisera. */
  phone: string;
  /**
   * Cible de la clé d'unicité. Un IDENTIFIANT, jamais le numéro : « 0612345678 »
   * et « +33612345678 » sont deux chaînes, donc deux clés, donc deux SMS au
   * même client — le piège que documente `smsDedupKey`.
   */
  participationId: string;
}

/**
 * Dépose l'envoi du code de retrait, si les quatre conditions sont réunies.
 *
 * NE LÈVE JAMAIS et ne rend qu'un booléen d'observation : l'appelant est le
 * chemin de réclamation d'un lot déjà gagné. Le joueur a son code à l'écran ;
 * un SMS qui ne part pas est une dégradation, pas une perte. Faire échouer la
 * réclamation pour cela retirerait au gagnant un lot que le stock a déjà
 * décrémenté.
 */
export async function enqueuePrizeRedeemSms(
  admin: AdminClient,
  params: PrizeSmsParams,
): Promise<boolean> {
  const phone = params.phone.trim();
  if (!phone) return false;

  try {
    // ── (0) LE NUMÉRO, NORMALISÉ PAR LA BASE ─────────────────
    // `sms_consents.phone_key` est une colonne calculée par `sms_phone_e164` :
    // comparer une saisie brute à cette clé ne trouverait jamais rien pour un
    // numéro saisi « 06 12 34 56 78 ». La normalisation passe donc par LA
    // fonction de la base, jamais par une seconde écrite ici.
    const phoneKey = await normalizeSmsPhone(admin, phone);
    if (!phoneKey) {
      recordCounter("sms.prize.unreadable");
      return false;
    }

    // ── (1) CONSENTEMENT ─────────────────────────────────────
    const { data: consent, error: consentError } = await admin
      .from("sms_consents")
      .select("id")
      .eq("organization_id", params.organizationId)
      .eq("phone_key", phoneKey)
      .is("revoked_at", null)
      .maybeSingle();

    if (consentError) {
      // Une panne de lecture n'est PAS un consentement. On sort sans envoyer.
      reportError("sms.prize.consent", consentError.message);
      return false;
    }
    if (!consent) {
      recordCounter("sms.prize.no_consent");
      return false;
    }

    // ── (2) EXPÉDITEUR DÉCLARÉ ───────────────────────────────
    // Point de lecture unique du chemin d'envoi : `sms_sender_for_send` ne
    // rend un nom que sur `declared` non retiré, trois états sur quatre
    // rendent `null`. On ne relit pas `sms_senders` à la main — ce serait la
    // seconde source de vérité sur « qui a le droit de signer ».
    const { data: sender, error: senderError } = await admin.rpc(
      "sms_sender_for_send",
      { p_organization_id: params.organizationId },
    );
    if (senderError) {
      reportError("sms.prize.sender", senderError.message);
      return false;
    }
    if (typeof sender !== "string" || sender.length === 0) {
      recordCounter("sms.prize.no_sender");
      return false;
    }

    // ── (3) DÉPÔT ────────────────────────────────────────────
    // `marketing` n'est PAS passé : le défaut du payload est « publicitaire »,
    // et c'est ce défaut qui ARME la garde de la mention STOP dans le worker.
    // Déclarer ce message transactionnel désarmerait la seule vérification
    // mécanique que cette mention existe — pour un message qu'on n'envoie
    // qu'à des personnes ayant coché une case de prospection commerciale.
    const queued = await enqueueSmsSend(admin, {
      organizationId: params.organizationId,
      scenario: SMS_PRIZE_SCENARIO,
      recipient: phone,
      content: prizeSmsContent(params),
      dedupKey: smsDedupKey(
        params.organizationId,
        SMS_PRIZE_SCENARIO,
        params.participationId,
      ),
    });

    recordCounter(queued ? "sms.prize.enqueued" : "sms.prize.enqueue_failed");
    return queued;
  } catch (err) {
    // `err` vient du socle ou du réseau : il ne porte pas le contenu composé,
    // et c'est la seule raison pour laquelle il peut être journalisé tel quel.
    reportError("sms.prize", err);
    return false;
  }
}
