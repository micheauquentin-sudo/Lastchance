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
