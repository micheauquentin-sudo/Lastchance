import "server-only";

import { headers } from "next/headers";
import { getUserAndOrg } from "@/lib/auth";
import { RATE_LIMITS } from "@/lib/rate-limit";
import { clientIpFromHeaders, observerPressionIp } from "@/lib/request-ip";
import { droitEffectifModule } from "@/lib/subscription";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  mapVitrineDashboardState,
  mapVitrinePublicState,
  VITRINE_PUBLIQUE_OUVERTE,
  type VitrineCarteView,
  type VitrineDashboardState,
  type VitrineIdentiteView,
  type VitrineLiensView,
  type VitrineSettingsView,
} from "@/lib/vitrine";

/**
 * VITRINE — les contextes de page (VIT-1a, lot L10).
 *
 * Motif `*-context` du dépôt : une seule fonction par écran, qui résout tout ce
 * dont le rendu a besoin et rend un état FERMÉ. Les pages ne font pas de
 * requête, et les actions ne rendent pas de page.
 */

/**
 * LES VUES SONT RÉEXPORTÉES, PAS REDÉFINIES.
 *
 * Elles vivent dans `@/lib/vitrine` — un module PUR, importable par un composant
 * client. Ce fichier-ci porte `server-only` : un composant qui importerait ses
 * types depuis ici tirerait le module serveur dans son graphe, et la garde
 * `import-sans-crypto` du dépôt existe précisément parce que ce genre de chaîne
 * ne se voit pas en revue. Les réexporter donne aux écrans l'import qu'ils
 * attendent (`@/lib/vitrine-context`) sans que rien de serveur ne descende :
 * `export type` est effacé à la compilation.
 */
export type {
  VitrineCarteView,
  VitrineFicheView,
  VitrineIdentiteView,
  VitrineLiensView,
  VitrineRubriqueView,
  VitrineSettingsView,
} from "@/lib/vitrine";

/** Un seul mot pour tous les refus publics — voir `loadVitrinePublicContext`. */
const INDISPONIBLE = "Cette vitrine n'est pas disponible.";
const NON_AUTHENTIFIE = "Session expirée, reconnectez-vous.";
const NOT_EDITOR = "Action non autorisée";
const SANS_DROIT = "Votre offre ne comprend pas la Vitrine.";

// ────────────────────────────────────────────────────────────
// LA GARDE ÉDITEUR — trois questions, dans cet ordre
// ────────────────────────────────────────────────────────────

export type GardeVitrine =
  | { ok: true; organizationId: string; userId: string }
  | { ok: false; error: string };

/**
 * La porte de tous les gestes commerçant de la Vitrine.
 *
 * MODÈLE `gardeEditeurReserver` (src/actions/reserver.ts:1265), volontairement
 * NON factorisé avec lui : les deux gardes partagent leur forme mais pas leur
 * contrat de sortie — celle de Réserver rend un fuseau horaire, dont la Vitrine
 * n'a rien à faire (aucun de ses champs n'est daté). Les fondre aurait fait
 * porter à chaque appelant un champ qu'il ignore, et à la garde une résolution
 * qu'elle ne sert à personne.
 *
 * ── LES TROIS QUESTIONS, ET POURQUOI DANS CET ORDRE ──
 *
 *  1. SESSION. `redirect("/login")` est délibérément ABSENT ici, contrairement
 *     au modèle : une garde qui redirige ne peut pas être testée sans routeur,
 *     et surtout elle décide à la place de l'appelant — une action rend un
 *     message, une page redirige. On rend donc un refus, et l'appelant choisit.
 *  2. RÔLE `owner | editor`. Le CAISSIER est exclu : une vitrine est de la
 *     CONFIGURATION, pas un écran de comptoir — c'est le même arbitrage que la
 *     policy « vitrine_settings: editors » de la migration, et le refuser ici
 *     rend un message utile plutôt qu'un 42501 de PostgREST.
 *  3. DROIT `vitrine`. REVÉRIFIÉ CÔTÉ SERVEUR même si l'écran cache déjà le
 *     formulaire : une server action reste POSTable en direct.
 *
 * ── CE QU'ELLE NE TIENT PAS ──
 *
 * Elle ne tient pas la porte, elle rend un message. La RLS (`is_org_editor` sur
 * les quatre tables), le trigger `vitrine_settings_guard_publication` et la
 * vérification d'appartenance EN SQL de `set_vitrine_slug` sont les gardes
 * réelles. Celle-ci existe pour que le commerçant lise « votre offre ne comprend
 * pas la Vitrine » plutôt qu'une erreur générique.
 */
