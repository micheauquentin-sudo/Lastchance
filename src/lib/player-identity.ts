import "server-only";

import { createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { z } from "zod";
import { requiredEnv } from "@/lib/env";
import { recordCounter, reportError } from "@/lib/monitoring";
import { createAdminClient } from "@/lib/supabase/admin";

export const PLAYER_COOKIE_NAME = "lc-player";
export const PLAYER_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;
export const PLAYER_DEVICE_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;
export const PLAYER_IDENTITY_HASH_PATTERN = /^[0-9a-f]{64}$/;

export const PLAYER_EXPERIENCE_KINDS = [
  "campaign",
  "hunt",
  "loyalty",
  "jackpot",
  "event",
  "calendar",
  "referral",
  "contest",
  "quiz",
] as const;

export type PlayerExperienceKind = (typeof PLAYER_EXPERIENCE_KINDS)[number];

export const PLAYER_ACQUISITION_SOURCES = [
  "direct",
  "qr",
  "share",
  "referral",
  "unknown",
] as const;

export type PlayerAcquisitionSource =
  (typeof PLAYER_ACQUISITION_SOURCES)[number];

const progressiveIdentitySchema = z.object({
  organizationId: z.uuid(),
  experienceKind: z.enum(PLAYER_EXPERIENCE_KINDS),
  experienceId: z.uuid(),
  legacyIdentityHash: z
    .string()
    .regex(PLAYER_IDENTITY_HASH_PATTERN)
    .optional(),
  acquisitionSource: z.enum(PLAYER_ACQUISITION_SOURCES).default("unknown"),
  acquisitionQrCodeId: z.uuid().optional(),
});

export interface ProgressivePlayerIdentityInput {
  organizationId: string;
  experienceKind: PlayerExperienceKind;
  experienceId: string;
  legacyIdentityHash?: string;
  acquisitionSource?: PlayerAcquisitionSource;
  acquisitionQrCodeId?: string;
}

export type ProgressivePlayerIdentityResult =
  | {
      ok: true;
      playerId: string;
      deviceId: string;
      experienceMembershipId: string;
    }
  | { ok: false; reason: "invalid_input" | "unavailable" };

interface ResolveIdentityRow {
  player_id: string;
  device_id: string;
  experience_membership_id: string;
  should_rotate: boolean;
}

interface RotateDeviceRow {
  player_id: string;
  device_id: string;
}

function isExpiredDeviceError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const candidate = error as { code?: unknown; message?: unknown };
  return (
    candidate.code === "22023" &&
    candidate.message === "expired player device token"
  );
}

/** Jeton opaque à forte entropie. Seul son hash salé quitte ce module. */
export function generatePlayerDeviceToken(): string {
  return randomBytes(32).toString("base64url");
}

/**
 * Hash domaine-séparé du cookie global. La base ne reçoit jamais la valeur
 * brute, et ce hash n'est pas interchangeable avec les hashes legacy.
 */
export function hashPlayerDeviceToken(token: string): string {
  return createHash("sha256")
    .update(`${requiredEnv("PLAYER_KEY_SALT")}:player-device:v1:${token}`)
    .digest("hex");
}

/**
 * Hash du device courant en LECTURE SEULE : ne pose JAMAIS le cookie et ne
 * touche jamais la base (miroir de `peekAnonymousPlayerKey`). Sert aux chemins
 * qui n'ont rien à créer — lire une progression, ouvrir un coffre : un visiteur
 * sans identité n'a par construction aucune progression à voir. `null` si le
 * cookie est absent, malformé, ou si le sel n'est pas configuré (la lecture ne
 * doit jamais faire tomber la page).
 */
export async function peekPlayerDeviceTokenHash(): Promise<string | null> {
  try {
    const store = await cookies();
    const token = store.get(PLAYER_COOKIE_NAME)?.value;
    if (!token || !PLAYER_DEVICE_TOKEN_PATTERN.test(token)) return null;
    return hashPlayerDeviceToken(token);
  } catch {
    return null;
  }
}

