import { describe, expect, it } from "vitest";
import {
  blocageActivationCalendrier,
  CALENDRIER_BLOCAGE_GRILLE,
  CALENDRIER_BLOCAGE_LOT_SANS_LIBELLE,
  CALENDRIER_BLOCAGE_LOT_SANS_STOCK,
  CALENDRIER_BLOCAGE_SANS_CASE,
  CALENDRIER_BLOCAGE_SPIN_SANS_ROUE,
  casesIncompletes,
  verificationCalendrier,
  type CaseVerification,
} from "@/lib/activation/calendar";

function message(dayIndex: number, texte: string): CaseVerification {
  return {
    day_index: dayIndex,
    content_type: "content",
    reward_stock: null,
    reward_label: "",
    target_wheel_id: null,
    content_text: texte,
  };
}

function lot(
  dayIndex: number,
  stock: number | null,
  label = "Un café offert",
): CaseVerification {
  return {
    day_index: dayIndex,
    content_type: "lot",
    reward_stock: stock,
    reward_label: label,
    target_wheel_id: null,
    content_text: null,
  };
}

describe("blocageActivationCalendrier — comportement IDENTIQUE à l'action", () => {
  it("laisse passer une grille complète", () => {
    expect(
      blocageActivationCalendrier(2, [message(1, "Bonjour"), lot(2, 5)]),
    ).toBeNull();
  });

  it("refuse une grille vide, avant même de regarder les cases", () => {
    expect(blocageActivationCalendrier(0, [])).toBe(CALENDRIER_BLOCAGE_GRILLE);
    expect(blocageActivationCalendrier(3, [])).toBe(
      CALENDRIER_BLOCAGE_SANS_CASE,
    );
  });

  it("rend le refus de la PREMIÈRE case fautive, dans l'ordre reçu", () => {
    expect(
      blocageActivationCalendrier(3, [
        message(1, "Bonjour"),
        lot(2, null),
        message(3, "   "),
      ]),
    ).toBe(CALENDRIER_BLOCAGE_LOT_SANS_STOCK);
  });

  it("couvre les TROIS refus de case — ceux qu'un CHECK SQL appuie", () => {
    expect(blocageActivationCalendrier(1, [lot(1, null)])).toBe(
      CALENDRIER_BLOCAGE_LOT_SANS_STOCK,
    );
    expect(blocageActivationCalendrier(1, [lot(1, 3, "  ")])).toBe(
      CALENDRIER_BLOCAGE_LOT_SANS_LIBELLE,
    );
    expect(
      blocageActivationCalendrier(1, [
        { ...message(1, ""), content_type: "spin", content_text: null },
      ]),
    ).toBe(CALENDRIER_BLOCAGE_SPIN_SANS_ROUE);
  });

  it("accepte un stock à ZÉRO — c'est une case en pause, pas un refus", () => {
    expect(blocageActivationCalendrier(1, [lot(1, 0)])).toBeNull();
  });

  it("accepte une case message VIDE — c'est un « perdu », pas un refus", () => {
    expect(blocageActivationCalendrier(1, [message(1, "  ")])).toBeNull();
    expect(
      blocageActivationCalendrier(1, [{ ...message(1, ""), content_text: null }]),
    ).toBeNull();
    // Et une grille entièrement vide s'ouvre : plus rien à garnir pour publier.
    expect(
      blocageActivationCalendrier(3, [message(1, ""), message(2, ""), message(3, "")]),
    ).toBeNull();
  });

  it("rend le day_index quand l'appelant le fournit, null sinon", () => {
    expect(casesIncompletes([lot(7, null)])[0]).toEqual({
      dayIndex: 7,
      message: CALENDRIER_BLOCAGE_LOT_SANS_STOCK,
    });
    // L'ACTION ne sélectionne pas `day_index` : son message ne nomme rien.
    const sansIndex = { ...lot(7, null), day_index: undefined };
    expect(casesIncompletes([sansIndex])[0].dayIndex).toBeNull();
  });
});

