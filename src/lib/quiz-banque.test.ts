import { describe, expect, it } from "vitest";

import {
  BANQUE_QUESTIONS,
  DUREES_PROPOSEES,
  NOMBRE_MAX,
  THEMES_BANQUE,
  compatibleEvenement,
  compteTheme,
  coutSecondes,
  dureeLisible,
  genererQuestions,
  genreDe,
  libelleTheme,
  nombreDeQuestionsPourDuree,
  pointsDe,
  presetDe,
  questionAEcrire,
  questionEvenementAEcrire,
  questionTypeDe,
  secondesDe,
  vivier,
  type GenreBanque,
} from "./quiz-banque";
import {
  QUIZ_PRESET_PATTERN,
  QUIZ_PROMPT_MAX,
  QUIZ_TIME_LIMIT_MAX,
  QUIZ_TIME_LIMIT_MIN,
} from "./quiz";
import { quizPresetInfo } from "@/components/quiz/quiz-presets";
import { createQuizQuestionSchema } from "./validations/quiz";
import { createEventQuestionSchema } from "./validations/events";

const UUID = "11111111-2222-4333-8444-555555555555";
const TOUS_GENRES: GenreBanque[] = ["question", "sondage", "pronostic"];

// ════════════════════════════════════════════════════════════
// Le catalogue — les invariants ÉDITORIAUX
//
// Ils ne testent pas du code, ils testent de la DONNÉE : c'est justement là
// qu'une erreur passerait inaperçue jusqu'au joueur, qui perdrait un point sur
// une réponse juste. Le typage ne peut rien dire de « l'index de la bonne
// réponse dépasse la liste des propositions ».
// ════════════════════════════════════════════════════════════

