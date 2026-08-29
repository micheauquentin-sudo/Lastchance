// @vitest-environment node
import { describe, expect, it } from "vitest";

import {
  CAPACITE_CRENEAU_MIN,
  MINUTES_JOUR,
  apercuSemaine,
  creneauxDansPlage,
  departsDansPlage,
  dureeLisibleMinutes,
  etatGeneration,
  heureVersMinutes,
  libelleJour,
  libellePlage,
  mapGenerationSlots,
  minutesVersHeure,
  phraseGeneration,
  plagesSeChevauchent,
  refusPlage,
  type JourSemaine,
  type PlageHoraire,
} from "@/lib/reserver-horaires";

/**
 * RDV-1 — le cœur PUR des horaires récurrents.
 *
 * La propriété qui porte ce fichier : `creneauxDansPlage` doit rendre
 * EXACTEMENT ce que `generate_series(debut, fin - duree, duree)` engendre en
 * base. Un écart d'un créneau entre l'aperçu et la génération, et le
 * commerçant valide une grille qu'il n'aura pas.
 */

function plage(weekday: number, debut: number, fin: number): PlageHoraire {
  return { weekday: weekday as JourSemaine, debut, fin };
}

// ════════════════════════════════════════════════════════════
// Heures ↔ minutes
// ════════════════════════════════════════════════════════════

describe("minutesVersHeure", () => {
  it("écrit une heure lisible, toujours sur quatre chiffres", () => {
    expect(minutesVersHeure(0)).toBe("00:00");
    expect(minutesVersHeure(540)).toBe("09:00");
    expect(minutesVersHeure(755)).toBe("12:35");
    expect(minutesVersHeure(1439)).toBe("23:59");
  });

  it("rend 24:00 pour la borne de fin de journée", () => {
    // 1440 est admis EN FIN de plage : c'est la seule façon d'écrire
    // « jusqu'à minuit ». L'afficher « 00:00 » aurait laissé croire au début
    // de la journée.
    expect(minutesVersHeure(MINUTES_JOUR)).toBe("24:00");
  });

  it("borne au lieu de rendre une heure absurde", () => {
    expect(minutesVersHeure(-30)).toBe("00:00");
    expect(minutesVersHeure(5000)).toBe("24:00");
  });
});

describe("heureVersMinutes", () => {
  it("relit ce que minutesVersHeure a écrit", () => {
    for (const minutes of [0, 1, 540, 755, 1439, 1440]) {
      expect(heureVersMinutes(minutesVersHeure(minutes))).toBe(minutes);
    }
  });

  it("accepte une heure à un chiffre et les espaces autour", () => {
    expect(heureVersMinutes("9:30")).toBe(570);
    expect(heureVersMinutes("  09:30  ")).toBe(570);
  });

  it("refuse ce qui n'est pas une heure, sans inventer de repli", () => {
    for (const brut of ["", "9h30", "abc", "25:00", "09:60", "09", ":30", "-1:00"]) {
      expect(heureVersMinutes(brut), brut).toBeNull();
    }
  });
});

// ════════════════════════════════════════════════════════════
// Le découpage — miroir du générate_series SQL
// ════════════════════════════════════════════════════════════

describe("creneauxDansPlage", () => {
  it("ne compte que les créneaux qui TIENNENT dans la plage", () => {
    // 9 h → 11 h en 30 min : 9h00, 9h30, 10h00, 10h30. Celui de 11h00
    // déborderait — c'est exactement la borne `fin - duree` du générateur.
    expect(creneauxDansPlage(plage(0, 540, 660), 30)).toBe(4);
  });

  it("rend un créneau quand la plage vaut exactement la durée", () => {
    expect(creneauxDansPlage(plage(0, 540, 570), 30)).toBe(1);
  });

  it("rend zéro quand la plage est plus courte que la durée", () => {
    expect(creneauxDansPlage(plage(0, 540, 560), 30)).toBe(0);
  });

  it("ignore le reliquat plutôt que de proposer un créneau tronqué", () => {
    // 9 h → 10 h 50 en 30 min : 3 créneaux, et 20 minutes perdues. Proposer un
    // quatrième créneau de 20 minutes ferait promettre une prestation courte.
    expect(creneauxDansPlage(plage(0, 540, 650), 30)).toBe(3);
  });

  it("rend zéro sur une durée nulle ou négative, sans boucler", () => {
    expect(creneauxDansPlage(plage(0, 540, 660), 0)).toBe(0);
    expect(creneauxDansPlage(plage(0, 540, 660), -30)).toBe(0);
  });
});

