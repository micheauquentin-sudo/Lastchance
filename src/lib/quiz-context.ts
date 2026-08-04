import "server-only";

import { cookies } from "next/headers";
import { hashPlayerToken } from "@/lib/pronostics";
import {
  mapQuizPublicState,
  QUIZ_REWARD_MODES,
  type QuizPublicState,
  type QuizRewardMode,
} from "@/lib/quiz";
import { droitEffectifModule, type ChampsModule } from "@/lib/subscription";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Organization } from "@/types/database";

/** Erreur générique unique : aucun oracle sur l'existence/l'état interne. */
const UNAVAILABLE = "Ce quiz n'est pas disponible.";

/** UUID canonique (pour distinguer un id d'un public_slug à la résolution). */
const UUID_PATTERN =
  /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

/** Nom du cookie httpOnly portant le jeton joueur d'un QUIZ. */
export function quizTokenCookieName(quizId: string): string {
  return `lc-quiz-${quizId}`;
}

type PublicQuizOrganization = Pick<
  Organization,
  | "id"
  | "name"
  | "logo_url"
  | "subscription_status"
  | "trial_ends_at"
  | "past_due_since"
  | "addon_quiz"
  | "comp_access"
  | "comp_access_until"
  | "timezone"
>;

const ORG_COLUMNS =
  "id, name, logo_url, subscription_status, trial_ends_at, past_due_since, addon_quiz, comp_access, comp_access_until, timezone";

// `reward_mode` fait partie de la MÊME requête (aucune lecture supplémentaire sur
// un chemin public) : il décide du challenge anti-robot de la clôture, et il est
// déjà public de toute façon (`quiz_public_state` le sert à la page).
const QUIZ_COLUMNS = "id, organization_id, status, public_slug, reward_mode";

/**
 * Le module Créateur de quiz est-il utilisable par cette organisation ?
 *
 * FAÇADE, plus une règle. Elle ne fait que déléguer à `droitEffectifModule`,
 * miroir unique de `org_has_module_access`.
 *
 * ── POURQUOI CETTE FONCTION A CESSÉ DE PORTER SA PROPRE RÈGLE ──
 *
 * Elle était définie ici plutôt que dans `subscription.ts` pour une raison de
 * RÉPARTITION DU TRAVAIL — « le fichier subscription.ts relève de l'agent
 * stripe-billing » — et non pour une raison technique. Ce motif a coûté ce
 * qu'il devait coûter : quand le lot 2 (migration 20260907120000) a ajouté la
 * branche « octroi daté vivant » aux six fonctions de `subscription.ts`,
 * celle-ci et `hasReferralAccess` ne l'ont pas reçue. Un commerçant ayant
 * acheté le seul Quiz obtenait de la base le droit de publier, et de cet
 * écran un refus.
 *
 * Une frontière d'agent n'est pas une frontière de domaine : le droit d'un
 * module est une seule question, elle doit avoir un seul lieu de réponse.
 */
export function hasQuizAccess(
  org: ChampsModule<"quiz">,
  now = new Date(),
): boolean {
  return droitEffectifModule("quiz", org, now);
}

interface QuizRow {
  id: string;
  organization_id: string;
  status: string;
  public_slug: string;
  reward_mode: string;
  organizations: PublicQuizOrganization | null;
}

export type QuizPublicContext =
  | { ok: false; error: string }
  | {
      ok: true;
      quizId: string;
      publicSlug: string;
      organization: PublicQuizOrganization;
      /** État public complet (déjà filtré : aucune vérité non due au joueur). */
      publicState: QuizPublicState;
      /** Le visiteur a-t-il déjà une identité de joueur sur ce quiz ? */
      hasIdentity: boolean;
    };

/**
 * Résout un quiz par son UUID ou son public_slug (service role + garde
 * inter-tenant), vérifie le module + l'abonnement + le statut actif, puis charge
 * l'état public via quiz_public_state. Identité cookie PAR QUIZ en LECTURE SEULE :
 * rien n'est posé ici (le cookie est écrit par les actions join/start) ; s'il
 * existe, son hash alimente la vue « moi » (questions répondues, score, lot) sans
 * jamais quitter le serveur. Réponse générique unique en cas d'invalidité
 * (404 côté page) — pas d'oracle. Miroir de loadCalendarPublicContext.
 */
