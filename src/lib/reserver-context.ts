import "server-only";

import { createHash, randomBytes } from "node:crypto";
import { cookies, headers } from "next/headers";
import { getUserAndOrg } from "@/lib/auth";
import { moduleOuvertAuJoueur } from "@/lib/module-acces-public";
import { RATE_LIMITS } from "@/lib/rate-limit";
import { clientIpFromHeaders, observerPressionIp } from "@/lib/request-ip";
import {
  generatePlayerDeviceToken,
  hashPlayerDeviceToken,
  peekPlayerDeviceTokenHash,
  PLAYER_COOKIE_MAX_AGE,
  PLAYER_COOKIE_NAME,
  PLAYER_DEVICE_TOKEN_PATTERN,
} from "@/lib/player-identity";
import {
  asReservationStatus,
  asSlotStatus,
  asWaitlistStatus,
  etatUiInvitation,
  mapReservationPublicState,
  RESERVER_FUSEAU_DEFAUT,
  RESERVER_INVITATION_TOKEN_PATTERN,
  type EtatUiInvitation,
  type PublicWaitlistItem,
  type ReservationStatus,
  type ReservationSlotStatus,
  type ReservationWaitlistStatus,
} from "@/lib/reserver";
import { droitEffectifModule } from "@/lib/subscription";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import type { Organization } from "@/types/database";

/**
 * Chargeurs serveur du module Réserver (RES-1b, lot L4).
 *
 * ── LES COLONNES SONT ÉNUMÉRÉES, TOUJOURS ──
 *
 * `reservations` porte un GRANT DE COLONNES à `authenticated` dont `email` est
 * ABSENT (20261002120000:435) : un `select *` PostgREST est refusé EN ENTIER sur
 * cette table, pas partiellement. Les trois tables sont donc lues colonne par
 * colonne — y compris côté service_role, où rien ne l'imposerait, pour que la
 * requête du dashboard et celle du parcours public ne divergent pas le jour où
 * l'une passe de l'autre côté.
 *
 * ── LE DROIT `vitrine` EST VÉRIFIÉ ICI AUSSI ──
 *
 * `reserve_slot` l'interroge déjà en SQL, et c'est la vraie défense. Ce chargeur
 * le vérifie pour une raison différente : une organisation sans le droit doit
 * rendre le MÊME contexte « indisponible » qu'une activité inexistante — sans
 * quoi la page publique deviendrait un oracle sur l'état commercial d'un
 * commerce qui n'est pas celui du visiteur.
 */

/** Erreur générique unique : aucun oracle sur l'existence ni sur l'état. */
const INDISPONIBLE = "Cette page de réservation n'est pas disponible.";

/**
 * Créneaux affichés sur une page publique. Vingt suffisent à un agenda de
 * commerce, et cette borne est aussi ce qui plafonne la lecture de comptage
 * ci-dessous (20 × capacité max 500 = 10 000 lignes au pire).
 */
const CRENEAUX_PUBLICS_MAX = 20;

/** Plafond de la lecture de comptage — voir `CRENEAUX_PUBLICS_MAX`. */
const RESERVATIONS_COMPTAGE_MAX = 10_000;

const ORG_COLUMNS =
  "id, name, logo_url, subscription_status, trial_ends_at, past_due_since, addon_vitrine, comp_access, comp_access_until, timezone";

const ACTIVITY_COLUMNS =
  "id, organization_id, name, description, active, created_at";

const SLOT_COLUMNS =
  "id, organization_id, activity_id, starts_at, ends_at, capacity, status, waitlist_offer_minutes";

/** `email` EST ABSENT, et c'est le point : il n'existe que pour l'envoi serveur. */
const RESERVATION_COLUMNS =
  "id, slot_id, organization_id, code, status, created_at, cancelled_at, checked_in_at, checked_in_by";

/**
 * Entrées de liste prioritaire du panneau commerçant.
 *
 * `email` EST ABSENT — hors du grant de colonnes, exactement comme sur
 * `reservations` : le commerçant voit QUI attend et à quel rang, l'adresse
 * n'existe que pour que le serveur prévienne.
 *
 * `player_key_hash` EST ABSENT AUSSI, et là c'est un choix de CETTE couche, pas
 * du SQL : la colonne est dans le grant (elle sert à recomposer une file), mais
 * c'est la CLÉ D'ACCÈS du joueur — la faire descendre jusqu'à un écran la
 * mettrait dans un HTML, un cache et une capture d'écran, pour un affichage qui
 * n'en a aucun usage.
 */
const WAITLIST_COLUMNS =
  "id, slot_id, organization_id, status, offered_at, offer_expires_at, converted_at, converted_reservation_id, expired_at, cancelled_at, created_at";

/** `token_hash` EST ABSENT : il n'est pas dans le grant, et n'a aucun lecteur. */
const INVITATION_COLUMNS =
  "id, organization_id, activity_id, slot_id, label, max_uses, used_count, expires_at, closed_at, revoked_at, created_by, created_at";

type ReserverOrganization = Pick<
  Organization,
  | "id"
  | "name"
  | "logo_url"
  | "subscription_status"
  | "trial_ends_at"
  | "past_due_since"
  | "addon_vitrine"
  | "comp_access"
  | "comp_access_until"
  | "timezone"
>;

interface ActivityRow {
  id: string;
  organization_id: string;
  name: string;
  description: string | null;
  active: boolean;
  created_at: string;
  organizations?: ReserverOrganization | null;
}

interface SlotRow {
  id: string;
  organization_id: string;
  activity_id: string;
  starts_at: string;
  ends_at: string;
  capacity: number;
  status: string;
  waitlist_offer_minutes: number | null;
}

