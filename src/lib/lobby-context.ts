import "server-only";

import { createHash, randomBytes } from "node:crypto";
import { cookies, headers } from "next/headers";
import { after } from "next/server";

import { moduleOuvertAuJoueur } from "@/lib/module-acces-public";
import { reportError } from "@/lib/monitoring";
import { RATE_LIMITS } from "@/lib/rate-limit";
import { clientIpFromHeaders, observerPressionIp } from "@/lib/request-ip";
import { createAdminClient } from "@/lib/supabase/admin";
import { gardeEditeurVitrine } from "@/lib/vitrine-context";
import { mapOrgLobbies, type OrgLobbyView } from "@/lib/lobby";
import {
  lobbyJoinCodeSchema,
  orgLobbiesSchema,
} from "@/lib/validations/lobby";
import type { Organization } from "@/types/database";

/**
 * L'IDENTITÉ D'UN LOBBY, ET RIEN QUE DE CE LOBBY (L16).
 *
 * ── UN COOKIE PAR SALLE, JAMAIS L'IDENTITÉ GLOBALE ──
 *
 * Le motif est celui d'`event-context.ts` : un cookie httpOnly nommé d'après
 * l'identifiant de la salle, dont seul le SHA-256 atteint la base. L'identité
 * globale `lc-player` n'est ni recopiée ici ni envoyée à la moindre RPC de ce
 * module — et ce n'est pas une commodité, c'est la propriété qu'on achète :
 *
 *   · un téléphone PRÊTÉ le temps d'une partie ne lie pas deux identités. La
 *     personne à qui on tend l'appareil pour taper son pseudo repart avec un
 *     cookie propre à cette salle, et rien de ce qu'elle a fait ailleurs sur ce
 *     téléphone n'y est rattaché ;
 *   · la base ne peut PAS recoudre les salles entre elles. Chaque
 *     `token_hash` est l'empreinte d'un secret distinct, donc deux
 *     participations du même navigateur à deux salles sont, en base, deux
 *     inconnus — il n'existe aucune requête qui les rapproche.
 *
 * ── LE JETON NE QUITTE JAMAIS LE SERVEUR ──
 *
 * `httpOnly` interdit sa lecture par script ; aucune action ne le renvoie dans
 * sa réponse. Ce qui voyage vers la base est son hash, et ce qui voyage vers
 * l'écran est ce que `lobby_state` rend — des pseudos, jamais des empreintes.
 */

/**
 * Longueur du secret, en octets. 32 → 43 caractères base64url, soit 256 bits
 * d'entropie.
 *
 * PLUS LONG QUE `generatePlayerToken` (24 octets, 32 caractères), et
 * délibérément : ce jeton-là est le SEUL titre d'appartenance à une salle, sans
 * aucun second facteur derrière lui — pas de ligne `event_players` reliée à une
 * session résolue par ailleurs, pas de code court à connaître en plus. Le voler
 * ou le deviner, c'est être ce membre. On ne partage pas non plus le générateur
 * de `pronostics.ts` : l'y modifier pour ce lot aurait rallongé, sans le dire,
 * les jetons de six modules déjà en production.
 */
const LOBBY_TOKEN_BYTES = 32;

/**
 * Durée de vie du cookie : 24 heures, le PLAFOND DUR de la salle.
 *
 * Pas un jour de plus, et le calcul n'est pas prudentiel : `player_lobbies`
 * porte un `check` (`expires_at - created_at <= interval '24 hours'`) qui rend
 * impossible l'existence d'une salle plus vieille que ça. Un cookie qui
 * survivrait à sa salle serait un cookie qui ne peut plus rien ouvrir — du
 * stockage laissé sur l'appareil d'un joueur pour une salle qui n'existe plus.
 */
export const LOBBY_COOKIE_MAX_AGE = 60 * 60 * 24;

/** Nom du cookie httpOnly portant le jeton joueur d'UNE salle. */
export function lobbyTokenCookieName(lobbyId: string): string {
  return `lc-lobby-${lobbyId}`;
}

/** Un secret de salle. Généré SERVEUR, jamais dérivé d'une donnée du client. */
export function genererJetonLobby(): string {
  return randomBytes(LOBBY_TOKEN_BYTES).toString("base64url");
}

