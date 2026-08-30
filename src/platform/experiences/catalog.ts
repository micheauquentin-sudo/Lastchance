import type { Tables } from "@/types/database.generated";
import type { Entitlement, ExperienceKind } from "./contract";

export type ExperienceObjective =
  | "Acquérir"
  | "Fidéliser"
  | "Animer en direct"
  | "Créer du trafic";

type AddonField =
  | "addon_pronostics"
  | "addon_hunts"
  | "addon_loyalty"
  | "addon_jackpot"
  | "addon_events"
  | "addon_calendar"
  | "addon_referral"
  | "addon_quiz";

/**
 * ── POURQUOI DEUX DESCRIPTIONS, ET NON UNE SEULE ALLONGÉE ──
 *
 * `shortDescription` est écrite pour une VIGNETTE : une ligne, orientée
 * bénéfice, lue par quelqu'un qui compare neuf cartes côte à côte dans
 * « Découvrir ». `dashboardSubtitle` est écrite pour un EN-TÊTE DE PAGE : elle
 * s'adresse à quelqu'un qui vient d'ouvrir l'écran et cherche son PREMIER
 * GESTE, ce qu'une vignette ne peut pas dire sans casser la grille.
 *
 * Les fusionner obligeait à choisir laquelle des deux on dégrade. Les garder
 * séparées ne recrée pas la divergence que ce champ répare : jusqu'ici la
 * phrase de l'en-tête était écrite DANS la page, hors de portée de toute
 * garde. Ici les deux vivent côte à côte, et `catalog.test.ts` les tient.
 */
export interface ExperienceCatalogEntry {
  kind: ExperienceKind;
  entitlement: Entitlement;
  label: string;
  /** Une ligne pour la vignette de « Découvrir ». */
  shortDescription: string;
  /** En-tête de la page du module : ce que ça fait, puis le premier geste. */
  dashboardSubtitle: string;
  objective: ExperienceObjective;
  /**
   * L'écran du module, dans le tableau de bord.
   *
   * Duo et Bande ont pointé « /dashboard/vitrine » jusqu'ici, alors que
   * leurs écrans sont sous `/dashboard/salons/`. Personne ne l'a vu parce
   * que personne ne lisait ce champ : `plans.ts` n'en prend que le
   * `label`. Une donnée fausse qui dort est une donnée fausse le jour où
   * quelqu'un s'en sert — d'où le test qui vérifie maintenant que chaque
   * adresse correspond à une route réelle.
   */
  dashboardHref: string;
  addonField: AddonField | null;
}

export const EXPERIENCE_CATALOG: readonly ExperienceCatalogEntry[] = [
  {
    kind: "campaign",
    entitlement: "core",
    label: "Jeux instantanés",
    shortDescription: "Roue, grattage et mini-jeux pour acquérir et convertir.",
    dashboardSubtitle:
      "Chaque campagne est une roue ou un mini-jeu, avec ses QR codes et ses dates.",
    objective: "Acquérir",
    dashboardHref: "/dashboard/campaigns",
    addonField: null,
  },
  {
    kind: "referral",
    entitlement: "referral",
    label: "Parrainage",
    shortDescription: "Transformez vos clients en ambassadeurs avec des paliers.",
    dashboardSubtitle:
      "Vos clients invitent leurs proches et gagnent un lot quand ceux-ci viennent. Réglez les paliers, chacun reçoit ensuite son lien à partager.",
    objective: "Acquérir",
    dashboardHref: "/dashboard/campaigns",
    addonField: "addon_referral",
  },
  {
    kind: "loyalty",
    entitlement: "loyalty",
    label: "Passeport fidélité",
    shortDescription: "Récompensez les visites répétées et les habitudes durables.",
    dashboardSubtitle:
      "Des passeports de fidélité : cumul de visites, niveaux et paliers à débloquer.",
    objective: "Fidéliser",
    dashboardHref: "/dashboard/loyalty",
    addonField: "addon_loyalty",
  },
  {
    kind: "calendar",
    entitlement: "calendar",
    label: "Calendrier",
    shortDescription: "Créez un rendez-vous quotidien et une récompense d'assiduité.",
    dashboardSubtitle:
      "Des campagnes quotidiennes : une case à ouvrir chaque jour, un rendez-vous ludique avec vos clients.",
    objective: "Fidéliser",
    dashboardHref: "/dashboard/calendar",
    addonField: "addon_calendar",
  },
  {
    kind: "event",
    entitlement: "events",
    label: "Événements live",
    shortDescription: "Animez une salle en temps réel avec écran et téléphones.",
    dashboardSubtitle:
      "Des quiz en direct pour animer votre salle : vos clients jouent depuis leur téléphone, tout s'affiche sur grand écran.",
    objective: "Animer en direct",
    dashboardHref: "/dashboard/events",
    addonField: "addon_events",
  },
  {
    kind: "pronostics",
    entitlement: "pronostics",
    label: "Pronostics",
    shortDescription: "Faites vivre les matchs de la saison avant, pendant et après.",
    dashboardSubtitle:
      "Vos clients pronostiquent les résultats des matchs et se classent entre eux. Créez la saison, ajoutez les rencontres : le classement se met à jour tout seul.",
    objective: "Animer en direct",
    dashboardHref: "/dashboard/pronostics",
    addonField: "addon_pronostics",
  },
  {
    kind: "jackpot",
    entitlement: "jackpot",
    label: "Jackpot collectif",
    shortDescription: "Fédérez les participants autour d'une jauge et d'un tirage.",
    dashboardSubtitle:
      "Des cagnottes collectives : une jauge partagée que vos clients remplissent ensemble, un lot à la clé.",
    objective: "Animer en direct",
    dashboardHref: "/dashboard/jackpot",
    addonField: "addon_jackpot",
  },
  {
    kind: "quiz",
    entitlement: "quiz",
    label: "Quiz",
    shortDescription: "Composez un parcours de questions, autonome ou animé.",
    dashboardSubtitle:
      "Vos clients jouent depuis leur téléphone, la correction est immédiate, le lot se retire en caisse.",
    objective: "Animer en direct",
    dashboardHref: "/dashboard/quiz",
    addonField: "addon_quiz",
  },
  {
    kind: "hunt",
    entitlement: "hunts",
    label: "Chasse au QR",
    shortDescription: "Reliez plusieurs lieux et faites progresser le trafic physique.",
    dashboardSubtitle:
      "Un parcours de QR codes à tamponner, avec un lot final remis en caisse.",
    objective: "Créer du trafic",
    dashboardHref: "/dashboard/hunts",
    addonField: "addon_hunts",
  },
] as const;

