// @vitest-environment node
import { describe, expect, it } from "vitest";
import { getCompetition } from "./competitions";
import {
  normalizeTeamName,
  parseCachedFixtures,
  parseProviderEvent,
  resolveProviderSide,
} from "./fixtures";

const NOW = new Date("2026-07-19T12:00:00Z");

describe("parseProviderEvent", () => {
  const base = {
    idEvent: "2489463",
    strHomeTeam: "Marseille",
    strAwayTeam: "Strasbourg",
    strTimestamp: "2026-08-21T18:45:00",
    intHomeScore: null,
    intAwayScore: null,
  };

  it("normalise un match à venir (timestamp UTC annoté)", () => {
    const fixture = parseProviderEvent(base, NOW);
    expect(fixture).toEqual({
      ref: "2489463",
      homeName: "Marseille",
      awayName: "Strasbourg",
      kickoffAt: "2026-08-21T18:45:00.000Z",
      homeScore: null,
      awayScore: null,
      finished: false,
      finishType: "regular",
      homePenalties: null,
      awayPenalties: null,
    });
  });

  it("prolongation (AET) : score final inclus, type extra_time", () => {
    const fixture = parseProviderEvent(
      {
        ...base,
        strTimestamp: "2026-07-19T08:00:00",
        intHomeScore: "2",
        intAwayScore: "1",
        strStatus: "AET",
      },
      NOW,
    );
    expect(fixture?.finished).toBe(true);
    expect(fixture?.finishType).toBe("extra_time");
    expect(fixture?.homePenalties).toBeNull();
  });

  it("tirs au but (AP) : score après 120', séance dans ScoreExtra", () => {
    // Cas réel vérifié : finale CDM 2022 — 3-3 a.p., t.a.b. 4-2.
    const fixture = parseProviderEvent(
      {
        ...base,
        strTimestamp: "2026-07-19T08:00:00",
        intHomeScore: "3",
        intAwayScore: "3",
        intHomeScoreExtra: "4",
        intAwayScoreExtra: "2",
        strStatus: "AP",
      },
      NOW,
    );
    expect(fixture?.finished).toBe(true);
    expect(fixture?.finishType).toBe("penalties");
    expect(fixture?.homeScore).toBe(3);
    expect(fixture?.awayScore).toBe(3);
    expect(fixture?.homePenalties).toBe(4);
    expect(fixture?.awayPenalties).toBe(2);
  });

  it("ScoreExtra ignoré hors tirs au but (temps réglementaire)", () => {
    const fixture = parseProviderEvent(
      {
        ...base,
        strTimestamp: "2026-06-11T19:00:00",
        intHomeScore: "2",
        intAwayScore: "0",
        intHomeScoreExtra: "9",
        intAwayScoreExtra: "9",
        strStatus: "FT",
      },
      NOW,
    );
    expect(fixture?.finishType).toBe("regular");
    expect(fixture?.homePenalties).toBeNull();
    expect(fixture?.awayPenalties).toBeNull();
  });

  it("marque joué un match passé avec ses deux scores", () => {
    const fixture = parseProviderEvent(
      {
        ...base,
        strTimestamp: "2026-06-11T19:00:00",
        intHomeScore: "2",
        intAwayScore: "0",
      },
      NOW,
    );
    expect(fixture?.finished).toBe(true);
    expect(fixture?.homeScore).toBe(2);
    expect(fixture?.awayScore).toBe(0);
  });

  it("ne fige pas le score d'un match encore en direct", () => {
    const fixture = parseProviderEvent(
      {
        ...base,
        strTimestamp: "2026-07-19T10:00:00",
        intHomeScore: "1",
        intAwayScore: "0",
        strStatus: "2H",
      },
      NOW,
    );
    expect(fixture?.finished).toBe(false);
  });

  it("reconnaît les statuts finaux du fournisseur", () => {
    for (const strStatus of ["FT", "AET", "PEN", "Match Finished"]) {
      const fixture = parseProviderEvent(
        {
          ...base,
          strTimestamp: "2026-07-19T09:00:00",
          intHomeScore: "2",
          intAwayScore: "1",
          strStatus,
        },
        NOW,
      );
      expect(fixture?.finished, strStatus).toBe(true);
    }
  });

  it("attend quatre heures avant le repli d'un événement sans statut", () => {
    const fixture = parseProviderEvent(
      {
        ...base,
        strTimestamp: "2026-07-19T09:00:01",
        intHomeScore: "2",
        intAwayScore: "1",
      },
      NOW,
    );
    expect(fixture?.finished).toBe(false);
  });

  it("un score partiel avant le coup d'envoi ne fait pas un match joué", () => {
    const fixture = parseProviderEvent(
      { ...base, intHomeScore: "1" },
      NOW,
    );
    expect(fixture?.finished).toBe(false);
  });

  it("borne les scores hors norme à 99 (CHECK en base)", () => {
    const fixture = parseProviderEvent(
      {
        ...base,
        strTimestamp: "2026-06-11T19:00:00",
        intHomeScore: "142",
        intAwayScore: "0",
      },
      NOW,
    );
    expect(fixture?.homeScore).toBe(99);
  });

  it("rejette un événement incomplet", () => {
    expect(parseProviderEvent({ ...base, idEvent: null }, NOW)).toBeNull();
    expect(parseProviderEvent({ ...base, strTimestamp: "n'importe quoi" }, NOW)).toBeNull();
    expect(parseProviderEvent({ ...base, strHomeTeam: "  " }, NOW)).toBeNull();
  });
});