/**
 * L'empreinte qui part en base — SHA-256 hexadécimal, la forme exacte
 * qu'exigent les `check (… ~ '^[0-9a-f]{64}$')` des deux tables.
 *
 * DOMAINE SÉPARÉ : le jeton est préfixé avant d'être haché, si bien qu'une
 * empreinte de lobby ne peut jamais coïncider avec celle d'un autre module,
 * même si le même secret venait à être présenté aux deux. Sans ce préfixe, la
 * fonction serait `hashPlayerToken` — et deux modules qui partagent une
 * fonction de hachage partagent, de fait, un espace d'identités.
 */
export function hashLobbyToken(token: string): string {
  return createHash("sha256").update(`lobby:${token}`).digest("hex");
}

/** Le jeton de CETTE salle, s'il existe. Lecture seule : rien n'est posé ici. */
export async function lireJetonLobby(lobbyId: string): Promise<string | null> {
  const store = await cookies();
  return store.get(lobbyTokenCookieName(lobbyId))?.value ?? null;
}

/**
 * Pose le cookie de la salle — APRÈS le succès, jamais avant (motif `joinEvent`).
 *
 * Poser en amont laisserait un cookie orphelin sur une salle pleine, close ou
 * inventée : l'appareil garderait une identité pour un endroit où il n'est
 * jamais entré, et la purge n'a aucune prise sur ce qui vit dans un navigateur.
 */
export async function poserJetonLobby(
  lobbyId: string,
  token: string,
): Promise<void> {
  const store = await cookies();
  store.set(lobbyTokenCookieName(lobbyId), token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: LOBBY_COOKIE_MAX_AGE,
  });
}

/**
 * Efface le cookie de la salle — le pendant exact d'une SORTIE réussie.
 *
 * Sans lui, l'appartenance vivrait plus longtemps que l'appartenance : la page
 * `/lobby/[code]` décide quel écran peindre en REGARDANT ce cookie, et un
 * joueur qui vient de quitter retomberait, au rechargement suivant, sur une
 * salle d'attente où `lobby_state` ne le reconnaît plus. C'est l'écriture qui
 * remplace l'ancien oubli côté onglet (`memoire-salon`, supprimé) — la
 * différence est qu'elle est faite là où l'identité vit vraiment.
 */
export async function supprimerJetonLobby(lobbyId: string): Promise<void> {
  const store = await cookies();
  store.delete(lobbyTokenCookieName(lobbyId));
}

// ────────────────────────────────────────────────────────────
// Pression d'abus — IP SEULE, fail-open, jamais attendue
// ────────────────────────────────────────────────────────────

/**
 * Le compteur de pression du module — IP SEULE, fail-open, et jamais attendu.
 *
 * `after()` plutôt qu'un `void` (motif `getEventState`) : sous Fluid Compute
 * l'instance peut geler dès la réponse rendue, et la mesure disparaîtrait — or
 * ADR-032 fait de ce compteur le SEUL signal d'abus de ce chemin, puisqu'aucun
 * refus n'y est opposé. Le `.catch` reste : un rejet non géré ne vaut jamais un
 * compteur.
 *
 * AUCUNE CLÉ DE RESSOURCE, et c'est la raison de `pageOpenIp` (wagon 7) : slug
 * et code viennent du client, donc un seau composé avec eux se disperserait sur
 * autant de valeurs inventées que la rafale en essaie. `etape` n'est qu'une
 * ÉTIQUETTE de contexte — elle voyage dans les métadonnées, jamais dans la clé.
 *
 * ── POURQUOI L'IP EST RENDUE ──
 *
 * `createLobby` en a besoin JUSTE APRÈS, pour la joindre à la vérification
 * Turnstile (LOBBY-1). La relire de son côté aurait donné deux lectures d'en-
 * têtes pour une seule requête, et surtout deux endroits où l'ordre « seau
 * d'abord, challenge ensuite » pourrait diverger. Les appelants qui n'en ont
 * pas l'usage — `join`, `page` — l'ignorent sans rien changer.
 */
