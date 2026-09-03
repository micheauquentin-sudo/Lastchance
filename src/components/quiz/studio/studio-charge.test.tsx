// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

// Les actions RENDENT un succès : l'enregistrement automatique lit leur verdict
// pour afficher « Modifications enregistrées ». Un `vi.fn()` nu rendrait
// `undefined`, que `useActionForm` traiterait comme une réponse illisible.
//
// TOUTES les actions du module, et c'est nécessaire : ces gardes visitent
// réellement les huit étapes, donc montent l'éditeur de questions, le
// générateur, les contrôles de statut ET l'aperçu — qui est la vraie carte de
// question. Aucune n'est APPELÉE par un rendu, mais toutes doivent exister à
// l'import.
const updateQuiz = vi.fn(async () => ({ ok: true as const, data: undefined }));
// La signature est DÉCLARÉE et non déduite d'un paramètre inutilisé : c'est
// elle qui rend `mock.calls[0][0]` typé, donc les assertions sur la charge
// utile lisibles sans conversion.
const updateQuizReward = vi.fn<
  (charge: Record<string, unknown>) => Promise<{ ok: true; data: undefined }>
>(async () => ({ ok: true as const, data: undefined }));
vi.mock("@/actions/quiz", () => ({
  updateQuiz,
  updateQuizReward,
  updateQuizShareInvite: vi.fn(),
  setQuizStatus: vi.fn(),
  deleteQuiz: vi.fn(),
  createQuizQuestion: vi.fn(),
  updateQuizQuestion: vi.fn(),
  deleteQuizQuestion: vi.fn(),
  reorderQuizQuestions: vi.fn(),
  drawQuizWinners: vi.fn(),
  genererQuestionsQuiz: vi.fn(),
}));
vi.mock("@/actions/events", () => ({ genererQuestionsEvenement: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));

const { QuizStudio } = await import("@/components/quiz/quiz-studio");

import {
  ETAPES_STUDIO_QUIZ,
  libelleEtapeStudioQuiz,
} from "@/components/quiz/studio/etapes";
import type {
  DashboardQuiz,
  DashboardQuizQuestion,
} from "@/components/dashboard/quiz-editor";

/**
 * LA CHARGE UTILE DU STUDIO DU QUIZ EST COMPLÈTE, SUR SES HUIT ÉTAPES.
 *
 * ── LES DEUX DÉFAUTS QUE CE FICHIER FERME AVANT QU'ILS ARRIVENT (VIT-41) ──
 *
 * 1. `updateQuiz` écrit `intro_text || null` SANS regarder si le champ était
 *    dans le formulaire : un envoi qui ne le rend pas EFFACE la consigne
 *    d'accueil. C'est écrit noir sur blanc dans `atelier-quiz-etapes.ts` — le
 *    nom, le thème et la consigne devaient voyager ENSEMBLE — et c'est la
 *    raison pour laquelle l'atelier n'a jamais eu que quatre étapes.
 *
 *    Découper en huit rouvre ce piège sous sa pire forme : une étape qu'on
 *    quitte est DÉMONTÉE, donc régler le stock depuis « Le lot » effacerait la
 *    consigne écrite dans « L'habillage ». Rien ne le signalerait — l'action
 *    répondrait « Enregistré. » et la page joueur perdrait son texte d'accueil.
 *
 * 2. `updateQuizReward` est INDIVISIBLE : ses sept champs partent en bloc, avec
 *    un `superRefine` qui croise le mode et les champs. « Ce qu'on gagne » et
 *    « Le lot » sont deux VUES d'une seule charge — jamais deux soumissions —
 *    et la garde du bas le vérifie DEPUIS LES DEUX ÉTAPES.
 *
 * La parade est structurelle : aucun contrôle visible ne porte de `name`,
 * `ChampsCachesQuiz` rend la charge d'`updateQuiz` EN ENTIER depuis l'état, et
 * `chargeDotationQuiz` construit celle de la dotation depuis le même état. Ce
 * fichier le vérifie sur le rendu RÉEL de chaque étape, parce que « c'est
 * structurel » est une intention tant qu'aucune garde ne la tient.
 */

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const QUIZ: DashboardQuiz = {
  id: "quiz-1",
  name: "Le quiz du comptoir",
  theme: "neutre",
  status: "draft",
  publicSlug: "mon-quiz",
  introText: "Trois questions, un café à gagner.",
  rewardMode: "threshold",
  rewardThreshold: 8,
  drawTopN: null,
  rewardLabel: "Un café offert",
  rewardDetails: null,
  rewardStock: 20,
  rewardClaimedCount: 0,
  targetWheelId: null,
  drawState: "pending",
  drawnAt: null,
  codeTtlDays: null,
  shareEnabled: true,
};

const QUESTIONS: DashboardQuizQuestion[] = [
  {
    id: "q-1",
    position: 0,
    questionType: "choice",
    preset: "multiple_choice",
    prompt: "Quelle est la capitale du café ?",
    options: [
      { id: "opt_1", label: "Addis-Abeba" },
      { id: "opt_2", label: "Bogotá" },
    ],
    correctAnswer: "opt_1",
    imageUrl: null,
    timeLimitSeconds: null,
    points: 1,
    tolerance: null,
    rankingSize: null,
  },
];

/** Les SIX champs que `updateQuiz` lit dans le `FormData`. */
const CHAMPS_ATTENDUS = [
  "id",
  "name",
  "theme",
  "public_slug",
  "intro_text",
  "code_ttl_days",
];

/** Les SEPT champs qu'`updateQuizReward` écrit en bloc, plus l'identifiant. */
const CHAMPS_DOTATION = [
  "id",
  "rewardMode",
  "rewardThreshold",
  "drawTopN",
  "rewardLabel",
  "rewardDetails",
  "rewardStock",
  "targetWheelId",
];

/**
 * Changer d'étape comme un commerçant le ferait — par le bouton.
 *
 * `fireEvent` et NON `element.click()` : ce dernier n'est pas enveloppé dans
 * `act`, l'état ne bascule donc pas, et ces gardes mesureraient huit fois
 * l'étape d'ouverture. Elles seraient vertes, et aveugles — la panne exacte
 * qu'elles existent pour attraper.
 */
function allerA(cle: (typeof ETAPES_STUDIO_QUIZ)[number]["cle"]) {
  fireEvent.click(
    screen.getByRole("button", { name: libelleEtapeStudioQuiz(cle) }),
  );
}

function rendre(patch: { peutEditer?: boolean } = {}) {
  return render(
    <QuizStudio
      quiz={QUIZ}
      questions={QUESTIONS}
      roues={[]}
      entreeVerification={{
        rewardMode: QUIZ.rewardMode,
        rewardLabel: QUIZ.rewardLabel,
        rewardStock: QUIZ.rewardStock,
        rewardClaimedCount: QUIZ.rewardClaimedCount,
        targetWheelId: QUIZ.targetWheelId,
        drawState: QUIZ.drawState,
        questionCount: QUESTIONS.length,
        roueCible: null,
      }}
      publicUrl={null}
      peutEditer={patch.peutEditer ?? true}
    />,
  );
}

describe("studio quiz — la charge utile ne dépend pas de l'étape ouverte", () => {
  // HUIT, ET LE CHIFFRE EST ÉCRIT. Sans lui, découper une étape en deux — ou en
  // perdre une — laisserait cette suite verte en couvrant une étape de moins :
  // elle est paramétrée PAR la liste qu'elle vérifie.
  it("le studio compte huit étapes", () => {
    expect(ETAPES_STUDIO_QUIZ).toHaveLength(8);
  });

  it.each(ETAPES_STUDIO_QUIZ.map((e) => [e.cle, e.titre] as const))(
    "étape « %s » : le formulaire porte les six champs de l'action",
    (cle, titre) => {
      const { container } = rendre();
      allerA(cle);

      const formulaire = container.querySelector("form#studio-quiz-reglages")!;
      const noms = new Set(
        [...formulaire.querySelectorAll("[name]")].map((n) =>
          n.getAttribute("name"),
        ),
      );
      for (const champ of CHAMPS_ATTENDUS) {
        expect(
          noms,
          `champ absent sur l'étape « ${titre} » : ${champ}`,
        ).toContain(champ);
      }
    },
  );

  it.each(ETAPES_STUDIO_QUIZ.map((e) => [e.cle] as const))(
    "étape « %s » : le formulaire de réglages ne porte QUE des champs cachés",
    (cle) => {
      // C'est ce qui rend la garde ci-dessus structurelle plutôt que chanceuse.
      // Un contrôle VISIBLE portant un `name` vivrait dans une étape, donc
      // disparaîtrait avec elle — et le prochain enregistrement, automatique,
      // effacerait la colonne sans que rien ne le signale.
      //
      // L'assertion vise le formulaire des RÉGLAGES et lui seul : ceux des
      // questions, du partage et du statut ont bien des champs visibles nommés,
      // et c'est normal — ils appartiennent à leurs propres actions.
      const { container } = rendre();
      allerA(cle);

      const formulaire = container.querySelector("form#studio-quiz-reglages")!;
      const visibles = [...formulaire.querySelectorAll("[name]")].filter(
        (n) => n.getAttribute("type") !== "hidden",
      );

      expect(visibles.map((n) => n.getAttribute("name"))).toEqual([]);
    },
  );

  it("l'écran héberge bien plusieurs formulaires — sinon la garde suivante ne prouve rien", () => {
    // L'étape de vérification apporte les siens : publier, archiver, supprimer.
    // Sans cette assertion, « aucun formulaire imbriqué » serait trivialement
    // vrai sur un écran qui n'en aurait qu'un.
    const { container } = rendre();
    allerA("verification");
    expect(container.querySelectorAll("form").length).toBeGreaterThan(1);
  });

  it("l'étape du partage garde son PROPRE formulaire, séparé des réglages", () => {
    // `updateQuizShareInvite` et `updateQuiz` écrivent la même ligne : un champ
    // commun ferait qu'enregistrer les réglages réécrirait le drapeau de
    // partage, selon celui qui poste en dernier.
    const { container } = rendre();
    allerA("partage");
    const partage = screen.getByRole("checkbox", {
      name: /Proposer le partage du quiz/,
    });
    expect(partage.closest("form")?.id).not.toBe("studio-quiz-reglages");
    expect(
      container.querySelector("form#studio-quiz-reglages")!.contains(partage),
    ).toBe(false);
  });

  it.each(ETAPES_STUDIO_QUIZ.map((e) => [e.cle] as const))(
    "étape « %s » : le formulaire de réglages ne CONTIENT aucun autre formulaire",
    (cle) => {
      // Un `<form>` dans un `<form>` fait échouer l'hydratation et tue toute
      // l'interactivité de l'écran — défaut livré en VIT-16.
      const { container } = rendre();
      allerA(cle);
      expect(container.querySelectorAll("form form")).toHaveLength(0);
    },
  );

  it("le bouton Enregistrer vise le formulaire des réglages par son identifiant", () => {
    const { container } = rendre();
    const bouton = screen.getByRole("button", { name: "Enregistrer" });
    const cible = bouton.getAttribute("form");
    expect(cible).toBe("studio-quiz-reglages");
    expect(container.querySelector(`form#${cible}`)).toBeTruthy();
  });
});

/**
 * L'ENREGISTREMENT AUTOMATIQUE DES RÉGLAGES.
 */
describe("studio quiz — l'enregistrement automatique des réglages", () => {
  it("OUVRIR le studio n'enregistre RIEN, même après le délai", async () => {
    vi.useFakeTimers();
    try {
      rendre();
      await act(async () => {
        vi.advanceTimersByTime(6000);
      });
      expect(
        updateQuiz,
        "le simple affichage a écrit en base — sur une action qui efface `intro_text` par absence",
      ).not.toHaveBeenCalled();
      expect(
        updateQuizReward,
        "le simple affichage a réécrit la dotation, que le commerçant n'a pas touchée",
      ).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it("changer un réglage enregistre TOUT SEUL, et n'emporte pas la dotation", async () => {
    vi.useFakeTimers();
    try {
      rendre();
      await act(async () => {
        fireEvent.change(screen.getByLabelText("Nom du quiz"), {
          target: { value: "Le quiz du bar" },
        });
      });
      // Avant le délai, rien n'est parti : partir à chaque frappe rendrait
      // l'écran inutilisable.
      expect(updateQuiz).not.toHaveBeenCalled();

      await act(async () => {
        vi.advanceTimersByTime(3000);
      });
      expect(updateQuiz).toHaveBeenCalled();
      // La dotation n'a pas bougé : la faire repartir à chaque frappe du nom
      // ferait remonter, ailleurs dans l'écran, le refus d'une dotation que
      // personne n'était en train de régler.
      expect(updateQuizReward).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it("sans droit d'édition, rien ne part et le bouton disparaît", async () => {
    vi.useFakeTimers();
    try {
      rendre({ peutEditer: false });
      await act(async () => {
        vi.advanceTimersByTime(6000);
      });
      expect(updateQuiz).not.toHaveBeenCalled();
      expect(updateQuizReward).not.toHaveBeenCalled();
      expect(screen.queryByRole("button", { name: "Enregistrer" })).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });
});

/**
 * LA DOTATION EST INDIVISIBLE, ET LE RESTE APRÈS LE DÉCOUPAGE.
 *
 * `updateQuizRewardSchema` porte un `superRefine` qui croise le mode et les
 * champs (miroir des CHECK SQL). Découper « Ce qu'on gagne » et « Le lot » en
 * deux étapes n'a de sens que si les sept champs partent ENSEMBLE depuis les
 * deux : régler le stock sans renvoyer le mode ferait refuser la mise à jour,
 * ou pire, l'accepter sur un mode qui n'est plus celui affiché.
 */
describe("studio quiz — « Ce qu'on gagne » et « Le lot » sont UNE charge", () => {
  it("depuis « Ce qu'on gagne », le seuil part avec le lot et le stock", async () => {
    vi.useFakeTimers();
    try {
      rendre();
      allerA("gain");
      await act(async () => {
        fireEvent.change(
          screen.getByLabelText("Nombre de bonnes réponses qui donne le lot"),
          { target: { value: "5" } },
        );
      });
      await act(async () => {
        vi.advanceTimersByTime(3000);
      });

      expect(updateQuizReward).toHaveBeenCalledTimes(1);
      const charge = updateQuizReward.mock.calls[0][0];
      for (const champ of CHAMPS_DOTATION) {
        expect(
          Object.keys(charge),
          `champ absent de la charge envoyée depuis « Ce qu'on gagne » : ${champ}`,
        ).toContain(champ);
      }
      expect(charge.rewardThreshold).toBe("5");
      // LE LOT, QUI VIT SUR L'AUTRE ÉTAPE, EST PARTI AVEC : c'est toute la
      // question. Sans lui, le `superRefine` refuserait — ou pire, la ligne
      // serait réécrite avec un libellé vide.
      expect(charge.rewardLabel).toBe("Un café offert");
      expect(charge.rewardStock).toBe("20");
    } finally {
      vi.useRealTimers();
    }
  });

  it("depuis « Le lot », le stock part avec le mode et son seuil", async () => {
    vi.useFakeTimers();
    try {
      rendre();
      allerA("lot");
      await act(async () => {
        fireEvent.change(
          screen.getByLabelText("Stock du lot (obligatoire, fini)"),
          { target: { value: "33" } },
        );
      });
      await act(async () => {
        vi.advanceTimersByTime(3000);
      });

      expect(updateQuizReward).toHaveBeenCalledTimes(1);
      const charge = updateQuizReward.mock.calls[0][0];
      for (const champ of CHAMPS_DOTATION) {
        expect(
          Object.keys(charge),
          `champ absent de la charge envoyée depuis « Le lot » : ${champ}`,
        ).toContain(champ);
      }
      expect(charge.rewardStock).toBe("33");
      // LE MODE ET SON SEUIL, QUI VIVENT SUR L'AUTRE ÉTAPE : sans eux, la
      // dotation partirait sur un mode par défaut, et le `superRefine`
      // refuserait un seuil vide en mode « à partir de X ».
      expect(charge.rewardMode).toBe("threshold");
      expect(charge.rewardThreshold).toBe("8");
    } finally {
      vi.useRealTimers();
    }
  });

  it("« Le lot » rend l'échéance du code SANS son champ caché — c'est le studio qui le porte", () => {
    // `CodeTtlDaysField` pose par défaut un `<input hidden name="code_ttl_days">`
    // dans son propre bloc. Ici il vivrait dans une étape DÉMONTABLE, hors du
    // formulaire de réglages : il ne partirait jamais, et `formData.has()`
    // serait faux à chaque enregistrement — l'échéance deviendrait impossible à
    // régler, en silence. Le studio passe donc `champCache={false}` et le rend
    // lui-même dans `ChampsCachesQuiz`.
    const { container } = rendre();
    allerA("lot");
    const champs = [
      ...container.querySelectorAll('input[name="code_ttl_days"]'),
    ];
    expect(champs).toHaveLength(1);
    expect(champs[0].closest("form")?.id).toBe("studio-quiz-reglages");
  });
});
