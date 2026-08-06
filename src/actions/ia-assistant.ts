"use server";

import { redirect } from "next/navigation";
import { getUserAndOrg } from "@/lib/auth";
import { getIaProvider, isIaConfigured } from "@/lib/ia-provider";
import { reportError } from "@/lib/monitoring";
import { RATE_LIMITS, rateLimit, rateLimitBucket } from "@/lib/rate-limit";
import type { ActionResult } from "@/lib/utils";
import {
  campaignBlueprintSchema,
  type CampaignBlueprintParsed,
} from "@/lib/validations/campaign-templates";
import { suggererIdeesInputSchema } from "@/lib/validations/ia-assistant";
import type { ExperienceObjective } from "@/platform/experiences/catalog";

/**
 * Assistant de CRÉATION IA — action serveur.
 *
 * QUATRE INVARIANTS, vérifiables en lisant ce fichier :
 *
 *  1. DORMANT SANS CLÉ. `isIaConfigured()` gouverne : l'action refuse côté
 *     SERVEUR (message métier « Assistant indisponible », jamais « clé
 *     absente ») avant tout appel réseau. Une action reste POSTable même quand
 *     l'UI la cache.
 *
 *  2. L'IA PROPOSE, LE COMMERÇANT VALIDE. Rien ici ne publie, ne paie, ne crée
 *     de brouillon : on rend des propositions ÉDITABLES. Chaque idée passe
 *     `campaignBlueprintSchema` (le contrat déjà porteur des invariants métier)
 *     — une idée invalide est ÉCARTÉE, jamais renvoyée telle quelle.
 *
 *  3. AUCUNE PII. Le modèle ne reçoit qu'un objet BLANC-LISTÉ à la main
 *     (`organization.name`, `typeCommerce` saisi, `objectif` enum). JAMAIS
 *     l'objet `Organization` entier — il porte `stripe_customer_id`,
 *     `webhook_secret`, `webhook_url`, `comp_access_note`. Aucune donnée joueur.
 *
 *  4. BORNÉ. Rôle owner|editor, plafond par organisation puis par opérateur,
 *     les deux `failClosed`.
 */

const NOT_EDITOR = "Action non autorisée";
const INDISPONIBLE = "Assistant indisponible";
const TROP_DE_DEMANDES = "Trop de demandes, réessayez dans un moment.";
const GENERIC_ERROR = "Une erreur est survenue, réessayez.";

/** Une idée de campagne PROPOSÉE : un blueprint déjà validé, éditable. */
export type IdeeCampagne = { blueprint: CampaignBlueprintParsed };

export async function suggererIdeesCampagne(input: {
  typeCommerce: string;
  objectif: ExperienceObjective;
}): Promise<ActionResult<{ idees: IdeeCampagne[] }>> {
  const parsed = suggererIdeesInputSchema.safeParse({
    typeCommerce: input.typeCommerce,
    objectif: input.objectif,
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0].message };
  }

  const { user, organization, role } = await getUserAndOrg();
  if (!user || !organization) redirect("/login");
  if (role !== "owner" && role !== "editor") {
    return { ok: false, error: NOT_EDITOR };
  }

  // Refus SERVEUR si l'assistant n'est pas configuré. Message métier — JAMAIS
  // « clé absente » : l'état de configuration ne fuit pas à l'écran.
  if (!isIaConfigured()) {
    return { ok: false, error: INDISPONIBLE };
  }

  // Plafond par ORGANISATION d'abord (borne la facture totale, quel que soit le
  // nombre d'éditeurs), puis par OPÉRATEUR (org, user) — les deux `failClosed`,
  // clés d'opérateur authentifié résolues avant le seau (ADR-032).
  const orgAutorisee = await rateLimit(
    rateLimitBucket("ia:suggest:org", organization.id),
    RATE_LIMITS.iaSuggestionOrg,
    { failClosed: true },
  );
  if (!orgAutorisee) return { ok: false, error: TROP_DE_DEMANDES };

  const operateurAutorise = await rateLimit(
    rateLimitBucket("ia:suggest", organization.id, user.id),
    RATE_LIMITS.iaSuggestionRequest,
    { failClosed: true },
  );
  if (!operateurAutorise) return { ok: false, error: TROP_DE_DEMANDES };

  const provider = getIaProvider();
  if (!provider) return { ok: false, error: INDISPONIBLE };

  // PII — objet BLANC-LISTÉ À LA MAIN, jamais un spread ni un `select *` :
  // seuls le NOM, le type saisi et l'objectif partent au modèle.
  let brut: unknown[];
  try {
    brut = await provider.suggererBlueprints({
      organizationName: organization.name,
      typeCommerce: parsed.data.typeCommerce,
      objectif: parsed.data.objectif,
    });
  } catch (err) {
    reportError("ia-assistant.suggest", err);
    return { ok: false, error: GENERIC_ERROR };
  }

  // Chaque idée passe le contrat `campaignBlueprintSchema` : une idée qui échoue
  // est écartée. Si moins de 3 sont valides, on rend ce qui l'est — on n'invente
  // rien.
  const idees: IdeeCampagne[] = [];
  for (const candidat of brut) {
    if (idees.length >= 3) break;
    const valide = campaignBlueprintSchema.safeParse(candidat);
    if (valide.success) {
      idees.push({ blueprint: valide.data });
    }
  }

  return { ok: true, data: { idees } };
}