export async function loadQuizPublicContext(
  slugOrId: string,
): Promise<QuizPublicContext> {
  const admin = createAdminClient();

  const query = admin
    .from("quizzes")
    .select(`${QUIZ_COLUMNS}, organizations(${ORG_COLUMNS})`);
  const { data } = UUID_PATTERN.test(slugOrId)
    ? await query.eq("id", slugOrId).maybeSingle()
    : await query.eq("public_slug", slugOrId.toLowerCase()).maybeSingle();
  if (!data) return { ok: false, error: UNAVAILABLE };

  const row = data as unknown as QuizRow;
  const org = row.organizations;
  // La service role contourne la RLS : chaque relation doit pointer le même
  // tenant, sinon on refuse (incohérence = 404 générique).
  if (!org || org.id !== row.organization_id) {
    console.error("[quiz-context] organisation incohérente", { slugOrId });
    return { ok: false, error: UNAVAILABLE };
  }
  if (!hasQuizAccess(org)) return { ok: false, error: UNAVAILABLE };
  if (row.status !== "active") return { ok: false, error: UNAVAILABLE };

  // Identité cookie PAR QUIZ, lecture seule (ni le jeton ni son hash ne quittent
  // le serveur).
  const store = await cookies();
  const token = store.get(quizTokenCookieName(row.id))?.value;
  const tokenHash = token ? hashPlayerToken(token) : undefined;

  const { data: stateRaw, error } = await admin.rpc("quiz_public_state", {
    p_quiz_id: row.id,
    p_player_token_hash: tokenHash,
  });
  if (error) {
    console.error("[quiz-context] public state", error.message);
    return { ok: false, error: UNAVAILABLE };
  }

  // ASYMÉTRIE DE REPLI DU `reward_mode` (1/2 — face LECTURE).
  // `mapQuizPublicState` fait retomber un mode inconnu sur `none`
  // (`asRewardMode`, src/lib/quiz.ts), là où `loadQuizActionContext` plus bas
  // le fait retomber sur `threshold`. Divergence VOULUE, et les deux valeurs
  // ne se rencontrent jamais : cette face-ci ne fait qu'AFFICHER, elle
  // n'autorise rien. Un mode inconnu rendu `threshold` promettrait au joueur
  // un lot que la RPC n'émettra peut-être pas — on préfère ne rien promettre.
  const publicState = mapQuizPublicState(stateRaw);
  if (publicState.state !== "ok") return { ok: false, error: UNAVAILABLE };

  return {
    ok: true,
    quizId: row.id,
    publicSlug: row.public_slug,
    organization: org,
    publicState,
    hasIdentity: Boolean(token),
  };
}

export type QuizActionContext =
  | { ok: false }
  | {
      ok: true;
      admin: ReturnType<typeof createAdminClient>;
      quizId: string;
      organizationId: string;
      /**
       * Mode de récompense courant. `none` = quiz purement ludique : la clôture
       * n'émet RIEN et n'oppose donc aucun challenge anti-robot (aucune friction
       * là où il n'y a rien à gagner).
       */
      rewardMode: QuizRewardMode;
    };

/**
 * Contexte MINIMAL d'une action publique (start / submit / finish / consume /
 * getState) : quiz résolu par son UUID, module + abonnement + statut vérifiés côté
 * service role, rien de plus. Une seule requête (quiz + organisation) précède
 * l'appel RPC — pas d'amplification de lecture sur un chemin ouvert à Internet
 * (miroir loadCalendarActionContext). Module coupé, quiz inexistant, non actif →
 * échec générique sans oracle.
 */
export async function loadQuizActionContext(
  quizId: string,
): Promise<QuizActionContext> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("quizzes")
    .select(`${QUIZ_COLUMNS}, organizations(${ORG_COLUMNS})`)
    .eq("id", quizId)
    .maybeSingle();
  if (!data) return { ok: false };

  const row = data as unknown as QuizRow;
  const org = row.organizations;
  if (!org || org.id !== row.organization_id) return { ok: false };
  if (!hasQuizAccess(org)) return { ok: false };
  if (row.status !== "active") return { ok: false };

  // ASYMÉTRIE DE REPLI DU `reward_mode` (2/2 — face ÉCRITURE).
  // Valeur inconnue (colonne élargie un jour) → le mode le PLUS exigeant, jamais
  // `none` : on ne relâche pas une garde par défaut. Le chemin public de LECTURE
  // retombe, lui, sur `none` (voir `mapQuizPublicState` plus haut) : les deux
  // replis divergent en VALEUR mais convergent en SENS — côté écriture on ne
  // relâche jamais une garde, côté lecture on ne promet jamais un lot. Ici la
  // valeur décide du challenge anti-robot de la clôture : `none` par défaut
  // ouvrirait l'émission de lots à une boucle depuis une seule IP.
  // La divergence n'est SANS DANGER que parce que les deux valeurs restent
  // cloisonnées. Faire décider une action par le `rewardMode` de l'état public
  // (ou l'inverse) rouvrirait exactement ce trou — c'est le seul changement à
  // interdire ici. Les deux replis sont verrouillés par des tests — celui-ci
  // dans quiz-context.test.ts, celui de la lecture dans quiz.test.ts (« thème
  // et mode inconnus retombent sur des valeurs sûres », qui couvre le helper
  // `asRewardMode` partagé) : « harmoniser » l'un sur l'autre fait rougir,
  // ce n'est pas une affaire de préférence.
  const rewardMode: QuizRewardMode = QUIZ_REWARD_MODES.includes(
    row.reward_mode as QuizRewardMode,
  )
    ? (row.reward_mode as QuizRewardMode)
    : "threshold";

  return {
    ok: true,
    admin,
    quizId: row.id,
    organizationId: row.organization_id,
    rewardMode,
  };
}
