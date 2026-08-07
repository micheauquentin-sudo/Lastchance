import { describe, expect, it } from "vitest";

import type { CompteursCentreAnimation } from "@/lib/centre-animation-server";
import type { ExperienceAnalyticsSnapshot } from "@/lib/experience-analytics-dashboard";
import { estReserveAuProprietaire } from "@/lib/liens-proprietaire";
import { EXPERIENCE_CATALOG } from "@/platform/experiences/catalog";
import type { ExperienceKind } from "@/platform/experiences/contract";
import {
  construireConseils,
  type EntreeConseils,
  type SommaireConseils,
} from "./conseiller-commercant";

const RIEN_A_FAIRE: CompteursCentreAnimation = {
  drafts: 0,
  qrToTest: 0,
  liveExperiences: 2,
  lowStockPrizes: 0,
  rewardsToHandOver: 0,
  teamTasks: 0,
};

/**
 * Un entonnoir SAIN : des vues, des parties, des fins, des gains réclamés.
 * Aucune règle d'activité ne doit s'en émouvoir — c'est le témoin négatif de
 * toutes les assertions « ne se déclenche pas » ci-dessous.
 */
const SOMMAIRE_SAIN: SommaireConseils = {
  wins: 12,
  participations: 9,
  campaigns: 3,
};

const analytiqueVide = (): ExperienceAnalyticsSnapshot => ({
  periodDays: 30,
  totalEvents: 0,
  summary: {
    views: 0,
    joins: 0,
    starts: 0,
    completions: 0,
    rewardsIssued: 0,
    rewardsClaimed: 0,
    rewardsRedeemed: 0,
    returningPlayers: 0,
    shares: 0,
    uniquePlayers: 0,
    basketObservations: 0,
    basketRevenueCents: 0,
    rewardCostObservations: 0,
    rewardCostCents: 0,
    marginObservations: 0,
    attributableMarginCents: 0,
  },
  experiences: [],
  sources: [],
});

const analytique = (
  metriques: Partial<ExperienceAnalyticsSnapshot["summary"]>,
): ExperienceAnalyticsSnapshot => {
  const vide = analytiqueVide();
  return { ...vide, summary: { ...vide.summary, ...metriques } };
};

const ANALYTIQUE_SAINE = analytique({
  views: 120,
  starts: 80,
  completions: 55,
});

/** Seul le module cœur (« campaign ») est actif : tous les addons dorment. */
const SEUL_LE_COEUR: ExperienceKind[] = ["campaign"];

/** Tous les modules SAUF fidélité et chasse : ces deux-là restent inactifs. */
const TOUT_SAUF_FIDELITE_ET_CHASSE: ExperienceKind[] = EXPERIENCE_CATALOG.map(
  (e) => e.kind,
).filter((k) => k !== "loyalty" && k !== "hunt");

/** Le socle commun : tout est sain, chaque test ne dérange qu'un signal. */
const entree = (surcharge: Partial<EntreeConseils> = {}): EntreeConseils => ({
  role: "owner",
  compteurs: RIEN_A_FAIRE,
  activeKinds: SEUL_LE_COEUR,
  sommaire: SOMMAIRE_SAIN,
  analytics: ANALYTIQUE_SAINE,
  ...surcharge,
});

const cle = (conseils: ReturnType<typeof construireConseils>, key: string) =>
  conseils.find((c) => c.key === key);

