// @vitest-environment node
import { describe, expect, it } from "vitest";
import { getCompetition } from "./competitions";
import { afterEach, beforeEach, vi } from "vitest";
import {
  fetchLeagueFixtures,
  JOURNEES_APRES,
  normalizeTeamName,
  parseCachedFixtures,
  parseProviderEvent,
  parseRound,
  readAnchor,
  resolveProviderSide,
  roundWindow,
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

// ════════════════════════════════════════════════════════════
// LA FENÊTRE PAR JOURNÉES — le défaut « un seul match » (2026-08-27)
//
// Relevé en production sur la Ligue 1 : `eventsnextleague.php` ne rend plus
// qu'UN événement (le tier gratuit s'est resserré, l'en-tête du module
// promettait encore « ~15 »). Le commerçant choisissait « Ligue 1 » et
// récupérait le seul match du vendredi soir, alors que les dix-huit clubs
// jouent dans le week-end.
//
// La réparation ne consiste pas à demander plus d'événements — le fournisseur
// n'en donnera pas — mais à demander la bonne UNITÉ : une journée de
// championnat (`eventsround.php`), qui rend les 9 matchs d'un coup.
// ════════════════════════════════════════════════════════════

describe("parseRound", () => {
  it("lit un entier de journée, en chaîne comme en nombre", () => {
    expect(parseRound("2")).toBe(2);
    expect(parseRound(7)).toBe(7);
  });

  it("refuse tout ce qui n'est pas une journée", () => {
    for (const brut of [null, undefined, "", "abc", 0, -1, 1.5, "1.5"]) {
      expect(parseRound(brut as never), String(brut)).toBeNull();
    }
  });
});

describe("readAnchor — où en est la compétition", () => {
  const evt = (round: string | null, season = "2026-2027") => ({
    intRound: round,
    strSeason: season,
  });

  it("retient la saison et la PROCHAINE journée", () => {
    expect(readAnchor([evt("2")], [evt("1")])).toEqual({
      season: "2026-2027",
      nextRound: 2,
      lastRound: 1,
    });
  });

  /**
   * Fin de saison : plus aucun match à venir, mais des résultats encore à
   * appliquer. La dernière journée JOUÉE devient le pivot — sans quoi la
   * synchro cesserait d'aller chercher les scores du dernier week-end.
   */
  it("retombe sur la dernière journée jouée quand rien ne vient", () => {
    expect(readAnchor([], [evt("34")])).toEqual({
      season: "2026-2027",
      nextRound: 34,
      lastRound: 34,
    });
  });

  /**
   * Une compétition qui ne numérote pas ses tours (coupe à élimination
   * directe) rend `null` : l'appelant se rabat alors sur les seules ancres,
   * exactement comme avant ce chantier. La dégradation est silencieuse.
   */
  it("rend null sans saison ou sans numéro de journée", () => {
    expect(readAnchor([evt(null)], [evt(null)])).toBeNull();
    expect(readAnchor([evt("2", "")], [evt("1", "")])).toBeNull();
    expect(readAnchor([], [])).toBeNull();
  });
});

describe("roundWindow — de la dernière jouée à la prochaine + 1", () => {
  it("couvre les résultats en attente ET deux journées à pronostiquer", () => {
    expect(roundWindow({ season: "2026-2027", nextRound: 2, lastRound: 1 })).toEqual([
      1, 2, 3,
    ]);
  });

  it("ne régresse jamais : une dernière journée en avance ne creuse pas la fenêtre", () => {
    // `lastRound` > `nextRound` est possible (un match reporté joué en
    // avance). La fenêtre part du plus petit des deux, jamais d'un intervalle
    // inversé qui rendrait une liste vide.
    const w = roundWindow({ season: "2026-2027", nextRound: 2, lastRound: 5 });
    expect(w[0]).toBe(2);
    expect(w.at(-1)).toBe(3);
  });

  it("la profondeur est celle qui est documentée", () => {
    expect(JOURNEES_APRES).toBe(1);
  });
});

// ────────────────────────────────────────────────────────────
// fetchLeagueFixtures — la reproduction du défaut, et sa réparation
// ────────────────────────────────────────────────────────────

describe("fetchLeagueFixtures — une JOURNÉE, pas un match", () => {
  const original = globalThis.fetch;
  /** Chemins demandés au fournisseur, dans l'ordre. */
  let chemins: string[] = [];

  /** Un match de la journée `round`, à J+`jour`. */
  const match = (id: string, round: string, jour: number) => ({
    idEvent: id,
    strHomeTeam: `Equipe ${id}A`,
    strAwayTeam: `Equipe ${id}B`,
    strTimestamp: new Date(NOW.getTime() + jour * 86_400_000)
      .toISOString()
      .replace("Z", ""),
    intRound: round,
    strSeason: "2026-2027",
    strStatus: "NS",
  });

  beforeEach(() => {
    chemins = [];
    globalThis.fetch = (async (url: string) => {
      const chemin = String(url).split("/123/")[1] ?? String(url);
      chemins.push(chemin);
      // LE FOURNISSEUR TEL QU'IL EST AUJOURD'HUI : un seul événement par
      // ancre. C'est la mesure du 2026-08-27, pas une hypothèse.
      if (chemin.startsWith("eventsnextleague")) {
        return Response.json({ events: [match("n1", "2", 1)] });
      }
      if (chemin.startsWith("eventspastleague")) {
        return Response.json({ events: [match("p1", "1", -7)] });
      }
      if (chemin.startsWith("eventsround")) {
        const round = new URLSearchParams(chemin.split("?")[1]).get("r")!;
        // Une journée entière : neuf matchs, comme la Ligue 1.
        return Response.json({
          events: Array.from({ length: 9 }, (_, i) =>
            match(`r${round}-${i}`, round, Number(round) * 7),
          ),
        });
      }
      return Response.json({ events: [] });
    }) as typeof fetch;
  });
  afterEach(() => {
    globalThis.fetch = original;
    vi.restoreAllMocks();
  });

  it("rend les journées entières, pas le seul match des ancres", async () => {
    const fixtures = await fetchLeagueFixtures("4334", NOW);

    // 3 journées × 9 matchs + les 2 ancres (refs distinctes) = 29.
    expect(fixtures.length).toBe(29);
    // AVANT le correctif, ce compte valait 2 : le match du vendredi et le
    // dernier résultat. C'est tout ce que le commerçant recevait.
    expect(fixtures.length).toBeGreaterThan(2);
  });

  it("demande les trois journées désignées par les ancres", async () => {
    await fetchLeagueFixtures("4334", NOW);

    const tours = chemins.filter((c) => c.startsWith("eventsround"));
    expect(tours).toHaveLength(3);
    for (const r of ["r=1", "r=2", "r=3"]) {
      expect(tours.some((c) => c.includes(r)), r).toBe(true);
    }
    // La saison est celle des ancres, jamais devinée d'une date.
    expect(tours.every((c) => c.includes("s=2026-2027"))).toBe(true);
  });

  /**
   * Une journée en échec ne doit pas emporter le calendrier : il manquerait
   * une journée là où, sans cette garde, il manquerait tout.
   */
  it("une journée en panne ne fait pas tomber les autres", async () => {
    const precedent = globalThis.fetch;
    globalThis.fetch = (async (url: string) => {
      if (String(url).includes("eventsround") && String(url).includes("r=2")) {
        throw new Error("fournisseur indisponible");
      }
      return precedent(url as never);
    }) as typeof fetch;

    const fixtures = await fetchLeagueFixtures("4334", NOW);
    // 2 journées servies + les 2 ancres.
    expect(fixtures.length).toBe(20);
  });

  /**
   * Compétition sans numérotation de tours : aucun appel `eventsround`, et
   * le résultat est exactement celui d'avant ce chantier. C'est le contrôle
   * qui interdit à la nouvelle fenêtre de casser les coupes.
   */
  it("sans numéro de journée, on garde le comportement d'origine", async () => {
    globalThis.fetch = (async (url: string) => {
      const chemin = String(url).split("/123/")[1] ?? String(url);
      chemins.push(chemin);
      if (chemin.startsWith("eventsnextleague")) {
        return Response.json({
          events: [{ ...match("n1", "2", 1), intRound: null }],
        });
      }
      if (chemin.startsWith("eventspastleague")) {
        return Response.json({
          events: [{ ...match("p1", "1", -7), intRound: null }],
        });
      }
      return Response.json({ events: [] });
    }) as typeof fetch;

    const fixtures = await fetchLeagueFixtures("4334", NOW);
    expect(fixtures).toHaveLength(2);
    expect(chemins.filter((c) => c.startsWith("eventsround"))).toEqual([]);
  });
});