interface WaitlistRow {
  id: string;
  slot_id: string;
  organization_id: string;
  status: string;
  offered_at: string | null;
  offer_expires_at: string | null;
  converted_at: string | null;
  converted_reservation_id: string | null;
  expired_at: string | null;
  cancelled_at: string | null;
  created_at: string;
}

interface InvitationRow {
  id: string;
  organization_id: string;
  activity_id: string | null;
  slot_id: string | null;
  label: string;
  max_uses: number;
  used_count: number;
  expires_at: string | null;
  closed_at: string | null;
  revoked_at: string | null;
  created_by: string | null;
  created_at: string;
}

interface ReservationRow {
  id: string;
  slot_id: string;
  organization_id: string;
  code: string;
  status: string;
  created_at: string;
  cancelled_at: string | null;
  checked_in_at: string | null;
  checked_in_by: string | null;
}

// ────────────────────────────────────────────────────────────
// Identité joueur — le cookie global `lc-player`
// ────────────────────────────────────────────────────────────

/**
 * Empreinte du cookie joueur, en LECTURE SEULE — miroir de
 * `peekPlayerDeviceTokenHash`, qui ne pose jamais le cookie et n'écrit jamais en
 * base. C'est la seule forme admissible dans un rendu de page : un composant
 * serveur n'a pas le droit d'écrire un cookie.
 *
 * `null` = pas d'identité (cookie absent, malformé, ou sel non configuré), donc
 * aucune réservation à retrouver — ce qui est vrai par construction.
 */
export async function lireIdentiteReserver(): Promise<string | null> {
  return peekPlayerDeviceTokenHash();
}

/**
 * Empreinte du cookie joueur, EN POSANT le cookie s'il manque. Réservée aux
 * server actions.
 *
 * ── POURQUOI CE HELPER PLUTÔT QU'`ensurePlayerDeviceCookie` PUIS UN PEEK ──
 *
 * Le couple « poser puis relire » ferait dépendre le hash rendu de la façon
 * dont le magasin de cookies reflète une écriture faite dans la même requête.
 * Ici le jeton est tenu en main : c'est LUI qu'on hache, jamais ce qu'une
 * seconde lecture veut bien rendre. Aucun aller-retour base, donc le premier
 * seau de limitation peut être tranché avant la moindre requête SQL.
 *
 * `null` si le sel `PLAYER_KEY_SALT` n'est pas configuré : l'action refusera,
 * plutôt que d'écrire une empreinte qui ne vaut rien.
 */
export async function assurerIdentiteReserver(): Promise<string | null> {
  try {
    const store = await cookies();
    const existant = store.get(PLAYER_COOKIE_NAME)?.value;
    const valide = existant && PLAYER_DEVICE_TOKEN_PATTERN.test(existant);
    const jeton = valide ? existant : generatePlayerDeviceToken();
    // Le hash AVANT la pose : si le sel manque, rien n'est écrit dans le
    // navigateur pour une identité que le serveur ne saura pas relire.
    const empreinte = hashPlayerDeviceToken(jeton);
    if (!valide) {
      store.set(PLAYER_COOKIE_NAME, jeton, {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        path: "/",
        maxAge: PLAYER_COOKIE_MAX_AGE,
        priority: "high",
      });
    }
    return empreinte;
  } catch {
    return null;
  }
}

// ────────────────────────────────────────────────────────────
// Jeton d'invitation — tiré ici, haché ici, jamais journalisé
// ────────────────────────────────────────────────────────────

/**
 * Jeton d'invitation en clair : 24 octets tirés du CSPRNG, en base64url.
 *
 * 192 bits, très au-delà des 128 exigés : aucun dictionnaire ne retrouve un tel
 * jeton, ce qui est la raison même pour laquelle la base peut se contenter
 * d'une empreinte NON SALÉE. Il ne quitte cette fonction que vers l'écran de
 * création, UNE FOIS — la base n'en garde que le SHA-256.
 */
export function generateInvitationToken(): string {
  return randomBytes(24).toString("base64url");
}

/**
 * SHA-256 hexadécimal, SANS SEL — le contrat écrit dans la migration
 * 20261004120000 (`reservation_invitations.token_hash`).
 *
 * Non salé DÉLIBÉRÉMENT, contrairement à `hashPlayerDeviceToken` : le sel
 * applicatif de l'identité joueur existe pour empêcher de rapprocher les
 * empreintes d'un même appareil entre tables historiques. Ici il n'y a rien à
 * rapprocher, et un sel rendrait TOUTES les invitations illisibles le jour où
 * il tournerait — une invitation doit survivre à une rotation de secret, une
 * session non.
 *
 * `null` si le jeton n'a pas la forme attendue : hacher n'importe quoi
 * produirait une empreinte bien formée pour une entrée qui ne l'est pas, et la
 * RPC lèverait `22023` sur ce que le contrôle de forme aurait dû arrêter.
 */
export function hashInvitationToken(jeton: string): string | null {
  const clair = jeton.trim();
  if (!RESERVER_INVITATION_TOKEN_PATTERN.test(clair)) return null;
  return createHash("sha256").update(clair).digest("hex");
}

// ────────────────────────────────────────────────────────────
// Contexte PUBLIC d'une activité
// ────────────────────────────────────────────────────────────

export interface ReserverActivityView {
  id: string;
  name: string;
  description: string | null;
  active: boolean;
}

