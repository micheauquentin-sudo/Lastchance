import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { masquerJetonUrl } from "./masquer-jeton-url";

/**
 * GARDE — LES DEUX LISTES QUI DÉCRIVENT LA MÊME CLASSE DOIVENT SE RESSEMBLER.
 *
 * Une route « porteuse » est une route dont l'URL EST l'autorisation : qui la
 * détient exerce le droit. Le produit en traite la classe à deux endroits qui
 * ne se parlent pas :
 *
 *  1. `src/lib/masquer-jeton-url.ts` — pour que l'URL ne parte pas chez PostHog
 *     ni chez Sentry ;
 *  2. `next.config.ts`, `tokenPathSecurityHeaders` — pour qu'elle ne parte ni
 *     dans un `Referer`, ni dans un cache partagé, ni dans un index.
 *
 * Elles avaient DÉJÀ divergé : `/reserver/invitation/` était reconnu comme
 * porteur par la première et absent de la seconde, et `/ticket/` manquait aux
 * deux. Rien ne rougissait. Ce fichier compare les deux listes l'une à l'autre
 * — c'est le seul moyen qu'un oubli se voie au moment où il est commis.
 *
 * ── Pourquoi une garde de SOURCE ──
 *
 * `next.config.ts` n'est pas exécutable depuis Vitest sans monter Next. On lit
 * donc le fichier, comme le fait déjà `wallet-cache-headers.test.ts` pour
 * `/portefeuille`. Elle prouve la déclaration, pas l'en-tête servi — c'est
 * assumé, et c'est infiniment mieux que rien.
 */

const CONFIG = "next.config.ts";

function source(): string {
  return readFileSync(CONFIG, "utf8").replace(/\r\n/g, "\n");
}

/** Les `source:` déclarés avec `tokenPathSecurityHeaders`, dans l'ordre du fichier. */
function routesDurcies(): string[] {
  const src = source();
  const routes: string[] = [];
  const bloc = /\{\s*(?:\/\/[^\n]*\n\s*)*source: "([^"]+)",\s*headers: (?:\[\s*\.\.\.)?tokenPathSecurityHeaders/g;
  for (const m of src.matchAll(bloc)) routes.push(m[1]);
  return routes;
}

/**
 * Les préfixes de CHEMIN que `masquerJetonUrl` reconnaît comme porteurs.
 * Déduits par comportement et non par lecture du motif : un test qui recopie
 * l'expression régulière ne prouve que sa propre copie.
 */
const PREFIXES_MASQUES = [
  "/commande",
  "/hunt",
  "/invite",
  "/reserver/invitation",
  "/ticket",
] as const;

describe("routes porteuses — masquage analytique", () => {
  it.each(PREFIXES_MASQUES)("%s/<secret> est masqué", (prefixe) => {
    expect(masquerJetonUrl(`${prefixe}/SECRET-EN-CLAIR`)).toBe(
      `${prefixe}/[jeton]`,
    );
  });
});

describe("routes porteuses — en-têtes de next.config.ts", () => {
  it("chaque préfixe masqué a son entrée d'en-têtes", () => {
    // ROUGE SI : une sixième route porteuse est ajoutée au masquage sans
    // recevoir `no-referrer` / `no-store` / `noindex`. C'est exactement la
    // divergence qui a laissé `/reserver/invitation/` à nu.
    const routes = routesDurcies();
    expect(routes.length, "aucun bloc tokenPathSecurityHeaders trouvé").toBeGreaterThan(0);
    for (const prefixe of PREFIXES_MASQUES) {
      expect(routes, `${prefixe} masqué mais sans en-têtes`).toContain(
        `${prefixe}/:path*`,
      );
    }
  });

  it("couvre aussi les deux pages dont le jeton est en QUERY", () => {
    // Elles n'ont pas de préfixe de chemin porteur — le secret est dans
    // `?token=` — mais le `Referer` et le cache emportent la query aussi bien
    // que le chemin. Celui de la désinscription est PERMANENT.
    const routes = routesDurcies();
    expect(routes).toContain("/newsletter/unsubscribe");
    expect(routes).toContain("/pronos/:slug/recover");
  });

  it("le lot d'en-têtes ferme bien les trois fuites", () => {
    const src = source();
    const i = src.indexOf("const tokenPathSecurityHeaders");
    expect(i, "tokenPathSecurityHeaders introuvable").toBeGreaterThan(-1);
    const bloc = src.slice(i, i + 400);
    expect(bloc).toContain("no-referrer");
    expect(bloc).toContain("no-store");
    expect(bloc).toContain("noindex");
  });
});