function setPlayerCookie(
  store: Awaited<ReturnType<typeof cookies>>,
  token: string,
): void {
  store.set(PLAYER_COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: PLAYER_COOKIE_MAX_AGE,
    priority: "high",
  });
}

/**
 * Pose seulement le cookie global, sans aller-retour base. Utile sur les
 * écrans qui préparent déjà l'ancien cookie avant l'action économique.
 */
export async function ensurePlayerDeviceCookie(): Promise<void> {
  const store = await cookies();
  const existing = store.get(PLAYER_COOKIE_NAME)?.value;
  if (existing && PLAYER_DEVICE_TOKEN_PATTERN.test(existing)) return;
  setPlayerCookie(store, generatePlayerDeviceToken());
}

function firstRow<T>(data: unknown): T | null {
  if (!Array.isArray(data) || data.length === 0) return null;
  return data[0] as T;
}

/**
 * Fenêtre d'étouffement de la trace de pont, par cause.
 *
 * Soixante secondes : assez court pour qu'une panne reste visible d'une
 * exécution du back-office à l'autre (l'objectif se lit sur 24 h), assez long
 * pour qu'un incident généralisé ne produise pas une ligne par requête joueur.
 */
const FENETRE_TRACE_MS = 60_000;

/**
 * Dernière trace émise par cause, `${reason}.${experienceKind}`.
 *
 * Cardinalité BORNÉE par construction : deux motifs × dix étiquettes de famille
 * (les neuf du vocabulaire fermé, plus `unvalidated`). Aucune saisie n'entre
 * dans cette clé — c'est la même propriété que celle du nom de compteur, et
 * elle est ce qui autorise à garder l'état en mémoire sans le borner à la main.
 */
const dernieresTraces = new Map<string, number>();

/**
 * Trace d'une panne de pont : une alerte et un compteur, ÉTOUFFÉS par fenêtre.
 *
 * ── POURQUOI L'ÉTOUFFEMENT ──
 *
 * `ensureProgressivePlayerIdentity` est appelée à chaque spin, chaque tampon et
 * chaque join des neuf modules — deux fois sur les quatre chemins de tour
 * offert. Sans borne, une cause GÉNÉRALE (sel `PLAYER_KEY_SALT` mal déployé,
 * `resolve_player_identity` en échec après une migration) faisait produire à
 * CHAQUE requête joueur un événement Sentry ET une ligne `ops_metrics` — car
 * `recordCounter` fait un `insert`, jamais un upsert.
 *
 * La mesure s'emballait donc au moment précis où l'infrastructure est déjà en
 * difficulté : elle ajoutait une écriture Postgres par requête à une base qui
 * vient de refuser une RPC, et brûlait le quota Sentry, ce qui rend aveugle sur
 * tout le reste — c'est-à-dire que l'observabilité se détruisait elle-même
 * exactement quand on en a besoin.
 *
 * ── CE QUE LE COMPTEUR SIGNIFIE MAINTENANT, ET IL FAUT LE SAVOIR ──
 *
 * Le nombre de lignes ne compte plus les ÉCHECS mais les FENÊTRES PORTEUSES
 * d'échec, par instance de serveur. On perd donc l'amplitude ; on garde ce sur
 * quoi l'objectif est écrit — **zéro ligne reste la valeur saine**, et une
 * population non nulle nomme toujours la famille dont les lots n'atteindront
 * pas `/portefeuille`. Une panne d'une heure rend au moins soixante lignes :
 * largement de quoi la voir, sans en rendre des centaines de milliers.
 *
 * ── POURQUOI CETTE TRACE EXISTE ──
 *
 * Cette fonction avalait TOUTE panne sans un mot : ni `reportError`, ni
 * compteur, ni journal. La population des ponts non posés était donc
 * SUPPOSÉE — « c'est best-effort, ça doit marcher » — et jamais mesurée.
 *
 * Ce silence a un coût déjà payé : un lot de roue gagné via un tour offert
 * n'apparaissait pas sur `/portefeuille` faute de pont `campaign`, et rien
 * dans ce dépôt n'aurait permis de le voir venir. C'est exactement la forme
 * de silence qu'ADR-048 impose de mesurer avant de conclure — un chemin muet
 * est un chemin dont on ne peut rien décider.
 *
 * ── CE QUE LA TRACE NE CHANGE PAS ──
 *
 * Le caractère NON BLOQUANT reste entier, et c'est délibéré : un pont qui
 * échoue ne doit jamais empêcher un joueur de jouer. On veut le SAVOIR, on ne
 * veut pas refuser. Aucun retour n'est modifié ; seule la trace est ajoutée.
 *
 * D'où le `try` qui entoure les deux appels : mesurer ne doit jamais casser ce
 * qu'on mesure, règle que `recordCounter` s'applique déjà à lui-même. Sans lui,
 * une observabilité indisponible ferait remonter une exception dans un chemin
 * dont toute la valeur est de ne jamais en lever — c'est-à-dire que l'ajout de
 * la mesure aurait retiré la garantie qu'elle sert à surveiller.
 *
 * ── CE QUI N'ENTRE JAMAIS DANS LA TRACE ──
 *
 * Ni `legacyIdentityHash`, ni le jeton d'appareil, ni son hash, ni aucun
 * identifiant de joueur. Le nom du compteur est composé de littéraux et de
 * `experienceKind`, SEULE donnée d'appelant admise et valeur d'énumération
 * fermée (neuf familles), jamais une saisie — c'est aussi la seule dimension
 * utile : elle dit QUELLE famille perd ses ponts. Le message d'erreur, lui,
 * vient de Postgres et ne porte aucun paramètre lié.
 */