export interface ReserverSlotPublicView {
  id: string;
  startsAt: string;
  endsAt: string;
  capacity: number;
  status: ReservationSlotStatus;
  /**
   * Places restantes — comptage à DEUX TERMES, celui de `reserve_slot` :
   * réservations vivantes (confirmées ET arrivées) PLUS offres de liste
   * prioritaire encore tenues. Oublier le second ferait afficher une place
   * libre que la RPC refuse, parce qu'elle est promise à quelqu'un.
   */
  remaining: number;
  /** Fenêtre de tenue d'une place proposée ; `null` = défaut du produit. */
  waitlistOfferMinutes: number | null;
}

export interface ReserverMaReservationView {
  reservationId: string;
  slotId: string;
  code: string;
  status: ReservationStatus;
  createdAt: string;
  cancelledAt: string | null;
  checkedInAt: string | null;
}

export type ReserverPublicContext =
  | { ok: false; error: string }
  | {
      ok: true;
      activity: ReserverActivityView;
      organization: ReserverOrganization;
      /** Fuseau de l'établissement — jamais celui de l'hôte ni du navigateur. */
      timezone: string;
      slots: ReserverSlotPublicView[];
      /** Les réservations VIVANTES de ce navigateur, par créneau. */
      mesReservations: Record<string, ReserverMaReservationView>;
      /**
       * Les entrées de file VIVANTES de ce navigateur, par créneau.
       *
       * ── C'EST L'AIGUILLAGE, PAS UN ORNEMENT ──
       *
       * Un joueur qui DÉTIENT une offre vivante (`offerLive`) reçoit `full` de
       * `reserve_slot` : sa place est comptée comme tenue, et la reprendre par
       * la jauge publique la compterait deux fois. L'écran doit donc le router
       * vers `claimWaitlistOffer` — jamais vers le bouton de réservation — et
       * c'est cette entrée-là qui le lui dit.
       */
      maFile: Record<string, PublicWaitlistItem>;
      /** Ce navigateur porte-t-il déjà une identité joueur ? */
      aUneIdentite: boolean;
    };

/**
 * Contexte public d'une activité : l'activité, ses créneaux OUVERTS et À VENIR,
 * et la réservation que ce navigateur détient déjà sur chacun d'eux.
 *
 * Le comptage des places restantes est INDICATIF, et il faut le savoir : il est
 * lu hors du verrou d'avis que prend `reserve_slot`. Un créneau affiché « une
 * place » peut donc répondre `full` — c'est la RPC qui tranche, sous verrou, et
 * c'est bien elle qui doit trancher. L'affichage ne fait qu'éviter au joueur de
 * cliquer sur un créneau visiblement plein.
 */
