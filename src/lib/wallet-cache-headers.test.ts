import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * GARDE — `/portefeuille` ne doit JAMAIS être mis en cache.
 *
 * C'est la seule page du produit qui liste des **droits au porteur** — des
 * codes encaissables en caisse — **sans authentification**, et dont le corps
 * dépend entièrement d'un cookie.
 *
 * Le pire cas est concret, et c'est lui que cette garde ferme : un
 * intermédiaire qui applique une heuristique de cache sur une réponse sans
 * directive explicite — proxy d'entreprise, cache partagé sur la tablette
 * d'un comptoir, un CDN ajouté demain devant l'application — sert le
 * portefeuille du visiteur précédent au suivant. Le second se présente alors
 * en caisse avec les gains du premier.
 *
 * ── Pourquoi une garde de SOURCE ──
 *
 * `next.config.ts` n'est pas exécutable depuis Vitest sans monter Next.
 * On lit donc le fichier, comme le fait déjà `destructive-confirm-coverage`
 * pour les conditions JSX. Elle prouve la déclaration, pas l'en-tête servi —
 * c'est assumé, et c'est mieux que rien : sans elle, la seule chose qui
 * protégeait cette page était un comportement implicite de Next que rien ici
 * n'affirmait ni ne mesurait.
 *
 * Le dépôt a déjà pris cette décision une fois, pour `/admin`, dont le motif
 * écrit — « pages sensibles hors caches partagés / historique avant-arrière »
 * — décrit `/portefeuille` encore mieux : `/admin` est derrière une
 * authentification.
 */

const CONFIG = "next.config.ts";

function source(): string {
  return readFileSync(CONFIG, "utf8").replace(/\r\n/g, "\n");
}

/** Le bloc d'en-têtes déclaré pour une route donnée, du `source:` au `},`. */
function blocPour(route: string): string {
  const src = source();
  const i = src.indexOf(`source: "${route}"`);
  expect(i, `aucune entrée d'en-têtes pour ${route}`).toBeGreaterThan(-1);
  return src.slice(i, i + 400);
}

describe("/portefeuille — jamais de cache", () => {
  it("la route a bien sa propre entrée d'en-têtes", () => {
    // ROUGE SI : quelqu'un retire l'entrée en pensant que le défaut de Next
    // suffit. C'est peut-être vrai aujourd'hui ; ce n'est pas une garantie.
    expect(blocPour("/portefeuille")).toContain("walletSecurityHeaders");
  });

  it("interdit l'écriture ET les caches partagés", () => {
    const src = source();
    const i = src.indexOf("const walletSecurityHeaders");
    expect(i, "walletSecurityHeaders introuvable").toBeGreaterThan(-1);
    const bloc = src.slice(i, i + 600);

    // `no-store` seul interdit d'écrire, mais `private` dit en plus qu'un
    // cache PARTAGÉ n'a rien à y faire — c'est celui-là qui sert la réponse
    // d'un visiteur à un autre.
    expect(bloc).toContain("no-store");
    expect(bloc).toContain("private");
  });

  it("déclare que la réponse dépend du cookie", () => {
    const src = source();
    const i = src.indexOf("const walletSecurityHeaders");
    const bloc = src.slice(i, i + 600);

    // Sans `Vary: Cookie`, un cache qui ignorerait `no-store` n'aurait AUCUN
    // moyen de savoir que deux visiteurs doivent recevoir deux réponses.
    // C'est la seconde ligne de défense, et elle coûte un en-tête.
    expect(bloc).toMatch(/"Vary"[\s\S]{0,40}"Cookie"/);
  });

  it("n'est pas indexable", () => {
    const src = source();
    const i = src.indexOf("const walletSecurityHeaders");
    const bloc = src.slice(i, i + 600);

    // Une page de codes de retrait n'a rien à faire dans un index.
    expect(bloc).toContain("noindex");
  });

  it("CONTRÔLE NÉGATIF : le back-office garde ses propres en-têtes", () => {
    // Si quelqu'un « factorisait » les deux blocs en un seul, cette assertion
    // tomberait — et elle doit tomber : `/admin` et `/portefeuille` ont des
    // besoins voisins mais pas identiques (`Vary: Cookie` n'a aucun sens
    // derrière une authentification, `private` n'y suffirait pas).
    expect(blocPour("/admin/:path*")).toContain("adminSecurityHeaders");
  });
});
