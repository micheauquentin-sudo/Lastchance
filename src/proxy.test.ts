import { readFileSync } from "node:fs";
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * LE PROXY N'AVAIT AUCUN TEST, et il décide pourtant de trois choses à chaque
 * requête : le régime CSP, l'ouverture du back-office, et le rafraîchissement
 * de session.
 *
 * Ce fichier en couvre l'arbitrage qui coûte le plus cher en production : les
 * parcours publics doivent obtenir leur nonce SANS payer un aller-retour
 * d'authentification dont le résultat n'est lu par personne.
 */

const createServerClientMock = vi.fn();

vi.mock("@supabase/ssr", () => ({
  createServerClient: (...args: unknown[]) => {
    createServerClientMock(...args);
    return {
      auth: {
        getUser: () => Promise.resolve({ data: { user: null }, error: null }),
      },
    };
  },
}));

const { default: proxy, config } = await import("./proxy");

function requete(chemin: string): NextRequest {
  return new NextRequest(new URL(`https://exemple.test${chemin}`), {
    headers: { host: "exemple.test" },
  });
}

beforeEach(() => {
  createServerClientMock.mockClear();
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://projet.supabase.co";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "cle-anon";
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("proxy — les parcours publics ne paient pas l'authentification", () => {
  // Les sept préfixes de PUBLIC_NONCE_PREFIXES. `/play` et `/pronos` sont déjà
  // hors matcher, ils ne passent jamais ici.
  const PARCOURS_PUBLICS = [
    "/calendar/ABC",
    "/commande/ABC",
    "/event/E2EVNT",
    "/hunt/jeton",
    "/jackpot/ABC",
    "/passeport/programme",
    "/quiz/ABC",
  ];

  it.each(PARCOURS_PUBLICS)(
    "%s : aucun client Supabase n'est instancié",
    async (chemin) => {
      await proxy(requete(chemin));
      expect(createServerClientMock).not.toHaveBeenCalled();
    },
  );

  it.each(PARCOURS_PUBLICS)("%s : le nonce CSP est POSÉ malgré tout", async (chemin) => {
    const reponse = await proxy(requete(chemin));
    const csp = reponse.headers.get("Content-Security-Policy");
    expect(csp).toBeTruthy();

    // C'est tout l'intérêt de ne pas les avoir sorties du matcher : sans nonce,
    // ces pages retomberaient sous `'unsafe-inline'` POUR LES SCRIPTS.
    //
    // L'assertion porte sur `script-src` SEULEMENT : `style-src` conserve
    // légitimement `'unsafe-inline'` (styles en ligne), et une assertion posée
    // sur la politique entière échouerait pour une raison qui n'a rien à voir
    // avec ce qu'on veut garder.
    const scriptSrc = /script-src ([^;]+)/.exec(csp ?? "")?.[1] ?? "";
    expect(scriptSrc).toContain("nonce-");
    expect(scriptSrc).not.toContain("'unsafe-inline'");
  });
});

describe("proxy — là où la session compte, elle est toujours rafraîchie", () => {
  // Le contre-test, sans lequel le précédent ne prouverait rien : si le proxy
  // avait cessé d'authentifier PARTOUT, les assertions ci-dessus passeraient
  // tout autant — et le dashboard serait ouvert à tous.
  it.each(["/dashboard", "/onboarding", "/poster/1", "/login", "/signup"])(
    "%s : le client Supabase est bien instancié",
    async (chemin) => {
      await proxy(requete(chemin));
      expect(createServerClientMock).toHaveBeenCalled();
    },
  );

  it("une page ordinaire garde aussi son rafraîchissement de session", async () => {
    // Un commerçant qui navigue longtemps hors dashboard doit conserver sa
    // session : la portée du raccourci est étroite, et ce test le borne.
    await proxy(requete("/tarifs"));
    expect(createServerClientMock).toHaveBeenCalled();
  });
});

/**
 * MOYEN 2 de la revue L11 — la vitrine publique ne traverse plus le proxy.
 *
 * `/v` n'est pas dans `PUBLIC_NONCE_PREFIXES` : elle était déjà en régime CSP
 * `static`, et son ISR interdirait de toute façon un nonce par requête. Elle
 * payait donc un `auth.getUser()` par requête pour un résultat que personne ne
 * lisait — et sur un cookie de session existant, ce `getUser()` valide le jeton
 * chez Supabase PAR LE RÉSEAU. Le test ci-dessus ne peut pas la couvrir : le
 * matcher est appliqué par Next AVANT la fonction, jamais par elle.
 */
describe("matcher — /v rejoint /play et /pronos hors du proxy", () => {
  const matcher = new RegExp(`^${config.matcher[0]}$`);

  it.each(["/v", "/v/le-comptoir", "/v/le-comptoir/en"])(
    "%s ne traverse pas le proxy",
    (chemin) => {
      expect(matcher.test(chemin)).toBe(false);
    },
  );

  it("CONTRÔLE NÉGATIF : les routes qui ont besoin d'une session la gardent", () => {
    // Sans lui, vider le matcher ferait passer les assertions ci-dessus.
    // `/verify` et `/videos` : la borne de mot du matcher (`v(?:/|$)`) est ce
    // qui les garde dans le proxy — un `v` nu les en aurait sortis en silence,
    // et aucun chemin en `v…` ne le signalait ici (contre-revue L11).
    for (const chemin of [
      "/dashboard",
      "/login",
      "/tarifs",
      "/quiz/ABC",
      "/verify",
      "/videos/promo",
    ]) {
      expect(matcher.test(chemin)).toBe(true);
    }
  });
});

/**
 * LA CONTREPARTIE, et elle est indissociable du changement ci-dessus : le canal
 * CSP Report-Only de `/v` était servi PAR LE PROXY. L'exclure du matcher sans
 * l'inscrire dans `next.config.ts` l'aurait rendue muette — une surface publique
 * sous `'unsafe-inline'` qui ne remonte plus rien, sans que rien ne le signale.
 *
 * Garde de SOURCE, même motif que `wallet-cache-headers.test.ts` :
 * `next.config.ts` n'est pas exécutable depuis Vitest sans monter Next.
 */
describe("next.config — le Report-Only couvre les TROIS surfaces sans nonce", () => {
  it("/play, /pronos et /v y sont toutes les trois", () => {
    const src = readFileSync("next.config.ts", "utf8").replace(/\r\n/g, "\n");
    const i = src.indexOf("...(cspReportOnly");
    expect(i, "bloc Report-Only introuvable").toBeGreaterThan(-1);
    const bloc = src.slice(i, i + 300);

    expect(bloc).toContain('"/play/:path*"');
    expect(bloc).toContain('"/pronos/:path*"');
    expect(bloc).toContain('"/v/:path*"');
  });
});
