"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import {
  causeAnnulationRegistre,
  type CauseAnnulation,
} from "@/lib/annulation-cause";
import { getUserAndOrg } from "@/lib/auth";
import { expireGoogleWalletPass } from "@/lib/google-wallet";
import { recordCounter, reportError } from "@/lib/monitoring";
import {
  formatFenetreStock,
  libelleRetraitTropTot,
} from "@/lib/reserver";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  formatDate,
  normalizeCalendarCode,
  normalizeContestCode,
  normalizeEventCode,
  normalizeHuntCode,
  normalizeJackpotCode,
  normalizeLoyaltyCode,
  normalizeQuizCode,
  normalizeRedeemCode,
  normalizeReferralCode,
  normalizeStockHoldCode,
  sanitizeSearchTerm,
  type ActionResult,
} from "@/lib/utils";
import { calendarRedeemCodeSchema } from "@/lib/validations/calendar";
import { eventRedeemCodeSchema } from "@/lib/validations/events";
import { huntRedeemCodeSchema } from "@/lib/validations/hunts";
import { jackpotRedeemCodeSchema } from "@/lib/validations/jackpot";
import { loyaltyRedeemCodeSchema } from "@/lib/validations/loyalty";
import { contestRedeemCodeSchema } from "@/lib/validations/pronostics";
import { quizRedeemCodeSchema } from "@/lib/validations/quiz";
import { referralRedeemCodeSchema } from "@/lib/validations/referral";
import { stockHoldRedeemCodeSchema } from "@/lib/validations/reserver";
import { RATE_LIMITS, rateLimit, rateLimitBucket } from "@/lib/rate-limit";
import type { ContestAwardStatus } from "@/types/database";

export interface CashierParticipation {
  id: string;
  created_at: string;
  first_name: string | null;
  redeem_code: string | null;
  redeemed_at: string | null;
  /** Échéance SERVEUR du code (null : sans limite). */
  redeem_expires_at: string | null;
  cancelled_at: string | null;
  basket_cents: number | null;
  prizes: { label: string; description: string } | null;
  campaigns: { name: string } | null;
}

/**
 * Lecture d'un lot de roue par son code (org-scopée).
 *
 * NON EXPORTÉE — comme les huit autres `lookup…ByCode`. Ce fichier est un
 * module `"use server"` : tout export y devient un endpoint réseau, qu'il
 * faudrait alors protéger individuellement. Les garder privées est ce qui
 * autorise `lookupRedeemCode` — SEUL point d'entrée de la caisse — à ne
 * consommer qu'UN jeton `cashier:lookup` pour l'ensemble du routage.
 */
async function lookupParticipationByCode(
  code: string,
): Promise<CashierParticipation | null> {
  const { user, organization } = await getUserAndOrg();
  if (!user || !organization) redirect("/login");
  const { data } = await createAdminClient()
    .from("participations")
    .select(
      "id, created_at, first_name, redeem_code, redeemed_at, redeem_expires_at, cancelled_at, basket_cents, prizes!participations_prize_id_fkey(label, description), campaigns!participations_campaign_id_fkey(name)",
    )
    .eq("organization_id", organization.id)
    .eq("redeem_code", code)
    .limit(1)
    .maybeSingle();
  return data as unknown as CashierParticipation | null;
}

/** « 12,50 » / « 12.50 » / « 12 » → centimes (null si vide). */
function parseBasketToCents(raw: string): number | null | undefined {
  const trimmed = raw.trim();
  if (trimmed === "") return null;
  const normalized = trimmed.replace(/\s/g, "").replace(",", ".");
  const value = Number(normalized);
  if (!Number.isFinite(value) || value < 0 || value > 1_000_000) return undefined;
  return Math.round(value * 100);
}

type UniversalRedeemState =
  | "redeemed"
  | "already_redeemed"
  | "cancelled"
  | "expired"
  | "source_missing"
  | "source_refused";

interface UniversalRedeemResult {
  source_type: CashierMatch["source"];
  state: UniversalRedeemState;
  redeemed_at: string | null;
  expires_at: string | null;
  cancelled_at: string | null;
  redeemed_now: boolean;
}

/**
 * Ce que le registre a répondu — et les DEUX absences de ligne sont distinguées.
 *
 * `registry_error` : la RPC elle-même a échoué. On ne sait RIEN du code.
 * `unknown_code`   : la RPC a répondu, et ne connaît pas ce code.
 *
 * Les neuf familles à repli legacy traitent les deux pareil, et elles ont
 * raison : dans les deux cas il faut essayer l'autre porte. La dixième
 * (`reserver_stock`) n'a PAS de repli — c'est le seul chemin de sa caisse — et
 * pour elle les deux mots opposés sont dus au caissier : « code introuvable »
 * l'envoie refaire saisir, « validation impossible » l'envoie réessayer. Les
 * confondre faisait dire « introuvable » sur un lot parfaitement valide chaque
 * fois que la base toussait, c'est-à-dire au pire moment.
 */
type UniversalRedeemOutcome =
  | { kind: "row"; row: UniversalRedeemResult }
  | { kind: "unknown_code" }
  | { kind: "registry_error" };

/**
 * Tente le nouveau registre avant la RPC historique.
 *
 * ── Pourquoi ces deux compteurs ──
 *
 * Le repli legacy est SILENCIEUX par construction : quand le registre ne
 * connaît pas un code, la caisse retombe sur la RPC historique et le caissier
 * ne voit rien. C'est voulu — mais cela rend le repli impossible à retirer,
 * puisque rien ne dit s'il sert encore. Ces compteurs répondent à la seule
 * question qui gouverne la bascule : « reste-t-il des codes que le moteur
 * unique ne voit pas, et dans quelle famille ? »
 *
 * Zéro ligne est la valeur saine, donc l'instrumentation ne coûte rien en
 * régime nominal. On ne compte JAMAIS le code lui-même (secret porteur) :
 * seule la famille est étiquetée.
 */
async function tryUniversalRedeem(
  admin: ReturnType<typeof createAdminClient>,
  organizationId: string,
  code: string,
  actor: string,
  family: CashierMatch["source"],
  basketCents: number | null = null,
): Promise<UniversalRedeemOutcome> {
  const { data, error } = await admin.rpc("redeem_reward_by_code", {
    p_organization_id: organizationId,
    p_code: code,
    p_actor: actor,
    p_basket_cents: basketCents,
  });
  if (error) {
    // Déploiement progressif : le code applicatif peut précéder brièvement la
    // migration. Ne jamais loguer le code (secret porteur) ni le détail DB.
    console.warn("[rewards] registre universel indisponible, repli legacy");
    recordCounter("rewards.registry_error");
    return { kind: "registry_error" };
  }
  const row = (data as UniversalRedeemResult[] | null)?.[0] ?? null;
  if (!row) {
    // Le moteur ne connaît pas ce code : c'est le repli legacy qui va sauver
    // l'encaissement. Tant que ce compteur n'est pas durablement à zéro pour
    // une famille, retirer son repli ferait dire « code introuvable » à un
    // caissier tenant un lot valide.
    recordCounter(`rewards.registry_miss.${family}`);
    return { kind: "unknown_code" };
  }
  return { kind: "row", row };
}

/**
 * Motif du refus de la base, rendu au caissier.
 *
 * ── Pourquoi le fuseau et le drapeau « dates détaillées » sont UN seul champ ──
 *
 * Ces messages datés retombaient sur `Europe/Paris`, le défaut de `formatDate`.
 * Un commerçant de Papeete lisait donc « déjà remis le 31 juil. 06:20 » pour une
 * remise faite le 30 à 18:20 : le MAUVAIS JOUR — pendant que la carte juste
 * au-dessus, qui reçoit `organization.timezone`, affichait la bonne date. Deux
 * dates du même écran se contredisaient.
 *
 * Un booléen `detailedDates` séparé du fuseau permettrait de redemander des
 * dates sans redonner le fuseau, et de rouvrir exactement ce défaut. C'est donc
 * le fuseau LUI-MÊME qui commande : `null` = messages génériques, non datés.
 */
function universalRedeemFailure(
  row: UniversalRedeemResult,
  noun: "gain" | "lot",
  datesDansLeFuseau: string | null = null,
): ActionResult {
  if (row.state === "cancelled" || row.cancelled_at) {
    return { ok: false, error: `Ce ${noun} a été annulé` };
  }
  if (row.state === "expired") {
    return {
      ok: false,
      error:
        datesDansLeFuseau && row.expires_at
          ? `Code expiré le ${formatDate(row.expires_at, datesDansLeFuseau)} — le délai de retrait est dépassé`
          : "Code expiré — le délai de retrait est dépassé",
    };
  }
  if (row.state === "already_redeemed" || row.redeemed_at) {
    return {
      ok: false,
      error:
        datesDansLeFuseau && row.redeemed_at
          ? `Ce ${noun} a déjà été remis le ${formatDate(row.redeemed_at, datesDansLeFuseau)}`
          : `Ce ${noun} a déjà été ${noun === "gain" ? "validé" : "remis"}`,
    };
  }
  return { ok: false, error: `Ce ${noun} ne peut pas être remis` };
}

async function redeemThroughUniversalRegistry(
  admin: ReturnType<typeof createAdminClient>,
  organizationId: string,
  code: string,
  actor: string,
  options: {
    noun: "gain" | "lot";
    family: CashierMatch["source"];
    basketCents?: number | null;
    /**
     * Fuseau de l'ÉTABLISSEMENT pour dater le motif de refus. Absent = motifs
     * génériques, non datés. Voir `universalRedeemFailure` : donner une date
     * sans donner le fuseau est précisément ce qui faisait lire le mauvais jour
     * à un commerçant hors métropole.
     */
    datesDansLeFuseau?: string | null;
    revalidate?: string[];
  },
): Promise<ActionResult | null> {
  const issue = await tryUniversalRedeem(
    admin,
    organizationId,
    code,
    actor,
    options.family,
    options.basketCents,
  );
  // `null` = « le registre n'a pas tranché, essaie l'autre porte ». Les deux
  // absences de ligne y mènent, et c'est correct POUR CES FAMILLES-LÀ : elles
  // ont un repli legacy, qui est la bonne réponse à un registre muet comme à un
  // registre en panne. Seule la famille sans repli a besoin de les distinguer.
  if (issue.kind !== "row") return null;
  const row = issue.row;
  if (!row.redeemed_now) {
    return universalRedeemFailure(
      row,
      options.noun,
      options.datesDansLeFuseau ?? null,
    );
  }

  void expireGoogleWalletPass(code);
  for (const path of options.revalidate ?? ["/dashboard/redeem"]) {
    revalidatePath(path);
  }
  return { ok: true, data: undefined };
}

