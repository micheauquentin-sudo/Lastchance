import { ADDON_OFFERS, ADDONS_STANDALONE } from "@/lib/plans";
import type { Organization, SubscriptionStatus } from "@/types/database";

/**
 * Les treize modules qui peuvent porter un octroi daté. Miroir du `check` de
 * `organization_module_grants.module` et du `if not in` de
 * `org_has_module_access` — les trois listes sont comparées entre elles par
 * `supabase/tests/module_grants.test.sql`, dans le catalogue vivant.
 */
export const GRANTABLE_MODULES = [
  "wheel",
  "hunts",
  "calendar",
  "loyalty",
  "quiz",
  "jackpot",
  "events",
  "referral",
  "pronostics",
  /**
   * Vitrine & Réserver (lot L2, migration 20261001120000). Octroyable comme
   * les autres — c'est ce qui la rend accordable depuis le back-office, dont
   * le formulaire dérive sa liste d'ici — mais elle n'a NI ressource
   * publiable, NI offre au catalogue : les gardes qui énumèrent l'une ou
   * l'autre l'exemptent nommément plutôt que par un vide.
   *
   * Elle porte en revanche sa colonne `addon_vitrine`, comme les huit add-ons
   * vendus : c'est une OFFRE DISTINCTE, jamais incluse dans l'abonnement
   * (décision propriétaire du 2026-08-19). « Pas d'offre au catalogue » et
   * « pas d'addon » sont deux choses, et elles ne se déduisent pas l'une de
   * l'autre : la première dit qu'on ne peut pas encore l'acheter en ligne, la
   * seconde dirait que tout abonné l'a déjà.
   */
  "vitrine",
  /**
   * LES TROIS PRODUITS QUE `vitrine` OUVRAIT SANS ÊTRE EUX (migration
   * 20261020120000). Une clé pour quatre produits n'était pas une économie :
   * accorder une vitrine accordait aussi l'agenda Réserver, le Duo Miroir et
   * le Portrait de la Bande, et refuser l'un obligeait à refuser les quatre.
   * L'opérateur du back-office n'avait aucun moyen de vendre l'agenda seul.
   *
   * Elles se lisent EXACTEMENT comme `vitrine` ci-dessus : octroyables,
   * porteuses de leur colonne `addon_*`, sans offre au catalogue et sans
   * ressource publiable — les gardes qui énumèrent l'une ou l'autre les
   * exemptent nommément.
   *
   * Aucun droit n'a été retiré à personne au passage : la migration a
   * recopié, aux mêmes bornes, les octrois `vitrine` existants sur les trois
   * clés (`mirror_vitrine_entitlements`).
   */
  "reserver",
  /**
   * LA PRISE DE RENDEZ-VOUS, détachée de `reserver` par RDV-5 (migration
   * 20261107120000, `addon_rendez_vous`).
   *
   * `reserver` GARDE SON SENS — les Moments : ateliers, dégustations,
   * files d'accueil, invitations, offres. Seul son libellé a changé. Faire
   * suivre la clé au nom aurait exigé de recopier les octrois déjà posés
   * sur une clé neuve, sous peine de retirer l'accès à qui l'utilise déjà.
   *
   * Elle se lit comme les quatre au-dessus : octroyable, porteuse de sa
   * colonne, sans ressource publiable — mais elle a, elle, une OFFRE au
   * catalogue (20 €), ce qui la distingue de `vitrine` et consorts.
   */
  "rendez_vous",
  "duo",
  "bande",
] as const;

/**
 * Le type est DÉRIVÉ de la liste, et non écrit à côté d'elle : les deux ne
 * peuvent donc pas diverger. Ce module n'importe que des types et le catalogue
 * PUR `@/lib/plans` (aucun `server-only`, aucun accès env), il est lisible
 * depuis un composant client — c'est pourquoi la liste vit ici et non dans
 * `validations/admin`, dont la chaîne d'imports atteint `@/lib/supabase/admin`
 * et ferait entrer du code serveur dans le bundle. (Le build l'a refusé, ce
 * n'est pas une précaution théorique.)
 */
export type GrantableModule = (typeof GRANTABLE_MODULES)[number];

type OrgAccessFields = Pick<
  Organization,
  | "subscription_status"
  | "trial_ends_at"
  | "past_due_since"
  | "comp_access"
  | "comp_access_until"
> & {
  /**
   * Modules portant un octroi daté VIVANT (démarré, non échu, non révoqué),
   * tel que le rend `org_has_live_module_grant` côté SQL.
   *
   * OPTIONNEL, ET C'EST LE POINT : ce champ est ajouté au type plutôt qu'un
   * paramètre à chacune des fonctions ci-dessous. Une signature élargie aurait
   * obligé à toucher les quelque quatre-vingts appelants pour qu'ils passent
   * une valeur qu'aucun d'eux ne connaît encore. Absent ou vide, il rend le
   * comportement STRICTEMENT identique à celui d'avant le lot 2 : c'est ce qui
   * rend la bascule sûre, chaque appelant gagnant la connaissance des octrois
   * le jour où son chargeur la lui fournit, et pas avant.
   *
   * Le revers est réel et se lit ici : un appelant qui ne renseigne pas ce
   * champ refusera un droit que la base accorde. Le sens de l'erreur est
   * délibéré — on dégrade vers le refus, jamais vers l'octroi.
   */
  live_module_grants?: readonly GrantableModule[] | null;
};

