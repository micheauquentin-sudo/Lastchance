import "server-only";

import { cookies } from "next/headers";
import { hashPlayerToken } from "@/lib/pronostics";
import { RATE_LIMITS, rateLimit, rateLimitBucket } from "@/lib/rate-limit";
import { createAdminClient } from "@/lib/supabase/admin";
import { hasHuntsAccess } from "@/lib/subscription";
import type { Hunt, HuntStep, Organization } from "@/types/database";

type PublicHuntOrganization = Pick<
  Organization,
  | "id"
  | "name"
  | "logo_url"
  | "subscription_status"
  | "trial_ends_at"
  | "past_due_since"
  | "addon_hunts"
  | "comp_access"
  | "comp_access_until"
  | "timezone"
>;

const ORG_COLUMNS =
  "id, name, logo_url, subscription_status, trial_ends_at, past_due_since, addon_hunts, comp_access, comp_access_until, timezone";

/** Erreur générique unique : aucun oracle sur l'existence/l'état interne. */
const UNAVAILABLE = "Cette chasse au trésor n'est pas disponible.";

/**
 * Préfixe commun des cookies de chasse. Isolé pour que la garde à zéro requête
 * de `loadHuntRecallContext` et le nom construit ci-dessous ne puissent pas
 * diverger : deux littéraux séparés se seraient désynchronisés en silence, et
 * la garde aurait alors refusé des gagnants légitimes.
 */
const HUNT_COOKIE_PREFIX = "lc-hunt-";

/** Nom du cookie httpOnly portant le jeton joueur d'une chasse. */
export function huntTokenCookieName(huntId: string): string {
  return `${HUNT_COOKIE_PREFIX}${huntId}`;
}

interface HuntWithOrg {
  hunt: Hunt;
  organization: PublicHuntOrganization;
}

/**
 * Charge une chasse + son organisation via la service role et VÉRIFIE la
 * cohérence inter-tenant (la service role contourne la RLS : chaque
 * relation doit pointer le même tenant). null si introuvable/incohérent.
 */
async function fetchHuntWithOrg(
  admin: ReturnType<typeof createAdminClient>,
  huntId: string,
): Promise<HuntWithOrg | null> {
  const { data } = await admin
    .from("hunts")
    .select(`*, organizations(${ORG_COLUMNS})`)
    .eq("id", huntId)
    .maybeSingle();
  if (!data) return null;

  const row = data as unknown as Hunt & {
    organizations: PublicHuntOrganization | null;
  };
  const org = row.organizations;
  if (!org || org.id !== row.organization_id) {
    console.error("[hunt-context] organisation incohérente", { huntId });
    return null;
  }
  const { organizations: _org, ...hunt } = row;
  void _org;
  return { hunt, organization: org };
}

/** Étape publique résolue par son jeton d'URL (null si inconnu). */
async function fetchStepByToken(
  admin: ReturnType<typeof createAdminClient>,
  stepToken: string,
): Promise<HuntStep | null> {
  const { data } = await admin
    .from("hunt_steps")
    .select("id, hunt_id, organization_id, position, label, hint_text, token, created_at")
    .eq("token", stepToken)
    .maybeSingle();
  return (data as HuntStep | null) ?? null;
}

export interface HuntPlayerProgress {
  /** Un joueur (cookie) est-il déjà connu sur cette chasse ? */
  hasPlayer: boolean;
  total: number;
  done: number;
  /** Positions déjà tamponnées par le joueur courant, croissantes. */
  stamped: number[];
  /** Code de retrait si la chasse est déjà terminée (null sinon). */
  completedCode: string | null;
}

/**
 * Progression du joueur courant (cookie httpOnly) en LECTURE SEULE : rien
 * n'est écrit au rendu de la page (le tampon se fait au POST du bouton).
 * Aucun joueur/cookie → progression vide.
 */