const redeemSchema = z.object({ id: z.string().uuid() });

/**
 * Marque un gain comme récupéré (présenté en caisse), avec montant du
 * panier facultatif. L'expiration et l'annulation sont vérifiées par la
 * RPC en base — le compte à rebours client n'est qu'un affichage.
 */
export async function redeemParticipation(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = redeemSchema.safeParse({ id: formData.get("id") });
  if (!parsed.success) return { ok: false, error: "Données invalides" };

  const basketCents = parseBasketToCents(String(formData.get("basket") ?? ""));
  if (basketCents === undefined) {
    return { ok: false, error: "Montant du panier invalide" };
  }

  const { user, organization } = await getUserAndOrg();
  if (!user || !organization) redirect("/login");

  const allowed = await rateLimit(
    rateLimitBucket("cashier:redeem", organization.id, user.id),
    RATE_LIMITS.cashier,
    { failClosed: true },
  );
  if (!allowed) return { ok: false, error: "Trop de tentatives, patientez." };
  const admin = createAdminClient();
  const { data: target } = await admin
    .from("participations")
    .select("redeem_code")
    .eq("id", parsed.data.id)
    .eq("organization_id", organization.id)
    .maybeSingle();
  if (!target?.redeem_code) return { ok: false, error: "Gain introuvable" };

  const universal = await redeemThroughUniversalRegistry(
    admin,
    organization.id,
    target.redeem_code,
    user.id,
    {
      noun: "gain",
      family: "wheel",
      basketCents,
      revalidate: ["/dashboard/participations", "/dashboard/redeem"],
    },
  );
  if (universal) return universal;

  const { data: rows, error } = await admin.rpc("redeem_by_code", {
    p_organization_id: organization.id,
    p_redeem_code: target.redeem_code,
    p_actor: user.id,
    p_basket_cents: basketCents,
  });

  if (error) {
    reportError("participations.redeem", error.message);
    return { ok: false, error: "Validation impossible" };
  }
  const row = (rows as Array<{
    redeemed_now: boolean;
    redeemed_at: string | null;
    redeem_expires_at: string | null;
    cancelled_at: string | null;
  }> | null)?.[0];
  if (!row?.redeemed_now) {
    // La base a refusé : dire précisément pourquoi à la caisse.
    if (row?.cancelled_at) return { ok: false, error: "Ce gain a été annulé" };
    if (
      row &&
      row.redeemed_at === null &&
      row.redeem_expires_at &&
      new Date(row.redeem_expires_at).getTime() <= Date.now()
    ) {
      return { ok: false, error: "Code expiré — le délai de retrait est dépassé" };
    }
    return { ok: false, error: "Ce gain a déjà été validé" };
  }

  // Le pass Google Wallet du client est invalidé (best-effort).
  void expireGoogleWalletPass(target.redeem_code);

  revalidatePath("/dashboard/participations");
  revalidatePath("/dashboard/redeem");
  return { ok: true, data: undefined };
}

const cancelSchema = z.object({
  id: z.string().uuid(),
  reason: z.string().trim().min(5, "Motif requis (5 caractères minimum)").max(300),
});

/**
 * Annule un gain réclamé mais pas encore retiré (fraude, erreur,
 * rupture) : motif journalisé, lot remis en stock, code désactivé,
 * pass Wallet invalidé.
 */
export async function cancelParticipation(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = cancelSchema.safeParse({
    id: formData.get("id"),
    reason: formData.get("reason"),
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0].message };
  }

  const { user, organization, role } = await getUserAndOrg();
  if (!user || !organization) redirect("/login");
  if (role !== "owner" && role !== "editor") {
    return { ok: false, error: "Action non autorisée" };
  }

  const admin = createAdminClient();
  const { data: target } = await admin
    .from("participations")
    .select("redeem_code")
    .eq("id", parsed.data.id)
    .eq("organization_id", organization.id)
    .maybeSingle();

  const { data: cancelled, error } = await admin.rpc("cancel_participation", {
    p_organization_id: organization.id,
    p_participation_id: parsed.data.id,
    p_reason: parsed.data.reason,
    p_restock: true,
  });
  if (error) {
    reportError("participations.cancel", error.message);
    return { ok: false, error: "Annulation impossible" };
  }
  if (cancelled !== true) {
    return {
      ok: false,
      error: "Ce gain est déjà retiré ou annulé — plus rien à annuler.",
    };
  }

  if (target?.redeem_code) void expireGoogleWalletPass(target.redeem_code);

  revalidatePath("/dashboard/participations");
  revalidatePath("/dashboard/redeem");
  return { ok: true, data: undefined };
}

// ────────────────────────────────────────────────────────────
// Caisse unifiée : lot de roue (participation) OU chasse au trésor
// ────────────────────────────────────────────────────────────

/** Complétion de chasse retrouvée en caisse par son code (CHASSE-…). */
export interface CashierHuntCompletion {
  id: string;
  code: string;
  completed_at: string;
  redeemed_at: string | null;
  hunt_name: string;
  reward_label: string;
  reward_details: string | null;
}

/** Lot de fidélité retrouvé en caisse par son code (FIDELITE-…). */
export interface CashierLoyaltyReward {
  id: string;
  code: string;
  earned_at: string;
  redeemed_at: string | null;
  program_name: string;
  reward_label: string;
  reward_details: string | null;
}

/** Gain de jackpot retrouvé en caisse par son code (JACKPOT-…). */
export interface CashierJackpotWin {
  id: string;
  code: string;
  drawn_at: string;
  redeemed_at: string | null;
  campaign_name: string;
  reward_label: string;
  reward_details: string | null;
}

/** Gain de mode événement retrouvé en caisse par son code (EVENT-…). */
export interface CashierEventWin {
  id: string;
  code: string;
  won_at: string;
  redeemed_at: string | null;
  session_label: string;
  reward_label: string;
  reward_details: string | null;
}

/**
 * Lot de calendrier retrouvé en caisse par son code (CADEAU-…). `source`
 * distingue une case-lot (`day`) de la récompense d'assiduité (`completion`).
 */
export interface CashierCalendarReward {
  id: string;
  source: "day" | "completion";
  code: string;
  created_at: string;
  redeemed_at: string | null;
  calendar_name: string;
  reward_label: string;
  reward_details: string | null;
}

/**
 * Lot de parrainage retrouvé en caisse par son code (PARRAIN-…). `beneficiary`
 * distingue un versement au parrain, au filleul ou du coffre.
 */
export interface CashierReferralReward {
  id: string;
  code: string;
  created_at: string;
  redeemed_at: string | null;
  campaign_name: string;
  beneficiary: string;
  reward_label: string;
  reward_details: string | null;
}

/**
 * Lot de quiz retrouvé en caisse par son code (QUIZ-…). `source` reprend le mode
 * qui a émis le lot (threshold / draw / ranking / instant) et `rank` le rang du
 * gagnant pour les modes différés.
 */
export interface CashierQuizReward {
  id: string;
  code: string;
  created_at: string;
  redeemed_at: string | null;
  quiz_name: string;
  emitted_by: string;
  rank: number | null;
  reward_label: string;
  reward_details: string | null;
}

/**
 * Lot de pronostics retrouvé en caisse par son code (PRONO-…). Émis à la
 * CLÔTURE du championnat (finalize_contest) : `rank` est le rang du gagnant au
 * classement final. `status` porte le cycle de vie complet — un lot `cancelled`
 * par le commerçant reste retrouvable pour que la caisse puisse l'expliquer.
 */
export interface CashierContestAward {
  id: string;
  code: string;
  created_at: string;
  redeemed_at: string | null;
  /** Échéance SERVEUR du code (null : sans limite), figée à l'émission. */
  redeem_expires_at: string | null;
  status: ContestAwardStatus;
  rank: number | null;
  contest_name: string;
  player_name: string;
  reward_label: string;
  basket_cents: number | null;
}

/**
 * Unité de stock retrouvée en caisse par son code (RESA-…, RES-5).
 *
 * ── LA FENÊTRE VOYAGE AVEC LA PRISE, ET C'EST LE POINT DE CETTE FAMILLE ──
 *
 * `window_starts_at` / `window_ends_at` viennent de l'OFFRE ; `redeem_expires_at`
 * est l'échéance GRAVÉE SUR LA PRISE à l'instant où elle a été consentie. Les
 * deux dernières coïncident au moment de la prise et peuvent DIVERGER ensuite —
 * un commerçant qui décale sa fenêtre ne déplace pas l'échéance de prises déjà
 * consenties. La caisse applique l'échéance gravée pour refuser (c'est elle que
 * le registre lit), et affiche la fenêtre pour EXPLIQUER.
 *
 * `window_starts_at` porte la borne BASSE, qui n'existe nulle part ailleurs : un
 * code présenté avant elle ressort du routeur en `source_refused`, un état que le
 * registre ne sait pas nommer. Sans cette date à l'écran, le comptoir n'aurait
 * aucun moyen de dire quand revenir.
 *
 * `email` N'Y EST PAS, et ce n'est pas un oubli : le grant de colonnes de la
 * table l'exclut, et la caisse n'a rien à faire de l'adresse de quelqu'un qui se
 * tient devant elle.
 */
export interface CashierStockHold {
  id: string;
  code: string;
  created_at: string;
  redeemed_at: string | null;
  cancelled_at: string | null;
  /** Échéance SERVEUR gravée sur la prise — c'est elle qui fait expirer. */
  redeem_expires_at: string | null;
  basket_cents: number | null;
  /** Fenêtre de retrait de l'OFFRE — l'explication, jamais le juge. */
  window_starts_at: string;
  window_ends_at: string;
  offer_title: string;
  offer_description: string | null;
}

/**
 * Résultat unifié d'une recherche de code en caisse. L'UI distingue le lot
 * de roue, la chasse au trésor, le passeport de fidélité, le jackpot, le
 * mode événement, le calendrier, le parrainage, le quiz, les pronostics et la
 * réservation de stock par `source`.
 */
export type CashierMatch =
  | { source: "wheel"; participation: CashierParticipation }
  | { source: "hunt"; completion: CashierHuntCompletion }
  | { source: "loyalty"; reward: CashierLoyaltyReward }
  | { source: "jackpot"; win: CashierJackpotWin }
  | { source: "event"; win: CashierEventWin }
  | { source: "calendar"; reward: CashierCalendarReward }
  | { source: "referral"; reward: CashierReferralReward }
  | { source: "quiz"; reward: CashierQuizReward }
  | { source: "contest"; award: CashierContestAward }
  /**
   * `reserver_stock` ET NON `stock` : cette valeur est comparée telle quelle à
   * `reward_issuances.source_type` dans `lookupUniversalRewardRoute`. Un nom
   * d'écran plus court aurait fait échouer TOUT rapprochement, silencieusement —
   * la route ne serait jamais trouvée et chaque code RESA- retomberait sur le
   * routeur legacy.
   */
  | { source: "reserver_stock"; hold: CashierStockHold };

