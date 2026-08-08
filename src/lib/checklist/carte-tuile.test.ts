import { describe, expect, it } from "vitest";

import { carteTuile } from "@/lib/checklist/carte-tuile";
import { tuilesDuModule } from "@/lib/checklist/tuiles";

/**
 * La lecture par clé est ce qui empêche une page détail de devenir une SECONDE
 * table des tuiles. Ce qu'on vérifie ici : elle rend bien le rang et l'ancre de
 * la table (jamais des valeurs recopiées), et une clé inconnue ne fait pas
 * tomber la page — elle dégrade la carte, ce qui est le seul comportement
 * acceptable pour une pastille.
 */
describe("carteTuile", () => {
  const tuilesQuiz = tuilesDuModule("quiz", []);

  it("rend le titre, l'ancre et le RANG de la table", () => {
    expect(carteTuile(tuilesQuiz, "partage")).toEqual({
      titre: "QR code et lien du quiz",
      id: "suivi",
      numero: 2,
      statut: "complet",
    });
  });

  it("laisse `id` absent quand le bloc ne porte pas d'ancre", () => {
    expect(carteTuile(tuilesQuiz, "atelier").id).toBeUndefined();
  });

  it("porte le verdict calculé, pas un statut par défaut", () => {
    const enDefaut = tuilesDuModule("quiz", [
      {
        cle: "questions",
        ok: false,
        bloquant: true,
        titre: "Le quiz a au moins une question",
        detail: "…",
      },
    ]);
    expect(carteTuile(enDefaut, "atelier").statut).toBe("incomplet");
    expect(carteTuile(enDefaut, "statut").statut).toBe("complet");
  });

  it("une clé inconnue rend une carte NUE plutôt que de lever", () => {
    expect(carteTuile(tuilesQuiz, "inexistante")).toEqual({
      titre: "inexistante",
    });
  });

  it("sert les huit modules — le calendrier comme le quiz", () => {
    const tuilesCalendrier = tuilesDuModule("calendrier", []);
    expect(carteTuile(tuilesCalendrier, "relance")).toEqual({
      titre: "Relancer la formule",
      id: "relance",
      numero: 4,
      statut: "complet",
    });
  });
});
