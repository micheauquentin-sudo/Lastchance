import { describe, expect, it } from "vitest";

import { vuePartageQuiz, type EtatJoueurQuiz } from "./quiz-partage-etat";

// ════════════════════════════════════════════════════════════
// vuePartageQuiz — LE PARTAGE NE DISPARAÎT JAMAIS DU FAIT DU JEU
//
// Cette décision s'est trompée deux fois, dans les deux sens :
//   1. rendue à tous les états, collée sous la carte de question — elle
//      ressemblait à un bouton de cette question ;
//   2. corrigée en la MASQUANT pendant la partie — le joueur qui voulait faire
//      tourner le quiz au moment où il s'amusait ne trouvait plus rien.
//
// Les deux cas ont ici leur test. Le seul interrupteur reste celui du
// commerçant.
// ════════════════════════════════════════════════════════════

function etat(partiel: Partial<EtatJoueurQuiz> = {}): EtatJoueurQuiz {
  return { shareEnabled: true, aRejoint: false, termine: false, ...partiel };
}

/** Les quatre états de jeu atteignables, partage proposé. */
const ETATS_DE_JEU: ReadonlyArray<{ nom: string; etat: EtatJoueurQuiz }> = [
  { nom: "avant de rejoindre", etat: etat() },
  { nom: "partie en cours", etat: etat({ aRejoint: true }) },
  { nom: "partie terminée", etat: etat({ aRejoint: true, termine: true }) },
  // Reprise de session : le cookie porte une participation close alors que
  // l'écran n'a pas encore rejoué le parcours.
  { nom: "terminée sans rejoindre", etat: etat({ termine: true }) },
];

describe("vuePartageQuiz — la régression de la disparition", () => {
  it("rend TOUJOURS quelque chose quand le commerçant propose le partage", () => {
    for (const { nom, etat: e } of ETATS_DE_JEU) {
      expect(vuePartageQuiz(e), `${nom} : le partage a disparu`).not.toBeNull();
    }
  });

  it("porte un libellé et une accroche non vides dans chaque état", () => {
    for (const { nom, etat: e } of ETATS_DE_JEU) {
      const vue = vuePartageQuiz(e);
      expect(vue?.libelle.trim(), nom).not.toBe("");
      expect(vue?.intro.trim(), nom).not.toBe("");
    }
  });
});

describe("vuePartageQuiz — le placement suit le moment", () => {
  it("passe en PIED DE PAGE pendant la partie, jamais en bloc plein", () => {
    // C'est la correction de la première erreur : présent, mais il ne doit pas
    // disputer l'attention à « Valider ma réponse ».
    const vue = vuePartageQuiz(etat({ aRejoint: true }));
    expect(vue?.variante).toBe("discret");
  });

  it("prend toute la place avant de commencer — c'est l'invitation", () => {
    const vue = vuePartageQuiz(etat());
    expect(vue?.variante).toBe("carte");
    expect(vue?.libelle).toBe("Inviter des amis");
  });

  it("prend toute la place une fois la partie finie — c'est le défi", () => {
    const vue = vuePartageQuiz(etat({ aRejoint: true, termine: true }));
    expect(vue?.variante).toBe("carte");
    expect(vue?.libelle).toBe("Défier un ami");
  });

  it("traite une reprise close comme une partie finie", () => {
    expect(vuePartageQuiz(etat({ termine: true }))?.variante).toBe("carte");
  });

  it("ne propose « Inviter des amis » qu'avant d'avoir rejoint", () => {
    for (const { nom, etat: e } of ETATS_DE_JEU) {
      const vue = vuePartageQuiz(e);
      if (!e.aRejoint && !e.termine) expect(vue?.libelle, nom).toBe("Inviter des amis");
      else expect(vue?.libelle, nom).toBe("Défier un ami");
    }
  });
});

describe("vuePartageQuiz — le seul interrupteur est celui du commerçant", () => {
  it("ne rend rien quand le partage est coupé, quel que soit l'état de jeu", () => {
    for (const { nom, etat: e } of ETATS_DE_JEU) {
      expect(
        vuePartageQuiz({ ...e, shareEnabled: false }),
        `${nom} : le partage coupé reste affiché`,
      ).toBeNull();
    }
  });
});