/**
 * Verdict d'une recherche en caisse. « Introuvable » et « trop de recherches »
 * sont deux états DISTINCTS et doivent le rester jusqu'à l'écran : confondus,
 * le comptoir annonce « Code introuvable » sur un lot parfaitement valide — en
 * plein coup de feu le caissier refuse alors un lot légitime, ou le remet à la
 * main hors traçabilité.
 */
export type CashierLookup =
  | {
      status: "found";
      match: CashierMatch;
      /**
       * Libellé GRAVÉ à l'émission, lu au registre universel.
       *
       * La caisse affichait jusqu'ici le libellé ACTUEL de la table
       * parente. Le commerçant renomme sa récompense — geste banal entre
       * deux opérations — et le client se présente avec un email qui
       * annonce « Café offert » devant un écran qui dit « Croissant
       * offert ». Rien ne disait lequel faisait foi ; le caissier
       * tranchait au comptoir, et dans les deux cas quelqu'un avait tort.
       *
       * `null` pour les lots ÉMIS AVANT le registre (codes historiques
       * non rétro-alimentés) : l'affichage retombe alors sur la table
       * parente, comme avant. Mieux vaut l'ancien comportement qu'un
       * écran vide.
       */
      frozenLabel?: string | null;
      /**
       * Description GRAVÉE à l'émission (`metadata->>'reward_details'`),
       * gelée par la migration 20260901120000.
       *
       * Le titre était déjà gravé ; la ligne juste en dessous restait la
       * description COURANTE de la table parente. Les deux lignes de la même
       * carte se contredisaient après une réécriture — et c'est la seconde
       * qui porte les CONDITIONS que le caissier applique au comptoir.
       *
       * `null` a trois causes qui se traitent pareil : code antérieur au
       * registre, description vide à l'émission, et la famille `contest` —
       * seule des neuf à ne jamais écrire `reward_details`
       * (20260805150000, l. 579-583). Dans les trois cas l'affichage retombe
       * sur la table parente : c'est le chemin NORMAL, pas une exception.
       */
      frozenDetails?: string | null;
    }
  | {
      /**
       * LE REGISTRE CONNAÎT CE CODE, SA SOURCE N'EXISTE PLUS.
       *
       * Depuis `20260902120000`, supprimer une roue, une chasse, un calendrier
       * ou un palier ANNULE la ligne de registre au lieu de la laisser active :
       * le portefeuille du client affiche « Annulé » et lui explique pourquoi.
       * La caisse, elle, restait sur « Code introuvable » — le même mot que pour
       * un code inventé — parce que `routeRedeemCode` rendait `null` dès que la
       * table legacy ne portait plus la ligne, sans jamais atteindre le message
       * juste que `universalRedeemFailure` sait déjà formuler.
       *
       * Les deux situations appellent des gestes OPPOSÉS : sur un code inventé
       * le caissier fait recommencer la saisie, sur un lot annulé il n'a rien à
       * vérifier — il explique. Les confondre, c'est envoyer le client relire
       * son e-mail pour un code qui ne redeviendra jamais valable.
       */
      status: "cancelled";
      /** Libellé gravé à l'émission : ce que le client croit venir chercher. */
      frozenLabel: string | null;
      /** Horodatage de l'annulation, daté dans le fuseau de l'établissement. */
      cancelledAt: string | null;
      /**
       * QUI a annulé — vocabulaire fermé, jamais le motif brut.
       *
       * La carte affirmait à tout coup « l'opération qui le portait a été
       * supprimée », phrase que le caissier répète AU CLIENT, en face. Depuis
       * que la rétention annule elle aussi des lignes, elle accusait
       * l'établissement d'un geste automatique. `null` pour les annulations
       * antérieures au suivi des causes.
       */
      cancelledCause: CauseAnnulation | null;
    }
  | { status: "not_found" }
  | { status: "rate_limited" };

type RewardRoute = {
  source: CashierMatch["source"];
  code: string;
  /** Libellé gravé, présent dès que le registre connaît ce code. */
  frozenLabel?: string | null;
  /** Description gravée, absente pour `contest` et pour un lot sans texte. */
  frozenDetails?: string | null;
  /**
   * Date d'annulation au registre, `null` tant que le lot est vivant. C'est
   * elle — et elle seule — qui autorise à dire « annulé » plutôt
   * qu'« introuvable » : un code jamais émis n'a aucune ligne ici, donc aucune
   * route, donc il reste introuvable.
   */
  cancelledAt?: string | null;
  /**
   * Cause NORMALISÉE de l'annulation, dérivée du motif brut par
   * `causeDepuisMotif`. Le motif lui-même ne quitte jamais cette fonction :
   * c'est du texte libre saisi par le commerçant, et la carte de caisse est
   * lue au comptoir, devant le client.
   */
  cancelledCause?: CauseAnnulation | null;
};

function rewardCodeCandidates(rawCode: string): RewardRoute[] {
  const normalizers: Array<[
    CashierMatch["source"],
    (value: string) => string | null,
  ]> = [
    ["hunt", normalizeHuntCode],
    ["loyalty", normalizeLoyaltyCode],
    ["jackpot", normalizeJackpotCode],
    ["event", normalizeEventCode],
    ["calendar", normalizeCalendarCode],
    ["referral", normalizeReferralCode],
    ["quiz", normalizeQuizCode],
    ["contest", normalizeContestCode],
    ["reserver_stock", normalizeStockHoldCode],
    ["wheel", normalizeRedeemCode],
  ];
  const seen = new Set<string>();
  const candidates: RewardRoute[] = [];
  for (const [source, normalize] of normalizers) {
    const code = normalize(rawCode);
    if (code && !seen.has(code)) {
      candidates.push({ source, code });
      seen.add(code);
    }
  }
  return candidates;
}

async function lookupUniversalRewardRoute(
  rawCode: string,
): Promise<RewardRoute | null> {
  const candidates = rewardCodeCandidates(rawCode);
  if (candidates.length === 0) return null;

  const { user, organization } = await getUserAndOrg();
  if (!user || !organization) redirect("/login");

  const { data, error } = await createAdminClient()
    .from("reward_issuances")
    // `label` : LE nom sous lequel le client a gagné, gravé à l'émission
    // (migration 20260814120000) et jamais réécrit depuis.
    //
    // `metadata` : sa clé `reward_details` porte la DESCRIPTION, gravée de la
    // même façon depuis 20260901120000. Sans elle, la carte affichait un titre
    // gravé au-dessus d'une description courante — deux lignes du même bloc
    // qui se contredisent, la seconde énonçant les conditions appliquées.
    //
    // `cancelled_at` : le registre est la SEULE source qui survit à la
    // suppression de la table parente (20260902120000). Sans cette colonne, un
    // lot annulé par un geste d'entretien du commerçant se présentait au
    // comptoir comme un code inventé.
    //
    // `cancelled_source` : QUI a annulé, en vocabulaire fermé. La caisse ne
    // peut pas lire `player_wallet`, scopée au joueur porteur du cookie ; elle
    // lit donc la colonne que le seul trigger d'annulation écrit
    // (20260903120000) et qu'aucun chemin applicatif ne peut poser.
    //
    // ⚠️ NE PAS REVENIR À `cancelled_reason`. C'était le défaut : ce champ est
    // du texte libre saisi par le commerçant, et deux chemins lui permettaient
    // d'y écrire lui-même « source purgée » — le formulaire d'annulation, et un
    // `PATCH` PostgREST direct sur `participations` qui ne passe même pas par
    // l'audit. Le caissier lisait alors au client, en face : « Ce n'est une
    // décision de personne. » Le motif brut ne décide plus d'aucun affichage.
    .select("source_type, code, label, metadata, cancelled_at, cancelled_source")
    .eq("organization_id", organization.id)
    .in(
      "code",
      candidates.map((candidate) => candidate.code),
    );
  if (error || !data) return null;

  const rows = data as Array<{
    source_type: string;
    code: string;
    label: string | null;
    metadata: Record<string, unknown> | null;
    cancelled_at: string | null;
    cancelled_source: string | null;
  }>;
  for (const candidate of candidates) {
    const row = rows.find(
      (r) => r.code === candidate.code && r.source_type === candidate.source,
    );
    if (row) {
      // Un libellé VIDE en base ne vaut pas mieux que rien : on retombe
      // alors sur la table parente plutôt que d'afficher un blanc. Même
      // règle pour la description — et c'est aussi le cas PERMANENT de la
      // famille `contest`, qui n'écrit jamais `reward_details`.
      const details = row.metadata?.["reward_details"];
      return {
        ...candidate,
        frozenLabel: row.label || null,
        frozenDetails: typeof details === "string" && details ? details : null,
        cancelledAt: row.cancelled_at ?? null,
        cancelledCause: causeAnnulationRegistre(
          row.cancelled_at,
          row.cancelled_source,
        ),
      };
    }
  }
  return null;
}

function lookupCashierMatchByRoute(
  route: RewardRoute,
): Promise<CashierMatch | null> {
  switch (route.source) {
    case "hunt":
      return lookupHuntCompletionByCode(route.code).then((completion) =>
        completion ? { source: "hunt", completion } : null,
      );
    case "loyalty":
      return lookupLoyaltyRewardByCode(route.code).then((reward) =>
        reward ? { source: "loyalty", reward } : null,
      );
    case "jackpot":
      return lookupJackpotWinByCode(route.code).then((win) =>
        win ? { source: "jackpot", win } : null,
      );
    case "event":
      return lookupEventWinByCode(route.code).then((win) =>
        win ? { source: "event", win } : null,
      );
    case "calendar":
      return lookupCalendarRewardByCode(route.code).then((reward) =>
        reward ? { source: "calendar", reward } : null,
      );
    case "referral":
      return lookupReferralRewardByCode(route.code).then((reward) =>
        reward ? { source: "referral", reward } : null,
      );
    case "quiz":
      return lookupQuizRewardByCode(route.code).then((reward) =>
        reward ? { source: "quiz", reward } : null,
      );
    case "contest":
      return lookupContestAwardByCode(route.code).then((award) =>
        award ? { source: "contest", award } : null,
      );
    case "reserver_stock":
      return lookupStockHoldByCode(route.code).then((hold) =>
        hold ? { source: "reserver_stock", hold } : null,
      );
    case "wheel":
      return lookupParticipationByCode(route.code).then((participation) =>
        participation ? { source: "wheel", participation } : null,
      );
  }
}

