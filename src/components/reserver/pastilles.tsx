import { cn } from "@/lib/utils";
import {
  etatUiCreneau,
  etatUiEntreeFile,
  etatUiOffreStock,
  etatUiReservation,
  type EtatUiCreneau,
  type EtatUiEntreeFile,
  type EtatUiOffreStock,
  type EtatUiPriseStock,
  type EtatUiReservation,
  type ReservationQueueStatus,
  type ReservationSlotStatus,
  type ReservationStatus,
  type ReservationWaitlistStatus,
  type ReserverActivityKind,
  type StockOfferStatus,
} from "@/lib/reserver";
import { LIBELLE_FORMAT } from "@/components/reserver/formats-experience";

/**
 * Les pastilles de l'agenda Réserver.
 *
 * ── POURQUOI PAS `StatusBadge` ──
 *
 * `src/components/ui/status-badge.tsx` porte le vocabulaire des ANIMATIONS —
 * « Ouverte aux joueurs », « Clôturée » — et son commentaire dit pourquoi il
 * n'en existe qu'un seul jeu pour les huit modules. Un créneau n'est pas une
 * animation : il ne se publie pas, il s'ouvre ; et une réservation n'a pas
 * d'état d'animation du tout. Faire entrer « Arrivé » dans `EtatAnimation`
 * aurait ajouté aux huit modules un mot qui n'a de sens qu'ici.
 *
 * La FORME reste la même — bordure encre, `rounded-full`, `font-black` : le
 * commerçant reconnaît la pastille, seul le vocabulaire change.
 *
 * ── LES ÉTATS VIENNENT DE `src/lib/reserver.ts`, PAS D'ICI ──
 *
 * `etatUiCreneau` et `etatUiReservation` traduisent le statut SQL en état
 * d'écran, et l'ordre de leurs tests reproduit celui des refus de
 * `reserve_slot` — un créneau d'hier est « passé » même s'il est plein, sans
 * quoi l'écran enverrait le joueur chercher une place qui n'existe plus. Ces
 * composants ne font que peindre ce verdict ; ils n'en refont aucun morceau.
 */

const LIBELLE_CRENEAU: Record<EtatUiCreneau, { label: string; ton: string }> = {
  ouvert: { label: "Ouvert", ton: "bg-k-green/40 text-k-ink" },
  complet: { label: "Complet", ton: "bg-amber-100 text-k-ink" },
  ferme: { label: "Fermé", ton: "bg-zinc-200 text-k-ink" },
  passe: { label: "Passé", ton: "bg-zinc-200 text-k-ink" },
};

/**
 * Le brouillon est un état d'ÉDITION, pas d'ouverture : `etatUiCreneau` le
 * range avec « fermé » — c'est juste pour le joueur, qui ne le voit pas — mais
 * le commerçant, lui, doit distinguer « je ne l'ai pas encore ouvert » de
 * « je l'ai refermé ». D'où cette table, lue AVANT le verdict d'écran.
 */
const LIBELLE_STATUT_BRUT: Partial<
  Record<ReservationSlotStatus, { label: string; ton: string }>
> = {
  draft: { label: "Brouillon", ton: "bg-white text-k-ink" },
  closed: { label: "Fermé", ton: "bg-zinc-200 text-k-ink" },
};

const LIBELLE_RESERVATION: Record<
  EtatUiReservation,
  { label: string; ton: string }
> = {
  confirme: { label: "Confirmée", ton: "bg-sky-100 text-k-ink" },
  arrive: { label: "Arrivé", ton: "bg-k-green/40 text-k-ink" },
  annule: { label: "Annulée", ton: "bg-zinc-200 text-k-ink" },
};

const BASE =
  "inline-flex shrink-0 items-center rounded-full border-2 border-k-ink px-3 py-1 text-xs font-black";

/**
 * Pastille d'un créneau VU DU COMMERÇANT.
 *
 * `now` est un paramètre pour que le rendu reste déterministe en test — et
 * parce que `etatUiCreneau` l'expose déjà pour la même raison.
 */
export function PastilleCreneau({
  creneau,
  now,
  className,
}: {
  creneau: {
    status: ReservationSlotStatus;
    startsAt: string;
    remaining: number;
  };
  now?: Date;
  className?: string;
}) {
  const brut = LIBELLE_STATUT_BRUT[creneau.status];
  const { label, ton } = brut ?? LIBELLE_CRENEAU[etatUiCreneau(creneau, now)];
  return <span className={cn(BASE, ton, className)}>{label}</span>;
}

