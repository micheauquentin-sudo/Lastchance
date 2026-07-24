import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { signingSecret, verificationSecrets } from "@/lib/token-secrets";
import {
  isSkillGameType,
  RPS_MOVES,
  type EstimateConfig,
  type GaugeConfig,
  type MysteryWordConfig,
  type PuzzleConfig,
  type ReflexConfig,
  type RpsMove,
  type SkillAttempt,
  type SkillConfig,
  type SkillGameType,
} from "@/lib/validations/skill";

export type { RpsMove, SkillAttempt, SkillConfig, SkillGameType } from "@/lib/validations/skill";

// ════════════════════════════════════════════════════════════
// Moteur des DÉFIS *skill-gated* (jeux rapides · vague 2)
//
// Le DÉFI est une PORTE en amont du tirage : le SERVEUR évalue la réussite, puis
// perform_atomic_spin matérialise l'issue dans les DEUX cas (réussite → tirage
// pondéré normal ; échec → spin PERDANT forcé). Une seule tentative par personne
// (play_limit appliqué DANS la RPC, avant la branche : anti-brute-force).
//
// SÉPARATION PUR / SECRET :
//   • PUR (testable sans secret) : evaluateSkill, toPublicChallenge,
//     deriveRpsServerMove, rpsBeats, normalizeWord. Ces fonctions prennent la
//     config et le seed RÉSOLU en argument, sans I/O ni env.
//   • SECRET (HMAC domaine-séparé) : signSkillChallenge / verifySkillChallenge /
//     resolveSkillSeed / hashPlayerKey. Réutilisent le motif de lib/spin.ts.
//
// SECRETS SERVER-ONLY (invariant #4 de la migration) : mystery_word.word,
// estimate.target/tolerance, puzzle.order ne sortent JAMAIS au client — la vue
// publique (toPublicChallenge) n'expose que des indices (masque, longueur,
// image, fragments).
// ════════════════════════════════════════════════════════════

/** Issue d'une évaluation de défi (le seul verdict qui compte : réussi ou non). */
export interface SkillEvaluation {
  succeeded: boolean;
}

/**
 * Vue PUBLIQUE du défi servie au client — SANS aucun secret. Discriminée par
 * gameType. Ce type est le SEUL contrat de données que startSkillChallenge
 * renvoie : garant structurel de la non-fuite.
 */
export type SkillChallengePublic =
  | { gameType: "rps" }
  | { gameType: "reflex"; durationMs: number }
  | { gameType: "gauge"; tolerancePct: number }
  | { gameType: "puzzle"; fragments: string[] }
  | { gameType: "mystery_word"; length: number; hint: string | null }
  | { gameType: "estimate"; question: string | null; unit: string | null; imageUrl: string | null };

// ────────────────────────────────────────────────────────────
// Pierre-feuille-ciseaux : coup serveur DÉTERMINISTE, non calculable par le
// client. Le seed brut voyage dans le jeton (lisible), mais le coup dérive du
// seed RÉSOLU = HMAC(secret serveur, seed) — sans le secret, le client ne peut
// pas anticiper le coup. Égalité = ÉCHEC (choix documenté : le joueur doit
// STRICTEMENT battre le serveur, ce qui borne la réussite à ~1/3 des coups).
// ────────────────────────────────────────────────────────────

/** rock bat scissors, paper bat rock, scissors bat paper. */
const RPS_BEATS: Record<RpsMove, RpsMove> = {
  rock: "scissors",
  paper: "rock",
  scissors: "paper",
};

/** true si le coup joueur bat STRICTEMENT le coup serveur (égalité = false). */
export function rpsBeats(player: RpsMove, server: RpsMove): boolean {
  return RPS_BEATS[player] === server;
}

/** Coup serveur dérivé du seed RÉSOLU (base64url) : premier octet mod 3. */
export function deriveRpsServerMove(resolvedSeed: string): RpsMove {
  const buf = Buffer.from(resolvedSeed, "base64url");
  const byte = buf.length > 0 ? buf[0] : 0;
  return RPS_MOVES[byte % 3];
}

// ────────────────────────────────────────────────────────────
// Normalisation pour mystery_word : casse, espaces et accents ignorés.
// ────────────────────────────────────────────────────────────

