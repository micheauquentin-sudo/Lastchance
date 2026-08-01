// @vitest-environment node
import { describe, expect, it } from "vitest";

import {
  easterSunday,
  isFrenchPublicHoliday,
  smsMarketingWindow,
} from "@/lib/sms-window";

/* ════════════════════════════════════════════════════════════
 * LA FENÊTRE HORAIRE — ce que ces tests prouvent
 *
 * La règle est une règle de DROIT, pas une préférence : 22 h–8 h, dimanche et
 * jours fériés interdits (charte AF2M / doctrine CNIL). Un test qui se
 * contenterait de « la fonction rend un booléen » ne dirait rien de ce qui
 * compte, à savoir que la frontière est au bon endroit, dans le BON FUSEAU, et
 * que le changement d'heure ne la déplace pas.
 *
 * Les instants sont donc écrits en UTC EXPLICITE (`Z`) et jamais en heure
 * locale : un littéral sans offset serait interprété dans le fuseau du
 * processus, et le test mesurerait la machine au lieu de mesurer la règle.
 * ════════════════════════════════════════════════════════════ */

const at = (iso: string) => smsMarketingWindow(new Date(iso));

describe("smsMarketingWindow — la frontière est à l'heure de Paris", () => {
  it("ouvre à 8 h et ferme à 22 h, heure de Paris", () => {
    // Mardi 4 août 2026, heure d'été (Paris = UTC+2).
    expect(at("2026-08-04T05:59:59Z")).toEqual({
      allowed: false,
      closure: "night",
    }); // 07 h 59
    expect(at("2026-08-04T06:00:00Z")).toEqual({ allowed: true }); // 08 h 00
    expect(at("2026-08-04T19:59:59Z")).toEqual({ allowed: true }); // 21 h 59
    expect(at("2026-08-04T20:00:00Z")).toEqual({
      allowed: false,
      closure: "night",
    }); // 22 h 00
  });

  it("SUIT LE CHANGEMENT D'HEURE — c'est tout l'intérêt du fuseau nommé", () => {
    /* ROUGE SI : quelqu'un remplace `Intl` par `getHours()` ou par un décalage
     * fixe. Vercel exécute en UTC. À 06 h 30 UTC un jour d'hiver il est 07 h 30
     * à Paris — INTERDIT ; le même instant en été il est 08 h 30 — AUTORISÉ.
     * Un décalage codé en dur se tromperait sur l'une des deux moitiés de
     * l'année, c'est-à-dire précisément pendant les heures que la règle
     * protège. */
    // Mardi 13 janvier 2026, heure d'hiver (Paris = UTC+1).
    expect(at("2026-01-13T06:30:00Z")).toEqual({
      allowed: false,
      closure: "night",
    }); // 07 h 30
    // Mardi 14 juillet exclu (férié) : on prend le mardi 7 juillet, été.
    expect(at("2026-07-07T06:30:00Z")).toEqual({ allowed: true }); // 08 h 30
  });

  it("refuse le dimanche entier, y compris en plein jour", () => {
    // Dimanche 9 août 2026, 14 h à Paris.
    expect(at("2026-08-09T12:00:00Z")).toEqual({
      allowed: false,
      closure: "sunday",
    });
    // Samedi 8 août, même heure : autorisé. Le samedi n'est PAS interdit.
    expect(at("2026-08-08T12:00:00Z")).toEqual({ allowed: true });
  });

  it("un dimanche à 23 h est étiqueté `night` — la contrainte la plus tardive", () => {
    // Dimanche 9 août 2026, 23 h à Paris. Deux causes sont vraies ; l'ordre de
    // lecture est fixé, et documenté sur la fonction.
    expect(at("2026-08-09T21:00:00Z")).toEqual({
      allowed: false,
      closure: "night",
    });
  });

  it("refuse un jour férié en pleine journée ouvrable", () => {
    // Mardi 14 juillet 2026, 11 h à Paris : un mardi ordinaire pour tout le
    // reste du produit.
    expect(at("2026-07-14T09:00:00Z")).toEqual({
      allowed: false,
      closure: "holiday",
    });
    // La veille, même heure : autorisé.
    expect(at("2026-07-13T09:00:00Z")).toEqual({ allowed: true });
  });

  it("le fuseau décide du JOUR, pas seulement de l'heure", () => {
    /* ROUGE SI : le jour de la semaine ou la date du férié est dérivé de
     * l'instant UTC. Le lundi 15 juin 2026 à 22 h 30 UTC, il est déjà MARDI
     * 16 juin 00 h 30 à Paris — donc la nuit, et un jour civil plus loin. */
    expect(at("2026-06-15T22:30:00Z")).toEqual({
      allowed: false,
      closure: "night",
    });
    // Le 31 décembre 2025 à 23 h 30 UTC, il est le 1ᵉʳ janvier 2026 à Paris.
    // La date civile change de jour, de mois ET d'année.
    expect(at("2025-12-31T23:30:00Z")).toEqual({
      allowed: false,
      closure: "night",
    });
    // Le 1ᵉʳ janvier 2026 à 10 h à Paris : férié, et non « nuit du 31 ».
    expect(at("2026-01-01T09:00:00Z")).toEqual({
      allowed: false,
      closure: "holiday",
    });
  });
});

