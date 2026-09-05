import "server-only";

import { moduleOuvertAuJoueur } from "@/lib/module-acces-public";

import { cookies } from "next/headers";
import { recordCounter } from "@/lib/monitoring";
import { sanitizePlayerAlias } from "@/lib/player-alias";
import {
  lookupLegacyIdentityHashes,
  peekPlayerDeviceTokenHash,
} from "@/lib/player-identity";
import { hashPlayerToken, publicCorrectAnswer } from "@/lib/pronostics";
import { asSeasonalTheme } from "@/lib/seasonal-theme";
import { createAdminClient } from "@/lib/supabase/admin";
import type {
  Contest,
  ContestMatch,
  ContestPlayer,
  ContestPrediction,
  Organization,
} from "@/types/database";

type PublicContestOrganization = Pick<
  Organization,
  | "id"
  | "name"
  | "logo_url"
  | "subscription_status"
  | "trial_ends_at"
  | "past_due_since"
  | "addon_pronostics"
  | "comp_access"
  | "comp_access_until"
  | "timezone"
>;

export type ContestContext =
  | { ok: false; error: string }
  | {
      ok: true;
      admin: ReturnType<typeof createAdminClient>;
      contest: Contest;
      organization: PublicContestOrganization;
      matches: ContestMatch[];
    };

interface ContestContextRow extends Contest {
  organizations: PublicContestOrganization | null;
  contest_matches: ContestMatch[];
}

/** Nom du cookie portant le jeton joueur d'un championnat. */
export function contestTokenCookieName(contestId: string): string {
  return `lc-prono-${contestId}`;
}

/**
 * Charge et valide la chaîne championnat → organisation → matchs pour le
 * parcours public /pronos. Client admin : la page est anonyme, rien
 * n'est accessible via l'anon key (RLS éditeurs uniquement).
 *
 * Un championnat `finished` reste consultable (classement final) ; seul
 * un brouillon ou un module coupé est masqué.
 */
export async function loadContestContext(slug: string): Promise<ContestContext> {
  const admin = createAdminClient();

  const { data } = await admin
    .from("contests")
    .select(
      // NB : deux FK relient contest_matches à contests (simple + composite
      // inter-tenant, 00023) — l'embed doit nommer la FK sinon PostgREST
      // répond 300 (PGRST201, relation ambiguë) et la page croit le
      // championnat inexistant.
      "id, organization_id, slug, name, competition_key, status, scoring, rewards, collect_email, collect_phone, tiebreaker_question, tiebreaker_answer, finalized_at, event_kind, default_locks_at, theme, fond_key, created_at, organizations(id, name, logo_url, subscription_status, trial_ends_at, past_due_since, addon_pronostics, comp_access, comp_access_until, timezone), contest_matches!contest_matches_contest_id_fkey(id, contest_id, organization_id, home_key, home_name, home_badge, home_color, away_key, away_name, away_badge, away_color, kickoff_at, status, home_score, away_score, finish_type, home_penalties, away_penalties, position, round, question_type, prompt, options, correct_answer, locks_at, ranking_size, created_at)",
    )
    .eq("slug", slug)
    .maybeSingle();

  const row = data as unknown as ContestContextRow | null;
  if (!row) return { ok: false, error: "Ce championnat n'existe pas." };

  const org = row.organizations;
  if (!org || org.id !== row.organization_id) {
    console.error("[pronostics-context] organisation incohérente", {
      contestId: row.id,
    });
    return { ok: false, error: "Championnat indisponible." };
  }

  // LA RESSOURCE EST PASSÉE, ET C'EST TOUT L'ENJEU DE SD-5. Le pass « Saison de
  // pronostics » est vendu pour UNE compétition : son octroi porte
  // `resource_id = contests.id` et n'ouvre pas le module entier. Sans ce
  // troisième argument, un commerçant qui vient de payer 39 € publiait son
  // championnat (la base l'y autorise, `org_has_module_access_for_resource`) et
  // son joueur tombait sur « momentanément désactivé ».
  //
  // Ce point de passage est le SEUL du parcours joueur pronostics : la page
  // publique, la page de récupération, le mode TV (`loadContestTvContext`) et
  // les onze actions publiques de `src/actions/pronostics.ts` passent tous par
  // `loadContestContext`. Une garde ici en couvre donc toutes les portes.
  if (!await moduleOuvertAuJoueur("pronostics", org, undefined, { resourceId: row.id })) {
    return { ok: false, error: "Ce championnat est momentanément désactivé." };
  }
  if (row.status === "draft") {
    return { ok: false, error: "Ce championnat n'est pas encore ouvert." };
  }

  const { organizations: _org, contest_matches, ...contest } = row;
  void _org;

  const matches = (contest_matches ?? [])
    // NON-FUITE : le résultat officiel d'une question ouverte ne quitte
    // jamais le serveur. Il n'est rendu qu'une fois la question résolue
    // (status finished), au même moment que les points.
    .map((match) => ({
      ...match,
      correct_answer: publicCorrectAnswer(match),
    }))
    .sort(
      (a, b) =>
        new Date(a.kickoff_at).getTime() - new Date(b.kickoff_at).getTime() ||
        a.position - b.position,
    );

  return {
    ok: true,
    admin,
    // Le thème est REFERMÉ sur la palette ici, comme le statut de récompense
    // plus bas : la colonne est un `text` borné par un CHECK que le générateur
    // élargit en `string`, et un thème inconnu ne correspondrait à aucune
    // entrée de la table des styles côté joueur. Repli silencieux sur
    // « neutre » — c'est un champ d'affichage, il ne doit jamais faire échouer
    // une page publique.
    contest: { ...contest, theme: asSeasonalTheme(contest.theme) },
    organization: org,
    matches,
  };
}

