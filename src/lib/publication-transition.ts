/**
 * ── TRADUIRE UN REFUS DE PUBLICATION EN PHRASE DE COMMERÇANT ──
 *
 * Depuis `20260905120000_p0_gardes_publication.sql`, la colonne de publication
 * des neuf modules n'est plus écrivable par `authenticated` : chaque module
 * passe par une RPC de transition qui porte le rôle, le droit de module et le
 * droit effectif d'abonnement.
 *
 * Une RPC qui refuse ne rend pas une phrase, elle lève un code — et un code qui
 * arrive brut dans l'écran devient « Erreur inattendue ». C'est une régression
 * d'expérience même quand la sécurité est meilleure : le commerçant qui lisait
 * « Le module Chasse au trésor n'est pas activé sur votre compte » se
 * retrouverait devant un message qui ne lui dit ni ce qui s'est passé, ni quoi
 * faire. Ce module fait la traduction, et rien d'autre.
 *
 * ── POURQUOI LES PHRASES NE VIVENT PAS ICI ──
 *
 * Chaque module a déjà SON vocabulaire (« Chasse introuvable », « Programme
 * introuvable », le message d'accès de campagne qui distingue essai terminé et
 * abonnement résilié). Centraliser les phrases les uniformiserait, c'est-à-dire
 * les appauvrirait. Ce module classe le refus ; l'appelant nomme.
 *
 * ── CE QUE CE MODULE NE PROUVE PAS ──
 *
 * Il ne garantit pas que les gardes métier (≥ 2 étapes pour une chasse,
 * ≥ 1 question pour un quiz, dotation, cohérence des cases) sont bien passées
 * AVANT lui : elles vivent dans les actions, la RPC ne les connaît pas. Leur
 * ordre est vérifié dans les tests des actions, pas ici.
 */

/** Vocabulaire d'un module pour les quatre issues d'une transition refusée. */
export type TextesTransition = {
  /** La RPC a rendu `false` : aucune ligne de cette organisation à cet id. */
  introuvable: string;
  /** `module access required: …` — addon éteint ou abonnement sans accès. */
  module: string;
  /** `not authorized` — l'appelant n'est ni owner ni editor de l'organisation. */
  role: string;
  /** Tout le reste : panne, statut hors vocabulaire, réponse inattendue. */
  echec: string;
};

/** Réponse `supabase.rpc()` réduite à ce que la décision regarde. */
export type ReponseTransition = {
  data: boolean | null;
  error: { message: string } | null;
};

/** Issue d'un appel de RPC de transition, avant toute mise en mots. */
export type IssueTransition = "ok" | "introuvable" | "module" | "role" | "echec";

/**
 * Classe la réponse d'une des huit RPC de transition.
 *
 * `data === false` vaut « introuvable » et non « échec » : les huit RPC rendent
 * `false` sur le seul cas où leur `select … for update` ne trouve rien, et
 * `true` aussi bien quand elles écrivent que quand le statut demandé est déjà
 * celui de la ligne (transition idempotente). Un `null` sans erreur n'est
 * produit par aucune d'elles — il tombe dans `echec`, faute de savoir quoi en
 * dire de vrai.
 *
 * Séparé de `refusTransition` parce qu'un appelant a besoin de la CLASSE et non
 * d'une phrase : le message d'accès des campagnes distingue essai terminé et
 * abonnement résilié, discriminant qui coûte une lecture `service_role` et ne
 * doit donc pas être calculé sur le chemin nominal.
 */
export function classerTransition(reponse: ReponseTransition): IssueTransition {
  const message = reponse.error?.message;
  if (message) {
    // `assert_module_publish_allowed` lève `module access required: <module>`.
    // Le test porte sur le préfixe et non sur le module : chaque appelant sait
    // déjà de quel module il parle, et le nom du module SQL n'est pas le nom
    // que le commerçant lit.
    if (message.includes("module access required")) return "module";
    if (message.includes("not authorized")) return "role";
    return "echec";
  }
  if (reponse.data === true) return "ok";
  if (reponse.data === false) return "introuvable";
  return "echec";
}

/** Rend `null` quand la transition est passée, sinon la phrase à afficher. */
export function refusTransition(
  reponse: ReponseTransition,
  textes: TextesTransition,
): string | null {
  const issue = classerTransition(reponse);
  return issue === "ok" ? null : textes[issue];
}
