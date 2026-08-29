import "server-only";

import { moduleOuvertAuJoueur } from "@/lib/module-acces-public";

import { cookies, headers } from "next/headers";
import { loyaltyTierForVisits } from "@/lib/loyalty";
import { hashPlayerToken } from "@/lib/pronostics";
import { RATE_LIMITS } from "@/lib/rate-limit";
import { clientIpFromHeaders, observerPressionIp } from "@/lib/request-ip";
import { createAdminClient } from "@/lib/supabase/admin";
import { loyaltyOrderTokenSchema } from "@/lib/validations/loyalty";
import type {
  LoyaltyMilestone,
  LoyaltyProgram,
  LoyaltyRewardType,
  LoyaltyTier,
  Organization,
} from "@/types/database";

type PublicLoyaltyOrganization = Pick<
  Organization,
  | "id"
  | "name"
  | "logo_url"
  | "subscription_status"
  | "trial_ends_at"
  | "past_due_since"
  | "addon_loyalty"
  | "addon_jackpot"
  | "comp_access"
  | "comp_access_until"
  | "timezone"
>;

/** Programme sans le secret du code tournant (jamais exposé au client). */
export type PublicLoyaltyProgram = Omit<LoyaltyProgram, "rotating_secret">;

const ORG_COLUMNS =
  "id, name, logo_url, subscription_status, trial_ends_at, past_due_since, addon_loyalty, addon_jackpot, comp_access, comp_access_until, timezone";

/** Colonnes publiques du programme — rotating_secret volontairement exclu. */
const PROGRAM_COLUMNS =
  "id, organization_id, jackpot_campaign_id, name, status, validation_mode, rotating_period_seconds, min_stamp_interval_seconds, silver_threshold, gold_threshold, created_at";

/** Erreur générique unique : aucun oracle sur l'existence/l'état interne. */
const UNAVAILABLE = "Ce passeport de fidélité n'est pas disponible.";

/** Nom du cookie httpOnly portant le jeton joueur d'un programme. */
export function loyaltyTokenCookieName(programId: string): string {
  return `lc-loyalty-${programId}`;
}

/** Palier tel que présenté au joueur (config, sans compteurs internes). */
export interface LoyaltyMilestoneView {
  id: string;
  visitCount: number;
  rewardType: LoyaltyRewardType;
  rewardLabel: string;
  rewardDetails: string | null;
  targetWheelId: string | null;
  /**
   * Palier dont le stock est épuisé : plus aucun code (lot) NI aucun tour
   * offert (spin) ne sera émis. Depuis 20260725200000 le stock est obligatoire
   * sur les DEUX types — restreindre ce calcul au type `lot` afficherait un
   * palier `spin` épuisé comme s'il était encore à débloquer.
   */
  soldOut: boolean;
}

/** Récompense gagnée par le passeport courant (lot ou spin offert). */
export interface LoyaltyPassportReward {
  id: string;
  milestoneId: string;
  rewardType: LoyaltyRewardType;
  earnedAt: string;
  rewardLabel: string;
  rewardDetails: string | null;
  /** reward_type='lot' : code de retrait FIDELITE-… présenté en caisse. */
  code: string | null;
  redeemedAt: string | null;
  /** reward_type='spin' : jeton du tour offert (null si déjà consommé). */
  grantToken: string | null;
  consumedAt: string | null;
  resultingSpinId: string | null;
}

/**
 * État du passeport du joueur courant (cookie httpOnly) en LECTURE SEULE :
 * rien n'est écrit au rendu de la page. Aucun cookie/passeport → état vide.
 */
export interface LoyaltyPassportState {
  hasPassport: boolean;
  visitCount: number;
  tier: LoyaltyTier;
  rewards: LoyaltyPassportReward[];
}

/** Etat minimal du pot commun, affichable sans ouvrir le parcours Jackpot. */
export interface LoyaltyLinkedJackpotState {
  name: string;
  rewardLabel: string;
  currentCount: number;
  threshold: number;
  displayAmountCents: number;
  hasJoined: boolean;
}

