import { describe, expect, it } from "vitest";

import { construireVerification } from "@/components/dashboard/atelier-verification-state";
import { verificationQuiz } from "@/lib/activation/quiz";
import {
  verificationCalendrier,
  type CaseVerification,
} from "@/lib/activation/calendar";
import { construireVerificationChasse } from "@/lib/activation/hunts";
import { construireVerificationFidelite } from "@/lib/activation/loyalty";
import { construireActivationJackpot } from "@/lib/activation/jackpot";
import { construireActivationEvent } from "@/lib/activation/events";
import { construireVerificationContest } from "@/lib/activation/pronostics";

import type { ControleBrut, ModuleChecklist } from "@/lib/checklist/controles";
import {
  statutTuile,
  tuilesDuModule,
  TUILES_PAR_MODULE,
  TUILES_ROUE,
  type TuileChecklist,
} from "@/lib/checklist/tuiles";

const MAINTENANT = new Date("2026-08-07T12:00:00.000Z");

/**
 * TOUS LES CONTRÔLES QU'UN MODULE PEUT ÉMETTRE, réellement produits par lui.
 *
 * L'exhaustivité ne se déclare pas : elle se PROUVE. Une liste de clés recopiée
 * à la main dans ce fichier resterait verte le jour où un module en ajoute une,
 * et la tuile correspondante afficherait « complet » sur un point rouge que
 * personne n'aurait rattaché. Ces entrées appellent donc les vrais calculs
 * d'activation, avec des états choisis pour déclencher chaque branche
 * conditionnelle, et le test compare l'union obtenue à la table des tuiles.
 */
const CONTROLES_REELS: Record<ModuleChecklist, ControleBrut[][]> = {
  roue: [
    construireVerification({
      campaignId: "camp-1",
      gameType: "wheel",
      skillConfig: null,
      prizes: [
        { is_active: true, is_losing: false, weight: 30, stock: null },
        { is_active: true, is_losing: true, weight: 70, stock: null },
      ],
      qrExistant: true,
      campagne: { status: "draft", starts_at: null, ends_at: null },
      now: MAINTENANT,
    }).controles,
    // Une mécanique d'adresse ajoute le contrôle `defi`, absent d'une roue.
    construireVerification({
      campaignId: "camp-1",
      gameType: "rps",
      skillConfig: null,
      prizes: [],
      qrExistant: false,
      campagne: { status: "draft", starts_at: null, ends_at: null },
      now: MAINTENANT,
    }).controles,
  ],

  quiz: [
    verificationQuiz({
      rewardMode: "none",
      rewardLabel: "",
      rewardStock: 0,
      rewardClaimedCount: 0,
      targetWheelId: null,
      drawState: "pending",
      questionCount: 3,
      roueCible: null,
    }).controles,
    // Stock épuisé : le quiz s'ouvre, mais n'émet plus rien.
    verificationQuiz({
      rewardMode: "instant",
      rewardLabel: "Un café offert",
      rewardStock: 5,
      rewardClaimedCount: 5,
      targetWheelId: null,
      drawState: "pending",
      questionCount: 3,
      roueCible: null,
    }).controles,
    // Roue offerte supprimée.
    verificationQuiz({
      rewardMode: "instant",
      rewardLabel: "",
      rewardStock: 5,
      rewardClaimedCount: 0,
      targetWheelId: "w1",
      drawState: "pending",
      questionCount: 3,
      roueCible: null,
    }).controles,
    // Roue offerte présente mais muette + mode à tirage différé.
    verificationQuiz({
      rewardMode: "draw",
      rewardLabel: "",
      rewardStock: 5,
      rewardClaimedCount: 0,
      targetWheelId: "w1",
      drawState: "pending",
      questionCount: 3,
      roueCible: { nom: "La roue", probleme: "nothing_drawable" },
    }).controles,
  ],

  calendrier: [
    // Grille entièrement vide : cases-vides ET aucun-gain.
    verificationCalendrier({
      dayCount: 2,
      cases: [caseMessage(1, ""), caseMessage(2, "   ")],
      completionRewardLabel: "",
      completionRewardStock: 0,
    }).controles,
    // Case lot en pause, roue muette, cadeau d'assiduité sans stock.
    verificationCalendrier({
      dayCount: 2,
      cases: [caseLot(1, 0), caseRoue(2)],
      completionRewardLabel: "Un magnum",
      completionRewardStock: 0,
    }).controles,
  ],

  chasse: [
    construireVerificationChasse({
      huntId: "h1",
      rewardLabel: "Un dessert offert",
      rewardStock: null,
      rewardClaimedCount: 0,
      stepCount: 3,
      endsAt: null,
      now: MAINTENANT,
    }).controles,
  ],

  fidelite: [
    construireVerificationFidelite({
      programId: "p1",
      paliers: [
        {
          id: "ms-1",
          visitCount: 10,
          rewardType: "spin",
          rewardLabel: "Un tour offert",
          rewardStock: 0,
          targetWheelId: null,
        },
      ],
      roues: [],
    }).controles,
  ],

  jackpot: [
    construireActivationJackpot({
      draw_mode: "threshold_draw",
      threshold: 50,
      draw_at: null,
      reward_stock: 3,
      reward_label: "Un magnum de champagne",
      status: "draft",
      validation_mode: "rotating_code",
      public_slug: "la-cagnotte",
      code_ttl_days: 30,
      now: MAINTENANT,
    }).controles,
  ],

  evenement: [
    construireActivationEvent({
      nombreQuestions: 5,
      status: "active",
      salles: [
        {
          label: "Soirée du 12 juillet",
          joinCode: "ABCD12",
          rewardLabel: "Une tournée offerte",
          rewardStock: 3,
          codeTtlDays: 30,
        },
      ],
    }).controles,
  ],

  pronostics: [
    construireVerificationContest({
      contestId: "c1",
      autoCompetition: false,
      nbMatchs: 3,
      nbQuestions: 2,
      echeances: ["2026-09-01T18:00:00.000Z", null],
      nbRecompenses: 2,
      tiebreakerQuestion: "Combien de buts au total ?",
      tiebreakerAnswer: 42,
      collectEmail: true,
      collectPhone: false,
      now: MAINTENANT,
    }).controles,
  ],
};

