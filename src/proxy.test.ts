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

const { default: proxy } = await import("./proxy");

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