interface ProgramWithOrg {
  program: PublicLoyaltyProgram;
  organization: PublicLoyaltyOrganization;
}

/**
 * Charge un programme + son organisation via la service role et VÉRIFIE la
 * cohérence inter-tenant (la service role contourne la RLS : chaque relation
 * doit pointer le même tenant). null si introuvable/incohérent.
 */
async function fetchProgramWithOrg(
  admin: ReturnType<typeof createAdminClient>,
  programId: string,
): Promise<ProgramWithOrg | null> {
  const { data } = await admin
    .from("loyalty_programs")
    .select(`${PROGRAM_COLUMNS}, organizations(${ORG_COLUMNS})`)
    .eq("id", programId)
    .maybeSingle();
  if (!data) return null;

  const row = data as unknown as PublicLoyaltyProgram & {
    organizations: PublicLoyaltyOrganization | null;
  };
  const org = row.organizations;
  if (!org || org.id !== row.organization_id) {
    console.error("[loyalty-context] organisation incohérente", { programId });
    return null;
  }
  const { organizations: _org, ...program } = row;
  void _org;
  return { program, organization: org };
}

function toMilestoneView(row: LoyaltyMilestone): LoyaltyMilestoneView {
  return {
    id: row.id,
    visitCount: row.visit_count,
    rewardType: row.reward_type,
    rewardLabel: row.reward_label,
    rewardDetails: row.reward_details,
    targetWheelId: row.target_wheel_id,
    soldOut:
      row.reward_stock !== null && row.reward_claimed_count >= row.reward_stock,
  };
}

/**
 * Passeport du joueur courant (cookie httpOnly) en lecture seule : compteur,
 * niveau (recalculé depuis les seuils courants), et récompenses gagnées (lots
 * + tours offerts). Aucun cookie/passeport → état vide.
 */
async function loadPassportState(
  admin: ReturnType<typeof createAdminClient>,
  program: PublicLoyaltyProgram,
): Promise<LoyaltyPassportState> {
  const empty: LoyaltyPassportState = {
    hasPassport: false,
    visitCount: 0,
    tier: "bronze",
    rewards: [],
  };

  const store = await cookies();
  const token = store.get(loyaltyTokenCookieName(program.id))?.value;
  if (!token) return empty;

  const { data: member } = await admin
    .from("loyalty_members")
    .select("id, visit_count")
    .eq("program_id", program.id)
    .eq("token_hash", hashPlayerToken(token))
    .maybeSingle();
  // Cookie présent mais aucun passeport en base (mode staff avant la première
  // validation) : l'identité existe déjà (le QR de check-in peut être affiché)
  // mais le compteur reste à zéro.
  if (!member) {
    return { ...empty, hasPassport: true };
  }

  const { data: rewardRows } = await admin
    .from("loyalty_rewards")
    .select(
      "id, milestone_id, reward_type, earned_at, code, redeemed_at, grant_token, consumed_at, resulting_spin_id",
    )
    .eq("member_id", member.id)
    .order("earned_at", { ascending: false });

  // Libellés portés par le palier (loyalty_rewards ne les dénormalise pas) :
  // un seul aller-retour, borné (≤ 1000 paliers/programme via le CHECK SQL).
  const milestoneIds = [
    ...new Set((rewardRows ?? []).map((r) => r.milestone_id as string)),
  ];
  const labels = new Map<string, { label: string; details: string | null }>();
  if (milestoneIds.length > 0) {
    const { data: ms } = await admin
      .from("loyalty_milestones")
      .select("id, reward_label, reward_details")
      .in("id", milestoneIds);
    for (const m of ms ?? []) {
      labels.set(m.id as string, {
        label: (m.reward_label as string) ?? "",
        details: (m.reward_details as string | null) ?? null,
      });
    }
  }

  const rewards: LoyaltyPassportReward[] = (rewardRows ?? []).map((r) => {
    const meta = labels.get(r.milestone_id as string);
    return {
      id: r.id as string,
      milestoneId: r.milestone_id as string,
      rewardType: r.reward_type as LoyaltyRewardType,
      earnedAt: r.earned_at as string,
      rewardLabel: meta?.label ?? "",
      rewardDetails: meta?.details ?? null,
      code: (r.code as string | null) ?? null,
      redeemedAt: (r.redeemed_at as string | null) ?? null,
      grantToken: (r.grant_token as string | null) ?? null,
      consumedAt: (r.consumed_at as string | null) ?? null,
      resultingSpinId: (r.resulting_spin_id as string | null) ?? null,
    };
  });

  return {
    hasPassport: true,
    visitCount: member.visit_count as number,
    tier: loyaltyTierForVisits(
      member.visit_count as number,
      program.silver_threshold,
      program.gold_threshold,
    ),
    rewards,
  };
}