export async function loadReserverPublicContext(
  activityId: string,
): Promise<ReserverPublicContext> {
  // ── PRESSION IP, EN PREMIER ET SANS JAMAIS REFUSER ──
  //
  // C'était le dernier chargeur public du module sans aucune mesure : la page
  // n'est pas `monitored` et aucune server action n'est appelée à l'ouverture,
  // donc une boucle de GET sur `/reserver/<uuid>` restait invisible à la
  // supervision. `observerPressionIp` est fail-OPEN par construction
  // (`observeSharedKey` ne rend rien) — l'IP est une clé PARTAGÉE derrière le
  // Wi-Fi d'un commerce, et un refus dessus serait un interrupteur qu'un tiers
  // allume (ADR-032). Règle `reserverPageIpCeiling`, motif `loyaltyOrderPageIp`.
  //
  // AVANT LA LECTURE, contrairement au précédent loyalty : l'identifiant vient
  // de l'URL, donc du client. Un balayage d'UUID inventés n'atteint jamais une
  // activité résolue — posé après, ce compteur n'en verrait rien.
  const ip = clientIpFromHeaders(await headers());
  await observerPressionIp(
    ["reserver:page:ip"],
    ip,
    RATE_LIMITS.reserverPageIpCeiling,
    "reserver_page_ip_ceiling",
  );

  const admin = createAdminClient();

  const { data: activityData } = await admin
    .from("reservation_activities")
    .select(`${ACTIVITY_COLUMNS}, organizations(${ORG_COLUMNS})`)
    .eq("id", activityId)
    .maybeSingle();
  if (!activityData) return { ok: false, error: INDISPONIBLE };

  // unsafe-cast-justification: embed PostgREST construit par gabarit, non typable
  const row = activityData as unknown as ActivityRow;
  const organization = row.organizations ?? null;
  // Garde inter-tenant : la jointure ne doit jamais rapporter une organisation
  // qui n'est pas celle de la ligne (motif loadQuizActionContext).
  if (!organization || organization.id !== row.organization_id) {
    return { ok: false, error: INDISPONIBLE };
  }
  // Organisation sans le droit `vitrine` : MÊME rendu qu'une activité
  // inexistante. Aucun oracle sur l'état commercial d'un tiers.
  if (!(await moduleOuvertAuJoueur("vitrine", organization))) {
    return { ok: false, error: INDISPONIBLE };
  }
  if (!row.active) return { ok: false, error: INDISPONIBLE };

  // Second compteur, par ACTIVITÉ cette fois — il n'a de sens qu'ici, une fois
  // l'activité résolue. Fail-open lui aussi : il nomme la page sous pression,
  // il n'en ferme aucune.
  await observerPressionIp(
    ["reserver:page:activity:ip", row.id],
    ip,
    RATE_LIMITS.reserverPageIp,
    "reserver_page_pressure",
    { activity_id: row.id },
  );

  const timezone = organization.timezone || RESERVER_FUSEAU_DEFAUT;
  const maintenant = new Date().toISOString();

  const { data: slotData } = await admin
    .from("reservation_slots")
    .select(SLOT_COLUMNS)
    .eq("organization_id", organization.id)
    .eq("activity_id", row.id)
    .eq("status", "open")
    .gt("starts_at", maintenant)
    .order("starts_at", { ascending: true })
    .limit(CRENEAUX_PUBLICS_MAX);

  // unsafe-cast-justification: embed PostgREST construit par gabarit, non typable
  const slotRows = (slotData ?? []) as unknown as SlotRow[];
  const slotIds = slotRows.map((slot) => slot.id);

  const empreinte = await lireIdentiteReserver();
  const mesReservations: Record<string, ReserverMaReservationView> = {};
  const maFile: Record<string, PublicWaitlistItem> = {};
  const vivantesParCreneau = new Map<string, number>();
  const tenuesParCreneau = new Map<string, number>();

  if (slotIds.length > 0) {
    // LES DEUX ÉTATS VIVANTS, comme le comptage de `reserve_slot` : une arrivée
    // occupe la place qu'elle honore, le check-in ne libère rien. Compter les
    // seules `confirmed` ferait afficher une place qui n'existe plus.
    const { data: vivantes } = await admin
      .from("reservations")
      .select("slot_id, status")
      .eq("organization_id", organization.id)
      .in("slot_id", slotIds)
      .in("status", ["confirmed", "checked_in"])
      .limit(RESERVATIONS_COMPTAGE_MAX);

    for (const entree of (vivantes ?? []) as Array<{ slot_id: string }>) {
      vivantesParCreneau.set(
        entree.slot_id,
        (vivantesParCreneau.get(entree.slot_id) ?? 0) + 1,
      );
    }

    // LE SECOND TERME DE LA JAUGE : les places TENUES par une offre de liste
    // prioritaire. `offer_expires_at > maintenant` reproduit le refus PARESSEUX
    // du SQL — une offre échue ne tient plus rien, même si le balayage de
    // pg_cron n'est pas encore passé, et attendre son passage gèlerait ici une
    // place que `reserve_slot` accorderait sans hésiter.
    const { data: tenues } = await admin
      .from("reservation_waitlist_entries")
      .select("slot_id, status, offer_expires_at")
      .eq("organization_id", organization.id)
      .in("slot_id", slotIds)
      .eq("status", "offered")
      .gt("offer_expires_at", maintenant)
      .limit(RESERVATIONS_COMPTAGE_MAX);

    for (const entree of (tenues ?? []) as Array<{ slot_id: string }>) {
      tenuesParCreneau.set(
        entree.slot_id,
        (tenuesParCreneau.get(entree.slot_id) ?? 0) + 1,
      );
    }

    if (empreinte) {
      const { data: miennes } = await admin
        .from("reservations")
        .select(RESERVATION_COLUMNS)
        .eq("organization_id", organization.id)
        .eq("player_key_hash", empreinte)
        .in("slot_id", slotIds)
        .in("status", ["confirmed", "checked_in"])
        .limit(CRENEAUX_PUBLICS_MAX);

      // unsafe-cast-justification: embed PostgREST construit par gabarit, non typable
      for (const brute of (miennes ?? []) as unknown as ReservationRow[]) {
        mesReservations[brute.slot_id] = {
          reservationId: brute.id,
          slotId: brute.slot_id,
          code: brute.code,
          status: asReservationStatus(brute.status),
          createdAt: brute.created_at,
          cancelledAt: brute.cancelled_at,
          checkedInAt: brute.checked_in_at,
        };
      }

      // MA FILE, PAR LA RPC ET NON PAR UNE LECTURE DE TABLE. `position` et
      // `offer_live` y sont calculés côté serveur, sous le même instantané :
      // les recomposer ici demanderait de relire toute la file de chaque
      // créneau pour compter les inscrits antérieurs, et de comparer une
      // échéance à l'horloge de ce processus. Un seul juge, et c'est le SQL.
      const { data: etatPublic } = await admin.rpc("reservation_public_state", {
        p_organization_id: organization.id,
        p_player_key_hash: empreinte,
      });
      const affichables = new Set(slotIds);
      for (const entree of mapReservationPublicState(etatPublic).waitlist) {
        if (affichables.has(entree.slotId)) maFile[entree.slotId] = entree;
      }
    }
  }

  return {
    ok: true,
    activity: {
      id: row.id,
      name: row.name,
      description: row.description,
      active: row.active,
    },
    organization,
    timezone,
    slots: slotRows.map((slot) => ({
      id: slot.id,
      startsAt: slot.starts_at,
      endsAt: slot.ends_at,
      capacity: slot.capacity,
      status: asSlotStatus(slot.status),
      remaining: Math.max(
        0,
        slot.capacity -
          (vivantesParCreneau.get(slot.id) ?? 0) -
          (tenuesParCreneau.get(slot.id) ?? 0),
      ),
      waitlistOfferMinutes: slot.waitlist_offer_minutes,
    })),
    mesReservations,
    maFile,
    aUneIdentite: Boolean(empreinte),
  };
}

// ────────────────────────────────────────────────────────────
// Contexte PUBLIC d'une invitation privée
// ────────────────────────────────────────────────────────────

export interface ReserverInvitationPublicView {
  /** L'identifiant, jamais le jeton : le clair ne redescend pas d'ici. */
  id: string;
  label: string;
  /** `true` si l'invitation vise UN créneau précis, imposé au visiteur. */
  creneauImpose: boolean;
}

export type ReserverInvitationContext =
  | { ok: false; error: string }
  | {
      ok: true;
      organizationId: string;
      organization: ReserverOrganization;
      timezone: string;
      invitation: ReserverInvitationPublicView;
      activity: ReserverActivityView;
      /** Les créneaux que CETTE invitation ouvre, et eux seuls. */
      slots: ReserverSlotPublicView[];
      mesReservations: Record<string, ReserverMaReservationView>;
      aUneIdentite: boolean;
    };

