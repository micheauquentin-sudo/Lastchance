import "server-only";

import { optionalEnv } from "@/lib/env";
import { enqueueJob, type JobOutcome, type JobRow } from "@/lib/jobs";
import { recordCounter, reportError } from "@/lib/monitoring";
import { getSmsProvider, type SmsProvider } from "@/lib/sms-provider";
import { smsSegments } from "@/lib/sms-segments";
import { smsMarketingWindow } from "@/lib/sms-window";
import type { createAdminClient } from "@/lib/supabase/admin";

type AdminClient = ReturnType<typeof createAdminClient>;

/* ════════════════════════════════════════════════════════════
 * L'ENVOI SMS — dépôt et exécution
 *
 * ── POURQUOI UN JOB ET NON UN CRON DÉDIÉ ────────────────────
 *
 * Les dix workers du projet portent chacun un nom dans `WORKER_NAMES`, et
 * depuis `20260805240000` ce nom est adossé par clé étrangère à
 * `ops_worker_definitions` : ajouter un onzième worker exige une MIGRATION.
 * Le socle SMS est posé, et rien dans ce chantier ne justifie de rouvrir le
 * schéma pour obtenir une file d'attente que `jobs` fournit déjà — avec sa
 * reprise (`requeue_stale_jobs`), son backoff et son plafond de tentatives.
 *
 * L'envoi est donc un TYPE DE JOB. Le worker `jobs` le réclame comme les six
 * autres. Le plafond de tentatives de la file est ce qui garantit qu'aucun
 * message ne tourne indéfiniment, y compris dans les cas que le classement du
 * prestataire n'a pas su trancher.
 *
 * ── LA CADENCE RÉELLE, MESURÉE ET NON SUPPOSÉE ──────────────
 *
 * Ce commentaire a longtemps affirmé « toutes les cinq minutes ». C'était faux,
 * et c'est la seule affirmation de ce fichier qui portait sur le PRODUIT plutôt
 * que sur le code.
 *
 * `vercel.json` planifie `/api/cron/jobs` à `20 4 * * *` : UNE FOIS PAR JOUR,
 * comme les dix crons du fichier — contrainte du plan Vercel, décision qui
 * appartient au client. La cadence à 5 minutes existe bien, mais côté pg_cron
 * (`lastchance-jobs-worker`, `20260722100000`), et elle est INACTIVE : sa
 * planification est gardée par `where (select count(*) from
 * vault.decrypted_secrets where name in ('jobs_worker_url',
 * 'sync_contests_secret')) = 2`. Poser ces DEUX secrets Vault — l'URL du worker
 * et le secret partagé avec le worker de synchro — est le geste exact qui
 * l'active, sans migration.
 *
 * CONSÉQUENCE PRODUIT, à ne pas adoucir : un code de retrait envoyé par SMS
 * peut arriver jusqu'à 24 h après le gain. Le canal est correct, sa cadence le
 * rend aujourd'hui peu utile pour ce scénario-là.
 *
 * ── CE QUE CE MODULE NE FAIT PAS ────────────────────────────
 *
 * Il ne contrôle AUCUN solde. `claim_sms_delivery` réserve le travail et
 * débite le crédit dans la même transaction ; refaire cette vérification ici
 * serait faux sous concurrence — deux workers liraient le même solde
 * suffisant avant que l'un ou l'autre ne débite.
 *
 * Il ne normalise AUCUN numéro. Le numéro composé est relu depuis
 * `sms_log.recipient`, où la base l'a écrit normalisé.
 * ════════════════════════════════════════════════════════════ */

/**
 * La clé d'unicité d'un envoi.
 *
 * DEUX RÈGLES, et la seconde est contre-intuitive.
 *
 * 1. L'identifiant d'organisation est en TÊTE. `sms_log.dedup_key` est
 *    unique, et une clé bâtie sans lui peut entrer en collision entre deux
 *    organisations — auquel cas le worker de l'une reprend la ligne de
 *    l'autre, ou l'empêche de partir. Préfixer rend la collision impossible
 *    AVANT d'atteindre la base plutôt qu'après. Même geste que
 *    `weeklyDigestDedupKey`.
 *
 * 2. Le `target` NE DOIT PAS ÊTRE UN NUMÉRO DE TÉLÉPHONE saisi. C'est le
 *    piège de ce chantier : « 0612345678 » et « +33612345678 » sont deux
 *    chaînes, donc deux clés, donc DEUX SMS au même client — le défaut que
 *    `20260826120000` vient de fermer côté consentement, rouvert ici par la
 *    porte de derrière. Passer un identifiant stable (participation, contact,
 *    campagne). Si la clé doit vraiment porter le numéro, le faire passer
 *    d'abord par `normalizeSmsPhone`, qui appelle LA fonction de la base.
 */
