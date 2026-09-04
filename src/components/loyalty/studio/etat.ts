import { codeTtlDaysInitial } from "@/components/dashboard/code-ttl-days-field";
import {
  clampLoyaltyPeriod,
  resolveLoyaltyCooldown,
} from "@/components/dashboard/loyalty-settings-presets";
import { resolveLoyaltyStyle } from "@/lib/loyalty-style";
import type { FondKey } from "@/lib/fonds-ecran";
import type { LoyaltyProgram, LoyaltyValidationMode } from "@/types/database";

/**
 * L'ÉTAT DU STUDIO DU PASSEPORT — les QUATORZE réglages que les TROIS actions
 * d'écriture du programme portent, plus rien (VIT-42).
 *
 * ── UN SEUL ÉTAT POUR TROIS ACTIONS, ET C'EST LA RAISON D'ÊTRE DE CE FICHIER ──
 *
 * Le passeport a trois écritures de programme, et elles ne se ressemblent pas
 * par ce qu'elles TOUCHENT :
 *
 *  · `updateLoyaltyProgram` — huit colonnes, réécrites EN BLOC par un
 *    `.update()` : un champ absent du formulaire arrive à `null` et se fait
 *    refuser, ou pire, écrase la valeur d'avant ;
 *  · `updateLoyaltyProgramStyle` — la seule colonne `style` ;
 *  · `updateLoyaltyProgramReferral` — les cinq colonnes `referral_*`.
 *
 * Les deux dernières existent précisément PARCE QUE la première écrase : c'est
 * écrit noir sur blanc dans leurs en-têtes (src/actions/loyalty.ts). Elles ne
 * peuvent rien écraser, mais elles restent trois départs distincts.
 *
 * ── LE PIÈGE QUE CE DÉCOUPAGE ROUVRE, ET CE QUI LE FERME ──
 *
 * Jusqu'ici, `LoyaltySettings` et `LoyaltyTiersForm` visaient TOUS LES DEUX
 * `updateLoyaltyProgram`, et chacun repostait en champs cachés la part de
 * l'autre : les seuils d'un côté, le nom / le mode / la rotation / la fréquence
 * / le jackpot de l'autre. Cet arrangement ne tenait que sur une chose, écrite
 * dans le commentaire des champs cachés : « ils vivent sur des étapes
 * différentes, jamais à l'écran ensemble ».
 *
 * Un studio qui les afficherait ensemble, avec enregistrement automatique,
 * ferait DEUX ÉCRIVAINS CONCURRENTS sur les mêmes colonnes — chacun repostant
 * une copie figée de la part de l'autre, et le dernier arrivé gagnant.
 *
 * La parade n'est pas de mieux synchroniser les miroirs : c'est de les
 * SUPPRIMER. Il n'existe plus qu'un état, `ChampsCachesFidelite` en rend la
 * charge EN ENTIER à chaque rendu, et aucun contrôle visible ne porte de
 * `name`. Il n'y a alors plus deux écrivains, ni deux copies à tenir d'accord.
 *
 * ── POURQUOI CERTAINS CHAMPS SONT DES CHAÎNES ET D'AUTRES DES NOMBRES ──
 *
 * Même parti pris que le calendrier (VIT-39) et le quiz (VIT-41) : une saisie
 * LIBRE voyage BRUTE et se fait valider par le schéma, qui porte déjà tous les
 * messages. Reconstruire un nombre ici transformerait un champ vidé le temps de
 * retaper en un `0` silencieux — un seuil à 0 n'est pas la même chose qu'un
 * seuil qu'on est en train d'écrire.
 *
 * La rotation et la fréquence font exception, et c'est délibéré : ce sont des
 * `<select>` à options fixes, où le vide n'existe pas. Les garder en nombres
 * permet à `resolveLoyaltyCooldown` — la fonction qui fait déjà autorité dans
 * l'atelier — de calculer le plancher sans conversion intermédiaire.
 */
export interface EtatFidelite {
  // ── La charge d'`updateLoyaltyProgram` (huit colonnes en bloc) ──
  name: string;
  validation_mode: LoyaltyValidationMode;
  /** Secondes ; `<select>` à options fixes, jamais vide. */
  rotating_period_seconds: number;
  /** Secondes ; `<select>` à options fixes, jamais vide. */
  min_stamp_interval_seconds: number;
  /** Saisie BRUTE en points. */
  silver_threshold: string;
  /** Saisie BRUTE en points. */
  gold_threshold: string;
  /** `""` = aucun pot associé. */
  jackpot_campaign_id: string;
  /** Saisie BRUTE en jours ; `""` = sans limite. */
  code_ttl_days: string;

  // ── La charge d'`updateLoyaltyProgramStyle` ──
  /** `""` = aucun fond choisi (l'habillage par défaut). */
  fond: FondKey | "";

  // ── La charge d'`updateLoyaltyProgramReferral` (cinq colonnes) ──
  referral_enabled: boolean;
  /** Saisies BRUTES : points, points, nombre de filleuls, jours. */
  referral_sponsor_points: string;
  referral_filleul_points: string;
  referral_max_filleuls: string;
  referral_window_days: string;
}

