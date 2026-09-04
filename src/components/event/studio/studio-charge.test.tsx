// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

// Import de TYPE uniquement : effacé à la compilation, donc invisible au
// hissage de `vi.mock` — les deux charges sont celles que le studio construit.
import type {
  ChargeQuestionSoiree,
  ChargeSalleSoiree,
} from "@/components/event/studio/etat";

/**
 * Les actions RENDENT un succès : l'enregistrement automatique lit leur verdict.
 * Un `vi.fn()` nu rendrait `undefined`, que `useActionForm` traiterait comme une
 * réponse illisible.
 *
 * TOUTES les actions du module, et c'est nécessaire : ces gardes visitent
 * réellement les sept étapes, donc montent l'éditeur de questions, le générateur,
 * les contrôles de statut ET l'aperçu — qui est la vraie page joueur.
 */
const updateEventGame = vi.fn(async () => ({
  ok: true as const,
  data: undefined,
}));
/**
 * Les deux actions à ENTRÉE OBJET déclarent leur paramètre, et ce n'est pas
 * cosmétique : sans lui, `mock.calls` est un tableau de tuples VIDES, et
 * `calls[0][0]` ne compile pas. C'est précisément la charge utile que ces
 * gardes existent pour lire.
 */
type Succes = Promise<{ ok: true; data: undefined }>;
const updateEventQuestion = vi.fn<
  (charge: ChargeQuestionSoiree & { confirmLabelMeaning?: boolean }) => Succes