/** Recherche une complétion de chasse par son code (org-scopée). Privée. */
async function lookupHuntCompletionByCode(
  code: string,
): Promise<CashierHuntCompletion | null> {
  const { user, organization } = await getUserAndOrg();
  if (!user || !organization) redirect("/login");
  const admin = createAdminClient();
  // hunt_completions n'a pas de FK directe vers hunts (seulement vers
  // hunt_players) : deux requêtes org-scopées plutôt qu'un embed.
  const { data: completion } = await admin
    .from("hunt_completions")
    .select("id, code, hunt_id, completed_at, redeemed_at")
    .eq("organization_id", organization.id)
    .eq("code", code)
    .limit(1)
    .maybeSingle();
  if (!completion) return null;

  const { data: hunt } = await admin
    .from("hunts")
    .select("name, reward_label, reward_details")
    .eq("id", completion.hunt_id)
    .eq("organization_id", organization.id)
    .maybeSingle();

  return {
    id: completion.id,
    code: completion.code,
    completed_at: completion.completed_at,
    redeemed_at: completion.redeemed_at,
    hunt_name: hunt?.name ?? "Chasse supprimée",
    reward_label: hunt?.reward_label ?? "",
    reward_details: hunt?.reward_details ?? null,
  };
}

/** Recherche un lot de fidélité par son code (org-scopée). Privée. */
async function lookupLoyaltyRewardByCode(
  code: string,
): Promise<CashierLoyaltyReward | null> {
  const { user, organization } = await getUserAndOrg();
  if (!user || !organization) redirect("/login");
  const admin = createAdminClient();
  // Le libellé du lot vit sur le palier, le nom sur le programme : on lit la
  // récompense (code FIDELITE-…) puis ces deux références, org-scopées.
  const { data: reward } = await admin
    .from("loyalty_rewards")
    .select("id, code, earned_at, redeemed_at, program_id, milestone_id")
    .eq("organization_id", organization.id)
    .eq("reward_type", "lot")
    .eq("code", code)
    .limit(1)
    .maybeSingle();
  if (!reward) return null;

  const [{ data: program }, { data: milestone }] = await Promise.all([
    admin
      .from("loyalty_programs")
      .select("name")
      .eq("id", reward.program_id)
      .eq("organization_id", organization.id)
      .maybeSingle(),
    admin
      .from("loyalty_milestones")
      .select("reward_label, reward_details")
      .eq("id", reward.milestone_id)
      .eq("organization_id", organization.id)
      .maybeSingle(),
  ]);

  return {
    id: reward.id,
    // La ligne a été trouvée par `.eq("code", code)` : `reward.code` VAUT
    // `code`. La colonne est nullable en base (une récompense de type point
    // n'en porte pas), le repli rend cette garantie lisible sans conversion.
    code: reward.code ?? code,
    earned_at: reward.earned_at,
    redeemed_at: reward.redeemed_at,
    program_name: program?.name ?? "Programme supprimé",
    reward_label: milestone?.reward_label ?? "",
    reward_details: milestone?.reward_details ?? null,
  };
}

/** Recherche un gain de jackpot par son code (org-scopée). Privée. */
async function lookupJackpotWinByCode(
  code: string,
): Promise<CashierJackpotWin | null> {
  const { user, organization } = await getUserAndOrg();
  if (!user || !organization) redirect("/login");
  const admin = createAdminClient();
  // Le libellé du lot et le nom vivent sur la campagne : on lit le gain
  // (code JACKPOT-…) puis la campagne, org-scopés.
  const { data: win } = await admin
    .from("jackpot_wins")
    .select("id, code, drawn_at, redeemed_at, campaign_id")
    .eq("organization_id", organization.id)
    .eq("code", code)
    .limit(1)
    .maybeSingle();
  if (!win) return null;

  const { data: campaign } = await admin
    .from("jackpot_campaigns")
    .select("name, reward_label, reward_details")
    .eq("id", win.campaign_id)
    .eq("organization_id", organization.id)
    .maybeSingle();

  return {
    id: win.id,
    code: win.code,
    drawn_at: win.drawn_at,
    redeemed_at: win.redeemed_at,
    campaign_name: campaign?.name ?? "Campagne supprimée",
    reward_label: campaign?.reward_label ?? "",
    reward_details: campaign?.reward_details ?? null,
  };
}

/** Recherche un gain de mode événement par son code (org-scopée). Privée. */
async function lookupEventWinByCode(
  code: string,
): Promise<CashierEventWin | null> {
  const { user, organization } = await getUserAndOrg();
  if (!user || !organization) redirect("/login");
  const admin = createAdminClient();
  // Le libellé du lot et l'étiquette vivent sur la session : on lit le gain
  // (code EVENT-…) puis la session, org-scopés.
  const { data: win } = await admin
    .from("event_wins")
    .select("id, code, created_at, redeemed_at, session_id")
    .eq("organization_id", organization.id)
    .eq("code", code)
    .limit(1)
    .maybeSingle();
  if (!win) return null;

  const { data: session } = await admin
    .from("event_sessions")
    .select("label, reward_label, reward_details")
    .eq("id", win.session_id)
    .eq("organization_id", organization.id)
    .maybeSingle();

  return {
    id: win.id,
    code: win.code,
    won_at: win.created_at,
    redeemed_at: win.redeemed_at,
    session_label: session?.label ?? "Session supprimée",
    reward_label: session?.reward_label ?? "",
    reward_details: session?.reward_details ?? null,
  };
}

/**
 * Recherche un lot de calendrier par son code (org-scopée). Le code CADEAU-…
 * peut provenir d'une case-lot (calendar_openings) OU de la récompense
 * d'assiduité (calendar_rewards) : les DEUX sources sont couvertes. LECTURE
 * SEULE — la remise (avec verrouillage) passe par redeem_calendar_reward.
 * Privée.
 */
async function lookupCalendarRewardByCode(
  code: string,
): Promise<CashierCalendarReward | null> {
  const { user, organization } = await getUserAndOrg();
  if (!user || !organization) redirect("/login");
  const admin = createAdminClient();

  // 1) Lot de case : le libellé vit sur la case, le nom sur le calendrier.
  const { data: opening } = await admin
    .from("calendar_openings")
    .select("id, code, opened_at, redeemed_at, day_id, calendar_id")
    .eq("organization_id", organization.id)
    .eq("content_type", "lot")
    .eq("code", code)
    .limit(1)
    .maybeSingle();
  if (opening) {
    const [{ data: day }, { data: calendar }] = await Promise.all([
      admin
        .from("calendar_days")
        .select("reward_label, reward_details")
        .eq("id", opening.day_id)
        .eq("organization_id", organization.id)
        .maybeSingle(),
      admin
        .from("calendars")
        .select("name")
        .eq("id", opening.calendar_id)
        .eq("organization_id", organization.id)
        .maybeSingle(),
    ]);
    return {
      id: opening.id,
      source: "day",
      // Trouvée par `.eq("code", code)` : `opening.code` VAUT `code`. La colonne
      // est nullable (une case sans lot n'a pas de code), d'où le repli.
      code: opening.code ?? code,
      created_at: opening.opened_at,
      redeemed_at: opening.redeemed_at,
      calendar_name: calendar?.name ?? "Calendrier supprimé",
      reward_label: day?.reward_label ?? "",
      reward_details: day?.reward_details ?? null,
    };
  }

  // 2) Récompense d'assiduité : le libellé et le nom vivent sur le calendrier.
  const { data: reward } = await admin
    .from("calendar_rewards")
    .select("id, code, created_at, redeemed_at, calendar_id")
    .eq("organization_id", organization.id)
    .eq("code", code)
    .limit(1)
    .maybeSingle();
  if (!reward) return null;

  const { data: calendar } = await admin
    .from("calendars")
    .select("name, completion_reward_label, completion_reward_details")
    .eq("id", reward.calendar_id)
    .eq("organization_id", organization.id)
    .maybeSingle();

  return {
    id: reward.id,
    source: "completion",
    code: reward.code,
    created_at: reward.created_at,
    redeemed_at: reward.redeemed_at,
    calendar_name: calendar?.name ?? "Calendrier supprimé",
    reward_label: calendar?.completion_reward_label ?? "",
    reward_details: calendar?.completion_reward_details ?? null,
  };
}

/**
 * Recherche un lot de parrainage par son code (org-scopée). Le libellé et les
 * détails du versement vivent sur le programme (selon le bénéficiaire), le nom
 * sur la campagne : on lit le versement (code PARRAIN-…, kind 'lot') puis ces
 * deux références, org-scopées. LECTURE SEULE — la remise (avec verrouillage)
 * passe par redeem_referral_reward. Miroir de lookupCalendarRewardByCode.
 * Privée.
 */
async function lookupReferralRewardByCode(
  code: string,
): Promise<CashierReferralReward | null> {
  const { user, organization } = await getUserAndOrg();
  if (!user || !organization) redirect("/login");
  const admin = createAdminClient();
  const { data: reward } = await admin
    .from("referral_rewards")
    .select("id, code, created_at, redeemed_at, beneficiary, campaign_id")
    .eq("organization_id", organization.id)
    .eq("kind", "lot")
    .eq("code", code)
    .limit(1)
    .maybeSingle();
  if (!reward) return null;

  const [{ data: campaign }, { data: program }] = await Promise.all([
    admin
      .from("campaigns")
      .select("name")
      .eq("id", reward.campaign_id)
      .eq("organization_id", organization.id)
      .maybeSingle(),
    admin
      .from("referral_programs")
      .select(
        "sponsor_reward_label, sponsor_reward_details, filleul_reward_label, filleul_reward_details, chest_reward_label, chest_reward_details",
      )
      .eq("campaign_id", reward.campaign_id)
      .eq("organization_id", organization.id)
      .maybeSingle(),
  ]);

  const rewardLabel =
    reward.beneficiary === "filleul"
      ? program?.filleul_reward_label
      : reward.beneficiary === "chest"
        ? program?.chest_reward_label
        : program?.sponsor_reward_label;
  const rewardDetails =
    reward.beneficiary === "filleul"
      ? program?.filleul_reward_details
      : reward.beneficiary === "chest"
        ? program?.chest_reward_details
        : program?.sponsor_reward_details;

  return {
    id: reward.id,
    code: reward.code as string,
    created_at: reward.created_at,
    redeemed_at: reward.redeemed_at,
    campaign_name: campaign?.name ?? "Campagne supprimée",
    beneficiary: reward.beneficiary,
    reward_label: rewardLabel ?? "",
    reward_details: rewardDetails ?? null,
  };
}

/**
 * Recherche un lot de quiz par son code (org-scopée). Le libellé du lot et le nom
 * vivent sur le quiz : on lit la récompense (code QUIZ-…) puis le quiz, org-scopés.
 * LECTURE SEULE — la remise (avec verrouillage) passe par redeem_quiz_reward.
 * Miroir de lookupReferralRewardByCode. Privée.
 */