describe("construireConseils (PURE)", () => {
  it("place l'opérationnel en tête, avec les comptes exacts et par priorité", () => {
    const conseils = construireConseils(
      entree({
        compteurs: {
          ...RIEN_A_FAIRE,
          rewardsToHandOver: 3,
          lowStockPrizes: 2,
        },
      }),
    );

    const operationnels = conseils.filter((c) => c.categorie === "operationnel");
    expect(operationnels.map((c) => c.texte)).toEqual([
      "3 gains à remettre.",
      "2 lots de la roue en stock faible.",
    ]);
    // Gains (100) avant stock (90) : l'ordre suit la priorité.
    expect(operationnels[0].priorite).toBeGreaterThan(operationnels[1].priorite);
    // Et l'opérationnel passe devant la ligne de découverte, toujours dernière.
    const decouverte = conseils.findIndex((c) => c.categorie === "decouverte");
    const dernierOp = conseils.map((c) => c.categorie).lastIndexOf("operationnel");
    expect(dernierOp).toBeLessThan(decouverte);
  });

  it("accorde le singulier au compte de 1", () => {
    const [gain] = construireConseils(
      entree({ compteurs: { ...RIEN_A_FAIRE, rewardsToHandOver: 1 } }),
    );
    expect(gain.texte).toBe("1 gain à remettre.");
  });

  it("dit « jamais scanné » — le mot exact de la tuile et du hero", () => {
    // Un seul compteur (`scan_count = 0`) avait trois vocabulaires sur le même
    // écran : « QR jamais scannés » (tuile), « QR jamais ouverts — à tester
    // avant diffusion » (conseil), « Tester les QR jamais ouverts » (équipe).
    expect(
      cle(
        construireConseils(entree({ compteurs: { ...RIEN_A_FAIRE, qrToTest: 2 } })),
        "op-qr",
      )?.texte,
    ).toBe("2 QR jamais scannés.");
  });

  /**
   * UNE SEULE LIGNE POUR TOUS LES MODULES INACTIFS.
   *
   * Il y en avait une PAR module : un commerçant sans add-on lisait sept
   * « Module X disponible (objectif : Y) » et le panneau devenait une brochure,
   * poussant hors du plafond les deux conseils réellement utiles.
   */
  it("résume les modules inactifs en UNE ligne, avec le compte exact", () => {
    const conseils = construireConseils(
      entree({ activeKinds: TOUT_SAUF_FIDELITE_ET_CHASSE }),
    );

    // Plus aucune ligne « module » : la découverte porte le compte.
    expect(conseils.filter((c) => c.categorie === "module")).toEqual([]);
    const decouverte = cle(conseils, "decouverte");
    expect(decouverte?.texte).toBe(
      "2 modules pourraient servir vos objectifs.",
    );
    expect(decouverte?.href).toBe("/dashboard/discover");
  });

  it("accorde le singulier et se rabat sur l'invitation neutre à zéro", () => {
    const tousActifs = EXPERIENCE_CATALOG.map((e) => e.kind);
    expect(
      cle(construireConseils(entree({ activeKinds: tousActifs })), "decouverte")
        ?.texte,
    ).toBe("Parcourir tous les modules par objectif.");

    const sansFidelite = tousActifs.filter((k) => k !== "loyalty");
    expect(
      cle(
        construireConseils(entree({ activeKinds: sansFidelite })),
        "decouverte",
      )?.texte,
    ).toBe("1 module pourrait servir vos objectifs.");
  });

  it("tait le conseil que le bloc « Votre prochaine action » affiche déjà", () => {
    const compteurs = { ...RIEN_A_FAIRE, rewardsToHandOver: 3, lowStockPrizes: 2 };

    // Sans exclusion, les deux signaux sont là.
    expect(cle(construireConseils(entree({ compteurs })), "op-gains")).toBeDefined();

    // Le hero affiche « 3 gains à remettre » avec son bouton : le conseiller ne
    // le redit pas, mais le second signal, lui, reste visible.
    const avecHero = construireConseils(
      entree({ compteurs, exclure: ["op-gains"] }),
    );
    expect(cle(avecHero, "op-gains")).toBeUndefined();
    expect(cle(avecHero, "op-stock")?.texte).toBe(
      "2 lots de la roue en stock faible.",
    );
  });

  it("AUCUN href réservé au propriétaire ne sort pour l'éditeur", () => {
    const compteurs: CompteursCentreAnimation = {
      drafts: 1,
      qrToTest: 1,
      liveExperiences: 0,
      lowStockPrizes: 1,
      rewardsToHandOver: 1,
      teamTasks: 0,
    };

    // Le propriétaire garde le lien vers le registre des participations…
    const proprio = cle(
      construireConseils(entree({ compteurs })),
      "op-gains",
    );
    expect(proprio?.href).toBe("/dashboard/participations?statut=a-valider");

    // …l'éditeur voit la même phrase, mais sans lien mort.
    const editeur = construireConseils(entree({ role: "editor", compteurs }));
    const gainEditeur = cle(editeur, "op-gains");
    expect(gainEditeur?.texte).toBe("1 gain à remettre.");
    expect(gainEditeur?.href).toBeUndefined();

    // Invariant général : aucun conseil rendu à l'éditeur ne porte un chemin
    // réservé au propriétaire.
    for (const c of editeur) {
      if (c.href) expect(estReserveAuProprietaire(c.href)).toBe(false);
    }
  });

  it("garde la découverte toujours présente et borne le total", () => {
    // Beaucoup d'activité ET d'opérationnel ET de modules : le total reste
    // plafonné, et la découverte survit malgré sa priorité basse.
    const conseils = construireConseils(
      entree({
        compteurs: {
          drafts: 4,
          qrToTest: 3,
          liveExperiences: 0,
          lowStockPrizes: 2,
          rewardsToHandOver: 5,
          teamTasks: 0,
        },
        sommaire: { wins: 7, participations: 0, campaigns: 3 },
        analytics: analytique({ views: 40, starts: 0, completions: 0 }),
      }),
    );

    expect(conseils.length).toBeLessThanOrEqual(4);
    const decouverte = conseils.filter((c) => c.categorie === "decouverte");
    expect(decouverte).toHaveLength(1);
    expect(decouverte[0].href).toBe("/dashboard/discover");
    // Toujours en dernier : c'est le conseil le moins prioritaire.
    expect(conseils.at(-1)?.categorie).toBe("decouverte");
  });

  it("sans compteur (base indisponible) : la découverte seule subsiste", () => {
    const conseils = construireConseils(
      entree({ compteurs: null, sommaire: null, analytics: null }),
    );
    expect(conseils.some((c) => c.categorie === "operationnel")).toBe(false);
    expect(conseils.some((c) => c.categorie === "activite")).toBe(false);
    expect(conseils).toHaveLength(1);
    expect(conseils.at(-1)?.categorie).toBe("decouverte");
  });
});