/**
 * Un octroi vivant couvre-t-il CE module ? Port de
 * `org_has_live_module_grant` (migration 20260907120000).
 */
export function hasLiveModuleGrant(
  org: Pick<OrgAccessFields, "live_module_grants">,
  module: GrantableModule,
): boolean {
  return (org.live_module_grants ?? []).includes(module);
}

const MS_PER_DAY = 86_400_000;

/**
 * Accès offert en cours ? Accordé manuellement depuis le back-office
 * (premium sans paiement) : actif tant que `comp_access` est vrai et,
 * s'il est daté, que `comp_access_until` n'est pas dépassé.
 */
export function hasCompAccess(
  org: Pick<Organization, "comp_access" | "comp_access_until">,
  now = new Date(),
): boolean {
  if (!org.comp_access) return false;
  if (!org.comp_access_until) return true;
  return new Date(org.comp_access_until).getTime() > now.getTime();
}

/**
 * Délai de grâce sur un impayé : Stripe relance la carte pendant
 * plusieurs jours (dunning, ~2 semaines par défaut) et notifie la fin
 * réelle de l'abonnement (canceled/unpaid) par webhook. Pendant cette
 * fenêtre, couper le jeu du commerçant pour une carte expirée serait
 * disproportionné. La borne applicative garantit la coupure même si le
 * webhook final n'arrivait jamais.
 */
export const PAST_DUE_GRACE_DAYS = 14;

/**
 * Marge après `trial_ends_at` avant que le cron `expire-trials` ne bascule un
 * essai jamais converti en `canceled`.
 *
 * TROIS JOURS, et ce chiffre n'est pas arbitraire : c'est la durée pendant
 * laquelle Stripe réessaie un webhook dont l'endpoint répond mal. Une panne
 * COMPLÈTE de notre réception d'événements se rattrape donc à l'intérieur de
 * la fenêtre, et l'abonnement souscrit la veille de l'expiration est annoncé
 * avant qu'on ne touche au statut. Le décalage d'horloge entre Vercel,
 * Postgres et Stripe se compte en secondes : il est couvert mille fois.
 *
 * Ce délai n'est PAS ce qui protège du faux positif — c'est
 * `hasLiveStripeSubscription`, interrogé avant chaque bascule, qui le fait.
 * La marge n'est que la seconde couche : elle évite d'aller déranger Stripe
 * pour des comptes dont l'essai vient tout juste de finir.
 *
 * Aucun accès n'en dépend : `hasActiveAccess` coupe à `trial_ends_at`, pas
 * ici. Allonger ce délai laisse le statut mentir plus longtemps, il ne prête
 * rien à personne.
 */
export const TRIAL_EXPIRY_GRACE_DAYS = 3;

/**
 * L'organisation a-t-elle un accès complet (roues publiques jouables,
 * campagnes activables) ?
 * - abonnement Stripe actif → oui
 * - essai en cours (statut trialing, trial_ends_at non dépassé) → oui
 * - impayé (past_due) → oui pendant le délai de grâce, non au-delà
 * - essai expiré ou abonnement annulé → non : le commerçant garde son
 *   dashboard et peut créer des QR codes, mais ne peut plus activer de
 *   campagne et ses roues publiques sont désactivées.
 * - octroi daté vivant d'un module QUI A UN PRIX → oui (voir
 *   `MODULES_PORTANT_LE_SOCLE`). Un octroi gratuit de bêta, non.
 */
export function hasActiveAccess(org: OrgAccessFields, now = new Date()): boolean {
  // BRANCHE NEUVE (lot 2, migration 20260907120000) : un octroi daté vivant
  // porte le socle commun avec lui. C'est « tout add-on peut être acheté seul :
  // il embarque les briques communes » (docs/codex-handoff.md §2). Le OU est le
  // point : l'octroi ne remplace pas l'abonnement, il devient une seconde source
  // du même droit.
  //
  // BORNÉE AUX MODULES QUI ONT UN PRIX (revue L2, MOYEN-2) : un octroi bêta
  // gratuit — `vitrine` s'accorde ainsi au back-office — n'achète pas le socle.
  // Voir `MODULES_PORTANT_LE_SOCLE`, dérivée et non écrite.
  //
  // La PAUSE À L'ÉCHÉANCE opère ici par ABSENCE : passé sa fin, l'octroi ne
  // figure plus dans `live_module_grants`, cette branche cesse de répondre et
  // le socle retombe sur l'abonnement — qui refusera s'il n'y en a pas. Aucune
  // écriture, donc aucune prolongation possible par panne.
  if ((org.live_module_grants ?? []).some((m) => MODULES_PORTANT_LE_SOCLE.has(m))) {
    return true;
  }
  return hasSubscriptionAccess(org, now);
}