export async function gardeEditeurVitrine(): Promise<GardeVitrine> {
  const { user, organization, role } = await getUserAndOrg();
  if (!user || !organization) return { ok: false, error: NON_AUTHENTIFIE };
  if (role !== "owner" && role !== "editor") {
    return { ok: false, error: NOT_EDITOR };
  }
  if (!droitEffectifModule("vitrine", organization)) {
    return { ok: false, error: SANS_DROIT };
  }
  return {
    ok: true,
    organizationId: organization.id,
    // L'ACTEUR des gestes audités (`set_vitrine_slug`). Il sort de la SESSION et
    // de nulle part ailleurs : la RPC le revérifie membre owner/editor en SQL,
    // et un acteur posté aurait fait de la ligne d'audit une déclaration sur
    // l'honneur.
    userId: user.id,
  };
}

// ────────────────────────────────────────────────────────────
// LE CONTEXTE PUBLIC — derrière le drapeau serveur
// ────────────────────────────────────────────────────────────

export type VitrinePublicContext =
  | { ok: false; error: string }
  | {
      ok: true;
      slug: string;
      identite: VitrineIdentiteView;
      liens: VitrineLiensView;
      cartes: VitrineCarteView[];
    };

/**
 * Ce que le visiteur du QR reçoit — ou plutôt, en L10, ce qu'il ne reçoit pas.
 *
 * ── LE DRAPEAU EST TRANCHÉ AVANT TOUTE E/S, ET C'EST LE POINT ──
 *
 * `VITRINE_PUBLIQUE_OUVERTE` est faux jusqu'à L11 (voir sa doctrine dans
 * `src/lib/vitrine.ts`). Le tester EN PREMIER — avant l'IP, avant la RPC —
 * garantit que la fonctionnalité fermée ne coûte rien et surtout n'apprend
 * rien : aucune requête ne part, donc aucun temps de réponse ne distingue un
 * slug qui existe d'un slug inventé. Un drapeau évalué après la lecture aurait
 * laissé la RPC répondre et le chronomètre parler.
 *
 * La page `/v/[slug]` le lit AUSSI, et rend `notFound()`. Les deux ne font pas
 * double emploi : la page décide du STATUT HTTP (404, indistinguable d'un slug
 * inconnu), ce chargeur décide de ce qui est LU. Un appelant futur — flux RSS,
 * export, aperçu — passera par ici sans passer par la page.
 *
 * ── UN SEUL MOT POUR TOUS LES REFUS ──
 *
 * Drapeau fermé, slug mal formé, slug inconnu, vitrine non publiée, droit
 * éteint : le même refus, exactement comme `vitrine_public_state` côté base.
 * Distinguer aurait fait de cette page un oracle — « ce commerce existe mais
 * n'a pas payé », « cette adresse est libre » — sur un point d'entrée que
 * personne n'authentifie et que tout le monde peut balayer.
 *
 * ── LA PRESSION IP EST UN COMPTEUR, JAMAIS UN REFUS ──
 *
 * `pageOpenIp` sur l'IP SEULE, consommée AVANT la lecture : le slug vient de
 * l'URL, donc du client, et une rafale qui boucle sur des adresses inventées
 * n'atteint jamais une vitrine résolue — un compteur posé après la résolution ne
 * verrait rien du balayage qu'il est censé rendre visible. Aucun second seau par
 * slug n'est posé : composer une clé de seau sur une valeur libre ouvrirait une
 * série neuve à chaque adresse inventée (wagon 7).
 */
