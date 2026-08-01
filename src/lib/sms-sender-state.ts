/* ════════════════════════════════════════════════════════════
 * L'ÉTAT D'UN EXPÉDITEUR SMS, LU DE LA MÊME FAÇON DES DEUX CÔTÉS
 *
 * ── LE DÉFAUT QUE CE MODULE FERME ───────────────────────────
 *
 * `set_sms_sender_status(…, 'retired')` CONSERVE le statut de la ligne
 * (20260824120000 : `status = case when p_status = 'retired' then s.status
 * else p_status end`). Une ligne suspendue puis retirée porte donc encore
 * `status = 'suspended'` ET `retired_at` renseigné — c'est délibéré, et c'est
 * ce qui empêche un retrait de valoir levée de sanction.
 *
 * Les deux écrans lisaient cet état à moitié, chacun à sa façon :
 *
 *   · le commerçant ne voyait RIEN — `loadSmsSettings` filtrait `retired_at is
 *     null`, donc l'écran annonçait « aucun expéditeur demandé » à une
 *     organisation sanctionnée ;
 *   · le back-office affichait « retiré », le mot qui efface précisément
 *     l'information à ne pas perdre.
 *
 * Et depuis que `request_sms_sender` ne touche plus une ligne suspendue
 * (20260828120000), le bouton du commerçant est un NO-OP MUET : il clique,
 * rien ne bouge, rien ne le lui dit. Ce dépôt a déjà payé cette forme en
 * caisse — un bouton qui ne fait rien sans le dire est pire qu'un bouton
 * absent, parce que le commerçant recommence puis conclut à une panne.
 *
 * ── POURQUOI UN MODULE PUR ──────────────────────────────────
 *
 * La règle « suspendu puis retiré reste une suspension » doit être la MÊME
 * des deux côtés, sinon les deux écrans se remettent à diverger. Ce dépôt n'a
 * pas d'environnement de rendu React : une logique laissée dans un composant
 * est une logique que personne ne peut vérifier.
 *
 * ── CE MODULE NE DÉCIDE D'AUCUN DROIT ───────────────────────
 *
 * La garde qui compte est en base : `declare_sms_sender` refuse tant que
 * l'organisation porte une ligne `suspended`, retirée ou non
 * (20260829120000). Ce qui est calculé ici sert à AFFICHER et à EXPLIQUER,
 * jamais à autoriser — dupliquer la garde côté client la rendrait
 * contournable et donnerait l'illusion qu'elle vit ici.
 * ════════════════════════════════════════════════════════════ */

/** Une ligne de `sms_senders`, réduite à ce qui décide de son affichage. */
export interface SmsSenderRecord {
  senderId: string;
  status: string;
  retiredAt: string | null;
}

/**
 * L'état affichable, statut ET retrait combinés.
 *
 * `suspended_retired` est le seul cas que ni `status` ni `retired_at` ne
 * disent seuls, et c'est celui qui manquait aux deux écrans.
 */
export type SmsSenderPhase =
  | "pending"
  | "declared"
  | "rejected"
  | "suspended"
  | "suspended_retired"
  | "retired"
  | "unknown";

const KNOWN_STATUSES = new Set([
  "pending",
  "declared",
  "rejected",
  "suspended",
]);

/** Combine statut et retrait en un seul état. */
export function resolveSenderPhase(record: SmsSenderRecord): SmsSenderPhase {
  const retired = record.retiredAt !== null;

  if (!KNOWN_STATUSES.has(record.status)) {
    // Un statut inconnu retiré reste inconnu : on ne le requalifie pas en
    // « retiré » sous prétexte qu'il porte une date. Mieux vaut un écran qui
    // dit « état imprévu » qu'un écran qui invente.
    return "unknown";
  }
  if (record.status === "suspended") {
    return retired ? "suspended_retired" : "suspended";
  }
  return retired ? "retired" : (record.status as SmsSenderPhase);
}

/**
 * La suspension NON RÉSOLUE de l'organisation, s'il y en a une.
 *
 * « Non résolue » et non « active » : le retrait n'y change rien, exactement
 * comme en base. La sanction porte sur le DROIT D'ÉMETTRE de l'organisation et
 * pas sur un nom — c'est ce qui ferme le contournement MONRESTO → MONRESTO2.
 *
 * Rend la ligne et non un booléen : les deux écrans doivent NOMMER
 * l'expéditeur sanctionné, sinon le commerçant ne sait pas de quoi on parle.
 */
export function findUnresolvedSuspension(
  records: readonly SmsSenderRecord[],
): SmsSenderRecord | null {
  return (
    records.find((record) => {
      const phase = resolveSenderPhase(record);
      return phase === "suspended" || phase === "suspended_retired";
    }) ?? null
  );
}

