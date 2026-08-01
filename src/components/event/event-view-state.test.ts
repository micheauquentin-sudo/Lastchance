import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type {
  EventDistributionEntry,
  EventLeaderboardEntry,
} from "@/lib/event";
import {
  appliquerModerationLocale,
  PSEUDO_MODERE,
  computeCountdown,
  computeDistribution,
  eventQuestionTypeMeta,
  podiumEntries,
  sortLeaderboard,
  viewForPhase,
} from "./event-view-state";

describe("viewForPhase", () => {
  it("réduit chaque phase à sa vue", () => {
    expect(viewForPhase("lobby")).toBe("lobby");
    expect(viewForPhase("question_active")).toBe("question");
    expect(viewForPhase("question_locked")).toBe("locked");
    expect(viewForPhase("reveal")).toBe("reveal");
    expect(viewForPhase("leaderboard")).toBe("leaderboard");
    expect(viewForPhase("ended")).toBe("ended");
  });
});

describe("computeCountdown", () => {
  it("calcule secondes et fractions restantes en cours de question", () => {
    const start = "2026-07-23T20:00:00.000Z";
    const now = Date.parse(start) + 10_000; // 10 s écoulées sur 30 s
    const c = computeCountdown(start, 30, now);
    expect(c.secondsLeft).toBe(20);
    expect(c.remainingRatio).toBeCloseTo(20 / 30);
    expect(c.elapsedRatio).toBeCloseTo(10 / 30);
    expect(c.expired).toBe(false);
  });

  it("borne à zéro une fois le temps écoulé", () => {
    const start = "2026-07-23T20:00:00.000Z";
    const now = Date.parse(start) + 45_000; // au-delà des 30 s
    const c = computeCountdown(start, 30, now);
    expect(c.secondsLeft).toBe(0);
    expect(c.msLeft).toBe(0);
    expect(c.remainingRatio).toBe(0);
    expect(c.expired).toBe(true);
  });

  it("startedAt absent → chrono plein, non expiré (pas de barre trompeuse)", () => {
    const c = computeCountdown(null, 30, Date.now());
    expect(c.secondsLeft).toBe(30);
    expect(c.remainingRatio).toBe(1);
    expect(c.expired).toBe(false);
  });

  it("startedAt illisible → repli plein sans NaN", () => {
    const c = computeCountdown("pas une date", 20, Date.now());
    expect(Number.isNaN(c.secondsLeft)).toBe(false);
    expect(c.remainingRatio).toBe(1);
    expect(c.expired).toBe(false);
  });

  it("timeLimit nul → aucune division par zéro", () => {
    const c = computeCountdown("2026-07-23T20:00:00.000Z", 0, Date.now());
    expect(c.secondsLeft).toBe(0);
    expect(Number.isNaN(c.remainingRatio)).toBe(false);
    expect(c.expired).toBe(false);
  });
});

function dist(
  over: Array<Partial<EventDistributionEntry>>,
): EventDistributionEntry[] {
  return over.map((o, i) => ({
    optionId: o.optionId ?? `opt-${i}`,
    label: o.label ?? `Option ${i}`,
    position: o.position ?? i,
    votes: o.votes ?? 0,
  }));
}

describe("computeDistribution", () => {
  it("calcule les pourcentages et repère le maximum", () => {
    const d = computeDistribution(
      dist([
        { optionId: "a", votes: 3, position: 0 },
        { optionId: "b", votes: 1, position: 1 },
      ]),
    );
    expect(d.totalVotes).toBe(4);
    expect(d.bars[0].percent).toBe(75);
    expect(d.bars[0].isTop).toBe(true);
    expect(d.bars[1].percent).toBe(25);
    expect(d.bars[1].isTop).toBe(false);
  });

  it("total nul → tous à 0 %, aucun top, pas de NaN", () => {
    const d = computeDistribution(
      dist([{ optionId: "a", votes: 0 }, { optionId: "b", votes: 0 }]),
    );
    expect(d.totalVotes).toBe(0);
    expect(d.bars.every((b) => b.percent === 0)).toBe(true);
    expect(d.bars.every((b) => b.isTop === false)).toBe(true);
  });

  it("répartition null → aucune barre", () => {
    const d = computeDistribution(null);
    expect(d.bars).toHaveLength(0);
    expect(d.totalVotes).toBe(0);
  });

  it("trie par position quel que soit l'ordre d'entrée", () => {
    const d = computeDistribution(
      dist([
        { optionId: "b", votes: 1, position: 2 },
        { optionId: "a", votes: 1, position: 0 },
      ]),
    );
    expect(d.bars.map((b) => b.optionId)).toEqual(["a", "b"]);
  });

  it("ex æquo au sommet → toutes les options en tête marquées", () => {
    const d = computeDistribution(
      dist([{ optionId: "a", votes: 2 }, { optionId: "b", votes: 2 }]),
    );
    expect(d.bars.every((b) => b.isTop)).toBe(true);
  });
});

