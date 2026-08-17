import "server-only";

import { getUserAndOrg } from "@/lib/auth";
import { reportError } from "@/lib/monitoring";
import {
  BROUILLONS_NON_PAYES_MAX,
  capacitesModule,
  type CapacitesModule,
} from "@/lib/module-capabilities";
import { etatOctroiModule } from "@/lib/module-grants-loader";
import { RESSOURCE_MODULE, publicationBooleenne } from "@/lib/module-resources";
import { droitEffectifModule, type GrantableModule } from "@/lib/subscription";
import { createClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/utils";
import type { MemberRole } from "@/types/database";

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

  return capacitesModule({
    module,
    role,
    droitEffectif,
    brouillonsExistants,
    passTermineLe: await finDuPassExpire(module, organization, droitEffectif, role),
  });
}

/**
 * LE PASS EST-IL TERMINÉ, ET QUAND — la nuance que le refus taisait.
 *
 * Sans cette lecture, un commerçant dont le pass s'est refermé lisait la phrase
 * écrite pour celui qui n'a jamais rien acheté : « Préparez … librement. » Il
 * avait payé, ses campagnes programmées venaient de retomber en pause
 * (`paused_reason = 'droit_expire'`, migration 20260926120000) et l'écran lui
 * proposait de découvrir. La date est ce qui transforme ce refus en information.
 *
 * ── TROIS GARDES AVANT LA REQUÊTE, ET CHACUNE ÉCONOMISE UN APPEL ──
 *
 * Un module PAYÉ n'a rien à expliquer ; un CAISSIER est refusé sur son rôle
 * avant que l'argent n'entre en jeu ; et un état d'octroi autre qu'`expired`
 * n'écrit aucune phrase. Même discipline que `compterBrouillons` juste en
 * dessous : la lecture n'est demandée que si elle peut changer ce qui s'affiche.
 *
 * ── `revoked` N'EST PAS `expired`, DÉLIBÉRÉMENT ──
 *
 * Un octroi révoqué (résiliation, remboursement) reste un `droit_absent` sans
 * message particulier : « votre pass s'est terminé le … » raconterait une fin
 * naturelle là où il y a eu un geste — le plus souvent celui du commerçant
 * lui-même — et la date de fin d'un octroi révoqué n'est pas celle de sa
 * révocation. Seule une FENÊTRE ARRIVÉE À TERME se raconte ici.
 */
async function finDuPassExpire(
  module: GrantableModule,
  organization: { id: string; timezone: string | null },
  droitEffectif: boolean,
  role: MemberRole,
): Promise<string | null> {
  if (droitEffectif || role === "cashier") return null;

  const etat = await etatOctroiModule(organization.id, module);
  if (!etat || etat.etat !== "expired" || !etat.endsAt) return null;
  return formatDate(etat.endsAt, organization.timezone ?? undefined);
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
  const { table, valeursPubliees } = RESSOURCE_MODULE[module];
  // Lue en `string` DÉLIBÉRÉMENT. `table` est variable : le client typé réduit
  // les colonnes connues à l'intersection des neuf tables, où ni `status` ni
  // `enabled` ne figurent — passer ici le littéral ne prouverait donc rien et
  // ne ferait que refuser de compiler. L'existence de la colonne SUR SA TABLE
  // est vérifiée là où elle est vérifiable, c'est-à-dire à la déclaration de
  // `RESSOURCE_MODULE` (voir `RessourceModuleTypee` dans module-resources.ts).
  const colonnePublication: string = RESSOURCE_MODULE[module].colonnePublication;
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