describe("banque de questions — invariants du catalogue", () => {
  it("porte au moins douze thèmes, tous référencés par des questions", () => {
    expect(THEMES_BANQUE.length).toBeGreaterThanOrEqual(12);
    for (const theme of THEMES_BANQUE) {
      const compte = compteTheme(theme.cle);
      expect(
        compte.question + compte.sondage + compte.pronostic,
        `thème ${theme.cle} vide`,
      ).toBeGreaterThan(0);
    }
  });

  it("n'a aucune question orpheline (thème inconnu du catalogue)", () => {
    const cles = new Set(THEMES_BANQUE.map((t) => t.cle));
    for (const q of BANQUE_QUESTIONS) {
      expect(cles.has(q.theme), `${q.id} → thème ${q.theme}`).toBe(true);
    }
  });

  it("attribue des identifiants uniques", () => {
    const vus = new Set<string>();
    for (const q of BANQUE_QUESTIONS) {
      expect(vus.has(q.id), `identifiant ${q.id} en double`).toBe(false);
      vus.add(q.id);
    }
    expect(vus.size).toBe(BANQUE_QUESTIONS.length);
  });

  it("ne pose jamais deux fois le même intitulé", () => {
    // L'action exclut les questions déjà posées PAR INTITULÉ : un doublon dans
    // la banque rendrait cette exclusion incohérente.
    const vus = new Map<string, string>();
    for (const q of BANQUE_QUESTIONS) {
      const cle = q.prompt.trim().toLowerCase();
      const precedent = vus.get(cle);
      expect(precedent, `« ${q.prompt} » : ${q.id} et ${precedent}`).toBeUndefined();
      vus.set(cle, q.id);
    }
  });

  it("respecte la longueur d'intitulé acceptée en base", () => {
    for (const q of BANQUE_QUESTIONS) {
      expect(q.prompt.trim().length, q.id).toBeGreaterThan(0);
      expect(q.prompt.length, q.id).toBeLessThanOrEqual(QUIZ_PROMPT_MAX);
    }
  });

  it("désigne une bonne réponse qui existe, parmi des propositions distinctes", () => {
    for (const q of BANQUE_QUESTIONS) {
      if (q.forme.type !== "choice") continue;
      expect(q.forme.options.length, q.id).toBeGreaterThanOrEqual(3);
      expect(q.forme.bonne, q.id).toBeGreaterThanOrEqual(0);
      expect(q.forme.bonne, q.id).toBeLessThan(q.forme.options.length);
      const labels = q.forme.options.map((o) => o.trim().toLowerCase());
      expect(new Set(labels).size, `${q.id} : propositions en double`).toBe(
        labels.length,
      );
    }
  });

  it("propose des choix distincts aux sondages et pronostics", () => {
    for (const q of BANQUE_QUESTIONS) {
      if (q.forme.type !== "sondage" && q.forme.type !== "pronostic") continue;
      expect(q.forme.options.length, q.id).toBeGreaterThanOrEqual(2);
      const labels = q.forme.options.map((o) => o.trim().toLowerCase());
      expect(new Set(labels).size, `${q.id} : propositions en double`).toBe(
        labels.length,
      );
    }
  });

  it("liste des formulations libres non vides et distinctes après normalisation", () => {
    // La comparaison SQL replie les accents et ramène la ponctuation à des
    // espaces : deux variantes qui se normalisent pareil sont du bruit.
    const normalise = (v: string) =>
      v
        .toLowerCase()
        .normalize("NFD")
        .replace(/[̀-ͯ]/g, "")
        .replace(/[^a-z0-9]+/g, " ")
        .trim();
    for (const q of BANQUE_QUESTIONS) {
      if (q.forme.type !== "text") continue;
      expect(q.forme.variantes.length, q.id).toBeGreaterThan(0);
      const formes = q.forme.variantes.map(normalise);
      for (const forme of formes) expect(forme, q.id).not.toBe("");
      expect(new Set(formes).size, `${q.id} : variantes équivalentes`).toBe(
        formes.length,
      );
    }
  });

  it("garde des tolérances positives sur les estimations chiffrées", () => {
    for (const q of BANQUE_QUESTIONS) {
      if (q.forme.type !== "number") continue;
      expect(Number.isFinite(q.forme.valeur), q.id).toBe(true);
      expect(q.forme.tolerance, q.id).toBeGreaterThanOrEqual(0);
    }
  });

  it("tient un chronomètre dans les bornes SQL", () => {
    for (const q of BANQUE_QUESTIONS) {
      expect(secondesDe(q), q.id).toBeGreaterThanOrEqual(QUIZ_TIME_LIMIT_MIN);
      expect(secondesDe(q), q.id).toBeLessThanOrEqual(QUIZ_TIME_LIMIT_MAX);
    }
  });

  it("n'utilise que des modèles connus, de forme acceptée par le CHECK SQL", () => {
    for (const q of BANQUE_QUESTIONS) {
      const preset = presetDe(q);
      expect(QUIZ_PRESET_PATTERN.test(preset), preset).toBe(true);
      expect(quizPresetInfo(preset).key, `${q.id} → ${preset}`).toBe(preset);
    }
  });
});

// ════════════════════════════════════════════════════════════
// Nature, points, modèle
// ════════════════════════════════════════════════════════════

describe("nature d'une question", () => {
  it("classe sondage et pronostic hors des questions notées", () => {
    for (const q of BANQUE_QUESTIONS) {
      const attendu =
        q.forme.type === "sondage"
          ? "sondage"
          : q.forme.type === "pronostic"
            ? "pronostic"
            : "question";
      expect(genreDe(q), q.id).toBe(attendu);
    }
  });

  it("ne donne AUCUN point à un avis, et la difficulté aux autres", () => {
    for (const q of BANQUE_QUESTIONS) {
      if (genreDe(q) === "question") expect(pointsDe(q), q.id).toBe(q.difficulte);
      else expect(pointsDe(q), q.id).toBe(0);
    }
  });

  it("marque sondage et pronostic comme modèles SANS vérité", () => {
    for (const q of BANQUE_QUESTIONS) {
      expect(quizPresetInfo(presetDe(q)).sansVerite, q.id).toBe(
        genreDe(q) !== "question",
      );
    }
  });

  it("ramène toute forme à choix sauf nombre et texte", () => {
    for (const q of BANQUE_QUESTIONS) {
      const attendu =
        q.forme.type === "number"
          ? "number"
          : q.forme.type === "text"
            ? "text"
            : "choice";
      expect(questionTypeDe(q), q.id).toBe(attendu);
    }
  });
});