export async function observerPressionLobby(
  etape: "create" | "join" | "page",
): Promise<string> {
  const ip = clientIpFromHeaders(await headers());
  after(() =>
    observerPressionIp(["lobby:ip"], ip, RATE_LIMITS.lobbyIp, "lobby_ip_ceiling", {
      etape,
    }).catch((err) => reportError("lobby.pressure", err)),
  );
  return ip;
}

// ────────────────────────────────────────────────────────────
// Résolution du commerce hôte — motif `loadReserverActivityContext`
// ────────────────────────────────────────────────────────────

type LobbyOrganization = Pick<
  Organization,
  | "id"
  | "subscription_status"
  | "trial_ends_at"
  | "past_due_since"
  | "addon_vitrine"
  | "comp_access"
  | "comp_access_until"
>;

/**
 * Les seules colonnes que la garde de module consulte. Ni nom ni logo : ce
 * chemin n'affiche rien du commerce, il décide seulement s'il a le droit
 * d'héberger une salle. Lire de quoi peindre un en-tête qu'on ne peint pas,
 * c'est faire sortir des données du locataire sans destinataire.
 */
const ORG_COLUMNS =
  "id, subscription_status, trial_ends_at, past_due_since, addon_vitrine, comp_access, comp_access_until";

interface VitrineRow {
  organization_id: string;
  organizations: LobbyOrganization | null;
}

/**
 * Le commerce derrière une adresse publique, ou rien.
 *
 * ── UN SEUL VERDICT, QUATRE CAUSES ──
 *
 * Adresse inconnue, jointure inter-locataire incohérente, droit `vitrine`
 * fermé, transport en panne : `null` dans les quatre cas. Les distinguer aurait
 * donné à n'importe qui un oracle — sur les adresses qui existent d'abord, sur
 * l'état COMMERCIAL d'un tiers ensuite, ce qui est la fuite que
 * `loadReserverActivityContext` nomme déjà pour son propre chemin.
 *
 * ── LA GARDE INTER-TENANT EST OBLIGATOIRE ICI ──
 *
 * La service role contourne la RLS : rien, dans le transport, ne garantit que
 * la jointure rapporte l'organisation de la ligne lue. Le vérifier coûte une
 * comparaison ; ne pas le vérifier coûterait une salle ouverte au nom d'un
 * commerce qui n'a rien demandé.
 */
export async function resoudreCommerceLobby(
  slug: string,
): Promise<{ organizationId: string } | null> {
  const admin = createAdminClient();
  // `published` EXIGÉ, comme tout ce que la Vitrine sert au public : un salon
  // ne s'ouvre pas sur une adresse que le commerçant n'a pas ouverte. Sans ce
  // filtre, deviner le slug d'une vitrine jamais publiée suffisait à créer des
  // lobbies au nom de l'organisation (revue L16, préemptée).
  const { data } = await admin
    .from("vitrine_settings")
    .select(`organization_id, organizations(${ORG_COLUMNS})`)
    .eq("slug", slug)
    .eq("published", true)
    .maybeSingle();
  if (!data) return null;

  // unsafe-cast-justification: embed PostgREST construit par gabarit, non typable
  const row = data as unknown as VitrineRow;
  const organization = row.organizations ?? null;
  if (!organization || organization.id !== row.organization_id) {
    console.error("[lobby-context] organisation incohérente", { slug });
    return null;
  }
  if (!(await moduleOuvertAuJoueur("vitrine", organization))) return null;

  return { organizationId: organization.id };
}

// ────────────────────────────────────────────────────────────
// Résolution d'une salle par son code de partage
// ────────────────────────────────────────────────────────────