export async function loadVitrinePublicContext(
  slug: string,
): Promise<VitrinePublicContext> {
  if (!VITRINE_PUBLIQUE_OUVERTE) return { ok: false, error: INDISPONIBLE };

  const ip = clientIpFromHeaders(await headers());
  await observerPressionIp(
    ["vitrine:page:ip"],
    ip,
    RATE_LIMITS.pageOpenIp,
    "vitrine_page_ip",
  );

  const admin = createAdminClient();
  const { data, error } = await admin.rpc("vitrine_public_state", {
    p_slug: slug,
  });
  // Rendu TEL QUEL, l'erreur comprise : aucun repli sur une lecture de table,
  // qui ne trouverait rien de plus et paierait un aller-retour à chaque adresse
  // inventée.
  const etat = error
    ? { state: "unavailable" as const }
    : mapVitrinePublicState(data);
  if (etat.state !== "ok") return { ok: false, error: INDISPONIBLE };

  return {
    ok: true,
    slug: etat.slug,
    identite: etat.identite,
    liens: etat.liens,
    cartes: etat.cartes,
  };
}

// ────────────────────────────────────────────────────────────
// LE CONTEXTE ÉDITEUR
// ────────────────────────────────────────────────────────────

export type VitrineDashboardContext =
  | { ok: false; reason: "unauthenticated" | "no_access" }
  | {
      ok: true;
      organizationId: string;
      /** Le droit `vitrine`, tel que la base le voit à cet instant. */
      moduleAccess: boolean;
      /** `null` tant qu'aucune adresse n'a été choisie — c'est un premier pas. */
      settings: VitrineSettingsView | null;
      /** TOUTES les cartes, inactives comprises, et toutes leurs fiches. */
      cartes: VitrineCarteView[];
    };

/**
 * L'état complet de la vitrine, pour l'éditeur.
 *
 * ── LA GARDE EST ICI, PARCE QUE LA RPC NE LA FAIT PAS ──
 *
 * `vitrine_dashboard_state` est `security definer` / `service_role` et
 * n'interroge AUCUNE appartenance : elle rend l'état de l'organisation qu'on lui
 * nomme, point. Sa sûreté repose donc entièrement sur le fait que ce chargeur
 * lui passe l'organisation de la SESSION — et jamais un paramètre venu du
 * navigateur. Son en-tête le dit en toutes lettres (« la garde est dans l'action
 * serveur »), et c'est ce fichier-ci qui la tient.
 *
 * Le rôle est le second tour de clé, motif `loadStockOffersDashboardContext` :
 * il ne change rien tant que l'invariant tient, et il évite qu'une fuite
 * inter-locataire soit à un paramètre de distance le jour où quelqu'un croit
 * bien faire en rendant l'organisation configurable.
 *
 * ── LE DROIT REFUSE LA LECTURE, PAS L'ÉCRAN ──
 *
 * `no_access` sans le droit `vitrine` : le catalogue n'est pas lu. L'ÉCRAN, lui,
 * reste servi — `capacitesDuModule` décide de ce qu'il montre, et découvrir sans
 * abonnement est un choix produit assumé. Les deux verdicts sont distincts et
 * doivent le rester : celui-ci dit ce qu'on LIT, l'autre ce qu'on MONTRE.
 */
export async function loadVitrineDashboardContext(): Promise<VitrineDashboardContext> {
  const { user, organization, role } = await getUserAndOrg();
  if (!user || !organization) return { ok: false, reason: "unauthenticated" };
  if (role !== "owner" && role !== "editor") {
    return { ok: false, reason: "no_access" };
  }
  if (!droitEffectifModule("vitrine", organization)) {
    return { ok: false, reason: "no_access" };
  }

  const admin = createAdminClient();
  const { data, error } = await admin.rpc("vitrine_dashboard_state", {
    // DE LA SESSION. Jamais d'un paramètre de requête — voir ci-dessus.
    p_organization_id: organization.id,
  });

  // Une panne de lecture rend un état VIDE plutôt qu'un refus de droit : le
  // commerçant a le droit, il n'a simplement rien à afficher pour l'instant.
  // Confondre les deux lui ferait croire que son abonnement a changé.
  const etat: VitrineDashboardState = error
    ? { state: "unavailable" }
    : mapVitrineDashboardState(data);

  return {
    ok: true,
    organizationId: organization.id,
    // `module_access` vient de la RPC quand elle a répondu, et du droit déjà
    // résolu ci-dessus sinon : les deux disent la même chose, et le second est
    // celui qui a laissé passer l'appel.
    moduleAccess: etat.state === "ok" ? etat.module_access : true,
    settings: etat.state === "ok" ? etat.settings : null,
    cartes: etat.state === "ok" ? etat.cartes : [],
  };
}