describe("departsDansPlage", () => {
  it("aligne les départs sur la durée, depuis le début de la plage", () => {
    expect(departsDansPlage(plage(0, 540, 660), 30)).toEqual([540, 570, 600, 630]);
  });

  it("rend autant de départs que creneauxDansPlage en annonce", () => {
    for (const [debut, fin, duree] of [
      [540, 660, 30],
      [480, 1140, 45],
      [600, 630, 15],
      [540, 560, 30],
    ]) {
      expect(departsDansPlage(plage(0, debut, fin), duree)).toHaveLength(
        creneauxDansPlage(plage(0, debut, fin), duree),
      );
    }
  });

  it("ne propose jamais un départ dont la fin dépasse la plage", () => {
    const p = plage(0, 540, 650);
    for (const depart of departsDansPlage(p, 30)) {
      expect(depart + 30).toBeLessThanOrEqual(p.fin);
    }
  });
});

// ════════════════════════════════════════════════════════════
// Chevauchements
// ════════════════════════════════════════════════════════════

describe("plagesSeChevauchent", () => {
  it("laisse deux plages SE TOUCHER — c'est la coupure de midi", () => {
    // « 9 h → 12 h » puis « 14 h → 18 h » : la journée coupée, cas normal.
    expect(plagesSeChevauchent(plage(0, 540, 720), plage(0, 840, 1080))).toBe(false);
    // Et même bout à bout : 12 h → 14 h collé à 9 h → 12 h.
    expect(plagesSeChevauchent(plage(0, 540, 720), plage(0, 720, 840))).toBe(false);
  });

  it("signale un vrai recouvrement", () => {
    expect(plagesSeChevauchent(plage(0, 540, 720), plage(0, 660, 840))).toBe(true);
    // Inclusion complète.
    expect(plagesSeChevauchent(plage(0, 540, 720), plage(0, 600, 660))).toBe(true);
  });

  it("n'oppose jamais deux jours différents", () => {
    expect(plagesSeChevauchent(plage(0, 540, 720), plage(1, 540, 720))).toBe(false);
  });

  it("est symétrique", () => {
    const a = plage(2, 540, 720);
    const b = plage(2, 660, 840);
    expect(plagesSeChevauchent(a, b)).toBe(plagesSeChevauchent(b, a));
  });
});

describe("refusPlage", () => {
  it("accepte une plage saine", () => {
    expect(refusPlage(plage(0, 540, 660), [])).toBeNull();
  });

  it("refuse une fin avant ou égale au début", () => {
    expect(refusPlage(plage(0, 660, 540), [])).toMatch(/après le début/);
    expect(refusPlage(plage(0, 540, 540), [])).toMatch(/après le début/);
  });

  it("refuse un chevauchement, en NOMMANT le jour", () => {
    const refus = refusPlage(plage(2, 600, 700), [plage(2, 540, 660)]);
    expect(refus).toMatch(/mercredi/);
  });

  it("accepte une plage qui en touche une autre", () => {
    expect(refusPlage(plage(0, 720, 840), [plage(0, 540, 720)])).toBeNull();
  });

  it("refuse des bornes hors de la journée", () => {
    expect(refusPlage(plage(0, MINUTES_JOUR, MINUTES_JOUR), [])).not.toBeNull();
    expect(refusPlage(plage(0, 540, MINUTES_JOUR + 1), [])).not.toBeNull();
  });
});

