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

/**
 * TIRABLE — le prédicat du tirage, écrit UNE fois.
 *
 * C'est la TRADUCTION LITTÉRALE du filtre de `tirer_ticket_or`
 * (20261028120000, où il apparaît deux fois) : `actif and poids > 0 and (stock
 * is null or stock > 0)`. Il vit ici parce que TROIS écrans posent la même
 * question — le tableau de bord (« aucun lot n'est tirable »), l'étape de
 * vérification du studio, et l'aperçu, qui choisit le lot d'exemple.
 *
 * Deux formulations divergentes du même prédicat, ce n'est pas un doublon
 * bénin : c'est un écran qui annonce « prêt » sur une configuration que la base
 * refusera, et un commerçant qui remet des tickets ne donnant rien. Le
 * recopier, c'est signer pour cette panne au premier ajustement du SQL.
 */
export function estLotTirable(lot: {
  actif: boolean;
  poids: number;
  stock: number | null;
}): boolean {
  // `stock === null` et NON `!lot.stock` : `0` est un stock ÉPUISÉ, pas un
  // stock illimité. Les confondre rendrait tirable un lot qu'il n'y a plus.
  return lot.actif && lot.poids > 0 && (lot.stock === null || lot.stock > 0);
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

/* ────────────────────────────────────────────────────────────
   La mémoire du tirage, sur l'appareil du client
   ──────────────────────────────────────────────────────────── */

export type TirageGagnant = Extract<EtatTirage, { state: "ok" }>;

/**
 * POURQUOI LE RÉSULTAT SE MÉMORISE SUR LE TÉLÉPHONE DU CLIENT.
 *
 * `tirer_ticket_or` ne rend le lot et le code de retrait QU'UNE FOIS : le
 * second appel rend `deja_tire`, sans rien d'autre. C'était tenable tant qu'on
 * lisait un code à voix haute au comptoir. Ça ne l'est plus dès lors qu'on
 * SCANNE un QR : le client ouvre la page dans le navigateur de l'appareil
 * photo, tire, puis bascule vers ses SMS ou verrouille son écran — et un
 * onglet rechargé lui rendait « ce ticket a déjà été ouvert » alors qu'il
 * venait de gagner. Le lot est bien émis au registre, mais il n'avait plus
 * aucun moyen de LIRE son code.
 *
 * La mémoire vit donc sur SON appareil, et nulle part ailleurs :
 *  · elle ne contient que ce que le serveur lui a déjà rendu à lui — aucun
 *    droit nouveau, aucun secret qui ne soit pas déjà sur cet écran ;
 *  · elle ne rejoue RIEN : le tirage reste à usage unique côté base, la
 *    mémoire ne fait que réafficher un résultat acquis ;
 *  · elle est locale : un autre téléphone, un autre navigateur ou une
 *    navigation privée ne la voient pas, et l'écran le dit alors plutôt que
 *    de laisser croire à une perte.
 *
 * Le vrai correctif — que `deja_tire` rende à nouveau le lot — demande une
 * migration et un arbitrage : le code du ticket deviendrait un moyen permanent
 * de relire le code de retrait. Il est proposé à part.
 */
export function cleMemoireTicket(code: string): string {
  return `ticket-or:${code}`;
}

/**
 * Relit un tirage mémorisé. Tout ce qui n'est pas un gain COMPLET et bien
 * formé rend `null` : une mémoire corrompue, tronquée ou bricolée à la main
 * ne doit jamais peindre un faux gain, ni faire échouer le rendu.
 */
export function parserTirageMemorise(brut: unknown): TirageGagnant | null {
  if (typeof brut !== "object" || brut === null) return null;
  const r = brut as Record<string, unknown>;
  if (r.state !== "ok") return null;
  if (typeof r.lot !== "string" || r.lot === "") return null;
  // Le code de RETRAIT n'a pas la forme d'un code de ticket (familles
  // distinctes, cf. l'en-tête de la migration) : on ne valide donc que sa
  // présence, la caisse restant seule juge de sa validité.
  if (typeof r.codeRetrait !== "string" || r.codeRetrait === "") return null;
  return {
    state: "ok",
    lot: r.lot,
    codeRetrait: r.codeRetrait,
    expireLe: typeof r.expireLe === "string" ? r.expireLe : null,
  };
}
