// @vitest-environment node
import { describe, expect, it } from "vitest";

import {
  cleJour,
  decaler,
  decalerCle,
  densite,
  fenetre,
  grouperParJour,
  grouperParMois,
  heureLocale,
  joursDansLeMois,
  joursDeLaFenetre,
  jourSemaineDeCle,
  libelleFenetre,
  libelleMois,
  lundiDeLaSemaine,
  partsDansFuseau,
  premierDuMois,
  remplissage,
  type CreneauAgenda,
} from "@/lib/agenda-vues";

/**
 * RDV-3 — l'agenda du commerçant, cœur PUR.
 *
 * Deux propriétés portent ce fichier, et aucune n'est cosmétique :
 *
 *  1. LE FUSEAU DU COMMERCE DÉCIDE SEUL. Un créneau est un instant absolu ;
 *     « mardi 9 h » est un rendu. Un agenda qui lirait le fuseau du navigateur
 *     montrerait au commerçant en déplacement des heures qui ne sont pas les
 *     siennes — et le passage à l'heure d'été décalerait une journée entière.
 *
 *  2. AUCUNE JOURNÉE NE SE PERD. Les fenêtres sont à bornes incluses, et les
 *     journées vides sont rendues : un agenda qui masque ses trous ne dit plus
 *     où il reste de la place.
 */

const PARIS = "Europe/Paris";

function creneau(partiel: Partial<CreneauAgenda> & { startsAt: string }): CreneauAgenda {
  return {
    id: partiel.startsAt,
    endsAt: partiel.startsAt,
    capacity: 1,
    occupees: 0,
    status: "open",
    ...partiel,
  };
}

// ════════════════════════════════════════════════════════════
// Le fuseau
// ════════════════════════════════════════════════════════════

describe("partsDansFuseau", () => {
  it("rend les composantes LOCALES du commerce, pas celles d'UTC", () => {
    // 07:00 UTC en juillet = 09:00 à Paris (UTC+2).
    const parts = partsDansFuseau("2026-07-15T07:00:00.000Z", PARIS);
    expect(parts).toEqual({
      annee: 2026,
      mois: 7,
      jour: 15,
      heure: 9,
      minute: 0,
    });
  });

  it("suit le changement d'heure, sans décalage fixe", () => {
    // Même heure UTC, six mois d'écart : Paris est à +2 en été, +1 en hiver.
    // C'est exactement ce qu'un décalage codé en dur se serait trompé à faire.
    expect(partsDansFuseau("2026-07-15T07:00:00.000Z", PARIS)?.heure).toBe(9);
    expect(partsDansFuseau("2026-01-15T07:00:00.000Z", PARIS)?.heure).toBe(8);
  });

  it("change de JOURNÉE quand le fuseau l'impose", () => {
    // 23:30 UTC le 14 = 01:30 le 15 à Paris. Ranger ce créneau au 14 le
    // ferait disparaître de la journée où le commerçant l'attend.
    const parts = partsDansFuseau("2026-07-14T23:30:00.000Z", PARIS);
    expect(parts?.jour).toBe(15);
    expect(cleJour(parts!)).toBe("2026-07-15");
  });

  it("ramène minuit à 0 heure, jamais 24", () => {
    const parts = partsDansFuseau("2026-07-14T22:00:00.000Z", PARIS);
    expect(parts?.heure).toBe(0);
    expect(heureLocale(parts!)).toBe("00:00");
  });

  it("rend null sur une date illisible ou un fuseau inconnu", () => {
    expect(partsDansFuseau("pas une date", PARIS)).toBeNull();
    expect(partsDansFuseau("2026-07-15T07:00:00.000Z", "Mars/Olympus")).toBeNull();
  });

  it("sert un autre fuseau que celui du test", () => {
    expect(partsDansFuseau("2026-07-15T07:00:00.000Z", "Pacific/Noumea")?.heure).toBe(18);
  });
});

// ════════════════════════════════════════════════════════════
// Le calendrier
// ════════════════════════════════════════════════════════════

