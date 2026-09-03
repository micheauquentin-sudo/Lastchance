import { codeTtlDaysInitial } from "@/components/dashboard/code-ttl-days-field";
import { isoToZonedDateTimeInput } from "@/lib/date-time";
import type { Hunt, HuntOrderMode } from "@/types/database";

/**
 * L'ÉTAT DU STUDIO DE LA CHASSE — les NEUF champs que `updateHunt` écrit en
 * bloc, plus rien (VIT-40).
 *
 * ── POURQUOI TOUT EST UNE CHAÎNE ──
 *
 * Ce qui part au serveur est un `FormData`, c'est-à-dire des chaînes. Garder
 * `min_scan_interval_seconds` ou `reward_stock` en `number` ici aurait obligé
 * à reconstruire la valeur à chaque frappe : « 3 » puis « » puis « 30 » — et
 * un champ vidé le temps de retaper serait devenu `0`, donc un délai
 * anti-partage silencieusement désactivé, ou un stock ramené à zéro. La saisie
 * BRUTE voyage telle quelle et se fait valider par `updateHuntSchema`, qui
 * porte déjà tous les messages.
 *
 * C'est le parti pris du studio du calendrier (VIT-39) et celui de
 * `CodeTtlDaysField`, où il est documenté : reconstruire un nombre
 * transformerait « 3.5 » en un silencieux « sans limite ».
 *
 * ── LES SENS DU VIDE ──
 *
 * `reward_stock` vide vaut « illimité », `code_ttl_days` vide vaut « sans
 * limite », `starts_at` / `ends_at` vides valent « sans borne ». Ce sont des
 * VALEURS, pas des absences — et `code_ttl_days` est le seul que l'action lit
 * par `formData.has()` plutôt que `get()` : champ absent ⇒ colonne intacte,
 * champ présent et vide ⇒ colonne effacée. Il doit donc être rendu TOUJOURS,
 * sans quoi revenir à « sans limite » deviendrait impossible.
 */
export interface EtatChasse {
  name: string;
  order_mode: HuntOrderMode;
  /** Saisie BRUTE en secondes ; `"0"` = anti-partage désactivé. */
  min_scan_interval_seconds: string;
  reward_label: string;
  reward_details: string;
  /** Saisie BRUTE ; `""` = stock illimité. */
  reward_stock: string;
  /** `datetime-local` dans le fuseau de l'établissement ; `""` = sans borne. */
  starts_at: string;
  ends_at: string;
  /** Saisie BRUTE en jours ; `""` = sans limite. */
  code_ttl_days: string;
}

/**
 * L'état de départ, lu depuis la ligne. Aucun défaut n'est INVENTÉ ici : tout
 * ce qui est nul devient la chaîne vide, qui est exactement ce que l'action
 * saura relire comme « rien ». Le studio du produit voisin a payé l'inverse —
 * résoudre les défauts au montage grave en base des décisions que personne n'a
 * prises (VIT-19), et l'enregistrement automatique du socle les enverrait.
 *
 * Les deux dates passent par `isoToZonedDateTimeInput` avec le fuseau de
 * L'ÉTABLISSEMENT, jamais celui du navigateur : `updateHunt` relit la saisie
 * avec `zonedDateTimeToIso(…, organization.timezone)`. Un aller-retour dans un
 * autre fuseau décalerait la fenêtre de jeu à chaque enregistrement, sans un
 * mot — le commerçant en déplacement fermerait sa chasse deux heures trop tôt.
 */
export function etatInitialChasse(hunt: Hunt, timeZone: string): EtatChasse {
  return {
    name: hunt.name,
    order_mode: hunt.order_mode,
    min_scan_interval_seconds: String(hunt.min_scan_interval_seconds),
    reward_label: hunt.reward_label,
    reward_details: hunt.reward_details ?? "",
    reward_stock: hunt.reward_stock === null ? "" : String(hunt.reward_stock),
    starts_at: isoToZonedDateTimeInput(hunt.starts_at, timeZone),
    ends_at: isoToZonedDateTimeInput(hunt.ends_at, timeZone),
    code_ttl_days: codeTtlDaysInitial(hunt.code_ttl_days),
  };
}
