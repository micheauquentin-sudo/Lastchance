import { isIP } from "node:net";

import {
  observeSharedKey,
  rateLimitBucket,
  type RateLimitRule,
} from "@/lib/rate-limit";

interface HeaderReader {
  get(name: string): string | null;
}

function normalizeIp(value: string | null | undefined): string | null {
  if (!value) return null;
  let candidate = value.trim();
  if (candidate.startsWith("[")) candidate = candidate.slice(1, candidate.indexOf("]"));
  else if (candidate.includes(".") && candidate.includes(":")) candidate = candidate.split(":")[0];
  return isIP(candidate) ? candidate : null;
}

/**
 * Valeur rendue quand aucune IP de confiance n'est lisible. Ce n'est PAS une
 * adresse : c'est l'aveu qu'il n'y en a pas.
 */
export const IP_CLIENT_INCONNUE = "unknown";

/** Composante de clé posée à la place d'une IP qu'on n'a pas su lire. */
export const ETIQUETTE_IP_NON_MESUREE = "ip-non-mesuree";

/**
 * Comment une IP entre dans un compteur de PRESSION sur clé partagée — et ce
 * qu'on écrit quand elle est illisible.
 *
 * ── LE DÉFAUT FERMÉ ─────────────────────────────────────────
 *
 * `clientIpFromHeaders` rend `IP_CLIENT_INCONNUE` hors
 * `TRUSTED_PROXY_PROVIDER`/`VERCEL`, et c'est délibéré : les en-têtes
 * génériques sont forgeables. Mais les appelants la concaténaient telle quelle
 * dans leur seau, si bien que TOUS les visiteurs tombaient dans une seule ligne
 * `…:unknown`, à un seuil calibré pour UN visiteur. La supervision ne pouvait
 * alors distinguer ni une vraie pression mono-IP d'un agrégat (le dépassement
 * nommait un seau qui ne désigne personne), ni un zéro sain d'un zéro aveugle.
 *
 * ── POURQUOI ON COMPTE QUAND MÊME, PLUTÔT QUE DE S'ABSTENIR ─
 *
 * Ne rien compter aurait rendu un trou honnête, mais aurait jeté la DÉTECTION
 * avec l'attribution : sous un débit réel, l'agrégat franchit le seuil, et
 * c'est le seul signal qui subsiste là où aucun proxy n'est déclaré. On garde
 * donc la détection, on perd l'attribution — et on le DIT, deux fois : dans la
 * clé (`ip-non-mesuree`, qui ne peut pas se lire comme une adresse) et dans le
 * nom de l'événement (suffixe `.ip_non_mesuree`, donc une série distincte que
 * personne n'agrège par mégarde avec la série attribuée).
 *
 * ── LA COUVERTURE EST DÉSORMAIS TRANSVERSE ──────────────────
 *
 * Cette fonction n'a longtemps servi que les deux compteurs du module chasse ;
 * la vingtaine d'autres concaténaient l'IP brute et retombaient dans le seau
 * agrégé. Ils passent tous par `observerPressionIp` ci-dessous depuis le
 * 2026-08-04 — et c'est ce helper, plutôt qu'une consigne, qui rend la règle
 * transverse : un compteur écrit demain l'obtient en appelant la seule
 * fonction qui existe pour ça.
 */
export function pressionParIp(
  ip: string,
  evenement: string,
): { cle: string; evenement: string; mesuree: boolean } {
  const mesuree = ip !== IP_CLIENT_INCONNUE;
  return {
    cle: mesuree ? ip : ETIQUETTE_IP_NON_MESUREE,
    evenement: mesuree ? evenement : `${evenement}.ip_non_mesuree`,
    mesuree,
  };
}

/** Préfère les en-têtes posés par les plateformes de confiance. */
export function clientIpFromHeaders(headers: HeaderReader): string {
  const provider = process.env.TRUSTED_PROXY_PROVIDER ?? (process.env.VERCEL ? "vercel" : "");
  const trustedHeader =
    provider === "cloudflare"
      ? "cf-connecting-ip"
      : provider === "vercel"
        ? "x-vercel-forwarded-for"
        : null;
  const trustedIp = trustedHeader ? normalizeIp(headers.get(trustedHeader)) : null;
  if (trustedIp) return trustedIp;

  // Les en-têtes génériques sont forgeables si l'origine est accessible
  // directement. Ils ne sont lus que lorsque l'opérateur déclare
  // explicitement un reverse proxy qui les nettoie et les reconstruit.
  if (provider !== "generic") return IP_CLIENT_INCONNUE;
  const realIp = normalizeIp(headers.get("x-real-ip"));
  if (realIp) return realIp;
  const forwarded = headers.get("x-forwarded-for")
    ?.split(",")
    .map((part) => normalizeIp(part))
    .filter((part): part is string => Boolean(part));
  return forwarded?.at(-1) ?? IP_CLIENT_INCONNUE;
}

/**
 * Compte la pression d'une IP sur un seau partagé — **le seul chemin** par
 * lequel une IP doit entrer dans un `observeSharedKey`.
 *
 * ── POURQUOI UN HELPER PLUTÔT QU'UNE CONSIGNE ───────────────
 *
 * Le motif est six lignes, répétées vingt-six fois : construire la clé,
 * dériver l'étiquette, suffixer l'événement, propager `ip_mesuree` dans les
 * métadonnées. Réparties dans douze fichiers, ces six lignes se sont
 * désynchronisées — la moitié des sites ne dérivait rien du tout, et le
 * docstring de `pressionParIp` a dû porter l'aveu pendant deux chantiers.
 * Un helper unique n'est pas plus court, il est **impossible à oublier à
 * moitié** : on ne peut pas l'appeler en sautant le suffixe d'événement.
 *
 * ── CE QUI NE CHANGE PAS, ET C'EST VOULU ────────────────────
 *
 * Quand l'IP est mesurée, `pression.cle` VAUT l'IP : la clé de seau produite
 * est identique à celle d'avant migration, au caractère près. La migration
 * est donc invisible en supervision pour tout le trafic passant par un proxy
 * déclaré — seul le trafic auparavant versé dans `…:unknown` change de série,
 * ce qui est exactement l'objet du correctif.
 *
 * @param parts Composantes de la clé AVANT l'IP (préfixe, identifiant…).
 */
export async function observerPressionIp(
  parts: Array<string | number>,
  ip: string,
  rule: RateLimitRule,
  evenement: string,
  extra: Record<string, unknown> = {},
): Promise<void> {
  const pression = pressionParIp(ip, evenement);
  await observeSharedKey(
    rateLimitBucket(...parts, pression.cle),
    rule,
    pression.evenement,
    { ...extra, ip_mesuree: pression.mesuree },
  );
}
