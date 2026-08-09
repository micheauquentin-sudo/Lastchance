import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import { sanitizeSearchTerm } from "@/lib/utils";
import {
  endOfLocalDayToIso,
  isValidDateOnly,
  startOfLocalDayToIso,
} from "@/lib/date-time";

/**
 * Filtres de la page Participations — partagés par l'écran et son export CSV.
 *
 * Ils vivent ici pour une raison mesurée : l'export exportait la liste ENTIÈRE
 * alors que le lien « Exporter en CSV » est posé sur un écran filtré. Le
 * commerçant qui filtrait sur une campagne obtenait un fichier de toutes les
 * autres, sans le moindre signe. Un seul module de filtres, appliqué par les
 * deux, rend cette divergence structurellement impossible.
 *
 * La liste des participations n'a PAS de RPC dédiée (contrairement aux
 * clients) : les prédicats sont écrits ici, en PostgREST.
 */

// ── Statuts ──────────────────────────────────────────────────
//
// `participations` n'a AUCUNE colonne de statut : l'état se lit sur trois
// horodatages (`cancelled_at`, `redeemed_at`, `redeem_expires_at`). Les
// prédicats ci-dessous reproduisent donc, dans le MÊME ORDRE de priorité, la
// cascade d'affichage de la pastille (page.tsx) — annulé, puis récupéré, puis
// expiré, puis à valider. Sans cette exclusivité, une participation annulée
// serait comptée aussi dans « À valider » (son `redeemed_at` est nul) et le
// filtre ramènerait des lignes dont la pastille dit autre chose.
export const STATUTS = [
  { value: "a-valider", label: "À valider" },
  { value: "recuperes", label: "Récupérés" },
  { value: "annules", label: "Annulés" },
  { value: "expires", label: "Expirés" },
] as const;

export type StatutValue = (typeof STATUTS)[number]["value"];

export interface ParticipationFilters {
  campaign?: string;
  q?: string;
  statut?: StatutValue;
  /** Date civile `YYYY-MM-DD` telle que saisie (pour réafficher le champ). */
  du?: string;
  au?: string;
  /** Libellé de lot exact ; le filtre passe par les `prize_id` correspondants. */
  lot?: string;
}

export function parseParticipationFilters(raw: {
  campaign?: string;
  q?: string;
  statut?: string;
  du?: string;
  au?: string;
  lot?: string;
}): ParticipationFilters {
  const statut = STATUTS.find((s) => s.value === raw.statut)?.value;
  // Une date mal formée est ignorée, pas rejetée : `startOfLocalDayToIso` lève
  // sur une entrée invalide et un paramètre d'URL bricolé ne doit pas rendre la
  // page inaccessible au commerçant.
  const du = raw.du && isValidDateOnly(raw.du) ? raw.du : undefined;
  const au = raw.au && isValidDateOnly(raw.au) ? raw.au : undefined;
  return {
    campaign: raw.campaign || undefined,
    q: raw.q?.trim() || undefined,
    statut,
    du,
    au,
    lot: raw.lot?.trim().slice(0, 120) || undefined,
  };
}

export function participationFiltresActifs(f: ParticipationFilters): boolean {
  return Boolean(f.campaign || f.q || f.statut || f.du || f.au || f.lot);
}

/** Paramètres d'URL à propager (pagination, export). */
export function participationSearchParams(
  f: ParticipationFilters,
): Record<string, string | undefined> {
  return {
    campaign: f.campaign,
    q: f.q,
    statut: f.statut,
    du: f.du,
    au: f.au,
    lot: f.lot,
  };
}

/**
 * Surface minimale d'un `PostgrestFilterBuilder`.
 *
 * Deux détails de typage la rendent utilisable sur les deux appelants, dont les
 * `select` ont des formes différentes :
 *  - les méthodes sont déclarées en SYNTAXE DE MÉTHODE, donc bivariantes sur
 *    leurs paramètres : les vrais `eq`/`gte` contraignent leur colonne à
 *    `keyof Row`, un paramètre `string` ne leur serait pas assignable sinon ;
 *  - le retour est `this` (type polymorphe) et non un paramètre générique
 *    auto-référent — cette dernière forme faisait exploser l'inférence sur la
 *    requête de l'export (TS2589, « type instantiation is excessively deep »).
 */