/**
 * La salle derrière un code de partage, ou rien.
 *
 * ── UN CODE MORT EST UN CODE INVENTÉ, ET `null` NE DIT PAS LEQUEL ──
 *
 * Le filtre est délibérément le MÊME que celui de `join_player_lobby` : seuls
 * `lobby` et `locked` sont des salles ouvrables, et une salle dont la date de
 * mort est passée est morte même si sa colonne `status` dit encore « lobby »
 * (l'expiration se CONSTATE, aucune RPC ne l'écrit — ADR-111). Code jamais
 * attribué, code mal formé, salle close, salle expirée : quatre causes, un seul
 * `null`. Les séparer — fût-ce par un code HTTP ou un écran différent — rendrait
 * à qui sonde l'oracle que la base ferme exprès : six caractères à la fois, la
 * vie sociale des commerces d'à côté.
 *
 * ── CE QUI SORT D'ICI N'OUVRE RIEN ──
 *
 * Seul l'identifiant est rendu. Il ne donne accès à aucune donnée : `lobby_state`
 * exige EN PLUS l'empreinte du cookie de cette salle, et rend le même refus muet
 * à qui n'est pas membre. C'est ce qui permet à la page de résoudre le code sans
 * rien apprendre à celui qui l'a tapé au hasard.
 *
 * ── ET POURTANT UNE SALLE CLOSE SE RÉSOUT ENCORE, QUELQUES HEURES ──
 *
 * Le filtre d'origine perdait le résultat d'une partie AU RECHARGEMENT : la
 * révélation du Duo Miroir ferme la salle et ramène sa date de mort à l'instant
 * même, donc « close ET expirée » — l'écran de résultat devenait introuvable
 * pour ceux-là mêmes qui venaient d'y jouer (CI L17). Une partie qu'on ne peut
 * pas relire est une partie qu'on n'a pas finie.
 *
 * La fenêtre de grâce (`FENETRE_RELECTURE_MS`) court depuis `expires_at` et non
 * depuis maintenant : elle suit la mort de la salle, pas l'horloge du visiteur.
 * Et elle ne rend RIEN de plus à un inconnu — la page lit ensuite le cookie de
 * cette salle : sans lui, elle rend le même écran de refus qu'un code inventé.
 * Ce qui s'ouvre ici n'est donc pas la salle, c'est la possibilité de prouver
 * qu'on y était.
 */
const FENETRE_RELECTURE_MS = 6 * 60 * 60 * 1000;

export async function resoudreLobbyParCode(
  code: string,
): Promise<{ lobbyId: string; vivante: boolean } | null> {
  // Normalisation ET forme, par le schéma qui sert déjà l'action : un code
  // malformé ne mérite pas un aller-retour, et il rend le même `null`.
  const parsed = lobbyJoinCodeSchema.safeParse(code);
  if (!parsed.success) return null;

  const maintenant = Date.now();
  const admin = createAdminClient();
  const { data } = await admin
    .from("player_lobbies")
    .select("id, status, expires_at")
    .eq("join_code", parsed.data)
    .in("status", ["lobby", "locked", "closed"])
    .gt("expires_at", new Date(maintenant - FENETRE_RELECTURE_MS).toISOString())
    .maybeSingle();
  if (!data) return null;

  // `vivante` = ce que `join_player_lobby` accepterait. La page s'en sert pour
  // ne JAMAIS proposer de rejoindre une salle finie : on relit un résultat, on
  // n'entre pas dans une partie qui n'existe plus.
  const expiresAt = Date.parse(String(data.expires_at));
  const vivante =
    (data.status === "lobby" || data.status === "locked") &&
    Number.isFinite(expiresAt) &&
    expiresAt > maintenant;

  return { lobbyId: data.id as string, vivante };
}

// ────────────────────────────────────────────────────────────
// LA SUPERVISION COMMERÇANT — contrepartie du finding E-1
// ────────────────────────────────────────────────────────────

export type OrgLobbiesContext =
  | { ok: false; error: string }
  | {
      ok: true;
      organizationId: string;
      /** Au plus cinquante, les plus récentes d'abord. Jamais `undefined`. */
      salons: OrgLobbyView[];
      /**
       * L'INSTANT DE LA LECTURE, en ISO — l'origine des durées que l'écran
       * affiche (« ouvert il y a 12 min »).
       *
       * Il est stampé ICI et non dans le composant, pour deux raisons qui vont
       * dans le même sens. La juste : ces durées sont relatives au moment où la
       * liste a été LUE, pas au moment où elle est peinte — une carte rendue
       * deux secondes après la requête ne doit pas prétendre le contraire. La
       * mécanique : un composant qui appelle `Date.now()` lit une valeur
       * instable d'un rendu à l'autre, et la règle de pureté de React le refuse.
       * Un chargeur, lui, a parfaitement le droit de regarder l'heure.
       */
      luA: string;
    };