function board(
  over: Array<Partial<EventLeaderboardEntry>>,
): EventLeaderboardEntry[] {
  return over.map((o, i) => ({
    pseudo: o.pseudo ?? `J${i}`,
    avatar: o.avatar ?? "renard",
    score: o.score ?? 0,
    rank: o.rank ?? i + 1,
  }));
}

describe("sortLeaderboard", () => {
  it("trie par rang croissant", () => {
    const sorted = sortLeaderboard(
      board([
        { pseudo: "C", rank: 3 },
        { pseudo: "A", rank: 1 },
        { pseudo: "B", rank: 2 },
      ]),
    );
    expect(sorted.map((e) => e.pseudo)).toEqual(["A", "B", "C"]);
  });

  it("départage un rang égal par score décroissant", () => {
    const sorted = sortLeaderboard(
      board([
        { pseudo: "A", rank: 1, score: 10 },
        { pseudo: "B", rank: 1, score: 30 },
      ]),
    );
    expect(sorted[0].pseudo).toBe("B");
  });

  it("n'altère pas la liste d'entrée", () => {
    const input = board([{ pseudo: "B", rank: 2 }, { pseudo: "A", rank: 1 }]);
    const snapshot = input.map((e) => e.pseudo);
    sortLeaderboard(input);
    expect(input.map((e) => e.pseudo)).toEqual(snapshot);
  });
});

describe("podiumEntries", () => {
  it("renvoie au plus trois entrées, triées", () => {
    const podium = podiumEntries(
      board([
        { pseudo: "D", rank: 4 },
        { pseudo: "A", rank: 1 },
        { pseudo: "C", rank: 3 },
        { pseudo: "B", rank: 2 },
      ]),
    );
    expect(podium.map((e) => e.pseudo)).toEqual(["A", "B", "C"]);
  });
});

describe("eventQuestionTypeMeta", () => {
  it("donne un libellé, un indice et un emoji par type", () => {
    expect(eventQuestionTypeMeta("quiz").label).toBe("Quiz");
    expect(eventQuestionTypeMeta("poll").label).toBe("Sondage");
    expect(eventQuestionTypeMeta("prono").label).toBe("Pronostic");
    expect(eventQuestionTypeMeta("quiz").hint.length).toBeGreaterThan(0);
  });
});

type EtatModeration = "active" | "hidden" | "banned";
/** Élargit un littéral au type du champ : sans quoi TS fige la ligne sur sa
 *  valeur de départ et refuse toute transition dans le tableau d'entrée. */
const etat = (v: EtatModeration): EtatModeration => v;

