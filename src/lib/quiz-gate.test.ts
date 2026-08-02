import { describe, expect, it } from "vitest";
import { quizGateReprise } from "@/lib/quiz";

/**
 * LE SAS NE DOIT PLUS PROMETTRE UN TEMPS DÉJÀ CONSOMMÉ.
 *
 * Le joueur atteint une question chronométrée, appuie « Je suis prêt·e »,
 * commence à lire — et son téléphone se verrouille. Il revient, retrouve le
 * MÊME sas, y lit « Vous aurez 30 secondes dès que vous lancez » et « prenez le
 * temps de vous installer », appuie de nouveau, et tombe sur « ⏱ Temps
 * écoulé ». Zéro point, sans seconde chance ; en mode `threshold`, cela peut
 * lui coûter son lot.
 *
 * `start_quiz_question` ne rembobine PAS `started_at`, et c'est délibéré : sans
 * cet invariant, un rechargement offrirait un chronomètre neuf avec l'intitulé
 * déjà lu. Le défaut n'est donc pas la perte de temps — antérieure au retour —
 * mais le texte qui la cachait, alors que `quiz_public_state` servait `status`
 * et `startedAt` depuis toujours sans que personne ne les lise.
 */

const TRENTE = 30;
const T0 = "2026-08-02T10:00:00.000Z";

describe("quizGateReprise", () => {
  it("annonce un temps plein tant que rien n'est lancé", () => {
    expect(
      quizGateReprise({
        status: "pending",
        serverNow: T0,
        startedAt: null,
        timeLimitSeconds: TRENTE,
      }),
    ).toEqual({ kind: "neuve" });
  });

  it("annonce le temps RÉELLEMENT restant d'une question déjà lancée", () => {
    // Lancée il y a 10 s sur une limite de 30 : il en reste 20, pas 30.
    const reprise = quizGateReprise({
      status: "in_progress",
      serverNow: "2026-08-02T10:00:10.000Z",
      startedAt: T0,
      timeLimitSeconds: TRENTE,
    });
    expect(reprise).toEqual({ kind: "en_cours", remainingMs: 20_000 });
    // Le sas ne doit surtout pas retomber sur « neuve » : c'est cette branche
    // exacte qui affichait « Vous aurez 30 secondes ».
    expect(reprise.kind).not.toBe("neuve");
  });

  it("dit que le temps est écoulé plutôt que d'en promettre", () => {
    expect(
      quizGateReprise({
        status: "in_progress",
        serverNow: "2026-08-02T10:00:45.000Z",
        startedAt: T0,
        timeLimitSeconds: TRENTE,
      }),
    ).toEqual({ kind: "expiree" });
  });

  it("traite la limite exacte comme écoulée", () => {
    expect(
      quizGateReprise({
        status: "in_progress",
        serverNow: "2026-08-02T10:00:30.000Z",
        startedAt: T0,
        timeLimitSeconds: TRENTE,
      }),
    ).toEqual({ kind: "expiree" });
  });

  it("ne fabrique pas de décompte sans chronomètre", () => {
    expect(
      quizGateReprise({
        status: "in_progress",
        serverNow: T0,
        startedAt: T0,
        timeLimitSeconds: null,
      }),
    ).toEqual({ kind: "neuve" });
  });

  it("ne fabrique pas de décompte sur des instants illisibles", () => {
    // Horloge serveur absente : on préfère le sas ordinaire à un « il vous
    // reste NaN secondes ».
    expect(
      quizGateReprise({
        status: "in_progress",
        serverNow: null,
        startedAt: T0,
        timeLimitSeconds: TRENTE,
      }),
    ).toEqual({ kind: "neuve" });
  });

  it("ne dit rien d'une question déjà répondue", () => {
    expect(
      quizGateReprise({
        status: "answered",
        serverNow: "2026-08-02T10:00:45.000Z",
        startedAt: T0,
        timeLimitSeconds: TRENTE,
      }),
    ).toEqual({ kind: "neuve" });
  });
});

/**
 * GARDE D'AFFICHAGE — la fonction pure ne sert à rien si le sas ne la lit pas.
 *
 * C'était exactement l'état du défaut : `status` et `startedAt` étaient servis,
 * typés, documentés (« chronomètre déjà lancé ») et jamais consommés.
 */
describe("le sas consomme bien la reprise", () => {
  it("QuestionGate reçoit la reprise et conditionne sa promesse", async () => {
    const { readFileSync } = await import("node:fs");
    const src = readFileSync(
      "src/components/quiz/quiz-experience.tsx",
      "utf8",
    );
    expect(src).toMatch(/reprise=\{quizGateReprise\(\{/);
    expect(src).toMatch(/startedAt: current\.startedAt/);
    expect(src).toMatch(/status: current\.status/);
    // La promesse de temps plein ne doit plus dépendre du seul
    // `timeLimitSeconds` : elle est bornée par « rien n'est encore lancé ».
    expect(src).toMatch(
      /const timed =\s*timeLimitSeconds !== null && reprise\.kind === "neuve";/,
    );
  });
});