export function smsDedupKey(
  organizationId: string,
  scenario: string,
  target: string,
): string {
  return `sms:${organizationId}:${scenario}:${target}`;
}

/**
 * Normalise un numéro EN APPELANT LA BASE.
 *
 * Ce n'est pas un second site de normalisation : c'est un appel à l'unique
 * fonction `sms_phone_e164`, celle-là même que portent les colonnes calculées
 * `sms_consents.phone_key` et `sms_log.recipient_key`. Réécrire sa logique en
 * TypeScript serait le second site ; l'appeler ne l'est pas.
 */
export async function normalizeSmsPhone(
  admin: AdminClient,
  phone: string,
): Promise<string | null> {
  const { data, error } = await admin.rpc("sms_phone_e164", {
    p_phone: phone,
    p_default_country: "FR",
  });
  if (error) {
    reportError("sms.normalize", error.message);
    return null;
  }
  return typeof data === "string" && data.length > 0 ? data : null;
}

export interface SmsSendJobPayload {
  organizationId: string;
  scenario: string;
  /** Numéro tel que collecté. La base le normalisera à la réservation. */
  recipient: string;
  content: string;
  dedupKey: string;
  /** Publicitaire par défaut : le cas le plus contraint gagne le silence. */
  marketing?: boolean;
}

/**
 * Dépose un envoi. Idempotent par `dedupKey` à DEUX étages : la file refuse
 * un second job de même clé, et `claim_sms_delivery` refuserait de toute
 * façon la seconde réservation.
 */
export async function enqueueSmsSend(
  admin: AdminClient,
  payload: SmsSendJobPayload,
): Promise<boolean> {
  return enqueueJob(admin, {
    type: "sms.send",
    payload: { ...payload },
    organizationId: payload.organizationId,
    idempotencyKey: payload.dedupKey,
  });
}

/**
 * La mention de désinscription, exigée sur tout SMS publicitaire.
 *
 * Reconnue et non fabriquée : le numéro court qui reçoit le STOP appartient
 * au prestataire et dépend du pays et du compte. L'inventer ici imprimerait
 * un numéro faux sur des messages réels. Le producteur du message fournit la
 * mention ; ce module vérifie seulement qu'elle est là.
 */
const STOP_MENTION = /\bSTOP\b/i;

/**
 * LE NUMÉRO COURT QUI REÇOIT LE STOP, quand il est connu.
 *
 * ── Ce que ce réglage répare ────────────────────────────────
 *
 * Le texte de consentement promet « STOP au numéro court indiqué dans chaque
 * message » (`SMS_CONSENT_TEXTS`). Tant qu'aucun message ne porte de numéro,
 * cette phrase décrit un geste qui n'aboutit pas : la personne croit exercer
 * un droit de retrait, et ne l'exerce pas. Un expéditeur alphanumérique ne
 * peut PAS recevoir de réponse (charte AF2M) — répondre au message ne mène
 * nulle part.
 *
 * ── Pourquoi OPTIONNELLE, et pourquoi rien n'est inventé ────
 *
 * Le numéro dépend du pays et du compte du prestataire, et le compte Brevo
 * n'existe pas encore. Fabriquer une valeur par défaut l'imprimerait sur des
 * messages réels — un numéro faux vaut moins qu'aucun numéro, parce qu'il se
 * donne l'air d'une porte de sortie. Tant que la variable est absente, le
 * comportement est STRICTEMENT celui d'avant : le mot STOP suffit.
 */