/** Réponse d'un joueur à une question, telle qu'elle sort de la base :
 *  score renseigné pour une question `score`, `null` des deux côtés pour
 *  une question générique dont la réponse vit dans `answer`. */
export type ContestPlayerPrediction = Pick<
  ContestPrediction,
  "home_score" | "away_score" | "answer" | "points"
>;

/** Ligne brute de contest_predictions, annotée explicitement : la
 *  nullabilité des scores doit survivre à la recopie ci-dessous, que le
 *  client Supabase porte ou non le générique `Database`. */
interface ContestPredictionRow extends ContestPlayerPrediction {
  match_id: string;
}

export interface ContestPlayerState {
  player: JoueurContest | null;
  /** Réponses du joueur indexées par match_id (question_id). */
  predictions: Record<string, ContestPlayerPrediction>;
}

/** Le joueur du championnat — jamais son porteur haché, jamais ses
 *  coordonnées : ni email ni téléphone ne sortent de ce chargeur. */
export type JoueurContest = Pick<ContestPlayer, "id" | "first_name" | "avatar">;

/**
 * L'ENTONNOIR DE LECTURE du pseudo joueur — appliqué à TOUTE ligne
 * `contest_players` qui remonte vers l'écran, et jamais dans les composants.
 *
 * ADR-169 a filtré les ÉCRITURES et le disait : « son pseudo enregistré reste
 * affiché ». Le classement `/pronos/<slug>` étant PUBLIC et sans
 * authentification, tout pseudo inscrit avant ce lot y restait rendu tel quel.
 * La migration 20261205120000 nettoie la base et ferme la porte ; cette
 * projection est la troisième couche — celle qui tient si une écriture future
 * repasse par un chemin admin sans repasser par Zod.
 *
 * Deux sites l'appellent, et ce sont les deux seuls d'où un `first_name` sort
 * de ce module : `resoudreIdentiteContest` (l'espace du joueur) et
 * `toLeaderboardEntry` (le classement public).
 */
function projeterJoueurContest(joueur: JoueurContest): JoueurContest {
  return { ...joueur, first_name: sanitizePlayerAlias(joueur.first_name) };
}

/** Le championnat dont l'identité a besoin : son identifiant et son tenant. */
type PorteeContest = Pick<Contest, "id" | "organization_id">;