export function normalizeWord(value: string): string {
  return value
    .normalize("NFD")
    // Retire les diacritiques (U+0300–U+036F) — « café » == « cafe ».
    .replace(/[̀-ͯ]/g, "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function arraysEqual(a: number[], b: number[]): boolean {
  return a.length === b.length && a.every((v, i) => v === b[i]);
}

// ────────────────────────────────────────────────────────────
// Évaluation PURE par jeu
// ────────────────────────────────────────────────────────────

/**
 * Évalue la réussite d'une tentative. PURE : aucune I/O, aucun env. `serverSeed`
 * est le seed RÉSOLU (HMAC serveur) — seul rps l'utilise. `config` est la config
 * VALIDÉE du game_type (les casts sont sûrs : la config a été parsée par
 * parseSkillConfig avant d'arriver ici).
 *
 * reflex / gauge : NON vérifiables serveur → succès rapporté par le client,
 * BORNÉ par l'économie (le tirage sur succès reste plafonné par les poids/stock ;
 * un bot qui « réussit » toujours ne dépasse pas les odds configurés, ADR-031).
 */
export function evaluateSkill(
  gameType: SkillGameType,
  attempt: SkillAttempt,
  config: SkillConfig,
  serverSeed: string,
): SkillEvaluation {
  // Garde-fou : la tentative doit concerner le jeu attendu.
  if (attempt.gameType !== gameType) return { succeeded: false };

  switch (gameType) {
    case "rps": {
      if (attempt.gameType !== "rps") return { succeeded: false };
      return { succeeded: rpsBeats(attempt.move, deriveRpsServerMove(serverSeed)) };
    }
    case "reflex":
    case "gauge": {
      // Client-reported (voir en-tête) — borné par l'économie du tirage.
      if (attempt.gameType !== "reflex" && attempt.gameType !== "gauge") {
        return { succeeded: false };
      }
      return { succeeded: attempt.succeeded === true };
    }
    case "puzzle": {
      if (attempt.gameType !== "puzzle") return { succeeded: false };
      const c = config as PuzzleConfig;
      return { succeeded: arraysEqual(attempt.order, c.order) };
    }
    case "mystery_word": {
      if (attempt.gameType !== "mystery_word") return { succeeded: false };
      const c = config as MysteryWordConfig;
      const target = normalizeWord(c.word);
      return { succeeded: target.length > 0 && normalizeWord(attempt.guess) === target };
    }
    case "estimate": {
      if (attempt.gameType !== "estimate") return { succeeded: false };
      const c = config as EstimateConfig;
      return { succeeded: Math.abs(attempt.value - c.target) <= c.tolerance };
    }
  }
}

// ────────────────────────────────────────────────────────────
// Vue publique : strippe TOUT secret. Aucun de nos jeux n'expose le seed
// publiquement (rps le garde côté serveur) — d'où l'absence de paramètre seed.
// ────────────────────────────────────────────────────────────

export function toPublicChallenge(
  gameType: SkillGameType,
  config: SkillConfig,
): SkillChallengePublic {
  switch (gameType) {
    case "rps":
      return { gameType: "rps" };
    case "reflex":
      return { gameType: "reflex", durationMs: (config as ReflexConfig).durationMs };
    case "gauge":
      return { gameType: "gauge", tolerancePct: (config as GaugeConfig).tolerancePct };
    case "puzzle":
      // Fragments exposés ; `order` (la solution) reste SECRET.
      return { gameType: "puzzle", fragments: [...(config as PuzzleConfig).fragments] };
    case "mystery_word": {
      const c = config as MysteryWordConfig;
      // Longueur (masque) + indice ; le mot lui-même reste SECRET.
      return { gameType: "mystery_word", length: c.word.trim().length, hint: c.hint };
    }
    case "estimate": {
      const c = config as EstimateConfig;
      // Habillage public ; target/tolerance restent SECRETS.
      return {
        gameType: "estimate",
        question: c.question,
        unit: c.unit,
        imageUrl: c.imageUrl,
      };
    }
  }
}

// ════════════════════════════════════════════════════════════
// Jeton de DÉFI signé HMAC (motif de lib/spin.ts). Émis par start, exigé par
// submit. Il lie l'identité device (hash), la chaîne de ressources, le game_type
// et le seed du coup rps. Il ne contient AUCUN secret lisible : le seed est un
// nonce public dont le coup rps ne se dérive qu'avec le secret serveur.
//
// SECRET RÉUTILISÉ : SKILL_CHALLENGE_TOKEN_SECRET, avec repli automatique sur
// SPIN_TOKEN_SECRET quand la clé dédiée n'est pas provisionnée (cf.
// lib/token-secrets.ts) — donc AUCUNE nouvelle variable d'environnement requise.
// ════════════════════════════════════════════════════════════

export interface SkillChallengePayload {
  /** Hash SHA-256 (domaine-séparé) de la clé device — jamais la clé elle-même. */
  playerKeyHash: string;
  organizationId: string;
  campaignId: string;
  wheelId: string;
  gameType: SkillGameType;
  /** Nonce public : dérive le coup rps via resolveSkillSeed (secret serveur). */
  seed: string;
  /** Nonce d'unicité du jeton. */
  nonce: string;
  /** Émission epoch ms. */
  iat: number;
  /** Expiration epoch ms. */
  exp: number;
}

/** Durée de vie du défi : le temps de jouer la mini-épreuve. */
export const SKILL_CHALLENGE_TTL_MS = 10 * 60 * 1000;

/** Tolérance d'horloge sur la borne SUPÉRIEURE de `exp` (cf. lib/spin.ts). */
const CLOCK_SKEW_TOLERANCE_MS = 5_000;

const SECRET_NAME = "SKILL_CHALLENGE_TOKEN_SECRET";

/** Séparation de domaine du message signé (cf. lib/spin.ts, loyalty-checkin.ts). */
const SIGNED_DOMAIN = "skill-challenge:";
/** Domaine de dérivation du coup rps (distinct de la signature du jeton). */
const RPS_SEED_DOMAIN = "skill-rps-seed:";
/** Domaine du hash d'identité device porté par le jeton. */
const PLAYER_HASH_DOMAIN = "skill-player:";

const TOKEN_HASH_PATTERN = /^[0-9a-f]{64}$/;
const SEED_PATTERN = /^[0-9a-f]{16,64}$/;

function hmac(data: string, secret: string): string {
  return createHmac("sha256", secret).update(data).digest("base64url");
}

function signedMessage(body: string): string {
  return `${SIGNED_DOMAIN}${body}`;
}

/**
 * Empreinte NON inversible de la clé device, portée par le jeton. Bind le défi à
 * un device précis sans jamais transporter la clé de jeu (celle du play_limit).
 */
export function hashPlayerKey(deviceKey: string): string {
  return createHash("sha256").update(`${PLAYER_HASH_DOMAIN}${deviceKey}`).digest("hex");
}

/**
 * Seed RÉSOLU du coup rps : HMAC(secret serveur, seed). Le client voit le seed
 * brut dans le jeton mais ne peut pas calculer cette valeur — donc pas le coup.
 */
export function resolveSkillSeed(seed: string): string {
  return hmac(`${RPS_SEED_DOMAIN}${seed}`, signingSecret(SECRET_NAME));
}

/** Nonce hexadécimal cryptographique (seed / nonce du jeton). */
export function generateSkillSeed(): string {
  return randomBytes(16).toString("hex");
}

export function signSkillChallenge(
  input: {
    playerKeyHash: string;
    organizationId: string;
    campaignId: string;
    wheelId: string;
    gameType: SkillGameType;
    seed: string;
    nonce: string;
  },
  now: Date = new Date(),
): string {
  const secret = signingSecret(SECRET_NAME);
  const payload: SkillChallengePayload = {
    ...input,
    iat: now.getTime(),
    exp: now.getTime() + SKILL_CHALLENGE_TTL_MS,
  };
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${body}.${hmac(signedMessage(body), secret)}`;
}

/**
 * Retourne le payload si la signature est valide ET le jeton non expiré, null
 * sinon. L'appelant DOIT encore vérifier que playerKeyHash == hash du cookie
 * courant et que la chaîne de ressources (org/campagne/roue/game_type) concorde.
 */
export function verifySkillChallenge(
  token: string,
  now: Date = new Date(),
): SkillChallengePayload | null {
  const dot = token.lastIndexOf(".");
  if (dot <= 0) return null;

  const body = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const sigBuf = Buffer.from(sig);
  const validSignature = verificationSecrets(SECRET_NAME).some((secret) => {
    const expected = Buffer.from(hmac(signedMessage(body), secret));
    return sigBuf.length === expected.length && timingSafeEqual(sigBuf, expected);
  });
  if (!validSignature) return null;

  try {
    const payload = JSON.parse(
      Buffer.from(body, "base64url").toString(),
    ) as SkillChallengePayload;
    if (
      typeof payload.playerKeyHash !== "string" ||
      !TOKEN_HASH_PATTERN.test(payload.playerKeyHash) ||
      typeof payload.organizationId !== "string" ||
      typeof payload.campaignId !== "string" ||
      typeof payload.wheelId !== "string" ||
      !isSkillGameType(payload.gameType) ||
      typeof payload.seed !== "string" ||
      !SEED_PATTERN.test(payload.seed) ||
      typeof payload.nonce !== "string" ||
      typeof payload.exp !== "number" ||
      payload.exp < now.getTime() ||
      // Borne SUPÉRIEURE : un jeton mal émis ne vit pas plus que sa TTL nominale
      // (à la dérive d'horloge près) — cf. lib/spin.ts.
      payload.exp - now.getTime() > SKILL_CHALLENGE_TTL_MS + CLOCK_SKEW_TOLERANCE_MS
    ) {
      return null;
    }
    return payload;
  } catch {
    return null;
  }
}

/**
 * Compare deux hash d'identité device à temps constant (longueurs égales garanties
 * par le pattern 64-hex, vérifié en amont côté appelant).
 */
export function playerKeyHashMatches(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}