export interface FilterBuilderLike {
  eq(column: string, value: string): this;
  gte(column: string, value: string): this;
  lte(column: string, value: string): this;
  is(column: string, value: null): this;
  not(column: string, operator: string, value: null): this;
  or(filters: string): this;
  in(column: string, values: string[]): this;
}

/** UUID nul : aucun `prize_id` ne le porte, donc « aucun résultat ». */
const AUCUN_LOT = "00000000-0000-0000-0000-000000000000";

/**
 * Applique les filtres à une requête `participations`.
 *
 * @param fuseau  Fuseau de l'établissement. Les bornes `du`/`au` désignent des
 *   jours CIVILS de ce fuseau : bornées en UTC, elles décaleraient d'une à
 *   douze heures et feraient disparaître les participations du petit matin.
 * @param prizeIds `prize_id` du libellé de lot demandé, résolus par
 *   `resolvePrizeIds`. `undefined` quand aucun filtre de lot n'est actif.
 * @param maintenant Instant de référence de l'expiration (injectable pour les
 *   tests ; la page passe l'heure de la requête).
 *
 * ⚠ La fonction ne rend RIEN et travaille par EFFET DE BORD sur la requête
 * passée. Ce n'est pas un raccourci : les méthodes de `PostgrestFilterBuilder`
 * font `this.url.searchParams.append(…); return this` — la requête filtrée est
 * le MÊME objet. Rendre `Q` obligerait à faire remonter le type du `select`
 * jusqu'ici, et l'inférence explosait sur celui de l'export (TS2589). L'appelant
 * garde donc sa propre référence, typée par son `select` à lui.
 */
export function applyParticipationFilters(
  query: FilterBuilderLike,
  f: ParticipationFilters,
  fuseau: string,
  prizeIds: string[] | undefined,
  maintenant: Date = new Date(),
): void {
  if (f.campaign) query.eq("campaign_id", f.campaign);

  if (f.q) {
    const term = sanitizeSearchTerm(f.q);
    if (term) {
      query.or(
        `redeem_code.ilike.%${term}%,first_name.ilike.%${term}%,email.ilike.%${term}%`,
      );
    }
  }

  if (f.du) query.gte("created_at", startOfLocalDayToIso(f.du, fuseau));
  // `lte` sur la FIN du jour civil (23:59:59.999) : le jour saisi dans « au »
  // est inclus, comme le lit n'importe quel commerçant.
  if (f.au) query.lte("created_at", endOfLocalDayToIso(f.au, fuseau));

  if (prizeIds) query.in("prize_id", prizeIds.length > 0 ? prizeIds : [AUCUN_LOT]);

  const nowIso = maintenant.toISOString();
  switch (f.statut) {
    case "a-valider":
      // Ni annulée, ni récupérée, ni expirée : la seule ligne sur laquelle le
      // commerçant a encore un geste à faire.
      query
        .is("cancelled_at", null)
        .is("redeemed_at", null)
        .or(`redeem_expires_at.is.null,redeem_expires_at.gt.${nowIso}`);
      break;
    case "recuperes":
      query.is("cancelled_at", null).not("redeemed_at", "is", null);
      break;
    case "annules":
      query.not("cancelled_at", "is", null);
      break;
    case "expires":
      query
        .is("cancelled_at", null)
        .is("redeemed_at", null)
        .lte("redeem_expires_at", nowIso);
      break;
    default:
      break;
  }
}

/**
 * Résout les `prize_id` d'un libellé de lot. Le filtre porte sur le LIBELLÉ et
 * non sur un identifiant parce que c'est ce que le commerçant lit dans la
 * colonne « Lot » — et qu'un même lot (« Café offert ») existe en autant de
 * lignes `prizes` qu'il y a de roues.
 */
export async function resolvePrizeIds(
  supabase: SupabaseClient<Database>,
  organizationId: string,
  label: string,
): Promise<string[]> {
  const { data } = await supabase
    .from("prizes")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("label", label)
    .limit(500);
  return (data ?? []).map((p) => p.id);
}