/**
 * L'identité du joueur pour CE visiteur : l'empreinte de module retenue, et le
 * joueur qu'elle désigne s'il en existe un.
 *
 * UNION, ET NON UN OBJET PLAT — c'est la seule différence de forme avec
 * `IdentitePasseport`, et elle se paie ailleurs : dès qu'un joueur est tenu,
 * l'empreinte qui l'a trouvé l'est aussi. Les appelants la repassent au pont
 * d'identité, et un `tokenHash` que TypeScript croirait nullable les
 * obligerait tous à une assertion — c'est-à-dire à affirmer sans preuve
 * exactement ce que ce type peut prouver.
 */
export type IdentiteContest =
  | {
      /**
       * L'empreinte `contest_players.token_hash` retenue — celle du cookie du
       * module, ou celle rattrapée par l'identité globale.
       */
      tokenHash: string;
      joueur: JoueurContest;
      /** Un cookie de module est posé sur ce navigateur. */
      cookiePose: boolean;
    }
  | {
      /** `null` : ni cookie de module, ni empreinte historique connue. */
      tokenHash: string | null;
      joueur: null;
      cookiePose: boolean;
    };

/**
 * L'ORDRE DE RÉSOLUTION DU JOUEUR (ID-7) — le cookie du module d'abord,
 * l'identité globale ensuite.
 *
 * ── CE QUE ÇA RÉPARE ──
 *
 * Les pronostics ne connaissaient qu'un seul chemin : `lc-prono-<contestId>`.
 * Ce cookie effacé — nettoyage du navigateur, mode privé refermé, téléphone
 * changé de main — le joueur redevenait un inconnu devant sa grille : plus de
 * pronostics, plus de rang, plus de lot. Rien n'était pourtant perdu en base :
 * son appareil est connu de `players`, et l'empreinte de son ancien cookie est
 * conservée dans `player_legacy_identities` parce que le module pose le pont
 * `contest` à l'inscription et à chaque progression. Il ne manquait que
 * l'appel.
 *
 * ── L'ORDRE, ET POURQUOI IL EST DANS CE SENS ──
 *
 *  1. Le cookie du module, TOUJOURS EN PREMIER dès qu'il désigne un joueur.
 *     C'est le chemin qui porte les pronostics et celui que toute la production
 *     emprunte aujourd'hui : personne ne doit changer d'identité en silence le
 *     jour du déploiement.
 *  2. Absent, ou présent mais ne désignant AUCUN joueur : on retombe sur
 *     l'identité globale. `lookupLegacyIdentityHashes` rend les empreintes
 *     historiques de cet appareil sur CE championnat, de la plus récemment vue
 *     à la plus ancienne, et on retient la première qui tient réellement un
 *     joueur. C'est ce qui rattrape à la fois le cookie effacé et la rotation
 *     du cookie global.
 *  3. Un visiteur neuf ne trouve rien nulle part et repart sans joueur,
 *     exactement comme avant : c'est le formulaire d'inscription qui lui en
 *     ouvrira un, directement sur l'identité globale.
 *
 * ── C'EST UN ORDRE, PAS UN REMPLACEMENT ──
 *
 * ADR-041 : le double chemin existe pour pouvoir déployer, observer et revenir
 * en arrière « sans supprimer ni réinterpréter une progression existante ». Le
 * cookie de module n'est donc ni supprimé, ni cessé d'être écrit, ni relégué —
 * il reste lu en premier, et l'inscription continue de le poser. Ce lot AJOUTE
 * un second essai ; il n'en retire aucun.
 *
 * ── LE CLASSEMENT N'EST PAS TOUCHÉ ──
 *
 * `contest_leaderboard` joint par `contest_players.id` et n'entend jamais
 * parler de l'identité globale. Deux lignes de module restent deux lignes,
 * aucun score ne double et aucun palmarès n'est réécrit : les fondre buterait
 * sur le `unique (contest_id, rank)` de `contest_final_standings` et de
 * `contest_awards`. Ce chemin CHOISIT une ligne existante, il n'en fusionne
 * aucune.
 *
 * ── LE PIÈGE DU HACHAGE, QUI NE LÈVERAIT AUCUNE ERREUR ──
 *
 * `contest_players.token_hash` est une empreinte DE MODULE : un SHA-256 NU du
 * cookie du championnat (`hashPlayerToken`). L'empreinte de l'identité globale
 * est SALÉE ET VERSIONNÉE (`hashPlayerDeviceToken`, `player-device:v1`). Les
 * substituer ne lèverait rien du tout — les deux rendent 64 hexadécimaux et
 * passent la même expression régulière — et la requête ne trouverait
 * simplement plus personne, partout, sans une ligne de journal. C'est pourquoi
 * l'empreinte globale n'entre JAMAIS dans un filtre `contest_players` : elle
 * sert à demander au pont QUELLES empreintes de module appartiennent à cet
 * appareil, et ce sont ces empreintes-là, et elles seules, qui sont filtrées.
 *
 * ── LA PORTÉE N'EST PAS ÉLARGIE D'UN POUCE ──
 *
 * La RPC de reprise part de `player_devices.token_hash` et ne rend que les
 * empreintes d'une adhésion du MÊME joueur, sur la MÊME organisation et la MÊME
 * expérience — ici le championnat lui-même. Le `in (…)` conserve en plus le
 * filtre `contest_id`, exactement comme le chemin du cookie. Une empreinte
 * d'un autre championnat, ou d'un autre client, ne peut donc pas entrer.
 *
 * ── TOUTE PANNE REND L'ÉTAT D'AVANT ──
 *
 * Pas de cookie global, aucune empreinte historique, lecture en panne : on rend
 * ce que le chemin du cookie avait trouvé, c'est-à-dire rien. Ce repli ne peut
 * qu'AJOUTER un joueur, jamais en retirer un.
 */
