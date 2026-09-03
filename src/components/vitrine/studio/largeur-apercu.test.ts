import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * L'APERÇU NE PEUT PAS ÊTRE PLUS LARGE QUE LA PAGE PUBLIQUE (VIT-36).
 *
 * La demande « l'aperçu n'est pas assez grand » a une réponse évidente et
 * fausse : monter le `max-w-[480px]` du cadre. Elle est fausse parce que 480
 * n'est pas un choix du studio — c'est la borne de la page publique elle-même.
 * Un cadre plus large rend des blocs que PERSONNE ne verra : le texte se coupe
 * ailleurs, une grille passe de deux à trois colonnes, et le commerçant valide
 * une mise en page qui n'existe pas. C'est le seul défaut qu'un aperçu ne doit
 * jamais avoir, parce qu'il est invisible — tout a l'air de fonctionner.
 *
 * La garde lit les DEUX fichiers plutôt que de recopier 480 ici : recopié, le
 * chiffre survivrait à une modification de la page publique et la garde
 * mentirait sur elle-même. Ce qui est vérifié est une RELATION, pas une valeur.
 *
 * La lisibilité se gagne donc ailleurs — plafond et centrage de la rangée du
 * studio, dans `vitrine-studio.tsx` — et cette garde existe pour que la
 * prochaine demande d'agrandissement reparte du bon côté.
 */

const RACINE = new URL("../../../../", import.meta.url);

function lire(relatif: string): string {
  return readFileSync(new URL(relatif, RACINE), "utf8");
}

/**
 * La ligne UNIQUE qui contient `ancre`. L'unicité est exigée, pas supposée :
 * un `.find` rend la première ligne venue, et cette garde a commencé sa vie en
 * visant le conteneur EXTÉRIEUR de la page publique — celui qui n'a pas de
 * borne. Elle serait passée au vert le jour où une ligne s'insère au-dessus.
 */
function ligneUnique(source: string, ancre: string, quoi: string): string {
  const lignes = source.split("\n").filter((l) => l.includes(ancre));
  if (lignes.length !== 1) {
    throw new Error(`${quoi} : ${lignes.length} ligne(s) pour « ${ancre} »`);
  }
  return lignes[0];
}

/** La largeur `max-w-[NNNpx]` portée par cette ligne. */
function largeurMax(source: string, ancre: string, quoi: string): number {
  const trouve = /max-w-\[(\d+)px\]/.exec(ligneUnique(source, ancre, quoi));
  if (!trouve) throw new Error(`${quoi} : pas de max-w-[…px] sur « ${ancre} »`);
  return Number(trouve[1]);
}

const SOURCE_APERCU = "src/components/vitrine/studio/apercu.tsx";
const ANCRE_CADRE = "font-[family-name:var(--vitrine-texte)]";

describe("studio — la largeur de l'aperçu", () => {
  it("le cadre ne dépasse jamais la borne de la page publique", () => {
    const publique = largeurMax(
      lire("src/app/(player)/v/[slug]/[[...langue]]/page.tsx"),
      "mx-auto flex min-h-dvh",
      "page publique",
    );
    const cadre = largeurMax(lire(SOURCE_APERCU), ANCRE_CADRE, "cadre");

    expect(publique).toBeGreaterThan(0);
    expect(cadre).toBeLessThanOrEqual(publique);
  });

  it("la colonne est au moins aussi large que le cadre qu'elle porte", () => {
    // Sinon le cadre déborde et se fait rogner par le défilement vertical.
    const source = lire(SOURCE_APERCU);
    const cadre = largeurMax(source, ANCRE_CADRE, "cadre");
    const colonne = /lg:w-\[(\d+)px\]/.exec(
      ligneUnique(source, "overflow-y-auto lg:w-[", "colonne"),
    );
    if (!colonne) throw new Error("colonne : pas de lg:w-[…px]");

    expect(Number(colonne[1])).toBeGreaterThanOrEqual(cadre);
  });
});
