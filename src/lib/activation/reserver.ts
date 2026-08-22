import {
  etatUiCreneau,
  fileAccepteEntree,
  type ReservationQueueStatus,
  type ReservationSlotStatus,
  type ReserverActivityKind,
} from "@/lib/reserver";
import type { PointControle } from "./controle";

/**
 * « UN CLIENT PEUT-IL RÉSERVER MAINTENANT ? » — EN FONCTION PURE.
 *
 * ── CE QUE LE SERVEUR VÉRIFIE, ET CE QU'IL NE VÉRIFIE PAS ──
 *
 * Aucune précondition métier n'existe : `gardeEditeurReserver` contrôle le DROIT
 * (rôle + entitlement `vitrine`), jamais l'état. Rien ne refuse une activité sans
 * créneau, et rien ne refuse un agenda dont tous les créneaux sont restés en
 * brouillon — ce qui est le piège principal du module, parce que la naissance
 * d'un créneau est `draft` et que l'ouvrir est un SECOND geste, explicite.
 *
 * Ce module ne referme aucun de ces trous : il les RACONTE. `bloquant` y veut
 * donc dire « le client repart les mains vides », pas « le serveur refuserait ».
 *
 * ── DEUX VERDICTS RÉUTILISÉS, PAS RECOPIÉS ──
 *
 * `etatUiCreneau` et `fileAccepteEntree` sont IMPORTÉS. Réécrire ici « ouvert =
 * status open et début futur et place libre » aurait fait un second juge : la
 * page publique en aurait affiché un et le tableau de bord l'autre, et c'est
 * exactement le défaut RES-5 déjà payé une fois (un Atelier Duo à une place
 * restante compté « ouvert » côté commerçant, « complet » côté client).
 *
 * ── CE QUE CE MODULE NE CONTRÔLE PAS, ET POURQUOI ──
 *
 * · La CAPACITÉ d'un créneau : `capacitySchema` exige ≥ 1 et le CHECK SQL dit la
 *   même chose. Un contrôle « la capacité est renseignée » serait vert pour
 *   toujours — la case à cocher qui n'apprend rien et qui apprend à ne plus lire
 *   les autres.
 * · La FENÊTRE DES OFFRES DE STOCK : le piège supposé (« une offre ouverte dont
 *   la fenêtre est écoulée accepte encore des prises ») n'existe pas —
 *   `etatUiOffreStock` rend `passee` et `offreAccepteePrise` est faux dès que
 *   `windowEndsAt` est dépassé. Et prendre AVANT le début de la fenêtre est le
 *   principe même du Drop annoncé, pas un défaut. Le bloc a donc une tuile et
 *   zéro contrôle.
 * · La LISTE PRIORITAIRE d'un créneau : elle n'a aucun interrupteur, elle existe
 *   parce qu'un créneau est complet. Il n'y a rien à régler, donc rien à vérifier.
 *
 * Pur et testé : `now` est un paramètre, sans quoi « créneau à venir » ne serait
 * pas reproductible.
 */

/** Un créneau, réduit aux trois champs dont le verdict d'écran dépend. */
export interface CreneauVerificationReserver {
  status: ReservationSlotStatus;
  startsAt: string;
  remaining: number;
}

/**
 * Une activité et son agenda. `kind` entre dans le verdict : sur un Atelier Duo,
 * une place libre isolée n'est prenable par personne.
 */
export interface ActiviteVerificationReserver {
  id: string;
  active: boolean;
  kind: ReserverActivityKind;
  slots: readonly CreneauVerificationReserver[];
}

/** Une file d'accueil. `activityId` est `null` pour une file « Comptoir ». */
export interface FileVerificationReserver {
  status: ReservationQueueStatus;
  activityId: string | null;
}

export interface EntreeVerificationReserver {
  activites: readonly ActiviteVerificationReserver[];
  files: readonly FileVerificationReserver[];
  /** Injectée par les tests ; le rendu serveur passe l'heure courante. */
  now?: Date;
}

export interface EtatVerificationReserver {
  controles: PointControle[];
  toutPret: boolean;
  /** Le SEUL écran d'où l'on règle tout cela. */
  ctaHref: string;
}

const pluriel = (n: number) => (n > 1 ? "s" : "");