export async function loadHuntPlayerProgress(
  admin: ReturnType<typeof createAdminClient>,
  huntId: string,
): Promise<HuntPlayerProgress> {
  const { data: stepRows } = await admin
    .from("hunt_steps")
    .select("id, position")
    .eq("hunt_id", huntId);
  const steps = (stepRows as Array<{ id: string; position: number }> | null) ?? [];
  const total = steps.length;
  const posById = new Map(steps.map((s) => [s.id, s.position]));

  const store = await cookies();
  const token = store.get(huntTokenCookieName(huntId))?.value;
  const empty: HuntPlayerProgress = {
    hasPlayer: false,
    total,
    done: 0,
    stamped: [],
    completedCode: null,
  };
  if (!token) return empty;

  const { data: player } = await admin
    .from("hunt_players")
    .select("id")
    .eq("hunt_id", huntId)
    .eq("token_hash", hashPlayerToken(token))
    .maybeSingle();
  if (!player) return empty;

  const [{ data: scanRows }, { data: completion }] = await Promise.all([
    admin.from("hunt_scans").select("step_id").eq("player_id", player.id),
    admin
      .from("hunt_completions")
      .select("code")
      .eq("hunt_id", huntId)
      .eq("player_id", player.id)
      .maybeSingle(),
  ]);

  const stamped = ((scanRows as Array<{ step_id: string }> | null) ?? [])
    .map((s) => posById.get(s.step_id))
    .filter((p): p is number => typeof p === "number")
    .sort((a, b) => a - b);

  return {
    hasPlayer: true,
    total,
    done: stamped.length,
    stamped,
    completedCode: (completion as { code: string } | null)?.code ?? null,
  };
}

export type HuntStepContext =
  | { ok: false; error: string }
  | {
      ok: true;
      admin: ReturnType<typeof createAdminClient>;
      hunt: Hunt;
      step: HuntStep;
      organization: PublicHuntOrganization;
      progress: HuntPlayerProgress;
    };

/**
 * Contexte public de la page /hunt/[token] : résout étape → chasse →
 * organisation (service role + gardes inter-tenant), vérifie addon +
 * abonnement + statut actif + fenêtre de dates, et charge la progression
 * du joueur courant en lecture seule. Réponse générique unique en cas
 * d'invalidité (404 côté page) — pas d'oracle sur le motif.
 */
export async function loadHuntStepContext(
  stepToken: string,
): Promise<HuntStepContext> {
  const admin = createAdminClient();

  const step = await fetchStepByToken(admin, stepToken);
  if (!step) return { ok: false, error: UNAVAILABLE };

  const resolved = await fetchHuntWithOrg(admin, step.hunt_id);
  if (!resolved || step.organization_id !== resolved.hunt.organization_id) {
    return { ok: false, error: UNAVAILABLE };
  }
  const { hunt, organization } = resolved;

  if (!hasHuntsAccess(organization)) return { ok: false, error: UNAVAILABLE };
  if (hunt.status !== "active") return { ok: false, error: UNAVAILABLE };

  const now = Date.now();
  if (
    (hunt.starts_at && new Date(hunt.starts_at).getTime() > now) ||
    (hunt.ends_at && new Date(hunt.ends_at).getTime() <= now)
  ) {
    return { ok: false, error: UNAVAILABLE };
  }

  const progress = await loadHuntPlayerProgress(admin, hunt.id);
  return { ok: true, admin, hunt, step, organization, progress };
}

export type HuntRecallContext =
  | { ok: false; error: string }
  | {
      ok: true;
      hunt: Hunt;
      step: HuntStep;
      organization: PublicHuntOrganization;
      progress: HuntPlayerProgress;
    };

