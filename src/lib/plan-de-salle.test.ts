// @vitest-environment node
import { describe, expect, it } from "vitest";

import {
  dureeService,
  effectifPlacable,
  etapesSalle,
  libelleSalle,
  mapReserveTable,
  minutesDepuisHeure,
  occupationsSeChevauchent,
  occupeLaTable,
  PHRASES_RESERVATION,
  tablesOccupeesA,
  vueService,
  type ReservationSalle,
  type TableSalle,
} from "./plan-de-salle";

function table(nom: string, couverts: number, active = true): TableSalle {
  return { id: `t-${nom}`, nom, couverts, active };
}

function reservation(
  partiel: Partial<ReservationSalle> & { startsAt: string },
): ReservationSalle {
  return {
    id: `r-${partiel.startsAt}-${partiel.tableId ?? "x"}`,
    tableId: null,
    effectif: 2,
    code: "ABC123",
    statut: "confirmed",
    prenom: null,
    ...partiel,
  };
}

/** Heure locale simulée : on lit « …T19:30 » sans passer par un fuseau. */
const minutesDe = (iso: string): number | null => {
  const m = /T(\d{2}):(\d{2})/.exec(iso);
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
};

describe("occupeLaTable", () => {
  it("compte les confirmées ET les arrivées — le pointage ne libère rien", () => {
    expect(occupeLaTable("confirmed")).toBe(true);
    expect(occupeLaTable("checked_in")).toBe(true);
  });

  it("ne compte pas une annulation", () => {
    expect(occupeLaTable("cancelled")).toBe(false);
  });
});

describe("minutesDepuisHeure", () => {
  it("lit une heure du matin et une du soir", () => {
    expect(minutesDepuisHeure("09:30")).toBe(570);
    expect(minutesDepuisHeure("19:00")).toBe(1140);
  });

  it("accepte une heure sur un seul chiffre et les espaces", () => {
    expect(minutesDepuisHeure(" 9:05 ")).toBe(545);
  });

  it("accepte minuit et la borne haute de 24:00", () => {
    expect(minutesDepuisHeure("00:00")).toBe(0);
    expect(minutesDepuisHeure("24:00")).toBe(1440);
  });

  it("refuse ce qui n'est pas une heure", () => {
    expect(minutesDepuisHeure("19h")).toBeNull();
    expect(minutesDepuisHeure("19:60")).toBeNull();
    expect(minutesDepuisHeure("25:00")).toBeNull();
    expect(minutesDepuisHeure("")).toBeNull();
  });
});

describe("occupationsSeChevauchent", () => {
  const DUREE = 90;

  it("deux services au même moment se chevauchent", () => {
    expect(occupationsSeChevauchent(1140, 1140, DUREE)).toBe(true);
  });

  it("un service à 20 h et un à 21 h se chevauchent sur 1 h 30 de table", () => {
    expect(occupationsSeChevauchent(1200, 1260, DUREE)).toBe(true);
  });

  // C'EST LE POINT DU MODULE : la table se retourne à la minute exacte.
  it("ne se chevauchent PAS quand l'un finit là où l'autre commence", () => {
    expect(occupationsSeChevauchent(1200, 1290, DUREE)).toBe(false);
  });

  it("est symétrique", () => {
    expect(occupationsSeChevauchent(1290, 1200, DUREE)).toBe(false);
    expect(occupationsSeChevauchent(1260, 1200, DUREE)).toBe(true);
  });

  it("suit la durée : à 30 minutes de service, 20 h et 21 h sont libres", () => {
    expect(occupationsSeChevauchent(1200, 1260, 30)).toBe(false);
  });
});

