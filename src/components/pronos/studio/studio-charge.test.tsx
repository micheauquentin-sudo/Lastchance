// @vitest-environment happy-dom
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * L'action REND un succès : l'enregistrement automatique lit son verdict pour
 * afficher « Modifications enregistrées ». Un `vi.fn()` nu rendrait `undefined`,
 * que `useActionForm` traiterait comme une réponse illisible.
 *
 * La signature est DÉCLARÉE et non déduite : c'est elle qui rend
 * `mock.calls[0][1]` typé en `FormData`, donc les assertions sur la charge utile
 * lisibles sans conversion.
 */
const updateContest = vi.fn<
  (prev: unknown, formData: FormData) => Promise<{ ok: true; data: undefined }>
>(async () => ({ ok: true as const, data: undefined }));

/**
 * TOUTES les actions du module, et c'est nécessaire : ces gardes visitent
 * réellement les huit étapes, donc montent la liste des matchs, l'éditeur de
 * questions, la subsidiaire, le barème, les lots ET les contrôles de statut.
 * Aucune n'est APPELÉE par un rendu, mais toutes doivent exister à l'import.
 */
vi.mock("@/actions/pronostics", () => ({
  updateContest,
  updateContestScoring: vi.fn(),
  updateContestGenericScoring: vi.fn(),
  updateContestRewards: vi.fn(),
  updateContestTiebreaker: vi.fn(),
  updateContestEventSettings: vi.fn(),
  finalizeContest: vi.fn(),
  setContestAwardStatus: vi.fn(),
  deleteContest: vi.fn(),
  addMatch: vi.fn(),
  addContestMatches: vi.fn(),
  addContestQuestion: vi.fn(),
  deleteMatch: vi.fn(),
  setMatchResult: vi.fn(),
  setQuestionResult: vi.fn(),
  syncContest: vi.fn(),
  previewContestRound: vi.fn(),
  importContestRound: vi.fn(),
  importContestSeason: vi.fn(),
}));
// `PlayerHub` monte deux propositions inter-modules ; elles restent muettes
// avec `organizationId={null}`, mais leurs actions doivent exister à l'import.
vi.mock("@/actions/loyalty", () => ({ invitationPasseport: vi.fn() }));
vi.mock("@/actions/jackpot", () => ({ invitationJackpot: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));

const { ContestStudio } = await import("@/components/pronos/contest-studio");

import {
  ETAPES_STUDIO_CONTEST,
  libelleEtapeStudioContest,
} from "@/components/pronos/studio/etapes";
import type { DashboardQuestion } from "@/components/dashboard/contest-questions";
import type { Competition } from "@/lib/competitions";
import type { Contest, ContestMatch } from "@/types/database";

/**
 * LA CHARGE UTILE DU STUDIO DU CHAMPIONNAT EST COMPLÈTE, SUR SES HUIT ÉTAPES.
 *
 * ── LE DÉFAUT QUE CE FICHIER FERME AVANT QU'IL ARRIVE (VIT-43) ──
 *
 * `updateContest` est une mise à jour PARTIELLE, et l'atelier s'en sert avec
 * TROIS formulaires discriminés par des champs cachés. Le studio les fusionne en
 * une seule charge — c'est ce qui rend « Le nom », « L'inscription » et
 * « L'allure » séparables. Mais une étape qu'on quitte est DÉMONTÉE : un champ
 * rendu par l'étape courante disparaîtrait du formulaire, et l'enregistrement
 * automatique suivant écrirait à côté sans un mot.
 *
 * Les deux façons de se tromper ne se ressemblent pas, et les deux sont
 * silencieuses :
 *
 * 1. UN CHAMP QUI MANQUE. `collection_settings` absent ⇒ les deux booléens
 *    d'inscription ne s'enregistrent JAMAIS, l'action lisant `undefined`.
 *    `fond_key` absent ⇒ « suivre le thème » devient inexprimable. Dans les
 *    deux cas l'action répond « Enregistré. » en n'ayant pas écrit.
 * 2. UN CHAMP QUI NE DEVRAIT PAS ÊTRE LÀ. `code_ttl_seconds` rendu sur une durée
 *    que ce formulaire ne sait pas représenter (1 h, posée en SQL) l'ÉCRASERAIT
 *    en 24 h au premier réglage d'apparence — sans qu'aucun clic ait eu lieu.
 *
 * La parade est structurelle : aucun contrôle visible ne porte de `name`, et
 * `ChampsCachesContest` rend la charge EN ENTIER depuis l'état. Ce fichier le
 * vérifie sur le rendu RÉEL de chaque étape, parce que « c'est structurel » est
 * une intention tant qu'aucune garde ne la tient.
 */

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const COMPETITION: Competition = {
  key: "custom",
  label: "Championnat maison",
  sport: "football",
  icon: "⚽",
  kind: "teams",
  drawAllowed: true,
  scoreLabel: "buts",
  entries: [
    { key: "eq-a", name: "Les Bleus", short: "BLU", color: "#123456" },
    { key: "eq-b", name: "Les Verts", short: "VRT", color: "#654321" },
  ],
};

function contestFixture(patch: Partial<Contest> = {}): Contest {
  return {
    id: "contest-1",
    organization_id: "org-1",
    slug: "le-championnat",
    name: "Le championnat du comptoir",
    competition_key: "custom",
    status: "draft",
    scoring: null,
    rewards: null,
    collect_email: true,
    collect_phone: false,
    code_ttl_seconds: null,
    last_synced_at: null,
    last_sync_error: null,
    tiebreaker_question: null,
    tiebreaker_answer: null,
    finalized_at: null,
    event_kind: "football",
    default_locks_at: null,
    theme: "neutre",
    fond_key: null,
    created_at: "2026-01-01T00:00:00.000Z",
    ...patch,
  };
}

const MATCHS: ContestMatch[] = [];
const QUESTIONS: DashboardQuestion[] = [];

/** Les HUIT champs que `updateContest` lit dans le `FormData`. */
const CHAMPS_ATTENDUS = [
  "id",
  "name",
  "collection_settings",
  "collect_email",
  "collect_phone",
  "theme",
  "fond_key",
  "code_ttl_seconds",
];

/**
 * Changer d'étape comme un commerçant le ferait — par le bouton.
 *
 * `fireEvent` et NON `element.click()` : ce dernier n'est pas enveloppé dans
 * `act`, l'état ne bascule donc pas, et ces gardes mesureraient huit fois
 * l'étape d'ouverture. Elles seraient vertes, et aveugles — la panne exacte
 * qu'elles existent pour attraper.
 */
function allerA(cle: (typeof ETAPES_STUDIO_CONTEST)[number]["cle"]) {
  fireEvent.click(
    screen.getByRole("button", { name: libelleEtapeStudioContest(cle) }),
  );
}

function rendre(
  patch: {
    contest?: Partial<Contest>;
    peutEditer?: boolean;
    locked?: boolean;
    baremeAMatiere?: boolean;
  } = {},
) {
  const contest = contestFixture(patch.contest);
  return render(
    <ContestStudio
      contest={contest}
      matchs={MATCHS}
      questions={QUESTIONS}
      questionTypes={["score"]}
      scoring={{ exact: 3, diff: 2, winner: 1 }}
      rewards={[]}
      competition={COMPETITION}
      organisation={{ name: "Le Comptoir", logoUrl: null }}
      icone="⚽"
      sousTitre="⚽ Championnat maison"
      timeZone="Europe/Paris"
      entreeVerification={{
        contestId: contest.id,
        autoCompetition: false,
        nbMatchs: MATCHS.length,
        nbQuestions: QUESTIONS.length,
        echeances: [],
        nbRecompenses: 0,
        tiebreakerQuestion: contest.tiebreaker_question,
        tiebreakerAnswer: contest.tiebreaker_answer,
        collectEmail: contest.collect_email,
        collectPhone: contest.collect_phone,
      }}
      publicUrl={null}
      locked={patch.locked ?? false}
      finalized={contest.finalized_at !== null}
      peutEditer={patch.peutEditer ?? true}
      isFootball
      autoCompetition={false}
      baremeAMatiere={patch.baremeAMatiere ?? true}
    />,
  );
}

/** Les `name` portés par le formulaire des réglages, à l'instant du rendu. */
function nomsDuFormulaire(container: HTMLElement): Set<string | null> {
  const formulaire = container.querySelector("form#studio-contest-reglages")!;
  return new Set(
    [...formulaire.querySelectorAll("[name]")].map((n) =>
      n.getAttribute("name"),
    ),
  );
}

describe("studio championnat — la charge utile ne dépend pas de l'étape ouverte", () => {
  // HUIT, ET LE CHIFFRE EST ÉCRIT. Sans lui, découper une étape en deux — ou en
  // perdre une — laisserait cette suite verte en couvrant une étape de moins :
  // elle est paramétrée PAR la liste qu'elle vérifie.
  it("le studio compte huit étapes", () => {
    expect(ETAPES_STUDIO_CONTEST).toHaveLength(8);
  });

  it.each(ETAPES_STUDIO_CONTEST.map((e) => [e.cle, e.titre] as const))(
    "étape « %s » : le formulaire porte les huit champs de l'action",
    (cle, titre) => {
      const { container } = rendre();
      allerA(cle);

      const noms = nomsDuFormulaire(container);
      for (const champ of CHAMPS_ATTENDUS) {
        expect(
          noms,
          `champ absent sur l'étape « ${titre} » : ${champ}`,
        ).toContain(champ);
      }
    },
  );

  it.each(ETAPES_STUDIO_CONTEST.map((e) => [e.cle] as const))(
    "étape « %s » : le formulaire de réglages ne porte QUE des champs cachés",
    (cle) => {
      // C'est ce qui rend la garde ci-dessus structurelle plutôt que chanceuse.
      // Un contrôle VISIBLE portant un `name` vivrait dans une étape, donc
      // disparaîtrait avec elle — et le prochain enregistrement, automatique,
      // écrirait à côté sans que rien ne le signale.
      //
      // L'assertion vise le formulaire des RÉGLAGES et lui seul : ceux des
      // matchs, des questions, du barème, des lots et du statut ont bien des
      // champs visibles nommés, et c'est normal — ils appartiennent à leurs
      // propres actions, chacune gardée par sa RPC et son motif journalisé.
      const { container } = rendre();
      allerA(cle);

      const formulaire = container.querySelector("form#studio-contest-reglages")!;
      const visibles = [...formulaire.querySelectorAll("[name]")].filter(
        (n) => n.getAttribute("type") !== "hidden",
      );

      expect(visibles.map((n) => n.getAttribute("name"))).toEqual([]);
    },
  );

  it("l'écran héberge bien plusieurs formulaires — sinon la garde suivante ne prouve rien", () => {
    // L'étape des lots apporte les siens : les paliers, la transition de
    // statut. Sans cette assertion, « aucun formulaire imbriqué » serait
    // trivialement vrai sur un écran qui n'en aurait qu'un.
    const { container } = rendre();
    allerA("lots");
    expect(container.querySelectorAll("form").length).toBeGreaterThan(1);
  });

  it.each(ETAPES_STUDIO_CONTEST.map((e) => [e.cle] as const))(
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
    expect(cible).toBe("studio-contest-reglages");
    expect(container.querySelector(`form#${cible}`)).toBeTruthy();
  });
});

