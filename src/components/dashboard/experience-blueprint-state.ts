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
 *
 * Rend systématiquement `[]` en l'état du produit : `latestVersion` ne dépasse
 * jamais 1, faute d'éditeur de modèle (voir `restoreExperienceBlueprintVersion`
 * dans `src/actions/experience-blueprints.ts`). Le formulaire de restauration
 * de la galerie est donc du markup mort.
 *
 * Réserve à lever AVANT de le ranimer : `restore_experience_blueprint_version`
 * exige une source `publication_status = 'published'`, alors que cette liste
 * offre toutes les versions antérieures, brouillons compris. Le menu déroulant
 * proposerait des entrées que le moteur refuse — la même promesse non tenue que
 * celle qui vient d'être corrigée sur « Appliquer ». La corriger demande la
 * liste des versions et non leur seul décompte, donc un changement de signature
 * qui touche la galerie et ses tests : hors de ce correctif.
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
  /**
   * Lisibilité du modèle par le moteur actuel. Calculé par
   * `listExperienceBlueprints` sur la DERNIÈRE version, alors que l'application
   * vise la version PUBLIÉE. Les deux coïncident aujourd'hui — publier ne cible
   * jamais que la dernière, et plus rien ne crée de version ≥ 2 (voir la note de
   * `restoreExperienceBlueprintVersion`). Le jour où un éditeur de modèle
   * rendra les versions ≥ 2 atteignables, il faudra calculer cet indicateur sur
   * la version publiée, sans quoi un brouillon illisible bloquerait une version
   * publiée parfaitement applicable.
   */
  compatibilityError: string | null;
  /** Le module est-il actif dans l'abonnement de l'organisation ? */
  moduleActive: boolean;
}

export interface BlueprintDecision {
  /**
   * Version que l'application viserait — la version PUBLIÉE, et elle seule.
   *
   * Il n'y a PAS de repli sur la dernière version : `apply_experience_blueprint
   * _version` filtre sur `publication_status = 'published'` et lève sinon
   * « published blueprint version not found ». Se rabattre sur le dernier
   * brouillon donnait donc un bouton qui échouait à tous les coups, et sur le
   * chemin le plus courant qui soit : un modèle sorti de « Partir d'un modèle
   * prêt » naît en v1 brouillon, jamais publié. Le commerçant cliquait
   * « Appliquer v1 » et lisait « Modèle ou version introuvable » — sur un modèle
   * affiché sous ses yeux, avec le bouton qui l'aurait débloqué juste à côté et
   * rien pour dire qu'il fallait le presser d'abord. Vaut 0 quand rien n'est
   * publié : aucune version n'est applicable, et `canApply` est faux.
   */
  applicableVersion: number;
  canPublish: boolean;
  canApply: boolean;
  /** Pourquoi l'application est refusée — affiché plutôt que deviné au clic. */
  blockedReason:
    | "no_version"
    | "incompatible"
    | "not_published"
    | "module_inactive"
    | null;
}

export function decideBlueprintActions(
  input: BlueprintDecisionInput,
): BlueprintDecision {
  const applicableVersion = input.publishedVersion ?? 0;
  const canPublish = input.latestStatus === "draft" && input.latestVersion > 0;

  // L'ordre compte : un modèle vide n'est pas « incompatible », et un modèle
  // illisible ne devient pas applicable parce que le module est actif.
  // `incompatible` passe AVANT `not_published` parce que les deux motifs ne
  // demandent pas la même chose : « publiez-le » est une consigne exécutable en
  // un clic, « réécrivez le contenu » est un mur. Annoncer le clic alors que le
  // mur existe enverrait le commerçant vers un « Figer et publier » qui bute à
  // son tour sur `is_valid_experience_blueprint_payload` — deux échecs pour un
  // seul problème. On nomme le blocage terminal en premier.
  const blockedReason =
    input.latestVersion <= 0
      ? ("no_version" as const)
      : input.compatibilityError !== null
        ? ("incompatible" as const)
        : input.publishedVersion === null
          ? ("not_published" as const)
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