function traceIdentityFailure(params: {
  scope: string;
  error: unknown;
  reason: "invalid_input" | "unavailable";
  experienceKind: string;
}): void {
  try {
    // L'étouffement est PAR CAUSE et non global : une panne de la famille
    // `campaign` ne doit pas masquer une seconde panne, d'une autre famille ou
    // d'un autre motif, qui commencerait pendant la même minute.
    const cause = `${params.reason}.${params.experienceKind}`;
    const maintenant = Date.now();
    const precedente = dernieresTraces.get(cause);
    if (precedente !== undefined && maintenant - precedente < FENETRE_TRACE_MS) {
      return;
    }
    dernieresTraces.set(cause, maintenant);

    reportError(params.scope, params.error);
    recordCounter(`player-identity.bridge-failed.${cause}`);
  } catch {
    // Observabilité indisponible : on perd la mesure, jamais le parcours.
  }
}

/**
 * Résout l'identité centrale puis lazy-link le hash du cookie historique.
 *
 * Cette couche est volontairement best-effort : la progression reste écrite
 * et relue via les tables/cookies legacy pendant la transition. Une panne du
 * nouveau pont ne doit donc jamais bloquer un spin, un tampon ou un join.
 *
 * Best-effort ne veut PAS dire muet : chaque sortie en échec est tracée (voir
 * `traceIdentityFailure`). Zéro ligne est la valeur saine ; une population non
 * nulle nomme la famille dont les lots n'atteindront pas `/portefeuille`.
 */