describe("normalizeTeamName", () => {
  it("minuscules, accents et suffixes sportifs retirés", () => {
    expect(normalizeTeamName("France Rugby")).toBe("france");
    expect(normalizeTeamName("Écosse")).toBe("ecosse");
    expect(normalizeTeamName("Toulouse FC")).toBe("toulouse");
    expect(normalizeTeamName("St  Etienne")).toBe("st etienne");
  });
});

describe("resolveProviderSide", () => {
  const ligue1 = getCompetition("ligue1")!;
  const cdm = getCompetition("cdm-foot")!;
  const sixNations = getCompetition("six-nations")!;

  it("associe un club fournisseur à sa vignette catalogue", () => {
    const side = resolveProviderSide(ligue1, "Marseille");
    expect(side.key).toBe("om");
    expect(side.name).toBe("Olympique de Marseille");
    expect(side.color).not.toBe("");
  });

  it("associe une nation anglophone à son drapeau", () => {
    const side = resolveProviderSide(cdm, "Germany");
    expect(side.key).toBe("ger");
    expect(side.badge).toBe("🇩🇪");
  });

  it("gère le suffixe « Rugby » du fournisseur", () => {
    const side = resolveProviderSide(sixNations, "England Rugby");
    expect(side.key).toBe("eng");
  });

  it("équipe hors catalogue : nom conservé, sans vignette", () => {
    const side = resolveProviderSide(cdm, "Cape Verde");
    expect(side.key).toBe("");
    expect(side.name).toBe("Cape Verde");
    expect(side.badge).toBe("");
  });
});

describe("parseCachedFixtures", () => {
  const valid = {
    ref: "2489463",
    homeName: "Marseille",
    awayName: "Strasbourg",
    kickoffAt: "2026-08-21T18:45:00.000Z",
    homeScore: null,
    awayScore: null,
    finished: false,
    finishType: "regular",
    homePenalties: null,
    awayPenalties: null,
  };

  it("relit un payload sain", () => {
    expect(parseCachedFixtures([valid])).toEqual([valid]);
    expect(parseCachedFixtures([])).toEqual([]);
  });

  it("copie d'avant l'ajout des prolongations : valeurs par défaut", () => {
    const legacy = {
      ref: valid.ref,
      homeName: valid.homeName,
      awayName: valid.awayName,
      kickoffAt: valid.kickoffAt,
      homeScore: 2,
      awayScore: 1,
      finished: true,
    };
    expect(parseCachedFixtures([legacy])).toEqual([
      { ...legacy, finishType: "regular", homePenalties: null, awayPenalties: null },
    ]);
  });

  it("relit une séance de tirs au but", () => {
    const shootout = {
      ...valid,
      homeScore: 3,
      awayScore: 3,
      finished: true,
      finishType: "penalties",
      homePenalties: 4,
      awayPenalties: 2,
    };
    expect(parseCachedFixtures([shootout])).toEqual([shootout]);
  });

  it("rejette un payload corrompu en bloc", () => {
    expect(parseCachedFixtures(null)).toBeNull();
    expect(parseCachedFixtures("junk")).toBeNull();
    expect(parseCachedFixtures([{ ...valid, ref: "" }])).toBeNull();
    expect(parseCachedFixtures([{ ...valid, kickoffAt: "pas une date" }])).toBeNull();
    expect(parseCachedFixtures([{ ...valid, homeScore: "2" }])).toBeNull();
    expect(parseCachedFixtures([valid, "junk"])).toBeNull();
  });

  it("ignore les champs excédentaires (payload plus riche)", () => {
    const enriched = { ...valid, extra: "ignored" };
    expect(parseCachedFixtures([enriched])).toEqual([valid]);
  });
});