/**
 * L'ORGANISATION A-T-ELLE UNE OFFRE VIVANTE ? Port de
 * `org_has_subscription_access` (migration 20260925120000).
 *
 * ── POURQUOI CETTE FONCTION EXISTE, ET CE QU'ELLE RÉPARE ──
 *
 * `hasActiveAccess` répond « ce commerçant a-t-il un droit payant QUELCONQUE ? »
 * — octroi de module compris. C'est la bonne question pour le socle, ce n'était
 * pas la bonne pour un module : jusqu'au 2026-08-16, un pass Chasse à 29 € y
 * répondait vrai, donc ouvrait la roue et les campagnes, c'est-à-dire l'offre
 * mensuelle qu'il coûte (SD-4). La décision produit du 2026-08-04 est explicite :
 * « un pass n'ouvre QUE son module ».
 *
 * Le corps ci-dessous est celui de `hasActiveAccess` MOINS sa branche d'octrois,
 * et `hasActiveAccess` l'appelle désormais plutôt que de le recopier — exactement
 * le partage que la migration a fait côté SQL, où `org_has_active_access` appelle
 * `org_has_subscription_access`. Deux écritures d'une même règle de grâce, c'est
 * deux règles qui divergeront.
 *
 * ── CE QU'ELLE NE REGARDE PAS, ET C'EST SA RAISON D'ÊTRE ──
 *
 * `live_module_grants`. Un appelant qui veut « un droit payant quelconque »
 * doit garder `hasActiveAccess` ; celui qui décide d'un MODULE passe par
 * `droitEffectifModule`, qui interroge l'octroi de CE module en premier puis
 * cette fonction. La parité des deux est gardée par
 * `supabase/tests/access_parity.test.sql` et `src/lib/subscription.test.ts`.
 */
export function hasSubscriptionAccess(
  org: Omit<OrgAccessFields, "live_module_grants">,
  now = new Date(),
): boolean {
  // Accès offert par le back-office : prime sur l'état Stripe.
  if (hasCompAccess(org, now)) return true;
  if (org.subscription_status === "active") return true;
  if (org.subscription_status === "past_due") {
    const graceEnd = pastDueGraceEndsAt(org);
    // past_due_since absent = transition en cours (le webhook la date) :
    // on ne coupe pas sur un état incomplet.
    return graceEnd === null || graceEnd.getTime() > now.getTime();
  }
  if (org.subscription_status !== "trialing") return false;
  return new Date(org.trial_ends_at).getTime() > now.getTime();
}

/** Fin du délai de grâce d'un impayé, null hors impayé daté. */
export function pastDueGraceEndsAt(org: OrgAccessFields): Date | null {
  if (org.subscription_status !== "past_due" || !org.past_due_since) {
    return null;
  }
  return new Date(
    new Date(org.past_due_since).getTime() + PAST_DUE_GRACE_DAYS * MS_PER_DAY,
  );
}

/**
 * Quelle colonne `addon_*` conditionne chaque module, et `null` quand aucune
 * ne le fait. Miroir du `case p_module` de `org_has_module_access`
 * (migration 20260907120000) — les deux tables sont comparées ligne à ligne
 * par `src/lib/module-access-parity.test.ts`, qui LIT la migration.
 *
 * `wheel` est à `null` et ce n'est pas un oubli : la roue est le produit de
 * base, aucun add-on ne la conditionne, seul l'abonnement compte. Écrire
 * `null` plutôt que d'omettre la clé oblige `satisfies` à le constater.
 *
 * `wheel` EST DÉSORMAIS LE SEUL `null`, et c'est le correctif MOYEN-1 de la
 * revue du lot L2. `vitrine` y a figuré le temps d'une écriture, avec pour
 * conséquence — assumée dans le texte, et c'est ce qui la rendait dangereuse —
 * que tout abonné ouvrait Vitrine sans que personne la lui ait vendue. Le
 * propriétaire a tranché : Vitrine est une OFFRE DISTINCTE, elle porte donc sa
 * colonne comme les huit add-ons, et `default false` laisse les abonnés
 * existants exactement où ils étaient.
 */
export const MODULE_ADDON_COLUMN = {
  wheel: null,
  vitrine: "addon_vitrine",
  // Les trois clés détachées de `vitrine` par 20261020120000. Chacune porte SA
  // colonne : les faire retomber sur `addon_vitrine` aurait rendu le
  // détachement décoratif — quatre clés, un seul interrupteur.
  reserver: "addon_reserver",
  rendez_vous: "addon_rendez_vous",
  duo: "addon_duo",
  bande: "addon_bande",
  hunts: "addon_hunts",
  calendar: "addon_calendar",
  loyalty: "addon_loyalty",
  quiz: "addon_quiz",
  jackpot: "addon_jackpot",
  events: "addon_events",
  referral: "addon_referral",
  pronostics: "addon_pronostics",
} as const satisfies Record<GrantableModule, keyof Organization | null>;

/**
 * LES MODULES ADOSSÉS À UNE OFFRE DU CATALOGUE — c'est-à-dire ceux qu'un
 * commerçant peut PAYER.
 *
 * Dérivée d'`ADDON_OFFERS` et jamais écrite à la main : une liste recopiée
 * cesserait d'être vraie le jour où une offre entre au catalogue ou en sort, et
 * personne ne le verrait — c'est précisément la classe de dette que
 * `MODULE_ADDON_COLUMN` a déjà coûtée.
 *
 * Les huit noms d'`ADDON_OFFERS.entitlement` sont des `GrantableModule` par
 * construction : `Exclude<Entitlement, "core">` est inclus dans l'union des
 * modules octroyables, `tsc` le vérifie sans cast.
 */
