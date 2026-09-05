// @vitest-environment node
/**
 * Le décor de l'accueil est servi en `Cache-Control: public, max-age=31536000,
 * immutable` (`next.config.ts`, bloc `/panorama/:path*`). Cet en-tête est une
 * promesse forte : pendant un an, le navigateur ne redemandera JAMAIS l'URL, et
 * le visiteur n'a aucun recours si son contenu a changé.
 *
 * La première version de ce décor l'a rompue. Les fichiers s'appelaient
 * `p1080.webp`, `p1920.webp`, `p2560.webp` — des noms qui ne portent que la
 * largeur — et le commentaire de `next.config.ts` affirmait qu'un nom « ne
 * change jamais sans que son contenu change ». C'était l'inverse : régénérer
 * l'illustration réécrit les mêmes noms avec d'autres pixels, et tout visiteur
 * déjà venu serait resté un an sur l'ancien décor.
 *
 * Les noms portent donc désormais le sha256 de leur contenu. Cette garde
 * vérifie que l'invariant tient réellement, plutôt que de le laisser vivre dans
 * un commentaire :
 *
 *   1. chaque palier du manifeste existe sous `public/` ;
 *   2. le hachage inscrit dans son nom est bien celui de son contenu — un nom
 *      non haché, ou un fichier remplacé sous le même nom, échoue ici ;
 *   3. aucun `.webp` de `public/panorama/` n'est absent du manifeste — un
 *      orphelin signale une génération dont le ménage n'a pas été fait.
 *
 * Le manifeste est écrit par `scripts/build-backdrop-panorama.mjs` ; le hachage
 * doit rester calculé exactement comme là-bas (sha256, 8 premiers caractères).
 */
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { PANORAMA_TIERS } from "./backdrop-panorama";

const PUBLIC_DIR = resolve(process.cwd(), "public");
const PANORAMA_DIR = join(PUBLIC_DIR, "panorama");

/** Même algorithme que `nomDuPalier` dans le script de fabrication. */
function empreinte(buffer: Buffer): string {
  return createHash("sha256").update(buffer).digest("hex").slice(0, 8);
}

describe("décor panorama — noms hachés par le contenu", () => {
  it("le manifeste n'est pas vide", () => {
    expect(PANORAMA_TIERS.length).toBeGreaterThan(0);
  });

  it.each(PANORAMA_TIERS.map((tier) => [tier.src, tier.width] as const))(
    "%s existe et son nom porte l'empreinte de son contenu",
    (src, width) => {
      expect(src.startsWith("/panorama/")).toBe(true);

      const fichier = join(PUBLIC_DIR, src.replace(/^\//, ""));
      expect(existsSync(fichier), `${src} est référencé mais absent de public/`).toBe(true);

      const nom = src.slice("/panorama/".length);
      const attendu = new RegExp(`^p${width}\\.([0-9a-f]{8})\\.webp$`).exec(nom);
      expect(
        attendu,
        `${nom} ne suit pas la forme p<largeur>.<sha256:8>.webp — un nom sans empreinte rend le cache immuable dangereux`,
      ).not.toBeNull();

      expect(
        attendu?.[1],
        `${nom} annonce une empreinte qui n'est pas celle de son contenu : le fichier a été remplacé sous le même nom`,
      ).toBe(empreinte(readFileSync(fichier)));
    },
  );

  it("aucun webp orphelin ne traîne dans public/panorama/", () => {
    const references = new Set(
      PANORAMA_TIERS.map((tier) => tier.src.slice("/panorama/".length)),
    );
    const presents = readdirSync(PANORAMA_DIR).filter((nom) => nom.endsWith(".webp"));
    const orphelins = presents.filter((nom) => !references.has(nom));

    expect(
      orphelins,
      "ces images ne sont référencées par aucun palier — vestiges d'une génération précédente",
    ).toEqual([]);
  });
});