export async function resoudreIdentiteContest(
  admin: ReturnType<typeof createAdminClient>,
  contest: PorteeContest,
): Promise<IdentiteContest> {
  const store = await cookies();
  const token = store.get(contestTokenCookieName(contest.id))?.value;
  const empreinteCookie = token ? hashPlayerToken(token) : null;

  if (empreinteCookie) {
    const { data } = await admin
      .from("contest_players")
      .select("id, first_name, avatar")
      .eq("contest_id", contest.id)
      .eq("token_hash", empreinteCookie)
      .maybeSingle();
    if (data) {
      return {
        tokenHash: empreinteCookie,
        joueur: projeterJoueurContest(data),
        cookiePose: true,
      };
    }
  }

  const vide: IdentiteContest = {
    tokenHash: empreinteCookie,
    joueur: null,
    cookiePose: empreinteCookie !== null,
  };

  // L'empreinte globale se LIT sans jamais poser de cookie : afficher une page
  // ne doit pas fabriquer d'identité (même règle que `/portefeuille`).
  const empreinteAppareil = await peekPlayerDeviceTokenHash();
  if (!empreinteAppareil) return vide;

  const anciennes = await lookupLegacyIdentityHashes({
    deviceTokenHash: empreinteAppareil,
    organizationId: contest.organization_id,
    experienceKind: "contest",
    experienceId: contest.id,
  });
  if (anciennes.length === 0) return vide;

  // UNE requête pour toutes les empreintes, jamais une par empreinte : ce repli
  // est rare, il ne doit pas coûter N allers-retours le jour où il sert.
  const { data, error } = await admin
    .from("contest_players")
    .select("id, first_name, avatar, token_hash")
    .eq("contest_id", contest.id)
    .in("token_hash", anciennes);
  if (error) return vide;

  const parEmpreinte = new Map<string, JoueurContest>();
  for (const ligne of data ?? []) {
    if (!ligne?.token_hash) continue;
    const { token_hash: _empreinte, ...joueur } = ligne;
    void _empreinte;
    parEmpreinte.set(ligne.token_hash, projeterJoueurContest(joueur));
  }

  // L'ORDRE DE LA RPC DÉCIDE, pas celui que la base a rendu : `anciennes` est
  // trié de la plus récemment vue à la plus ancienne. Un joueur qui a changé
  // deux fois de cookie retrouve donc sa grille la plus RÉCENTE, et non celle
  // que le planificateur a sortie en premier.
  for (const ancienne of anciennes) {
    const joueur = parEmpreinte.get(ancienne);
    if (!joueur) continue;
    // ZÉRO EST LA VALEUR ATTENDUE tant que personne n'a perdu son cookie ; une
    // population non nulle dit combien de joueurs auraient retrouvé une grille
    // vide sans ce chemin.
    recordCounter("pronostics.repli_identite_globale");
    return { tokenHash: ancienne, joueur, cookiePose: vide.cookiePose };
  }
  return vide;
}