/**
 * Contexte de la page `/reserver/invitation/[jeton]`.
 *
 * ── UNE SEULE RÉPONSE POUR TOUS LES REFUS ──
 *
 * Jeton malformé, inconnu, révoqué, fermé, expiré, épuisé ; activité coupée,
 * organisation sans droit `vitrine` : `INDISPONIBLE`, mot pour mot. C'est la
 * même discipline que `redeem_invitation`, et elle ne vaut que si les DEUX
 * couches la tiennent — une page qui distinguerait « révoquée » d'« inconnue »
 * rendrait l'oracle que la RPC refuse de donner, sans même avoir à l'appeler.
 *
 * ── LE CRÉNEAU `closed` EST MONTRÉ, DÉLIBÉRÉMENT ──
 *
 * C'est le cas d'usage même de l'invitation : « j'ouvre cinq places à mes
 * habitués sur une séance fermée au public ». `draft` reste exclu — un créneau
 * en brouillon n'est pas configuré — exactement comme dans la RPC.
 */
export async function loadReserverInvitationContext(
  jetonClair: string,
): Promise<ReserverInvitationContext> {
  // PRESSION IP D'ABORD, ET SUR L'IP SEULE : un balayage de jetons inventés
  // n'atteint jamais une invitation résolue, donc un compteur posé après ne
  // verrait rien de ce trafic-là. Fail-open (ADR-032) — l'IP est partagée.
  const ip = clientIpFromHeaders(await headers());
  await observerPressionIp(
    ["reserver:page:ip"],
    ip,
    RATE_LIMITS.reserverPageIpCeiling,
    "reserver_page_ip_ceiling",
  );

  // LE CLAIR S'ARRÊTE ICI. Rien d'autre, en dessous, ne le voit.
  const empreinteJeton = hashInvitationToken(jetonClair);
  if (!empreinteJeton) return { ok: false, error: INDISPONIBLE };

  const admin = createAdminClient();

  const { data: invitationData } = await admin
    .from("reservation_invitations")
    .select(INVITATION_COLUMNS)
    .eq("token_hash", empreinteJeton)
    .maybeSingle();
  if (!invitationData) return { ok: false, error: INDISPONIBLE };

  // unsafe-cast-justification: select par gabarit de colonnes, non typable
  const invitation = invitationData as unknown as InvitationRow;

  // LES QUATRE INTERRUPTEURS, muets — ceux de `redeem_invitation`.
  if (etatUiInvitation(mapperInvitation(invitation)) !== "active") {
    return { ok: false, error: INDISPONIBLE };
  }

  const maintenant = new Date().toISOString();

  // La CIBLE : un créneau précis, ou tous ceux de l'activité visée.
  let slotRows: SlotRow[] = [];
  if (invitation.slot_id) {
    const { data } = await admin
      .from("reservation_slots")
      .select(SLOT_COLUMNS)
      .eq("organization_id", invitation.organization_id)
      .eq("id", invitation.slot_id)
      .in("status", ["open", "closed"])
      .gt("starts_at", maintenant)
      .limit(1);
    // unsafe-cast-justification: select par gabarit de colonnes, non typable
    slotRows = (data ?? []) as unknown as SlotRow[];
  } else if (invitation.activity_id) {
    const { data } = await admin
      .from("reservation_slots")
      .select(SLOT_COLUMNS)
      .eq("organization_id", invitation.organization_id)
      .eq("activity_id", invitation.activity_id)
      .in("status", ["open", "closed"])
      .gt("starts_at", maintenant)
      .order("starts_at", { ascending: true })
      .limit(CRENEAUX_PUBLICS_MAX);
    // unsafe-cast-justification: select par gabarit de colonnes, non typable
    slotRows = (data ?? []) as unknown as SlotRow[];
  }
  if (slotRows.length === 0) return { ok: false, error: INDISPONIBLE };

  // L'ACTIVITÉ vient du CRÉNEAU, pas de l'invitation : une invitation à un
  // créneau ne porte pas d'`activity_id`, et les deux doivent de toute façon
  // désigner la même (la RPC le revérifie sous verrou).
  const { data: activityData } = await admin
    .from("reservation_activities")
    .select(`${ACTIVITY_COLUMNS}, organizations(${ORG_COLUMNS})`)
    .eq("id", slotRows[0].activity_id)
    .eq("organization_id", invitation.organization_id)
    .maybeSingle();
  if (!activityData) return { ok: false, error: INDISPONIBLE };

  // unsafe-cast-justification: embed PostgREST construit par gabarit, non typable
  const activity = activityData as unknown as ActivityRow;
  const organization = activity.organizations ?? null;
  if (!organization || organization.id !== activity.organization_id) {
    return { ok: false, error: INDISPONIBLE };
  }
  if (!(await moduleOuvertAuJoueur("vitrine", organization))) {
    return { ok: false, error: INDISPONIBLE };
  }
  if (!activity.active) return { ok: false, error: INDISPONIBLE };

  // Second compteur, par ACTIVITÉ, une fois la cible résolue — et par activité
  // et non par jeton : composer une clé de seau sur une valeur choisie par
  // l'appelant ouvrirait une série neuve à chaque jeton inventé (wagon 7).
  await observerPressionIp(
    ["reserver:page:activity:ip", activity.id],
    ip,
    RATE_LIMITS.reserverPageIp,
    "reserver_page_pressure",
    { activity_id: activity.id },
  );

  const slotIds = slotRows.map((slot) => slot.id);
  const vivantesParCreneau = new Map<string, number>();
  const tenuesParCreneau = new Map<string, number>();
  const mesReservations: Record<string, ReserverMaReservationView> = {};

  const { data: vivantes } = await admin
    .from("reservations")
    .select("slot_id, status")
    .eq("organization_id", organization.id)
    .in("slot_id", slotIds)
    .in("status", ["confirmed", "checked_in"])
    .limit(RESERVATIONS_COMPTAGE_MAX);
  for (const entree of (vivantes ?? []) as Array<{ slot_id: string }>) {
    vivantesParCreneau.set(
      entree.slot_id,
      (vivantesParCreneau.get(entree.slot_id) ?? 0) + 1,
    );
  }

  const { data: tenues } = await admin
    .from("reservation_waitlist_entries")
    .select("slot_id, status, offer_expires_at")
    .eq("organization_id", organization.id)
    .in("slot_id", slotIds)
    .eq("status", "offered")
    .gt("offer_expires_at", maintenant)
    .limit(RESERVATIONS_COMPTAGE_MAX);
  for (const entree of (tenues ?? []) as Array<{ slot_id: string }>) {
    tenuesParCreneau.set(
      entree.slot_id,
      (tenuesParCreneau.get(entree.slot_id) ?? 0) + 1,
    );
  }

  const empreinte = await lireIdentiteReserver();
  if (empreinte) {
    const { data: miennes } = await admin
      .from("reservations")
      .select(RESERVATION_COLUMNS)
      .eq("organization_id", organization.id)
      .eq("player_key_hash", empreinte)
      .in("slot_id", slotIds)
      .in("status", ["confirmed", "checked_in"])
      .limit(CRENEAUX_PUBLICS_MAX);
    // unsafe-cast-justification: select par gabarit de colonnes, non typable
    for (const brute of (miennes ?? []) as unknown as ReservationRow[]) {
      mesReservations[brute.slot_id] = {
        reservationId: brute.id,
        slotId: brute.slot_id,
        code: brute.code,
        status: asReservationStatus(brute.status),
        createdAt: brute.created_at,
        cancelledAt: brute.cancelled_at,
        checkedInAt: brute.checked_in_at,
      };
    }
  }

  return {
    ok: true,
    organizationId: organization.id,
    organization,
    timezone: organization.timezone || RESERVER_FUSEAU_DEFAUT,
    invitation: {
      id: invitation.id,
      label: invitation.label,
      creneauImpose: Boolean(invitation.slot_id),
    },
    activity: {
      id: activity.id,
      name: activity.name,
      description: activity.description,
      active: activity.active,
    },
    slots: slotRows.map((slot) => ({
      id: slot.id,
      startsAt: slot.starts_at,
      endsAt: slot.ends_at,
      capacity: slot.capacity,
      status: asSlotStatus(slot.status),
      remaining: Math.max(
        0,
        slot.capacity -
          (vivantesParCreneau.get(slot.id) ?? 0) -
          (tenuesParCreneau.get(slot.id) ?? 0),
      ),
      waitlistOfferMinutes: slot.waitlist_offer_minutes,
    })),
    mesReservations,
    aUneIdentite: Boolean(empreinte),
  };
}