describe("jourSemaineDeCle", () => {
  it("compte 0 pour LUNDI", () => {
    // 2026-08-31 est un lundi.
    expect(jourSemaineDeCle("2026-08-31")).toBe(0);
    expect(jourSemaineDeCle("2026-09-06")).toBe(6);
  });

  it("ne se décale pas d'un jour selon le fuseau du test", () => {
    // La construction passe par midi UTC exprès : minuit se serait décalé.
    for (const cle of ["2026-01-01", "2026-06-15", "2026-12-31"]) {
      expect(jourSemaineDeCle(cle)).toBeGreaterThanOrEqual(0);
      expect(jourSemaineDeCle(cle)).toBeLessThanOrEqual(6);
    }
  });
});

describe("decalerCle", () => {
  it("traverse les fins de mois et d'année", () => {
    expect(decalerCle("2026-08-31", 1)).toBe("2026-09-01");
    expect(decalerCle("2026-12-31", 1)).toBe("2027-01-01");
    expect(decalerCle("2026-01-01", -1)).toBe("2025-12-31");
  });

  it("traverse le 29 février d'une année bissextile", () => {
    expect(decalerCle("2028-02-28", 1)).toBe("2028-02-29");
    expect(decalerCle("2028-02-29", 1)).toBe("2028-03-01");
    // 2026 n'est pas bissextile.
    expect(decalerCle("2026-02-28", 1)).toBe("2026-03-01");
  });

  it("est réversible", () => {
    for (const cle of ["2026-03-29", "2026-10-25", "2026-12-31"]) {
      expect(decalerCle(decalerCle(cle, 7), -7)).toBe(cle);
    }
  });
});

describe("lundiDeLaSemaine", () => {
  it("recule jusqu'au lundi, et ne bouge pas un lundi", () => {
    expect(lundiDeLaSemaine("2026-09-06")).toBe("2026-08-31");
    expect(lundiDeLaSemaine("2026-08-31")).toBe("2026-08-31");
  });
});

describe("joursDansLeMois", () => {
  it("connaît les mois courts et les années bissextiles", () => {
    expect(joursDansLeMois("2026-02-10")).toBe(28);
    expect(joursDansLeMois("2028-02-10")).toBe(29);
    expect(joursDansLeMois("2026-04-10")).toBe(30);
    expect(joursDansLeMois("2026-12-10")).toBe(31);
  });
});

describe("premierDuMois", () => {
  it("garde le mois et l'année", () => {
    expect(premierDuMois("2026-09-17")).toBe("2026-09-01");
  });
});

// ════════════════════════════════════════════════════════════
// Les fenêtres
// ════════════════════════════════════════════════════════════

describe("fenetre", () => {
  it("jour : une seule journée, bornes incluses", () => {
    expect(fenetre("jour", "2026-09-08")).toEqual({
      debut: "2026-09-08",
      fin: "2026-09-08",
    });
  });

  it("semaine : du lundi au dimanche", () => {
    expect(fenetre("semaine", "2026-09-08")).toEqual({
      debut: "2026-09-07",
      fin: "2026-09-13",
    });
  });

  it("mois : du 1er au dernier jour, quelle que soit sa longueur", () => {
    expect(fenetre("mois", "2026-02-17")).toEqual({
      debut: "2026-02-01",
      fin: "2026-02-28",
    });
    expect(fenetre("mois", "2028-02-17")).toEqual({
      debut: "2028-02-01",
      fin: "2028-02-29",
    });
  });

  it("année : du 1er janvier au 31 décembre", () => {
    expect(fenetre("annee", "2026-06-30")).toEqual({
      debut: "2026-01-01",
      fin: "2026-12-31",
    });
  });

  it("ne rend jamais une fin avant son début", () => {
    for (const echelle of ["jour", "semaine", "mois", "annee"] as const) {
      const bornes = fenetre(echelle, "2026-09-08");
      expect(bornes.fin >= bornes.debut, echelle).toBe(true);
    }
  });
});

describe("decaler", () => {
  it("avance et recule d'un pas propre à chaque échelle", () => {
    expect(decaler("jour", "2026-09-08", 1)).toBe("2026-09-09");
    expect(decaler("semaine", "2026-09-08", 1)).toBe("2026-09-15");
    expect(decaler("mois", "2026-09-08", 1)).toBe("2026-10-01");
    expect(decaler("annee", "2026-09-08", 1)).toBe("2027-09-08");
  });

  it("ne fabrique pas de 31 avril en passant de mars à avril", () => {
    // Le pas « mois » vise le 1er du mois voisin : l'ancre n'a besoin que de
    // désigner le bon mois, et « 31 mars + 1 mois » n'a pas de sens.
    expect(decaler("mois", "2026-03-31", 1)).toBe("2026-04-01");
    expect(decaler("mois", "2026-01-31", 1)).toBe("2026-02-01");
  });

  it("traverse les années dans les deux sens", () => {
    expect(decaler("mois", "2026-12-15", 1)).toBe("2027-01-01");
    expect(decaler("mois", "2026-01-15", -1)).toBe("2025-12-01");
    expect(decaler("annee", "2026-02-28", -1)).toBe("2025-02-28");
  });
});