async function lookupQuizRewardByCode(
  code: string,
): Promise<CashierQuizReward | null> {
  const { user, organization } = await getUserAndOrg();
  if (!user || !organization) redirect("/login");
  const admin = createAdminClient();
  const { data: reward } = await admin
    .from("quiz_rewards")
    .select("id, code, created_at, redeemed_at, source, rank, quiz_id")
    .eq("organization_id", organization.id)
    .eq("code", code)
    .limit(1)
    .maybeSingle();
  if (!reward) return null;

  const { data: quiz } = await admin
    .from("quizzes")
    .select("name, reward_label, reward_details")
    .eq("id", reward.quiz_id)
    .eq("organization_id", organization.id)
    .maybeSingle();

  return {
    id: reward.id,
    code: reward.code as string,
    created_at: reward.created_at,
    redeemed_at: reward.redeemed_at,
    quiz_name: quiz?.name ?? "Quiz supprimé",
    emitted_by: reward.source,
    rank: reward.rank ?? null,
    reward_label: quiz?.reward_label ?? "",
    reward_details: quiz?.reward_details ?? null,
  };
}

/**
 * Recherche un lot de pronostics par son code (org-scopée). Le libellé du lot
 * vit sur la récompense, le nom sur le championnat et le pseudo sur le joueur :
 * on lit l'award (code PRONO-…) puis ces deux références, org-scopées. LECTURE
 * SEULE — la remise (atomique, auditée) passe par redeem_contest_award. Miroir
 * de lookupQuizRewardByCode. Privée.
 */
async function lookupContestAwardByCode(
  code: string,
): Promise<CashierContestAward | null> {
  const { user, organization } = await getUserAndOrg();
  if (!user || !organization) redirect("/login");
  const admin = createAdminClient();
  const { data: award } = await admin
    .from("contest_awards")
    .select(
      "id, code, created_at, redeemed_at, redeem_expires_at, status, rank, reward_label, basket_cents, contest_id, player_id",
    )
    .eq("organization_id", organization.id)
    .eq("code", code)
    .limit(1)
    .maybeSingle();
  if (!award) return null;

  const [{ data: contest }, { data: player }] = await Promise.all([
    admin
      .from("contests")
      .select("name")
      .eq("id", award.contest_id)
      .eq("organization_id", organization.id)
      .maybeSingle(),
    admin
      .from("contest_players")
      .select("first_name")
      .eq("id", award.player_id)
      .eq("organization_id", organization.id)
      .maybeSingle(),
  ]);

  return {
    id: award.id,
    code: award.code as string,
    created_at: award.created_at,
    redeemed_at: award.redeemed_at,
    redeem_expires_at: award.redeem_expires_at,
    status: award.status as ContestAwardStatus,
    rank: award.rank ?? null,
    contest_name: contest?.name ?? "Championnat supprimé",
    player_name: player?.first_name ?? "Joueur supprimé",
    reward_label: award.reward_label ?? "",
    basket_cents: award.basket_cents ?? null,
  };
}

/**
 * Recherche une unité de stock par son code (org-scopée). LECTURE SEULE — le
 * retrait (verrouillé, borné par la fenêtre) passe par le routeur universel et
 * son bras source `redeem_stock_hold`. Privée, comme ses neuf sœurs.
 *
 * ── DEUX LECTURES, ET LES COLONNES SONT ÉNUMÉRÉES ──
 *
 * La fenêtre vit sur l'OFFRE, la preuve de retrait sur la PRISE. Un `select *`
 * serait de toute façon refusé EN ENTIER sur `reservation_stock_holds` par le
 * grant de colonnes (`email` en est exclu) : les colonnes sont donc nommées, et
 * `email` n'en fait pas partie — la caisse n'a rien à faire de l'adresse de
 * quelqu'un qui se tient devant elle.
 */
async function lookupStockHoldByCode(
  code: string,
): Promise<CashierStockHold | null> {
  const { user, organization } = await getUserAndOrg();
  if (!user || !organization) redirect("/login");
  const admin = createAdminClient();
  const { data: hold } = await admin
    .from("reservation_stock_holds")
    .select(
      "id, code, created_at, redeemed_at, cancelled_at, redeem_expires_at, basket_cents, offer_id",
    )
    .eq("organization_id", organization.id)
    .eq("code", code)
    .limit(1)
    .maybeSingle();
  if (!hold) return null;

  const { data: offer } = await admin
    .from("reservation_stock_offers")
    .select("title, description, window_starts_at, window_ends_at")
    .eq("id", hold.offer_id)
    .eq("organization_id", organization.id)
    .maybeSingle();

  return {
    id: hold.id,
    code: hold.code,
    created_at: hold.created_at,
    redeemed_at: hold.redeemed_at,
    cancelled_at: hold.cancelled_at,
    redeem_expires_at: hold.redeem_expires_at,
    basket_cents: hold.basket_cents ?? null,
    // ÉCHÉANCE GRAVÉE EN REPLI DE LA FENÊTRE, et jamais l'inverse. L'offre est
    // liée par une FK composite `on delete cascade` : si elle n'existe plus, la
    // prise non plus — ce repli ne sert donc qu'à une lecture qui a échoué, et
    // il rend la seule date que la prise porte elle-même plutôt qu'une date
    // inventée qui ferait afficher « retrait à partir du 1er janvier 1970 ».
    window_starts_at: offer?.window_starts_at ?? hold.created_at,
    window_ends_at: offer?.window_ends_at ?? hold.redeem_expires_at,
    offer_title: offer?.title ?? "Offre supprimée",
    offer_description: offer?.description ?? null,
  };
}

/**
 * Vrai si la saisie porte le préfixe CHASSE explicite (par opposition à un
 * code nu de 8 caractères). Même nettoyage que normalizeHuntCode, pour rester
 * cohérent avec sa lecture de l'entrée.
 */
function hasHuntPrefix(rawCode: string): boolean {
  return sanitizeSearchTerm(rawCode)
    .toUpperCase()
    .replace(/[\s_-]/g, "")
    .startsWith("CHASSE");
}

/** Vrai si la saisie porte le préfixe FIDELITE explicite (miroir hunt). */
function hasLoyaltyPrefix(rawCode: string): boolean {
  return sanitizeSearchTerm(rawCode)
    .toUpperCase()
    .replace(/[\s_-]/g, "")
    .startsWith("FIDELITE");
}

/** Vrai si la saisie porte le préfixe JACKPOT explicite (miroir hunt). */
function hasJackpotPrefix(rawCode: string): boolean {
  return sanitizeSearchTerm(rawCode)
    .toUpperCase()
    .replace(/[\s_-]/g, "")
    .startsWith("JACKPOT");
}

/** Vrai si la saisie porte le préfixe EVENT explicite (miroir hunt). */
function hasEventPrefix(rawCode: string): boolean {
  return sanitizeSearchTerm(rawCode)
    .toUpperCase()
    .replace(/[\s_-]/g, "")
    .startsWith("EVENT");
}

/** Vrai si la saisie porte le préfixe CADEAU explicite (miroir hunt). */
function hasCalendarPrefix(rawCode: string): boolean {
  return sanitizeSearchTerm(rawCode)
    .toUpperCase()
    .replace(/[\s_-]/g, "")
    .startsWith("CADEAU");
}

/** Vrai si la saisie porte le préfixe PARRAIN explicite (miroir hunt). */
function hasReferralPrefix(rawCode: string): boolean {
  return sanitizeSearchTerm(rawCode)
    .toUpperCase()
    .replace(/[\s_-]/g, "")
    .startsWith("PARRAIN");
}

/** Vrai si la saisie porte le préfixe QUIZ explicite (miroir hunt). */
function hasQuizPrefix(rawCode: string): boolean {
  return sanitizeSearchTerm(rawCode)
    .toUpperCase()
    .replace(/[\s_-]/g, "")
    .startsWith("QUIZ");
}

/** Vrai si la saisie porte le préfixe PRONO explicite (miroir hunt). */
function hasContestPrefix(rawCode: string): boolean {
  return sanitizeSearchTerm(rawCode)
    .toUpperCase()
    .replace(/[\s_-]/g, "")
    .startsWith("PRONO");
}

/** Vrai si la saisie porte le préfixe RESA explicite (miroir hunt). */
function hasStockHoldPrefix(rawCode: string): boolean {
  return sanitizeSearchTerm(rawCode)
    .toUpperCase()
    .replace(/[\s_-]/g, "")
    .startsWith("RESA");
}

/**
 * Recherche unifiée d'un code en caisse : lot de roue (GAIN-…), chasse au
 * trésor (CHASSE-…), fidélité (FIDELITE-…), jackpot (JACKPOT-…), mode
 * événement (EVENT-…), calendrier (CADEAU-…), parrainage (PARRAIN-…), quiz
 * (QUIZ-…) ou pronostics (PRONO-…). Routage par TYPE de code.
 *
 * PRIVÉE : le seau `cashier:lookup` est consommé par `lookupRedeemCode`, une
 * seule fois, AVANT ce routage — c'est la raison d'être de la séparation.
 *
 * Les deux formats partagent EXACTEMENT le même suffixe — 8 caractères de
 * l'alphabet [A-HJ-NP-Z2-9] (roue : RPC claim_prize ; chasse :
 * record_hunt_scan) — donc seul le préfixe désambiguïse de façon fiable.
 * `normalizeRedeemCode` est permissif (il renvoie « GAIN-<saisie> » pour
 * presque toute entrée, CHASSE-… compris) : on NE peut PAS l'utiliser pour
 * router. `normalizeHuntCode` est au contraire strict — forme chasse valide
 * uniquement, codes GAIN-… rejetés — d'où l'ordre retenu :
 *
 *  1. chasse d'abord : un code GAIN-… (rejeté par normalizeHuntCode) tombe
 *     directement en roue et conserve son comportement historique.
 *  2. si l'entrée porte le préfixe CHASSE explicite, il FAIT AUTORITÉ : on ne
 *     retombe jamais sur la roue (hasHuntPrefix), même si aucune chasse ne
 *     correspond — un code chasse n'est jamais un lot de roue.
 *
 * Code NU (sans préfixe, ex. « ABCD2345 ») : réellement ambigu car il matche
 * les deux formats. Tie-break documenté — la chasse est tentée d'abord, la
 * roue en repli. En pratique un vrai code encodé en QR/pass porte toujours son
 * préfixe ; ce chemin ne concerne que la saisie manuelle abrégée.
 */
