import type { GrantableModule } from "@/lib/subscription";

/**
 * OCTROIS DATÉS — la décision, isolée de l'action et de l'écran.
 *
 * Ce module ne parle à rien : ni base, ni requête, ni React. C'est délibéré et
 * c'est la règle du dépôt — une décision laissée dans une server action ne se
 * vérifie qu'en montant tout ce qui l'entoure, donc en pratique ne se vérifie
 * pas. Ici, les deux fenêtres d'un octroi se calculent sur des entrées et se
 * comparent à des sorties.
 *
 * ── LES DEUX FENÊTRES, ET POURQUOI IL Y EN A DEUX ──
 *
 * Le cahier (docs/codex-handoff.md §2) décrit « 29 € / 30 jours, activable
 * dans les 90 jours » : deux durées distinctes, qui ne courent pas en même
 * temps. Et « Soirée en jeu : sept jours de préparation puis 24 heures de
 * jeu » impose que l'activation soit un ACTE et non la publication — on
 * prépare avant de publier, donc le compteur ne peut pas démarrer à la
 * publication.
 *
 *   * `activate_by` : jusqu'à quand l'octroi peut être DÉMARRÉ. Il ne donne
 *     aucun droit tant qu'il court.
 *   * `starts_at` / `ends_at` : la fenêtre pendant laquelle l'octroi ouvre
 *     réellement le module. Posée au démarrage, et gelée en base par
 *     `freeze_module_grant_terms`.
 */

/** Ce que le back-office décide au moment de créer l'octroi. */
export interface SaisieOctroi {
  module: GrantableModule;
  /** `pass` : durée fixe. `recurring` : reconduit, sans terme connu. */
  kind: "pass" | "recurring";
  /**
   * `maintenant` pose la fenêtre de jeu tout de suite. `a_activer` ne pose
   * qu'une date limite de démarrage — l'octroi existe, il n'ouvre rien.
   */
  demarrage: "maintenant" | "a_activer";
  /** Durée de jeu en jours, pour un `pass` démarré. */
  dureeJours?: number | null;
  /** Délai de démarrage en jours, pour un `pass` à activer. */
  delaiActivationJours?: number | null;
  /** Jauge (Soirée en jeu). Gelée dès qu'elle est posée. */
  jauge?: number | null;
}

export interface FenetresOctroi {
  starts_at: string | null;
  ends_at: string | null;
  activate_by: string | null;
  capacity: number | null;
}

export type VerdictOctroi =
  | { ok: true; fenetres: FenetresOctroi }
  | { ok: false; erreur: string };

const MS_PAR_JOUR = 86_400_000;

/**
 * Bornes de saisie. Elles ne sont PAS des durées produit : le cahier interdit
 * de graver 30 ou 90 jours où que ce soit tant que les tarifs ne sont pas
 * revalidés commercialement. Ce sont des garde-fous de saisie — ils empêchent
 * une faute de frappe de vendre dix ans, pas de choisir une offre.
 */
export const DUREE_MIN_JOURS = 1;
export const DUREE_MAX_JOURS = 366;
export const JAUGE_MIN = 1;
export const JAUGE_MAX = 500;

/**
 * Traduit une saisie en les deux fenêtres que la base attend.
 *
 * Rend un VERDICT et ne lève pas : l'appelant est une server action dont le
 * refus doit s'afficher dans un formulaire, pas remonter en 500.
 */