export async function ensureProgressivePlayerIdentity(
  input: ProgressivePlayerIdentityInput,
): Promise<ProgressivePlayerIdentityResult> {
  const parsed = progressiveIdentitySchema.safeParse(input);
  if (!parsed.success) {
    // Entrée refusée AVANT toute requête : c'est un défaut d'appelant, pas une
    // panne d'infrastructure. `input.experienceKind` n'a pas passé le schéma —
    // on ne l'étiquette donc pas, il pourrait être n'importe quoi.
    // On remonte le CHAMP fautif, jamais sa valeur ni le message de Zod : le
    // hash d'identité est l'un des champs validés ici, et un message qui
    // citerait la valeur reçue le déposerait dans Sentry.
    traceIdentityFailure({
      scope: "player-identity.bridge-input",
      error: `champ invalide : ${parsed.error.issues[0]?.path.join(".") ?? "inconnu"}`,
      reason: "invalid_input",
      experienceKind: "unvalidated",
    });
    return { ok: false, reason: "invalid_input" };
  }

  try {
    const store = await cookies();
    const cookieValue = store.get(PLAYER_COOKIE_NAME)?.value;
    const existingToken =
      cookieValue && PLAYER_DEVICE_TOKEN_PATTERN.test(cookieValue)
        ? cookieValue
        : null;
    let token = existingToken ?? generatePlayerDeviceToken();
    let deviceTokenHash = hashPlayerDeviceToken(token);
    let shouldPersistToken = !existingToken;
    const admin = createAdminClient();
    const identityArgs = {
      p_organization_id: parsed.data.organizationId,
      p_experience_kind: parsed.data.experienceKind,
      p_experience_id: parsed.data.experienceId,
      p_legacy_identity_hash: parsed.data.legacyIdentityHash ?? null,
      p_acquisition_source: parsed.data.acquisitionSource,
      p_acquisition_qr_code_id: parsed.data.acquisitionQrCodeId ?? null,
    };

    let { data, error } = await admin.rpc("resolve_player_identity", {
      p_device_token_hash: deviceTokenHash,
      ...identityArgs,
    });

    // Si une rotation DB a réussi mais que le Set-Cookie n'est jamais arrivé au
    // navigateur, l'ancien token finit par expirer. Le hash legacy permet alors
    // une reprise sûre vers un nouveau device, sans perdre la progression.
    if (
      existingToken &&
      parsed.data.legacyIdentityHash &&
      isExpiredDeviceError(error)
    ) {
      token = generatePlayerDeviceToken();
      deviceTokenHash = hashPlayerDeviceToken(token);
      shouldPersistToken = true;
      ({ data, error } = await admin.rpc("resolve_player_identity", {
        p_device_token_hash: deviceTokenHash,
        ...identityArgs,
      }));
    }

    const resolved = firstRow<ResolveIdentityRow>(data);
    if (error || !resolved?.player_id || !resolved.device_id) {
      // La RPC a refusé ou n'a rien rendu. `error.message` provient de Postgres
      // et ne porte AUCUN paramètre lié (voir la migration de la cadence des
      // workers : `log_parameter_max_length_on_error = 0`) : le hash d'identité
      // ne peut pas s'y trouver. On envoie donc le message tel quel, sans y
      // joindre l'entrée.
      traceIdentityFailure({
        scope: "player-identity.bridge",
        error: error?.message ?? "resolve_player_identity sans ligne",
        reason: "unavailable",
        experienceKind: parsed.data.experienceKind,
      });
      return { ok: false, reason: "unavailable" };
    }

    // Ne persiste le nouveau cookie qu'après résolution atomique en base.
    if (shouldPersistToken) setPlayerCookie(store, token);

    let deviceId = resolved.device_id;
    if (resolved.should_rotate) {
      const rotatedToken = generatePlayerDeviceToken();
      const { data: rotationData, error: rotationError } = await admin.rpc(
        "rotate_player_device",
        {
          p_old_token_hash: deviceTokenHash,
          p_new_token_hash: hashPlayerDeviceToken(rotatedToken),
        },
      );
      const rotation = firstRow<RotateDeviceRow>(rotationData);
      if (!rotationError && rotation?.player_id === resolved.player_id) {
        deviceId = rotation.device_id;
        setPlayerCookie(store, rotatedToken);
      }
    }

    return {
      ok: true,
      playerId: resolved.player_id,
      deviceId,
      experienceMembershipId: resolved.experience_membership_id,
    };
  } catch (err) {
    // Cookies illisibles, sel absent, client admin non configurable : la même
    // conclusion produit qu'au-dessus (pas de pont), mais une cause tout autre.
    // Les deux partagent le compteur `unavailable` — c'est la POPULATION qui
    // intéresse — et se distinguent dans Sentry par le scope.
    traceIdentityFailure({
      scope: "player-identity.bridge-exception",
      error: err,
      reason: "unavailable",
      experienceKind: parsed.data.experienceKind,
    });
    return { ok: false, reason: "unavailable" };
  }
}

