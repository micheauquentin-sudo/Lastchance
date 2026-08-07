import {
  definitionEtape,
  hrefEtape,
  type EtapeAtelier,
} from "@/components/dashboard/atelier-etapes";

/**
 * LES TROIS ÉTAPES DE L'ATELIER DU CALENDRIER.
 *
 * L'ORDRE EST IMPOSÉ PAR LA MÉCANIQUE, pas par le goût : `start_date`,
 * `day_count` et `timezone` déclenchent `syncCalendarDays`, qui crée les cases
 * manquantes, recalcule les dates d'ouverture et SUPPRIME les cases d'index
 * supérieur au nouveau `day_count`. « Les réglages » précède donc « Les
 * cases », et l'étape 1 avertit qu'y revenir après avoir garni la grille peut
 * détruire les dernières cases (le garde-fou `confirm_day_loss` existe, mais il
 * n'apparaît qu'APRÈS un premier refus).
 *
 * `updateCalendar` écrit onze colonnes en bloc, dont trois destructives à
 * l'absence : « Les réglages » est INDIVISIBLE. `updateCalendarDay`, à
 * l'inverse, est atomique par case — c'est là qu'est la valeur de l'atelier.
 *
 * L'ABSENCE de `?etape=` est la vue SUIVI, pas la première étape.
 */
export type EtapeCalendrier = "reglages" | "cases" | "verification";

export const ETAPES_CALENDRIER = [
  {
    cle: "reglages",
    titre: "Les réglages",
    resume:
      "Le nom, le thème, la période, le nombre de cases et le cadeau d'assiduité.",
  },
  {
    cle: "cases",
    titre: "Les cases",
    resume: "Ce que chaque case révèle : un message, un lot ou un tour de roue.",
  },
  {
    cle: "verification",
    titre: "La vérification",
    resume: "Ce qu'il reste à faire avant d'ouvrir aux joueurs.",
  },
] as const satisfies readonly EtapeAtelier[];

export function baseAtelierCalendrier(calendarId: string): string {
  return `/dashboard/calendar/${calendarId}`;
}

export function hrefEtapeCalendrier(
  calendarId: string,
  cle: EtapeCalendrier,
): string {
  return hrefEtape(baseAtelierCalendrier(calendarId), cle);
}

export function definitionEtapeCalendrier(cle: EtapeCalendrier): EtapeAtelier {
  return definitionEtape(ETAPES_CALENDRIER, cle) ?? ETAPES_CALENDRIER[0];
}