function caseMessage(dayIndex: number, texte: string): CaseVerification {
  return {
    day_index: dayIndex,
    content_type: "content",
    reward_stock: null,
    reward_label: "",
    target_wheel_id: null,
    content_text: texte,
  };
}

function caseLot(dayIndex: number, stock: number | null): CaseVerification {
  return {
    day_index: dayIndex,
    content_type: "lot",
    reward_stock: stock,
    reward_label: "Un café offert",
    target_wheel_id: null,
    content_text: null,
  };
}

function caseRoue(dayIndex: number): CaseVerification {
  return {
    day_index: dayIndex,
    content_type: "spin",
    reward_stock: null,
    reward_label: "",
    target_wheel_id: "w1",
    content_text: null,
    // Roue supprimée : le tour offert ne mènerait nulle part.
    roue: null,
  };
}

/**
 * CE QU'ON ASSUME DE NE PAS RATTACHER.
 *
 * Vide, et ce n'est pas un hasard : chaque contrôle produit aujourd'hui a une
 * tuile. Toute clé ajoutée ici devra porter la raison pour laquelle un
 * commerçant n'a aucun bloc où la corriger.
 */
const EXCLUSIONS: Partial<Record<ModuleChecklist, readonly string[]>> = {};

const MODULES = Object.keys(TUILES_PAR_MODULE) as ModuleChecklist[];

describe("la table des tuiles couvre exactement les contrôles réels", () => {
  it.each(MODULES)(
    "%s : tout contrôle émis est rattaché, toute clé rattachée est émise",
    (module) => {
      const emis = new Set(
        CONTROLES_REELS[module].flat().map((c) => c.cle),
      );
      const rattaches = new Set(
        TUILES_PAR_MODULE[module].flatMap((t) => t.controles),
      );
      const exclus = new Set(EXCLUSIONS[module] ?? []);

      // Sens 1 — aucun contrôle orphelin : une tuile dirait « complet » sur un
      // point rouge que rien n'affiche.
      expect(
        [...emis].filter((cle) => !rattaches.has(cle) && !exclus.has(cle)),
      ).toEqual([]);

      // Sens 2 — aucune clé fantôme : une clé rattachée qu'aucun module
      // n'émet plus est une règle morte, verte pour toujours.
      expect([...rattaches].filter((cle) => !emis.has(cle))).toEqual([]);
    },
  );

  it("chaque contrôle appartient à UNE seule tuile", () => {
    for (const mod of MODULES) {
      const toutes = TUILES_PAR_MODULE[mod].flatMap((t) => t.controles);
      expect(new Set(toutes).size).toBe(toutes.length);
    }
  });

  it("les clés de tuile sont uniques dans chaque module", () => {
    for (const mod of MODULES) {
      const cles = TUILES_PAR_MODULE[mod].map((t) => t.cle);
      expect(new Set(cles).size).toBe(cles.length);
    }
  });
});