type RouteOutcome =
  | {
      match: CashierMatch;
      frozenLabel?: string | null;
      frozenDetails?: string | null;
    }
  | {
      cancelled: true;
      frozenLabel: string | null;
      cancelledAt: string | null;
      cancelledCause: CauseAnnulation | null;
    };

async function routeRedeemCode(rawCode: string): Promise<RouteOutcome | null> {
  // Les émissions récentes sont routées en une lecture. Un miss couvre les
  // codes historiques non backfillés et conserve le routeur legacy ci-dessous.
  const universalRoute = await lookupUniversalRewardRoute(rawCode);
  if (universalRoute) {
    const match = await lookupCashierMatchByRoute(universalRoute);
    // Le libellé ET la description gravés accompagnent le match : c'est le nom
    // sous lequel le client a gagné — celui que son email annonce — et le texte
    // des conditions sous lesquelles il l'a gagné.
    if (match) {
      return {
        match,
        frozenLabel: universalRoute.frozenLabel,
        frozenDetails: universalRoute.frozenDetails,
      };
    }
    // LA SOURCE A DISPARU, LE REGISTRE SAIT POURQUOI.
    //
    // Le registre porte ce code, la table parente ne le porte plus : c'est la
    // signature d'une suppression assumée par le commerçant, que
    // `20260902120000` marque en annulant la ligne au lieu de la laisser
    // active. On rend ce motif au caissier plutôt que le « Code introuvable »
    // d'un code inventé.
    //
    // La garde est `cancelledAt` et rien d'autre : une ligne de registre
    // orpheline mais NON annulée (émission antérieure au trigger, ou incident)
    // conserve l'ancien refus — on ne prétend pas connaître un motif qu'on n'a
    // pas lu.
    if (universalRoute.cancelledAt) {
      return {
        cancelled: true,
        frozenLabel: universalRoute.frozenLabel ?? null,
        cancelledAt: universalRoute.cancelledAt,
        cancelledCause: universalRoute.cancelledCause ?? null,
      };
    }
    return null;
  }

  const huntCode = normalizeHuntCode(rawCode);
  if (huntCode) {
    const completion = await lookupHuntCompletionByCode(huntCode);
    if (completion) return { match: { source: "hunt", completion } };
    // Préfixe CHASSE explicite : autorité → pas de repli.
    if (hasHuntPrefix(rawCode)) return null;
  }

  // Fidélité : forme stricte FIDELITE-… (normalizeLoyaltyCode rejette GAIN-/
  // CHASSE-). Même logique d'autorité de préfixe que la chasse.
  const loyaltyCode = normalizeLoyaltyCode(rawCode);
  if (loyaltyCode) {
    const reward = await lookupLoyaltyRewardByCode(loyaltyCode);
    if (reward) return { match: { source: "loyalty", reward } };
    if (hasLoyaltyPrefix(rawCode)) return null;
  }

  // Jackpot : forme stricte JACKPOT-… (normalizeJackpotCode rejette GAIN-/
  // CHASSE-/FIDELITE-). Même logique d'autorité de préfixe que la chasse.
  const jackpotCode = normalizeJackpotCode(rawCode);
  if (jackpotCode) {
    const win = await lookupJackpotWinByCode(jackpotCode);
    if (win) return { match: { source: "jackpot", win } };
    if (hasJackpotPrefix(rawCode)) return null;
  }

  // Mode événement : forme stricte EVENT-… (normalizeEventCode rejette GAIN-/
  // CHASSE-/FIDELITE-/JACKPOT-). Même logique d'autorité de préfixe.
  const eventCode = normalizeEventCode(rawCode);
  if (eventCode) {
    const win = await lookupEventWinByCode(eventCode);
    if (win) return { match: { source: "event", win } };
    if (hasEventPrefix(rawCode)) return null;
  }

  // Calendrier : forme stricte CADEAU-… (normalizeCalendarCode rejette GAIN-/
  // CHASSE-/FIDELITE-/JACKPOT-/EVENT-). Même logique d'autorité de préfixe.
  const calendarCode = normalizeCalendarCode(rawCode);
  if (calendarCode) {
    const reward = await lookupCalendarRewardByCode(calendarCode);
    if (reward) return { match: { source: "calendar", reward } };
    if (hasCalendarPrefix(rawCode)) return null;
  }

  // Parrainage : forme stricte PARRAIN-… (normalizeReferralCode rejette GAIN-/
  // CHASSE-/FIDELITE-/JACKPOT-/EVENT-/CADEAU-). Même logique d'autorité de préfixe.
  const referralCode = normalizeReferralCode(rawCode);
  if (referralCode) {
    const reward = await lookupReferralRewardByCode(referralCode);
    if (reward) return { match: { source: "referral", reward } };
    if (hasReferralPrefix(rawCode)) return null;
  }

  // Quiz : forme stricte QUIZ-… (normalizeQuizCode rejette GAIN-/CHASSE-/
  // FIDELITE-/JACKPOT-/EVENT-/CADEAU-/PARRAIN-). Même logique d'autorité de préfixe.
  const quizCode = normalizeQuizCode(rawCode);
  if (quizCode) {
    const reward = await lookupQuizRewardByCode(quizCode);
    if (reward) return { match: { source: "quiz", reward } };
    if (hasQuizPrefix(rawCode)) return null;
  }

  // Pronostics : forme stricte PRONO-… (normalizeContestCode rejette GAIN-/
  // CHASSE-/FIDELITE-/JACKPOT-/EVENT-/CADEAU-/PARRAIN-/QUIZ-). Même logique
  // d'autorité de préfixe. Dernière famille avant le repli roue, qui reste le
  // comportement historique des codes nus.
  const contestCode = normalizeContestCode(rawCode);
  if (contestCode) {
    const award = await lookupContestAwardByCode(contestCode);
    if (award) return { match: { source: "contest", award } };
    if (hasContestPrefix(rawCode)) return null;
  }

  // Réservation de stock : forme stricte RESA-… . Ce repli ne devrait JAMAIS
  // servir — le miroir du registre est écrit dans la transaction de la prise,
  // donc toute prise vivante a sa ligne. Il existe pour la même raison que les
  // huit autres : sans lui, un code RESA- dont le miroir aurait échoué
  // retomberait sur `normalizeRedeemCode`, qui est PERMISSIF, et le comptoir
  // chercherait un lot de roue portant ce code.
  const stockCode = normalizeStockHoldCode(rawCode);
  if (stockCode) {
    const hold = await lookupStockHoldByCode(stockCode);
    if (hold) return { match: { source: "reserver_stock", hold } };
    if (hasStockHoldPrefix(rawCode)) return null;
  }

  const gainCode = normalizeRedeemCode(rawCode);
  if (gainCode) {
    const participation = await lookupParticipationByCode(gainCode);
    if (participation) return { match: { source: "wheel", participation } };
  }

  return null;
}

/**
 * Point d'entrée UNIQUE de la recherche en caisse : une recherche = UN jeton.
 *
 * Chacune des neuf lectures consommait auparavant son propre jeton sur le seau
 * `cashier:lookup`. Une saisie NUE (« ABCD2345 », sans préfixe) matche les neuf
 * normaliseurs : elle brûlait donc neuf jetons, ramenant le caissier à trois
 * recherches par minute au lieu de trente. Et une fois le seuil franchi, chaque
 * lecture renvoyait `null` — indistinguable d'un code absent : le comptoir
 * annonçait « Code introuvable » sur un lot valide.
 *
 * Le jeton est désormais consommé ICI, une seule fois, avant le routage ; les
 * neuf lectures sont privées au module (aucune n'est un endpoint `"use server"`
 * atteignable sans passer par cette garde). La clé reste celle d'un OPÉRATEUR
 * authentifié (`org:user.id`, jamais partagée entre utilisateurs), donc
 * `failClosed` demeure légitime au sens de l'ADR-032 : la saturer ne coupe que
 * son propre poste, et une panne de la protection ne doit pas ouvrir la caisse.
 */
export async function lookupRedeemCode(
  rawCode: string,
): Promise<CashierLookup> {
  const { user, organization } = await getUserAndOrg();
  if (!user || !organization) redirect("/login");

  // Saisie qui ne peut désigner AUCUNE famille (vide, ponctuation seule) : elle
  // n'atteindra jamais la base, inutile de lui faire payer un jeton.
  if (rewardCodeCandidates(rawCode).length === 0) return { status: "not_found" };

  const allowed = await rateLimit(
    rateLimitBucket("cashier:lookup", organization.id, user.id),
    RATE_LIMITS.cashier,
    { failClosed: true },
  );
  if (!allowed) return { status: "rate_limited" };

  const route = await routeRedeemCode(rawCode);
  if (!route) return { status: "not_found" };
  if ("cancelled" in route) {
    return {
      status: "cancelled",
      frozenLabel: route.frozenLabel,
      cancelledAt: route.cancelledAt,
      cancelledCause: route.cancelledCause,
    };
  }
  return {
    status: "found",
    match: route.match,
    frozenLabel: route.frozenLabel,
    frozenDetails: route.frozenDetails,
  };
}

/**
 * Valide en caisse la remise d'un lot de fidélité via la RPC dédiée
 * redeem_loyalty_reward (atomique, auditée, org-scopée), miroir de
 * redeemHuntCompletion. Un code inconnu ou d'une autre organisation ne
 * renvoie aucune ligne.
 */
export async function redeemLoyaltyReward(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = loyaltyRedeemCodeSchema.safeParse(formData.get("code"));
  if (!parsed.success) return { ok: false, error: "Code de retrait invalide" };

  const { user, organization } = await getUserAndOrg();
  if (!user || !organization) redirect("/login");

  const allowed = await rateLimit(
    rateLimitBucket("cashier:redeem", organization.id, user.id),
    RATE_LIMITS.cashier,
    { failClosed: true },
  );
  if (!allowed) return { ok: false, error: "Trop de tentatives, patientez." };

  const admin = createAdminClient();
  const universal = await redeemThroughUniversalRegistry(
    admin,
    organization.id,
    parsed.data,
    user.id,
    { noun: "lot", family: "loyalty" },
  );
  if (universal) return universal;

  const { data: rows, error } = await admin.rpc(
    "redeem_loyalty_reward",
    {
      p_organization_id: organization.id,
      p_code: parsed.data,
      p_actor: user.id,
    },
  );
  if (error) {
    reportError("loyalty.redeem", error.message);
    return { ok: false, error: "Validation impossible" };
  }

  const row = (rows as Array<{ redeemed_now: boolean }> | null)?.[0];
  if (!row) return { ok: false, error: "Code introuvable" };
  if (!row.redeemed_now) return { ok: false, error: "Ce lot a déjà été remis" };

  revalidatePath("/dashboard/redeem");
  return { ok: true, data: undefined };
}