/**
 * RESTITUTION du code déjà gagné, quand la page d'étape a fermé.
 *
 * ── LE DÉFAUT FERMÉ ─────────────────────────────────────────
 *
 * `loadHuntStepContext` refuse sur le statut ET sur la fenêtre de dates AVANT
 * de charger la progression, et la page rend `notFound()`. Or le code
 * `CHASSE-…` et son formulaire de rappel par e-mail n'existent QUE sur cette
 * page. Le joueur qui a terminé la chasse le dernier jour sans laisser son
 * e-mail — l'écran lui dit que le code reste affiché, et l'ADR-024 fonde le
 * caractère facultatif de l'e-mail là-dessus — perdait l'accès à son code dès
 * qu'`ends_at` passait ou que le commerçant archivait. Le lot, lui, restait
 * encaissable : `redeem_hunt_completion` (définition unique) ne teste ni le
 * statut ni la fenêtre. Un lot dû, un comptoir prêt à l'honorer, et plus aucun
 * moyen de relire le code.
 *
 * ── CE QUE CE CHARGEUR N'OUVRE PAS ──────────────────────────
 *
 * Il ne rouvre pas le JEU. `loadHuntStepContext` reste STRICT et INCHANGÉ :
 * c'est lui — et lui seul — que `stampHuntStep` appelle, donc aucun scan,
 * aucune progression, aucune complétion nouvelle ne devient possible hors
 * fenêtre. Ce chargeur ne rend d'ailleurs PAS le client admin : rien de ce
 * qu'il retourne ne permet d'écrire.
 *
 * Il exige une complétion DÉJÀ acquise par le cookie de l'appareil : sans
 * elle, il refuse exactement comme avant et la page reste en 404. La
 * permission d'entrer, c'est le gain lui-même.
 *
 * L'indulgence sur `hasHuntsAccess` est délibérée et alignée sur
 * `loadHuntClaimContext` : une chasse dont l'abonnement a expiré laisse
 * derrière elle des codes que la caisse honore toujours ; les refuser à
 * l'affichage ne les annulerait pas, ça les rendrait seulement illisibles.
 *
 * ── CE QUI BORNE CE CHARGEUR, ET DANS QUEL ORDRE ────────────
 *
 * Il s'ajoute au chargeur strict sur une page publique `force-dynamic`,
 * atteignable par quiconque photographie le QR d'une étape en boutique : sans
 * borne, chaque requête coûtait trois lectures `service_role`, y compris sur
 * une chasse archivée. Aucune donnée n'en sortait — c'est de l'amplification
 * pure — mais un travail non borné offert à Internet reste un travail offert.
 *
 * Les trois gardes sont ordonnées du moins cher au plus cher, et chacune ferme
 * un cas que la suivante ne verrait plus :
 *
 *  1. AUCUN cookie de chasse sur cet appareil → refus à ZÉRO requête. C'est le
 *     cas de l'amplification : le porteur du QR seul n'a jamais joué. Un
 *     gagnant, lui, porte forcément `lc-hunt-<id>` — c'est ce cookie qui lui a
 *     valu son code.
 *  2. Étape résolue, mais pas le cookie de CETTE chasse → refus à UNE requête.
 *     Il faut connaître l'identifiant interne de la chasse pour aller plus
 *     loin, ce que le jeton d'étape ne donne pas.
 *  3. Seau sur le HASH du cookie joueur — une clé propre à un porteur, jamais
 *     partagée : la saturer ne borne que lui. C'est la seule forme de refus
 *     admissible ici (ADR-032) ; un seau sur le jeton d'étape ou sur l'IP serait
 *     un interrupteur, la borne d'un attaquant fermant la carte de victoire de
 *     tous les joueurs d'un même lieu. Le plafond est calibré pour un geste
 *     humain — relire sa carte de victoire quelques fois — pas pour un débit.
 *
 * ── POURQUOI CE SEAU-CI EST `failClosed: false` ─────────────
 *
 * C'est le SEUL seau du dépôt sur clé d'identité qui ne soit pas fail-closed,
 * et l'exception se justifie par ce que ce chargeur est : le dernier endroit
 * où un gagnant peut relire un code `CHASSE-…` déjà acquis.
 *
 * `rateLimit` rend `false` quand `check_rate_limit` échoue et que le seau est
 * fail-closed (`rate-limit.ts`). Une panne de la table de compteurs fermait
 * donc cette page à des gagnants légitimes — et elle la fermait de travers :
 * pendant le MÊME incident, une chasse ENCORE ACTIVE continuait de répondre,
 * puisque `loadHuntStepContext` ne porte aucun seau. Une chasse close aurait
 * été moins accessible qu'une chasse ouverte, au moment précis où son seul
 * recours est cette page.
 *
 * Le calcul du fail-closed suppose qu'un rejeu non borné coûte quelque chose.
 * Ici il ne coûte rien qui puisse être exploité : ce chargeur n'écrit RIEN,
 * ne rend PAS le client admin, et exige une complétion déjà acquise par le
 * cookie de l'appareil. Le seul risque résiduel est l'amplification en
 * lecture, et elle est déjà bornée par les deux gardes de cookie au-dessus —
 * qui, elles, ne dépendent d'aucune table.
 *
 * En laissant passer un verdict INDÉTERMINÉ, on choisit de rendre son code à
 * un gagnant plutôt que de le lui refuser sur une panne d'infrastructure qui
 * ne le concerne pas. Ce raisonnement ne s'exporte PAS aux autres seaux
 * d'identité du dépôt (`huntScanPlayer`, `loyaltyStampMember`,
 * `cashier:lookup`…) : ceux-là gardent des ÉCRITURES, où un rejeu non borné
 * consomme du stock, tamponne un passeport ou remet un lot.
 */
