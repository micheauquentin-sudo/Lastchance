import "server-only";

import { reportError } from "@/lib/monitoring";
import { GRANTABLE_MODULES, type GrantableModule } from "@/lib/subscription";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * CHARGEUR DES OCTROIS VIVANTS — le maillon qui manquait au lot 2.
 *
 * ── LE DÉFAUT QU'IL FERME ──
 *
 * Le lot 2 (migration 20260907120000) a livré la table des octrois datés, la
 * garde SQL qui les lit (`org_has_module_access`) et le miroir TypeScript qui
 * les attend (`live_module_grants`). Il n'a livré AUCUN chargeur : le champ
 * était optionnel, personne ne le renseignait, et son propre docstring écrivait
 * la conséquence — « un appelant qui ne renseigne pas ce champ refusera un
 * droit que la base accorde ».
 *
 * Ce n'était donc pas une capacité à moitié faite, c'était une capacité dont
 * la moitié VISIBLE refusait ce que la moitié invisible accordait. Un
 * commerçant à qui le back-office venait d'accorder la Chasse au trésor voyait
 * son dashboard la lui refuser.
 *
 * ── POURQUOI LE PRÉDICAT EST EN SQL ET NON EN TYPESCRIPT ──
 *
 * `estVivant` (src/lib/admin/module-grants.ts) calcule la même chose et son
 * en-tête interdit expressément de s'en servir ici : « CONFORT D'AFFICHAGE,
 * jamais une garde […] le jour où quelqu'un s'en sert pour décider d'un droit,
 * il aura déplacé la décision du seul endroit qui la tienne ». Les quatre
 * conditions ci-dessous sont donc écrites en `where`, mot pour mot celles de
 * `org_has_live_module_grant`, et elles empruntent l'index partiel
 * `organization_module_grants_vivants_idx` posé pour exactement cette question.
 *
 * ── LE SENS DE L'ERREUR EST DÉLIBÉRÉ ──
 *
 * Une panne rend une liste VIDE, donc un refus, jamais un octroi. Un chargeur
 * qui échouerait ouvert accorderait des modules payants à la faveur d'une
 * coupure réseau ; celui-ci referme ce que le commerçant a payé, ce qui se
 * voit et se signale. On dégrade vers le refus.
 *
 * ── CE QU'IL COUVRE, ET DEPUIS QUAND ──
 *
 * Le dashboard (via `getUserAndOrg`) ET les huit contextes PUBLICS — quiz,
 * parrainage, calendrier, événement, chasse, fidélité, jackpot, pronostics —
 * qui passent par `module-acces-public.ts`.
 *
 * Ce paragraphe a longtemps dit l'inverse : « les huit contextes publics ne
 * renseignent pas `live_module_grants` […] le jour où un paiement en crée,
 * ils doivent appeler ce chargeur ». C'était vrai à l'écriture, et le lot P0.4
 * l'a fermé sans corriger cette phrase — qui a ensuite failli faire rouvrir un
 * travail déjà livré. Une note « ce qui reste à faire » survit à ce qu'elle
 * décrit ; celle-ci dit désormais l'état, pas l'intention.
 */
export async function chargerOctroisVivants(
  organizationId: string,
  maintenant = new Date(),
): Promise<GrantableModule[]> {
  const admin = createAdminClient();
  const iso = maintenant.toISOString();

  const { data, error } = await admin
    .from("organization_module_grants")
    .select("module")
    .eq("organization_id", organizationId)
    // LE MIROIR DU CORRECTIF SD-5 (migration 20260925120000). Un octroi porteur
    // d'un `resource_id` est vendu pour UNE ressource — une compétition de
    // pronostics — et n'ouvre pas le module entier : c'est ce que
    // `org_has_live_module_grant` dit désormais côté SQL. Sans cette ligne, le
    // chargeur rendrait `pronostics` pour un pass borné à un championnat, et
    // l'écran ouvrirait tous les autres.
    .is("resource_id", null)
    .is("revoked_at", null)
    .not("starts_at", "is", null)
    .lte("starts_at", iso)
    .or(`ends_at.is.null,ends_at.gt.${iso}`);

  if (error) {
    reportError("module-grants-loader", error);
    return [];
  }

  const connus = new Set<string>(GRANTABLE_MODULES);
  const modules = new Set<GrantableModule>();
  for (const ligne of data ?? []) {
    const nomModule = (ligne as { module: string }).module;
    // Un module inconnu de l'application est IGNORÉ et signalé, jamais rendu.
    // La base contraint déjà le vocabulaire par un `check` ; s'il diverge un
    // jour, laisser passer la valeur ferait porter un droit par une chaîne que
    // rien côté TypeScript ne sait interpréter.
    if (!connus.has(nomModule)) {
      reportError(
        "module-grants-loader",
        new Error(`module inconnu dans un octroi : ${nomModule}`),
      );
      continue;
    }
    modules.add(nomModule as GrantableModule);
  }
  return [...modules];
}

/**
 * Ce que la base répond à « ce module est-il déjà tenu par un récurrent ? ».
 * Trois valeurs et non un booléen : l'indécision n'est pas un « non ».
 */
export type VerdictRecurrent = "actif" | "aucun" | "indetermine";

