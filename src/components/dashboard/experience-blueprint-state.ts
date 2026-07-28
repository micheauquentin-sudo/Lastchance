import { EXPERIENCE_CATALOG } from "@/platform/experiences/catalog";
import type { ExperienceKind } from "@/platform/experiences/contract";
import { getExperienceBlueprintAdapter } from "@/platform/experiences/templates/adapters";
import { STARTER_BLUEPRINTS } from "@/platform/experiences/templates/starters";

/**
 * Décisions d'affichage de la galerie de modèles d'expérience.
 *
 * Isolées du rendu pour être testées : ce sont elles qui décident si un bouton
 * qui promet une action est montré. Un bouton « Appliquer » affiché alors que
 * le moteur refusera est pire que pas de bouton du tout — c'est exactement le
 * défaut que l'audit a relevé sur les pronostics, où l'interface promettait un
 * encaissement que la caisse ne savait pas honorer.
 */

export function kindLabel(kind: ExperienceKind): string {
  return EXPERIENCE_CATALOG.find((entry) => entry.kind === kind)?.label ?? kind;
}

/**
 * Versions proposables à la restauration : toutes sauf la dernière — restaurer
 * la version courante sur elle-même n'aurait aucun effet observable et ferait
 * croire à une action. Ordre décroissant : la plus récente d'abord.
 */
export function restorableVersions(latestVersion: number): number[] {
  if (!Number.isInteger(latestVersion) || latestVersion < 2) return [];
  return Array.from({ length: latestVersion - 1 }, (_, index) => index + 1).reverse();
}

/** Types disposant d'un modèle de départ ET d'un adaptateur qui sait l'appliquer. */
export function starterKinds(): ExperienceKind[] {
  return (Object.keys(STARTER_BLUEPRINTS) as ExperienceKind[]).filter(
    (kind) => getExperienceBlueprintAdapter(kind).support.supported,
  );
}

export interface BlueprintDecisionInput {
  latestVersion: number;
  latestStatus: "draft" | "published";
  publishedVersion: number | null;
  compatibilityError: string | null;
  /** Le module est-il actif dans l'abonnement de l'organisation ? */
  moduleActive: boolean;
}

export interface BlueprintDecision {
  /** Version que l'application viserait : la publiée, sinon la dernière. */
  applicableVersion: number;
  canPublish: boolean;
  canApply: boolean;
  /** Pourquoi l'application est refusée — affiché plutôt que deviné au clic. */
  blockedReason: "no_version" | "incompatible" | "module_inactive" | null;
}

export function decideBlueprintActions(
  input: BlueprintDecisionInput,
): BlueprintDecision {
  const applicableVersion = input.publishedVersion ?? input.latestVersion;
  const canPublish = input.latestStatus === "draft" && input.latestVersion > 0;

  // L'ordre compte : un modèle vide n'est pas « incompatible », et un modèle
  // illisible ne devient pas applicable parce que le module est actif.
  const blockedReason =
    applicableVersion <= 0
      ? ("no_version" as const)
      : input.compatibilityError !== null
        ? ("incompatible" as const)
        : !input.moduleActive
          ? ("module_inactive" as const)
          : null;

  return {
    applicableVersion,
    canPublish,
    canApply: blockedReason === null,
    blockedReason,
  };
}
