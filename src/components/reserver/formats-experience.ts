import type { ReserverActivityKind } from "@/lib/reserver";

/**
 * LE VOCABULAIRE DES TROIS FORMATS (RES-5), en un seul endroit.
 *
 * Le mot « Moment Signature » apparaît sur cinq écrans : le sélecteur de
 * création, celui des réglages, la pastille de l'agenda, la liste des activités
 * et la page publique. Recopié cinq fois, il aurait divergé au premier
 * ajustement de libellé — et le commerçant aurait lu « Signature » ici et
 * « Expérience signature » là, sur le même objet.
 *
 * ── CE QUI N'EST PAS ICI ──
 *
 * Les BORNES de saisie (`RESERVER_ACTIVITY_PROMISE_MAX`, `RESERVER_ACTIVITY_DURATION_MIN`…)
 * vivent dans `src/lib/reserver.ts`, au plus près des `check` SQL dont elles sont
 * le miroir — même règle que `champs.ts`. Et l'UNITÉ de réservation
 * (`placesParReservation`) est ici parce que c'est la traduction d'un format en
 * mots d'écran ; la base, elle, a le dernier mot et refuse `invalid_party_size`
 * si l'écran se trompait.
 */

export interface FormatExperience {
  label: string;
  /** La ligne d'aide sous le sélecteur : ce que le commerçant achète en le choisissant. */
  aide: string;
  ton: string;
}

export const LIBELLE_FORMAT: Record<ReserverActivityKind, FormatExperience> =
  {
    standard: {
      label: "Standard",
      aide: "Un créneau, des places, un code au comptoir. Rien de plus.",
      ton: "bg-white text-k-ink",
    },
    signature: {
      label: "Moment Signature",
      aide: "Une page immersive : votre promesse en grand, la durée annoncée, et jusqu'à trois étapes qui racontent ce que vos clients vont vivre.",
      ton: "bg-k-yellow/50 text-k-ink",
    },
    duo: {
      label: "Atelier Duo",
      aide: "On réserve pour deux d'un seul geste : chaque réservation prend deux places, et la page l'annonce avant le clic.",
      ton: "bg-sky-100 text-k-ink",
    },
  };

/** L'ordre du sélecteur : du plus simple au plus engageant. */
export const FORMATS_ORDONNES: readonly ReserverActivityKind[] = [
  "standard",
  "signature",
  "duo",
];

/**
 * Combien de places une réservation prend, selon le format.
 *
 * C'est le `party_size` que la page envoie et que `reserve_slot` EXIGE d'égaler
 * — une valeur différente se fait refuser `invalid_party_size`. L'écran ne
 * décide donc de rien : il dit la même chose que la base, avant le clic plutôt
 * qu'après.
 */
export function placesParReservation(kind: ReserverActivityKind): number {
  return kind === "duo" ? 2 : 1;
}

/**
 * La durée dans les mots d'une affiche : « 45 min », « 1 h », « 1 h 30 ».
 *
 * Pas « 90 minutes » : au-delà de l'heure, personne ne compte en minutes. Pas
 * de `Intl.RelativeTimeFormat` non plus — ce n'est pas une durée relative à
 * maintenant, c'est une longueur annoncée.
 */
export function formatDuree(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const heures = Math.floor(minutes / 60);
  const reste = minutes % 60;
  return reste === 0 ? `${heures} h` : `${heures} h ${reste}`;
}

/**
 * Le NOM de l'unité de la jauge, accordé — « places restantes », « duos
 * possibles ». Le chiffre n'est pas dedans : il est rendu à part, en
 * `tabular-nums` et en gras, exactement comme avant ce lot. Une fonction qui
 * aurait rendu la phrase entière aurait fait perdre cette emphase au format
 * standard, dont l'écran ne doit pas bouger d'un pixel.
 *
 * Un Atelier Duo dont il reste trois paires n'a pas « 6 places restantes » : il
 * a « 3 duos possibles ». Le chiffre brut serait exact et trompeur — il
 * laisserait croire qu'on peut y venir seul.
 */
export function uniteJauge(
  kind: ReserverActivityKind,
  unites: number,
): string {
  const pluriel = unites > 1 ? "s" : "";
  return kind === "duo"
    ? `duo${pluriel} possible${pluriel}`
    : `place${pluriel} restante${pluriel}`;
}