export const MODULES_AVEC_OFFRE: ReadonlySet<GrantableModule> = new Set(
  ADDON_OFFERS.map((offre) => offre.entitlement),
);

/**
 * LES MODULES DONT UN OCTROI VIVANT PORTE LE SOCLE.
 *
 * ── LE DÉFAUT QUE CETTE LISTE FERME (revue sécurité du lot L2, MOYEN-2) ──
 *
 * `hasActiveAccess` rendait vrai sur UN OCTROI VIVANT QUELCONQUE. C'était juste
 * tant que tout octroi était un achat — « tout add-on peut être acheté seul : il
 * embarque les briques communes » (docs/codex-handoff.md §2). Le lot L2 casse
 * cette équivalence : `vitrine` s'accorde GRATUITEMENT au back-office pendant la
 * bêta, et un droit offert ouvrait alors le socle payant tout entier — roues
 * publiques jouables, campagnes activables — sans qu'un centime ait changé de
 * main. Un octroi bêta gratuit n'achète pas le socle.
 *
 * Deux moitiés, toutes deux DÉRIVÉES :
 *   * les modules du catalogue (`MODULES_AVEC_OFFRE`) : ils ont un prix ;
 *   * le produit de base lui-même, reconnu à sa colonne addon nulle. Un octroi
 *     `wheel` EST le socle, l'exclure le rendrait sans effet. Il est le SEUL
 *     dans ce cas, et `module-access-parity.test.ts` épingle cette cardinalité
 *     des deux côtés — SQL compris.
 *
 * CE QUE ÇA NE CHANGE PAS : le droit du module lui-même. `droitEffectifModule`
 * interroge `hasLiveModuleGrant` en premier, sans passer par ici — un octroi
 * vitrine ouvre Vitrine, il n'ouvre simplement plus la roue et les campagnes.
 */
const MODULES_PORTANT_LE_SOCLE: ReadonlySet<GrantableModule> = new Set([
  // ── POURQUOI `ADDONS_STANDALONE` ET NON `MODULES_AVEC_OFFRE` ──
  //
  // Les deux ensembles ont coïncidé tant que TOUTE option du catalogue
  // s'achetait seule. Vitrine et Réserver cassent l'équivalence : elles ont un
  // prix et une entrée au catalogue — donc elles sont dans
  // `MODULES_AVEC_OFFRE`, ce que le back-office attend — mais elles ne se
  // vendent qu'en LIGNE d'un abonnement existant.
  //
  // Un octroi vivant sur elles ne prouve donc AUCUN paiement : il vient du
  // back-office, gratuitement, pendant la bêta. Les laisser porter le socle
  // rouvrirait mot pour mot le défaut MOYEN-2 du lot L2 — « un octroi bêta
  // gratuit n'achète pas le socle ».
  ...ADDONS_STANDALONE.map((offre) => offre.entitlement as GrantableModule),
  ...GRANTABLE_MODULES.filter((module) => MODULE_ADDON_COLUMN[module] === null),
]);

type ColonneAddon<M extends GrantableModule> = (typeof MODULE_ADDON_COLUMN)[M];

/**
 * Les champs d'organisation que CE module exige, et eux seuls. Le type est
 * calculé depuis `MODULE_ADDON_COLUMN`, donc un appelant qui oublie de
 * sélectionner `addon_quiz` avant de demander le droit du quiz ne compile pas.
 *
 * C'est le point : la classe de défaut déjà payée deux fois sur ce dépôt est
 * la colonne JAMAIS CHARGÉE qui se lit `undefined` et se comporte comme
 * `false`. Ici elle ne se lit pas du tout — `tsc` la réclame.
 */
export type ChampsModule<M extends GrantableModule> =
  ColonneAddon<M> extends keyof Organization
    ? OrgAccessFields & Pick<Organization, ColonneAddon<M> & keyof Organization>
    : OrgAccessFields;

