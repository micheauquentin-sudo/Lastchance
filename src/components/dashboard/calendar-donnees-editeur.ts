import { spinWheelIssue } from "@/components/dashboard/loyalty-settings-presets";
import { caseVide, casesIncompletes } from "@/lib/activation/calendar";
import type { EntreeVerificationCalendrier } from "@/lib/activation/calendar";
import type { CalendarWheelOption } from "@/components/dashboard/calendar-editor";
import type { Calendar, CalendarDay } from "@/types/database";

/**
 * CE QUE LES ÉCRANS DU CALENDRIER DÉRIVENT DES LIGNES BRUTES — une fois, pour
 * les DEUX écrans qui les montrent (VIT-39).
 *
 * Ces deux fonctions vivaient dans `/dashboard/calendar/[id]/page.tsx`. Le
 * studio (`/studio/calendrier/[id]`) alimente le MÊME éditeur de cases et la
 * MÊME vérification : les y recopier aurait fait deux vérités sur ce qu'est
 * une roue jouable et sur ce qu'est une case garnie, et la première correction
 * n'en aurait touché qu'une. C'est exactement la classe de dette que ce dépôt
 * paie déjà ailleurs.
 */

export interface CalendarWheelRow {
  id: string;
  name: string;
}

export interface CalendarPrizeRow {
  wheel_id: string;
  label: string;
  is_losing: boolean;
  stock: number | null;
  weight: number;
}

/**
 * Roues + état de leurs lots, tel que l'éditeur de cases en a besoin. Miroir du
 * filtre de tirage d'un tour offert (`is_active and weight > 0 and (is_losing or
 * stock > 0)`) : un lot non perdant « vide = illimité » est hors tirage — c'est
 * ce que l'avertissement annonce au commerçant.
 */
export function toCalendarWheelOptions(
  wheels: CalendarWheelRow[],
  prizes: CalendarPrizeRow[],
): CalendarWheelOption[] {
  const byWheel = new Map<string, CalendarPrizeRow[]>();
  for (const prize of prizes) {
    const list = byWheel.get(prize.wheel_id) ?? [];
    list.push(prize);
    byWheel.set(prize.wheel_id, list);
  }
  return wheels.map((w) => {
    const drawn = (byWheel.get(w.id) ?? []).filter((p) => p.weight > 0);
    return {
      id: w.id,
      name: w.name,
      unlimitedPrizes: drawn
        .filter((p) => !p.is_losing && p.stock === null)
        .map((p) => p.label),
      hasDrawablePrize: drawn.some((p) => p.is_losing || (p.stock ?? 0) > 0),
    };
  });
}

export interface BilanCasesCalendrier {
  /** L'entrée de la vérification, partagée avec le refus serveur. */
  entree: EntreeVerificationCalendrier;
  /**
   * « Garnies » AU SENS DU COMMERÇANT : complètes ET donnant quelque chose.
   * Une case message vide est légale (elle s'ouvrira sur un « pas de chance »),
   * donc jamais « à compléter » — mais la compter comme garnie ferait afficher
   * « 24 cases garnies » sur un calendrier qui vient d'être créé.
   */
  garnies: number;
  vides: number;
}

/**
 * LES MÊMES CONTRÔLES POUR TOUTES LES VUES, calculés UNE fois : l'étape de
 * vérification les raconte, le suivi n'en garde que le verdict, en pastille
 * sur chaque bloc. Deux calculs feraient deux vérités sur ce qui manque.
 */
export function bilanCasesCalendrier(
  calendar: Calendar,
  days: CalendarDay[],
  wheels: CalendarWheelOption[],
): BilanCasesCalendrier {
  const cases = days.map((d) => {
    const roue =
      d.content_type === "spin" && d.target_wheel_id
        ? (wheels.find((w) => w.id === d.target_wheel_id) ?? null)
        : undefined;
    return {
      day_index: d.day_index,
      content_type: d.content_type,
      reward_stock: d.reward_stock,
      reward_label: d.reward_label ?? "",
      target_wheel_id: d.target_wheel_id,
      content_text: d.content_text,
      roue:
        roue === undefined
          ? undefined
          : roue === null
            ? null
            : { nom: roue.name, probleme: spinWheelIssue(roue) },
    };
  });

  const vides = cases.filter(caseVide).length;
  const garnies = days.length - casesIncompletes(cases).length - vides;

  return {
    entree: {
      dayCount: calendar.day_count,
      cases,
      completionRewardLabel: calendar.completion_reward_label ?? "",
      completionRewardStock: calendar.completion_reward_stock,
    },
    garnies,
    vides,
  };
}