type OrganizationAddons = Pick<Tables<"organizations">, AddonField>;

export function activeExperienceKinds(
  organization: OrganizationAddons,
  fullAccess = false,
): ExperienceKind[] {
  return EXPERIENCE_CATALOG.filter(
    (entry) =>
      entry.addonField === null ||
      fullAccess ||
      organization[entry.addonField] === true,
  ).map((entry) => entry.kind);
}

export function isExperienceActive(
  organization: OrganizationAddons,
  kind: ExperienceKind,
  fullAccess = false,
): boolean {
  return activeExperienceKinds(organization, fullAccess).includes(kind);
}

/* -------------------------------------------------------------------------
 * LES MODULES VENDABLES QUI NE SONT PAS DES EXPÉRIENCES
 *
 * ── POURQUOI UN SECOND REGISTRE, ET NON QUATRE LIGNES DE PLUS ──
 *
 * `EXPERIENCE_CATALOG` décrit ce qu'un JOUEUR peut jouer : chaque entrée a un
 * `kind` d'expérience, une route publique, un adaptateur d'analytique et un
 * adaptateur de récompense. La Vitrine et Réserver n'ont rien de tout cela —
 * `contract.ts` le dit depuis le lot L2 et c'est la raison pour laquelle ils
 * sont volontairement absents de l'union `ExperienceKind`. Les y forcer aurait
 * demandé d'inventer un `kind` jouable pour une carte de restaurant.
 *
 * Mais ils SE VENDENT, depuis l'offre « Sur Place » (2026-08-22). Or les deux
 * gardes de `plans.test.ts` — « aucun droit hors du catalogue produit » et
 * « aucune offre sans expérience listée » — dérivaient leur vocabulaire du seul
 * catalogue d'expériences. Ce registre est ce qui manquait : la liste de ce
 * qu'une offre peut CONTENIR, dont les expériences ne sont qu'une moitié.
 *
 * ── CE QU'IL NE FAIT PAS ──
 *
 * Il n'accorde rien et ne facture rien, exactement comme son voisin. Le droit
 * se décide dans `droitEffectifModule` (miroir d'`org_has_module_access`), et
 * le montant vient du `price` Stripe. Ici vivent un libellé et une adresse.
 * ------------------------------------------------------------------------- */

type ModuleAddonField =
  | "addon_vitrine"
  | "addon_reserver"
  | "addon_rendez_vous"
  | "addon_duo"
  | "addon_bande";

export interface ModuleCatalogEntry {
  entitlement: Entitlement;
  label: string;
  /** Une ligne pour la vignette de « Découvrir ». */
  shortDescription: string;
  /** En-tête de la page du module : ce que ça fait, puis le premier geste. */
  dashboardSubtitle: string;
  objective: ExperienceObjective;
  dashboardHref: string;
  addonField: ModuleAddonField;
}

/**
 * Les CINQ clés détachées — quatre par 20261020120000, la prise de rendez-vous
 * par 20261107120000. L'ordre est celui
 * de la vente : la Vitrine porte les trois autres dans le discours commercial,
 * elle ouvre donc la liste.
 */
