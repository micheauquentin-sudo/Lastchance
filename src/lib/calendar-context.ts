import "server-only";

import { cookies } from "next/headers";
import { mapCalendarPublicState, type CalendarPublicState } from "@/lib/calendar";
import { recordCounter } from "@/lib/monitoring";
import {
  lookupLegacyIdentityHashes,
  peekPlayerDeviceTokenHash,
} from "@/lib/player-identity";
import { hashPlayerToken } from "@/lib/pronostics";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Organization } from "@/types/database";
import { moduleOuvertAuJoueur } from "@/lib/module-acces-public";

/** Erreur générique unique : aucun oracle sur l'existence/l'état interne. */
const UNAVAILABLE = "Ce calendrier n'est pas disponible.";

/** UUID canonique (pour distinguer un id d'un public_slug à la résolution). */
const UUID_PATTERN =
  /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

/** Nom du cookie httpOnly portant le jeton joueur d'un CALENDRIER. */
export function calendarTokenCookieName(calendarId: string): string {
  return `lc-calendar-${calendarId}`;
}

/** Le joueur du calendrier — jamais son porteur haché, jamais un `*`. */
export interface JoueurCalendrier {
  id: string;
  opened_count: number;
}

/**
 * L'identité du calendrier pour CE visiteur : l'empreinte de module retenue, et
 * le joueur qu'elle désigne s'il en existe un. Le module cesse ainsi de
 * promener un hachage nu — un `string | undefined` ne dit ni d'où il vient, ni
 * s'il désigne réellement quelqu'un.
 */
export interface IdentiteCalendrier {
  /**
   * L'empreinte `calendar_players.token_hash` retenue — celle du cookie du
   * module, ou celle rattrapée par l'identité globale. `null` quand ce
   * navigateur n'a ni cookie de calendrier ni empreinte historique connue.
   */
  tokenHash: string | null;
  joueur: JoueurCalendrier | null;
  /** Un cookie de module est posé, qu'il désigne un joueur ou non. */
  cookiePose: boolean;
}

/**
 * L'ORDRE DE RÉSOLUTION DE L'IDENTITÉ DU CALENDRIER (ID-6) — le cookie du
 * module d'abord, l'identité globale ensuite.
 *
 * ── CE QUE ÇA RÉPARE ──
 *
 * Le calendrier ne connaissait qu'un seul chemin : `lc-calendar-<calendarId>`.
 * Ce cookie effacé — nettoyage du navigateur, mode privé refermé, téléphone
 * changé de main — le joueur retrouvait une grille entièrement REFERMÉE, et les
 * codes `CADEAU-` déjà gagnés disparaissaient de sa vue au beau milieu de
 * décembre. Rien n'était pourtant perdu en base : son appareil est connu de
 * `players`, et l'empreinte de son ancien cookie est conservée dans
 * `player_legacy_identities` par le pont `calendar` que les actions du module
 * posent. Il ne manquait que l'appel.
 *
 * ── L'ORDRE, ET POURQUOI IL EST DANS CE SENS ──
 *
 *  1. Le cookie du module, TOUJOURS EN PREMIER dès qu'il désigne un joueur.
 *     C'est le chemin qui porte les cases ouvertes et celui que toute la
 *     production emprunte aujourd'hui : personne ne doit changer d'identité en
 *     silence le jour du déploiement.
 *  2. Absent, ou présent mais ne désignant AUCUN joueur : on retombe sur
 *     l'identité globale. Le second cas n'a RIEN de théorique ici —
 *     `resolveCalendarIdentity` (actions) pose un cookie neuf dès la PREMIÈRE
 *     tentative d'ouverture, même quand elle échoue. Un revenant au cookie
 *     effacé qui touche d'abord une case future repart donc avec un cookie tout
 *     neuf, qui ne désigne personne : sans ce second étage, il resterait un
 *     inconnu pour toujours.
 *  3. Un visiteur neuf ne trouve rien nulle part et repart sans identité,
 *     exactement comme avant : c'est sa première ouverture qui lui en ouvrira
 *     une, avec le pont posé du même geste.
 *
 * ── C'EST UN ORDRE, PAS UN REMPLACEMENT ──
 *
 * ADR-041 : le double chemin existe pour pouvoir déployer, observer et revenir
 * en arrière « sans supprimer ni réinterpréter une progression existante ». Le
 * cookie de module n'est donc ni supprimé, ni cessé d'être écrit, ni relégué —
 * il reste lu en premier, et `open_calendar_box` continue d'écrire sous son
 * empreinte. Ce lot AJOUTE un second essai ; il n'en retire aucun. Inverser ces
 * deux étages ferait changer d'identité, en silence, tous les joueurs au cookie
 * valable le jour du déploiement.
 *
 * ── LE PIÈGE DU HACHAGE, QUI NE LÈVERAIT AUCUNE ERREUR ──
 *
 * `calendar_players.token_hash` est une empreinte DE MODULE : un SHA-256 NU du
 * cookie du calendrier (`hashPlayerToken`). L'empreinte de l'identité globale
 * est SALÉE ET VERSIONNÉE (`hashPlayerDeviceToken`, `player-device:v1`). Les
 * substituer ne lèverait rien du tout — les deux rendent 64 hexadécimaux et
 * passent le même motif ; la requête ne trouverait simplement plus personne,
 * partout, sans une ligne de journal. C'est pourquoi l'empreinte globale n'entre
 * JAMAIS dans un filtre `calendar_players` : elle sert à demander au pont
 * QUELLES empreintes de module appartiennent à cet appareil, et ce sont ces
 * empreintes-là, et elles seules, qui sont filtrées.
 *
 * ── LA PORTÉE N'EST PAS ÉLARGIE D'UN POUCE ──
 *
 * La RPC de reprise part de `player_devices.token_hash` et ne rend que les
 * empreintes d'une adhésion du MÊME joueur, sur la MÊME organisation et la MÊME
 * expérience — ici le calendrier lui-même. Le `in (…)` conserve en plus le
 * filtre `calendar_id`, exactement comme le chemin du cookie. Le calendrier
 * voisin, même chez le même commerçant, reste donc invisible.
 *
 * ── TOUTE PANNE REND L'ÉTAT D'AVANT ──
 *
 * Pas de cookie global, aucune empreinte historique, lecture en panne : on rend
 * ce que le chemin du cookie avait trouvé. Ce repli ne peut qu'AJOUTER un
 * joueur, jamais en retirer un, et jamais faire échouer une page qui
 * s'affichait déjà.
 */
