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

/**
 * Les segments, dans l'ordre de la RPC `customer_segment_matches`.
 *
 * Les deux derniers (VIT-4) ne sortent PAS des gains mais de `reservations` :
 * « a réservé » au moins une fois, « est venu » au moins une fois (check-in).
 * Ils n'ont donc ni seuil ni fenêtre — c'est un fait, pas un calcul — et c'est
 * pourquoi ils n'apparaissent pas dans `customerBadges`, qui ne sait dériver
 * que des trois premiers depuis `wins` et `last_win`. Leur pastille vient de
 * deux colonnes rendues par la RPC (`a_reserve`, `est_venu`), et l'écran les
 * lit telles quelles.
 */
export const SEGMENTS = [
  { value: "fidele", label: "Fidèles" },
  { value: "nouveau", label: "Nouveaux" },
  { value: "a_relancer", label: "À relancer" },
  { value: "a_reserve", label: "A réservé" },
  { value: "venu", label: "Est venu" },
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

// ── Export CSV ───────────────────────────────────────────────

/** Plafond dur de la RPC : au-delà elle lève « invalid pagination ». */
export const EXPORT_PAGE_SIZE = 100;
/** Même borne que l'export des participations. */
export const EXPORT_MAX_ROWS = 10_000;

export interface ProfilExport {
  email: string;
  first_name: string | null;
  wins: number;
  redeemed: number;
  first_win: string;
  last_win: string;
  /** A réservé au moins une fois (VIT-4) — un fait, pas un seuil. */
  a_reserve: boolean;
  /** S'est présenté au moins une fois (check-in enregistré). */
  est_venu: boolean;
  /** Total AVANT pagination, rendu en fenêtre sur chaque ligne par la RPC. */
  total_count: number;
}

/**
 * Collecte les profils à exporter en paginant la RPC.
 *
 * Deux corrections par rapport à la boucle naïve, qui partait pour CENT appels
 * séquentiels — chacun un `group by` complet plus un `count` en fenêtre :
 *
 *  - la boucle est bornée par le `total_count` LU AU PREMIER APPEL, donc par le
 *    nombre de pages réel. Une organisation de trois cents clients coûte trois
 *    appels, pas cent ;
 *  - la troncature à dix mille lignes est RENDUE à l'appelant au lieu d'être
 *    silencieuse. Un fichier amputé sans le dire est pire qu'un refus : le
 *    commerçant croit tenir sa base.
 */
export async function collecterProfilsExport(
  lirePage: (offset: number, limit: number) => Promise<ProfilExport[]>,
): Promise<{ rows: ProfilExport[]; total: number; tronque: boolean }> {
  const premiere = await lirePage(0, EXPORT_PAGE_SIZE);
  const total = premiere[0]?.total_count ?? 0;
  const cible = Math.min(total, EXPORT_MAX_ROWS);
  const rows = premiere.slice(0, cible);

  while (rows.length < cible && premiere.length === EXPORT_PAGE_SIZE) {
    const suite = await lirePage(rows.length, EXPORT_PAGE_SIZE);
    if (suite.length === 0) break; // Filet : la liste a rétréci entre deux appels.
    rows.push(...suite.slice(0, cible - rows.length));
    if (suite.length < EXPORT_PAGE_SIZE) break;
  }

  return { rows, total, tronque: total > rows.length };
}

/**
 * Sérialise l'export. Le TÉLÉPHONE n'y figure pas, comme il ne figure pas à
 * l'écran : la RPC le cherche sans le rendre, décision d'exposition prise en
 * base (20260923120000).
 */
export function csvClients(
  rows: ProfilExport[],
  etat: { total: number; tronque: boolean },
  csvCell: (v: string | number | null | undefined) => string,
): string {
  const header = [
    "email",
    "prenom",
    "gains",
    "recuperes",
    "premier_gain",
    "dernier_gain",
    "a_reserve",
    "est_venu",
  ].join(";");

  // « oui » / « non » et non `true` / `false` : ce fichier s'ouvre dans le
  // tableur d'un commerçant, pas dans un débogueur, et un booléen anglais y
  // devient une colonne qu'il faut traduire à la main avant de filtrer.
  const ouiNon = (v: boolean) => (v ? "oui" : "non");

  const lines = rows.map((r) =>
    [
      csvCell(r.email),
      csvCell(r.first_name ?? ""),
      csvCell(r.wins),
      csvCell(r.redeemed),
      csvCell(r.first_win),
      csvCell(r.last_win),
      csvCell(ouiNon(r.a_reserve)),
      csvCell(ouiNon(r.est_venu)),
    ].join(";"),
  );

  // La troncature est DITE, dans le fichier lui-même : c'est le seul endroit
  // que le commerçant regardera. Une ligne de commentaire en fin de CSV plutôt
  // qu'un en-tête HTTP, qu'aucun tableur n'affiche.
  if (etat.tronque) {
    lines.push(
      csvCell(
        `Export tronqué à ${rows.length} lignes sur ${etat.total} — affinez les filtres pour exporter le reste.`,
      ),
    );
  }

  // BOM UTF-8 pour Excel
  return "﻿" + [header, ...lines].join("\n");
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
