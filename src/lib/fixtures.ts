import "server-only";

import { optionalEnv } from "@/lib/env";
import { getEntry, type Competition } from "@/lib/competitions";

/**
 * Client du fournisseur de calendriers sportifs (TheSportsDB, v1 JSON).
 *
 * Le tier gratuit (clé « 123 ») limite chaque endpoint à ~15 événements :
 * on travaille donc en fenêtre glissante — les 15 prochains matchs à
 * l'import, les 15 derniers pour les résultats — et la synchronisation
 * périodique (cron + bouton) complète au fil de la compétition. Une clé
 * payante (THESPORTSDB_API_KEY) élargit la fenêtre sans changer le code.
 */

const PROVIDER_BASE = "https://www.thesportsdb.com/api/v1/json";

/** Match normalisé côté fournisseur. */
export interface ProviderFixture {
  /** idEvent TheSportsDB — clé de déduplication (contest_matches.external_ref). */
  ref: string;
  homeName: string;
  awayName: string;
  /** Coup d'envoi ISO UTC. */
  kickoffAt: string;
  homeScore: number | null;
  awayScore: number | null;
  /** Résultat connu (deux scores présents et coup d'envoi passé). */
  finished: boolean;
}

/** Forme brute d'un événement TheSportsDB (champs utilisés uniquement). */
interface ProviderEvent {
  idEvent?: string | null;
  strHomeTeam?: string | null;
  strAwayTeam?: string | null;
  /** "2026-08-21T18:45:00" — UTC sans suffixe Z. */
  strTimestamp?: string | null;
  intHomeScore?: string | number | null;
  intAwayScore?: string | number | null;
}

/** Score fournisseur → entier borné 0..99 (CHECK en base ; un 142-0 de
 *  rugby devient 99 — cas d'école sans incidence sur le classement). */
function parseScore(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.min(99, Math.trunc(n));
}

/** Événement brut → fixture normalisée (null si inexploitable). */
export function parseProviderEvent(
  event: ProviderEvent,
  now: Date = new Date(),
): ProviderFixture | null {
  const ref = String(event.idEvent ?? "").trim();
  const homeName = String(event.strHomeTeam ?? "").trim();
  const awayName = String(event.strAwayTeam ?? "").trim();
  const timestamp = String(event.strTimestamp ?? "").trim();
  if (!ref || !homeName || !awayName || !timestamp) return null;

  // strTimestamp est de l'UTC sans marqueur de fuseau : on l'annote
  // explicitement pour ne pas dépendre du fuseau du serveur.
  const kickoff = new Date(
    /Z$|[+-]\d{2}:?\d{2}$/.test(timestamp) ? timestamp : `${timestamp}Z`,
  );
  if (Number.isNaN(kickoff.getTime())) return null;

  const homeScore = parseScore(event.intHomeScore);
  const awayScore = parseScore(event.intAwayScore);
  const finished =
    homeScore !== null &&
    awayScore !== null &&
    kickoff.getTime() <= now.getTime();

  return {
    ref,
    homeName,
    awayName,
    kickoffAt: kickoff.toISOString(),
    homeScore,
    awayScore,
    finished,
  };
}

async function fetchEvents(path: string): Promise<ProviderEvent[]> {
  const key = optionalEnv("THESPORTSDB_API_KEY") ?? "123";
  const response = await fetch(`${PROVIDER_BASE}/${key}/${path}`, {
    signal: AbortSignal.timeout(10_000),
    // Les calendriers bougent peu : petit cache pour absorber les rafales
    // (création + sync rapprochées) sans retaper le fournisseur.
    next: { revalidate: 300 },
  });
  if (!response.ok) {
    throw new Error(`fournisseur calendriers: HTTP ${response.status}`);
  }
  const body = (await response.json()) as { events?: ProviderEvent[] | null };
  return body.events ?? [];
}

/**
 * Prochains matchs + derniers résultats d'une ligue, dédupliqués par
 * idEvent. Deux requêtes fournisseur, jamais plus.
 */
export async function fetchLeagueFixtures(
  leagueId: string,
  now: Date = new Date(),
): Promise<ProviderFixture[]> {
  const [upcoming, past] = await Promise.all([
    fetchEvents(`eventsnextleague.php?id=${encodeURIComponent(leagueId)}`),
    fetchEvents(`eventspastleague.php?id=${encodeURIComponent(leagueId)}`),
  ]);

  const byRef = new Map<string, ProviderFixture>();
  for (const event of [...past, ...upcoming]) {
    const fixture = parseProviderEvent(event, now);
    if (fixture) byRef.set(fixture.ref, fixture);
  }
  return [...byRef.values()];
}