/**
 * Valide en caisse la remise d'un gain de jackpot via la RPC dédiée
 * redeem_jackpot_prize (atomique, auditée, org-scopée), miroir de
 * redeemLoyaltyReward. Un code inconnu ou d'une autre organisation ne renvoie
 * aucune ligne.
 */
export async function redeemJackpotPrize(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = jackpotRedeemCodeSchema.safeParse(formData.get("code"));
  if (!parsed.success) return { ok: false, error: "Code de retrait invalide" };

  const { user, organization } = await getUserAndOrg();
  if (!user || !organization) redirect("/login");

  const allowed = await rateLimit(
    rateLimitBucket("cashier:redeem", organization.id, user.id),
    RATE_LIMITS.cashier,
    { failClosed: true },
  );
  if (!allowed) return { ok: false, error: "Trop de tentatives, patientez." };

  const admin = createAdminClient();
  const universal = await redeemThroughUniversalRegistry(
    admin,
    organization.id,
    parsed.data,
    user.id,
    { noun: "lot", family: "jackpot" },
  );
  if (universal) return universal;

  const { data: rows, error } = await admin.rpc(
    "redeem_jackpot_prize",
    {
      p_organization_id: organization.id,
      p_code: parsed.data,
      p_actor: user.id,
    },
  );
  if (error) {
    reportError("jackpot.redeem", error.message);
    return { ok: false, error: "Validation impossible" };
  }

  const row = (rows as Array<{ redeemed_now: boolean }> | null)?.[0];
  if (!row) return { ok: false, error: "Code introuvable" };
  if (!row.redeemed_now) return { ok: false, error: "Ce lot a déjà été remis" };

  revalidatePath("/dashboard/redeem");
  return { ok: true, data: undefined };
}

/**
 * Valide en caisse la remise d'un gain de mode événement via la RPC dédiée
 * redeem_event_prize (atomique, auditée, org-scopée), miroir de
 * redeemJackpotPrize. Un code inconnu ou d'une autre organisation ne renvoie
 * aucune ligne.
 */
export async function redeemEventPrize(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = eventRedeemCodeSchema.safeParse(formData.get("code"));
  if (!parsed.success) return { ok: false, error: "Code de retrait invalide" };

  const { user, organization } = await getUserAndOrg();
  if (!user || !organization) redirect("/login");

  const allowed = await rateLimit(
    rateLimitBucket("cashier:redeem", organization.id, user.id),
    RATE_LIMITS.cashier,
    { failClosed: true },
  );
  if (!allowed) return { ok: false, error: "Trop de tentatives, patientez." };

  const admin = createAdminClient();
  const universal = await redeemThroughUniversalRegistry(
    admin,
    organization.id,
    parsed.data,
    user.id,
    { noun: "lot", family: "event" },
  );
  if (universal) return universal;

  const { data: rows, error } = await admin.rpc("redeem_event_prize", {
    p_organization_id: organization.id,
    p_code: parsed.data,
    p_actor: user.id,
  });
  if (error) {
    reportError("events.redeem", error.message);
    return { ok: false, error: "Validation impossible" };
  }

  const row = (rows as Array<{ redeemed_now: boolean }> | null)?.[0];
  if (!row) return { ok: false, error: "Code introuvable" };
  if (!row.redeemed_now) return { ok: false, error: "Ce lot a déjà été remis" };

  revalidatePath("/dashboard/redeem");
  return { ok: true, data: undefined };
}

/**
 * Valide en caisse la remise d'un lot de calendrier via la RPC dédiée
 * redeem_calendar_reward (atomique, auditée, org-scopée), miroir de
 * redeemEventPrize. La RPC couvre les DEUX sources (case-lot / récompense
 * d'assiduité). Un code inconnu ou d'une autre organisation ne renvoie aucune
 * ligne.
 */
export async function redeemCalendarReward(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = calendarRedeemCodeSchema.safeParse(formData.get("code"));
  if (!parsed.success) return { ok: false, error: "Code de retrait invalide" };

  const { user, organization } = await getUserAndOrg();
  if (!user || !organization) redirect("/login");

  const allowed = await rateLimit(
    rateLimitBucket("cashier:redeem", organization.id, user.id),
    RATE_LIMITS.cashier,
    { failClosed: true },
  );
  if (!allowed) return { ok: false, error: "Trop de tentatives, patientez." };

  const admin = createAdminClient();
  const universal = await redeemThroughUniversalRegistry(
    admin,
    organization.id,
    parsed.data,
    user.id,
    { noun: "lot", family: "calendar" },
  );
  if (universal) return universal;

  const { data: rows, error } = await admin.rpc(
    "redeem_calendar_reward",
    {
      p_organization_id: organization.id,
      p_code: parsed.data,
      p_actor: user.id,
    },
  );
  if (error) {
    reportError("calendar.redeem", error.message);
    return { ok: false, error: "Validation impossible" };
  }

  const row = (rows as Array<{ redeemed_now: boolean }> | null)?.[0];
  if (!row) return { ok: false, error: "Code introuvable" };
  if (!row.redeemed_now) return { ok: false, error: "Ce lot a déjà été remis" };

  revalidatePath("/dashboard/redeem");
  return { ok: true, data: undefined };
}

/**
 * Valide en caisse la remise d'un lot de parrainage via la RPC dédiée
 * redeem_referral_reward (atomique, auditée, org-scopée), miroir de
 * redeemCalendarReward. Ne traite QUE les versements 'lot' (code PARRAIN-…) ;
 * les 'spin' se réclament par le flux de roue (code GAIN-…). Un code inconnu ou
 * d'une autre organisation ne renvoie aucune ligne.
 */
export async function redeemReferralReward(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = referralRedeemCodeSchema.safeParse(formData.get("code"));
  if (!parsed.success) return { ok: false, error: "Code de retrait invalide" };

  const { user, organization } = await getUserAndOrg();
  if (!user || !organization) redirect("/login");

  const allowed = await rateLimit(
    rateLimitBucket("cashier:redeem", organization.id, user.id),
    RATE_LIMITS.cashier,
    { failClosed: true },
  );
  if (!allowed) return { ok: false, error: "Trop de tentatives, patientez." };

  const admin = createAdminClient();
  const universal = await redeemThroughUniversalRegistry(
    admin,
    organization.id,
    parsed.data,
    user.id,
    { noun: "lot", family: "referral" },
  );
  if (universal) return universal;

  const { data: rows, error } = await admin.rpc(
    "redeem_referral_reward",
    {
      p_organization_id: organization.id,
      p_code: parsed.data,
      p_actor: user.id,
    },
  );
  if (error) {
    reportError("referral.redeem", error.message);
    return { ok: false, error: "Validation impossible" };
  }

  const row = (rows as Array<{ redeemed_now: boolean }> | null)?.[0];
  if (!row) return { ok: false, error: "Code introuvable" };
  if (!row.redeemed_now) return { ok: false, error: "Ce lot a déjà été remis" };

  revalidatePath("/dashboard/redeem");
  return { ok: true, data: undefined };
}

/**
 * Valide en caisse la remise d'un lot de quiz via la RPC dédiée
 * redeem_quiz_reward (atomique, auditée, org-scopée), miroir de
 * redeemReferralReward. Ne traite QUE les codes QUIZ-… ; un tour de roue offert se
 * réclame par le flux de roue (code GAIN-…). Un code inconnu ou d'une autre
 * organisation ne renvoie aucune ligne.
 */
export async function redeemQuizReward(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = quizRedeemCodeSchema.safeParse(formData.get("code"));
  if (!parsed.success) return { ok: false, error: "Code de retrait invalide" };

  const { user, organization } = await getUserAndOrg();
  if (!user || !organization) redirect("/login");

  const allowed = await rateLimit(
    rateLimitBucket("cashier:redeem", organization.id, user.id),
    RATE_LIMITS.cashier,
    { failClosed: true },
  );
  if (!allowed) return { ok: false, error: "Trop de tentatives, patientez." };

  const admin = createAdminClient();
  const universal = await redeemThroughUniversalRegistry(
    admin,
    organization.id,
    parsed.data,
    user.id,
    { noun: "lot", family: "quiz" },
  );
  if (universal) return universal;

  const { data: rows, error } = await admin.rpc("redeem_quiz_reward", {
    p_organization_id: organization.id,
    p_code: parsed.data,
    p_actor: user.id,
  });
  if (error) {
    reportError("quiz.redeem", error.message);
    return { ok: false, error: "Validation impossible" };
  }

  const row = (rows as Array<{ redeemed_now: boolean }> | null)?.[0];
  if (!row) return { ok: false, error: "Code introuvable" };
  if (!row.redeemed_now) return { ok: false, error: "Ce lot a déjà été remis" };

  revalidatePath("/dashboard/redeem");
  return { ok: true, data: undefined };
}

/**
 * Valide en caisse la remise d'un lot de pronostics via la RPC dédiée
 * redeem_contest_award (atomique, auditée, org-scopée), 9e source de la caisse.
 *
 * DEUX écarts assumés avec les 7 autres modules :
 *  1. montant du panier FACULTATIF, comme la roue — un lot de championnat se
 *     retire souvent avec une consommation ; même parseur que
 *     redeemParticipation (« 12,50 » saisi à la française).
 *  2. motif de refus EXPLICITE : la RPC renvoie la ligne même quand elle
 *     refuse (redeemed_now = false), on distingue donc « déjà remis »,
 *     « annulé » et « expiré » plutôt qu'un message générique.
 *
 * Autorisation : `getUserAndOrg` seul — un CAISSIER doit pouvoir remettre le
 * lot, exactement comme pour les 8 autres sources. `set_contest_award_status`
 * reste l'outil de l'ÉDITEUR (annulation motivée depuis le dashboard).
 * Un code inconnu ou d'une autre organisation ne renvoie aucune ligne.
 */