// ════════════════════════════════════════════════════════════
// La charge écrite en base — LE test qui compte
//
// Toute la banque repasse par le schéma RÉEL de création de question. Une
// tolérance sur un type qui n'en accepte pas, une bonne réponse hors options,
// un top N oublié : tout tombe ici, pas devant le joueur.
// ════════════════════════════════════════════════════════════

describe("questionAEcrire — charge acceptée par createQuizQuestionSchema", () => {
  it("valide les 240 et quelques questions de la banque", () => {
    const refus: string[] = [];
    for (const q of BANQUE_QUESTIONS) {
      const charge = questionAEcrire(q);
      const parsed = createQuizQuestionSchema.safeParse({
        quiz_id: UUID,
        question_type: charge.questionType,
        preset: charge.preset,
        prompt: charge.prompt,
        options: charge.options,
        correct_answer: charge.correctAnswer,
        image_url: "",
        time_limit_seconds: charge.timeLimitSeconds,
        points: charge.points,
        tolerance: charge.tolerance ?? "",
        ranking_size: "",
      });
      if (!parsed.success) refus.push(`${q.id}: ${parsed.error.issues[0].message}`);
    }
    expect(refus).toEqual([]);
  });

  it("pose la bonne option d'un choix multiple", () => {
    const q = BANQUE_QUESTIONS.find((x) => x.forme.type === "choice");
    expect(q).toBeDefined();
    if (!q || q.forme.type !== "choice") return;
    const charge = questionAEcrire(q);
    expect(charge.correctAnswer).toEqual({
      type: "choice",
      optionId: `opt_${q.forme.bonne + 1}`,
    });
    expect(charge.options[q.forme.bonne].label).toBe(q.forme.options[q.forme.bonne]);
  });

  it("pose Vrai en premier et Faux en second, quelle que soit la réponse", () => {
    const vrai = BANQUE_QUESTIONS.find(
      (x) => x.forme.type === "vrai_faux" && x.forme.bonne,
    );
    const faux = BANQUE_QUESTIONS.find(
      (x) => x.forme.type === "vrai_faux" && !x.forme.bonne,
    );
    expect(vrai).toBeDefined();
    expect(faux).toBeDefined();
    if (!vrai || !faux) return;
    expect(questionAEcrire(vrai).options.map((o) => o.label)).toEqual([
      "Vrai",
      "Faux",
    ]);
    expect(questionAEcrire(vrai).correctAnswer).toEqual({
      type: "choice",
      optionId: "opt_1",
    });
    expect(questionAEcrire(faux).correctAnswer).toEqual({
      type: "choice",
      optionId: "opt_2",
    });
  });

  it("donne une vérité de FORME, à 0 point, aux sondages", () => {
    const q = BANQUE_QUESTIONS.find((x) => x.forme.type === "sondage");
    expect(q).toBeDefined();
    if (!q) return;
    const charge = questionAEcrire(q);
    expect(charge.preset).toBe("sondage");
    expect(charge.points).toBe(0);
    // La première proposition satisfait `correct_answer not null` — elle n'est
    // jamais affichée au joueur (quizPresetSansVerite).
    expect(charge.correctAnswer).toEqual({ type: "choice", optionId: "opt_1" });
  });

  it("ne transporte une tolérance que pour une estimation chiffrée", () => {
    for (const q of BANQUE_QUESTIONS) {
      const charge = questionAEcrire(q);
      if (q.forme.type === "number") expect(charge.tolerance, q.id).toBeDefined();
      else expect(charge.tolerance, q.id).toBeUndefined();
    }
  });
});

// ════════════════════════════════════════════════════════════
// Le tirage
// ════════════════════════════════════════════════════════════

