import { describe, expect, it } from "vitest";
import { cleOrdre, ordreAffiche, type OrdreLocal } from "@/lib/ordre-optimiste";

const items = (...ids: string[]) => ids.map((id) => ({ id }));

describe("ordreAffiche — l'écrasement local et sa péremption", () => {
  it("sans écrasement, rend l'ordre serveur", () => {
    expect(ordreAffiche(items("a", "b", "c"), null).map((i) => i.id)).toEqual([
      "a",
      "b",
      "c",
    ]);
  });

  it("applique l'écrasement tant que le serveur n'a pas bougé", () => {
    const local: OrdreLocal = { depuis: "a,b,c", vers: ["b", "a", "c"] };
    expect(ordreAffiche(items("a", "b", "c"), local).map((i) => i.id)).toEqual([
      "b",
      "a",
      "c",
    ]);
  });

  it("cesse de s'appliquer dès que le serveur a rattrapé", () => {
    // Le rafraîchissement a fini par arriver : le serveur porte désormais
    // l'ordre demandé. L'écrasement doit s'effacer TOUT SEUL — c'est ce qui
    // évite d'avoir à le nettoyer dans un effet.
    const local: OrdreLocal = { depuis: "a,b,c", vers: ["b", "a", "c"] };
    expect(ordreAffiche(items("b", "a", "c"), local).map((i) => i.id)).toEqual([
      "b",
      "a",
      "c",
    ]);
  });

  it("cesse aussi de s'appliquer si le serveur part ailleurs", () => {
    // Un autre onglet, un collègue : le serveur porte un ordre qui n'est ni
    // l'ancien ni celui qu'on a demandé. La vérité serveur l'emporte.
    const local: OrdreLocal = { depuis: "a,b,c", vers: ["b", "a", "c"] };
    expect(ordreAffiche(items("c", "b", "a"), local).map((i) => i.id)).toEqual([
      "c",
      "b",
      "a",
    ]);
  });

  it("N'ESCAMOTE JAMAIS une ligne", () => {
    // Garde de sûreté. Un `vers` qui ne recouvre pas la liste serveur ne
    // devrait pas exister — un ajout ou une suppression change la clé, donc
    // fait déjà périmer l'écrasement. Mais sans cette garde, une ligne
    // disparaîtrait de l'écran : escamoter une étape de chasse ou une question
    // de quiz est un défaut, là où afficher un ordre discutable n'est qu'un
    // désagrément.
    const tronque: OrdreLocal = { depuis: "a,b,c", vers: ["b", "a"] };
    expect(ordreAffiche(items("a", "b", "c"), tronque).map((i) => i.id)).toEqual(
      ["a", "b", "c"],
    );
    const inconnu: OrdreLocal = { depuis: "a,b,c", vers: ["b", "a", "zzz"] };
    expect(ordreAffiche(items("a", "b", "c"), inconnu).map((i) => i.id)).toEqual(
      ["a", "b", "c"],
    );
  });

  it("ne modifie pas le tableau reçu", () => {
    const serveur = items("a", "b", "c");
    ordreAffiche(serveur, { depuis: "a,b,c", vers: ["c", "b", "a"] });
    expect(serveur.map((i) => i.id)).toEqual(["a", "b", "c"]);
  });
});

describe("le compoundage — ce que le défaut produisait vraiment", () => {
  it("deux clics d'affilée sans rafraîchissement donnent l'ordre ATTENDU", () => {
    // LE TEST QUI COMPTE. Reproduction du défaut : le serveur ne bouge pas
    // (rafraîchissement raté), et le commerçant clique deux fois.
    const serveur = items("a", "b", "c", "d");
    const cle = cleOrdre(serveur); // "a,b,c,d" — figé, le serveur ne répond plus

    // 1er clic : on descend « a » d'un cran → b,a,c,d
    let affiche = ordreAffiche(serveur, null);
    let ids = affiche.map((i) => i.id);
    [ids[0], ids[1]] = [ids[1], ids[0]];
    let local: OrdreLocal = { depuis: cle, vers: ids };
    expect(ids).toEqual(["b", "a", "c", "d"]);

    // 2e clic : on descend « a » ENCORE d'un cran. Il est en position 1.
    affiche = ordreAffiche(serveur, local);
    ids = affiche.map((i) => i.id);
    [ids[1], ids[2]] = [ids[2], ids[1]];
    local = { depuis: cle, vers: ids };

    // Attendu : b,c,a,d. SANS l'écrasement local, le second clic serait reparti
    // de l'ordre serveur périmé a,b,c,d et aurait produit a,c,b,d — un ordre
    // que personne n'a demandé, écrit en base sans aucun signal.
    expect(ids).toEqual(["b", "c", "a", "d"]);

    const sansEcrasement = serveur.map((i) => i.id);
    [sansEcrasement[1], sansEcrasement[2]] = [
      sansEcrasement[2],
      sansEcrasement[1],
    ];
    expect(sansEcrasement).toEqual(["a", "c", "b", "d"]);
    expect(sansEcrasement).not.toEqual(ids);
  });
});