/**
 * Lit le pot explicitement relié au programme. Cette lecture n'écrit rien et
 * ne retourne ni le cookie, ni son hash, ni le code d'un éventuel gain.
 */
async function loadLinkedJackpotState(
  admin: ReturnType<typeof createAdminClient>,
  program: PublicLoyaltyProgram,
  organization: PublicLoyaltyOrganization,
): Promise<LoyaltyLinkedJackpotState | null> {
  if (!program.jackpot_campaign_id || !organization.addon_jackpot) return null;

  const { data: campaign } = await admin
    .from("jackpot_campaigns")
    .select(
      "id, organization_id, name, status, validation_mode, threshold, current_count, display_base_cents, display_increment_cents, reward_label",
    )
    .eq("id", program.jackpot_campaign_id)
    .eq("organization_id", program.organization_id)
    .eq("status", "active")
    .eq("validation_mode", "staff")
    .maybeSingle();

  if (!campaign) return null;

  const store = await cookies();
  const token = store.get(loyaltyTokenCookieName(program.id))?.value;
  let hasJoined = false;
  if (token) {
    const { data: participant } = await admin
      .from("jackpot_participants")
      .select("id")
      .eq("campaign_id", campaign.id)
      .eq("organization_id", program.organization_id)
      .eq("player_token_hash", hashPlayerToken(token))
      .limit(1)
      .maybeSingle();
    hasJoined = Boolean(participant);
  }

  return {
    name: campaign.name,
    rewardLabel: campaign.reward_label || "Le lot du moment",
    currentCount: campaign.current_count,
    threshold: campaign.threshold,
    displayAmountCents:
      campaign.display_base_cents +
      campaign.current_count * campaign.display_increment_cents,
    hasJoined,
  };
}

export type LoyaltyActionContext =
  | { ok: false; error: string }
  | {
      ok: true;
      admin: ReturnType<typeof createAdminClient>;
      program: PublicLoyaltyProgram;
    };

/**
 * Contexte MINIMAL d'une server action publique (tampon, jeton de check-in,
 * tour offert) : programme + organisation résolus et vérifiés (addon,
 * abonnement, statut actif), rien de plus.
 *
 * Une action publique n'a besoin ni des paliers ni de l'état du passeport :
 * `loadLoyaltyContext` engageait jusqu'à CINQ requêtes (programme, paliers,
 * passeport, récompenses, libellés) là où une seule suffit. Sur un chemin
 * ouvert à Internet, cette amplification de lecture précédait le premier
 * rempart — c'est exactement ce qu'on ne veut pas offrir. La page, elle,
 * continue d'utiliser `loadLoyaltyContext` (elle affiche tout cela).
 */
export async function loadLoyaltyActionContext(
  programId: string,
): Promise<LoyaltyActionContext> {
  const admin = createAdminClient();

  const resolved = await fetchProgramWithOrg(admin, programId);
  if (!resolved) return { ok: false, error: UNAVAILABLE };
  const { program, organization } = resolved;

  if (!await moduleOuvertAuJoueur("loyalty", organization)) return { ok: false, error: UNAVAILABLE };
  if (program.status !== "active") return { ok: false, error: UNAVAILABLE };

  return { ok: true, admin, program };
}

