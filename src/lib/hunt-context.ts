import "server-only";

import { cookies } from "next/headers";
import { hashPlayerToken } from "@/lib/pronostics";
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

/** Nom du cookie httpOnly portant le jeton joueur d'une chasse. */
export function huntTokenCookieName(huntId: string): string {
  return `lc-hunt-${huntId}`;
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