/**
 * L'état de départ, lu depuis la ligne. Aucun défaut n'est INVENTÉ : tout ce
 * qui vaut « rien » en base devient la chaîne vide, que les schémas savent
 * relire. Le studio du produit voisin a payé l'inverse — résoudre les défauts
 * au montage grave en base des décisions que personne n'a prises (VIT-19), et
 * l'enregistrement automatique du socle les enverrait.
 *
 * DEUX EXCEPTIONS, toutes deux reprises telles quelles de l'atelier :
 *
 *  · `clampLoyaltyPeriod` — un programme enregistré avant le durcissement des
 *    bornes peut porter une rotation hors 15..300 s. Elle n'est proposée par
 *    aucune option du `<select>`, et un `<select>` dont la valeur n'existe pas
 *    retombe sur sa première option en silence.
 *  · `resolveLoyaltyStyle` — schéma de LECTURE : un fond retiré du catalogue
 *    rend un habillage vide, jamais un écran en erreur.
 */
export function etatInitialFidelite(program: LoyaltyProgram): EtatFidelite {
  return {
    name: program.name,
    validation_mode: program.validation_mode,
    rotating_period_seconds: clampLoyaltyPeriod(program.rotating_period_seconds),
    min_stamp_interval_seconds: program.min_stamp_interval_seconds,
    silver_threshold: String(program.silver_threshold),
    gold_threshold: String(program.gold_threshold),
    jackpot_campaign_id: program.jackpot_campaign_id ?? "",
    code_ttl_days: codeTtlDaysInitial(program.code_ttl_days),

    fond: resolveLoyaltyStyle(program.style).fond ?? "",

    referral_enabled: program.referral_enabled,
    referral_sponsor_points: String(program.referral_sponsor_points),
    referral_filleul_points: String(program.referral_filleul_points),
    referral_max_filleuls: String(program.referral_max_filleuls),
    referral_window_days: String(program.referral_window_days),
  };
}

/**
 * LA FRÉQUENCE RÉELLEMENT POSTÉE — jamais la saisie brute.
 *
 * `updateLoyaltyProgramSchema` porte un `superRefine` miroir du CHECK SQL
 * `loyalty_programs_cooldown_floor_check` : les DEUX modes imposent un plancher
 * (`max(2 × rotation, 300 s)` au comptoir, `300 s` en caisse). Changer de mode
 * peut donc rendre INVALIDE une fréquence qui l'était la seconde d'avant.
 *
 * L'atelier résout cela en affichant la valeur corrigée dans son `<select>` ;
 * le studio n'a pas ce luxe — l'étape qui porte la fréquence peut être fermée
 * au moment où le mode change. La correction est donc faite ICI, à un seul
 * endroit, par la fonction qui fait déjà autorité, et l'écran lit le même
 * résultat pour le dire au commerçant (« Réglage ajusté sur … »).
 */
export function frequenceResolueFidelite(etat: EtatFidelite) {
  return resolveLoyaltyCooldown({
    mode: etat.validation_mode,
    periodSeconds: etat.rotating_period_seconds,
    cooldownSeconds: etat.min_stamp_interval_seconds,
  });
}

/**
 * LA CHARGE D'`updateLoyaltyProgram`, CONSTRUITE À UN SEUL ENDROIT.
 *
 * Huit champs plus l'identifiant, toujours les mêmes, quelle que soit l'étape
 * ouverte. `ChampsCachesFidelite` ne fait que la traduire en `<input hidden>` ;
 * une garde peut donc la lire sans monter d'écran.
 */
export function chargeReglagesFidelite(
  id: string,
  etat: EtatFidelite,
): Record<string, string> {
  return {
    id,
    name: etat.name,
    validation_mode: etat.validation_mode,
    rotating_period_seconds: String(etat.rotating_period_seconds),
    min_stamp_interval_seconds: String(frequenceResolueFidelite(etat).value),
    silver_threshold: etat.silver_threshold,
    gold_threshold: etat.gold_threshold,
    jackpot_campaign_id: etat.jackpot_campaign_id,
    // TOUJOURS RENDU, MÊME VIDE. Côté serveur il est lu par
    // `formData.has("code_ttl_days")` et non `get()`, parce que le VIDE y est
    // une valeur LÉGITIME — « sans limite ». Champ absent ⇒ colonne intacte,
    // champ présent et vide ⇒ colonne effacée.
    code_ttl_days: etat.code_ttl_days.trim(),
  };
}

/** La charge d'`updateLoyaltyProgramStyle` — une colonne, un JSON. */
export function chargeStyleFidelite(
  id: string,
  etat: EtatFidelite,
): Record<string, string> {
  // `{}` et non `{ fond: undefined }` : `JSON.stringify` laisse tomber la clé
  // indéfinie, mais on ne veut pas que la charge repose sur un effet de bord de
  // la sérialisation. `null` en base = aucun choix, donc l'habillage par défaut.
  return {
    id,
    style: JSON.stringify(etat.fond ? { fond: etat.fond } : {}),
  };
}

/** La charge d'`updateLoyaltyProgramReferral` — les cinq colonnes, en bloc. */
export function chargeParrainageFidelite(
  id: string,
  etat: EtatFidelite,
): Record<string, string> {
  return {
    id,
    // La valeur est EXPLICITE et non déduite d'une case cochée : un navigateur
    // n'envoie pas une case décochée, et « je coupe le parrainage »
    // n'atteindrait jamais le serveur. C'est déjà la parade de l'atelier.
    referral_enabled: etat.referral_enabled ? "true" : "false",
    referral_sponsor_points: etat.referral_sponsor_points,
    referral_filleul_points: etat.referral_filleul_points,
    referral_max_filleuls: etat.referral_max_filleuls,
    referral_window_days: etat.referral_window_days,
  };
}

/** Une charge en `FormData` — les trois actions du module en prennent une. */
export function formDataDepuis(charge: Record<string, string>): FormData {
  const donnees = new FormData();
  for (const [cle, valeur] of Object.entries(charge)) donnees.append(cle, valeur);
  return donnees;
}