describe("vueService", () => {
  const tables = [table("T1", 2), table("T2", 4), table("T3", 6)];

  it("range chaque réservation sur sa table, dans l'ordre de l'horloge", () => {
    const vue = vueService(
      tables,
      [
        reservation({ tableId: "t-T2", startsAt: "2026-09-04T21:30", effectif: 4 }),
        reservation({ tableId: "t-T2", startsAt: "2026-09-04T19:00", effectif: 3 }),
      ],
      minutesDe,
    );
    const t2 = vue.tables.find((l) => l.table.nom === "T2");
    expect(t2?.reservations.map((r) => r.startsAt)).toEqual([
      "2026-09-04T19:00",
      "2026-09-04T21:30",
    ]);
    expect(t2?.couvertsServis).toBe(7);
  });

  it("montre TOUTES les tables, même celles qui ne servent personne", () => {
    const vue = vueService(tables, [], minutesDe);
    expect(vue.tables).toHaveLength(3);
    expect(vue.reservationsVivantes).toBe(0);
  });

  it("laisse tomber les annulations", () => {
    const vue = vueService(
      tables,
      [
        reservation({
          tableId: "t-T1",
          startsAt: "2026-09-04T19:00",
          statut: "cancelled",
        }),
      ],
      minutesDe,
    );
    expect(vue.reservationsVivantes).toBe(0);
    expect(vue.couvertsServis).toBe(0);
    expect(vue.orphelines).toHaveLength(0);
  });

  // Une réservation qui disparaît de l'écran, c'est un client qu'on n'attend pas.
  it("expose sans table à part plutôt que de la perdre", () => {
    const vue = vueService(
      tables,
      [reservation({ tableId: null, startsAt: "2026-09-04T19:00" })],
      minutesDe,
    );
    expect(vue.orphelines).toHaveLength(1);
    expect(vue.reservationsVivantes).toBe(1);
    expect(vue.couvertsServis).toBe(2);
  });

  it("expose à part une réservation sur une table inconnue", () => {
    const vue = vueService(
      tables,
      [reservation({ tableId: "t-DISPARUE", startsAt: "2026-09-04T19:00" })],
      minutesDe,
    );
    expect(vue.orphelines).toHaveLength(1);
  });

  it("expose à part une réservation dont l'heure est illisible", () => {
    const vue = vueService(
      tables,
      [reservation({ tableId: "t-T1", startsAt: "pas-une-date" })],
      minutesDe,
    );
    expect(vue.orphelines).toHaveLength(1);
    expect(vue.tables.find((l) => l.table.nom === "T1")?.reservations).toHaveLength(0);
  });

  it("compte les couverts offerts sur les tables ACTIVES seulement", () => {
    const vue = vueService([...tables, table("T4", 8, false)], [], minutesDe);
    expect(vue.couvertsOfferts).toBe(12);
  });

  it("trie les tables par nom, pour que l'écran ne bouge pas d'un service à l'autre", () => {
    const vue = vueService(
      [table("T3", 6), table("T1", 2), table("T2", 4)],
      [],
      minutesDe,
    );
    expect(vue.tables.map((l) => l.table.nom)).toEqual(["T1", "T2", "T3"]);
  });
});

describe("effectifPlacable", () => {
  const tables = [table("T1", 2), table("T2", 2), table("T3", 6)];

  it("rend la plus grande table libre", () => {
    expect(effectifPlacable(tables, new Set())).toBe(6);
  });

  // LE POINT : douze couverts libres sur six tables de deux ne prennent pas
  // un groupe de quatre. On annonce ce qui est PLAÇABLE, pas ce qui est libre.
  it("ne somme JAMAIS les places restantes", () => {
    expect(effectifPlacable([table("A", 2), table("B", 2)], new Set())).toBe(2);
  });

  it("descend quand la grande table est prise", () => {
    expect(effectifPlacable(tables, new Set(["t-T3"]))).toBe(2);
  });

  it("rend 0 quand tout est pris", () => {
    expect(effectifPlacable(tables, new Set(["t-T1", "t-T2", "t-T3"]))).toBe(0);
  });

  it("ignore les tables désactivées", () => {
    expect(effectifPlacable([table("T1", 2), table("T9", 20, false)], new Set())).toBe(2);
  });
});