export function smsStopShortcode(): string | null {
  const raw = optionalEnv("SMS_STOP_SHORTCODE");
  if (!raw) return null;
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * Le plafond de segments d'un message.
 *
 * Miroir du CHECK de `sms_log.segments` (1 à 6, `20260827120000`) : au-delà,
 * `claim_sms_delivery` écrêterait silencieusement à 6 et le commerçant
 * paierait six segments pour un message qui en coûte davantage. On refuse
 * plutôt, et AVANT le débit.
 */
const MAX_SEGMENTS = 6;

/**
 * LA FENÊTRE DE PÉREMPTION D'UNE RÉSERVATION, alignée sur le verrou de job.
 *
 * ── Ce que le défaut valait, sans elle ──────────────────────
 *
 * `claim_sms_delivery` retombe sur 900 s quand on ne lui dit rien, alors que
 * `claim_jobs` verrouille un job 120 s. Un worker tué juste après la
 * réservation laissait donc une ligne `sending` et un crédit débité ; à 120 s
 * `requeue_stale_jobs` remettait le job en file, la reprise rappelait la porte
 * d'envoi, qui voyait `sending` avec un `claimed_at` ENCORE FRAIS pour elle
 * (fenêtre 900 s) et rendait `false`. Le worker lisait ce `false` comme un
 * refus ordinaire, rendait `completed`, et le job disparaissait : N crédits
 * pris, aucun SMS, aucun remboursement — il n'existe que sur `undeliverable` —
 * et le gagnant sans son code.
 *
 * ── L'ARGUMENT DE SÛRETÉ, RÉÉCRIT PARCE QUE LE PRÉCÉDENT ÉTAIT FAUX ──
 *
 * Ce commentaire soutenait : « quand une reprise devient possible, le porteur
 * est mort depuis au moins 60 s (`maxDuration = 60`), donc pas de double
 * envoi ». LE RAISONNEMENT N'EST PAS TRANSITIF. Un worker mort peut avoir
 * remis le message au prestataire juste avant de mourir : sa mort ne dit rien
 * de ce que Brevo a déjà accepté. Une fenêtre trop courte peut donc bel et bien
 * produire un DOUBLON, quels que soient ces deux chiffres.
 *
 * Un commentaire qui justifie une valeur par un raisonnement faux est pire
 * qu'un commentaire absent : il empêche la relecture de voir qu'il reste
 * quelque chose à arbitrer.
 *
 * LE VRAI ARGUMENT EXISTE, ET IL EST DÉJÀ ARBITRÉ AILLEURS. `src/lib/brevo.ts`
 * (« LE DOUTE DU DÉLAI, assumé ») tranche exactement la même dissymétrie pour
 * le délai d'appel au prestataire : entre un doublon possible et un message
 * perdu, ON CHOISIT LE DOUBLON — un doublon se voit, se compte, se raconte au
 * client ; un message perdu est indistinguable d'un message jamais demandé. Et
 * il est BORNÉ par `max_attempts`, quand la perte ne l'est pas.
 *
 * 120 s applique cette même décision ici, et rien d'autre : la valeur n'est pas
 * « sûre », elle est ALIGNÉE sur le verrou de `claim_jobs` (`p_lock_seconds:
 * 120` dans `src/app/api/cron/jobs/route.ts`), de sorte que la porte d'envoi et
 * la file ne se contredisent jamais sur qui détient quoi. Le résidu de doublon
 * est assumé ; c'est la perte silencieuse qui ne l'est pas.
 *
 * La RPC borne elle-même entre 60 s et 86 400 s : 120 est dans la plage, la
 * valeur passée est donc celle appliquée.
 */
const CLAIM_STALE_AFTER_SECONDS = 120;

/**
 * Exécute un envoi.
 *
 * L'ORDRE EST LA SUBSTANCE de cette fonction : tout ce qui peut refuser un
 * message est fait AVANT `claim_sms_delivery`, parce que c'est lui qui
 * débite. Un refus tardif ferait payer un SMS que rien n'envoie.
 */
export async function processSmsSendJob(
  admin: AdminClient,
  job: JobRow,
  provider: SmsProvider | null = getSmsProvider(),
  /**
   * L'instant de la décision, PARAMÈTRE et non lecture d'horloge enfouie.
   * Même motif que le numéro court de `prizeSmsContent` : une règle qui lit
   * l'heure au fond d'une fonction ne se rejoue pas à l'identique dans un
   * test, donc ne se prouve pas.
   */
  now: Date = new Date(),
): Promise<JobOutcome> {
  const payload = job.payload as Partial<SmsSendJobPayload>;
  const organizationId = String(payload.organizationId ?? "");
  const scenario = String(payload.scenario ?? "");
  const recipient = String(payload.recipient ?? "");
  const content = String(payload.content ?? "");
  const dedupKey = String(payload.dedupKey ?? "");
  const marketing = payload.marketing !== false;

  if (!organizationId || !scenario || !recipient || !content || !dedupKey) {
    // Défaut de programmation du producteur : rejouer n'y changerait rien.
    return { status: "failed", error: "payload SMS incomplet" };
  }

  // ── (1) LA MENTION LÉGALE, avant toute réservation ────────
  // Un SMS publicitaire sans porte de sortie ne doit pas partir. Le refuser
  // ici plutôt qu'après la réservation est ce qui garantit qu'il n'est pas
  // facturé : rien n'a encore été débité à ce point.
  if (marketing && !STOP_MENTION.test(content)) {
    recordCounter("sms.missing_stop_mention");
    return {
      status: "failed",
      error: "SMS publicitaire sans mention de désinscription",
    };
  }

  // ── (1 bis) LE NUMÉRO COURT, quand il est connu ───────────
  // Le mot STOP seul ne dit pas OÙ l'envoyer, et l'expéditeur alphanumérique
  // ne reçoit rien. Dès que la plateforme connaît son numéro court, un SMS
  // publicitaire qui ne le porte pas promet une porte de sortie qui n'existe
  // pas : refusé, ici encore, avant toute réservation.
  const shortcode = smsStopShortcode();
  if (marketing && shortcode && !content.includes(shortcode)) {
    recordCounter("sms.missing_stop_shortcode");
    return {
      status: "failed",
      error: "SMS publicitaire sans numéro court de désinscription",
    };
  }

  // ── (1 ter) LA LONGUEUR, donc le PRIX ─────────────────────
  // Compté ici parce que c'est ce compte qui est débité : `claim_sms_delivery`
  // ne sait pas mesurer un message, elle prend le nombre qu'on lui donne. Un
  // message hors plafond est refusé DÉFINITIVEMENT — rejouer ne le
  // raccourcira pas — et refusé AVANT le débit, donc sans rien coûter.
  const segmentation = smsSegments(content);
  if (segmentation.segments > MAX_SEGMENTS) {
    recordCounter("sms.too_long");
    return {
      status: "failed",
      error: `SMS trop long : ${segmentation.segments} segments (maximum ${MAX_SEGMENTS})`,
    };
  }

  // ── (1 quater) LA FENÊTRE HORAIRE LÉGALE ──────────────────
  //
  // La prospection par SMS est interdite entre 22 h et 8 h, le dimanche et les
  // jours fériés (charte AF2M, doctrine CNIL). Un gain de 23 h 30 partait à
  // 23 h 35 : rien ne bornait l'heure d'envoi.
  //
  // `retry` ET JAMAIS `failed`, et la distinction est toute la correction : le
  // message n'est pas fautif, il est PRÉMATURÉ. Un `failed` le perdrait
  // définitivement — le gagnant n'aurait jamais son code — alors que le report
  // ne lui coûte qu'une attente. Rien n'est débité ici : la garde est en amont
  // de `claim_sms_delivery`, comme les trois précédentes.
  //
  // ⚠️ CETTE GARDE NE PART PAS AUJOURD'HUI, ET IL FAUT LE SAVOIR. Le worker
  // `jobs` est planifié à `20 4 * * *` (vercel.json), soit 05 h 20 ou 06 h 20 à
  // Paris selon la saison — DANS la fenêtre interdite, tous les jours. Tant que
  // la cadence reste quotidienne, tout SMS publicitaire est reporté à chaque
  // passage et finit `failed` par épuisement de `max_attempts`. La cadence à
  // 5 minutes de pg_cron (`lastchance-jobs-worker`) la fait fonctionner
  // normalement dès qu'elle est active. Voir l'en-tête du fichier.
  const window = smsMarketingWindow(now);
  if (marketing && !window.allowed) {
    recordCounter(`sms.out_of_window.${window.closure}`);
    return {
      status: "retry",
      error: `hors fenêtre légale d'envoi (${window.closure})`,
    };
  }

  // ── (2) PAS DE PRESTATAIRE, PAS DE RÉSERVATION ────────────
  // C'est ici que « une panne de configuration ne débite personne » devient
  // exécutable : sans clé, on sort AVANT le débit. Le job est retenté, donc
  // les messages partiront une fois la clé posée, dans la limite du plafond
  // de tentatives.
  if (!provider) {
    recordCounter("sms.not_configured");
    return { status: "retry", error: "prestataire SMS non configuré" };
  }

  // ── (3) RÉSERVATION ET DÉBIT, atomiques, côté base ────────
  const { data: claimed, error: claimError } = await admin.rpc(
    "claim_sms_delivery",
    {
      p_organization_id: organizationId,
      p_scenario: scenario,
      p_recipient: recipient,
      p_dedup_key: dedupKey,
      // Le nombre d'unités à débiter. Sans lui, la RPC retombe sur son défaut
      // de 1 et un message de trois segments coûte un crédit au commerçant
      // pendant que le prestataire en facture trois.
      p_segments: segmentation.segments,
      // Sans lui, la RPC retombe sur 900 s alors que le job est repris à
      // 120 s : un worker tué après la réservation faisait disparaître le
      // message ET le crédit. Voir CLAIM_STALE_AFTER_SECONDS.
      p_stale_after_seconds: CLAIM_STALE_AFTER_SECONDS,
    },
  );

  if (claimError) {
    reportError("sms.claim", claimError.message);
    return { status: "retry", error: "réservation impossible" };
  }

  if (claimed !== true) {
    /* REFUS NORMAL, ET TERMINAL POUR LE JOB.
     *
     * Cinq motifs mènent ici : numéro illisible, consentement absent ou
     * RETIRÉ, expéditeur non déclaré, message déjà parti, crédit épuisé.
     * Aucun ne se répare en rejouant tout de suite, et l'un d'eux — le
     * retrait de consentement — ne doit SURTOUT pas être rejoué : c'est
     * précisément le cas où le client a dit STOP.
     *
     * Rendre `completed` et non `retry` est donc voulu. Le job disparaît, le
     * message ne part pas.
     *
     * La porte rend un booléen nu : elle ne dit pas LEQUEL des cinq. Le
     * compteur total ci-dessous ne le dira pas davantage — c'est la lecture
     * diagnostique qui suit qui l'approche, et seulement pour compter.
     */
    recordCounter("sms.claim_refused");
    recordCounter(
      `sms.claim_refused.${await diagnoseClaimRefusal(admin, {
        organizationId,
        dedupKey,
        recipient,
        segments: segmentation.segments,
      })}`,
    );
    return { status: "completed" };
  }

  // ── (4) LE NUMÉRO À COMPOSER VIENT DE LA BASE ─────────────
  // Et non du payload. `claim_sms_delivery` a écrit dans `sms_log.recipient`
  // la forme normalisée, et dans `sender_id` l'expéditeur gelé. Les relire
  // est ce qui rend tenable l'interdit « ne renormalise pas » : il n'existe
  // aucun calcul de numéro dans ce fichier.
  const { data: line, error: lineError } = await admin
    .from("sms_log")
    .select("recipient, sender_id")
    .eq("organization_id", organizationId)
    .eq("dedup_key", dedupKey)
    .maybeSingle();

  const dialled = (line as { recipient?: string; sender_id?: string } | null) ?? null;

  if (lineError || !dialled?.recipient || !dialled?.sender_id) {
    reportError("sms.line", lineError?.message ?? "ligne réservée illisible");
    // La réservation existe et le crédit est pris. On la referme en échec
    // TEMPORAIRE : la reprise réutilisera ce même crédit, sans en débiter un
    // second.
    await finishSmsDelivery(admin, organizationId, dedupKey, {
      status: "failed",
      error: "ligne d'envoi illisible après réservation",
    });
    return { status: "retry", error: "ligne d'envoi illisible" };
  }

  // ── (5) L'ENVOI ───────────────────────────────────────────
  const outcome = await provider.send({
    recipient: dialled.recipient,
    sender: dialled.sender_id,
    content,
    marketing,
    dedupKey,
  });

  await finishSmsDelivery(admin, organizationId, dedupKey, outcome);

  if (outcome.status === "sent") {
    recordCounter("sms.sent");
    if (outcome.segments > 1) {
      // Le grand livre débite désormais UN CRÉDIT PAR SEGMENT : l'écart que
      // ce compteur mesurait est fermé. Il reste pour ce qu'il dit du produit
      // — quelle proportion des messages coûte plus d'un crédit, donc quel
      // effet aurait un raccourcissement des libellés.
      recordCounter("sms.multipart");
    }
    if (outcome.segments !== segmentation.segments) {
      /* LA SEULE MESURE QUI PUISSE INFIRMER NOTRE COMPTE.
       *
       * `smsSegments` applique la norme ; le prestataire applique SA
       * facturation, et rien ne garantit que les deux coïncident (encodage
       * choisi, translittération, en-tête ajouté). Tant que ce compteur reste
       * à zéro, débiter sur notre compte est justifié. Dès qu'il monte, c'est
       * notre calcul qu'il faut corriger — pas le débit qu'il faut deviner.
       *
       * Rien n'est corrigé rétroactivement ici : la réservation est déjà
       * débitée, et rejouer un débit sur un message DÉJÀ PARTI ouvrirait un
       * second écrivain du solde hors du chemin d'envoi.
       */
      recordCounter("sms.segment_mismatch");
    }
    return { status: "completed" };
  }

  if (outcome.status === "undeliverable") {
    /* TERMINAL, ET C'EST LE POINT.
     *
     * `finish_sms_delivery` a remboursé le crédit, et `claim_sms_delivery`
     * refusera désormais toute reprise de cette clé. Rendre `retry` ici
     * ferait tourner le job jusqu'au plafond pour se faire refuser la
     * réservation à chaque tour — le « numéro mort qui boucle » que la
     * distinction temporaire / définitif existe pour empêcher.
     */
    recordCounter("sms.undeliverable");
    return { status: "completed" };
  }

  recordCounter("sms.failed");
  return { status: "retry", error: outcome.error };
}

/**
 * Les causes possibles d'un refus de réservation, du point de vue du COMPTEUR.
 *
 * `unknown` n'est pas un raté : c'est le cas où la lecture diagnostique n'a
 * rien pu établir (course, panne de lecture, cause hors des cinq). Le garder
 * explicite est ce qui fait que la somme des compteurs nommés égale
 * `sms.claim_refused` — sans quoi un trou dans l'attribution passerait pour
 * une baisse des refus.
 */
type SmsClaimRefusalCause =
  | "bad_number"
  | "no_consent"
  | "consent_revoked"
  | "no_sender"
  | "already_sent"
  | "undeliverable"
  | "in_flight"
  | "insufficient_credit"
  | "unknown";

/**
 * POURQUOI le message n'est pas parti — lecture POST-HOC et BEST-EFFORT.
 *
 * ── Ce qu'elle répare ───────────────────────────────────────
 *
 * Un solde de 2 fait disparaître EN SILENCE un message de 3 segments, et un
 * seul accent dans le nom du lot suffit à basculer en UCS-2, donc à tripler le
 * compte. Le commerçant ne saurait pas pourquoi son client n'a rien reçu, et
 * « crédit épuisé » (à recharger) ne se distinguait pas de « le client a dit
 * STOP » (le fonctionnement normal).
 *
 * ── CE QU'ELLE NE DOIT JAMAIS FAIRE ─────────────────────────
 *
 * ELLE NE DÉCIDE RIEN. Aucun de ses résultats ne change le sort du job, ne
 * relance un envoi, ni ne rembourse quoi que ce soit. C'est la condition pour
 * qu'elle soit sans danger : elle lit APRÈS coup, hors de la transaction de
 * `claim_sms_delivery`, donc l'état qu'elle observe a pu changer entre-temps
 * — c'est exactement la course que la porte d'envoi existe pour fermer, et
 * qu'un refus fondé sur cette lecture rouvrirait. Une attribution légèrement
 * fausse est acceptable pour un COMPTEUR ; elle serait fatale pour un refus.
 *
 * L'ordre des lectures est celui des refus de la RPC (numéro, consentement,
 * expéditeur, état de la ligne, crédit) : c'est le seul ordre qui nomme la
 * cause qui a RÉELLEMENT arrêté la réservation quand plusieurs sont vraies.
 *
 * Rien n'est journalisé : ni le numéro, ni le contenu, ni un code de retrait.
 * Le résultat est une étiquette fermée, comptée et jetée.
 */
async function diagnoseClaimRefusal(
  admin: AdminClient,
  input: {
    organizationId: string;
    dedupKey: string;
    recipient: string;
    segments: number;
  },
): Promise<SmsClaimRefusalCause> {
  try {
    // (1) Le numéro. Appel direct plutôt que `normalizeSmsPhone` : celle-ci
    // rend `null` AUSSI quand la lecture échoue, ce qui étiquetterait une
    // panne de base en « numéro illisible » et remonterait en prime une erreur
    // Sentry pour un diagnostic qui n'a pas le droit de faire de bruit.
    const { data: keyData, error: keyError } = await admin.rpc("sms_phone_e164", {
      p_phone: input.recipient,
      p_default_country: "FR",
    });
    if (keyError) return "unknown";
    const phoneKey = typeof keyData === "string" && keyData.length > 0 ? keyData : null;
    if (!phoneKey) return "bad_number";

    // (2) Le consentement — et le retrait se distingue de l'absence : l'un est
    // le produit qui fonctionne, l'autre une cible mal construite.
    const { data: consent, error: consentError } = await admin
      .from("sms_consents")
      .select("revoked_at")
      .eq("organization_id", input.organizationId)
      .eq("phone_key", phoneKey)
      .maybeSingle();
    if (consentError) return "unknown";
    const consentRow = (consent as { revoked_at?: string | null } | null) ?? null;
    if (!consentRow) return "no_consent";
    if (consentRow.revoked_at) return "consent_revoked";

    // (3) L'expéditeur déclaré au registre AF2M.
    const { data: sender, error: senderError } = await admin.rpc(
      "sms_sender_for_send",
      { p_organization_id: input.organizationId },
    );
    if (senderError) return "unknown";
    if (!sender) return "no_sender";

    // (4) L'état de la ligne. `sent` et `undeliverable` sont des refus SAINS :
    // ne pas renvoyer, ne pas boucler. Les séparer du reste est ce qui évite
    // de lire une hausse des refus comme une panne.
    const { data: line, error: lineError } = await admin
      .from("sms_log")
      .select("status, credit_entry_id")
      .eq("organization_id", input.organizationId)
      .eq("dedup_key", input.dedupKey)
      .maybeSingle();
    if (lineError) return "unknown";
    const logRow =
      (line as { status?: string; credit_entry_id?: string | null } | null) ?? null;
    if (logRow?.status === "sent") return "already_sent";
    if (logRow?.status === "undeliverable") return "undeliverable";
    // `sending` observé ICI, après le refus, désigne une réservation qu'un
    // autre worker tient. L'observation est postérieure, donc faillible — d'où
    // l'étiquette « en vol » et non « doublon empêché ».
    if (logRow?.status === "sending") return "in_flight";

    // (5) Le crédit, en dernier comme dans la RPC. Une reprise dont le crédit
    // est DÉJÀ payé ne repasse pas par le débit : le solde n'y est pour rien.
    if (logRow && logRow.credit_entry_id) return "unknown";
    const { data: credits, error: creditsError } = await admin
      .from("sms_credits")
      .select("balance_units")
      .eq("organization_id", input.organizationId)
      .maybeSingle();
    if (creditsError) return "unknown";
    const balance = Number(
      (credits as { balance_units?: number } | null)?.balance_units ?? 0,
    );
    if (balance < input.segments) return "insufficient_credit";

    return "unknown";
  } catch {
    // Un diagnostic ne fait jamais échouer ce qu'il diagnostique.
    return "unknown";
  }
}

/**
 * Clôt la ligne réservée.
 *
 * `p_organization_id` est passé : la clé de déduplication n'identifie une
 * ligne sans ambiguïté qu'à l'intérieur d'une organisation, et une clôture
 * non scopée pourrait fermer la ligne d'une autre.
 *
 * L'échec de clôture n'interrompt rien : le message, lui, est parti ou non.
 * Une ligne restée `sending` sera reprise par la fenêtre de péremption de
 * `claim_sms_delivery`, sans second débit.
 */
async function finishSmsDelivery(
  admin: AdminClient,
  organizationId: string,
  dedupKey: string,
  outcome:
    | { status: "sent"; providerMessageId: string | null }
    | { status: "failed" | "undeliverable"; error: string },
): Promise<void> {
  const { error } = await admin.rpc("finish_sms_delivery", {
    p_organization_id: organizationId,
    p_dedup_key: dedupKey,
    p_status: outcome.status,
    p_provider_message_id:
      outcome.status === "sent" ? outcome.providerMessageId : null,
    p_error: outcome.status === "sent" ? null : outcome.error,
  });
  if (error) reportError("sms.finish", error.message);
}
