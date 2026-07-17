import "server-only";

import { isIP } from "node:net";
import { lookup } from "node:dns/promises";
import { request as httpsRequest } from "node:https";

const BLOCKED_HOST_SUFFIXES = [".local", ".internal", ".localhost", ".home", ".lan"];

function ipv4ToNumber(ip: string): number {
  return ip.split(".").reduce((value, part) => (value << 8) + Number(part), 0) >>> 0;
}

function inIpv4Range(ip: string, base: string, bits: number): boolean {
  const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
  return (ipv4ToNumber(ip) & mask) === (ipv4ToNumber(base) & mask);
}

function ipv6ToBigInt(input: string): bigint | null {
  let value = input.toLowerCase().split("%")[0];
  const ipv4 = value.match(/(\d+\.\d+\.\d+\.\d+)$/)?.[1];
  if (ipv4) {
    if (isIP(ipv4) !== 4) return null;
    const n = ipv4ToNumber(ipv4);
    value = value.slice(0, -ipv4.length) + `${(n >>> 16).toString(16)}:${(n & 0xffff).toString(16)}`;
  }
  const halves = value.split("::");
  if (halves.length > 2) return null;
  const left = halves[0] ? halves[0].split(":") : [];
  const right = halves[1] ? halves[1].split(":") : [];
  const missing = 8 - left.length - right.length;
  if (missing < 0 || (halves.length === 1 && missing !== 0)) return null;
  const parts = [...left, ...Array(missing).fill("0"), ...right];
  if (parts.length !== 8 || parts.some((part) => !/^[0-9a-f]{1,4}$/.test(part))) return null;
  return parts.reduce(
    (total, part) => (total << BigInt(16)) + BigInt(`0x${part}`),
    BigInt(0),
  );
}

function inIpv6Range(ip: bigint, base: bigint, bits: number): boolean {
  const shift = BigInt(128) - BigInt(bits);
  return (ip >> shift) === (base >> shift);
}

/** Refuse loopback, privé, link-local, multicast et adresses réservées. */
export function isPublicIpAddress(address: string): boolean {
  const version = isIP(address);
  if (version === 4) {
    return ![
      ["0.0.0.0", 8], ["10.0.0.0", 8], ["100.64.0.0", 10],
      ["127.0.0.0", 8], ["169.254.0.0", 16], ["172.16.0.0", 12],
      ["192.0.0.0", 24], ["192.0.2.0", 24], ["192.168.0.0", 16],
      ["198.18.0.0", 15], ["198.51.100.0", 24], ["203.0.113.0", 24],
      ["224.0.0.0", 4], ["240.0.0.0", 4],
    ].some(([base, bits]) => inIpv4Range(address, String(base), Number(bits)));
  }
  if (version === 6) {
    const ip = ipv6ToBigInt(address);
    if (ip === null || ip === BigInt(0) || ip === BigInt(1)) return false;
    // Ancien format IPv4-compatible ::/96. Il ne doit pas permettre de
    // contourner les plages IPv4 refusées via une représentation IPv6.
    if ((ip >> BigInt(32)) === BigInt(0)) return false;
    const ranges: Array<[bigint, number]> = [
      [BigInt("0xfc00") << BigInt(112), 7],       // unique local
      [BigInt("0xfe80") << BigInt(112), 10],      // link-local
      [BigInt("0xff00") << BigInt(112), 8],       // multicast
      [BigInt("0x0100") << BigInt(112), 64],      // discard-only 100::/64
      [BigInt("0x20010000") << BigInt(96), 23],   // protocol assignments
      [BigInt("0x20010db8") << BigInt(96), 32],   // documentation
      [BigInt("0x20020000") << BigInt(96), 16],   // 6to4
      [BigInt("0x0064ff9b") << BigInt(96), 96],   // NAT64
      [BigInt("0x0064ff9b00010000") << BigInt(64), 48], // NAT64 local-use
      [BigInt("0x3fff") << BigInt(112), 20],      // documentation
      [BigInt("0x5f00") << BigInt(112), 16],      // segment routing reserved
    ];
    if (ranges.some(([base, bits]) => inIpv6Range(ip, base, bits))) return false;
    // ::ffff:0:0/96 — vérifier l'IPv4 mappée, y compris la notation hex.
    if ((ip >> BigInt(32)) === BigInt("0xffff")) {
      const low = Number(ip & BigInt("0xffffffff"));
      const mapped = [low >>> 24, (low >>> 16) & 255, (low >>> 8) & 255, low & 255].join(".");
      return isPublicIpAddress(mapped);
    }
    return true;
  }
  return false;
}

export function parseWebhookUrl(value: string): URL {
  const url = new URL(value);
  const host = url.hostname.toLowerCase().replace(/\.$/, "");
  if (url.protocol !== "https:") throw new Error("Le webhook doit utiliser HTTPS.");
  if (url.username || url.password) throw new Error("Les identifiants dans l'URL sont interdits.");
  if (url.port && url.port !== "443") throw new Error("Seul le port HTTPS 443 est autorisé.");
  if (
    host === "localhost" ||
    BLOCKED_HOST_SUFFIXES.some((suffix) => host.endsWith(suffix))
  ) throw new Error("Cette destination webhook est interdite.");
  if (isIP(host) && !isPublicIpAddress(host)) {
    throw new Error("Les adresses privées ou réservées sont interdites.");
  }
  return url;
}

/** Résout toutes les IP juste avant l'appel et refuse le mélange public/privé. */
export async function assertSafeWebhookUrl(value: string): Promise<URL> {
  const url = parseWebhookUrl(value);
  const addresses = await lookup(url.hostname, { all: true, verbatim: true });
  if (addresses.length === 0 || addresses.some(({ address }) => !isPublicIpAddress(address))) {
    throw new Error("La destination webhook résout vers une adresse interdite.");
  }
  return url;
}

/**
 * POST HTTPS épinglé sur l'IP qui vient d'être validée. `servername` conserve
 * la vérification TLS du domaine ; le DNS n'est pas résolu une seconde fois,
 * ce qui ferme la fenêtre de DNS rebinding. Les redirections ne sont jamais
 * suivies.
 */
export async function postSafeWebhook(params: {
  url: string;
  body: string;
  headers: Record<string, string>;
  timeoutMs: number;
}): Promise<number> {
  const url = parseWebhookUrl(params.url);
  const addresses = await lookup(url.hostname, { all: true, verbatim: true });
  if (addresses.length === 0 || addresses.some(({ address }) => !isPublicIpAddress(address))) {
    throw new Error("La destination webhook résout vers une adresse interdite.");
  }
  const target = addresses[0];

  return new Promise((resolve, reject) => {
    const request = httpsRequest(
      {
        protocol: "https:",
        hostname: target.address,
        family: target.family,
        port: 443,
        method: "POST",
        path: `${url.pathname}${url.search}`,
        servername: url.hostname,
        rejectUnauthorized: true,
        headers: {
          ...params.headers,
          host: url.host,
          "content-length": Buffer.byteLength(params.body).toString(),
        },
      },
      (response) => {
        response.resume();
        resolve(response.statusCode ?? 500);
      },
    );
    request.setTimeout(params.timeoutMs, () => {
      request.destroy(new Error("Délai webhook dépassé."));
    });
    request.on("error", reject);
    request.end(params.body);
  });
}