/**
 * Pronostics déjà posés par le joueur courant. L'identité est résolue UNE fois
 * par `resoudreIdentiteContest` — aucune identité → état vide (formulaire
 * d'inscription affiché).
 */
export async function loadContestPlayerState(
  admin: ReturnType<typeof createAdminClient>,
  contest: PorteeContest,
): Promise<ContestPlayerState> {
  const { joueur: player } = await resoudreIdentiteContest(admin, contest);
  if (!player) return { player: null, predictions: {} };

  const { data: rows } = await admin
    .from("contest_predictions")
    .select("match_id, home_score, away_score, answer, points")
    .eq("contest_id", contest.id)
    .eq("player_id", player.id);

  const predictions: ContestPlayerState["predictions"] = {};
  for (const p of (rows ?? []) as ContestPredictionRow[]) {
    predictions[p.match_id] = {
      // `?? null` : une colonne absente de la sélection ou undefined ne
      // doit pas se faire passer pour un score.
      home_score: p.home_score ?? null,
      away_score: p.away_score ?? null,
      answer: p.answer,
      points: p.points ?? null,
    };
  }

  return { player, predictions };
}

export interface LeaderboardEntry {
  playerId: string;
  firstName: string;
  avatar: string;
  points: number;
  exactCount: number;
  diffCount: number;
  predictionCount: number;
  /** Rang calculé en SQL : ex æquo partagés en cours de saison
   *  (points > exacts > écarts > question subsidiaire), rangs uniques
   *  après clôture (palmarès figé, tirage compris). */
  rank: number;
}

export interface ContestLeaderboard {
  /** Page demandée, déjà triée et classée. */
  entries: LeaderboardEntry[];
  /** Inscrits classés au total (consentement accepté). */
  totalPlayers: number;
}

/** Ligne brute de la RPC contest_leaderboard / contest_player_rank. */
export interface ContestLeaderboardRow {
  player_id: string;
  first_name: string;
  avatar: string;
  email: string | null;
  total_points: number;
  exact_count: number;
  diff_count: number;
  prediction_count: number;
  rank: number;
  total_players: number;
}

function toLeaderboardEntry(row: ContestLeaderboardRow): LeaderboardEntry {
  return {
    playerId: row.player_id,
    firstName: sanitizePlayerAlias(row.first_name),
    avatar: row.avatar ?? "",
    points: Number(row.total_points),
    exactCount: Number(row.exact_count),
    diffCount: Number(row.diff_count),
    predictionCount: Number(row.prediction_count),
    rank: Number(row.rank),
  };
}

/**
 * Classement agrégé en base (RPC contest_leaderboard) : totaux, rangs
 * ex æquo et compteurs calculés par PostgreSQL. La page publique ne
 * charge que le top demandé — jamais tous les pronostics.
 *
 * `leagueId` restreint aux membres d'une ligue privée du championnat :
 * rangs re-numérotés 1..n et totalPlayers = effectif de la ligue (une
 * ligue d'un autre championnat renvoie un classement vide, pas d'oracle).
 */
