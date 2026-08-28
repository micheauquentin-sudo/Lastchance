// @vitest-environment happy-dom
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  PredictionCard,
  formatScorePair,
  scoreInputValue,
} from "@/components/pronos/contest-experience";
import type { ContestPrediction, ContestMatch } from "@/types/database";

/**
 * LE SCORE QUI N'EXISTE PAS NE S'AFFICHE PAS « null »
 * ===================================================
 *
 * `20260801120000_generic_contests.sql` (l. 508-509) a levé le `not null`
 * de `contest_predictions.home_score` / `away_score` : la réponse d'une
 * question générique (choice/ranking/number) vit désormais dans `answer`,
 * et RIEN ne remplit les colonnes de score — aucun trigger, aucun défaut.
 * Le type manuscrit, lui, a continué de promettre `number` jusqu'au
 * 2026-08-05, tout en documentant dans son propre commentaire que la base
 * y met `null`. Un `null` réel voyageait donc dans une valeur déclarée
 * `number`, et ressortait tel quel à l'écran : « null » dans un champ de
 * saisie, « null – null » dans le récapitulatif du pronostic.
 *
 * La seule protection était un aiguillage d'exécution sur `question_type`
 * au point d'appel (`app/pronos/[slug]/page.tsx`) — c'est-à-dire une
 * discipline, pas une garantie. Ce fichier en fait une garantie, sur les
 * trois étages où le mensonge pouvait se rétablir :
 *
 *  1. le TYPE — vérifié deux fois, par le compilateur (témoin `null` plus
 *     bas, rouge dès `npm run typecheck`) et TEXTUELLEMENT ici, pour que
 *     la suite Vitest rougisse aussi ; un contributeur qui « répare » le
 *     type en le renarcissant doit rencontrer un mur, pas un silence ;
 *  2. les RÈGLES d'affichage, pures et testées sans DOM ;
 *  3. le RENDU réel du composant, seul endroit qui prouve que les règles
 *     sont branchées — une garde correcte mais non appelée ne protège
 *     personne.
 *
 * Note sur le contrat de `database.contract.test.ts` : il compare des NOMS
 * de colonnes et le dit lui-même — « une nullabilité qui divergerait
 * passerait inaperçue ». C'est exactement ce qui s'est produit. Ce fichier
 * ferme le cas de `contest_predictions`, pas la classe entière.
 */

// Les actions serveur ne doivent jamais être chargées ici : la carte n'est
// rendue que pour lire, aucun clic n'est simulé.
vi.mock("@/actions/pronostics", () => ({
  confirmContestRecovery: vi.fn(),
  registerContestPlayer: vi.fn(),
  requestContestRecovery: vi.fn(),
  submitContestAnswer: vi.fn(),
  submitPrediction: vi.fn(),
  updateContestPlayer: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
}));

afterEach(cleanup);

// ── 1. Le type dit la vérité ────────────────────────────────────────────

describe("ContestPrediction : les scores sont nullables", () => {
  it("le compilateur accepte null (témoin de type)", () => {
    // Si quelqu'un remet `home_score: number`, CES DEUX LIGNES ne
    // compilent plus : `npm run typecheck` devient rouge.
    const home: ContestPrediction["home_score"] = null;
    const away: ContestPrediction["away_score"] = null;
    expect(home).toBeNull();
    expect(away).toBeNull();
  });

  it("la déclaration manuscrite porte `| null` (garde textuelle)", () => {
    const source = readFileSync(
      join(process.cwd(), "src", "types", "database.ts"),
      "utf8",
    );
    const bloc = source.slice(
      source.indexOf("export interface ContestPrediction {"),
    );
    const corps = bloc.slice(0, bloc.indexOf("\n}"));

    expect(corps).toContain("home_score: number | null;");
    expect(corps).toContain("away_score: number | null;");
  });
});

// ── 2. Les règles d'affichage ───────────────────────────────────────────

describe("formatScorePair", () => {
  it("rend le couple quand les deux scores existent", () => {
    expect(formatScorePair(2, 1)).toBe("2 – 1");
    // 0-0 EST un pronostic : il doit se rendre, pas se taire.
    expect(formatScorePair(0, 0)).toBe("0 – 0");
  });

  it("rend null dès qu'un côté manque — jamais « null », jamais 0", () => {
    for (const [home, away] of [
      [null, null],
      [null, 2],
      [2, null],
      [undefined, undefined],
    ] as const) {
      expect(formatScorePair(home, away)).toBeNull();
    }
  });
});

describe("scoreInputValue", () => {
  it("rend la chaîne vide pour une absence de score", () => {
    expect(scoreInputValue(null)).toBe("");
    expect(scoreInputValue(undefined)).toBe("");
  });

  it("rend le chiffre quand il existe, zéro compris", () => {
    expect(scoreInputValue(0)).toBe("0");
    expect(scoreInputValue(3)).toBe("3");
  });
});

