import { describe, expect, it } from "vitest";
import {
  attendResultat,
  DEFAULT_SCORING,
  effectiveLocksAt,
  generatePlayerToken,
  hashPlayerToken,
  isPredictionOpen,
  parseRewards,
  parseScoring,
  progressionPronostics,
  rewardForRank,
} from "./pronostics";
import { normalizeContestCode } from "./utils";
import {
  addMatchesSchema,
  contestRedeemCodeSchema,
  createLeagueSchema,
  joinLeagueSchema,
  leaveLeagueSchema,
  matchRowErrors,
  registerPlayerSchema,
  updateContestRewardsSchema,
  updateContestSchema,
} from "./validations/pronostics";

describe("parseScoring", () => {
  it("retourne le barème par défaut sur une valeur invalide", () => {
    expect(parseScoring(null)).toEqual(DEFAULT_SCORING);
    expect(parseScoring("junk")).toEqual(DEFAULT_SCORING);
    expect(parseScoring([])).toEqual({ exact: 3, diff: 2, winner: 1 });
  });

  it("lit un barème valide", () => {
    expect(parseScoring({ exact: 5, diff: 3, winner: 1 })).toEqual({
      exact: 5,
      diff: 3,
      winner: 1,
    });
  });

  it("remplace champ par champ les valeurs invalides", () => {
    expect(parseScoring({ exact: -1, diff: 2.5, winner: 4 })).toEqual({
      exact: 3,
      diff: 2,
      winner: 4,
    });
  });
});

describe("parseRewards / rewardForRank", () => {
  it("ignore les entrées invalides", () => {
    expect(parseRewards(null)).toEqual([]);
    expect(
      parseRewards([
        { from: 1, to: 3, label: "Repas offert" },
        { from: 0, to: 2, label: "invalide (from < 1)" },
        { from: 3, to: 1, label: "invalide (to < from)" },
        { from: 4, to: 4, label: "   " },
        "junk",
      ]),
    ).toEqual([{ from: 1, to: 3, label: "Repas offert" }]);
  });

  it("associe un rang à sa récompense", () => {
    const rewards = parseRewards([
      { from: 1, to: 1, label: "Champagne" },
      { from: 2, to: 3, label: "Café offert" },
    ]);
    expect(rewardForRank(rewards, 1)).toBe("Champagne");
    expect(rewardForRank(rewards, 2)).toBe("Café offert");
    expect(rewardForRank(rewards, 3)).toBe("Café offert");
    expect(rewardForRank(rewards, 4)).toBeNull();
  });
});