/**
 * LE DROIT EFFECTIF D'UN MODULE — miroir TypeScript unique de
 * `org_has_module_access` (migration 20260907120000).
 *
 * ── POURQUOI UNE SEULE FONCTION LÀ OÙ IL Y EN AVAIT HUIT ──
 *
 * Les huit `has…Access` disaient la même phrase huit fois, et deux d'entre
 * elles ont cessé de la dire. Le lot 2 a ajouté la branche « octroi vivant »
 * aux six qui vivent dans ce fichier ; `hasQuizAccess` et `hasReferralAccess`
 * habitent `quiz-context.ts` et `referral-context.ts` et ne l'ont pas reçue.
 * Résultat MESURÉ avant correction : un commerçant portant un octroi vivant
 * sur `quiz` sans abonnement voyait la base lui accorder le module
 * (`org_has_module_access` rend vrai) pendant que l'application le lui
 * refusait. Exactement le module qu'il venait de payer.
 *
 * Ce n'est pas un oubli qu'on corrige, c'est une FORME qu'on supprime : huit
 * copies d'une règle ne peuvent pas être corrigées « toutes », on n'en corrige
 * jamais que celles qu'on a sous les yeux. Les huit fonctions restent comme
 * façades — quelque quatre-vingts appelants les nomment — mais elles ne
 * portent plus de règle, elles délèguent ici.
 *
 * ── L'ORDRE DES BRANCHES EST CELUI DU SQL, ET IL COMPTE ──
 *
 * L'octroi vivant est interrogé EN PREMIER et se suffit : « tout add-on peut
 * être acheté seul » (docs/codex-handoff.md §2). Il n'exige ni abonnement, ni
 * booléen `addon_*`. La pause à l'échéance opère par ABSENCE — passé `ends_at`
 * l'octroi n'est plus vivant, cette branche cesse de répondre, et le module
 * retombe sur l'abonnement qui refusera s'il n'y en a pas.
 *
 * ── LA SECONDE BRANCHE EXIGE UNE OFFRE, PAS « UN DROIT QUELCONQUE » ──
 *
 * `hasSubscriptionAccess` et NON `hasActiveAccess`, depuis la migration
 * 20260925120000 qui fait exactement ce remplacement dans
 * `org_has_module_access`. La différence tient à une seule branche et elle vaut
 * le prix d'un abonnement : `hasActiveAccess` rend vrai sur N'IMPORTE QUEL
 * octroi vivant, si bien qu'un pass Chasse à 29 € faisait répondre `true` à
 * `droitEffectifModule("wheel", …)` — dont aucune colonne `addon_*` ne
 * conditionne la ligne — donc ouvrait la roue, les campagnes et leur
 * publication. Le laisser ici pendant que la base l'a fermé donnerait le pire
 * des deux : le dashboard montrerait la roue ouverte à un porteur de pass que
 * `org_has_module_access` refuse au moment d'agir.
 */
export function droitEffectifModule<M extends GrantableModule>(
  module: M,
  org: ChampsModule<M>,
  now = new Date(),
): boolean {
  if (hasLiveModuleGrant(org, module)) return true;
  if (!hasSubscriptionAccess(org, now)) return false;

  const colonne = MODULE_ADDON_COLUMN[module];
  // `wheel` seul : aucun add-on ne conditionne le produit de base, l'offre
  // suffit — le SQL écrit `then true` sur cette unique ligne.
  if (colonne === null) return true;
  // unsafe-cast-justification: lecture par clé DYNAMIQUE d'une colonne dont le nom vient de MODULE_ADDON_COLUMN, jamais de l'appelant. Trois choses rendent ce cast sûr, et aucune n'est une intention : ChampsModule<M> oblige tsc a exiger cette colonne exacte chez chaque appelant, MODULE_ADDON_COLUMN est `satisfies Record<GrantableModule, keyof Organization | null>` donc le nom est une clé reelle d'Organization, et module-access-parity.test.ts compare la table au `case p_module` LU dans la migration. Un acces statique demanderait neuf branches recopiant la table que la garde derive deja.
  return (org as unknown as Record<string, boolean>)[colonne] === true;
}

type OrgPronosticsFields = ChampsModule<"pronostics">;

/** Façade historique. La règle vit dans `droitEffectifModule`. */
export function hasPronosticsAccess(
  org: OrgPronosticsFields,
  now = new Date(),
): boolean {
  return droitEffectifModule("pronostics", org, now);
}

type OrgHuntsFields = ChampsModule<"hunts">;

/** Façade historique. La règle vit dans `droitEffectifModule`. */
export function hasHuntsAccess(
  org: OrgHuntsFields,
  now = new Date(),
): boolean {
  return droitEffectifModule("hunts", org, now);
}

type OrgLoyaltyFields = ChampsModule<"loyalty">;

/** Façade historique. La règle vit dans `droitEffectifModule`. */
export function hasLoyaltyAccess(
  org: OrgLoyaltyFields,
  now = new Date(),
): boolean {
  return droitEffectifModule("loyalty", org, now);
}

type OrgJackpotFields = ChampsModule<"jackpot">;

/** Façade historique. La règle vit dans `droitEffectifModule`. */
export function hasJackpotAccess(
  org: OrgJackpotFields,
  now = new Date(),
): boolean {
  return droitEffectifModule("jackpot", org, now);
}

type OrgEventsFields = ChampsModule<"events">;

/** Façade historique. La règle vit dans `droitEffectifModule`. */
export function hasEventsAccess(
  org: OrgEventsFields,
  now = new Date(),
): boolean {
  return droitEffectifModule("events", org, now);
}

type OrgCalendarFields = ChampsModule<"calendar">;

/** Façade historique. La règle vit dans `droitEffectifModule`. */
export function hasCalendarAccess(
  org: OrgCalendarFields,
  now = new Date(),
): boolean {
  return droitEffectifModule("calendar", org, now);
}

/**
 * Ce que la page Réglages doit lire pour décider des deux boutons de
 * facturation. Type local et non `Pick<Organization, …>` : la colonne
 * `stripe_event_created_at` n'est pas dans le `grant select(...)` accordé à
 * `authenticated` sur `organizations` (migration 00017), elle ne se lit donc
 * que par le client service_role et n'appartient pas à l'objet rendu par
 * `getUserAndOrg`.
 */
