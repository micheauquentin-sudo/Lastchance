import { describe, expect, it } from "vitest";

import {
  BROUILLONS_NON_PAYES_MAX,
  capacitesModule,
  type EntreeCapacites,
} from "./module-capabilities";
import { GRANTABLE_MODULES } from "./subscription";

function entree(over: Partial<EntreeCapacites> = {}): EntreeCapacites {
  return {
    module: "hunts",
    role: "owner",
    droitEffectif: false,
    brouillonsExistants: 0,
    ...over,
  };
}

describe("capacitesModule — découvrir, préparer, publier", () => {
  it("découvrir reste ouvert sans aucun droit", () => {
    // C'est la promesse centrale du cahier §3 : « Le dashboard donne accès à
    // tout pour découvrir ; seule la publication est verrouillée. » Rouge si
    // quelqu'un refermait l'exploration derrière le droit — le commerçant ne
    // saurait plus ce qu'il achète.
    const c = capacitesModule(entree({ droitEffectif: false }));
    expect(c.canExplore).toBe(true);
    expect(c.canEditDraft).toBe(true);
    expect(c.canPublish).toBe(false);
  });

  it("publier exige le droit effectif, pour les neuf modules", () => {
    for (const nom of GRANTABLE_MODULES) {
      expect(capacitesModule(entree({ module: nom, droitEffectif: false })).canPublish).toBe(false);
      expect(capacitesModule(entree({ module: nom, droitEffectif: true })).canPublish).toBe(true);
    }
  });

  it("le quota de brouillon ferme la préparation, jamais la découverte", () => {
    const c = capacitesModule(
      entree({ brouillonsExistants: BROUILLONS_NON_PAYES_MAX }),
    );
    expect(c.canExplore).toBe(true);
    expect(c.canEditDraft).toBe(false);
    // La raison porte sur la PUBLICATION. Un quota atteint n'est pas ce qui
    // empêche de publier : c'est l'absence de droit. Rouge si les deux motifs
    // se mélangeaient — l'écran dirait « brouillon déjà pris » à quelqu'un
    // dont le vrai blocage est qu'il n'a pas payé.
    expect(c.raison).toBe("droit_absent");
  });

  it("un module payé n'a plus de limite de brouillon", () => {
    // La limite borne la découverte gratuite. L'appliquer à un client qui paie
    // serait lui vendre un module et lui interdire d'en préparer la suite.
    const c = capacitesModule(
      entree({ droitEffectif: true, brouillonsExistants: 12 }),
    );
    expect(c.canEditDraft).toBe(true);
    expect(c.raison).toBeNull();
  });
});

describe("capacitesModule — un pass terminé n'est pas un module jamais pris (SD-9)", () => {
  it("la fin du pass change la raison ET porte la date", () => {
    // LE DÉFAUT QUE CE LOT FERME. Un commerçant qui a payé, dont la fenêtre
    // s'est refermée et dont les campagnes programmées viennent de retomber en
    // pause (`droit_expire`) lisait la phrase écrite pour celui qui n'a jamais
    // rien acheté : « Préparez … librement. » Il repartait chercher un essai
    // qu'il a dépassé, sans savoir quand son pass s'est fini.
    const c = capacitesModule(entree({ passTermineLe: "12 juin 2026" }));
    expect(c.raison).toBe("pass_expire");
    expect(c.passTermineLe).toBe("12 juin 2026");
    expect(c.message ?? "").toContain("12 juin 2026");
    // Le geste attendu, pas seulement le constat.
    expect(c.message ?? "").toContain("Rouvrez le module");
  });

  it("sans octroi, le refus reste `droit_absent` et ne date rien", () => {
    // Contrôle négatif, sans lequel le test précédent passerait aussi avec un
    // `pass_expire` rendu à tout le monde — et l'écran annoncerait une fin de
    // pass à qui n'a jamais rien payé.
    const c = capacitesModule(entree());
    expect(c.raison).toBe("droit_absent");
    expect(c.passTermineLe).toBeNull();
    expect(c.message ?? "").toContain("Préparez");
  });

  it("un module PAYÉ ne raconte aucune fin de pass", () => {
    // Un pass fini sous un récurrent repris : le module est ouvert, et le lui
    // rappeler serait vendre à un client qui vient de payer.
    const c = capacitesModule(
      entree({ droitEffectif: true, passTermineLe: "12 juin 2026" }),
    );
    expect(c.raison).toBeNull();
    expect(c.passTermineLe).toBeNull();
    expect(c.message).toBeNull();
  });

  it("la préparation reste ouverte après la fin du pass", () => {
    // Le pass ferme la PUBLICATION, jamais le travail déjà commencé : le
    // commerçant doit pouvoir relire et corriger ses brouillons avant de
    // rouvrir. Rouge si `pass_expire` s'était mis à refermer l'atelier.
    const c = capacitesModule(entree({ passTermineLe: "12 juin 2026" }));
    expect(c.canExplore).toBe(true);
    expect(c.canEditDraft).toBe(true);
    expect(c.canPublish).toBe(false);
  });

  it("l'éditeur garde sa consigne humaine, sans date ni facturation", () => {
    // Ce qu'un éditeur doit FAIRE ne change pas selon la cause : en parler au
    // propriétaire. Lui servir une date d'échéance l'enverrait négocier un
    // renouvellement qu'il ne peut pas payer.
    const c = capacitesModule(entree({ role: "editor", passTermineLe: "12 juin 2026" }));
    expect(c.raison).toBe("pass_expire");
    expect(c.message ?? "").toContain("demandez au propriétaire");
    expect(c.message ?? "").not.toContain("12 juin 2026");
  });

  it("le caissier reste refusé sur son rôle, pass terminé ou non", () => {
    const c = capacitesModule(entree({ role: "cashier", passTermineLe: "12 juin 2026" }));
    expect(c.raison).toBe("role");
    expect(c.passTermineLe).toBeNull();
  });
});

