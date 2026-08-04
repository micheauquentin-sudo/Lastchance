import "server-only";

import { getUserAndOrg } from "@/lib/auth";
import { reportError } from "@/lib/monitoring";
import {
  BROUILLONS_NON_PAYES_MAX,
  capacitesModule,
  type CapacitesModule,
} from "@/lib/module-capabilities";
import { RESSOURCE_MODULE, publicationBooleenne } from "@/lib/module-resources";
import { droitEffectifModule, type GrantableModule } from "@/lib/subscription";
import { createClient } from "@/lib/supabase/server";

/**
 * LE PONT — assemble l'organisation active, son droit effectif et son compte
 * de brouillons en un verdict `CapacitesModule`.
 *
 * Une seule fonction pour les neuf modules et pour toutes les surfaces du
 * dashboard : c'est ce qui garantit qu'une page ne peut pas décider autrement
 * qu'une autre. Les trois pièces qu'elle assemble vivent chacune ailleurs et
 * restent testables sans elle — le droit dans `droitEffectifModule`, la
 * conséquence dans `capacitesModule`, la localisation dans `RESSOURCE_MODULE`.
 */
export async function capacitesDuModule(
  module: GrantableModule,
): Promise<CapacitesModule> {
  const { organization, role } = await getUserAndOrg();

  if (!organization || !role) {
    return capacitesModule({
      module,
      role: null,
      droitEffectif: false,
      brouillonsExistants: 0,
    });
  }

  // `organization` porte `live_module_grants`, renseigné par `getUserAndOrg`.
  // C'est la seule raison pour laquelle ce verdict peut différer de celui
  // qu'aurait rendu la même fonction avant le chargeur : un octroi daté.
  const droitEffectif = droitEffectifModule(module, organization);

  // Le compte n'est demandé QUE s'il peut changer quelque chose. Un module
  // payé n'a pas de limite de brouillon, donc pas de requête : les pages d'un
  // commerçant abonné ne paient rien pour une règle qui ne les concerne pas.
  const brouillonsExistants = droitEffectif
    ? 0
    : await compterBrouillons(module, organization.id);

  return capacitesModule({ module, role, droitEffectif, brouillonsExistants });
}

/**
 * Combien de ressources NON PUBLIÉES ce module porte-t-il déjà ?
 *
 * Lu par le client RLS et non par le service_role : la question porte sur les
 * données de l'organisation où l'on se trouve, et la RLS sait déjà répondre à
 * ça. Y mettre le service_role élargirait le rayon d'action d'un compte pour
 * un comptage que le rôle courant peut faire lui-même.
 *
 * ── LE SENS DE L'ERREUR, ET IL EST INVERSE DE CELUI DU CHARGEUR D'OCTROIS ──
 *
 * Une panne rend `BROUILLONS_NON_PAYES_MAX`, donc referme la création. Le
 * chargeur d'octrois, lui, dégrade vers le refus AUSSI — les deux vont dans le
 * même sens, mais pour des raisons différentes qu'il vaut mieux ne pas
 * confondre : là-bas on refuse un droit payé, ce qui est un coût ; ici on
 * refuse un brouillon supplémentaire, ce qui est un inconvénient. Rendre 0 sur
 * panne aurait transformé une base indisponible en quota illimité.
 */
async function compterBrouillons(
  module: GrantableModule,
  organizationId: string,
): Promise<number> {
  const { table, colonnePublication, valeursPubliees } = RESSOURCE_MODULE[module];
  const supabase = await createClient();

  const base = supabase
    .from(table)
    .select("id", { count: "exact", head: true })
    .eq("organization_id", organizationId);

  // Deux formes de filtre pour deux formes de colonne. PostgREST ne traite pas
  // un booléen comme un texte : `not(enabled, in, (true))` rend un compte vide
  // au lieu d'une erreur, c'est-à-dire un quota qui ne borne rien.
  const requete = publicationBooleenne(module)
    ? base.eq(colonnePublication, false)
    : base.not(colonnePublication, "in", `(${valeursPubliees.join(",")})`);

  const { count, error } = await requete;
  if (error) {
    reportError("module-capabilities-server", error);
    return BROUILLONS_NON_PAYES_MAX;
  }
  return count ?? BROUILLONS_NON_PAYES_MAX;
}
