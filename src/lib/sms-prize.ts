import "server-only";

import { recordCounter, reportError } from "@/lib/monitoring";
import {
  enqueueSmsSend,
  normalizeSmsPhone,
  smsDedupKey,
  smsStopShortcode,
} from "@/lib/sms-dispatch";
import type { createAdminClient } from "@/lib/supabase/admin";
import { SMS_CONSENT_VERSION } from "@/lib/validations/sms";

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
 * ── LE CODE DE RETRAIT EST TRANSACTIONNEL — décision du client ──
 *
 * `marketing: false`. Trois faits, et ils sont cumulatifs :
 *
 *   • le message part À LA SUITE D'UNE ACTION EXPLICITE du joueur — il vient
 *     de jouer, de gagner, et de laisser son numéro pour recevoir son code ;
 *   • il ne contient AUCUN contenu promotionnel : une enseigne, un code, un
 *     lot, une instruction de retrait ;
 *   • il est NÉCESSAIRE au service demandé — sans ce code, le lot déjà
 *     décrémenté du stock n'est pas retirable en caisse.
 *
 * C'est la définition d'un message transactionnel, pas de la prospection.
 * Ce qui en découle, point par point plutôt qu'en basculant un booléen :
 *
 *   a) LA FENÊTRE HORAIRE (22 h–8 h, dimanche, fériés) NE S'APPLIQUE PLUS. Un
 *      gain de 23 h 30 part à 23 h 30. C'est l'objet même du changement : la
 *      règle vise la prospection commerciale, et retarder de dix heures un
 *      code que le joueur attend ne protégeait personne.
 *   b) LA CATÉGORIE DÉCLARÉE AU PRESTATAIRE CHANGE : `src/lib/brevo.ts` envoie
 *      `type: "transactional"`, chemin de remise distinct chez Brevo — le bon
 *      pour un message attendu, et celui qui n'est pas soumis aux plages
 *      horaires du publicitaire.
 *   c) LA GARDE MÉCANIQUE DE LA MENTION STOP NE S'ARME PLUS (elle ne vise que
 *      le publicitaire). LA MENTION RESTE POURTANT DANS LE MESSAGE, et c'est
 *      délibéré : elle coûte quelques caractères et c'est le SEUL rappel du
 *      droit de retrait que ce client recevra jamais, puisque son numéro a été
 *      collecté par une case d'opt-in. Ces caractères se paient — voir le
 *      budget plus bas — et le message type mesuré tient en UN segment GSM-7.
 *   d) LE CONSENTEMENT RESTE EXIGÉ, inchangé. `claim_sms_delivery` le vérifie
 *      sans distinguer les catégories et on n'y touche pas : le numéro n'est
 *      détenu que parce que la personne a coché la case, c'est ce qui rend
 *      l'envoi légitime. Reclasser le message ne reclasse pas la collecte.
 *
 * ── QUATRE CONDITIONS CUMULATIVES, ET AUCUNE N'EST OPTIONNELLE ──
 *
 *   1. CONSENTEMENT actif pour ce couple (organisation, numéro). C'est la loi.
 *   2. EXPÉDITEUR déclaré AF2M pour l'organisation.
 *   3. CRÉDIT — vérifié par `claim_sms_delivery` SEULE. Le relire ici serait
 *      faux sous concurrence : deux lecteurs concluraient tous deux « il en
 *      reste un ». Le socle prend le verrou, ce module ne le prend pas.
 *   4. MENTION STOP dans le message. Plus AUCUNE garde mécanique ne l'exige
 *      depuis le passage au transactionnel (voir c) : elle ne tient que par
 *      `prizeSmsContent`, qui l'ajoute TOUJOURS en dernier, après toute
 *      troncature, et par le test qui l'exige.
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
 * Enregistre le consentement SMS du gagnant, AVANT `enqueuePrizeRedeemSms`.
 *
 * ── LE DÉFAUT QUE CETTE FONCTION FERME ──────────────────────
 *
 * Le consentement partait dans un SECOND appel (`submitSmsConsent`), déclenché
 * par le navigateur après la réponse du claim. Le dépôt du code de retrait,
 * lui, s'exécute DANS le claim et sort sur `if (!consent) return false` avant
 * même de composer un message. Au PREMIER gain d'un couple (organisation,
 * numéro) l'ordre était donc inversé : aucun job déposé, aucun rattrapage,
 * aucune trace lisible par le commerçant — seulement un compteur
 * `sms.prize.no_consent`. Un récidiviste, lui, recevait bien son SMS, ce qui
 * rendait le défaut invisible en essai.
 *
 * ── CE QUI EST PRÉSERVÉ EN CHANGEANT DE TRANSPORT ───────────
 *
 *   · L'ORGANISATION NE VIENT PAS DU CLIENT : elle est résolue depuis le spin
 *     désigné par le jeton signé. C'est plus fort que l'ancien chemin, qui la
 *     déduisait d'un slug fourni dans le formulaire.
 *   · UNE VERSION EST ARCHIVÉE, pas un booléen : `SMS_CONSENT_VERSION` dit
 *     quelle phrase la personne a lue en cochant.
 *   · UN NUMÉRO RETIRÉ N'EST JAMAIS RÉACTIVÉ : `p_renew` n'est pas passé, donc
 *     `false`. La RPC lève, on ne renvoie rien, et le SMS ne part pas —
 *     rejouer un STOP par une case cochée serait la faute grave.
 *
 * NE LÈVE JAMAIS. Le lot est déjà décrémenté du stock à ce point du parcours :
 * un consentement qu'on n'a pas su écrire dégrade le canal, il ne doit pas
 * retirer son gain au gagnant. Le refus qui suit est alors du BON côté — pas
 * de consentement écrit, donc pas de SMS.
 */