/**
 * L'ENREGISTREMENT AUTOMATIQUE, ET CE QU'IL EMPORTE.
 */
describe("studio championnat — l'enregistrement automatique", () => {
  it("OUVRIR le studio n'enregistre RIEN, même après le délai", async () => {
    vi.useFakeTimers();
    try {
      rendre();
      await act(async () => {
        vi.advanceTimersByTime(6000);
      });
      expect(
        updateContest,
        "le simple affichage a écrit en base — sur une action qui règle l'inscription et l'échéance des codes",
      ).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it("changer le nom enregistre TOUT SEUL, et la charge porte tout le reste", async () => {
    vi.useFakeTimers();
    try {
      rendre();
      await act(async () => {
        fireEvent.change(screen.getByLabelText("Nom du championnat"), {
          target: { value: "Le championnat du bar" },
        });
      });
      // Avant le délai, rien n'est parti : partir à chaque frappe rendrait
      // l'écran inutilisable.
      expect(updateContest).not.toHaveBeenCalled();

      await act(async () => {
        vi.advanceTimersByTime(3000);
      });
      expect(updateContest).toHaveBeenCalledTimes(1);

      const charge = updateContest.mock.calls[0][1];
      expect(charge.get("name")).toBe("Le championnat du bar");
      // LES DISCRIMINANTS PARTENT AVEC : sans `collection_settings`, l'action
      // laisserait les deux booléens tranquilles à jamais ; sans `fond_key`,
      // « suivre le thème » serait inexprimable.
      expect(charge.get("collection_settings")).toBe("1");
      expect(charge.get("collect_email")).toBe("on");
      expect(charge.get("collect_phone")).toBe("");
      expect(charge.get("theme")).toBe("neutre");
      expect(charge.get("fond_key")).toBe("");
    } finally {
      vi.useRealTimers();
    }
  });

  it("cocher « Téléphone » depuis son étape emporte le nom et l'apparence", async () => {
    vi.useFakeTimers();
    try {
      rendre();
      allerA("inscription");
      await act(async () => {
        fireEvent.click(screen.getByLabelText("Téléphone"));
      });
      await act(async () => {
        vi.advanceTimersByTime(3000);
      });

      expect(updateContest).toHaveBeenCalledTimes(1);
      const charge = updateContest.mock.calls[0][1];
      expect(charge.get("collect_phone")).toBe("on");
      // UNE CASE DÉCOCHÉE EST UN CHAMP PRÉSENT ET VIDE, jamais un champ absent :
      // absent vaudrait « ne touche pas », et décocher n'aurait aucun effet.
      expect(charge.has("collect_email")).toBe(true);
      // LE NOM, QUI VIT SUR UNE AUTRE ÉTAPE, EST PARTI AVEC. C'est toute la
      // question : `updateContest` n'écrit que ce qu'elle reçoit, mais l'étape
      // qui l'envoie ne doit jamais décider de ce qu'elle contient.
      expect(charge.get("name")).toBe("Le championnat du comptoir");
    } finally {
      vi.useRealTimers();
    }
  });

  it("choisir un thème depuis « L'allure » enregistre le thème ET l'inscription", async () => {
    vi.useFakeTimers();
    try {
      rendre();
      allerA("allure");
      await act(async () => {
        // « Prairie » et non « Football » : la planche des THÈMES et celle des
        // FONDS portent le même nom pour huit des onze entrées, et deux radios
        // homonymes rendent la requête ambiguë. « Prairie » (thème) et
        // « Prairie du trèfle » (fond) ne se confondent pas.
        fireEvent.click(screen.getByRole("radio", { name: "Prairie" }));
      });
      await act(async () => {
        vi.advanceTimersByTime(3000);
      });

      expect(updateContest).toHaveBeenCalledTimes(1);
      const charge = updateContest.mock.calls[0][1];
      expect(charge.get("theme")).toBe("prairie");
      expect(charge.get("collection_settings")).toBe("1");
      expect(charge.get("collect_email")).toBe("on");
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
      expect(updateContest).not.toHaveBeenCalled();
      expect(screen.queryByRole("button", { name: "Enregistrer" })).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });
});

/**
 * LE GEL — LA PIÈCE PROPRE À CE MODULE.
 *
 * Un studio enregistre en CONTINU ; ce championnat, lui, a deux états où
 * l'écriture cesse d'être anodine. `locked` (RPC `contest_is_locked`) veut dire
 * que le jeu a commencé : un premier pronostic est déposé, ou un coup d'envoi
 * est passé, et les corrections réclament alors un MOTIF journalisé de dix
 * caractères. Un débounce l'enverrait au dixième caractère, tronqué au milieu
 * d'une phrase — un motif d'audit incomplet vaut moins que pas de motif.
 * `finalized` veut dire que le classement est DÉFINITIF ; un enregistrement
 * automatique y serait le seul chemin d'écriture restant.
 *
 * Ces gardes vérifient les DEUX faces : plus rien ne part, ET l'écran ne le
 * promet plus. Un studio qui afficherait « Enregistrement automatique » sans le
 * faire serait le défaut d'ADR-153 pris par l'autre bout.
 */
describe("studio championnat — le gel du championnat verrouillé ou clôturé", () => {
  it("VERROUILLÉ : changer le nom n'enregistre RIEN, même après le délai", async () => {
    vi.useFakeTimers();
    try {
      rendre({ locked: true });
      await act(async () => {
        fireEvent.change(screen.getByLabelText("Nom du championnat"), {
          target: { value: "Renommé pendant la saison" },
        });
      });
      await act(async () => {
        vi.advanceTimersByTime(6000);
      });
      expect(
        updateContest,
        "l'automatisme est reparti sur un championnat verrouillé : le motif journalisé qu'exigent les RPC de ce module partirait tronqué",
      ).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it("CLÔTURÉ : rien ne part non plus", async () => {
    vi.useFakeTimers();
    try {
      rendre({ contest: { finalized_at: "2026-02-01T00:00:00.000Z" } });
      await act(async () => {
        fireEvent.change(screen.getByLabelText("Nom du championnat"), {
          target: { value: "Renommé après la clôture" },
        });
      });
      await act(async () => {
        vi.advanceTimersByTime(6000);
      });
      expect(updateContest).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it("VERROUILLÉ : l'écran ne promet plus l'automatisme, et il dit pourquoi", () => {
    rendre({ locked: true });
    // Ni bouton, ni mention d'un enregistrement automatique : la coquille
    // reçoit le MÊME verdict que l'automatisme.
    expect(screen.queryByRole("button", { name: "Enregistrer" })).toBeNull();
    expect(screen.queryByText("Enregistrement automatique")).toBeNull();
    expect(screen.getByText(/Le jeu a commencé/)).toBeTruthy();
    expect(
      screen.getByText(/ne s'enregistrent plus tout seuls ici/),
    ).toBeTruthy();
  });

  it("les champs eux-mêmes sont désactivés — on ne saisit pas dans le vide", () => {
    rendre({ locked: true });
    expect(
      screen.getByLabelText("Nom du championnat").hasAttribute("disabled"),
    ).toBe(true);
  });
});

/**
 * L'ÉCHÉANCE DES CODES : LE SEUL CHAMP CONDITIONNEL DE LA CHARGE.
 *
 * Le CHECK SQL accepte toute durée dès 3 600 s. Une valeur posée par API ou en
 * SQL direct qui n'est pas un multiple exact de 86 400 ne se laisse pas écrire
 * en jours entiers : l'atelier passe alors en lecture seule. Un studio à
 * enregistrement continu qui rendrait quand même le champ caché l'écraserait au
 * premier réglage d'apparence — sans un clic, et sans un mot.
 */
describe("studio championnat — la durée que ce formulaire ne sait pas écrire", () => {
  it("multiple exact de 86 400 : le champ est saisissable et part en secondes", async () => {
    vi.useFakeTimers();
    try {
      rendre({ contest: { code_ttl_seconds: 7 * 86_400 } });
      allerA("inscription");
      const champ = screen.getByLabelText("Validité (jours)");
      expect(champ.getAttribute("value")).toBe("7");

      await act(async () => {
        fireEvent.change(champ, { target: { value: "3" } });
      });
      await act(async () => {
        vi.advanceTimersByTime(3000);
      });
      expect(updateContest.mock.calls[0][1].get("code_ttl_seconds")).toBe(
        String(3 * 86_400),
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it("1 h en base : AUCUN champ `code_ttl_seconds`, sur AUCUNE étape", () => {
    // `formData.has('code_ttl_seconds')` est la seule chose que l'action
    // regarde : champ absent ⇒ colonne intacte. C'est ce qui protège la durée.
    for (const { cle } of ETAPES_STUDIO_CONTEST) {
      const { container, unmount } = rendre({
        contest: { code_ttl_seconds: 3_600 },
      });
      allerA(cle);
      expect(
        container.querySelectorAll('[name="code_ttl_seconds"]'),
        `l'étape « ${cle} » rend le champ sur une durée que le formulaire ne sait pas représenter`,
      ).toHaveLength(0);
      unmount();
    }
  });

  it("1 h en base : l'écran montre la valeur réelle et dit qu'il n'y touche pas", () => {
    rendre({ contest: { code_ttl_seconds: 3_600 } });
    allerA("inscription");
    expect(screen.getByText("1 h")).toBeTruthy();
    expect(screen.queryByLabelText("Validité (jours)")).toBeNull();
  });
});

/**
 * LE BARÈME PEUT N'AVOIR AUCUNE MATIÈRE — et l'étape le DIT.
 *
 * `ContestScoringForm` ne montre que les paliers des types de questions
 * réellement créés. Sur un événement générique encore vide, l'étape n'aurait
 * rien à rendre : un écran blanc au milieu d'un fil de préparation ressemble à
 * une panne. Elle rend une phrase et un chemin de retour — et ce retour est un
 * changement d'ÉTAT, pas une navigation : rien de ce que le commerçant essayait
 * n'est perdu.
 */
describe("studio championnat — le barème sans matière", () => {
  it("sans matière, l'étape renvoie aux questions au lieu d'un écran vide", () => {
    rendre({ baremeAMatiere: false });
    allerA("bareme");
    expect(screen.getByText("Rien à noter pour l'instant")).toBeTruthy();

    fireEvent.click(
      screen.getByRole("button", {
        name: "Revenir à l'étape « Les questions bonus »",
      }),
    );
    // On est bien SUR l'étape des questions : son avertissement est là.
    expect(
      screen.getByRole("button", {
        name: libelleEtapeStudioContest("questions"),
      }).getAttribute("aria-current"),
    ).toBe("step");
  });
});

/**
 * L'EXPLOITATION RESTE AU SUIVI.
 *
 * Saisir un résultat verrouille les pronostics d'un match et recalcule le
 * classement PUBLIC en direct. Ce n'est pas un réglage : c'est un geste qu'on
 * pose sur un championnat qui tourne. Le studio monte les MÊMES cartes que le
 * tableau de bord avec `saisieResultat={false}` — recopier les listes aurait
 * créé deux vérités sur ce qu'est un match.
 */
describe("studio championnat — ce que le studio ne propose pas", () => {
  it("l'étape des matchs garde l'ajout mais perd la saisie de résultat", () => {
    rendre();
    allerA("matchs");
    // L'ajout est bien là : préparer un championnat, c'est composer sa grille.
    expect(screen.getByRole("heading", { name: "Matchs" })).toBeTruthy();
    // La phrase qui promet la saisie de résultat ICI n'y est plus. Le motif est
    // entier : « le suivi du championnat » se dit aussi dans l'aperçu, et une
    // requête plus lâche trouverait les deux.
    expect(
      screen.getByText(
        /Le résultat se saisit après le match, depuis le suivi du championnat/,
      ),
    ).toBeTruthy();
  });

  it("le studio nomme la porte de ce qu'il ne fait pas", () => {
    rendre();
    allerA("lots");
    expect(
      screen.getByRole("link", { name: "Aller au suivi du championnat" }),
    ).toBeTruthy();
  });
});

/**
 * L'EN-TÊTE DE L'APERÇU EST UNE COPIE, ET ELLE EST GARDÉE.
 *
 * Il est recopié de la page publique, où il vit en JSX nu — aucun composant à
 * importer, et sans lui les étapes « Le nom » et « L'allure » n'auraient aucun
 * effet visible dans l'aperçu. Une copie qui diverge est LE défaut de cette
 * famille (ADR-152), et il est invisible : rien ne casse, tout a l'air de
 * fonctionner, et l'écart ne se découvre qu'en ouvrant la vraie page.
 *
 * Cette garde est TEXTUELLE, comme celle de la revalidation : elle compare les
 * classes du conteneur et du titre entre les deux fichiers, et rougit si l'un
 * bouge sans l'autre. Elle ne prouve pas que le rendu est identique — elle
 * prouve que personne n'a changé l'un des deux en silence, ce qui est le
 * mécanisme réel de la divergence.
 */
describe("studio championnat — l'aperçu ne s'écarte pas de la page publique", () => {
  const RACINE = join(__dirname, "..", "..", "..");
  const PUBLIQUE = readFileSync(
    join(RACINE, "app", "(player)", "pronos", "[slug]", "(hub)", "page.tsx"),
    "utf8",
  );
  const APERCU = readFileSync(join(__dirname, "apercu.tsx"), "utf8");

  const COMMUNS = [
    // Le conteneur : `max-w-lg`, la borne que le cadre d'aperçu recopie.
    "mx-auto max-w-lg px-4 py-8 sm:py-12",
    // Le titre du championnat — ce que change l'étape « Le nom ».
    "mt-1 text-3xl font-black text-k-ink leading-tight",
    // Le nom de l'établissement, au-dessus.
    "text-sm font-bold uppercase tracking-wide text-k-body",
    // Le logo, quand il y en a un.
    "mx-auto mb-3 h-16 w-16 rounded-full border-2 border-k-ink object-cover bg-white",
  ];

  it.each(COMMUNS)("« %s » est écrit des deux côtés", (classe) => {
    expect(
      PUBLIQUE.includes(classe),
      "la page publique a changé : l'aperçu la recopie et vient de mentir",
    ).toBe(true);
    expect(
      APERCU.includes(classe),
      "l'aperçu s'est écarté de la page publique",
    ).toBe(true);
  });

  it("le cadre de l'aperçu vaut la borne de la page publique", () => {
    // 512 px = `max-w-lg`. La valeur reste LITTÉRALE : Tailwind ne compile pas
    // une classe construite à l'exécution.
    expect(APERCU).toContain('classeCadre="w-full max-w-[512px]"');
  });

  it("le nom saisi s'affiche dans l'aperçu", () => {
    rendre();
    fireEvent.change(screen.getByLabelText("Nom du championnat"), {
      target: { value: "La coupe du quartier" },
    });
    expect(
      screen.getByRole("heading", { name: "La coupe du quartier", level: 1 }),
    ).toBeTruthy();
  });
});