describe("règles d'activité (lecture croisée)", () => {
  it("un entonnoir sain ne déclenche AUCUNE règle d'activité", () => {
    const conseils = construireConseils(entree());
    expect(conseils.filter((c) => c.categorie === "activite")).toEqual([]);
  });

  describe("brouillons prêts mais rien d'ouvert", () => {
    it("croise les deux compteurs et remplace le conseil « brouillons »", () => {
      const conseils = construireConseils(
        entree({
          compteurs: { ...RIEN_A_FAIRE, liveExperiences: 0, drafts: 2 },
        }),
      );
      expect(cle(conseils, "act-brouillons-non-ouverts")?.texte).toBe(
        "2 animations en brouillon, aucune ouverte aux joueurs.",
      );
      // Le compteur brut ne se répète pas juste en dessous.
      expect(cle(conseils, "op-brouillons")).toBeUndefined();
      // Et l'autre lecture du même état ne double pas la première.
      expect(cle(conseils, "act-rien-ouvert")).toBeUndefined();
    });

    it("ne se déclenche pas si une animation est ouverte", () => {
      const conseils = construireConseils(
        entree({
          compteurs: { ...RIEN_A_FAIRE, liveExperiences: 1, drafts: 2 },
        }),
      );
      expect(cle(conseils, "act-brouillons-non-ouverts")).toBeUndefined();
      // Le conseil opérationnel de routine, lui, reprend sa place.
      expect(cle(conseils, "op-brouillons")?.texte).toBe(
        "2 animations en brouillon à terminer.",
      );
    });
  });

  describe("rien d'ouvert, sans brouillon pour l'expliquer", () => {
    it("se déclenche quand le commerce a DÉJÀ créé une campagne", () => {
      const conseils = construireConseils(
        entree({
          compteurs: { ...RIEN_A_FAIRE, liveExperiences: 0, drafts: 0 },
        }),
      );
      const conseil = cle(conseils, "act-rien-ouvert");
      expect(conseil?.texte).toBe("Aucune animation n'est ouverte aux joueurs.");
      expect(conseil?.href).toBe("/dashboard/campaigns");
    });

    it("SE TAIT pour un commerce qui n'a encore rien créé (checklist de démarrage)", () => {
      const conseils = construireConseils(
        entree({
          compteurs: { ...RIEN_A_FAIRE, liveExperiences: 0, drafts: 0 },
          sommaire: { wins: 0, participations: 0, campaigns: 0 },
        }),
      );
      expect(cle(conseils, "act-rien-ouvert")).toBeUndefined();
    });
  });

  describe("vues qualifiées sans partie lancée", () => {
    it("se déclenche et cite la fenêtre de mesure", () => {
      const conseils = construireConseils(
        entree({ analytics: analytique({ views: 34, starts: 0 }) }),
      );
      expect(cle(conseils, "act-vues-sans-partie")?.texte).toBe(
        "34 vues qualifiées sur 30 jours, aucune partie lancée.",
      );
    });

    it("ne se déclenche pas dès qu'une seule partie a été lancée", () => {
      const conseils = construireConseils(
        entree({ analytics: analytique({ views: 34, starts: 1 }) }),
      );
      expect(cle(conseils, "act-vues-sans-partie")).toBeUndefined();
    });

    it("SE TAIT sur une période sans aucune vue : zéro n'est pas un diagnostic", () => {
      const conseils = construireConseils({
        ...entree(),
        analytics: analytiqueVide(),
      });
      expect(cle(conseils, "act-vues-sans-partie")).toBeUndefined();
      expect(cle(conseils, "act-parties-sans-fin")).toBeUndefined();
    });
  });

  describe("parties lancées sans fin", () => {
    it("se déclenche, au singulier comme au pluriel", () => {
      expect(
        cle(
          construireConseils(
            entree({
              analytics: analytique({ views: 9, starts: 5, completions: 0 }),
            }),
          ),
          "act-parties-sans-fin",
        )?.texte,
      ).toBe("5 parties lancées sur 30 jours, aucune terminée.");

      expect(
        cle(
          construireConseils(
            entree({
              analytics: analytique({ views: 9, starts: 1, completions: 0 }),
            }),
          ),
          "act-parties-sans-fin",
        )?.texte,
      ).toBe("1 partie lancée sur 30 jours, aucune terminée.");
    });

    it("ne se déclenche pas dès qu'une partie a été terminée", () => {
      const conseils = construireConseils(
        entree({
          analytics: analytique({ views: 9, starts: 5, completions: 1 }),
        }),
      );
      expect(cle(conseils, "act-parties-sans-fin")).toBeUndefined();
    });
  });

  describe("lots gagnés sans coordonnées", () => {
    it("se déclenche quand personne ne réclame son gain", () => {
      const conseils = construireConseils(
        entree({ sommaire: { wins: 6, participations: 0, campaigns: 2 } }),
      );
      expect(cle(conseils, "act-gains-sans-coordonnees")?.texte).toBe(
        "6 lots gagnés à la roue, aucune coordonnée client enregistrée.",
      );
    });

    it("ne se déclenche pas dès qu'une participation existe", () => {
      const conseils = construireConseils(
        entree({ sommaire: { wins: 6, participations: 1, campaigns: 2 } }),
      );
      expect(cle(conseils, "act-gains-sans-coordonnees")).toBeUndefined();
    });

    it("SE TAIT quand aucun lot n'a encore été gagné", () => {
      const conseils = construireConseils(
        entree({ sommaire: { wins: 0, participations: 0, campaigns: 2 } }),
      );
      expect(cle(conseils, "act-gains-sans-coordonnees")).toBeUndefined();
    });
  });

  it("l'activité passe DEVANT l'opérationnel, qui passe devant la découverte", () => {
    const conseils = construireConseils(
      entree({
        compteurs: {
          ...RIEN_A_FAIRE,
          liveExperiences: 0,
          drafts: 0,
          rewardsToHandOver: 3,
        },
        analytics: analytique({ views: 20, starts: 0 }),
      }),
    );

    const categories = conseils.map((c) => c.categorie);
    expect(categories.lastIndexOf("activite")).toBeLessThan(
      categories.indexOf("operationnel"),
    );
    expect(categories.lastIndexOf("operationnel")).toBeLessThan(
      categories.indexOf("decouverte"),
    );
    // Et la liste sort déjà triée par priorité décroissante.
    const priorites = conseils.map((c) => c.priorite);
    expect([...priorites].sort((a, b) => b - a)).toEqual(priorites);
  });

  it("les règles d'activité restent lisibles sans le Centre d'animation", () => {
    // `compteurs` null (caisse, ou RPC indisponible) : les deux règles qui en
    // dépendent se taisent, les trois autres sources restent lues.
    const conseils = construireConseils(
      entree({
        compteurs: null,
        sommaire: { wins: 4, participations: 0, campaigns: 1 },
        analytics: analytique({ views: 12, starts: 0 }),
      }),
    );
    expect(cle(conseils, "act-brouillons-non-ouverts")).toBeUndefined();
    expect(cle(conseils, "act-rien-ouvert")).toBeUndefined();
    expect(cle(conseils, "act-vues-sans-partie")).toBeDefined();
    expect(cle(conseils, "act-gains-sans-coordonnees")).toBeDefined();
  });
});