// ════════════════════════════════════════════════════════════
// Le regroupement
// ════════════════════════════════════════════════════════════

describe("grouperParJour", () => {
  it("range chaque créneau dans sa journée LOCALE", () => {
    const jours = grouperParJour(
      [
        creneau({ startsAt: "2026-07-14T23:30:00.000Z" }), // → 15 juillet, 01:30
        creneau({ startsAt: "2026-07-15T07:00:00.000Z" }), // → 15 juillet, 09:00
      ],
      PARIS,
    );
    expect([...jours.keys()]).toEqual(["2026-07-15"]);
    expect(jours.get("2026-07-15")?.creneaux).toHaveLength(2);
  });

  it("ordonne les créneaux d'une journée par l'horloge", () => {
    const jours = grouperParJour(
      [
        creneau({ startsAt: "2026-07-15T12:00:00.000Z" }),
        creneau({ startsAt: "2026-07-15T07:00:00.000Z" }),
        creneau({ startsAt: "2026-07-15T09:30:00.000Z" }),
      ],
      PARIS,
    );
    expect(jours.get("2026-07-15")?.creneaux.map((c) => c.heure)).toEqual([
      "09:00",
      "11:30",
      "14:00",
    ]);
  });

  it("ne compte comme CAPACITÉ que les créneaux ouverts", () => {
    // Un brouillon ou un créneau fermé n'offre aucune place : les inclure
    // ferait lire un taux de remplissage faussement bas.
    const jours = grouperParJour(
      [
        creneau({ startsAt: "2026-07-15T07:00:00.000Z", capacity: 4, occupees: 2 }),
        creneau({
          startsAt: "2026-07-15T08:00:00.000Z",
          capacity: 4,
          occupees: 0,
          status: "draft",
        }),
        creneau({
          startsAt: "2026-07-15T09:00:00.000Z",
          capacity: 4,
          occupees: 1,
          status: "closed",
        }),
      ],
      PARIS,
    );
    const jour = jours.get("2026-07-15");
    expect(jour?.capacite).toBe(4);
    // Les places PRISES comptent partout : une réservation sur un créneau
    // fermé occupe toujours quelqu'un.
    expect(jour?.occupees).toBe(3);
  });

  it("écarte un créneau dont l'instant est illisible plutôt que de le ranger au hasard", () => {
    const jours = grouperParJour(
      [creneau({ startsAt: "pas une date" }), creneau({ startsAt: "2026-07-15T07:00:00.000Z" })],
      PARIS,
    );
    expect([...jours.keys()]).toEqual(["2026-07-15"]);
    expect(jours.get("2026-07-15")?.creneaux).toHaveLength(1);
  });

  it("rend une carte vide sans créneau, sans lever", () => {
    expect(grouperParJour([], PARIS).size).toBe(0);
  });
});