export async function redeemContestAward(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = contestRedeemCodeSchema.safeParse(formData.get("code"));
  if (!parsed.success) return { ok: false, error: "Code de retrait invalide" };

  const basketCents = parseBasketToCents(String(formData.get("basket") ?? ""));
  if (basketCents === undefined) {
    return { ok: false, error: "Montant du panier invalide" };
  }

  const { user, organization } = await getUserAndOrg();
  if (!user || !organization) redirect("/login");

  const allowed = await rateLimit(
    rateLimitBucket("cashier:redeem", organization.id, user.id),
    RATE_LIMITS.cashier,
    { failClosed: true },
  );
  if (!allowed) return { ok: false, error: "Trop de tentatives, patientez." };

  // FUSEAU DE L'ÉTABLISSEMENT, jamais celui de l'hôte. Les quatre motifs de
  // refus datés de cette action retombaient sur `Europe/Paris` : à Papeete le
  // caissier lisait le mauvais JOUR, pendant que la carte affichée juste
  // au-dessus — qui, elle, reçoit `organization.timezone` — donnait le bon.
  const fuseau = organization.timezone;

  const admin = createAdminClient();
  const universal = await redeemThroughUniversalRegistry(
    admin,
    organization.id,
    parsed.data,
    user.id,
    {
      noun: "lot",
      family: "contest",
      basketCents,
      datesDansLeFuseau: fuseau,
    },
  );
  if (universal) return universal;

  const { data: rows, error } = await admin.rpc(
    "redeem_contest_award",
    {
      p_organization_id: organization.id,
      p_code: parsed.data,
      p_actor: user.id,
      p_basket_cents: basketCents,
    },
  );
  if (error) {
    reportError("pronostics.redeem", error.message);
    return { ok: false, error: "Validation impossible" };
  }

  const row = (rows as Array<{
    redeemed_now: boolean;
    redeemed_at: string | null;
    redeem_expires_at: string | null;
    status: string;
  }> | null)?.[0];
  if (!row) return { ok: false, error: "Code introuvable" };
  if (!row.redeemed_now) {
    // La base a refusé : dire précisément pourquoi à la caisse. Les trois cas
    // sont exclusifs — la contrainte (status='delivered') = (redeemed_at not
    // null) interdit qu'un lot annulé porte un horodatage de remise.
    if (row.redeemed_at) {
      return {
        ok: false,
        error: `Ce lot a déjà été remis le ${formatDate(row.redeemed_at, fuseau)}`,
      };
    }
    if (row.status === "cancelled") {
      return { ok: false, error: "Ce lot a été annulé" };
    }
    if (
      row.redeem_expires_at &&
      new Date(row.redeem_expires_at).getTime() <= Date.now()
    ) {
      return {
        ok: false,
        error: `Code expiré le ${formatDate(row.redeem_expires_at, fuseau)} — le délai de retrait est dépassé`,
      };
    }
    return { ok: false, error: "Ce lot ne peut pas être remis" };
  }

  revalidatePath("/dashboard/redeem");
  return { ok: true, data: undefined };
}

/**
 * Valide en caisse le RETRAIT D'UNE UNITÉ DE STOCK (code RESA-…, RES-5).
 *
 * ── LE ROUTEUR UNIVERSEL EST LE SEUL CHEMIN, ET IL N'Y A PAS DE REPLI ──
 *
 * Les neuf autres familles gardent leur RPC legacy en repli, pour les codes émis
 * avant le registre. Cette famille-ci est NÉE avec le registre : son miroir est
 * écrit dans la transaction même de la prise, et `redeem_stock_hold` n'est PAS
 * un point d'entrée de comptoir — c'est un BRAS SOURCE, dont le commentaire SQL
 * dit qu'« la caisse n'a qu'une porte, et c'est le routeur universel ». L'appeler
 * directement d'ici aurait ouvert une seconde porte, non auditée par le
 * registre, sur la seule famille qui n'en a jamais eu besoin.
 *
 * Un registre indisponible rend donc « Validation impossible — réessayez »
 * plutôt qu'un repli : mieux vaut un refus honnête, que le caissier peut
 * réessayer, qu'un chemin parallèle qui remettrait l'unité sans que le registre
 * le sache. Ce refus-là est SOIGNEUSEMENT distinct de « Code introuvable » —
 * voir `UniversalRedeemOutcome` : l'un dit « recommence », l'autre dit « refais
 * saisir », et le caissier n'a pas les moyens de deviner lequel s'applique.
 *
 * ── LE QUATRIÈME REFUS, QUI N'APPARTIENT QU'À CETTE FAMILLE ──
 *
 * `source_refused` — le bras source a refusé, le registre n'a pas de mot pour
 * dire pourquoi. Sur cette famille il n'a qu'une cause possible : LA FENÊTRE
 * N'EST PAS ENCORE OUVERTE (la borne haute, elle, est appliquée par le registre
 * lui-même et ressort en `expired`, et les deux états terminaux sont écartés
 * avant d'atteindre le bras). Le traduire par le générique « ce lot ne peut pas
 * être remis » serait FAUX et décourageant : le lot est parfaitement valide, il
 * n'est simplement pas l'heure. On relit donc la fenêtre — org-scopée, sur la
 * ligne — et on la donne au comptoir.
 */
export async function redeemStockHold(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = stockHoldRedeemCodeSchema.safeParse(formData.get("code"));
  if (!parsed.success) return { ok: false, error: "Code de retrait invalide" };

  // Panier FACULTATIF, comme la roue et les pronostics : une unité se retire au
  // comptoir, et le montant dépensé à cette occasion alimente le revenu
  // attribuable. Le bras source l'écrit SUR LA PRISE, et le trigger de miroir le
  // propage au registre de lui-même — le routeur n'a rien à recopier.
  const basketCents = parseBasketToCents(String(formData.get("basket") ?? ""));
  if (basketCents === undefined) {
    return { ok: false, error: "Montant du panier invalide" };
  }

  const { user, organization } = await getUserAndOrg();
  if (!user || !organization) redirect("/login");

  const allowed = await rateLimit(
    rateLimitBucket("cashier:redeem", organization.id, user.id),
    RATE_LIMITS.cashier,
    { failClosed: true },
  );
  if (!allowed) return { ok: false, error: "Trop de tentatives, patientez." };

  // FUSEAU DE L'ÉTABLISSEMENT, jamais celui de l'hôte : les deux messages datés
  // de cette action sont lus au comptoir, à côté d'une carte qui affiche déjà
  // ses dates dans ce fuseau-là.
  const fuseau = organization.timezone;

  const admin = createAdminClient();
  const issue = await tryUniversalRedeem(
    admin,
    organization.id,
    parsed.data,
    user.id,
    "reserver_stock",
    basketCents,
  );

  // DEUX SILENCES, DEUX PHRASES — c'est ce que la docstring ci-dessus promet, et
  // ce que le premier jet ne faisait pas : les deux ressortaient en « code
  // introuvable ».
  //
  // Le registre EN PANNE ne dit rien du code. Envoyer le caissier refaire saisir
  // un lot valide, devant le client, pendant que la base tousse, est le mauvais
  // conseil au mauvais moment : ce qu'il faut, c'est réessayer. Et comme cette
  // famille n'a pas de repli legacy, personne d'autre ne rattrapera derrière.
  if (issue.kind === "registry_error") {
    return { ok: false, error: "Validation impossible — réessayez" };
  }
  // Le registre a RÉPONDU et ne connaît pas ce code : pour cette famille, cela
  // ne peut pas être un code « historique non miroirisé » — elle est née avec le
  // registre. C'est un code inventé, ou d'une autre organisation — les deux se
  // disent pareil, et le caissier fait recommencer la saisie.
  if (issue.kind === "unknown_code") {
    return { ok: false, error: "Code introuvable" };
  }

  const row = issue.row;
  if (!row.redeemed_now) {
    if (row.state === "source_refused") {
      return {
        ok: false,
        error: await refusRetraitStock(admin, organization.id, parsed.data, fuseau),
      };
    }
    return universalRedeemFailure(row, "lot", fuseau);
  }

  revalidatePath("/dashboard/redeem");
  return { ok: true, data: undefined };
}

/**
 * Le message d'un retrait refusé PAR LE BRAS SOURCE — c'est-à-dire, sur cette
 * famille, « pas encore l'heure ».
 *
 * La fenêtre est relue sur la prise plutôt que transportée : elle n'est pas dans
 * la réponse du routeur, et la faire voyager par le formulaire aurait laissé
 * l'écran choisir la date qu'on lui oppose.
 *
 * ── SUR LA PRISE, ET SURTOUT PAS SUR L'OFFRE ──
 *
 * `redeem_stock_hold` applique `redeem_not_before`, GRAVÉE au blocage. Nommer
 * ici la fenêtre COURANTE de l'offre ferait dire au comptoir une heure autre que
 * celle qui vient de le faire refuser — dès qu'un commerçant a réédité sa
 * fenêtre, c'est-à-dire dans le seul cas où les deux diffèrent. Le message doit
 * citer la borne qui a tranché, sans quoi le caissier renvoie le client à une
 * heure où il sera refusé une seconde fois.
 *
 * REPLI GÉNÉRIQUE si la lecture échoue : sans fenêtre à nommer, la phrase « à
 * partir de … » n'aurait rien à mettre après « de ». Mieux vaut le refus sobre
 * des neuf autres familles qu'une date manquante au milieu d'une consigne.
 */
async function refusRetraitStock(
  admin: ReturnType<typeof createAdminClient>,
  organizationId: string,
  code: string,
  fuseau: string,
): Promise<string> {
  const { data: hold } = await admin
    .from("reservation_stock_holds")
    .select("id, redeem_not_before, redeem_expires_at")
    .eq("organization_id", organizationId)
    .eq("code", code)
    .limit(1)
    .maybeSingle();
  if (!hold) return "Ce lot ne peut pas être remis";

  return libelleRetraitTropTot(
    formatFenetreStock(hold.redeem_not_before, hold.redeem_expires_at, fuseau),
  );
}

/**
 * Valide en caisse la remise d'un lot de chasse au trésor via la RPC
 * dédiée redeem_hunt_completion (atomique, auditée, org-scopée). Un code
 * inconnu ou d'une autre organisation ne renvoie aucune ligne.
 */
export async function redeemHuntCompletion(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = huntRedeemCodeSchema.safeParse(formData.get("code"));
  if (!parsed.success) return { ok: false, error: "Code de retrait invalide" };

  const { user, organization } = await getUserAndOrg();
  if (!user || !organization) redirect("/login");

  const allowed = await rateLimit(
    rateLimitBucket("cashier:redeem", organization.id, user.id),
    RATE_LIMITS.cashier,
    { failClosed: true },
  );
  if (!allowed) return { ok: false, error: "Trop de tentatives, patientez." };

  const admin = createAdminClient();
  const universal = await redeemThroughUniversalRegistry(
    admin,
    organization.id,
    parsed.data,
    user.id,
    { noun: "lot", family: "hunt" },
  );
  if (universal) return universal;

  const { data: rows, error } = await admin.rpc(
    "redeem_hunt_completion",
    {
      p_organization_id: organization.id,
      p_code: parsed.data,
      p_actor: user.id,
    },
  );
  if (error) {
    reportError("hunts.redeem", error.message);
    return { ok: false, error: "Validation impossible" };
  }

  const row = (rows as Array<{ redeemed_now: boolean }> | null)?.[0];
  if (!row) return { ok: false, error: "Code introuvable" };
  if (!row.redeemed_now) return { ok: false, error: "Ce lot a déjà été remis" };

  revalidatePath("/dashboard/redeem");
  return { ok: true, data: undefined };
}
