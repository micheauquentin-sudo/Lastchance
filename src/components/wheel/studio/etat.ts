import {
  defautsDefi,
  readRaw,
  serialiserDefi,
  type EtatDefi,
} from "@/components/dashboard/atelier-roue-defi";
import { resolveWheelStyle, type WheelStyle } from "@/lib/wheel-style";
import type { GameType, PlayLimit, Wheel } from "@/types/database";

/**
 * L'ÉTAT DU STUDIO DE LA ROUE — les charges des TROIS actions de roue, et rien
 * d'autre (VIT-46).
 *
 * ── UN SEUL ÉTAT POUR TROIS ACTIONS, ET C'EST LA RAISON D'ÊTRE DE CE FICHIER ──
 *
 * La roue a trois écritures, et elles n'ont pas la même forme :
 *
 *  · `updateWheel` — `game_type`, `play_limit` et `skill_config`, écrits en
 *    bloc par un `.update()`. Un champ absent du formulaire arrive à `null` et
 *    l'action refuse (`updateWheelSchema` les exige ENSEMBLE).
 *  · `updateWheelStyle` — la seule colonne `style`, mais elle est **écrasée en
 *    entier** : l'éditeur envoie l'objet complet en JSON.
 *  · `updateWheelSchedule` — les deux heures et les jours cochés.
 *
 * ── LE PIÈGE CENTRAL : DEUX ÉTAPES D'HABILLAGE ──
 *
 * Le studio coupe l'habillage en DEUX étapes (« L'habillage » et « Les
 * couleurs »). Avec deux formulaires, la seconde effacerait la première :
 * `updateWheelStyle` remplace la colonne, il ne la fusionne pas. C'est le même
 * motif que `composerTheme` en VIT-19, et la réponse est la même — **la fusion
 * se fait dans l'ÉTAT, jamais à la reconstruction**.
 *
 * Il n'existe donc qu'un `WheelStyle` en mémoire. Les presets, le fond, les
 * couleurs de la roue et celles de la page écrivent tous dedans ;
 * `chargeStyleRoue` en sérialise l'objet COMPLET, quelle que soit l'étape
 * ouverte. Aucune des deux étapes ne peut amputer l'autre, parce qu'aucune
 * d'elles ne construit la charge.
 *
 * ── POURQUOI LE CRÉNEAU EST EN CHAÎNES ──
 *
 * Même parti pris que les six studios déjà portés : ce qui part est un
 * `FormData`, c'est-à-dire des chaînes, et le VIDE y est une valeur — « pas de
 * borne ». `scheduleHour` du schéma relit `""` comme `null` ; reconstruire un
 * nombre ici transformerait « aucune borne » en `0`, c'est-à-dire minuit.
 *
 * Les JOURS font exception et restent des nombres : ce sont des cases à
 * cocher, jamais une saisie libre, et `updateWheelSchedule` les lit par
 * `formData.getAll()` — une liste, pas un champ.
 */
export interface EtatRoue {
  // ── La charge d'`updateWheel` ──
  game_type: GameType;
  play_limit: PlayLimit;
  /** Réglages du défi, typés par mécanique ; sérialisés en `skill_config`. */
  defi: EtatDefi;

  // ── La charge d'`updateWheelStyle` : UN SEUL objet, deux étapes ──
  style: WheelStyle;

  // ── La charge d'`updateWheelSchedule` ──
  /** Heure locale de l'établissement ; `""` = pas de borne. */
  schedule_start_hour: string;
  schedule_end_hour: string;
  /** 0=dimanche..6=samedi. Liste VIDE = tous les jours. */
  schedule_days: number[];
}

/**
 * L'état de départ, lu depuis la roue.
 *
 * UNE seule résolution est faite ici, et elle est délibérée :
 * `resolveWheelStyle`. C'est le schéma de LECTURE — il replie un style
 * incomplet ou périmé sur les défauts plutôt que d'écraser l'écran, et c'est
 * exactement ce que fait déjà `WheelStyleEditor` au montage. Rien d'autre
 * n'est inventé : la mécanique retombe sur `"wheel"` comme partout ailleurs
 * dans ce module, et le créneau vide reste vide.
 *
 * Le studio du produit voisin a payé l'inverse : résoudre des défauts au
 * montage grave en base des décisions que personne n'a prises (VIT-19), et
 * l'enregistrement automatique du socle les enverrait.
 */
