"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import {
  causeDepuisMotif,
  type CauseAnnulation,
} from "@/lib/annulation-cause";
import { getUserAndOrg } from "@/lib/auth";
import { expireGoogleWalletPass } from "@/lib/google-wallet";
import { recordCounter, reportError } from "@/lib/monitoring";
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
 * Tente le nouveau registre avant la RPC historique. `null` signifie que le
 * code n'est pas encore miroirisé (ou que la migration n'est pas disponible) :
 * l'appelant conserve alors exactement son flux legacy.
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
): Promise<UniversalRedeemResult | null> {
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
    return null;
  }
  const row = (data as UniversalRedeemResult[] | null)?.[0] ?? null;
  if (!row) {
    // Le moteur ne connaît pas ce code : c'est le repli legacy qui va sauver
    // l'encaissement. Tant que ce compteur n'est pas durablement à zéro pour
    // une famille, retirer son repli ferait dire « code introuvable » à un
    // caissier tenant un lot valide.
    recordCounter(`rewards.registry_miss.${family}`);
  }
  return row;
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
  const row = await tryUniversalRedeem(
    admin,
    organizationId,
    code,
    actor,
    options.family,
    options.basketCents,
  );
  if (!row) return null;
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
 * Résultat unifié d'une recherche de code en caisse. L'UI distingue le lot
 * de roue, la chasse au trésor, le passeport de fidélité, le jackpot, le
 * mode événement, le calendrier, le parrainage, le quiz et les pronostics
 * par `source`.
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
  | { source: "contest"; award: CashierContestAward };

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
    // `cancelled_reason` : le seul chemin qui dise QUI a annulé. La caisse ne
    // peut pas lire `player_wallet`, scopée au joueur porteur du cookie ; elle
    // dérive donc la cause elle-même (`causeDepuisMotif`). Le motif brut
    // s'arrête ICI — il est saisi à la main par le commerçant et la carte de
    // caisse est lue au comptoir, devant le client.
    .select("source_type, code, label, metadata, cancelled_at, cancelled_reason")
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
    cancelled_reason: string | null;
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
        cancelledCause: causeDepuisMotif(row.cancelled_reason),
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
    code: reward.code,
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
      code: opening.code,
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
