import { cn } from "@/lib/utils";
import {
  etatUiCreneau,
  etatUiEntreeFile,
  etatUiReservation,
  type EtatUiCreneau,
  type EtatUiEntreeFile,
  type EtatUiReservation,
  type ReservationSlotStatus,
  type ReservationStatus,
  type ReservationWaitlistStatus,
} from "@/lib/reserver";

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
