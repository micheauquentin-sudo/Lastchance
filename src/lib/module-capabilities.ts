import type { GrantableModule } from "@/lib/subscription";
import type { MemberRole } from "@/types/database";

/**
 * LES TROIS CAPACITÉS D'UN MODULE — découvrir, préparer, publier.
 *
 * Le cahier partagé (docs/codex-handoff.md §3) demande de « séparer et
 * revalider partout `canExplore`, `canEditDraft` et `canPublish` ». Aucun des
 * trois n'existait dans le dépôt : il n'y avait qu'un booléen d'accès par
 * module, et il gardait tout ou rien.
 *
 * ── POURQUOI TROIS ET NON UN ──
 *
 * Parce que le produit vend la publication, pas la découverte : « Le dashboard
 * donne accès à tout pour découvrir ; seule la PUBLICATION est verrouillée au
 * droit effectivement payé ». Un commerçant doit pouvoir préparer son
 * calendrier de l'Avent en octobre et ne payer qu'en décembre. Avec un booléen
 * unique, il ne voit rien avant d'avoir payé — donc il ne sait pas ce qu'il
 * achèterait.
 *
 * ── CE MODULE NE DÉCIDE PAS DU DROIT, IL EN TIRE LES CONSÉQUENCES ──
 *
 * `droitEffectif` est une ENTRÉE, pas un calcul. Le droit se décide dans
 * `droitEffectifModule` (miroir de `org_has_module_access`) et nulle part
 * ailleurs ; le recalculer ici fabriquerait la seconde source de vérité que le
 * commit précédent vient précisément de supprimer. Ce module ne parle ni à la
 * base, ni à React : il transforme trois faits en trois permissions et une
 * phrase.
 *
 * ── CE QU'IL NE GARDE PAS, ET CE N'EST PAS UN OUBLI ──
 *
 * `canPublish` est un calcul d'AFFICHAGE. Ce qui empêche réellement de publier
 * sans droit vit en base depuis le lot 1 : `assert_module_publish_allowed`,
 * appelée par les huit RPC de transition et par le trigger
 * `guard_module_publication`, plus les révocations de colonne `status` qui
 * ferment le `PATCH` PostgREST direct. Un écran ne garde rien ; il évite
 * seulement de proposer un bouton qui échouera.
 */

/** Pourquoi une capacité est refusée. Vocabulaire fermé, tenu par `tsc`. */
export type RaisonRefus =
  /** Le rôle ne concerne pas la préparation des animations (caisse). */
  | "role"
  /** Aucun droit effectif : ni octroi vivant, ni add-on sur abonnement actif. */
  | "droit_absent"
  /**
   * Un pass a été payé sur ce module et sa fenêtre s'est REFERMÉE.
   *
   * Distinct de `droit_absent`, et ce n'est pas une nuance : le commerçant qui
   * n'a jamais rien acheté a besoin de découvrir, celui dont le pass est
   * terminé a besoin de savoir QUAND il s'est terminé. Les confondre lui
   * servait une invitation à essayer un module qu'il a déjà payé — et laissait
   * sans explication ses campagnes retombées en pause (`droit_expire`).
   */
  | "pass_expire"
  /** Le brouillon gratuit de ce module est déjà pris. */
  | "quota_brouillon";

export interface CapacitesModule {
  /** Voir le module, son cas d'usage, son tarif et son état d'accès. */
  canExplore: boolean;
  /** Créer ou modifier un brouillon — sans jamais l'exposer à un joueur. */
  canEditDraft: boolean;
  /** Rendre l'expérience atteignable par un joueur. Payant, toujours. */
  canPublish: boolean;
  /** Pourquoi `canPublish` est faux. `null` quand il est vrai. */
  raison: RaisonRefus | null;
  /**
   * Date de fin du pass, DÉJÀ FORMATÉE dans le fuseau de l'établissement.
   * Renseignée seulement quand `raison === "pass_expire"`, `null` sinon.
   *
   * Formatée en amont et non ici : ce module est pur et ne connaît pas le
   * fuseau de l'organisation. Y passer un ISO obligerait chaque écran à
   * reformater — donc à choisir son fuseau, donc à afficher des dates
   * différentes d'une page à l'autre pour le même pass.
   */
  passTermineLe: string | null;
  /**
   * Cette personne peut-elle lever le blocage elle-même ?
   *
   * Le cahier §3 est explicite : « Un propriétaire peut acheter ; un éditeur
   * voit le catalogue mais reçoit "Demander au propriétaire", jamais un
   * contrôle Stripe. » Un bouton d'achat montré à un éditeur ne produit pas
   * une erreur, il produit un aller-retour humain et une demande de carte
   * bancaire à quelqu'un qui n'a pas à en donner.
   */
  peutAcheter: boolean;
  /** Ce qu'on écrit à CETTE personne, calibré sur son rôle. `null` si rien. */
  message: string | null;
}

/**
 * Nombre de brouillons non payés qu'une organisation peut tenir par module.
 *
 * UN, et le cahier §3 le fixe : « un brouillon non payé par organisation et
 * par module ». Ce n'est pas une limite de sécurité et il ne faut pas la lire
 * comme telle — elle borne une COURTOISIE. Ce qui protège la recette est la
 * garde de publication, en base ; ici on empêche seulement qu'un espace de
 * démonstration devienne un espace de production gratuit.
 *
 * Conséquence assumée : la contourner ne donne rien de payant, seulement un
 * second brouillon. C'est pourquoi elle n'a pas de contrepartie SQL — un
 * trigger sur neuf tables pour borner un inconvénient serait un coût sans
 * rapport avec ce qu'il évite.
 */
