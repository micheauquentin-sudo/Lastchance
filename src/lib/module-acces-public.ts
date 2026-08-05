import "server-only";

import { chargerOctroisVivants } from "@/lib/module-grants-loader";
import {
  droitEffectifModule,
  type ChampsModule,
  type GrantableModule,
} from "@/lib/subscription";

/**
 * LE MODULE EST-IL OUVERT AU JOUEUR ? — la moitié publique du droit effectif.
 *
 * ── LE DÉFAUT QUE CETTE FONCTION FERME ──
 *
 * Le lot P0.3 a branché le chargeur d'octrois sur `getUserAndOrg`, donc sur
 * tout le dashboard. Les huit contextes PUBLICS chargent leur organisation par
 * leur propre requête et n'en bénéficiaient pas : un module ouvert par un
 * octroi seul restait fermé au joueur. Le commerçant voyait son quiz
 * publiable, le publiait, et son client tombait sur « Ce quiz n'est pas
 * disponible ».
 *
 * C'était sans effet tant qu'aucun chemin d'achat ne créait d'octroi — seul le
 * back-office en posait. Le lot P0.4 en crée : à partir de là, le défaut
 * devient la conséquence normale de la première vente d'add-on autonome.
 *
 * ── LA REQUÊTE SUPPLÉMENTAIRE N'EST PAYÉE QUE PAR CEUX QU'ELLE SERT ──
 *
 * Le droit effectif est un OU : un octroi ne peut qu'AJOUTER un droit, jamais
 * en retirer. Si la branche « add-on allumé ET abonnement actif » répond déjà
 * oui, la réponse finale est oui quoi qu'en disent les octrois — et il est
 * inutile d'aller les lire.
 *
 * Les octrois ne sont donc chargés que lorsque le premier calcul REFUSE. Un
 * commerçant abonné, c'est-à-dire le cas courant, ne paie rien ; celui qui n'a
 * acheté qu'un add-on autonome paie une lecture indexée sur la page de son
 * jeu. Ce n'est pas une optimisation opportuniste : c'est la seule forme qui
 * n'alourdit pas un chemin public pour une population qui n'en a pas besoin.
 *
 * ── POURQUOI PAS UN APPEL À LA GARDE SQL ELLE-MÊME ──
 *
 * `org_has_module_access` est l'autorité et un appel RPC coûterait le même
 * aller-retour. Elle n'est pourtant pas appelée ici, pour une raison de
 * cohérence : le dashboard décide avec `droitEffectifModule`, et deux surfaces
 * qui parlent du même commerçant ne doivent pas emprunter deux chemins de
 * décision différents. La parité entre le miroir TypeScript et la garde SQL
 * est éprouvée par `module-access-parity.test.ts`, qui LIT la migration.
 */
export async function moduleOuvertAuJoueur<M extends GrantableModule>(
  module: M,
  org: ChampsModule<M> & { id: string },
  now = new Date(),
): Promise<boolean> {
  if (droitEffectifModule(module, org, now)) return true;

  const live_module_grants = await chargerOctroisVivants(org.id, now);
  if (live_module_grants.length === 0) return false;

  return droitEffectifModule(module, { ...org, live_module_grants }, now);
}