// ────────────────────────────────────────────────────────────
// Correspondance noms fournisseur → catalogue (vignettes)
// ────────────────────────────────────────────────────────────

/** Minuscules, sans accents, sans suffixe sportif (« France Rugby »). */
export function normalizeTeamName(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+(rugby|fc|cf)$/i, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Noms anglais du fournisseur → clés nations du catalogue. */
const NATION_ALIASES: Record<string, string> = {
  france: "fra", brazil: "bra", argentina: "arg", spain: "esp",
  england: "eng", germany: "ger", portugal: "por", netherlands: "ned",
  belgium: "bel", italy: "ita", croatia: "cro", uruguay: "uru",
  colombia: "col", mexico: "mex", usa: "usa", "united states": "usa",
  canada: "can", japan: "jpn", "south korea": "kor", morocco: "mar",
  senegal: "sen", "ivory coast": "civ", algeria: "alg", tunisia: "tun",
  egypt: "egy", ghana: "gha", cameroon: "cmr", switzerland: "sui",
  austria: "aut", poland: "pol", denmark: "den", norway: "nor",
  scotland: "sco", ecuador: "ecu", paraguay: "par", australia: "aus",
  "saudi arabia": "ksa", turkey: "tur", czechia: "cze",
  "czech republic": "cze", serbia: "srb", ukraine: "ukr", hungary: "hun",
  slovenia: "slo", romania: "rou", georgia: "geo", albania: "alb",
  slovakia: "svk", ireland: "irl", wales: "wal", "new zealand": "nzl",
  "south africa": "rsa", fiji: "fij", samoa: "sam", tonga: "ton",
};

/** Noms de clubs du fournisseur → clés clubs du catalogue. */
const CLUB_ALIASES: Record<string, string> = {
  "paris sg": "psg", "paris saint germain": "psg", psg: "psg",
  marseille: "om", lyon: "ol", monaco: "asm", lille: "losc",
  nice: "ogcn", lens: "rcl", rennes: "srfc", strasbourg: "rcsa",
  toulouse: "tfc", nantes: "fcn", brest: "sb29", "le havre": "hac",
  auxerre: "aja", angers: "sco", metz: "fcm", lorient: "fcl",
  "paris fc": "pfc",
  "real madrid": "rma", barcelona: "fcb", "ath madrid": "atm",
  "atletico madrid": "atm", "bayern munich": "bay", dortmund: "bvb",
  "borussia dortmund": "bvb", leverkusen: "b04", "bayer leverkusen": "b04",
  "man city": "mci", "manchester city": "mci", arsenal: "ars",
  liverpool: "liv", chelsea: "che", tottenham: "tot", newcastle: "new",
  inter: "int", "inter milan": "int", "ac milan": "acm", milan: "acm",
  juventus: "juv", napoli: "nap", atalanta: "ata", benfica: "ben",
  porto: "por", sporting: "spo", "sporting cp": "spo", ajax: "aja",
  psv: "psv", "psv eindhoven": "psv",
};

export interface ResolvedSide {
  key: string;
  name: string;
  badge: string;
  color: string;
}

/**
 * Associe un nom d'équipe fournisseur à une entrée du catalogue pour
 * hériter de sa vignette (drapeau / initiales + couleur). Une équipe
 * inconnue garde son nom fournisseur sans vignette — le match reste
 * jouable (rencontre hors catalogue, ex. petite nation en LDC).
 */
export function resolveProviderSide(
  competition: Competition,
  providerName: string,
): ResolvedSide {
  const normalized = normalizeTeamName(providerName);
  const aliases = competition.entries[0]?.color ? CLUB_ALIASES : NATION_ALIASES;
  const aliasKey = aliases[normalized];
  const entry =
    (aliasKey && getEntry(competition, aliasKey)) ||
    // Repli : nom du catalogue identique au nom fournisseur (« France »).
    competition.entries.find((e) => normalizeTeamName(e.name) === normalized);

  if (!entry) {
    return { key: "", name: providerName, badge: "", color: "" };
  }
  return {
    key: entry.key,
    name: entry.name,
    badge: entry.flag ?? entry.short ?? "",
    color: entry.color ?? "",
  };
}
