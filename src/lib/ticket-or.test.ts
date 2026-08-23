// @vitest-environment node
import { describe, expect, it } from "vitest";

import {
  estCodeTicket,
  mapTicketOrState,
  mapTirage,
  PHRASES_TIRAGE,
  ticketOrVide,
} from "@/lib/ticket-or";

/**
 * TKT-1 — ce que l'écran a le droit de comprendre de la base.
 *
 * DEUX PROPRIÉTÉS PORTENT CE FICHIER. Un stock `null` (illimité) ne doit
 * jamais devenir 0 (épuisé) en traversant le mappeur — la confusion aurait
 * rendu un café offert épuisé au premier tirage. Et un document illisible rend
 * un état VIDE, jamais une erreur : le commerçant a le droit de voir l'écran.
 */

describe("estCodeTicket", () => {
  it("accepte dix caractères de l'alphabet sans ambiguïté", () => {
    expect(estCodeTicket("ABCDEFGHJK")).toBe(true);
    expect(estCodeTicket("23456789AB")).toBe(true);
  });

  it("refuse les caractères confondables — I, O, 0 et 1", () => {
    // Le code se lit à voix haute au comptoir : « 0 ou O » y coûte un ticket
    // perdu et un client qui insiste.
    for (const code of ["ABCDEFGHIJ", "ABCDEFGHO2", "ABCDEFGH01"]) {
      expect(estCodeTicket(code)).toBe(false);
    }
  });

  it("refuse une longueur autre que dix, et tout ce qui n'est pas une chaîne", () => {
    expect(estCodeTicket("ABCDEFGHJ")).toBe(false);
    expect(estCodeTicket("ABCDEFGHJKL")).toBe(false);
    expect(estCodeTicket("abcdefghjk")).toBe(false);
    expect(estCodeTicket(null)).toBe(false);
    expect(estCodeTicket(42)).toBe(false);
  });
});

describe("mapTicketOrState", () => {
  it("distingue un stock ILLIMITÉ d'un stock ÉPUISÉ", () => {
    const vue = mapTicketOrState({
      state: "ok",
      lots: [
        { id: "a", libelle: "Café", poids: 5, stock: null, actif: true, ordre: 0 },
        { id: "b", libelle: "Dessert", poids: 1, stock: 0, actif: true, ordre: 1 },
      ],
      mesures: { emis: 4, tires: 3, remis: 2, a_remettre: 1 },
    });

    expect(vue.lots[0].stock).toBeNull();
    expect(vue.lots[1].stock).toBe(0);
    expect(vue.mesures).toEqual({ emis: 4, tires: 3, remis: 2, aRemettre: 1 });
  });

  it("rend un état vide sur un refus, sans lever", () => {
    expect(mapTicketOrState({ state: "not_authorized" })).toEqual(ticketOrVide());
    expect(mapTicketOrState(null)).toEqual(ticketOrVide());
    expect(mapTicketOrState("…")).toEqual(ticketOrVide());
  });

  it("écarte une ligne mal formée sans perdre les autres", () => {
    const vue = mapTicketOrState({
      state: "ok",
      lots: [null, { id: "a" }, { id: "b", libelle: "Café" }],
      mesures: {},
    });
    expect(vue.lots.map((l) => l.id)).toEqual(["b"]);
    // Les valeurs absentes retombent à zéro, jamais à NaN.
    expect(vue.lots[0].poids).toBe(0);
    expect(vue.mesures.emis).toBe(0);
  });

  it("refuse un compteur négatif", () => {
    const vue = mapTicketOrState({
      state: "ok",
      lots: [],
      mesures: { emis: -3, tires: "beaucoup", remis: null, a_remettre: 2 },
    });
    expect(vue.mesures).toEqual({ emis: 0, tires: 0, remis: 0, aRemettre: 2 });
  });
});

describe("mapTirage", () => {
  it("lit un tirage gagnant", () => {
    expect(
      mapTirage({
        state: "ok",
        lot: "Un café offert",
        code_retrait: "TICKET-ABCD2345",
        expire_le: "2026-09-22T12:00:00Z",
      }),
    ).toEqual({
      state: "ok",
      lot: "Un café offert",
      codeRetrait: "TICKET-ABCD2345",
      expireLe: "2026-09-22T12:00:00Z",
    });
  });

  it("garde les trois refus distincts — ils appellent trois gestes différents", () => {
    for (const state of ["deja_tire", "expire", "sans_lot"] as const) {
      expect(mapTirage({ state })).toEqual({ state });
    }
  });

  it("retombe sur `introuvable` pour tout le reste", () => {
    // Y COMPRIS un « ok » sans lot ni code : un document tronqué ne doit pas
    // annoncer un gain que la base n'a pas écrit.
    expect(mapTirage({ state: "ok" })).toEqual({ state: "introuvable" });
    expect(mapTirage({ state: "autre_chose" })).toEqual({ state: "introuvable" });
    expect(mapTirage(null)).toEqual({ state: "introuvable" });
  });
});

describe("PHRASES_TIRAGE", () => {
  it("ne distingue pas les causes d'`introuvable`", () => {
    // La base rend le même document pour un code inventé, mal formé, ou d'un
    // commerce sans offre. La phrase ne doit pas en dire plus qu'elle.
    expect(PHRASES_TIRAGE.introuvable).not.toMatch(/expir|offre|abonnement/i);
  });

  it("dit à `sans_lot` que le ticket reste valable", () => {
    // Le ticket n'est PAS consommé quand il n'y a rien à tirer : le lui cacher
    // ferait repartir un client qui pouvait revenir.
    expect(PHRASES_TIRAGE.sans_lot).toMatch(/valable/i);
  });
});
