/**
 * Mappers et règles d'affichage pour la réservation de stock et les Drops.
 *
 * Ce module reste sans accès base : les RPC restent l'autorité sur le stock,
 * les prises et les fenêtres. Les exports sont réexportés par `reserver.ts`
 * afin de préserver son contrat public historique.
 */

import { formatDate } from "@/lib/utils";

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function asInt(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.trunc(value)
    : null;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

// LA RÉSERVATION DE STOCK RÉEL ET LE DROP (RES-5, lot L9)
// migration 20261010120000
//
// N unités d'un objet PHYSIQUE, bloquées par des joueurs, retirées AU COMPTOIR
// dans une fenêtre annoncée. Trois choses à ne pas confondre avec le reste du
// module, et elles gouvernent tout ce qui suit.
//
// ── 1. LE RESTANT SE DÉDUIT, IL NE SE DÉCRÉMENTE PAS ──
//
// `remaining = stock_total − (prises « held » NON ÉCHUES + prises « redeemed »)`,
// calculé sous verrou par `hold_stock_offer`. Une prise expirée rend son unité
// par ARITHMÉTIQUE, sans qu'aucune ligne ne change d'état — donc exactement une
// fois. Aucun mapper d'ici ne recalcule ce nombre : il le LIT.
//
// ── 2. LE « DROP » N'EST PAS UN TYPE ──
//
// Une offre à fenêtre courte et proche EST un Drop ; une offre à fenêtre large
// est une réserve ordinaire. Aucun champ, aucun état d'écran ne le distingue —
// un booléen aurait créé une seconde vérité à tenir d'accord avec les dates.
//
// ── 3. LA PRISE EST OUVERTE DÈS `open`, LE RETRAIT SEUL EST BORNÉ ──
//
// On peut bloquer son croissant des heures avant l'ouverture de la fenêtre :
// c'est ce qui fait exister le Drop annoncé. C'est le RETRAIT qui est borné aux
// deux bouts — avant, la caisse refuse (`source_refused`) ; après, le registre
// universel refuse (`expired`).
// ════════════════════════════════════════════════════════════

/** Titre d'une offre — 1..120, exactement le CHECK SQL. */
export const RESERVER_STOCK_TITLE_MAX = 120;
/** Description facultative — 400, exactement le CHECK SQL. */
export const RESERVER_STOCK_DESCRIPTION_MAX = 400;
/**
 * Unités réellement mises de côté — `between 1 and 500`, exactement le CHECK
 * SQL. Le plancher est 1 : une offre à zéro unité n'est pas une offre fermée
 * (`status` dit cela), c'est une promesse sans objet.
 */
export const RESERVER_STOCK_TOTAL_MIN = 1;
export const RESERVER_STOCK_TOTAL_MAX = 500;
/**
 * Combien d'unités UNE personne peut bloquer — `between 1 and 3`, exactement le
 * CHECK SQL. Au-delà, une personne préempte un Drop entier et le partage cesse
 * d'en être un.
 */
export const RESERVER_STOCK_PER_PLAYER_MIN = 1;
export const RESERVER_STOCK_PER_PLAYER_MAX = 3;
/** Défaut SQL de `reservation_stock_offers.per_player_limit`. */
export const RESERVER_STOCK_PER_PLAYER_DEFAUT = 1;

/** Code de comptoir d'une prise — miroir du CHECK `…_holds.code`. */
export const RESERVER_STOCK_CODE_PATTERN = /^RESA-[A-HJ-NP-Z2-9]{8}$/;

/** Statut d'une offre — miroir du CHECK `reservation_stock_offers.status`. */
export type StockOfferStatus = "draft" | "open" | "closed";

/**
 * Statut d'une prise — miroir du CHECK `reservation_stock_holds.status`.
 *
 * `expired` EST DANS LA LISTE ET RIEN NE L'ÉCRIT en L9 : l'expiration est
 * arithmétique. La valeur est admise pour qu'un balayage explicite, s'il naît un
 * jour, ait un état où atterrir — et le mapper doit savoir le lire sans se
 * rabattre sur un défaut.
 */
export type StockHoldStatus = "held" | "redeemed" | "cancelled" | "expired";

/** États rendus par `hold_stock_offer`. */
export type HoldStockOfferState =
  | "held"
  | "already_held"
  | "sold_out"
  | "invalid_email"
  | "unavailable";

/** États rendus par `cancel_stock_hold`. */
export type CancelStockHoldState =
  | "cancelled"
  | "already_redeemed"
  | "too_late"
  | "unknown";

/** États rendus par `stock_offer_public_state`. */
export type StockOfferPublicKind = "ok" | "unavailable";

const STOCK_OFFER_STATUSES: readonly StockOfferStatus[] = [
  "draft",
  "open",
  "closed",
];

const STOCK_HOLD_STATUSES: readonly StockHoldStatus[] = [
  "held",
  "redeemed",
  "cancelled",
  "expired",
];

const HOLD_STATES: readonly HoldStockOfferState[] = [
  "held",
  "already_held",
  "sold_out",
  "invalid_email",
  "unavailable",
];

const CANCEL_HOLD_STATES: readonly CancelStockHoldState[] = [
  "cancelled",
  "already_redeemed",
  "too_late",
  "unknown",
];

/**
 * Statut d'offre, replié sur `draft` — le plus FERMÉ des trois.
 *
 * Un document illisible ne doit jamais faire afficher « ouverte » : le repli
 * fermé fait au pire disparaître un bouton, là où le repli ouvert ferait
 * promettre une prise que la base refusera.
 */
export function asStockOfferStatus(value: unknown): StockOfferStatus {
  const brut = asString(value);
  return brut && (STOCK_OFFER_STATUSES as string[]).includes(brut)
    ? (brut as StockOfferStatus)
    : "draft";
}

/** Statut de prise, replié sur `held` — l'état d'une prise vivante. */
export function asStockHoldStatus(value: unknown): StockHoldStatus {
  const brut = asString(value);
  return brut && (STOCK_HOLD_STATUSES as string[]).includes(brut)
    ? (brut as StockHoldStatus)
    : "held";
}

// ────────────────────────────────────────────────────────────
// `hold_stock_offer`
// ────────────────────────────────────────────────────────────

export interface HoldStockOfferResult {
  state: HoldStockOfferState;
  /** Présent sur `held` et `already_held`. */
  holdId: string | null;
  /** Code de comptoir `RESA-…`. Présent sur `held` et `already_held`. */
  code: string | null;
  /** Statut de la prise rendue par `already_held` (tenue, ou déjà retirée). */
  status: StockHoldStatus | null;
  /** Fenêtre de RETRAIT, rendue avec `held` — la promesse faite au joueur. */
  windowStartsAt: string | null;
  windowEndsAt: string | null;
  /** Échéance GRAVÉE sur la prise (`held`) — jamais recalculée d'une parente. */
  redeemExpiresAt: string | null;
  /**
   * Restant APRÈS cette prise (`held`), et `0` sur `sold_out` — la RPC ne rend
   * rien d'autre dans ce cas, et il ne faut rien inventer de plus.
   */
  remaining: number | null;
  /** Plafond par personne, rendu avec `already_held` — de quoi expliquer. */
  perPlayerLimit: number | null;
}

/**
 * Mappe le `jsonb` de `hold_stock_offer`.
 *
 * `holdId` / `code` ne sont retenus que pour les deux états qui PROUVENT qu'une
 * unité appartient à ce joueur (`held`, `already_held`) : un `unavailable` qui
 * charrierait un code par accident le donnerait à quelqu'un qui ne tient rien —
 * et un code `RESA-` est un droit au porteur.
 */
export function mapHoldStockOffer(raw: unknown): HoldStockOfferResult {
  const root = asRecord(raw);
  const stateRaw = root ? asString(root.state) : null;
  const state: HoldStockOfferState =
    stateRaw && (HOLD_STATES as string[]).includes(stateRaw)
      ? (stateRaw as HoldStockOfferState)
      : "unavailable";

  const detenue = state === "held" || state === "already_held";

  return {
    state,
    holdId: detenue && root ? asString(root.hold_id) : null,
    code: detenue && root ? asString(root.code) : null,
    status:
      state === "already_held" && root
        ? asStockHoldStatus(root.status)
        : state === "held"
          ? "held"
          : null,
    windowStartsAt: state === "held" && root ? asString(root.window_starts_at) : null,
    windowEndsAt: state === "held" && root ? asString(root.window_ends_at) : null,
    redeemExpiresAt:
      state === "held" && root ? asString(root.redeem_expires_at) : null,
    // `sold_out` porte `remaining: 0` ET RIEN D'AUTRE — c'est tout ce que le
    // module sait du stock réel, et un oracle inventé se ferait démentir au
    // comptoir.
    remaining:
      (state === "held" || state === "sold_out") && root
        ? asInt(root.remaining)
        : null,
    perPlayerLimit:
      state === "already_held" && root ? asInt(root.per_player_limit) : null,
  };
}

// ────────────────────────────────────────────────────────────
// `cancel_stock_hold`
// ────────────────────────────────────────────────────────────

export interface CancelStockHoldResult {
  state: CancelStockHoldState;
  holdId: string | null;
  cancelledAt: string | null;
  /** Échéance rendue avec `too_late` — de quoi expliquer le refus. */
  redeemExpiresAt: string | null;
}

export function mapCancelStockHold(raw: unknown): CancelStockHoldResult {
  const root = asRecord(raw);
  const stateRaw = root ? asString(root.state) : null;
  const state: CancelStockHoldState =
    stateRaw && (CANCEL_HOLD_STATES as string[]).includes(stateRaw)
      ? (stateRaw as CancelStockHoldState)
      : "unknown";

  return {
    state,
    holdId: state === "unknown" || !root ? null : asString(root.hold_id),
    cancelledAt: state === "cancelled" && root ? asString(root.cancelled_at) : null,
    redeemExpiresAt:
      state === "too_late" && root ? asString(root.redeem_expires_at) : null,
  };
}

// ────────────────────────────────────────────────────────────
// `stock_offer_public_state`
// ────────────────────────────────────────────────────────────

/** La prise de CE navigateur sur cette offre, telle que la RPC la rend. */
export interface StockHoldMineView {
  holdId: string;
  code: string;
  status: StockHoldStatus;
  /** Les DEUX bornes gravées à la prise (doctrine 20260904120000) : c'est
   *  elles que le comptoir applique, pas la fenêtre courante de l'offre —
   *  une réédition de fenêtre ne change pas le sort d'une prise consentie. */
  redeemNotBefore: string | null;
  redeemExpiresAt: string | null;
}

export interface StockOfferPublicStateResult {
  state: StockOfferPublicKind;
  offerId: string | null;
  title: string | null;
  description: string | null;
  status: StockOfferStatus | null;
  windowStartsAt: string | null;
  windowEndsAt: string | null;
  perPlayerLimit: number | null;
  /**
   * Restant HONNÊTE mais NON VERROUILLÉ : c'est une PHOTO, jamais une
   * réservation. Entre cette lecture et l'appel à `hold_stock_offer`, le nombre
   * peut tomber à zéro — la RPC de prise, sous verrou, décide seule.
   */
  remaining: number;
  /** `null` sans cookie, ou si ce navigateur ne tient rien sur cette offre. */
  myHold: StockHoldMineView | null;
}

const OFFRE_INDISPONIBLE: StockOfferPublicStateResult = {
  state: "unavailable",
  offerId: null,
  title: null,
  description: null,
  status: null,
  windowStartsAt: null,
  windowEndsAt: null,
  perPlayerLimit: null,
  remaining: 0,
  myHold: null,
};

export function mapStockOfferPublicState(
  raw: unknown,
): StockOfferPublicStateResult {
  const root = asRecord(raw);
  if (!root || asString(root.state) !== "ok") return OFFRE_INDISPONIBLE;
  const offerId = asString(root.offer_id);
  // Un document « ok » sans offre est corrompu, pas incomplet : il n'y a rien à
  // afficher et rien à réserver. On rend l'indisponible plutôt que d'inventer.
  if (!offerId) return OFFRE_INDISPONIBLE;

  const mien = asRecord(root.my_hold);
  const holdId = mien ? asString(mien.hold_id) : null;
  const code = mien ? asString(mien.code) : null;

  return {
    state: "ok",
    offerId,
    title: asString(root.title),
    description: asString(root.description),
    status: asStockOfferStatus(root.status),
    windowStartsAt: asString(root.window_starts_at),
    windowEndsAt: asString(root.window_ends_at),
    perPlayerLimit: asInt(root.per_player_limit),
    remaining: asInt(root.remaining) ?? 0,
    myHold:
      mien && holdId && code
        ? {
            holdId,
            code,
            status: asStockHoldStatus(mien.status),
            redeemNotBefore: asString(mien.redeem_not_before),
            redeemExpiresAt: asString(mien.redeem_expires_at),
          }
        : null,
  };
}

// ────────────────────────────────────────────────────────────
// `stock_offers_staff_state`
// ────────────────────────────────────────────────────────────

/** Une offre et ses compteurs, vue du comptoir. */
export interface StockOfferStaffView {
  offerId: string;
  title: string;
  /**
   * RENDUE PARCE QUE LE PANNEAU LA RÉÉCRIT, et pas pour l'afficher.
   *
   * Le formulaire d'édition poste tous les champs de l'offre : sans cette
   * valeur à préremplir, le champ partait vide et le premier enregistrement
   * EFFAÇAIT la description. Une liste de lecture peut se passer d'un texte
   * long ; un formulaire qui le réécrit, jamais.
   */
  description: string | null;
  status: StockOfferStatus;
  windowStartsAt: string | null;
  windowEndsAt: string | null;
  stockTotal: number;
  perPlayerLimit: number;
  /** Prises tenues MAINTENANT (`held` non échues). */
  heldCount: number;
  redeemedCount: number;
  /**
   * Prises ÉTEINTES SANS RETRAIT — entièrement DÉRIVÉ, aucune ligne ne porte cet
   * état. C'est la mesure du gaspillage évité qui ne l'a pas été : combien de
   * gens ont bloqué leur part sans venir la chercher.
   */
  expiredCount: number;
  cancelledCount: number;
  remaining: number;
}

export interface StockOffersStaffStateResult {
  ok: boolean;
  offers: StockOfferStaffView[];
}

const ETAT_OFFRES_INCONNU: StockOffersStaffStateResult = {
  ok: false,
  offers: [],
};

export function mapStockOffersStaffState(
  raw: unknown,
): StockOffersStaffStateResult {
  const root = asRecord(raw);
  if (!root || asString(root.state) !== "ok") return ETAT_OFFRES_INCONNU;

  return {
    ok: true,
    offers: asArray(root.offers).flatMap((brut) => {
      const item = asRecord(brut);
      const offerId = item ? asString(item.offer_id) : null;
      // Sans identifiant, la ligne n'a ni geste possible ni clé de rendu : elle
      // est écartée, jamais complétée par une valeur inventée.
      if (!item || !offerId) return [];
      const stockTotal = asInt(item.stock_total) ?? 0;
      return [
        {
          offerId,
          title: asString(item.title) ?? "",
          description: asString(item.description),
          status: asStockOfferStatus(item.status),
          windowStartsAt: asString(item.window_starts_at),
          windowEndsAt: asString(item.window_ends_at),
          stockTotal,
          perPlayerLimit:
            asInt(item.per_player_limit) ?? RESERVER_STOCK_PER_PLAYER_DEFAUT,
          heldCount: asInt(item.held_count) ?? 0,
          redeemedCount: asInt(item.redeemed_count) ?? 0,
          expiredCount: asInt(item.expired_count) ?? 0,
          cancelledCount: asInt(item.cancelled_count) ?? 0,
          remaining: asInt(item.remaining) ?? 0,
        } satisfies StockOfferStaffView,
      ];
    }),
  };
}

// ────────────────────────────────────────────────────────────
// États d'écran — ils LISENT ce que le serveur a tranché
// ────────────────────────────────────────────────────────────

/** Ce que le joueur lit sur SA prise. */
export type EtatUiPriseStock = "tenue" | "retiree" | "annulee" | "expiree";

/**
 * État affichable d'une prise.
 *
 * ── L'EXPIRATION EST LA SEULE CHOSE QUI SE DÉDUIT ICI, ET ELLE SE DÉDUIT DE
 * L'ÉCHÉANCE GRAVÉE ──
 *
 * Aucun chemin n'écrit `status = 'expired'` : une prise `held` dont la fenêtre
 * est passée cesse simplement d'être comptée. L'écran doit pourtant dire au
 * joueur que son unité est repartie — d'où cette lecture, qui compare l'échéance
 * GRAVÉE SUR LA PRISE à `maintenant`, et jamais la fenêtre courante de l'offre :
 * un commerçant qui décale sa fenêtre ne doit pas déplacer l'échéance de prises
 * déjà consenties.
 *
 * `retiree` prime sur tout : l'objet est sorti du magasin, et aucune horloge ne
 * défait ce fait.
 */
export function etatUiPriseStock(
  prise: { status: StockHoldStatus; redeemExpiresAt: string | null },
  maintenant: Date = new Date(),
): EtatUiPriseStock {
  if (prise.status === "redeemed") return "retiree";
  if (prise.status === "cancelled") return "annulee";
  if (prise.status === "expired") return "expiree";
  if (
    prise.redeemExpiresAt &&
    new Date(prise.redeemExpiresAt).getTime() <= maintenant.getTime()
  ) {
    return "expiree";
  }
  return "tenue";
}

/** Ce que le commerçant et le joueur lisent sur l'ÉTAT D'UNE OFFRE. */
export type EtatUiOffreStock =
  | "brouillon"
  | "ouverte"
  | "epuisee"
  | "passee"
  | "fermee";

/**
 * État affichable d'une offre.
 *
 * ORDRE DES TESTS, ET IL COMPTE. `brouillon` et `fermee` sont des DÉCISIONS du
 * commerçant : elles priment sur tout le reste, y compris sur une fenêtre
 * passée — « fermée » dit ce qu'il a fait, « passée » dirait ce que le temps a
 * fait. Vient ensuite la fenêtre (une offre ouverte dont la fenêtre est écoulée
 * n'accepte plus rien), puis l'épuisement.
 *
 * Le restant vient du SERVEUR : ce mapper ne le recalcule pas et n'a aucun moyen
 * de le faire — la seule autorité est `hold_stock_offer`, sous verrou.
 */
export function etatUiOffreStock(
  offre: {
    status: StockOfferStatus;
    windowEndsAt: string | null;
    remaining: number;
  },
  maintenant: Date = new Date(),
): EtatUiOffreStock {
  if (offre.status === "draft") return "brouillon";
  if (offre.status === "closed") return "fermee";
  if (
    offre.windowEndsAt &&
    new Date(offre.windowEndsAt).getTime() <= maintenant.getTime()
  ) {
    return "passee";
  }
  if (offre.remaining <= 0) return "epuisee";
  return "ouverte";
}

/**
 * L'offre accepte-t-elle une NOUVELLE prise ?
 *
 * INDICATIF, comme `fileAccepteEntree` : `hold_stock_offer` reste seule juge,
 * sous verrou, et c'est elle qui voit le restant réel. Cette fonction sert à
 * choisir un libellé de bouton, jamais à autoriser.
 *
 * LA PRISE EST OUVERTE DÈS `open`, y compris AVANT le début de la fenêtre : rien
 * ici ne regarde `window_starts_at`, et c'est le point du Drop annoncé.
 */
export function offreAccepteePrise(
  offre: {
    status: StockOfferStatus;
    windowEndsAt: string | null;
    remaining: number;
  },
  maintenant: Date = new Date(),
): boolean {
  return etatUiOffreStock(offre, maintenant) === "ouverte";
}

/**
 * Libellé de la FENÊTRE DE RETRAIT, dans le fuseau de l'établissement.
 *
 * Les DEUX bornes sont datées en entier, contrairement à `formatCreneau` qui
 * n'affiche que l'heure de fin : une fenêtre de retrait peut franchir minuit (un
 * Drop de fin de journée relevé le lendemain matin), et « 12 avr. 2026, 18:00 –
 * 10:00 » se lirait comme une fenêtre qui remonte le temps.
 */
export function formatFenetreStock(
  windowStartsAt: string | Date,
  windowEndsAt: string | Date,
  timeZone: string,
): string {
  return `du ${formatDate(windowStartsAt, timeZone)} au ${formatDate(windowEndsAt, timeZone)}`;
}

/**
 * Ce que la caisse dit d'un code `RESA-` présenté TROP TÔT.
 *
 * ── POURQUOI CE MESSAGE EXISTE ICI ET PAS DANS LE REGISTRE ──
 *
 * La borne BASSE de la fenêtre ne vit que dans le bras source
 * (`redeem_stock_hold`) : le registre universel n'a pas de mot pour « trop
 * tôt », et lui en inventer un aurait donné au registre une seconde sémantique
 * temporelle pour UNE famille sur dix. Le routeur rend donc `source_refused` —
 * un état qui, pour les neuf autres familles, se traduit par « ce lot ne peut
 * pas être remis ». Sur cette famille-ci, c'est FAUX et décourageant : le lot
 * est parfaitement valide, il n'est simplement pas l'heure. Le comptoir doit
 * lire la fenêtre, pas un refus opaque.
 */
export function libelleRetraitTropTot(fenetre: string): string {
  return `Retrait pas encore ouvert — fenêtre : ${fenetre}`;
}

/**
 * Page publique d'une offre de stock.
 *
 * MÊME CONTRAT que `cheminFileReserver` : c'est ce QR-là qu'un commerçant colle
 * sur sa vitrine ou publie pour un Drop, et il n'emporte AUCUN jeton, AUCUNE
 * empreinte, AUCUN code (ADR-109). C'est le cookie `lc-player` qui fait
 * retrouver au visiteur SA prise — un lien photographié ou repartagé n'emporte
 * donc pas l'unité de celui qui l'a bloquée.
 */
export function cheminOffreStock(offerId: string): string {
  return `/reserver/stock/${offerId}`;
}

/** La même adresse, absolue — pour le QR du Drop et l'email de confirmation. */
export function urlOffreStock(offerId: string, appUrl: string): string {
  return `${appUrl.replace(/\/+$/, "")}${cheminOffreStock(offerId)}`;
}