/**
 * Pose le pont d'identité `campaign` d'un TOUR OFFERT (calendrier, fidélité,
 * quiz, parrainage), à partir du seul identifiant de spin.
 *
 * ── LE DÉFAUT FERMÉ ──
 *
 * Chaque module posait le pont de SA famille (`calendar`, `loyalty`, `quiz`,
 * `referral`) et jamais celui de `campaign`. Or le tour offert crée un spin sur
 * une VRAIE roue, et `claimPrize` en tire une `participations` : le miroir du
 * registre (`sync_reward_issuance`, 20260805150000:276) résout alors le joueur
 * par `reward_player_from_legacy(org, 'campaign', p.campaign_id, p.player_key)`.
 * Ce pont-là n'existait pour personne, `player_id` restait `null`, et le lot
 * n'apparaissait JAMAIS sur `/portefeuille` — page qui promet pourtant « les
 * lots gagnés depuis ce téléphone ». ADR-066.
 *
 * ── POURQUOI ON RELIT LE SPIN PLUTÔT QUE DE CROIRE L'APPELANT ──
 *
 * `campaign_id`, `organization_id` et `player_key` sont lus sur la ligne que la
 * RPC de consommation vient d'écrire. C'est la MÊME source que celle que le
 * miroir interrogera, donc le triplet ponté ne peut pas diverger de celui qui
 * sera cherché. Un appelant qui passerait son propre `campaign_id` rouvrirait
 * précisément l'écart qu'on ferme ici.
 *
 * ── `acquisitionSource: "unknown"`, ET C'EST UN CHOIX ──
 *
 * Le joueur n'a scanné aucun QR de cette campagne (`qr` serait faux), n'a suivi
 * aucun lien de partage (`share` aussi), et `referral` désigne le canal
 * d'acquisition et non « un autre module m'a offert un tour ». `direct` serait
 * COLLANT : `resolve_player_identity` ne remplace une source déjà posée que si
 * elle vaut `unknown` (20260805140000). En déclarant l'ignorance, on laisse un
 * futur scan de QR sur cette même campagne écrire la vérité.
 *
 * Non bloquant comme tout ce module : rien de ce que cette fonction rend n'est
 * lu, et son échec est déjà compté par `ensureProgressivePlayerIdentity`.
 */
export async function bridgeOfferedSpinToCampaign(
  admin: ReturnType<typeof createAdminClient>,
  spinId: string,
): Promise<void> {
  const { data, error } = await admin
    .from("spins")
    .select("organization_id, campaign_id, player_key")
    .eq("id", spinId)
    .maybeSingle();
  const spin = data as {
    organization_id: string | null;
    campaign_id: string | null;
    player_key: string | null;
  } | null;
  if (error || !spin?.organization_id || !spin.campaign_id || !spin.player_key) {
    // Étouffé par le MÊME mécanisme que les autres sorties en échec, et pour la
    // même raison : ce chemin est public et parcouru à chaque tour offert, donc
    // une cause générale (base qui refuse, spin effacé par une purge) y produit
    // une trace PAR REQUÊTE. La corriger à trois endroits sur quatre laissait
    // la seule branche non étouffée porter tout le débit d'une panne — c'est le
    // trou que la revue rouvrait au tour suivant.
    traceIdentityFailure({
      scope: "player-identity.offered-spin",
      error: error?.message ?? "spin de tour offert illisible",
      reason: "unavailable",
      // Le spin est illisible : sa famille est justement ce qu'on ne sait pas.
      // `offered-spin` plutôt qu'une famille inventée — l'étiquette reste dans
      // l'énumération fermée que la trace s'impose.
      experienceKind: "offered-spin",
    });
    return;
  }

  await ensureProgressivePlayerIdentity({
    organizationId: spin.organization_id,
    experienceKind: "campaign",
    experienceId: spin.campaign_id,
    legacyIdentityHash: spin.player_key,
    acquisitionSource: "unknown",
  });
}
