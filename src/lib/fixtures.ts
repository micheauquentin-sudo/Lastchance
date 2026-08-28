import "server-only";

import { optionalEnv } from "@/lib/env";
import { getEntry, type Competition } from "@/lib/competitions";
import { toJson } from "@/lib/supabase/json";
import type { createAdminClient } from "@/lib/supabase/admin";

/**
 * Client du fournisseur de calendriers sportifs (TheSportsDB, v1 JSON).
 *
 * ── CE QUI A CHANGÉ, ET CE QUE ÇA CASSAIT (mesuré le 2026-08-27) ──
 *
 * Cet en-tête affirmait que le tier gratuit rendait « ~15 événements » par
 * endpoint. Ce n'est plus vrai, et ça ne l'est plus depuis assez longtemps
 * pour avoir été vu en production : relevé sur la Ligue 1 (ligue 4334),
 * `eventsnextleague.php` rend **UN SEUL** match, et `eventspastleague.php`
 * un seul aussi.
 *
 * Conséquence directe côté commerçant : il choisissait « Ligue 1 », lançait
 * la synchro, et récupérait UN match — celui du vendredi soir — alors que
 * les dix-huit clubs jouent dans le week-end. Sa grille de pronostics
 * n'avait qu'une ligne, et rien à l'écran ne disait pourquoi.
 *
 * ── LA FENÊTRE EST DÉSORMAIS UNE JOURNÉE, PAS UN COMPTE ──
 *
 * `eventsround.php?id=<ligue>&r=<journée>&s=<saison>` rend, lui, la JOURNÉE
 * ENTIÈRE — 9 matchs en Ligue 1, vérifié sur les journées 1 à 5. C'est la
 * bonne unité : un calendrier de championnat se lit par journée, et le
 * commerçant qui ouvre son jeu veut proposer une journée complète, pas les
 * N premiers matchs d'une fenêtre glissante.
 *
 * Les deux anciens endpoints restent appelés, mais leur rôle a changé : ils
 * ne sont plus la source des matchs, ils sont l'ANCRE qui dit à quelle
 * journée et à quelle saison on en est (`intRound`, `strSeason`). Un seul
 * événement suffit pour ça — c'est même tout ce qu'ils savent encore faire.
 *
 * ── DÉGRADATION VOLONTAIREMENT SILENCIEUSE ──
 *
 * Toutes les compétitions ne numérotent pas leurs tours de 1 à N : une coupe
 * mélange phases de groupes et tours à élimination directe. Une journée qui
 * ne rend rien n'est donc pas une erreur — on garde ce que les ancres ont
 * donné, et la compétition reste jouable. Aucune exception n'est levée pour
 * un tour vide.
 *
 * Une clé payante (THESPORTSDB_API_KEY) élargit tout cela sans changer le
 * code.
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
  /**
   * Journée de championnat. `null` quand le fournisseur ne numérote pas
   * ce tour — une coupe, typiquement. C'est une réponse, pas un trou : la
   * grille regroupe ces matchs à part plutôt que de leur inventer un
   * numéro.
   */
  round: number | null;
}

