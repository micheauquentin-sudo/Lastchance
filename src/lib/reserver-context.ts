import "server-only";

import { cookies } from "next/headers";
import { getUserAndOrg } from "@/lib/auth";
import { moduleOuvertAuJoueur } from "@/lib/module-acces-public";
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
  RESERVER_FUSEAU_DEFAUT,
  type ReservationStatus,
  type ReservationSlotStatus,
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
  "id, organization_id, activity_id, starts_at, ends_at, capacity, status";

/** `email` EST ABSENT, et c'est le point : il n'existe que pour l'envoi serveur. */
const RESERVATION_COLUMNS =
  "id, slot_id, organization_id, code, status, created_at, cancelled_at, checked_in_at, checked_in_by";

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
  /** Places restantes, déduites des lignes VIVANTES (confirmées ET arrivées). */
  remaining: number;
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
  const admin = createAdminClient();

  const { data: activityData } = await admin
    .from("reservation_activities")
    .select(`${ACTIVITY_COLUMNS}, organizations(${ORG_COLUMNS})`)
    .eq("id", activityId)
    .maybeSingle();
  if (!activityData) return { ok: false, error: INDISPONIBLE };

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

  const slotRows = (slotData ?? []) as unknown as SlotRow[];
  const slotIds = slotRows.map((slot) => slot.id);

  const empreinte = await lireIdentiteReserver();
  const mesReservations: Record<string, ReserverMaReservationView> = {};
  const vivantesParCreneau = new Map<string, number>();

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

    if (empreinte) {
      const { data: miennes } = await admin
        .from("reservations")
        .select(RESERVATION_COLUMNS)
        .eq("organization_id", organization.id)
        .eq("player_key_hash", empreinte)
        .in("slot_id", slotIds)
        .in("status", ["confirmed", "checked_in"])
        .limit(CRENEAUX_PUBLICS_MAX);

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
        slot.capacity - (vivantesParCreneau.get(slot.id) ?? 0),
      ),
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
}

export interface ReserverDashboardReservationView {
  reservationId: string;
  code: string;
  status: ReservationStatus;
  createdAt: string;
  cancelledAt: string | null;
  checkedInAt: string | null;
}

export interface ReserverActivityDashboardView extends ReserverActivityView {
  createdAt: string;
  slots: ReserverSlotDashboardView[];
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

  const activityRows = (activityData ?? []) as unknown as ActivityRow[];
  const activityIds = activityRows.map((activity) => activity.id);

  let slotRows: SlotRow[] = [];
  let reservationRows: ReservationRow[] = [];

  if (activityIds.length > 0) {
    const { data: slotData } = await supabase
      .from("reservation_slots")
      .select(SLOT_COLUMNS)
      .eq("organization_id", organization.id)
      .in("activity_id", activityIds)
      .order("starts_at", { ascending: true })
      .limit(CRENEAUX_DASHBOARD_MAX);
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
    reservationRows = (reservationData ?? []) as unknown as ReservationRow[];
  }

  const parCreneau = new Map<string, ReservationRow[]>();
  for (const reservation of reservationRows) {
    const liste = parCreneau.get(reservation.slot_id);
    if (liste) liste.push(reservation);
    else parCreneau.set(reservation.slot_id, [reservation]);
  }

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

    const vue: ReserverSlotDashboardView = {
      id: slot.id,
      activityId: slot.activity_id,
      startsAt: slot.starts_at,
      endsAt: slot.ends_at,
      capacity: slot.capacity,
      status: asSlotStatus(slot.status),
      remaining: Math.max(0, slot.capacity - vivantes),
      reservations,
      vivantes,
      arrivees: reservations.filter(
        (reservation) => reservation.status === "checked_in",
      ).length,
    };

    const liste = creneauxParActivite.get(slot.activity_id);
    if (liste) liste.push(vue);
    else creneauxParActivite.set(slot.activity_id, [vue]);
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
    })),
  };
}
