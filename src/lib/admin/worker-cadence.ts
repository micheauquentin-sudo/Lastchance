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

/* ════════════════════════════════════════════════════════════
 * CE QUE L'ÉCRAN DOIT DIRE — la cadence réellement obtenue.
 *
 * Un administrateur qui lit « non configuré » sans savoir ce que ça lui coûte
 * ne cliquera jamais. Le panneau ne montre donc pas un drapeau technique mais
 * la CADENCE RÉELLE d'aujourd'hui et sa conséquence pour un client — un code
 * de retrait envoyé par SMS peut arriver jusqu'à 24 h après le gain.
 *
 * Ces lignes sont PILOTÉES PAR LE REGISTRE (`ops_worker_definitions`) et non
 * par une liste en dur : le jour où un worker fréquent s'ajoute, il apparaît
 * sans qu'on touche à l'écran. La période rapide vient elle aussi du registre
 * (`expected_period_seconds` : 300 s pour `jobs`, 600 s pour `sync-contests`),
 * pas d'un « 5 minutes » recopié.
 *
 * Module PUR, comme les gardes ci-dessus : ce dépôt n'a pas d'environnement de
 * rendu React, donc tout ce qui se teste doit vivre hors du composant.
 * ════════════════════════════════════════════════════════════ */

/** Ligne du registre, réduite à ce que l'écran a besoin de savoir. */
export interface WorkerCadenceDefinition {
  worker: string;
  expectedPeriodSeconds: number;
  vaultUrlSecret: string | null;
  vaultSharedSecret: string | null;
}

/**
 * `rapide` = pg_cron toutes les N minutes ; `quotidienne` = le seul cron
 * Vercel ; `inconnue` = le worker n'est pas supervisé, donc `ops_workers_health()`
 * ne rend aucune ligne pour lui et personne ne peut affirmer l'un ou l'autre.
 * Trois états et non deux : afficher « quotidienne » faute de mesure ferait
 * dire à l'écran quelque chose qu'il ne sait pas.
 */
export type WorkerCadenceState = "rapide" | "quotidienne" | "inconnue";

export interface WorkerCadenceRow {
  worker: string;
  state: WorkerCadenceState;
  /** Cadence obtenue aujourd'hui, en clair. Jamais l'URL, jamais le secret. */
  cadence: string;
  /** Ce que cet état coûte — ou rapporte — au client final. */
  consequence: string;
  /** Le bouton d'activation a-t-il un sens sur cette ligne ? */
  actionable: boolean;
}

/** « 5 minutes », « 10 minutes », « 2 heures » — jamais « 300 s ». */
export function formatPeriod(seconds: number): string {
  const minutes = Math.max(1, Math.round(seconds / 60));
  if (minutes < 60) return `${minutes} minute${minutes > 1 ? "s" : ""}`;
  const hours = Math.round(minutes / 60);
  return `${hours} heure${hours > 1 ? "s" : ""}`;
}

/**
 * Conséquence produit, par worker, avec un repli GÉNÉRIQUE et vrai.
 *
 * Le repli est ce qui permet à un worker ajouté demain d'apparaître avec une
 * phrase juste au lieu d'une case vide : le registre pilote les lignes, cette
 * table n'affine que le vocabulaire.
 */
const SLOW_CONSEQUENCE: Record<string, string> = {
  jobs: "Un code de retrait envoyé par SMS ou par e-mail peut arriver jusqu'à 24 h après le gain.",
  "sync-contests":
    "Un résultat sportif — donc le classement et les lots d'un championnat — peut attendre jusqu'à 24 h.",
};

const FAST_CONSEQUENCE: Record<string, string> = {
  jobs: "Un code de retrait part dans les minutes qui suivent le gain.",
  "sync-contests":
    "Les résultats sportifs et le classement suivent le match de près.",
};

/**
 * Les lignes du panneau « Cadence des workers ».
 *
 * @param definitions registre complet ; seules les lignes portant un
 *   `vaultUrlSecret` ont une cadence rapide possible — les autres sont des
 *   crons quotidiens sans prérequis Vault et n'ont rien à faire ici.
 * @param configuredByWorker drapeau `configured` d'`ops_workers_health()`,
 *   LECTURE EXISTANTE réutilisée telle quelle : ce module ne rouvre pas le
 *   Vault, et n'en connaît ni les URL ni les valeurs.
 */
export function buildWorkerCadenceRows(
  definitions: readonly WorkerCadenceDefinition[],
  configuredByWorker: ReadonlyMap<string, boolean>,
): WorkerCadenceRow[] {
  return definitions
    .filter((definition) => definition.vaultUrlSecret !== null)
    .slice()
    .sort((a, b) => a.worker.localeCompare(b.worker, "fr"))
    .map((definition) => {
      const configured = configuredByWorker.get(definition.worker) ?? null;
      const period = formatPeriod(definition.expectedPeriodSeconds);
      const slow =
        SLOW_CONSEQUENCE[definition.worker]
        ?? "Le travail de ce worker peut attendre jusqu'à 24 h.";
      const fast =
        FAST_CONSEQUENCE[definition.worker]
        ?? `Le travail de ce worker repart toutes les ${period}.`;

      /* Le registre doit porter les DEUX noms de secrets : le pg_cron exige
       * `count(*) … = 2`. Une ligne à moitié renseignée n'est pas activable, et
       * le dire vaut mieux qu'un bouton qui échouerait au clic. */
      const complete =
        definition.vaultUrlSecret !== null && definition.vaultSharedSecret !== null;

      if (configured === true) {
        return {
          worker: definition.worker,
          state: "rapide" as const,
          cadence: `toutes les ${period}, par pg_cron`,
          consequence: fast,
          actionable: false,
        };
      }

      if (configured === false) {
        return {
          worker: definition.worker,
          state: "quotidienne" as const,
          cadence: "une fois par jour seulement, par le cron Vercel",
          consequence: slow,
          actionable: complete,
        };
      }

      return {
        worker: definition.worker,
        state: "inconnue" as const,
        cadence: "inconnue — ce worker n'est pas supervisé",
        consequence:
          "Sans supervision, rien ne dit si ce worker tourne toutes les "
          + `${period} ou une fois par jour.`,
        actionable: complete,
      };
    });
}
