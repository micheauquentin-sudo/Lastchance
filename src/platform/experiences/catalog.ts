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

export interface ExperienceCatalogEntry {
  kind: ExperienceKind;
  entitlement: Entitlement;
  label: string;
  shortDescription: string;
  objective: ExperienceObjective;
  dashboardHref: string;
  addonField: AddonField | null;
}

export const EXPERIENCE_CATALOG: readonly ExperienceCatalogEntry[] = [
  {
    kind: "campaign",
    entitlement: "core",
    label: "Jeux instantanés",
    shortDescription: "Roue, grattage et mini-jeux pour acquérir et convertir.",
    objective: "Acquérir",
    dashboardHref: "/dashboard/campaigns",
    addonField: null,
  },
  {
    kind: "referral",
    entitlement: "referral",
    label: "Parrainage",
    shortDescription: "Transformez vos clients en ambassadeurs avec des paliers.",
    objective: "Acquérir",
    dashboardHref: "/dashboard/campaigns",
    addonField: "addon_referral",
  },
  {
    kind: "loyalty",
    entitlement: "loyalty",
    label: "Passeport fidélité",
    shortDescription: "Récompensez les visites répétées et les habitudes durables.",
    objective: "Fidéliser",
    dashboardHref: "/dashboard/loyalty",
    addonField: "addon_loyalty",
  },
  {
    kind: "calendar",
    entitlement: "calendar",
    label: "Calendrier",
    shortDescription: "Créez un rendez-vous quotidien et une récompense d'assiduité.",
    objective: "Fidéliser",
    dashboardHref: "/dashboard/calendar",
    addonField: "addon_calendar",
  },
  {
    kind: "event",
    entitlement: "events",
    label: "Événements live",
    shortDescription: "Animez une salle en temps réel avec écran et téléphones.",
    objective: "Animer en direct",
    dashboardHref: "/dashboard/events",
    addonField: "addon_events",
  },
  {
    kind: "pronostics",
    entitlement: "pronostics",
    label: "Pronostics",
    shortDescription: "Faites vivre une compétition avant, pendant et après les matchs.",
    objective: "Animer en direct",
    dashboardHref: "/dashboard/pronostics",
    addonField: "addon_pronostics",
  },
  {
    kind: "jackpot",
    entitlement: "jackpot",
    label: "Jackpot collectif",
    shortDescription: "Fédérez les participants autour d'une jauge et d'un tirage.",
    objective: "Animer en direct",
    dashboardHref: "/dashboard/jackpot",
    addonField: "addon_jackpot",
  },
  {
    kind: "quiz",
    entitlement: "quiz",
    label: "Quiz",
    shortDescription: "Composez un parcours de questions, autonome ou animé.",
    objective: "Animer en direct",
    dashboardHref: "/dashboard/quiz",
    addonField: "addon_quiz",
  },
  {
    kind: "hunt",
    entitlement: "hunts",
    label: "Chasse au trésor",
    shortDescription: "Reliez plusieurs lieux et faites progresser le trafic physique.",
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
  | "addon_duo"
  | "addon_bande";

export interface ModuleCatalogEntry {
  entitlement: Entitlement;
  label: string;
  shortDescription: string;
  objective: ExperienceObjective;
  dashboardHref: string;
  addonField: ModuleAddonField;
}

/**
 * Les quatre clés détachées par la migration 20261020120000. L'ordre est celui
 * de la vente : la Vitrine porte les trois autres dans le discours commercial,
 * elle ouvre donc la liste.
 */
export const MODULE_CATALOG: readonly ModuleCatalogEntry[] = [
  {
    entitlement: "vitrine",
    label: "Vitrine",
    shortDescription:
      "Publiez votre carte au QR code, en français et en anglais.",
    objective: "Acquérir",
    dashboardHref: "/dashboard/vitrine",
    addonField: "addon_vitrine",
  },
  {
    entitlement: "reserver",
    label: "Réserver",
    shortDescription:
      "Ouvrez vos créneaux, gérez la file et accueillez sans attente.",
    objective: "Créer du trafic",
    dashboardHref: "/dashboard/reservations",
    addonField: "addon_reserver",
  },
  {
    entitlement: "duo",
    label: "Duo Miroir",
    shortDescription: "Deux joueurs, des choix scellés, une révélation commune.",
    objective: "Fidéliser",
    dashboardHref: "/dashboard/vitrine",
    addonField: "addon_duo",
  },
  {
    entitlement: "bande",
    label: "Portrait de la Bande",
    shortDescription: "Un vote secret par question, révélé quand la bande y est.",
    objective: "Fidéliser",
    dashboardHref: "/dashboard/vitrine",
    addonField: "addon_bande",
  },
] as const;

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