describe("tablesOccupeesA", () => {
  const avec = (startsAt: string, tableId: string, statut: ReservationSalle["statut"] = "confirmed") => ({
    ...reservation({ startsAt, tableId, statut }),
    debutMinutes: minutesDe(startsAt)!,
  });

  it("retient la table d'un service qui déborde sur l'heure demandée", () => {
    const occupees = tablesOccupeesA([avec("2026-09-04T20:00", "t-T1")], 1260, 90);
    expect([...occupees]).toEqual(["t-T1"]);
  });

  it("libère la table une fois le service fini", () => {
    const occupees = tablesOccupeesA([avec("2026-09-04T20:00", "t-T1")], 1290, 90);
    expect(occupees.size).toBe(0);
  });

  it("ignore les annulations", () => {
    const occupees = tablesOccupeesA(
      [avec("2026-09-04T20:00", "t-T1", "cancelled")],
      1200,
      90,
    );
    expect(occupees.size).toBe(0);
  });

  it("compose avec effectifPlacable pour dire ce qui reste à 21 h", () => {
    const tables = [table("T1", 2), table("T2", 6)];
    const occupees = tablesOccupeesA([avec("2026-09-04T20:00", "t-T2")], 1260, 90);
    expect(effectifPlacable(tables, occupees)).toBe(2);
  });
});

describe("etapesSalle", () => {
  const complet = {
    nombreDePlages: 2,
    tables: [table("T1", 2)],
    dureeServiceMinutes: 90,
    pasMinutes: 30,
    creneauxOuverts: 40,
  };

  it("les quatre étapes sont faites quand tout est posé", () => {
    expect(etapesSalle(complet).every((e) => e.faite)).toBe(true);
    expect(etapesSalle(complet).every((e) => e.manque === null)).toBe(true);
  });

  it("part d'une salle vierge : rien n'est fait", () => {
    const etapes = etapesSalle({
      nombreDePlages: 0,
      tables: [],
      dureeServiceMinutes: null,
      pasMinutes: null,
      creneauxOuverts: 0,
    });
    expect(etapes.map((e) => e.faite)).toEqual([false, false, false, false]);
    expect(etapes.every((e) => e.manque !== null)).toBe(true);
  });

  it("garde toujours le même ordre — horaires, salle, service, ouverture", () => {
    expect(etapesSalle(complet).map((e) => e.cle)).toEqual([
      "horaires",
      "tables",
      "service",
      "ouverture",
    ]);
  });

  it("une table désactivée ne suffit pas à valider la salle", () => {
    const etapes = etapesSalle({ ...complet, tables: [table("T1", 2, false)] });
    expect(etapes.find((e) => e.cle === "tables")?.faite).toBe(false);
  });

  // Le passage qui compte : tout est réglé mais rien n'est ouvert. La phrase
  // doit dire quoi faire, pas « il manque quelque chose ».
  it("invite à générer quand tout est prêt mais qu'aucun créneau n'existe", () => {
    const etapes = etapesSalle({ ...complet, creneauxOuverts: 0 });
    const ouverture = etapes.find((e) => e.cle === "ouverture");
    expect(ouverture?.faite).toBe(false);
    expect(ouverture?.manque).toContain("générez");
  });

  it("renvoie aux étapes précédentes tant qu'elles ne sont pas finies", () => {
    const etapes = etapesSalle({ ...complet, nombreDePlages: 0, creneauxOuverts: 0 });
    expect(etapes.find((e) => e.cle === "ouverture")?.manque).toContain("précédentes");
  });

  it("refuse une durée de service nulle ou un pas nul", () => {
    expect(
      etapesSalle({ ...complet, dureeServiceMinutes: 0 }).find((e) => e.cle === "service")
        ?.faite,
    ).toBe(false);
    expect(
      etapesSalle({ ...complet, pasMinutes: null }).find((e) => e.cle === "service")?.faite,
    ).toBe(false);
  });
});

