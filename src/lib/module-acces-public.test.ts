import { beforeEach, describe, expect, it, vi } from "vitest";

const chargerOctroisVivants = vi.fn();
const octroiRessourceVivant = vi.fn();
vi.mock("@/lib/module-grants-loader", () => ({
  chargerOctroisVivants: (...args: unknown[]) => chargerOctroisVivants(...args),
  octroiRessourceVivant: (...args: unknown[]) => octroiRessourceVivant(...args),
}));

const { moduleOuvertAuJoueur } = await import("./module-acces-public");

const MAINTENANT = new Date("2026-06-15T12:00:00.000Z");

/** Organisation résiliée, add-on éteint : refusée par la branche abonnement. */
function orgSansRien() {
  return {
    id: "org-1",
    subscription_status: "canceled" as const,
    trial_ends_at: "2026-01-01T00:00:00.000Z",
    past_due_since: null,
    comp_access: false,
    comp_access_until: null,
    addon_quiz: false,
  };
}

/** Organisation abonnée avec l'add-on : ouverte sans qu'aucun octroi n'existe. */
function orgAbonnee() {
  return { ...orgSansRien(), subscription_status: "active" as const, addon_quiz: true };
}

/** La même, côté pronostics : c'est le seul module vendu à la ressource. */
function orgPronosSansRien() {
  return {
    id: "org-1",
    subscription_status: "canceled" as const,
    trial_ends_at: "2026-01-01T00:00:00.000Z",
    past_due_since: null,
    comp_access: false,
    comp_access_until: null,
    addon_pronostics: false,
  };
}

beforeEach(() => {
  chargerOctroisVivants.mockReset();
  chargerOctroisVivants.mockResolvedValue([]);
  octroiRessourceVivant.mockReset();
  octroiRessourceVivant.mockResolvedValue(false);
});

describe("moduleOuvertAuJoueur — le droit du joueur", () => {
  it("un octroi vivant ouvre le module au JOUEUR, sans abonnement ni add-on", async () => {
    // LE DÉFAUT QUE CE HELPER FERME. Avant lui, le dashboard voyait l'octroi
    // (P0.3 l'y a branché) et les huit contextes publics ne le voyaient pas :
    // le commerçant publiait son quiz et son client tombait sur « Ce quiz n'est
    // pas disponible ». C'était sans effet tant qu'aucun chemin d'achat ne
    // créait d'octroi ; P0.4 en crée.
    chargerOctroisVivants.mockResolvedValue(["quiz"]);
    expect(await moduleOuvertAuJoueur("quiz", orgSansRien(), MAINTENANT)).toBe(true);
  });

  it("un octroi vivant sur un AUTRE module n'ouvre pas celui-ci", async () => {
    // Contre-exemple, sans lequel un prédicat « au moins un octroi » passerait
    // aussi le test précédent — et un pass Chasse au trésor ouvrirait le quiz.
    chargerOctroisVivants.mockResolvedValue(["hunts"]);
    expect(await moduleOuvertAuJoueur("quiz", orgSansRien(), MAINTENANT)).toBe(false);
  });

  it("sans octroi ni abonnement, le module reste fermé", async () => {
    expect(await moduleOuvertAuJoueur("quiz", orgSansRien(), MAINTENANT)).toBe(false);
  });
});

describe("moduleOuvertAuJoueur — ce que la lecture coûte, et à qui", () => {
  it("un commerçant DÉJÀ servi par son abonnement ne déclenche AUCUNE lecture", async () => {
    // L'assertion qui rend la conception mesurable plutôt qu'affirmée. Le droit
    // effectif est un OU : un octroi ne peut qu'AJOUTER un droit. Si la branche
    // abonnement répond déjà oui, aller lire les octrois ne peut pas changer la
    // réponse — et ce serait une requête de plus sur CHAQUE chargement de page
    // publique, pour la population qui n'en a aucun besoin.
    //
    // Rouge si quelqu'un remontait le chargement avant le premier calcul :
    // le comportement resterait correct et le coût deviendrait invisible.
    expect(await moduleOuvertAuJoueur("quiz", orgAbonnee(), MAINTENANT)).toBe(true);
    expect(chargerOctroisVivants).not.toHaveBeenCalled();
  });

  it("un commerçant refusé par l'abonnement déclenche UNE lecture, sur SON organisation", async () => {
    await moduleOuvertAuJoueur("quiz", orgSansRien(), MAINTENANT);
    expect(chargerOctroisVivants).toHaveBeenCalledTimes(1);
    // L'identifiant lu vient de la ligne d'organisation déjà résolue par le
    // contexte, jamais de l'appelant public.
    expect(chargerOctroisVivants).toHaveBeenCalledWith("org-1", MAINTENANT);
  });

  it("une liste d'octrois vide ne relance pas un second calcul inutile", async () => {
    chargerOctroisVivants.mockResolvedValue([]);
    expect(await moduleOuvertAuJoueur("quiz", orgSansRien(), MAINTENANT)).toBe(false);
    expect(chargerOctroisVivants).toHaveBeenCalledTimes(1);
  });
});

