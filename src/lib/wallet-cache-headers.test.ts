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

/**
 * LES PAGES DONT L'URL EST LE SECRET — `/commande/<jeton>` et `/hunt/<jeton>`.
 *
 * Ailleurs dans le produit, une URL désigne une ressource et l'autorisation se
 * joue ailleurs. Ici l'URL EST l'autorisation : le jeton est dans le chemin,
 * donc dans tout ce qui recopie une URL — le `Referer` d'un asset tiers, un
 * cache partagé, un index de moteur. `src/lib/masquer-jeton-url.ts` ferme la
 * fuite vers PostHog et Sentry ; ces en-têtes ferment celle du navigateur.
 */
describe("pages à jeton dans le chemin — ni referer, ni cache, ni index", () => {
  const bloc = () => {
    const src = source();
    const i = src.indexOf("const tokenPathSecurityHeaders");
    expect(i, "tokenPathSecurityHeaders introuvable").toBeGreaterThan(-1);
    return src.slice(i, i + 400);
  };

  it.each(["/commande/:path*", "/hunt/:path*", "/invite/:path*"])(
    "%s a bien son entrée d'en-têtes",
    (route) => {
      expect(blocPour(route)).toContain("tokenPathSecurityHeaders");
    },
  );

  it("n'émet aucun referer", () => {
    // Le défaut global (`strict-origin-when-cross-origin`) laisse partir le
    // chemin COMPLET vers la même origine : sur ces pages, ce chemin est le
    // secret. `no-referrer` est la seule valeur qui ne le laisse jamais sortir.
    expect(bloc()).toMatch(/"Referrer-Policy"[\s\S]{0,40}"no-referrer"/);
  });

  it("interdit la mise en cache", () => {
    // Tablette de comptoir, proxy d'entreprise, historique avant-arrière : une
    // page de commande rejouable n'a rien à faire dans un stockage partagé.
    expect(bloc()).toContain("no-store");
  });

  it("n'est pas indexable", () => {
    // Ces URLs circulent par QR et par SMS : un jeton indexé est un jeton public.
    expect(bloc()).toContain("noindex");
  });

  it("CONTRÔLE NÉGATIF : le portefeuille garde son bloc à lui", () => {
    // Trois blocs voisins, trois besoins distincts : `Vary: Cookie` et
    // `private` n'ont de sens que là où la réponse dépend d'un cookie. Les
    // fusionner en un seul « bloc sensible » ferait tomber cette assertion —
    // et c'est voulu : la ressemblance n'est pas l'identité.
    expect(blocPour("/portefeuille")).toContain("walletSecurityHeaders");
  });
});