// ════════════════════════════════════════════════════════════
// L'aperçu de la semaine
// ════════════════════════════════════════════════════════════

describe("apercuSemaine", () => {
  it("rend les sept jours, même sans aucun horaire", () => {
    const apercu = apercuSemaine([], 30);
    expect(apercu.jours).toHaveLength(7);
    expect(apercu.vide).toBe(true);
    expect(apercu.creneauxParSemaine).toBe(0);
  });

  it("commence le LUNDI", () => {
    expect(apercuSemaine([], 30).jours[0].libelle).toBe("Lundi");
    expect(apercuSemaine([], 30).jours[6].libelle).toBe("Dimanche");
  });

  it("additionne les créneaux de toutes les plages d'un jour", () => {
    // Lundi coupé : 9 h → 12 h et 14 h → 18 h, en 30 min = 6 + 8 = 14.
    const apercu = apercuSemaine(
      [plage(0, 540, 720), plage(0, 840, 1080)],
      30,
    );
    expect(apercu.jours[0].creneaux).toBe(14);
    expect(apercu.creneauxParSemaine).toBe(14);
  });

  it("ordonne les plages d'un jour par heure de début", () => {
    const apercu = apercuSemaine(
      [plage(0, 840, 1080), plage(0, 540, 720)],
      30,
    );
    expect(apercu.jours[0].plages.map((p) => p.debut)).toEqual([540, 840]);
  });

  it("compte les minutes d'ouverture, distinctes des créneaux", () => {
    // 9 h → 10 h 50 : 110 minutes ouvertes, mais seulement 3 créneaux de 30.
    const apercu = apercuSemaine([plage(0, 540, 650)], 30);
    expect(apercu.jours[0].minutesOuvertes).toBe(110);
    expect(apercu.jours[0].creneaux).toBe(3);
  });

  it("répartit sur les bons jours", () => {
    const apercu = apercuSemaine(
      [plage(0, 540, 660), plage(5, 540, 660)],
      30,
    );
    expect(apercu.jours[0].creneaux).toBe(4);
    expect(apercu.jours[5].creneaux).toBe(4);
    expect(apercu.jours[1].creneaux).toBe(0);
    expect(apercu.creneauxParSemaine).toBe(8);
  });
});

describe("dureeLisibleMinutes", () => {
  it("parle en heures dès qu'il y en a", () => {
    expect(dureeLisibleMinutes(30)).toBe("30 min");
    expect(dureeLisibleMinutes(60)).toBe("1 h");
    expect(dureeLisibleMinutes(210)).toBe("3 h 30");
    expect(dureeLisibleMinutes(0)).toBe("0 min");
  });
});

describe("libelleJour / libellePlage", () => {
  it("nomme les sept jours et laisse voir un index inconnu", () => {
    expect(libelleJour(0)).toBe("Lundi");
    expect(libelleJour(6)).toBe("Dimanche");
    expect(libelleJour(9)).toBe("Jour 9");
  });

  it("écrit une plage lisible", () => {
    expect(libellePlage(plage(0, 540, 720))).toBe("09:00 → 12:00");
  });
});

// ════════════════════════════════════════════════════════════
// Ce qui autorise la génération
// ════════════════════════════════════════════════════════════