describe("libelleSalle", () => {
  it("dit les couverts et les tables", () => {
    expect(libelleSalle([table("T1", 4), table("T2", 4)])).toBe(
      "8 couverts sur 2 tables",
    );
  });

  it("accorde le singulier", () => {
    expect(libelleSalle([table("T1", 1)])).toBe("1 couvert sur 1 table");
  });

  it("ne compte pas les tables désactivées", () => {
    expect(libelleSalle([table("T1", 4), table("T2", 4, false)])).toBe(
      "4 couverts sur 1 table",
    );
  });

  it("le dit franchement quand la salle est vide", () => {
    expect(libelleSalle([])).toBe("Aucune table");
    expect(libelleSalle([table("T1", 4, false)])).toBe("Aucune table");
  });
});

describe("dureeService", () => {
  it("écrit une heure et demie comme un humain", () => {
    expect(dureeService(90)).toBe("1 h 30");
  });

  it("écrit les heures rondes sans minutes", () => {
    expect(dureeService(120)).toBe("2 h");
  });

  it("écrit les durées courtes en minutes", () => {
    expect(dureeService(45)).toBe("45 min");
  });

  it("garde deux chiffres aux minutes", () => {
    expect(dureeService(65)).toBe("1 h 05");
  });

  it("ne casse pas sur 0 ni sur un négatif", () => {
    expect(dureeService(0)).toBe("0 min");
    expect(dureeService(-10)).toBe("0 min");
  });
});

describe("mapReserveTable", () => {
  it("lit une réservation prise", () => {
    expect(
      mapReserveTable({
        state: "reserved",
        reservation_id: "abc",
        code: "XYZ789",
        party_size: 4,
        table_name: "T2",
      }),
    ).toEqual({
      state: "reserved",
      reservationId: "abc",
      code: "XYZ789",
      effectif: 4,
      table: "T2",
    });
  });

  it("supporte une table sans nom", () => {
    const etat = mapReserveTable({
      state: "reserved",
      reservation_id: "abc",
      code: "XYZ789",
      party_size: 2,
      table_name: null,
    });
    expect(etat).toMatchObject({ state: "reserved", table: null });
  });

  it("lit les trois refus nommés", () => {
    expect(mapReserveTable({ state: "full" })).toEqual({ state: "full" });
    expect(mapReserveTable({ state: "invalid_party_size" })).toEqual({
      state: "invalid_party_size",
    });
    expect(mapReserveTable({ state: "invalid_email" })).toEqual({
      state: "invalid_email",
    });
  });

  it("retombe sur `unavailable` devant n'importe quoi d'autre", () => {
    expect(mapReserveTable(null)).toEqual({ state: "unavailable" });
    expect(mapReserveTable("full")).toEqual({ state: "unavailable" });
    expect(mapReserveTable({ state: "inconnu" })).toEqual({ state: "unavailable" });
    // `reserved` SANS identifiant n'est pas une réservation : la traiter comme
    // telle afficherait un code vide au client.
    expect(mapReserveTable({ state: "reserved" })).toEqual({ state: "unavailable" });
  });
});

describe("PHRASES_RESERVATION", () => {
  it("chaque refus a une phrase", () => {
    for (const etat of ["full", "invalid_party_size", "invalid_email", "unavailable"] as const) {
      expect(PHRASES_RESERVATION[etat].length).toBeGreaterThan(10);
    }
  });

  // « Complet » sèchement ferme la porte. La liste d'attente est la seule
  // issue utile quand aucune table n'est assez grande — la phrase doit y mener.
  it("le complet conduit à la liste d'attente", () => {
    expect(PHRASES_RESERVATION.full.toLowerCase()).toContain("prévenu");
  });
});
