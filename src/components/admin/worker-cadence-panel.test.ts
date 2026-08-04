import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * GARDES DE MARKUP du panneau « Cadence des workers ».
 *
 * Ces gardes lisent la SOURCE du `.tsx`. Depuis le 2026-08-04 le dépôt sait
 * aussi rendre du React en test (`// @vitest-environment happy-dom`) : la
 * lecture de source n'est donc plus une contrainte mais un choix, et il tient
 * ici parce que ces trois propriétés portent sur du markup dont le montage
 * exigerait de simuler l'écran d'administration entier. Elles prouvent la
 * forme, pas le pixel — ce qui reste la bonne mesure pour trois propriétés
 * qu'aucune ne se voit à l'œil sur l'écran d'un développeur.
 *
 *  1. Le geste touche un VOISIN, et il faut l'apprendre AVANT de cliquer. À
 *     l'œil, la phrase précède le clic puisqu'elle est sous le bouton. Au
 *     clavier, non : qui tabule jusqu'au bouton n'entend que son libellé.
 *     `aria-describedby` est donc le seul lien qui fasse tenir la promesse dans
 *     les deux modes de lecture.
 *  2. Le refus rendu par la base s'annonce comme un ÉCHEC. `role="status"` est
 *     une annonce polie, mise en file derrière ce qui parle déjà, alors que le
 *     bouton redevient cliquable au même instant : le refus manqué se termine
 *     par un second clic identique.
 *  3. Rien du Vault ne s'affiche. Le panneau parle de WORKERS ; les noms
 *     d'entrées (`sync_contests_secret`) restent côté serveur, et le retour de
 *     l'action n'est jamais rendu tel quel.
 */

const SOURCE = readFileSync(
  "src/components/admin/worker-cadence-panel.tsx",
  "utf8",
);

/**
 * Le markup SEUL : les commentaires citent volontairement le rôle qu'on refuse
 * (« `role="status"` et non… »), et une garde qui lirait le fichier entier
 * rougirait sur son propre argumentaire.
 */
const MARKUP = SOURCE.replace(/\/\*[\s\S]*?\*\//g, "");

describe("panneau Cadence des workers — markup", () => {
  it("rattache l'avertissement « entrée partagée » au bouton", () => {
    // Le paragraphe porte l'id, le bouton le désigne — et le désigne
    // seulement quand il y a bien un voisin à nommer.
    expect(SOURCE).toMatch(/<p id=\{partageId\}/);
    expect(SOURCE).toMatch(
      /aria-describedby=\{\s*row\.alsoAffects\.length > 0 \? partageId : undefined,?\s*\}/,
    );
  });

  it("annonce le refus comme une alerte, jamais comme un statut poli", () => {
    expect(MARKUP).toMatch(/role="alert"[\s\S]{0,120}state\.error/);
    expect(MARKUP).not.toMatch(/role="status"/);
  });

  it("ne rend ni nom d'entrée du Vault ni le retour brut de l'action", () => {
    // `\w+_secret` : la forme des noms d'entrées du registre. Le texte de
    // l'écran dit « le secret de <worker> », sans souligné — la garde ne le
    // confond donc pas avec un nom d'entrée.
    expect(SOURCE).not.toMatch(/\b[a-z][a-z0-9]*(?:_[a-z0-9]+)*_secret\b/);
    expect(SOURCE).not.toMatch(/JSON\.stringify\(\s*state/);
    expect(SOURCE).not.toMatch(/state\.data/);
  });
});
