import { describe, expect, it } from "vitest";

import {
  contestReminderDedupKey,
  joueursARelancer,
  lundiDeLaSemaine,
} from "./contest-reminders";

/**
 * LE RAPPEL HEBDOMADAIRE — ce qui le sépare d'une newsletter.
 *
 * La promesse faite au joueur quand il coche la case est double : on le
 * prévient s'il lui manque des pronostics, et on ne lui écrit PAS si sa grille
 * est à jour. La seconde moitié est celle qu'on trahit sans s'en rendre compte,
 * et c'est celle que ces tests tiennent.
 */

const joueur = (id: string) => ({
  id,
  email: `${id}@example.com`,
  firstName: id,
});

describe("joueursARelancer — le silence est la règle par défaut", () => {
  it("relance un joueur à qui il manque un pronostic", () => {
    const relances = joueursARelancer({
      joueurs: [joueur("alice")],
      matchsAVenir: [{ id: "m1" }, { id: "m2" }],
      pronostics: [{ playerId: "alice", matchId: "m1" }],
    });

    expect(relances).toEqual([
      {
        playerId: "alice",
        email: "alice@example.com",
        firstName: "alice",
        manquants: 1,
        total: 2,
      },
    ]);
  });

  /** LA PROMESSE. Une grille complète ne déclenche RIEN. */
  it("ne relance PAS un joueur dont la grille est complète", () => {
    expect(
      joueursARelancer({
        joueurs: [joueur("alice")],
        matchsAVenir: [{ id: "m1" }, { id: "m2" }],
        pronostics: [
          { playerId: "alice", matchId: "m1" },
          { playerId: "alice", matchId: "m2" },
        ],
      }),
    ).toEqual([]);
  });

  it("ne relance personne quand aucun match n'est à venir", () => {
    // « Il vous manque 0 pronostic » serait un courriel sans objet.
    expect(
      joueursARelancer({
        joueurs: [joueur("alice"), joueur("bob")],
        matchsAVenir: [],
        pronostics: [],
      }),
    ).toEqual([]);
  });

  /**
   * Un pronostic posé sur un match HORS fenêtre (journée d'après, ou match
   * déjà joué) ne compte pas comme rempli : sinon un joueur très en avance
   * cesserait d'être relancé pour la semaine en cours.
   */
  it("ne compte que les pronostics des matchs de la fenêtre", () => {
    const relances = joueursARelancer({
      joueurs: [joueur("alice")],
      matchsAVenir: [{ id: "m1" }],
      pronostics: [
        { playerId: "alice", matchId: "hors-fenetre" },
        { playerId: "alice", matchId: "deja-joue" },
      ],
    });

    expect(relances).toHaveLength(1);
    expect(relances[0].manquants).toBe(1);
  });

  it("ne mélange pas les joueurs entre eux", () => {
    const relances = joueursARelancer({
      joueurs: [joueur("alice"), joueur("bob")],
      matchsAVenir: [{ id: "m1" }, { id: "m2" }],
      pronostics: [
        { playerId: "alice", matchId: "m1" },
        { playerId: "alice", matchId: "m2" },
        { playerId: "bob", matchId: "m1" },
      ],
    });

    // Alice est à jour, Bob non.
    expect(relances.map((r) => r.playerId)).toEqual(["bob"]);
    expect(relances[0].manquants).toBe(1);
  });

  it("aucun joueur consentant : personne n'est relancé", () => {
    expect(
      joueursARelancer({
        joueurs: [],
        matchsAVenir: [{ id: "m1" }],
        pronostics: [],
      }),
    ).toEqual([]);
  });
});

describe("lundiDeLaSemaine — la clé anti-doublon est stable sur 7 jours", () => {
  it("rend le même lundi pour tous les jours d'une semaine", () => {
    // Lundi 24 août 2026 → dimanche 30 août 2026.
    const attendu = "2026-08-24";
    for (const jour of [24, 25, 26, 27, 28, 29, 30]) {
      expect(
        lundiDeLaSemaine(new Date(Date.UTC(2026, 7, jour, 12))),
        `2026-08-${jour}`,
      ).toBe(attendu);
    }
  });

  it("bascule le lundi suivant, pas le dimanche", () => {
    expect(lundiDeLaSemaine(new Date(Date.UTC(2026, 7, 31, 0)))).toBe(
      "2026-08-31",
    );
  });

  it("la clé change de semaine en semaine, jamais dans la semaine", () => {
    const mardi = contestReminderDedupKey(
      "p1",
      lundiDeLaSemaine(new Date(Date.UTC(2026, 7, 25))),
    );
    const jeudi = contestReminderDedupKey(
      "p1",
      lundiDeLaSemaine(new Date(Date.UTC(2026, 7, 27))),
    );
    const semaineSuivante = contestReminderDedupKey(
      "p1",
      lundiDeLaSemaine(new Date(Date.UTC(2026, 8, 1))),
    );

    // Deux passages du cron la même semaine visent la MÊME réservation :
    // c'est elle qui interdit le doublon.
    expect(mardi).toBe(jeudi);
    expect(semaineSuivante).not.toBe(jeudi);
  });

  it("la clé porte le joueur : deux joueurs ne se bloquent pas", () => {
    const semaine = lundiDeLaSemaine(new Date(Date.UTC(2026, 7, 27)));
    expect(contestReminderDedupKey("p1", semaine)).not.toBe(
      contestReminderDedupKey("p2", semaine),
    );
  });
});
