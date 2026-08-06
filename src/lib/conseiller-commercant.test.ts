import { describe, expect, it } from "vitest";

import type { CompteursCentreAnimation } from "@/lib/centre-animation-server";
import { estReserveAuProprietaire } from "@/lib/liens-proprietaire";
import { EXPERIENCE_CATALOG } from "@/platform/experiences/catalog";
import type { ExperienceKind } from "@/platform/experiences/contract";
import { construireConseils } from "./conseiller-commercant";

const RIEN_A_FAIRE: CompteursCentreAnimation = {
  drafts: 0,
  qrToTest: 0,
  liveExperiences: 2,
  lowStockPrizes: 0,
  rewardsToHandOver: 0,
  teamTasks: 0,
};

/** Seul le module cœur (« campaign ») est actif : tous les addons dorment. */
const SEUL_LE_COEUR: ExperienceKind[] = ["campaign"];

/** Tous les modules SAUF fidélité et chasse : ces deux-là restent inactifs. */
const TOUT_SAUF_FIDELITE_ET_CHASSE: ExperienceKind[] = EXPERIENCE_CATALOG.map(
  (e) => e.kind,
).filter((k) => k !== "loyalty" && k !== "hunt");

describe("construireConseils (PURE)", () => {
  it("place l'opérationnel en tête, avec les comptes exacts et par priorité", () => {
    const conseils = construireConseils({
      role: "owner",
      compteurs: {
        ...RIEN_A_FAIRE,
        rewardsToHandOver: 3,
        lowStockPrizes: 2,
      },
      activeKinds: SEUL_LE_COEUR,
    });

    const operationnels = conseils.filter((c) => c.categorie === "operationnel");
    expect(operationnels.map((c) => c.texte)).toEqual([
      "3 gains à remettre.",
      "2 lots de la roue en stock faible.",
    ]);
    // Gains (100) avant stock (90) : l'ordre suit la priorité.
    expect(operationnels[0].priorite).toBeGreaterThan(operationnels[1].priorite);
    // Et l'opérationnel passe devant le premier conseil « module ».
    const premierModule = conseils.findIndex((c) => c.categorie === "module");
    const dernierOp = conseils.map((c) => c.categorie).lastIndexOf("operationnel");
    expect(dernierOp).toBeLessThan(premierModule);
  });

  it("accorde le singulier au compte de 1", () => {
    const [gain] = construireConseils({
      role: "owner",
      compteurs: { ...RIEN_A_FAIRE, rewardsToHandOver: 1 },
      activeKinds: SEUL_LE_COEUR,
    });
    expect(gain.texte).toBe("1 gain à remettre.");
  });

  it("propose les modules INACTIFS et jamais un module actif", () => {
    const conseils = construireConseils({
      role: "owner",
      compteurs: RIEN_A_FAIRE,
      activeKinds: TOUT_SAUF_FIDELITE_ET_CHASSE,
    });
    const modules = conseils.filter((c) => c.categorie === "module");

    // Les deux modules laissés inactifs sont signalés…
    expect(modules.some((c) => c.key === "mod-loyalty")).toBe(true);
    expect(modules.some((c) => c.key === "mod-hunt")).toBe(true);
    // …et aucun module actif ne l'est : ni un addon activé (parrainage), ni le
    // cœur, toujours actif.
    expect(modules.some((c) => c.key === "mod-referral")).toBe(false);
    expect(modules.some((c) => c.key === "mod-campaign")).toBe(false);

    // Le libellé suit exactement le catalogue (label + objectif).
    const passeport = EXPERIENCE_CATALOG.find((e) => e.kind === "loyalty");
    expect(modules.find((c) => c.key === "mod-loyalty")?.texte).toBe(
      `Module ${passeport!.label} disponible (objectif : ${passeport!.objective}).`,
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
    const proprio = construireConseils({
      role: "owner",
      compteurs,
      activeKinds: SEUL_LE_COEUR,
    }).find((c) => c.key === "op-gains");
    expect(proprio?.href).toBe("/dashboard/participations?statut=a-valider");

    // …l'éditeur voit la même phrase, mais sans lien mort.
    const editeur = construireConseils({
      role: "editor",
      compteurs,
      activeKinds: SEUL_LE_COEUR,
    });
    const gainEditeur = editeur.find((c) => c.key === "op-gains");
    expect(gainEditeur?.texte).toBe("1 gain à remettre.");
    expect(gainEditeur?.href).toBeUndefined();

    // Invariant général : aucun conseil rendu à l'éditeur ne porte un chemin
    // réservé au propriétaire.
    for (const c of editeur) {
      if (c.href) expect(estReserveAuProprietaire(c.href)).toBe(false);
    }
  });

  it("garde la découverte toujours présente et borne le total", () => {
    // Beaucoup d'opérationnel ET beaucoup de modules : le total reste plafonné,
    // et la découverte survit malgré sa priorité basse.
    const conseils = construireConseils({
      role: "owner",
      compteurs: {
        drafts: 4,
        qrToTest: 3,
        liveExperiences: 0,
        lowStockPrizes: 2,
        rewardsToHandOver: 5,
        teamTasks: 0,
      },
      activeKinds: SEUL_LE_COEUR,
    });

    expect(conseils.length).toBeLessThanOrEqual(6);
    const decouverte = conseils.filter((c) => c.categorie === "decouverte");
    expect(decouverte).toHaveLength(1);
    expect(decouverte[0].href).toBe("/dashboard/discover");
    // Toujours en dernier : c'est le conseil le moins prioritaire.
    expect(conseils.at(-1)?.categorie).toBe("decouverte");
  });

  it("sans compteur (base indisponible) : modules et découverte suffisent", () => {
    const conseils = construireConseils({
      role: "owner",
      compteurs: null,
      activeKinds: SEUL_LE_COEUR,
    });
    expect(conseils.some((c) => c.categorie === "operationnel")).toBe(false);
    expect(conseils.some((c) => c.categorie === "module")).toBe(true);
    expect(conseils.at(-1)?.categorie).toBe("decouverte");
  });
});
