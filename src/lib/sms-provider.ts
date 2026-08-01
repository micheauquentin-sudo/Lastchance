import "server-only";

import { optionalEnv } from "@/lib/env";
import { brevoSmsProvider } from "@/lib/brevo";

/* ════════════════════════════════════════════════════════════
 * L'INTERFACE DU PRESTATAIRE SMS
 *
 * Le reste du produit ne connaît que ce fichier. `src/lib/brevo.ts` est le
 * SEUL module qui sache qu'on parle à Brevo — même réflexe que `getStripe()`
 * pour Stripe, à ceci près qu'ici il n'existe pas de SDK : l'adaptateur est
 * écrit en REST pur, comme `src/lib/upstash.ts`.
 *
 * Pourquoi une interface pour un seul prestataire : parce que le socle SQL a
 * été écrit sans en présumer un (« aucune table de secrets, aucune clé
 * d'API », 20260823120000), et que la seule chose que le worker doit savoir
 * est TROIS ISSUES POSSIBLES. Ces trois issues ne sont pas un détail
 * d'implémentation : elles sont la frontière exacte de
 * `finish_sms_delivery`, dont le commentaire dit que la distinction
 * temporaire / définitif « appartient à l'APPELANT, seul à lire le code du
 * prestataire ». C'est ici que cet appelant vit.
 * ════════════════════════════════════════════════════════════ */

/**
 * Le message à composer.
 *
 * `recipient` est le numéro tel que `claim_sms_delivery` l'a écrit dans
 * `sms_log.recipient` — DÉJÀ normalisé E.164. Le worker le relit en base et
 * le passe tel quel. Aucune implémentation de cette interface n'a le droit de
 * le renormaliser : ce serait le second site de normalisation, et le jour où
 * les deux divergent le SMS part vers un numéro dont le consentement n'a pas
 * été vérifié.
 */
export interface SmsSendRequest {
  recipient: string;
  /** Expéditeur alphanumérique déclaré AF2M, gelé sur la ligne d'envoi. */
  sender: string;
  content: string;
  /** Publicitaire (`true`) ou transactionnel. Change la catégorie déclarée. */
  marketing: boolean;
  /** Clé d'unicité, transmise au prestataire pour le rapprochement support. */
  dedupKey: string;
}

/**
 * Les trois issues, et elles seules.
 *
 *   sent           parti. Le crédit est consommé, définitivement.
 *   failed         échec TEMPORAIRE : la même requête pourrait réussir plus
 *                  tard. Rejouable, crédit CONSERVÉ pour la reprise.
 *   undeliverable  échec DÉFINITIF : la même requête sera toujours refusée.
 *                  Non rejouable, crédit REMBOURSÉ.
 *
 * Confondre les deux dernières coûte dans les deux sens, et c'est pour cela
 * que la frontière est nommée ici plutôt que laissée au jugement de chaque
 * appelant : traiter un définitif en temporaire fait tourner un numéro mort
 * jusqu'au plafond de tentatives ; traiter un temporaire en définitif
 * rembourse un message qui serait parti, et interdit à jamais de le renvoyer
 * (`claim_sms_delivery` refuse toute reprise sur `undeliverable`).
 */
export type SmsSendOutcome =
  | { status: "sent"; providerMessageId: string | null; segments: number }
  | { status: "failed"; error: string }
  | { status: "undeliverable"; error: string };

export interface SmsProvider {
  readonly name: string;
  send(request: SmsSendRequest): Promise<SmsSendOutcome>;
}

/**
 * Le prestataire configuré, ou `null`.
 *
 * `null` n'est pas une erreur : c'est un environnement sans clé — un aperçu,
 * un poste de développement, la CI. Le worker s'en sert pour ne RIEN réserver
 * (voir `processSmsSendJob`), ce qui est la garantie qu'une absence de
 * configuration ne débite personne.
 *
 * La clé vient de l'environnement et de nulle part ailleurs. Elle n'est
 * jamais lue en base, jamais journalisée, jamais renvoyée à un écran.
 */
export function getSmsProvider(): SmsProvider | null {
  const apiKey = optionalEnv("BREVO_API_KEY");
  if (!apiKey) return null;
  return brevoSmsProvider(apiKey);
}

/** Y a-t-il de quoi envoyer ? Sans révéler quoi que ce soit de la clé. */
export function isSmsConfigured(): boolean {
  return Boolean(optionalEnv("BREVO_API_KEY"));
}
