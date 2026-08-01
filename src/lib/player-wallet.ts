import "server-only";

import { reportError } from "@/lib/monitoring";
import { peekPlayerDeviceTokenHash } from "@/lib/player-identity";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Le portefeuille du client — chargement serveur.
 *
 * TROIS INTERDITS, écrits ici parce qu'ils sont la raison d'être de ce dessin
 * et non des précautions décoratives.
 *
 * ── 1. AUCUN JETON DANS L'URL, ET AUCUN EN ENTRÉE ───────────────────
 *
 * `loadPlayerWallet()` ne prend AUCUN paramètre. Ce n'est pas une économie de
 * signature : c'est la garantie elle-même. Tant qu'aucune identité ne peut
 * entrer par argument, aucune page, aucun lien et aucun `searchParams` ne
 * peuvent en fabriquer une. Le seul point d'entrée est le cookie `lc-player`
 * du téléphone qui a scanné.
 *
 * Un lien partageable listant ces récompenses serait une fuite, et pas une
 * petite : il porte des CODES DE RETRAIT, c'est-à-dire des droits au porteur.
 * Transféré, capturé dans un historique de navigation ou dans le journal d'un
 * proxy, il donne à un tiers de quoi se présenter en caisse.
 *
 * ── 2. LE CODE DE RETRAIT NE DOIT JAMAIS ÊTRE JOURNALISÉ ────────────
 *
 * Ni `console`, ni `reportError`, ni compteur, ni analytique. C'est un secret
 * porteur : il est rendu au client parce qu'il en a besoin, et il s'arrête
 * là. Corollaire moins évident, appliqué ci-dessous : on ne remonte pas non
 * plus le MESSAGE d'une erreur PostgREST — il peut recopier les paramètres de
 * l'appel, donc le hash du cookie, qui est lui aussi une clé d'accès. Seul le
 * code d'erreur, qui ne porte aucune donnée, part à la supervision.
 *
 * ── 3. AUCUN COOKIE POSÉ SUR CE CHEMIN ──────────────────────────────
 *
 * `peekPlayerDeviceTokenHash` lit sans jamais écrire. Une page de
 * CONSULTATION n'a pas à créer une identité : un visiteur qui n'a jamais joué
 * repartirait sinon avec un identifiant de joueur créé par une simple visite.
 *
 * ── L'ABSENCE DE COOKIE EST UN ÉTAT NORMAL ──────────────────────────
 *
 * Ce n'est ni une erreur, ni une panne, ni une perte : ce visiteur n'a
 * simplement jamais joué depuis cet appareil. Rien n'est remonté, rien n'est
 * compté, et l'état est DISTINCT de `unavailable` — dire « rien à afficher »
 * à un client dont la base est momentanément injoignable lui ferait croire
 * que ses gains ont disparu.
 */

/** Un lot du portefeuille. Le `code` est un secret porteur : ne pas journaliser. */
export interface WalletReward {
  /** Famille d'origine (`wheel`, `hunt`, `quiz`…), pour l'illustration. */
  sourceType: string;
  /** Libellé GRAVÉ à l'émission — jamais le nom actuel de la récompense. */
  label: string;
  code: string;
  status: WalletRewardStatus;
  issuedAt: string;
  expiresAt: string | null;
}

export type WalletRewardStatus = "active" | "redeemed" | "cancelled" | "expired";

const WALLET_STATUSES: readonly WalletRewardStatus[] = [
  "active",
  "redeemed",
  "cancelled",
  "expired",
];

/** Les lots d'un même commerçant : le client lit « chez qui », puis « quoi ». */
export interface WalletOrganizationGroup {
  organizationId: string;
  organizationName: string;
  rewards: WalletReward[];
}

export type PlayerWalletView =
  /** Pas de cookie : ce téléphone n'a jamais joué. État NORMAL. */
  | { status: "no-device" }
  /** Base injoignable : on ne sait pas, et on ne prétend pas savoir. */
  | { status: "unavailable" }
  | {
      status: "ready";
      organizations: WalletOrganizationGroup[];
      /** Lots encore présentables en caisse, toutes organisations confondues. */
      activeCount: number;
      totalCount: number;
    };

/**
 * Plafond de lecture. Un portefeuille est une page, pas un export ; la RPC
 * borne elle-même à 200, cette valeur reste sous sa borne.
 */
const WALLET_LIMIT = 50;

interface WalletRow {
  organization_id: string;
  organization_name: string;
  source_type: string;
  label: string;
  code: string;
  status: string;
  issued_at: string;
  expires_at: string | null;
}

function isWalletStatus(value: string): value is WalletRewardStatus {
  return (WALLET_STATUSES as readonly string[]).includes(value);
}

/**
 * Charge le portefeuille du porteur du cookie `lc-player`.
 *
 * Ne prend aucun argument, et ne doit jamais en prendre : voir l'interdit 1
 * en tête de module.
 */
export async function loadPlayerWallet(): Promise<PlayerWalletView> {
  const tokenHash = await peekPlayerDeviceTokenHash();
  // Ni remontée ni compteur : un visiteur sans cookie n'est pas un incident.
  if (!tokenHash) return { status: "no-device" };

  const admin = createAdminClient();
  const { data, error } = await admin.rpc("player_wallet", {
    p_token_hash: tokenHash,
    p_limit: WALLET_LIMIT,
  });

  if (error) {
    // Le CODE d'erreur seul. Le message peut recopier les paramètres de
    // l'appel — donc le hash du cookie, qui est une clé d'accès.
    reportError("wallet.load", `player_wallet: ${error.code ?? "erreur"}`);
    return { status: "unavailable" };
  }

  const groups = new Map<string, WalletOrganizationGroup>();
  let activeCount = 0;
  let totalCount = 0;

  for (const row of (data as WalletRow[] | null) ?? []) {
    // Une ligne sans code n'est pas présentable en caisse (la RPC les exclut
    // déjà) ; un état hors des quatre de la RPC ne peut pas être décrit
    // honnêtement au client. Dans les deux cas on n'invente rien.
    if (!row?.code || !isWalletStatus(row.status)) continue;

    const group = groups.get(row.organization_id) ?? {
      organizationId: row.organization_id,
      organizationName: row.organization_name,
      rewards: [],
    };
    group.rewards.push({
      sourceType: row.source_type,
      label: row.label,
      code: row.code,
      status: row.status,
      issuedAt: row.issued_at,
      expiresAt: row.expires_at,
    });
    // L'ordre d'insertion de la Map reproduit le tri de la RPC (nom
    // d'organisation, puis date d'émission décroissante).
    groups.set(row.organization_id, group);

    totalCount += 1;
    if (row.status === "active") activeCount += 1;
  }

  return {
    status: "ready",
    organizations: [...groups.values()],
    activeCount,
    totalCount,
  };
}