// ────────────────────────────────────────────────────────────
// Contexte DASHBOARD
// ────────────────────────────────────────────────────────────

export interface ReserverSlotDashboardView extends ReserverSlotPublicView {
  activityId: string;
  /** Réservations du créneau — SANS email : la colonne n'est pas dans le grant. */
  reservations: ReserverDashboardReservationView[];
  /** Vivantes (confirmées + arrivées) : ce que `reserve_slot` compte. */
  vivantes: number;
  /** Arrivées enregistrées — le seul indicateur de présence du commerçant. */
  arrivees: number;
  /** La file, dans l'ordre — SANS email, SANS empreinte (voir WAITLIST_COLUMNS). */
  waitlist: ReserverWaitlistDashboardView[];
  /** Entrées VIVANTES (`waiting` + `offered`) : combien de gens attendent. */
  enAttente: number;
  /** Places actuellement TENUES par une offre — le second terme de la jauge. */
  offresTenues: number;
}

export interface ReserverDashboardReservationView {
  reservationId: string;
  code: string;
  status: ReservationStatus;
  createdAt: string;
  cancelledAt: string | null;
  checkedInAt: string | null;
}

/**
 * Une entrée de file, vue du comptoir. Aucune donnée personnelle : ni adresse
 * (hors du grant), ni empreinte de l'appareil (dans le grant, mais c'est la clé
 * d'accès du joueur — voir `WAITLIST_COLUMNS`). Le commerçant a besoin de
 * savoir COMBIEN attendent et à quel rang, pas QUI.
 */
export interface ReserverWaitlistDashboardView {
  entryId: string;
  slotId: string;
  status: ReservationWaitlistStatus;
  /**
   * Rang parmi les entrées VIVANTES du créneau, 1 = tête.
   *
   * Recomposé ici par le MÊME ordre que le SQL — `(created_at, id)` croissant,
   * la paire départageant deux inscriptions de la même milliseconde — et non
   * lu d'une colonne : il n'en existe pas, délibérément (une colonne de rang
   * devrait être renumérotée à chaque départ, chaque conversion et chaque
   * expiration). `0` sur une entrée terminée : elle n'occupe plus de rang.
   */
  position: number;
  offeredAt: string | null;
  offerExpiresAt: string | null;
  /** Tranché SERVEUR, comme dans la RPC : une échéance passée ne tient rien. */
  offerLive: boolean;
  createdAt: string;
}

