/**
 * Filtres de la page Clients — partagés par l'écran et son export CSV.
 *
 * Ils vivent ici, et non dans chacun des deux fichiers, parce qu'un export qui
 * n'applique pas exactement les filtres de la liste qu'il prétend exporter est
 * pire qu'un export sans filtre : le commerçant croit tenir sa sélection.
 *
 * La normalisation est volontairement PERMISSIVE (valeur inconnue ⇒ défaut
 * silencieux) et miroir de celle de la RPC `org_customer_profiles_page`
 * (20260923120000) : un paramètre d'URL mal tapé ne doit pas rendre la page
 * inaccessible au commerçant.
 */

export const CUSTOMER_PAGE_SIZE = 50;

/** Seuils des segments — les MÊMES que `customer_segment_matches` en base. */
export const LOYAL_FROM_WINS = 3;
export const INACTIVE_AFTER_DAYS = 60;
const DAY_MS = 86_400_000;

export const SEGMENTS = [
  { value: "fidele", label: "Fidèles" },
  { value: "nouveau", label: "Nouveaux" },
  { value: "a_relancer", label: "À relancer" },
] as const;

export type SegmentValue = (typeof SEGMENTS)[number]["value"];

export const TRIS = [
  { value: "dernier_gain", label: "Dernier gain" },
  { value: "gains", label: "Nombre de gains" },
  { value: "recuperes", label: "Gains récupérés" },
  { value: "premier_gain", label: "Premier gain" },
] as const;

export type TriValue = (typeof TRIS)[number]["value"];

export const TRI_DEFAUT: TriValue = "dernier_gain";

export interface CustomerFilters {
  q?: string;
  segment?: SegmentValue;
  tri: TriValue;
}

export function parseCustomerFilters(raw: {
  q?: string;
  segment?: string;
  tri?: string;
}): CustomerFilters {
  const segment = SEGMENTS.find((s) => s.value === raw.segment)?.value;
  const tri = TRIS.find((t) => t.value === raw.tri)?.value ?? TRI_DEFAUT;
  // Pas de `sanitizeSearchTerm` ici : la RPC échappe elle-même `%`, `_` et `\`
  // pour son `ilike`, et retirer `%` côté client priverait le commerçant de la
  // recherche d'un e-mail qui en contiendrait. On borne seulement la longueur.
  const q = raw.q?.trim().slice(0, 80) || undefined;
  return { q, segment, tri };
}

/** Paramètres d'URL à propager (pagination, export, lien « Réinitialiser »). */
export function customerSearchParams(f: CustomerFilters): Record<string, string | undefined> {
  return {
    q: f.q,
    segment: f.segment,
    // Le tri par défaut n'est pas propagé : une URL propre vaut mieux qu'une
    // URL qui répète l'état implicite.
    tri: f.tri === TRI_DEFAUT ? undefined : f.tri,
  };
}

export function customerFiltersActifs(f: CustomerFilters): boolean {
  return Boolean(f.q || f.segment || f.tri !== TRI_DEFAUT);
}

/**
 * Pastilles d'un client — NON EXCLUSIVES, contrairement à la version d'origine
 * de cette page qui rendait « À relancer » en premier avec un `return`.
 *
 * C'est le SQL qui fait foi : `customer_segment_matches` est appliqué segment
 * par segment, sans priorité, donc un client à cinq gains dont le dernier
 * remonte à quatre-vingts jours est fidèle ET à relancer. Une pastille
 * exclusive contredirait le filtre — on le filtrerait sur « fidèle » et
 * l'écran afficherait « À relancer ».
 */
export function customerBadges(
  profile: { wins: number; last_win: string },
  now: number = Date.now(),
): { label: string; className: string }[] {
  const badges: { label: string; className: string }[] = [];
  if (profile.wins >= LOYAL_FROM_WINS) {
    badges.push({ label: "Fidèle", className: "bg-orange-50 text-orange-700" });
  }
  if (profile.wins === 1) {
    badges.push({ label: "Nouveau", className: "bg-sky-50 text-sky-700" });
  }
  const last = new Date(profile.last_win).getTime();
  if (
    Number.isFinite(last) &&
    (now - last) / DAY_MS > INACTIVE_AFTER_DAYS
  ) {
    badges.push({ label: "À relancer", className: "bg-amber-50 text-amber-700" });
  }
  return badges;
}