export async function loadHuntRecallContext(
  stepToken: string,
): Promise<HuntRecallContext> {
  // Garde 1 — aucune requête. `getAll` plutôt que `get` : le nom du cookie
  // porte l'identifiant de la chasse, qu'on n'a pas encore résolu.
  const store = await cookies();
  const porteUnCookieDeChasse = store
    .getAll()
    .some((cookie) => cookie.name.startsWith(HUNT_COOKIE_PREFIX));
  if (!porteUnCookieDeChasse) return { ok: false, error: UNAVAILABLE };

  const admin = createAdminClient();

  const step = await fetchStepByToken(admin, stepToken);
  if (!step) return { ok: false, error: UNAVAILABLE };

  // Garde 2 — une requête. Le cookie doit être celui de la chasse à laquelle
  // ce jeton d'étape appartient, pas celui d'une chasse quelconque.
  const playerToken = store.get(huntTokenCookieName(step.hunt_id))?.value;
  if (!playerToken) return { ok: false, error: UNAVAILABLE };

  // Garde 3 — seau d'identité. Le refus reprend le refus générique du module :
  // il ne dit pas au demandeur qu'il vient d'être limité, ce qui serait déjà
  // un oracle sur l'existence de la chasse.
  //
  // `failClosed: false` : un verdict INDÉTERMINÉ (table de compteurs
  // injoignable) laisse passer. Voir l'en-tête de cette fonction — ce chargeur
  // est le dernier recours d'un gagnant, il n'écrit rien, et le fermer sur une
  // panne rendrait une chasse close moins accessible qu'une chasse ouverte.
  const autorise = await rateLimit(
    rateLimitBucket("hunt:recall", step.hunt_id, hashPlayerToken(playerToken)),
    RATE_LIMITS.huntRecall,
    { failClosed: false },
  );
  if (!autorise) return { ok: false, error: UNAVAILABLE };

  const resolved = await fetchHuntWithOrg(admin, step.hunt_id);
  if (!resolved || step.organization_id !== resolved.hunt.organization_id) {
    return { ok: false, error: UNAVAILABLE };
  }

  const progress = await loadHuntPlayerProgress(admin, resolved.hunt.id);
  // Aucune complétion sur cet appareil → même refus générique qu'avant. C'est
  // ce qui empêche cette porte d'être un oracle : sans le cookie du gagnant,
  // elle ne dit rien de plus que la 404 d'origine.
  if (!progress.completedCode) return { ok: false, error: UNAVAILABLE };

  return {
    ok: true,
    hunt: resolved.hunt,
    step,
    organization: resolved.organization,
    progress,
  };
}

export type HuntClaimContext =
  | { ok: false; error: string }
  | {
      ok: true;
      admin: ReturnType<typeof createAdminClient>;
      hunt: Hunt;
      organization: PublicHuntOrganization;
    };

/**
 * Résolution de la chasse pour le claim du code de retrait. Ciblée par
 * jeton d'étape OU identifiant de chasse. Volontairement indulgente sur
 * le statut/l'accès : le code a déjà été gagné (mêmes gardes inter-tenant
 * que le reste, mais on ne re-bloque pas une chasse clôturée après coup).
 */
export async function loadHuntClaimContext(input: {
  stepToken?: string;
  huntId?: string;
}): Promise<HuntClaimContext> {
  const admin = createAdminClient();

  let huntId = input.huntId ?? null;
  if (!huntId && input.stepToken) {
    const step = await fetchStepByToken(admin, input.stepToken);
    if (!step) return { ok: false, error: UNAVAILABLE };
    huntId = step.hunt_id;
  }
  if (!huntId) return { ok: false, error: UNAVAILABLE };

  const resolved = await fetchHuntWithOrg(admin, huntId);
  if (!resolved) return { ok: false, error: UNAVAILABLE };

  return { ok: true, admin, hunt: resolved.hunt, organization: resolved.organization };
}