export interface ReserverInvitationDashboardView {
  id: string;
  label: string;
  /** L'une des deux est posée, jamais les deux (contrainte SQL). */
  activityId: string | null;
  slotId: string | null;
  maxUses: number;
  usedCount: number;
  expiresAt: string | null;
  closedAt: string | null;
  revokedAt: string | null;
  createdAt: string;
  etat: EtatUiInvitation;
}

export interface ReserverActivityDashboardView extends ReserverActivityView {
  createdAt: string;
  slots: ReserverSlotDashboardView[];
  /**
   * Les invitations de cette activité, celles de ses créneaux comprises.
   *
   * LE JETON N'Y EST PAS, et ne peut pas y être : la base n'en garde que
   * l'empreinte, hors du grant de lecture. Un lien perdu se révoque et se
   * recrée — c'est le contrat d'une clé d'API, écrit dans la migration.
   */
  invitations: ReserverInvitationDashboardView[];
}

/** Lecture d'une ligne d'invitation, SANS son état — que le mapper d'UI tranche. */
function mapperInvitation(
  row: InvitationRow,
): Omit<ReserverInvitationDashboardView, "etat"> {
  return {
    id: row.id,
    label: row.label,
    activityId: row.activity_id,
    slotId: row.slot_id,
    maxUses: row.max_uses,
    usedCount: row.used_count,
    expiresAt: row.expires_at,
    closedAt: row.closed_at,
    revokedAt: row.revoked_at,
    createdAt: row.created_at,
  };
}

export type ReserverDashboardContext =
  | { ok: false; reason: "unauthenticated" | "no_access" }
  | {
      ok: true;
      organizationId: string;
      timezone: string;
      activities: ReserverActivityDashboardView[];
    };

/** Plafond de lecture du panneau : 200 créneaux, 5 000 réservations. */
const CRENEAUX_DASHBOARD_MAX = 200;
const RESERVATIONS_DASHBOARD_MAX = 5_000;
/** Même ordre de grandeur pour la file et pour les invitations d'un commerce. */
const WAITLIST_DASHBOARD_MAX = 5_000;
const INVITATIONS_DASHBOARD_MAX = 500;

/**
 * Agenda du commerçant : ses activités, leurs créneaux et les réservations de
 * chaque créneau.
 *
 * Lecture par le client RLS de la SESSION (jamais le service_role) : la policy
 * `reservations: members read` sert tous les membres, caissier compris — c'est
 * son écran de comptoir. Le filtre `organization_id` explicite double la RLS
 * plutôt que de s'y fier : deux gardes valent mieux qu'une sur un panneau qui
 * liste des personnes.
 */