/**
 * Les six états d'une entrée de liste prioritaire, dans les mots du comptoir.
 *
 * Le verdict est celui d'`etatUiEntreeFile`, comme côté joueur : il lit
 * `offerLive`, tranché PAR LE SERVEUR. Recomparer `offerExpiresAt` à l'horloge
 * du poste de caisse rétablirait ce que le SQL a écarté — une place « encore
 * tenue » qui dépend d'une machine mal réglée.
 *
 * `offre_expiree` et `expiree` portent le même mot et ne sont pas le même état :
 * la première ligne est encore `offered` en base (le balayage n'est pas passé),
 * la seconde est terminale. Le commerçant n'a rien à faire ni de l'une ni de
 * l'autre — d'où le libellé commun.
 */
const LIBELLE_FILE: Record<EtatUiEntreeFile, { label: string; ton: string }> = {
  attente: { label: "En attente", ton: "bg-white text-k-ink" },
  offre: { label: "Place proposée", ton: "bg-amber-100 text-k-ink" },
  offre_expiree: { label: "Délai écoulé", ton: "bg-zinc-200 text-k-ink" },
  convertie: { label: "Place prise", ton: "bg-k-green/40 text-k-ink" },
  expiree: { label: "Délai écoulé", ton: "bg-zinc-200 text-k-ink" },
  partie: { label: "Retiré", ton: "bg-zinc-200 text-k-ink" },
};

export function PastilleFileAttente({
  entree,
  className,
}: {
  entree: { status: ReservationWaitlistStatus; offerLive: boolean };
  className?: string;
}) {
  const { label, ton } = LIBELLE_FILE[etatUiEntreeFile(entree)];
  return <span className={cn(BASE, ton, className)}>{label}</span>;
}

/**
 * Les trois états d'une FILE D'ACCUEIL (RES-3), et le deuxième est le seul qui
 * demande une explication.
 *
 * « En pause » n'est PAS « fermée » : on ne prend plus de monde, mais on sert
 * encore ceux qui attendent. C'est le geste de vingt minutes avant la
 * fermeture, et confondre les deux ferait partir des gens qui avaient encore
 * leur place. La pastille porte donc le mot ; la phrase, elle, est sur les deux
 * écrans qui en ont besoin — celui du client et la console du comptoir.
 *
 * Pourquoi pas `PastilleCreneau` : un créneau se remplit et se périme, une file
 * ne fait ni l'un ni l'autre. Les états ne se recouvrent sur aucun mot.
 */
const LIBELLE_FILE_ACCUEIL: Record<
  ReservationQueueStatus,
  { label: string; ton: string }
> = {
  open: { label: "Ouverte", ton: "bg-k-green/40 text-k-ink" },
  paused: { label: "En pause", ton: "bg-amber-100 text-k-ink" },
  closed: { label: "Fermée", ton: "bg-zinc-200 text-k-ink" },
};

export function PastilleFileAccueil({
  status,
  className,
}: {
  status: ReservationQueueStatus;
  className?: string;
}) {
  const { label, ton } = LIBELLE_FILE_ACCUEIL[status];
  return <span className={cn(BASE, ton, className)}>{label}</span>;
}

/**
 * LE FORMAT D'UNE ACTIVITÉ (RES-5), vu du commerçant.
 *
 * Elle ne s'affiche PAS sur une activité standard, et c'est délibéré : c'est le
 * défaut, donc l'absence de pastille en dit autant qu'un mot, et une liste où
 * chaque ligne porte « Standard » ne montre plus les deux qui ne le sont pas.
 *
 * Le vocabulaire vient de `formats-experience.ts`, comme sur les quatre autres
 * écrans qui le portent — recopier « Moment Signature » ici aurait fait diverger
 * la pastille du sélecteur qui la produit.
 */
export function PastilleFormat({
  kind,
  className,
}: {
  kind: ReserverActivityKind;
  className?: string;
}) {
  if (kind === "standard") return null;
  const { label, ton } = LIBELLE_FORMAT[kind];
  return <span className={cn(BASE, ton, className)}>{label}</span>;
}