describe("genererQuestions — nombre demandé", () => {
  it("rend exactement le nombre demandé quand la banque suffit", () => {
    const t = genererQuestions({ mode: { type: "nombre", nombre: 12 }, graine: 7 });
    expect(t.questions.length).toBe(12);
    expect(t.demande).toBe(12);
    expect(t.manquantes).toBe(0);
  });

  it("est DÉTERMINISTE à graine égale, et change de tirage sinon", () => {
    const criteres = { mode: { type: "nombre", nombre: 10 } } as const;
    const a = genererQuestions({ ...criteres, graine: 42 });
    const b = genererQuestions({ ...criteres, graine: 42 });
    const c = genererQuestions({ ...criteres, graine: 43 });
    expect(a.questions.map((q) => q.id)).toEqual(b.questions.map((q) => q.id));
    expect(a.questions.map((q) => q.id)).not.toEqual(c.questions.map((q) => q.id));
  });

  it("ne rend jamais deux fois la même question", () => {
    const t = genererQuestions({
      mode: { type: "nombre", nombre: 60 },
      genres: TOUS_GENRES,
      graine: 3,
    });
    expect(new Set(t.questions.map((q) => q.id)).size).toBe(t.questions.length);
  });

  it("plafonne à NOMBRE_MAX", () => {
    const t = genererQuestions({
      mode: { type: "nombre", nombre: 5000 },
      genres: TOUS_GENRES,
      graine: 1,
    });
    expect(t.demande).toBe(NOMBRE_MAX);
  });

  it("annonce le manque plutôt que de le masquer", () => {
    // Un seul thème ne porte qu'une vingtaine de questions : demander 100 est
    // légitime, et la seule réponse honnête est « il en manque tant ».
    const t = genererQuestions({
      themes: ["animaux"],
      mode: { type: "nombre", nombre: 100 },
      graine: 5,
    });
    expect(t.questions.length).toBeLessThan(100);
    expect(t.manquantes).toBe(100 - t.questions.length);
    expect(t.restantes).toBe(0);
  });
});

describe("genererQuestions — filtres", () => {
  it("ne sort que des thèmes cochés", () => {
    const t = genererQuestions({
      themes: ["cinema", "musique"],
      mode: { type: "nombre", nombre: 20 },
      graine: 9,
    });
    expect(t.questions.length).toBe(20);
    for (const q of t.questions) expect(["cinema", "musique"]).toContain(q.theme);
  });

  it("alterne les thèmes plutôt que de vider le premier", () => {
    const t = genererQuestions({
      themes: ["cinema", "musique", "sport"],
      mode: { type: "nombre", nombre: 9 },
      graine: 11,
    });
    const parTheme = new Map<string, number>();
    for (const q of t.questions) {
      parTheme.set(q.theme, (parTheme.get(q.theme) ?? 0) + 1);
    }
    expect(parTheme.size).toBe(3);
    // Répartition en ronde : trois piles de trois, à une question près.
    for (const compte of parTheme.values()) {
      expect(compte).toBeGreaterThanOrEqual(2);
      expect(compte).toBeLessThanOrEqual(4);
    }
  });

  it("écarte ce que le quiz porte déjà", () => {
    const premier = genererQuestions({
      mode: { type: "nombre", nombre: 10 },
      graine: 2,
    });
    const exclure = premier.questions.map((q) => q.id);
    const second = genererQuestions({
      mode: { type: "nombre", nombre: 10 },
      graine: 2,
      exclure,
    });
    for (const q of second.questions) expect(exclure).not.toContain(q.id);
  });

  it("respecte le plafond de difficulté", () => {
    const t = genererQuestions({
      mode: { type: "nombre", nombre: 30 },
      difficulteMax: 1,
      graine: 4,
    });
    expect(t.questions.length).toBeGreaterThan(0);
    for (const q of t.questions) expect(q.difficulte).toBeLessThanOrEqual(1);
  });

  it("ne sort aucun avis quand seules les questions notées sont demandées", () => {
    const t = genererQuestions({ mode: { type: "nombre", nombre: 40 }, graine: 6 });
    for (const q of t.questions) expect(genreDe(q)).toBe("question");
  });
});