export async function loadContestLeaderboard(
  admin: ReturnType<typeof createAdminClient>,
  contestId: string,
  limit = 50,
  offset = 0,
  leagueId: string | null = null,
): Promise<ContestLeaderboard> {
  const { data, error } = await admin.rpc("contest_leaderboard", {
    p_contest_id: contestId,
    p_limit: limit,
    p_offset: offset,
    p_league_id: leagueId,
  });
  if (error) {
    // Page publique : un classement vide vaut mieux qu'une erreur 500.
    console.error("[pronostics] classement:", error.message);
    return { entries: [], totalPlayers: 0 };
  }
  const rows = (data ?? []) as ContestLeaderboardRow[];
  return {
    entries: rows.map(toLeaderboardEntry),
    totalPlayers: Number(rows[0]?.total_players ?? 0),
  };
}

/**
 * Ligne de classement d'un joueur précis (rang global, ou rang dans une
 * ligue privée via `leagueId`) — la « position du joueur courant » quand
 * il est sous le top affiché publiquement.
 */
export async function loadContestPlayerRank(
  admin: ReturnType<typeof createAdminClient>,
  contestId: string,
  playerId: string,
  leagueId: string | null = null,
): Promise<LeaderboardEntry | null> {
  const { data, error } = await admin.rpc("contest_player_rank", {
    p_contest_id: contestId,
    p_player_id: playerId,
    p_league_id: leagueId,
  });
  if (error) {
    console.error("[pronostics] rang joueur:", error.message);
    return null;
  }
  const row = ((data ?? []) as ContestLeaderboardRow[])[0];
  return row ? toLeaderboardEntry(row) : null;
}

/** Miroir du CHECK de `contest_awards.status`. Voir `estStatutRecompense`. */
const STATUTS_RECOMPENSE = ["pending", "delivered", "cancelled"] as const;

function estStatutRecompense(
  valeur: unknown,
): valeur is (typeof STATUTS_RECOMPENSE)[number] {
  return (
    typeof valeur === "string" &&
    (STATUTS_RECOMPENSE as readonly string[]).includes(valeur)
  );
}

export interface PlayerAward {
  rewardLabel: string;
  code: string;
  status: (typeof STATUTS_RECOMPENSE)[number];
  rank: number;
  /**
   * Échéance du code de retrait (null : sans limite), figée à l'émission
   * depuis contests.code_ttl_seconds. Le joueur doit savoir jusqu'à quand
   * présenter son code — l'expiration fait foi côté RPC, pas ici.
   */
  redeemExpiresAt: string | null;
}

/**
 * Récompense du joueur courant après clôture (null : rien gagné, ou
 * championnat pas encore clôturé). Sert l'encart « votre lot » du
 * mini espace joueur.
 */
export async function loadPlayerAward(
  admin: ReturnType<typeof createAdminClient>,
  contestId: string,
  playerId: string,
): Promise<PlayerAward | null> {
  const { data, error } = await admin
    .from("contest_awards")
    .select("reward_label, code, status, rank, redeem_expires_at")
    .eq("contest_id", contestId)
    .eq("player_id", playerId)
    .maybeSingle();
  if (error) {
    console.error("[pronostics] récompense joueur:", error.message);
    return null;
  }
  if (!data || data.status === "cancelled") return null;
  // La colonne est un `text` borné par un CHECK, que le générateur élargit en
  // `string` : Postgres ne transporte pas ses contraintes dans le type. On
  // REFERME le vocabulaire par une garde plutôt que de l'affirmer par un cast —
  // une valeur hors vocabulaire signifierait que le CHECK a changé sans que ce
  // fichier le sache, et l'afficher telle quelle propagerait l'écart jusqu'à
  // l'écran du joueur.
  if (!estStatutRecompense(data.status)) {
    console.error(`[pronostics] statut de récompense inconnu : ${data.status}`);
    return null;
  }
  return {
    rewardLabel: data.reward_label,
    code: data.code,
    status: data.status,
    rank: Number(data.rank),
    redeemExpiresAt: data.redeem_expires_at ?? null,
  };
}

// ────────────────────────────────────────────────────────────
// Ligues privées (parcours joueur)
// ────────────────────────────────────────────────────────────

export interface PlayerLeague {
  id: string;
  name: string;
  /** Code d'invitation — réservé aux membres : ne sort de ce loader que
   *  pour le joueur dont on liste LES ligues. */
  code: string;
  /** Effectif de la ligue (membres inscrits, joueur compris). */
  memberCount: number;
}