/**
 * LES SALLES VIVANTES D'UN COMMERCE, pour son écran de supervision.
 *
 * ── POURQUOI ICI, ET PAS DANS UNE SERVER ACTION ──
 *
 * C'est une LECTURE DE PAGE : pas de `_prev`, pas de `FormData`, rien à
 * revalider. L'exposer en `"use server"` en aurait fait un point POST de plus,
 * atteignable sans qu'aucun écran ne le rende. Le dépôt range ces lectures dans
 * les `*-context` — motif exact de `loadVitrineTraductions`.
 *
 * ── POURQUOI DANS CE FICHIER-CI ET PAS DANS `vitrine-context.ts` ──
 *
 * L'écran est celui de la Vitrine, mais la donnée est celle du lobby : le
 * vocabulaire, le mappeur défensif et le contrat de la RPC vivent ici, avec les
 * six autres. Poser le chargeur à côté de l'écran l'aurait séparé de ce qu'il
 * lit, et `vitrine-context.ts` aurait fini par importer `@/lib/lobby` pour un
 * type — c'est-à-dire la même dépendance, dans l'autre sens et moins lisible.
 *
 * ── C'EST LA GARDE QUI TIENT L'APPARTENANCE, PAS LA RPC ──
 *
 * `org_player_lobbies` est `security definer` / `service_role` et n'interroge
 * AUCUNE appartenance : elle rend les salles de l'organisation qu'on lui nomme,
 * point. Son en-tête l'assume en toutes lettres — elle ne rend rien de
 * personnel et n'écrit rien, donc exiger un acteur aurait coûté une
 * vérification par rafraîchissement d'écran pour garder six chiffres. Sa sûreté
 * repose ENTIÈREMENT sur le fait que ce chargeur lui passe l'organisation de la
 * SESSION, et jamais un paramètre venu du navigateur. La garde d'écriture, elle,
 * est en SQL (voir `closeOrgLobby`).
 *
 * ── LE DROIT `vitrine` EST EXIGÉ ICI, ET C'EST PLUS STRICT QUE LA BASE ──
 *
 * `gardeEditeurVitrine` refuse sans le droit `vitrine` ; la RPC de fermeture,
 * elle, ne l'exige pas — délibérément, pour qu'un commerçant dont l'offre vient
 * d'expirer puisse encore fermer les salles ouvertes la veille. L'écart est
 * assumé et borné : cet écran est servi sous `/dashboard/vitrine`, qui exige
 * déjà ce droit, et une salle ne s'ouvre que sur une vitrine PUBLIÉE — donc sur
 * un droit vivant. Le jour où la supervision devra survivre à l'expiration, elle
 * changera de porte, pas de garde.
 *
 * ── UNE PANNE DE LECTURE REND LA LISTE VIDE, PAS UN REFUS ──
 *
 * Motif de `loadVitrineDashboardContext` : le commerçant a le droit, il n'a
 * simplement rien à afficher. Confondre les deux lui ferait croire que son
 * abonnement a changé — et la carte, qui ne se peint qu'avec au moins un salon,
 * disparaît alors sans rien affirmer de faux.
 */
export async function loadOrgLobbies(): Promise<OrgLobbiesContext> {
  const garde = await gardeEditeurVitrine();
  if (!garde.ok) return { ok: false, error: garde.error };

  const vide = {
    ok: true as const,
    organizationId: garde.organizationId,
    salons: [] as OrgLobbyView[],
    luA: new Date().toISOString(),
  };

  // DE LA SESSION, et le schéma est là pour qu'un `null` ne parte jamais : la
  // RPC lèverait une 22023, c'est-à-dire une exception là où il n'y a rien à
  // réparer côté commerçant.
  const parsed = orgLobbiesSchema.safeParse({
    organizationId: garde.organizationId,
  });
  if (!parsed.success) return vide;

  const admin = createAdminClient();
  const { data, error } = await admin.rpc("org_player_lobbies", {
    p_organization_id: parsed.data.organizationId,
  });
  if (error) {
    reportError("lobby.org_lobbies", error.message);
    return vide;
  }

  return { ...vide, salons: mapOrgLobbies(data) };
}