export interface BillingActionsFields {
  /**
   * Client Stripe de l'organisation. Il est créé — et persisté — à
   * l'OUVERTURE de la page de paiement (`ensureStripeCustomer`, appelé par
   * `createCheckoutSession` AVANT `checkout.sessions.create`), jamais à
   * l'encaissement. Sa présence ne prouve donc AUCUN abonnement : un
   * commerçant qui clique « Retour » sur la page Stripe en repart avec un
   * client Stripe et zéro souscription, et rien ne le remet jamais à null.
   */
  stripeCustomerId: string | null;
  subscriptionStatus: SubscriptionStatus;
  /**
   * Date de l'événement d'abonnement Stripe le plus récent appliqué. Écrite
   * UNIQUEMENT par `apply_stripe_subscription_event_v2` (migration
   * 20260805170000, seule définition vivante), c'est-à-dire seulement quand
   * Stripe a réellement annoncé un abonnement. C'est le discriminant « cette
   * organisation est déjà passée par une souscription ».
   */
  stripeEventCreatedAt: string | null;
  /**
   * Le commerçant revient-il à l'instant d'un paiement réussi
   * (`?checkout=success`) ? Le webhook qui écrit `stripeEventCreatedAt`
   * arrive quelques secondes plus tard : sans ce drapeau, la page propose
   * un SECOND paiement à quelqu'un qui vient de payer.
   */
  justPaid?: boolean;
}

/**
 * Quelles actions de facturation proposer au propriétaire.
 *
 * Le piège que cette fonction existe pour fermer : « posséder un client
 * Stripe » ≠ « posséder un abonnement ». Confondre les deux faisait
 * disparaître définitivement le bouton « Démarrer mon abonnement » dès le
 * premier abandon de la page de paiement, en le remplaçant par un portail
 * client qui, lui, ne sait pas créer d'abonnement.
 *
 * - `canManage` : le portail Stripe n'a de sens que pour un client qui a
 *   effectivement souscrit une fois (moyens de paiement, factures,
 *   résiliation). Il reste ouvert après une résiliation : l'historique de
 *   facturation appartient au commerçant.
 * - `canCheckout` : ouvert tant qu'aucune souscription n'a eu lieu, et
 *   rouvert après une résiliation. Volontairement PAS rouvert sur
 *   `inactive` : ce statut couvre `incomplete` et `paused`, où un objet
 *   abonnement existe encore chez Stripe et se reprend depuis le portail —
 *   y offrir un checkout ferait facturer deux abonnements au même
 *   commerçant.
 *
 * Les deux peuvent être vrais en même temps (abonnement résilié : on
 * consulte ses factures ET on se réabonne) : ce ne sont pas deux branches
 * d'une alternative.
 *
 * CE QUE CETTE FONCTION NE GARANTIT PAS, et il faut le lire avant de s'y
 * fier. Une version antérieure de ce commentaire affirmait qu'ouvrir le
 * checkout sur `canceled` ne risquait aucun doublon, « `canceled` étant
 * terminal chez Stripe ». C'était faux : le `canceled` lu ici n'est pas le
 * `canceled` de Stripe mais le résultat de `mapStripeStatus`, qui y replie
 * AUSSI `unpaid` — un abonnement toujours vivant, que le portail réactive.
 * Un commerçant en impayé voit donc les deux boutons.
 *
 * Le repli n'est pas défait pour autant : il est délibéré et documenté côté
 * accès (00009_past_due_grace.sql, docs/decisions.md), où `unpaid` doit
 * couper comme un résilié, et le statut interne n'a que cinq valeurs
 * autorisées en base. L'information perdue n'est nulle part en local.
 *
 * Ces trois booléens décident donc de ce qu'on AFFICHE, jamais de ce qu'on
 * autorise. Le refus qui protège l'argent est posé côté serveur par
 * `createCheckoutSession` (src/actions/billing.ts), qui interroge Stripe via
 * `hasLiveStripeSubscription` avant d'ouvrir la moindre session — il ferme
 * du même geste la page laissée ouverte et le POST rejoué, que masquer un
 * bouton n'a jamais arrêtés.
 */
export function billingActions(org: BillingActionsFields): {
  /** Stripe a déjà annoncé un abonnement pour cette organisation. */
  everSubscribed: boolean;
  /** Abonnement Stripe encore vivant (ni résilié, ni jamais souscrit). */
  hasLiveSubscription: boolean;
  canCheckout: boolean;
  canManage: boolean;
} {
  const everSubscribed = org.stripeEventCreatedAt !== null;
  // FENÊTRE DU RETOUR DE PAIEMENT. `stripe_event_created_at` n'est écrit que
  // par le webhook, qui arrive quelques secondes APRÈS que Stripe a renvoyé
  // le commerçant sur `?checkout=success`. Pendant cet intervalle
  // `everSubscribed` est encore faux : la page afficherait « Votre abonnement
  // est en cours d'activation » ET, juste dessous, « Démarrer mon
  // abonnement ». Le commerçant qui vient de payer et qui reclique paie deux
  // fois.
  //
  // L'ancien prédicat (`!!stripe_customer_id`, posé à l'OUVERTURE du
  // paiement) fermait cette fenêtre — trop largement, c'était le défaut
  // qu'on corrige, mais il la fermait. La remplacer sans la rouvrir demande
  // de dire explicitement « il revient de payer ».
  //
  // Le paramètre vient de l'URL, donc forgeable : le forger ne fait que
  // masquer son propre bouton, jamais accorder quoi que ce soit. Aucun
  // droit ne se dérive d'ici.
  const canCheckout =
    !org.justPaid && (!everSubscribed || org.subscriptionStatus === "canceled");
  return {
    everSubscribed,
    hasLiveSubscription: everSubscribed && !canCheckout,
    canCheckout,
    canManage: everSubscribed && org.stripeCustomerId !== null,
  };
}