describe("filet anti-duplication : le conseiller ne redit pas l'écran d'à côté", () => {
  /**
   * Les bandeaux d'abonnement vivent dans `dashboard/layout.tsx` et la
   * checklist de démarrage dans `OnboardingChecklist`, montée sur CETTE page.
   * Un conseil qui répéterait l'un des deux les ferait ignorer tous les trois.
   * Ce test parcourt donc TOUTES les combinaisons d'états dégradés qu'on sait
   * produire et vérifie qu'aucune phrase ne s'aventure sur ces sujets.
   */
  const SUJETS_INTERDITS =
    /abonn|essai|résili|resili|impay|facturation|paiement|premier[e]?s? campagne|générer un qr|generer un qr|personnaliser votre affiche|ajouter votre logo|activer votre campagne/i;

  const ETATS: EntreeConseils[] = [
    // Commerce vierge : rien créé, rien mesuré.
    {
      role: "owner",
      compteurs: {
        drafts: 0,
        qrToTest: 0,
        liveExperiences: 0,
        lowStockPrizes: 0,
        rewardsToHandOver: 0,
        teamTasks: 0,
      },
      activeKinds: SEUL_LE_COEUR,
      sommaire: { wins: 0, participations: 0, campaigns: 0 },
      analytics: analytiqueVide(),
    },
    // Commerce en panne d'entonnoir, tous signaux au rouge.
    {
      role: "owner",
      compteurs: {
        drafts: 3,
        qrToTest: 2,
        liveExperiences: 0,
        lowStockPrizes: 1,
        rewardsToHandOver: 4,
        teamTasks: 0,
      },
      activeKinds: SEUL_LE_COEUR,
      sommaire: { wins: 5, participations: 0, campaigns: 2 },
      analytics: analytique({ views: 60, starts: 0 }),
    },
    // Commerce sain, éditeur : seuls les modules et la découverte parlent.
    {
      role: "editor",
      compteurs: RIEN_A_FAIRE,
      activeKinds: TOUT_SAUF_FIDELITE_ET_CHASSE,
      sommaire: SOMMAIRE_SAIN,
      analytics: ANALYTIQUE_SAINE,
    },
    // Tout indisponible.
    {
      role: "owner",
      compteurs: null,
      activeKinds: SEUL_LE_COEUR,
      sommaire: null,
      analytics: null,
    },
  ];

  it("aucune phrase ne parle d'abonnement, d'essai ni des étapes de démarrage", () => {
    for (const etat of ETATS) {
      for (const conseil of construireConseils(etat)) {
        expect(
          SUJETS_INTERDITS.test(conseil.texte),
          `« ${conseil.texte} » empiète sur un encart voisin`,
        ).toBe(false);
      }
    }
  });

  it("aucun conseil ne renvoie vers la facturation ni vers l'affiche", () => {
    for (const etat of ETATS) {
      for (const conseil of construireConseils(etat)) {
        if (!conseil.href) continue;
        expect(conseil.href.startsWith("/poster/")).toBe(false);
        expect(conseil.href).not.toContain("billing");
        expect(conseil.href).not.toContain("subscription");
      }
    }
  });

  it("le ton reste constatif : ni emoji, ni point d'exclamation", () => {
    // Le conseiller SIGNALE, il ne vend pas. Un emoji ou un « ! » est le
    // premier symptôme d'une phrase devenue promotionnelle.
    const emoji = /\p{Extended_Pictographic}/u;
    for (const etat of ETATS) {
      for (const conseil of construireConseils(etat)) {
        expect(emoji.test(conseil.texte)).toBe(false);
        expect(conseil.texte).not.toContain("!");
      }
    }
  });

  it("le caissier ne reçoit aucun conseil actionnable réservé au propriétaire", () => {
    const conseils = construireConseils({
      role: "cashier",
      compteurs: null,
      activeKinds: SEUL_LE_COEUR,
      sommaire: { wins: 5, participations: 0, campaigns: 2 },
      analytics: analytique({ views: 60, starts: 0 }),
    });
    for (const c of conseils) {
      if (c.href) expect(estReserveAuProprietaire(c.href)).toBe(false);
    }
  });
});