/** Forme brute d'un événement TheSportsDB (champs utilisés uniquement). */
export interface ProviderEvent {
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
  /** Journée de championnat ("2") — l'ancre de la fenêtre par tours. */
  intRound?: string | number | null;
  /** Saison au format du fournisseur ("2026-2027"). */
  strSeason?: string | null;
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
    round: parseRound(event.intRound),
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

/** Entier positif d'un champ fournisseur (`"2"`, `2`) — null sinon. */
export function parseRound(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  if (!Number.isFinite(n) || !Number.isInteger(n) || n < 1) return null;
  return n;
}

/**
 * Où en est la compétition, d'après les deux ancres.
 *
 * `null` quand le fournisseur ne numérote pas ses tours (ou ne renvoie rien) :
 * l'appelant se rabat alors sur les seuls événements des ancres, comme avant.
 */
export interface LeagueAnchor {
  season: string;
  /** Journée du prochain match connu. */
  nextRound: number;
  /** Journée du dernier match joué (= `nextRound` si inconnue). */
  lastRound: number;
}

export function readAnchor(
  upcoming: ProviderEvent[],
  past: ProviderEvent[],
): LeagueAnchor | null {
  const season =
    String(upcoming[0]?.strSeason ?? past[0]?.strSeason ?? "").trim();
  const nextRound = parseRound(upcoming[0]?.intRound);
  const lastRound = parseRound(past[0]?.intRound);
  if (!season) return null;
  // La journée À VENIR est celle qui compte : c'est elle qu'on veut servir
  // entière. À défaut (fin de saison, aucune ancre future), la dernière jouée
  // fait l'affaire — la synchro y cherchera des résultats.
  const pivot = nextRound ?? lastRound;
  if (pivot === null) return null;
  return { season, nextRound: pivot, lastRound: lastRound ?? pivot };
}

/**
 * Journées demandées au fournisseur autour de l'ancre.
 *
 * De la dernière journée JOUÉE (ses résultats sont encore à appliquer) à la
 * prochaine PLUS UNE : deux journées à pronostiquer, ce qui est l'ordre de
 * grandeur de l'ancienne fenêtre de quinze matchs — sauf qu'ici les journées
 * sont ENTIÈRES. Aller plus loin remplirait la grille du commerçant de matchs
 * qu'il n'a pas demandés ; c'est le rôle du calendrier complet, où il choisit
 * lui-même la journée qu'il importe.
 */
export const JOURNEES_APRES = 1;

export function roundWindow(anchor: LeagueAnchor): number[] {
  const debut = Math.min(anchor.lastRound, anchor.nextRound);
  const fin = anchor.nextRound + JOURNEES_APRES;
  const rounds: number[] = [];
  for (let r = debut; r <= fin; r += 1) rounds.push(r);
  return rounds;
}

/**
 * Les deux ancres d'une ligue, lues pour ELLES-MÊMES.
 *
 * `fetchLeagueFixtures` les lit déjà au passage ; cet accès séparé sert
 * l'écran de calendrier complet, qui a besoin de la SAISON (pour nommer une
 * journée au fournisseur) sans vouloir des matchs. Les deux appels traversent
 * le cache HTTP de `fetchEvents` : les demander deux fois de suite n'en coûte
 * qu'un.
 */
export async function fetchLeagueAnchor(
  leagueId: string,
): Promise<LeagueAnchor | null> {
  const [upcoming, past] = await Promise.all([
    fetchEvents(`eventsnextleague.php?id=${encodeURIComponent(leagueId)}`),
    fetchEvents(`eventspastleague.php?id=${encodeURIComponent(leagueId)}`),
  ]);
  return readAnchor(upcoming, past);
}

/**
 * Une JOURNÉE entière de championnat. Un tour inconnu du fournisseur (coupe
 * dont les tours ne sont pas numérotés, saison terminée) rend une liste vide
 * et n'est pas une erreur.
 */
export async function fetchLeagueRound(
  leagueId: string,
  season: string,
  round: number,
  now: Date = new Date(),
): Promise<ProviderFixture[]> {
  const events = await fetchEvents(
    `eventsround.php?id=${encodeURIComponent(leagueId)}` +
      `&r=${encodeURIComponent(String(round))}` +
      `&s=${encodeURIComponent(season)}`,
  );
  const fixtures: ProviderFixture[] = [];
  for (const event of events) {
    const fixture = parseProviderEvent(event, now);
    if (fixture) fixtures.push(fixture);
  }
  return fixtures;
}

/**
 * Calendrier d'une ligue : les deux ancres, puis les JOURNÉES qu'elles
 * désignent, le tout dédupliqué par idEvent.
 *
 * Les ancres restent dans le résultat même quand les journées répondent : sur
 * une compétition dont les tours ne sont pas numérotés, elles sont tout ce
 * qu'on aura, et les jeter reviendrait à casser ce qui marchait.
 *
 * Un tour en échec ne fait pas tomber l'ensemble — il manquerait une journée
 * là où, sans lui, il manquerait tout le calendrier.
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

  const anchor = readAnchor(upcoming, past);
  if (anchor) {
    const journees = await Promise.all(
      roundWindow(anchor).map((round) =>
        fetchLeagueRound(leagueId, anchor.season, round, now).catch((err) => {
          console.warn(
            `[fixtures] journée ${round} indisponible:`,
            err instanceof Error ? err.message : String(err),
          );
          return [] as ProviderFixture[];
        }),
      ),
    );
    for (const fixture of journees.flat()) byRef.set(fixture.ref, fixture);
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
      // Champ apparu après coup : une copie écrite avant son ajout reste
      // servable (`null`), pas de purge du cache au déploiement.
      round: typeof f.round === "number" ? f.round : null,
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
          payload: toJson(fixtures),
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
 * Initiales lisibles tirées d'un nom d'équipe — LE REPLI DES ÉQUIPES HORS
 * CATALOGUE.
 *
 * ── CE QUE ÇA RÉPARE ──
 *
 * Une équipe absente du catalogue rendait `badge: ""`, et l'écran peignait
 * alors un DRAPEAU BLANC (`{badge || "🏳️"}`). Vu en production sur Troyes
 * et Le Mans : deux clubs promus, donc absents d'un catalogue figé la
 * saison précédente. Le joueur lisait « Le Mans 🏳️ » — un signe de
 * reddition en face d'une équipe de football.
 *
 * Et ce n'est pas un oubli de catalogue à rattraper : une promotion, une
 * relégation ou une petite nation qualifiée en produiront un chaque année.
 * Le catalogue restera toujours en retard sur le fournisseur ; c'est le
 * REPLI qui doit être bon.
 *
 * ── LA RÈGLE ──
 *
 * Les initiales des mots significatifs, en majuscules, trois au plus :
 * « Le Mans » → « LM », « Troyes » → « TRO », « Paris Saint-Germain » →
 * « PSG ». Un mot unique donne ses trois premières lettres, ce qui reste
 * plus reconnaissable qu'une initiale seule.
 *
 * Les mots vides (`de`, `du`, `la`, `le`, `les`, `d'`) sont écartés — sauf
 * si le nom n'est QUE cela, cas où l'on préfère une initiale à rien.
 */
const MOTS_VIDES = new Set(["de", "du", "des", "la", "le", "les", "d", "l", "of", "the"]);

export function initialesEquipe(nom: string): string {
  const mots = normalizeTeamName(nom)
    .split(" ")
    .filter((m) => m.length > 0);
  const significatifs = mots.filter((m) => !MOTS_VIDES.has(m));
  const retenus = significatifs.length > 0 ? significatifs : mots;
  if (retenus.length === 0) return "";
  if (retenus.length === 1) return retenus[0].slice(0, 3).toUpperCase();
  return retenus
    .slice(0, 3)
    .map((m) => m[0])
    .join("")
    .toUpperCase();
}

/**
 * Couleur STABLE d'une équipe hors catalogue, dérivée de son nom.
 *
 * Une couleur tirée au hasard changerait à chaque rendu ; une couleur fixe
 * rendrait toutes les équipes inconnues identiques. Le hash du nom donne
 * une teinte stable et distincte, prise dans une palette dont le contraste
 * avec du texte blanc est tenu (S/L fixés, seule la teinte varie).
 */
export function couleurEquipe(nom: string): string {
  const normalise = normalizeTeamName(nom);
  let hash = 0;
  for (let i = 0; i < normalise.length; i += 1) {
    hash = (hash * 31 + normalise.charCodeAt(i)) % 360;
  }
  return `hsl(${hash} 45% 34%)`;
}

/**
 * Associe un nom d'équipe fournisseur à une entrée du catalogue pour
 * hériter de sa vignette (drapeau / initiales + couleur). Une équipe
 * INCONNUE ne reste plus sans vignette : elle reçoit ses initiales et une
 * couleur stable, ce qui la rend reconnaissable dans une grille sans
 * dépendre d'un catalogue toujours en retard d'une promotion.
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
    return {
      key: "",
      name: providerName,
      badge: initialesEquipe(providerName),
      color: couleurEquipe(providerName),
    };
  }
  return {
    key: entry.key,
    name: entry.name,
    badge: entry.flag ?? entry.short ?? "",
    color: entry.color ?? "",
  };
}
