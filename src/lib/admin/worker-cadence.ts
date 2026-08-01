/**
 * Cadence rapide d'un worker — les GARDES, isolées de tout accès réseau.
 *
 * ── Le problème que ce module sert à fermer ──
 *
 * `/api/cron/jobs` ne tourne qu'une fois par jour en production : `vercel.json`
 * le planifie à `20 4 * * *` et le plan Hobby n'accepte pas mieux. La sortie
 * existe déjà en base — `20260722100000_jobs_queue.sql` programme un pg_cron
 * `lastchance-jobs-worker` toutes les 5 minutes — mais ce job porte sa propre
 * garde : il ne fait rien tant que les DEUX secrets Vault n'existent pas.
 * Écrire ces deux secrets est le seul geste manquant.
 *
 * ── Pourquoi l'URL est la garde qui compte, et pas la plus évidente ──
 *
 * `APP_URL` vaut `http://localhost:3000` par défaut (`src/lib/env.ts`). Poser
 * cette valeur dans le Vault ferait appeler `localhost` par Postgres toutes les
 * 5 minutes, indéfiniment, SANS ERREUR VISIBLE : `net.http_get` échoue en
 * arrière-plan, le pg_cron reste « planifié », et le drapeau `configured` de
 * `ops_workers_health()` — qui ne teste que l'EXISTENCE des secrets, jamais leur
 * contenu — passerait au vert. Le job cesserait d'être inerte tout en ne faisant
 * rien : la supervision le croirait configuré, ce qui est strictement pire que
 * l'état d'aujourd'hui, où son inertie est au moins lisible.
 *
 * D'où le refus de tout ce qui n'est pas joignable depuis l'extérieur : `https`
 * exigé (le secret d'autorisation part dans un en-tête `Bearer` — en clair sur
 * `http`), et hôte ni de boucle locale ni d'un réseau privé.
 *
 * Module PUR : aucune I/O, aucun secret. C'est ce qui permet de le tester
 * exhaustivement, et notamment de faire rougir le refus de `localhost` — la
 * garde la plus facile à supprimer par inadvertance « parce que ça marche en
 * local ».
 */

import { cronRoutePath, type WorkerName } from "@/lib/worker-health";

/** Motif de refus, stable et journalisable (jamais de valeur dedans). */
export type CadenceUrlRefusal =
  | "url_illisible"
  | "url_non_https"
  | "url_non_publique";

export type WorkerCronUrl =
  | { ok: true; url: string }
  | { ok: false; refusal: CadenceUrlRefusal; error: string };

/**
 * Hôtes qui désignent la machine elle-même. `[::1]` n'y figure pas : `URL`
 * rend le `hostname` IPv6 sans crochets, on normalise avant de comparer.
 */
const HOTES_LOCAUX = new Set(["localhost", "::1", "::", "0.0.0.0"]);

/**
 * Plages non routables sur l'Internet public. Postgres tourne chez Supabase :
 * un `10.x` ou un `192.168.x` y désigne le réseau du fournisseur, pas le nôtre —
 * au mieux une erreur silencieuse, au pire une requête chez un voisin.
 */
const PLAGES_PRIVEES = [
  /^127\./, // boucle locale IPv4 (127.0.0.0/8, pas seulement 127.0.0.1)
  /^10\./,
  /^192\.168\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^169\.254\./, // lien-local / métadonnées d'instance
  /^f[cd][0-9a-f]{2}:/, // IPv6 unique-local (fc00::/7)
  /^fe80:/, // IPv6 lien-local
];

function estHotePublic(hostname: string): boolean {
  const hote = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (HOTES_LOCAUX.has(hote)) return false;
  if (hote === "localhost.localdomain") return false;
  // `.local` (mDNS) et `.localhost` ne sortent jamais du réseau de la machine.
  if (hote.endsWith(".local") || hote.endsWith(".localhost")) return false;
  return !PLAGES_PRIVEES.some((plage) => plage.test(hote));
}

/**
 * URL que Postgres appellera pour ce worker, ou le motif du refus.
 *
 * Seule l'ORIGINE de `appUrl` est retenue : un chemin, une requête ou un
 * fragment traînant dans `NEXT_PUBLIC_APP_URL` produirait sinon une URL de cron
 * fantaisiste, écrite une fois dans le Vault et jamais relue par personne.
 */
export function buildWorkerCronUrl(
  worker: WorkerName,
  appUrl: string,
): WorkerCronUrl {
  let parsed: URL;
  try {
    parsed = new URL(appUrl);
  } catch {
    return {
      ok: false,
      refusal: "url_illisible",
      error: "L'URL publique de l'application est illisible (NEXT_PUBLIC_APP_URL).",
    };
  }

  if (parsed.protocol !== "https:") {
    return {
      ok: false,
      refusal: "url_non_https",
      error:
        "Cadence refusée : l'URL publique doit être en https — le secret du cron voyage dans un en-tête Authorization.",
    };
  }

  if (!estHotePublic(parsed.hostname)) {
    return {
      ok: false,
      refusal: "url_non_publique",
      error:
        "Cadence refusée : l'URL publique désigne une adresse locale ou privée, que Postgres ne peut pas joindre. Le worker paraîtrait configuré sans jamais tourner.",
    };
  }

  return { ok: true, url: `${parsed.origin}${cronRoutePath(worker)}` };
}