/**
 * CE QUE L'ÉCRAN DOIT ANNONCER EN TÊTE, dérivé de ce qui DÉCIDE l'envoi.
 *
 * ── Le défaut que cette fonction ferme ──────────────────────
 *
 * L'écran commerçant lisait la SUSPENSION pour annoncer « aucun SMS ne part »,
 * et lisait la LIGNE pour annoncer, deux lignes plus bas, « vos SMS partent
 * sous ce nom ». Les deux phrases pouvaient être affichées ensemble, et l'une
 * des deux était fausse.
 *
 * Elles pouvaient l'être parce que `sms_senders_one_usable_per_org` est un
 * index PARTIEL : il n'interdit qu'un second expéditeur utilisable. Une
 * organisation peut donc porter une ligne `declared` vivante ET une ligne
 * `suspended` — et `sms_sender_for_send` (20260824120000) ne regarde que
 * `status = 'declared' and retired_at is null`, donc rend le déclaré : les
 * SMS PARTENT.
 *
 * ── La règle retenue ────────────────────────────────────────
 *
 * Ce qui décide l'envoi est l'EXISTENCE D'UN EXPÉDITEUR UTILISABLE, jamais la
 * présence d'une suspension quelque part. Une suspension non résolue reste
 * signalée — elle bloque réellement la PROCHAINE déclaration
 * (`declare_sms_sender`, 20260829120000) — mais elle n'est plus annoncée comme
 * un arrêt des envois quand les envois continuent.
 */
export type SmsSendingHeadline =
  /** Un expéditeur utilisable, rien à signaler. */
  | "sending"
  /** Les SMS partent, ET une suspension non levée bloque toute redéclaration. */
  | "sending_despite_sanction"
  /** Aucun expéditeur utilisable, et une suspension l'explique. */
  | "halted"
  /** Aucun expéditeur utilisable, une déclaration est en cours. */
  | "pending"
  /** Aucun expéditeur utilisable, et rien en cours. */
  | "none";

export interface SmsSendingState {
  /** L'expéditeur sous lequel les SMS partent réellement, ou `null`. */
  usableSenderId: string | null;
  /** La suspension non résolue, s'il y en a une — nommée, jamais booléenne. */
  suspension: SmsSenderRecord | null;
  headline: SmsSendingHeadline;
}

/** Miroir exact de `sms_sender_for_send` : `declared` ET non retiré. */
function isUsable(record: SmsSenderRecord): boolean {
  return resolveSenderPhase(record) === "declared";
}

export function resolveSmsSendingState(
  records: readonly SmsSenderRecord[],
): SmsSendingState {
  const usable = records.find(isUsable) ?? null;
  const suspension = findUnresolvedSuspension(records);

  let headline: SmsSendingHeadline;
  if (usable) {
    headline = suspension ? "sending_despite_sanction" : "sending";
  } else if (suspension) {
    headline = "halted";
  } else if (records.some((record) => resolveSenderPhase(record) === "pending")) {
    headline = "pending";
  } else {
    headline = "none";
  }

  return { usableSenderId: usable?.senderId ?? null, suspension, headline };
}

/**
 * Cette ligne doit-elle rester sous les yeux du commerçant ?
 *
 * Un expéditeur retiré ordinairement n'a plus d'intérêt : il encombre. Une
 * suspension retirée, si : c'est la seule trace à l'écran de ce qui bloque
 * toutes ses demandes suivantes.
 */
export function isVisibleToMerchant(record: SmsSenderRecord): boolean {
  if (record.retiredAt === null) return true;
  return resolveSenderPhase(record) === "suspended_retired";
}

/**
 * Le refus opposé à une demande d'expéditeur, quand l'organisation porte une
 * suspension non résolue.
 *
 * Il NOMME l'expéditeur sanctionné et le chemin de sortie — le support, pas un
 * bouton : la levée appartient à la plateforme qui a prononcé la sanction
 * (`set_sms_sender_status(…, 'pending', <motif>)`). Un refus qui ne dit pas
 * par où sortir renvoie le commerçant au même clic muet.
 *
 * ── CE QU'IL NE DIT PAS, ET POURQUOI ────────────────────────
 *
 * Il ne parle PAS de l'état des envois. Sa première rédaction ouvrait sur
 * « Vos envois SMS sont suspendus » — faux dans l'état `sending_despite_sanction`,
 * où une organisation porte un expéditeur `declared` actif ET une suspension
 * sur une AUTRE ligne : les SMS partent. Le commerçant lisait alors le bandeau
 * ambre « vos SMS continuent de partir », demandait un autre nom, et recevait
 * deux clics plus loin « vos envois sont suspendus ». Le même écran se
 * contredisait.
 *
 * Ce message ne porte donc que sur ce qu'une suspension bloque RÉELLEMENT dans
 * tous les cas : la demande et la déclaration. C'est exactement la garde que
 * `declare_sms_sender` applique à l'échelle de l'ORGANISATION.
 */
export function suspensionRefusalMessage(senderId: string): string {
  return `Une suspension non résolue pèse sur votre établissement (expéditeur « ${senderId} »). Tant qu'elle n'est pas levée par notre équipe, aucun nouveau nom ne peut être demandé ni déclaré — y compris un nom différent. Écrivez-nous pour la faire examiner.`;
}