export async function resoudreIdentiteCalendrier(
  admin: ReturnType<typeof createAdminClient>,
  calendarId: string,
  organizationId: string,
): Promise<IdentiteCalendrier> {
  const store = await cookies();
  const token = store.get(calendarTokenCookieName(calendarId))?.value;
  const empreinteCookie = token ? hashPlayerToken(token) : null;

  if (empreinteCookie) {
    const { data } = await admin
      .from("calendar_players")
      .select("id, opened_count")
      .eq("calendar_id", calendarId)
      .eq("token_hash", empreinteCookie)
      .maybeSingle();
    if (data) {
      return { tokenHash: empreinteCookie, joueur: data, cookiePose: true };
    }
  }

  const vide: IdentiteCalendrier = {
    tokenHash: empreinteCookie,
    joueur: null,
    cookiePose: empreinteCookie !== null,
  };

  // L'empreinte globale se LIT sans jamais poser de cookie : afficher une page
  // ne doit pas fabriquer d'identité (même règle que `/portefeuille`).
  const empreinteAppareil = await peekPlayerDeviceTokenHash();
  if (!empreinteAppareil) return vide;

  const anciennes = await lookupLegacyIdentityHashes({
    deviceTokenHash: empreinteAppareil,
    organizationId,
    experienceKind: "calendar",
    experienceId: calendarId,
  });
  if (anciennes.length === 0) return vide;

  // UNE requête pour toutes les empreintes, jamais une par empreinte : ce repli
  // est rare, il ne doit pas coûter N allers-retours le jour où il sert.
  const { data, error } = await admin
    .from("calendar_players")
    .select("id, token_hash, opened_count")
    .eq("calendar_id", calendarId)
    .in("token_hash", anciennes);
  if (error) return vide;

  const parEmpreinte = new Map<string, JoueurCalendrier>();
  for (const ligne of data ?? []) {
    if (!ligne?.token_hash) continue;
    const { token_hash: _empreinte, ...joueur } = ligne;
    void _empreinte;
    parEmpreinte.set(ligne.token_hash, joueur);
  }

  // L'ORDRE DE LA RPC DÉCIDE, pas celui que la base a rendu : `anciennes` est
  // trié de la plus récemment vue à la plus ancienne. Un joueur qui a changé
  // deux fois de cookie retrouve donc sa grille la plus RÉCENTE, et non celle
  // que le planificateur a sortie en premier.
  for (const ancienne of anciennes) {
    const joueur = parEmpreinte.get(ancienne);
    if (!joueur) continue;
    // ZÉRO EST LA VALEUR ATTENDUE tant que personne n'a perdu son cookie ; une
    // population non nulle dit combien de joueurs auraient retrouvé une grille
    // refermée et des codes `CADEAU-` évaporés.
    recordCounter("calendar.repli_identite_globale");
    return { tokenHash: ancienne, joueur, cookiePose: vide.cookiePose };
  }
  return vide;
}

type PublicCalendarOrganization = Pick<
  Organization,
  | "id"
  | "name"
  | "logo_url"
  | "subscription_status"
  | "trial_ends_at"
  | "past_due_since"
  | "addon_calendar"
  | "comp_access"
  | "comp_access_until"
  | "timezone"
>;

const ORG_COLUMNS =
  "id, name, logo_url, subscription_status, trial_ends_at, past_due_since, addon_calendar, comp_access, comp_access_until, timezone";

const CALENDAR_COLUMNS =
  "id, organization_id, status, public_slug, fond_key";

interface CalendarRow {
  id: string;
  organization_id: string;
  status: string;
  public_slug: string;
  fond_key: string | null;
  organizations: PublicCalendarOrganization | null;
}