export const BROUILLONS_NON_PAYES_MAX = 1;

export interface EntreeCapacites {
  module: GrantableModule;
  /** Rôle dans l'organisation active. `null` = pas membre. */
  role: MemberRole | null;
  /** Verdict de `droitEffectifModule`. Jamais recalculé ici. */
  droitEffectif: boolean;
  /**
   * Nombre de ressources de ce module déjà créées et non publiées.
   *
   * REQUIS, et non optionnel avec un défaut à zéro : un appelant qui l'oublie
   * obtiendrait `canEditDraft` vrai en toutes circonstances, c'est-à-dire le
   * refus le plus permissif possible. Le rendre obligatoire fait échouer `tsc`
   * là où un défaut aurait produit un silence.
   */
  brouillonsExistants: number;
  /**
   * Fin du pass expiré, déjà formatée, quand c'est ELLE qui ferme la
   * publication. `null` ou absent : rien n'a jamais été acheté sur ce module,
   * ou l'appelant ne sait pas répondre.
   *
   * OPTIONNEL, contrairement à `brouillonsExistants` juste au-dessus, et la
   * différence tient au sens de l'oubli : oublier un compte de brouillons
   * OUVRE une permission, oublier cette date n'en ouvre aucune — elle ne change
   * que la phrase, qui retombe alors sur le générique « ouvrez ce module ». Le
   * rendre obligatoire aurait forcé les appelants qui ne savent rien des
   * octrois à écrire `null` par rite.
   */
  passTermineLe?: string | null;
}

/** Libellé du module tel qu'on le nomme au commerçant. */
const NOM_MODULE: Record<GrantableModule, string> = {
  wheel: "la roue de la fortune",
  hunts: "la chasse au trésor",
  calendar: "le calendrier à surprises",
  loyalty: "le passeport des habitués",
  quiz: "le quiz express",
  jackpot: "la cagnotte collective",
  events: "la soirée en jeu",
  referral: "le bouche-à-oreille",
  pronostics: "la saison de pronostics",
  vitrine: "la vitrine et l'agenda Réserver",
};

export function capacitesModule(entree: EntreeCapacites): CapacitesModule {
  const { module, role, droitEffectif, brouillonsExistants } = entree;
  const passTermineLe = entree.passTermineLe ?? null;

  // La caisse encaisse : elle ne prépare ni ne publie d'animation. Ce refus
  // précède tous les autres — inutile de parler d'achat à quelqu'un dont le
  // rôle n'ouvrirait rien même une fois payé.
  if (role === null || role === "cashier") {
    return {
      canExplore: false,
      canEditDraft: false,
      canPublish: false,
      raison: "role",
      // La date n'a rien à faire ici : le refus tient au rôle, et le caissier
      // n'a pas à savoir de quoi l'établissement est équipé ni jusqu'à quand.
      passTermineLe: null,
      peutAcheter: false,
      message:
        role === "cashier"
          ? "Votre rôle en caisse ne donne pas accès à la préparation des animations."
          : null,
    };
  }

  const nom = NOM_MODULE[module];

  if (droitEffectif) {
    return {
      canExplore: true,
      // Payé : plus aucune limite de brouillon. La limite ne borne que la
      // découverte gratuite, elle n'a rien à faire chez un client qui paie.
      canEditDraft: true,
      canPublish: true,
      raison: null,
      // Un pass terminé sous un droit vivant (un récurrent repris après coup)
      // ne se raconte pas : ce qui compte est que le module est ouvert.
      passTermineLe: null,
      peutAcheter: role === "owner",
      message: null,
    };
  }

  const quotaAtteint = brouillonsExistants >= BROUILLONS_NON_PAYES_MAX;
  // Le pass n'est « terminé » que si la publication est par ailleurs fermée —
  // ce que la branche `droitEffectif` ci-dessus a déjà écarté.
  const expire = passTermineLe !== null;

  return {
    // Découvrir reste ouvert, toujours : c'est la promesse du cahier §3.
    canExplore: true,
    canEditDraft: !quotaAtteint,
    canPublish: false,
    // La raison porte sur la PUBLICATION, qui est le seul verrou payant. Un
    // quota de brouillon atteint n'est pas une raison de ne pas publier : ce
    // qui empêche de publier reste l'absence de droit.
    raison: expire ? "pass_expire" : "droit_absent",
    passTermineLe,
    peutAcheter: role === "owner",
    message:
      role === "owner"
        ? messageProprietaire(nom, quotaAtteint, passTermineLe)
        : // L'éditeur lit la MÊME consigne dans les deux cas, et c'est voulu :
          // ce qu'il doit faire ne change pas — en parler au propriétaire —, et
          // « rouvrir » couvre aussi bien un pass fini qu'un module jamais pris.
          `Pour publier ${nom}, demandez au propriétaire du commerce d'ouvrir ce module.`,
  };
}

function messageProprietaire(
  nom: string,
  quotaAtteint: boolean,
  passTermineLe: string | null,
): string {
  // LE CAS QUE CE LOT OUVRE. « Préparez librement » à quelqu'un qui a payé et
  // dont la fenêtre s'est refermée lui parle d'un essai qu'il a dépassé depuis
  // longtemps ; ce qu'il lui faut est la date et le geste, dans cet ordre.
  if (passTermineLe) {
    return `Le pass pour ${nom} s'est terminé le ${passTermineLe}. Rouvrez le module pour publier à nouveau.`;
  }
  const base = `Préparez ${nom} librement. La publication demande d'ouvrir ce module.`;
  if (!quotaAtteint) return base;
  return `${base} Votre brouillon d'essai est déjà utilisé : ouvrez le module pour en préparer d'autres.`;
}