describe("genererQuestions — mélange des natures", () => {
  it("garde les avis minoritaires (un cinquième au plus)", () => {
    const t = genererQuestions({
      mode: { type: "nombre", nombre: 20 },
      genres: TOUS_GENRES,
      graine: 8,
    });
    const avis = t.questions.filter((q) => genreDe(q) !== "question").length;
    expect(t.questions.length).toBe(20);
    expect(avis).toBeGreaterThan(0);
    expect(avis).toBeLessThanOrEqual(4);
  });

  it("n'ouvre jamais sur un avis et n'en enchaîne jamais deux", () => {
    for (let graine = 1; graine <= 12; graine++) {
      const t = genererQuestions({
        mode: { type: "nombre", nombre: 25 },
        genres: TOUS_GENRES,
        graine,
      });
      const natures = t.questions.map((q) => genreDe(q) !== "question");
      expect(natures[0], `graine ${graine}`).toBe(false);
      for (let i = 1; i < natures.length; i++) {
        expect(
          natures[i] && natures[i - 1],
          `graine ${graine}, position ${i}`,
        ).toBe(false);
      }
    }
  });

  it("ne rend que des avis si le commerçant n'a demandé que cela", () => {
    const t = genererQuestions({
      mode: { type: "nombre", nombre: 6 },
      genres: ["sondage"],
      graine: 13,
    });
    expect(t.questions.length).toBe(6);
    for (const q of t.questions) expect(genreDe(q)).toBe("sondage");
  });
});

describe("durée ↔ nombre de questions", () => {
  it("déduit un nombre croissant avec la durée", () => {
    const pool = vivier({ mode: { type: "nombre", nombre: 1 } });
    const comptes = DUREES_PROPOSEES.map((m) => nombreDeQuestionsPourDuree(m, pool));
    for (let i = 1; i < comptes.length; i++) {
      expect(comptes[i]).toBeGreaterThan(comptes[i - 1]);
    }
  });

  it("place une demi-heure de jeu dans une fourchette plausible", () => {
    // Le coût moyen d'une question tourne autour de 30 s : une demi-heure doit
    // donner quelques dizaines de questions, jamais 3 ni 300.
    const pool = vivier({ mode: { type: "nombre", nombre: 1 } });
    const n = nombreDeQuestionsPourDuree(30, pool);
    expect(n).toBeGreaterThanOrEqual(40);
    expect(n).toBeLessThanOrEqual(80);
  });

  it("rend 0 sur un vivier vide ou une durée nulle", () => {
    expect(nombreDeQuestionsPourDuree(30, [])).toBe(0);
    expect(nombreDeQuestionsPourDuree(0, [...BANQUE_QUESTIONS])).toBe(0);
  });

  it("estime une durée cohérente avec le tirage rendu", () => {
    const t = genererQuestions({
      mode: { type: "duree", minutes: 15 },
      graine: 21,
    });
    expect(t.questions.length).toBeGreaterThan(0);
    const attendu = Math.round(
      t.questions.reduce((total, q) => total + coutSecondes(q), 0),
    );
    expect(t.dureeEstimeeSecondes).toBe(attendu);
    // Le compte visé est déduit du coût MOYEN : l'écart au temps demandé reste
    // marginal, jamais du simple au double.
    expect(t.dureeEstimeeSecondes).toBeGreaterThan(15 * 60 * 0.7);
    expect(t.dureeEstimeeSecondes).toBeLessThan(15 * 60 * 1.3);
  });

  it("ne rend jamais une partie vide quand la banque a de quoi", () => {
    for (const minutes of DUREES_PROPOSEES) {
      const t = genererQuestions({ mode: { type: "duree", minutes }, graine: 1 });
      expect(t.questions.length, `${minutes} min`).toBeGreaterThan(0);
    }
  });
});

describe("aides d'affichage", () => {
  it("nomme un thème connu et laisse voir une clé inconnue", () => {
    expect(libelleTheme("cinema")).toBe("Cinéma & séries");
    expect(libelleTheme("inconnu")).toBe("inconnu");
  });

  it("arrondit la durée à la minute, puis à l'heure", () => {
    expect(dureeLisible(0)).toBe("1 min");
    expect(dureeLisible(90)).toBe("2 min");
    expect(dureeLisible(1800)).toBe("30 min");
    expect(dureeLisible(3600)).toBe("1 h");
    expect(dureeLisible(3600 + 300)).toBe("1 h 05");
  });
});

// ════════════════════════════════════════════════════════════
// La même banque, versée dans le Mode événement live
//
// `event_questions` connaît nativement les trois natures (quiz / poll / prono)
// mais N'ACCEPTE QUE des questions à options : on y répond en tapant sur un
// bouton depuis la salle. Ces tests gardent la traduction ET le filtre.
// ════════════════════════════════════════════════════════════

