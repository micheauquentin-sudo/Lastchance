import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";

/**
 * Vocabulaire des modules dont on compte les OUVERTURES de page publique.
 *
 * Volontairement distinct de `reward_issuances.source_type` et aligné sur
 * `organization_module_grants.module` : on compte l'ouverture d'un MODULE.
 * Ce dépôt fait cohabiter trois vocabulaires proches (`hunt`/`hunts`,
 * `contest`/`pronostics`) ; se tromper de liste produit un compteur qui ne
 * s'incrémente jamais, sans erreur nulle part.
 *
 * Les trois modules absents le sont pour trois raisons distinctes :
 *  - `wheel` compte déjà dans `qr_codes.scan_count` ;
 *  - `referral` n'a pas de QR commerçant (lien fabriqué côté joueur) ;
 *  - `hunts` affiche une affiche PAR ÉTAPE — un compteur unique confondrait
 *    des étapes distinctes.
 *
 * Cette liste DOIT rester égale au `check` de `module_page_opens.module`
 * (migration 20260911120000) : une valeur ici absente du CHECK ferait lever la
 * RPC, une valeur du CHECK absente ici serait un module jamais compté.
 */
export const MODULE_PAGE_OPEN_KEYS = [
  "quiz",
  "calendar",
  "jackpot",
  "pronostics",
  "loyalty",
  "events",
] as const;

export type ModulePageOpenKey = (typeof MODULE_PAGE_OPEN_KEYS)[number];

export function isModulePageOpenKey(
  value: string | null,
): value is ModulePageOpenKey {
  return (
    value !== null &&
    (MODULE_PAGE_OPEN_KEYS as readonly string[]).includes(value)
  );
}

/**
 * Lit les compteurs d'ouvertures de plusieurs ressources d'un même module.
 *
 * Le client est passé en argument plutôt qu'importé : ce fichier reste ainsi
 * sans dépendance d'exécution (les deux imports ci-dessus sont des types, donc
 * effacés à la compilation) et le beacon CLIENT peut en importer le type sans
 * tirer `@/lib/supabase/*` dans le bundle navigateur.
 *
 * La RLS fait le cloisonnement : la policy `module_page_opens: member select`
 * filtre sur `is_org_member`. Une ressource sans ligne n'a jamais été ouverte
 * — on rend 0 plutôt que `undefined`, l'écran devant afficher « 0 ouverture »
 * et non un blanc.
 */
export async function readModulePageOpenCounts(
  client: SupabaseClient<Database>,
  moduleKey: ModulePageOpenKey,
  resourceIds: readonly string[],
): Promise<Record<string, number>> {
  const counts: Record<string, number> = {};
  for (const id of resourceIds) counts[id] = 0;
  if (resourceIds.length === 0) return counts;

  const { data } = await client
    .from("module_page_opens")
    .select("resource_id, open_count")
    .eq("module", moduleKey)
    .in("resource_id", [...resourceIds]);

  for (const row of data ?? []) counts[row.resource_id] = row.open_count;
  return counts;
}

/** Compteur d'une ressource unique. 0 si elle n'a jamais été ouverte. */
export async function readModulePageOpenCount(
  client: SupabaseClient<Database>,
  moduleKey: ModulePageOpenKey,
  resourceId: string,
): Promise<number> {
  const counts = await readModulePageOpenCounts(client, moduleKey, [resourceId]);
  return counts[resourceId] ?? 0;
}