/**
 * L'ÉTAT D'UNE OFFRE DE STOCK (RES-5, lot L9), vu du commerçant comme du client.
 *
 * « Épuisée » n'est pas « Fermée » : la première est le résultat du succès —
 * tout est parti — la seconde une décision. Les confondre ferait croire au
 * commerçant qu'il a coupé une offre que ses clients ont simplement vidée. Et
 * « Passée » n'est pas « Fermée » non plus : c'est le temps qui a tranché, pas
 * lui. Ces cinq mots sont ceux d'`etatUiOffreStock`, un pour un — la fonction
 * décide, cette table peint.
 */
const LIBELLE_OFFRE_STOCK: Record<
  EtatUiOffreStock,
  { label: string; ton: string }
> = {
  brouillon: { label: "Brouillon", ton: "bg-white text-k-ink" },
  ouverte: { label: "Ouverte", ton: "bg-k-green/40 text-k-ink" },
  epuisee: { label: "Épuisée", ton: "bg-amber-100 text-k-ink" },
  passee: { label: "Passée", ton: "bg-zinc-200 text-k-ink" },
  fermee: { label: "Fermée", ton: "bg-zinc-200 text-k-ink" },
};

/**
 * `now` est un paramètre pour que le rendu reste déterministe en test — et
 * parce qu'`etatUiOffreStock` l'expose déjà pour la même raison.
 */
export function PastilleOffreStock({
  offre,
  now,
  className,
}: {
  offre: {
    status: StockOfferStatus;
    windowEndsAt: string | null;
    remaining: number;
  };
  now?: Date;
  className?: string;
}) {
  const { label, ton } = LIBELLE_OFFRE_STOCK[etatUiOffreStock(offre, now)];
  return <span className={cn(BASE, ton, className)}>{label}</span>;
}

/**
 * L'ÉTAT DE LA PRISE D'UN CLIENT (RES-5, lot L9).
 *
 * « Non retirée » plutôt qu'« Expirée » : le mot qui compte au comptoir n'est
 * pas l'échéance technique mais le FAIT — personne n'est venu chercher cette
 * part, et elle est repartie en vente. C'est aussi le compteur que le tableau
 * de bord met en avant.
 *
 * Le verdict est celui d'`etatUiPriseStock`, y compris pour l'expiration :
 * aucun chemin n'écrit `status = 'expired'`, et recomparer l'échéance ici
 * fabriquerait une seconde règle à côté de celle du module.
 */
const LIBELLE_PRISE_STOCK: Record<
  EtatUiPriseStock,
  { label: string; ton: string }
> = {
  tenue: { label: "Bloquée", ton: "bg-amber-100 text-k-ink" },
  retiree: { label: "Retirée", ton: "bg-k-green/40 text-k-ink" },
  annulee: { label: "Annulée", ton: "bg-zinc-200 text-k-ink" },
  expiree: { label: "Non retirée", ton: "bg-zinc-200 text-k-ink" },
};

export function PastillePriseStock({
  etat,
  className,
}: {
  etat: EtatUiPriseStock;
  className?: string;
}) {
  const { label, ton } = LIBELLE_PRISE_STOCK[etat];
  return <span className={cn(BASE, ton, className)}>{label}</span>;
}

export function PastilleReservation({
  status,
  className,
}: {
  status: ReservationStatus;
  className?: string;
}) {
  const { label, ton } = LIBELLE_RESERVATION[etatUiReservation(status)];
  return <span className={cn(BASE, ton, className)}>{label}</span>;
}

/**
 * Le remplissage d'un créneau, dit honnêtement.
 *
 * « 4 places restantes sur 12 » et non « 8/12 » : le chiffre qui intéresse
 * celui qui lit — commerçant comme joueur — est celui qui reste. Zéro place
 * n'écrit pas « 0 restantes » mais « complet », parce que c'est le mot du
 * comptoir.
 */
export function Remplissage({
  restantes,
  capacity,
  className,
}: {
  restantes: number;
  capacity: number;
  className?: string;
}) {
  if (restantes <= 0) {
    return (
      <span className={cn("text-sm font-black text-k-ink", className)}>
        Complet ({capacity} place{capacity > 1 ? "s" : ""})
      </span>
    );
  }
  return (
    <span className={cn("text-sm font-bold text-k-body", className)}>
      <span className="font-black tabular-nums text-k-ink">{restantes}</span>{" "}
      place{restantes > 1 ? "s" : ""} restante{restantes > 1 ? "s" : ""} sur{" "}
      {capacity}
    </span>
  );
}