// ────────────────────────────────────────────────────────────
// QR de commande unique (cahier §7) — résolution d'un JETON
// ────────────────────────────────────────────────────────────

/**
 * Colonnes du code de commande. `consumed_at` est lu pour DIRE au porteur que
 * sa carte a déjà servi (page publique), jamais pour décider : c'est
 * `record_loyalty_stamp` qui tranche, par un `update … where consumed_at is
 * null` atomique. Un refus décidé ici serait une course perdue d'avance.
 */
const ORDER_CODE_COLUMNS = "token, consumed_at, program_id, organization_id";

/**
 * Colonnes du programme visées par un jeton de commande. Ni `rotating_secret`
 * (la graine du code du comptoir : la fabriquer, c'est fabriquer des visites),
 * ni les seuils, ni la période de rotation — un bon de livraison n'a rien à
 * savoir du fonctionnement interne du programme.
 *
 * `min_stamp_interval_seconds` y figure pour la SEULE server action
 * (classement d'ancienneté du passeport) ; les deux fonctions publiques
 * ci-dessous construisent des objets LITTÉRAUX, jamais un `...row`, si bien
 * qu'aucune colonne lue ne sort par accident.
 */
const ORDER_PROGRAM_COLUMNS =
  "id, organization_id, name, status, min_stamp_interval_seconds";

/** Identité affichée + exactement ce que `moduleOuvertAuJoueur` exige. */
const ORDER_ORG_COLUMNS =
  "id, name, logo_url, subscription_status, trial_ends_at, past_due_since, addon_loyalty, comp_access, comp_access_until";

type OrderCodeOrganization = Pick<
  Organization,
  | "id"
  | "name"
  | "logo_url"
  | "subscription_status"
  | "trial_ends_at"
  | "past_due_since"
  | "addon_loyalty"
  | "comp_access"
  | "comp_access_until"
>;

interface OrderCodeResolved {
  admin: ReturnType<typeof createAdminClient>;
  consumedAt: string | null;
  program: {
    id: string;
    organizationId: string;
    name: string;
    minStampIntervalSeconds: number;
  };
  organizationName: string;
  logoUrl: string | null;
}

/**
 * Résout un jeton de commande en (programme, organisation) par la service
 * role, en UNE lecture, avec toutes les gardes du module. `null` pour TOUT
 * refus — jeton malformé, inconnu, programme inactif, module fermé,
 * incohérence inter-tenant : cinq causes, une seule réponse.
 *
 * C'est le seul endroit où ces gardes vivent : la page publique et la server
 * action les partagent, et un futur appelant qui oublierait l'une d'elles
 * devrait d'abord la retirer d'ici.
 *
 * La service role contourne la RLS : la cohérence
 * `code.organization_id = programme.organization_id = organisation.id` est donc
 * vérifiée À LA MAIN, comme dans `fetchProgramWithOrg`. Sans elle, un jeton dont
 * la ligne pointerait un programme d'un autre tenant serait servi sans un mot.
 */