export type CalendarPublicContext =
  | { ok: false; error: string }
  | {
      ok: true;
      calendarId: string;
      publicSlug: string;
      organization: PublicCalendarOrganization;
      /** État public complet (déjà filtré : aucun contenu de case non ouverte). */
      publicState: CalendarPublicState;
      /**
       * Réglage BRUT du fond d'écran, tel qu'il est en base : `null` (suivre
       * le thème), `"aucun"`, ou une clé. Il n'est pas résolu ici — la page
       * seule connaît le fond du thème qui sert de repli (`fondChoisi`).
       */
      fondKey: string | null;
      /**
       * Le visiteur a-t-il déjà une identité de joueur sur ce calendrier ?
       * Vrai dès que `resoudreIdentiteCalendrier` a retenu une empreinte —
       * celle du cookie, ou celle rattrapée par l'identité globale.
       */
      hasIdentity: boolean;
    };

/**
 * Résout un calendrier par son UUID ou son public_slug (service role + garde
 * inter-tenant), vérifie le module + l'abonnement + le statut actif, puis charge
 * l'état public via calendar_public_state. Identité cookie PAR CALENDRIER en
 * LECTURE SEULE : rien n'est posé ici (le cookie est écrit par les actions
 * join/open) ; s'il existe, son hash alimente la vue « moi » (cases ouvertes,
 * codes) sans jamais quitter le serveur. Réponse générique unique en cas
 * d'invalidité (404 côté page) — pas d'oracle.
 */
export async function loadCalendarPublicContext(
  slugOrId: string,
): Promise<CalendarPublicContext> {
  const admin = createAdminClient();

  const query = admin
    .from("calendars")
    .select(`${CALENDAR_COLUMNS}, organizations(${ORG_COLUMNS})`);
  const { data } = UUID_PATTERN.test(slugOrId)
    ? await query.eq("id", slugOrId).maybeSingle()
    : await query.eq("public_slug", slugOrId.toLowerCase()).maybeSingle();
  if (!data) return { ok: false, error: UNAVAILABLE };

  const row = data as unknown as CalendarRow;
  const org = row.organizations;
  // La service role contourne la RLS : chaque relation doit pointer le même
  // tenant, sinon on refuse (incohérence = 404 générique).
  if (!org || org.id !== row.organization_id) {
    console.error("[calendar-context] organisation incohérente", { slugOrId });
    return { ok: false, error: UNAVAILABLE };
  }
  if (!await moduleOuvertAuJoueur("calendar", org)) return { ok: false, error: UNAVAILABLE };
  if (row.status !== "active") return { ok: false, error: UNAVAILABLE };

  // L'IDENTITÉ EST RÉSOLUE UNE SEULE FOIS, ICI (cookie du calendrier d'abord,
  // identité globale en repli). Lecture seule : rien n'est posé — ni le jeton
  // ni son hash ne quittent le serveur.
  const identite = await resoudreIdentiteCalendrier(
    admin,
    row.id,
    row.organization_id,
  );

  const { data: stateRaw, error } = await admin.rpc("calendar_public_state", {
    p_calendar_id: row.id,
    // `undefined` et NON `null` quand il n'y a personne : la RPC ne doit pas
    // chercher un joueur d'empreinte vide, dont les cases « ouvertes »
    // reviendraient au premier visiteur venu.
    p_player_token_hash: identite.tokenHash ?? undefined,
  });
  if (error) {
    console.error("[calendar-context] public state", error.message);
    return { ok: false, error: UNAVAILABLE };
  }

  const publicState = mapCalendarPublicState(stateRaw);
  if (publicState.state !== "ok") return { ok: false, error: UNAVAILABLE };

  return {
    ok: true,
    calendarId: row.id,
    publicSlug: row.public_slug,
    organization: org,
    publicState,
    fondKey: row.fond_key ?? null,
    hasIdentity: identite.tokenHash !== null,
  };
}

export type CalendarActionContext =
  | { ok: false }
  | {
      ok: true;
      admin: ReturnType<typeof createAdminClient>;
      calendarId: string;
      organizationId: string;
    };

/**
 * Contexte MINIMAL d'une action publique (open / consume / getState) : calendrier
 * résolu par son UUID, module + statut vérifiés côté service role, rien de plus.
 * Une seule requête (calendrier + organisation) précède l'appel RPC — pas
 * d'amplification de lecture sur un chemin ouvert à Internet (miroir
 * loadEventActionContext). Module coupé, calendrier inexistant, non actif →
 * échec générique sans oracle.
 */
export async function loadCalendarActionContext(
  calendarId: string,
): Promise<CalendarActionContext> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("calendars")
    .select(`${CALENDAR_COLUMNS}, organizations(${ORG_COLUMNS})`)
    .eq("id", calendarId)
    .maybeSingle();
  if (!data) return { ok: false };

  const row = data as unknown as CalendarRow;
  const org = row.organizations;
  if (!org || org.id !== row.organization_id) return { ok: false };
  if (!await moduleOuvertAuJoueur("calendar", org)) return { ok: false };
  if (row.status !== "active") return { ok: false };

  return { ok: true, admin, calendarId: row.id, organizationId: row.organization_id };
}