export function calculerFenetres(
  saisie: SaisieOctroi,
  maintenant = new Date(),
): VerdictOctroi {
  const jauge = saisie.jauge ?? null;
  if (jauge !== null && (!Number.isInteger(jauge) || jauge < JAUGE_MIN || jauge > JAUGE_MAX)) {
    return { ok: false, erreur: `La jauge doit être comprise entre ${JAUGE_MIN} et ${JAUGE_MAX}.` };
  }

  // Un `recurring` n'a pas de terme connu à l'avance : c'est ce qui le
  // distingue d'un pass, et il est donc TOUJOURS démarré. Un récurrent « à
  // activer » n'aurait aucun sens — il n'y a pas de compteur à déclencher.
  if (saisie.kind === "recurring") {
    if (saisie.demarrage === "a_activer") {
      return {
        ok: false,
        erreur: "Un droit récurrent n'a pas de démarrage différé : il court dès qu'il est accordé.",
      };
    }
    return {
      ok: true,
      fenetres: {
        starts_at: maintenant.toISOString(),
        ends_at: null,
        activate_by: null,
        capacity: jauge,
      },
    };
  }

  if (saisie.demarrage === "maintenant") {
    const duree = saisie.dureeJours ?? null;
    if (duree === null || !Number.isFinite(duree) || duree < DUREE_MIN_JOURS || duree > DUREE_MAX_JOURS) {
      return {
        ok: false,
        erreur: `La durée doit être comprise entre ${DUREE_MIN_JOURS} et ${DUREE_MAX_JOURS} jours.`,
      };
    }
    return {
      ok: true,
      fenetres: {
        starts_at: maintenant.toISOString(),
        ends_at: new Date(maintenant.getTime() + duree * MS_PAR_JOUR).toISOString(),
        activate_by: null,
        capacity: jauge,
      },
    };
  }

  const delai = saisie.delaiActivationJours ?? null;
  if (delai === null || !Number.isFinite(delai) || delai < DUREE_MIN_JOURS || delai > DUREE_MAX_JOURS) {
    return {
      ok: false,
      erreur: `Le délai d'activation doit être compris entre ${DUREE_MIN_JOURS} et ${DUREE_MAX_JOURS} jours.`,
    };
  }
  // NI `starts_at` NI `ends_at` : l'octroi est acheté, pas démarré. C'est
  // exactement l'état `pending` de `org_module_grant_state`, et il n'ouvre
  // rien — la contrainte `grant_fin_apres_debut` refuserait d'ailleurs une
  // fin posée sans début.
  return {
    ok: true,
    fenetres: {
      starts_at: null,
      ends_at: null,
      activate_by: new Date(maintenant.getTime() + delai * MS_PAR_JOUR).toISOString(),
      capacity: jauge,
    },
  };
}

/** Les six états que rend `org_module_grant_state`, plus l'absence d'octroi. */
export type EtatOctroi =
  | "live"
  | "scheduled"
  | "pending"
  | "expired"
  | "activation_expired"
  | "revoked";

/**
 * Ce que le back-office AFFICHE pour chaque état.
 *
 * Le libellé dit la CONSÉQUENCE et non l'état technique : « ouvre le module »
 * plutôt que « live ». Un back-office qui affiche le vocabulaire de la base
 * oblige son lecteur à traduire, et c'est en traduisant qu'on se trompe.
 *
 * `Record` exhaustif et non `switch` : ajouter un état à la base fait échouer
 * `tsc` tant que personne n'a décidé ce qu'on en dit.
 */
export const LIBELLE_ETAT: Record<EtatOctroi, string> = {
  live: "Ouvre le module",
  scheduled: "Démarre plus tard",
  pending: "Acheté, pas encore démarré",
  expired: "Terminé — le module est en pause",
  activation_expired: "Jamais démarré, délai dépassé",
  revoked: "Révoqué",
};

/** Les états qui ouvrent réellement un droit. Un seul, et c'est le point. */
export function ouvreLeModule(etat: EtatOctroi): boolean {
  return etat === "live";
}

/**
 * Un octroi est-il vivant à cet instant ? Port TypeScript de
 * `org_has_live_module_grant`, pour que le back-office puisse afficher l'état
 * sans refaire une requête par ligne.
 *
 * ATTENTION — cette fonction est un CONFORT D'AFFICHAGE, jamais une garde. La
 * garde vit en base (`org_has_module_access`), là où PostgREST ne peut pas la
 * contourner. Le jour où quelqu'un s'en sert pour décider d'un droit, il aura
 * déplacé la décision du seul endroit qui la tienne vers un endroit que
 * l'appelant contrôle.
 */
export function estVivant(
  ligne: {
    starts_at: string | null;
    ends_at: string | null;
    revoked_at: string | null;
  },
  maintenant = new Date(),
): boolean {
  if (ligne.revoked_at) return false;
  if (!ligne.starts_at) return false;
  if (new Date(ligne.starts_at).getTime() > maintenant.getTime()) return false;
  if (!ligne.ends_at) return true;
  return new Date(ligne.ends_at).getTime() > maintenant.getTime();
}
