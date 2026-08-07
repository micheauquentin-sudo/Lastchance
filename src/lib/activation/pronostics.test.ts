import { describe, expect, it } from "vitest";
import {
  construireVerificationContest,
  type EntreeVerificationContest,
} from "@/lib/activation/pronostics";

const NOW = new Date("2026-03-01T12:00:00.000Z");

/** Un championnat COMPLET : tous les contrôles au vert. */
function entree(
  patch: Partial<EntreeVerificationContest> = {},
): EntreeVerificationContest {
  return {
    contestId: "c1",
    autoCompetition: false,
    nbMatchs: 3,
    nbQuestions: 2,
    echeances: ["2026-04-01T18:00:00.000Z", null],
    nbRecompenses: 2,
    tiebreakerQuestion: "Combien de buts au total ?",
    tiebreakerAnswer: 42,
    collectEmail: true,
    collectPhone: false,
    now: NOW,
    ...patch,
  };
}

const controle = (e: EntreeVerificationContest, cle: string) => {
  const trouve = construireVerificationContest(e).controles.find(
    (c) => c.cle === cle,
  );
  if (!trouve) throw new Error(`contrôle « ${cle} » absent`);
  return trouve;
};

describe("construireVerificationContest", () => {
  it("rend cinq contrôles, tous verts sur un championnat complet", () => {
    const etat = construireVerificationContest(entree());
    expect(etat.controles).toHaveLength(5);
    expect(etat.controles.every((c) => c.ok)).toBe(true);
    expect(etat.toutPret).toBe(true);
  });

  it("renvoie toujours sur la vue suivi — le seul écran qui publie", () => {
    expect(construireVerificationContest(entree()).ctaHref).toBe(
      "/dashboard/pronostics/c1#statut",
    );
  });

  it("n'écrit rien et ne dépend d'aucune horloge implicite", () => {
    const fige = entree({ echeances: ["2026-03-01T11:59:59.000Z"] });
    expect(controle(fige, "echeances").ok).toBe(false);
    // Même entrée, horloge antérieure : le verdict change, donc `now` est bien
    // le seul paramètre de temps.
    expect(
      controle({ ...fige, now: new Date("2026-01-01T00:00:00.000Z") }, "echeances")
        .ok,
    ).toBe(true);
  });

  describe("matière à pronostiquer", () => {
    it("refuse un championnat sans match ni question", () => {
      const c = controle(entree({ nbMatchs: 0, nbQuestions: 0 }), "matiere");
      expect(c.ok).toBe(false);
      expect(c.detail).toContain("page vide");
      expect(c.etape).toBe("questions");
    });

    it("nomme la synchronisation quand le calendrier est automatique", () => {
      const c = controle(
        entree({ nbMatchs: 0, nbQuestions: 0, autoCompetition: true }),
        "matiere",
      );
      expect(c.ok).toBe(false);
      expect(c.detail).toContain("calendrier synchronisé");
      // Sur un calendrier auto, le geste correcteur est à l'étape des matchs.
      expect(c.etape).toBe("matchs");
    });

    it("accepte une seule question sans aucun match", () => {
      expect(controle(entree({ nbMatchs: 0, nbQuestions: 1 }), "matiere").ok).toBe(
        true,
      );
    });

    it("accepte un seul match sans aucune question", () => {
      expect(controle(entree({ nbMatchs: 1, nbQuestions: 0 }), "matiere").ok).toBe(
        true,
      );
    });
  });

  describe("récompenses", () => {
    it("refuse zéro palier — la clôture n'attribuerait rien", () => {
      const c = controle(entree({ nbRecompenses: 0 }), "recompenses");
      expect(c.ok).toBe(false);
      expect(c.detail).toContain("aucun lot ne sera attribué");
      expect(c.etape).toBe("recompenses");
    });

    it("accepte un seul palier", () => {
      expect(controle(entree({ nbRecompenses: 1 }), "recompenses").ok).toBe(true);
    });
  });

  describe("échéances", () => {
    it("ignore les questions sans échéance", () => {
      expect(controle(entree({ echeances: [null, null] }), "echeances").ok).toBe(
        true,
      );
    });

    it("ignore une date illisible plutôt que de la compter comme passée", () => {
      expect(
        controle(entree({ echeances: ["pas-une-date"] }), "echeances").ok,
      ).toBe(true);
    });

    it("compte les échéances déjà passées et accorde le pluriel", () => {
      const c = controle(
        entree({
          echeances: ["2026-02-01T10:00:00.000Z", "2026-02-02T10:00:00.000Z"],
        }),
        "echeances",
      );
      expect(c.ok).toBe(false);
      expect(c.detail).toContain("2 questions ont");
      expect(c.etape).toBe("questions");
    });

    it("traite l'instant exact de l'échéance comme passé", () => {
      expect(
        controle(entree({ echeances: [NOW.toISOString()] }), "echeances").ok,
      ).toBe(false);
    });
  });

  describe("question subsidiaire", () => {
    it("accepte une question sans réponse — elle se saisit à la clôture", () => {
      const c = controle(entree({ tiebreakerAnswer: null }), "subsidiaire");
      expect(c.ok).toBe(true);
      expect(c.detail).toContain("fin de saison");
    });

    it("accepte l'absence complète de subsidiaire", () => {
      const c = controle(
        entree({ tiebreakerQuestion: null, tiebreakerAnswer: null }),
        "subsidiaire",
      );
      expect(c.ok).toBe(true);
      expect(c.detail).toContain("tirage auditable");
    });

    it("refuse une réponse officielle sans question — elle ne départage personne", () => {
      const c = controle(
        entree({ tiebreakerQuestion: null, tiebreakerAnswer: 12 }),
        "subsidiaire",
      );
      expect(c.ok).toBe(false);
      expect(c.detail).toContain("ne départagera personne");
      expect(c.etape).toBe("questions");
    });

    it("traite une question faite d'espaces comme absente", () => {
      expect(
        controle(
          entree({ tiebreakerQuestion: "   ", tiebreakerAnswer: 12 }),
          "subsidiaire",
        ).ok,
      ).toBe(false);
    });

    it("accepte une réponse à zéro (0 n'est pas « pas de réponse »)", () => {
      const c = controle(entree({ tiebreakerAnswer: 0 }), "subsidiaire");
      expect(c.ok).toBe(true);
      expect(c.detail).toContain("réponse officielle sont enregistrées");
    });
  });

  describe("joindre le gagnant", () => {
    it("refuse un championnat qui ne demande ni email ni téléphone", () => {
      const c = controle(
        entree({ collectEmail: false, collectPhone: false }),
        "contact",
      );
      expect(c.ok).toBe(false);
      expect(c.etape).toBe("championnat");
    });

    it("suffit d'un des deux", () => {
      expect(
        controle(entree({ collectEmail: false, collectPhone: true }), "contact").ok,
      ).toBe(true);
    });

    it("énumère ce qui est demandé quand les deux le sont", () => {
      expect(
        controle(entree({ collectEmail: true, collectPhone: true }), "contact")
          .detail,
      ).toContain("email et téléphone");
    });
  });

  it("toutPret retombe à faux dès qu'un seul contrôle est rouge", () => {
    expect(construireVerificationContest(entree({ nbRecompenses: 0 })).toutPret).toBe(
      false,
    );
  });
});
