import { describe, it, expect } from "vitest";
import {
  customerBadges,
  customerFiltersActifs,
  customerSearchParams,
  parseCustomerFilters,
} from "./filters";

const JOUR = 86_400_000;
const MAINTENANT = Date.UTC(2026, 7, 9);
const ilYA = (jours: number) => new Date(MAINTENANT - jours * JOUR).toISOString();

describe("parseCustomerFilters", () => {
  it("normalise segment et tri, valeur inconnue ⇒ défaut silencieux", () => {
    expect(parseCustomerFilters({ segment: "fidele", tri: "gains" })).toEqual({
      q: undefined,
      segment: "fidele",
      tri: "gains",
    });
    // Miroir du comportement de la RPC : un paramètre d'URL mal tapé ne rend
    // pas la page inaccessible, il retombe sur le défaut / l'absence de filtre.
    expect(parseCustomerFilters({ segment: "vip", tri: "au-hasard" })).toEqual({
      q: undefined,
      segment: undefined,
      tri: "dernier_gain",
    });
  });

  it("garde les caractères ilike de la recherche (la RPC les échappe) et borne à 80", () => {
    expect(parseCustomerFilters({ q: "  a%b_c  " }).q).toBe("a%b_c");
    expect(parseCustomerFilters({ q: "x".repeat(200) }).q).toHaveLength(80);
    expect(parseCustomerFilters({ q: "   " }).q).toBeUndefined();
  });
});

describe("customerSearchParams", () => {
  it("ne propage pas le tri par défaut", () => {
    expect(customerSearchParams(parseCustomerFilters({ q: "momo" }))).toEqual({
      q: "momo",
      segment: undefined,
      tri: undefined,
    });
    expect(customerSearchParams(parseCustomerFilters({ tri: "gains" })).tri).toBe("gains");
  });

  it("customerFiltersActifs suit les trois filtres", () => {
    expect(customerFiltersActifs(parseCustomerFilters({}))).toBe(false);
    expect(customerFiltersActifs(parseCustomerFilters({ segment: "nouveau" }))).toBe(true);
    expect(customerFiltersActifs(parseCustomerFilters({ tri: "recuperes" }))).toBe(true);
  });
});

describe("customerBadges", () => {
  it("cumule les segments : le SQL n'est pas exclusif, la pastille non plus", () => {
    // Cinq gains, dernier il y a quatre-vingts jours : fidèle ET à relancer.
    // L'ancienne pastille rendait « À relancer » SEUL (return anticipé), ce qui
    // contredisait un filtre sur « Fidèles ».
    const badges = customerBadges({ wins: 5, last_win: ilYA(80) }, MAINTENANT);
    expect(badges.map((b) => b.label)).toEqual(["Fidèle", "À relancer"]);
  });

  it("un seul gain récent est « Nouveau », deux gains récents n'ont aucune pastille", () => {
    expect(customerBadges({ wins: 1, last_win: ilYA(2) }, MAINTENANT).map((b) => b.label)).toEqual([
      "Nouveau",
    ]);
    expect(customerBadges({ wins: 2, last_win: ilYA(2) }, MAINTENANT)).toEqual([]);
  });

  it("le seuil « à relancer » est strictement au-delà de soixante jours", () => {
    expect(customerBadges({ wins: 1, last_win: ilYA(59) }, MAINTENANT).map((b) => b.label)).toEqual([
      "Nouveau",
    ]);
    expect(customerBadges({ wins: 1, last_win: ilYA(61) }, MAINTENANT).map((b) => b.label)).toEqual([
      "Nouveau",
      "À relancer",
    ]);
  });
});