describe("easterSunday — les trois fériés mobiles ne se codent pas en dur", () => {
  it.each([
    [2024, 3, 31],
    [2025, 4, 20],
    [2026, 4, 5],
    [2027, 3, 28],
    [2030, 4, 21],
    [2038, 4, 25], // borne haute de l'algorithme : Pâques au plus tard
    [2285, 3, 22], // borne basse : Pâques au plus tôt
  ])("Pâques %i tombe le %i/%i", (year, month, day) => {
    expect(easterSunday(year)).toEqual({ month, day });
  });
});

describe("isFrenchPublicHoliday — onze jours, huit fixes et trois mobiles", () => {
  it("reconnaît les huit fériés à date fixe", () => {
    for (const [month, day] of [
      [1, 1],
      [5, 1],
      [5, 8],
      [7, 14],
      [8, 15],
      [11, 1],
      [11, 11],
      [12, 25],
    ]) {
      expect(isFrenchPublicHoliday(2026, month, day), `${day}/${month}`).toBe(true);
    }
  });

  it("reconnaît les trois fériés dérivés de Pâques (2026 : 5 avril)", () => {
    expect(isFrenchPublicHoliday(2026, 4, 6)).toBe(true); // lundi de Pâques
    expect(isFrenchPublicHoliday(2026, 5, 14)).toBe(true); // Ascension (+39)
    expect(isFrenchPublicHoliday(2026, 5, 25)).toBe(true); // lundi de Pentecôte (+50)
  });

  it("ne prend PAS le dimanche de Pâques ni la Pentecôte pour des fériés", () => {
    // Ils tombent un dimanche — déjà interdit par ailleurs — mais ne sont pas
    // fériés au sens de l'article L3133-1. Les y ajouter ferait dire au
    // compteur « holiday » là où la cause est « sunday ».
    expect(isFrenchPublicHoliday(2026, 4, 5)).toBe(false);
    expect(isFrenchPublicHoliday(2026, 5, 24)).toBe(false);
  });

  it("RÉSIDU ASSUMÉ : les deux fériés d'Alsace-Moselle ne sont pas couverts", () => {
    // Vendredi saint 2026 (3 avril) et 26 décembre. Ils dépendent du
    // département du DESTINATAIRE, que ce produit ne connaît pas. Ce test
    // existe pour que le trou soit VISIBLE plutôt que supposé fermé : le jour
    // où le produit connaîtra le département, il dira où intervenir.
    expect(isFrenchPublicHoliday(2026, 4, 3)).toBe(false);
    expect(isFrenchPublicHoliday(2026, 12, 26)).toBe(false);
  });

  it("un jour ordinaire n'est pas férié", () => {
    expect(isFrenchPublicHoliday(2026, 8, 4)).toBe(false);
    expect(isFrenchPublicHoliday(2026, 4, 7)).toBe(false); // lendemain du lundi de Pâques
    expect(isFrenchPublicHoliday(2026, 5, 15)).toBe(false); // lendemain de l'Ascension
  });
});
