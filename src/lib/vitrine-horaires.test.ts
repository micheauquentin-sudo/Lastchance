import { describe, expect, it } from "vitest";

import { etatHoraires } from "./vitrine-horaires";
import { mapHorairesVitrine, VITRINE_JOURS, type HorairesVitrine } from "./vitrine";

/**
 * LE CALCUL « OUVERT / FERMÉ » (VIT-31), SUR DES INSTANTS ÉCRITS EN CLAIR.
 *
 * Aucun faux timer, aucun `new Date()` : `etatHoraires` prend l'instant en
 * paramètre, et c'est exactement pour que ce fichier puisse exister. Chaque
 * assertion nomme l'heure locale qu'elle vise, parce qu'un `Date` en UTC dans
 * un test sur les fuseaux est illisible autrement.
 */

/** Une semaine fermée partout, sur laquelle on n'ouvre que ce qu'on teste. */
function semaine(
  ouvertures: Partial<HorairesVitrine> = {},
): HorairesVitrine {
  const vide = {} as HorairesVitrine;
  for (const jour of VITRINE_JOURS) vide[jour] = [];
  return { ...vide, ...ouvertures };
}

/** Un instant, écrit en heure locale de Paris. Le décalage est explicite. */
function paris(iso: string): Date {
  return new Date(iso);
}

const PARIS = "Europe/Paris";

describe("etatHoraires — le verdict, sur un instant donné", () => {
  it("sans horaires structurés, le verdict est `inconnu` — JAMAIS `ferme`", () => {
    // C'est l'état de toutes les vitrines d'avant VIT-31. Répondre « fermé »
    // aurait affiché « Fermé » sur chacune d'elles au premier déploiement.
    expect(etatHoraires(null, PARIS, paris("2026-09-02T10:00:00Z"))).toEqual({
      etat: "inconnu",
    });
  });

  it("ouvert : rend l'heure de fermeture du créneau en cours", () => {
    // 2026-09-02 est un MERCREDI. 16:00 UTC = 18:00 à Paris (heure d'été).
    const etat = etatHoraires(
      semaine({ mercredi: [{ de: "12:00", a: "23:00" }] }),
      PARIS,
      paris("2026-09-02T16:00:00Z"),
    );
    expect(etat).toEqual({ etat: "ouvert", fermeA: "23:00" });
  });

  it("la borne de gauche est INCLUSE : à l'heure pile d'ouverture, c'est ouvert", () => {
    // 10:00 UTC = 12:00 à Paris.
    expect(
      etatHoraires(
        semaine({ mercredi: [{ de: "12:00", a: "23:00" }] }),
        PARIS,
        paris("2026-09-02T10:00:00Z"),
      ),
    ).toEqual({ etat: "ouvert", fermeA: "23:00" });
  });

  it("la borne de droite est EXCLUE : à l'heure pile de fermeture, c'est fermé", () => {
    // 21:00 UTC = 23:00 à Paris, l'heure exacte de fermeture. Le commerce
    // n'ouvrant que le mercredi, la réouverture annoncée est celle de la
    // semaine SUIVANTE — c'est la boucle qui va jusqu'à l'offset 7 qui la
    // trouve, et sans elle la page dirait « fermé » sans rien annoncer.
    const etat = etatHoraires(
      semaine({ mercredi: [{ de: "12:00", a: "23:00" }] }),
      PARIS,
      paris("2026-09-02T21:00:00Z"),
    );
    expect(etat).toEqual({
      etat: "ferme",
      prochaine: { jour: "mercredi", heure: "12:00", aujourdhui: false },
    });
  });

  it("entre deux services, il rouvre LE JOUR MÊME", () => {
    // 11:00 UTC = 13:00 à Paris, entre 12:30 et 19:00.
    const etat = etatHoraires(
      semaine({
        mercredi: [
          { de: "09:00", a: "12:30" },
          { de: "19:00", a: "23:00" },
        ],
      }),
      PARIS,
      paris("2026-09-02T11:00:00Z"),
    );
    expect(etat).toEqual({
      etat: "ferme",
      prochaine: { jour: "mercredi", heure: "19:00", aujourdhui: true },
    });
  });

  it("après le dernier service, il rouvre le JOUR SUIVANT qui a un créneau", () => {
    // 22:00 UTC mercredi = 00:00 JEUDI à Paris — le passage de date locale est
    // le piège que ce cas ferme : le jour de la semaine se lit dans le fuseau
    // du commerce, jamais en UTC.
    const etat = etatHoraires(
      semaine({
        mercredi: [{ de: "09:00", a: "18:00" }],
        vendredi: [{ de: "10:00", a: "18:00" }],
      }),
      PARIS,
      paris("2026-09-02T22:00:00Z"),
    );
    expect(etat).toEqual({
      etat: "ferme",
      prochaine: { jour: "vendredi", heure: "10:00", aujourdhui: false },
    });
  });

  it("un commerce ouvert un seul jour rouvre LA SEMAINE SUIVANTE", () => {
    // Samedi 2026-09-05, 20:00 UTC = 22:00 à Paris, après la fermeture. La
    // boucle doit aller jusqu'à l'offset 7 pour retomber sur samedi.
    const etat = etatHoraires(
      semaine({ samedi: [{ de: "09:00", a: "13:00" }] }),
      PARIS,
      paris("2026-09-05T20:00:00Z"),
    );
    expect(etat).toEqual({
      etat: "ferme",
      prochaine: { jour: "samedi", heure: "09:00", aujourdhui: false },
    });
  });

  it("une semaine entièrement vide est une AFFIRMATION : fermé, sans réouverture", () => {
    expect(etatHoraires(semaine(), PARIS, paris("2026-09-02T10:00:00Z"))).toEqual({
      etat: "ferme",
      prochaine: null,
    });
  });

  it("deux créneaux qui SE TOUCHENT ne font pas annoncer une fausse fermeture", () => {
    // 09:00–12:00 puis 12:00–19:00 décrivent une journée continue. À 11:00
    // locale, la page doit annoncer « ferme à 19:00 », pas « ferme à 12:00 ».
    const etat = etatHoraires(
      semaine({
        mercredi: [
          { de: "12:00", a: "19:00" },
          { de: "09:00", a: "12:00" },
        ],
      }),
      PARIS,
      paris("2026-09-02T09:00:00Z"),
    );
    expect(etat).toEqual({ etat: "ouvert", fermeA: "19:00" });
  });
});