describe("capacitesModule — à qui l'on parle", () => {
  it("le propriétaire peut acheter, l'éditeur est renvoyé vers lui", () => {
    // Cahier §3 : « Un propriétaire peut acheter ; un éditeur voit le
    // catalogue mais reçoit "Demander au propriétaire", jamais un contrôle
    // Stripe. » Rouge si un bouton d'achat était proposé à un éditeur : il
    // aboutirait à une demande de carte bancaire à quelqu'un qui n'a pas à en
    // donner.
    expect(capacitesModule(entree({ role: "owner" })).peutAcheter).toBe(true);
    expect(capacitesModule(entree({ role: "editor" })).peutAcheter).toBe(false);
  });

  it("l'éditeur sans droit lit une consigne humaine, pas un échec technique", () => {
    const message = capacitesModule(entree({ role: "editor" })).message ?? "";
    expect(message).toContain("demandez au propriétaire");
    // Aucun vocabulaire de facturation chez l'éditeur : ni prix, ni Stripe, ni
    // abonnement. Il ne peut rien en faire, et le lui montrer l'envoie
    // chercher un écran qu'il n'a pas le droit d'ouvrir.
    expect(message.toLowerCase()).not.toContain("stripe");
    expect(message).not.toContain("€");
  });

  it("l'éditeur et le propriétaire ne lisent pas la même phrase", () => {
    // Contrôle négatif de forme : sans lui, un message unique satisferait les
    // deux assertions précédentes tant qu'il contient « demandez au
    // propriétaire », y compris chez le propriétaire lui-même.
    const proprietaire = capacitesModule(entree({ role: "owner" })).message;
    const editeur = capacitesModule(entree({ role: "editor" })).message;
    expect(proprietaire).not.toBe(editeur);
    expect(proprietaire ?? "").not.toContain("demandez au propriétaire");
  });

  it("le propriétaire dont le brouillon d'essai est pris sait quoi faire", () => {
    const message =
      capacitesModule(
        entree({ brouillonsExistants: BROUILLONS_NON_PAYES_MAX }),
      ).message ?? "";
    expect(message).toContain("déjà utilisé");
  });
});

describe("capacitesModule — la caisse", () => {
  it("le caissier ne découvre, ne prépare ni ne publie", () => {
    const c = capacitesModule(entree({ role: "cashier", droitEffectif: true }));
    expect(c.canExplore).toBe(false);
    expect(c.canEditDraft).toBe(false);
    expect(c.canPublish).toBe(false);
    expect(c.raison).toBe("role");
    // Même avec le droit payé : le refus tient au rôle, pas à l'argent. Rouge
    // si le droit effectif court-circuitait le rôle — un caissier publierait.
    expect(c.peutAcheter).toBe(false);
  });

  it("on ne parle pas d'achat à quelqu'un que l'achat n'ouvrirait pas", () => {
    const message = capacitesModule(entree({ role: "cashier" })).message ?? "";
    expect(message).toContain("caisse");
    expect(message).not.toContain("propriétaire");
  });

  it("un non-membre n'obtient rien et ne lit rien", () => {
    const c = capacitesModule(entree({ role: null, droitEffectif: true }));
    expect(c.canExplore).toBe(false);
    expect(c.message).toBeNull();
  });
});

describe("capacitesModule — le module est nommé au commerçant", () => {
  it.each(GRANTABLE_MODULES)("%s a un nom lisible dans son message", (module) => {
    // Garde DÉRIVÉE de la liste des modules : le dixième module ajouté demain
    // fait rougir ce test tant que personne n'a écrit comment on le nomme.
    // Sans elle, un `Record` incomplet rendrait `undefined` et le commerçant
    // lirait « Préparez undefined librement ».
    const message = capacitesModule(entree({ module, role: "owner" })).message ?? "";
    expect(message).not.toContain("undefined");
    expect(message.length).toBeGreaterThan(20);
  });
});
