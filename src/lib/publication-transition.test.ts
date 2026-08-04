import { describe, expect, it } from "vitest";
import {
  classerTransition,
  refusTransition,
  type TextesTransition,
} from "@/lib/publication-transition";

/**
 * CE QUE CE FICHIER PROUVE, ET CE QU'IL NE PROUVE PAS.
 *
 * Il prouve la table de correspondance : quel code de refus rendu par les huit
 * RPC de transition (20260905120000) devient quelle classe. Il ne prouve pas
 * que ces codes sont ceux que Postgres émet réellement — cela se joue en pgTAP,
 * seul endroit capable d'interroger un vrai serveur. Les chaînes testées ici
 * sont recopiées des `raise exception` de la migration, et c'est une copie :
 * si elles y changent, ce fichier restera vert et les écrans deviendront muets.
 * Le garde-fou contre cette dérive est le test d'action voisin
 * (`src/actions/publication-refus.test.ts`), qui rejoue les mêmes littéraux de
 * bout en bout, et la suite pgTAP qui les produit.
 */

const TEXTES: TextesTransition = {
  introuvable: "INTROUVABLE",
  module: "MODULE",
  role: "ROLE",
  echec: "ECHEC",
};

describe("classerTransition", () => {
  it("une transition écrite ou déjà à l'état demandé passe", () => {
    // Les huit RPC rendent `true` dans les DEUX cas : elles écrivent, ou elles
    // constatent que le statut demandé est déjà celui de la ligne. Distinguer
    // les deux ici inventerait une information que la RPC ne rend pas.
    expect(classerTransition({ data: true, error: null })).toBe("ok");
  });

  it("`false` désigne la ligne absente, pas une panne", () => {
    // `select … for update` sans résultat = `return false`. C'est le seul cas
    // où les RPC rendent false, et il a un message propre côté commerçant.
    expect(classerTransition({ data: false, error: null })).toBe("introuvable");
  });

  it("le refus de droit de module se distingue de tout le reste", () => {
    expect(
      classerTransition({
        data: null,
        error: { message: "module access required: hunts" },
      }),
    ).toBe("module");
  });

  it("le nom du module SQL n'entre pas dans la classification", () => {
    // La garde partagée nomme le module dans son message ; l'appelant sait déjà
    // duquel il parle, et « hunts » n'est pas « Chasse au trésor ». Classer sur
    // le préfixe évite qu'un module ajouté demain retombe dans « échec ».
    for (const nom of ["wheel", "calendar", "quiz", "referral", "events"]) {
      expect(
        classerTransition({
          data: null,
          error: { message: `module access required: ${nom}` },
        }),
        nom,
      ).toBe("module");
    }
  });

  it("le refus de rôle reste un refus de rôle", () => {
    expect(
      classerTransition({ data: null, error: { message: "not authorized" } }),
    ).toBe("role");
  });

  it("tout le reste tombe dans « échec », y compris un statut hors vocabulaire", () => {
    // `invalid status` est déjà fermé par les schémas Zod des huit actions : ce
    // chemin n'a pas de phrase propre parce qu'aucun commerçant ne peut
    // l'atteindre depuis un écran. Lui en inventer une ferait croire à une
    // porte qui n'existe pas.
    expect(
      classerTransition({ data: null, error: { message: "invalid status" } }),
    ).toBe("echec");
    expect(
      classerTransition({ data: null, error: { message: "boom" } }),
    ).toBe("echec");
  });

  it("une réponse sans erreur ET sans booléen n'est pas un succès", () => {
    // Aucune des huit RPC ne produit cela. Le traiter comme « ok » ferait
    // afficher un succès sur une réponse dont personne ne sait rien — c'est le
    // seul endroit où le doute doit se lire comme un échec.
    expect(classerTransition({ data: null, error: null })).toBe("echec");
  });

  it("l'erreur l'emporte sur la donnée", () => {
    // PostgREST peut rendre les deux. Une transition refusée qui porterait un
    // `data` résiduel ne doit pas se lire comme un succès.
    expect(
      classerTransition({
        data: true,
        error: { message: "module access required: quiz" },
      }),
    ).toBe("module");
  });
});

describe("refusTransition", () => {
  it("rend null sur succès, et la phrase du module sinon", () => {
    expect(refusTransition({ data: true, error: null }, TEXTES)).toBeNull();
    expect(refusTransition({ data: false, error: null }, TEXTES)).toBe(
      "INTROUVABLE",
    );
    expect(
      refusTransition(
        { data: null, error: { message: "module access required: loyalty" } },
        TEXTES,
      ),
    ).toBe("MODULE");
    expect(
      refusTransition({ data: null, error: { message: "not authorized" } }, TEXTES),
    ).toBe("ROLE");
    expect(
      refusTransition({ data: null, error: { message: "42501" } }, TEXTES),
    ).toBe("ECHEC");
  });
});
