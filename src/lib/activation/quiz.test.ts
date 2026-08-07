import { describe, expect, it } from "vitest";
import {
  blocageActivationQuiz,
  QUIZ_BLOCAGE_LOT,
  QUIZ_BLOCAGE_QUESTIONS,
  QUIZ_BLOCAGE_STOCK,
  verificationQuiz,
  type EntreeVerificationQuiz,
} from "@/lib/activation/quiz";

const complet = {
  reward_mode: "instant",
  reward_label: "Un café offert",
  target_wheel_id: null,
  reward_stock: 10,
  questionCount: 3,
};

describe("blocageActivationQuiz — comportement IDENTIQUE à l'action d'origine", () => {
  it("laisse passer un quiz complet", () => {
    expect(blocageActivationQuiz(complet)).toBeNull();
  });

  it("exige au moins une question, AVANT tout contrôle de dotation", () => {
    // L'ordre compte : un quiz sans question ET sans lot doit parler de la
    // question, comme le faisait la fonction privée.
    expect(
      blocageActivationQuiz({
        ...complet,
        questionCount: 0,
        reward_label: "",
        reward_stock: 0,
      }),
    ).toBe(QUIZ_BLOCAGE_QUESTIONS);
  });

  it("exige un libellé de lot OU une roue dès qu'un mode émet", () => {
    expect(blocageActivationQuiz({ ...complet, reward_label: "   " })).toBe(
      QUIZ_BLOCAGE_LOT,
    );
    expect(
      blocageActivationQuiz({
        ...complet,
        reward_label: "",
        target_wheel_id: "w1",
      }),
    ).toBeNull();
  });

  it("exige un stock d'au moins 1 dès qu'un mode émet", () => {
    expect(blocageActivationQuiz({ ...complet, reward_stock: 0 })).toBe(
      QUIZ_BLOCAGE_STOCK,
    );
  });

  it("ne vérifie NI libellé NI stock quand le quiz est sans gain", () => {
    expect(
      blocageActivationQuiz({
        ...complet,
        reward_mode: "none",
        reward_label: "",
        reward_stock: 0,
      }),
    ).toBeNull();
  });
});

const base: EntreeVerificationQuiz = {
  rewardMode: "instant",
  rewardLabel: "Un café offert",
  rewardStock: 10,
  rewardClaimedCount: 0,
  targetWheelId: null,
  drawState: "pending",
  questionCount: 3,
  roueCible: null,
};

function controle(entree: EntreeVerificationQuiz, cle: string) {
  return verificationQuiz(entree).controles.find((c) => c.cle === cle);
}

describe("verificationQuiz — la MÊME vérité, avant le clic", () => {
  it("est prête quand le blocage serveur est nul", () => {
    const etat = verificationQuiz(base);
    expect(etat.toutPret).toBe(true);
    expect(blocageActivationQuiz(complet)).toBeNull();
  });

  it("bloque exactement là où l'action bloque, avec son message", () => {
    const sansQuestion = { ...base, questionCount: 0 };
    expect(controle(sansQuestion, "questions")).toMatchObject({
      ok: false,
      bloquant: true,
      detail: QUIZ_BLOCAGE_QUESTIONS,
    });
    expect(verificationQuiz(sansQuestion).toutPret).toBe(false);

    expect(controle({ ...base, rewardLabel: "" }, "lot")).toMatchObject({
      ok: false,
      detail: QUIZ_BLOCAGE_LOT,
    });
    expect(controle({ ...base, rewardStock: 0 }, "stock")).toMatchObject({
      ok: false,
      detail: QUIZ_BLOCAGE_STOCK,
    });
  });

  it("dit qu'un quiz sans gain n'a rien à provisionner", () => {
    const etat = verificationQuiz({ ...base, rewardMode: "none" });
    expect(etat.toutPret).toBe(true);
    expect(etat.controles.map((c) => c.cle)).toEqual(["questions", "dotation"]);
  });

  // ── Ce que le serveur ne vérifie PAS : jamais bloquant ──

  it("signale un stock épuisé SANS empêcher l'ouverture", () => {
    const etat = verificationQuiz({
      ...base,
      rewardStock: 5,
      rewardClaimedCount: 5,
    });
    const alerte = etat.controles.find((c) => c.cle === "stock-epuise");
    expect(alerte).toMatchObject({ ok: false, bloquant: false });
    expect(etat.toutPret).toBe(true);
  });

  it("signale une roue offerte supprimée, et une roue sans lot tirable", () => {
    const supprimee = verificationQuiz({
      ...base,
      targetWheelId: "w1",
      roueCible: null,
    });
    expect(supprimee.controles.find((c) => c.cle === "roue-absente")).toBeTruthy();
    expect(supprimee.toutPret).toBe(true);

    const muette = verificationQuiz({
      ...base,
      targetWheelId: "w1",
      roueCible: { nom: "Roue de Noël", probleme: "nothing_drawable" },
    });
    const controleRoue = muette.controles.find((c) => c.cle === "roue-tirable");
    expect(controleRoue?.titre).toContain("Roue de Noël");
    expect(controleRoue?.bloquant).toBe(false);
  });

  it("rappelle le tirage à déclencher sur les seuls modes différés", () => {
    expect(controle({ ...base, rewardMode: "draw" }, "tirage")).toBeTruthy();
    expect(
      controle({ ...base, rewardMode: "draw", drawState: "done" }, "tirage"),
    ).toBeUndefined();
    expect(controle(base, "tirage")).toBeUndefined();
  });

  it("renvoie chaque point corrigeable vers son étape d'atelier", () => {
    for (const c of verificationQuiz({
      ...base,
      questionCount: 0,
      rewardLabel: "",
      rewardStock: 0,
    }).controles) {
      if (!c.ok) expect(c.etape).toBeTruthy();
    }
  });
});
