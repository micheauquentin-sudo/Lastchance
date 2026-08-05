import { ADDON_OFFERS } from "@/lib/plans";
import type { Entitlement } from "@/platform/experiences/contract";

/**
 * CE QU'UNE SESSION DE PAIEMENT DIT D'UN ACHAT D'ADD-ON.
 *
 * Jumeau de `readSmsCreditPurchase` (src/lib/stripe.ts), dont il reprend la
 * doctrine point par point — y compris le croisement des deux porteurs
 * d'identité, dont le motif vaut ici mot pour mot.
 *
 * ── QUATRE ISSUES, PARCE QU'ELLES N'APPELLENT PAS LA MÊME CONDUITE ──
 *
 *   * `none`    : toutes les autres sessions de checkout passent par là. Le
 *                 webhook les acquitte en silence.
 *   * `unpaid`  : le tunnel est terminé, l'encaissement ne l'est pas (virement,
 *                 prélèvement). Rien à retenter : Stripe tranchera par
 *                 `async_payment_succeeded` ou `async_payment_failed`. L'issue
 *                 PORTE l'organisation, pour qu'un échec cinq jours plus tard
 *                 se journalise chez le bon commerçant.
 *   * `invalid` : défaut de NOTRE propre metadata, pas une panne. À remonter,
 *                 et à acquitter quand même — la metadata est gelée sur la
 *                 session, aucun rejeu ne la réparera, et un 500 ferait
 *                 retenter Stripe trois jours avant de désactiver le point
 *                 d'entrée, ce qui couperait aussi la synchronisation des
 *                 abonnements.
 *   * `grant`   : le seul qui écrit.
 */

/** Marqueur de metadata. Distinct de celui des crédits SMS, et c'est voulu. */
export const MODULE_GRANT_PURCHASE = "module_grant";

export type ModuleGrantPurchase =
  | { kind: "none" }
  | { kind: "unpaid"; organizationId: string }
  | { kind: "invalid"; reason: string }
  | {
      kind: "grant";
      organizationId: string;
      entitlement: Entitlement;
      /** Jauge choisie avant paiement, `null` hors pass à jauge. */
      capacity: number | null;
      /**
       * Instant de l'ACHAT, et non de la réception du webhook.
       *
       * C'est lui qui sert à calculer « activable dans les 90 jours ».
       * Utiliser `new Date()` ferait dépendre la fenêtre du moment où Stripe a
       * réussi à nous joindre : un webhook rejoué le lendemain d'une panne
       * offrirait un jour de plus, et un encaissement différé de cinq jours
       * décalerait la fenêtre d'autant. La date de la session est la seule qui
       * décrive ce que le client a acheté.
       */
      acheteA: Date;
    };

export function readModuleGrantPurchase(session: {
  client_reference_id?: string | null;
  payment_status?: string | null;
  created?: number | null;
  metadata?: Record<string, string> | null;
}): ModuleGrantPurchase {
  const metadata = session.metadata ?? {};
  if (metadata.purchase !== MODULE_GRANT_PURCHASE) return { kind: "none" };

  // ── LES DEUX PORTEURS D'IDENTITÉ SONT CROISÉS ──────────────
  // Même raisonnement que pour les crédits SMS : la classe fermée d'avance est
  // celle du Payment Link, où `client_reference_id` s'ajoute À L'URL par le
  // payeur. Sur un lien dont la metadata porterait ce marqueur, n'importe qui
  // pourrait sinon désigner l'organisation à qui offrir un module. Exiger les
  // deux plutôt que se replier sur celui qui est présent : un repli laisserait
  // précisément la porte ouverte au porteur manipulable.
  const referenced = (session.client_reference_id ?? "").trim();
  const declared = (metadata.organization_id ?? "").trim();
  if (!referenced || !declared) {
    return {
      kind: "invalid",
      reason:
        "organisation absente de la session " +
        `(client_reference_id ${referenced ? "présent" : "absent"}, ` +
        `metadata.organization_id ${declared ? "présente" : "absente"})`,
    };
  }
  if (referenced !== declared) {
    return {
      kind: "invalid",
      reason: `les deux porteurs d'identité se contredisent : client_reference_id ${referenced} ≠ metadata.organization_id ${declared}`,
    };
  }
  const organizationId = declared;

  // LA GARDE QUI OUVRE UN MODULE SI ELLE MANQUE. `checkout.session.completed`
  // est émis dès que le client termine le tunnel, y compris pour un moyen de
  // paiement asynchrone dont l'encaissement peut échouer des jours plus tard.
  // Octroyer sur autre chose que `paid`, c'est ouvrir un module jamais payé —
  // et la pause étant dérivée d'une échéance, rien ne le refermerait avant.
  if (session.payment_status !== "paid") return { kind: "unpaid", organizationId };

  // L'ADD-ON EST RELU DANS LE CATALOGUE, jamais cru sur parole. La metadata a
  // transité par le navigateur ; ce qu'on en accepte est une CLÉ d'un
  // vocabulaire fermé, et tout le reste (durée, fenêtre, modèle) est relu côté
  // serveur. Un add-on retiré du catalogue depuis l'achat rend donc `invalid`
  // plutôt que d'octroyer quelque chose qui ne se vend plus.
  const demande = (metadata.entitlement ?? "").trim();
  const offre = ADDON_OFFERS.find((o) => o.entitlement === demande);
  if (!offre) {
    return {
      kind: "invalid",
      reason: `add-on « ${demande || "(absent)"} » absent du catalogue`,
    };
  }

  // La jauge n'est lue que là où elle a un sens. La VALIDER contre les paliers
  // vendus n'appartient pas à ce lecteur : c'est `termesDepuisCatalogue` qui
  // s'en charge, avec le catalogue sous la main. Ici on la transporte, et un
  // nombre illisible est un défaut de notre metadata, donc `invalid`.
  let capacity: number | null = null;
  if (offre.billing.model === "capacity-pass") {
    const brut = (metadata.capacity ?? "").trim();
    const valeur = Number.parseInt(brut, 10);
    if (!brut || !Number.isSafeInteger(valeur) || valeur <= 0) {
      return {
        kind: "invalid",
        reason: `jauge illisible pour un pass à jauge : « ${brut || "(absente)"} »`,
      };
    }
    capacity = valeur;
  }

  // `created` est en SECONDES chez Stripe. L'oublier donnerait une date de
  // 1970, donc une fenêtre d'activation expirée depuis cinquante ans — le
  // commerçant paierait un pass déjà périmé.
  const cree = session.created;
  if (typeof cree !== "number" || !Number.isFinite(cree) || cree <= 0) {
    return { kind: "invalid", reason: "session sans date de création exploitable" };
  }

  return {
    kind: "grant",
    organizationId,
    entitlement: offre.entitlement,
    capacity,
    acheteA: new Date(cree * 1000),
  };
}