>(async () => ({ ok: true as const, data: undefined }));
const updateEventSession = vi.fn<(charge: ChargeSalleSoiree) => Succes>(
  async () => ({ ok: true as const, data: undefined }),
);
vi.mock("@/actions/events", () => ({
  updateEventGame,
  updateEventQuestion,
  updateEventSession,
  createEventQuestion: vi.fn(),
  createEventSession: vi.fn(),
  deleteEventGame: vi.fn(),
  deleteEventQuestion: vi.fn(),
  deleteEventSession: vi.fn(),
  setEventGameStatus: vi.fn(),
  genererQuestionsEvenement: vi.fn(),
  getEventState: vi.fn(),
  joinEvent: vi.fn(),
  submitEventAnswer: vi.fn(),
}));
vi.mock("@/actions/quiz", () => ({ genererQuestionsQuiz: vi.fn() }));
vi.mock("@/actions/loyalty", () => ({ invitationPasseport: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));

const { EventStudio } = await import("@/components/event/event-studio");

import {
  ETAPES_STUDIO_SOIREE,
  libelleEtapeStudioSoiree,
} from "@/components/event/studio/etapes";
import type {
  EditorQuestion,
  EditorSession,
} from "@/components/dashboard/event-editor";

/**
 * LA CHARGE UTILE DU STUDIO DE LA SOIRÉE EST COMPLÈTE, SUR SES SEPT ÉTAPES.
 *
 * ── LES DEUX DÉFAUTS QUE CE FICHIER FERME AVANT QU'ILS ARRIVENT (VIT-47) ──
 *
 * 1. `updateEventQuestion` écrit type + intitulé + temps + points + options D'UN
 *    SEUL TENANT. L'étape « Le temps de réponse et les points » ne règle que deux
 *    nombres : si elle ne postait que ceux-là, le type et la BONNE RÉPONSE
 *    partiraient à la trappe. Personne ne relierait « j'ai changé le chrono » à
 *    « mon classement de fin de soirée est faux » — `reveal_event_question` lit
 *    `is_correct` le soir venu, et l'action aurait répondu « enregistré ».
 *
 * 2. `updateEventSession` lit ses champs avec `input.X ?? ""`. Régler
 *    l'étiquette depuis « Les salles » sans renvoyer le reste n'écrit pas
 *    « inchangé » : ça écrit un stock à ZÉRO, c'est-à-dire « podium sans lot »,
 *    en silence, sur une salle qui en avait un.
 *
 * La parade est structurelle : aucun contrôle visible ne porte de `name`, et
 * chaque charge est CONSTRUITE en entier (`studio/etat.ts`). Ce fichier le
 * vérifie sur le rendu RÉEL de chaque étape, parce que « c'est structurel » est
 * une intention tant qu'aucune garde ne la tient.
 */

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const QUESTION: EditorQuestion = {
  id: "q-1",
  position: 1,
  questionType: "quiz",
  prompt: "Quelle équipe a gagné en 2018 ?",
  timeLimitSeconds: 20,
  pointsBase: 1000,
  options: [
    { id: "o-1", label: "La France", isCorrect: true },
    { id: "o-2", label: "La Croatie", isCorrect: false },
  ],
};

const SALLE: EditorSession = {
  id: "s-1",
  label: "Soirée du 12",
  joinCode: "AB12CD",
  publicUrl: "https://exemple.test/event/AB12CD",
  openCount: 3,
  status: "draft",
  rewardLabel: "Une tournée",
  rewardDetails: "Au comptoir",
  rewardStock: 3,
  rewardClaimedCount: 0,
  codeTtlDays: 7,
};

/** Les DEUX champs qu'`updateEventGame` lit dans le `FormData`. */
const CHAMPS_ATTENDUS = ["id", "name"];

/**
 * Changer d'étape comme un commerçant le ferait — par le bouton.
 *
 * `fireEvent` et NON `element.click()` : ce dernier n'est pas enveloppé dans
 * `act`, l'état ne bascule donc pas, et ces gardes mesureraient sept fois
 * l'étape d'ouverture. Elles seraient vertes, et aveugles — la panne exacte
 * qu'elles existent pour attraper.
 */
function allerA(cle: (typeof ETAPES_STUDIO_SOIREE)[number]["cle"]) {
  fireEvent.click(
    screen.getByRole("button", { name: libelleEtapeStudioSoiree(cle) }),
  );
}

function rendre(
  patch: {
    questions?: EditorQuestion[];
    sessions?: EditorSession[];
    peutEditer?: boolean;
  } = {},
) {
  const questions = patch.questions ?? [QUESTION];
  const sessions = patch.sessions ?? [SALLE];
  return render(
    <EventStudio
      gameId="game-1"
      gameName="Le blind test du jeudi"
      status="draft"
      questions={questions}
      sessions={sessions}
      entreeVerification={{
        nombreQuestions: questions.length,
        status: "draft",
        salles: sessions.map((s) => ({
          label: s.label,
          joinCode: s.joinCode,
          rewardLabel: s.rewardLabel,
          rewardStock: s.rewardStock,
          codeTtlDays: s.codeTtlDays,
        })),
      }}
      organizationName="Le Comptoir"
      logoUrl={null}
      hrefJeu={null}
      peutEditer={patch.peutEditer ?? true}
    />,
  );
}

describe("studio soirée — la charge utile ne dépend pas de l'étape ouverte", () => {
  // SEPT, ET LE CHIFFRE EST ÉCRIT. Sans lui, découper une étape en deux — ou en
  // perdre une — laisserait cette suite verte en couvrant une étape de moins :
  // elle est paramétrée PAR la liste qu'elle vérifie.
  it("le studio compte sept étapes", () => {
    expect(ETAPES_STUDIO_SOIREE).toHaveLength(7);
  });

  it.each(ETAPES_STUDIO_SOIREE.map((e) => [e.cle, e.titre] as const))(
    "étape « %s » : le formulaire porte les deux champs de l'action",
    (cle) => {
      const { container } = rendre();
      allerA(cle);

      const formulaire = container.querySelector<HTMLFormElement>(
        "form#studio-soiree-reglages",
      );
      expect(formulaire).not.toBeNull();

      const noms = [
        ...formulaire!.querySelectorAll<HTMLInputElement>("input[name]"),
      ].map((i) => i.name);
      for (const champ of CHAMPS_ATTENDUS) {
        expect(noms).toContain(champ);
      }
    },
  );

  it.each(ETAPES_STUDIO_SOIREE.map((e) => [e.cle] as const))(
    "étape « %s » : aucun contrôle VISIBLE ne porte de `name` de charge utile",
    (cle) => {
      const { container } = rendre();
      allerA(cle);

      /**
       * CE QUE CETTE GARDE MESURE, EXACTEMENT.
       *
       * Un `name` de charge utile porté par un contrôle VISIBLE — celui qu'on
       * saisit — disparaîtrait du formulaire dès qu'on quitte son étape, et
       * l'enregistrement automatique suivant écraserait la colonne.
       *
       * Sont donc EXCLUS, et pour deux raisons différentes :
       *  · les champs cachés du formulaire de réglages, qui sont précisément la
       *    parade (`ChampsCachesSoiree`) ;
       *  · les champs cachés des formulaires VOISINS — ouvrir le jeu, supprimer
       *    une question — qui portent leur propre `id` vers leur propre action.
       *    Ils ne sont pas dans le formulaire de réglages, ils ne peuvent donc
       *    pas amputer sa charge, et ils n'ont jamais été saisis par personne.
       */
      const porteurs = [
        ...container.querySelectorAll<HTMLElement>(
          "input[name], textarea[name], select[name]",
        ),
      ].filter(
        (el) =>
          !(el instanceof HTMLInputElement && el.type === "hidden") &&
          el.closest("form#studio-soiree-reglages") === null,
      );

      const fautifs = porteurs
        .map((el) => el.getAttribute("name") ?? "")
        .filter((nom) => CHAMPS_ATTENDUS.includes(nom));

      expect(fautifs).toEqual([]);
    },
  );
});

describe("studio soirée — « Le temps de réponse » renvoie la question ENTIÈRE", () => {
  it("le type et la bonne réponse survivent à un réglage du chronomètre", async () => {
    rendre();
    allerA("rythme");

    const champ = screen.getByLabelText("Temps de réponse (s)");
    fireEvent.change(champ, { target: { value: "45" } });
    // `focusout` vide la file de `useAutoSaveManuel` sans attendre le délai :
    // c'est le geste réel — on quitte le champ — et il évite un test qui
    // dormirait 1,2 s.
    fireEvent.focusOut(champ);

    await vi.waitFor(() => expect(updateEventQuestion).toHaveBeenCalled());

    const charge = updateEventQuestion.mock.calls[0][0];

    expect(charge.timeLimitSeconds).toBe(45);
    // CE QUI SUIT EST LE CŒUR DE LA GARDE. Une charge amputée aurait laissé le
    // serveur retomber sur un défaut : quiz devenu sondage, bonne réponse
    // effacée, classement de fin de soirée faux — et l'action aurait répondu
    // « enregistré ».
    expect(charge.questionType).toBe("quiz");
    expect(charge.prompt).toBe("Quelle équipe a gagné en 2018 ?");
    expect(charge.pointsBase).toBe(1000);
    expect(charge.options).toEqual([
      { label: "La France", is_correct: true },
      { label: "La Croatie", is_correct: false },
    ]);
  });
});

describe("studio soirée — « Les salles » renvoie la salle ENTIÈRE", () => {
  it("le lot, son stock et l'échéance survivent à un renommage d'étiquette", async () => {
    rendre();
    allerA("salles");

    const champ = screen.getByLabelText("Nom de la salle choisie (facultatif)");
    fireEvent.change(champ, { target: { value: "Soirée du 19" } });
    fireEvent.focusOut(champ);

    await vi.waitFor(() => expect(updateEventSession).toHaveBeenCalled());

    const charge = updateEventSession.mock.calls[0][0];

    expect(charge.label).toBe("Soirée du 19");
    // `updateEventSession` lit `input.rewardStock ?? ""` : une charge sans le
    // stock écrit 0, c'est-à-dire « podium sans lot », en silence.
    expect(charge.rewardStock).toBe("3");
    expect(charge.rewardLabel).toBe("Une tournée");
    expect(charge.rewardDetails).toBe("Au comptoir");
    // Et l'échéance est le champ INVERSE : l'ABSENCE de la clé vaut « ne touche
    // pas », la chaîne vide vaut « sans limite ». Elle doit donc TOUJOURS être
    // rendue, jamais `|| undefined`.
    expect(charge.codeTtlDays).toBe("7");
  });

  it("régler le lot renvoie aussi l'étiquette, depuis l'autre étape", async () => {
    rendre();
    allerA("lot");

    const champ = screen.getByLabelText("Lot");
    fireEvent.change(champ, { target: { value: "Deux tournées" } });
    fireEvent.focusOut(champ);

    await vi.waitFor(() => expect(updateEventSession).toHaveBeenCalled());

    const charge = updateEventSession.mock.calls[0][0];
    expect(charge.rewardLabel).toBe("Deux tournées");
    // Deux VUES, un seul envoi : l'étiquette repart bien qu'elle se règle
    // ailleurs (ADR-156).
    expect(charge.label).toBe("Soirée du 12");
    expect(charge.rewardStock).toBe("3");
  });
});

describe("studio soirée — changer de sélection n'enregistre RIEN", () => {
  const AUTRE: EditorQuestion = {
    ...QUESTION,
    id: "q-2",
    position: 2,
    prompt: "Deuxième manche",
    options: [
      { id: "o-3", label: "Oui", isCorrect: true },
      { id: "o-4", label: "Non", isCorrect: false },
    ],
  };

  it("choisir une autre question ne poste pas", async () => {
    rendre({ questions: [QUESTION, AUTRE] });
    allerA("rythme");

    const selecteur = screen.getByLabelText("Question affichée");
    fireEvent.change(selecteur, { target: { value: "q-2" } });
    fireEvent.focusOut(selecteur);

    // La signature observée est la CARTE des réglages touchés, pas celle de la
    // question ouverte : sans cela, chaque bascule du sélecteur aurait fait
    // partir un enregistrement que personne n'a demandé.
    await Promise.resolve();
    expect(updateEventQuestion).not.toHaveBeenCalled();
  });
});

describe("studio soirée — un rôle qui n'édite pas ne poste jamais", () => {
  it("sans droit d'édition, le champ du nom est gelé", () => {
    rendre({ peutEditer: false });
    expect(
      (screen.getByLabelText("Nom du jeu") as HTMLInputElement).disabled,
    ).toBe(true);
    // Et le bouton « Enregistrer » n'existe même pas : la coquille ne le rend
    // qu'à qui peut écrire, plutôt que de laisser l'action refuser après coup.
    expect(screen.queryByRole("button", { name: "Enregistrer" })).toBeNull();
  });
});
