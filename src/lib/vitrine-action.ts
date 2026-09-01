import type { ActionVitrine, PortesVitrineView } from "@/lib/vitrine";

/**
 * VIT-10 — LA PORTE D'UNE FICHE, ET LA SEULE RAISON POUR LAQUELLE ELLE S'OUVRE.
 *
 * ── « DÉSACTIVER PROPREMENT » NE DEMANDE AUCUN CODE ──
 *
 * Le cahier veut qu'une action disparaisse quand sa cible n'est plus publiée.
 * Comme `action` désigne un MODULE et non un objet, cette exigence devient une
 * INTERSECTION : la fiche dit « ouvre Réserver », `portes` dit ce que Réserver
 * a réellement d'ouvert, et le bouton n'existe que si les deux sont d'accord.
 *
 * Rien à propager le jour où le commerçant dépublie sa dernière activité :
 * `portes` cesse de la lister, et tous les boutons `reserver` de la carte
 * s'éteignent au même instant, sans qu'une seule ligne de fiche ait bougé.
 *
 * ── LES ANCRES PLUTÔT QUE DES ADRESSES ──
 *
 * La porte mène au BLOC de la même page, pas à une URL profonde. Deux raisons.
 * D'abord la vérité : `portes` peut lister trois activités, et choisir laquelle
 * ouvrir à la place du visiteur serait décider pour lui. Ensuite le coût : une
 * ancre ne charge rien, ne perd pas la place dans la carte, et laisse revenir
 * d'un geste — sur un téléphone tenu d'une main pendant un repas, ça compte.
 */

/** Les ancres posées par la page publique. Un seul jeu de noms. */
export const ANCRE_BOUSSOLE = "vitrine-boussole";
export const ANCRE_RESERVER = "vitrine-reserver";
export const ANCRE_EXPERIENCES = "vitrine-experiences";

/** Vers quel bloc chaque porte mène. */
const ANCRES: Record<ActionVitrine, string> = {
  boussole: ANCRE_BOUSSOLE,
  reserver: ANCRE_RESERVER,
  // Les offres à retirer vivent DANS le bloc Réserver — c'est la même porte.
  offre: ANCRE_RESERVER,
  quiz: ANCRE_EXPERIENCES,
  duo: ANCRE_EXPERIENCES,
  bande: ANCRE_EXPERIENCES,
};

export function hrefAction(action: ActionVitrine): string {
  return `#${ANCRES[action]}`;
}

/**
 * Ce module a-t-il vraiment quelque chose d'ouvert ?
 *
 * `bande` ÉTAIT TOUJOURS VRAI, et ne l'est plus (DUO-3b). Le jeu n'a rien à
 * configurer — pack par défaut, questions dans le code — donc rien n'y était à
 * refléter tant que le droit était inclus partout. DUO-2 l'a rendu vendable
 * seul : il se lit désormais sur le drapeau public, comme `duo`, qui exige lui
 * au moins deux options sur le plateau.
 */
export function actionOuverte(
  action: ActionVitrine,
  portes: PortesVitrineView,
  boussoleUtilisable: boolean,
): boolean {
  switch (action) {
    case "boussole":
      return boussoleUtilisable;
    case "reserver":
      return (
        portes.reserver.activites.length > 0 || portes.reserver.files.length > 0
      );
    case "offre":
      return portes.reserver.offres.length > 0;
    case "quiz":
      return portes.experiences.quiz.length > 0;
    case "duo":
      return portes.experiences.duo;
    case "bande":
      return portes.experiences.bande;
  }
}
