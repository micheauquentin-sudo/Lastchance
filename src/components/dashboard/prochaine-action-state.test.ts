import { describe, expect, it } from "vitest";

import type { OnboardingStep } from "@/components/dashboard/onboarding-checklist";
import {
  conseilsRecouvertsParHero,
  construireProchaineAction,
  tachesRecouvertesParHero,
  type EntreeProchaineAction,
} from "@/components/dashboard/prochaine-action-state";
import type { CompteursCentreAnimation } from "@/lib/centre-animation-server";
import { estReserveAuProprietaire } from "@/lib/liens-proprietaire";

const RIEN_A_FAIRE: CompteursCentreAnimation = {
  drafts: 0,
  qrToTest: 0,
  liveExperiences: 2,
  lowStockPrizes: 0,
  rewardsToHandOver: 0,
  teamTasks: 0,
};

/** Démarrage terminé : le hero passe aux signaux opérationnels. */
const DEMARRAGE_FINI: OnboardingStep[] = [
  { key: "campaign", label: "Créer votre première campagne", href: "/dashboard/campaigns", done: true },
  { key: "qr", label: "Générer un QR code", href: "/dashboard/qr-codes", done: true },
];

const entree = (
  surcharge: Partial<EntreeProchaineAction> = {},
): EntreeProchaineAction => ({
  role: "owner",
  etapesDemarrage: DEMARRAGE_FINI,
  compteurs: RIEN_A_FAIRE,
  ...surcharge,
});

describe("construireProchaineAction — une seule réponse, dans l'ordre", () => {
  it("le démarrage incomplet passe AVANT tout : le hero DEVIENT la checklist", () => {
    const action = construireProchaineAction(
      entree({
        etapesDemarrage: [
          { key: "campaign", label: "Créer votre première campagne", href: "/dashboard/campaigns", done: true },
          { key: "prize", label: "Configurer au moins un lot", href: "/dashboard/campaigns", done: false },
          { key: "qr", label: "Générer un QR code", href: "/dashboard/qr-codes", done: false },
        ],
        // …même avec un signal opérationnel allumé.
        compteurs: { ...RIEN_A_FAIRE, rewardsToHandOver: 4 },
      }),
    );

    expect(action.kind).toBe("demarrage");
    expect(action.titre).toBe("Pour bien démarrer");
    expect(action.progression).toEqual({ faites: 1, total: 3 });
    expect(action.cta?.label).toBe("Configurer au moins un lot");
    // Les étapes suivantes sont proposées en second plan, jamais la courante.
    expect(action.restantes?.map((e) => e.key)).toEqual(["qr"]);
  });

  it("démarrage terminé + gains en attente : la caisse, pas le registre", () => {
    const action = construireProchaineAction(
      entree({ compteurs: { ...RIEN_A_FAIRE, rewardsToHandOver: 3 } }),
    );

    expect(action.key).toBe("gains");
    expect(action.titre).toBe("3 gains à remettre");
    // La caisse est l'écran qui REMET le lot ; le registre ne fait que lister.
    expect(action.cta?.href).toBe("/dashboard/redeem");
  });

  it("accorde le singulier au compte de 1", () => {
    expect(
      construireProchaineAction(
        entree({ compteurs: { ...RIEN_A_FAIRE, rewardsToHandOver: 1 } }),
      ).titre,
    ).toBe("1 gain à remettre");
  });

  it("respecte l'ordre gains > stock > brouillons > QR > rien d'ouvert", () => {
    const complet: CompteursCentreAnimation = {
      drafts: 2,
      qrToTest: 5,
      liveExperiences: 0,
      lowStockPrizes: 1,
      rewardsToHandOver: 3,
      teamTasks: 0,
    };
    const cle = (c: Partial<CompteursCentreAnimation>) =>
      construireProchaineAction(entree({ compteurs: { ...complet, ...c } })).key;

    expect(cle({})).toBe("gains");
    expect(cle({ rewardsToHandOver: 0 })).toBe("stock");
    expect(cle({ rewardsToHandOver: 0, lowStockPrizes: 0 })).toBe("brouillons");
    expect(cle({ rewardsToHandOver: 0, lowStockPrizes: 0, drafts: 0 })).toBe("qr");
    expect(
      cle({ rewardsToHandOver: 0, lowStockPrizes: 0, drafts: 0, qrToTest: 0 }),
    ).toBe("rien-ouvert");
  });

  it("rien à signaler : le hero le DIT, et renvoie aux résultats", () => {
    const action = construireProchaineAction(entree());
    expect(action.kind).toBe("tout-roule");
    expect(action.cta?.href).toBe("#vos-resultats");
  });

  it("sans Centre d'animation (RPC indisponible), il ne prétend rien savoir", () => {
    const action = construireProchaineAction(entree({ compteurs: null }));
    expect(action.kind).toBe("tout-roule");
  });
});

