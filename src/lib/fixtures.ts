import "server-only";

import { optionalEnv } from "@/lib/env";
import { getEntry, type Competition } from "@/lib/competitions";
import type { createAdminClient } from "@/lib/supabase/admin";

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

/** Fin d'un match : temps réglementaire, prolongation, tirs au but. */
export type FixtureFinishType = "regular" | "extra_time" | "penalties";

/** Match normalisé côté fournisseur. */
export interface ProviderFixture {
  /** idEvent TheSportsDB — clé de déduplication (contest_matches.external_ref). */
  ref: string;
  homeName: string;
  awayName: string;
  /** Coup d'envoi ISO UTC. */
  kickoffAt: string;
  /** Score final, prolongations incluses (hors séance de tirs au but). */
  homeScore: number | null;
  awayScore: number | null;
  /** Résultat confirmé par le fournisseur (ou repli prudent sans statut). */
  finished: boolean;
  finishType: FixtureFinishType;
  /** Séance de tirs au but — null hors penalties. */
  homePenalties: number | null;
  awayPenalties: number | null;
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
  /** Séance de tirs au but quand strStatus = AP (nom trompeur côté API). */
  intHomeScoreExtra?: string | number | null;
  intAwayScoreExtra?: string | number | null;
  /** Ex. FT, AET, PEN, AOT, AP ou « Match Finished ». */
  strStatus?: string | null;
}

/** Statuts « après prolongation » (foot AET, rugby/US AOT). */
const EXTRA_TIME_STATUSES = new Set(["AET", "AOT", "AFTER EXTRA TIME", "AFTER OVERTIME"]);
/** Statuts « aux tirs au but » — vérifié en réel : la finale CDM 2022
 *  arrive en strStatus "AP" avec la séance dans intHome/AwayScoreExtra. */
const PENALTIES_STATUSES = new Set(["AP", "PEN", "AFTER PENALTIES"]);

function finishTypeFromStatus(status: string): FixtureFinishType {
  const normalized = status.trim().toUpperCase();
  if (PENALTIES_STATUSES.has(normalized)) return "penalties";
  if (EXTRA_TIME_STATUSES.has(normalized)) return "extra_time";
  return "regular";
}

/**
 * Statuts terminaux documentés par TheSportsDB pour les sports d'équipe
 * proposés par LastChance. Les scores existent aussi pendant un direct : leur
 * seule présence ne suffit donc jamais à déclarer le résultat définitif.
 */
const TERMINAL_PROVIDER_STATUSES = new Set([
  "FT",
  "AET",
  "PEN",
  "AOT",
  "AP",
  "AW",
  "AWD",
  "WO",
  "FINISHED",
  "MATCH FINISHED",
  "GAME FINISHED",
  "EVENT FINISHED",
  "AFTER EXTRA TIME",
  "AFTER OVERTIME",
  "AFTER PENALTIES",
]);

// Certains anciens événements n'ont aucun strStatus. Quatre heures après le
// coup d'envoi, deux scores complets constituent un repli suffisamment prudent
// pour le football et le rugby, sans figer un score pendant le direct.
const STATUSLESS_RESULT_GRACE_MS = 4 * 60 * 60 * 1_000;