describe("questionEvenementAEcrire — charge acceptée par createEventQuestionSchema", () => {
  it("valide toute la part compatible de la banque", () => {
    const refus: string[] = [];
    for (const q of BANQUE_QUESTIONS) {
      if (!compatibleEvenement(q)) continue;
      const charge = questionEvenementAEcrire(q);
      const parsed = createEventQuestionSchema.safeParse({
        game_id: UUID,
        question_type: charge.questionType,
        prompt: charge.prompt,
        time_limit_seconds: charge.timeLimitSeconds,
        points_base: charge.pointsBase,
        options: charge.options,
      });
      if (!parsed.success) refus.push(`${q.id}: ${parsed.error.issues[0].message}`);
    }
    expect(refus).toEqual([]);
  });

  it("écarte estimations chiffrées et réponses libres, et rien d'autre", () => {
    for (const q of BANQUE_QUESTIONS) {
      const attendu = q.forme.type !== "number" && q.forme.type !== "text";
      expect(compatibleEvenement(q), q.id).toBe(attendu);
    }
    expect(BANQUE_QUESTIONS.filter(compatibleEvenement).length).toBeGreaterThan(150);
  });

  it("traduit les natures vers les trois types du live", () => {
    for (const q of BANQUE_QUESTIONS) {
      if (!compatibleEvenement(q)) continue;
      const attendu =
        q.forme.type === "sondage"
          ? "poll"
          : q.forme.type === "pronostic"
            ? "prono"
            : "quiz";
      expect(questionEvenementAEcrire(q).questionType, q.id).toBe(attendu);
    }
  });

  it("marque exactement une bonne réponse en quiz, aucune en poll et prono", () => {
    for (const q of BANQUE_QUESTIONS) {
      if (!compatibleEvenement(q)) continue;
      const charge = questionEvenementAEcrire(q);
      const justes = charge.options.filter((o) => o.is_correct).length;
      expect(justes, `${q.id} (${charge.questionType})`).toBe(
        charge.questionType === "quiz" ? 1 : 0,
      );
    }
  });

  it("fait rapporter un pronostic mais jamais un sondage", () => {
    const sondage = BANQUE_QUESTIONS.find((q) => q.forme.type === "sondage");
    const prono = BANQUE_QUESTIONS.find((q) => q.forme.type === "pronostic");
    expect(sondage).toBeDefined();
    expect(prono).toBeDefined();
    if (!sondage || !prono) return;
    // Le live sait recevoir la vérité plus tard (l'animateur désigne l'option
    // gagnante au reveal) — le quiz, qui corrige à l'instant, ne le peut pas.
    expect(questionEvenementAEcrire(sondage).pointsBase).toBe(0);
    expect(questionEvenementAEcrire(prono).pointsBase).toBeGreaterThan(0);
  });

  it("refuse de fabriquer une question live incompatible", () => {
    const estimation = BANQUE_QUESTIONS.find((q) => q.forme.type === "number");
    expect(estimation).toBeDefined();
    if (!estimation) return;
    expect(() => questionEvenementAEcrire(estimation)).toThrow(/incompatible/);
  });
});

describe("genererQuestions — vivier du Mode événement", () => {
  it("ne tire que des questions à options", () => {
    const t = genererQuestions({
      mode: { type: "nombre", nombre: 40 },
      genres: TOUS_GENRES,
      pourEvenement: true,
      graine: 17,
    });
    expect(t.questions.length).toBe(40);
    for (const q of t.questions) expect(compatibleEvenement(q), q.id).toBe(true);
  });

  it("applique le plafond, y compris à un nombre déduit d'une durée", () => {
    const parNombre = genererQuestions({
      mode: { type: "nombre", nombre: 90 },
      plafond: 60,
      graine: 1,
    });
    expect(parNombre.demande).toBe(60);

    const parDuree = genererQuestions({
      mode: { type: "duree", minutes: 60 },
      plafond: 20,
      graine: 1,
    });
    expect(parDuree.demande).toBe(20);
    expect(parDuree.questions.length).toBe(20);
  });
});