export const MODULE_CATALOG: readonly ModuleCatalogEntry[] = [
  {
    entitlement: "vitrine",
    label: "Vitrine",
    shortDescription:
      "Publiez votre carte au QR code, en français et en anglais.",
    dashboardSubtitle:
      "Faites découvrir votre lieu et ce que vous proposez : vos clients scannent un QR code et lisent votre carte sur leur téléphone.",
    objective: "Acquérir",
    dashboardHref: "/dashboard/vitrine",
    addonField: "addon_vitrine",
  },
  {
    // LA CLÉ NE BOUGE PAS, LE LIBELLÉ SI (2026-08-29). `reserver` garde ce
    // qu'elle gardait : ateliers, dégustations, files d'accueil,
    // invitations, offres. Le mot « Réserver » désignait mal cet ensemble
    // dès lors que la prise de rendez-vous est devenue un produit à part.
    entitlement: "reserver",
    label: "Moments",
    shortDescription:
      "Ateliers, dégustations, files d'accueil : faites vivre un moment à vos clients.",
    dashboardSubtitle:
      "Ateliers, dégustations, files d'accueil, invendus de fin de journée : créez l'activité, ouvrez ses créneaux, vos clients s'inscrivent sans créer de compte. Pour réserver une table, voyez « Réservation ».",
    objective: "Créer du trafic",
    dashboardHref: "/dashboard/moments",
    addonField: "addon_reserver",
  },
  {
    entitlement: "rendez_vous",
    label: "Réservation",
    shortDescription:
      "Vos horaires une fois, les créneaux se génèrent : vos clients prennent rendez-vous depuis votre Vitrine.",
    dashboardSubtitle:
      "Vos horaires, vos tables, votre calendrier — et le QR que vos clients scannent pour réserver.",
    objective: "Créer du trafic",
    dashboardHref: "/dashboard/reservations",
    addonField: "addon_rendez_vous",
  },
  {
    entitlement: "duo",
    label: "Duo Miroir",
    shortDescription: "Deux joueurs, des choix scellés, une révélation commune.",
    dashboardSubtitle:
      "Deux joueurs répondent chacun de leur côté, les choix se révèlent ensemble. Partagez le QR ci-dessous : ils jouent depuis leur téléphone, sans rien installer.",
    objective: "Fidéliser",
    dashboardHref: "/dashboard/salons/duo",
    addonField: "addon_duo",
  },
  {
    entitlement: "bande",
    label: "Portrait de la Bande",
    shortDescription: "Un vote secret par question, révélé quand la bande y est.",
    dashboardSubtitle:
      "Chacun vote en secret ; la réponse ne se révèle qu'à partir de trois voix. Partagez le QR ci-dessous : la bande ouvre une salle de 2 à 12 joueurs.",
    objective: "Fidéliser",
    dashboardHref: "/dashboard/salons/bande",
    addonField: "addon_bande",
  },
] as const;

/**
 * LA PHRASE D'EN-TÊTE D'UN MODULE, LUE À LA SOURCE.
 *
 * Les deux catalogues se cherchent ensemble parce qu'une PAGE ne sait pas —
 * et n'a pas à savoir — si ce qu'elle sert est une expérience jouable ou une
 * application : « Moments » et « Pronostics » posent la même question.
 * Retourner `undefined` plutôt que de jeter laisse l'appelant décider, ce dont
 * un écran servi à un commerçant sans droit a besoin.
 */
export function sousTitreTableauDeBord(
  entitlement: Entitlement,
): string | undefined {
  return [...EXPERIENCE_CATALOG, ...MODULE_CATALOG].find(
    (entree) => entree.entitlement === entitlement,
  )?.dashboardSubtitle;
}

/**
 * Le libellé et la phrase d'un module vendable, pour les écrans qui affichent
 * les deux — « Duo Miroir » et sa promesse tenaient jusqu'ici dans une table
 * locale à la page, seconde source de vérité par construction.
 */
export function entreeModule(
  entitlement: Entitlement,
): ModuleCatalogEntry | undefined {
  return MODULE_CATALOG.find((entree) => entree.entitlement === entitlement);
}

/**
 * Tout ce qu'une offre peut contenir, expériences ET modules, dans l'ordre
 * d'affichage. Dérivée : un ajout à l'un des deux catalogues apparaît ici sans
 * retouche, ce qui est précisément ce qu'une liste recopiée ne sait pas faire.
 */
export const SELLABLE_ENTITLEMENTS: readonly Entitlement[] = [
  ...new Set<Entitlement>([
    "core",
    ...EXPERIENCE_CATALOG.map((entry) => entry.entitlement),
    ...MODULE_CATALOG.map((entry) => entry.entitlement),
  ]),
];