export function construireVerificationReserver(
  entree: EntreeVerificationReserver,
): EtatVerificationReserver {
  const { activites, files } = entree;
  const now = entree.now ?? new Date();
  const controles: PointControle[] = [];

  // 1. UNE ACTIVITÉ. Sans elle, le bloc « Réserver » de la vitrine n'a rien à
  //    proposer : le client pousse une porte qui ouvre sur une liste vide.
  controles.push({
    cle: "activites",
    ok: activites.length > 0,
    titre: "Vous proposez au moins une activité",
    detail:
      activites.length > 0
        ? `${activites.length} activité${pluriel(activites.length)} au catalogue.`
        : "Aucune activité : il n'y a rien à réserver, et le bloc « Réserver » de votre vitrine s'ouvrirait sur une liste vide.",
  });

  // Les deux contrôles suivants n'ont de sens qu'avec une activité : sans elle,
  // « aucun créneau ouvert » n'est pas un second défaut, c'est le même.
  if (activites.length > 0) {
    // Un créneau n'est atteignable que si SON ACTIVITÉ tourne : couper une
    // activité ferme tous ses créneaux sans rien effacer (`activiteOuverte`).
    const ouvertes = activites.filter((a) => a.active);
    const aVenir = ouvertes.flatMap((activite) =>
      activite.slots
        .filter((creneau) => {
          const debut = new Date(creneau.startsAt).getTime();
          return (
            creneau.status === "open" &&
            Number.isFinite(debut) &&
            debut > now.getTime()
          );
        })
        .map((creneau) => ({ creneau, kind: activite.kind })),
    );
    const totalCreneaux = activites.reduce((n, a) => n + a.slots.length, 0);

    // 2. UN CRÉNEAU OUVERT ET À VENIR. Le piège nommé plus haut : un créneau
    //    naît en BROUILLON, l'ouvrir est un second geste. Un agenda entier
    //    préparé la veille reste invisible si personne ne l'a ouvert.
    controles.push({
      cle: "creneaux",
      ok: aVenir.length > 0,
      titre: "Un créneau est ouvert à la réservation",
      detail:
        aVenir.length > 0
          ? `${aVenir.length} créneau${pluriel(aVenir.length)} ouvert${pluriel(aVenir.length)} à venir.`
          : ouvertes.length === 0
            ? `Toutes vos activités sont coupées : une activité coupée ferme tous ses créneaux, sans rien effacer. Rien n'est réservable tant que vous n'en rouvrez pas une.`
            : totalCreneaux > 0
              ? `${totalCreneaux} créneau${pluriel(totalCreneaux)} enregistré${pluriel(totalCreneaux)}, aucun ouvert et à venir : un créneau naît en brouillon, et l'ouvrir est un second geste. Vos clients ne voient rien.`
              : "Aucun créneau enregistré : vos clients trouvent l'activité, sans une seule date à réserver.",
    });

    // 3. DES PLACES. Émis SEULEMENT s'il existe un créneau ouvert à venir —
    //    sinon ce serait le contrôle ci-dessus, dit une seconde fois. Complet
    //    n'est pas une panne : c'est une salle pleine, et la liste prioritaire
    //    prend le relais. D'où l'avertissement, jamais le blocage.
    if (aVenir.length > 0) {
      const reservables = aVenir.filter(
        ({ creneau, kind }) =>
          etatUiCreneau({ ...creneau, kind }, now) === "ouvert",
      ).length;
      controles.push({
        cle: "places",
        ok: reservables > 0,
        titre: "Il reste des places à prendre",
        detail:
          reservables > 0
            ? `${reservables} créneau${pluriel(reservables)} à venir avec des places libres.`
            : `Vos ${aVenir.length} créneau${pluriel(aVenir.length)} à venir sont complets : vos clients ne peuvent plus que s'inscrire en liste prioritaire. Ouvrez d'autres dates si vous pouvez les tenir.`,
      });
    }
  }

  // 4. LES FILES QUI DISENT « OUVERTE » SANS L'ÊTRE — émis seulement s'il existe
  //    au moins une file ouverte. Ne pas tenir de file d'accueil est un choix
  //    ordinaire, et le cas dominant.
  //
  //    Le défaut est réel et muet : `queue_join` referme la file quand son
  //    activité est coupée (`coalesce(v_activity_active, true)`), mais l'écran
  //    du commerçant peint sa pastille à partir du seul `status` — il lit
  //    « Ouverte » sur une file qui refuse tout le monde. `fileAccepteEntree`
  //    combine déjà les deux et n'était appelée nulle part en production.
  const ouvertesDeclarees = files.filter((f) => f.status === "open");
  if (ouvertesDeclarees.length > 0) {
    const activesParId = new Map(activites.map((a) => [a.id, a.active]));
    const muettes = ouvertesDeclarees.filter(
      (file) =>
        !fileAccepteEntree({
          status: file.status,
          // Une file « Comptoir » n'a pas d'activité : rien ne la referme.
          activiteActive:
            file.activityId === null
              ? true
              : (activesParId.get(file.activityId) ?? true),
        }),
    ).length;
    controles.push({
      cle: "files-activite",
      ok: muettes === 0,
      titre: "Vos files ouvertes acceptent vraiment du monde",
      detail:
        muettes === 0
          ? `${ouvertesDeclarees.length} file${pluriel(ouvertesDeclarees.length)} d'accueil ouverte${pluriel(ouvertesDeclarees.length)}.`
          : `${muettes} file${pluriel(muettes)} affichée${pluriel(muettes)} « ouverte » ${muettes > 1 ? "sont rattachées" : "est rattachée"} à une activité coupée : l'entrée est refusée à vos clients sans que rien ne le dise. Rouvrez l'activité, ou fermez la file.`,
    });
  }

  return {
    controles,
    toutPret: controles.every((c) => c.ok),
    ctaHref: "/dashboard/reservations",
  };
}