// ── 3. Le rendu réel : les règles sont branchées ────────────────────────

const MATCH: ContestMatch = {
  id: "m1",
  contest_id: "c1",
  organization_id: "o1",
  home_key: "dom",
  home_name: "Domicile",
  home_badge: "D",
  home_color: "",
  away_key: "ext",
  away_name: "Extérieur",
  away_badge: "E",
  away_color: "",
  kickoff_at: "2026-08-01T18:00:00.000Z",
  status: "scheduled",
  home_score: null,
  away_score: null,
  finish_type: "regular",
  home_penalties: null,
  away_penalties: null,
  position: 1,
  round: null,
  external_ref: "",
  question_type: "score",
  prompt: null,
  options: null,
  correct_answer: null,
  locks_at: null,
  ranking_size: null,
  created_at: "2026-07-01T10:00:00.000Z",
};

/** Ce que la base rend pour une question générique : réponse dans
 *  `answer`, scores nuls. */
const PRONO_SANS_SCORE = {
  home_score: null,
  away_score: null,
  points: 3,
};

const RENDU = () => document.body.textContent ?? "";

describe("PredictionCard : un score absent ne s'écrit jamais", () => {
  it("laisse les champs de saisie VIDES, et le bouton DÉSACTIVÉ", () => {
    render(
      <PredictionCard
        slug="test"
        match={MATCH}
        prediction={PRONO_SANS_SCORE}
        scoreLabel="Score"
        timeZone="Europe/Paris"
        locked={false}
      />,
    );

    const saisies = screen.getAllByRole("spinbutton") as HTMLInputElement[];
    expect(saisies).toHaveLength(2);
    for (const champ of saisies) expect(champ.value).toBe("");

    // Le bouton est L'ASSERTION QUI MORD, et l'input n'en est pas une :
    // un `<input type="number">` assainit lui-même une valeur non
    // numérique, si bien qu'un `String(null)` s'y affiche vide malgré
    // tout. L'état React, lui, vaudrait la chaîne « null » — non vide —
    // et le bouton « Valider » (désactivé sur `home === ""`) deviendrait
    // cliquable, prêt à poster un `Number("null")` = NaN.
    // Libellé « Modifier » : une réponse existe déjà (elle vit dans
    // `answer`), c'est bien le score qui manque.
    const valider = screen.getByRole("button", { name: /Modifier|Valider/ });
    expect(valider.hasAttribute("disabled")).toBe(true);
  });

  it("ne rend « null » nulle part, carte verrouillée", () => {
    render(
      <PredictionCard
        slug="test"
        match={MATCH}
        prediction={PRONO_SANS_SCORE}
        scoreLabel="Score"
        timeZone="Europe/Paris"
        locked
      />,
    );

    // Trois formes du même défaut, selon le rendu employé : « null » écrit
    // en toutes lettres (interpolation dans un gabarit), un séparateur
    // orphelin « prono : – » (JSX, où `{null}` ne rend rien du tout), ou
    // un 0-0 inventé. Aucune ne doit apparaître.
    expect(RENDU()).not.toMatch(/null/i);
    expect(RENDU()).not.toMatch(/prono\s*:\s*(–|-)/);
    expect(RENDU()).not.toContain("0 – 0");
    expect(screen.getByText(/Réponse enregistrée/)).toBeDefined();
  });

  it("ne rend « null » nulle part, carte terminée (récap + points)", () => {
    render(
      <PredictionCard
        slug="test"
        match={{ ...MATCH, status: "finished" }}
        prediction={PRONO_SANS_SCORE}
        scoreLabel="Score"
        timeZone="Europe/Paris"
        locked
      />,
    );

    expect(RENDU()).not.toMatch(/null/i);
    expect(RENDU()).not.toMatch(/prono\s*:\s*(–|-)/);
    expect(RENDU()).not.toContain("0 – 0");
    expect(screen.getByText(/Réponse enregistrée/)).toBeDefined();
    // Un match « terminé » sans score ne s'annonce pas « Terminé  – ».
    expect(RENDU()).not.toMatch(/Terminé\s*(–|-)/);
    // Le badge de points reste servi : la garde masque le score, pas le
    // résultat du joueur.
    expect(screen.getByText(/\+3 pts/)).toBeDefined();
  });

  it("le chemin football reste INCHANGÉ : le score s'affiche", () => {
    render(
      <PredictionCard
        slug="test"
        match={{ ...MATCH, status: "finished", home_score: 2, away_score: 1 }}
        prediction={{ home_score: 2, away_score: 1, points: 3 }}
        scoreLabel="Score"
        timeZone="Europe/Paris"
        locked
      />,
    );

    expect(screen.getByText(/Terminé 2 – 1/)).toBeDefined();
    expect(screen.getByText(/Votre prono : 2 – 1/)).toBeDefined();
  });
});