export async function recordPrizeSmsConsent(
  admin: AdminClient,
  params: { organizationId: string; phone: string },
): Promise<boolean> {
  const phone = params.phone.trim();
  if (!phone) return false;

  try {
    const { error } = await admin.rpc("record_sms_consent", {
      p_organization_id: params.organizationId,
      p_phone: phone,
      p_consent_version: SMS_CONSENT_VERSION,
      p_consent_source: "play",
    });
    if (error) {
      // Le message de la RPC peut citer une date de retrait ; il ne va pas plus
      // loin que Sentry, et le numéro n'y entre jamais.
      reportError("sms.prize.consent_write", error.message);
      recordCounter("sms.prize.consent_refused");
      return false;
    }
    recordCounter("sms.prize.consent_recorded");
    return true;
  } catch (err) {
    reportError("sms.prize.consent_write", err);
    return false;
  }
}

/**
 * La mention de désinscription.
 *
 * Reprend le mot exact que `STOP_MENTION` attend côté worker, et porte le
 * NUMÉRO COURT dès que la plateforme le connaît (`SMS_STOP_SHORTCODE`) —
 * c'est ce que le texte de consentement promet, mot pour mot : « STOP au
 * numéro court indiqué dans chaque message ».
 *
 * Sans numéro configuré, la formulation d'origine est conservée telle quelle.
 * Elle est incomplète et on le sait ; en fabriquer un serait pire, puisqu'un
 * numéro faux a l'apparence d'une porte de sortie. Le compte Brevo n'existe
 * pas encore, et le numéro court dépend du pays et de ce compte.
 */
function stopMention(shortcode: string | null): string {
  return shortcode ? `STOP au ${shortcode}.` : "STOP pour ne plus en recevoir.";
}

/**
 * Longueurs allouées aux deux textes libres.
 *
 * Un SMS d'un seul segment fait 160 caractères en alphabet GSM-7. La partie
 * fixe ci-dessous en consomme ~99 avec un code de 13 caractères ; il reste 61
 * à partager, d'où 24 pour l'enseigne et 40 pour le lot.
 *
 * CE QUE CE BUDGET NE GARANTIT PAS, et il faut le dire : le nombre de
 * SEGMENTS. Un seul caractère hors GSM-7 dans le nom du commerce ou du lot —
 * « ê », « œ », un « ç » minuscule, une emoji — bascule le message entier en
 * UCS-2, où un segment ne fait plus que 70 caractères.
 *
 * Ce que ce commentaire disait autrefois — « le grand livre débite alors 1
 * crédit pendant que le prestataire en facture trois » — N'EST PLUS VRAI :
 * `processSmsSendJob` compte les segments et débite autant d'unités
 * (`20260827120000`). Le commerçant paie donc le prix réel plutôt que le tiers
 * de ce prix ; le budget ci-dessous ne le protège plus d'un écart de
 * facturation, il le protège d'un message plus cher que nécessaire.
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
 *
 * Le numéro court est un PARAMÈTRE et non une lecture d'environnement : lire
 * `SMS_STOP_SHORTCODE` ici rendrait le message dépendant de la configuration
 * du processus, donc impossible à rejouer à l'identique dans un test. C'est
 * l'appelant qui le résout.
 */
export function prizeSmsContent(
  params: {
    organizationName: string;
    prizeLabel: string;
    redeemCode: string;
  },
  stopShortcode: string | null = null,
): string {
  const org = clip(params.organizationName, ORG_NAME_BUDGET) || "Votre commerce";
  const prize = clip(params.prizeLabel, PRIZE_LABEL_BUDGET) || "votre lot";
  // La mention est ajoutée EN DERNIER, après les troncatures : aucune entrée,
  // si longue soit-elle, ne peut la faire disparaître.
  return `${org} : votre code ${params.redeemCode} pour ${prize}. A presenter en caisse. ${stopMention(stopShortcode)}`;
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
    const queued = await enqueueSmsSend(admin, {
      organizationId: params.organizationId,
      scenario: SMS_PRIZE_SCENARIO,
      recipient: phone,
      content: prizeSmsContent(params, smsStopShortcode()),
      dedupKey: smsDedupKey(
        params.organizationId,
        SMS_PRIZE_SCENARIO,
        params.participationId,
      ),
      // ⚠️ NE PAS REPASSER CE MESSAGE EN PUBLICITAIRE. Voir le pavé
      // « LE CODE DE RETRAIT EST TRANSACTIONNEL » en tête de fichier, et la
      // garde nommée de `sms-prize.test.ts` qui rougit si cette ligne
      // disparaît.
      marketing: false,
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