/**
 * CE MODULE EST-IL DÉJÀ TENU PAR UN OCTROI RÉCURRENT ?
 *
 * ── LA RÈGLE PRODUIT QU'IL SERT ──
 *
 * « Un commerçant ne peut pas racheter un add-on mensuel qu'il a déjà actif. »
 * Il en a déjà un ; le second ne lui donnerait rien de plus et le prélèverait
 * deux fois. Ce qui est interdit est le CUMUL, jamais le retour : un octroi
 * révoqué ne compte plus, donc reprendre en mars ce qu'on a résilié en janvier
 * reste possible.
 *
 * ── CE N'EST PAS LA GARDE, C'EST LE CONFORT ──
 *
 * La garde est en base : l'index unique partiel
 * `organization_module_grants_recurrent_vivant_idx` (20260910120000). Elle y
 * est parce qu'entre le moment où cette fonction répond et celui où le webhook
 * écrit, un double clic ouvre une fenêtre que deux sessions de paiement
 * traversent. Une vérification applicative ne peut pas fermer cette course :
 * seule une contrainte d'unicité le peut.
 *
 * Ce que cette fonction achète est autre chose, et ce n'est pas rien : dire au
 * commerçant « vous l'avez déjà » AVANT qu'il ne sorte sa carte, plutôt que de
 * le laisser payer pour se faire refuser après.
 *
 * ── LE PRÉDICAT EST CELUI DE L'INDEX, MOT POUR MOT ──
 *
 * Et non celui d'`org_has_live_module_grant`, qui parle du temps (`starts_at <=
 * now`) là où un prédicat d'index ne le peut pas. Les faire diverger rendrait
 * l'écran plus permissif que la base : le bouton s'afficherait, le paiement
 * partirait, et le refus tomberait au moment de l'octroi — c'est-à-dire après
 * le débit.
 *
 * ── L'ERREUR REFUSE LA VENTE, ELLE NE L'AUTORISE PAS ──
 *
 * Sens inverse de `chargerOctroisVivants`, qui dégrade vers le refus d'ACCÈS.
 * Ici l'indécision doit refuser la VENTE : ne pas savoir s'il l'a déjà, puis
 * vendre quand même, c'est le double prélèvement dont on ne saura dire s'il
 * était volontaire. Un commerçant à qui l'on demande de réessayer dans une
 * minute perd une minute.
 */
export async function octroiRecurrentVivant(
  organizationId: string,
  module: GrantableModule,
): Promise<VerdictRecurrent> {
  const admin = createAdminClient();

  const { data, error } = await admin
    .from("organization_module_grants")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("module", module)
    .eq("kind", "recurring")
    .is("revoked_at", null)
    .is("ends_at", null)
    .limit(1);

  if (error) {
    reportError("module-grants-loader", error);
    return "indetermine";
  }
  return (data ?? []).length > 0 ? "actif" : "aucun";
}

/** Un pass payé, pas encore démarré. */
export interface OctroiEnAttente {
  id: string;
  module: GrantableModule;
  /** Dernier instant où il peut démarrer, `null` si sans limite. */
  activateBy: string | null;
}

/**
 * LES PASS ACHETÉS QUI ATTENDENT LEUR DÉMARRAGE.
 *
 * Miroir de `chargerOctroisVivants` : celui-là rend ce qui OUVRE un module,
 * celui-ci rend ce qui l'ouvrira quand le commerçant l'aura décidé. Le
 * critère est exactement l'inverse — `starts_at is null`, l'état `pending` de
 * `org_module_grant_state`.
 *
 * ── LES EXPIRÉS SONT EXCLUS ICI, PAS SEULEMENT GRISÉS À L'ÉCRAN ──
 *
 * Un pass dont la fenêtre d'activation est passée ne démarrera plus : la RPC
 * le refuse. Le proposer quand même donnerait un bouton qui n'aboutit pas, et
 * la règle du dépôt est que ce qui est proposé est ce qui aboutit. Le
 * commerçant qui a laissé filer ses 90 jours a besoin d'une explication, pas
 * d'un bouton — et cette explication n'est pas du ressort d'un chargeur.
 */
export async function chargerOctroisEnAttente(
  organizationId: string,
  maintenant = new Date(),
): Promise<OctroiEnAttente[]> {
  const admin = createAdminClient();
  const iso = maintenant.toISOString();

  const { data, error } = await admin
    .from("organization_module_grants")
    .select("id, module, activate_by")
    .eq("organization_id", organizationId)
    .is("revoked_at", null)
    .is("starts_at", null)
    .or(`activate_by.is.null,activate_by.gt.${iso}`);

  if (error) {
    reportError("module-grants-loader", error);
    return [];
  }

  const connus = new Set<string>(GRANTABLE_MODULES);
  const attente: OctroiEnAttente[] = [];
  for (const ligne of data ?? []) {
    const l = ligne as { id: string; module: string; activate_by: string | null };
    // Même prudence que le chargeur voisin : un module inconnu est signalé et
    // ignoré, jamais rendu à un écran qui en ferait un bouton.
    if (!connus.has(l.module)) {
      reportError(
        "module-grants-loader",
        new Error(`module inconnu dans un octroi en attente : ${l.module}`),
      );
      continue;
    }
    attente.push({
      id: l.id,
      module: l.module as GrantableModule,
      activateBy: l.activate_by,
    });
  }
  return attente;
}
