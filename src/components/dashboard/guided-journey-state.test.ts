import { describe, expect, it } from "vitest";
import {
  getGuidedJourneySnapshot,
  resumeAventure,
  type GuidedJourneyStep,
} from "@/components/dashboard/guided-journey-state";

/** Les cinq étapes du parcours réel : idée → brouillon → répétition → en cours → clôturée. */
const steps: GuidedJourneyStep[] = [
  {
    key: "idea",
    label: "Choisir votre idée",
    description: "Partir d'un modèle adapté à votre commerce.",
    href: "/dashboard/templates",
    status: "complete",
  },
  {
    key: "draft",
    label: "Préparer l'animation",
    description: "Ajoutez les questions et les lots.",
    href: "/dashboard/quiz/demo",
    status: "current",
  },
  {
    key: "rehearsal",
    label: "Faire une répétition",
    description: "Jouez une partie pour tout vérifier avant l'ouverture.",
    href: "/dashboard/quiz/demo",
    status: "upcoming",
  },
  {
    key: "live",
    label: "Ouvrir aux joueurs",
    description: "Affichez le QR et laissez la boutique jouer.",
    href: "/dashboard/quiz/demo",
    status: "upcoming",
  },
  {
    key: "closed",
    label: "Clôturer",
    description: "Remettez les derniers lots et gardez le bilan.",
    href: "/dashboard/quiz/demo",
    status: "upcoming",
  },
];

describe("getGuidedJourneySnapshot", () => {
  it("garde l'ordre métier et propose la première étape non terminée", () => {
    const snapshot = getGuidedJourneySnapshot(steps);

    expect(snapshot).toMatchObject({ total: 5, completed: 1, percentage: 20 });
    expect(snapshot.nextStep?.key).toBe("draft");
  });

  it("ne promet aucune action quand le parcours est terminé", () => {
    const snapshot = getGuidedJourneySnapshot(
      steps.map((step) => ({ ...step, status: "complete" as const })),
    );

    expect(snapshot).toMatchObject({ total: 5, completed: 5, percentage: 100 });
    expect(snapshot.nextStep).toBeNull();
  });

  it("reste stable pour un parcours vide", () => {
    expect(getGuidedJourneySnapshot([])).toEqual({
      total: 0,
      completed: 0,
      percentage: 0,
      nextStep: null,
    });
  });

  it("ne dépasse jamais 100 % si un appelant duplique une étape terminée", () => {
    const snapshot = getGuidedJourneySnapshot([
      ...steps,
      { ...steps[0], key: "idea-copy", status: "complete" },
    ]);

    expect(snapshot.percentage).toBe(33);
  });

  it("ne transforme jamais une étape bloquée en action", () => {
    const snapshot = getGuidedJourneySnapshot([
      {
        ...steps[1],
        status: "blocked",
        href: undefined,
        blockedReason: "Publiez d'abord votre animation.",
      },
      steps[2],
    ]);

    expect(snapshot.nextStep?.key).toBe("rehearsal");
  });

  it("préfère l'étape en cours à une étape suivante déjà cliquable", () => {
    const snapshot = getGuidedJourneySnapshot([steps[3], steps[1]]);

    // L'ordre du tableau ne décide rien : « current » passe avant « upcoming ».
    expect(snapshot.nextStep?.key).toBe("draft");
  });
});

/**
 * LE RÉSUMÉ EST LA SEULE LIGNE LUE QUAND LA CARTE EST REPLIÉE.
 *
 * Elle naît repliée sur les huit pages détail : si cette ligne se trompe de
 * phase, le commerçant lit un état qui n'est pas le sien sans jamais déplier
 * pour s'en apercevoir. D'où les deux cas qui ont motivé la fonction : le
 * parcours entièrement BLOQUÉ (aucune étape suivante, et pourtant rien n'est
 * fini) et le parcours entièrement terminé.
 */
describe("resumeAventure — la carte repliée dit la phase réelle", () => {
  it("nomme la prochaine étape et l'avancement", () => {
    expect(resumeAventure(steps)).toBe(
      "1/5 — prochaine étape : Préparer l'animation",
    );
  });

  it("ne dit jamais « terminé » quand la seule étape restante est bloquée", () => {
    const bloque: GuidedJourneyStep[] = [
      { ...steps[0], status: "complete" },
      {
        ...steps[1],
        status: "blocked",
        href: undefined,
        blockedReason: "Ajoutez au moins une question.",
      },
    ];

    expect(resumeAventure(bloque)).toBe("1/2 — en attente : Préparer l'animation");
  });

  it("reprend le mot de la fin du parent quand tout est terminé", () => {
    const finis = steps.map((step) => ({ ...step, status: "complete" as const }));

    expect(resumeAventure(finis, { message: "Votre animation est clôturée." })).toBe(
      "5/5 — Votre animation est clôturée.",
    );
    expect(resumeAventure(finis)).toBe("5/5 — toutes les étapes sont faites.");
  });

  it("rend une ligne vide sans étape — la carte n'est alors pas montée", () => {
    expect(resumeAventure([])).toBe("");
  });
});