/**
 * Ligues privées dont le joueur est membre (id, nom, code d'invitation,
 * effectif). Le code n'est montré qu'aux membres — un non-membre passe
 * par la saisie du code, jamais par une liste.
 */
export async function loadContestPlayerLeagues(
  admin: ReturnType<typeof createAdminClient>,
  contestId: string,
  playerId: string,
): Promise<PlayerLeague[]> {
  const { data, error } = await admin
    .from("contest_league_members")
    .select("league_id, contest_leagues!inner(id, contest_id, name, code)")
    .eq("player_id", playerId)
    .eq("contest_leagues.contest_id", contestId);
  if (error) {
    console.error("[pronostics] ligues joueur:", error.message);
    return [];
  }

  const rows = (data ?? []) as unknown as Array<{
    league_id: string;
    contest_leagues: { id: string; name: string; code: string } | null;
  }>;
  const leagues = rows.filter((r) => r.contest_leagues !== null);
  if (leagues.length === 0) return [];

  // Effectifs : une seule requête bornée (≤ 100 membres par ligue),
  // comptés côté serveur applicatif.
  const { data: members, error: membersError } = await admin
    .from("contest_league_members")
    .select("league_id")
    .in(
      "league_id",
      leagues.map((r) => r.league_id),
    );
  if (membersError) {
    console.error("[pronostics] effectif ligues:", membersError.message);
  }
  const counts = new Map<string, number>();
  for (const m of members ?? []) {
    counts.set(m.league_id, (counts.get(m.league_id) ?? 0) + 1);
  }

  return leagues
    .map((r) => ({
      id: r.contest_leagues!.id,
      name: r.contest_leagues!.name,
      code: r.contest_leagues!.code,
      memberCount: counts.get(r.league_id) ?? 1,
    }))
    .sort((a, b) => a.name.localeCompare(b.name, "fr"));
}

// ────────────────────────────────────────────────────────────
// Mode TV (affichage public en salle, lecture seule)
// ────────────────────────────────────────────────────────────

/** Taille du classement servi au mode TV (dans la fourchette 20-50). */
const TV_LEADERBOARD_SIZE = 30;

/** Ligne de classement du mode TV — aucune coordonnée personnelle. */
export interface ContestTvEntry {
  rank: number;
  firstName: string;
  avatar: string;
  points: number;
}

export type ContestTvContext =
  | { ok: false; error: string }
  | {
      ok: true;
      contest: {
        name: string;
        status: Contest["status"];
        finalizedAt: string | null;
      };
      organization: { name: string; logoUrl: string | null };
      /** Inscrits classés au total (au-delà du top affiché). */
      totalPlayers: number;
      /** Top du classement général, déjà trié par rang. */
      entries: ContestTvEntry[];
      /** Horodatage serveur de la photo (fraîcheur côté écran). */
      generatedAt: string;
    };

/**
 * Contexte lecture seule du mode TV : classement général top 30 SANS
 * cookie joueur ni donnée personnelle (prénom/avatar/points/rang
 * uniquement). Mêmes gardes de visibilité que la page publique
 * (brouillon masqué, module coupé masqué, championnat clôturé visible).
 */
export async function loadContestTvContext(
  slug: string,
): Promise<ContestTvContext> {
  const ctx = await loadContestContext(slug);
  if (!ctx.ok) return ctx;

  const board = await loadContestLeaderboard(
    ctx.admin,
    ctx.contest.id,
    TV_LEADERBOARD_SIZE,
  );

  return {
    ok: true,
    contest: {
      name: ctx.contest.name,
      status: ctx.contest.status,
      finalizedAt: ctx.contest.finalized_at,
    },
    organization: {
      name: ctx.organization.name,
      logoUrl: ctx.organization.logo_url,
    },
    totalPlayers: board.totalPlayers,
    entries: board.entries.map((e) => ({
      rank: e.rank,
      firstName: e.firstName,
      avatar: e.avatar,
      points: e.points,
    })),
    generatedAt: new Date().toISOString(),
  };
}