/**
 * Le refus que `createCheckoutSession` oppose quand Stripe confirme un
 * abonnement ENCORE VIVANT pour ce client. Partagé entre l'action qui le
 * produit et l'écran qui le rend, parce que le second doit ouvrir la sortie
 * que le premier nomme — voir `billingButtonsToShow`.
 */
export const CHECKOUT_REFUS_ABONNEMENT_VIVANT =
  "Un abonnement est déjà ouvert pour ce compte. Utilisez "
  + "« Gérer mon abonnement » sur cet écran pour le reprendre ou mettre à "
  + "jour votre moyen de paiement.";

/**
 * Quels boutons de facturation l'écran doit RÉELLEMENT rendre, une fois connu
 * le refus que l'action vient d'opposer.
 *
 * ── LE DÉFAUT QUE CETTE FONCTION FERME ──
 *
 * Le propriétaire paie sur Stripe, revient sur Réglages, puis reclique
 * « Réglages » dans le menu : l'URL perd `?checkout=success`, donc `justPaid`
 * retombe à faux. Si le webhook n'a pas encore été appliqué — ou ne l'est
 * JAMAIS (endpoint mal configuré, prix absent de la configuration : la route
 * du webhook rend alors 500 sans appeler la RPC) —, `stripe_event_created_at`
 * reste null, donc `everSubscribed` faux : `canCheckout` est vrai et
 * `canManage` faux. Il revoit « Démarrer mon abonnement », clique, et reçoit
 * un refus qui le renvoie vers « Gérer mon abonnement »… un bouton que
 * `canManage` vient précisément de cacher. De l'argent a changé de main et
 * l'écran ne porte plus aucune action.
 *
 * Le trou est BORNÉ à ce sous-cas : l'impayé (`unpaid` replié sur `canceled`)
 * déclenche le même refus, mais avec `everSubscribed` vrai, donc avec le
 * portail déjà affiché. On ne corrige pas une généralité.
 *
 * ── POURQUOI OUVRIR LE PORTAIL EST SÛR ICI, ET PAS EN GÉNÉRAL ──
 *
 * On n'élargit PAS `canManage` à `stripeCustomerId !== null` : un client
 * Stripe existe dès l'OUVERTURE du Checkout, donc dès le premier abandon de
 * la page de paiement, et le portail serait offert en permanence à quelqu'un
 * qui n'a jamais souscrit — le portail ne sait pas créer d'abonnement, il
 * n'aurait rien à lui montrer.
 *
 * On ouvre le portail sur LE SEUL refus qui prouve le contraire : ce message
 * n'est produit qu'après `hasLiveStripeSubscription`, c'est-à-dire après que
 * Stripe a énuméré un abonnement non terminal pour ce client. Et le client
 * Stripe est nécessairement persisté à cet instant, `ensureStripeCustomer`
 * ayant écrit `organizations.stripe_customer_id` avant que la garde ne parle :
 * le bouton ouvert ici ne peut donc pas retomber sur le « Aucun abonnement à
 * gérer » de `createPortalSession`.
 *
 * Rendre le bouton n'AUTORISE rien : `createPortalSession` garde son
 * `requireOrganizationOwner` et lit le client Stripe en base, jamais depuis
 * l'écran. Forger ce message côté client ne fait qu'afficher un bouton qui
 * s'exécute avec exactement les mêmes droits.
 *
 * CE QUE ÇA NE RÉPARE PAS, et qu'il faut lire : tant que le webhook n'est pas
 * appliqué, l'organisation reste `trialing` avec un essai échu, donc
 * `hasActiveAccess` faux — le commerçant est débité ET ses roues sont
 * coupées. Le portail lui rend une SORTIE (voir sa facture, sa carte,
 * résilier), pas son accès ; rétablir l'accès demande de réconcilier l'état
 * Stripe en base, ce qu'aucun de ces quatre fichiers ne peut faire.
 */
export function billingButtonsToShow(input: {
  canCheckout: boolean;
  canManage: boolean;
  /** Refus rendu par `createCheckoutSession`, s'il y en a un. */
  checkoutError?: string | null;
}): { showCheckout: boolean; showPortal: boolean } {
  return {
    showCheckout: input.canCheckout,
    showPortal:
      input.canManage
      || input.checkoutError === CHECKOUT_REFUS_ABONNEMENT_VIVANT,
  };
}