export async function loadReserverDashboardContext(): Promise<ReserverDashboardContext> {
  const { user, organization } = await getUserAndOrg();
  if (!user || !organization) return { ok: false, reason: "unauthenticated" };
  if (!droitEffectifModule("vitrine", organization)) {
    return { ok: false, reason: "no_access" };
  }

  const supabase = await createClient();

  const { data: activityData } = await supabase
    .from("reservation_activities")
    .select(ACTIVITY_COLUMNS)
    .eq("organization_id", organization.id)
    .order("created_at", { ascending: false });

  // unsafe-cast-justification: embed PostgREST construit par gabarit, non typable
  const activityRows = (activityData ?? []) as unknown as ActivityRow[];
  const activityIds = activityRows.map((activity) => activity.id);

  let slotRows: SlotRow[] = [];
  let reservationRows: ReservationRow[] = [];
  let waitlistRows: WaitlistRow[] = [];
  let invitationRows: InvitationRow[] = [];

  if (activityIds.length > 0) {
    const { data: slotData } = await supabase
      .from("reservation_slots")
      .select(SLOT_COLUMNS)
      .eq("organization_id", organization.id)
      .in("activity_id", activityIds)
      .order("starts_at", { ascending: true })
      .limit(CRENEAUX_DASHBOARD_MAX);
    // unsafe-cast-justification: embed PostgREST construit par gabarit, non typable
    slotRows = (slotData ?? []) as unknown as SlotRow[];
  }

  if (slotRows.length > 0) {
    const { data: reservationData } = await supabase
      .from("reservations")
      .select(RESERVATION_COLUMNS)
      .eq("organization_id", organization.id)
      .in(
        "slot_id",
        slotRows.map((slot) => slot.id),
      )
      .order("created_at", { ascending: true })
      .limit(RESERVATIONS_DASHBOARD_MAX);
    // unsafe-cast-justification: embed PostgREST construit par gabarit, non typable
    reservationRows = (reservationData ?? []) as unknown as ReservationRow[];

    // L'ORDRE DE LECTURE EST L'ORDRE DU RANG : `created_at` puis `id`, la même
    // paire que le SQL compare. Trier autrement ici — ou s'en remettre à
    // l'ordre de PostgREST — donnerait au commerçant une file dont la tête ne
    // serait pas celle à qui la place partira.
    const { data: waitlistData } = await supabase
      .from("reservation_waitlist_entries")
      .select(WAITLIST_COLUMNS)
      .eq("organization_id", organization.id)
      .in(
        "slot_id",
        slotRows.map((slot) => slot.id),
      )
      .order("created_at", { ascending: true })
      .order("id", { ascending: true })
      .limit(WAITLIST_DASHBOARD_MAX);
    // unsafe-cast-justification: select par gabarit de colonnes, non typable
    waitlistRows = (waitlistData ?? []) as unknown as WaitlistRow[];
  }

  // Les invitations sont org-scopées, pas créneau-scopées : une invitation à
  // l'échelle d'une activité n'a pas de créneau, et la filtrer par `slot_id`
  // l'aurait fait disparaître de l'écran qui sert à la révoquer.
  const { data: invitationData } = await supabase
    .from("reservation_invitations")
    .select(INVITATION_COLUMNS)
    .eq("organization_id", organization.id)
    .order("created_at", { ascending: false })
    .limit(INVITATIONS_DASHBOARD_MAX);
  // unsafe-cast-justification: select par gabarit de colonnes, non typable
  invitationRows = (invitationData ?? []) as unknown as InvitationRow[];

  const parCreneau = new Map<string, ReservationRow[]>();
  for (const reservation of reservationRows) {
    const liste = parCreneau.get(reservation.slot_id);
    if (liste) liste.push(reservation);
    else parCreneau.set(reservation.slot_id, [reservation]);
  }

  const fileParCreneau = new Map<string, WaitlistRow[]>();
  for (const entree of waitlistRows) {
    const liste = fileParCreneau.get(entree.slot_id);
    if (liste) liste.push(entree);
    else fileParCreneau.set(entree.slot_id, [entree]);
  }

  const maintenant = Date.now();

  const creneauxParActivite = new Map<string, ReserverSlotDashboardView[]>();
  for (const slot of slotRows) {
    const brutes = parCreneau.get(slot.id) ?? [];
    const reservations = brutes.map((brute) => ({
      reservationId: brute.id,
      code: brute.code,
      status: asReservationStatus(brute.status),
      createdAt: brute.created_at,
      cancelledAt: brute.cancelled_at,
      checkedInAt: brute.checked_in_at,
    }));
    const vivantes = reservations.filter(
      (reservation) =>
        reservation.status === "confirmed" || reservation.status === "checked_in",
    ).length;

    // Le rang ne se compte QUE sur les vivantes, et dans l'ordre déjà demandé à
    // la base : une entrée convertie, expirée ou partie n'occupe plus la file.
    let rang = 0;
    const waitlist = (fileParCreneau.get(slot.id) ?? []).map((entree) => {
      const status = asWaitlistStatus(entree.status);
      const vivante = status === "waiting" || status === "offered";
      if (vivante) rang += 1;
      const echeance = entree.offer_expires_at
        ? new Date(entree.offer_expires_at).getTime()
        : null;
      return {
        entryId: entree.id,
        slotId: entree.slot_id,
        status,
        position: vivante ? rang : 0,
        offeredAt: entree.offered_at,
        offerExpiresAt: entree.offer_expires_at,
        offerLive:
          status === "offered" &&
          echeance !== null &&
          Number.isFinite(echeance) &&
          echeance > maintenant,
        createdAt: entree.created_at,
      } satisfies ReserverWaitlistDashboardView;
    });

    const offresTenues = waitlist.filter((entree) => entree.offerLive).length;

    const vue: ReserverSlotDashboardView = {
      id: slot.id,
      activityId: slot.activity_id,
      startsAt: slot.starts_at,
      endsAt: slot.ends_at,
      capacity: slot.capacity,
      status: asSlotStatus(slot.status),
      // MÊME JAUGE QUE LE SQL, ses deux termes compris : une place promise à
      // quelqu'un de la file n'est pas une place libre, et l'afficher comme
      // telle ferait ouvrir au commerçant une porte que `reserve_slot` referme.
      remaining: Math.max(0, slot.capacity - vivantes - offresTenues),
      waitlistOfferMinutes: slot.waitlist_offer_minutes,
      reservations,
      vivantes,
      arrivees: reservations.filter(
        (reservation) => reservation.status === "checked_in",
      ).length,
      waitlist,
      enAttente: waitlist.filter(
        (entree) => entree.status === "waiting" || entree.status === "offered",
      ).length,
      offresTenues,
    };

    const liste = creneauxParActivite.get(slot.activity_id);
    if (liste) liste.push(vue);
    else creneauxParActivite.set(slot.activity_id, [vue]);
  }

  // Une invitation appartient à l'activité qu'elle vise — directement, ou par
  // le créneau qu'elle vise. Le second cas est le plus courant (« samedi 14 h »)
  // et l'oublier aurait laissé ces invitations sans écran.
  const activiteDuCreneau = new Map(
    slotRows.map((slot) => [slot.id, slot.activity_id]),
  );
  const invitationsParActivite = new Map<
    string,
    ReserverInvitationDashboardView[]
  >();
  const now = new Date(maintenant);
  for (const row of invitationRows) {
    const activityId =
      row.activity_id ??
      (row.slot_id ? (activiteDuCreneau.get(row.slot_id) ?? null) : null);
    // Invitation dont le créneau n'est pas dans la fenêtre lue : elle existe,
    // mais aucun écran d'activité ne la porte. On la tait plutôt que de
    // l'attribuer à une activité au hasard.
    if (!activityId) continue;
    const base = mapperInvitation(row);
    const vue: ReserverInvitationDashboardView = {
      ...base,
      etat: etatUiInvitation(base, now),
    };
    const liste = invitationsParActivite.get(activityId);
    if (liste) liste.push(vue);
    else invitationsParActivite.set(activityId, [vue]);
  }

  return {
    ok: true,
    organizationId: organization.id,
    timezone: organization.timezone || RESERVER_FUSEAU_DEFAUT,
    activities: activityRows.map((activity) => ({
      id: activity.id,
      name: activity.name,
      description: activity.description,
      active: activity.active,
      createdAt: activity.created_at,
      slots: creneauxParActivite.get(activity.id) ?? [],
      invitations: invitationsParActivite.get(activity.id) ?? [],
    })),
  };
}