describe("joursDeLaFenetre", () => {
  it("rend les journées VIDES — un agenda montre ses trous", () => {
    const jours = grouperParJour(
      [creneau({ startsAt: "2026-09-09T07:00:00.000Z" })],
      PARIS,
    );
    const semaine = joursDeLaFenetre(fenetre("semaine", "2026-09-08"), jours);
    expect(semaine).toHaveLength(7);
    expect(semaine.filter((j) => j.creneaux.length > 0)).toHaveLength(1);
    expect(semaine[0].cle).toBe("2026-09-07");
    expect(semaine[6].cle).toBe("2026-09-13");
  });

  it("rend 28, 29, 30 ou 31 journées selon le mois", () => {
    const vide = new Map();
    expect(joursDeLaFenetre(fenetre("mois", "2026-02-10"), vide)).toHaveLength(28);
    expect(joursDeLaFenetre(fenetre("mois", "2028-02-10"), vide)).toHaveLength(29);
    expect(joursDeLaFenetre(fenetre("mois", "2026-04-10"), vide)).toHaveLength(30);
    expect(joursDeLaFenetre(fenetre("mois", "2026-07-10"), vide)).toHaveLength(31);
  });

  it("couvre une année entière, bissextile comprise", () => {
    const vide = new Map();
    expect(joursDeLaFenetre(fenetre("annee", "2026-01-01"), vide)).toHaveLength(365);
    expect(joursDeLaFenetre(fenetre("annee", "2028-01-01"), vide)).toHaveLength(366);
  });

  it("porte le bon jour de semaine sur chaque journée rendue", () => {
    const semaine = joursDeLaFenetre(fenetre("semaine", "2026-09-08"), new Map());
    expect(semaine.map((j) => j.jourSemaine)).toEqual([0, 1, 2, 3, 4, 5, 6]);
  });
});

describe("grouperParMois", () => {
  it("réduit une année à douze lignes", () => {
    const jours = joursDeLaFenetre(fenetre("annee", "2026-01-01"), new Map());
    expect(grouperParMois(jours)).toHaveLength(12);
  });

  it("additionne créneaux, capacité et places prises", () => {
    const creneaux = grouperParJour(
      [
        creneau({ startsAt: "2026-07-15T07:00:00.000Z", capacity: 4, occupees: 2 }),
        creneau({ startsAt: "2026-07-16T07:00:00.000Z", capacity: 4, occupees: 1 }),
        creneau({ startsAt: "2026-08-03T07:00:00.000Z", capacity: 2, occupees: 2 }),
      ],
      PARIS,
    );
    const mois = grouperParMois(creneaux.values());
    expect(mois.map((m) => m.cle)).toEqual(["2026-07", "2026-08"]);
    expect(mois[0]).toMatchObject({
      creneaux: 2,
      capacite: 8,
      occupees: 3,
      joursOuverts: 2,
    });
    expect(mois[1]).toMatchObject({ creneaux: 1, capacite: 2, occupees: 2 });
  });

  it("ne compte comme jour ouvert qu'une journée portant un créneau", () => {
    const jours = joursDeLaFenetre(fenetre("mois", "2026-07-01"), new Map());
    expect(grouperParMois(jours)[0].joursOuverts).toBe(0);
  });
});

// ════════════════════════════════════════════════════════════
// Libellés et remplissage
// ════════════════════════════════════════════════════════════

describe("libelleFenetre", () => {
  it("nomme la période dans les mots du commerçant", () => {
    expect(libelleFenetre("jour", "2026-09-08")).toBe("8 septembre 2026");
    expect(libelleFenetre("mois", "2026-09-08")).toBe("septembre 2026");
    expect(libelleFenetre("annee", "2026-09-08")).toBe("2026");
  });

  it("abrège une semaine dans le même mois, et détaille à cheval", () => {
    expect(libelleFenetre("semaine", "2026-09-08")).toBe("7 – 13 septembre 2026");
    expect(libelleFenetre("semaine", "2026-09-30")).toBe(
      "28 septembre – 4 octobre 2026",
    );
  });

  it("nomme les douze mois", () => {
    expect(libelleMois(1)).toBe("janvier");
    expect(libelleMois(12)).toBe("décembre");
  });
});

describe("remplissage", () => {
  it("rend un pourcentage entier", () => {
    expect(remplissage(4, 1)).toBe(25);
    expect(remplissage(3, 2)).toBe(67);
    expect(remplissage(4, 4)).toBe(100);
  });

  it("plafonne à 100 même en cas de surnombre", () => {
    expect(remplissage(2, 5)).toBe(100);
  });

  it("rend null — et NON zéro — quand rien n'est ouvert", () => {
    // « 0 % rempli » se lit comme un échec commercial ; la journée est
    // simplement fermée.
    expect(remplissage(0, 0)).toBeNull();
  });
});

describe("densite", () => {
  it("classe une journée en quatre paliers lisibles", () => {
    expect(densite(0, 0)).toBe("vide");
    expect(densite(10, 2)).toBe("calme");
    expect(densite(10, 5)).toBe("actif");
    expect(densite(10, 10)).toBe("complet");
    expect(densite(10, 12)).toBe("complet");
  });
});