export function etatInitialRoue(wheel: Wheel): EtatRoue {
  const mecanique: GameType = wheel.game_type ?? "wheel";
  return {
    game_type: mecanique,
    play_limit: wheel.play_limit,
    defi: defautsDefi(mecanique, readRaw(wheel)),
    style: resolveWheelStyle(wheel.style as Record<string, unknown>),
    schedule_start_hour:
      wheel.schedule_start_hour === null ? "" : String(wheel.schedule_start_hour),
    schedule_end_hour:
      wheel.schedule_end_hour === null ? "" : String(wheel.schedule_end_hour),
    schedule_days: [...(wheel.schedule_days ?? [])],
  };
}

/**
 * LA CHARGE D'`updateWheel`, CONSTRUITE À UN SEUL ENDROIT.
 *
 * Quatre champs, toujours les mêmes, quelle que soit l'étape ouverte.
 * `ChampsCachesRoue` ne fait que la traduire en `<input hidden>` ; une garde
 * peut donc la lire sans monter d'écran.
 */
export function chargeJeuRoue(
  id: string,
  etat: EtatRoue,
): Record<string, string> {
  return {
    id,
    game_type: etat.game_type,
    play_limit: etat.play_limit,
    // TOUJOURS RENDU, MÊME VIDE : `updateWheelSchema` le relit par
    // `formData.get()` et `""` y vaut `null` — « ce jeu n'a pas de défi ».
    // Absent, il arriverait `null` de toute façon, mais l'absence dépendrait
    // alors de l'étape ouverte, ce qui est précisément ce qu'un studio ne doit
    // jamais laisser arriver.
    skill_config: serialiserDefi(etat.game_type, etat.defi),
  };
}

/**
 * LA CHARGE D'`updateWheelStyle` — l'objet COMPLET, depuis l'état fusionné.
 *
 * C'est ici que se joue la garde des deux étapes d'habillage : rien n'est
 * reconstruit à partir de ce qui est à l'écran, tout vient de `etat.style`.
 */
export function chargeStyleRoue(
  id: string,
  etat: EtatRoue,
): Record<string, string> {
  return { id, style: JSON.stringify(etat.style) };
}

/**
 * LA CHARGE D'`updateWheelSchedule`.
 *
 * `schedule_days` est une LISTE : l'action la lit par `formData.getAll()`, et
 * la liste vide y signifie « tous les jours ». Elle ne peut donc pas voyager
 * dans un `Record<string, string>` comme les deux autres charges — d'où sa
 * forme propre et son propre constructeur de `FormData`.
 */
export interface ChargeCreneauRoue {
  id: string;
  schedule_start_hour: string;
  schedule_end_hour: string;
  schedule_days: number[];
}

export function chargeCreneauRoue(
  id: string,
  etat: EtatRoue,
): ChargeCreneauRoue {
  return {
    id,
    schedule_start_hour: etat.schedule_start_hour,
    schedule_end_hour: etat.schedule_end_hour,
    // TRIÉS : la signature d'enregistrement automatique est la sérialisation de
    // cette charge. Sans tri, décocher puis recocher le même jour produirait
    // une signature différente pour un créneau identique, et enverrait une
    // écriture qui ne change rien.
    schedule_days: [...etat.schedule_days].sort((a, b) => a - b),
  };
}

/** Une charge simple en `FormData` — `updateWheel` et `updateWheelStyle`. */
export function formDataDepuis(charge: Record<string, string>): FormData {
  const donnees = new FormData();
  for (const [cle, valeur] of Object.entries(charge)) donnees.append(cle, valeur);
  return donnees;
}

/** La charge du créneau en `FormData` — un `append` par jour coché. */
export function formDataCreneau(charge: ChargeCreneauRoue): FormData {
  const donnees = new FormData();
  donnees.append("id", charge.id);
  donnees.append("schedule_start_hour", charge.schedule_start_hour);
  donnees.append("schedule_end_hour", charge.schedule_end_hour);
  for (const jour of charge.schedule_days) {
    donnees.append("schedule_days", String(jour));
  }
  return donnees;
}