describe("jeton joueur", () => {
  it("génère des jetons uniques et url-safe", () => {
    const a = generatePlayerToken();
    const b = generatePlayerToken();
    expect(a).not.toBe(b);
    expect(a).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it("hash stable et distinct du jeton", () => {
    const token = generatePlayerToken();
    expect(hashPlayerToken(token)).toBe(hashPlayerToken(token));
    expect(hashPlayerToken(token)).not.toBe(token);
    expect(hashPlayerToken(token)).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("isPredictionOpen", () => {
  const now = new Date("2026-07-18T15:00:00Z");

  it("ouvert avant le coup d'envoi", () => {
    expect(isPredictionOpen("2026-07-18T20:00:00Z", now)).toBe(true);
  });

  it("fermé au coup d'envoi et après", () => {
    expect(isPredictionOpen("2026-07-18T15:00:00Z", now)).toBe(false);
    expect(isPredictionOpen("2026-07-18T12:00:00Z", now)).toBe(false);
  });
});

describe("inscription au championnat", () => {
  const input = {
    slug: "TESTPRONO",
    first_name: "Camille",
    email: "",
    phone: "",
  };

  it("exige un consentement explicite", () => {
    expect(registerPlayerSchema.safeParse({ ...input, accepted_terms: false }).success).toBe(false);
    expect(registerPlayerSchema.safeParse({ ...input, accepted_terms: true }).success).toBe(true);
  });
});

describe("récompenses du championnat", () => {
  it("refuse deux paliers qui se chevauchent", () => {
    const result = updateContestRewardsSchema.safeParse({
      id: "00000000-0000-4000-8000-000000000001",
      rewards: JSON.stringify([
        { from: 1, to: 3, label: "Lot A" },
        { from: 3, to: 5, label: "Lot B" },
      ]),
    });
    expect(result.success).toBe(false);
  });
});

describe("saisie de matchs en lot", () => {
  const contestId = "00000000-0000-4000-8000-000000000001";
  const row = (over: Record<string, unknown> = {}) => ({
    home_key: "",
    away_key: "",
    home_name: "Lyon",
    away_name: "Reims",
    kickoff_at: "2026-08-01T20:00",
    ...over,
  });
  const payload = (rows: unknown[]) => ({
    contest_id: contestId,
    matches: JSON.stringify(rows),
  });

  it("accepte de 1 à 30 lignes", () => {
    expect(addMatchesSchema.safeParse(payload([row()])).success).toBe(true);
    const thirty = Array.from({ length: 30 }, (_, i) =>
      row({ away_name: `Équipe ${i + 1}` }),
    );
    expect(addMatchesSchema.safeParse(payload(thirty)).success).toBe(true);
  });

  it("refuse 0 et 31 lignes", () => {
    expect(addMatchesSchema.safeParse(payload([])).success).toBe(false);
    const tooMany = Array.from({ length: 31 }, (_, i) =>
      row({ away_name: `Équipe ${i + 1}` }),
    );
    expect(addMatchesSchema.safeParse(payload(tooMany)).success).toBe(false);
  });

  it("refuse un JSON illisible", () => {
    const result = addMatchesSchema.safeParse({
      contest_id: contestId,
      matches: "{pas-du-json",
    });
    expect(result.success).toBe(false);
  });

  it("désigne la ligne aux participants identiques (casse ignorée)", () => {
    const result = addMatchesSchema.safeParse(
      payload([row(), row({ away_name: "lyon" })]),
    );
    expect(result.success).toBe(false);
    if (!result.success) {
      const { rowErrors } = matchRowErrors(result.error);
      expect(rowErrors).toEqual([
        { index: 1, message: "Choisissez deux participants différents" },
      ]);
    }
  });

  it("désigne la ligne à la date invalide", () => {
    const result = addMatchesSchema.safeParse(
      payload([row({ kickoff_at: "pas-une-date" }), row()]),
    );
    expect(result.success).toBe(false);
    if (!result.success) {
      const { error, rowErrors } = matchRowErrors(result.error);
      expect(rowErrors.map((e) => e.index)).toEqual([0]);
      expect(error).toContain("Ligne 1");
    }
  });

  it("laisse un message global hors des lignes (lot vide)", () => {
    const result = addMatchesSchema.safeParse(payload([]));
    expect(result.success).toBe(false);
    if (!result.success) {
      const { error, rowErrors } = matchRowErrors(result.error);
      expect(rowErrors).toEqual([]);
      expect(error).toBe("Ajoutez au moins un match");
    }
  });
});

describe("ligues privées", () => {
  const slug = "ABCD2345";

  it("borne le nom de ligue (1..40)", () => {
    expect(
      createLeagueSchema.safeParse({ slug, name: "Les collègues" }).success,
    ).toBe(true);
    expect(createLeagueSchema.safeParse({ slug, name: "   " }).success).toBe(false);
    expect(
      createLeagueSchema.safeParse({ slug, name: "x".repeat(41) }).success,
    ).toBe(false);
  });

  it("normalise le code d'invitation (trim + majuscules)", () => {
    const result = joinLeagueSchema.safeParse({ slug, code: " abc234 " });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.code).toBe("ABC234");
  });

  it("refuse un code hors format (6 à 8 alphanumériques)", () => {
    for (const code of ["", "ABC12", "ABCDEF123", "AB C234", "ABC-234"]) {
      expect(joinLeagueSchema.safeParse({ slug, code }).success).toBe(false);
    }
  });

  it("exige un identifiant de ligue valide pour la quitter", () => {
    expect(
      leaveLeagueSchema.safeParse({ slug, league_id: "pas-un-uuid" }).success,
    ).toBe(false);
    expect(
      leaveLeagueSchema.safeParse({
        slug,
        league_id: "00000000-0000-4000-8000-000000000001",
      }).success,
    ).toBe(true);
  });
});

// ────────────────────────────────────────────────────────────
// Verrouillage : le football ne doit JAMAIS dépendre de la date
// par défaut de l'événement (régression fermée après revue sécurité).
//
// Les matchs sont importés sans `locks_at` : leur fenêtre est le coup
// d'envoi, qui SUIT les reports de calendrier (la synchro ne met à jour
// que `kickoff_at`). Si la date par défaut s'y appliquait, un commerçant
// la renseignant fermerait d'un coup tout un championnat importé.
// Ce bloc est le miroir TS de la règle SQL — toute divergence ferait
// mentir l'UI par rapport au serveur, qui reste l'autorité.
// ────────────────────────────────────────────────────────────
describe("effectiveLocksAt", () => {
  const KICKOFF = "2026-08-01T19:00:00.000Z";
  // Volontairement AVANT le coup d'envoi : si elle s'appliquait au
  // football, le match serait fermé alors qu'il n'a pas commencé.
  const DEFAUT = "2026-07-01T12:00:00.000Z";

  it("un match (score) ignore la date par défaut et suit son coup d'envoi", () => {
    expect(
      effectiveLocksAt(
        { question_type: "score", locks_at: null, kickoff_at: KICKOFF },
        { default_locks_at: DEFAUT },
      ),
    ).toBe(KICKOFF);
  });

  it("un match REPORTÉ voit sa fenêtre suivre le nouveau coup d'envoi", () => {
    const reporte = "2026-08-04T19:00:00.000Z";
    expect(
      effectiveLocksAt(
        { question_type: "score", locks_at: null, kickoff_at: reporte },
        { default_locks_at: DEFAUT },
      ),
    ).toBe(reporte);
  });

  it("une question générique applique bien la date par défaut", () => {
    expect(
      effectiveLocksAt(
        { question_type: "choice", locks_at: null, kickoff_at: KICKOFF },
        { default_locks_at: DEFAUT },
      ),
    ).toBe(DEFAUT);
  });

  it("une échéance propre à la question prime dans les deux cas", () => {
    const propre = "2026-07-20T08:00:00.000Z";
    for (const type of ["score", "choice"]) {
      expect(
        effectiveLocksAt(
          { question_type: type, locks_at: propre, kickoff_at: KICKOFF },
          { default_locks_at: DEFAUT },
        ),
      ).toBe(propre);
    }
  });

  it("un type absent retombe sur le football (colonne NOT NULL en base)", () => {
    expect(
      effectiveLocksAt(
        { locks_at: null, kickoff_at: KICKOFF },
        { default_locks_at: DEFAUT },
      ),
    ).toBe(KICKOFF);
  });
});

// ────────────────────────────────────────────────────────────
// Caisse — 9e préfixe PRONO-…
//
// Les codes PRONO-… étaient émis par finalize_contest et affichés au joueur
// avec la consigne de les présenter en caisse, sans qu'aucun chemin caisse ne
// les reconnaisse. Le routage repose sur la STRICTESSE de ce normaliseur :
// normalizeRedeemCode (roue) est permissif et avalerait tout.
// ────────────────────────────────────────────────────────────

describe("normalizeContestCode / contestRedeemCodeSchema", () => {
  it("normalise les saisies de caisse", () => {
    expect(normalizeContestCode("prono abcd2345")).toBe("PRONO-ABCD2345");
    expect(normalizeContestCode("PRONO-ABCD2345")).toBe("PRONO-ABCD2345");
    expect(normalizeContestCode("abcd2345")).toBe("PRONO-ABCD2345");
    expect(normalizeContestCode("  prono_abcd2345 ")).toBe("PRONO-ABCD2345");
  });

  it("STRICT : rejette les 8 autres préfixes (autorité du préfixe en caisse)", () => {
    for (const code of [
      "GAIN-ABCD2345",
      "CHASSE-ABCD2345",
      "FIDELITE-ABCD2345",
      "JACKPOT-ABCD2345",
      "EVENT-ABCD2345",
      "CADEAU-ABCD2345",
      "PARRAIN-ABCD2345",
      "QUIZ-ABCD2345",
    ]) {
      expect(normalizeContestCode(code)).toBe("");
    }
  });

  it("rejette une forme invalide (alphabet sans I/O/0/1)", () => {
    expect(normalizeContestCode("prono abcd234")).toBe("");
    expect(normalizeContestCode("prono ABCD2I45")).toBe("");
    expect(normalizeContestCode("prono ABCD2O45")).toBe("");
    expect(normalizeContestCode("")).toBe("");
  });

  it("le schéma de caisse n'accepte QUE la forme canonique PRONO-XXXXXXXX", () => {
    expect(contestRedeemCodeSchema.safeParse("  prono-abcd2345 ").success).toBe(true);
    expect(contestRedeemCodeSchema.parse("prono-abcd2345")).toBe("PRONO-ABCD2345");
    for (const code of ["ABCD2345", "PRONO-ABCD234", "PRONO-ABCD2I45", "QUIZ-ABCD2345"]) {
      expect(contestRedeemCodeSchema.safeParse(code).success).toBe(false);
    }
  });
});

// ────────────────────────────────────────────────────────────
// code_ttl_seconds — expiration du code de retrait
//
// Bornes DÉLIBÉRÉMENT plus larges que celles de la roue (10 s à 600 s) : le
// décompte part de la CLÔTURE du championnat, pas du joueur devant la caisse.
// ────────────────────────────────────────────────────────────

describe("updateContestSchema — code_ttl_seconds", () => {
  const ID = "00000000-0000-4000-8000-0000000000cc";
  const parse = (value: unknown) =>
    updateContestSchema.safeParse({ id: ID, code_ttl_seconds: value });

  it("'' = pas d'expiration (null)", () => {
    const res = parse("");
    expect(res.success).toBe(true);
    if (res.success) expect(res.data.code_ttl_seconds).toBeNull();
  });

  it("null explicite reste null", () => {
    const res = parse(null);
    expect(res.success).toBe(true);
    if (res.success) expect(res.data.code_ttl_seconds).toBeNull();
  });

  it("accepte les bornes du CHECK SQL (1 h à 90 j)", () => {
    for (const [input, expected] of [
      ["3600", 3600],
      ["7776000", 7776000],
      ["86400", 86400],
    ] as const) {
      const res = parse(input);
      expect(res.success).toBe(true);
      if (res.success) expect(res.data.code_ttl_seconds).toBe(expected);
    }
  });

  it("refuse hors bornes et non entier (miroir du CHECK SQL)", () => {
    for (const value of ["3599", "7776001", "0", "-1", "600", "3600.5", "abc"]) {
      expect(parse(value).success).toBe(false);
    }
  });

  it("champ absent : le réglage n'est pas touché", () => {
    const res = updateContestSchema.safeParse({ id: ID, name: "Pronos" });
    expect(res.success).toBe(true);
    if (res.success) expect(res.data.code_ttl_seconds).toBeUndefined();
  });
});

// ════════════════════════════════════════════════════════════
// LA PROGRESSION DE LA GRILLE — le « 0/7 » impossible (2026-08-28)
//
// Relevé sur une capture joueur : la barre annonçait « 0/7 pronostic
// complété » alors qu'UN SEUL match était ouvert aux pronostics. Le
// dénominateur valait `matches.length` — tous les matchs jamais importés,
// dont ceux fermés avant l'inscription du joueur. Une barre impossible à
// remplir, et sept pronostics promis qu'on ne pouvait pas poser.
// ════════════════════════════════════════════════════════════

describe("progressionPronostics", () => {
  /** Raccourci lisible : `o` ouvert, `p` pronostiqué. */
  const m = (ouvert: boolean, pronostique: boolean) => ({ ouvert, pronostique });

  it("LA RÉGRESSION : un match fermé et non pronostiqué ne compte nulle part", () => {
    // La situation exacte de la capture : 6 matchs fermés sans pronostic,
    // 1 ouvert. Le joueur doit lire 0/1, jamais 0/7.
    const grille = [
      ...Array.from({ length: 6 }, () => m(false, false)),
      m(true, false),
    ];
    expect(progressionPronostics(grille)).toEqual({ done: 0, total: 1 });
  });

  it("un match pronostiqué compte des DEUX côtés, même une fois fermé", () => {
    // Sinon le travail déjà fait disparaîtrait du compte au coup d'envoi :
    // le joueur verrait sa progression RECULER en ne faisant rien.
    expect(progressionPronostics([m(false, true)])).toEqual({
      done: 1,
      total: 1,
    });
  });

  it("une grille à jour vaut 100 %, et c'est atteignable", () => {
    const grille = [m(false, true), m(true, true), m(true, true)];
    const { done, total } = progressionPronostics(grille);
    expect(done).toBe(total);
    expect(total).toBe(3);
  });

  it("le total ne dépasse jamais ce que le joueur peut atteindre", () => {
    // Propriété générale : pour toute grille, `done <= total <= longueur`.
    const grilles = [
      [],
      [m(true, false)],
      [m(false, false), m(false, false)],
      [m(true, true), m(false, false), m(false, true), m(true, false)],
    ];
    for (const grille of grilles) {
      const { done, total } = progressionPronostics(grille);
      expect(done).toBeLessThanOrEqual(total);
      expect(total).toBeLessThanOrEqual(grille.length);
      // Et le reste à faire est toujours posable : ce sont des matchs ouverts.
      expect(total - done).toBe(
        grille.filter((x) => x.ouvert && !x.pronostique).length,
      );
    }
  });

  it("une grille vide ne divise pas par zéro chez l'appelant", () => {
    expect(progressionPronostics([])).toEqual({ done: 0, total: 0 });
  });
});

// ────────────────────────────────────────────────────────────
// attendResultat — « En cours 🔒 » sur un match de la semaine dernière
// ────────────────────────────────────────────────────────────

describe("attendResultat", () => {
  const KICKOFF = "2026-08-22T18:45:00.000Z";
  const apres = (minutes: number) =>
    new Date(new Date(KICKOFF).getTime() + minutes * 60_000);

  it("pendant la rencontre : le match est EN COURS, pas en attente", () => {
    expect(attendResultat(KICKOFF, apres(1))).toBe(false);
    expect(attendResultat(KICKOFF, apres(99))).toBe(false);
  });

  it("passé une durée de match : ce n'est plus la rencontre qui dure", () => {
    expect(attendResultat(KICKOFF, apres(101))).toBe(true);
    // Le cas de la capture : un match de six jours annoncé « En cours ».
    expect(attendResultat(KICKOFF, apres(6 * 24 * 60))).toBe(true);
  });

  it("avant le coup d'envoi, rien n'est attendu", () => {
    expect(attendResultat(KICKOFF, apres(-30))).toBe(false);
  });
});