describe("etatHoraires — le fuseau est celui du COMMERCE", () => {
  it("le même instant donne deux verdicts opposés selon le fuseau", () => {
    // 2026-09-02T21:30:00Z : 23:30 à Paris (fermé), 01:30 le JEUDI à La Réunion
    // (UTC+4, sans heure d'été). C'est le cas qui prouve que sans `timezone`
    // publié, un touriste lirait la vitrine dans SON fuseau.
    const horaires = semaine({
      mercredi: [{ de: "12:00", a: "23:00" }],
      jeudi: [{ de: "01:00", a: "05:00" }],
    });
    const instant = paris("2026-09-02T21:30:00Z");

    expect(etatHoraires(horaires, PARIS, instant)).toEqual({
      etat: "ferme",
      prochaine: { jour: "jeudi", heure: "01:00", aujourdhui: false },
    });
    expect(etatHoraires(horaires, "Indian/Reunion", instant)).toEqual({
      etat: "ouvert",
      fermeA: "05:00",
    });
  });

  it("un fuseau à demi-heure est lu correctement", () => {
    // Asia/Kolkata est à UTC+5:30 : 06:45 UTC = 12:15 locale, dans le créneau.
    expect(
      etatHoraires(
        semaine({ mercredi: [{ de: "12:00", a: "14:00" }] }),
        "Asia/Kolkata",
        paris("2026-09-02T06:45:00Z"),
      ),
    ).toEqual({ etat: "ouvert", fermeA: "14:00" });
  });

  it("un fuseau inconnu ne fait rien affirmer — surtout pas « ouvert »", () => {
    expect(
      etatHoraires(
        semaine({ mercredi: [{ de: "00:00", a: "23:59" }] }),
        "Mars/Olympus_Mons",
        paris("2026-09-02T10:00:00Z"),
      ),
    ).toEqual({ etat: "inconnu" });
  });

  it("une date invalide ne fait rien affirmer non plus", () => {
    expect(
      etatHoraires(
        semaine({ mercredi: [{ de: "00:00", a: "23:59" }] }),
        PARIS,
        new Date("pas une date"),
      ),
    ).toEqual({ etat: "inconnu" });
  });
});

describe("mapHorairesVitrine — la lecture défensive, et le SENS de son échec", () => {
  it("lit une semaine complète", () => {
    const lu = mapHorairesVitrine({
      lundi: [],
      mardi: [{ de: "09:00", a: "12:30" }],
      mercredi: [],
      jeudi: [],
      vendredi: [],
      samedi: [],
      dimanche: [],
    });
    expect(lu?.mardi).toEqual([{ de: "09:00", a: "12:30" }]);
    expect(lu?.lundi).toEqual([]);
  });

  it("une semaine INCOMPLÈTE rend `null`, jamais des jours « fermés » inventés", () => {
    // Compléter par `[]` aurait AFFIRMÉ « fermé le dimanche » sur la foi d'un
    // document qui n'en dit rien — un commerce ouvert annoncé fermé.
    expect(mapHorairesVitrine({ lundi: [], mardi: [] })).toBeNull();
    expect(mapHorairesVitrine(null)).toBeNull();
    expect(mapHorairesVitrine("lundi 9h-12h")).toBeNull();
    expect(mapHorairesVitrine([])).toBeNull();
  });

  it("un jour qui n'est pas un tableau rend `null` : la semaine est entière ou elle n'est pas", () => {
    expect(
      mapHorairesVitrine({
        lundi: { de: "09:00", a: "12:00" },
        mardi: [],
        mercredi: [],
        jeudi: [],
        vendredi: [],
        samedi: [],
        dimanche: [],
      }),
    ).toBeNull();
  });

  it("un créneau illisible est DROPPÉ, et le reste du jour survit", () => {
    // La journée RÉTRÉCIT ; elle ne s'élargit jamais. C'est le seul sens
    // acceptable : l'incertitude ne doit pas produire un « ouvert ».
    const lu = mapHorairesVitrine({
      lundi: [
        { de: "9:00", a: "12:00" }, // zéro manquant
        { de: "14:00", a: "14:00" }, // durée nulle
        { de: "18:00", a: "02:00" }, // franchit minuit
        { de: "20:00", a: "23:00" }, // le seul valide
      ],
      mardi: [],
      mercredi: [],
      jeudi: [],
      vendredi: [],
      samedi: [],
      dimanche: [],
    });
    expect(lu?.lundi).toEqual([{ de: "20:00", a: "23:00" }]);
  });

  it("au-delà de trois créneaux, le surplus est coupé — la borne du SQL, côté lecture", () => {
    const lu = mapHorairesVitrine({
      lundi: [
        { de: "08:00", a: "09:00" },
        { de: "10:00", a: "11:00" },
        { de: "12:00", a: "13:00" },
        { de: "14:00", a: "15:00" },
      ],
      mardi: [],
      mercredi: [],
      jeudi: [],
      vendredi: [],
      samedi: [],
      dimanche: [],
    });
    expect(lu?.lundi).toHaveLength(3);
  });
});