describe("appliquerModerationLocale", () => {
  const joueurs: Array<{
    id: string;
    pseudo: string;
    moderationState: "active" | "hidden" | "banned";
  }> = [
    { id: "a", pseudo: "Alice", moderationState: "active" },
    { id: "b", pseudo: "Bob", moderationState: "active" },
  ];

  it("montre AUSSITÔT l'état que le serveur vient d'accepter", () => {
    // Le défaut, sans ce recouvrement : l'animateur bannit un pseudo obscène
    // devant l'assistance, le joueur quitte l'écran de salle, et sa ligne
    // affiche toujours « Masquer / Bannir » — il reclique, cette fois sur
    // « Masquer », et REMPLACE le bannissement par un simple masquage.
    const vue = appliquerModerationLocale(joueurs, { b: "banned" });
    expect(vue.map((j) => j.moderationState)).toEqual(["active", "banned"]);
  });

  it("ne touche à rien sans modération en attente", () => {
    expect(appliquerModerationLocale(joueurs, {})).toEqual(joueurs);
  });

  it("préserve les champs que la modération ne touche pas", () => {
    // PRÉMISSE CORRIGÉE. Cette assertion exigeait que le pseudo survive à un
    // masquage — ce qui encodait l'incomplétude de la première version. La
    // base, elle, remplace le pseudo et remet le score à zéro
    // (`moderate_event_player`) : le recouvrement local doit en faire autant,
    // et c'est l'objet du test « efface le pseudo modéré » ci-dessous.
    // Ce qui reste vrai, et qui était la vraie intention : la modération ne
    // détruit pas l'identité de la ligne ni les champs qui lui sont étrangers.
    const [alice, bob] = appliquerModerationLocale(joueurs, { b: "hidden" });
    expect(bob.id).toBe("b");
    expect(alice).toEqual(joueurs[0]);
  });

  it("rend la ligne INCHANGÉE quand le serveur porte déjà la valeur", () => {
    // Ce n'est pas de l'esthétique : rendre un nouvel objet à chaque tic de
    // polling (2,5 s) ferait clignoter la liste toute la soirée.
    const vue = appliquerModerationLocale(joueurs, { a: "active" });
    expect(vue[0]).toBe(joueurs[0]);
  });

  it("ignore une entrée qui ne désigne aucun joueur de la liste", () => {
    // Un joueur peut disparaître de la liste serveur entre deux gestes.
    expect(appliquerModerationLocale(joueurs, { zzz: "banned" })).toEqual(joueurs);
  });

  it("efface le pseudo modéré, parce que c'est LE geste du bouton", () => {
    // ROUGE SI le recouvrement ne recopie que `moderationState`.
    //
    // C'était le cas de la première version, et elle manquait exactement le
    // scénario qui justifie ce bouton : l'animateur bannit un pseudo obscène
    // et continue de le lire sur sa télécommande, alors que l'écran de salle
    // l'a déjà retiré.
    const vue = appliquerModerationLocale(
      [{ id: "a", pseudo: "InsulteGrossière", moderationState: etat("active"), score: 42 }],
      { a: "banned" },
    );
    expect(vue[0].pseudo).toBe(PSEUDO_MODERE);
    expect(vue[0].score).toBe(0);
  });

  it("NE restaure PAS le pseudo à la réactivation — asymétrie voulue", () => {
    // Le serveur seul détient `moderation_original_pseudo`. Le coût de cette
    // asymétrie est de lire « Joueur modéré » quelques secondes de trop ; le
    // coût inverse serait d'afficher un pseudo obscène devant une salle.
    const vue = appliquerModerationLocale(
      [{ id: "a", pseudo: PSEUDO_MODERE, moderationState: etat("banned"), score: 0 }],
      { a: "active" },
    );
    expect(vue[0].moderationState).toBe("active");
    expect(vue[0].pseudo).toBe(PSEUDO_MODERE);
  });

  it("ne fabrique pas un champ que la liste n'avait pas", () => {
    // Un appelant qui ne porte ni pseudo ni score garde le comportement
    // d'origine — le recouvrement n'invente rien.
    const vue = appliquerModerationLocale(
      [{ id: "a", moderationState: etat("active") }],
      { a: "hidden" },
    );
    expect(vue[0]).toEqual({ id: "a", moderationState: "hidden" });
  });

  it("GARDE — le pseudo de remplacement est CELUI que la base écrit", () => {
    // Une valeur recopiée que rien ne confronte à sa source finit fausse.
    // On relit la migration qui définit `moderate_event_player` — catalogue
    // vivant : `grep -l` doit rendre UN seul fichier.
    const migrations = readdirSync("supabase/migrations").filter((f) =>
      readFileSync(`supabase/migrations/${f}`, "utf8").includes(
        "function public.moderate_event_player",
      ),
    );
    expect(migrations, "catalogue vivant : une seule définition attendue").toHaveLength(1);

    const sql = readFileSync(`supabase/migrations/${migrations[0]}`, "utf8");
    expect(
      sql,
      `la base n'écrit plus « ${PSEUDO_MODERE} » : le recouvrement local a divergé`,
    ).toContain(`pseudo = '${PSEUDO_MODERE}'`);
  });
});
