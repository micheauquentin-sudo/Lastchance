import { codeTtlDaysInitial } from "@/components/dashboard/code-ttl-days-field";
import {
  clampJackpotPeriod,
  resolveJackpotCooldown,
} from "@/components/jackpot/jackpot-state";
import { isoToZonedDateTimeInput } from "@/lib/date-time";
import type {
  JackpotCampaign,
  JackpotDrawMode,
  JackpotValidationMode,
} from "@/types/database";

/**
 * L'ÉTAT DU STUDIO DE LA CAGNOTTE — la charge utile d'`updateJackpotCampaign`,
 * et rien d'autre (VIT-44).
 *
 * ── UNE SEULE ACTION, ET C'EST ELLE LE PIÈGE ──
 *
 * Contrairement au passeport (trois écritures de programme), la cagnotte n'en a
 * qu'UNE pour ses réglages — et elle réécrit TOUTES ses colonnes en bloc, par
 * un `.update(campaignFieldsForMode(...))`. Un champ non rendu n'y est jamais
 * « absent » : il prend le défaut de son schéma, et l'action l'écrit.
 *
 *  · `public_slug` → `null` : tous les QR déjà imprimés cessent de pointer sur
 *    l'adresse lisible ;
 *  · `reward_label` → `""` : le lot disparaît, l'activation est bloquée ;
 *  · `display_base` / `display_increment` → `0` (`nonRenduVaut(…, 0)`) : le
 *    compteur qui chauffe la salle retombe à zéro.
 *
 * Aucun des trois ne rougit : le schéma les accepte, l'action répond
 * « Enregistré », et l'écart ne se découvre qu'en rouvrant la page publique.
 * C'est la raison pour laquelle l'atelier n'a jamais découpé sa carte de
 * réglages, et c'est exactement ce que ce fichier referme — il n'existe qu'UN
 * état, `ChampsCachesCagnotte` en rend la charge EN ENTIER à chaque rendu, et
 * aucun contrôle visible ne porte de `name`.
 *
 * ── POURQUOI CERTAINS CHAMPS SONT DES CHAÎNES ET D'AUTRES DES NOMBRES ──
 *
 * Même parti pris que le calendrier (VIT-39), le quiz (VIT-41) et le passeport
 * (VIT-42) : une saisie LIBRE voyage BRUTE et se fait valider par le schéma,
 * qui porte déjà tous les messages. Reconstruire un nombre ici transformerait un
 * champ vidé le temps de retaper en un `0` silencieux — un objectif à 0 n'est
 * pas la même chose qu'un objectif qu'on est en train d'écrire, et un stock à 0
 * veut dire « en pause ».
 *
 * La rotation et la fréquence font exception, et c'est délibéré : ce sont des
 * `<select>` à options fixes, où le vide n'existe pas. Les garder en nombres
 * permet à `resolveJackpotCooldown` — la fonction qui fait déjà autorité dans
 * l'atelier — de calculer le plancher sans conversion intermédiaire.
 */
export interface EtatCagnotte {
  name: string;
  /** `""` = aucune adresse lisible (la page publique retombe sur l'UUID). */
  public_slug: string;
  validation_mode: JackpotValidationMode;
  /** Secondes ; `<select>` à options fixes, jamais vide. */
  rotating_period_seconds: number;
  /** Secondes ; `<select>` à options fixes, jamais vide. */
  min_participation_interval_seconds: number;
  draw_mode: JackpotDrawMode;
  /** Saisie BRUTE en participations. */
  threshold: string;
  /** Saisie BRUTE dans ]0, 1] ; `""` = valeur automatique (1 ÷ objectif). */
  win_probability: string;
  /** Saisie BRUTE `datetime-local`, en heure CIVILE de l'établissement. */
  draw_at: string;
  reward_label: string;
  reward_details: string;
  /** Saisie BRUTE en unités ; `""` refusé par `refineCampaign` (stock FINI). */
  reward_stock: string;
  /** Saisie BRUTE en EUROS (le schéma convertit en centimes). */
  display_base: string;
  /** Saisie BRUTE en EUROS (le schéma convertit en centimes). */
  display_increment: string;
  merchant_content: string;
  /** Saisie BRUTE en jours ; `""` = sans limite. */
  code_ttl_days: string;
}

