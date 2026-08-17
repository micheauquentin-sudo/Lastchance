import "server-only";

import {
  chargerOctroisVivants,
  octroiRessourceVivant,
} from "@/lib/module-grants-loader";
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
 *
 * ── LA RESSOURCE, QUAND LE MODULE ENTIER A DÉJÀ REFUSÉ ──
 *
 * Depuis SD-5 (migration 20260925120000), un pass peut être vendu pour UNE
 * ressource nommée — un championnat de pronostics — et n'ouvre alors pas le
 * module. `droitEffectifModule` et `chargerOctroisVivants` ne parlent que du
 * module ENTIER, et c'est voulu : un pass borné ne doit pas rouvrir les autres
 * championnats. Le résultat, tant que rien ne lisait la ressource ici, était
 * qu'un pass borné n'ouvrait RIEN — le joueur lisait « momentanément
 * désactivé » sur le championnat que le commerçant venait de payer.
 *
 * L'appelant qui a une ressource en main la passe donc, et cette fonction
 * devient le miroir de `org_has_module_access_for_resource` : le module entier
 * d'abord — il ouvre TOUTES les ressources —, la ressource seulement s'il a
 * refusé. Même ordre que le SQL, et pour la même raison qu'au paragraphe
 * précédent : la lecture supplémentaire n'est payée que par ceux dont elle peut
 * changer la réponse.
 */
export async function moduleOuvertAuJoueur<M extends GrantableModule>(
  module: M,
  org: ChampsModule<M> & { id: string },
  now = new Date(),
  ressource?: { resourceId: string },
): Promise<boolean> {
  if (droitEffectifModule(module, org, now)) return true;

  const live_module_grants = await chargerOctroisVivants(org.id, now);
  if (
    live_module_grants.length > 0 &&
    droitEffectifModule(module, { ...org, live_module_grants }, now)
  ) {
    return true;
  }

  // Aucune ressource fournie : le refus est définitif, et aucune lecture de plus
  // n'est faite. C'est le cas des sept autres contextes publics, dont aucun
  // module ne se vend à la ressource.
  if (!ressource) return false;

  return octroiRessourceVivant(org.id, module, ressource.resourceId, now);
}