describe("moduleOuvertAuJoueur — le pass borné à UNE ressource (SD-5)", () => {
  const CONTEST = { resourceId: "contest-1" };

  it("un octroi borné à CE championnat l'ouvre au joueur", async () => {
    // LE DÉFAUT MESURÉ PAR LA REVUE. La migration 20260925120000 borne le pass
    // « Saison de pronostics » à une compétition et autorise sa publication ;
    // ce chemin de lecture n'avait pas reçu sa contrepartie. Le commerçant
    // payait 39 €, publiait, et son joueur lisait « momentanément désactivé ».
    octroiRessourceVivant.mockResolvedValue(true);
    expect(
      await moduleOuvertAuJoueur(
        "pronostics",
        orgPronosSansRien(),
        MAINTENANT,
        CONTEST,
      ),
    ).toBe(true);
    expect(octroiRessourceVivant).toHaveBeenCalledWith(
      "org-1",
      "pronostics",
      "contest-1",
      MAINTENANT,
    );
  });

  it("sans octroi sur cette ressource, le championnat reste fermé", async () => {
    expect(
      await moduleOuvertAuJoueur(
        "pronostics",
        orgPronosSansRien(),
        MAINTENANT,
        CONTEST,
      ),
    ).toBe(false);
  });

  it("un appelant SANS ressource ne déclenche aucune lecture de ressource", async () => {
    // Les sept autres contextes publics passent par ici sans ressource : aucun
    // de leurs modules ne se vend à la ressource, et leur faire payer une
    // requête de plus sur chaque page publique serait un coût sans contrepartie.
    octroiRessourceVivant.mockResolvedValue(true);
    expect(await moduleOuvertAuJoueur("quiz", orgSansRien(), MAINTENANT)).toBe(false);
    expect(octroiRessourceVivant).not.toHaveBeenCalled();
  });

  it("le module ENTIER passe devant : la ressource n'est pas interrogée", async () => {
    // Même ordre que `org_has_module_access_for_resource`, et pour la même
    // raison : un droit de module ouvre TOUTES ses ressources, donc la seconde
    // lecture ne pourrait pas changer la réponse.
    chargerOctroisVivants.mockResolvedValue(["pronostics"]);
    expect(
      await moduleOuvertAuJoueur(
        "pronostics",
        orgPronosSansRien(),
        MAINTENANT,
        CONTEST,
      ),
    ).toBe(true);
    expect(octroiRessourceVivant).not.toHaveBeenCalled();
  });

  it("un octroi borné à un AUTRE championnat n'ouvre pas celui-ci", async () => {
    // Le contre-exemple qui rend la borne signifiante. La discrimination se
    // fait dans `octroiRessourceVivant` (prouvée sur son `.eq("resource_id")`
    // dans module-grants-loader.test.ts) ; ce qu'on épingle ici est que ce
    // helper ne se rabat PAS sur le module entier quand elle répond non.
    octroiRessourceVivant.mockResolvedValue(false);
    expect(
      await moduleOuvertAuJoueur("pronostics", orgPronosSansRien(), MAINTENANT, {
        resourceId: "contest-2",
      }),
    ).toBe(false);
  });
});

describe("moduleOuvertAuJoueur — le sens de l'erreur", () => {
  it("un chargeur qui rend une liste vide sur panne REFUSE, il n'accorde pas", async () => {
    // `chargerOctroisVivants` avale ses pannes et rend []. Ce test épingle la
    // conséquence ici, à l'endroit où quelqu'un pourrait être tenté d'ouvrir en
    // cas de doute : une base indisponible ne doit jamais offrir un module
    // payant à un compte résilié.
    chargerOctroisVivants.mockResolvedValue([]);
    expect(await moduleOuvertAuJoueur("quiz", orgSansRien(), MAINTENANT)).toBe(false);
  });
});