async function resolveOrderCode(token: string): Promise<OrderCodeResolved | null> {
  const parsed = loyaltyOrderTokenSchema.safeParse(token);
  // Jeton malformé : aucune requête. Le refus est le même que « inconnu ».
  if (!parsed.success) return null;

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("loyalty_order_codes")
    .select(
      `${ORDER_CODE_COLUMNS}, loyalty_programs(${ORDER_PROGRAM_COLUMNS}, organizations(${ORDER_ORG_COLUMNS}))`,
    )
    .eq("token", parsed.data)
    .maybeSingle();

  if (error) {
    console.error("[loyalty-context] jeton de commande", error.message);
    return null;
  }
  if (!data) return null;

  // select() construit la liste de colonnes par gabarit (ORDER_CODE_COLUMNS/
  // ORDER_PROGRAM_COLUMNS/ORDER_ORG_COLUMNS) — supabase-js ne peut pas
  // inférer la forme de l'embed depuis une chaîne dynamique.
  // unsafe-cast-justification: embed PostgREST construit par gabarit, non typable
  const row = data as unknown as {
    consumed_at: string | null;
    program_id: string;
    organization_id: string;
    loyalty_programs:
      | (Omit<PublicLoyaltyProgram, "rotating_period_seconds" | "silver_threshold" | "gold_threshold" | "created_at"> & {
          organizations: OrderCodeOrganization | null;
        })
      | null;
  };

  const program = row.loyalty_programs;
  if (!program || program.id !== row.program_id) return null;
  if (program.organization_id !== row.organization_id) {
    console.error("[loyalty-context] code de commande inter-tenant", {
      programId: row.program_id,
    });
    return null;
  }

  const org = program.organizations;
  if (!org || org.id !== program.organization_id) {
    console.error("[loyalty-context] organisation incohérente (code de commande)");
    return null;
  }

  if (program.status !== "active") return null;
  if (!(await moduleOuvertAuJoueur("loyalty", org))) return null;

  return {
    admin,
    consumedAt: row.consumed_at,
    program: {
      id: program.id,
      organizationId: program.organization_id,
      name: program.name,
      minStampIntervalSeconds: program.min_stamp_interval_seconds,
    },
    organizationName: org.name,
    logoUrl: org.logo_url,
  };
}

/**
 * Ce que la page publique `/commande/[token]` reçoit — et la liste EST le
 * contrat de sécurité, pas une commodité de typage. Rien du programme interne
 * n'y figure : ni `rotating_secret`, ni le cooldown, ni le mode de validation,
 * ni le moindre compteur. Tout ce qui sort est déjà affiché en vitrine.
 */
export interface OrderCodeContext {
  programId: string;
  programName: string;
  organizationName: string;
  logoUrl: string | null;
  /**
   * Le jeton a DÉJÀ servi : la page le dit au porteur plutôt que de lui faire
   * cliquer un bouton qui échouera. Ce n'est PAS une garde — le verrou est
   * `consumed_at` en base, posé sous verrou de ligne par la RPC.
   */
  alreadyConsumed: boolean;
}

/**
 * Contexte public de la page d'un QR de commande. `null` pour tout ce qui
 * n'existe pas, n'est pas actif, ou dont le module est fermé — aucun oracle :
 * balayer des jetons n'apprend rien de plus que de regarder la vitrine.
 *
 * UNE lecture (plus, au plus, celle des octrois quand `moduleOuvertAuJoueur`
 * doit trancher pour un commerçant sans abonnement actif). La page ne tamponne
 * RIEN : c'est la server action `stampLoyaltyOrder`, sur clic, qui consomme le
 * jeton — un lien partagé ne doit pas dépenser la commande de son destinataire.
 */
export async function loadOrderCodeContext(
  token: string,
): Promise<OrderCodeContext | null> {
  const resolved = await resolveOrderCode(token);
  if (!resolved) return null;

  // Compteur d'OBSERVABILITÉ sur clé PARTAGÉE (programme + IP) : il incrémente
  // et alerte, il ne refuse JAMAIS — la seule forme admise ici (ADR-032).
  // Posé APRÈS la résolution du jeton, comme `loadHuntStepContext` pose le sien
  // après la résolution de l'étape : avant, il n'y aurait pas de programme à
  // nommer, et un balayage de jetons au hasard s'arrête de toute façon une
  // lecture plus tôt (resolveOrderCode rend `null`). C'était le SEUL chargeur
  // public du module sans aucune mesure : `resolveOrderCode` ne consomme aucun
  // seau et la page n'est pas `monitored`, donc une boucle de GET sur /commande
  // restait invisible à la supervision. `observerPressionIp` fail-open par
  // construction (`observeSharedKey` ne rend rien) ; règle `loyaltyOrderPageIp`,
  // calquée sur `huntStepIp`.
  await observerPressionIp(
    ["loyalty:order:ip", resolved.program.id],
    clientIpFromHeaders(await headers()),
    RATE_LIMITS.loyaltyOrderPageIp,
    "loyalty_order_page_pressure",
    { program_id: resolved.program.id },
  );

  return {
    programId: resolved.program.id,
    programName: resolved.program.name,
    organizationName: resolved.organizationName,
    logoUrl: resolved.logoUrl,
    alreadyConsumed: resolved.consumedAt !== null,
  };
}

