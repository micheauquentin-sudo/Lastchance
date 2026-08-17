import "server-only";

import { LIBELLE_ETAT, type EtatOctroi } from "@/lib/admin/module-grants";
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
 * UN OCTROI VIVANT BORNÉ À CETTE RESSOURCE EXISTE-T-IL ?
 *
 * ── LE DÉFAUT QU'IL FERME, ET IL AVAIT ÉTÉ MESURÉ ──
 *
 * SD-5 a rendu le pass « Saison de pronostics » borné à UNE compétition : la
 * migration 20260925120000 écrit `resource_id` sur l'octroi, et le voisin
 * ci-dessus l'EXCLUT désormais du module entier — c'est ce que fait sa ligne
 * `.is("resource_id", null)`, et c'est juste. Mais la moitié SQL du correctif
 * (`org_has_live_resource_grant`, `org_has_module_access_for_resource`) n'avait
 * aucune contrepartie TypeScript. Résultat : le commerçant payait 39 €, la base
 * le laissait publier son championnat, et les deux surfaces de LECTURE le
 * refusaient — le joueur sur « Ce championnat est momentanément désactivé », le
 * dashboard sur « la publication demande d'ouvrir ce module ». Un droit que la
 * base accorde et que l'écran refuse : exactement le défaut que
 * `chargerOctroisVivants` avait fermé au niveau du module, rouvert un cran plus
 * bas par la ressource.
 *
 * ── LE PRÉDICAT EST CELUI DE `org_has_live_resource_grant`, MOT POUR MOT ──
 *
 * Y compris son premier terme : `p_resource_id is not null` y rend `false`
 * plutôt que de se rabattre sur le module entier, et la garde ci-dessous en est
 * le miroir. Le repli appartient à l'APPELANT, qui le fait explicitement — de
 * même que `org_has_module_access_for_resource` compose les deux en SQL au lieu
 * de les confondre en une fonction qui déciderait toute seule.
 *
 * ── LE SENS DE L'ERREUR EST CELUI DE SES VOISINS ──
 *
 * Une panne rend `false`, donc un refus, jamais un droit. Comme
 * `chargerOctroisVivants` : refermer ce qui a été payé se voit et se signale,
 * ouvrir ce qui ne l'a pas été ne se voit pas.
 */
export async function octroiRessourceVivant(
  organizationId: string,
  module: GrantableModule,
  resourceId: string,
  maintenant = new Date(),
): Promise<boolean> {
  // Miroir du `p_resource_id is not null` du SQL. `tsc` interdit déjà le `null`,
  // mais pas la chaîne vide — qui filtrerait sur rien et pourrait faire remonter
  // un octroi borné à une AUTRE ressource si la colonne était vide en base.
  if (!resourceId) return false;

  const admin = createAdminClient();
  const iso = maintenant.toISOString();

  const { data, error } = await admin
    .from("organization_module_grants")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("module", module)
    .eq("resource_id", resourceId)
    .is("revoked_at", null)
    .not("starts_at", "is", null)
    .lte("starts_at", iso)
    .or(`ends_at.is.null,ends_at.gt.${iso}`)
    .limit(1);

  if (error) {
    reportError("module-grants-loader", error);
    return false;
  }
  return (data ?? []).length > 0;
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

/** L'état du module et les deux dates qui l'expliquent. */
export interface EtatOctroiModule {
  etat: EtatOctroi;
  /** Fin de la fenêtre de jeu, `null` si l'octroi n'a pas de terme connu. */
  endsAt: string | null;
  /** Dernier instant où l'octroi pouvait démarrer, `null` si sans limite. */
  activateBy: string | null;
}

/**
 * Les six états connus, DÉRIVÉS du `Record` exhaustif du back-office et non
 * recopiés : un septième état ajouté à `EtatOctroi` fait échouer `tsc` sur
 * `LIBELLE_ETAT` avant d'arriver ici, et cette liste suit sans qu'on y pense.
 * Une liste recopiée aurait laissé passer l'état neuf comme un état inconnu.
 */
const ETATS_CONNUS: ReadonlySet<string> = new Set(Object.keys(LIBELLE_ETAT));

/**
 * POURQUOI CE MODULE EST FERMÉ — la raison, pas le verdict.
 *
 * Les deux chargeurs voisins répondent « qu'est-ce qui est ouvert ? » ; celui-ci
 * répond « et sinon, pourquoi pas ? ». Il existe parce que « aucun droit » et
 * « le pass que vous avez payé s'est terminé le 3 mars » sont deux vécus
 * distincts qu'un booléen confond : le commerçant qui a payé et dont la fenêtre
 * s'est refermée voyait exactement le même écran que celui qui n'a jamais rien
 * acheté — donc une invitation à découvrir, là où il attendait une explication.
 *
 * ── CE N'EST PAS UNE GARDE, ET LE SENS DE L'ERREUR LE DIT ──
 *
 * Aucun appelant ne doit décider d'un DROIT là-dessus : le droit se décide dans
 * `droitEffectifModule` (miroir d'`org_has_module_access`) et en base. Ce que
 * cette fonction alimente est une PHRASE. D'où une panne qui rend `null`, comme
 * l'absence d'octroi : le message retombe sur le générique — on dégrade vers le
 * vague, jamais vers le faux, et jamais vers un droit accordé.
 *
 * ── L'ADMIN CLIENT, POUR LA MÊME RAISON QUE SES VOISINS ──
 *
 * `org_module_grant_state` est révoquée à `authenticated` : elle est `security
 * definer` et lit une table dont la RLS ne s'ouvre pas au commerçant. Le client
 * RLS obtiendrait un refus de permission, pas une liste vide — c'est-à-dire un
 * message dégradé pour tout le monde.
 *
 * La RPC ne rend qu'UNE ligne (`limit 1`), l'octroi le plus favorable au client :
 * un pass terminé posé par-dessus un récurrent vivant rend `live`, jamais
 * `expired`. C'est ce qui empêche cette fonction de contredire le droit.
 */
export async function etatOctroiModule(
  organizationId: string,
  module: GrantableModule,
  maintenant = new Date(),
): Promise<EtatOctroiModule | null> {
  const admin = createAdminClient();

  const { data, error } = await admin.rpc("org_module_grant_state", {
    p_organization_id: organizationId,
    p_module: module,
    p_now: maintenant.toISOString(),
  });

  if (error) {
    reportError("module-grants-loader", error);
    return null;
  }

  const ligne = (data ?? [])[0];
  // Aucune ligne : cette organisation n'a JAMAIS rien acheté sur ce module.
  if (!ligne) return null;

  if (!ETATS_CONNUS.has(ligne.state)) {
    // Un état que le TypeScript ne sait pas nommer ne doit pas devenir une
    // phrase : le rendre ferait écrire au commerçant un mot de vocabulaire
    // Postgres, ou pire, une branche de message choisie au hasard.
    reportError(
      "module-grants-loader",
      new Error(`état d'octroi inconnu : ${ligne.state}`),
    );
    return null;
  }

  return {
    etat: ligne.state as EtatOctroi,
    // `?? null` malgré des types générés non nullables : les colonnes le sont
    // en base (`returns table` ne porte pas la nullabilité), et un `undefined`
    // qui traverse jusqu'à `formatDate` rendrait « Invalid Date ».
    endsAt: ligne.ends_at ?? null,
    activateBy: ligne.activate_by ?? null,
  };
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