describe("etatGeneration", () => {
  const complet = {
    bookingMode: "rendez_vous",
    dureeMinutes: 30,
    capacite: CAPACITE_CRENEAU_MIN,
    plages: [plage(0, 540, 660)],
  };

  it("autorise une activité complète", () => {
    expect(etatGeneration(complet)).toEqual({ possible: true, raison: null });
  });

  it("refuse un Moment, et explique comment le changer", () => {
    const etat = etatGeneration({ ...complet, bookingMode: "moment" });
    expect(etat.possible).toBe(false);
    expect(etat.raison).toMatch(/Moment/);
  });

  it("refuse sans durée, sans capacité, sans plage", () => {
    expect(etatGeneration({ ...complet, dureeMinutes: null }).raison).toMatch(/durée/);
    expect(etatGeneration({ ...complet, capacite: null }).raison).toMatch(/personnes/);
    expect(etatGeneration({ ...complet, plages: [] }).raison).toMatch(/plage/);
  });

  it("refuse quand AUCUNE plage n'est assez longue — le cas silencieux", () => {
    // Sans ce refus, le générateur rendrait `ok` avec zéro créneau créé, et le
    // commerçant chercherait longtemps pourquoi son agenda reste vide.
    const etat = etatGeneration({
      ...complet,
      dureeMinutes: 60,
      plages: [plage(0, 540, 570), plage(1, 600, 620)],
    });
    expect(etat.possible).toBe(false);
    expect(etat.raison).toMatch(/assez longue/);
  });

  it("autorise dès qu'UNE seule plage suffit", () => {
    expect(
      etatGeneration({
        ...complet,
        dureeMinutes: 60,
        plages: [plage(0, 540, 570), plage(1, 540, 660)],
      }).possible,
    ).toBe(true);
  });
});

// ════════════════════════════════════════════════════════════
// La réponse du serveur
// ════════════════════════════════════════════════════════════

describe("mapGenerationSlots", () => {
  it("lit un succès complet", () => {
    expect(
      mapGenerationSlots({
        state: "ok",
        created: 12,
        removed: 3,
        horizon_until: "2026-09-28",
      }),
    ).toEqual({
      state: "ok",
      crees: 12,
      retires: 3,
      horizonJusquau: "2026-09-28",
    });
  });

  it("lit les trois refus nommés", () => {
    for (const state of ["not_authorized", "not_rendez_vous", "incomplete"]) {
      expect(mapGenerationSlots({ state }).state).toBe(state);
    }
  });

  it("retombe sur `unavailable` pour tout document illisible", () => {
    for (const brut of [null, undefined, 42, "ok", [], {}, { state: "bidon" }]) {
      expect(mapGenerationSlots(brut).state).toBe("unavailable");
    }
  });

  it("ne prend pas un compteur non numérique pour un nombre", () => {
    const etat = mapGenerationSlots({ state: "ok", created: "12", removed: null });
    expect(etat).toEqual({
      state: "ok",
      crees: 0,
      retires: 0,
      horizonJusquau: null,
    });
  });
});

describe("phraseGeneration", () => {
  it("dit clairement qu'il n'y avait rien à faire", () => {
    expect(
      phraseGeneration({ state: "ok", crees: 0, retires: 0, horizonJusquau: null }),
    ).toMatch(/déjà à jour/);
  });

  it("compte les ouvertures et les retraits, et rassure sur les retraits", () => {
    const phrase = phraseGeneration({
      state: "ok",
      crees: 12,
      retires: 3,
      horizonJusquau: null,
    });
    expect(phrase).toMatch(/12 créneaux ouverts/);
    expect(phrase).toMatch(/aucun n'était réservé/);
  });

  it("accorde le singulier", () => {
    const phrase = phraseGeneration({
      state: "ok",
      crees: 1,
      retires: 0,
      horizonJusquau: null,
    });
    expect(phrase).toMatch(/1 créneau ouvert\./);
  });

  it("rend une phrase pour chaque refus, jamais un code d'état", () => {
    for (const state of [
      "unavailable",
      "not_authorized",
      "not_rendez_vous",
      "incomplete",
    ] as const) {
      const phrase = phraseGeneration({ state });
      expect(phrase.length, state).toBeGreaterThan(10);
      expect(phrase, state).not.toMatch(/_/);
    }
  });
});