export type LoyaltyOrderActionContext =
  | { ok: false }
  | {
      ok: true;
      admin: ReturnType<typeof createAdminClient>;
      program: {
        id: string;
        organizationId: string;
        minStampIntervalSeconds: number;
      };
    };

/**
 * Contexte MINIMAL de la server action `stampLoyaltyOrder` : le programme visé
 * par le jeton, et rien de plus (miroir de `loadLoyaltyActionContext`).
 *
 * `{ ok: false }` NE PORTE PAS DE MOTIF, volontairement : l'appelant rend
 * `order_invalid` dans tous les cas, exactement comme la RPC le fait pour un
 * jeton déjà consommé. Un champ `error` distinct par cause serait l'oracle que
 * toute la chaîne s'applique à ne pas offrir.
 */
export async function loadOrderCodeActionContext(
  token: string,
): Promise<LoyaltyOrderActionContext> {
  const resolved = await resolveOrderCode(token);
  if (!resolved) return { ok: false };
  return {
    ok: true,
    admin: resolved.admin,
    // Objet LITTÉRAL, jamais `resolved.program` tel quel. Le résolveur est
    // partagé avec la page publique et porte donc `name` ; le transmettre
    // COMPILAIT (typage structurel : une valeur peut être plus riche que son
    // type) et la sortie réelle avait un champ de plus que son contrat. Le
    // symptôme est bénin ici — reste que « ce que le type annonce » et « ce
    // qui sort » avaient cessé de coïncider, et c'est précisément par là que
    // `rotating_secret` sortirait le jour où le résolveur le lirait.
    program: {
      id: resolved.program.id,
      organizationId: resolved.program.organizationId,
      minStampIntervalSeconds: resolved.program.minStampIntervalSeconds,
    },
  };
}

export type LoyaltyContext =
  | { ok: false; error: string }
  | {
      ok: true;
      admin: ReturnType<typeof createAdminClient>;
      program: PublicLoyaltyProgram;
      organization: PublicLoyaltyOrganization;
      milestones: LoyaltyMilestoneView[];
      passport: LoyaltyPassportState;
      jackpot: LoyaltyLinkedJackpotState | null;
    };

/**
 * Contexte public de la page passeport : résout programme → organisation
 * (service role + gardes inter-tenant), vérifie addon + abonnement + statut
 * actif, charge les paliers et l'état du passeport du joueur courant en
 * lecture seule. Réponse générique unique en cas d'invalidité (404 côté
 * page) — pas d'oracle sur le motif.
 */
export async function loadLoyaltyContext(
  programId: string,
): Promise<LoyaltyContext> {
  const admin = createAdminClient();

  const resolved = await fetchProgramWithOrg(admin, programId);
  if (!resolved) return { ok: false, error: UNAVAILABLE };
  const { program, organization } = resolved;

  if (!await moduleOuvertAuJoueur("loyalty", organization)) return { ok: false, error: UNAVAILABLE };
  if (program.status !== "active") return { ok: false, error: UNAVAILABLE };

  const { data: milestoneRows } = await admin
    .from("loyalty_milestones")
    .select(
      "id, program_id, organization_id, visit_count, reward_type, reward_label, reward_details, reward_stock, reward_claimed_count, target_wheel_id, position, created_at",
    )
    .eq("program_id", program.id)
    .order("visit_count", { ascending: true });

  const milestones = ((milestoneRows as LoyaltyMilestone[] | null) ?? []).map(
    toMilestoneView,
  );
  const [passport, jackpot] = await Promise.all([
    loadPassportState(admin, program),
    loadLinkedJackpotState(admin, program, organization),
  ]);

  return { ok: true, admin, program, organization, milestones, passport, jackpot };
}