function isTerminalProviderStatus(value: string): boolean {
  return TERMINAL_PROVIDER_STATUSES.has(value.trim().toUpperCase());
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
  const providerStatus = String(event.strStatus ?? "").trim();
  const hasCompleteScore = homeScore !== null && awayScore !== null;
  const finished =
    hasCompleteScore &&
    kickoff.getTime() <= now.getTime() &&
    (isTerminalProviderStatus(providerStatus) ||
      (!providerStatus &&
        kickoff.getTime() + STATUSLESS_RESULT_GRACE_MS <= now.getTime()));

  const finishType = finished ? finishTypeFromStatus(providerStatus) : "regular";
  // La séance de t.a.b. vit dans intHome/AwayScoreExtra (nom trompeur).
  const homePenalties =
    finishType === "penalties" ? parseScore(event.intHomeScoreExtra) : null;
  const awayPenalties =
    finishType === "penalties" ? parseScore(event.intAwayScoreExtra) : null;

  return {
    ref,
    homeName,
    awayName,
    kickoffAt: kickoff.toISOString(),
    homeScore,
    awayScore,
    finished,
    finishType,
    homePenalties,
    awayPenalties,
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
  const body = (await response.json()) as { events?: unknown };
  return Array.isArray(body.events) ? (body.events as ProviderEvent[]) : [];
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
// Cache partagé (table fixture_cache, service role)
// ────────────────────────────────────────────────────────────

/**
 * Fraîcheur du cache partagé. En deçà, aucune requête fournisseur :
 * tous les commerçants d'une même compétition se partagent la copie.
 */
const CACHE_TTL_SECONDS = 15 * 60;

/** Relit le payload jsonb du cache — null si la forme n'est pas fiable. */
export function parseCachedFixtures(payload: unknown): ProviderFixture[] | null {
  if (!Array.isArray(payload)) return null;
  const fixtures: ProviderFixture[] = [];
  for (const item of payload) {
    if (typeof item !== "object" || item === null) return null;
    const f = item as Record<string, unknown>;
    if (
      typeof f.ref !== "string" || f.ref === "" ||
      typeof f.homeName !== "string" || f.homeName === "" ||
      typeof f.awayName !== "string" || f.awayName === "" ||
      typeof f.kickoffAt !== "string" ||
      Number.isNaN(new Date(f.kickoffAt).getTime()) ||
      typeof f.finished !== "boolean" ||
      (f.homeScore !== null && typeof f.homeScore !== "number") ||
      (f.awayScore !== null && typeof f.awayScore !== "number")
    ) {
      return null;
    }
    // Champs apparus après coup : une copie écrite avant leur ajout reste
    // servable (valeurs par défaut), pas de purge du cache au déploiement.
    const finishType =
      f.finishType === "extra_time" || f.finishType === "penalties"
        ? f.finishType
        : "regular";
    fixtures.push({
      ref: f.ref,
      homeName: f.homeName,
      awayName: f.awayName,
      kickoffAt: f.kickoffAt,
      homeScore: f.homeScore as number | null,
      awayScore: f.awayScore as number | null,
      finished: f.finished,
      finishType,
      homePenalties:
        finishType === "penalties" && typeof f.homePenalties === "number"
          ? f.homePenalties
          : null,
      awayPenalties:
        finishType === "penalties" && typeof f.awayPenalties === "number"
          ? f.awayPenalties
          : null,
    });
  }
  return fixtures;
}

/**
 * Un rafraîchissement fournisseur en cours est considéré abandonné
 * au-delà de ce délai (processus mort) : le verrou redevient prenable.
 */
const REFRESH_CLAIM_TTL_SECONDS = 90;

/**
 * Calendrier d'une ligue via le cache partagé en base :
 *  1. copie fraîche (< 15 min) → zéro appel fournisseur ;
 *  2. copie périmée → verrou de rafraîchissement (claim_fixture_refresh) :
 *     UN seul processus appelle le fournisseur, les concurrents servent
 *     la copie en place sans attendre ;
 *  3. fournisseur en panne → repli sur la copie périmée si elle existe,
 *     et l'échec est tracé (provider_status/last_error) pour la supervision.
 *
 * Le tier gratuit (~30 req/min) ne voit ainsi passer, au pire, que
 * 2 appels par compétition et par quart d'heure — quel que soit le
 * nombre de commerçants, de championnats et de requêtes simultanées.
 */
export async function fetchLeagueFixturesCached(
  admin: ReturnType<typeof createAdminClient>,
  leagueId: string,
  now: Date = new Date(),
): Promise<ProviderFixture[]> {
  const { data: row } = await admin
    .from("fixture_cache")
    .select("payload, fetched_at")
    .eq("league_id", leagueId)
    .maybeSingle();

  const cached = row ? parseCachedFixtures(row.payload) : null;
  const freshUntil = row
    ? new Date(row.fetched_at).getTime() + CACHE_TTL_SECONDS * 1000
    : 0;

  if (cached && freshUntil > now.getTime()) {
    return cached;
  }

  // Copie périmée (ou absente) : seul le détenteur du verrou interroge
  // le fournisseur. Les autres repartent avec la copie existante —
  // périmée de quelques minutes au pire, rafraîchie au prochain passage.
  const { data: claimed, error: claimError } = await admin.rpc(
    "claim_fixture_refresh",
    { p_league_id: leagueId, p_ttl_seconds: REFRESH_CLAIM_TTL_SECONDS },
  );
  if (claimError) {
    console.warn("[fixtures] verrou de rafraîchissement:", claimError.message);
  }
  const isRefresher = claimed === true;
  if (!isRefresher && cached) {
    return cached;
  }
  // Verrou refusé ET aucune copie servable (premier passage d'une ligue,
  // course rarissime) : on interroge le fournisseur sans écrire le cache.

  try {
    const fixtures = await fetchLeagueFixtures(leagueId, now);
    if (isRefresher) {
      // L'écriture du payload relâche le verrou et trace le succès.
      const { error } = await admin.from("fixture_cache").upsert(
        {
          league_id: leagueId,
          payload: fixtures,
          fetched_at: now.toISOString(),
          refresh_claimed_at: null,
          provider_status: "ok",
          last_error: null,
        },
        { onConflict: "league_id" },
      );
      if (error) console.warn("[fixtures] écriture cache:", error.message);
    }
    return fixtures;
  } catch (err) {
    if (isRefresher) {
      // Relâche le verrou et trace l'échec — l'âge du cache + ce statut
      // alimentent la supervision (docs/observability.md).
      const { error } = await admin
        .from("fixture_cache")
        .update({
          refresh_claimed_at: null,
          provider_status: "error",
          last_error: err instanceof Error ? err.message : String(err),
        })
        .eq("league_id", leagueId);
      if (error) console.warn("[fixtures] trace échec cache:", error.message);
    }
    // Fournisseur indisponible : une copie périmée vaut mieux qu'une
    // erreur — la prochaine synchro rafraîchira.
    if (cached) {
      console.warn("[fixtures] fournisseur indisponible, cache périmé servi");
      return cached;
    }
    throw err;
  }
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
