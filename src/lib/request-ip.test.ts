import { afterEach, describe, expect, it } from "vitest";
import {
  ETIQUETTE_IP_NON_MESUREE,
  IP_CLIENT_INCONNUE,
  clientIpFromHeaders,
  pressionParIp,
} from "./request-ip";

function headers(values: Record<string, string>) {
  return { get: (name: string) => values[name] ?? null };
}

describe("clientIpFromHeaders", () => {
  afterEach(() => {
    delete process.env.TRUSTED_PROXY_PROVIDER;
    delete process.env.VERCEL;
  });

  it("préfère l'en-tête Cloudflare vérifié", () => {
    process.env.TRUSTED_PROXY_PROVIDER = "cloudflare";
    expect(clientIpFromHeaders(headers({
      "cf-connecting-ip": "203.0.113.4",
      "x-forwarded-for": "1.2.3.4",
    }))).toBe("203.0.113.4");
  });

  it("utilise le proxy le plus proche dans X-Forwarded-For", () => {
    process.env.TRUSTED_PROXY_PROVIDER = "generic";
    expect(clientIpFromHeaders(headers({
      "x-forwarded-for": "1.2.3.4, 198.51.100.8",
    }))).toBe("198.51.100.8");
  });

  it("ignore les valeurs invalides", () => {
    process.env.TRUSTED_PROXY_PROVIDER = "generic";
    expect(clientIpFromHeaders(headers({ "x-real-ip": "invalide" }))).toBe("unknown");
  });

  it("ignore les en-têtes forgeables sans proxy déclaré", () => {
    expect(clientIpFromHeaders(headers({
      "x-real-ip": "203.0.113.8",
      "x-forwarded-for": "203.0.113.9",
    }))).toBe(IP_CLIENT_INCONNUE);
  });
});

/**
 * CE QUE FERME CE BLOC : hors proxy déclaré, `clientIpFromHeaders` rend
 * `unknown` et les compteurs de pression concaténaient cette valeur telle
 * quelle. TOUS les visiteurs tombaient alors dans une seule ligne `…:unknown`,
 * à un seuil calibré pour UN visiteur — et la supervision ne pouvait distinguer
 * cet agrégat d'une vraie pression mono-IP.
 *
 * Le choix retenu est de COMPTER quand même, sous étiquette : s'abstenir aurait
 * jeté la détection (l'agrégat franchit le seuil sous un débit réel) avec
 * l'attribution. Ce qui est prouvé ici, c'est que les deux séries ne peuvent
 * pas être confondues — ni dans la clé, ni dans le nom de l'événement.
 */
describe("pressionParIp — une mesure aveugle ne se lit pas comme une mesure", () => {
  it("une IP lisible passe telle quelle, sans suffixe d'événement", () => {
    expect(pressionParIp("203.0.113.4", "hunt_step_ip_pressure")).toEqual({
      cle: "203.0.113.4",
      evenement: "hunt_step_ip_pressure",
      mesuree: true,
    });
  });

  it("une IP illisible donne une clé qui ne peut pas se lire comme une adresse", () => {
    // ROUGE SI la clé redevient `unknown` : ce mot ressemble à une valeur de
    // seau ordinaire, `ip-non-mesuree` dit ce qu'il est.
    const p = pressionParIp(IP_CLIENT_INCONNUE, "hunt_step_ip_pressure");
    expect(p.cle).toBe(ETIQUETTE_IP_NON_MESUREE);
    expect(p.cle).not.toBe(IP_CLIENT_INCONNUE);
    expect(p.mesuree).toBe(false);
  });

  it("l'événement est une SÉRIE DISTINCTE, jamais le même nom", () => {
    // C'est la moitié qui compte pour un lecteur de la supervision : deux
    // alertes portant le même nom finissent agrégées, et l'étiquette de clé
    // seule ne survit pas à un tableau de bord qui groupe par événement.
    const aveugle = pressionParIp(IP_CLIENT_INCONNUE, "hunt_recall_ip_pressure");
    const vue = pressionParIp("198.51.100.8", "hunt_recall_ip_pressure");
    expect(aveugle.evenement).not.toBe(vue.evenement);
    expect(aveugle.evenement).toBe("hunt_recall_ip_pressure.ip_non_mesuree");
  });

  it("deux IP distinctes restent deux seaux distincts", () => {
    // TÉMOIN : sans lui, une fonction qui rendrait l'étiquette dans TOUS les
    // cas passerait les trois assertions ci-dessus.
    expect(pressionParIp("203.0.113.4", "e").cle).not.toBe(
      pressionParIp("203.0.113.5", "e").cle,
    );
  });
});
