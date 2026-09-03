import type { Calendar, CalendarTheme } from "@/types/database";
import { codeTtlDaysInitial } from "@/components/dashboard/code-ttl-days-field";

/**
 * L'ÉTAT DU STUDIO DU CALENDRIER — les DOUZE champs que `updateCalendar` écrit
 * en bloc, plus rien (VIT-39).
 *
 * ── POURQUOI TOUT EST UNE CHAÎNE ──
 *
 * Ce qui part au serveur est un `FormData`, c'est-à-dire des chaînes. Garder
 * `day_count` en `number` ici aurait obligé à reconstruire la valeur à chaque
 * frappe : « 2 » puis « » puis « 12 » — et un champ vidé le temps de retaper
 * serait devenu `0`, donc un refus incompréhensible, ou pire un enregistrement
 * silencieux à zéro. La saisie BRUTE voyage telle quelle et se fait valider par
 * `updateCalendarSchema`, qui porte déjà tous les messages.
 *
 * C'est le même parti pris que `CodeTtlDaysField` pour `code_ttl_days`, et il
 * y est documenté : reconstruire un nombre transformerait « 3.5 » en un
 * silencieux « sans limite ».
 *
 * ── LES DEUX CHAÎNES VIDES QUI NE SONT PAS DES OUBLIS ──
 *
 * `fond_key` vide vaut « suivre le thème », `code_ttl_days` vide vaut « sans
 * limite ». Ce sont des VALEURS, pas des absences — et c'est précisément ce que
 * `updateCalendar` distingue par `formData.has()` plutôt que `get()`. Les deux
 * doivent donc être rendus TOUJOURS : un champ absent laisse la colonne
 * intacte, un champ vide l'efface, et confondre les deux fait perdre un
 * réglage sans un mot.
 */
export interface EtatCalendrier {
  name: string;
  theme: CalendarTheme;
  /** `""` = suivre le thème, `"aucun"`, ou une clé de fond. */
  fond_key: string;
  start_date: string;
  timezone: string;
  /** Saisie BRUTE, jamais un nombre reconstruit — voir l'en-tête. */
  day_count: string;
  public_slug: string;
  merchant_content: string;
  completion_reward_label: string;
  completion_reward_details: string;
  completion_reward_stock: string;
  /** Saisie BRUTE en jours ; `""` = sans limite. */
  code_ttl_days: string;
}

/**
 * L'état de départ, lu depuis la ligne. Aucun défaut n'est INVENTÉ ici : tout
 * ce qui est nul devient la chaîne vide, qui est exactement ce que l'action
 * saura relire comme « rien ». Le studio du produit voisin a payé l'inverse —
 * résoudre les défauts au montage grave en base des décisions que personne n'a
 * prises (VIT-19), et l'enregistrement automatique du socle les enverrait.
 */
export function etatInitialCalendrier(calendar: Calendar): EtatCalendrier {
  return {
    name: calendar.name,
    theme: calendar.theme,
    fond_key: calendar.fond_key ?? "",
    start_date: calendar.start_date,
    timezone: calendar.timezone,
    day_count: String(calendar.day_count),
    public_slug: calendar.public_slug ?? "",
    merchant_content: calendar.merchant_content ?? "",
    completion_reward_label: calendar.completion_reward_label ?? "",
    completion_reward_details: calendar.completion_reward_details ?? "",
    completion_reward_stock: String(calendar.completion_reward_stock ?? 0),
    code_ttl_days: codeTtlDaysInitial(calendar.code_ttl_days),
  };
}