/**
 * L'organisation est-elle en essai expiré, sans jamais s'être abonnée ?
 *
 * CE PRÉDICAT NE PEUT PLUS SE LIRE SUR LE SEUL STATUT. Il testait
 * `subscription_status === 'trialing'`, ce qui suffisait tant qu'un essai non
 * converti restait `trialing` pour l'éternité. Le cron `expire-trials` le
 * bascule désormais en `canceled` — et `canceled` recouvre deux situations
 * que le commerçant ne vit PAS de la même façon :
 *   - « votre essai est terminé, abonnez-vous » (jamais souscrit) ;
 *   - « votre abonnement a été résilié » (a souscrit, puis a arrêté).
 *
 * Le discriminant est `stripe_event_created_at` : il n'est écrit que par
 * `apply_stripe_subscription_event_v2`, donc seulement quand Stripe a
 * réellement annoncé un abonnement. On le passe ici sous forme booléenne
 * (`ever_subscribed`) parce que la colonne n'est pas dans le
 * `grant select(...)` accordé à `authenticated` (00017) : elle se lit par un
 * client service_role, et l'appelant seul sait comment se la procurer.
 *
 * `ever_subscribed` est OPTIONNEL et testé `=== false` : un appelant qui ne
 * sait pas répondre garde exactement l'ancien comportement (seul `trialing`
 * compte). Le repli ne peut donc jamais faire dire « essai terminé » à un
 * vrai résilié — il fait, au pire, retomber sur le message générique.
 */
export function isTrialExpired(
  org: OrgAccessFields & { ever_subscribed?: boolean },
  now = new Date(),
): boolean {
  if (new Date(org.trial_ends_at).getTime() > now.getTime()) return false;
  if (org.subscription_status === "trialing") return true;
  return org.subscription_status === "canceled" && org.ever_subscribed === false;
}

/**
 * Ligne « Essai gratuit » de la fiche d'abonnement — ou `null` quand il n'y a
 * plus rien à en dire.
 *
 * ── Ce que la cascade précédente promettait à un abonné ──
 *
 * Elle ne testait que deux cas — `trialExpired`, puis `trialing` — et TOUT le
 * reste retombait sur `${plan.trialDays} jours`, c'est-à-dire la valeur
 * STATIQUE du catalogue. Un commerçant qui paie, badge vert « Actif » quatre
 * lignes plus haut, lisait donc « Essai gratuit : 7 jours » : le seul endroit
 * de la page qui parle de l'essai en promettait un neuf à quelqu'un qui venait
 * d'être débité. Idem pour `past_due`, et pour un résilié après un vrai
 * abonnement.
 *
 * La règle : `plan.trialDays` est un argument de VENTE, il n'a de sens que
 * pour qui n'a pas encore commencé. Dès qu'un statut Stripe existe, la ligne
 * décrit l'organisation, pas le catalogue.
 *
 * L'ORDRE COMPTE toujours : tester `trialing` d'abord réafficherait « N jours
 * restants » à un essai que le cron `expire-trials` vient de basculer.
 */
export function trialLine(input: {
  status: SubscriptionStatus;
  /** `isTrialExpired`, déjà calculé par l'appelant (il a le discriminant). */
  trialExpired: boolean;
  /** `trialDaysLeft`, pertinent seulement pendant l'essai. */
  daysLeft: number;
  /** Durée d'essai du catalogue — argument de vente, jamais un état. */
  trialDays: number;
}): string | null {
  if (input.trialExpired) return "Terminé";
  if (input.status === "trialing") {
    const n = Math.max(0, input.daysLeft);
    return `${n} jour${n > 1 ? "s" : ""} restant${n > 1 ? "s" : ""}`;
  }
  // Un statut Stripe VIVANT (ou mort après avoir vécu) clôt la question de
  // l'essai : on n'en parle plus du tout, plutôt que d'écrire « Terminé » à
  // quelqu'un qui n'en a peut-être jamais eu.
  if (input.status !== "inactive") return null;
  // `inactive` = aucun abonnement n'a jamais commencé : la promesse du
  // catalogue est encore vraie, et c'est le seul cas où elle l'est.
  return `${input.trialDays} jours`;
}

/**
 * Statut à AFFICHER, distinct du statut stocké. Voir `isTrialExpired` : un
 * essai jamais converti et un abonnement résilié portent tous deux
 * `canceled` en base, et les confondre dans le back-office donnerait
 * « Annulé » à un commerçant qui n'a jamais rien souscrit.
 */
export type SubscriptionDisplayStatus = SubscriptionStatus | "trial_expired";

export function displaySubscriptionStatus(org: {
  subscription_status: SubscriptionStatus;
  stripe_event_created_at: string | null;
}): SubscriptionDisplayStatus {
  if (org.subscription_status === "canceled" && org.stripe_event_created_at === null) {
    return "trial_expired";
  }
  return org.subscription_status;
}

/** Jours d'essai restants (arrondi supérieur), 0 si expiré ou non concerné. */
export function trialDaysLeft(org: OrgAccessFields, now = new Date()): number {
  if (org.subscription_status !== "trialing") return 0;
  const remaining = new Date(org.trial_ends_at).getTime() - now.getTime();
  return Math.max(0, Math.ceil(remaining / MS_PER_DAY));
}