describe("aucun lien mort, jamais", () => {
  it("écarte une étape de démarrage que le rôle ne peut pas ouvrir", () => {
    // « Ajouter votre logo » mène à /dashboard/settings, réservé au
    // propriétaire : pour l'éditeur, le hero passe à l'étape suivante plutôt
    // que de lui proposer un bouton qui le renverrait d'où il vient.
    const etapes: OnboardingStep[] = [
      { key: "logo", label: "Ajouter votre logo", href: "/dashboard/settings", done: false, ownerOnly: true },
      { key: "qr", label: "Générer un QR code", href: "/dashboard/qr-codes", done: false },
    ];

    const editeur = construireProchaineAction(
      entree({ role: "editor", etapesDemarrage: etapes }),
    );
    expect(editeur.cta?.label).toBe("Générer un QR code");
    expect(editeur.progression).toEqual({ faites: 0, total: 1 });

    const proprietaire = construireProchaineAction(
      entree({ role: "owner", etapesDemarrage: etapes }),
    );
    expect(proprietaire.cta?.label).toBe("Ajouter votre logo");
  });

  it("aucune destination rendue n'est réservée au propriétaire pour un autre rôle", () => {
    const etats: CompteursCentreAnimation[] = [
      { drafts: 2, qrToTest: 2, liveExperiences: 0, lowStockPrizes: 2, rewardsToHandOver: 2, teamTasks: 0 },
      RIEN_A_FAIRE,
      { ...RIEN_A_FAIRE, liveExperiences: 0 },
    ];

    for (const role of ["editor", "cashier", null] as const) {
      for (const compteurs of etats) {
        const action = construireProchaineAction(entree({ role, compteurs }));
        // Une action est TOUJOURS proposée, et elle est toujours ouvrable.
        expect(action.cta).not.toBeNull();
        expect(estReserveAuProprietaire(action.cta!.href)).toBe(false);
      }
    }
  });
});

describe("conseilsRecouvertsParHero — le Conseiller ne redit pas le hero", () => {
  it("tait le conseil jumeau de chaque signal opérationnel", () => {
    const cles = (compteurs: Partial<CompteursCentreAnimation>) =>
      conseilsRecouvertsParHero(
        construireProchaineAction(
          entree({ compteurs: { ...RIEN_A_FAIRE, ...compteurs } }),
        ),
      );

    expect(cles({ rewardsToHandOver: 2 })).toEqual(["op-gains"]);
    expect(cles({ lowStockPrizes: 2 })).toEqual(["op-stock"]);
    expect(cles({ qrToTest: 2 })).toEqual(["op-qr"]);
    expect(cles({ drafts: 2 })).toEqual([
      "op-brouillons",
      "act-brouillons-non-ouverts",
    ]);
    expect(cles({ liveExperiences: 0 })).toEqual([
      "act-rien-ouvert",
      "act-brouillons-non-ouverts",
    ]);
  });

  it("tait aussi la tâche d'équipe jumelle, qui porte le même geste", () => {
    // « 3 gains à remettre » (hero, bouton vers /dashboard/redeem) et
    // « Remettre les gains au comptoir » (tâche, lien vers /dashboard/redeem)
    // sont le MÊME geste, à trois centimètres d'écart.
    const tache = (compteurs: Partial<CompteursCentreAnimation>) =>
      tachesRecouvertesParHero(
        construireProchaineAction(
          entree({ compteurs: { ...RIEN_A_FAIRE, ...compteurs } }),
        ),
      );

    expect(tache({ rewardsToHandOver: 2 })).toEqual(["remettre-les-gains"]);
    expect(tache({ lowStockPrizes: 2 })).toEqual(["recharger-les-lots"]);
    expect(tache({ drafts: 2 })).toEqual(["terminer-les-brouillons"]);
    expect(tache({ qrToTest: 2 })).toEqual(["tester-les-qr"]);
    expect(tache({ liveExperiences: 0 })).toEqual(["verifier-les-modules"]);
    // Un hero de démarrage ne promeut aucune tâche d'équipe.
    expect(tachesRecouvertesParHero(construireProchaineAction(entree()))).toEqual(
      [],
    );
  });

  it("ne tait rien quand le hero parle de démarrage ou ne dit rien d'urgent", () => {
    expect(conseilsRecouvertsParHero(construireProchaineAction(entree()))).toEqual(
      [],
    );
    expect(
      conseilsRecouvertsParHero(
        construireProchaineAction(
          entree({
            etapesDemarrage: [
              { key: "qr", label: "Générer un QR code", href: "/dashboard/qr-codes", done: false },
            ],
          }),
        ),
      ),
    ).toEqual([]);
  });
});
