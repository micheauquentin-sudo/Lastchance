/**
 * Catalogue d'INTERFACE des modèles d'événement (`contests.event_kind`).
 *
 * La base ne contraint que la FORME de la clé (voir EVENT_KIND_PATTERN) :
 * ajouter un modèle ici ne demande aucune migration. V1 expose le
 * football — le parcours d'origine, avec son catalogue de compétitions et
 * sa synchro de calendrier — et un mode générique « Événement
 * personnalisé » pour tout le reste (cérémonie, élection, concours…).
 */
export interface EventKindOption {
  key: string;
  label: string;
  icon: string;
  hint: string;
  /** Le catalogue de compétitions n'existe que pour le football. */
  usesCompetition: boolean;
}

export const EVENT_KINDS: EventKindOption[] = [
  {
    key: "football",
    label: "Football",
    icon: "⚽",
    hint: "Matchs à pronostiquer sur le score, calendrier officiel importé automatiquement.",
    usesCompetition: true,
  },
  {
    key: "custom",
    label: "Événement personnalisé",
    icon: "✨",
    hint: "Cérémonie, élection, concours, tournoi… vous composez vos propres questions.",
    usesCompetition: false,
  },
];

/** Modèle par défaut : le football, seul parcours d'origine. */
export const FOOTBALL_EVENT_KIND = "football";

export function getEventKind(key: string): EventKindOption | undefined {
  return EVENT_KINDS.find((kind) => kind.key === key);
}

/** Libellé affichable d'un modèle — repli sur la clé brute (un modèle
 *  posé hors catalogue reste lisible plutôt que d'afficher du vide). */
export function eventKindLabel(key: string): string {
  return getEventKind(key)?.label ?? key;
}
