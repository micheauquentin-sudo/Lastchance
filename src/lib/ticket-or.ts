/**
 * LE TICKET D'OR (TKT-1) — les vues, et ce qu'elles refusent de dire.
 *
 * Module PUR : ni `server-only`, ni accès base. Il est lu par l'écran du
 * commerçant comme par celui du client, et ne connaît que des formes.
 */

/** Bornes alignées sur les `check` de `tickets_or_lots`. */
export const TICKET_LIBELLE_MAX = 120;
export const TICKET_POIDS_MAX = 1000;
export const TICKET_JOURS_MIN = 1;
export const TICKET_JOURS_MAX = 180;
export const TICKET_JOURS_DEFAUT = 30;

export interface LotTicketOrView {
  id: string;
  libelle: string;
  poids: number;
  /** `null` = illimité. Distinct de 0, qui veut dire « épuisé ». */
  stock: number | null;
  actif: boolean;
  ordre: number;
}

export interface MesuresTicketOr {
  emis: number;
  tires: number;
  remis: number;
  aRemettre: number;
}

export interface TicketOrView {
  lots: LotTicketOrView[];
  mesures: MesuresTicketOr;
}

export function ticketOrVide(): TicketOrView {
  return {
    lots: [],
    mesures: { emis: 0, tires: 0, remis: 0, aRemettre: 0 },
  };
}

function entier(brut: unknown): number {
  return typeof brut === "number" && Number.isFinite(brut) && brut >= 0
    ? Math.trunc(brut)
    : 0;
}

/**
 * La réponse de `tickets_or_state` → la vue.
 *
 * REPLI FERMÉ : un document illisible rend un état VIDE, jamais une erreur.
 * Le commerçant a le droit de voir cet écran ; il n'a peut-être rien à y lire.
 */
export function mapTicketOrState(brut: unknown): TicketOrView {
  if (typeof brut !== "object" || brut === null) return ticketOrVide();
  const racine = brut as Record<string, unknown>;
  if (racine.state !== "ok") return ticketOrVide();

  const mesures =
    typeof racine.mesures === "object" && racine.mesures !== null
      ? (racine.mesures as Record<string, unknown>)
      : {};

  return {
    lots: (Array.isArray(racine.lots) ? racine.lots : [])
      .map((ligne) => {
        if (typeof ligne !== "object" || ligne === null) return null;
        const l = ligne as Record<string, unknown>;
        if (typeof l.id !== "string" || typeof l.libelle !== "string") {
          return null;
        }
        return {
          id: l.id,
          libelle: l.libelle,
          poids: entier(l.poids),
          // `null` TRAVERSE INTACT : le confondre avec 0 aurait transformé
          // « illimité » en « épuisé » à l'affichage.
          stock: typeof l.stock === "number" ? Math.trunc(l.stock) : null,
          actif: l.actif === true,
          ordre: entier(l.ordre),
        };
      })
      .filter((l): l is LotTicketOrView => l !== null),
    mesures: {
      emis: entier(mesures.emis),
      tires: entier(mesures.tires),
      remis: entier(mesures.remis),
      aRemettre: entier(mesures.a_remettre),
    },
  };
}

/* ────────────────────────────────────────────────────────────
   Le tirage, côté client
   ──────────────────────────────────────────────────────────── */

export type EtatTirage =
  | { state: "ok"; lot: string; codeRetrait: string; expireLe: string | null }
  | { state: "deja_tire" }
  | { state: "expire" }
  | { state: "sans_lot" }
  | { state: "introuvable" };

/**
 * Les cinq états rendus par `tirer_ticket_or`, et leur phrase.
 *
 * `introuvable` COUVRE TROIS CAUSES — code inventé, mal formé, commerce sans
 * offre — et c'est délibéré côté base. La phrase ne les distingue donc pas
 * non plus : ce point d'entrée est ouvert à Internet, et un message plus
 * précis en ferait un oracle.
 */
export const PHRASES_TIRAGE: Record<EtatTirage["state"], string> = {
  ok: "",
  deja_tire: "Ce ticket a déjà été ouvert. Un ticket ne se joue qu'une fois.",
  expire: "Ce ticket a expiré. Demandez-en un nouveau lors de votre prochaine visite.",
  sans_lot:
    "Il n'y a plus rien à gagner pour le moment. Parlez-en au comptoir : votre ticket reste valable si le commerce remet des lots.",
  introuvable: "Ce ticket ne mène nulle part — vérifiez le code.",
};

export function mapTirage(brut: unknown): EtatTirage {
  if (typeof brut !== "object" || brut === null) return { state: "introuvable" };
  const r = brut as Record<string, unknown>;

  if (r.state === "ok" && typeof r.lot === "string" && typeof r.code_retrait === "string") {
    return {
      state: "ok",
      lot: r.lot,
      codeRetrait: r.code_retrait,
      expireLe: typeof r.expire_le === "string" ? r.expire_le : null,
    };
  }
  for (const etat of ["deja_tire", "expire", "sans_lot"] as const) {
    if (r.state === etat) return { state: etat };
  }
  return { state: "introuvable" };
}

/** La forme d'un code de ticket, telle que le `check` de la base l'impose. */
export const CODE_TICKET = /^[A-HJ-NP-Z2-9]{10}$/;

export function estCodeTicket(valeur: unknown): valeur is string {
  return typeof valeur === "string" && CODE_TICKET.test(valeur);
}