describe("verificationCalendrier — l'apport : NOMMER la case", () => {
  const entree = {
    dayCount: 4,
    cases: [
      message(1, "Bonjour"),
      lot(2, null),
      message(3, "  "),
      lot(4, 5),
    ] as CaseVerification[],
    completionRewardLabel: "",
    completionRewardStock: 0,
  };

  it("compte les cases garnies et énumère les fautives", () => {
    const etat = verificationCalendrier(entree);
    // La case 3 est VIDE, plus fautive : elle compte comme garnie (« perdu »).
    expect(etat.garnies).toBe(3);
    const cases = etat.controles.find((c) => c.cle === "cases");
    expect(cases?.ok).toBe(false);
    expect(cases?.casesLiees).toEqual([2]);
    expect(cases?.detail).toContain("case 2");
    expect(etat.toutPret).toBe(false);
  });

  it("est prête quand toutes les cases sont complètes", () => {
    const etat = verificationCalendrier({
      ...entree,
      cases: [message(1, "Bonjour"), lot(2, 5)],
    });
    expect(etat.toutPret).toBe(true);
    expect(etat.garnies).toBe(2);
  });

  // ── Ce que le serveur ne vérifie PAS : jamais bloquant ──

  it("signale les cases lot à stock zéro sans empêcher l'ouverture", () => {
    const etat = verificationCalendrier({
      ...entree,
      cases: [lot(1, 0), lot(2, 0), lot(3, 4)],
    });
    const pause = etat.controles.find((c) => c.cle === "cases-en-pause");
    expect(pause).toMatchObject({ ok: false, bloquant: false });
    expect(pause?.casesLiees).toEqual([1, 2]);
    expect(etat.toutPret).toBe(true);
  });

  it("signale les cases vides sans empêcher l'ouverture", () => {
    const etat = verificationCalendrier({
      ...entree,
      cases: [message(1, ""), lot(2, 4), message(3, "   "), message(4, "Merci")],
    });
    const vides = etat.controles.find((c) => c.cle === "cases-vides");
    expect(vides).toMatchObject({ ok: false, bloquant: false });
    expect(vides?.titre).toBe("2 cases sans rien à gagner");
    expect(vides?.casesLiees).toEqual([1, 3]);
    expect(vides?.detail).toContain("pas de chance");
    // Une seule case vide : le titre reste au singulier.
    const une = verificationCalendrier({
      ...entree,
      cases: [message(1, ""), lot(2, 4)],
    }).controles.find((c) => c.cle === "cases-vides");
    expect(une?.titre).toBe("1 case sans rien à gagner");
    expect(etat.toutPret).toBe(true);
    // Aucune case vide → aucun contrôle.
    expect(
      verificationCalendrier({ ...entree, cases: [lot(1, 4)] }).controles.find(
        (c) => c.cle === "cases-vides",
      ),
    ).toBeUndefined();
  });

  it("alerte quand AUCUNE case ne donne quoi que ce soit, sans bloquer", () => {
    const toutesVides = [message(1, ""), message(2, "   ")];
    const sansCadeau = verificationCalendrier({
      ...entree,
      cases: toutesVides,
      completionRewardLabel: "",
      completionRewardStock: 0,
    });
    const aucun = sansCadeau.controles.find((c) => c.cle === "aucun-gain");
    expect(aucun).toMatchObject({ ok: false, bloquant: false });
    expect(aucun?.titre).toBe("Aucune case ne donne quoi que ce soit");
    expect(aucun?.detail).toContain("personne ne peut rien gagner");
    expect(aucun?.casesLiees).toEqual([1, 2]);
    expect(sansCadeau.toutPret).toBe(true);

    // Un cadeau d'assiduité approvisionné change le propos, pas le verdict.
    const avecCadeau = verificationCalendrier({
      ...entree,
      cases: toutesVides,
      completionRewardLabel: "Un bon de 20 €",
      completionRewardStock: 3,
    }).controles.find((c) => c.cle === "aucun-gain");
    expect(avecCadeau?.detail).toContain("seul le cadeau d'assiduité");

    // Une seule case garnie suffit à retirer l'alerte (mais pas cases-vides).
    const partiel = verificationCalendrier({
      ...entree,
      cases: [message(1, ""), lot(2, 4)],
    });
    expect(partiel.controles.find((c) => c.cle === "aucun-gain")).toBeUndefined();
    expect(partiel.controles.find((c) => c.cle === "cases-vides")).toBeDefined();
  });

  it("signale une roue de case supprimée ou incapable de distribuer", () => {
    const spin = (
      dayIndex: number,
      roue: CaseVerification["roue"],
    ): CaseVerification => ({
      day_index: dayIndex,
      content_type: "spin",
      reward_stock: null,
      reward_label: "",
      target_wheel_id: "w1",
      content_text: null,
      roue,
    });
    const etat = verificationCalendrier({
      ...entree,
      cases: [
        spin(1, null),
        spin(2, { nom: "Roue", probleme: "nothing_drawable" }),
        spin(3, { nom: "Roue", probleme: "none" }),
      ],
    });
    const roues = etat.controles.find((c) => c.cle === "roues");
    expect(roues?.casesLiees).toEqual([1, 2]);
    expect(roues?.bloquant).toBe(false);
    expect(etat.toutPret).toBe(true);
  });

  it("signale un cadeau d'assiduité annoncé mais sans stock", () => {
    const etat = verificationCalendrier({
      ...entree,
      cases: [message(1, "Bonjour")],
      completionRewardLabel: "Un bon de 20 €",
      completionRewardStock: 0,
    });
    const assiduite = etat.controles.find((c) => c.cle === "assiduite");
    expect(assiduite?.detail).toContain("Un bon de 20 €");
    expect(assiduite?.bloquant).toBe(false);
    expect(etat.toutPret).toBe(true);
  });

  it("tronque une énumération de plus de six cases", () => {
    const etat = verificationCalendrier({
      ...entree,
      dayCount: 8,
      cases: Array.from({ length: 8 }, (_, i) => lot(i + 1, null)),
    });
    const cases = etat.controles.find((c) => c.cle === "cases");
    expect(cases?.detail).toContain("+ 2 autres");
  });
});