describe("statutTuile", () => {
  const tuile: TuileChecklist = {
    cle: "t",
    titre: "T",
    controles: ["a", "b"],
  };

  it("est « incomplet » dès qu'un contrôle visé est bloquant ET rouge", () => {
    expect(
      statutTuile(tuile, [
        { cle: "a", ok: false, titre: "", detail: "", bloquant: true },
      ]),
    ).toBe("incomplet");
  });

  it("est « attention » sur un contrôle rouge NON bloquant", () => {
    expect(
      statutTuile(tuile, [
        { cle: "a", ok: false, titre: "", detail: "", bloquant: false },
      ]),
    ).toBe("attention");
  });

  it("le bloquant l'emporte : rouge bloquant + rouge non bloquant = incomplet", () => {
    expect(
      statutTuile(tuile, [
        { cle: "a", ok: false, titre: "", detail: "", bloquant: false },
        { cle: "b", ok: false, titre: "", detail: "", bloquant: true },
      ]),
    ).toBe("incomplet");
  });

  it("est « complet » quand tous les contrôles visés sont verts", () => {
    expect(
      statutTuile(tuile, [
        { cle: "a", ok: true, titre: "", detail: "", bloquant: true },
        { cle: "b", ok: true, titre: "", detail: "", bloquant: false },
      ]),
    ).toBe("complet");
  });

  it("ignore les contrôles d'une autre tuile", () => {
    expect(
      statutTuile(tuile, [
        { cle: "z", ok: false, titre: "", detail: "", bloquant: true },
      ]),
    ).toBe("complet");
  });

  it("une tuile sans contrôle est complète — un choix assumé n'est pas un oubli", () => {
    expect(
      statutTuile({ cle: "t", titre: "T", controles: [] }, [
        { cle: "a", ok: false, titre: "", detail: "", bloquant: true },
      ]),
    ).toBe("complet");
  });

  it("une tuile dont les contrôles n'ont pas été émis est complète", () => {
    expect(statutTuile(tuile, [])).toBe("complet");
  });
});

describe("tuilesDuModule", () => {
  it("numérote à partir de 1, dans l'ordre de rendu de la page", () => {
    const rendues = tuilesDuModule("roue", []);
    expect(rendues.map((r) => r.numero)).toEqual(
      TUILES_ROUE.map((_, i) => i + 1),
    );
    expect(rendues.map((r) => r.tuile.cle)).toEqual(
      TUILES_ROUE.map((t) => t.cle),
    );
  });

  it("porte les ancres attendues par la Carte de l'Aventure", () => {
    const ancres = TUILES_ROUE.filter((t) => t.ancre).map((t) => t.ancre);
    expect(ancres).toEqual(["statut", "qr", "suivi", "reglages"]);
  });

  it("applique la table des bloquants : le QR rouge alerte sans rougir", () => {
    const rendues = tuilesDuModule("roue", [
      { cle: "qr", ok: false, titre: "", detail: "" },
      { cle: "poids", ok: false, titre: "", detail: "" },
    ]);
    const statut = (cle: string) =>
      rendues.find((r) => r.tuile.cle === cle)!.statut;

    // Le bug de V1.51 : sans le moindre QR code, cette tuile s'affichait VERTE
    // sous un résumé qui disait « personne ne peut la scanner ».
    expect(statut("qr")).toBe("attention");
    expect(statut("jeux")).toBe("incomplet");
    // Un bloc sans contrôle rattaché ne devient pas orange par contagion.
    expect(statut("prejeu")).toBe("complet");
  });

  it("un championnat rouge de partout alerte sans jamais bloquer", () => {
    const controles = CONTROLES_REELS.pronostics
      .flat()
      .map((c) => ({ ...c, ok: false }));
    const rendues = tuilesDuModule("pronostics", controles);

    expect(rendues.some((r) => r.statut === "incomplet")).toBe(false);
    expect(rendues.find((r) => r.tuile.cle === "atelier")!.statut).toBe(
      "attention",
    );
    // Les blocs sans contrôle rattaché restent verts, même ici.
    expect(rendues.find((r) => r.tuile.cle === "suivi")!.statut).toBe(
      "complet",
    );
  });

  it("les cases vides d'un calendrier alertent, sans empêcher d'ouvrir", () => {
    const rendues = tuilesDuModule("calendrier", [
      {
        cle: "cases-vides",
        ok: false,
        bloquant: false,
        titre: "",
        detail: "",
      },
    ]);
    expect(rendues.find((r) => r.tuile.cle === "atelier")!.statut).toBe(
      "attention",
    );
  });

  it("rend une tuile par bloc, pour les huit modules", () => {
    for (const mod of MODULES) {
      expect(tuilesDuModule(mod, []).length).toBe(
        TUILES_PAR_MODULE[mod].length,
      );
    }
  });
});