/** centimes → euros, pour un champ de saisie (0 reste « 0 », jamais de NaN). */
function centimesEnEuros(cents: number): string {
  return String(Math.max(0, Math.trunc(cents)) / 100);
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
 *  · `clampJackpotPeriod` — une campagne enregistrée avant le durcissement des
 *    bornes peut porter une rotation hors 15..300 s. Elle n'est proposée par
 *    aucune option du `<select>`, et un `<select>` dont la valeur n'existe pas
 *    retombe sur sa première option en silence.
 *  · `isoToZonedDateTimeInput` — `draw_at` est stocké en INSTANT (UTC) et se
 *    saisit en heure CIVILE de l'établissement. Afficher l'instant brut
 *    décalerait le tirage d'une à douze heures selon le fuseau, et le
 *    prochain enregistrement automatique graverait ce décalage. C'est le
 *    piège de date déjà payé ailleurs dans le dépôt (`src/lib/date-time.ts`).
 */
export function etatInitialCagnotte(
  campaign: JackpotCampaign,
  timeZone: string,
): EtatCagnotte {
  return {
    name: campaign.name,
    public_slug: campaign.public_slug ?? "",
    validation_mode: campaign.validation_mode,
    rotating_period_seconds: clampJackpotPeriod(campaign.rotating_period_seconds),
    min_participation_interval_seconds:
      campaign.min_participation_interval_seconds,
    draw_mode: campaign.draw_mode,
    threshold: String(campaign.threshold),
    win_probability:
      campaign.win_probability === null ? "" : String(campaign.win_probability),
    draw_at: isoToZonedDateTimeInput(campaign.draw_at, timeZone),
    reward_label: campaign.reward_label,
    reward_details: campaign.reward_details ?? "",
    reward_stock: String(campaign.reward_stock),
    display_base: centimesEnEuros(campaign.display_base_cents),
    display_increment: centimesEnEuros(campaign.display_increment_cents),
    merchant_content: campaign.merchant_content ?? "",
    code_ttl_days: codeTtlDaysInitial(campaign.code_ttl_days),
  };
}

/**
 * LA FRÉQUENCE RÉELLEMENT POSTÉE — jamais la saisie brute.
 *
 * `refineCampaign` porte un `superRefine` miroir du CHECK SQL
 * `jackpot_campaigns_cooldown_floor_check` : les DEUX modes imposent un
 * plancher — `max(2 × rotation, 300 s)` au comptoir, `300 s` en caisse.
 * Changer de mode, ou allonger la rotation, peut donc rendre INVALIDE une
 * fréquence qui l'était la seconde d'avant.
 *
 * L'atelier résout cela en affichant la valeur corrigée dans son `<select>` ;
 * le studio n'a pas ce luxe — l'étape qui porte la fréquence peut être FERMÉE
 * au moment où le mode change, et l'enregistrement automatique partirait alors
 * avec une charge que le serveur refuse, sur un écran où rien ne se passe. La
 * correction est donc faite ICI, dans la CHARGE UTILE, par la fonction qui fait
 * déjà autorité, et l'écran lit le même résultat pour le dire au commerçant
 * (« Réglage ajusté sur … »).
 */
export function frequenceResolueCagnotte(etat: EtatCagnotte) {
  return resolveJackpotCooldown({
    mode: etat.validation_mode,
    periodSeconds: etat.rotating_period_seconds,
    cooldownSeconds: etat.min_participation_interval_seconds,
  });
}

/**
 * LA CHARGE D'`updateJackpotCampaign`, CONSTRUITE À UN SEUL ENDROIT.
 *
 * Les seize champs plus l'identifiant, TOUJOURS les mêmes, quelle que soit
 * l'étape ouverte. `ChampsCachesCagnotte` ne fait que la traduire en
 * `<input hidden>` ; une garde peut donc la lire sans monter d'écran.
 *
 * `win_probability` et `draw_at` en font partie même quand le mode de tirage ne
 * les affiche pas : `campaignFieldsForMode` les écrase à `null` hors de leur
 * mode, mais leur saisie doit SURVIVRE à un aller-retour entre deux modes de
 * tirage tant que le commerçant n'a pas enregistré. Les retirer de la charge
 * les ferait disparaître de l'écran à la première bascule.
 */
export function chargeReglagesCagnotte(
  id: string,
  etat: EtatCagnotte,
): Record<string, string> {
  return {
    id,
    name: etat.name,
    public_slug: etat.public_slug.trim(),
    validation_mode: etat.validation_mode,
    rotating_period_seconds: String(etat.rotating_period_seconds),
    min_participation_interval_seconds: String(
      frequenceResolueCagnotte(etat).value,
    ),
    draw_mode: etat.draw_mode,
    threshold: etat.threshold,
    win_probability: etat.win_probability,
    draw_at: etat.draw_at,
    reward_label: etat.reward_label,
    reward_details: etat.reward_details,
    reward_stock: etat.reward_stock,
    display_base: etat.display_base,
    display_increment: etat.display_increment,
    merchant_content: etat.merchant_content,
    // TOUJOURS RENDU, MÊME VIDE. Côté serveur il est lu par
    // `formData.has("code_ttl_days")` et non `get()`, parce que le VIDE y est
    // une valeur LÉGITIME — « sans limite ». Champ absent ⇒ colonne intacte,
    // champ présent et vide ⇒ colonne effacée.
    code_ttl_days: etat.code_ttl_days.trim(),
  };
}
